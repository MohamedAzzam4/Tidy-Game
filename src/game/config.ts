/**
 * Tidy Tapes — single source of constants (game feel numbers live here).
 * Pure data: no Phaser imports (unit-testable).
 *
 * v3 geometry deltas:
 *  - the north bank (8 units, 2 rows of 4) is centered between the side banks:
 *    whole-bank span 3·280+240 = 1080 → x0 = 860 (span 860..1940, center 1400).
 *  - the right bank is respaced so unit 12 hosts the walnut art-pilot cabinet
 *    (bigger footprint); logical row ids / groups / capacities are unchanged.
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

/** 4 clear symbols per color (v2: no 8-shape variants just to inflate count). */
export const SYMBOLS: string[] = ['star', 'heart', 'moon', 'bolt'];

export const GROUPS = COLORS.length * SYMBOLS.length; // 32
export const ROWS_PER_GROUP = 2;
export const SLOTS_PER_ROW = 8;
export const ROWS = GROUPS * ROWS_PER_GROUP; // 64 labeled rows
export const ROWS_PER_UNIT = 4;
export const UNITS = ROWS / ROWS_PER_UNIT; // 16 rack units

export const WORLD_W = 2800;
export const WORLD_H = 1800;

// --- rack unit geometry (logical, top-face plane) ---
export const UNIT_W = 240;
export const UNIT_H = 184;          // label strip + 4 channels + south lip + front face
export const CHIP_W = 28;           // row label chip (color + symbol) at row start
export const SLOT_PITCH = 24;       // logical distance between slot centers
export const SLOT0_X = 50;          // local x of slot 0 center
export const ROW_CH_TOP = 30;       // local y of channel top for row 0
export const ROW_CH_H = 30;         // channel height (spine 16x28 lives inside)
export const ROW_PITCH = 36;        // vertical pitch between rows
export const UNIT_FRONT_H = 8;      // baked extruded front face height

/** Local y center of the channel of local row `lr` (0..3). */
export const rowLocalY = (lr: number): number => ROW_CH_TOP + lr * ROW_PITCH + ROW_CH_H / 2;

// --- tape geometry ---
export const TAPE_W = 92;
export const TAPE_H = 60;
export const SPINE_W = 16;
export const SPINE_H = 28;

// --- banks (deterministic, not seeded) ---
// units 0..7  : north bank (2 rows of 4), WHOLE-BANK CENTERED (v3 §2):
//               span = 3*BACK.dx + UNIT_W = 1080, x0 = (WORLD_W-1080)/2 = 860
// units 8..11 : left bank  (1 column of 4)
// units 12..15: right bank — unit 12 is the walnut art-pilot cabinet (v3 §3)
const BACK = { x0: 860, y0: 140, dx: 280, dy: 220 };
const SIDE = { xL: 140, xR: 2400, y0: 620, dy: 220 };
/** right-bank tops: walnut (tall) + three respaced fallback units */
const RIGHT_TOPS = [560, 1064, 1294, 1524];

// ------------------------------------------------------------------ art pilot
/**
 * v3 §3 — one-corner graphics + lighting pilot. Unit 12 (teal cabinet B in the
 * right bank) renders with the uploaded walnut cabinet art; teal-star tapes
 * (combo 16) use the uploaded cassette atlas poses. Everything else keeps the
 * procedural fallback art. All numbers derive from the pack's scene-layout.json
 * (art px) mapped through CAB_SCALE.
 */
