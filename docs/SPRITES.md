# Monzilla sprite system

How creature art plugs into the game. Read this before making any part.
The game renders creatures from a **genome** (kind, parts, palette, size).
Art replaces the vector drawing one slot at a time: any slot without a
sprite falls back to the built-in vector drawing, so art can land
piecemeal on the live game.

## Principles

- **Puppet, not frames.** Every part is one static image with a pivot.
  Animation is code-driven (bob, hop, flap, wag, shake), so one image per
  part covers every animation and the calm-motion setting keeps working.
  Frame animation is only for effects (flames, splashes, sparks).
- **Tint, not variants.** A part is two layers: a *base* painted in light
  neutral grays with shading, which the game tints with the type colour,
  and a *detail* layer (eyes, teeth, highlights) that is never tinted.
  Villains get the same parts with a darker tint and an expression
  overlay. No per-type or per-alignment sheets.
- **Two bodies per kind.** `baby` (bigger head, rounder) for hatchling and
  juvenile at different scales, `grown` for guardians and villains.
- **Side-facing, facing right.** The game flips the whole creature to face
  left. No four-direction art.
- **Portraits render from parts.** Only the ten named regulars get a
  hand-painted portrait.

## Units

All positions in a manifest are in **body units (u)**. One u is the
creature's base unit: `36 × size × scale` screen pixels, the same unit
the vector renderer uses. `unit` in the manifest says how many atlas
pixels equal one u, so art can be authored at any resolution.

Recommended authoring: `unit: 128` (one u = 128 px), which makes a grown
body about 2.0 × 2.6 u = 256 × 333 px, crisp at the craft zoom on a 2x
iPad. Keep each atlas under 4096 × 4096.

## Previewing a set

`apps/web/public/parts/index.json` lists the kinds whose art ships. To try
a set that is not listed yet, open the game with `?parts=lizard` (or a
comma-separated list). `npm run parts:placeholder -w apps/web` regenerates
the placeholder lizard set used to exercise the pipeline.

## Files per kind

Each kind lives in its own folder. Only kinds listed in `index.json` ship.

```
apps/web/public/parts/
  index.json                ["lizard", "robot"]
  lizard/
    lizard.json             manifest (this format)
    lizard.png              atlas image
    lizard.atlas.json       Phaser JSON-hash atlas (TexturePacker / free-tex-packer)
  robot/
    ...
```

## Manifest format

```jsonc
{
  "kind": "lizard",
  "atlas": "lizard",            // atlas key; lizard.png + lizard.atlas.json
  "unit": 128,                  // atlas pixels per body unit
  "bodies": {
    "baby": {
      "frame": "body_baby",           // tintable base
      "detail": "body_baby_detail",   // never tinted (optional)
      "size": [2.0, 2.0],             // body ellipse in u, for fallback parts
      "pivot": [0.5, 0.55],           // 0..1 within the frame; (0.5,0.5) = body centre
      "attach": {                     // where slots hang, in u from body centre
        "head":   [[0.12, -1.2]],     // one entry per extra head, first head is in the body art
        "wings":  [0, -0.25],
        "tail":   [-0.8, 0.15],
        "spikes": [0, -1.0],
        "horns":  [0.12, -1.75]
      }
    },
    "grown": { /* same shape */ }
  },
  "parts": {
    // key = slot.variant. Slots: wings, tail, head, spike, horn, face
    "tail.long":   { "frame": "tail_long",  "pivot": [1.0, 0.5], "z": "behind", "tint": "primary" },
    "wings.bat":   { "frame": "wings_bat",  "pivot": [0.5, 0.8], "z": "behind", "tint": "secondary" },
    "spike":       { "frame": "spike",      "pivot": [0.5, 1.0], "z": "front",  "tint": "accent" },
    "horn":        { "frame": "horn",       "pivot": [0.5, 1.0], "z": "front",  "tint": "accent" },
    "head":        { "frame": "head",       "detail": "head_detail", "pivot": [0.5, 0.5], "z": "front", "tint": "primary" },
    "face.villain":{ "frame": "face_villain", "pivot": [0.5, 0.5], "z": "front", "tint": "none" }
  }
}
```

- `tint`: `primary` (body colour), `secondary` (belly/wing colour),
  `accent` (plate colour), or `none`.
- `omit` (top level, optional): slots this kind never renders, even when
  the genome has them. Omitted slots get no sprite and no vector fallback.
  A blob might omit `["wings", "horn", "head"]`.
