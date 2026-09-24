import Phaser from 'phaser';
import {
  BLOCK_INFO,
  BLOCK_KINDS,
  BLUEPRINTS,
  MAX_STACK,
  CARE_ACTIONS,
  CARE_INFO,
  KIND_INFO,
  STAGES,
  TYPE_INFO,
  WEATHER_INFO,
  applyCare,
  blockKey,
  brokenBlocks,
  dayIndex,
  dexProgress,
  eggReady,
  findPath,
  findStructures,
  generateIsland,
  growthProgress,
  hatchGenome,
  isLand,
  kaijuStats,
  lineTiles,
  neediestCare,
  nestTile,
  newCareState,
  newGrowth,
  placeBlock,
  planCells,
  planComplete,
  recordInDex,
  removeBlock,
  repairBlock,
  spawnTile,
  structureEffects,
  weatherFor,
  type BlockKind,
  type Blueprint,
  type BuildLayer,
  type CareAction,
  type Island,
  type Kaiju,
  type MemberSave,
  type Plan,
  type Structure,
} from '@monzilla/core';
import { getStore } from '../game/ctx.js';
import { sfx } from '../game/audio.js';
import { IslandCamera } from '../game/camera.js';
import { COLORS, FONT, burst, floatText, handleResize, label, layoutFor, makeBar, makeButton, panel, type Bar, type Button } from '../game/ui.js';
import { drawEgg } from '../render/kaiju.js';
import { createKaiju, kaijuAnchor, kaijuContains } from '../render/kaijuSprite.js';
import { attachMotion, presetFor, type Motion } from '../render/motion.js';
import { getParts } from '../render/parts.js';
import { drawBlocks, drawIslandTiles, drawPlanGhost, drawStructureBadge, type IslandView } from '../render/island.js';

const STAGE_ICON: Record<string, string> = { egg: '🥚', hatchling: '🐣', juvenile: '🦎', guardian: '🦖' };

/** World units per tile. The camera zooms the whole world, so this is fixed. */
const TILE = 64;
type Tool = BlockKind | 'erase' | 'hand';
const STRUCTURE_COLOR: Record<Structure['id'], number> = { habitat: 0xffb300, wall: 0x78909c, watchtower: 0x42a5f5 };

/**
 * Home screen. One island in the world layer with the kaiju living on it,
 * a HUD in a separate UI layer drawn by its own camera. Three zoom
 * levels: overview, explore, craft. Tap a tile to walk there; in build
 * mode, tap a tile to place the selected block.
 */
