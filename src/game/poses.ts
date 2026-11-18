/**
 * Tidy Tapes — canonical pose system (v3 §1).
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
 * Two art families share this system:
 *  - procedural fallback (tape-face-N / spine-N) for all combos, and
 *  - the uploaded teal-star atlas (loose / turn / spine frames) for the art
 *    pilot combo when it sits in the walnut cabinet (other rows of that cabinet
 *    keep fallback spines at the taller pilot display size).
 */
import Phaser from 'phaser';
import {
  ART_PILOT, SPINE_H, SPINE_W, SYMBOLS, isPilotUnit, unitOfRow,
} from './config';
import { artState } from './artState';
import type { Tape } from './types';
import type { TapeView } from './scenes/GameScene';

export interface PoseSpec {
  texture: string;
  frame?: string;
  w: number;
  h: number;
  origin: [number, number];
}

/** texture keys of the uploaded atlas */
export const PILOT_ATLAS = 'tt-cassette';

export function pilotCombo(): number { return ART_PILOT.combo; }
export function usesPilotLooseArt(combo: number): boolean {
  return artState.pilotArt && combo === ART_PILOT.combo;
}
export function usesPilotSpineArt(combo: number, unit: number): boolean {
  return artState.pilotArt && combo === ART_PILOT.combo && isPilotUnit(unit);
}

/** broad face up on the table (canonical loose size = existing footprint) */
export function looseSpec(combo: number): PoseSpec {
  if (usesPilotLooseArt(combo)) {
    return {
      texture: PILOT_ATLAS, frame: 'loose',
      w: ART_PILOT.poses.loose.w, h: ART_PILOT.poses.loose.h,
      origin: [...ART_PILOT.anchors.loose] as [number, number],
    };
  }
  return { texture: `tape-face-${combo}`, w: 104, h: 72, origin: [0.5, 0.5] };
}

/** edge-on seated spine; taller inside the walnut cabinet (per-cabinet pose) */
export function spineSpec(combo: number, unit: number): PoseSpec {
  if (isPilotUnit(unit)) {
    if (usesPilotSpineArt(combo, unit)) {
      return {
        texture: PILOT_ATLAS, frame: 'spine',
        w: ART_PILOT.poses.spine.w, h: ART_PILOT.poses.spine.h,
        origin: [...ART_PILOT.anchors.spine] as [number, number],
      };
    }
    // fallback spines inside the walnut read at the compartment scale
    const s = ART_PILOT.fallbackSpineInPilot;
    return { texture: `spine-${combo}`, w: s.w, h: s.h, origin: [0.5, 0.973] };
  }
  return { texture: `spine-${combo}`, w: SPINE_W, h: SPINE_H, origin: [0.5, 0.5] };
}

/** mid-insertion pose (pilot art only; fallback crossfades face→spine instead) */
export function turnSpec(combo: number): PoseSpec | null {
  if (!usesPilotLooseArt(combo)) return null;
  return {
    texture: PILOT_ATLAS, frame: 'turn',
    w: ART_PILOT.poses.turn.w, h: ART_PILOT.poses.turn.h,
    origin: [...ART_PILOT.anchors.turn] as [number, number],
  };
}

/** loose hit area (identical for every combo — grabbing is never art-dependent) */
export const LOOSE_HIT = { w: 92, h: 60 };
/** seated hit strip height per cabinet family */
export function seatedHit(unit: number): { w: number; h: number } {
  if (isPilotUnit(unit)) {
    return { w: Math.max(20, SPINE_W + 6), h: 64 };
  }
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
