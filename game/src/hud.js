// hud.js — everything drawn over the world: cash and clock, the wanted
// stars and health, the objective bar with its timer, toasts, the live
// minimap with police blips and the objective marker, dialogue boxes,
// context hints, and the title / pause / busted / wasted screens.

import { clamp, dist, money } from './util.js';
import { PALETTE, clockText } from './theme.js';
import { MISSIONS } from './missions.js';
import { nearestCar } from './player.js';

function panel(ctx, x, y, w, h, color = PALETTE.panel) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const r = 10;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function starPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function wrapLines(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? line + ' ' + word : word;
    if (ctx.measureText(trial).width > maxW && line) { lines.push(line); line = word; }
    else line = trial;
  }
  if (line) lines.push(line);
  return lines;
}

/** The full in-play HUD. */
export function drawHUD(ctx, state, w, h) {
  drawStatusPanel(ctx, state);
  drawWanted(ctx, state, w);
  drawObjectiveBar(ctx, state, w);
  drawToast(ctx, state, w);
  drawMinimap(ctx, state, w, h);
  drawHint(ctx, state, w, h);
  if (state.dialogue) drawDialogue(ctx, state, w, h);
}

function drawStatusPanel(ctx, state) {
  panel(ctx, 16, 16, 208, 74);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 21px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.cashGreen;
  ctx.fillText(money(state.cash), 30, 44);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#dfe9f2';
  ctx.fillText(`SHELLS ${state.shellsFound}/20`, 30, 66);
  ctx.fillText(clockText(state.dayT), 118, 66);
  if (state.storyDone) {
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText('STORY COMPLETE', 118, 44);
  }
}

function drawWanted(ctx, state, w) {
  const stars = state.wanted.stars;
  const heatFrac = clamp((state.wanted.heat % 110) / 110, 0, 1);
  for (let i = 0; i < 5; i++) {
    const cx = w - 34 - i * 40, cy = 38;
    starPath(ctx, cx, cy, 15);
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.fill();
    if (i < stars) {
      starPath(ctx, cx, cy, 15);
      ctx.fillStyle = PALETTE.gold;
      ctx.fill();
    } else if (i === stars && heatFrac > 0.05 && stars > 0) {
      ctx.save();
      starPath(ctx, cx, cy, 15);
      ctx.globalAlpha = heatFrac;
      ctx.fillStyle = PALETTE.gold;
      ctx.fill();
      ctx.restore();
    }
  }
  // Health bar under the stars.
  const bw = 196, bx = w - bw - 18, by = 62;
  ctx.fillStyle = 'rgba(10,16,24,0.55)';
  ctx.fillRect(bx, by, bw, 11);
  ctx.fillStyle = state.player.health > 30 ? '#69d66f' : PALETTE.danger;
  ctx.fillRect(bx + 2, by + 2, (bw - 4) * clamp(state.player.health / 100, 0, 1), 7);
  // Busted meter, when an officer has hands on the player.
  if (state.player.bustedMeter > 0.01) {
    ctx.fillStyle = 'rgba(10,16,24,0.55)';
    ctx.fillRect(bx, by + 18, bw, 11);
    ctx.fillStyle = '#ff9f2e';
    ctx.fillRect(bx + 2, by + 20, (bw - 4) * state.player.bustedMeter, 7);
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillStyle = '#ffb27a';
    ctx.textAlign = 'right';
    ctx.fillText('BUSTED…', w - 18, by + 46);
  }
}

function drawObjectiveBar(ctx, state, w) {
  const o = state.objective;
  if (!o || state.dialogue) return;
  const label = o.label.toUpperCase();
  ctx.font = 'bold 15px system-ui, sans-serif';
  const tw = ctx.measureText(label).width;
  const bw = Math.min(w - 480, tw + 90);
  const bx = (w - bw) / 2;
  panel(ctx, bx, 16, bw, 40, PALETTE.panelLight);
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.moveTo(bx + 18, 27); ctx.lineTo(bx + 30, 36); ctx.lineTo(bx + 18, 45);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(label, bx + 40, 42);
  const d = Math.round(dist(state.player.x, state.player.y, o.x, o.y) / 10);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#bcd3e6';
  ctx.textAlign = 'right';
  ctx.fillText(`${d} m`, bx + bw - 14, 42);
  // A mission timer drains under the bar.
  const timer = state.mission.timer;
  if (timer != null && o.mission) {
    const frac = clamp(timer / 95, 0, 1);
    ctx.fillStyle = 'rgba(10,16,24,0.5)';
    ctx.fillRect(bx, 60, bw, 6);
    ctx.fillStyle = timer < 15 ? PALETTE.danger : PALETTE.gold;
    ctx.fillRect(bx, 60, bw * frac, 6);
  }
}

