/**
 * Tidy Tapes — boot-time procedural texture factory (v2).
 * Everything drawn 2x and displayed at 0.5 for crispness.
 *
 * v2 2.5D angle is baked into the art (reference is axis-aligned): extruded
 * darker front/side faces, top-left rim highlights, contact shadows. Storage
 * is layered: generic unit body (top face + channels + dividers) under seated
 * spines, and a separate per-unit LIP overlay drawn above the spines so an
 * entering tape is naturally occluded by the slot's south wall.
 */
import Phaser from 'phaser';
import { ART_PILOT, COLORS, SYMBOLS, ROW_CH_H, ROW_CH_TOP, ROW_PITCH, SLOT0_X, SLOT_PITCH } from './config';
import { drawSymbol } from './symbols';

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number): CanvasRenderingContext2D {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = (tex as Phaser.Textures.CanvasTexture).getContext();
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

function finish(scene: Phaser.Scene, key: string): void {
  const tex = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
  tex.refresh();
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

/** deterministic little hash for wood grain */
function h2(i: number): number { const s = Math.sin(i * 127.1) * 43758.5453; return s - Math.floor(s); }

function contactShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(24,12,6,0.30)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(24,12,6,0.16)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.9, ry * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- tape faces
/** Broad face of a loose cassette (with baked contact shadow + bottom/side shading).
 *  v4: pre-rollout look, kept under legacy-* for the before/after comparator. */
export function buildTapeFace(scene: Phaser.Scene, combo: number): void {
  const color = COLORS[Math.floor(combo / SYMBOLS.length)];
  const symbol = SYMBOLS[combo % SYMBOLS.length];
  const key = `legacy-tape-face-${combo}`;
  const W = 208, H = 144; // 2x of (104x72) display; shell is 184x120 centered
  const ctx = canvasTex(scene, key, W, H);
  const OX = 12, OY = 12;

  // contact shadow (offset down-right)
  contactShadow(ctx, W / 2 + 8, H / 2 + 10, 94, 62);

  // shell
  ctx.save();
  rr(ctx, OX + 2, OY + 2, W - 2 * OX - 4, H - 2 * OY - 4, 14);
  ctx.fillStyle = color.css;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = shade(color.css, -46);
  ctx.stroke();
  // bottom front-edge shading + right side shading (2.5D cue, very gentle)
  ctx.save();
  rr(ctx, OX + 2, OY + 2, W - 2 * OX - 4, H - 2 * OY - 4, 14);
  ctx.clip();
  const edgeGrad = ctx.createLinearGradient(0, H - 40, 0, H);
  edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
  edgeGrad.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(OX, H - 40, W - 2 * OX, 40);
  const sideGrad = ctx.createLinearGradient(W - 26, 0, W, 0);
  sideGrad.addColorStop(0, 'rgba(0,0,0,0)');
  sideGrad.addColorStop(1, 'rgba(0,0,0,0.10)');
  ctx.fillStyle = sideGrad;
  ctx.fillRect(W - 26, OY, 26, H - 2 * OY);
  ctx.restore();
  // top bevel light
  rr(ctx, OX + 8, OY + 7, W - 2 * OX - 16, 10, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fill();
  // corner screws
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  for (const [sx, sy] of [[OX + 14, OY + 14], [W - OX - 14, OY + 14], [OX + 14, H - OY - 14], [W - OX - 14, H - OY - 14]]) {
    ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(sx - 1.2, sy - 1.2, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
  }

  // window with two reels (loose tapes lie face-up, both reels visible)
  const winX = OX + 34, winY = OY + 54, winW = W - 2 * OX - 68;
  rr(ctx, winX, winY, winW, 44, 10);
  ctx.fillStyle = 'rgba(24,15,10,0.58)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  rr(ctx, winX, winY, winW, 44, 10);
  ctx.stroke();
  ctx.fillStyle = 'rgba(122,74,42,0.5)';
  rr(ctx, winX + 28, winY + 20, 60, 8, 4); ctx.fill();
  for (const rx of [winX + 34, winX + 82]) {
    ctx.beginPath(); ctx.arc(rx, winY + 22, 16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(250,244,230,0.95)'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(rx, winY + 22, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#3b2f2f'; ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,30,0.5)';
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k;
      ctx.beginPath();
      ctx.moveTo(rx + Math.cos(a) * 6, winY + 22 + Math.sin(a) * 6);
      ctx.lineTo(rx + Math.cos(a) * 15, winY + 22 + Math.sin(a) * 15);
      ctx.stroke();
    }
  }

  // label (cream) with symbol + track lines
  rr(ctx, OX + 26, OY + 14, W - 2 * OX - 52, 26, 6);
  ctx.fillStyle = '#f6efdd'; ctx.fill();
  ctx.strokeStyle = 'rgba(60,40,30,0.16)'; ctx.lineWidth = 1.5; ctx.stroke();
  drawSymbol(ctx, symbol, OX + 42, OY + 27, 20, { fill: color.ink === '#f6efdd' ? '#40342b' : color.ink });
  ctx.strokeStyle = 'rgba(64,52,43,0.28)';
  ctx.lineWidth = 1.6;
  for (const ly of [OY + 22, OY + 27, OY + 32]) {
    ctx.beginPath(); ctx.moveTo(OX + 58, ly); ctx.lineTo(OX + 140, ly); ctx.stroke();
  }
  ctx.restore();
  finish(scene, key);
}

// ------------------------------------------------------------- defect overlays
export function buildDefectOverlay(scene: Phaser.Scene, kind: 'rewind' | 'sticker' | 'paint'): void {
  const key = `defect-${kind}`;
  const W = 184, H = 120;
  const ctx = canvasTex(scene, key, W, H);
  ctx.clearRect(0, 0, W, H);
  if (kind === 'rewind') {
    ctx.strokeStyle = '#7a4a2a';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(104, 86);
    ctx.bezierCurveTo(130, 96, 150, 112, 166, 104);
    ctx.bezierCurveTo(178, 98, 170, 82, 158, 84);
    ctx.stroke();
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(96, 92);
    ctx.bezierCurveTo(84, 104, 92, 114, 106, 110);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(122,74,42,0.85)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(88, 80); ctx.bezierCurveTo(94, 66, 104, 84, 98, 72); ctx.stroke();
  } else if (kind === 'sticker') {
    ctx.save();
    ctx.strokeStyle = 'rgba(52,38,28,0.8)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(36, 16); ctx.lineTo(43, 25); ctx.lineTo(39, 34); ctx.lineTo(47, 38);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(52, 14); ctx.lineTo(47, 24); ctx.lineTo(54, 33);
    ctx.stroke();
    ctx.fillStyle = '#f6efdd';
    ctx.beginPath();
    ctx.moveTo(50, 34); ctx.lineTo(60, 30); ctx.lineTo(56, 40); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(44, 39, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(10, 112);
    ctx.bezierCurveTo(6, 92, 26, 84, 44, 90);
    ctx.bezierCurveTo(58, 95, 60, 112, 48, 116);
    ctx.bezierCurveTo(30, 118, 12, 118, 10, 112);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.ellipse(24, 102, 10, 6, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  finish(scene, key);
}

// ---------------------------------------------------------------------- spines
/** Seated cassette: narrow vertical bar (edge-on, like a book spine). 32x56 @2x.
 *  v4: pre-rollout look, kept under legacy-* for the before/after comparator. */
export function buildSpine(scene: Phaser.Scene, combo: number): void {
  const color = COLORS[Math.floor(combo / SYMBOLS.length)];
  const symbol = SYMBOLS[combo % SYMBOLS.length];
  const key = `legacy-spine-${combo}`;
  const W = 32, H = 56;
  const ctx = canvasTex(scene, key, W, H);
  rr(ctx, 1, 1, W - 2, H - 2, 4);
  ctx.fillStyle = color.css; ctx.fill();
  ctx.lineWidth = 1.6; ctx.strokeStyle = shade(color.css, -40); ctx.stroke();
  // left rim light + right side shading (2.5D)
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(2, 3, 4, H - 6);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(W - 6, 3, 4, H - 6);
  // top cap + bottom cap
  rr(ctx, 2, 2, W - 4, 7, 3); ctx.fillStyle = shade(color.css, -28); ctx.fill();
  rr(ctx, 2, H - 9, W - 4, 7, 3); ctx.fillStyle = shade(color.css, -28); ctx.fill();
  // window slit
  rr(ctx, W / 2 - 3.5, 20, 7, 12, 3); ctx.fillStyle = 'rgba(24,15,10,0.55)'; ctx.fill();
  // cream stripe with symbol name mark
  rr(ctx, 4, 36, W - 8, 16, 3); ctx.fillStyle = '#f6efdd'; ctx.fill();
  ctx.fillStyle = 'rgba(64,52,43,0.45)';
  ctx.fillRect(7, 41, W - 14, 2);
  // symbol near top (readable edge-on)
  drawSymbol(ctx, symbol, W / 2, 14, 9, { fill: color.ink === '#f6efdd' ? '#ffffff' : '#3d2f22' });
  finish(scene, key);
}

// -------------------------------------------------------------- row label chips
/** Row label chip: color + symbol ("never color alone"). 56x56 @2x. */
export function buildChip(scene: Phaser.Scene, combo: number): void {
  const color = COLORS[Math.floor(combo / SYMBOLS.length)];
  const symbol = SYMBOLS[combo % SYMBOLS.length];
  const key = `chip-${combo}`;
  const S = 56;
  const ctx = canvasTex(scene, key, S, S);
  contactShadow(ctx, S / 2 + 2, S / 2 + 3, S / 2 - 2, S / 2 - 4);
  rr(ctx, 4, 4, S - 8, S - 8, 12);
  ctx.fillStyle = color.css; ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = shade(color.css, -46); ctx.stroke();
  // rim light top-left
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(10, 16); ctx.lineTo(16, 9); ctx.stroke();
  drawSymbol(ctx, symbol, S / 2, S / 2, 30, {
    fill: color.ink === '#f6efdd' ? '#ffffff' : '#3d2f22',
    stroke: 'rgba(0,0,0,0.35)', lineW: 2,
  });
  finish(scene, key);
}

// ------------------------------------------------------------ rack unit body
/**
 * Generic unit body (all units share it): wooden tray top face, label strip,
 * 4 dark slot channels with north walls and slot dividers, extruded front face
 * at the bottom. Seated spines are drawn ABOVE this, and the lip overlay above
 * them. 480x368 @2x -> 240x184 display.
 */
export function buildUnitBody(scene: Phaser.Scene): void {
  const key = 'unit-body';
  const W = 480, H = 368;
  const ctx = canvasTex(scene, key, W, H);

  // contact shadow under the whole tray
  contactShadow(ctx, W / 2 + 9, H / 2 - 6, W / 2 - 14, H / 2 - 26);

  // extruded front face (bottom band, below the top face)
  ctx.fillStyle = '#4a2c1a';
  rr(ctx, 10, H - 24, W - 20, 18, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  rr(ctx, 10, H - 12, W - 20, 6, 4);
  ctx.fill();
  // right side face hint
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  rr(ctx, W - 16, 12, 10, H - 30, 4);
  ctx.fill();

  // tray top face (wood)
  rr(ctx, 8, 8, W - 18, H - 34, 14);
  ctx.fillStyle = '#6e4429'; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = '#4a2c1a'; ctx.stroke();
  // wood grain
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2;
  for (let g = 0; g < 6; g++) {
    const gy = 16 + g * 58 + h2(g * 13) * 8;
    ctx.beginPath(); ctx.moveTo(14, gy);
    ctx.bezierCurveTo(W * 0.3, gy + (h2(g + 3) - 0.5) * 6, W * 0.7, gy - (h2(g * 5) - 0.5) * 6, W - 14, gy);
    ctx.stroke();
  }
  // top-left rim light
  ctx.strokeStyle = 'rgba(255,235,200,0.30)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(22, 18); ctx.lineTo(60, 12); ctx.stroke();

  // label strip (chips + counts + verify live here at runtime)
  rr(ctx, 14, 12, W - 28, 44, 8);
  ctx.fillStyle = '#7d5333'; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,235,200,0.10)';
  rr(ctx, 16, 14, W - 32, 10, 5); ctx.fill();

  // 4 slot channels (2x of: top = 30 + lr*36, h = 30)
  const chX0 = 82, chX1 = 452; // channel interior x range @2x (41..226 logical)
  for (let lr = 0; lr < 4; lr++) {
    const top = (ROW_CH_TOP + lr * ROW_PITCH) * 2;
    const h = ROW_CH_H * 2;
    // interior
    rr(ctx, chX0 - 4, top + 6, chX1 - chX0 + 8, h - 8, 5);
    ctx.fillStyle = '#241610'; ctx.fill();
    // interior depth gradient (darker toward the north wall)
    const grad = ctx.createLinearGradient(0, top + 6, 0, top + h - 2);
    grad.addColorStop(0, 'rgba(0,0,0,0.42)');
    grad.addColorStop(0.45, 'rgba(0,0,0,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0.05)');
    rr(ctx, chX0 - 4, top + 6, chX1 - chX0 + 8, h - 8, 5);
    ctx.fillStyle = grad; ctx.fill();
    // empty-slot hints: soft outline per slot
    ctx.strokeStyle = 'rgba(255,235,200,0.10)';
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 8; k++) {
      const cx = (SLOT0_X + k * SLOT_PITCH) * 2;
      rr(ctx, cx - 10, top + 8, 20, h - 12, 3);
      ctx.stroke();
    }
    // north wall (its top face strip + highlight)
    ctx.fillStyle = '#8a5a3b';
    rr(ctx, chX0 - 6, top, chX1 - chX0 + 12, 7, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,235,200,0.25)';
    rr(ctx, chX0 - 4, top + 1, chX1 - chX0 + 8, 2.5, 1); ctx.fill();
    // dividers between slots (skip the first/last edges)
    for (let k = 1; k < 8; k++) {
      const dx = (SLOT0_X + k * SLOT_PITCH) * 2 - SLOT_PITCH; // wall center
      ctx.fillStyle = '#7a4f30';
      rr(ctx, dx - 4, top + 4, 8, h - 6, 3); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(dx + 2, top + 4, 1.5, h - 6);
      ctx.fillStyle = 'rgba(255,235,200,0.12)';
      ctx.fillRect(dx - 3, top + 5, 1.5, h - 8);
    }
    // channel end walls
    for (const ex of [chX0 - 12, chX1 + 2]) {
      ctx.fillStyle = '#7a4f30';
      rr(ctx, ex, top + 4, 10, h - 6, 3); ctx.fill();
    }
  }
  finish(scene, key);
}

/**
 * Per-unit lip overlay (foreground layer): each channel's south wall with a
 * little extruded lip, drawn ABOVE seated spines so an entering tape's leading
 * edge is naturally concealed. Transparent everywhere else. 480x368 @2x.
 */
export function buildUnitLips(scene: Phaser.Scene): void {
  const key = 'unit-lips';
  const W = 480, H = 368;
  const ctx = canvasTex(scene, key, W, H);
  const chX0 = 82, chX1 = 452;
  for (let lr = 0; lr < 4; lr++) {
    const top = (ROW_CH_TOP + lr * ROW_PITCH) * 2;
    const bottom = top + ROW_CH_H * 2;
    // south wall: from 2px above the channel bottom to 10px below
    const ly = bottom - 8;
    ctx.fillStyle = '#8a5a3b';
    rr(ctx, chX0 - 8, ly, chX1 - chX0 + 16, 16, 4);
    ctx.fill();
    ctx.strokeStyle = '#4a2c1a'; ctx.lineWidth = 2;
    rr(ctx, chX0 - 8, ly, chX1 - chX0 + 16, 16, 4);
    ctx.stroke();
    // wall top highlight (light catches the lip)
    ctx.fillStyle = 'rgba(255,235,200,0.30)';
    rr(ctx, chX0 - 6, ly + 1, chX1 - chX0 + 12, 3, 1.5); ctx.fill();
    // divider front caps so slots read individually on the lip
    for (let k = 1; k < 8; k++) {
      const dx = (SLOT0_X + k * SLOT_PITCH) * 2 - SLOT_PITCH;
      ctx.fillStyle = '#6e4429';
      rr(ctx, dx - 5, ly + 3, 10, 10, 2); ctx.fill();
    }
  }
  finish(scene, key);
}

// ----------------------------------------------------------------------- wood
export function buildWood(scene: Phaser.Scene): void {
  const key = 'wood';
  const S = 512;
  const ctx = canvasTex(scene, key, S, S);
  ctx.fillStyle = '#8a5a3b'; ctx.fillRect(0, 0, S, S);
  for (let plank = 0; plank < 4; plank++) {
    const y0 = plank * 128;
    const tone = -10 + Math.floor(h2(plank * 17) * 18);
    ctx.fillStyle = shade('#8a5a3b', tone);
    ctx.fillRect(0, y0 + 2, S, 124);
    ctx.fillStyle = 'rgba(30,15,8,0.55)';
    ctx.fillRect(0, y0, S, 3);
    ctx.fillStyle = 'rgba(255,220,170,0.08)';
    ctx.fillRect(0, y0 + 3, S, 2);
    ctx.strokeStyle = 'rgba(40,20,10,0.18)';
    ctx.lineWidth = 2;
    for (let g = 0; g < 5; g++) {
      const gy = y0 + 14 + h2(plank * 13 + g) * 100;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(S * 0.33, gy + (h2(g * 3 + plank) - 0.5) * 10, S * 0.66, gy - (h2(g * 5 + plank) - 0.5) * 10, S, gy);
      ctx.stroke();
    }
    if (h2(plank * 7 + 3) > 0.66) {
      const kx = 40 + h2(plank * 29) * (S - 80);
      const ky = y0 + 20 + h2(plank * 41) * 90;
      ctx.beginPath(); ctx.arc(kx, ky, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(40,20,10,0.35)'; ctx.fill();
      ctx.beginPath(); ctx.arc(kx, ky, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30,12,6,0.5)'; ctx.fill();
    }
  }
  finish(scene, key);
}

// ------------------------------------------------------------------- bench mat
export function buildBench(scene: Phaser.Scene): void {
  const key = 'bench';
  const W = 720, H = 400; // 360x200 logical
  const ctx = canvasTex(scene, key, W, H);
  contactShadow(ctx, W / 2 + 8, H / 2 + 8, W / 2 - 6, H / 2 - 6);
  rr(ctx, 8, 8, W - 16, H - 16, 20);
  ctx.fillStyle = '#b08a5c'; ctx.fill();
  ctx.lineWidth = 7; ctx.strokeStyle = '#6b4a2c'; ctx.stroke();
  ctx.setLineDash([12, 9]);
  ctx.strokeStyle = 'rgba(240,220,184,0.6)';
  ctx.lineWidth = 3;
  rr(ctx, 24, 24, W - 48, H - 48, 14);
  ctx.stroke();
  ctx.setLineDash([]);
  const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.42);
  g.addColorStop(0, 'rgba(255,240,210,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0.06)');
  rr(ctx, 24, 24, W - 48, H - 48, 14);
  ctx.fillStyle = g; ctx.fill();

  // tools doodles (smaller, fits the 360x200 mat)
  ctx.save(); // pencil
  ctx.translate(64, 78); ctx.rotate(-0.45);
  ctx.fillStyle = '#e8b937'; ctx.fillRect(0, -7, 150, 14);
  ctx.fillStyle = '#f6efdd'; ctx.beginPath(); ctx.moveTo(150, -7); ctx.lineTo(172, 0); ctx.lineTo(150, 7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5b4632'; ctx.beginPath(); ctx.moveTo(164, -2.4); ctx.lineTo(172, 0); ctx.lineTo(164, 2.4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d97b8f'; ctx.fillRect(-18, -7, 18, 14);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.strokeRect(0, -7, 150, 14);
  ctx.restore();
  ctx.save(); // tweezers
  ctx.translate(W - 84, 74); ctx.rotate(0.5);
  ctx.strokeStyle = '#c8cdd4'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-28, 104); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(40, 104); ctx.stroke();
  ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(2, -20); ctx.lineTo(-10, 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(12, -20); ctx.lineTo(24, 4); ctx.stroke();
  ctx.restore();
  ctx.save(); // markers
  for (const [mx, col] of [[70, '#c8862f'], [112, '#a05a9a']] as [number, string][]) {
    ctx.save();
    ctx.translate(mx, H - 78); ctx.rotate(-0.12);
    ctx.fillStyle = col; rr(ctx, 0, 0, 22, 108, 5); ctx.fill();
    ctx.fillStyle = '#efe6d2'; rr(ctx, 0, 80, 22, 28, 4); ctx.fill();
    ctx.fillStyle = shade(col, -30); rr(ctx, 0, 0, 22, 18, 5); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.save(); // soft cloth
  ctx.translate(W - 168, H - 78); ctx.rotate(0.18);
  rr(ctx, 0, 0, 100, 62, 10);
  ctx.fillStyle = '#e9ddc8'; ctx.fill();
  ctx.strokeStyle = 'rgba(120,90,60,0.4)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();
  finish(scene, key);
}

// ----------------------------------------------------------------------- props
export function buildProps(scene: Phaser.Scene): void {
  {
    const key = 'prop-lamp';
    const S = 360;
    const ctx = canvasTex(scene, key, S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 20, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,226,150,0.85)');
    g.addColorStop(0.35, 'rgba(255,210,130,0.28)');
    g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    contactShadow(ctx, S / 2 + 4, S / 2 + 86, 62, 16);
    ctx.fillStyle = '#4a2c1a';
    ctx.beginPath();
    ctx.moveTo(S / 2 - 52, S / 2 + 26);
    ctx.lineTo(S / 2 + 52, S / 2 + 26);
    ctx.lineTo(S / 2 + 34, S / 2 - 20);
    ctx.lineTo(S / 2 - 34, S / 2 - 20);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(S / 2 - 6, S / 2 + 26, 12, 56);
    ctx.beginPath(); ctx.arc(S / 2, S / 2 + 86, 18, 0, Math.PI * 2); ctx.fill();
    finish(scene, key);
  }
  {
    const key = 'prop-radio';
    const W = 150, H = 100;
    const ctx = canvasTex(scene, key, W, H);
    contactShadow(ctx, W / 2 + 4, H / 2 + 6, W / 2 - 2, H / 2 - 8);
    rr(ctx, 3, 3, W - 6, H - 10, 12);
    ctx.fillStyle = '#c96b52'; ctx.fill();
    ctx.strokeStyle = '#7c3b2c'; ctx.lineWidth = 4; ctx.stroke();
    // front face hint (bottom band darker)
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    rr(ctx, 5, H - 22, W - 10, 12, 6); ctx.fill();
    rr(ctx, 16, 18, 68, 44, 8);
    ctx.fillStyle = '#3b2b22'; ctx.fill();
    ctx.strokeStyle = 'rgba(246,239,221,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(22, 24 + i * 9); ctx.lineTo(78, 24 + i * 9); ctx.stroke();
    }
    for (const kx of [100, 122]) {
      ctx.beginPath(); ctx.arc(kx, 30, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#f6efdd'; ctx.fill();
      ctx.strokeStyle = '#7c3b2c'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(kx, 30); ctx.lineTo(kx + 6, 26); ctx.stroke();
    }
    ctx.fillStyle = '#f6efdd';
    rr(ctx, 100, 48, 32, 18, 4); ctx.fill();
    ctx.fillStyle = '#7c3b2c'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('FM', 108, 62);
    finish(scene, key);
  }
  {
    const key = 'prop-plant';
    const W = 130, H = 150;
    const ctx = canvasTex(scene, key, W, H);
    contactShadow(ctx, W / 2 + 4, H - 18, 44, 12);
    ctx.fillStyle = '#8a5a3b';
    rr(ctx, 38, 96, 54, 48, 10); ctx.fill();
    ctx.strokeStyle = '#5b3822'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    rr(ctx, 40, 130, 50, 12, 6); ctx.fill();
    ctx.strokeStyle = '#4f7a3d'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.38;
      ctx.beginPath();
      ctx.moveTo(65, 100);
      ctx.quadraticCurveTo(65 + Math.cos(a) * 34, 100 + Math.sin(a) * 52, 65 + Math.cos(a) * 52, 100 + Math.sin(a) * 74);
      ctx.stroke();
    }
    ctx.fillStyle = '#5f9247';
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.38;
      const lx = 65 + Math.cos(a) * 52, ly = 100 + Math.sin(a) * 74;
      ctx.beginPath(); ctx.ellipse(lx, ly, 13, 7, a, 0, Math.PI * 2); ctx.fill();
    }
    finish(scene, key);
  }
  {
    const key = 'prop-books';
    const W = 170, H = 130;
    const ctx = canvasTex(scene, key, W, H);
    contactShadow(ctx, W / 2 + 4, H / 2 + 8, W / 2 - 4, H / 2 - 10);
    const cols = ['#a05a9a', '#5a7d9a', '#c8862f'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = cols[i];
      rr(ctx, 8 + i * 12, 78 - i * 2, 130 - i * 6, 34, 5); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(16 + i * 12, 84 - i * 2, 96 - i * 6, 5);
    }
    ctx.fillStyle = '#6e4429';
    rr(ctx, 118, 46, 44, 56, 7); ctx.fill();
    ctx.strokeStyle = '#4a2c1a'; ctx.lineWidth = 3; ctx.stroke();
    for (const [px, col] of [[126, '#e8b937'], [140, '#7bb661'], [153, '#d94f4f']] as [number, string][]) {
      ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px, 52); ctx.lineTo(px + (px - 140) * 0.12, 22); ctx.stroke();
    }
    finish(scene, key);
  }
  // generic contact shadow for runtime placement under props (skipped when the
  // uploaded art pack's SVG loaded first)
  if (!scene.textures.exists('contact-shadow')) {
    const key = 'contact-shadow';
    const W = 128, H = 64;
    const ctx = canvasTex(scene, key, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, 6, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(24,12,6,0.34)');
    g.addColorStop(0.7, 'rgba(24,12,6,0.24)');
    g.addColorStop(1, 'rgba(24,12,6,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(1, H / W);
    ctx.beginPath(); ctx.arc(0, 0, W / 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    finish(scene, key);
  }
}

// ----------------------------------------------------------------- tools (repair)
export function buildTools(scene: Phaser.Scene): void {
  {
    const key = 'tool-pencil';
    const W = 30, H = 170;
    const ctx = canvasTex(scene, key, W, H);
    ctx.fillStyle = '#e8b937';
    ctx.fillRect(5, 22, 18, 130);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.strokeRect(5, 22, 18, 130);
    ctx.fillStyle = '#f6efdd'; ctx.beginPath();
    ctx.moveTo(5, 152); ctx.lineTo(14, 170); ctx.lineTo(23, 152); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3b2f2f'; ctx.beginPath();
    ctx.moveTo(11, 164); ctx.lineTo(14, 170); ctx.lineTo(17, 164); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d97b8f'; ctx.fillRect(5, 0, 18, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(7, 26, 4, 122);
    finish(scene, key);
  }
  {
    const key = 'tool-tweezers';
    const W = 40, H = 170;
    const ctx = canvasTex(scene, key, W, H);
    ctx.strokeStyle = '#c8cdd4'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(10, 150); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(26, 10); ctx.lineTo(30, 150); ctx.stroke();
    ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(13, 24); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(27, 24); ctx.stroke();
    finish(scene, key);
  }
  {
    const key = 'tool-marker';
    const W = 30, H = 160;
    const ctx = canvasTex(scene, key, W, H);
    ctx.fillStyle = '#5a4632';
    rr(ctx, 6, 26, 18, 134, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(6, 26); ctx.lineTo(15, 0); ctx.lineTo(24, 26); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#efe6d2'; rr(ctx, 6, 108, 18, 34, 4); ctx.fill();
    ctx.fillStyle = '#40342b'; rr(ctx, 6, 26, 18, 20, 5); ctx.fill();
    finish(scene, key);
  }
  {
    const key = 'dot';
    const S = 64;
    const ctx = canvasTex(scene, key, S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    finish(scene, key);
  }
}

// standalone symbol stickers (white; tint with the group ink color)
export function buildSymbolStickers(scene: Phaser.Scene): void {
  for (const symbol of SYMBOLS) {
    const key = `sym-${symbol}`;
    const S = 72;
    const ctx = canvasTex(scene, key, S, S);
    drawSymbol(ctx, symbol, S / 2, S / 2, S * 0.72, { fill: '#ffffff', stroke: 'rgba(0,0,0,0.12)', lineW: 2 });
    finish(scene, key);
  }
}

/**
 * "Before"-mode cabinet for the pilot footprint: plain warm wood with four
 * open compartments and shelf rails at the same art-px positions as the walnut
 * atlas, so the geometry (slots, seats, lips, hit areas) is identical between
 * the before/after comparison modes — only the textures differ.
 */
export function buildPlainPilotCabinet(scene: Phaser.Scene): void {
  const key = 'walnut-plain';
  const k = ART_PILOT.cabScale;
  const W = Math.round(ART_PILOT.art.w * k);
  const H = Math.round(ART_PILOT.art.h * k);
  const ctx = canvasTex(scene, key, W, H);
  // outer frame
  rr(ctx, 0, 0, W, H, 12);
  ctx.fillStyle = '#6e4429'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#4a2c1a'; ctx.stroke();
  // subtle grain
  ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1.6;
  for (let g = 0; g < 10; g++) {
    const gy = (g / 10) * H + h2(g * 13) * 12;
    ctx.beginPath(); ctx.moveTo(6, gy);
    ctx.bezierCurveTo(W * 0.33, gy + 3, W * 0.66, gy - 3, W - 6, gy);
    ctx.stroke();
  }
  // top rim light
  ctx.fillStyle = 'rgba(255,235,200,0.16)';
  rr(ctx, 6, 4, W - 12, 6, 3); ctx.fill();
  // four open compartments + shelf boards (art-px positions × cabScale)
  for (let lr = 0; lr < 4; lr++) {
    const top = Math.round((ART_PILOT.seats[lr] - 200) * k);
    const bottom = Math.round((ART_PILOT.seats[lr] + 44) * k);
    const left = Math.round(ART_PILOT.lips[lr][0] * k);
    const right = Math.round((ART_PILOT.lips[lr][0] + 678) * k);
    rr(ctx, left, top, right - left, bottom - top, 6);
    ctx.fillStyle = '#241610'; ctx.fill();
    const grad = ctx.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, 'rgba(0,0,0,0.45)');
    grad.addColorStop(1, 'rgba(0,0,0,0.05)');
    ctx.fillStyle = grad;
    rr(ctx, left, top, right - left, bottom - top, 6);
    ctx.fill();
    // shelf board + lip rail at the compartment bottom
    const lipY = Math.round(ART_PILOT.lips[lr][1] * k);
    ctx.fillStyle = '#8a5a3b';
    rr(ctx, left, lipY, right - left, Math.round(48 * k), 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,235,200,0.22)';
    ctx.fillRect(left + 2, lipY + 2, right - left - 4, 3);
    // empty-slot hints at the 8 slot centers
    ctx.strokeStyle = 'rgba(255,235,200,0.10)';
    ctx.lineWidth = 1.4;
    for (let s = 0; s < 8; s++) {
      const cx = Math.round((ART_PILOT.slotSpan[0] + (s * (ART_PILOT.slotSpan[1] - ART_PILOT.slotSpan[0])) / 7) * k);
      rr(ctx, cx - 10, top + 8, 20, bottom - top - 16, 3);
      ctx.stroke();
    }
  }
  finish(scene, key);
}

/** Build every texture (called once from BootScene). */
export function buildAllTextures(scene: Phaser.Scene): void {
  buildWood(scene);
  buildBench(scene);
  buildProps(scene);
  buildTools(scene);
  buildSymbolStickers(scene);
  buildUnitBody(scene);
  buildUnitLips(scene);
  buildPlainPilotCabinet(scene);
  for (let combo = 0; combo < COLORS.length * SYMBOLS.length; combo++) {
    buildTapeFace(scene, combo);
    buildSpine(scene, combo);
    buildChip(scene, combo);
  }
  buildDefectOverlay(scene, 'rewind');
  buildDefectOverlay(scene, 'sticker');
  buildDefectOverlay(scene, 'paint');
}
