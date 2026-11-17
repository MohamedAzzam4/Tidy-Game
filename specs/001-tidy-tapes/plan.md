# Tidy Tapes — Implementation Plan (plan.md) — v2 follow-up

**Feature:** 001-tidy-tapes · Prerequisites: spec.md v2 reviewed · Same pinned stack as v1.

## Stack (pinned, unchanged)

Phaser 3.90.0 in Next.js 16 + TS host; procedural canvas textures; WebAudio synthesis;
localStorage persistence; vitest unit tests + `?autotest=1` DOM-event harness + agent-browser
E2E. No new dependencies.

## v2 architecture deltas (what changes from v1, what stays)

**Stays:** scene/controller split, pure worldgen + validation + save modules, rng, symbols,
repair overlay scene (refined, not rewritten), audio engine (renamed/retargeted events),
debug API, autotest harness style, GameMount.

**Changes:**

1. **Geometry & groups** (`config.ts`, `types.ts`, `worldgen.ts`, `validation.ts`):
   8 colors × 4 symbols = 32 groups. Rack UNIT = wooden 4-row tray; each row = 8 slots,
   labeled (color chip + symbol); 16 units total; every group's TWO rows live in two
   different units (no per-tape assignment; validity = row-label match). World 2800×1800.
   Banks: back (2×4 units), left (1×4), right (1×4); repair bench front-left; center +
   corridors densely scattered (pile centers include the center region; clearance pads
   around units/bench). Tape count per group = round(16 × fill), fill seeded 0.7–1.0, plus
   top-up until total ≥ 405; validation adds a center-population check and re-checks
   demand ≤ capacity and grabbability.
2. **2.5D look** (`textures.ts`, GameScene rendering): logical ground = view 1:1 (no global
   projection transform needed — reference is axis-aligned; identity keeps v1's proven
   camera/drag math). Angle comes from baked art: extruded darker front/side faces + rim
   highlights on racks/props/labels, contact shadows on tapes/props, layered rack sprites
   (unit body → seated spines → per-unit slot-lip foreground). Depth = base y everywhere.
   Seated spine = narrow vertical bar (color + symbol stripe). Loose face texture gains
   baked contact shadow + bottom-right edge darkening.
3. **Camera** (`GameScene`): wheel = zoom (0.6–2.0, clamped bounds, centered on cursor);
   Space+drag, right/middle-drag, WASD pan; buttons + / − / fit; touch one-finger pan on
   empty, two-finger pinch (zoom+pan); keys +/-/Q/E kept. Pan still works mid-drag.
4. **Tray** (new tray module in UIScene + DragController hooks): 5 slots, screen-fixed
   bottom-right, collapsible; world-tape drop → load; slot drag-out → world drag; tray drag
   onto rack → staggered batch of what fits; tray full → gentle refuse; tray tapes rendered
   as mini spine+face chips (color+symbol identifiable). Marquee group can load into free
   slots; extras stay on the table. Saved/restored.
5. **Hidden correctness** (`DragController`, GameScene): drop routing accepts ANY row with a
   free slot (defective rewind/sticker tapes still refuse with the defect hint — visible
   damage, not a correctness leak; paint defect is cosmetic and fileable). Hover preview
   highlights the nearest free slot identically for all tapes. Insertion data commits
   immediately; `t.state='shelved'`, `t.row=rowId`. Pull-out: grab a seated spine → unshelve
   → held. Win check = every tape shelved AND row-label match; on last-loose-filed with
   misfiles → one generic toast (no location), repeated at most once per occurrence. Rack
   count text = occupancy only.
6. **Skills v2** (`SkillsController`): scanner (spot damaged, toggle), guide (click tape →
   both matching rows highlighted + offscreen arrows), misfile finder (reveal misfiled
   seated tapes — POWER 15 s/60 s), marquee (unlock gesture + group move/tray-load),
   matchScan (highlight same color+symbol + offscreen arrows — POWER 15/60), matchGather
   (one-click load of matching loose tapes into free tray slots only — instant, 60 s
   cooldown). Power state machine v1 reused; timings/config knobs in config.ts. Slot
   guide/misfile/matchScan never reveal before activation.
