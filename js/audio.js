// TIDEKEEPER audio.js - fully synthesized underwater ASMR. No audio files.
// Design for satisfaction (immediate <80ms feedback, pentatonic streak ladder,
// glass bell partials, generated reverb). Every voice: gain envelope + reverb send.

let ctx = null, buses = null, ambience = null;

export function initAudio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();

  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.25;
  master.connect(comp); comp.connect(ctx.destination);

  // cave-water reverb: generated impulse (2s decaying lowpassed noise)
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(2.2, 2.8);
  const revSend = ctx.createGain(); revSend.gain.value = 0.35;
  const revOut = ctx.createGain(); revOut.gain.value = 0.9;
  revSend.connect(conv); conv.connect(revOut); revOut.connect(master);

  buses = {
    master,
    sfx: mkBus(master, 0.9), sfxSend: revSend,
    music: mkBus(master, 0.5),
    amb: mkBus(master, 0.4),
  };
  startAmbience();
  return ctx;
}

function mkBus(master, vol) {
  const g = ctx.createGain(); g.gain.value = vol; g.connect(master); return g;
}

function makeImpulse(seconds, decay) {
  const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;             // soften highs
      d[i] = last * Math.pow(1 - i / len, decay) * 3.2;
    }
  }
  return buf;
}

function noiseBuffer(seconds) {
  const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = last * 3; } // brown
  return buf;
}

// ---------- ambience: deep water hum + slow pad + sparse bubbles ----------
function startAmbience() {
  if (ambience) return;
  const t = ctx.currentTime;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(4); noise.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.4;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0, t);
  nGain.gain.linearRampToValueAtTime(0.5, t + 3);
  // slow swell LFO so the water "breathes"
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.18;
  lfo.connect(lfoGain); lfoGain.connect(nGain.gain);
  noise.connect(lp); lp.connect(nGain); nGain.connect(buses.amb);
  noise.start(); lfo.start();

  // pad: two detuned sines a fifth apart, barely there
  const padGain = ctx.createGain(); padGain.gain.value = 0.05; padGain.connect(buses.music);
  for (const [f, det] of [[65.4, 0], [98.5, 3]]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = det;
    const g = ctx.createGain(); g.gain.value = 0.5;
    o.connect(g); g.connect(padGain); o.start();
  }

  ambience = { bubbleTimer: 0 };
}

// sparse random bubble pops, called from the game loop
export function tickAmbience(dt, intensity) {
  if (!ctx || !ambience) return;
  ambience.bubbleTimer -= dt;
  if (ambience.bubbleTimer <= 0) {
    ambience.bubbleTimer = 2.5 + Math.random() * 5 - Math.min(2, intensity * 0.5);
    bubble(0.15 + Math.random() * 0.25);
  }
}

export function bubble(vol = 0.2) {
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sine';
  const f0 = 300 + Math.random() * 500;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + 0.08); // rising "blup"
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(g); g.connect(buses.sfx);
  const send = ctx.createGain(); send.gain.value = 0.4; g.connect(send); send.connect(buses.sfxSend);
  o.start(t); o.stop(t + 0.14);
}

// ---------- SFX ----------
const PENT = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26]; // C major pentatonic, 2 octaves
const C4 = 261.63;

export function plip() { // pick up a mote: wet pip + tiny tick
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sine';
  const f0 = 520 * (0.97 + Math.random() * 0.06);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.07);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.25, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  o.connect(g); g.connect(buses.sfx);
  const send = ctx.createGain(); send.gain.value = 0.3; g.connect(send); send.connect(buses.sfxSend);
  o.start(t); o.stop(t + 0.1);
}

export function chime(step) { // file a mote: pentatonic ladder rises with the streak
  if (!ctx) return;
  const t = ctx.currentTime;
  const idx = Math.min(step, PENT.length - 1);
  const f = C4 * Math.pow(2, PENT[idx] / 12);
  glassVoice(f, t, 0.30 + Math.min(0.25, step * 0.02), 0.7);
}

