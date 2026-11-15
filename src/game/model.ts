import type {
  Aabb,
  DropTarget,
  ItemDef,
  ItemOrientation,
  LevelDef,
  SlotDef,
  SurfaceDef,
  ZoneDef,
} from './types';
import {
  FURNITURE_FOOTPRINTS,
  SLOT_GHOST_FOOTPRINTS,
  SURFACE_OBSTACLES,
  footprintAabb,
  itemFootprint,
} from '../level/footprints';
import { scatter } from './scatter';

/** Where an item currently is. `'held'` means it is being dragged. */
export type ItemLocation =
  | { kind: 'floor'; x: number; y: number; rotation: number }
  | { kind: 'slot'; slotId: string }
  | { kind: 'surface'; surfaceId: string; x: number; y: number; rotation: number }
  | { kind: 'held' };

export type DropRejection =
  | 'unknown-item'
  | 'unknown-slot'
  | 'not-held'
  | 'wrong-category'
  | 'slot-occupied'
  | 'no-surface'
  | 'out-of-bounds'
  | 'insufficient-clearance'
  | 'footprint-overlap'
  | 'blocked-by-furniture';

export type DropResult =
  | {
      ok: true;
      itemId: string;
      /** The committed destination (slot or surface point) — one shape for both drop paths. */
      target: DropTarget;
      placed: number;
      total: number;
      completed: boolean;
      /** CC-007: collections that just transitioned incomplete→complete (anti-spam channel). */
      collectionCompleted?: string[];
    }
  | { ok: false; itemId: string; reason: DropRejection };

export interface PickupResult {
  ok: boolean;
  /** Previous location when ok — the view uses it to restore on cancel. */
  from?: Exclude<ItemLocation, { kind: 'held' }>;
}

export interface Progress {
  placed: number;
  total: number;
}

/** One collection's committed status — the ONLY surface exposing collection
 *  state (R4 no-hint guarantee; the drag/preview path must never call it).
 *  `tierId` names the tier hosting a complete collection (CC-008's animation anchor). */
export interface CollectionStatus {
  id: string;
  label: string;
  colorKey: 'red' | 'green' | 'blue';
  complete: boolean;
  tierId?: string;
}

/** AABB overlap tolerance (room units): touching edges are allowed (plan §8.2). */
export const OVERLAP_EPS = 0.01;
/** Slots anchored at or below this height count as anchored on walkable floor (C-5×C-22). */
const FLOOR_SLOT_Z = 0.15;
/** z tolerance when matching a slot anchor to its hosting surface top face. */
const SLOT_SURFACE_Z_EPS = 0.02;

/**
 * The orientation rule (C-9): books on bookshelf tiers — in slots or on the
 * tier surface — are upright; everywhere else (counter, sofa, linen, floor)
 * they are flat. Other categories only have a flat footprint.
 */
export function isTierSurface(level: LevelDef, surfaceId: string): boolean {
  const shelfIds = new Set(level.furniture.filter((f) => f.asset === 'bookshelf').map((f) => f.id));
  const s = level.surfaces?.find((x) => x.id === surfaceId);
  return !!s && !!s.furnitureId && shelfIds.has(s.furnitureId);
}

export function orientationForPlacement(level: LevelDef, item: ItemDef, surfaceId: string): ItemOrientation {
  if (item.asset === 'book' && isTierSurface(level, surfaceId)) return 'upright';
  return 'flat';
}

function overlaps(a: Aabb, b: Aabb): boolean {
  return (
    a.minX < b.maxX - OVERLAP_EPS && b.minX < a.maxX - OVERLAP_EPS &&
    a.minY < b.maxY - OVERLAP_EPS && b.minY < a.maxY - OVERLAP_EPS
  );
}

/**
 * Pure game rules: slot occupancy, free placement on surfaces (footprint inside
 * surface bounds, height clearance, non-overlap, furniture exclusion), progress,
 * completion. Imports nothing from the DOM or SVG — the view asks *this* model
 * whether a drop is valid; it never invents its own rules.
 *
 * The number of required placements comes from the level data
 * (`level.items.length`), never from a hardcoded total.
 */
