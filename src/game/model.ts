/**
 * Tide & Tidy game model — pure rules, no DOM, no timers. The view does
 * spatial hit-testing (it owns coordinates) and calls these methods; every
 * mutation appends events (types.ts GameEvent) that view/audio consume.
 *
 * Two-stage mechanic, matching the reference game's sheet→binder→shelf:
 *   file critters into their exact jar (species + tag), then shelve the
 *   sealed jar into any cubby carrying that species glyph. No fail state —
 *   mistakes are feedback (streak resets), never loss.
 */
import type { CritterDef, GameEvent, Held, JarDef, RunStats, World } from './types';
import { levelFromXp, SKILL_DEFS, SKILL_IDS, type SkillId } from './skills';

/** Lore drops (the reference community asked for more of these) — one line
 *  per 5th shelved jar and one at the finale, in order. */
export const LORE: string[] = [
  'The hut keeper logs every tide. Nobody remembers who reads the ledgers — that was never the point.',
  'Rule one of the shore: what the sea scatters, someone will sort. It has always been so.',
  'The jars were a gift from a ship that never docked. They hold everything except grudges.',
  'Some nights the lanterns light themselves. The keeper stopped questioning it around the third winter.',
  'A golden pearl is the tide saying thank you. It does not explain further.',
  'The cubbies are carved from one broken hull. The wood still hums in storms.',
  'Ledger fragment: "sorted 768 shells today. the silence had weight, like a good blanket."',
  'The hermit crabs hold elections. The ballots are pebbles. Turnout is excellent.',
  'Tide code, scratched beside the door: the same mess can be visited twice, like a dream.',
  'The keeper says a filled jar sounds different from an empty one. Filing is listening, if you try.',
  'Moon jellies are kept in the cool shelf. They dream in slow colors.',
  'Every shell here was lost by something. Sorting gives the losing a shape.',
  'The gull has opinions about the kelp. It files complaints by screaming near shelf four.',
  'Ledger fragment: "a stranger left a jar of glass that is not glass. it hums when it rains."',
  'When the last niche fills, the tide comes in to admire the work. Then it starts again.',
  'The keeper\'s only rule, carved above the lanterns: one shell at a time, and the day will do the rest.',
];

const LORE_EVERY = 5;
const XP_FILE = 1;
const XP_GOLDEN_BONUS = 9;
const XP_SEAL = 5;
const XP_SHELVE = 3;
const XP_COMPLETE = 50;
const STREAK_MILESTONE = 5;

export interface ModelSkillView {
  unlocked: Set<SkillId>;
}

export class TideGame {
  readonly world: World;
  events: GameEvent[] = [];

  private held: Held = { kind: 'none' };
  private critterState: Record<string, 'loose' | 'held' | 'jarred'> = {};
  private jarState: Record<string, 'loose' | 'held' | 'shelved'> = {};
  private jarFill: Record<string, number> = {};
  private jarCubby: Record<string, string> = {};
  private xpTotal = 0;
  private level = 1;
  private streak = 0;
  private mistakes = 0;
  private goldenFound = 0;
  private bestStreak = 0;
  private filed = 0;
  private sealedCount = 0;
  private shelvedCount = 0;
  private loreIndex = 0;
  private startedAt = Date.now();
  private skills: ModelSkillView;

  constructor(world: World, skills: ModelSkillView = { unlocked: new Set() }) {
    this.world = world;
    this.skills = skills;
    for (const c of world.critters) this.critterState[c.id] = 'loose';
    for (const j of world.jars) {
      this.jarState[j.id] = 'loose';
      this.jarFill[j.id] = 0;
    }
  }

  setUnlocked(ids: Iterable<SkillId>): void {
    this.skills.unlocked = new Set(ids);
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
  }

  private addXp(amount: number): void {
    this.xpTotal += amount;
    const newLevel = levelFromXp(this.xpTotal);
    this.emit({ t: 'xp', amount, total: this.xpTotal, level: newLevel });
    if (newLevel > this.level) {
      this.level = newLevel;
      for (const s of SKILL_IDS) {
        if (SKILL_DEFS[s].unlockLevel <= newLevel) this.emit({ t: 'unlock', skillId: s });
      }
    }
  }

  get carryCap(): number {
    return 1 + (this.skills.unlocked.has('bothPaws') ? 2 : 0) + (this.skills.unlocked.has('slipstream') ? 1 : 0);
  }

  get heldKind(): Held { return this.held; }

  get xp(): number { return this.xpTotal; }
  get currentStreak(): number { return this.streak; }

