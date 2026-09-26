# Monzilla — Design Document

A kaiju sanctuary game for a 5–6 year old, built for iPad first, iPhone second,
and the computer as he grows. This document captures the design conversation
that shaped the project. Treat it as the source of truth for *why* things are
the way they are; the code is the source of truth for *what* they are.

## Who it is for

One specific kid. Heavily ADHD, possibly ASD. Not reading yet, but reads status
bars and numbers fluently. Loves collecting (Pokémon), running his own
"unlock the next character" game with Godzilla figures, building (Minecraft),
and baby creatures he can raise. Sees Godzilla as a good guy who protects the
world from bad guys like King Ghidorah. Likes smashing sometimes, but also
likes order and organization.

The game is not Godzilla-branded. It is kaiju-inspired with its own creatures.

## Design rules

These come first. Any feature that breaks one of them is wrong.

1. **No reading required.** Icons, numbers, bars, sound. Names are the only
   text, typed once by a parent. Tap-and-hold speaks an icon's name.
2. **No losing, no timers, no time pressure.** Nothing is ever lost. A fight he
   stops halfway just pauses. Villains retreat, they never die.
3. **Good and bad are always visually explicit.** Guardians glow blue-white,
   villains glow purple-red, from the egg onward. No twist where a friend
   turns bad.
4. **One glowing "next thing" at a time.** The screen always shows what to
   tap next. He can ignore it.
5. **Predictable transitions.** The sun sets before a session ends. Kaiju yawn.
   No sudden scene changes, no jump scares, no flashing.
6. **Sensory settings up front.** Reduce motion, quiet mode, separate music
   and effects volume. Consistent layout every session.
7. **Nothing blocks on another person.** All multiplayer is asynchronous.
8. **No free text between players.** Reactions are stickers and roars.
9. **Numbers are the language.** Every system is readable through a bar or a
   count. He should be able to figure out the rules by looking.

## The core loop (always in this order)

1. **Care.** Feed, wash, play, sleep. Each is an activity that takes a few
   seconds and shows: food at the mouth and chomping, bubbles, hopping
   after a ball, lying down with floating Zs (a nap is longer and can't be
   interrupted). The bar fills over the activity and the buttons lock
   until it ends. A full bar disables its button with a check. Each action
   costs a little on other bars (playing makes it hungry and dirty, eating
   makes it sleepy and messy), so the rhythm is feed, wash, play, sleep
   rather than one button. Growth is tied to care, never to a clock, so
   nothing decays while he is away.
   Kaiju are never only moved by hand: after a few idle seconds each one
   strolls a few tiles on its own, so an island with several looks like a
   habitat. A tap always takes over.
2. **Build.** Snap-to-grid block building on the island, from the craft
   zoom level with the palette as a drawer. Blocks stack three high.
   Blueprints turn blocks into structures that do something (see
   Building below). Everything persists. This is the "order" outlet.
3. **Alarm.** A villain lands on the beach. He taps the alarm to start the
   fight, so it never interrupts him. He picks a guardian and uses big
   moves. Each move is one villain step toward its goal (see Invasions
   below), so walls and towers are part of the fight.
4. **Collect.** The win screen drops three things one after another:
   stars, an egg fragment of the villain's type (the egg fills up on
   screen, 1/3, 2/3, hatch), and the villain's card with its picture. A
   sparkle marks a card he has never had. Cards are counted per species.
5. **Repair.** Coming home from the fight lands the camera on the first
   cracked block. Every cracked block wears a bobbing hammer; one tap
   snaps it back, no tool needed, and the camera slides to the next. The
   last one gets a sparkle.
6. **Good night.** Once the villain is beaten and nothing is cracked, the
   alarm button turns into a moon. Tapping it shows the day in icons
   (trophy, hammers, egg, card, stars) and a good-night button: evening
   falls on the island, every kaiju lies down with Zs for a moment, and
   the moon gets a check. The evening stays until tomorrow, when the
   next villain lands. Skipping it loses nothing; it is a bow on the
   session, not a gate.

## Creatures

### Genome

Every creature is a **genome**: type, body parts, palette, size, and stat
seeds. Hatching generates a genome from a seed. The creature editor hand-edits
a genome. Same data, same renderer, so "built or generated" is one system, and
breeding later is just mixing genomes.

- Parts: body, heads (1–3), wings, tail, horns, spikes.
- Kind: the creature's family (see below). Fixes the drawing template.
- Alignment: `guardian` or `villain`. Alignment fixes the palette family.
- Stats derive from parts (big body = more power) so a creature can be read by
  looking at it.
