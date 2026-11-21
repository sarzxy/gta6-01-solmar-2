// vehicles.js — every car in SOLMAR: the player's wheels, parked cars
// waiting to be stolen, and traffic that drives the grid. Cars share one
// simple physics step (throttle, brake, steering that bites with speed)
// and one collision response against the city's buildings.

import { clamp, dist, turnToward, TAU } from './util.js';
import { collide, drivable, AVENUES, STREETS } from './world.js';
import { CAR_COLORS } from './theme.js';

export const CAR_LEN = 80;
export const CAR_WID = 40;
const TOP_SPEED = 335;
const REVERSE_SPEED = -110;

let nextCarId = 1;

/** A car. kind: 'traffic' | 'parked' | 'cop'. mission tags story cars. */
export function createCar(x, y, angle, color, kind = 'parked') {
  return {
    id: nextCarId++, x, y, angle, speed: 0, color, kind,
    steer: 0, throttle: 0, mission: '', owner: '', damage: 0,
    ai: null, honkT: 0,
  };
}

/**
 * Advance one car's physics by dt seconds. throttle in [-1, 1] (negative
 * brakes, then reverses), steer in [-1, 1]. Returns true if it crashed
 * into the city this step.
 */
export function stepCarPhysics(world, car, throttle, steer, dt) {
  const accel = throttle > 0 ? 260 : 340;
  car.speed += throttle * accel * dt;
  // Rolling drag and a hard top speed, forward and back.
  car.speed -= car.speed * 0.55 * dt;
  car.speed = clamp(car.speed, REVERSE_SPEED, TOP_SPEED);
  if (Math.abs(car.speed) < 2 && throttle === 0) car.speed = 0;
  // Steering only bites while moving, and flips in reverse.
  const bite = clamp(Math.abs(car.speed) / 120, 0, 1) * Math.sign(car.speed || 1);
  car.angle += steer * 1.9 * bite * dt;
  car.steer = steer;
  car.throttle = throttle;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const [cx, cy, hit] = collide(world, nx, ny, 30);
  if (hit) {
    if (Math.abs(car.speed) > 130) car.damage = Math.min(100, car.damage + 12);
    car.speed *= -0.22;
    car.x = cx; car.y = cy;
    return true;
  }
  car.x = nx; car.y = ny;
  return false;
}

/** Parked cars along the avenues, in the lots, and the story cars. */
export function spawnParkedCars(world, rng) {
  const cars = [];
  const add = (x, y, angle, color, mission = '', owner = '') => {
    const c = createCar(x, y, angle, color, 'parked');
    c.mission = mission; c.owner = owner;
    cars.push(c);
    return c;
  };
  // Kerbside parking on both sides of the land avenues.
  for (const ax of [480, 1200, 1920, 2640, 3360]) {
    for (let y = 200; y < 3450; y += 210) {
      if (rng() < 0.45) continue;
      const side = rng() < 0.5 ? -62 : 62;
      add(ax + side, y + rng() * 60, Math.PI / 2, CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)]);
    }
  }
  // Marina lot and airfield apron rows.
  for (let i = 0; i < 5; i++) add(3620 + i * 8, 1470 + i * 42, 0, CAR_COLORS[(i * 3) % CAR_COLORS.length]);
  for (let i = 0; i < 3; i++) add(180 + i * 95, 2880, Math.PI / 2, CAR_COLORS[(i * 5 + 2) % CAR_COLORS.length]);
  // The story cars: Rosa's sedan outside her house, and the gold coupe
  // Dex wants, parked brazenly on the airfield apron.
  const rosa = world.landmarks.rosa.building;
  add(rosa.x + 30, rosa.y + rosa.h + 58, 0, '#7fb2d9', 'rosa', 'rosa');
  add(430, 2985, Math.PI / 2, '#ffc93c', 'coupe', '');
  return cars;
}

