import Phaser from 'phaser';
import {
  BENCH, COLORS, ROWS_PER_UNIT, SKILL_THRESHOLDS, SPINE_H, SPINE_W, SYMBOLS, UNITS,
  WORLD_H, WORLD_W, ZOOM_MAX, ZOOM_MIN, benchRect, rowRect, slotPos, trayScreenRect,
  unitOfRow, unitPos, unitRect, groupOfRow, rowsOfGroup, ROW_CH_TOP, ROW_PITCH, ROW_CH_H,
  UNIT_W, UNIT_H,
} from '../config';
import { defectBlocksFiling } from '../types';
import type { Row, Tape, WorldData, SkillId } from '../types';
import { generateWorld } from '../worldgen';
import { boardCorrect, validateWorld } from '../validation';
import { audio } from '../audio';
import { DragController } from '../controllers/DragController';
import { SkillsController, type PowerId } from '../controllers/SkillsController';
import { randomSeed } from '../rng';
import { applySave, loadRun, saveRun, serializeRun, storageAvailable } from '../save';

export interface TapeView {
  id: number;
  container: Phaser.GameObjects.Container;
  face: Phaser.GameObjects.Image;
  spine: Phaser.GameObjects.Image;
  overlay: Phaser.GameObjects.Image | null; // defect marks
}

export interface UnitView {
  unit: number;
  body: Phaser.GameObjects.Image;
  lips: Phaser.GameObjects.Image;
  chips: Phaser.GameObjects.Image[];
  counts: Phaser.GameObjects.Text[];
  verify: Phaser.GameObjects.Text;
}

const PAN_SPEED = 700;

export class GameScene extends Phaser.Scene {
  world!: WorldData;
  tapeViews = new Map<number, TapeView>();
  unitViews = new Map<number, UnitView>();
  trayTapes: (number | null)[] = [null, null, null, null, null];
  drag!: DragController;
  skills!: SkillsController;
  sortedCount = 0;
  seed = 0;
  playSeconds = 0;
  storageOk = storageAvailable();
  /** carried-over skill unlocks when migrating from a v1 save */
  carriedSkills: Record<SkillId, boolean> | null = null;
  pendingSave: ReturnType<typeof loadRun> = null;
  private override: { seed?: number; fresh?: boolean; carry?: boolean } | null = null;
  private saveTimer = 0;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private storageWarned = false;
  private completionShownFlag = false;
  private notDoneShown = false;
  private uiBlocked = false;

  constructor() {
    super({ key: 'Game' });
  }

  init(data: { seed?: number; fresh?: boolean; carry?: boolean }): void {
    this.override = data ?? null;
    // scene.restart() reuses the instance: reset mutable session state
    this.tapeViews = new Map();
    this.unitViews = new Map();
    this.trayTapes = [null, null, null, null, null];
    this.sortedCount = 0;
    this.playSeconds = 0;
    this.completionShownFlag = false;
    this.notDoneShown = false;
    this.saveTimer = 0;
    this.carriedSkills = null;
    this.pendingSave = null;
    this.uiBlocked = false;
  }

  create(): void {
    this.seed = this.readSeedParam();
    this.world = generateWorld(this.seed);
    const validation = validateWorld(this.world);
    if (!validation.ok) {
      console.warn('world validation issues:', validation.issues.slice(0, 4));
    }
    if (this.pendingSave) applySave(this.world, this.pendingSave);

    this.buildWorldVisuals();
    this.drag = new DragController(this);
    this.skills = new SkillsController(this);
    this.drag.skills = this.skills;
    if (this.pendingSave) {
      this.skills.unlocked = { ...this.pendingSave.skills } as Record<SkillId, boolean>;
      for (const [k, v] of Object.entries(this.pendingSave.powers)) {
        const pw = this.skills.powers[k as PowerId];
        if (pw) {
          pw.unlocked = v.unlocked;
          pw.cooldownUntil = Math.max(0, v.cooldownUntil - Date.now());
          pw.activeUntil = 0;
        }
      }
      this.playSeconds = this.pendingSave.playSeconds ?? 0;
      const tray = this.pendingSave.tray;
      if (Array.isArray(tray)) {
        this.trayTapes = tray.slice(0, 5).map(v => (typeof v === 'number' ? v : null));
        while (this.trayTapes.length < 5) this.trayTapes.push(null);
        for (const id of this.trayTapes) if (id !== null) this.stowInTrayView(id);
      }
      this.pendingSave = null;
    } else if (this.carriedSkills) {
      this.skills.unlocked = { ...this.carriedSkills };
      this.skills.syncPowerUnlocks();
    }

    this.setupCamera();
    this.setupInput();
    this.setupSaveHooks();

    this.game.events.emit('tray:changed');
    this.game.events.emit('game:ready');
    this.emitCounters();
  }

