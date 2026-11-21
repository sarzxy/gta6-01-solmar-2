// render.js — how SOLMAR looks: the whole city drawn with canvas paths,
// no images. Ground and water, roads with lane paint, pastel buildings
// with rooftops and long shadows, palms, piers, the runway, then cars,
// people and the player, and over it all the day/night light: golden-hour
// wash, night darkness, streetlight pools and headlight cones.

import { clamp, lerp } from './util.js';
import { PALETTE, darknessAt, goldenAt } from './theme.js';
import { AVENUES, STREETS, ROAD_HALF, BEACH_X, OCEAN_X } from './world.js';

export const VIEW_WORLD_W = 1180; // world units across the screen

function rect(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
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
}

function circle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** The whole scene for one frame: world, entities, light. */
export function drawScene(ctx, state, w, h) {
  const world = state.world;
  const scale = w / VIEW_WORLD_W;
  const viewH = h / scale;
  const cam = state.camera;
  const vx = cam.x - VIEW_WORLD_W / 2, vy = cam.y - viewH / 2;
  const vx2 = vx + VIEW_WORLD_W, vy2 = vy + viewH;
  const dark = darknessAt(state.dayT);
  const golden = goldenAt(state.dayT);

  rect(ctx, 0, 0, w, h, PALETTE.waterDeep);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-vx, -vy);

  drawGround(ctx, state, vx, vy, vx2, vy2);
  drawBuildings(ctx, state, vx, vy, vx2, vy2, dark);
  drawPalms(ctx, state, vx, vy, vx2, vy2);
  drawShells(ctx, state);
  drawObjectiveBeacon(ctx, state);
  for (const car of state.cars) drawCar(ctx, car, dark, state.time);
  for (const cop of state.cops) if (cop.type === 'car') drawCar(ctx, cop.car, dark, state.time, true);
  for (const ped of state.peds) drawPerson(ctx, ped.x, ped.y, ped.angle, ped, dark);
  for (const cop of state.cops) if (cop.type === 'foot') drawOfficer(ctx, cop, dark);
  if (!state.player.inCar) drawPlayer(ctx, state);
  drawShots(ctx, state);
  drawLighting(ctx, state, vx, vy, vx2, vy2, dark, golden);

  ctx.restore();
}

