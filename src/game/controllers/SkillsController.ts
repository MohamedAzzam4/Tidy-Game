/**
 * Tidy Tapes — skills, marquee selection, slot guide and the three powers (v2).
 *
 * Skill effects are separate (per the follow-up): spot damaged tapes (toggle),
 * reveal misfiled tapes (power 15 s / 60 s), show compatible racks for the
 * selected tape — BOTH matching rows including duplicates, with offscreen
 * pointers — highlight other tapes with the same color + symbol (power 15/60),
 * and the last skill: one-click pickup of matching loose tapes into free tray
 * slots only (instant effect, 60 s cooldown; nothing teleports past capacity).
 * Powers gate ONLY themselves; expiry never touches held tapes or the session.
 */
import Phaser from 'phaser';
import {
  MARQUEE_CAP, POWER_ACTIVE_MS, POWER_COOLDOWN_MS, SKILL_THRESHOLDS,
  rowRect, rowsOfGroup, slotPos,
} from '../config';
import { audio } from '../audio';
import { defectBlocksFiling } from '../types';
import type { GameScene, TapeView } from '../scenes/GameScene';
import type { SkillId, Tape } from '../types';

export type PowerId = 'misplaced' | 'matchScan' | 'matchGather';

export interface PowerState { unlocked: boolean; activeUntil: number; cooldownUntil: number }

const SKILL_INFO: Record<SkillId, { name: string; hint: string }> = {
  scanner: { name: 'Defect Scanner', hint: 'D — highlight tapes that need repair' },
  guide: { name: 'Slot Guide', hint: 'Click a tape — both of its rows light up' },
  misplaced: { name: 'Misfile Finder', hint: 'M — reveal tapes in wrong rows (15 s)' },
  marquee: { name: 'Marquee Pickup', hint: 'Drag a box on the table to select up to 5' },
  matchScan: { name: 'Match Scan', hint: 'S — click a tape: highlights same color + symbol' },
  matchGather: { name: 'Match Gather', hint: 'G — click a tape: loads its loose matches into the tray' },
};

const POWER_IDS: PowerId[] = ['misplaced', 'matchScan', 'matchGather'];

export class SkillsController {
  scene: GameScene;
  unlocked: Record<SkillId, boolean> = {
    scanner: false, guide: false, misplaced: false, marquee: false, matchScan: false, matchGather: false,
  };
  powers: Record<PowerId, PowerState> = {
    misplaced: { unlocked: false, activeUntil: 0, cooldownUntil: 0 },
    matchScan: { unlocked: false, activeUntil: 0, cooldownUntil: 0 },
    matchGather: { unlocked: false, activeUntil: 0, cooldownUntil: 0 },
  };
  scannerOn = false;
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

  // highlight rings (scanner / misfile / match scan)
  private ringsGfx: Phaser.GameObjects.Graphics;
  private matchScanRingsGfx: Phaser.GameObjects.Graphics;
  private ringRedrawAt = 0;

