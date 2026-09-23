import Phaser from 'phaser';
import * as core from '@monzilla/core';
import { registerSW } from 'virtual:pwa-register';
import { connectFirebase } from './game/firebase.js';
import { openStore } from './game/store.js';
import { sfx } from './game/audio.js';
import { COLORS } from './game/ui.js';
import { drawKaiju } from './render/kaiju.js';
import { createKaiju } from './render/kaijuSprite.js';
import { BootScene } from './scenes/BootScene.js';
import { IslandScene } from './scenes/IslandScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { DexScene } from './scenes/DexScene.js';
import { SettingsScene } from './scenes/SettingsScene.js';

registerSW({ immediate: true });

async function start() {
  // Firebase is optional and can be slow on a bad connection: give it a few
  // seconds, then start local and let it catch up on the next launch.
  const session = await Promise.race([
    connectFirebase().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
  ]);
  const store = await openStore(session?.backend ?? null);
  sfx.bind(store.save.settings);
  store.subscribe((s) => sfx.bind(s.settings));

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: COLORS.bg,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: '100%',
      height: '100%',
    },
    input: { activePointers: 2 },
    render: { antialias: true, roundPixels: false },
    scene: [BootScene, IslandScene, BattleScene, DexScene, SettingsScene],
  });
  game.registry.set('store', store);
  game.registry.set('session', session);
  // Handy in the browser console and for automated checks.
  const w = window as unknown as { monzilla: Phaser.Game; monzillaCore: unknown };
  w.monzilla = game;
  w.monzillaCore = { ...core, drawKaiju, createKaiju };
}

void start();
