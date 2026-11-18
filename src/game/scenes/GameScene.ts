import Phaser from 'phaser';
import {
  BENCH, COLORS, RETURN_FROM, RETURN_SPOT, ROWS_PER_UNIT,
  ROW_PULSE_MS, SKILL_THRESHOLDS, SYMBOLS, TABLE_LIGHT, UNITS,
  WORLD_H, WORLD_W, ZOOM_MAX, ZOOM_MIN, benchRect, rowRect, slotPos, trayScreenRect,
  unitOfRow, unitPos, unitRect, groupOfRow, rowsOfGroup, ROW_CH_TOP, ROW_PITCH, ROW_CH_H,
  UNIT_W, UNIT_H,
} from '../config';
import { defectBlocksFiling } from '../types';
import type { Row, Tape, WorldData, SkillId, SaveSettings } from '../types';
import { generateWorld } from '../worldgen';
import { boardCorrect, validateWorld } from '../validation';
import { audio } from '../audio';
import { DragController } from '../controllers/DragController';
import { SkillsController, type PowerId } from '../controllers/SkillsController';
import { randomSeed } from '../rng';
import { applySave, loadRun, resolveSaveOverlaps, saveRun, serializeRun, storageAvailable } from '../save';
import { setLoosePose, setSeatedPose } from '../poses';
import { artState } from '../artState';
import { HoverNudge } from '../nudge';

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
  lips: Phaser.GameObjects.Image[];      // per-row foreground lips (pilot: 4)
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
  nudge!: HoverNudge;
  sortedCount = 0;
  seed = 0;
  playSeconds = 0;
  storageOk = storageAvailable();
  /** carried-over skill unlocks when migrating from a v1 save */
  carriedSkills: Record<SkillId, boolean> | null = null;
  pendingSave: ReturnType<typeof loadRun> = null;
  // --- v3 state ---
  settings: SaveSettings = { sound: true, hoverFx: true, pilotArt: true, reducedMotion: false };
  achievements = new Set<number>();       // cabinet completions (permanent)
  rowComplete: boolean[] = [];             // edge-triggered row milestone state
  milestoneCounters = { rows: 0, cabinets: 0 };
  lastMilestone = { kind: 'none' as 'none' | 'row' | 'cabinet', row: -1, unit: -1, at: 0 };
  returningTape = false;                   // repair return in flight (no autosave)
  /** per-unit art images the settings toggle re-textures (v4 full board) */
  unitArt: { body: Phaser.GameObjects.Image; lips: Phaser.GameObjects.Image[] }[] = [];
  private override: { seed?: number; fresh?: boolean; carry?: boolean } | null = null;
  private saveTimer = 0;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private storageWarned = false;
  private completionShownFlag = false;
  private notDoneShown = false;
  private uiBlocked = false;
  private rowPulseGfx: Phaser.GameObjects.Graphics | null = null;

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
    this.achievements = new Set();
    this.rowComplete = [];
    this.milestoneCounters = { rows: 0, cabinets: 0 };
    this.lastMilestone = { kind: 'none', row: -1, unit: -1, at: 0 };
    this.returningTape = false;
    this.unitArt = [];
    this.rowPulseGfx = null;
  }

  create(): void {
    this.seed = this.readSeedParam();
    this.world = generateWorld(this.seed);
    const validation = validateWorld(this.world);
    if (!validation.ok) {
      console.warn('world validation issues:', validation.issues.slice(0, 4));
    }
    if (this.pendingSave) {
      applySave(this.world, this.pendingSave);
      // v3 layout fixup: moved racks (centered north bank / walnut pilot) may
      // now overlap saved loose positions — push them out, never drop them
      resolveSaveOverlaps(this.world);
    }

    this.buildWorldVisuals();
    this.drag = new DragController(this);
    this.skills = new SkillsController(this);
    this.drag.skills = this.skills;
    this.nudge = new HoverNudge(this);
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
      for (const u of this.pendingSave.achievements ?? []) this.achievements.add(u);
      this.milestoneCounters = { ...this.pendingSave.milestones ?? { rows: 0, cabinets: 0 } };
      if (this.pendingSave.settings) this.applySettings(this.pendingSave.settings, false);
      this.pendingSave = null;
    } else if (this.carriedSkills) {
      this.skills.unlocked = { ...this.carriedSkills };
      this.skills.syncPowerUnlocks();
    }
    // initial (silent) row-completion state — no milestone sounds on load
    for (const r of this.world.rows) this.rowComplete[r.id] = this.rowIsCompleteCorrect(r.id);

    this.setupCamera();
    this.setupInput();
    this.setupSaveHooks();

    this.game.events.emit('tray:changed');
    this.game.events.emit('game:ready');
    this.game.events.emit('settings:changed', { ...this.settings });
    this.emitCounters();
  }

  // ------------------------------------------------------------- world visuals
  private buildWorldVisuals(): void {
    const table = this.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'wood');
    table.setOrigin(0, 0).setDepth(0).setName('table-tilesprite');

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

    // marked return spot for repaired tapes (v3 §7) — right of the bench
    const marker = this.add.graphics().setDepth(2).setAlpha(0.55);
    marker.lineStyle(2, 0x8a5a3b, 0.9);
    marker.strokeCircle(RETURN_SPOT.x, RETURN_SPOT.y, 34);
    marker.lineStyle(1.2, 0xd9b98a, 0.7);
    marker.strokeCircle(RETURN_SPOT.x, RETURN_SPOT.y, 26);
    this.add.text(RETURN_SPOT.x, RETURN_SPOT.y - 46, '↩ repaired', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#7d5333', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(2).setAlpha(0.75);

    // props (decorative dressing on the busy bench)
    this.add.image(214, 96, 'prop-lamp').setDepth(3).setScale(0.8);
    this.add.image(2688, 250, 'prop-radio').setDepth(3).setScale(0.9);
    this.add.image(2540, 1660, 'prop-plant').setDepth(3).setScale(0.85);
    this.add.image(560, 1650, 'prop-books').setDepth(3).setScale(0.9);

    // rack units (layered: shadow < body < chips/counts < seated spines < lips)
    for (let u = 0; u < UNITS; u++) {
      this.buildUnit(u);
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

    // scene lighting (v3 §3): world-space layers above the world, below fx/HUD
    this.buildLighting();
  }

  /** one compact cabinet family for every unit (v4): shadow/body/chips/lips */
  private buildUnit(u: number): void {
    const p = unitPos(u);
    // soft ground shadow under the whole cabinet
    const shadow = this.add.image(p.x + UNIT_W / 2 + 10, p.y + UNIT_H / 2 + 8, 'contact-shadow');
    shadow.setDisplaySize(UNIT_W * 1.22, UNIT_H * 1.12).setDepth(p.y - 0.6).setAlpha(0.34);
    const body = this.add.image(p.x + UNIT_W / 2, p.y + UNIT_H / 2, 'unit-body');
    body.setDisplaySize(UNIT_W, UNIT_H).setDepth(p.y);
    const lips = this.add.image(p.x + UNIT_W / 2, p.y + UNIT_H / 2, 'unit-lips');
    lips.setDisplaySize(UNIT_W, UNIT_H).setDepth(p.y + 2);
    this.unitArt.push({ body, lips: [lips] });
    const chips: Phaser.GameObjects.Image[] = [];
    const counts: Phaser.GameObjects.Text[] = [];
    this.attachRowLabels(u, (lr) => p.x + 24, (lr) => p.y + ROW_CH_TOP + lr * ROW_PITCH + ROW_CH_H / 2, () => p.x + UNIT_W - 10, chips, counts);
    const verify = this.add.text(p.x + UNIT_W - 34, p.y + 16, '✓?', {
      fontFamily: 'Georgia, serif', fontSize: '14px', fontStyle: 'bold', color: '#ffe9a8',
      backgroundColor: '#5a3520', padding: { x: 6, y: 2 },
    }).setOrigin(0.5).setDepth(p.y + 0.5).setInteractive({ useHandCursor: true });
    verify.on('pointerdown', () => { audio.unlock(); this.verifyUnit(u); });
    this.unitViews.set(u, { unit: u, body, lips: [lips], chips, counts, verify });
  }

  /** shared row-label chips + occupancy counters for a unit */
  private attachRowLabels(
    u: number,
    chipX: (lr: number) => number,
    chipY: (lr: number) => number,
    countX: (lr: number) => number,
    chips: Phaser.GameObjects.Image[],
    counts: Phaser.GameObjects.Text[],
  ): void {
    for (let lr = 0; lr < ROWS_PER_UNIT; lr++) {
      const row = u * ROWS_PER_UNIT + lr;
      const group = groupOfRow(row);
      const cy = chipY(lr);
      const chip = this.add.image(chipX(lr), cy, `chip-${group}`);
      chip.setDisplaySize(28, 28).setDepth(unitPos(u).y + 0.4);
      chips.push(chip);
      const count = this.add.text(countX(lr), cy - 7, '0/8', {
        fontFamily: 'Georgia, serif', fontSize: '12px', color: '#f6efdd',
      }).setOrigin(1, 0).setDepth(unitPos(u).y + 0.5);
      counts.push(count);
    }
  }

  /**
   * Board-wide lighting (v4): one warm environment for the whole table —
   * quiet ambient fill, a broad warm key from the lamp area, gentle distance
   * vignette, and the lamp's local pool/halo. All layers are world-space
   * (pan/zoom stable) above the world and held tapes, below fx/HUD.
   */
  private buildLighting(): void {
    const L = TABLE_LIGHT.light;
    const lamp = TABLE_LIGHT.lamp;
    const bulb = {
      x: lamp.x + 0.66 * lamp.w,
      y: lamp.y + 0.46 * lamp.h,
    };
    const lightDepth = 139000; // above world objects + held tapes, below fx/HUD

    // brass lamp prop at its table spot
    const lampImg = this.add.image(lamp.x, lamp.y, 'prop-lamp');
    lampImg.setOrigin(0.5, 0.8).setPosition(lamp.x + lamp.w / 2, lamp.y + lamp.h).setScale(1.1);
    lampImg.setDepth(lamp.y + lamp.h - 6);
    const lampShadow = this.add.image(lamp.x + lamp.w * 0.35 + 10, lamp.y + lamp.h - 8, 'contact-shadow');
    lampShadow.setDisplaySize(120, 52).setAlpha(0.4).setDepth(lamp.y + lamp.h - 6.2);

    // quiet warm ambient fill over the whole tabletop (normal blend)
    this.ensureTexture('light-ambient', (ctx) => {
      ctx.fillStyle = '#32221e';
      ctx.fillRect(0, 0, 8, 8);
    });
    const ambient = this.add.image(WORLD_W / 2, WORLD_H / 2, 'light-ambient');
    ambient.setDisplaySize(WORLD_W, WORLD_H).setDepth(lightDepth)
      .setAlpha(L.ambientAlpha).setBlendMode(Phaser.BlendModes.NORMAL);

    // broad warm key centered on the lamp — reaches most of the table so the
    // scene feels naturally lit even in the far corners
    this.ensureTexture('light-warm', (ctx, S) => {
      const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.02, S / 2, S / 2, S / 2);
      g.addColorStop(0, 'rgba(255,214,150,0.55)');
      g.addColorStop(0.45, 'rgba(255,196,120,0.18)');
      g.addColorStop(1, 'rgba(255,180,100,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    });
    const falloff = this.add.image(bulb.x, bulb.y, 'light-warm');
    falloff.setDisplaySize(3400, 2700).setDepth(lightDepth + 1)
      .setAlpha(L.falloffAlpha).setBlendMode(Phaser.BlendModes.ADD);

    // gentle world-anchored darkening toward the far edges/corners
    this.ensureTexture('light-far', (ctx, S) => {
      const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S / 2);
      g.addColorStop(0, 'rgba(20,10,6,0)');
      g.addColorStop(0.7, 'rgba(20,10,6,0.35)');
      g.addColorStop(1, 'rgba(20,10,6,0.8)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    });
    const far = this.add.image(WORLD_W / 2, WORLD_H / 2, 'light-far');
    far.setDisplaySize(WORLD_W * 1.3, WORLD_H * 1.3).setDepth(lightDepth + 1)
      .setAlpha(L.cornerVignetteAlpha).setBlendMode(Phaser.BlendModes.NORMAL);

    // amber pool just down-and-right of the shade + small bulb halo
    const poolTex = this.textures.exists('lamp-pool') ? 'lamp-pool' : 'light-warm';
    const pool = this.add.image(bulb.x + 70, bulb.y + 56, poolTex);
    pool.setDisplaySize(640, 480).setDepth(lightDepth + 2)
      .setAlpha(L.lampPoolAlpha).setBlendMode(Phaser.BlendModes.ADD);
    const haloTex = this.textures.exists('bulb-halo') ? 'bulb-halo' : 'light-warm';
    const halo = this.add.image(bulb.x, bulb.y, haloTex);
    halo.setDisplaySize(120, 120).setDepth(lightDepth + 3)
      .setAlpha(L.bulbHaloAlpha).setBlendMode(Phaser.BlendModes.ADD);
  }

  /** tiny canvas-texture helper (fallbacks when an SVG asset failed to load) */
  private ensureTexture(key: string, draw: (ctx: CanvasRenderingContext2D, S: number) => void): void {
    if (this.textures.exists(key)) return;
    const S = 256;
    const tex = this.textures.createCanvas(key, S, S);
    if (!tex) return;
    const ctx = (tex as Phaser.Textures.CanvasTexture).getContext();
    ctx.clearRect(0, 0, S, S);
    draw(ctx, S);
    (tex as Phaser.Textures.CanvasTexture).refresh();
  }

  spawnLooseTape(tape: Tape): TapeView {
    const face = this.add.image(0, 0, `tape-face-${tape.combo}`);
    const spine = this.add.image(0, 0, `spine-${tape.combo}`);
    const overlay = tape.defect && !tape.repaired
      ? this.add.image(0, 0, `defect-${tape.defect}`)
      : null;
    const children: Phaser.GameObjects.GameObject[] = [face, spine];
    if (overlay) children.push(overlay);
    const container = this.add.container(tape.x, tape.y, children);
    const view: TapeView = { id: tape.id, container, face, spine, overlay: overlay ?? null };
    setLoosePose(this, view, tape);
    container.setRotation(tape.rot);
    container.setData('tapeId', tape.id);
    container.setDepth(tape.y);
    this.tapeViews.set(tape.id, view);
    return view;
  }

  spawnShelvedTape(tape: Tape): TapeView {
    const face = this.add.image(0, 0, `tape-face-${tape.combo}`);
    const spine = this.add.image(0, 0, `spine-${tape.combo}`);
    const container = this.add.container(0, 0, [face, spine]);
    const view: TapeView = { id: tape.id, container, face, spine, overlay: null };
    const u = unitOfRow(tape.row as number);
    setSeatedPose(this, view, tape, u);
    const p = slotPos(tape.row as number, tape.slot as number);
    const lr = (tape.row as number) % ROWS_PER_UNIT;
    container.setPosition(p.x, p.y).setDepth(unitPos(u).y + 1 + lr * 0.02);
    container.setData('tapeId', tape.id);
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
    const t = this.tapeData(id);
    if (view && t) {
      setLoosePose(this, view, t);
      view.container.setVisible(true);
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
    this.nudge?.markDirty();
    this.game.events.emit('tray:flash', { slot });
    return slot;
  }

  trayRemoveAt(slot: number): number | null {
    const id = this.trayTapes[slot];
    if (id === null) return null;
    this.trayTapes[slot] = null;
    this.restoreFromTrayView(id);
    this.nudge?.markDirty();
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
    // first impression: the centered north bank + the busy middle together
    cam.setZoom(0.72);
    cam.centerOn(1400, 770);
    const kb = this.input.keyboard as Phaser.Input.Keyboard.KeyboardPlugin;
    this.keys = kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,PLUS,MINUS,Q,E,SPACE,ESC,F,R') as Record<string, Phaser.Input.Keyboard.Key>;
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
    this.input.mouse?.disableContextMenu(); // canvas only — the page keeps its menu
    this.input.addPointer(3); // multi-touch

    // wheel = zoom, centered on the cursor (pan stays on keys/drag/touch)
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
      this.nudge.onPointerMove(pointer);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      this.drag.onPointerUp(pointer);
    });

    const kb2 = this.input.keyboard as Phaser.Input.Keyboard.KeyboardPlugin;
    const typingGuard = (ev: KeyboardEvent): boolean =>
      ev.repeat === true
      || (document.activeElement instanceof HTMLElement
        && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName));
    kb2.on('keydown-ESC', () => {
      // close the skills panel first if it is open (panel is in the UI scene)
      if (this.game.registry.get('skillsPanelOpen')) {
        this.game.events.emit('skills:panel:toggle', false);
        return;
      }
      this.drag.cancel();
    });
    kb2.on('keydown-D', (ev: KeyboardEvent) => { if (!typingGuard(ev)) this.skills.toggleScanner(); });
    kb2.on('keydown-M', (ev: KeyboardEvent) => { if (!typingGuard(ev)) this.skills.tryActivatePower('misplaced'); });
    kb2.on('keydown-S', (ev: KeyboardEvent) => { if (!typingGuard(ev)) this.skills.tryActivatePower('matchScan'); });
    kb2.on('keydown-G', (ev: KeyboardEvent) => { if (!typingGuard(ev)) this.skills.tryActivatePower('matchGather'); });
    kb2.on('keydown-F', (ev: KeyboardEvent) => { if (!typingGuard(ev)) this.fitToTable(); });
    kb2.on('keydown-R', (ev: KeyboardEvent) => {
      if (typingGuard(ev) || this.uiBlocked) return;
      this.tryOpenRepairAtPointer();
    });
    kb2.on('keydown', () => audio.unlock());

    this.game.events.on('repair:closed', this.onRepairClosed, this);
    this.game.events.on('ui:block', (v: boolean) => { this.uiBlocked = v; });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('repair:closed', this.onRepairClosed, this);
      this.game.events.off('ui:block');
    });
  }

  /** R key: open the repair bench for the damaged tape under the cursor */
  tryOpenRepairAtPointer(): void {
    if (this.drag.held || this.drag.trayBatchDrag) return;
    const p = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const view = this.drag.looseTapeAtWorldPublic(wp.x, wp.y);
    const t = view ? this.tapeData(view.id) : undefined;
    if (t && t.defect && !t.repaired) {
      this.skills.openRepair(t.id);
    } else {
      this.game.events.emit('hint', 'R repairs a damaged tape under the cursor (or drag one onto the bench)');
    }
  }

  /** screen-space UI regions the game scene must not treat as table input */
  pointerOverUI(pointer: Phaser.Input.Pointer): boolean {
    const W = this.scale.width;
    const H = this.scale.height;
    if (pointer.y < 58) return true; // top bar (incl. the Skills icon)
    const tray = trayScreenRect(W, H);
    if (pointer.x >= tray.x - 6 && pointer.x <= tray.x + tray.w + 6
      && pointer.y >= tray.y - 6 && pointer.y <= tray.y + tray.h + 6) return true;
    if (pointer.y > H - 52 && pointer.x < 340) return true; // dev cluster (pilot toggles)
    // open panels (skills panel / help / confirm) cover the middle of the screen
    const rects = this.game.registry.get('uiPanelRects') as { x: number; y: number; w: number; h: number }[] | undefined;
    if (rects) {
      for (const r of rects) {
        if (pointer.x >= r.x && pointer.x <= r.x + r.w && pointer.y >= r.y && pointer.y <= r.y + r.h) return true;
      }
    }
    return false;
  }

  private onRepairClosed(data: { id: number; success: boolean }): void {
    this.skills.onRepairClosed(data.id, false); // skills bookkeeping only (no teleport)
    if (data.success) this.animateRepairReturn(data.id);
    else this.emitCounters();
  }

  // --------------------------------------------- repair return flight (v3 §7)
  /**
   * The repaired cassette shows briefly in the overlay (RepairScene handles
   * that beat), then THE SAME tape flies from the bench to the marked return
   * spot: ~0.7 s eased travel + settle, camera pans if the destination is off
   * screen, lands at the canonical loose size, immediately draggable, saved
   * only after landing (never mid-flight, never duplicated).
   */
  animateRepairReturn(id: number): void {
    const t = this.tapeData(id);
    const view = this.tapeViews.get(id);
    if (!t || !view) { this.emitCounters(); return; }
    t.repaired = true;
    if (view.overlay) view.overlay.setVisible(false);
    t.state = 'loose';
    t.row = null; t.slot = null;
    t.x = RETURN_FROM.x; t.y = RETURN_FROM.y; t.rot = 0;
    this.returningTape = true;

    // normal-sized loose pose, held above the table for the flight
    setLoosePose(this, view, t);
    const c = view.container;
    c.setVisible(true).setPosition(RETURN_FROM.x, RETURN_FROM.y).setRotation(-0.18)
      .setDepth(100050).disableInteractive();

    // the camera shows the destination (pan only if it is off screen)
    const cam = this.cameras.main;
    const view2 = cam.worldView;
    const both = { x: (RETURN_FROM.x + RETURN_SPOT.x) / 2, y: (RETURN_FROM.y + RETURN_SPOT.y) / 2 };
    const destVisible = RETURN_SPOT.x > view2.x - 60 && RETURN_SPOT.x < view2.right + 60
      && RETURN_SPOT.y > view2.y - 60 && RETURN_SPOT.y < view2.bottom + 60;
    if (!destVisible) cam.pan(both.x, both.y, 520, 'Sine.easeInOut');

    this.time.delayedCall(160, () => {
      audio.play('pickup');
      this.tweens.add({
        targets: c,
        x: RETURN_SPOT.x, y: RETURN_SPOT.y, rotation: 0,
        duration: 700, ease: 'cubic.easeout',
        onComplete: () => {
          c.setScale(0.94, 0.94);
          this.tweens.add({
            targets: c, scaleX: 1, scaleY: 1, duration: 110, ease: 'sine.easeout',
            onComplete: () => {
              // landed: normal-sized, immediately draggable, data committed
              c.setDepth(RETURN_SPOT.y);
              setLoosePose(this, view, t);
              t.x = Math.round(RETURN_SPOT.x * 10) / 10;
              t.y = Math.round(RETURN_SPOT.y * 10) / 10;
              this.returningTape = false;
              audio.play('place');
              this.nudge?.markDirty();
              this.emitCounters();
              this.save();
            },
          });
        },
      });
    });
    this.emitCounters();
  }

  // ------------------------------------------------- milestones (v3 §4)
  /** true when the row is FULL and every seated tape matches its label */
  rowIsCompleteCorrect(rowId: number): boolean {
    const row = this.world.rows[rowId];
    if (row.slots.some(s => s === null)) return false;
    for (const id of row.slots) {
      const t = this.tapeData(id as number);
      if (!t || t.combo !== row.group) return false;
    }
    return true;
  }

  /** cabinet = one physical unit; complete when all 4 rows are complete-correct */
  cabinetIsCompleteCorrect(u: number): boolean {
    for (let lr = 0; lr < ROWS_PER_UNIT; lr++) {
      if (!this.rowIsCompleteCorrect(u * ROWS_PER_UNIT + lr)) return false;
    }
    return true;
  }

  /**
   * Called when a tape FINISHES seating (insert animation end) or seats
   * instantly (debug path). Edge-triggered: the row milestone fires only on a
   * false→true transition; the cabinet achievement additionally requires the
   * permanent record to be absent. A final tape that completes both the row
   * and its cabinet plays the cabinet sound only (never layered).
   */
  onTapeSeatedFinished(rowId: number): void {
    const u = unitOfRow(rowId);
    const before = this.rowComplete[rowId] ?? false;
    const nowComplete = this.rowIsCompleteCorrect(rowId);
    this.rowComplete[rowId] = nowComplete;
    if (!nowComplete || before) return; // no transition → nothing (silence is fine:
    // a full-but-misfiled row earns nothing, and refills after removal re-earn it)

    // does this same completion finish the whole cabinet?
    const cabinetDone = this.cabinetIsCompleteCorrect(u) && !this.achievements.has(u);
    if (cabinetDone) {
      this.achievements.add(u);
      this.milestoneCounters.cabinets++;
      this.lastMilestone = { kind: 'cabinet', row: rowId, unit: u, at: this.time.now };
      audio.play('cabinet'); // fuller, still cozy — replaces the row chime (no layering)
      this.pulseRow(rowId);
      const colorName = COLORS[Math.floor(this.world.rows[rowId].group / SYMBOLS.length)].name;
      const nice = colorName.charAt(0).toUpperCase() + colorName.slice(1);
      this.game.events.emit('cabinet:complete', { unit: u, color: nice });
      this.save();
      return;
    }
    this.milestoneCounters.rows++;
    this.lastMilestone = { kind: 'row', row: rowId, unit: u, at: this.time.now };
    audio.play('chime'); // Tiny Chime — automatic on the completed row
    this.pulseRow(rowId);
  }

  /** brief warm pulse across the completed row (visible even when muted) */
  private pulseRow(rowId: number): void {
    if (!this.rowPulseGfx) this.rowPulseGfx = this.add.graphics().setDepth(138999);
    const g = this.rowPulseGfx;
    const r = rowRect(rowId);
    g.clear();
    g.fillStyle(0xffe9a8, 0.34);
    g.fillRoundedRect(r.x, r.y, r.w, r.h, 8);
    g.lineStyle(3, 0xffe9a8, 0.9);
    g.strokeRoundedRect(r.x, r.y, r.w, r.h, 8);
    this.tweens.add({
      targets: g, alpha: { from: 1, to: 0 }, duration: ROW_PULSE_MS, ease: 'sine.easeout',
      onComplete: () => { g.clear(); g.alpha = 1; },
    });
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

  save(): void {
    if (!this.storageOk) {
      if (!this.storageWarned) {
        this.storageWarned = true;
        this.game.events.emit('toast', 'Saving unavailable in this browser — progress is session-only.');
      }
      return;
    }
    try {
      const file = serializeRun(
        this.world, this.skills.unlocked, this.skills.powersSave(), this.playSeconds, this.trayTapes,
        {
          achievements: [...this.achievements],
          milestones: { ...this.milestoneCounters },
          settings: { ...this.settings },
        },
      );
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

  /** true while a modal UI panel (help/confirm/complete/migrate) blocks the table */
  uiBlockedFlag(): boolean { return this.uiBlocked; }

  tapeData(id: number): Tape | undefined { return this.world.tapes.find(t => t.id === id); }

  /** row under a world point (any row, matching or not — hidden correctness).
   *  Exact containment wins over edge tolerance: a drop aimed at row N's center
   *  must never be claimed by row N-1's tolerance zone (checked in id order). */
  rowUnder(x: number, y: number): Row | null {
    // pass 1: the rect actually contains the point
    for (const row of this.world.rows) {
      const r = rowRect(row.id);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return row;
    }
    // pass 2: the forgiving edge zone (nearest strip, still deterministic)
    let best: Row | null = null;
    let bestDist = Infinity;
    for (const row of this.world.rows) {
      const r = rowRect(row.id);
      if (x >= r.x - 8 && x <= r.x + r.w + 8 && y >= r.y - 10 && y <= r.y + r.h + 10) {
        const dy = y < r.y ? r.y - y : y - (r.y + r.h);
        if (dy < bestDist) { best = row; bestDist = dy; }
      }
    }
    return best;
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

  // ------------------------------------------------------------ v3 settings
  applySettings(s: Partial<SaveSettings>, persist = true): void {
    this.settings = { ...this.settings, ...s };
    audio.setEnabled(this.settings.sound);
    artState.pilotArt = this.settings.pilotArt;
    this.setPilotArt(this.settings.pilotArt);
    if (this.nudge) this.nudge.setEnabled(this.settings.hoverFx, this.settings.reducedMotion);
    if (persist) this.save();
    this.game.events.emit('settings:changed', { ...this.settings });
  }

  /**
   * v4 art-family toggle: same geometry everywhere, only pixels swap. The
   * cabinet bodies/lips and the table wood swap texture families directly;
   * every tape is re-posed (loose faces + seated spines pick their family via
   * the pose specs). Tray tapes are hidden world-views — nothing to do.
   */
  setPilotArt(on: boolean): void {
    const legacyWood = on === false && this.textures.exists('legacy-wood');
    const table = this.children.getByName('table-tilesprite') as Phaser.GameObjects.TileSprite | null;
    if (table && legacyWood) table.setTexture('legacy-wood');
    else if (table) table.setTexture('wood');
    for (const ua of this.unitArt) {
      ua.body.setTexture(on ? 'unit-body' : 'legacy-unit-body');
      for (const lip of ua.lips) lip.setTexture(on ? 'unit-lips' : 'legacy-unit-lips');
    }
    // re-pose EVERY tape (both modes share sizes; only textures swap)
    for (const view of this.tapeViews.values()) {
      const t = this.tapeData(view.id);
      if (!t) continue;
      if (t.state === 'loose') {
        setLoosePose(this, view, t);
        view.container.setRotation(t.rot);
      } else if (t.state === 'shelved') {
        setSeatedPose(this, view, t, unitOfRow(t.row as number));
      }
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

    // autosave every 4s of play (never mid repair-return flight)
    this.saveTimer += dt;
    if (this.saveTimer > 4) {
      this.saveTimer = 0;
      if (this.drag.held === null && !this.drag.trayBatchDrag && !this.returningTape) this.save();
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
    const u = unitOfRow(rowId);
    t.state = 'shelved';
    t.row = rowId;
    t.slot = slot;
    t.rot = 0;
    row.slots[slot] = id;
    this.sortedCount = this.world.tapes.filter(tt => tt.state === 'shelved').length;
    this.nudge?.markDirty();
    if (view) {
      setSeatedPose(this, view, t, u);
      const p = slotPos(rowId, slot);
      const lr = rowId % ROWS_PER_UNIT;
      if (instant) {
        view.container.setPosition(p.x, p.y).setRotation(0).setDepth(unitPos(u).y + 1 + lr * 0.02);
        this.onTapeSeatedFinished(rowId); // instant path: milestone fires at once
      }
    }
    this.updateRowCount(rowId);
  }

  /** unshelve (pull-out data path) — recompute the row's completion state */
  unseatTape(id: number): void {
    const t = this.tapeData(id);
    if (!t || t.state !== 'shelved') return;
    const row = this.world.rows[t.row as number];
    const slot = t.slot as number;
    if (row.slots[slot] === id) row.slots[slot] = null;
    t.state = 'loose';
    t.row = null; t.slot = null;
    this.updateRowCount(row.id);
    this.rowComplete[row.id] = this.rowIsCompleteCorrect(row.id);
    this.sortedCount = this.world.tapes.filter(tt => tt.state === 'shelved').length;
    this.nudge?.markDirty();
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