- `motion` (top level, optional): `organic` (bob, squash), `rigid`
  (stepped bob, no squash), or `wobble` (scale wobble, drift). Defaults by
  kind. Every kind gets the same one-shot reactions: hop, shake, recoil,
  squash; calm-motion mode shrinks them.
- `anchors` (per body, optional, body units from centre): `mouth`,
  `head`, `back`, `center`, `feet`, `attackOrigin`, `effectOrigin`. The
  game uses them for floating numbers, effects, and reactions. Missing
  anchors get sensible defaults from the body size.
- `bounds` (per body, optional, body units): `selection` box and
  `selectionOffset` for taps, `footprint` for shadows and placement.
  Transparent padding never affects tap detection.
- `z`: `behind` draws under the body, `front` over it.
- Spikes and horns are one image each; the game places `parts.spikes`
  copies along the back and `parts.horns` copies on the head, so make them
  a single upright plate with the pivot at its base.
- Wings are one image for both sides; the game mirrors it.

## Slots are generic on purpose

A kind may reinterpret any slot. The robot's `tail.*` parts are rear
modules, its `horn` is an antenna, its `spike` is an armour plate. The
blob's `tail.*` is a drip and its `spike` a crystal nub. Map every genome
variant that could occur (all four tails) or the vector fallback will
draw the missing one. If a future kind reveals a genuinely new concept
(a turtle shell, crab claws), add a semantic slot deliberately rather
than stretching these.

## Slot list

| Slot | Variants | Count from genome |
|---|---|---|
| body | baby, grown | 1 |
| tail | stub, long, club, fan | 1 |
| wings | bat, feather, fin | 0 or 1 (mirrored) |
| head | (one) | heads − 1 extra copies |
| spike | (one) | 0–5 |
| horn | (one) | 0–3 |
| face | villain | 1 for villains |

A kind can omit any slot; the vector drawing fills in.

## Style rules

- Chunky toy proportions: head about 40% of body height on the grown
  body, 55% on the baby body.
- Flat shading in two tones plus one highlight. No outlines heavier than
  2 px at `unit: 128`.
- Base layer: paint in grays between #9a9a9a and #f0f0f0. Anything that
  must keep its colour (eyes, teeth, plate highlights) goes on the
  detail layer.
- Crystal plates are faceted with a lit left face; this is the signature
  shape from the concept boards.
- Leave 8 px of transparent padding on every frame.

## Stress test (lizard, robot, blob)

Three kinds validate the system before the other seven are made. The
sets in `apps/web/public/parts/{lizard,robot,blob}` are cut from the
design board `docs/concept/sprite-stress-test.png` by
`apps/web/scripts/extract-board-parts.py`: soft-alpha crops of the gray
bodies and slot parts, converted to tintable base plus untinted detail
layers, with estimated pivots, attach points, anchors, and bounds. They
ship (listed in `index.json`) so the game shows the boards' art now.

Known limits of the extraction, fixed by real exports: the board bodies
already include tails and plates, so `spike` is omitted and tail parts
double up; resolution is the board's (about 40 px per body unit), so
the craft zoom is soft; eyes are split heuristically. Real exports
should paint bodies without tails or plates, at `unit: 128`.
`npm run parts:placeholder -w apps/web` still generates the gray
synthetic set for pipeline tests.

| Kind | Proves | Required art |
|---|---|---|
| Lizard | pivots, tails, repeated spikes, horns, tinting, villain overlay, flip | both bodies + details, tail × 4, spike, horn, face.villain |
| Robot | generic slots on rigid anatomy, metallic tints, rigid motion | both bodies + details, rear module(s) mapped to tail.*, plate as spike, antenna as horn, face.villain |
| Blob | omitted slots, minimal anatomy, wobble motion, deformation vs attach points | both bodies + details, drip as tail.*, nub as spike, face.villain; omit wings, horn, head |

Minimum genomes to check per kind: water guardian, fire guardian, plant
guardian, fire villain (lizard); lightning guardian, water guardian, a
villain (robot); water guardian, fire guardian, a villain (blob). Check
each as baby and grown, facing both ways, on the island and in the dex.

Success: all three load through the same renderer with no kind-specific
code path, missing slots fall back or are omitted, type and alignment
come from tint plus overlay only, bodies switch cleanly, motion is all
transforms, and adding a fourth kind is assets plus a manifest.

Note: there is no dark type in the game. A "dark villain" in the brief
is any type's villain; the darkening comes from the villain palette.

## Export

- PNG-32, premultiplied off.
- Atlas as Phaser JSON hash (TexturePacker "Phaser 3" preset or
  free-tex-packer "JSON hash").
- Frame names must match the manifest exactly.