function glassVoice(f, t, vol, dur) { // sine + inharmonic glass partial, into reverb
  for (const [mult, v, d] of [[1, 1, dur], [2.76, 0.4, dur * 0.7], [5.4, 0.18, dur * 0.45]]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mult;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(vol * v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    o.connect(g); g.connect(buses.sfx);
    const send = ctx.createGain(); send.gain.value = 0.5; g.connect(send); send.connect(buses.sfxSend);
    o.start(t); o.stop(t + d + 0.05);
  }
}

export function bellChord(baseStep) { // a bell is complete: glass chord arpeggio
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const root = C4 * Math.pow(2, PENT[Math.min(baseStep, PENT.length - 1)] / 12);
  [1, 1.335, 1.5].forEach((m, i) => glassVoice(root * m, t0 + i * 0.07, 0.26, 1.1));
}

export function nicheFill(step) { // bell slots into its niche: warm marimba thock + stone slide
  if (!ctx) return;
  const t = ctx.currentTime;
  const f = C4 * Math.pow(2, PENT[Math.min(step, PENT.length - 1)] / 12) * 0.5;
  for (const [mult, v] of [[1, 1], [4, 0.25]]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mult;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.3 * v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g); g.connect(buses.sfx);
    const send = ctx.createGain(); send.gain.value = 0.35; g.connect(send); send.connect(buses.sfxSend);
    o.start(t); o.stop(t + 0.55);
  }
  swish(0.12, 0.15);
}

export function thud() { // wrong drop: soft muffled pumf, never harsh
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.22, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  o.connect(g); g.connect(buses.sfx);
  o.start(t); o.stop(t + 0.18);
  swish(0.06, 0.1);
}

function swish(vol, dur) { // filtered noise brush
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(Math.max(0.3, dur * 2));
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(bp); bp.connect(g); g.connect(buses.sfx);
  const send = ctx.createGain(); send.gain.value = 0.3; g.connect(send); send.connect(buses.sfxSend);
  src.start(t); src.stop(t + dur + 0.1);
}

export function lumen() { // prismatic mote filed: 5-note sparkle arpeggio
  if (!ctx) return;
  const t0 = ctx.currentTime;
  [12, 16, 19, 24, 28].forEach((s, i) => {
    const f = C4 * Math.pow(2, s / 12) * 2;
    glassVoice(f, t0 + i * 0.055, 0.14, 0.5);
  });
}

export function rankUp() { // keeper rank increased
  if (!ctx) return;
  const t0 = ctx.currentTime;
  [0, 7, 12].forEach((s, i) => glassVoice(C4 * 1.5 * Math.pow(2, s / 12), t0 + i * 0.09, 0.2, 0.8));
}

export function click() { // UI tap
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 660;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.12, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  o.connect(g); g.connect(buses.sfx);
  o.start(t); o.stop(t + 0.07);
}

export function sonar() { // Echo Pulse skill: descending ping
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(900, t);
  o.frequency.exponentialRampToValueAtTime(300, t + 0.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.2, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  o.connect(g); g.connect(buses.sfx);
  const send = ctx.createGain(); send.gain.value = 0.6; g.connect(send); send.connect(buses.sfxSend);
  o.start(t); o.stop(t + 0.6);
}

export function riptideWhoosh() { // Riptide skill: big water sweep
  if (!ctx) return;
  swish(0.3, 0.9);
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(1.4); src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(200, t);
  lp.frequency.exponentialRampToValueAtTime(1800, t + 0.4);
  lp.frequency.exponentialRampToValueAtTime(250, t + 1.1);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.28, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
  src.connect(lp); lp.connect(g); g.connect(buses.sfx);
  const send = ctx.createGain(); send.gain.value = 0.4; g.connect(send); send.connect(buses.sfxSend);
  src.start(t); src.stop(t + 1.3);
}

// THE BLOOM: expedition complete. Ascending cascade of glass chimes + pad swell.
export function bloom(nBells) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const n = Math.min(nBells, 24);
  for (let i = 0; i < n; i++) {
    const f = C4 * Math.pow(2, PENT[i % PENT.length] / 12) * (i < PENT.length ? 1 : 2);
    glassVoice(f, t0 + 0.15 + i * 0.085, 0.22, 1.2);
  }
  // pad swell under the cascade
  const pad = ctx.createGain(); pad.gain.setValueAtTime(0.001, t0);
  pad.gain.linearRampToValueAtTime(0.16, t0 + 0.8);
  pad.gain.linearRampToValueAtTime(0.001, t0 + 2.8);
  pad.connect(buses.music);
  [1, 1.5, 2, 2.5].forEach(m => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = C4 * 0.5 * m;
    const g = ctx.createGain(); g.gain.value = 0.25;
    o.connect(g); g.connect(pad); o.start(t0); o.stop(t0 + 3);
  });
  for (let i = 0; i < 6; i++) bubble(0.25); // champagne bubbles
}

// ---------- settings ----------
export function setVolumes({ master = 1, music = 0.8, sfx = 1 } = {}) {
  if (!ctx) return;
  buses.master.gain.value = master;
  buses.music.gain.value = 0.5 * music;
  buses.sfx.gain.value = 0.9 * sfx;
  buses.amb.gain.value = 0.4 * master; // ambience follows master so mute is real
}

export function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
export function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
export function ready() { return !!ctx; }