export const ART_PILOT = {
  enabled: true,                    // runtime toggle for before/after comparison
  unit: 12,
  combo: 4 * 4 + 0,                  // teal star = colorIdx 4 × 4 symbols + star
  topleft: { x: 2400, y: 560 },
  cabScale: 0.378,                   // 835×1252 art → 316×473.7 world
  /** cabinet body art size (scene-layout source_width/height) */
  art: { w: 835, h: 1252 },
  /** usable slot-center x span in art px (scene-layout) */
  slotSpan: [110, 690] as [number, number],
  /** seat y per row in art px (scene-layout rows[].seat_y) */
  seats: [361, 627, 897, 1161],
  /** foreground lip overlay top-left per row in art px */
  lips: [[62, 356], [62, 622], [62, 892], [62, 1156]] as [number, number][],
  /** cassette anchors from scene-layout (normalized per frame) */
  anchors: {
    loose: [0.5, 0.51] as [number, number],
    turn: [0.226, 0.868] as [number, number],
    spine: [0.5, 0.973] as [number, number],
  },
  /** cassette pose display sizes in world px (tuned; loose = existing footprint) */
  poses: {
    loose: { w: 104, h: 71.9 },
    turn: { w: 42.9, h: 87.2 },
    spine: { w: 20.6, h: 85 },
  },
  /** seated fallback spines inside the walnut read taller (compartment scale) */
  fallbackSpineInPilot: { w: 16, h: 56 },
  /** brass lamp, upper-left of the test corner */
  lamp: { x: 2245, y: 430, w: 150, h: 180 },
  /** scene-layout lighting starting values */
  light: {
    ambient: 0x32221e, ambientAlpha: 0.12,
    lampPoolAlpha: 0.36, bulbHaloAlpha: 0.28, contactShadowAlpha: 0.5,
    falloffAlpha: 0.1, cornerVignetteAlpha: 0.1,
  },
  /** walnut surface inlay wing (right wing of the bench) + rim trim */
  inlay: { x0: 2200, y0: 0, x1: WORLD_W, y1: 1750 },
  /** pilot corner bounds: hover-nudge eligibility + before/after shot area */
  region: { x0: 1950, y0: 100, x1: WORLD_W - 10, y1: 1150 },
} as const;

export function isPilotUnit(u: number): boolean {
  // geometry is ALWAYS the walnut footprint (row ids/capacities unchanged) —
  // the runtime art toggle only swaps textures, never the slot math
  return u === ART_PILOT.unit;
}

/** world size of the walnut cabinet */
export function pilotUnitRect(): { x: number; y: number; w: number; h: number } {
  return {
    x: ART_PILOT.topleft.x, y: ART_PILOT.topleft.y,
    w: ART_PILOT.art.w * ART_PILOT.cabScale, h: ART_PILOT.art.h * ART_PILOT.cabScale,
  };
}

/** art px → world px inside the walnut cabinet */
function cabWorld(artX: number, artY: number): { x: number; y: number } {
  return {
    x: ART_PILOT.topleft.x + artX * ART_PILOT.cabScale,
    y: ART_PILOT.topleft.y + artY * ART_PILOT.cabScale,
  };
}

/** slot center in art px (8 centers across the usable span) */
function pilotSlotArtX(k: number): number {
  const [a, b] = ART_PILOT.slotSpan;
  return a + (k * (b - a)) / (SLOTS_PER_ROW - 1);
}

export function unitPos(u: number): { x: number; y: number } {
  if (u < 8) {
    const col = u % 4;
    const bankRow = Math.floor(u / 4);
    return { x: BACK.x0 + col * BACK.dx, y: BACK.y0 + bankRow * BACK.dy };
  }
  if (u < 12) {
    return { x: SIDE.xL, y: SIDE.y0 + (u - 8) * SIDE.dy };
  }
  // right bank: unit 12 hosts the walnut pilot; 13..15 respaced below it
  const i = u - 12;
  return { x: SIDE.xR, y: RIGHT_TOPS[i] };
}

/** rowId (0..63) → owning unit. Rows 4u..4u+3 belong to unit u. */
export function unitOfRow(row: number): number { return Math.floor(row / ROWS_PER_UNIT); }

/**
 * rowId → group. Row r lives in unit u=floor(r/4); the 4 rows of a unit are four
 * DIFFERENT groups (r % 32) — the four symbol rows of one color (a physical
 * cabinet). Group g therefore owns rows g and g+32 — always in two different
 * units, in different banks. Either row is equally valid for every tape of the
 * group; no per-tape assignment exists.
 */
export function groupOfRow(row: number): number { return row % GROUPS; }

/** The two row ids that accept group `g`. */
export function rowsOfGroup(g: number): number[] { return [g % ROWS, (g + GROUPS) % ROWS]; }

export function rowRect(row: number): { x: number; y: number; w: number; h: number } {
  const u = unitOfRow(row);
  if (isPilotUnit(u)) {
    const lr = row % ROWS_PER_UNIT;
    const lip = ART_PILOT.lips[lr];
    const seat = ART_PILOT.seats[lr];
    const tl = cabWorld(lip[0], seat - 176);
    return {
      x: tl.x, y: tl.y,
      w: 678 * ART_PILOT.cabScale, h: 214 * ART_PILOT.cabScale,
    };
  }
  const p = unitPos(u);
  const lr = row % ROWS_PER_UNIT;
  return { x: p.x + 6, y: p.y + ROW_CH_TOP + lr * ROW_PITCH - 4, w: UNIT_W - 12, h: ROW_CH_H + 8 };
}

