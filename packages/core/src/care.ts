import type { Genome } from './genome.js';
import { deriveStats, type Stats } from './stats.js';
import { STAGES, type Stage } from './types.js';

export const CARE_ACTIONS = ['feed', 'wash', 'play', 'sleep'] as const;
export type CareAction = (typeof CARE_ACTIONS)[number];

/** Four bars 0..100. They only move when the kid acts. Never with real time. */
export interface CareState {
  hunger: number; // 100 = full
  clean: number;
  fun: number;
  rest: number;
}

export interface Growth {
  xp: number;
  stage: Stage;
  feedCount: number;
  playCount: number;
  washCount: number;
  sleepCount: number;
}

export interface Kaiju {
  id: string;
  name: string;
  genome: Genome;
  care: CareState;
  growth: Growth;
  createdAt: number;
  /** Where it stands on the island, in tiles. Set when it first appears. */
  pos?: { x: number; y: number };
}

/** XP needed to reach each stage. */
export const STAGE_XP: Record<Stage, number> = {
  egg: 0,
  hatchling: 0,
  juvenile: 60,
  guardian: 200,
};

/** Size at each stage; the renderer scales the genome by this. */
export const STAGE_SIZE: Record<Stage, number> = {
  egg: 0.5,
  hatchling: 0.6,
  juvenile: 0.95,
  guardian: 1.4,
};

export const CARE_INFO: Record<CareAction, { icon: string; bar: keyof CareState; label: string }> = {
  feed: { icon: '🍖', bar: 'hunger', label: 'Feed' },
  wash: { icon: '🧼', bar: 'clean', label: 'Wash' },
  play: { icon: '🎾', bar: 'fun', label: 'Play' },
  sleep: { icon: '💤', bar: 'rest', label: 'Sleep' },
};

const XP_PER_ACTION = 5;
const BAR_GAIN = 25;

export function newCareState(): CareState {
  return { hunger: 50, clean: 50, fun: 50, rest: 50 };
}

export function newGrowth(stage: Stage = 'hatchling'): Growth {
  return { xp: STAGE_XP[stage], stage, feedCount: 0, playCount: 0, washCount: 0, sleepCount: 0 };
}

export function stageFor(xp: number): Stage {
  let stage: Stage = 'hatchling';
  for (const s of STAGES) {
    if (s === 'egg') continue;
    if (xp >= STAGE_XP[s]) stage = s;
  }
  return stage;
}

export function nextStage(stage: Stage): Stage | null {
  const i = STAGES.indexOf(stage);
  return i >= 0 && i < STAGES.length - 1 ? (STAGES[i + 1] as Stage) : null;
}

/** Progress toward the next stage as 0..1, or 1 when fully grown. */
export function growthProgress(growth: Growth): number {
  const next = nextStage(growth.stage);
  if (!next) return 1;
  const from = STAGE_XP[growth.stage];
  const to = STAGE_XP[next];
  return Math.max(0, Math.min(1, (growth.xp - from) / (to - from)));
}

export interface CareResult {
  kaiju: Kaiju;
  /** Set when the action grew the kaiju into a new stage. */
  grewTo: Stage | null;
  /** How much the bar moved (0 if it was already full). */
  barGain: number;
}

const clamp100 = (n: number) => Math.max(0, Math.min(100, n));

/**
 * Apply one care action. Bars fill, xp rises, and the kaiju may grow.
 * A full bar still gives a little xp so tapping never feels pointless, but
 * gives less so there is a reason to rotate through all four.
 */
export function applyCare(kaiju: Kaiju, action: CareAction): CareResult {
  const bar = CARE_INFO[action].bar;
  const before = kaiju.care[bar];
  const after = clamp100(before + BAR_GAIN);
  const barGain = after - before;
  const xpGain = barGain > 0 ? XP_PER_ACTION : 1;

  const growth: Growth = { ...kaiju.growth, xp: kaiju.growth.xp + xpGain };
  const countKey = `${action}Count` as const;
  growth[countKey] += 1;

  const newStage = stageFor(growth.xp);
  const grewTo = newStage !== kaiju.growth.stage ? newStage : null;
  growth.stage = newStage;

  const genome = grewTo ? { ...kaiju.genome, size: STAGE_SIZE[newStage] } : kaiju.genome;

  return {
    kaiju: { ...kaiju, care: { ...kaiju.care, [bar]: after }, growth, genome },
    grewTo,
    barGain,
  };
}

/** After a fight a kaiju is hungry and tired. This is the only way bars drop. */
export function afterBattle(kaiju: Kaiju): Kaiju {
  return {
    ...kaiju,
    care: {
      ...kaiju.care,
      hunger: clamp100(kaiju.care.hunger - 15),
      rest: clamp100(kaiju.care.rest - 15),
      clean: clamp100(kaiju.care.clean - 10),
    },
  };
}

export function kaijuStats(kaiju: Kaiju): Stats {
  return deriveStats(kaiju.genome, kaiju.growth);
}

/** The care bar that most needs attention, for the "next thing" glow. */
export function neediestCare(care: CareState): CareAction {
  let best: CareAction = 'feed';
  let lowest = Infinity;
  for (const action of CARE_ACTIONS) {
    const v = care[CARE_INFO[action].bar];
    if (v < lowest) {
      lowest = v;
      best = action;
    }
  }
  return best;
}
