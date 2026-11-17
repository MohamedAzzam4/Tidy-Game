import { describe, expect, it } from 'vitest';
import { Rng, randomSeed } from '../rng';

describe('Rng (SplitMix64)', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 1000; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('produces distinct sequences for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('next() stays in [0,1) and int() in [0,max)', () => {
    const r = new Rng(999);
    for (let i = 0; i < 5000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = r.int(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });

  it('forked streams are isolated: consuming one never changes another', () => {
    const r1 = new Rng(42);
    const layout1 = r1.fork('layout');
    const scatter1 = r1.fork('scatter');
    for (let i = 0; i < 500; i++) layout1.next(); // layout churn
    const s1 = Array.from({ length: 10 }, () => scatter1.next());

    const r2 = new Rng(42);
    const layout2 = r2.fork('layout');
    const scatter2 = r2.fork('scatter');
    layout2.next(); // tiny difference in layout consumption
    const s2 = Array.from({ length: 10 }, () => scatter2.next());
    expect(s1).toEqual(s2); // scatter unaffected by layout consumption
  });

  it('fork is stable per tag', () => {
    const a = new Rng(7).fork('defects');
    const b = new Rng(7).fork('defects');
    expect(Array.from({ length: 8 }, () => a.next())).toEqual(Array.from({ length: 8 }, () => b.next()));
  });

  it('randomSeed returns usable 32-bit seeds', () => {
    const s = randomSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  });
});
