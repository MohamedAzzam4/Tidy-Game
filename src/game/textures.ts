/**
 * Tidy Tapes — boot-time procedural texture factory.
 * One cassette design reused as families: 8 shell palettes x 8 symbols.
 * Everything is drawn 2x and displayed at 0.5 for crispness.
 */
import Phaser from 'phaser';
import { COLORS, SYMBOLS } from './config';
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

// ---------------------------------------------------------------- tape faces
export function buildTapeFace(scene: Phaser.Scene, combo: number): void {
  const color = COLORS[Math.floor(combo / SYMBOLS.length)];
  const symbol = SYMBOLS[combo % SYMBOLS.length];
  const key = `tape-face-${combo}`;
  const W = 184, H = 120;
  const ctx = canvasTex(scene, key, W, H);

  // shell
  ctx.save();
  rr(ctx, 2, 2, W - 4, H - 4, 14);
  ctx.fillStyle = color.css;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = shade(color.css, -46);
  ctx.stroke();
  // top bevel light
  rr(ctx, 8, 7, W - 16, 10, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fill();
  // corner screws
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  for (const [sx, sy] of [[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14]]) {
    ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(sx - 1.2, sy - 1.2, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
  }

  // window with two reels (loose tapes lie face-up, both reels visible)
  rr(ctx, 34, 54, W - 68, 44, 10);
  ctx.fillStyle = 'rgba(24,15,10,0.58)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  rr(ctx, 34, 54, W - 68, 44, 10);
  ctx.stroke();
  // faint ribbon across window
  ctx.fillStyle = 'rgba(122,74,42,0.5)';
  rr(ctx, 62, 74, 60, 8, 4); ctx.fill();
  // reels
  for (const rx of [68, 116]) {
    ctx.beginPath(); ctx.arc(rx, 76, 16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(250,244,230,0.95)'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(rx, 76, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#3b2f2f'; ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,30,0.5)';
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k;
      ctx.beginPath();
      ctx.moveTo(rx + Math.cos(a) * 6, 76 + Math.sin(a) * 6);
      ctx.lineTo(rx + Math.cos(a) * 15, 76 + Math.sin(a) * 15);
      ctx.stroke();
    }
  }

  // label (cream) with symbol + track lines
  rr(ctx, 26, 14, W - 52, 26, 6);
  ctx.fillStyle = '#f6efdd'; ctx.fill();
  ctx.strokeStyle = 'rgba(60,40,30,0.16)'; ctx.lineWidth = 1.5; ctx.stroke();
  drawSymbol(ctx, symbol, 42, 27, 20, { fill: color.ink === '#f6efdd' ? '#40342b' : color.ink });
  ctx.strokeStyle = 'rgba(64,52,43,0.28)';
  ctx.lineWidth = 1.6;
  for (const ly of [22, 27, 32]) {
    ctx.beginPath(); ctx.moveTo(58, ly); ctx.lineTo(140, ly); ctx.stroke();
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
    // loose brown ribbon escaping the window, curling out
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
    // loose loops visible inside the window
    ctx.strokeStyle = 'rgba(122,74,42,0.85)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(88, 80); ctx.bezierCurveTo(94, 66, 104, 84, 98, 72); ctx.stroke();
  } else if (kind === 'sticker') {
    // cracked / torn symbol sticker on the label (symbol sits at 42,27)
    ctx.save();
    ctx.strokeStyle = 'rgba(52,38,28,0.8)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(36, 16); ctx.lineTo(43, 25); ctx.lineTo(39, 34); ctx.lineTo(47, 38);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(52, 14); ctx.lineTo(47, 24); ctx.lineTo(54, 33);
    ctx.stroke();
    // torn corner gap (peeled)
    ctx.fillStyle = '#f6efdd';
    ctx.beginPath();
    ctx.moveTo(50, 34); ctx.lineTo(60, 30); ctx.lineTo(56, 40); ctx.closePath();
    ctx.fill();
    // lifted sticker edge shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(44, 39, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    // small faded (bleached) patch on the shell bottom-left corner
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
export function buildSpine(scene: Phaser.Scene, combo: number): void {
  const color = COLORS[Math.floor(combo / SYMBOLS.length)];
  const symbol = SYMBOLS[combo % SYMBOLS.length];
  const key = `spine-${combo}`;
  const W = 28, H = 120;
  const ctx = canvasTex(scene, key, W, H);
  rr(ctx, 1, 1, W - 2, H - 2, 4);
  ctx.fillStyle = color.css; ctx.fill();
  ctx.lineWidth = 1.6; ctx.strokeStyle = shade(color.css, -40); ctx.stroke();
  // top cap + bottom cap
  rr(ctx, 2, 2, W - 4, 9, 3); ctx.fillStyle = shade(color.css, -28); ctx.fill();
  rr(ctx, 2, H - 12, W - 4, 10, 3); ctx.fillStyle = shade(color.css, -28); ctx.fill();
  // window slit
  rr(ctx, W / 2 - 3.5, 46, 7, 34, 3); ctx.fillStyle = 'rgba(24,15,10,0.55)'; ctx.fill();
  // tiny label stripe
  rr(ctx, 5, 88, W - 10, 22, 3); ctx.fillStyle = '#f6efdd'; ctx.fill();
  ctx.fillStyle = 'rgba(64,52,43,0.4)';
  ctx.fillRect(8, 94, W - 16, 2);
  // symbol near top (readable even edge-on)
  drawSymbol(ctx, symbol, W / 2, 22, 13, { fill: color.ink === '#f6efdd' ? '#ffffff' : '#3d2f22' });
  finish(scene, key);
}

// ---------------------------------------------------------------------- racks
export function buildRack(scene: Phaser.Scene, combo: number): void {
  const color = COLORS[Math.floor(combo / SYMBOLS.length)];
  const symbol = SYMBOLS[combo % SYMBOLS.length];
  const key = `rack-${combo}`;
  const W = 312, H = 184;
  const ctx = canvasTex(scene, key, W, H);

  // wooden body
  rr(ctx, 2, 2, W - 4, H - 4, 12);
  ctx.fillStyle = '#6e4429'; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = '#4a2c1a'; ctx.stroke();
  // wood grain
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2;
  for (let g = 0; g < 5; g++) {
    const gy = 10 + g * 36 + h2(combo * 31 + g) * 8;
    ctx.beginPath(); ctx.moveTo(8, gy);
    ctx.bezierCurveTo(W * 0.3, gy + (h2(g + combo) - 0.5) * 6, W * 0.7, gy - (h2(g * 7 + combo) - 0.5) * 6, W - 8, gy);
    ctx.stroke();
  }
  // top light bevel
  rr(ctx, 6, 5, W - 12, 8, 5);
  ctx.fillStyle = 'rgba(255,235,200,0.16)'; ctx.fill();

  // header strip: color chip + printed symbol (never color alone)
  rr(ctx, 10, 8, W - 20, 36, 8);
  ctx.fillStyle = '#5a3520'; ctx.fill();
  rr(ctx, 18, 15, 30, 22, 5);
  ctx.fillStyle = color.css; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
  drawSymbol(ctx, symbol, 64, 26, 22, { fill: '#f6efdd', stroke: 'rgba(0,0,0,0.4)', lineW: 1.5 });
  ctx.strokeStyle = 'rgba(246,239,221,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(86, 26); ctx.lineTo(W - 24, 26); ctx.stroke();

  // slot tray (edge-on cassettes live here)
  rr(ctx, 12, 50, W - 24, H - 62, 8);
  ctx.fillStyle = '#2e1c12'; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3; ctx.stroke();
  // inner shadow
  const grad = ctx.createLinearGradient(0, 50, 0, 70);
  grad.addColorStop(0, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  rr(ctx, 12, 50, W - 24, 22, 8);
  ctx.fillStyle = grad; ctx.fill();
  // dividers (8 slots)
  const pitch = (W - 28) / 8;
  for (let k = 1; k < 8; k++) {
    const x = 14 + k * pitch;
    ctx.fillStyle = '#7a4f30';
    ctx.fillRect(x - 2, 54, 4, H - 68);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x + 2, 54, 1.5, H - 68);
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
    // seam
    ctx.fillStyle = 'rgba(30,15,8,0.55)';
    ctx.fillRect(0, y0, S, 3);
    ctx.fillStyle = 'rgba(255,220,170,0.08)';
    ctx.fillRect(0, y0 + 3, S, 2);
    // grain
    ctx.strokeStyle = 'rgba(40,20,10,0.18)';
    ctx.lineWidth = 2;
    for (let g = 0; g < 5; g++) {
      const gy = y0 + 14 + h2(plank * 13 + g) * 100;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(S * 0.33, gy + (h2(g * 3 + plank) - 0.5) * 10, S * 0.66, gy - (h2(g * 5 + plank) - 0.5) * 10, S, gy);
      ctx.stroke();
    }
    // occasional knot
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
  const W = 760, H = 1400;
  const ctx = canvasTex(scene, key, W, H);
  rr(ctx, 6, 6, W - 12, H - 12, 28);
  ctx.fillStyle = '#b08a5c'; ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = '#6b4a2c'; ctx.stroke();
  // stitched inner border
  ctx.setLineDash([14, 10]);
  ctx.strokeStyle = 'rgba(240,220,184,0.65)';
  ctx.lineWidth = 4;
  rr(ctx, 26, 26, W - 52, H - 52, 18);
  ctx.stroke();
  ctx.setLineDash([]);
  // soft inner glow center
  const g = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, 'rgba(255,240,210,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0.05)');
  rr(ctx, 26, 26, W - 52, H - 52, 18);
  ctx.fillStyle = g; ctx.fill();

  // ---- tools doodles ----
  // pencil (top-left)
  ctx.save();
  ctx.translate(70, 120); ctx.rotate(-0.5);
  ctx.fillStyle = '#e8b937'; ctx.fillRect(0, -9, 210, 18);
  ctx.fillStyle = '#f6efdd'; ctx.beginPath(); ctx.moveTo(210, -9); ctx.lineTo(240, 0); ctx.lineTo(210, 9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5b4632'; ctx.beginPath(); ctx.moveTo(228, -3); ctx.lineTo(240, 0); ctx.lineTo(228, 3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d97b8f'; ctx.fillRect(-26, -9, 26, 18);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.strokeRect(0, -9, 210, 18);
  ctx.restore();
  // tweezers (top-right)
  ctx.save();
  ctx.translate(W - 90, 110); ctx.rotate(0.5);
  ctx.strokeStyle = '#c8cdd4'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40, 150); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(54, 150); ctx.stroke();
  ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(2, -30); ctx.lineTo(-12, 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(12, -30); ctx.lineTo(26, 6); ctx.stroke();
  ctx.restore();
  // markers (bottom-left): amber + one matching a random palette color
  for (const [mx, col] of [[70, '#c8862f'], [128, '#a05a9a']] as [number, string][]) {
    ctx.save();
    ctx.translate(mx, H - 200); ctx.rotate(-0.12);
    ctx.fillStyle = col; rr(ctx, 0, 0, 30, 160, 6); ctx.fill();
    ctx.fillStyle = '#efe6d2'; rr(ctx, 0, 120, 30, 40, 5); ctx.fill();
    ctx.fillStyle = shade(col, -30); rr(ctx, 0, 0, 30, 26, 6); ctx.fill();
    ctx.restore();
  }
  // soft cloth (bottom-right)
  ctx.save();
  ctx.translate(W - 190, H - 160); ctx.rotate(0.2);
  rr(ctx, 0, 0, 130, 90, 12);
  ctx.fillStyle = '#e9ddc8'; ctx.fill();
  ctx.strokeStyle = 'rgba(120,90,60,0.4)'; ctx.lineWidth = 3; ctx.stroke();
  rr(ctx, 14, 12, 102, 66, 8);
  ctx.strokeStyle = 'rgba(120,90,60,0.25)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
  finish(scene, key);
}

// ----------------------------------------------------------------------- props
export function buildProps(scene: Phaser.Scene): void {
  // lamp glow (top-left corner of the world)
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
    // lamp silhouette
    ctx.fillStyle = '#4a2c1a';
    ctx.beginPath();
    ctx.moveTo(S / 2 - 52, S / 2 + 26);
    ctx.lineTo(S / 2 + 52, S / 2 + 26);
    ctx.lineTo(S / 2 + 34, S / 2 - 20);
    ctx.lineTo(S / 2 - 34, S / 2 - 20);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(S / 2 - 6, S / 2 + 26, 12, 46);
    ctx.beginPath(); ctx.arc(S / 2, S / 2 + 78, 16, 0, Math.PI * 2); ctx.fill();
    finish(scene, key);
  }
  // radio
  {
    const key = 'prop-radio';
    const W = 150, H = 100;
    const ctx = canvasTex(scene, key, W, H);
    rr(ctx, 3, 3, W - 6, H - 6, 12);
    ctx.fillStyle = '#c96b52'; ctx.fill();
    ctx.strokeStyle = '#7c3b2c'; ctx.lineWidth = 4; ctx.stroke();
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
  // plant
  {
    const key = 'prop-plant';
    const W = 130, H = 150;
    const ctx = canvasTex(scene, key, W, H);
    ctx.fillStyle = '#8a5a3b';
    rr(ctx, 38, 96, 54, 50, 10); ctx.fill();
    ctx.strokeStyle = '#5b3822'; ctx.lineWidth = 3; ctx.stroke();
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
  // books + pencil cup (near the bench)
  {
    const key = 'prop-books';
    const W = 170, H = 130;
    const ctx = canvasTex(scene, key, W, H);
    const cols = ['#a05a9a', '#5a7d9a', '#c8862f'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = cols[i];
      rr(ctx, 8 + i * 12, 78 - i * 2, 130 - i * 6, 34, 5); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(16 + i * 12, 84 - i * 2, 96 - i * 6, 5);
    }
    // pencil cup
    ctx.fillStyle = '#6e4429';
    rr(ctx, 118, 46, 44, 56, 7); ctx.fill();
    ctx.strokeStyle = '#4a2c1a'; ctx.lineWidth = 3; ctx.stroke();
    for (const [px, col] of [[126, '#e8b937'], [140, '#7bb661'], [153, '#d94f4f']] as [number, string][]) {
      ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px, 52); ctx.lineTo(px + (px - 140) * 0.12, 22); ctx.stroke();
    }
    finish(scene, key);
  }
}

// ----------------------------------------------------------------- tools (repair)
export function buildTools(scene: Phaser.Scene): void {
  // pencil
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
  // tweezers
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
  // marker (tip is white; tint with the shell color at runtime)
  {
    const key = 'tool-marker';
    const W = 30, H = 160;
    const ctx = canvasTex(scene, key, W, H);
    ctx.fillStyle = '#5a4632';
    rr(ctx, 6, 26, 18, 134, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffffff'; // tip (tinted)
    ctx.beginPath(); ctx.moveTo(6, 26); ctx.lineTo(15, 0); ctx.lineTo(24, 26); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#efe6d2'; rr(ctx, 6, 108, 18, 34, 4); ctx.fill();
    ctx.fillStyle = '#40342b'; rr(ctx, 6, 26, 18, 20, 5); ctx.fill();
    finish(scene, key);
  }
  // soft dot (for paint erase + particles)
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

// standalone symbol stickers (white; tint with the combo ink color)
export function buildSymbolStickers(scene: Phaser.Scene): void {
  for (const symbol of SYMBOLS) {
    const key = `sym-${symbol}`;
    const S = 72;
    const ctx = canvasTex(scene, key, S, S);
    drawSymbol(ctx, symbol, S / 2, S / 2, S * 0.72, { fill: '#ffffff', stroke: 'rgba(0,0,0,0.12)', lineW: 2 });
    finish(scene, key);
  }
}

/** Build every texture (called once from BootScene). */
export function buildAllTextures(scene: Phaser.Scene): void {
  buildWood(scene);
  buildBench(scene);
  buildProps(scene);
  buildTools(scene);
  buildSymbolStickers(scene);
  for (let combo = 0; combo < COLORS.length * SYMBOLS.length; combo++) {
    buildTapeFace(scene, combo);
    buildSpine(scene, combo);
    buildRack(scene, combo);
  }
  buildDefectOverlay(scene, 'rewind');
  buildDefectOverlay(scene, 'sticker');
  buildDefectOverlay(scene, 'paint');
}
