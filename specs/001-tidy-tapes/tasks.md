# Tidy Tapes — Tasks (tasks.md)

**Feature:** 001-tidy-tapes · Prerequisites: spec.md + plan.md · Implementation order fixed by
the requester: world/camera → single-tape sorting → 400+ generation → repairs → marquee &
skills → sound, saving, playtesting. Each checkpoint is committed and pushed to branch
`tidy-tapes` immediately.

Legend: `[P]` parallelizable · [P1/P2/P3] user story priority · file paths are exact.

## M0 — Foundations (before gameplay code)

- **T0.1** [P1] Config + RNG + types: `src/game/config.ts`, `src/game/rng.ts`, `src/game/types.ts`
  (8 colors × 8 symbols, world 4400×3000, thresholds 10/20/35/40/120/200, capacities; SplitMix64
  + child seeds). Unit: `src/game/__tests__/rng.test.ts` (determinism, child-seed isolation).
- **T0.2** [P1] Pure world generation + validation: `src/game/worldgen.ts`,
  `src/game/validation.ts`. Unit: `src/game/__tests__/worldgen.test.ts` — 200-seed sweep:
  determinism (gen twice, deep-equal), tapeCount ≥ 400, unique IDs, per-combo demand ≤
  capacity, no inaccessible start (bounds/rack/bench overlap/coverage), defects ∈ 3 types.
- **T0.3** [P] Save model: `src/game/save.ts` + `src/game/__tests__/save.test.ts`
  (roundtrip, corrupted-input guards).

## M1 — World & camera (checkpoint: world)

- **T1.1** [P1] Symbol drawing + texture families: `src/game/symbols.ts`,
  `src/game/textures.ts`, `src/game/scenes/BootScene.ts` (tape faces 184×120 @0.5, spines,
  racks, wood tile, bench mat, props, UI bits).
- **T1.2** [P1] GameScene world + camera + panning: `src/game/scenes/GameScene.ts` —
  tileSprite table, 64 racks with headers/counts, bounds camera, wheel+trackpad, keyboard
  (WASD/arrows, works mid-drag), right/middle-drag pan, two-finger touch pan, zoom +/−.
  Fixture: small-board debug flag `?fixture=tiny` for dev only (never the deliverable).
- **T1.3** [P1] Fixed HUD: `src/game/scenes/UIScene.ts` — name, seed, real counters
  (Shelved X/N, loose, repairs left), Pan/Select toggle, zoom buttons, help panel, toasts.
- **T1.4** [P1] Mount: `src/components/GameMount.tsx`, `src/app/page.tsx` (client-only,
  full viewport, destroy on unmount).
- **Check:** run in browser, pan world, HUD fixed. Push checkpoint.

## M2 — Single-tape sorting (checkpoint: sorting)

- **T2.1** [P1] `src/game/controllers/DragController.ts` — grab offset + per-frame
  `camera.getWorldPoint` recompute (pan/zoom/resize-safe), pickup pop (no lag), depth raise,
  hover slot preview (matching rack only), drop routing (insert / invalid / bench).
- **T2.2** [P1] Insert presentation: face→edge turn, slide tween, settle tick, slot
  occupancy, counter updates, unlock milestones hooks, completion panel.
- **Check:** drag a tape across racks mid-pan; insert; counters. Push checkpoint.

## M3 — Full 400+ generation (checkpoint: 400)

- **T3.1** [P1] Wire `worldgen` into GameScene New Game (seeded; ?seed= replay; different seed
  per New Game), pile scatter rendering with separation pass, real starting total in HUD.
- **T3.2** [P1] `src/game/debug.ts` — window.__tidy API (counts, state, camera, seed helpers).
- **Check:** 410 tapes live, autotest T1/T2 green. Push checkpoint.

## M4 — Repairs (checkpoint: repairs)

- **T4.1** [P1] `src/game/scenes/RepairScene.ts` — overlay, big cassette, cancel; bench drop +
  double-click entry; defective tapes refuse shelving with hint.
- **T4.2** [P1] Rewind minigame (pencil circular strokes, ribbon transfer, threshold).
- **T4.3** [P1] Sticker swap (peel drag-off, residue rub, same-symbol sticker place + press).
- **T4.4** [P1] Paint touch-up (marker rub over faded patch, RenderTexture erase, coverage).
- **Check:** all three repairs complete via simulated gestures; tape returns to sorting.
  Push checkpoint.

## M5 — Skills, marquee, powers (checkpoint: skills)

- **T5.1** [P1] `src/game/controllers/SkillsController.ts` — milestones, toasts, chips state.
- **T5.2** [P1] Defect Scanner + Misplaced Finder (toggles; never highlight correct).
- **T5.3** [P1] Slot Guide (select tape → rack/slot highlight or edge arrow).
- **T5.4** [P1] Marquee Pickup (cap 5; pre-unlock gesture = pan only; group carry; batch drop
  with partial capacity + visible leftovers; touch Select mode).
- **T5.5** [P1] Match Scan + Match Gather powers (15 s / 60 s, edge indicators, gather excludes
  shelved & unrepaired, expiry preserves held).
- **Check:** autotest T7/T8/T11 green. Push checkpoint.

## M6 — Sound & saving (checkpoint: sound+save)

- **T6.1** [P1] `src/game/audio.ts` — buses, limiter, variation, ducking; wire all events
  (glide/tick/thud/pickup/repair/ unlock/completion). No sound on hover or invalid drop.
- **T6.2** [P1] Save/restore: autosave, reload restore, New Game confirm, seed replay.
- **Check:** autotest T5/T10 green. Push checkpoint.

## M7 — Verification & delivery (checkpoint: final)

- **T7.1** [P1] `src/game/autotest.ts` — full scripted suite (T1–T14 + touch sim) via real
  DOM PointerEvents; results surfaced on page + read by agent-browser.
- **T7.2** [P1] agent-browser E2E: boot, exercise verbs, screenshots (2 distant regions,
  repair close-up, HUD), dev.log cross-check; fix and re-run until green.
- **T7.3** [P] `bun run lint` clean; unit tests green; final push; delivery notes with
  tested/not-tested honesty list.
