/**
 * Asset catalog: original, self-authored SVG props for the room.
 *
 * Everything is drawn in "local isometric space" using the same basis as the
 * shared projector (see projection.ts): +x slopes 30° down-right, +y slopes
 * 30° down-left, z is straight up. Each builder returns a <g> anchored at its
 * local origin — for furniture that is the floor center of the footprint, for
 * items the floor contact point.
 */
import type { CategoryId } from '../game/types';
import { ISO_COS, ISO_SIN } from './projection';
import { palette as P } from './palette';
import { el, fmt, shade } from './svg';

const C = ISO_COS;
const S = ISO_SIN;
const RX = Math.SQRT2 * C; // horizontal circle → ellipse rx factor (≈1.2247)
const RY = Math.SQRT2 * S; // ≈ 0.7071

type P3 = [number, number, number];
type Attrs = Record<string, string | number | undefined>;

const EDGE = 'rgba(61, 47, 36, 0.25)';
const EDGE_SOFT = 'rgba(61, 47, 36, 0.14)';

/** Local iso point. */
export function ip(dx: number, dy: number, dz = 0): [number, number] {
  return [(dx - dy) * C, (dx + dy) * S - dz];
}

function sp(p: [number, number]): string {
  return `${fmt(p[0])} ${fmt(p[1])}`;
}

function poly(local: P3[], attrs: Attrs): SVGPolygonElement {
  return el('polygon', {
    ...attrs,
    points: local.map((p) => ip(p[0], p[1], p[2])).map(sp).join(','),
  });
}

function line(a: P3, b: P3, attrs: Attrs): SVGLineElement {
  return el('line', { ...attrs, x1: fmt(ip(a[0], a[1], a[2])[0]), y1: fmt(ip(a[0], a[1], a[2])[1]), x2: fmt(ip(b[0], b[1], b[2])[0]), y2: fmt(ip(b[0], b[1], b[2])[1]) });
}

/** Iso box showing its three camera-facing faces (top, +x side, +y side). */
export function box(
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  col: { top: string; right?: string; left?: string },
  attrs?: Attrs,
): SVGGElement {
  const stroke = (attrs?.stroke as string) ?? EDGE;
  const common: Attrs = { stroke, 'stroke-width': 0.01, 'stroke-linejoin': 'round' };
  const right = poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], { fill: col.right ?? shade(col.top, 0.8), ...common });
  const left = poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], { fill: col.left ?? shade(col.top, 0.62), ...common });
  const top = poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], { fill: col.top, ...common });
  return el('g', {}, [left, right, top]);
}

/** Rounded rectangle lying flat in iso space at height z. */
export function roundedIsoRect(
  x0: number, x1: number, y0: number, y1: number, z: number, r: number,
  attrs: Attrs,
): SVGPathElement {
  const c: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const seg = (a: [number, number], b: [number, number], dist: number): [number, number] => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = Math.min(1, dist / len);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const r0 = seg(c[0], c[1], r), q0 = seg(c[1], c[0], r);
  const r1 = seg(c[1], c[2], r), q1 = seg(c[2], c[1], r);
  const r2 = seg(c[2], c[3], r), q2 = seg(c[3], c[2], r);
  const r3 = seg(c[3], c[0], r), q3 = seg(c[0], c[3], r);
  const d = `M ${sp(ip(r0[0], r0[1], z))} L ${sp(ip(q0[0], q0[1], z))} Q ${sp(ip(c[1][0], c[1][1], z))} ${sp(ip(r1[0], r1[1], z))} L ${sp(ip(q1[0], q1[1], z))} Q ${sp(ip(c[2][0], c[2][1], z))} ${sp(ip(r2[0], r2[1], z))} L ${sp(ip(q2[0], q2[1], z))} Q ${sp(ip(c[3][0], c[3][1], z))} ${sp(ip(r3[0], r3[1], z))} L ${sp(ip(q3[0], q3[1], z))} Q ${sp(ip(c[0][0], c[0][1], z))} ${sp(ip(r0[0], r0[1], z))} Z`;
  return el('path', { ...attrs, d });
}

/** Horizontal circle at height z. */
export function isoEllipse(cx: number, cy: number, z: number, r: number, attrs: Attrs): SVGEllipseElement {
  const [x, y] = ip(cx, cy, z);
  return el('ellipse', { ...attrs, cx: fmt(x), cy: fmt(y), rx: fmt(r * RX), ry: fmt(r * RY) });
}

/** Circle standing on the y = const plane (the right-hand wall). */
function circleOnWallY(cx: number, y: number, cz: number, r: number, attrs: Attrs): SVGPolygonElement {
  const pts: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    pts.push(sp(ip(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r)));
  }
  return el('polygon', { ...attrs, points: pts.join(',') });
}

function cylinder(cx: number, cy: number, z0: number, r: number, h: number, col: { side: string; top: string }): SVGGElement {
  const rx = r * RX;
  const ry = r * RY;
  const [x, yb] = ip(cx, cy, z0);
  const yt = yb - h;
  const body = el('path', {
    d: `M ${fmt(x - rx)} ${fmt(yt)} L ${fmt(x - rx)} ${fmt(yb)} A ${fmt(rx)} ${fmt(ry)} 0 0 0 ${fmt(x + rx)} ${fmt(yb)} L ${fmt(x + rx)} ${fmt(yt)} Z`,
    fill: col.side,
    stroke: EDGE,
    'stroke-width': 0.01,
  });
  const cap = el('ellipse', { cx: fmt(x), cy: fmt(yt), rx: fmt(rx), ry: fmt(ry), fill: col.top, stroke: EDGE, 'stroke-width': 0.01 });
  return el('g', {}, [body, cap]);
}

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

