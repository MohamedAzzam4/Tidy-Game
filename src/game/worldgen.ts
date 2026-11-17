/**
 * Tidy Tapes — deterministic world generation (pure; no Phaser).
 * Streams: layout (pile centers) / scatter (positions) / defects — forked so changes
 * in one stream never reshuffle another. Every placement loop is capped.
 */
import { Rng } from './rng';
import {
  BENCH, COMBO_COUNT, DEFECT_RATE, RACK_COLS, RACK_GAP_X, RACK_GAP_Y, RACK_ORIGIN,
  RACK_ROWS, RACK_SLOTS, RACK_W, TAPE_BASE_PER_COMBO, TAPE_EXTRAS_MAX, TAPE_EXTRAS_MIN,
  TAPE_H, TAPE_W, WORLD_H, WORLD_W, rackPos, rackRect, benchRect,
} from './config';
import type { DefectType, Rack, Tape, WorldData } from './types';

const DEFECT_TYPES: DefectType[] = ['rewind', 'sticker', 'paint'];

interface Zone { x0: number; y0: number; x1: number; y1: number; }

/** Fixed scatter zones (margins around the rack grid; corridors are too narrow
 *  once rack padding is respected). */
function scatterZones(): Zone[] {
  const zones: Zone[] = [];
  // top & bottom margins (clear of rack grid: y 560..2404, pad 46)
  zones.push({ x0: 400, y0: 160, x1: 4000, y1: 470 });
  zones.push({ x0: 400, y0: 2470, x1: 4000, y1: 2880 });
  // left margin split around the bench zone; right margin
  zones.push({ x0: 120, y0: 560, x1: 540, y1: 1100 });
  zones.push({ x0: 120, y0: 1900, x1: 540, y1: 2400 });
  zones.push({ x0: 3860, y0: 560, x1: 4280, y1: 2400 });
  return zones;
}

const PILES_PER_ZONE = [4, 4, 2, 2, 3]; // must match scatterZones() order

