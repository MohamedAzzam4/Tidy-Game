/**
 * Tidy Tapes — world validation v2 (pure; trust-boundary checks that gate every
 * generated seed and also run inside autotest).
 *
 * v2 additions: two matching rows per group in different units, group counts
 * derived from (and bounded by) combined row capacity, and a center-population
 * check so the board never starts with an empty middle.
 */
import {
  CENTER, CENTER_MIN_TAPES, GROUPS, GROUP_CAPACITY, ROWS, ROWS_PER_GROUP, SLOTS_PER_ROW,
  TAPE_H, TAPE_W, UNITS, WORLD_H, WORLD_W, benchRect, rowsOfGroup, unitRect,
} from './config';
import type { DefectType, WorldData } from './types';

export interface ValidationResult {
  ok: boolean;
  issues: string[];
}

const DEFECT_TYPES: DefectType[] = ['rewind', 'sticker', 'paint'];

function overlapsRect(
  x: number, y: number, r: { x: number; y: number; w: number; h: number }, pad: number,
): boolean {
  // tape bounding circle vs rect (conservative)
  const radius = Math.min(TAPE_W, TAPE_H) / 2 + pad;
  const nx = Math.max(r.x, Math.min(r.x + r.w, x));
  const ny = Math.max(r.y, Math.min(r.y + r.h, y));
  const dx = x - nx; const dy = y - ny;
  return dx * dx + dy * dy < radius * radius;
}

export function validateWorld(world: WorldData): ValidationResult {
  const issues: string[] = [];
  const tapes = world.tapes;

  // 1. size & identity
  if (world.totalTapes < 400) issues.push(`totalTapes=${world.totalTapes} < 400`);
  if (tapes.length !== world.totalTapes) issues.push(`tapes.length=${tapes.length} != totalTapes`);
  const ids = new Set<number>();
  for (const t of tapes) {
    if (ids.has(t.id)) issues.push(`duplicate tape id ${t.id}`);
    ids.add(t.id);
    if (t.combo < 0 || t.combo >= GROUPS) issues.push(`tape ${t.id} group out of range`);
    if (t.defect !== null && !DEFECT_TYPES.includes(t.defect)) {
      issues.push(`tape ${t.id} unsolvable defect type ${t.defect}`);
    }
    if (t.defect !== null && t.repaired) issues.push(`tape ${t.id} defect+repaired mismatch`);
    if (t.defect === null && !t.repaired) issues.push(`tape ${t.id} pristine but repaired=false`);
  }
  if (ids.size !== tapes.length) issues.push(`non-unique ids (${ids.size}/${tapes.length})`);

  // 2. rows: 64 labeled rows, 4 per unit, one slot array each
  if (world.rows.length !== ROWS) issues.push(`rows=${world.rows.length} != ${ROWS}`);
  for (const row of world.rows) {
    if (row.slots.length !== SLOTS_PER_ROW) issues.push(`row ${row.id} slot count != ${SLOTS_PER_ROW}`);
    for (const s of row.slots) if (s !== null && !ids.has(s)) issues.push(`row ${row.id} references unknown tape ${s}`);
    const expectedUnit = Math.floor(row.id / 4);
    if (row.unit !== expectedUnit) issues.push(`row ${row.id} unit mismatch`);
  }
  // 3. every group has TWO matching rows in DIFFERENT units; demand ≤ capacity
  const demand = new Array(GROUPS).fill(0);
  for (const t of tapes) demand[t.combo] += 1;
  for (let g = 0; g < GROUPS; g++) {
    const [a, b] = rowsOfGroup(g);
    if (Math.floor(a / 4) === Math.floor(b / 4)) issues.push(`group ${g}: both rows in one unit`);
    if (demand[g] > GROUP_CAPACITY) {
      issues.push(`group ${g}: demand ${demand[g]} > capacity ${GROUP_CAPACITY}`);
    }
    if (demand[g] < 1) issues.push(`group ${g}: no tapes generated`);
  }
  if (demand.reduce((s, n) => s + n, 0) !== tapes.length) issues.push('demand does not balance');

  // 4. no inaccessible start: in bounds, not inside units/bench, not fully covered
  const bench = benchRect();
  for (const t of tapes) {
    if (t.state !== 'loose') continue;
    if (t.x < 40 || t.x > WORLD_W - 40 || t.y < 40 || t.y > WORLD_H - 40) {
      issues.push(`tape ${t.id} starts out of bounds (${t.x.toFixed(0)},${t.y.toFixed(0)})`);
    }
    for (let u = 0; u < UNITS; u++) {
      if (overlapsRect(t.x, t.y, unitRect(u), 2)) {
        issues.push(`tape ${t.id} starts inside unit ${u}`);
        break;
      }
    }
    if (overlapsRect(t.x, t.y, bench, 2)) issues.push(`tape ${t.id} starts inside bench zone`);
  }
  // full-coverage check (another tape's footprint fully covers this one)
  const grid = new Map<number, number[]>(); // coarse 64px cells -> tape indices
  tapes.forEach((t, i) => {
    const key = ((t.x / 64) | 0) * 4096 + ((t.y / 64) | 0);
    const list = grid.get(key) ?? [];
    list.push(i);
    grid.set(key, list);
  });
  tapes.forEach((t, i) => {
    const cell = ((t.x / 64) | 0) * 4096 + ((t.y / 64) | 0);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const list = grid.get(cell + dx * 4096 + dy);
      if (!list) continue;
      for (const j of list) {
        if (j === i) continue;
        const o = tapes[j];
        if (Math.abs(o.x - t.x) < TAPE_W * 0.55 && Math.abs(o.y - t.y) < TAPE_H * 0.55) {
          issues.push(`tape ${t.id} fully covered by tape ${o.id}`);
          return;
        }
      }
    }
  });

  // 5. center stays populated (no empty-middle boards, any seed)
  const centerCount = tapes.filter(t =>
    t.state === 'loose' && t.x >= CENTER.x && t.x <= CENTER.x + CENTER.w
    && t.y >= CENTER.y && t.y <= CENTER.y + CENTER.h,
  ).length;
  if (centerCount < CENTER_MIN_TAPES) {
    issues.push(`center populated too thinly (${centerCount} < ${CENTER_MIN_TAPES})`);
  }

  return { ok: issues.length === 0, issues };
}

/** True when every seated tape's group matches its row label (win condition). */
export function boardCorrect(world: WorldData): boolean {
  for (const t of world.tapes) {
    if (t.state !== 'shelved') continue;
    const row = world.rows[t.row as number];
    if (!row || row.group !== t.combo) return false;
  }
  return true;
}

/** Misfiled tapes (seated in a row whose label is a different group). */
export function misfiledTapes(world: WorldData): number[] {
  const out: number[] = [];
  for (const t of world.tapes) {
    if (t.state !== 'shelved') continue;
    const row = world.rows[t.row as number];
    if (!row || row.group !== t.combo) out.push(t.id);
  }
  return out;
}

export { ROWS_PER_GROUP };
