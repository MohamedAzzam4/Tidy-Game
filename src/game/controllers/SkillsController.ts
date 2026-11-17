/**
 * Tidy Tapes — skills, marquee selection, slot guide and the two powers.
 * Powers gate ONLY themselves (15 s active / 60 s cooldown); expiry never
 * touches held tapes or the sorting session (no fail state anywhere).
 */
import Phaser from 'phaser';
import { GATHER_CAP, MARQUEE_CAP, POWER_ACTIVE_MS, POWER_COOLDOWN_MS, SKILL_THRESHOLDS, rackRect, slotPos } from '../config';
import { audio } from '../audio';
import type { GameScene, TapeView } from '../scenes/GameScene';
import type { SkillId, Tape } from '../types';

export type PowerId = 'matchScan' | 'matchGather';

export interface PowerState { unlocked: boolean; activeUntil: number; cooldownUntil: number }

const SKILL_INFO: Record<SkillId, { name: string; hint: string }> = {
  scanner: { name: 'Defect Scanner', hint: 'D — highlight tapes that need repair' },
  guide: { name: 'Slot Guide', hint: 'Click a tape to see where it belongs' },
  misplaced: { name: 'Misplaced Finder', hint: 'M — highlight tapes still loose' },
  marquee: { name: 'Marquee Pickup', hint: 'Drag a box on the table to select up to 5' },
  matchScan: { name: 'Match Scan', hint: 'Click a tape: highlights same color + symbol' },
  matchGather: { name: 'Match Gather', hint: 'Click a tape: gathers its loose matches' },
};

export class SkillsController {
  scene: GameScene;
  unlocked: Record<SkillId, boolean> = {
    scanner: false, guide: false, misplaced: false, marquee: false, matchScan: false, matchGather: false,
  };
  powers: Record<PowerId, PowerState> = {
    matchScan: { unlocked: false, activeUntil: 0, cooldownUntil: 0 },
    matchGather: { unlocked: false, activeUntil: 0, cooldownUntil: 0 },
  };
  scannerOn = false;
  misplacedOn = false;
  selectMode = false; // touch: explicit Select mode (Pan is default)

  // marquee
  marqueeActive = false;
  marqueePointerId = -1;
  private marqueeStart = { x: 0, y: 0 };
  private marqueeCurrent = { x: 0, y: 0 };
  private marqueeGfx: Phaser.GameObjects.Graphics;

  // selection
  selection = new Set<number>();
  private selectionGfx: Phaser.GameObjects.Graphics;

  // slot guide
  guideTape: number | null = null;
  private guideGfx: Phaser.GameObjects.Graphics;

  // match scan info (test introspection)
  lastScanTarget: number | null = null;
  lastScanMatchCount = 0;

  // highlight rings (scanner / misplaced / match scan)
  private ringsGfx: Phaser.GameObjects.Graphics;
  private matchScanRingsGfx: Phaser.GameObjects.Graphics;
  private ringRedrawAt = 0;

  // held badge for Match Gather
  private gatherBadge: Phaser.GameObjects.Text;

  private lastClickTape = -1;
  private lastClickAt = 0;

  constructor(scene: GameScene) {
    this.scene = scene;
    this.marqueeGfx = scene.add.graphics().setDepth(150000).setVisible(false);
    this.selectionGfx = scene.add.graphics().setDepth(150001);
    this.guideGfx = scene.add.graphics().setDepth(150002).setVisible(false);
    this.ringsGfx = scene.add.graphics().setDepth(149000);
    this.matchScanRingsGfx = scene.add.graphics().setDepth(149001);
    this.gatherBadge = scene.add.text(0, 0, '', {
      fontFamily: 'Georgia, serif', fontSize: '15px', color: '#f6efdd',
      backgroundColor: '#3b2f2f', padding: { x: 6, y: 2 },
    }).setDepth(200001).setVisible(false);
  }