function rug(): SVGGElement {
  const g = el('g');
  // tiny thickness
  g.appendChild(poly([[-1.7, 1.2, 0], [1.7, 1.2, 0], [1.7, 1.2, 0.03], [-1.7, 1.2, 0.03]], { fill: shade(P.tealDeep, 0.8), stroke: 'none' }));
  g.appendChild(poly([[1.7, -1.2, 0], [1.7, 1.2, 0], [1.7, 1.2, 0.03], [1.7, -1.2, 0.03]], { fill: shade(P.tealDeep, 0.68), stroke: 'none' }));
  g.appendChild(poly([[-1.7, -1.2, 0.03], [1.7, -1.2, 0.03], [1.7, 1.2, 0.03], [-1.7, 1.2, 0.03]], { fill: P.teal, stroke: EDGE_SOFT, 'stroke-width': 0.012, 'fill-opacity': 0.92 }));
  g.appendChild(poly([[-1.56, -1.06, 0.035], [1.56, -1.06, 0.035], [1.56, 1.06, 0.035], [-1.56, 1.06, 0.035]], { fill: P.sand, stroke: 'none' }));
  g.appendChild(poly([[-1.44, -0.94, 0.04], [1.44, -0.94, 0.04], [1.44, 0.94, 0.04], [-1.44, 0.94, 0.04]], { fill: P.linen, stroke: 'none' }));
  // quiet diamond motif
  g.appendChild(poly([[0, -0.62, 0.045], [0.86, 0, 0.045], [0, 0.62, 0.045], [-0.86, 0, 0.045]], { fill: 'none', stroke: P.terracotta, 'stroke-width': 0.03, 'stroke-opacity': 0.28, 'stroke-linejoin': 'round' }));
  g.appendChild(poly([[0, -0.3, 0.045], [0.42, 0, 0.045], [0, 0.3, 0.045], [-0.42, 0, 0.045]], { fill: P.teal, 'fill-opacity': 0.22, stroke: 'none' }));
  return g;
}

function entryMat(): SVGGElement {
  const g = el('g');
  g.appendChild(poly([[-0.5, 0.35, 0], [0.5, 0.35, 0], [0.5, 0.35, 0.035], [-0.5, 0.35, 0.035]], { fill: shade(P.terracottaDark, 0.75), stroke: 'none' }));
  g.appendChild(poly([[0.5, -0.35, 0], [0.5, 0.35, 0], [0.5, 0.35, 0.035], [0.5, -0.35, 0.035]], { fill: shade(P.terracottaDark, 0.62), stroke: 'none' }));
  g.appendChild(poly([[-0.5, -0.35, 0.035], [0.5, -0.35, 0.035], [0.5, 0.35, 0.035], [-0.5, 0.35, 0.035]], { fill: P.terracottaDark, stroke: EDGE_SOFT, 'stroke-width': 0.012 }));
  g.appendChild(poly([[-0.4, -0.26, 0.04], [0.4, -0.26, 0.04], [0.4, 0.26, 0.04], [-0.4, 0.26, 0.04]], { fill: P.sand, stroke: 'none' }));
  // woven stripes
  g.appendChild(poly([[-0.4, -0.13, 0.045], [0.4, -0.13, 0.045], [0.4, -0.08, 0.045], [-0.4, -0.08, 0.045]], { fill: P.terracotta, 'fill-opacity': 0.55, stroke: 'none' }));
  g.appendChild(poly([[-0.4, 0.08, 0.045], [0.4, 0.08, 0.045], [0.4, 0.13, 0.045], [-0.4, 0.13, 0.045]], { fill: P.terracotta, 'fill-opacity': 0.55, stroke: 'none' }));
  return g;
}

function miniPlant(scale: number): SVGGElement {
  const g = el('g', { transform: `scale(${scale})` });
  g.appendChild(cylinder(0, 0, 0, 0.09, 0.13, { side: shade(P.terracotta, 0.85), top: P.terracotta }));
  g.appendChild(isoEllipse(0, 0, 0.13, 0.075, { fill: P.walnutDeep }));
  const leaf = (rot: number, s: number, col: string) =>
    el('path', {
      d: 'M 0 0 C 0.045 -0.075 0.09 -0.22 0.035 -0.44 C 0.018 -0.49 -0.032 -0.49 -0.042 -0.43 C -0.078 -0.24 -0.036 -0.085 0 0 Z',
      fill: col,
      transform: `translate(0 -0.13) rotate(${rot}) scale(${s})`,
    });
  g.appendChild(leaf(-40, 0.9, P.leaf));
  g.appendChild(leaf(15, 1.05, P.leafDark));
  g.appendChild(leaf(55, 0.8, P.leaf));
  return g;
}