export function unitRect(u: number): { x: number; y: number; w: number; h: number } {
  if (isPilotUnit(u)) return pilotUnitRect();
  const p = unitPos(u);
  return { x: p.x, y: p.y, w: UNIT_W, h: UNIT_H };
}

/** World-space center of slot `k` (0..7) in row `row`. */
export function slotPos(row: number, k: number): { x: number; y: number } {
  const u = unitOfRow(row);
  if (isPilotUnit(u)) {
    const lr = row % ROWS_PER_UNIT;
    return cabWorld(pilotSlotArtX(k), ART_PILOT.seats[lr]);
  }
  const p = unitPos(u);
  const lr = row % ROWS_PER_UNIT;
  return { x: p.x + SLOT0_X + k * SLOT_PITCH, y: p.y + rowLocalY(lr) };
}

// --- board population (derived from combined row capacity) ---
export const GROUP_CAPACITY = ROWS_PER_GROUP * SLOTS_PER_ROW; // 16
export const GROUP_FILL_MIN = 0.7;   // seeded fill fraction per group
export const GROUP_FILL_MAX = 1.0;
export const TOTAL_MIN = 405;       // top-up until the board holds at least this many
export const DEFECT_RATE = 0.11;

/** Center region that must stay populated across seeds (validation checks it). */
export const CENTER = { x: 700, y: 620, w: 1400, h: 900 };
export const CENTER_MIN_TAPES = 60;

// --- repair bench (world rect, front-left) ---
export const BENCH = { x: 140, y: 1560, w: 360, h: 200 };
export function benchRect(): { x: number; y: number; w: number; h: number } {
  return { x: BENCH.x, y: BENCH.y, w: BENCH.w, h: BENCH.h };
}
/** marked landing spot for repaired tapes (v3 §7) */
export const RETURN_SPOT = { x: 600, y: 1662 };
/** where a repaired tape pops out of the repair view (bench top edge) */
export const RETURN_FROM = { x: 340, y: 1572 };

// --- skills & powers ---
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
export const TRAY_SLOTS = 5;

// --- v3 input scheme (§5) ---
export const CLICK_MOVE_THRESHOLD = 5;      // px before a press becomes a drag
export const DOUBLE_CLICK_MS = 320;          // same-tape double click window
export const DEFERRED_CLICK_MS = 240;        // single-click actions wait for this
export const REPAIR_KEY = 'R';               // rebind of the old double-click repair-open

// --- v3 milestones (§4) ---
export const ROW_PULSE_MS = 650;

// --- v3 hover nudge (§9) ---
export const NUDGE = {
  tiltDeg: 1.0,
  offsetX: 1.6,
  offsetY: 1.2,
  outMs: 70,
  backMs: 150,          // ease-back portion; total ≈ out+back ≈ 150–220 ms
  retriggerGuardMs: 350,
  minSpeed: 0.22,       // px/ms — "a moving cursor"
  cell: 96,             // spatial-hash cell size
} as const;

// --- insertion feel knobs (tune by feel) ---
export const INSERT_ALIGN_MS = 90;
export const INSERT_TURN_MS = 110;
export const INSERT_SLIDE_MS = 140;
export const INSERT_STAGGER_MS = 110;

// --- camera ---
export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 2.0;

// --- carry tray (screen-fixed, bottom-right; same rect in Game & UI scenes) ---
export const TRAY = { w: 304, h: 88, margin: 14 };
export function trayScreenRect(scaleW: number, scaleH: number): { x: number; y: number; w: number; h: number } {
  return { x: scaleW - TRAY.margin - TRAY.w, y: scaleH - TRAY.margin - TRAY.h, w: TRAY.w, h: TRAY.h };
}

// --- misc ---
export const SAVE_KEY = 'tidy-tapes-save-v3';
export const SAVE_KEY_V2 = 'tidy-tapes-save-v2';
export const SAVE_KEY_V1 = 'tidy-tapes-save-v1';

/** group helpers — group = colorIdx * 4 + symbolIdx */
export function colorIdxOf(combo: number): number { return Math.floor(combo / SYMBOLS.length); }
export function symbolIdxOf(combo: number): number { return combo % SYMBOLS.length; }
export function comboOf(colorIdx: number, symbolIdx: number): number {
  return colorIdx * SYMBOLS.length + symbolIdx;
}
