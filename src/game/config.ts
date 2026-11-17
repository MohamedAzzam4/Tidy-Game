/**
 * Tidy Tapes — single source of constants (game feel numbers live here).
 * Pure data: no Phaser imports (unit-testable).
 */

export const COLORS: { name: string; css: string; ink: string }[] = [
  { name: 'cherry', css: '#d94f4f', ink: '#f6efdd' },
  { name: 'tangerine', css: '#e58a3c', ink: '#f6efdd' },
  { name: 'honey', css: '#e3c04b', ink: '#4a3b23' },
  { name: 'meadow', css: '#7bb661', ink: '#f6efdd' },
  { name: 'teal', css: '#4fa3a5', ink: '#f6efdd' },
  { name: 'sky', css: '#5a8fd6', ink: '#f6efdd' },
  { name: 'plum', css: '#9a6fc0', ink: '#f6efdd' },
  { name: 'bubblegum', css: '#e38fb8', ink: '#4a3b23' },
];

export const SYMBOLS: string[] = [
  'star', 'heart', 'moon', 'sun', 'note', 'flower', 'bolt', 'rainbow',
];

export const COMBO_COUNT = COLORS.length * SYMBOLS.length; // 64

export const WORLD_W = 4400;
export const WORLD_H = 3000;

// Racks: 8x8 grid, column = symbol, row = shell color.
export const RACK_COLS = 8;
export const RACK_ROWS = 8;
export const RACK_GAP_X = 420;
export const RACK_GAP_Y = 250;
export const RACK_ORIGIN = { x: 640, y: 560 };

export const RACK_W = 156;      // visual box incl. padding
export const RACK_H = 92;       // slots area + header strip
export const RACK_SLOTS = 8;    // capacity per (color, symbol) combo

export const TAPE_W = 92;
export const TAPE_H = 60;
export const SPINE_W = 14;
export const SPINE_H = 60;

// Default run size: 64 combos x 8 tapes = 512 (>= 400 always). Rack capacity is
// exactly 8, so every group fits its rack precisely — including the acceptance
// scenario "a row with only three free slots" (shelve 5 of a combo => 3 free,
// 3 loose of that combo remain to be carried as a batch).
export const TAPE_BASE_PER_COMBO = 8;
export const TAPE_EXTRAS_MIN = 0;
export const TAPE_EXTRAS_MAX = 0;

export const DEFECT_RATE = 0.11;

// Repair bench mat zone (world rect).
export const BENCH = { x: 150, y: 1150, w: 380, h: 700 };

// Skill unlock milestones (shelved count) — all < 406 so all obtainable in one run.
export const SKILL_THRESHOLDS = {
  scanner: 10,
  guide: 20,
  misplaced: 35,
  marquee: 40,
  matchScan: 120,
  matchGather: 200,
} as const;

export const POWER_ACTIVE_MS = 15_000;
export const POWER_COOLDOWN_MS = 60_000;
export const MARQUEE_CAP = 5;
export const GATHER_CAP = 9; // total held bundle cap for Match Gather

export const SAVE_KEY = 'tidy-tapes-save-v1';

export const ZOOM_MIN = 0.55;
export const ZOOM_MAX = 1.6;

/** combo index helpers — combo = colorIdx * 8 + symbolIdx */
export function colorIdxOf(combo: number): number { return Math.floor(combo / SYMBOLS.length); }
export function symbolIdxOf(combo: number): number { return combo % SYMBOLS.length; }
export function comboOf(colorIdx: number, symbolIdx: number): number {
  return colorIdx * SYMBOLS.length + symbolIdx;
}

/** Rack top-left world position for a combo. */
export function rackPos(combo: number): { x: number; y: number } {
  return {
    x: RACK_ORIGIN.x + symbolIdxOf(combo) * RACK_GAP_X,
    y: RACK_ORIGIN.y + colorIdxOf(combo) * RACK_GAP_Y,
  };
}

/** World-space center of slot `slot` (0 = leftmost) for a combo's rack. */
export function slotPos(combo: number, slot: number): { x: number; y: number } {
  const r = rackPos(combo);
  const pitch = (RACK_W - 16) / RACK_SLOTS;
  const innerX = r.x + 8 + slot * pitch + pitch / 2;
  const slotY = r.y + 22 + 6 + SPINE_H / 2;
  return { x: innerX, y: slotY };
}

export function rackRect(combo: number): { x: number; y: number; w: number; h: number } {
  const p = rackPos(combo);
  return { x: p.x, y: p.y, w: RACK_W, h: RACK_H };
}

export function benchRect(): { x: number; y: number; w: number; h: number } {
  return { x: BENCH.x, y: BENCH.y, w: BENCH.w, h: BENCH.h };
}
