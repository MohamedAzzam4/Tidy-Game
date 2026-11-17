// TIDEKEEPER game.js - expedition state machine, input, physics, economy.
// Phases: intro (preview behind modal) -> play -> bloom (fanfare lock) -> card.
// Input: press-drag OR tap-to-carry (hand cramp friendly). No fail state.

import { WORLD, FIELD, WALL, generateExpedition, matchMoteBell, matchBellNiche } from './gen.js';
import { randomSeed } from './rng.js';
import * as A from './audio.js';
import { SKILLS, has } from './skills.js';

const MOTE_R = 13, BELL_R = 34, NICHE_R = 30;

export function createGame(canvas, profile, hooks) {
  const g = {
    canvas, profile, hooks,
    phase: 'title',
    gen: null, motes: [], bells: [], niches: [],
    hand: [],            // held motes (1, or 2 with Double Sip)
    heldBell: null,
    pointer: { x: -999, y: -999, down: false, id: null, downT: 0, downX: 0, downY: 0, vx: 0, vy: 0, lastX: 0, lastY: 0 },
    sticky: false,       // tap-carry mode engaged
    streak: 0,
    runPearls: 0, runXp: 0, runMotes: 0, runBells: 0, runLumen: 0,
    time: 0,
    bloomT: 0, bloomDone: false,
    echoT: 0, activeCd: 0, activeId: null,
    parts: [],
    shake: 0,
    seed: null,
  };

  // ---------- expedition lifecycle ----------
  g.newExpedition = function (seed) {
    g.seed = seed ?? randomSeed();
    g.gen = generateExpedition(g.seed, profile.expeditions + 1);
    g.motes = g.gen.motes.map(m => ({ ...m, state: 'free' }));
    g.bells = g.gen.bells.map(b => ({ ...b, motes: [], held: false, wobble: 0, fillPulse: 0, niche: null, homeX: b.x, homeY: b.y }));
    g.niches = g.gen.niches.map(n => ({ ...n }));
    g.hand = []; g.heldBell = null; g.sticky = false;
    g.streak = 0; g.runPearls = 0; g.runXp = 0; g.runMotes = 0; g.runBells = 0; g.runLumen = 0;
    g.echoT = 0; g.activeCd = 0; g.parts = []; g.shake = 0;
    g.phase = 'intro';
    hooks.onExpeditionStart(g.gen);
    return g.gen;
  };

  g.diveIn = function () {
    if (g.phase !== 'intro') return;
    g.phase = 'play';
    A.bubble(0.3); A.bubble(0.2);
    for (let i = 0; i < 14; i++) spark(g.bells[0].x, g.bells[0].y, g.gen.species[0].hue, 0.5);
  };

  // ---------- economy ----------
  const addPearl = n => { g.runPearls += n; };
  const addXp = n => {
    const before = 1 + Math.floor(Math.sqrt((profile.xp + g.runXp) / 40));
    g.runXp += n;
    const after = 1 + Math.floor(Math.sqrt((profile.xp + g.runXp) / 40));
    if (after > before) { A.rankUp(); g.hooks.onRankUp(after); flash(g.bells[0]?.x ?? 640, g.bells[0]?.y ?? 360, '#ffe9a8'); }
  };

  // ---------- input ----------
  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    const s = Math.min(r.width / WORLD.w, r.height / WORLD.h);
    return { x: (e.clientX - r.left - (r.width - WORLD.w * s) / 2) / s, y: (e.clientY - r.top - (r.height - WORLD.h * s) / 2) / s };
  }

  function snapRadius() { return has(profile, 'cradle') ? BELL_R + 54 : BELL_R + 34; }

  function grabNearestMote(x, y) {
    let best = null, bd = 40 * 40; // generous hit radius, kinder on hands
    for (const m of g.motes) {
      if (m.state !== 'free') continue;
      const d = (m.x - x) ** 2 + (m.y - y) ** 2;
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  function bellAt(x, y) {
    for (const b of g.bells) if (b.niche === null && (b.x - x) ** 2 + (b.y - y) ** 2 < BELL_R * BELL_R) return b;
    return null;
  }

  g.onDown = function (e) {
    if (g.phase !== 'play') return;
    const p = toWorld(e);
    Object.assign(g.pointer, p, { down: true, id: e.pointerId, downT: g.time, downX: p.x, downY: p.y, lastX: p.x, lastY: p.y });
    A.resume();
    if (g.sticky && g.hand.length) {
      // with Double Sip: tap a free mote to stack it instead of placing
      const m2 = grabNearestMote(p.x, p.y);
      if (has(profile, 'sip') && m2 && g.hand.length < 2) {
        m2.state = 'held'; g.hand.push(m2); A.plip(); return;
      }
      g.tryPlace(p); return;
    }
    const m = grabNearestMote(p.x, p.y);
    const max = has(profile, 'sip') ? 2 : 1;
    if (m && g.hand.length < max) {
      m.state = 'held'; g.hand.push(m); g.sticky = false;
      A.plip();
    } else if (!m) {
      const b = bellAt(p.x, p.y);
      if (b) { b.held = true; g.heldBell = b; A.plip(); }
    }
  };

  g.onMove = function (e) {
    if (g.phase !== 'play') return;
    const p = toWorld(e);
    const dt = Math.max(0.001, g.time - (g.pointer.t ?? g.time));
    g.pointer.vx = (p.x - g.pointer.x) / dt; g.pointer.vy = (p.y - g.pointer.y) / dt;
    Object.assign(g.pointer, p, { t: g.time });
  };

  g.onUp = function (e) {
    if (g.phase !== 'play') return;
    g.pointer.down = false;
    const p = toWorld(e);
    // a real tap spans at least one frame; a zero-duration press is a drag-place
    const tap = (g.time - g.pointer.downT) > 0 && (g.time - g.pointer.downT) < 0.22
      && Math.hypot(p.x - g.pointer.downX, p.y - g.pointer.downY) < 9;
    const tapCarry = profile.settings.tapCarry !== false;

    if (g.heldBell) {
      g.dropBell(p);
      return;
    }
    if (g.hand.length) {
      if (g.sticky) { /* sticky hand: place attempt happens on next down */ }
      else if (tap && tapCarry) { g.sticky = true; } // keep carrying without holding
      else g.tryPlace(p);
    }
  };

  g.onCancel = function () {
    if (g.heldBell) { g.heldBell.held = false; g.heldBell = null; }
    if (g.hand.length) { g.releaseHand(true); }
    g.sticky = false; g.pointer.down = false;
  };

  g.cancelCarry = function () {
    if (g.hand.length) { g.releaseHand(true); A.bubble(0.12); }
    g.sticky = false;
  };

  // try filing the top held mote into a bell under the hand (seated bells too);
  // else release there with a flick
  g.tryPlace = function (p) {
    const m = g.hand[g.hand.length - 1];
    if (!m) return;
    const b = g.bells.find(b => (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < snapRadius() * snapRadius());
    if (b && matchMoteBell(m, b)) { g.fileMote(m, b); }
    else if (b) { A.thud(); g.streak = Math.max(0, g.streak - 1); b.wobble = 1; g.releaseHand(true, p); }
    else { g.releaseHand(false, p); }
  };

  g.fileMote = function (m, b) {
    m.state = 'inbell';
    g.hand = g.hand.filter(h => h !== m);
    b.motes.push(m);
    b.wobble = 1; b.fillPulse = 1;
    g.streak += m.lumen ? 2 : 1;
    g.runMotes++;
    A.chime(g.streak);
    if (m.lumen) { g.runLumen++; addPearl(3); addXp(4); A.lumen(); ring(b.x, b.y, m.species, 44); }
    addPearl(1); addXp(2);
    for (let i = 0; i < (m.lumen ? 16 : 7); i++) spark(b.x, b.y - 10, g.gen.species[m.species].hue, 1);
    if (b.motes.length === b.capacity) {
      g.runBells++;
      A.bellChord(g.streak);
      addPearl(3); addXp(5);
      ring(b.x, b.y, m.species, 66);
      hooks.onBellFilled(b);
    }
    if (g.hand.length === 0) g.sticky = false;
    checkComplete();
  };

  g.releaseHand = function (gentle, at) {
    for (const m of g.hand) {
      m.state = 'free';
      m.x = (at?.x ?? g.pointer.x) + (Math.random() - 0.5) * 26;
      m.y = (at?.y ?? g.pointer.y) + (Math.random() - 0.5) * 26;
      if (!gentle) { m.vx = clampV(g.pointer.vx) * 0.7; m.vy = clampV(g.pointer.vy) * 0.7; }
    }
    g.hand = []; g.sticky = false;
  };

  g.dropBell = function (p) {
    const b = g.heldBell; b.held = false; g.heldBell = null;
    const n = g.niches.find(n => matchBellNiche(b, n) && (n.x - p.x) ** 2 + (n.y - p.y) ** 2 < snapRadius() ** 2);
    if (n) {
      b.x = n.x; b.y = n.y; b.niche = n.id; n.bellId = b.id;
      g.streak++;
      A.nicheFill(g.streak);
      addPearl(5); addXp(6);
      ring(n.x, n.y, b.species, 58);
      for (let i = 0; i < 10; i++) spark(n.x, n.y, g.gen.species[b.species].hue, 1);
      checkComplete();
    } else {
      // wrong spot: bounce home, gently pointed out (no penalty)
      const overWall = p.y > WALL.y0 - 20;
      if (overWall) { A.thud(); g.streak = Math.max(0, g.streak - 1); b.wobble = 1; }
      b.x = clamp(b.x, FIELD.x0 + 40, FIELD.x1 - 40);
      b.y = clamp(b.y, FIELD.y0 + 40, FIELD.y1 - 60);
    }
  };

  function checkComplete() {
    const done = g.bells.every(b => b.niche !== null && b.motes.length === b.capacity);
    if (done && g.phase === 'play') {
      g.phase = 'bloom'; g.bloomT = 0; g.bloomDone = false;
      A.bloom(g.bells.length);
      g.releaseHand(true);
      if (g.heldBell) { g.heldBell.held = false; g.heldBell = null; }
    }
  }

  g.finishRun = function () {
    const p = profile;
    const oldRank = 1 + Math.floor(Math.sqrt(p.xp / 40));
    p.pearls += g.runPearls; p.xp += g.runXp; p.expeditions++;
    p.bestStreak = Math.max(p.bestStreak, g.streak);
    p.log.push({ code: g.gen.code, streak: g.streak, motes: g.runMotes });
    p.log = p.log.slice(-6);
    return { rankBefore: oldRank, rankAfter: 1 + Math.floor(Math.sqrt(p.xp / 40)) };
  };

  // ---------- active skills ----------
  g.useActive = function () {
    if (g.phase !== 'play' || g.activeCd > 0) return;
    const id = profile.equippedA;
    const skill = SKILLS.find(s => s.id === id);
    if (!skill) return;
    g.activeId = id; g.activeCd = skill.cooldown;
    if (id === 'echo') {
      g.echoT = 4; A.sonar();
      ring(640, 360, null, 500);
    } else if (id === 'riptide') {
      A.riptideWhoosh();
      g.shake = 0.5;
      for (const m of g.motes) {
        if (m.state !== 'free') continue;
        const dx = m.x - g.pointer.x, dy = m.y - g.pointer.y;
        const d = Math.max(40, Math.hypot(dx, dy));
        m.vx += (dx / d) * 520 * (140 / d);
        m.vy += (dy / d) * 520 * (140 / d) - 60;
      }
      for (let i = 0; i < 30; i++) bubble(0.15);
    }
  };

  // ---------- update ----------
  g.update = function (dt) {
    g.time += dt;
    if (g.activeCd > 0) g.activeCd = Math.max(0, g.activeCd - dt);
    if (g.echoT > 0) g.echoT -= dt;
    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 1.6);

    if (g.phase === 'bloom') {
      g.bloomT += dt;
      // cascade: ignite bells one by one
      const idx = Math.floor((g.bloomT - 0.15) / 0.085);
      if (idx >= 0 && idx < g.bells.length && !g.bells[idx]._bloomed) {
        g.bells[idx]._bloomed = true;
        const b = g.bells[idx];
        ring(b.x, b.y, b.species, 120);
        for (let i = 0; i < 14; i++) spark(b.x, b.y, g.gen.species[b.species].hue, 1.4);
        flash(b.x, b.y, hsl(g.gen.species[b.species].hue, 70, 70));
      }
      if (g.bloomT > 0.15 + g.bells.length * 0.085 + 1.4 && !g.bloomDone) {
        g.bloomDone = true;
        hooks.onBloom(); // main shows the card
      }
    }

    // held things follow the pointer
    if (g.heldBell) {
      const b = g.heldBell;
      b.x += (g.pointer.x - b.x) * Math.min(1, dt * 14);
      b.y += (g.pointer.y - b.y) * Math.min(1, dt * 14);
    }
    g.hand.forEach((m, i) => {
      const tx = g.pointer.x + (i - (g.hand.length - 1) / 2) * 22, ty = g.pointer.y - 14 - i * 6;
      m.x += (tx - m.x) * Math.min(1, dt * 16);
      m.y += (ty - m.y) * Math.min(1, dt * 16);
    });

    if (g.phase === 'play' || g.phase === 'intro' || g.phase === 'bloom') {
      physics(dt);
      updateParts(dt);
      A.tickAmbience(dt, g.streak);
    }
  };

  function physics(dt) {
    const free = g.motes.filter(m => m.state === 'free');
    for (const m of free) {
      m.vy += Math.sin(g.time * 1.3 + m.phase) * 6 * dt;          // buoyant idle drift
      m.vx += Math.cos(g.time * 0.9 + m.phase * 2) * 5 * dt;
      const damp = Math.pow(0.90, dt * 60);
      m.vx *= damp; m.vy *= damp;
      // shy away from the hand / pointer (see under the pile)
      if (g.pointer.x > 0 && g.phase === 'play') {
        const dx = m.x - g.pointer.x, dy = m.y - g.pointer.y, d = Math.hypot(dx, dy);
        if (d < 70 && d > 0.01) { const f = (70 - d) * 9 * dt; m.vx += (dx / d) * f; m.vy += (dy / d) * f; }
      }
    }
    // soft separation
    for (let i = 0; i < free.length; i++) {
      const a = free[i];
      for (let j = i + 1; j < free.length; j++) {
        const b = free[j];
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, min = MOTE_R * 2.1;
        if (d2 < min * min && d2 > 0.0001) {
          const d = Math.sqrt(d2), f = ((min - d) / min) * 60 * dt;
          const ux = dx / d, uy = dy / d;
          a.vx -= ux * f; a.vy -= uy * f; b.vx += ux * f; b.vy += uy * f;
        }
      }
    }
    for (const m of free) {
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.x < FIELD.x0 + MOTE_R) { m.x = FIELD.x0 + MOTE_R; m.vx = Math.abs(m.vx) * 0.4; }
      if (m.x > FIELD.x1 - MOTE_R) { m.x = FIELD.x1 - MOTE_R; m.vx = -Math.abs(m.vx) * 0.4; }
      if (m.y < FIELD.y0 + MOTE_R) { m.y = FIELD.y0 + MOTE_R; m.vy = Math.abs(m.vy) * 0.4; }
      if (m.y > FIELD.y1 - MOTE_R) { m.y = FIELD.y1 - MOTE_R; m.vy = -Math.abs(m.vy) * 0.4; }
    }
    // wobble decay for bells
    for (const b of g.bells) {
      b.wobble = Math.max(0, b.wobble - dt * 2.4);
      b.fillPulse = Math.max(0, b.fillPulse - dt * 1.8);
    }
  }

  // ---------- particles ----------
  function spark(x, y, hue, scale) {
    if (g.parts.length > 420) return;
    const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 160 * scale;
    g.parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.4, max: 1, size: (1.5 + Math.random() * 2.5) * scale, hue });
  }
  function ring(x, y, species, size) { g.parts.push({ kind: 'ring', x, y, life: 0.7, max: 0.7, size, species }); }
  function flash(x, y, color) { g.parts.push({ kind: 'flash', x, y, life: 0.5, max: 0.5, color }); }
  function updateParts(dt) {
    for (let i = g.parts.length - 1; i >= 0; i--) {
      const p = g.parts[i];
      p.life -= dt;
      if (p.life <= 0) { g.parts.splice(i, 1); continue; }
      if (p.kind === 'spark') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
    }
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const clampV = v => Math.max(-900, Math.min(900, v));
  const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;

  return g;
}
