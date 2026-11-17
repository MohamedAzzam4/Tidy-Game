/**
 * Tide & Tidy audio engine — fully procedural Web Audio, no downloads.
 *
 * The satisfaction design (the community's loudest praise was "satisfying",
 * so the sound carries the reward loop):
 *   - every critter filed into a jar plays a water plop whose pitch walks UP
 *     a pentatonic ladder with the jar's fill level — filling a jar is a
 *     little ascending melody;
 *   - streaks add a milestone chime every 5, golden pearls get a harp gliss;
 *   - sealing pops the lid, shelving lands a warm wooden thunk + chord;
 *   - the finale is a real fanfare (JavaJack asked for "more fanfare");
 *   - mistakes are soft muted "bwub"s — feedback, never punishment;
 *   - ocean ambience + generative pad underneath (both toggleable for
 *     podcast listeners, mirroring the reference game's music toggle).
 *
 * Everything is guarded: audio is decorative and must never break the game.
 * A small read-only log (sfxLogSnapshot) keeps the layer observable in e2e.
 */

type SfxKind =
  | 'pickup' | 'plop' | 'wrong' | 'bounce' | 'seal' | 'shelf'
  | 'streak' | 'golden' | 'lore' | 'finale' | 'ui' | 'skill';

export interface SfxLogEntry { sfx: SfxKind; muted: boolean; at: number }

const sfxLog: SfxLogEntry[] = [];
const SFX_LOG_CAP = 12;
export function sfxLogSnapshot(): SfxLogEntry[] {
  return sfxLog.map((e) => ({ ...e }));
}

// ————— state —————
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let wetBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let ambBus: GainNode | null = null;
let noise: AudioBuffer | null = null;
let musicTimer: number | null = null;
let ambStarted = false;

const state = { music: true, sfx: true };

/** C major pentatonic across three octaves — the plop/streak/fanfare ladder. */
const PENT = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.7, 1318.5, 1568.0, 1760.0];
const CHORDS = [
  [174.61, 261.63, 329.63, 440.0],   // F maj7-ish
  [220.0, 261.63, 329.63, 392.0],    // Am7-ish
  [130.81, 196.0, 261.63, 329.63],   // C
  [196.0, 246.94, 293.66, 392.0],    // G
];
let chordIdx = 0;
let lastPluck = 0;

export function unlock(): void {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      buildGraph();
    }
    void ctx.resume();
  } catch {
    ctx = null;
  }
}

function buildGraph(): void {
  if (!ctx) return;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(comp).connect(ctx.destination);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 1;
  sfxBus.connect(master);

  // cheap cozy space: two cross-fed, lowpassed feedback delays
  wetBus = ctx.createGain();
  wetBus.gain.value = 0.5;
  const dL = ctx.createDelay(1);
  const dR = ctx.createDelay(1);
  dL.delayTime.value = 0.131;
  dR.delayTime.value = 0.187;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const pannerL = ctx.createStereoPanner();
  const pannerR = ctx.createStereoPanner();
  pannerL.pan.value = -0.6;
  pannerR.pan.value = 0.6;
  wetBus.connect(dL).connect(lp);
  lp.connect(fb);
  fb.connect(dL);
  fb.connect(dR);
  dL.connect(pannerL).connect(master);
  dR.connect(pannerR).connect(master);

  musicBus = ctx.createGain();
  musicBus.gain.value = state.music ? 1 : 0;
  musicBus.connect(master);
  musicBus.connect(wetBus);

  ambBus = ctx.createGain();
  ambBus.gain.value = state.sfx ? 1 : 0;
  ambBus.connect(master);

  // 2s of brown noise, reused by waves / splashes / pops
  const len = ctx.sampleRate * 2;
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noise.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
}

export function setToggles(music: boolean, sfx: boolean): void {
  state.music = music;
  state.sfx = sfx;
  try {
    if (musicBus) musicBus.gain.value = music ? 1 : 0;
    if (ambBus) ambBus.gain.value = sfx ? 1 : 0;
  } catch { /* decorative */ }
}

function now(): number {
  return ctx ? ctx.currentTime : 0;
}

interface NoteOpts {
  dur?: number;
  peak?: number;
  type?: OscillatorType;
  bus?: GainNode | null;
  detuneC?: number;
  slideTo?: number;
  attack?: number;
  wetSend?: number;
}

