import Phaser from 'phaser';
import { sfx } from './audio.js';
import { speak } from './speech.js';
import type { Settings } from '@monzilla/core';

/**
 * The concept art's chrome: cream panels, deep blue text, bright gem
 * buttons, on a sky background. Battles darken to dusk but stay soft.
 */
export const COLORS = {
  bg: 0xbfe6f7,
  panel: 0xfff8ec,
  panelLight: 0xffffff,
  header: 0x1f4e9c,
  button: 0x4a90e2,
  text: '#1f3a68',
  muted: '#5b7396',
  good: 0x4fc3f7,
  bad: 0x9c27b0,
  star: 0xffc83d,
  /** Care buttons match the concept boards: red, blue, yellow, purple. */
  feed: 0xe85d4a,
  wash: 0x4aa3e8,
  play: 0xf5b73a,
  sleep: 0x7b5cd6,
  alarm: 0x8e24aa,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export interface Layout {
  w: number;
  h: number;
  /** true on phones held upright: stack things vertically, bigger buttons. */
  portrait: boolean;
  /** true on small screens (phone) regardless of orientation */
  compact: boolean;
  /** Safe padding for notches/home indicator. */
  pad: number;
  /** Base button size */
  btn: number;
}

export function layoutFor(scene: Phaser.Scene): Layout {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const portrait = h > w;
  const compact = Math.min(w, h) < 600;
  return { w, h, portrait, compact, pad: compact ? 14 : 24, btn: compact ? 72 : 88 };
}

/** Restart the scene when the window changes size or orientation. */
export function handleResize(scene: Phaser.Scene) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const onResize = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => scene.scene.restart(), 150);
  };
  scene.scale.on('resize', onResize);
  scene.events.once('shutdown', () => scene.scale.off('resize', onResize));
}

export interface ButtonOptions {
  icon: string;
  label: string;
  size?: number;
  color?: number;
  /** A small number/text under the icon (e.g., damage) */
  sub?: string;
  settings?: Settings;
  onTap: () => void;
  disabled?: boolean;
}

export interface Button extends Phaser.GameObjects.Container {
  setGlow(on: boolean): void;
  setSub(text: string): void;
  setDisabledState(disabled: boolean): void;
}

/**
 * The one button style for the whole game: a big rounded tile with an
 * emoji. Tap runs the action. Hold speaks the label. Glow marks the
 * "next thing".
 */
export function makeButton(scene: Phaser.Scene, x: number, y: number, opts: ButtonOptions): Button {
  const size = opts.size ?? 88;
  const color = opts.color ?? COLORS.button;
  const container = scene.add.container(x, y) as Button;

  const glow = scene.add.graphics();
  glow.fillStyle(COLORS.star, 0.7);
  glow.fillRoundedRect(-size / 2 - 9, -size / 2 - 9, size + 18, size + 18, size * 0.3);
  glow.setVisible(false);

  const bg = scene.add.graphics();
  const drawBg = (c: number, alpha = 1) => {
    bg.clear();
    const r = size * 0.24;
    bg.fillStyle(0x1f3a68, 0.18 * alpha);
    bg.fillRoundedRect(-size / 2 + 2, -size / 2 + 6, size, size, r);
    bg.fillStyle(Phaser.Display.Color.IntegerToColor(c).darken(18).color, alpha);
    bg.fillRoundedRect(-size / 2, -size / 2, size, size, r);
    bg.fillStyle(c, alpha);
    bg.fillRoundedRect(-size / 2 + 3, -size / 2 + 3, size - 6, size * 0.62, r * 0.85);
    bg.fillStyle(0xffffff, 0.22 * alpha);
    bg.fillRoundedRect(-size / 2 + 8, -size / 2 + 6, size - 16, size * 0.22, r * 0.5);
    bg.lineStyle(3, 0xffffff, 0.85 * alpha);
    bg.strokeRoundedRect(-size / 2, -size / 2, size, size, r);
  };
  drawBg(color);

  const icon = scene.add
    .text(0, opts.sub ? -size * 0.1 : 0, opts.icon, { fontSize: `${Math.round(size * 0.5)}px`, fontFamily: FONT })
    .setOrigin(0.5);
  const sub = scene.add
    .text(0, size * 0.3, opts.sub ?? '', {
      fontSize: `${Math.round(size * 0.22)}px`,
      fontFamily: FONT,
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#1f3a68',
      strokeThickness: 3,
    })
    .setOrigin(0.5);

  container.add([glow, bg, icon, sub]);
  // A container with a size has a centred display origin, and Phaser adds
  // that origin to the local point before testing the hit area, so the hit
  // rectangle must start at (0, 0), not (-size / 2, -size / 2).
  container.setSize(size, size);
  container.setInteractive(new Phaser.Geom.Rectangle(0, 0, size, size), Phaser.Geom.Rectangle.Contains);

  let disabled = opts.disabled ?? false;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let spoke = false;

  container.on('pointerdown', () => {
    if (disabled) return;
    sfx.unlock();
    spoke = false;
    container.setScale(0.93);
    holdTimer = setTimeout(() => {
      spoke = true;
      speak(opts.label, opts.settings?.speakLabels ?? true);
    }, 550);
  });
  const release = (fire: boolean) => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    container.setScale(1);
    if (fire && !disabled && !spoke) {
      sfx.tap();
      opts.onTap();
    }
  };
  container.on('pointerup', () => release(true));
  container.on('pointerout', () => release(false));

  let glowTween: Phaser.Tweens.Tween | null = null;
  container.setGlow = (on: boolean) => {
    glow.setVisible(on);
    if (glowTween) {
      glowTween.stop();
      glowTween = null;
      glow.setAlpha(1);
    }
    if (on && !(opts.settings?.reduceMotion ?? false)) {
      glowTween = scene.tweens.add({ targets: glow, alpha: { from: 1, to: 0.35 }, duration: 700, yoyo: true, repeat: -1 });
    }
  };
  container.setSub = (text: string) => sub.setText(text);
  container.setDisabledState = (d: boolean) => {
    disabled = d;
    drawBg(color, d ? 0.35 : 1);
    icon.setAlpha(d ? 0.4 : 1);
  };
  if (disabled) container.setDisabledState(true);
  return container;
}

