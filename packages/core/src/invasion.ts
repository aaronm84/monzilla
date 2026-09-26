import { blockKey, isLand, type BuildLayer, type Island, type Block } from './world.js';
import { findPath, nestTile, type TilePos } from './nav.js';
import { Rng, forkSeed } from './rng.js';
import type { Villain } from './villain.js';
import type { Structure } from './blueprints.js';

/**
 * Where a villain came from. Picks the landing shore and gives the dex a
 * one-line story. Icons only, for a kid who reads pictures.
 */
export const ORIGINS = ['tide', 'storm', 'volcano', 'deep', 'sky'] as const;
export type Origin = (typeof ORIGINS)[number];
export const ORIGIN_INFO: Record<Origin, { icon: string; label: string; story: string }> = {
  tide: { icon: '🌊', label: 'From the tide', story: 'Drifted in on the tide.' },
  storm: { icon: '⛈️', label: 'From a storm', story: 'Fell out of a storm cloud.' },
  volcano: { icon: '🌋', label: 'From the volcano', story: 'Woke up inside the volcano.' },
  deep: { icon: '🕳️', label: 'From underground', story: 'Dug up from deep below.' },
  sky: { icon: '🪐', label: 'From space', story: 'Landed from far, far away.' },
};

/** What a villain wants on the island. Decides where it walks. */
export const GOALS = ['nest', 'tower', 'lantern', 'nap'] as const;
export type Goal = (typeof GOALS)[number];
export const GOAL_INFO: Record<Goal, { icon: string; label: string }> = {
  nest: { icon: '🥚', label: 'Wants the egg' },
  tower: { icon: '🗼', label: 'Wants the tallest tower' },
  lantern: { icon: '🏮', label: 'Wants the lanterns' },
  nap: { icon: '🛏️', label: 'Wants a nap in the middle' },
};

/** One signature trick per villain, felt in the fight. */
export const ABILITIES = ['none', 'fog', 'stompy', 'sturdy', 'speedy', 'sleepy'] as const;
export type Ability = (typeof ABILITIES)[number];
export const ABILITY_INFO: Record<Ability, { icon: string; label: string; blurb: string }> = {
  none: { icon: '', label: '', blurb: '' },
  fog: { icon: '🌫️', label: 'Fog', blurb: 'Hides the numbers on your moves' },
  stompy: { icon: '🦶', label: 'Stompy', blurb: 'Breaks two blocks at a time' },
  sturdy: { icon: '🛡️', label: 'Sturdy', blurb: 'Extra tough' },
  speedy: { icon: '💨', label: 'Speedy', blurb: 'Walks two tiles a turn' },
  sleepy: { icon: '😴', label: 'Sleepy', blurb: 'Sometimes skips a turn' },
};

export interface Invasion {
  villain: Villain;
  origin: Origin;
  goal: Goal;
  ability: Ability;
  /** Where it landed and where it is now, in tiles. */
  landing: TilePos;
  pos: TilePos;
  goalTile: TilePos;
  /** Whether it reached the goal and settled there. */
  arrived: boolean;
  /** Villain turns taken so far. */
  turns: number;
}

/** A coastal land tile: land with water on at least one side. */
export function shoreTiles(island: Island): TilePos[] {
  const out: TilePos[] = [];
  for (let y = 0; y < island.height; y++) {
    for (let x = 0; x < island.width; x++) {
      if (!isLand(island, x, y)) continue;
      if (!isLand(island, x - 1, y) || !isLand(island, x + 1, y) || !isLand(island, x, y - 1) || !isLand(island, x, y + 1)) out.push({ x, y });
    }
  }
  return out;
}

/** Landing spot by origin: a shore tile on the matching side, or any shore. */
export function landingTile(island: Island, origin: Origin, rng: Rng): TilePos {
  const shore = shoreTiles(island);
  const cx = (island.width - 1) / 2;
  const cy = (island.height - 1) / 2;
  const pick = (filter: (p: TilePos) => boolean) => {
    const c = shore.filter(filter);
    return c.length > 0 ? rng.pick(c) : rng.pick(shore);
  };
  switch (origin) {
    case 'tide':
      return pick((p) => p.y > cy);
    case 'storm':
      return pick((p) => p.y < cy);
    case 'volcano':
      return pick((p) => p.x > cx);
    case 'deep':
      return pick((p) => p.x < cx);
    case 'sky':
      return rng.pick(shore);
  }
}

/** Where the goal is on this island right now. */
export function goalTile(island: Island, goal: Goal, blocks: BuildLayer, structures: Structure[]): TilePos {
  const nest = nestTile(island);
  if (goal === 'nest') return nest;
  if (goal === 'tower') {
    const towers = structures.filter((s) => s.id === 'watchtower');
    if (towers.length > 0) return { x: towers[0]!.x, y: towers[0]!.y };
    // Otherwise the tallest stack.
    let best: Block | null = null;
    for (const b of Object.values(blocks)) if (!best || b.kinds.length > best.kinds.length) best = b;
    if (best) return { x: best.x, y: best.y };
  }
  if (goal === 'lantern') {
    const l = Object.values(blocks).find((b) => b.kinds.includes('lantern'));
    if (l) return { x: l.x, y: l.y };
  }
  if (goal === 'nap') {
    const cx = Math.round((island.width - 1) / 2);
    const cy = Math.round((island.height - 1) / 2);
    for (let r = 0; r < 6; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (isLand(island, cx + dx, cy + dy) && !blocks[blockKey(cx + dx, cy + dy)]) return { x: cx + dx, y: cy + dy };
    }
  }
  return nest;
}

