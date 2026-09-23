import Phaser from 'phaser';
import { BIOME_INFO, BLOCK_INFO, Rng, blockKey, forkSeed, type Biome, type BuildLayer, type Island } from '@monzilla/core';

const hex = (s: string) => Phaser.Display.Color.HexStringToColor(s).color;
const shade = (color: number, amount: number) => {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return amount >= 0 ? c.lighten(amount).color : c.darken(-amount).color;
};

export interface IslandView {
  /** pixel origin of tile (0,0) */
  ox: number;
  oy: number;
  tile: number;
  tileToPixel(x: number, y: number): { x: number; y: number };
  pixelToTile(px: number, py: number): { x: number; y: number } | null;
}

/** Fit the island grid into a rectangle and return the mapping. */
export function fitIsland(island: Island, x: number, y: number, w: number, h: number): IslandView {
  const tile = Math.floor(Math.min(w / island.width, h / island.height));
  const gw = tile * island.width;
  const gh = tile * island.height;
  const ox = x + (w - gw) / 2;
  const oy = y + (h - gh) / 2;
  return {
    ox,
    oy,
    tile,
    tileToPixel: (tx, ty) => ({ x: ox + tx * tile + tile / 2, y: oy + ty * tile + tile / 2 }),
    pixelToTile: (px, py) => {
      const tx = Math.floor((px - ox) / tile);
      const ty = Math.floor((py - oy) / tile);
      if (tx < 0 || ty < 0 || tx >= island.width || ty >= island.height) return null;
      return { x: tx, y: ty };
    },
  };
}

const isLandAt = (island: Island, x: number, y: number) => {
  if (x < 0 || y < 0 || x >= island.width || y >= island.height) return false;
  return island.tiles[y * island.width + x]!.terrain !== 'water';
};

/**
 * Paints the island the way the concept boards do: bright water with
 * lighter shallows, land drawn as overlapping rounded tiles so the coast
 * looks organic, a darker cliff band under the coast so the island sits
 * up out of the sea, foam along the shore, and a few props per biome.
 */
export function drawIslandTiles(g: Phaser.GameObjects.Graphics, island: Island, view: IslandView, gridLines = false) {
  const t = view.tile;
  const W = island.width;
  const H = island.height;

  // Water: deep base, then shallows that brighten toward the shore.
  g.fillStyle(0x2f8fc7, 1);
  g.fillRect(view.ox - t, view.oy - t, t * (W + 2), t * (H + 2));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tile = island.tiles[y * W + x]!;
      if (tile.terrain !== 'water') continue;
      const near = [isLandAt(island, x - 1, y), isLandAt(island, x + 1, y), isLandAt(island, x, y - 1), isLandAt(island, x, y + 1)].filter(Boolean).length;
      const alpha = Math.min(1, 0.15 + tile.elevation * 0.8 + near * 0.18);
      g.fillStyle(0x7fd4f0, alpha);
      g.fillRect(view.ox + x * t, view.oy + y * t, t, t);
    }
  }

  const grow = t * 0.22; // how far each land tile bulges past its cell
  const landRect = (x: number, y: number, dy: number) => {
    g.fillRoundedRect(view.ox + x * t - grow, view.oy + y * t - grow + dy, t + grow * 2, t + grow * 2, t * 0.42);
  };

  // Cliff band: the land again, shifted down and darkened, drawn first.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tile = island.tiles[y * W + x]!;
      if (tile.terrain === 'water') continue;
      g.fillStyle(shade(hex(BIOME_INFO[tile.terrain].color), -35), 1);
      landRect(x, y, t * 0.22);
    }
  }
  // Foam: a soft white halo around the coast.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tile = island.tiles[y * W + x]!;
      if (tile.terrain === 'water') continue;
      g.fillStyle(0xffffff, 0.35);
      g.fillRoundedRect(view.ox + x * t - grow - t * 0.1, view.oy + y * t - grow - t * 0.1, t + grow * 2 + t * 0.2, t + grow * 2 + t * 0.2, t * 0.5);
    }
  }
  // Land tops, lighter with elevation.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tile = island.tiles[y * W + x]!;
      if (tile.terrain === 'water') continue;
      const base = hex(BIOME_INFO[tile.terrain].color);
      g.fillStyle(shade(base, Math.round((tile.elevation - 0.5) * 30)), 1);
      landRect(x, y, 0);
    }
  }
  // Scattered soft highlights for a painted feel, placed per tile from the
  // seed so they never line up into a grid pattern.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tile = island.tiles[y * W + x]!;
      if (tile.terrain === 'water') continue;
      const rng = new Rng(forkSeed(island.seed, `hl:${x},${y}`));
      if (!rng.chance(0.6)) continue;
      g.fillStyle(0xffffff, rng.range(0.05, 0.12));
      g.fillEllipse(view.ox + x * t + t * rng.range(0.2, 0.8), view.oy + y * t + t * rng.range(0.2, 0.8), t * rng.range(0.5, 1.1), t * rng.range(0.3, 0.6));
    }
  }

  if (gridLines) {
    g.lineStyle(1, 0x1f3a68, 0.18);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (island.tiles[y * W + x]!.terrain === 'water') continue;
        g.strokeRect(view.ox + x * t, view.oy + y * t, t, t);
      }
    }
  }

  // Props, deterministic per tile, skipped in build mode so the grid is clear.
  if (!gridLines) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const tile = island.tiles[y * W + x]!;
        if (tile.terrain === 'water') continue;
        const rng = new Rng(forkSeed(island.seed, `prop:${x},${y}`));
        if (!rng.chance(0.55)) continue;
        const px = view.ox + x * t + t * rng.range(0.3, 0.7);
        const py = view.oy + y * t + t * rng.range(0.35, 0.75);
        drawProp(g, tile.terrain, px, py, t, rng);
      }
    }
  }
}

