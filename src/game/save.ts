/**
 * Tidy Tapes — save/load. localStorage is untrusted input: every field is guarded.
 * Pure functions + a tiny storage adapter (browser-only guard).
 */
import { COMBO_COUNT, RACK_SLOTS, SAVE_KEY } from './config';
import type { DefectType, SaveFile, Tape, WorldData } from './types';
import { generateWorld } from './worldgen';
import { validateWorld } from './validation';

const DEFECT_TYPES: DefectType[] = ['rewind', 'sticker', 'paint'];
const SKILL_IDS = ['scanner', 'guide', 'misplaced', 'marquee', 'matchScan', 'matchGather'];

export interface SkillsSave { unlocked: Record<string, boolean> }
export interface PowersSave { [power: string]: { unlocked: boolean; activeUntil: number; cooldownUntil: number } }

export function serializeRun(
  world: WorldData,
  skills: Record<string, boolean>,
  powers: Record<string, { unlocked: boolean; activeUntil: number; cooldownUntil: number }>,
  playSeconds: number,
): SaveFile {
  return {
    version: 1,
    seed: world.seed,
    savedAt: Date.now(),
    tapes: world.tapes.map(t => ({
      id: t.id, combo: t.combo, defect: t.defect, repaired: t.repaired,
      state: t.state, x: t.x, y: t.y, rot: t.rot, slot: t.slot,
    })),
    skills: Object.fromEntries(SKILL_IDS.map(k => [k, !!skills[k]])),
    powers: Object.fromEntries(Object.entries(powers).map(([k, v]) => [
      k, { unlocked: !!v.unlocked, activeUntil: v.activeUntil | 0, cooldownUntil: v.cooldownUntil | 0 },
    ])),
    playSeconds: Math.max(0, playSeconds | 0),
  };
}

/** Parse + validate a save payload. Returns null when untrustworthy. */
export function deserializeRun(raw: unknown): SaveFile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const f = raw as Record<string, unknown>;
  if (f.version !== 1) return null;
  const seed = typeof f.seed === 'number' && Number.isFinite(f.seed) ? f.seed : null;
  if (seed === null) return null;
  if (!Array.isArray(f.tapes) || f.tapes.length < 400) return null;

  // Regenerate the world from the seed, then re-apply saved runtime state.
  // The seed is the source of structure; only mutable fields are trusted.
  const world = generateWorld(seed);
  const byId = new Map<number, Tape>();
  for (const t of world.tapes) byId.set(t.id, t);

  let ok = true;
  for (const s of f.tapes as Array<Record<string, unknown>>) {
    if (typeof s !== 'object' || s === null) { ok = false; break; }
    const id = s.id; const combo = s.combo; const state = s.state;
    if (typeof id !== 'number' || !Number.isInteger(id)) { ok = false; break; }
    const tape = byId.get(id);
    if (!tape) { ok = false; break; }                    // unknown id
    if (combo !== tape.combo) { ok = false; break; }     // combo must match generation
    if (state !== 'loose' && state !== 'shelved') { ok = false; break; }
    const defect = s.defect;
    if (defect !== null && !DEFECT_TYPES.includes(defect as DefectType)) { ok = false; break; }
    if (defect !== tape.defect) { ok = false; break; }   // defect must match generation
    const repaired = s.repaired;
    if (typeof repaired !== 'boolean') { ok = false; break; }
    const x = s.x; const y = s.y; const rot = s.rot;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) { ok = false; break; }
    if (state === 'loose' && (x < 20 || x > world.worldW - 20 || y < 20 || y > world.worldH - 20)) { ok = false; break; }
    const slot = s.slot;
    if (state === 'shelved') {
      if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= RACK_SLOTS) { ok = false; break; }
    } else if (slot !== null) { ok = false; break; }
    tape.repaired = repaired;
    tape.state = state;
    tape.x = x; tape.y = y;
    tape.rot = typeof rot === 'number' && Number.isFinite(rot) ? rot : 0;
    tape.slot = slot as number | null;
  }
  if (!ok) return null;

  // Rebuild rack occupancy from shelved tapes; reject slot collisions.
  for (const rack of world.racks) rack.slots.fill(null);
  for (const t of world.tapes) {
    if (t.state === 'shelved') {
      const rack = world.racks[t.combo];
      if (rack.slots[t.slot as number] !== null) return null; // duplicate slot use
      rack.slots[t.slot as number] = t.id;
    }
  }

  const skills: Record<string, boolean> = {};
  for (const k of SKILL_IDS) skills[k] = !!(f.skills && (f.skills as Record<string, unknown>)[k] === true);

  const powers: Record<string, { unlocked: boolean; activeUntil: number; cooldownUntil: number }> = {};
  if (f.powers && typeof f.powers === 'object') {
    for (const k of ['matchScan', 'matchGather']) {
      const p = (f.powers as Record<string, unknown>)[k];
      if (p && typeof p === 'object') {
        const o = p as Record<string, unknown>;
        powers[k] = {
          unlocked: o.unlocked === true,
          activeUntil: typeof o.activeUntil === 'number' && Number.isFinite(o.activeUntil) ? o.activeUntil : 0,
          cooldownUntil: typeof o.cooldownUntil === 'number' && Number.isFinite(o.cooldownUntil) ? o.cooldownUntil : 0,
        };
      }
    }
  }

  return {
    version: 1,
    seed,
    savedAt: typeof f.savedAt === 'number' ? f.savedAt : Date.now(),
    tapes: world.tapes.map(t => ({
      id: t.id, combo: t.combo, defect: t.defect, repaired: t.repaired,
      state: t.state, x: t.x, y: t.y, rot: t.rot, slot: t.slot,
    })),
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
    t.rot = s.rot; t.slot = s.slot;
  }
  for (const rack of world.racks) rack.slots.fill(null);
  for (const t of world.tapes) {
    if (t.state === 'shelved') {
      const rack = world.racks[t.combo];
      rack.slots[t.slot as number] = t.id;
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

export { COMBO_COUNT };
