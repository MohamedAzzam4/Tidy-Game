# Tidy Tapes — Specification (spec.md) — v3 playtest fixes + art/lighting pilot

**Feature:** 001-tidy-tapes · Cozy cassette-sorting shop · Status: v3 in progress on the v2 build
(branch `tidy-tapes`, commit 76f9e3f — 20/20 autotest green is the baseline, NOT proof the
v3 cases work; every case below is reproduced first, then fixed, then re-tested).

> Spec Kit CLI still not installed; specify → plan → tasks → analyze are manual as in v1/v2.
> Source of requirements: `upload/Tidy-Tapes-v3-Playtest-Fixes.md` + `Tidy-Tapes-Starter-Art-Pack.zip`
> (README.md + scene-layout.json read in full). Do not rebuild the game; iterate the existing
> Phaser 3.90 project. Every checkpoint (including this planning stage) is pushed to GitHub on
> its own branch.

## Baseline (v2, kept)

432-tape board (8 colors × 4 symbols × 2 interchangeable rows), 16 rack units in 3 banks,
hidden misfiles (identical feedback for every accepted placement), five-slot carry tray,
wheel zoom @cursor, Space/right/WASD pan, six skills with 15 s/60 s powers, three repairs,
save v2 + v1 migration choice, Magnetic Tuck on every insertion, Tiny Chime only on explicit
verify/win. File ownership unchanged (see spec.md v2).

## v3 requirements (user stories)

### B1 — Extraction size bug (§1)

Reproduced sequence: loose tape → insert → pull out → drop next to an untouched tape. The
pulled tape rests visibly larger (screenshot evidence: oversized pink tape). Root cause:
`animateInsert` beat 2 tweens `view.face` with `scaleX:{from:1…}` on a 208×144 texture whose
working scale is 0.5 (display 104×72), snapping it to double size; `setScale(1)` then locks it.
Fix requirements: canonical world size per pose (loose face, seated spine, turn), explicit
origin/hit-area restore on extraction, kill stale tweens on transitions, never derive a pose
from the previous sprite's current scale, pickup flourish never persists after release.
Verified: 3 consecutive insert/remove cycles, extraction from a different rack, same sequence
at 2+ zooms, grabbed point stays under the pointer.

### B2 — North bank centering (§2)

North bank (8 units, 2×4) sits at x 420..1500 of a 2800-wide world — visibly northwest with a
large empty right flank. Fix: center the WHOLE bank (bounds incl. rack widths and gaps:
span = 3·280 + 240 = 1080 → x0 = 860, span 860..1940, centered at 1400) between the side
banks; camera start unchanged (no disguising); flanks get scatter zones (usable aisles);
loose tapes stay across the middle. Verified by fit-to-table screenshot with all three banks
visible.

### B3 — 2.5D art + lighting pilot in one playable corner (§3)

Use the uploaded pack: teal-star `loose/turn/spine` atlas frames, one walnut cabinet + its 4
foreground lip frames, walnut tile + rim, brass lamp + glow/shadow layers. Cabinet body
behind tapes, correct lip in front (tape slides behind wood). Keep the gentle slide, motion
strokes, Magnetic Tuck. Pose display sizes stored per-pose (not uniform scaling). Extraction
restores loose pose (ties into B1). Fallback art for all other colors/symbols. Scene lighting:
one soft warm direction, quieter ambient fill, subtle same-facing highlights, darker contact
areas (under tapes/cabinets, overlaps, shelf recesses), restrained world-space falloff around
the lamp, no ray tracing / global orange tint / screen-fixed overlay; HUD outside lighting;
light/shadow pan+zoom with the world. Playable corner inside the current game (chosen: right
bank teal cabinet unit 12 as the walnut, brass lamp upper-left of it, teal-star tapes nearby);
rest of the board intact pending approval. Same-zoom before/after deliverable.

### B4 — Automatic milestones (§4)

- Row complete (one symbol row full of correct color+symbol) → Tiny Chime + brief warm pulse,
  automatic after the completing tape finishes seating. Full-but-misfiled row: nothing.