/** One small decoration for a biome. Kept tiny so blocks stay readable on top. */
function drawProp(g: Phaser.GameObjects.Graphics, biome: Biome, x: number, y: number, t: number, rng: Rng) {
  const s = t * 0.5;
  switch (biome) {
    case 'forest': {
      g.fillStyle(0x000000, 0.12);
      g.fillEllipse(x, y + s * 0.5, s * 0.9, s * 0.3);
      g.fillStyle(0x6d4c41, 1);
      g.fillRect(x - s * 0.08, y, s * 0.16, s * 0.5);
      g.fillStyle(0x2e7d32, 1);
      g.fillCircle(x, y - s * 0.1, s * 0.42);
      g.fillStyle(0x43a047, 1);
      g.fillCircle(x - s * 0.1, y - s * 0.25, s * 0.32);
      break;
    }
    case 'meadow': {
      for (let i = 0; i < 3; i++) {
        g.fillStyle(rng.pick([0xff80ab, 0xffd54f, 0xffffff, 0xb388ff]), 1);
        g.fillCircle(x + rng.range(-s * 0.5, s * 0.5), y + rng.range(-s * 0.4, s * 0.4), s * 0.11);
      }
      break;
    }
    case 'beach': {
      if (rng.chance(0.5)) {
        // Palm: trunk and three fronds.
        g.fillStyle(0x8d6e63, 1);
        g.fillRect(x - s * 0.06, y - s * 0.3, s * 0.12, s * 0.7);
        g.fillStyle(0x66bb6a, 1);
        for (const a of [-0.9, 0, 0.9]) g.fillEllipse(x + Math.sin(a) * s * 0.3, y - s * 0.35 - Math.cos(a) * s * 0.1, s * 0.55, s * 0.2);
      } else {
        g.fillStyle(0xfff3e0, 1);
        g.fillCircle(x, y, s * 0.14);
      }
      break;
    }
    case 'volcano': {
      g.fillStyle(0x4e342e, 1);
      g.fillTriangle(x - s * 0.45, y + s * 0.35, x + s * 0.45, y + s * 0.35, x, y - s * 0.4);
      g.fillStyle(0xff7043, 0.9);
      g.fillCircle(x, y - s * 0.3, s * 0.12);
      g.fillStyle(0xffab40, 0.6);
      g.fillCircle(x, y - s * 0.3, s * 0.22);
      break;
    }
    case 'ice': {
      // Crystal cluster.
      for (const [dx, h] of [
        [-0.2, 0.7],
        [0.05, 1.0],
        [0.3, 0.6],
      ] as const) {
        g.fillStyle(0xb3e5fc, 1);
        g.fillTriangle(x + dx * s - s * 0.12, y + s * 0.3, x + dx * s + s * 0.12, y + s * 0.3, x + dx * s, y + s * 0.3 - s * h);
        g.fillStyle(0xffffff, 0.6);
        g.fillTriangle(x + dx * s - s * 0.12, y + s * 0.3, x + dx * s, y + s * 0.3 - s * h, x + dx * s - s * 0.02, y + s * 0.1);
      }
      break;
    }
    case 'swamp': {
      g.fillStyle(0x33691e, 0.6);
      g.fillEllipse(x, y + s * 0.2, s * 0.9, s * 0.35);
      g.lineStyle(Math.max(1, s * 0.08), 0x558b2f, 1);
      for (const dx of [-0.25, 0, 0.25]) g.lineBetween(x + dx * s, y + s * 0.2, x + dx * s + s * 0.05, y - s * 0.4);
      break;
    }
    case 'cloud': {
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(x - s * 0.25, y, s * 0.25);
      g.fillCircle(x, y - s * 0.1, s * 0.32);
      g.fillCircle(x + s * 0.28, y, s * 0.24);
      break;
    }
  }
}