function drawToast(ctx, state, w) {
  const t = state.toast;
  if (!t) return;
  const alpha = clamp(Math.min(t.t / 0.3, (t.life - t.t) / 0.6), 0, 1);
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = 'bold 16px system-ui, sans-serif';
  const tw = ctx.measureText(t.text).width;
  panel(ctx, (w - tw - 44) / 2, 76, tw + 44, 38, PALETTE.panelLight);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(t.text, w / 2, 101);
  ctx.restore();
}

function drawMinimap(ctx, state, w, h) {
  const mw = 200, mh = 152, x0 = 16, y0 = h - mh - 16;
  panel(ctx, x0, y0, mw, mh);
  const s = Math.min((mw - 14) / state.world.w, (mh - 26) / state.world.h);
  const ox = x0 + 7, oy = y0 + 19;
  const px = (wx) => ox + wx * s, py = (wy) => oy + wy * s;
  // Sea, beach, land.
  ctx.fillStyle = '#274b63';
  ctx.fillRect(ox, oy, state.world.w * s, state.world.h * s);
  ctx.fillStyle = '#3f7a44';
  ctx.fillRect(ox, oy, 4080 * s, state.world.h * s);
  ctx.fillStyle = '#d9c184';
  ctx.fillRect(px(3840), oy, (4080 - 3840) * s, state.world.h * s);
  // Roads.
  ctx.strokeStyle = 'rgba(230,236,240,0.75)';
  ctx.lineWidth = 1.6;
  for (const ax of [480, 1200, 1920, 2640, 3360, 3900]) {
    ctx.beginPath(); ctx.moveTo(px(ax), oy); ctx.lineTo(px(ax), oy + state.world.h * s); ctx.stroke();
  }
  for (const sy of [420, 1080, 1740, 2400, 3060]) {
    ctx.beginPath(); ctx.moveTo(ox, py(sy)); ctx.lineTo(px(3960), py(sy)); ctx.stroke();
  }
  // Shells still on the beach.
  ctx.fillStyle = 'rgba(255,244,224,0.8)';
  for (const shell of state.world.shells) if (!shell.taken) ctx.fillRect(px(shell.x) - 1, py(shell.y) - 1, 2, 2);
  // Objective.
  if (state.objective) {
    const o = state.objective;
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px(o.x), py(o.y), 5 + Math.sin(state.time * 5) * 1.6, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath(); ctx.arc(px(o.x), py(o.y), 2.6, 0, Math.PI * 2); ctx.fill();
  }
  // Police blips, flashing.
  const flash = Math.sin(state.time * 8) > 0;
  for (const cop of state.cops) {
    const cx = cop.type === 'car' ? cop.car.x : cop.x;
    const cy = cop.type === 'car' ? cop.car.y : cop.y;
    ctx.fillStyle = flash ? '#ff5040' : '#4d7dff';
    ctx.beginPath(); ctx.arc(px(cx), py(cy), 3, 0, Math.PI * 2); ctx.fill();
  }
  // The player, a white arrow on the facing.
  const p = state.player;
  ctx.save();
  ctx.translate(px(p.x), py(p.y));
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.fillStyle = '#9fb6c9';
  ctx.textAlign = 'left';
  ctx.fillText('SOLMAR', x0 + 9, y0 + 13);
}

function drawHint(ctx, state, w, h) {
  let hint = '';
  const p = state.player;
  if (p.inCar) hint = 'WASD DRIVE · E GET OUT';
  else {
    const car = nearestCar(state);
    let farePed = null;
    for (const ped of state.peds) {
      if (ped.wantsFare && ped.mode === 'hail' && dist(p.x, p.y, ped.x, ped.y) < 64) { farePed = ped; break; }
    }
    if (farePed && !state.fare) hint = 'E · TAKE THE FARE';
    else if (car) hint = car.owner === 'marlo' || car.enteredBefore ? 'E · GET IN' : 'E · TAKE THE CAR';
    else if (state.objective) hint = 'FOLLOW THE GOLD MARKER';
  }
  if (!hint) return;
  ctx.font = 'bold 13px system-ui, sans-serif';
  const tw = ctx.measureText(hint).width;
  panel(ctx, w - tw - 42, h - 52, tw + 26, 34, PALETTE.panelLight);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(hint, w - tw - 29, h - 30);
}

