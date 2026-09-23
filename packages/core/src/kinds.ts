import type { BodyShape, TailKind, WingKind } from './genome.js';
import type { KaijuType } from './types.js';

/**
 * A kind is a creature's family: what it fundamentally looks like. It is
 * the main axis the dex collects on, and it is separate from alignment so
 * the same family can have good and bad members, like his figure game.
 */
export const KINDS = ['lizard', 'dragon', 'moth', 'turtle', 'yeti', 'robot', 'crab', 'bird', 'blob', 'serpent'] as const;
export type Kind = (typeof KINDS)[number];

export interface KindInfo {
  icon: string;
  label: string;
  /** Types this kind rolls most often. Any type is still possible. */
  typeBias: KaijuType[];
  /** Parts the generator is allowed to pick for this kind. */
  bodies: BodyShape[];
  wings: WingKind[];
  tails: TailKind[];
  maxHeads: 1 | 2 | 3;
  maxHorns: number;
  maxSpikes: number;
  /** Whether the renderer draws legs. Blobs and serpents have none. */
  legs: boolean;
}

export const KIND_INFO: Record<Kind, KindInfo> = {
  lizard: {
    icon: '🦎', label: 'Lizard', typeBias: ['fire', 'plant', 'rock'],
    bodies: ['round', 'tall', 'long', 'wide'], wings: ['none'], tails: ['stub', 'long', 'club', 'fan'],
    maxHeads: 1, maxHorns: 2, maxSpikes: 5, legs: true,
  },
  dragon: {
    icon: '🐉', label: 'Dragon', typeBias: ['fire', 'lightning', 'sky'],
    bodies: ['tall', 'long'], wings: ['bat'], tails: ['long', 'club'],
    maxHeads: 3, maxHorns: 3, maxSpikes: 4, legs: true,
  },
  moth: {
    icon: '🦋', label: 'Moth', typeBias: ['sky', 'plant', 'ice'],
    bodies: ['round', 'tall'], wings: ['feather'], tails: ['stub'],
    maxHeads: 1, maxHorns: 0, maxSpikes: 0, legs: true,
  },
  turtle: {
    icon: '🐢', label: 'Turtle', typeBias: ['rock', 'water', 'plant'],
    bodies: ['wide', 'round'], wings: ['none', 'fin'], tails: ['stub', 'club'],
    maxHeads: 1, maxHorns: 1, maxSpikes: 3, legs: true,
  },
  yeti: {
    icon: '🦍', label: 'Yeti', typeBias: ['ice', 'rock', 'sky'],
    bodies: ['round', 'wide', 'tall'], wings: ['none'], tails: ['stub'],
    maxHeads: 1, maxHorns: 2, maxSpikes: 0, legs: true,
  },
  robot: {
    icon: '🤖', label: 'Robot', typeBias: ['lightning', 'rock', 'ice'],
    bodies: ['tall', 'wide', 'round'], wings: ['none', 'fin'], tails: ['stub'],
    maxHeads: 1, maxHorns: 1, maxSpikes: 2, legs: true,
  },
  crab: {
    icon: '🦀', label: 'Crab', typeBias: ['water', 'rock', 'ice'],
    bodies: ['wide'], wings: ['none'], tails: ['stub'],
    maxHeads: 1, maxHorns: 0, maxSpikes: 4, legs: true,
  },
  bird: {
    icon: '🐦', label: 'Bird', typeBias: ['sky', 'lightning', 'fire'],
    bodies: ['round', 'tall'], wings: ['feather', 'bat'], tails: ['fan', 'long'],
    maxHeads: 1, maxHorns: 1, maxSpikes: 2, legs: true,
  },
  blob: {
    icon: '🟣', label: 'Blob', typeBias: ['water', 'plant', 'lightning'],
    bodies: ['round', 'wide'], wings: ['none'], tails: ['stub'],
    maxHeads: 1, maxHorns: 0, maxSpikes: 3, legs: false,
  },
  serpent: {
    icon: '🐍', label: 'Serpent', typeBias: ['water', 'plant', 'fire'],
    bodies: ['long'], wings: ['none', 'fin'], tails: ['long'],
    maxHeads: 2, maxHorns: 2, maxSpikes: 5, legs: false,
  },
};
