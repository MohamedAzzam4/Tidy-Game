/**
 * Tidy Tapes — repair overlay scene (three short tactile minigames).
 * Rewind: rotate one reel with a pencil in continuous circular strokes until the
 *   loose brown ribbon returns to its guides.
 * Sticker swap: peel the damaged sticker with tweezers, wipe the adhesive
 *   residue, press a new sticker of the SAME symbol in the same spot.
 * Paint touch-up: rub a matching marker over the small faded patch — the
 *   original color is revealed directly under the stroke.
 * Feedback is restrained: soft sounds, tiny motions, no screen shake.
 */
import Phaser from 'phaser';
import { COLORS, SYMBOLS } from '../config';
import { audio } from '../audio';
import type { DefectType } from '../types';

const SCALE = 3.4; // big cassette scale
const FACE_W = 92 * SCALE; // 312.8
const FACE_H = 60 * SCALE; // 204

const PATCH_X = 18 * SCALE, PATCH_Y = 47 * SCALE;         // paint patch top-left
const PATCH_W = 24 * SCALE, PATCH_H = 14 * SCALE;

export class RepairScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Repair' });
  }

  private tapeId = -1;
  private combo = 0;
  private kind: DefectType = 'rewind';
  private success = false;
  private done = false;

  // shared
  private cx = 640; private cy = 360; // cassette center (screen)
  private instruction!: Phaser.GameObjects.Text;
  private tool!: Phaser.GameObjects.Image;
  private pointerDown = false;

  // rewind state
  private reel!: Phaser.GameObjects.Container;
  private ribbon!: Phaser.GameObjects.Graphics;
  private reelAngle = 0;
  private windProgress = 0;
  private lastSqueak = 0;
  private lastPointerAngle: number | null = null;

  // sticker state
  private phase: 'peel' | 'wipe' | 'place' | 'press' = 'peel';
  private sticker!: Phaser.GameObjects.Image;
  private crack!: Phaser.GameObjects.Graphics;
  private residue!: Phaser.GameObjects.Graphics;
  private peelDragStart: { x: number; y: number } | null = null;
  private peelDist = 0;
  private wipeDist = 0;
  private newSticker!: Phaser.GameObjects.Image;
  private draggingSticker = false;
  private pressStart = 0;
  private pressGfx!: Phaser.GameObjects.Graphics;

  // paint state
  private rt!: Phaser.GameObjects.RenderTexture;
  private coverage = new Set<string>();
  private trail!: Phaser.GameObjects.Graphics;
  private lastTrail: { x: number; y: number } | null = null;
  private rubDist = 0;
  private lastRubSound = 0;

  init(data: { tapeId: number }): void {
    this.tapeId = data.tapeId;
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    this.cx = W / 2;
    this.cy = H / 2 - 10;
    this.combo = (this.game.registry.get('repairCombo') as number) ?? 0;

    // resolve tape from the paused GameScene
    const game = this.scene.get('Game') as unknown as {
      world: { tapes: { id: number; combo: number; defect: DefectType | null; repaired: boolean }[] };
    };
    const tape = game?.world?.tapes.find(t => t.id === this.tapeId);
    if (!tape) { this.close(false); return; }
    this.combo = tape.combo;
    this.kind = (tape.defect ?? 'rewind');
    this.success = false;

    // dim backdrop
    const dim = this.add.graphics();
    dim.fillStyle(0x1a0f08, 0.72);
    dim.fillRect(0, 0, W, H);
    dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, W, H), Phaser.Geom.Rectangle.Contains);

    // title
    this.add.text(W / 2, 34, 'Repair Bench', {
      fontFamily: 'Georgia, serif', fontSize: '24px', fontStyle: 'bold', color: '#f6efdd',
    }).setOrigin(0.5);
    this.instruction = this.add.text(W / 2, 70, '', {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#ffe9a8',
      wordWrap: { width: W - 200 },
    }).setOrigin(0.5);

    // big cassette
    this.add.image(this.cx, this.cy, `tape-face-${this.combo}`)
      .setDisplaySize(FACE_W, FACE_H).setAngle(-3);
    this.add.image(this.cx, this.cy, `defect-${this.kind}`)
      .setDisplaySize(FACE_W, FACE_H).setAngle(-3);

    // cancel button
    const cancel = this.add.text(24, H - 46, '← put it back', {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#f6efdd',
      backgroundColor: '#6e4429', padding: { x: 12, y: 7 },
    }).setInteractive({ useHandCursor: true });
    cancel.on('pointerdown', () => this.close(false));

    // tool cursor (follows pointer, replaces the mouse look)
    this.tool = this.add.image(0, 0, this.kind === 'rewind' ? 'tool-pencil'
      : this.kind === 'sticker' ? 'tool-tweezers' : 'tool-marker');
    if (this.kind === 'paint') {
      const colorIdx = Math.floor(this.combo / SYMBOLS.length);
      const tint = Phaser.Display.Color.HexStringToColor(COLORS[colorIdx].css).color;
      this.tool.setTint(tint);
    }
    this.tool.setDepth(300).setVisible(false);
    if (this.kind === 'paint') this.tool.setOrigin(0.5, 0); // tip at top
    else this.tool.setOrigin(0.5, 1); // tip at bottom
    this.input.setDefaultCursor('none');

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.pointerDown = true; this.onDown(p); });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => { this.pointerDown = false; this.onUp(p); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.setDefaultCursor('default'));

    switch (this.kind) {
      case 'rewind': this.setupRewind(); break;
      case 'sticker': this.setupSticker(); break;
      case 'paint': this.setupPaint(); break;
    }
  }

  private faceXY(lx: number, ly: number): { x: number; y: number } {
    // local face coords (0..92, 0..60, pre-scale) -> screen
    return { x: this.cx + (lx - 46) * SCALE, y: this.cy + (ly - 30) * SCALE };
  }


  // ================================================================== REWIND
  private setupRewind(): void {
    this.instruction.setText('The ribbon spilled out. Hold the pencil on the right reel and wind in one continuous circular motion until the ribbon returns to its guides.');

    const lp = this.faceXY(34, 38); // left reel (already wound)
    const reelL = this.add.graphics();
    reelL.lineStyle(3, 0x8a5a3b, 0.9);
    reelL.strokeCircle(lp.x, lp.y, 24);

    // spinning right reel
    const rp = this.faceXY(58, 38);
    this.reel = this.add.container(rp.x, rp.y);
    const reelImg = this.add.image(0, 0, this.makeReelTexture());
    this.reel.add(reelImg);

    // loose ribbon squiggle
    this.ribbon = this.add.graphics();
    this.drawRibbon();

    // guide marks (where the ribbon must return)
    const guides = this.add.graphics();
    guides.lineStyle(2.5, 0x9fe6a0, 0.85);
    const g1 = this.faceXY(75, 42);
    guides.strokeRoundedRect(g1.x - 9, g1.y - 4, 18, 8, 2);
  }

  private makeReelTexture(): string {
    // small canvas texture: reel with spokes
    const key = 'reel-big';
    if (this.textures.exists(key)) this.textures.remove(key);
    const tex = this.textures.createCanvas(key, 120, 120);
    const ctx = (tex as Phaser.Textures.CanvasTexture).getContext();
    ctx.clearRect(0, 0, 120, 120);
    ctx.beginPath(); ctx.arc(60, 60, 54, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(122,74,42,0.92)'; ctx.fill(); // wound ribbon
    ctx.strokeStyle = 'rgba(60,35,18,0.8)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.arc(60, 60, 40, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(90,55,28,0.9)'; ctx.lineWidth = 6; ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      ctx.beginPath();
      ctx.moveTo(60 + Math.cos(a) * 14, 60 + Math.sin(a) * 14);
      ctx.lineTo(60 + Math.cos(a) * 46, 60 + Math.sin(a) * 46);
      ctx.strokeStyle = 'rgba(40,24,12,0.85)'; ctx.lineWidth = 5; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(60, 60, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#f6efdd'; ctx.fill();
    ctx.strokeStyle = '#3b2f2f'; ctx.lineWidth = 3; ctx.stroke();
    (tex as Phaser.Textures.CanvasTexture).refresh();
    return key;
  }

  private drawRibbon(): void {
    const g = this.ribbon;
    g.clear();
    const p = 1 - this.windProgress; // 1 -> fully loose
    if (p <= 0) return;
    const start = this.faceXY(64, 40);
    const amp = 26 * p;
    const segs = Math.max(2, Math.round(6 * p));
    g.lineStyle(5, 0x7a4a2a, 0.95);
    g.beginPath();
    g.moveTo(start.x, start.y);
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const x = start.x + 90 * t * p + 10;
      const y = start.y + Math.sin(t * Math.PI * 2 * (1 + p)) * amp + 30 * t * p;
      g.lineTo(x, y);
    }
    g.strokePath();
    // sagging loop on the cassette (quadratic sampled manually — Graphics has no curve API)
    if (p > 0.25) {
      g.lineStyle(4, 0x7a4a2a, 0.8);
      g.beginPath();
      g.moveTo(start.x, start.y);
      const qx0 = start.x - 20, qy0 = start.y + 34 * p;
      const qx1 = start.x + 26 * p, qy1 = start.y + 44 * p;
      for (let k = 1; k <= 8; k++) {
        const u = k / 8;
        const bx = (1 - u) * (1 - u) * start.x + 2 * (1 - u) * u * qx0 + u * u * qx1;
        const by = (1 - u) * (1 - u) * start.y + 2 * (1 - u) * u * qy0 + u * u * qy1;
        g.lineTo(bx, by);
      }
      g.strokePath();
    }
  }

  private updateRewind(p: Phaser.Input.Pointer): void {
    const rp = this.faceXY(58, 38);
    const near = Math.hypot(p.x - rp.x, p.y - rp.y) < 90;
    this.tool.setVisible(true);
    if (this.pointerDown && near) {
      // pencil engaged at the hub (tip on the reel)
      this.tool.setPosition(rp.x, rp.y);
      const ang = Math.atan2(p.y - rp.y, p.x - rp.x);
      if (this.lastPointerAngle !== null) {
        let d = ang - this.lastPointerAngle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.windProgress = Math.min(1, this.windProgress + Math.abs(d) / (Math.PI * 12));
        this.reelAngle += d * 2;
        this.reel.setRotation(this.reelAngle);
        if (this.time.now - this.lastSqueak > 420 && Math.abs(d) > 0.04) {
          this.lastSqueak = this.time.now;
          audio.play('squeak');
        }
      }
      this.lastPointerAngle = ang;
      this.drawRibbon();
      if (this.windProgress >= 1) this.finishRepair();
    } else {
      this.lastPointerAngle = null;
      this.tool.setPosition(p.x, p.y);
    }
  }

  // ================================================================= STICKER
  private setupSticker(): void {
    const symbol = SYMBOLS[this.combo % SYMBOLS.length];
    const colorIdx = Math.floor(this.combo / SYMBOLS.length);
    const inkHex = Phaser.Display.Color.HexStringToColor(COLORS[colorIdx].ink).color;
    this.instruction.setText('The symbol sticker is torn. Peel it off with the tweezers, wipe the sticky residue, then press a fresh sticker of the same symbol in the same spot.');

    const spot = this.faceXY(21, 13.5);
    this.sticker = this.add.image(spot.x, spot.y, `sym-${symbol}`);
    this.sticker.setDisplaySize(30 * SCALE * 0.42, 30 * SCALE * 0.42);
    this.sticker.setTint(inkHex).setAngle(-3);

    // torn/cracked marks over the sticker
    this.crack = this.add.graphics();
    this.crack.lineStyle(2.2, 0x34261c, 0.85);
    this.crack.beginPath();
    this.crack.moveTo(spot.x - 10, spot.y - 9);
    this.crack.lineTo(spot.x - 2, spot.y + 1);
    this.crack.lineTo(spot.x - 7, spot.y + 8);
    this.crack.lineTo(spot.x + 2, spot.y + 11);
    this.crack.strokePath();
    this.crack.beginPath();
    this.crack.moveTo(spot.x + 9, spot.y - 10);
    this.crack.lineTo(spot.x + 5, spot.y);
    this.crack.lineTo(spot.x + 10, spot.y + 7);
    this.crack.strokePath();
    // torn gap
    this.crack.fillStyle(0xf6efdd, 1);
    this.crack.fillTriangle(spot.x + 4, spot.y + 8, spot.x + 13, spot.y + 5, spot.x + 9, spot.y + 13);

    // residue (revealed after peel)
    this.residue = this.add.graphics().setVisible(false);

    // fresh sticker on the tray
    const trayX = this.cx + FACE_W / 2 + 80;
    this.newSticker = this.add.image(trayX, this.cy - 40, `sym-${symbol}`);
    this.newSticker.setDisplaySize(30 * SCALE * 0.42, 30 * SCALE * 0.42).setTint(inkHex).setAlpha(0);
    this.add.text(trayX, this.cy - 8, 'fresh sticker', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#cdbfa5',
    }).setOrigin(0.5).setAlpha(0);

    this.pressGfx = this.add.graphics();
  }

  private updateSticker(p: Phaser.Input.Pointer): void {
    this.tool.setVisible(true).setPosition(p.x, p.y);
    const spot = this.faceXY(21, 13.5);

    if (this.phase === 'peel') {
      if (this.pointerDown) {
        const near = Math.hypot(p.x - spot.x, p.y - spot.y) < 34;
        if (near && this.peelDragStart === null) {
          this.peelDragStart = { x: p.x, y: p.y };
          audio.play('peel');
        }
        if (this.peelDragStart) {
          this.peelDist = Math.hypot(p.x - this.peelDragStart.x, p.y - this.peelDragStart.y);
          this.sticker.setPosition(p.x, p.y).setAngle(Phaser.Math.FloatBetween(-16, 16));
          if (this.peelDist > 46) {
            // detached
            this.tweens.add({ targets: this.sticker, alpha: 0.15, x: this.cx - FACE_W / 2 - 60, y: this.cy + 120, duration: 380, ease: 'cubic.easeout' });
            this.crack.setVisible(false);
            this.residue.setVisible(true);
            this.residue.fillStyle(0xcdbfa5, 0.5);
            this.residue.fillEllipse(spot.x, spot.y + 4, 46, 26);
            this.phase = 'wipe';
            this.instruction.setText('Now wipe the adhesive residue with the cloth — press and rub over the smudge.');
          }
        }
      } else {
        this.peelDragStart = null;
      }
    } else if (this.phase === 'wipe') {
      if (this.pointerDown) {
        const near = Math.hypot(p.x - spot.x, p.y - spot.y) < 60;
        if (near) {
          if (this.lastTrail) {
            const d = Math.hypot(p.x - this.lastTrail.x, p.y - this.lastTrail.y);
            this.wipeDist += d;
            this.residue.setAlpha(Math.max(0, 1 - this.wipeDist / 240));
            if (this.wipeDist > 240) {
              this.residue.setVisible(false);
              this.phase = 'place';
              this.tweens.add({ targets: this.newSticker, alpha: 1, duration: 260 });
              this.instruction.setText('Drag the fresh sticker onto the label where the old one sat, then press and hold to seat it.');
            }
          }
          this.lastTrail = { x: p.x, y: p.y };
          if (this.time.now - this.lastRubSound > 180) {
            this.lastRubSound = this.time.now;
            audio.play('wipe');
          }
        } else {
          this.lastTrail = null;
        }
      } else {
        this.lastTrail = null;
      }
    } else if (this.phase === 'place') {
      const nearNew = Math.hypot(p.x - this.newSticker.x, p.y - this.newSticker.y) < 40;
      if (this.pointerDown && nearNew) {
        this.draggingSticker = true;
      }
      if (this.draggingSticker) {
        this.newSticker.setPosition(p.x, p.y);
        if (!this.pointerDown) {
          this.draggingSticker = false;
          if (Math.hypot(p.x - spot.x, p.y - spot.y) < 30) {
            this.newSticker.setPosition(spot.x, spot.y).setAngle(-3);
            this.phase = 'press';
            this.instruction.setText('Press and hold for a moment to stick it down.');
          }
        }
      }
    } else if (this.phase === 'press') {
      const near = Math.hypot(p.x - spot.x, p.y - spot.y) < 40;
      if (this.pointerDown && near) {
        if (this.pressStart === 0) this.pressStart = this.time.now;
        const held = this.time.now - this.pressStart;
        this.pressGfx.clear();
        this.pressGfx.lineStyle(4, 0x9fe6a0, 0.9);
        this.pressGfx.beginPath();
        this.pressGfx.arc(spot.x, spot.y, 26, -Math.PI / 2, -Math.PI / 2 + (held / 600) * Math.PI * 2);
        this.pressGfx.strokePath();
        if (held >= 600) {
          this.pressGfx.clear();
          audio.play('press');
          this.finishRepair();
        }
      } else {
        this.pressStart = 0;
        this.pressGfx.clear();
      }
    }
  }

  // =================================================================== PAINT
  private setupPaint(): void {
    this.instruction.setText('The shell corner got bleached. Rub the marker over the faded patch — press and rub until the original color shows through. The label stays untouched.');

    // faded patch as a render texture we erase under the marker strokes
    const px = this.cx - FACE_W / 2 + PATCH_X;
    const py = this.cy - FACE_H / 2 + PATCH_Y;
    this.rt = this.add.renderTexture(px, py, Math.ceil(PATCH_W), Math.ceil(PATCH_H));
    this.rt.setOrigin(0, 0);
    // draw the faded look: white translucent blob on top of the face copy
    const blob = this.add.graphics();
    blob.fillStyle(0xffffff, 0.34);
    blob.fillEllipse(PATCH_W / 2, PATCH_H / 2 + 4, PATCH_W * 0.94, PATCH_H * 0.8);
    blob.fillStyle(0xffffff, 0.16);
    blob.fillEllipse(PATCH_W * 0.36, PATCH_H * 0.4, PATCH_W * 0.4, PATCH_H * 0.34);
    this.rt.draw(blob);
    blob.destroy();
    this.trail = this.add.graphics().setDepth(200);
  }

  private updatePaint(p: Phaser.Input.Pointer): void {
    this.tool.setVisible(true).setPosition(p.x, p.y);
    const px = this.cx - FACE_W / 2 + PATCH_X;
    const py = this.cy - FACE_H / 2 + PATCH_Y;
    const inPatch = p.x >= px - 24 && p.x <= px + PATCH_W + 24 && p.y >= py - 20 && p.y <= py + PATCH_H + 20;
    if (this.pointerDown && inPatch) {
      // erase the fade under the stroke (original color revealed)
      const lx = Phaser.Math.Clamp(p.x - px, 0, PATCH_W);
      const ly = Phaser.Math.Clamp(p.y - py, 0, PATCH_H);
      this.rt.erase('dot', lx - 16, ly - 16);
      // coverage grid
      const gx = Math.floor(lx / (PATCH_W / 5));
      const gy = Math.floor(ly / (PATCH_H / 3));
      this.coverage.add(`${gx},${gy}`);
      // colored trail (reveal feedback) in absolute screen space
      if (this.lastTrail) {
        const colorIdx = Math.floor(this.combo / SYMBOLS.length);
        const tint = Phaser.Display.Color.HexStringToColor(COLORS[colorIdx].css).color;
        this.trail.lineStyle(7, tint, 0.5);
        this.trail.lineBetween(this.lastTrail.x + px, this.lastTrail.y + py, lx + px, ly + py);
        this.rubDist += Math.hypot(lx - this.lastTrail.x, ly - this.lastTrail.y);
        if (this.time.now - this.lastRubSound > 190 && this.rubDist > 24) {
          this.lastRubSound = this.time.now;
          audio.play('rub-tick');
        }
      }
      this.lastTrail = { x: lx, y: ly };
      // completion: most of the patch rubbed over (5x3 grid, >= 13 cells)
      if (this.coverage.size >= 13 && this.rubDist > 120) this.finishRepair();
    } else {
      this.lastTrail = null;
    }
  }

  // =============================================================== completion
  private finishRepair(): void {
    if (this.done) return;
    this.done = true;
    this.success = true;
    this.instruction.setText('There — good as new.');
    audio.play('chime');
    // restrained sparkle: three small dots
    const spot = this.kind === 'sticker' ? this.faceXY(21, 13.5)
      : this.kind === 'paint' ? { x: this.cx - FACE_W / 2 + PATCH_X + PATCH_W / 2, y: this.cy - FACE_H / 2 + PATCH_Y + PATCH_H / 2 }
      : this.faceXY(58, 38);
    for (let i = 0; i < 3; i++) {
      const s = this.add.image(spot.x, spot.y, 'dot').setDisplaySize(12, 12).setTint(0xffe9a8).setAlpha(0.9);
      this.tweens.add({
        targets: s, y: spot.y - 26 - i * 8, alpha: 0, duration: 700, delay: i * 120, ease: 'sine.easeout',
        onComplete: () => s.destroy(),
      });
    }
    this.time.delayedCall(850, () => this.close(true));
  }

  private close(success: boolean): void {
    this.game.events.emit('repair:closed', { id: this.tapeId, success });
    this.scene.resume('Game');
    this.scene.stop('Repair');
  }

  // ------------------------------------------------------------------ input
  private onMove(p: Phaser.Input.Pointer): void {
    if (this.done) return;
    if (this.kind === 'rewind') this.updateRewind(p);
    else if (this.kind === 'sticker') this.updateSticker(p);
    else this.updatePaint(p);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.done) return;
    if (this.kind === 'rewind') this.updateRewind(p);
    else if (this.kind === 'sticker') this.updateSticker(p);
    else this.updatePaint(p);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    this.lastPointerAngle = null;
    this.lastTrail = null;
    if (this.kind === 'sticker') {
      this.peelDragStart = null;
      if (this.phase === 'place' && this.draggingSticker) {
        const spot = this.faceXY(21, 13.5);
        this.draggingSticker = false;
        if (Math.hypot(p.x - spot.x, p.y - spot.y) < 30) {
          this.newSticker.setPosition(spot.x, spot.y).setAngle(-3);
          this.phase = 'press';
          this.instruction.setText('Press and hold for a moment to stick it down.');
        }
      }
    }
  }
}
