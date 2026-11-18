/**
 * Tidy Tapes — drag & drop controller (v3).
 *
 * Input scheme (v3 §5): LEFT button = interaction + navigation. A left press on
 * a tape arms a drag behind a small movement threshold (click vs drag); a left
 * press on empty table pans (no Space needed; Space+drag still works). The
 * RIGHT button draws the marquee selection rectangle once Marquee Pickup is
 * unlocked (it does not pan); before unlock right-drag pans like v2. Wheel zoom
 * and touch (one-finger pan + two-finger pinch) are preserved.
 *
 * Double-left-click a tape loads that ONE tape into the first empty carry-tray
 * slot (basic, pre-skill; works loose or removable-shelved; a full tray leaves
 * the tape exactly where it was). Double-clicks never move a selection, never
 * fire twice, and never trigger skills: single-click actions are deferred
 * ~240 ms and canceled by the second click of a pair. The old defective-tape
 * double-click repair opener is rebinded to the R key.
 *
 * Cursor-accurate rule (kept from v1): the grab offset is recomputed from the
 * ACTIVE camera every frame. Insertion keeps the three-beat align → turn →
 * slide-under-the-lip move, now with pose-correct scale math (v3 §1) and the
 * milestone check firing exactly when the tape finishes seating (v3 §4).
 */
import Phaser from 'phaser';
import {
  CLICK_MOVE_THRESHOLD, DEFERRED_CLICK_MS, DOUBLE_CLICK_MS, INSERT_ALIGN_MS,
  INSERT_SLIDE_MS, INSERT_STAGGER_MS, INSERT_TURN_MS,
  UNITS, UNIT_H, UNIT_W, benchRect, rowRect, slotPos,
  trayScreenRect, unitOfRow, unitPos, isPilotUnit,
} from '../config';
import { defectBlocksFiling } from '../types';
import { audio } from '../audio';
import {
  looseSpec, spineSpec, turnSpec, setLoosePose, setSeatedPose, LOOSE_HIT,
} from '../poses';
import type { GameScene, TapeView } from '../scenes/GameScene';
import type { SkillsController } from './SkillsController';
import type { Row, Tape } from '../types';

interface Held {
  tapes: TapeView[];
  lead: TapeView;
  grabOffset: { x: number; y: number };
  pointerId: number;
  origin: Map<number, { x: number; y: number; rot: number }>;
  fromSelection: boolean;
  fromGather: boolean;
  fromTray: boolean;
  downAt: number;
  downScreen: { x: number; y: number };
}

/** a press on a tape waiting for the click/drag threshold */
interface PendingTape {
  view: TapeView;
  pointerId: number;
  downScreen: { x: number; y: number };
  downAt: number;
}

const FAN: [number, number][] = [
  [0, 0], [-58, 42], [58, 42], [0, 78], [116, 42], [-116, 42], [174, 42], [-174, 42], [232, 42],
];

export class DragController {
  scene: GameScene;
  skills!: SkillsController;
  held: Held | null = null;
  /** dragging the whole carry tray (batch file); tapes stay in the tray until insert */
  trayBatchDrag: { pointerId: number } | null = null;
  private hoverGlow: Phaser.GameObjects.Graphics;
  private ghostSpine: Phaser.GameObjects.Image;
  private hoverRow: number | null = null;
  private panDrag: { pointerId: number; last: { x: number; y: number } } | null = null;
  private pendingTape: PendingTape | null = null;
  private touchPan: {
    pointers: number[];
    centroid: { x: number; y: number };
    dist: number;
  } | null = null;
  private fxGfx: Phaser.GameObjects.Graphics;
  // click bookkeeping (double-click detection + deferred single clicks)
  private lastClick: { id: number; x: number; y: number; at: number } | null = null;
  private deferredClick: { view: TapeView; timer: Phaser.Time.TimerEvent } | null = null;

  constructor(scene: GameScene) {
    this.scene = scene;
    this.hoverGlow = scene.add.graphics().setDepth(200000).setVisible(false);
    this.ghostSpine = scene.add.image(0, 0, 'spine-0').setDepth(199999).setVisible(false).setAlpha(0.35);
    this.fxGfx = scene.add.graphics().setDepth(150010);
  }

  panDragActive(): boolean { return this.panDrag !== null; }