/** One enveloped oscillator note. The workhorse. */
function note(freq: number, at: number, opts: NoteOpts = {}): void {
  if (!ctx || !master) return;
  const { dur = 0.3, peak = 0.1, type = 'sine', bus = sfxBus, detuneC = 0, slideTo, attack = 0.012, wetSend = 0 } = opts;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), at + dur * 0.8);
  if (detuneC) osc.detune.setValueAtTime(detuneC, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(bus ?? master);
  if (wetBus && wetSend > 0) {
    const w = ctx.createGain();
    w.gain.value = wetSend;
    g.connect(w).connect(wetBus);
  }
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

interface NoiseOpts {
  dur?: number;
  peak?: number;
  type?: BiquadFilterType;
  freq?: number;
  q?: number;
  at?: number;
  bus?: GainNode | null;
  sweepTo?: number;
}

function noiseBurst(opts: NoiseOpts = {}): void {
  if (!ctx || !noise || !master) return;
  const { dur = 0.15, peak = 0.08, type = 'bandpass', freq = 1200, q = 1, at = now(), bus = sfxBus, sweepTo } = opts;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, at);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), at + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(bus ?? master);
  src.start(at, Math.random() * 1.5);
  src.stop(at + dur + 0.05);
}

/** tiny random pitch spread so repeated identical sounds never fatigue */
function wob(): number {
  return (Math.random() * 2 - 1) * 4;
}

// ————— ambience & generative music —————

/** Ocean: two swelled noise layers + sparse distant gulls. Started once. */
function startAmbience(): void {
  if (!ctx || !ambBus || !noise || ambStarted) return;
  ambStarted = true;
  const mkWave = (fLo: number, swellS: number, peak: number, pan: number) => {
    const src = ctx!.createBufferSource();
    src.buffer = noise!;
    src.loop = true;
    const lp = ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = fLo;
    const g = ctx!.createGain();
    g.gain.value = 0.02;
    const lfo = ctx!.createOscillator();
    const lfoG = ctx!.createGain();
    lfo.frequency.value = 1 / swellS;
    lfoG.gain.value = peak / 2;
    lfo.connect(lfoG).connect(g.gain);
    const p = ctx!.createStereoPanner();
    p.pan.value = pan;
    src.connect(lp).connect(g).connect(p).connect(ambBus!);
    src.start();
    lfo.start();
  };
  mkWave(420, 11, 0.05, -0.3);   // deep swell, slow
  mkWave(1500, 7, 0.02, 0.4);    // foam hiss, faster

  const gull = () => {
    if (!ctx) return;
    const base = 620 + Math.random() * 220;
    const t = now() + 0.05;
    note(base, t, { dur: 0.22, peak: 0.012, type: 'triangle', bus: ambBus, detuneC: wob(), slideTo: base * 0.82, wetSend: 0.8 });
    note(base * 1.12, t + 0.26, { dur: 0.18, peak: 0.008, type: 'triangle', bus: ambBus, slideTo: base * 0.9, wetSend: 0.8 });
    window.setTimeout(gull, 22000 + Math.random() * 30000);
  };
  window.setTimeout(gull, 9000);
}

/** Generative pad + pentatonic plucks, lookahead-scheduled. */
function startMusic(): void {
  if (musicTimer !== null) return;
  const tick = () => {
    if (!ctx || !state.music) return;
    const t = now();
    // pad: one soft chord every 8s
    const chord = CHORDS[chordIdx % CHORDS.length];
    chordIdx++;
    for (const f of chord) {
      note(f, t + 0.02, { dur: 8.4, peak: 0.028, type: 'triangle', bus: musicBus, attack: 2.4, detuneC: wob(), wetSend: 0.5 });
      note(f * 2.002, t + 0.02, { dur: 8.4, peak: 0.012, type: 'sine', bus: musicBus, attack: 2.8, wetSend: 0.5 });
    }
    // sparse plucks drifting on the pentatonic
    if (t - lastPluck > 1.6 && Math.random() < 0.75) {
      lastPluck = t;
      const f = PENT[3 + Math.floor(Math.random() * 7)];
      note(f, t + 0.4 + Math.random() * 0.6, { dur: 1.6, peak: 0.035, type: 'sine', bus: musicBus, wetSend: 1.2, detuneC: wob() });
      if (Math.random() < 0.35) {
        note(f * 1.5, t + 0.7 + Math.random() * 0.5, { dur: 1.4, peak: 0.02, type: 'sine', bus: musicBus, wetSend: 1.2 });
      }
    }
  };
  tick();
  musicTimer = window.setInterval(tick, 8000);
}

export function startLayers(): void {
  try {
    startAmbience();
    startMusic();
  } catch { /* decorative */ }
}

// ————— sound effects —————

