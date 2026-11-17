/**
 * Tidy Tapes — deterministic world generation v2 (pure; no Phaser).
 * Streams: counts / layout (pile centers) / scatter (positions) / defects — forked
 * so changes in one stream never reshuffle another. Every placement loop is capped.
 *
 * Groups: 32 (8 colors × 4 symbols). Each group's tape count derives from the
 * combined capacity of its two matching rows (16 slots) via a seeded fill
 * fraction, then a top-up pass guarantees ≥ TOTAL_MIN tapes overall. The two
 * rows of a group live in different units/banks; neither row is preferred.
 */
import { Rng } from './rng';
import {
  CENTER, CENTER_MIN_TAPES, DEFECT_RATE, GROUPS, GROUP_CAPACITY,
  GROUP_FILL_MAX, GROUP_FILL_MIN, ROWS, ROWS_PER_GROUP, SLOTS_PER_ROW, TOTAL_MIN,
  UNIT_H, UNIT_W, UNITS, WORLD_H, WORLD_W, groupOfRow, rowsOfGroup, unitRect, benchRect,
} from './config';
import type { DefectType, Row, Tape, WorldData } from './types';

const DEFECT_TYPES: DefectType[] = ['rewind', 'sticker', 'paint'];

interface Zone { x0: number; y0: number; x1: number; y1: number }

/**
 * Scatter zones cover ALL usable regions — the center first, then the corridors
 * beside racks and the front band. Pile centers are placed on a jittered GRID
 * over each zone (even coverage; the middle can never go empty), and ~28% of
 * tapes are strays scattered individually. Obstacle rects (banks/bench) are
 * excluded by the placement passes below, so zones may not intersect them.
 */
function scatterZones(): Zone[] {
  return [
    // center band (emphasis: most cells)
    { x0: 560, y0: 560, x1: 2380, y1: 1490 },
    // corridor between left bank and the center
    { x0: 396, y0: 620, x1: 552, y1: 1480 },
    // front band (below the center, above the bottom edge; bench sits left)
    { x0: 560, y0: 1500, x1: 2680, y1: 1730 },
    // strip right of the right bank
    { x0: 2668, y0: 620, x1: 2740, y1: 1460 },
    // NOTE: no top-margin zone — tapes clamped to the world's y=90 floor there
    // get trapped in the back bank's clearance pad (deadlock found in seed 169).
  ];
}

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
  if (db === m) return { x: p.x, y: r.y + r.h + pad + 14 };
  if (dt === m) return { x: p.x, y: r.y - pad - 14 };
  if (dl === m) return { x: r.x - pad - 14, y: p.y };
  return { x: r.x + r.w + pad + 14, y: p.y };
}

