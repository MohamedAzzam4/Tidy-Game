import Phaser from 'phaser';
import {
  BENCH, COLORS, RACK_SLOTS, SKILL_THRESHOLDS, SPINE_W, SYMBOLS, WORLD_H, WORLD_W,
  ZOOM_MAX, ZOOM_MIN, benchRect, rackRect, slotPos,
} from '../config';
import type { Rack, SkillId, Tape, WorldData } from '../types';
import { generateWorld } from '../worldgen';
import { validateWorld } from '../validation';
import { audio } from '../audio';
import { DragController } from '../controllers/DragController';
import { SkillsController, type PowerId } from '../controllers/SkillsController';
import { randomSeed } from '../rng';
import { clearRun, applySave, loadRun, saveRun, serializeRun, storageAvailable } from '../save';

export interface TapeView {
  id: number;
  container: Phaser.GameObjects.Container;
  face: Phaser.GameObjects.Image;
  spine: Phaser.GameObjects.Image;
  overlay: Phaser.GameObjects.Image | null; // defect marks
}

export interface RackView {
  combo: number;
  img: Phaser.GameObjects.Image;
  countText: Phaser.GameObjects.Text;
  slots: (Phaser.GameObjects.Image | null)[]; // seated spine images
}

const PAN_SPEED = 700;

export class GameScene extends Phaser.Scene {
  world!: WorldData;
  tapeViews = new Map<number, TapeView>();
  rackViews = new Map<number, RackView>();
  drag!: DragController;
  skills!: SkillsController;
  sortedCount = 0;
  seed = 0;
  playSeconds = 0;
  storageOk = storageAvailable();
  private saveTimer = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastClickAt = 0;
  private lastClickTape = -1;
  private storageWarned = false;

  constructor() {
    super({ key: 'Game' });
    if (typeof window !== 'undefined' && window.location.search.includes('autotest')) {
      console.log(`[scene] GameScene constructed, storageOk=${this.storageOk}, ls=${typeof localStorage}`);
    }
  }

  pendingSave: ReturnType<typeof loadRun> = null;
  private override: { seed?: number; fresh?: boolean } | null = null;

  init(data: { seed?: number; fresh?: boolean }): void {
    this.override = data ?? null;
  }

