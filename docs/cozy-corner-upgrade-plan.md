# Cozy Corner — Upgrade 1: Free Placement, Collections, Replayable Mess

| Field | Value |
| --- | --- |
| **Status** | **Implemented (2026-11-15).** All 16 child tickets of CC-001 are done with their acceptance checks verified — see the ticket store (`node scripts/tickets.cjs check`) and `docs/cozy-corner-upgrade-review.md`. Two documented deviations: (1) linen towel slots 3–4 sit in the shelf's bottom cubby (z 0.08) because the upper board is fully occupied by its static decor — a data-level slot-placement choice inside CC-011's scope, no asset or surface change; (2) the e2e slot aims use the model's carry-height compensation point (anchor + (LIFT − slotZ) − grab offset), which the plan's §8.3 rule (1) implies but never spelled out for stacked tiers. |
| **Date** | 2026-11-15 · **Revision 1** applied the same day (post-EGM-review; see §5 “Revision round 1” and `docs/cozy-corner-upgrade-review.md` Parts F–G) |
| **Parent epic** | **CC-001** (all tickets below are children of it) |
| **Ticket store** | `docs/tickets/tickets.json` + one record per ticket in `docs/tickets/CC-*.md` |
| **Store validation** | `node scripts/tickets.cjs check` — currently OK: unique ids, consistent parent/children, records present, **dependency graph is a DAG (no cycles)** |
| **Baseline audited** | Commit `39d9079` ("Add GitHub Pages deploy workflow"), 20 Vitest tests + Playwright e2e green |

**How to read this document.** Sections 1–7 are the product story: what the game is,
what Upgrade 1 must do, where the scope ends, which decisions were accepted, and
which assumptions are being made. Everything from `## Detailed Implementation Plan`
onward is the technical contract: data shapes, rules, the ticket graph with real
dependencies, and how every requirement maps to tickets and tests. A reviewer should
be able to judge this upgrade without any other context.

---

## 1. What this document is

This is the plan for the next upgrade of **Cozy Corner**, a one-level browser
tidying game built with **Vite + vanilla TypeScript + SVG** (no React, no game
engine, no runtime dependencies). Someone just moved in: an open box spilled
belongings across the floor of a fixed isometric room; the player drags each item to
its logical home and the room warms up as order returns.

Upgrade 1 makes the game meaningfully more playful and replayable:

1. items can be put down **anywhere they physically fit**, not only in their
   designated slots;
2. finishing a **color collection of books** becomes its own goal, judged on a clean
   shelf tier, separate from merely putting things somewhere;
3. the mess gets bigger (**28 objects**) and **replayable** through seeded layouts
   with **Reset** (same mess) and **New Mess** (fresh mess);
4. the game stays honest: **no correctness hints during drag** and **no camera
   rotation** in this pass — both stay possible later by design.

This document and the ticket store are the only artifacts produced so far. No game
code, tests, assets, dependencies or build configuration were touched; the only
repo additions are this plan, `docs/tickets/` and the zero-dependency ticket-store
script `scripts/tickets.cjs` (an approved substitute for the unavailable `tk` CLI —
see §5 decision D1).

---

## 2. Product snapshot — how the game works today (verified by audit)

Everything below was verified by reading the source; file names are the authority
for each behavior.

**Data & coordinates** (`src/game/types.ts`, `src/level/house.level.ts`)
- Room 10 × 8 units, walls at x = 0 and y = 0, open front corner at (10, 8),
  wall height 2.9. Origin is the back corner; +x runs along the right wall, +y along
  the left wall, z is up. All positions are room units — no screen-space data.
- `LevelDef` = room + furniture (13 pieces) + zones (5) + items (12: 3 books,
  3 mugs, 2 cushions, 2 shoes, 2 towels). Each zone carries fixed slot anchors
  (`SlotDef`), 12 slots total. The bookshelf has **one interactive tier with 3
  slots** (z 0.68) although the drawn asset has boards at z ≈ 0.68 / 1.3 / top 2.2.
- Items have a `variant` index. Books exist in 3 variants (teal / terracotta /
  mustard covers, heights 0.30–0.36, thickness 0.045–0.06).

**Rules** (`src/game/model.ts` — pure, node-testable)
- State: every item is on the floor (x, y, rotation), in a slot, or held. One held
  item at a time; picking up a placed item frees its slot immediately.
- `drop(itemId, slotId)` accepts only free slots of the item's category zone;
  rejections: `unknown-item`, `unknown-slot`, `not-held`, `wrong-category`,
  `slot-occupied`.
- `findDropTarget(itemId, x, y, radius, carryZ)`: nearest free category-matching
  slot within radius 0.95; elevated slots are aimed via a carry-height compensation
  (aim point shifted by `carryZ − slotZ` along both floor axes).
- Progress = items in slots; complete = all placed. Cancel/invalid drop restores the
  previous location exactly (slot items re-drop into their old slot; floor items
  return to their exact coordinates). Nothing can be lost or duplicated.
- There is **no surface concept, no footprint, no height clearance, no collections,
  no seed** — that is exactly what Upgrade 1 adds.

**View & projection** (`src/view/projection.ts`, `scene.ts`, `gameView.ts`)
- True isometric (axes slope ±30°, vertical edges stay vertical, no perspective);
  `toScreen`/`toFloor` are exact inverses at z = 0. Painter's algorithm sorts by
  `x + y` (+ small per-furniture `sortBias`).
- Pointer events map through the floor plane; drag lifts items 0.55 units; ghost
  previews mark the targeted slot; category zone labels appear during drag.
- HUD: title, `placed/total` progress, **Reset** button, mute toggle. Completion
  shows sparkle FX and the "Home, at last." card.
- A read-only debug hook `window.__cozy` (game, level, `itemClientPos`,
  `clientFromWorld`) is used by the e2e script and never mutates state.

**Assets & audio** (`src/view/assets.ts`, `audio.ts`, `palette.ts`)
- All art is hand-written SVG in local isometric space; furniture and items are
  builder functions keyed by asset id + variant.
- **Trap found by the audit**: the bookshelf asset paints *decoy static books*
  directly on the interactive slot tier (plus a small stack) — these must move or go
  when real collection books arrive, or "clean shelf" feedback becomes nonsense
  (owned by ticket CC-010).
- Sounds are synthesized WebAudio (`pickup`, `place`, `return`, `complete`); the
  mute flag is honored inside `play()`.

**Tests** (`src/game/model.test.ts`, `src/level/level.test.ts`, `scripts/e2e.cjs`)
- 14 model tests + 6 level-data tests, all pure Node (vitest environment is `node`;
  DOM logic belongs to the view or Playwright).
- `scripts/e2e.cjs`: real-pointer Playwright playthrough — wrong-zone restore, ghost
  mid-drag, all 12 placements, completion card, reset, resize-and-drag; zero console
  errors required. Playwright is a manual dependency (not in `package.json`).

---

## 3. Feature requirements for Upgrade 1

### R1 — Free placement with physical limits

Players may leave an item **wherever it physically fits**: on the open floor, or on
any furniture surface with room for it, even when that is organizationally wrong.

