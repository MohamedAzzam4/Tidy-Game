/*
 * End-to-end playthrough with REAL pointer drags (Playwright mouse events).
 * The page is never driven through game-state mutation; the debug hook is
 * used read-only (positions + rule queries + the lastSfx log).
 *
 * Layouts are pinned with `?seed=` (CC-013) wherever determinism is asserted.
 * Slot aims use the model's carry-height compensation point; surface aims use
 * the surface-plane mapping (plan §8.3/C-2).
 *
 * Sections:
 *   A. CC-006 playable slice: floor stays / counter stays (ε_aim) / undersized
 *      surface restores / Escape restores / slot ghost suppression / re-drag
 *   B. full 28-item playthrough (winning arrangement §8.4) → completion card
 *   C. Reset (same seeded layout) + New Mess (different layout, chips clear)
 *   D. collections by real drags: 3 green + 1 red silent; 4th green → tier
 *      animation + chime; put-back replays nothing; mute gate via lastSfx
 *   E. completion on a different tier in a second run (interchangeable tiers)
 *   F. drag-lifecycle zero-invocation of collectionStatus (preview isolation)
 *   G. viewport resize drag accuracy
 *   H. zero console/page errors; screenshots archived
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3000/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
const SEED = process.env.E2E_SEED || '11';
const LIFT = 0.55;

let failures = 0;
function check(cond, msg) {
  if (cond) {
    console.log('  ok:', msg);
  } else {
    failures++;
    console.error('  FAIL:', msg);
  }
}

(async () => {
  const fs = require('fs');
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const errors = [];

  const openPage = async (withSeed = true) => {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(withSeed ? `${BASE}?seed=${SEED}` : BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    return page;
  };

  // pointer → client for a floor-plane point
  const clientOf = (page, fx, fy) => page.evaluate(([x, y]) => window.__cozy.clientFromWorld(x, y, 0), [fx, fy]);

  const dragToSurface = async (page, itemId, sx, sy, topZ) => {
    const from = await page.evaluate((id) => window.__cozy.itemClientPos(id), itemId);
    const to = await clientOf(page, sx - topZ, sy - topZ);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.waitForTimeout(90);
    await page.mouse.up();
    await page.waitForTimeout(430);
  };

  /** Slot drop with the model's carry-height compensation: the item must land
   *  where the slot match fires — anchor + (LIFT − slotZ) − grabOffset. */
  const dragToSlot = async (page, itemId, slotId) => {
    const { fromZ, ax, ay, az } = await page.evaluate(([id, sid]) => {
      const g = window.__cozy.game;
      const loc = g.locationOf(id);
      let fromZ = 0;
      if (loc.kind === 'slot') fromZ = g.slotById(loc.slotId).anchor.z;
      else if (loc.kind === 'surface') fromZ = g.level.surfaces.find((s) => s.id === loc.surfaceId).topZ;
      for (const z of g.level.zones) {
        const s = z.slots.find((s) => s.id === sid);
        if (s) return { fromZ, ax: s.anchor.x, ay: s.anchor.y, az: s.anchor.z };
      }
      return { fromZ: 0, ax: 0, ay: 0, az: 0 };
    }, [itemId, slotId]);
    const from = await page.evaluate((id) => window.__cozy.itemClientPos(id), itemId);
    const to = await clientOf(page, ax + LIFT - az - fromZ, ay + LIFT - az - fromZ);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.waitForTimeout(90);
    await page.mouse.up();
    await page.waitForTimeout(430);
  };

  /** Drop an item on a free floor spot near (bx, by), found through the
   *  model's own predicate (read-only hook usage). */
  const dragToFreeFloor = async (page, itemId, bx, by) => {
    const spot = await page.evaluate(([id, x, y]) => {
      const g = window.__cozy.game;
      for (const [dx, dy] of [[0, 0], [0.6, 0], [0, 0.6], [-0.6, 0], [0, -0.6], [1.2, 0], [0, 1.2], [1.2, 1.2], [-1.2, 0], [0, -1.2], [1.8, 0.6], [0.6, 1.8]]) {
        const px = x + dx, py = y + dy;
        if (g.validateSurfaceDrop(id, 'floor', px, py).ok) return { x: px, y: py };
      }
      return null;
    }, [itemId, bx, by]);
    check(spot !== null, `free floor spot found near (${bx}, ${by})`);
    if (!spot) return;
    await dragToSurface(page, itemId, spot.x, spot.y, 0);
  };

  const locOf = (page, id) => page.evaluate((id2) => JSON.parse(JSON.stringify(window.__cozy.game.locationOf(id2))), id);
  const progress = (page) => page.evaluate(() => window.__cozy.game.progress());
  const near = (a, b, eps) => Math.abs(a - b) <= eps;

  // -------------------------------------------------------------------------
  console.log('A) CC-006 playable slice (seeded layout)');
  {
    const page = await openPage(true);
    const items = await page.locator('[data-item-id]').count();
    check(items === 28, `28 movable items rendered (got ${items})`);
    const hud0 = (await page.textContent('.hud-progress') ?? '').replace(/\s+/g, '');
    check(hud0 === '0/28', `HUD starts at 0/28 (got ${hud0})`);

    console.log('A1) floor drop persists + an invalid floor drop restores');
    const bookStart = await locOf(page, 'book-r1');
    // (a) a VALID floor drop: the book stays exactly where dropped
    const spot = await page.evaluate(([x, y]) => {
      const g = window.__cozy.game;
      for (const [dx, dy] of [[0.6, 0], [0, 0.6], [-0.6, 0], [0, -0.6], [1.2, 0], [0, 1.2], [1.2, 1.2]]) {
        if (g.validateSurfaceDrop('book-r1', 'floor', x + dx, y + dy).ok) return { x: x + dx, y: y + dy };
      }
      return null;
    }, [bookStart.x, bookStart.y]);
    check(spot !== null, 'a valid free floor spot exists near the scattered start');
    if (spot) {
      await dragToSurface(page, 'book-r1', spot.x, spot.y, 0);
      const after = await locOf(page, 'book-r1');
      check(after.kind === 'floor' && near(after.x, spot.x, 0.01) && near(after.y, spot.y, 0.01),
        `book stays exactly where dropped (${after.x.toFixed(2)}, ${after.y.toFixed(2)})`);
    }
    // (b) an INVALID floor drop (inside the counter footprint): restores exactly
    await dragToSurface(page, 'book-r1', 7.8, 0.36, 0);
    const restored = await locOf(page, 'book-r1');
    check(restored.kind === 'floor' && near(restored.x, spot.x, 0.01) && near(restored.y, spot.y, 0.01),
      `invalid floor drop restores the exact previous position (${restored.x.toFixed(2)}, ${restored.y.toFixed(2)})`);
    check((await progress(page)).placed === 0, 'floor rests do not count toward progress (C-21)');

    console.log('A2) counter drop persists — organizationally wrong, physically valid (ε_aim)');
    {
      const aim = { x: 7.8, y: 0.36, z: 0.96 };
      const from = await page.evaluate((id) => window.__cozy.itemClientPos(id), 'book-r1');
      const to = await page.evaluate(([x, y, z]) => window.__cozy.clientFromWorld(x, y, z), [aim.x, aim.y, aim.z]);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
      await page.mouse.move(to.x, to.y, { steps: 10 });
      await page.waitForTimeout(120);
      const ghosts = await page.evaluate(() => ({
        slot: [...document.querySelectorAll('.ghost.on')].map((g) => g.getAttribute('data-slot')),
        surface: [...document.querySelectorAll('.surface-ghost.on')].map((g) => g.getAttribute('data-surface-ghost')),
      }));
      check(ghosts.slot.length === 0 && ghosts.surface.length === 1 && ghosts.surface[0] === 'kitchenCounter',
        `counter surface ghost mid-drag, exactly one (got ${JSON.stringify(ghosts)})`);
      await page.screenshot({ path: `${SHOTS}/e2e-1-counter-ghost.png` });
      await page.mouse.up();
      await page.waitForTimeout(430);
      const afterCounter = await locOf(page, 'book-r1');
      check(afterCounter.kind === 'surface' && afterCounter.surfaceId === 'kitchenCounter',
        `book rests on the counter (got ${afterCounter.kind})`);
      check(near(afterCounter.x, aim.x, 0.05) && near(afterCounter.y, aim.y, 0.05),
        `counter aim lands within ε_aim 0.05 (got ${afterCounter.x.toFixed(3)}, ${afterCounter.y.toFixed(3)})`);
      check((await progress(page)).placed === 1, 'surface placements count toward progress (C-21)');
    }

    console.log('A3) undersized surface restores (towel → stool)');
    const towelStart = await locOf(page, 'towel-a');
    await dragToSurface(page, 'towel-a', 5.75, 1.1, 0.49);
    const afterStool = await locOf(page, 'towel-a');
    check(afterStool.kind === 'floor', `towel not placed (got ${afterStool.kind})`);
    check(near(afterStool.x, towelStart.x, 0.01) && near(afterStool.y, towelStart.y, 0.01),
      `towel restored to its exact start`);

    console.log('A4) cancelled drag restores (Escape mid-drag)');
    const mugStart = await locOf(page, 'mug-c');
    {
      const from = await page.evaluate((id) => window.__cozy.itemClientPos(id), 'mug-c');
      const to = await clientOf(page, 7.8, 0.36);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(430);
      await page.mouse.up();
      await page.waitForTimeout(120);
    }
    const afterCancel = await locOf(page, 'mug-c');
    check(near(afterCancel.x, mugStart.x, 0.01) && near(afterCancel.y, mugStart.y, 0.01),
      `mug restored by Escape`);

    console.log('A5) shelf slot drop + ghost suppression (re-drag from the counter)');
    await dragToSlot(page, 'book-r1', 'bs-t1-s4');
    {
      await page.evaluate(() => undefined);
      const from = await page.evaluate((id) => window.__cozy.itemClientPos(id), 'mug-c');
      const shelf = await clientOf(page, 6.75 + LIFT - 1.46, 0.16 + LIFT - 1.46);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(shelf.x, shelf.y, { steps: 14 });
      await page.waitForTimeout(140);
      const ghosts = await page.evaluate(() => ({
        slot: [...document.querySelectorAll('.ghost.on')].map((g) => g.getAttribute('data-slot')),
        surface: [...document.querySelectorAll('.surface-ghost.on')].length,
      }));
      check(ghosts.slot.length === 1 && ghosts.surface === 0,
        `exactly one slot ghost mid-drag, surface ghost suppressed (got ${JSON.stringify(ghosts)})`);
      await page.screenshot({ path: `${SHOTS}/e2e-2-slot-ghost.png` });
      await page.mouse.up();
      await page.waitForTimeout(430);
      const after = await locOf(page, 'mug-c');
      check(after.kind === 'slot', `mug placed on a rack slot via compensated aim (${after.kind})`);
    }
    check((await progress(page)).placed === 2, 'progress 2 (counter book + rack mug)');
    await page.close();
  }

  // -------------------------------------------------------------------------
  console.log('B) full 28-item playthrough (winning arrangement, plan §8.4)');
  {
    const page = await openPage(true);
    const initialLayout = await page.evaluate(() => {
      const g = window.__cozy.game;
      return g.items.map((i) => JSON.parse(JSON.stringify(g.locationOf(i.id))));
    });
    const nextFreeSlot = (cat) => page.evaluate((category) => {
      const g = window.__cozy.game;
      for (const z of g.level.zones) {
        if (z.id === 'zoneBookshelf' || z.category !== category) continue;
        const s = z.slots.find((s) => !g.occupantOf(s.id));
        return s ? s.id : null;
      }
      return null;
    }, cat);
    const tiers = { 'book-r': 'bs-t1-', 'book-g': 'bs-t2-', 'book-b': 'bs-t3-' };
    const groups = { 'book-r': ['book-r1', 'book-r2', 'book-r3', 'book-r4'], 'book-g': ['book-g1', 'book-g2', 'book-g3', 'book-g4'], 'book-b': ['book-b1', 'book-b2', 'book-b3', 'book-b4'] };
    const homes = [
      ['mug-a', 'mug'], ['mug-b', 'mug'], ['mug-c', 'mug'], ['mug-d', 'mug'],
      ['cushion-a', 'cushion'], ['cushion-b', 'cushion'], ['cushion-c', 'cushion'], ['cushion-d', 'cushion'],
      ['shoe-a', 'shoe'], ['shoe-b', 'shoe'], ['shoe-c', 'shoe'], ['shoe-d', 'shoe'],
      ['towel-a', 'towel'], ['towel-b', 'towel'], ['towel-c', 'towel'], ['towel-d', 'towel'],
    ];
    for (const [id, cat] of homes) {
      const slotId = await nextFreeSlot(cat);
      check(slotId !== null, `free home slot for ${id}`);
      await dragToSlot(page, id, slotId);
      const loc = await locOf(page, id);
      check(loc.kind === 'slot', `${id} placed (${loc.kind})`);
    }
    for (const [prefix, tier] of Object.entries(tiers)) {
      for (const [i, id] of groups[prefix].entries()) {
        await dragToSlot(page, id, `${tier}s${i + 1}`);
        const loc = await locOf(page, id);
        check(loc.kind === 'slot' && loc.slotId === `${tier}s${i + 1}`, `${id} → ${tier}s${i + 1} (${loc.kind}:${loc.slotId ?? ''})`);
      }
    }
    const finalProgress = await progress(page);
    check(finalProgress.placed === 28, `all 28 placed (got ${finalProgress.placed})`);
    const complete = await page.evaluate(() => window.__cozy.game.isComplete());
    check(complete, 'game reports completion (tidy-all + all three collections)');
    await page.waitForTimeout(1100);
    const doneVisible = await page.isVisible('#doneWrap .done-card');
    check(doneVisible, '"Home, at last." card appears');
    const doneText = await page.textContent('.done-card h2');
    check((doneText ?? '').includes('Home, at last'), 'card headline present');
    await page.screenshot({ path: `${SHOTS}/e2e-3-complete.png` });

    console.log('C) Reset (same seeded layout) + New Mess (different layout, chips clear)');
    await page.click('#btnReset');
    await page.waitForTimeout(400);
    check((await progress(page)).placed === 0, 'reset clears progress');
    const resetHud = (await page.textContent('.hud-progress') ?? '').replace(/\s+/g, '');
    check(resetHud === '0/28', `HUD back to 0/28 (got ${resetHud})`);
    const cardGone = await page.isHidden('#doneWrap');
    check(cardGone, 'completion card hidden after reset');
    const afterReset = await page.evaluate(() => {
      const g = window.__cozy.game;
      return g.items.map((i) => JSON.parse(JSON.stringify(g.locationOf(i.id))));
    });
    check(JSON.stringify(initialLayout) === JSON.stringify(afterReset),
      'Reset replays the same seed (identical layout)');
    const chipsAfterReset = await page.evaluate(() =>
      [...document.querySelectorAll('.chip')].map((c) => c.classList.contains('on')));
    check(chipsAfterReset.every((v) => v === false), 'collection chips un-filled after reset');

    const seedBefore = await page.evaluate(() => window.__cozy.game.currentSeed);
    await page.click('#btnMess');
    await page.waitForTimeout(500);
    const seedAfter = await page.evaluate(() => window.__cozy.game.currentSeed);
    check(seedAfter !== seedBefore, 'New Mess draws a fresh seed');
    const afterMess = await page.evaluate(() => {
      const g = window.__cozy.game;
      return g.items.map((i) => JSON.parse(JSON.stringify(g.locationOf(i.id))));
    });
    check(JSON.stringify(afterReset) !== JSON.stringify(afterMess), 'New Mess produces a different layout');
    const chipsAfterMess = await page.evaluate(() =>
      [...document.querySelectorAll('.chip')].map((c) => c.classList.contains('on')));
    check(chipsAfterMess.every((v) => v === false), 'chips cleared after New Mess');
    await page.screenshot({ path: `${SHOTS}/e2e-4-newmess.png` });
    await page.close();
  }

  // -------------------------------------------------------------------------
  console.log('D) collections by real drags (3 green + 1 red silent; 4th green chimes; put-back quiet; mute gate)');
  {
    const page = await openPage(true);
    const lastSfx = () => page.evaluate(() => window.__cozy.lastSfx);
    const status = (id) => page.evaluate((cid) => window.__cozy.game.collectionStatus().find((c) => c.id === cid), id);
    const tierFxCount = () => page.evaluate(() => document.querySelectorAll('.tier-fx').length);

    await dragToSlot(page, 'book-g1', 'bs-t2-s1');
    await dragToSlot(page, 'book-g2', 'bs-t2-s2');
    await dragToSlot(page, 'book-g3', 'bs-t2-s3');
    await dragToSlot(page, 'book-r1', 'bs-t2-s4');
    const mixed = await status('col-green');
    check(mixed.complete === false, '3 green + 1 red on one tier: green NOT complete (no feedback anywhere)');
    const sfxMixed = await lastSfx();
    check(!sfxMixed.some((e) => e.sfx === 'collection'), 'no chime on the mixed tier');
    check((await tierFxCount()) === 0, 'no tier animation on the mixed tier');

    await dragToSurface(page, 'book-r1', 7.8, 0.36, 0.96); // intruder → counter
    check((await status('col-green')).complete === false, 'green still incomplete (3 grouped)');
    await dragToSlot(page, 'book-g4', 'bs-t2-s4');
    const green = await status('col-green');
    check(green.complete === true && green.tierId === 'bs-tier-2', `green completes on tier 2 (${JSON.stringify(green)})`);
    await page.waitForTimeout(400);
    const chimes = (await lastSfx()).filter((e) => e.sfx === 'collection');
    check(chimes.length === 1 && chimes[0].muted === false, `exactly one unmuted chime (got ${chimes.length})`);
    check((await tierFxCount()) >= 1, 'tier animation rendered');
    await page.screenshot({ path: `${SHOTS}/e2e-5-tier-fx.png` });
    await page.waitForTimeout(1600);

    console.log('D2) put-back does not re-chime (Q2)');
    const before = (await lastSfx()).filter((e) => e.sfx === 'collection').length;
    await dragToSlot(page, 'book-g4', 'bs-t2-s4');
    const loc = await locOf(page, 'book-g4');
    check(loc.kind === 'slot' && loc.slotId === 'bs-t2-s4', `straight back into the same slot`);
    check((await status('col-green')).complete === true, 'green still complete after the put-back');
    const after = (await lastSfx()).filter((e) => e.sfx === 'collection').length;
    check(after === before, `no chime replay on put-back (before ${before}, after ${after})`);
    check((await tierFxCount()) === 0, 'no new tier animation on put-back');

    console.log('D3) mute gate');
    await page.click('#btnMute');
    await page.waitForTimeout(150);
    await dragToSlot(page, 'book-r1', 'bs-t1-s1');
    await dragToSlot(page, 'book-r2', 'bs-t1-s2');
    await dragToSlot(page, 'book-r3', 'bs-t1-s3');
    await dragToSlot(page, 'book-r4', 'bs-t1-s4');
    const red = await status('col-red');
    check(red.complete === true && red.tierId === 'bs-tier-1', `red completes on tier 1 while muted (${JSON.stringify(red)})`);
    await page.waitForTimeout(400);
    const mutedChimes = (await lastSfx()).filter((e) => e.sfx === 'collection' && e.muted === true);
    check(mutedChimes.length === 1, `chime call recorded with muted=true (got ${mutedChimes.length})`);
    check(await page.getAttribute('#btnMute', 'aria-pressed') === 'true', 'mute toggle aria-pressed=true');
    await page.click('#btnMute');
    await page.close();
  }

  // -------------------------------------------------------------------------
  console.log('E) completion on a different tier in a second run (interchangeable tiers)');
  {
    const page = await openPage(true); // same seed → same layout
    for (const [id, slot] of [['mug-a', 'rk1'], ['cushion-a', 'sf1'], ['shoe-a', 'mt1'], ['towel-a', 'ls1']]) {
      await dragToSlot(page, id, slot);
    }
    // greens on tier 4 this run (tier 4 is empty in the winning arrangement)
    for (const [id, slot] of [['book-g1', 'bs-t4-s1'], ['book-g2', 'bs-t4-s2'], ['book-g3', 'bs-t4-s3'], ['book-g4', 'bs-t4-s4']]) {
      await dragToSlot(page, id, slot);
    }
    const green = await page.evaluate(() => window.__cozy.game.collectionStatus().find((c) => c.id === 'col-green'));
    check(green.complete === true && green.tierId === 'bs-tier-4', `green completes on tier 4 in the second run (${JSON.stringify(green)})`);
    await page.close();
  }

  // -------------------------------------------------------------------------
  console.log('F) drag-lifecycle zero-invocation of collectionStatus (preview isolation, browser half)');
  {
    const page = await openPage(true);
    await page.evaluate(() => {
      const g = window.__cozy.game;
      window.__invocations = 0;
      const orig = g.collectionStatus.bind(g);
      g.collectionStatus = (...a) => { window.__invocations++; return orig(...a); };
    });
    // full drag lifecycle with real pointer events; the counter resets after the
    // pickup — the PREVIEW window (moves + ghost) must stay at zero, and the
    // commit consumer (chip refresh) may only read the snapshot after release
    {
      const { fromZ, ax, ay, az } = await page.evaluate(([id, sid]) => {
        const g = window.__cozy.game;
        const loc = g.locationOf(id);
        let fromZ = 0;
        if (loc.kind === 'slot') fromZ = g.slotById(loc.slotId).anchor.z;
        else if (loc.kind === 'surface') fromZ = g.level.surfaces.find((s) => s.id === loc.surfaceId).topZ;
        for (const z of g.level.zones) {
          const s = z.slots.find((s) => s.id === sid);
          if (s) return { fromZ, ax: s.anchor.x, ay: s.anchor.y, az: s.anchor.z };
        }
        return { fromZ: 0, ax: 0, ay: 0, az: 0 };
      }, ['book-r2', 'bs-t1-s1']);
      const from = await page.evaluate((id) => window.__cozy.itemClientPos(id), 'book-r2');
      const to = await clientOf(page, ax + LIFT - az - fromZ, ay + LIFT - az - fromZ);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.evaluate(() => { window.__invocations = 0; });
      await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
      await page.mouse.move(to.x, to.y, { steps: 10 });
      await page.waitForTimeout(90);
      const previewCount = await page.evaluate(() => window.__invocations);
      check(previewCount === 0, `collectionStatus invoked 0 times across the preview window (got ${previewCount})`);
      await page.mouse.up();
      await page.waitForTimeout(430);
      const commitCount = await page.evaluate(() => window.__invocations);
      check(commitCount >= 1, `the commit consumer reads the committed snapshot after release (got ${commitCount})`);
    }
    // the chips still render after the commit (they consume the committed snapshot)
    const chips = await page.evaluate(() => [...document.querySelectorAll('.chip')].length);
    check(chips === 3, `3 collection chips rendered (got ${chips})`);
    await page.close();
  }

  // -------------------------------------------------------------------------
  console.log('G) drag lines up after viewport resize');
  {
    const page = await openPage(true);
    await page.setViewportSize({ width: 960, height: 700 });
    await page.waitForTimeout(250);
    await dragToSlot(page, 'mug-a', 'rk1');
    const afterResize = await locOf(page, 'mug-a');
    check(afterResize.kind === 'slot' && afterResize.slotId === 'rk1', `mug placed after resize (${afterResize.kind})`);
    check((await progress(page)).placed === 1, 'progress 1 after resize drag');
    await page.screenshot({ path: `${SHOTS}/e2e-6-resized.png` });
    await page.close();
  }

  if (errors.length) {
    failures++;
    console.error('browser errors:', errors.join(' | '));
  } else {
    console.log('  ok: no console/page errors across all pages');
  }

  await browser.close();
  if (failures) {
    console.error(`E2E FAILED with ${failures} failing check(s)`);
    process.exit(1);
  }
  console.log('E2E PASSED');
})();
