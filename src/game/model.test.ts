/**
 * Model checks: the full two-stage loop, identity matching, streak/XP math,
 * skill effects, lore cadence and the finale event order.
 */
import { describe, expect, it } from 'vitest';
import { generateWorld, SCALES } from './worldgen';
import { LORE, TideGame } from './model';
import type { SkillId } from './skills';

const drift = () => generateWorld(4242, SCALES[0]);
const ebb = () => generateWorld(99, SCALES[1]);

function eventsOf(g: TideGame) {
  return g.consumeEvents();
}

describe('the two-stage loop (drift world)', () => {
  it('files → seals → shelves → completes, with exact XP math', () => {
    const world = drift();
    const g = new TideGame(world);
    const golden = world.critters.filter((c) => c.golden).length;

    for (const jar of world.jars) {
      const members = world.critters.filter((c) => c.jarId === jar.id);
      for (const c of members) {
        expect(g.pickCritter(c.id)).toBe(true);
        expect(g.fileCritter(c.id, jar.id)).toBe(true);
      }
      expect(g.isSealed(jar.id)).toBe(true);
    }
    for (const jar of world.jars) {
      expect(g.pickJar(jar.id)).toBe(true);
      const cubby = world.cubbies.find((c) => c.species === jar.species)!;
      expect(g.shelveJar(jar.id, cubby.id)).toBe(true);
    }
    expect(g.isComplete()).toBe(true);

    const evs = eventsOf(g);
    expect(evs[evs.length - 1]).toMatchObject({ t: 'complete' });
    const stats = (evs[evs.length - 1] as { stats: { mistakes: number } }).stats;
    expect(stats.mistakes).toBe(0);

    // XP: 48 files + 9×golden + 12 seals + 12 shelves + 50 completion
    const xp = g.xp;
    expect(xp).toBe(48 + 9 * golden + 12 * 5 + 12 * 3 + 50);
  });

  it('rejects a critter into the wrong jar of the same species', () => {
    const world = drift();
    const g = new TideGame(world);
    const jarA = world.jars[0];
    const jarB = world.jars.find((j) => j.species === jarA.species && j.id !== jarA.id)!;
    const critter = world.critters.find((c) => c.jarId === jarA.id)!;

    expect(g.pickCritter(critter.id)).toBe(true);
    expect(g.fileCritter(critter.id, jarB.id)).toBe(false);
    const evs = eventsOf(g);
    expect(evs.some((e) => e.t === 'wrong')).toBe(true);
    expect(g.currentStreak).toBe(0);
    // the critter stays in hand — mistakes never lose items
    expect(g.heldKind).toMatchObject({ kind: 'critters' });
    expect(g.fileCritter(critter.id, jarA.id)).toBe(true);
    expect(g.currentStreak).toBe(1);
  });

  it('unsealed jars refuse pickup with a hint, not an error', () => {
    const world = drift();
    const g = new TideGame(world);
    const jar = world.jars[0];
    expect(g.pickJar(jar.id)).toBe(false);
    expect(eventsOf(g).some((e) => e.t === 'hint')).toBe(true);
  });

  it('streak milestones fire every 5 consecutive files', () => {
    const world = drift();
    const g = new TideGame(world);
    // five files across two jars of the same species — the streak is per-file
    const five = [
      ...world.critters.filter((c) => c.jarId === world.jars[0].id),
      world.critters.find((c) => c.jarId === world.jars[1].id)!,
    ];
    for (const c of five) {
      g.pickCritter(c.id);
      g.fileCritter(c.id, c.jarId);
    }
    const streaks = eventsOf(g).filter((e) => e.t === 'streak').map((e) => (e as { n: number }).n);
    expect(streaks).toEqual([5]);
  });

  it('releaseAll returns held critters to the shore', () => {
    const world = drift();
    const g = new TideGame(world);
    const c = world.critters[0];
    g.pickCritter(c.id);
    g.releaseAll();
    expect(g.critterLocation(c.id)).toBe('loose');
    expect(g.heldKind).toMatchObject({ kind: 'none' });
    expect(eventsOf(g).some((e) => e.t === 'bounce')).toBe(true);
  });

  it('lore arrives in order on every 5th shelved jar and at completion', () => {
    const world = drift();
    const g = new TideGame(world);
    for (const jar of world.jars) {
      for (const c of world.critters.filter((k) => k.jarId === jar.id)) {
        g.pickCritter(c.id);
        g.fileCritter(c.id, jar.id);
      }
      g.pickJar(jar.id);
      g.shelveJar(jar.id, world.cubbies.find((k) => k.species === jar.species)!.id);
    }
    const lore = eventsOf(g).filter((e) => e.t === 'lore').map((e) => (e as { line: string }).line);
    // 12 jars → shelves #5 and #10 mid-run, plus the finale line
    expect(lore).toEqual([LORE[0], LORE[1], LORE[LORE.length - 1]]);
  });
});

