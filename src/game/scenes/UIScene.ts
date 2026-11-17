/**
 * Tidy Tapes — fixed HUD scene (own camera, never moves with the world).
 */
import Phaser from 'phaser';
import { SKILL_THRESHOLDS } from '../config';
import { audio } from '../audio';
import { SKILL_INFO } from '../controllers/SkillsController';
import type { SkillId } from '../types';
import type { GameScene } from './GameScene';

const CHIP_ORDER: SkillId[] = ['scanner', 'misplaced', 'guide', 'marquee', 'matchScan', 'matchGather'];
const CREAM = '#f6efdd';
const WOOD = '#6e4429';
const CHIP_W = 166;

interface ChipViews {
  bg: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
  power: boolean;
}

export class UIScene extends Phaser.Scene {
  private countersText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private modeButton!: Phaser.GameObjects.Text;
  private chips = new Map<SkillId, ChipViews>();
  private toastTween: Phaser.Tweens.Tween | null = null;
  private hintTimer: Phaser.Time.TimerEvent | null = null;
  private completePanel: Phaser.GameObjects.Container | null = null;
  private confirmPanel: Phaser.GameObjects.Container | null = null;
  private helpPanel: Phaser.GameObjects.Container | null = null;
  private arrowsGfx!: Phaser.GameObjects.Graphics;
  private matchCountText!: Phaser.GameObjects.Text;
  private arrowLabels: Phaser.GameObjects.Text[] = [];
  private lastChipDraw = 0;
  private W = 1280;
  private H = 720;

  constructor() {
    super({ key: 'UI' });
  }