Player examples that must hold:
- A book can sit **on the kitchen counter** or on a shelf tier that already holds
  books of another color — nothing stops the drop, nothing rewards it.
- A towel cannot be squeezed onto the stool — too big for the surface; the drop
  restores the item to where it was.
- A large item cannot go into a too-low shelf gap (height clearance) — the sofa-
  cannot-fit-in-a-cabinet class of rule, implemented as footprint + clearance checks.
- A **physically invalid or cancelled drop restores the previous position** without
  losing or duplicating the item.
- Objects **remain draggable after placement**, wherever they were placed.

Plan (details in §8.2): simple room-coordinate rules — surface bounds (AABB), item
footprint (AABB + height), height clearance per surface, non-overlap between items
sharing a surface, furniture-footprint exclusion for floor drops. Visible surface
targeting is a view concern (§8.3).

### R2 — Collection completion is separate from placement

12 books form **three collections of four: red, green, blue**. Books are physically
interchangeable — any book may stand on any shelf slot or tier — but a collection
only **counts** under the accepted **tier-clean rule** (D2 as revised by review
decision Q1 = C-1(a), 2026-11-15):

- A collection is complete iff its four same-color books are **grouped together on
  one tier** of the bookshelf — **any of the four tiers; tiers are interchangeable
  and each collection may go on any eligible tier** — **and nothing unrelated
  shares that tier** (the tier holds exactly those four books: no other books, no
  non-book items).
- **Tiers are evaluated independently**: what rests on the other tiers (mixed
  colors, incomplete groups, foreign items) has **no effect** on this collection's
  status.
- A tier with three green books and one red book accepts all four physically but
  gives **no rejection, no warning, no correctness hint and no celebration**.
- A tier with all four green books **and an unrelated extra item on that same tier
  does not count** for green; other tiers are unaffected.
- Mixed or incomplete arrangements are **valid temporary placements** whenever the
  items physically fit.
- A complete, clean collection triggers a **short animation at that tier** and a
  **soft chime** that respects the mute toggle.
- Completion is evaluated **after a committed drop** (or committed restore), never
  when an item is picked up and never mid-drag.
- A committed move that breaks a collection **quietly** stops counting it. Exact
  put-backs (returning the item to its previous location) and cancel-restores never
  replay the celebration; a genuine re-group after a real break celebrates again —
  feedback is transition-based with an explicit anti-spam rule (§8.4, decision Q2).
- The **whole level completes only when all three collections are complete at the
  same time** — combined with the accepted tidy-all rule: additionally every item
  must sit on a valid placement (not the floor). See decision D3.

### R3 — More objects and replayable layouts

- Working target: **28 movable objects** — the 12 collection books plus 4 mugs,
  4 cushions, 4 shoes, 4 towels (mix per assumption A1).
- Clear **variants** per group and **book-spine markings in addition to color** so
  collections stay readable at game scale (A2).
- The existing warm, tactile art direction is preserved; new art is self-authored
  SVG in the existing style.
- **Seeded scatter** over reachable floor space with safe spacing and a reliable
  fallback chain; **Reset** replays the *same* seed (identical layout), **New Mess**
  draws a fresh seed.
- Verifiability: the shipped layout ships **solver-proven**; sampled seeds (≥ 100,
  `?seed=`-pinned) are **verified** — every sampled layout must have all items
  reachable (start cell outside every footprint, clickable at its scatter pose) and
  a valid final arrangement must exist (backtracking solver driven by the model's
  own predicates, including achievable clean collections). Sampled-seed verification
  is a statistical check over test-time samples, not a proof over all 2³² seeds; the
  fallback chain always terminates in a valid layout (§8.7).

### R4 — No correctness hints, no rotation in this pass

- Placement previews may show **physical fit** (fit / no-fit) but must never reveal
  whether a move helps a collection — no collection colors, labels, or glows in the
  drag path. Model-side: collection state is exposed only through a dedicated
  post-commit query the preview pipeline never calls (§8.8).
- The **future hint ability stays possible without coupling**: hints can later be a
  separate, explicitly-invoked query layered on top of collection state; drag-and-
  drop plumbing will not need to change.
- All locations stay in **room coordinates** (already true), so a later camera
  change is not blocked by data design.
- A **cost analysis** for two fixed views versus free rotation is documented in
  §8.9. Per the user's instruction **neither becomes an implementation ticket** in
  this upgrade.

---

## 4. Scope boundaries

**In this upgrade**
- Free placement (floor + all flat furniture tops), physical rules, restore/cancel
  semantics.
- Three book collections with the tier-clean rule (D2 as revised), tier completion
  feedback, tidy-all win condition.
- 28 items, expanded home zones, rebuilt 4-tier bookshelf, new variants + spine
  markings.
- Seeded scatter, Reset/New Mess, seed parameter, validation helpers.
- HUD updates (collection chips, progress semantics, completion gating).
- Full verification: pure model suite + real-pointer Playwright suite + regression
  gate.

**Explicitly out of scope for this upgrade**
- Camera work of any kind (two fixed views, free rotation) — analyzed in §8.9, no
  tickets (per user instruction).
- Hint system implementation — only the non-coupling guarantee (§8.8).
- Rotating items in 90° steps (items keep their dropped rotation for floor poses;
  footprint does not rotate in this pass — see A6).
- Persistence, gamepad/keyboard-only dragging, additional levels, cabinets as
  placeable interiors, the mug rack as a free surface (it is wall hooks), the moving
  box as a container (A7), localization, undo history beyond cancel-restore.

**Stack guarantee (audit-verified, user-mandated)**
- Vite + vanilla TypeScript + SVG stays; the fixed isometric house stays; the
  model/view split stays; the data-driven level design stays. No framework, no MVVM,
  no rewrite. The audit found no limitation that would justify one: the model is
  already pure and node-testable, the view already derives everything from level
  data, and the projection is a single shared module.

**Failure modes & limits**: the risks and mitigations for everything above are in
§8.13 (Risks & mitigations) — including the `?seed=` input contract (§8.7) — and
the feature-half assumptions in §6 stay small and reversible (each names its owning
ticket).

---

## 5. Accepted decisions (user answers, 2026-11-15)

| # | Decision | Choice | Consequence |
| --- | --- | --- | --- |
| D1 | Ticket tool — `tk` CLI not installed here | **Approved zero-install substitution**: `docs/tickets/tickets.json` + per-ticket Markdown + `scripts/tickets.cjs` (validates ids, deps, cycles; migratable — the JSON is the import source if a real `tk` is named later) | Real ticket IDs and machine-checked dependencies exist today |
| D2 | Collection granularity — brief said both "tier" and "shelf" | **Tier-clean** (revised by review decision Q1 = C-1(a), 2026-11-15; originally "shelf-clean"): 4 same-color books grouped on ONE tier **and nothing unrelated on that tier**; tiers evaluated independently | Any tier can host any collection; up to 3 collections complete simultaneously; what rests on other tiers never poisons; an unrelated item on the collection's own tier blocks it |
| D3 | Win condition scope | **Tidy-all**: all 28 items on valid placements (not floor) **and** all 3 collections complete **at the same time** (made explicit in revision 1; evaluated after every committed drop) | HUD `placed/total` counts non-floor valid placements; completion card gated on both |
| D4 | Architecture | **Add layers**: `SurfaceDef` + `CollectionDef` + footprints added alongside zones/slots; slots remain home anchors | Smallest diff; existing 20 tests largely survive; no framework |
| D5 | Book storage layout | **One big shelf**: rebuilt bookshelf, 4 tiers × 4 slots (16 organized slots); any tier eligible for any collection (D2 revision) | Least art/layout cost; three collections coexist on three tiers; 16-slot capacity unaffected by the corrected 0.20-wide upright book (0.10 gap to the 0.30 slot spacing); top slab stays decorative |
| D6 | Free-placement generosity | **All flat tops**: every furniture piece with a drawn flat top gets a surface entry; purely physical rules decide | Book on the sofa seat and a shoe on the counter are legal |

