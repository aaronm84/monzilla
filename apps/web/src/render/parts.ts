import type Phaser from 'phaser';
import type { Kind } from '@monzilla/core';

/** See docs/SPRITES.md for the format these types describe. */
export type Tint = 'primary' | 'secondary' | 'accent' | 'none';

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

export interface KindManifest {
  kind: Kind;
  atlas: string;
  unit: number;
  bodies: { baby: BodyDef; grown: BodyDef };
  parts: Record<string, PartDef>;
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
