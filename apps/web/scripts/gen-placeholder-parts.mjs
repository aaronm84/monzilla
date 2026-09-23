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

// --- placeholder parts for the three stress-test kinds ----------------------------
// Grays so the game can tint them. Same slot names as docs/SPRITES.md.
const BASE = [214, 214, 214], DARK = [160, 160, 160], LIGHT = [240, 240, 240];
const EYE_W = [255, 255, 255], EYE_D = [31, 58, 104], BELLY = [250, 246, 235];
const u = UNIT;

function eye(detail, ex, ey, er, square = false) {
  if (square) { detail.rect(Math.round(ex - er), Math.round(ey - er * 0.7), Math.round(er * 2), Math.round(er * 1.4), EYE_W); detail.rect(Math.round(ex - er * 0.4), Math.round(ey - er * 0.5), Math.round(er * 1.1), Math.round(er), EYE_D); return; }
  detail.ellipse(ex, ey, er, er, EYE_W);
  detail.ellipse(ex + er * 0.2, ey + er * 0.05, er * 0.58, er * 0.58, EYE_D);
  detail.ellipse(ex + er * 0.35, ey - er * 0.25, er * 0.22, er * 0.22, EYE_W);
}

/** Lizard: ellipse body, round head, stubby legs. */
function lizardBody(grown) {
  const bw = 2.0 * u, bh = (grown ? 2.6 : 2.0) * u, hr = (grown ? 0.85 : 1.0) * u;
  const W = Math.ceil(bw * 1.4), H = Math.ceil(bh + hr * 2.6);
  const cx = W / 2, cy = H - bh / 2 - u * 0.4;
  const base = new Canvas(W, H), detail = new Canvas(W, H);
  base.ellipse(cx - bw * 0.3, cy + bh / 2, u * 0.36, u * 0.36, DARK);
  base.ellipse(cx + bw * 0.3, cy + bh / 2, u * 0.36, u * 0.36, DARK);
  base.ellipse(cx, cy, bw / 2, bh / 2, DARK);
  base.ellipse(cx - bw * 0.03, cy - bh * 0.05, bw * 0.46, bh * 0.45, BASE);
  base.ellipse(cx - bw * 0.15, cy - bh * 0.25, bw * 0.2, bh * 0.14, LIGHT, 140);
  const hx = cx + bw * 0.12, hy = cy - bh / 2 - hr * 0.4;
  base.ellipse(hx, hy, hr, hr, DARK);
  base.ellipse(hx - hr * 0.06, hy - hr * 0.08, hr * 0.92, hr * 0.92, BASE);
  base.ellipse(hx + hr * 0.6, hy + hr * 0.25, hr * 0.5, hr * 0.32, BASE);
  detail.ellipse(cx + bw * 0.05, cy + bh * 0.15, bw * 0.27, bh * 0.27, BELLY);
  eye(detail, hx + hr * 0.22, hy - hr * 0.22, hr * 0.36);
  detail.rect(Math.round(hx + hr * 0.4), Math.round(hy + hr * 0.5), Math.round(hr * 0.6), Math.max(2, Math.round(hr * 0.08)), EYE_D);
  const head = [(hx - cx) / u, (hy - cy) / u];
  return { base, detail, pivot: [cx / W, cy / H], size: [bw / u, bh / u], head, hr: hr / u,
    attach: { head: [head], wings: [0, -0.25], tail: [-bw / u / 2 + 0.1, 0.15], spikes: [0, -bh / u / 2], horns: [head[0], head[1] - hr / u * 0.95], face: head },
    anchors: { head, mouth: [head[0] + hr / u * 0.9, head[1] + hr / u * 0.4], back: [0, -bh / u / 2], feet: [0, bh / u / 2 + 0.3], attackOrigin: [bw / u / 2, -0.3], effectOrigin: [0, -0.3] },
    bounds: { selection: [bw / u * 1.3, (bh + hr * 2) / u], selectionOffset: [0, -hr / u * 0.6], footprint: [bw / u * 1.1, 0.5] } };
}

