import Phaser from 'phaser';
import type { Genome, Kind } from '@monzilla/core';

const hex = (s: string) => Phaser.Display.Color.HexStringToColor(s).color;
const DARK = 0x1a1a2e;

type G = Phaser.GameObjects.Graphics;

/** Everything a template needs, computed once per draw. */
interface Ctx {
  g: G;
  genome: Genome;
  x: number;
  y: number;
  u: number;
  bw: number;
  bh: number;
  primary: number;
  secondary: number;
  accent: number;
  villain: boolean;
}

/**
 * Draws a genome with vector shapes. Every kind has its own template so a
 * yeti reads as a yeti and a robot as a robot, while the shared parts
 * (heads, horns, spikes, wings, tails, palette) come from the genome.
 * No image assets: hand-drawn parts can replace these later.
 *
 * (x, y) is the centre of the body. Creatures face right.
 */
export function drawKaiju(g: G, genome: Genome, x: number, y: number, scale = 1, withGlow = true) {
  const u = 36 * genome.size * scale;
  const body = { round: { w: 2.0, h: 2.0 }, tall: { w: 1.6, h: 2.6 }, long: { w: 2.8, h: 1.6 }, wide: { w: 2.6, h: 1.8 } }[genome.parts.body];
  const c: Ctx = {
    g,
    genome,
    x,
    y,
    u,
    bw: body.w * u,
    bh: body.h * u,
    primary: hex(genome.palette.primary),
    secondary: hex(genome.palette.secondary),
    accent: hex(genome.palette.accent),
    villain: genome.alignment === 'villain',
  };

  if (withGlow) {
    g.fillStyle(hex(genome.palette.glow), 0.28);
    g.fillEllipse(x, y + c.bh * 0.1, c.bw * 1.7, c.bh * 1.5);
    g.fillStyle(hex(genome.palette.glow), 0.18);
    g.fillEllipse(x, y + c.bh * 0.1, c.bw * 2.1, c.bh * 1.9);
  }
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(x, y + c.bh / 2 + u * 0.35, c.bw * 1.1, u * 0.5);

  TEMPLATES[genome.kind](c);

  if (genome.shiny) {
    g.fillStyle(0xffffff, 0.9);
    for (const [px, py] of [
      [x - c.bw * 0.6, y - c.bh * 0.6],
      [x + c.bw * 0.65, y - c.bh * 0.3],
      [x + c.bw * 0.2, y - c.bh * 0.9],
    ]) {
      drawStar(g, px!, py!, u * 0.18);
    }
  }
}

// ---------------------------------------------------------------------------
// Shared parts

function tail(c: Ctx, tx: number, ty: number) {
  const { g, u, primary, secondary } = c;
  g.fillStyle(primary, 1);
  switch (c.genome.parts.tail) {
    case 'stub':
      g.fillEllipse(tx - u * 0.3, ty, u * 0.8, u * 0.6);
      break;
    case 'long':
      g.fillTriangle(tx, ty - u * 0.35, tx, ty + u * 0.35, tx - u * 1.8, ty + u * 0.5);
      break;
    case 'club':
      g.fillTriangle(tx, ty - u * 0.25, tx, ty + u * 0.25, tx - u * 1.2, ty + u * 0.3);
      g.fillStyle(secondary, 1);
      g.fillCircle(tx - u * 1.3, ty + u * 0.3, u * 0.45);
      break;
    case 'fan':
      for (let i = -1; i <= 1; i++) {
        g.fillTriangle(tx, ty, tx - u * 1.3, ty + i * u * 0.55 - u * 0.25, tx - u * 1.3, ty + i * u * 0.55 + u * 0.25);
      }
      break;
  }
}