  // ------------------------------------------------------------------ pickup
  onPointerDown(pointer: Phaser.Input.Pointer): void {
    const cam = this.scene.cameras.main;
    const wp = cam.getWorldPoint(pointer.x, pointer.y);
    this.pendingTape = null;

    // touch: two-finger pinch (zoom + pan); never conflicts with drag or selection
    if (pointer.wasTouch) {
      const active = [pointer, ...this.scene.input.manager.pointers].filter(
        p => p.wasTouch && p.isDown,
      );
      const uniq = active.filter((p, i, arr) => arr.findIndex(q => q.id === p.id) === i);
      if (uniq.length >= 2) {
        if (this.held) {
          this.returnHeldToOrigin(this.held);
          this.held = null;
        }
        this.panDrag = null;
        this.skills?.cancelMarquee();
        const cx = uniq.reduce((s, p) => s + p.x, 0) / uniq.length;
        const cy = uniq.reduce((s, p) => s + p.y, 0) / uniq.length;
        this.touchPan = {
          pointers: uniq.map(p => p.id),
          centroid: { x: cx, y: cy },
          dist: Math.hypot(uniq[0].x - uniq[1].x, uniq[0].y - uniq[1].y) || 1,
        };
        return;
      }
    }

    // RIGHT button: marquee once unlocked (does NOT pan); pans before unlock (v2)
    if (pointer.rightButtonDown()) {
      if (this.skills?.unlocked.marquee && !pointer.wasTouch) {
        this.skills.beginMarquee(wp, pointer.id);
      } else {
        this.panDrag = { pointerId: pointer.id, last: { x: pointer.x, y: pointer.y } };
      }
      return;
    }
    if (pointer.middleButtonDown && pointer.middleButtonDown()) {
      this.panDrag = { pointerId: pointer.id, last: { x: pointer.x, y: pointer.y } };
      return;
    }

    // Space+drag: pan (never conflicts with pickup — even over a tape)
    if (this.scene.keys?.SPACE?.isDown) {
      this.panDrag = { pointerId: pointer.id, last: { x: pointer.x, y: pointer.y } };
      return;
    }

    // touch in explicit Select mode: empty-table drag draws the marquee (v2 kept)
    if (pointer.wasTouch && this.skills?.selectMode && this.skills?.unlocked.marquee) {
      const loose = this.looseTapeAtWorld(wp.x, wp.y);
      const seated = this.seatedTapeAtWorld(wp.x, wp.y);
      if (!loose && !seated) {
        this.skills.beginMarquee(wp, pointer.id);
        return;
      }
    }

    // LEFT button over a tape: arm a threshold-gated pickup (click vs drag)
    const looseView = this.looseTapeAtWorld(wp.x, wp.y);
    const seatedView = this.seatedTapeAtWorld(wp.x, wp.y);
    if ((looseView || seatedView) && this.held === null) {
      const view = (looseView ?? seatedView) as TapeView;
      this.pendingTape = {
        view, pointerId: pointer.id,
        downScreen: { x: pointer.x, y: pointer.y },
        downAt: this.scene.time.now,
      };
      return;
    }

    // empty table: LEFT drag pans (v3 §5 — no Space, no mode toggle)
    this.panDrag = { pointerId: pointer.id, last: { x: pointer.x, y: pointer.y } };
  }

  looseTapeAtWorldPublic(x: number, y: number): TapeView | null {
    return this.looseTapeAtWorld(x, y);
  }

  private looseTapeAtWorld(x: number, y: number): TapeView | null {
    let best: TapeView | null = null;
    let bestDepth = -Infinity;
    for (const view of this.scene.tapeViews.values()) {
      const t = this.scene.tapeData(view.id) as Tape;
      if (t.state !== 'loose') continue;
      const c = view.container;
      const dx = x - c.x;
      const dy = y - c.y;
      const cos = Math.cos(-c.rotation);
      const sin = Math.sin(-c.rotation);
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      if (Math.abs(lx) <= LOOSE_HIT.w / 2 && Math.abs(ly) <= LOOSE_HIT.h / 2 && c.depth > bestDepth) {
        best = view;
        bestDepth = c.depth;
      }
    }
    return best;
  }

  private seatedTapeAtWorld(x: number, y: number): TapeView | null {
    for (const view of this.scene.tapeViews.values()) {
      const t = this.scene.tapeData(view.id) as Tape;
      if (t.state !== 'shelved') continue;
      const c = view.container;
      const u = unitOfRow(t.row as number);
      if (isPilotUnit(u)) {
        // taller visible spine above the seat point
        if (Math.abs(x - c.x) <= 12 && y >= c.y - 68 && y <= c.y + 6) return view;
      } else if (Math.abs(x - c.x) <= 13 && Math.abs(y - c.y) <= 19) {
        return view;
      }
    }
    return null;
  }

  beginDrag(lead: TapeView, pointer: Phaser.Input.Pointer, fromTray = false): void {
    const cam = this.scene.cameras.main;
    const wp = cam.getWorldPoint(pointer.x, pointer.y);

    // group: whole marquee selection (cap 5) or just this tape
    let group: TapeView[] = [lead];
    if (this.skills?.unlocked.marquee && this.skills.selection.has(lead.id)) {
      group = [...this.skills.selection]
        .map(id => this.scene.tapeViews.get(id))
        .filter((v): v is TapeView => !!v && this.scene.tapeData(v.id)?.state === 'loose')
        .slice(0, 5);
      if (!group.includes(lead)) group.unshift(lead);
      group = group.slice(0, 5);
    }

    const origin = new Map<number, { x: number; y: number; rot: number }>();
    group.forEach((v, i) => {
      const c = v.container;
      origin.set(v.id, { x: c.x, y: c.y, rot: c.rotation });
      c.setDepth(100000 + i);
      // any live hover-nudge offset dies the instant the tape is picked up
      this.scene.nudge?.resetTape(v);
      // small pickup pop (juice, not lag — position still tracks the pointer;
      // scale returns to exactly 1 before any other pose transition)
      this.scene.tweens.add({
        targets: c, scaleX: { from: 1, to: 1.05 }, scaleY: { from: 1, to: 1.05 },
        duration: 70, yoyo: true, ease: 'sine.easeout',
      });
      this.scene.tweens.add({ targets: c, rotation: 0, duration: 80, ease: 'sine.easeout' });
    });

    this.held = {
      tapes: group,
      lead,
      grabOffset: { x: wp.x - lead.container.x, y: wp.y - lead.container.y },
      pointerId: pointer.id,
      origin,
      fromSelection: this.skills?.selection.has(lead.id) ?? false,
      fromGather: false,
      fromTray,
      downAt: this.scene.time.now,
      downScreen: { x: pointer.x, y: pointer.y },
    };
    audio.play('pickup');
    this.skills.onGrabSelection(lead.id);
  }

