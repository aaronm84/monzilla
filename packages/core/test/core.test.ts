import { describe, expect, it } from 'vitest';
import {
  Rng,
  addFragment,
  allSpeciesKeys,
  applyCare,
  attack,
  dayIndex,
  deriveStats,
  eggReady,
  generateIsland,
  generateVillain,
  genomeFromSeed,
  hatchGenome,
  isLand,
  kaijuStats,
  migrateSave,
  movesFor,
  newMemberSave,
  placeBlock,
  repairBlock,
  rosterById,
  rosterGenome,
  startBattle,
  statTotal,
  typeMultiplier,
  weatherFor,
  type Kaiju,
} from '../src/index.js';

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng('island');
    const b = new Rng('island');
    expect([a.next(), a.next(), a.int(1, 6)]).toEqual([b.next(), b.next(), b.int(1, 6)]);
  });
  it('forks produce different streams', () => {
    const r = new Rng(42);
    expect(r.fork('a').next()).not.toBe(r.fork('b').next());
  });
});

describe('types', () => {
  it('fire beats plant, plant resists fire', () => {
    expect(typeMultiplier('fire', 'plant')).toBe(2);
    expect(typeMultiplier('plant', 'fire')).toBe(0.5);
    expect(typeMultiplier('rock', 'sky')).toBe(1);
  });
});

describe('genome', () => {
  it('is deterministic', () => {
    const a = genomeFromSeed(7, { alignment: 'guardian', type: 'fire' });
    const b = genomeFromSeed(7, { alignment: 'guardian', type: 'fire' });
    expect(a).toEqual(b);
  });
  it('keeps villain and guardian palettes apart', () => {
    const g = genomeFromSeed(3, { alignment: 'guardian' });
    const v = genomeFromSeed(3, { alignment: 'villain' });
    expect(g.palette.glow).not.toBe(v.palette.glow);
    expect(g.palette.primary).not.toBe(v.palette.primary);
    expect(v.palette.accent).not.toBe(g.palette.accent);
  });
  it('has 70 species: ten kinds by seven types', () => {
    expect(allSpeciesKeys()).toHaveLength(70);
  });
  it('kinds constrain parts', () => {
    for (let s = 0; s < 100; s++) {
      const moth = genomeFromSeed(s, { alignment: 'guardian', kind: 'moth' });
      expect(moth.parts.wings).toBe('feather');
      expect(moth.parts.heads).toBe(1);
      const crab = genomeFromSeed(s, { alignment: 'villain', kind: 'crab' });
      expect(crab.parts.body).toBe('wide');
      const dragon = genomeFromSeed(s, { alignment: 'villain', kind: 'dragon' });
      expect(dragon.parts.wings).toBe('bat');
    }
  });
  it('kinds lean toward their favourite types', () => {
    let iceYetis = 0;
    for (let s = 0; s < 200; s++) if (genomeFromSeed(s, { alignment: 'guardian', kind: 'yeti' }).type === 'ice') iceYetis++;
    expect(iceYetis).toBeGreaterThan(40);
    expect(iceYetis).toBeLessThan(160);
  });
  it('stats stay within 1..99', () => {
    for (let s = 0; s < 200; s++) {
      const g = genomeFromSeed(s, { alignment: 'villain', menace: 1 });
      const st = deriveStats(g, { stage: 'guardian', feedCount: 99, playCount: 99, washCount: 99, sleepCount: 99 });
      for (const v of Object.values(st)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(99);
      }
    }
  });
});

describe('care', () => {
  it('fills the bar and eventually grows the kaiju', () => {
    let k = newMemberSave('m1', 'Test', 'seed').kaiju[0] as Kaiju;
    expect(k.growth.stage).toBe('hatchling');
    const first = applyCare(k, 'feed');
    expect(first.kaiju.care.hunger).toBe(75);
    expect(first.barGain).toBe(25);
    let grew: string | null = null;
    for (let i = 0; i < 40 && !grew; i++) {
      const r = applyCare(k, (['feed', 'wash', 'play', 'sleep'] as const)[i % 4]!);
      k = r.kaiju;
      grew = r.grewTo;
    }
    expect(grew).toBe('juvenile');
    expect(k.genome.size).toBeGreaterThan(0.6);
  });
  it('a full bar still gives a little xp', () => {
    let k = newMemberSave('m1', 'Test', 'seed').kaiju[0] as Kaiju;
    k = applyCare(k, 'feed').kaiju;
    k = applyCare(k, 'feed').kaiju;
    const xpBefore = k.growth.xp;
    const r = applyCare(k, 'feed');
    expect(r.barGain).toBe(0);
    expect(r.kaiju.growth.xp).toBe(xpBefore + 1);
  });
});

