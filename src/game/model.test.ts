import { describe, expect, it } from 'vitest';
import { TidyingGame } from './model';
import type { LevelDef } from './types';

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

const placedCount = (g: TidyingGame) => g.progress().placed;

describe('TidyingGame', () => {
  it('starts with every item on the floor and nothing placed', () => {
    const g = new TidyingGame(testLevel);
    expect(g.progress()).toEqual({ placed: 0, total: 3 });
    expect(g.isComplete()).toBe(false);
    for (const item of g.items) {
      expect(g.locationOf(item.id)?.kind).toBe('floor');
    }
    expect(g.locationOf('book1')).toMatchObject({ kind: 'floor', x: 5, y: 4 });
  });

  it('derives the required placements from the level data, not a constant', () => {
    const g = new TidyingGame(testLevel);
    expect(g.progress().total).toBe(testLevel.items.length);
  });

  it('accepts a correct drop, occupies the slot and updates progress', () => {
    const g = new TidyingGame(testLevel);
    expect(g.pickUp('book1').ok).toBe(true);
    const res = g.drop('book1', 'shelf1');
    expect(res).toMatchObject({ ok: true, slotId: 'shelf1', placed: 1, total: 3, completed: false });
    expect(g.occupantOf('shelf1')).toBe('book1');
    expect(g.locationOf('book1')).toMatchObject({ kind: 'slot', slotId: 'shelf1' });
    expect(placedCount(g)).toBe(1);
  });

  it('rejects a drop of the wrong category and changes nothing', () => {
    const g = new TidyingGame(testLevel);
    g.pickUp('mug1');
    const res = g.drop('mug1', 'shelf1');
    expect(res).toMatchObject({ ok: false, reason: 'wrong-category' });
    expect(g.occupantOf('shelf1')).toBeNull();
    expect(g.locationOf('mug1')?.kind).toBe('held'); // view restores it
    expect(placedCount(g)).toBe(0);
  });

  it('never lets a drop silently replace an occupied slot', () => {
    const g = new TidyingGame(testLevel);
    g.pickUp('book1');
    g.drop('book1', 'shelf1');
    g.pickUp('book2');
    const res = g.drop('book2', 'shelf1');
    expect(res).toMatchObject({ ok: false, reason: 'slot-occupied' });
    expect(g.occupantOf('shelf1')).toBe('book1');
    expect(placedCount(g)).toBe(1);
  });

  it('accepts any free slot in the matching zone (no hidden order)', () => {
    const g = new TidyingGame(testLevel);
    g.pickUp('book2');
    expect(g.drop('book2', 'shelf2').ok).toBe(true);
    g.pickUp('book1');
    expect(g.drop('book1', 'shelf1').ok).toBe(true);
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
    g.drop('book2', 'shelf2');
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
    g.drop('book1', 'shelf1');
    const picked = g.pickUp('book1');
    expect(picked.ok).toBe(true);
    expect(picked.from).toMatchObject({ kind: 'slot', slotId: 'shelf1' });
    expect(g.occupantOf('shelf1')).toBeNull();
    expect(placedCount(g)).toBe(0);
    // and it can go somewhere else
    expect(g.drop('book1', 'shelf2').ok).toBe(true);
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
    expect(g.drop('book1', 'shelf1')).toMatchObject({ ok: false, reason: 'not-held' });
    g.pickUp('book1');
    expect(g.drop('book1', 'nope')).toMatchObject({ ok: false, reason: 'unknown-slot' });
    expect(g.drop('ghost', 'shelf1')).toMatchObject({ ok: false, reason: 'unknown-item' });
    g.returnToFloor('book1', 5, 4);
  });

  it('only holds one item at a time', () => {
    const g = new TidyingGame(testLevel);
    expect(g.pickUp('book1').ok).toBe(true);
    expect(g.pickUp('book2').ok).toBe(false);
    expect(g.heldItem).toBe('book1');
  });

  it('resets to the initial scattered state after partial and full play', () => {
    const g = new TidyingGame(testLevel);
    g.pickUp('book1');
    g.drop('book1', 'shelf1');
    g.returnToFloor(g.heldItem ?? '', 0, 0); // no-op while nothing is held
    g.pickUp('mug1');
    g.drop('mug1', 'rack1');
    g.reset();
    expect(g.progress()).toEqual({ placed: 0, total: 3 });
    expect(g.locationOf('book1')).toMatchObject({ kind: 'floor', x: 5, y: 4 });
    expect(g.occupantOf('shelf1')).toBeNull();
    expect(g.occupantOf('rack1')).toBeNull();

    // also after full completion
    for (const [item, slot] of [
      ['book1', 'shelf1'],
      ['book2', 'shelf2'],
      ['mug1', 'rack1'],
    ] as const) {
      g.pickUp(item);
      g.drop(item, slot);
    }
    expect(g.isComplete()).toBe(true);
    g.reset();
    expect(g.progress().placed).toBe(0);
    expect(g.isComplete()).toBe(false);
  });

  it('locks the scene once complete (no further pickups)', () => {
    const g = new TidyingGame(testLevel);
    for (const [item, slot] of [
      ['book1', 'shelf1'],
      ['book2', 'shelf2'],
      ['mug1', 'rack1'],
    ] as const) {
      g.pickUp(item);
      const res = g.drop(item, slot);
      if (item === 'mug1') expect(res).toMatchObject({ ok: true, completed: true });
    }
    expect(g.isComplete()).toBe(true);
    expect(g.pickUp('book1').ok).toBe(false);
  });
});