function drawGround(ctx, state, vx, vy, vx2, vy2) {
  const world = state.world;
  // The peninsula: grass to the beach, sand to the waterline, then sea.
  rect(ctx, Math.max(vx, -400), Math.max(vy, -400), Math.min(vx2, OCEAN_X) - Math.max(vx, -400), Math.min(vy2, world.h + 400) - Math.max(vy, -400), PALETTE.grass);
  // Grass texture: darker mow stripes.
  ctx.fillStyle = PALETTE.grassDark;
  for (let x = Math.floor(vx / 240) * 240; x < vx2; x += 480) ctx.fillRect(x, vy, 240, vy2 - vy);
  rect(ctx, BEACH_X, vy, OCEAN_X - BEACH_X, vy2 - vy, PALETTE.sand);
  rect(ctx, OCEAN_X - 26, vy, 26, vy2 - vy, PALETTE.sandWet);
  // Sea with a slow foam line and drifting wavelets.
  const seaGrad = ctx.createLinearGradient(OCEAN_X, 0, OCEAN_X + 700, 0);
  seaGrad.addColorStop(0, PALETTE.waterShallow);
  seaGrad.addColorStop(1, PALETTE.waterDeep);
  ctx.fillStyle = seaGrad;
  ctx.fillRect(OCEAN_X, vy, vx2 - OCEAN_X + 400, vy2 - vy);
  ctx.strokeStyle = PALETTE.waterFoam;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let y = Math.floor(vy / 46) * 46; y < vy2; y += 46) {
    const fx = OCEAN_X + 6 + Math.sin(state.time * 1.3 + y * 0.05) * 7;
    ctx.moveTo(fx, y);
    ctx.lineTo(fx + 26, y + 8);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 26; i++) {
    const wx = OCEAN_X + 90 + ((i * 337) % 560);
    const wy = ((i * 521) % 3400) + Math.sin(state.time * 0.7 + i) * 6;
    if (wy < vy - 30 || wy > vy2 + 30) continue;
    ctx.moveTo(wx, wy);
    ctx.lineTo(wx + 34, wy);
  }
  ctx.stroke();

  // Marina lot and airfield apron/runway.
  const lot = world.marinaLot;
  rect(ctx, lot.x, lot.y, lot.w, lot.h, '#55555f');
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(lot.x + 18 + i * 48, lot.y + 16); ctx.lineTo(lot.x + 18 + i * 48, lot.y + 70); ctx.stroke(); }
  const ap = world.apron, rw = world.runway;
  rect(ctx, ap.x, ap.y, ap.w, ap.h, '#6a6a72');
  rect(ctx, rw.x, rw.y, rw.w, rw.h, PALETTE.runway);
  ctx.fillStyle = PALETTE.runwayLine;
  for (let x = rw.x + 30; x < rw.x + rw.w - 30; x += 64) ctx.fillRect(x, rw.y + rw.h / 2 - 3, 36, 6);
  for (let i = 0; i < 4; i++) ctx.fillRect(rw.x + 8, rw.y + 12 + i * 26, 30, 9);

  // Piers: wooden decks on posts over the water.
  for (const pier of world.piers) {
    rect(ctx, pier.x, pier.y + 8, pier.w, pier.h, 'rgba(0,0,0,0.20)');
    rect(ctx, pier.x, pier.y, pier.w, pier.h, PALETTE.pierWood);
    ctx.strokeStyle = 'rgba(90,60,30,0.55)';
    ctx.lineWidth = 2;
    for (let x = pier.x + 26; x < pier.x + pier.w; x += 26) { ctx.beginPath(); ctx.moveTo(x, pier.y); ctx.lineTo(x, pier.y + pier.h); ctx.stroke(); }
    circle(ctx, pier.x + pier.w - 8, pier.y + pier.h / 2, 6, '#7a5230');
  }

  // Sidewalks first (a pale border), then the asphalt on top.
  for (const ax of AVENUES) {
    rect(ctx, ax - ROAD_HALF - 12, vy, (ROAD_HALF + 12) * 2, vy2 - vy, ax === 3900 ? PALETTE.boardwalk : PALETTE.sidewalk);
  }
  for (const sy of STREETS) {
    rect(ctx, vx, sy - ROAD_HALF - 12, Math.min(vx2, 3972) - vx, (ROAD_HALF + 12) * 2, PALETTE.sidewalk);
  }
  for (const ax of AVENUES) rect(ctx, ax - ROAD_HALF, vy, ROAD_HALF * 2, vy2 - vy, PALETTE.road);
  for (const sy of STREETS) rect(ctx, vx, sy - ROAD_HALF, Math.min(vx2, 3972) - vx, ROAD_HALF * 2, PALETTE.road);
  // Lane paint: dashed centre lines.
  ctx.fillStyle = PALETTE.laneLine;
  for (const ax of AVENUES) {
    if (ax === 3900) continue;
    for (let y = Math.floor(vy / 96) * 96; y < vy2; y += 96) ctx.fillRect(ax - 3, y, 6, 46);
  }
  for (const sy of STREETS) {
    for (let x = Math.floor(vx / 96) * 96; x < Math.min(vx2, 3948); x += 96) ctx.fillRect(x, sy - 3, 46, 6);
  }
}

function drawBuildings(ctx, state, vx, vy, vx2, vy2, dark) {
  for (const b of state.world.buildings) {
    if (b.x + b.w < vx - 60 || b.x > vx2 + 60 || b.y + b.h < vy - 60 || b.y > vy2 + 60) continue;
    const lift = b.floors * 1.6;
    rect(ctx, b.x + 8 + b.floors, b.y + 10 + b.floors, b.w, b.h, 'rgba(20,30,20,0.20)');
    rect(ctx, b.x, b.y, b.w, b.h, b.color);                       // walls
    rect(ctx, b.x, b.y + b.h - 7, b.w, 7, 'rgba(0,0,0,0.13)');    // shaded south face
    rect(ctx, b.x + 5, b.y - lift, b.w - 10, b.h - 5, b.roof);     // roof, lifted by height
    rect(ctx, b.x + 16, b.y - lift + 9, Math.min(26, b.w - 30), 16, 'rgba(255,255,255,0.20)'); // rooftop unit
    if (dark > 0.25) {
      // Lit windows along the facade once the city sleeps.
      ctx.fillStyle = `rgba(255,196,92,${0.75 * dark})`;
      const cols = Math.max(2, Math.floor(b.w / 26));
      for (let i = 0; i < cols; i++) {
        if ((i * 7 + b.floors * 3) % 3 === 0) ctx.fillRect(b.x + 8 + i * 24, b.y + b.h - 16, 7, 6);
      }
    }
    if (b.label) {
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10,16,24,0.85)';
      ctx.fillText(b.label.toUpperCase(), b.x + b.w / 2 + 1, b.y - lift - 7);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(b.label.toUpperCase(), b.x + b.w / 2, b.y - lift - 8);
    }
  }
}