- Shiny variants at a low rate for the collector.

### Kinds

A kind is the creature's family, and the main axis the dex collects on. It
is separate from alignment, so a guardian robot and a villain robot both
exist, just like his figure game where the same monster can be on either
side. The palette rule still makes the side obvious.

| Kind | Leans toward | Always has |
|---|---|---|
| Lizard | fire, plant, rock | classic body, no wings |
| Dragon | fire, lightning, sky | bat wings, long necks, up to three heads |
| Moth | sky, plant, ice | big spotted wings, antennae, fuzzy body |
| Turtle | rock, water, plant | shell dome, wide body |
| Yeti | ice, rock, sky | shaggy fur, long arms, face on the body |
| Robot | lightning, rock, ice | boxy body, visor eyes, antenna, chest light |
| Crab | water, rock, ice | claws, eye stalks, six legs |
| Bird | sky, lightning, fire | beak, crest, thin legs, feather wings |
| Blob | water, plant, lightning | no legs, wobbly body, bumps |
| Serpent | water, plant, fire | S-curve body, no legs, forked tongue |

Each kind has its own drawing template and constrains which parts the
generator may pick. A kind rolls its favourite types most of the time but
any type can turn up, so a fire yeti is a rare find.

The dex is kind times type: 70 pages. Each page shows a badge for whether
he has met the guardian, the villain, or both.

### Named regulars

A short hand-authored roster with fixed genomes and names, so the same
dragon shows up on every stormy day and the kid learns who is who.
Generated creatures fill in around them.

- Guardians: Ember (fire lizard, the starter), Luna (sky moth), Boulder
  (rock turtle), Frosty (ice yeti), Bolt (lightning robot).
- Villains: Tridorah (three-headed lightning dragon, boss, storms),
  Pinchor (ice crab, snow), Squall (sky bird, wind), Gloop (water blob,
  rain), Murk (plant serpent, fog).

About a third of daily villains are regulars, preferring the one that
belongs to today's weather.

### Types

Fire, water, lightning, ice, rock, plant, sky. Simple color-coded advantages
shown as an icon grid. Fire beats plant, water beats fire, and so on.

### Growth

Stages: egg → hatchling → juvenile → guardian. Care shifts the genome as it
grows: lots of feeding makes it bigger, lots of play makes it faster, extra
spikes appear at each stage. Readable through the stat bars.

## World

### One island, three zoom levels

The island is a place, not a picture. The kaiju stands on it and walks
where he taps. The camera has three snap levels so the view is always
predictable, plus plus, minus, and a "find my kaiju" button so gestures
are never required:

- **Overview.** The whole island: weather, the egg nest on the shore, the
  villain on the horizon.
- **Explore.** About three times closer. Tap a tile and the kaiju walks
  there over land. Props are real objects to walk between.
- **Craft.** About six times closer, one tile roughly a thumb wide. This
  is where the building palette lives.

The camera clamps to the island so he can never scroll off into open
sea and feel lost. Building is a mode on the same camera, not a separate
screen: a ghost block follows the finger and places on release.

The grid is 32 by 24 tiles. The island renders once to a texture and
only the blocks redraw, so panning stays smooth on an older iPad.

- The island is generated from noise over the member's seed, with biomes
  (beach, forest, volcano, ice, swamp, meadow, cloud), one per type.
- The player's blocks are a layer stored as a diff on top of the generated
  base. New islands are new seeds.
- **Weather** derives from seed + date, with a forecast for tomorrow so nothing
  surprises him. Rain buffs water, storms bring lightning villains, snow slows
  everything.
- **Villain encounters** are generated from the day's weather and biome, with
  stats scaled to the strongest guardian so fights stay winnable.

## Building

Blocks are not decoration. They stack, they form structures, and the
structures change the numbers on the bars, which is the engineer's loop:
build the thing, watch it work.

- **Stacking.** A tile holds up to three blocks. Tapping a tile with a
  block adds one on top; the eraser takes the top one off. Drag to draw
  a straight line of blocks. Undo goes back thirty steps. A hand tool
  pans; every other tool draws, so one finger never does both.
