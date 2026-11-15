import type { LevelDef } from '../game/types';
import { ITEM_FOOTPRINTS, FURNITURE_FOOTPRINTS } from './footprints';

// Re-exported so consumers can pull the whole physical registry from the level
// module; the tables themselves live in the pure module `./footprints` (CC-003).
export { ITEM_FOOTPRINTS, FURNITURE_FOOTPRINTS };

/**
 * Level 1 — "Move-in day".
 *
 * ── This is the only file you need to edit to change the room layout,
 *    item placements, destination zones and slot anchors. ──
 *
 * Coordinate system (see src/game/types.ts): the origin is the back corner.
 * +x runs along the right-hand wall, +y along the left-hand wall, z is up.
 * Room is 10 × 8 units; walls sit at x = 0 and y = 0; the front corner
 * (10, 8) is the open cutaway the camera looks into.
 *
 * Layout:
 *   · left wall (x = 0):  rebuilt 4-tier bookshelf (16 slots), plant, sofa
 *     (+ window above), bench
 *   · right wall (y = 0): linen shelf, wall art, kitchen counter + mug rack
 *   · floor: rug, open moving box, entry mat by the bench (front-left)
 *   · 28 movable objects in three book collections (red / green / blue)
 *
 * To add an item: append an entry to `items` and, if its zone has no free
 * slot left, add a slot to the matching zone below. To add a whole new zone
 * or piece of furniture, add it here and (if needed) draw its asset in
 * src/view/assets.ts. Nothing else needs to change.
 */
