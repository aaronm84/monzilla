import Phaser from 'phaser';
import { BIOME_INFO, BLOCK_INFO, blockKey, type BuildLayer, type Island } from '@monzilla/core';

const hex = (s: string) => Phaser.Display.Color.HexStringToColor(s).color;

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

/** Draw water and terrain tiles. Slight per-tile shading from elevation. */
export function drawIslandTiles(g: Phaser.GameObjects.Graphics, island: Island, view: IslandView, gridLines = false) {
  const t = view.tile;
  g.fillStyle(0x1e5f8f, 1);
  g.fillRect(view.ox - t, view.oy - t, t * (island.width + 2), t * (island.height + 2));
  for (let y = 0; y < island.height; y++) {
    for (let x = 0; x < island.width; x++) {
      const tile = island.tiles[y * island.width + x]!;
      const px = view.ox + x * t;
      const py = view.oy + y * t;
      if (tile.terrain === 'water') {
        const shade = 0.15 + tile.elevation * 0.4;
        g.fillStyle(0x2a7fb8, shade);
        g.fillRect(px, py, t, t);
        continue;
      }
      const base = Phaser.Display.Color.HexStringToColor(BIOME_INFO[tile.terrain].color);
      const k = 0.8 + tile.elevation * 0.35;
      const c = Phaser.Display.Color.GetColor(
        Math.min(255, base.red * k),
        Math.min(255, base.green * k),
        Math.min(255, base.blue * k),
      );
      g.fillStyle(c, 1);
      g.fillRect(px, py, t, t);
      if (gridLines) {
        g.lineStyle(1, 0x000000, 0.12);
        g.strokeRect(px, py, t, t);
      }
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
      g.lineStyle(Math.max(2, t * 0.08), 0xffffff, 0.8);
      g.strokeRoundedRect(px, py, s, s, s * 0.15);
      g.lineStyle(Math.max(2, t * 0.06), 0xff5252, 0.9);
      g.lineBetween(px + s * 0.2, py + s * 0.1, px + s * 0.5, py + s * 0.5);
      g.lineBetween(px + s * 0.5, py + s * 0.5, px + s * 0.35, py + s * 0.9);
      g.lineBetween(px + s * 0.5, py + s * 0.5, px + s * 0.85, py + s * 0.6);
      continue;
    }
    // Top face lighter, front face darker for a cube feel.
    const light = Phaser.Display.Color.IntegerToColor(color).lighten(25).color;
    const dark = Phaser.Display.Color.IntegerToColor(color).darken(20).color;
    g.fillStyle(dark, 1);
    g.fillRoundedRect(px, py + s * 0.35, s, s * 0.65, s * 0.12);
    g.fillStyle(light, 1);
    g.fillRoundedRect(px, py, s, s * 0.5, s * 0.12);
    g.fillStyle(color, 1);
    g.fillRoundedRect(px + s * 0.08, py + s * 0.12, s * 0.84, s * 0.6, s * 0.1);
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
