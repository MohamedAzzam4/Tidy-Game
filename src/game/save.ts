/**
 * Tidy Tapes — save/load v2. localStorage is untrusted input: every field is guarded.
 * Pure functions + a tiny storage adapter (browser-only guard).
 *
 * Layout version 2 (32 groups / 64 rows / tray). v1 saves are never silently
 * migrated: the game offers an explicit choice instead (see GameScene + UIScene).
 */
import { GROUPS, ROWS, SAVE_KEY, SLOTS_PER_ROW, TRAY_SLOTS } from './config';
import type { DefectType, SaveFile, Tape, WorldData } from './types';
import { generateWorld } from './worldgen';
import { validateWorld } from './validation';

const DEFECT_TYPES: DefectType[] = ['rewind', 'sticker', 'paint'];
const SKILL_IDS = ['scanner', 'guide', 'misplaced', 'marquee', 'matchScan', 'matchGather'];
const POWER_IDS = ['misplaced', 'matchScan', 'matchGather'];

export interface SkillsSave { unlocked: Record<string, boolean> }
export interface PowersSave { [power: string]: { unlocked: boolean; activeUntil: number; cooldownUntil: number } }

export function serializeRun(
  world: WorldData,
  skills: Record<string, boolean>,
  powers: Record<string, { unlocked: boolean; activeUntil: number; cooldownUntil: number }>,
  playSeconds: number,
  trayTapes: (number | null)[],
): SaveFile {
  return {
    version: 2,
    seed: world.seed,
    savedAt: Date.now(),
    tapes: world.tapes.map(t => ({
      id: t.id, combo: t.combo, defect: t.defect, repaired: t.repaired,
      state: t.state, x: t.x, y: t.y, rot: t.rot, row: t.row, slot: t.slot,
    })),
    tray: trayTapes.slice(0, TRAY_SLOTS).map(v => (typeof v === 'number' ? v : null)),
    skills: Object.fromEntries(SKILL_IDS.map(k => [k, !!skills[k]])),
    powers: Object.fromEntries(POWER_IDS.map(k => [
      k, {
        unlocked: !!(powers[k] && powers[k].unlocked),
        activeUntil: 0,
        cooldownUntil: powers[k] ? (powers[k].cooldownUntil | 0) : 0,
      },
    ])),
    playSeconds: Math.max(0, playSeconds | 0),
  };
}

