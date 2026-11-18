# Tidy Tapes — Review note (analyze step, manual) — v3

**Feature:** 001-tidy-tapes · Reviewer: build agent · Date: 2026-11-18 (UTC+8)

## Process honesty

- Spec Kit CLI still not installed (as in v1/v2); v3 spec/plan/tasks + this review are manual.
- Art pack extracted and README.md + scene-layout.json read in full before planning. The
  reference mockups are visual targets only (never loaded as textures).
- The v2 "20/20" result is treated as a baseline, not proof: every v3 case is reproduced on
  the current build first (e.g. the oversized-after-unshelving tape confirmed by code reading:
  the insert tween's `scaleX:{from:1}` on a 208×144 face texture working at 0.5 scale).

## Ponytail check — smallest working change per requirement

- B1 solved by a pose module + tween math fix, not a rearchitecture of drag/drop.
- B2 is one constant (all geometry derives from `unitPos`), not a camera trick.
- B3/B9 confined to one corner with a reversible toggle; no engine or map replacement.
- B4 is an edge-triggered checker hooked at the existing insert-complete beat.
- B5 keeps the v2 pointer pipeline and adds threshold arming + a click-deferral window.
- B6–B8 are localized to UIScene / GameScene.onRepairClosed / RepairScene.rewind.

## Conflicting-input resolution (spec ↔ playtest doc ↔ v2 behavior)

1. **Right-drag semantics.** v2 pans with right-drag; v3 §5 makes right-drag the marquee after
   unlock and says "it does not pan". Resolution: after unlock → marquee only; before unlock →
   right-drag pans (v2 control preserved, no selection possible, satisfying "must not create a
   selection").
2. **The "skill that currently uses double-click".** In v2 no *skill* is double-click-bound;
   the double-click gesture is the defective-tape repair opener. It is the affected binding:
   rebinded to `R` (unused; G already = Match Gather as the doc prefers), old binding removed,
   Help/panel updated, bench drag-in kept as the second repair route.
3. **Double-click vs power clicks.** A tape click while Match Gather is armed must not be
   swallowed by the tray shortcut and vice versa. Resolution: single-click actions are
   deferred ~240 ms; the second click of a double-click cancels them, so a double-click never
   triggers a skill, and skills still fire on deliberate single clicks.
4. **Milestone chime vs verify-only chime (v2).** The doc explicitly changes the rule at the
   milestone level: Tiny Chime now also fires automatically on correct row/cabinet completion;
   individual right/wrong insertion stays silent. Misfiled-full rows stay silent by design.
5. **Walnut cabinet vs map preservation.** One side-bank unit is respaced to host the taller
   walnut cabinet (logical row ids/capacities/groups unchanged; row 48 = teal star row either
   way; saves keep working via the overlap fixup). This is the minimal honest integration of
   "one playable corner" — the alternative (squeezing the 835×1252 art into 240×184) would
   distort the art, which the README forbids.
6. **Table surface.** Full-board walnut reskin would violate "keep the rest of the board
   intact"; a bounded walnut inlay patch around the pilot corner uses the pack's surface/trim
   without reskinning the table.
7. **Seated spine sizes differ between cabinets** (fallback 16×28 vs walnut-row seat geometry)
   — accepted per §1's "separate visual size for a seated spine" and README's "store each
   pose's intended display dimensions explicitly".
8. **Row/cabinet milestone + hidden correctness.** The pulse/chime only confirms fully-correct
   rows, which is a deliberate leak at milestone granularity requested by the doc; individual
   placements remain feedback-identical.

## Verification plan reminder

Every fix reproduced → implemented → re-tested through real input paths (synthetic DOM events
through Phaser + agent-browser E2E on the dev server); audio asserts are event-level (headless
cannot hear); screenshots re-inspected visually; honest final report separates tested /
asserted / not-tested.
