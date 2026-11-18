/**
 * Tidy Tapes — canonical pose system (v3 §1, globalized in v4).
 *
 * Every cassette view state has an EXPLICIT pose spec (texture, frame, display
 * size, origin, hit area). Transitions between poses never derive anything from
 * the previous sprite's current scale — that was the oversized-after-unshelving
 * bug (the v2 insert tween snapped a 208×144 face working at scale 0.5 to
 * `from:1` and left it there). All pose changes kill running tweens on the view
 * first and restore the exact loose dimensions + origin + hit area on
 * extraction, so three insert/remove cycles, extraction from any rack, and any
 * zoom level all end with the same resting size.
 *
 * v4 full-board rollout: ONE cassette template serves every combo in the new
 * art mode (canonical keys `tape-face-N` / `tape-turn-N` / `spine-N`); the
 * pre-rollout look stays available under `legacy-*` keys behind the settings
 * toggle. GEOMETRY IS IDENTICAL IN BOTH MODES — display sizes, origins and hit
 * areas below never depend on the toggle; only the pixels swap. The old
 * per-corner pilot atlas and its geometry special cases are retired.
 */
import Phaser from 'phaser';
import { SPINE_H, SPINE_W, SYMBOLS, unitOfRow } from './config';
import { artState } from './artState';
import {
  CASSETTE_LOOSE_DISPLAY, CASSETTE_TURN_DISPLAY, CASSETTE_TURN_ORIGIN,
} from './cassetteArt';
import type { Tape } from './types';
import type { TapeView } from './scenes/GameScene';

export interface PoseSpec {
  texture: string;
  frame?: string;
  w: number;
  h: number;
  origin: [number, number];
}

/** broad face up on the table (canonical loose size = existing footprint) */
export function looseSpec(combo: number): PoseSpec {
  return {
    texture: artState.pilotArt ? `tape-face-${combo}` : `legacy-tape-face-${combo}`,
    w: CASSETTE_LOOSE_DISPLAY.w, h: CASSETTE_LOOSE_DISPLAY.h,
    origin: [0.5, 0.5],
  };
}

/** edge-on seated spine; same slot scale for every cabinet in both art modes */
export function spineSpec(combo: number, _unit: number): PoseSpec {
  return {
    texture: artState.pilotArt ? `spine-${combo}` : `legacy-spine-${combo}`,
    w: SPINE_W, h: SPINE_H,
    origin: [0.5, 0.5],
  };
}

/** mid-insertion pose (new art: every combo; legacy: crossfade fallback) */
export function turnSpec(combo: number): PoseSpec | null {
  if (!artState.pilotArt) return null;
  return {
    texture: `tape-turn-${combo}`,
    w: CASSETTE_TURN_DISPLAY.w, h: CASSETTE_TURN_DISPLAY.h,
    origin: [...CASSETTE_TURN_ORIGIN] as [number, number],
  };
}

/** loose hit area (identical for every combo — grabbing is never art-dependent) */
export const LOOSE_HIT = { w: 92, h: 60 };
/** seated hit strip (same in every cabinet family since v4) */
export function seatedHit(_unit: number): { w: number; h: number } {
  return { w: SPINE_W, h: SPINE_H };
}

/** kill every tween touching this view before changing pose */
export function killPoseTweens(scene: Phaser.Scene, view: TapeView): void {
  scene.tweens.killTweensOf(view.container);
  scene.tweens.killTweensOf(view.face);
  scene.tweens.killTweensOf(view.spine);
  if (view.overlay) scene.tweens.killTweensOf(view.overlay);
}

function applyLooseHit(view: TapeView): void {
  view.container.setSize(LOOSE_HIT.w, LOOSE_HIT.h);
  view.container.setInteractive(
    new Phaser.Geom.Rectangle(-LOOSE_HIT.w / 2, -LOOSE_HIT.h / 2, LOOSE_HIT.w, LOOSE_HIT.h),
    Phaser.Geom.Rectangle.Contains,
  );
}

function applySeatedHit(view: TapeView, unit: number): void {
  const s = seatedHit(unit);
  view.container.setSize(s.w, s.h);
  view.container.setInteractive(
    new Phaser.Geom.Rectangle(-s.w / 2, -s.h / 2, s.w, s.h),
    Phaser.Geom.Rectangle.Contains,
  );
}

/** put the view into the canonical loose pose (exact size/origin/hit restore) */
export function setLoosePose(scene: Phaser.Scene, view: TapeView, tape: Tape): void {
  killPoseTweens(scene, view);
  const spec = looseSpec(tape.combo);
  const face = view.face;
  face.setTexture(spec.texture, spec.frame)
    .setDisplaySize(spec.w, spec.h)
    .setOrigin(spec.origin[0], spec.origin[1])
    .setPosition(0, 0)
    .setRotation(0)
    .setAlpha(1)
    .setVisible(true);
  view.spine.setVisible(false).setAlpha(1).setPosition(0, 0).setRotation(0);
  if (view.overlay) {
    view.overlay.setPosition(0, 0).setRotation(0)
      .setDisplaySize(LOOSE_HIT.w, LOOSE_HIT.h)
      .setVisible(tape.defect !== null && !tape.repaired);
  }
  view.container.setScale(1, 1).setRotation(tape.rot);
  applyLooseHit(view);
}

/** put the view into its seated pose for the given rack unit */
export function setSeatedPose(scene: Phaser.Scene, view: TapeView, tape: Tape, unit: number): void {
  killPoseTweens(scene, view);
  const spec = spineSpec(tape.combo, unit);
  const spine = view.spine;
  spine.setTexture(spec.texture, spec.frame)
    .setDisplaySize(spec.w, spec.h)
    .setOrigin(spec.origin[0], spec.origin[1])
    .setPosition(0, 0)
    .setRotation(0)
    .setAlpha(1)
    .setVisible(true);
  view.face.setVisible(false).setAlpha(1).setPosition(0, 0).setRotation(0);
  if (view.overlay) view.overlay.setVisible(false);
  view.container.setScale(1, 1).setRotation(0);
  applySeatedHit(view, unit);
}

/** symbol lookup helper shared with HUD labels */
export function symbolNameOf(combo: number): string {
  return SYMBOLS[combo % SYMBOLS.length];
}

/** re-export for callers that imported the old helper location */
export { unitOfRow };
