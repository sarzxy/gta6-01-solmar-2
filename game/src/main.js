// main.js — SOLMAR's game loop and state machine. createGameState builds
// a whole city of systems; stepGame advances it one tick (title, play,
// dialogue, pause, busted, wasted); the browser boot at the bottom wires
// it to a canvas, the keyboard and requestAnimationFrame. The smoke test
// drives createGameState + stepGame headlessly with a scripted input.

import { mulberry32, clamp, dist } from './util.js';
import { createWorld } from './world.js';
import { spawnParkedCars, spawnTraffic, updateTraffic } from './vehicles.js';
import { createPlayer, updatePlayer, respawnAtHospital, nearestCar } from './player.js';
import { spawnPeds, updatePeds, knockDown } from './peds.js';
import { createWanted, consumeCrimeEvents, updatePolice, refreshStars } from './police.js';
import {
  createMissionState, updateMissions, advanceDialogue, tryStartFare,
} from './missions.js';
import { createInput, attachInput, clearEdges } from './input.js';
import { ensureAudio, updateAudio, pickupSound, cashSound, dialogueSound, sirenSting } from './audio.js';
import { saveGame, loadSave, applySave } from './save.js';
import { drawScene } from './render.js';
import { drawHUD, drawTitle, drawPause, drawEndOverlay } from './hud.js';

const DAY_LENGTH = 260; // seconds of play per full day
const BUSTED_FINE = 200;
const WASTED_FINE = 350;

/** A complete, fresh SOLMAR: world, people, cars, story, the lot. */
export function createGameState(seed = 20261121) {
  const world = createWorld(seed);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const spawn = world.landmarks.spawn;
  const state = {
    world, rng,
    time: 0, dayT: 0.30,
    mode: 'title',
    player: createPlayer(spawn.x, spawn.y),
    cars: [], peds: [], cops: [],
    wanted: createWanted(),
    cash: 250, shellsFound: 0, storyDone: false,
    mission: createMissionState(),
    dialogue: null, objective: null, fare: null,
    events: [], shots: [], alarm: null, toast: null,
    camera: { x: spawn.x, y: spawn.y },
    pendingEnd: null, endInfo: null, endT: 0,
    hasSave: !!loadSave(),
  };
  state.cars = [...spawnParkedCars(world, rng), ...spawnTraffic(world, rng, 14)];
  state.peds = spawnPeds(world, rng, 26);
  return state;
}

/** Continue a saved week: same city, the story where it was left. */
export function continueGameState(seed = 20261121) {
  const state = createGameState(seed);
  const data = loadSave();
  if (data) {
    applySave(state, data);
    state.mode = 'play';
  }
  return state;
}

/** Advance the whole game by dt seconds under the given input. */
export function stepGame(state, input, dt) {
  state.time += dt;
  if (state.toast) {
    state.toast.t += dt;
    if (state.toast.t >= state.toast.life) state.toast = null;
  }
  for (let i = state.shots.length - 1; i >= 0; i--) {
    state.shots[i].life -= dt;
    if (state.shots[i].life <= 0) state.shots.splice(i, 1);
  }

  switch (state.mode) {
    case 'title': {
      // A slow drift over the city behind the title.
      state.camera.x = 1950 + Math.cos(state.time * 0.06) * 950;
      state.camera.y = 1780 + Math.sin(state.time * 0.045) * 720;
      if (input.confirmPressed) { state.mode = 'play'; }
      else if (input.interactPressed && state.hasSave) {
        const fresh = continueGameState(state.world.seed);
        Object.assign(state, fresh);
      }
      break;
    }
    case 'pause': {
      if (input.pausePressed || input.confirmPressed) state.mode = 'play';
      else if (input.interactPressed) {
        saveGame(state);
        state.hasSave = true;
        state.toast = { text: 'Game saved', t: 0, life: 2.2 };
        state.mode = 'play';
      }
      break;
    }
    case 'busted':
    case 'wasted': {
      state.endT -= dt;
      if (state.endT <= 0) {
        respawnAtHospital(state, state.endInfo.fine);
        state.pendingEnd = null;
        state.mode = 'play';
        saveGame(state);
        state.toast = { text: 'Back on your feet — the city kept the change', t: 0, life: 3.4 };
      }
      break;
    }
    case 'play': {
      stepPlay(state, input, dt);
      break;
    }
  }

  updateAudio(state, dt);
  clearEdges(input);
  state.events.length = 0;
}

