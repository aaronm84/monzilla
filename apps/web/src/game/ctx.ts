import type Phaser from 'phaser';
import type { GameStore } from './store.js';
import type { FirebaseSession } from './firebase.js';

/** Typed access to the objects main.ts puts in the Phaser registry. */
export function getStore(scene: Phaser.Scene): GameStore {
  return scene.registry.get('store') as GameStore;
}

export function getSession(scene: Phaser.Scene): FirebaseSession | null {
  return (scene.registry.get('session') as FirebaseSession | null) ?? null;
}

export function setSession(scene: Phaser.Scene, session: FirebaseSession | null) {
  scene.registry.set('session', session);
}
