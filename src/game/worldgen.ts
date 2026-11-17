/**
 * Seeded world generation (pure module — no DOM). A tide code pins the whole
 * run: species subset, jar/critter assignment, golden pearls, scatter, decor —
 * the same code always rebuilds the same mess, mirroring the reference game's
 * shareable "game codes" while making every fresh tide random.
 *
 * Scatter strategy: rejection sampling with min gaps, relaxing stepwise, then a
 * jittered-grid fallback — the same ladder the repo used for Cozy Corner
 * (src/game/scatter.ts), reduced to points+radius because critters are round.
 */
import type { CritterDef, CubbyDef, Decor, JarDef, ScaleDef, ScatterPos, SpeciesDef, World } from './types';

/** Mulberry32 PRNG: seed → deterministic sequence in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SCALES: ScaleDef[] = [
  { id: 'drift', label: 'Drift', blurb: 'A gentle first tide', gridCols: 2, gridRows: 2, jarsPerSpecies: 3, jarCapacity: 4 },
  { id: 'ebb', label: 'Ebb', blurb: 'A fuller shoreline, more species', gridCols: 3, gridRows: 2, jarsPerSpecies: 5, jarCapacity: 5 },
  { id: 'undertow', label: 'Undertow', blurb: 'The long tide. Settle in', gridCols: 3, gridRows: 3, jarsPerSpecies: 8, jarCapacity: 6 },
];

export function scaleById(id: string): ScaleDef {
  return SCALES.find((s) => s.id === id) ?? SCALES[0];
}

/** The full species pool; each run draws a subset (largest scales use most). */
export const SPECIES_POOL: SpeciesDef[] = [
  { id: 'starfish', label: 'Starfish', hue: 18, glyph: 'star', size: 1.35 },
  { id: 'moonshell', label: 'Moon Shell', hue: 205, glyph: 'shell', size: 1.0 },
  { id: 'jelly', label: 'Moon Jelly', hue: 285, glyph: 'jelly', size: 1.25 },
  { id: 'hermit', label: 'Hermit Crab', hue: 32, glyph: 'crab', size: 1.1 },
  { id: 'seaglass', label: 'Sea Glass', hue: 160, glyph: 'glass', size: 0.85 },
  { id: 'dollar', label: 'Sand Dollar', hue: 48, glyph: 'dollar', size: 1.2 },
  { id: 'clam', label: 'Pearl Clam', hue: 330, glyph: 'clam', size: 1.15 },
  { id: 'urchin', label: 'Sea Urchin', hue: 265, glyph: 'urchin', size: 1.05 },
  { id: 'float', label: 'Glass Float', hue: 190, glyph: 'float', size: 1.3 },
  { id: 'conch', label: 'Conch', hue: 12, glyph: 'conch', size: 1.2 },
  { id: 'anemone', label: 'Anemone', hue: 95, glyph: 'anemone', size: 1.15 },
  { id: 'kelp', label: 'Kelp Ring', hue: 130, glyph: 'ring', size: 0.95 },
];

/** ~1 in 25 critters is golden — variable-ratio reinforcement, tuned sparse. */
const GOLDEN_RATE = 0.04;

/** Radii & gaps (world units) — one knob per relationship, nothing hidden. */
const CRITTER_R = 1.15;
const JAR_R = 2.4;
const GAP_CRIT_CRIT = 3.4;
const GAP_JAR_JAR = 6.2;
const WALL_GAP = 4.0;
const EDGE = 3.0;
const ATTEMPTS_PER_ITEM = 260;

function tooClose(
  p: { x: number; y: number },
  r: number,
  placed: Array<{ x: number; y: number; r: number }>,
  extra: number,
): boolean {
  for (const q of placed) {
    const gap = r + q.r + extra;
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    if (dx * dx + dy * dy < gap * gap) return true;
  }
  return false;
}

interface Rect { x: number; y: number; w: number; h: number }

/** Rejection scatter of points with radius inside rect, then jittered grid
 *  fallback (relaxed spacing ladder keeps big tides solvable). */
function scatterPoints(
  rand: () => number,
  n: number,
  rect: Rect,
  radius: number,
  minGap: number,
  avoid: Array<{ x: number; y: number; r: number }>,
): ScatterPos[] {
  for (const gap of [minGap, minGap * 0.6, minGap * 0.3]) {
    const placed: Array<{ x: number; y: number; r: number }> = [];
    const out: ScatterPos[] = [];
    for (let i = 0; i < n; i++) {
      let ok = false;
      for (let a = 0; a < ATTEMPTS_PER_ITEM && !ok; a++) {
        const x = rect.x + EDGE + radius + rand() * (rect.w - 2 * (EDGE + radius));
        const y = rect.y + EDGE + radius + rand() * (rect.h - 2 * (EDGE + radius));
        const p = { x, y, r: radius };
        if (tooClose(p, radius, placed, gap)) continue;
        if (tooClose(p, radius, avoid, WALL_GAP)) continue;
        placed.push(p);
        out.push({ x, y, rot: (rand() * 2 - 1) * 0.6 });
        ok = true;
      }
      if (!ok) break;
    }
    if (out.length === n) return out;
  }
  // fallback: jittered grid — never skips (near-jar cells simply overlap, this
  // is a beach mess, not a crystal lattice), so it always yields exactly n
  // in-bounds positions and the `??` default in generateWorld never fires.
  const out: ScatterPos[] = [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * (rect.w / rect.h))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cw = rect.w / cols;
  const ch = rect.h / rows;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  for (let r = 0; r < rows && out.length < n; r++) {
    for (let c = 0; c < cols && out.length < n; c++) {
      const x = clamp(rect.x + (c + 0.5) * cw + (rand() - 0.5) * cw * 0.4, rect.x + EDGE + radius, rect.x + rect.w - EDGE - radius);
      const y = clamp(rect.y + (r + 0.5) * ch + (rand() - 0.5) * ch * 0.4, rect.y + EDGE + radius, rect.y + rect.h - EDGE - radius);
      out.push({ x, y, rot: (rand() * 2 - 1) * 0.6 });
    }
  }
  return out;
}