function drawDialogue(ctx, state, w, h) {
  const d = state.dialogue;
  const [speaker, text] = d.lines[d.idx];
  const bw = Math.min(760, w - 80), bh = 108;
  const bx = (w - bw) / 2, by = h - bh - 22;
  panel(ctx, bx, by, bw, bh);
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText(speaker.toUpperCase(), bx + 22, by + 28);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  const lines = wrapLines(ctx, text, bw - 44);
  lines.slice(0, 3).forEach((line, i) => ctx.fillText(line, bx + 22, by + 54 + i * 21));
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = '#9fb6c9';
  ctx.textAlign = 'right';
  ctx.fillText('ENTER ▸', bx + bw - 16, by + bh - 10);
}

// ------------------------------------------------------------ screens

export function drawTitle(ctx, state, w, h, hasSave) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(8,12,30,0.25)');
  grad.addColorStop(0.55, 'rgba(8,12,30,0.55)');
  grad.addColorStop(1, 'rgba(8,12,30,0.88)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  const titleGrad = ctx.createLinearGradient(0, h * 0.20, 0, h * 0.42);
  titleGrad.addColorStop(0, '#fff3b0');
  titleGrad.addColorStop(0.6, '#ffc93c');
  titleGrad.addColorStop(1, '#ff8c42');
  ctx.fillStyle = titleGrad;
  ctx.font = 'bold 118px system-ui, sans-serif';
  ctx.fillText('SOLMAR', w / 2, h * 0.40);
  ctx.font = '19px system-ui, sans-serif';
  ctx.fillStyle = '#eaf4ff';
  ctx.fillText('Marlo Reyes comes home to the city that never learned to behave.', w / 2, h * 0.40 + 42);
  ctx.font = 'bold 21px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('ENTER — NEW GAME', w / 2, h * 0.62);
  if (hasSave) {
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillStyle = '#bcd3e6';
    ctx.fillText('E — CONTINUE YOUR WEEK IN SOLMAR', w / 2, h * 0.62 + 32);
  }
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = '#9fb6c9';
  ctx.fillText('WASD / ARROWS — MOVE & DRIVE · SHIFT — RUN · E — ENTER CAR / TALK · ESC — PAUSE', w / 2, h * 0.80);
  ctx.fillText('TRAFFIC · POLICE · FIVE MISSIONS · TAXI FARES · 20 SHELLS · DAY & NIGHT', w / 2, h * 0.80 + 24);
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('AN ORIGINAL OPEN-WORLD CRIME GAME', w / 2, h - 22);
}

export function drawPause(ctx, state, w, h) {
  ctx.fillStyle = 'rgba(6,9,20,0.62)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('PAUSED', w / 2, h * 0.42);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = '#bcd3e6';
  const mission = MISSIONS[state.mission.idx];
  ctx.fillText(state.mission.complete ? 'THE CITY IS YOURS — FARES AND SHELLS REMAIN' : `NOW PLAYING: ${mission ? mission.title.toUpperCase() : ''}`, w / 2, h * 0.42 + 38);
  ctx.fillText('ESC — BACK TO THE CITY · E — SAVE GAME', w / 2, h * 0.42 + 68);
}

export function drawEndOverlay(ctx, state, w, h) {
  const info = state.endInfo ?? { kind: 'busted', fine: 0 };
  const busted = info.kind === 'busted';
  ctx.fillStyle = busted ? 'rgba(18,32,84,0.55)' : 'rgba(84,14,14,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.font = 'bold 92px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(busted ? 'BUSTED' : 'WASTED', w / 2, h * 0.46);
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillStyle = '#eaf4ff';
  ctx.fillText(busted ? `SOLMAR PD LET YOU GO FOR ${money(info.fine)}` : `SOLMAR GENERAL PATCHED YOU UP FOR ${money(info.fine)}`, w / 2, h * 0.46 + 44);
}