  create(): void {
    this.W = this.scale.width;
    this.H = this.scale.height;
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

    this.toastText = this.add.text(this.W / 2, 96, '', {
      fontFamily: 'Georgia, serif', fontSize: '17px', color: CREAM,
      backgroundColor: 'rgba(59,47,47,0.9)', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setAlpha(0).setDepth(50);
    this.hintText = this.add.text(this.W / 2, this.H - 96, '', {
      fontFamily: 'Georgia, serif', fontSize: '15px', color: '#ffe9a8',
      backgroundColor: 'rgba(59,47,47,0.88)', padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setAlpha(0).setDepth(50);

    this.arrowsGfx = this.add.graphics().setDepth(40);
    this.matchCountText = this.add.text(this.W / 2, 72, '', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#a8e8ff',
      backgroundColor: 'rgba(59,47,47,0.85)', padding: { x: 10, y: 4 },
    }).setOrigin(0.5).setDepth(42).setVisible(false);

    this.game.events.on('counters', this.onCounters, this);
    this.game.events.on('skills:changed', this.onSkills, this);
    this.game.events.on('toast', this.showToast, this);
    this.game.events.on('hint', this.showHint, this);
    this.game.events.on('complete', this.showComplete, this);
    this.game.events.on('game:ready', this.onGameReady, this);
    this.game.events.on('save:flash', this.flashSave, this);
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('counters', this.onCounters, this);
      this.game.events.off('skills:changed', this.onSkills, this);
      this.game.events.off('toast', this.showToast, this);
      this.game.events.off('hint', this.showHint, this);
      this.game.events.off('complete', this.showComplete, this);
      this.game.events.off('game:ready', this.onGameReady, this);
      this.game.events.off('save:flash', this.flashSave, this);
    });
  }

  private gameScene(): GameScene | null {
    return (this.scene.get('Game') as GameScene | null) ?? null;
  }

  // ------------------------------------------------------------- top-right UI
  private buildTopRight(): void {
    const mkBtn = (label: string, right: number, cb: () => void, color = CREAM, bg = WOOD) => {
      const t = this.add.text(right, 13, label, {
        fontFamily: 'Georgia, serif', fontSize: '15px', color,
        backgroundColor: bg, padding: { x: 10, y: 6 },
      }).setOrigin(1, 0).setInteractive({ useHandCursor: true }).setDepth(20);
      t.on('pointerdown', () => { audio.unlock(); cb(); });
      return t;
    };
    mkBtn('?', this.W - 14, () => this.showHelp());
    mkBtn('−', this.W - 64, () => this.zoomStep(-1));
    mkBtn('+', this.W - 112, () => this.zoomStep(1));
    mkBtn('New Game', this.W - 160, () => this.confirmNewGame(), '#ffd9c9', '#8a4a35');
    this.modeButton = this.add.text(this.W - 14, 40, 'mode: pan (touch)', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#cdbfa5',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true }).setDepth(20);
    this.modeButton.on('pointerdown', () => this.toggleMode());
  }

  // ------------------------------------------------------------------- chips
  private buildChips(): void {
    let x = 14;
    const y = this.H - 62;
    for (const id of CHIP_ORDER) {
      const power = id === 'matchScan' || id === 'matchGather';
      const bg = this.add.graphics().setDepth(10);
      const label = this.add.text(x + 24, y - 34, SKILL_INFO[id].name, {
        fontFamily: 'Georgia, serif', fontSize: '13px', fontStyle: 'bold', color: CREAM,
      }).setDepth(11);
      const status = this.add.text(x + 24, y - 15, '', {
        fontFamily: 'Georgia, serif', fontSize: '11px', color: '#cdbfa5',
      }).setDepth(11);
      const zone = this.add.zone(x + 6, y - 42, CHIP_W, 56).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true }).setDepth(12);
      zone.on('pointerdown', () => this.onChip(id));
      this.chips.set(id, { bg, label, status, zone, power });
      x += CHIP_W + 16;
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
    else if (id === 'misplaced') sk.toggleMisplaced();
    else if (id === 'matchScan' || id === 'matchGather') sk.tryActivatePower(id);
    else if (id === 'guide') this.showToast(SKILL_INFO.guide.hint);
    else if (id === 'marquee') this.showToast(SKILL_INFO.marquee.hint);
  }

  private redrawChips(force = false): void {
    if (!force && this.time.now - this.lastChipDraw < 200) return;
    this.lastChipDraw = this.time.now;
    const game = this.gameScene();
    const now = game ? game.time.now : 0;
    let x = 14;
    const y = this.H - 62;
    for (const id of CHIP_ORDER) {
      const chip = this.chips.get(id);
      if (!chip) continue;
      const unlocked = !!game?.skills?.unlocked[id];
      let statusText = unlocked ? 'ready' : `at ${SKILL_THRESHOLDS[id]} shelved`;
      let alpha = 0.55;
      if (chip.power && game?.skills) {
        const p = id === 'matchScan' ? game.skills.powers.matchScan : game.skills.powers.matchGather;
        if (p.activeUntil > now) { statusText = `ACTIVE ${((p.activeUntil - now) / 1000).toFixed(0)}s`; alpha = 1; }
        else if (p.cooldownUntil > now) { statusText = `cooldown ${((p.cooldownUntil - now) / 1000).toFixed(0)}s`; alpha = 0.45; }
        else if (unlocked) { statusText = 'ready — click'; alpha = 0.9; }
      } else if (unlocked) {
        alpha = 0.9;
        if (id === 'scanner' && game?.skills?.scannerOn) statusText = 'ON';
        if (id === 'misplaced' && game?.skills?.misplacedOn) statusText = 'ON';
        if (id === 'guide') statusText = 'click a tape';
        if (id === 'marquee') statusText = 'drag a box';
      }
      chip.bg.clear();
      chip.bg.fillStyle(unlocked ? 0x4a382c : 0x3b3129, alpha);
      chip.bg.fillRoundedRect(x + 6, y - 42, CHIP_W, 56, 10);
      chip.bg.lineStyle(1.4, 0xf6efdd, unlocked ? 0.55 : 0.25);
      chip.bg.strokeRoundedRect(x + 6, y - 42, CHIP_W, 56, 10);
      chip.label.setAlpha(unlocked ? 1 : 0.55).setPosition(x + 24, y - 34);
      chip.status.setText(statusText).setAlpha(unlocked ? 0.9 : 0.6).setPosition(x + 24, y - 15);
      chip.zone.setPosition(x + 6, y - 42);
      x += CHIP_W + 16;
    }
  }

  update(): void {
    this.redrawChips();
    this.drawOffscreenArrows();
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
    const guide = this.game.registry.get('guideHint') as { x: number; y: number } | null;
    if (guide) targets.push({ ...guide, label: 'row', color: 0x9fe6a0 });
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
      const py = Phaser.Math.Clamp(sy, margin + 64, this.scale.height - margin - 70);
      const ang = Math.atan2(t.y - (view.y + view.height / 2), t.x - (view.x + view.width / 2));
      g.fillStyle(t.color, 0.92);
      g.slice(px, py, 15, ang - 0.45, ang + 0.45, false);
      g.fillPath();
      g.fillStyle(0x3b2f2f, 0.85);
      g.fillRoundedRect(px - 20, py + 16, 40, 15, 5);
    }
    shown.forEach((t, i) => {
      const sx = Phaser.Math.Clamp((t.x - view.x) * cam.zoom, 46, this.scale.width - 46);
      const sy = Phaser.Math.Clamp((t.y - view.y) * cam.zoom, 110, this.scale.height - 116);
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
    }
  }

  private onCounters(c: { shelved: number; total: number; loose?: number; repairs?: number }): void {
    const game = this.gameScene();
    this.countersText.setText(`Shelved ${c.shelved} / ${c.total}`);
    const seed = game?.seed ?? '?';
    const extra = (c.loose !== undefined && c.repairs !== undefined)
      ? ` · loose ${c.loose} · to repair ${c.repairs}` : '';
    this.subText.setText(`${extra} · seed ${seed} (?seed=${seed} replays)`.replace(' ·', extra ? ' ·' : ''));
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
    this.hintText.setText(msg).setAlpha(1).setPosition(this.W / 2, this.H - 96);
    if (this.hintTimer) this.hintTimer.remove();
    this.hintTimer = this.time.delayedCall(1700, () => {
      this.tweens.add({ targets: this.hintText, alpha: 0, duration: 300 });
    });
  }

  private flashSave(): void {
    const txt = this.add.text(this.W - 16, this.H - 78, 'saved', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#b6e3b0',
    }).setOrigin(1, 1).setDepth(30);
    this.tweens.add({ targets: txt, alpha: 0, duration: 900, delay: 400, onComplete: () => txt.destroy() });
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
      : 'Pan mode: drag empty table to pan; two fingers anywhere also pan');
  }

  // ------------------------------------------------------------------ panels
  private showHelp(): void {
    if (this.helpPanel || this.confirmPanel) return;
    const lines = [
      'Tidy Tapes — how to play',
      '',
      'Match each cassette by BOTH shell color and printed symbol, then drop it on the',
      'wooden rack with the same color chip + symbol. Racks sit in an 8×8 grid:',
      'symbol = column, color = row. Defective tapes need a repair first — drop one on',
      'the Repair Bench (far left) or double-click it.',
      '',
      'Controls',
      '  · drag a tape — the grab point stays exactly under your cursor',
      '  · wheel / trackpad, WASD / arrows — pan the big table (works while holding)',
      '  · right-drag — pan · Q/E or +/− — zoom · Esc — cancel a drag',
      '  · touch: two-finger pan · mode toggle for marquee Select',
      '  · D defect scanner · M misplaced finder · S match scan · G match gather',
      '',
      'Skills unlock as you shelve tapes (chips at the bottom). The two powers run',
      '15 s with a 60 s cooldown — they never time out your session or drop held tapes.',
    ];
    const game = this.gameScene();
    if (game) lines.push(`Seed: ${game.seed} — replay any run with ?seed=${game.seed}`);
    this.helpPanel = this.openPanel(lines, 'Close', () => { /* close only */ }, null);
  }

  private confirmNewGame(): void {
    if (this.helpPanel || this.confirmPanel || this.completePanel) return;
    const lines = [
      'Start a new game?',
      '',
      'A fresh table with a new random seed (400+ tapes) is generated.',
      'Your current run is saved first and restores on reload.',
    ];
    this.confirmPanel = this.openPanel(lines, 'New Game', () => {
      const game = this.gameScene();
      game?.save();
      game?.newGame();
    }, 'Keep sorting');
  }

  private openPanel(lines: string[], confirmLabel: string, onConfirm: () => void, cancelLabel: string | null): Phaser.GameObjects.Container {
    const w = Math.min(680, this.W - 60);
    const h = 84 + lines.length * 20;
    const x = (this.W - w) / 2;
    const y = (this.H - h) / 2 - 30;
    const panel = this.add.container(0, 0).setDepth(100);
    const bg = this.add.graphics();
    bg.fillStyle(0x3b2f2f, 0.96);
    bg.fillRoundedRect(x, y, w, h, 14);
    bg.lineStyle(2, 0xf6efdd, 0.4);
    bg.strokeRoundedRect(x, y, w, h, 14);
    panel.add(bg);
    panel.add(this.add.text(x + 26, y + 18, lines.join('\n'), {
      fontFamily: 'Georgia, serif', fontSize: '15px', color: CREAM, wordWrap: { width: w - 52 },
    }));
    const mkBtn = (label: string, px: number, cb: () => void, bgc: string, col: string) => {
      const b = this.add.text(px, y + h - 46, label, {
        fontFamily: 'Georgia, serif', fontSize: '16px', color: col,
        backgroundColor: bgc, padding: { x: 14, y: 8 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => {
        audio.unlock();
        this.closePanel(panel);
        cb();
      });
      panel.add(b);
    };
    if (cancelLabel) mkBtn(cancelLabel, x + 130, () => { /* close only */ }, WOOD, CREAM);
    mkBtn(confirmLabel, x + w - 130, onConfirm, '#8a4a35', '#ffd9c9');
    return panel;
  }

  private closePanel(panel: Phaser.GameObjects.Container): void {
    panel.destroy(true);
    if (this.confirmPanel === panel) this.confirmPanel = null;
    if (this.helpPanel === panel) this.helpPanel = null;
    if (this.completePanel === panel) this.completePanel = null;
  }

  private showComplete(stats: { seed: number; playSeconds: number; repairs: number; total?: number }): void {
    if (this.completePanel) return;
    const game = this.gameScene();
    const total = stats.total ?? game?.world.totalTapes ?? 0;
    const mins = Math.floor(stats.playSeconds / 60);
    const lines = [
      'The shop is tidy!',
      '',
      `All ${total} tapes shelved — seed ${stats.seed}`,
      `Repairs completed: ${stats.repairs}`,
      `Time: ${mins} min ${Math.floor(stats.playSeconds % 60)} s`,
      '',
      'No rush: keep rearranging, or start a fresh table.',
    ];
    const w = Math.min(560, this.W - 60);
    const h = 84 + lines.length * 22;
    const x = (this.W - w) / 2;
    const y = (this.H - h) / 2 - 30;
    const panel = this.add.container(0, 0).setDepth(120);
    const bg = this.add.graphics();
    bg.fillStyle(0x4a382c, 0.97);
    bg.fillRoundedRect(x, y, w, h, 16);
    bg.lineStyle(2.5, 0xffe9a8, 0.8);
    bg.strokeRoundedRect(x, y, w, h, 16);
    panel.add(bg);
    panel.add(this.add.text(x + 26, y + 20, lines.join('\n'), {
      fontFamily: 'Georgia, serif', fontSize: '17px', color: CREAM, wordWrap: { width: w - 52 },
    }));
    const b1 = this.add.text(x + w / 2 - 96, y + h - 48, 'Keep tidying', {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: CREAM,
      backgroundColor: WOOD, padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    b1.on('pointerdown', () => this.closePanel(panel));
    panel.add(b1);
    const b2 = this.add.text(x + w / 2 + 96, y + h - 48, 'New Game', {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#ffd9c9',
      backgroundColor: '#8a4a35', padding: { x: 14, y: 8 },
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
    this.hintText.setPosition(this.W / 2, this.H - 96);
    this.modeButton.setPosition(this.W - 14, 40);
    this.destroyChips();
    this.buildChips();
  }
}
