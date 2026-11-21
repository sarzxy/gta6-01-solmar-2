// player.js — Marlo Reyes on foot and behind the wheel: walking and
// running with collision, getting into cars (his own or, fatefully, other
// people's), driving them, and the health/busted state the police act on.

import { clamp, dist, TAU } from './util.js';
import { collide } from './world.js';
import { stepCarPhysics } from './vehicles.js';

export const WALK_SPEED = 175;
export const RUN_SPEED = 295;
export const PLAYER_RADIUS = 14;

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0, moving: false,
    health: 100, inCar: null, bustedMeter: 0, walkPhase: 0,
    dead: false,
  };
}

/**
 * Advance the player one step. input is the shared input state
 * ({up, down, left, right, run, interactPressed}). Stealing a car and
 * climbing in are reported through state.events for the police to weigh.
 */
export function updatePlayer(world, state, input, dt) {
  const p = state.player;
  if (p.inCar) {
    const car = p.inCar;
    const throttle = (input.up ? 1 : 0) + (input.down ? -1 : 0);
    const steer = (input.right ? 1 : 0) + (input.left ? -1 : 0);
    const crashed = stepCarPhysics(world, car, throttle, steer, dt);
    if (crashed && Math.abs(car.speed) > 4) {
      state.events.push({ type: 'crash', x: car.x, y: car.y });
    }
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    p.speed = Math.abs(car.speed);
    p.moving = Math.abs(car.speed) > 8;
    if (input.interactPressed) exitCar(state);
    return;
  }

  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(mx, my);
  p.moving = len > 0;
  if (len > 0) {
    mx /= len; my /= len;
    const top = input.run ? RUN_SPEED : WALK_SPEED;
    const nx = p.x + mx * top * dt;
    const ny = p.y + my * top * dt;
    const [cx, cy] = collide(world, nx, ny, PLAYER_RADIUS);
    p.x = cx; p.y = cy;
    p.angle = Math.atan2(my, mx);
    p.speed = top;
    p.walkPhase += dt * (input.run ? 11 : 8);
  } else {
    p.speed = 0;
  }
  if (input.interactPressed) tryEnterCar(state);
}

/** The nearest car within reach of the player, or null. */
export function nearestCar(state, range = 58) {
  let best = null, bd = range;
  for (const car of state.cars) {
    const d = dist(state.player.x, state.player.y, car.x, car.y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

function tryEnterCar(state) {
  const car = nearestCar(state);
  if (!car) return;
  const p = state.player;
  p.inCar = car;
  p.x = car.x; p.y = car.y;
  car.driver = 'player';
  // Taking a car that is not yours is the city's favourite crime.
  if (car.owner !== 'marlo' && !car.enteredBefore) {
    car.enteredBefore = true;
    state.events.push({ type: 'crime', kind: 'steal', x: car.x, y: car.y });
  }
  state.events.push({ type: 'enterCar', car });
}

function exitCar(state) {
  const p = state.player;
  const car = p.inCar;
  if (!car) return;
  car.driver = null;
  if (car.kind === 'traffic') car.kind = 'parked'; // abandoned where it stopped
  p.inCar = null;
  // Step out to the car's left side, clear of the bodywork.
  const sx = car.x + Math.cos(car.angle - Math.PI / 2) * 34;
  const sy = car.y + Math.sin(car.angle - Math.PI / 2) * 34;
  const [cx, cy] = collide(state.world, sx, sy, PLAYER_RADIUS);
  p.x = cx; p.y = cy;
  state.events.push({ type: 'exitCar', car });
}

/** Put the player back on his feet at the hospital, poorer. */
export function respawnAtHospital(state, fine) {
  const p = state.player;
  if (p.inCar) { p.inCar.driver = null; p.inCar = null; }
  const door = state.world.landmarks.hospital;
  p.x = door.x; p.y = door.y + 10;
  p.health = 100;
  p.bustedMeter = 0;
  p.dead = false;
  state.cash = Math.max(0, state.cash - fine);
  state.wanted.heat = 0;
  state.wanted.stars = 0;
  state.cops.length = 0;
}

export { TAU };