Conflicts resolved by these answers: the tier-vs-shelf wording clash in the brief
(D2), the collections-only-vs-tidy-everything reading of the win rule (D3), and the
capacity gap between the brief's examples (a shelf holding four books *plus an extra
item*) and today's 3-slot shelf (D5 gives 16 slots across 4 tiers).

**Revision round 1 (2026-11-15, post-EGM-review, user-approved).** Three decisions
were amended or clarified by the owner after the consolidated review
(`docs/cozy-corner-upgrade-review.md`):

- **Q1 = C-1(a) tier-clean** — D2 reworded as above. The original per-shelf-clean
  reading is rejected because with one bookshelf it caps simultaneous completions
  at one, making D3's win unreachable (review blocker C-1). D3 keeps its
  "currently complete" semantics, made explicit as "complete at the same time".
- **Q2 — completion separated from celebration** — completion is evaluated after a
  committed drop (never on pickup); exact put-backs and cancel-restores never replay
  the celebration; a committed move that breaks a collection quietly stops counting
  it; restoring counts again. The anti-spam rule is explicit and named tests cover
  it (§8.4, A4).
- **Q3 — data follows art** — footprint and topZ numbers re-pinned to the drawn
  builders and projection (§8.1): upright book 0.20 wide (not 0.10), counter topZ
  0.96, bench 0.50, stool 0.49. No asset is redrawn to make an unverified plan
  number true.

**Alternatives considered (rejected) — recorded per review finding C-19:**

- **D2 per-shelf-clean kept, D3 amended** ("collections stay lit once earned") —
  rejected: changes the "currently complete" semantics the owner chose for D3.
- **D2 per-shelf-clean kept, capacity added** (second bookshelf) — rejected: new
  art + level scope; the largest change of the three options considered.
- **D4 rewrite on a physics engine / framework** — rejected: the audit found the
  pure model + data-driven level sufficient; the physical rules are four AABB
  predicates.
- **D5 keep today's 3-slot shelf** — rejected: cannot host three simultaneous
  collections under either reading of D2.
- **Scatter: jittered-grid-only** — rejected: reads as artificial; rejection
  sampling with a grid fallback keeps organic layouts and still terminates.
- **Solver over continuous surface placements** — rejected as the default search
  space: slots-only (32 ≥ 28) is sufficient under the tier-clean rule and keeps the
  solver decidable and bounded (§8.7).

---

## 6. Documented assumptions (small, reversible choices — override anytime)

- **A1 — Item mix** (CC-011): 28 = 12 books (4 red, 4 green, 4 blue) + 4 mugs + 4 cushions +
  4 shoes + 4 towels. Home zones expand to 4 slots each (rack, sofa, mat, linen).
- **A2 — Book variants** (CC-012): cover color fixed per collection (palette-derived red /
  green / blue); per-book height/thickness variation kept; spine markings =
  differing cream band count + a small title dash per collection, readable at game
  scale. `variant = collectionIndex * 4 + i`.
- **A3 — PRNG & seeds** (CC-013): mulberry32; seed stored on the game instance; `?seed=` URL
  parameter for deterministic tests; "Play again" on the completion card behaves as
  New Mess. `?seed=` is untrusted input: parsed to a finite integer, clamped to
  uint32, invalid or out-of-range → default seed (C-19).
- **A4 — Anti-spam & completion evaluation** (CC-008, revised by decision Q2): collection
  status is recomputed only on committed changes (a committed drop or a committed
  restore), never on pickup and never mid-drag; while an item is held, statuses hold
  their last committed values. Feedback fires only on an incomplete→complete
  transition across committed changes, and never for an **exact put-back** (same
  location kind + coordinates as before the pickup) or a **cancel-restore**.
  Breaking is silent. Concurrent completions stagger by ~250 ms. Named tests:
  `put-back-after-pickup does not re-celebrate`, `cancel-restore does not
  celebrate`, `break-then-regroup celebrates once` (CC-008/CC-009).
- **A5 — Ghost styling** (CC-005): `fit` = current soft teal outline; `no-fit` = dimmed with
  a diagonal strike; same palette family; never collection colors.
- **A6 — Footprint rotation** (CC-004): items keep their small random rotation for floor
  poses; the rotation is stored in room units as a display-only angle (no
  screen-space data — §2), and footprints do not rotate for validity checks this
  pass (axis-aligned AABBs; book flat 0.20 × 0.32, upright 0.20 × t — §8.1).
  Rotation-aware footprints are a later, isolated change inside
  `scatter.ts`/`model.ts`.
- **A7 — Non-surfaces** (CC-003): mug rack (wall hooks) and the moving box (decor) get no
  `SurfaceDef`; the moving box may become a container in a later upgrade.
- **A8 — Sofa seat** (CC-003): a cushion's home slots remain on the sofa; the sofa *seat*
  also becomes a free surface, so any physically fitting item may rest there.
- **A9 — Clearance default** (CC-003, revised per C-4): `clearance = room.wallHeight −
  topZ` only when nothing is drawn above the surface; per-tier clearance = underside
  of the next board − topZ; surfaces with drawn obstructions above pin their
  clearance explicitly in CC-003 — the counter pins the mug-rack board underside:
  1.32 − topZ 0.96 = 0.36 (a tallest upright book, 0.36, fits exactly).
- **A10 — Bundle budget** (CC-017): JS gzip may grow to ≈ 2 × today's 12.5 kB (≈ 25 kB) —
  data-driven SVG keeps 28 items cheap.

---

## 7. Outstanding questions

**None pending for the user.** All material questions were answered (§5, including
revision round 1). The remaining choices are the documented assumptions in §6 —
each small, reversible, and listed with its owning ticket. Two standing offers, not blockers:

1. If you later name the real `tk` CLI (package or repo URL), the store migrates by
   importing `docs/tickets/tickets.json`; no rework needed.
2. If any assumption in §6 is wrong for your vision, say so and the owning ticket's
   acceptance criteria get updated before work starts — no ticket depends on an
   assumption being permanent.

---

## Detailed Implementation Plan

### 8.1 Data contracts & coordinate rules (CC-002, CC-003, CC-010, CC-011, CC-012)

Everything stays in room units (origin = back corner; +x right wall; +y left wall;
z up). The schema gains optional fields only, so today's level keeps compiling and
playing identically until CC-011 lands:

