// police.js — SOLMAR PD and the wanted system. Crimes raise heat when a
// pedestrian or an officer witnesses them (an unseen crime barely counts);
// heat becomes stars; stars bring patrol cars, then foot officers, then
// gunfire. Stay clean and the heat bleeds away.

import { clamp, dist, turnToward, rand } from './util.js';
import { collide, randomRoadPoint } from './world.js';
import { createCar } from './vehicles.js';

export const CRIME_HEAT = { steal: 55, hitped: 95, hitcar: 40, crash: 16, reckless: 12 };

export function createWanted() {
  return { heat: 0, stars: 0, lastCrimeT: -100 };
}

/** Stars for a heat level: any heat is one star, then one per 110. */
export function starsForHeat(heat) {
  if (heat <= 0) return 0;
  return Math.min(5, 1 + Math.floor(heat / 110));
}

export function refreshStars(state) {
  state.wanted.stars = starsForHeat(state.wanted.heat);
}

/** Did anyone see it? A pedestrian within 280px, an officer within 460. */
export function witnessed(state, x, y) {
  for (const ped of state.peds) if (dist(x, y, ped.x, ped.y) < 280) return true;
  for (const cop of state.cops) {
    const cx = cop.type === 'car' ? cop.car.x : cop.x;
    const cy = cop.type === 'car' ? cop.car.y : cop.y;
    if (dist(x, y, cx, cy) < 460) return true;
  }
  return false;
}

/** Weigh one crime into the wanted heat and raise the alarm for peds. */
export function reportCrime(state, kind, x, y) {
  const base = CRIME_HEAT[kind] ?? 20;
  const seen = witnessed(state, x, y);
  state.wanted.heat = clamp(state.wanted.heat + base * (seen ? 1 : 0.35), 0, 560);
  state.wanted.lastCrimeT = state.time;
  state.alarm = { x, y, t: state.time };
  refreshStars(state);
}

/** Weigh every crime event the world produced this step. */
export function consumeCrimeEvents(state) {
  for (const ev of state.events) {
    if (ev.type === 'crime') reportCrime(state, ev.kind, ev.x, ev.y);
    else if (ev.type === 'crash' && witnessed(state, ev.x, ev.y)) reportCrime(state, 'crash', ev.x, ev.y);
  }
}

const COP_CARS_BY_STARS = [0, 1, 2, 3, 4, 5];
const COP_FEET_BY_STARS = [0, 0, 0, 1, 2, 3];

export function updatePolice(world, state, dt) {
  const w = state.wanted;
  const p = state.player;
  // Heat bleeds away once the city has been quiet a while.
  if (state.time - w.lastCrimeT > 6 && w.heat > 0) {
    w.heat = Math.max(0, w.heat - dt * 5);
    refreshStars(state);
  }
  spawnNeeded(world, state);
  let officerClose = false;

  for (let i = state.cops.length - 1; i >= 0; i--) {
    const cop = state.cops[i];
    if (cop.type === 'car') updateCopCar(world, state, cop, dt);
    else if (updateOfficer(world, state, cop, dt)) officerClose = true;
    const cx = cop.type === 'car' ? cop.car.x : cop.x;
    const cy = cop.type === 'car' ? cop.car.y : cop.y;
    // Units that fall far behind while the heat is gone give up the chase.
    if (dist(cx, cy, p.x, p.y) > 1500 && w.stars === 0) state.cops.splice(i, 1);
  }
  if (!officerClose && p.bustedMeter > 0) {
    p.bustedMeter = Math.max(0, p.bustedMeter - dt * 0.45);
  }
  if (p.bustedMeter >= 1 && !state.pendingEnd) state.pendingEnd = 'busted';
  if (p.health <= 0 && !state.pendingEnd) state.pendingEnd = 'wasted';
}