  // ------------------------------------------------------------ unlock flow
  onShelved(sorted: number): void {
    let changed = false;
    for (const [id, threshold] of Object.entries(SKILL_THRESHOLDS) as [SkillId, number][]) {
      if (!this.unlocked[id] && sorted >= threshold) {
        this.unlocked[id] = true;
        changed = true;
        audio.play('unlock');
        this.scene.game.events.emit('toast', `New skill — ${SKILL_INFO[id].name}: ${SKILL_INFO[id].hint}`);
        if (id === 'matchScan') this.powers.matchScan.unlocked = true;
        if (id === 'matchGather') this.powers.matchGather.unlocked = true;
      }
    }
    if (changed) this.emitChanged();
  }

  emitChanged(): void {
    this.scene.game.events.emit('skills:changed', {
      unlocked: { ...this.unlocked },
      scannerOn: this.scannerOn,
      misplacedOn: this.misplacedOn,
      selectMode: this.selectMode,
      powers: {
        matchScan: { ...this.powers.matchScan },
        matchGather: { ...this.powers.matchGather },
      },
    });
  }

  powersSave(): Record<string, { unlocked: boolean; activeUntil: number; cooldownUntil: number }> {
    return {
      matchScan: { unlocked: this.powers.matchScan.unlocked, activeUntil: 0, cooldownUntil: this.powers.matchScan.cooldownUntil },
      matchGather: { unlocked: this.powers.matchGather.unlocked, activeUntil: 0, cooldownUntil: this.powers.matchGather.cooldownUntil },
    };
  }

  // ---------------------------------------------------------------- toggles
  toggleScanner(): void {
    if (!this.unlocked.scanner) return;
    this.scannerOn = !this.scannerOn;
    this.ringRedrawAt = 0;
    this.emitChanged();
  }

  toggleMisplaced(): void {
    if (!this.unlocked.misplaced) return;
    this.misplacedOn = !this.misplacedOn;
    this.ringRedrawAt = 0;
    this.emitChanged();
  }

  setSelectMode(on: boolean): void {
    this.selectMode = on;
    this.emitChanged();
  }

  // --------------------------------------------------------------- marquee
  beginMarquee(wp: { x: number; y: number }, pointerId: number): void {
    if (!this.unlocked.marquee) return; // gesture cannot batch-pick before unlock
    this.marqueeActive = true;
    this.marqueePointerId = pointerId;
    if (window.location.search.includes('autotest')) {
      console.log(`[marquee] begin at ${wp.x.toFixed(0)},${wp.y.toFixed(0)} ptr=${pointerId}`);
    }
    this.marqueeStart = { ...wp };
    this.marqueeCurrent = { ...wp };
    this.marqueeGfx.setVisible(true);
    this.drawMarquee();
  }

  updateMarquee(wp: { x: number; y: number }): void {
    if (!this.marqueeActive) return;
    this.marqueeCurrent = { ...wp };
    this.drawMarquee();
  }

  endMarquee(): void {
    if (!this.marqueeActive) return;
    this.marqueeActive = false;
    this.marqueeGfx.setVisible(false).clear();
    const x0 = Math.min(this.marqueeStart.x, this.marqueeCurrent.x);
    const x1 = Math.max(this.marqueeStart.x, this.marqueeCurrent.x);
    const y0 = Math.min(this.marqueeStart.y, this.marqueeCurrent.y);
    const y1 = Math.max(this.marqueeStart.y, this.marqueeCurrent.y);
    if (x1 - x0 < 14 && y1 - y0 < 14) { this.clearSelection(); return; } // tiny drag = deselect
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const enclosed: Tape[] = [];
    for (const t of this.scene.world.tapes) {
      if (t.state !== 'loose') continue;
      if (t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1) enclosed.push(t);
    }
    enclosed.sort((a, b) => (a.x - cx) ** 2 + (a.y - cy) ** 2 - ((b.x - cx) ** 2 + (b.y - cy) ** 2));
    if (window.location.search.includes('autotest')) {
      console.log(`[marquee] end rect=(${x0.toFixed(0)},${y0.toFixed(0)})-(${x1.toFixed(0)},${y1.toFixed(0)}) enclosed=${enclosed.length}`);
    }
    this.selection.clear();
    for (const t of enclosed.slice(0, MARQUEE_CAP)) this.selection.add(t.id);
    this.drawSelection();
  }

