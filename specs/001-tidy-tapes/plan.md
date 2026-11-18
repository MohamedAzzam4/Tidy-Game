# Tidy Tapes — Implementation Plan (plan.md) — v4 full-board art + hover rollout

## Architecture: what changes and what must not

The game is a Phaser 3.90 scene app. All rendering is procedural CanvasTexture bakes at boot
(`src/game/textures.ts`), selected through an explicit pose system (`src/game/poses.ts`) with a
runtime legacy/new art toggle (`artState.pilotArt`, persisted in save settings — key kept for save
compatibility, UI label becomes "new art"). Canonical texture keys (`tape-face-N`, `spine-N`,
`tool-*`, `unit-body`…) always hold the CURRENT (new) art so every existing consumer (spawn,
repair close-up, defect overlays, tray) renders the new look with zero call-site changes; the
previous look is rebuilt under `legacy-*` keys and selected only when the toggle is off.

```
textures.ts (bakes)          poses.ts (explicit specs)         scenes
┌────────────────────┐      ┌──────────────────────┐      ┌──────────────────┐
│ cassetteArt.ts NEW  │ ───▶ │ looseSpec/turnSpec/  │ ───▶ │ GameScene spawn/ │
│  3 poses × 32 combo │      │ spineSpec (toggle)   │      │ insert/tray/return│
│  unit-body/unit-lips│      │ geometry UNCHANGED:  │      │ RepairScene face/ │
│  wood, tools        │      │ 104×72 / 16×28 / hit │      │ tools             │
└────────────────────┘      └──────────────────────┘      └──────────────────┘
```

## Step 1 — Cassette template (`src/game/cassetteArt.ts`, new)