/** Robot: boxy torso, square head with visor eyes, block legs. */
function robotBody(grown) {
  const bw = (grown ? 1.8 : 1.6) * u, bh = (grown ? 2.2 : 1.7) * u, hw = bw * 0.7, hh = (grown ? 0.9 : 1.1) * u;
  const W = Math.ceil(bw * 1.6), H = Math.ceil(bh + hh * 2.2);
  const cx = W / 2, cy = H - bh / 2 - u * 0.35;
  const base = new Canvas(W, H), detail = new Canvas(W, H);
  base.rect(Math.round(cx - bw * 0.42), Math.round(cy + bh * 0.3), Math.round(u * 0.42), Math.round(bh * 0.4), DARK);
  base.rect(Math.round(cx + bw * 0.42 - u * 0.42), Math.round(cy + bh * 0.3), Math.round(u * 0.42), Math.round(bh * 0.4), DARK);
  base.rect(Math.round(cx - bw / 2 - u * 0.3), Math.round(cy - bh * 0.2), Math.round(u * 0.3), Math.round(bh * 0.5), DARK);
  base.rect(Math.round(cx + bw / 2), Math.round(cy - bh * 0.2), Math.round(u * 0.3), Math.round(bh * 0.5), DARK);
  base.rect(Math.round(cx - bw / 2), Math.round(cy - bh / 2), Math.round(bw), Math.round(bh), DARK);
  base.rect(Math.round(cx - bw / 2 + 6), Math.round(cy - bh / 2 + 6), Math.round(bw - 12), Math.round(bh * 0.55), BASE);
  base.rect(Math.round(cx - bw / 2 + 14), Math.round(cy - bh / 2 + 12), Math.round(bw * 0.5), Math.round(bh * 0.14), LIGHT, 150);
  const hy = cy - bh / 2 - hh * 0.55;
  base.rect(Math.round(cx - hw / 2), Math.round(hy - hh / 2), Math.round(hw), Math.round(hh), DARK);
  base.rect(Math.round(cx - hw / 2 + 5), Math.round(hy - hh / 2 + 5), Math.round(hw - 10), Math.round(hh * 0.5), BASE);
  detail.rect(Math.round(cx - hw * 0.4), Math.round(hy - hh * 0.25), Math.round(hw * 0.8), Math.round(hh * 0.45), [40, 40, 60]);
  eye(detail, cx - hw * 0.15, hy - hh * 0.02, u * 0.13, true);
  eye(detail, cx + hw * 0.22, hy - hh * 0.02, u * 0.13, true);
  detail.ellipse(cx, cy + bh * 0.1, u * 0.24, u * 0.24, [255, 90, 90]);
  detail.ellipse(cx - u * 0.07, cy + bh * 0.03, u * 0.08, u * 0.08, [255, 255, 255], 160);
  const head = [0, (hy - cy) / u];
  return { base, detail, pivot: [cx / W, cy / H], size: [bw / u, bh / u], head, hr: hh / u,
    attach: { head: [head], wings: [0, -0.1], tail: [-bw / u / 2, 0.1], spikes: [0, -bh / u / 2 + 0.05], horns: [0, head[1] - hh / u / 2], face: head },
    anchors: { head, mouth: [hw / u * 0.5, head[1] + hh / u * 0.3], back: [0, -bh / u / 2], feet: [0, bh / u / 2 + 0.3], attackOrigin: [bw / u / 2 + 0.3, 0], effectOrigin: [0, 0.1] },
    bounds: { selection: [bw / u * 1.5, (bh + hh * 1.6) / u], selectionOffset: [0, -hh / u * 0.5], footprint: [bw / u * 1.2, 0.5] } };
}

