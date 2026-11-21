// smoke-test.mjs — plays SOLMAR headlessly, for real: it boots a game
// state and drives it with the same stepGame + input the browser uses,
// walking Marlo to Rosa, through her dialogue, into her sedan, across
// the city to the Marina Café, and finishes the first mission. Then it
// steals a car, cooks the wanted level to three stars, and checks the
// police actually show up. Any broken system fails the run.
//
//   node tools/smoke-test.mjs

import { createGameState, stepGame } from '../game/src/main.js';
import { createInput } from '../game/src/input.js';
import { angleDelta, dist } from '../game/src/util.js';
import { saveGame, loadSave, clearSave } from '../game/src/save.js';

const DT = 1 / 30;
let failures = 0;

function check(name, ok, detail = '') {
  if (ok) console.log(`  ok — ${name}`);
  else { failures++; console.log(`  FAIL — ${name} ${detail}`); }
}

function step(state, input, n = 1) {
  for (let i = 0; i < n; i++) stepGame(state, input, DT);
}

/** Hold the input that walks the player toward a point. */
function walkToward(state, input, tx, ty) {
  const p = state.player;
  const dx = tx - p.x, dy = ty - p.y;
  input.left = dx < -8; input.right = dx > 8;
  input.up = dy < -8; input.down = dy > 8;
  input.run = true;
}

/** Hold the input that drives the player's car toward a point. */
function driveToward(state, input, tx, ty) {
  const p = state.player;
  const want = Math.atan2(ty - p.y, tx - p.x);
  const delta = angleDelta(p.angle, want);
  const ad = Math.abs(delta);
  input.left = false; input.right = false; input.up = false; input.down = false;
  if (ad > 2.4) {
    // The target is behind: back up and swing the nose around.
    input.down = true;
    if (delta > 0) input.right = true; else input.left = true;
  } else {
    input.up = true;
    if (delta < -0.05) input.left = true;
    if (delta > 0.05) input.right = true;
  }
}

/** Walk or drive through waypoints until the last is reached. */
function travel(state, input, waypoints, maxTicks, radius = 64) {
  let wp = 0;
  let lastX = state.player.x, lastY = state.player.y, still = 0, unstick = 0;
  for (let t = 0; t < maxTicks && wp < waypoints.length; t++) {
    const [tx, ty] = waypoints[wp];
    if (dist(state.player.x, state.player.y, tx, ty) < radius) { wp++; continue; }
    if (unstick > 0) {
      // Wedged against the city: back off and swing around.
      unstick--;
      if (state.player.inCar) {
        const delta = angleDelta(state.player.angle, Math.atan2(ty - state.player.y, tx - state.player.x));
        input.up = false; input.down = true;
        input.left = delta > 0; input.right = delta < 0;
      } else {
        const dx = tx - state.player.x, dy = ty - state.player.y;
        const len = Math.hypot(dx, dy) || 1;
        input.left = -dy / len < -0.3; input.right = -dy / len > 0.3;
        input.up = dx / len < -0.3; input.down = dx / len > 0.3;
      }
    } else if (state.player.inCar) driveToward(state, input, tx, ty);
    else walkToward(state, input, tx, ty);
    step(state, input, 1);
    if (state.dialogue) return false; // a conversation interrupted the trip
    if (dist(lastX, lastY, state.player.x, state.player.y) < 2) still++;
    else { still = 0; lastX = state.player.x; lastY = state.player.y; }
    if (still >= 35) { unstick = 26; still = 0; }
  }
  input.up = input.down = input.left = input.right = false;
  return wp >= waypoints.length;
}

console.log('SOLMAR smoke test');
const state = createGameState();
const input = createInput();

// The title screen gives way to the game.
check('boots to the title screen', state.mode === 'title');
input.confirmPressed = true;
step(state, input);
check('confirm starts play', state.mode === 'play', `mode=${state.mode}`);
step(state, input, 5);
check('first mission arms with an objective', !!state.objective && state.mission.started);

