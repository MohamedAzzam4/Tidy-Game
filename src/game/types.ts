/**
 * Shared level & model types. Pure data — no DOM types here.
 *
 * Room coordinate system: the origin (0,0) is the *back corner* of the room
 * (the corner farthest from the camera). +x runs along the right-hand wall,
 * +y runs along the left-hand wall, z is up. The front corner (width, depth)
 * is the open cutaway corner the camera looks into.
 *
 * Everything in this file stays in room units. No screen-space values live in
 * data — this is what keeps a later camera change possible (plan §8.9).
 */

export type CategoryId = 'book' | 'mug' | 'cushion' | 'shoe' | 'towel';

/** World position in room units. */
export interface WorldPos {
  x: number;
  y: number;
  z: number;
}

/** One drop target inside a zone. Any free slot of the matching zone is valid. */
export interface SlotDef {
  id: string;
  zoneId: string;
  /** Where a placed item's anchor sits. */
  anchor: WorldPos;
}

/** A destination area (bookshelf, kitchen rack, sofa, entry mat, linen shelf). */
export interface ZoneDef {
  id: string;
  label: string;
  /** Only items of this category may enter this zone's slots. */
  category: CategoryId;
  slots: SlotDef[];
  /** Where the floating zone label sits (world coords). */
  labelAnchor: WorldPos;
}

/** Ground AABB + upright height of one drawn item, in room units.
 *  dx/dy = full ground extent of the drawn base layer, centered on the anchor
 *  (C-3/Q3 convention); `height` = top of the drawn item.
 *  `offsetY` (optional) shifts the AABB center along +y when the art is not
 *  anchor-centered (the drawn shoe pair — registry consumes it, D-13). */
export interface ItemFootprint {
  dx: number;
  dy: number;
  height: number;
  offsetY?: number;
}

/** Books lie flat everywhere except on bookshelf tiers, where they stand upright. */
export type ItemOrientation = 'flat' | 'upright';

/**
 * Footprint table for movable items: `ITEM_FOOTPRINTS[asset][orientation]`.
 * Books carry both orientations; every other category has a single entry
 * under 'flat'. Values are conservative variant maxima pinned to the drawn
 * builders (decision Q3: if a value and the art disagree, the art wins).
 */
export type ItemFootprintTable = {
  [asset: string]: { [o in ItemOrientation]?: ItemFootprint };
};

/**
 * Footprint table for furniture: `FURNITURE_FOOTPRINTS[furnitureId]` — the
 * ground AABB used to exclude floor drops from furniture footprints. Flat
 * decals (rug, entry mat) and wall-mounted pieces are deliberately absent:
 * floor under them stays walkable.
 */
export type FurnitureFootprintTable = { [furnitureId: string]: ItemFootprint };

/** An axis-aligned rectangle in room floor coordinates (room units). */
export interface Aabb {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * A placeable surface: any drawn flat top an item may rest on, plus the walkable
 * floor. `topZ` is the top face of the drawn placement surface (the height an
 * item rests at). `clearance` defaults to room.wallHeight − topZ and is pinned
 * explicitly whenever art sits above the surface (A9).
 */
export interface SurfaceDef {
  id: string;
  /** Which furniture provides it (absent for the floor entry). */
  furnitureId?: string;
  kind: 'floor' | 'furniture';
  /** Usable placement area in room floor units (props already subtracted via the obstacle registry). */
  bounds: Aabb;
  /** Top face of the drawn placement surface (the walkable height). */
  topZ: number;
  /** Free height above the surface; default = room.wallHeight − topZ. */
  clearance?: number;
}

/** A book collection — four same-color books that must share one clean shelf tier. */
export interface CollectionDef {
  id: string;
  label: string;
  colorKey: 'red' | 'green' | 'blue';
}

/** A movable object. */
export interface ItemDef {
  id: string;
  category: CategoryId;
  /** Asset key in the view's asset catalog (`src/view/assets.ts`). */
  asset: string;
  /** Variation index for repeated objects (color / shape tweaks). */
  variant: number;
  /** Scattered floor position where the item starts (z is implicitly 0). */
  start: { x: number; y: number };
  /** Small screen-space rotation (degrees) for the scattered pose. */
  startRotation?: number;
  /** Collection this book belongs to (books only; CC-007 evaluates tier-clean). */
  collectionId?: string;
}

/** Static scenery that is rendered from the shared asset catalog. */
export interface FurnitureDef {
  id: string;
  asset: string;
  /** Floor anchor of the furniture footprint center. */
  anchor: WorldPos;
  /** Optional tweak to the painter's-algorithm sort order (default 0). */
  sortBias?: number;
  /** Flat pieces (rug, entry mat) render into the floor-decal layer. */
  flat?: boolean;
}

export interface RoomDef {
  width: number;
  depth: number;
  wallHeight: number;
}

export interface LevelDef {
  id: string;
  name: string;
  room: RoomDef;
  furniture: FurnitureDef[];
  zones: ZoneDef[];
  items: ItemDef[];
  /** Placeable surfaces (floor + furniture flat tops). Optional so minimal
   *  synthetic levels compile; the shipped level registers the full set.
   *  (No seed field — the game instance owns the live seed and `?seed=`; A3/CC-013.) */
  surfaces?: SurfaceDef[];
  /** Book collections (books only). Optional until CC-011 ships them. */
  collections?: CollectionDef[];
}

/** Where a drag may land: either a zone slot or a point on a registered surface.
 *  A floor drop commits as `{ type: 'surface', surfaceId: 'floor', x, y }` (the
 *  registry's floor entry) and stores location kind `'floor'` (C-21). */
export type DropTarget =
  | { type: 'slot'; slotId: string }
  | { type: 'surface'; surfaceId: string; x: number; y: number };
