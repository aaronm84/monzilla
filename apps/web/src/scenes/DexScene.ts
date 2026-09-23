import Phaser from 'phaser';
import { KIND_INFO, TYPE_INFO, dexPages, dexProgress, genomeFromSeed, hashString, type Kind, type KaijuType } from '@monzilla/core';
import { getStore } from '../game/ctx.js';
import { COLORS, FONT, handleResize, label, layoutFor, makeBar, makeButton, panel } from '../game/ui.js';
import { drawKaiju, drawSilhouette } from '../render/kaiju.js';

/**
 * The collection book: one card per species (kind x type), a progress bar
 * with the count, and badges on each card for whether he has met the
 * guardian, the villain, or both. Undiscovered species are silhouettes.
 * Drag to scroll.
 */
export class DexScene extends Phaser.Scene {
  constructor() {
    super('Dex');
  }

  create() {
    handleResize(this);
    const save = getStore(this).save;
    const L = layoutFor(this);

    const topH = L.btn * 0.8 + L.pad;
    panel(this, L.pad, L.pad, L.w - L.pad * 2, topH, COLORS.panel, 0.95).setScrollFactor(0).setDepth(10);
    const topY = L.pad + topH / 2;
    makeButton(this, L.pad * 2 + L.btn * 0.4, topY, {
      icon: '🏠', label: 'Back home', size: L.btn * 0.8, settings: save.settings, onTap: () => this.scene.start('Island'),
    }).setScrollFactor(0).setDepth(11);

    const progress = dexProgress(save.dex);
    const barX = L.pad * 2 + L.btn * 0.9 + 10;
    const barW = L.w - barX - L.pad * 2;
    makeBar(this, barX, topY - 14, barW, 28, {
      icon: '📖', color: COLORS.star, value: progress.have, max: progress.total, settings: save.settings,
    }).setScrollFactor(0).setDepth(11);
    label(this, barX + 40 + (barW - 40) / 2, topY + 26, `${progress.have} / ${progress.total}`, 16, COLORS.muted)
      .setScrollFactor(0)
      .setDepth(11);

    // Cards, grouped by kind: one row label per kind, then its seven types.
    const pages = dexPages(save.dex);
    const cardW = L.compact ? 104 : 150;
    const cardH = cardW * 1.2;
    const gap = 10;
    const cols = Math.max(2, Math.min(7, Math.floor((L.w - L.pad * 2 + gap) / (cardW + gap))));
    const gridW = cols * cardW + (cols - 1) * gap;
    const startX = L.w / 2 - gridW / 2;
    let y = L.pad * 2 + topH;

    const kinds = [...new Set(pages.map((p) => p.key.split(':')[0] as Kind))];
    for (const kind of kinds) {
      const kindPages = pages.filter((p) => p.key.startsWith(`${kind}:`));
      const have = kindPages.filter((p) => p.entry).length;
      this.add
        .text(startX, y, `${KIND_INFO[kind].icon} ${KIND_INFO[kind].label}   ${have}/${kindPages.length}`, {
          fontSize: `${L.compact ? 18 : 22}px`, fontFamily: FONT, color: COLORS.text, fontStyle: 'bold',
        })
        .setOrigin(0, 0);
      y += L.compact ? 30 : 36;

      kindPages.forEach((page, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (cardW + gap);
        const cy0 = y + row * (cardH + gap);
        const type = page.key.split(':')[1] as KaijuType;
        panel(this, x, cy0, cardW, cardH, page.entry ? COLORS.panelLight : COLORS.panel, 0.9);
        const gfx = this.add.graphics();
        const cx = x + cardW / 2;
        const cy = cy0 + cardH * 0.5;
        const scale = (cardW / 190) * 0.55;
        const iconSize = L.compact ? 18 : 24;
        if (page.entry) {
          drawKaiju(gfx, { ...page.entry.genome, size: 1.0 }, cx, cy, scale);
          this.add.text(x + 8, cy0 + 6, TYPE_INFO[type].icon, { fontSize: `${iconSize}px`, fontFamily: FONT });
          this.add
            .text(x + cardW - 8, cy0 + 6, `×${page.entry.count}`, { fontSize: `${iconSize * 0.8}px`, fontFamily: FONT, color: COLORS.text, fontStyle: 'bold' })
            .setOrigin(1, 0);
          // Alignment badges: met as a guardian, as a villain, or both.
          const badges = `${page.entry.seenGuardian ? '🦖' : '▫️'} ${page.entry.seenVillain ? '👿' : '▫️'}`;
          this.add.text(cx, cy0 + cardH - iconSize * 0.9, badges, { fontSize: `${iconSize * 0.8}px`, fontFamily: FONT }).setOrigin(0.5);
          if (page.entry.genome.shiny) this.add.text(x + cardW - 8, cy0 + cardH - iconSize * 0.9, '✨', { fontSize: `${iconSize * 0.8}px`, fontFamily: FONT }).setOrigin(1, 0.5);
        } else {
          // A representative silhouette for the species, always the same one.
          const rep = genomeFromSeed(hashString(page.key), { alignment: 'guardian', kind, type });
          drawSilhouette(gfx, { ...rep, size: 1.0 }, cx, cy, scale);
          this.add.text(x + 8, cy0 + 6, TYPE_INFO[type].icon, { fontSize: `${iconSize}px`, fontFamily: FONT }).setAlpha(0.5);
          this.add.text(cx, cy0 + cardH - iconSize * 0.9, '❓', { fontSize: `${iconSize * 0.8}px`, fontFamily: FONT }).setOrigin(0.5);
        }
      });
      y += Math.ceil(kindPages.length / cols) * (cardH + gap) + gap;
    }

    // Drag or wheel to scroll
    const maxScroll = Math.max(0, y + L.pad - L.h);
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
