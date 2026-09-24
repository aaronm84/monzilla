import { describe, expect, it } from 'vitest';
import {
  Rng,
  addFragment,
  allSpeciesKeys,
  applyCare,
  attack,
  careAvailable,
  breakRandomBlock,
  dayIndex,
  deriveStats,
  eggReady,
  findPath,
  findStructures,
  generateIsland,
  generateVillain,
  genomeFromSeed,
  hatchGenome,
  isLand,
  kaijuStats,
  lineTiles,
  migrateSave,
  movesFor,
  nestTile,
  newMemberSave,
  placeBlock,
  planComplete,
  removeBlock,
  repairBlock,
  rosterById,
  rosterGenome,
  spawnTile,
  startBattle,
  statTotal,
  structureEffects,
  typeMultiplier,
  weatherFor,
  wanderTarget,
  type BuildLayer,
  type Kaiju,
  type Plan,
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
  it('a full bar still gives a little xp and is then unavailable', () => {
    let k = newMemberSave('m1', 'Test', 'seed').kaiju[0] as Kaiju;
    k = applyCare(k, 'feed').kaiju;
    k = applyCare(k, 'feed').kaiju;
    expect(careAvailable(k, 'feed')).toBe(false);
    const xpBefore = k.growth.xp;
    const r = applyCare(k, 'feed');
    expect(r.barGain).toBe(0);
    expect(r.kaiju.growth.xp).toBe(xpBefore + 1);
  });
  it('actions cost a little on other bars', () => {
    const k = newMemberSave('m1', 'Test', 'seed').kaiju[0] as Kaiju;
    const r = applyCare(k, 'play');
    expect(r.kaiju.care.fun).toBe(75);
    expect(r.kaiju.care.hunger).toBe(40);
    expect(r.kaiju.care.clean).toBe(44);
  });
});

