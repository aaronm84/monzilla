import Phaser from 'phaser';
import type { Genome } from '@monzilla/core';
import { bodyUnit, drawGlow, drawKaiju, drawSilhouette, makeCtx, partHead, partHorns, partSpikes, partTail, partWings, type Ctx } from './kaiju.js';
import { getParts, type Anchors, type BodyDef, type PartDef, type Slot } from './parts.js';

const SILHOUETTE = 0x3d4a6b;

export interface KaijuOptions {
  glow?: boolean;
  silhouette?: boolean;
}

/** Anchors resolved to pixels in the container's local space. */
export type LocalAnchors = Required<Anchors>;

/**
 * Builds a creature as a container at (x, y). Assembly order follows the
 * design brief: rear parts, tail, body base, body detail, front parts,
 * spikes/horns/extra heads, alignment overlay. If the kind has a sprite
 * manifest, each slot uses its sprite when the manifest provides one,
 * falls back to the vector drawing when it doesn't, and is skipped when
 * the manifest lists it under `omit`. Kinds without a manifest are fully
 * vector. Either way the result is a plain container that scenes tween,
 * flip, and position the same, which is what makes puppet animation and
 * shared island/portrait rendering work.
 *
 * The container carries `anchors` and `bounds` in its data store, in
 * local pixels, and its size/hit area come from the logical bounds, not
 * the PNG.
 */
export function createKaiju(scene: Phaser.Scene, genome: Genome, x: number, y: number, scale = 1, opts: KaijuOptions = {}): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const lib = getParts(scene);
  const manifest = lib.get(genome.kind);
  const glow = opts.glow ?? true;
  const u = bodyUnit(genome, scale);

  if (!manifest || !scene.textures.exists(manifest.atlas)) {
    const g = scene.add.graphics();
    if (opts.silhouette) drawSilhouette(g, genome, 0, 0, scale);
    else drawKaiju(g, genome, 0, 0, scale, glow);
    c.add(g);
    const probe = makeCtx(scene.add.graphics(), genome, 0, 0, scale);
    probe.g.destroy();
    setMeta(c, u, { size: [probe.bw / u, probe.bh / u] });
    return c;
  }

  const body: BodyDef = genome.size >= 1.2 ? manifest.bodies.grown : manifest.bodies.baby;
  const spriteScale = u / manifest.unit;
  const probe = makeCtx(scene.add.graphics(), genome, 0, 0, scale, body.size);
  probe.g.destroy();
  const omitted = new Set<Slot>(manifest.omit ?? []);
  const tintOf = (t: PartDef['tint']) =>
    opts.silhouette ? SILHOUETTE : t === 'primary' ? probe.primary : t === 'secondary' ? probe.secondary : t === 'accent' ? probe.accent : 0xffffff;

  const rear: Phaser.GameObjects.GameObject[] = [];
  const front: Phaser.GameObjects.GameObject[] = [];
  // Vector fallback for missing slots: one graphics under the body for
  // tails and wings, one over it for spikes, horns, and extra heads.
  const fallbackBehind = scene.add.graphics();
  const fallbackFront = scene.add.graphics();
  const fb: Ctx = { ...probe, g: fallbackBehind };
  const ff: Ctx = { ...probe, g: fallbackFront };

  const sprite = (def: PartDef, px: number, py: number, flipX = false, extraScale = 1) => {
    const s = scene.add.image(px, py, manifest.atlas, def.frame).setOrigin(def.pivot[0], def.pivot[1]);
    const k = spriteScale * (def.scale ?? 1) * extraScale;
    s.setScale(flipX ? -k : k, k);
    if (def.tint !== 'none' || opts.silhouette) s.setTint(tintOf(def.tint));
    const out: Phaser.GameObjects.GameObject[] = [s];
    if (def.detail && !opts.silhouette) {
      const d = scene.add.image(px, py, manifest.atlas, def.detail).setOrigin(def.pivot[0], def.pivot[1]);
      d.setScale(s.scaleX, s.scaleY);
      out.push(d);
    }
    return out;
  };

  if (glow && !opts.silhouette) {
    const g = scene.add.graphics();
    drawGlow(g, genome, 0, 0, scale);
    c.add(g);
  }

  const p = genome.parts;
  const at = (k: keyof BodyDef['attach']) => body.attach[k] as [number, number] | undefined;
  const bw = probe.bw;
  const bh = probe.bh;

  // 1. Rear wings (mirrored) and 2. tail, behind the body.
  if (p.wings !== 'none' && !omitted.has('wings')) {
    const def = manifest.parts[`wings.${p.wings}`];
    const a = at('wings') ?? [0, -0.25];
    if (def) {
      rear.push(...sprite(def, a[0] * u - bw * 0.35, a[1] * u, true));
      rear.push(...sprite(def, a[0] * u + bw * 0.35, a[1] * u));
    } else partWings(fb, a[1] * u);
  }
  if (!omitted.has('tail')) {
    const def = manifest.parts[`tail.${p.tail}`];
    const a = at('tail') ?? [-body.size[0] / 2, 0.15];
    if (def) rear.push(...sprite(def, a[0] * u, a[1] * u));
    else partTail(fb, a[0] * u, a[1] * u);
  }

  // 3–4. Body base (tinted) and body detail (untinted).
  const bodySprites = sprite({ frame: body.frame, detail: body.detail, pivot: body.pivot, z: 'front', tint: 'primary' }, 0, 0);

  // 5–6. Front parts: spikes along the back, extra heads, horns.
  if (p.spikes > 0 && !omitted.has('spike')) {
    const def = manifest.parts['spike'];
    const a = at('spikes') ?? [0, -body.size[1] / 2];
    if (def) {
      const span = bw * 0.7;
      for (let i = 0; i < p.spikes; i++) {
        const t = p.spikes === 1 ? 0.5 : i / (p.spikes - 1);
        const sx = a[0] * u - span / 2 + span * t;
        const sy = a[1] * u + Math.abs(t - 0.5) * bh * 0.35 + u * 0.08;
        front.push(...sprite(def, sx, sy, false, 1 - Math.abs(t - 0.5) * 0.5));
      }
    } else partSpikes(ff, a[0] * u, a[1] * u, bw * 0.7);
  }
  const headSpots = body.attach.head ?? [];
  if (!omitted.has('head')) {
    const headDef = manifest.parts['head'];
    for (let i = 1; i < p.heads; i++) {
      const a = headSpots[i] ?? headSpots[0] ?? [0.12, -body.size[1] / 2 - 0.5];
      const hx = a[0] * u + (i - (p.heads - 1) / 2) * bw * 0.3;
      const hy = a[1] * u - Math.abs(i - (p.heads - 1) / 2) * u * 0.2;
      if (headDef) front.push(...sprite(headDef, hx, hy));
      else partHead(ff, hx, hy, u * 0.6);
    }
  }
  if (p.horns > 0 && !omitted.has('horn')) {
    const def = manifest.parts['horn'];
    const a = at('horns') ?? headSpots[0] ?? [0.12, -body.size[1] / 2 - 0.9];
    if (def) {
      for (let h = 0; h < p.horns; h++) {
        const t = p.horns === 1 ? 0 : h / (p.horns - 1) - 0.5;
        front.push(...sprite(def, a[0] * u + t * u * 0.9, a[1] * u));
      }
    } else partHorns(ff, a[0] * u, a[1] * u + u * 0.65, u * 0.75);
  }

  // 7. Alignment overlay, always on top.
  if (genome.alignment === 'villain' && !opts.silhouette && !omitted.has('face')) {
    const def = manifest.parts['face.villain'];
    const a = at('face') ?? headSpots[0] ?? [0.3, -body.size[1] / 2 - 0.4];
    if (def) front.push(...sprite(def, a[0] * u, a[1] * u));
  }

  c.add([fallbackBehind, ...rear, ...bodySprites, fallbackFront, ...front]);
  setMeta(c, u, body);
  return c;
}

