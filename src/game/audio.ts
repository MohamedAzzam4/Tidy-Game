/**
 * Tidy Tapes — synthesized audio engine v2 (WebAudio; no files).
 *
 * Magnetic Tuck (every accepted insertion): a soft descending "shff" that starts
 * as the tape begins to enter, and a short muted plastic "tuk" exactly when it
 * seats — calm, slightly game-like, never a loud click. Subtle variation,
 * polyphony cap, and per-batch ducking so staggered insertions never pile into
 * one loud hit.
 *
 * Tiny Chime is reserved for explicit confirmations ONLY (a rack the player
 * verifies, or the verified end-of-job milestone). It is never played for a
 * correct insertion, a filled rack, a power activation or a repair finish.
 */

type SfxName =
  | 'pickup' | 'tuck' | 'tuk' | 'thud' | 'invalid'
  | 'unlock' | 'complete' | 'peel' | 'rub-tick' | 'press'
  | 'squeak' | 'wipe' | 'chime' | 'place' | 'gather';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastPlay: Partial<Record<SfxName, number>> = {};
  private recentTucks: number[] = [];
  recent: { name: string; at: number }[] = []; // test introspection
  enabled = true;

  /** call from any user-gesture handler */
  unlock(): void {
    if (!this.enabled) return;
    if (!this.ctx) {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        const limiter = this.ctx.createDynamicsCompressor();
        limiter.threshold.value = -6;
        limiter.knee.value = 6;
        limiter.ratio.value = 12;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.12;
        this.sfx = this.ctx.createGain();
        this.sfx.gain.value = 1;
        this.sfx.connect(limiter);
        limiter.connect(this.master);
        this.master.connect(this.ctx.destination);
        // shared noise buffer
        const len = this.ctx.sampleRate * 0.4;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.02);
    }
  }

  private now(): number {
    // suspended contexts freeze currentTime at 0 (e.g. headless without a user
    // gesture) — fall back to wall-clock so pacing/polyphony stays sane
    if (this.ctx && this.ctx.state === 'running') return this.ctx.currentTime;
    return performance.now() / 1000;
  }

  /** variation helpers: ±1 semitone (~6%) and ±2 dB, no immediate repeats */
  private vary(): { rate: number; gain: number } {
    return { rate: 0.94 + Math.random() * 0.12, gain: 0.79 + Math.random() * 0.4 };
  }

  private noise(opts: {
    when?: number; dur: number; type?: BiquadFilterType; f0: number; f1?: number;
    gain: number; q?: number;
  }): void {
    if (!this.ctx || !this.sfx || !this.noiseBuf) return;
    const t = Math.max(this.now(), opts.when ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filt = this.ctx.createBiquadFilter();
    filt.type = opts.type ?? 'bandpass';
    filt.Q.value = opts.q ?? 1.1;
    filt.frequency.setValueAtTime(opts.f0, t);
    if (opts.f1 !== undefined) filt.frequency.exponentialRampToValueAtTime(Math.max(40, opts.f1), t + opts.dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t + Math.min(0.02, opts.dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(filt); filt.connect(g); g.connect(this.sfx);
    src.start(t); src.stop(t + opts.dur + 0.05);
  }

  private tone(opts: {
    when?: number; dur: number; type?: OscillatorType; f0: number; f1?: number;
    gain: number;
  }): void {
    if (!this.ctx || !this.sfx) return;
    const t = Math.max(this.now(), opts.when ?? 0);
    const osc = this.ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.f0, t);
    if (opts.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(30, opts.f1), t + opts.dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    osc.connect(g); g.connect(this.sfx);
    osc.start(t); osc.stop(t + opts.dur + 0.05);
  }

  /** ducking factor: controls overlapping peaks on a batch of five tucks */
  private tuckDuck(): number {
    const t = this.now();
    this.recentTucks = this.recentTucks.filter(x => t - x < 0.45);
    this.recentTucks.push(t);
    const n = this.recentTucks.length;
    return n > 3 ? 0.52 : n > 2 ? 0.75 : 1;
  }

  play(name: SfxName, opts: { delay?: number; gainScale?: number } = {}): void {
    if (!this.enabled) return;
    if (!this.ctx) this.unlock();
    if (!this.ctx) return;
    const v = this.vary();
    const gs = opts.gainScale ?? 1;
    const when = this.now() + (opts.delay ?? 0);
    // polyphony guard: skip same sfx within 25 ms
    if ((this.lastPlay[name] ?? -1) > when - 0.025) return;
    this.lastPlay[name] = when;
    this.recent.push({ name, at: Date.now() });
    if (this.recent.length > 24) this.recent.shift();

    switch (name) {
      case 'tuck': {
        // Magnetic Tuck, part 1: soft descending plastic shff (starts at entry)
        this.noise({ when, dur: 0.22, f0: 1150 * v.rate, f1: 360 * v.rate, gain: 0.32 * v.gain * gs * this.tuckDuck(), q: 0.9 });
        this.noise({ when: when + 0.02, dur: 0.1, f0: 2200 * v.rate, f1: 820, gain: 0.045 * v.gain * gs, q: 2 });
        break;
      }
      case 'tuk': {
        // Magnetic Tuck, part 2: short muted plastic tuck exactly at the seat
        this.noise({ when, dur: 0.02, f0: 2500 * v.rate, gain: 0.045 * v.gain, q: 3 });
        this.tone({ when, dur: 0.032, f0: 200 * v.rate, f1: 150, gain: 0.045 * v.gain, type: 'triangle' });
        break;
      }
      case 'pickup': {
        this.noise({ when, dur: 0.035, f0: 1500 * v.rate, f1: 900, gain: 0.07 * v.gain, q: 2.4 });
        break;
      }
      case 'place': { // tapes fanned onto the table / into the tray (very soft)
        this.noise({ when, dur: 0.05, f0: 700 * v.rate, f1: 400, gain: 0.055 * v.gain, q: 1.4 });
        break;
      }
      case 'invalid': { // gentle low thud for a refused drop (tray full / needs repair)
        this.tone({ when, dur: 0.09, f0: 120 * v.rate, f1: 80, gain: 0.09 * v.gain, type: 'sine' });
        break;
      }
      case 'thud': {
        this.tone({ when, dur: 0.08, f0: 95, f1: 70, gain: 0.08 * v.gain });
        break;
      }
      case 'unlock': { // skill unlock toast (soft, distinct from the Tiny Chime)
        this.tone({ when, dur: 0.16, f0: 523.25, gain: 0.10 * v.gain, type: 'sine' });
        this.tone({ when: when + 0.11, dur: 0.2, f0: 783.99, gain: 0.09 * v.gain, type: 'sine' });
        break;
      }
      case 'complete': { // verified end-of-job milestone (with the Tiny Chime)
        const notes = [392, 494, 587.3, 784];
        notes.forEach((f, i) => this.tone({ when: when + i * 0.14, dur: 0.3, f0: f, gain: 0.09 * v.gain, type: 'triangle' }));
        break;
      }
      case 'peel': { // sticker peeling: tiny crackle ticks
        for (let i = 0; i < 4; i++) {
          this.noise({ when: when + i * 0.05, dur: 0.018, f0: 2000 + Math.random() * 900, gain: 0.05 * v.gain, q: 3 });
        }
        break;
      }
      case 'squeak': { // pencil winding a reel
        this.tone({ when, dur: 0.06, f0: 780 * v.rate, f1: 950 * v.rate, gain: 0.035 * v.gain, type: 'triangle' });
        break;
      }
      case 'wipe': { // rubbing residue / cloth
        this.noise({ when, dur: 0.09, f0: 900 * v.rate, f1: 1400, gain: 0.05 * v.gain, q: 0.8 });
        break;
      }
      case 'press': { // pressing a new sticker / repair finish (soft blip, NOT the chime)
        this.tone({ when, dur: 0.06, f0: 170, f1: 120, gain: 0.08 * v.gain, type: 'sine' });
        this.noise({ when, dur: 0.02, f0: 1800, gain: 0.03, q: 3 });
        break;
      }
      case 'gather': { // tapes flying into the tray
        this.tone({ when, dur: 0.12, f0: 620, f1: 900, gain: 0.06 * v.gain, type: 'sine' });
        break;
      }
      case 'chime': { // Tiny Chime: explicit confirmations only (verify / win)
        this.tone({ when, dur: 0.22, f0: 659.25, gain: 0.08 * v.gain, type: 'sine' });
        this.tone({ when: when + 0.06, dur: 0.18, f0: 987.77, gain: 0.04 * v.gain, type: 'sine' });
        break;
      }
    }
  }

  /** audition helpers for the in-game sound check */
  auditionTuckBatch(): void {
    for (let i = 0; i < 5; i++) this.play('tuck', { delay: i * 0.11 });
    for (let i = 0; i < 5; i++) this.play('tuk', { delay: i * 0.11 + 0.24 });
  }
}

export const audio = new AudioEngine();
