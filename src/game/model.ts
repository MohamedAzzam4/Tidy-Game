import type { ItemDef, LevelDef, SlotDef, ZoneDef } from './types';

/** Where an item currently is. `'held'` means it is being dragged. */
export type ItemLocation =
  | { kind: 'floor'; x: number; y: number; rotation: number }
  | { kind: 'slot'; slotId: string }
  | { kind: 'held' };

export type DropRejection =
  | 'unknown-item'
  | 'unknown-slot'
  | 'not-held'
  | 'wrong-category'
  | 'slot-occupied';

export type DropResult =
  | {
      ok: true;
      itemId: string;
      slotId: string;
      placed: number;
      total: number;
      completed: boolean;
    }
  | { ok: false; itemId: string; reason: DropRejection };

export interface PickupResult {
  ok: boolean;
  /** Previous location when ok — the view uses it to restore on cancel. */
  from?: Extract<ItemLocation, { kind: 'floor' | 'slot' }>;
}

export interface Progress {
  placed: number;
  total: number;
}

/**
 * Pure game rules: slot occupancy, drop validation, progress, completion.
 * Imports nothing from the DOM or SVG — the view asks *this* model whether a
 * drop is valid; it never invents its own rules.
 *
 * The number of required placements comes from the level data
 * (`level.items.length`), never from a hardcoded total.
 */
export class TidyingGame {
  readonly level: LevelDef;
  private slotItem = new Map<string, string | null>();
  private location = new Map<string, ItemLocation>();
  private heldId: string | null = null;

  constructor(level: LevelDef) {
    this.level = level;
    this.reset();
  }

  /** Restore the initial scattered state from the level data. */
  reset(): void {
    this.slotItem.clear();
    this.location.clear();
    for (const zone of this.level.zones) {
      for (const slot of zone.slots) this.slotItem.set(slot.id, null);
    }
    for (const item of this.level.items) {
      this.location.set(item.id, {
        kind: 'floor',
        x: item.start.x,
        y: item.start.y,
        rotation: item.startRotation ?? 0,
      });
    }
    this.heldId = null;
  }

  // ---- queries ---------------------------------------------------------

  get items(): readonly ItemDef[] {
    return this.level.items;
  }

  get heldItem(): string | null {
    return this.heldId;
  }

  progress(): Progress {
    let placed = 0;
    for (const item of this.level.items) {
      if (this.location.get(item.id)?.kind === 'slot') placed++;
    }
    return { placed, total: this.level.items.length };
  }

  isComplete(): boolean {
    const p = this.progress();
    return p.total > 0 && p.placed === p.total;
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

  /**
   * Nearest free slot of the item's category within `radius` world units of
   * (x, y) — the forgiving drop radius lives here so the view stays dumb.
   *
   * `carryZ` is the height at which the dragged item is being carried. The
   * match point of a slot is its anchor shifted by the height difference
   * (carryZ − slot z) along BOTH floor axes, because that is where the player
   * naturally aims a lifted item to align it visually with an elevated slot
   * (a wall rack at z 1.4 reads as "in front of the wall" from its floor
   * projection). Floor slots are unaffected for practical purposes.
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

  // ---- commands --------------------------------------------------------

  /**
   * Lift an item. A placed item frees its slot immediately, so the slot can
   * never be silently swapped and the item can be re-placed anywhere.
   */
  pickUp(itemId: string): PickupResult {
    const loc = this.location.get(itemId);
    if (!loc || loc.kind === 'held' || this.heldId !== null || this.isComplete()) {
      return { ok: false };
    }
    this.location.set(itemId, { kind: 'held' });
    this.heldId = itemId;
    if (loc.kind === 'slot') this.slotItem.set(loc.slotId, null);
    return { ok: true, from: loc };
  }

  /** Validate and perform a drop of the held item onto a slot. */
  drop(itemId: string, slotId: string): DropResult {
    const item = this.itemById(itemId);
    if (!item) return { ok: false, itemId, reason: 'unknown-item' };
    if (this.location.get(itemId)?.kind !== 'held') {
      return { ok: false, itemId, reason: 'not-held' };
    }
    const slot = this.slotById(slotId);
    if (!slot) return { ok: false, itemId, reason: 'unknown-slot' };
    const zone = this.zoneOfSlot(slotId);
    if (!zone || zone.category !== item.category) {
      return { ok: false, itemId, reason: 'wrong-category' };
    }
    if (this.slotItem.get(slotId)) {
      return { ok: false, itemId, reason: 'slot-occupied' };
    }

    this.slotItem.set(slotId, itemId);
    this.location.set(itemId, { kind: 'slot', slotId });
    this.heldId = null;
    const p = this.progress();
    return {
      ok: true,
      itemId,
      slotId,
      placed: p.placed,
      total: p.total,
      completed: p.placed === p.total,
    };
  }

  /** Put a held item back on the floor (cancel / invalid release). */
  returnToFloor(itemId: string, x: number, y: number, rotation = 0): boolean {
    if (this.location.get(itemId)?.kind !== 'held') return false;
    this.location.set(itemId, { kind: 'floor', x, y, rotation });
    if (this.heldId === itemId) this.heldId = null;
    return true;
  }
}
