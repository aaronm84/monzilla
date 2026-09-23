import Phaser from 'phaser';
import {
  CARE_ACTIONS,
  CARE_INFO,
  KIND_INFO,
  STAGES,
  TYPE_INFO,
  WEATHER_INFO,
  applyCare,
  brokenBlocks,
  dayIndex,
  dexProgress,
  eggReady,
  generateIsland,
  growthProgress,
  hatchGenome,
  kaijuStats,
  neediestCare,
  newCareState,
  newGrowth,
  recordInDex,
  weatherFor,
  type CareAction,
  type Kaiju,
  type MemberSave,
} from '@monzilla/core';
import { getStore } from '../game/ctx.js';
import { sfx } from '../game/audio.js';
import { COLORS, FONT, bob, burst, floatText, handleResize, label, layoutFor, makeBar, makeButton, panel, type Bar, type Button } from '../game/ui.js';
import { drawEgg, drawKaiju } from '../render/kaiju.js';
import { drawBlocks, drawIslandTiles, fitIsland } from '../render/island.js';

const STAGE_ICON: Record<string, string> = { egg: '🥚', hatchling: '🐣', juvenile: '🦎', guardian: '🦖' };

/**
 * Home screen. Island in the back, the chosen kaiju in front, four care
 * buttons along the bottom, and a HUD with weather, stars, and the doors to
 * the other scenes. Exactly one thing glows at a time: the next thing to do.
 */