export interface Bar extends Phaser.GameObjects.Container {
  setValue(value: number, max?: number): void;
}

/**
 * A labelled bar with the number on it. The kid reads numbers and bars
 * fluently, so this is the main way state is shown.
 */
export function makeBar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: { icon?: string; color: number; value: number; max?: number; showNumber?: boolean; settings?: Settings },
): Bar {
  const container = scene.add.container(x, y) as Bar;
  const g = scene.add.graphics();
  const iconW = opts.icon ? height * 1.3 : 0;
  const icon = opts.icon
    ? scene.add.text(0, height / 2, opts.icon, { fontSize: `${Math.round(height * 0.9)}px`, fontFamily: FONT }).setOrigin(0, 0.5)
    : null;
  const num = scene.add
    .text(iconW + (width - iconW) / 2, height / 2, '', {
      fontSize: `${Math.round(height * 0.7)}px`,
      fontFamily: FONT,
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#1f3a68',
      strokeThickness: 4,
    })
    .setOrigin(0.5);
  container.add(g);
  if (icon) container.add(icon);
  container.add(num);

  let current = opts.value;
  let max = opts.max ?? 100;
  const draw = () => {
    g.clear();
    const bx = iconW;
    const bw = width - iconW;
    g.fillStyle(0x1f3a68, 0.14);
    g.fillRoundedRect(bx, 0, bw, height, height / 2);
    const ratio = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
    if (ratio > 0) {
      g.fillStyle(opts.color, 1);
      g.fillRoundedRect(bx, 0, Math.max(height, bw * ratio), height, height / 2);
      g.fillStyle(0xffffff, 0.25);
      g.fillRoundedRect(bx + 4, 3, Math.max(height, bw * ratio) - 8, height * 0.35, height * 0.2);
    }
    g.lineStyle(2, 0xffffff, 0.9);
    g.strokeRoundedRect(bx, 0, bw, height, height / 2);
    num.setText(opts.showNumber === false ? '' : `${Math.round(current)}`);
  };
  draw();

  container.setValue = (value: number, newMax?: number) => {
    if (newMax !== undefined) max = newMax;
    const from = current;
    if (opts.settings?.reduceMotion || Math.abs(value - from) < 0.5) {
      current = value;
      draw();
      return;
    }
    const proxy = { v: from };
    scene.tweens.add({
      targets: proxy,
      v: value,
      duration: 350,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        current = proxy.v;
        draw();
      },
      onComplete: () => {
        current = value;
        draw();
      },
    });
  };
  return container;
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color = COLORS.panel, alpha = 0.96) {
  const g = scene.add.graphics();
  g.fillStyle(0x1f3a68, 0.14 * alpha);
  g.fillRoundedRect(x + 2, y + 6, w, h, 22);
  g.fillStyle(color, alpha);
  g.fillRoundedRect(x, y, w, h, 22);
  g.lineStyle(3, 0xffffff, 0.9 * alpha);
  g.strokeRoundedRect(x, y, w, h, 22);
  g.lineStyle(2, 0x9cc3e8, 0.6 * alpha);
  g.strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, 24);
  return g;
}

export function label(scene: Phaser.Scene, x: number, y: number, text: string, size = 24, color = COLORS.text) {
  return scene.add.text(x, y, text, { fontSize: `${size}px`, fontFamily: FONT, color, fontStyle: 'bold' }).setOrigin(0.5);
}

/** Floating text that rises and fades, e.g. "+25" or "-12". */
export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color = '#ffffff', settings?: Settings, size = 36) {
  const t = scene.add
    .text(x, y, text, { fontSize: `${size}px`, fontFamily: FONT, color, fontStyle: 'bold', stroke: '#1f3a68', strokeThickness: 5 })
    .setOrigin(0.5)
    .setDepth(1000);
  if (settings?.reduceMotion) {
    scene.time.delayedCall(700, () => t.destroy());
    return;
  }
  scene.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
}

/** Confetti-ish burst of little squares. Skipped when reduce motion is on. */
export function burst(scene: Phaser.Scene, x: number, y: number, color: number, settings?: Settings, count = 18) {
  if (settings?.reduceMotion) return;
  for (let i = 0; i < count; i++) {
    const r = scene.add.rectangle(x, y, 10, 10, color).setDepth(999);
    const a = Math.random() * Math.PI * 2;
    const d = 60 + Math.random() * 90;
    scene.tweens.add({
      targets: r,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d + 40,
      angle: Math.random() * 360,
      alpha: 0,
      duration: 700 + Math.random() * 300,
      ease: 'Cubic.easeOut',
      onComplete: () => r.destroy(),
    });
  }
}

/** Gentle idle bob for a creature. */
export function bob(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject & { y: number }, settings?: Settings, amount = 6) {
  if (settings?.reduceMotion) return null;
  return scene.tweens.add({ targets: target, y: target.y - amount, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
}