  /** pull a seated tape out of its slot (canonical loose pose + begin drag) */
  private pullOut(view: TapeView, pointer: Phaser.Input.Pointer): void {
    const cam = this.scene.cameras.main;
    const wp = cam.getWorldPoint(pointer.x, pointer.y);
    const t = this.scene.tapeData(view.id) as Tape;
    this.scene.unseatTape(t.id);
    const c = view.container;
    // §1: restore the EXACT loose dimensions, origin and hit area; kill any
    // tween left over from the insertion (the oversized-tape bug)
    setLoosePose(this.scene, view, t);
    t.x = c.x; t.y = c.y; t.rot = 0;
    this.beginDrag(view, pointer);
    this.scene.emitCounters();
  }

  /** Match Gather: hold a bundle gathered by the power (compact stack, capped). */
  holdGathered(views: TapeView[], pointerId: number): void {
    if (views.length === 0) return;
    const lead = views[0];
    const pointer = this.scene.input.manager.pointers.find(p => p.id === pointerId)
      ?? this.scene.input.activePointer;
    const wp = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const origin = new Map<number, { x: number; y: number; rot: number }>();
    views.forEach((v, i) => {
      const c = v.container;
      origin.set(v.id, { x: c.x, y: c.y, rot: c.rotation });
      c.setDepth(100000 + i);
      const f = FAN[i] ?? [i * 58, 42];
      this.scene.tweens.add({
        targets: c, x: wp.x + f[0], y: wp.y + 40 + f[1], rotation: 0,
        duration: 220, ease: 'cubic.easeout', delay: i * 40,
      });
    });
    this.held = {
      tapes: views,
      lead,
      grabOffset: { x: 0, y: 40 },
      pointerId,
      origin,
      fromSelection: false,
      fromGather: true,
      fromTray: false,
      downAt: this.scene.time.now,
      downScreen: { x: pointer.x, y: pointer.y },
    };
  }

  /** start a whole-tray batch drag (tapes stay in the tray until the drop) */
  beginTrayBatchDrag(pointer: Phaser.Input.Pointer): void {
    if (this.trayBatchDrag || this.held) return;
    if (this.scene.trayIds().length === 0) return;
    this.trayBatchDrag = { pointerId: pointer.id };
    this.scene.game.registry.set('trayBatchPos', { x: pointer.x, y: pointer.y });
  }

  /** drag one tape OUT of a tray slot (the tape becomes a normal held tape) */
  beginDragFromTray(slot: number, pointer: Phaser.Input.Pointer): void {
    if (this.held || this.trayBatchDrag) return;
    const scene = this.scene;
    const id = scene.trayTapes[slot];
    if (id === null) return;
    scene.trayRemoveAt(slot); // data: tray slot freed, view restored
    const view = scene.tapeViews.get(id);
    const t = scene.tapeData(id);
    if (!view || !t) return;
    const cam = scene.cameras.main;
    const wp = cam.getWorldPoint(pointer.x, pointer.y);
    const c = view.container;
    setLoosePose(scene, view, t);
    c.setVisible(true).setPosition(wp.x, wp.y).setRotation(0).setAlpha(1);
    t.state = 'loose';
    t.x = wp.x; t.y = wp.y; t.rot = 0; t.row = null; t.slot = null;
    scene.emitCounters();
    this.beginDrag(view, pointer, true);
  }

  // ------------------------------------------------------- click vs double-click
  /**
   * A quick press+release without crossing the threshold on a tape.
   * Second click on the SAME tape within the window = double-click → tray
   * shortcut. Otherwise the single-click action (guide / powers) is deferred
   * and canceled if a second click arrives.
   */
  private onTapeClick(view: TapeView, pointer: Phaser.Input.Pointer): void {
    const t = this.scene.tapeData(view.id) as Tape | undefined;
    if (!t) return;
    const now = this.scene.time.now;
    const last = this.lastClick;
    if (last && last.id === view.id && now - last.at < DOUBLE_CLICK_MS
      && Math.hypot(pointer.x - last.x, pointer.y - last.y) < 24) {
      // double-click: tray shortcut (one tape, first empty slot, never a skill)
      if (this.deferredClick) {
        this.deferredClick.timer.remove(false);
        this.deferredClick = null;
      }
      this.lastClick = null;
      this.trayShortcut(view);
      return;
    }
    this.lastClick = { id: view.id, x: pointer.x, y: pointer.y, at: now };
    if (this.deferredClick) {
      this.deferredClick.timer.remove(false);
      this.deferredClick = null;
    }
    const timer = this.scene.time.delayedCall(DEFERRED_CLICK_MS, () => {
      this.deferredClick = null;
      this.skills?.onTapeClick(view.id);
    });
    this.deferredClick = { view, timer };
  }

