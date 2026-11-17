/**
 * TideView — owns the canvas, camera, input, animation and the event→effect
 * wiring between the pure model and the audio/visual layers.
 *
 * Anti-cramp controls (JavaJack's hand-cramp feedback): generous hit radii,
 * magnetic snapping, and double-tap auto-flight so the whole game is playable
 * click-only — dragging is optional, never required.
 */
import type { RunStats, World } from '../game/types';
import { TideGame } from '../game/model';
import type { SkillId } from '../game/skills';
import { mulberry32 } from '../game/worldgen';
import * as audio from './audio';
import { drawScene, newViewAnim, type Camera, type ViewAnim } from './render';

export interface Progress {
  crittersFiled: number;
  crittersTotal: number;
  jarsSealed: number;
  jarsTotal: number;
  jarsShelved: number;
  streak: number;
}

export interface ViewHooks {
  onXp(total: number, level: number, gained: number): void;
  onUnlock(skillId: SkillId): void;
  onLore(line: string): void;
  onHint(text: string): void;
  onStreak(n: number): void;
  onComplete(stats: RunStats): void;
  onProgress(p: Progress): void;
}

export interface SkillState {
  cooldownsUntil: Record<string, number>;
  activeUntil: Record<string, number>;
}

export class TideView {
  readonly canvas: HTMLCanvasElement;
  world: World;
  model: TideGame;
  private hooks: ViewHooks;
  private anim: ViewAnim = newViewAnim();
  private cam: Camera = { x: 0, y: 0, zoom: 10 };
  private camInit = false;
  private fitZoom = 10;
  private dpr = 1;
  private raf = 0;
  private lastT = 0;
  private time = 0;
  private destroyed = false;
  private pointerDown = false;
  private panLast: { x: number; y: number } | null = null;
  private pinchLast: number | null = null;
  private lastTap = { at: 0, x: 0, y: 0 };
  private jarPos: Record<string, { x: number; y: number; rot: number }> = {};
  private bubbleAt = 0;
  private unlocked: Set<SkillId> = new Set();
  readonly skills: SkillState = { cooldownsUntil: {}, activeUntil: {} };

  constructor(canvas: HTMLCanvasElement, world: World, unlocked: SkillId[], hooks: ViewHooks) {
    this.canvas = canvas;
    this.world = world;
    this.hooks = hooks;
    this.unlocked = new Set(unlocked);
    this.model = new TideGame(world, { unlocked: this.unlocked });
    this.jarPos = { ...world.jarScatter };
    this.resize();
    window.addEventListener('resize', this.onResize);
    this.attachInput();
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  setUnlocked(ids: SkillId[]): void {
    this.unlocked = new Set(ids);
    this.model.setUnlocked(ids);
  }

  /** Swap in a freshly generated tide. */
  setWorld(world: World): void {
    this.world = world;
    this.model = new TideGame(world, { unlocked: this.unlocked });
    this.anim = newViewAnim();
    this.jarPos = { ...world.jarScatter };
    this.camInit = false;
    this.resize();
    this.emitProgress();
  }

  private onResize = (): void => this.resize();

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.fitCamera();
  }

  private fitCamera(): void {
    const w = this.world.shore.w + this.world.wall.w + 6;
    const h = this.world.shore.h + 8;
    const rect = this.canvas.getBoundingClientRect();
    this.fitZoom = Math.min(rect.width / w, rect.height / h);
    const z = this.cam.zoom;
    if (!this.camInit || z < this.fitZoom * 0.45 || z > this.fitZoom * 4) {
      this.cam.zoom = this.fitZoom * 0.98;
      this.cam.x = w / 2 - 3;
      this.cam.y = h / 2 - 3;
      this.camInit = true;
    }
  }

  resetCamera(): void {
    this.cam.zoom = this.fitZoom * 0.98;
    const w = this.world.shore.w + this.world.wall.w + 6;
    const h = this.world.shore.h + 8;
    this.cam.x = w / 2 - 3;
    this.cam.y = h / 2 - 3;
  }

  // ————— coordinate helpers —————

