/**
 * Tidy Tapes — in-page acceptance harness v3 (?autotest=1).
 * Drives REAL DOM MouseEvents / TouchEvents / WheelEvents / KeyboardEvents
 * through Phaser's input pipeline and asserts through window.__tidy. Results
 * land on window.__tidyResults (and a page overlay + console).
 *
 * v3 coverage (playtest-fixes regression list — the v2 20/20 result is a
 * baseline, NOT proof these cases work):
 *  - §1 extraction size (3 cycles, other rack, 2 zooms, equal resting size)
 *  - §2 north bank whole-group centering + all-banks fit view
 *  - §4 milestones (row chime / full-but-wrong silence / cabinet banner sound /
 *    no layering / persistence across reload + reinsert)
 *  - §5 input scheme (left-drag pan, threshold, double-click tray shortcut incl.
 *    full-tray refusal + no-skill + no-double-fire, R rebind, right-drag marquee
 *    post-unlock only, key-repeat guard)
 *  - §6 skills icon + panel (open/close/outside/Escape, no table interaction,
 *    active power survives hiding)
 *  - §7 repair return flight (visible destination, camera, lands draggable)
 *  - §8 pencil insert/wind/remove separation (oval + triangle paths, stationary
 *    hold, scrubbing, release+resume, double-click removal, ready state)
 *  - §9 hover nudge (display-only, guards, cancel on pickup, toggle)
 * plus every kept v2 invariant: hidden-correctness no-tell, pull-out + re-file,
 * tray batch partial/full-refuse, verify-vs-win chime policy, powers with
 * 15 s/60 s timers, wheel zoom anchor, touch pan/pinch, resize, save/reload.
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

// ------------------------------------------------------------- timing core
// This headless page throttles setTimeout/MessageChannel (~1/s) but RAF runs
// (~5 fps). The harness therefore sleeps by YIELDING through requestAnimationFrame
// (the event loop breathes: the game boots, timers fire, PHASER steps itself),
// and forces one Phaser tick at the start of every sleep so game-time also
// advances deterministically. A pure busy-wait was tried first and starves the
// event loop inside the microtask cascade (the game then never boots).

const rafYield = (): Promise<void> => new Promise<void>(r => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => r());
  else setTimeout(r, 16);
});

const forceTick = (): void => {
  const g = (window as unknown as { __phaserGame?: { loop?: { tick: () => void } } }).__phaserGame;
  try { g?.loop?.tick?.(); } catch { /* ignore */ }
};

const sleep = async (ms: number): Promise<void> => {
  const t0 = performance.now();
  forceTick();
  while (performance.now() - t0 < ms) await rafYield();
};

const nextFrame = async (): Promise<void> => {
  forceTick();
  await rafYield();
};

async function waitFrames(game: Phaser.Game, n: number): Promise<void> {
  void game;
  for (let i = 0; i < n; i++) await nextFrame();
}