  // ------------------------------------------------------------- world visuals
  private buildWorldVisuals(): void {
    const table = this.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'wood');
    table.setOrigin(0, 0).setDepth(0);

    // warm table edge with a front-face band (south) + darker side bands
    const edges = this.add.graphics().setDepth(1);
    edges.fillStyle(0x2e1c12, 0.55);
    edges.fillRect(0, WORLD_H - 34, WORLD_W, 34);   // front face band
    edges.fillStyle(0x4a2c1a, 0.85);
    edges.fillRect(0, WORLD_H - 12, WORLD_W, 12);   // front face lower lip
    edges.fillStyle(0x2e1c12, 0.35);
    edges.fillRect(0, 0, WORLD_W, 18);
    edges.fillRect(0, 0, 18, WORLD_H);
    edges.fillRect(WORLD_W - 18, 0, 18, WORLD_H);
    edges.fillStyle(0xffebc8, 0.08);
    edges.fillRect(0, WORLD_H - 34, WORLD_W, 3);    // light catching the front edge

    const bench = this.add.image(BENCH.x + BENCH.w / 2, BENCH.y + BENCH.h / 2, 'bench');
    bench.setDisplaySize(BENCH.w, BENCH.h).setDepth(2);
    this.add.text(BENCH.x + BENCH.w / 2, BENCH.y + 26, 'REPAIR BENCH', {
      fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '19px',
      color: '#5b3b26', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(2).setAlpha(0.85);

    // props (decorative dressing on the busy bench)
    this.add.image(214, 96, 'prop-lamp').setDepth(3).setScale(0.8);
    this.add.image(2688, 250, 'prop-radio').setDepth(3).setScale(0.9);
    this.add.image(2540, 1660, 'prop-plant').setDepth(3).setScale(0.85);
    this.add.image(560, 1650, 'prop-books').setDepth(3).setScale(0.9);

    // rack units (layered: body < chips/counts < seated spines < lips)
    for (let u = 0; u < UNITS; u++) {
      const p = unitPos(u);
      const body = this.add.image(p.x + UNIT_W / 2, p.y + UNIT_H / 2, 'unit-body');
      body.setDisplaySize(UNIT_W, UNIT_H).setDepth(p.y);
      const lips = this.add.image(p.x + UNIT_W / 2, p.y + UNIT_H / 2, 'unit-lips');
      lips.setDisplaySize(UNIT_W, UNIT_H).setDepth(p.y + 2);
      const chips: Phaser.GameObjects.Image[] = [];
      const counts: Phaser.GameObjects.Text[] = [];
      for (let lr = 0; lr < ROWS_PER_UNIT; lr++) {
        const row = u * ROWS_PER_UNIT + lr;
        const group = groupOfRow(row);
        const cy = p.y + ROW_CH_TOP + lr * ROW_PITCH + ROW_CH_H / 2;
        const chip = this.add.image(p.x + 24, cy, `chip-${group}`);
        chip.setDisplaySize(28, 28).setDepth(p.y + 0.4);
        chips.push(chip);
        const count = this.add.text(p.x + UNIT_W - 10, cy - 7, '0/8', {
          fontFamily: 'Georgia, serif', fontSize: '12px', color: '#f6efdd',
        }).setOrigin(1, 0).setDepth(p.y + 0.5);
        counts.push(count);
      }
      const verify = this.add.text(p.x + UNIT_W - 34, p.y + 16, '✓?', {
        fontFamily: 'Georgia, serif', fontSize: '14px', fontStyle: 'bold', color: '#ffe9a8',
        backgroundColor: '#5a3520', padding: { x: 6, y: 2 },
      }).setOrigin(0.5).setDepth(p.y + 0.5).setInteractive({ useHandCursor: true });
      verify.on('pointerdown', () => { audio.unlock(); this.verifyUnit(u); });
      this.unitViews.set(u, { unit: u, body, lips, chips, counts, verify });
    }

    // tapes
    for (const tape of this.world.tapes) {
      if (tape.state === 'shelved') {
        this.spawnShelvedTape(tape);
      } else if (tape.state === 'tray') {
        this.spawnLooseTape(tape);
        this.stowInTrayView(tape.id);
      } else {
        this.spawnLooseTape(tape);
      }
    }
    this.sortedCount = this.world.tapes.filter(t => t.state === 'shelved').length;
  }

  spawnLooseTape(tape: Tape): TapeView {
    const face = this.add.image(0, 0, `tape-face-${tape.combo}`);
    face.setDisplaySize(104, 72);
    const spine = this.add.image(0, 0, `spine-${tape.combo}`);
    spine.setDisplaySize(SPINE_W, SPINE_H).setVisible(false);
    const container = this.add.container(tape.x, tape.y, [face, spine]);
    container.setRotation(tape.rot);
    const view: TapeView = { id: tape.id, container, face, spine, overlay: null };
    if (tape.defect && !tape.repaired) {
      const ov = this.add.image(0, 0, `defect-${tape.defect}`);
      ov.setDisplaySize(92, 60);
      container.add(ov);
      view.overlay = ov;
    }
    container.setSize(92, 60);
    container.setInteractive(new Phaser.Geom.Rectangle(-46, -30, 92, 60), Phaser.Geom.Rectangle.Contains);
    container.setData('tapeId', tape.id);
    container.setDepth(tape.y);
    this.tapeViews.set(tape.id, view);
    return view;
  }

  spawnShelvedTape(tape: Tape): TapeView {
    const spine = this.add.image(0, 0, `spine-${tape.combo}`);
    spine.setDisplaySize(SPINE_W, SPINE_H);
    const face = this.add.image(0, 0, `tape-face-${tape.combo}`);
    face.setDisplaySize(104, 72).setVisible(false);
    const container = this.add.container(0, 0, [face, spine]);
    container.setSize(SPINE_W, SPINE_H); // thin hit strip on the seated spine
    container.setInteractive(new Phaser.Geom.Rectangle(-SPINE_W / 2, -SPINE_H / 2, SPINE_W, SPINE_H), Phaser.Geom.Rectangle.Contains);
    container.setData('tapeId', tape.id);
    const p = slotPos(tape.row as number, tape.slot as number);
    const u = unitOfRow(tape.row as number);
    const lr = (tape.row as number) % ROWS_PER_UNIT;
    container.setPosition(p.x, p.y).setDepth(unitPos(u).y + 1 + lr * 0.02);
    const view: TapeView = { id: tape.id, container, face, spine, overlay: null };
    this.tapeViews.set(tape.id, view);
    const row = this.world.rows[tape.row as number];
    row.slots[tape.slot as number] = tape.id;
    this.updateRowCount(tape.row as number);
    return view;
  }

  /** hide the world view of a tape that lives in the tray */
  stowInTrayView(id: number): void {
    const view = this.tapeViews.get(id);
    if (view) {
      view.container.setVisible(false);
      view.container.disableInteractive();
    }
    this.game.events.emit('tray:changed');
  }

  restoreFromTrayView(id: number): void {
    const view = this.tapeViews.get(id);
    if (view) {
      view.container.setVisible(true);
      view.container.setInteractive(new Phaser.Geom.Rectangle(-46, -30, 92, 60), Phaser.Geom.Rectangle.Contains);
    }
    this.game.events.emit('tray:changed');
  }

  // ------------------------------------------------------------------- tray
  trayFreeSlots(): number {
    return this.trayTapes.filter(s => s === null).length;
  }

  trayLoad(id: number): number {
    const slot = this.trayTapes.indexOf(null);
    if (slot < 0) return -1;
    const t = this.tapeData(id);
    if (!t) return -1;
    this.trayTapes[slot] = id;
    t.state = 'tray';
    t.row = null; t.slot = null;
    this.stowInTrayView(id);
    return slot;
  }

  trayRemoveAt(slot: number): number | null {
    const id = this.trayTapes[slot];
    if (id === null) return null;
    this.trayTapes[slot] = null;
    this.restoreFromTrayView(id);
    return id;
  }

  trayRemoveTape(id: number): boolean {
    const slot = this.trayTapes.indexOf(id);
    if (slot < 0) return false;
    this.trayRemoveAt(slot);
    return true;
  }

  trayIds(): number[] {
    return this.trayTapes.filter((v): v is number => v !== null);
  }

  // ------------------------------------------------------------------ camera
  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setBackgroundColor('#2a1a10');
    // first impression: the back bank of organizers + the busy center together
    cam.setZoom(0.72);
    cam.centerOn(1420, 770);
    const kb = this.input.keyboard as Phaser.Input.Keyboard.KeyboardPlugin;
    this.keys = kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,PLUS,MINUS,Q,E,SPACE,ESC,F') as Record<string, Phaser.Input.Keyboard.Key>;
  }

