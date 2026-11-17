// TIDEKEEPER skills.js - "Attunements": assist skills bought with pearls,
// plus the persisted keeper profile (pearls, xp, rank, stats, settings).
// Trust boundary: everything loaded from localStorage is merged over defaults.

const SAVE_KEY = 'tidekeeper.save.v1';

export const SKILLS = [
  {
    id: 'cradle', kind: 'passive', cost: 40, icon: 'wave',
    name: 'Cradle', desc: 'The current steadies your throws: +60% snap tolerance when filing motes into bells.',
  },
  {
    id: 'lantern', kind: 'passive', cost: 60, icon: 'glow',
    name: 'Lantern Hand', desc: 'While you hold a mote, its matching bell glows softly.',
  },
  {
    id: 'sense', kind: 'passive', cost: 80, icon: 'pulse',
    name: 'Tide Sense', desc: 'Bells that are waiting for the mote in your hand breathe with a slow pulse.',
  },
  {
    id: 'sip', kind: 'passive', cost: 120, icon: 'stack',
    name: 'Double Sip', desc: 'Carry two motes at once. Tap a second mote to stack it; each place drops the top one.',
  },
  {
    id: 'echo', kind: 'active', cost: 60, icon: 'sonar', cooldown: 14,
    name: 'Echo Pulse', desc: 'A sonar ring sweeps the grotto: for 4s every unfilled bell shows a drifting line toward its nearest matching mote.',
  },
  {
    id: 'riptide', kind: 'active', cost: 100, icon: 'swirl', cooldown: 18,
    name: 'Riptide', desc: 'Call a current: the loose pile swirls apart, uncovering motes buried underneath.',
  },
];

export const DEFAULT_PROFILE = {
  pearls: 0,
  xp: 0,
  owned: [],
  equippedP: [],   // up to 2 passive skill ids
  equippedA: null, // 1 active skill id
  expeditions: 0,  // completed count
  bestStreak: 0,
  log: [],         // last expedition codes
  settings: { master: 0.9, music: 0.8, sfx: 1, tapCarry: true, reduceMotion: false },
};

function deepMerge(base, saved) {
  const out = { ...base };
  for (const k of Object.keys(base)) {
    if (saved && saved[k] !== undefined) {
      out[k] = (typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]))
        ? deepMerge(base[k], saved[k]) : saved[k];
    }
  }
  return out;
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE, settings: { ...DEFAULT_PROFILE.settings } };
    const saved = JSON.parse(raw);
    const p = deepMerge(DEFAULT_PROFILE, saved);
    // sanitize lists against the known skill catalog
    const ids = new Set(SKILLS.map(s => s.id));
    p.owned = p.owned.filter(id => ids.has(id));
    p.equippedP = [...new Set(p.equippedP)].filter(id => p.owned.includes(id)).slice(0, 2);
    p.equippedA = p.owned.includes(p.equippedA) ? p.equippedA : null;
    p.log = Array.isArray(p.log) ? p.log.slice(-6) : [];
    p.pearls = Math.max(0, p.pearls | 0);
    p.xp = Math.max(0, p.xp | 0);
    p.expeditions = Math.max(0, p.expeditions | 0);
    return p;
  } catch (e) {
    return { ...DEFAULT_PROFILE, settings: { ...DEFAULT_PROFILE.settings } };
  }
}

export function saveProfile(p) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); } catch (e) { /* private mode: session-only */ }
}

export function rankFromXp(xp) { return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 40)); }
export function rankFloor(rank) { const r = rank - 1; return 40 * r * r; }
export function rankCeil(rank) { return 40 * rank * rank; }

export function canBuy(p, skill) { return !p.owned.includes(skill.id) && p.pearls >= skill.cost; }
export function buy(p, skill) {
  if (!canBuy(p, skill)) return false;
  p.pearls -= skill.cost;
  p.owned.push(skill.id);
  return true;
}
export function equip(p, skill) {
  if (!p.owned.includes(skill.id)) return false;
  if (skill.kind === 'passive') {
    const i = p.equippedP.indexOf(skill.id);
    if (i >= 0) p.equippedP.splice(i, 1);
    else { p.equippedP.push(skill.id); if (p.equippedP.length > 2) p.equippedP.shift(); }
  } else {
    p.equippedA = p.equippedA === skill.id ? null : skill.id;
  }
  return true;
}
export function has(p, id) { return p.equippedP.includes(id) || p.equippedA === id; }
