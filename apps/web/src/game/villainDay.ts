import {
  Rng,
  biomeCounts,
  dayIndex,
  findStructures,
  forkSeed,
  generateIsland,
  generateVillain,
  kaijuStats,
  newInvasion,
  recordInDex,
  startBattle,
  statTotal,
  weatherFor,
  type Battle,
  type MemberSave,
} from '@monzilla/core';
import type { GameStore } from './store.js';

/**
 * Today's villain, created once per day when the island is first opened.
 * It lands on the shore with an origin, a goal, and an ability, and waits
 * there: it only moves during a fight, so nothing ever happens to his
 * island while he is caring or building.
 */
export function ensureTodaysBattle(store: GameStore): Battle | null {
  const save = store.save;
  if (save.activeBattle) return save.activeBattle;
  if (save.kaiju.length === 0) return null;
  const today = dayIndex();
  if (save.lastVillainDay === today) return null; // already beaten today
  const island = generateIsland(save.seed);
  const weather = weatherFor(save.seed, today);
  const biome = biomeCounts(island)[0]?.biome ?? 'meadow';
  const strongest = Math.max(...save.kaiju.map((k) => statTotal(kaijuStats(k))));
  const villain = generateVillain(new Rng(forkSeed(save.seed, `villain:${today}`)), { weather, biome, guardianStatTotal: strongest });
  const invasion = newInvasion(villain, island, save.blocks, findStructures(save.blocks), forkSeed(save.seed, today));
  const battle: Battle = { ...startBattle(`b_${today}`, villain, save.kaiju[0]!, weather), invasion };
  store.update((s: MemberSave) => ({ ...s, activeBattle: battle, lastVillainDay: today, dex: recordInDex(s.dex, villain.genome) }));
  return battle;
}