export function play(kind: SfxKind, arg = 0): void {
  sfxLog.push({ sfx: kind, muted: !state.sfx, at: Date.now() });
  if (sfxLog.length > SFX_LOG_CAP) sfxLog.shift();
  if (!ctx || !state.sfx || !sfxBus) return;
  try {
    const t = now();
    switch (kind) {
      case 'pickup':
        noiseBurst({ dur: 0.07, peak: 0.05, freq: 2600, q: 0.8, type: 'highpass' });
        note(180, t, { dur: 0.08, peak: 0.05, type: 'sine', slideTo: 140, detuneC: wob() });
        break;
      case 'plop': {
        // THE hook: water plop on the ascending pentatonic fill ladder
        const f = PENT[Math.min(arg, PENT.length - 1)];
        note(f * 1.4, t, { dur: 0.16, peak: 0.16, type: 'sine', slideTo: f, detuneC: wob(), wetSend: 0.6 });
        noiseBurst({ dur: 0.09, peak: 0.03, freq: 900, q: 2 });
        note(f * 3, t + 0.02, { dur: 0.12, peak: 0.03, type: 'sine', detuneC: wob(), wetSend: 0.8 });
        break;
      }
      case 'wrong':
        note(220, t, { dur: 0.18, peak: 0.07, type: 'sine', slideTo: 190, detuneC: wob() });
        note(233, t + 0.02, { dur: 0.16, peak: 0.05, type: 'sine', slideTo: 200 });
        break;
      case 'bounce':
        noiseBurst({ dur: 0.22, peak: 0.03, freq: 700, sweepTo: 180, q: 1.2 });
        break;
      case 'seal': {
        // cork pop + little sparkle arpeggio (arg = species jar ordinal)
        noiseBurst({ dur: 0.05, peak: 0.12, freq: 850, q: 1.5 });
        note(95, t, { dur: 0.14, peak: 0.14, type: 'sine', slideTo: 70 });
        const root = PENT[5 + Math.min(arg, 4)];
        note(root, t + 0.07, { dur: 0.5, peak: 0.07, type: 'sine', wetSend: 1.0, detuneC: wob() });
        note(root * 1.25, t + 0.15, { dur: 0.55, peak: 0.06, type: 'sine', wetSend: 1.0 });
        note(root * 1.5, t + 0.23, { dur: 0.7, peak: 0.055, type: 'triangle', wetSend: 1.2 });
        note(root * 5.03, t + 0.07, { dur: 0.4, peak: 0.012, type: 'sine', wetSend: 1.4 });
        break;
      }
      case 'shelf': {
        // wooden thunk + warm landing chord
        note(130, t, { dur: 0.1, peak: 0.16, type: 'triangle', slideTo: 88 });
        noiseBurst({ dur: 0.06, peak: 0.05, freq: 300, q: 1.4, type: 'lowpass' });
        [220, 275, 330, 413].forEach((f, i) => {
          note(f, t + 0.06 + i * 0.035, { dur: 1.1, peak: 0.03, type: 'sine', wetSend: 1.1, detuneC: wob() });
        });
        break;
      }
      case 'streak':
        note(PENT[7], t, { dur: 0.35, peak: 0.06, type: 'sine', wetSend: 1.2, detuneC: wob() });
        note(PENT[9], t + 0.09, { dur: 0.5, peak: 0.055, type: 'sine', wetSend: 1.2 });
        break;
      case 'golden':
        // harp gliss + shimmer — the variable-ratio jackpot sound
        for (let i = 0; i < 5; i++) {
          note(PENT[5 + i] * (i % 2 ? 2 : 1), t + i * 0.055, { dur: 0.9, peak: 0.05, type: 'sine', wetSend: 1.4, detuneC: wob() });
        }
        note(PENT[10] * 2, t + 0.3, { dur: 1.2, peak: 0.015, type: 'sine', wetSend: 1.6 });
        break;
      case 'lore':
        // music-box motif for a bottled message
        [0, 2, 4, 5].forEach((step, i) => {
          note(PENT[6 + step], t + i * 0.16, { dur: 0.8, peak: 0.045, type: 'sine', wetSend: 1.6 });
        });
        break;
      case 'finale':
        for (let i = 0; i < 8; i++) {
          note(PENT[i + 2], t + i * 0.09, { dur: 0.8, peak: 0.055, type: 'triangle', wetSend: 1.0 });
        }
        [261.63, 329.63, 392.0, 523.25, 659.25].forEach((f, i) => {
          note(f, t + 0.8 + i * 0.02, { dur: 2.6, peak: 0.05, type: 'sine', wetSend: 1.2, attack: 0.3 });
        });
        noiseBurst({ dur: 2.4, peak: 0.06, freq: 500, sweepTo: 160, type: 'lowpass', at: t + 0.85 });
        break;
      case 'ui':
        note(880, t, { dur: 0.05, peak: 0.02, type: 'sine' });
        break;
      case 'skill':
        note(PENT[8], t, { dur: 0.3, peak: 0.05, type: 'triangle', wetSend: 1.0, detuneC: wob() });
        note(PENT[10], t + 0.08, { dur: 0.4, peak: 0.04, type: 'triangle', wetSend: 1.2 });
        break;
    }
  } catch {
    /* decorative — never break the game */
  }
}