Port the handoff SVG geometry (layer-layout.json + art/*.svg read in full) to canvas draws:

- Pose space → bake space: compute each pose's art bounds from the SVG paths and transforms
  (loose: face rect 238×132 rx12 under `matrix(1,.036,-.15,1,43,43)` + right side polygon;
  turn: face under `matrix(.51,.21,-.060,.89,70,26)` + side polygon + side paper strip;
  spine: reference geometry adapted to the fixed 16×28 slot scale with its exact styling —
  rounded shell, side shading, caps, cream label band, symbol anchor).
- Bake per combo at 2× display scale into canonical keys:
  - `tape-face-{combo}` 208×144 @2x (loose fitted into 104×72, centered, footprint preserved)
  - `tape-turn-{combo}` ~164×176 @2x (display ≈ 82×88; silhouette from the reference)
  - `spine-{combo}` 32×56 @2x (reference styling at slot scale, symbol legible)
- Layer order per bake: shell (currentColor = combo color) → shading gradients (faceLight
  top→bottom white sheen / sideLight brown darkening — gradients defined in local path space) →
  fixed details (paper #fff0cb→#e3bf88, window #17191b→#3d302b, hubs + spokes, screws, scratches,
  track lines) → symbol overlay via the existing `drawSymbol` (star/heart/moon/bolt) at the
  reference anchors (loose face-local (119,33) s21; turn face anchor + pose-space (201,122) s13).
- Contact shadow stays baked into the loose face (offset down-right, soft).
- textures.ts: old `buildTapeFace`/`buildSpine` re-keyed to `legacy-tape-face-N`/`legacy-spine-N`;
  new bake module writes the canonical keys; both run at boot.

## Step 2 — Pose system globalizes (`src/game/poses.ts`)

- `looseSpec`: artState.pilotArt ? canonical keys : legacy keys — same 104×72 / origin [.5,.5] /
  LOOSE_HIT 92×60 in BOTH modes (footprint, anchors, hitboxes identical; only pixels swap).
- `spineSpec`: both modes 16×28 origin [.5,.5]; pilot-atlas branches deleted.
- `turnSpec`: new-art mode returns the turn pose for EVERY combo (not pilot-only); legacy mode
  returns null (the old crossfade runs). DragController drops its `isPilotUnit` turn gate and the
  pilot spine-standoff special case — one code path for all 16 units.
- ART_PILOT combo/unit references removed from poses; `isPilotUnit` deleted from config.

## Step 3 — Geometry revert + cabinets + background (`config.ts`, `textures.ts`, `GameScene.ts`)

- config.ts: `unitPos` right bank uniform (x 2400, y0 620, dy 220 — same rhythm as the left bank);
  `rowRect`/`slotPos`/`unitRect` lose their pilot branches; ART_PILOT shrinks to a lighting/props
  const block (lamp rect stays — worldgen/save use it as a spawn obstacle). RIGHT_TOPS deleted.
  Old v3 saves restore through the existing `resolveSaveOverlaps` (built for moved racks).
- textures.ts: `unit-body`/`unit-lips` re-keyed `legacy-unit-body`/`legacy-unit-lips`; new bakes
  at the same 480×368 @2x with the SAME channel/slot constants (ROW_CH_TOP 30 / ROW_PITCH 36 /
  ROW_CH_H 30 / chX 82..452 / 8 slots): walnut body, recessed channels with depth gradients,
  north walls, divider caps, extruded front face, softer palette, rim light. `wood` re-keyed
  `legacy-wood`; new `wood` tile: same plank structure, lower contrast, warmer fill.
- GameScene: `buildPilotSurface` (inlay + seams + rim) DELETED; `buildFallbackUnit` becomes the
  single `buildUnit` (toggle picks body/lips texture; pilot unit branch removed); soft contact
  shadow image under every cabinet; `buildLighting` rebuilt board-wide (ambient fill kept; warm
  falloff broadened ~3400×2600 from the lamp; gentle far vignette; lamp pool/halo kept; all
  world-space at the existing light depth, HUD untouched).
- UIScene: dev toggle label "pilot art" → "new art"; help copy loses the pilot-corner wording.

## Step 4 — Hover nudge everywhere (`nudge.ts`)

- rebuild(): hash ALL loose tapes (region filter deleted); onPointerMove: region gate deleted.
  Everything else unchanged (guards, topmost-pick, face-child tween, reset paths, tests'
  introspection counters).

## Step 5 — Repair tools (`textures.ts`, keys unchanged)

- `tool-pencil`: graphite pencil in the reference paint gradient (#ffd66d→#eea943→#bc6f32),
  wood-body facets, ferrule, graphite tip — drawn tip-down to keep the scene's origin (0.5,1)
  convention and ~17×58 display.
- `tool-tweezers`: angled steel tweezers (reference form) tip-down, same display envelope.
- RepairScene: zero logic changes (keys, origins, gesture code untouched). Paint tool (marker)
  keeps its existing art + tint path.

## Step 6 — Tests, screenshots, delivery

- autotest.ts: T13c rewritten (full-board toggle: canonical textures for any combo; legacy keys
  when off; geometry identical across the toggle; turn pose exists for all combos). T13b made
  viewport-robust (assert from the actual camera rect instead of hard-coded pixels). T13d retargeted
  (any loose tape; sweep conversion uses the harness world→screen helper) + a second corner case.
  Harness double-click/repair drivers get slightly longer settle windows (sandbox headless timing).
- Manual probes replace the 8 environment-flaked assertions where the harness cannot see them
  (dbl-click tray, repair closes, tray-full toast) — recorded in the delivery report.
- Screenshots to download/: fit-zoom board, two far-apart normal-zoom areas, cabinet before/after
  (same zoom + footprint), insert/remove frames, both tools in action, nudge corners.
- README updated; checkpoints pushed to `tidy-tapes` after: (1) planning, (2) cassette template,
  (3) cabinets+background+nudge, (4) tools+tests+delivery.

## Risks & mitigations

- **Texture key swap breaks a consumer** → grep-audit every `tape-face-`/`spine-`/`unit-body`/
  `tool-` reference before/after; both families always exist so any missed branch still renders.
- **Geometry revert invalidates old saves** → resolveSaveOverlaps already re-seats overlaps;
  phase-2 restore test + manual load of a pre-revert save.
- **Turn silhouette changes the insert feel** → timing beats untouched; the turn is a 110 ms
  transient; screenshot the mid-frames; knob (display size) tunable without touching logic.
- **Suite flakes in this sandbox** → environment artifacts documented with manual probes; suite
  assertions re-aimed only where the harness itself was wrong (viewport/DPR math).