  panCamera(dx: number, dy: number): void {
    const cam = this.cameras.main;
    cam.scrollX += dx / cam.zoom;
    cam.scrollY += dy / cam.zoom;
  }

  zoomBy(delta: number): void {
    const cam = this.cameras.main;
    this.zoomAt(this.scale.width / 2, this.scale.height / 2, cam.zoom + delta);
  }

  /** zoom anchored on a screen point (cursor), then clamped by world bounds */
  zoomAt(screenX: number, screenY: number, targetZoom: number): void {
    const cam = this.cameras.main;
    const z = Phaser.Math.Clamp(targetZoom, ZOOM_MIN, ZOOM_MAX);
    if (z === cam.zoom) return;
    // pure math (getWorldPoint reads cached matrices around setZoom, which
    // silently cancels the anchor correction)
    const wx = cam.scrollX + screenX / cam.zoom;
    const wy = cam.scrollY + screenY / cam.zoom;
    cam.setZoom(z);
    cam.scrollX = wx - screenX / z;
    cam.scrollY = wy - screenY / z;
    this.game.events.emit('camera:zoom', z);
  }

  fitToTable(): void {
    const cam = this.cameras.main;
    const z = Phaser.Math.Clamp(
      Math.min(this.scale.width / WORLD_W, this.scale.height / WORLD_H),
      ZOOM_MIN, ZOOM_MAX,
    );
    cam.setZoom(z);
    cam.centerOn(WORLD_W / 2, WORLD_H / 2);
    this.game.events.emit('camera:zoom', z);
  }

