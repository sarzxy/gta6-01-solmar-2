// missions.js — SOLMAR's story and its side work. A five-mission chain
// follows Marlo Reyes through his first week back: Homecoming, First
// Wheels, Night Run, Heat Wave and the Solmar Send-off. Between missions
// the city feeds him taxi fares and hides twenty shells on its beach.
//
// A mission is data: a title, a reward and steps. A step is one of
//   talk     walk up to someone and hear them out (dialogue lines)
//   goto     reach a place, on foot or by car
//   fetchCar get into one tagged car
//   deliver  reach a place, in a tagged car when the step names one
// Steps may carry a timeLimit in seconds; running out restarts the step.

import { dist, rand } from './util.js';
import { createCar } from './vehicles.js';

export const MISSIONS = [
  {
    id: 'homecoming', title: 'Homecoming', reward: 150,
    steps: [
      { kind: 'talk', at: 'rosa', who: 'Rosa', lines: [
        ['Rosa', 'Marlo? Marlo Reyes, on my porch. Six years, and you still knock like the rent is due.'],
        ['Marlo', 'Nobody knocks in Solmar, Aunt Rosa. The door was open. The whole street is open.'],
        ['Rosa', 'The city missed you, mijo. I missed you. Now — my sedan. Take her to the Marina Café.'],
        ['Rosa', 'Your cousin Dex waits there with my groceries and, knowing Dex, a story.'],
        ['Marlo', 'First day back and I am already running errands. Some things never change.'],
      ] },
      { kind: 'fetchCar', car: 'rosa', label: "Get into Rosa's sedan" },
      { kind: 'deliver', car: 'rosa', at: 'cafe', r: 90, label: 'Drive the sedan to the Marina Café' },
      { kind: 'talk', at: 'cafe', who: 'Dex', lines: [
        ['Dex', 'Marlo Reyes! Look at you. Solmar kept your parking spot warm, cousin.'],
        ['Marlo', 'Dex. Rosa said groceries. That crate smells like boat fuel and trouble.'],
        ['Dex', 'Groceries, trouble — in this family it is the same shopping list. Listen.'],
        ['Dex', 'There is a gold coupe sitting on the airfield apron, and it is sitting wrong. Tomorrow, we fix that.'],
      ] },
    ],
  },
  {
    id: 'firstwheels', title: 'First Wheels', reward: 300,
    steps: [
      { kind: 'goto', at: 'apron', r: 110, label: 'Head to the airfield apron' },
      { kind: 'fetchCar', car: 'coupe', label: 'Take the gold coupe', lines: [
        ['Dex (phone)', 'That is her. Gold, loud, and registered to a man who counts his enemies on a spreadsheet.'],
        ['Dex (phone)', 'Bring her to my garage. And Marlo — if the city notices, do not lead it home.'],
      ] },
      { kind: 'deliver', car: 'coupe', at: 'garage', r: 100, label: "Deliver the coupe to Dex's Garage" },
    ],
  },
  {
    id: 'nightrun', title: 'Night Run', reward: 400,
    start: (state) => { state.dayT = 0.80; },
    steps: [
      { kind: 'goto', at: 'pierEnd', r: 80, label: 'Pick up the package at the end of the marina pier' },
      { kind: 'deliver', at: 'hotel', r: 95, timeLimit: 95, label: 'Get the package to the Beach Hotel — fast', lines: [
        ['Marlo', 'Heavy box, no questions, night pier. Dex is going to owe me a boat.'],
      ] },
    ],
  },
  {
    id: 'heatwave', title: 'Heat Wave', reward: 600,
    start: (state) => {
      const g = state.world.landmarks.garage;
      const car = createCar(g.x + 40, g.y + 60, 0, '#e17055', 'parked');
      car.mission = 'heat';
      state.cars.push(car);
    },
    steps: [
      { kind: 'talk', at: 'garage', who: 'Dex', lines: [
        ['Dex', 'That orange runner outside? Every camera in Solmar woke up looking for it this morning.'],
        ['Dex', 'It cannot be here when the city comes knocking. Marina lot, south end. Lose the heat or park it wet.'],
        ['Marlo', 'You collect the worst hobbies, cousin. Fine. Keys.'],
      ] },
      { kind: 'fetchCar', car: 'heat', label: 'Take the orange runner' },
      { kind: 'deliver', car: 'heat', at: 'marinaLot', r: 100, pinHeat: 330, label: 'Park the runner at the marina lot — the city is watching' },
    ],
  },
  {
    id: 'sendoff', title: 'Solmar Send-off', reward: 1000,
    start: (state) => { state.dayT = 0.94; },
    steps: [
      { kind: 'talk', at: 'rosa', who: 'Rosa', lines: [
        ['Rosa', 'One last drive, mijo. The dawn boat, from the marina pier. Your old aunt is seeing the mainland.'],
        ['Marlo', 'You are really leaving Solmar? This city is your whole novel, Rosa.'],
        ['Rosa', 'Every novel ends, Marlo. Drive me into the last chapter. And do not be late — boats are rude.'],
      ] },
      { kind: 'deliver', at: 'pierEnd', r: 85, timeLimit: 150, label: 'Drive Rosa to the marina pier before the dawn boat' },
      { kind: 'talk', at: 'pierEnd', who: 'Rosa', lines: [
        ['Rosa', 'Look at that sky. Solmar always did know how to say goodbye.'],
        ['Rosa', 'The house is yours, the city is yours. Try to give some of it back, eh?'],
        ['Marlo', 'Safe crossing, Aunt Rosa. I will keep the porch light on.'],
        ['Narrator', 'SOLMAR — story complete. The city, its fares and its shells are yours now.'],
      ] },
    ],
  },
];