export class IslandScene extends Phaser.Scene {
  private selected = 0;
  private kaijuGfx!: Phaser.GameObjects.Graphics;
  private careBars: Partial<Record<CareAction, Bar>> = {};
  private growthBar!: Bar;
  private careButtons: Partial<Record<CareAction, Button>> = {};
  private alarmBtn!: Button;
  private buildBtn!: Button;
  private eggBtn: Phaser.GameObjects.Container | null = null;
  private statsPanel: Phaser.GameObjects.Container | null = null;
  private kaijuPos = { x: 0, y: 0 };
  private nameText!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super('Island');
  }

  init(data: { selected?: number }) {
    if (typeof data.selected === 'number') this.selected = data.selected;
  }

  create() {
    handleResize(this);
    const store = getStore(this);
    const save = store.save;
    const L = layoutFor(this);
    this.selected = Math.min(this.selected, Math.max(0, save.kaiju.length - 1));

    // --- Island backdrop -------------------------------------------------
    const island = generateIsland(save.seed);
    const hudH = L.btn + L.pad * 2;
    const careH = L.btn + L.pad * 2;
    const islandArea = L.portrait
      ? { x: 0, y: hudH, w: L.w, h: L.h * 0.4 }
      : { x: 0, y: hudH, w: L.w * 0.6, h: L.h - hudH - careH };
    const view = fitIsland(island, islandArea.x, islandArea.y, islandArea.w, islandArea.h);
    const tiles = this.add.graphics();
    drawIslandTiles(tiles, island, view);
    drawBlocks(tiles, save.blocks, view);
    tiles.setAlpha(0.95);

    // Sky gradient on top of the island so the kaiju stands out.
    const sky = this.add.graphics();
    sky.fillGradientStyle(0xe6f5ff, 0xe6f5ff, COLORS.bg, COLORS.bg, 0.9, 0.9, 0, 0);
    sky.fillRect(0, 0, L.w, hudH);

    // --- Kaiju -----------------------------------------------------------
    // Landscape: a column to the right of the island. Name on top, bars
    // under it, the kaiju standing below the bars, egg beside the bars.
    // Portrait: the strip under the island. Bars on the left, kaiju on the
    // right, egg resting on the island's shore.
    const kaiju = save.kaiju[this.selected];
    const stageAreaY = L.portrait ? islandArea.y + islandArea.h : hudH;
    const stageAreaH = L.portrait ? L.h - stageAreaY - careH : L.h - hudH - careH;
    const stageAreaX = L.portrait ? 0 : islandArea.w;
    const stageAreaW = L.portrait ? L.w : L.w - islandArea.w;
    const kaijuScale = L.compact ? 0.85 : 1.1;
    this.kaijuPos = L.portrait
      ? { x: stageAreaX + stageAreaW * 0.7, y: stageAreaY + stageAreaH * 0.6 }
      : { x: stageAreaX + stageAreaW / 2, y: stageAreaY + stageAreaH * 0.76 };

    this.kaijuGfx = this.add.graphics();
    if (kaiju) {
      drawKaiju(this.kaijuGfx, kaiju.genome, this.kaijuPos.x, this.kaijuPos.y, kaijuScale);
      bob(this, this.kaijuGfx, save.settings);
      const hit = this.add.zone(this.kaijuPos.x, this.kaijuPos.y, 220, 220).setInteractive();
      hit.on('pointerdown', () => this.toggleStats());
    } else {
      label(this, this.kaijuPos.x, this.kaijuPos.y, '🥚 …', 40);
    }

    // Name + stage icon on one row at the top of the column.
    const nameY = stageAreaY + L.pad + 16;
    const nameX = L.portrait ? this.kaijuPos.x : stageAreaX + stageAreaW / 2;
    this.nameText = label(this, nameX, nameY, kaiju ? `${STAGE_ICON[kaiju.growth.stage] ?? ''} ${KIND_INFO[kaiju.genome.kind].icon}  ${kaiju.name}` : '', 26);

    // Care bars in a column.
    const barH = L.compact ? 22 : 26;
    const barGap = 8;
    const barW = L.portrait ? Math.min(200, stageAreaW * 0.45) : Math.min(220, stageAreaW - L.pad * 2 - 110);
    const barsX = stageAreaX + L.pad;
    const barsY = L.portrait ? stageAreaY + L.pad + 40 : nameY + 30;
    if (kaiju) {
      CARE_ACTIONS.forEach((action, i) => {
        const info = CARE_INFO[action];
        this.careBars[action] = makeBar(this, barsX, barsY + i * (barH + barGap), barW, barH, {
          icon: info.icon,
          color: COLORS[action],
          value: kaiju.care[info.bar],
          settings: save.settings,
        });
      });
      this.growthBar = makeBar(this, barsX, barsY + 4 * (barH + barGap) + 6, barW, barH, {
        icon: STAGE_ICON[this.nextStageOf(kaiju)] ?? '⭐',
        color: COLORS.star,
        value: Math.round(growthProgress(kaiju.growth) * 100),
        settings: save.settings,
      });
    }

    // Kaiju switcher (only with more than one)
    if (save.kaiju.length > 1) {
      const y = this.kaijuPos.y;
      const size = L.btn * 0.6;
      const lx = L.portrait ? barsX + barW + size / 2 + 8 : stageAreaX + L.pad + size / 2;
      const rx = stageAreaX + stageAreaW - L.pad - size / 2;
      makeButton(this, lx, y, {
        icon: '◀️', label: 'Previous kaiju', size, settings: save.settings,
        onTap: () => this.scene.restart({ selected: (this.selected - 1 + save.kaiju.length) % save.kaiju.length }),
      });
      makeButton(this, rx, y, {
        icon: '▶️', label: 'Next kaiju', size, settings: save.settings,
        onTap: () => this.scene.restart({ selected: (this.selected + 1) % save.kaiju.length }),
      });
    }

    // --- Egg -------------------------------------------------------------
    const egg = save.eggs[0];
    if (egg) {
      const eggR = L.compact ? 26 : 34;
      const ex = L.portrait ? L.w - L.pad - eggR * 1.6 : stageAreaX + stageAreaW - L.pad - eggR * 1.6;
      const ey = L.portrait ? islandArea.y + islandArea.h - eggR * 2.2 : barsY + eggR * 1.6;
      const eg = this.add.graphics();
      drawEgg(eg, 0, 0, eggR, TYPE_INFO[egg.type].color, egg.fragments / 3);
      const count = this.add
        .text(0, eggR * 1.5 + 6, `${egg.fragments}/3`, { fontSize: '20px', fontFamily: FONT, color: COLORS.text, fontStyle: 'bold' })
        .setOrigin(0.5);
      const glow = this.add.graphics();
      glow.fillStyle(COLORS.star, 0.5);
      glow.fillCircle(0, 0, eggR * 1.6);
      glow.setVisible(eggReady(egg));
      const c = this.add.container(ex, ey, [glow, eg, count]);
      c.setSize(100, 120).setInteractive(new Phaser.Geom.Rectangle(0, 0, 100, 120), Phaser.Geom.Rectangle.Contains);
      c.on('pointerdown', () => {
        sfx.unlock();
        if (eggReady(egg)) this.hatch();
        else floatText(this, ex, ey - 40, `${egg.fragments}/3`, '#ffffff', save.settings, 28);
      });
      if (eggReady(egg) && !save.settings.reduceMotion) {
        this.tweens.add({ targets: c, angle: { from: -6, to: 6 }, duration: 250, yoyo: true, repeat: -1 });
      }
      this.eggBtn = c;
    }

    // --- HUD -------------------------------------------------------------
    const today = dayIndex();
    const weather = weatherFor(save.seed, today);
    const tomorrow = weatherFor(save.seed, today + 1);
    panel(this, L.pad, L.pad, L.w - L.pad * 2, L.btn + L.pad, COLORS.panel, 0.94);
    const hudY = L.pad + (L.btn + L.pad) / 2;
    // Weather today ▸ tomorrow, then stars. On a phone they stack in two rows.
    this.add
      .text(L.pad * 2, L.compact ? hudY - 16 : hudY, `${WEATHER_INFO[weather].icon} ▸ ${WEATHER_INFO[tomorrow].icon}`, { fontSize: `${L.compact ? 24 : 36}px`, fontFamily: FONT })
      .setOrigin(0, 0.5);
    this.add
      .text(L.compact ? L.pad * 2 : L.pad * 2 + 170, L.compact ? hudY + 18 : hudY, `⭐ ${save.stars}`, { fontSize: `${L.compact ? 22 : 30}px`, fontFamily: FONT, color: COLORS.text, fontStyle: 'bold' })
      .setOrigin(0, 0.5);

    const dp = dexProgress(save.dex);
    const smallBtn = L.btn * 0.8;
    const rightX = L.w - L.pad * 2 - smallBtn / 2;
    makeButton(this, rightX, hudY, { icon: '⚙️', label: 'Settings', size: smallBtn, settings: save.settings, onTap: () => this.scene.start('Settings') });
    makeButton(this, rightX - smallBtn - 12, hudY, {
      icon: '📖', label: 'Kaiju book', size: smallBtn, sub: `${dp.have}/${dp.total}`, settings: save.settings,
      onTap: () => this.scene.start('Dex'),
    });
    const broken = brokenBlocks(save.blocks).length;
    this.buildBtn = makeButton(this, rightX - (smallBtn + 12) * 2, hudY, {
      icon: broken > 0 ? '🔨' : '🧱', label: broken > 0 ? 'Repair' : 'Build', size: smallBtn, sub: broken > 0 ? `${broken}` : '', settings: save.settings,
      onTap: () => this.scene.start('Build'),
    });

    // --- Care buttons + alarm ---------------------------------------------
    const count = CARE_ACTIONS.length + 1;
    const gap = L.compact ? 10 : 18;
    const totalW = count * L.btn + (count - 1) * gap;
    const startX = L.w / 2 - totalW / 2 + L.btn / 2;
    const careY = L.h - L.pad - L.btn / 2;
    CARE_ACTIONS.forEach((action, i) => {
      this.careButtons[action] = makeButton(this, startX + i * (L.btn + gap), careY, {
        icon: CARE_INFO[action].icon,
        label: CARE_INFO[action].label,
        size: L.btn,
        color: COLORS[action],
        settings: save.settings,
        disabled: !kaiju,
        onTap: () => this.care(action),
      });
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

    this.updateGlow(save);
  }

  private nextStageOf(k: Kaiju): string {
    const i = STAGES.indexOf(k.growth.stage);
    return STAGES[Math.min(i + 1, STAGES.length - 1)] ?? 'guardian';
  }

  /** Priority: hatch > repair > alarm > neediest care. Only one glows. */
  private updateGlow(save: MemberSave) {
    for (const b of Object.values(this.careButtons)) b?.setGlow(false);
    this.alarmBtn.setGlow(false);
    this.buildBtn.setGlow(false);
    const egg = save.eggs[0];
    const kaiju = save.kaiju[this.selected];
    if (egg && eggReady(egg)) return; // egg wobbles and glows itself
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
    const result = applyCare(kaiju, action);
    const next = store.update((s) => ({ ...s, kaiju: s.kaiju.map((k, i) => (i === this.selected ? result.kaiju : k)) }));

    const info = CARE_INFO[action];
    this.careBars[action]?.setValue(result.kaiju.care[info.bar]);
    this.growthBar.setValue(Math.round(growthProgress(result.kaiju.growth) * 100));
    ({ feed: () => sfx.chomp(), wash: () => sfx.splash(), play: () => sfx.boing(), sleep: () => sfx.snore() })[action]();
    floatText(this, this.kaijuPos.x, this.kaijuPos.y - 90, result.barGain > 0 ? `+${result.barGain}` : '+1', result.barGain > 0 ? '#a5d6a7' : '#ffffff', save.settings);

    // Little reaction: a squash.
    if (!save.settings.reduceMotion) {
      this.tweens.add({ targets: this.kaijuGfx, scaleY: 0.92, scaleX: 1.06, duration: 120, yoyo: true });
    }

    if (result.grewTo) {
      this.busy = true;
      sfx.grow();
      burst(this, this.kaijuPos.x, this.kaijuPos.y, COLORS.star, save.settings, 30);
      this.time.delayedCall(900, () => {
        this.busy = false;
        this.scene.restart({ selected: this.selected });
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
    const kaiju: Kaiju = {
      id: `k_${egg.seed.toString(36)}`,
      name: '',
      genome,
      care: newCareState(),
      growth: newGrowth('hatchling'),
      createdAt: Date.now(),
    };
    store.update((s) => ({
      ...s,
      kaiju: [...s.kaiju, kaiju],
      eggs: s.eggs.filter((e) => e.id !== egg.id),
      dex: recordInDex(s.dex, genome),
    }));
    sfx.sparkle();
    if (this.eggBtn) burst(this, this.eggBtn.x, this.eggBtn.y, COLORS.star, save.settings, 40);
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
    const x = Math.min(L.w - w - L.pad, Math.max(L.pad, this.kaijuPos.x - w / 2));
    const y = Math.max(L.pad, this.kaijuPos.y - h - 120);
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
    this.statsPanel = c;
    sfx.tap();
  }
}
