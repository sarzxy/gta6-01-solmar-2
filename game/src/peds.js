// peds.js — the people of SOLMAR: they stroll the sidewalks, stand at
// kerbs waving for a taxi, witness crimes, and run screaming from trouble.
// A pedestrian is also the game's conscience: most crimes only count at
// full weight when a pedestrian (or an officer) saw them happen.

import { clamp, dist, rand, pick } from './util.js';
import { collide, AVENUES, STREETS, ROAD_HALF } from './world.js';
import { PED_COLORS } from './theme.js';

export function createPed(x, y, rng) {
  return {
    x, y, angle: rand(rng, 0, Math.PI * 2), speed: 0,
    mode: 'stroll', tx: x, ty: y,
    color: pick(rng, PED_COLORS), skin: pick(rng, ['#f1c27d', '#e0ac69', '#c98a5e', '#8d5524']),
    wantsFare: false, downT: 0, fleeT: 0, fleeX: 0, fleeY: 0, wavePhase: rand(rng, 0, 6),
  };
}

/** A point on a sidewalk: beside a road, offset past the kerb. */
function sidewalkPoint(world, rng) {
  if (rng() < 0.55) {
    const ax = AVENUES[Math.floor(rng() * AVENUES.length)];
    const side = rng() < 0.5 ? -1 : 1;
    return { x: ax + side * (ROAD_HALF + 16), y: rand(rng, 90, world.h - 90) };
  }
  const sy = STREETS[Math.floor(rng() * STREETS.length)];
  const side = rng() < 0.5 ? -1 : 1;
  return { x: rand(rng, 90, 3700), y: sy + side * (ROAD_HALF + 16) };
}

export function spawnPeds(world, rng, count = 26) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const p = sidewalkPoint(world, rng);
    const ped = createPed(p.x, p.y, rng);
    // A handful always want a taxi: they stand at the kerb and wave.
    if (i % 5 === 0) { ped.wantsFare = true; ped.mode = 'hail'; }
    peds.push(ped);
  }
  return peds;
}

/** Knock a pedestrian down. If the player did it, that is a crime. */
export function knockDown(state, ped, byPlayer) {
  if (ped.mode === 'down') return;
  ped.mode = 'down';
  ped.downT = 3.5;
  ped.speed = 0;
  if (byPlayer) state.events.push({ type: 'crime', kind: 'hitped', x: ped.x, y: ped.y });
}

export function updatePeds(world, state, dt) {
  const rng = state.rng;
  for (const ped of state.peds) {
    ped.wavePhase += dt * 5;
    if (ped.mode === 'down') {
      ped.downT -= dt;
      if (ped.downT <= 0) { ped.mode = 'flee'; ped.fleeT = 2.5; ped.fleeX = ped.x + rand(rng, -1, 1); ped.fleeY = ped.y - 1; }
      continue;
    }
    // Trouble nearby sends everyone running: a fresh alarm, or any car
    // moving fast and close.
    let threat = null;
    if (state.alarm && state.time - state.alarm.t < 2.5 && dist(ped.x, ped.y, state.alarm.x, state.alarm.y) < 240) {
      threat = state.alarm;
    }
    if (!threat) {
      for (const car of state.cars) {
        if (Math.abs(car.speed) > 170 && dist(ped.x, ped.y, car.x, car.y) < 78) { threat = car; break; }
      }
      if (!threat && state.cops) {
        for (const cop of state.cops) {
          if (cop.type === 'car' && Math.abs(cop.car.speed) > 170 && dist(ped.x, ped.y, cop.car.x, cop.car.y) < 78) { threat = cop.car; break; }
        }
      }
    }
    if (threat && ped.mode !== 'flee') {
      ped.mode = 'flee';
      ped.fleeT = rand(rng, 2, 3.5);
      ped.fleeX = threat.x; ped.fleeY = threat.y;
    }

    if (ped.mode === 'flee') {
      ped.fleeT -= dt;
      const away = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
      movePed(world, ped, away, 248, dt);
      if (ped.fleeT <= 0) { ped.mode = ped.wantsFare ? 'hail' : 'stroll'; pickStrollTarget(world, ped, rng); }
    } else if (ped.mode === 'hail') {
      ped.speed = 0; // stands at the kerb, arm up, hoping
    } else {
      // Stroll: amble to a target, then choose another stretch of sidewalk.
      const d = dist(ped.x, ped.y, ped.tx, ped.ty);
      if (d < 12) pickStrollTarget(world, ped, rng);
      else movePed(world, ped, Math.atan2(ped.ty - ped.y, ped.tx - ped.x), 82, dt);
    }
  }
}

function pickStrollTarget(world, ped, rng) {
  // Wander, but stay in the neighbourhood: a new target up to 500px away
  // biased onto sidewalks by snapping toward the nearest road's kerb.
  let tx = clamp(ped.x + rand(rng, -480, 480), 30, world.w - 30);
  let ty = clamp(ped.y + rand(rng, -480, 480), 30, world.h - 30);
  ped.tx = tx; ped.ty = ty;
}

function movePed(world, ped, angle, speed, dt) {
  ped.angle = angle;
  ped.speed = speed;
  const nx = ped.x + Math.cos(angle) * speed * dt;
  const ny = ped.y + Math.sin(angle) * speed * dt;
  const [cx, cy] = collide(world, nx, ny, 11);
  ped.x = cx; ped.y = cy;
}
