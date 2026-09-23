import { isLand, type Island } from './world.js';

export interface TilePos {
  x: number;
  y: number;
}

const DIRS: TilePos[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * Shortest walk over land from one tile to another, four-connected.
 * Returns the tiles to step through, not including the start, or null if
 * the target is water or unreachable. Breadth-first is plenty for an
 * island this size.
 */
export function findPath(island: Island, from: TilePos, to: TilePos, blocked?: (x: number, y: number) => boolean): TilePos[] | null {
  if (!isLand(island, to.x, to.y)) return null;
  if (from.x === to.x && from.y === to.y) return [];
  const key = (p: TilePos) => p.y * island.width + p.x;
  const prev = new Map<number, number>();
  const queue: TilePos[] = [from];
  const seen = new Set<number>([key(from)]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const d of DIRS) {
      const next = { x: cur.x + d.x, y: cur.y + d.y };
      const k = key(next);
      if (seen.has(k) || !isLand(island, next.x, next.y)) continue;
      if (blocked?.(next.x, next.y) && !(next.x === to.x && next.y === to.y)) continue;
      seen.add(k);
      prev.set(k, key(cur));
      if (next.x === to.x && next.y === to.y) {
        const path: TilePos[] = [];
        let k2 = k;
        while (k2 !== key(from)) {
          path.push({ x: k2 % island.width, y: Math.floor(k2 / island.width) });
          k2 = prev.get(k2)!;
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

/** The land tile closest to the island's centre: where new kaiju appear. */
export function spawnTile(island: Island): TilePos {
  const cx = (island.width - 1) / 2;
  const cy = (island.height - 1) / 2;
  let best: TilePos = { x: Math.round(cx), y: Math.round(cy) };
  let bestD = Infinity;
  for (let y = 0; y < island.height; y++) {
    for (let x = 0; x < island.width; x++) {
      if (!isLand(island, x, y)) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  return best;
}

/** A beach tile on the lower shore for the egg nest, or the spawn tile. */
export function nestTile(island: Island): TilePos {
  const cx = (island.width - 1) / 2;
  let best: TilePos | null = null;
  let bestScore = -Infinity;
  for (let y = 0; y < island.height; y++) {
    for (let x = 0; x < island.width; x++) {
      const t = island.tiles[y * island.width + x]!;
      if (t.terrain !== 'beach') continue;
      const score = y * 2 - Math.abs(x - cx);
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best ?? spawnTile(island);
}

/** Land tiles next to a tile, for wandering. */
export function landNeighbours(island: Island, p: TilePos): TilePos[] {
  return DIRS.map((d) => ({ x: p.x + d.x, y: p.y + d.y })).filter((n) => isLand(island, n.x, n.y));
}
