import { describe, expect, it } from 'vitest';
import { TidyingGame, orientationForPlacement } from './model';
import { scatter } from './scatter';
import type { DropTarget, LevelDef } from './types';

/** Small synthetic level used to exercise the rules deterministically. */
const testLevel: LevelDef = {
  id: 'test',
  name: 'Test level',
  room: { width: 10, depth: 8, wallHeight: 3 },
  furniture: [],
  zones: [
    {
      id: 'zoneShelf',
      label: 'Bookshelf',
      category: 'book',
      slots: [
        { id: 'shelf1', zoneId: 'zoneShelf', anchor: { x: 0.3, y: 1.5, z: 0.68 } },
        { id: 'shelf2', zoneId: 'zoneShelf', anchor: { x: 0.3, y: 1.78, z: 0.68 } },
      ],
      labelAnchor: { x: 0.5, y: 1.6, z: 2.4 },
    },
    {
      id: 'zoneRack',
      label: 'Kitchen rack',
      category: 'mug',
      slots: [{ id: 'rack1', zoneId: 'zoneRack', anchor: { x: 6.9, y: 0.22, z: 1.44 } }],
      labelAnchor: { x: 6.9, y: 0.3, z: 1.9 },
    },
  ],
  items: [
    { id: 'book1', category: 'book', asset: 'book', variant: 0, start: { x: 5, y: 4 } },
    { id: 'book2', category: 'book', asset: 'book', variant: 1, start: { x: 6, y: 4 } },
    { id: 'mug1', category: 'mug', asset: 'mug', variant: 0, start: { x: 4, y: 5 } },
  ],
};

const slot = (slotId: string): DropTarget => ({ type: 'slot', slotId });
const on = (surfaceId: string, x: number, y: number): DropTarget => ({ type: 'surface', surfaceId, x, y });

const placedCount = (g: TidyingGame) => g.progress().placed;

