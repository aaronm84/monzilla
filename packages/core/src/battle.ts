import { kaijuStats, type Kaiju } from './care.js';
import { Rng, forkSeed } from './rng.js';
import { TYPE_INFO, typeMultiplier, type KaijuType } from './types.js';
import type { Villain } from './villain.js';
import { weatherMultiplier, type Weather } from './weather.js';
import { breakRandomBlock, type Block, type BuildLayer, type Defense } from './world.js';
import type { Invasion } from './invasion.js';

export interface Move {
  id: string;
  icon: string;
  label: string;
  /** null = neutral move, no type interaction */
  type: KaijuType | null;
  /** Base power; damage = power * stat.power / 25 * type * weather */
  power: number;
}

/**
 * Every kaiju has the same simple kit: a stomp (neutral, reliable) and a
 * typed move (bigger, but the type chart applies). Guardians get a roar
 * once fully grown. Two or three buttons is the whole battle interface.
 */
export function movesFor(kaiju: Kaiju): Move[] {
  const t = kaiju.genome.type;
  const info = TYPE_INFO[t];
  const moves: Move[] = [
    { id: 'stomp', icon: '🦶', label: 'Stomp', type: null, power: 10 },
    { id: `type_${t}`, icon: info.icon, label: `${info.label} Blast`, type: t, power: 12 },
  ];
  if (kaiju.growth.stage === 'guardian') {
    moves.push({ id: 'roar', icon: '📣', label: 'Roar', type: null, power: 16 });
  }
  return moves;
}

export type BattleStatus = 'active' | 'won';

export interface BattleTurn {
  moveId: string;
  damage: number;
  /** 2 = super effective, 0.5 = weak, 1 = normal */
  effectiveness: number;
  brokenBlock: Block | null;
}

export interface Battle {
  id: string;
  villain: Villain;
  guardianId: string;
  villainHp: number;
  weather: Weather;
  turns: BattleTurn[];
  status: BattleStatus;
  /** Contributions per helper in a team fight, keyed by member id. */
  contributions: Record<string, number>;
  /** The villain on the island: where it landed, what it wants, where it is. */
  invasion?: Invasion;
}

export function startBattle(id: string, villain: Villain, guardian: Kaiju, weather: Weather): Battle {
  return {
    id,
    villain,
    guardianId: guardian.id,
    villainHp: villain.maxHp,
    weather,
    turns: [],
    status: 'active',
    contributions: {},
  };
}

export function computeDamage(kaiju: Kaiju, move: Move, villain: Villain, weather: Weather): { damage: number; effectiveness: number } {
  const stats = kaijuStats(kaiju);
  const effectiveness = move.type ? typeMultiplier(move.type, villain.genome.type) : 1;
  const weatherMul = move.type ? weatherMultiplier(weather, move.type) : 1;
  const raw = (move.power * stats.power) / 25;
  const damage = Math.max(1, Math.round(raw * effectiveness * weatherMul));
  return { damage, effectiveness };
}

export interface AttackResult {
  battle: Battle;
  blocks: BuildLayer;
  turn: BattleTurn;
}

/**
 * One exchange. The guardian hits; if the villain is still standing it
 * stomps one of the kid's blocks (which he repairs afterward). The guardian
 * has no HP: there is nothing to lose, only a villain to drive off.
 */
export function attack(
  battle: Battle,
  kaiju: Kaiju,
  move: Move,
  blocks: BuildLayer,
  memberId = 'me',
  defense?: Defense,
): AttackResult {
  if (battle.status !== 'active') {
    return { battle, blocks, turn: { moveId: move.id, damage: 0, effectiveness: 1, brokenBlock: null } };
  }
  const { damage, effectiveness } = computeDamage(kaiju, move, battle.villain, battle.weather);
  const villainHp = Math.max(0, battle.villainHp - damage);
  const status: BattleStatus = villainHp === 0 ? 'won' : 'active';

  let brokenBlock: Block | null = null;
  let nextBlocks = blocks;
  if (status === 'active') {
    const rng = new Rng(forkSeed(battle.villain.genome.seed, `turn:${battle.turns.length}`));
    // Villains only stomp about half the time, so a small city survives.
    // Watchtowers lower the odds; walls take the hit first.
    if (rng.chance(defense?.breakChance ?? 0.5)) {
      const result = breakRandomBlock(blocks, rng, defense);
      brokenBlock = result.broken;
      nextBlocks = result.layer;
    }
  }

  const turn: BattleTurn = { moveId: move.id, damage, effectiveness, brokenBlock };
  const contributions = { ...battle.contributions, [memberId]: (battle.contributions[memberId] ?? 0) + damage };
  return {
    battle: { ...battle, villainHp, status, turns: [...battle.turns, turn], contributions },
    blocks: nextBlocks,
    turn,
  };
}

export interface Reward {
  /** Egg fragment of this type. */
  fragmentType: KaijuType;
  stars: number;
}

export function rewardFor(villain: Villain): Reward {
  return { fragmentType: villain.genome.type, stars: villain.isBoss ? 5 : 2 };
}