describe('world', () => {
  it('generates an island with land in the middle and water at the edges', () => {
    const island = generateIsland(123);
    expect(isLand(island, 8, 6)).toBe(true);
    expect(isLand(island, 0, 0)).toBe(false);
    const land = island.tiles.filter((t) => t.terrain !== 'water').length;
    expect(land).toBeGreaterThan(20);
  });
  it('is deterministic', () => {
    expect(generateIsland(5)).toEqual(generateIsland(5));
  });
  it('places and repairs blocks only on land', () => {
    const island = generateIsland(123);
    let layer = placeBlock({}, island, 0, 0, 'stone');
    expect(Object.keys(layer)).toHaveLength(0);
    layer = placeBlock(layer, island, 8, 6, 'stone');
    expect(layer['8,6']?.kind).toBe('stone');
    layer = { ...layer, '8,6': { ...layer['8,6']!, broken: true } };
    expect(repairBlock(layer, 8, 6)['8,6']?.broken).toBe(false);
  });
});

describe('weather', () => {
  it('is stable per day', () => {
    expect(weatherFor(1, 100)).toBe(weatherFor(1, 100));
    expect(typeof dayIndex(new Date(2026, 0, 1))).toBe('number');
  });
});

describe('battle', () => {
  it('drives off a villain and never hurts the guardian', () => {
    const save = newMemberSave('m1', 'Test', 'seed');
    const guardian = save.kaiju[0]!;
    const island = generateIsland(save.seed);
    let blocks = placeBlock({}, island, 8, 6, 'stone');
    const villain = generateVillain(new Rng(9), {
      weather: 'sunny',
      biome: 'forest',
      guardianStatTotal: statTotal(kaijuStats(guardian)),
    });
    let battle = startBattle('b1', villain, guardian, 'sunny');
    const moves = movesFor(guardian);
    expect(moves.length).toBe(2);
    let turns = 0;
    while (battle.status === 'active' && turns < 50) {
      const r = attack(battle, guardian, moves[0]!, blocks);
      battle = r.battle;
      blocks = r.blocks;
      turns++;
    }
    expect(battle.status).toBe('won');
    expect(turns).toBeGreaterThanOrEqual(3);
    expect(turns).toBeLessThanOrEqual(12);
    expect(battle.contributions['me']).toBeGreaterThanOrEqual(villain.maxHp);
  });
});

describe('eggs', () => {
  it('collects fragments then hatches deterministically', () => {
    let eggs = addFragment([], 'ice', 1);
    eggs = addFragment(eggs, 'ice', 1);
    expect(eggReady(eggs[0]!)).toBe(false);
    eggs = addFragment(eggs, 'ice', 1);
    expect(eggReady(eggs[0]!)).toBe(true);
    const a = hatchGenome(eggs[0]!);
    const b = hatchGenome(eggs[0]!);
    expect(a).toEqual(b);
    expect(a.alignment).toBe('guardian');
    expect(a.type).toBe('ice');
  });
});

describe('roster', () => {
  it('regulars are stable and keep their overrides', () => {
    const t = rosterById('pyronyx')!;
    const a = rosterGenome(t);
    const b = rosterGenome(t);
    expect(a).toEqual(b);
    expect(a.parts.heads).toBe(3);
    expect(a.kind).toBe('dragon');
    expect(a.alignment).toBe('villain');
  });
  it('a stormy day can bring Pyronyx', () => {
    let seen = false;
    for (let s = 0; s < 40 && !seen; s++) {
      const v = generateVillain(new Rng(s), { weather: 'storm', biome: 'meadow', guardianStatTotal: 100 });
      if (v.rosterId === 'pyronyx') {
        seen = true;
        expect(v.isBoss).toBe(true);
        expect(v.name).toBe('Pyronyx');
      }
    }
    expect(seen).toBe(true);
  });
});

describe('save', () => {
  it('migrates a bare save and rejects junk', () => {
    expect(migrateSave(null)).toBeNull();
    expect(migrateSave({ version: 1 })).toBeNull();
    const s = migrateSave({ version: 1, memberId: 'x', name: 'x', seed: 1 });
    expect(s?.settings.reduceMotion).toBe(false);
    expect(s?.kaiju).toEqual([]);
    expect(s?.version).toBe(2);
  });
  it('starts with Tidalon the lizard', () => {
    const s = newMemberSave('m', 'T', 'seed');
    expect(s.kaiju[0]?.name).toBe('Tidalon');
    expect(s.kaiju[0]?.genome.kind).toBe('lizard');
    expect(Object.keys(s.dex)).toEqual(['lizard:water']);
  });
  it('gives v1 genomes a kind and rekeys the dex', () => {
    const v1 = newMemberSave('m', 'T', 'seed') as unknown as { version: number; kaiju: { genome: Record<string, unknown> }[]; dex: Record<string, { key: string; genome: Record<string, unknown>; count: number; firstSeen: number }> };
    const g = { ...v1.kaiju[0]!.genome };
    delete g['kind'];
    const old = {
      ...v1,
      version: 1,
      kaiju: [{ ...v1.kaiju[0], genome: g }],
      dex: { 'guardian:water:round': { key: 'guardian:water:round', genome: g, count: 3, firstSeen: 5 } },
    };
    const s = migrateSave(old)!;
    expect(s.kaiju[0]?.genome.kind).toBeDefined();
    const keys = Object.keys(s.dex);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[a-z]+:water$/);
    expect(s.dex[keys[0]!]?.count).toBe(3);
    expect(s.dex[keys[0]!]?.seenGuardian).toBe(true);
  });
});
