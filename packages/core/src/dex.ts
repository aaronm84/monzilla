import { allSpeciesKeys, speciesKey, type Genome } from './genome.js';

export interface DexEntry {
  key: string;
  /** First genome seen for this species; used for the card picture. */
  genome: Genome;
  /** Times this species has been hatched or faced. */
  count: number;
  firstSeen: number;
}

export type Dex = Record<string, DexEntry>;

export function recordInDex(dex: Dex, genome: Genome, now = Date.now()): Dex {
  const key = speciesKey(genome);
  const existing = dex[key];
  if (existing) return { ...dex, [key]: { ...existing, count: existing.count + 1 } };
  return { ...dex, [key]: { key, genome, count: 1, firstSeen: now } };
}

export function dexProgress(dex: Dex): { have: number; total: number } {
  return { have: Object.keys(dex).length, total: allSpeciesKeys().length };
}

/** All species in a stable order, with the entry if discovered. */
export function dexPages(dex: Dex): { key: string; entry: DexEntry | null }[] {
  return allSpeciesKeys().map((key) => ({ key, entry: dex[key] ?? null }));
}
