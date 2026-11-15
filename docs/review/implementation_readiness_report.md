# Implementation Readiness Report — Stage 9

**Target:** `docs/cozy-corner-upgrade-plan.md` (DetailedRange lines 281–596) + ticket records CC-001…CC-017
**Reviewers:** `egm-implementation-readiness` (completed), `egm-codebase-details` (completed), `egm-style` (completed)
**Standards:** egm-implementation-readiness → implementation-readiness-standard, egm-codebase-details → implementation-readiness-standard, egm-style → none
**Mode:** REVIEW · Preset: uninterrupted

---

## egm-implementation-readiness (Tech Lead)

**Verification context (all claims checked against the repo, not the plan's own text):** `node scripts/tickets.cjs check` passes (17 tickets, DAG verified, topo order matches §8.10). Baseline claims are accurate: 20 tests (14 model + 6 level), 12 items, decoy static books on the interactive tier (`src/view/assets.ts:175-181`), wall height 2.9, node-only vitest env (`vite.config.ts`). Ticket records match `tickets.json`. CC-002 is fully actionable as written. Directive 2 verdict: the browser-test discipline is sound — current `scripts/e2e.cjs` drives only real `page.mouse` drags and a read-only `__cozy` hook (lines 46–59), and CC-006/CC-016 contract "real pointer events only + read-only hook"; no state-mutation bypass is planned.

### Blockers

**B1 — The shelf-clean predicate is self-contradictory, and one of its two readings makes the level unwinnable.**
Affected scope: §8.4 (plan 375–391), R2 (plan 137–139), D2 (plan 224), CC-007 record (docs/tickets/CC-007.md:14–17 vs 46–49), `tickets.json` CC-007 contracts.
CC-007's prose says a collection is complete iff its four books are on one tier "and **the rest of that shelf holds nothing else**. One shelf effectively hosts one clean collection at a time" — matching D2's consequence column ("One clean collection per shelf at a time") and R2. But the "precisely" contract in §8.4 / CC-007's own contract bullets (zero non-book occupants; *each non-empty tier* single-collection; candidate's 4 books on one tier) allows **multiple** collections, each clean on its own tier, of the same shelf. D3's tidy-all win rule requires **all three** collections currently complete simultaneously (plan 387–391), and D5 provides exactly **one** bookshelf. Under the one-per-shelf reading, at most one collection can ever be complete → the level can never be completed, CC-016's "full playthrough → card" and CC-007 acceptance "book on the counter blocks completion" (implying completion is otherwise reachable) are unsatisfiable. An implementer of CC-007 cannot know which predicate to code.
Guidance: pin the per-tier reading (multi-collection shelves permitted; each occupied tier single-collection; no non-book items anywhere on the shelf) in D2, R2, §8.4 and CC-007 prose, and add a named pure test "all three collections complete simultaneously on the one shelf" plus its inverse (foreign book on a completed tier breaks it).

