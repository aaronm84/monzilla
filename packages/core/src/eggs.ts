import { generateGenome, type Genome } from './genome.js';
import { Rng, forkSeed } from './rng.js';
import type { KaijuType } from './types.js';

export const FRAGMENTS_PER_EGG = 3;

export interface Egg {
  id: string;
  type: KaijuType;
  fragments: number;
  seed: number;
}

export function newEgg(id: string, type: KaijuType, seed: number, fragments = 0): Egg {
  return { id, type, fragments, seed };
}

/** Add a fragment to the egg of that type, creating one if needed. */
export function addFragment(eggs: Egg[], type: KaijuType, seedSource: number): Egg[] {
  const existing = eggs.find((e) => e.type === type && e.fragments < FRAGMENTS_PER_EGG);
  if (existing) {
    return eggs.map((e) => (e.id === existing.id ? { ...e, fragments: e.fragments + 1 } : e));
  }
  const seed = forkSeed(seedSource, `egg:${type}:${eggs.length}`);
  return [...eggs, newEgg(`egg_${seed.toString(36)}`, type, seed, 1)];
}

export function eggReady(egg: Egg): boolean {
  return egg.fragments >= FRAGMENTS_PER_EGG;
}

/** Hatching is deterministic from the egg's seed. Eggs only ever hatch guardians. */
export function hatchGenome(egg: Egg): Genome {
  return generateGenome(new Rng(egg.seed), { alignment: 'guardian', type: egg.type });
}
