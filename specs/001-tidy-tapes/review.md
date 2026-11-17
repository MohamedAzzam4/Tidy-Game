# Tidy Tapes — Review note (analyze step, manual) — v2 follow-up

**Feature:** 001-tidy-tapes · Reviewer: build agent · Date: 2026-11-18 (UTC+8)

## Process honesty

- Spec Kit CLI (`specify`) remains **not installed**; v2 spec/plan/tasks + this review are
  manual (same as v1). No slash command ran; none claimed.
- Reference skills: Spec Kit workflow applied manually; Ponytail applied to the v2 design
  (see below); a visual pass runs against the attached reference image via the VLM skill;
  regression pass uses agent-browser (installed). The sandbox skills `pdf`/`docx`/`charts`
  etc. are irrelevant here; the fullstack-dev skill's agent-browser self-verification rule
  is followed.
- Reference image analyzed (VLM): axis-aligned cozy top-down, thin extruded front edges,
  rim highlights, contact shadows, multi-row slotted trays, edge-on book-style spines,
  icon-labeled rows, high clutter. v1 baseline screenshot confirmed the reported problems
  (flat, tiny spread racks, empty middle).

## Ponytail check — smallest working change per requirement

- **No global projection matrix.** The reference is axis-aligned; baking the 2.5D into
  sprites (extrusions, lips, shadows) achieves the look with zero coordinate-transform
  risk and keeps v1's proven camera/drag math (identity ground mapping). The spec's "if a
  shallow projection helps" clause is satisfied by choosing the identity + baked art path.
- Rework, not rewrite: worldgen/validation/textures are regenerated (geometry genuinely
  changed), but scenes/controllers/save/audio/repair keep their v1 structure and proven
  event flows; no engine/backend/asset changes; no new dependencies.

## Conflicting-input resolution (cross-checked spec ↔ plan ↔ tasks)

1. **Wheel: v1 pans, v2 zooms.** Zoom wins (explicit v2 instruction); pan remains via
   Space+drag, right/middle-drag, WASD, touch. Help text updated so no verb is lost.
2. **"Matching rows" ambiguity** → resolved as: row = one labeled 8-slot row; each group's
   two rows live in two different rack units in different banks; validity is row-label
   equality (no per-tape assignment). Win, Slot Guide (both rows), and generator all use
   the same rule. The "two identical racks" phrase maps to these two rows.
3. **Hidden correctness vs defect refusal.** Misfiles must be silent; defective rewind/
   sticker tapes still refuse with the damage hint (visible defect state, not a correctness
   leak — the tape's own damage is public information). Paint defect becomes optional/
   cosmetic so nothing blocks filing invisibly.
4. **Chime policy conflicts in v1** (chime fired on power activation and repair finish) →
   retargeted: power activation → no sound, repair finish → soft press blip, chime reserved
   for verify + win only.
5. **Tray vs Marquee cap.** Marquee group carry (v1, cap 5) and tray (5 slots) coexist:
   marquee selection can be dropped onto the tray (loads what fits) or carried as a bundle;
   tray batch drop inserts only what fits. A full tray never accepts more — single rule in
   both DragController and tray code.
6. **Win on "fully occupied"** — win requires zero loose tapes AND every seated tape's
   group matching its row label; physical capacity is guaranteed (total ≤ 32×16 slots);
   misfiles are always correctable by pull-out, so the board is always solvable.
7. **Save migration** — v1 save is never silently migrated (combo model changed 64→32);
   the player chooses "fresh bench, keep unlocked skills" or discard. Progress (skill
   unlocks) is stored separately from layout state, satisfying "separate the new-layout
   option from the player's old progress".
8. **Coordinate drift** — one coordinate model only: logical ground = camera world space
   (identity); all hit-testing (tapes, rows, tray-in-screen-space, marquee) converts
   through `camera.getWorldPoint` and the tray's screen rect; grab-point rule unchanged
   from v1 (proven by autotest through pan/zoom/resize).
9. **Camera zoom-at-cursor with clamp** — implemented as zoom then scroll-correction so the
   cursor world point stays fixed, then Phaser bounds clamp (edges win over cursor, per
   "when not limited by the board edge").

## Verification plan reminder

Unit sweep + in-page autotest + agent-browser E2E with screenshots must actually run;
failures fixed and retested. Honest final report: simulated vs real-device checks
separated; audio verified by parameters (headless cannot hear); VLM screenshot inspection
is advisory.
