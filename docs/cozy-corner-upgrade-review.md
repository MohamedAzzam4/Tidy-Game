# Cozy Corner Upgrade 1 — Consolidated EGM Review

**Target:** `docs/cozy-corner-upgrade-plan.md` (596 lines) and the linked ticket store (`docs/tickets/tickets.json`, CC-001…CC-017)
**Workflow:** Elephant-Goldfish Model `egm-review`, preset **`uninterrupted`** (consolidated report with all review rubrics; no checkpoints, no remediation applied)
**Semantic split:** `## Detailed Implementation Plan` discovered at line 281 → FeatureRange 1–280, DetailedRange 281–596
**Review date:** 2026-11-15 · **Basline evidence:** commit `39d9079`, working tree otherwise clean except planning artifacts + this review's `docs/review/` stage reports

---

## Reviewer status

All reviewers ran in **fresh contexts with no planning conversation** (fresh-context subagents; general-purpose agents that read the canonical persona file first, per the harness fallback documented in `docs/harnesses.md`). No reviewer failed; none was retried.

| Stage | Reviewer | Scope | Status |
| --- | --- | --- | --- |
| 5 — Initial Zoom Out | `egm-zoom-out` | full file | completed |
| 5 — Initial Zoom Out | `egm-inventive-catalyst` | full file | completed |
| 6 — Comprehension Test | `egm-comprehension` | full file, document alone (no context) | completed |
| 7 — Critic Review | `egm-design` | FeatureRange 1–280 | completed |
| 7 — Critic Review | `egm-structural` | FeatureRange 1–280 | completed |
| 7 — Critic Review | `egm-style` | FeatureRange 1–280 | completed |
| 8 — Intermediate Zoom Out | `egm-zoom-out` (fresh instance) | full file + stage 5–7 reports | completed |
| 9 — Implementation Readiness | `egm-implementation-readiness` | DetailedRange 281–596 + ticket records | completed |
| 9 — Implementation Readiness | `egm-codebase-details` | DetailedRange 281–596 + full source audit | completed |
| 9 — Implementation Readiness | `egm-style` | DetailedRange 281–596 | completed |

