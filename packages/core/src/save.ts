import type { Battle } from './battle.js';
import { newCareState, newGrowth, type Kaiju } from './care.js';
import { recordInDex, type Dex } from './dex.js';
import { hatchGenome, newEgg, type Egg } from './eggs.js';
import { forkSeed, hashString } from './rng.js';
import type { BuildLayer } from './world.js';

export const SAVE_VERSION = 1;

export interface Settings {
  reduceMotion: boolean;
  quiet: boolean;
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  speakLabels: boolean;
}

export function defaultSettings(): Settings {
  return { reduceMotion: false, quiet: false, musicVolume: 0.5, sfxVolume: 0.8, speakLabels: true };
}

/**
 * One family member's whole world. Family members can read each other's
 * saves (for visiting) but only write their own.
 */
export interface MemberSave {
  version: number;
  memberId: string;
  name: string;
  seed: number;
  kaiju: Kaiju[];
  eggs: Egg[];
  blocks: BuildLayer;
  dex: Dex;
  stars: number;
  settings: Settings;
  activeBattle: Battle | null;
  /** Day index of the last villain that was fought, so one shows per day. */
  lastVillainDay: number | null;
  updatedAt: number;
}

export interface Family {
  id: string;
  name: string;
  memberIds: string[];
  createdAt: number;
}

/**
 * A fresh save. The first kaiju is already hatched so there is something to
 * care for immediately, and one egg is one fragment away from hatching so
 * the first fight has a visible payoff.
 */
export function newMemberSave(memberId: string, name: string, seedSource: string | number, now = Date.now()): MemberSave {
  const seed = typeof seedSource === 'string' ? hashString(seedSource) : seedSource >>> 0;
  const starterEgg = newEgg('egg_starter', 'fire', forkSeed(seed, 'starter'), 3);
  const starterGenome = hatchGenome(starterEgg);
  const starter: Kaiju = {
    id: 'k_starter',
    name: '',
    genome: starterGenome,
    care: newCareState(),
    growth: newGrowth('hatchling'),
    createdAt: now,
  };
  const secondEgg = newEgg('egg_second', 'water', forkSeed(seed, 'second'), 2);
  return {
    version: SAVE_VERSION,
    memberId,
    name,
    seed,
    kaiju: [starter],
    eggs: [secondEgg],
    blocks: {},
    dex: recordInDex({}, starterGenome, now),
    stars: 0,
    settings: defaultSettings(),
    activeBattle: null,
    lastVillainDay: null,
    updatedAt: now,
  };
}

/** Bring an older save up to the current shape. Add a case per version bump. */
export function migrateSave(raw: unknown): MemberSave | null {
  if (!raw || typeof raw !== 'object') return null;
  const save = raw as Partial<MemberSave>;
  if (typeof save.version !== 'number' || typeof save.memberId !== 'string') return null;
  const settings = { ...defaultSettings(), ...(save.settings ?? {}) };
  return {
    ...(save as MemberSave),
    settings,
    eggs: save.eggs ?? [],
    kaiju: save.kaiju ?? [],
    blocks: save.blocks ?? {},
    dex: save.dex ?? {},
    stars: save.stars ?? 0,
    activeBattle: save.activeBattle ?? null,
    lastVillainDay: save.lastVillainDay ?? null,
    version: SAVE_VERSION,
  };
}