  isSealed(jarId: string): boolean {
    const jar = this.world.jars.find((j) => j.id === jarId);
    return !!jar && this.jarFill[jarId] >= jar.capacity;
  }

  fillOf(jarId: string): number { return this.jarFill[jarId] ?? 0; }
  jarLocation(jarId: string): 'loose' | 'held' | 'shelved' { return this.jarState[jarId]; }
  critterLocation(id: string): 'loose' | 'held' | 'jarred' { return this.critterState[id]; }
  cubbyOfJar(jarId: string): string | undefined { return this.jarCubby[jarId]; }

  stats(): RunStats {
    return {
      elapsedMs: Date.now() - this.startedAt,
      mistakes: this.mistakes,
      goldenFound: this.goldenFound,
      bestStreak: this.bestStreak,
      crittersFiled: this.filed,
      jarsSealed: this.sealedCount,
      jarsShelved: this.shelvedCount,
    };
  }

  consumeEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Pick up a loose critter into the hand (capacity from skills). */
  pickCritter(id: string): boolean {
    if (this.critterState[id] !== 'loose') return false;
    if (this.held.kind === 'jar') return false;
    if (this.held.kind === 'critters' && this.held.ids.length >= this.carryCap) return false;
    this.critterState[id] = 'held';
    this.held = this.held.kind === 'critters'
      ? { kind: 'critters', ids: [...this.held.ids, id] }
      : { kind: 'critters', ids: [id] };
    return true;
  }

  /** Pick up a sealed, loose jar (one per hand — it is glass, after all). */
  pickJar(id: string): boolean {
    if (this.jarState[id] !== 'loose') return false;
    if (this.held.kind !== 'none') return false;
    if (!this.isSealed(id)) {
      const jar = this.world.jars.find((j) => j.id === id);
      const missing = jar ? jar.capacity - this.jarFill[id] : 0;
      this.emit({ t: 'hint', text: `This jar still needs ${missing} more critter${missing === 1 ? '' : 's'}.` });
      return false;
    }
    this.jarState[id] = 'held';
    this.held = { kind: 'jar', id };
    return true;
  }

  /** Return whatever is held to where it came from (drop on nothing). */
  releaseAll(): void {
    if (this.held.kind === 'critters') {
      for (const id of this.held.ids) this.critterState[id] = 'loose';
      this.emit({ t: 'bounce', critterId: this.held.ids[0] });
    } else if (this.held.kind === 'jar') {
      this.jarState[this.held.id] = 'loose';
      this.emit({ t: 'bounce', jarId: this.held.id });
    }
    this.held = { kind: 'none' };
  }

  /** File ONE held critter into `jarId`. Exact identity match required. */
  fileCritter(critterId: string, jarId: string): boolean {
    if (this.held.kind !== 'critters' || !this.held.ids.includes(critterId)) return false;
    const critter = this.world.critters.find((c) => c.id === critterId);
    if (!critter) return false;
    if (critter.jarId !== jarId || this.jarState[jarId] === 'shelved' || this.jarState[jarId] === 'held') {
      this.mistakes++;
      this.streak = 0;
      this.emit({ t: 'wrong', jarId });
      return false;
    }
    const jar = this.world.jars.find((j) => j.id === jarId);
    if (!jar || this.jarFill[jarId] >= jar.capacity) return false;

    this.held = this.held.kind === 'critters' && this.held.ids.length > 1
      ? { kind: 'critters', ids: this.held.ids.filter((i) => i !== critterId) }
      : { kind: 'none' };
    return this.applyFile(critter, jar);
  }

  /** The one true filing mutation — fill, streak, XP, seal. Callers have
   *  already validated identity and jar state. NEVER touches the hand. */
  private applyFile(critter: CritterDef, jar: JarDef): boolean {
    const jarId = jar.id;
    this.critterState[critter.id] = 'jarred';
    this.jarFill[jarId]++;
    this.filed++;
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    if (critter.golden) this.goldenFound++;
    const fillIndex = this.jarFill[jarId];
    this.emit({ t: 'filed', critterId: critter.id, jarId, fillIndex, golden: critter.golden });
    if (this.streak > 0 && this.streak % STREAK_MILESTONE === 0) this.emit({ t: 'streak', n: this.streak });
    this.addXp(XP_FILE + (critter.golden ? XP_GOLDEN_BONUS : 0));
    if (fillIndex >= jar.capacity) {
      this.sealedCount++;
      this.emit({ t: 'sealed', jarId, species: jar.species });
      this.addXp(XP_SEAL);
    }
    return true;
  }

