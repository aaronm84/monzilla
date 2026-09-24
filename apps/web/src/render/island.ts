import Phaser from 'phaser';
import { BIOME_INFO, BLOCK_INFO, Rng, blockKey, forkSeed, type Biome, type BlockKind, type BuildLayer, type Island } from '@monzilla/core';

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
export interface TileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * @param rect Only draw tiles in this range (inclusive). Zoomed-in views
 * pass the visible range so the per-frame draw stays small.
 */
export function drawIslandTiles(g: Phaser.GameObjects.Graphics, island: Island, view: IslandView, gridLines = false, rect?: TileRect) {
  const t = view.tile;
  const W = island.width;
  const H = island.height;
  const X0 = Math.max(0, rect?.x0 ?? 0);
  const Y0 = Math.max(0, rect?.y0 ?? 0);
  const X1 = Math.min(W - 1, rect?.x1 ?? W - 1);
  const Y1 = Math.min(H - 1, rect?.y1 ?? H - 1);

  // Water: deep base, then shallows that brighten toward the shore.
  g.fillStyle(0x2f8fc7, 1);
  g.fillRect(view.ox + (X0 - 1) * t, view.oy + (Y0 - 1) * t, t * (X1 - X0 + 3), t * (Y1 - Y0 + 3));
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
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
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      const tile = island.tiles[y * W + x]!;
      if (tile.terrain === 'water') continue;
      g.fillStyle(shade(hex(BIOME_INFO[tile.terrain].color), -35), 1);
      landRect(x, y, t * 0.22);
    }
  }
  // Foam: a soft white halo around the coast.
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      const tile = island.tiles[y * W + x]!;
      if (tile.terrain === 'water') continue;
      g.fillStyle(0xffffff, 0.35);
      g.fillRoundedRect(view.ox + x * t - grow - t * 0.1, view.oy + y * t - grow - t * 0.1, t + grow * 2 + t * 0.2, t + grow * 2 + t * 0.2, t * 0.5);
    }
  }
  // Land tops, lighter with elevation.
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      const tile = island.tiles[y * W + x]!;
      if (tile.terrain === 'water') continue;
      const base = hex(BIOME_INFO[tile.terrain].color);
      g.fillStyle(shade(base, Math.round((tile.elevation - 0.5) * 30)), 1);
      landRect(x, y, 0);
    }
  }
  // Scattered soft highlights for a painted feel, placed per tile from the
  // seed so they never line up into a grid pattern.
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
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
    for (let y = Y0; y <= Y1; y++) {
      for (let x = X0; x <= X1; x++) {
        if (island.tiles[y * W + x]!.terrain === 'water') continue;
        g.strokeRect(view.ox + x * t, view.oy + y * t, t, t);
      }
    }
  }

  // Props, deterministic per tile, skipped in build mode so the grid is clear.
  if (!gridLines) {
    for (let y = Y0; y <= Y1; y++) {
      for (let x = X0; x <= X1; x++) {
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

/** Vertical offset per stacked block, as a fraction of a tile. */
export const STACK_RISE = 0.38;

/** One chunky cube at a pixel position. */
export function drawCube(g: Phaser.GameObjects.Graphics, px: number, py: number, s: number, kind: BlockKind, alpha = 1) {
  const color = hex(BLOCK_INFO[kind].color);
  const light = shade(color, 25);
  const dark = shade(color, -20);
  g.fillStyle(dark, alpha);
  g.fillRoundedRect(px, py + s * 0.35, s, s * 0.65, s * 0.12);
  g.fillStyle(light, alpha);
  g.fillRoundedRect(px, py, s, s * 0.5, s * 0.12);
  g.fillStyle(color, alpha);
  g.fillRoundedRect(px + s * 0.08, py + s * 0.12, s * 0.84, s * 0.6, s * 0.1);
  g.lineStyle(Math.max(1.5, s * 0.06), 0xffffff, 0.5 * alpha);
  g.strokeRoundedRect(px, py, s, s, s * 0.12);
  if (kind === 'tower') {
    g.fillStyle(0xeceff1, alpha);
    g.fillTriangle(px + s * 0.5, py - s * 0.3, px + s * 0.25, py + s * 0.2, px + s * 0.75, py + s * 0.2);
  }
  if (kind === 'roof') {
    g.fillStyle(shade(color, -10), alpha);
    g.fillTriangle(px - s * 0.05, py + s * 0.3, px + s * 1.05, py + s * 0.3, px + s * 0.5, py - s * 0.25);
  }
  if (kind === 'lantern') {
    g.fillStyle(0xffe082, 0.5 * alpha);
    g.fillCircle(px + s * 0.5, py + s * 0.5, s * 0.8);
  }
  if (kind === 'flower') {
    g.fillStyle(0xf8bbd0, alpha);
    g.fillCircle(px + s * 0.5, py + s * 0.4, s * 0.2);
  }
}

/**
 * Draw placed blocks as stacked cubes, bottom to top, each level rising so
 * towers read as tall. Broken tiles show a cracked outline on top. Sorted
 * by row so a tall stack in front covers what is behind it.
 */
export function drawBlocks(g: Phaser.GameObjects.Graphics, blocks: BuildLayer, view: IslandView) {
  const t = view.tile;
  const inset = Math.max(2, t * 0.1);
  const s = t - inset * 2;
  const sorted = Object.values(blocks).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const b of sorted) {
    const px = view.ox + b.x * t + inset;
    const base = view.oy + b.y * t + inset;
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(px + s * 0.5, base + s * 1.02, s * 1.05, s * 0.3);
    b.kinds.forEach((kind, i) => drawCube(g, px, base - i * t * STACK_RISE, s, kind, b.broken ? 0.55 : 1));
    if (b.broken) {
      const top = base - (b.kinds.length - 1) * t * STACK_RISE;
      g.lineStyle(Math.max(2, t * 0.08), 0xffffff, 0.9);
      g.strokeRoundedRect(px, top, s, s, s * 0.15);
      g.lineStyle(Math.max(2, t * 0.06), 0xff5252, 0.9);
      g.lineBetween(px + s * 0.2, top + s * 0.1, px + s * 0.5, top + s * 0.5);
      g.lineBetween(px + s * 0.5, top + s * 0.5, px + s * 0.35, top + s * 0.9);
      g.lineBetween(px + s * 0.5, top + s * 0.5, px + s * 0.85, top + s * 0.6);
    }
  }
}

/** Ghost cubes for a plan: what still needs building on each tile. */
export function drawPlanGhost(g: Phaser.GameObjects.Graphics, cells: { dx: number; dy: number; kinds: BlockKind[] }[], blocks: BuildLayer, view: IslandView) {
  const t = view.tile;
  const inset = Math.max(2, t * 0.1);
  const s = t - inset * 2;
  for (const c of cells) {
    const have = blocks[blockKey(c.dx, c.dy)];
    const built = have && !have.broken ? have.kinds.length : 0;
    const px = view.ox + c.dx * t + inset;
    const base = view.oy + c.dy * t + inset;
    g.lineStyle(2, 0x1f3a68, 0.5);
    g.strokeRoundedRect(px, base, s, s, s * 0.12);
    c.kinds.forEach((kind, i) => {
      if (i < built) return;
      drawCube(g, px, base - i * t * STACK_RISE, s, kind, 0.35);
    });
  }
}

/** A soft ring and badge under a recognised structure. */
export function drawStructureBadge(g: Phaser.GameObjects.Graphics, tiles: { x: number; y: number }[], view: IslandView, color: number) {
  const t = view.tile;
  const xs = tiles.map((p) => p.x);
  const ys = tiles.map((p) => p.y);
  const x0 = Math.min(...xs) * t + view.ox;
  const y0 = Math.min(...ys) * t + view.oy;
  const w = (Math.max(...xs) - Math.min(...xs) + 1) * t;
  const h = (Math.max(...ys) - Math.min(...ys) + 1) * t;
  g.lineStyle(Math.max(2, t * 0.06), color, 0.7);
  g.strokeRoundedRect(x0 - 3, y0 - 3, w + 6, h + 6, t * 0.2);
}

export function keyOf(x: number, y: number) {
  return blockKey(x, y);
}