function wings(c: Ctx, wy: number, sizeMul = 1) {
  const { g, u, x, bw, secondary } = c;
  const kind = c.genome.parts.wings;
  if (kind === 'none') return;
  for (const side of [-1, 1]) {
    const wx = x + side * bw * 0.35;
    const s = u * sizeMul;
    g.fillStyle(secondary, 1);
    if (kind === 'bat') {
      g.fillTriangle(wx, wy, wx + side * s * 1.6, wy - s * 1.4, wx + side * s * 1.7, wy + s * 0.2);
      g.fillTriangle(wx, wy, wx + side * s * 1.7, wy + s * 0.2, wx + side * s * 0.9, wy + s * 0.6);
    } else if (kind === 'feather') {
      g.fillEllipse(wx + side * s * 0.9, wy - s * 0.5, s * 1.6, s * 0.8);
      g.fillEllipse(wx + side * s * 1.2, wy - s * 0.1, s * 1.4, s * 0.6);
    } else {
      g.fillTriangle(wx, wy - s * 0.3, wx + side * s * 1.1, wy - s * 1.1, wx + side * s * 0.5, wy + s * 0.3);
    }
  }
}

function legs(c: Ctx, spread = 0.3, size = 0.7) {
  const { g, u, x, y, bw, bh, primary } = c;
  g.fillStyle(primary, 1);
  g.fillEllipse(x - bw * spread, y + bh / 2, u * size, u * size);
  g.fillEllipse(x + bw * spread, y + bh / 2, u * size, u * size);
}

function spikes(c: Ctx, cx: number, top: number, span: number, curve = 0.35) {
  const { g, u, accent } = c;
  const n = c.genome.parts.spikes;
  if (n <= 0) return;
  g.fillStyle(accent, 1);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const sx = cx - span / 2 + span * t;
    const sy = top + Math.abs(t - 0.5) * c.bh * curve;
    const sh = u * (0.55 - Math.abs(t - 0.5) * 0.3);
    g.fillTriangle(sx - u * 0.18, sy + u * 0.05, sx + u * 0.18, sy + u * 0.05, sx, sy - sh);
  }
}

function horns(c: Ctx, hx: number, hy: number, r: number, count = c.genome.parts.horns) {
  const { g, accent } = c;
  if (count <= 0) return;
  g.fillStyle(accent, 1);
  for (let h = 0; h < count; h++) {
    const t = count === 1 ? 0 : h / (count - 1) - 0.5;
    const hxx = hx + t * r * 1.1;
    g.fillTriangle(hxx - r * 0.18, hy - r * 0.7, hxx + r * 0.18, hy - r * 0.7, hxx + t * r * 0.4, hy - r * 1.5);
  }
}

function eye(c: Ctx, ex: number, ey: number, r: number, square = false) {
  const { g, accent, villain } = c;
  g.fillStyle(0xffffff, 1);
  if (square) g.fillRect(ex - r, ey - r * 0.7, r * 2, r * 1.4);
  else g.fillCircle(ex, ey, r);
  g.fillStyle(villain ? accent : DARK, 1);
  if (square) g.fillRect(ex - r * 0.4, ey - r * 0.5, r * 1.1, r);
  else g.fillCircle(ex + r * 0.25, ey, r * 0.5);
  if (villain) {
    g.lineStyle(Math.max(2, r * 0.4), DARK, 1);
    g.lineBetween(ex - r * 1.3, ey - r * 1.5, ex + r * 1, ey - r * 0.8);
  }
}

function mouth(c: Ctx, mx: number, my: number, w: number, thick: number) {
  c.g.lineStyle(Math.max(2, thick), DARK, 1);
  c.g.lineBetween(mx, my, mx + w, my - w * 0.08);
}

/** A round head with snout, eye, horns and mouth (lizard, dragon, serpent, turtle). */
function head(c: Ctx, hx: number, hy: number, r: number, hornCount = c.genome.parts.horns) {
  const { g, primary } = c;
  horns(c, hx, hy, r, hornCount);
  g.fillStyle(primary, 1);
  g.fillCircle(hx, hy, r);
  g.fillEllipse(hx + r * 0.55, hy + r * 0.2, r * 0.9, r * 0.6);
  eye(c, hx + r * 0.25, hy - r * 0.2, r * 0.3);
  mouth(c, hx + r * 0.35, hy + r * 0.45, r * 0.6, r * 0.1);
}

