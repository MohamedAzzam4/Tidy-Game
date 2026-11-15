# Comprehension Report — Stage 6 (Comprehension Test)

**Target:** `docs/cozy-corner-upgrade-plan.md` (FeatureRange 1–280 & DetailedRange 281–596)
**Reviewer:** `egm-comprehension` (completed) — spawned directly, no synthesizer, no GoldfishContext (document alone)
**Mode:** REVIEW · Preset: uninterrupted

---

## What this proposes

This is the plan for Upgrade 1 of **Cozy Corner**, a one-level browser tidying game, adding three features: (1) free placement — items may be dropped anywhere they physically fit (open floor or furniture surfaces) subject to footprint, clearance, non-overlap, and furniture-exclusion rules, with restore/cancel semantics; (2) three four-book color collections (red/green/blue) that only "count" under a "shelf-clean" rule, feeding a new "tidy-all" win condition (all items on valid placements plus all collections currently complete); (3) expansion to 28 movable objects with seeded, validated scatter layouts and Reset (same seed) / New Mess (fresh seed) replay. It also fixes two deliberate non-goals — no correctness hints in the drag path and no camera rotation — analyzed for future cost but given no tickets. The work is decomposed into 16 tickets (1 epic + 11 impl + 5 verify) with a DAG-validated dependency graph, a requirements→tickets→tests mapping, and a named test plan.

## How the existing system works, per this document

Today the game is a fixed isometric room (10×8 room units) built with Vite + vanilla TypeScript + SVG: 12 items scattered on the floor must be dragged into 12 fixed category slots across 5 zones; the pure model accepts `drop(itemId, slotId)` only into free category-matching slots, holds one item at a time, restores exact previous positions on invalid/cancelled drops, and completes when every item is in a slot. The view does true isometric projection, sorts with a painter's algorithm on `x + y` (plus per-furniture `sortBias`), maps pointer events through the floor plane with a 0.55-unit drag lift and slot-ghost previews, and shows a HUD with `placed/total` progress and Reset. Audio is synthesized WebAudio with a mute flag honored in `play()`; art is hand-written SVG builder functions keyed by asset id + variant. Verification is 20 Vitest node-environment tests plus a real-pointer Playwright e2e script (a manual dependency), and the document states there is no surface, footprint, height-clearance, collection, or seed concept today — exactly what Upgrade 1 adds.

---

## Findings

**1. Severity: Major**
**Affected Scope:** §3 "R2 — Collection completion is separate from placement" (lines 136–152); §5 decision D2 (line 224); §8.4 "Collections & win rule" (lines 375–385); §8.13 risk table (line 575); interacts with D3 (line 225) and D5 (line 227).
**Discrepancy Description & Rationale:** The shelf-clean rule is stated in two mutually incompatible forms, and the win condition is feasible under only one of them. R2 and D2 say a collection counts only if its four books sit on one tier **and** "the rest of that shelf holds nothing else" / "the rest of the shelf empty"; D2's consequence draws "One clean collection per shelf at a time" (echoed verbatim by §8.13's "one collection per shelf"). §8.4 — presented as the same rule "precisely (D2)" — instead requires only: no non-book occupants, every non-empty tier carrying books of exactly one collection, and the candidate's four books on one tier. Under the literal R2/D2 rule, with D5's *single* rebuilt bookshelf, at most one collection can ever be complete at a time, so D3's win condition ("all 3 collections **currently** complete") is unreachable — the game as summarized is unwinnable. §8.4's predicate makes the win reachable (three collections on three tiers), but it silently supersedes the earlier wording, and its own clause 4 ("no foreign item (**including non-book items**) rests anywhere on the shelf") is ambiguous: read naturally ("foreign" = anything not of the candidate collection) it re-forbids other collections' books and re-breaks the win path; read as "non-book only" it is redundant with clause 1. A first-time reader cannot determine which formulation is authoritative.

**2. Severity: Nit**
**Affected Scope:** §8.3 step 4, line 368 — "rack-adjacent tiers".
**Discrepancy Description & Rationale:** A7 (lines 256–257) and §8.1 (lines 315–316) establish that the mug rack is wall hooks with no `SurfaceDef` and no tiers; no other "rack" owning tiers is defined anywhere in the document. The reader cannot tell which surfaces the widened drag bounds are meant to keep reachable (linen shelf tiers? bookshelf tiers?). Name the surfaces.

**3. Severity: Nit**
**Affected Scope:** §3 R3 lines 165–167 ("reachable (free-space connectivity)") and §8.7 step 4 (line 429).
**Discrepancy Description & Rationale:** The verifiability requirement names its proof ("free-space connectivity for every start point") but never operationalizes it for a pointer-drag game with no avatar: what geometry constitutes "free space" for reachability, and what player-visible failure it prevents (full occlusion under drawn furniture? an item enclosed by furniture footprints? a blocked drag path?). The reader cannot evaluate whether the promised test would catch a real defect. (Vague-explanation vector.)