  private toWorld(px: number, py: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (px - rect.left - rect.width / 2) / this.cam.zoom + this.cam.x,
      y: (py - rect.top - rect.height / 2) / this.cam.zoom + this.cam.y,
    };
  }

  // ————— input —————

  private attachInput(): void {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('pointermove', this.onMove);
    c.addEventListener('pointerup', this.onUp);
    c.addEventListener('pointercancel', this.onUp);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('dblclick', this.onDbl);
    window.addEventListener('keydown', this.onKey);
  }

  dispose(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onUp);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('dblclick', this.onDbl);
  }

  private onDown = (e: PointerEvent): void => {
    audio.unlock();
    audio.startLayers();
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* synthetic/lost pointer — capture is cosmetic */ }
    this.pointerDown = true;
    const w = this.toWorld(e.clientX, e.clientY);
    const hit = this.hitTest(w);
    if (hit.kind === 'critter') {
      if (this.model.pickCritter(hit.id)) {
        audio.play('pickup');
        this.syncCarried(w);
      } else if (this.model.heldKind.kind === 'critters') {
        this.hooks.onHint('Hands full — drop what you carry first (or unlock Both Paws).');
      }
    } else if (hit.kind === 'jar') {
      if (this.model.pickJar(hit.id)) {
        audio.play('pickup');
        this.anim.carriedJar = { id: hit.id, x: w.x, y: w.y, species: hit.species, sealed: true };
      }
    } else {
      this.panLast = { x: e.clientX, y: e.clientY };
    }
  };

  private onMove = (e: PointerEvent): void => {
    const w = this.toWorld(e.clientX, e.clientY);
    if (this.pointerDown && this.panLast) {
      const rect = this.canvas.getBoundingClientRect();
      const dx = (e.clientX - this.panLast.x) / rect.width;
      const dy = (e.clientY - this.panLast.y) / rect.height;
      this.cam.x -= dx * (rect.width / this.cam.zoom);
      this.cam.y -= dy * (rect.height / this.cam.zoom);
      this.panLast = { x: e.clientX, y: e.clientY };
      this.clampCam();
      return;
    }
    if (this.pointerDown && this.pinchLast !== null) return;
    this.syncCarried(w);
    this.anim.hover = this.hoverTarget(w);
  };

  private onUp = (e: PointerEvent): void => {
    this.pointerDown = false;
    this.panLast = null;
    this.pinchLast = null;
    const w = this.toWorld(e.clientX, e.clientY);

    // double-tap detection (manual — dblclick is unreliable on touch)
    const now = performance.now();
    if (now - this.lastTap.at < 320 && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 24) {
      this.lastTap = { at: 0, x: 0, y: 0 };
      this.onDbl(e);
      return;
    }
    this.lastTap = { at: now, x: e.clientX, y: e.clientY };

    const target = this.hoverTarget(w);
    const held = this.model.heldKind;
    if (held.kind === 'critters' && held.ids.length > 0) {
      // resolve the LEAD carried critter against the nearest open jar — an
      // exact match files; a mismatch is a polite 'wrong' (streak resets, the
      // critter stays in hand); nothing nearby returns everything home
      const lead = held.ids[0];
      const jar = this.nearestOpenJar(w);
      if (!jar) this.model.releaseAll();
      else this.model.fileCritter(lead, jar);
    } else if (held.kind === 'jar') {
      const jarId = held.id;
      const cubby = this.cubbyAt(w);
      if (cubby && target?.kind === 'cubby') {
        this.model.shelveJar(jarId, cubby);
      } else {
        // put the jar down where the player dropped it (rearranging is QoL)
        this.model.releaseAll();
        const shore = this.world.shore;
        this.jarPos[jarId] = {
          x: Math.max(shore.x + 4, Math.min(shore.x + shore.w - 4, w.x)),
          y: Math.max(shore.y + 4, Math.min(shore.y + shore.h - 4, w.y)),
          rot: 0,
        };
      }
    }
    if (this.model.heldKind.kind === 'none') {
      this.anim.carried = [];
      this.anim.carriedJar = null;
      this.anim.carriedTarget = null;
    } else {
      this.syncCarried(w); // keep the rest of the fan visibly in hand
    }
    this.anim.hover = null;
    this.consumeEvents();
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const before = this.toWorld(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.cam.zoom = Math.max(this.fitZoom * 0.45, Math.min(this.fitZoom * 4, this.cam.zoom * factor));
    const after = this.toWorld(e.clientX, e.clientY);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCam();
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const pan = 46 / this.cam.zoom;
    if (e.key === 'ArrowLeft' || e.key === 'a') { this.cam.x -= pan; this.clampCam(); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { this.cam.x += pan; this.clampCam(); }
    else if (e.key === 'ArrowUp' || e.key === 'w') { this.cam.y -= pan; this.clampCam(); }
    else if (e.key === 'ArrowDown' || e.key === 's') { this.cam.y += pan; this.clampCam(); }
    else if (e.key === '+' || e.key === '=') { this.cam.zoom = Math.min(this.fitZoom * 4, this.cam.zoom * 1.15); }
    else if (e.key === '-' || e.key === '_') { this.cam.zoom = Math.max(this.fitZoom * 0.45, this.cam.zoom / 1.15); }
    else if (e.key === '0') { this.resetCamera(); }
  };

  private onDbl = (e: PointerEvent | MouseEvent): void => {
    const w = this.toWorld((e as PointerEvent).clientX, (e as PointerEvent).clientY);
    const hit = this.hitTest(w);
    const speed = this.unlocked.has('slipstream') ? 1.6 : 1; // Slipstream passive
    if (hit.kind === 'critter') {
      const heldIds = this.model.heldKind.kind === 'critters' ? [...this.model.heldKind.ids] : [];
      if (heldIds.includes(hit.id)) {
        // convenience: file everything in hand right now
        if (this.model.fileAllHeld() > 0) this.consumeEvents();
        return;
      }
      const jarId = this.model.flyTargetJar(hit.id);
      if (!jarId || this.anim.flights.some((f) => f.critterId === hit.id)) return;
      const jp = this.jarPos[jarId];
      const dist = Math.hypot(jp.x - w.x, jp.y - w.y);
      this.anim.flights.push({
        critterId: hit.id,
        fromX: this.world.scatter[hit.id].x, fromY: this.world.scatter[hit.id].y,
        toX: jp.x, toY: jp.y,
        t: 0, dur: Math.min(1.1, 0.35 + dist * 0.02) / speed, onArrive: 'file',
      });
    } else if (hit.kind === 'jar') {
      const jarId = hit.id;
      if (this.anim.flights.some((f) => f.jarId === jarId)) return;
      const alreadyHeld = this.model.heldKind.kind === 'jar' && this.model.heldKind.id === jarId;
      if (!alreadyHeld && !this.model.pickJar(jarId)) return;
      const cubbyId = this.model.flyTargetCubby(jarId);
      if (!cubbyId) { this.model.releaseAll(); this.consumeEvents(); return; }
      const jp = this.jarPos[jarId];
      const cubby = this.world.cubbies.find((k) => k.id === cubbyId)!;
      const cols = Math.max(...this.world.cubbies.map((k) => k.col)) + 1;
      const rows = Math.max(...this.world.cubbies.map((k) => k.row)) + 1;
      const toX = this.world.wall.x + (cubby.col + 0.5) * (this.world.wall.w / cols);
      const toY = this.world.wall.y + (cubby.row + 0.5) * (this.world.wall.h / rows);
      const dist = Math.hypot(toX - jp.x, toY - jp.y);
      this.anim.flights.push({
        jarId, cubbyId, fromX: jp.x, fromY: jp.y, toX, toY,
        t: 0, dur: Math.min(1.3, 0.45 + dist * 0.02) / speed, onArrive: 'shelve',
      });
      this.anim.carriedJar = null;
    }
  };

  // ————— hit testing / targets —————

  private hitTest(w: { x: number; y: number }): { kind: 'critter' | 'jar'; id: string; species: string } | { kind: 'none' } {
    const minPx = 30 / this.cam.zoom;
    // critters first (topmost by y)
    const loose = this.world.critters
      .filter((c) => this.model.critterLocation(c.id) === 'loose')
      .sort((a, b) => this.world.scatter[b.id].y - this.world.scatter[a.id].y);
    for (const c of loose) {
      const p = this.world.scatter[c.id];
      const sp = this.world.species.find((s) => s.id === c.species)!;
      const r = Math.max(sp.size + 0.7, minPx);
      if (Math.hypot(p.x - w.x, p.y - w.y) <= r) return { kind: 'critter', id: c.id, species: c.species };
    }
    for (const jar of this.world.jars) {
      if (this.model.jarLocation(jar.id) !== 'loose') continue;
      const p = this.jarPos[jar.id];
      if (Math.hypot(p.x - w.x, p.y - w.y) <= Math.max(3.1, minPx)) return { kind: 'jar', id: jar.id, species: jar.species };
    }
    return { kind: 'none' };
  }

  private nearestOpenJar(w: { x: number; y: number }): string | null {
    const magnet = Math.max(3.4, 34 / this.cam.zoom);
    let best: string | null = null;
    let bestD = magnet;
    for (const jar of this.world.jars) {
      if (this.model.jarLocation(jar.id) !== 'loose' || this.model.isSealed(jar.id)) continue;
      const p = this.jarPos[jar.id];
      const d = Math.hypot(p.x - w.x, p.y - w.y);
      if (d < bestD) { bestD = d; best = jar.id; }
    }
    return best;
  }

  private cubbyAt(w: { x: number; y: number }): string | null {
    const wall = this.world.wall;
    const cols = Math.max(...this.world.cubbies.map((c) => c.col)) + 1;
    const rows = Math.max(...this.world.cubbies.map((c) => c.row)) + 1;
    const cw = wall.w / cols;
    const ch = wall.h / rows;
    for (const cubby of this.world.cubbies) {
      const cx = wall.x + cubby.col * cw;
      const cy = wall.y + cubby.row * ch;
      if (w.x > cx - 1 && w.x < cx + cw + 1 && w.y > cy - 1 && w.y < cy + ch + 1) return cubby.id;
    }
    return null;
  }

  /** The magnetic candidate: the exact-match jar for carried critters, or the
   *  matching cubby for the carried jar — shown as a glowing ring. */
  private hoverTarget(w: { x: number; y: number }): ViewAnim['hover'] {
    const held = this.model.heldKind;
    if (held.kind === 'critters' && held.ids.length > 0) {
      const first = this.world.critters.find((k) => k.id === held.ids[0]);
      if (first) {
        const jar = this.nearestOpenJar(w);
        if (jar === first.jarId) return { kind: 'jar', id: jar };
      }
    }
    if (held.kind === 'jar') {
      const jar = this.world.jars.find((j) => j.id === held.id)!;
      const cubby = this.cubbyAt(w);
      if (cubby) {
        const target = this.world.cubbies.find((c) => c.id === cubby)!;
        if (target.species === jar.species) return { kind: 'cubby', id: cubby };
      }
    }
    return null;
  }

  private syncCarried(w: { x: number; y: number }): void {
    if (this.model.heldKind.kind === 'critters') {
      const ids = [...this.model.heldKind.ids];
      this.anim.carried = ids.map((id) => {
        const c = this.world.critters.find((k) => k.id === id)!;
        const sp = this.world.species.find((s) => s.id === c.species)!;
        const prev = this.anim.carried.find((k) => k.id === id);
        return { id, species: c.species, golden: c.golden, size: sp.size, x: prev?.x ?? w.x, y: prev?.y ?? w.y };
      });
      this.anim.carriedJar = null;
      this.anim.carriedTarget = w;
    } else if (this.model.heldKind.kind === 'jar') {
      const id = this.model.heldKind.id;
      const prev = this.anim.carriedJar;
      this.anim.carriedJar = prev && prev.id === id ? prev : { id, x: w.x, y: w.y, species: this.world.jars.find((j) => j.id === id)!.species, sealed: true };
      this.anim.carriedTarget = w;
    } else {
      this.anim.carried = [];
      this.anim.carriedJar = null;
      this.anim.carriedTarget = null;
    }
  }

  private clampCam(): void {
    const w = this.world.shore.w + this.world.wall.w + 6;
    const h = this.world.shore.h + 8;
    this.cam.x = Math.max(-4, Math.min(w + 4, this.cam.x));
    this.cam.y = Math.max(-4, Math.min(h + 4, this.cam.y));
  }

  /** World → CSS pixel coords (e2e observability: lets tests drive real input). */
  worldToScreen(x: number, y: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + (x - this.cam.x) * this.cam.zoom + rect.width / 2, y: rect.top + (y - this.cam.y) * this.cam.zoom + rect.height / 2 };
  }

  // ————— particles —————

  private burst(x: number, y: number, hue: number, n = 10, kind: 'spark' | 'ring' = 'spark'): void {
    const cap = 320;
    if (this.anim.particles.length > cap) return;
    const rand = mulberry32((x * 1000 + y * 37 + performance.now()) | 0);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const v = 2 + rand() * 5;
      this.anim.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2,
        life: 0.7 + rand() * 0.5, maxLife: 1.2, size: 0.25 + rand() * 0.3, hue, kind,
      });
    }
  }

  // ————— skills —————

  activateSkill(id: SkillId): boolean {
    const now = performance.now();
    if (!this.unlocked.has(id) || (this.skills.cooldownsUntil[id] ?? 0) > now) return false;
    if (id === 'tidePull') {
      const n = this.model.tidePull(3);
      if (n === 0) return false;
      this.skills.cooldownsUntil[id] = now + (45_000);
      audio.play('skill');
      this.consumeEvents();
      return true;
    }
    if (id === 'moonlight') {
      this.anim.moonlightUntil = now + 10_000;
      this.skills.cooldownsUntil[id] = now + (30_000);
      audio.play('skill');
      return true;
    }
    if (id === 'gullsEye') {
      this.anim.gullsEyeUntil = now + 12_000;
      this.skills.cooldownsUntil[id] = now + (60_000);
      audio.play('skill');
      return true;
    }
    return false;
  }

  // ————— model events → effects —————

  private consumeEvents(): void {
    const evs = this.model.consumeEvents();
    let progressDirty = evs.length > 0;
    for (const ev of evs) {
      switch (ev.t) {
        case 'filed': {
          const jp = this.jarPos[ev.jarId];
          this.anim.splash.push({ x: jp.x, y: jp.y - 1, at: performance.now() });
          audio.play('plop', ev.fillIndex - 1);
          if (ev.golden) {
            audio.play('golden');
            this.burst(jp.x, jp.y - 2, 48, 16);
          }
          break;
        }
        case 'wrong':
          audio.play('wrong');
          break;
        case 'bounce':
          audio.play('bounce');
          break;
        case 'sealed': {
          const jp = this.jarPos[ev.jarId];
          const ordinal = (parseInt(ev.jarId.split('#')[1], 10) || 1) - 1;
          audio.play('seal', ordinal);
          this.burst(jp.x, jp.y - 2, 52, 14);
          this.burst(jp.x, jp.y - 2, 52, 1, 'ring');
          break;
        }
        case 'shelved': {
          const cubby = this.world.cubbies.find((c) => c.id === ev.cubbyId)!;
          const cols = Math.max(...this.world.cubbies.map((c) => c.col)) + 1;
          const rows = Math.max(...this.world.cubbies.map((c) => c.row)) + 1;
          const x = this.world.wall.x + (cubby.col + 0.5) * (this.world.wall.w / cols);
          const y = this.world.wall.y + (cubby.row + 0.5) * (this.world.wall.h / rows);
          audio.play('shelf');
          this.burst(x, y, 45, 10);
          if (ev.speciesDone) this.burst(x, y, 48, 22);
          break;
        }
        case 'streak':
          audio.play('streak');
          this.hooks.onStreak(ev.n);
          break;
        case 'xp':
          this.hooks.onXp(ev.total, ev.level, ev.amount);
          break;
        case 'unlock':
          this.hooks.onUnlock(ev.skillId);
          break;
        case 'lore':
          audio.play('lore');
          this.hooks.onLore(ev.line);
          break;
        case 'hint':
          this.hooks.onHint(ev.text);
          break;
        case 'complete':
          audio.play('finale');
          this.anim.finaleGlow = 1;
          this.hooks.onComplete(ev.stats);
          break;
      }
    }
    if (progressDirty) this.emitProgress();
  }

  private emitProgress(): void {
    const total = this.world.critters.length;
    const filed = this.world.critters.filter((c) => this.model.critterLocation(c.id) === 'jarred').length;
    this.hooks.onProgress({
      crittersFiled: filed,
      crittersTotal: total,
      jarsSealed: this.world.jars.filter((j) => this.model.isSealed(j.id)).length,
      jarsTotal: this.world.jars.length,
      jarsShelved: this.world.jars.filter((j) => this.model.jarLocation(j.id) === 'shelved').length,
      streak: this.model.currentStreak,
    });
  }

  // ————— main loop —————

  private loop = (now: number): void => {
    if (this.destroyed) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.time += dt;

    // carried items spring toward the pointer
    const tgt = this.anim.carriedTarget;
    if (tgt) {
      const k = Math.min(1, dt * 16);
      for (const c of this.anim.carried) { c.x += (tgt.x - c.x) * k; c.y += (tgt.y - c.y) * k; }
      if (this.anim.carriedJar) { this.anim.carriedJar.x += (tgt.x - this.anim.carriedJar.x) * k; this.anim.carriedJar.y += (tgt.y - this.anim.carriedJar.y) * k; }
    }

    // flights
    for (const f of [...this.anim.flights]) {
      f.t += dt;
      if (f.t >= f.dur) {
        this.anim.flights.splice(this.anim.flights.indexOf(f), 1);
        if (f.onArrive === 'file' && f.critterId) this.model.flyFile(f.critterId);
        if (f.onArrive === 'shelve' && f.jarId && f.cubbyId) this.model.shelveJar(f.jarId, f.cubbyId);
        this.consumeEvents();
      }
    }

    // particles
    for (const p of [...this.anim.particles]) {
      p.life -= dt;
      if (p.life <= 0) { this.anim.particles.splice(this.anim.particles.indexOf(p), 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.kind === 'bubble' ? -6 : 9) * dt;
    }
    this.anim.splash = this.anim.splash.filter((s) => performance.now() - s.at < 500);

    // finale glow decay
    if (this.anim.finaleGlow > 0) this.anim.finaleGlow = Math.max(0, this.anim.finaleGlow - dt * 0.25);

    // ambient bubbles in open jars
    if (this.time - this.bubbleAt > 1.4) {
      this.bubbleAt = this.time;
      const open = this.world.jars.filter((j) => this.model.jarLocation(j.id) === 'loose' && !this.model.isSealed(j.id) && this.model.fillOf(j.id) > 0);
      if (open.length > 0 && this.anim.particles.length < 200) {
        const jar = open[Math.floor(Math.random() * open.length)];
        const sp = this.world.species.find((s) => s.id === jar.species)!;
        this.anim.particles.push({
          x: this.jarPos[jar.id].x + (Math.random() - 0.5) * 2,
          y: this.jarPos[jar.id].y - 1,
          vx: 0, vy: -3, life: 1.1, maxLife: 1.1, size: 0.25, hue: sp.hue, kind: 'bubble',
        });
      }
    }

    drawScene(this.canvas, {
      world: { ...this.world, jarScatter: this.jarPos },
      model: this.model,
      anim: this.anim,
      time: this.time,
      nowMs: performance.now(),
    }, this.cam, this.canvas.clientWidth, this.canvas.clientHeight, this.dpr);

    this.raf = requestAnimationFrame(this.loop);
  };
}