**B2 — The contracted surface-aiming convention cannot satisfy its own acceptance tests: floor-plane mapping + settle at `(x, y, topZ)` displaces every elevated-surface drop.**
Affected scope: §8.3 (plan 354–368), CC-005 (record lines 15–23), CC-006 ("counter drop persists"), CC-016, `src/view/projection.ts:30-39`, `src/view/gameView.ts:173-178,217-228`.
§8.3 pins "the pointer still maps through the floor plane" and step 4 settles at `(x, y, topZ)`; CC-005 ghosts are "snapped to the hovered surface plane (projected at topZ)" — i.e., the drop point is the z=0 projection of the cursor. With `toScreen(x,y,z) = ((x−y)·cos30°, (x+y)·sin30° − z)` and sin30° = 0.5, the floor projection of a cursor visually touching surface point `(px, py, topZ)` is exactly `(px − topZ, py − topZ)` (displaced by topZ along **both** floor axes). For the counter (topZ ≈ 0.96, surface depth 0.68 per CC-003 bounds y 0.02–0.70), a cursor on the visible top face maps to `y ∈ [−0.94, −0.26]` → the footprint-bounds check (§8.2 rule 1) rejects **every** visually-aimed counter drop as `out-of-bounds`; the ghost renders 0.96 units above the cursor. Bench (0.50) and shelf tiers (0.68) lose their front halves; the flagship R1 example ("a book can sit on the kitchen counter") is unimplementable as contracted. The slot path already solves this exact problem via carry-height compensation (`model.ts:127-156`) — the plan preserves it for slots but omits the surface-plane equivalent.
Guidance: pin the aiming convention for surfaces: map the pointer through the hovered surface's plane (z = `surface.topZ`) — equivalently shift the floor-projected point by `(+topZ, +topZ)` — and use that point for `validateSurfaceDrop`, ghost placement, the committed `DropTarget.surface.{x,y}`, and the settle anchor. Update CC-005/CC-006/CC-016 with a concrete acceptance: "drag onto the visual center of the counter top → book lands within ε of the aimed surface point"; specify how CC-016's `clientFromWorld(x, y, topZ)` targets round-trip under this convention.

### Majors

**M1 — CC-004's file scope forbids the type changes its own behavior requires; success/restore result shapes for surfaces are never defined.**
`DropResult`'s ok-branch carries a mandatory `slotId: string` and `PickupResult.from` is `Extract<ItemLocation, {kind:'floor'|'slot'}>`. A unified `drop(itemId, target)` accepting surface targets must say what the ok-branch returns for a surface, and pickup-from-surface must return a surface location for exact cancel-restore. Both need `types.ts`/`model.ts` edits beyond the "rejection union only" boundary, and no ticket or plan section pins the new shapes. Guidance: add the revised `DropResult` and `PickupResult.from: ItemLocation` to §8.1 and widen CC-004's file scope.

**M2 — Footprint registry wiring and the orientation↔footprint binding are unspecified (CC-003/CC-004 leave structural choices open).**
CC-002 adds `surfaces/collections/seed` to `LevelDef` but **no footprint data** — `ItemFootprint` has no home in the schema, no `orientation` field exists on `ItemLocation.surface`, and nothing says how the pure model resolves an item's footprint (by `asset` key? by `category`? per-variant?) or the furniture AABBs. CC-003 scatters the tables across `house.level.ts` and `assets.ts` exports, which the model would have to import — module ownership and purity boundary undeclared. Validity depends on orientation (upright 0.20×t×h vs flat 0.20×0.32×0.05) yet whether a book dropped on a *surface* is flat or upright is nowhere pinned. Guidance: pin the registry module and lookup key (e.g., `ITEM_FOOTPRINTS[asset][orientation]`, `FURNITURE_FOOTPRINTS[furnitureId]`, in a pure module), and how a surface location records or derives orientation.

**M3 — Physical interaction between slot placements and surface placements is undefined on shared furniture.**
Bookshelf tier *surfaces* and tier *slots* coexist (CC-010), the sofa seat surface coexists with cushion home slots (A8), entryMat surface with shoe slots. A free drop onto the slot anchor's spot visually overlaps the slotted item and passes every contracted check. Guidance: surface validity treats each occupied slot's anchor as an immovable AABB occupant of that surface (recommended), or exclude slot-occupied regions from surface bounds; add a named test "surface drop overlapping an occupied slot's anchor is rejected".

**M4 — CC-003's "pinned" registry values contradict the drawn art beyond the ticket's own ±0.05 tolerance, and static props on approved surfaces are unhandled.**
Kitchen counter pinned ≈0.88 but the drawn countertop top face is z 0.96 (`assets.ts:305-329`); bench pinned ≈0.40 but the upper seat slab tops at 0.50 (`assets.ts:244-245`); stool pinned ≈0.42 but the seat cylinder tops at 0.49 (`assets.ts:338`). Each off by 0.07–0.10 — failing CC-003's own "±0.05 units" acceptance if implemented as written, forcing the implementer to re-derive values (a decision). Static decor baked into approved surfaces is unaddressed: cutting board + kettle on the counter, folded linens + basket on the linen shelf's upper board (`assets.ts:264-271`). "linenShelf tiers — from asset boards" never says *which* boards become surfaces. Shoe footprint height 0.10 vs drawn ≈0.20 is a further mis-pin. Guidance: re-pin topZ to drawn top faces; enumerate the exact linen tier set; specify static-prop handling; correct the shoe footprint.

