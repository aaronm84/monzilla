import Phaser from 'phaser';
import type { Settings } from '@monzilla/core';
import { getSession, getStore, setSession } from '../game/ctx.js';
import { connectFirebase, firebaseConfigured, signInWithGoogle } from '../game/firebase.js';
import { COLORS, FONT, handleResize, label, layoutFor, makeButton, panel } from '../game/ui.js';

/**
 * Sensory settings first, parent tools second. Everything here is a big
 * toggle or a plus/minus so it works without reading. The parent section
 * uses words because it is for the parent.
 */
export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('Settings');
  }

  create() {
    handleResize(this);
    const store = getStore(this);
    const L = layoutFor(this);
    const s = store.save.settings;

    const w = Math.min(560, L.w - L.pad * 2);
    const x = L.w / 2 - w / 2;
    let y = L.pad;
    panel(this, x, y, w, L.h - L.pad * 2);
    y += L.pad;

    makeButton(this, x + L.pad + L.btn * 0.4, y + L.btn * 0.4, {
      icon: '🏠', label: 'Back home', size: L.btn * 0.8, settings: s, onTap: () => this.scene.start('Island'),
    });
    label(this, L.w / 2, y + L.btn * 0.4, '⚙️', 40);
    y += L.btn + L.pad;

    const rowH = L.compact ? 64 : 76;
    const toggle = (icon: string, name: string, key: keyof Settings) => {
      const on = store.save.settings[key] as boolean;
      label(this, x + L.pad + 40, y + rowH / 2, icon, 34);
      const btn = makeButton(this, x + w - L.pad - rowH * 0.5, y + rowH / 2, {
        icon: on ? '✅' : '⬜', label: name, size: rowH * 0.8, settings: s,
        onTap: () => {
          store.update((sv) => ({ ...sv, settings: { ...sv.settings, [key]: !sv.settings[key] } }));
          this.scene.restart();
        },
      });
      this.add.text(x + L.pad + 80, y + rowH / 2, name, { fontSize: '20px', fontFamily: FONT, color: COLORS.muted }).setOrigin(0, 0.5);
      y += rowH;
      return btn;
    };
    const slider = (icon: string, name: string, key: 'musicVolume' | 'sfxVolume') => {
      const v = store.save.settings[key];
      label(this, x + L.pad + 40, y + rowH / 2, icon, 34);
      this.add.text(x + L.pad + 80, y + rowH / 2, name, { fontSize: '20px', fontFamily: FONT, color: COLORS.muted }).setOrigin(0, 0.5);
      const set = (nv: number) => {
        store.update((sv) => ({ ...sv, settings: { ...sv.settings, [key]: Math.max(0, Math.min(1, nv)) } }));
        this.scene.restart();
      };
      const bx = x + w - L.pad - rowH * 0.5;
      makeButton(this, bx, y + rowH / 2, { icon: '➕', label: `${name} up`, size: rowH * 0.8, settings: s, onTap: () => set(v + 0.2) });
      label(this, bx - rowH * 0.9, y + rowH / 2, `${Math.round(v * 5)}`, 28);
      makeButton(this, bx - rowH * 1.8, y + rowH / 2, { icon: '➖', label: `${name} down`, size: rowH * 0.8, settings: s, onTap: () => set(v - 0.2) });
      y += rowH;
    };

    toggle('🐢', 'Calm motion', 'reduceMotion');
    toggle('🤫', 'Quiet mode', 'quiet');
    toggle('🗣️', 'Say names on hold', 'speakLabels');
    slider('🔊', 'Sounds', 'sfxVolume');

    // --- Parent zone ------------------------------------------------------
    y += L.pad;
    this.add.text(x + L.pad, y, 'Parent zone', { fontSize: '18px', fontFamily: FONT, color: COLORS.muted }).setOrigin(0, 0);
    y += 30;

    const session = getSession(this);
    const status = firebaseConfigured()
      ? session
        ? `Synced as ${session.displayName}`
        : 'Not signed in: saving on this device only'
      : 'Sync not set up: saving on this device only';
    this.add.text(x + L.pad, y, status, { fontSize: '16px', fontFamily: FONT, color: COLORS.text, wordWrap: { width: w - L.pad * 2 } });
    y += 40;

    const actions: { icon: string; text: string; onTap: () => void }[] = [];
    if (firebaseConfigured() && !session) {
      actions.push({
        icon: '🔑',
        text: 'Sign in with Google to sync',
        onTap: async () => {
          await signInWithGoogle();
          const next = await connectFirebase().catch(() => null);
          setSession(this, next);
          if (next) location.reload();
        },
      });
    }
    if (session) {
      actions.push({ icon: '🚪', text: 'Sign out', onTap: async () => { await session.signOut(); setSession(this, null); location.reload(); } });
    }
    actions.push({
      icon: '✏️',
      text: 'Name a kaiju',
      onTap: () => {
        const list = store.save.kaiju;
        if (list.length === 0) return;
        const which = list.length === 1 ? 0 : Number(prompt(list.map((k, i) => `${i + 1}: ${k.name || '(no name)'}`).join('\n') + '\n\nWhich number?', '1')) - 1;
        const k = list[which];
        if (!k) return;
        const name = prompt(`Name for kaiju ${which + 1}?`, k.name)?.trim();
        if (name === undefined) return;
        store.update((sv) => ({ ...sv, kaiju: sv.kaiju.map((kk) => (kk.id === k.id ? { ...kk, name: name.slice(0, 16) } : kk)) }));
      },
    });
    actions.push({
      icon: '🎁',
      text: 'Gift 3 stars (reward)',
      onTap: () => store.update((sv) => ({ ...sv, stars: sv.stars + 3 })),
    });
    for (const a of actions) {
      makeButton(this, x + L.pad + rowH * 0.4, y + rowH * 0.4, { icon: a.icon, label: a.text, size: rowH * 0.8, settings: s, onTap: a.onTap });
      this.add.text(x + L.pad + rowH, y + rowH * 0.4, a.text, { fontSize: '18px', fontFamily: FONT, color: COLORS.text }).setOrigin(0, 0.5);
      y += rowH;
    }
  }
}