```ts
interface SurfaceDef {
  id: string;
  furnitureId?: string;
  kind: 'floor' | 'furniture';
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  topZ: number;                          // top face of the drawn placement surface (the walkable height)
  clearance?: number;                    // default: room.wallHeight − topZ; pinned explicitly when art sits above (A9)
}
interface ItemFootprint { dx: number; dy: number; height: number }
// dx/dy = full ground extent of the drawn base layer, centered on the anchor (C-3/Q3 convention)
type ItemOrientation = 'flat' | 'upright';
type ItemFootprintTable = { [asset: string]: { [o in ItemOrientation]?: ItemFootprint } };
type FurnitureFootprintTable = { [furnitureId: string]: ItemFootprint };  // floor-exclusion AABBs
interface CollectionDef { id: string; label: string; colorKey: 'red' | 'green' | 'blue' }
// ItemDef +=  collectionId?: string
// LevelDef += surfaces?: SurfaceDef[]; collections?: CollectionDef[]
// (no LevelDef.seed — the game instance owns the live seed and `?seed=`; A3/CC-013)
type DropTarget =
  | { type: 'slot';    slotId: string }
  | { type: 'surface'; surfaceId: string; x: number; y: number };
// a floor drop commits as { type: 'surface', surfaceId: 'floor', x, y } (the
// registry's floor entry) and stores location kind 'floor' (C-21)
```

Revised result shapes (C-8, implemented by CC-004 in `model.ts`/`types.ts`):

```ts
// DropResult ok-branch: { ok: true; itemId: string; target: DropTarget; placed: number;
//                         total: number; completed: boolean; collectionCompleted?: string[] }
//   — `target` replaces the currently mandatory `slotId` so both drop paths share one shape
// PickupResult: { ok: boolean; from?: ItemLocation }
//   — `from` widens from (floor | slot) to any non-held location
```

Footprint values (re-pinned to the drawn art — builder-verified 2026-11-15, decision
Q3 “data follows art”; convention: dx/dy = full ground extent of the drawn base
layer centered on the anchor, height = top of the drawn item; items whose art is not
anchor-centered — the shoe pair — record the measured offset in CC-003): book flat
0.20 × 0.32 × 0.05; book upright 0.20 × t(0.045–0.06) × h(0.30–0.36) — the builder
box spans x −0.1…0.1 (`assets.ts:407`); mug ⌀0.21 × 0.20; cushion 0.43 × 0.43 × 0.16
(drawn base layer spans ±0.215, upper layers 0.41–0.42; the 0.45 outline is the slot
ghost, not the item — `assets.ts:449–451, 527`); shoe = drawn profile pair — two
sheared 2D cutouts that are flat in y (zero thickness) and stand ≈ 0.20 tall
(`assets.ts:462–495`; the front cutout sits at the anchor's y, the back one +0.11 in
y), measured ≈ 0.34 × 0.11 × 0.20 with the exact centered AABB (offset ≈ +0.055 in
y) pinned in CC-003 against the drawn pair; towel 0.36 × 0.28 × 0.09 (drawn layers
span ±0.18 × ±0.14, top layer at z 0.09). Footprint entries carry the
**conservative variant maxima** (upright book height 0.36, thickness 0.06 — the
per-variant art varies within the pinned ranges as display-only), and the shoe's
+0.055 y offset is consumed by the registry as the AABB center offset
(bounds/overlap checks shift the AABB accordingly). The 0.20-wide upright book keeps a 0.10 gap to the 0.30 slot
spacing, so D5's 16-slot layout is unaffected. Furniture footprints (for floor
exclusion) are AABBs derived from the same builders.

**Orientation rule (C-9)**: lookup keys are `ITEM_FOOTPRINTS[asset][orientation]`
(`'flat' | 'upright'`; books only — other categories have a single orientation) and
`FURNITURE_FOOTPRINTS[furnitureId]`. Books resting on bookshelf tiers — in slots or
on the tier surface — are **upright**; everywhere else (counter, sofa, linen, floor)
they are **flat**. The rule is applied uniformly to the ghost, the footprint and
the clearance.

Surface registry (approved set, D6; **topZ = top face of the drawn placement
surface**, re-pinned 2026-11-15 per Q3/C-4): floor; kitchen counter topZ 0.96
(countertop top face — the cabinet slab top 0.88 is its underside, `assets.ts:318`);
bench seat 0.50 (`assets.ts:245`); stool 0.49 (`assets.ts:338`, conservative AABB
inside the round top); sofa seat ≈ 0.55 (CC-003 verifies against the builder);
linen shelf towel board 0.91 and linen upper board 1.33 — CC-003; bookshelf's four
tier surfaces ship with the rebuilt shelf — CC-010. Clearance: default
`wallHeight − topZ` only where nothing is drawn above; the counter pins
`clearance = mug-rack board underside 1.32 − topZ 0.96 = 0.36` (a tallest upright
book, 0.36, fits exactly); linen tiers: towel board 0.91 → clearance 0.37 to the
upper board (upright books fit); upper board 1.33 → clearance 0.23 under the top
slab (**upright books do not fit there** — flat items do). CC-003 enumerates this
exact tier set. The entry mat is **not** a surface: it is walkable floor (no
floor-exclusion entry, no `mat` kind — C-22). The mug rack, window, art frame,
plant, rug (flat decal) and moving box get none (A7).

**Static decor on approved surfaces (C-7)**: the counter carries a cutting board
(local x −1.3…−0.66, `assets.ts:320`) and a kettle (r 0.13 at local (0.95, 0),
`assets.ts:322`); the linen upper board carries folded linens (local x −0.36…−0.06)
and a basket (r 0.12 at local (0.26, 0.04)) — `assets.ts:264–271`. CC-003 subtracts
their AABBs from the surface bounds (or registers them as obstacle entries);
CC-013's solver consumes the effective bounds; one named pure test per prop.

Bookshelf geometry (CC-010): rebuilt boards at top z ≈ 0.10 / 0.68 / 1.28 / 1.88,
decorative slab ≈ 2.42; 16 slots (ids `bs-t{1..4}-s{1..4}`, ≥ 0.30 spacing); the
rebuilt tier boards and slab are pinned **0.05 thick** (today's drawn shelf-board
thickness; the bottom panel stays 0.10 thick as drawn), so tier clearance = underside
of the next board − topZ is **0.53 / 0.55 / 0.55 / 0.49** (top tier: slab underside
2.37 − 1.88) — every clearance ≥ tallest upright book (0.36) + 0.10 margin, so every
upright book fits on every tier; the tier interior AABB is the shell interior
(≈ world x 0.08–0.59, y 1.17–2.63 around the shelf anchor 0.3/1.9 — footprint minus
panel thickness), pinned in CC-010; any tier may host any collection (D2 revision);
decoy static books leave the interactive tiers (audit finding).

### 8.2 Physical placement rules & restore semantics (CC-004)

The model gains the unified API:

```ts
drop(itemId: string, target: DropTarget): DropResult;
validateSurfaceDrop(itemId, surfaceId, x, y): { ok: true } | { ok: false; reason };  // pure
```