function staticBook(y: number, z: number, h: number, t: number, cover: string): SVGGElement {
  // spine (+x) and cover (+y) carry the color; the top shows cream pages
  const b = box(-0.1, y - t / 2, z, 0.1, y + t / 2, z + h, { top: P.cream, right: cover, left: shade(cover, 0.88) });
  b.appendChild(poly([[0.101, y - t / 2 + 0.008, z + h * 0.38], [0.101, y + t / 2 - 0.008, z + h * 0.38], [0.101, y + t / 2 - 0.008, z + h * 0.55], [0.101, y - t / 2 + 0.008, z + h * 0.55]], { fill: P.cream, 'fill-opacity': 0.92, stroke: 'none' }));
  return b;
}

function bookshelf(): SVGGElement {
  const g = el('g');
  // back panel (interior shows its +x face)
  g.appendChild(box(-0.29, -0.8, 0.05, -0.22, 0.8, 2.06, { top: P.walnutDark, right: P.linen, left: P.walnutDark }));
  // left side panel (farther in y → drawn early)
  g.appendChild(box(-0.29, -0.8, 0, 0.29, -0.73, 2.2, { top: P.walnutLight, right: P.walnut, left: shade(P.walnut, 0.85) }));
  // bottom panel
  g.appendChild(box(-0.22, -0.74, 0, 0.29, 0.74, 0.1, { top: P.walnutLight, right: P.walnut, left: P.walnutDark }));
  // shelves
  g.appendChild(box(-0.22, -0.74, 0.63, 0.29, 0.74, 0.68, { top: P.walnutLight, right: shade(P.walnut, 0.9), left: P.walnutDark }));
  g.appendChild(box(-0.22, -0.74, 1.25, 0.29, 0.74, 1.3, { top: P.walnutLight, right: shade(P.walnut, 0.9), left: P.walnutDark }));
  // non-interactive example books on the slot shelf + a small stack below
  // (drawn BEFORE the near side panel so they sit inside the cubby)
  g.appendChild(staticBook(0.36, 0.68, 0.34, 0.05, P.teal));
  g.appendChild(staticBook(0.425, 0.68, 0.3, 0.055, P.mustard));
  g.appendChild(staticBook(0.5, 0.68, 0.32, 0.045, P.terracottaDark));
  g.appendChild(box(-0.09, -0.28, 0.1, 0.09, 0.06, 0.15, { top: P.terracotta, right: shade(P.terracotta, 0.75), left: P.cream }));
  g.appendChild(box(-0.08, -0.24, 0.15, 0.08, 0.02, 0.2, { top: P.tealDark, right: shade(P.tealDark, 0.75), left: P.cream }));
  // right side panel (nearer → drawn after the books)
  g.appendChild(box(-0.29, 0.73, 0, 0.29, 0.8, 2.2, { top: P.walnutLight, right: P.walnut, left: shade(P.walnut, 0.85) }));
  // top slab
  g.appendChild(box(-0.29, -0.8, 1.95, 0.29, 0.8, 2.2, { top: P.walnutLight, right: P.walnut, left: shade(P.walnut, 0.85) }));
  // tiny plant on top
  const plant = miniPlant(0.9);
  plant.setAttribute('transform', `translate(${fmt(ip(0, -0.5, 2.2)[0])} ${fmt(ip(0, -0.5, 2.2)[1])})`);
  g.appendChild(plant);
  return g;
}

function sofa(): SVGGElement {
  const g = el('g');
  const leg = (x: number, y: number) => box(x, y, 0, x + 0.07, y + 0.07, 0.13, { top: P.walnutLight, right: P.walnutDark, left: P.walnutDeep });
  g.appendChild(leg(-0.55, -0.72));
  g.appendChild(leg(0.5, -0.72));
  g.appendChild(leg(-0.55, 0.63));
  g.appendChild(leg(0.5, 0.63));
  // base
  g.appendChild(box(-0.62, -0.8, 0.13, 0.63, 0.8, 0.42, { top: P.teal, right: shade(P.teal, 0.9), left: shade(P.teal, 0.7) }));
  // backrest
  g.appendChild(box(-0.62, -0.8, 0.42, -0.28, 0.8, 1.12, { top: shade(P.teal, 1.08), right: P.teal, left: shade(P.teal, 0.72) }));
  // seat slab
  g.appendChild(box(-0.28, -0.6, 0.42, 0.63, 0.6, 0.55, { top: shade(P.teal, 1.14), right: shade(P.teal, 0.92), left: shade(P.teal, 0.7) }));
  // left arm (drawn before seat edge details, it is farther in y? no — left arm is at -y, behind) — keep order: arms after seat so their inner faces overlap seat edges cleanly
  g.appendChild(box(-0.28, -0.8, 0.42, 0.63, -0.6, 0.74, { top: shade(P.teal, 1.05), right: P.teal, left: shade(P.teal, 0.7) }));
  g.appendChild(box(-0.28, 0.6, 0.42, 0.63, 0.8, 0.74, { top: shade(P.teal, 1.05), right: P.teal, left: shade(P.teal, 0.7) }));
  // cream piping along the seat
  const seam: P3[] = [[-0.28, -0.6, 0.552], [0.63, -0.6, 0.552], [0.63, 0.6, 0.552], [-0.28, 0.6, 0.552]];
  g.appendChild(el('polyline', { points: seam.map((p) => sp(ip(p[0], p[1], p[2]))).join(','), fill: 'none', stroke: P.cream, 'stroke-width': 0.016, 'stroke-opacity': 0.65, 'stroke-linejoin': 'round' }));
  // seat cushion split
  g.appendChild(line([-0.28, 0, 0.552], [0.63, 0, 0.552], { stroke: P.cream, 'stroke-width': 0.014, 'stroke-opacity': 0.5 }));
  // backrest seam
  g.appendChild(line([-0.275, -0.72, 0.88], [-0.275, 0.72, 0.88], { stroke: shade(P.teal, 0.8), 'stroke-width': 0.012, 'stroke-opacity': 0.5 }));
  return g;
}