export function generateWorld(seed: number): WorldData {
  const rng = new Rng(seed);
  const counts = rng.fork('counts');
  const layout = rng.fork('layout');
  const scatter = rng.fork('scatter');
  const defectRng = rng.fork('defects');

  // --- rows (fixed geometry, labeled; rows 4u..4u+3 belong to unit u) ---
  const rows: Row[] = [];
  for (let r = 0; r < ROWS; r++) {
    rows.push({
      id: r,
      group: groupOfRow(r),
      unit: Math.floor(r / 4),
      slots: new Array(SLOTS_PER_ROW).fill(null),
    });
  }
  // sanity: every group's two rows live in different units
  for (let g = 0; g < GROUPS; g++) {
    const [a, b] = rowsOfGroup(g);
    if (Math.floor(a / 4) === Math.floor(b / 4)) throw new Error(`group ${g} rows share a unit`);
  }

  // --- tapes per group: derived from combined capacity of its matching rows ---
  const groupCounts = new Array(GROUPS).fill(0).map(() => {
    const fill = GROUP_FILL_MIN + counts.next() * (GROUP_FILL_MAX - GROUP_FILL_MIN);
    return Math.min(GROUP_CAPACITY, Math.max(1, Math.round(GROUP_CAPACITY * fill)));
  });
  let total = groupCounts.reduce((s, n) => s + n, 0);
  // top-up (seeded round-robin) until the board holds at least TOTAL_MIN tapes
  const order = counts.shuffle([...Array(GROUPS).keys()]);
  let oi = 0;
  while (total < TOTAL_MIN) {
    const g = order[oi % order.length];
    oi++;
    if (groupCounts[g] < GROUP_CAPACITY) { groupCounts[g]++; total++; }
    else if (order.every(x => groupCounts[x] >= GROUP_CAPACITY)) break;
  }

  const tapes: Tape[] = [];
  let id = 0;
  for (let g = 0; g < GROUPS; g++) {
    for (let n = 0; n < groupCounts[g]; n++) {
      tapes.push({
        id: id++, combo: g, defect: null, repaired: true, state: 'loose',
        x: 0, y: 0, rot: 0, row: null, slot: null,
      });
    }
  }
  // shuffle so ids don't line up with group order (scatter mixes the table)
  scatter.shuffle(tapes);

  // --- defects: ~11%, exactly one each, all three types present ---
  const defectCount = Math.max(18, Math.round(total * DEFECT_RATE));
  const defectIds = scatter.shuffle([...Array(total).keys()]).slice(0, defectCount);
  const typeOrder = defectRng.shuffle([...DEFECT_TYPES]);
  defectIds.forEach((tid, i) => {
    tapes[tid].defect = typeOrder[i % 3];
    tapes[tid].repaired = false;
  });

  // --- pile centers on a jittered grid over every usable region ---
  const zones = scatterZones();
  const pileCenters: { x: number; y: number }[] = [];
  const zoneArea: number[] = [];
  for (const z of zones) {
    const cols = Math.max(1, Math.round((z.x1 - z.x0) / 300));
    const rowsN = Math.max(1, Math.round((z.y1 - z.y0) / 260));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rowsN; r++) {
        pileCenters.push({
          x: z.x0 + (c + 0.5) * (z.x1 - z.x0) / cols + layout.jitter(60),
          y: z.y0 + (r + 0.5) * (z.y1 - z.y0) / rowsN + layout.jitter(45),
        });
      }
    }
    zoneArea.push((z.x1 - z.x0) * (z.y1 - z.y0));
  }
  const totalArea = zoneArea.reduce((s, a) => s + a, 0);

  // --- ~28% strays (individual tapes) + cluster assignment round-robin ---
  const strayCount = Math.floor(tapes.length * 0.28);
  const strayIdx = new Set(scatter.shuffle([...Array(tapes.length).keys()]).slice(0, strayCount));
  const pickStrayZone = (): Zone => {
    const roll = layout.next() * totalArea;
    let acc = 0;
    for (let zi = 0; zi < zones.length; zi++) {
      acc += zoneArea[zi];
      if (roll <= acc) return zones[zi];
    }
    return zones[0];
  };
  const pileOrder = scatter.shuffle([...Array(pileCenters.length).keys()]);
  const bench = benchRect();
  const placed: { x: number; y: number }[] = [];
  for (let i = 0; i < tapes.length; i++) {
    let x: number;
    let y: number;
    if (strayIdx.has(i)) {
      const z = pickStrayZone();
      x = layout.range(z.x0, z.x1);
      y = layout.range(z.y0, z.y1);
    } else {
      const pile = pileCenters[pileOrder[i % pileCenters.length]];
      x = pile.x + scatter.jitter(115);
      y = pile.y + scatter.jitter(85);
    }
    x = Math.max(70, Math.min(WORLD_W - 70, x));
    y = Math.max(90, Math.min(WORLD_H - 70, y));
    placed.push({ x, y });
  }

  // --- placement with obstacles (units + bench) ---
  const MARGIN = 40; // > tape bounding radius (~32): clearance around rack openings
  const badPos = (x: number, y: number): boolean => {
    if (x < 70 || x > WORLD_W - 70 || y < 90 || y > WORLD_H - 70) return true;
    for (let u = 0; u < UNITS; u++) {
      if (inRect(x, y, unitRect(u), MARGIN)) return true;
    }
    if (inRect(x, y, bench, MARGIN)) return true;
    return false;
  };
  const COV_X = 92 * 0.55 + 2; // ~52.6 (light overlap allowed)
  const COV_Y = 60 * 0.55 + 2; // ~35
  const cellOf = (x: number, y: number) => ((x / 128) | 0) * 8192 + ((y / 128) | 0);

  // initial sweep: push any forbidden start out (below the unit, else nearest side)
  for (let i = 0; i < placed.length; i++) {
    let p = placed[i];
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!badPos(p.x, p.y)) break;
      let moved = false;
      for (let u = 0; u < UNITS; u++) {
        const ur = unitRect(u);
        if (inRect(p.x, p.y, ur, MARGIN)) { p = pushOutOfRect(p, ur, MARGIN); moved = true; }
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
      for (let r = 40; r <= 640 && !fixed; r += 40) {
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
    tapes[i].rot = Math.round(scatter.jitter(0.12) * 100) / 100;
  }

  return {
    seed,
    worldW: WORLD_W,
    worldH: WORLD_H,
    totalTapes: total,
    tapes,
    rows,
  };
}

/** Rows that accept a group (two matching rows, either equally valid). */
export function rowsForGroup(world: WorldData, group: number): Row[] {
  return rowsOfGroup(group).map(r => world.rows[r]);
}

export { groupOfRow, rowsOfGroup, CENTER, CENTER_MIN_TAPES, UNIT_W, UNIT_H, ROWS_PER_GROUP };