Raw stage reports (unmodified reviewer output, evidence-cited): `docs/review/zoom_out_report.md`, `docs/review/comprehension_report.md`, `docs/review/critic_report.md`, `docs/review/intermediate_zoom_out_report.md`, `docs/review/implementation_readiness_report.md`. This file is the consolidated deliverable (named per the document owner's instruction instead of the default `consolidated_review_report.md`).

**Method note:** every reviewer was given the current repo files as evidence (README, ticket store, all 17 ticket records, `src/game/*`, `src/level/*`, `src/view/*`, both test files, `scripts/e2e.cjs`, `scripts/tickets.cjs`) and instructed to verify claims against the code, not the planner's assertions. Spot-checks of all Blocker-grade evidence were independently re-verified by the Elephant before consolidation. No plan or ticket file was edited during the review.

---

## Verdict: **Ready after fixes**

The plan's architecture survives review unchanged in shape: pure model + data-driven level + single projector + layered SVG view; no engine, no physics system, no premature rotation (verified by two independent zoom-out passes). The fact base (§2) is accurate against the code; the ticket graph is machine-verified as a faithful DAG of the plan; the test plan and browser-test discipline (real pointer drags, read-only hook) are sound and preserved.

The plan is **not implementable as written**. Three Blockers and ~19 Majors must be folded into the plan text and ticket contracts first. One Blocker (**C-1**) is a product-rule contradiction that **requires your decision** — it cannot be fixed without amending an accepted decision (D2) or the win rule (D3). The remaining Blockers and all Majors are planner-resolvable contract amendments (pending your approval of the revision round; nothing has been edited). No finding threatens the stack guarantee, the fixed isometric view, or the no-hint/no-rotation scope.

**This review is not permission to code.** Implementation stays stopped until you separately ask for it, per your instruction.

---

## Part A — Consolidated findings

Severity: 🔴 Blocker · 🟡 Major · 🟢 Nit. "Disposition" separates what the planner can fix from what needs your decision. Ticket IDs are the owning tickets; §-numbers are plan sections.

### 🔴 Blockers

**C-1 — The win rule is unsatisfiable under the recorded shelf-clean decision; the plan states the collection rule in two incompatible forms.**
- **Sources:** design critic (B1), implementation-readiness (B1), comprehension (F1) — three independent reviewers, three stages. Elephant re-verified against plan lines 138–152, 224–225, 375–385, 430–431 and `docs/tickets/CC-007.md` prose vs contract bullets.
- **Evidence:** R2 (§3) and D2 (§5) define completion as four same-color books on one tier **and "the rest of that shelf holds nothing else"**; D2's consequence: "One clean collection per shelf at a time." CC-007's prose and its acceptance bullet ("4 green on a tier + unrelated item elsewhere on the same shelf: green NOT complete") encode the same per-shelf poison. But §8.4 ("precisely") and CC-013's solver contract ("each color set on its own clean tier") switch to a per-tier predicate: shelf-wide no-non-books, each non-empty tier single-collection. With D5's single bookshelf, the per-shelf reading caps simultaneous completions at one, so D3's win (all 3 collections **currently** complete) is **never reachable** — the game is unwinnable, CC-016's full-playthrough-to-card test and CC-013's solver are unsatisfiable, and CC-007's implementer cannot know which predicate to code.
- **Affected:** §3 R2, §5 D2/D3/D5, §8.4, §8.13; CC-007, CC-013, CC-016; epic CC-001 acceptance 2/3.
- **Correction:** needs your decision first (see Part D, Q1). Whichever way you rule, the plan must carry one formulation everywhere (R2 = D2 = §8.4 = CC-007 prose + contracts), CC-007 gains a named test for **two (and three) collections simultaneously complete** plus its inverse, and CC-013's solver target arrangement must match. Also merge §8.4's redundant bullets 1/4 ("zero non-book occupants" vs "no foreign item including non-book items") into one unambiguous clause.
- **Disposition: needs your approval (amends accepted decision D2 or D3).**

**C-2 — The contracted surface-aiming convention mechanically rejects every visually-aimed elevated drop; R1's flagship example is unimplementable as written.**
- **Sources:** implementation-readiness (B2), design critic (M2), codebase-details (#5), stage-8 zoom-out (directive verdict 2).
- **Evidence:** §8.3 maps the pointer "through the floor plane" and settles at `(x, y, topZ)`. In this projection the floor-projection of a surface point `(px, py, topZ)` is `(px − topZ, py − topZ)` (verified: sin30° = 0.5). For the counter (topZ 0.96, bounds y 0.02–0.70) a cursor on the visible top face floor-maps to y ∈ [−0.94, −0.26] → `out-of-bounds` on every honest drop; the ghost renders ~0.96 units above the cursor. Bench (0.50) and shelf tiers (0.68) lose their front halves. The slot path already solves this via carry-height compensation (`model.ts:147-148`); the plan keeps it for slots only. Compounding it, `findSurfaceAt`'s contract (`topZ ≤ carryZ + tol`, CC-004) excludes the counter (0.88–0.96), all bookshelf tiers (0.68–1.88) and the linen upper tier (1.33) at the documented carry height LIFT 0.55 (`gameView.ts:14`) — the exact targets R1 requires.
- **Affected:** §8.2 (findSurfaceAt), §8.3 steps 1–4; CC-004, CC-005, CC-006 (slice acceptance), CC-016.
- **Correction (planner-resolvable):** pin the surface-plane aiming convention — map the pointer through the hovered surface's plane (equivalently shift the floor-projected point by `(+topZ, +topZ)`, generalizing the existing slot compensation) and use that point for `validateSurfaceDrop`, ghost placement, the committed `DropTarget.surface.{x,y}` and the settle anchor. Add the concrete acceptance: "drag onto the visual center of the counter top → item lands within ε of the aimed surface point," plus specify `clientFromWorld(x, y, topZ)` round-trips for CC-016. (Existing `dragTo` aims at the projected surface point — under today's text the planned test cannot even be implemented.)
- **Disposition: planner-resolvable (no product choice; mechanical geometry fix).**

**C-3 — "Pinned against the asset builders" footprint values contradict the builders; the upright-book value is 2× off and load-bearing.**
- **Sources:** codebase-details (#1 Blocker, #3), style-9 (#1), design critic (N1), stage-5 zoom-out (#6). Elephant re-verified `assets.ts:407` (upright book box spans x −0.1…0.1 = 0.20), `assets.ts:449–451` (cushion 0.41, not 0.45 — 0.45 is the ghost outline), `assets.ts:462–495` (shoe pair ≈ 0.30 × 0.48, no z extrusion, so "height 0.10" has no basis).
- **Evidence:** §8.1 pins "book upright 0.10 × t × h" while the builder draws 0.20 wide; the flat book is quoted as full extent (0.20 × 0.32), so the table is internally inconsistent with CC-002's own "full ground footprint centered on anchor" definition. A half-width registry weakens the ε=0.01 overlap check (two 0.20-wide upright books 0.15 apart pass as non-overlapping) and mis-feeds the 16-slot capacity math. A6 repeats the wrong value.
- **Affected:** §6 A6, §8.1; CC-002, CC-003, CC-004 (footprint inputs), CC-012 (art).
- **Correction (planner-resolvable, default = data follows art):** re-pin to builder-measured values (upright 0.20 × t × h; cushion 0.41 × 0.41; shoe per drawn profile — e.g. 0.30 × 0.37 with height from drawn layers or registered as a low profile) and restate the convention ("dx = full ground extent"). Capacity note: 0.20-wide upright books still fit the 0.30 slot spacing (0.10 gap), so D5's 16-slot layout is unaffected. If you prefer slimmer books, that is an art change owned by CC-012 — say so (see Part D, Q3).
- **Disposition: planner-resolvable (default chosen; art-vs-data direction flagged for your confirmation).**

### 🟡 Majors

**C-4 — Surface topZ values quote slab undersides, not walkable tops; A9's clearance default is wrong over the counter.**
Counter ≈0.88 → drawn countertop top face **0.96** (`assets.ts:318`); bench ≈0.40 → **0.50** (`assets.ts:245`); stool ≈0.42 → **0.49** (`assets.ts:338`). Each exceeds CC-003's own ±0.05 gate; settling at these values sinks items 0.07–0.10 into the art, and A9-derived clearance inherits the error. A9's `wallHeight − topZ` default also gives the counter ≈1.94 while the mug-rack board hangs at z 1.32–1.46 over most of its x-range (real ≈0.36; a tallest book 0.36 grazes the art). **Correction:** pin the convention ("topZ = top face of the drawn placement surface"), correct the three values, enumerate the exact linen tier set, and pin the counter's clearance to the rack underside in CC-003. **Affected:** §6 A9, §8.1; CC-003. **Disposition: planner-resolvable.**

**C-5 — Slot occupancy and surface occupancy are disjoint registries; a "full" destination behaves differently depending on drop path.**
Slot anchors physically sit inside registered surfaces (sofa seat, entry mat, linen towel board, and after CC-010 all 16 tier slots). §8.2 rule 3 checks overlap only against items "already on that surface"; slot occupants are invisible to it — a free drop can interpenetrate a slotted item with zero rejections, and the shelf-clean predicate reads both registries while physics does not. **Correction:** one mechanism in CC-004 — each occupied slot's anchor reserves an immovable AABB on its hosting surface (recommended minimal fix; the reviewer's fuller "slots as sugar over surface drops" alternative carries noted liabilities) — plus named tests (surface drop onto a slot-occupied spot rejects; adjacent succeeds). **Affected:** §8.2 rule 3, §8.4; CC-004, CC-007, CC-010. **Disposition: planner-resolvable.**

**C-6 — The painter's-algorithm mitigation ("handled by per-item depth keys that already exist") is false for item-vs-furniture occlusion — exactly the new risk.**
Items are a fixed layer appended after furniture (`scene.ts:219`); per-item keys sort only within the items layer (`gameView.ts:147-156`, hardcoded `x+y`, not routed through `depth()`). Today's mitigation is level design ("scatter area clear of tall props", README:101-103), which free placement + seeded scatter + D6 revokes. Stage 8 added the sharp edge: a merged list keyed on plain `x+y` would paint the counter/bookshelf **over** items resting on them (support anchors have higher depth than the items they host), so the merged key must be **support-relative** (item on furniture F keys `depth(F) + ε`; floor items keep `x+y`). **Correction:** plan-level commitment to one merged depth-sorted paint list with a support-relative key, unified through the existing `depth()` abstraction; CC-010's screenshot checks stay as regression insurance. **Affected:** §8.6, §8.9 Option A, §8.13 row 2; CC-005, CC-010. **Disposition: planner-resolvable (contained structural fix; no new layer, no engine).**

**C-7 — Static decor on approved surfaces is unmodeled (the bookshelf-decoy trap class, missed elsewhere).**
Kettle + cutting board on the counter, folded linens + basket on the linen upper board (`assets.ts:264-271, 318-327`), mini plant on the shelf slab: a book dropped "on the kettle" passes every contracted rule, overlaps static art, and overstates the solver's usable area. **Correction:** in CC-003, subtract static-prop AABBs from surface bounds (or add obstacle entries); CC-013's solver consumes effective bounds; named pure test per prop. **Affected:** §8.1, §8.2 rule 3; CC-003, CC-013. **Disposition: planner-resolvable.**

**C-8 — `DropResult`/`PickupResult` surface shapes are unpinned, and CC-004's file scope forbids the type changes its behavior requires.**
The ok-branch carries a mandatory `slotId` (`model.ts:16-24`) and `PickupResult.from` excludes surface locations; nothing defines what a surface drop returns or how pickup-from-surface restores exactly. CC-004's files line says `types.ts` "(rejection union only)". **Correction:** pin the revised shapes in §8.1 (e.g., ok-branch `target: DropTarget`, or `slotId?`/`surface?` discriminated; `PickupResult.from: ItemLocation`) and widen CC-004's file scope. **Affected:** §8.1, §8.2; CC-004. **Disposition: planner-resolvable.**

**C-9 — Footprint registry wiring and the orientation↔footprint binding are unspecified.**
`ItemFootprint` has no home in the CC-002 schema; no orientation field on surface locations; the model's lookup key (asset? category? per-variant for book h/t spread?) and the module boundary (CC-003 exports scattered across `house.level.ts`/`assets.ts`) are undeclared; whether a tier-dropped book is flat or upright is nowhere pinned while validity depends on it. **Correction:** pin in §8.1: registry module (pure, imported by level + model), lookup keys (`ITEM_FOOTPRINTS[asset][orientation]`, `FURNITURE_FOOTPRINTS[furnitureId]`), and the surface orientation rule (e.g., upright on bookshelf tiers and slots, flat elsewhere) applied uniformly to ghosts, footprints, and clearance. **Affected:** §8.1, §8.2, A6; CC-002, CC-003, CC-004, CC-005. **Disposition: planner-resolvable.**

**C-10 — Target precedence (slot vs surface vs floor) and surface-ghost semantics are undefined.**
Shelf tiers host both slots and a surface, so one drag can match both resolvers and light two ghosts; §8.3 says slot aiming is "untouched" and adds a surface resolver without precedence; the surface ghost's shape/tracking/no-fit geometry is unpinned; the existing "exactly one ghost mid-drag" e2e assertion (`e2e.cjs:79-80`) must survive. **Correction:** deterministic chain in CC-005 — (1) slot match (existing radius + compensation) wins, else (2) `[data-surface]` hit, else (3) implicit floor; ghost = the item's current-orientation footprint outline at the live drop point projected onto the hovered surface plane, classed fit/no-fit; slot ghost suppresses the surface ghost when a slot is targeted. **Affected:** §8.3; CC-005, CC-006, CC-016. **Disposition: planner-resolvable.**

**C-11 — `findSurfaceAt(x, y, carryZ)` is a dead API with a contradictory contract: cut it or name a consumer.**
§8.3's pipeline never calls it; its carryZ filter excludes R1's targets (see C-2); its signature says `SurfaceDef | null` while the comment says "floor fallback". Two zoom-out passes flagged it as the plan's one YAGNI violation. **Correction:** delete from the drop path (the `data-surface` walk is authoritative) — or, if kept for a non-DOM fallback/tests, define precedence over the DOM resolver and the no-hit return contract. **Affected:** §8.2, §8.8; CC-004, CC-009. **Disposition: planner-resolvable (default: cut).**

**C-12 — The CC-013 solver contract leaves the search space, fidelity, and signatures unpinned; R3's verification claim overstates.**
Surface placements are continuous — slots-only (32 ≥ 28) or discretized is a substantive algorithmic choice; validators have no typed signatures; no node/time budget keeps `npm test` bounded; nothing requires the solver to enumerate moves through the model's own predicates (`validateSurfaceDrop`, slot rules, shelf-clean rule) — a drifting second ruleset can certify layouts the game cannot finish. R3's "every generated layout must prove…" outruns the test-time-sampling mechanism (2³² seeds vs ≥100 samples); "reachability (free-space connectivity)" is never operationalized for a no-avatar drag game (drags fly over furniture — `gameView.ts:217-228`); "Never fails" is uncalibrated. **Correction:** bind solver moves to the model's own validity functions; declare the search space (slots-only is sufficient and simplest) with a step budget and a distinct `budget-exceeded` failure reason; pin validator signatures (e.g., `hasValidArrangement(level, positions): { ok; reason? }`, `isLayoutReachable(level, positions, cell = 0.15)`); restate R3 honestly ("sampled-seed verification + structural fallback chain ending in the shipped, solver-proven layout"); define reachability as "start cell outside all footprints, clickable at scatter pose." **Affected:** §3 R3, §8.7, §8.13; CC-013, CC-015. **Disposition: planner-resolvable (no runtime solver — the zoom-out explicitly warns against that over-correction).**

**C-13 — The e2e debug hook cannot express the surface location kind; every planned "re-drag from a surface" test mis-aims.**
`window.__cozy.itemClientPos` maps only slot/floor/held and falls through to `{0,0,0}` (`gameView.ts:415-421`); `e2e.cjs:47` uses it as the drag origin for every scenario — surface re-drags would start from the SVG origin and either fail or test nothing. **Correction:** one branch in CC-005 (surface kind → `(x, y, topZ)`), hook stays read-only; in the contract before CC-006/CC-016. **Affected:** §8.3; CC-005, CC-006, CC-016. **Disposition: planner-resolvable.**

**C-14 — The collection chime is not observable by the planned e2e harness.**
`audio.play()` returns void and keeps no state; `__cozy` exposes no audio introspection — CC-016's "chime path + mute" cannot assert anything in headless Chromium as specified. **Correction:** either specify a read-only `__cozy.lastSfx` log (same discipline as the existing hook) or scope CC-016's assertion to the DOM animation plus `aria-pressed` mute state. **Affected:** §8.5; CC-008, CC-016. **Disposition: planner-resolvable (pick one observable; default: `lastSfx` log — preserves the test's intent).**

**C-15 — Ticket-graph dependency gaps: CC-008 is ungated; CC-017 does not gate on CC-016.**
CC-016 owns "collection chime path" and CC-017 runs the all-green gate, but CC-008 appears in no `dependsOn` and CC-017 does not depend on CC-016 — the verification gates can pass green before the chime/animation exists, contradicting §8.14 criterion 2. **Correction:** add CC-008 → CC-016 and CC-016 → CC-017 (both acyclic; store + §8.10 table + CC-016/CC-017 records). **Affected:** §8.10; store. **Disposition: planner-resolvable (ticket-graph edit; recorded, not silent).**

**C-16 — The e2e gate goes red between CC-011 and CC-016 (12→28 items hardcoded).**
`scripts/e2e.cjs` hardcodes 12 items and `0/12` HUD (lines 41–43, 88, 134, 139); CC-011 flips the level before CC-016 rewrites the script, so slices 3's landing is not "leaves the codebase in a testable state". **Correction:** give CC-011 (or CC-013) an explicit e2e-update step, or document the expected-red window as an accepted trade-off. **Affected:** §8.10 sequencing; CC-011, CC-013. **Disposition: planner-resolvable (default: CC-011 owns the e2e update).**

**C-17 — Put-back on a complete shelf re-fires the celebration; the restore path discards the feedback channel.**
Pickup frees a member's slot (breaking silently); dropping it straight back is a committed incomplete→complete transition, so idle pick-up-put-back re-chimes every time — the transition rule cannot distinguish "re-grouped" from "returned to the same spot". Separately, the view's restore path (`gameView.ts:264-282`) reads only `res.ok`, discarding `collectionCompleted` — restore re-completions are silent while identical manual re-drops chime. **Correction:** route restore drops through the same commit-consumer as normal drops, and add the suppression rule (no celebration when the committed drop returns the item to its exact previous location kind + coordinates; per-collection stagger already in A4). Name the test. **Affected:** §8.2, §8.4, A4; CC-007, CC-008. **Disposition: planner-resolvable; behavior refinement flagged for your confirmation (Part D, Q2).**

**C-18 — Exact cancel/restore has no specified fallback when the old location conflicts.**
Reviewer premise note (Elephant): under the shipped single-pointer interaction, another item cannot move during a drag, so the collision cannot arise in normal play — the design critic's stress-answer ("safe under the single-held invariant") is correct for the game loop; the implementation-readiness reviewer's scenario requires out-of-band state changes (tests, a future undo). Today's code already carries an implicit fallback (re-drop; on failure, floor near drop point) that the plan neither adopts nor replaces. **Correction:** one sentence in §8.2/CC-004: restore attempts the exact previous location; on conflict it deterministically falls back (e.g., original floor coordinates) — cheap contract completeness. **Affected:** §8.2; CC-004. **Disposition: planner-resolvable.**

**C-19 — Feature-spec-standard compliance: no alternatives record, no Risks & Limits in the feature half, `?seed=` unvalidated.**
§5 records decisions with zero rejected alternatives (D4/D5 name no option space; D2's per-tier-vs-per-shelf alternative would have surfaced C-1); constraints appear in §4/§6 but failure modes live only in §8.13 with no pointer from the feature half; the seven-row risk table misses the risks this review found and has no security note — A3's `?seed=` is user-controlled input with no stated validation. **Correction:** add an "Alternatives considered" subsection (or a rejected-options column in §5) covering D2/D4/D5/scatter-strategy with trade-offs; point §4 at §8.13 or promote a Risks & Limits summary into the feature half; extend the table with C-1/C-2/C-5/C-6/C-7/C-17; state the `?seed=` input contract (parse to finite integer, clamp to uint32, invalid → default seed). **Affected:** §4–§7, §8.13; no ticket. **Disposition: planner-resolvable (writing work).**

**C-20 — §7's assumption→ticket traceability claim is false.**
"Each … listed with its ticket" — but no §6 bullet names a ticket, the store contains zero A-references (grep-verified by two reviewers), A5 and A8 attach to nothing anywhere, and only A10 is ticket-tagged in the plan. **Correction:** add the owning ticket to each §6 bullet (A1→CC-011, A2→CC-012, A3→CC-013, A4→CC-008, A5→CC-005, A6→CC-004, A7→CC-003, A8→CC-003, A9→CC-003, A10→CC-017 — planner to verify each assignment when editing) and add the same tags to the store records. **Affected:** §6, §7; store. **Disposition: planner-resolvable.**

**C-21 — Progress semantics: by the letter of the plan, floor rests count as "placed" (HUD 28/28, no card).**
The registry includes `floor` as a surface and §8.2 says "progress counts slot + surface placements"; CC-014's literal definition then disagrees with the tidy-all gate that excludes floor — and D3's "placed/total keeps its meaning" is contradicted by the redefinition the same plan makes. **Correction:** state that `placed` counts **non-floor** valid placements (floor drops keep `kind: 'floor'`), align CC-014, and add the HUD-vs-card consistency test. **Affected:** §5 D3, §8.2, §8.5; CC-007, CC-014. **Disposition: planner-resolvable.**

**C-22 — CC-003 invents `kind 'mat'`, violating the declared `SurfaceDef` union; the mat's win-rule consequence is unstated.**
CC-002/§8.1 declare `kind: 'floor' | 'furniture'`; CC-003's entry-mat entry uses `'mat' walkable` — implemented literally, `tsc` fails. Walkability is already encoded by the floor-exclusion list. Registering the mat (topZ ≈0.02) as a surface also means a mat rest satisfies tidy-all's "not floor" while the spot 0.1 units off the mat does not — may be intended (the shoes' home is the mat), but the plan never says. **Correction:** align CC-003 to the union (mat as a floor-bounds surface with no exclusion entry — no `walkable` flag, YAGNI); one sentence in CC-007 on mat-vs-floor under tidy-all. **Affected:** §8.1; CC-002, CC-003, CC-007. **Disposition: planner-resolvable.**

### 🟢 Nits (grouped; all planner-resolvable)

| # | Nit | Where | Owner |
| --- | --- | --- | --- |
| N-1 | Header metadata table has an empty header row | lines 3–10 | plan |
| N-2 | §1's "only repo additions" claim is stale (now includes `docs/review/`) — scope to "at the time of planning" | §1 | plan |
| N-3 | Slice-2 arrows read as CC-009 depending on CC-008, but the table (authoritative) says CC-009 depends only on CC-007 | §8.10 | plan |
| N-4 | Preview-isolation assertion assigned to both CC-009 (§8.8/§8.11) and CC-015 (§8.12 "owns the full list") — pick one owner | §8.8/§8.11/§8.12; CC-009/CC-015 | plan + tickets |
| N-5 | "Insufficient clearance" named in §8.12/R1 but owned by no ticket record; CC-015's record also omits the preview-isolation item | §8.11/§8.12; CC-004/CC-015 | tickets |
| N-6 | R4's "no rotation" clause is a non-goal, not a testable requirement — keep the matrix total by moving it to §4 | §3 R4, §4 | plan |
| N-7 | Radius 0.95 attributed to `model.ts` but it is the view constant `DROP_RADIUS` (`gameView.ts:13`); model takes radius as a parameter | §2 | plan |
| N-8 | "~14 builders" vs "13 pieces" unexplained; ~14 includes non-furniture builders | §2 vs §8.9 | plan |
| N-9 | A6 "screen-space rotation" wording conflicts with §2 "no screen-space data"; say rotation is stored in room units as a display-only angle | §6 vs §2 | plan |
| N-10 | "rack-adjacent tiers" undefined (rack has no surfaces per A7); drag-bounds sentence confused (clamps are floor-only; reachability comes from hit-testing) | §8.3 | plan |
| N-11 | Style absolutes to calibrate: "robust at any viewport size" (single resize scenario; cite CC-016 coverage), "Never fails" (→ "always terminates in a valid layout; final fallback solver-proven"), "readable at game scale" (→ name the proxy: spine bands distinguishable in archived screenshots), "warm/gentle/cozy" descriptors, "teal-blue names no palette token" (palette teal is green-leaning; green must stay distinguishable — name the token or state a new one is required) | §8.3/§8.5/§8.6/§8.7/§8.13/§8.14 | plan |
| N-12 | Redundancy: "Play again = New Mess" twice; "no tickets" for camera stated five times; A10 budget not restated at the CC-017 risk row | §8.5/§8.7/§8.9/§8.13 | plan |
| N-13 | CC-010: "≥ 0.36 + margin" margin unquantified; decoy "small stack" is already in the bottom cubby (remedy is a no-op for it) | §8.1; CC-010 | plan + ticket |
| N-14 | Scatter params unpinned: rotation range (today −14°…+21°), "pairwise spacing ≥ 0.7" center-vs-edge ambiguity, "small items" class undefined | §8.7; CC-013 | plan + ticket |
| N-15 | `collectionStatus().tierSlotIds` mislabels surface placements (collection can complete via tier surface drops); rename `tierId`; field has no named consumer — trim (YAGNI) | CC-007 | ticket |
| N-16 | Two homes for the seed: `LevelDef.seed?` has no consumer (scatter takes the seed; the game instance owns the live seed + `?seed=`) | §8.1 vs A3/CC-013 | plan + ticket |
| N-17 | CC-014 seed display ("title attribute or small text") and hint copy left to the implementer | CC-014 | ticket |
| N-18 | Four tickets parallelize over `src/view/assets.ts` (CC-003 constants, CC-005 tags, CC-010 rebuild, CC-012 variants) with no merge/sequencing note | §8.10 | plan |
| N-19 | Ticket file lists carry no Create/Modify/Delete labels (only two labeled); a labeled allowlist is required for a write gate | all ticket `files` | tickets |
| N-20 | File-attribution nits from the style pass (subjective qualifiers, metaphor, filler) — mechanical copy edits | §1/§3/§6 | plan |

---

## Part B — Owner stress-test directives: answers

**1. Placement vs. correctness.**
Mixed-color books on a shelf with no correctness hint: **yes by design** (§3 R2, §8.2 rules are color-blind; verified against `model.ts` — no color logic exists). Physical-only preview leaking puzzle answers: **no leak in the designed data flow** (fit/no-fit is collection-blind by construction — every book physically fits every tier), but enforcement is advisory: nothing fails if future view code calls `collectionStatus()` mid-drag through the fully-public model (including via `__cozy`). Fix: add the runtime zero-invocation assertion to CC-009 (drag lifecycle → assert `collectionStatus` never called) — folded into the C-19/N-4 revision. Two surfaces overlapping in the isometric view: stage 8 verified geometrically that the rebuilt shelf's tier top faces **never overlap on screen** (0.44 interior depth vs 0.60 gaps), and `elementsFromPoint` stack-walking resolves aim-through-props correctly — selection is sound; the broken part is *where on the surface* the drop lands (C-2) and precedence when slot+surface both match (C-10). Destination full: **inconsistent by drop path** until C-5 lands (slot ghost path rejects via `slot-occupied`; surface path interpenetrates). Cancel after picking up a placed item: restore semantics are specified for all three location kinds and safe under the single-held invariant (design critic verified `model.ts:166`); the unspecified conflict fallback is cheap insurance (C-18).

**2. Collection edge cases.**
Four matching books complete on **any** eligible tier: yes under the §8.4 per-tier predicate — but the governing rule contradicts itself (C-1) and one recorded reading makes completion of even one collection mutually exclusive with another. Extras/mixed colors prevent completion: yes (poison rule, CC-007 acceptance) — modulo C-1's clause-4 ambiguity. Progress backward: **quiet by design** (A4; break = any member removed or foreign item added → silently false; verified no break event exists in the contract). Celebration trigger: precisely specified (committed drops only, transition-based, `DropResult.collectionCompleted` as the single view channel) and **testable except** for two gaps: the chime is not observable in e2e (C-14) and put-back re-fires (C-17).

**3. Layout and solvability.**
Enough surfaces/capacity: slots alone give 32 ≥ 28 (16 rebuilt-shelf + 16 home) and each 4-book group fits one 4-slot tier — sufficient even ignoring free surfaces, **under the per-tier reading** (C-1 again); effective capacity is overstated by static decor until C-7. Reachability + Reset/New Mess distinction: specified and testable (`?seed=` pinning, same-seed re-scatter vs fresh-seed; existing HUD reset wired). Does the plan verify solvability rather than asserting it: **it genuinely verifies** — exported reachability + arrangement-existence (backtracking, clean-tier constraint) over the shipped level + ≥100 sampled seeds, gated at CC-015 — but the solver's fidelity to the game rules is unpinned (C-12: must generate moves via the model's own predicates) and R3's wording overstates the guarantee.

**4. Implementation fit.**
Contracts vs existing repo: mostly faithful (two reviewers verified constants, rejection codes, restore semantics, layer structure, hook shape, all 16 dependency edges) with three direct contradictions — footprints (C-3), topZ convention (C-4), and the depth-key claim (C-6). Elevated-surface aiming: **broken as contracted** (C-2) — the one place the plan under-specifies and contradicts itself simultaneously; fix is the existing slot-compensation pattern generalized. Depth order: needs the contained structural fix (C-6, support-relative merged paint list) — acceptance criteria alone cannot cover it because seeded scatter makes the overlap space unbounded. Coordinate conversion: already sound (room units end-to-end, exact `toScreen`/`toFloor` inverse — verified). Resizing: already covered (CTM/viewBox conversion, existing resize-then-drag e2e, scale-independent `elementsFromPoint`) — no new work. No unnecessary physics/engine/rotation: **verified twice** — rules are four plain AABB predicates in the already-pure model; solver is test-time only; rotation has zero tickets; the one YAGNI item is `findSurfaceAt` (C-11).

**5. Ticket readiness.**
Requirements → tickets → tests mapping is traceable and (with C-15's two dep fixes, N-4/N-5 ownership picks) complete; first ticket CC-002 is pickable today with zero guessing (verified by the implementation-readiness reviewer). CC-003/CC-004/CC-005 as currently written **violate the Zero-Decision Rule** in the gaps consolidated above (C-2/C-3/C-4/C-5/C-8/C-9/C-10/C-11/C-14) — the implementer would have to invent the aiming convention, result shapes, orientation binding, precedence chain, ghost semantics, and the chime observable. Browser tests: **verified genuine drags** — `e2e.cjs` drives `mouse.move/down/up` with stepped moves against real coordinates; `__cozy` is read-only (exposes `game, level, itemClientPos, clientFromWorld`; the script only queries); CC-006/CC-016 contract "real pointer events only + read-only hook" — no state-mutation bypass. The one harness defect is C-13 (hook can't aim a surface drag), which must be fixed before CC-006/CC-016, not during them.

---

## Part C — Traceability matrix (raw findings → consolidated items)

| Raw finding (report · item) | Consolidated |
| --- | --- |
| zoom_out #1 · catalyst — (static props) · design M3 · impl-rd M4 (decor half) | C-7 |
| zoom_out #2 · catalyst F1 · codebase-details #4 · stage-8 F3 · style-9 #4 | C-6 |
| zoom_out #3 · catalyst F3 · design M1 · impl-rd M3 | C-5 |
| zoom_out #4 · impl-rd M9 (fidelity half) | C-12 |
| zoom_out #5 · catalyst F2 (dead-API half) · impl-rd m2 · codebase-details #5 · style-9 #8 | C-11 |
| zoom_out #6 · design N1 · codebase-details #1/#3 · style-9 #1 | C-3 |
| zoom_out #7 | N-16 |
| zoom_out #8 | N-15 |
| zoom_out #9 · comprehension F3 · style-9 #5 (wording half) | C-12 |
| catalyst F2 (dual-resolver half) · design M2 · impl-rd B2/M6 · codebase-details #5/#11 · stage-8 verdict 2 | C-2, C-10 |
| catalyst F4 · design N2 | C-17 |
| comprehension F1 · design B1 · impl-rd B1 | C-1 |
| comprehension F2 | N-10 |
| comprehension F4 · impl-rd M1 · codebase-details #6 | C-8 |
| comprehension F5 · design N4 | C-21 |
| comprehension F6 · structural #2 · style-7 #1 | C-20 |
| comprehension F7 | N-20 (forward pointer at first ticket-ID use) |
| comprehension F8 | N-3 |
| comprehension F9 · structural #4 (ownership half) | N-4, N-5 |
| comprehension F10 | N-8 |
| comprehension F11 | N-9 |
| design M4/M5 · structural #1/#5 | C-19 |
| design N3 | C-14 |
| design N5 | N-11 (D6 wording) |
| design N6 | Part B-1 (runtime assertion; folded into C-19/N-4 revision) |
| structural #3 · impl-rd M8 | C-15 |
| structural #6 · style-7 #3 | N-2 |
| structural #7 | N-6 |
| structural #8 | N-1 |
| style-7 #2 | C-3 |
| style-7 #4–#10 | N-20, N-11 |
| stage-8 F1 · impl-rd M2 | C-9 |
| stage-8 F2 | C-13 |
| stage-8 F4 | C-4 |
| stage-8 F5 · codebase-details #7 | C-22 |
| stage-8 F6 · impl-rd M5 | C-10 |
| impl-rd M4 (topZ/linen half) · codebase-details #2 · style-9 #2 | C-4 |
| impl-rd M7 | C-18 |
| impl-rd m1 | C-16 |
| impl-rd nits · codebase-details #9/#10 · style-9 #7/#10/#11/#12 | N-13, N-14, N-10, N-11, N-12, N-7 |
| codebase-details #8 | N-19 |
| impl-rd B1's test recommendation | C-1 |

---

## Part D — Decisions that need you (planner cannot resolve these alone)

**Q1 — The collection rule (resolves C-1).** Your recorded D2 ("4 same-color books on one tier **and the rest of the shelf empty**; one clean collection per shelf at a time") combined with D3 (win = all 3 collections **currently** complete) and D5 (one bookshelf) is mathematically unsatisfiable — at most one collection can be clean at any instant, so the game can never be won. The plan's §8.4 silently re-read D2 as per-tier to make the win reachable. You must pick one; the plan and tickets will then carry it everywhere:

- **(a) Tier-clean (recommended).** A collection completes iff its four books are grouped on one tier, every non-empty tier holds exactly one collection, and the shelf holds no non-book items. Three collections can complete simultaneously on three tiers; D3 stays as recorded; CC-013's solver contract already assumes this. Cost: reword R2/D2/CC-007 prose (the plan's §8.4 already is this rule) and add the simultaneous-completion tests.
- **(b) Keep per-shelf cleanliness; amend D3.** Win becomes e.g. "tidy-all **and** every collection has been completed at least once (chips stay lit once earned)". Cost: changes the "currently complete" semantics you chose in D3; HUD chips and the completion gate change meaning; CC-013's solver target changes.
- **(c) Keep both literal; add shelf capacity.** A second bookshelf (or more tiers) so three per-shelf-clean collections can coexist. Cost: new art + level scope — an amendment to D5 and the largest change of the three.

**Q2 — Put-back behavior (resolves C-17, minor).** Proposed default: completing a collection again by simply returning the same item to its exact previous spot does **not** re-fire the animation/chime (only genuine re-groups celebrate). This refines R2/A4's "re-grouping celebrates again … cannot spam". If you want strict transition-only behavior as literally written (put-back re-celebrates every time), say so.

**Q3 — Geometry direction (resolves C-3/C-4, minor).** Proposed default: the plan's pinned numbers are corrected to match the drawn art (upright book 0.20 wide; cushion 0.41; counter topZ 0.96; bench 0.50; stool 0.49; shoe per drawn profile). The alternative — slimming the book art to 0.10 to match the plan — is an undocumented CC-012 art change. Data-follows-art is assumed unless you say otherwise.

Everything else in Part A is planner-resolvable: on your approval of a revision round, the planner updates only the plan document and the affected ticket records (CC-003/004/005/007/010/011/013/015/016/017 + store deps), records what changed, and re-reviews the affected sections. Nothing has been edited during this review, and a clean review or approval of revisions is **not** permission to code — implementation starts only when you separately ask.

---

## Part E — What this review did not cover

- No runtime verification: reviewers re-ran `npm test` (20/20 green) and `node scripts/tickets.cjs check` (DAG OK) but did not execute Playwright (not installed in this environment; the plan's e2e-green claim rests on the README's recorded run — noted by the style reviewer as acceptable).
- Stage 6 (`egm-comprehension`) read the document alone, without repo context, per protocol; its findings are clarity/self-containment findings only.
- The five stage reports are preserved unmodified in `docs/review/`; where reviewers overlapped, this consolidated file deduplicates and (where severity judgments differed) applies the strictest reviewer's rating. One contested premise (C-18's mid-drag collision) is flagged in place rather than silently resolved.
- Camera options (§8.9) were analyzed but not re-litigated: two zoom-out passes confirmed the analysis is honest and its "no tickets" boundary is respected. One calibration nit (N-11/N-12: the "one-line depth change" phrasing) corrects its cost estimate for Option A upward.

---

## Part F — Revision round 1: reconciliation and re-review (2026-11-15)

**Owner decisions applied (received in chat after Part A–E were delivered):**

- **Q1 = C-1(a) tier-clean.** D2 amended: each of the three color collections may go on **any eligible tier**; a collection counts only when all four of its books are together on one tier with **no unrelated items on that tier**; **other tiers are evaluated independently**; mixed/incomplete arrangements are valid temporary placements whenever items physically fit and must not trigger rejection, warning, hint, or celebration; all three collections and all other goals must be complete **at the same time** to finish the level. D3 kept its "currently complete" semantics, made explicit as "at the same time". D5 updated (any tier eligible for any collection). The original per-shelf-clean reading is **rejected** (it made the game unwinnable — C-1).
- **Q2 accepted (default).** Completion is evaluated **after a committed drop**, never on pickup; putting a book back in the same place or cancelling the drag must not replay the celebration; a committed move that breaks a collection **quietly stops counting** it; restoring counts again; the anti-spam rule is explicit and named-test-verified.
- **Q3 accepted (default: data follows art).** The upright-book dimensions and the counter/bench/stool heights were **re-verified against the current asset builders and projection by the Elephant** (below); the plan and ticket contracts are corrected to match. **No asset is redrawn** to make an unverified plan number true (CC-012 untouched).
- Authorization: **plan + ticket revisions only**; implementation stays stopped.

**Elephant Q3 verification (builder audit, this round — numbers re-derived from `src/view/assets.ts` + `src/view/projection.ts`, not copied from Part A):** upright book box spans x −0.1…0.1 → **0.20 wide**, heights 0.30/0.34/0.36 (`assets.ts:397–416`); flat book 0.20 × 0.32 × 0.05 (`assets.ts:411`); cushion base layer ±0.215 → **0.43**, drawn top ≈ 0.156 (`assets.ts:449–453`); counter topZ = **0.96** (countertop box z 0.88→0.96, `assets.ts:318`; the cabinet slab top 0.88 is its underside); bench **0.50** (`assets.ts:245`, slab z 0.40→0.50); stool **0.49** (cylinder 0.42 + 0.07, `assets.ts:338`); linen towel board **0.91** / upper board **1.33**, top slab underside 1.56 (`assets.ts:258–263`); mug-rack board underside **1.32** (`assets.ts:296`) → counter clearance 0.36 = exactly the tallest upright book; sofa seat **0.55** (`assets.ts:205`); today's shelf boards 0.10 / 0.68 / 1.30 / 2.20 with the decoy static books on the 0.68 tier (`assets.ts:164–191` — CC-010's rebuild numbers are targets, not claims about the current asset). Projection check (computed numerically): `toFloor(toScreen(px, py, topZ)) = (px − topZ, py − topZ)` exactly (ISO_SIN = 0.5) — the revised C-2 surface-plane shift `(+topZ, +topZ)` is the exact inverse, and an honest floor-plane drop at the counter's visual center indeed lands out of bounds, confirming C-2 was real and the fix is right.