// Rosa is steps from the porch — close enough that her conversation
// opens on its own. (The world freezes while she talks.)
const rosa = state.world.landmarks.rosa;
step(state, input, 3);
check('Rosa dialogue opens', !!state.dialogue, `player at ${Math.round(state.player.x)},${Math.round(state.player.y)}`);

// Talk through it: the mission must advance to fetching her sedan.
for (let i = 0; i < 12 && state.dialogue; i++) { input.confirmPressed = true; step(state, input); }
check('dialogue completes', !state.dialogue);
check('mission advances to the sedan step', state.mission.step === 1, `step=${state.mission.step}`);

// Walking works once the conversation lets the world move again.
const startY = state.player.y;
input.down = true;
step(state, input, 12);
input.down = false;
check('player walks', state.player.y - startY > 8, `dy=${Math.round(state.player.y - startY)}`);

// Get in the sedan.
const sedan = state.cars.find((c) => c.mission === 'rosa');
check('the sedan exists', !!sedan);
travel(state, input, [[sedan.x, sedan.y]], 240, 24);
input.interactPressed = true;
step(state, input);
check('player gets into the sedan', state.player.inCar === sedan);

// Drive her across the city, avenue by avenue, to the Marina Café.
const cafe = state.world.landmarks.cafe;
const route = [[770, 1000], [900, 1080], [2400, 1080], [3360, 1080], [3360, 1560], [3650, 1560], [cafe.x, cafe.y]];
const arrived = travel(state, input, route, 6000, 90);
check('the drive reaches the café', arrived, `at ${Math.round(state.player.x)},${Math.round(state.player.y)} want ${Math.round(cafe.x)},${Math.round(cafe.y)}`);
step(state, input, 5);
check('delivery step completes', state.mission.step === 3, `step=${state.mission.step}`);

// Out of the car, talk to Dex, and the first mission is done.
input.interactPressed = true;
step(state, input);
check('player gets out at the café', !state.player.inCar);
travel(state, input, [[cafe.x, cafe.y]], 240, 40);
for (let i = 0; i < 12 && state.dialogue; i++) { input.confirmPressed = true; step(state, input); }
check('mission one completes', state.mission.idx === 1, `idx=${state.mission.idx}`);
check('the reward lands', state.cash === 400, `cash=${state.cash}`);

// Steal something from the marina lot: heat must rise.
const lotCar = state.cars.find((c) => c.kind === 'parked' && !c.enteredBefore && dist(state.player.x, state.player.y, c.x, c.y) < 420);
check('a stealable car is near', !!lotCar);
travel(state, input, [[lotCar.x, lotCar.y]], 300, 24);
const heatBefore = state.wanted.heat;
input.interactPressed = true;
step(state, input, 3);
check('the theft is entered', state.player.inCar === lotCar);
check('the theft raises heat', state.wanted.heat > heatBefore, `heat ${heatBefore} -> ${state.wanted.heat}`);

// Cook it to three stars and hold it there: patrol cars and an officer
// must answer while the heat is still on.
state.wanted.heat = 250;
state.wanted.lastCrimeT = state.time;
step(state, input, 30);
check('three stars', state.wanted.stars === 3, `stars=${state.wanted.stars}`);
for (let k = 0; k < 2; k++) {
  state.wanted.heat = 250;
  state.wanted.lastCrimeT = state.time;
  step(state, input, 30);
}
const copCars = state.cops.filter((c) => c.type === 'car').length;
const copFeet = state.cops.filter((c) => c.type === 'foot').length;
check('patrol cars respond', copCars >= 1, `cars=${copCars}`);
check('foot officers respond at three stars', copFeet >= 1, `feet=${copFeet}`);

// Saving round-trips.
saveGame(state);
const loaded = loadSave();
check('save round-trips', !!loaded && loaded.cash === state.cash && loaded.missionIdx === state.mission.idx);
clearSave();

console.log(failures === 0 ? 'SMOKE TEST PASSED' : `SMOKE TEST FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
