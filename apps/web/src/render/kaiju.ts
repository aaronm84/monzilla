import Phaser from 'phaser';
import type { Genome } from '@monzilla/core';

const hex = (s: string) => Phaser.Display.Color.HexStringToColor(s).color;

/**
 * Draws a genome with vector shapes. No image assets: every creature is
 * built from a body, heads, wings, tail, horns, and spikes so the genome is
 * the only source of truth and hand-drawn parts can replace these later.
 *
 * Coordinates: (x, y) is the centre of the body. Facing right.
 */
export function drawKaiju(g: Phaser.GameObjects.Graphics, genome: Genome, x: number, y: number, scale = 1, withGlow = true) {
  const u = 36 * genome.size * scale;
  const p = genome.parts;
  const pal = genome.palette;
  const primary = hex(pal.primary);
  const secondary = hex(pal.secondary);
  const accent = hex(pal.accent);
  const dark = 0x1a1a2e;

  const body = {
    round: { w: 2.0, h: 2.0 },
    tall: { w: 1.6, h: 2.6 },
    long: { w: 2.8, h: 1.6 },
    wide: { w: 2.6, h: 1.8 },
  }[p.body];
  const bw = body.w * u;
  const bh = body.h * u;

  if (withGlow) {
    g.fillStyle(hex(pal.glow), 0.28);
    g.fillEllipse(x, y + bh * 0.1, bw * 1.7, bh * 1.5);
    g.fillStyle(hex(pal.glow), 0.18);
    g.fillEllipse(x, y + bh * 0.1, bw * 2.1, bh * 1.9);
  }

  // Shadow
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(x, y + bh / 2 + u * 0.35, bw * 1.1, u * 0.5);

  // Tail (behind body, to the left)
  const tailX = x - bw / 2 + u * 0.2;
  const tailY = y + bh * 0.15;
  g.fillStyle(primary, 1);
  switch (p.tail) {
    case 'stub':
      g.fillEllipse(tailX - u * 0.3, tailY, u * 0.8, u * 0.6);
      break;
    case 'long':
      g.fillTriangle(tailX, tailY - u * 0.35, tailX, tailY + u * 0.35, tailX - u * 1.8, tailY + u * 0.5);
      break;
    case 'club':
      g.fillTriangle(tailX, tailY - u * 0.25, tailX, tailY + u * 0.25, tailX - u * 1.2, tailY + u * 0.3);
      g.fillStyle(secondary, 1);
      g.fillCircle(tailX - u * 1.3, tailY + u * 0.3, u * 0.45);
      g.fillStyle(primary, 1);
      break;
    case 'fan':
      for (let i = -1; i <= 1; i++) {
        g.fillTriangle(tailX, tailY, tailX - u * 1.3, tailY + i * u * 0.55 - u * 0.25, tailX - u * 1.3, tailY + i * u * 0.55 + u * 0.25);
      }
      break;
  }

  // Wings (behind body)
  if (p.wings !== 'none') {
    const wy = y - bh * 0.25;
    for (const side of [-1, 1]) {
      const wx = x + side * bw * 0.35;
      if (p.wings === 'bat') {
        g.fillStyle(secondary, 1);
        g.fillTriangle(wx, wy, wx + side * u * 1.6, wy - u * 1.4, wx + side * u * 1.7, wy + u * 0.2);
        g.fillTriangle(wx, wy, wx + side * u * 1.7, wy + u * 0.2, wx + side * u * 0.9, wy + u * 0.6);
      } else if (p.wings === 'feather') {
        g.fillStyle(secondary, 1);
        g.fillEllipse(wx + side * u * 0.9, wy - u * 0.5, u * 1.6, u * 0.8);
        g.fillEllipse(wx + side * u * 1.2, wy - u * 0.1, u * 1.4, u * 0.6);
      } else {
        g.fillStyle(secondary, 1);
        g.fillTriangle(wx, wy - u * 0.3, wx + side * u * 1.1, wy - u * 1.1, wx + side * u * 0.5, wy + u * 0.3);
      }
    }
  }

  // Legs
  g.fillStyle(primary, 1);
  g.fillEllipse(x - bw * 0.3, y + bh / 2, u * 0.7, u * 0.7);
  g.fillEllipse(x + bw * 0.3, y + bh / 2, u * 0.7, u * 0.7);

  // Body
  g.fillStyle(primary, 1);
  g.fillEllipse(x, y, bw, bh);
  // Belly
  g.fillStyle(secondary, 1);
  g.fillEllipse(x + bw * 0.05, y + bh * 0.15, bw * 0.55, bh * 0.55);

  // Back spikes along the top of the body
  if (p.spikes > 0) {
    g.fillStyle(accent, 1);
    const span = bw * 0.7;
    for (let i = 0; i < p.spikes; i++) {
      const t = p.spikes === 1 ? 0.5 : i / (p.spikes - 1);
      const sx = x - span / 2 + span * t;
      const sy = y - bh / 2 + Math.abs(t - 0.5) * bh * 0.35;
      const sh = u * (0.55 - Math.abs(t - 0.5) * 0.3);
      g.fillTriangle(sx - u * 0.18, sy + u * 0.05, sx + u * 0.18, sy + u * 0.05, sx, sy - sh);
    }
  }

  // Heads
  const headR = u * (p.heads === 1 ? 0.75 : p.heads === 2 ? 0.6 : 0.5);
  const headY = y - bh / 2 - headR * 0.4;
  const spread = p.heads === 1 ? 0 : p.heads === 2 ? bw * 0.28 : bw * 0.34;
  for (let i = 0; i < p.heads; i++) {
    const t = p.heads === 1 ? 0 : i / (p.heads - 1) - 0.5;
    const hx = x + t * 2 * spread + bw * 0.12;
    const hy = headY - Math.abs(t) * headR * 0.3;

    // Neck for multi-headed
    if (p.heads > 1) {
      g.fillStyle(primary, 1);
      g.fillEllipse((hx + x) / 2, (hy + y - bh * 0.3) / 2, headR * 0.9, headR * 1.6);
    }

    // Horns
    if (p.horns > 0) {
      g.fillStyle(accent, 1);
      for (let h = 0; h < p.horns; h++) {
        const ht = p.horns === 1 ? 0 : h / (p.horns - 1) - 0.5;
        const hxx = hx + ht * headR * 1.1;
        g.fillTriangle(hxx - headR * 0.18, hy - headR * 0.7, hxx + headR * 0.18, hy - headR * 0.7, hxx + ht * headR * 0.4, hy - headR * 1.5);
      }
    }

    g.fillStyle(primary, 1);
    g.fillCircle(hx, hy, headR);
    // Snout
    g.fillEllipse(hx + headR * 0.55, hy + headR * 0.2, headR * 0.9, headR * 0.6);
    // Eye
    const eyeX = hx + headR * 0.25;
    const eyeY = hy - headR * 0.2;
    g.fillStyle(0xffffff, 1);
    g.fillCircle(eyeX, eyeY, headR * 0.3);
    g.fillStyle(genome.alignment === 'villain' ? accent : dark, 1);
    g.fillCircle(eyeX + headR * 0.08, eyeY, headR * 0.15);
    // Brow for villains: angry line
    if (genome.alignment === 'villain') {
      g.lineStyle(Math.max(2, headR * 0.12), dark, 1);
      g.lineBetween(eyeX - headR * 0.4, eyeY - headR * 0.45, eyeX + headR * 0.3, eyeY - headR * 0.25);
    }
    // Mouth
    g.lineStyle(Math.max(2, headR * 0.1), dark, 1);
    g.lineBetween(hx + headR * 0.35, hy + headR * 0.45, hx + headR * 0.95, hy + headR * 0.4);
  }

  // Shiny sparkles
  if (genome.shiny) {
    g.fillStyle(0xffffff, 0.9);
    const pts = [
      [x - bw * 0.6, y - bh * 0.6],
      [x + bw * 0.65, y - bh * 0.3],
      [x + bw * 0.2, y - bh * 0.9],
    ];
    for (const [px, py] of pts) drawStar(g, px!, py!, u * 0.18);
  }
}

export function drawStar(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number) {
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
export function drawSilhouette(g: Phaser.GameObjects.Graphics, genome: Genome, x: number, y: number, scale = 1) {
  const dark: Genome = {
    ...genome,
    shiny: false,
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
export function drawEgg(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: string, ratio: number) {
  g.fillStyle(0x000000, 0.15);
  g.fillEllipse(x, y + r * 1.2, r * 1.8, r * 0.5);
  g.fillStyle(0xf5f5f5, 1);
  g.fillEllipse(x, y, r * 1.6, r * 2.1);
  // Fill from the bottom by the fragment ratio
  const c = hex(color);
  g.fillStyle(c, 0.85);
  const fillH = r * 2.1 * ratio;
  g.fillEllipse(x, y + (r * 2.1 - fillH) / 2, r * 1.6 * (0.6 + 0.4 * ratio), fillH);
  g.fillStyle(0xffffff, 0.6);
  g.fillEllipse(x - r * 0.35, y - r * 0.6, r * 0.4, r * 0.7);
  g.lineStyle(3, 0xcfd8dc, 1);
  g.strokeEllipse(x, y, r * 1.6, r * 2.1);
}