**4. Severity: Nit**
**Affected Scope:** §8.4 lines 389–391 and §8.2 — `DropResult`.
**Discrepancy Description & Rationale:** The document bills itself as "the technical contract: data shapes" (lines 14–16) and gives shapes for `SurfaceDef`, `ItemFootprint`, `CollectionDef`, `DropTarget`, and the new surface location kind, but never enumerates `DropResult`'s fields beyond `completed` and `collectionCompleted` — even though §8.2's "New rejections join the union" implies the five new rejection reasons ride on this type. A small gap for a reader judging the contract standalone.

**5. Severity: Nit**
**Affected Scope:** §5 D3 consequence (line 225) vs §8.2 (line 349) and §8.5 (line 400).
**Discrepancy Description & Rationale:** D3 says the HUD "`placed/total` keeps its meaning", but today `placed` = items in slots (line 73) while §8.2/§8.5 redefine it as "slot + surface placements" / "counting valid placements" — a semantic change to the numerator. "Keeps its meaning" contradicts the redefinition unless read as "keeps its format"; a naive reader meets a direct wording conflict.

**6. Severity: Nit**
**Affected Scope:** §7 (lines 270–271) vs §6 assumptions A1–A10.
**Discrepancy Description & Rationale:** §7 claims each assumption is "listed with its ticket", but no A-entry in §6 carries a ticket reference; ownership (e.g., A5 → CC-005, A3 → CC-013) must be inferred by cross-reading §8. Claim-vs-content mismatch.

**7. Severity: Nit**
**Affected Scope:** Product-story sections, e.g., line 96 "(owned by ticket CC-010)".
**Discrepancy Description & Rationale:** Ticket IDs are referenced from line 96 onward, but the ID→title table only appears in §8.10 (line 503). A pointer to §8.10 at first use would spare the product-story reader a leap of faith; self-contained within the document, but only forward.

**8. Severity: Nit**
**Affected Scope:** §8.10 sequencing, line 530 vs dependency table line 513.
**Discrepancy Description & Rationale:** The narrative "Slice 2 — collections & feedback: CC-007 → CC-008 → **CC-009**" reads as a dependency chain, but the authoritative table states CC-009 depends only on CC-007 (a pure model suite does not need the feedback ticket CC-008). The reader must know to trust the table over the arrows; the arrows imply a dependency that does not exist.

**9. Severity: Nit**
**Affected Scope:** §8.8 (line 442) and §8.11 R4 row (line 545) vs §8.12 (lines 549–558).
**Discrepancy Description & Rationale:** The preview-isolation assertion is assigned to CC-009 in §8.8 and §8.11, while §8.12 declares CC-015 "owns the full list" of pure tests and includes "preview-isolation assertion" in that list. Two verification tickets are given ownership of the same gating test; the single-owner mapping is ambiguous.

**10. Severity: Nit**
**Affected Scope:** §2 line 57–58 ("furniture (13 pieces)") vs §8.9 line 468 ("all ~14 builders").
**Discrepancy Description & Rationale:** Unexplained count discrepancy in a document that repeatedly advertises audit-verified numbers. Builders may include non-furniture assets (rug, window, plant), but the naive reader is left to guess why 13 became ~14.

**11. Severity: Nit**
**Affected Scope:** §6 A6 (lines 252–253) vs §2 (lines 56, 65).
**Discrepancy Description & Rationale:** A6 says items "keep their small **screen-space** rotation" for floor poses, while §2 states "All positions are room units — **no screen-space data**" and stores floor rotation in room coordinates. The reader cannot tell whether rotation is a room-unit or screen-unit quantity — which matters, because A6's claim that footprints stay axis-aligned room-space AABBs depends on it.

---

**Summary:** No Blocker — every section can be paraphrased and the document is largely self-contained, with decision/assumption/ticket cross-references resolving internally. The one substantive issue is the shelf-clean rule contradiction (Finding 1): the summary form of the rule (R2/D2/§8.13) makes the mandated win condition unreachable on the single bookshelf that D5 specifies, while §8.4's "precise" predicate quietly allows the win but is itself internally ambiguous at clause 4. Recommended next actions: rewrite R2/D2's consequence (and §8.4 clause 4) to the §8.4 tier-scoped predicate in one consistent formulation, and resolve the labeled nits (definitions for "rack-adjacent tiers" and reachability, a `DropResult` shape block, and the small table/narrative ownership mismatches).
