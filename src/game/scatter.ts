/**
 * Seeded scatter + layout validators (CC-013). Pure module — no DOM.
 *
 * `scatter(seed, level)` draws the replayable mess: rejection sampling over
 * reachable floor space with footprint-aware spacing, a documented fallback
 * chain (relax spacing stepwise → jittered grid → the shipped hand-placed
 * default layout), and per-item small rotation (±21°, today's range).
 *
 * The validators are consumed by tests (CC-015): reachability is cell-based
 * (drags fly over furniture — no path search), and `hasValidArrangement`
 * solves slots-only through the model's own predicates — never a second,
 * drifting ruleset (C-12).
 */
import type { ItemDef, LevelDef } from './types';
import { FURNITURE_FOOTPRINTS, footprintAabb, itemFootprint } from '../level/footprints';
import { TidyingGame } from './model';

export interface ScatterPos {
  x: number;
  y: number;
  rotation: number;
}

/** Mulberry32 PRNG (A3): seed → deterministic sequence in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WALL_MARGIN = 0.3;
const FURNITURE_CLEARANCE = 0.5;
const ROTATION_DEG = 21;
const ATTEMPTS_PER_ITEM = 300;
/** Small-item class for the center-to-center shorthand (plan §8.7): mugs,
 *  books, shoes, towels (max footprint extent ≤ 0.36 — the towel); cushions
 *  are excluded — their 0.43 footprint is covered by the AABB rule. */
const SMALL_CLASS = new Set(['book', 'mug', 'shoe', 'towel']);

function furnitureAabbs(level: LevelDef): Array<{ id: string; minX: number; maxX: number; minY: number; maxY: number }> {
  const out: Array<{ id: string; minX: number; maxX: number; minY: number; maxY: number }> = [];
  for (const f of level.furniture) {
    if (f.flat) continue;
    const fp = FURNITURE_FOOTPRINTS[f.id];
    if (!fp) continue;
    out.push({ id: f.id, minX: f.anchor.x - fp.dx / 2, maxX: f.anchor.x + fp.dx / 2, minY: f.anchor.y - fp.dy / 2, maxY: f.anchor.y + fp.dy / 2 });
  }
  return out;
}

function gap(a: { minX: number; maxX: number; minY: number; maxY: number }, b: { minX: number; maxX: number; minY: number; maxY: number }): number {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
  const dy = Math.max(a.minY - b.maxY, b.minY - a.maxY, 0);
  return Math.hypot(dx, dy);
}

function overlapsWithMargin(
  a: { minX: number; maxX: number; minY: number; maxY: number },
  b: { minX: number; maxX: number; minY: number; maxY: number },
  margin: number,
): boolean {
  return a.minX < b.maxX + margin && b.minX < a.maxX + margin &&
         a.minY < b.maxY + margin && b.minY < a.maxY + margin;
}

interface ScatterCtx {
  level: LevelDef;
  furniture: ReturnType<typeof furnitureAabbs>;
  rand: () => number;
  c2c: number;
  aabbGap: number;
}

function samplePos(ctx: ScatterCtx, item: ItemDef, placed: ScatterPos[]): ScatterPos | null {
  const fp = itemFootprint(item.asset, 'flat');
  if (!fp) return { x: item.start.x, y: item.start.y, rotation: item.startRotation ?? 0 };
  const { level, rand } = ctx;
  const halfX = fp.dx / 2;
  const halfY = fp.dy / 2;
  const xLo = WALL_MARGIN + halfX;
  const xHi = level.room.width - WALL_MARGIN - halfX;
  const yLo = WALL_MARGIN + halfY;
  const yHi = level.room.depth - WALL_MARGIN - halfY;
  if (xHi <= xLo || yHi <= yLo) return null;
  for (let attempt = 0; attempt < ATTEMPTS_PER_ITEM; attempt++) {
    const x = xLo + rand() * (xHi - xLo);
    const y = yLo + rand() * (yHi - yLo);
    const rotation = (rand() * 2 - 1) * ROTATION_DEG;
    const box = footprintAabb(fp, x, y);
    // furniture clearance (rug/mat walkable — flat furniture has no AABB):
    // the pose AABB must sit ≥ 0.5 clear of every furniture footprint
    if (ctx.furniture.some((f) => gap(box, f) < FURNITURE_CLEARANCE)) continue;
    // pairwise: AABBs separated by the gap margin, plus the small-item
    // center-to-center shorthand
    let ok = true;
    for (let i = 0; i < placed.length; i++) {
      const other = ctx.level.items[i];
      const otherFp = itemFootprint(other.asset, 'flat');
      if (!otherFp) continue;
      const otherBox = footprintAabb(otherFp, placed[i].x, placed[i].y);
      if (overlapsWithMargin(box, otherBox, ctx.aabbGap)) { ok = false; break; }
      if (SMALL_CLASS.has(item.category) && SMALL_CLASS.has(other.category) &&
          Math.hypot(x - placed[i].x, y - placed[i].y) < ctx.c2c) { ok = false; break; }
    }
    if (!ok) continue;
    return { x, y, rotation };
  }
  return null;
}

