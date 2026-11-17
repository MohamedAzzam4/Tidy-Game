import { describe, expect, it } from 'vitest';
import { generateWorld } from '../worldgen';
import { applySave, deserializeRun, serializeRun } from '../save';

function shelvedWorld(seed = 9) {
  const w = generateWorld(seed);
  // shelve tapes of the first 3 combos (via the real data path)
  let shelved = 0;
  for (const t of w.tapes) {
    if (shelved >= 30) break;
    if (t.defect && !t.repaired) continue;
    const rack = w.racks[t.combo];
    const slot = rack.slots.findIndex(s => s === null);
    if (slot < 0) continue;
    t.state = 'shelved'; t.slot = slot; rack.slots[slot] = t.id;
    shelved++;
  }
  return { w, shelved };
}

describe('save serialization', () => {
  it('roundtrips positions, repairs, organizer contents and skills', () => {
    const { w, shelved } = shelvedWorld();
    const skills = { scanner: true, guide: true, misplaced: false, marquee: false, matchScan: false, matchGather: false };
    const powers = { matchScan: { unlocked: false, activeUntil: 0, cooldownUntil: 0 }, matchGather: { unlocked: false, activeUntil: 0, cooldownUntil: 0 } };
    // simulate two completed repairs
    const defTapes = w.tapes.filter(t => t.defect !== null).slice(0, 2);
    defTapes.forEach(t => { t.repaired = true; });
    const file = serializeRun(w, skills, powers, 1234);
    const json = JSON.parse(JSON.stringify(file));
    const parsed = deserializeRun(json);
    expect(parsed).not.toBeNull();

    // apply to a fresh world of the same seed and compare
    const fresh = generateWorld(w.seed);
    applySave(fresh, parsed!);
    expect(fresh.tapes.filter(t => t.state === 'shelved').length).toBe(shelved);
    for (const t of fresh.tapes) {
      const orig = w.tapes.find(o => o.id === t.id)!;
      expect(t.repaired).toBe(orig.repaired);
      expect(t.state).toBe(orig.state);
      expect(t.x).toBe(orig.x);
      expect(t.y).toBe(orig.y);
      expect(t.slot).toBe(orig.slot);
    }
    // rack occupancy restored
    for (const rack of fresh.racks) {
      expect(rack.slots).toEqual(w.racks[rack.combo].slots);
    }
    expect(parsed!.skills.scanner).toBe(true);
    expect(parsed!.playSeconds).toBe(1234);
  });

  it('rejects untrusted / corrupted payloads (trust boundary)', () => {
    expect(deserializeRun(null)).toBeNull();
    expect(deserializeRun(undefined)).toBeNull();
    expect(deserializeRun({})).toBeNull();
    expect(deserializeRun('nope')).toBeNull();
    expect(deserializeRun({ version: 2, seed: 1, tapes: [] })).toBeNull();
    expect(deserializeRun({ version: 1, seed: 'x', tapes: [] })).toBeNull();

    const { w } = shelvedWorld();
    const file = serializeRun(w, {}, {}, 0);

    // tampered combo (tape 0 swapped combo)
    const badCombo = JSON.parse(JSON.stringify(file));
    badCombo.tapes[0].combo = (badCombo.tapes[0].combo + 1) % 64;
    expect(deserializeRun(badCombo)).toBeNull();

    // duplicate slot occupancy
    const file2 = serializeRun(generateWorld(w.seed), {}, {}, 0);
    const twoShelved = JSON.parse(JSON.stringify(file2));
    twoShelved.tapes[0].state = 'shelved';
    twoShelved.tapes[0].slot = 0;
    twoShelved.tapes[1].state = 'shelved';
    twoShelved.tapes[1].slot = 0;
    if (twoShelved.tapes[0].combo === twoShelved.tapes[1].combo) {
      expect(deserializeRun(twoShelved)).toBeNull();
    }

    // unknown tape id
    const badId = JSON.parse(JSON.stringify(file));
    badId.tapes[0].id = 99999;
    expect(deserializeRun(badId)).toBeNull();

    // loose tape teleported out of bounds
    const badPos = JSON.parse(JSON.stringify(file));
    const loose = badPos.tapes.find((t: { state: string }) => t.state === 'loose');
    loose.x = -500;
    expect(deserializeRun(badPos)).toBeNull();
  });
});
