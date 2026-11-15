import type { RoomDef } from '../game/types';

/**
 * One shared isometric projection used by the floor, the walls, every piece
 * of furniture, every object anchor and every destination slot, so all of
 * them agree.
 *
 * True isometric: the two room axes slope ±30° on screen, vertical edges stay
 * vertical, and there is no perspective convergence. The camera looks into
 * the open front corner (width, depth); the two rear walls are at x = 0 and
 * y = 0.
 */
export const ISO_COS = Math.cos(Math.PI / 6); // ≈ 0.8660 → 30° slope
export const ISO_SIN = 0.5;

export interface Projector {
  /** World (x, y, z) → SVG screen units. */
  toScreen(x: number, y: number, z?: number): { x: number; y: number };
  /** SVG screen units → world floor plane (z = 0). Inverse of toScreen at z 0. */
  toFloor(sx: number, sy: number): { x: number; y: number };
  /** Painter's-algorithm depth key: larger = closer to the viewer. */
  depth(x: number, y: number): number;
  viewBox: { minX: number; minY: number; width: number; height: number };
}

export function createProjector(room: RoomDef, margin = 0.9): Projector {
  const c = ISO_COS;
  const s = ISO_SIN;

  const toScreen = (x: number, y: number, z = 0) => ({
    x: (x - y) * c,
    y: (x + y) * s - z,
  });

  const toFloor = (sx: number, sy: number) => {
    const a = sx / c; // x - y
    const b = sy / s; // x + y
    return { x: (a + b) / 2, y: (b - a) / 2 };
  };

  const minX = -room.depth * c - margin;
  const maxX = room.width * c + margin;
  const minY = -room.wallHeight - margin;
  const maxY = (room.width + room.depth) * s + margin;

  return {
    toScreen,
    toFloor,
    depth: (x, y) => x + y,
    viewBox: { minX, minY, width: maxX - minX, height: maxY - minY },
  };
}
