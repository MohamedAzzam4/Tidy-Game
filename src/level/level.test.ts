import { describe, expect, it } from 'vitest';
import { houseLevel } from './house.level';
import { FURNITURE_FOOTPRINTS, ITEM_FOOTPRINTS, SURFACE_OBSTACLES } from './footprints';
import { TidyingGame } from '../game/model';

/** Sanity checks on the shipped level data — keeps it playable by construction. */
describe('house level', () => {
  const level = houseLevel;
  const countByCategory = (cat: string) => level.items.filter((i) => i.category === cat).length;

  it('has exactly the intended set of 28 movable items (A1 mix)', () => {
    expect(level.items.length).toBe(28);
    expect(countByCategory('book')).toBe(12);
    expect(countByCategory('mug')).toBe(4);
    expect(countByCategory('cushion')).toBe(4);
    expect(countByCategory('shoe')).toBe(4);
    expect(countByCategory('towel')).toBe(4);
  });

  it('defines three collections of exactly four books each (A2 variant mapping)', () => {
    const cols = level.collections ?? [];
    expect(cols.map((c) => c.id).sort()).toEqual(['col-blue', 'col-green', 'col-red']);
    for (const c of cols) {
      const members = level.items.filter((i) => i.collectionId === c.id);
      expect(members.length).toBe(4);
      for (const m of members) expect(m.category).toBe('book');
    }
    // variant = collectionIndex * 4 + i, matching BOOK_VARIANTS in assets.ts
    const idx = (id: string) => cols.findIndex((c) => c.id === id);
    for (const item of level.items.filter((i) => i.category === 'book')) {
      expect(item.variant).toBeGreaterThanOrEqual(idx(item.collectionId!) * 4);
      expect(item.variant).toBeLessThanOrEqual(idx(item.collectionId!) * 4 + 3);
    }
    const variants = level.items.filter((i) => i.category === 'book').map((i) => i.variant).sort((a, b) => a - b);
    expect(variants).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('keeps every item start clear of furniture footprints (solver-proven baseline)', () => {
    for (const item of level.items) {
      for (const f of level.furniture) {
        if (f.flat) continue;
        // only furniture with a registered floor-exclusion footprint blocks
        const fp = FURNITURE_FOOTPRINTS[f.id];
        if (!fp) continue;
        const dx = Math.abs(item.start.x - f.anchor.x);
        const dy = Math.abs(item.start.y - f.anchor.y);
        const clearX = fp.dx / 2 + 0.3; // generous furniture clearance
        const clearY = fp.dy / 2 + 0.3;
        const outside = dx > clearX || dy > clearY;
        expect(outside, `${item.id} clear of ${f.id}`).toBe(true);
      }
    }
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

  it('is completable through the game rules (winning arrangement, plan §8.4)', () => {
    const game = new TidyingGame(level);
    expect(game.progress().total).toBe(28);
    let lastCompleted = false;
    for (const item of level.items) {
      expect(game.pickUp(item.id).ok).toBe(true);
      const zone = level.zones.find((z) => z.category === item.category)!;
      // books take their collection's tier slots in order (red → tier 1,
      // green → tier 2, blue → tier 3); non-books take their home slots
      const slot = item.category === 'book'
        ? zone.slots.find((s) => !game.occupantOf(s.id))!
        : zone.slots.find((s) => !game.occupantOf(s.id))!;
      const res = game.drop(item.id, { type: 'slot', slotId: slot.id });
      expect(res.ok).toBe(true);
      lastCompleted = res.ok && res.completed;
    }
    expect(lastCompleted).toBe(true);
    expect(game.isComplete()).toBe(true);
  });
});

/** CC-003 sanity: the surface + footprint registry matches the drawn art pins. */
describe('surface & footprint registry (CC-003)', () => {
  const level = houseLevel;
  const surfaces = level.surfaces ?? [];
  const byId = (id: string) => surfaces.find((s) => s.id === id)!;
  const width = (b: { minX: number; maxX: number }) => b.maxX - b.minX;
  const depth = (b: { minY: number; maxY: number }) => b.maxY - b.minY;

  it('registers the approved surface set with pinned topZ values (incl. CC-010 tiers)', () => {
    expect(surfaces.map((s) => s.id).sort()).toEqual([
      'benchSeat', 'bs-tier-1', 'bs-tier-2', 'bs-tier-3', 'bs-tier-4',
      'floor', 'kitchenCounter', 'linen-lower', 'linen-upper', 'sofaSeat', 'stoolTop',
    ]);
    expect(byId('floor').kind).toBe('floor');
    expect(byId('kitchenCounter').topZ).toBe(0.96); // countertop top face (Q3/C-4)
    expect(byId('benchSeat').topZ).toBe(0.5);
    expect(byId('stoolTop').topZ).toBe(0.49);
    expect(byId('sofaSeat').topZ).toBe(0.55);
    expect(byId('linen-lower').topZ).toBe(0.91);
    expect(byId('linen-upper').topZ).toBe(1.33);
    // rebuilt shelf (D-2 pins): boards 0.05 thick → clearances 0.53/0.55/0.55/0.49
    expect(byId('bs-tier-1').topZ).toBe(0.1);
    expect(byId('bs-tier-1').clearance).toBe(0.53);
    expect(byId('bs-tier-2').topZ).toBe(0.68);
    expect(byId('bs-tier-2').clearance).toBe(0.55);
    expect(byId('bs-tier-3').topZ).toBe(1.28);
    expect(byId('bs-tier-3').clearance).toBe(0.55);
    expect(byId('bs-tier-4').topZ).toBe(1.88);
    expect(byId('bs-tier-4').clearance).toBe(0.49);
    for (const t of ['bs-tier-1', 'bs-tier-2', 'bs-tier-3', 'bs-tier-4']) {
      // every upright book fits every tier with ≥ 0.10 margin
      expect(byId(t).clearance!).toBeGreaterThanOrEqual(ITEM_FOOTPRINTS.book.upright!.height + 0.1);
    }
  });

  it('has 16 bookshelf slots inside the tier interiors with ≥ 0.30 spacing', () => {
    const slots = level.zones.find((z) => z.id === 'zoneBookshelf')!.slots;
    expect(slots.length).toBe(16);
    const tierBounds = { minX: 0.08, maxX: 0.59, minY: 1.17, maxY: 2.63 };
    for (const tier of [1, 2, 3, 4]) {
      const row = slots.filter((s) => s.id.startsWith(`bs-t${tier}-`)).map((s) => s.anchor);
      expect(row.length).toBe(4);
      const ys = row.map((a) => a.y).sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(0.3);
      for (const a of row) {
        expect(a.x).toBeGreaterThanOrEqual(tierBounds.minX);
        expect(a.x).toBeLessThanOrEqual(tierBounds.maxX);
        expect(a.y).toBeGreaterThanOrEqual(tierBounds.minY);
        expect(a.y).toBeLessThanOrEqual(tierBounds.maxY);
        expect(a.z).toBeCloseTo([0.1, 0.68, 1.28, 1.88][tier - 1], 5);
      }
    }
  });

  it('pins clearances where art sits above (A9): counter 0.36, linen boards 0.37/0.23', () => {
    expect(byId('kitchenCounter').clearance).toBe(0.36); // mug-rack board underside 1.32 − 0.96
    expect(byId('linen-lower').clearance).toBe(0.37); // upper board underside 1.28 − 0.91
    expect(byId('linen-upper').clearance).toBe(0.23); // top slab underside 1.56 − 1.33
    // a tallest upright book fits the counter exactly, and the lower linen board…
    expect(ITEM_FOOTPRINTS.book.upright!.height).toBeLessThanOrEqual(byId('kitchenCounter').clearance!);
    expect(ITEM_FOOTPRINTS.book.upright!.height).toBeLessThanOrEqual(byId('linen-lower').clearance!);
    // …but not the upper board (flat books do).
    expect(ITEM_FOOTPRINTS.book.upright!.height).toBeGreaterThan(byId('linen-upper').clearance!);
    expect(ITEM_FOOTPRINTS.book.flat!.height).toBeLessThanOrEqual(byId('linen-upper').clearance!);
  });

  it('fits the undersized-surface class rule: mug fits the stool, towel does not', () => {
    const stool = byId('stoolTop');
    expect(width(stool.bounds)).toBeGreaterThanOrEqual(ITEM_FOOTPRINTS.mug.flat!.dx);
    expect(depth(stool.bounds)).toBeGreaterThanOrEqual(ITEM_FOOTPRINTS.mug.flat!.dy);
    // the towel (0.36 × 0.28) cannot sit fully inside the 0.28 × 0.28 stool AABB —
    // the "sofa cannot fit in a cabinet" class of rule, concretely
    const towelFits =
      width(stool.bounds) >= ITEM_FOOTPRINTS.towel.flat!.dx &&
      depth(stool.bounds) >= ITEM_FOOTPRINTS.towel.flat!.dy;
    expect(towelFits).toBe(false);
    expect(width(stool.bounds)).toBeLessThan(ITEM_FOOTPRINTS.towel.flat!.dx);
  });

  it('keeps every surface inside its furniture floor-exclusion footprint', () => {
    for (const s of surfaces) {
      if (!s.furnitureId) continue;
      const fp = FURNITURE_FOOTPRINTS[s.furnitureId];
      expect(fp, `footprint for ${s.furnitureId}`).toBeDefined();
      const f = level.furniture.find((f) => f.id === s.furnitureId)!;
      const fx0 = f.anchor.x - fp.dx / 2, fx1 = f.anchor.x + fp.dx / 2;
      const fy0 = f.anchor.y - fp.dy / 2, fy1 = f.anchor.y + fp.dy / 2;
      expect(s.bounds.minX).toBeGreaterThanOrEqual(fx0 - 0.01);
      expect(s.bounds.maxX).toBeLessThanOrEqual(fx1 + 0.01);
      expect(s.bounds.minY).toBeGreaterThanOrEqual(fy0 - 0.01);
      expect(s.bounds.maxY).toBeLessThanOrEqual(fy1 + 0.01);
    }
  });

  it('registers a static-decor obstacle per drawn prop on its surface (C-7)', () => {
    const counterObstacles = SURFACE_OBSTACLES.kitchenCounter ?? [];
    const upperObstacles = SURFACE_OBSTACLES['linen-upper'] ?? [];
    expect(counterObstacles.map((o) => o.id).sort()).toEqual(['cutting-board', 'kettle']);
    expect(upperObstacles.map((o) => o.id).sort()).toEqual(['basket', 'folded-linens']);
    for (const [sid, obs] of Object.entries(SURFACE_OBSTACLES)) {
      const s = byId(sid);
      for (const o of obs) {
        expect(o.minX).toBeGreaterThanOrEqual(s.bounds.minX);
        expect(o.maxX).toBeLessThanOrEqual(s.bounds.maxX);
        expect(o.minY).toBeGreaterThanOrEqual(s.bounds.minY);
        expect(o.maxY).toBeLessThanOrEqual(s.bounds.maxY);
      }
    }
    // props must not cover the whole surface — usable space remains
    for (const [sid, obs] of Object.entries(SURFACE_OBSTACLES)) {
      const s = byId(sid);
      const covered = obs.reduce((acc, o) => acc + (o.maxX - o.minX) * (o.maxY - o.minY), 0);
      const total = width(s.bounds) * depth(s.bounds);
      expect(covered).toBeLessThan(total * 0.6);
    }
  });

  it('gives the entry mat no surface entry and no floor exclusion (C-22)', () => {
    expect(surfaces.some((s) => s.furnitureId === 'entryMat' || s.id.includes('mat'))).toBe(false);
    expect(FURNITURE_FOOTPRINTS.entryMat).toBeUndefined();
    expect(FURNITURE_FOOTPRINTS.rug).toBeUndefined();
  });

  it('keeps shoe and book footprints at their builder-pinned dimensions (Q3)', () => {
    expect(ITEM_FOOTPRINTS.book.upright).toEqual({ dx: 0.2, dy: 0.06, height: 0.36 });
    expect(ITEM_FOOTPRINTS.book.flat).toEqual({ dx: 0.2, dy: 0.32, height: 0.05 });
    expect(ITEM_FOOTPRINTS.shoe.flat).toEqual({ dx: 0.34, dy: 0.11, height: 0.2, offsetY: 0.055 });
  });
});
