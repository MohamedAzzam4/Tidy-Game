/**
 * Tidy Tapes — debug/test bridge (window.__tidy). Dev + test harness only;
 * exposes read-only introspection plus a few explicitly-throwing test helpers.
 */
import type Phaser from 'phaser';
import type { GameScene } from './scenes/GameScene';
import { validateWorld } from './validation';
import { audio } from './audio';

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
  repairsLeft(): number;
  worldSize(): { w: number; h: number };
  camera(): { x: number; y: number; zoom: number; viewW: number; viewH: number };
  setCamera(x: number, y: number, zoom?: number): void;
  tapesInfo(): Array<{ id: number; combo: number; state: string; defect: string | null; repaired: boolean; x: number; y: number; slot: number | null }>;
  validation(): { ok: boolean; issues: string[] };
  skills(): Record<string, boolean>;
  powers(): Record<string, { unlocked: boolean; activeUntil: number; cooldownUntil: number }>;
  selection(): number[];
  held(): number[];
  newGame(seed?: number): void;
  shelve(count: number, combo?: number): number;
  setTapePos(id: number, x: number, y: number): void;
  openRepair(tapeId: number): void;
  repairOpen(): boolean;
  activatePower(name: 'matchScan' | 'matchGather'): boolean;
  forceExpirePower(name: 'matchScan' | 'matchGather'): void;
  save(): boolean;
  exportState(): unknown;
  audioRecent(): string[];
  completed(): boolean;
  resize(w: number, h: number): void;
  scanInfo(): { target: number | null; count: number };
}

export function installDebug(game: Phaser.Game): void {
  const getScene = (): GameScene | null => {
    const s = game.scene.getScene('Game') as GameScene | null;
    return s && s.scene.isActive() ? s : null;
  };

  const api: TidyDebug = {
    ready: true,
    seed: () => getScene()?.seed ?? -1,
    tapeCount: () => getScene()?.world.tapes.length ?? -1,
    uniqueIds: () => new Set(getScene()?.world.tapes.map(t => t.id) ?? []).size,
    totalTapes: () => getScene()?.world.totalTapes ?? -1,
    shelved: () => getScene()?.sortedCount ?? -1,
    loose: () => getScene()?.world.tapes.filter(t => t.state === 'loose').length ?? -1,
    repairsLeft: () => getScene()?.world.tapes.filter(t => t.defect && !t.repaired).length ?? -1,
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
    tapesInfo: () => (getScene()?.world.tapes ?? []).map(t => ({
      id: t.id, combo: t.combo, state: t.state, defect: t.defect, repaired: t.repaired,
      x: t.x, y: t.y, slot: t.slot,
    })),
    validation: () => {
      const s = getScene();
      if (!s) return { ok: false, issues: ['no scene'] };
      return validateWorld(s.world);
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
    newGame: (seed) => getScene()?.newGame(seed),
    shelve: (count, combo) => getScene()?.debugShelve(count, combo) ?? -1,
    setTapePos: (id, x, y) => getScene()?.debugSetTapePos(id, x, y),
    openRepair: (tapeId) => {
      const s = getScene();
      if (!s) return;
      const t = s.world.tapes.find(x => x.id === tapeId);
      if (t && t.defect && !t.repaired) s.skills.openRepair(tapeId);
    },
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
    audioRecent: () => getScene() ? audioRecentNames() : [],
    completed: () => getScene()?.completionShown ?? false,
    resize: (w, h) => getScene()?.resizeForTest(w, h),
    scanInfo: () => {
      const s = getScene();
      return { target: s?.skills.lastScanTarget ?? null, count: s?.skills.lastScanMatchCount ?? 0 };
    },
  };

  (window as unknown as { __tidy: TidyDebug }).__tidy = api;
}
