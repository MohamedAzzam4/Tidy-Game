/**
 * Tidy Tapes — debug/test bridge (window.__tidy), v2. Dev + test harness only;
 * exposes read-only introspection plus a few explicit test helpers.
 */
import Phaser from 'phaser';
import type { GameScene } from './scenes/GameScene';
import { validateWorld, boardCorrect, misfiledTapes } from './validation';
import { audio } from './audio';
import { unitPos, unitRect, UNIT_W } from './config';
import { setLoosePose } from './poses';
import { DEFAULT_SETTINGS } from './save';

function audioRecentNames(): string[] {
  return audio.recent.map(r => r.name);
}

export interface TidyDebug {
  ready: boolean;
  seed(): number;
  tapeCount(): number;
  uniqueIds(): number;
  totalTapes(): number;
  shelved(): number;
  loose(): number;
  tray(): number[];
  trayFree(): number;
  repairsLeft(): number;
  worldSize(): { w: number; h: number };
  camera(): { x: number; y: number; zoom: number; viewW: number; viewH: number };
  setCamera(x: number, y: number, zoom?: number): void;
  zoomAt(screenX: number, screenY: number, zoom: number): void;
  fit(): void;
  tapesInfo(): Array<{ id: number; combo: number; state: string; defect: string | null; repaired: boolean; x: number; y: number; row: number | null; slot: number | null }>;
  rowsInfo(): Array<{ id: number; group: number; unit: number; used: number }>;
  validation(): { ok: boolean; issues: string[] };
  misfiles(): number[];
  correct(): boolean;
  verify(unit: number): 'ok' | 'wrong' | 'empty';
  skills(): Record<string, boolean>;
  powers(): Record<string, { unlocked: boolean; activeUntil: number; cooldownUntil: number }>;
  selection(): number[];
  held(): number[];
  newGame(seed?: number, carry?: boolean): void;
  shelve(count: number, combo?: number): number;
  insertTape(id: number, row: number, slot?: number): boolean;
  pullOut(id: number): boolean;
  trayLoad(id: number): number;
  trayClear(): void;
  setTapePos(id: number, x: number, y: number): void;
  openRepair(tapeId: number): void;
  repairAll(): number;
  repairOpen(): boolean;
  activatePower(name: 'misplaced' | 'matchScan' | 'matchGather'): boolean;
  forceExpirePower(name: 'misplaced' | 'matchScan' | 'matchGather'): void;
  save(): boolean;
  exportState(): unknown;
  audioRecent(): string[];
  completed(): boolean;
  resize(w: number, h: number): void;
  scanInfo(): { target: number | null; count: number };
  sceneInfo(): Record<string, { active: boolean; paused: boolean; sleeping: boolean }>;
  spritePos(id: number): { x: number; y: number } | null;
  storageOk(): boolean;
  // ---- v3 probes ----
  spriteSize(id: number): { w: number; h: number } | null;
  milestones(): { rows: number; cabinets: number; achievements: number[]; last: { kind: string; row: number; unit: number; at: number } };
  settings(): { sound: boolean; hoverFx: boolean; pilotArt: boolean; reducedMotion: boolean };
  setSetting(key: 'sound' | 'hoverFx' | 'pilotArt' | 'reducedMotion', value: boolean): void;
  nudge(): { enabled: boolean; lastNudgedId: number | null; activeCount: number };
  panelOpen(): boolean;
  togglePanel(): void;
  returning(): boolean;
  bankBounds(): { x0: number; x1: number; center: number };
  unitRectInfo(u: number): { x: number; y: number; w: number; h: number };
  textureOfTape(id: number): { face: string; spine: string } | null;
  pilotArtState(): { art: boolean; atlasLoaded: boolean; bodyTexture: string };
  recover(): void;
}