describe('world', () => {
  it('generates an island with land in the middle and water at the edges', () => {
    const island = generateIsland(123);
    expect(island.width).toBe(32);
    expect(isLand(island, 16, 12)).toBe(true);
    expect(isLand(island, 0, 0)).toBe(false);
    const land = island.tiles.filter((t) => t.terrain !== 'water').length;
    expect(land).toBeGreaterThan(120);
  });
  it('finds walking paths over land only', () => {
    const island = generateIsland(123);
    const from = spawnTile(island);
    const nest = nestTile(island);
    const path = findPath(island, from, nest);
    expect(path).not.toBeNull();
    for (const p of path!) expect(isLand(island, p.x, p.y)).toBe(true);
    expect(path![path!.length - 1]).toEqual(nest);
    expect(findPath(island, from, { x: 0, y: 0 })).toBeNull();
    expect(findPath(island, from, from)).toEqual([]);
  });
  it('wanders to a nearby reachable tile', () => {
    const island = generateIsland(123);
    const rng = new Rng(4);
    const w = wanderTarget(island, spawnTile(island), 3, () => rng.next());
    expect(w).not.toBeNull();
    expect(isLand(island, w!.target.x, w!.target.y)).toBe(true);
    expect(w!.path.length).toBeGreaterThan(0);
  });
  it('is deterministic', () => {
    expect(generateIsland(5)).toEqual(generateIsland(5));
  });
  it('places, stacks, and repairs blocks only on land', () => {
    const island = generateIsland(123);
    let layer = placeBlock({}, island, 0, 0, 'stone');
    expect(Object.keys(layer)).toHaveLength(0);
    layer = placeBlock(layer, island, 16, 12, 'stone');
    layer = placeBlock(layer, island, 16, 12, 'stone');
    layer = placeBlock(layer, island, 16, 12, 'tower');
    layer = placeBlock(layer, island, 16, 12, 'tower'); // over the limit, ignored
    expect(layer['16,12']?.kinds).toEqual(['stone', 'stone', 'tower']);
    layer = removeBlock(layer, 16, 12);
    expect(layer['16,12']?.kinds).toEqual(['stone', 'stone']);
    layer = { ...layer, '16,12': { ...layer['16,12']!, broken: true } };
    expect(repairBlock(layer, 16, 12)['16,12']?.broken).toBe(false);
  });
  it('draws straight lines along the dominant axis', () => {
    expect(lineTiles({ x: 2, y: 2 }, { x: 5, y: 3 })).toEqual([{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 }]);
    expect(lineTiles({ x: 2, y: 5 }, { x: 2, y: 3 })).toHaveLength(3);
  });
  it('recognises structures and their effects', () => {
    const island = generateIsland(123);
    let layer: BuildLayer = {};
    // habitat at 15,11
    for (const [x, y] of [[15, 11], [16, 11], [15, 12], [16, 12]] as const) {
      layer = placeBlock(layer, island, x, y, 'wood');
      layer = placeBlock(layer, island, x, y, 'roof');
    }
    // wall of four along y=14
    for (let x = 14; x <= 17; x++) {
      layer = placeBlock(layer, island, x, 14, 'stone');
      layer = placeBlock(layer, island, x, 14, 'stone');
    }
    // watchtower at 18,12
    layer = placeBlock(layer, island, 18, 12, 'stone');
    layer = placeBlock(layer, island, 18, 12, 'stone');
    layer = placeBlock(layer, island, 18, 12, 'tower');
    const found = findStructures(layer);
    expect(found.map((s) => s.id).sort()).toEqual(['habitat', 'wall', 'watchtower']);
    expect(found.find((s) => s.id === 'wall')?.tiles).toHaveLength(4);
    const fx = structureEffects(found);
    expect(fx.restBonus).toBe(10);
    expect(fx.breakChance).toBeCloseTo(0.4);
    expect(fx.wallTiles.has('15,14')).toBe(true);
    // a broken wall tile splits the run below the minimum
    const cracked = { ...layer, '16,14': { ...layer['16,14']!, broken: true } };
    expect(findStructures(cracked).filter((s) => s.id === 'wall')).toHaveLength(0);
    // plans
    const plan: Plan = { id: 'watchtower', x: 18, y: 12 };
    expect(planComplete(plan, layer)).toBe(true);
    expect(planComplete({ id: 'wall', x: 14, y: 14, length: 4, axis: 'x' }, layer)).toBe(true);
    expect(planComplete({ id: 'wall', x: 14, y: 14, length: 5, axis: 'x' }, layer)).toBe(false);
  });
  it('villains hit walls first', () => {
    const island = generateIsland(123);
    let layer = placeBlock({}, island, 15, 11, 'flower');
    for (let x = 14; x <= 16; x++) { layer = placeBlock(layer, island, x, 14, 'stone'); layer = placeBlock(layer, island, x, 14, 'stone'); }
    const fx = structureEffects(findStructures(layer));
    for (let s = 0; s < 10; s++) {
      const r = breakRandomBlock(layer, new Rng(s), { breakChance: 1, preferred: fx.wallTiles });
      expect(r.broken?.y).toBe(14);
    }
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
    let blocks = placeBlock({}, island, 16, 12, 'stone');
    expect(blocks['16,12']?.kinds).toEqual(['stone']);
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
    expect(s?.version).toBe(4);
  });
  it('moves v2 blocks to the centre of the bigger island and places kaiju', () => {
    const fresh = newMemberSave('m', 'T', 'seed');
    const old = { ...fresh, version: 2, blocks: { '8,6': { x: 8, y: 6, kind: 'stone', broken: false } }, kaiju: fresh.kaiju.map((k) => ({ ...k, pos: undefined })) };
    const s = migrateSave(old)!;
    expect(Object.keys(s.blocks)).toEqual(['16,12']);
    expect(s.blocks['16,12']?.kinds).toEqual(['stone']);
    expect(s.plans).toEqual([]);
    expect(s.kaiju[0]?.pos).toBeDefined();
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
