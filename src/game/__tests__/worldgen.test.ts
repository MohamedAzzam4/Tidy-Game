import { describe, expect, it } from 'vitest';
import { generateWorld } from '../worldgen';
import { validateWorld } from '../validation';
import { CENTER, GROUPS, GROUP_CAPACITY, ROWS, rowsOfGroup, unitOfRow } from '../config';

describe('world generation + validation v2 (seed sweep)', () => {
  it('is deterministic: same seed twice => identical worlds', () => {
    for (const seed of [1, 42, 777, 20260118, 0xffffffff]) {
      const a = generateWorld(seed);
      const b = generateWorld(seed);
      expect(a).toEqual(b);
    }
  });

  it('different seeds give different layouts', () => {
    const a = generateWorld(11);
    const b = generateWorld(12);
    expect(a.tapes.map(t => t.x)).not.toEqual(b.tapes.map(t => t.x));
  });

  it('200-seed sweep: >=400 tapes, valid world, no issues (gates the build)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const w = generateWorld(seed);
      const v = validateWorld(w);
      if (!v.ok) {
        throw new Error(`seed ${seed} invalid: ${v.issues.slice(0, 5).join('; ')}`);
      }
      expect(w.totalTapes).toBeGreaterThanOrEqual(400);
      expect(w.totalTapes).toBeLessThanOrEqual(GROUPS * GROUP_CAPACITY); // 512
      expect(new Set(w.tapes.map(t => t.id)).size).toBe(w.tapes.length);
      expect(w.rows.length).toBe(ROWS); // 64 labeled rows
    }
  }, 180_000);

  it('group counts derive from combined row capacity; both rows in different units', () => {
    for (const seed of [3, 33, 333, 3333]) {
      const w = generateWorld(seed);
      const demand = new Array(GROUPS).fill(0);
      for (const t of w.tapes) demand[t.combo] += 1;
      for (let g = 0; g < GROUPS; g++) {
        expect(demand[g]).toBeGreaterThanOrEqual(1);
        expect(demand[g]).toBeLessThanOrEqual(GROUP_CAPACITY); // 16 = 2 rows x 8
        const [a, b] = rowsOfGroup(g);
        expect(unitOfRow(a)).not.toBe(unitOfRow(b)); // never both rows in one unit
        expect(w.rows[a].group).toBe(g);
        expect(w.rows[b].group).toBe(g);
      }
    }
  });

  it('the center stays populated across seeds (no empty middle)', () => {
    for (const seed of [1, 7, 13, 29, 101, 555, 909, 424242]) {
      const w = generateWorld(seed);
      const inCenter = w.tapes.filter(t =>
        t.x >= CENTER.x && t.x <= CENTER.x + CENTER.w
        && t.y >= CENTER.y && t.y <= CENTER.y + CENTER.h,
      ).length;
      expect(inCenter).toBeGreaterThanOrEqual(100);
    }
  });

  it('defects: ~11% of tapes, exactly one each, all three types present, all solvable', () => {
    for (const seed of [5, 55, 555]) {
      const w = generateWorld(seed);
      const defective = w.tapes.filter(t => t.defect !== null);
      const ratio = defective.length / w.totalTapes;
      expect(ratio).toBeGreaterThan(0.08);
      expect(ratio).toBeLessThan(0.14);
      expect(defective.length).toBeGreaterThanOrEqual(18);
      for (const t of defective) expect(['rewind', 'sticker', 'paint']).toContain(t.defect);
      const types = new Set(defective.map(t => t.defect));
      expect(types.size).toBe(3);
      for (const t of w.tapes) {
        expect(t.repaired).toBe(t.defect === null);
      }
    }
  });
});
