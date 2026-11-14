/** Minimal SVG DOM helpers shared by the asset catalog and the scene builder. */

export const SVG_NS = 'http://www.w3.org/2000/svg';

export type Attrs = Record<string, string | number | undefined>;

export function el<T extends SVGElement = SVGGElement>(
  tag: string,
  attrs?: Attrs,
  children?: (Node | null | undefined)[],
): T {
  const node = document.createElementNS(SVG_NS, tag) as T;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined) node.setAttribute(k, String(v));
    }
  }
  if (children) {
    for (const c of children) if (c) node.appendChild(c);
  }
  return node;
}

/** Round to 3 decimals so path/polygon strings stay compact. */
export function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** Darken (#rrggbb) by a factor — 0.8 = 20% darker. */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (n >> 16) & 255;
  const cg = (n >> 8) & 255;
  const cb = n & 255;
  const d = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `#${((d(ch) << 16) | (d(cg) << 8) | d(cb)).toString(16).padStart(6, '0')}`;
}
