/**
 * Tidy Tapes — drag & drop controller.
 * Cursor-accurate rule: the grab offset is recomputed from the ACTIVE camera
 * every frame (camera.getWorldPoint), so panning/zooming with a stationary
 * pointer keeps the exact grab point under the cursor. The held tape itself is
 * never tweened (no lag); smoothness comes only from the release insert tween.
 */
import Phaser from 'phaser';
import { RACK_SLOTS, SPINE_H, benchRect, rackRect, slotPos } from '../config';
import { audio } from '../audio';
import type { GameScene, RackView, TapeView } from '../scenes/GameScene';
import type { SkillsController } from './SkillsController';
import type { Tape } from '../types';

interface Held {
  tapes: TapeView[];
  lead: TapeView;
  grabOffset: { x: number; y: number };
  pointerId: number;
  origin: Map<number, { x: number; y: number; rot: number }>;
  fromSelection: boolean;
  fromGather: boolean;
  downAt: number;
  downScreen: { x: number; y: number };
}

const FAN: [number, number][] = [
  [0, 0], [-58, 42], [58, 42], [0, 78], [116, 42], [-116, 42], [174, 42], [-174, 42], [232, 42],
];

export class DragController {
  scene: GameScene;
  skills!: SkillsController;
  held: Held | null = null;
  private hoverGlow: Phaser.GameObjects.Graphics;
  private ghostSpine: Phaser.GameObjects.Image;
  private hoverCombo: number | null = null;
  private panDrag: { pointerId: number; last: { x: number; y: number } } | null = null;
  private touchPan: { pointers: number[]; centroid: { x: number; y: number } } | null = null;

  constructor(scene: GameScene) {
    this.scene = scene;
    this.hoverGlow = scene.add.graphics().setDepth(200000).setVisible(false);
    this.ghostSpine = scene.add.image(0, 0, 'spine-0').setDepth(199999).setVisible(false).setAlpha(0.35);
  }

  // ------------------------------------------------------------------ pickup
  onPointerDown(pointer: Phaser.Input.Pointer): void {
    const cam = this.scene.cameras.main;
    const wp = cam.getWorldPoint(pointer.x, pointer.y);

    // right/middle button on empty table => camera pan
    if (pointer.rightButtonDown()) {
      this.panDrag = { pointerId: pointer.id, last: { x: pointer.x, y: pointer.y } };
      return;
    }

    // touch: two-finger pan (never conflicts with drag or selection)
    if (pointer.wasTouch) {
      const active = [pointer, ...this.scene.input.manager.pointers].filter(
        p => p.wasTouch && p.isDown,
      );
      const uniq = active.filter((p, i, arr) => arr.findIndex(q => q.id === p.id) === i);
      if (uniq.length >= 2) {
        if (this.held) {
          this.releaseHeldOnTable(this.held.tapes, wp);
          this.held = null;
        }
        // two fingers: hand over from single-finger pan to pinch-pan
        // (otherwise both pan paths fire and cancel each other out)
        this.panDrag = null;
        this.skills.cancelMarquee();
        this.touchPan = {
          pointers: uniq.map(p => p.id),
          centroid: {
            x: uniq.reduce((s, p) => s + p.x, 0) / uniq.length,
            y: uniq.reduce((s, p) => s + p.y, 0) / uniq.length,
          },
        };
        return;
      }
    }

    // tape pickup?
    const tapeView = this.tapeAtWorld(wp.x, wp.y);
    if (tapeView && this.held === null) {
      this.beginDrag(tapeView, pointer);
      return;
    }

    // empty-table gesture: marquee only when unlocked (touch also needs
    // explicit Select mode, so touch pan/drag/selection never share a gesture).
    // Before unlock the gesture pans the camera (no batch pickup possible).
    const marqueeArmed =
      !!this.skills?.unlocked.marquee && (!pointer.wasTouch || this.skills.selectMode);
    if (marqueeArmed && !pointer.rightButtonDown()) {
      this.skills.beginMarquee(wp, pointer.id);
    } else {
      this.panDrag = { pointerId: pointer.id, last: { x: pointer.x, y: pointer.y } };
    }
  }

