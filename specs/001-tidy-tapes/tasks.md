# Tidy Tapes — Tasks (tasks.md) — v2 follow-up

**Feature:** 001-tidy-tapes · Prerequisites: spec.md v2 + plan.md v2. Order fixed by the
requester: board/rack layout → angle, camera, pointer → storage, tray, skills → motion,
sound, repair polish → prove & deliver. Every checkpoint is committed and pushed to branch
`tidy-tapes` immediately (script `scripts/push_checkpoint.sh`).

## M8 — v2 planning (checkpoint: plan-v2)

- **T8.0** Baseline screenshot + file-ownership map (done: `download/baseline-v1-wide.png`,
  list in spec.md). Update spec/plan/tasks/review for v2. Push.

## M9 — Board & rack layout (checkpoint: board-v2)

- **T9.1** `config.ts`: SYMBOLS → 4 (star/heart/moon/bolt), GROUP_COUNT 32, ROWS_PER_GROUP
  2, SLOTS_PER_ROW 8, unit/bank geometry (UNIT_W/H, ROW_H, SLOT pitch, label), WORLD
  2800×1800, fill knobs (GROUP_FILL_MIN/MAX, TOTAL_MIN 405), ZOOM 0.6–2.0, POWER_* kept,
  INSERT_* knobs (ALIGN/TURN/SLIDE ms, STAGGER_MS), SAVE_KEY v2, skill thresholds.
- **T9.2** `types.ts` + `worldgen.ts`: RackUnit/Row model (rowId 0..63, row → unit+group),
  tape count per group from combined capacity + top-up, center-inclusive scatter zones
  (units/bench obstacles, clearance pads), clusters+singles, defect assignment (~11%,
  rewind/sticker blocking, paint cosmetic). Unit: `__tests__/worldgen.test.ts` updated:
  determinism, ≥400, demand ≤ 16 per group, group rows in different units, center density,
  no inaccessible starts, defects valid.
- **T9.3** `validation.ts`: same sweep + center-population + two-row-group checks; keep
  grabbability/coverage checks. Unit: `__tests__` 200-seed sweep green.
- **T9.4** `textures.ts`: unit body (extruded front/side faces, rim light, label strip,
  slot channels, readable empty slots), per-unit lip overlay texture, v2 face (contact
  shadow + edge darkening baked), v2 spine (18×30 bar, color + symbol stripe + cap), tray
  chips, wood/props/bench refresh (angled, busier), stroke 'fx' dot.
- **T9.5** GameScene visual build: banks from config, layered unit sprites + lips, labels,
  occupancy text, props placement, initial camera.
- **Check:** board renders, lint, unit tests green. Push.

## M10 — Angle, camera, pointer (checkpoint: camera-v2)

- **T10.1** Wheel zoom cursor-centered (clamped to bounds), +/−/fit buttons, Space+drag
  pan, pinch zoom+pan, keyboard kept; pan usable while holding (v1 rule preserved).
- **T10.2** DragController: any-row hover preview (nearest free slot, same for every tape),
  pull-out of seated tapes, drop routing v2 (any row w/ free slot; bench; table; tray).
- **T10.3** Insert path with lip occlusion on ONE rack: align → turn → slide under lip →
  seat + settle; prove with a focused screenshot (angle, drag alignment, occlusion, spine
  visible), then roll out board-wide. Wide-board screenshot.
- **Check:** autotest grab-point cases still pass (adapted). Push.

## M11 — Storage, tray, skills, win (checkpoint: tray-skills-v2)

- **T11.1** Tray (UIScene + DragController): 5 slots, load/remove/drag-out, batch drop,
  partial fit, full-refuse, collapse toggle, mini chips with color+symbol.
- **T11.2** Marquee → group move + load into free tray slots (extras stay put, fit shown).
- **T11.3** SkillsController v2: scanner, guide (dual-row + offscreen arrows), misfile
  reveal as 15/60 power, matchScan 15/60, matchGather → tray (instant, 60 s cooldown);
  timer HUD; unlock toasts; no pre-activation reveals.
- **T11.4** Win logic: occupancy vs match; generic not-done message; verify affordance
  (unit badge click → chime only when fully correct); completion panel.
- **T11.5** Save v2 + v1 detection + choice panel (keep skills / discard); tray persisted.
- **Check:** autotest tray/skills/win suites green. Push.

## M12 — Motion, sound, repair polish (checkpoint: feel-v2)

- **T12.1** Insertion fx: motion strokes (one pair at a time), tuned timings, stagger;
  Magnetic Tuck (shff + tuk-at-seat) with variation + batch peak control; remove chime
  from power-activate/repair-finish; sound-check audition buttons in help panel.
- **T12.2** RepairScene: keep flows; paint defect = optional cosmetic (fileable);
  finish sound → soft press blip; text tweaks.
- **T12.3** Help/controls text update (wheel zoom, Space-drag, tray, verify, misfiles).
- **Check:** audio param asserts; autotest T5/T9. Push.

## M13 — Prove & deliver (checkpoint: final-v2)

- **T13.1** `debug.ts` + `autotest.ts` v2 rewrite (full acceptance list incl. misfile
  no-tell, pull-out, tray, timers, win-block, verify-chime, touch sim).
- **T13.2** agent-browser E2E: fresh seed 400+, pan+zoom while holding, 5-batch into
  partially filled row, misfile-accept → reveal → correct, full+misfiled no-win, tuck vs
  chime policy, screenshots: wide board (center populated), close-up edge-on storage,
  repair close-up. Fix and re-run until green.
- **T13.3** `bun run lint` clean; unit tests green; README delivery notes (controls,
  tape count, tested/not-tested); final push.
