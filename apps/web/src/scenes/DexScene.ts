import Phaser from 'phaser';
import { TYPE_INFO, dexPages, dexProgress, type Alignment } from '@monzilla/core';
import { getStore } from '../game/ctx.js';
import { COLORS, FONT, handleResize, label, layoutFor, makeBar, makeButton, panel } from '../game/ui.js';
import { drawKaiju, drawSilhouette } from '../render/kaiju.js';

/**
 * The collection book. Two tabs (guardians, villains), a progress bar with
 * the count, and a grid of cards. Undiscovered species are silhouettes.
 * Drag to scroll.
 */
export class DexScene extends Phaser.Scene {
  private tab: Alignment = 'guardian';

  constructor() {
    super('Dex');
  }

  init(data: { tab?: Alignment }) {
    if (data.tab) this.tab = data.tab;
  }

  create() {
    handleResize(this);
    const save = getStore(this).save;
    const L = layoutFor(this);

    const topH = L.btn * 0.8 + L.pad;
    panel(this, L.pad, L.pad, L.w - L.pad * 2, topH, COLORS.panel, 0.9).setScrollFactor(0).setDepth(10);
    const topY = L.pad + topH / 2;
    makeButton(this, L.pad * 2 + L.btn * 0.4, topY, {
      icon: '🏠', label: 'Back home', size: L.btn * 0.8, settings: save.settings, onTap: () => this.scene.start('Island'),
    }).setScrollFactor(0).setDepth(11);

    const progress = dexProgress(save.dex);
    const barX = L.pad * 2 + L.btn * 0.9 + 10;
    const tabsW = L.btn * 0.8 * 2 + 12;
    makeBar(this, barX, topY - 14, L.w - barX - L.pad * 2 - tabsW - 12, 28, {
      icon: '📖', color: COLORS.star, value: progress.have, max: progress.total, settings: save.settings,
    }).setScrollFactor(0).setDepth(11);
    label(this, barX + 60 + (L.w - barX - L.pad * 2 - tabsW - 12 - 60) / 2, topY + 26, `${progress.have} / ${progress.total}`, 16, COLORS.muted)
      .setScrollFactor(0)
      .setDepth(11);

    const tabX = L.w - L.pad * 2 - tabsW + L.btn * 0.4;
    const g = makeButton(this, tabX, topY, {
      icon: '🦖', label: 'Guardians', size: L.btn * 0.8, settings: save.settings, onTap: () => this.scene.restart({ tab: 'guardian' }),
    }).setScrollFactor(0).setDepth(11);
    const v = makeButton(this, tabX + L.btn * 0.8 + 12, topY, {
      icon: '👿', label: 'Bad guys', size: L.btn * 0.8, color: 0x4a148c, settings: save.settings, onTap: () => this.scene.restart({ tab: 'villain' }),
    }).setScrollFactor(0).setDepth(11);
    g.setGlow(this.tab === 'guardian');
    v.setGlow(this.tab === 'villain');

    // Cards
    const pages = dexPages(save.dex).filter((p) => p.key.startsWith(this.tab));
    const cardW = L.compact ? 150 : 190;
    const cardH = cardW * 1.2;
    const gap = 14;
    const cols = Math.max(2, Math.floor((L.w - L.pad * 2 + gap) / (cardW + gap)));
    const gridW = cols * cardW + (cols - 1) * gap;
    const startX = L.w / 2 - gridW / 2;
    const startY = L.pad * 2 + topH;

    pages.forEach((page, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gap);
      const y = startY + row * (cardH + gap);
      const [, type] = page.key.split(':') as [string, keyof typeof TYPE_INFO, string];
      panel(this, x, y, cardW, cardH, page.entry ? COLORS.panelLight : COLORS.panel, 0.9);
      const gfx = this.add.graphics();
      const cx = x + cardW / 2;
      const cy = y + cardH * 0.5;
      const scale = (cardW / 190) * 0.55;
      if (page.entry) {
        const genome = { ...page.entry.genome, size: 1.0 };
        drawKaiju(gfx, genome, cx, cy, scale);
        this.add.text(x + 10, y + 8, TYPE_INFO[type].icon, { fontSize: '26px', fontFamily: FONT });
        this.add
          .text(x + cardW - 10, y + 8, `×${page.entry.count}`, { fontSize: '20px', fontFamily: FONT, color: COLORS.text, fontStyle: 'bold' })
          .setOrigin(1, 0);
        if (page.entry.genome.shiny) this.add.text(cx, y + cardH - 30, '✨', { fontSize: '22px', fontFamily: FONT }).setOrigin(0.5);
      } else {
        // A silhouette of a representative genome for the species.
        const body = page.key.split(':')[2] as 'round' | 'tall' | 'long' | 'wide';
        drawSilhouette(
          gfx,
          {
            seed: 0,
            type,
            alignment: this.tab,
            parts: { body, heads: 1, wings: 'none', tail: 'stub', horns: 0, spikes: 2 },
            size: 1.0,
            palette: { primary: '#000', secondary: '#000', accent: '#000', glow: '#000' },
            shiny: false,
          },
          cx,
          cy,
          scale,
        );
        this.add.text(x + 10, y + 8, TYPE_INFO[type].icon, { fontSize: '26px', fontFamily: FONT }).setAlpha(0.5);
        this.add.text(cx, y + cardH - 30, '❓', { fontSize: '22px', fontFamily: FONT }).setOrigin(0.5);
      }
    });

    // Drag to scroll
    const rows = Math.ceil(pages.length / cols);
    const contentH = startY + rows * (cardH + gap) + L.pad;
    const maxScroll = Math.max(0, contentH - L.h);
    const cam = this.cameras.main;
    let dragging = false;
    let lastY = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      dragging = true;
      lastY = p.y;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!dragging) return;
      cam.scrollY = Phaser.Math.Clamp(cam.scrollY - (p.y - lastY), 0, maxScroll);
      lastY = p.y;
    });
    this.input.on('pointerup', () => (dragging = false));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      cam.scrollY = Phaser.Math.Clamp(cam.scrollY + dy, 0, maxScroll);
    });
  }
}
