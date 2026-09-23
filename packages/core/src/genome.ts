import { Rng } from './rng.js';
import { TYPES, type Alignment, type KaijuType } from './types.js';

export const BODY_SHAPES = ['round', 'tall', 'long', 'wide'] as const;
export type BodyShape = (typeof BODY_SHAPES)[number];

export const WING_KINDS = ['none', 'bat', 'feather', 'fin'] as const;
export type WingKind = (typeof WING_KINDS)[number];

export const TAIL_KINDS = ['stub', 'long', 'club', 'fan'] as const;
export type TailKind = (typeof TAIL_KINDS)[number];

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
}

export interface Parts {
  body: BodyShape;
  heads: 1 | 2 | 3;
  wings: WingKind;
  tail: TailKind;
  horns: number; // 0-3
  spikes: number; // 0-5
}

/**
 * A genome is the complete description of a creature. Hatching generates one
 * from a seed; the creature editor edits one by hand; the renderer draws one.
 * Same data either way.
 */
export interface Genome {
  seed: number;
  type: KaijuType;
  alignment: Alignment;
  parts: Parts;
  /** Overall scale, roughly 0.6 to 1.6. Grows with stage. */
  size: number;
  palette: Palette;
  shiny: boolean;
}

/**
 * Palette families. Guardians live in the blue-white world, villains in the
 * purple-red world, and the type tints the primary color within that family.
 * This is the single most important visual rule in the game: good and bad
 * must always be obvious at a glance.
 */
const TYPE_TINT: Record<KaijuType, string> = {
  fire: '#ff7043',
  plant: '#66bb6a',
  rock: '#a1887f',
  lightning: '#ffca28',
  water: '#42a5f5',
  ice: '#b3e5fc',
  sky: '#b39ddb',
};

const GUARDIAN_SECONDARY = ['#e3f2fd', '#bbdefb', '#e0f7fa', '#f1f8e9'] as const;
const VILLAIN_SECONDARY = ['#4a148c', '#6a1b9a', '#880e4f', '#311b92'] as const;

export function makePalette(rng: Rng, type: KaijuType, alignment: Alignment, shiny: boolean): Palette {
  const tint = shiny ? '#ffd54f' : TYPE_TINT[type];
  if (alignment === 'guardian') {
    return {
      primary: tint,
      secondary: rng.pick(GUARDIAN_SECONDARY),
      accent: '#ffffff',
      glow: '#7fd8ff',
    };
  }
  return {
    primary: tint,
    secondary: rng.pick(VILLAIN_SECONDARY),
    accent: '#ff1744',
    glow: '#d500f9',
  };
}

export interface GenerateOptions {
  alignment: Alignment;
  type?: KaijuType;
  /** Villains lean bigger and spikier. */
  menace?: number; // 0..1
  shinyChance?: number;
}

export function generateGenome(rng: Rng, opts: GenerateOptions): Genome {
  const type = opts.type ?? rng.pick(TYPES);
  const menace = opts.menace ?? (opts.alignment === 'villain' ? 0.6 : 0.2);
  const shiny = rng.chance(opts.shinyChance ?? 1 / 64);

  const heads = rng.weighted<1 | 2 | 3>([
    { value: 1, weight: 10 },
    { value: 2, weight: 2 + menace * 4 },
    { value: 3, weight: 1 + menace * 5 },
  ]);

  const parts: Parts = {
    body: rng.pick(BODY_SHAPES),
    heads,
    wings: type === 'sky' ? rng.pick(['bat', 'feather'] as const) : rng.weighted([
      { value: 'none' as WingKind, weight: 6 },
      { value: 'bat' as WingKind, weight: 1 + menace * 2 },
      { value: 'feather' as WingKind, weight: 1 },
      { value: 'fin' as WingKind, weight: type === 'water' ? 3 : 0.5 },
    ]),
    tail: rng.pick(TAIL_KINDS),
    horns: rng.int(0, Math.round(1 + menace * 2)),
    spikes: rng.int(0, Math.round(2 + menace * 3)),
  };

  return {
    seed: rng.seed,
    type,
    alignment: opts.alignment,
    parts,
    size: 0.6,
    palette: makePalette(rng.fork('palette'), type, opts.alignment, shiny),
    shiny,
  };
}

/** Deterministic: same seed and options always give the same genome. */
export function genomeFromSeed(seed: number, opts: GenerateOptions): Genome {
  return generateGenome(new Rng(seed), opts);
}

/**
 * The species key is what the dex collects. It is coarse on purpose so the
 * total count is reachable: type x alignment x body shape = 56 species.
 */
export function speciesKey(g: Genome): string {
  return `${g.alignment}:${g.type}:${g.parts.body}`;
}

export function allSpeciesKeys(): string[] {
  const keys: string[] = [];
  for (const alignment of ['guardian', 'villain'] as const) {
    for (const type of TYPES) {
      for (const body of BODY_SHAPES) keys.push(`${alignment}:${type}:${body}`);
    }
  }
  return keys;
}

/** Mix two genomes (for breeding, later). Kept here so the data model is ready. */
export function mixGenomes(rng: Rng, a: Genome, b: Genome): Genome {
  const type = rng.chance(0.5) ? a.type : b.type;
  const alignment = a.alignment; // breeding only happens between guardians
  const shiny = a.shiny || b.shiny ? rng.chance(0.25) : rng.chance(1 / 64);
  const pickPart = <K extends keyof Parts>(k: K): Parts[K] => (rng.chance(0.5) ? a.parts[k] : b.parts[k]);
  return {
    seed: rng.seed,
    type,
    alignment,
    parts: {
      body: pickPart('body'),
      heads: pickPart('heads'),
      wings: pickPart('wings'),
      tail: pickPart('tail'),
      horns: pickPart('horns'),
      spikes: pickPart('spikes'),
    },
    size: 0.6,
    palette: makePalette(rng.fork('palette'), type, alignment, shiny),
    shiny,
  };
}
