// raster.js — a small software Canvas2D for Node, just big enough to run
// SOLMAR's own renderer (game/src/render.js + hud.js) headlessly and save
// the frames as PNG screenshots. It implements the exact subset of the
// canvas API the game uses: transforms, paths, arcs, gradients, thick
// strokes, and text (drawn with the 5x7 pixel font in font5x7.js).
// Nothing here is a browser; every pixel is computed in plain JavaScript.

import { deflateSync } from 'node:zlib';
import { GLYPHS, plainText } from './font5x7.js';

const NAMED = {
  white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0],
  red: [255, 0, 0, 1], blue: [0, 0, 255, 1],
};

export function parseColor(style) {
  if (typeof style !== 'string') return null;
  const s = style.trim().toLowerCase();
  if (NAMED[s]) return NAMED[s];
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(',').map((v) => parseFloat(v));
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
  }
  return [0, 0, 0, 1];
}

function matMul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

class Gradient {
  constructor(kind, coords) {
    this.kind = kind;
    this.coords = coords; // device space
    this.stops = [];
  }
  addColorStop(offset, color) {
    this.stops.push([offset, parseColor(color)]);
    this.stops.sort((a, b) => a[0] - b[0]);
  }
  shade(x, y) {
    const c = this.coords;
    let t;
    if (this.kind === 'linear') {
      const dx = c.x1 - c.x0, dy = c.y1 - c.y0;
      const len2 = dx * dx + dy * dy || 1;
      t = ((x - c.x0) * dx + (y - c.y0) * dy) / len2;
    } else {
      const d = Math.hypot(x - c.x, y - c.y);
      t = (d - c.r0) / Math.max(1, c.r1 - c.r0);
    }
    t = Math.min(1, Math.max(0, t));
    const stops = this.stops;
    if (!stops.length) return [0, 0, 0, 1];
    if (t <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [o0, c0] = stops[i - 1], [o1, c1] = stops[i];
        const k = o1 === o0 ? 0 : (t - o0) / (o1 - o0);
        return [
          c0[0] + (c1[0] - c0[0]) * k,
          c0[1] + (c1[1] - c0[1]) * k,
          c0[2] + (c1[2] - c0[2]) * k,
          c0[3] + (c1[3] - c0[3]) * k,
        ];
      }
    }
    return stops[stops.length - 1][1];
  }
}