/** Fresh mission progress for a new game. */
export function createMissionState() {
  return { idx: 0, step: 0, started: false, stepT: 0, complete: false };
}

/** Open a dialogue: lines of [speaker, text]; onDone runs at the end. */
export function openDialogue(state, lines, onDone = null) {
  state.dialogue = { lines, idx: 0, onDone };
}

/** Advance the open dialogue; returns false when it just closed. */
export function advanceDialogue(state) {
  const d = state.dialogue;
  if (!d) return false;
  d.idx++;
  if (d.idx >= d.lines.length) {
    state.dialogue = null;
    if (d.onDone) d.onDone();
    return false;
  }
  return true;
}

function stepPoint(world, step) {
  if (step.at) {
    if (step.at === 'marinaLot') return { x: world.marinaLot.x + world.marinaLot.w / 2, y: world.marinaLot.y + world.marinaLot.h / 2 };
    const lm = world.landmarks[step.at];
    if (lm) return { x: lm.x, y: lm.y };
  }
  return { x: step.x ?? 0, y: step.y ?? 0 };
}

function stepLabel(step) {
  if (step.label) return step.label;
  if (step.kind === 'talk') return `Talk to ${step.who}`;
  return 'Follow the marker';
}

/** Begin the current mission (runs its start hook, arms step one). */
export function startMission(state) {
  const m = MISSIONS[state.mission.idx];
  if (!m) { state.mission.complete = true; return; }
  if (m.start) m.start(state);
  state.mission.started = true;
  state.mission.step = 0;
  state.mission.stepT = 0;
  armStep(state);
  toast(state, `Mission: ${m.title}`);
}

function armStep(state) {
  const m = MISSIONS[state.mission.idx];
  const step = m.steps[state.mission.step];
  state.mission.stepT = 0;
  if (!step) return;
  const pt = stepPoint(state.world, step);
  state.objective = { x: pt.x, y: pt.y, label: stepLabel(step), mission: true };
  if (step.timeLimit) state.mission.timer = step.timeLimit;
  else state.mission.timer = null;
}

function completeStep(state) {
  const m = MISSIONS[state.mission.idx];
  state.mission.step++;
  if (state.mission.step >= m.steps.length) {
    state.cash += m.reward;
    state.events.push({ type: 'cash' });
    toast(state, `${m.title} complete — +$${m.reward}`);
    state.mission.idx++;
    state.mission.started = false;
    state.objective = null;
    if (state.mission.idx >= MISSIONS.length) {
      state.mission.complete = true;
      state.storyDone = true;
    } else {
      startMission(state);
    }
  } else {
    armStep(state);
  }
}

