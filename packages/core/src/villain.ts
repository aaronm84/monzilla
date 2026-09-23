import { generateGenome, type Genome } from './genome.js';
import { Rng } from './rng.js';
import { deriveStats, type Stats } from './stats.js';
import { BIOME_TYPE, type Biome } from './world.js';
import { weatherVillainType, type Weather } from './weather.js';
import { TYPES, type KaijuType } from './types.js';

export interface Villain {
  id: string;
  name: string;
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
  const genome = generateGenome(rng.fork('genome'), {
    alignment: 'villain',
    type,
    menace: boss ? 1 : 0.6,
    shinyChance: 1 / 128,
  });
  genome.size = boss ? 1.7 : 1.2;
  const stats = deriveStats(genome, { stage: 'guardian', feedCount: 0, playCount: 0, washCount: 0, sleepCount: 0 });
  // A guardian's basic hit is roughly power/4 (see battle.ts); aim for about
  // five hits with a neutral move, three with the right type.
  const hitsToWin = boss ? 12 : 5;
  const roughHit = Math.max(4, opts.guardianStatTotal / 4 / 4);
  const maxHp = Math.round(roughHit * hitsToWin);
  return {
    id: `v_${rng.seed.toString(36)}`,
    name: villainName(rng.fork('name')),
    genome,
    stats,
    maxHp,
    isBoss: boss,
  };
}