export class RasterContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
    this.m = [1, 0, 0, 1, 0, 0];
    this.stack = [];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.globalAlpha = 1;
    this.font = '10px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.path = []; // subpaths: { pts: [[x,y]...], closed: bool }
  }

  // ---------------------------------------------------------- transforms
  save() {
    this.stack.push({
      m: [...this.m], fillStyle: this.fillStyle, strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth, globalAlpha: this.globalAlpha,
      font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline,
    });
  }
  restore() {
    const s = this.stack.pop();
    if (s) Object.assign(this, s);
  }
  translate(x, y) { this.m = matMul(this.m, [1, 0, 0, 1, x, y]); }
  rotate(a) { const c = Math.cos(a), s = Math.sin(a); this.m = matMul(this.m, [c, s, -s, c, 0, 0]); }
  scale(x, y) { this.m = matMul(this.m, [x, 0, 0, y, 0, 0]); }
  applyPt(x, y) {
    const m = this.m;
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }
  scaleMag() { return Math.hypot(this.m[0], this.m[1]) || 1; }

  // ---------------------------------------------------------- gradients
  createLinearGradient(x0, y0, x1, y1) {
    const [ax, ay] = this.applyPt(x0, y0);
    const [bx, by] = this.applyPt(x1, y1);
    return new Gradient('linear', { x0: ax, y0: ay, x1: bx, y1: by });
  }
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    const [cx, cy] = this.applyPt(x0, y0);
    const s = this.scaleMag();
    return new Gradient('radial', { x: cx, y: cy, r0: r0 * s, r1: r1 * s });
  }

  // ---------------------------------------------------------- painting
  paintOf(style) {
    if (style instanceof Gradient) return { grad: style };
    return { solid: parseColor(style) };
  }

  blend(px, py, r, g, b, a) {
    if (a <= 0 || px < 0 || py < 0 || px >= this.canvas.width || py >= this.canvas.height) return;
    const i = (py * this.canvas.width + px) * 4;
    const d = this.data;
    const da = d[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    d[i] = (r * a + d[i] * da * (1 - a)) / oa;
    d[i + 1] = (g * a + d[i + 1] * da * (1 - a)) / oa;
    d[i + 2] = (b * a + d[i + 2] * da * (1 - a)) / oa;
    d[i + 3] = oa * 255;
  }

  fillSpan(y, x0, x1, paint) {
    const w = this.canvas.width;
    x0 = Math.max(0, Math.floor(x0));
    x1 = Math.min(w - 1, Math.ceil(x1));
    if (x1 < x0 || y < 0 || y >= this.canvas.height) return;
    if (paint.solid) {
      const [r, g, b, a0] = paint.solid;
      const a = a0 * this.globalAlpha;
      for (let x = x0; x <= x1; x++) this.blend(x, y, r, g, b, a);
    } else {
      for (let x = x0; x <= x1; x++) {
        const [r, g, b, a0] = paint.grad.shade(x + 0.5, y + 0.5);
        this.blend(x, y, r, g, b, a0 * this.globalAlpha);
      }
    }
  }

  /** Scanline even-odd fill of a list of polygons (device space). */
  fillPolygons(polys, paint) {
    let minY = Infinity, maxY = -Infinity;
    for (const poly of polys) for (const [, y] of poly) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
    if (!isFinite(minY)) return;
    const yStart = Math.max(0, Math.floor(minY));
    const yEnd = Math.min(this.canvas.height - 1, Math.ceil(maxY));
    for (let y = yStart; y <= yEnd; y++) {
      const yc = y + 0.5;
      const xs = [];
      for (const poly of polys) {
        for (let i = 0; i < poly.length; i++) {
          const [x1, y1] = poly[i];
          const [x2, y2] = poly[(i + 1) % poly.length];
          if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) {
            xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
          }
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) this.fillSpan(y, xs[i], xs[i + 1], paint);
    }
  }

  fillRect(x, y, w, h) {
    const pts = [
      this.applyPt(x, y), this.applyPt(x + w, y),
      this.applyPt(x + w, y + h), this.applyPt(x, y + h),
    ];
    this.fillPolygons([pts], this.paintOf(this.fillStyle));
  }

  strokeRect(x, y, w, h) {
    const saved = this.path;
    this.path = [{ pts: [this.applyPt(x, y), this.applyPt(x + w, y), this.applyPt(x + w, y + h), this.applyPt(x, y + h)], closed: true }];
    this.stroke();
    this.path = saved;
  }

  // ---------------------------------------------------------- paths
  beginPath() { this.path = []; }
  currentSub() {
    if (!this.path.length) this.path.push({ pts: [], closed: false });
    return this.path[this.path.length - 1];
  }
  moveTo(x, y) { this.path.push({ pts: [this.applyPt(x, y)], closed: false }); }
  lineTo(x, y) { this.currentSub().pts.push(this.applyPt(x, y)); }
  closePath() { this.currentSub().closed = true; }
  quadraticCurveTo(cx, cy, x, y) {
    const sub = this.currentSub();
    const [sx, sy] = sub.pts[sub.pts.length - 1] ?? this.applyPt(cx, cy);
    const [qx, qy] = this.applyPt(cx, cy);
    const [ex, ey] = this.applyPt(x, y);
    for (let i = 1; i <= 10; i++) {
      const t = i / 10, u = 1 - t;
      sub.pts.push([u * u * sx + 2 * u * t * qx + t * t * ex, u * u * sy + 2 * u * t * qy + t * t * ey]);
    }
  }
  arc(x, y, r, start, end, anticlockwise = false) {
    let sweep = end - start;
    if (!anticlockwise && sweep < 0) sweep += Math.PI * 2;
    if (anticlockwise && sweep > 0) sweep -= Math.PI * 2;
    const steps = Math.max(6, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
    const sub = this.currentSub();
    for (let i = 0; i <= steps; i++) {
      const a = start + (sweep * i) / steps;
      const pt = this.applyPt(x + Math.cos(a) * r, y + Math.sin(a) * r);
      if (i === 0 && sub.pts.length === 0) sub.pts.push(pt);
      else sub.pts.push(pt);
    }
  }
  fill() {
    const polys = this.path.filter((s) => s.pts.length > 1).map((s) => s.pts);
    this.fillPolygons(polys, this.paintOf(this.fillStyle));
  }
  stroke() {
    const paint = this.paintOf(this.strokeStyle);
    const hw = (this.lineWidth * this.scaleMag()) / 2;
    const polys = [];
    for (const sub of this.path) {
      const pts = sub.pts;
      const n = sub.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < n; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * hw, ny = (dx / len) * hw;
        polys.push([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]]);
        for (const [vx, vy] of [[x1, y1], [x2, y2]]) {
          const disc = [];
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * Math.PI * 2;
            disc.push([vx + Math.cos(a) * hw, vy + Math.sin(a) * hw]);
          }
          polys.push(disc);
        }
      }
    }
    this.fillPolygons(polys, paint);
  }

  // ---------------------------------------------------------- text
  fontSize() {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
    return m ? parseFloat(m[1]) : 10;
  }
  measureText(text) {
    return { width: String(text).length * 6 * (this.fontSize() / 7) };
  }
  fillText(text, x, y) {
    const str = plainText(text);
    const size = this.fontSize();
    const s = this.scaleMag();
    const unit = (size / 7) * s;
    const [ox, oy] = this.applyPt(x, y);
    let startX = ox;
    const totalW = str.length * 6 * unit - unit;
    if (this.textAlign === 'center') startX = ox - totalW / 2;
    else if (this.textAlign === 'right' || this.textAlign === 'end') startX = ox - totalW;
    let top = oy - 6 * unit;
    if (this.textBaseline === 'middle') top = oy - 3.5 * unit;
    else if (this.textBaseline === 'top' || this.textBaseline === 'hanging') top = oy;
    else if (this.textBaseline === 'bottom') top = oy - 7 * unit;
    const paint = this.paintOf(this.fillStyle);
    const cell = Math.max(1, unit * 1.04);
    for (let ci = 0; ci < str.length; ci++) {
      const glyph = GLYPHS[str[ci]] ?? GLYPHS[' '];
      const gx = startX + ci * 6 * unit;
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (glyph[row][col] !== '1') continue;
          const bx = Math.round(gx + col * unit);
          const by = Math.round(top + row * unit);
          if (paint.solid) {
            const [r, g, b, a0] = paint.solid;
            const a = a0 * this.globalAlpha;
            for (let yy = 0; yy < cell; yy++) for (let xx = 0; xx < cell; xx++) this.blend(bx + xx, by + yy, r, g, b, a);
          } else {
            const [r, g, b, a0] = paint.grad.shade(bx + cell / 2, by + cell / 2);
            const a = a0 * this.globalAlpha;
            for (let yy = 0; yy < cell; yy++) for (let xx = 0; xx < cell; xx++) this.blend(bx + xx, by + yy, r, g, b, a);
          }
        }
      }
    }
  }
}

export class RasterCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this._ctx = new RasterContext(this);
  }
  getContext(kind) { return kind === '2d' ? this._ctx : null; }
}

// ---------------------------------------------------------- PNG writer

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Encode an RGBA pixel buffer as a PNG, choosing a filter per row. */
export function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  const prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = rgba.subarray(y * stride, (y + 1) * stride);
    let best = null;
    for (const filter of [0, 1, 2, 4]) {
      const out = new Uint8Array(stride);
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? row[i - 4] : 0;
        const b = prev[i];
        const c = i >= 4 ? prev[i - 4] : 0;
        let pred = 0;
        if (filter === 1) pred = a;
        else if (filter === 2) pred = b;
        else if (filter === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const v = (row[i] - pred) & 0xff;
        out[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (!best || score < best.score) best = { filter, out, score };
    }
    const off = y * (stride + 1);
    raw[off] = best.filter;
    raw.set(best.out, off + 1);
    prev.set(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type RGBA
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
