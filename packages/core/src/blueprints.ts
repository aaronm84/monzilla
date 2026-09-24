import { blockKey, type BlockKind, type BuildLayer } from './world.js';

/**
 * Blueprints turn blocks into structures that do something. A structure is
 * recognised from the block layer, never stored separately, so building it
 * is just placing the right stacks in the right shape.
 */
export interface BlueprintCell {
  dx: number;
  dy: number;
  /** Exact stack, bottom to top. */
  kinds: BlockKind[];
}

export interface Blueprint {
  id: 'habitat' | 'wall' | 'watchtower';
  icon: string;
  label: string;
  /** Fixed footprint, or a straight run of one repeated cell. */
  shape: { type: 'fixed'; cells: BlueprintCell[] } | { type: 'line'; kinds: BlockKind[]; minLength: number };
  /** What it does, for the drawer card. */
  effect: string;
}

export const BLUEPRINTS: Blueprint[] = [
  {
    id: 'habitat',
    icon: '🏠',
    label: 'Habitat',
    shape: {
      type: 'fixed',
      cells: [
        { dx: 0, dy: 0, kinds: ['wood', 'roof'] },
        { dx: 1, dy: 0, kinds: ['wood', 'roof'] },
        { dx: 0, dy: 1, kinds: ['wood', 'roof'] },
        { dx: 1, dy: 1, kinds: ['wood', 'roof'] },
      ],
    },
    effect: 'Kaiju sleep here: +10 rest',
  },
  {
    id: 'wall',
    icon: '🧱',
    label: 'Wall',
    shape: { type: 'line', kinds: ['stone', 'stone'], minLength: 3 },
    effect: 'Villains hit walls first',
  },
  {
    id: 'watchtower',
    icon: '🗼',
    label: 'Watchtower',
    shape: { type: 'fixed', cells: [{ dx: 0, dy: 0, kinds: ['stone', 'stone', 'tower'] }] },
    effect: 'Villains break fewer blocks',
  },
];

export function blueprintById(id: Blueprint['id']): Blueprint {
  return BLUEPRINTS.find((b) => b.id === id)!;
}

export interface Structure {
  id: Blueprint['id'];
  x: number;
  y: number;
  /** Tile keys the structure covers. */
  tiles: string[];
}

const sameStack = (a: BlockKind[] | undefined, b: BlockKind[]) => !!a && a.length === b.length && a.every((k, i) => k === b[i]);

/** Every structure currently standing in the block layer. Broken tiles don't count. */
export function findStructures(layer: BuildLayer): Structure[] {
  const out: Structure[] = [];
  const blocks = Object.values(layer);
  const stackAt = (x: number, y: number) => {
    const b = layer[blockKey(x, y)];
    return b && !b.broken ? b.kinds : undefined;
  };
  for (const bp of BLUEPRINTS) {
    if (bp.shape.type === 'fixed') {
      const cells = bp.shape.cells;
      for (const b of blocks) {
        if (cells.every((c) => sameStack(stackAt(b.x + c.dx, b.y + c.dy), c.kinds))) {
          out.push({ id: bp.id, x: b.x, y: b.y, tiles: cells.map((c) => blockKey(b.x + c.dx, b.y + c.dy)) });
        }
      }
    } else {
      const { kinds, minLength } = bp.shape;
      const used = new Set<string>();
      for (const axis of [
        { dx: 1, dy: 0 },
        { dx: 0, dy: 1 },
      ]) {
        for (const b of blocks) {
          // Only start runs at their first tile.
          if (sameStack(stackAt(b.x - axis.dx, b.y - axis.dy), kinds)) continue;
          if (!sameStack(stackAt(b.x, b.y), kinds)) continue;
          const tiles: string[] = [];
          let x = b.x;
          let y = b.y;
          while (sameStack(stackAt(x, y), kinds)) {
            tiles.push(blockKey(x, y));
            x += axis.dx;
            y += axis.dy;
          }
          if (tiles.length >= minLength && !tiles.every((t) => used.has(t))) {
            tiles.forEach((t) => used.add(t));
            out.push({ id: bp.id, x: b.x, y: b.y, tiles });
          }
        }
      }
    }
  }
  return out;
}

export interface StructureEffects {
  habitats: Structure[];
  walls: Structure[];
  watchtowers: Structure[];
  /** Extra rest from sleeping when a habitat stands. */
  restBonus: number;
  /** Villain break chance per turn: 0.5 base, each watchtower takes off 0.1, floor 0.15. */
  breakChance: number;
  wallTiles: Set<string>;
}

export function structureEffects(structures: Structure[]): StructureEffects {
  const habitats = structures.filter((s) => s.id === 'habitat');
  const walls = structures.filter((s) => s.id === 'wall');
  const watchtowers = structures.filter((s) => s.id === 'watchtower');
  return {
    habitats,
    walls,
    watchtowers,
    restBonus: habitats.length > 0 ? 10 : 0,
    breakChance: Math.max(0.15, 0.5 - watchtowers.length * 0.1),
    wallTiles: new Set(walls.flatMap((w) => w.tiles)),
  };
}

/** A stamped plan the kid is filling in: which stacks go where. */
export interface Plan {
  id: Blueprint['id'];
  x: number;
  y: number;
  /** For line blueprints: run length and axis. */
  length?: number;
  axis?: 'x' | 'y';
}

/** The cells a plan asks for, as absolute tiles with their stacks. */
export function planCells(plan: Plan): BlueprintCell[] {
  const bp = blueprintById(plan.id);
  if (bp.shape.type === 'fixed') return bp.shape.cells.map((c) => ({ dx: plan.x + c.dx, dy: plan.y + c.dy, kinds: c.kinds }));
  const n = plan.length ?? bp.shape.minLength;
  const cells: BlueprintCell[] = [];
  for (let i = 0; i < n; i++) cells.push({ dx: plan.x + (plan.axis === 'y' ? 0 : i), dy: plan.y + (plan.axis === 'y' ? i : 0), kinds: bp.shape.kinds });
  return cells;
}

/** True when every cell of the plan is built. */
export function planComplete(plan: Plan, layer: BuildLayer): boolean {
  return planCells(plan).every((c) => {
    const b = layer[blockKey(c.dx, c.dy)];
    return !!b && !b.broken && sameStack(b.kinds, c.kinds);
  });
}
