/**
 * Tide & Tidy — shared world & model types. Pure data, no DOM types.
 *
 * Mechanic mapping from the reference game (Filing Good: Tidy Up, demo):
 *   sheet → binder (symbol + number)  ≙  critter → specimen jar (species + tag)
 *   binder → shelf slot (symbol)      ≙  sealed jar → cubby (species glyph)
 *
 * World units are abstract canvas units (≈ metres of beach). The renderer maps
 * them through a pan/zoom camera; no screen-space values live here.
 */

/** One sea-treasure species. `glyph` selects the procedural painter used for
 *  critter, jar tag and cubby marking; `hue` is the palette anchor (0-360). */
export interface SpeciesDef {
  id: string;
  label: string;
  hue: number;
  glyph: 'star' | 'shell' | 'jelly' | 'crab' | 'glass' | 'dollar' | 'clam' | 'urchin' | 'float' | 'conch' | 'anemone' | 'ring';
  /** Visual size class 0.8-1.6 (critter radius in world units at scale 1). */
  size: number;
}

/** Difficulty/volume preset. Grid = cubby wall arrangement. */
export interface ScaleDef {
  id: 'drift' | 'ebb' | 'undertow';
  label: string;
  blurb: string;
  gridCols: number;
  gridRows: number;
  jarsPerSpecies: number;
  jarCapacity: number;
}

/** One specimen jar. It is uniquely identified by species + 1-based tag —
 *  exactly the "symbol and number" identity of a binder in the reference. */
export interface JarDef {
  id: string;
  species: string;
  tag: number;
  capacity: number;
}

/** One movable sea critter. Belongs to exactly one jar (species + tag). */
export interface CritterDef {
  id: string;
  species: string;
  jarId: string;
  /** Rare shimmering variant — the variable-ratio reward (~1 in 25). */
  golden: boolean;
}

/** A wall niche that accepts any sealed jar of its species. */
export interface CubbyDef {
  id: string;
  species: string;
  col: number;
  row: number;
}

export interface ScatterPos {
  x: number;
  y: number;
  rot: number;
}

/** Seeded decor (pebbles, foam flecks, lanterns) so a tide code reproduces
 *  the whole picture, not just the playable items. */
export interface Decor {
  pebbles: Array<{ x: number; y: number; r: number; hue: number }>;
  shells: Array<{ x: number; y: number; rot: number; hue: number }>;
  lanterns: Array<{ x: number; y: number }>;
}

/** Full generated world for one tide (one run). */
export interface World {
  seed: number;
  scale: ScaleDef;
  species: SpeciesDef[];
  jars: JarDef[];
  critters: CritterDef[];
  cubbies: CubbyDef[];
  /** Loose critter scatter on the shore, keyed by critter id. */
  scatter: Record<string, ScatterPos>;
  /** Loose jar scatter, keyed by jar id. */
  jarScatter: Record<string, ScatterPos>;
  /** Shore band where loose things live. */
  shore: { x: number; y: number; w: number; h: number };
  /** Driftwood cubby wall band (right side of the world). */
  wall: { x: number; y: number; w: number; h: number };
  decor: Decor;
}

/** Events the model emits; the view/audio layer consumes and clears them. */
export type GameEvent =
  | { t: 'filed'; critterId: string; jarId: string; fillIndex: number; golden: boolean }
  | { t: 'wrong'; jarId: string }
  | { t: 'bounce'; critterId?: string; jarId?: string }
  | { t: 'sealed'; jarId: string; species: string }
  | { t: 'shelved'; jarId: string; cubbyId: string; speciesDone: boolean }
  | { t: 'streak'; n: number }
  | { t: 'xp'; amount: number; total: number; level: number }
  | { t: 'unlock'; skillId: import('./skills').SkillId }
  | { t: 'lore'; line: string }
  | { t: 'hint'; text: string }
  | { t: 'complete'; stats: RunStats };

export interface RunStats {
  elapsedMs: number;
  mistakes: number;
  goldenFound: number;
  bestStreak: number;
  crittersFiled: number;
  jarsSealed: number;
  jarsShelved: number;
}

/** What the player is currently holding — critters or one jar, never both
 *  (the "hand" mirrors carrying a binder after filling it). */
export type Held =
  | { kind: 'critters'; ids: string[] }
  | { kind: 'jar'; id: string }
  | { kind: 'none' };

