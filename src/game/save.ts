/**
 * Tidy Tapes — save/load v3. localStorage is untrusted input: every field is guarded.
 * Pure functions + a tiny storage adapter (browser-only guard).
 *
 * v3 layout (north bank centered, walnut pilot unit respaced) accepts v2 runs:
 * the seed is the source of structure, mutable state is reapplied, and any loose
 * tape that now sits inside a moved rack/bench/lamp rect is pushed to the
 * nearest legal spot (overlap fixup) — never silently dropped.
 */
import {
  ART_PILOT, GROUPS, ROWS, SAVE_KEY, SAVE_KEY_V2, SLOTS_PER_ROW, TRAY_SLOTS,
  UNITS, WORLD_H, WORLD_W, benchRect, unitRect,
} from './config';
import type { DefectType, SaveFile, SaveSettings, Tape, WorldData } from './types';
import { generateWorld } from './worldgen';
import { validateWorld } from './validation';

const DEFECT_TYPES: DefectType[] = ['rewind', 'sticker', 'paint'];
const SKILL_IDS = ['scanner', 'guide', 'misplaced', 'marquee', 'matchScan', 'matchGather'];
const POWER_IDS = ['misplaced', 'matchScan', 'matchGather'];

export interface SkillsSave { unlocked: Record<string, boolean> }
export interface PowersSave { [power: string]: { unlocked: boolean; activeUntil: number; cooldownUntil: number } }

export const DEFAULT_SETTINGS: SaveSettings = {
  sound: true,
  hoverFx: true,
  pilotArt: true,
  reducedMotion: false,
};

export function serializeRun(
  world: WorldData,
  skills: Record<string, boolean>,
  powers: Record<string, { unlocked: boolean; activeUntil: number; cooldownUntil: number }>,
  playSeconds: number,
  trayTapes: (number | null)[],
  extra: { achievements?: number[]; milestones?: { rows: number; cabinets: number }; settings?: SaveSettings } = {},
): SaveFile {
  return {
    version: 3,
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
    achievements: (extra.achievements ?? []).slice(),
    milestones: extra.milestones ?? { rows: 0, cabinets: 0 },
    settings: { ...DEFAULT_SETTINGS, ...(extra.settings ?? {}) },
  };
}

/** Parse + validate a v2/v3 save payload. Returns null when untrustworthy. */
export function deserializeRun(raw: unknown): SaveFile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const f = raw as Record<string, unknown>;
  if (f.version !== 2 && f.version !== 3) return null;
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

  const achievements: number[] = [];
  if (Array.isArray(f.achievements)) {
    for (const v of f.achievements) {
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < UNITS
        && !achievements.includes(v)) achievements.push(v);
    }
  }
  const milestones = {
    rows: typeof (f.milestones as { rows?: unknown } | undefined)?.rows === 'number'
      ? Math.max(0, (f.milestones as { rows: number }).rows | 0) : 0,
    cabinets: typeof (f.milestones as { cabinets?: unknown } | undefined)?.cabinets === 'number'
      ? Math.max(0, (f.milestones as { cabinets: number }).cabinets | 0) : 0,
  };
  const rawSettings = (f.settings ?? {}) as Record<string, unknown>;
  const settings: SaveSettings = {
    sound: rawSettings.sound !== false,
    hoverFx: rawSettings.hoverFx !== false,
    pilotArt: rawSettings.pilotArt !== false,
    reducedMotion: rawSettings.reducedMotion === true,
  };

  return {
    version: 3,
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
    achievements,
    milestones,
    settings,
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
    for (const key of [SAVE_KEY, SAVE_KEY_V2]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = deserializeRun(JSON.parse(raw));
      if (parsed) return parsed;
    }
    return null;
  } catch { return null; }
}

/**
 * v3 layout fixup: push any LOOSE tape that now overlaps a rack (the centered
 * north bank or the taller walnut pilot), the bench, or the pilot lamp out to
 * the nearest legal spot. Shelved/tray tapes are position-independent. Idempotent.
 */
export function resolveSaveOverlaps(world: WorldData): number {
  const obstacles = [] as { x: number; y: number; w: number; h: number }[];
  for (let u = 0; u < UNITS; u++) obstacles.push(unitRect(u));
  obstacles.push(benchRect());
  obstacles.push({
    x: ART_PILOT.lamp.x - 16, y: ART_PILOT.lamp.y - 16,
    w: ART_PILOT.lamp.w + 32, h: ART_PILOT.lamp.h + 32,
  });
  const pad = 34;
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.max(70, Math.min(WORLD_W - 70, p.x)),
    y: Math.max(90, Math.min(WORLD_H - 70, p.y)),
  });
  let moved = 0;
  for (const t of world.tapes) {
    if (t.state !== 'loose') continue;
    let hit = obstacles.find(r =>
      t.x >= r.x - pad && t.x <= r.x + r.w + pad && t.y >= r.y - pad && t.y <= r.y + r.h + pad);
    if (!hit) continue;
    let fixed = false;
    for (let r = 46; r <= 640 && !fixed; r += 46) {
      for (let a = 0; a < 12 && !fixed; a++) {
        const ang = (a / 12) * Math.PI * 2 + (t.id % 7) * 0.13;
        const cx = t.x + Math.cos(ang) * r;
        const cy = t.y + Math.sin(ang) * r;
        const p = clamp({ x: cx, y: cy });
        const blocked = obstacles.some(o =>
          p.x >= o.x - pad && p.x <= o.x + o.w + pad && p.y >= o.y - pad && p.y <= o.y + o.h + pad);
        if (blocked) continue;
        t.x = Math.round(p.x * 10) / 10;
        t.y = Math.round(p.y * 10) / 10;
        moved++;
        fixed = true;
      }
    }
    if (!fixed) { // last resort: below the obstacle block
      const p = clamp({ x: t.x, y: (hit?.y ?? 0) + (hit?.h ?? 0) + 60 });
      t.x = Math.round(p.x * 10) / 10;
      t.y = Math.round(p.y * 10) / 10;
      moved++;
    }
  }
  return moved;
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
