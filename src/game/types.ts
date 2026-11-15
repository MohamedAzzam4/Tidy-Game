/**
 * Shared level & model types. Pure data — no DOM types here.
 *
 * Room coordinate system: the origin (0,0) is the *back corner* of the room
 * (the corner farthest from the camera). +x runs along the right-hand wall,
 * +y runs along the left-hand wall, z is up. The front corner (width, depth)
 * is the open cutaway corner the camera looks into.
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
}
