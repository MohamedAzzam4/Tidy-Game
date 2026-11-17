# Tidy Tapes — Review note (analyze step, manual)

**Feature:** 001-tidy-tapes · Reviewer: build agent · Date: 2026-11-17 (UTC+8)

## Process honesty

- Spec Kit CLI (`specify`) is **not installed** in this sandbox (`which specify` → empty).
  The constitution/specify/plan/tasks/analyze steps were therefore followed **manually** in
  `spec.md`, `plan.md`, `tasks.md` and this review note. **No slash command ran and none is
  claimed to have run.**
- All 9 external reference skill documents (Spec Kit README + quickstart, Ponytail SKILL.md,
  Phaser-2D-game, create-game-assets, procedural-gen, game-feel, audio-design, game-playtest)
  were fetched and their rules folded into the plan. One transient failure (ponytail 503)
  succeeded on retry; `github.github.com/spec-kit/quickstart/` 404s (wrong domain) — the real
  quickstart at `github.github.io/spec-kit/quickstart.html` was used.
- Ponytail applied: no physics engine, no backend, no external assets/deps beyond pinned
  Phaser; built-in Phaser features (camera, tweens, textures, scenes); smallest solution per
  acceptance criterion (synthesized audio instead of files, canvas texture families instead of
  400 unique images, one repair overlay scene for three minigames).

## Cross-check: spec ↔ plan ↔ tasks

Every P1–P3 story maps to tasks and to an acceptance check (table in plan.md). Specific
contradictions found and resolved before implementation:

1. **Marquee vs camera pan gesture conflict** — resolved: left-drag on empty table pans the
   camera *before* Marquee Pickup unlocks (so the gesture can never batch-pick early); after
   unlock the same gesture becomes the marquee and panning stays available via keyboard,
   wheel, right/middle-drag; touch uses an explicit Pan/Select mode toggle plus two-finger pan.
   Spec (US6.4), plan (Marquee algorithm), tasks (T5.4) now all state this identically.
2. **"Misplaced Finder" ambiguity** — spec now states: highlights loose tapes and wrong-slot
   tapes; already-correct tapes are never highlighted. (Wrong-slot tapes cannot occur through
   normal play since insertion only accepts matching racks — the highlighter still covers the
   case for robustness.)
3. **Repair entry points** — initially bench-only; spec now also allows double-click /
   two-tap to open a repair in place (bench drop stays, for the cozy bench moment and for
   touch parity).
4. **Zoom added → extra drag-math requirement** — accepted: per-frame
   `camera.getWorldPoint` makes drag zoom-safe by construction; autotest re-checks grab-point
   at zoom 0.7 (plan acceptance table row updated).
5. **"Enough slots" validation semantics** — defined as: per-combo demand (loose + held +
   shelved) ≤ rack capacity (8); generation constructs demand ≤ 7, validator re-checks and a
   200-seed sweep gates it.
6. **Power expiry vs held bundle** — all three docs now state expiry/cooldown only affect the
   power, never the held bundle.
7. **Batch overflow** — single rule everywhere: insert compatible tapes up to free slots,
   leftovers land visibly below the rack (or stay held); never destroyed, never duplicated.
8. **Dev fixture** — `?fixture=tiny` small board allowed as internal development fixture only;
   the default New Game always generates 410 (≥400) tapes in the same world (requester's rule).

No missing requirement was found after re-reading the requester's message against spec.md
(400+ tapes, both-axes scrollable world, camera not webpage scrolling, seed handling,
validation guarantees, grab-point rule, hover preview, edge-on storage, glide sound timing,
stagger, invalid-drop safety, three specific repairs with exact gesture descriptions, six
skills with exact semantics, 15 s/60 s power windows, save/restore scope, real counters,
no fail state, screenshots, playtest reporting).

## Verification plan reminder

Tests must actually run (unit + in-page autotest + agent-browser E2E); failures fixed and
retested before delivery. Honest reporting: simulated (synthetic DOM events) vs real-device
checks will be separated in the final report; audio loudness cannot be *audibly* verified
headless and will be reported as parameter-verified only.
