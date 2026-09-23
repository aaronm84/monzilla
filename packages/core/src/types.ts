/** Elemental types. Each type beats exactly one other, in a ring. */
export const TYPES = ['fire', 'plant', 'rock', 'lightning', 'water', 'ice', 'sky'] as const;
export type KaijuType = (typeof TYPES)[number];

/** What each type is strong against. Fire beats plant, plant beats rock, ... */
export const BEATS: Record<KaijuType, KaijuType> = {
  fire: 'plant',
  plant: 'rock',
  rock: 'lightning',
  lightning: 'water',
  water: 'fire',
  ice: 'sky',
  sky: 'ice',
};

// Ice and sky are a pair so the ring stays simple to learn; the other five
// form a loop. Fire also beats ice and water beats rock as secondary
// relationships once the kid has learned the main ones.
const SECONDARY: Partial<Record<KaijuType, KaijuType>> = {
  fire: 'ice',
  water: 'rock',
};

export function typeMultiplier(attacker: KaijuType, defender: KaijuType): number {
  if (BEATS[attacker] === defender || SECONDARY[attacker] === defender) return 2;
  if (BEATS[defender] === attacker || SECONDARY[defender] === attacker) return 0.5;
  return 1;
}

export type Alignment = 'guardian' | 'villain';

export const STAGES = ['egg', 'hatchling', 'juvenile', 'guardian'] as const;
export type Stage = (typeof STAGES)[number];

/** Icon and color per type. Icons are emoji so no font or image assets are needed. */
export const TYPE_INFO: Record<KaijuType, { icon: string; color: string; label: string }> = {
  fire: { icon: '🔥', color: '#ff6b35', label: 'Fire' },
  plant: { icon: '🌿', color: '#4caf50', label: 'Plant' },
  rock: { icon: '🪨', color: '#a1887f', label: 'Rock' },
  lightning: { icon: '⚡', color: '#ffd600', label: 'Lightning' },
  water: { icon: '💧', color: '#29b6f6', label: 'Water' },
  ice: { icon: '❄️', color: '#b3e5fc', label: 'Ice' },
  sky: { icon: '🌪️', color: '#b39ddb', label: 'Sky' },
};