/** Positions for 1..3 heads above the body. */
function headSpots(c: Ctx, r: number): { hx: number; hy: number }[] {
  const n = c.genome.parts.heads;
  const spread = n === 1 ? 0 : n === 2 ? c.bw * 0.28 : c.bw * 0.34;
  const headY = c.y - c.bh / 2 - r * 0.4;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    out.push({ hx: c.x + t * 2 * spread + c.bw * 0.12, hy: headY - Math.abs(t) * r * 0.3 });
  }
  return out;
}

function belly(c: Ctx) {
  c.g.fillStyle(c.secondary, 1);
  c.g.fillEllipse(c.x + c.bw * 0.05, c.y + c.bh * 0.15, c.bw * 0.55, c.bh * 0.55);
}

// ---------------------------------------------------------------------------
// Templates

const TEMPLATES: Record<Kind, (c: Ctx) => void> = {
  lizard(c) {
    const { g, x, y, bw, bh, u, primary } = c;
    tail(c, x - bw / 2 + u * 0.2, y + bh * 0.15);
    wings(c, y - bh * 0.25);
    legs(c);
    g.fillStyle(primary, 1);
    g.fillEllipse(x, y, bw, bh);
    belly(c);
    spikes(c, x, y - bh / 2, bw * 0.7);
    const r = u * 0.75;
    for (const s of headSpots(c, r)) head(c, s.hx, s.hy, r);
  },

  dragon(c) {
    const { g, x, y, bw, bh, u, primary } = c;
    tail(c, x - bw / 2 + u * 0.2, y + bh * 0.15);
    wings(c, y - bh * 0.3, 1.3);
    legs(c, 0.3, 0.8);
    g.fillStyle(primary, 1);
    g.fillEllipse(x, y, bw, bh);
    belly(c);
    spikes(c, x, y - bh / 2, bw * 0.6);
    // Long necks rising to each head.
    const r = u * (c.genome.parts.heads === 1 ? 0.65 : 0.5);
    for (const s of headSpots(c, r)) {
      const nx = s.hx - bw * 0.1;
      const ny = s.hy - r * 1.4;
      g.fillStyle(primary, 1);
      g.fillEllipse((nx + x) / 2, (ny + y - bh * 0.2) / 2, r * 1.1, Math.abs(ny - y) + bh * 0.3);
      head(c, nx, ny, r);
    }
  },

  moth(c) {
    const { g, x, y, bw, bh, u, primary, secondary, accent } = c;
    // Two pairs of big wings with a spot on each.
    for (const side of [-1, 1]) {
      g.fillStyle(secondary, 1);
      g.fillEllipse(x + side * bw * 0.85, y - bh * 0.35, bw * 1.3, bh * 0.9);
      g.fillEllipse(x + side * bw * 0.7, y + bh * 0.25, bw * 0.9, bh * 0.6);
      g.fillStyle(accent, 0.8);
      g.fillCircle(x + side * bw * 0.95, y - bh * 0.35, u * 0.3);
      g.fillStyle(primary, 0.6);
      g.fillCircle(x + side * bw * 0.95, y - bh * 0.35, u * 0.15);
    }
    // Fuzzy body: a ring of small circles then the body.
    g.fillStyle(primary, 1);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.fillCircle(x + Math.cos(a) * bw * 0.42, y + Math.sin(a) * bh * 0.42, u * 0.22);
    }
    g.fillEllipse(x, y, bw * 0.85, bh * 0.9);
    belly(c);
    // Small head with antennae.
    const r = u * 0.5;
    const hy = y - bh / 2 - r * 0.2;
    g.lineStyle(Math.max(2, u * 0.08), primary, 1);
    for (const side of [-1, 1]) {
      g.lineBetween(x + side * r * 0.3, hy - r * 0.6, x + side * r * 1.2, hy - r * 2.2);
      g.fillStyle(accent, 1);
      g.fillCircle(x + side * r * 1.2, hy - r * 2.2, r * 0.25);
    }
    g.fillStyle(primary, 1);
    g.fillCircle(x, hy, r);
    eye(c, x - r * 0.35, hy - r * 0.1, r * 0.28);
    eye(c, x + r * 0.35, hy - r * 0.1, r * 0.28);
  },

  turtle(c) {
    const { g, x, y, bw, bh, u, primary, secondary } = c;
    tail(c, x - bw / 2 + u * 0.1, y + bh * 0.2);
    wings(c, y - bh * 0.1, 0.8);
    legs(c, 0.38, 0.75);
    // Shell dome in the secondary colour with a few plates.
    g.fillStyle(secondary, 1);
    g.fillEllipse(x, y - bh * 0.05, bw, bh * 0.95);
    g.fillStyle(primary, 0.35);
    g.fillEllipse(x, y - bh * 0.1, bw * 0.45, bh * 0.4);
    for (const side of [-1, 1]) g.fillEllipse(x + side * bw * 0.3, y + bh * 0.05, bw * 0.28, bh * 0.3);
    // Underside strip.
    g.fillStyle(primary, 1);
    g.fillEllipse(x, y + bh * 0.4, bw * 0.95, bh * 0.25);
    spikes(c, x, y - bh * 0.5, bw * 0.7, 0.5);
    const r = u * 0.55;
    head(c, x + bw * 0.5 + r * 0.4, y - bh * 0.05, r);
  },

  yeti(c) {
    const { g, x, y, bw, bh, u, primary, secondary } = c;
    legs(c, 0.3, 0.9);
    // Shaggy outline: triangles of fur all round the body.
    g.fillStyle(primary, 1);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const rx = bw * 0.5;
      const ry = bh * 0.5;
      const px = x + Math.cos(a) * rx;
      const py = y + Math.sin(a) * ry;
      g.fillTriangle(px, py, px + Math.cos(a) * u * 0.45, py + Math.sin(a) * u * 0.45, x + Math.cos(a + 0.35) * rx, y + Math.sin(a + 0.35) * ry);
    }
    g.fillEllipse(x, y, bw, bh);
    // Long arms with big hands.
    for (const side of [-1, 1]) {
      g.fillStyle(primary, 1);
      g.fillEllipse(x + side * bw * 0.55, y + bh * 0.15, u * 0.6, bh * 0.7);
      g.fillStyle(secondary, 1);
      g.fillCircle(x + side * bw * 0.58, y + bh * 0.45, u * 0.4);
    }
    // Face patch on the upper body; no separate head.
    g.fillStyle(secondary, 1);
    g.fillEllipse(x + bw * 0.08, y - bh * 0.18, bw * 0.55, bh * 0.45);
    eye(c, x - bw * 0.05, y - bh * 0.25, u * 0.2);
    eye(c, x + bw * 0.2, y - bh * 0.25, u * 0.2);
    mouth(c, x - bw * 0.05, y - bh * 0.02, bw * 0.28, u * 0.08);
    horns(c, x + bw * 0.08, y - bh * 0.35, u * 0.6);
  },

  robot(c) {
    const { g, x, y, bw, bh, u, primary, secondary, accent } = c;
    // Boxy legs and arms.
    g.fillStyle(secondary, 1);
    g.fillRect(x - bw * 0.35, y + bh * 0.3, u * 0.55, bh * 0.4);
    g.fillRect(x + bw * 0.35 - u * 0.55, y + bh * 0.3, u * 0.55, bh * 0.4);
    g.fillRect(x - bw * 0.5 - u * 0.4, y - bh * 0.2, u * 0.4, bh * 0.55);
    g.fillRect(x + bw * 0.5, y - bh * 0.2, u * 0.4, bh * 0.55);
    wings(c, y - bh * 0.1, 0.8);
    // Body with a chest light and panel lines.
    g.fillStyle(primary, 1);
    g.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh, u * 0.3);
    g.lineStyle(Math.max(2, u * 0.06), DARK, 0.35);
    g.strokeRoundedRect(x - bw / 2 + u * 0.15, y - bh / 2 + u * 0.15, bw - u * 0.3, bh - u * 0.3, u * 0.25);
    g.fillStyle(accent, 1);
    g.fillCircle(x, y + bh * 0.1, u * 0.28);
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(x - u * 0.08, y + bh * 0.02, u * 0.1);
    for (const side of [-1, 1]) {
      g.fillStyle(DARK, 0.4);
      g.fillCircle(x + side * bw * 0.35, y - bh * 0.3, u * 0.08);
      g.fillCircle(x + side * bw * 0.35, y + bh * 0.35, u * 0.08);
    }
    spikes(c, x, y - bh / 2, bw * 0.6, 0);
    // Square head with a visor and antenna.
    const hw = bw * 0.6;
    const hh = u * 0.9;
    const hy = y - bh / 2 - hh * 0.55;
    g.fillStyle(primary, 1);
    g.fillRoundedRect(x - hw / 2, hy - hh / 2, hw, hh, u * 0.15);
    g.fillStyle(DARK, 0.85);
    g.fillRoundedRect(x - hw * 0.4, hy - hh * 0.25, hw * 0.8, hh * 0.45, u * 0.1);
    eye(c, x - hw * 0.15, hy - hh * 0.02, u * 0.16, true);
    eye(c, x + hw * 0.22, hy - hh * 0.02, u * 0.16, true);
    g.lineStyle(Math.max(2, u * 0.08), secondary, 1);
    g.lineBetween(x, hy - hh / 2, x, hy - hh * 1.2);
    g.fillStyle(accent, 1);
    g.fillCircle(x, hy - hh * 1.2, u * 0.16);
    horns(c, x, hy, u * 0.5, Math.min(1, c.genome.parts.horns));
  },

  crab(c) {
    const { g, x, y, bw, bh, u, primary, secondary } = c;
    // Six thin legs.
    g.lineStyle(Math.max(2, u * 0.12), primary, 1);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const lx = x + side * bw * (0.3 + i * 0.12);
        g.lineBetween(lx, y + bh * 0.2, lx + side * u * 0.5, y + bh * 0.55 + i * u * 0.1);
      }
    }
    // Claws: an arm ball plus a pincer.
    for (const side of [-1, 1]) {
      const cx = x + side * bw * 0.62;
      const cy = y - bh * 0.05;
      g.fillStyle(primary, 1);
      g.fillCircle(cx, cy, u * 0.45);
      g.fillStyle(secondary, 1);
      g.fillTriangle(cx, cy - u * 0.4, cx + side * u * 0.9, cy - u * 0.75, cx + side * u * 0.5, cy);
      g.fillTriangle(cx, cy + u * 0.35, cx + side * u * 0.9, cy + u * 0.55, cx + side * u * 0.5, cy);
    }
    // Flat shell.
    g.fillStyle(primary, 1);
    g.fillEllipse(x, y, bw, bh * 0.8);
    g.fillStyle(secondary, 0.6);
    g.fillEllipse(x, y + bh * 0.1, bw * 0.7, bh * 0.4);
    spikes(c, x, y - bh * 0.4, bw * 0.6, 0.3);
    // Eye stalks.
    for (const side of [-1, 1]) {
      const ex = x + side * bw * 0.15;
      g.lineStyle(Math.max(2, u * 0.1), primary, 1);
      g.lineBetween(ex, y - bh * 0.3, ex, y - bh * 0.6);
      eye(c, ex, y - bh * 0.65, u * 0.2);
    }
    mouth(c, x - bw * 0.1, y - bh * 0.05, bw * 0.2, u * 0.08);
  },

  bird(c) {
    const { g, x, y, bw, bh, u, primary, secondary, accent } = c;
    tail(c, x - bw / 2 + u * 0.1, y + bh * 0.1);
    wings(c, y - bh * 0.15, 1.1);
    // Thin legs with feet.
    g.lineStyle(Math.max(2, u * 0.1), accent, 1);
    for (const side of [-1, 1]) {
      const lx = x + side * bw * 0.18;
      g.lineBetween(lx, y + bh * 0.35, lx, y + bh * 0.7);
      g.lineBetween(lx - u * 0.25, y + bh * 0.7, lx + u * 0.25, y + bh * 0.7);
    }
    g.fillStyle(primary, 1);
    g.fillEllipse(x, y, bw, bh);
    belly(c);
    spikes(c, x, y - bh / 2, bw * 0.5);
    // Head with a beak and crest.
    const r = u * 0.65;
    const hx = x + bw * 0.2;
    const hy = y - bh / 2 - r * 0.3;
    g.fillStyle(secondary, 1);
    for (let i = 0; i < 1 + c.genome.parts.horns; i++) {
      g.fillTriangle(hx - r * 0.3 + i * r * 0.25, hy - r * 0.7, hx + i * r * 0.25, hy - r * 0.7, hx - r * 0.5 + i * r * 0.3, hy - r * 1.6);
    }
    g.fillStyle(primary, 1);
    g.fillCircle(hx, hy, r);
    g.fillStyle(accent, 1);
    g.fillTriangle(hx + r * 0.6, hy - r * 0.15, hx + r * 0.6, hy + r * 0.35, hx + r * 1.5, hy + r * 0.15);
    eye(c, hx + r * 0.15, hy - r * 0.2, r * 0.28);
  },

  blob(c) {
    const { g, x, y, bw, bh, u, primary, secondary } = c;
    // Wobbly body from overlapping circles, plus drips.
    g.fillStyle(primary, 1);
    g.fillEllipse(x, y + bh * 0.1, bw, bh * 0.85);
    g.fillCircle(x - bw * 0.25, y - bh * 0.15, bh * 0.35);
    g.fillCircle(x + bw * 0.22, y - bh * 0.2, bh * 0.32);
    g.fillCircle(x, y - bh * 0.28, bh * 0.28);
    for (const side of [-1, 1]) {
      g.fillEllipse(x + side * bw * 0.38, y + bh * 0.5, u * 0.35, u * 0.6);
    }
    // Bumps instead of spikes.
    g.fillStyle(secondary, 0.9);
    for (let i = 0; i < c.genome.parts.spikes; i++) {
      const t = (i + 0.5) / c.genome.parts.spikes;
      g.fillCircle(x - bw * 0.35 + bw * 0.7 * t, y - bh * 0.05 + Math.abs(t - 0.5) * bh * 0.3, u * 0.18);
    }
    g.fillStyle(0xffffff, 0.35);
    g.fillEllipse(x - bw * 0.2, y - bh * 0.15, bw * 0.25, bh * 0.2);
    // Big eyes and a wide mouth right on the body.
    eye(c, x - bw * 0.12, y - bh * 0.05, u * 0.26);
    eye(c, x + bw * 0.2, y - bh * 0.05, u * 0.26);
    g.lineStyle(Math.max(2, u * 0.1), DARK, 1);
    g.beginPath();
    g.arc(x + bw * 0.05, y + bh * 0.12, u * 0.45, 0.2, Math.PI - 0.2, false);
    g.strokePath();
  },

  serpent(c) {
    const { g, x, y, bw, bh, u, primary, secondary } = c;
    // S-curve of circles, tail end on the left, head on the right.
    const n = 9;
    const pts: { px: number; py: number; r: number }[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const px = x - bw * 0.7 + bw * 1.4 * t;
      const py = y + Math.sin(t * Math.PI * 2) * bh * 0.32 + bh * 0.1 * (1 - t);
      pts.push({ px, py, r: bh * (0.16 + t * 0.2) });
    }
    wings(c, y - bh * 0.2, 0.7);
    for (const p of pts) {
      g.fillStyle(primary, 1);
      g.fillCircle(p.px, p.py, p.r);
    }
    for (const p of pts) {
      g.fillStyle(secondary, 1);
      g.fillCircle(p.px, p.py + p.r * 0.3, p.r * 0.5);
    }
    // Spikes along the top of the curve.
    if (c.genome.parts.spikes > 0) {
      g.fillStyle(c.accent, 1);
      for (let i = 0; i < c.genome.parts.spikes; i++) {
        const p = pts[Math.round(((i + 1) / (c.genome.parts.spikes + 1)) * (n - 1))]!;
        g.fillTriangle(p.px - u * 0.15, p.py - p.r + u * 0.05, p.px + u * 0.15, p.py - p.r + u * 0.05, p.px, p.py - p.r - u * 0.5);
      }
    }
    const last = pts[n - 1]!;
    const r = u * 0.6;
    const heads = c.genome.parts.heads;
    for (let i = 0; i < heads; i++) {
      const hy = last.py - r * 0.6 - i * r * 1.3;
      const hx = last.px + r * 0.5 + i * r * 0.3;
      if (i > 0) {
        g.fillStyle(primary, 1);
        g.fillEllipse((hx + last.px) / 2, (hy + last.py) / 2, r * 0.9, r * 1.6);
      }
      head(c, hx, hy, r);
      // Forked tongue
      g.lineStyle(Math.max(2, u * 0.06), 0xff4081, 1);
      g.lineBetween(hx + r * 1.0, hy + r * 0.35, hx + r * 1.5, hy + r * 0.3);
      g.lineBetween(hx + r * 1.5, hy + r * 0.3, hx + r * 1.7, hy + r * 0.15);
      g.lineBetween(hx + r * 1.5, hy + r * 0.3, hx + r * 1.7, hy + r * 0.45);
    }
  },
};

