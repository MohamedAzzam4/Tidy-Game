/**
 * Skill system — XP curve, skill definitions, guarded persistence.
 *
 * Design intent (from the reference game's community feedback): Luisak asked
 * for "move multiple sheets at once, more capacity, possibly add upgrades";
 * this module is exactly that, tuned so a first short run unlocks the first
 * two skills and long runs unlock the rest. Unlocks derive from total XP, so
 * persistence only stores XP + settings (less to migrate later).
 */

export type SkillId = 'bothPaws' | 'moonlight' | 'tidePull' | 'gullsEye' | 'slipstream';

export interface SkillDef {
  id: SkillId;
  name: string;
  desc: string;
  /** XP total required to unlock (equals the level threshold). */
  unlockLevel: number;
  kind: 'passive' | 'active';
  /** Active skills: reuse delay & effect window, in seconds. */
  cooldownS?: number;
  durationS?: number;
}

export const SKILL_IDS: SkillId[] = ['bothPaws', 'moonlight', 'tidePull', 'gullsEye', 'slipstream'];

export const SKILL_DEFS: Record<SkillId, SkillDef> = {
  bothPaws: { id: 'bothPaws', name: 'Both Paws', desc: 'Carry up to 3 critters at once.', unlockLevel: 1, kind: 'passive' },
  moonlight: { id: 'moonlight', name: 'Moonlight', desc: 'Reveal glowing threads from every critter to its jar.', unlockLevel: 2, kind: 'active', cooldownS: 30, durationS: 10 },
  tidePull: { id: 'tidePull', name: 'Tide Pull', desc: 'Instantly file up to 3 loose critters into their jars.', unlockLevel: 3, kind: 'active', cooldownS: 45 },
  gullsEye: { id: 'gullsEye', name: "Gull's Eye", desc: 'Everything glows briefly — jars, cubbies, the nearest targets.', unlockLevel: 4, kind: 'active', cooldownS: 60, durationS: 12 },
  slipstream: { id: 'slipstream', name: 'Slipstream', desc: 'Double-click flights fly 1.6× faster; carry one extra critter.', unlockLevel: 5, kind: 'passive' },
};

/** Cumulative XP needed to REACH level index+1 (level 1 = 0). Beyond the
 *  table the curve continues at +400/level so long runs never stall. */
export const LEVEL_XP: number[] = [0, 60, 180, 360, 620, 950];

export function levelFromXp(xp: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) {
    if (xp >= LEVEL_XP[i]) level = i + 1;
  }
  if (xp >= LEVEL_XP[LEVEL_XP.length - 1]) {
    const over = xp - LEVEL_XP[LEVEL_XP.length - 1];
    level += Math.floor(over / 400);
  }
  return level;
}

/** XP needed for the NEXT level (for the HUD progress bar). */
export function nextLevelXp(xp: number): number | null {
  const level = levelFromXp(xp);
  if (level < LEVEL_XP.length) return LEVEL_XP[level];
  return LEVEL_XP[LEVEL_XP.length - 1] + ((level - LEVEL_XP.length) + 1) * 400;
}

export function unlockedAt(xp: number): SkillId[] {
  const level = levelFromXp(xp);
  return SKILL_IDS.filter((id) => SKILL_DEFS[id].unlockLevel <= level);
}

/** Persisted save. Versioned key so a future schema change migrates cleanly. */
export const SAVE_KEY = 'tide-and-tidy.save.v1';

export interface SaveData {
  xp: number;
  music: boolean;
  sfx: boolean;
  lastScale: string;
  /** Best stats across runs — small, gives the finale something to compare. */
  best: { elapsedMs: number; bestStreak: number; tides: number };
}

export const DEFAULT_SAVE: SaveData = {
  xp: 0,
  music: true,
  sfx: true,
  lastScale: 'drift',
  best: { elapsedMs: 0, bestStreak: 0, tides: 0 },
};

/** Storage is decorative — private mode / disabled storage never breaks the
 *  game (same discipline as the repo's guarded audio). */
export function loadSave(storage: Storage | null): SaveData {
  if (!storage) return { ...DEFAULT_SAVE, best: { ...DEFAULT_SAVE.best } };
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return { ...DEFAULT_SAVE, best: { ...DEFAULT_SAVE.best } };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const merged: SaveData = { ...DEFAULT_SAVE, ...parsed, best: { ...DEFAULT_SAVE.best, ...(parsed.best ?? {}) } };
    merged.xp = Number.isFinite(merged.xp) && merged.xp >= 0 ? Math.floor(merged.xp) : 0;
    return merged;
  } catch {
    return { ...DEFAULT_SAVE, best: { ...DEFAULT_SAVE.best } };
  }
}

export function writeSave(storage: Storage | null, data: SaveData): void {
  if (!storage) return;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable — the game still plays, it just forgets */
  }
}