describe('TidyingGame', () => {
  it('starts with every item on the floor and nothing placed', () => {
    // CC-013: the initial state is the seeded scatter (adapted from the
    // hand-placed starts; intent — items begin on the floor — preserved)
    const g = new TidyingGame(testLevel, 7);
    expect(g.progress()).toEqual({ placed: 0, total: 3 });
    expect(g.isComplete()).toBe(false);
    for (const item of g.items) {
      expect(g.locationOf(item.id)?.kind).toBe('floor');
    }
    const positions = scatter(7, testLevel);
    const book1 = g.locationOf('book1')!;
    expect(book1).toMatchObject({ kind: 'floor', x: positions[0].x, y: positions[0].y, rotation: positions[0].rotation });
  });

  it('derives the required placements from the level data, not a constant', () => {
    const g = new TidyingGame(testLevel);
    expect(g.progress().total).toBe(testLevel.items.length);
  });

  it('accepts a correct drop, occupies the slot and updates progress', () => {
    const g = new TidyingGame(testLevel);
    expect(g.pickUp('book1').ok).toBe(true);
    const res = g.drop('book1', slot('shelf1'));
    expect(res).toMatchObject({
      ok: true,
      target: { type: 'slot', slotId: 'shelf1' },
      placed: 1, total: 3, completed: false,
    });
    expect(g.occupantOf('shelf1')).toBe('book1');
    expect(g.locationOf('book1')).toMatchObject({ kind: 'slot', slotId: 'shelf1' });
    expect(placedCount(g)).toBe(1);
  });

  it('rejects a drop of the wrong category and changes nothing', () => {
    const g = new TidyingGame(testLevel);
    g.pickUp('mug1');
    const res = g.drop('mug1', slot('shelf1'));
    expect(res).toMatchObject({ ok: false, reason: 'wrong-category' });
    expect(g.occupantOf('shelf1')).toBeNull();
    expect(g.locationOf('mug1')?.kind).toBe('held'); // view restores it
    expect(placedCount(g)).toBe(0);
  });

  it('never lets a drop silently replace an occupied slot', () => {
    const g = new TidyingGame(testLevel);
    g.pickUp('book1');
    g.drop('book1', slot('shelf1'));
    g.pickUp('book2');
    const res = g.drop('book2', slot('shelf1'));
    expect(res).toMatchObject({ ok: false, reason: 'slot-occupied' });
    expect(g.occupantOf('shelf1')).toBe('book1');
    expect(placedCount(g)).toBe(1);
  });

  it('accepts any free slot in the matching zone (no hidden order)', () => {
    const g = new TidyingGame(testLevel);
    g.pickUp('book2');
    expect(g.drop('book2', slot('shelf2')).ok).toBe(true);
    g.pickUp('book1');
    expect(g.drop('book1', slot('shelf1')).ok).toBe(true);
    // both shelf slots took the books in swapped order
    expect(g.occupantOf('shelf1')).toBe('book1');
    expect(g.occupantOf('shelf2')).toBe('book2');

    // nearest-free-slot search only offers free, category-matching slots
    g.pickUp('mug1');
    expect(g.findDropTarget('mug1', 0.4, 1.6, 1.0, 1.44)).toBeNull(); // shelf is for books
    expect(g.findDropTarget('mug1', 7.0, 0.4, 1.0, 1.44)?.id).toBe('rack1');
  });

  it('findDropTarget respects the radius and prefers the nearest slot', () => {
    const g = new TidyingGame(testLevel);
    const SHELF_Z = 0.68; // query from the slot's own height → no compensation
    expect(g.findDropTarget('book1', 5, 4, 0.5, SHELF_Z)).toBeNull(); // too far away
    const near = g.findDropTarget('book1', 0.4, 1.7, 1.0, SHELF_Z);
    expect(near?.id).toBe('shelf2'); // 1.78 is nearer than 1.5
    g.pickUp('book2');
    g.drop('book2', slot('shelf2'));
    // occupied slots are skipped even when they are the nearest
    expect(g.findDropTarget('book1', 0.35, 1.75, 1.0, SHELF_Z)?.id).toBe('shelf1');
  });

  it('findDropTarget compensates for carried height so elevated slots are reachable', () => {
    const g = new TidyingGame(testLevel);
    // rack1 sits at z 1.44; carrying at z 0.55 shifts its aim point by (−0.89, −0.89)
    const aim = g.findDropTarget('mug1', 6.9 - 0.89, 0.22 - 0.89, 0.95, 0.55);
    expect(aim?.id).toBe('rack1');
    // without compensation that same point would be far outside the radius
    expect(g.findDropTarget('mug1', 6.01, -0.67, 0.3, 0.55)?.id).toBe('rack1');
  });

  it('lets a placed item be picked up again, freeing its slot', () => {
    const g = new TidyingGame(testLevel);
    g.pickUp('book1');
    g.drop('book1', slot('shelf1'));
    const picked = g.pickUp('book1');
    expect(picked.ok).toBe(true);
    expect(picked.from).toMatchObject({ kind: 'slot', slotId: 'shelf1' });
    expect(g.occupantOf('shelf1')).toBeNull();
    expect(placedCount(g)).toBe(0);
    // and it can go somewhere else
    expect(g.drop('book1', slot('shelf2')).ok).toBe(true);
    expect(placedCount(g)).toBe(1);
  });

  it('restores a held item to the floor on cancel', () => {
    const g = new TidyingGame(testLevel);
    g.pickUp('mug1');
    expect(g.returnToFloor('mug1', 4.2, 5.1, 12)).toBe(true);
    expect(g.locationOf('mug1')).toMatchObject({ kind: 'floor', x: 4.2, y: 5.1, rotation: 12 });
    expect(g.heldItem).toBeNull();
  });

  it('rejects unknown items and slots, and drops that were never picked up', () => {
    const g = new TidyingGame(testLevel);
    expect(g.drop('book1', slot('shelf1'))).toMatchObject({ ok: false, reason: 'not-held' });
    g.pickUp('book1');
    expect(g.drop('book1', slot('nope'))).toMatchObject({ ok: false, reason: 'unknown-slot' });
    expect(g.drop('ghost', slot('shelf1'))).toMatchObject({ ok: false, reason: 'unknown-item' });
    g.returnToFloor('book1', 5, 4);
  });

  it('only holds one item at a time', () => {
    const g = new TidyingGame(testLevel);
    expect(g.pickUp('book1').ok).toBe(true);
    expect(g.pickUp('book2').ok).toBe(false);
    expect(g.heldItem).toBe('book1');
  });

  it('resets to the initial scattered state after partial and full play', () => {
    const g = new TidyingGame(testLevel, 7);
    g.pickUp('book1');
    g.drop('book1', slot('shelf1'));
    g.returnToFloor(g.heldItem ?? '', 0, 0); // no-op while nothing is held
    g.pickUp('mug1');
    g.drop('mug1', slot('rack1'));
    g.reset();
    expect(g.progress()).toEqual({ placed: 0, total: 3 });
    // same seed → identical layout (CC-013 Reset determinism)
    const positions = scatter(7, testLevel);
    expect(g.locationOf('book1')).toMatchObject({ kind: 'floor', x: positions[0].x, y: positions[0].y });
    expect(g.locationOf('mug1')).toMatchObject({ kind: 'floor', x: positions[2].x, y: positions[2].y });
    expect(g.occupantOf('shelf1')).toBeNull();
    expect(g.occupantOf('rack1')).toBeNull();

    // also after full completion
    for (const [item, s] of [
      ['book1', 'shelf1'],
      ['book2', 'shelf2'],
      ['mug1', 'rack1'],
    ] as const) {
      g.pickUp(item);
      g.drop(item, slot(s));
    }
    expect(g.isComplete()).toBe(true);
    g.reset();
    expect(g.progress().placed).toBe(0);
    expect(g.isComplete()).toBe(false);
  });

  it('locks the scene once complete (no further pickups)', () => {
    const g = new TidyingGame(testLevel);
    for (const [item, s] of [
      ['book1', 'shelf1'],
      ['book2', 'shelf2'],
      ['mug1', 'rack1'],
    ] as const) {
      g.pickUp(item);
      const res = g.drop(item, slot(s));
      if (item === 'mug1') expect(res).toMatchObject({ ok: true, completed: true });
    }
    expect(g.isComplete()).toBe(true);
    expect(g.pickUp('book1').ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CC-004 — physical free placement on surfaces
// ---------------------------------------------------------------------------

/** Synthetic level mirroring the shipped room's counter + stool + mat geometry. */
const physicsLevel: LevelDef = {
  id: 'physics-test',
  name: 'Physics test level',
  room: { width: 10, depth: 8, wallHeight: 2.9 },
  furniture: [
    { id: 'kitchenCounter', asset: 'kitchenCounter', anchor: { x: 7.8, y: 0.36, z: 0 } },
    { id: 'stool', asset: 'stool', anchor: { x: 5.75, y: 1.1, z: 0 } },
  ],
  zones: [
    {
      id: 'zoneShelf', label: 'Bookshelf', category: 'book',
      slots: [{ id: 'shelf1', zoneId: 'zoneShelf', anchor: { x: 0.3, y: 1.5, z: 0.68 } }],
      labelAnchor: { x: 0.5, y: 1.6, z: 2.4 },
    },
    {
      // a book slot anchored ON the counter top (to exercise slot reservations)
      id: 'zoneCounterBooks', label: 'Counter shelf', category: 'book',
      slots: [{ id: 'cs1', zoneId: 'zoneCounterBooks', anchor: { x: 8.0, y: 0.3, z: 0.96 } }],
      labelAnchor: { x: 8.0, y: 0.5, z: 1.6 },
    },
    {
      id: 'zoneRack', label: 'Kitchen rack', category: 'mug',
      slots: [{ id: 'rack1', zoneId: 'zoneRack', anchor: { x: 6.9, y: 0.22, z: 1.46 } }],
      labelAnchor: { x: 6.9, y: 0.3, z: 1.9 },
    },
    {
      id: 'zoneMat', label: 'Entry mat', category: 'shoe',
      slots: [
        { id: 'mt1', zoneId: 'zoneMat', anchor: { x: 1.42, y: 6.78, z: 0.04 } },
        { id: 'mt2', zoneId: 'zoneMat', anchor: { x: 1.78, y: 7.12, z: 0.04 } },
      ],
      labelAnchor: { x: 1.9, y: 6.6, z: 0.8 },
    },
  ],
  items: [
    { id: 'book-a', category: 'book', asset: 'book', variant: 0, start: { x: 5.0, y: 3.3 } },
    { id: 'book-b', category: 'book', asset: 'book', variant: 1, start: { x: 3.6, y: 4.9 } },
    { id: 'mug-a', category: 'mug', asset: 'mug', variant: 0, start: { x: 4.4, y: 2.5 } },
    { id: 'shoe-a', category: 'shoe', asset: 'shoe', variant: 0, start: { x: 8.3, y: 5.2 } },
    { id: 'shoe-b', category: 'shoe', asset: 'shoe', variant: 1, start: { x: 8.8, y: 6.1 } },
    { id: 'towel-a', category: 'towel', asset: 'towel', variant: 0, start: { x: 3.0, y: 2.1 } },
  ],
  surfaces: [
    { id: 'floor', kind: 'floor', bounds: { minX: 0, maxX: 10, minY: 0, maxY: 8 }, topZ: 0 },
    { id: 'kitchenCounter', furnitureId: 'kitchenCounter', kind: 'furniture',
      bounds: { minX: 6.3, maxX: 9.3, minY: 0.02, maxY: 0.7 }, topZ: 0.96, clearance: 0.36 },
    { id: 'stoolTop', furnitureId: 'stool', kind: 'furniture',
      bounds: { minX: 5.61, maxX: 5.89, minY: 0.96, maxY: 1.24 }, topZ: 0.49 },
  ],
};

describe('CC-004 — free placement with physical limits', () => {
  it('a book can be dropped on the kitchen counter (wrong organizationally, valid physically) and stays', () => {
    const g = new TidyingGame(physicsLevel);
    g.pickUp('book-a');
    const res = g.drop('book-a', on('kitchenCounter', 7.8, 0.36));
    expect(res).toMatchObject({ ok: true, target: { type: 'surface', surfaceId: 'kitchenCounter', x: 7.8, y: 0.36 } });
    expect(g.locationOf('book-a')).toMatchObject({ kind: 'surface', surfaceId: 'kitchenCounter', x: 7.8, y: 0.36 });
    expect(res.ok && res.placed).toBe(1); // surface placements count (C-21)
    expect(g.isComplete()).toBe(false);
  });

  it('a shoe on the counter is legal (D6) and keeps its kind floor under it', () => {
    const g = new TidyingGame(physicsLevel);
    g.pickUp('shoe-a');
    expect(g.drop('shoe-a', on('kitchenCounter', 7.8, 0.36)).ok).toBe(true);
    expect(g.locationOf('shoe-a')?.kind).toBe('surface');
  });

  it('a floor drop keeps kind floor and does not count toward progress (C-21)', () => {
    const g = new TidyingGame(physicsLevel);
    g.pickUp('book-a');
    const res = g.drop('book-a', on('floor', 5.5, 3.5));
    expect(res.ok && res.placed).toBe(0);
    expect(g.locationOf('book-a')).toMatchObject({ kind: 'floor', x: 5.5, y: 3.5 });
  });

  it('a towel cannot be squeezed onto the stool — out-of-bounds, prior state intact', () => {
    const g = new TidyingGame(physicsLevel);
    g.pickUp('towel-a');
    const res = g.drop('towel-a', on('stoolTop', 5.75, 1.1));
    expect(res).toMatchObject({ ok: false, reason: 'out-of-bounds' });
    expect(g.locationOf('towel-a')?.kind).toBe('held'); // nothing mutated
    expect(placedCount(g)).toBe(0);
    // the smaller mug does fit the stool
    g.returnToFloor('towel-a', 3.0, 2.1, 6);
    g.pickUp('mug-a');
    expect(g.drop('mug-a', on('stoolTop', 5.75, 1.1)).ok).toBe(true);
  });

  it('a floor drop inside a furniture footprint rejects blocked-by-furniture; outside succeeds', () => {
    const g = new TidyingGame(physicsLevel);
    g.pickUp('book-a');
    expect(g.drop('book-a', on('floor', 5.75, 1.1))).toMatchObject({ ok: false, reason: 'blocked-by-furniture' });
    expect(g.locationOf('book-a')?.kind).toBe('held');
    expect(g.drop('book-a', on('floor', 5.75, 2.2)).ok).toBe(true);
  });

  it('dropping onto an occupied area of a surface rejects footprint-overlap without mutating state', () => {
    const g = new TidyingGame(physicsLevel);
    g.pickUp('book-a');
    expect(g.drop('book-a', on('kitchenCounter', 7.5, 0.36)).ok).toBe(true);
    g.pickUp('book-b');
    const res = g.drop('book-b', on('kitchenCounter', 7.5, 0.36));
    expect(res).toMatchObject({ ok: false, reason: 'footprint-overlap' });
    expect(g.locationOf('book-b')?.kind).toBe('held');
    // the adjacent spot succeeds (touching edges allowed, ε 0.01)
    expect(g.drop('book-b', on('kitchenCounter', 7.75, 0.36)).ok).toBe(true);
  });

  it('a surface drop onto a slot-occupied spot rejects; the adjacent spot succeeds (C-5)', () => {
    const g = new TidyingGame(physicsLevel);
    g.pickUp('book-a');
    expect(g.drop('book-a', slot('cs1')).ok).toBe(true); // occupies the counter slot
    g.pickUp('book-b');
    expect(g.drop('book-b', on('kitchenCounter', 8.0, 0.3)))
      .toMatchObject({ ok: false, reason: 'footprint-overlap' });
    expect(g.drop('book-b', on('kitchenCounter', 8.3, 0.3)).ok).toBe(true);
  });

  it('a floor drop onto an occupied mat shoe slot rejects; the adjacent spot succeeds (C-5×C-22)', () => {
    const g = new TidyingGame(physicsLevel);
    g.pickUp('shoe-a');
    expect(g.drop('shoe-a', slot('mt1')).ok).toBe(true);
    g.pickUp('shoe-b');
    expect(g.drop('shoe-b', on('floor', 1.42, 6.78)))
      .toMatchObject({ ok: false, reason: 'footprint-overlap' });
    expect(g.drop('shoe-b', on('floor', 2.0, 6.78)).ok).toBe(true);
  });

  it('the shoe AABB offset is consumed (D-13): the pair center sits +0.055 in y from the anchor', () => {
    const g = new TidyingGame(physicsLevel);
    g.pickUp('shoe-a');
    // at y 7.945 the offset pushes the AABB to 7.945…8.055 — past the room edge;
    // without the offset it would fit exactly (7.89…8.0)
    expect(g.validateSurfaceDrop('shoe-a', 'floor', 5, 7.945)).toMatchObject({ ok: false, reason: 'out-of-bounds' });
    expect(g.validateSurfaceDrop('shoe-a', 'floor', 5, 7.7)).toMatchObject({ ok: true });
  });

  it('static decor blocks drops that only overlap its AABB — one named test per prop (C-7)', () => {
    const g = new TidyingGame(physicsLevel);
    g.pickUp('book-a');
    // counter cutting board (obstacle 6.5…7.14 × 0.16…0.56)
    expect(g.validateSurfaceDrop('book-a', 'kitchenCounter', 6.6, 0.36))
      .toMatchObject({ ok: false, reason: 'footprint-overlap' });
    expect(g.validateSurfaceDrop('book-a', 'kitchenCounter', 7.3, 0.36)).toMatchObject({ ok: true });
    // counter kettle (obstacle 8.62…8.88 × 0.23…0.49)
    expect(g.validateSurfaceDrop('book-a', 'kitchenCounter', 8.75, 0.36))
      .toMatchObject({ ok: false, reason: 'footprint-overlap' });
    expect(g.validateSurfaceDrop('book-a', 'kitchenCounter', 8.4, 0.36)).toMatchObject({ ok: true });
  });

  it('insufficient clearance rejects items taller than the free height (A9)', () => {
    const board = (clearance: number): LevelDef => ({ ...physicsLevel,
      surfaces: [
        { id: 'floor', kind: 'floor', bounds: { minX: 0, maxX: 10, minY: 0, maxY: 8 }, topZ: 0 },
        { id: 'lowBoard', furnitureId: 'stool', kind: 'furniture',
          bounds: { minX: 5.0, maxX: 6.0, minY: 0.8, maxY: 1.4 }, topZ: 0.5, clearance },
      ] });
    // flat book is 0.05 tall: fits 0.05 exactly (boundary allowed), rejected at 0.04
    const gEdge = new TidyingGame(board(0.05));
    gEdge.pickUp('book-a');
    expect(gEdge.validateSurfaceDrop('book-a', 'lowBoard', 5.5, 1.1)).toMatchObject({ ok: true });
    const gTight = new TidyingGame(board(0.04));
    gTight.pickUp('book-a');
    expect(gTight.validateSurfaceDrop('book-a', 'lowBoard', 5.5, 1.1))
      .toMatchObject({ ok: false, reason: 'insufficient-clearance' });
    // the failed check never mutates state
    expect(gTight.locationOf('book-a')?.kind).toBe('held');
    // a book on a non-tier board is FLAT (C-9): height 0.05 fits the pinned
    // 0.23 linen-upper clearance — the boundary arithmetic above is the rule
    const gLinen = new TidyingGame({ ...physicsLevel,
      surfaces: [
        ...(physicsLevel.surfaces ?? []),
        { id: 'linen-upper', furnitureId: 'stool', kind: 'furniture',
          bounds: { minX: 2.94, maxX: 3.86, minY: 0.11, maxY: 0.6 }, topZ: 1.33, clearance: 0.23 },
      ] });
    expect(gLinen.validateSurfaceDrop('book-a', 'linen-upper', 3.44, 0.35)).toMatchObject({ ok: true });
  });

  it('books are upright on bookshelf tiers and flat everywhere else (C-9)', () => {
    const tierLevel: LevelDef = { ...physicsLevel,
      furniture: [{ id: 'bookshelf', asset: 'bookshelf', anchor: { x: 0.3, y: 1.9, z: 0 } }],
      surfaces: [
        ...(physicsLevel.surfaces ?? []),
        { id: 'bs-tier-1', furnitureId: 'bookshelf', kind: 'furniture',
          bounds: { minX: 0.08, maxX: 0.59, minY: 1.17, maxY: 2.63 }, topZ: 0.1, clearance: 0.53 },
      ] };
    const item = tierLevel.items[0];
    expect(orientationForPlacement(tierLevel, item, 'bs-tier-1')).toBe('upright');
    expect(orientationForPlacement(tierLevel, item, 'kitchenCounter')).toBe('flat');
    expect(orientationForPlacement(tierLevel, item, 'floor')).toBe('flat');
    // an upright book physically fits the tier's 0.53 clearance
    const g = new TidyingGame(tierLevel);
    expect(g.validateSurfaceDrop('book-a', 'bs-tier-1', 0.3, 1.6)).toMatchObject({ ok: true });
  });

  it('an invalid surface target (unknown surface) rejects no-surface', () => {
    const g = new TidyingGame(physicsLevel);
    g.pickUp('book-a');
    expect(g.drop('book-a', on('nowhere', 1, 1))).toMatchObject({ ok: false, reason: 'no-surface' });
    expect(g.validateSurfaceDrop('book-a', 'nowhere', 1, 1)).toMatchObject({ ok: false, reason: 'no-surface' });
    g.returnToFloor('book-a', 5.0, 3.3);
  });

  it('an invalid drop then an exact re-drop restores the previous location; nothing lost or duplicated', () => {
    const g = new TidyingGame(physicsLevel);
    g.pickUp('book-a');
    expect(g.drop('book-a', on('kitchenCounter', 7.8, 0.36)).ok).toBe(true);
    g.pickUp('book-a');
    expect(g.drop('book-a', on('stoolTop', 5.75, 1.1)).ok).toBe(false); // invalid — towel-class size
    expect(g.drop('book-a', on('kitchenCounter', 7.8, 0.36)).ok).toBe(true); // exact restore path
    expect(g.locationOf('book-a')).toMatchObject({ kind: 'surface', surfaceId: 'kitchenCounter', x: 7.8, y: 0.36 });
    expect(g.items.length).toBe(6); // nothing lost, nothing duplicated
    for (const id of ['book-a', 'book-b', 'mug-a', 'shoe-a', 'shoe-b', 'towel-a']) {
      expect(g.locationOf(id)).toBeDefined();
    }
  });

  it('cancel-restore returns floor items to their exact coordinates', () => {
    const g = new TidyingGame(physicsLevel);
    g.pickUp('book-a');
    expect(g.returnToFloor('book-a', 5.0, 3.3, -14)).toBe(true);
    expect(g.locationOf('book-a')).toMatchObject({ kind: 'floor', x: 5.0, y: 3.3, rotation: -14 });
  });

  it('the exact-restore drop is rejected when the old slot is now occupied (deterministic fallback trigger, C-18)', () => {
    const g = new TidyingGame(physicsLevel);
    g.pickUp('shoe-a');
    expect(g.drop('shoe-a', slot('mt1')).ok).toBe(true);
    g.pickUp('shoe-a'); // lifted from mt1
    // out-of-band: shoe-b takes mt1 (the only way this can happen — never in normal single-pointer play)
    g.returnToFloor('shoe-a', 2.0, 5.0, 0);
    g.pickUp('shoe-b');
    expect(g.drop('shoe-b', slot('mt1')).ok).toBe(true);
    g.pickUp('shoe-a');
    // restoring into mt1 now fails — the view's contracted fallback is
    // "floor near the drop point" via returnToFloor (deterministic)
    expect(g.drop('shoe-a', slot('mt1'))).toMatchObject({ ok: false, reason: 'slot-occupied' });
    expect(g.returnToFloor('shoe-a', 1.9, 6.9, 0)).toBe(true);
    expect(g.locationOf('shoe-a')).toMatchObject({ kind: 'floor', x: 1.9, y: 6.9 });
  });

  it('placed items can be re-dragged from every location kind (slot, surface, floor)', () => {
    const g = new TidyingGame(physicsLevel);
    g.pickUp('book-a');
    expect(g.drop('book-a', on('kitchenCounter', 7.8, 0.36)).ok).toBe(true);
    const fromSurface = g.pickUp('book-a');
    expect(fromSurface.ok && fromSurface.from).toMatchObject({ kind: 'surface', surfaceId: 'kitchenCounter' });
    expect(g.drop('book-a', slot('shelf1')).ok).toBe(true);
    const fromSlot = g.pickUp('book-a');
    expect(fromSlot.ok && fromSlot.from).toMatchObject({ kind: 'slot', slotId: 'shelf1' });
    expect(g.drop('book-a', on('floor', 4.4, 4.4)).ok).toBe(true);
    const fromFloor = g.pickUp('book-a');
    expect(fromFloor.ok && fromFloor.from).toMatchObject({ kind: 'floor', x: 4.4, y: 4.4 });
    expect(g.returnToFloor('book-a', 4.4, 4.4)).toBe(true);
  });

  it('a floor re-drop keeps the item’s pre-pickup rotation', () => {
    const g = new TidyingGame(physicsLevel);
    expect(g.returnToFloor('book-a', 5.2, 3.6, -14)).toBe(false); // not held yet
    expect(g.pickUp('book-a').ok).toBe(true);
    expect(g.returnToFloor('book-a', 5.2, 3.6, -14)).toBe(true);
    g.pickUp('book-a');
    expect(g.drop('book-a', on('floor', 6.0, 4.0)).ok).toBe(true);
    expect(g.locationOf('book-a')).toMatchObject({ kind: 'floor', x: 6.0, y: 4.0, rotation: -14 });
  });
});

// ---------------------------------------------------------------------------
// CC-007 / CC-009 — collections, tier-clean rule, tidy-all win, anti-spam
// ---------------------------------------------------------------------------

const shelfSlots = (zoneId: string): { id: string; zoneId: string; anchor: { x: number; y: number; z: number } }[] => {
  const zs = [0.1, 0.68, 1.28, 1.88];
  const out: { id: string; zoneId: string; anchor: { x: number; y: number; z: number } }[] = [];
  for (let t = 1; t <= 4; t++) {
    for (let s = 1; s <= 4; s++) {
      out.push({ id: `bs-t${t}-s${s}`, zoneId, anchor: { x: 0.3, y: 1.44 + (s - 1) * 0.33, z: zs[t - 1] } });
    }
  }
  return out;
};

const collectionLevel: LevelDef = {
  id: 'col-test',
  name: 'Collection test level',
  room: { width: 10, depth: 8, wallHeight: 2.9 },
  furniture: [
    { id: 'bookshelf', asset: 'bookshelf', anchor: { x: 0.3, y: 1.9, z: 0 } },
    { id: 'kitchenCounter', asset: 'kitchenCounter', anchor: { x: 7.8, y: 0.36, z: 0 } },
  ],
  zones: [
    { id: 'zoneShelf', label: 'Bookshelf', category: 'book', slots: shelfSlots('zoneShelf'), labelAnchor: { x: 0.5, y: 1.9, z: 2.55 } },
    { id: 'zoneRack', label: 'Kitchen rack', category: 'mug', slots: [{ id: 'rk1', zoneId: 'zoneRack', anchor: { x: 6.75, y: 0.16, z: 1.46 } }], labelAnchor: { x: 6.9, y: 0.3, z: 1.9 } },
  ],
  items: [
    { id: 'book-g1', category: 'book', asset: 'book', variant: 4, collectionId: 'col-green', start: { x: 5.0, y: 3.3 } },
    { id: 'book-g2', category: 'book', asset: 'book', variant: 5, collectionId: 'col-green', start: { x: 5.6, y: 3.4 } },
    { id: 'book-g3', category: 'book', asset: 'book', variant: 6, collectionId: 'col-green', start: { x: 6.2, y: 3.5 } },
    { id: 'book-g4', category: 'book', asset: 'book', variant: 7, collectionId: 'col-green', start: { x: 6.8, y: 3.6 } },
    { id: 'book-r1', category: 'book', asset: 'book', variant: 0, collectionId: 'col-red', start: { x: 7.4, y: 3.7 } },
    { id: 'book-r2', category: 'book', asset: 'book', variant: 1, collectionId: 'col-red', start: { x: 8.0, y: 3.8 } },
    { id: 'book-r3', category: 'book', asset: 'book', variant: 2, collectionId: 'col-red', start: { x: 8.6, y: 3.9 } },
    { id: 'book-r4', category: 'book', asset: 'book', variant: 3, collectionId: 'col-red', start: { x: 9.2, y: 4.0 } },
    { id: 'book-b1', category: 'book', asset: 'book', variant: 8, collectionId: 'col-blue', start: { x: 9.2, y: 4.8 } },
    { id: 'book-b2', category: 'book', asset: 'book', variant: 9, collectionId: 'col-blue', start: { x: 9.2, y: 5.6 } },
    { id: 'book-b3', category: 'book', asset: 'book', variant: 10, collectionId: 'col-blue', start: { x: 9.2, y: 6.4 } },
    { id: 'book-b4', category: 'book', asset: 'book', variant: 11, collectionId: 'col-blue', start: { x: 9.2, y: 7.2 } },
    { id: 'mug1', category: 'mug', asset: 'mug', variant: 0, start: { x: 4.4, y: 5.0 } },
    { id: 'mug2', category: 'mug', asset: 'mug', variant: 1, start: { x: 5.0, y: 5.6 } },
  ],
  surfaces: [
    { id: 'floor', kind: 'floor', bounds: { minX: 0, maxX: 10, minY: 0, maxY: 8 }, topZ: 0 },
    { id: 'kitchenCounter', furnitureId: 'kitchenCounter', kind: 'furniture',
      bounds: { minX: 6.3, maxX: 9.3, minY: 0.02, maxY: 0.7 }, topZ: 0.96, clearance: 0.36 },
    { id: 'bs-tier-1', furnitureId: 'bookshelf', kind: 'furniture',
      bounds: { minX: 0.08, maxX: 0.59, minY: 1.17, maxY: 2.63 }, topZ: 0.1, clearance: 0.53 },
    { id: 'bs-tier-2', furnitureId: 'bookshelf', kind: 'furniture',
      bounds: { minX: 0.08, maxX: 0.59, minY: 1.17, maxY: 2.63 }, topZ: 0.68, clearance: 0.55 },
    { id: 'bs-tier-3', furnitureId: 'bookshelf', kind: 'furniture',
      bounds: { minX: 0.08, maxX: 0.59, minY: 1.17, maxY: 2.63 }, topZ: 1.28, clearance: 0.55 },
    { id: 'bs-tier-4', furnitureId: 'bookshelf', kind: 'furniture',
      bounds: { minX: 0.08, maxX: 0.59, minY: 1.17, maxY: 2.63 }, topZ: 1.88, clearance: 0.49 },
  ],
  collections: [
    { id: 'col-red', label: 'Red books', colorKey: 'red' },
    { id: 'col-green', label: 'Green books', colorKey: 'green' },
    { id: 'col-blue', label: 'Blue books', colorKey: 'blue' },
  ],
};

const groupOnTier = (g: TidyingGame, tier: number, ids: string[]) => {
  const transitions: string[][] = [];
  ids.forEach((id, i) => {
    expect(g.pickUp(id).ok).toBe(true);
    const res = g.drop(id, { type: 'slot', slotId: `bs-t${tier}-s${i + 1}` });
    expect(res.ok).toBe(true);
    transitions.push(res.ok && res.collectionCompleted ? res.collectionCompleted : []);
  });
  return transitions;
};
const statusOf = (g: TidyingGame, id: string) => g.collectionStatus().find((c) => c.id === id)!;

describe('CC-007 — tier-clean collections (Q1 = C-1(a))', () => {
  it('3 green + 1 red on one tier: all drops accepted, no completion, no feedback', () => {
    const g = new TidyingGame(collectionLevel);
    for (const [id, slot] of [['book-g1', 's1'], ['book-g2', 's2'], ['book-g3', 's3'], ['book-r1', 's4']] as const) {
      g.pickUp(id);
      const res = g.drop(id, { type: 'slot', slotId: `bs-t2-${slot}` });
      expect(res.ok).toBe(true);
      expect(res.ok && res.collectionCompleted).toBeUndefined(); // no celebration channel
    }
    expect(statusOf(g, 'col-green').complete).toBe(false);
    expect(statusOf(g, 'col-red').complete).toBe(false);
    expect(g.isComplete()).toBe(false);
  });

  it('a wrong-color book free-dropped on a tier is accepted silently (mixed tier surface)', () => {
    const g = new TidyingGame(collectionLevel);
    groupOnTier(g, 2, ['book-g1', 'book-g2', 'book-g3']);
    g.pickUp('book-r1');
    // free tier drop in the gap between slot reservations (upright book, 0.06 deep)
    const res = g.drop('book-r1', { type: 'surface', surfaceId: 'bs-tier-2', x: 0.3, y: 1.6 });
    expect(res.ok).toBe(true);
    expect(res.ok && res.collectionCompleted).toBeUndefined();
    expect(statusOf(g, 'col-green').complete).toBe(false);
  });

  it('4 green + an unrelated item on the SAME tier does not count; other tiers unaffected', () => {
    const g = new TidyingGame(collectionLevel);
    groupOnTier(g, 2, ['book-g1', 'book-g2', 'book-g3', 'book-g4']);
    expect(statusOf(g, 'col-green').complete).toBe(true);
    g.pickUp('book-r1');
    const res = g.drop('book-r1', { type: 'surface', surfaceId: 'bs-tier-2', x: 0.3, y: 1.6 });
    expect(res.ok).toBe(true); // physically valid, no rejection
    expect(res.ok && res.collectionCompleted).toBeUndefined(); // breaking is silent
    expect(statusOf(g, 'col-green').complete).toBe(false);
    expect(g.tierOfItem('book-r1')).toBe('bs-tier-2'); // the intruder rests on the tier
    // moving the intruder OFF the tier genuinely re-completes the collection —
    // a real incomplete→complete transition, reported once (Q2 restoring counts again)
    g.pickUp('book-r1');
    const back = g.drop('book-r1', { type: 'surface', surfaceId: 'kitchenCounter', x: 7.8, y: 0.36 });
    expect(back.ok).toBe(true);
    expect(back.ok && back.collectionCompleted).toEqual(['col-green']);
    expect(statusOf(g, 'col-green').complete).toBe(true);
  });

  it('4 green + an unrelated item on ANOTHER tier still counts (tiers independent)', () => {
    const g = new TidyingGame(collectionLevel);
    groupOnTier(g, 2, ['book-g1', 'book-g2', 'book-g3', 'book-g4']);
    g.pickUp('book-r1');
    expect(g.drop('book-r1', { type: 'slot', slotId: 'bs-t3-s1' }).ok).toBe(true);
    expect(statusOf(g, 'col-green').complete).toBe(true);
    expect(statusOf(g, 'col-green').tierId).toBe('bs-tier-2');
  });

  it('the same clean grouping completes on any of the four tiers (interchangeable)', () => {
    for (const tier of [1, 2, 3, 4]) {
      const g = new TidyingGame(collectionLevel);
      groupOnTier(g, tier, ['book-g1', 'book-g2', 'book-g3', 'book-g4']);
      const s = statusOf(g, 'col-green');
      expect(s.complete).toBe(true);
      expect(s.tierId).toBe(`bs-tier-${tier}`);
    }
  });

  it('two collections complete simultaneously; three with the winning arrangement (§8.4)', () => {
    const g = new TidyingGame(collectionLevel);
    groupOnTier(g, 1, ['book-r1', 'book-r2', 'book-r3', 'book-r4']);
    groupOnTier(g, 2, ['book-g1', 'book-g2', 'book-g3', 'book-g4']);
    expect(statusOf(g, 'col-red').complete).toBe(true);
    expect(statusOf(g, 'col-green').complete).toBe(true);
    expect(statusOf(g, 'col-blue').complete).toBe(false);
    // the concrete winning arrangement: blue joins on tier 3, everything home
    groupOnTier(g, 3, ['book-b1', 'book-b2', 'book-b3', 'book-b4']);
    g.pickUp('mug1');
    expect(g.drop('mug1', { type: 'slot', slotId: 'rk1' }).ok).toBe(true);
    // mug2 cannot share rk1 — park it on the counter (clear of the cutting board)
    g.pickUp('mug2');
    expect(g.drop('mug2', { type: 'surface', surfaceId: 'kitchenCounter', x: 7.3, y: 0.36 }).ok).toBe(true);
    expect(statusOf(g, 'col-blue').complete).toBe(true);
    expect(g.isComplete()).toBe(true); // tidy-all + all three collections at the same time
  });

  it('removing one book from a complete collection: silently false, no event', () => {
    const g = new TidyingGame(collectionLevel);
    groupOnTier(g, 2, ['book-g1', 'book-g2', 'book-g3', 'book-g4']);
    g.pickUp('book-g2');
    const res = g.drop('book-g2', { type: 'surface', surfaceId: 'kitchenCounter', x: 7.8, y: 0.36 });
    expect(res.ok).toBe(true);
    expect(res.ok && res.collectionCompleted).toBeUndefined(); // breaking is silent
    expect(statusOf(g, 'col-green').complete).toBe(false);
  });

  it('break-then-regroup reports the transition exactly once', () => {
    const g = new TidyingGame(collectionLevel);
    groupOnTier(g, 2, ['book-g1', 'book-g2', 'book-g3', 'book-g4']);
    g.pickUp('book-g2');
    expect(g.drop('book-g2', { type: 'surface', surfaceId: 'kitchenCounter', x: 7.8, y: 0.36 }).ok).toBe(true);
    g.pickUp('book-g2');
    const res = g.drop('book-g2', { type: 'slot', slotId: 'bs-t2-s2' });
    expect(res.ok).toBe(true);
    expect(res.ok && res.collectionCompleted).toEqual(['col-green']); // once
  });

  it('put-back-after-pickup does not re-celebrate (Q2 anti-spam)', () => {
    const g = new TidyingGame(collectionLevel);
    groupOnTier(g, 2, ['book-g1', 'book-g2', 'book-g3', 'book-g4']);
    const picked = g.pickUp('book-g2');
    expect(picked.ok).toBe(true);
    // exact put-back: same slot as before the pickup
    const res = g.drop('book-g2', { type: 'slot', slotId: 'bs-t2-s2' });
    expect(res.ok).toBe(true);
    expect(res.ok && res.collectionCompleted).toBeUndefined(); // never re-fires
    expect(statusOf(g, 'col-green').complete).toBe(true); // status never dropped
  });

  it('cancel-restore of a member produces no transition (Q2 anti-spam)', () => {
    const g = new TidyingGame(collectionLevel);
    groupOnTier(g, 2, ['book-g1', 'book-g2', 'book-g3', 'book-g4']);
    expect(g.pickUp('book-g3').ok).toBe(true);
    // the view's cancel path re-drops into the old slot through the model
    const res = g.drop('book-g3', { type: 'slot', slotId: 'bs-t2-s3' });
    expect(res.ok).toBe(true);
    expect(res.ok && res.collectionCompleted).toBeUndefined();
    expect(statusOf(g, 'col-green').complete).toBe(true);
  });

  it('a held member holds the committed status; pickup never recomputes (Q2)', () => {
    const g = new TidyingGame(collectionLevel);
    groupOnTier(g, 2, ['book-g1', 'book-g2', 'book-g3', 'book-g4']);
    expect(g.pickUp('book-g4').ok).toBe(true);
    expect(statusOf(g, 'col-green').complete).toBe(true); // holds last committed value
    expect(g.collectionStatus().length).toBe(3);
  });

  it('tidy-all gating: a book on the counter or floor blocks completion; home slots satisfy it', () => {
    const g = new TidyingGame(collectionLevel);
    groupOnTier(g, 1, ['book-r1', 'book-r2', 'book-r3', 'book-r4']);
    groupOnTier(g, 2, ['book-g1', 'book-g2', 'book-g3', 'book-g4']);
    groupOnTier(g, 3, ['book-b1', 'book-b2', 'book-b3', 'book-b4']);
    // mug1 goes home; mug2 rests on the walkable mat (floor) → not complete
    g.pickUp('mug1');
    expect(g.drop('mug1', { type: 'slot', slotId: 'rk1' }).ok).toBe(true);
    g.pickUp('mug2');
    expect(g.returnToFloor('mug2', 1.6, 6.95, 0)).toBe(true); // a mat rest is floor (C-22)
    expect(g.locationOf('mug2')?.kind).toBe('floor');
    expect(g.isComplete()).toBe(false);
    // the same mug on the counter (valid non-floor placement) completes the level
    g.pickUp('mug2');
    expect(g.drop('mug2', { type: 'surface', surfaceId: 'kitchenCounter', x: 7.3, y: 0.36 }).ok).toBe(true);
    expect(g.isComplete()).toBe(true);
  });
});

describe('CC-009 — preview isolation (pure side)', () => {
  it('the preview query surface carries no collection state (type + runtime shape)', () => {
    const g = new TidyingGame(collectionLevel);
    g.pickUp('book-g1');
    const v = g.validateSurfaceDrop('book-g1', 'kitchenCounter', 7.8, 0.36);
    const t = g.findDropTarget('book-g1', 7.0, 0.4, 1.0, 1.44);
    for (const res of [v, t]) {
      for (const k of Object.keys(res ?? {})) {
        expect(['collectionCompleted', 'complete', 'tierId', 'collections', 'collection']).not.toContain(k);
      }
    }
    expect(v).toMatchObject({ ok: true });
  });

  it('collectionStatus() is invoked zero times across a full drag lifecycle', () => {
    const g = new TidyingGame(collectionLevel);
    let invocations = 0;
    const orig = g.collectionStatus.bind(g);
    (g as unknown as { collectionStatus: () => unknown }).collectionStatus = (...a: unknown[]) => {
      invocations++;
      return orig(...(a as []));
    };
    // full lifecycle: pickup → preview queries → commit (drop)
    expect(g.pickUp('book-g1').ok).toBe(true);
    g.validateSurfaceDrop('book-g1', 'kitchenCounter', 7.8, 0.36);
    g.validateSurfaceDrop('book-g1', 'bs-tier-2', 0.3, 1.6);
    g.findDropTarget('book-g1', 0.4, 1.7, 0.95, 0.55);
    const res = g.drop('book-g1', { type: 'slot', slotId: 'bs-t2-s1' });
    expect(res.ok).toBe(true);
    expect(invocations).toBe(0); // the preview pipeline never sees collection state
  });
});

describe('CC-014/CC-015 — HUD progress and completion gate agree', () => {
  it('HUD-vs-card consistency: the card gate holds exactly when progress is full and collections complete', () => {
    const g = new TidyingGame(collectionLevel);
    const agree = () => {
      const p = g.progress();
      const cols = g.collectionStatus();
      const cardGate = g.isComplete();
      const hudGate = p.placed === p.total && (cols.length === 0 || cols.every((c) => c.complete));
      return cardGate === hudGate;
    };
    expect(agree()).toBe(true); // scattered: 0/28, nothing complete
    g.pickUp('book-r1');
    g.drop('book-r1', { type: 'slot', slotId: 'bs-t1-s1' });
    expect(agree()).toBe(true); // 1/28
    g.pickUp('mug1');
    g.drop('mug1', { type: 'surface', surfaceId: 'kitchenCounter', x: 7.3, y: 0.36 });
    expect(agree()).toBe(true); // 2/28 (counter placement counts)
    g.pickUp('mug2');
    g.returnToFloor('mug2', 4.4, 5.0, 0);
    expect(agree()).toBe(true); // floor rest still 2/28
    // complete everything except one book
    for (const [id, slotId] of [['book-r2', 'bs-t1-s2'], ['book-r3', 'bs-t1-s3'], ['book-r4', 'bs-t1-s4']] as const) {
      g.pickUp(id);
      g.drop(id, { type: 'slot', slotId });
    }
    for (const [id, slotId] of [['book-g1', 'bs-t2-s1'], ['book-g2', 'bs-t2-s2'], ['book-g3', 'bs-t2-s3'], ['book-g4', 'bs-t2-s4']] as const) {
      g.pickUp(id);
      g.drop(id, { type: 'slot', slotId });
    }
    for (const [id, slotId] of [['book-b1', 'bs-t3-s1'], ['book-b2', 'bs-t3-s2'], ['book-b3', 'bs-t3-s3'], ['book-b4', 'bs-t3-s4']] as const) {
      g.pickUp(id);
      g.drop(id, { type: 'slot', slotId });
    }
    // 12 books placed + mug1 on the counter; mug2 still rests on the floor
    expect(g.progress().placed).toBe(13);
    expect(g.isComplete()).toBe(false);
    expect(agree()).toBe(true);
    g.pickUp('book-r1');
    g.drop('book-r1', { type: 'slot', slotId: 'bs-t1-s1' }); // exact put-back
    expect(g.isComplete()).toBe(false); // mug2 still on the floor
    g.pickUp('mug2');
    g.drop('mug2', { type: 'slot', slotId: 'rk1' });
    expect(g.progress().placed).toBe(14);
    expect(g.isComplete()).toBe(true);
    expect(agree()).toBe(true);
  });
});
