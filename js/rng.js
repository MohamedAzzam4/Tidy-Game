// TIDEKEEPER rng.js - seeded PRNG + share-code codec. Pure module, no DOM.
// mulberry32: tiny, fast, good-enough distribution for level generation.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars, no 0/O/1/I
const BITS = 20; // seed space: 1..2^20-1 -> 4 code chars fit exactly

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// helpers bound to one generator instance
export function rngTools(rnd) {
  return {
    next: rnd,
    range: (min, max) => min + rnd() * (max - min),
    int: (min, max) => Math.floor(min + rnd() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(rnd() * arr.length)],
    chance: (p) => rnd() < p,
  };
}

// seed <-> 4-char code (TIDE-XXXX). Validation at trust boundary: bad codes fail cleanly.
export function codeFromSeed(seed) {
  if (!Number.isInteger(seed) || seed < 1 || seed >= (1 << BITS)) throw new Error('bad seed');
  let s = seed, out = '';
  for (let i = 0; i < 4; i++) { out = ALPHABET[s % 32] + out; s = Math.floor(s / 32); }
  return out;
}

export function seedFromCode(raw) {
  const code = String(raw || '').trim().toUpperCase().replace(/^TIDE-?/, '').replace(/[^A-Z0-9]/g, '');
  if (code.length !== 4) return null;
  let s = 0;
  for (const ch of code) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    s = s * 32 + v;
  }
  return s >= 1 && s < (1 << BITS) ? s : null;
}

export function randomSeed() { return 1 + Math.floor(Math.random() * ((1 << BITS) - 1)); }
