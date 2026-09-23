import Phaser from 'phaser';
import type { Genome } from '@monzilla/core';
import { bodyUnit, drawGlow, drawKaiju, drawSilhouette, makeCtx, partHead, partHorns, partSpikes, partTail, partWings, type Ctx } from './kaiju.js';
import { getParts, type BodyDef, type KindManifest, type PartDef } from './parts.js';

const hex = (s: string) => Phaser.Display.Color.HexStringToColor(s).color;
const SILHOUETTE = 0x3d4a6b;

export interface KaijuOptions {
  glow?: boolean;
  silhouette?: boolean;
}

/**
 * Builds a creature as a container at (x, y). If the kind has a sprite
 * manifest, the body and any parts it provides are sprites (tinted by
 * the palette) and every other slot is drawn with the vector renderer
 * into the same container. If not, the whole creature is vector.
 *
 * Either way the result is a plain container: scenes tween, flip, and
 * position it the same, which is what makes puppet animation work.
 */
export function createKaiju(scene: Phaser.Scene, genome: Genome, x: number, y: number, scale = 1, opts: KaijuOptions = {}): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const lib = getParts(scene);
  const manifest = lib.get(genome.kind);
  const glow = opts.glow ?? true;

  if (!manifest || !scene.textures.exists(manifest.atlas)) {
    const g = scene.add.graphics();
    if (opts.silhouette) drawSilhouette(g, genome, 0, 0, scale);
    else drawKaiju(g, genome, 0, 0, scale, glow);
    c.add(g);
    return c;
  }

  const u = bodyUnit(genome, scale);
  const body: BodyDef = genome.size >= 1.2 ? manifest.bodies.grown : manifest.bodies.baby;
  const spriteScale = u / manifest.unit;
  const ctx = makeCtx(scene.add.graphics(), genome, 0, 0, scale, body.size);
  const tintOf = (t: PartDef['tint']) =>
    opts.silhouette ? SILHOUETTE : t === 'primary' ? ctx.primary : t === 'secondary' ? ctx.secondary : t === 'accent' ? ctx.accent : 0xffffff;

  const behind: Phaser.GameObjects.GameObject[] = [];
  const front: Phaser.GameObjects.GameObject[] = [];
  // Vector fallback for missing slots: one graphics under the body for
  // tails and wings, one over it for spikes, horns, and extra heads.
  const fallbackBehind = scene.add.graphics();
  const fallbackFront = scene.add.graphics();
  const fb: Ctx = { ...ctx, g: fallbackBehind };
  const ff: Ctx = { ...ctx, g: fallbackFront };
  ctx.g.destroy();

  const sprite = (def: PartDef, px: number, py: number, flipX = false, extraScale = 1) => {
    const s = scene.add.image(px, py, manifest.atlas, def.frame).setOrigin(def.pivot[0], def.pivot[1]);
    s.setScale(spriteScale * (def.scale ?? 1) * extraScale * (flipX ? -1 : 1), spriteScale * (def.scale ?? 1) * extraScale);
    const tint = tintOf(def.tint);
    if (def.tint !== 'none' || opts.silhouette) s.setTint(tint);
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

  // Tail (behind)
  {
    const def = manifest.parts[`tail.${p.tail}`];
    const a = at('tail') ?? [-body.size[0] / 2, 0.15];
    if (def) behind.push(...sprite(def, a[0] * u, a[1] * u));
    else partTail(fb, a[0] * u, a[1] * u);
  }
  // Wings (behind, mirrored)
  if (p.wings !== 'none') {
    const def = manifest.parts[`wings.${p.wings}`];
    const a = at('wings') ?? [0, -0.25];
    if (def) {
      behind.push(...sprite(def, a[0] * u - ctx.bw * 0.35, a[1] * u, true));
      behind.push(...sprite(def, a[0] * u + ctx.bw * 0.35, a[1] * u));
    } else partWings(fb, a[1] * u);
  }

  // Body: tintable base plus untinted detail.
  const bodyPart: PartDef = { frame: body.frame, detail: body.detail, pivot: body.pivot, z: 'front', tint: 'primary' };
  const bodySprites = sprite(bodyPart, 0, 0);

  // Spikes along the back (front)
  if (p.spikes > 0) {
    const def = manifest.parts['spike'];
    const a = at('spikes') ?? [0, -body.size[1] / 2];
    if (def) {
      const span = ctx.bw * 0.7;
      for (let i = 0; i < p.spikes; i++) {
        const t = p.spikes === 1 ? 0.5 : i / (p.spikes - 1);
        const sx = a[0] * u - span / 2 + span * t;
        const sy = a[1] * u + Math.abs(t - 0.5) * ctx.bh * 0.35 + u * 0.08;
        const sc = 1 - Math.abs(t - 0.5) * 0.5;
        front.push(...sprite(def, sx, sy, false, sc));
      }
    } else partSpikes(ff, a[0] * u, a[1] * u, ctx.bw * 0.7);
  }

  // Extra heads (front); the first head is part of the body art.
  const headDef = manifest.parts['head'];
  const headSpots = body.attach.head ?? [];
  for (let i = 1; i < p.heads; i++) {
    const a = headSpots[i] ?? headSpots[0] ?? [0.12, -body.size[1] / 2 - 0.5];
    const hx = a[0] * u + (i - (p.heads - 1) / 2) * ctx.bw * 0.3;
    const hy = a[1] * u - Math.abs(i - (p.heads - 1) / 2) * u * 0.2;
    if (headDef) front.push(...sprite(headDef, hx, hy));
    else partHead(ff, hx, hy, u * 0.6);
  }

  // Horns on the first head (front)
  if (p.horns > 0) {
    const def = manifest.parts['horn'];
    const a = at('horns') ?? headSpots[0] ?? [0.12, -body.size[1] / 2 - 0.9];
    if (def) {
      for (let h = 0; h < p.horns; h++) {
        const t = p.horns === 1 ? 0 : h / (p.horns - 1) - 0.5;
        front.push(...sprite(def, a[0] * u + t * u * 0.9, a[1] * u));
      }
    } else partHorns(ff, a[0] * u, a[1] * u + u * 0.65, u * 0.75);
  }

  // Villain expression overlay (front)
  if (genome.alignment === 'villain' && !opts.silhouette) {
    const def = manifest.parts['face.villain'];
    const a = at('face') ?? headSpots[0] ?? [0.3, -body.size[1] / 2 - 0.4];
    if (def) front.push(...sprite(def, a[0] * u, a[1] * u));
  }

  c.add([fallbackBehind, ...behind, ...bodySprites, fallbackFront, ...front]);
  return c;
}