export class TidyingGame {
  readonly level: LevelDef;
  /** The live seed (A3): drives the scattered layout; `Reset` replays it, `New
   *  Mess` draws a fresh one. `?seed=` pins it for deterministic tests. */
  private seed: number;
  private slotItem = new Map<string, string | null>();
  private location = new Map<string, ItemLocation>();
  private heldId: string | null = null;
  /** Pre-pickup floor rotation per item, preserved for committed floor re-drops. */
  private lastFloorRotation = new Map<string, number>();
  /** Committed collection statuses (Q2): recomputed only on committed changes,
   *  never on pickup — while an item is held, statuses hold their last values. */
  private collectionCache: CollectionStatus[] = [];

  constructor(level: LevelDef, seed?: number) {
    this.level = level;
    this.seed = (seed ?? (Math.random() * 0x100000000)) >>> 0;
    this.reset();
  }

  get currentSeed(): number {
    return this.seed;
  }

  /** Restore the initial scattered state (CC-013): re-scatter with the SAME
   *  seed → identical layout; an explicit seed argument re-seeds first. */
  reset(seed?: number): void {
    if (seed !== undefined) this.seed = seed >>> 0;
    this.slotItem.clear();
    this.location.clear();
    this.lastFloorRotation.clear();
    for (const zone of this.level.zones) {
      for (const slot of zone.slots) this.slotItem.set(slot.id, null);
    }
    const positions = scatter(this.seed, this.level);
    this.level.items.forEach((item, i) => {
      const p = positions[i];
      this.location.set(item.id, { kind: 'floor', x: p.x, y: p.y, rotation: p.rotation });
    });
    this.heldId = null;
    this.collectionCache = this.computeCollections();
  }

  /** New Mess (CC-013): a fresh seed → another layout; all state quietly
   *  cleared (collection statuses reset silently, no celebration channel). */
  newMess(): void {
    this.reset((Math.random() * 0x100000000) >>> 0);
  }

  // ---- queries ---------------------------------------------------------

  get items(): readonly ItemDef[] {
    return this.level.items;
  }

  get heldItem(): string | null {
    return this.heldId;
  }

  /** Progress counts NON-FLOOR valid placements (slot or surface): floor rests
   *  keep `kind: 'floor'` and do not count (C-21); held items count as not placed. */
  progress(): Progress {
    let placed = 0;
    for (const item of this.level.items) {
      const loc = this.location.get(item.id);
      if (loc && (loc.kind === 'slot' || (loc.kind === 'surface' && loc.surfaceId !== 'floor'))) placed++;
    }
    return { placed, total: this.level.items.length };
  }

  /** Tidy-all win rule (D3, CC-007): every item on a valid NON-FLOOR placement
   *  (slot or surface — the walkable entry mat is floor and does not count)
   *  AND all three collections complete at the same time. Levels without
   *  collections complete on placements alone. Evaluated from the committed
   *  status cache — never mid-drag. */
  isComplete(): boolean {
    const p = this.progress();
    if (!(p.total > 0 && p.placed === p.total)) return false;
    return this.collectionCache.every((c) => c.complete);
  }

  // ---- collections (CC-007) ----------------------------------------------

  tierSurfaceIds(): string[] {
    const shelfIds = new Set(this.level.furniture.filter((f) => f.asset === 'bookshelf').map((f) => f.id));
    return (this.level.surfaces ?? [])
      .filter((s) => s.furnitureId && shelfIds.has(s.furnitureId))
      .map((s) => s.id);
  }

  /** Which bookshelf tier an item rests on (slot or tier surface), or null. */
  tierOfItem(itemId: string): string | null {
    const loc = this.location.get(itemId);
    if (!loc) return null;
    if (loc.kind === 'surface') return isTierSurface(this.level, loc.surfaceId) ? loc.surfaceId : null;
    if (loc.kind === 'slot') {
      const slot = this.slotById(loc.slotId);
      if (!slot) return null;
      const host = this.hostSurfaceIdOfSlot(slot);
      return host && host !== 'floor' && isTierSurface(this.level, host) ? host : null;
    }
    return null;
  }

  /** The tier-clean rule (D2 as revised by Q1 = C-1(a)): collection c is
   *  complete iff all four of its books rest on ONE tier T — any of the four,
   *  interchangeable — and every item on T belongs to c. Tiers are evaluated
   *  independently: what rests on other tiers has no effect. */
  private computeCollections(): CollectionStatus[] {
    const cols = this.level.collections ?? [];
    if (!cols.length) return [];
    const tiers = this.tierSurfaceIds();
    const onTier = new Map<string, string[]>();
    for (const t of tiers) onTier.set(t, []);
    for (const item of this.level.items) {
      const t = this.tierOfItem(item.id);
      if (t && onTier.has(t)) onTier.get(t)!.push(item.id);
    }
    return cols.map((c) => {
      const members = this.level.items.filter((i) => i.collectionId === c.id).map((i) => i.id);
      let tierId: string | undefined;
      for (const t of tiers) {
        const occupants = onTier.get(t) ?? [];
        if (members.every((m) => occupants.includes(m)) && occupants.every((o) => members.includes(o))) {
          tierId = t;
          break;
        }
      }
      return { id: c.id, label: c.label, colorKey: c.colorKey, complete: tierId !== undefined, tierId };
    });
  }

