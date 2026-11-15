# Critic Report — Stage 7 (Critic Review)

**Target:** `docs/cozy-corner-upgrade-plan.md` (FeatureRange lines 1–280)
**Reviewers:** `egm-design` (completed), `egm-structural` (completed), `egm-style` (completed)
**Standards:** egm-design → feature-spec-standard, egm-structural → feature-spec-standard, egm-style → none
**Mode:** REVIEW · Preset: uninterrupted

---

## egm-design (Design Critic)

Audit standard: `feature-spec-standard.md`. Baseline verified against repo at commit `39d9079` (matches plan header), `node scripts/tickets.cjs check` → OK/DAG (matches plan line 9), vitest env `node` (vite.config.ts), Playwright absent from package.json (matches plan line 105). All §2 "verified by audit" claims checked (13 furniture, 5 zones/12 slots, 3-slot tier at z 0.68, book variant heights/thicknesses, rejection codes, LIFT 0.55, `__cozy` hook, 14+6 tests, decoy books at assets.ts:175–181, mute gate at audio.ts:44) are accurate. The findings below are what does not hold up.

### BLOCKER

**B1 — The win rule is unsatisfiable as specified: the shelf-clean rule contradicts itself between §3/§5 and §8.4/CC-013, and one reading makes the game unwinnable.**
- **Affected Scope:** Plan lines 138–152 (R2), 224 (D2), 225 (D3), 227 (D5); cross-ref lines 375–385 (§8.4), 430–431 (§8.7 solver), tickets CC-007/CC-013 contracts; `src/level/house.level.ts:32` (single bookshelf).
- **Finding & Recommendation:** R2 (line 139) defines completion as four same-color books on one tier "**and the rest of that shelf holds nothing else**"; D2 records the accepted consequence "**One clean collection per shelf at a time**; extra item anywhere on the shelf poisons it"; CC-007's acceptance repeats the per-shelf poison ("4 green grouped on a tier + unrelated item **elsewhere on the same shelf**: green NOT complete"). D3 (line 150–152, 225) requires "**all required collections currently complete**" simultaneously for the win, and D5 provides exactly **one** bookshelf (4 tiers). Under this reading, at most one of three collections can ever be complete at any instant, so `isComplete()` (all three currently complete) is **never true — the level cannot be won**. Meanwhile §8.4 (lines 376–381) silently switches to a per-tier predicate ("every non-empty tier carries books of exactly one collection" + "no foreign item", where clause 1 already bans non-books, so "foreign … including non-book items" reads as other collections' books too), and CC-013's solver contract ("each color set on its own clean tier") assumes three collections can occupy three tiers simultaneously — which contradicts D2/R2 verbatim. Either the implemented rule is per-shelf (unwinnable game, and CC-013's solver can never find an arrangement for 3 collections on one shelf, so every generated layout fails validation and R3 is unshippable), or it is per-tier (winnable, but contradicts two recorded user decisions). **Recommendation:** reconcile before any implementation: either amend D2/R2 to the per-tier predicate (each non-empty tier single-collection, books-only shelf; delete the "rest of the shelf empty" clause and the CC-007 "extra item elsewhere on the same shelf" acceptance, replacing it with an extra-on-the-occupied-tier test), or keep per-shelf cleanliness and change the win condition (e.g., "all collections completed at least once", or add shelf capacity). Record the amendment in §5; add a named test for **two collections simultaneously complete** — no existing test covers it, which is exactly how this slipped through.

### MAJOR

