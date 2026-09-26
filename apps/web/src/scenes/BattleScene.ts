import Phaser from 'phaser';
import {
  ABILITY_INFO,
  GOAL_INFO,
  KIND_INFO,
  ORIGIN_INFO,
  Rng,
  TYPE_INFO,
  WEATHER_INFO,
  addCard,
  addFragment,
  bumpDay,
  eggReady,
  advanceInvasion,
  afterBattle,
  attack,
  computeDamage,
  dayIndex,
  findStructures,
  forkSeed,
  generateIsland,
  invasionStepsLeft,
  movesFor,
  rewardFor,
  structureEffects,
  weatherFor,
  type Battle,
  type Kaiju,
  type Move,
} from '@monzilla/core';
import { ensureTodaysBattle } from '../game/villainDay.js';
import { getStore } from '../game/ctx.js';
import { sfx } from '../game/audio.js';
import { COLORS, FONT, burst, floatText, handleResize, label, layoutFor, makeBar, makeButton, panel, type Bar, type Button } from '../game/ui.js';
import { drawEgg } from '../render/kaiju.js';
import { createKaiju, kaijuAnchor } from '../render/kaijuSprite.js';
import { attachMotion, presetFor, type Motion } from '../render/motion.js';
import { getParts } from '../render/parts.js';

/**
 * One villain, one guardian, two or three big buttons. The villain's bar
 * and the damage numbers on the buttons are the whole interface: he can
 * work out the type chart by watching which number is bigger.
 */