export function drawStar(g: G, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 === 0 ? r : r * 0.4;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fillPath();
}

/** Draw a silhouette (for undiscovered dex pages). */
export function drawSilhouette(g: G, genome: Genome, x: number, y: number, scale = 1) {
  const dark: Genome = {
    ...genome,
    shiny: false,
    alignment: 'guardian',
    palette: { primary: '#2b2b3d', secondary: '#2b2b3d', accent: '#2b2b3d', glow: '#000000' },
  };
  drawKaiju(g, dark, x, y, scale, false);
}

/** Bounding box height for layout, in pixels at scale 1. */
export function kaijuHeight(genome: Genome, scale = 1): number {
  const u = 36 * genome.size * scale;
  return u * 4.2;
}

/** Draw an egg with a fill bar showing fragments. */
export function drawEgg(g: G, x: number, y: number, r: number, color: string, ratio: number) {
  g.fillStyle(0x000000, 0.15);
  g.fillEllipse(x, y + r * 1.2, r * 1.8, r * 0.5);
  g.fillStyle(0xf5f5f5, 1);
  g.fillEllipse(x, y, r * 1.6, r * 2.1);
  const c = hex(color);
  g.fillStyle(c, 0.85);
  const fillH = r * 2.1 * ratio;
  g.fillEllipse(x, y + (r * 2.1 - fillH) / 2, r * 1.6 * (0.6 + 0.4 * ratio), fillH);
  g.fillStyle(0xffffff, 0.6);
  g.fillEllipse(x - r * 0.35, y - r * 0.6, r * 0.4, r * 0.7);
  g.lineStyle(3, 0xcfd8dc, 1);
  g.strokeEllipse(x, y, r * 1.6, r * 2.1);
}