function stepPlay(state, input, dt) {
  if (input.pausePressed) { state.mode = 'pause'; return; }
  state.dayT = (state.dayT + dt / DAY_LENGTH) % 1;

  const hadDialogue = !!state.dialogue;
  if (state.dialogue) {
    if (input.confirmPressed || input.interactPressed) {
      advanceDialogue(state);
      dialogueSound();
    }
    updateCamera(state, dt);
    return;
  }
  if (hadDialogue) return;

  const prevStars = state.wanted.stars;
  const prevMission = state.mission.idx;

  // A fare pickup takes the interact key before car entry can.
  if (input.interactPressed && !state.player.inCar && !state.fare) {
    let fareDist = Infinity;
    for (const ped of state.peds) {
      if (ped.wantsFare && ped.mode === 'hail') fareDist = Math.min(fareDist, dist(state.player.x, state.player.y, ped.x, ped.y));
    }
    const car = nearestCar(state);
    const carDist = car ? dist(state.player.x, state.player.y, car.x, car.y) : Infinity;
    if (fareDist < 64 && fareDist <= carDist && tryStartFare(state)) input.interactPressed = false;
  }

  updatePlayer(state.world, state, input, dt);
  updateTraffic(state.world, state, dt);
  updatePeds(state.world, state, dt);
  carPedCollisions(state);
  updateMissions(state.world, state, dt);
  consumeCrimeEvents(state);
  updatePolice(state.world, state, dt);
  refreshStars(state);

  for (const ev of state.events) {
    if (ev.type === 'pickup') pickupSound();
    if (ev.type === 'cash') cashSound();
  }
  if (state.wanted.stars > prevStars) sirenSting();
  if (state.mission.idx !== prevMission) saveGame(state);
  if (state.dialogue && !hadDialogue) dialogueSound();

  if (state.pendingEnd) {
    const kind = state.pendingEnd;
    state.endInfo = { kind, fine: kind === 'busted' ? BUSTED_FINE : WASTED_FINE };
    state.endT = 2.4;
    state.mode = kind;
    state.pendingEnd = null;
  }
  updateCamera(state, dt);
}

/** Cars meet pedestrians: fast metal wins, and everyone remembers. */
function carPedCollisions(state) {
  const drivers = [...state.cars];
  for (const cop of state.cops) if (cop.type === 'car') drivers.push(cop.car);
  for (const car of drivers) {
    if (Math.abs(car.speed) < 55) continue;
    for (const ped of state.peds) {
      if (ped.mode === 'down') continue;
      if (dist(car.x, car.y, ped.x, ped.y) < 30) {
        knockDown(state, ped, car === state.player.inCar);
      }
    }
  }
}

function updateCamera(state, dt) {
  const p = state.player;
  const tx = clamp(p.x, 590, state.world.w - 590);
  const ty = clamp(p.y, 400, state.world.h - 400);
  const k = 1 - Math.pow(0.0015, dt);
  state.camera.x += (tx - state.camera.x) * k;
  state.camera.y += (ty - state.camera.y) * k;
}

// ---------------------------------------------------------- browser boot

if (typeof document !== 'undefined') {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const state = createGameState();
  const input = attachInput(createInput());

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  };
  window.addEventListener('resize', resize);
  resize();

  const unlock = () => { ensureAudio(); };
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('pointerdown', unlock, { once: true });

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    stepGame(state, input, dt);
    drawScene(ctx, state, canvas.width, canvas.height);
    if (state.mode === 'title') drawTitle(ctx, state, canvas.width, canvas.height, state.hasSave);
    else if (state.mode === 'pause') { drawHUD(ctx, state, canvas.width, canvas.height); drawPause(ctx, state, canvas.width, canvas.height); }
    else if (state.mode === 'busted' || state.mode === 'wasted') { drawHUD(ctx, state, canvas.width, canvas.height); drawEndOverlay(ctx, state, canvas.width, canvas.height); }
    else drawHUD(ctx, state, canvas.width, canvas.height);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
