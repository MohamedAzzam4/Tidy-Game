import { describe, expect, it } from 'vitest';
import { generateWorld } from '../worldgen';
import { validateWorld } from '../validation';
import { COMBO_COUNT, RACK_SLOTS } from '../config';

describe('world generation + validation (seed sweep)', () => {
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
      expect(w.totalTapes).toBeLessThanOrEqual(414);
      expect(new Set(w.tapes.map(t => t.id)).size).toBe(w.tapes.length);
      expect(w.racks.length).toBe(COMBO_COUNT);
    }
  }, 180_000);

  it('every combo demand <= rack capacity (enough compatible slots)', () => {
    for (const seed of [3, 33, 333, 3333]) {
      const w = generateWorld(seed);
      const demand = new Array(COMBO_COUNT).fill(0);
      for (const t of w.tapes) demand[t.combo] += 1;
      for (let c = 0; c < COMBO_COUNT; c++) {
        expect(demand[c]).toBeLessThanOrEqual(RACK_SLOTS);
      }
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
      // every defective tape is unrepaired and vice versa
      for (const t of w.tapes) {
        expect(t.repaired).toBe(t.defect === null);
      }
    }
  });
});
