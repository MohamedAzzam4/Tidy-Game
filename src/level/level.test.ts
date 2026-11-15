import { describe, expect, it } from 'vitest';
import { houseLevel } from './house.level';
import { TidyingGame } from '../game/model';

/** Sanity checks on the shipped level data — keeps it playable by construction. */
describe('house level', () => {
  const level = houseLevel;
  const countByCategory = (cat: string) => level.items.filter((i) => i.category === cat).length;

  it('has exactly the intended set of movable items', () => {
    expect(level.items.length).toBe(12);
    expect(countByCategory('book')).toBe(3);
    expect(countByCategory('mug')).toBe(3);
    expect(countByCategory('cushion')).toBe(2);
    expect(countByCategory('shoe')).toBe(2);
    expect(countByCategory('towel')).toBe(2);
  });

  it('gives every category a zone with at least as many free slots as items', () => {
    for (const cat of ['book', 'mug', 'cushion', 'shoe', 'towel'] as const) {
      const zone = level.zones.find((z) => z.category === cat);
      expect(zone, `zone for ${cat}`).toBeDefined();
      expect(zone!.slots.length).toBeGreaterThanOrEqual(countByCategory(cat));
    }
  });

  it('uses unique item, slot, zone and furniture ids', () => {
    const ids = (arr: { id: string }[]) => new Set(arr.map((a) => a.id));
    expect(ids(level.items).size).toBe(level.items.length);
    expect(ids(level.furniture).size).toBe(level.furniture.length);
    expect(ids(level.zones).size).toBe(level.zones.length);
    const slots = level.zones.flatMap((z) => z.slots);
    expect(ids(slots).size).toBe(slots.length);
  });

  it('keeps start positions and slot anchors inside the room', () => {
    const { width, depth } = level.room;
    for (const item of level.items) {
      expect(item.start.x).toBeGreaterThan(0.2);
      expect(item.start.x).toBeLessThan(width - 0.2);
      expect(item.start.y).toBeGreaterThan(0.2);
      expect(item.start.y).toBeLessThan(depth - 0.2);
    }
    for (const slot of level.zones.flatMap((z) => z.slots)) {
      expect(slot.anchor.x).toBeGreaterThan(-0.1);
      expect(slot.anchor.x).toBeLessThan(width + 0.1);
      expect(slot.anchor.y).toBeGreaterThan(-0.1);
      expect(slot.anchor.y).toBeLessThan(depth + 0.1);
      expect(slot.anchor.z).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps scattered items clear of each other', () => {
    for (let i = 0; i < level.items.length; i++) {
      for (let j = i + 1; j < level.items.length; j++) {
        const a = level.items[i].start;
        const b = level.items[j].start;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.7);
      }
    }
  });

  it('is completable through the game rules (12 placements from data)', () => {
    const game = new TidyingGame(level);
    expect(game.progress().total).toBe(12);
    let lastCompleted = false;
    for (const item of level.items) {
      expect(game.pickUp(item.id).ok).toBe(true);
      const zone = level.zones.find((z) => z.category === item.category)!;
      const slot = zone.slots.find((s) => !game.occupantOf(s.id))!;
      const res = game.drop(item.id, slot.id);
      expect(res.ok).toBe(true);
      lastCompleted = res.ok && res.completed;
    }
    expect(lastCompleted).toBe(true);
    expect(game.isComplete()).toBe(true);
  });
});