function rejectionScatter(seed: number, level: LevelDef, c2c: number, aabbGap: number): ScatterPos[] | null {
  const ctx: ScatterCtx = { level, furniture: furnitureAabbs(level), rand: mulberry32(seed), c2c, aabbGap };
  const placed: ScatterPos[] = [];
  for (const item of level.items) {
    const p = samplePos(ctx, item, placed);
    if (!p) return null;
    placed.push(p);
  }
  return placed;
}

/** Jittered grid over walkable space (fallback 2). */
function jitteredGrid(seed: number, level: LevelDef): ScatterPos[] | null {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const furniture = furnitureAabbs(level);
  const cols = Math.ceil(Math.sqrt(level.items.length * (level.room.width / level.room.depth)));
  const rows = Math.ceil(level.items.length / cols);
  const cellW = (level.room.width - 2 * WALL_MARGIN) / cols;
  const cellH = (level.room.depth - 2 * WALL_MARGIN) / rows;
  const placed: ScatterPos[] = [];
  let i = 0;
  for (let r = 0; r < rows && i < level.items.length; r++) {
    for (let c = 0; c < cols && i < level.items.length; c++) {
      const item = level.items[i];
      const fp = itemFootprint(item.asset, 'flat');
      if (!fp) return null;
      let x = WALL_MARGIN + (c + 0.5) * cellW + (rand() - 0.5) * cellW * 0.4;
      let y = WALL_MARGIN + (r + 0.5) * cellH + (rand() - 0.5) * cellH * 0.4;
      x = Math.max(WALL_MARGIN + fp.dx / 2, Math.min(level.room.width - WALL_MARGIN - fp.dx / 2, x));
      y = Math.max(WALL_MARGIN + fp.dy / 2, Math.min(level.room.depth - WALL_MARGIN - fp.dy / 2, y));
      const box = footprintAabb(fp, x, y);
      if (furniture.some((f) => overlapsWithMargin(box, f, 0.05))) return null; // cell on furniture → give up to fallback 3
      placed.push({ x, y, rotation: (rand() * 2 - 1) * ROTATION_DEG });
      i++;
    }
  }
  return placed;
}

/**
 * The seeded layout: rejection sampling with stepwise-relaxed spacing, then a
 * jittered grid, then the shipped hand-placed default (item.start). Always
 * terminates in a valid layout for the shipped level (R3).
 */
export function scatter(seed: number, level: LevelDef): ScatterPos[] {
  for (const [c2c, aabbGap] of [[0.7, 0.2], [0.6, 0.15], [0.5, 0.1], [0.4, 0.05], [0.3, 0.01]] as const) {
    const result = rejectionScatter(seed, level, c2c, aabbGap);
    if (result) return result;
  }
  const grid = jitteredGrid(seed, level);
  if (grid) return grid;
  return level.items.map((i) => ({ x: i.start.x, y: i.start.y, rotation: i.startRotation ?? 0 }));
}

/**
 * Reachability, operationalized (plan §8.7): an item is reachable iff its
 * start cell (default 0.15 grid) lies outside every footprint (other items'
 * scattered footprints + furniture AABBs) — drags fly over furniture, so no
 * free-space path search is involved.
 */