  /** Committed statuses — recomputed only on committed changes (Q2/A4). */
  collectionStatus(): CollectionStatus[] {
    return this.collectionCache.map((s) => ({ ...s }));
  }

  /** Recompute after a committed change; returns ids that just transitioned
   *  incomplete→complete (the single celebration channel — breaking is silent). */
  private refreshCollections(): string[] {
    const before = new Map(this.collectionCache.map((s) => [s.id, s.complete]));
    this.collectionCache = this.computeCollections();
    return this.collectionCache.filter((s) => s.complete && before.get(s.id) === false).map((s) => s.id);
  }

  locationOf(itemId: string): ItemLocation | undefined {
    return this.location.get(itemId);
  }

  /** Item currently sitting in a slot, or null if the slot is free. */
  occupantOf(slotId: string): string | null {
    return this.slotItem.get(slotId) ?? null;
  }

  itemById(itemId: string): ItemDef | undefined {
    return this.level.items.find((i) => i.id === itemId);
  }

  slotById(slotId: string): SlotDef | undefined {
    for (const zone of this.level.zones) {
      const slot = zone.slots.find((s) => s.id === slotId);
      if (slot) return slot;
    }
    return undefined;
  }

  zoneOfSlot(slotId: string): ZoneDef | undefined {
    return this.level.zones.find((z) => z.slots.some((s) => s.id === slotId));
  }

  zoneForCategory(category: ItemDef['category']): ZoneDef | undefined {
    return this.level.zones.find((z) => z.category === category);
  }

  surfaceById(surfaceId: string): SurfaceDef | undefined {
    return this.level.surfaces?.find((s) => s.id === surfaceId);
  }

  /** Free height above a surface: pinned clearance, else wallHeight − topZ (A9). */
  clearanceOf(surface: SurfaceDef): number {
    return surface.clearance ?? this.level.room.wallHeight - surface.topZ;
  }

  /**
   * Nearest free slot of the item's category within `radius` world units of
   * (x, y) — the forgiving drop radius lives here so the view stays dumb.
   *
   * `carryZ` is the height at which the dragged item is being carried. The
   * match point of a slot is its anchor shifted by the height difference
   * (carryZ − slot z) along BOTH floor axes, because that is where the player
   * naturally aims a lifted item to align it visually with an elevated slot.
   * Floor slots are unaffected for practical purposes.
   */
  findDropTarget(itemId: string, x: number, y: number, radius: number, carryZ = 0): SlotDef | null {
    const item = this.itemById(itemId);
    if (!item) return null;
    let best: SlotDef | null = null;
    let bestDist = radius;
    for (const zone of this.level.zones) {
      if (zone.category !== item.category) continue;
      for (const slot of zone.slots) {
        if (this.slotItem.get(slot.id)) continue;
        const dz = carryZ - slot.anchor.z;
        const d = Math.hypot(slot.anchor.x + dz - x, slot.anchor.y + dz - y);
        if (d <= bestDist) {
          bestDist = d;
          best = slot;
        }
      }
    }
    return best;
  }

  // ---- surface physics (CC-004) ------------------------------------------

  /** Hosting surface id of a slot anchor: the furniture surface whose bounds
   *  contain the anchor at the anchor's height, else the floor entry for
   *  slots anchored on walkable floor (C-5×C-22), else null (wall-mounted). */
  hostSurfaceIdOfSlot(slot: SlotDef): string | null {
    for (const s of this.surfaces()) {
      if (s.kind !== 'furniture') continue;
      const b = s.bounds;
      if (slot.anchor.x >= b.minX && slot.anchor.x <= b.maxX && slot.anchor.y >= b.minY && slot.anchor.y <= b.maxY &&
          Math.abs(s.topZ - slot.anchor.z) <= SLOT_SURFACE_Z_EPS) {
        return s.id;
      }
    }
    const floor = this.surfaceById('floor');
    if (floor && slot.anchor.z <= FLOOR_SLOT_Z) return 'floor';
    return null;
  }

