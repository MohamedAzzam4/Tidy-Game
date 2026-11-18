# Tidy Tapes — Tasks (tasks.md) — v3

**Feature:** 001-tidy-tapes · Prerequisites: spec.md v3 + plan.md v3. Checkpoints pushed on
their own branches: `v3-planning` (docs) → `v3-fixes` (B1,B2,B4–B8 + tests) → `tidy-tapes`
(final with B3 pilot + B9 nudge + deliverables).

## M14 — v3 planning (checkpoint: v3-planning)

- **T14.1** Reproduce/inspect all reported issues on the current build; read art pack README +
  scene-layout.json in full; write spec/plan/tasks/review v3. Push `v3-planning`.

## M15 — Gameplay/layout fixes on existing art (checkpoint: v3-fixes)

- **T15.1 (B1)** `poses.ts`: canonical pose sizes (loose/seated/turn, fallback + pilot art),
  `setLoosePose/setSeatedPose`, kill tweens on transitions, origin/hit restore; rewrite
  insert turn tween with computed scales; extraction + tray-out restore. Tests: 3× cycle,
  different rack, 2 zooms, grab point, size equality vs untouched tape.
- **T15.2 (B2)** `BACK.x0 = 860`; flank scatter zones; worldgen tests re-run; fit-to-table
  view check; bank bounds centered between side banks.
- **T15.3 (B4)** Milestones: edge-triggered row completion (fire at animation end) → Tiny
  Chime + warm pulse; cabinet completion → banner + fuller sound (cabinet-only when both);
  achievements persisted; reload/reinsert no re-grant; muted → visible feedback.
- **T15.4 (B5)** Input rework: threshold arming; left-drag pan; right-drag marquee (post
  unlock); double-click tray shortcut (one tape, first empty slot, full-refuse keeps tape,
  no skill/firing/duplication); deferred single-click dispatch; `R` rebind for repair-open;
  key-repeat/typing guards; Skills panel + Help show keys.
- **T15.5 (B6)** Skills icon + compact panel; close (icon/outside/Escape); no table
  interaction beneath; chips strip removed; pointerOverUI updated.
- **T15.6 (B7)** Repair return: marked return spot beside bench; 0.6–0.8 s eased flight +
  settle; camera shows destination; lands normal-sized, draggable, single instance; save
  after landing.
- **T15.7 (B8)** Pencil rewind: insert (drag→snap, stays), wind (press-hold, angular travel,
  wrap/deadband/scrub handling, resumable, sound follows progress), remove (double-click +
  drag out), ready state; tests incl. oval + triangle paths, stationary hold, release/resume,
  removal.
- **T15.8** autotest v3 regression suite + debug probes; unit tests updated; lint. Push
  `v3-fixes`.

## M16 — Art + lighting pilot (checkpoint: tidy-tapes)

- **T16.1 (B3)** Copy pack to `public/tidy-art/`; load atlas pairs + SVGs; walnut cabinet +
  4 foreground lips at scene-layout offsets; slot centers from existing count across the
  usable span; teal-star loose/turn/spine poses with per-pose display sizes + anchors;
  walnut inlay surface patch + rim; brass lamp + pool + halo; ambient + world-space falloff;
  contact shadows; HUD above lighting; art toggle for before/after.
- **T16.2 (B9)** Hover nudge in the pilot corner (face-child tween, guards, cancel/reset,
  toggle, reduced motion); local grid hash.
- **T16.3** Deliverables: fit-to-table shot; same-zoom before/after; hover off/on; clips
  (shelf/cabinet milestone, repair return) if recordable; README v3 notes; final push to
  `tidy-tapes`.