export function isLayoutReachable(level: LevelDef, positions: Array<{ x: number; y: number }>, cell = 0.15): boolean {
  const furniture = furnitureAabbs(level);
  for (let i = 0; i < level.items.length; i++) {
    const item = level.items[i];
    const fp = itemFootprint(item.asset, 'flat');
    if (!fp) continue;
    const px = positions[i]?.x ?? item.start.x;
    const py = positions[i]?.y ?? item.start.y;
    // the item's own start cell
    const cellBox = {
      minX: Math.floor(px / cell) * cell,
      maxX: Math.floor(px / cell) * cell + cell,
      minY: Math.floor(py / cell) * cell,
      maxY: Math.floor(py / cell) * cell + cell,
    };
    for (const f of furniture) {
      if (overlapsWithMargin(cellBox, f, -0.001)) return false;
    }
    for (let j = 0; j < level.items.length; j++) {
      if (j === i) continue;
      const otherFp = itemFootprint(level.items[j].asset, 'flat');
      if (!otherFp) continue;
      const ox = positions[j]?.x ?? level.items[j].start.x;
      const oy = positions[j]?.y ?? level.items[j].start.y;
      if (overlapsWithMargin(cellBox, footprintAabb(otherFp, ox, oy), -0.001)) return false;
    }
  }
  return true;
}

/**
 * Completable-by-construction (C-12): a slots-only backtracking solver driven
 * ONLY by the model's own predicates (`pickUp`/`drop` slot rules + the §8.4
 * tier-clean rule via `isComplete`). Books are tried grouped per collection so
 * the first fit lands on the winning arrangement; exceedance of the declared
 * step budget reports `budget-exceeded`, never a silent pass.
 */
export function hasValidArrangement(
  level: LevelDef,
  positions: Array<{ x: number; y: number }>,
  budget = 20000,
): { ok: boolean; reason?: 'no-arrangement' | 'budget-exceeded' } {
  const game = new TidyingGame(level, 0);
  // move every item to the layout under test (floor restores bypass drop rules —
  // the layout's own validity is `scatter`'s + `isLayoutReachable`'s contract)
  game.items.forEach((item, i) => {
    if (!game.pickUp(item.id).ok) return;
    const p = positions[i] ?? item.start;
    game.returnToFloor(item.id, p.x, p.y, item.startRotation ?? 0);
  });

  // search order: books grouped per collection (tiers 1/2/3), then the rest
  const cols = level.collections ?? [];
  const books = level.items.filter((i) => i.category === 'book');
  const ordered: ItemDef[] = [];
  cols.forEach((c) => ordered.push(...books.filter((b) => b.collectionId === c.id)));
  ordered.push(...books.filter((b) => !b.collectionId));
  ordered.push(...level.items.filter((i) => i.category !== 'book'));

  let steps = 0;
  const slotIdsByCategory = (category: string) => {
    const out: string[] = [];
    for (const z of level.zones) if (z.category === category) for (const s of z.slots) out.push(s.id);
    return out;
  };

  const solve = (idx: number): boolean => {
    if (idx >= ordered.length) return game.isComplete();
    const item = ordered[idx];
    if (!game.pickUp(item.id).ok) return false;
    for (const slotId of slotIdsByCategory(item.category)) {
      steps++;
      if (steps > budget) return false;
      const res = game.drop(item.id, { type: 'slot', slotId });
      if (res.ok && solve(idx + 1)) return true;
      // undo and try the next slot
      if (game.locationOf(item.id)?.kind !== 'held') game.pickUp(item.id);
    }
    // this item has no workable slot — restore it and report failure upward
    game.returnToFloor(item.id, positions[level.items.indexOf(item)]?.x ?? item.start.x,
      positions[level.items.indexOf(item)]?.y ?? item.start.y, item.startRotation ?? 0);
    return false;
  };

  if (solve(0)) return { ok: true };
  return steps > budget ? { ok: false, reason: 'budget-exceeded' } : { ok: false, reason: 'no-arrangement' };
}

/** `?seed=` input contract (A3/C-19): untrusted input — a plain base-10
 *  integer in the uint32 range pins the seed; anything else (non-numeric,
 *  float, negative, out of range) → undefined = the default fresh seed. */
export function parseSeedParam(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  if (!/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 4294967295) return undefined;
  return n >>> 0;
}

/** Scatter-safety check used by tests: every scattered pose is a valid floor
 *  placement through the model's own predicate. The probe first moves every
 *  item to the layout under test, so overlap checks see the tested positions. */
export function isScatterSafe(level: LevelDef, positions: Array<{ x: number; y: number }>): boolean {
  const probe = new TidyingGame(level, 0);
  probe.items.forEach((item, i) => {
    if (!probe.pickUp(item.id).ok) return;
    const p = positions[i] ?? item.start;
    probe.returnToFloor(item.id, p.x, p.y, item.startRotation ?? 0);
  });
  return level.items.every((item, i) => {
    const p = positions[i] ?? item.start;
    return probe.validateSurfaceDrop(item.id, 'floor', p.x, p.y).ok;
  });
}
