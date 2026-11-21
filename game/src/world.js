// world.js — SOLMAR itself: a seeded, generated coastal city. One call to
// createWorld(seed) builds the avenue/street grid, about two hundred
// buildings, the marina and its piers, the airfield, the beach and the
// ocean, plus every landmark the story visits. The same seed always builds
// the same city, in the browser, in the smoke test and in the screenshots.

import { mulberry32, rand, randInt, pick, clamp, circleRectResolve } from './util.js';
import { BUILDING_COLORS, ROOF_COLORS } from './theme.js';

export const WORLD_W = 4800;
export const WORLD_H = 3600;
export const ROAD_HALF = 48;          // half the width of an avenue/street
export const BEACH_X = 3840;          // sand starts here
export const OCEAN_X = 4080;          // open water starts here
export const AVENUES = [480, 1200, 1920, 2640, 3360, 3900]; // last: shore drive
export const STREETS = [420, 1080, 1740, 2400, 3060];

export function createWorld(seed = 20261121) {
  const rng = mulberry32(seed);
  const world = {
    seed,
    w: WORLD_W,
    h: WORLD_H,
    buildings: [],
    palms: [],
    piers: [
      { x: 3980, y: 1533, w: 430, h: 54 },   // marina pier
      { x: 3980, y: 2073, w: 430, h: 54 },   // south pier
    ],
    runway: { x: 120, y: 3120, w: 820, h: 120 },
    apron: { x: 120, y: 2820, w: 420, h: 300 },
    marinaLot: { x: 3560, y: 1420, w: 260, h: 260 },
    shells: [],
    landmarks: {},
  };

  // Landmarks the story and systems use, each a building plus a door point.
  const addLandmark = (key, x, y, w, h, floors, color, label) => {
    const b = { x, y, w, h, floors, color, roof: '#7a4a3a', kind: key, label };
    world.buildings.push(b);
    world.landmarks[key] = { x: x + w / 2, y: y + h + 26, building: b };
    return b;
  };
  addLandmark('rosa', 740, 660, 130, 95, 1, '#ffd9c0', "Rosa's House");
  addLandmark('hospital', 1480, 660, 250, 160, 4, '#eef4f6', 'Solmar General');
  addLandmark('cafe', 3440, 1330, 130, 90, 1, '#f9e2ae', 'Marina Café');
  addLandmark('garage', 2870, 1980, 210, 140, 2, '#c2e0f4', "Dex's Garage");
  addLandmark('hotel', 3700, 2440, 120, 210, 6, '#f6c6d8', 'Beach Hotel');
  world.landmarks.pierEnd = { x: 4360, y: 1560 };
  world.landmarks.apron = { x: 330, y: 2970 };
  world.landmarks.spawn = { x: 805, y: 830 };

  // Filler buildings, block by block between the roads.
  const xBlocks = [[24, 432], [528, 1152], [1248, 1872], [2016, 2592], [2736, 3312], [3408, 3800]];
  const yBlocks = [[24, 372], [468, 1032], [1128, 1692], [1788, 2352], [2448, 3012], [3108, 3576]];
  const reserved = world.buildings.map((b) => ({ x: b.x - 36, y: b.y - 36, w: b.w + 72, h: b.h + 72 }));
  const hitsReserved = (r) => reserved.some((s) => r.x < s.x + s.w && r.x + r.w > s.x && r.y < s.y + s.h && r.y + r.h > s.y);

  for (const [bx0, bx1] of xBlocks) {
    for (const [by0, by1] of yBlocks) {
      const shoreBlock = bx0 >= 3408;
      const airfieldBlock = bx1 < 1060 && by1 > 2760;
      if (airfieldBlock) continue;
      let cursorY = by0 + 14;
      while (cursorY < by1 - 70) {
        let cursorX = bx0 + 14;
        const rowH = rand(rng, 78, 128);
        while (cursorX < bx1 - 80) {
          const wanted = shoreBlock ? rand(rng, 74, 110) : rand(rng, 84, 178);
          const bw = Math.min(wanted, bx1 - cursorX - 10); // never spill onto the road
          if (bw < 52) { cursorX += 30; continue; }
          const bh = Math.min(rowH, by1 - cursorY - 10);
          const rect = { x: cursorX, y: cursorY, w: bw, h: bh };
          if (!hitsReserved(rect) && world.buildings.length < 232) {
            // Taller toward the downtown middle of the map.
            const dx = (rect.x + bw / 2 - 1900) / 1900;
            const dy = (rect.y + bh / 2 - 1750) / 1750;
            const central = Math.max(0, 1 - Math.hypot(dx, dy));
            const floors = shoreBlock ? randInt(rng, 1, 2) : Math.max(1, Math.round(1 + central * 9 + rand(rng, 0, 3)));
            world.buildings.push({
              x: rect.x, y: rect.y, w: bw, h: bh, floors,
              color: pick(rng, BUILDING_COLORS), roof: pick(rng, ROOF_COLORS), kind: 'block', label: '',
            });
          }
          cursorX += bw + rand(rng, 16, 40);
        }
        cursorY += rowH + rand(rng, 16, 36);
      }
    }
  }

  // Rosa's driveway: a clear corridor from her sedan's parking spot south
  // to the street, so the story's first drive can always get out.
  const driveway = { x: 726, y: 750, w: 108, h: 345 };
  world.buildings = world.buildings.filter((b) => {
    if (b.kind !== 'block') return true;
    const overlap = b.x < driveway.x + driveway.w && b.x + b.w > driveway.x
      && b.y < driveway.y + driveway.h && b.y + b.h > driveway.y;
    return !overlap;
  });

  // Palms along the beach and scattered through the grass.
  for (let i = 0; i < 46; i++) {
    world.palms.push({ x: rand(rng, BEACH_X + 30, OCEAN_X - 40), y: rand(rng, 60, WORLD_H - 60), s: rand(rng, 0.8, 1.3) });
  }
  for (let i = 0; i < 26; i++) {
    const x = rand(rng, 80, 3300), y = rand(rng, 80, 3400);
    if (groundKind(world, x, y) === 'grass') world.palms.push({ x, y, s: rand(rng, 0.7, 1.1) });
  }

  // Twenty shells scattered down the beach, the game's collectible.
  for (let i = 0; i < 20; i++) {
    world.shells.push({
      x: rand(rng, BEACH_X + 90, OCEAN_X - 60),
      y: 180 + i * 168 + rand(rng, -50, 50),
      taken: false,
    });
  }
  return world;
}