export class IslandScene extends Phaser.Scene {
  private selected = 0;
  private island!: Island;
  private view: IslandView = {
    ox: 0,
    oy: 0,
    tile: TILE,
    tileToPixel: (x, y) => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 }),
    pixelToTile: (px, py) => {
      const x = Math.floor(px / TILE);
      const y = Math.floor(py / TILE);
      return x < 0 || y < 0 || x >= this.island.width || y >= this.island.height ? null : { x, y };
    },
  };
  private world!: Phaser.GameObjects.Container;
  private ui!: Phaser.GameObjects.Container;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private camera!: IslandCamera;
  private islandRt!: Phaser.GameObjects.RenderTexture;
  private chunks: Phaser.GameObjects.RenderTexture[] = [];
  private blocksGfx!: Phaser.GameObjects.Graphics;
  private gridGfx!: Phaser.GameObjects.Graphics;
  private ghostGfx!: Phaser.GameObjects.Graphics;
  private kaijuSprites = new Map<string, Phaser.GameObjects.Container>();
  private motions = new Map<string, Motion>();
  private walking = false;
  private careBars: Partial<Record<CareAction, Bar>> = {};
  private growthBar: Bar | null = null;
  private careButtons: Partial<Record<CareAction, Button>> = {};
  private alarmBtn!: Button;
  private buildBtn!: Button;
  private zoomInBtn!: Button;
  private zoomOutBtn!: Button;
  private eggSprite: Phaser.GameObjects.Container | null = null;
  private statsPanel: Phaser.GameObjects.Container | null = null;
  private nameText!: Phaser.GameObjects.Text;
  private buildMode = false;
  private tool: Tool = 'stone';
  private toolButtons: Partial<Record<Tool, Button>> = {};
  private blueprintButtons: Partial<Record<Blueprint['id'], Button>> = {};
  private drawer: Phaser.GameObjects.Container | null = null;
  private busy = false;
  private structures: Structure[] = [];
  private undoStack: BuildLayer[] = [];
  private stamping: Blueprint | null = null;
  private lineStart: { x: number; y: number } | null = null;

  constructor() {
    super('Island');
  }

  init(data: { selected?: number; build?: boolean }) {
    if (typeof data.selected === 'number') this.selected = data.selected;
    if (typeof data.build === 'boolean') this.buildMode = data.build;
  }

  create() {
    handleResize(this);
    const store = getStore(this);
    const save = store.save;
    const L = layoutFor(this);
    this.selected = Math.min(this.selected, Math.max(0, save.kaiju.length - 1));
    this.island = generateIsland(save.seed);
    this.kaijuSprites.clear();
    this.motions.clear();
    this.careBars = {};
    this.careButtons = {};
    this.toolButtons = {};
    this.blueprintButtons = {};
    this.drawer = null;
    this.undoStack = [];
    this.stamping = null;
    this.lineStart = null;
    this.statsPanel = null;
    this.growthBar = null;

    // --- Two layers, two cameras ------------------------------------------
    this.world = this.add.container(0, 0);
    this.ui = this.add.container(0, 0);
    this.uiCam = this.cameras.add(0, 0, L.w, L.h);
    this.uiCam.ignore(this.world);
    this.cameras.main.ignore(this.ui);
    this.cameras.main.setBackgroundColor(0x2f8fc7);
    this.uiCam.transparent = true;

    // --- Island in the world layer ---------------------------------------
    const worldW = this.island.width * TILE;
    const worldH = this.island.height * TILE;
    // Zoomed out, the island is a baked texture (cheap to pan). Zoomed in,
    // a live vector drawing of just the visible tiles takes over so trees
    // and crystals stay crisp without redrawing the whole island each frame.
    const bake = this.add.graphics();
    drawIslandTiles(bake, this.island, this.view, false);
    this.islandRt = this.add.renderTexture(0, 0, worldW, worldH).setOrigin(0);
    this.islandRt.draw(bake, 0, 0);
    bake.destroy();
    // Zoomed in, 2x chunk textures take over so props stay crisp. Baked once
    // here; a vector redraw per frame would be tens of thousands of commands.
    this.chunks = [];
    const CH = 8;
    for (let cy = 0; cy < this.island.height; cy += CH) {
      for (let cx = 0; cx < this.island.width; cx += CH) {
        const w = Math.min(CH, this.island.width - cx);
        const h = Math.min(CH, this.island.height - cy);
        const g = this.add.graphics();
        const view2: IslandView = { ...this.view, ox: -cx * TILE * 2, oy: -cy * TILE * 2, tile: TILE * 2 };
        // One tile of margin so neighbours' cliffs and foam overlap into this chunk; the texture clips the rest.
        drawIslandTiles(g, this.island, view2, false, { x0: cx - 1, y0: cy - 1, x1: cx + w, y1: cy + h });
        const rt = this.add.renderTexture(cx * TILE, cy * TILE, w * TILE * 2, h * TILE * 2).setOrigin(0).setScale(0.5).setVisible(false);
        rt.draw(g, 0, 0);
        g.destroy();
        this.chunks.push(rt);
        this.world.add(rt);
      }
    }
    this.world.add(this.islandRt);

    this.gridGfx = this.add.graphics();
    this.world.add(this.gridGfx);
    this.blocksGfx = this.add.graphics();
    this.world.add(this.blocksGfx);
    this.ghostGfx = this.add.graphics();
    this.world.add(this.ghostGfx);
    this.redrawBlocks();

    // Egg nest on the shore.
    const egg = save.eggs[0];
    if (egg) {
      const nest = nestTile(this.island);
      const p = this.view.tileToPixel(nest.x, nest.y);
      const eg = this.add.graphics();
      drawEgg(eg, 0, 0, TILE * 0.32, TYPE_INFO[egg.type].color, egg.fragments / 3);
      const glow = this.add.graphics();
      glow.fillStyle(COLORS.star, 0.5);
      glow.fillCircle(0, 0, TILE * 0.55);
      glow.setVisible(eggReady(egg));
      const count = this.add
        .text(0, TILE * 0.55, `${egg.fragments}/3`, { fontSize: '18px', fontFamily: FONT, color: '#ffffff', fontStyle: 'bold', stroke: '#1f3a68', strokeThickness: 4 })
        .setOrigin(0.5);
      this.eggSprite = this.add.container(p.x, p.y - TILE * 0.2, [glow, eg, count]);
      this.world.add(this.eggSprite);
      if (eggReady(egg) && !save.settings.reduceMotion) {
        this.tweens.add({ targets: this.eggSprite, angle: { from: -6, to: 6 }, duration: 250, yoyo: true, repeat: -1 });
      }
    }

    // Kaiju standing on the island.
    for (const k of save.kaiju) this.addKaijuSprite(k);

    // --- Camera -------------------------------------------------------------
    const margin = TILE * 2;
    const fit = Math.min(L.w / (worldW + margin), L.h / (worldH + margin));
    this.camera = new IslandCamera(this, {
      bounds: new Phaser.Geom.Rectangle(-margin, -margin, worldW + margin * 2, worldH + margin * 2),
      levels: [fit, fit * 2.6, fit * 5.5],
      reduceMotion: save.settings.reduceMotion,
      onTap: (wx, wy) => this.onTapWorld(wx, wy),
      onHover: (wx, wy) => this.onHoverWorld(wx, wy),
      onDrag: (sx, sy, wx, wy) => this.onDrawDrag(sx, sy, wx, wy),
      onDragEnd: (sx, sy, wx, wy) => this.onDrawEnd(sx, sy, wx, wy),
      onZoomChange: (_z, level) => this.onZoomLevel(level),
    });
    const me = save.kaiju[this.selected];
    const focus = me?.pos ?? spawnTile(this.island);
    const fp = this.view.tileToPixel(focus.x, focus.y);
    this.camera.setLevel(this.buildMode ? 2 : 0, this.buildMode ? fp.x : worldW / 2, this.buildMode ? fp.y : worldH / 2, false);

    // --- HUD ------------------------------------------------------------------
    this.buildHud(save, L);
    if (this.buildMode) this.openDrawer(save, L);
    this.updateGlow(save);
  }

  // ---------------------------------------------------------------------------
  // World

  private addKaijuSprite(k: Kaiju) {
    const pos = k.pos ?? spawnTile(this.island);
    const p = this.view.tileToPixel(pos.x, pos.y);
    // Size so a hatchling is about a tile tall and a guardian about two.
    const c = createKaiju(this, k.genome, p.x, p.y - TILE * 0.15, (TILE / 36) * 0.55);
    c.setDepth(pos.y);
    this.world.add(c);
    this.kaijuSprites.set(k.id, c);
    this.world.sort('depth');
    this.motions.set(k.id, attachMotion(this, c, presetFor(k.genome.kind, getParts(this).get(k.genome.kind)?.motion), getStore(this).save.settings));
  }

  private redrawBlocks() {
    const save = getStore(this).save;
    this.blocksGfx.clear();
    this.structures = findStructures(save.blocks);
    for (const st of this.structures) {
      const tiles = st.tiles.map((k) => ({ x: Number(k.split(',')[0]), y: Number(k.split(',')[1]) }));
      drawStructureBadge(this.blocksGfx, tiles, this.view, STRUCTURE_COLOR[st.id]);
    }
    drawBlocks(this.blocksGfx, save.blocks, this.view);
    if (this.buildMode) {
      for (const plan of save.plans) drawPlanGhost(this.blocksGfx, planCells(plan), save.blocks, this.view);
    }
    for (const [id, b] of Object.entries(this.blueprintButtons)) b?.setSub(`${this.structures.filter((s) => s.id === id).length}`);
    this.redrawGrid();
  }

  private redrawGrid() {
    this.gridGfx.clear();
    if (!this.buildMode) return;
    this.gridGfx.lineStyle(1, 0x1f3a68, 0.2);
    for (let y = 0; y < this.island.height; y++) {
      for (let x = 0; x < this.island.width; x++) {
        if (isLand(this.island, x, y)) this.gridGfx.strokeRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }

  private onHoverWorld(wx: number, wy: number) {
    this.ghostGfx.clear();
    if (!this.buildMode || this.tool === 'hand') return;
    const t = this.view.pixelToTile(wx, wy);
    if (!t || !isLand(this.island, t.x, t.y)) return;
    if (this.stamping) {
      const plan = this.planAt(this.stamping, t.x, t.y);
      drawPlanGhost(this.ghostGfx, planCells(plan), getStore(this).save.blocks, this.view);
      return;
    }
    if (this.tool === 'erase') {
      this.ghostGfx.lineStyle(4, 0xff5252, 0.9);
      this.ghostGfx.strokeRoundedRect(t.x * TILE + 6, t.y * TILE + 6, TILE - 12, TILE - 12, 10);
      return;
    }
    const color = Phaser.Display.Color.HexStringToColor(BLOCK_INFO[this.tool].color).color;
    this.ghostGfx.fillStyle(color, 0.45);
    this.ghostGfx.fillRoundedRect(t.x * TILE + 6, t.y * TILE + 6, TILE - 12, TILE - 12, 10);
    this.ghostGfx.lineStyle(3, 0xffffff, 0.9);
    this.ghostGfx.strokeRoundedRect(t.x * TILE + 6, t.y * TILE + 6, TILE - 12, TILE - 12, 10);
  }

  private onDrawDrag(sx: number, sy: number, wx: number, wy: number) {
    if (!this.buildMode || this.tool === 'hand' || this.tool === 'erase' || this.stamping) return;
    const a = this.view.pixelToTile(sx, sy);
    const b = this.view.pixelToTile(wx, wy);
    if (!a || !b) return;
    this.lineStart = a;
    this.ghostGfx.clear();
    const color = Phaser.Display.Color.HexStringToColor(BLOCK_INFO[this.tool].color).color;
    for (const t of lineTiles(a, b)) {
      if (!isLand(this.island, t.x, t.y)) continue;
      this.ghostGfx.fillStyle(color, 0.45);
      this.ghostGfx.fillRoundedRect(t.x * TILE + 6, t.y * TILE + 6, TILE - 12, TILE - 12, 10);
    }
  }

  private onDrawEnd(sx: number, sy: number, wx: number, wy: number) {
    this.ghostGfx.clear();
    if (!this.buildMode || this.tool === 'hand' || this.tool === 'erase' || this.stamping) return;
    const a = this.view.pixelToTile(sx, sy);
    const b = this.view.pixelToTile(wx, wy);
    this.lineStart = null;
    if (!a || !b) return;
    const store = getStore(this);
    const kind = this.tool as BlockKind;
    this.pushUndo();
    let placed = 0;
    store.update((st) => {
      let blocks = st.blocks;
      for (const t of lineTiles(a, b)) {
        if (st.kaiju.some((k) => k.pos && k.pos.x === t.x && k.pos.y === t.y)) continue;
        const before = blocks;
        blocks = placeBlock(blocks, this.island, t.x, t.y, kind);
        if (blocks !== before) placed++;
      }
      return { ...st, blocks };
    });
    if (placed > 0) sfx.place();
    this.afterBuild();
  }

  private onTapWorld(wx: number, wy: number) {
    this.ghostGfx.clear();
    const store = getStore(this);
    const save = store.save;
    const t = this.view.pixelToTile(wx, wy);
    if (!t) return;
    sfx.unlock();

    // Egg first: tapping the nest hatches or reports progress.
    const egg = save.eggs[0];
    if (egg && this.eggSprite) {
      const nest = nestTile(this.island);
      if (Math.abs(t.x - nest.x) <= 0 && Math.abs(t.y - nest.y) <= 1) {
        if (eggReady(egg)) return this.hatch();
        floatText(this, this.eggSprite.x, this.eggSprite.y - 40, `${egg.fragments}/3`, '#ffffff', save.settings, 26, this.world);
        return;
      }
    }

    if (this.buildMode) return this.buildAt(t.x, t.y);

    // Tap on a kaiju shows its stats; tap elsewhere walks the selected one.
    for (const [id, sprite] of this.kaijuSprites) {
      if (kaijuContains(sprite, wx, wy)) {
        const idx = save.kaiju.findIndex((k) => k.id === id);
        if (idx >= 0 && idx !== this.selected) return this.scene.restart({ selected: idx });
        return this.toggleStats();
      }
    }
    this.walkTo(t.x, t.y);
  }

  private walkTo(x: number, y: number, onArrive?: () => void) {
    if (this.walking) return;
    const store = getStore(this);
    const me = store.save.kaiju[this.selected];
    const sprite = me && this.kaijuSprites.get(me.id);
    if (!me || !sprite) return;
    const from = me.pos ?? spawnTile(this.island);
    if (!isLand(this.island, x, y)) {
      floatText(this, x * TILE + TILE / 2, y * TILE, '🌊', '#ffffff', store.save.settings, 28, this.world);
      return;
    }
    const blocks = store.save.blocks;
    const path = findPath(this.island, from, { x, y }, (bx, by) => Boolean(blocks[blockKey(bx, by)]));
    if (!path) {
      floatText(this, x * TILE + TILE / 2, y * TILE, '🚧', '#ffffff', store.save.settings, 28, this.world);
      return;
    }
    if (path.length === 0) {
      onArrive?.();
      return;
    }
    this.walking = true;
    const settings = store.save.settings;
    const stepMs = settings.reduceMotion ? 60 : 170;
    this.motions.get(me.id)?.stop();
    let i = 0;
    const step = () => {
      const p = path[i];
      if (!p) {
        this.walking = false;
        store.update((s) => ({ ...s, kaiju: s.kaiju.map((k) => (k.id === me.id ? { ...k, pos: { x, y } } : k)) }));
        this.motions.set(me.id, attachMotion(this, sprite, presetFor(me.genome.kind, getParts(this).get(me.genome.kind)?.motion), settings));
        this.updateGlow(store.save);
        onArrive?.();
        return;
      }
      const px = this.view.tileToPixel(p.x, p.y);
      const facing = px.x < sprite.x ? -1 : px.x > sprite.x ? 1 : Math.sign(sprite.scaleX) || 1;
      sprite.setScale(facing, 1); // flip the whole creature; parts come along
      sprite.setDepth(p.y);
      this.world.sort('depth');
      this.tweens.add({
        targets: sprite,
        x: px.x,
        y: px.y - TILE * 0.15,
        duration: stepMs,
        ease: 'Linear',
        onComplete: () => {
          i++;
          step();
        },
      });
      if (!settings.reduceMotion) {
        this.tweens.add({ targets: sprite, scaleY: 0.92, duration: stepMs / 2, yoyo: true });
      }
      if (i % 2 === 0) sfx.tap();
    };
    step();
  }

  private planAt(bp: Blueprint, x: number, y: number): Plan {
    return bp.shape.type === 'line' ? { id: bp.id, x, y, length: bp.shape.minLength, axis: 'x' } : { id: bp.id, x, y };
  }

  private pushUndo() {
    this.undoStack.push(getStore(this).save.blocks);
    if (this.undoStack.length > 30) this.undoStack.shift();
  }

  private undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    getStore(this).update((st) => ({ ...st, blocks: prev }));
    sfx.tap();
    this.afterBuild();
  }

  /** After any block change: redraw, refresh the repair badge, and finish any completed plans. */
  private afterBuild() {
    const store = getStore(this);
    const before = new Set(this.structures.map((st) => `${st.id}:${st.x},${st.y}`));
    this.redrawBlocks();
    this.updateBuildButton(store.save);
    const done = store.save.plans.filter((p) => planComplete(p, store.save.blocks));
    if (done.length > 0) store.update((st) => ({ ...st, plans: st.plans.filter((p) => !done.includes(p)) }));
    const fresh = this.structures.filter((st) => !before.has(`${st.id}:${st.x},${st.y}`));
    for (const st of fresh) {
      const p = this.view.tileToPixel(st.x, st.y);
      sfx.sparkle();
      burst(this, p.x + TILE / 2, p.y, STRUCTURE_COLOR[st.id], store.save.settings, 30, this.world);
      const bp = BLUEPRINTS.find((b) => b.id === st.id)!;
      floatText(this, p.x + TILE / 2, p.y - TILE, `${bp.icon} ✓`, '#ffffff', store.save.settings, 40, this.world);
    }
    if (done.length > 0) this.redrawBlocks();
  }

  private buildAt(x: number, y: number) {
    const store = getStore(this);
    const s = store.save;
    const existing = s.blocks[blockKey(x, y)];
    const px = this.view.tileToPixel(x, y);
    if (this.tool === 'hand' && !this.stamping) return;
    if (this.stamping) {
      // Stamp a plan: ghost cubes to fill in. Tapping an existing plan of the same kind removes it.
      const bp = this.stamping;
      const plan = this.planAt(bp, x, y);
      const cells = planCells(plan);
      if (!cells.every((c) => isLand(this.island, c.dx, c.dy))) {
        floatText(this, px.x, px.y, '🌊', '#ffffff', s.settings, 28, this.world);
        return;
      }
      const hit = s.plans.find((p) => planCells(p).some((c) => c.dx === x && c.dy === y));
      store.update((st) => ({ ...st, plans: hit ? st.plans.filter((p) => p !== hit) : [...st.plans, plan] }));
      sfx.tap();
      this.redrawBlocks();
      return;
    }
    if (existing?.broken) {
      this.pushUndo();
      store.update((st) => ({ ...st, blocks: repairBlock(st.blocks, x, y) }));
      sfx.repair();
      burst(this, px.x, px.y, 0xa5d6a7, s.settings, 10, this.world);
      this.afterBuild();
      return;
    }
    if (this.tool === 'erase') {
      if (existing) {
        this.pushUndo();
        store.update((st) => ({ ...st, blocks: removeBlock(st.blocks, x, y) }));
        sfx.crunch();
        this.afterBuild();
      }
      return;
    }
    if (!isLand(this.island, x, y)) {
      floatText(this, px.x, px.y, '🌊', '#ffffff', s.settings, 28, this.world);
      return;
    }
    // Don't build on top of a kaiju.
    for (const k of s.kaiju) if (k.pos && k.pos.x === x && k.pos.y === y) return;
    if (existing && existing.kinds.length >= MAX_STACK) {
      floatText(this, px.x, px.y - TILE, `${MAX_STACK} ⬆️`, '#ffffff', s.settings, 26, this.world);
      return;
    }
    this.pushUndo();
    store.update((st) => ({ ...st, blocks: placeBlock(st.blocks, this.island, x, y, this.tool as BlockKind) }));
    sfx.place();
    this.afterBuild();
  }

  // ---------------------------------------------------------------------------
  // HUD

  private buildHud(save: MemberSave, L: ReturnType<typeof layoutFor>) {
    const kaiju = save.kaiju[this.selected];
    const hudH = L.btn + L.pad;
    const hudY = L.pad + hudH / 2;
    this.ui.add(panel(this, L.pad, L.pad, L.w - L.pad * 2, hudH, COLORS.panel, 0.94));

    const today = dayIndex();
    const weather = weatherFor(save.seed, today);
    const tomorrow = weatherFor(save.seed, today + 1);
    this.ui.add(
      this.add
        .text(L.pad * 2, L.compact ? hudY - 16 : hudY, `${WEATHER_INFO[weather].icon} ▸ ${WEATHER_INFO[tomorrow].icon}`, { fontSize: `${L.compact ? 24 : 36}px`, fontFamily: FONT })
        .setOrigin(0, 0.5),
    );
    this.ui.add(
      this.add
        .text(L.compact ? L.pad * 2 : L.pad * 2 + 170, L.compact ? hudY + 18 : hudY, `⭐ ${save.stars}`, { fontSize: `${L.compact ? 22 : 30}px`, fontFamily: FONT, color: COLORS.text, fontStyle: 'bold' })
        .setOrigin(0, 0.5),
    );

    const dp = dexProgress(save.dex);
    const smallBtn = L.btn * 0.8;
    const rightX = L.w - L.pad * 2 - smallBtn / 2;
    this.ui.add(makeButton(this, rightX, hudY, { icon: '⚙️', label: 'Settings', size: smallBtn, settings: save.settings, onTap: () => this.scene.start('Settings') }));
    this.ui.add(
      makeButton(this, rightX - smallBtn - 12, hudY, {
        icon: '📖', label: 'Kaiju book', size: smallBtn, sub: `${dp.have}/${dp.total}`, settings: save.settings, onTap: () => this.scene.start('Dex'),
      }),
    );
    this.buildBtn = makeButton(this, rightX - (smallBtn + 12) * 2, hudY, {
      icon: '🧱', label: 'Build', size: smallBtn, settings: save.settings, onTap: () => this.toggleBuild(),
    });
    this.ui.add(this.buildBtn);
    this.updateBuildButton(save);

    // Zoom controls on the left edge under the HUD.
    const zx = L.pad + smallBtn / 2 + 6;
    const zy = L.pad * 2 + hudH + smallBtn / 2;
    this.zoomInBtn = makeButton(this, zx, zy, { icon: '➕', label: 'Zoom in', size: smallBtn * 0.85, settings: save.settings, onTap: () => this.camera.zoomIn(...this.focusPoint()) });
    this.zoomOutBtn = makeButton(this, zx, zy + smallBtn * 0.85 + 10, { icon: '➖', label: 'Zoom out', size: smallBtn * 0.85, settings: save.settings, onTap: () => this.camera.zoomOut() });
    const homeBtn = makeButton(this, zx, zy + (smallBtn * 0.85 + 10) * 2, { icon: '🎯', label: 'Find my kaiju', size: smallBtn * 0.85, settings: save.settings, onTap: () => this.findKaiju() });
    this.ui.add([this.zoomInBtn, this.zoomOutBtn, homeBtn]);
    this.onZoomLevel(this.camera.level);

    // Kaiju card: name, care bars, growth bar. Right side in landscape,
    // under the HUD in portrait.
    const cardW = L.portrait ? Math.min(230, L.w * 0.5) : 250;
    const cardX = L.portrait ? L.w - L.pad - cardW : L.w - L.pad - cardW;
    const cardY = L.pad * 2 + hudH;
    const barH = L.compact ? 20 : 24;
    const cardH = 44 + 5 * (barH + 8) + 8;
    this.ui.add(panel(this, cardX, cardY, cardW, cardH, COLORS.panel, 0.9));
    this.nameText = label(this, cardX + cardW / 2, cardY + 22, kaiju ? `${STAGE_ICON[kaiju.growth.stage] ?? ''} ${KIND_INFO[kaiju.genome.kind].icon} ${kaiju.name}` : '🥚', 20);
    this.ui.add(this.nameText);
    if (kaiju) {
      const barW = cardW - 24;
      CARE_ACTIONS.forEach((action, i) => {
        const info = CARE_INFO[action];
        const bar = makeBar(this, cardX + 12, cardY + 44 + i * (barH + 8), barW, barH, {
          icon: info.icon, color: COLORS[action], value: kaiju.care[info.bar], settings: save.settings,
        });
        this.careBars[action] = bar;
        this.ui.add(bar);
      });
      this.growthBar = makeBar(this, cardX + 12, cardY + 44 + 4 * (barH + 8) + 4, barW, barH, {
        icon: STAGE_ICON[this.nextStageOf(kaiju)] ?? '⭐', color: COLORS.star, value: Math.round(growthProgress(kaiju.growth) * 100), settings: save.settings,
      });
      this.ui.add(this.growthBar);
    }
    if (save.kaiju.length > 1) {
      const size = L.btn * 0.55;
      const y = cardY + cardH + size / 2 + 8;
      this.ui.add(
        makeButton(this, cardX + size / 2 + 8, y, {
          icon: '◀️', label: 'Previous kaiju', size, settings: save.settings,
          onTap: () => this.scene.restart({ selected: (this.selected - 1 + save.kaiju.length) % save.kaiju.length, build: this.buildMode }),
        }),
      );
      this.ui.add(
        makeButton(this, cardX + cardW - size / 2 - 8, y, {
          icon: '▶️', label: 'Next kaiju', size, settings: save.settings,
          onTap: () => this.scene.restart({ selected: (this.selected + 1) % save.kaiju.length, build: this.buildMode }),
        }),
      );
    }

    // Care buttons + alarm along the bottom.
    const count = CARE_ACTIONS.length + 1;
    const gap = L.compact ? 10 : 18;
    const totalW = count * L.btn + (count - 1) * gap;
    const startX = L.w / 2 - totalW / 2 + L.btn / 2;
    const careY = L.h - L.pad - L.btn / 2;
    CARE_ACTIONS.forEach((action, i) => {
      const b = makeButton(this, startX + i * (L.btn + gap), careY, {
        icon: CARE_INFO[action].icon, label: CARE_INFO[action].label, size: L.btn, color: COLORS[action], settings: save.settings, disabled: !kaiju,
        onTap: () => this.care(action),
      });
      this.careButtons[action] = b;
      this.ui.add(b);
    });
    const villainToday = save.activeBattle !== null || save.lastVillainDay !== today;
    this.alarmBtn = makeButton(this, startX + CARE_ACTIONS.length * (L.btn + gap), careY, {
      icon: save.activeBattle ? '⚔️' : '🚨',
      label: save.activeBattle ? 'Back to the fight' : villainToday ? 'Bad guy alert' : 'All clear',
      size: L.btn,
      color: villainToday ? COLORS.alarm : 0x9fb3c8,
      settings: save.settings,
      disabled: !villainToday || !kaiju,
      onTap: () => this.scene.start('Battle'),
    });
    this.ui.add(this.alarmBtn);
  }

  private focusPoint(): [number, number] {
    const me = getStore(this).save.kaiju[this.selected];
    const sprite = me && this.kaijuSprites.get(me.id);
    return sprite ? [sprite.x, sprite.y] : [this.cameras.main.midPoint.x, this.cameras.main.midPoint.y];
  }

  private findKaiju() {
    const [x, y] = this.focusPoint();
    if (this.camera.level === 0) this.camera.setLevel(1, x, y);
    else this.camera.centerOn(x, y);
  }

  private onZoomLevel(level: number) {
    this.zoomInBtn?.setDisabledState(level >= 2);
    this.zoomOutBtn?.setDisabledState(level <= 0);
    const close = level >= 1;
    for (const c of this.chunks) c.setVisible(close);
    this.islandRt?.setVisible(!close);
  }

  private updateBuildButton(save: MemberSave) {
    const broken = brokenBlocks(save.blocks).length;
    this.buildBtn.setSub(broken > 0 ? `🔨${broken}` : '');
  }

  private toggleBuild() {
    this.buildMode = !this.buildMode;
    const store = getStore(this);
    const L = layoutFor(this);
    if (this.buildMode) {
      const [x, y] = this.focusPoint();
      this.camera.setLevel(2, x, y);
      this.openDrawer(store.save, L);
    } else {
      this.closeDrawer();
      this.ghostGfx.clear();
      this.stamping = null;
      this.camera.setPanEnabled(true);
      if (this.camera.level === 2) this.camera.setLevel(1);
    }
    this.buildBtn.setGlow(this.buildMode);
    this.redrawBlocks();
  }

  private openDrawer(save: MemberSave, L: ReturnType<typeof layoutFor>) {
    this.closeDrawer();
    const size = L.compact ? 48 : 60;
    const gap = 8;
    const tools: Tool[] = ['hand', ...BLOCK_KINDS, 'erase'];
    const toolRows = L.compact ? 2 : 1;
    const perRow = Math.ceil(tools.length / toolRows);
    const bpCount = BLUEPRINTS.length + 1; // + undo
    const cols = Math.max(perRow, bpCount);
    const drawerW = cols * size + (cols - 1) * gap + L.pad * 2;
    const rows = toolRows + 1;
    const drawerH = rows * size + (rows - 1) * gap + L.pad * 2 + 18;
    const x = L.w / 2 - drawerW / 2;
    const y = L.h - L.pad * 2 - L.btn - drawerH - 8;
    const c = this.add.container(0, 0);
    c.add(panel(this, x, y, drawerW, drawerH, COLORS.panel, 0.96));
    // Row 0: blueprints and undo. Blueprint buttons show how many stand.
    BLUEPRINTS.forEach((bp, i) => {
      const built = this.structures.filter((s) => s.id === bp.id).length;
      const b = makeButton(this, x + L.pad + size / 2 + i * (size + gap), y + L.pad + size / 2, {
        icon: bp.icon, label: `${bp.label}: ${bp.effect}`, size, sub: `${built}`, color: STRUCTURE_COLOR[bp.id], settings: save.settings,
        onTap: () => this.selectBlueprint(bp),
      });
      this.blueprintButtons[bp.id] = b;
      c.add(b);
    });
    c.add(
      makeButton(this, x + L.pad + size / 2 + BLUEPRINTS.length * (size + gap), y + L.pad + size / 2, {
        icon: '↩️', label: 'Undo', size, settings: save.settings, onTap: () => this.undo(),
      }),
    );
    c.add(this.add.text(x + L.pad, y + L.pad + size + 2, 'blueprints', { fontSize: '12px', fontFamily: FONT, color: COLORS.muted }));
    // Rows 1+: hand, blocks, eraser.
    tools.forEach((tool, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const info = tool === 'erase' ? { icon: '🧽', label: 'Eraser' } : tool === 'hand' ? { icon: '✋', label: 'Move around' } : BLOCK_INFO[tool];
      const b = makeButton(this, x + L.pad + size / 2 + col * (size + gap), y + L.pad + size + 18 + size / 2 + row * (size + gap) + gap, {
        icon: info.icon, label: info.label, size, settings: save.settings, onTap: () => this.selectTool(tool),
      });
      this.toolButtons[tool] = b;
      c.add(b);
    });
    this.ui.add(c);
    this.drawer = c;
    this.selectTool(this.tool);
    this.buildBtn.setGlow(true);
  }

  private selectBlueprint(bp: Blueprint) {
    this.stamping = this.stamping?.id === bp.id ? null : bp;
    this.camera.setPanEnabled(this.stamping === null && this.tool === 'hand');
    for (const [id, b] of Object.entries(this.blueprintButtons)) b?.setGlow(this.stamping?.id === id);
    for (const [k, b] of Object.entries(this.toolButtons)) b?.setGlow(!this.stamping && k === this.tool);
    this.ghostGfx.clear();
  }

  private closeDrawer() {
    this.drawer?.destroy();
    this.drawer = null;
    this.toolButtons = {};
  }

  private selectTool(tool: Tool) {
    this.tool = tool;
    this.stamping = null;
    for (const [, b] of Object.entries(this.blueprintButtons)) b?.setGlow(false);
    for (const [k, b] of Object.entries(this.toolButtons)) b?.setGlow(k === tool);
    // Block tools draw on drag; the hand pans.
    this.camera.setPanEnabled(tool === 'hand');
    this.ghostGfx.clear();
  }

  private nextStageOf(k: Kaiju): string {
    const i = STAGES.indexOf(k.growth.stage);
    return STAGES[Math.min(i + 1, STAGES.length - 1)] ?? 'guardian';
  }

  /** Priority: hatch > repair > alarm > neediest care. Only one glows. */
  private updateGlow(save: MemberSave) {
    for (const b of Object.values(this.careButtons)) b?.setGlow(false);
    this.alarmBtn.setGlow(false);
    if (!this.buildMode) this.buildBtn.setGlow(false);
    const egg = save.eggs[0];
    const kaiju = save.kaiju[this.selected];
    if (egg && eggReady(egg)) return;
    if (brokenBlocks(save.blocks).length > 0) return this.buildBtn.setGlow(true);
    if (kaiju && (save.activeBattle || save.lastVillainDay !== dayIndex())) return this.alarmBtn.setGlow(true);
    if (kaiju) this.careButtons[neediestCare(kaiju.care)]?.setGlow(true);
  }

  private care(action: CareAction) {
    if (this.busy) return;
    const store = getStore(this);
    const save = store.save;
    const kaiju = save.kaiju[this.selected];
    if (!kaiju) return;
    // Sleep in a habitat if one stands: walk there first, then a bigger nap.
    const fx = structureEffects(this.structures);
    const habitat = fx.habitats[0];
    if (action === 'sleep' && habitat && !this.walking) {
      const pos = kaiju.pos ?? spawnTile(this.island);
      const door = { x: habitat.x, y: habitat.y + 2 };
      const there = pos.x === door.x && pos.y === door.y;
      if (!there && isLand(this.island, door.x, door.y) && !save.blocks[blockKey(door.x, door.y)]) {
        this.walkTo(door.x, door.y, () => this.applyCareNow('sleep', fx.restBonus));
        return;
      }
    }
    this.applyCareNow(action, action === 'sleep' ? fx.restBonus : 0);
  }

  private applyCareNow(action: CareAction, bonus: number) {
    const store = getStore(this);
    const save = store.save;
    const kaiju = save.kaiju[this.selected];
    if (!kaiju) return;
    const result = applyCare(kaiju, action, bonus);
    const next = store.update((s) => ({ ...s, kaiju: s.kaiju.map((k, i) => (i === this.selected ? result.kaiju : k)) }));

    const info = CARE_INFO[action];
    this.careBars[action]?.setValue(result.kaiju.care[info.bar]);
    this.growthBar?.setValue(Math.round(growthProgress(result.kaiju.growth) * 100));
    ({ feed: () => sfx.chomp(), wash: () => sfx.splash(), play: () => sfx.boing(), sleep: () => sfx.snore() })[action]();
    const sprite = this.kaijuSprites.get(kaiju.id);
    if (sprite) {
      const head = kaijuAnchor(sprite, 'head');
      floatText(this, head.x, head.y - TILE * 0.5, result.barGain > 0 ? `+${result.barGain}` : '+1', result.barGain > 0 ? '#a5d6a7' : '#ffffff', save.settings, 30, this.world);
      const m = this.motions.get(kaiju.id);
      if (action === 'play') m?.hop();
      else m?.squash();
    }

    if (result.grewTo) {
      this.busy = true;
      sfx.grow();
      if (sprite) burst(this, sprite.x, sprite.y, COLORS.star, save.settings, 30, this.world);
      this.time.delayedCall(900, () => {
        this.busy = false;
        this.scene.restart({ selected: this.selected, build: this.buildMode });
      });
    } else {
      this.updateGlow(next);
    }
  }

  private hatch() {
    const store = getStore(this);
    const save = store.save;
    const egg = save.eggs[0];
    if (!egg || !eggReady(egg)) return;
    const genome = hatchGenome(egg);
    const nest = nestTile(this.island);
    const kaiju: Kaiju = {
      id: `k_${egg.seed.toString(36)}`,
      name: '',
      genome,
      care: newCareState(),
      growth: newGrowth('hatchling'),
      createdAt: Date.now(),
      pos: { ...nest },
    };
    store.update((s) => ({
      ...s,
      kaiju: [...s.kaiju, kaiju],
      eggs: s.eggs.filter((e) => e.id !== egg.id),
      dex: recordInDex(s.dex, genome),
    }));
    sfx.sparkle();
    if (this.eggSprite) burst(this, this.eggSprite.x, this.eggSprite.y, COLORS.star, save.settings, 40, this.world);
    this.time.delayedCall(700, () => this.scene.restart({ selected: store.save.kaiju.length - 1 }));
  }

  private toggleStats() {
    if (this.statsPanel) {
      this.statsPanel.destroy();
      this.statsPanel = null;
      return;
    }
    const save = getStore(this).save;
    const kaiju = save.kaiju[this.selected];
    if (!kaiju) return;
    const L = layoutFor(this);
    const stats = kaijuStats(kaiju);
    const w = Math.min(300, L.w - L.pad * 2);
    const h = 4 * 34 + 70;
    const x = L.w / 2 - w / 2;
    const y = L.h / 2 - h / 2;
    const c = this.add.container(0, 0);
    c.add(panel(this, x, y, w, h));
    c.add(label(this, x + w / 2, y + 26, `${KIND_INFO[kaiju.genome.kind].icon} ${TYPE_INFO[kaiju.genome.type].icon} ${kaiju.genome.shiny ? '✨' : ''}`, 26));
    const rows: [string, number][] = [
      ['💪', stats.power],
      ['💨', stats.speed],
      ['❤️', stats.heart],
      ['🛡️', stats.guard],
    ];
    rows.forEach(([icon, v], i) => {
      c.add(makeBar(this, x + 16, y + 52 + i * 34, w - 32, 26, { icon, color: COLORS.button, value: v, settings: save.settings }));
    });
    c.setDepth(500);
    this.ui.add(c);
    this.statsPanel = c;
    sfx.tap();
  }
}
