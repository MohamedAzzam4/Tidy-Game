/**
 * Worldgen checks: determinism, structural validity, scatter sanity, and the
 * tide-code trust boundary (untrusted strings never crash or mislead).
 */
import { describe, expect, it } from 'vitest';
import { generateWorld, mulberry32, parseTideCode, randomTide, scaleById, tideCode, SCALES } from './worldgen';

describe('mulberry32', () => {
  it('is deterministic and stays in [0,1)', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(b()).toBe(v);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('generateWorld', () => {
  it.each(SCALES.map((s) => [s.id, s] as const))('scale %s: deterministic + structurally valid', (_id, scale) => {
    const seed = 777_123;
    const w1 = generateWorld(seed, scale);
    const w2 = generateWorld(seed, scale);
    expect(JSON.stringify(w1)).toBe(JSON.stringify(w2));

    const speciesCount = scale.gridCols * scale.gridRows;
    expect(w1.species).toHaveLength(speciesCount);
    expect(w1.cubbies).toHaveLength(speciesCount);
    expect(w1.jars).toHaveLength(speciesCount * scale.jarsPerSpecies);
    expect(w1.critters).toHaveLength(speciesCount * scale.jarsPerSpecies * scale.jarCapacity);

    // every critter belongs to an existing jar of its own species
    const jarIds = new Set(w1.jars.map((j) => j.id));
    for (const c of w1.critters) {
      expect(jarIds.has(c.jarId)).toBe(true);
      const jar = w1.jars.find((j) => j.id === c.jarId)!;
      expect(jar.species).toBe(c.species);
    }
    // every jar holds exactly its capacity of critters
    for (const j of w1.jars) {
      expect(w1.critters.filter((c) => c.jarId === j.id)).toHaveLength(j.capacity);
    }
    // cubby species cover exactly the species set, one niche each
    expect(new Set(w1.cubbies.map((c) => c.species))).toEqual(new Set(w1.species.map((s) => s.id)));

    // scatter: inside shore bounds, no duplicate exact positions
    for (const c of w1.critters) {
      const p = w1.scatter[c.id];
      expect(p.x).toBeGreaterThan(w1.shore.x);
      expect(p.x).toBeLessThan(w1.shore.x + w1.shore.w);
      expect(p.y).toBeGreaterThan(w1.shore.y);
      expect(p.y).toBeLessThan(w1.shore.y + w1.shore.h);
    }
    const positions = new Set(w1.critters.map((c) => `${w1.scatter[c.id].x},${w1.scatter[c.id].y}`));
    expect(positions.size).toBe(w1.critters.length);
    for (const j of w1.jars) {
      const p = w1.jarScatter[j.id];
      expect(p.x).toBeLessThan(w1.shore.x + w1.shore.w);
    }
  });

  it('different seeds scatter differently (randomness works)', () => {
    const a = generateWorld(1, SCALES[0]);
    const b = generateWorld(2, SCALES[0]);
    const posA = a.critters.map((c) => a.scatter[c.id].x);
    const posB = b.critters.map((c) => b.scatter[c.id].x);
    expect(posA).not.toEqual(posB);
  });

  it('golden pearls are rare and real', () => {
    const w = generateWorld(42, SCALES[1]);
    const goldens = w.critters.filter((c) => c.golden).length;
    expect(goldens).toBeGreaterThan(0);
    expect(goldens).toBeLessThan(w.critters.length * 0.15);
  });
});

describe('tide codes (trust boundary)', () => {
  it('round-trips seed + scale', () => {
    for (const scale of SCALES) {
      const code = tideCode(123_456_789, scale);
      expect(parseTideCode(code)).toEqual({ seed: 123_456_789, scale });
    }
  });
  it('rejects malformed or out-of-range input', () => {
    expect(parseTideCode(null)).toBeNull();
    expect(parseTideCode('')).toBeNull();
    expect(parseTideCode('x123')).toBeNull();
    expect(parseTideCode('d!!')).toBeNull();
    expect(parseTideCode('u00000000')).toBeNull(); // 0 is fine, 8th char breaks it
    expect(parseTideCode('u1z141z4')).toBeNull(); // 2^32 out of range
    expect(parseTideCode('  E9k  ')).toEqual({ seed: parseInt('9k', 36), scale: scaleById('ebb') });
  });
  it('randomTide always yields a valid uint32 seed and known scale', () => {
    for (let i = 0; i < 20; i++) {
      const t = randomTide();
      expect(t.seed).toBeGreaterThanOrEqual(0);
      expect(t.seed).toBeLessThanOrEqual(0xffffffff);
      expect(SCALES.map((s) => s.id)).toContain(t.scale.id);
    }
  });
});