  /** Immovable AABBs that occupied slots reserve on the given surface (C-5). */
  private reservationsFor(surfaceId: string): Aabb[] {
    const out: Aabb[] = [];
    for (const zone of this.level.zones) {
      for (const slot of zone.slots) {
        if (!this.slotItem.get(slot.id)) continue;
        if (this.hostSurfaceIdOfSlot(slot) !== surfaceId) continue;
        const g = SLOT_GHOST_FOOTPRINTS[zone.category];
        if (!g) continue;
        out.push({
          minX: slot.anchor.x - g.dx / 2, maxX: slot.anchor.x + g.dx / 2,
          minY: slot.anchor.y - g.dy / 2, maxY: slot.anchor.y + g.dy / 2,
        });
      }
    }
    return out;
  }

  /** Ground AABBs of items already resting on the given surface, optionally
   *  excluding one item (the one being validated — during a drag it is held,
   *  and a pure re-check of a resting item must not collide with itself). */
  private occupantAabbsOn(surfaceId: string, excludeId?: string): Aabb[] {
    const out: Aabb[] = [];
    for (const item of this.level.items) {
      if (item.id === excludeId) continue;
      const loc = this.location.get(item.id);
      if (!loc) continue;
      if (loc.kind === 'surface' && loc.surfaceId === surfaceId) {
        out.push(this.aabbOnSurface(item, loc.x, loc.y, surfaceId));
      } else if (surfaceId === 'floor' && loc.kind === 'floor') {
        out.push(this.aabbOnSurface(item, loc.x, loc.y, 'floor'));
      }
    }
    return out;
  }

  private aabbOnSurface(item: ItemDef, x: number, y: number, surfaceId: string): Aabb {
    const fp = itemFootprint(item.asset, orientationForPlacement(this.level, item, surfaceId));
    if (!fp) return { minX: x, maxX: x, minY: y, maxY: y };
    return footprintAabb(fp, x, y);
  }

  /** Pure fit check for a surface drop — drives the drag ghost and the commit.
   *  Never consults held state or collections (R4 no-hint guarantee). */
  validateSurfaceDrop(itemId: string, surfaceId: string, x: number, y: number):
    { ok: true } | { ok: false; reason: DropRejection } {
    const item = this.itemById(itemId);
    if (!item) return { ok: false, reason: 'unknown-item' };
    const surface = this.surfaceById(surfaceId);
    if (!surface) return { ok: false, reason: 'no-surface' };
    const fp = itemFootprint(item.asset, orientationForPlacement(this.level, item, surfaceId));
    if (!fp) return { ok: false, reason: 'unknown-item' };
    const box = footprintAabb(fp, x, y);

    // 1. bounds — the footprint AABB (centered on the drop point) lies inside the surface
    const b = surface.bounds;
    if (box.minX < b.minX - OVERLAP_EPS || box.maxX > b.maxX + OVERLAP_EPS ||
        box.minY < b.minY - OVERLAP_EPS || box.maxY > b.maxY + OVERLAP_EPS) {
      return { ok: false, reason: 'out-of-bounds' };
    }
    // 2. clearance — the drawn item must fit under whatever is drawn above
    //    (strict: an exact fit like the 0.36 book under the 0.36 counter gap is allowed)
    if (fp.height > this.clearanceOf(surface)) {
      return { ok: false, reason: 'insufficient-clearance' };
    }
    // 3. non-overlap with static decor, resting items and slot reservations —
    //    one occupancy mechanism for both drop paths (C-5)
    for (const o of SURFACE_OBSTACLES[surfaceId] ?? []) {
      if (overlaps(box, o)) return { ok: false, reason: 'footprint-overlap' };
    }
    for (const r of this.occupantAabbsOn(surfaceId, itemId)) {
      if (overlaps(box, r)) return { ok: false, reason: 'footprint-overlap' };
    }
    for (const r of this.reservationsFor(surfaceId)) {
      if (overlaps(box, r)) return { ok: false, reason: 'footprint-overlap' };
    }
    // 4. floor drops additionally exclude furniture footprints (rug/mat walkable)
    if (surface.kind === 'floor') {
      for (const f of this.level.furniture) {
        if (f.flat) continue;
        const fp2 = FURNITURE_FOOTPRINTS[f.id];
        if (!fp2) continue;
        const fb: Aabb = {
          minX: f.anchor.x - fp2.dx / 2, maxX: f.anchor.x + fp2.dx / 2,
          minY: f.anchor.y - fp2.dy / 2, maxY: f.anchor.y + fp2.dy / 2,
        };
        if (overlaps(box, fb)) return { ok: false, reason: 'blocked-by-furniture' };
      }
    }
    return { ok: true };
  }