function plant(): SVGGElement {
  const g = el('g');
  g.appendChild(cylinder(0, 0, 0, 0.18, 0.26, { side: shade(P.terracotta, 0.82), top: P.terracotta }));
  g.appendChild(isoEllipse(0, 0, 0.26, 0.15, { fill: P.walnutDeep }));
  const leaf = (rot: number, s: number, col: string) =>
    el('path', {
      d: 'M 0 0 C 0.05 -0.09 0.11 -0.28 0.04 -0.52 C 0.02 -0.58 -0.04 -0.58 -0.05 -0.51 C -0.09 -0.29 -0.04 -0.1 0 0 Z',
      fill: col,
      transform: `translate(0 -0.26) rotate(${rot}) scale(${s})`,
    });
  const leaves: [number, number, string][] = [
    [-62, 1.0, P.leaf], [-30, 1.15, P.leafDark], [-8, 0.95, P.leaf],
    [14, 1.2, P.leafDark], [38, 1.0, P.leaf], [62, 0.85, P.leafDark], [-88, 0.7, P.leaf],
  ];
  for (const [rot, s, col] of leaves) g.appendChild(leaf(rot, s, col));
  return g;
}

function bench(): SVGGElement {
  const g = el('g');
  const leg = (x: number, y: number) => box(x, y, 0, x + 0.07, y + 0.07, 0.4, { top: P.walnut, right: P.walnutDark, left: P.walnutDeep });
  g.appendChild(leg(-0.22, -0.47));
  g.appendChild(leg(0.15, -0.47));
  g.appendChild(leg(-0.22, 0.4));
  g.appendChild(leg(0.15, 0.4));
  g.appendChild(box(-0.24, -0.51, 0.3, 0.24, 0.51, 0.4, { top: P.walnut, right: shade(P.walnut, 0.9), left: P.walnutDeep }));
  g.appendChild(box(-0.28, -0.55, 0.4, 0.28, 0.55, 0.5, { top: P.walnutLight, right: P.walnut, left: shade(P.walnut, 0.82) }));
  return g;
}

function linenShelf(): SVGGElement {
  const g = el('g');
  // back panel
  g.appendChild(box(-0.55, -0.3, 0, -0.48, 0.3, 1.5, { top: P.walnutDark, right: P.linen, left: P.walnutDark }));
  // left side
  g.appendChild(box(-0.55, -0.3, 0, 0.55, -0.23, 1.56, { top: P.walnutLight, right: P.walnut, left: shade(P.walnut, 0.85) }));
  // bottom
  g.appendChild(box(-0.48, -0.23, 0, 0.48, 0.3, 0.08, { top: P.walnutLight, right: shade(P.walnut, 0.9), left: P.walnutDark }));
  // towel board + upper board
  g.appendChild(box(-0.48, -0.23, 0.86, 0.48, 0.3, 0.91, { top: P.walnutLight, right: shade(P.walnut, 0.9), left: P.walnutDark }));
  g.appendChild(box(-0.48, -0.23, 1.28, 0.48, 0.3, 1.33, { top: P.walnutLight, right: shade(P.walnut, 0.9), left: P.walnutDark }));
  // right side
  g.appendChild(box(-0.55, 0.23, 0, 0.55, 0.3, 1.56, { top: P.walnutLight, right: P.walnut, left: shade(P.walnut, 0.85) }));
  // top slab
  g.appendChild(box(-0.55, -0.3, 1.56, 0.55, 0.3, 1.62, { top: P.walnutLight, right: P.walnut, left: shade(P.walnut, 0.85) }));
  // decorative folded linens on the upper board
  g.appendChild(box(-0.36, -0.12, 1.33, -0.06, 0.16, 1.39, { top: P.cream, right: shade(P.cream, 0.85), left: shade(P.cream, 0.7) }));
  g.appendChild(box(-0.34, -0.1, 1.39, -0.08, 0.14, 1.44, { top: P.sand, right: shade(P.sand, 0.85), left: shade(P.sand, 0.7) }));
  // woven basket
  const basket = cylinder(0.26, 0.04, 1.33, 0.12, 0.16, { side: P.mustardDark, top: shade(P.mustardDark, 1.12) });
  g.appendChild(basket);
  g.appendChild(line([0.15, 0.04, 1.41], [0.37, 0.04, 1.41], { stroke: shade(P.mustardDark, 0.7), 'stroke-width': 0.015 }));
  g.appendChild(line([0.15, 0.04, 1.45], [0.37, 0.04, 1.45], { stroke: shade(P.mustardDark, 0.7), 'stroke-width': 0.015 }));
  return g;
}

