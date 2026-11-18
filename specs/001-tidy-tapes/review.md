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

### C2 — cassette template
- (pending)

### C3 — cabinets + background + hover
- (pending)

### C4 — tools + verification
- (pending)
