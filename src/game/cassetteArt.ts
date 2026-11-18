/**
 * Tidy Tapes — full-board cassette template (v4 F1).
 *
 * One reusable template, three poses (loose / turn / spine), baked per
 * (pose, shell color, symbol) as cached canvas textures at boot. Geometry and
 * layer order come from the Full-Board Handoff (layer-layout.json + art/*.svg):
 *
 *   layer 1 shell-color     neutral shell, filled with the combo's color
 *   layer 2 shell-shading   color-independent gradients (face sheen, side dark)
 *   layer 3 fixed-details   cream label, window, hubs, screws — never tinted
 *   layer 4 symbol-overlay  the combo's symbol at the pose's label anchor
 *
 * Display footprints are the game's canonical ones (loose 104x72, spine 16x28)
 * — this is a rendering swap only: positions, hitboxes, snap targets and the
 * pose system's explicit sizes are untouched. Textures bake at 2x for
 * crispness, matching the rest of the factory.
 */
import Phaser from 'phaser';
import { COLORS, SYMBOLS } from './config';
import { drawSymbol } from './symbols';

// ---- reference constants (handoff SVGs, art px) ----------------------------

/** fixed dark ink for symbols on the cream label (reference symbols.svg ink) */
const SYMBOL_INK = '#42392e';
/** shared shell outline (reference stroke #38332d family) */
const SHELL_STROKE = '#38332d';

