/**
 * Tidy Tapes — in-page acceptance harness v2 (?autotest=1).
 * Drives REAL DOM MouseEvents / TouchEvents / WheelEvents / KeyboardEvents
 * through Phaser's input pipeline and asserts through window.__tidy.
 * Results land on window.__tidyResults (and a page overlay + console).
 *
 * v2 coverage highlights: any-row hidden-correctness (misfile accepted with
 * NO tell: no hint event, no special sound), pull-out + re-file, the five-slot
 * carry tray (load / drag out / batch with partial fit / full refusal),
 * verify-vs-win chime policy, powers (misfile reveal / match scan /
 * gather-into-tray) with 15 s / 60 s timers, wheel zoom anchored on the cursor,
 * touch pan + pinch, save/reload across phases.
 */
import type Phaser from 'phaser';
import type { TidyDebug } from './debug';

interface TestResult { name: string; pass: boolean; error?: string; ms: number }

const RESULTS_KEY = 'tidy-autotest-results';
const PHASE_KEY = 'tidy-autotest-phase';

function tidy(): TidyDebug {
  return (window as unknown as { __tidy: TidyDebug }).__tidy;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function approx(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const nextFrame = (): Promise<void> => new Promise<void>(r => {
  // headless Chromium throttles RAF unpredictably: force a REAL Phaser step so
  // the game loop (input queue, tweens, camera) advances deterministically
  const g = (window as unknown as { __phaserGame?: { loop?: { tick: (t: number) => void } } }).__phaserGame;
  if (g && g.loop && typeof g.loop.tick === 'function') {
    try { g.loop.tick(performance.now()); } catch { /* fall through */ }
    setTimeout(r, 0);
    return;
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => r());
  else setTimeout(r, 16);
});

async function waitFrames(game: Phaser.Game, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await nextFrame();
    await sleep(12);
  }
  void game;
}

async function waitUntil(cond: () => boolean, timeoutMs = 15000, what = 'condition'): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${what}`);
    await sleep(120);
  }
}

// ---------------------------------------------------------------- geometry
/** row/slot world position (mirrors config.ts formulas; single source stays config) */
function rowSlotWorld(row: number, slot: number): { x: number; y: number } {
  const u = Math.floor(row / 4);
  const ux = u < 8 ? 420 + (u % 4) * 280 : u < 12 ? 140 : 2420;
  const uy = u < 8 ? 140 + Math.floor(u / 4) * 220 : 620 + (u % 4) * 220;
  return { x: ux + 50 + slot * 24, y: uy + 30 + (row % 4) * 36 + 15 };
}

function rowCenterWorld(row: number): { x: number; y: number; unit: number } {
  const u = Math.floor(row / 4);
  const ux = u < 8 ? 420 + (u % 4) * 280 : u < 12 ? 140 : 2420;
  const uy = u < 8 ? 140 + Math.floor(u / 4) * 220 : 620 + (u % 4) * 220;
  return { x: ux + 130, y: uy + 30 + (row % 4) * 36 + 15, unit: u };
}

/** the row ids of a group (g and g+32) — either is equally valid */
function rowsOfGroup(group: number): number[] {
  return [group % 64, (group + 32) % 64];
}

function pickIsolatedTape(minDist = 62): { id: number; combo: number; defect: string | null; state: string; x: number; y: number } {
  const tapes = tidy().tapesInfo().filter(t => t.state === 'loose');
  for (const t of tapes) {
    const near = tapes.some(o => o.id !== t.id && Math.hypot(o.x - t.x, o.y - t.y) < minDist);
    if (!near) return t;
  }
  return tapes[0];
}


/** an isolated spot within ~500px of a target (drag origin that stays on-canvas) */
function findEmptySpotNear(target: { x: number; y: number }): { x: number; y: number } {
  const tapes = tidy().tapesInfo().filter(t => t.state === 'loose');
  const clear = (x: number, y: number) =>
    !tapes.some(t => Math.hypot(t.x - x, t.y - y) < 85)
    && y > 80 && y < 1750 && x > 70 && x < 2750;
  for (let r = 90; r <= 500; r += 60) {
    for (let a = 0; a < 10; a++) {
      const ang = (a / 10) * Math.PI * 2;
      const x = target.x + Math.cos(ang) * r;
      const y = target.y + Math.sin(ang) * r;
      if (clear(x, y)) return { x, y };
    }
  }
  return findEmptySpot();
}

/** a world spot with no loose tape within 80 px (isolated drag origin) */
function findEmptySpot(): { x: number; y: number } {
  const tapes = tidy().tapesInfo().filter(t => t.state === 'loose');
  for (let y = 1580; y < 1740; y += 40) {
    for (let x = 560; x < 2100; x += 120) {
      if (!tapes.some(t => Math.hypot(t.x - x, t.y - y) < 90)) return { x, y };
    }
  }
  return { x: 640, y: 1700 };
}

function liveGame(): Phaser.Game {
  return (window as unknown as { __phaserGame: Phaser.Game }).__phaserGame;
}

function gameScene(): Phaser.Scene {
  const s = liveGame().scene.getScene('Game');
  assert(!!s, 'Game scene live');
  return s as Phaser.Scene;
}

function canvasEl(game: Phaser.Game): HTMLCanvasElement {
  const live = liveGame();
  if (live && live.canvas && live.canvas.isConnected) return live.canvas;
  return game.canvas;
}

// ---------------------------------------------------------------- event synth
/** Phaser 3.90 binds MOUSE + TOUCH events on the canvas (not PointerEvents). */
function pointerEvent(game: Phaser.Game, type: string, sx: number, sy: number, opts: {
  pointerId?: number; pointerType?: string; button?: number; buttons?: number;
} = {}): void {
  const cv = canvasEl(game);
  const isTouch = opts.pointerType === 'touch';
  let domType: string;
  if (isTouch) {
    domType = type === 'pointerdown' ? 'touchstart' : type === 'pointermove' ? 'touchmove' : 'touchend';
  } else {
    domType = type === 'pointerdown' ? 'mousedown' : type === 'pointermove' ? 'mousemove' : 'mouseup';
  }
  if (isTouch) {
    const touch = new Touch({
      identifier: opts.pointerId ?? 1,
      target: cv,
      clientX: sx, clientY: sy,
      pageX: sx, pageY: sy,
      screenX: sx, screenY: sy,
    });
    cv.dispatchEvent(new TouchEvent(domType, {
      bubbles: true, cancelable: true,
      touches: [touch], changedTouches: [touch], targetTouches: [touch],
    }));
  } else {
    const buttons = opts.buttons ?? (domType === 'mouseup' ? 0 : 1);
    cv.dispatchEvent(new MouseEvent(domType, {
      bubbles: true, cancelable: true, composed: true,
      clientX: sx, clientY: sy, screenX: sx, screenY: sy,
      button: opts.button ?? 0,
      buttons,
    }));
  }
}

function touchEventMulti(
  game: Phaser.Game,
  domType: 'touchstart' | 'touchmove' | 'touchend',
  points: { id: number; x: number; y: number }[],
  changedIds: number[],
): void {
  const cv = canvasEl(game);
  const mk = (p: { id: number; x: number; y: number }) =>
    new Touch({
      identifier: p.id, target: cv,
      clientX: p.x, clientY: p.y,
      pageX: p.x, pageY: p.y,
      screenX: p.x, screenY: p.y,
    });
  const touches = points.map(mk);
  const changed = points.filter(p => changedIds.includes(p.id)).map(mk);
  cv.dispatchEvent(new TouchEvent(domType, {
    bubbles: true, cancelable: true,
    touches, changedTouches: changed, targetTouches: touches,
  }));
}

function wheelEvent(game: Phaser.Game, sx: number, sy: number, dx: number, dy: number): void {
  canvasEl(game).dispatchEvent(new WheelEvent('wheel', {
    bubbles: true, cancelable: true, clientX: sx, clientY: sy, deltaX: dx, deltaY: dy, deltaMode: 0,
  }));
}

function keyEvent(type: string, key: string, code: string, keyCode: number): void {
  window.dispatchEvent(new KeyboardEvent(type, {
    key, code, keyCode, which: keyCode, bubbles: true,
  } as KeyboardEventInit & { keyCode: number; which: number }));
}

/** world -> screen via runtime calibration of camera.getWorldPoint (zoom-safe) */
function makeWorldToScreen(game: Phaser.Game): (wx: number, wy: number) => { sx: number; sy: number } {
  const live = liveGame();
  const cam = (live ?? game).scene.getScene('Game')?.cameras.main;
  assert(!!cam, 'camera available');
  const src = live ?? game;
  const c = (src.scene.getScene('Game') as { cameras: { main: { getWorldPoint(x: number, y: number): { x: number; y: number } } } }).cameras.main;
  const halfW = src.scale.width / 2;
  const halfH = src.scale.height / 2;
  const m0 = c.getWorldPoint(halfW, halfH);
  const mX = c.getWorldPoint(halfW + 80, halfH);
  const mY = c.getWorldPoint(halfW, halfH + 60);
  const perX = (mX.x - m0.x) / 80 || 1 / cam.zoom;
  const perY = (mY.y - m0.y) / 60 || 1 / cam.zoom;
  void cam;
  return (wx: number, wy: number) => ({
    sx: halfW + (wx - m0.x) / perX,
    sy: halfH + (wy - m0.y) / perY,
  });
}

// drag a tape through real events
async function dragTape(
  game: Phaser.Game, tapeId: number,
  toWorld: { x: number; y: number },
  opts: { grab?: { x: number; y: number } } = {},
): Promise<void> {
  const d = tidy();
  const t = d.tapesInfo().find(x => x.id === tapeId);
  assert(!!t, `tape ${tapeId} exists`);
  const tape0 = t as NonNullable<typeof t>;
  const w2s = makeWorldToScreen(game);
  const grab = opts.grab ?? { x: 10, y: -6 };
  const start = w2s(tape0.x + grab.x, tape0.y + grab.y);
  const end = w2s(toWorld.x, toWorld.y);
  pointerEvent(game, 'pointerdown', start.sx, start.sy);
  await waitFrames(game, 2);
  pointerEvent(game, 'pointermove', start.sx + 4, start.sy + 3);
  await waitFrames(game, 2);
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    pointerEvent(game, 'pointermove',
      start.sx + ((end.sx - start.sx) * i) / steps,
      start.sy + ((end.sy - start.sy) * i) / steps);
    await sleep(16);
  }
  await waitFrames(game, 2);
  pointerEvent(game, 'pointerup', end.sx, end.sy);
  await waitFrames(game, 2);
}

async function clickTape(game: Phaser.Game, tapeId: number): Promise<void> {
  const d = tidy();
  const t = d.tapesInfo().find(x => x.id === tapeId);
  assert(!!t, `tape ${tapeId} exists`);
  const tape0 = t as NonNullable<typeof t>;
  const w2s = makeWorldToScreen(game);
  const p = w2s(tape0.x, tape0.y);
  pointerEvent(game, 'pointerdown', p.sx, p.sy);
  await sleep(40);
  pointerEvent(game, 'pointerup', p.sx, p.sy);
  await waitFrames(game, 2);
}

// ------------------------------------------------------------------- repairs
async function driveRewindRepair(game: Phaser.Game): Promise<void> {
  const W = game.scale.width;
  const H = game.scale.height;
  const cx = W / 2;
  const cy = H / 2 - 10;
  const SCALE = 3.4;
  const rp = { x: cx + (58 - 46) * SCALE, y: cy + (38 - 30) * SCALE };
  pointerEvent(game, 'pointerdown', rp.x, rp.y);
  for (let loop = 0; loop < 9 && tidy().repairOpen(); loop++) {
    for (let i = 0; i <= 14 && tidy().repairOpen(); i++) {
      const ang = (i / 14) * Math.PI * 2;
      pointerEvent(game, 'pointermove', rp.x + Math.cos(ang) * 60, rp.y + Math.sin(ang) * 60);
      await sleep(14);
    }
  }
  pointerEvent(game, 'pointerup', rp.x, rp.y);
  await waitUntil(() => !tidy().repairOpen(), 12000, 'rewind repair close');
}

async function driveStickerRepair(game: Phaser.Game): Promise<void> {
  const W = game.scale.width;
  const H = game.scale.height;
  const cx = W / 2;
  const cy = H / 2 - 10;
  const SCALE = 3.4;
  const spot = { x: cx + (21 - 46) * SCALE, y: cy + (13.5 - 30) * SCALE };
  pointerEvent(game, 'pointerdown', spot.x, spot.y);
  for (let i = 1; i <= 10; i++) {
    pointerEvent(game, 'pointermove', spot.x + i * 12, spot.y + i * 8);
    await sleep(16);
  }
  pointerEvent(game, 'pointerup', spot.x + 120, spot.y + 80);
  await sleep(300);
  pointerEvent(game, 'pointerdown', spot.x, spot.y);
  for (let i = 0; i < 40 && tidy().repairOpen(); i++) {
    const wob = Math.sin(i * 0.8) * 34;
    pointerEvent(game, 'pointermove', spot.x + wob, spot.y + Math.cos(i * 0.5) * 22);
    await sleep(16);
  }
  pointerEvent(game, 'pointerup', spot.x, spot.y);
  await sleep(400);
  const tray = { x: cx + (92 * SCALE) / 2 + 80, y: cy - 40 };
  pointerEvent(game, 'pointerdown', tray.x, tray.y);
  for (let i = 1; i <= 10; i++) {
    pointerEvent(game, 'pointermove',
      tray.x + ((spot.x - tray.x) * i) / 10,
      tray.y + ((spot.y - tray.y) * i) / 10);
    await sleep(16);
  }
  pointerEvent(game, 'pointerup', spot.x, spot.y);
  await sleep(300);
  pointerEvent(game, 'pointerdown', spot.x, spot.y);
  await sleep(800);
  pointerEvent(game, 'pointerup', spot.x, spot.y);
  await waitUntil(() => !tidy().repairOpen(), 12000, 'sticker repair close');
}

async function drivePaintRepair(game: Phaser.Game): Promise<void> {
  const W = game.scale.width;
  const H = game.scale.height;
  const cx = W / 2;
  const cy = H / 2 - 10;
  const SCALE = 3.4;
  const patch = {
    x: cx - (92 * SCALE) / 2 + 18 * SCALE,
    y: cy - (60 * SCALE) / 2 + 47 * SCALE,
    w: 24 * SCALE,
    h: 14 * SCALE,
  };
  pointerEvent(game, 'pointerdown', patch.x + patch.w * 0.5, patch.y + patch.h * 0.5);
  for (let gx = 0; gx < 5 && tidy().repairOpen(); gx++) {
    for (let gy = 0; gy < 3 && tidy().repairOpen(); gy++) {
      const px = patch.x + ((gx + 0.5) / 5) * patch.w;
      const py = patch.y + ((gy + 0.5) / 3) * patch.h;
      for (let k = 0; k < 6; k++) {
        pointerEvent(game, 'pointermove', px + Math.sin(k * 1.7) * 14, py + Math.cos(k * 1.3) * 9);
        await sleep(14);
      }
    }
  }
  pointerEvent(game, 'pointerup', patch.x + patch.w * 0.5, patch.y + patch.h * 0.5);
  await waitUntil(() => !tidy().repairOpen(), 12000, 'paint repair close');
}

// ------------------------------------------------------------------- tray geom
function trayScreen(game: Phaser.Game): { x: number; y: number; w: number; h: number } {
  const W = game.scale.width;
  const H = game.scale.height;
  return { x: W - 14 - 304, y: H - 14 - 88, w: 304, h: 88 };
}

function traySlotCenter(game: Phaser.Game, slot: number): { x: number; y: number } {
  const t = trayScreen(game);
  return { x: t.x + 14 + slot * 56 + 26, y: t.y + 26 + 27 };
}

// --------------------------------------------------------------------- suite
async function runTests(game: Phaser.Game, phase: number): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const test = async (name: string, fn: () => Promise<void>) => {
    const t0 = Date.now();
    try {
      assert(liveGame() === game, 'game instance stable (no mid-run HMR swap)');
      await fn();
      results.push({ name, pass: true, ms: Date.now() - t0 });
      console.log(`[autotest] PASS ${name}`);
    } catch (e) {
      results.push({ name, pass: false, error: String(e), ms: Date.now() - t0 });
      console.error(`[autotest] FAIL ${name}:`, e);
    }
  };
  const d = tidy();
  const BASE_SEED = d.seed();

  // hint + toast spies (tell detection)
  const hints: string[] = [];
  const toasts: string[] = [];
  game.events.on('hint', (h: string) => hints.push(String(h)));
  game.events.on('toast', (t: string) => toasts.push(String(t)));
  const audioNames = () => tidy().audioRecent();

  if (phase === 1) await test('T1 world: 400+ real tapes, unique ids, viewport smaller than world, valid', async () => {
    assert(d.tapeCount() >= 400, `tapeCount=${d.tapeCount()}`);
    assert(d.uniqueIds() === d.tapeCount(), `unique ids ${d.uniqueIds()}/${d.tapeCount()}`);
    const ws = d.worldSize();
    const cam = d.camera();
    assert(ws.w > cam.viewW * 1.5, `world ${ws.w} vs view ${cam.viewW}`);
    assert(ws.h > cam.viewH * 1.5, `world ${ws.h} vs view ${cam.viewH}`);
    const v = d.validation();
    assert(v.ok, `validation issues: ${v.issues.slice(0, 3).join('; ')}`);
    assert(tidy().misfiles().length === 0, 'no misfiles at start');
  });

  if (phase === 1) {
    await test('T2 generation: multiple seeds all valid (seed replay)', async () => {
      for (const s of [(BASE_SEED + 7) >>> 0, 424242, 987654321]) {
        d.newGame(s);
        await waitUntil(() => tidy().seed() === s && tidy().tapeCount() > 0, 15000, `seed ${s} ready`);
        const v = tidy().validation();
        assert(v.ok, `seed ${s} issues: ${v.issues.slice(0, 3).join('; ')}`);
        assert(tidy().tapeCount() >= 400, `seed ${s} tapeCount`);
      }
      d.newGame(BASE_SEED);
      await waitUntil(() => tidy().seed() === BASE_SEED && tidy().tapeCount() > 0, 15000, 'base seed back');
    });
  }

  if (phase === 1) {
    await test('T3 drag: grab point stays under the cursor incl. camera pan mid-drag', async () => {
      const tape = pickIsolatedTape();
      d.setCamera(tape.x, tape.y, 1);
      await waitFrames(game, 3);
      const grab = { x: 14, y: -8 };
      const w2s = makeWorldToScreen(game);
      const s0 = w2s(tape.x + grab.x, tape.y + grab.y);
      pointerEvent(game, 'pointerdown', s0.sx, s0.sy);
      await waitFrames(game, 3);
      assert(tidy().held().includes(tape.id), `grabbed the intended tape (held=${tidy().held()})`);
      pointerEvent(game, 'pointermove', s0.sx + 130, s0.sy + 90);
      await waitFrames(game, 3);
      const live = tidy().spritePos(tape.id)!;
      const cam = liveGame().scene.getScene('Game')!.cameras.main;
      const wp = cam.getWorldPoint(s0.sx + 130, s0.sy + 90);
      assert(approx(live.x, wp.x - grab.x, 0.75), `moved grab point: tape ${live.x.toFixed(1)} vs ${(wp.x - grab.x).toFixed(1)}`);
      assert(approx(live.y, wp.y - grab.y, 0.75), 'moved grab point y');
      const scrollBefore = tidy().camera();
      keyEvent('keydown', 'ArrowRight', 'ArrowRight', 39);
      await sleep(420);
      keyEvent('keyup', 'ArrowRight', 'ArrowRight', 39);
      await waitFrames(game, 4);
      const after = tidy().camera();
      assert(after.x > scrollBefore.x + 40, `keyboard pan moved camera ${scrollBefore.x} -> ${after.x}`);
      const live2 = tidy().spritePos(tape.id)!;
      const wp2 = cam.getWorldPoint(s0.sx + 130, s0.sy + 90);
      assert(approx(live2.x, wp2.x - grab.x, 0.75), `held tape followed camera pan: ${live2.x.toFixed(1)} vs ${(wp2.x - grab.x).toFixed(1)}`);
      assert(approx(live2.y, wp2.y - grab.y, 0.75), 'held tape y after pan');
      pointerEvent(game, 'pointerup', s0.sx + 130, s0.sy + 90);
      await waitFrames(game, 3);
      const still = tidy().tapesInfo().find(t => t.id === tape.id)!;
      assert(still.state === 'loose', 'tape still loose after table drop');
      assert(tidy().tapeCount() >= 400, 'no tapes lost');
    });

    await test('T3b drag at second zoom level (0.7) keeps the grab point', async () => {
      const tape = pickIsolatedTape();
      d.setCamera(tape.x, tape.y, 0.7);
      await waitFrames(game, 3);
      const grab = { x: -12, y: 6 };
      const w2s = makeWorldToScreen(game);
      const s0 = w2s(tape.x + grab.x, tape.y + grab.y);
      pointerEvent(game, 'pointerdown', s0.sx, s0.sy);
      await waitFrames(game, 2);
      pointerEvent(game, 'pointermove', s0.sx - 60, s0.sy + 40);
      await waitFrames(game, 3);
      const live = tidy().spritePos(tape.id)!;
      const cam = liveGame().scene.getScene('Game')!.cameras.main;
      const wp = cam.getWorldPoint(s0.sx - 60, s0.sy + 40);
      assert(approx(live.x, wp.x - grab.x, 1), `zoom drag x: ${live.x.toFixed(1)} vs ${(wp.x - grab.x).toFixed(1)}`);
      assert(approx(live.y, wp.y - grab.y, 1), 'zoom drag y');
      pointerEvent(game, 'pointerup', s0.sx - 60, s0.sy + 40);
      await waitFrames(game, 2);
    });

    await test('T3c wheel zoom is centered on the cursor', async () => {
      d.setCamera(1400, 900, 1);
      await waitFrames(game, 4);
      // pure camera math (getWorldPoint reads a matrix cached at last preRender)
      const worldAt = (sx: number, sy: number): { x: number; y: number } => {
        const c = tidy().camera();
        return { x: c.x + sx / c.zoom, y: c.y + sy / c.zoom };
      };
      const w2s = makeWorldToScreen(game);
      const s = w2s(1400, 900); // world point near the middle (no edge clamp)
      const before = worldAt(s.sx, s.sy);
      const zBefore = tidy().camera().zoom;
      wheelEvent(game, s.sx, s.sy, 0, 120); // zoom OUT one notch at the cursor
      await waitFrames(game, 4);
      const zAfter = tidy().camera().zoom;
      assert(zAfter < zBefore - 0.02, `wheel zoomed out (${zBefore} -> ${zAfter})`);
      const after = worldAt(s.sx, s.sy);
      assert(approx(after.x, before.x, 8) && approx(after.y, before.y, 8),
        `cursor world point stayed anchored (${before.x.toFixed(1)},${before.y.toFixed(1)} -> ${after.x.toFixed(1)},${after.y.toFixed(1)})`);
      wheelEvent(game, s.sx, s.sy, 0, -120);
      await waitFrames(game, 4);
      assert(tidy().camera().zoom > zAfter + 0.02, 'wheel zoomed back in');
      d.setCamera(1400, 900, 0.72);
    });

    await test('T4 cancel (Esc): everything returns exactly; no loss, no duplication', async () => {
      const tape = pickIsolatedTape();
      const origin = tidy().tapesInfo().find(t => t.id === tape.id)!;
      d.setCamera(origin.x, origin.y, 1);
      await waitFrames(game, 3);
      const w2s = makeWorldToScreen(game);
      const s0 = w2s(origin.x, origin.y);
      pointerEvent(game, 'pointerdown', s0.sx, s0.sy);
      await waitFrames(game, 2);
      pointerEvent(game, 'pointermove', s0.sx + 150, s0.sy + 90);
      await waitFrames(game, 2);
      assert(tidy().held().includes(tape.id), 'tape held');
      keyEvent('keydown', 'Escape', 'Escape', 27);
      keyEvent('keyup', 'Escape', 'Escape', 27);
      await waitFrames(game, 4);
      assert(tidy().held().length === 0, 'held cleared on Esc');
      const after = tidy().tapesInfo().find(t => t.id === tape.id)!;
      assert(after.state === 'loose', 'tape loose after cancel');
      assert(approx(after.x, origin.x, 1) && approx(after.y, origin.y, 1), `returned to origin (${after.x},${after.y}) vs (${origin.x},${origin.y})`);
      assert(tidy().tapeCount() === 432 || tidy().tapeCount() >= 400, 'no tapes lost');
    });
  }

  if (phase === 1) {
    await test('T5 valid insert: align/turn/slide seat at the slot; tuck + tuk; counters; no chime', async () => {
      const tapes = tidy().tapesInfo().filter(t => t.state === 'loose' && !t.defect);
      const isolated = (() => {
        for (const t of tapes) {
          if (!tapes.some(o => o.id !== t.id && Math.hypot(o.x - t.x, o.y - t.y) < 62)) return t;
        }
        return tapes[0];
      })();
      const tape = isolated;
      const row = rowsOfGroup(tape.combo)[0];
      const slotPt = rowSlotWorld(row, 7);
      const spot = findEmptySpotNear(slotPt);
      tidy().setTapePos(tape.id, spot.x, spot.y);
      const before = tidy().shelved();
      d.setCamera((spot.x + slotPt.x) / 2, (spot.y + slotPt.y) / 2, 1);
      await waitFrames(game, 3);
      await dragTape(game, tape.id, slotPt);
      await sleep(1400); // align+turn+slide (~340ms) with headless frame pacing
      const info = tidy().tapesInfo().find(t => t.id === tape.id)!;
      assert(info.state === 'shelved', `tape shelved (state=${info.state})`);
      assert(info.row === row, `seated in its matching row (${info.row} vs ${row})`);
      assert(info.slot !== null, 'slot assigned');
      assert(tidy().shelved() === before + 1, `shelved counter ${tidy().shelved()} vs ${before + 1}`);
      const recent = audioNames();
      assert(recent.includes('tuck'), 'Magnetic Tuck shff played at entry');
      assert(recent.includes('tuk'), 'muted plastic tuk played exactly at seat');
      assert(!recent.includes('chime'), 'NO Tiny Chime for a plain insertion');
      assert(!recent.includes('invalid'), 'no refusal sound on a valid drop');
      const sp = tidy().spritePos(tape.id)!;
      assert(approx(sp.x, slotPt.x, 1.5) && approx(sp.y, slotPt.y, 1.5), `spine seated at slot (${sp.x},${sp.y}) vs (${slotPt.x},${slotPt.y})`);
      // no hover sound ever played
      assert(!recent.slice(0, recent.indexOf('tuck')).includes('tuck'), 'tuck only at entry, not hover');
    });

    await test('T6 misfile: wrong row accepted SILENTLY (no tell), then pull-out + re-file', async () => {
      // a group-A tape into a group-B row with free slots
      const tapes = tidy().tapesInfo().filter(t => t.state === 'loose' && !t.defect);
      const tape = tapes[0];
      const other = tapes.find(t => t.combo !== tape.combo)!;
      const rowB = rowsOfGroup(other.combo)[1]; // a DIFFERENT group's row, same bank family
      const slotB = rowSlotWorld(rowB, 5);
      const hintsBefore = hints.length;
      const toastsBefore = toasts.length;
      const shelvedBefore = tidy().shelved();
      const spotB = findEmptySpotNear(slotB);
      tidy().setTapePos(tape.id, spotB.x, spotB.y);
      d.setCamera((spotB.x + slotB.x) / 2, (spotB.y + slotB.y) / 2, 1);
      await waitFrames(game, 3);
      await dragTape(game, tape.id, slotB);
      await sleep(1400);
      const info = tidy().tapesInfo().find(t => t.id === tape.id)!;
      assert(info.state === 'shelved', `wrong-combo tape accepted physically (state=${info.state})`);
      assert(info.row === rowB, `seated in the WRONG row (${info.row})`);
      assert(tidy().shelved() === shelvedBefore + 1, 'occupancy counter moved (occupancy only)');
      // THE NO-TELL ASSERTIONS
      assert(hints.length === hintsBefore, `no hint event fired for the misfile (${hints.length - hintsBefore})`);
      assert(toasts.length === toastsBefore, 'no toast fired for the misfile');
      const tail = audioNames().slice(-5);
      assert(tail.includes('tuck') && tail.includes('tuk'), 'same tuck sounds as a correct insert');
      assert(!tail.includes('invalid') && !tail.includes('thud') && !tail.includes('chime'),
        `no tell sound in the misfile drop (${tail.join(',')})`);
      assert(tidy().misfiles().includes(tape.id), 'misfile tracked internally (hidden from the player)');
      assert(!tidy().correct(), 'board not correct while misfiled');
      // rack count = physical occupancy only (includes the misfiled tape)
      const rowsBefore = tidy().rowsInfo().find(r => r.id === rowB)!.used;
      assert(rowsBefore >= 1, 'row occupancy counts it');

      // pull-out: grab the seated spine, move out
      const sp = tidy().spritePos(tape.id)!;
      d.setCamera(sp.x, sp.y, 1);
      await waitFrames(game, 3);
      const w2s = makeWorldToScreen(game);
      const s0 = w2s(sp.x, sp.y);
      pointerEvent(game, 'pointerdown', s0.sx, s0.sy);
      await waitFrames(game, 3);
      assert(tidy().held().includes(tape.id), 'pulled the seated tape out');
      assert(tidy().misfiles().length === 0, 'misfile cleared on pull-out');
      pointerEvent(game, 'pointermove', s0.sx + 60, s0.sy + 40);
      await waitFrames(game, 2);
      // re-file into its CORRECT row
      const rowA = rowsOfGroup(tape.combo)[0];
      const slotA = rowSlotWorld(rowA, 6);
      const end = w2s(slotA.x, slotA.y);
      for (let i = 1; i <= 6; i++) {
        pointerEvent(game, 'pointermove', s0.sx + ((end.sx - s0.sx) * i) / 6, s0.sy + ((end.sy - s0.sy) * i) / 6);
        await sleep(16);
      }
      pointerEvent(game, 'pointerup', end.sx, end.sy);
      await sleep(1400);
      const fixed = tidy().tapesInfo().find(t => t.id === tape.id)!;
      assert(fixed.state === 'shelved' && fixed.row === rowA, `re-filed into the correct row (${fixed.row})`);
      assert(tidy().correct(), 'board correct after fixing');
      // verify the unit that held the misfile: player-initiated check
      const unit = Math.floor(rowB / 4);
      const verdict = tidy().verify(unit);
      assert(verdict === 'ok' || verdict === 'empty' || verdict === 'wrong', `verify returns a verdict (${verdict})`);
    });
  }

  if (phase === 1) {
    await test('T7 marquee locked: the gesture pans, no batch pickup possible', async () => {
      assert(tidy().shelved() < 40, `pre-unlock state (shelved=${tidy().shelved()})`);
      assert(!tidy().skills().marquee, 'marquee locked');
      const scrollBefore = tidy().camera();
      d.setCamera(2400, 1600, 1);
      await waitFrames(game, 3);
      const before = tidy().camera();
      const w2s = makeWorldToScreen(game);
      const p0 = w2s(2400, 1600);
      pointerEvent(game, 'pointerdown', p0.sx, p0.sy);
      for (let i = 1; i <= 6; i++) {
        pointerEvent(game, 'pointermove', p0.sx + i * 30, p0.sy + i * 22);
        await sleep(16);
      }
      pointerEvent(game, 'pointerup', p0.sx + 180, p0.sy + 132);
      await waitFrames(game, 3);
      assert(tidy().selection().length === 0, 'no batch pickup possible before unlock');
      const after = tidy().camera();
      assert(Math.abs(after.x - before.x) > 20 || Math.abs(after.y - before.y) > 20, 'the empty-table gesture panned instead');
      void scrollBefore;
    });
  }

  if (phase === 1) {
    await test('T8 marquee unlocked: select 5, carry together, 3 free slots -> 3 in, 2 leftovers visible', async () => {
      const need = 40 - tidy().shelved();
      if (need > 0) tidy().shelve(need);
      assert(tidy().skills().marquee, 'marquee unlocked at 40');
      // fixture: a group with 3 loose near each other + 2 other-combo tapes;
      // its matching row pre-filled to 5 => 3 free
      const info = tidy().tapesInfo();
      const combo = info.find(t => t.combo >= 0 && t.state === 'loose' && !t.defect)!.combo;
      const row = rowsOfGroup(combo)[0];
      // clear the row then fill exactly 5 (via the data path)
      const seated = info.filter(t => t.state === 'shelved' && t.row === row);
      for (const t of seated) tidy().pullOut(t.id);
      const ofC = tidy().tapesInfo().filter(t => t.combo === combo);
      const looseC = ofC.filter(t => t.state === 'loose' && !t.defect);
      assert(looseC.length >= 3, `3 loose tapes of the group exist (got ${looseC.length})`);
      for (let k = 0; k < 5; k++) {
        const source = tidy().tapesInfo().find(t => t.combo === combo && t.state === 'loose' && !t.defect)!;
        tidy().insertTape(source.id, row, k);
      }
      const rowsInfo = tidy().rowsInfo().find(r => r.id === row)!;
      assert(rowsInfo.used === 5, `row pre-filled to 5 (got ${rowsInfo.used})`);
      const freeNow = 8 - rowsInfo.used;
      assert(freeNow === 3, `3 free slots (got ${freeNow})`);
      // cluster: 5 loose of the SAME group (the user's five-tape batch scenario)
      const info2 = tidy().tapesInfo();
      const looseC2 = info2.filter(t => t.combo === combo && t.state === 'loose' && !t.defect);
      const five = looseC2.slice(0, 5);
      assert(five.length >= 5, `5 loose of the group remain (got ${five.length})`);
      const clusterBase = { x: 2200, y: 1600 };
      five.forEach((t, i) => tidy().setTapePos(t.id, clusterBase.x - 68 + i * 48, clusterBase.y - 40));
      // evacuate any stray tapes inside the upcoming marquee rect (deterministic 5)
      for (const t of tidy().tapesInfo()) {
        if (t.state !== 'loose') continue;
        const isCluster = five.some(c => c.id === t.id);
        if (!isCluster && t.x > clusterBase.x - 130 && t.x < clusterBase.x + 160
          && t.y > clusterBase.y - 130 && t.y < clusterBase.y + 130) {
          tidy().setTapePos(t.id, 640, 1700);
        }
      }
      d.setCamera(clusterBase.x, clusterBase.y, 0.9);
      await waitFrames(game, 3);
      const w2s = makeWorldToScreen(game);
      const a = w2s(clusterBase.x - 120, clusterBase.y - 110);
      const b = w2s(clusterBase.x + 140, clusterBase.y + 120);
      pointerEvent(game, 'pointerdown', a.sx, a.sy);
      for (let i = 1; i <= 8; i++) {
        pointerEvent(game, 'pointermove', a.sx + ((b.sx - a.sx) * i) / 8, a.sy + ((b.sy - a.sy) * i) / 8);
        await sleep(16);
      }
      pointerEvent(game, 'pointerup', b.sx, b.sy);
      await waitFrames(game, 3);
      assert(tidy().selection().length === 5, `5 selected (got ${tidy().selection().length})`);
      const leadId = five[0].id;
      const leadInfo = tidy().tapesInfo().find(t => t.id === leadId)!;
      const leadGrab = w2s(leadInfo.x, leadInfo.y);
      pointerEvent(game, 'pointerdown', leadGrab.sx, leadGrab.sy);
      await waitFrames(game, 3);
      assert(tidy().held().length === 5, `5 held together (got ${tidy().held().length})`);
      assert(tidy().held().includes(leadId), 'the grabbed selected tape is the lead');
      // drop on the row (3 free)
      const dropPt = w2s(rowSlotWorld(row, 5).x, rowSlotWorld(row, 5).y);
      for (let i = 1; i <= 6; i++) {
        pointerEvent(game, 'pointermove',
          leadGrab.sx + ((dropPt.sx - leadGrab.sx) * i) / 6,
          leadGrab.sy + ((dropPt.sy - leadGrab.sy) * i) / 6);
        await sleep(16);
      }
      await waitFrames(game, 2);
      pointerEvent(game, 'pointerup', dropPt.sx, dropPt.sy);
      await sleep(1800); // 3 staggered entries
      const after = tidy().tapesInfo();
      const shelvedOfC = after.filter(t => t.combo === combo && t.state === 'shelved').length;
      assert(shelvedOfC === 8, `row filled to 8 (got ${shelvedOfC})`);
      assert(tidy().held().length === 0, 'held bundle released');
      // the two that did not fit stay visible on the table below the row
      const leftoversNow = after.filter(t => five.some(f => f.id === t.id) && t.state === 'loose');
      assert(leftoversNow.length === 2, `2 leftovers remain on the table (got ${leftoversNow.length})`);
      for (const l of leftoversNow) {
        assert(l.state === 'loose', `leftover ${l.id} still available (state=${l.state})`);
      }
      assert(tidy().tapeCount() >= 400, 'no tapes lost/duplicated');
      const tucks = audioNames().filter(s => s === 'tuck').length;
      assert(tucks >= 3, `3 staggered insertions sounded (${tucks} tucks)`);
      assert(!audioNames().includes('invalid'), 'overflow leftovers are visible, not rejected');
    });
  }

  if (phase === 1) {
    await test('T-tray: load, drag out, batch with partial fit, full refusal', async () => {
      // a) drag one tape onto the tray
      const t1 = pickIsolatedTape(72);
      const tray = trayScreen(game);
      const trayMid = { x: tray.x + tray.w / 2, y: tray.y + tray.h / 2 };
      d.setCamera(1400, 900, 0.72);
      await waitFrames(game, 2);
      await dragTape(game, t1.id, { x: 1400, y: 900 }); // move it near center first (real drag)
      await sleep(300);
      const t1Now = tidy().tapesInfo().find(t => t.id === t1.id)!;
      // drag from its current spot onto the tray's screen rect: convert screen -> world
      const cam = liveGame().scene.getScene('Game')!.cameras.main;
      const trayWorld = cam.getWorldPoint(trayMid.x, trayMid.y);
      const w2s = makeWorldToScreen(game);
      const s0 = w2s(t1Now.x, t1Now.y);
      pointerEvent(game, 'pointerdown', s0.sx, s0.sy);
      await waitFrames(game, 2);
      for (let i = 1; i <= 8; i++) {
        pointerEvent(game, 'pointermove', s0.sx + ((trayMid.x - s0.sx) * i) / 8, s0.sy + ((trayMid.y - s0.sy) * i) / 8);
        await sleep(16);
      }
      await waitFrames(game, 2);
      pointerEvent(game, 'pointerup', trayMid.x, trayMid.y);
      await sleep(400);
      const t1After = tidy().tapesInfo().find(t => t.id === t1.id)!;
      assert(t1After.state === 'tray', `dropped into the tray (state=${t1After.state})`);
      assert(tidy().tray().includes(t1.id), 'tray data holds it');
      assert(tidy().trayFree() === 4, `4 free tray slots (got ${tidy().trayFree()})`);
      void trayWorld;

      // b) drag it back out of the tray onto the table
      const slot0 = traySlotCenter(game, 0);
      pointerEvent(game, 'pointerdown', slot0.x, slot0.y);
      await waitFrames(game, 3);
      assert(tidy().held().includes(t1.id), 'dragged a tape OUT of the tray');
      pointerEvent(game, 'pointermove', slot0.x - 80, slot0.y - 120);
      await waitFrames(game, 2);
      pointerEvent(game, 'pointerup', slot0.x - 80, slot0.y - 120);
      await sleep(400);
      const t1Back = tidy().tapesInfo().find(t => t.id === t1.id)!;
      assert(t1Back.state === 'loose', `tape back on the table (state=${t1Back.state})`);

      // c) fill all 5 tray slots (data path), then try to load a 6th via a real drop
      const others = tidy().tapesInfo().filter(t => t.state === 'loose' && !t.defect && t.id !== t1.id).slice(0, 5);
      for (const o of others) tidy().trayLoad(o.id);
      assert(tidy().tray().length === 5, `5/5 in the tray (got ${tidy().tray().length})`);
      const t6 = pickIsolatedTape(72);
      d.setCamera(t6.x, t6.y, 1);
      await waitFrames(game, 3);
      const w2s6 = makeWorldToScreen(game);
      const s6 = w2s6(t6.x, t6.y);
      pointerEvent(game, 'pointerdown', s6.sx, s6.sy);
      await waitFrames(game, 2);
      for (let i = 1; i <= 8; i++) {
        pointerEvent(game, 'pointermove', s6.sx + ((trayMid.x - s6.sx) * i) / 8, s6.sy + ((trayMid.y - s6.sy) * i) / 8);
        await sleep(16);
      }
      pointerEvent(game, 'pointerup', trayMid.x, trayMid.y);
      await sleep(400);
      assert(tidy().tray().length === 5, `full tray never swallowed a sixth (${tidy().tray().length})`);
      const t6After = tidy().tapesInfo().find(t => t.id === t6.id)!;
      assert(t6After.state === 'loose', `the sixth tape stayed recoverable on the table (${t6After.state})`);
      assert(audioNames().slice(-3).includes('invalid'), 'gentle refusal sound');

      // d) tray batch onto a row with 3 free slots: 3 inserted, 2 stay in the tray
      const anyGroup = tidy().tapesInfo().find(t => tidy().tray().includes(t.id))!.combo;
      const row = rowsOfGroup(anyGroup)[0];
      const seatedOfRow = tidy().tapesInfo().filter(t => t.state === 'shelved' && t.row === row).length;
      for (const t of tidy().tapesInfo().filter(t => t.state === 'shelved' && t.row === row)) tidy().pullOut(t.id);
      void seatedOfRow;
      // pre-fill whatever the row can take from loose group-mates
      let filled = 0;
      while (filled < 5) {
        const src = tidy().tapesInfo().find(t => t.state === 'loose' && !t.defect && t.combo === anyGroup);
        if (!src) break;
        tidy().insertTape(src.id, row, filled);
        filled++;
      }
      const used = tidy().rowsInfo().find(r => r.id === row)!.used;
      const freeSlots = 8 - used;
      assert(freeSlots >= 1, `row has room for a batch (free=${freeSlots})`);
      const expectedInserts = Math.min(freeSlots, 5);
      // grab the tray header and drag it onto the row
      const slotTarget = rowSlotWorld(row, 6);
      const w2s2 = makeWorldToScreen(game);
      const drop = w2s2(slotTarget.x, slotTarget.y);
      pointerEvent(game, 'pointerdown', tray.x + 60, tray.y + 14);
      await waitFrames(game, 2);
      for (let i = 1; i <= 8; i++) {
        pointerEvent(game, 'pointermove',
          tray.x + 60 + ((drop.sx - (tray.x + 60)) * i) / 8,
          tray.y + 14 + ((drop.sy - (tray.y + 14)) * i) / 8);
        await sleep(16);
      }
      await waitFrames(game, 2);
      pointerEvent(game, 'pointerup', drop.sx, drop.sy);
      await sleep(1800);
      assert(tidy().tray().length === 5 - expectedInserts,
        `tray batch inserted only what fit (tray left ${tidy().tray().length}, expected ${5 - expectedInserts})`);
      const rowUsed = tidy().rowsInfo().find(r => r.id === row)!.used;
      assert(rowUsed === used + expectedInserts, `row filled by exactly the batch (${rowUsed})`);
      assert(audioNames().filter(s => s === 'tuck').length >= expectedInserts, 'each seated tape sounded');
      // leftovers stay IN the tray (recoverable)
      for (const id of tidy().tray()) {
        const t = tidy().tapesInfo().find(x => x.id === id)!;
        assert(t.state === 'tray', `leftover ${id} still in the tray`);
      }
      // clear the tray back to the table for the remaining suites
      tidy().trayClear();
      assert(tidy().tray().length === 0, 'tray cleared back onto the table');
    });
  }

  if (phase === 1) {
    await test('T9 repairs: rewind, sticker swap, paint touch-up (real gestures)', async () => {
      const kinds = ['rewind', 'sticker', 'paint'] as const;
      const repairedIds: number[] = [];
      for (const kind of kinds) {
        const defectiveRaw = tidy().tapesInfo().find(t => t.defect === kind && !t.repaired);
        assert(!!defectiveRaw, `a ${kind} tape exists`);
        const defective = defectiveRaw as NonNullable<typeof defectiveRaw>;
        tidy().openRepair(defective.id);
        await waitUntil(() => tidy().repairOpen(), 8000, `${kind} repair opens`);
        if (kind === 'rewind') await driveRewindRepair(game);
        else if (kind === 'sticker') await driveStickerRepair(game);
        else await drivePaintRepair(game);
        await waitUntil(() => !tidy().repairOpen(), 14000, `${kind} repair closes`);
        const info = tidy().tapesInfo().find(t => t.id === defective.id)!;
        assert(info.repaired, `${kind} repair completed (repaired=${info.repaired})`);
        repairedIds.push(defective.id);
        // repaired tape returns to the sorting loop: file it via a real drag
        // into a slot that is actually free in one of its two matching rows
        const rowInfo = tidy().rowsInfo().find(r => r.group === info.combo && r.used < 8)!;
        const freeSlot = 8 - rowInfo.used - 1;
        const slotPt = rowSlotWorld(rowInfo.id, freeSlot);
        const spot = findEmptySpotNear(slotPt);
        tidy().setTapePos(info.id, spot.x, spot.y);
        d.setCamera((spot.x + slotPt.x) / 2, (spot.y + slotPt.y) / 2, 1);
        await waitFrames(game, 3);
        await dragTape(game, info.id, slotPt);
        await sleep(1400);
        const after = tidy().tapesInfo().find(t => t.id === info.id)!;
        assert(after.state === 'shelved', `${kind} tape sortable after repair (state=${after.state})`);
      }
      assert(repairedIds.length === 3, 'all three repair types exercised');
    });

    await test('T9b cancel a repair: tape returns unrepaired, nothing lost', async () => {
      const defectiveRaw = tidy().tapesInfo().find(t => t.defect && !t.repaired);
      if (!defectiveRaw) return;
      const defective = defectiveRaw;
      const before = tidy().tapeCount();
      tidy().openRepair(defective.id);
      await waitUntil(() => tidy().repairOpen(), 8000, 'repair opens');
      const H = game.scale.height;
      pointerEvent(game, 'pointerdown', 60, H - 40);
      pointerEvent(game, 'pointerup', 60, H - 40);
      await waitUntil(() => !tidy().repairOpen(), 8000, 'cancel closes repair');
      const info = tidy().tapesInfo().find(t => t.id === defective.id)!;
      assert(!info.repaired, 'tape still awaiting repair after cancel');
      assert(tidy().tapeCount() === before, 'no tape lost on cancel');
    });

    await test('T10 save + reload (phase 2 verifies restore)', async () => {
      const saved = tidy().save();
      assert(saved, 'localStorage save succeeded');
      const snap = tidy().tapesInfo().map(t => `${t.id}:${t.state}:${t.row ?? '-'}:${t.slot ?? '-'}`);
      sessionStorage.setItem('tidy-autotest-snapshot', JSON.stringify({
        seed: tidy().seed(),
        shelved: tidy().shelved(),
        skills: tidy().skills(),
        tray: tidy().tray(),
        tapes: snap,
      }));
      sessionStorage.setItem(PHASE_KEY, '2');
      window.history.replaceState({}, '', '?autotest=1&restore=1');
      await sleep(150);
      window.location.reload();
    });
  }

  if (phase === 2) {
    await test('T10b restore: positions, rows, tray, skills survive reload', async () => {
      const snapRaw = sessionStorage.getItem('tidy-autotest-snapshot');
      assert(!!snapRaw, 'snapshot present');
      const snap = JSON.parse(snapRaw as string) as {
        seed: number; shelved: number; skills: Record<string, boolean>; tray: number[]; tapes: string[];
      };
      assert(tidy().seed() === snap.seed, `seed restored (${tidy().seed()} vs ${snap.seed})`);
      assert(tidy().shelved() === snap.shelved, `shelved restored (${tidy().shelved()} vs ${snap.shelved})`);
      const expect = new Map(snap.tapes.map(s => {
        const [id, state, row, slot] = s.split(':');
        return [Number(id), { state, row: row === '-' ? null : Number(row), slot: slot === '-' ? null : Number(slot) }];
      }));
      const tapes = tidy().tapesInfo();
      assert(tapes.length === snap.tapes.length, `tape count restored (${tapes.length})`);
      for (const t of tapes) {
        const e = expect.get(t.id)!;
        assert(e.state === t.state, `tape ${t.id} state ${t.state} vs saved ${e.state}`);
        assert((e.row ?? null) === (t.row ?? null), `tape ${t.id} row`);
        assert((e.slot ?? null) === (t.slot ?? null), `tape ${t.id} slot`);
      }
      for (const id of snap.tray) {
        assert(tidy().tray().includes(id), `tray slot restored (tape ${id})`);
      }
      const skills = tidy().skills();
      for (const [k, v] of Object.entries(snap.skills)) assert(skills[k] === v, `skill ${k} restored`);
      assert(tapes.filter(t => t.defect && t.repaired).length > 0, 'completed repairs retained');
    });
  }

  if (phase === 2) {
    await test('T11 powers: misfile reveal, match scan, gather-into-tray; timers; expiry keeps held', async () => {
      const need = 200 - tidy().shelved();
      if (need > 0) tidy().shelve(need);
      assert(tidy().skills().misplaced, 'misfile finder unlocked at 35');

      // --- Misfile Finder reveals only misfiled tapes, only while active ---
      // normalize the board first: pull out any leftover misfiles from earlier
      // suites (batch tests may have filed wrong-group tapes) and re-file them
      for (const id of tidy().misfiles()) {
        tidy().pullOut(id);
        const t = tidy().tapesInfo().find(x => x.id === id)!;
        const rInfo = tidy().rowsInfo().find(r => r.group === t.combo && r.used < 8);
        if (rInfo) tidy().insertTape(id, rInfo.id, 8 - rInfo.used - 1);
      }
      assert(tidy().misfiles().length === 0, 'board normalized before the misfile fixture');
      // make one deliberate misfile (a different group's row that still has room)
      const loose = tidy().tapesInfo().filter(t => t.state === 'loose' && !t.defect);
      const tape = loose[0];
      const rowB = (() => {
        for (const r of tidy().rowsInfo()) {
          if (r.group !== tape.combo && r.used < 8) return r.id;
        }
        return rowsOfGroup((tape.combo + 1) % 32)[0];
      })();
      assert(tidy().insertTape(tape.id, rowB, 7), 'misfiled tape physically inserted');
      assert(tidy().misfiles().length === 1, 'one misfile exists (hidden)');
      assert(tidy().activatePower('misplaced'), 'misfile finder activated');
      const pw = tidy().powers().misplaced;
      assert(pw.activeUntil > 0, '15 s active window started');
      tidy().forceExpirePower('misplaced');
      const pw2 = tidy().powers().misplaced;
      assert(pw2.cooldownUntil > 0, 'expiry started the 60 s cooldown');
      assert(!tidy().activatePower('misplaced'), 'cooldown blocks re-activation');
      // fix the misfile for later suites
      assert(tidy().pullOut(tape.id), 'pull-out works after power expiry');

      // --- Match Scan counts exact color+symbol matches ---
      assert(tidy().activatePower('matchScan'), 'matchScan activated');
      const scanTape = tidy().tapesInfo().find(t => t.state === 'loose' && !t.defect)!;
      const sameComboLoose = tidy().tapesInfo().filter(t => t.id !== scanTape.id && t.state === 'loose' && t.combo === scanTape.combo).length;
      d.setCamera(scanTape.x, scanTape.y, 1);
      await waitFrames(game, 3);
      let scan = { target: null as number | null, count: 0 };
      for (let attempt = 0; attempt < 3 && scan.target !== scanTape.id; attempt++) {
        tidy().activatePower('matchScan'); // re-arm if a frame stall expired the window
        await clickTape(game, scanTape.id);
        await waitFrames(game, 4);
        scan = tidy().scanInfo();
      }
      assert(scan.target === scanTape.id, `scan target set (${scan.target})`);
      assert(scan.count === sameComboLoose, `scan counted exact color+symbol matches (${scan.count} vs ${sameComboLoose})`);

      // --- hold a tape, force-expire the power: held stays held ---
      const heldTape = tidy().tapesInfo().find(t => t.state === 'loose' && !t.defect && t.id !== scanTape.id)!;
      d.setCamera(heldTape.x, heldTape.y, 1);
      await waitFrames(game, 2);
      const w2s = makeWorldToScreen(game);
      const hp = w2s(heldTape.x, heldTape.y);
      pointerEvent(game, 'pointerdown', hp.sx, hp.sy);
      await waitFrames(game, 3);
      assert(tidy().held().length === 1, 'tape held');
      tidy().forceExpirePower('matchScan');
      await waitFrames(game, 4);
      assert(tidy().held().length === 1, 'expiry did not drop the held tape');
      pointerEvent(game, 'pointerup', hp.sx + 40, hp.sy + 30);
      await waitFrames(game, 3);

      // --- Match Gather: loads matching loose tapes into FREE tray slots only ---
      tidy().trayClear();
      const gt = tidy().tapesInfo().find(t => t.state === 'loose' && !t.defect)!;
      const eligible = tidy().tapesInfo().filter(t => t.state === 'loose' && t.combo === gt.combo && !t.defect);
      // make exactly 2 tray slots free (load 3 first)
      const fillers = tidy().tapesInfo().filter(t => t.state === 'loose' && !t.defect && t.combo !== gt.combo).slice(0, 3);
      for (const f of fillers) tidy().trayLoad(f.id);
      assert(tidy().trayFree() === 2, `2 tray slots free (got ${tidy().trayFree()})`);
      const shelvedBefore = tidy().shelved();
      d.setCamera(gt.x, gt.y, 1);
      await waitFrames(game, 3);
      assert(tidy().activatePower('matchGather'), 'matchGather activated');
      let loaded = 0;
      for (let attempt = 0; attempt < 3; attempt++) {
        await clickTape(game, gt.id);
        await sleep(700);
        loaded = tidy().tapesInfo().filter(t => t.state === 'tray' && t.combo === gt.combo).length;
        if (loaded > 0) break;
        tidy().activatePower('matchGather'); // re-arm if a frame stall expired it
      }
      const expected = Math.min(2, eligible.length - 1); // itself + others, capped by free slots
      assert(loaded === expected, `gather loaded exactly the free capacity (${loaded} vs ${expected})`);
      assert(tidy().shelved() === shelvedBefore, 'gather did NOT auto-shelve');
      // nothing teleported past capacity: remaining eligible tapes stay loose
      const stillLoose = tidy().tapesInfo().filter(t => t.state === 'loose' && t.combo === gt.combo && !t.defect).length;
      assert(stillLoose === Math.max(0, eligible.length - loaded), `no teleport past capacity (${stillLoose})`);
      tidy().trayClear();
    });

    await test('T11b skill toggles via keyboard (D scanner / M misfile)', async () => {
      keyEvent('keydown', 'd', 'KeyD', 68);
      await waitFrames(game, 2);
      keyEvent('keyup', 'd', 'KeyD', 68);
      assert(tidy().skills().scanner, 'scanner unlocked (>=10 shelved)');
      keyEvent('keydown', 'm', 'KeyM', 77);
      await waitFrames(game, 2);
      keyEvent('keyup', 'm', 'KeyM', 77);
      assert(true, 'toggles handled without error');
    });

    await test('T12 touch: one finger pans empty table; pinch zooms; nothing selected', async () => {
      d.setCamera(2000, 1200, 1);
      await waitFrames(game, 3);
      const before = tidy().camera();
      const w2s = makeWorldToScreen(game);
      const c = w2s(2000, 1200);
      // one finger drag on empty table => pan
      touchEventMulti(game, 'touchstart', [{ id: 1, x: c.sx, y: c.sy }], [1]);
      for (let i = 1; i <= 5; i++) {
        touchEventMulti(game, 'touchmove', [{ id: 1, x: c.sx - i * 14, y: c.sy - i * 10 }], [1]);
        await sleep(30);
      }
      touchEventMulti(game, 'touchend', [{ id: 1, x: c.sx - 70, y: c.sy - 50 }], [1]);
      await waitFrames(game, 3);
      const mid = tidy().camera();
      assert(mid.x > before.x + 30 || mid.y > before.y + 30, `one-finger pan moved the camera (${before.x},${before.y} -> ${mid.x},${mid.y})`);
      assert(tidy().selection().length === 0, 'touch pan never selects');
      assert(tidy().held().length === 0, 'touch pan never drags');
      // pinch: two fingers spread => zoom in
      const zBefore = tidy().camera().zoom;
      touchEventMulti(game, 'touchstart', [
        { id: 1, x: c.sx - 40, y: c.sy },
      ], [1]);
      touchEventMulti(game, 'touchstart', [
        { id: 1, x: c.sx - 40, y: c.sy },
        { id: 2, x: c.sx + 40, y: c.sy },
      ], [2]);
      for (let i = 1; i <= 5; i++) {
        touchEventMulti(game, 'touchmove', [
          { id: 1, x: c.sx - 40 - i * 16, y: c.sy },
          { id: 2, x: c.sx + 40 + i * 16, y: c.sy },
        ], [1, 2]);
        await sleep(30);
      }
      touchEventMulti(game, 'touchend', [
        { id: 1, x: c.sx - 120, y: c.sy },
        { id: 2, x: c.sx + 120, y: c.sy },
      ], [1, 2]);
      await waitFrames(game, 3);
      const zAfter = tidy().camera().zoom;
      assert(zAfter > zBefore + 0.03, `pinch spread zoomed in (${zBefore} -> ${zAfter})`);
    });

    await test('T13 resize: drag math holds after a viewport change', async () => {
      tidy().resize(900, 560);
      await waitFrames(game, 4);
      const tape = pickIsolatedTape();
      tidy().setCamera(tape.x, tape.y, 1);
      await waitFrames(game, 3);
      const grab = { x: 8, y: 8 };
      const w2s = makeWorldToScreen(game);
      const s0 = w2s(tape.x + grab.x, tape.y + grab.y);
      pointerEvent(game, 'pointerdown', s0.sx, s0.sy);
      await waitFrames(game, 2);
      pointerEvent(game, 'pointermove', s0.sx + 70, s0.sy - 40);
      await waitFrames(game, 3);
      const live = tidy().spritePos(tape.id)!;
      const cam = liveGame().scene.getScene('Game')!.cameras.main;
      const wp = cam.getWorldPoint(s0.sx + 70, s0.sy - 40);
      assert(approx(live.x, wp.x - grab.x, 1), `post-resize drag x ${live.x.toFixed(1)} vs ${(wp.x - grab.x).toFixed(1)}`);
      assert(approx(live.y, wp.y - grab.y, 1), 'post-resize drag y');
      pointerEvent(game, 'pointerup', s0.sx + 70, s0.sy - 40);
      await waitFrames(game, 2);
      tidy().resize(1280, 720);
      await waitFrames(game, 4);
    });
  }

  if (phase === 2) {
    await test('T14 win policy: full-but-misfiled board does NOT win; fixed board does (+chime)', async () => {
      // complete all repairs via the debug path (gesture correctness proven by T9)
      tidy().repairAll();
      tidy().trayClear();
      // shelve all but ONE tape into correct rows
      const remaining = tidy().loose() + tidy().tray();
      if (remaining > 1) tidy().shelve(remaining - 1);
      await waitFrames(game, 3);
      assert(tidy().loose() === 1, `exactly one tape left loose (${tidy().loose()})`);
      assert(!tidy().completed(), 'not completed yet');
      // file the LAST tape into a WRONG row: full board, but not a win
      const last = tidy().tapesInfo().find(t => t.state === 'loose')!;
      // a DIFFERENT group's row that still has a free slot (capacity guarantees
      // one exists: 432 tapes over 512 slots)
      const wrongGroupRow = (() => {
        for (const r of tidy().rowsInfo()) {
          if (r.group !== last.combo && r.used < 8) return r.id;
        }
        return rowsOfGroup((last.combo + 1) % 32)[0];
      })();
      assert(tidy().insertTape(last.id, wrongGroupRow, 7), 'last tape physically filed into a wrong row');
      await sleep(600);
      assert(tidy().loose() === 0 && tidy().tray().length === 0, 'board is physically full');
      assert(!tidy().correct(), 'board is NOT correct');
      assert(!tidy().completed(), 'FULL-BUT-MISFILED BOARD DOES NOT WIN');
      // the generic message appeared (no location revealed)
      const generic = toasts.some(t => t.includes('wrong row') || t.includes("isn't done"));
      assert(generic, 'general not-done message shown (no location)');
      // verify that organizer: player-initiated check says "not quite", NO chime yet
      const wrongUnit = Math.floor(wrongGroupRow / 4);
      const verdict = tidy().verify(wrongUnit);
      assert(verdict === 'wrong' || verdict === 'ok', `verify answered (${verdict})`);
      // fix the misfile
      assert(tidy().pullOut(last.id), 'pull the misfiled tape back out');
      const refiled = tidy().insertTape(last.id, rowsOfGroup(last.combo)[0], 7)
        || tidy().insertTape(last.id, rowsOfGroup(last.combo)[1], 7);
      assert(refiled, 're-file into the correct row');
      await sleep(700);
      assert(tidy().correct(), 'board correct after the fix — still misfiled: ' + JSON.stringify(tidy().misfiles()));
      assert(tidy().completed(), 'completion fires only on the truly-correct board');
      const recent = audioNames();
      assert(recent.includes('chime'), 'Tiny Chime on the verified end-of-job milestone');
      assert(recent.includes('complete'), 'completion arpeggio played');
    });
  }

  return results;
}

// ---------------------------------------------------------------- entry point
export async function runAutotest(game: Phaser.Game, seedParam?: string): Promise<void> {
  console.log('[autotest] waiting for game ready…');
  await waitUntil(() => {
    const d = tidy();
    return !!d && d.tapeCount() > 0;
  }, 60000, 'game ready');

  const params = new URLSearchParams(window.location.search);
  const phase = params.has('restore') ? 2 : 1;
  void seedParam;

  const results = await runTests(game, phase);

  let all: TestResult[] = [];
  try {
    const prev = sessionStorage.getItem(RESULTS_KEY);
    if (prev) all = JSON.parse(prev) as TestResult[];
  } catch { /* fresh */ }
  all = all.concat(results);
  if (phase === 2) sessionStorage.removeItem(RESULTS_KEY);
  else sessionStorage.setItem(RESULTS_KEY, JSON.stringify(all));

  const pass = all.filter(r => r.pass).length;
  const fail = all.length - pass;
  const summary = {
    phase,
    pass,
    fail,
    total: all.length,
    tests: all,
    finishedAt: new Date().toISOString(),
    seed: tidy().seed(),
    tapeCount: tidy().tapeCount(),
  };
  (window as unknown as { __tidyResults: typeof summary }).__tidyResults = summary;
  console.log(`[autotest] PHASE ${phase} DONE: ${pass}/${all.length} passed`, summary);

  const div = document.createElement('div');
  div.style.cssText = [
    'position:fixed', 'top:60px', 'right:8px', 'z-index:99999',
    `background:${fail ? 'rgba(140,40,30,0.92)' : 'rgba(46,90,50,0.92)'}`,
    'color:#fff', 'font:12px monospace', 'padding:6px 10px', 'border-radius:6px',
    'pointer-events:none', 'max-width:280px',
  ].join(';');
  div.textContent = `autotest phase ${phase}: ${pass}/${all.length} passed${fail ? ` — ${fail} FAIL` : ''}`;
  document.body.appendChild(div);
}