- **Blueprints.** A structure is recognised from the block layer, never
  stored separately. Building it is placing the right stacks in the
  right shape. The drawer shows each blueprint with how many stand, and
  tapping one stamps a ghost plan on the island that he fills in tile by
  tile: a puzzle with one right answer. Finishing one gets a burst.
  - Habitat: a 2 by 2 of wood with roof on top. The kaiju walks to its
    door to sleep and gets +10 rest.
  - Wall: a straight run of three or more double-stone. Villains hit
    walls before anything else.
  - Watchtower: stone, stone, tower on one tile. Each one lowers the
    chance a villain turn breaks anything.
- **Kaiju walk around blocks**, so walls shape paths. Villains walk
  around them too, or smash through when the way round is long (see
  Invasions), so where walls and towers stand is a decision. Later:
  materials gathered from biomes; a builder's book that collects finished
  blueprints like the dex.

## Invasions

One villain a day, made from the seed and the date so the whole family
sees the same one. It exists the moment the island opens, standing on
the beach with a dotted route to its goal, so he can look before he
taps the alarm. It never moves on its own: the walk only happens inside
the fight, one stride per move he makes. No timer, nothing to lose by
waiting.

- **Origin** says where it came from and picks the landing shore: tide
  (west), storm (north), volcano (the shore nearest the mountains), deep
  (south), sky (a random shore). Shown as an icon next to the name.
- **Goal** is what it wants, shown as an icon on the map: the nest, the
  tallest watchtower, a lantern, or a nap spot. If the thing does not
  exist it falls back to the nest.
- **Ability** is one twist, shown as an icon: fog hides move damage
  numbers (no best-move glow), stompy breaks two blocks a turn, sturdy
  has more health, speedy takes longer strides, sleepy skips every other
  turn. Regular villains have fixed origin, goal and ability, so he
  learns them like characters.
- **The walk.** Each fight move, the villain takes a stride of three
  tiles along the cheapest route (blocked tiles cost four, so it walks
  round a short wall and shoves through a long one). A block in its way
  cracks (two for stompy); watchtowers lower that chance. Reaching the
  goal only means it sits down there until it is beaten, so the fight is
  never lost. The alarm button shows the steps left, or a sleeping face
  once it has arrived.
- **Fights last six to eight moves** so the walk matters. Beating the
  villain clears the alarm for the day.

## Family multiplayer (asynchronous)

- **Family is the unit, islands belong to members.** Everyone in a family can
  read everyone's data. Only the owner writes their own island.
- **Visiting** is read-only. A visit writes one small record (guest genome +
  timestamp) into the host's visitors list. Visitors collect a passport stamp.
- **Gifts** are the one write a guest can do: a block, an egg fragment, or a
  sticker at the host's dock.
- **Team fights.** A help flag on a big villain shows a beacon on every family
  map. Each helper sends one kaiju and one move; the villain bar drops the
  moment it is written and is drawn as colored segments per helper. If no one
  helps within a day, a wandering guardian lends a hand. Everyone who helped
  gets the drop.
- **Growing the circle.** A parent can link another family by invite link.
  Kids only ever see portraits a parent approved.
- A single Cloud Function resolves boss fights and pays out rewards so a
  client cannot fake a win. That is the only server code.

Held for later: real-time presence on a shared island, trading.

## Devices

- iPad: full island, building grid, two-panel dex.
- iPhone ("pocket mode"): care, dex, quick battles. Building is view-only or a
  small grid.
- Computer: keyboard and mouse, wide layout.
- **Shared save is non-negotiable.** Firestore with offline persistence so the
  phone works in the car and syncs later.

## Tech

- TypeScript, Vite, Phaser 3, built as a PWA.
- `packages/core`: pure game logic and procedural generation. No rendering,
  deterministic, unit-tested with fixed seeds.
- `apps/web`: Phaser rendering, Firebase, PWA shell.
- Firebase: Firestore for saves, Hosting for the app, Google sign-in for the
  parent (once per device, the kid never sees it). Free tier is plenty.
- Art starts as programmatically drawn vector parts with palette swaps.
  Sprite parts replace them one slot at a time through the manifest
  system in `docs/SPRITES.md`: puppet animation over static parts,
  tint layers instead of per-type sheets, vector fallback for any slot
  without art.

## First playable slice

1. One baby guardian with feed, wash, play, sleep, each moving a bar.
2. A generated island with a snap-to-grid building screen.
3. One villain encounter with two moves and a type advantage.
4. A dex with a few entries, most as silhouettes, with a counter.
5. Sensory settings: reduce motion, quiet mode, volume.
6. Family/member data structure in place from the start.