7. **Insertion presentation** (`DragController` + fx): release → align tween over the
   selected opening (~90 ms) → face→spine turn (~110 ms) → slide (~140 ms) under the unit's
   lip layer (leading edge occluded) → settle pop + tuck sound; total ≈ 260–300 ms; batches
   stagger ≈ 110 ms. Two short curved cream strokes behind the sliding tape (one pair at a
   time, fade before settle). `audio.play('tuck')` at slide start, `tuk` exactly at seat.
8. **Audio policy** (`audio.ts`): tuck = descending shff + tuk-at-seat (was glide+tick;
   retuned, peak-controlled, batch ducking kept). `chime` reserved for verify/win ONLY —
   removed from power activation and repair finish (repair finish → soft 'press' blip).
   Sound-check buttons in help panel: Tuck single / Tuck batch of 5 / Tiny chime.
   Everything else (pickup/place/invalid-when-tray-full/peel/wipe/press/squeak) unchanged.
9. **Verify affordance** (UIScene + GameScene): each rack unit's count badge is clickable
   ("check"): fully-correct unit → tiny chime + toast; else gentle "not quite" (that unit
   only, player asked). Win (job complete) → chime + complete panel.
10. **Save v2** (`save.ts`, `types.ts`): version 2, rows not combo-racks, tray serialized,
    skill/power state, migration guard: v1 save detected → panel "fresh bench (keep
    skills)" vs "discard"; no silent migration. `?seed=` replay kept.
11. **Tests** (`__tests__`, `autotest.ts`, `debug.ts`): unit tests updated to 32-combo
    world + new invariants (center density, two-row groups, capacity math). Autotest
    rewritten around the new acceptance list (below). Debug API extended: tray(), rows(),
    misfiles(), verify(unit), zoomAt, pullOut(id), insertTape(id,row) test helpers.

## Implementation order (user-fixed) + checkpoints (push after each)

1. Board & rack layout (config/worldgen/validation/textures/GameScene visuals) — push.
2. Angle, camera, pointer accuracy + slot occlusion proof on ONE rack → screenshot before
   rolling out → full-board screenshot — push.
3. Storage, tray, skills, win logic — push.
4. Motion, sound, repair polish — push.
5. Tests, E2E, screenshots, delivery notes — final push.

## Acceptance-test mapping v2

| Requirement | Check |
| --- | --- |
| ≥400 real tapes, 32 groups, 2 matching rows, demand ≤ capacity, center populated | unit 200-seed sweep + validation; autotest T1/T2 |
| Busy board: center + corridors populated, clearance around racks/bench | validation center check + screenshots |
| 2.5D angle: extruded faces, contact shadows, upright HUD; occlusion via lips | screenshots (wide + close-up) + VLM inspection |
| Wheel zoom cursor-centered + bounds; +/−/fit buttons; pinch; Space-drag pan; pan mid-drag | autotest T3 (grab point through pan/zoom/resize), T-zoom |
| Grab-point exactness (edge/center grabs, zoom levels, after resize) | autotest T3/T14 |
| Insertion: align→turn→slide-under-lip, 200–300 ms, stagger, strokes, tuck timing | autotest T5 + audio scheduling asserts |
| Any-slot acceptance, no tell (no hint/sound difference for misfile) | autotest T-misfile (asserts no 'hint' event, same sfx set) |
| Pull-out + re-file; leftovers visible; no loss/duplication (cancel/repair/reload/expiry) | autotest T4/T10 + invariants |
| Tray: 5 slots, load/remove/batch, partial fit, full-refuse, back-to-table | autotest T-tray |
| Marquee unlock, group move, load-into-tray with extras left | autotest T7/T8 |
| Skills: scanner/guide-dual-row/misfile-reveal/matchScan/matchGather-tray + 15/60 timers | autotest T11 |
| Win = matches (full+misfiled ≠ win; generic message; verify → chime) | autotest T12/T-verify |
| Repairs refined (rewind 1-action, sticker peel–wipe–press, optional paint) | autotest T9 + screenshot |
| Save v2 + v1-migration choice | autotest T10 + manual |
| Touch: one-finger pan, pinch, select mode | autotest T-touch (simulated) |

## Risks / limits (honest)

- Audio cannot be *heard* headless: verified via scheduling/parameter asserts + audition UI.
- Touch verified via simulated PointerEvents only.
- VLM screenshot inspection is advisory; final human-eye pass is the user's preview.
