/**
 * Own PRNG (SplitMix64, BigInt) — version-stable, seedable, forkable child streams
 * so a change in one system (e.g. defect rolls) never reshuffles another (layout).
 */
const MASK = (1n << 64n) - 1n;
const GAMMA = 0x9E3779B97F4A7C15n;

export class Rng {
  private s: bigint;

  constructor(seed: number | bigint) {
    this.s = (BigInt(seed) & MASK) ^ GAMMA;
  }

  nextU64(): bigint {
    let z = (this.s = (this.s + GAMMA) & MASK);
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & MASK;
    return (z ^ (z >> 31n)) & MASK;
  }

  /** float in [0,1) with 53-bit precision */
  next(): number {
    return Number(this.nextU64() >> 11n) / Number(1n << 53n);
  }

  /** integer in [0, maxExclusive) */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** float in [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /** roughly triangular in [-spread, spread] */
  jitter(spread: number): number {
    return (this.next() - this.next()) * spread;
  }

  /** Fork a child stream: stable per tag, isolated from sibling streams. */
  fork(tag: string): Rng {
    let h = 2166136261;
    for (let i = 0; i < tag.length; i++) {
      h = Math.imul(h ^ tag.charCodeAt(i), 16777619) >>> 0;
    }
    return new Rng(this.nextU64() ^ BigInt(h));
  }
}

/** random 32-bit seed (used by New Game when no seed given) */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