export function installDebug(game: Phaser.Game): void {
  const getScene = (): GameScene | null => {
    const s = game.scene.getScene('Game') as GameScene | null;
    return s ?? null;
  };

  const api: TidyDebug = {
    ready: true,
    seed: () => getScene()?.seed ?? -1,
    tapeCount: () => getScene()?.world.tapes.length ?? -1,
    uniqueIds: () => new Set(getScene()?.world.tapes.map(t => t.id) ?? []).size,
    totalTapes: () => getScene()?.world.totalTapes ?? -1,
    shelved: () => getScene()?.sortedCount ?? -1,
    loose: () => getScene()?.world.tapes.filter(t => t.state === 'loose').length ?? -1,
    tray: () => getScene()?.trayIds() ?? [],
    trayFree: () => getScene()?.trayFreeSlots() ?? -1,
    repairsLeft: () => getScene()?.world.tapes.filter(t => t.defect && !t.repaired
      && (t.defect === 'rewind' || t.defect === 'sticker')).length ?? -1,
    worldSize: () => {
      const s = getScene();
      return { w: s?.world.worldW ?? 0, h: s?.world.worldH ?? 0 };
    },
    camera: () => {
      const s = getScene();
      if (!s) return { x: 0, y: 0, zoom: 1, viewW: 0, viewH: 0 };
      const cam = s.cameras.main;
      return {
        x: Math.round(cam.scrollX), y: Math.round(cam.scrollY),
        zoom: Math.round(cam.zoom * 100) / 100,
        viewW: Math.round(cam.worldView.width), viewH: Math.round(cam.worldView.height),
      };
    },
    setCamera: (x, y, zoom) => {
      const s = getScene();
      if (!s) return;
      const cam = s.cameras.main;
      cam.centerOn(x, y);
      if (zoom !== undefined) {
        cam.setZoom(zoom);
        cam.centerOn(x, y);
      }
    },
    zoomAt: (sx, sy, z) => getScene()?.zoomAt(sx, sy, z),
    fit: () => getScene()?.fitToTable(),
    tapesInfo: () => (getScene()?.world.tapes ?? []).map(t => ({
      id: t.id, combo: t.combo, state: t.state, defect: t.defect, repaired: t.repaired,
      x: t.x, y: t.y, row: t.row, slot: t.slot,
    })),
    rowsInfo: () => (getScene()?.world.rows ?? []).map(r => ({
      id: r.id, group: r.group, unit: r.unit, used: r.slots.filter(s => s !== null).length,
    })),
    validation: () => {
      const s = getScene();
      if (!s) return { ok: false, issues: ['no scene'] };
      return validateWorld(s.world);
    },
    misfiles: () => {
      const s = getScene();
      return s ? misfiledTapes(s.world) : [];
    },
    correct: () => {
      const s = getScene();
      return s ? boardCorrect(s.world) : false;
    },
    verify: (unit) => {
      const s = getScene();
      if (!s) return 'empty';
      let wrong = 0;
      let seated = 0;
      for (let lr = 0; lr < 4; lr++) {
        const row = s.world.rows[unit * 4 + lr];
        for (const id of row.slots) {
          if (id === null) continue;
          seated++;
          const t = s.tapeData(id);
          if (!t || t.combo !== row.group) wrong++;
        }
      }
      if (seated === 0) return 'empty';
      return wrong === 0 ? 'ok' : 'wrong';
    },
    skills: () => ({ ...(getScene()?.skills.unlocked ?? {}) }),
    powers: () => {
      const s = getScene();
      const out: Record<string, { unlocked: boolean; activeUntil: number; cooldownUntil: number }> = {};
      if (s) {
        for (const [k, v] of Object.entries(s.skills.powers)) {
          out[k] = { unlocked: v.unlocked, activeUntil: v.activeUntil, cooldownUntil: v.cooldownUntil };
        }
      }
      return out;
    },
    selection: () => [...(getScene()?.skills.selection ?? [])],
    held: () => (getScene()?.drag.held?.tapes.map(v => v.id) ?? []),
    newGame: (seed, carry) => getScene()?.newGame(seed, carry),
    shelve: (count, combo) => getScene()?.debugShelve(count, combo) ?? -1,
    insertTape: (id, row, slot) => {
      const s = getScene();
      if (!s) return false;
      const t = s.tapeData(id);
      if (!t || t.state === 'loose' || t.state === 'tray') {
        if (t?.state === 'tray') s.trayRemoveTape(id);
      }
      const tape = s.tapeData(id);
      if (!tape || tape.state !== 'loose') return false;
      if (tape.defect && !tape.repaired
        && (tape.defect === 'rewind' || tape.defect === 'sticker')) return false;
      const r = s.world.rows[row];
      if (!r) return false;
      const target = slot !== undefined && r.slots[slot] === null ? slot : r.slots.findIndex(x => x === null);
      if (target < 0) return false;
      s.seatTape(id, row, target, true);
      s.skills.onShelved(s.sortedCount);
      s.emitCounters();
      s.checkCompletion();
      return true;
    },
    pullOut: (id) => {
      const s = getScene();
      if (!s) return false;
      const t = s.tapeData(id);
      if (!t || t.state !== 'shelved') return false;
      s.unseatTape(id);
      const view = s.tapeViews.get(id);
      if (view && t) {
        setLoosePose(s, view, t);
        t.x = view.container.x; t.y = view.container.y;
      }
      s.emitCounters();
      return true;
    },
    trayLoad: (id) => getScene()?.trayLoad(id) ?? -1,
    trayClear: () => {
      const s = getScene();
      if (!s) return;
      for (const id of s.trayIds()) {
        s.trayRemoveTape(id);
        const t = s.tapeData(id);
        const view = s.tapeViews.get(id);
        if (t && view) {
          t.state = 'loose';
          t.x = 320; t.y = 1680;
          view.container.setVisible(true).setPosition(320, 1680);
        }
      }
      // rebuild tray array
      s.trayTapes = [null, null, null, null, null];
      s.game.events.emit('tray:changed');
      s.emitCounters();
    },
    setTapePos: (id, x, y) => getScene()?.debugSetTapePos(id, x, y),
    openRepair: (tapeId) => {
      const s = getScene();
      if (!s) return;
      const t = s.world.tapes.find(x => x.id === tapeId);
      console.log('[debug] openRepair', tapeId, 'defect:', t?.defect, 'repaired:', t?.repaired, 'state:', t?.state);
      if (t && t.defect && !t.repaired) s.skills.openRepair(tapeId);
    },
    repairAll: () => getScene()?.debugRepairAll() ?? -1,
    repairOpen: () => !!game.scene.getScene('Repair')?.scene.isActive(),
    activatePower: (name) => getScene()?.skills.tryActivatePower(name) ?? false,
    forceExpirePower: (name) => getScene()?.skills.forceExpire(name),
    save: () => {
      const s = getScene();
      if (!s) return false;
      s.save();
      return s.storageOk;
    },
    exportState: () => getScene()?.world ?? null,
    sceneInfo: () => {
      const out: Record<string, { active: boolean; paused: boolean; sleeping: boolean }> = {};
      for (const sc of game.scene.scenes) {
        out[sc.scene.key] = {
          active: sc.scene.isActive(),
          paused: sc.scene.isPaused(),
          sleeping: sc.scene.isSleeping(),
        };
      }
      return out;
    },
    spritePos: (id) => {
      const s = getScene();
      const v = s?.tapeViews.get(id);
      return v ? { x: Math.round(v.container.x * 10) / 10, y: Math.round(v.container.y * 10) / 10 } : null;
    },
    storageOk: () => !!getScene()?.storageOk,
    audioRecent: () => audioRecentNames(),
    completed: () => getScene()?.completionShown ?? false,
    resize: (w, h) => getScene()?.resizeForTest(w, h),
    scanInfo: () => {
      const s = getScene();
      return { target: s?.skills.lastScanTarget ?? null, count: s?.skills.lastScanMatchCount ?? 0 };
    },
    // ---- v3 probes ----
    spriteSize: (id) => {
      const s = getScene();
      const v = s?.tapeViews.get(id);
      if (!v) return null;
      return {
        w: Math.round(v.face.displayWidth * 10) / 10,
        h: Math.round(v.face.displayHeight * 10) / 10,
      };
    },
    milestones: () => {
      const s = getScene();
      if (!s) return { rows: 0, cabinets: 0, achievements: [], last: { kind: 'none', row: -1, unit: -1, at: 0 } };
      return {
        rows: s.milestoneCounters.rows,
        cabinets: s.milestoneCounters.cabinets,
        achievements: [...s.achievements],
        last: { ...s.lastMilestone },
      };
    },
    settings: () => ({ ...DEFAULT_SETTINGS, ...(getScene()?.settings ?? {}) }),
    setSetting: (key, value) => {
      getScene()?.applySettings({ [key]: value } as Record<string, never>, false);
    },
    nudge: () => {
      const s = getScene();
      if (!s?.nudge) return { enabled: false, lastNudgedId: null, activeCount: 0 };
      return { enabled: s.nudge.enabled, lastNudgedId: s.nudge.lastNudgedId, activeCount: s.nudge.activeCount };
    },
    panelOpen: () => !!game.registry.get('skillsPanelOpen'),
    togglePanel: () => {
      const open = !!game.registry.get('skillsPanelOpen');
      game.events.emit('skills:panel:toggle', !open);
    },
    returning: () => !!getScene()?.returningTape,
    bankBounds: () => {
      const xs = [0, 1, 2, 3, 4, 5, 6, 7].map(u => unitPos(u));
      const x0 = Math.min(...xs.map(p => p.x));
      const x1 = Math.max(...xs.map(p => p.x)) + UNIT_W;
      return { x0: Math.round(x0), x1: Math.round(x1), center: Math.round((x0 + x1) / 2) };
    },
    unitRectInfo: (u) => unitRect(u),
    textureOfTape: (id) => {
      const s = getScene();
      const v = s?.tapeViews.get(id);
      if (!v) return null;
      return { face: v.face.texture.key, spine: v.spine.texture.key };
    },
    pilotArtState: () => {
      const s = getScene();
      return {
        art: !!s && (s as unknown as { pilotViews: { body: { texture: { key: string } } } | null }).pilotViews?.body.texture.key === 'tt-cabinet',
        atlasLoaded: !!s?.textures.exists('tt-cassette'),
        bodyTexture: (s as unknown as { pilotViews: { body: { texture: { key: string } } } | null })?.pilotViews?.body.texture.key ?? '',
      };
    },
    // failure recovery: one failing test must never poison the next one
    recover: () => {
      const s = getScene();
      if (!s) return;
      try { s.drag.cancel(); } catch { /* ignore */ }
      try { s.skills.cancelMarquee(); } catch { /* ignore */ }
      try { s.skills.clearSelection(); } catch { /* ignore */ }
      try {
        const repair = game.scene.getScene('Repair');
        if (repair && repair.scene.isActive()) {
          repair.scene.resume('Game');
          repair.scene.stop('Repair');
        }
      } catch { /* ignore */ }
      try { s.returningTape = false; } catch { /* ignore */ }
    },
  };

  (window as unknown as { __tidy: TidyDebug }).__tidy = api;
}