function artFrame(): SVGGElement {
  const g = el('g');
  g.appendChild(box(-0.3, -0.02, 1.32, 0.3, 0.06, 1.96, { top: P.walnut, right: P.walnutDark, left: shade(P.walnut, 0.8) }));
  g.appendChild(poly([[-0.24, 0.065, 1.38], [0.24, 0.065, 1.38], [0.24, 0.065, 1.9], [-0.24, 0.065, 1.9]], { fill: P.cream, stroke: 'none' }));
  g.appendChild(circleOnWallY(-0.05, 0.07, 1.62, 0.13, { fill: P.terracotta, 'fill-opacity': 0.9 }));
  g.appendChild(circleOnWallY(0.11, 0.07, 1.76, 0.05, { fill: P.teal }));
  g.appendChild(el('path', {
    d: `M ${sp(ip(-0.16, 0.07, 1.5))} Q ${sp(ip(0, 0.07, 1.44))} ${sp(ip(0.14, 0.07, 1.52))}`,
    fill: 'none', stroke: P.mustard, 'stroke-width': 0.02, 'stroke-linecap': 'round',
  }));
  return g;
}

function mugRack(): SVGGElement {
  const g = el('g');
  // soft grounding shadow on the wall under the board
  g.appendChild(poly([[-0.92, 0.012, 1.24], [0.92, 0.012, 1.24], [0.92, 0.012, 1.34], [-0.92, 0.012, 1.34]], { fill: 'rgba(61,47,36,0.18)', stroke: 'none', filter: 'url(#softBlur)' }));
  // wall brackets
  g.appendChild(box(-0.84, 0, 1.24, -0.72, 0.16, 1.38, { top: P.walnutDark, right: shade(P.walnutDark, 0.9), left: P.walnutDeep }));
  g.appendChild(box(0.72, 0, 1.24, 0.84, 0.16, 1.38, { top: P.walnutDark, right: shade(P.walnutDark, 0.9), left: P.walnutDeep }));
  // chunky board (its light top face must stay visible against the wall)
  g.appendChild(box(-0.95, -0.08, 1.32, 0.95, 0.24, 1.46, { top: P.walnutLight, right: P.walnut, left: shade(P.walnut, 0.8) }));
  // three hook pegs on the board's front face
  for (const hx of [-0.6, 0, 0.6]) {
    g.appendChild(poly([[hx - 0.035, 0.245, 1.35], [hx + 0.035, 0.245, 1.35], [hx + 0.035, 0.245, 1.43], [hx - 0.035, 0.245, 1.43]], { fill: P.walnutDeep, stroke: 'none' }));
    g.appendChild(poly([[hx - 0.035, 0.245, 1.43], [hx + 0.035, 0.245, 1.43], [hx + 0.035, 0.32, 1.4], [hx - 0.035, 0.32, 1.4]], { fill: P.walnutDeep, stroke: 'none' }));
  }
  return g;
}

function kitchenCounter(): SVGGElement {
  const g = el('g');
  // backsplash
  g.appendChild(poly([[-1.5, -0.335, 0.96], [1.5, -0.335, 0.96], [1.5, -0.335, 1.24], [-1.5, -0.335, 1.24]], { fill: P.sand, stroke: EDGE_SOFT, 'stroke-width': 0.012 }));
  // cabinet
  g.appendChild(box(-1.5, -0.34, 0, 1.5, 0.34, 0.88, { top: P.walnut, right: shade(P.walnut, 0.9), left: shade(P.walnut, 0.78) }));
  // drawer fronts on the +y face
  const drawers: [number, number][] = [[-1.36, -0.5], [-0.4, 0.46], [0.56, 1.36]];
  for (const [x0, x1] of drawers) {
    g.appendChild(poly([[x0, 0.345, 0.16], [x1, 0.345, 0.16], [x1, 0.345, 0.76], [x0, 0.345, 0.76]], { fill: shade(P.walnut, 1.08), stroke: P.walnutDeep, 'stroke-width': 0.014 }));
    g.appendChild(circleOnWallY((x0 + x1) / 2, 0.355, 0.66, 0.032, { fill: P.walnutDeep }));
  }
  // countertop
  g.appendChild(box(-1.54, -0.36, 0.88, 1.54, 0.38, 0.96, { top: P.cream, right: shade(P.cream, 0.85), left: shade(P.cream, 0.7) }));
  // cutting board
  g.appendChild(box(-1.3, -0.2, 0.96, -0.66, 0.2, 1.0, { top: shade(P.walnutLight, 1.1), right: P.walnut, left: shade(P.walnut, 0.8) }));
  // little kettle
  g.appendChild(cylinder(0.95, 0, 0.96, 0.13, 0.18, { side: P.terracotta, top: shade(P.terracotta, 1.1) }));
  g.appendChild(el('path', {
    d: `M ${sp(ip(1.06, 0, 1.1))} q ${fmt(0.09 * C)} ${fmt(0.09 * S)} ${fmt(0.16 * C)} ${fmt(0.16 * S)}`,
    fill: 'none', stroke: P.terracottaDark, 'stroke-width': 0.03, 'stroke-linecap': 'round',
  }));
  g.appendChild(isoEllipse(0.95, 0, 1.16, 0.05, { fill: P.terracottaDark }));
  return g;
}

function stool(): SVGGElement {
  const g = el('g');
  const leg = (dx: number, dy: number) => box(dx - 0.02, dy - 0.02, 0, dx + 0.02, dy + 0.02, 0.42, { top: P.walnut, right: P.walnutDark, left: P.walnutDeep });
  g.appendChild(leg(0.12, 0.07));
  g.appendChild(leg(-0.13, 0.06));
  g.appendChild(leg(0.0, -0.14));
  g.appendChild(isoEllipse(0, 0, 0.2, 0.14, { fill: 'none', stroke: P.walnutDark, 'stroke-width': 0.02 }));
  g.appendChild(cylinder(0, 0, 0.42, 0.2, 0.07, { side: P.walnut, top: P.walnutLight }));
  return g;
}

