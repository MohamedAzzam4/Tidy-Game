/**
 * Tidy Tapes — fixed HUD scene v2 (own camera, never moves with the world).
 *
 * Bottom-left: six skill chips (powers show 15 s active / 60 s cooldown timers).
 * Bottom-right: the five-slot CARRY TRAY (basic equipment) — load/remove tapes
 * individually, drag the tray onto a row to batch-file what fits. Top-right:
 * zoom + / − / fit-to-table, New Game, help (with a sound-check audition panel
 * for the Magnetic Tuck and Tiny Chime). HUD and text stay upright always.
 */
import Phaser from 'phaser';
import { SKILL_THRESHOLDS, TRAY, TRAY_SLOTS } from '../config';
import { audio } from '../audio';
import { SKILL_INFO } from '../controllers/SkillsController';
import { readV1Skills } from '../save';
import type { SkillId } from '../types';
import type { GameScene } from './GameScene';

const CHIP_ORDER: SkillId[] = ['scanner', 'misplaced', 'guide', 'marquee', 'matchScan', 'matchGather'];
const CREAM = '#f6efdd';
const WOOD = '#6e4429';

interface ChipViews {
  bg: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
  power: boolean;
}

interface TraySlotViews {
  zone: Phaser.GameObjects.Zone;
  chip: Phaser.GameObjects.Image | null;
}

export class UIScene extends Phaser.Scene {
  private countersText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private modeButton!: Phaser.GameObjects.Text;
  private chips = new Map<SkillId, ChipViews>();
  private trayPanel!: Phaser.GameObjects.Graphics;
  private trayTitle!: Phaser.GameObjects.Text;
  private traySlots: TraySlotViews[] = [];
  private trayCollapseBtn!: Phaser.GameObjects.Text;
  private trayBodyZone!: Phaser.GameObjects.Zone;
  private trayGhost!: Phaser.GameObjects.Text;
  private toastTween: Phaser.Tweens.Tween | null = null;
  private hintTimer: Phaser.Time.TimerEvent | null = null;
  private completePanel: Phaser.GameObjects.Container | null = null;
  private confirmPanel: Phaser.GameObjects.Container | null = null;
  private helpPanel: Phaser.GameObjects.Container | null = null;
  private migratePanel: Phaser.GameObjects.Container | null = null;
  private arrowsGfx!: Phaser.GameObjects.Graphics;
  private matchCountText!: Phaser.GameObjects.Text;
  private arrowLabels: Phaser.GameObjects.Text[] = [];
  private lastChipDraw = 0;
  private W = 1280;
  private H = 720;
  private trayCollapsed = false;

  constructor() {
    super({ key: 'UI' });
  }

  create(): void {
    this.W = this.scale.width;
    this.H = this.scale.height;
    this.trayCollapsed = false;
    this.chips = new Map();
    this.traySlots = [];
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    const bar = this.add.graphics();
    bar.fillStyle(0x3b2f2f, 0.82);
    bar.fillRect(0, 0, this.W, 54);
    bar.fillStyle(0x6e4429, 0.9);
    bar.fillRect(0, 54, this.W, 3);

    this.add.text(16, 6, 'Tidy Tapes', {
      fontFamily: 'Georgia, serif', fontSize: '23px', fontStyle: 'bold', color: CREAM,
    });
    this.add.text(16, 34, 'cozy cassette sorting', {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#cdbfa5',
    });

    this.countersText = this.add.text(this.W / 2, 6, 'Shelved 0 / 0', {
      fontFamily: 'Georgia, serif', fontSize: '21px', fontStyle: 'bold', color: CREAM,
    }).setOrigin(0.5, 0);
    this.subText = this.add.text(this.W / 2, 34, '', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#cdbfa5',
    }).setOrigin(0.5, 0);

    this.buildTopRight();
    this.buildChips();
    this.buildTray();

