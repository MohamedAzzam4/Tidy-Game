/**
 * Surface + footprint registry (CC-003) — the physical data for free placement.
 *
 * Pure module: no DOM imports. All values are room units, pinned to the drawn
 * asset builders in `src/view/assets.ts` (decision Q3 "data follows art":
 * if a value and the art disagree, the art wins and the data changes — never
 * the reverse). Imported by the level data and the game model.
 */
import type {
  CategoryId,
  FurnitureFootprintTable,
  ItemFootprint,
  ItemFootprintTable,
  ItemOrientation,
} from '../game/types';

/**
 * Ground footprints per asset + orientation. Convention: dx/dy = full ground
 * extent of the drawn base layer, centered on the anchor; height = top of the
 * drawn item. Entries carry the conservative variant maxima (the per-variant
 * art varies inside these ranges and is display-only, D-13):
 *   book upright  0.20 × t(0.045–0.06) × h(0.30–0.36) — builder box spans x −0.1…0.1
 *   book flat     0.20 × 0.32 × 0.05
 *   mug           ⌀0.21 × 0.20
 *   cushion       0.43 × 0.43 × 0.16 (drawn base layer spans ±0.215; the 0.45
 *                 outline is the slot ghost, not the item)
 *   shoe          drawn profile pair — two sheared 2D cutouts, flat in y, standing
 *                 ≈ 0.20 tall; measured ≈ 0.34 × 0.11 × 0.20. The art is not
 *                 anchor-centered: the pair center sits ≈ +0.055 in y from the
 *                 anchor, recorded as offsetY and consumed by the AABB helper
 *                 below (bounds/overlap checks shift the AABB accordingly).
 *   towel         0.36 × 0.28 × 0.09 (drawn layers span ±0.18 × ±0.14, top layer z 0.09)
 */
export const ITEM_FOOTPRINTS: ItemFootprintTable = {
  book: {
    flat: { dx: 0.2, dy: 0.32, height: 0.05 },
    upright: { dx: 0.2, dy: 0.06, height: 0.36 },
  },
  mug: { flat: { dx: 0.21, dy: 0.21, height: 0.2 } },
  cushion: { flat: { dx: 0.43, dy: 0.43, height: 0.16 } },
  shoe: { flat: { dx: 0.34, dy: 0.11, height: 0.2, offsetY: 0.055 } },
  towel: { flat: { dx: 0.36, dy: 0.28, height: 0.09 } },
};

/**
 * Furniture ground AABBs (dx × dy, centered on the furniture anchor) used to
 * reject floor drops that would interpenetrate furniture. Deliberately absent:
 * rug + entry mat (flat, walkable — C-22), mug rack / window / art frame
 * (wall-mounted), spill box IS present (open box is solid decor, A7 keeps it
 * a non-container). Derived from the same builders:
 *   bookshelf 0.58 × 1.60 (pinned), counter 3.0 × 0.68 (cabinet slab),
 *   sofa 1.25 × 1.60, bench 0.56 × 1.10, stool 0.40 × 0.40 (round top),
 *   linen shelf 1.10 × 0.60, plant pot 0.36 × 0.36, spill box 0.80 × 0.78
 *   (conservative: includes the open flaps).
 */
export const FURNITURE_FOOTPRINTS: FurnitureFootprintTable = {
  bookshelf: { dx: 0.58, dy: 1.6, height: 0 },
  kitchenCounter: { dx: 3.0, dy: 0.68, height: 0 },
  sofa: { dx: 1.25, dy: 1.6, height: 0 },
  bench: { dx: 0.56, dy: 1.1, height: 0 },
  stool: { dx: 0.4, dy: 0.4, height: 0 },
  linenShelf: { dx: 1.1, dy: 0.6, height: 0 },
  plantCorner: { dx: 0.36, dy: 0.36, height: 0 },
  spillBox: { dx: 0.8, dy: 0.78, height: 0 },
};

/**
 * Occupied-slot reservations (C-5): the category ghost footprint each occupied
 * slot reserves as an immovable AABB on its hosting surface, so free surface
 * drops and slot occupants share one occupancy mechanism. Extents mirror the
 * ghost shapes in `src/view/assets.ts` (`ghostShape`).
 */
export const SLOT_GHOST_FOOTPRINTS: Record<CategoryId, { dx: number; dy: number }> = {
  book: { dx: 0.28, dy: 0.14 },
  mug: { dx: 0.27, dy: 0.27 },
  cushion: { dx: 0.45, dy: 0.45 },
  shoe: { dx: 0.36, dy: 0.18 },
  towel: { dx: 0.38, dy: 0.29 },
};

/**
 * Static decor standing ON registered surfaces (C-7): drops overlapping these
 * AABBs are rejected, so the effective usable bounds exclude the props. World
 * coordinates derived from the builder-local values:
 *   kitchenCounter — cutting board (local x −1.3…−0.66, y ±0.2) and kettle
 *     (r 0.13 at local (0.95, 0)) around anchor (7.8, 0.36);
 *   linen-upper — folded linens (local x −0.36…−0.06, y −0.12…0.16) and basket
 *     (r 0.12 at local (0.26, 0.04)) around anchor (3.4, 0.32).
 */
export const SURFACE_OBSTACLES: Record<string, Array<{ id: string; minX: number; maxX: number; minY: number; maxY: number }>> = {
  kitchenCounter: [
    { id: 'cutting-board', minX: 6.5, maxX: 7.14, minY: 0.16, maxY: 0.56 },
    { id: 'kettle', minX: 8.62, maxX: 8.88, minY: 0.23, maxY: 0.49 },
  ],
  'linen-upper': [
    { id: 'folded-linens', minX: 3.04, maxX: 3.34, minY: 0.2, maxY: 0.48 },
    { id: 'basket', minX: 3.54, maxX: 3.78, minY: 0.24, maxY: 0.48 },
  ],
};

/** Footprint lookup with the orientation rule (C-9): books are upright on
 *  bookshelf tiers and flat everywhere else; other categories are always flat. */
export function itemFootprint(asset: string, orientation: ItemOrientation): ItemFootprint | undefined {
  return ITEM_FOOTPRINTS[asset]?.[orientation];
}

/** The ground AABB of an item with the given footprint, centered on the drop
 *  point (+ the registry's center offset for non-anchor-centered art). */
export function footprintAabb(fp: ItemFootprint, x: number, y: number) {
  const cy = y + (fp.offsetY ?? 0);
  return { minX: x - fp.dx / 2, maxX: x + fp.dx / 2, minY: cy - fp.dy / 2, maxY: cy + fp.dy / 2 };
}
