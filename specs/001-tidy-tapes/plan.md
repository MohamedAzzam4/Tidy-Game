# Tidy Tapes — Implementation Plan (plan.md)

**Feature:** 001-tidy-tapes · Prerequisites: spec.md reviewed · Stack lives here (per Spec Kit:
spec = what/why, plan = how/tech).

## Stack (pinned)

- **Phaser 3.90.0** (pinned in package.json; no custom engine, no physics plugin) — camera,
  scenes, input, tweens, textures.
- Host: **Next.js 16 + TypeScript 5** (App Router, `/` route only, port 3000, client-only game
  canvas mounted by `src/components/GameMount.tsx` with `dynamic(..., { ssr: false })`).
- All art: procedural canvas textures generated in `BootScene` (no image files, no fonts beyond
  system stacks). One cassette body design reused as families: 8 shell palettes × 8 symbol
  drawings × label variants (asset-skill discipline: approve one hero look, swap palettes, keep
  text code-native).
- All audio: `AudioEngine` on raw WebAudio (noise/osc synthesis, buses, ±1 semitone / ±2 dB
  variation, polyphony cap, DynamicsCompressor limiter). No audio files.
- Persistence: localStorage (`tidy-tapes-save-v1`), untrusted-input validated on load.
- Tests: **vitest** unit tests for pure logic + an in-page `?autotest=1` harness driving real
  DOM PointerEvents through Phaser's input pipeline, read out via the `window.__tidy` debug API;
  **agent-browser** headless runs for E2E + screenshots.

## Architecture (thin scenes, systems own truth)

```
src/game/
  config.ts        sizes, colors, symbols, thresholds, world dims (single source)
  rng.ts           SplitMix64 + child seeds (deterministic, version-stable)
  types.ts         TapeState, Combo, DefectType, SaveFile …
  worldgen.ts      pure: generateWorld(seed) -> WorldData (tapes, racks, piles)
  validation.ts    pure: validateWorld(WorldData) -> {ok, issues[]} (trust boundary)
  save.ts          pure serialize/deserialize + localStorage adapter w/ guards
  audio.ts         AudioEngine (buses: master<-sfx, variation, ducking, limiter)
  symbols.ts       canvas path drawing for 8 symbols (used by faces, spines, racks, UI)
  textures.ts      BootScene texture factory: tape faces, spines, racks, wood, props, bench
  scenes/
    BootScene.ts   builds all textures, then launches Game + UI scenes
    GameScene.ts   world, camera, input verbs; delegates to controllers; renders state
    UIScene.ts     fixed HUD: counters, seed, skill chips, mode toggle, zoom, help, toasts
    RepairScene.ts overlay minigames (rewind / sticker / paint) driven by pointer gestures
  controllers/
    DragController.ts   cursor-accurate drag, held bundle, hover slot preview, drop routing
    SkillsController.ts unlock milestones, toggles, marquee, powers, timers, highlights
  debug.ts        window.__tidy (counts, state, camera, helpers used by autotest)
  autotest.ts     ?autotest=1 scripted acceptance run (dispatches real DOM events)
src/components/GameMount.tsx  'use client' React wrapper (creates/destroys Phaser.Game)
src/app/page.tsx             full-viewport mount
src/game/__tests__/          vitest: rng determinism, worldgen sweep, validation, save roundtrip
```

State of truth = plain TS data (`WorldData` + `SessionState` in GameScene registry); sprites are
disposable views; one integration boundary: scenes read state, emit input actions into
controllers. No gameplay rules inside `update()`.

## World model

- World 4400×3000; viewport ~1200×700 (camera bounds = world; starts showing one corner).
- 64 racks (8 shell colors × 8 symbols), grid 8×8 (col = symbol, row = color), spacing
  (420, 250), origin (640, 560). Rack = wooden card-file box: 8 edge-on slots (capacity 8) +
  header strip with color chip + printed symbol + live count text.
- 410 tapes (seed-varied 405–415; always ≥ 400): per-combo demand base 6 + extras (max 7) ≤
  capacity 8. ~11% defective (exactly one defect each). Loose tapes scattered in 16–18 pile
  regions + strays, face-up, random slight rotation, depth by stacking; separation pass
  guarantees no full coverage and no overlap with rack/bench footprints or bounds.
- Repair bench mat on the left margin; decorative props at world corners (non-blocking).

## Key algorithms

- **Drag:** on pickup store `grabOffset = worldPoint − tape.pos`; every `update()`:
  `pos = camera.getWorldPoint(pointer.x, pointer.y) − grabOffset` (zoom/pan-safe by construction).
  Held bundle: lead tape obeys the rule; others follow at fixed readable offsets.
- **Insert:** release on matching rack → tween face→edge (rotate+squash, swap to spine) → slide
  into slot (sine ease ~180 ms), glide sound at slide start, quiet tick at settle; batches
  stagger 90 ms; incompatible leftovers fan onto the table below the rack (visible, valid).
- **Marquee:** left-drag on empty table (after unlock; Pan/Select mode on touch) → world-space
  rect; release → up to 5 nearest loose tapes selected; before unlock the gesture pans.
- **Powers:** state machine ready→active(15 s)→cooldown(60 s)→ready; expiry preserves held bundle.
- **Save:** debounce 600 ms + on visibilitychange/beforeunload; deserialize with schema guard.

## Acceptance-test mapping (each major requirement → check)

| Requirement | Check |
| --- | --- |
| 400+ tapes, unique IDs, enough slots, no inaccessible | unit: 200-seed sweep + validation; autotest T1/T2 (incl. extra seeds) |
| Scrollable world, camera-only view, pan while dragging | autotest T1/T3b; screenshots of two distant regions |
| Grab-point under cursor incl. camera move / zoom / resize | autotest T3 (pan mid-drag), T3-zoom (0.7), T14 (resize) |
| Insert snap/slide/sound timing, stagger, no hover/invalid sound | autotest T5 + audio param asserts (scheduling/gain) |
| Invalid drop / cancel never loses or duplicates | autotest T4 + invariant checks |
| Batch: 5 held, 3 free slots → 3 in, 2 remain visible | autotest T8 |
| Repairs: 3 minigames, retention, sorting reflection | autotest T9 (+screenshot of repair close-up) |
| Skills unlocks + toggles + marquee pre/post unlock | autotest T7/T8/T11 |
| Powers 15 s/60 s, expiry keeps held tapes | autotest T11 |
| Save/reload restores positions, repairs, shelves, unlocks | autotest T10 (real reload) |
| Completion state | autotest T12 |
| Touch input (pan gesture, select mode) | autotest T-touch (simulated) |
| Visual: 2 distant regions + repair close-up | agent-browser screenshots |

## Performance

- 400+ sprites + 64 racks + tileSprite wood: single draw per sprite, texture cache per combo
  (≈64 face + 64 spine + 64 rack + variants), `roundPixels` on, no per-frame texture creation.
- Autoplay-safe audio (resume on first gesture); degrade silently if WebAudio unavailable.

## Risks / limits (honest)

- Headless browser can't *hear* audio or real touchscreens: sound verified by parameter/
  scheduling asserts + manual-listen note; touch verified via simulated PointerEvents only.
- agent-browser availability to be confirmed at playtest time (fallback: Playwright if installed).
- GitHub push via user-supplied PAT; token stored outside the repo, never committed.
