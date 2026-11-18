# Tidy Tapes — Plan (plan.md) — v3

**Feature:** 001-tidy-tapes · Baseline: v2 (76f9e3f) · Order fixed by requester:
first gameplay/layout/input/repair fixes (B1, B2, B4–B8) with existing art → checkpoint;
then the one-corner art + lighting pilot (B3) in that corner; last the hover nudge (B9) in
the same corner; return the playable pilot for review before any wider rollout.

## Approach (Ponytail: smallest working change per fix)

- **B1** new `poses.ts` (≈120 lines): every tape view gets explicit pose sizes (loose face
  104×72, seated spine, turn pose), `setLoosePose/setSeatedPose`, tween-kill on transition,
  hit-area reset. `DragController` insert tween rewritten with computed scale targets instead
  of `from:1`; `pullOut`/tray-out route through the helpers. No camera/drop logic touched.
- **B2** one constant: `BACK.x0 420→860` (+ worldgen flank scatter zones + validation unchanged
  because all geometry derives from `unitPos`). Camera start/fit untouched.
- **B3** config-driven `ART_PILOT` block + walnut rendering alongside fallback units;
  `slotPos/rowRect/unitRect` divert for the pilot unit; atlas frames + SVG lighting layers
  from `public/tidy-art/`; scene-wide ambient/falloff (restrained) + corner pool/halo/contact
  shadow. Art toggle for same-zoom before/after.
- **B4** edge-triggered row/cabinet completion state in GameScene (fire after the completing
  tape's insert animation ends); cabinet achievements persisted in save v3; new `cabinet`
  sfx + banner event; chime policy otherwise untouched.
- **B5** DragController pointer state machine: threshold arming for tape drags, left-drag pan
  on empty table, right-drag marquee (post-unlock; pan before), double-click detection with
  deferred single-click dispatch (240 ms, canceled by the second click), tray shortcut +
  "Tray full" discreet hint, `R` rebind for repair-open, repeat/typing guards.
- **B6** UIScene: chips strip removed; Skills icon + compact panel (registry `uiPanelRects`
  consumed by `GameScene.pointerOverUI`); Escape closes.
- **B7** GameScene `onRepairClosed` → return flight (bench start → marked return spot,
  0.7 s ease + settle, camera `pan()` if destination offscreen, save after landing).
- **B8** RepairScene rewind state machine: pencil `tray/held/seated` states, snap-on-release,
  signed wrap-safe angular accumulation with deadband + center-jitter gate, ratchet sound
  gated on real progress, double-click+drag removal, ready state → removal closes repair.
- **B9** nudge.ts: grid hash of pilot-region loose tapes; pointermove edge-crossing trigger;
  face-child-only tween (position/rotation), per-tape retrigger guard, instant cancel/reset
  on takeover; toggle + reduced-motion.

## Risks / mitigations

- Mixed new/fallback art inside the walnut cabinet (only teal-star frames exist) — accepted by
  the requester ("Keep old art as the fallback for other colors and symbols"); before/after
  shots show both.
- Input semantic change can regress v2 autotests — suite updated to v3 semantics (left-drag
  pans; marquee now right-drag), all v2 invariants re-tested.
- Save compat: v2 key accepted (seed regen + reapply + overlap push-out for the moved banks);
  v3 key separate; achievements/settings added.
- Lighting must not tint the HUD (separate scene) nor become an orange wash (restrained
  alphas, ADD only for lamp-local layers).

## Verification plan

Unit tests (bun) + `?autotest=1` harness extended with the v3 regression list (B1–B9 cases
from the playtest doc, including the handoff list: double-click with empty/full tray and after
the old binding unlock; hotkey triggers the skill only when allowed; play-through with normal
synthetic input, not debug shortcuts). agent-browser E2E + screenshots (fit-to-table, pilot
before/after, hover off/on) + Playwright video clips where the sandbox allows. Honest report:
what was actually tested vs asserted-by-code; sound events distinguished from sound quality.
