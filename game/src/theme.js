// theme.js — SOLMAR's look: a pastel, sun-soaked coastal palette, the car
// and building colour sets, and the day/night sky model the renderer and
// the lighting overlay share. dayT is the time of day in [0, 1):
// 0.00 dawn, 0.25 mid-morning, 0.50 golden afternoon, 0.68 sunset,
// 0.80 midnight, and back to dawn.

import { clamp, lerp, mixHex } from './util.js';

export const PALETTE = {
  grass: '#79c25f',
  grassDark: '#63ab4c',
  sand: '#f4e0ac',
  sandWet: '#e8cd8d',
  waterShallow: '#45b3cf',
  waterDeep: '#1c6ea3',
  waterFoam: '#d9f6ff',
  road: '#454550',
  roadEdge: '#33333c',
  laneLine: '#f6d365',
  sidewalk: '#d5d9da',
  boardwalk: '#c9a06c',
  pierWood: '#a67c52',
  runway: '#3c3c44',
  runwayLine: '#f2f2f2',
  playerShirt: '#ff5d47',
  playerPants: '#274156',
  playerSkin: '#c98a5e',
  copBlue: '#274b9f',
  copCar: '#eef1f4',
  gold: '#ffc93c',
  danger: '#ff4747',
  cashGreen: '#7ddb6a',
  panel: 'rgba(12,18,28,0.72)',
  panelLight: 'rgba(12,18,28,0.45)',
  text: '#ffffff',
};

/** Building facades: pastel towers and stucco fronts, Leonida-style. */
export const BUILDING_COLORS = [
  '#ffd9c0', '#ffb7a5', '#f9e2ae', '#cfe8c9', '#bfe3ea', '#f6c6d8',
  '#e8def8', '#fff3d6', '#ffd1dc', '#c2e0f4', '#fbe8b8', '#d8f3dc',
];

/** Flat colours for roofs, darker companions to the facades. */
export const ROOF_COLORS = ['#b5654d', '#8d6e63', '#a1887f', '#78909c', '#93705a', '#6d8ea0'];

/** The paint jobs traffic and parked cars wear. */
export const CAR_COLORS = [
  '#e74c3c', '#f39c12', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db',
  '#9b59b6', '#ecf0f1', '#95a5a6', '#fd79a8', '#00cec9', '#e17055',
];

/** Pedestrian shirt colours. */
export const PED_COLORS = ['#ff8fab', '#ffd166', '#06d6a0', '#118ab2', '#ef8354', '#c8b6ff', '#f4f1de', '#81b29a'];

// Sky keyframes across the day: [dayT, topColour, horizonColour].
const SKY_KEYS = [
  [0.00, '#7fb2e0', '#ffd9a0'],
  [0.25, '#5fb2ef', '#bfe8ff'],
  [0.50, '#4aa3e8', '#ffe3ae'],
  [0.66, '#5a6fc0', '#ff9e64'],
  [0.75, '#1d2a52', '#58406e'],
  [0.85, '#0b1026', '#1c2a4a'],
  [0.95, '#27335e', '#c96f4a'],
  [1.00, '#7fb2e0', '#ffd9a0'],
];

/** The sky gradient stops for a time of day: { top, horizon }. */
export function skyAt(dayT) {
  const t = ((dayT % 1) + 1) % 1;
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    const [t0, top0, hor0] = SKY_KEYS[i];
    const [t1, top1, hor1] = SKY_KEYS[i + 1];
    if (t >= t0 && t <= t1) {
      const k = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return { top: mixHex(top0, top1, k), horizon: mixHex(hor0, hor1, k) };
    }
  }
  return { top: SKY_KEYS[0][1], horizon: SKY_KEYS[0][2] };
}

/** How dark the world is at dayT: 0 in full day, 1 at deep night. */
export function darknessAt(dayT) {
  const t = ((dayT % 1) + 1) % 1;
  if (t < 0.60) return 0;
  if (t < 0.72) return lerp(0, 1, (t - 0.60) / 0.12);
  if (t < 0.92) return 1;
  if (t < 1.00) return lerp(1, 0, (t - 0.92) / 0.08);
  return 0;
}

/** A readable clock for the HUD: dayT 0.0 is 06:00. */
export function clockText(dayT) {
  const mins = Math.floor((((dayT % 1) + 1) % 1) * 1440 + 360) % 1440;
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Warm tint strength at golden hour, for the renderer's light wash. */
export function goldenAt(dayT) {
  const t = ((dayT % 1) + 1) % 1;
  const d = Math.min(Math.abs(t - 0.64), Math.abs(t - 0.02));
  return clamp(1 - d / 0.10, 0, 1);
}
