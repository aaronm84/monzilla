import { generateGenome, type Genome } from './genome.js';
import { rosterGenome, rosterVillainsFor } from './roster.js';
import { Rng } from './rng.js';
import { deriveStats, type Stats } from './stats.js';
import { BIOME_TYPE, type Biome } from './world.js';
import { weatherVillainType, type Weather } from './weather.js';
import { TYPES, type KaijuType } from './types.js';

export interface Villain {
  id: string;
  name: string;
  /** Set when this is a named regular from the roster. */
  rosterId?: string;
  /** Fixed for regulars; generated for the rest (see invasion.ts). */
  origin?: 'tide' | 'storm' | 'volcano' | 'deep' | 'sky';
  goal?: 'nest' | 'tower' | 'lantern' | 'nap';
  ability?: 'none' | 'fog' | 'stompy' | 'sturdy' | 'speedy' | 'sleepy';
  genome: Genome;
  stats: Stats;
  maxHp: number;
  isBoss: boolean;
}

const SYLLABLES_A = ['Gor', 'Zar', 'Kro', 'Vex', 'Mor', 'Thra', 'Ulk', 'Dra', 'Skar', 'Ghi', 'Bal', 'Nyx'];
const SYLLABLES_B = ['gon', 'dax', 'mok', 'zul', 'rah', 'thos', 'vok', 'gath', 'dorah', 'lok', 'zar', 'nix'];

export function villainName(rng: Rng): string {
  const name = rng.pick(SYLLABLES_A) + rng.pick(SYLLABLES_B);
  return rng.chance(0.2) ? `${name} the ${rng.pick(['Grumpy', 'Loud', 'Sneaky', 'Stompy', 'Crashy'])}` : name;
}

export interface VillainOptions {
  weather: Weather;
  biome: Biome;
  /** Stat total of the player's strongest guardian; scales the villain. */
  guardianStatTotal: number;
  boss?: boolean;
}

/**
 * Villains are generated from the day's weather and the biome they come
 * from, and scaled so the fight takes a handful of good hits: winnable, but
 * a reason to pick the right type.
 */
export function generateVillain(rng: Rng, opts: VillainOptions): Villain {
  const weatherType = weatherVillainType(opts.weather);
  const type: KaijuType = rng.weighted<KaijuType>([
    ...(weatherType ? [{ value: weatherType, weight: 4 }] : []),
    { value: BIOME_TYPE[opts.biome], weight: 3 },
    ...TYPES.map((t) => ({ value: t, weight: 1 })),
  ]);
  const boss = opts.boss ?? false;

  // About a third of the time a named regular shows up, preferring the
  // ones that belong to today's weather. The rest are freshly generated.
  const regular = rng.chance(0.35) ? rng.pick(rosterVillainsFor(opts.weather)) : null;
  const genome = regular
    ? rosterGenome(regular)
    : generateGenome(rng.fork('genome'), {
        alignment: 'villain',
        type,
        menace: boss ? 1 : 0.6,
        shinyChance: 1 / 128,
      });
  const isBoss = boss || Boolean(regular?.boss);
  genome.size = isBoss ? 1.7 : 1.2;
  const stats = deriveStats(genome, { stage: 'guardian', feedCount: 0, playCount: 0, washCount: 0, sleepCount: 0 });
  // A guardian's basic hit is roughly power/4 (see battle.ts); aim for about
  // eight hits with a neutral move, four with the right type, so the villain
  // gets enough turns for its walk across the island to matter.
  const hitsToWin = isBoss ? 14 : 8;
  const roughHit = Math.max(4, opts.guardianStatTotal / 4 / 4);
  const sturdy = regular?.ability === 'sturdy';
  const maxHp = Math.round(roughHit * hitsToWin * (sturdy ? 1.4 : 1));
  return {
    id: `v_${rng.seed.toString(36)}`,
    name: regular ? regular.name : villainName(rng.fork('name')),
    ...(regular ? { rosterId: regular.id, origin: regular.origin, goal: regular.goal, ability: regular.ability } : {}),
    genome,
    stats,
    maxHp,
    isBoss,
  };
}