/** Blob: one soft mass, lobes, no legs; face on the body. */
function blobBody(grown) {
  const bw = (grown ? 2.4 : 1.8) * u, bh = (grown ? 2.0 : 1.5) * u;
  const W = Math.ceil(bw * 1.3), H = Math.ceil(bh * 1.4);
  const cx = W / 2, cy = H * 0.6;
  const base = new Canvas(W, H), detail = new Canvas(W, H);
  base.ellipse(cx, cy + bh * 0.08, bw * 0.52, bh * 0.45, DARK);
  base.ellipse(cx, cy + bh * 0.05, bw * 0.5, bh * 0.42, BASE);
  base.ellipse(cx - bw * 0.25, cy - bh * 0.15, bh * 0.32, bh * 0.32, BASE);
  base.ellipse(cx + bw * 0.22, cy - bh * 0.2, bh * 0.3, bh * 0.3, BASE);
  if (grown) base.ellipse(cx, cy - bh * 0.3, bh * 0.26, bh * 0.26, BASE);
  base.ellipse(cx - bw * 0.18, cy - bh * 0.15, bw * 0.14, bh * 0.1, LIGHT, 150);
  eye(detail, cx - bw * 0.12, cy - bh * 0.05, u * 0.26);
  eye(detail, cx + bw * 0.2, cy - bh * 0.05, u * 0.26);
  detail.rect(Math.round(cx - bw * 0.1), Math.round(cy + bh * 0.15), Math.round(bw * 0.3), Math.max(2, Math.round(u * 0.07)), EYE_D);
  const head = [0.04, -0.05];
  return { base, detail, pivot: [cx / W, cy / H], size: [bw / u, bh / u], head, hr: 0.5,
    attach: { head: [head], tail: [-bw / u / 2 + 0.2, 0.25], spikes: [0, -bh / u / 2 + 0.05], face: head },
    anchors: { head: [0, -bh / u * 0.3], mouth: [0.05, 0.15], back: [0, -bh / u / 2], feet: [0, bh / u / 2 + 0.1], attackOrigin: [bw / u / 2, 0], effectOrigin: [0, -0.2] },
    bounds: { selection: [bw / u * 1.15, bh / u * 1.3], selectionOffset: [0, -0.1], footprint: [bw / u, 0.4] } };
}

// Shared slot parts (same drawing, every kind can use them).
function tailLong() { const W = Math.ceil(u * 1.9), H = Math.ceil(u * 0.9); const c = new Canvas(W, H); c.tri(W - 1, H * 0.1, W - 1, H * 0.9, 2, H * 0.95, BASE); c.tri(W - 1, H * 0.1, W - 1, H * 0.5, W * 0.3, H * 0.6, LIGHT, 120); return { c, pivot: [1, 0.45] }; }
function tailStub() { const W = Math.ceil(u * 0.9), H = Math.ceil(u * 0.7); const c = new Canvas(W, H); c.ellipse(W * 0.45, H / 2, W * 0.42, H * 0.42, BASE); return { c, pivot: [0.9, 0.5] }; }
function tailClub() { const W = Math.ceil(u * 1.7), H = Math.ceil(u * 1.0); const c = new Canvas(W, H); c.tri(W - 1, H * 0.3, W - 1, H * 0.7, W * 0.3, H * 0.55, BASE); c.ellipse(W * 0.28, H * 0.55, H * 0.42, H * 0.42, DARK); return { c, pivot: [1, 0.5] }; }
function tailFan() { const W = Math.ceil(u * 1.5), H = Math.ceil(u * 1.5); const c = new Canvas(W, H); for (const t of [-1, 0, 1]) c.tri(W - 1, H / 2, 2, H / 2 + t * H * 0.35 - H * 0.16, 2, H / 2 + t * H * 0.35 + H * 0.16, BASE); return { c, pivot: [1, 0.5] }; }
function spike() { const W = Math.ceil(u * 0.7), H = Math.ceil(u * 1.1); const c = new Canvas(W, H); c.tri(2, H - 1, W - 2, H - 1, W / 2 + 4, 2, DARK); c.tri(2, H - 1, W / 2 + 4, 2, W * 0.4, H * 0.85, LIGHT); c.tri(W * 0.15, H * 0.9, W / 2, H * 0.15, W * 0.35, H * 0.65, [255, 255, 255], 120); return { c, pivot: [0.5, 1] }; }
function horn() { const W = Math.ceil(u * 0.5), H = Math.ceil(u * 0.95); const c = new Canvas(W, H); c.tri(2, H - 1, W - 2, H - 1, W * 0.7, 2, DARK); c.tri(2, H - 1, W * 0.7, 2, W * 0.35, H * 0.8, LIGHT); return { c, pivot: [0.5, 1] }; }
function antenna() { const W = Math.ceil(u * 0.4), H = Math.ceil(u * 1.0); const c = new Canvas(W, H); c.rect(Math.round(W / 2 - 3), Math.round(H * 0.25), 6, Math.round(H * 0.75), DARK); c.ellipse(W / 2, H * 0.2, W * 0.4, W * 0.4, [255, 90, 90]); return { c, pivot: [0.5, 1] }; }
function thruster() { const W = Math.ceil(u * 1.2), H = Math.ceil(u * 0.8); const c = new Canvas(W, H); c.rect(Math.round(W * 0.3), Math.round(H * 0.2), Math.round(W * 0.7), Math.round(H * 0.6), DARK); c.rect(Math.round(W * 0.35), Math.round(H * 0.27), Math.round(W * 0.6), Math.round(H * 0.25), BASE); c.ellipse(W * 0.22, H / 2, W * 0.2, H * 0.35, [255, 150, 60]); return { c, pivot: [1, 0.5] }; }
function nub() { const W = Math.ceil(u * 0.5), H = Math.ceil(u * 0.6); const c = new Canvas(W, H); c.ellipse(W / 2, H * 0.55, W * 0.45, H * 0.42, DARK); c.ellipse(W / 2 - 2, H * 0.5, W * 0.35, H * 0.32, LIGHT); return { c, pivot: [0.5, 1] }; }
function drip() { const W = Math.ceil(u * 0.8), H = Math.ceil(u * 0.7); const c = new Canvas(W, H); c.ellipse(W * 0.6, H * 0.35, W * 0.35, H * 0.3, BASE); c.ellipse(W * 0.25, H * 0.7, W * 0.2, H * 0.25, BASE); return { c, pivot: [1, 0.4] }; }
function faceVillain(hr, wide = false) {
  const W = Math.ceil(hr * u * 2.2), H = Math.ceil(hr * u * 2);
  const c = new Canvas(W, H);
  const draw = (ex, ey, R) => { c.ellipse(ex, ey, R * 1.05, R * 0.5, [255, 243, 243]); c.ellipse(ex + R * 0.25, ey, R * 0.42, R * 0.42, [255, 23, 68]); c.tri(ex - R * 1.3, ey - R * 1.2, ex + R * 1.1, ey - R * 0.55, ex + R * 1.0, ey - R * 0.15, [42, 26, 62]); c.tri(ex - R * 1.3, ey - R * 1.2, ex - R * 1.2, ey - R * 0.8, ex + R * 1.0, ey - R * 0.15, [42, 26, 62]); };
  if (wide) { draw(W / 2 - hr * u * 0.5, H / 2, hr * u * 0.36); draw(W / 2 + hr * u * 0.55, H / 2, hr * u * 0.36); }
  else draw(W / 2 + hr * u * 0.22, H / 2 - hr * u * 0.22, hr * u * 0.42);
  return { c, pivot: [0.5, 0.5] };
}

