import Phaser from 'phaser';
import {
  BLOCK_INFO,
  BLOCK_KINDS,
  blockKey,
  brokenBlocks,
  generateIsland,
  isLand,
  placeBlock,
  removeBlock,
  repairBlock,
  type BlockKind,
} from '@monzilla/core';
import { getStore } from '../game/ctx.js';
import { sfx } from '../game/audio.js';
import { COLORS, burst, floatText, handleResize, label, layoutFor, makeButton, panel, type Button } from '../game/ui.js';
import { drawBlocks, drawIslandTiles, fitIsland } from '../render/island.js';

type Tool = BlockKind | 'erase';

/**
 * Snap-to-grid building on the generated island. Tap a tile to place the
 * selected block, tap a cracked block to repair it. On a phone the grid is
 * still usable but the palette is smaller.
 */
export class BuildScene extends Phaser.Scene {
  private tool: Tool = 'stone';
  private toolButtons: Partial<Record<Tool, Button>> = {};
  private blocksGfx!: Phaser.GameObjects.Graphics;
  private repairText!: Phaser.GameObjects.Text;

  constructor() {
    super('Build');
  }

  create() {
    handleResize(this);
    const store = getStore(this);
    const save = store.save;
    const L = layoutFor(this);
    const island = generateIsland(save.seed);

    const paletteSize = L.compact ? 56 : 72;
    const paletteRows = L.portrait ? 2 : 1;
    const paletteH = paletteRows * (paletteSize + 12) + L.pad * 2;
    const topH = L.btn * 0.8 + L.pad * 2;
    const view = fitIsland(island, L.pad, topH, L.w - L.pad * 2, L.h - topH - paletteH);

    const tiles = this.add.graphics();
    drawIslandTiles(tiles, island, view, true);
    this.blocksGfx = this.add.graphics();
    drawBlocks(this.blocksGfx, save.blocks, view);

    // Tap handling on the grid
    const zone = this.add.zone(view.ox, view.oy, view.tile * island.width, view.tile * island.height).setOrigin(0).setInteractive();
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      sfx.unlock();
      const t = view.pixelToTile(p.x, p.y);
      if (!t) return;
      const s = store.save;
      const existing = s.blocks[blockKey(t.x, t.y)];
      const px = view.tileToPixel(t.x, t.y);
      if (existing?.broken) {
        store.update((st) => ({ ...st, blocks: repairBlock(st.blocks, t.x, t.y) }));
        sfx.repair();
        burst(this, px.x, px.y, 0xa5d6a7, s.settings, 10);
        this.refresh(view);
        return;
      }
      if (this.tool === 'erase') {
        if (existing) {
          store.update((st) => ({ ...st, blocks: removeBlock(st.blocks, t.x, t.y) }));
          sfx.crunch();
          this.refresh(view);
        }
        return;
      }
      if (!isLand(island, t.x, t.y)) {
        floatText(this, px.x, px.y, '🌊', '#ffffff', s.settings, 28);
        return;
      }
      store.update((st) => ({ ...st, blocks: placeBlock(st.blocks, island, t.x, t.y, this.tool as BlockKind) }));
      sfx.place();
      this.refresh(view);
    });

    // Top bar
    panel(this, L.pad, L.pad, L.w - L.pad * 2, L.btn * 0.8 + L.pad, COLORS.panel, 0.94);
    const topY = L.pad + (L.btn * 0.8 + L.pad) / 2;
    makeButton(this, L.pad * 2 + L.btn * 0.4, topY, {
      icon: '🏠', label: 'Back home', size: L.btn * 0.8, settings: save.settings, onTap: () => this.scene.start('Island'),
    });
    this.repairText = label(this, L.w / 2, topY, '', 26);
    this.updateRepairText();

    // Palette
    const tools: Tool[] = [...BLOCK_KINDS, 'erase'];
    const perRow = Math.ceil(tools.length / paletteRows);
    const gap = 12;
    const rowW = perRow * paletteSize + (perRow - 1) * gap;
    tools.forEach((tool, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const x = L.w / 2 - rowW / 2 + paletteSize / 2 + col * (paletteSize + gap);
      const y = L.h - L.pad - paletteSize / 2 - (paletteRows - 1 - row) * (paletteSize + 12);
      const info = tool === 'erase' ? { icon: '🧽', label: 'Eraser' } : BLOCK_INFO[tool];
      this.toolButtons[tool] = makeButton(this, x, y, {
        icon: info.icon, label: info.label, size: paletteSize, settings: save.settings,
        onTap: () => this.selectTool(tool),
      });
    });
    this.selectTool(this.tool);
  }

  private selectTool(tool: Tool) {
    this.tool = tool;
    for (const [k, b] of Object.entries(this.toolButtons)) b?.setGlow(k === tool);
  }

  private refresh(view: ReturnType<typeof fitIsland>) {
    this.blocksGfx.clear();
    drawBlocks(this.blocksGfx, getStore(this).save.blocks, view);
    this.updateRepairText();
  }

  private updateRepairText() {
    const n = brokenBlocks(getStore(this).save.blocks).length;
    this.repairText.setText(n > 0 ? `🔨 ${n}` : '🧱 ' + Object.keys(getStore(this).save.blocks).length);
  }
}