function inRect(x: number, y: number, r: { x: number; y: number; w: number; h: number }, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

/** Push a point out of a rect (to the nearest edge, biased downward for racks). */
function pushOutOfRect(
  p: { x: number; y: number },
  r: { x: number; y: number; w: number; h: number },
  pad: number,
): { x: number; y: number } {
  const cx = Math.max(r.x - pad, Math.min(r.x + r.w + pad, p.x));
  const cy = Math.max(r.y - pad, Math.min(r.y + r.h + pad, p.y));
  const dl = p.x - (r.x - pad);
  const dr = (r.x + r.w + pad) - p.x;
  const dt = p.y - (r.y - pad);
  const db = (r.y + r.h + pad) - p.y;
  const m = Math.min(dl, dr, dt, db);
  if (db === m) return { x: p.x, y: r.y + r.h + pad + 14 };           // below (preferred)
  if (dt === m) return { x: p.x, y: r.y - pad - 14 };                  // above
  if (dl === m) return { x: r.x - pad - 14, y: p.y };                  // left
  return { x: r.x + r.w + pad + 14, y: p.y };                          // right
}

export function generateWorld(seed: number): WorldData {
  const rng = new Rng(seed);
  const layout = rng.fork('layout');
  const scatter = rng.fork('scatter');
  const defectRng = rng.fork('defects');

  // --- combo demand: base 6 per combo + extras spread on distinct combos ---
  const extras = TAPE_EXTRAS_MIN + layout.int(TAPE_EXTRAS_MAX - TAPE_EXTRAS_MIN + 1);
  const total = COMBO_COUNT * TAPE_BASE_PER_COMBO + extras; // 406..414
  const counts = new Array(COMBO_COUNT).fill(TAPE_BASE_PER_COMBO);
  const idx = layout.shuffle([...Array(COMBO_COUNT).keys()]);
  for (let i = 0; i < extras; i++) counts[idx[i]] += 1; // max 7 <= capacity 8

  // --- tapes ---
  const tapes: Tape[] = [];
  let id = 0;
  const comboOrder = [...Array(COMBO_COUNT).keys()];
  for (const combo of comboOrder) {
    for (let n = 0; n < counts[combo]; n++) {
      tapes.push({
        id: id++, combo, defect: null, repaired: true, state: 'loose',
        x: 0, y: 0, rot: 0, slot: null,
      });
    }
  }
  // shuffle so tape ids don't line up with combo order (scatter mixes the table)
  scatter.shuffle(tapes);

  // --- defects: ~11%, exactly one each, all three types guaranteed present ---
  const defectCount = Math.max(18, Math.round(total * DEFECT_RATE));
  const defectIds = scatter.shuffle([...Array(total).keys()]).slice(0, defectCount);
  const typeOrder = defectRng.shuffle([...DEFECT_TYPES]);
  defectIds.forEach((tid, i) => {
    tapes[tid].defect = typeOrder[i % 3];
    tapes[tid].repaired = false;
  });

  // --- rack grid (fixed geometry, one rack per combo) ---
  const racks: Rack[] = [];
  for (let row = 0; row < RACK_ROWS; row++) {
    for (let col = 0; col < RACK_COLS; col++) {
      const combo = row * RACK_COLS + col;
      racks.push({ combo, slots: new Array(RACK_SLOTS).fill(null) });
    }
  }

  // --- pile centers: several per zone, deterministic ---
  const zones = scatterZones();
  const pileCenters: { x: number; y: number; zone: number }[] = [];
  for (let zi = 0; zi < zones.length; zi++) {
    const z = zones[zi];
    const n = PILES_PER_ZONE[zi] ?? 2;
    for (let i = 0; i < n; i++) {
      const cx = layout.range(z.x0, z.x1);
      const cy = layout.range(z.y0, z.y1);
      pileCenters.push({ x: cx, y: cy, zone: pileCenters.length });
    }
  }

  // --- assign tapes to piles round-robin (shuffled), jittered positions ---
  const pileOrder = scatter.shuffle([...Array(pileCenters.length).keys()]);
  const bench = benchRect();
  const placed: { x: number; y: number }[] = [];
  for (let i = 0; i < tapes.length; i++) {
    const pile = pileCenters[pileOrder[i % pileOrder.length]];
    let x = pile.x + scatter.jitter(150);
    let y = pile.y + scatter.jitter(110);
    // keep inside world margins
    x = Math.max(70, Math.min(WORLD_W - 70, x));
    y = Math.max(90, Math.min(WORLD_H - 70, y));
    placed.push({ x, y });
  }

  // --- placement with obstacles ---
  // Rule: a tape center must stay in bounds, outside every rack rect (+pad) and
  // outside the bench rect (+pad). Separation (anti-coverage) never moves a tape
  // into a forbidden position; forbidden positions get pushed out inside the loop.
  const MARGIN = 46; // > tape bounding radius (~32) so the validator's check clears
  const badPos = (x: number, y: number): boolean => {
    if (x < 70 || x > WORLD_W - 70 || y < 90 || y > WORLD_H - 70) return true;
    for (const rack of racks) {
      const rr = rackRect(rack.combo);
      if (inRect(x, y, rr, MARGIN)) return true;
    }
    if (inRect(x, y, bench, MARGIN)) return true;
    return false;
  };
  const COV_X = TAPE_W * 0.55 + 2; // ~52.6
  const COV_Y = TAPE_H * 0.55 + 2; // ~35
  const cellOf = (x: number, y: number) => ((x / 128) | 0) * 8192 + ((y / 128) | 0);

  // initial sweep: push any forbidden start out (below the rack, else nearest side)
  for (let i = 0; i < placed.length; i++) {
    let p = placed[i];
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!badPos(p.x, p.y)) break;
      let moved = false;
      for (const rack of racks) {
        const rr = rackRect(rack.combo);
        if (inRect(p.x, p.y, rr, MARGIN)) { p = pushOutOfRect(p, rr, MARGIN); moved = true; }
      }
      if (inRect(p.x, p.y, bench, MARGIN)) { p = pushOutOfRect(p, bench, MARGIN); moved = true; }
      if (!moved) break;
    }
    placed[i] = p;
  }

  // separation passes with obstacle-aware moves
  for (let pass = 0; pass < 14; pass++) {
    const grid = new Map<number, number[]>();
    placed.forEach((p, i) => {
      const key = cellOf(p.x, p.y);
      const list = grid.get(key) ?? [];
      list.push(i);
      grid.set(key, list);
    });
    for (let i = 0; i < placed.length; i++) {
      const cell = cellOf(placed[i].x, placed[i].y);
      for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) {
        const list = grid.get(cell + gx * 8192 + gy);
        if (!list) continue;
        for (const j of list) {
          if (j <= i) continue;
          const dx = placed[j].x - placed[i].x;
          const dy = placed[j].y - placed[i].y;
          if (Math.abs(dx) >= COV_X || Math.abs(dy) >= COV_Y) continue;
          const px = (COV_X - Math.abs(dx)) / 2 + 1;
          const py = (COV_Y - Math.abs(dy)) / 2 + 1;
          let mix: number, miy: number, mjx: number, mjy: number;
          if (px < py) {
            const dir = dx >= 0 ? 1 : -1;
            mix = placed[i].x - dir * px; miy = placed[i].y;
            mjx = placed[j].x + dir * px; mjy = placed[j].y;
          } else {
            const dir = dy >= 0 ? 1 : -1;
            mix = placed[i].x; miy = placed[i].y - dir * py;
            mjx = placed[j].x; mjy = placed[j].y + dir * py;
          }
          if (!badPos(mix, miy)) { placed[i].x = mix; placed[i].y = miy; }
          if (!badPos(mjx, mjy)) { placed[j].x = mjx; placed[j].y = mjy; }
        }
      }
    }
  }

  // --- deterministic spiral repair: every tape must end conflict-free ---
  // (separation alone can leave dense pockets; this pass guarantees the invariant)
  const conflictAt = (x: number, y: number, ignore: number, grid: Map<number, number[]>): boolean => {
    const cell = cellOf(x, y);
    for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) {
      const list = grid.get(cell + gx * 8192 + gy);
      if (!list) continue;
      for (const j of list) {
        if (j === ignore) continue;
        if (Math.abs(placed[j].x - x) < COV_X && Math.abs(placed[j].y - y) < COV_Y) return true;
      }
    }
    return false;
  };
  for (let round = 0; round < 3; round++) {
    const grid = new Map<number, number[]>();
    const addToGrid = (i: number) => {
      const key = cellOf(placed[i].x, placed[i].y);
      const list = grid.get(key) ?? [];
      list.push(i);
      grid.set(key, list);
    };
    const removeFromGrid = (i: number) => {
      const key = cellOf(placed[i].x, placed[i].y);
      const list = grid.get(key);
      if (!list) return;
      const at = list.indexOf(i);
      if (at >= 0) list.splice(at, 1);
    };
    placed.forEach((_, i) => addToGrid(i));
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i];
      if (!badPos(p.x, p.y) && !conflictAt(p.x, p.y, i, grid)) continue;
      let fixed = false;
      for (let r = 40; r <= 680 && !fixed; r += 40) {
        for (let a = 0; a < 12 && !fixed; a++) {
          const ang = (a / 12) * Math.PI * 2 + (i % 7) * 0.13; // deterministic phase
          const cx = p.x + Math.cos(ang) * r;
          const cy = p.y + Math.sin(ang) * r;
          if (badPos(cx, cy)) continue;
          if (conflictAt(cx, cy, i, grid)) continue;
          removeFromGrid(i);
          placed[i] = { x: cx, y: cy };
          addToGrid(i);
          fixed = true;
        }
      }
    }
  }

  for (let i = 0; i < tapes.length; i++) {
    tapes[i].x = Math.round(placed[i].x * 10) / 10;
    tapes[i].y = Math.round(placed[i].y * 10) / 10;
    tapes[i].rot = Math.round(scatter.jitter(0.22) * 100) / 100;
  }

  return {
    seed,
    worldW: WORLD_W,
    worldH: WORLD_H,
    totalTapes: total,
    tapes,
    racks,
  };
}

/** Rack lookup by combo — trivial but keeps call sites honest. */
export function rackForCombo(world: WorldData, combo: number): Rack {
  return world.racks[combo]; // racks are stored in combo order
}

export { rackPos };