  clearSelection(): void {
    this.selection.clear();
    this.drawSelection();
  }

  onGrabSelection(leadId: number): void {
    if (this.selection.has(leadId)) {
      // grabbed a selected tape: the whole group follows (drag controller reads
      // this.selection); rings stay until the drop clears them
    } else {
      this.clearSelection();
    }
  }

  private drawMarquee(): void {
    const g = this.marqueeGfx;
    g.clear();
    const x0 = Math.min(this.marqueeStart.x, this.marqueeCurrent.x);
    const y0 = Math.min(this.marqueeStart.y, this.marqueeCurrent.y);
    const w = Math.abs(this.marqueeCurrent.x - this.marqueeStart.x);
    const h = Math.abs(this.marqueeCurrent.y - this.marqueeStart.y);
    g.fillStyle(0xf6efdd, 0.10);
    g.fillRect(x0, y0, w, h);
    g.lineStyle(2, 0xf6efdd, 0.9);
    g.strokeRect(x0, y0, w, h);
  }

  private drawSelection(): void {
    const g = this.selectionGfx;
    g.clear();
    for (const id of this.selection) {
      const view = this.scene.tapeViews.get(id);
      if (!view) continue;
      const t = this.scene.tapeData(id) as Tape;
      if (t.state !== 'loose') continue;
      g.lineStyle(2.6, 0xffe9a8, 0.95);
      g.strokeRoundedRect(view.container.x - 49, view.container.y - 33, 98, 66, 10);
    }
    this.scene.game.events.emit('selection:changed', this.selection.size);
  }

  // ------------------------------------------------------------ tape clicks
  onTapeClick(id: number): void {
    const t = this.scene.tapeData(id) as Tape | undefined;
    if (!t || t.state !== 'loose') { this.clearGuide(); return; }
    const now = this.scene.time.now;

    // double-click a defective tape opens its repair in place
    if (t.defect && !t.repaired) {
      if (this.lastClickTape === id && now - this.lastClickAt < 360) {
        this.lastClickAt = 0; this.lastClickTape = -1;
        this.openRepair(id);
        return;
      }
      this.lastClickAt = now;
      this.lastClickTape = id;
    }

    if (this.isPowerActive('matchGather')) { this.gatherMatches(id); return; }
    if (this.isPowerActive('matchScan')) { this.scanMatches(id); return; }
    if (this.unlocked.guide) this.selectGuide(id); else this.clearGuide();
  }

  // ------------------------------------------------------------- slot guide
  selectGuide(id: number): void {
    this.guideTape = id;
    this.drawGuide();
  }

  clearGuide(): void {
    this.guideTape = null;
    this.guideGfx.setVisible(false).clear();
    this.scene.game.registry.set('guideHint', null);
  }