/** The big per-step update: objectives, timers, fares and shells. */
export function updateMissions(world, state, dt) {
  updateShells(state);
  updateFare(world, state, dt);
  const ms = state.mission;
  if (ms.complete || state.dialogue) return;
  if (!ms.started) { startMission(state); return; }
  const m = MISSIONS[ms.idx];
  const step = m.steps[ms.step];
  if (!step) return;
  ms.stepT += dt;

  if (step.pinHeat) {
    state.wanted.heat = Math.max(state.wanted.heat, step.pinHeat);
    state.wanted.lastCrimeT = state.time;
  }
  if (step.timeLimit) {
    ms.timer -= dt;
    if (ms.timer <= 0) {
      toast(state, 'Out of time — try the step again');
      if (step.kind === 'deliver' && ms.step > 0) ms.step--; // back to the pickup
      armStep(state);
      return;
    }
  }

  const p = state.player;
  const pt = stepPoint(world, step);
  const d = dist(p.x, p.y, pt.x, pt.y);
  switch (step.kind) {
    case 'talk':
      if (d < 52 && !p.inCar) {
        openDialogue(state, step.lines, () => completeStep(state));
      }
      break;
    case 'goto':
      if (d < (step.r ?? 80)) {
        if (step.lines) openDialogue(state, step.lines, () => completeStep(state));
        else completeStep(state);
      }
      break;
    case 'fetchCar':
      if (p.inCar && p.inCar.mission === step.car) {
        if (step.lines) openDialogue(state, step.lines, () => completeStep(state));
        else completeStep(state);
      }
      break;
    case 'deliver': {
      const inRightCar = !step.car || (p.inCar && p.inCar.mission === step.car);
      if (d < (step.r ?? 90) && inRightCar) {
        if (step.pinHeat) { state.wanted.heat = 0; state.cops.length = 0; }
        if (step.lines) openDialogue(state, step.lines, () => completeStep(state));
        else completeStep(state);
      }
      break;
    }
  }
}

// ---------------------------------------------------------------- fares

/** Try to pick up a hailing pedestrian near the player. Returns success. */
export function tryStartFare(state) {
  if (state.fare) return false;
  const p = state.player;
  for (let i = 0; i < state.peds.length; i++) {
    const ped = state.peds[i];
    if (!ped.wantsFare || ped.mode !== 'hail') continue;
    if (dist(p.x, p.y, ped.x, ped.y) > 64) continue;
    const dests = ['rosa', 'cafe', 'garage', 'hotel', 'hospital', 'apron', 'pierEnd'];
    const key = dests[Math.floor(state.rng() * dests.length)];
    const lm = state.world.landmarks[key];
    const d = dist(ped.x, ped.y, lm.x, lm.y);
    state.fare = {
      destKey: key, x: lm.x, y: lm.y,
      pay: Math.round(35 + d * 0.055),
      timeLeft: d / 130 + 30,
    };
    state.peds.splice(i, 1);
    toast(state, `Fare: ride across Solmar — $${state.fare.pay} waiting`);
    return true;
  }
  return false;
}

function updateFare(world, state, dt) {
  const fare = state.fare;
  if (!fare) return;
  if (!state.player.inCar) { /* the passenger waits while you walk */ }
  fare.timeLeft -= dt;
  if (fare.timeLeft <= 0) {
    toast(state, 'Fare walked away — too slow');
    dropPassenger(state);
    state.fare = null;
    return;
  }
  if (!state.objective) {
    state.objective = { x: fare.x, y: fare.y, label: `Taxi fare — $${fare.pay}`, mission: false };
  }
  const d = dist(state.player.x, state.player.y, fare.x, fare.y);
  if (d < 78 && state.player.inCar) {
    const tip = fare.timeLeft > 20 ? 12 : 0;
    state.cash += fare.pay + tip;
    state.events.push({ type: 'cash' });
    toast(state, tip ? `Fare paid $${fare.pay} + $${tip} tip` : `Fare paid $${fare.pay}`);
    dropPassenger(state);
    state.fare = null;
    if (state.objective && !state.objective.mission) state.objective = null;
  }
}

function dropPassenger(state) {
  // The passenger reappears at the drop-off as a strolling local.
  const p = state.player;
  state.peds.push({
    x: p.x + 26, y: p.y + 10, angle: 0, speed: 0, mode: 'stroll',
    tx: p.x + 90, ty: p.y, color: '#ffd166', skin: '#c98a5e',
    wantsFare: false, downT: 0, fleeT: 0, fleeX: 0, fleeY: 0, wavePhase: 0,
  });
}

// ---------------------------------------------------------------- shells

function updateShells(state) {
  const p = state.player;
  for (const shell of state.world.shells) {
    if (shell.taken) continue;
    if (dist(p.x, p.y, shell.x, shell.y) < 34) {
      shell.taken = true;
      state.shellsFound++;
      state.cash += 5;
      state.events.push({ type: 'pickup' });
      toast(state, `Shell ${state.shellsFound}/20 — +$5`);
    }
  }
}

/** A short-lived message at the top of the screen. */
export function toast(state, text) {
  state.toast = { text, t: 0, life: 3.6 };
}

export { rand };