export class BattleScene extends Phaser.Scene {
  private battle!: Battle;
  private guardianIndex = 0;
  private villainGfx!: Phaser.GameObjects.Container;
  private guardianGfx!: Phaser.GameObjects.Container;
  private villainMotion!: Motion;
  private guardianMotion!: Motion;
  private hpBar!: Bar;
  private moveButtons: Button[] = [];
  private busy = false;
  private villainPos = { x: 0, y: 0 };
  private guardianPos = { x: 0, y: 0 };
  private stepsText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('Battle');
  }

  create() {
    handleResize(this);
    const store = getStore(this);
    const save = store.save;
    const L = layoutFor(this);
    if (save.kaiju.length === 0) return this.scene.start('Island');

    // Resume today's fight (created when the island opened).
    const today = dayIndex();
    const weather = weatherFor(save.seed, today);
    const battle = ensureTodaysBattle(store);
    if (!battle) return this.scene.start('Island');
    this.battle = battle;
    this.guardianIndex = Math.max(0, store.save.kaiju.findIndex((k) => k.id === this.battle.guardianId));
    const guardian = store.save.kaiju[this.guardianIndex]!;
    const villain = this.battle.villain;
    const inv = this.battle.invasion;
    const fog = inv?.ability === 'fog';

    // Backdrop
    const bg = this.add.graphics();
    // Dusk: a soft purple sky over sand, so villains' glow still reads.
    bg.fillGradientStyle(0xd7c4f2, 0xd7c4f2, 0xf3e3c8, 0xf3e3c8, 1, 1, 1, 1);
    bg.fillRect(0, 0, L.w, L.h);

    // Top: home, weather, villain bar with number
    const topH = L.btn * 0.8 + L.pad;
    panel(this, L.pad, L.pad, L.w - L.pad * 2, topH, COLORS.panel, 0.94);
    const topY = L.pad + topH / 2;
    makeButton(this, L.pad * 2 + L.btn * 0.4, topY, {
      icon: '🏠', label: 'Pause and go home', size: L.btn * 0.8, settings: save.settings, onTap: () => this.scene.start('Island'),
    });
    this.add.text(L.pad * 2 + L.btn * 0.9 + 10, topY, WEATHER_INFO[weather].icon, { fontSize: '34px', fontFamily: FONT }).setOrigin(0, 0.5);
    const barX = L.pad * 2 + L.btn * 0.9 + 70;
    const barW = L.w - barX - L.pad * 2;
    this.hpBar = makeBar(this, barX, topY - 16, barW, 32, {
      icon: TYPE_INFO[villain.genome.type].icon,
      color: 0x9c27b0,
      value: this.battle.villainHp,
      max: villain.maxHp,
      settings: save.settings,
    });

    // Arena
    const bottomH = L.btn + L.pad * 2 + (save.kaiju.length > 1 ? L.btn * 0.7 + 12 : 0);
    const arenaTop = L.pad * 2 + topH;
    const arenaH = L.h - arenaTop - bottomH;
    const floorY = arenaTop + arenaH * 0.68;
    const ground = this.add.graphics();
    ground.fillStyle(0xe2c98f, 1);
    ground.fillEllipse(L.w / 2, floorY + 30, L.w * 1.2, arenaH * 0.5);

    const scale = L.compact ? 0.85 : 1.1;
    this.guardianPos = { x: L.w * 0.27, y: floorY };
    this.villainPos = { x: L.w * 0.73, y: floorY - 20 };

    const lib = getParts(this);
    this.villainGfx = createKaiju(this, villain.genome, this.villainPos.x, this.villainPos.y, scale);
    this.villainGfx.setScale(-1, 1); // face the guardian
    this.villainMotion = attachMotion(this, this.villainGfx, presetFor(villain.genome.kind, lib.get(villain.genome.kind)?.motion), save.settings);

    this.guardianGfx = createKaiju(this, guardian.genome, this.guardianPos.x, this.guardianPos.y, scale);
    this.guardianMotion = attachMotion(this, this.guardianGfx, presetFor(guardian.genome.kind, lib.get(guardian.genome.kind)?.motion), save.settings);

    label(this, this.villainPos.x, arenaTop + 20, `${villain.isBoss ? '👑 ' : ''}${KIND_INFO[villain.genome.kind].icon} ${villain.name}`, 22, COLORS.muted);
    // Who it is and what it wants: origin, goal, ability, and steps to the goal.
    if (inv) {
      const island = generateIsland(save.seed);
      const steps = invasionStepsLeft(inv, island, save.blocks);
      const line = `${ORIGIN_INFO[inv.origin].icon}  ${GOAL_INFO[inv.goal].icon} ${inv.arrived ? '😴' : `${steps}👣`}${inv.ability !== 'none' ? `  ${ABILITY_INFO[inv.ability].icon}` : ''}`;
      this.stepsText = label(this, this.villainPos.x, arenaTop + 52, line, 24, COLORS.text);
    }
    if (guardian.name) label(this, this.guardianPos.x, arenaTop + 20, guardian.name, 22, COLORS.muted);

    // Guardian picker (only when there is a choice)
    if (save.kaiju.length > 1) {
      const size = L.btn * 0.7;
      const gap = 12;
      const totalW = save.kaiju.length * size + (save.kaiju.length - 1) * gap;
      const y = L.h - L.pad * 2 - L.btn - size / 2;
      save.kaiju.forEach((k, i) => {
        const b = makeButton(this, L.w / 2 - totalW / 2 + size / 2 + i * (size + gap), y, {
          icon: KIND_INFO[k.genome.kind].icon, label: k.name || `Kaiju ${i + 1}`, size, sub: TYPE_INFO[k.genome.type].icon, settings: save.settings,
          onTap: () => {
            if (this.busy) return;
            this.battle = { ...this.battle, guardianId: k.id };
            store.update((s) => ({ ...s, activeBattle: this.battle }));
            this.scene.restart();
          },
        });
        b.setGlow(i === this.guardianIndex);
      });
    }

    // Move buttons with the damage number they will do right now.
    const moves = movesFor(guardian);
    const gap = L.compact ? 12 : 20;
    const totalW = moves.length * L.btn + (moves.length - 1) * gap;
    const y = L.h - L.pad - L.btn / 2;
    this.moveButtons = moves.map((move, i) => {
      const { damage, effectiveness } = computeDamage(guardian, move, villain, weather);
      const eff = effectiveness >= 2 ? '⬆️' : effectiveness <= 0.5 ? '⬇️' : '';
      return makeButton(this, L.w / 2 - totalW / 2 + L.btn / 2 + i * (L.btn + gap), y, {
        icon: move.icon,
        label: move.label,
        sub: fog ? '?' : `${damage}${eff}`,
        size: L.btn,
        color: effectiveness >= 2 ? 0x43a047 : COLORS.button,
        settings: save.settings,
        disabled: this.battle.status !== 'active',
        onTap: () => this.doMove(move, guardian),
      });
    });
    if (!fog) {
      const best = moves.reduce((a, b) => (computeDamage(guardian, b, villain, weather).damage > computeDamage(guardian, a, villain, weather).damage ? b : a));
      this.moveButtons[moves.indexOf(best)]?.setGlow(true);
    }

    if (this.battle.status === 'won') this.showReward();
  }

  private doMove(move: Move, guardian: Kaiju) {
    if (this.busy || this.battle.status !== 'active') return;
    this.busy = true;
    const store = getStore(this);
    const save = store.save;
    const fx = structureEffects(findStructures(save.blocks));
    // Damage only; the villain's turn is its walk across the island below.
    const result = attack(this.battle, guardian, move, save.blocks, save.memberId, { breakChance: 0, preferred: fx.wallTiles });
    this.battle = result.battle;
    let brokenCount = 0;
    let arrivedNow = false;
    let skipped = false;
    if (this.battle.status === 'active' && this.battle.invasion) {
      const island = generateIsland(save.seed);
      const step = advanceInvasion(this.battle.invasion, island, save.blocks, fx.breakChance, new Rng(forkSeed(save.seed, `inv:${this.battle.id}:${this.battle.turns.length}`)));
      arrivedNow = step.invasion.arrived && !this.battle.invasion.arrived;
      brokenCount = step.broken.length;
      skipped = step.skipped;
      this.battle = { ...this.battle, invasion: step.invasion };
      store.update((s) => ({ ...s, activeBattle: this.battle, blocks: step.blocks }));
      if (this.stepsText) {
        const inv = step.invasion;
        const steps = invasionStepsLeft(inv, island, step.blocks);
        this.stepsText.setText(`${ORIGIN_INFO[inv.origin].icon}  ${GOAL_INFO[inv.goal].icon} ${inv.arrived ? '😴' : `${steps}👣`}${inv.ability !== 'none' ? `  ${ABILITY_INFO[inv.ability].icon}` : ''}`);
      }
    } else {
      store.update((s) => ({ ...s, activeBattle: this.battle }));
    }

    // Guardian lunges, villain flinches, number pops.
    if (move.id === 'roar') sfx.roar();
    else if (move.id === 'stomp') sfx.stomp();
    else sfx.hit(result.turn.effectiveness);
    this.guardianMotion.recoil(-1); // lunge forward
    this.time.delayedCall(140, () => this.villainMotion.shake());
    const color = result.turn.effectiveness >= 2 ? '#7cff9e' : result.turn.effectiveness <= 0.5 ? '#c9d3e0' : '#ffffff';
    const hit = kaijuAnchor(this.villainGfx, 'head');
    floatText(this, hit.x, hit.y - 40, `-${result.turn.damage}`, color, save.settings, result.turn.effectiveness >= 2 ? 48 : 36);
    this.time.delayedCall(200, () => this.hpBar.setValue(this.battle.villainHp));

    if (this.battle.status === 'won') {
      this.time.delayedCall(700, () => this.showReward());
      return;
    }

    // Villain's turn: it walked, stomped, dozed, or reached its goal. Shown, never punished.
    this.time.delayedCall(650, () => {
      if (brokenCount > 0) {
        sfx.crunch();
        this.cameras.main.shake(save.settings.reduceMotion ? 0 : 150, 0.004);
        floatText(this, this.villainPos.x, this.villainPos.y - 100, brokenCount > 1 ? '🧱💥💥' : '🧱💥', '#ffffff', save.settings, 40);
      } else if (arrivedNow) {
        floatText(this, this.villainPos.x, this.villainPos.y - 100, `${GOAL_INFO[this.battle.invasion!.goal].icon}😴`, '#ffffff', save.settings, 40);
      } else if (skipped) {
        floatText(this, this.villainPos.x, this.villainPos.y - 80, '😴', '#ffffff', save.settings, 34);
      } else {
        floatText(this, this.villainPos.x, this.villainPos.y - 80, '👣', '#ffffff', save.settings, 34);
      }
      this.busy = false;
    });
  }

  private showReward() {
    const store = getStore(this);
    const save = store.save;
    const L = layoutFor(this);
    const villain = this.battle.villain;
    const reward = rewardFor(villain);
    for (const b of this.moveButtons) b.setDisabledState(true);

    // Apply once: the battle is cleared from the save here. The drops go
    // straight into the egg, the card box, and the day's log.
    const newCard = (save.cards[reward.cardKey] ?? 0) === 0;
    if (save.activeBattle) {
      store.update((s) =>
        bumpDay(
          {
            ...s,
            activeBattle: null,
            stars: s.stars + reward.stars,
            eggs: addFragment(s.eggs, reward.fragmentType, forkSeed(s.seed, this.battle.id)),
            cards: addCard(s.cards, reward.cardKey),
            kaiju: s.kaiju.map((k) => (k.id === this.battle.guardianId ? afterBattle(k) : k)),
          },
          dayIndex(),
          { beaten: true, stars: reward.stars, fragments: 1, cards: 1 },
        ),
      );
    }
    const egg = store.save.eggs.find((e) => e.type === reward.fragmentType) ?? store.save.eggs[0];

    sfx.sparkle();
    burst(this, this.villainPos.x, this.villainPos.y, 0x9c27b0, save.settings, 30);
    this.villainMotion.stop();
    if (!save.settings.reduceMotion) {
      this.tweens.add({ targets: this.villainGfx, y: -400, alpha: 0, duration: 900, ease: 'Quad.easeIn' });
      this.villainGfx.each((child: Phaser.GameObjects.GameObject) => this.tweens.add({ targets: child, alpha: 0, duration: 900 }));
    } else {
      this.villainGfx.setVisible(false);
    }

    // Three drops, one after another: stars, an egg fragment, the villain's card.
    const w = Math.min(460, L.w - L.pad * 2);
    const h = 300;
    const x = L.w / 2 - w / 2;
    const y = L.h / 2 - h / 2 - 30;
    const c = this.add.container(0, 0).setDepth(600);
    c.add(panel(this, x, y, w, h));
    c.add(label(this, L.w / 2, y + 40, '🏆', 48));
    const dropY = y + 140;
    const slotW = w / 3;
    const drops: Phaser.GameObjects.Container[] = [];

    // Stars
    const starDrop = this.add.container(x + slotW * 0.5, dropY);
    starDrop.add(label(this, 0, 0, '⭐', 44));
    starDrop.add(label(this, 0, 44, `+${reward.stars}`, 24));
    drops.push(starDrop);

    // Egg fragment: the egg with its fill, and how close it is to hatching.
    const eggDrop = this.add.container(x + slotW * 1.5, dropY);
    const eg = this.add.graphics();
    const ratio = egg ? egg.fragments / 3 : 1 / 3;
    drawEgg(eg, 0, -4, 26, TYPE_INFO[reward.fragmentType].color, ratio);
    eggDrop.add(eg);
    eggDrop.add(label(this, 0, 44, egg && eggReady(egg) ? '🐣 !' : `${TYPE_INFO[reward.fragmentType].icon} ${egg?.fragments ?? 1}/3`, 24));
    drops.push(eggDrop);

    // Villain card: a little card with its picture; a sparkle if it is the first.
    const cardDrop = this.add.container(x + slotW * 2.5, dropY);
    const cardW = 78;
    const cardH = 96;
    cardDrop.add(panel(this, -cardW / 2, -cardH / 2 - 6, cardW, cardH, 0x4a148c, 0.95));
    cardDrop.add(createKaiju(this, { ...villain.genome, size: 1.0 }, 0, -4, 0.62, { glow: false }));
    cardDrop.add(label(this, 0, cardH / 2 - 14, `🃏 ×${store.save.cards[reward.cardKey] ?? 1}`, 18, '#ffffff'));
    if (newCard) cardDrop.add(label(this, cardW / 2 - 6, -cardH / 2 - 8, '✨', 24));
    drops.push(cardDrop);

    drops.forEach((d, i) => {
      c.add(d);
      if (save.settings.reduceMotion) return;
      d.setScale(0).setAlpha(0);
      this.time.delayedCall(350 + i * 380, () => {
        sfx.unlock();
        this.tweens.add({ targets: d, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
        if (i === 2 && newCard) burst(this, d.x, d.y, 0xce93d8, save.settings, 16);
      });
    });

    c.add(
      makeButton(this, L.w / 2, y + h - 50, {
        icon: '🏠', label: 'Back home', size: L.btn * 0.8, settings: save.settings, onTap: () => this.scene.start('Island', { afterFight: true }),
      }),
    );
  }
}