function spillBox(): SVGGElement {
  const g = el('g', { transform: 'rotate(-9)' });
  // box interior + floor
  g.appendChild(box(-0.34, -0.26, 0.04, -0.28, 0.22, 0.44, { top: P.kraftDark, right: shade(P.kraftDark, 0.85), left: P.kraftDark }));
  g.appendChild(box(-0.34, -0.26, 0.04, 0.26, 0.22, 0.1, { top: shade(P.kraftDark, 0.9), right: P.kraftDark, left: P.kraftDark }));
  // walls
  g.appendChild(box(-0.34, -0.26, 0.04, 0.26, -0.2, 0.44, { top: P.kraft, right: P.kraft, left: shade(P.kraft, 0.8) }));
  g.appendChild(box(-0.34, 0.16, 0.04, 0.26, 0.22, 0.46, { top: P.kraft, right: P.kraft, left: shade(P.kraft, 0.8) }));
  // open flaps
  g.appendChild(poly([[-0.32, 0.17, 0.46], [0.24, 0.17, 0.46], [0.3, 0.34, 0.3], [-0.38, 0.34, 0.3]], { fill: shade(P.kraft, 0.94), stroke: EDGE_SOFT, 'stroke-width': 0.012 }));
  g.appendChild(poly([[0.25, -0.24, 0.44], [0.25, 0.2, 0.44], [0.4, 0.26, 0.3], [0.4, -0.3, 0.3]], { fill: shade(P.kraft, 0.7), stroke: EDGE_SOFT, 'stroke-width': 0.012 }));
  g.appendChild(poly([[-0.32, -0.25, 0.46], [0.24, -0.25, 0.46], [0.16, -0.42, 0.34], [-0.36, -0.42, 0.34]], { fill: shade(P.kraft, 0.88), stroke: EDGE_SOFT, 'stroke-width': 0.012 }));
  // packing tape stripe
  g.appendChild(poly([[0.261, -0.24, 0.1], [0.261, 0.2, 0.1], [0.261, 0.2, 0.4], [0.261, -0.24, 0.4]], { fill: shade(P.sand, 1.05), 'fill-opacity': 0.85, stroke: 'none' }));
  // crumpled paper left inside
  const blob: P3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = 0.09 + (i % 2) * 0.02;
    blob.push([Math.cos(a) * r, Math.sin(a) * r * 0.8, 0.12]);
  }
  g.appendChild(poly(blob, { fill: P.cream, stroke: EDGE_SOFT, 'stroke-width': 0.012 }));
  return g;
}

function windowLeft(): SVGGElement {
  const g = el('g');
  // sunlight pool on the floor (drawn first, under the frame)
  g.appendChild(poly([
    [0.1, -0.46, 0], [0.1, 0.44, 0], [2.45, 1.18, 0], [2.45, 0.12, 0],
  ], { fill: 'url(#gradPool)', stroke: 'none', filter: 'url(#softBlur)' }));
  // recess with warm sky
  g.appendChild(poly([
    [0.015, -0.38, 1.12], [0.015, 0.38, 1.12], [0.015, 0.38, 2.18], [0.015, -0.38, 2.18],
  ], { fill: 'url(#gradWindow)', stroke: shade(P.walnutDeep, 0.9), 'stroke-width': 0.014 }));
  // mullions
  g.appendChild(box(0.015, -0.018, 1.12, 0.05, 0.018, 2.18, { top: P.cream, right: P.cream, left: shade(P.cream, 0.8) }));
  g.appendChild(box(0.015, -0.38, 1.61, 0.05, 0.38, 1.66, { top: P.cream, right: P.cream, left: shade(P.cream, 0.8) }));
  // frame
  g.appendChild(box(0, -0.45, 1.05, 0.08, -0.37, 2.25, { top: P.cream, right: shade(P.cream, 0.9), left: shade(P.cream, 0.8) }));
  g.appendChild(box(0, 0.37, 1.05, 0.08, 0.45, 2.25, { top: P.cream, right: shade(P.cream, 0.9), left: shade(P.cream, 0.8) }));
  g.appendChild(box(0, -0.45, 2.17, 0.08, 0.45, 2.25, { top: P.cream, right: shade(P.cream, 0.9), left: shade(P.cream, 0.8) }));
  g.appendChild(box(0, -0.45, 1.05, 0.08, 0.45, 1.13, { top: P.cream, right: shade(P.cream, 0.9), left: shade(P.cream, 0.8) }));
  // sill
  g.appendChild(box(0, -0.48, 1.0, 0.18, 0.48, 1.08, { top: P.walnutLight, right: P.walnut, left: shade(P.walnut, 0.8) }));
  return g;
}

// ---------------------------------------------------------------------------
// Movable items
// ---------------------------------------------------------------------------

export type Orientation = 'flat' | 'upright';
export type ItemAssetBuilder = (variant: number, orientation: Orientation) => SVGGElement;

const BOOK_VARIANTS: { cover: string; h: number; t: number }[] = [
  { cover: P.teal, h: 0.34, t: 0.05 },
  { cover: P.terracotta, h: 0.3, t: 0.06 },
  { cover: P.mustard, h: 0.36, t: 0.045 },
];