  private drawGuide(): void {
    const g = this.guideGfx;
    g.clear().setVisible(true);
    if (this.guideTape === null) { g.setVisible(false); return; }
    const t = this.scene.tapeData(this.guideTape) as Tape | undefined;
    if (!t || t.state !== 'loose') { this.clearGuide(); return; }
    // tape outline
    const view = this.scene.tapeViews.get(this.guideTape);
    if (view) {
      g.lineStyle(2.4, 0x9fe6a0, 0.95);
      g.strokeRoundedRect(view.container.x - 49, view.container.y - 33, 98, 66, 10);
    }
    const rack = this.scene.world.racks[t.combo];
    const slot = rack.slots.findIndex(s => s === null);
    const r = rackRect(t.combo);
    if (slot >= 0) {
      const p = slotPos(t.combo, slot);
      g.lineStyle(3, 0x9fe6a0, 0.95);
      g.fillStyle(0x9fe6a0, 0.16);
      g.fillRoundedRect(p.x - 10, p.y - 32, 20, 64, 5);
      g.strokeRoundedRect(p.x - 10, p.y - 32, 20, 64, 5);
    }
    g.lineStyle(3, 0x9fe6a0, 0.9);
    g.strokeRoundedRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 10);
  }

  // ---------------------------------------------------------------- powers
  isPowerActive(id: PowerId): boolean {
    return this.powers[id].activeUntil > this.scene.time.now;
  }

  tryActivatePower(id: PowerId): boolean {
    const p = this.powers[id];
    if (!p.unlocked) return false;
    const now = this.scene.time.now;
    if (p.activeUntil > now || p.cooldownUntil > now) return false;
    p.activeUntil = now + POWER_ACTIVE_MS;
    audio.play('chime');
    this.emitChanged();
    return true;
  }

  // test/debug helper: expire + cooldown immediately
  forceExpire(id: PowerId): void {
    const p = this.powers[id];
    const now = this.scene.time.now;
    if (p.activeUntil > now) {
      p.activeUntil = now;
      p.cooldownUntil = now + POWER_COOLDOWN_MS;
    }
    this.lastScanTarget = null;
    this.matchScanRingsGfx.clear();
    this.emitChanged();
  }

  private expirePower(id: PowerId): void {
    const p = this.powers[id];
    p.activeUntil = 0;
    p.cooldownUntil = this.scene.time.now + POWER_COOLDOWN_MS;
    if (id === 'matchScan') {
      this.lastScanTarget = null;
      this.matchScanRingsGfx.clear();
      this.scene.game.registry.set('matchHints', null);
    }
    this.emitChanged();
  }

  scanMatches(id: number): void {
    const t = this.scene.tapeData(id) as Tape | undefined;
    if (!t) return;
    this.lastScanTarget = id;
    this.lastScanMatchCount = 0;
    const g = this.matchScanRingsGfx;
    g.clear().setVisible(true);
    const offscreen: Tape[] = [];
    const view = this.scene.cameras.main.worldView;
    for (const o of this.scene.world.tapes) {
      if (o.id === id || o.state !== 'loose' || o.combo !== t.combo) continue;
      this.lastScanMatchCount++;
      const v = this.scene.tapeViews.get(o.id);
      if (!v) continue;
      const onScreen = o.x > view.x - 60 && o.x < view.right + 60 && o.y > view.y - 60 && o.y < view.bottom + 60;
      if (onScreen) {
        g.lineStyle(3, 0xa8e8ff, 0.95);
        g.strokeRoundedRect(v.container.x - 50, v.container.y - 34, 100, 68, 10);
      } else {
        offscreen.push(o);
      }
    }
    // offscreen matches => directional indicators + count (drawn by the HUD)
    this.scene.game.registry.set('matchHints', offscreen.length
      ? { combo: t.combo, points: offscreen.map(o => ({ x: o.x, y: o.y })) }
      : null);
  }

  gatherMatches(id: number): void {
    const t = this.scene.tapeData(id) as Tape | undefined;
    if (!t) return;
    const drag = this.scene.drag;
    if (drag.held) return; // already carrying a bundle
    const eligible = this.scene.world.tapes.filter(o =>
      o.state === 'loose' && o.combo === t.combo && !(o.defect && !o.repaired),
    );
    if (eligible.length === 0) return;
    const views = eligible
      .slice(0, GATHER_CAP)
      .map(o => this.scene.tapeViews.get(o.id))
      .filter((v): v is TapeView => !!v);
    audio.play('gather');
    drag.holdGathered(views, this.scene.input.activePointer.id);
    this.scene.game.registry.set('matchHints', null);
  }

  // ------------------------------------------------------------- repair open
  openRepair(id: number, others?: TapeView[]): void {
    if (others && others.length) {
      this.scene.drag.releaseHeldOnTable(others, { x: 620, y: 1560 });
    }
    this.clearGuide();
    this.matchScanRingsGfx.clear();
    if (window.location.search.includes('autotest')) {
      const mgr = this.scene.scene.settings as unknown as { manager?: { keys?: unknown } };
      console.log(`[repair] opening tape ${id}`);
      void mgr;
    }
    this.scene.scene.pause('Game');
    this.scene.scene.launch('Repair', { tapeId: id });
    this.scene.game.events.emit('repair:open');
  }

  onRepairClosed(id: number, success: boolean): void {
    const t = this.scene.tapeData(id);
    if (t && success) {
      t.repaired = true;
      const view = this.scene.tapeViews.get(id);
      if (view) {
        if (view.overlay) view.overlay.setVisible(false);
        // return the tape to the sorting loop: loose at the bench edge
        const spot = this.scene.drag.findTableSpotPublic(600, 1520);
        view.container.setPosition(spot.x, spot.y).setRotation(0).setDepth(spot.y);
        t.x = spot.x; t.y = spot.y; t.rot = 0;
      }
      this.scene.emitCounters();
      this.scene.save();
    }
    this.emitChanged();
  }

  // ------------------------------------------------------------------ update
  update(): void {
    const now = this.scene.time.now;

    // power lifecycle (timers gate only the powers themselves)
    for (const id of ['matchScan', 'matchGather'] as PowerId[]) {
      const p = this.powers[id];
      if (p.activeUntil > 0 && p.activeUntil <= now) this.expirePower(id);
    }

    // ring pulses (redraw at most ~3x/s while toggles are on)
    if (now - this.ringRedrawAt > 330) {
      this.ringRedrawAt = now;
      if (this.scannerOn) this.drawScannerRings();
      else if (!this.misplacedOn) this.ringsGfx.clear();
      if (this.misplacedOn) this.drawMisplacedRings();
      if (this.guideTape !== null) this.drawGuide();
      if (this.lastScanTarget !== null && this.isPowerActive('matchScan')) this.scanMatches(this.lastScanTarget);
    }

    // gather badge follows the held bundle
    const held = this.scene.drag.held;
    if (held && held.fromGather) {
      this.gatherBadge.setVisible(true)
        .setText(`x${held.tapes.length}`)
        .setPosition(held.lead.container.x + 40, held.lead.container.y - 40);
    } else if (held === null || !held.fromGather) {
      this.gatherBadge.setVisible(false);
    }

    // guide / match offscreen hints consumed by the HUD scene
    this.updateRegistryHints();
  }

  private drawScannerRings(): void {
    const g = this.ringsGfx;
    g.clear();
    g.lineStyle(2.6, 0xffb3a7, 0.9);
    for (const t of this.scene.world.tapes) {
      if (t.state !== 'loose' || !t.defect || t.repaired) continue;
      const v = this.scene.tapeViews.get(t.id);
      if (!v) continue;
      g.strokeRoundedRect(v.container.x - 50, v.container.y - 34, 100, 68, 10);
    }
  }

  private drawMisplacedRings(): void {
    const g = this.ringsGfx;
    g.clear();
    // loose tapes are misplaced by definition; correct shelved ones never highlighted
    g.lineStyle(2.2, 0xffd27f, 0.75);
    for (const t of this.scene.world.tapes) {
      if (t.state !== 'loose') continue;
      const v = this.scene.tapeViews.get(t.id);
      if (!v) continue;
      g.strokeRoundedRect(v.container.x - 49, v.container.y - 33, 98, 66, 10);
    }
  }

  private updateRegistryHints(): void {
    const view = this.scene.cameras.main.worldView;
    // slot-guide: point at the tape's rack when it is offscreen
    if (this.guideTape !== null) {
      const t = this.scene.tapeData(this.guideTape) as Tape | undefined;
      if (t) {
        const r = rackRect(t.combo);
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        if (cx < view.x || cx > view.right || cy < view.y || cy > view.bottom) {
          this.scene.game.registry.set('guideHint', { x: cx, y: cy });
        } else {
          this.scene.game.registry.set('guideHint', null);
        }
      }
    }
    // match scan offscreen arrows are set by scanMatches
  }
}

export { SKILL_INFO };