describe('skills in the model', () => {
  it('carry capacity follows unlocks (1 → 3 → 4)', () => {
    const g = new TideGame(drift());
    expect(g.carryCap).toBe(1);
    g.setUnlocked(['bothPaws']);
    expect(g.carryCap).toBe(3);
    g.setUnlocked(['bothPaws', 'slipstream']);
    expect(g.carryCap).toBe(4);
  });

  it('holds exactly one jar, never jar + critters', () => {
    const world = drift();
    const g = new TideGame(world);
    const jar = world.jars[0];
    const c = world.critters[0];
    g.pickCritter(c.id);
    expect(g.pickJar(jar.id)).toBe(false); // unsealed anyway
    for (const k of world.critters.filter((x) => x.jarId === jar.id)) {
      g.pickCritter(k.id);
      g.fileCritter(k.id, jar.id);
    }
    g.releaseAll();
    expect(g.pickJar(jar.id)).toBe(true);
    expect(g.pickCritter(world.critters.find((x) => g.critterLocation(x.id) === 'loose')!.id)).toBe(false);
  });

  it('fileAllHeld files every carried critter into its own jar', () => {
    const world = drift();
    const g = new TideGame(world, { unlocked: new Set(['bothPaws']) });
    const picks = world.critters.filter((c) => c.jarId === world.jars[0].id).slice(0, 3);
    for (const c of picks) expect(g.pickCritter(c.id)).toBe(true);
    expect(g.fileAllHeld()).toBe(3);
    for (const c of picks) expect(g.critterLocation(c.id)).toBe('jarred');
  });

  it('tidePull auto-files only when unlocked, at most n', () => {
    const world = drift();
    const gLocked = new TideGame(world);
    expect(gLocked.tidePull(3)).toBe(0);

    const g = new TideGame(drift(), { unlocked: new Set<SkillId>(['tidePull']) });
    expect(g.tidePull(3)).toBe(3);
    expect(g.tidePull(3)).toBe(3);
  });

  it('fly targets: open jar for loose critters, cubby for sealed jars (even held)', () => {
    const world = drift();
    const g = new TideGame(world);
    const c = world.critters[0];
    expect(g.flyTargetJar(c.id)).toBe(c.jarId);
    const jar = world.jars.find((j) => j.id === c.jarId)!;
    for (const k of world.critters.filter((x) => x.jarId === jar.id)) {
      g.pickCritter(k.id);
      g.fileCritter(k.id, jar.id);
    }
    expect(g.flyTargetJar(c.id)).toBeNull(); // jar sealed now
    expect(g.pickJar(jar.id)).toBe(true);
    const cubbyId = world.cubbies.find((k) => k.species === jar.species)!.id;
    expect(g.flyTargetCubby(jar.id)).toBe(cubbyId); // works while held
  });

  it('wrong cubby is a mistake, not a crash', () => {
    const world = drift();
    const g = new TideGame(world);
    const jar = world.jars[0];
    for (const k of world.critters.filter((x) => x.jarId === jar.id)) {
      g.pickCritter(k.id);
      g.fileCritter(k.id, jar.id);
    }
    g.pickJar(jar.id);
    const otherCubby = world.cubbies.find((k) => k.species !== jar.species)!;
    expect(g.shelveJar(jar.id, otherCubby.id)).toBe(false);
    expect(eventsOf(g).some((e) => e.t === 'wrong')).toBe(true);
    expect(g.heldKind).toMatchObject({ kind: 'jar', id: jar.id });
  });
});

describe('ebb scale stays solvable through the same rules', () => {
  it('seals and shelves all 30 jars', () => {
    const world = ebb();
    const g = new TideGame(world);
    for (const jar of world.jars) {
      for (const c of world.critters.filter((k) => k.jarId === jar.id)) {
        g.pickCritter(c.id);
        expect(g.fileCritter(c.id, jar.id)).toBe(true);
      }
      g.pickJar(jar.id);
      expect(g.shelveJar(jar.id, world.cubbies.find((k) => k.species === jar.species)!.id)).toBe(true);
    }
    expect(g.isComplete()).toBe(true);
    expect(eventsOf(g).filter((e) => e.t === 'complete')).toHaveLength(1);
  });
});

describe('no-orphan guarantee (regression)', () => {
  it('flyFile never disturbs a carried critter', () => {
    const world = drift();
    const g = new TideGame(world);
    const carried = world.critters[0];
    const flying = world.critters.find((c) => c.id !== carried.id)!;
    expect(g.pickCritter(carried.id)).toBe(true);
    expect(g.flyFile(flying.id)).toBe(true);
    // the carried critter is untouched — still in hand, still recoverable
    expect(g.critterLocation(carried.id)).toBe('held');
    expect(g.heldKind).toMatchObject({ kind: 'critters', ids: [carried.id] });
    expect(g.critterLocation(flying.id)).toBe('jarred');
    g.releaseAll();
    expect(g.critterLocation(carried.id)).toBe('loose');
  });

  it('flyFile on a held critter is a no-op (it is not loose)', () => {
    const world = drift();
    const g = new TideGame(world);
    const c = world.critters[0];
    g.pickCritter(c.id);
    expect(g.flyFile(c.id)).toBe(false);
    expect(g.critterLocation(c.id)).toBe('held');
  });
});
