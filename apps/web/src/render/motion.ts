import Phaser from 'phaser';
import type { Kind, Settings } from '@monzilla/core';
import type { MotionPreset } from './parts.js';

/**
 * Procedural animation for assembled creatures. Everything is a transform
 * on the creature container (or a named child), never a frame swap, so
 * one set of parts covers every animation and calm-motion mode just
 * shrinks the amplitudes.
 */
export interface Motion {
  /** One-shot reactions. Each returns when the tween finishes. */
  hop(): void;
  shake(): void;
  recoil(dir?: 1 | -1): void;
  squash(): void;
  stop(): void;
}

const DEFAULT_PRESET: Record<Kind, MotionPreset> = {
  lizard: 'organic',
  dragon: 'organic',
  moth: 'organic',
  turtle: 'organic',
  yeti: 'organic',
  robot: 'rigid',
  crab: 'rigid',
  bird: 'organic',
  blob: 'wobble',
  serpent: 'wobble',
};

export function presetFor(kind: Kind, override?: MotionPreset): MotionPreset {
  return override ?? DEFAULT_PRESET[kind];
}

/**
 * Attach idle motion to a container and return one-shot actions. The
 * container's current x, y, scale are treated as rest values, so callers
 * that move the creature (walking) should stop and re-attach, or tween the
 * container's parent instead.
 */
export function attachMotion(scene: Phaser.Scene, target: Phaser.GameObjects.Container, preset: MotionPreset, settings?: Settings): Motion {
  const calm = settings?.reduceMotion ?? false;
  const amp = calm ? 0.25 : 1;
  const restX = target.x;
  const restY = target.y;
  const restSX = target.scaleX;
  const restSY = target.scaleY;
  const sign = Math.sign(restSX) || 1;
  const idle: Phaser.Tweens.Tween[] = [];

  // Idle loop per preset.
  if (!calm) {
    if (preset === 'organic') {
      idle.push(scene.tweens.add({ targets: target, y: restY - 6, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
    } else if (preset === 'rigid') {
      // Stepped bob: hold, then a quick move, no squash.
      idle.push(scene.tweens.add({ targets: target, y: restY - 4, duration: 220, hold: 900, yoyo: true, repeatDelay: 700, repeat: -1, ease: 'Quad.easeOut' }));
    } else {
      // Wobble: opposing scale on x and y, slight drift.
      idle.push(scene.tweens.add({ targets: target, scaleX: restSX * 1.06, scaleY: restSY * 0.94, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
      idle.push(scene.tweens.add({ targets: target, x: restX + 3, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
    }
  }

  const once = (cfg: Omit<Phaser.Types.Tweens.TweenBuilderConfig, 'targets'>) => scene.tweens.add({ ...cfg, targets: target });

  return {
    hop() {
      if (preset === 'wobble') {
        once({ scaleY: restSY * (1 + 0.25 * amp), scaleX: restSX * (1 - 0.15 * amp), duration: 140, yoyo: true, ease: 'Quad.easeOut' });
        return;
      }
      once({ y: restY - 26 * amp, duration: 160, yoyo: true, ease: 'Quad.easeOut' });
      if (preset === 'organic') once({ scaleY: restSY * (1 - 0.1 * amp), scaleX: restSX * (1 + 0.06 * amp), duration: 90, yoyo: true, delay: 300 });
    },
    shake() {
      once({ x: restX + 8 * amp * sign, duration: 60, yoyo: true, repeat: 3, onComplete: () => target.setX(restX) });
    },
    recoil(dir = 1) {
      once({ x: restX - 24 * amp * dir, duration: 120, yoyo: true, ease: 'Quad.easeOut', onComplete: () => target.setX(restX) });
      if (preset !== 'rigid') once({ scaleX: restSX * (1 - 0.08 * amp), duration: 120, yoyo: true });
    },
    squash() {
      const k = preset === 'wobble' ? 0.3 : preset === 'rigid' ? 0.04 : 0.12;
      once({ scaleY: restSY * (1 - k * amp), scaleX: restSX * (1 + k * 0.6 * amp), duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    },
    stop() {
      for (const t of idle) t.stop();
      target.setPosition(restX, restY).setScale(restSX, restSY);
    },
  };
}
