// Generates a placeholder sprite set for the lizard kind so the sprite
// pipeline (atlas + manifest + tinting + per-slot fallback) can be run
// end to end before real art exists. Pure JS rasteriser, no dependencies.
import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'parts');
mkdirSync(out, { recursive: true });

const UNIT = 128; // atlas pixels per body unit

// --- tiny raster canvas -----------------------------------------------------
class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8Array(w * h * 4); }
  px(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const da = this.d[i + 3] / 255; const sa = a / 255;
    const oa = sa + da * (1 - sa);
    if (oa === 0) return;
    this.d[i] = (r * sa + this.d[i] * da * (1 - sa)) / oa;
    this.d[i + 1] = (g * sa + this.d[i + 1] * da * (1 - sa)) / oa;
    this.d[i + 2] = (b * sa + this.d[i + 2] * da * (1 - sa)) / oa;
    this.d[i + 3] = oa * 255;
  }
  ellipse(cx, cy, rx, ry, c, a = 255) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.px(x, y, c[0], c[1], c[2], a);
    }
  }
  tri(x1, y1, x2, y2, x3, y3, c, a = 255) {
    const minX = Math.floor(Math.min(x1, x2, x3)), maxX = Math.ceil(Math.max(x1, x2, x3));
    const minY = Math.floor(Math.min(y1, y2, y3)), maxY = Math.ceil(Math.max(y1, y2, y3));
    const s = (ax, ay, bx, by, px, py) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const d1 = s(x1, y1, x2, y2, px, py), d2 = s(x2, y2, x3, y3, px, py), d3 = s(x3, y3, x1, y1, px, py);
      const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) this.px(x, y, c[0], c[1], c[2], a);
    }
  }
  rect(x0, y0, w, h, c, a = 255) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.px(x, y, c[0], c[1], c[2], a); }
  blit(src, x0, y0) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4; if (src.d[i + 3] === 0) continue;
      this.px(x0 + x, y0 + y, src.d[i], src.d[i + 1], src.d[i + 2], src.d[i + 3]);
    }
  }
}

