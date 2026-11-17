// TIDEKEEPER render.js - Canvas 2D painter. Dark abyss, god rays, glass bells,
// glowing plankton motes. Additive glow sprites (cached per hue) for cheap light.

import { WORLD, WALL } from './gen.js';
import { has } from './skills.js';

const MOTE_R = 13, BELL_R = 34, NICHE_R = 30;

const glowCache = new Map();
function glowSprite(hue) {
  const key = Math.round(hue / 6) * 6;
  if (glowCache.has(key)) return glowCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const x = c.getContext('2d');
  const grad = x.createRadialGradient(48, 48, 2, 48, 48, 48);
  grad.addColorStop(0, `hsla(${key},90%,88%,0.95)`);
  grad.addColorStop(0.25, `hsla(${key},85%,65%,0.55)`);
  grad.addColorStop(1, `hsla(${key},80%,50%,0)`);
  x.fillStyle = grad;
  x.fillRect(0, 0, 96, 96);
  glowCache.set(key, c);
  return c;
}

let dust = [];
function initDust() {
  dust = Array.from({ length: 36 }, () => ({
    x: Math.random() * WORLD.w, y: Math.random() * WORLD.h,
    r: 0.6 + Math.random() * 1.6, sp: 4 + Math.random() * 10, ph: Math.random() * 7,
  }));
}
initDust();

export function draw(ctx, g, w, h) {
  const s = Math.min(w / WORLD.w, h / WORLD.h);
  const ox = (w - WORLD.w * s) / 2, oy = (h - WORLD.h * s) / 2;
  const rm = g.profile.settings.reduceMotion;
  const shake = g.shake > 0 ? g.shake : 0;

  // backdrop (letterbox bars)
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#01040c'); bg.addColorStop(1, '#020617');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(ox + (Math.random() - 0.5) * shake * 10, oy + (Math.random() - 0.5) * shake * 10);
  ctx.scale(s, s);
  ctx.beginPath(); ctx.rect(0, 0, WORLD.w, WORLD.h); ctx.clip();

  // water gradient
  const wg = ctx.createLinearGradient(0, 0, 0, WORLD.h);
  wg.addColorStop(0, '#06294d'); wg.addColorStop(0.55, '#041a35'); wg.addColorStop(1, '#031226');
  ctx.fillStyle = wg; ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  // god rays
  if (!rm) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = 160 + i * 300 + Math.sin(g.time * 0.13 + i * 1.7) * 60;
      const wTop = 60 + i * 14, wBot = wTop * 3.2;
      const gr = ctx.createLinearGradient(0, 0, 0, 560);
      gr.addColorStop(0, 'rgba(140,190,255,0.10)'); gr.addColorStop(1, 'rgba(140,190,255,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(x - wTop, 0); ctx.lineTo(x + wTop, 0);
      ctx.lineTo(x + wBot, 560); ctx.lineTo(x - wBot, 560);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // drifting dust
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const d of dust) {
    const y = (d.y - g.time * d.sp) % WORLD.h, yy = y < 0 ? y + WORLD.h : y;
    const x = d.x + (rm ? 0 : Math.sin(g.time * 0.4 + d.ph) * 14);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#9fc4ff';
    ctx.beginPath(); ctx.arc(x, yy, d.r, 0, 7); ctx.fill();
  }
  ctx.restore();

  drawWall(ctx, g, rm);
  drawEchoLines(ctx, g);
  drawBells(ctx, g, rm);
  drawMotes(ctx, g);
  drawHand(ctx, g);
  drawParticles(ctx, g);

  ctx.restore();
}

function drawWall(ctx, g, rm) {
  // stone creel band
  const grad = ctx.createLinearGradient(0, WALL.y0, 0, WALL.y1);
  grad.addColorStop(0, '#0a1b2e'); grad.addColorStop(1, '#050d18');
  ctx.fillStyle = grad;
  roundRect(ctx, WALL.x0 - 10, WALL.y0 - 14, WALL.x1 - WALL.x0 + 20, WALL.y1 - WALL.y0 + 26, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,170,220,0.14)'; ctx.lineWidth = 1.5;
  roundRect(ctx, WALL.x0 - 10, WALL.y0 - 14, WALL.x1 - WALL.x0 + 20, WALL.y1 - WALL.y0 + 26, 18);
  ctx.stroke();

  for (const n of g.niches) {
    const sp = g.gen.species[n.species];
    const filled = n.bellId !== null;
    const nr = Math.min(NICHE_R, n.cw / 2 - 6, n.ch / 2 - 4); // recess fits its grid cell
    // recess
    ctx.fillStyle = filled ? 'rgba(10,22,38,0.9)' : 'rgba(4,10,20,0.75)';
    roundRect(ctx, n.x - nr - 4, n.y - nr - 2, (nr + 4) * 2, nr * 2 + 12, 10);
    ctx.fill();
    ctx.strokeStyle = `hsla(${sp.hue},60%,60%,${filled ? 0.5 : 0.22})`;
    ctx.stroke();

    if (!filled) {
      // engraved glyph + pips: the slot's identity
      ctx.globalAlpha = 0.5;
      drawGlyph(ctx, sp.glyph, n.x, n.y - 4, Math.min(11, nr * 0.4), `hsl(${sp.hue},55%,52%)`);
      ctx.globalAlpha = 0.8;
      drawPips(ctx, n.num, n.x, n.y + nr * 0.45 + 2, `hsl(${sp.hue},50%,60%)`);
      ctx.globalAlpha = 1;
    }
  }
}

