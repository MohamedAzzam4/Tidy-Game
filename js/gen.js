// TIDEKEEPER gen.js - seeded expedition generation. Pure module, no DOM.
// Faithful to Filing Good's two-tier loop: items -> containers -> slots.
//   mote (species glyph + number) -> bell (same species + number)
//   bell -> niche (same species, engraved glyph + pips)
// All positions are normalized [0,1] in a fixed 1280x720 world; the game maps
// them, so friends with the same TIDE code get the exact same starting mess.

import { mulberry32, rngTools, codeFromSeed } from './rng.js';

export const WORLD = { w: 1280, h: 720 };
export const FIELD = { x0: 24, x1: 1256, y0: 44, y1: 548 }; // playable water (wall band below)
export const WALL = { y0: 560, y1: 712, x0: 24, x1: 1256 }; // creel stone band

export const SPECIES_POOL = ['Coral', 'Kelp', 'Moonjelly', 'Ember', 'Pearl', 'Tidal', 'Drift', 'Abyss'];
export const GLYPHS = ['circle', 'triangle', 'diamond', 'star', 'ring', 'spark', 'cross', 'chevron'];
const LUMEN_RATE = 0.07; // variable-ratio reward: ~1 in 14 motes is prismatic

// Difficulty ramp: species count, numbers per species, mote capacity per bell.
// Cap bells (species x numbers) at ~18 so the niche wall stays readable.
export function ramp(expedition) {
  const n = Math.max(1, expedition | 0);
  const species = Math.min(8, 3 + Math.ceil(n / 2));        // 4,4,5,5,6,6,7,7,8...
  let nums = Math.min(4, 1 + Math.ceil(n / 3));             // 2,2,2,3,3,3,4,4...
  nums = Math.min(nums, Math.max(2, Math.floor(18 / species)));
  const cap = Math.min(6, 3 + Math.ceil(n / 4));            // 4,4,4,4,5,5,5,6...
  return { species, nums, cap };
}

export function generateExpedition(seed, expedition) {
  const r = rngTools(mulberry32(seed));
  const { species: S, nums: N, cap } = ramp(expedition);

  // Species hues: evenly spread around the wheel from a seeded offset, min 22 deg apart.
  const hueStep = Math.max(22, Math.round(360 / S));
  const hue0 = r.range(0, 360);
  const species = [];
  for (let i = 0; i < S; i++) {
    species.push({
      id: i,
      name: SPECIES_POOL[(i + (seed % S)) % SPECIES_POOL.length],
      glyph: GLYPHS[(i + (seed % 5)) % GLYPHS.length],
      hue: (hue0 + i * hueStep + r.range(-4, 4) + 360) % 360,
    });
  }

  // Bells: one per species+number, random capacity 4..cap.
  const bells = [];
  for (let s = 0; s < S; s++) {
    for (let n = 0; n < N; n++) {
      bells.push({ id: bells.length, species: s, num: n + 1, capacity: r.int(4, cap), x: 0, y: 0, motes: [] });
    }
  }

  // Bell scatter in the open water with rejection sampling (min separation).
  scatter(bells, r, 150, FIELD.x0 + 60, FIELD.x1 - 60, FIELD.y0 + 90, FIELD.y1 - 70);

  // Niche wall: grid rows grouped by species (species-major order).
  const niches = [];
  const count = bells.length;
  const cols = count <= 12 ? Math.ceil(count / 2) : Math.ceil(count / 3);
  const cw = (WALL.x1 - WALL.x0) / cols;
  const rows = Math.ceil(count / cols);
  const ch = (WALL.y1 - WALL.y0) / rows;
  let k = 0;
  for (let s = 0; s < S; s++) {
    for (let n = 0; n < N; n++) {
      const c = k % cols, row = Math.floor(k / cols);
      niches.push({
        id: k, species: s, num: n + 1,
        x: WALL.x0 + cw * (c + 0.5),
        y: WALL.y0 + ch * (row + 0.5),
        cw, ch,
        bellId: null,
      });
      k++;
    }
  }

  // Motes: fill every bell's quota; some are Lumen (variable reward).
  const motes = [];
  for (const bell of bells) {
    for (let i = 0; i < bell.capacity; i++) {
      motes.push({
        id: motes.length, species: bell.species, num: bell.num,
        lumen: r.chance(LUMEN_RATE), x: 0, y: 0, vx: 0, vy: 0,
        phase: r.range(0, Math.PI * 2),
      });
    }
  }
  // Loose scatter across the water (they will drift on top of the pile).
  scatter(motes, r, 0, FIELD.x0 + 26, FIELD.x1 - 26, FIELD.y0 + 26, FIELD.y1 - 20);

  return {
    seed, code: 'TIDE-' + codeFromSeed(seed), expedition,
    species, bells, niches, motes, lumenCount: motes.filter(m => m.lumen).length,
  };
}

// Rejection-scatter entities over a rect; jittered grid fallback so it always terminates.
function scatter(list, r, minDist, x0, x1, y0, y1) {
  for (const e of list) {
    let ok = false, x = 0, y = 0;
    for (let t = 0; t < 60 && !ok; t++) {
      x = r.range(x0, x1); y = r.range(y0, y1);
      ok = true;
      for (const o of list) {
        if (o === e || (o.x === 0 && o.y === 0)) continue;
        if ((o.x - x) ** 2 + (o.y - y) ** 2 < minDist * minDist) { ok = false; break; }
      }
    }
    e.x = x; e.y = y;
  }
}

export function matchMoteBell(mote, bell) {
  return mote.species === bell.species && mote.num === bell.num && bell.motes.length < bell.capacity;
}
export function matchBellNiche(bell, niche) {
  return bell.species === niche.species && bell.num === niche.num && niche.bellId === null;
}