**`findSurfaceAt` is cut (C-11).** The DOM `data-surface` walk (§8.3) is the
authoritative surface resolver: the planned model-side query had no consumer in the
drop pipeline, its carry-height filter excluded exactly the targets R1 requires
(see the C-2 geometry below), and its no-hit contract contradicted its signature.
If a non-DOM fallback is ever needed (e.g., the future hint feature), it is
designed then — not carried as a dead API.

Validity = conjunction of:
1. **Bounds**: the item's footprint AABB (centered on the drop point) lies inside
   the surface bounds → else `out-of-bounds`;
2. **Clearance**: `footprint.height ≤ surface.clearance` → else
   `insufficient-clearance`;
3. **Non-overlap**: no AABB overlap (ε = 0.01; touching allowed) with items already
   on that surface → else `footprint-overlap`. Occupied slots on that surface count
   too (C-5): each occupied slot's anchor reserves an immovable AABB (the category
   ghost footprint) on its hosting surface, so a free surface drop cannot
   interpenetrate a slotted item and both drop paths share one occupancy mechanism.
   Slots whose anchor lies on walkable floor — the entry-mat shoe slots, which have
   no hosting `SurfaceDef` after C-22 — reserve the same AABB on the `floor` surface
   entry, so a free floor drop cannot interpenetrate a slotted shoe either (C-5 ×
   C-22 interaction, closed in revision 1).
   Named tests: a surface drop onto a slot-occupied spot rejects
   `footprint-overlap`; the adjacent spot succeeds; a floor drop onto an occupied
   mat shoe slot rejects `footprint-overlap` (and the adjacent spot succeeds).
4. **Floor exclusion**: floor drops additionally reject `blocked-by-furniture` when
   the footprint intersects a furniture footprint (rug/mat walkable).

New rejections join the union: `no-surface`, `out-of-bounds`,
`insufficient-clearance`, `footprint-overlap`, `blocked-by-furniture`. New location
kind: `{ kind: 'surface'; surfaceId; x; y; rotation }`. Slots keep their exact
current rules. Result shapes are pinned in §8.1: the ok-branch carries
`target: DropTarget` (replacing the mandatory `slotId`) and `PickupResult.from`
widens to any non-held location (C-8). Restore semantics extend
unchanged-in-spirit: invalid drop → no state change at all; cancel → return the
item to its exact previous location (floor coordinates, surface coordinates, or
re-drop into the old slot); if that exact location is now conflicting — possible
only through out-of-band state changes, never in normal single-pointer play — the
restore falls back deterministically (old slot occupied → floor near the drop
point; invalid surface coordinates → floor near the drop point; today's implicit
re-drop-then-floor fallback, now contracted — C-18). Pickup frees any location
kind; **progress counts non-floor valid placements** (slot or surface; floor rests
keep `kind: 'floor'` and do not count — C-21); one held item at a time;
`isComplete()` keeps old semantics until CC-007 flips it. Restore drops are
committed through the same post-commit consumer as normal drops, so collection
evaluation and celebration rules (§8.4, Q2) apply identically.

### 8.3 Surface targeting in the view (CC-005)

1. **Target precedence (C-10, deterministic chain)**: (1) a slot match — the
   existing nearest-free-category-slot radius + carry-height compensation — wins;
   else (2) `document.elementsFromPoint(x, y)` → walk the stack for the nearest
   `[data-surface]` ancestor — asset builders wrap every placeable region in
   `<g data-surface="surfaceId">` (tier tags included by CC-010), which kills the
   isometric tier ambiguity without ray-casting and stays robust at any viewport
   size (the existing resize-proof e2e discipline); else (3) implicit `floor` via
   the existing `toFloor` mapping — a floor drop commits as
   `{ type: 'surface', surfaceId: 'floor' }` and stores location kind `'floor'`
   (C-21).
2. **Surface-plane aiming (C-2, the contracted convention)**: when a surface is
   hovered, the pointer is mapped **through that surface's plane**, not the floor
   plane: the floor-projected drop point is shifted by `(+topZ, +topZ)` — the exact
   inverse of the projector's z offset (a surface point `(px, py, topZ)`
   floor-projects to `(px − topZ, py − topZ)`; ISO_SIN = 0.5), generalizing the
   slot path's existing carry-height compensation (`model.ts:147-148`). This
   surface point drives `validateSurfaceDrop`, the ghost position, the committed
   `DropTarget.surface.{x, y}` and the settle anchor. Floor drops keep the plain
   `toFloor` mapping. Acceptance: a drag onto the **visual center of the counter
   top** lands within ε_aim = 0.05 room units (generous enough for stepped pointer
   events and viewport rounding, tight enough to catch aiming regressions; e2e aims
   through the existing `clientFromWorld(x, y, topZ)` round-trip).
3. `validateSurfaceDrop` renders the ghost: the item's **current-orientation
   footprint outline** at the live surface point, projected onto the hovered
   surface's plane — **fit** (soft teal outline, current style) or **no-fit**
   (dimmed + diagonal strike) — physical information only (allowed by R4);
   collection state is unreachable from this code path (enforced + asserted,
   §8.8). Exactly **one** ghost stays visible mid-drag (the existing e2e
   assertion): a slot match suppresses the surface ghost.
4. Committed drop → unified `drop(itemId, target)`; settle animation to
   `(x, y, topZ)`; restore paths cover all location kinds. Drag bounds: the
   existing floor-plane clamps stay; elevated surfaces are reachable through the
   surface-plane mapping itself — an aim point outside the hovered surface's
   bounds renders `no-fit` via `validateSurfaceDrop` (no clamp widening needed).
5. **Debug hook (C-13)**: `__cozy.itemClientPos` gains a surface branch —
   `surface → (x, y, topZ)`; the hook stays read-only. This lands with CC-005,
   before CC-006/CC-016 re-drag-from-surface scenarios can aim surface starts.

Existing slot aiming (carry-height compensation, radius 0.95, zone labels) is
untouched in rule (1) — slots remain the tidy-home targets and ghosts.

### 8.4 Collections & win rule (CC-007)

The **tier-clean collection rule** (D2 as revised by decision Q1 = C-1(a),
2026-11-15) — for a bookshelf tier `T` and collection `c`:

- `c` is complete iff **all four** books of `c` rest on one tier `T` — any of the
  four tiers, interchangeable — **and every item on `T` belongs to `c`** (the tier
  holds exactly those four books: no other books, no non-book items);
- **tiers are evaluated independently**: what rests on other tiers (mixed colors,
  incomplete groups, foreign items) has no effect on `c`'s status;