  create(): void {
    this.seed = this.readSeedParam();
    this.world = generateWorld(this.seed);
    const validation = validateWorld(this.world);
    if (!validation.ok) {
      // generated worlds are validated by tests; guard anyway (trust boundary)
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
          pw.activeUntil = 0; // active window does not persist across reload
        }
      }
      this.playSeconds = this.pendingSave.playSeconds ?? 0;
      this.pendingSave = null;
    }

    this.setupCamera();
    this.setupInput();
    this.setupSaveHooks();

    this.game.events.emit('game:ready');
    this.emitCounters();
  }

  // ------------------------------------------------------------- world visuals
  private buildWorldVisuals(): void {
    const table = this.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'wood');
    table.setOrigin(0, 0).setDepth(0);

    // warm room edge
    const edges = this.add.graphics().setDepth(1);
    edges.fillStyle(0x2e1c12, 0.25);
    edges.fillRect(0, 0, WORLD_W, 26);
    edges.fillRect(0, WORLD_H - 26, WORLD_W, 26);
    edges.fillRect(0, 0, 26, WORLD_H);
    edges.fillRect(WORLD_W - 26, 0, 26, WORLD_H);

    const bench = this.add.image(BENCH.x + BENCH.w / 2, BENCH.y + BENCH.h / 2, 'bench');
    bench.setScale(0.5).setDepth(2);
    this.add.text(BENCH.x + BENCH.w / 2, BENCH.y + 44, 'REPAIR BENCH', {
      fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '22px',
      color: '#5b3b26', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(2).setAlpha(0.85);

    // props (decorative, corners away from play zones)
    this.add.image(190, 130, 'prop-lamp').setDepth(3).setScale(0.9);
    this.add.image(4180, 2960, 'prop-radio').setDepth(3).setScale(0.9).setFlipX(true);
    this.add.image(4230, 210, 'prop-plant').setDepth(3).setScale(0.85);
    this.add.image(600, 1210, 'prop-books').setDepth(3).setScale(0.9);

    // racks
    for (const rack of this.world.racks) {
      const r = rackRect(rack.combo);
      const img = this.add.image(r.x + r.w / 2, r.y + r.h / 2, `rack-${rack.combo}`);
      img.setScale(0.5).setDepth(4);
      const countText = this.add.text(r.x + r.w - 8, r.y + 10, '0/8', {
        fontFamily: 'Georgia, serif', fontSize: '13px', color: '#f6efdd',
      }).setOrigin(1, 0).setDepth(4.2);
      const view: RackView = { combo: rack.combo, img, countText, slots: new Array(RACK_SLOTS).fill(null) };
      this.rackViews.set(rack.combo, view);
    }

    // tapes
    for (const tape of this.world.tapes) {
      if (tape.state === 'shelved') {
        this.spawnShelvedTape(tape);
      } else {
        this.spawnLooseTape(tape);
      }
    }
    this.sortedCount = this.world.tapes.filter(t => t.state === 'shelved').length;
  }

  spawnLooseTape(tape: Tape): TapeView {
    const face = this.add.image(0, 0, `tape-face-${tape.combo}`);
    face.setDisplaySize(92, 60);
    const spine = this.add.image(0, 0, `spine-${tape.combo}`);
    spine.setDisplaySize(SPINE_W, 60).setVisible(false);
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
    spine.setDisplaySize(SPINE_W, 60);
    const face = this.add.image(0, 0, `tape-face-${tape.combo}`);
    face.setDisplaySize(92, 60).setVisible(false);
    const container = this.add.container(0, 0, [face, spine]);
    const p = slotPos(tape.combo, tape.slot as number);
    container.setPosition(p.x, p.y).setDepth(4.5);
    const view: TapeView = { id: tape.id, container, face, spine, overlay: null };
    this.tapeViews.set(tape.id, view);
    const rack = this.world.racks[tape.combo];
    rack.slots[tape.slot as number] = tape.id;
    (this.rackViews.get(tape.combo) as RackView).slots[tape.slot as number] = spine;
    this.updateRackCount(tape.combo);
    return view;
  }

  updateRackCount(combo: number): void {
    const rack = this.world.racks[combo];
    const used = rack.slots.filter(s => s !== null).length;
    const view = this.rackViews.get(combo);
    if (view) view.countText.setText(`${used}/${RACK_SLOTS}`);
  }

  // ------------------------------------------------------------------ camera
  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setBackgroundColor('#3a2314');
    // start looking at a cozy corner (top-left near the bench)
    cam.centerOn(640, 420);
    const kb = this.input.keyboard as Phaser.Input.Keyboard.KeyboardPlugin;
    this.keys = kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,PLUS,MINUS,Q,E,ESC') as Record<string, Phaser.Input.Keyboard.Key>;
  }

  panCamera(dx: number, dy: number): void {
    const cam = this.cameras.main;
    cam.scrollX += dx / cam.zoom;
    cam.scrollY += dy / cam.zoom;
  }

  zoomBy(delta: number): void {
    const cam = this.cameras.main;
    const z = Phaser.Math.Clamp(cam.zoom + delta, ZOOM_MIN, ZOOM_MAX);
    cam.zoom = z;
    this.game.events.emit('camera:zoom', z);
  }

  // ------------------------------------------------------------------- input
  private setupInput(): void {
    this.input.mouse?.disableContextMenu();
    this.input.addPointer(3); // multi-touch

    this.input.on('wheel', (_p: Phaser.Input.Pointer, _objs: unknown, dx: number, dy: number) => {
      audio.unlock();
      this.panCamera(dx, dy);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      audio.unlock();
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
    kb2.on('keydown-M', () => this.skills.toggleMisplaced());
    kb2.on('keydown-S', () => this.skills.tryActivatePower('matchScan'));
    kb2.on('keydown-G', () => this.skills.tryActivatePower('matchGather'));

    // user gesture => audio unlock (keys count too)
    kb2.on('keydown', () => audio.unlock());

    // repair results come back through the global event bus
    this.game.events.on('repair:closed', this.onRepairClosed, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('repair:closed', this.onRepairClosed, this);
    });
  }

  private onRepairClosed(data: { id: number; success: boolean }): void {
    this.skills.onRepairClosed(data.id, data.success);
    this.emitCounters();
  }

  // ------------------------------------------------------------- session flow
  newGame(seed?: number): void {
    const useSeed = seed ?? randomSeed();
    this.scene.restart({ seed: useSeed, fresh: true });
  }

  private readSeedParam(): number {
    const p = new URLSearchParams(window.location.search);
    if (this.override?.seed !== undefined) return this.override.seed >>> 0;
    if (this.override?.fresh) return randomSeed();
    if (p.has('seed')) {
      const s = Number.parseInt(p.get('seed') as string, 10);
      if (Number.isFinite(s)) return s >>> 0;
    }
    // restore saved run when present (autotest phase 2 uses ?restore=1)
    if ((!p.has('autotest') || p.has('restore')) && this.storageOk) {
      const save = loadRun();
      if (save) {
        this.pendingSave = save;
        return save.seed;
      }
    }
    return 20261118;
  }

  applyPendingSave(): void {
    // world data already restored in create(); kept for API symmetry/debug
    this.sortedCount = this.world.tapes.filter(t => t.state === 'shelved').length;
    this.emitCounters();
  }

  save(): void {
    if (window.location.search.includes('autotest')) {
      console.log(`[save] called, storageOk=${this.storageOk}`);
    }
    if (!this.storageOk) {
      if (!this.storageWarned) {
        this.storageWarned = true;
        this.game.events.emit('toast', 'Saving unavailable in this browser — progress is session-only.');
      }
      return;
    }
    try {
      const file = serializeRun(this.world, this.skills.unlocked, this.skills.powersSave(), this.playSeconds);
      const ok = saveRun(file);
      if (!ok && window.location.search.includes('autotest')) console.warn('[save] saveRun returned false');
    } catch (e) {
      if (window.location.search.includes('autotest')) console.warn('[save] serialize threw', e);
    }
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

  rackDataFor(combo: number): Rack { return this.world.racks[combo]; }

  rackUnder(x: number, y: number): Rack | null {
    for (const rack of this.world.racks) {
      const r = rackRect(rack.combo);
      if (x >= r.x - 24 && x <= r.x + r.w + 24 && y >= r.y - 18 && y <= r.y + r.h + 22) return rack;
    }
    return null;
  }

  benchUnder(x: number, y: number): boolean {
    const b = benchRect();
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  comboLabel(combo: number): string {
    const c = COLORS[Math.floor(combo / SYMBOLS.length)];
    const s = SYMBOLS[combo % SYMBOLS.length];
    return `${c.name} ${s}`;
  }

  emitCounters(): void {
    const loose = this.world.tapes.filter(t => t.state === 'loose').length;
    const repairs = this.world.tapes.filter(t => t.defect && !t.repaired).length;
    this.game.events.emit('counters', {
      shelved: this.sortedCount,
      total: this.world.totalTapes,
      loose,
      repairs,
      thresholds: SKILL_THRESHOLDS,
    });
  }

  private completionShownFlag = false;

  checkCompletion(): void {
    if (this.completionShownFlag) return;
    if (this.sortedCount >= this.world.totalTapes) {
      this.completionShownFlag = true;
      audio.play('complete');
      this.game.events.emit('complete', {
        seed: this.seed,
        playSeconds: this.playSeconds,
        repairs: this.world.tapes.filter(t => t.defect).length,
      });
      this.save();
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
    if (this.keys.Q?.isDown) this.zoomBy(0.28 * dt);
    if (this.keys.E?.isDown) this.zoomBy(-0.28 * dt);
    if (this.keys.PLUS?.isDown) this.zoomBy(0.5 * dt);
    if (this.keys.MINUS?.isDown) this.zoomBy(-0.5 * dt);

    this.drag.update();
    this.skills.update();

    // autosave every 4s of play (debounced further on writes)
    this.saveTimer += dt;
    if (this.saveTimer > 4) {
      this.saveTimer = 0;
      if (this.drag.held === null) this.save();
    }
  }

  /** debug/test helper: actually shelve loose tapes via the real data path */
  debugShelve(count: number, combo?: number): number {
    let shelved = 0;
    for (const t of this.world.tapes) {
      if (shelved >= count) break;
      if (t.state !== 'loose' || (t.defect && !t.repaired)) continue;
      if (combo !== undefined && t.combo !== combo) continue;
      const rack = this.world.racks[t.combo];
      const slot = rack.slots.findIndex(s => s === null);
      if (slot < 0) continue;
      t.state = 'shelved';
      t.slot = slot;
      rack.slots[slot] = t.id;
      const view = this.tapeViews.get(t.id);
      if (view) {
        view.face.setVisible(false);
        if (view.overlay) view.overlay.setVisible(false);
        view.spine.setVisible(true);
        const p = slotPos(t.combo, slot);
        view.container.setPosition(p.x, p.y).setRotation(0).setDepth(4.5);
        const rv = this.rackViews.get(t.combo);
        if (rv) rv.slots[slot] = view.spine;
      }
      this.updateRackCount(t.combo);
      shelved++;
    }
    this.sortedCount = this.world.tapes.filter(t2 => t2.state === 'shelved').length;
    this.skills.onShelved(this.sortedCount);
    this.emitCounters();
    return shelved;
  }

  /** debug/test-only: teleport a loose tape (fixture setup for marquee tests). */
  debugSetTapePos(id: number, x: number, y: number): void {
    const t = this.world.tapes.find(tt => tt.id === id);
    const view = this.tapeViews.get(id);
    if (!t || !view || t.state !== 'loose' || this.drag.held?.tapes.some(v => v.id === id)) return;
    t.x = x; t.y = y; t.rot = 0;
    view.container.setPosition(x, y).setRotation(0).setDepth(y);
  }

  get completionShown(): boolean {
    return this.completionShownFlag;
  }

  resizeForTest(w: number, h: number): void {
    this.game.scale.resize(w, h);
  }
}
