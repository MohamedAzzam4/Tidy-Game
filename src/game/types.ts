/** Tidy Tapes — shared types (pure data, no Phaser). */

export type DefectType = 'rewind' | 'sticker' | 'paint';

export type TapeState = 'loose' | 'shelved';

/** Full runtime record for one tape. Truth lives here; sprites are views. */
export interface Tape {
  id: number;            // unique per run, 0..N-1
  combo: number;         // colorIdx*8 + symbolIdx, 0..63
  defect: DefectType | null; // exactly one defect on defective tapes
  repaired: boolean;     // defect fixed (true when defect == null)
  state: TapeState;
  x: number;             // world position when loose
  y: number;
  rot: number;           // radians, loose display rotation
  slot: number | null;   // slot index when shelved
}

/** One organizer rack (fixed world geometry, one per combo). */
export interface Rack {
  combo: number;
  slots: (number | null)[]; // tape id or null, length RACK_SLOTS
}

export interface WorldData {
  seed: number;
  worldW: number;
  worldH: number;
  totalTapes: number;
  tapes: Tape[];
  racks: Rack[];
}

/** Serialized run (localStorage payload). */
export interface SaveFile {
  version: 1;
  seed: number;
  savedAt: number;
  tapes: Array<{
    id: number; combo: number; defect: DefectType | null; repaired: boolean;
    state: TapeState; x: number; y: number; rot: number; slot: number | null;
  }>;
  skills: Record<string, boolean>;
  powers: Record<string, { unlocked: boolean; activeUntil: number; cooldownUntil: number }>;
  playSeconds: number;
}

export type SkillId = 'scanner' | 'guide' | 'misplaced' | 'marquee' | 'matchScan' | 'matchGather';