  private tapeAtWorld(x: number, y: number): TapeView | null {
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
      if (Math.abs(lx) <= 46 && Math.abs(ly) <= 30 && c.depth > bestDepth) {
        best = view;
        bestDepth = c.depth;
      }
    }
    return best;
  }

  beginDrag(lead: TapeView, pointer: Phaser.Input.Pointer): void {
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
      // small pickup pop (juice, not lag — position still tracks the pointer)
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
      downAt: this.scene.time.now,
      downScreen: { x: pointer.x, y: pointer.y },
    };
    audio.play('pickup');
    this.skills.onGrabSelection(lead.id);
    if (window.location.search.includes('autotest')) {
      console.log(`[drag] grabbed tape ${lead.id} group=${group.map(v => v.id).join(',')}`);
    }
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
      // fly-in toward the bundle spot (compact, does not obscure the screen)
      const f = FAN[i] ?? [i * 58, 42];
      this.scene.tweens.add({
        targets: c, x: wp.x + f[0], y: wp.y + 40 + f[1], rotation: 0,
        duration: 220, ease: 'cubic.easeout', delay: i * 40,
      });
    });
    this.held = {
      tapes: views,
      lead,
      grabOffset: { x: 0, y: 40 }, // stack sits just under the cursor
      pointerId,
      origin,
      fromSelection: false,
      fromGather: true,
      downAt: this.scene.time.now,
      downScreen: { x: pointer.x, y: pointer.y },
    };
  }

  // ------------------------------------------------------------------- frame
  onPointerMove(pointer: Phaser.Input.Pointer): void {
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
        this.touchPan.centroid = { x: cx, y: cy };
      }
      return;
    }
    if (this.held === null && this.skills?.marqueeActive && pointer.id === this.skills.marqueePointerId) {
      const wp = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.skills.updateMarquee(wp);
    }
  }

  update(): void {
    const held = this.held;
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

    // hover slot preview (matching rack with a free slot only)
    const rack = this.scene.rackUnder(wp.x, wp.y);
    const leadTape = this.scene.tapeData(held.lead.id) as Tape;
    if (rack && rack.combo === leadTape.combo) {
      const slot = rack.slots.findIndex(s => s === null);
      this.updateHover(rack.combo, slot >= 0 ? slot : null);
    } else {
      this.updateHover(null, null);
    }
  }

  private updateHover(combo: number | null, slot: number | null): void {
    if (combo === this.hoverCombo) {
      if (combo !== null && slot !== null && this.ghostSpine.visible) {
        const p = slotPos(combo, slot);
        this.ghostSpine.setPosition(p.x, p.y);
      }
      return;
    }
    this.hoverCombo = combo;
    if (combo === null || slot === null) {
      this.hoverGlow.setVisible(false);
      this.ghostSpine.setVisible(false);
      return;
    }
    const p = slotPos(combo, slot);
    this.hoverGlow.clear().setVisible(true);
    this.hoverGlow.lineStyle(2.5, 0xf6efdd, 0.95);
    this.hoverGlow.fillStyle(0xf6efdd, 0.12);
    this.hoverGlow.fillRoundedRect(p.x - 9, p.y - SPINE_H / 2 - 2, 18, SPINE_H + 4, 4);
    this.hoverGlow.strokeRoundedRect(p.x - 9, p.y - SPINE_H / 2 - 2, 18, SPINE_H + 4, 4);
    this.ghostSpine.setTexture(`spine-${combo}`).setPosition(p.x, p.y).setVisible(true);
  }

  // -------------------------------------------------------------------- drop
  onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.panDrag) { this.panDrag = null; return; }
    if (this.touchPan) { this.touchPan = null; return; }
    if (this.skills?.marqueeActive) {
      this.skills.endMarquee();
      return;
    }
    const held = this.held;
    if (!held) return;

    // click (no drag, quick): selection for Slot Guide / powers / repair open
    const moved = Math.hypot(pointer.x - held.downScreen.x, pointer.y - held.downScreen.y);
    const elapsed = this.scene.time.now - held.downAt;
    if (moved < 7 && elapsed < 260) {
      this.returnHeldToOrigin(held);
      this.held = null;
      this.skills.onTapeClick(held.lead.id);
      return;
    }

    const cam = this.scene.cameras.main;
    const wp = cam.getWorldPoint(pointer.x, pointer.y);
    const rack = this.scene.rackUnder(wp.x, wp.y);
    const onBench = this.scene.benchUnder(wp.x, wp.y);
    const leadTape = this.scene.tapeData(held.lead.id) as Tape;

    if (rack && rack.combo === leadTape.combo) {
      const freeSlots: number[] = [];
      rack.slots.forEach((s, i) => { if (s === null) freeSlots.push(i); });
      const compatible = held.tapes.filter(v => {
        const t = this.scene.tapeData(v.id) as Tape;
        return t.combo === rack.combo && !(t.defect && !t.repaired);
      });
      const toInsert = compatible.slice(0, freeSlots.length);
      const leftovers = held.tapes.filter(v => !toInsert.includes(v));
      if (toInsert.length > 0) {
        this.held = null;
        this.commitBatchInsert(toInsert, rack.combo, freeSlots, leftovers);
        return;
      }
      this.refuseDrop(held, rack.combo);
      return;
    }
    if (rack && rack.combo !== leadTape.combo) {
      this.refuseDrop(held, rack.combo);
      return;
    }
    if (onBench && leadTape.defect && !leadTape.repaired) {
      // bench drop: repair the lead; others fan near the bench edge
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

  /** invalid drop: gentle shake + hint; tapes land visibly below the rack */
  private refuseDrop(held: Held, combo: number): void {
    audio.play('invalid');
    const label = this.scene.comboLabel(combo);
    this.scene.game.events.emit('hint', `This row collects ${label} tapes`);
    const r = rackRect(combo);
    const wp = { x: r.x + r.w / 2, y: r.y + r.h + 52 };
    this.releaseHeldOnTable(held.tapes, wp);
    this.held = null;
  }

  /**
   * Slot reservation happens immediately (race-free, save-consistent);
   * the turn+slide animation is pure presentation, staggered ~90 ms per tape.
   */
  private commitBatchInsert(tapes: TapeView[], combo: number, freeSlots: number[], leftovers: TapeView[]): void {
    const scene = this.scene;
    const rack = scene.world.racks[combo];

    tapes.forEach((view, i) => {
      const t = scene.tapeData(view.id) as Tape;
      const slotIdx = freeSlots[i];
      // ---- data commit (before any tween; state stays internally consistent)
      t.state = 'shelved';
      t.slot = slotIdx;
      t.rot = 0;
      rack.slots[slotIdx] = t.id;
      scene.sortedCount++;
      const rv = scene.rackViews.get(combo) as RackView;
      rv.slots[slotIdx] = view.spine;
      scene.updateRackCount(combo);
      // ---- presentation: turn edge-on + slide, staggered
      this.animateInsert(view, combo, slotIdx, i * 90);
    });

    scene.skills.onShelved(scene.sortedCount);
    scene.emitCounters();
    scene.checkCompletion();
    scene.save();
    this.updateHover(null, null);

    if (leftovers.length) {
      const r = rackRect(combo);
      const fan = { x: r.x + r.w / 2 + 24, y: r.y + r.h + 62 };
      scene.time.delayedCall(tapes.length * 90, () => {
        this.releaseHeldOnTable(leftovers, fan);
      });
      scene.game.events.emit('hint', 'No compatible free slots left — the rest wait on the table');
    }
  }

  private animateInsert(view: TapeView, combo: number, slot: number, delayMs: number): void {
    const scene = this.scene;
    const target = slotPos(combo, slot);
    scene.time.delayedCall(delayMs, () => {
      audio.play('glide'); // soft plastic glide starts as the tape begins to enter
      const c = view.container;
      if (view.overlay) view.overlay.setVisible(false);
      scene.tweens.add({
        targets: c,
        scaleY: { from: 1, to: 0.14 }, scaleX: { from: 1, to: 0.55 },
        duration: 110, ease: 'sine.easein',
        onComplete: () => {
          view.face.setVisible(false);
          view.spine.setVisible(true);
          c.setScale(1);
          scene.tweens.add({
            targets: c, x: target.x, y: target.y, rotation: 0,
            duration: 180, ease: 'sine.easeinout',
            onComplete: () => {
              audio.play('tick'); // tiny quiet seating tick
              scene.tweens.add({
                targets: c, scaleY: { from: 1, to: 0.9 }, duration: 60, yoyo: true, ease: 'sine.easein',
                onComplete: () => c.setScale(1, 1),
              });
              c.setDepth(4.5);
            },
          });
        },
      });
    });
  }

  /** release a set of tapes onto the table in a readable fan; never lost */
  releaseHeldOnTable(tapes: TapeView[], anchor: { x: number; y: number }): void {
    tapes.forEach((view, i) => {
      const t = this.scene.tapeData(view.id) as Tape;
      const f = FAN[i] ?? [i * 60, 60];
      const spot = this.findTableSpot(anchor.x + f[0], anchor.y + f[1]);
      const c = view.container;
      c.setPosition(spot.x, spot.y).setRotation(0).setDepth(spot.y);
      this.scene.tweens.add({ targets: c, scaleY: { from: 0.92, to: 1 }, duration: 90, ease: 'sine.easeout' });
      if (view.overlay) view.overlay.setVisible(t.defect !== null && !t.repaired);
      t.x = Math.round(spot.x * 10) / 10;
      t.y = Math.round(spot.y * 10) / 10;
      t.rot = 0;
      t.state = 'loose';
      t.slot = null;
      this.scene.time.delayedCall(i * 60, () => audio.play('place'));
    });
    this.scene.emitCounters();
    this.scene.save();
  }

  /** nearest valid table position (bounds + out of racks/bench) */
  findTableSpotPublic(x: number, y: number): { x: number; y: number } {
    return this.findTableSpot(x, y);
  }

  private findTableSpot(x: number, y: number): { x: number; y: number } {
    const WORLD_W = this.scene.world.worldW;
    const WORLD_H = this.scene.world.worldH;
    let px = Phaser.Math.Clamp(x, 70, WORLD_W - 70);
    let py = Phaser.Math.Clamp(y, 90, WORLD_H - 70);
    for (let attempt = 0; attempt < 3; attempt++) {
      let moved = false;
      for (const rack of this.scene.world.racks) {
        const r = rackRect(rack.combo);
        if (px >= r.x - 40 && px <= r.x + r.w + 40 && py >= r.y - 34 && py <= r.y + r.h + 40) {
          py = r.y + r.h + 52 + (attempt * 14);
          moved = true;
        }
      }
      const b = benchRect();
      if (px >= b.x - 40 && px <= b.x + b.w + 40 && py >= b.y - 40 && py <= b.y + b.h + 40) {
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
    if (this.held) {
      this.returnHeldToOrigin(this.held);
      this.held = null;
    }
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