function spawnNeeded(world, state) {
  const stars = state.wanted.stars;
  const wantCars = COP_CARS_BY_STARS[stars];
  const wantFeet = COP_FEET_BY_STARS[stars];
  let cars = 0, feet = 0;
  for (const cop of state.cops) { if (cop.type === 'car') cars++; else feet++; }
  const p = state.player;
  let guard = 0;
  while (cars < wantCars && guard++ < 12) {
    const spot = randomRoadPoint(world, state.rng);
    const d = dist(spot.x, spot.y, p.x, p.y);
    if (d < 620 || d > 1150) continue;
    const car = createCar(spot.x, spot.y, spot.vertical ? Math.PI / 2 : 0, '#eef1f4', 'cop');
    car.lightPhase = rand(state.rng, 0, 6);
    state.cops.push({ type: 'car', car });
    cars++;
  }
  guard = 0;
  while (feet < wantFeet && guard++ < 12) {
    const a = rand(state.rng, 0, Math.PI * 2);
    const d = rand(state.rng, 380, 520);
    const x = clamp(p.x + Math.cos(a) * d, 30, world.w - 30);
    const y = clamp(p.y + Math.sin(a) * d, 30, world.h - 30);
    state.cops.push({ type: 'foot', x, y, angle: 0, shootT: rand(state.rng, 0.4, 1.1), walkPhase: 0 });
    feet++;
  }
  // Trim the surplus when the heat drops.
  for (let i = state.cops.length - 1; i >= 0 && (cars > wantCars || feet > wantFeet); i--) {
    const cop = state.cops[i];
    if (cop.type === 'car' && cars > wantCars) { state.cops.splice(i, 1); cars--; }
    else if (cop.type === 'foot' && feet > wantFeet) { state.cops.splice(i, 1); feet--; }
  }
}

function updateCopCar(world, state, cop, dt) {
  const car = cop.car;
  const p = state.player;
  car.lightPhase += dt * 9;
  const d = dist(car.x, car.y, p.x, p.y);
  const targetAngle = Math.atan2(p.y - car.y, p.x - car.x);
  car.angle = turnToward(car.angle, targetAngle, 2.1 * dt);
  // Chase hard; ease off alongside an on-foot player so officers can work.
  let want = 352;
  if (!p.inCar && d < 90) want = 0;
  else if (d < 160) want = 190;
  car.speed += clamp(want - car.speed, -320 * dt, 210 * dt);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const [cx, cy, hit] = collide(world, nx, ny, 30);
  car.x = cx; car.y = cy;
  if (hit) car.speed *= -0.2;
  // Ramming the player's car at speed is a crime scene of its own.
  if (p.inCar && d < 52 && Math.abs(car.speed) > 150) {
    p.inCar.damage = Math.min(100, p.inCar.damage + 10 * dt * 10);
    car.speed *= 0.6;
  }
}

function updateOfficer(world, state, cop, dt) {
  const p = state.player;
  const d = dist(cop.x, cop.y, p.x, p.y);
  cop.walkPhase += dt * 9;
  let close = false;
  if (d > 30) {
    const a = Math.atan2(p.y - cop.y, p.x - cop.x);
    cop.angle = a;
    const nx = cop.x + Math.cos(a) * 238 * dt;
    const ny = cop.y + Math.sin(a) * 238 * dt;
    const [cx, cy] = collide(world, nx, ny, 12);
    cop.x = cx; cop.y = cy;
  } else if (!p.inCar) {
    // Hands on: the busted meter fills while an officer holds the player.
    p.bustedMeter = Math.min(1, p.bustedMeter + dt / 1.5);
    close = true;
  }
  // From three stars, officers shoot to stop the player.
  if (state.wanted.stars >= 3 && d < 330 && d > 24) {
    cop.shootT -= dt;
    if (cop.shootT <= 0) {
      cop.shootT = rand(state.rng, 0.75, 1.3);
      const dmg = rand(state.rng, 3, 8) * (p.inCar ? 0.45 : 1);
      p.health = Math.max(0, p.health - dmg);
      if (p.inCar) p.inCar.damage = Math.min(100, p.inCar.damage + 4);
      state.shots.push({ x1: cop.x, y1: cop.y, x2: p.x, y2: p.y, life: 0.09 });
      state.events.push({ type: 'shot' });
    }
  }
  return close;
}
