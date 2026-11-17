/** Skills & persistence checks: XP curve, unlocks, guarded storage. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SAVE, levelFromXp, loadSave, nextLevelXp, unlockedAt, writeSave, LEVEL_XP } from './skills';

describe('XP curve', () => {
  it('hits every threshold exactly', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(59)).toBe(1);
    expect(levelFromXp(60)).toBe(2);
    expect(levelFromXp(180)).toBe(3);
    expect(levelFromXp(360)).toBe(4);
    expect(levelFromXp(620)).toBe(5);
    expect(levelFromXp(950)).toBe(6);
  });
  it('keeps growing past the table (+400/level)', () => {
    expect(levelFromXp(950 + 399)).toBe(6);
    expect(levelFromXp(950 + 400)).toBe(7);
    expect(levelFromXp(950 + 800)).toBe(8);
  });
  it('nextLevelXp always exceeds current xp', () => {
    for (const xp of [0, 30, 60, 200, 500, 1000, 2000]) {
      const next = nextLevelXp(xp);
      expect(next).toBeGreaterThan(xp);
    }
  });
  it('unlocks map to levels in order (Both Paws is there from the start)', () => {
    expect(unlockedAt(0)).toEqual(['bothPaws']);
    expect(unlockedAt(60)).toEqual(['bothPaws', 'moonlight']);
    expect(unlockedAt(950)).toEqual(['bothPaws', 'moonlight', 'tidePull', 'gullsEye', 'slipstream']);
    expect(LEVEL_XP).toHaveLength(6);
  });
});

/** Minimal in-memory Storage double (vitest runs in node, no localStorage). */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: () => null,
    removeItem: (k) => map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('persistence (guarded)', () => {
  it('round-trips a save', () => {
    const s = fakeStorage();
    writeSave(s, { ...DEFAULT_SAVE, xp: 240, music: false, best: { elapsedMs: 1200, bestStreak: 9, tides: 2 } });
    const loaded = loadSave(s);
    expect(loaded.xp).toBe(240);
    expect(loaded.music).toBe(false);
    expect(loaded.best).toEqual({ elapsedMs: 1200, bestStreak: 9, tides: 2 });
  });
  it('corrupt JSON and negative xp fall back to defaults', () => {
    const s = fakeStorage();
    s.setItem('tide-and-tidy.save.v1', '{not json');
    expect(loadSave(s).xp).toBe(0);
    s.setItem('tide-and-tidy.save.v1', JSON.stringify({ xp: -50, best: { tides: 3 } }));
    const loaded = loadSave(s);
    expect(loaded.xp).toBe(0);
    expect(loaded.best.tides).toBe(3);
    expect(loaded.best.bestStreak).toBe(0);
  });
  it('null storage never throws', () => {
    expect(() => writeSave(null, DEFAULT_SAVE)).not.toThrow();
    expect(loadSave(null).xp).toBe(0);
  });
});
