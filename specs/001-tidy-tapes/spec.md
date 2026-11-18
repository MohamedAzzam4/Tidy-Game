# Tidy Tapes — Specification (spec.md) — v4 full-board art + hover rollout

**Feature:** 001-tidy-tapes · Cozy cassette-sorting shop · Status: v4 full-board rollout on the
v3 build (branch `tidy-tapes`, commit 2982a67 — the §1–§9 playtest-fix build; all v3 systems kept).

> Source of requirements: `upload/Tidy-Tapes-Full-Board-Handoff.zip` (GLM-Full-Board-Update.md,
> Cassette-Layer-Layout.png, layer-layout.json, art/*.svg) + the v3 prompt archive. Repository
> files are the source of truth: inspected project at /home/z/my-project, branch `main`
> (platform-managed) with the game build at 2982a67 (= `tidy-tapes` remote HEAD). No rebuild.

## Baseline (v3, kept — verified before any change)

432 seeded tapes (8 colors × 4 symbols, ≥400 gate), 16 compact rack units in 3 banks, interchangeable
matching rows, hidden misfiles, five-slot carry tray, v3 input scheme (left pan / dbl-click tray /
R repair / right-drag marquee), pose system (explicit loose/turn/spine specs), auto row/cabinet
milestones, repair return flight, pencil rewind, single Skills icon, save v3 (+ v1/v2 migration).
Unit tests 14/14 green. Browser suite: 20/28 on this sandbox — the 8 failures were probed manually
and are **environment artifacts** (headless DPR 1.2 fit-view scaling; synthetic double-click and
hover-sweep timing). Verified working by direct probes: dbl-click→tray (tape → `tray` state),
hover nudge fires for in-region tapes (lastNudgedId set), repair flows open. Baseline is honest:
20/28 automated + manual probes green; the 8 harness flakes are re-aimed in T-updates below.

## v4 requirements (user stories)

### F1 — One cassette template, every tape (§1)

A single reusable template with three poses, replacing rendering for ALL 32 combos, all contexts
(table, tray, insertion, repair return, repair-scene close-up):

- **Loose**: broad labeled face up, parallel to the table; a slender short side visible from the
  shallow three-quarter camera; never upright, never showing the underside. Display footprint stays
  exactly the canonical 104×72 (hit 92×60) — art is fitted, not stretched.
- **Turn**: brief mid-insertion pose (face foreshortening, spine edge rising) — silhouette may
  differ from the old crossfade; insertion timing (90/110/140 ms beats) unchanged.
- **Spine**: narrow edge-on bar behind the cabinet lip at the existing 16×28 slot scale.

Layer model per pose (from layer-layout.json): `shell-color` (neutral, tinted per color) →
`shell-shading` (color-independent gradients: face sheen top→bottom, side darkening) →
`fixed-details` (cream label, reel hubs, dark window, screws, scratches — never tinted) →
`symbol-overlay` (drawn at the pose's label anchor). Shell color and symbol data drive every bake;
the whole-sprite tint of the old teal prototype is retired. Baked/cached per (pose, color, symbol):
32 loose + 32 turn + 32 spine canvas textures at boot — no per-frame recoloring, no runtime mesh.
All current 8 colors and 4 symbols keep working; legibility at normal play zoom.

Hard constraint: **visual replacement only** — world positions, resting footprints, grab anchors,
hitboxes, snap targets, depths, and the existing insertion animation are untouched. Extraction
restores the exact loose size of an untouched tape (pose system already enforces this; the new
textures must not break it — regression-tested).

### F2 — Cabinets, background, repair tools (§2)

- **Cabinets everywhere**: the compact 240×184 body proportions are the reference (visible width,
  height, position, slot centers at the same zoom). The v3 tall portrait pilot cabinet GEOMETRY is
  reverted: unit 12 returns to the standard compact footprint; the right bank returns to the
  uniform 220-pitch spacing (bank membership unchanged). Cabinet counts (16), capacities
  (4 rows × 8 slots), row matching, drop-zone semantics, and bank placement are unchanged. New
  layered art: back/body under tapes, interior recess + dividers, seated spines, foreground lip
  per row (a sliding tape is occluded by the wood). Labels (chips) and counters stay readable and
  keep their positions.
- **Entire background**: the whole tabletop gets the new surface treatment — layered surface
  material (softer, lower-contrast planks), trim, soft ambient lighting, contact shadows under
  every cabinet and tape. The walnut pilot inlay wing, its painted seams, and the artwork boundary
  are REMOVED — no special corner remains. Setting stays the same workbench (no request to change
  it). Lighting is world-space (pan/zoom-stable), warm key + quiet ambient fill so shell colors
  read everywhere, naturally lit even far from the lamp prop; HUD excluded.
- **Repair tools**: placeholder pencil + sticker tool art replaced with textured art sharing the
  cassette materials/shading/edge treatment (handoff references: graphite-tipped pencil, angled
  tweezers). The game's sticker tool is already tweezers — same gesture. The pencil keeps its hub
  anchor behavior; the tweezers keep their working tip; neither repair's play changes. Display
  sizes/origins of the tool sprites are preserved.

### F3 — Hover nudge everywhere (§3)

The pilot-region gate is removed: ALL loose tapes on the board respond to an unpressed, moving
cursor brushing their edge. Only the topmost eligible tape reacts; ~1° tilt + small offset with a
soft ~150–220 ms return, face-child only (world position, hitbox, depth, save untouched). Existing
guards all kept: stationary cursor, same-tape movement, boundary jitter, retrigger guard, any
pressed button, drag/pan/marquee, HUD/repair overlay, shelved/tray tapes, touch, reduced-motion,
reset before pickup. New coverage checks: two widely separated corners nudge; no nudge during a
drag; sweeping a pile does not buzz.

### F4 — Delivery & verification (§4)

Order: baseline verify → shared cassette integration → cabinets + background → hover everywhere →
tool polish as a separate step → regression + screenshots. Working checkpoints committed and
pushed to `tidy-tapes` as they land (user consolidated all checkpoint pushes onto `tidy-tapes`).

Evidence required: full board at fit zoom; ≥2 widely separated areas at normal play zoom; same
rendering across several existing colors and symbols; a cabinet before/after at the same camera
zoom and footprint; insertion and removal with no tape growth; both textured tools in action;
nudge in different corners, off during drag, no pile jitter; old saves load; shelf, tray,
completion, repair interactions intact. Automated and manual checks reported separately.

## Acceptance map

| # | Case | Type |
|---|------|------|
| A1 | Unit tests + browser suite re-run; every v3 green test stays green | automated |
| A2 | Insert/remove ×3 cycles + extraction from another rack at 2 zooms → exact loose size (new art) | automated (existing §1 tests) |
| A3 | Toggle off → legacy look everywhere (before/after comparator preserved) | automated (T13c rewrite) |
| A4 | All 16 cabinets compact geometry: counts/capacities/rows/rowsOfGroup unchanged; slot centers derive from the same constants | automated (unit tests) |
| A5 | Old save (v3 + v2) loads; overlaps resolved (right-bank respace) | automated (phase-2 restore + save tests) |
| A6 | Nudge: fires in ≥2 far-apart corners; silent while pressed/dragging; no pile buzz; display-only | automated (T13d rewrite + manual) |
| A7 | Fit-zoom + 2 close-ups show uniform art, no pilot boundary; ≥4 color/symbol pairs legible | manual screenshots |
| A8 | Cabinet before/after same zoom+footprint; insertion mid-frames; both tools in action | manual screenshots |
| A9 | Milestones, tray, verify, win-block still behave (suite T4/T5/T7/T11 + manual spot checks) | automated + manual |