**M1 — Slot occupancy and surface occupancy are two disjoint registries; physical overlap is not checked across them, so a "full" destination behaves differently depending on drop path.**
- **Affected Scope:** Plan lines 127–130 (R1), 338–339 (§8.2 non-overlap, cross-ref); `src/game/model.ts:48,171` (slot map); `src/level/house.level.ts:51–53, 73–74, 83–84, 93–94` (slot anchors inside registered surfaces).
- **Finding & Recommendation:** Home-slot anchors physically sit inside surfaces the plan registers as free-placement targets: sofa seat slots (0.75, 3.92/4.42, z 0.55 = seat top), entry-mat shoe slots (z 0.04 on the mat), linen towel slots (z 0.91 on the towel board), and — after CC-010 — all 16 bookshelf slots on the four tier surfaces. §8.2's validity rule 3 checks overlap only "with items already **on that surface**"; slot occupants live in `slotItem` (model.ts:48), invisible to the surface check. Consequences: a book surface-dropped onto a full tier stacks through slot-placed books with zero rejection; a mug can be surface-dropped interpenetrating a sofa cushion; the "destination is full" edge case has two different outcomes depending on whether the player targets the slot ghost or the surface. Note the asymmetry: the shelf-clean predicate (§8.4) counts "occupants on any of its surfaces **or slots**", so collection logic sees both registries but physics does not. **Recommendation:** define one occupancy space per furniture piece in CC-004: a slot anchor reserves its footprint on any surface whose bounds contain it; `validateSurfaceDrop` consults slot occupants (and vice versa for slot drops, which today ignore surface occupants). Add tests: surface drop onto a slot-occupied spot rejects `footprint-overlap`; surface drop adjacent to a slot occupant succeeds.

**M2 — The surface-targeting contract is incomplete and self-contradictory: `findSurfaceAt`'s height filter excludes the very surfaces R1 requires, and no floor→surface coordinate compensation is specified.**
- **Affected Scope:** Plan lines 111–130 (R1), 330 (§8.2 `findSurfaceAt`, cross-ref), 363–368 (§8.3, cross-ref); `src/view/projection.ts:30–39`, `src/game/model.ts:138–156` (existing slot compensation), `src/view/gameView.ts:14, 217–228` (LIFT, drag path).
- **Finding & Recommendation:** (a) `findSurfaceAt(x, y, carryZ)` resolves the "topmost surface … whose topZ ≤ carryZ + tolerance". The drag carries at LIFT 0.55 (gameView.ts:14); the kitchen counter is topZ ≈ 0.88–0.96, linen tiers 0.91/1.33/1.62, bookshelf tiers 0.68/1.28/1.88 — all excluded at any honest tolerance, so R1's marquee example ("A book can sit on the kitchen counter", plan line 117) is unreachable through the documented API unless tolerance is inflated until the filter is meaningless. (b) In this projection, the floor-projection of a raised point (x, y, z) is (x−z, y−z) — e.g., aiming at counter point (7.8, 0.36, 0.88) floor-maps to (6.92, −0.52), outside the surface and the room. The plan specifies the equivalent compensation only for slots (`carryZ − slotZ` shift, model.ts:147–148, correctly described at plan line 71–72) and never states what (x, y) `validateSurfaceDrop`/the settle target consume for surface drops; §8.3 step 1 (elementsFromPoint) solves *which* surface, not *where on it*. **Recommendation:** specify the surface aiming convention in CC-004/CC-005 — e.g., extend the slot convention (aim point shifted by `carryZ − topZ` along both floor axes) and define `validateSurfaceDrop`'s inputs as compensated floor coordinates; replace `topZ ≤ carryZ + tolerance` with a nearest-surface-along-view rule or drop the filter (elementsFromPoint already disambiguates). Add an e2e case: drop on the visual center of the counter lands at the aimed surface point, not topZ-offset.

**M3 — Static decor resting on registered surfaces has no collision treatment; free placement can interpenetrate props and capacity/solver area is overcounted.**
- **Affected Scope:** Plan lines 111–130 (R1), 156–167 (R3); cross-ref plan 312–316 (surface registry); `src/view/assets.ts:318–327` (counter cutting board + kettle), 264–271 (linen folded linens + basket on the upper board), 186–189 (mini plant on bookshelf top), 342–364 (spill box).
- **Finding & Recommendation:** D6 makes every flat top placeable, but the model's overlap rule sees only dynamic items. Nothing reserves the kettle (⌀0.26 at counter local x 0.95), the cutting board, the linen-shelf linens/basket, or the shelf-top plant; a book dropped "on the kettle" or a towel through the basket is physically valid, visually broken, and the arrangement solver's notion of usable area is wrong (R3 promises verification of "a valid final arrangement exists" over real space). **Recommendation:** in CC-003, subtract static-prop AABBs from surface bounds (or register them as obstacles in the surface entry); have the CC-013 solver consume effective bounds; add a pure test that a drop centered on each static prop rejects `out-of-bounds`/`footprint-overlap`.