/** What the ground is at a point: water, sand, road, pier, runway, lot... */
export function groundKind(world, x, y) {
  for (const p of world.piers) {
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return 'pier';
  }
  if (x >= OCEAN_X) return 'water';
  const r = world.runway;
  if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return 'runway';
  const a = world.apron;
  if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return 'runway';
  const lot = world.marinaLot;
  if (x >= lot.x && x <= lot.x + lot.w && y >= lot.y && y <= lot.y + lot.h) return 'lot';
  for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_HALF) return 'road';
  if (x <= 3960) for (const sy of STREETS) if (Math.abs(y - sy) <= ROAD_HALF) return 'road';
  for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_HALF + 12) return 'sidewalk';
  if (x <= 3960) for (const sy of STREETS) if (Math.abs(y - sy) <= ROAD_HALF + 12) return 'sidewalk';
  if (x >= BEACH_X) return 'sand';
  return 'grass';
}

/** True when a car may drive on the ground at a point. */
export function drivable(world, x, y) {
  const g = groundKind(world, x, y);
  return g === 'road' || g === 'lot' || g === 'runway' || g === 'pier';
}

/**
 * Collide a circle against the city: building walls, the world edge and
 * the sea (piers are walkable platforms over the water). Returns
 * [nx, ny, hit] with the corrected position and whether anything was hit.
 */
export function collide(world, x, y, rad) {
  let hit = false;
  x = clamp(x, rad, world.w - rad);
  y = clamp(y, rad, world.h - rad);
  for (const b of world.buildings) {
    if (x + rad < b.x || x - rad > b.x + b.w || y + rad < b.y || y - rad > b.y + b.h) continue;
    const [nx, ny, h] = circleRectResolve(x, y, rad, b);
    x = nx; y = ny; hit = hit || h;
  }
  if (groundKind(world, x, y) === 'water') {
    // Not on a pier: the sea pushes you back to the shoreline.
    x = OCEAN_X - rad;
    hit = true;
  }
  return [x, y, hit];
}

/** A random point on a random road, for traffic and patrol spawns. */
export function randomRoadPoint(world, rng) {
  if (rng() < 0.5) {
    const ax = AVENUES[Math.floor(rng() * 5)]; // land avenues only
    return { x: ax, y: rand(rng, 80, WORLD_H - 80), vertical: true };
  }
  const sy = STREETS[Math.floor(rng() * STREETS.length)];
  return { x: rand(rng, 80, 3800), y: sy, vertical: false };
}