    this.toastText = this.add.text(this.W / 2, 96, '', {
      fontFamily: 'Georgia, serif', fontSize: '17px', color: CREAM,
      backgroundColor: 'rgba(59,47,47,0.9)', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setAlpha(0).setDepth(50);
    this.hintText = this.add.text(this.W / 2, this.H - 120, '', {
      fontFamily: 'Georgia, serif', fontSize: '15px', color: '#ffe9a8',
      backgroundColor: 'rgba(59,47,47,0.88)', padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setAlpha(0).setDepth(50);

    this.arrowsGfx = this.add.graphics().setDepth(40);
    this.matchCountText = this.add.text(this.W / 2, 72, '', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#a8e8ff',
      backgroundColor: 'rgba(59,47,47,0.85)', padding: { x: 10, y: 4 },
    }).setOrigin(0.5).setDepth(42).setVisible(false);

    this.trayGhost = this.add.text(0, 0, '', {
      fontFamily: 'Georgia, serif', fontSize: '15px', fontStyle: 'bold', color: CREAM,
      backgroundColor: 'rgba(59,47,47,0.9)', padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(60).setVisible(false);

    this.game.events.on('counters', this.onCounters, this);
    this.game.events.on('skills:changed', this.onSkills, this);
    this.game.events.on('toast', this.showToast, this);
    this.game.events.on('hint', this.showHint, this);
    this.game.events.on('complete', this.showComplete, this);
    this.game.events.on('tray:changed', this.redrawTray, this);
    this.game.events.on('migrate:ask', this.showMigrate, this);
    this.game.events.on('game:ready', this.onGameReady, this);
    this.game.events.on('save:flash', this.flashSave, this);
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('counters', this.onCounters, this);
      this.game.events.off('skills:changed', this.onSkills, this);
      this.game.events.off('toast', this.showToast, this);
      this.game.events.off('hint', this.showHint, this);
      this.game.events.off('complete', this.showComplete, this);
      this.game.events.off('tray:changed', this.redrawTray, this);
      this.game.events.off('migrate:ask', this.showMigrate, this);
      this.game.events.off('game:ready', this.onGameReady, this);
      this.game.events.off('save:flash', this.flashSave, this);
    });

    // initial state pull (GameScene may have emitted before this scene existed)
    const game = this.gameScene();
    if (game) {
      this.onSkills();
      game.emitCounters();
      this.redrawTray();
    }
  }

  private gameScene(): GameScene | null {
    const s = this.scene.get('Game') as GameScene | null;
    return s && s.scene.isActive() ? s : (s as unknown as GameScene) ?? null;
  }

  private setUiBlocked(v: boolean): void {
    this.game.events.emit('ui:block', v);
  }

  // ------------------------------------------------------------- top-right UI
  private buildTopRight(): void {
    const mkBtn = (label: string, right: number, cb: () => void, color = CREAM, bg = WOOD) => {
      const t = this.add.text(right, 13, label, {
        fontFamily: 'Georgia, serif', fontSize: '14px', color,
        backgroundColor: bg, padding: { x: 9, y: 5 },
      }).setOrigin(1, 0).setInteractive({ useHandCursor: true }).setDepth(20);
      t.on('pointerdown', () => { audio.unlock(); cb(); });
      return t;
    };
    mkBtn('?', this.W - 12, () => this.showHelp());
    mkBtn('fit', this.W - 52, () => this.gameScene()?.fitToTable());
    mkBtn('−', this.W - 92, () => this.zoomStep(-1));
    mkBtn('+', this.W - 128, () => this.zoomStep(1));
    mkBtn('New Game', this.W - 168, () => this.confirmNewGame(), '#ffd9c9', '#8a4a35');
    this.modeButton = this.add.text(this.W - 12, 40, 'mode: pan (touch)', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#cdbfa5',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true }).setDepth(20);
    this.modeButton.on('pointerdown', () => this.toggleMode());
  }

  private zoomStep(dir: number): void {
    this.gameScene()?.zoomBy(dir * 0.18);
  }

  private toggleMode(): void {
    const game = this.gameScene();
    if (!game?.skills) return;
    game.skills.setSelectMode(!game.skills.selectMode);
    this.modeButton.setText(`mode: ${game.skills.selectMode ? 'select' : 'pan'} (touch)`);
    this.showToast(game.skills.selectMode
      ? 'Select mode: drag on empty table to box-select tapes (touch friendly)'
      : 'Pan mode: drag empty table to pan; two fingers anywhere pinch-zoom and pan');
  }

  // ------------------------------------------------------------------- chips
  private chipW(): number {
    return Math.min(134, Math.max(96, (this.W - 360) / 6 - 10));
  }

  private buildChips(): void {
    const cw = this.chipW();
    let x = 14;
    const y = this.H - 64;
    for (const id of CHIP_ORDER) {
      const power = id === 'misplaced' || id === 'matchScan' || id === 'matchGather';
      const bg = this.add.graphics().setDepth(10);
      const label = this.add.text(x + 20, y - 32, SKILL_INFO[id].name, {
        fontFamily: 'Georgia, serif', fontSize: '12px', fontStyle: 'bold', color: CREAM,
      }).setDepth(11);
      const status = this.add.text(x + 20, y - 14, '', {
        fontFamily: 'Georgia, serif', fontSize: '10px', color: '#cdbfa5',
      }).setDepth(11);
      const zone = this.add.zone(x + 5, y - 40, cw, 54).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true }).setDepth(12);
      zone.on('pointerdown', () => this.onChip(id));
      this.chips.set(id, { bg, label, status, zone, power });
      x += cw + 12;
    }
    this.lastChipDraw = 0;
    this.redrawChips(true);
  }

  private destroyChips(): void {
    for (const c of this.chips.values()) {
      c.bg.destroy(); c.label.destroy(); c.status.destroy(); c.zone.destroy();
    }
    this.chips.clear();
  }

  private onChip(id: SkillId): void {
    audio.unlock();
    const game = this.gameScene();
    if (!game?.skills) return;
    const sk = game.skills;
    if (!sk.unlocked[id]) {
      this.showToast(`Unlocks at ${SKILL_THRESHOLDS[id]} tapes shelved — ${SKILL_INFO[id].hint}`);
      return;
    }
    if (id === 'scanner') sk.toggleScanner();
    else if (id === 'misplaced' || id === 'matchScan' || id === 'matchGather') {
      const okActive = sk.tryActivatePower(id);
      if (okActive) {
        if (id === 'matchGather') this.showToast('Match Gather ready — click a tape to load its loose matches into the tray');
        else if (id === 'misplaced') this.showToast('Misfile Finder — wrong-row tapes glow for 15 s');
        else this.showToast('Match Scan ready — click a tape to highlight its color + symbol kin');
      }
    } else if (id === 'guide') this.showToast(SKILL_INFO.guide.hint);
    else if (id === 'marquee') this.showToast(SKILL_INFO.marquee.hint);
  }

  private redrawChips(force = false): void {
    if (!force && this.time.now - this.lastChipDraw < 200) return;
    this.lastChipDraw = this.time.now;
    const game = this.gameScene();
    const now = game ? game.time.now : 0;
    const cw = this.chipW();
    let x = 14;
    const y = this.H - 64;
    for (const id of CHIP_ORDER) {
      const chip = this.chips.get(id);
      if (!chip) continue;
      const unlocked = !!game?.skills?.unlocked[id];
      let statusText = unlocked ? 'ready' : `at ${SKILL_THRESHOLDS[id]} shelved`;
      let alpha = 0.55;
      if (chip.power && game?.skills) {
        const p = game.skills.powers[id as 'misplaced' | 'matchScan' | 'matchGather'];
        if (p.activeUntil > now) { statusText = `ACTIVE ${((p.activeUntil - now) / 1000).toFixed(0)}s`; alpha = 1; }
        else if (p.cooldownUntil > now) { statusText = `cooldown ${((p.cooldownUntil - now) / 1000).toFixed(0)}s`; alpha = 0.45; }
        else if (unlocked) { statusText = 'ready — click'; alpha = 0.9; }
      } else if (unlocked) {
        alpha = 0.9;
        if (id === 'scanner' && game?.skills?.scannerOn) statusText = 'ON';
        if (id === 'guide') statusText = 'click a tape';
        if (id === 'marquee') statusText = 'drag a box';
      }
      chip.bg.clear();
      chip.bg.fillStyle(unlocked ? 0x4a382c : 0x3b3129, alpha);
      chip.bg.fillRoundedRect(x + 5, y - 40, cw, 54, 10);
      chip.bg.lineStyle(1.4, 0xf6efdd, unlocked ? 0.55 : 0.25);
      chip.bg.strokeRoundedRect(x + 5, y - 40, cw, 54, 10);
      chip.label.setAlpha(unlocked ? 1 : 0.55).setPosition(x + 20, y - 32);
      chip.status.setText(statusText).setAlpha(unlocked ? 0.9 : 0.6).setPosition(x + 20, y - 14);
      chip.zone.setPosition(x + 5, y - 40).setSize(cw, 54);
      x += cw + 12;
    }
  }

  update(): void {
    this.redrawChips();
    this.drawOffscreenArrows();
    this.updateTrayGhost();
  }

  // ------------------------------------------------------------------- tray
  private buildTray(): void {
    const tray = { x: this.W - TRAY.margin - TRAY.w, y: this.H - TRAY.margin - TRAY.h };
    this.trayPanel = this.add.graphics().setDepth(10);
    this.trayTitle = this.add.text(tray.x + 12, tray.y + 6, 'Carry tray 0/5', {
      fontFamily: 'Georgia, serif', fontSize: '13px', fontStyle: 'bold', color: CREAM,
    }).setDepth(11);
    this.trayCollapseBtn = this.add.text(tray.x + TRAY.w - 10, tray.y + 5, '▾', {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: CREAM,
      backgroundColor: WOOD, padding: { x: 6, y: 2 },
    }).setOrigin(1, 0).setDepth(12).setInteractive({ useHandCursor: true });
    this.trayCollapseBtn.on('pointerdown', () => {
      audio.unlock();
      this.trayCollapsed = !this.trayCollapsed;
      this.redrawTray();
    });

    // slot zones (drag a tray tape out, or click empty tray to collapse)
    for (let i = 0; i < TRAY_SLOTS; i++) {
      const zone = this.add.zone(tray.x + 14 + i * 56, tray.y + 26, 52, 54)
        .setOrigin(0, 0).setInteractive({ useHandCursor: true }).setDepth(12);
      const chipImg = this.add.image(tray.x + 14 + i * 56 + 26, tray.y + 26 + 27, 'chip-0')
        .setDisplaySize(34, 34).setDepth(11).setVisible(false);
      zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        audio.unlock();
        const game = this.gameScene();
        if (!game) return;
        const id = game.trayTapes[i];
        if (id === null) return;
        game.drag.beginDragFromTray(i, pointer);
      });
      this.traySlots.push({ zone, chip: chipImg });
    }

