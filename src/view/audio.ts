/** Tiny synthesized UI sounds — soft, local, no downloads. All guarded. */

type Sfx = 'pickup' | 'place' | 'return' | 'complete';

let ctx: AudioContext | null = null;
let muted = false;

export function unlock(): void {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) ctx = new Ctor();
    }
    void ctx?.resume();
  } catch {
    ctx = null;
  }
}

export function setMuted(m: boolean): void {
  muted = m;
}

export function isMuted(): boolean {
  return muted;
}

function tone(freq: number, delay: number, dur: number, peak: number, type: OscillatorType): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export function play(kind: Sfx): void {
  if (muted || !ctx) return;
  try {
    switch (kind) {
      case 'pickup':
        tone(392, 0, 0.09, 0.03, 'sine');
        break;
      case 'place':
        tone(587, 0, 0.22, 0.05, 'sine');
        tone(880, 0.015, 0.16, 0.028, 'triangle');
        break;
      case 'return':
        tone(294, 0, 0.12, 0.03, 'sine');
        break;
      case 'complete':
        // a small warm arpeggio
        tone(523.25, 0, 0.6, 0.042, 'sine');
        tone(659.25, 0.12, 0.6, 0.04, 'sine');
        tone(783.99, 0.24, 0.7, 0.038, 'sine');
        tone(1046.5, 0.38, 0.9, 0.03, 'triangle');
        tone(261.63, 0, 1.1, 0.026, 'sine');
        break;
    }
  } catch {
    /* audio is decorative — never break the game over it */
  }
}