- Cabinet complete (4 correct rows of one physical unit) → visible achievement banner
  ("Teal Storage Complete") + fuller cozy sound. Same-tape-completes-both → cabinet sound
  only (no layering). Recorded permanently (reload / re-verify / remove-reinsert never
  re-grants). Magnetic Tuck unchanged on every accepted insertion. Audio optional; visible
  feedback when muted.

### B5 — Input scheme (§5)

Left = interaction + pan; right = selection. Left-drag on empty table pans (no Space/mode
toggle; Space+drag and wheel zoom and touch controls preserved). Movement threshold separates
click from drag. Double-left-click a tape loads that ONE tape into the first empty tray slot
(basic, pre-skill, works for loose and removable shelved tapes; tray full → tape stays exactly
where it was + discreet "Tray full"; never moves a selection, never fires twice, never
triggers a skill; different-tape clicks, drags, UI-control clicks don't count). The previous
double-click binding (defective-tape repair-open in v2) is rebinded to unused key `R`
(Match Gather stays on `G`, already key-bound in v2; keys shown in Skills panel + Help,
clickable activation kept; no key-repeat, no trigger while typing). After Marquee Pickup
unlocks, right-button drag on the tabletop draws the selection rectangle (does not pan);
before unlock right-drag does not create a selection (v2 right-drag pan retained);
context menu suppressed for the game canvas only.

### B6 — Skills panel (§6)

Single fixed Skills icon; compact panel with unlock/locked + requirements + active/cooldown
states; close on second click, click outside, or Escape; hiding never stops an active power;
panel controls never pan the table or select tapes beneath; tray separate; the always-visible
bottom strip of skill chips is removed.

### B7 — Repair return (§7)

On repair completion: show the repaired cassette briefly, then animate THE SAME tape from the
repair view to a clearly visible destination (default: marked return spot beside the repair
bench), ~0.6–0.8 s eased travel + settle, camera shows the destination, lands normal-sized
and immediately draggable, no duplication, never saved mid-flight.

### B8 — Pencil rewind rework (§8)

Separate insert / wind / remove. Insert: drag pencil into the hub → clean snap; stays anchored
until deliberate removal; release/pointer-away/hold must not pull it out; inserting does not
wind. Wind: press-hold on seated pencil or hub and move the pointer around the hub — accept
ovals/triangles/sharp corners (angular travel around the hub, wrap-safe, not ring-shape or
fixed-radius); ignore center jitter, stationary holds, short back-and-forth scrubbing; stop on
release and resume later; quiet sound follows actual winding. Remove: double-click the seated
pencil to grab it, then drag outside the hub; double-click alone never ejects; single-click
hold stays "wind". Gesture local to the repair view. Ribbon fully rewound → ready state, pencil
stays until removed; only then the B7 return starts.

### B9 — Hover nudge (§9, pilot corner only)

Moving unpressed cursor brushing a loose tape's edge → topmost eligible tape gets ~1° tilt +
1–2 px visual offset, easing back over 150–220 ms. Display-only (face child sprite): world
position, hitbox, sorting, save untouched. No retrigger when parked / boundary jitter /
same-tape movement (short retrigger guard). Disabled while any button is down, holding or
dragging, panning, selecting, over HUD/repair; not on shelved/carried tapes; no touch synth;
cancel+reset instantly on pickup or input-mode takeover; reduced-motion respected; off/on
comparison toggle (dev cluster). Spatially local (grid hash around the cursor, not 432 tapes
per frame). Board looks still when nothing brushes it.

## Non-goals

No rebuild of the game; no engine/backend change; no full-board reskin (awaiting pilot
approval); no nudge rollout beyond the pilot corner; no ray-traced/dynamic lighting.

## Constraints

- Phaser 3.90.0 pinned; Next.js 16 host; save compatibility with v2 runs (seed regen + state
  reapply + overlap fixup for moved racks); all art from the uploaded ZIP only.
- Checkpoint pushes: `v3-planning` (docs) → `v3-fixes` (B1–B8 green) → `tidy-tapes` (pilot
  B3+B9 + deliverables).