  // held badge for gathered bundles
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
        if (id === 'misplaced' || id === 'matchScan' || id === 'matchGather') {
          this.powers[id].unlocked = true;
        }
      }
    }
    if (changed) this.emitChanged();
  }

  /** after restoring saves / v1 migration: align power unlocks with skills */
  syncPowerUnlocks(): void {
    for (const id of POWER_IDS) this.powers[id].unlocked = !!this.unlocked[id];
    this.emitChanged();
  }

  emitChanged(): void {
    this.scene.game.events.emit('skills:changed', {
      unlocked: { ...this.unlocked },
      scannerOn: this.scannerOn,
      selectMode: this.selectMode,
      powers: {
        misplaced: { ...this.powers.misplaced },
        matchScan: { ...this.powers.matchScan },
        matchGather: { ...this.powers.matchGather },
      },
    });
  }

  powersSave(): Record<string, { unlocked: boolean; activeUntil: number; cooldownUntil: number }> {
    const out: Record<string, { unlocked: boolean; activeUntil: number; cooldownUntil: number }> = {};
    for (const id of POWER_IDS) {
      out[id] = {
        unlocked: this.powers[id].unlocked,
        activeUntil: 0,
        cooldownUntil: this.powers[id].cooldownUntil,
      };
    }
    return out;
  }

  // ---------------------------------------------------------------- toggles
  toggleScanner(): void {
    if (!this.unlocked.scanner) return;
    this.scannerOn = !this.scannerOn;
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
    this.selection.clear();
    for (const t of enclosed.slice(0, MARQUEE_CAP)) this.selection.add(t.id);
    this.drawSelection();
  }

  clearSelection(): void {
    this.selection.clear();
    this.drawSelection();
  }

  /** two-finger gesture takes over: cancel any running marquee */
  cancelMarquee(): void {
    if (!this.marqueeActive) return;
    this.marqueeActive = false;
    this.marqueePointerId = -1;
    this.marqueeGfx.setVisible(false).clear();
  }

  onGrabSelection(leadId: number): void {
    if (!this.selection.has(leadId)) this.clearSelection();
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
  /** both matching rows light up (duplicates included), with next-free-slot ghosts */
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
    const view = this.scene.tapeViews.get(this.guideTape);
    if (view) {
      g.lineStyle(2.4, 0x9fe6a0, 0.95);
      g.strokeRoundedRect(view.container.x - 49, view.container.y - 33, 98, 66, 10);
    }
    for (const rowId of rowsOfGroup(t.combo)) {
      const row = this.scene.world.rows[rowId];
      const r = rowRect(rowId);
      g.lineStyle(3, 0x9fe6a0, 0.9);
      g.strokeRoundedRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6, 8);
      const slot = row.slots.findIndex(s => s === null);
      if (slot >= 0) {
        const p = slotPos(rowId, slot);
        g.lineStyle(3, 0x9fe6a0, 0.95);
        g.fillStyle(0x9fe6a0, 0.16);
        g.fillRoundedRect(p.x - 10, p.y - 16, 20, 32, 5);
        g.strokeRoundedRect(p.x - 10, p.y - 16, 20, 32, 5);
      }
    }
  }

  // ---------------------------------------------------------------- powers
  isPowerActive(id: PowerId): boolean {
    return this.powers[id].activeUntil > this.scene.time.now;
  }

  isPowerReady(id: PowerId): boolean {
    const p = this.powers[id];
    return p.unlocked && p.activeUntil <= this.scene.time.now && p.cooldownUntil <= this.scene.time.now;
  }

  tryActivatePower(id: PowerId): boolean {
    const p = this.powers[id];
    if (!p.unlocked) return false;
    const now = this.scene.time.now;
    if (p.activeUntil > now || p.cooldownUntil > now) return false;
    if (id === 'matchGather') {
      // instant effect: the next matching click gathers; 60 s cooldown guards it
      p.activeUntil = now + POWER_ACTIVE_MS;
      p.cooldownUntil = now + POWER_ACTIVE_MS + POWER_COOLDOWN_MS;
      this.emitChanged();
      return true;
    }
    p.activeUntil = now + POWER_ACTIVE_MS;
    p.cooldownUntil = now + POWER_ACTIVE_MS + POWER_COOLDOWN_MS;
    this.emitChanged();
    return true;
  }

  /** test/debug helper: expire + cooldown immediately */
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
    this.scene.game.registry.set('matchHints', offscreen.length
      ? { combo: t.combo, points: offscreen.slice(0, 8).map(o => ({ x: o.x, y: o.y })) }
      : null);
  }

  /**
   * One-click pickup of matching loose tapes into FREE tray slots only —
   * nothing teleports past capacity; the rest stays where it is.
   */
  gatherMatches(id: number): void {
    const t = this.scene.tapeData(id) as Tape | undefined;
    if (!t) return;
    const scene = this.scene;
    const free = scene.trayFreeSlots();
    if (free === 0) {
      scene.game.events.emit('hint', 'The tray is full — remove a tape first');
      return;
    }
    const eligible = scene.world.tapes.filter(o =>
      o.state === 'loose' && o.combo === t.combo && !(o.defect && !o.repaired && defectBlocksFiling(o.defect)),
    );
    const take = eligible.filter(o => o.id !== t.id)
      .slice(0, Math.max(0, free - (eligible.some(o => o.id === t.id) ? 1 : 0)));
    const ids = [t.id, ...take.map(o => o.id)];
    if (ids.length === 0) return;
    let loaded = 0;
    for (const tid of ids) {
      if (scene.trayLoad(tid) >= 0) loaded++;
      const v = scene.tapeViews.get(tid);
      if (v) v.container.setVisible(false);
    }
    audio.play('gather');
    scene.game.events.emit('hint', `Match Gather — ${loaded} loaded into the tray`);
    scene.game.registry.set('matchHints', null);
    scene.emitCounters();
    scene.save();
    // the power does its job once per activation window: end it now
    const p = this.powers.matchGather;
    p.activeUntil = 0;
    p.cooldownUntil = scene.time.now + POWER_COOLDOWN_MS;
    this.emitChanged();
  }

  // ------------------------------------------------------------- repair open
  openRepair(id: number, others?: TapeView[]): void {
    if (others && others.length) {
      this.scene.drag.releaseHeldOnTable(others, { x: 620, y: 1680 });
    }
    this.clearGuide();
    this.matchScanRingsGfx.clear();
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
        const spot = this.scene.drag.findTableSpotPublic(600, 1490);
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

    for (const id of POWER_IDS) {
      const p = this.powers[id];
      if (p.activeUntil > 0 && p.activeUntil <= now) this.expirePower(id);
    }

    // ring pulses (redraw at most ~3x/s while toggles/powers are on)
    if (now - this.ringRedrawAt > 330) {
      this.ringRedrawAt = now;
      if (this.scannerOn) this.drawScannerRings();
      else if (!this.isPowerActive('misplaced')) this.ringsGfx.clear();
      if (this.isPowerActive('misplaced')) this.drawMisfileRings();
      if (this.guideTape !== null) this.drawGuide();
      if (this.lastScanTarget !== null && this.isPowerActive('matchScan')) this.scanMatches(this.lastScanTarget);
    }

    // gather badge follows a held bundle
    const held = this.scene.drag.held;
    if (held && held.fromGather) {
      this.gatherBadge.setVisible(true)
        .setText(`x${held.tapes.length}`)
        .setPosition(held.lead.container.x + 40, held.lead.container.y - 40);
    } else {
      this.gatherBadge.setVisible(false);
    }

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

  /** reveal misfiled tapes only while the power is active (never before) */
  private drawMisfileRings(): void {
    const g = this.ringsGfx;
    g.clear();
    g.lineStyle(2.6, 0xffd27f, 0.95);
    for (const t of this.scene.world.tapes) {
      if (t.state !== 'shelved') continue;
      const row = this.scene.world.rows[t.row as number];
      if (!row || row.group === t.combo) continue;
      const v = this.scene.tapeViews.get(t.id);
      if (!v) continue;
      g.strokeRoundedRect(v.container.x - 13, v.container.y - 17, 26, 34, 5);
      g.lineStyle(2, 0xffd27f, 0.5);
      g.strokeCircle(v.container.x, v.container.y, 24);
      g.lineStyle(2.6, 0xffd27f, 0.95);
    }
  }

  private updateRegistryHints(): void {
    const view = this.scene.cameras.main.worldView;
    // slot-guide: offscreen pointers for BOTH matching rows
    if (this.guideTape !== null) {
      const t = this.scene.tapeData(this.guideTape) as Tape | undefined;
      if (t) {
        const pts: { x: number; y: number }[] = [];
        for (const rowId of rowsOfGroup(t.combo)) {
          const r = rowRect(rowId);
          pts.push({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
        }
        const off = pts.filter(p => p.x < view.x || p.x > view.right || p.y < view.y || p.y > view.bottom);
        this.scene.game.registry.set('guideHint', off.length ? { points: off } : null);
      }
    }
  }
}

export { SKILL_INFO };
