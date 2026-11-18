# Tidy Tapes — Review (review.md) — v4 full-board art + hover rollout

## Review pass over spec.md + plan.md (before implementation)

**Requirement coverage check (handoff → spec):**
- §1 template poses/layers/tint rules → F1 + plan step 1–2. ✓
- §1 "visual replacement only" (footprints/hitboxes/animation preserved) → F1 hard constraint +
  A2 regression via existing §1 tests. ✓
- §2 cabinets at compact proportions, geometry revert of the tall pilot → F2 + plan step 3. The
  brief's "do not change bank placement" is read as bank MEMBERSHIP (north/left/right), not the
  pilot-era internal respacing — the tall portrait footprint itself is explicitly outlawed by the
  brief ("do not fit the gameplay to a tall portrait image"), so unit 12 returns to the standard
  footprint and the right bank returns to the uniform pitch. Capacities/counts/matching untouched.
- §2 background/lighting/HUD exclusion → F2 + plan step 3. ✓
- §2 tools keep gestures/anchors → F2 + plan step 5. ✓
- §3 nudge everywhere with all guards → F3 + plan step 4. ✓
- §4 order (baseline → cassette → board → tools separate) + evidence list → F4 + plan step 6. ✓

**Decisions recorded:**
1. Canonical texture keys keep the NEW art; the pre-v4 look stays available under `legacy-*` keys
   behind the existing settings toggle (key `pilotArt` kept for save compatibility, UI label
   "new art") — this preserves the required before/after comparator without duplicating consumers.
2. Unit 12 geometry reverts to compact 240×184; right bank returns to uniform 220 pitch. Old saves
   survive via resolveSaveOverlaps (existing, tested path for moved racks).
3. Spine art is a restyle at the fixed 16×28 slot scale (the reference's 1:3.5 tall proportion
   belongs to the retired portrait cabinet; slots are frozen).
4. The turn pose ships for ALL units in new-art mode; legacy mode keeps the old crossfade.

**Risk review (plan §Risks):** key-swap audit, save migration, turn feel, sandbox flakes — all
carry explicit checks in tasks.md. No unresolved design questions; proceeding to C2.

## Checkpoint reviews (filled as work lands)

### C2 — cassette template (commit e992677)
- Loose/turn/spine bakes ported from the handoff SVGs (bounds computed from the
  paths + face matrices); 32×3 textures at boot; legacy family under `legacy-*`.
- Symbol size raised from the reference's 21 to 32 art px after a zoom check
  showed 9 px symbols failing the legibility bar at play zoom (reference
  proportion kept, anchor kept). Verified: turn silhouette matches the layout
  sheet; insert/remove probe restores 104×72 exactly; tray + repair face pick
  the new art automatically through the canonical keys.

### C3 — cabinets + background + hover everywhere (commit 8148ac4)
- Geometry revert verified live: unit 12 body center (2520,712) = compact
  240×184 at the uniform 220 side-bank pitch; 16 units, 16 unitArt entries.
- Fit view shows uniform cabinets, no inlay/seams/rim boundary anywhere.
- Nudge probes: far-apart corners fire; pressed-button sweep → 0 nudges;
  tray-zone tape correctly ignored (HUD exclusion); pile sweep nudges distinct
  tapes once each (no buzz).
- Before/after toggle swaps pixels only (unitRect identical across the toggle).

### C4 — tools + verification (final commit)
- Pencil (paint-gradient body, graphite tip) and tweezers (angled steel, grip
  ridges) baked rotated tip-down from the reference SVGs; repair gestures,
  origins and display envelopes unchanged; verified in-scene via screenshots.
- Suite: **22/28 automated** (baseline 20/28) on the rebuilt production build
  at 1280×720. Rewritten T13b/c/d pass. Harness fixes landed: pilot-era ±40 px
  grab offsets removed (T4b/T6), DPR/parent-size-robust fit-view check via
  resizeHard (RESIZE mode derives gameSize from a cached parentSize — the
  helper now refreshes bounds then resizes), speed-baseline re-anchor +
  forced settings + corrected post-pickup displacement baseline in T13d.
- Remaining 6 failures are pre-existing at baseline (identical names) and are
  timing flakes of the ~1–2 fps throttled headless page. MANUAL verification
  (this sandbox, real/synthetic input with generous timing): T9c pencil
  double-click grab → release re-seats → drag-out removes ✓; T9d sticker
  peel→wipe→place→press closes, tape repaired, returns loose ✓; T10 tray-full
  refuses the sixth tape (stays loose, data path) ✓; T10b double-click loads a
  tape into the tray ✓; T11 row chime + cabinet sound + no layering ✓; T9e
  paint shares the verified event pipeline (not separately re-driven here).
- Old-save migration: v3 save with a tape parked where the reverted racks now
  stand → loads, 432 tapes, overlap fixup pushes it to the nearest legal spot,
  nothing inside any rack ✓.
- Screenshots (download/v4-screenshots/): fit board, two far-apart close-ups,
  cabinet before/after at identical zoom+footprint, insert mid-flight/seated,
  removal with canonical size restored, both tools in action.