- mixed or incomplete arrangements are valid temporary placements whenever they
  physically fit (CC-004's rules are color-blind) and produce **no** rejection,
  warning, correctness hint, or celebration.

Then `collectionStatus()[c].complete = true` for each qualifying `c`. Breaking =
any member removed from `T` or any unrelated item added to `T` → silently false
(no event).

**Completion evaluation & anti-spam (decision Q2; refines A4):**

- Collection status is recomputed only on **committed changes** — a committed drop
  or a committed restore — never on pickup, never mid-drag; while an item is held,
  statuses hold their last committed values.
- A committed move that breaks a collection quietly stops counting it (chip
  un-fills, no sound).
- Celebration fires only when a committed change transitions a collection
  incomplete→complete, and **never** when the committed change is an **exact
  put-back** (same location kind + coordinates as before the pickup) or a
  **cancel-restore** — cancel/restore always suppresses celebration. A genuine
  re-group after a real break celebrates again, once.
- Named tests: `put-back-after-pickup does not re-celebrate` ·
  `cancel-restore does not celebrate` · `break-then-regroup celebrates once` ·
  `two and three collections complete simultaneously` (CC-008/CC-009).

**Win rule (D3, tidy-all)**: `isComplete() = every item at a valid non-floor
placement (slot | surface; not floor, not held) AND all three collections complete
at the same time` — evaluated after every committed drop. `DropResult.completed`
remains the level-complete transition; `DropResult.collectionCompleted?: string[]`
lists collections that just transitioned — the single channel view feedback may
consume.

**Concrete winning arrangement (pure test + solver target + e2e playthrough,
CC-013/CC-015/CC-016):** tiers 1–3 of the rebuilt shelf host the three
collections — tier 1: the four red books (`bs-t1-s1…s4`), tier 2: the four green
(`bs-t2-s1…s4`), tier 3: the four blue (`bs-t3-s1…s4`); tier 4: empty; all 16
non-book items in their home slots (rack 4, sofa 4, mat 4, linen 4). Every item is
on a valid non-floor placement, all three collections are complete at the same
time ⇒ level complete. (All 28 items sit in slots — the slots-only solver search
space, §8.7, is sufficient by this arrangement.)

### 8.5 Feedback & audio (CC-008, CC-014)

- Tier completion: short per-tier animation (tier highlight + gentle sparkle in
  the existing FX language) + new `audio.play('collection')` — a warm two-note chime,
  quieter than the `complete` arpeggio; gated by the existing mute flag inside
  `play()`. Fires only under §8.4's Q2 rules: a committed incomplete→complete
  transition, never for an exact put-back or a cancel-restore. Restore drops route
  through the same commit-consumer as normal drops (C-17), so restore
  re-completions behave identically to manual re-drops.
- **e2e observability (C-14)**: a read-only `__cozy.lastSfx` log (append-only,
  length-capped; records `{ sfx, muted, at }`) joins the debug hook so CC-016 can
  assert the chime path + mute gate in headless Chromium. No state mutation — same
  discipline as the existing hook.
- HUD: three collection chips (red/green/blue dots; filled = currently complete;
  quiet un-fill on a committed break), `placed/total` counting **non-floor valid
  placements** (floor rests keep `kind: 'floor'` and do not count — C-21), subtle
  seed display,
  updated hint copy; completion card gated by the tidy-all rule; "Play again" =
  New Mess (A3). Nothing in the HUD introduces a correctness hint.

### 8.6 Content expansion (CC-010, CC-011, CC-012)

28 items (A1): 4×red + 4×green + 4×blue books with `collectionId`; 4 mugs; 4
cushions; 4 shoes; 4 towels. Home zones expand to 4 slots each; bookshelf 16 slots.
Books carry collection-colored covers (palette-derived: warm red ≈ existing
terracotta family, a leaf-family green, a deep cozy teal-blue) plus **spine
markings** (band count + title dash per collection; both orientations) so
collections are readable beyond hue (R3, A2). Non-book groups get four distinct
variants each. Everything stays self-authored SVG in the existing style; ghost
shapes remain category-based (no per-collection ghosts — that would leak
correctness). Depth ordering: today's per-item keys sort only within the items
layer and use a plain `x + y` (`gameView.ts:147-156`), so item-vs-furniture
occlusion — the actual new risk — is **not** handled by existing code (C-6). CC-010
ships one merged, depth-sorted paint list for furniture + items behind the existing
`depth()` abstraction, keyed **support-relative**: an item resting on furniture F
keys `depth(F) + ε` (the shelf never paints over the books standing on it); floor
items keep the plain `x + y` key. Contained change, no new layer, no engine;
CC-010's screenshot checks at two viewports stay as regression insurance.

### 8.7 Seeded scatter & replay (CC-013)

Pure `scatter(seed, level)` using mulberry32 (A3):

1. Candidate region: room bounds minus wall margin (0.3) minus furniture footprint
   AABBs (rug/mat walkable).
2. Rejection sampling per item: footprint-aware spacing — scattered AABBs must not
   overlap (ε = 0.01) with a ≥ 0.2 clearance gap between them; the “≥ 0.7”
   shorthand is center-to-center for the **small-item class** = mugs, books, shoes,
   towels (max footprint extent ≤ 0.36 — the towel; cushions excluded — their 0.43
   footprint is covered by the AABB rule) — and ≥ 0.5 furniture clearance; per-item small
   rotation for the scattered pose (±21°, today's range).
3. Fallback chain: relax spacing stepwise → jittered grid over walkable space →
   shipped hand-placed default layout (CC-011 data). Always terminates in a valid
   layout; the final fallback is the solver-proven shipped arrangement (R3).
4. Exported validators used by tests (signatures pinned, C-12):
   `hasValidArrangement(level, positions): { ok: boolean; reason?: 'no-arrangement' | 'budget-exceeded' }`
   and `isLayoutReachable(level, positions, cell = 0.15): boolean`. The solver
   generates and checks moves **only through the model's own predicates**
   (`validateSurfaceDrop`, slot rules, the §8.4 tier-clean rule) — never a second,
   drifting ruleset. Search space: **slots-only** (32 slots ≥ 28 items: 16
   bookshelf + 16 home; sufficient under the tier-clean rule — the winning
   arrangement §8.4 uses only slots) with a declared step budget; exceedance
   reports `budget-exceeded`, never a silent pass. **Reachability, operationalized**:
   an item is reachable iff its start cell (0.15 grid) lies outside every footprint
   (items + furniture) — drags fly over furniture in this game (there is no
   avatar), so no free-space path search is involved.
5. `Reset` re-scatters with the **same** seed; `New Mess` draws a fresh seed and
   clears all state (collection status quietly); `?seed=` URL parameter pins layouts
   for tests (untrusted input: finite integer → uint32 clamp → default seed on
   invalid — A3/C-19); HUD buttons wired; "Play again" = New Mess.

### 8.8 No-hint guarantee & future hint architecture (R4)

- **Data flow separation**: the model exposes collection state through exactly one
  query — `collectionStatus()` — and through commit-time results
  (`DropResult.collectionCompleted`). The preview pipeline
  (`validateSurfaceDrop` / `findDropTarget`) is type-shaped and asserted (CC-009)
  to carry no collection information — by a static/type assertion **and** a runtime
  zero-invocation assertion spanning a full drag lifecycle in e2e (owned by CC-009
  on the pure side, executed by CC-016 in the browser).
  The view cannot accidentally leak correctness because it never receives it before
  commit.
- **Future hints**: a hint feature would be a new explicit query (e.g.,
  `suggestMove(itemId)` or a highlight-eligible-tiers query) called from a hint UI,
  not from drag plumbing. Nothing in this upgrade's contracts needs to change to add
  it.
- **Room coordinates everywhere** (already the case) keep a camera change
  data-compatible.

### 8.9 Camera: two fixed views vs free rotation — cost analysis (no tickets)

Per the user's instruction this section plans nothing; it records the likely cost
so the decision can be made later with eyes open.

**Option A — two fixed views** (e.g., the current corner and its mirror):
- Projection: `toScreen/toFloor` are pure functions of ±30° basis vectors; a second
  view is a second projector instance (axis swap/sign flip). Static code, no
  per-frame math.
- Painter's algorithm: depth key `x + y` becomes a view-dependent sign — a one-line
  change behind the existing `depth()` abstraction; `sortBias` values would need
  re-tuning per view.
- Input: `toFloor` inverse stays exact, so drag accuracy is preserved; hit-testing
  gains a second ambiguity case for tier targeting (solvable: the `data-surface`
  hit-test is view-agnostic).
- Art: furniture builders draw the two camera-facing faces; the mirrored view would
  show the other two faces — every furniture asset needs the missing faces drawn or
  an acceptable "back" simplification. This is the dominant cost (all ~14 builders,
  plus decoy/asset details).
- Tests: every world→screen coordinate in e2e changes per view; seeded layouts stay
  valid (data is view-independent).
- Estimate: moderate — mostly asset + test work; no model changes.

**Option B — free rotation** (continuous angle θ):
- Projection becomes parametric (`cos θ`, `sin θ` mixes); `depth()` becomes a
  rotated sum; both are contained changes in `projection.ts` + `scene.ts`.
- Input: `toFloor` stays invertible at z = 0, but tier/surface picking and the
  carry-height compensation need re-derivation per angle; drag UX needs camera-
  relative controls and rotation gestures; item rotation vs camera rotation
  interacts (A6 becomes load-bearing).
- Painter's algorithm: continuous re-sorting per frame (fine for this scene size)
  but `sortBias` tuning becomes per-angle and fragile; overlaps visible today get
  new failure cases every ~15°.
- Art: as in Option A, all faces of all furniture become visible at some angle —
  same dominant cost, plus continuous lighting/shading questions (gradients are
  view-tuned today).
- Tests: coordinate-dependent assertions need a camera abstraction; resize/
  pointer-accuracy matrices multiply by sampled angles.
- Estimate: large — a real camera system with art, UX and QA cost; deliberately
  deferred.

Both options are enabled by today's decisions: room-coordinate state (§8.1),
view-agnostic rules (§8.2), and surface tagging that does not encode view-specific
geometry (§8.3). **No tickets are created for either option in this upgrade.**

### 8.10 Ticket graph & sequencing (store: `docs/tickets/tickets.json`)

One parent epic, 11 implementation tickets, 5 verification tickets. Dependencies
below are **real store dependencies** (`dependsOn`), validated acyclic by
`node scripts/tickets.cjs check` (DAG verified; see topological order in the store
output).

| ID | Kind | Title (short) | Depends on |
| --- | --- | --- | --- |
| **CC-001** | epic | Upgrade 1 (parent) | — |
| CC-002 | impl | Level schema v2: surfaces, collections, footprints | — |
| CC-003 | impl | Surface + footprint registry (non-bookshelf) | CC-002 |
| CC-004 | impl | Model: physical placement rules + unified drop API | CC-002 |
| CC-005 | impl | View: surface targeting, fit ghosts, free-drop UX | CC-002, CC-003, CC-004 |
| CC-006 | verify | Playable slice: floor / counter / shelf | CC-003, CC-004, CC-005 |
| CC-007 | impl | Model: collections, tier-clean rule, tidy-all win | CC-002, CC-004 |
| CC-008 | impl | Tier feedback: animation + soft chime (mute-aware) | CC-007 |
| CC-009 | verify | Collection rules — pure model suite | CC-007 |
| CC-010 | impl | Bookshelf rebuild: 4 tiers × 4 slots + decoy cleanup | CC-002 |
| CC-011 | impl | Level expansion: 28 items, 3 collections, zones | CC-002, CC-003, CC-010, CC-012 |
| CC-012 | impl | Asset variants: book colors + spine markings | CC-002 |
| CC-013 | impl | Seeded scatter + Reset/New Mess + validators | CC-002, CC-004, CC-011 |
| CC-014 | impl | HUD & completion presentation | CC-005, CC-007, CC-013 |
| CC-015 | verify | Pure model suite (physics, collections, scatter, solver) | CC-004, CC-007, CC-013 |
| CC-016 | verify | Playwright e2e suite (real pointer drags) | CC-006, CC-008, CC-009, CC-011, CC-012, CC-013, CC-014 |
| CC-017 | verify | Regression & build gate | CC-004, CC-005, CC-007, CC-011, CC-012, CC-013, CC-014, CC-016 |

**Sequencing around the playable slice first** (the slice is CC-006: *one book can
be left on the floor, placed on an organizationally wrong but physically valid
surface, and placed on a shelf*):

1. **Slice 1 — free placement**: CC-002 → CC-003 ∥ CC-004 → CC-005 → **CC-006**
   (uses today's 3-slot shelf + the new counter surface; deliberately does not wait
   for the bookshelf rebuild).
2. **Slice 2 — collections & feedback**: CC-007 → CC-008; **CC-009** gates on
   CC-007 only (the store table is authoritative — N-3).
3. **Slice 3 — content & replay**: CC-010 ∥ CC-012 → CC-011 → CC-013 → CC-014.
   CC-011 **owns the e2e-count update** (12 → 28 item/HUD expectations in
   `scripts/e2e.cjs`) so the repo stays testable at the slice boundary — the gate
does not sit red between CC-011 and CC-016 (C-16).
4. **Verification**: **CC-015** (pure), **CC-016** (browser), **CC-017** (gate).

Parallelizable pairs: (CC-003, CC-004, CC-010, CC-012) after CC-002; CC-007 with
CC-005; CC-008 with CC-006. All implementation tickets stay **open and unstarted**
until their dependencies are closed.

**Dependency edges added in revision 1 (C-15)**: CC-008 → CC-016 (the chime +
animation must exist before the e2e suite asserts them — §8.14 criterion 2) and
CC-016 → CC-017 (the all-green gate runs after the browser suite). Both keep the
graph acyclic (`node scripts/tickets.cjs check` re-verified).

### 8.11 Requirements → tickets → tests mapping

| Requirement | Implementation tickets | Verification tickets | Tests (named) |
| --- | --- | --- | --- |
| R1 free placement w/ physical limits | CC-002, CC-003, CC-004, CC-005 | CC-006, CC-015, CC-016, CC-017 | pure: counter drop accepted; towel-vs-stool `out-of-bounds`; overlap rejection (item and slot-reserved AABB); furniture-blocked floor drop; invalid/cancel restore; re-drag from surface — e2e: floor drop persists; counter visual-center drop lands within ε_aim 0.05 (wrong org, no feedback); shelf slot drop; invalid + Escape restore; re-drag; resize drag |
| R2 collections separate from placement | CC-007, CC-008, CC-014 (chips) | CC-009, CC-015, CC-016 | pure: 3 green + 1 red on one tier — accepted, no feedback, no celebration; 4 green + unrelated item on the SAME tier does not count; 4 green + unrelated item on ANOTHER tier still counts (tiers independent); interchangeable tiers ×4; two and three collections complete simultaneously; winning arrangement §8.4; quiet break; put-back and cancel-restore never re-celebrate; break-then-regroup celebrates once; tidy-all gating — e2e: mixed shelf by real drags; completion on a different tier; chime path + mute via `__cozy.lastSfx`; put-back does not re-chime; card gating |
| R3 more objects & replayable layouts | CC-010, CC-011, CC-012, CC-013 | CC-015, CC-016, CC-017 | pure: 28-item mix; slot capacity (0.20 upright books vs 0.30 spacing); scatter safety/reachability ≥ 100 seeds (cell-based); slots-only solver via model predicates incl. budget-exceeded path; Reset determinism; New Mess diversity — e2e: full 28-item playthrough (winning arrangement §8.4); Reset same layout; New Mess different layout |
| R4 no hints / no rotation | CC-005 (fit-only ghosts), CC-007 (query isolation) | CC-009 (owns the preview-isolation assertion: pure side), CC-016 (executes the browser side) | pure + runtime: preview surface carries no collection state (static assertion + drag-lifecycle zero-invocation; e2e half in CC-016's list) — camera: §8.9 analysis only, no tickets |

### 8.12 Test plan

**Pure model tests (Node env, `npm test`; env stays `node`)** — CC-015 owns the
full list; every case named:
mixed shelves (3 green + 1 red accepted, no feedback) · completion on interchangeable
tiers (each of 4) · two and three collections complete simultaneously · the concrete
winning arrangement (§8.4) passes tidy-all + all-collections · 4 green + unrelated
item on the same tier does not count · 4 green + unrelated item on another tier
still counts · put-back after pickup produces no transition · cancel-restore
produces no transition · break-then-regroup celebrates once · occupied surface area
· occupied slot reserves an AABB on its hosting surface (surface drop onto it
rejects; adjacent succeeds) and mat shoe-slot anchors reserve on the floor surface
(floor drop onto an occupied shoe slot rejects) · undersized surface (towel vs stool) · insufficient
clearance · footprint overlap · furniture-blocked floor drop · invalid drop restores
(slot/surface/floor) · cancelled drop restores · restore-conflict deterministic
fallback · re-dragging placed items from every location kind · reset same seed ⇒
identical layout · New Mess ⇒ different layout · seeded determinism (≥ 100 seeds) ·
scatter reachability (cell-based) · completable-by-construction slots-only solver
via model predicates (shipped level + sampled seeds; `budget-exceeded` reported) ·
static-decor effective bounds · tidy-all gating (floor rest does not count; mat
rest does not count — the mat is walkable floor; home slots do) · HUD-vs-card
progress consistency · preview-isolation assertion (static + runtime; owned by
CC-009 on the pure side).

**Real-pointer Playwright tests (`scripts/e2e.cjs`)** — CC-016 owns the full list:
complete 28-item playthrough → card (winning arrangement §8.4) · counter
visual-center aim lands within ε_aim 0.05 · mixed shelves by real drags · completion on
interchangeable tiers across runs · occupied/undersized surface drops restore ·
invalid and cancelled drops restore · re-dragging placed items from a surface (hook
surface branch) · Reset (same layout, seeded) · New Mess (different layout) ·
viewport-resize drag accuracy · mute path (no errors, aria state) + collection
chime path via `__cozy.lastSfx` + put-back does not re-chime · surface ghost
mid-drag · drag-lifecycle zero-invocation assertion of `collectionStatus` (browser
half of the preview-isolation guarantee; pure side owned by CC-009) · zero
console/page errors · screenshots archived.

### 8.13 Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Isometric tier ambiguity when picking surfaces | `data-surface` hit-testing on tagged asset groups (§8.3); e2e drags assert the resolved surface |
| Items land off the aimed surface point (floor-plane aiming) | pinned surface-plane mapping, generalizing the slot compensation (§8.3/C-2); e2e acceptance “counter visual-center lands within ε_aim 0.05”; `clientFromWorld(x, y, topZ)` round-trip |
| Full destination behaves differently per drop path | slot anchors reserve AABBs on their hosting surface — one occupancy mechanism (§8.2/C-5); named reject/adjacent tests |
| 16 extra items break painter order near furniture | merged support-relative paint list (§8.6/C-6); CC-010 acceptance checks shelf/plant/sofa overlap; screenshots at two viewports |
| Static decor overstates usable surface area | prop AABBs subtracted in CC-003 (§8.1/C-7); per-prop pure test; solver consumes effective bounds |
| Seeded scatter produces unreachable or uncompletable layouts | exported reachability (cell-based) + slots-only solver driven by model predicates over ≥ 100 seeds in tests (CC-013/CC-015); fallback chain terminates in a valid layout |
| Solver drifts from game rules | moves generated only through the model's own predicates; step budget reports `budget-exceeded` (§8.7/C-12) |
| `?seed=` misuse (unvalidated user input) | input contract: finite integer → uint32 clamp → default seed on invalid (§8.7/A3) |
| Tier-clean rule mis-implemented (per-shelf leftovers, celebration spam) | single formulation everywhere (§3 R2 = D2 = §8.4 = tickets); simultaneous-completion + put-back/cancel named tests (CC-007/008/009); revisiting = one predicate function in CC-007 |
| e2e brittleness as scenarios grow | seeded layouts via `?seed=`; read-only hook (+ `lastSfx` log); screenshot archives; keep the existing no-console-error gate |
| Vitest stays DOM-free | all DOM logic stays in view/Playwright; vite.config untouched (CC-015 contract) |
| Bundle bloat | data-driven SVG; budget check in CC-017 (A10) |

### 8.14 Acceptance criteria recap (epic CC-001)

1. One book can be left on the floor, placed on the counter (organizationally
   wrong, physically valid), and placed on a shelf — verified by real drags (CC-006).
2. Mixed shelves accept books physically with no correctness feedback; a complete,
   tier-clean collection animates at its tier and chimes (mute-aware, asserted via
   `__cozy.lastSfx`); breaking is quiet; genuine re-groups celebrate again; exact
   put-backs and cancel-restores never re-celebrate; all three collections can be
   complete at the same time (CC-007/008/009).
3. The level completes only under tidy-all + all three collections complete at the
   same time; the concrete winning arrangement (§8.4) demonstrates it pure and
   in-browser; the card and HUD reflect exactly that (CC-014/015/016).
4. 28 items with readable variants and spine markings; seeded scatter is safe,
   reachable and completable for sampled seeds; Reset repeats the layout; New Mess
   changes it (CC-011/012/013/015).
5. No correctness hints anywhere in the drag path; no rotation work shipped;
   room-coordinate state everywhere (CC-005/007/009 + §8.9).
6. `node scripts/tickets.cjs check`, `npm test`, `npm run build`,
   `node scripts/e2e.cjs` all green in one pass; README matches reality (CC-017).