// --- PNG encoder (RGBA) ---------------------------------------------------------
function crc32(buf) {
  let c; const table = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  let crc = 0xffffffff; for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(canvas) {
  const raw = Buffer.alloc((canvas.w * 4 + 1) * canvas.h);
  for (let y = 0; y < canvas.h; y++) { raw[y * (canvas.w * 4 + 1)] = 0; Buffer.from(canvas.d.buffer, y * canvas.w * 4, canvas.w * 4).copy(raw, y * (canvas.w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(canvas.w, 0); ihdr.writeUInt32BE(canvas.h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// --- placeholder lizard parts, in grays so the game can tint them ----------------
const BASE = [214, 214, 214], DARK = [160, 160, 160], LIGHT = [240, 240, 240];
const EYE_W = [255, 255, 255], EYE_D = [31, 58, 104], BELLY = [250, 246, 235];
const u = UNIT;

function body(grown) {
  // grown: 2.0 x 2.6 u body with a head 0.9u radius; baby: rounder, bigger head.
  const bw = (grown ? 2.0 : 2.0) * u, bh = (grown ? 2.6 : 2.0) * u, hr = (grown ? 0.85 : 1.0) * u;
  const W = Math.ceil(bw * 1.4), H = Math.ceil(bh + hr * 2.6);
  const cx = W / 2, cy = H - bh / 2 - u * 0.4; // body centre
  const base = new Canvas(W, H), detail = new Canvas(W, H);
  // legs
  base.ellipse(cx - bw * 0.3, cy + bh / 2, u * 0.36, u * 0.36, DARK);
  base.ellipse(cx + bw * 0.3, cy + bh / 2, u * 0.36, u * 0.36, DARK);
  // body two-tone
  base.ellipse(cx, cy, bw / 2, bh / 2, DARK);
  base.ellipse(cx - bw * 0.03, cy - bh * 0.05, bw * 0.46, bh * 0.45, BASE);
  base.ellipse(cx - bw * 0.15, cy - bh * 0.25, bw * 0.2, bh * 0.14, LIGHT, 140);
  // head
  const hx = cx + bw * 0.12, hy = cy - bh / 2 - hr * 0.4;
  base.ellipse(hx, hy, hr, hr, DARK);
  base.ellipse(hx - hr * 0.06, hy - hr * 0.08, hr * 0.92, hr * 0.92, BASE);
  base.ellipse(hx + hr * 0.6, hy + hr * 0.25, hr * 0.5, hr * 0.32, BASE);
  // detail: belly, eye, mouth
  detail.ellipse(cx + bw * 0.05, cy + bh * 0.15, bw * 0.27, bh * 0.27, BELLY);
  const ex = hx + hr * 0.22, ey = hy - hr * 0.22, er = hr * 0.36;
  detail.ellipse(ex, ey, er, er, EYE_W);
  detail.ellipse(ex + er * 0.2, ey + er * 0.05, er * 0.58, er * 0.58, EYE_D);
  detail.ellipse(ex + er * 0.35, ey - er * 0.25, er * 0.22, er * 0.22, EYE_W);
  detail.rect(Math.round(hx + hr * 0.4), Math.round(hy + hr * 0.5), Math.round(hr * 0.6), Math.max(2, Math.round(hr * 0.08)), EYE_D);
  return { base, detail, pivot: [cx / W, cy / H], size: [bw / u, bh / u], head: [(hx - cx) / u, (hy - cy) / u] };
}

function tailLong() {
  const W = Math.ceil(u * 1.9), H = Math.ceil(u * 0.9);
  const c = new Canvas(W, H);
  c.tri(W - 1, H * 0.1, W - 1, H * 0.9, 2, H * 0.95, BASE);
  c.tri(W - 1, H * 0.1, W - 1, H * 0.5, W * 0.3, H * 0.6, LIGHT, 120);
  return { c, pivot: [1, 0.45] };
}
function tailStub() {
  const W = Math.ceil(u * 0.9), H = Math.ceil(u * 0.7);
  const c = new Canvas(W, H);
  c.ellipse(W * 0.45, H / 2, W * 0.42, H * 0.42, BASE);
  return { c, pivot: [0.9, 0.5] };
}
function spike() {
  const W = Math.ceil(u * 0.7), H = Math.ceil(u * 1.1);
  const c = new Canvas(W, H);
  c.tri(2, H - 1, W - 2, H - 1, W / 2 + 4, 2, DARK);
  c.tri(2, H - 1, W / 2 + 4, 2, W * 0.4, H * 0.85, LIGHT);
  c.tri(W * 0.15, H * 0.9, W / 2, H * 0.15, W * 0.35, H * 0.65, [255, 255, 255], 120);
  return { c, pivot: [0.5, 1] };
}
function faceVillain() {
  const hr = 0.85 * u;
  const W = Math.ceil(hr * 2), H = Math.ceil(hr * 2);
  const c = new Canvas(W, H);
  const ex = W / 2 + hr * 0.22, ey = H / 2 - hr * 0.22, R = hr * 0.42;
  c.ellipse(ex, ey, R * 1.05, R * 0.5, [255, 243, 243]);
  c.ellipse(ex + R * 0.25, ey, R * 0.42, R * 0.42, [255, 23, 68]);
  c.tri(ex - R * 1.3, ey - R * 1.2, ex + R * 1.1, ey - R * 0.55, ex + R * 1.0, ey - R * 0.15, [42, 26, 62]);
  c.tri(ex - R * 1.3, ey - R * 1.2, ex - R * 1.2, ey - R * 0.8, ex + R * 1.0, ey - R * 0.15, [42, 26, 62]);
  return { c, pivot: [0.5, 0.5] };
}

// --- pack into one atlas (simple shelf packing) -----------------------------------
const baby = body(false), grown = body(true);
const frames = [
  ['body_baby', baby.base], ['body_baby_detail', baby.detail],
  ['body_grown', grown.base], ['body_grown_detail', grown.detail],
  ['tail_long', tailLong().c], ['tail_stub', tailStub().c], ['spike', spike().c], ['face_villain', faceVillain().c],
];
const PAD = 8;
let x = PAD, y = PAD, rowH = 0; const W = 1400; const placed = [];
for (const [name, c] of frames) {
  if (x + c.w + PAD > W) { x = PAD; y += rowH + PAD; rowH = 0; }
  placed.push({ name, c, x, y }); x += c.w + PAD; rowH = Math.max(rowH, c.h);
}
const H = y + rowH + PAD;
const atlas = new Canvas(W, H);
const json = { frames: {}, meta: { image: 'lizard.png', size: { w: W, h: H }, scale: '1' } };
for (const p of placed) {
  atlas.blit(p.c, p.x, p.y);
  json.frames[p.name] = { frame: { x: p.x, y: p.y, w: p.c.w, h: p.c.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: p.c.w, h: p.c.h }, sourceSize: { w: p.c.w, h: p.c.h } };
}
writeFileSync(join(out, 'lizard.png'), png(atlas));
writeFileSync(join(out, 'lizard.atlas.json'), JSON.stringify(json, null, 2));

const bodyDef = (b, name) => ({
  frame: `body_${name}`, detail: `body_${name}_detail`, size: b.size, pivot: b.pivot,
  attach: { head: [b.head], wings: [0, -0.25], tail: [-b.size[0] / 2 + 0.1, 0.15], spikes: [0, -b.size[1] / 2], horns: [b.head[0], b.head[1] - 0.55], face: b.head },
});
const manifest = {
  kind: 'lizard', atlas: 'lizard', unit: UNIT,
  bodies: { baby: bodyDef(baby, 'baby'), grown: bodyDef(grown, 'grown') },
  parts: {
    'tail.long': { frame: 'tail_long', pivot: tailLong().pivot, z: 'behind', tint: 'primary' },
    'tail.stub': { frame: 'tail_stub', pivot: tailStub().pivot, z: 'behind', tint: 'primary' },
    spike: { frame: 'spike', pivot: [0.5, 1], z: 'front', tint: 'accent' },
    'face.villain': { frame: 'face_villain', pivot: [0.5, 0.5], z: 'front', tint: 'none' },
  },
};
writeFileSync(join(out, 'lizard.json'), JSON.stringify(manifest, null, 2));
// The placeholder set is not listed in index.json: preview it with ?parts=lizard.
if (!existsSync(join(out, 'index.json'))) writeFileSync(join(out, 'index.json'), JSON.stringify([]));
console.log(`wrote lizard atlas ${W}x${H} with ${placed.length} frames`);