function book(variant: number, orientation: Orientation): SVGGElement {
  const v = BOOK_VARIANTS[variant % BOOK_VARIANTS.length];
  const g = el('g');
  if (orientation === 'upright') {
    const b = box(-0.1, -v.t / 2, 0, 0.1, v.t / 2, v.h, { top: P.cream, right: v.cover, left: shade(v.cover, 0.88) });
    b.appendChild(poly([[0.101, -v.t / 2 + 0.008, v.h * 0.3], [0.101, v.t / 2 - 0.008, v.h * 0.3], [0.101, v.t / 2 - 0.008, v.h * 0.48], [0.101, -v.t / 2 + 0.008, v.h * 0.48]], { fill: P.cream, 'fill-opacity': 0.92, stroke: 'none' }));
    g.appendChild(b);
  } else {
    const b = box(-0.1, -0.16, 0, 0.1, 0.16, 0.05, { top: v.cover, right: shade(v.cover, 0.72), left: P.cream });
    b.appendChild(poly([[-0.085, -0.14, 0.0505], [0.085, -0.14, 0.0505], [0.085, 0.14, 0.0505], [-0.085, 0.14, 0.0505]], { fill: 'none', stroke: shade(v.cover, 0.85), 'stroke-width': 0.012 }));
    g.appendChild(b);
  }
  return g;
}

const MUG_VARIANTS: { side: string; top: string }[] = [
  { side: shade(P.cream, 0.94), top: P.cream },
  { side: P.teal, top: shade(P.teal, 1.14) },
  { side: P.terracotta, top: shade(P.terracotta, 1.12) },
];

function mug(variant: number): SVGGElement {
  const v = MUG_VARIANTS[variant % MUG_VARIANTS.length];
  const r = 0.105;
  const h = 0.2;
  const rx = r * RX;
  const ry = r * RY;
  const g = el('g');
  // handle (toward the viewer)
  g.appendChild(el('circle', { cx: 0, cy: fmt(-h * 0.52 + ry * 0.9), r: 0.062, fill: 'none', stroke: shade(v.side, 0.85), 'stroke-width': 0.03 }));
  // body
  g.appendChild(el('path', {
    d: `M ${fmt(-rx)} ${fmt(-h)} L ${fmt(-rx)} 0 A ${fmt(rx)} ${fmt(ry)} 0 0 0 ${fmt(rx)} 0 L ${fmt(rx)} ${fmt(-h)} Z`,
    fill: v.side, stroke: EDGE, 'stroke-width': 0.01,
  }));
  // rim + inside
  g.appendChild(el('ellipse', { cx: 0, cy: fmt(-h), rx: fmt(rx), ry: fmt(ry), fill: v.top, stroke: EDGE, 'stroke-width': 0.01 }));
  g.appendChild(el('ellipse', { cx: 0, cy: fmt(-h), rx: fmt(rx * 0.78), ry: fmt(ry * 0.78), fill: P.walnutDeep }));
  return g;
}

const CUSHION_VARIANTS: { cover: string }[] = [{ cover: P.terracotta }, { cover: P.mustard }];

function cushion(variant: number): SVGGElement {
  const cover = CUSHION_VARIANTS[variant % CUSHION_VARIANTS.length].cover;
  const g = el('g');
  g.appendChild(roundedIsoRect(-0.215, 0.215, -0.215, 0.215, 0.02, 0.1, { fill: shade(cover, 0.68), stroke: 'none' }));
  g.appendChild(roundedIsoRect(-0.21, 0.21, -0.21, 0.21, 0.09, 0.1, { fill: cover, stroke: 'none' }));
  g.appendChild(roundedIsoRect(-0.205, 0.205, -0.205, 0.205, 0.155, 0.1, { fill: shade(cover, 1.12), stroke: 'none' }));
  g.appendChild(roundedIsoRect(-0.205, 0.205, -0.205, 0.205, 0.156, 0.1, { fill: 'none', stroke: P.cream, 'stroke-width': 0.015, 'stroke-opacity': 0.85 }));
  g.appendChild(poly([[0, -0.025, 0.16], [0.025, 0, 0.16], [0, 0.025, 0.16], [-0.025, 0, 0.16]], { fill: shade(cover, 0.82), stroke: 'none' }));
  return g;
}

const SHOE_VARIANTS: { cover: string; sole: string; mirror: boolean; laces: boolean }[] = [
  { cover: P.tealDark, sole: P.cream, mirror: false, laces: true },
  { cover: shade(P.walnut, 1.1), sole: P.walnutDeep, mirror: true, laces: false },
];

