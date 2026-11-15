# Cozy Corner — a tiny tidying game (level 1 prototype)

A one-level browser prototype of a cozy PC tidying game, built with
**Vite + vanilla TypeScript + SVG** (no React, no game engine, no runtime
dependencies). Someone just moved in: an open box spilled 12 belongings
across the floor. Drag each one to its logical home and watch the room
transform.

![Completed room](docs/screenshot-complete.png)

## Run it

```bash
npm install
npm run dev        # dev server → http://localhost:3000
```

Other commands:

```bash
npm test           # Vitest: game-rule + level-data tests (20 tests)
npm run build      # typecheck (tsc --noEmit) + production build to dist/
npm run preview    # serve the production build → http://localhost:4173
```

Optional end-to-end check (real pointer drags in headless Chromium;
requires `playwright` + its Chromium browser):

```bash
node scripts/e2e.cjs                              # against the dev server
BASE_URL=http://localhost:4173/ node scripts/e2e.cjs   # against the build
```

## How to play

- **Drag** any of the 12 scattered items with the mouse (Pointer Events).
- While dragging, a compatible **free slot shows a ghost outline** and the
  matching zone shows its name. Release near it (there is a forgiving snap
  radius) and the item settles with a small animation.
- Release anywhere else (or press **Escape**) and the item returns to where
  it was. Nothing is ever lost or duplicated.
- Items in the same category fit **any free slot** in their zone — no hidden
  order. Placed items can be picked up again.
- The HUD shows progress (`7 / 12`), a **Reset** button and a sound toggle.
  Placing everything triggers a warm completion moment ("Home, at last.").

## Where things live

| Path | Responsibility |
| --- | --- |
| `src/level/house.level.ts` | **The level.** Room dimensions, furniture, the 12 items with start poses, the 5 destination zones with slot anchors. Edit this file to change the room layout or placements. |
| `src/view/assets.ts` | Asset catalog: self-authored SVG builders for every furniture piece and item type, keyed by asset id + variant. Only needed when you add a *new kind* of prop. |
| `src/game/model.ts` | Pure game rules: slot occupancy, drop validation (`wrong-category`, `slot-occupied`, …), progress, completion. No DOM imports. |
| `src/game/types.ts` | Shared level/model types and the room coordinate system. |
| `src/view/projection.ts` | The one shared isometric projection (±30° axes, vertical walls) used by floor, walls, furniture, items and slot ghosts alike. |
| `src/view/scene.ts` | Builds the layered SVG room from the level data. |
| `src/view/gameView.ts` | Rendering + input: pointer → room coordinates, dragging, ghost previews, settle animations, HUD, completion FX. |
| `src/view/audio.ts` | Tiny synthesized sounds (WebAudio, local, mutable). |

**Adding a 4th book + shelf slot:** add a slot with a new id to
`zoneBookshelf` in `src/level/house.level.ts`, add a `book-d` item, done —
the required-placement total comes from `items.length`, never a constant.

## Architecture notes

- **Model/view split.** The view asks the model whether a drop is valid
  (`findDropTarget`, `drop`); it never invents rules. Elevated slots are
  matched against their *approach point* (anchor shifted by the difference
  between carry height and slot height) so wall racks feel natural to aim at.
- **True isometric.** The camera looks into the open front corner of a
  10 × 8 room; floor axes slope +30°/−30°, wall edges stay vertical, no
  perspective. `toScreen`/`toFloor` invert each other, so drag-and-drop
  stays accurate at any window size.
- **Painter's algorithm.** Furniture and items are drawn back-to-front by
  `x + y` (plus small per-furniture `sortBias` tweaks from the level data).

## Assets

All artwork is **original, hand-written SVG** in `src/view/assets.ts`
(furniture, items, room shell). No external or hotlinked assets are used,
so there is no third-party license to track. Sounds are synthesized at
runtime with WebAudio.

## Checks performed

- `npm test` — 20 Vitest tests: correct drops, wrong categories, occupied
  slots, any-free-slot placement, re-moving placed items, cancel/restore,
  reset, completion, drop-radius behavior, plus level-data sanity
  (counts, unique ids, bounds, completability).
- `npm run build` — strict TypeScript + production bundle (~12.5 kB gzipped JS).
- Browser playthrough (Playwright, real mouse drags — `scripts/e2e.cjs`):
  wrong-zone drop returns the item; ghost preview appears; all 12 items
  placed through actual drags; completion card shows; Reset restores the
  scattered state; a drag after resizing the viewport still lands correctly;
  no console errors.

## Limitations

- Single level, no persistence, no gamepad/keyboard-only dragging
  (Escape cancels, but items are mouse/touch-driven).
- Painter's-algorithm sorting uses anchor depth, so an item dragged exactly
  behind a tall prop can momentarily overlap oddly; the level keeps the
  scatter area clear of tall props.
- The audio is intentionally minimal (pickup/place/complete blips) and is
  off until the first interaction (browser autoplay rules).
