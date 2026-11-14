/*
 * End-to-end playthrough with REAL pointer drags (Playwright mouse events):
 *   1. drag a book to the wrong zone (entry mat)  → item returns to start
 *   2. drag the same book to its bookshelf        → ghost preview, placed
 *   3. drag the remaining 11 items home           → level completes
 *   4. completion card + warm FX appear
 *   5. Reset button restores the scattered state
 *   6. resize the viewport, drag another item     → drop still lines up
 * The page is never driven through game-state mutation; the debug hook is
 * used read-only (positions + rule queries).
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3000/';
const SHOTS = process.env.SHOTS || '/tmp/shots';

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
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const items = await page.locator('[data-item-id]').count();
  check(items === 12, `12 movable items rendered (got ${items})`);
  const hud0 = (await page.textContent('.hud-progress') ?? '').replace(/\s+/g, '');
  check(hud0 === '0/12', `HUD starts at 0/12 (got ${hud0})`);

  /** Real mouse drag from the item's current position to a world point. */
  const dragTo = async (itemId, wx, wy, wz = 0) => {
    const from = await page.evaluate((id) => window.__cozy.itemClientPos(id), itemId);
    const to = await page.evaluate(([x, y, z]) => window.__cozy.clientFromWorld(x, y, z), [wx, wy, wz]);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.waitForTimeout(90);
    await page.mouse.up();
    await page.waitForTimeout(430);
  };

  const locOf = (id) => page.evaluate((id2) => JSON.parse(JSON.stringify(window.__cozy.game.locationOf(id2))), id);
  const progress = () => page.evaluate(() => window.__cozy.game.progress());

  console.log('1) wrong-zone drag (book → entry mat)');
  const bookStart = await locOf('book-a');
  await dragTo('book-a', 1.6, 6.95); // entry mat center — wrong category
  const afterWrong = await locOf('book-a');
  check(afterWrong.kind === 'floor', `book stays on the floor (got ${afterWrong.kind})`);
  check(
    Math.abs(afterWrong.x - bookStart.x) < 0.01 && Math.abs(afterWrong.y - bookStart.y) < 0.01,
    `book returned to its start position (${afterWrong.x}, ${afterWrong.y})`,
  );
  check((await progress()).placed === 0, 'progress still 0 after invalid drop');

  console.log('2) right-zone drag (book → bookshelf, ghost expected)');
  const from = await page.evaluate(() => window.__cozy.itemClientPos('book-a'));
  const shelf = await page.evaluate(() => window.__cozy.clientFromWorld(0.3, 1.78, 0.68));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(shelf.x, shelf.y, { steps: 14 });
  await page.waitForTimeout(140);
  const ghosts = await page.evaluate(() => [...document.querySelectorAll('.ghost.on')].map((g) => g.getAttribute('data-slot')));
  check(ghosts.length === 1, `exactly one ghost preview mid-drag (got [${ghosts}])`);
  await page.screenshot({ path: `${SHOTS}/e2e-1-ghost.png` });
  await page.mouse.up();
  await page.waitForTimeout(430);
  const afterRight = await locOf('book-a');
  check(afterRight.kind === 'slot', `book placed on a shelf slot (got ${afterRight.kind})`);
  check((await progress()).placed === 1, 'progress 1 after valid drop');
  const hud1 = (await page.textContent('.hud-progress') ?? '').replace(/\s+/g, '');
  check(hud1 === '1/12', `HUD shows 1/12 (got ${hud1})`);

  console.log('3) placing the remaining 11 items (real drags)');
  for (const id of ['mug-a', 'mug-b', 'mug-c', 'cushion-a', 'cushion-b', 'shoe-a', 'shoe-b', 'towel-a', 'towel-b', 'book-b', 'book-c']) {
    const target = await page.evaluate((cat) => {
      const g = window.__cozy.game;
      const zone = g.level.zones.find((z) => z.category === cat);
      const slot = zone.slots.find((s) => !g.occupantOf(s.id));
      return slot ? { x: slot.anchor.x, y: slot.anchor.y, z: slot.anchor.z } : null;
    }, id.split('-')[0] === 'book' ? 'book' : id.split('-')[0]);
    if (!target) { check(false, `no free slot for ${id}`); continue; }
    await dragTo(id, target.x, target.y, target.z);
    const loc = await locOf(id);
    if (loc.kind !== 'slot') {
      const diag = await page.evaluate(([itemId]) => {
        const from = window.__cozy.itemClientPos(itemId);
        return {
          held: window.__cozy.game.heldItem,
          loc: window.__cozy.game.locationOf(itemId),
          stack: document.elementsFromPoint(from.x, from.y).slice(0, 4).map((e) =>
            (e.getAttribute('class') ?? e.tagName) + '@' + (e.closest('[data-item-id]')?.getAttribute('data-item-id') ?? '-')),
          ghosts: [...document.querySelectorAll('.ghost.on')].map((g) => g.getAttribute('data-slot')),
        };
      }, [id]);
      console.error('    diag:', JSON.stringify(diag));
    }
    check(loc.kind === 'slot', `${id} placed (${loc.kind})`);
  }
  const finalProgress = await progress();
  check(finalProgress.placed === 12, `all 12 placed (got ${finalProgress.placed})`);
  const complete = await page.evaluate(() => window.__cozy.game.isComplete());
  check(complete, 'game reports completion');

  console.log('4) completion presentation');
  await page.waitForTimeout(1100);
  const doneVisible = await page.isVisible('#doneWrap .done-card');
  check(doneVisible, '"Home, at last." card appears');
  const doneText = await page.textContent('.done-card h2');
  check((doneText ?? '').includes('Home, at last'), 'card headline present');
  await page.screenshot({ path: `${SHOTS}/e2e-2-complete.png` });

  console.log('5) reset');
  await page.click('#btnReset');
  await page.waitForTimeout(400);
  check((await progress()).placed === 0, 'reset clears progress');
  const resetHud = (await page.textContent('.hud-progress') ?? '').replace(/\s+/g, '');
  check(resetHud === '0/12', `HUD back to 0/12 (got ${resetHud})`);
  const cardGone = await page.isHidden('#doneWrap');
  check(cardGone, 'completion card hidden after reset');
  const floorCount = await page.evaluate(() =>
    window.__cozy.game.items.filter((i) => window.__cozy.game.locationOf(i.id).kind === 'floor').length);
  check(floorCount === 12, 'all 12 items back on the floor');
  await page.screenshot({ path: `${SHOTS}/e2e-3-reset.png` });

  console.log('6) drag lines up after viewport resize');
  await page.setViewportSize({ width: 960, height: 700 });
  await page.waitForTimeout(250);
  await dragTo('mug-a', 6.9, 0.16, 1.46);
  const afterResize = await locOf('mug-a');
  check(afterResize.kind === 'slot', `mug placed after resize (got ${afterResize.kind})`);
  check((await progress()).placed === 1, 'progress 1 after resize drag');
  await page.screenshot({ path: `${SHOTS}/e2e-4-resized.png` });

  if (errors.length) {
    failures++;
    console.error('browser errors:', errors.join(' | '));
  } else {
    console.log('  ok: no console/page errors');
  }

  await browser.close();
  if (failures) {
    console.error(`E2E FAILED with ${failures} failing check(s)`);
    process.exit(1);
  }
  console.log('E2E PASSED');
})();