function drawPalms(ctx, state, vx, vy, vx2, vy2) {
  for (const palm of state.world.palms) {
    if (palm.x < vx - 40 || palm.x > vx2 + 40 || palm.y < vy - 40 || palm.y > vy2 + 40) continue;
    const s = palm.s;
    ctx.strokeStyle = 'rgba(20,30,20,0.18)';
    ctx.lineWidth = 10 * s;
    ctx.beginPath(); ctx.moveTo(palm.x + 7, palm.y + 8); ctx.lineTo(palm.x + 12, palm.y + 12); ctx.stroke();
    ctx.strokeStyle = '#8a6642';
    ctx.lineWidth = 5 * s;
    ctx.beginPath(); ctx.moveTo(palm.x, palm.y); ctx.lineTo(palm.x - 4 * s, palm.y - 10 * s); ctx.stroke();
    ctx.strokeStyle = '#3f9e4d';
    ctx.lineWidth = 4 * s;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + palm.x;
      const tx = palm.x - 4 * s + Math.cos(a) * 17 * s;
      const ty = palm.y - 10 * s + Math.sin(a) * 9 * s + 5 * s;
      ctx.beginPath();
      ctx.moveTo(palm.x - 4 * s, palm.y - 10 * s);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
  }
}

function drawShells(ctx, state) {
  state.world.shells.forEach((shell, i) => {
    if (shell.taken) return;
    const pulse = 1 + Math.sin(state.time * 3 + i * 1.7) * 0.15;
    ctx.save();
    ctx.translate(shell.x, shell.y);
    ctx.scale(pulse, pulse);
    circle(ctx, 0, 0, 8, '#fff4e0');
    ctx.strokeStyle = '#e2a46b';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 5, 0.4, 4.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 2.4, 0.4, 4.6); ctx.stroke();
    ctx.restore();
  });
}

function drawObjectiveBeacon(ctx, state) {
  const o = state.objective;
  if (!o || state.dialogue) return;
  const pulse = 30 + Math.sin(state.time * 4) * 7;
  const grad = ctx.createLinearGradient(o.x, o.y - 300, o.x, o.y);
  grad.addColorStop(0, 'rgba(255,201,60,0)');
  grad.addColorStop(1, 'rgba(255,201,60,0.40)');
  ctx.fillStyle = grad;
  ctx.fillRect(o.x - 13, o.y - 300, 26, 300);
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(o.x, o.y, pulse, 0, Math.PI * 2); ctx.stroke();
  circle(ctx, o.x, o.y, 7, PALETTE.gold);
}

/** A car, drawn nose-first along +x in its local frame. */
export function drawCar(ctx, car, dark = 0, time = 0, isCop = false) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(10,14,10,0.28)';
  roundedRectPath(ctx, -36, -15 + 6, 76, 38, 10); ctx.fill();
  // Wheels.
  ctx.fillStyle = '#15181c';
  ctx.fillRect(-26, -22, 17, 7); ctx.fillRect(12, -22, 17, 7);
  ctx.fillRect(-26, 15, 17, 7); ctx.fillRect(12, 15, 17, 7);
  // Body.
  ctx.fillStyle = car.color;
  roundedRectPath(ctx, -40, -19, 80, 38, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.30)';
  ctx.lineWidth = 2;
  roundedRectPath(ctx, -40, -19, 80, 38, 10); ctx.stroke();
  if (isCop) {
    rect(ctx, -14, -19, 26, 38, PALETTE.copBlue);
    const flash = Math.sin((car.lightPhase ?? 0)) > 0;
    rect(ctx, -8, -11, 14, 9, flash ? '#ff3b30' : '#7a1610');
    rect(ctx, -8, 2, 14, 9, flash ? '#1c4fd8' : '#ff3b30');
  }
  if (car.mission === 'coupe') {
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    roundedRectPath(ctx, -40, -19, 80, 38, 10); ctx.stroke();
  }
  // Cabin glass and windshield shine.
  rect(ctx, -14, -15, 30, 30, '#22303c');
  rect(ctx, 12, -15, 6, 30, 'rgba(190,230,255,0.55)');
  rect(ctx, -20, -15, 5, 30, 'rgba(190,230,255,0.30)');
  // Lights.
  circle(ctx, 40, -12, 3.4, '#fff6cf');
  circle(ctx, 40, 12, 3.4, '#fff6cf');
  circle(ctx, -40, -12, 3, '#ff5040');
  circle(ctx, -40, 12, 3, '#ff5040');
  if (car.damage > 55) {
    ctx.fillStyle = 'rgba(40,40,40,0.35)';
    ctx.beginPath(); ctx.arc(30, -6, 8 + (car.damage - 55) * 0.1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Headlight cones live outside the rotation restore so the lighting
  // pass can also reach them; drawn here, still in world space.
  if (dark > 0.25 && Math.abs(car.speed) > 4) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const cone = ctx.createLinearGradient(38, 0, 190, 0);
    cone.addColorStop(0, `rgba(255,240,180,${0.30 * dark})`);
    cone.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(38, -13); ctx.lineTo(190, -34); ctx.lineTo(190, 34); ctx.lineTo(38, 13);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

/** A walking figure: legs, shirt, head. opts come from the ped itself. */
export function drawPerson(ctx, x, y, angle, fig, dark = 0) {
  ctx.save();
  ctx.translate(x, y);
  circle(ctx, 1, 3, 9, 'rgba(10,14,10,0.22)');
  if (fig.mode === 'down') {
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = fig.color;
    roundedRectPath(ctx, -7, -13, 14, 26, 6); ctx.fill();
    circle(ctx, 0, -18, 6.5, fig.skin);
    ctx.restore();
    return;
  }
  const stride = fig.speed > 4 ? Math.sin(fig.walkPhase ?? fig.wavePhase ?? 0) * 6 : 0;
  ctx.rotate(angle);
  ctx.strokeStyle = '#2c3440';
  ctx.lineWidth = 4.4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-4 - stride * 0.4, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-4 + stride * 0.4, -7); ctx.stroke();
  ctx.fillStyle = fig.color;
  roundedRectPath(ctx, -8, -7.5, 16, 15, 6); ctx.fill();
  if (fig.mode === 'hail') {
    ctx.strokeStyle = fig.skin;
    ctx.lineWidth = 3.6;
    const wave = Math.sin(fig.wavePhase) * 3;
    ctx.beginPath(); ctx.moveTo(5, -5); ctx.lineTo(13, -13 + wave); ctx.stroke();
  }
  circle(ctx, 2.5, 0, 6.4, fig.skin);
  ctx.restore();
}

function drawOfficer(ctx, cop, dark) {
  ctx.save();
  ctx.translate(cop.x, cop.y);
  circle(ctx, 1, 3, 9, 'rgba(10,14,10,0.22)');
  ctx.rotate(cop.angle);
  const stride = Math.sin(cop.walkPhase) * 6;
  ctx.strokeStyle = '#1c2733';
  ctx.lineWidth = 4.4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-4 - stride * 0.4, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-4 + stride * 0.4, -7); ctx.stroke();
  ctx.fillStyle = PALETTE.copBlue;
  roundedRectPath(ctx, -8, -7.5, 16, 15, 6); ctx.fill();
  circle(ctx, 2.5, 0, 6.4, '#e0ac69');
  ctx.fillStyle = '#16283f';
  ctx.beginPath(); ctx.arc(3.5, 0, 6, Math.PI * 0.9, Math.PI * 2.1); ctx.fill(); // cap
  ctx.restore();
}

