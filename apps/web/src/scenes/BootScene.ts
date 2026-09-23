import Phaser from 'phaser';
import { FONT, COLORS } from '../game/ui.js';
import { PARTS_KEY, PartLibrary, type KindManifest } from '../render/parts.js';

/**
 * Loads whatever sprite parts exist under public/parts (see
 * docs/SPRITES.md), then starts the island. Kinds without art keep the
 * vector renderer, so an empty or missing index is fine.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.setBaseURL(import.meta.env.BASE_URL);
    this.load.json('parts-index', 'parts/index.json');
  }

  create() {
    const { width, height } = this.scale;
    const t = this.add
      .text(width / 2, height / 2, '🦖', { fontSize: '96px', fontFamily: FONT, color: COLORS.text })
      .setOrigin(0.5);
    this.tweens.add({ targets: t, scale: 1.1, duration: 300, yoyo: true, repeat: -1 });

    const lib = new PartLibrary();
    this.registry.set(PARTS_KEY, lib);
    // parts/index.json lists kinds with real art. `?parts=lizard,robot` in
    // the URL overrides it, which is how placeholder sets are previewed
    // without shipping them to the live game.
    const override = new URLSearchParams(location.search).get('parts');
    const index = override !== null
      ? override.split(',').map((k) => k.trim()).filter(Boolean)
      : ((this.cache.json.get('parts-index') as string[] | undefined) ?? []);
    if (index.length === 0) return this.scene.start('Island');

    for (const kind of index) {
      this.load.json(`parts-${kind}`, `parts/${kind}.json`);
    }
    this.load.once('complete', () => {
      // Manifests are in; now the atlases they name.
      for (const kind of index) {
        const m = this.cache.json.get(`parts-${kind}`) as KindManifest | undefined;
        if (!m) continue;
        lib.add(m);
        this.load.atlas(m.atlas, `parts/${m.atlas}.png`, `parts/${m.atlas}.atlas.json`);
      }
      this.load.once('complete', () => this.scene.start('Island'));
      this.load.start();
    });
    this.load.start();
  }
}