export function newInvasion(villain: Villain, island: Island, blocks: BuildLayer, structures: Structure[], seed: number): Invasion {
  const rng = new Rng(forkSeed(seed, `invasion:${villain.id}`));
  const origin = villain.origin ?? rng.pick(ORIGINS);
  const goal = villain.goal ?? rng.pick(GOALS);
  const ability = villain.ability ?? rng.weighted<Ability>([
    { value: 'none', weight: 3 },
    { value: 'fog', weight: 1 },
    { value: 'stompy', weight: 1 },
    { value: 'sturdy', weight: 1 },
    { value: 'speedy', weight: 1 },
    { value: 'sleepy', weight: 1 },
  ]);
  const landing = landingTile(island, origin, rng);
  return { villain, origin, goal, ability, landing, pos: landing, goalTile: goalTile(island, goal, blocks, structures), arrived: false, turns: 0 };
}

/**
 * The villain's route: it walks over land and treats blocks as things to
 * smash through rather than walls it can't pass. The path prefers open
 * tiles (cost 1) over blocked ones (cost 4) so walls slow it down but a
 * fully walled nest still gets reached eventually.
 */
export function invasionPath(island: Island, from: TilePos, to: TilePos, blocks: BuildLayer): TilePos[] | null {
  // Weighted search: Dijkstra on a small grid.
  const key = (p: TilePos) => p.y * island.width + p.x;
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const open: { p: TilePos; d: number }[] = [{ p: from, d: 0 }];
  dist.set(key(from), 0);
  while (open.length > 0) {
    open.sort((a, b) => a.d - b.d);
    const cur = open.shift()!;
    if (cur.p.x === to.x && cur.p.y === to.y) break;
    if (cur.d > (dist.get(key(cur.p)) ?? Infinity)) continue;
    for (const d of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const n = { x: cur.p.x + d.x, y: cur.p.y + d.y };
      if (!isLand(island, n.x, n.y)) continue;
      const cost = blocks[blockKey(n.x, n.y)] ? 4 : 1;
      const nd = cur.d + cost;
      const nk = key(n);
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        prev.set(nk, key(cur.p));
        open.push({ p: n, d: nd });
      }
    }
  }
  if (!dist.has(key(to))) return null;
  const path: TilePos[] = [];
  let k = key(to);
  while (k !== key(from)) {
    path.push({ x: k % island.width, y: Math.floor(k / island.width) });
    const p = prev.get(k);
    if (p === undefined) return null;
    k = p;
  }
  return path.reverse();
}

/** Tiles a villain walks per turn. */
export const STRIDE = 3;

export interface InvasionStep {
  invasion: Invasion;
  blocks: BuildLayer;
  /** Blocks it smashed this turn (a block in its way is broken, not walked over). */
  broken: Block[];
  skipped: boolean;
}

/**
 * One villain turn. It moves along its route; if the next tile holds an
 * intact block it stomps it instead of moving (stompy breaks two). A
 * watchtower's break chance applies to the stomp. Sleepy villains sometimes
 * do nothing at all.
 */
export function advanceInvasion(inv: Invasion, island: Island, blocks: BuildLayer, breakChance: number, rng: Rng): InvasionStep {
  if (inv.arrived) return { invasion: inv, blocks, broken: [], skipped: false };
  if (inv.ability === 'sleepy' && rng.chance(0.35)) return { invasion: { ...inv, turns: inv.turns + 1 }, blocks, broken: [], skipped: true };
  let pos = inv.pos;
  let layer = blocks;
  const broken: Block[] = [];
  // A kaiju stride: several tiles a turn, so a fight of five or six moves
  // covers most of a route across the island. Blocks in the way cost the
  // rest of the turn, which is what makes walls worth building.
  const moves = inv.ability === 'speedy' ? STRIDE + 2 : STRIDE;
  for (let m = 0; m < moves; m++) {
    const path = invasionPath(island, pos, inv.goalTile, layer);
    if (!path || path.length === 0) break;
    const next = path[0]!;
    const b = layer[blockKey(next.x, next.y)];
    if (b && !b.broken) {
      // Stomp instead of stepping. Towers lower the odds.
      if (rng.chance(breakChance + 0.35)) {
        layer = { ...layer, [blockKey(next.x, next.y)]: { ...b, broken: true } };
        broken.push(layer[blockKey(next.x, next.y)]!);
        if (inv.ability === 'stompy') {
          const others = Object.values(layer).filter((o) => !o.broken && Math.abs(o.x - next.x) + Math.abs(o.y - next.y) <= 1);
          if (others.length > 0) {
            const o = rng.pick(others);
            layer = { ...layer, [blockKey(o.x, o.y)]: { ...o, broken: true } };
            broken.push(layer[blockKey(o.x, o.y)]!);
          }
        }
      }
      break; // stomping takes the turn
    }
    pos = next;
  }
  const arrived = pos.x === inv.goalTile.x && pos.y === inv.goalTile.y;
  return { invasion: { ...inv, pos, arrived, turns: inv.turns + 1 }, blocks: layer, broken, skipped: false };
}

/** Tiles left to walk, for the "steps until it gets there" counter. */
export function invasionStepsLeft(inv: Invasion, island: Island, blocks: BuildLayer): number {
  if (inv.arrived) return 0;
  return invasionPath(island, inv.pos, inv.goalTile, blocks)?.length ?? 0;
}