  /** Shelve the held sealed jar into a cubby; cubby species must match. */
  shelveJar(jarId: string, cubbyId: string): boolean {
    if (this.held.kind !== 'jar' || this.held.id !== jarId) return false;
    if (this.jarState[jarId] !== 'held' || !this.isSealed(jarId)) return false;
    const jar = this.world.jars.find((j) => j.id === jarId);
    const cubby = this.world.cubbies.find((c) => c.id === cubbyId);
    if (!jar || !cubby || cubby.species !== jar.species) {
      this.mistakes++;
      this.streak = 0;
      this.emit({ t: 'wrong', jarId });
      return false;
    }
    this.jarState[jarId] = 'shelved';
    this.jarCubby[jarId] = cubbyId;
    this.held = { kind: 'none' };
    this.shelvedCount++;
    this.addXp(XP_SHELVE);
    const speciesDone = this.world.jars.filter((j) => j.species === jar.species)
      .every((j) => this.jarState[j.id] === 'shelved');
    this.emit({ t: 'shelved', jarId, cubbyId, speciesDone });
    if (this.shelvedCount % LORE_EVERY === 0 && this.loreIndex < LORE.length) {
      this.emit({ t: 'lore', line: LORE[this.loreIndex++] });
    }
    if (this.world.jars.every((j) => this.jarState[j.id] === 'shelved')) {
      this.addXp(XP_COMPLETE);
      this.emit({ t: 'lore', line: LORE[LORE.length - 1] });
      this.emit({ t: 'complete', stats: this.stats() });
    }
    return true;
  }

  /** Where should this loose critter fly (double-click)? Its jar, if the jar
   *  is loose and still open. Null → nothing to do (jar shelved/full). */
  flyTargetJar(critterId: string): string | null {
    const c = this.world.critters.find((k) => k.id === critterId);
    if (!c || this.critterState[critterId] !== 'loose') return null;
    if (this.jarState[c.jarId] !== 'loose' || this.isSealed(c.jarId)) return null;
    return c.jarId;
  }

  /** Where should this sealed jar fly? Its species cubby, if free. Works
   *  both pre-pickup (loose) and while already held (the double-click flow). */
  flyTargetCubby(jarId: string): string | null {
    const st = this.jarState[jarId];
    if ((st !== 'loose' && st !== 'held') || !this.isSealed(jarId)) return null;
    const jar = this.world.jars.find((j) => j.id === jarId);
    const cubby = this.world.cubbies.find((c) => c.species === jar?.species);
    return cubby?.id ?? null;
  }

  /** Double-click flow: file a still-loose critter straight into its jar
   *  (no pickup needed). Same rewards as the held path; never disturbs
   *  whatever else is being carried — that was an orphaning bug once. */
  flyFile(critterId: string): boolean {
    const c = this.world.critters.find((k) => k.id === critterId);
    if (!c || this.critterState[critterId] !== 'loose') return false;
    if (this.jarState[c.jarId] !== 'loose' || this.isSealed(c.jarId)) return false;
    const jar = this.world.jars.find((j) => j.id === c.jarId);
    if (!jar || this.jarFill[jar.id] >= jar.capacity) return false;
    return this.applyFile(c, jar);
  }

  /** Both Paws: file every held critter into its own jar, best-effort. */
  fileAllHeld(): number {
    if (this.held.kind !== 'critters') return 0;
    let n = 0;
    for (const id of [...this.held.ids]) {
      const c = this.world.critters.find((k) => k.id === id);
      if (c && this.jarState[c.jarId] === 'loose' && this.fileCritter(id, c.jarId)) n++;
    }
    return n;
  }

  /** Tide Pull active skill: auto-file up to `n` loose critters whose jar is
   *  loose and open. Deterministic order (world order) keeps tests honest. */
  tidePull(n = 3): number {
    if (!this.skills.unlocked.has('tidePull')) return 0;
    let done = 0;
    for (const c of this.world.critters) {
      if (done >= n) break;
      if (this.critterState[c.id] !== 'loose') continue;
      if (this.jarState[c.jarId] !== 'loose' || this.isSealed(c.jarId)) continue;
      if (this.flyFile(c.id)) done++;
    }
    if (done > 0) this.emit({ t: 'hint', text: `The tide pulls ${done} critter${done === 1 ? '' : 's'} home.` });
    return done;
  }

  isComplete(): boolean {
    return this.world.jars.every((j) => this.jarState[j.id] === 'shelved');
  }
}
