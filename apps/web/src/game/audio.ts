import type { Settings } from '@monzilla/core';

/**
 * Tiny synth so the first slice needs no audio assets. Every sound is a
 * short envelope on an oscillator. Quiet mode softens everything; the sfx
 * slider scales it.
 */
class Sfx {
  private ctx: AudioContext | null = null;
  private settings: Settings | null = null;

  bind(settings: Settings) {
    this.settings = settings;
  }

  /** Must be called from a user gesture on iOS. */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private gain(): number {
    const s = this.settings;
    if (!s) return 0.5;
    return s.sfxVolume * (s.quiet ? 0.35 : 1);
  }

  private tone(freq: number, duration: number, type: OscillatorType, volume = 0.3, slideTo?: number) {
    if (!this.ctx || this.gain() === 0) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    g.gain.setValueAtTime(volume * this.gain(), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  tap() {
    this.tone(660, 0.08, 'sine', 0.2);
  }
  chomp() {
    this.tone(220, 0.12, 'square', 0.2, 110);
    setTimeout(() => this.tone(180, 0.1, 'square', 0.15, 90), 90);
  }
  splash() {
    this.tone(900, 0.25, 'sine', 0.15, 300);
  }
  boing() {
    this.tone(300, 0.25, 'triangle', 0.25, 700);
  }
  snore() {
    this.tone(120, 0.5, 'sine', 0.2, 80);
  }
  roar() {
    this.tone(90, 0.5, 'sawtooth', 0.25, 60);
  }
  stomp() {
    this.tone(70, 0.2, 'square', 0.3, 40);
  }
  hit(effective: number) {
    if (effective >= 2) {
      this.tone(500, 0.12, 'square', 0.25, 900);
      setTimeout(() => this.tone(800, 0.15, 'square', 0.2, 1200), 80);
    } else if (effective <= 0.5) {
      this.tone(300, 0.15, 'triangle', 0.15, 200);
    } else {
      this.tone(400, 0.12, 'square', 0.2, 250);
    }
  }
  crunch() {
    this.tone(150, 0.18, 'sawtooth', 0.2, 60);
  }
  repair() {
    this.tone(500, 0.08, 'sine', 0.2);
    setTimeout(() => this.tone(750, 0.1, 'sine', 0.2), 70);
  }
  sparkle() {
    [880, 1100, 1320, 1760].forEach((f, i) => setTimeout(() => this.tone(f, 0.15, 'sine', 0.15), i * 60));
  }
  grow() {
    [330, 440, 550, 660, 880].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, 'triangle', 0.2), i * 90));
  }
  place() {
    this.tone(420, 0.06, 'square', 0.15);
  }
}

export const sfx = new Sfx();