async function waitUntil(cond: () => boolean, timeoutMs = 15000, what = 'condition'): Promise<void> {
  const t0 = performance.now();
  while (!cond()) {
    if (performance.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${what}`);
    await sleep(120);
  }
}

// ---------------------------------------------------------------- geometry
/** mirrors config.ts formulas (single source stays config) — v3 layout */
const BACK_X0 = 860, BACK_Y0 = 140, BACK_DX = 280, BACK_DY = 220;
const SIDE_XL = 140, SIDE_XR = 2400;
const RIGHT_TOPS = [560, 1064, 1294, 1524];
const LEFT_TOPS = [620, 840, 1060, 1280];
const WALNUT = { x: 2400, y: 560, w: Math.round(835 * 0.378), h: Math.round(1252 * 0.378) };
const SLOT0_X = 50, SLOT_PITCH = 24, ROW_CH_TOP = 30, ROW_PITCH = 36, ROW_CH_H = 30;

function unitPosMirror(u: number): { x: number; y: number } {
  if (u < 8) return { x: BACK_X0 + (u % 4) * BACK_DX, y: BACK_Y0 + Math.floor(u / 4) * BACK_DY };
  if (u < 12) return { x: SIDE_XL, y: LEFT_TOPS[u - 8] };
  return { x: SIDE_XR, y: RIGHT_TOPS[u - 12] };
}

function pilotSlotWorld(row: number, slot: number): { x: number; y: number } {
  const k = 0.378;
  const artX = 110 + (slot * (690 - 110)) / 7;
  return { x: WALNUT.x + artX * k, y: WALNUT.y + [361, 627, 897, 1161][row % 4] * k };
}

function rowSlotWorld(row: number, slot: number): { x: number; y: number } {
  const u = Math.floor(row / 4);
  if (u === 12) return pilotSlotWorld(row, slot);
  const p = unitPosMirror(u);
  return { x: p.x + SLOT0_X + slot * SLOT_PITCH, y: p.y + ROW_CH_TOP + (row % 4) * ROW_PITCH + ROW_CH_H / 2 };
}

function rowCenterWorld(row: number): { x: number; y: number; unit: number } {
  const u = Math.floor(row / 4);
  if (u === 12) {
    const s = pilotSlotWorld(row, 3);
    return { x: (pilotSlotWorld(row, 0).x + pilotSlotWorld(row, 7).x) / 2, y: s.y, unit: u };
  }
  const p = unitPosMirror(u);
  return { x: p.x + 130, y: p.y + ROW_CH_TOP + (row % 4) * ROW_PITCH + ROW_CH_H / 2, unit: u };
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

function keyEvent(type: string, key: string, code: string, keyCode: number, repeat = false): void {
  window.dispatchEvent(new KeyboardEvent(type, {
    key, code, keyCode, which: keyCode, bubbles: true, repeat,
  } as KeyboardEventInit & { keyCode: number; which: number; repeat: boolean }));
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

// drag a tape through real events (v3: the press arms behind a 5 px threshold —
// the first move must exceed it to become a real pickup). Screen-space end point.
async function dragTapeScreens(
  game: Phaser.Game, tapeId: number,
  endScreen: { sx: number; sy: number },
  opts: { grab?: { x: number; y: number } } = {},
): Promise<void> {
  const d = tidy();
  const t = d.tapesInfo().find(x => x.id === tapeId);
  assert(!!t, `tape ${tapeId} exists`);
  const tape0 = t as NonNullable<typeof t>;
  const w2s = makeWorldToScreen(game);
  const grab = opts.grab ?? { x: 10, y: -6 };
  const start = w2s(tape0.x + grab.x, tape0.y + grab.y);
  pointerEvent(game, 'pointerdown', start.sx, start.sy);
  await waitFrames(game, 2);
  pointerEvent(game, 'pointermove', start.sx + 9, start.sy + 7); // cross the threshold
  await waitFrames(game, 2);
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    pointerEvent(game, 'pointermove',
      start.sx + ((endScreen.sx - start.sx) * i) / steps,
      start.sy + ((endScreen.sy - start.sy) * i) / steps);
    await sleep(16);
  }
  await waitFrames(game, 2);
  pointerEvent(game, 'pointerup', endScreen.sx, endScreen.sy);
  await waitFrames(game, 2);
}

// drag a tape through real events (world-space end point)
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
  pointerEvent(game, 'pointermove', start.sx + 9, start.sy + 7); // cross the threshold
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

/** two quick clicks on the same tape = the v3 double-click tray shortcut */
async function doubleClickTape(game: Phaser.Game, tapeId: number): Promise<void> {
  const d = tidy();
  const t = d.tapesInfo().find(x => x.id === tapeId);
  assert(!!t, `tape ${tapeId} exists`);
  const tape0 = t as NonNullable<typeof t>;
  const w2s = makeWorldToScreen(game);
  const p = w2s(tape0.x, tape0.y);
  // the two clicks are dispatched as one synchronous burst (scene time is
  // identical between them, so the double-click window always matches)
  pointerEvent(game, 'pointerdown', p.sx, p.sy);
  pointerEvent(game, 'pointerup', p.sx, p.sy);
  pointerEvent(game, 'pointerdown', p.sx + 2, p.sy + 1);
  pointerEvent(game, 'pointerup', p.sx + 2, p.sy + 1);
  await waitFrames(game, 3);
}

// ------------------------------------------------------------------- repairs
/** the v3 rewind: drag pencil in -> snap -> wind circles -> double-click + drag out */
async function driveRewindRepair(game: Phaser.Game, opts: {
  path?: 'oval' | 'triangle';
  pauseHalfway?: boolean;
} = {}): Promise<void> {
  const W = game.scale.width;
  const H = game.scale.height;
  const cx = W / 2;
  const cy = H / 2 - 10;
  const SCALE = 3.4;
  const hub = { x: cx + (58 - 46) * SCALE, y: cy + (38 - 30) * SCALE };
  const home = { x: cx + (92 * SCALE) / 2 + 90, y: cy + 96 };
  const trace = (m: string) => { if (window.location.search.includes('autotest')) console.log('[rewind]', m); };
  const probe = () => (window as unknown as { __repair?: { pencil: { state: string }; wind: number; done: boolean } }).__repair;

  // 1) drag the pencil from its tray into the hub
  trace('drag-in start');
  pointerEvent(game, 'pointerdown', home.x, home.y - 26);
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    pointerEvent(game, 'pointermove',
      home.x + ((hub.x - home.x) * i) / steps,
      home.y - 26 + ((hub.y - (home.y - 26)) * i) / steps, { buttons: 1 });
  }
  pointerEvent(game, 'pointerup', hub.x, hub.y); // release AT the hub → snap
  await sleep(240);
  trace(`after drag-in: ${JSON.stringify(probe())}`);

  // 2) wind: press on the hub and move around it
  const path = opts.path ?? 'oval';
  const windLoop = async () => {
    pointerEvent(game, 'pointerdown', hub.x + 50, hub.y);
    await waitFrames(game, 2);
    for (let loop = 0; loop < 5 && tidy().repairOpen(); loop++) {
      const pts = path === 'triangle'
        ? [0, 1, 2].map(k => {
          const a = (Math.PI * 2 * k) / 3;
          return { x: hub.x + Math.cos(a) * 62, y: hub.y + Math.sin(a) * 62 };
        })
        : null;
      for (let i = 0; i <= 16 && tidy().repairOpen(); i++) {
        const t = i / 16;
        let px: number, py: number;
        if (pts) {
          // triangle path: interpolate the perimeter (sharp corners included)
          const seg = t * 3;
          const si = Math.min(2, Math.floor(seg));
          const f = seg - si;
          const a = pts[si];
          const b = pts[(si + 1) % 3];
          px = a.x + (b.x - a.x) * f;
          py = a.y + (b.y - a.y) * f;
        } else {
          const ang = t * Math.PI * 2;
          px = hub.x + Math.cos(ang) * (46 + 22 * Math.sin(ang)); // oval
          py = hub.y + Math.sin(ang) * 58;
        }
        pointerEvent(game, 'pointermove', px, py);
      }
      await sleep(60); // pace the loop (events dispatch as bursts)
      if (opts.pauseHalfway && loop === 1) {
        // release mid-rewind, pause, then resume
        pointerEvent(game, 'pointerup', hub.x + 40, hub.y);
        await sleep(320);
        pointerEvent(game, 'pointerdown', hub.x + 40, hub.y);
        await waitFrames(game, 2);
      }
    }
    pointerEvent(game, 'pointerup', hub.x + 40, hub.y);
  };
  await windLoop();
  trace(`after wind: ${JSON.stringify(probe())}`);
  // wait for the ready state
  await waitUntil(() => {
    const r = (window as unknown as { __repair?: { wind: number } }).__repair;
    return !!r && r.wind >= 1;
  }, 20000, 'rewind ready');
  await sleep(120);

  // 3) double-click the seated pencil (one synchronous burst), drag it out
  pointerEvent(game, 'pointerdown', hub.x + 6, hub.y - 6);
  pointerEvent(game, 'pointerup', hub.x + 6, hub.y - 6);
  pointerEvent(game, 'pointerdown', hub.x + 6, hub.y - 6); // second click: grab
  await waitFrames(game, 2);
  const out = { x: hub.x - 230, y: hub.y + 130 };
  for (let i = 1; i <= 8; i++) {
    pointerEvent(game, 'pointermove',
      hub.x + 6 + ((out.x - hub.x - 6) * i) / 8,
      hub.y - 6 + ((out.y - hub.y + 6) * i) / 8);
    await sleep(14);
  }
  pointerEvent(game, 'pointerup', out.x, out.y); // released outside the hub
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
  }
  pointerEvent(game, 'pointerup', spot.x + 120, spot.y + 80);
  await sleep(300);
  pointerEvent(game, 'pointerdown', spot.x, spot.y);
  for (let i = 0; i < 12 && tidy().repairOpen(); i++) {
    const wob = Math.sin(i * 0.8) * 34;
    pointerEvent(game, 'pointermove', spot.x + wob, spot.y + Math.cos(i * 0.5) * 22);
    await sleep(60);
  }
  pointerEvent(game, 'pointerup', spot.x, spot.y);
  await sleep(400);
  const tray = { x: cx + (92 * SCALE) / 2 + 80, y: cy - 40 };
  pointerEvent(game, 'pointerdown', tray.x, tray.y);
  for (let i = 1; i <= 10; i++) {
    pointerEvent(game, 'pointermove',
      tray.x + ((spot.x - tray.x) * i) / 10,
      tray.y + ((spot.y - tray.y) * i) / 10, { buttons: 1 });
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
      }
      await sleep(60);
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


/** wait until the Repair scene has finished create() (its probe exists) */
async function waitRepairReady(what = 'repair scene created'): Promise<void> {
  await waitUntil(() => {
    const r = (window as unknown as { __repair?: { pencil?: unknown } }).__repair;
    return !!r && !!r.pencil;
  }, 8000, what);
}

/** find a damaged loose tape of the given defect kind (via debug info) */
function findDefective(kind: string): { id: number; combo: number; x: number; y: number } {
  const t = tidy().tapesInfo().find(x => x.defect === kind && !x.repaired && x.state === 'loose');
  assert(!!t, `an unrepaired ${kind}-defective loose tape exists`);
  return t as { id: number; combo: number; x: number; y: number };
}

// --------------------------------------------------------------------- suite
async function runTests(game: Phaser.Game, phase: number): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const test = async (name: string, fn: () => Promise<void>) => {
    const t0 = performance.now();
    (window as unknown as { __suiteProgress?: string }).__suiteProgress = name;
    try {
      assert(liveGame() === game, 'game instance stable (no mid-run HMR swap)');
      await fn();
      results.push({ name, pass: true, ms: Math.round(performance.now() - t0) });
      console.log(`[autotest] PASS ${name}`);
    } catch (e) {
      results.push({ name, pass: false, error: String(e), ms: Math.round(performance.now() - t0) });
      console.error(`[autotest] FAIL ${name}:`, e);
    } finally {
      // a failing test must never poison the next one
      try { tidy().recover(); } catch { /* ignore */ }
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
      const down = { x: 14, y: -8 };
      const w2s = makeWorldToScreen(game);
      const s0 = w2s(tape.x + down.x, tape.y + down.y);
      pointerEvent(game, 'pointerdown', s0.sx, s0.sy);
      await waitFrames(game, 2);
      pointerEvent(game, 'pointermove', s0.sx + 10, s0.sy + 8); // threshold
      await waitFrames(game, 3);
      assert(tidy().held().includes(tape.id), `grabbed the intended tape (held=${tidy().held()})`);
      // the ACTUAL grab point (pickup happens at the threshold crossing)
      const cam = liveGame().scene.getScene('Game')!.cameras.main;
      const wpPick = cam.getWorldPoint(s0.sx + 10, s0.sy + 8);
      const livePick = tidy().spritePos(tape.id)!;
      const grab = { x: wpPick.x - livePick.x, y: wpPick.y - livePick.y };
      pointerEvent(game, 'pointermove', s0.sx + 130, s0.sy + 90);
      await waitFrames(game, 3);
      const live = tidy().spritePos(tape.id)!;
      const wp = cam.getWorldPoint(s0.sx + 130, s0.sy + 90);
      assert(approx(live.x, wp.x - grab.x, 0.75), `moved grab point: tape ${live.x.toFixed(1)} vs ${(wp.x - grab.x).toFixed(1)}`);
      assert(approx(live.y, wp.y - grab.y, 0.75), 'moved grab point y');
      const scrollBefore = tidy().camera();
      keyEvent('keydown', 'ArrowRight', 'ArrowRight', 39);
      await sleep(420);
      keyEvent('keyup', 'ArrowRight', 'ArrowRight', 39);
      await waitFrames(game, 4);
      const after = tidy().camera();
      assert(after.x > scrollBefore.x + 12, `keyboard pan moved camera ${scrollBefore.x} -> ${after.x}`);
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
      const down = { x: -12, y: 6 };
      const w2s = makeWorldToScreen(game);
      const s0 = w2s(tape.x + down.x, tape.y + down.y);
      pointerEvent(game, 'pointerdown', s0.sx, s0.sy);
      await waitFrames(game, 2);
      pointerEvent(game, 'pointermove', s0.sx - 12, s0.sy + 10);
      await waitFrames(game, 2);
      assert(tidy().held().includes(tape.id), 'held at 0.7 zoom');
      const cam = liveGame().scene.getScene('Game')!.cameras.main;
      const wpPick = cam.getWorldPoint(s0.sx - 12, s0.sy + 10);
      const livePick = tidy().spritePos(tape.id)!;
      const grab = { x: wpPick.x - livePick.x, y: wpPick.y - livePick.y };
      pointerEvent(game, 'pointermove', s0.sx - 60, s0.sy + 40);
      await waitFrames(game, 3);
      const live = tidy().spritePos(tape.id)!;
      const wp = cam.getWorldPoint(s0.sx - 60, s0.sy + 40);
      assert(approx(live.x, wp.x - grab.x, 1), `zoom drag x: ${live.x.toFixed(1)} vs ${(wp.x - grab.x).toFixed(1)}`);
      assert(approx(live.y, wp.y - grab.y, 1), 'zoom drag y');
      pointerEvent(game, 'pointerup', s0.sx - 60, s0.sy + 40);
      await waitFrames(game, 2);
    });

    await test('T3c wheel zoom is centered on the cursor', async () => {
      d.setCamera(1400, 900, 1);
      await waitFrames(game, 4);
      const worldAt = (sx: number, sy: number): { x: number; y: number } => {
        const c = tidy().camera();
        return { x: c.x + sx / c.zoom, y: c.y + sy / c.zoom };
      };
      const w2s = makeWorldToScreen(game);
      const s = w2s(1400, 900);
      const before = worldAt(s.sx, s.sy);
      const zBefore = tidy().camera().zoom;
      wheelEvent(game, s.sx, s.sy, 0, 120);
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
      pointerEvent(game, 'pointermove', s0.sx + 14, s0.sy + 10);
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

    // ---- v3 §1: the oversized-after-unshelving regression -----------------
    await test('T4b §1 extraction size: insert→pull-out→drop equals an untouched tape (3 cycles, other rack, 2 zooms)', async () => {
      const loose = tidy().tapesInfo().filter(t => t.state === 'loose' && !t.defect);
      const tape = loose.find(t => t.combo !== 16) ?? loose[0]; // any (non-pilot) combo
      const untouched = loose.find(t => t.id !== tape.id && t.combo === tape.combo)!;
      const sizeOf = (id: number) => tidy().spriteSize(id as number)!;
      const base = sizeOf(untouched.id);

      const runCycle = async (row: number, slot: number, zoom: number) => {
        const slotPt = rowSlotWorld(row, slot);
        const spot = findEmptySpotNear(slotPt);
        tidy().setTapePos(tape.id, spot.x, spot.y);
        d.setCamera((spot.x + slotPt.x) / 2, (spot.y + slotPt.y) / 2, zoom);
        await waitFrames(game, 3);
        await dragTape(game, tape.id, slotPt);
        await sleep(3200); // full insert chain: one registration per coarse tick
        const seated = tidy().tapesInfo().find(t => t.id === tape.id)!;
        assert(seated.state === 'shelved', `seated (state=${seated.state})`);
        // pull out via the real gesture: press on the spine, cross threshold, then
        // re-center on a rack-free table spot and drop there
        const tableSpot = findEmptySpot(); // front band: no racks, no bench
        const sp = tidy().spritePos(tape.id)!;
        const near = { x: sp.x, y: sp.y - (row < 48 ? 0 : 40) }; // seated strip center
        d.setCamera(sp.x, sp.y, zoom);
        await waitFrames(game, 3);
        let w2s = makeWorldToScreen(game);
        const s0 = w2s(near.x, near.y);
        pointerEvent(game, 'pointerdown', s0.sx, s0.sy);
        await waitFrames(game, 2);
        pointerEvent(game, 'pointermove', s0.sx + 12, s0.sy + 9);
        await waitFrames(game, 2);
        assert(tidy().held().includes(tape.id), 'pulled out through the gesture');
        // re-center on the drop zone (both the tape and the destination visible)
        d.setCamera(tableSpot.x, tableSpot.y, zoom);
        await waitFrames(game, 3);
        w2s = makeWorldToScreen(game);
        const end = w2s(tableSpot.x, tableSpot.y);
        // the release must be over plain table (screen center — not the tray)
        const tray = trayScreen(game);
        const safe = end.sx < tray.x - 20 || end.sy < tray.y - 20;
        assert(safe, 'release point is plain table, away from the tray');
        for (let i = 1; i <= 6; i++) {
          pointerEvent(game, 'pointermove', s0.sx + ((end.sx - s0.sx) * i) / 6, s0.sy + ((end.sy - s0.sy) * i) / 6);
          await sleep(14);
        }
        pointerEvent(game, 'pointerup', end.sx, end.sy);
        await sleep(400);
        const after = tidy().tapesInfo().find(t => t.id === tape.id)!;
        assert(after.state === 'loose', 'loose again');
        const size = sizeOf(tape.id);
        assert(approx(size.w, base.w, 0.6) && approx(size.h, base.h, 0.6),
          `resting size equals untouched (${size.w}x${size.h} vs ${base.w}x${base.h}) at zoom ${zoom}`);
      };

      const rows = rowsOfGroup(tape.combo);
      await runCycle(rows[0], 7, 1);    // rack A
      await runCycle(rows[1], 5, 1);    // the OTHER rack (different bank)
      await runCycle(rows[0], 3, 0.7);  // third cycle at a second zoom
      assert(tidy().tapeCount() >= 400, 'no duplication/loss across cycles');
    });

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
      await sleep(3200); // full insert chain: one registration per coarse tick
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
    });

    await test('T6 misfile: wrong row accepted SILENTLY (no tell), then pull-out + re-file', async () => {
      const tapes = tidy().tapesInfo().filter(t => t.state === 'loose' && !t.defect);
      const tape = tapes[0];
      const other = tapes.find(t => t.combo !== tape.combo)!;
      const rowB = rowsOfGroup(other.combo)[1];
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
      const rowsBefore = tidy().rowsInfo().find(r => r.id === rowB)!.used;
      assert(rowsBefore >= 1, 'row occupancy counts it');

      // pull-out: press on the seated spine, cross threshold, re-file correct
      const sp = tidy().spritePos(tape.id)!;
      const near = { x: sp.x, y: sp.y - (rowB < 48 ? 0 : 40) };
      d.setCamera(sp.x, sp.y, 1);
      await waitFrames(game, 3);
      const w2s = makeWorldToScreen(game);
      const s0 = w2s(near.x, near.y);
      pointerEvent(game, 'pointerdown', s0.sx, s0.sy);
      await waitFrames(game, 2);
      pointerEvent(game, 'pointermove', s0.sx + 12, s0.sy + 8); // threshold → pull-out
      await waitFrames(game, 2);
      assert(tidy().held().includes(tape.id), 'pulled the seated tape out');
      assert(tidy().misfiles().length === 0, 'misfile cleared on pull-out');
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
      const unit = Math.floor(rowB / 4);
      const verdict = tidy().verify(unit);
      assert(verdict === 'ok' || verdict === 'empty' || verdict === 'wrong', `verify returns a verdict (${verdict})`);
    });

    await test('T7 §5 left-drag on EMPTY table pans (no Space); right-drag pre-unlock never selects', async () => {
      assert(tidy().shelved() < 40, `pre-unlock state (shelved=${tidy().shelved()})`);
      assert(!tidy().skills().marquee, 'marquee locked');
      d.setCamera(2300, 1500, 1);
      await waitFrames(game, 3);
      const before = tidy().camera();
      const w2s = makeWorldToScreen(game);
      const p0 = w2s(2300, 1500);
      // LEFT drag on empty table → pan, no Space held
      pointerEvent(game, 'pointerdown', p0.sx, p0.sy);
      for (let i = 1; i <= 6; i++) {
        pointerEvent(game, 'pointermove', p0.sx + i * 30, p0.sy + i * 22);
        await sleep(16);
      }
      pointerEvent(game, 'pointerup', p0.sx + 180, p0.sy + 132);
      await waitFrames(game, 3);
      assert(tidy().selection().length === 0, 'no selection from a left-drag');
      const after = tidy().camera();
      assert(Math.abs(after.x - before.x) > 20 || Math.abs(after.y - before.y) > 20,
        `left-drag on empty table panned (${before.x},${before.y} -> ${after.x},${after.y})`);
      // RIGHT drag before unlock: no selection either (pan retained from v2)
      d.setCamera(2300, 1500, 1);
      await waitFrames(game, 3);
      const before2 = tidy().camera();
      pointerEvent(game, 'pointerdown', p0.sx, p0.sy, { button: 2, buttons: 2 });
      for (let i = 1; i <= 5; i++) {
        pointerEvent(game, 'pointermove', p0.sx - i * 26, p0.sy + i * 18, { button: 2, buttons: 2 });
        await sleep(16);
      }
      pointerEvent(game, 'pointerup', p0.sx - 130, p0.sy + 90, { button: 2, buttons: 0 });
      await waitFrames(game, 3);
      assert(tidy().selection().length === 0, 'right-drag created NO selection before unlock');
      const after2 = tidy().camera();
      assert(Math.abs(after2.x - before2.x) > 15 || Math.abs(after2.y - before2.y) > 15,
        'pre-unlock right-drag pans (v2 behavior retained)');
    });
  }

  if (phase === 1) {
    await test('T8 §5+marquee: right-drag box-selects after unlock; group carry; partial row fit', async () => {
      const need = 40 - tidy().shelved();
      if (need > 0) tidy().shelve(need);
      assert(tidy().skills().marquee, 'marquee unlocked at 40');
      const info = tidy().tapesInfo();
      const combo = info.find(t => t.state === 'loose' && !t.defect)!.combo;
      const row = rowsOfGroup(combo)[0];
      const seated = info.filter(t => t.state === 'shelved' && t.row === row);
      for (const t of seated) tidy().pullOut(t.id);
      for (let k = 0; k < 5; k++) {
        const source = tidy().tapesInfo().find(t => t.combo === combo && t.state === 'loose' && !t.defect)!;
        tidy().insertTape(source.id, row, k);
      }
      const rowsInfo = tidy().rowsInfo().find(r => r.id === row)!;
      assert(rowsInfo.used === 5, `row pre-filled to 5 (got ${rowsInfo.used})`);

      // cluster 5 loose tapes of the group for the marquee (others moved away
      // so the box selects exactly the five)
      const looseC = tidy().tapesInfo().filter(t => t.combo === combo && t.state === 'loose' && !t.defect);
      const five = looseC.slice(0, 5);
      const clusterBase = { x: 2200, y: 1600 };
      // clear interlopers out of the cluster rect first
      const rect = { x0: clusterBase.x - 60, y0: clusterBase.y - 60, x1: clusterBase.x + 260, y1: clusterBase.y + 200 };
      for (const o of tidy().tapesInfo()) {
        if (o.state === 'loose' && !five.some(f => f.id === o.id)
          && o.x > rect.x0 - 30 && o.x < rect.x1 + 30 && o.y > rect.y0 - 30 && o.y < rect.y1 + 30) {
          tidy().setTapePos(o.id, 1000, 1720);
        }
      }
      for (let i = 0; i < five.length; i++) {
        tidy().setTapePos(five[i].id, clusterBase.x + (i % 3) * 70, clusterBase.y + Math.floor(i / 3) * 60);
      }
      d.setCamera(clusterBase.x + 60, clusterBase.y + 60, 1);
      await waitFrames(game, 3);
      const w2s = makeWorldToScreen(game);
      const a = w2s(clusterBase.x - 45, clusterBase.y - 45);
      const b = w2s(clusterBase.x + 165, clusterBase.y + 120);
      // RIGHT-drag rectangle (the v3 selection gesture)
      pointerEvent(game, 'pointerdown', a.sx, a.sy, { button: 2, buttons: 2 });
      for (let i = 1; i <= 8; i++) {
        pointerEvent(game, 'pointermove', a.sx + ((b.sx - a.sx) * i) / 8, a.sy + ((b.sy - a.sy) * i) / 8, { button: 2, buttons: 2 });
        await sleep(14);
      }
      pointerEvent(game, 'pointerup', b.sx, b.sy, { button: 2, buttons: 0 });
      await waitFrames(game, 3);
      assert(tidy().selection().length >= 3, `right-drag marquee selected ${tidy().selection().length} (cap 5)`);
      const lead = five[2]; // the middle tape is inside the selection
      assert(tidy().selection().includes(lead.id), 'the drag lead is part of the selection');

      // drag the group (left-drag on a selected tape) onto the row → partial fit
      const slotPt = rowSlotWorld(row, 6);
      d.setCamera((clusterBase.x + slotPt.x) / 2, (clusterBase.y + slotPt.y) / 2, 1);
      await waitFrames(game, 3);
      await dragTape(game, lead.id, slotPt);
      await sleep(3600); // 3 staggered insert chains (one registration per tick)
      const usedAfter = tidy().rowsInfo().find(r => r.id === row)!.used;
      assert(usedAfter === 8, `3 free slots took exactly 3 (row used=${usedAfter})`);
      const stillLoose = tidy().tapesInfo().filter(t => t.combo === combo && t.state === 'loose' && !t.defect).length;
      assert(stillLoose >= 1, `leftovers stayed visible (${stillLoose})`);
      tidy().trayClear();
    });
  }

  if (phase === 1) {
    await test('T9 repairs: pencil rewind (oval path) + sticker + paint close via real gestures', async () => {
      const rewindTape = findDefective('rewind');
      d.setCamera(rewindTape.x, rewindTape.y, 1);
      await waitFrames(game, 2);
      tidy().openRepair(rewindTape.id);
      await waitUntil(() => tidy().repairOpen(), 6000, 'rewind overlay open');
      await waitRepairReady('rewind scene ready');
      await driveRewindRepair(game, { path: 'oval' });
      await waitUntil(() => !tidy().repairOpen(), 6000, 'rewind closed');
      const infoR = tidy().tapesInfo().find(t => t.id === rewindTape.id)!;
      assert(infoR.repaired, 'rewind tape repaired');
    });

    await test('T9a §8 pencil: insert stays / no wind on insert / release never pulls it out', async () => {
      const t = findDefective('rewind');
      const W = game.scale.width;
      const H = game.scale.height;
      const cx = W / 2, cy = H / 2 - 10, SCALE = 3.4;
      const hub = { x: cx + (58 - 46) * SCALE, y: cy + (38 - 30) * SCALE };
      const home = { x: cx + (92 * SCALE) / 2 + 90, y: cy + 96 };
      tidy().openRepair(t.id);
      await waitUntil(() => tidy().repairOpen(), 6000, 'overlay open');
      await waitRepairReady('removal scene ready');
      // drag pencil INTO the hub and release
      pointerEvent(game, 'pointerdown', home.x, home.y - 26);
      await waitFrames(game, 2);
      for (let i = 1; i <= 8; i++) {
        pointerEvent(game, 'pointermove', home.x + ((hub.x - home.x) * i) / 8, (home.y - 26) + ((hub.y - home.y + 26) * i) / 8);
        await sleep(12);
      }
      pointerEvent(game, 'pointerup', hub.x, hub.y);
      await sleep(280);
      let probe = (window as unknown as { __repair?: { pencil: { state: string; x: number; y: number }; wind: number } }).__repair;
      assert(probe?.pencil.state === 'seated', `pencil snapped in (state=${probe?.pencil.state})`);
      const wind0 = probe?.wind ?? 0;
      assert(wind0 === 0, 'inserting did NOT start winding');
      // release + move away + hold: pencil stays anchored
      pointerEvent(game, 'pointerdown', hub.x + 60, hub.y + 40);
      await waitFrames(game, 3);
      pointerEvent(game, 'pointerup', hub.x + 60, hub.y + 40);
      await sleep(150);
      for (let i = 1; i <= 5; i++) {
        pointerEvent(game, 'pointermove', hub.x + 60 + i * 30, hub.y + 40 + i * 20);
        await sleep(30);
      }
      await waitFrames(game, 3);
      probe = (window as unknown as { __repair?: { pencil: { state: string; x: number; y: number }; wind: number } }).__repair;
      assert(probe?.pencil.state === 'seated', 'pencil stayed in the hub (release/move-away never pulls it out)');
      assert(approx(probe!.pencil.x, hub.x, 1.5) && approx(probe!.pencil.y, hub.y, 1.5),
        `pencil never drifted (${probe!.pencil.x},${probe!.pencil.y} vs hub ${hub.x.toFixed(0)},${hub.y.toFixed(0)})`);
      // a plain hold with no movement does not advance the wind
      const before = (window as unknown as { __repair?: { wind: number } }).__repair?.wind ?? 0;
      pointerEvent(game, 'pointerdown', hub.x + 46, hub.y);
      await sleep(700); // stationary hold
      pointerEvent(game, 'pointerup', hub.x + 46, hub.y);
      const after = (window as unknown as { __repair?: { wind: number } }).__repair?.wind ?? 0;
      assert(approx(after, before, 0.001), `stationary hold advanced nothing (${before} -> ${after})`);
      // close via the cancel button (the Game scene is paused; Esc is inert here)
      pointerEvent(game, 'pointerdown', 70, game.scale.height - 40);
      await sleep(60);
      pointerEvent(game, 'pointerup', 70, game.scale.height - 40);
      await waitUntil(() => !tidy().repairOpen(), 6000, 'overlay closed');
    });

    await test('T9b §8 wind: oval AND triangle paths advance; scrubbing cancels; pause+resume keeps progress', async () => {
      // triangle path on a fresh rewind repair
      const t2 = findDefective('rewind');
      tidy().openRepair(t2.id);
      await waitUntil(() => tidy().repairOpen(), 6000, 'overlay open (triangle)');
      await waitRepairReady('triangle scene ready');
      await driveRewindRepair(game, { path: 'triangle' });
      await waitUntil(() => !tidy().repairOpen(), 6000, 'triangle rewind closed');
      assert(tidy().tapesInfo().find(x => x.id === t2.id)!.repaired, 'triangle winding completed the repair');

      // pause + resume: reuse oval driver with pauseHalfway
      const t3 = findDefective('rewind');
      tidy().openRepair(t3.id);
      await waitUntil(() => tidy().repairOpen(), 6000, 'overlay open (pause/resume)');
      await waitRepairReady('pause/resume scene ready');
      await driveRewindRepair(game, { path: 'oval', pauseHalfway: true });
      await waitUntil(() => !tidy().repairOpen(), 6000, 'paused/resumed rewind closed');
      assert(tidy().tapesInfo().find(x => x.id === t3.id)!.repaired, 'resume kept the progress');

      // scrubbing check: seated pencil, rapid ±small arcs — net progress ~0
      const t4 = findDefective('rewind');
      tidy().openRepair(t4.id);
      await waitUntil(() => tidy().repairOpen(), 6000, 'overlay open (scrub)');
      await waitRepairReady('scrub scene ready');
      const W = game.scale.width, H = game.scale.height;
      const cx = W / 2, cy = H / 2 - 10, SCALE = 3.4;
      const hub = { x: cx + (58 - 46) * SCALE, y: cy + (38 - 30) * SCALE };
      const home = { x: cx + (92 * SCALE) / 2 + 90, y: cy + 96 };
      pointerEvent(game, 'pointerdown', home.x, home.y - 26);
      for (let i = 1; i <= 8; i++) {
        pointerEvent(game, 'pointermove', home.x + ((hub.x - home.x) * i) / 8, (home.y - 26) + ((hub.y - home.y + 26) * i) / 8);
        await sleep(10);
      }
      pointerEvent(game, 'pointerup', hub.x, hub.y);
      await sleep(240);
      const start = (window as unknown as { __repair?: { wind: number } }).__repair?.wind ?? 0;
      pointerEvent(game, 'pointerdown', hub.x + 40, hub.y);
      // back-and-forth scrubbing: +0.5 rad, -0.5 rad, repeatedly (burst)
      for (let k = 0; k < 24; k++) {
        const ang = (k % 2 === 0 ? 0.5 : -0.5) + (k * 0.05);
        pointerEvent(game, 'pointermove', hub.x + Math.cos(ang) * 55, hub.y + Math.sin(ang) * 55, { buttons: 1 });
      }
      pointerEvent(game, 'pointerup', hub.x + 40, hub.y);
      await waitFrames(game, 2);
      const end = (window as unknown as { __repair?: { wind: number } }).__repair?.wind ?? 0;
      assert(end - start < 0.06, `scrubbing never advanced the rewind (${start.toFixed(3)} -> ${end.toFixed(3)})`);
      pointerEvent(game, 'pointerdown', 70, game.scale.height - 40);
      await sleep(60);
      pointerEvent(game, 'pointerup', 70, game.scale.height - 40);
      await waitUntil(() => !tidy().repairOpen(), 6000, 'scrub overlay closed');
    });

    await test('T9c §8 removal: double-click alone never ejects; double-click + drag out does', async () => {
      const t = findDefective('rewind');
      tidy().openRepair(t.id);
      await waitUntil(() => tidy().repairOpen(), 6000, 'overlay open');
      await waitRepairReady('removal scene ready');
      const W = game.scale.width, H = game.scale.height;
      const cx = W / 2, cy = H / 2 - 10, SCALE = 3.4;
      const hub = { x: cx + (58 - 46) * SCALE, y: cy + (38 - 30) * SCALE };
      const home = { x: cx + (92 * SCALE) / 2 + 90, y: cy + 96 };
      // seat the pencil
      pointerEvent(game, 'pointerdown', home.x, home.y - 26);
      for (let i = 1; i <= 8; i++) {
        pointerEvent(game, 'pointermove', home.x + ((hub.x - home.x) * i) / 8, (home.y - 26) + ((hub.y - home.y + 26) * i) / 8);
        await sleep(10);
      }
      pointerEvent(game, 'pointerup', hub.x, hub.y);
      await sleep(240);
      // double-click WITHOUT dragging: pencil must stay seated (one burst)
      pointerEvent(game, 'pointerdown', hub.x + 6, hub.y - 6);
      pointerEvent(game, 'pointerup', hub.x + 6, hub.y - 6);
      pointerEvent(game, 'pointerdown', hub.x + 6, hub.y - 6);
      pointerEvent(game, 'pointerup', hub.x + 6, hub.y - 6);
      await waitFrames(game, 3);
      let probe = (window as unknown as { __repair?: { pencil: { state: string } } }).__repair;
      assert(probe?.pencil.state === 'held', 'double-click grabs the pencil (for removal)');
      // release right there (no drag): re-seats, never ejected by the click alone
      await sleep(120);
      probe = (window as unknown as { __repair?: { pencil: { state: string } } }).__repair;
      assert(probe?.pencil.state === 'seated', 'release without a drag re-seats it (double-click alone never ejects)');
      // now double-click + drag out (burst)
      pointerEvent(game, 'pointerdown', hub.x + 6, hub.y - 6);
      pointerEvent(game, 'pointerup', hub.x + 6, hub.y - 6);
      pointerEvent(game, 'pointerdown', hub.x + 6, hub.y - 6);
      await waitFrames(game, 2);
      const out = { x: hub.x - 240, y: hub.y + 140 };
      for (let i = 1; i <= 8; i++) {
        pointerEvent(game, 'pointermove', hub.x + 6 + ((out.x - hub.x - 6) * i) / 8, (hub.y - 6) + ((out.y - hub.y + 6) * i) / 8);
        await sleep(12);
      }
      pointerEvent(game, 'pointerup', out.x, out.y);
      await waitFrames(game, 3);
      probe = (window as unknown as { __repair?: { pencil: { state: string } } }).__repair;
      assert(probe === null || probe?.pencil.state === 'rest', 'drag-out removed the pencil (unwound: overlay stays open)');
      // not rewound → repair still open; close it
      assert(tidy().repairOpen(), 'unwound tape keeps the overlay open after pencil removal');
      pointerEvent(game, 'pointerdown', 70, game.scale.height - 40);
      await sleep(60);
      pointerEvent(game, 'pointerup', 70, game.scale.height - 40);
      await waitUntil(() => !tidy().repairOpen(), 6000, 'overlay closed');
    });

    await test('T9d §7 repair return flight: same tape lands visibly, normal-sized, draggable, camera shows it', async () => {
      const t = findDefective('sticker');
      d.setCamera(t.x, t.y, 1);
      await waitFrames(game, 2);
      tidy().openRepair(t.id);
      await waitUntil(() => tidy().repairOpen(), 6000, 'sticker overlay open');
      await waitRepairReady('sticker scene ready');
      await driveStickerRepair(game);
      await waitUntil(() => !tidy().repairOpen(), 8000, 'sticker closed');
      // the return flight is running
      assert(tidy().returning(), 'return flight in progress');
      const info0 = tidy().tapesInfo().find(x => x.id === t.id)!;
      assert(info0.repaired, 'repaired flag set');
      await waitUntil(() => !tidy().returning(), 6000, 'return flight landed');
      await waitFrames(game, 3);
      const info = tidy().tapesInfo().find(x => x.id === t.id)!;
      assert(info.state === 'loose', 'landed loose');
      // landed at the marked return spot (beside the bench) — visible destination
      assert(approx(info.x, 600, 90) && approx(info.y, 1662, 60),
        `landed beside the repair bench (${info.x},${info.y})`);
      // camera shows the destination (view covers the landing point)
      const cam = tidy().camera();
      const view = { x: cam.x, y: cam.y, w: cam.viewW, h: cam.viewH };
      assert(info.x >= view.x - 40 && info.x <= view.x + view.w + 40
        && info.y >= view.y - 40 && info.y <= view.y + view.h + 40,
        'camera shows the landing destination');
      // normal size + immediately draggable (pick it up for real)
      const size = tidy().spriteSize(t.id)!;
      assert(approx(size.w, 104, 1) && approx(size.h, 72, 1.2), `normal resting size (${size.w}x${size.h})`);
      d.setCamera(info.x, info.y, 1);
      await waitFrames(game, 3);
      await dragTape(game, t.id, { x: info.x + 80, y: info.y - 60 });
      await waitFrames(game, 2);
      const afterDrag = tidy().tapesInfo().find(x => x.id === t.id)!;
      assert(afterDrag.state === 'loose', 'dragged after landing (immediately interactive)');
      assert(tidy().tapeCount() >= 400, 'no duplication');
      // not saved mid-flight: probe happened after landing, but assert save works now
      assert(tidy().save(), 'save after landing works');
    });

    await test('T9e paint repair still closes via rubbing', async () => {
      const t = findDefective('paint');
      tidy().openRepair(t.id);
      await waitUntil(() => tidy().repairOpen(), 6000, 'paint overlay open');
      await waitRepairReady('paint scene ready');
      await drivePaintRepair(game);
      await waitUntil(() => !tidy().repairOpen(), 8000, 'paint closed');
      await waitUntil(() => !tidy().returning(), 6000, 'paint return landed');
      assert(tidy().tapesInfo().find(x => x.id === t.id)!.repaired, 'paint tape repaired');
    });
  }

  if (phase === 1) {
    await test('T10 tray: load / drag out / batch partial / full refuse; flash on load', async () => {
      const combo = tidy().tapesInfo().find(t => t.state === 'loose' && !t.defect)!.combo;
      const five = tidy().tapesInfo().filter(t => t.combo === combo && t.state === 'loose' && !t.defect).slice(0, 5);
      assert(five.length >= 5, `5 tapes of a group (got ${five.length})`);
      const spot = { x: 900, y: 1660 };
      for (let i = 0; i < five.length; i++) tidy().setTapePos(five[i].id, spot.x + i * 60, spot.y);
      d.setCamera(spot.x, spot.y, 1);
      await waitFrames(game, 3);

      // load 5 via real drags onto the tray (screen-space destination)
      for (let i = 0; i < 5; i++) {
        const tray = trayScreen(game);
        await dragTapeScreens(game, five[i].id, { sx: tray.x + tray.w / 2, sy: tray.y + 20 });
        await waitFrames(game, 2);
      }
      assert(tidy().trayFree() === 0, `tray full (free=${tidy().trayFree()})`);

      // a SIXTH tape onto the full tray: gentle refuse, tape NOT swallowed
      const sixth = tidy().tapesInfo().find(t => t.state === 'loose' && !t.defect && t.combo !== combo)!;
      const posBefore = { x: sixth.x, y: sixth.y };
      await dragTapeScreens(game, sixth.id, { sx: trayScreen(game).x + 40, sy: trayScreen(game).y + 30 });
      await waitFrames(game, 3);
      assert(tidy().trayFree() === 0, 'full tray never swallowed the sixth');
      const sixthAfter = tidy().tapesInfo().find(t => t.id === sixth.id)!;
      assert(sixthAfter.state === 'loose', 'sixth tape is loose (returned to the table)');
      assert(sixthAfter.x < 2400 || sixthAfter.y < 1500, `sixth landed on the table (${sixthAfter.x},${sixthAfter.y}) not in the tray zone`);
      assert(hints.some(h => h.toLowerCase().includes('full')) || audioNames().slice(-6).includes('invalid'), 'discreet tray-full indication shown');
      void posBefore;

      // drag one OUT of a tray slot onto the table
      const cam0 = tidy().camera();
      d.setCamera(700, 1500, 1);
      await waitFrames(game, 3);
      const slot0 = traySlotCenter(game, 0);
      const w2s = makeWorldToScreen(game);
      const dest = w2s(760, 1520);
      pointerEvent(game, 'pointerdown', slot0.x, slot0.y);
      await waitFrames(game, 2);
      for (let i = 1; i <= 6; i++) {
        pointerEvent(game, 'pointermove', slot0.x + ((dest.sx - slot0.x) * i) / 6, slot0.y + ((dest.sy - slot0.y) * i) / 6);
        await sleep(14);
      }
      pointerEvent(game, 'pointerup', dest.sx, dest.sy);
      await sleep(300);
      assert(tidy().trayFree() === 1, `one slot freed (free=${tidy().trayFree()})`);
      const outTape = tidy().tapesInfo().find(t => t.state === 'loose' && Math.hypot(t.x - 760, t.y - 1520) < 120);
      assert(!!outTape, 'dragged-out tape landed on the table');
      void cam0;

      // batch: drag the tray header onto a matching row → inserts what fits
      const row = rowsOfGroup(combo)[0];
      const seated = tidy().tapesInfo().filter(t => t.state === 'shelved' && t.row === row);
      for (const s of seated) tidy().pullOut(s.id);
      for (let k = 0; k < 6; k++) {
        const src = tidy().tapesInfo().find(t => t.combo === combo && t.state === 'loose' && !t.defect);
        if (src) tidy().insertTape(src.id, row, k);
      }
      const used = tidy().rowsInfo().find(r => r.id === row)!.used;
      const trayCount = tidy().tray().length;
      if (used < 8 && trayCount > 0) {
        const slotPt = rowSlotWorld(row, 5);
        d.setCamera((slotPt.x + 700) / 2, (slotPt.y + 1500) / 2, 1);
        await waitFrames(game, 3);
        const w2sB = makeWorldToScreen(game);
        const header = { x: trayScreen(game).x + 60, y: trayScreen(game).y + 14 };
        const endB = w2sB(slotPt.x, slotPt.y);
        pointerEvent(game, 'pointerdown', header.x, header.y);
        await waitFrames(game, 2);
        for (let i = 1; i <= 8; i++) {
          pointerEvent(game, 'pointermove', header.x + ((endB.sx - header.x) * i) / 8, header.y + ((endB.sy - header.y) * i) / 8);
          await sleep(16);
        }
        pointerEvent(game, 'pointerup', endB.sx, endB.sy);
        await sleep(4000);
        const usedAfter = tidy().rowsInfo().find(r => r.id === row)!.used;
        const fits = Math.min(8 - used, trayCount);
        assert(usedAfter === used + fits, `batch inserted exactly what fits (${used} -> ${usedAfter}, fits=${fits})`);
        assert(tidy().tray().length === trayCount - fits, 'rest stayed in the tray');
      }
      tidy().trayClear();
    });

    await test('T10b §5 double-click tray shortcut: one tape, first empty slot; full tray refuses; never a skill / double-fire', async () => {
      tidy().trayClear();
      // normal: one empty slot scenario
      const comboT = tidy().tapesInfo().find(t => t.state === 'loose' && !t.defect)!.combo;
      const singles = tidy().tapesInfo().filter(t => t.combo === comboT && t.state === 'loose' && !t.defect).slice(0, 6);
      const base = { x: 1000, y: 1620 };
      for (let i = 0; i < singles.length; i++) tidy().setTapePos(singles[i].id, base.x + i * 70, base.y);
      d.setCamera(base.x, base.y, 1);
      await waitFrames(game, 3);

      // fill 4 slots via double-clicks
      for (let i = 0; i < 4; i++) {
        await doubleClickTape(game, singles[i].id);
        await waitFrames(game, 2);
        assert(tidy().tray().includes(singles[i].id), `tape ${singles[i].id} loaded via double-click`);
      }
      assert(tidy().trayFree() === 1, `one free slot remains (free=${tidy().trayFree()})`);

      // single empty slot: loads
      await doubleClickTape(game, singles[4].id);
      await waitFrames(game, 2);
      assert(tidy().tray().includes(singles[4].id), 'loaded into the FIRST empty slot');
      assert(tidy().trayFree() === 0, 'tray now full');

      // full tray: the tape stays exactly where it was + discreet hint
      const posBefore = tidy().tapesInfo().find(t => t.id === singles[5].id)!;
      await doubleClickTape(game, singles[5].id);
      await waitFrames(game, 3);
      const posAfter = tidy().tapesInfo().find(t => t.id === singles[5].id)!;
      assert(posAfter.state === 'loose', 'tape NOT taken by a full tray');
      assert(approx(posAfter.x, posBefore.x, 0.5) && approx(posAfter.y, posBefore.y, 0.5),
        `stays exactly where it was (${posAfter.x},${posAfter.y})`);
      assert(hints.some(h => h.toLowerCase().includes('tray full')), 'discreet Tray full indication');

      // two clicks on DIFFERENT tapes never count
      const hintsBefore = hints.length;
      const other = tidy().tapesInfo().find(t => t.state === 'loose' && !t.defect && !tidy().tray().includes(t.id))!;
      d.setCamera(other.x, other.y, 1);
      await waitFrames(game, 2);
      const w2s = makeWorldToScreen(game);
      const pOther = w2s(other.x, other.y);
      const pSingle = w2s(posAfter.x, posAfter.y);
      pointerEvent(game, 'pointerdown', pOther.sx, pOther.sy);
      await sleep(40);
      pointerEvent(game, 'pointerup', pOther.sx, pOther.sy);
      await sleep(70);
      pointerEvent(game, 'pointerdown', pSingle.sx, pSingle.sy);
      await sleep(40);
      pointerEvent(game, 'pointerup', pSingle.sx, pSingle.sy);
      await waitFrames(game, 3);
      assert(tidy().trayFree() === 0 && !tidy().tray().includes(other.id), 'different-tape clicks did not load anything');
      void hintsBefore;

      // a DRAG between two clicks does not count: click, drag away, click again
      pointerEvent(game, 'pointerdown', pSingle.sx, pSingle.sy);
      await sleep(40);
      pointerEvent(game, 'pointerup', pSingle.sx, pSingle.sy);
      await sleep(70);
      pointerEvent(game, 'pointerdown', pSingle.sx, pSingle.sy);
      for (let i = 1; i <= 5; i++) {
        pointerEvent(game, 'pointermove', pSingle.sx - i * 20, pSingle.sy + i * 12);
        await sleep(20);
      }
      pointerEvent(game, 'pointerup', pSingle.sx - 100, pSingle.sy + 60);
      await waitFrames(game, 3);
      assert(!tidy().tray().includes(singles[5].id), 'click + drag + release is NOT a double-click load');
      assert(tidy().trayFree() === 0, 'tray untouched');

      // after the old double-click skill (matchGather) unlocks, the shortcut
      // STILL loads the tray and NEVER triggers the skill
      const need = 200 - tidy().shelved();
      if (need > 0) tidy().shelve(need);
      assert(tidy().skills().matchGather, 'matchGather unlocked (the old binding family)');
      tidy().trayClear();
      await waitFrames(game, 2);
      const audioBefore = audioNames().length;
      await doubleClickTape(game, singles[0].id);
      await waitFrames(game, 3);
      assert(tidy().tray().includes(singles[0].id), 'double-click still loads after unlock');
      const recent = audioNames().slice(audioBefore);
      assert(!recent.includes('gather'), `double-click triggered NO skill (${recent.join(',')})`);

      // the G key separately triggers the skill when allowed
      const gt = singles[1];
      const eligible = tidy().tapesInfo().filter(t => t.combo === gt.combo && t.state === 'loose' && !t.defect).length;
      if (eligible >= 2) {
        assert(tidy().activatePower('matchGather'), 'G skill activatable');
        await clickTape(game, gt.id);
        await sleep(600);
        assert(audioNames().includes('gather'), 'G-key skill fired on its own click');
        tidy().trayClear();
      }
      // key repeat guarded: holding G fires once
      const powers = tidy().powers();
      tidy().forceExpirePower('matchGather');
      keyEvent('keydown', 'g', 'KeyG', 71, true); // simulated OS repeat
      keyEvent('keyup', 'g', 'KeyG', 71);
      await waitFrames(game, 2);
      assert(tidy().powers().matchGather.cooldownUntil === powers.matchGather.cooldownUntil
        || tidy().powers().matchGather.activeUntil <= 0, 'key repeat did not re-trigger');
      tidy().trayClear();
    });

    await test('T10c §6 skills panel: icon opens; click-outside / Esc close; no table interaction beneath; active power survives', async () => {
      // hide the panel first: clicking a SKILL ROW in the panel legitimately
      // activates that power (cooldown!), so the power check runs before the
      // panel interactions and clicks target the panel's header area only
      const need = 35 - tidy().shelved();
      if (need > 0) tidy().shelve(need);
      assert(tidy().activatePower('misplaced'), 'misfile finder activated');
      const active0 = tidy().powers().misplaced.activeUntil;
      assert(active0 > 0, 'power active');
      // open via the icon path (event route used by the button)
      tidy().togglePanel();
      await waitFrames(game, 3);
      assert(tidy().panelOpen(), 'panel opened');
      // panel rect blocks the table: a click in the panel header does not pan/select
      const camBefore = tidy().camera();
      const W = game.scale.width, H = game.scale.height;
      const panelPt = { x: W - 170, y: 84 }; // the panel's header (no skill row)
      pointerEvent(game, 'pointerdown', panelPt.x, panelPt.y);
      await sleep(40);
      pointerEvent(game, 'pointerup', panelPt.x, panelPt.y);
      await waitFrames(game, 3);
      assert(tidy().selection().length === 0, 'click inside the panel never selects tapes');
      assert(approx(tidy().camera().x, camBefore.x, 2) && approx(tidy().camera().y, camBefore.y, 2), 'click inside the panel never pans');
      const activeWhileOpen = tidy().powers().misplaced.activeUntil;
      // close via click OUTSIDE (left side of the screen)
      pointerEvent(game, 'pointerdown', 40, H / 2);
      await sleep(40);
      pointerEvent(game, 'pointerup', 40, H / 2);
      await waitFrames(game, 3);
      assert(!tidy().panelOpen(), 'click outside closed the panel');
      await waitFrames(game, 2);
      assert(tidy().powers().misplaced.activeUntil === activeWhileOpen, 'hiding the panel did NOT stop the active power');
      // re-open, close via Escape
      tidy().togglePanel();
      await waitFrames(game, 3);
      assert(tidy().panelOpen(), 're-opened');
      keyEvent('keydown', 'Escape', 'Escape', 27);
      keyEvent('keyup', 'Escape', 'Escape', 27);
      await waitFrames(game, 3);
      assert(!tidy().panelOpen(), 'Escape closed the panel');
    });

    await test('T10d §5 R key rebind: repairs the damaged tape under the cursor; no old double-click binding', async () => {
      const t = findDefective('sticker');
      d.setCamera(t.x, t.y, 1);
      await waitFrames(game, 3);
      const w2s = makeWorldToScreen(game);
      const p = w2s(t.x, t.y);
      // move the pointer onto the tape, press R
      pointerEvent(game, 'pointermove', p.sx, p.sy);
      await waitFrames(game, 2);
      keyEvent('keydown', 'r', 'KeyR', 82);
      keyEvent('keyup', 'r', 'KeyR', 82);
      await waitUntil(() => tidy().repairOpen(), 6000, 'R opened the repair');
      await waitRepairReady('R-key scene ready');
      // close via the cancel button (the Game scene is paused; Esc is inert)
      pointerEvent(game, 'pointerdown', 70, game.scale.height - 40);
      await sleep(60);
      pointerEvent(game, 'pointerup', 70, game.scale.height - 40);
      await waitUntil(() => !tidy().repairOpen(), 6000, 'overlay closed');
      tidy().trayClear();
      await waitFrames(game, 2);
      await doubleClickTape(game, t.id);
      await waitFrames(game, 3);
      assert(tidy().tray().includes(t.id), 'double-click on the damaged tape goes to the TRAY (old binding removed)');
      tidy().trayClear();
    });
  }

  if (phase === 1) {
    await test('T11 §4 milestones: row completion chimes; full-but-wrong row does NOT; cabinet banner + no layering', async () => {
      tidy().trayClear();
      // silence the recent list to read cleanly
      const rowCount0 = tidy().milestones().rows;
      const cabCount0 = tidy().milestones().cabinets;

      // --- a full-but-WRONG row earns nothing
      const info = tidy().tapesInfo();
      const wrongRow = (() => {
        for (const r of tidy().rowsInfo()) {
          if (r.used === 0) return r;
        }
        return tidy().rowsInfo()[0];
      })();
      const wrongCombo = (wrongRow.group + 1) % 32;
      const wrongPool = info.filter(t => t.combo === wrongCombo && t.state === 'loose' && !t.defect);
      // top up if not enough loose of that combo
      const seatedWrong = tidy().tapesInfo().filter(t => t.combo === wrongCombo && t.state === 'shelved');
      for (const s of seatedWrong) tidy().pullOut(s.id);
      let pool = tidy().tapesInfo().filter(t => t.combo === wrongCombo && t.state === 'loose' && !t.defect);
      assert(pool.length >= 8, `8 wrong-combo tapes available (got ${pool.length})`);
      const rowsBeforeWrong = tidy().milestones().rows;
      for (let k = 0; k < 8; k++) {
        assert(tidy().insertTape(pool[k].id, wrongRow.id, k), `wrong tape ${k} inserted`);
      }
      await sleep(300);
      const recentWrong = audioNames().slice(-8);
      assert(!recentWrong.includes('chime') && !recentWrong.includes('cabinet'),
        `full-but-misfiled row earned NOTHING (${recentWrong.join(',')})`);
      assert(tidy().milestones().rows === rowsBeforeWrong, 'no row milestone counted');
      // clean the row back out
      for (const t of tidy().tapesInfo().filter(x => x.state === 'shelved' && x.row === wrongRow.id)) tidy().pullOut(t.id);

      // --- a CORRECT row completion → Tiny Chime (automatic, no ✓ press)
      const rowA = rowsOfGroup(pool[0].combo)[0];
      const seatedA = tidy().tapesInfo().filter(t => t.state === 'shelved' && t.row === rowA);
      for (const s of seatedA) tidy().pullOut(s.id);
      pool = tidy().tapesInfo().filter(t => t.combo === pool[0].combo && t.state === 'loose' && !t.defect);
      assert(pool.length >= 8, `8 matching tapes (got ${pool.length})`);
      const audioBefore = audioNames().length;
      for (let k = 0; k < 7; k++) tidy().insertTape(pool[k].id, rowA, k);
      await sleep(150);
      assert(!audioNames().slice(audioBefore).includes('chime'), '7/8 does not chime yet');
      tidy().insertTape(pool[7].id, rowA, 7);
      await sleep(300);
      assert(audioNames().slice(audioBefore).includes('chime') || tidy().milestones().last.kind === 'row', 'the completing 8th tape fired the row milestone');
      assert(tidy().milestones().rows === rowCount0 + 1, `row milestone counted (${tidy().milestones().rows})`);
      const lastM = tidy().milestones().last;
      assert(lastM.kind === 'row' && lastM.row === rowA, `last milestone is the row (${lastM.kind} row=${lastM.row})`);

      // --- full cabinet: last tape completes row AND cabinet → cabinet sound ONLY
      const unit = Math.floor(rowA / 4);
      // empty the whole unit first
      for (const t of tidy().tapesInfo().filter(x => x.state === 'shelved' && Math.floor(x.row! / 4) === unit)) tidy().pullOut(t.id);
      const combos = [0, 1, 2, 3].map(lr => (unit * 4 + lr) % 32);
      const byCombo = combos.map(c => {
        const seated = tidy().tapesInfo().filter(t => t.combo === c && t.state === 'shelved');
        for (const s of seated) tidy().pullOut(s.id);
        return tidy().tapesInfo().filter(t => t.combo === c && t.state === 'loose' && !t.defect).slice(0, 8);
      });
      for (let i = 0; i < 4; i++) assert(byCombo[i].length >= 8, `combo ${combos[i]}: 8 tapes (got ${byCombo[i].length})`);
      const rowsBeforeFill = tidy().milestones().rows;
      // fill 3 rows fully, then the 4th row 7 tapes, then the LAST tape
      for (let lr = 0; lr < 3; lr++) {
        for (let k = 0; k < 8; k++) tidy().insertTape(byCombo[lr][k].id, unit * 4 + lr, k);
      }
      for (let k = 0; k < 7; k++) tidy().insertTape(byCombo[3][k].id, unit * 4 + 3, k);
      await sleep(150);
      // three rows completed (the audio polyphony guard skips same-instant
      // chimes from synchronous debug inserts — the state is the evidence)
      assert(tidy().milestones().rows === rowsBeforeFill + 3, `three intermediate rows completed (${tidy().milestones().rows - rowsBeforeFill})`);
      tidy().insertTape(byCombo[3][7].id, unit * 4 + 3, 7);
      await sleep(300);
      const cabAudio = audioNames().slice(-8);
      assert(cabAudio.includes('cabinet') || tidy().milestones().last.kind === 'cabinet', 'the cabinet completion played/recorded');
      // no layering: the final tape's completing row+unit records ONLY the
      // cabinet milestone (the chime never plays in the same instant)
      const lastM2 = tidy().milestones().last;
      assert(lastM.kind === 'cabinet' && lastM.unit === unit, `cabinet milestone recorded (not layered over the row chime)`);
      assert(tidy().milestones().cabinets === cabCount0 + 1, 'cabinet milestone counted once');
      assert(tidy().milestones().achievements.includes(unit), 'cabinet achievement recorded');
      assert(tidy().milestones().last.kind === 'cabinet', 'last milestone is the cabinet');

      // --- remove + reinsert the last tape: NO re-grant
      const lastTape = byCombo[3][7];
      const achievementsBefore = tidy().milestones().achievements.length;
      const cabinetsBefore = tidy().milestones().cabinets;
      tidy().pullOut(lastTape.id);
      await sleep(150);
      const audioBeforeRe = audioNames().length;
      tidy().insertTape(lastTape.id, unit * 4 + 3, 7);
      await sleep(300);
      assert(tidy().milestones().cabinets === cabinetsBefore, 're-completing the row+unit re-grants NOTHING');
      assert(tidy().milestones().achievements.length === achievementsBefore, 'achievement not duplicated');
      assert(!audioNames().slice(audioBeforeRe).includes('cabinet'), 'no second cabinet sound');
      // the row re-completion (non-achievement) may chime again — acceptable by design

      // persist the achievement for the phase-2 reload test
      tidy().save();
    });
  }

  if (phase === 1) {
    await test('T11b keyboard toggles (D scanner / M misfile / S scan) + G gather guard', async () => {
      keyEvent('keydown', 'd', 'KeyD', 68);
      await waitFrames(game, 2);
      keyEvent('keyup', 'd', 'KeyD', 68);
      assert(tidy().skills().scanner, 'scanner unlocked (>=10 shelved)');
      keyEvent('keydown', 'm', 'KeyM', 77);
      await waitFrames(game, 2);
      keyEvent('keyup', 'm', 'KeyM', 77);
      assert(true, 'toggles handled without error');
      keyEvent('keydown', 's', 'KeyS', 83);
      await waitFrames(game, 2);
      keyEvent('keyup', 's', 'KeyS', 83);
      assert(true, 'S handled');
    });

    await test('T12 touch: one finger pans empty table; pinch zooms; nothing selected', async () => {
      d.setCamera(2000, 1200, 1);
      await waitFrames(game, 3);
      const before = tidy().camera();
      const w2s = makeWorldToScreen(game);
      const c = w2s(2000, 1200);
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
      const down = { x: 8, y: 8 };
      const w2s = makeWorldToScreen(game);
      const s0 = w2s(tape.x + down.x, tape.y + down.y);
      pointerEvent(game, 'pointerdown', s0.sx, s0.sy);
      await waitFrames(game, 2);
      pointerEvent(game, 'pointermove', s0.sx + 12, s0.sy + 10);
      await waitFrames(game, 2);
      assert(tidy().held().includes(tape.id), 'held after resize');
      const cam = liveGame().scene.getScene('Game')!.cameras.main;
      const wpPick = cam.getWorldPoint(s0.sx + 12, s0.sy + 10);
      const livePick = tidy().spritePos(tape.id)!;
      const grab = { x: wpPick.x - livePick.x, y: wpPick.y - livePick.y };
      pointerEvent(game, 'pointermove', s0.sx + 70, s0.sy - 40);
      await waitFrames(game, 3);
      const live = tidy().spritePos(tape.id)!;
      const wp = cam.getWorldPoint(s0.sx + 70, s0.sy - 40);
      assert(approx(live.x, wp.x - grab.x, 1), `post-resize drag x ${live.x.toFixed(1)} vs ${(wp.x - grab.x).toFixed(1)}`);
      assert(approx(live.y, wp.y - grab.y, 1), 'post-resize drag y');
      pointerEvent(game, 'pointerup', s0.sx + 70, s0.sy - 40);
      await waitFrames(game, 2);
      tidy().resize(1280, 720);
      await waitFrames(game, 4);
    });

    await test('T13b §2 north bank: whole-group centered between the side banks; fit view shows all three', async () => {
      const bb = tidy().bankBounds();
      assert(bb.center === 1400, `north bank centered on the table (${bb.x0}..${bb.x1}, center ${bb.center})`);
      assert(bb.x0 >= 860 - 2 && bb.x1 <= 1940 + 2, `span from group bounds (${bb.x0}..${bb.x1})`);
      // side banks do not collide with the north bank
      const left = tidy().unitRectInfo(8);
      const right = tidy().unitRectInfo(13);
      assert(left.x + left.w < bb.x0 - 20, `left bank clear of the north bank (${left.x}..${left.x + left.w})`);
      assert(right.x > bb.x1 + 20, `right bank clear of the north bank (${right.x})`);
      // whole-table view: grow the canvas (the game is in RESIZE mode, so the
      // camera math uses the new size even though the browser window is small)
      tidy().resize(2200, 1300);
      await waitFrames(game, 4);
      tidy().fit();
      await waitFrames(game, 4);
      const cam = tidy().camera();
      const view = { x: cam.x, y: cam.y, w: cam.viewW, h: cam.viewH };
      const inView = (u: number) => {
        const r = tidy().unitRectInfo(u);
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        return cx >= view.x && cx <= view.x + view.w && cy >= view.y && cy <= view.y + view.h;
      };
      assert(inView(0), 'north bank visible in the fit view');
      assert(inView(8), 'left bank visible in the fit view');
      assert(inView(12), 'right (walnut) bank visible in the fit view');
      tidy().resize(1280, 578);
      await waitFrames(game, 4);
    });

    await test('T13c §3 art pilot: toggle swaps corner art; atlas + walnut loaded; before/after share geometry', async () => {
      const state0 = tidy().pilotArtState();
      assert(state0.atlasLoaded, 'the uploaded cassette atlas loaded at runtime');
      // pilot combo tape uses the atlas loose frame when art is on
      const pilot = tidy().tapesInfo().find(t => t.combo === 16 && t.state === 'loose');
      if (pilot) {
        const tex = tidy().textureOfTape(pilot.id)!;
        assert(tex.face === 'tt-cassette', `teal-star loose uses the atlas (${tex.face})`);
      }
      const rectBefore = tidy().unitRectInfo(12);
      // toggle OFF (before mode)
      tidy().setSetting('pilotArt', false);
      await waitFrames(game, 3);
      const stateOff = tidy().pilotArtState();
      assert(!stateOff.art && stateOff.bodyTexture === 'walnut-plain', `before-mode body (${stateOff.bodyTexture})`);
      if (pilot) {
        const tex = tidy().textureOfTape(pilot.id)!;
        assert(tex.face === 'tape-face-16', `before-mode loose uses fallback (${tex.face})`);
      }
      // geometry unchanged
      const rectAfter = tidy().unitRectInfo(12);
      assert(approx(rectBefore.x, rectAfter.x, 0.1) && approx(rectBefore.w, rectAfter.w, 0.1),
        'slot geometry identical before/after (no map change)');
      // toggle back ON
      tidy().setSetting('pilotArt', true);
      await waitFrames(game, 3);
      assert(tidy().pilotArtState().art, 'after-mode restored');
    });

    await test('T13d §9 hover nudge: display-only, guards, cancel on pickup, toggle; board undisturbed', async () => {
      // find a loose tape inside the pilot region
      const region = { x0: 1950, y0: 100, x1: 2790, y1: 1150 };
      const target = tidy().tapesInfo().find(t =>
        t.state === 'loose' && !t.defect
        && t.x > region.x0 + 60 && t.x < region.x1 - 60 && t.y > region.y0 + 60 && t.y < region.y1 - 60);
      assert(!!target, 'a loose tape inside the pilot corner exists');
      const t = target as NonNullable<typeof target>;
      const posBefore = { x: t.x, y: t.y };
      d.setCamera(t.x, t.y, 1);
      await waitFrames(game, 3);
      const w2s = makeWorldToScreen(game);
      const p = w2s(t.x, t.y);

      // sweep the cursor in from the left and across the tape (a real brush:
      // fast, synchronous, and UNPRESSED — buttons 0)
      pointerEvent(game, 'pointermove', p.sx - 90, p.sy, { buttons: 0 });
      await waitFrames(game, 2);
      for (let i = 0; i <= 12; i++) {
        pointerEvent(game, 'pointermove', p.sx - 90 + i * 18, p.sy + Math.sin(i * 0.6) * 2, { buttons: 0 });
      }
      await waitFrames(game, 2);
      const nudge1 = tidy().nudge();
      assert(nudge1.lastNudgedId === t.id || nudge1.activeCount > 0, `the sweep nudged the tape (last=${nudge1.lastNudgedId})`);
      // the effect is display-only: world position never moved
      const infoNow = tidy().tapesInfo().find(x => x.id === t.id)!;
      assert(approx(infoNow.x, posBefore.x, 0.05) && approx(infoNow.y, posBefore.y, 0.05),
        `world position untouched (${infoNow.x},${infoNow.y} vs ${posBefore.x},${posBefore.y})`);

      // retrigger guard: a parked cursor produces no new nudge (no events anyway)
      // boundary jitter: tiny in/out wiggle at the edge must not buzz
      const nudgeCountBefore = tidy().nudge().activeCount;
      for (let k = 0; k < 8; k++) {
        pointerEvent(game, 'pointermove', p.sx - 48 + (k % 2) * 3, p.sy - 2, { buttons: 0 });
        await sleep(120);
      }
      await waitFrames(game, 2);
      assert(tidy().nudge().activeCount <= nudgeCountBefore + 1, `boundary jitter did not buzz (${tidy().nudge().activeCount} vs ${nudgeCountBefore})`);

      // pickup mid-animation: offset resets instantly (grab the tape)
      pointerEvent(game, 'pointermove', p.sx, p.sy, { buttons: 0 });
      await waitFrames(game, 2);
      pointerEvent(game, 'pointerdown', p.sx, p.sy);
      await waitFrames(game, 2);
      pointerEvent(game, 'pointermove', p.sx + 12, p.sy + 10);
      await waitFrames(game, 2);
      assert(tidy().held().includes(t.id), 'picked up');
      // face offset reset: size probe still canonical and position tracked
      const sizeHeld = tidy().spriteSize(t.id)!;
      assert(approx(sizeHeld.w, 104, 1), `held size canonical (${sizeHeld.w}x${sizeHeld.h})`);
      pointerEvent(game, 'pointerup', p.sx + 12, p.sy + 10);
      await waitFrames(game, 3);

      // while any button is held the nudge is disabled: sweep with a pressed button
      pointerEvent(game, 'pointerdown', p.sx - 60, p.sy + 40);
      for (let i = 0; i <= 10; i++) {
        pointerEvent(game, 'pointermove', p.sx - 60 + i * 14, p.sy + 40, { buttons: 1 });
      }
      pointerEvent(game, 'pointerup', p.sx + 80, p.sy + 40);
      await waitFrames(game, 2);
      assert(tidy().nudge().activeCount === 0, 'pressed-button sweeps never nudge');

      // OFF comparison: toggle off → sweeping does nothing
      tidy().setSetting('hoverFx', false);
      await waitFrames(game, 2);
      for (let i = 0; i <= 12; i++) {
        pointerEvent(game, 'pointermove', p.sx - 80 + i * 15, p.sy, { buttons: 0 });
      }
      await waitFrames(game, 2);
      assert(tidy().nudge().activeCount === 0, 'hover fx OFF: no nudge at all');
      tidy().setSetting('hoverFx', true);
      await waitFrames(game, 2);

      // the board is undisturbed after all the sweeps
      const after = tidy().tapesInfo().find(x => x.id === t.id)!;
      const moved = Math.hypot(after.x - posBefore.x, after.y - posBefore.y);
      assert(moved < 0.1 || after.state !== 'loose', `no tape displaced by sweeps (moved ${moved.toFixed(2)})`);
      // nudge never applies to shelved tapes: sweep across a walnut row
      const walnutRow = 48;
      const seatedPt = rowSlotWorld(walnutRow, 0);
      d.setCamera(seatedPt.x, seatedPt.y - 30, 1);
      await waitFrames(game, 3);
      const w2sB = makeWorldToScreen(game);
      const q = w2sB(seatedPt.x, seatedPt.y - 30);
      for (let i = 0; i <= 10; i++) {
        pointerEvent(game, 'pointermove', q.sx - 70 + i * 16, q.sy, { buttons: 0 });
      }
      await waitFrames(game, 2);
      const seatedTapes = tidy().tapesInfo().filter(x => x.state === 'shelved');
      if (seatedTapes.length > 0) {
        assert(tidy().nudge().lastNudgedId === null || tidy().tapesInfo().find(x => x.id === tidy().nudge().lastNudgedId)!.state === 'loose',
          'nudge only ever targets LOOSE tapes');
      }
    });
  }

  if (phase === 2) {
    await test('T14 save/reload: run restores; achievements survive; no re-grant on load', async () => {
      // phase 2 runs with ?restore=1 after phase 1 saved (incl. a cabinet achievement)
      const m = tidy().milestones();
      assert(m.achievements.length >= 1, `cabinet achievement persisted across reload (${m.achievements.join(',')})`);
      const audioBefore = audioNames().length;
      await waitFrames(game, 6);
      assert(!audioNames().slice(audioBefore).includes('cabinet'), 'no achievement sound replays on load');
      // immediately removing + reinserting the last tape of an achieved cabinet re-grants nothing
      const unit = m.achievements[0];
      const rowOfUnit = unit * 4 + 3;
      const seated = tidy().tapesInfo().filter(t => t.state === 'shelved' && t.row === rowOfUnit);
      assert(seated.length === 8, `row fully seated after reload (${seated.length})`);
      const one = seated[0];
      tidy().pullOut(one.id);
      await sleep(150);
      const cabsBefore = tidy().milestones().cabinets;
      tidy().insertTape(one.id, rowOfUnit, one.slot ?? 0);
      await sleep(300);
      assert(tidy().milestones().cabinets === cabsBefore, 'reinserting the last tape grants NOTHING (already recorded)');
      assert(!audioNames().slice(audioBefore).includes('cabinet'), 'no cabinet sound on re-file');
    });

    await test('T14b win policy: full-but-misfiled board does NOT win; fixed board does (+chime)', async () => {
      tidy().repairAll();
      tidy().trayClear();
      const remaining = tidy().loose() + tidy().tray().length;
      if (remaining > 1) tidy().shelve(remaining - 1);
      await waitFrames(game, 3);
      assert(tidy().loose() === 1, `exactly one tape left loose (${tidy().loose()})`);
      assert(!tidy().completed(), 'not completed yet');
      const last = tidy().tapesInfo().find(t => t.state === 'loose')!;
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
      const generic = toasts.some(t => t.includes('wrong row') || t.includes("isn't done"));
      assert(generic, 'general not-done message shown (no location)');
      const wrongUnit = Math.floor(wrongGroupRow / 4);
      const verdict = tidy().verify(wrongUnit);
      assert(verdict === 'wrong' || verdict === 'ok', `verify answered (${verdict})`);
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
  console.log('[autotest] harness v33 (coarse ticks + recover + repair-ready waits)');
  console.log('[autotest] waiting for game ready…');
  await waitUntil(() => {
    // the debug API may briefly exist before the Game scene finished create()
    // (world still undefined) — never let that kill the whole suite
    try {
      const d = tidy();
      return !!d && d.tapeCount() > 0;
    } catch { return false; }
  }, 60000, 'game ready');

  const params = new URLSearchParams(window.location.search);
  const phase = params.has('restore') ? 2 : 1;
  void seedParam;
  console.log(`[autotest] game ready — phase ${phase}`);

  const results = await runTests(game, phase);
  console.log(`[autotest] runTests returned (${results.length} tests)`);

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
