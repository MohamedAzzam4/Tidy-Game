/**
 * Tidy Tapes — world validation (pure; trust-boundary checks that gate every
 * generated seed and also run inside autotest).
 */
import {
  COMBO_COUNT, RACK_SLOTS, TAPE_H, TAPE_W, WORLD_H, WORLD_W, benchRect, rackRect,
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
    if (t.combo < 0 || t.combo >= COMBO_COUNT) issues.push(`tape ${t.id} combo out of range`);
    if (t.defect !== null && !DEFECT_TYPES.includes(t.defect)) {
      issues.push(`tape ${t.id} unsolvable defect type ${t.defect}`);
    }
    if (t.defect !== null && t.repaired) issues.push(`tape ${t.id} defect+repaired mismatch`);
    if (t.defect === null && !t.repaired) issues.push(`tape ${t.id} pristine but repaired=false`);
  }
  if (ids.size !== tapes.length) issues.push(`non-unique ids (${ids.size}/${tapes.length})`);

  // 2. rack coverage: one rack per combo, capacity correct
  if (world.racks.length !== COMBO_COUNT) issues.push(`racks=${world.racks.length} != ${COMBO_COUNT}`);
  const seenCombos = new Set<number>();
  for (const rack of world.racks) {
    if (seenCombos.has(rack.combo)) issues.push(`duplicate rack combo ${rack.combo}`);
    seenCombos.add(rack.combo);
    if (rack.slots.length !== RACK_SLOTS) issues.push(`rack ${rack.combo} slot count != ${RACK_SLOTS}`);
    for (const s of rack.slots) if (s !== null && !ids.has(s)) issues.push(`rack ${rack.combo} references unknown tape ${s}`);
  }
  for (let c = 0; c < COMBO_COUNT; c++) {
    if (!seenCombos.has(c)) issues.push(`no rack for combo ${c}`);
  }

  // 3. every tape has a reachable matching rack with enough slots for its whole group
  const demand = new Array(COMBO_COUNT).fill(0);
  for (const t of tapes) demand[t.combo] += 1;
  for (let c = 0; c < COMBO_COUNT; c++) {
    const capacity = (world.racks.find(r => r.combo === c)?.slots.length ?? 0);
    if (demand[c] > capacity) {
      issues.push(`combo ${c}: demand ${demand[c]} > capacity ${capacity} (not enough compatible slots)`);
    }
  }

  // 4. no inaccessible start: in bounds, not inside racks/bench, not fully covered
  const bench = benchRect();
  for (const t of tapes) {
    if (t.state !== 'loose') continue;
    if (t.x < 40 || t.x > WORLD_W - 40 || t.y < 40 || t.y > WORLD_H - 40) {
      issues.push(`tape ${t.id} starts out of bounds (${t.x.toFixed(0)},${t.y.toFixed(0)})`);
    }
    for (const rack of world.racks) {
      if (overlapsRect(t.x, t.y, rackRect(rack.combo), 2)) {
        issues.push(`tape ${t.id} starts inside rack ${rack.combo}`);
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

  return { ok: issues.length === 0, issues };
}