**Residual defects found and fixed during reconciliation (new findings, severity Minor):**

- **R-1 — stale towel footprint.** §8.1/CC-003/store still said towel **0.38 × 0.29 × 0.09**; the drawn layers span ±0.18 × ±0.14 with the top layer at z 0.09 → corrected to **0.36 × 0.28 × 0.09**. Consumer updated: §8.7's small-item class bound "max extent ≤ 0.32" → **≤ 0.36 (the towel)**. Affected: plan §8.1/§8.7, CC-003, store CC-003 record. *Fixed.*
- **R-2 — stale shoe footprint.** §8.1/CC-003/store still said shoe "low profile ≈ 0.30 × 0.37"; the drawn pair is **two sheared 2D cutouts, flat in y (zero thickness), standing ≈ 0.21 tall**, measured **≈ 0.34 × 0.11 × 0.21**, with the pair center offset ≈ +0.055 in y from the anchor (the art is not anchor-centered — the convention now records the offset). Corrected with the exact-AABB pin against the drawn pair retained. Affected: plan §8.1, CC-003, store CC-003 record. *Fixed.* (Height later re-pinned to **≈ 0.20** during the re-review round — the drawn curve tops out at ≈ 0.196; see Part G, D-4.)
- **R-3 — C-5 × C-22 interaction gap.** Removing the entry mat from the surface registry (C-22) left the occupied mat **shoe slots without a reservation host** (C-5 reserves occupied-slot AABBs on the *hosting surface*), so a free floor drop could interpenetrate a slotted shoe. Closed: slots anchored on walkable floor reserve the same AABB on the `floor` surface entry; named test added (floor drop onto an occupied mat shoe slot rejects `footprint-overlap`; adjacent succeeds). Affected: plan §8.2/§8.12, CC-004, CC-015, store CC-004/CC-015 records. *Fixed.*