  private surfaces(): SurfaceDef[] {
    return this.level.surfaces ?? [];
  }

  // ---- commands --------------------------------------------------------

  /**
   * Lift an item. A placed item frees its slot immediately, so the slot can
   * never be silently swapped and the item can be re-placed anywhere. Picking
   * up never recomputes collection status (Q2) — it is not a committed change.
   */
  pickUp(itemId: string): PickupResult {
    const loc = this.location.get(itemId);
    if (!loc || loc.kind === 'held' || this.heldId !== null || this.isComplete()) {
      return { ok: false };
    }
    this.location.set(itemId, { kind: 'held' });
    this.heldId = itemId;
    if (loc.kind === 'slot') this.slotItem.set(loc.slotId, null);
    if (loc.kind === 'floor') this.lastFloorRotation.set(itemId, loc.rotation);
    return { ok: true, from: loc };
  }

  /**
   * Validate and perform a drop of the held item — the single entry point for
   * slots and surfaces alike (CC-004). An invalid drop changes nothing: the
   * item stays held and the view restores it.
   */
  drop(itemId: string, target: DropTarget): DropResult {
    const item = this.itemById(itemId);
    if (!item) return { ok: false, itemId, reason: 'unknown-item' };
    if (this.location.get(itemId)?.kind !== 'held') {
      return { ok: false, itemId, reason: 'not-held' };
    }
    if (target.type === 'slot') {
      const slot = this.slotById(target.slotId);
      if (!slot) return { ok: false, itemId, reason: 'unknown-slot' };
      const zone = this.zoneOfSlot(target.slotId);
      if (!zone || zone.category !== item.category) {
        return { ok: false, itemId, reason: 'wrong-category' };
      }
      if (this.slotItem.get(target.slotId)) {
        return { ok: false, itemId, reason: 'slot-occupied' };
      }
      this.slotItem.set(target.slotId, itemId);
      this.location.set(itemId, { kind: 'slot', slotId: target.slotId });
      this.heldId = null;
      return this.commit(itemId, target);
    }

    // surface path — a floor drop commits as { surfaceId: 'floor' } and stores
    // location kind 'floor' (C-21); furniture exclusion applies via validation
    const check = this.validateSurfaceDrop(itemId, target.surfaceId, target.x, target.y);
    if (!check.ok) return { ok: false, itemId, reason: check.reason };
    const surface = this.surfaceById(target.surfaceId)!;
    if (surface.kind === 'floor') {
      const rotation = this.lastFloorRotation.get(itemId) ?? 0;
      this.location.set(itemId, { kind: 'floor', x: target.x, y: target.y, rotation });
    } else {
      this.location.set(itemId, {
        kind: 'surface', surfaceId: target.surfaceId, x: target.x, y: target.y, rotation: 0,
      });
    }
    this.heldId = null;
    return this.commit(itemId, { type: 'surface', surfaceId: target.surfaceId, x: target.x, y: target.y });
  }

  /** Build the committed result for a successful drop, including the collection
   *  transition channel (CC-007/Q2: only incomplete→complete transitions are
   *  reported; exact put-backs and cancel-restores never appear here). */
  private commit(itemId: string, target: DropTarget): DropResult {
    const collectionCompleted = this.refreshCollections();
    const p = this.progress();
    const base: DropResult = {
      ok: true, itemId, target, placed: p.placed, total: p.total, completed: this.isComplete(),
    };
    return collectionCompleted.length ? { ...base, ok: true, collectionCompleted } as typeof base : base;
  }

  /** Put a held item back on the floor (cancel / invalid release). Committed
   *  restore path — routed through the same consumer as normal drops (C-17),
   *  so collection statuses refresh here too (a restore can break a collection
   *  only via the deterministic conflict fallback; it can never complete one). */
  returnToFloor(itemId: string, x: number, y: number, rotation = 0): boolean {
    if (this.location.get(itemId)?.kind !== 'held') return false;
    this.location.set(itemId, { kind: 'floor', x, y, rotation });
    if (this.heldId === itemId) this.heldId = null;
    this.refreshCollections();
    return true;
  }
}