// --- pack + write one kind ----------------------------------------------------------
function pack(kind, frames) {
  const PAD = 8; let x = PAD, y = PAD, rowH = 0; const W = 1600; const placed = [];
  for (const [name, c] of frames) { if (x + c.w + PAD > W) { x = PAD; y += rowH + PAD; rowH = 0; } placed.push({ name, c, x, y }); x += c.w + PAD; rowH = Math.max(rowH, c.h); }
  const H = y + rowH + PAD; const atlas = new Canvas(W, H);
  const json = { frames: {}, meta: { image: `${kind}.png`, size: { w: W, h: H }, scale: '1' } };
  for (const p of placed) { atlas.blit(p.c, p.x, p.y); json.frames[p.name] = { frame: { x: p.x, y: p.y, w: p.c.w, h: p.c.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: p.c.w, h: p.c.h }, sourceSize: { w: p.c.w, h: p.c.h } }; }
  const dir = join(out, kind); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${kind}.png`), png(atlas));
  writeFileSync(join(dir, `${kind}.atlas.json`), JSON.stringify(json, null, 2));
  return { W, H, count: placed.length, dir };
}
const bodyDef = (b, name) => ({ frame: `body_${name}`, detail: `body_${name}_detail`, size: b.size, pivot: b.pivot, attach: b.attach, anchors: b.anchors, bounds: b.bounds });
function writeKind(kind, bodies, parts, extra) {
  const frames = [
    ['body_baby', bodies.baby.base], ['body_baby_detail', bodies.baby.detail],
    ['body_grown', bodies.grown.base], ['body_grown_detail', bodies.grown.detail],
    ...Object.entries(parts).map(([name, p]) => [name, p.c]),
  ];
  const packed = pack(kind, frames);
  const manifest = { kind, atlas: kind, unit: UNIT, displayName: kind[0].toUpperCase() + kind.slice(1), bodies: { baby: bodyDef(bodies.baby, 'baby'), grown: bodyDef(bodies.grown, 'grown') }, parts: extra.parts, ...(extra.omit ? { omit: extra.omit } : {}), motion: extra.motion };
  writeFileSync(join(packed.dir, `${kind}.json`), JSON.stringify(manifest, null, 2));
  console.log(`wrote ${kind}: atlas ${packed.W}x${packed.H}, ${packed.count} frames`);
}

// Lizard: full slot set.
{
  const lz = { baby: lizardBody(false), grown: lizardBody(true) };
  const parts = { tail_stub: tailStub(), tail_long: tailLong(), tail_club: tailClub(), tail_fan: tailFan(), spike: spike(), horn: horn(), face_villain: faceVillain(0.85) };
  writeKind('lizard', lz, parts, { motion: 'organic', parts: {
    'tail.stub': { frame: 'tail_stub', pivot: parts.tail_stub.pivot, z: 'behind', tint: 'primary' },
    'tail.long': { frame: 'tail_long', pivot: parts.tail_long.pivot, z: 'behind', tint: 'primary' },
    'tail.club': { frame: 'tail_club', pivot: parts.tail_club.pivot, z: 'behind', tint: 'primary' },
    'tail.fan': { frame: 'tail_fan', pivot: parts.tail_fan.pivot, z: 'behind', tint: 'primary' },
    spike: { frame: 'spike', pivot: [0.5, 1], z: 'front', tint: 'accent' },
    horn: { frame: 'horn', pivot: [0.5, 1], z: 'front', tint: 'accent' },
    'face.villain': { frame: 'face_villain', pivot: [0.5, 0.5], z: 'front', tint: 'none' },
  } });
}
// Robot: same slots reinterpreted: tail -> rear module, horn -> antenna, spike -> armor plate.
{
  const rb = { baby: robotBody(false), grown: robotBody(true) };
  const parts = { thruster: thruster(), spike: spike(), antenna: antenna(), face_villain: faceVillain(0.9, true) };
  writeKind('robot', rb, parts, { motion: 'rigid', omit: ['wings', 'head'], parts: {
    'tail.stub': { frame: 'thruster', pivot: parts.thruster.pivot, z: 'behind', tint: 'secondary' },
    'tail.long': { frame: 'thruster', pivot: parts.thruster.pivot, z: 'behind', tint: 'secondary', scale: 1.3 },
    'tail.club': { frame: 'thruster', pivot: parts.thruster.pivot, z: 'behind', tint: 'secondary' },
    'tail.fan': { frame: 'thruster', pivot: parts.thruster.pivot, z: 'behind', tint: 'secondary', scale: 1.15 },
    spike: { frame: 'spike', pivot: [0.5, 1], z: 'front', tint: 'accent', scale: 0.8 },
    horn: { frame: 'antenna', pivot: [0.5, 1], z: 'front', tint: 'none' },
    'face.villain': { frame: 'face_villain', pivot: [0.5, 0.5], z: 'front', tint: 'none' },
  } });
}
// Blob: minimal anatomy: no wings, horns, or extra heads; tail -> drip, spike -> crystal nub.
{
  const bl = { baby: blobBody(false), grown: blobBody(true) };
  const parts = { drip: drip(), nub: nub(), face_villain: faceVillain(0.75, true) };
  writeKind('blob', bl, parts, { motion: 'wobble', omit: ['wings', 'horn', 'head'], parts: {
    'tail.stub': { frame: 'drip', pivot: parts.drip.pivot, z: 'behind', tint: 'primary' },
    'tail.long': { frame: 'drip', pivot: parts.drip.pivot, z: 'behind', tint: 'primary', scale: 1.4 },
    'tail.club': { frame: 'drip', pivot: parts.drip.pivot, z: 'behind', tint: 'primary' },
    'tail.fan': { frame: 'drip', pivot: parts.drip.pivot, z: 'behind', tint: 'primary', scale: 1.2 },
    spike: { frame: 'nub', pivot: [0.5, 1], z: 'front', tint: 'accent' },
    'face.villain': { frame: 'face_villain', pivot: [0.5, 0.5], z: 'front', tint: 'none' },
  } });
}
// The placeholder sets are not listed in index.json: preview with ?parts=lizard,robot,blob.
if (!existsSync(join(out, 'index.json'))) writeFileSync(join(out, 'index.json'), JSON.stringify([]));