function shoeProfile(col: { cover: string; sole: string; laces: boolean }): SVGGElement {
  const g = el('g');
  g.appendChild(el('path', {
    d: 'M -0.165 0.055 Q -0.168 0.008 -0.12 0.006 L 0.125 0.006 Q 0.168 0.01 0.168 0.032 L 0.168 0.055 Z',
    fill: col.sole, stroke: EDGE, 'stroke-width': 0.01,
  }));
  g.appendChild(el('path', {
    d: 'M -0.15 0.055 Q -0.172 0.14 -0.152 0.19 Q -0.095 0.205 -0.055 0.175 Q -0.015 0.158 0.02 0.13 Q 0.07 0.105 0.118 0.095 Q 0.158 0.09 0.162 0.055 Z',
    fill: col.cover, stroke: EDGE, 'stroke-width': 0.01,
  }));
  g.appendChild(el('path', {
    d: 'M 0.095 0.098 Q 0.15 0.088 0.162 0.055 L 0.1 0.055 Z',
    fill: col.sole, 'fill-opacity': 0.9,
  }));
  g.appendChild(el('ellipse', { cx: -0.1, cy: 0.178, rx: 0.05, ry: 0.018, fill: shade(col.cover, 0.7) }));
  if (col.laces) {
    g.appendChild(el('path', { d: 'M 0.0 0.142 L 0.045 0.104 M 0.035 0.155 L 0.08 0.117', stroke: P.cream, 'stroke-width': 0.014, 'stroke-linecap': 'round', fill: 'none' }));
  } else {
    g.appendChild(el('path', { d: 'M -0.02 0.16 Q 0.02 0.128 0.06 0.118', stroke: shade(col.cover, 0.72), 'stroke-width': 0.018, fill: 'none', 'stroke-linecap': 'round' }));
  }
  return g;
}

function shoe(variant: number): SVGGElement {
  const v = SHOE_VARIANTS[variant % SHOE_VARIANTS.length];
  const shear = `matrix(${C} ${S} 0 -1 0 0)`;
  const inner = el('g', { transform: v.mirror ? 'scale(-1 1)' : undefined });
  inner.appendChild(shoeProfile(v));
  const front = el('g', { transform: shear }, [inner]);
  const backInner = el('g', { transform: v.mirror ? 'scale(-1 1)' : undefined });
  backInner.appendChild(shoeProfile({ cover: shade(v.cover, 0.7), sole: shade(v.sole, 0.7), laces: v.laces }));
  const back = el('g', { transform: `translate(${fmt(-0.11 * C)} ${fmt(0.11 * S)}) ${shear}` }, [backInner]);
  return el('g', {}, [back, front]);
}

const TOWEL_VARIANTS: { body: string; stripe: string }[] = [
  { body: P.cream, stripe: P.teal },
  { body: P.terracotta, stripe: P.cream },
];

function towel(variant: number): SVGGElement {
  const v = TOWEL_VARIANTS[variant % TOWEL_VARIANTS.length];
  const g = el('g');
  g.appendChild(roundedIsoRect(-0.18, 0.18, -0.14, 0.14, 0.002, 0.045, { fill: shade(v.body, 0.7), stroke: 'none' }));
  g.appendChild(roundedIsoRect(-0.18, 0.18, -0.14, 0.14, 0.045, 0.045, { fill: v.body, stroke: 'none' }));
  g.appendChild(roundedIsoRect(-0.18, 0.18, -0.035, 0.035, 0.047, 0.02, { fill: v.stripe, 'fill-opacity': 0.85, stroke: 'none' }));
  g.appendChild(roundedIsoRect(-0.165, 0.165, -0.125, 0.125, 0.088, 0.045, { fill: shade(v.body, 0.93), stroke: EDGE_SOFT, 'stroke-width': 0.01 }));
  g.appendChild(roundedIsoRect(-0.165, 0.165, -0.03, 0.03, 0.09, 0.02, { fill: v.stripe, 'fill-opacity': 0.85, stroke: 'none' }));
  return g;
}

// ---------------------------------------------------------------------------
// Ghost previews for destination slots
// ---------------------------------------------------------------------------

const GHOST_ATTRS: Attrs = {
  fill: 'rgba(46, 122, 114, 0.14)',
  stroke: P.ghost,
  'stroke-width': 0.04,
  'stroke-linejoin': 'round',
};

export const ghostShape: Record<CategoryId, () => SVGElement> = {
  book: () => roundedIsoRect(-0.14, 0.14, -0.07, 0.07, 0, 0.025, GHOST_ATTRS),
  mug: () => isoEllipse(0, 0, 0, 0.135, GHOST_ATTRS),
  cushion: () => roundedIsoRect(-0.225, 0.225, -0.225, 0.225, 0, 0.1, GHOST_ATTRS),
  shoe: () => roundedIsoRect(-0.18, 0.18, -0.09, 0.09, 0, 0.03, GHOST_ATTRS),
  towel: () => roundedIsoRect(-0.19, 0.19, -0.145, 0.145, 0, 0.045, GHOST_ATTRS),
};

/** Soft contact-shadow radius (world units) per asset. */
export const furnitureShadowRx: Record<string, number> = {
  bookshelf: 0.72, sofa: 0.95, plant: 0.26, bench: 0.5, linenShelf: 0.62,
  artFrame: 0, mugRack: 0, kitchenCounter: 1.5, stool: 0.24, spillBox: 0.42,
  windowLeft: 0, rug: 0, entryMat: 0,
};

export const itemShadowRx: Record<string, number> = {
  book: 0.17, mug: 0.13, cushion: 0.27, shoe: 0.21, towel: 0.24,
};

export const furnitureAssets: Record<string, () => SVGGElement> = {
  rug, entryMat, bookshelf, sofa, plant, bench, linenShelf, artFrame,
  mugRack, kitchenCounter, stool, spillBox, windowLeft,
};

export const itemAssets: Record<string, ItemAssetBuilder> = {
  book, mug, cushion, shoe, towel,
};
