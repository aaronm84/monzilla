import type Phaser from 'phaser';
import type { Kind } from '@monzilla/core';

/** See docs/SPRITES.md for the format these types describe. */
export type Tint = 'primary' | 'secondary' | 'accent' | 'none';

/** Slots a genome can ask for. A kind may reinterpret or omit any of them. */
export type Slot = 'tail' | 'wings' | 'spike' | 'horn' | 'head' | 'face';
export const SLOTS: Slot[] = ['tail', 'wings', 'spike', 'horn', 'head', 'face'];

/** Semantic anchors, in body units from the body centre. All optional. */
export interface Anchors {
  mouth?: [number, number];
  head?: [number, number];
  back?: [number, number];
  center?: [number, number];
  feet?: [number, number];
  attackOrigin?: [number, number];
  effectOrigin?: [number, number];
}

/** Logical footprint in body units, independent of PNG padding. */
export interface Bounds {
  /** Tap/selection box: width, height, centred on the body centre unless offset. */
  selection: [number, number];
  selectionOffset?: [number, number];
  /** Ground footprint width/height for shadows and placement. */
  footprint?: [number, number];
}

export interface BodyDef {
  frame: string;
  detail?: string;
  /** Body ellipse in body units, used to place fallback vector parts. */
  size: [number, number];
  /** 0..1 within the frame; where the body centre sits. */
  pivot: [number, number];
  /** Attach points in body units from the body centre. */
  attach: {
    head?: [number, number][];
    wings?: [number, number];
    tail?: [number, number];
    spikes?: [number, number];
    horns?: [number, number];
    face?: [number, number];
  };
  anchors?: Anchors;
  bounds?: Bounds;
}

export interface PartDef {
  frame: string;
  detail?: string;
  pivot: [number, number];
  z: 'behind' | 'front';
  tint: Tint;
  /** Extra scale multiplier, default 1. */
  scale?: number;
}

/** How a kind moves. Picks a preset in render/motion.ts. */
export type MotionPreset = 'organic' | 'rigid' | 'wobble';

export interface KindManifest {
  kind: Kind;
  atlas: string;
  unit: number;
  bodies: { baby: BodyDef; grown: BodyDef };
  parts: Record<string, PartDef>;
  /**
   * Slots this kind deliberately does not render, even when the genome
   * has them. Omitted slots get no sprite and no vector fallback.
   */
  omit?: Slot[];
  motion?: MotionPreset;
  displayName?: string;
}

/**
 * Holds every loaded kind manifest. Scenes ask it whether a kind has art
 * and the hybrid renderer asks it for parts; anything missing falls back
 * to the vector drawing.
 */
export class PartLibrary {
  private manifests = new Map<Kind, KindManifest>();

  add(manifest: KindManifest) {
    this.manifests.set(manifest.kind, manifest);
  }

  get(kind: Kind): KindManifest | undefined {
    return this.manifests.get(kind);
  }

  has(kind: Kind): boolean {
    return this.manifests.has(kind);
  }

  kinds(): Kind[] {
    return [...this.manifests.keys()];
  }
}

export const PARTS_KEY = 'parts';

export function getParts(scene: Phaser.Scene): PartLibrary {
  return (scene.registry.get(PARTS_KEY) as PartLibrary | undefined) ?? new PartLibrary();
}