/** Moving traffic: cars that follow avenues and streets and turn at crossings. */
export function spawnTraffic(world, rng, count = 14) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const vertical = rng() < 0.5;
    const dir = rng() < 0.5 ? 1 : -1;
    const lane = 15; // right-hand traffic offset
    let x, y, angle;
    if (vertical) {
      const ax = AVENUES[Math.floor(rng() * 5)];
      x = ax + (dir > 0 ? lane : -lane);
      y = 150 + rng() * 3300;
      angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const sy = STREETS[Math.floor(rng() * STREETS.length)];
      y = sy + (dir > 0 ? -lane : lane);
      x = 150 + rng() * 3400;
      angle = dir > 0 ? 0 : Math.PI;
    }
    const car = createCar(x, y, angle, CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], 'traffic');
    car.ai = { vertical, dir, cruise: 165 + rng() * 70, turnCooldown: 0 };
    car.speed = car.ai.cruise;
    cars.push(car);
  }
  return cars;
}

/** Drive every traffic car one step: follow its road, slow for the car
 *  ahead, and sometimes turn when it reaches a crossing. */
export function updateTraffic(world, state, dt) {
  for (const car of state.cars) {
    if (car.kind !== 'traffic' || car === state.player.inCar) continue;
    const ai = car.ai;
    ai.turnCooldown -= dt;
    // The road centre it should be glued to, and the crossing ahead.
    let targetAngle = car.angle;
    if (ai.vertical) {
      const ax = nearestOf(AVENUES, car.x);
      const laneX = ax + (ai.dir > 0 ? 15 : -15);
      targetAngle = ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      car.angle = turnToward(car.angle, Math.atan2(Math.sin(targetAngle), Math.cos(targetAngle)), 2.4 * dt);
      car.x += clamp(laneX - car.x, -60 * dt, 60 * dt);
      const sy = nearestOf(STREETS, car.y);
      if (Math.abs(car.y - sy) < 26 && ai.turnCooldown <= 0 && state.rng() < 0.35) {
        ai.vertical = false;
        ai.dir = state.rng() < 0.5 ? 1 : -1;
        ai.turnCooldown = 2.5;
      }
    } else {
      const sy = nearestOf(STREETS, car.y);
      const laneY = sy + (ai.dir > 0 ? -15 : 15);
      targetAngle = ai.dir > 0 ? 0 : Math.PI;
      car.angle = turnToward(car.angle, targetAngle, 2.4 * dt);
      car.y += clamp(laneY - car.y, -60 * dt, 60 * dt);
      const ax = nearestOf(AVENUES.slice(0, 5), car.x);
      if (Math.abs(car.x - ax) < 26 && ai.turnCooldown <= 0 && state.rng() < 0.35) {
        ai.vertical = true;
        ai.dir = state.rng() < 0.5 ? 1 : -1;
        ai.turnCooldown = 2.5;
      }
    }
    // Keep a gap to whatever is ahead.
    let throttle = 0.55;
    for (const other of state.cars) {
      if (other === car) continue;
      const ahead = aheadDistance(car, other);
      if (ahead > 0 && ahead < 95) throttle = ahead < 48 ? -0.4 : 0.05;
    }
    if (dist(car.x, car.y, state.player.x, state.player.y) < 70 && !state.player.inCar) throttle = -0.3;
    const want = ai.cruise * (throttle > 0 ? 1 : 0);
    car.speed += clamp(want - car.speed, -260 * dt, 130 * dt);
    if (throttle < 0 && car.speed < 30) car.speed = Math.max(0, car.speed + throttle * 200 * dt);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (drivable(world, nx, ny)) { car.x = nx; car.y = ny; }
    else car.speed = 0;
    // Wrap cars that leave the city back onto the grid.
    if (car.x < 40 || car.x > 3980 || car.y < 40 || car.y > 3560) {
      const p = state.rng() < 0.5
        ? { x: AVENUES[Math.floor(state.rng() * 5)], y: state.rng() * 3400 + 100 }
        : { x: state.rng() * 3400 + 100, y: STREETS[Math.floor(state.rng() * STREETS.length)] };
      car.x = p.x; car.y = p.y;
    }
  }
}

function nearestOf(list, v) {
  let best = list[0], bd = Infinity;
  for (const item of list) { const d = Math.abs(item - v); if (d < bd) { bd = d; best = item; } }
  return best;
}

/** Distance to `other` if it sits in front of `car`, else -1. */
export function aheadDistance(car, other) {
  const dx = other.x - car.x, dy = other.y - car.y;
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  const forward = dx * fx + dy * fy;
  const side = Math.abs(dx * -fy + dy * fx);
  if (forward <= 0 || side > 30) return -1;
  return forward;
}

export { TAU };