**M5 — Surface ghost semantics are underspecified.**
Slot ghosts are static per-slot outlines; a `Map<surfaceId, …>` implies one static node per surface, but a free-form surface (counter ≈3×0.68) needs a footprint-sized outline that **tracks the drop point** at the surface plane and toggles fit/no-fit styling — shape source, position tracking, and no-fit rendering are unpinned. The book ghost shape is a flat rect (`assets.ts:525`), which cannot represent an upright tier book. Guidance: pin ghost = the item's current-orientation footprint outline rendered at the live drop point projected onto the hovered surface's plane, classed `fit`/`no-fit`; decide the role of `ghostBySurface` in the plan, not in CC-005.

**M6 — Target precedence (slot vs surface vs floor) is undefined — the "ghost precedence" question.**
During a drag, the floor-projected point can simultaneously be within `DROP_RADIUS 0.95` of a free category slot *and* over a `[data-surface]` (shelf tiers overlap their own slots). §8.3 keeps slot aiming "untouched" and adds surface intent resolution, but never says which target wins, which ghost shows, or what `finishDrag` commits. Guidance: pin a deterministic precedence chain, e.g. (1) slot match wins when present, else (2) `[data-surface]` hit, else (3) implicit floor — plus the ghost behavior for each branch.

**M7 — Exact cancel/invalid restore can collide with state that changed while the item was held; no resolution is specified.**
While item A is held, item B may legally take A's old slot or overlap A's old surface spot. "Cancel → return the item to its exact previous location" then violates slot-occupancy / footprint-overlap invariants. Today's code has an implicit slot fallback (re-drop; on failure, floor near drop point), and the plan neither adopts nor replaces it for slots, and defines nothing for surfaces. Guidance: specify restore as a model contract: attempt exact restore; on conflict, the deterministic fallback for every location kind; add named tests.

**M8 — CC-016's dependency list omits CC-008; CC-017's e2e gate doesn't depend on CC-016.**
CC-016 asserts "collection chime path executes without errors" and completion animation — features that only exist after CC-008. CC-016 can legally start per the store before CC-008 closes; likewise CC-017 runs the "full e2e green in one pass" gate without depending on CC-016. Guidance: add CC-008 to CC-016's `dependsOn` and CC-016 to CC-017's.

**M9 — CC-013's arrangement solver leaves its search space and its validators' signatures unpinned.**
"Backtracking solver over placements" — but surface placements are *continuous*; the solver must either be slots-only (feasible: 16 shelf + 16 home slots = 32 ≥ 28) or discretize surface placements — a substantive algorithmic choice, with no step/time budget to keep `npm test` bounded. The exported validators have no typed signatures, and "free-space connectivity" has no grid resolution. Guidance: pin signatures, declare slots-only or discretized-surface search, and give the solver a node/step budget with a distinct failure reason.

### Minors

- **m1** — e2e gate is red in the window between CC-011 and CC-016: `scripts/e2e.cjs` hardcodes 12 items and `0/12` HUD (lines 41–43, 88, 134, 139); CC-011 flips the level to 28 items before CC-016 rewrites the script. Guidance: give CC-011 (or CC-013) an explicit e2e update step, or document the expected-red window.
- **m2** — `findSurfaceAt(x, y, carryZ)` is contracted (CC-004) and asserted isolated (CC-009) but has no consumer in the pinned view flow. Either name its consumer or cut it from the contract.

### Nits

