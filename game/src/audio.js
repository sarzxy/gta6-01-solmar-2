// audio.js — SOLMAR's whole soundtrack is synthesised live with
// WebAudio: a soft pad that follows the day, an engine whose pitch climbs
// with speed, two-tone sirens that swell as patrol cars close in, and
// little blips for pickups, dialogue and cash. No audio files, no network.
// Outside a browser (the smoke test) every call is a safe no-op.

let ctx = null;
let master = null;
let engineOsc = null, engineGain = null;
let sirenOsc = null, sirenGain = null, sirenLfo = null;
let padTimer = 0;
let padStep = 0;

// Am — F — C — G, the sunniest progression in the book.
const PAD_CHORDS = [
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [130.81, 164.81, 196.0],
  [196.0, 246.94, 293.66],
];

function available() {
  return typeof window !== 'undefined' && (typeof AudioContext !== 'undefined' || typeof window.webkitAudioContext !== 'undefined');
}

/** Create the audio graph. Call from a user gesture (click / keypress). */
export function ensureAudio() {
  if (ctx || !available()) return !!ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();

    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 840;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenLfo = ctx.createOscillator();
    sirenLfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 130;
    sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
    sirenLfo.start();
    return true;
  } catch {
    ctx = null;
    return false;
  }
}

/** Per-frame: engine note from the player's car, sirens from the nearest
 *  patrol, and a pad chord every few seconds. */
export function updateAudio(state, dt) {
  if (!ctx) return;
  const p = state.player;
  if (engineGain && engineOsc) {
    const driving = p.inCar ? Math.abs(p.inCar.speed) : 0;
    engineOsc.frequency.value = 55 + driving * 0.55;
    engineGain.gain.value = p.inCar ? 0.05 + Math.min(0.08, driving / 3000) : 0;
  }
  if (sirenGain) {
    let nearest = Infinity;
    for (const cop of state.cops) {
      if (cop.type !== 'car') continue;
      const d = Math.hypot(cop.car.x - p.x, cop.car.y - p.y);
      if (d < nearest) nearest = d;
    }
    sirenGain.gain.value = nearest < 700 ? 0.028 * (1 - nearest / 700) : 0;
  }
  padTimer -= dt;
  if (padTimer <= 0) {
    padTimer = 4.2;
    playPadChord(PAD_CHORDS[padStep++ % PAD_CHORDS.length]);
  }
}

function playPadChord(freqs) {
  if (!ctx || !master) return;
  const now = ctx.currentTime;
  for (const f of freqs) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.035, now + 0.7);
    g.gain.linearRampToValueAtTime(0, now + 4.1);
    osc.connect(g).connect(master);
    osc.start(now);
    osc.stop(now + 4.2);
  }
}

function blip(freq, dur = 0.08, vol = 0.06, when = 0) {
  if (!ctx || !master) return;
  const now = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.connect(g).connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

export function pickupSound() { blip(880, 0.09); blip(1318, 0.12, 0.06, 0.07); }
export function cashSound() { blip(988, 0.08); blip(1319, 0.1, 0.06, 0.08); blip(1568, 0.14, 0.05, 0.16); }
export function dialogueSound() { blip(520, 0.05, 0.035); }
export function sirenSting() { blip(740, 0.16, 0.07); blip(587, 0.22, 0.07, 0.14); }
