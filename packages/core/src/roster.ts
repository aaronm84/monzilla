import { generateGenome, type Genome } from './genome.js';
import type { Kind } from './kinds.js';
import { Rng, forkSeed } from './rng.js';
import type { Alignment, KaijuType } from './types.js';
import type { Weather } from './weather.js';

/**
 * Named regulars. Generated creatures fill the world, but a few fixed
 * characters show up again and again so he has recognisable kaiju to
 * learn, beat, and unlock. Each is a fixed seed plus a few overrides, so
 * the same dragon always looks the same.
 */
export interface RosterEntry {
  id: string;
  name: string;
  kind: Kind;
  type: KaijuType;
  alignment: Alignment;
  seed: number;
  /** Weather that makes this regular more likely to appear. */
  weather?: Weather;
  heads?: 1 | 2 | 3;
  boss?: boolean;
}

export const ROSTER: RosterEntry[] = [
  // Guardians (hatchable regulars)
  { id: 'tidalon', name: 'Tidalon', kind: 'lizard', type: 'water', alignment: 'guardian', seed: 1001 },
  { id: 'luminara', name: 'Luminara', kind: 'moth', type: 'plant', alignment: 'guardian', seed: 1002 },
  { id: 'frostrok', name: 'Frostrok', kind: 'yeti', type: 'ice', alignment: 'guardian', seed: 1004 },
  { id: 'boulder', name: 'Boulder', kind: 'turtle', type: 'rock', alignment: 'guardian', seed: 1003 },
  { id: 'bolt', name: 'Bolt', kind: 'robot', type: 'lightning', alignment: 'guardian', seed: 1005 },
  // Villains (recurring bad guys)
  { id: 'pyronyx', name: 'Pyronyx', kind: 'dragon', type: 'fire', alignment: 'villain', seed: 2001, heads: 3, weather: 'storm', boss: true },
  { id: 'moltrex', name: 'Moltrex', kind: 'turtle', type: 'fire', alignment: 'villain', seed: 2006, weather: 'sunny' },
  { id: 'shadowra', name: 'Shadowra', kind: 'bird', type: 'sky', alignment: 'villain', seed: 2003, weather: 'wind' },
  { id: 'pinchor', name: 'Pinchor', kind: 'crab', type: 'ice', alignment: 'villain', seed: 2002, weather: 'snow' },
  { id: 'gloop', name: 'Gloop', kind: 'blob', type: 'water', alignment: 'villain', seed: 2004, weather: 'rain' },
  { id: 'murk', name: 'Murk', kind: 'serpent', type: 'plant', alignment: 'villain', seed: 2005, weather: 'fog' },
];

export function rosterGenome(entry: RosterEntry): Genome {
  const g = generateGenome(new Rng(forkSeed(entry.seed, 'roster')), {
    alignment: entry.alignment,
    kind: entry.kind,
    type: entry.type,
    menace: entry.boss ? 1 : entry.alignment === 'villain' ? 0.6 : 0.2,
    shinyChance: 0,
  });
  if (entry.heads) g.parts.heads = entry.heads;
  return g;
}

export function rosterById(id: string): RosterEntry | undefined {
  return ROSTER.find((r) => r.id === id);
}

/** Villain regulars that fit today's weather, or all of them if none do. */
export function rosterVillainsFor(weather: Weather): RosterEntry[] {
  const villains = ROSTER.filter((r) => r.alignment === 'villain');
  const matching = villains.filter((r) => r.weather === weather);
  return matching.length > 0 ? matching : villains;
}