function drawEchoLines(ctx, g) {
  if (g.echoT <= 0) return;
  const alpha = Math.min(1, g.echoT / 1.5) * 0.6;
  ctx.save();
  ctx.setLineDash([4, 7]);
  ctx.lineDashOffset = -g.time * 40;
  for (const b of g.bells) {
    if (b.niche !== null || b.motes.length >= b.capacity) continue;
    let best = null, bd = Infinity;
    for (const m of g.motes) {
      if (m.state !== 'free') continue;
      if (m.species !== b.species || m.num !== b.num) continue;
      const d = (m.x - b.x) ** 2 + (m.y - b.y) ** 2;
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) continue;
    const sp = g.gen.species[b.species];
    ctx.strokeStyle = `hsla(${sp.hue},80%,70%,${alpha})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(best.x, best.y); ctx.stroke();
    ctx.fillStyle = `hsla(${sp.hue},80%,80%,${alpha})`;
    ctx.beginPath(); ctx.arc(best.x, best.y, 4, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function drawBells(ctx, g, rm) {
  for (const b of g.bells) {
    const sp = g.gen.species[b.species];
    const held = g.heldBell === b;
    const full = b.motes.length >= b.capacity;
    const wobble = Math.sin(b.wobble * 12) * b.wobble * 0.1;
    const pulse = has(g.profile, 'sense') && !full && b.niche === null
      ? 0.5 + 0.5 * Math.sin(g.time * 2.2 + b.id) : 0;
    const lantern = has(g.profile, 'lantern') && g.hand.length &&
      g.hand.some(m => m.species === b.species && m.num === b.num && !full);

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(wobble);
    const lift = held ? 1.06 : 1;
    ctx.scale(lift, lift);

    // glow under bell (fills / lantern / sense / echo match)
    let glowA = full ? 0.55 : 0;
    if (lantern) glowA = Math.max(glowA, 0.5 + 0.2 * Math.sin(g.time * 4));
    glowA = Math.max(glowA, pulse * 0.25);
    if (glowA > 0.02) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = glowA;
      ctx.drawImage(glowSprite(sp.hue), -BELL_R * 1.7, -BELL_R * 1.7, BELL_R * 3.4, BELL_R * 3.4);
      ctx.restore();
    }

    // glass body: dome + skirt
    const glassGrad = ctx.createLinearGradient(-BELL_R, -BELL_R, BELL_R, BELL_R);
    glassGrad.addColorStop(0, 'rgba(180,215,255,0.22)');
    glassGrad.addColorStop(1, 'rgba(120,170,230,0.10)');
    ctx.fillStyle = glassGrad;
    ctx.strokeStyle = `hsla(${sp.hue},70%,78%,0.75)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-BELL_R, BELL_R * 0.72);
    ctx.lineTo(-BELL_R, -BELL_R * 0.1);
    ctx.arc(0, -BELL_R * 0.1, BELL_R, Math.PI, 0);
    ctx.lineTo(BELL_R, BELL_R * 0.72);
    ctx.quadraticCurveTo(0, BELL_R * 0.92, -BELL_R, BELL_R * 0.72);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // highlight streak
    ctx.strokeStyle = 'rgba(220,240,255,0.35)'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(-BELL_R * 0.35, -BELL_R * 0.15, BELL_R * 0.62, Math.PI * 1.15, Math.PI * 1.45);
    ctx.stroke();

    // cork
    ctx.fillStyle = '#7a5c3e';
    roundRect(ctx, -9, -BELL_R * 0.1 - BELL_R - 10, 18, 13, 5); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(ctx, -9, -BELL_R * 0.1 - BELL_R - 4, 18, 3, 1); ctx.fill();

    // motes stacked inside (clipped to the glass)
    if (b.motes.length) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-BELL_R + 2, BELL_R * 0.72);
      ctx.lineTo(-BELL_R + 2, -BELL_R * 0.1);
      ctx.arc(0, -BELL_R * 0.1, BELL_R - 2, Math.PI, 0);
      ctx.lineTo(BELL_R - 2, BELL_R * 0.72);
      ctx.quadraticCurveTo(0, BELL_R * 0.92 - 2, -BELL_R + 2, BELL_R * 0.72);
      ctx.clip();
      b.motes.forEach((m, i) => {
        const mx = ((i % 3) - 1) * 16, my = BELL_R * 0.5 - Math.floor(i / 3) * 20;
        drawMote(ctx, m, mx, my, g, 0.72);
      });
      ctx.restore();
    }

    // identity tag below the bell
    ctx.fillStyle = 'rgba(3,10,20,0.72)';
    roundRect(ctx, -30, BELL_R * 0.72 + 6, 60, 22, 8); ctx.fill();
    drawGlyph(ctx, sp.glyph, -14, BELL_R * 0.72 + 17, 8, `hsl(${sp.hue},80%,72%)`);
    drawPips(ctx, b.num, 10, BELL_R * 0.72 + 17, `hsl(${sp.hue},40%,86%)`);
    ctx.restore();
  }
}