**M4 — Standard compliance: the Alternatives Rule is not satisfied in the feature-specification half.**
- **Affected Scope:** Plan lines 1–280 (esp. §5, lines 219–233); standard lines 13–21.
- **Finding & Recommendation:** The standard mandates "a mandatory evaluation of alternatives … rejected for specific, documented reasons (complexity, cost, performance, or scalability)". §5 records six decisions with their consequences but documents **zero rejected alternatives**: D4 ("Add layers… Smallest diff") names no alternative architecture and no trade-off beyond diff size; D5 ("One big shelf… Least art/layout cost") gives no considered options (two smaller shelves, wall rails, extending today's shelf); D2/D3 record user answers without the option space they were chosen from. The only true alternatives analysis in the document (§8.9) evaluates a feature that is explicitly *not* implemented. As it stands, a fresh reader cannot "confirm that all major risks and alternatives have been addressed" (standard lines 8–11). **Recommendation:** add an "Alternatives considered" subsection (or a rejected-options column in §5) covering at least: D4 (layers vs. slots-only extension vs. level-schema rewrite), D5 (one 4-tier shelf vs. multiple shelves vs. 3-slot shelf kept), D2 (per-tier vs. per-shelf cleanliness — this would also have surfaced B1), scatter strategy (rejection sampling vs. jittered grid vs. hand-authored variants). Where the user dictated the choice, record the options and the trade-offs that make the mandate sound.

**M5 — Standard compliance: Risks & Limits is absent from the audited feature-spec half, and the deferred risk table is incomplete.**
- **Affected Scope:** Plan lines 1–280 (§4 scope, §6 assumptions, §7 — no risk content); cross-ref §8.13 (lines 568–578); standard lines 23–27, 38–39.
- **Finding & Recommendation:** Within lines 1–280, constraints are listed (§4, §6) but failure modes and mitigations appear only in §8.13, outside the feature-spec half — the specification itself does not "identify potential failure modes … and how they will be mitigated". Moreover §8.13 misses the material risks this audit found (win-rule satisfiability, slot/surface occupancy, surface-aim geometry, static decor, celebration re-fire) and has no security note at all — e.g., A3's `?seed=` URL parameter is parsed from untrusted input with no stated validation (parse/clamp to a finite integer). **Recommendation:** promote a Risks & Limits section into the feature-spec half (or have §4 explicitly own §8.13), extend the table with the above, and state the `?seed=` input contract.

### NIT

**N1 — Pinned geometry values contradict the drawn art; all exceed CC-003's own ±0.05 acceptance gate.**
- **Affected Scope:** Plan line 254 (A6), cross-ref plan 307–314 and CC-002/CC-003 contracts; `src/view/assets.ts:407` (book), 318 (counter), 245 (bench), 338 (stool).
- Upright book footprint is pinned as "0.10 × t × h" but the builder spans x −0.1..0.1 = **0.20** wide (flat book's 0.20×0.32 matches, so this is not a half-extent convention); counter topZ pinned ≈ 0.88 but the countertop slab tops at **0.96**; bench seat pinned ≈ 0.40 but the seat slab tops at **0.50**; stool pinned ≈ 0.42 but the seat cylinder tops at **0.49**. Wrong footprints weaken the overlap check (two 0.20-wide upright books spaced 0.15 apart in x would pass as non-overlapping); wrong topZ makes items settle inside the art. CC-003's "±0.05 vs. drawn art" gate would catch these, but the plan's own pinned numbers are the input to four tickets. **Recommendation:** re-pin from the builders (0.20 × t × h; 0.96 / 0.50 / 0.49) or explicitly restate the convention.

**N2 — The anti-spam claim ("transition-based … cannot spam") is false for the pickup→put-back cycle.**
- **Affected Scope:** Plan lines 147–149 (R2), 248–249 (A4); cross-ref §8.4 line 385; `src/game/model.ts:164–173`.
- Pickup immediately frees a member's slot (model.ts:171), which breaks the collection silently; dropping it straight back is a committed incomplete→complete transition, so an idle pick-up-and-put-back on a complete shelf re-fires the full animation + chime every time. The transition rule as specified cannot distinguish "re-grouped" from "returned to the same spot". **Recommendation:** specify a suppression rule in CC-007/CC-008 (e.g., no celebration when the committed drop returns the item to its previous location kind + coordinates, or a per-collection cooldown), and name the test.

**N3 — The collection chime is not observable by the planned e2e harness.**
- **Affected Scope:** Plan lines 144–145 (R2), 397–399 (§8.5, cross-ref), CC-016 ("chime path + mute"); `src/view/audio.ts:43–69`.
- `audio.play()` returns void, keeps no state, and `window.__cozy` exposes no audio introspection, so "collection chime path + mute" is untestable in headless Chromium as the suite stands (the shelf animation is DOM-observable; the chime is not). **Recommendation:** specify the observable now — e.g., a read-only `__cozy.lastSfx` log (same discipline as the existing hook), or scope CC-016's assertion to the animation DOM plus `aria-pressed` mute state only.

**N4 — Progress semantics wobble: floor drops are surface placements by the letter of the plan, so the HUD can read 28/28 with no completion.**
- **Affected Scope:** Plan lines 149–152 (R2/D3), 196 (§4 "progress semantics"); cross-ref plan 312, 330, 349, 387–391; CC-014 contract ("placed = count of items with location.kind ∈ {slot, surface}").
- The registry includes `floor` as a surface (plan 312; `findSurfaceAt` "floor fallback", plan 330) and §8.2 says "progress counts slot + surface placements" (plan 349). Under CC-014's literal definition, floor rests count as placed; the tidy-all gate excludes floor separately, yielding "placed 28/28, card never appears" — HUD progress and win state disagree, and D3's "placed/total keeps its meaning" is diluted. **Recommendation:** state that `placed` counts **non-floor** valid placements (or keep floor drops in the existing `kind: 'floor'` location), and add the HUD-vs-card consistency test.

**N5 — D6's blanket wording contradicts the surface registry's carve-outs.**
- **Affected Scope:** Plan line 228 (D6) vs. lines 315–316 (registry, cross-ref) and A7; `src/view/assets.ts:386` (window sill top), 185 (bookshelf top slab).
- D6 says "every furniture piece with a drawn flat top gets a surface entry", but the registry (correctly) excludes the window sill (a drawn flat top at z 1.08), the bookshelf's decorative slab (D5), the art frame and the spill box. The carve-outs are sensible; the decision text is not. **Recommendation:** reword D6 ("every furniture piece with a drawn flat top intended to hold objects") or enumerate the exceptions in the decision itself.

**N6 — The no-hint guarantee is enforced only by convention; strengthen the assertion to cover the view, not just the preview signatures.**
- **Affected Scope:** Plan lines 171–177 (R4); cross-ref §8.8 (lines 436–443), CC-009; `src/view/gameView.ts:412–424` (`__cozy.game` exposes the whole model).
- The designed path is clean — fit/no-fit is collection-blind (every book physically fits every tier, so the ghost cannot encode correctness), and collection state is only reachable post-commit via `collectionStatus()`. But CC-009's "static assertion" covers only that the *preview query surface* carries no collection data; nothing fails if future view code calls `collectionStatus()` mid-drag (the model is fully public, including through `__cozy`). **Recommendation:** add a cheap runtime assertion to CC-009: wrap/spy `collectionStatus()` and assert zero invocations during a simulated full drag lifecycle (pickup → moves → cancel/commit).

### Directive stress-tests — direct answers

1. **Placement vs. correctness:** Mixed-color books on a shelf with no hint — handled by design (plan 140–141) ✓. Physical-only preview leaking answers — no leak in the designed data flow, but enforcement is advisory (N6). Two overlapping surfaces — `elementsFromPoint` paint-order resolution is plausible for *selection*, but the pointer→surface-position mapping and the `findSurfaceAt` height filter are broken as specified (M2). Destination full — inconsistent between slot and surface paths (M1). Cancel after picking up a placed item — specified for all three location kinds (plan 345–349) and safe (nothing else can move mid-drag; single-held invariant, model.ts:166) ✓.
2. **Collection edge cases:** Four matching books on any tier — yes per §8.4, but the governing rule contradicts itself and one reading makes the level unwinnable (B1). Extras/mixed colors — poison/blocked ✓ (D2, plan 142). Progress backward — quiet by documented design (A4) ✓; celebration trigger is precisely specified and testable (committed-drop transitions, plan 146, 390–391) ✓, but re-fires on put-back (N2) and the chime is unobservable in e2e (N3).
3. **Layout and solvability:** Capacity — 32 slots ≥ 28 items and 4 slots/tier for each 4-book group are sufficient even ignoring surfaces ✓; effective capacity is overstated by static decor (M3). Seeded layouts — reachability + arrangement solver over ≥ 100 seeds genuinely verifies rather than asserts ✓, but the solver's target arrangement presumes the per-tier reading and is unsatisfiable under the per-shelf reading (B1); Reset/New Mess distinction (same seed vs. fresh seed, `?seed=` pinning) is specified and testable ✓, with input validation unstated (M5).

**Bottom line:** the fact base (§2) and test planning are unusually accurate and verifiable, but do not start CC-007/CC-013 until B1 is resolved — the plan currently specifies a game that cannot be won under its own recorded decisions, and the two halves of the document disagree about which rule is real.

---

## egm-structural (Structural Validator)

### Findings

**1. Major — Alternatives Rule only partially discharged; no consolidated alternatives section**
- **Affected Scope:** §§4–7 (lines 186–277) of the feature half; standard requirement "The Alternatives Rule".
- **Discrepancy:** The standard mandates a documented evaluation of considered-and-rejected alternatives with concrete trade-offs. The feature half contains no "Alternatives Considered" section; §5 records D1–D6 as user answers with consequences, and only some carry one-line rationales (D4 "Smallest diff; existing 20 tests largely survive", D5 "Least art/layout cost") without naming the rejected options they beat (e.g., tier-scoped counting vs shelf-clean for D2; slots-only extension vs the new surface layer for D4; hand-authored layouts vs seeded scatter for R3). Rejection rationales do exist but are scattered (§4 "Stack guarantee" rejects a rewrite with a reason; §8.3 rejects ray-casting for `data-surface` hit-testing; §8.9 is a genuine options analysis) — and §8.9 explicitly decides nothing ("this section plans nothing", "No tickets are created for either option"), so it cannot serve as the alternatives record. Rationale: a fresh reader cannot trace which designs were rejected and why for the core design-shape decisions.

**2. Major — §7's assumption→ticket traceability claim is not discharged anywhere**
- **Affected Scope:** §7, line 271 ("each small, reversible, and listed with its ticket") and §7 item 2 ("the owning ticket's acceptance criteria").
- **Discrepancy:** Zero references to assumptions A1–A10 exist in the ticket store — grep across `docs/tickets/CC-001.md`–`CC-017.md` and `tickets.json` returns no hits for `A[0-9]` or "assumption". Within the plan itself, only A10 is ticket-tagged (§8.13 line 578, "budget check in CC-017 (A10)"); A1–A4, A6, A7, A9 appear in §8 prose with no ticket attached, and A5 (ghost styling) and A8 (sofa seat) are never referenced outside §6 at all (their substance is re-described in §8.3/CC-005 and §8.1/CC-003 without the A-citation). The claim that each assumption is "listed with its ticket" is therefore structurally false: the mapping §7 promises does not exist in either half or the store.

**3. Major — Ticket graph does not gate the chime/animation verification: CC-008 has no dependents**
- **Affected Scope:** §8.10 table lines 512/520/521; §8.12 line 565; §8.14 criterion 2; store `dependsOn` fields.
- **Discrepancy:** R2 (lines 144–145) promises "a short animation at that shelf and a soft chime that respects the mute toggle"; §8.12 and CC-016's owned behaviors include "collection chime path" and "Mute: mute on → complete a collection → no chime path errors"; CC-008's own record defers Playwright coverage to CC-016. But CC-008 appears in no `dependsOn` list: CC-016 depends on CC-006, CC-009, CC-011, CC-012, CC-013, CC-014, and CC-017 on CC-004/005/007/011/012/013/014 (verified against `tickets.json` and §8.10). The verification gates (CC-016/CC-017) can run green before the chime/animation exists, contradicting §8.14 criterion 2. A CC-008 → CC-016 dependency (acyclic) would discharge the promise the store currently leaves unenforced.

**4. Nit — "insufficient clearance" test case is named but owned by no ticket**
- **Affected Scope:** §3 R1 lines 121–122; §8.12 line 553; CC-004/CC-015 acceptance lists.
- **Discrepancy:** §8.12 (line 553) names "insufficient clearance" and claims "CC-015 owns the full list", but CC-015's record omits it (its surface bullet covers only overlap/towel-vs-stool/occupied-slot/surface), and CC-004's acceptance bullets also lack a clearance case — even though clearance is rule 2 in §8.2 and a required R1 behavior (height clearance, line 121–122). The R1 row of §8.11 (line 542) likewise omits it. One requirement-backed named test with no ticket-record owner. Relatedly, CC-015's record omits the "preview-isolation assertion" that §8.12 (line 558) places in its full list (it lives in CC-009 instead) — a minor ownership mismatch.

**5. Nit — Risks & Limits live entirely outside the audited feature half; security unaddressed**
- **Affected Scope:** §§1–7 (lines 1–280); standard requirement "Risks & Limits".
- **Discrepancy:** Sections 1–7 contain no risks/mitigations content and no pointer to §8.13, although the "How to read" header (lines 16–17) claims "A reviewer should be able to judge this upgrade without any other context" from the product story. §8.13 (cross-reference) does discharge failure modes/scalability, but its seven-row table contains no security implications row anywhere in the document — e.g., the `?seed=` URL parameter (§6 A3, line 245) is user-controlled input with no validation discussion, and the standard explicitly requires identifying security implications.

**6. Nit — §1's "only repo additions" claim is contradicted by the working tree**
- **Affected Scope:** §1, lines 40–44.
- **Discrepancy:** The plan states the only repo additions are "this plan, `docs/tickets/` and … `scripts/tickets.cjs`". `git status` against baseline `39d9079` shows an additional untracked `docs/review/` directory. The claim is absolute; it should say so or be amended.

**7. Nit — R4 conflates a testable constraint with a scope non-goal**
- **Affected Scope:** §3 R4, lines 180–182; §4 lines 201–202; §8.11 line 545.
- **Discrepancy:** R4's "no rotation in this pass" clause has no ticket and no acceptance test by design (§8.11: "camera: §8.9 analysis only, no tickets"), and is simultaneously discharged as an out-of-scope item in §4 (line 201–202). Stating it as a requirement row keeps the R1–R4 → tests matrix incomplete (one requirement without an observable test); as a §4 non-goal the matrix would be total. The no-hint half of R4 is fine — CC-009's preview-isolation assertion is observable.

**8. Nit — Header metadata table uses an empty header row**
- **Affected Scope:** Lines 3–10.
- **Discrepancy:** The metadata block is a two-column table whose header row is blank (`| | |`), which renders with an empty header band; a labeled key/value table would be cleaner. Formatting is otherwise valid GFM.

### Directive stress-tests — results

**Directive 1 (R1–R4 traceability): PASS with findings 3, 4, 7.** Map verified against §8.10–§8.12 and the store (`node scripts/tickets.cjs check` → 17 tickets: 1 epic, 11 impl, 5 verify; DAG OK; topological order and every `dependsOn` row match §8.10 exactly). R1 → CC-002/003/004/005 → CC-006/015/016/017 with named pure+e2e cases (CC-004 and CC-006 acceptance lists enumerate them); R2 → CC-007/008/014 → CC-009/015/016, with CC-009 mapping 1:1 onto CC-007's acceptance bullets; R3 → CC-010/011/012/013 → CC-015/016/017 with named cases (≥ 100 seeds, solver, Reset determinism, New Mess diversity, 28-item e2e playthrough); R4 → CC-005/007 → CC-009. No test without a requirement (console-error gate and screenshot archiving attach to the regression gate as housekeeping). Gaps are findings 3 (ungated chime), 4 (unowned clearance case), 7 (rotation clause).

**Directive 2 (R3 solvability verification): PASS.** The §3 promise (lines 165–167) is structurally discharged with all three named elements: mechanism — CC-013 exports reachability (free-space connectivity) + arrangement-existence (backtracking solver, "each color set on its own clean tier") validators from `src/game/scatter.ts` (§8.7 step 4, lines 428–431); owners — CC-013 implements/exports, CC-015 runs them ("reachability for ≥ 100 sampled seeds"; "Completable by construction … for the shipped level and sampled seeds"), and the §8.13 risk row (line 574) cites CC-013/CC-015; test cases — §8.12 lines 556–558 plus CC-013 acceptance bullet 3 and CC-015 bullets 8–9. No finding.

### Structural vectors that passed

Heading hierarchy is clean (H1 → H2 §§1–7 → H3 R1–R4; tech half H2 → H3 §8.1–8.14; no skipped levels); tables and lists are well-formed; no unclosed code blocks in range; no external links to validate; all internal cross-references (§8.2/8.3/8.8/8.9, D1–D6, A1–A10) resolve. §2's product snapshot was verified accurate against source: 13 furniture / 5 zones / 12 items (3+3+2+2+2) / 12 slots; bookshelf boards z 0.68 / 1.3 / top 2.2 with decoy static books (teal/mustard/terracotta) plus a small stack on the slot tier (`assets.ts:164–181`); rejection union, radius 0.95, LIFT 0.55, `depth = x+y`, `toScreen`/`toFloor` inverse, audio union `{pickup, place, return, complete}` with mute checked inside `play()`, read-only `__cozy` hook, book covers/heights 0.30–0.36/t 0.045–0.06; e2e step list and "Playwright not in package.json" both match; 14 + 6 = 20 tests matches the header and README; baseline commit `39d9079` message matches.

---

## egm-style (Technical Copy Editor)

### Claim-calibration verdict (audit-verified framing)

The document's "verified by audit" framing is, with two exceptions below, accurate. Independently re-verified against source and repo state: commit `39d9079` exists; `node scripts/tickets.cjs check` outputs "TICKET STORE OK — 17 tickets (1 epic, 11 impl, 5 verify)… DAG verified"; `npm test` re-run → 20/20 green (14 model + 6 level, vitest environment `node` per `vite.config.ts`). Section 2 traces cleanly: 13 furniture / 5 zones / 12 items / 12 slots; book variants teal/terracotta/mustard, h 0.30–0.36, t 0.045–0.06 (`assets.ts:397–401`); bookshelf boards 0.68 / 1.3 / 2.2 with decoy static books on the slot tier plus stack (`assets.ts:173–185`, ownership confirmed in CC-010.md); rejection list, carry-height compensation (`model.ts:147–148`), `DROP_RADIUS = 0.95` / `LIFT = 0.55` (`gameView.ts:13–14`), HUD / "Home, at last." / read-only `__cozy` hook; mute honored inside `play()` (`audio.ts:44`); e2e checklist matches `scripts/e2e.cjs`; Playwright absent from `package.json`. §4 stack-guarantee claims (pure model, data-derived view, single projection module) match evidence. One boundary note: "Playwright e2e green" could not be re-executed here (Playwright not installed); it rests on README's recorded run — acceptable, no finding.

### Findings

**1. Major — §7 "Outstanding questions" (lines 269–277) — Uncalibrated claim.**
"…the documented assumptions in §6 — each small, reversible, and **listed with its ticket**," plus the follow-up "the **owning ticket's** acceptance criteria get updated." Uncalibrated: no §6 bullet names a ticket; `rg 'A[0-9]|assumption'` over `docs/tickets/tickets.json` and all CC-*.md returns **zero** matches; within the document only A10 is explicitly tied to a ticket (CC-017, line 578), and A5 and A8 attach to no ticket anywhere. The "owning ticket" instruction dangles for at least those two. **Action: CALIBRATE** — add the owning ticket id to each §6 bullet (or one mapping line per assumption) so the claim matches the artifact.

**2. Major — §6, assumption A6 (line 254) — Claim about existing behavior mismatches its evidence.**
"book flat 0.20 × 0.32, upright **0.10 × t**". Flat matches the asset exactly (`assets.ts:411`: 0.2 × 0.32 × 0.05). Upright does not: `assets.ts:407` `box(-0.1, −t/2, 0, 0.1, t/2, h)` spans **0.20** in x, not 0.10. These numbers are load-bearing — they become footprint/collision inputs (CC-004). **Action: CALIBRATE** — correct to 0.20 × t, or state the convention that yields 0.10.

**3. Nit — §1 (lines 40–44) — Stale absolutist repo-state claim.**
"This document and the ticket store are the only artifacts produced so far… the only repo additions are this plan, `docs/tickets/` and … `scripts/tickets.cjs`." Current `git status` shows a fourth untracked path, `docs/review/`. Present-tense absolutism goes stale as soon as any other artifact lands. **Action: CALIBRATE** — scope to "at the time of writing" or acknowledge process artifacts.

**4. Nit — §2, Rules bullet (lines 70–72) — Constant attributed to the wrong file.**
"…within radius 0.95" is listed under the `model.ts` bullet, but the model takes `radius` as a parameter (`model.ts:138`); 0.95 is the view constant `DROP_RADIUS` (`gameView.ts:13`). The section's own preamble says "file names are the authority for each behavior" — attribute 0.95 to `gameView.ts`.

**5. Nit — §1 (line 29) — Subjective evaluation + filler.**
"makes the game **meaningfully more playful** and replayable" — unprovable quality judgment; "meaningfully" adds no signal. The numbered list carries all content; a dry frame suffices.

**6. Nit — §1 (line 37) — Metaphor in place of a spec.**
"the game **stays honest**" — R4 states the same constraint plainly ("no correctness hints… no camera rotation"); drop the metaphor here.

**7. Nit — §3 R1 (line 127) — Subjective qualifier.**
"**simple** room-coordinate rules" — simplicity is an opinion about code not yet written; the rule list that follows is the claim.

**8. Nit — §3 R1 (lines 121–122) — Opaque coinage.**
"the **sofa-cannot-fit-in-a-cabinet class of rule**" is hard to parse on first read; the operative wording ("footprint + clearance checks") is already in the same sentence — use it alone.

**9. Nit — §3 R3 (lines 158–159) and §6 A2 (line 244) — Unmeasurable success criterion, stated twice.**
"readable at game scale" — no objective proxy or verification is named. Point to the check (e.g., screenshot/e2e visual review in CC-016) or a measurable proxy (minimum rendered spine-band width).

**10. Nit — §6 A10 (line 263) — Vague tail on a calibrated claim.**
"data-driven SVG keeps 28 items **cheap**" — the measurable part is the ≈25 kB budget (which matches README's ~12.5 kB baseline); "cheap" is filler. Drop it.

No Blockers. Defensive-caveat scan of the remaining hedges ("both stay possible later by design", "will not need to change" at line 177, "no rework needed" at line 274, "Nothing can be lost or duplicated" at line 75) found no blanket disclaimers over inactive failure modes and no capability claims outrunning evidence — all KEEP as written.
