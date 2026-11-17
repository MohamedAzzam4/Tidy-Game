/**
 * Canvas renderer — flat 2D top-down beach, everything drawn procedurally
 * (no image assets). Shape language is deliberately organic (round critters,
 * glass, driftwood) — the "different shapes, not an identical twin" brief.
 *
 * Pure draw code: no input handling, no game rules. `ViewAnim` carries the
 * animated bits the view owns (carried items, flights, particles, effects).
 */
import type { CritterDef, JarDef, SpeciesDef, World } from '../game/types';
import type { TideGame } from '../game/model';

export interface Camera { x: number; y: number; zoom: number }

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; hue: number;
  kind: 'spark' | 'bubble' | 'ring';
}

export interface Flight {
  critterId?: string; jarId?: string; cubbyId?: string;
  fromX: number; fromY: number; toX: number; toY: number;
  t: number; dur: number; onArrive: 'file' | 'shelve';
}

export interface ViewAnim {
  carried: Array<{ id: string; x: number; y: number; species: string; size: number; golden: boolean }>;
  carriedJar: { id: string; x: number; y: number; species: string; sealed: boolean } | null;
  carriedTarget: { x: number; y: number } | null;
  flights: Flight[];
  particles: Particle[];
  moonlightUntil: number;
  gullsEyeUntil: number;
  hover: { kind: 'jar' | 'cubby'; id: string } | null;
  splash: Array<{ x: number; y: number; at: number }>;
  finaleGlow: number;
}

export function newViewAnim(): ViewAnim {
  return { carried: [], carriedJar: null, carriedTarget: null, flights: [], particles: [], moonlightUntil: 0, gullsEyeUntil: 0, hover: null, splash: [], finaleGlow: 0 };
}

const PALETTE = {
  water: '#16324a',
  waterDeep: '#0d2233',
  sand: '#e7cfa5',
  sandShade: '#d8b987',
  foam: '#eef7f4',
  wood: '#7a5a3e',
  woodDark: '#5d4330',
  woodLight: '#96764f',
  ink: '#2c2033',
  cream: '#f6efe0',
};

// ————— species painters — all shapes hand-built, wobble included —————

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = 'rgba(44,32,51,0.18)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.15, y + r * 0.22, r * 1.02, r * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();
}

function starPaint(ctx: CanvasRenderingContext2D, r: number, hue: number, t: number): void {
  ctx.fillStyle = `hsl(${hue} 72% 64%)`;
  ctx.strokeStyle = `hsl(${hue} 60% 45%)`;
  ctx.lineWidth = r * 0.14;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + Math.sin(t * 2) * 0.03;
    const wig = Math.sin(t * 3 + i) * r * 0.03;
    const tipX = Math.cos(a) * (r + wig);
    const tipY = Math.sin(a) * (r + wig);
    const b1 = a - Math.PI / 5;
    const b2 = a + Math.PI / 5;
    if (i === 0) ctx.moveTo(tipX, tipY);
    else ctx.lineTo(tipX, tipY);
    ctx.quadraticCurveTo(Math.cos(b1) * r * 0.5, Math.sin(b1) * r * 0.5, Math.cos(a + Math.PI / 5) * r * 0.42, Math.sin(a + Math.PI / 5) * r * 0.42);
    ctx.quadraticCurveTo(Math.cos(b2) * r * 0.5, Math.sin(b2) * r * 0.5, 0, 0);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = `hsl(${hue} 80% 78%)`;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function shellPaint(ctx: CanvasRenderingContext2D, r: number, hue: number, t: number): void {
  ctx.fillStyle = `hsl(${hue} 55% 78%)`;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `hsl(${hue} 45% 48%)`;
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 5; a += 0.25) {
    const rr = r * 0.14 * Math.exp(a * 0.22);
    const x = Math.cos(a + t * 0.2) * rr;
    const y = Math.sin(a + t * 0.2) * rr;
    if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function jellyPaint(ctx: CanvasRenderingContext2D, r: number, hue: number, t: number): void {
  const pulse = 1 + Math.sin(t * 2.4) * 0.06;
  ctx.fillStyle = `hsla(${hue} 70% 76% / 0.85)`;
  ctx.beginPath();
  ctx.arc(0, -r * 0.15, r * pulse, Math.PI, 0);
  ctx.quadraticCurveTo(r * pulse * 0.6, r * 0.25, 0, r * 0.2);
  ctx.quadraticCurveTo(-r * pulse * 0.6, r * 0.25, -r * pulse, -r * 0.15);
  ctx.fill();
  ctx.strokeStyle = `hsla(${hue} 60% 62% / 0.8)`;
  ctx.lineWidth = r * 0.09;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * r * 0.32, r * 0.2);
    ctx.quadraticCurveTo(i * r * 0.32 + Math.sin(t * 3 + i) * r * 0.18, r * 0.65, i * r * 0.36 + Math.sin(t * 2.4 + i) * r * 0.22, r * 1.05);
    ctx.stroke();
  }
}