  /** double-left-click → move that ONE tape into the first empty tray slot */
  private trayShortcut(view: TapeView): void {
    const scene = this.scene;
    const t = scene.tapeData(view.id);
    if (!t) return;
    if (scene.trayFreeSlots() === 0) {
      // a full tray never swallows the tape: it stays exactly where it was
      audio.play('invalid');
      scene.game.events.emit('hint', 'Tray full (5/5) — remove a tape first');
      return;
    }
    if (t.state === 'shelved') {
      // removable shelved tape: pull it out through the real data path, then load
      scene.unseatTape(t.id);
      setLoosePose(scene, view, t);
      scene.emitCounters();
    }
    if (t.state !== 'loose') return;
    scene.trayLoad(t.id); // stows the world view + flashes the tray slot
    audio.play('place');
    scene.emitCounters();
  }

  // ------------------------------------------------------------------- frame
  onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.trayBatchDrag && pointer.id === this.trayBatchDrag.pointerId) {
      this.scene.game.registry.set('trayBatchPos', { x: pointer.x, y: pointer.y });
      return;
    }
    if (this.panDrag && pointer.id === this.panDrag.pointerId) {
      const dx = pointer.x - this.panDrag.last.x;
      const dy = pointer.y - this.panDrag.last.y;
      this.panDrag.last = { x: pointer.x, y: pointer.y };
      this.scene.panCamera(-dx, -dy);
      return;
    }
    if (this.touchPan) {
      const tp = this.touchPan;
      const active = this.scene.input.manager.pointers.filter(p => p.isDown && tp.pointers.includes(p.id));
      if (active.length >= 2) {
        const cx = active.reduce((s, p) => s + p.x, 0) / active.length;
        const cy = active.reduce((s, p) => s + p.y, 0) / active.length;
        this.scene.panCamera(this.touchPan.centroid.x - cx, this.touchPan.centroid.y - cy);
        const dist = Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y) || 1;
        if (Math.abs(dist - tp.dist) > 1.5) {
          this.scene.zoomAt(cx, cy, this.scene.cameras.main.zoom * (dist / tp.dist));
          tp.dist = dist;
        }
        tp.centroid = { x: cx, y: cy };
      }
      return;
    }
    if (this.held === null && this.skills?.marqueeActive && pointer.id === this.skills.marqueePointerId) {
      const wp = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.skills.updateMarquee(wp);
      return;
    }
    // threshold crossing turns an armed tape press into a real pickup/drag
    if (this.pendingTape && pointer.id === this.pendingTape.pointerId && this.held === null) {
      const moved = Math.hypot(pointer.x - this.pendingTape.downScreen.x, pointer.y - this.pendingTape.downScreen.y);
      if (moved >= CLICK_MOVE_THRESHOLD) {
        const { view } = this.pendingTape;
        const t = this.scene.tapeData(view.id) as Tape | undefined;
        this.pendingTape = null;
        if (!t) return;
        if (t.state === 'shelved') this.pullOut(view, pointer);
        else this.beginDrag(view, pointer);
      }
    }
  }

  update(): void {
    // self-heal: if a pointerup was ever swallowed (input edge cases), resolve
    // the dangling drag at the pointer's last position instead of freezing it
    if (this.trayBatchDrag) {
      const bp = this.scene.input.manager.pointers.find(p => p.id === this.trayBatchDrag!.pointerId);
      if (bp && !bp.isDown) this.resolveTrayBatch(bp);
      return;
    }
    const held = this.held;
    if (held) {
      const hp = this.scene.input.manager.pointers.find(p => p.id === held.pointerId)
        ?? this.scene.input.activePointer;
      if (!hp.isDown) { this.onPointerUp(hp); return; }
    }
    if (!held) { this.updateHover(null, null); return; }
    // cursor-accurate: recompute every frame from the ACTIVE camera
    const pointer = this.scene.input.manager.pointers.find(p => p.id === held.pointerId)
      ?? this.scene.input.activePointer;
    const wp = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const leadX = wp.x - held.grabOffset.x;
    const leadY = wp.y - held.grabOffset.y;
    held.lead.container.setPosition(leadX, leadY);
    for (let i = 1; i < held.tapes.length; i++) {
      const f = FAN[i] ?? [i * 60, 60];
      held.tapes[i].container.setPosition(leadX + f[0], leadY + f[1]);
    }

    // hover slot preview: ANY row with a free slot, nearest to the pointer.
    // Identical presentation for every tape (no correctness information).
    const leadTape = this.scene.tapeData(held.lead.id) as Tape;
    const row = this.scene.rowUnder(wp.x, wp.y);
    const previewable = !defectBlocksFiling(leadTape.defect) || leadTape.repaired;
    if (row && previewable) {
      const freeSlots: number[] = [];
      row.slots.forEach((s, i) => { if (s === null) freeSlots.push(i); });
      if (freeSlots.length > 0) {
        let nearest = freeSlots[0];
        let bestD = Infinity;
        for (const k of freeSlots) {
          const p = slotPos(row.id, k);
          const d = Math.abs(p.x - wp.x);
          if (d < bestD) { bestD = d; nearest = k; }
        }
        this.updateHover(row.id, nearest);
        return;
      }
    }
    this.updateHover(null, null);
  }

  private updateHover(rowId: number | null, slot: number | null): void {
    const same = rowId === this.hoverRow;
    if (same && rowId !== null && slot !== null && this.ghostSpine.visible) {
      const p = slotPos(rowId, slot);
      this.ghostSpine.setPosition(p.x, p.y);
      return;
    }
    this.hoverRow = rowId;
    if (rowId === null || slot === null) {
      this.hoverGlow.setVisible(false);
      this.ghostSpine.setVisible(false);
      return;
    }
    const p = slotPos(rowId, slot);
    const u = unitOfRow(rowId);
    const pilot = isPilotUnit(u);
    const spec = spineSpec(0, u); // size template for this cabinet family
    this.hoverGlow.clear().setVisible(true);
    this.hoverGlow.lineStyle(2.5, 0xf6efdd, 0.95);
    this.hoverGlow.fillStyle(0xf6efdd, 0.12);
    const gy = pilot ? p.y - spec.h - 3 : p.y - spec.h / 2 - 3;
    const gh = spec.h + (pilot ? 8 : 6);
    this.hoverGlow.fillRoundedRect(p.x - spec.w / 2 - 2, gy, spec.w + 4, gh, 4);
    this.hoverGlow.strokeRoundedRect(p.x - spec.w / 2 - 2, gy, spec.w + 4, gh, 4);
    const leadTape = this.held ? this.scene.tapeData(this.held.lead.id) as Tape : null;
    if (leadTape) {
      this.ghostSpine.setTexture(`spine-${leadTape.combo}`)
        .setOrigin(spec.origin[0], spec.origin[1])
        .setDisplaySize(spec.w, spec.h)
        .setPosition(p.x, p.y)
        .setVisible(true);
    }
  }

  // -------------------------------------------------------------------- drop
  onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.panDrag) {
      this.panDrag = null;
      // a click on empty table (no drag) clears the selection — quick deselect
      return;
    }
    if (this.touchPan) { this.touchPan = null; return; }
    if (this.skills?.marqueeActive) {
      this.skills.endMarquee();
      return;
    }
    if (this.trayBatchDrag) {
      if (pointer.id === this.trayBatchDrag.pointerId) this.resolveTrayBatch(pointer);
      return;
    }
    // armed press that never crossed the threshold = CLICK on a tape
    if (this.pendingTape && pointer.id === this.pendingTape.pointerId) {
      const { view, downAt, downScreen } = this.pendingTape;
      this.pendingTape = null;
      const moved = Math.hypot(pointer.x - downScreen.x, pointer.y - downScreen.y);
      if (moved < CLICK_MOVE_THRESHOLD && this.scene.time.now - downAt < 400) {
        this.onTapeClick(view, pointer);
      }
      return;
    }
    const held = this.held;
    if (!held) return;

    const cam = this.scene.cameras.main;
    const wp = cam.getWorldPoint(pointer.x, pointer.y);
    const row = this.scene.rowUnder(wp.x, wp.y);
    const onBench = this.scene.benchUnder(wp.x, wp.y);
    const leadTape = this.scene.tapeData(held.lead.id) as Tape;
    const tray = trayScreenRect(this.scene.scale.width, this.scene.scale.height);
    const overTray = pointer.x >= tray.x && pointer.x <= tray.x + tray.w
      && pointer.y >= tray.y - 10 && pointer.y <= tray.y + tray.h + 10;

    // drop onto the carry tray: load what fits, extras return to their spots
    if (overTray) {
      this.loadIntoTray(held);
      return;
    }

    // any row with a free slot accepts any tape (hidden correctness)
    if (row) {
      const insertable = held.tapes.filter(v => {
        const t = this.scene.tapeData(v.id) as Tape;
        return t.repaired || !defectBlocksFiling(t.defect);
      });
      if (insertable.length > 0) {
        this.held = null;
        this.commitBatchInsert(insertable, row.id, wp.x, held);
        return;
      }
      // defective tapes refuse with the visible-damage hint (not a misfile tell)
      this.refuseDefective(held);
      return;
    }
    if (onBench && leadTape.defect && !leadTape.repaired) {
      const others = held.tapes.filter(v => v !== held.lead);
      this.held = null;
      this.scene.skills.openRepair(leadTape.id, others);
      return;
    }

    // plain table drop (also the safe path for leftover batches)
    const fromSel = held.fromSelection;
    this.releaseHeldOnTable(held.tapes, wp);
    this.held = null;
    if (fromSel) this.skills.clearSelection();
  }

  /** load the held group into free tray slots; extras go back to their origin */
  private loadIntoTray(held: Held): void {
    const scene = this.scene;
    const free = scene.trayFreeSlots();
    if (free === 0) {
      // a full tray never swallows a sixth tape
      audio.play('invalid');
      scene.game.events.emit('hint', 'The tray is full (5/5)');
      const ptr = scene.input.manager.pointers.find(p => p.id === held.pointerId)
        ?? scene.input.activePointer;
      const wp = scene.cameras.main.getWorldPoint(ptr.x, ptr.y);
      this.releaseHeldOnTable(held.tapes, wp);
      this.held = null;
      return;
    }
    const load = held.tapes.slice(0, free);
    const extras = held.tapes.slice(free);
    const origin = held.origin;
    this.held = null;
    for (const v of load) {
      scene.trayLoad(v.id);
      const c = v.container;
      scene.tweens.add({
        targets: c, scaleX: { from: 1, to: 0.9 }, scaleY: { from: 1, to: 0.9 }, alpha: 0,
        duration: 160, ease: 'sine.easein',
        onComplete: () => { c.setScale(1); c.setVisible(false); },
      });
    }
    audio.play('place');
    if (extras.length > 0) {
      this.returnHeldToOrigin({ ...held, tapes: extras, origin });
      scene.game.events.emit('hint', `Tray took ${load.length} — ${extras.length} stayed on the table`);
    }
    scene.emitCounters();
    scene.save();
  }

  /** tray batch drop: insert tray tapes into the row under the pointer, keep the rest */
  private resolveTrayBatch(pointer: Phaser.Input.Pointer): void {
    this.trayBatchDrag = null;
    this.scene.game.registry.set('trayBatchPos', null);
    const cam = this.scene.cameras.main;
    const wp = cam.getWorldPoint(pointer.x, pointer.y);
    const row = this.scene.rowUnder(wp.x, wp.y);
    if (!row) return; // dropped nowhere: the tray keeps its tapes (cancel)
    const ids = this.scene.trayIds();
    const insertable = ids.map(id => this.scene.tapeData(id) as Tape)
      .filter(t => t.repaired || !defectBlocksFiling(t.defect));
    if (insertable.length === 0) {
      audio.play('invalid');
      this.scene.game.events.emit('hint', 'Those need repairs before they can be filed');
      return;
    }
    const freeSlots: number[] = [];
    row.slots.forEach((s, i) => { if (s === null) freeSlots.push(i); });
    const views = insertable.slice(0, freeSlots.length).map(t => this.scene.tapeViews.get(t.id))
      .filter((v): v is TapeView => !!v);
    if (views.length === 0) return;
    const restCount = ids.length - views.length;
    // remove from tray (data), place views above the row, then the shared insert path
    for (const v of views) {
      this.scene.trayRemoveTape(v.id);
      const t = this.scene.tapeData(v.id) as Tape;
      const p = slotPos(row.id, 0);
      setLoosePose(this.scene, v, t);
      v.container.setVisible(true).setPosition(p.x, p.y - 60).setRotation(0).setAlpha(1);
      t.state = 'loose';
      t.x = p.x; t.y = p.y - 60; t.rot = 0;
    }
    this.commitBatchInsert(views, row.id, wp.x, null, true);
    if (restCount > 0) {
      this.scene.game.events.emit('hint', `Only ${views.length} fit — ${restCount} stayed in the tray`);
    }
  }

  /** invalid drop for damaged tapes: gentle shake + damage hint (visible damage) */
  private refuseDefective(held: Held): void {
    audio.play('invalid');
    this.scene.game.events.emit('hint', 'This one needs a repair first (drop it on the bench)');
    held.tapes.forEach(view => {
      const c = view.container;
      this.scene.tweens.add({
        targets: c, x: { from: c.x, to: c.x + 8 }, duration: 50, yoyo: true, repeat: 3,
      });
    });
    this.returnHeldToOrigin(held);
    this.held = null;
  }

  /**
   * Slot reservation happens immediately (race-free, save-consistent);
   * presentation: align -> turn -> slide under the lip, staggered per tape.
   * The milestone check fires when each tape finishes seating.
   */
  private commitBatchInsert(
    tapes: TapeView[], rowId: number, wpX: number, held: Held | null, fromTray = false,
  ): void {
    const scene = this.scene;
    const row = scene.world.rows[rowId];
    const freeSlots: number[] = [];
    row.slots.forEach((s, i) => { if (s === null) freeSlots.push(i); });
    // nearest-to-pointer slot first, outward
    freeSlots.sort((a, b) =>
      Math.abs(slotPos(rowId, a).x - wpX) - Math.abs(slotPos(rowId, b).x - wpX));

    const toInsert = tapes.slice(0, freeSlots.length);
    const leftovers = tapes.slice(freeSlots.length);

    toInsert.forEach((view, i) => {
      const slotIdx = freeSlots[i];
      scene.seatTape(view.id, rowId, slotIdx); // data commit before any tween
      this.animateInsert(view, rowId, slotIdx, i * INSERT_STAGGER_MS);
    });

    scene.skills.onShelved(scene.sortedCount);
    scene.emitCounters();
    scene.checkCompletion();
    scene.save();
    this.updateHover(null, null);

    if (leftovers.length) {
      if (fromTray || held?.fromTray) {
        // leftovers came out of the tray / batch: keep them there
        for (const v of leftovers) scene.trayLoad(v.id);
      } else {
        const r = rowRect(rowId);
        const fan = { x: r.x + r.w / 2 + 24, y: r.y + r.h + 58 };
        scene.time.delayedCall(toInsert.length * INSERT_STAGGER_MS + 120, () => {
          this.releaseHeldOnTable(leftovers, fan);
        });
        scene.game.events.emit('hint', 'No free slots left in that row — the rest wait below');
      }
    }
    if (held?.fromSelection) this.skills.clearSelection();
  }

  /**
   * The money shot: align over the opening, turn broad-face -> edge-on, slide a
   * short visible distance under the unit lip, seat with a soft tuck — using
   * each pose's EXPLICIT display sizes (never the previous sprite's scale).
   */
  private animateInsert(view: TapeView, rowId: number, slot: number, delayMs: number): void {
    const scene = this.scene;
    const tape = scene.tapeData(view.id) as Tape;
    const target = slotPos(rowId, slot);
    const u = unitOfRow(rowId);
    const lr = rowId % 4;
    const seatDepth = unitPos(u).y + 1 + lr * 0.02;
    const slideDepth = unitPos(u).y + 1.5; // under the lip overlay, over the body
    const c = view.container;
    const loose = looseSpec(tape.combo);
    const spine = spineSpec(tape.combo, u);
    const turn = isPilotUnit(u) ? turnSpec(tape.combo) : null;
    const standOff = isPilotUnit(u) ? 44 : 40;

    scene.time.delayedCall(delayMs, () => {
      if (view.overlay) view.overlay.setVisible(false);
      audio.play('tuck'); // soft descending shff starts as the tape begins to enter
      const trace = window.location.search.includes('autotest') ? (m: string) => console.log('[insert]', m) : () => undefined;
      trace('beat1 start');
      // beat 1: align over the selected opening
      scene.tweens.add({
        targets: c, x: target.x, y: target.y - standOff, rotation: 0,
        duration: INSERT_ALIGN_MS, ease: 'sine.easeout',
        onComplete: () => {
          trace('beat1 done');
          // beat 2: turn broad face -> edge-on (pose-correct scale targets)
          const face = view.face;
          const natW = face.frame?.width ?? face.width;
          const natH = face.frame?.height ?? face.height;
          const sx0 = loose.w / natW;
          const sy0 = loose.h / natH;
          if (turn) {
            // pilot art: swap to the turn frame, keeping the visual center put
            face.setTexture(turn.texture, turn.frame);
            face.setOrigin(turn.origin[0], turn.origin[1]);
            face.setDisplaySize(turn.w, turn.h);
            face.setPosition(0, 0);
            // ease the anchor point to the turn pose's home so nothing jumps
            this.scene.tweens.add({
              targets: face,
              x: (0.5 - turn.origin[0]) * turn.w,
              y: (0.5 - turn.origin[1]) * turn.h,
              duration: INSERT_TURN_MS, ease: 'sine.easeinout',
            });
          } else {
            scene.tweens.add({
              targets: face,
              scaleX: { from: sx0, to: spine.w / natW },
              scaleY: { from: sy0, to: Math.min(spine.h, loose.h * 0.5) / natH },
              duration: INSERT_TURN_MS, ease: 'sine.easein',
            });
          }
          const spineChild = view.spine;
          spineChild.setTexture(spine.texture, spine.frame)
            .setOrigin(spine.origin[0], spine.origin[1])
            .setDisplaySize(spine.w, spine.h)
            .setPosition(0, 0) // identical convention to setSeatedPose: no seat jump
            .setAlpha(0).setVisible(true);
          scene.tweens.add({
            targets: spineChild, alpha: { from: 0, to: 1 }, duration: INSERT_TURN_MS, ease: 'sine.easeout',
            onComplete: () => { face.setVisible(false).setAlpha(1); },
          });
          scene.time.delayedCall(INSERT_TURN_MS, () => {
            trace('beat3 start');
            c.setDepth(slideDepth);
            this.drawMotionStrokes(target.x, target.y - 26);
            // beat 3: slide under the lip into the seat
            scene.tweens.add({
              targets: c, y: target.y, duration: INSERT_SLIDE_MS, ease: 'sine.easeinout',
              onComplete: () => {
                trace('beat3 done');
                audio.play('tuk'); // muted plastic tuck exactly when it seats
                c.setDepth(seatDepth);
                scene.tweens.add({
                  targets: c, scaleY: { from: 1, to: 0.92 }, duration: 55, yoyo: true, ease: 'sine.easein',
                  onComplete: () => {
                    c.setScale(1, 1);
                    trace('seated');
                    // §1: the seated pose is explicit; nothing persists from the tween
                    setSeatedPose(scene, view, tape, u);
                    // §4: milestones fire exactly when the tape finishes seating
                    scene.onTapeSeatedFinished(rowId);
                  },
                });
              },
            });
          });
        },
      });
    });
  }

  /** two short, quiet curved motion strokes behind the entering tape (one pair) */
  private drawMotionStrokes(x: number, y: number): void {
    try {
      const g = this.fxGfx;
      g.clear();
      g.lineStyle(2.4, 0xf6efdd, 0.55);
      for (const side of [-1, 1]) {
        const bx = x + side * 14;
        const cx = bx + side * 7;
        // quadratic sampled manually (Graphics has no curve commands in 3.90)
        g.beginPath();
        g.moveTo(bx, y - 26);
        for (let k = 1; k <= 6; k++) {
          const t = k / 6;
          const px = (1 - t) * (1 - t) * bx + 2 * (1 - t) * t * cx + t * t * bx;
          const py = (1 - t) * (1 - t) * (y - 26) + 2 * (1 - t) * t * (y - 12) + t * t * (y + 2);
          g.lineTo(px, py);
        }
        g.strokePath();
      }
      scene_tween(this.scene, g, { alpha: 0 }, 260, () => g.clear());
    } catch { /* fx must never break the game loop */ }
  }

  /** release a set of tapes onto the table in a readable fan; never lost */
  releaseHeldOnTable(tapes: TapeView[], anchor: { x: number; y: number }): void {
    tapes.forEach((view, i) => {
      const t = this.scene.tapeData(view.id) as Tape;
      const f = FAN[i] ?? [i * 60, 60];
      const spot = this.findTableSpot(anchor.x + f[0], anchor.y + f[1]);
      const c = view.container;
      setLoosePose(this.scene, view, t);
      c.setPosition(spot.x, spot.y).setRotation(0).setDepth(spot.y);
      this.scene.tweens.add({ targets: c, scaleY: { from: 0.92, to: 1 }, duration: 90, ease: 'sine.easeout' });
      t.x = Math.round(spot.x * 10) / 10;
      t.y = Math.round(spot.y * 10) / 10;
      t.rot = 0;
      t.state = 'loose';
      t.row = null; t.slot = null;
      this.scene.time.delayedCall(i * 60, () => audio.play('place'));
    });
    this.scene.nudge?.markDirty();
    this.scene.emitCounters();
    this.scene.save();
  }

  findTableSpotPublic(x: number, y: number): { x: number; y: number } {
    return this.findTableSpot(x, y);
  }

  /** nearest valid table position (bounds + out of units/bench) */
  private findTableSpot(x: number, y: number): { x: number; y: number } {
    const WORLD_W = this.scene.world.worldW;
    const WORLD_H = this.scene.world.worldH;
    const inAnyRect = (
      px: number, py: number,
      rects: { x: number; y: number; w: number; h: number }[], padX: number, padY: number,
    ): { x: number; y: number; w: number; h: number } | null => {
      for (const r of rects) {
        if (px >= r.x - padX && px <= r.x + r.w + padX && py >= r.y - padY && py <= r.y + r.h + padY) return r;
      }
      return null;
    };
    let px = Phaser.Math.Clamp(x, 70, WORLD_W - 70);
    let py = Phaser.Math.Clamp(y, 90, WORLD_H - 70);
    const unitRects = [...Array(UNITS).keys()].map(uu => {
      const p = unitPos(uu);
      return { x: p.x, y: p.y, w: UNIT_W, h: UNIT_H };
    });
    for (let attempt = 0; attempt < 4; attempt++) {
      let moved = false;
      const ur = inAnyRect(px, py, unitRects, 44, 38);
      if (ur) { py = ur.y + ur.h + 54 + attempt * 16; moved = true; }
      const b = benchRect();
      if (px >= b.x - 44 && px <= b.x + b.w + 44 && py >= b.y - 44 && py <= b.y + b.h + 44) {
        px = b.x + b.w + 60 + attempt * 20;
        moved = true;
      }
      if (!moved) break;
      px = Phaser.Math.Clamp(px, 70, WORLD_W - 70);
      py = Phaser.Math.Clamp(py, 90, WORLD_H - 70);
    }
    return { x: px, y: py };
  }

  /** cancel (Esc): everything returns exactly to where it was picked up */
  cancel(): void {
    if (this.trayBatchDrag) {
      this.trayBatchDrag = null;
      this.scene.game.registry.set('trayBatchPos', null);
      return;
    }
    if (this.held) {
      const held = this.held;
      this.held = null;
      if (held.fromTray) {
        for (const v of held.tapes) this.scene.trayLoad(v.id);
        return;
      }
      this.returnHeldToOrigin(held);
    }
    this.pendingTape = null;
    this.panDrag = null;
    this.touchPan = null;
  }

  private returnHeldToOrigin(held: Held): void {
    held.tapes.forEach(view => {
      const o = held.origin.get(view.id);
      if (!o) return;
      const t = this.scene.tapeData(view.id) as Tape;
      const c = view.container;
      c.setPosition(o.x, o.y).setRotation(o.rot).setDepth(o.y);
      t.x = o.x; t.y = o.y; t.rot = o.rot;
    });
  }
}

function scene_tween(
  scene: Phaser.Scene, targets: Phaser.GameObjects.Graphics,
  props: { alpha: number }, duration: number, onComplete: () => void,
): void {
  scene.tweens.add({ targets, ...props, duration, ease: 'sine.easeout', onComplete });
}
