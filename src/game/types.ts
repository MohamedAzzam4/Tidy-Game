/** Tidy Tapes — shared types (pure data, no Phaser). v2: rows + tray. */

export type DefectType = 'rewind' | 'sticker' | 'paint';

export type TapeState = 'loose' | 'shelved' | 'tray';

/** Defects that block filing (visible damage, public information — not a hidden
 *  correctness tell). Paint is a cosmetic scuff: fileable, optionally fixable. */
export function defectBlocksFiling(defect: DefectType | null): boolean {
  return defect === 'rewind' || defect === 'sticker';
}

/** Full runtime record for one tape. Truth lives here; sprites are views. */
export interface Tape {
  id: number;            // unique per run, 0..N-1
  combo: number;         // group id = colorIdx*4 + symbolIdx, 0..31
  defect: DefectType | null; // exactly one defect on defective tapes
  repaired: boolean;     // defect fixed (true when defect == null)
  state: TapeState;
  x: number;             // world position when loose
  y: number;
  rot: number;           // radians, loose display rotation
  row: number | null;    // rowId when shelved (ANY row physically; win checks labels)
  slot: number | null;   // slot index 0..7 within the row
}

/** One labeled storage row (8 slots). Rows are the only storage truth. */
export interface Row {
  id: number;            // 0..63
  group: number;         // label: which color+symbol this row collects
  unit: number;          // owning rack unit
  slots: (number | null)[]; // tape ids, length SLOTS_PER_ROW
}

export interface WorldData {
  seed: number;
  worldW: number;
  worldH: number;
  totalTapes: number;
  tapes: Tape[];
  rows: Row[];
}

/** Serialized run (localStorage payload). v3 = v2 fields + cabinet milestones + settings. */
export interface SaveSettings {
  sound: boolean;
  hoverFx: boolean;
  pilotArt: boolean;
  reducedMotion: boolean;
}

export interface SaveFile {
  version: 2 | 3;
  seed: number;
  savedAt: number;
  tapes: Array<{
    id: number; combo: number; defect: DefectType | null; repaired: boolean;
    state: TapeState; x: number; y: number; rot: number; row: number | null; slot: number | null;
  }>;
  tray: (number | null)[];    // ordered tray slots, tape ids
  skills: Record<string, boolean>;
  powers: Record<string, { unlocked: boolean; activeUntil: number; cooldownUntil: number }>;
  playSeconds: number;
  /** v3: permanently-granted cabinet completion achievements (unit ids) */
  achievements?: number[];
  /** v3: counters + settings (sound/hover/pilot toggles, reduced motion) */
  milestones?: { rows: number; cabinets: number };
  settings?: Partial<SaveSettings>;
}

export type SkillId = 'scanner' | 'guide' | 'misplaced' | 'marquee' | 'matchScan' | 'matchGather';