/** Draw placed blocks as chunky cubes; broken ones as cracked outlines. */
export function drawBlocks(g: Phaser.GameObjects.Graphics, blocks: BuildLayer, view: IslandView) {
  const t = view.tile;
  const inset = Math.max(2, t * 0.1);
  for (const b of Object.values(blocks)) {
    const px = view.ox + b.x * t + inset;
    const py = view.oy + b.y * t + inset;
    const s = t - inset * 2;
    const color = hex(BLOCK_INFO[b.kind].color);
    if (b.broken) {
      g.lineStyle(Math.max(2, t * 0.08), 0xffffff, 0.9);
      g.strokeRoundedRect(px, py, s, s, s * 0.15);
      g.lineStyle(Math.max(2, t * 0.06), 0xff5252, 0.9);
      g.lineBetween(px + s * 0.2, py + s * 0.1, px + s * 0.5, py + s * 0.5);
      g.lineBetween(px + s * 0.5, py + s * 0.5, px + s * 0.35, py + s * 0.9);
      g.lineBetween(px + s * 0.5, py + s * 0.5, px + s * 0.85, py + s * 0.6);
      continue;
    }
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(px + s * 0.5, py + s * 1.02, s * 1.05, s * 0.3);
    const light = shade(color, 25);
    const dark = shade(color, -20);
    g.fillStyle(dark, 1);
    g.fillRoundedRect(px, py + s * 0.35, s, s * 0.65, s * 0.12);
    g.fillStyle(light, 1);
    g.fillRoundedRect(px, py, s, s * 0.5, s * 0.12);
    g.fillStyle(color, 1);
    g.fillRoundedRect(px + s * 0.08, py + s * 0.12, s * 0.84, s * 0.6, s * 0.1);
    g.lineStyle(Math.max(1.5, s * 0.06), 0xffffff, 0.5);
    g.strokeRoundedRect(px, py, s, s, s * 0.12);
    if (b.kind === 'tower') {
      g.fillStyle(0xeceff1, 1);
      g.fillTriangle(px + s * 0.5, py - s * 0.3, px + s * 0.25, py + s * 0.2, px + s * 0.75, py + s * 0.2);
    }
    if (b.kind === 'lantern') {
      g.fillStyle(0xffe082, 0.5);
      g.fillCircle(px + s * 0.5, py + s * 0.5, s * 0.8);
    }
    if (b.kind === 'flower') {
      g.fillStyle(0xf8bbd0, 1);
      g.fillCircle(px + s * 0.5, py + s * 0.4, s * 0.2);
    }
  }
}

export function keyOf(x: number, y: number) {
  return blockKey(x, y);
}
