import { Rng, forkSeed } from './rng.js';
import type { KaijuType } from './types.js';

export const BIOMES = ['beach', 'meadow', 'forest', 'volcano', 'ice', 'swamp', 'cloud'] as const;
export type Biome = (typeof BIOMES)[number];

/** Each biome is home to one type. */
export const BIOME_TYPE: Record<Biome, KaijuType> = {
  beach: 'water',
  meadow: 'lightning',
  forest: 'plant',
  volcano: 'fire',
  ice: 'ice',
  swamp: 'rock',
  cloud: 'sky',
};

export const BIOME_INFO: Record<Biome, { color: string; icon: string }> = {
  beach: { color: '#f3e2b3', icon: '🏖️' },
  meadow: { color: '#a5d86a', icon: '🌾' },
  forest: { color: '#5fae5a', icon: '🌲' },
  volcano: { color: '#8d6e63', icon: '🌋' },
  ice: { color: '#dff4ff', icon: '🧊' },
  swamp: { color: '#9aa34a', icon: '🐸' },
  cloud: { color: '#f3eeff', icon: '☁️' },
};

export type Terrain = Biome | 'water';

export interface Tile {
  terrain: Terrain;
  /** 0..1, water below ~0.35 */
  elevation: number;
}

export interface Island {
  seed: number;
  width: number;
  height: number;
  tiles: Tile[]; // row-major, index = y * width + x
}

/** Smooth value noise; enough for cartoon islands without a dependency. */
function valueNoise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const corner = (cx: number, cy: number) => new Rng(forkSeed(seed, `${cx},${cy}`)).next();
  const fade = (t: number) => t * t * (3 - 2 * t);
  const u = fade(xf);
  const v = fade(yf);
  const a = corner(xi, yi);
  const b = corner(xi + 1, yi);
  const c = corner(xi, yi + 1);
  const d = corner(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(seed: number, x: number, y: number, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(forkSeed(seed, i), x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export const WATER_LEVEL = 0.35;

/**
 * Generate an island. Elevation is noise times a radial falloff so the land
 * sits in the middle with water around it. Biome comes from a second noise
 * field plus elevation: high ground is volcano or ice, low ground is beach
 * or swamp, and the middle is meadow or forest. Cloud appears only on the
 * highest peaks.
 */
export function generateIsland(seed: number, width = 16, height = 12): Island {
  const tiles: Tile[] = [];
  const elevSeed = forkSeed(seed, 'elev');
  const biomeSeed = forkSeed(seed, 'biome');
  const tempSeed = forkSeed(seed, 'temp');
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x - cx) / (width / 2);
      const ny = (y - cy) / (height / 2);
      const dist = Math.sqrt(nx * nx + ny * ny);
      const falloff = Math.max(0, 1 - dist * dist * 1.1);
      const n = fbm(elevSeed, x / 5, y / 5);
      const elevation = Math.max(0, Math.min(1, n * 0.7 * falloff + falloff * 0.35));
      if (elevation < WATER_LEVEL) {
        tiles.push({ terrain: 'water', elevation });
        continue;
      }
      const moisture = fbm(biomeSeed, x / 4, y / 4);
      const temp = fbm(tempSeed, x / 6, y / 6);
      let biome: Biome;
      if (elevation > 0.9) biome = 'cloud';
      else if (elevation > 0.72) biome = temp > 0.5 ? 'volcano' : 'ice';
      else if (elevation < 0.45) biome = moisture > 0.55 ? 'swamp' : 'beach';
      else biome = moisture > 0.5 ? 'forest' : 'meadow';
      tiles.push({ terrain: biome, elevation });
    }
  }
  return { seed, width, height, tiles };
}

export function tileAt(island: Island, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= island.width || y >= island.height) return undefined;
  return island.tiles[y * island.width + x];
}

export function isLand(island: Island, x: number, y: number): boolean {
  const t = tileAt(island, x, y);
  return !!t && t.terrain !== 'water';
}

/** Biomes present on the island, most common first. */
export function biomeCounts(island: Island): { biome: Biome; count: number }[] {
  const counts = new Map<Biome, number>();
  for (const t of island.tiles) {
    if (t.terrain === 'water') continue;
    counts.set(t.terrain, (counts.get(t.terrain) ?? 0) + 1);
  }
  return [...counts.entries()].map(([biome, count]) => ({ biome, count })).sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Building layer: blocks the kid places on top of the generated island.

export const BLOCK_KINDS = ['stone', 'wood', 'brick', 'glass', 'roof', 'tower', 'flower', 'lantern'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export const BLOCK_INFO: Record<BlockKind, { icon: string; color: string; label: string }> = {
  stone: { icon: '🧱', color: '#9e9e9e', label: 'Stone' },
  wood: { icon: '🪵', color: '#a1734b', label: 'Wood' },
  brick: { icon: '🟥', color: '#c62828', label: 'Brick' },
  glass: { icon: '🟦', color: '#81d4fa', label: 'Glass' },
  roof: { icon: '🔺', color: '#ef6c00', label: 'Roof' },
  tower: { icon: '🗼', color: '#607d8b', label: 'Tower' },
  flower: { icon: '🌸', color: '#f48fb1', label: 'Flower' },
  lantern: { icon: '🏮', color: '#ffb300', label: 'Lantern' },
};

export interface Block {
  x: number;
  y: number;
  kind: BlockKind;
  broken: boolean;
}

/** Keyed by "x,y" so lookups are cheap and the save is a plain object. */
export type BuildLayer = Record<string, Block>;

export const blockKey = (x: number, y: number) => `${x},${y}`;

export function placeBlock(layer: BuildLayer, island: Island, x: number, y: number, kind: BlockKind): BuildLayer {
  if (!isLand(island, x, y)) return layer;
  return { ...layer, [blockKey(x, y)]: { x, y, kind, broken: false } };
}

export function removeBlock(layer: BuildLayer, x: number, y: number): BuildLayer {
  const next = { ...layer };
  delete next[blockKey(x, y)];
  return next;
}

export function repairBlock(layer: BuildLayer, x: number, y: number): BuildLayer {
  const b = layer[blockKey(x, y)];
  if (!b || !b.broken) return layer;
  return { ...layer, [blockKey(x, y)]: { ...b, broken: false } };
}

/** A villain stomp: break one intact block, chosen deterministically. */
export function breakRandomBlock(layer: BuildLayer, rng: Rng): { layer: BuildLayer; broken: Block | null } {
  const intact = Object.values(layer).filter((b) => !b.broken);
  if (intact.length === 0) return { layer, broken: null };
  const target = rng.pick(intact);
  const broken = { ...target, broken: true };
  return { layer: { ...layer, [blockKey(target.x, target.y)]: broken }, broken };
}

export function brokenBlocks(layer: BuildLayer): Block[] {
  return Object.values(layer).filter((b) => b.broken);
}
