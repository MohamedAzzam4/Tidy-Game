import { describe, expect, it } from 'vitest';
import { generateWorld } from '../worldgen';
import { applySave, deserializeRun, serializeRun } from '../save';
import { rowsOfGroup } from '../config';

function shelvedWorld(seed = 9) {
  const w = generateWorld(seed);
  // shelve tapes of the first few groups (via the real data path: rows + slots)
  let shelved = 0;
  for (const t of w.tapes) {
    if (shelved >= 30) break;
    if (t.defect && !t.repaired) continue;
    const rowId = rowsOfGroup(t.combo)[0];
    const row = w.rows[rowId];
    const slot = row.slots.findIndex(s => s === null);
    if (slot < 0) continue;
    t.state = 'shelved'; t.row = rowId; t.slot = slot;
    row.slots[slot] = t.id;
    shelved++;
  }
  // two tapes ride in the tray
  const trayTapes: (number | null)[] = [null, null, null, null, null];
  let trayN = 0;
  for (const t of w.tapes) {
    if (t.state !== 'loose' || trayN >= 2) continue;
    t.state = 'tray'; t.row = null; t.slot = null;
    trayTapes[trayN] = t.id;
    trayN++;
  }
  return { w, shelved, trayTapes };
}

describe('save serialization v2', () => {
  it('roundtrips positions, repairs, rows, tray and skills', () => {
    const { w, shelved, trayTapes } = shelvedWorld();
    const skills = { scanner: true, guide: true, misplaced: false, marquee: false, matchScan: false, matchGather: false };
    const powers = {
      misplaced: { unlocked: false, activeUntil: 0, cooldownUntil: 0 },
      matchScan: { unlocked: false, activeUntil: 0, cooldownUntil: 0 },
      matchGather: { unlocked: false, activeUntil: 0, cooldownUntil: 0 },
    };
    // simulate two completed repairs
    w.tapes.filter(t => t.defect !== null).slice(0, 2).forEach(t => { t.repaired = true; });
    const file = serializeRun(w, skills, powers, 1234, trayTapes);
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
      expect(t.row).toBe(orig.row);
      expect(t.slot).toBe(orig.slot);
    }
    // row occupancy restored
    for (const row of fresh.rows) {
      expect(row.slots).toEqual(w.rows[row.id].slots);
    }
    // tray restored in order
    expect(parsed!.tray).toEqual(trayTapes);
    expect(parsed!.skills.scanner).toBe(true);
    expect(parsed!.playSeconds).toBe(1234);
  });

  it('rejects untrusted / corrupted payloads (trust boundary)', () => {
    expect(deserializeRun(null)).toBeNull();
    expect(deserializeRun(undefined)).toBeNull();
    expect(deserializeRun({})).toBeNull();
    expect(deserializeRun('nope')).toBeNull();
    expect(deserializeRun({ version: 2, seed: 1, tapes: [] })).toBeNull();
    expect(deserializeRun({ version: 1, seed: 1, tapes: [] })).toBeNull(); // v1 never silently migrates

    const { w, trayTapes } = shelvedWorld();
    const file = serializeRun(w, {}, {}, 0, trayTapes);

    // tampered combo (tape 0 swapped group)
    const badCombo = JSON.parse(JSON.stringify(file));
    badCombo.tapes[0].combo = (badCombo.tapes[0].combo + 1) % 32;
    expect(deserializeRun(badCombo)).toBeNull();

    // duplicate slot occupancy in one row
    const file2 = serializeRun(generateWorld(w.seed), {}, {}, 0, trayTapes);
    const twoShelved = JSON.parse(JSON.stringify(file2));
    twoShelved.tapes[0].state = 'shelved';
    twoShelved.tapes[0].row = 0;
    twoShelved.tapes[0].slot = 0;
    twoShelved.tapes[1].state = 'shelved';
    twoShelved.tapes[1].row = 0;
    twoShelved.tapes[1].slot = 0;
    if (twoShelved.tapes[0].combo !== twoShelved.tapes[1].combo) {
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

    // tray referencing a tape that is not in the tray state
    const badTray = JSON.parse(JSON.stringify(file));
    const someLoose = badTray.tapes.find((t: { state: string }) => t.state === 'loose');
    badTray.tray[0] = someLoose.id;
    expect(deserializeRun(badTray)).toBeNull();
  });
});
