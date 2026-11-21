// render-screenshots.mjs — SOLMAR's screenshots, rendered headlessly by
// the game's own code: each scene builds a real game state with
// createGameState, stages it (golden-hour downtown, a three-star chase,
// the night run at the marina, a beach run), then draws it with the same
// drawScene + drawHUD the browser runs, through the software canvas in
// raster.js, and writes 1280x720 PNGs into screenshots/.
//
//   node tools/render-screenshots.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGameState, stepGame } from '../game/src/main.js';
import { createInput } from '../game/src/input.js';
import { openDialogue } from '../game/src/missions.js';
import { createCar } from '../game/src/vehicles.js';
import { drawScene } from '../game/src/render.js';
import { drawHUD } from '../game/src/hud.js';
import { RasterCanvas, encodePNG } from './raster.js';

const W = 1280, H = 720;
const outDir = fileURLToPath(new URL('../screenshots/', import.meta.url));
const MAX_BYTES = 262144;

function shoot(state, name) {
  const canvas = new RasterCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawScene(ctx, state, W, H);
  drawHUD(ctx, state, W, H);
  const png = encodePNG(W, H, ctx.data);
  if (png.length > MAX_BYTES) {
    throw new Error(`${name} is ${png.length} bytes, over the ${MAX_BYTES} cap`);
  }
  writeFileSync(outDir + name, png);
  console.log(`${name}: ${png.length} bytes`);
}

function settle(state, ticks, input = createInput()) {
  for (let i = 0; i < ticks; i++) stepGame(state, input, 1 / 30);
  return input;
}

// 1 — the cover: golden hour downtown, Marlo on foot, the city alive.
{
  const state = createGameState();
  state.mode = 'play';
  state.dayT = 0.615; // golden afternoon
  state.player.x = 1965; state.player.y = 1685; state.player.angle = -2.5;
  state.camera.x = state.player.x; state.camera.y = state.player.y;
  // Locals and traffic around the downtown crossing.
  state.peds[0].x = 1870; state.peds[0].y = 1790;
  state.peds[1].x = 2050; state.peds[1].y = 1660;
  state.peds[2].x = 1990; state.peds[2].y = 1815;
  const traffic = state.cars.filter((c) => c.kind === 'traffic');
  traffic[0].x = 1905; traffic[0].y = 1470; traffic[0].angle = Math.PI / 2;
  traffic[1].x = 1935; traffic[1].y = 1980; traffic[1].angle = -Math.PI / 2;
  settle(state, 12);
  state.camera.x = state.player.x; state.camera.y = state.player.y;
  shoot(state, '01-cover.png');
}

// 2 — a three-star chase up the central avenue.
{
  const state = createGameState();
  state.mode = 'play';
  state.dayT = 0.34;
  const car = state.cars.find((c) => c.kind === 'parked');
  car.x = 1920; car.y = 2150; car.angle = -Math.PI / 2; car.speed = 240;
  state.player.inCar = car;
  car.driver = 'player';
  state.player.x = car.x; state.player.y = car.y;
  state.wanted.heat = 250;
  state.wanted.lastCrimeT = 0;
  const input = createInput();
  input.up = true;
  settle(state, 210, input);
  // Make sure the frame has its pursuers even if spawns ran wide.
  const near = state.cops.filter((c) => c.type === 'car' && Math.hypot(c.car.x - state.player.x, c.car.y - state.player.y) < 660);
  for (let i = near.length; i < 2; i++) {
    const copCar = createCar(state.player.x - 60 + i * 130, state.player.y + 300 + i * 150, -Math.PI / 2, '#eef1f4', 'cop');
    copCar.speed = 300;
    copCar.lightPhase = i * 2.4;
    state.cops.push({ type: 'car', car: copCar });
  }
  state.wanted.heat = 250;
  state.wanted.stars = 3;
  shoot(state, '02-chase.png');
}

// 3 — the night run: a package, a pier, and Dex on the phone.
{
  const state = createGameState();
  state.mode = 'play';
  state.dayT = 0.82; // deep night
  state.player.x = 4180; state.player.y = 1560; state.player.angle = 0.3;
  state.camera.x = state.player.x; state.camera.y = state.player.y;
  const copCar = createCar(3900, 1470, Math.PI / 2, '#eef1f4', 'cop');
  copCar.lightPhase = 2;
  state.cops.push({ type: 'car', car: copCar });
  const hotel = state.world.landmarks.hotel;
  state.objective = { x: hotel.x, y: hotel.y, label: 'GET THE PACKAGE TO THE BEACH HOTEL - FAST', mission: true };
  openDialogue(state, [
    ['Marlo', 'Heavy box, no questions, night pier. Dex is going to owe me a boat.'],
    ['Dex (phone)', 'Marina to the Beach Hotel, cousin. The clock is already running.'],
  ]);
  shoot(state, '03-night-run.png');
}

// 4 — a daytime run down the beach, shells in the sand, a fare waiting.
{
  const state = createGameState();
  state.mode = 'play';
  state.dayT = 0.30;
  state.player.x = 3955; state.player.y = 2395; state.player.angle = -0.4;
  state.camera.x = state.player.x; state.camera.y = state.player.y;
  const hail = state.peds.find((p) => p.wantsFare);
  if (hail) { hail.x = 3905; hail.y = 2330; hail.mode = 'hail'; }
  const input = createInput();
  input.right = true; input.run = true;
  settle(state, 14, input);
  const shell = state.world.shells.find((s) => !s.taken && Math.abs(s.y - state.player.y) < 320);
  if (shell) state.objective = { x: shell.x, y: shell.y, label: 'BEACH SHELLS - HIDDEN UP AND DOWN THE SAND', mission: false };
  state.camera.x = state.player.x; state.camera.y = state.player.y;
  shoot(state, '04-beach-run.png');
}

console.log('screenshots written to', outDir);