/** Parse + validate a v2 save payload. Returns null when untrustworthy. */
export function deserializeRun(raw: unknown): SaveFile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const f = raw as Record<string, unknown>;
  if (f.version !== 2) return null;
  const seed = typeof f.seed === 'number' && Number.isFinite(f.seed) ? f.seed : null;
  if (seed === null) return null;
  if (!Array.isArray(f.tapes) || f.tapes.length < 400) return null;

  // Regenerate the world from the seed, then re-apply saved runtime state.
  // The seed is the source of structure; only mutable fields are trusted.
  const world = generateWorld(seed);
  const byId = new Map<number, Tape>();
  for (const t of world.tapes) byId.set(t.id, t);

  let ok = true;
  const seen = new Set<number>();
  for (const s of f.tapes as Array<Record<string, unknown>>) {
    if (typeof s !== 'object' || s === null) { ok = false; break; }
    const id = s.id; const combo = s.combo; const state = s.state;
    if (typeof id !== 'number' || !Number.isInteger(id) || seen.has(id)) { ok = false; break; }
    seen.add(id);
    const tape = byId.get(id);
    if (!tape) { ok = false; break; }
    if (combo !== tape.combo) { ok = false; break; }
    if (state !== 'loose' && state !== 'shelved' && state !== 'tray') { ok = false; break; }
    const defect = s.defect;
    if (defect !== null && !DEFECT_TYPES.includes(defect as DefectType)) { ok = false; break; }
    if (defect !== tape.defect) { ok = false; break; }
    const repaired = s.repaired;
    if (typeof repaired !== 'boolean') { ok = false; break; }
    const x = s.x; const y = s.y; const rot = s.rot;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) { ok = false; break; }
    if (state === 'loose' && (x < 20 || x > world.worldW - 20 || y < 20 || y > world.worldH - 20)) { ok = false; break; }
    const row = s.row;
    const slot = s.slot;
    if (state === 'shelved') {
      if (typeof row !== 'number' || !Number.isInteger(row) || row < 0 || row >= ROWS) { ok = false; break; }
      if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= SLOTS_PER_ROW) { ok = false; break; }
    } else if (row !== null) { ok = false; break; }
    tape.repaired = repaired;
    tape.state = state;
    tape.x = x; tape.y = y;
    tape.rot = typeof rot === 'number' && Number.isFinite(rot) ? rot : 0;
    tape.row = state === 'shelved' ? (row as number) : null;
    tape.slot = state === 'shelved' ? (slot as number) : null;
  }
  if (!ok) return null;
  if (seen.size !== world.tapes.length) return null;

  // Rebuild row occupancy from shelved tapes; reject slot collisions.
  for (const r of world.rows) r.slots.fill(null);
  for (const t of world.tapes) {
    if (t.state === 'shelved') {
      const r = world.rows[t.row as number];
      if (r.slots[t.slot as number] !== null) return null; // duplicate slot use
      r.slots[t.slot as number] = t.id;
    }
  }

  // Tray: ordered ids, valid tape ids, no duplicates vs shelved, no repeats.
  const trayRaw = Array.isArray(f.tray) ? f.tray.slice(0, TRAY_SLOTS) : [];
  const tray: (number | null)[] = [];
  const traySeen = new Set<number>();
  for (const v of trayRaw) {
    if (v === null || v === undefined) { tray.push(null); continue; }
    if (typeof v !== 'number' || !byId.has(v) || traySeen.has(v)) { ok = false; break; }
    if (byId.get(v)?.state !== 'tray') { ok = false; break; } // save tapes must declare tray state
    traySeen.add(v);
    tray.push(v);
  }
  while (tray.length < TRAY_SLOTS) tray.push(null);
  if (!ok) return null;

  const skills: Record<string, boolean> = {};
  for (const k of SKILL_IDS) skills[k] = !!(f.skills && (f.skills as Record<string, unknown>)[k] === true);

  const powers: Record<string, { unlocked: boolean; activeUntil: number; cooldownUntil: number }> = {};
  if (f.powers && typeof f.powers === 'object') {
    for (const k of POWER_IDS) {
      const p = (f.powers as Record<string, unknown>)[k];
      if (p && typeof p === 'object') {
        const o = p as Record<string, unknown>;
        powers[k] = {
          unlocked: o.unlocked === true,
          activeUntil: 0,
          cooldownUntil: typeof o.cooldownUntil === 'number' && Number.isFinite(o.cooldownUntil) ? o.cooldownUntil : 0,
        };
      }
    }
  }

  return {
    version: 2,
    seed,
    savedAt: typeof f.savedAt === 'number' ? f.savedAt : Date.now(),
    tapes: world.tapes.map(t => ({
      id: t.id, combo: t.combo, defect: t.defect, repaired: t.repaired,
      state: t.state, x: t.x, y: t.y, rot: t.rot, row: t.row, slot: t.slot,
    })),
    tray,
    skills,
    powers,
    playSeconds: typeof f.playSeconds === 'number' ? Math.max(0, f.playSeconds | 0) : 0,
  };
}

/** Apply a parsed save onto a freshly generated world (same seed). */
export function applySave(world: WorldData, save: SaveFile): void {
  if (save.seed !== world.seed) return;
  const byId = new Map<number, Tape>();
  for (const t of world.tapes) byId.set(t.id, t);
  for (const s of save.tapes) {
    const t = byId.get(s.id);
    if (!t) continue;
    t.repaired = s.repaired; t.state = s.state; t.x = s.x; t.y = s.y;
    t.rot = s.rot; t.row = s.row; t.slot = s.slot;
  }
  for (const r of world.rows) r.slots.fill(null);
  for (const t of world.tapes) {
    if (t.state === 'shelved') {
      const r = world.rows[t.row as number];
      r.slots[t.slot as number] = t.id;
    }
  }
}

// --- storage adapter (browser only) ---
export function storageAvailable(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem('__tidy_probe', '1');
    localStorage.removeItem('__tidy_probe');
    return true;
  } catch { return false; }
}

export function saveRun(data: SaveFile): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function loadRun(): SaveFile | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return deserializeRun(JSON.parse(raw));
  } catch { return null; }
}

export function clearRun(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

/** read a v1 save's skill unlocks (for the keep-skills migration option) */
export function readV1Skills(): Record<string, boolean> | null {
  try {
    const raw = localStorage.getItem('tidy-tapes-save-v1');
    if (!raw) return null;
    const f = JSON.parse(raw) as { skills?: Record<string, unknown> };
    if (!f || typeof f !== 'object') return null;
    const skills: Record<string, boolean> = {};
    for (const k of SKILL_IDS) skills[k] = !!(f.skills && f.skills[k] === true);
    return skills;
  } catch { return null; }
}

export function validateSaveWorld(world: WorldData): boolean {
  return validateWorld(world).ok && world.rows.length === ROWS;
}

export { GROUPS };