**Disposition of Part A findings (all blockers and majors):**

| Item | Disposition | Where it landed |
| --- | --- | --- |
| C-1 win-rule contradiction | **Fixed** (owner decision Q1 = C-1(a)) | plan §3 R2, §5 D2/D3/D5 + revision-round-1 paragraph + rejected alternatives, §8.4 (single formulation; redundant bullets merged), §8.10–§8.12, §8.13 row; CC-001 (epic contracts), CC-007 (rule + named tests), CC-009, CC-013 (solver target = winning arrangement), CC-015, CC-016, store deps/A-tags. N-15 folded in: `collectionStatus().tierId` |
| C-2 surface aiming | **Fixed** | §8.3 surface-plane aiming `(+topZ, +topZ)` (verified exact), §8.13 row; acceptance "counter visual-center lands within ε" in CC-004/CC-005/CC-006; CC-016 `clientFromWorld(x, y, topZ)` round-trip |
| C-3 footprint values | **Fixed** (Q3 default accepted; residuals R-1/R-2 closed) | §6 A6, §8.1 table re-pinned + convention + offset note, §8.7 class bound; CC-002/CC-003/CC-004 contracts; CC-012 untouched (no art change) |
| C-4 topZ convention | **Fixed** | §6 A9 revised (per-tier underside rule; counter clearance pinned to rack underside 0.36), §8.1 "topZ = top face of the drawn placement surface" + corrected values (all re-verified against builders this round); CC-003 |
| C-5 dual occupancy registries | **Fixed** (residual R-3 closed) | §8.2 rule 3 (one occupancy mechanism; slot anchors reserve AABBs; named tests), §8.13 row; CC-004, CC-015, store |
| C-6 depth-key claim false | **Fixed** | §8.6 merged support-relative paint list behind `depth()`, §8.9 Option A cost note, §8.13 row; CC-010 (mechanism + screenshot regression) |
| C-7 static decor unmodeled | **Fixed** | §8.1 static-decor AABBs (builder-verified: cutting board, kettle, folded linens, basket); CC-003 subtraction + per-prop named tests; CC-013 consumes effective bounds |
| C-8 result shapes unpinned | **Fixed** | §8.1 revised `DropResult`/`PickupResult` shapes; CC-004 file scope widened (types.ts beyond the rejection union) |
| C-9 registry/orientation wiring | **Fixed** | §8.1 registry module + `ITEM_FOOTPRINTS[asset][orientation]`/`FURNITURE_FOOTPRINTS[furnitureId]` + orientation rule (upright on tiers, flat elsewhere); CC-002/003/004/005 |
| C-10 target precedence | **Fixed** | §8.3 deterministic chain slot → `[data-surface]` → floor + ghost semantics + single-ghost rule; CC-005/CC-006/CC-016 |
| C-11 dead API | **Fixed** (default: cut) | `findSurfaceAt` removed from §8.2/§8.8/CC-004/CC-009; DOM walk is the authoritative resolver |
| C-12 solver contract | **Fixed** | §3 R3 restated honestly (sampled-seed verification + fallback chain), §8.7 solver bound to model predicates, slots-only search space, step budget + `budget-exceeded`, pinned validator signatures, operationalized reachability; CC-013/CC-015 |
| C-13 hook can't aim surfaces | **Fixed** | §8.3 `__cozy.itemClientPos` surface branch, shipped by CC-005 before CC-006/CC-016 need it |
| C-14 chime not observable | **Fixed** (default: `lastSfx` log) | §8.5 read-only append-only `__cozy.lastSfx`; CC-008 ships it; CC-016 asserts chime path + mute gate through it |
| C-15 dependency gaps | **Fixed** | store: CC-008 → CC-016 and CC-016 → CC-017 added (§8.10 note); `node scripts/tickets.cjs check` re-verified DAG after every store edit |
| C-16 e2e red window | **Fixed** (default: CC-011 owns) | §8.10 sequencing + CC-011 explicit e2e-count update (12 → 28) |
| C-17 put-back re-celebrates | **Fixed** (Q2 accepted) | §8.4 anti-spam rules, §8.5, A4 revised; restore drops routed through the same commit-consumer (CC-008); named tests in CC-007/CC-008/CC-009 |
| C-18 restore conflict fallback | **Fixed** | §8.2 + CC-004 deterministic fallback contracted |
| C-19 standards compliance | **Fixed** | §5 "Alternatives considered (rejected)", §4 pointer to §8.13, §8.13 risk table extended (C-1/C-2/C-5/C-6/C-7/C-17 rows), `?seed=` input contract (A3/§8.7) |
| C-20 assumption traceability | **Fixed** | every §6 assumption names its owning ticket; store records carry `assumptions` tags (verified: A1→CC-011, A2→CC-012, A3→CC-013, A4→CC-008, A5→CC-005, A6→CC-004, A7/A8/A9→CC-003, A10→CC-017; CC-002's record references A3 in prose only — its owner is CC-013) |
| C-21 floor-rest progress | **Fixed** | D3/§8.2/§8.5: `placed` counts non-floor valid placements; CC-007 mat-vs-floor note; CC-014 HUD-vs-card consistency test; CC-015 |
| C-22 `mat` kind + win-rule note | **Fixed** (residual R-3 closed) | §8.1 mat = walkable floor, no `mat` kind; CC-002/CC-003/CC-007 aligned; tidy-all mat note in CC-007/CC-009/CC-015 |
| N-1…N-20 nits | **Deferred by owner instruction** ("don't expand scope to fix a nit"), except where they overlapped a blocker/major correction and were fixed by that rewrite: N-3, N-4, N-5, N-6, N-7, N-9, N-10, N-13, N-14, N-15, N-16, N-17 | remaining pure-writing nits (N-1, N-2, N-8, N-11 residue, N-12, N-18, N-19, N-20) are accepted trade-offs with no contract risk; N-18/N-19 are flagged for the implementer's first touch of those files |

**Ticket tracker confirmation (owner question):** the 17 tasks are **not** `tk` records — they live in the **repository-local store** (`docs/tickets/tickets.json` + one Markdown per ticket + `scripts/tickets.cjs` validator). This substitution was approved during planning as **decision D1** (plan §5; the store's `tool` field records it; §7 keeps the migration offer: a real `tk` imports this JSON directly). No migration was performed in this round; keep-or-migrate remains the owner's call and changes nothing else.

**Post-reconciliation state:** all 17 tickets **open and unstarted**; `node scripts/tickets.cjs check` green (DAG verified after every store edit); `git diff` shows **zero changed lines in application code, tests, or assets** — only planning documents were edited.

---

## Part G — Fresh-context re-review of the corrected plan (2026-11-15)

Three **fresh-context** Goldfish reviewers (no planning conversation; each read its canonical persona file first: `elephant-goldfish-model/agents/zoom_out.md`, `implementation_readiness.md`, `codebase_details.md`) re-checked the corrected sections and implementation readiness against the repo files. The implementation-readiness pass was run twice: the first attempt exceeded its turn budget and produced no report; the rerun (focused charter) completed. Nothing was edited during the reviews; the Elephant then applied the reviewers' own one-line corrections (recorded below), re-validated the store after every edit, and re-swept for stale numbers.

| Reviewer | Scope | Verdict returned |
| --- | --- | --- |
| `egm-zoom-out` | corrected feature half + §8.4 + all charged tickets | Ready after fixes (1 Major, 4 nits) |
| `egm-codebase-details` | §8.1 geometry re-derived from the builders | Ready after fixes (3 Majors, 5 nits) |
| `egm-implementation-readiness` (rerun) | DetailedRange + tickets + store + e2e discipline | Ready after fixes (4 Majors, 5 nits) |

**What the reviewers confirmed (evidence-checked, not trusted):** the tier-clean rule is stated identically in §3 R2 / §5 D2/D3/D5 / §8.4 / §8.13 and all six charged tickets, with zero per-shelf residue outside historical notes; the Q2 anti-spam contract is precise, model-side, and named-test-verified everywhere; the §8.4 winning arrangement sums to 28, respects tier-clean, and satisfies CC-013's slots-only solver contract and CC-016's playthrough; the 3-green-+-1-red no-feedback case is a named test wherever required; the C-2 aiming identity is exact (`toFloor(toScreen(p, topZ)) = (px − topZ, py − topZ)`); all surface topZ/clearance values and item footprints check out against the builders; the solver contract is coherent end-to-end; the ticket graph matches §8.10 row-for-row with the C-15 edges present and all tickets open/unstarted; the e2e discipline (real pointer drags, read-only hook, `lastSfx`) is stated identically everywhere; no stale pre-revision numbers survive in any contract document.

**Re-review findings and dispositions (D-numbers; Majors fixed the same day, verbatim per the reviewers' suggested corrections):**

| # | Sev | Finding (source) | Disposition |
| --- | --- | --- | --- |
| D-1 | 🟡 | Browser-side zero-invocation assertion of `collectionStatus` claimed by §8.8/CC-009 but absent from CC-016's scenario list and §8.12's e2e list (zoom-out F-1) | **Fixed**: ownership split pinned everywhere — CC-009 owns the pure/static side, CC-016 executes the browser side; bullet added to CC-016 + §8.12 e2e list + store |
| D-2 | 🟡 | Bookshelf "gaps 0.58/0.60/0.60" are board-top pitches contradicting their own clearance definition; top-tier slab clearance promised "pinned by CC-010" but numbered nowhere (codebase F-1/F-2) | **Fixed**: rebuilt tier boards and slab pinned 0.05 thick (today's drawn shelf-board thickness; bottom panel 0.10 as drawn) → clearances **0.53 / 0.55 / 0.55 / 0.49**, every one ≥ the 0.46 gate (0.36 + 0.10); pinned in plan §8.1, CC-010, store |
| D-3 | 🟡 | CC-010's tier interior bounds (y ≈ 1.10–2.70) equal the outer footprint — impossible with panel thickness; boards reach world x 0.59, not 0.52 (codebase F-3) | **Fixed**: interior restated as footprint minus panel thickness — world x ≈ 0.08–0.59, y ≈ 1.17–2.63 (plan §8.1, CC-010, store); the pinned 0.58 × 1.60 footprint now couples cleanly |
| D-4 | 🟡→🟢 | Shoe height "≈ 0.21" overstates the drawn curve (≈ 0.196; 0.205 was the bezier hull control point) (codebase F-4) | **Fixed** (R-2 amendment): ≈ 0.20 everywhere (plan §8.1, CC-003, store) |
| D-5 | 🟡 | CC-002's title and behavior paragraph still promised "an optional level seed" while its own contracts pin "no LevelDef.seed" (readiness F-1) | **Fixed**: seed wording struck; "(No seed field: the game instance owns the live seed and `?seed=` — owned by CC-013, A3.)"; plan §8.10 table title aligned |
| D-6 | 🟡 | No document said which `DropTarget` a floor drop commits as, or that it stores location kind `'floor'` (readiness F-2) | **Fixed**: pinned in §8.1/§8.3, CC-004, CC-005, store — a floor drop commits as `{ type: 'surface', surfaceId: 'floor', x, y }` (the registry's floor entry) and stores location kind `'floor'` (C-21); furniture exclusion applies on top |
| D-7 | 🟡 | The e2e aim tolerance "within ε" was referenced in four tickets but never assigned a number (readiness F-3) | **Fixed**: **ε_aim = 0.05 room units** pinned in §8.3 (with rationale: stepped pointer events + viewport rounding) and carried into §8.11/§8.13, CC-004/005/006/016, store |
| D-8 | 🟡 | CC-004's acceptance "drag onto the visual center … within ε" is browser-side but CC-004 is pure/node-only (readiness F-4) | **Fixed**: reworded as the model-input contract; browser-side acceptance explicitly owned by CC-005/CC-006/CC-016 |
| D-9 | 🟢 | CC-008 title said "shelf collection feedback" — rejected C-1 vocabulary (zoom-out F-2) | **Fixed** (C-1 consistency): "tier collection feedback" |
| D-10 | 🟢 | CC-015/CC-016 paraphrased the mixed-tier case as unquantified "red + green" (zoom-out F-3) | **Fixed** (C-1 consistency + owner's explicit case): "3 green + 1 red" everywhere |
| D-11 | 🟢 | Plan §1 said collections are "judged on clean shelves" (zoom-out F-4) | **Fixed** (C-1 consistency): "judged on a clean shelf tier" |
| D-12 | 🟢 | Part F's C-20 row overstated the store tags ("A3→CC-002+CC-013"; CC-002 carries prose only) (zoom-out F-5) | **Fixed**: Part F row corrected (A3→CC-013) |
| D-13 | 🟢 | `ItemFootprint` scalars vs the pinned per-variant book ranges; the shoe's +0.055 offset had no stated consumer (codebase F-7) | **Fixed** (Q3/C-9 contract completion): entries carry conservative variant maxima (height 0.36, thickness 0.06; per-variant art display-only); the offset is consumed by the registry as the AABB center offset |
| D-14 | 🟢 | CC-008 said `lastSfx` "records every `play()` call" while the log is length-capped (readiness F-9) | **Fixed**: "records recent `play()` calls (length-capped)" |
| D-15 | 🟢 | Counter bounds in CC-003 quote the cabinet footprint (a safe ≤0.04 inset of the countertop top face) with mislabeled provenance (codebase F-5) | **Deferred** (nit; values are a conservative subset, no gate affected) |
| D-16 | 🟢 | Kettle obstacle circle (r 0.13) omits the spout reaching local x ≈ 1.22 (codebase F-6) | **Deferred** (nit; ≈ 0.14 units of thin spout art can be overlapped — visual-only, no rule affected) |
| D-17 | 🟢 | "A flat book fits the linen upper board" sanity test is knife-edge as a full drop check (one 0.20 prop-free strip) (codebase F-8) | **Deferred** (nit; CC-003's implementer scopes it as a clearance check or pins the strip-center placement) |
| D-18 | 🟢 | Static-decor handling is an explicit either/or (subtract bounds or obstacle entries) (readiness F-5) | **Deferred** (nit; the observable — effective bounds + per-prop tests — is contractual, the mechanism is delegated) |
| D-19 | 🟢 | Solver step-budget value and the spacing-relaxation ladder unpinned (readiness F-6) | **Deferred** (nit; implementer-declared constants, outcomes bounded by `budget-exceeded` + the terminating fallback chain) |
| D-20 | 🟢 | Restore-conflict fallback says "floor near the drop point" without the exact placement rule (readiness F-7) | **Deferred** (nit; today's implicit re-drop-then-floor behavior is the named reference) |

**Current verdict: Ready.** Every Blocker and Major from both review rounds (C-1…C-3, C-4…C-22, D-1…D-8) is fixed and evidence-verified; the remaining open items are the nit-grade deferrals D-15…D-20 (plus the Part F nit deferrals), none of which is contract-load-bearing or blocks a zero-decision start of CC-002 → CC-003/CC-004 → CC-005. Per the protocol's one-re-audit convergence cap, the D-fixes were applied verbatim from the reviewers' own corrections and spot-verified by the Elephant (store validates after every edit; stale-number sweep clean across plan + tickets + store) rather than by a third fresh-context pass. Per the owner's standing instruction, **this verdict is not permission to code** — implementation starts only on a separate instruction.

**Post-re-review state:** all 17 tickets **open and unstarted**; `node scripts/tickets.cjs check` green (17 tickets, DAG verified); JSON valid; no application code, tests, or assets touched (git diff: zero source lines changed).
