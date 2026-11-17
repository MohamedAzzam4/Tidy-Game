/*
 * Tide & Tidy — end-to-end playthrough with REAL pointer drags (Playwright mouse + CDP touch).
 * The page is never driven through game-state mutation: window.__tide is read-only
 * (positions + counters + the sfx log); the one write-ish call, newDelivery(seed),
 * mirrors clicking "New delivery" and is used only where determinism is asserted.
 *
 * Sections:
 *   A. seeded load: self-checks, HUD, title flow keeps the seeded world
 *   B. full mouse playthrough (greenery + every fish bag) → completion card + stats
 *   C. recovery: counter drop re-bags; wrong layer → misplaced → scooped back out
 *   D. Wide Net: lasso sweep scoops several same-species bags at once (staggered plops)
 *   E. seeds: same seed = same layout, different seeds differ; 12-seed sweep all valid
 *   F. touch: phone viewport + CDP touch events drive a full completion; no page scroll
 *   G. resize mid-session drag accuracy; mute gate via sfx log
 *   H. zero console/page errors; screenshots archived
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:8081/games/tide-and-tidy/';
const SHOTS = process.env.SHOTS || '/tmp/shots-tide';
const SEED = process.env.E2E_SEED || '11';

let failures = 0;
const errors = [];
function check(cond, msg) {
  if (cond) console.log('  ok:', msg);
  else { failures++; console.error('  FAIL:', msg); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  require('fs').mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();

  const openPage = async (opts = {}, withSeed = true) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(withSeed ? `${BASE}?seed=${SEED}` : BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    return { ctx, page };
  };
  const start = async (page) => { await page.click('#btnStart'); await page.waitForTimeout(250); };

  /* real mouse drag from a bag to a point */
  const dragMouse = async (page, from, to, opts = {}) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.waitForTimeout(opts.hold ?? 120);
    if (opts.shot) await page.screenshot({ path: `${SHOTS}/${opts.shot}` });
    await page.mouse.up();
    await page.waitForTimeout(opts.after ?? 600);
  };
  const dragBagToBand = async (page, bagId, bandId, opts = {}) => {
    const from = await page.evaluate((id) => window.__tide.itemClientPos(id), bagId);
    const to = await page.evaluate((id) => window.__tide.bandDropPoint(id), bandId);
    await dragMouse(page, from, to, opts);
  };
  const state = (page) => page.evaluate(() => window.__tide.state());
  const bags = (page) => page.evaluate(() => window.__tide.bags());

  /* ------------------------------------------------------------------ */
  console.log('A) seeded load, self-checks, title flow');
  {
    const { ctx, page } = await openPage();
    const sc = await page.evaluate(() => window.__tide.selfChecks());
    check(sc.fails.length === 0, `generation self-checks pass (fails: ${sc.fails.join('; ') || 'none'})`);
    check(sc.bagCount === sc.totalFish + (await page.evaluate(() => window.__tide.state().decorTotal)),
      `bag count = fish + decor (${sc.bagCount})`);
    const seedBefore = (await state(page)).seed;
    await start(page);
    const seedAfter = (await state(page)).seed;
    check(seedBefore === seedAfter, `Start keeps the seeded world (${seedBefore})`);
    check((await state(page)).placed === 0, 'progress starts at 0');
    check(await page.isVisible('#goalTitle'), 'goal card visible');
    await page.screenshot({ path: `${SHOTS}/A-initial.png` });
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('B) full mouse playthrough → completion');
  {
    const { ctx, page } = await openPage();
    await start(page);
    const all = await bags(page);
    const decor = all.filter(b => b.kind === 'decor');
    const fish = all.filter(b => b.kind === 'fish');
    // greenery first (free placement, teaches the drag)
    for (const b of decor) {
      const from = await page.evaluate((id) => window.__tide.itemClientPos(id), b.id);
      const to = await page.evaluate((id) => window.__tide.bandDropPoint(id), 'floor');
      await dragMouse(page, from, { x: to.x, y: to.y });
    }
    let st = await state(page);
    check(st.decorPlaced === decor.length, `all greenery rooted (${st.decorPlaced}/${decor.length})`);

    for (const b of fish) {
      const band = await page.evaluate((id) => window.__tide.bags().find(x => x.id === id).band, b.id);
      await dragBagToBand(page, b.id, band, { shot: b.id === fish[0].id ? 'B-first-drag.png' : undefined });
    }
    st = await state(page);
    check(st.placed === st.total, `every fish placed (${st.placed}/${st.total})`);
    check(st.phase === 'complete', 'game reports completion');
    await page.screenshot({ path: `${SHOTS}/B-complete-tank.png` });
    await sleep(7600); // parade + lamp, then the card
    const doneVisible = await page.isVisible('#doneOverlay .card');
    check(doneVisible, 'completion card appears');
    const statsTxt = await page.textContent('#doneStats');
    check(/fish placed/.test(statsTxt) && /species schooled/.test(statsTxt), `stats card filled (${statsTxt.replace(/\s+/g, ' ').trim().slice(0, 80)})`);
    await page.screenshot({ path: `${SHOTS}/B-done-card.png` });
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('C) recovery: counter drop re-bags, wrong layer scooped back, no penalty');
  {
    const { ctx, page } = await openPage();
    await start(page);
    const all = await bags(page);
    const bag = all.find(b => b.kind === 'fish');
    const wrongBand = bag.band === 'surface' ? 'mid' : 'surface';

    // C1: drop on the counter → the bag returns exactly where it was
    const before = await bags(page);
    const from = await page.evaluate((id) => window.__tide.itemClientPos(id), bag.id);
    const layout = await page.evaluate(() => window.__tide.layout());
    await dragMouse(page, from, { x: (layout.bagsAreaL + layout.bagsAreaR) / 2, y: (layout.bagsAreaT + layout.bagsAreaB) / 2 });
    let st = await state(page);
    check(st.placed === 0 && st.carried === 0, 'counter drop: nothing placed, nothing carried');
    const after = await bags(page);
    const sameSpot = after.find(b => b.id === bag.id);
    const beforeBag = before.find(b => b.id === bag.id);
    check(sameSpot && !sameSpot.gone && Math.abs(sameSpot.x - beforeBag.x) < 1 && Math.abs(sameSpot.y - beforeBag.y) < 1,
      'bag restored at its exact spot');

    // C2: wrong layer → misplaced (visible, unhurt), then scooped back out
    await dragBagToBand(page, bag.id, wrongBand);
    st = await state(page);
    check(st.misplaced === 1 && st.placed === 0, `wrong layer: fish misplaced, not counted (${JSON.stringify(st)})`);
    const misplaced = await page.evaluate(() => window.__tide.misplacedFish());
    check(misplaced.length === 1, 'misplaced fish exposed and catchable');
    await page.screenshot({ path: `${SHOTS}/C-misplaced.png` });
    const to = await page.evaluate((id) => window.__tide.bandDropPoint(id), bag.band);
    await dragMouse(page, { x: misplaced[0].x, y: misplaced[0].y }, to, { after: 800 });
    st = await state(page);
    check(st.misplaced === 0 && st.placed === 1, `scooped back and re-homed (${st.placed} placed, ${st.misplaced} misplaced)`);

    // C3: mute gate — sfx logged muted while silent
    await page.click('#btnMute');
    const bag2 = (await bags(page)).find(b => b.kind === 'fish' && !b.gone);
    await dragBagToBand(page, bag2.id, bag2.band);
    const sfx = await page.evaluate(() => window.__tide.sfx());
    const plops = sfx.filter(e => e.name === 'plop');
    const lastPlop = plops[plops.length - 1];
    check(lastPlop && lastPlop.muted === true, `plop recorded muted while muted (${plops.length} total, last muted=${lastPlop && lastPlop.muted})`);
    check(await page.getAttribute('#btnMute', 'aria-pressed') === 'true', 'mute toggle aria-pressed=true');
    await page.click('#btnMute');
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('D) Wide Net: one continuous sweep nets a species mid-drag, staggered plops land');
  {
    const { ctx, page } = await openPage();
    await start(page);
    // place 4 fish one by one → Wide Net unlocks
    const singles = (await bags(page)).filter(b => b.kind === 'fish').slice(0, 4);
    for (const b of singles) await dragBagToBand(page, b.id, b.band);
    let st = await state(page);
    check(st.skills.widenet === true, `Wide Net unlocked at ${st.placed} placements`);

    // sweep anchor: an empty counter spot at the bottom of the bag area
    const layout = await page.evaluate(() => window.__tide.layout());
    const remaining = (await bags(page)).filter(b => b.kind === 'fish' && !b.gone);
    const ax = (layout.bagsAreaL + layout.bagsAreaR) / 2;
    const ay = layout.bagsAreaB - 12;
    const clear = remaining.every(b => Math.hypot(b.x - ax, b.y - ay) > layout.bagBase * 0.65);
    check(clear, 'sweep anchor is an empty counter spot');

    // the game's rule, mirrored: nearest fish bag to the anchor locks the species;
    // the sweep catches up to 5 of that species inside the final radius
    const nearest = remaining.slice().sort((x, y) =>
      Math.hypot(x.x - ax, x.y - ay) - Math.hypot(y.x - ax, y.y - ay))[0];
    const to = await page.evaluate((id) => window.__tide.bandDropPoint(id), nearest.band);
    const R = Math.hypot(to.x - ax, to.y - ay);
    const expected = Math.min(5, remaining.filter(b => b.speciesId === nearest.speciesId && Math.hypot(b.x - ax, b.y - ay) <= R).length);
    check(expected >= 2, `the sweep will net >=2 of one species (${expected})`);

    // one continuous gesture: down at the anchor, sweep up through the bags, into the water, release
    await page.mouse.move(ax, ay);
    await page.mouse.down();
    await page.mouse.move((ax + to.x) / 2, (ay + to.y) / 2, { steps: 6 });
    await page.screenshot({ path: `${SHOTS}/D-lasso.png` });
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.waitForTimeout(140);
    await page.mouse.up();
    await page.waitForTimeout(500 + expected * 130 + 700);
    st = await state(page);
    check(st.placed === 4 + expected, `staggered placements landed (${st.placed} = 4 + ${expected})`);
    check(st.carried === 0 && st.misplaced === 0, 'net emptied into the water, nothing lost');
    await page.screenshot({ path: `${SHOTS}/D-after-sweep.png` });
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('E) seeds: determinism, variety, 12-seed validity sweep');
  {
    const { ctx, page } = await openPage({}, true);
    const layoutOf = () => page.evaluate(() => JSON.stringify(window.__tide.bags().map(b => [b.id, b.x, b.y, b.band])));
    const l1 = await layoutOf();
    await page.evaluate(() => window.__tide.newDelivery('11'));
    const l2 = await layoutOf();
    check(l1 === l2, 'same seed replays the identical layout');
    await page.evaluate(() => window.__tide.newDelivery('12'));
    const l3 = await layoutOf();
    check(l3 !== l1, 'different seed produces a different layout');
    await ctx.close();

    for (let s = 1; s <= 12; s++) {
      const { ctx: c2, page: p2 } = await openPage({}, false);
      await p2.goto(`${BASE}?seed=${s}`, { waitUntil: 'networkidle' });
      await p2.waitForTimeout(250);
      const res = await p2.evaluate(() => {
        const t = window.__tide;
        return { fails: t.selfChecks().fails, bands: t.bandInfo(), bagList: t.bags() };
      });
      const bad = res.bagList.filter(b => b.kind === 'fish' && !['surface', 'mid', 'floor'].includes(b.band)).length;
      const under = res.bands.filter(b => b.total < 3).map(b => `${b.id}:${b.total}`);
      check(res.fails.length === 0 && bad === 0 && under.length === 0,
        `seed ${s}: valid, solvable, readable (fish ${res.bands.reduce((a, b) => a + b.total, 0)}, understocked: ${under.join(',') || 'none'})`);
      await c2.close();
    }
  }

  /* ------------------------------------------------------------------ */
  console.log('F) touch: phone viewport, CDP touch events, full completion, no scroll');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('touch pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('touch console: ' + m.text()); });
    await page.goto(`${BASE}?seed=${SEED}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.tap('#btnStart');
    await page.waitForTimeout(250);
    const cdp = await ctx.newCDPSession(page);
    const touchDrag = async (from, to) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to.x, y: to.y }] });
      await sleep(90);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(600);
    };
    const all = await bags(page);
    for (const b of all.filter(x => x.kind === 'decor')) {
      const from = await page.evaluate((id) => window.__tide.itemClientPos(id), b.id);
      const to = await page.evaluate(() => window.__tide.bandDropPoint('floor'));
      await touchDrag(from, to);
    }
    let st = await state(page);
    check(st.decorPlaced >= 1, `touch: greenery rooted on a phone (${st.decorPlaced})`);
    await page.screenshot({ path: `${SHOTS}/F-phone-mid.png` });
    const fish = all.filter(x => x.kind === 'fish');
    for (const b of fish) {
      const from = await page.evaluate((id) => window.__tide.itemClientPos(id), b.id);
      const to = await page.evaluate((id) => window.__tide.bandDropPoint(id), b.band);
      await touchDrag(from, to);
    }
    st = await state(page);
    check(st.placed === st.total, `touch: full completion by touch drags (${st.placed}/${st.total})`);
    check(st.phase === 'complete', 'touch: completion phase reached');
    const scrolled = await page.evaluate(() => window.scrollY + document.documentElement.scrollTop);
    check(scrolled === 0, `touch: page never scrolled (${scrolled})`);
    await sleep(7600);
    check(await page.isVisible('#doneOverlay .card'), 'touch: completion card appears');
    await page.screenshot({ path: `${SHOTS}/F-phone-done.png` });
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('G) resize mid-session, drag still lands');
  {
    const { ctx, page } = await openPage();
    await start(page);
    const bag = (await bags(page)).find(b => b.kind === 'fish');
    await dragBagToBand(page, bag.id, bag.band);
    await page.setViewportSize({ width: 980, height: 640 });
    await page.waitForTimeout(300);
    const bag2 = (await bags(page)).find(b => b.kind === 'fish' && !b.gone);
    await dragBagToBand(page, bag2.id, bag2.band);
    const st = await state(page);
    check(st.placed === 2, `drag accuracy after resize (${st.placed} placed)`);
    await page.screenshot({ path: `${SHOTS}/G-resized.png` });
    await ctx.close();
  }

  if (errors.length) {
    failures++;
    console.error('browser errors:', errors.join(' | ').slice(0, 600));
  } else {
    console.log('  ok: no console/page errors across all pages');
  }
  await browser.close();
  if (failures) { console.error(`E2E FAILED with ${failures} failing check(s)`); process.exit(1); }
  console.log('E2E PASSED');
})();