export const houseLevel: LevelDef = {
  id: 'house-1',
  name: 'Move-in day',
  room: { width: 10, depth: 8, wallHeight: 2.9 },

  furniture: [
    { id: 'rug', asset: 'rug', anchor: { x: 4.9, y: 4.0, z: 0 }, flat: true },
    { id: 'entryMat', asset: 'entryMat', anchor: { x: 1.6, y: 6.95, z: 0 }, flat: true },
    { id: 'bookshelf', asset: 'bookshelf', anchor: { x: 0.3, y: 1.9, z: 0 }, sortBias: -0.5 },
    { id: 'plantCorner', asset: 'plant', anchor: { x: 0.52, y: 2.98, z: 0 } },
    { id: 'sofa', asset: 'sofa', anchor: { x: 0.62, y: 4.15, z: 0 }, sortBias: -0.55 },
    { id: 'windowLeft', asset: 'windowLeft', anchor: { x: 0, y: 5.75, z: 0 } },
    { id: 'bench', asset: 'bench', anchor: { x: 0.32, y: 6.9, z: 0 } },
    { id: 'linenShelf', asset: 'linenShelf', anchor: { x: 3.4, y: 0.32, z: 0 }, sortBias: -0.5 },
    { id: 'artFrame', asset: 'artFrame', anchor: { x: 5.1, y: 0.02, z: 0 } },
    { id: 'mugRack', asset: 'mugRack', anchor: { x: 7.5, y: 0.1, z: 0 }, sortBias: -0.5 },
    { id: 'kitchenCounter', asset: 'kitchenCounter', anchor: { x: 7.8, y: 0.36, z: 0 } },
    { id: 'stool', asset: 'stool', anchor: { x: 5.75, y: 1.1, z: 0 } },
    { id: 'spillBox', asset: 'spillBox', anchor: { x: 4.3, y: 4.1, z: 0 } },
  ],

  zones: [
    {
      // CC-010 rebuilt bookshelf: 16 organized slots across 4 interchangeable
      // tiers (ids bs-t{1..4}-s{1..4}, ≥ 0.30 spacing; tier-4 has 4 spare).
      // Any tier may host any collection (D2 revision). Slot anchors sit on the
      // tier surfaces registered below, so slot reservations land on them (C-5).
      id: 'zoneBookshelf',
      label: 'Bookshelf',
      category: 'book',
      slots: [
        { id: 'bs-t1-s1', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 1.44, z: 0.1 } },
        { id: 'bs-t1-s2', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 1.77, z: 0.1 } },
        { id: 'bs-t1-s3', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 2.1, z: 0.1 } },
        { id: 'bs-t1-s4', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 2.43, z: 0.1 } },
        { id: 'bs-t2-s1', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 1.44, z: 0.68 } },
        { id: 'bs-t2-s2', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 1.77, z: 0.68 } },
        { id: 'bs-t2-s3', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 2.1, z: 0.68 } },
        { id: 'bs-t2-s4', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 2.43, z: 0.68 } },
        { id: 'bs-t3-s1', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 1.44, z: 1.28 } },
        { id: 'bs-t3-s2', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 1.77, z: 1.28 } },
        { id: 'bs-t3-s3', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 2.1, z: 1.28 } },
        { id: 'bs-t3-s4', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 2.43, z: 1.28 } },
        { id: 'bs-t4-s1', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 1.44, z: 1.88 } },
        { id: 'bs-t4-s2', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 1.77, z: 1.88 } },
        { id: 'bs-t4-s3', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 2.1, z: 1.88 } },
        { id: 'bs-t4-s4', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 2.43, z: 1.88 } },
      ],
      labelAnchor: { x: 0.5, y: 1.9, z: 2.55 },
    },
    {
      id: 'zoneRack',
      label: 'Kitchen rack',
      category: 'mug',
      slots: [
        { id: 'rk1', zoneId: 'zoneRack', anchor: { x: 6.75, y: 0.16, z: 1.46 } },
        { id: 'rk2', zoneId: 'zoneRack', anchor: { x: 7.25, y: 0.16, z: 1.46 } },
        { id: 'rk3', zoneId: 'zoneRack', anchor: { x: 7.75, y: 0.16, z: 1.46 } },
        { id: 'rk4', zoneId: 'zoneRack', anchor: { x: 8.25, y: 0.16, z: 1.46 } },
      ],
      labelAnchor: { x: 7.5, y: 0.4, z: 2.0 },
    },
    {
      id: 'zoneSofa',
      label: 'Sofa',
      category: 'cushion',
      // 2 × 2 on the seat slab (0.34–1.25 × 3.55–4.75); cushions are 0.43 wide,
      // so 0.44 x-spacing / 0.74 y-spacing keep them physically separate
      slots: [
        { id: 'sf1', zoneId: 'zoneSofa', anchor: { x: 0.56, y: 3.78, z: 0.55 } },
        { id: 'sf2', zoneId: 'zoneSofa', anchor: { x: 1.0, y: 3.78, z: 0.55 } },
        { id: 'sf3', zoneId: 'zoneSofa', anchor: { x: 0.56, y: 4.52, z: 0.55 } },
        { id: 'sf4', zoneId: 'zoneSofa', anchor: { x: 1.0, y: 4.52, z: 0.55 } },
      ],
      labelAnchor: { x: 0.8, y: 4.15, z: 1.55 },
    },
    {
      id: 'zoneMat',
      label: 'Entry mat',
      category: 'shoe',
      slots: [
        { id: 'mt1', zoneId: 'zoneMat', anchor: { x: 1.42, y: 6.78, z: 0.04 } },
        { id: 'mt2', zoneId: 'zoneMat', anchor: { x: 1.78, y: 7.12, z: 0.04 } },
        { id: 'mt3', zoneId: 'zoneMat', anchor: { x: 1.42, y: 7.14, z: 0.04 } },
        { id: 'mt4', zoneId: 'zoneMat', anchor: { x: 1.78, y: 6.76, z: 0.04 } },
      ],
      labelAnchor: { x: 1.9, y: 6.6, z: 0.8 },
    },
    {
      id: 'zoneLinen',
      label: 'Linen shelf',
      category: 'towel',
      // ls1/ls2 on the towel board (z 0.91); ls3/ls4 in the bottom cubby on the
      // shelf's bottom panel (z 0.08) — the upper board is fully occupied by
      // its static decor (C-7), so the cubby hosts the overflow
      slots: [
        { id: 'ls1', zoneId: 'zoneLinen', anchor: { x: 3.15, y: 0.3, z: 0.91 } },
        { id: 'ls2', zoneId: 'zoneLinen', anchor: { x: 3.62, y: 0.3, z: 0.91 } },
        { id: 'ls3', zoneId: 'zoneLinen', anchor: { x: 3.12, y: 0.355, z: 0.08 } },
        { id: 'ls4', zoneId: 'zoneLinen', anchor: { x: 3.68, y: 0.355, z: 0.08 } },
      ],
      labelAnchor: { x: 3.4, y: 0.4, z: 1.85 },
    },
  ],

  // Placeable surfaces (CC-003; topZ = top face of the drawn placement surface,
  // re-pinned 2026-11-15 per decision Q3/C-4). The bookshelf's four tier
  // surfaces ship with the rebuilt bookshelf itself (CC-010). The entry mat is
  // NOT a surface — it is walkable floor (no `mat` kind, C-22); the mug rack,
  // window, art frame, plant and moving box get none (A7). Static decor AABBs
  // standing on these surfaces are registered in `./footprints` (C-7).
  surfaces: [
    // Walkable floor: full room; furniture exclusion is applied on top of the
    // bounds via FURNITURE_FOOTPRINTS (rug and entry mat stay walkable).
    { id: 'floor', kind: 'floor', bounds: { minX: 0, maxX: 10, minY: 0, maxY: 8 }, topZ: 0 },
    // Countertop top face (cabinet slab top 0.88 is its underside). Clearance
    // pinned to the mug-rack board underside: 1.32 − 0.96 = 0.36 — a tallest
    // upright book (0.36) fits exactly (A9).
    { id: 'kitchenCounter', furnitureId: 'kitchenCounter', kind: 'furniture',
      bounds: { minX: 6.3, maxX: 9.3, minY: 0.02, maxY: 0.7 }, topZ: 0.96, clearance: 0.36 },
    // Bench seat slab top (assets.ts bench: seat box z 0.40→0.50).
    { id: 'benchSeat', furnitureId: 'bench', kind: 'furniture',
      bounds: { minX: 0.1, maxX: 0.55, minY: 6.5, maxY: 7.3 }, topZ: 0.5 },
    // Stool top — conservative AABB inside the round seat (⌀ 0.28 of the 0.40 top).
    { id: 'stoolTop', furnitureId: 'stool', kind: 'furniture',
      bounds: { minX: 5.61, maxX: 5.89, minY: 0.96, maxY: 1.24 }, topZ: 0.49 },
    // Sofa seat slab between the arms (seat box z 0.42→0.55).
    { id: 'sofaSeat', furnitureId: 'sofa', kind: 'furniture',
      bounds: { minX: 0.36, maxX: 1.23, minY: 3.57, maxY: 4.73 }, topZ: 0.55 },
    // Linen shelf towel board; clearance to the upper board underside (1.28): 0.37.
    { id: 'linen-lower', furnitureId: 'linenShelf', kind: 'furniture',
      bounds: { minX: 2.94, maxX: 3.86, minY: 0.11, maxY: 0.6 }, topZ: 0.91, clearance: 0.37 },
    // Linen shelf upper board; clearance under the top slab (1.56): 0.23 —
    // upright books do NOT fit there (flat items do).
    { id: 'linen-upper', furnitureId: 'linenShelf', kind: 'furniture',
      bounds: { minX: 2.94, maxX: 3.86, minY: 0.11, maxY: 0.6 }, topZ: 1.33, clearance: 0.23 },
    // Bookshelf tiers (CC-010): rebuilt boards 0.05 thick, bottoms 0.10 as drawn;
    // board tops 0.10 / 0.68 / 1.28 / 1.88, decorative slab underside 2.37.
    // Interior AABB = the pinned 0.58 × 1.60 footprint minus panel thickness
    // (world x 0.08–0.59, y 1.17–2.63 around the shelf anchor 0.3 / 1.9).
    // Per-tier clearance = next board underside − topZ: 0.53 / 0.55 / 0.55 / 0.49 —
    // every one clears the tallest upright book (0.36) with ≥ 0.10 margin.
    { id: 'bs-tier-1', furnitureId: 'bookshelf', kind: 'furniture',
      bounds: { minX: 0.08, maxX: 0.59, minY: 1.17, maxY: 2.63 }, topZ: 0.1, clearance: 0.53 },
    { id: 'bs-tier-2', furnitureId: 'bookshelf', kind: 'furniture',
      bounds: { minX: 0.08, maxX: 0.59, minY: 1.17, maxY: 2.63 }, topZ: 0.68, clearance: 0.55 },
    { id: 'bs-tier-3', furnitureId: 'bookshelf', kind: 'furniture',
      bounds: { minX: 0.08, maxX: 0.59, minY: 1.17, maxY: 2.63 }, topZ: 1.28, clearance: 0.55 },
    { id: 'bs-tier-4', furnitureId: 'bookshelf', kind: 'furniture',
      bounds: { minX: 0.08, maxX: 0.59, minY: 1.17, maxY: 2.63 }, topZ: 1.88, clearance: 0.49 },
  ],

  // CC-011/A2: 12 books as three collections of four. variant = collectionIndex
  // * 4 + i (red 0–3, green 4–7, blue 8–11) — matches BOOK_VARIANTS in assets.ts.
  collections: [
    { id: 'col-red', label: 'Red books', colorKey: 'red' },
    { id: 'col-green', label: 'Green books', colorKey: 'green' },
    { id: 'col-blue', label: 'Blue books', colorKey: 'blue' },
  ],

  // 28 movable objects (A1). The `start` positions are the shipped hand-placed
  // default scatter: pairwise > 0.7, inside the room, clear of furniture
  // footprints — CC-013's last-resort fallback and the solver-proven baseline.
  items: [
    // 4 red books (collection col-red, variants 0–3)
    { id: 'book-r1', category: 'book', asset: 'book', variant: 0, collectionId: 'col-red', start: { x: 2.0, y: 1.6 }, startRotation: -14 },
    { id: 'book-r2', category: 'book', asset: 'book', variant: 1, collectionId: 'col-red', start: { x: 2.75, y: 1.65 }, startRotation: 9 },
    { id: 'book-r3', category: 'book', asset: 'book', variant: 2, collectionId: 'col-red', start: { x: 3.5, y: 1.6 }, startRotation: 21 },
    { id: 'book-r4', category: 'book', asset: 'book', variant: 3, collectionId: 'col-red', start: { x: 4.25, y: 1.7 }, startRotation: -7 },
    // 4 green books (collection col-green, variants 4–7)
    { id: 'book-g1', category: 'book', asset: 'book', variant: 4, collectionId: 'col-green', start: { x: 2.0, y: 2.4 }, startRotation: 12 },
    { id: 'book-g2', category: 'book', asset: 'book', variant: 5, collectionId: 'col-green', start: { x: 2.75, y: 2.45 }, startRotation: -18 },
    { id: 'book-g3', category: 'book', asset: 'book', variant: 6, collectionId: 'col-green', start: { x: 3.5, y: 2.4 }, startRotation: 5 },
    { id: 'book-g4', category: 'book', asset: 'book', variant: 7, collectionId: 'col-green', start: { x: 4.25, y: 2.5 }, startRotation: -11 },
    // 4 blue books (collection col-blue, variants 8–11)
    { id: 'book-b1', category: 'book', asset: 'book', variant: 8, collectionId: 'col-blue', start: { x: 2.0, y: 3.2 }, startRotation: 17 },
    { id: 'book-b2', category: 'book', asset: 'book', variant: 9, collectionId: 'col-blue', start: { x: 2.75, y: 3.25 }, startRotation: -9 },
    { id: 'book-b3', category: 'book', asset: 'book', variant: 10, collectionId: 'col-blue', start: { x: 3.5, y: 3.2 }, startRotation: 14 },
    { id: 'book-b4', category: 'book', asset: 'book', variant: 11, collectionId: 'col-blue', start: { x: 4.25, y: 3.3 }, startRotation: -20 },
    // 4 mugs → kitchen rack
    { id: 'mug-a', category: 'mug', asset: 'mug', variant: 0, start: { x: 5.0, y: 1.5 } },
    { id: 'mug-b', category: 'mug', asset: 'mug', variant: 1, start: { x: 5.9, y: 1.7 } },
    { id: 'mug-c', category: 'mug', asset: 'mug', variant: 2, start: { x: 5.0, y: 2.3 } },
    { id: 'mug-d', category: 'mug', asset: 'mug', variant: 3, start: { x: 5.9, y: 2.45 } },
    // 4 cushions → sofa
    { id: 'cushion-a', category: 'cushion', asset: 'cushion', variant: 0, start: { x: 7.0, y: 1.6 }, startRotation: -8 },
    { id: 'cushion-b', category: 'cushion', asset: 'cushion', variant: 1, start: { x: 7.8, y: 1.65 }, startRotation: 14 },
    { id: 'cushion-c', category: 'cushion', asset: 'cushion', variant: 2, start: { x: 7.0, y: 2.4 }, startRotation: 6 },
    { id: 'cushion-d', category: 'cushion', asset: 'cushion', variant: 3, start: { x: 7.8, y: 2.45 }, startRotation: -15 },
    // 4 shoes → entry mat
    { id: 'shoe-a', category: 'shoe', asset: 'shoe', variant: 0, start: { x: 8.5, y: 2.0 }, startRotation: -6 },
    { id: 'shoe-b', category: 'shoe', asset: 'shoe', variant: 1, start: { x: 9.2, y: 2.05 }, startRotation: 16 },
    { id: 'shoe-c', category: 'shoe', asset: 'shoe', variant: 2, start: { x: 8.5, y: 2.8 }, startRotation: 10 },
    { id: 'shoe-d', category: 'shoe', asset: 'shoe', variant: 3, start: { x: 9.2, y: 2.85 }, startRotation: -12 },
    // 4 folded towels → linen shelf
    { id: 'towel-a', category: 'towel', asset: 'towel', variant: 0, start: { x: 5.0, y: 3.5 }, startRotation: 6 },
    { id: 'towel-b', category: 'towel', asset: 'towel', variant: 1, start: { x: 5.8, y: 3.55 }, startRotation: -12 },
    { id: 'towel-c', category: 'towel', asset: 'towel', variant: 2, start: { x: 5.0, y: 4.3 }, startRotation: -5 },
    { id: 'towel-d', category: 'towel', asset: 'towel', variant: 3, start: { x: 5.8, y: 4.35 }, startRotation: 19 },
  ],
};