function crabPaint(ctx: CanvasRenderingContext2D, r: number, hue: number, t: number): void {
  const scuttle = Math.sin(t * 4) * r * 0.04;
  ctx.fillStyle = `hsl(${hue} 62% 56%)`;
  ctx.beginPath();
  ctx.ellipse(0, scuttle, r * 0.8, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `hsl(${hue} 55% 42%)`;
  ctx.lineWidth = r * 0.12;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.6, -r * 0.5);
    ctx.quadraticCurveTo(s * r * 1.15, -r * 0.75 + scuttle, s * r * 1.05, -r * 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s * r * 1.05, -r * 0.28, r * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.5, r * 0.2 + i * r * 0.22);
      ctx.lineTo(s * r * 0.95, r * 0.42 + i * r * 0.3);
      ctx.stroke();
    }
  }
  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.arc(-r * 0.22, -r * 0.32, r * 0.07, 0, Math.PI * 2);
  ctx.arc(r * 0.22, -r * 0.32, r * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

function glassPaint(ctx: CanvasRenderingContext2D, r: number, hue: number, t: number): void {
  ctx.fillStyle = `hsla(${hue} 65% 70% / 0.75)`;
  ctx.beginPath();
  const k = 4;
  for (let i = 0; i <= k; i++) {
    const a = (i / k) * Math.PI * 2 + 0.4;
    const rr = r * (i % 2 ? 0.62 : 1) * (1 + Math.sin(t * 1.5 + i) * 0.04);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, -r * 0.35);
  ctx.lineTo(-r * 0.05, -r * 0.5);
  ctx.lineTo(-r * 0.35, -r * 0.05);
  ctx.closePath();
  ctx.fill();
}

function dollarPaint(ctx: CanvasRenderingContext2D, r: number, hue: number, t: number): void {
  ctx.fillStyle = `hsl(${hue} 62% 82%)`;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `hsl(${hue} 52% 60%)`;
  ctx.lineWidth = r * 0.1;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + t * 0.15;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
    ctx.lineTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
  ctx.stroke();
}

function clamPaint(ctx: CanvasRenderingContext2D, r: number, hue: number, t: number): void {
  ctx.fillStyle = `hsl(${hue} 58% 80%)`;
  ctx.beginPath();
  ctx.moveTo(0, r);
  ctx.quadraticCurveTo(-r * 1.1, r * 0.2, -r * 0.55, -r * 0.55);
  ctx.quadraticCurveTo(0, -r * 0.95, r * 0.55, -r * 0.55);
  ctx.quadraticCurveTo(r * 1.1, r * 0.2, 0, r);
  ctx.fill();
  ctx.strokeStyle = `hsl(${hue} 48% 58%)`;
  ctx.lineWidth = r * 0.07;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(0, r * 0.95);
    ctx.quadraticCurveTo(-r * 0.22 * i, r * 0.1, -r * 0.16 * i, -r * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, r * 0.95);
    ctx.quadraticCurveTo(r * 0.22 * i, r * 0.1, r * 0.16 * i, -r * 0.4);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(Math.sin(t) * r * 0.05, -r * 0.05, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function urchinPaint(ctx: CanvasRenderingContext2D, r: number, hue: number, t: number): void {
  ctx.strokeStyle = `hsl(${hue} 55% 45%)`;
  ctx.lineWidth = r * 0.1;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.sin(t * 1.5 + i) * 0.06;
    const rr = r * (0.75 + Math.sin(t * 2 + i * 2) * 0.1);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    ctx.stroke();
  }
  ctx.fillStyle = `hsl(${hue} 60% 38%)`;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
}

function floatPaint(ctx: CanvasRenderingContext2D, r: number, hue: number, t: number): void {
  ctx.fillStyle = `hsla(${hue} 70% 62% / 0.85)`;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(-r * 0.35, -r * 0.35, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `hsl(${hue} 45% 40% / 0.8)`;
  ctx.lineWidth = r * 0.08;
  const w = Math.sin(t * 1.2) * 0.2;
  for (const off of [-0.4, 0, 0.4]) {
    ctx.beginPath();
    ctx.moveTo(-r, off * r + w);
    ctx.quadraticCurveTo(0, off * r * 1.4, r, off * r + w);
    ctx.stroke();
  }
}

function conchPaint(ctx: CanvasRenderingContext2D, r: number, hue: number, t: number): void {
  ctx.fillStyle = `hsl(${hue} 60% 72%)`;
  ctx.beginPath();
  ctx.moveTo(r * 0.95, r * 0.3);
  ctx.quadraticCurveTo(r * 0.2, r * 1.05, -r * 0.7, r * 0.45);
  ctx.quadraticCurveTo(-r * 1.05, -r * 0.1, -r * 0.4, -r * 0.6);
  ctx.quadraticCurveTo(r * 0.3, -r * 0.9, r * 0.95, r * 0.3);
  ctx.fill();
  ctx.strokeStyle = `hsl(${hue} 50% 50%)`;
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 3.2; a += 0.3) {
    const rr = r * 0.12 * Math.exp(a * 0.3);
    const x = -r * 0.15 + Math.cos(a + t * 0.3) * rr;
    const y = r * 0.05 + Math.sin(a + t * 0.3) * rr;
    if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function anemonePaint(ctx: CanvasRenderingContext2D, r: number, hue: number, t: number): void {
  ctx.strokeStyle = `hsl(${hue} 55% 50%)`;
  ctx.lineWidth = r * 0.14;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const sway = Math.sin(t * 2.2 + i * 1.7) * 0.22;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
    ctx.quadraticCurveTo(Math.cos(a + sway) * r * 0.7, Math.sin(a + sway) * r * 0.7, Math.cos(a + sway * 1.8) * r * 1.02, Math.sin(a + sway * 1.8) * r * 1.02);
    ctx.stroke();
  }
  ctx.fillStyle = `hsl(${hue} 62% 62%)`;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `hsl(${hue} 70% 76%)`;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
  ctx.fill();
}

function ringPaint(ctx: CanvasRenderingContext2D, r: number, hue: number, t: number): void {
  ctx.strokeStyle = `hsl(${hue} 55% 48%)`;
  ctx.lineWidth = r * 0.32;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, t * 0.4, t * 0.4 + Math.PI * 1.85);
  ctx.stroke();
  ctx.strokeStyle = `hsl(${hue} 62% 62%)`;
  ctx.lineWidth = r * 0.14;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, t * 0.4 + 2, t * 0.4 + Math.PI * 1.6);
  ctx.stroke();
}

const PAINTERS: Record<SpeciesDef['glyph'], (ctx: CanvasRenderingContext2D, r: number, hue: number, t: number) => void> = {
  star: starPaint, shell: shellPaint, jelly: jellyPaint, crab: crabPaint, glass: glassPaint,
  dollar: dollarPaint, clam: clamPaint, urchin: urchinPaint, float: floatPaint, conch: conchPaint,
  anemone: anemonePaint, ring: ringPaint,
};

/** Draw one critter (or mini specimen) centered at x,y. */
export function drawCritterShape(
  ctx: CanvasRenderingContext2D, sp: SpeciesDef, x: number, y: number, r: number, rot: number, t: number, golden: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (golden) {
    const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2);
    glow.addColorStop(0, 'rgba(255, 214, 110, 0.5)');
    glow.addColorStop(1, 'rgba(255, 214, 110, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
    ctx.fill();
    PAINTERS[sp.glyph](ctx, r, 45, t);
  } else {
    PAINTERS[sp.glyph](ctx, r, sp.hue, t);
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ————— scene pieces —————

function drawBackdrop(ctx: CanvasRenderingContext2D, world: World, t: number, viewW: number, viewH: number): void {
  // water fills everything, the shore is a rounded sand spit on top
  const g = ctx.createLinearGradient(0, -40, 0, world.shore.h + 60);
  g.addColorStop(0, PALETTE.waterDeep);
  g.addColorStop(1, PALETTE.water);
  ctx.fillStyle = g;
  ctx.fillRect(-200, -200, viewW + 400, viewH + 400);

  const shore = world.shore;
  ctx.fillStyle = PALETTE.sand;
  roundRect(ctx, shore.x, shore.y, shore.w, shore.h, 18);
  ctx.fill();
  // wet sand rim
  ctx.strokeStyle = PALETTE.sandShade;
  ctx.lineWidth = 5;
  ctx.stroke();

  // animated foam licking the shore edge
  ctx.strokeStyle = 'rgba(238,247,244,0.75)';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  const off = Math.sin(t * 0.5) * 2.4;
  for (let x = shore.x + 8; x < shore.x + shore.w - 8; x += 6) {
    const y = shore.y + shore.h - 4 + Math.sin(x * 0.14 + t * 0.9) * 1.8 + off;
    if (x === shore.x + 8) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // seeded decor
  for (const p of world.decor.pebbles) {
    ctx.fillStyle = `hsl(${p.hue} 26% 62%)`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.r, p.r * 0.72, p.hue, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const s of world.decor.shells) {
    ctx.fillStyle = `hsla(${s.hue} 40% 88% / 0.85)`;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, 0.7, 0.5, s.rot, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const l of world.decor.lanterns) {
    const glow = ctx.createRadialGradient(l.x, l.y, 0.5, l.x, l.y, 9);
    glow.addColorStop(0, 'rgba(255, 200, 120, 0.5)');
    glow.addColorStop(1, 'rgba(255, 200, 120, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(l.x, l.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.woodDark;
    ctx.beginPath();
    ctx.arc(l.x, l.y, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd88a';
    ctx.beginPath();
    ctx.arc(l.x, l.y, 0.55 + Math.sin(t * 3 + l.x) * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWall(ctx: CanvasRenderingContext2D, world: World, model: TideGame, t: number, speciesBy: Map<string, SpeciesDef>): void {
  const wall = world.wall;
  // driftwood panel
  ctx.fillStyle = PALETTE.woodDark;
  roundRect(ctx, wall.x - 1.5, wall.y - 2.5, wall.w + 3, wall.h + 5, 4);
  ctx.fill();
  ctx.fillStyle = PALETTE.wood;
  roundRect(ctx, wall.x, wall.y, wall.w, wall.h, 3);
  ctx.fill();
  // plank lines
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 0.3;
  for (let i = 1; i < 4; i++) {
    const y = wall.y + (wall.h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(wall.x, y + Math.sin(i * 3) * 0.5);
    ctx.lineTo(wall.x + wall.w, y + Math.cos(i * 2) * 0.5);
    ctx.stroke();
  }
  // carved title
  ctx.fillStyle = 'rgba(246,239,224,0.75)';
  ctx.font = `600 ${Math.max(1.6, wall.w * 0.11)}px ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('TIDE LEDGER', wall.x + wall.w / 2, wall.y - 1);

  const cols = Math.max(...world.cubbies.map((c) => c.col)) + 1;
  const rows = Math.max(...world.cubbies.map((c) => c.row)) + 1;
  const cw = wall.w / cols;
  const ch = wall.h / rows;
  for (const cubby of world.cubbies) {
    const cx = wall.x + cubby.col * cw;
    const cy = wall.y + cubby.row * ch;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(ctx, cx + 0.8, cy + 0.8, cw - 1.6, ch - 1.6, 2.5);
    ctx.fill();

    const sp = speciesBy.get(cubby.species)!;
    const shelved = world.jars.filter((j) => j.species === cubby.species && model.jarLocation(j.id) === 'shelved').length;
    const total = world.jars.filter((j) => j.species === cubby.species).length;
    const done = shelved >= total;
    if (done) {
      const glow = ctx.createRadialGradient(cx + cw / 2, cy + ch / 2, 1, cx + cw / 2, cy + ch / 2, cw);
      glow.addColorStop(0, 'rgba(255, 214, 110, 0.35)');
      glow.addColorStop(1, 'rgba(255, 214, 110, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx, cy, cw, ch);
    }

    // species specimen + count
    const gx = cx + cw / 2;
    const gy = cy + ch * 0.36;
    drawCritterShape(ctx, sp, gx, gy, Math.min(cw, ch) * 0.22, 0, t, false);
    ctx.fillStyle = done ? '#ffe9b0' : PALETTE.cream;
    ctx.font = `600 ${Math.max(1.2, ch * 0.14)}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${shelved}/${total}`, gx, cy + ch * 0.62);
    // shelf pips for each jar slot
    for (let i = 0; i < total; i++) {
      ctx.fillStyle = i < shelved ? '#ffd88a' : 'rgba(246,239,224,0.25)';
      ctx.beginPath();
      ctx.arc(gx + (i - (total - 1) / 2) * Math.min(2.2, (cw - 2) / total), cy + ch * 0.82, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawJar(
  ctx: CanvasRenderingContext2D, world: World, model: TideGame, jar: JarDef,
  x: number, y: number, rot: number, t: number, speciesBy: Map<string, SpeciesDef>, highlight: boolean,
): void {
  const sp = speciesBy.get(jar.species)!;
  const fill = model.fillOf(jar.id);
  const sealed = model.isSealed(jar.id);
  const w = 4.4;
  const h = 5.6;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  shadow(ctx, 0, 0, w * 0.55);
  // glass body
  ctx.fillStyle = sealed ? 'rgba(214,236,255,0.4)' : 'rgba(226,244,255,0.34)';
  roundRect(ctx, -w / 2, -h / 2, w, h, 1.3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 0.28;
  ctx.stroke();
  // liquid + critters inside
  const level = -h / 2 + h * (0.14 + 0.8 * (fill / jar.capacity));
  if (fill > 0) {
    ctx.fillStyle = `hsla(${sp.hue} 60% 62% / 0.4)`;
    roundRect(ctx, -w / 2 + 0.28, level, w - 0.56, h / 2 - level + h / 2 - 0.3, 0.9);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-w / 2 + 0.28, level, w - 0.56, 0.16);
    const members = world.critters.filter((c) => c.jarId === jar.id).slice(0, fill);
    members.forEach((c, i) => {
      const mx = -w * 0.24 + (i % 2) * w * 0.42;
      const my = level + h * 0.14 + Math.floor(i / 2) * h * 0.2 + Math.sin(t * 2 + i) * 0.12;
      drawCritterShape(ctx, sp, mx, Math.min(my, h / 2 - 0.7), 0.72, Math.sin(t + i) * 0.2, t + i, c.golden);
    });
  }
  // tag: mini specimen + number
  ctx.fillStyle = PALETTE.cream;
  roundRect(ctx, -w / 2 + 0.4, -h / 2 + 0.35, 1.7, 1.7, 0.4);
  ctx.fill();
  drawCritterShape(ctx, sp, -w / 2 + 1.25, -h / 2 + 1.2, 0.55, -0.2, t, false);
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `700 ${1.1}px ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`#${jar.tag}`, w / 2 - 1.05, -h / 2 + 1.55);
  // lid
  if (sealed) {
    ctx.fillStyle = PALETTE.woodLight;
    roundRect(ctx, -w / 2 - 0.25, -h / 2 - 0.7, w + 0.5, 1.0, 0.45);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.15;
    ctx.stroke();
  } else {
    // capacity pips
    for (let i = 0; i < jar.capacity; i++) {
      ctx.fillStyle = i < fill ? `hsl(${sp.hue} 65% 55%)` : 'rgba(120,110,130,0.35)';
      ctx.beginPath();
      ctx.arc(w / 2 + 0.55, h / 2 - 0.5 - i * 0.85, 0.34, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  if (highlight) {
    ctx.strokeStyle = 'rgba(255,224,130,0.9)';
    ctx.lineWidth = 0.4;
    ctx.setLineDash([1, 0.8]);
    ctx.beginPath();
    ctx.arc(x, y, 3.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export interface RenderInput {
  world: World;
  model: TideGame;
  anim: ViewAnim;
  time: number;
  nowMs: number;
}

/** Full scene pass. Cam maps world→screen; viewport in CSS pixels. */
export function drawScene(
  canvas: HTMLCanvasElement, input: RenderInput, cam: Camera, viewW: number, viewH: number, dpr: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { world, model, anim, time, nowMs } = input;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.save();
  ctx.translate(viewW / 2, viewH / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  const speciesBy = new Map(world.species.map((s) => [s.id, s]));
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const t = reducedMotion ? 0 : time;

  drawBackdrop(ctx, world, t, viewW / cam.zoom, viewH / cam.zoom);
  drawWall(ctx, world, model, t, speciesBy);

  // loose jars
  const hoverJar = anim.hover?.kind === 'jar' ? anim.hover.id : null;
  for (const jar of world.jars) {
    const loc = model.jarLocation(jar.id);
    if (loc !== 'loose') continue;
    const p = world.jarScatter[jar.id];
    const highlight = nowMs < anim.gullsEyeUntil || hoverJar === jar.id;
    drawJar(ctx, world, model, jar, p.x, p.y, p.rot, t, speciesBy, highlight);
  }

  // loose critters (y-sorted for a soft depth cue)
  const loose = world.critters
    .filter((c) => model.critterLocation(c.id) === 'loose' && !anim.flights.some((f) => f.critterId === c.id))
    .sort((a, b) => world.scatter[a.id].y - world.scatter[b.id].y);
  const flyingIds = new Set(anim.flights.map((f) => f.critterId));
  for (const c of loose) {
    if (flyingIds.has(c.id)) continue;
    const p = world.scatter[c.id];
    const sp = speciesBy.get(c.species)!;
    shadow(ctx, p.x, p.y, sp.size * 0.9);
    drawCritterShape(ctx, sp, p.x, p.y, sp.size, p.rot + Math.sin(t * 1.7 + p.x) * 0.05, t + p.x, c.golden);
  }

  // moonlight threads / gull's eye glow
  const moon = nowMs < anim.moonlightUntil;
  const eye = nowMs < anim.gullsEyeUntil;
  if (moon || eye) {
    ctx.save();
    for (const c of world.critters) {
      if (model.critterLocation(c.id) !== 'loose') continue;
      const jarOk = model.jarLocation(c.jarId) === 'loose' && !model.isSealed(c.jarId);
      if (!jarOk) continue;
      const p = world.scatter[c.id];
      const jp = world.jarScatter[c.jarId];
      const mx = (p.x + jp.x) / 2;
      const my = (p.y + jp.y) / 2 - 6;
      ctx.strokeStyle = moon ? 'rgba(173,216,255,0.55)' : 'rgba(255,224,130,0.4)';
      ctx.lineWidth = 0.3;
      ctx.setLineDash([1.2, 1.4]);
      ctx.lineDashOffset = -t * 4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(mx, my, jp.x, jp.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // flights (auto-file arcs)
  for (const f of anim.flights) {
    const k = Math.min(1, f.t / f.dur);
    const ease = k * k * (3 - 2 * k);
    const x = f.fromX + (f.toX - f.fromX) * ease;
    const y = f.fromY + (f.toY - f.fromY) * ease - Math.sin(k * Math.PI) * 6;
    if (f.critterId) {
      const c = world.critters.find((k2) => k2.id === f.critterId) as CritterDef;
      drawCritterShape(ctx, speciesBy.get(c.species)!, x, y, speciesBy.get(c.species)!.size, k * 2, t, c.golden);
    } else if (f.jarId) {
      const jar = world.jars.find((j) => j.id === f.jarId) as JarDef;
      drawJar(ctx, world, model, jar, x, y, 0, t, speciesBy, true);
    }
  }

  // carried jar
  if (anim.carriedJar) {
    drawJar(ctx, world, model, world.jars.find((j) => j.id === anim.carriedJar!.id)!, anim.carriedJar.x, anim.carriedJar.y, Math.sin(t * 3) * 0.04, t, speciesBy, true);
  }
  // carried critters (fanned)
  anim.carried.forEach((c, i) => {
    const sp = speciesBy.get(c.species)!;
    const bob = Math.sin(t * 5 + i * 1.3) * 0.3;
    shadow(ctx, c.x + 0.4, c.y + 1.6 + i * 0.2, sp.size);
    drawCritterShape(ctx, sp, c.x + i * 1.1, c.y + i * 0.9 + bob, sp.size, Math.sin(t * 2 + i) * 0.12, t, c.golden);
  });

  // hover magnet ring on the candidate target
  const hover = anim.hover;
  if (hover) {
    let hx = 0, hy = 0, hr = 3.4;
    if (hover.kind === 'jar') {
      const p = world.jarScatter[hover.id];
      hx = p.x; hy = p.y; hr = 3.3;
    } else {
      const cubby = world.cubbies.find((c) => c.id === hover.id)!;
      const cols = Math.max(...world.cubbies.map((c) => c.col)) + 1;
      const rows = Math.max(...world.cubbies.map((c) => c.row)) + 1;
      hx = world.wall.x + (cubby.col + 0.5) * (world.wall.w / cols);
      hy = world.wall.y + (cubby.row + 0.5) * (world.wall.h / rows);
      hr = Math.min(world.wall.w / cols, world.wall.h / rows) * 0.55;
    }
    ctx.strokeStyle = 'rgba(255,224,130,0.85)';
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.arc(hx, hy, hr + Math.sin(t * 5) * 0.2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // splash rings + particles
  for (const s of anim.splash) {
    const age = (nowMs - s.at) / 500;
    if (age > 1) continue;
    ctx.strokeStyle = `rgba(238,247,244,${0.7 * (1 - age)})`;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 1 + age * 3.4, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const p of anim.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    if (p.kind === 'spark') {
      ctx.fillStyle = `hsla(${p.hue} 90% 75% / ${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'bubble') {
      ctx.strokeStyle = `rgba(238,247,244,${a * 0.8})`;
      ctx.lineWidth = 0.12;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = `hsla(${p.hue} 90% 70% / ${a})`;
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - a) * 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // finale warm glow over everything
  if (anim.finaleGlow > 0) {
    ctx.fillStyle = `rgba(255, 214, 110, ${anim.finaleGlow * 0.16})`;
    ctx.fillRect(-200, -200, viewW / cam.zoom + 400, viewH / cam.zoom + 400);
  }

  ctx.restore();
}
