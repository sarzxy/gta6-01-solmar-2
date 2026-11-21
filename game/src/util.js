// util.js — small shared helpers for SOLMAR: a seeded random generator,
// numeric helpers, angle maths and circle/rectangle collision resolution.
// Everything here is pure and runs the same in the browser and in Node.

export const TAU = Math.PI * 2;

/** mulberry32: a tiny deterministic PRNG, seeded per world. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random float in [min, max) from a generator made by mulberry32. */
export function rand(rng, min, max) { return min + rng() * (max - min); }

/** Random integer in [min, max] inclusive. */
export function randInt(rng, min, max) { return Math.floor(rand(rng, min, max + 1)); }

/** Pick one element of an array with the generator. */
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

export function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

export function lerp(a, b, t) { return a + (b - a) * t; }

/** Smooth 0..1 easing, used for camera and meter animations. */
export function smooth(t) { return t * t * (3 - 2 * t); }

export function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

export function dist2(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return dx * dx + dy * dy;
}

/** Shortest signed turn from angle a to angle b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Turn angle `a` toward `b` by at most `maxStep` radians. */
export function turnToward(a, b, maxStep) {
  const d = angleDelta(a, b);
  return a + clamp(d, -maxStep, maxStep);
}

export function pointInRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

/**
 * Push a circle at (x, y) with radius `rad` out of an axis-aligned rect.
 * Returns [nx, ny, hit] — the corrected centre and whether it overlapped.
 */
export function circleRectResolve(x, y, rad, r) {
  const cx = clamp(x, r.x, r.x + r.w);
  const cy = clamp(y, r.y, r.y + r.h);
  const dx = x - cx, dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > rad * rad) return [x, y, false];
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return [cx + (dx / d) * rad, cy + (dy / d) * rad, true];
  }
  // Centre is inside the rect: leave by the nearest face.
  const left = x - r.x, right = r.x + r.w - x, top = y - r.y, bottom = r.y + r.h - y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return [r.x - rad, y, true];
  if (m === right) return [r.x + r.w + rad, y, true];
  if (m === top) return [x, r.y - rad, true];
  return [x, r.y + r.h + rad, true];
}

/** Parse '#rrggbb' into [r, g, b]. */
export function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Blend two '#rrggbb' colours, t in [0, 1]; returns an rgb() string. */
export function mixHex(a, b, t) {
  const ca = hexRgb(a), cb = hexRgb(b);
  const r = Math.round(lerp(ca[0], cb[0], t));
  const g = Math.round(lerp(ca[1], cb[1], t));
  const bl = Math.round(lerp(ca[2], cb[2], t));
  return `rgb(${r},${g},${bl})`;
}

/** Format a whole number of dollars the way the HUD shows it: $1,250. */
export function money(n) {
  return '$' + Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
