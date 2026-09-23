import { Rng, forkSeed } from './rng.js';
import type { KaijuType } from './types.js';

export const WEATHERS = ['sunny', 'rain', 'storm', 'snow', 'fog', 'wind'] as const;
export type Weather = (typeof WEATHERS)[number];

export const WEATHER_INFO: Record<Weather, { icon: string; label: string }> = {
  sunny: { icon: '☀️', label: 'Sunny' },
  rain: { icon: '🌧️', label: 'Rain' },
  storm: { icon: '⛈️', label: 'Storm' },
  snow: { icon: '🌨️', label: 'Snow' },
  fog: { icon: '🌫️', label: 'Fog' },
  wind: { icon: '💨', label: 'Wind' },
};

/** Days since the epoch, in local time, so weather changes at midnight. */
export function dayIndex(date: Date = new Date()): number {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor(local.getTime() / 86_400_000);
}

/**
 * Weather is a pure function of the member's seed and the day, so the
 * forecast for tomorrow can be shown today and nothing ever surprises him.
 * Sunny is most common; storms are rare and bring lightning villains.
 */
export function weatherFor(seed: number, day: number): Weather {
  const rng = new Rng(forkSeed(seed, `weather:${day}`));
  return rng.weighted<Weather>([
    { value: 'sunny', weight: 6 },
    { value: 'rain', weight: 3 },
    { value: 'wind', weight: 2 },
    { value: 'fog', weight: 1.5 },
    { value: 'snow', weight: 1.5 },
    { value: 'storm', weight: 1 },
  ]);
}

/** Which types the weather helps (x1.5) or hinders (x0.75). */
export function weatherMultiplier(weather: Weather, type: KaijuType): number {
  const buffs: Record<Weather, { up: KaijuType[]; down: KaijuType[] }> = {
    sunny: { up: ['fire', 'plant'], down: ['ice'] },
    rain: { up: ['water', 'plant'], down: ['fire'] },
    storm: { up: ['lightning', 'sky'], down: [] },
    snow: { up: ['ice'], down: ['plant', 'fire'] },
    fog: { up: ['rock'], down: ['sky'] },
    wind: { up: ['sky'], down: ['fire'] },
  };
  const b = buffs[weather];
  if (b.up.includes(type)) return 1.5;
  if (b.down.includes(type)) return 0.75;
  return 1;
}

/** Villain type most likely to show up in this weather. */
export function weatherVillainType(weather: Weather): KaijuType | null {
  const map: Record<Weather, KaijuType | null> = {
    sunny: null,
    rain: 'water',
    storm: 'lightning',
    snow: 'ice',
    fog: 'rock',
    wind: 'sky',
  };
  return map[weather];
}
