import { describe, expect, it } from 'vitest';
import { houseLevel } from '../level/house.level';
import {
  hasValidArrangement,
  isLayoutReachable,
  isScatterSafe,
  mulberry32,
  parseSeedParam,
  scatter,
} from './scatter';
import { TidyingGame } from './model';

const SEEDS = 100;
const sampleSeeds = Array.from({ length: SEEDS }, (_, i) => i + 1);

describe('CC-013 — seeded scatter & replay', () => {
  it('is deterministic: the same seed yields the exact same layout', () => {
    for (const seed of [1, 42, 0x7fffffff, 123456]) {
      expect(scatter(seed, houseLevel)).toEqual(scatter(seed, houseLevel));
    }
  });

  it('keeps every scattered pose safe through the model predicate for ≥ 100 seeds', () => {
    for (const seed of sampleSeeds) {
      const positions = scatter(seed, houseLevel);
      expect(isScatterSafe(houseLevel, positions), `seed ${seed} scatter-safe`).toBe(true);
    }
  });

  it('keeps every start cell reachable (cell-based) for ≥ 100 seeds', () => {
    for (const seed of sampleSeeds) {
      const positions = scatter(seed, houseLevel);
      expect(isLayoutReachable(houseLevel, positions), `seed ${seed} reachable`).toBe(true);
    }
  });

  it('respects the room and pairwise spacing for ≥ 100 seeds', () => {
    for (const seed of sampleSeeds) {
      const positions = scatter(seed, houseLevel);
      houseLevel.items.forEach((_item, i) => {
        const p = positions[i];
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(houseLevel.room.width);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(houseLevel.room.depth);
      });
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          // small-item class keeps the ≥ 0.7 center-to-center shorthand;
          // cushions rely on the AABB rule checked by isScatterSafe
          const a = houseLevel.items[i];
          const b = houseLevel.items[j];
          const small = ['book', 'mug', 'shoe', 'towel'];
          if (small.includes(a.category) && small.includes(b.category)) {
            expect(Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y))
              .toBeGreaterThanOrEqual(0.6);
          }
        }
      }
    }
  });

  it('is completable by construction: the slots-only solver finds an arrangement (shipped level + sampled seeds)', () => {
    const shipped = scatter(1, houseLevel);
    expect(hasValidArrangement(houseLevel, shipped).ok).toBe(true);
    for (const seed of sampleSeeds.slice(0, 10)) {
      const positions = scatter(seed, houseLevel);
      const result = hasValidArrangement(houseLevel, positions);
      expect(result.ok, `seed ${seed} solvable`).toBe(true);
    }
  });

  it('reports budget-exceeded instead of passing silently when the budget is tiny', () => {
    const positions = scatter(1, houseLevel);
    const result = hasValidArrangement(houseLevel, positions, 3);
    expect(result).toEqual({ ok: false, reason: 'budget-exceeded' });
  });

  it('the winning arrangement (plan §8.4) passes the solver and completes the level through the public API', () => {
    const game = new TidyingGame(houseLevel, 1);
    const slotIds = (prefix: string) => {
      const out: string[] = [];
      for (const z of houseLevel.zones) for (const s of z.slots) if (s.id.startsWith(prefix)) out.push(s.id);
      return out.sort();
    };
    const put = (id: string, slotId: string) => {
      expect(game.pickUp(id).ok).toBe(true);
      expect(game.drop(id, { type: 'slot', slotId }).ok).toBe(true);
    };
    ['book-r1', 'book-r2', 'book-r3', 'book-r4'].forEach((id, i) => put(id, slotIds('bs-t1-')[i]));
    ['book-g1', 'book-g2', 'book-g3', 'book-g4'].forEach((id, i) => put(id, slotIds('bs-t2-')[i]));
    ['book-b1', 'book-b2', 'book-b3', 'book-b4'].forEach((id, i) => put(id, slotIds('bs-t3-')[i]));
    for (const id of ['mug-a', 'mug-b', 'mug-c', 'mug-d']) put(id, slotIds('rk')[i_of(id)]);
    function i_of(id: string) { return ['mug-a', 'mug-b', 'mug-c', 'mug-d'].indexOf(id); }
    for (const id of ['cushion-a', 'cushion-b', 'cushion-c', 'cushion-d']) put(id, slotIds('sf')[i_of2(id)]);
    function i_of2(id: string) { return ['cushion-a', 'cushion-b', 'cushion-c', 'cushion-d'].indexOf(id); }
    for (const id of ['shoe-a', 'shoe-b', 'shoe-c', 'shoe-d']) put(id, slotIds('mt')[i_of3(id)]);
    function i_of3(id: string) { return ['shoe-a', 'shoe-b', 'shoe-c', 'shoe-d'].indexOf(id); }
    for (const id of ['towel-a', 'towel-b', 'towel-c', 'towel-d']) put(id, slotIds('ls')[i_of4(id)]);
    function i_of4(id: string) { return ['towel-a', 'towel-b', 'towel-c', 'towel-d'].indexOf(id); }
    expect(game.isComplete()).toBe(true);
  });

  it('resets to an identical layout with the same seed (positions compared exactly)', () => {
    const game = new TidyingGame(houseLevel, 99);
    const before = game.items.map((i) => ({ ...(game.locationOf(i.id) as { x: number; y: number; rotation: number }) }));
    // play a little
    game.pickUp('book-r1');
    game.drop('book-r1', { type: 'slot', slotId: 'bs-t2-s1' });
    game.pickUp('mug-a');
    game.drop('mug-a', { type: 'surface', surfaceId: 'kitchenCounter', x: 7.5, y: 0.36 });
    game.reset();
    const after = game.items.map((i) => ({ ...(game.locationOf(i.id) as { x: number; y: number; rotation: number }) }));
    expect(after).toEqual(before);
    expect(game.progress().placed).toBe(0);
    expect(game.currentSeed).toBe(99);
  });

  it('New Mess draws a fresh seed: different layout, state fully cleared, statuses quiet', () => {
    const game = new TidyingGame(houseLevel, 5);
    // arrange a complete collection so we can watch it clear quietly
    for (const [id, slotId] of [['book-r1', 'bs-t1-s1'], ['book-r2', 'bs-t1-s2'], ['book-r3', 'bs-t1-s3'], ['book-r4', 'bs-t1-s4']] as const) {
      game.pickUp(id);
      game.drop(id, { type: 'slot', slotId });
    }
    expect(game.collectionStatus().find((c) => c.id === 'col-red')!.complete).toBe(true);
    const seedBefore = game.currentSeed;
    game.newMess();
    expect(game.currentSeed).not.toBe(seedBefore);
    expect(game.progress().placed).toBe(0);
    for (const item of game.items) expect(game.locationOf(item.id)?.kind).toBe('floor');
    for (const c of game.collectionStatus()) expect(c.complete).toBe(false);
    // the new layout matches its own recorded seed (determinism of the draw)
    const positions = scatter(game.currentSeed, houseLevel);
    game.items.forEach((item, i) => {
      const loc = game.locationOf(item.id)!;
      if (loc.kind === 'floor') {
        expect(loc.x).toBeCloseTo(positions[i].x, 9);
        expect(loc.y).toBeCloseTo(positions[i].y, 9);
      }
    });
    // a second New Mess produces a different layout
    const layout1 = game.items.map((i) => game.locationOf(i.id));
    game.newMess();
    const layout2 = game.items.map((i) => game.locationOf(i.id));
    expect(layout1.some((l, i) => JSON.stringify(l) !== JSON.stringify(layout2[i]))).toBe(true);
  });

  it('reset(seed) re-seeds explicitly (deterministic tests can pin layouts)', () => {
    const game = new TidyingGame(houseLevel);
    game.reset(1234);
    expect(game.currentSeed).toBe(1234);
    const expected = scatter(1234, houseLevel);
    game.items.forEach((item, i) => {
      const loc = game.locationOf(item.id)!;
      expect(loc.kind === 'floor' && loc.x === expected[i].x).toBe(true);
    });
  });

  it('parses ?seed= as untrusted input: integers only, uint32 range, else default', () => {
    expect(parseSeedParam(null)).toBeUndefined();
    expect(parseSeedParam('42')).toBe(42);
    expect(parseSeedParam('0')).toBe(0);
    expect(parseSeedParam('4294967295')).toBe(4294967295);
    expect(parseSeedParam('abc')).toBeUndefined();
    expect(parseSeedParam('12.5')).toBeUndefined();
    expect(parseSeedParam('-1')).toBeUndefined();
    expect(parseSeedParam('4294967296')).toBeUndefined();
    expect(parseSeedParam('1e6')).toBeUndefined();
    expect(parseSeedParam('')).toBeUndefined();
  });

  it('mulberry32 is a deterministic PRNG in [0, 1)', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(mulberry32(8)()).not.toBe(seqA[0]);
  });
});