/** label/window paper + window + steel gradients (reference defs) */
function paperGrad(ctx: CanvasRenderingContext2D, y0: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#fff0cb');
  g.addColorStop(1, '#e3bf88');
  return g;
}
function faceLightGrad(ctx: CanvasRenderingContext2D, y0: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(255,255,255,0.32)');
  g.addColorStop(0.38, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(38,24,17,0.20)');
  return g;
}
function sideLightGrad(ctx: CanvasRenderingContext2D, y0: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(41,34,29,0.31)');
  g.addColorStop(1, 'rgba(41,34,29,0.55)');
  return g;
}

/** spool hub gear tooth path (reference hub path, 24x24 centered at 0,0) */
const HUB_GEAR = new Path2D(
  'm0-7 2.9 2 3.3-.5-.6 3.5 2 2.5-2.7 2-.2 3.4-3.4-.8L0 7l-2.5-2-3.3.7-.1-3.4-2.1-2 2.2-2.2-.5-3.5 3.6.5Z',
);

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function polyPath(ctx: CanvasRenderingContext2D, pts: number[][]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

/**
 * Fixed details shared by the loose and turn faces, drawn in face-local space
 * (the 238x132 shell rect) under the caller's face-matrix transform.
 */
function drawFaceDetails(ctx: CanvasRenderingContext2D, scaleStroke: number): void {
  ctx.save();
  ctx.lineWidth = 1.6 * scaleStroke;
  // cream label block
  roundedRectPath(ctx, 15, 14, 208, 89, 10);
  ctx.fillStyle = paperGrad(ctx, 14, 103);
  ctx.fill();
  ctx.strokeStyle = '#4d3b2e';
  ctx.stroke();
  // faded print lines on the label
  ctx.strokeStyle = 'rgba(181,138,83,0.6)';
  ctx.lineWidth = 1.2 * scaleStroke;
  ctx.beginPath();
  ctx.moveTo(31, 36); ctx.lineTo(88, 36);
  ctx.moveTo(152, 36); ctx.lineTo(202, 36);
  ctx.moveTo(33, 42); ctx.lineTo(80, 42);
  ctx.moveTo(160, 42); ctx.lineTo(199, 42);
  ctx.stroke();
  // dark tape window
  roundedRectPath(ctx, 34, 50, 170, 40, 15);
  const wg = ctx.createLinearGradient(0, 50, 0, 90);
  wg.addColorStop(0, '#17191b');
  wg.addColorStop(1, '#3d302b');
  ctx.fillStyle = wg;
  ctx.fill();
  ctx.strokeStyle = '#514237';
  ctx.lineWidth = 2.4 * scaleStroke;
  ctx.stroke();
  // ribbon pack behind the hubs
  roundedRectPath(ctx, 75, 59, 88, 22, 6);
  ctx.fillStyle = 'rgba(118,88,67,0.56)';
  ctx.fill();
  // ribbon ribs
  ctx.strokeStyle = 'rgba(51,41,34,0.65)';
  ctx.lineWidth = 1.3 * scaleStroke;
  ctx.beginPath();
  for (let k = 0; k < 9; k++) {
    const x = 92 + k * 8;
    ctx.moveTo(x, 60); ctx.lineTo(x, 80);
  }
  ctx.stroke();
  // two spool hubs with gear teeth
  for (const hx of [64, 174]) {
    ctx.save();
    ctx.translate(hx, 70);
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#d2ac77'; ctx.fill();
    ctx.strokeStyle = '#17181a'; ctx.lineWidth = 2 * scaleStroke; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 9.6, 0, Math.PI * 2);
    ctx.fillStyle = '#f3d7a1'; ctx.fill();
    ctx.fillStyle = '#42342d';
    ctx.fill(HUB_GEAR);
    ctx.restore();
  }
  // bottom trapezoid + screw marks
  ctx.strokeStyle = 'rgba(41,43,43,0.57)';
  ctx.lineWidth = 1.7 * scaleStroke;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(55, 124); ctx.lineTo(65, 109); ctx.lineTo(173, 109); ctx.lineTo(183, 124);
  ctx.moveTo(96, 118); ctx.lineTo(103, 118);
  ctx.moveTo(128, 118); ctx.lineTo(135, 118);
  ctx.stroke();
  ctx.fillStyle = '#584940';
  for (const [sx, sy] of [[8, 9], [230, 9], [8, 123], [230, 123]]) {
    ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ poses

/** loose pose art bounds in reference space (computed from the SVG paths) */
const LOOSE_BOUNDS = { x: 22.2, y: 42, w: 265.6, h: 148.8 };
const LOOSE_SIDE: number[][] = [[278, 43], [287, 51], [267, 182], [260, 190], [255, 183]];

/** turn pose art bounds + pivot-derived origin */
const TURN_BOUNDS = { x: 61, y: 25, w: 156, h: 169.5 };
const TURN_SIDE: number[][] = [[186, 73], [215, 64], [216, 179], [190, 192], [183, 187]];
const TURN_SIDE_PAPER: number[][] = [[191, 90], [209, 84], [210, 158], [192, 166]];

/** canonical display sizes (footprints preserved from the pre-v4 game) */
export const CASSETTE_LOOSE_DISPLAY = { w: 104, h: 72 };
export const CASSETTE_TURN_DISPLAY = { w: 82, h: 89 };
/** turn origin = reference pivot (199,184) inside the bounds */
export const CASSETTE_TURN_ORIGIN: [number, number] = [
  (199 - TURN_BOUNDS.x) / TURN_BOUNDS.w,
  (184 - TURN_BOUNDS.y) / TURN_BOUNDS.h,
];

/** soft contact shadow baked under the loose face */
function bakeShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(24,12,6,0.26)';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(24,12,6,0.13)';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.88, ry * 0.86, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/**
 * Broad face up on the table: slim right side edge visible, shallow
 * three-quarter skew on the face. 208x144 @2x (display 104x72).
 */
export function bakeLooseCassette(scene: Phaser.Scene, combo: number): void {
  const color = COLORS[Math.floor(combo / SYMBOLS.length)];
  const symbol = SYMBOLS[combo % SYMBOLS.length];
  const key = `tape-face-${combo}`;
  const W = 208, H = 144;
  const ctx = (scene.textures.exists(key)
    ? scene.textures.get(key) as Phaser.Textures.CanvasTexture
    : scene.textures.createCanvas(key, W, H) as Phaser.Textures.CanvasTexture).getContext();
  ctx.clearRect(0, 0, W, H);

  const s = (W / 2) / LOOSE_BOUNDS.w;              // art px -> canvas px (fit width)
  const tx = -LOOSE_BOUNDS.x * s;
  const ty = (H - LOOSE_BOUNDS.h * s) / 2 - LOOSE_BOUNDS.y * s;
  const B = (f: () => void) => {                   // draw in bake space
    ctx.save();
    ctx.setTransform(s, 0, 0, s, tx, ty);
    f();
    ctx.restore();
  };

  bakeShadow(ctx, W / 2 + 7, H / 2 + 16, 96, 52);

  // 1+2: shell color + shading (face under its skew matrix, side in pose space)
  B(() => {
    // side edge (behind the face)
    polyPath(ctx, LOOSE_SIDE);
    ctx.fillStyle = color.css;
    ctx.fill();
    ctx.strokeStyle = SHELL_STROKE;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    polyPath(ctx, LOOSE_SIDE);
    ctx.fillStyle = sideLightGrad(ctx, 43, 190);
    ctx.fill();
    // face
    ctx.save();
    ctx.transform(1, 0.036, -0.15, 1, 43, 43);
    roundedRectPath(ctx, 0, 0, 238, 132, 12);
    ctx.fillStyle = color.css;
    ctx.fill();
    ctx.strokeStyle = SHELL_STROKE;
    ctx.lineWidth = 2;
    ctx.stroke();
    roundedRectPath(ctx, 0, 0, 238, 132, 12);
    ctx.fillStyle = faceLightGrad(ctx, 0, 132);
    ctx.fill();
    // top bevel light catch
    ctx.strokeStyle = 'rgba(255,241,218,0.6)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(13, 5); ctx.quadraticCurveTo(119, -2, 220, 10);
    ctx.stroke();
    ctx.restore();
  });

  // 3: fixed details under the face matrix
  B(() => {
    ctx.transform(1, 0.036, -0.15, 1, 43, 43);
    drawFaceDetails(ctx, 1);
  });

  // 4: symbol at the face-local label anchor (119,31), under the same matrix
  // (size raised from the reference's 21 to keep legibility at play zoom)
  B(() => {
    ctx.transform(1, 0.036, -0.15, 1, 43, 43);
    drawSymbol(ctx, symbol, 119, 31, 32, { fill: SYMBOL_INK });
  });

  (scene.textures.get(key) as Phaser.Textures.CanvasTexture).refresh();
}

/**
 * Mid-insertion pose: face foreshortening as the spine edge rises. Baked to
 * the reference silhouette; display size CASSETTE_TURN_DISPLAY.
 */
export function bakeTurnCassette(scene: Phaser.Scene, combo: number): void {
  const color = COLORS[Math.floor(combo / SYMBOLS.length)];
  const symbol = SYMBOLS[combo % SYMBOLS.length];
  const key = `tape-turn-${combo}`;
  const s2 = 2 * (CASSETTE_TURN_DISPLAY.h / TURN_BOUNDS.h);
  const W = Math.ceil(TURN_BOUNDS.w * s2);
  const H = Math.ceil(TURN_BOUNDS.h * s2);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const ctx = (scene.textures.createCanvas(key, W, H) as Phaser.Textures.CanvasTexture).getContext();
  ctx.clearRect(0, 0, W, H);
  const B = (f: () => void) => {
    ctx.save();
    ctx.setTransform(s2, 0, 0, s2, -TURN_BOUNDS.x * s2, -TURN_BOUNDS.y * s2);
    f();
    ctx.restore();
  };

  // 1+2: shell + shading
  B(() => {
    polyPath(ctx, TURN_SIDE);
    ctx.fillStyle = color.css; ctx.fill();
    ctx.strokeStyle = SHELL_STROKE; ctx.lineWidth = 1.9; ctx.stroke();
    polyPath(ctx, TURN_SIDE);
    ctx.fillStyle = sideLightGrad(ctx, 64, 192);
    ctx.fill();
    ctx.save();
    ctx.transform(0.51, 0.21, -0.060, 0.89, 70, 26);
    roundedRectPath(ctx, 0, 0, 238, 132, 12);
    ctx.fillStyle = color.css; ctx.fill();
    ctx.strokeStyle = SHELL_STROKE; ctx.lineWidth = 2.6; ctx.stroke();
    roundedRectPath(ctx, 0, 0, 238, 132, 12);
    ctx.fillStyle = faceLightGrad(ctx, 0, 132);
    ctx.fill();
    ctx.restore();
  });

  // 3: side paper strip (pose space) + face details (face matrix)
  B(() => {
    polyPath(ctx, TURN_SIDE_PAPER);
    ctx.fillStyle = paperGrad(ctx, 84, 166);
    ctx.fill();
    ctx.strokeStyle = '#493c32'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save();
    ctx.transform(0.51, 0.21, -0.060, 0.89, 70, 26);
    drawFaceDetails(ctx, 1.35);
    ctx.restore();
  });

  // 4: symbols — face anchor (under matrix) + side-spine anchor (pose space)
  B(() => {
    ctx.save();
    ctx.transform(0.51, 0.21, -0.060, 0.89, 70, 26);
    drawSymbol(ctx, symbol, 119, 31, 32, { fill: SYMBOL_INK });
    ctx.restore();
    drawSymbol(ctx, symbol, 201, 122, 16, { fill: SYMBOL_INK });
  });

  (scene.textures.get(key) as Phaser.Textures.CanvasTexture).refresh();
}

/**
 * Seated spine restyled in the reference materials at the FIXED slot scale
 * (16x28 display; the tall reference proportion belonged to the retired
 * portrait cabinet). 32x56 @2x.
 */
export function bakeSpineCassette(scene: Phaser.Scene, combo: number): void {
  const color = COLORS[Math.floor(combo / SYMBOLS.length)];
  const symbol = SYMBOLS[combo % SYMBOLS.length];
  const key = `spine-${combo}`;
  const W = 32, H = 56;
  const ctx = (scene.textures.exists(key)
    ? scene.textures.get(key) as Phaser.Textures.CanvasTexture
    : scene.textures.createCanvas(key, W, H) as Phaser.Textures.CanvasTexture).getContext();
  ctx.clearRect(0, 0, W, H);

  // shell + outline
  roundedRectPath(ctx, 1, 1, W - 2, H - 2, 6);
  ctx.fillStyle = color.css; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = SHELL_STROKE; ctx.stroke();
  // shading: left rim light, right side darkening (same direction as the faces)
  roundedRectPath(ctx, 1, 1, W - 2, H - 2, 6);
  ctx.save(); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.26)';
  ctx.fillRect(2, 2, 5, H - 4);
  const side = ctx.createLinearGradient(W - 12, 0, W, 0);
  side.addColorStop(0, 'rgba(41,34,29,0)');
  side.addColorStop(1, 'rgba(41,34,29,0.5)');
  ctx.fillStyle = side;
  ctx.fillRect(W - 12, 0, 11, H);
  const top = ctx.createLinearGradient(0, 0, 0, 10);
  top.addColorStop(0, 'rgba(255,255,255,0.18)');
  top.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = top;
  ctx.fillRect(2, 1, W - 4, 9);
  ctx.restore();
  // caps
  roundedRectPath(ctx, 2, 2, W - 4, 6, 3);
  ctx.fillStyle = 'rgba(41,34,29,0.34)'; ctx.fill();
  roundedRectPath(ctx, 2, H - 8, W - 4, 6, 3);
  ctx.fillStyle = 'rgba(41,34,29,0.34)'; ctx.fill();
  // cream label band + ticks
  roundedRectPath(ctx, 4, 20, W - 8, 24, 3);
  ctx.fillStyle = paperGrad(ctx, 20, 44); ctx.fill();
  ctx.strokeStyle = 'rgba(74,57,48,0.8)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = 'rgba(164,128,87,0.8)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(7, 26); ctx.lineTo(W - 7, 26);
  ctx.moveTo(7, 39); ctx.lineTo(W - 7, 39);
  ctx.stroke();
  // symbol at the label anchor (~mid band), sized for legibility
  drawSymbol(ctx, symbol, W / 2, 32, 13, { fill: SYMBOL_INK });

  (scene.textures.get(key) as Phaser.Textures.CanvasTexture).refresh();
}

/** bake the whole new-art cassette family (called from BootScene) */
export function bakeAllCassettes(scene: Phaser.Scene): void {
  for (let combo = 0; combo < COLORS.length * SYMBOLS.length; combo++) {
    bakeLooseCassette(scene, combo);
    bakeTurnCassette(scene, combo);
    bakeSpineCassette(scene, combo);
  }
}