  // ------------------------------------------------------------------- input
  private setupInput(): void {
    this.input.mouse?.disableContextMenu();
    this.input.addPointer(3); // multi-touch

    // wheel = zoom, centered on the cursor (v2; pan stays on keys/drag/touch)
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      audio.unlock();
      const d = Phaser.Math.Clamp(dy, -180, 180);
      this.zoomAt(_p.x, _p.y, this.cameras.main.zoom * Math.pow(0.9985, d));
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      audio.unlock();
      if (this.uiBlocked || this.pointerOverUI(pointer)) return;
      this.drag.onPointerDown(pointer);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.drag.onPointerMove(pointer);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      this.drag.onPointerUp(pointer);
    });

    const kb2 = this.input.keyboard as Phaser.Input.Keyboard.KeyboardPlugin;
    kb2.on('keydown-ESC', () => this.drag.cancel());
    kb2.on('keydown-D', () => this.skills.toggleScanner());
    kb2.on('keydown-M', () => this.skills.tryActivatePower('misplaced'));
    kb2.on('keydown-S', () => this.skills.tryActivatePower('matchScan'));
    kb2.on('keydown-G', () => this.skills.tryActivatePower('matchGather'));
    kb2.on('keydown-F', () => this.fitToTable());
    kb2.on('keydown', () => audio.unlock());

    this.game.events.on('repair:closed', this.onRepairClosed, this);
    this.game.events.on('ui:block', (v: boolean) => { this.uiBlocked = v; });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('repair:closed', this.onRepairClosed, this);
      this.game.events.off('ui:block');
    });
  }

  /** screen-space UI regions the game scene must not treat as table input */
  pointerOverUI(pointer: Phaser.Input.Pointer): boolean {
    const W = this.scale.width;
    const H = this.scale.height;
    if (pointer.y < 58) return true; // top bar
    const tray = trayScreenRect(W, H);
    if (pointer.x >= tray.x - 6 && pointer.x <= tray.x + tray.w + 6
      && pointer.y >= tray.y - 6 && pointer.y <= tray.y + tray.h + 6) return true;
    if (pointer.y > H - 100 && pointer.x < 880) return true; // skill chips bar
    return false;
  }

  private onRepairClosed(data: { id: number; success: boolean }): void {
    this.skills.onRepairClosed(data.id, data.success);
    this.emitCounters();
  }

  // ------------------------------------------------------------- session flow
  newGame(seed?: number, carrySkills = false): void {
    const useSeed = seed ?? randomSeed();
    if (carrySkills) {
      const keep: Record<string, boolean> = { ...this.skills.unlocked };
      this.scene.restart({ seed: useSeed, fresh: true, carry: true, skills: keep });
    } else {
      this.scene.restart({ seed: useSeed, fresh: true });
    }
  }

  private readSeedParam(): number {
    const p = new URLSearchParams(window.location.search);
    if (this.override?.seed !== undefined) return this.override.seed >>> 0;
    if (this.override?.fresh) {
      if (this.override.carry && (this.override as { skills?: Record<string, boolean> }).skills) {
        this.carriedSkills = (this.override as { skills?: Record<SkillId, boolean> }).skills ?? null;
      }
      return randomSeed();
    }
    if (p.has('seed')) {
      const s = Number.parseInt(p.get('seed') as string, 10);
      if (Number.isFinite(s)) return s >>> 0;
    }
    // v1 save present? offer migration instead of silently dropping progress
    if (!p.has('autotest')) {
      try {
        const raw1 = localStorage.getItem('tidy-tapes-save-v1');
        if (raw1) {
          // flag only: the UI scene shows the choice panel when it becomes ready
          this.game.registry.set('v1SaveFound', true);
        }
      } catch { /* ignore */ }
    }
    // restore saved v2 run when present (autotest phase 2 uses ?restore=1)
    if ((!p.has('autotest') || p.has('restore')) && this.storageOk) {
      const save = loadRun();
      if (save) {
        this.pendingSave = save;
        return save.seed;
      }
    }
    return 20261118;
  }

  save(): void {
    if (!this.storageOk) {
      if (!this.storageWarned) {
        this.storageWarned = true;
        this.game.events.emit('toast', 'Saving unavailable in this browser — progress is session-only.');
      }
      return;
    }
    try {
      const file = serializeRun(this.world, this.skills.unlocked, this.skills.powersSave(), this.playSeconds, this.trayTapes);
      saveRun(file);
    } catch { /* ignore */ }
    this.game.events.emit('save:flash');
  }

  private setupSaveHooks(): void {
    window.addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('beforeunload', () => this.save());
      document.removeEventListener('visibilitychange', () => this.save());
    });
  }

  // ------------------------------------------------------------------ helpers
  tapeAt(id: number): TapeView | undefined { return this.tapeViews.get(id); }

  tapeData(id: number): Tape | undefined { return this.world.tapes.find(t => t.id === id); }

  /** row under a world point (any row, matching or not — hidden correctness). */
  rowUnder(x: number, y: number): Row | null {
    for (const row of this.world.rows) {
      const r = rowRect(row.id);
      if (x >= r.x - 8 && x <= r.x + r.w + 8 && y >= r.y - 10 && y <= r.y + r.h + 10) return row;
    }
    return null;
  }

  unitUnder(x: number, y: number): number | null {
    for (let u = 0; u < UNITS; u++) {
      const r = unitRect(u);
      if (x >= r.x - 8 && x <= r.x + r.w + 8 && y >= r.y - 8 && y <= r.y + r.h + 14) return u;
    }
    return null;
  }

  benchUnder(x: number, y: number): boolean {
    const b = benchRect();
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  updateRowCount(rowId: number): void {
    const row = this.world.rows[rowId];
    const used = row.slots.filter(s => s !== null).length;
    const u = unitOfRow(rowId);
    const view = this.unitViews.get(u);
    if (view) view.counts[rowId % ROWS_PER_UNIT].setText(`${used}/8`);
  }

  comboLabel(combo: number): string {
    const c = COLORS[Math.floor(combo / SYMBOLS.length)];
    const s = SYMBOLS[combo % SYMBOLS.length];
    return `${c.name} ${s}`;
  }

  emitCounters(): void {
    const loose = this.world.tapes.filter(t => t.state === 'loose').length;
    const tray = this.world.tapes.filter(t => t.state === 'tray').length;
    const repairs = this.world.tapes.filter(t => t.defect && !t.repaired
      && (t.defect === 'rewind' || t.defect === 'sticker')).length;
    this.game.events.emit('counters', {
      shelved: this.sortedCount,
      total: this.world.totalTapes,
      loose,
      tray,
      repairs,
      thresholds: SKILL_THRESHOLDS,
    });
  }

  // ---------------------------------------------------- verify + win checking
  verifyUnit(u: number): void {
    let wrong = 0;
    let seated = 0;
    for (let lr = 0; lr < ROWS_PER_UNIT; lr++) {
      const row = this.world.rows[u * ROWS_PER_UNIT + lr];
      for (const id of row.slots) {
        if (id === null) continue;
        seated++;
        const t = this.tapeData(id);
        if (!t || t.combo !== row.group) wrong++;
      }
    }
    if (seated === 0) {
      this.game.events.emit('toast', 'Nothing to check yet — this organizer is empty.');
      return;
    }
    if (wrong === 0) {
      audio.play('chime'); // Tiny Chime: explicit player-verified confirmation
      this.game.events.emit('toast', 'Verified — every tape in this organizer matches its rows.');
    } else {
      audio.play('thud');
      this.game.events.emit('toast', 'Not quite — a tape in this organizer is in the wrong row.');
    }
  }

  get completionShown(): boolean {
    return this.completionShownFlag;
  }

  checkCompletion(): void {
    if (this.completionShownFlag) return;
    const allSeated = this.world.tapes.every(t => t.state === 'shelved');
    if (!allSeated) { this.notDoneShown = false; return; }
    if (boardCorrect(this.world)) {
      this.completionShownFlag = true;
      audio.play('chime');            // verified end-of-job milestone
      audio.play('complete', { delay: 0.35 });
      this.game.events.emit('complete', {
        seed: this.seed,
        playSeconds: this.playSeconds,
        repairs: this.world.tapes.filter(t => t.defect).length,
      });
      this.save();
    } else if (!this.notDoneShown) {
      // general message only: no location, no count, no sound difference
      this.notDoneShown = true;
      this.game.events.emit('toast', 'Every tape is shelved… but the job isn\'t done. Something sits in a wrong row — check organizers with ✓, or use the Misfile Finder.');
    }
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.playSeconds += dt;

    // keyboard camera panning (works while holding tapes)
    let vx = 0, vy = 0;
    if (this.keys.A?.isDown || this.keys.LEFT?.isDown) vx -= 1;
    if (this.keys.D?.isDown || this.keys.RIGHT?.isDown) vx += 1;
    if (this.keys.W?.isDown || this.keys.UP?.isDown) vy -= 1;
    if (this.keys.S?.isDown || this.keys.DOWN?.isDown) vy += 1;
    if (vx !== 0 || vy !== 0) {
      this.panCamera(vx * PAN_SPEED * dt, vy * PAN_SPEED * dt);
    }
    if (this.keys.Q?.isDown) this.zoomBy(0.35 * dt);
    if (this.keys.E?.isDown) this.zoomBy(-0.35 * dt);
    if (this.keys.PLUS?.isDown) this.zoomBy(0.5 * dt);
    if (this.keys.MINUS?.isDown) this.zoomBy(-0.5 * dt);

    this.drag.update();
    this.skills.update();

    // autosave every 4s of play (debounced further on writes)
    this.saveTimer += dt;
    if (this.saveTimer > 4) {
      this.saveTimer = 0;
      if (this.drag.held === null && !this.drag.trayBatchDrag) this.save();
    }
  }

  // -------------------------------------------------------- debug/test helpers
  /** actually shelve loose tapes into CORRECT rows via the real data path */
  debugShelve(count: number, combo?: number): number {
    let shelved = 0;
    for (const t of this.world.tapes) {
      if (shelved >= count) break;
      if (t.state !== 'loose' || (t.defect && !t.repaired)) continue;
      if (combo !== undefined && t.combo !== combo) continue;
      let row: typeof this.world.rows[number] | null = null;
      let slot = -1;
      for (const rowId of rowsOfGroup(t.combo)) {
        const r = this.world.rows[rowId];
        const k = r.slots.findIndex(x => x === null);
        if (k >= 0) { row = r; slot = k; break; }
      }
      if (!row || slot < 0) continue;
      this.seatTape(t.id, row.id, slot, true);
      shelved++;
    }
    this.sortedCount = this.world.tapes.filter(t2 => t2.state === 'shelved').length;
    this.skills.onShelved(this.sortedCount);
    this.emitCounters();
    this.checkCompletion();
    return shelved;
  }

  /** data-path seating used by both the drag controller and the test helpers */
  seatTape(id: number, rowId: number, slot: number, instant = false): void {
    const t = this.tapeData(id);
    if (!t) return;
    const row = this.world.rows[rowId];
    const view = this.tapeViews.get(id);
    t.state = 'shelved';
    t.row = rowId;
    t.slot = slot;
    t.rot = 0;
    row.slots[slot] = id;
    this.sortedCount = this.world.tapes.filter(tt => tt.state === 'shelved').length;
    if (view) {
      view.face.setVisible(false);
      if (view.overlay) view.overlay.setVisible(false);
      view.spine.setVisible(true);
      const p = slotPos(rowId, slot);
      const u = unitOfRow(rowId);
      const lr = rowId % ROWS_PER_UNIT;
      if (instant) {
        view.container.setPosition(p.x, p.y).setRotation(0).setDepth(unitPos(u).y + 1 + lr * 0.02);
      }
    }
    this.updateRowCount(rowId);
  }

  /** unshelve (pull-out data path) */
  unseatTape(id: number): void {
    const t = this.tapeData(id);
    if (!t || t.state !== 'shelved') return;
    const row = this.world.rows[t.row as number];
    const slot = t.slot as number;
    if (row.slots[slot] === id) row.slots[slot] = null;
    t.state = 'loose';
    t.row = null; t.slot = null;
    this.updateRowCount(row.id);
    this.sortedCount = this.world.tapes.filter(tt => tt.state === 'shelved').length;
  }

  debugRepairAll(): number {
    let n = 0;
    for (const t of this.world.tapes) {
      if (t.defect && !t.repaired) {
        t.repaired = true;
        const view = this.tapeViews.get(t.id);
        if (view && view.overlay) view.overlay.setVisible(false);
        n++;
      }
    }
    this.emitCounters();
    return n;
  }

  debugSetTapePos(id: number, x: number, y: number): void {
    const t = this.world.tapes.find(tt => tt.id === id);
    const view = this.tapeViews.get(id);
    if (!t || !view || t.state !== 'loose' || this.drag.held?.tapes.some(v => v.id === id)) return;
    t.x = x; t.y = y; t.rot = 0;
    view.container.setPosition(x, y).setRotation(0).setDepth(y);
  }

  resizeForTest(w: number, h: number): void {
    this.game.scale.resize(w, h);
  }
}
