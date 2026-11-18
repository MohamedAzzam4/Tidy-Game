/**
 * Tidy Tapes — hover nudge (v3 §9, board-wide since v4).
 *
 * A MOVING, unpressed cursor brushing into the edge of ANY loose tape nudges
 * the topmost eligible tape once: ~1° tilt + a 1–2 px visual offset easing back
 * over ~150–220 ms. The effect animates the FACE CHILD only — the tape's world
 * position, hit area, depth (sorting) and save data are untouched. Retriggers
 * are guarded (parked cursor / boundary jitter / movement within the same tape
 * never buzz). Disabled for any pressed button, while holding/dragging/panning/
 * selecting, over HUD or the repair view, for shelved or carried tapes, and
 * never synthesized for touch. Reduced-motion disables it entirely.
 *
 * The candidate search is spatially local: a coarse grid hash of every loose
 * tape on the board — only the cells around the cursor are examined.
 */
import Phaser from 'phaser';
import { NUDGE } from './config';
import type { GameScene, TapeView } from './scenes/GameScene';
import type { Tape } from './types';

const TILT = NUDGE.tiltDeg * Math.PI / 180;

export class HoverNudge {
  private scene: GameScene;
  private enabledFlag = true;
  private reducedMotion = false;
  private hash = new Map<number, TapeView[]>();
  private hashDirty = true;
  private lastHover: TapeView | null = null;
  private lastNudgeAt = new Map<number, number>();
  private lastPointer: { x: number; y: number; t: number } | null = null;
  /** introspection for tests/dev */
  lastNudgedId: number | null = null;
  activeCount = 0;

  constructor(scene: GameScene) {
    this.scene = scene;
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.reducedMotion = true;
      }
    } catch { /* ignore */ }
  }

  setEnabled(on: boolean, reducedMotion = this.reducedMotion): void {
    this.enabledFlag = on;
    this.reducedMotion = reducedMotion;
    if (!this.active()) this.resetAll();
  }

  get enabled(): boolean {
    return this.enabledFlag;
  }

  private active(): boolean {
    return this.enabledFlag && !this.reducedMotion;
  }

  markDirty(): void {
    this.hashDirty = true;
  }

  private rebuild(): void {
    this.hash.clear();
    const cell = NUDGE.cell;
    for (const view of this.scene.tapeViews.values()) {
      const t = this.scene.tapeData(view.id) as Tape | undefined;
      if (!t || t.state !== 'loose') continue;
      const key = Math.floor(t.x / cell) * 8192 + Math.floor(t.y / cell);
      const list = this.hash.get(key) ?? [];
      list.push(view);
      this.hash.set(key, list);
    }
    this.hashDirty = false;
  }

  /** cancel + reset any live visual offset immediately (input takeover) */
  resetAll(): void {
    for (const view of this.hash.values()) {
      for (const v of view) this.resetTape(v);
    }
    this.lastHover = null;
    this.activeCount = 0;
  }

  /** reset one tape's face child (display-only state) without touching its data */
  resetTape(view: TapeView): void {
    this.scene.tweens.killTweensOf(view.face);
    if (view.face.x !== 0 || view.face.y !== 0 || view.face.rotation !== 0) {
      view.face.setPosition(0, 0).setRotation(0);
    }
  }

  onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.active()) return;
    // any pressed button, an active drag/pan/marquee, or a blocked UI = off
    if (!pointer.noButtonDown()
      || this.scene.drag.held !== null
      || this.scene.drag.panDragActive()
      || this.scene.drag.trayBatchDrag !== null
      || (this.scene.skills?.marqueeActive ?? false)) {
      this.resetAll();
      return;
    }
    if (pointer.wasTouch) return; // never synthesize hover for touch
    if (this.scene.uiBlockedFlag()) return;
    if (this.scene.pointerOverUI(pointer)) { this.lastHover = null; return; }
    if (this.scene.returningTape) return;

    const cam = this.scene.cameras.main;
    const wp = cam.getWorldPoint(pointer.x, pointer.y);

    // a MOVING cursor only: the pointer must have actually traveled
    let speed = Infinity;
    if (this.lastPointer) {
      const dt = Math.max(1, this.scene.time.now - this.lastPointer.t);
      const dist = Math.hypot(pointer.x - this.lastPointer.x, pointer.y - this.lastPointer.y);
      speed = dist / dt; // px per ms
    }
    this.lastPointer = { x: pointer.x, y: pointer.y, t: this.scene.time.now };

    if (this.hashDirty) this.rebuild();

    // topmost eligible tape under the cursor, from the local cells only
    const cell = NUDGE.cell;
    const cx = Math.floor(wp.x / cell);
    const cy = Math.floor(wp.y / cell);
    let best: TapeView | null = null;
    let bestDepth = -Infinity;
    for (let gx = -1; gx <= 1; gx++) {
      for (let gy = -1; gy <= 1; gy++) {
        for (const view of this.hash.get((cx + gx) * 8192 + (cy + gy)) ?? []) {
          const t = this.scene.tapeData(view.id) as Tape | undefined;
          if (!t || t.state !== 'loose') continue;
          const c = view.container;
          const dx = wp.x - c.x;
          const dy = wp.y - c.y;
          const cos = Math.cos(-c.rotation);
          const sin = Math.sin(-c.rotation);
          const lx = dx * cos - dy * sin;
          const ly = dx * sin + dy * cos;
          if (Math.abs(lx) <= 52 && Math.abs(ly) <= 34 && c.depth > bestDepth) {
            best = view;
            bestDepth = c.depth;
          }
        }
      }
    }

    if (best === null) { this.lastHover = null; return; }
    if (best === this.lastHover) return; // moving within the same tape: no retrigger
    this.lastHover = best;

    if (speed < NUDGE.minSpeed) return; // parked / crawling cursor
    const now = this.scene.time.now;
    if ((this.lastNudgeAt.get(best.id) ?? -1) > now - NUDGE.retriggerGuardMs) return;

    this.lastNudgeAt.set(best.id, now);
    this.nudge(best, wp.x > best.container.x ? 1 : -1);
  }

  /** the visual nudge: face child tilt + tiny offset, easing back (display-only) */
  private nudge(view: TapeView, dir: number): void {
    const face = view.face;
    this.scene.tweens.killTweensOf(face);
    face.setPosition(0, 0).setRotation(0);
    this.lastNudgedId = view.id;
    this.activeCount++;
    this.scene.tweens.add({
      targets: face,
      rotation: dir * TILT,
      x: dir * NUDGE.offsetX,
      y: NUDGE.offsetY,
      duration: NUDGE.outMs,
      ease: 'sine.easeout',
      onComplete: () => {
        this.scene.tweens.add({
          targets: face,
          rotation: 0, x: 0, y: 0,
          duration: NUDGE.backMs,
          ease: 'sine.easeinout',
          onComplete: () => { this.activeCount = Math.max(0, this.activeCount - 1); },
        });
      },
    });
  }
}
