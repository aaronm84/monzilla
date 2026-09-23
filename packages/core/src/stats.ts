import type { Genome } from './genome.js';
import type { Stage } from './types.js';

/** Four stats, each shown as a bar 1..99. */
export interface Stats {
  power: number;
  speed: number;
  heart: number;
  guard: number;
}

export interface GrowthInput {
  stage: Stage;
  feedCount: number;
  playCount: number;
  washCount: number;
  sleepCount: number;
}

const STAGE_BASE: Record<Stage, number> = {
  egg: 0,
  hatchling: 10,
  juvenile: 25,
  guardian: 45,
};

const clamp = (n: number) => Math.max(1, Math.min(99, Math.round(n)));

/**
 * Stats come from the parts (nature) plus how the kaiju was raised
 * (nurture). A big body means power, wings mean speed, and so on. The idea
 * is that a creature can be read by looking at it.
 */
export function deriveStats(g: Genome, growth: GrowthInput): Stats {
  const base = STAGE_BASE[growth.stage];
  const p = g.parts;

  let power = base + 10 + p.heads * 4 + p.horns * 3 + p.spikes * 2;
  let speed = base + 10 + (p.wings === 'none' ? 0 : 12) + (p.body === 'long' ? 6 : 0) + (p.tail === 'long' ? 4 : 0);
  let heart = base + 12 + (p.body === 'round' ? 8 : 0) + (p.heads === 1 ? 4 : 0);
  let guard = base + 10 + (p.body === 'wide' ? 8 : 0) + p.spikes * 2 + (p.tail === 'club' ? 4 : 0);

  // Nurture: each care type nudges one stat. Numbers are small so nature
  // still shows, but a well-fed kaiju is visibly stronger.
  power += Math.min(20, growth.feedCount * 0.5);
  speed += Math.min(20, growth.playCount * 0.5);
  heart += Math.min(20, growth.sleepCount * 0.5);
  guard += Math.min(20, growth.washCount * 0.5);

  if (g.shiny) {
    power += 5;
    speed += 5;
    heart += 5;
    guard += 5;
  }

  return { power: clamp(power), speed: clamp(speed), heart: clamp(heart), guard: clamp(guard) };
}

/** Sum of stats, used to scale villains so fights stay winnable. */
export function statTotal(s: Stats): number {
  return s.power + s.speed + s.heart + s.guard;
}
