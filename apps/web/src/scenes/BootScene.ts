import Phaser from 'phaser';
import { FONT, COLORS } from '../game/ui.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    const { width, height } = this.scale;
    const t = this.add
      .text(width / 2, height / 2, '🦖', { fontSize: '96px', fontFamily: FONT, color: COLORS.text })
      .setOrigin(0.5);
    this.tweens.add({ targets: t, scale: 1.1, duration: 300, yoyo: true, onComplete: () => this.scene.start('Island') });
  }
}