    // tray body zone: dragging the whole tray batches its tapes into a row
    this.trayBodyZone = this.add.zone(tray.x, tray.y + 4, TRAY.w, 24).setOrigin(0, 0)
      .setInteractive({ useHandCursor: true }).setDepth(12);
    this.trayBodyZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      audio.unlock();
      this.gameScene()?.drag.beginTrayBatchDrag(pointer);
    });

    this.redrawTray();
  }

  private redrawTray(): void {
    const game = this.gameScene();
    const tray = { x: this.W - TRAY.margin - TRAY.w, y: this.H - TRAY.margin - TRAY.h };
    const ids = game?.trayTapes ?? [null, null, null, null, null];
    const count = ids.filter(v => v !== null).length;

    this.trayPanel.clear();
    this.trayPanel.fillStyle(0x3b2f2f, 0.86);
    this.trayPanel.fillRoundedRect(tray.x, tray.y, TRAY.w, TRAY.h, 10);
    this.trayPanel.lineStyle(1.6, 0xf6efdd, 0.4);
    this.trayPanel.strokeRoundedRect(tray.x, tray.y, TRAY.w, TRAY.h, 10);
    this.trayTitle.setText(`Carry tray ${count}/${TRAY_SLOTS}`).setPosition(tray.x + 12, tray.y + 6);
    this.trayCollapseBtn.setText(this.trayCollapsed ? '▴' : '▾').setPosition(tray.x + TRAY.w - 10, tray.y + 5);

    for (let i = 0; i < TRAY_SLOTS; i++) {
      const sv = this.traySlots[i];
      const sx = tray.x + 14 + i * 56;
      const sy = tray.y + 26;
      sv.zone.setPosition(sx, sy);
      const id = ids[i] ?? null;
      if (!this.trayCollapsed) {
        this.trayPanel.fillStyle(0x2e2422, 0.9);
        this.trayPanel.fillRoundedRect(sx + 2, sy + 2, 48, 50, 6);
        if (id === null) {
          this.trayPanel.lineStyle(1.4, 0xf6efdd, 0.28);
          this.trayPanel.strokeRoundedRect(sx + 8, sy + 8, 36, 38, 6);
        }
        if (sv.chip) {
          const t = id !== null ? game?.tapeData(id) : undefined;
          if (t) {
            sv.chip.setTexture(`chip-${t.combo}`).setPosition(sx + 26, sy + 27).setVisible(true);
          } else {
            sv.chip.setVisible(false);
          }
        }
      } else if (sv.chip) {
        sv.chip.setVisible(false);
      }
    }
    this.trayBodyZone.setPosition(tray.x, tray.y + 4);
  }

  private updateTrayGhost(): void {
    const pos = this.game.registry.get('trayBatchPos') as { x: number; y: number } | null;
    const game = this.gameScene();
    if (pos && game) {
      const n = game.trayIds().length;
      this.trayGhost.setVisible(true).setText(`tray ${n} ×`).setPosition(pos.x + 18, pos.y - 18);
    } else {
      this.trayGhost.setVisible(false);
    }
  }

  // ---------------------------------------------------------- offscreen arrows
  private drawOffscreenArrows(): void {
    const g = this.arrowsGfx;
    g.clear();
    const game = this.gameScene();
    if (!game?.cameras) { this.hideArrowLabels(); return; }
    const cam = game.cameras.main;
    const view = cam.worldView;
    const targets: { x: number; y: number; label: string; color: number }[] = [];
    const guide = this.game.registry.get('guideHint') as { points: { x: number; y: number }[] } | null;
    if (guide) for (const p of guide.points) targets.push({ ...p, label: 'row', color: 0x9fe6a0 });
    const matchHints = this.game.registry.get('matchHints') as { combo: number; points: { x: number; y: number }[] } | null;
    if (matchHints) {
      for (const p of matchHints.points) targets.push({ ...p, label: 'match', color: 0xa8e8ff });
    }
    if (targets.length === 0) { this.hideArrowLabels(); this.matchCountText.setVisible(false); return; }
    const shown = targets.slice(0, 6);
    for (const t of shown) {
      const sx = (t.x - view.x) * cam.zoom;
      const sy = (t.y - view.y) * cam.zoom;
      const margin = 46;
      const px = Phaser.Math.Clamp(sx, margin, this.scale.width - margin);
      const py = Phaser.Math.Clamp(sy, margin + 64, this.scale.height - margin - 108);
      const ang = Math.atan2(t.y - (view.y + view.height / 2), t.x - (view.x + view.width / 2));
      g.fillStyle(t.color, 0.92);
      g.slice(px, py, 15, ang - 0.45, ang + 0.45, false);
      g.fillPath();
      g.fillStyle(0x3b2f2f, 0.85);
      g.fillRoundedRect(px - 20, py + 16, 40, 15, 5);
    }
    shown.forEach((t, i) => {
      const sx = Phaser.Math.Clamp((t.x - view.x) * cam.zoom, 46, this.scale.width - 46);
      const sy = Phaser.Math.Clamp((t.y - view.y) * cam.zoom, 110, this.scale.height - 150);
      this.drawArrowLabelAt(i, sx, sy + 24, t.label);
    });
    this.hideArrowLabelsFrom(shown.length);
    if (matchHints) {
      this.matchCountText
        .setText(`${matchHints.points.length} more offscreen`)
        .setVisible(true)
        .setPosition(this.W / 2, 72);
    } else {
      this.matchCountText.setVisible(false);
    }
  }

  private drawArrowLabelAt(i: number, x: number, y: number, label: string): void {
    while (this.arrowLabels.length <= i) {
      this.arrowLabels.push(
        this.add.text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '10px', color: CREAM }).setOrigin(0.5).setDepth(41),
      );
    }
    const t = this.arrowLabels[i];
    t.setText(label).setVisible(true).setPosition(x, y);
  }

  private hideArrowLabels(): void {
    for (const t of this.arrowLabels) t.setVisible(false);
    this.matchCountText.setVisible(false);
  }

  private hideArrowLabelsFrom(from: number): void {
    for (let i = from; i < this.arrowLabels.length; i++) this.arrowLabels[i].setVisible(false);
  }

  // ------------------------------------------------------------------- events
  private onGameReady(): void {
    const game = this.gameScene();
    if (game) {
      this.onSkills();
      game.emitCounters();
      this.redrawTray();
    }
  }

  private onCounters(c: {
    shelved: number; total: number; loose?: number; tray?: number; repairs?: number;
  }): void {
    const game = this.gameScene();
    this.countersText.setText(`Shelved ${c.shelved} / ${c.total}`);
    const seed = game?.seed ?? '?';
    const bits: string[] = [];
    if (c.loose !== undefined) bits.push(`loose ${c.loose}`);
    if (c.tray !== undefined && c.tray > 0) bits.push(`tray ${c.tray}`);
    if (c.repairs !== undefined && c.repairs > 0) bits.push(`to repair ${c.repairs}`);
    bits.push(`seed ${seed}`);
    this.subText.setText(bits.join(' · '));
  }

  private onSkills(): void {
    this.redrawChips(true);
    const game = this.gameScene();
    if (game?.skills) {
      this.modeButton.setText(`mode: ${game.skills.selectMode ? 'select' : 'pan'} (touch)`);
    }
  }

  private showToast(msg: string): void {
    this.toastText.setText(msg).setAlpha(1).setPosition(this.W / 2, 96);
    if (this.toastTween) this.toastTween.remove();
    this.toastTween = this.tweens.add({
      targets: this.toastText,
      alpha: { from: 1, to: 0 }, y: 76,
      delay: 2800, duration: 500,
    });
  }

  private showHint(msg: string): void {
    this.hintText.setText(msg).setAlpha(1).setPosition(this.W / 2, this.H - 130);
    if (this.hintTimer) this.hintTimer.remove();
    this.hintTimer = this.time.delayedCall(1700, () => {
      this.tweens.add({ targets: this.hintText, alpha: 0, duration: 300 });
    });
  }

  private flashSave(): void {
    const txt = this.add.text(this.W - 330, this.H - 108, 'saved', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#b6e3b0',
    }).setOrigin(1, 1).setDepth(30);
    this.tweens.add({ targets: txt, alpha: 0, duration: 900, delay: 400, onComplete: () => txt.destroy() });
  }

  // ------------------------------------------------------------------ panels
  private showHelp(): void {
    if (this.helpPanel || this.confirmPanel || this.completePanel || this.migratePanel) return;
    this.setUiBlocked(true);
    const lines = [
      'Tidy Tapes — how to play',
      '',
      'Sort cassettes by BOTH shell color and printed symbol. Each color+symbol group has',
      'TWO matching rows on the bench — either row is equally correct. Rows are labeled with',
      'a color chip + symbol. Tapes slot into ANY row with room: a wrong row is accepted',
      'without a peep — the ✓ on an organizer verifies it, and the Misfile Finder reveals',
      'mistakes. Pull a shelved tape back out any time. Damaged tapes (torn sticker, spilled',
      'ribbon) need the Repair Bench first; scuffed shells are purely cosmetic.',
      '',
      'Controls',
      '  · drag a tape — the grab point stays exactly under your cursor',
      '  · mouse wheel — zoom (centered on the cursor) · + / − / fit — zoom buttons',
      '  · Space + drag, right-drag, WASD/arrows — pan (works while carrying)',
      '  · carry tray (bottom right) — drop tapes in, drag one out, or drag the tray',
      '    header onto a row to file everything that fits',
      '  · touch: one finger pans empty table, two fingers pinch-zoom + pan',
      '  · D defect scanner · M misfile finder · S match scan · G match gather · F fit',
      '',
      'Skills unlock as you shelve (chips bottom-left). Powers run 15 s with a 60 s',
      'cooldown and never drop held tapes.',
    ];
    const game = this.gameScene();
    if (game) lines.push(`Seed: ${game.seed} — replay any run with ?seed=${game.seed}`);
    const w = Math.min(700, this.W - 60);
    const h = 96 + lines.length * 19;
    const px = (this.W - w) / 2;
    const py = Math.max(70, (this.H - h) / 2 - 30);
    const panel = this.openPanel(lines, 'Close', () => { /* close only */ }, null);
    this.helpPanel = panel;

    // sound check: audition the Magnetic Tuck and the Tiny Chime
    const yBase = py + h - 44;
    const mkSnd = (label: string, dx: number, cb: () => void) => {
      const b = this.add.text(px + 24 + dx, yBase, label, {
        fontFamily: 'Georgia, serif', fontSize: '13px', color: CREAM,
        backgroundColor: '#5a3520', padding: { x: 10, y: 5 },
      }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true }).setDepth(101);
      b.on('pointerdown', () => { audio.unlock(); cb(); });
      panel.add(b);
    };
    mkSnd('♪ tuck', 0, () => { audio.play('tuck'); this.time.delayedCall(260, () => audio.play('tuk')); });
    mkSnd('♪ tuck ×5', 92, () => audio.auditionTuckBatch());
    mkSnd('♪ tiny chime', 196, () => audio.play('chime'));
  }

  private confirmNewGame(): void {
    if (this.helpPanel || this.confirmPanel || this.completePanel || this.migratePanel) return;
    this.setUiBlocked(true);
    const lines = [
      'Start a new game?',
      '',
      'A fresh bench with a new random seed (400+ tapes) is generated.',
      'Your current run is saved first.',
    ];
    this.confirmPanel = this.openPanel(lines, 'New Game', () => {
      const game = this.gameScene();
      game?.save();
      game?.newGame();
    }, 'Keep sorting');
  }

  /** v1 save found: layout changed — separate the new board from old progress */
  private showMigrate(): void {
    if (this.migratePanel) return;
    const skills = readV1Skills();
    const hadSkills = skills && Object.values(skills).some(v => v);
    this.setUiBlocked(true);
    const lines = [
      'A previous season was found (old bench layout)',
      '',
      'The bench has been rearranged (32 groups × 2 matching rows), so the old board',
      'cannot be restored as-is. Your unlocked skills can carry over to a fresh bench.',
    ];
    const panel = this.openPanel(
      lines,
      hadSkills ? 'Fresh bench (keep skills)' : 'Fresh bench',
      () => {
        try { localStorage.removeItem('tidy-tapes-save-v1'); } catch { /* ignore */ }
        const game = this.gameScene();
        if (game) {
          if (hadSkills && skills) {
            game.carriedSkills = { ...skills } as unknown as typeof game.carriedSkills;
            game.skills.unlocked = { ...game.skills.unlocked, ...skills } as typeof game.skills.unlocked;
            game.skills.syncPowerUnlocks();
          }
          game.newGame(undefined, true);
        }
      },
      'Discard progress',
      () => {
        try { localStorage.removeItem('tidy-tapes-save-v1'); } catch { /* ignore */ }
        this.gameScene()?.newGame();
      },
    );
    this.migratePanel = panel;
  }

  private openPanel(
    lines: string[], confirmLabel: string, onConfirm: () => void, cancelLabel: string | null,
    onCancel?: () => void,
  ): Phaser.GameObjects.Container {
    const w = Math.min(700, this.W - 60);
    const h = 96 + lines.length * 19;
    const x = (this.W - w) / 2;
    const y = Math.max(70, (this.H - h) / 2 - 30);
    const panel = this.add.container(x, y).setDepth(100);
    const bg = this.add.graphics();
    bg.fillStyle(0x3b2f2f, 0.96);
    bg.fillRoundedRect(0, 0, w, h, 14);
    bg.lineStyle(2, 0xf6efdd, 0.4);
    bg.strokeRoundedRect(0, 0, w, h, 14);
    panel.add(bg);
    panel.add(this.add.text(24, 18, lines.join('\n'), {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: CREAM, wordWrap: { width: w - 48 },
    }));
    const mkBtn = (label: string, px: number, cb: () => void, bgc: string, col: string) => {
      const b = this.add.text(px, h - 40, label, {
        fontFamily: 'Georgia, serif', fontSize: '15px', color: col,
        backgroundColor: bgc, padding: { x: 12, y: 7 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => {
        audio.unlock();
        this.closePanel(panel);
        cb();
      });
      panel.add(b);
    };
    if (cancelLabel) mkBtn(cancelLabel, 130, () => { if (onCancel) onCancel(); }, WOOD, CREAM);
    mkBtn(confirmLabel, w - 130, onConfirm, '#8a4a35', '#ffd9c9');
    return panel;
  }

  private closePanel(panel: Phaser.GameObjects.Container): void {
    panel.destroy(true);
    if (this.confirmPanel === panel) this.confirmPanel = null;
    if (this.helpPanel === panel) this.helpPanel = null;
    if (this.completePanel === panel) this.completePanel = null;
    if (this.migratePanel === panel) this.migratePanel = null;
    if (!this.helpPanel && !this.confirmPanel && !this.completePanel && !this.migratePanel) {
      this.setUiBlocked(false);
    }
  }

  private showComplete(stats: { seed: number; playSeconds: number; repairs: number; total?: number }): void {
    if (this.completePanel) return;
    this.setUiBlocked(true);
    const game = this.gameScene();
    const total = stats.total ?? game?.world.totalTapes ?? 0;
    const mins = Math.floor(stats.playSeconds / 60);
    const lines = [
      'The shop is tidy — every tape verified in its row!',
      '',
      `All ${total} tapes shelved — seed ${stats.seed}`,
      `Repairs completed: ${stats.repairs}`,
      `Time: ${mins} min ${Math.floor(stats.playSeconds % 60)} s`,
      '',
      'No rush: keep rearranging, or start a fresh bench.',
    ];
    const w = Math.min(560, this.W - 60);
    const h = 96 + lines.length * 22;
    const x = (this.W - w) / 2;
    const y = Math.max(70, (this.H - h) / 2 - 30);
    const panel = this.add.container(x, y).setDepth(120);
    const bg = this.add.graphics();
    bg.fillStyle(0x4a382c, 0.97);
    bg.fillRoundedRect(0, 0, w, h, 16);
    bg.lineStyle(2.5, 0xffe9a8, 0.8);
    bg.strokeRoundedRect(0, 0, w, h, 16);
    panel.add(bg);
    panel.add(this.add.text(24, 20, lines.join('\n'), {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: CREAM, wordWrap: { width: w - 48 },
    }));
    const b1 = this.add.text(w / 2 - 96, h - 44, 'Keep tidying', {
      fontFamily: 'Georgia, serif', fontSize: '15px', color: CREAM,
      backgroundColor: WOOD, padding: { x: 12, y: 7 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    b1.on('pointerdown', () => this.closePanel(panel));
    panel.add(b1);
    const b2 = this.add.text(w / 2 + 96, h - 44, 'New Game', {
      fontFamily: 'Georgia, serif', fontSize: '15px', color: '#ffd9c9',
      backgroundColor: '#8a4a35', padding: { x: 12, y: 7 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    b2.on('pointerdown', () => {
      this.closePanel(panel);
      this.gameScene()?.newGame();
    });
    panel.add(b2);
    this.completePanel = panel;
  }

  // ------------------------------------------------------------------ resize
  private onResize(gameSize: Phaser.Structs.Size): void {
    this.W = gameSize.width;
    this.H = gameSize.height;
    this.countersText.setPosition(this.W / 2, 6);
    this.subText.setPosition(this.W / 2, 34);
    this.toastText.setPosition(this.W / 2, 96);
    this.hintText.setPosition(this.W / 2, this.H - 130);
    this.modeButton.setPosition(this.W - 12, 40);
    this.destroyChips();
    this.buildChips();
    this.destroyTray();
    this.buildTray();
  }

  private destroyTray(): void {
    this.trayPanel?.destroy();
    this.trayTitle?.destroy();
    this.trayCollapseBtn?.destroy();
    this.trayBodyZone?.destroy();
    for (const s of this.traySlots) { s.zone.destroy(); s.chip?.destroy(); }
    this.traySlots = [];
  }
}