function drawMotes(ctx, g) {
  // free + loose first, hand last (drawn in drawHand)
  for (const m of g.motes) {
    if (m.state === 'inbell' || m.state === 'held') continue;
    drawMote(ctx, m, m.x, m.y, g, 1);
  }
}

function drawMote(ctx, m, x, y, g, scale) {
  const sp = g.gen.species[m.species];
  const bob = m.state === 'free' && !g.profile.settings.reduceMotion ? Math.sin(g.time * 2 + m.phase) * 2 : 0;
  const r = MOTE_R * scale;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.85;
  const gs = r * 3.1;
  ctx.drawImage(glowSprite(sp.hue), x - gs / 2, y + bob - gs / 2, gs, gs);
  ctx.restore();

  // lumen ring: prismatic, hue cycles
  if (m.lumen) {
    const t = (g.time * 1.4 + m.phase) % 1;
    ctx.strokeStyle = `hsla(${t * 360},95%,72%,0.9)`;
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(x, y + bob, r + 4, 0, 7); ctx.stroke();
  }

  ctx.fillStyle = `hsl(${sp.hue},85%,${m.lumen ? 78 : 68}%)`;
  drawGlyph(ctx, sp.glyph, x, y + bob, r, ctx.fillStyle);

  // species-light core dot
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(x - r * 0.28, y + bob - r * 0.28, r * 0.18, 0, 7); ctx.fill();
}

function drawHand(ctx, g) {
  for (const m of g.hand) {
    drawMote(ctx, m, m.x, m.y, g, 1.15);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(m.x, m.y, MOTE_R * 1.7, 0, 7); ctx.stroke();
  }
}

function drawParticles(ctx, g) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of g.parts) {
    const t = p.life / p.max;
    if (p.kind === 'spark') {
      ctx.globalAlpha = t * 0.9;
      ctx.fillStyle = `hsl(${p.hue},90%,72%)`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * t + 0.5, 0, 7); ctx.fill();
    } else if (p.kind === 'ring') {
      const hue = p.species === null || p.species === undefined ? 200 : g.gen.species[p.species].hue;
      ctx.globalAlpha = t * 0.7;
      ctx.strokeStyle = `hsl(${hue},85%,75%)`;
      ctx.lineWidth = 2.5 * t + 0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - t) + 6, 0, 7); ctx.stroke();
    } else if (p.kind === 'flash') {
      const rr = 120 * (1 - t) + 20;
      const gr = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, rr);
      gr.addColorStop(0, p.color); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = t * 0.5;
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}

function drawGlyph(ctx, name, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.6, r * 0.22);
  ctx.beginPath();
  switch (name) {
    case 'triangle':
      ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.9, y + r * 0.7); ctx.lineTo(x - r * 0.9, y + r * 0.7);
      ctx.closePath(); ctx.fill(); break;
    case 'diamond':
      ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.75, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.75, y);
      ctx.closePath(); ctx.fill(); break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill(); break;
    case 'ring':
      ctx.arc(x, y, r * 0.75, 0, 7); ctx.stroke(); break;
    case 'spark':
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.stroke(); break;
    case 'cross':
      ctx.fillRect(x - r * 0.28, y - r, r * 0.56, r * 2);
      ctx.fillRect(x - r, y - r * 0.28, r * 2, r * 0.56); break;
    case 'chevron':
      ctx.moveTo(x - r, y - r * 0.6); ctx.lineTo(x, y + r * 0.4); ctx.lineTo(x + r, y - r * 0.6);
      ctx.lineWidth = Math.max(2.4, r * 0.4); ctx.stroke(); break;
    default: // circle
      ctx.arc(x, y, r * 0.8, 0, 7); ctx.fill();
  }
}

function drawPips(ctx, n, x, y, color) {
  ctx.fillStyle = color;
  const off = (n - 1) * 7;
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(x - off + i * 7, y, 2.4, 0, 7); ctx.fill(); }
}

// legend chip helper for the intro card
export function drawLegendGlyph(c2, glyph, hue, x, y, r) {
  drawGlyph(c2, glyph, x, y, r, `hsl(${hue},80%,70%)`);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