- CC-010: "all gaps ≥ 0.36 **+ margin**" — margin never quantified.
- CC-013: scatter "per-item small rotation" range unpinned (today's data uses −14°…+21°); "pairwise spacing ≥ 0.7" ambiguous between center-distance (as `level.test.ts:58` does) and footprint-edge distance.
- CC-014: seed display "title attribute or small text" and the new hint copy text are left to the implementer.
- `collectionStatus().tierSlotIds` mislabels surface placements — a collection can complete via tier *surface* drops; rename (e.g., `tierId`) or include both.
- Four tickets parallelize over `src/view/assets.ts` (CC-003 constants, CC-005 tags, CC-010 rebuild, CC-012 variants) with no merge/sequencing note.

### Bottom line

The plan's structure is strong — real DAG-backed ticket graph, explicit file boundaries per ticket, named test lists, honest §8.9 no-ticket analysis — and the browser-test discipline is genuinely clean. It fails the Zero-Decision Rule in two places that are fatal rather than cosmetic: the shelf-clean predicate contradiction (B1) makes the accepted win rule unreachable under one documented reading, and the pinned surface-aiming convention (B2) mechanically rejects every visually-aimed drop on the plan's own flagship surface. Resolve B1/B2 and the M1–M4 contract gaps (result shapes, footprint/orientation binding, slot-vs-surface overlap, registry values) before CC-003/CC-004/CC-005/CC-007 start; everything else can be fixed by ticket-store edits.

---

## egm-codebase-details (Technical Quality Auditor)

Audited against: `src/game/{types,model}.ts`, `src/level/house.level.ts`, `src/view/{projection,scene,gameView,assets,audio,palette,svg}.ts`, both test files, `scripts/{e2e,tickets}.cjs`, `package.json`, `vite.config.ts`, `README.md`, `docs/tickets/tickets.json` + CC-001…CC-017 records. Store claim re-verified by running `node scripts/tickets.cjs check` (read-only): OK, DAG, topological order printed.

### Findings

**1. 🔴 Blocker — Upright-book footprint is 2× off the builder it claims to be pinned to.**
Affected scope: plan §8.1 line 307–309 ("book upright 0.10 × t(0.045–0.06) × h(0.30–0.36)"); same value in §6 A6 (line 254) and CC-003 contract.
`book()` upright branch (`src/view/assets.ts:407`) draws `box(-0.1, -v.t/2, 0, 0.1, v.t/2, v.h)` — full x-extent **0.20**, not 0.10; `staticBook()` (assets.ts:159) is likewise 0.2 wide. The flat book is quoted as the full extent (0.20 × 0.32, matching `box(-0.1,-0.16,0,0.1,0.16,0.05)`), so the table is internally inconsistent and CC-002's own contract defines dx as the "full ground footprint… centered on anchor". CC-003 will registry a footprint half the drawn size; surface-edge fit ghosts and the ε=0.01 overlap check will over-accept.

**2. Major — Three of the seven pinned surface topZ values quote the slab *underside*, not the walkable top.**
Kitchen counter ≈ 0.88 → countertop slab items rest on is **0.96** (off 0.08); bench seat ≈ 0.40 → **0.50** (off 0.10); stool ≈ 0.42 → **0.49** (off 0.07). All three exceed the plan's own ±0.05 pinning tolerance; settling to these topZ values sinks items into the drawn slabs. (Sofa 0.55 and entry mat ≈0.02 do match.)

**3. Major — Shoe footprint value does not match the drawn asset.**
`shoe()` draws a 2D profile sheared into the ground plane (assets.ts:462–495): world x-span ≈ 0.30 ✓, but world y spans ≈ 0.37 for one shoe, ≈ **0.48** for the drawn pair (back shoe offset +0.11 in y). The asset has no z extrusion at all (flat ground-plane shape), so "height 0.10" has no basis either. Registered 0.30 × 0.18 would let shoes overlap far beyond their art.

**4. Major — "Painter's-algorithm risk … is handled by per-item depth keys that already exist" is false for item-vs-furniture occlusion, which is exactly the new risk.**
Per-item depth keys exist only *within* the items layer (`gameView.ts:147–156`); the scene appends fixed layers `decals, props, ghosts, labels, items, drag` (`scene.ts:219`), so **every item always paints above every furniture piece** regardless of depth. Concrete failure: an upright book in a near-end slot on a rebuilt tier is *behind* the bookshelf's near side panel (world y 2.63–2.70, greater depth) yet paints over it. README's own Limitations section admits this class of bug. CC-010's "no overlap glitches" acceptance cannot be met by the cited mitigation; the plan must specify the actual fix (layer merge, asset splitting, or per-item z-insertion) or stop claiming it's handled.

**5. Major — `findSurfaceAt`'s carryZ gate contradicts the feature it exists for; its role and null semantics are unpinned.**
Documented carry height is LIFT = 0.55 (`gameView.ts:14`). Under `topZ ≤ carryZ + tol`, `findSurfaceAt` can never resolve the kitchen counter (0.88/0.96), any bookshelf tier (0.68–1.88), or the linen upper tier (1.33) — precisely the elevated targets CC-006's slice and R1 require. §8.3 resolves intent via `elementsFromPoint` (which never calls `findSurfaceAt`), leaving the API's caller, its carryZ purpose, and the `SurfaceDef | null` vs "'floor' as fallback" contradiction undefined — a design choice pushed to the implementer, violating the Zero-Decision Rule.

**6. Major — Unified `drop()` success payload is unspecified for surface targets.**
The current `DropResult` ok-branch carries a mandatory `slotId` (`model.ts:16–24`), consumed by the type contract and tests. The plan changes the input to `DropTarget` but never says what the success result contains for `{ type: 'surface' }` drops. This is the plan's centerpiece API; the shape must be pinned.

**7. Major — Ticket store contradicts the plan's canonical `SurfaceDef` contract: CC-003 invents `kind 'mat'`.**
CC-003 contract (tickets.json line 63; CC-003.md line 31) uses `kind 'mat' walkable`; plan §8.1 line 293 and CC-002 declare `kind: 'floor' | 'furniture'`. Implemented literally, CC-003 fails `tsc`. Walkability is already encoded by the floor-exclusion list, so `'mat'` is a stray kind. CC-001 declares the plan the single source of truth; the record must be reconciled before CC-003 starts.

**8. Major (reported once per persona) — File lists carry no Create/Modify/Delete labels.**
Only two paths are labeled — CC-013 "src/game/scatter.ts (new, pure)" and CC-015 "src/game/scatter.test.ts (new)". Every other path in ticket `files` arrays is unlabeled. One labeled allowlist is required for a Phase-5 write gate.

**9. Nit — "plus a small stack" misdescribes where the decoy stack is.**
The three `staticBook`s at z 0.68 (assets.ts:177–179) do sit on the interactive slot tier, but the "small stack" (assets.ts:180–181, z 0.10–0.20) is already in the bottom cubby — CC-010's remedy "move to the non-interactive bottom cubby" is a no-op for it.

**10. Nit — Drag-bounds rationale in §8.3 is confused.**
The drag clamps floor coordinates only (`gameView.ts:221–222`); reachability of elevated surfaces comes from hit-testing/aiming, not these clamps, and the mug rack has no surfaces at all (A7) — "rack-adjacent tiers" is unclear. The sentence should state what actually changes (if anything).

**11. Nit — No precedence rule when a slot and a surface both match the drop point.**
Bookshelf slots sit on tier surfaces, so near a free slot both match. §8.3 never states slot-wins-over-surface; since `DragState.target` becomes a single `DropTarget | null`, this must be pinned to preserve today's "exactly one ghost mid-drag" e2e assertion (`e2e.cjs:79–80`), which CC-005 promises stays green unchanged.

### Verified consistent (no findings)

§8.10 ticket table matches `tickets.json` exactly (ids, kinds, all 17 `dependsOn` edges; 1 epic / 11 impl / 5 verify; DAG and printed topological order confirmed). Directive 2: browser tests are genuine drags — `e2e.cjs:46–56` drives `mouse.move/down/up` with stepped moves; `__cozy` (`gameView.ts:411–424`) exposes exactly `game, level, itemClientPos, clientFromWorld` and the script only queries; reset is a real `#btnReset` click. Constants/claims that check out: DROP_RADIUS 0.95, LIFT 0.55, carry-height compensation, zone labels, `toFloor`/`toScreen` exact inverse, `depth() = x+y` and `sortBias` abstraction, mute gate inside `play()`, ghost teal style, vitest `node` env, 20 = 14+6 tests, decoy static books on the tier, `src/style.css` exists, sofa seat 0.55, entry mat ≈0.02, bookshelf footprint 0.58 × 1.60, mug/cushion/towel footprints within the stated ±0.05, palette sources for red/green/blue, and both §8.9 camera options' technical premises. Proposed contracts are correctly framed as additions — nothing non-existent is claimed as current except where flagged above.

---

## egm-style (Technical Copy Editor)

### Findings

**1. Major — §8.1, lines 307–310 (footprint values); echoed in A6, line 254.**
"Book upright 0.10 × t × h" — the upright book builder spans x −0.1…0.1, i.e. **0.20**, not 0.10 (`assets.ts:407`). "Cushion 0.45 × 0.45 × 0.12" — the drawn cushion is ±0.205 → **0.41** wide (`assets.ts:449–451`); 0.45 is the *ghost* outline (`assets.ts:527`), and the drawn top layer sits at z≈0.155–0.16, not 0.12. The remaining values (book flat, mug) match the builders exactly, which makes the two mismatches look authoritative rather than provisional. **Action: CALIBRATE** — correct the numbers or explicitly mark all values as estimates to be pinned in CC-003, and note that narrowing the upright book to 0.10 would be an undocumented art change owned by CC-012.

**2. Major — §8.1, lines 312–316 (surface registry topZ).**
The registry mixes two conventions: top faces (sofa ≈ 0.55 = seat slab top; linen tier 0.91 = board top) versus slab undersides (counter ≈ 0.88, drawn top face **0.96**; stool ≈ 0.42, seat cylinder spans 0.42→**0.49**; bench ≈ 0.40, top slab 0.4→**0.50**). Since §8.3 settles items at `(x, y, topZ)` and A9 derives clearance from `topZ`, the underside values make items sink ~0.07–0.10 into the drawn surface. **Action: CALIBRATE** — pin the convention ("topZ = top face of the drawn placement surface") and correct the three values, or state explicitly that conservative undersides are intentional.

**3. Major — §8.3, lines 356–361.**
"Stays robust at any viewport size (the existing resize-proof e2e discipline)" — an unbounded universal claim backed by a single resize scenario (1280×860 → 960×700, one mug drag, `e2e.cjs:142–149`). The existing suite proves resize tolerance for *current* slot drops; robustness of the *new* `elementsFromPoint` surface hit-test is future behavior to be established by CC-016. **Action: CALIBRATE** — claim the mechanism is viewport-independent by construction and cite the CC-016 resize coverage as its verification.

**4. Major — §8.9, lines 460–462.**
"A one-line change behind the existing `depth()` abstraction" — `depth()` exists (`projection.ts:49`), but the items layer does **not** use it: `gameView.ts:147,152` compute `a.x + a.y` / `loc.x + loc.y` inline and sort locally. A view-dependent depth therefore touches the projector plus two inline call sites, or requires a refactor to route item sorting through the abstraction. The claim understates Option A's cost, which is the whole point of the section. **Action: CALIBRATE.**

**5. Major — §8.7, line 427; §8.13, line 574.**
"Never fails" / "fallback chain never fails" — an unprovable absolute about unwritten code, stated twice. The chain's last link is the shipped layout, which the test plan does validate. **Action: CALIBRATE** — e.g. "always terminates in a valid layout; the final fallback is the shipped layout, proven completable by the solver test."

**6. Major — §8.14 item 4 (lines 589–591); §8.6 (lines 408–411).**
"28 items with **readable** variants and spine markings" / "readable beyond hue" — unmeasurable acceptance language. No named test asserts legibility; screenshots are archived but nothing checks them for it. An acceptance criterion CC-017 gates on must be verifiable. **Action: CALIBRATE** — define a concrete proxy (e.g., spine band count distinguishable in archived e2e screenshots at the default viewport) or drop the adjective and keep the measurable part.

**7. Nit — §8.4, lines 375–380 (shelf-clean predicate).**
Bullets 1 and 4 are redundant with different scopes: "zero **non-book** occupants" vs. "no **foreign** item (**including non-book items**)". The parenthetical re-states bullet 1, and bullet 1 read alone would contradict D2 by admitting foreign *books*. Merge into a single bullet stating: no item outside the candidate collection rests anywhere on the shelf.

**8. Nit — §8.2, lines 330–331.**
`findSurfaceAt(x, y, carryZ): SurfaceDef | null; // topmost surface under the carry point; floor fallback` — the comment says "floor fallback" while the signature says `null`. If floor is a registered surface, say the function returns the floor surface; `null` then means only "no registry entry."

**9. Nit — §8.5 (lines 395–398); §8.6 (lines 408–409).**
Subjective descriptors in a technical contract: "warm two-note chime," "gentle sparkle," "deep **cozy** teal-blue." Separately, "teal-blue" names no palette token: the palette has no blue family, and its teal is green-leaning (`#3d7a74`/`#254e4a`, `palette.ts:28–30`) — which matters because the leaf-green collection (`#5c7f5f`) must stay distinguishable from it (R3). **Action: CALIBRATE** (teal-blue) — name the exact token (e.g., `tealDeep`) or state a new token is required; trim "warm"/"gentle"/"cozy."

**10. Nit — §8.7, lines 423–425.**
"Footprint-aware pairwise spacing (≥ 0.7 small items)" — "small items" is undefined in a numeric rule. Define the class or give per-category values.

**11. Nit — §8.13, line 578 (bundle row).**
"Data-driven SVG; budget check in CC-017 (A10)" — the gate is named but the budget is not; A10's measurable number (≈ 25 kB gzip, 2× today's 12.5 kB) should be restated here so the CC-017 check is self-contained and falsifiable. **Action: CALIBRATE.**

