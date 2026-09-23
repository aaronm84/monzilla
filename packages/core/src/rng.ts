/**
 * Deterministic random numbers. Everything procedural in the game derives
 * from a seed so that saves stay tiny (store the seed, not the output) and
 * the same creature or island can always be regenerated.
 */

/** FNV-1a style string hash to a 32-bit unsigned int. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Combine a numeric seed with a label into a new seed. */
export function forkSeed(seed: number, label: string | number): number {
  return hashString(`${seed >>> 0}:${label}`);
}

/** mulberry32: small, fast, good enough for a game. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly nextFloat: () => number;
  readonly seed: number;

  constructor(seed: number | string) {
    this.seed = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    this.nextFloat = mulberry32(this.seed);
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextFloat();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from empty list');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Pick with weights (weights need not sum to 1). */
  weighted<T>(items: readonly { value: T; weight: number }[]): T {
    const total = items.reduce((s, i) => s + i.weight, 0);
    let roll = this.next() * total;
    for (const item of items) {
      roll -= item.weight;
      if (roll <= 0) return item.value;
    }
    return items[items.length - 1]!.value;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }

  /** A new independent generator derived from this one's seed and a label. */
  fork(label: string | number): Rng {
    return new Rng(forkSeed(this.seed, label));
  }
}
