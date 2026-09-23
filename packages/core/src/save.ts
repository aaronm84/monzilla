import type { Battle } from './battle.js';
import { newCareState, newGrowth, type Kaiju } from './care.js';
import { recordInDex, type Dex } from './dex.js';
import { inferKind, speciesKey, type Genome } from './genome.js';
import { rosterById, rosterGenome } from './roster.js';
import { newEgg, type Egg } from './eggs.js';
import { forkSeed, hashString } from './rng.js';
import type { BuildLayer } from './world.js';

export const SAVE_VERSION = 2;

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
  // The first kaiju is Ember, the lizard regular, so every island starts
  // with the same friendly face.
  const starterGenome = rosterGenome(rosterById('ember')!);
  const starter: Kaiju = {
    id: 'k_starter',
    name: 'Ember',
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

  const withKind = (g: Genome): Genome => (g.kind ? g : { ...g, kind: inferKind(g.parts) });
  const kaiju = (save.kaiju ?? []).map((k) => ({ ...k, genome: withKind(k.genome) }));

  // v1 -> v2: genomes gained a kind and the dex is keyed by kind:type
  // instead of alignment:type:body. Rebuild the dex from its entries.
  let dex: Dex = save.dex ?? {};
  if (save.version < 2) {
    let rebuilt: Dex = {};
    for (const entry of Object.values(dex)) {
      const g = withKind(entry.genome);
      rebuilt = recordInDex(rebuilt, g, entry.firstSeen);
      const key = speciesKey(g);
      rebuilt[key] = { ...rebuilt[key]!, count: entry.count };
    }
    dex = rebuilt;
  }

  const activeBattle = save.activeBattle
    ? { ...save.activeBattle, villain: { ...save.activeBattle.villain, genome: withKind(save.activeBattle.villain.genome) } }
    : null;

  return {
    ...(save as MemberSave),
    settings,
    eggs: save.eggs ?? [],
    kaiju,
    blocks: save.blocks ?? {},
    dex,
    stars: save.stars ?? 0,
    activeBattle,
    lastVillainDay: save.lastVillainDay ?? null,
    version: SAVE_VERSION,
  };
}