**12. Nit — redundancy.**
"'Play again' = New Mess" appears in both §8.5 and §8.7; "no tickets" for camera work is stated five times (§8.9 intro and closing, §3 R4, §4 scope, §8.11 mapping row). State each once, at the governing location.

### Calibration verdicts — verified claims (KEEP, not reported as findings)

Per-item depth keys exist (`gameView.ts:147–156`, `scene.ts:175–178`); ghost shapes are category-based (`assets.ts:524–530`); radius 0.95 + carry-height compensation + zone labels exist; mute flag honored inside `play()` and the `complete` arpeggio exists; `depth()`/`sortBias`/exact `toFloor` inverse exist; room coordinates everywhere; no-console-error gate, screenshot archive, and read-only `__cozy` hook exist; "env stays node"; today's 3-slot shelf and decoy books on the interactive tier; the §8.10 dependency table matches the store exactly; "bookshelf tier gaps ≥ 0.36" is internally consistent with board tops 0.10/0.68/1.28/1.88 and slab 2.42; "28 items" arithmetic (12 + 16) is correct.

### Summary

No Blockers. Four Major findings, all calibration failures on numeric or evidentiary claims. Recurring pattern: specific numbers and absolutes presented with more authority than the cited evidence supports. The structural content (ticket graph, test plan, restore semantics, no-hint architecture) is precise and matches the codebase. Next actions: correct §8.1's two value sets and pin the topZ convention before CC-003 starts; qualify the three absolutes; make §8.14's readability criterion measurable.