function shuffled<T>(rand: () => number, arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Build the whole tide. Pure: same seed + scale → same world. */
export function generateWorld(seed: number, scale: ScaleDef): World {
  const rand = mulberry32(seed ^ 0x5f37_59a9);
  const speciesCount = scale.gridCols * scale.gridRows;
  const species = shuffled(rand, SPECIES_POOL).slice(0, speciesCount);

  // shore: everything left of the cubby wall; wall band on the right edge
  const worldW = 60 + speciesCount * 9;
  const worldH = 46 + speciesCount * 3;
  const wallW = 16 + scale.gridCols * 2;
  const shore: Rect = { x: 0, y: 0, w: worldW - wallW, h: worldH };
  const wall: Rect = { x: worldW - wallW, y: 4, w: wallW, h: worldH - 8 };

  // jars, cubbies, critters
  const jars: JarDef[] = [];
  const critters: CritterDef[] = [];
  const cubbies: CubbyDef[] = [];
  species.forEach((sp, si) => {
    const col = si % scale.gridCols;
    const row = Math.floor(si / scale.gridCols);
    cubbies.push({ id: `cubby:${sp.id}`, species: sp.id, col, row });
    for (let tag = 1; tag <= scale.jarsPerSpecies; tag++) {
      const jarId = `${sp.id}#${tag}`;
      jars.push({ id: jarId, species: sp.id, tag, capacity: scale.jarCapacity });
      for (let k = 0; k < scale.jarCapacity; k++) {
        critters.push({ id: `c:${jarId}:${k}`, species: sp.id, jarId, golden: rand() < GOLDEN_RATE });
      }
    }
  });

  // scatter: jars first (mid band toward the wall), critters everywhere else
  const jarScatterList = scatterPoints(rand, jars.length, shore, JAR_R, GAP_JAR_JAR, []);
  const jarScatter: Record<string, ScatterPos> = {};
  jars.forEach((j, i) => { jarScatter[j.id] = jarScatterList[i]; });
  const avoid = Object.values(jarScatter).map((p) => ({ x: p.x, y: p.y, r: JAR_R }));
  const critterScatterList = scatterPoints(rand, critters.length, shore, CRITTER_R, GAP_CRIT_CRIT, avoid);
  const scatter: Record<string, ScatterPos> = {};
  critters.forEach((c, i) => {
    const p = critterScatterList[i] ?? { x: shore.x + EDGE + i * 0.7, y: shore.y + EDGE, rot: 0 };
    scatter[c.id] = p;
  });

  // decor: pebbles, shells, two lanterns framing the wall (all seeded)
  const pebbles = scatterPoints(rand, 26 + speciesCount * 3, shore, 0.5, 1.2, avoid)
    .map((p) => ({ x: p.x, y: p.y, r: 0.35 + rand() * 0.5, hue: 30 + rand() * 24 }));
  const shells = scatterPoints(rand, 10 + speciesCount, shore, 0.4, 1.6, avoid)
    .map((p) => ({ x: p.x, y: p.y, rot: p.rot, hue: rand() * 360 }));
  const lanterns = [
    { x: wall.x - 2.5, y: wall.y + 3 },
    { x: wall.x - 2.5, y: wall.y + wall.h - 3 },
  ];
  const decor: Decor = { pebbles, shells, lanterns };

  return { seed, scale, species, jars, critters, cubbies, scatter, jarScatter, shore, wall, decor };
}

/** Tide code ≙ `scale letter (d|e|u)` + seed in base36 — e.g. `e1k4x9`. */
export function tideCode(seed: number, scale: ScaleDef): string {
  return scale.id[0] + (seed >>> 0).toString(36);
}

/** Parse an untrusted tide code; anything malformed → a fresh random tide
 *  (mirrors parseSeedParam's trust boundary discipline). */
export function parseTideCode(raw: string | null | undefined): { seed: number; scale: ScaleDef } | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  const m = /^([deu])([0-9a-z]{1,7})$/.exec(s);
  if (!m) return null;
  const seed = parseInt(m[2], 36);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || Number.isNaN(seed)) return null;
  return { seed: seed >>> 0, scale: scaleById({ d: 'drift', e: 'ebb', u: 'undertow' }[m[1]] ?? 'drift') };
}

export function randomTide(): { seed: number; scale: ScaleDef } {
  const seed = (Math.random() * 0x100000000) >>> 0;
  const scale = SCALES[Math.floor(Math.random() * SCALES.length)];
  return { seed, scale };
}