/** Register anchors and logical bounds on the container, in local pixels. */
function setMeta(c: Phaser.GameObjects.Container, u: number, body: Pick<BodyDef, 'size'> & Partial<Pick<BodyDef, 'anchors' | 'bounds'>>) {
  const [w, h] = body.size;
  const a = body.anchors ?? {};
  const px = (v: [number, number] | undefined, dflt: [number, number]): [number, number] => {
    const p = v ?? dflt;
    return [p[0] * u, p[1] * u];
  };
  const anchors: LocalAnchors = {
    center: px(a.center, [0, 0]),
    head: px(a.head, [0.12, -h / 2 - 0.5]),
    mouth: px(a.mouth, [0.7, -h / 2 - 0.2]),
    back: px(a.back, [0, -h / 2]),
    feet: px(a.feet, [0, h / 2 + 0.3]),
    attackOrigin: px(a.attackOrigin, [w / 2, -h / 4]),
    effectOrigin: px(a.effectOrigin, [0, -h / 4]),
  };
  const sel = body.bounds?.selection ?? [w * 1.2, h * 1.6];
  const off = body.bounds?.selectionOffset ?? [0, -h * 0.25];
  const foot = body.bounds?.footprint ?? [w * 1.1, 0.5];
  c.setData('anchors', anchors);
  c.setData('bounds', { selection: [sel[0] * u, sel[1] * u], selectionOffset: [off[0] * u, off[1] * u], footprint: [foot[0] * u, foot[1] * u] });
  c.setSize(sel[0] * u, sel[1] * u);
}

export function kaijuAnchor(c: Phaser.GameObjects.Container, name: keyof LocalAnchors): { x: number; y: number } {
  const a = (c.getData('anchors') as LocalAnchors | undefined)?.[name] ?? [0, 0];
  // Respect the container's flip and scale.
  return { x: c.x + a[0] * c.scaleX, y: c.y + a[1] * c.scaleY };
}

/** Whether a world/scene point falls inside the creature's logical selection box. */
export function kaijuContains(c: Phaser.GameObjects.Container, x: number, y: number): boolean {
  const b = c.getData('bounds') as { selection: [number, number]; selectionOffset: [number, number] } | undefined;
  if (!b) return false;
  const w = b.selection[0] * Math.abs(c.scaleX);
  const h = b.selection[1] * Math.abs(c.scaleY);
  const cx = c.x + b.selectionOffset[0] * c.scaleX;
  const cy = c.y + b.selectionOffset[1] * c.scaleY;
  return Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= h / 2;
}