function drawPlayer(ctx, state) {
  const p = state.player;
  drawPerson(ctx, p.x, p.y, p.angle, {
    color: PALETTE.playerShirt, skin: PALETTE.playerSkin,
    mode: 'walk', speed: p.speed, walkPhase: p.walkPhase,
  });
  // A soft ring so Marlo reads at a glance in a crowd.
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(p.x, p.y, 15 + Math.sin(state.time * 4) * 1.2, 0, Math.PI * 2); ctx.stroke();
}

function drawShots(ctx, state) {
  for (const s of state.shots) {
    ctx.strokeStyle = `rgba(255,214,110,${clamp(s.life / 0.09, 0, 1)})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
  }
}

function drawLighting(ctx, state, vx, vy, vx2, vy2, dark, golden) {
  if (golden > 0.03) rect(ctx, vx, vy, vx2 - vx, vy2 - vy, `rgba(255,138,54,${golden * 0.10})`);
  if (dark <= 0.02) return;
  rect(ctx, vx, vy, vx2 - vx, vy2 - vy, `rgba(9,13,42,${dark * 0.52})`);
  // Streetlight pools along the avenues and streets.
  for (const ax of AVENUES) {
    for (let y = Math.floor(vy / 300) * 300; y < vy2; y += 300) lightPool(ctx, ax + 52, y, 95, dark);
  }
  for (const sy of STREETS) {
    for (let x = Math.floor(vx / 300) * 300; x < Math.min(vx2, 3900); x += 300) lightPool(ctx, x, sy + 52, 95, dark);
  }
  // Police lightbars wash the street red and blue.
  for (const cop of state.cops) {
    if (cop.type !== 'car') continue;
    const flash = Math.sin(cop.car.lightPhase ?? 0) > 0;
    const g = ctx.createRadialGradient(cop.car.x, cop.car.y, 4, cop.car.x, cop.car.y, 120);
    g.addColorStop(0, flash ? `rgba(255,60,50,${0.30 * dark})` : `rgba(60,110,255,${0.30 * dark})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cop.car.x, cop.car.y, 120, 0, Math.PI * 2); ctx.fill();
  }
}

function lightPool(ctx, x, y, r, dark) {
  const g = ctx.createRadialGradient(x, y, 4, x, y, r);
  g.addColorStop(0, `rgba(255,196,96,${0.20 * dark})`);
  g.addColorStop(1, 'rgba(255,196,96,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

export { lerp };
