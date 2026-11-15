/**
 * Scene builder: turns the level data into the layered SVG room.
 * All geometry goes through the shared projector so floor, walls, furniture,
 * item anchors and slot ghosts agree.
 */
import type { LevelDef } from '../game/types';
import { createProjector, type Projector } from './projection';
import { palette as P } from './palette';
import { el, fmt } from './svg';
import { furnitureAssets, furnitureShadowRx, ghostShape } from './assets';

export interface SceneLayers {
  decals: SVGGElement;
  /** Merged, depth-sorted paint list: furniture nodes + resting items (C-6). */
  props: SVGGElement;
  ghosts: SVGGElement;
  labels: SVGGElement;
  /** Ephemeral feedback (tier-completion animation, CC-008). */
  fx: SVGGElement;
  /** Topmost layer for the currently dragged item. */
  drag: SVGGElement;
}

export interface PaintEntry {
  node: SVGGElement;
  /** Painter's-algorithm key (larger = nearer). */
  key: number;
}

export interface Scene {
  svg: SVGSVGElement;
  projector: Projector;
  layers: SceneLayers;
  /** Static furniture paint entries, pre-sorted; the view merges items into
   *  this list with support-relative keys on every re-render (C-6). */
  furniturePaint: PaintEntry[];
  ghostBySlot: Map<string, SVGGElement>;
  /** Per-surface drag ghosts keyed by surface id (CC-005), incl. 'floor'. */
  ghostBySurface: Map<string, SVGGElement>;
  labelByCategory: Map<string, SVGGElement>;
}

function defs(): SVGDefsElement {
  const d = el<SVGDefsElement>('defs');

  const wallL = el('linearGradient', { id: 'gradWallL', x1: 0, y1: 0, x2: 1, y2: 0 });
  wallL.appendChild(el('stop', { offset: 0, 'stop-color': P.wallLit }));
  wallL.appendChild(el('stop', { offset: 1, 'stop-color': P.wallShade }));

  const wallR = el('linearGradient', { id: 'gradWallR', x1: 0, y1: 0, x2: 1, y2: 0 });
  wallR.appendChild(el('stop', { offset: 0, 'stop-color': '#e4d2b1' }));
  wallR.appendChild(el('stop', { offset: 1, 'stop-color': '#f3e8d2' }));

  const vignette = el('radialGradient', { id: 'gradVignette', cx: 0.5, cy: 0.55, r: 0.72 });
  vignette.appendChild(el('stop', { offset: 0, 'stop-color': 'rgba(61,47,36,0)' }));
  vignette.appendChild(el('stop', { offset: 0.72, 'stop-color': 'rgba(61,47,36,0.05)' }));
  vignette.appendChild(el('stop', { offset: 1, 'stop-color': 'rgba(61,47,36,0.24)' }));

  const shadow = el('radialGradient', { id: 'gradShadow' });
  shadow.appendChild(el('stop', { offset: 0, 'stop-color': 'rgba(56,42,30,0.36)' }));
  shadow.appendChild(el('stop', { offset: 0.6, 'stop-color': 'rgba(56,42,30,0.18)' }));
  shadow.appendChild(el('stop', { offset: 1, 'stop-color': 'rgba(56,42,30,0)' }));

  const win = el('linearGradient', { id: 'gradWindow', x1: 0, y1: 0, x2: 0, y2: 1 });
  win.appendChild(el('stop', { offset: 0, 'stop-color': P.windowSky }));
  win.appendChild(el('stop', { offset: 1, 'stop-color': P.windowSkyDeep }));

  const pool = el('linearGradient', { id: 'gradPool', x1: 0, y1: 0, x2: 1, y2: 0 });
  pool.appendChild(el('stop', { offset: 0, 'stop-color': P.lightPool, 'stop-opacity': 0.85 }));
  pool.appendChild(el('stop', { offset: 1, 'stop-color': P.lightPool, 'stop-opacity': 0 }));

  const blur = el('filter', { id: 'softBlur', x: '-20%', y: '-20%', width: '140%', height: '140%' });
  blur.appendChild(el('feGaussianBlur', { stdDeviation: 0.12 }));

  d.append(wallL, wallR, vignette, shadow, win, pool, blur);
  return d;
}

function buildRoom(level: LevelDef, pj: Projector): SVGGElement {
  const { width: W, depth: D, wallHeight: H } = level.room;
  const g = el('g', { class: 'layer-room' });

  // floor slab
  g.appendChild(el('polygon', {
    points: [[0, 0], [W, 0], [W, D], [0, D]].map(([x, y]) => { const p = pj.toScreen(x, y, 0); return `${fmt(p.x)},${fmt(p.y)}`; }).join(','),
    fill: P.floorBase,
  }));

  // quiet plank lines running along x
  const planks = el('g', { stroke: P.floorLine, 'stroke-width': 0.018, 'stroke-opacity': 0.5 });
  for (let j = 1; j < D; j++) {
    const a = pj.toScreen(0, j, 0.001);
    const b = pj.toScreen(W, j, 0.001);
    planks.appendChild(el('line', { x1: fmt(a.x), y1: fmt(a.y), x2: fmt(b.x), y2: fmt(b.y) }));
    // staggered butt joints
    for (const k of [1 + ((j * 3.7) % (W - 2)), 1 + ((j * 7.3) % (W - 2))]) {
      const c = pj.toScreen(k, j, 0.001);
      const d2 = pj.toScreen(k, j + 1, 0.001);
      planks.appendChild(el('line', { x1: fmt(c.x), y1: fmt(c.y), x2: fmt(d2.x), y2: fmt(d2.y), 'stroke-opacity': 0.35 }));
    }
  }
  g.appendChild(planks);
  g.appendChild(el('polygon', {
    points: [[0, 0], [W, 0], [W, D], [0, D]].map(([x, y]) => { const p = pj.toScreen(x, y, 0); return `${fmt(p.x)},${fmt(p.y)}`; }).join(','),
    fill: 'url(#gradVignette)',
  }));

  // rear walls
  const wallL = el('polygon', {
    points: [[0, 0, 0], [0, D, 0], [0, D, H], [0, 0, H]].map((p) => { const s = pj.toScreen(p[0], p[1], p[2]); return `${fmt(s.x)},${fmt(s.y)}`; }).join(','),
    fill: 'url(#gradWallL)',
  });
  const wallR = el('polygon', {
    points: [[0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H]].map((p) => { const s = pj.toScreen(p[0], p[1], p[2]); return `${fmt(s.x)},${fmt(s.y)}`; }).join(','),
    fill: 'url(#gradWallR)',
  });
  g.append(wallL, wallR);

  // baseboards
  g.appendChild(el('polygon', {
    points: [[0, 0, 0], [0, D, 0], [0, D, 0.14], [0, 0, 0.14]].map((p) => { const s = pj.toScreen(p[0], p[1], p[2]); return `${fmt(s.x)},${fmt(s.y)}`; }).join(','),
    fill: P.baseboard,
  }));
  g.appendChild(el('polygon', {
    points: [[0, 0, 0], [W, 0, 0], [W, 0, 0.14], [0, 0, 0.14]].map((p) => { const s = pj.toScreen(p[0], p[1], p[2]); return `${fmt(s.x)},${fmt(s.y)}`; }).join(','),
    fill: P.baseboard,
  }));

  // cutaway front edges of the floor slab
  g.appendChild(el('polygon', {
    points: [[W, 0, 0], [W, D, 0], [W, D, -0.16], [W, 0, -0.16]].map((p) => { const s = pj.toScreen(p[0], p[1], p[2]); return `${fmt(s.x)},${fmt(s.y)}`; }).join(','),
    fill: P.floorEdge,
  }));
  g.appendChild(el('polygon', {
    points: [[0, D, 0], [W, D, 0], [W, D, -0.16], [0, D, -0.16]].map((p) => { const s = pj.toScreen(p[0], p[1], p[2]); return `${fmt(s.x)},${fmt(s.y)}`; }).join(','),
    fill: '#7c5d42',
  }));

  // crisp cutaway edges
  const edges = el('g', { stroke: P.walnutDeep, 'stroke-opacity': 0.35, 'stroke-width': 0.025, 'stroke-linecap': 'round' });
  const e = (a: [number, number, number], b: [number, number, number]) => {
    const s1 = pj.toScreen(a[0], a[1], a[2]);
    const s2 = pj.toScreen(b[0], b[1], b[2]);
    edges.appendChild(el('line', { x1: fmt(s1.x), y1: fmt(s1.y), x2: fmt(s2.x), y2: fmt(s2.y) }));
  };
  e([0, 0, H], [0, D, H]);
  e([0, 0, H], [W, 0, H]);
  e([0, D, 0], [0, D, H]);
  e([W, 0, 0], [W, 0, H]);
  e([0, 0, 0], [0, 0, H]);
  g.appendChild(edges);
  return g;
}

function contactShadow(rxWorld: number): SVGEllipseElement {
  return el('ellipse', {
    cx: 0, cy: 0,
    rx: fmt(rxWorld * 1.2247),
    ry: fmt(rxWorld * 1.2247 * 0.42),
    fill: 'url(#gradShadow)',
  });
}

export function buildScene(level: LevelDef): Scene {
  const projector = createProjector(level.room);
  const vb = projector.viewBox;
  const svg = el<SVGSVGElement>('svg', {
    viewBox: `${fmt(vb.minX)} ${fmt(vb.minY)} ${fmt(vb.width)} ${fmt(vb.height)}`,
    preserveAspectRatio: 'xMidYMid meet',
    class: 'scene',
    role: 'application',
    'aria-label': level.name,
  });
  svg.appendChild(defs());
  svg.appendChild(buildRoom(level, projector));

  const decals = el('g', { class: 'layer-decals' });
  const props = el('g', { class: 'layer-props' });

  for (const f of level.furniture.filter((f) => f.flat)) {
    const builder = furnitureAssets[f.asset];
    if (!builder) continue;
    const p = projector.toScreen(f.anchor.x, f.anchor.y, f.anchor.z);
    const g = el('g', { class: 'furniture', transform: `translate(${fmt(p.x)} ${fmt(p.y)})`, 'data-furniture': f.id });
    g.appendChild(builder());
    decals.appendChild(g);
  }

  const furniturePaint: PaintEntry[] = [];
  const sorted = level.furniture
    .filter((f) => !f.flat)
    .map((f) => ({ f, key: projector.depth(f.anchor.x, f.anchor.y) + (f.sortBias ?? 0) }))
    .sort((a, b) => a.key - b.key);
  for (const { f, key } of sorted) {
    const builder = furnitureAssets[f.asset];
    if (!builder) continue;
    const p = projector.toScreen(f.anchor.x, f.anchor.y, f.anchor.z);
    const built = builder();
    // A builder may split into paint parts (e.g. the bookshelf's near side
    // panel must paint AFTER books standing on its tiers — C-6): each part
    // gets its own depth key from its `data-paint-offset` anchor shift.
    const parts = Array.from(built.querySelectorAll(':scope > [data-paint-part]')) as SVGGElement[];
    const entries: SVGGElement[] = parts.length ? parts : [built];
    for (const partNode of entries) {
      const g = el('g', { class: 'furniture', transform: `translate(${fmt(p.x)} ${fmt(p.y)})`, 'data-furniture': f.id });
      const shadowRx = furnitureShadowRx[f.asset] ?? 0;
      if (shadowRx > 0 && partNode === entries[0]) g.appendChild(contactShadow(shadowRx));
      g.appendChild(partNode);
      let partKey = key;
      const off = partNode.getAttribute('data-paint-offset');
      if (off) {
        const [dx, dy] = off.split(',').map(Number);
        partKey = projector.depth(f.anchor.x + dx, f.anchor.y + dy) + (f.sortBias ?? 0);
      }
      furniturePaint.push({ node: g, key: partKey });
    }
  }
  furniturePaint.sort((a, b) => a.key - b.key);
  for (const e of furniturePaint) props.appendChild(e.node);

  const ghosts = el('g', { class: 'layer-ghosts' });
  const ghostBySlot = new Map<string, SVGGElement>();
  for (const zone of level.zones) {
    for (const slot of zone.slots) {
      const p = projector.toScreen(slot.anchor.x, slot.anchor.y, slot.anchor.z);
      const g = el('g', { class: 'ghost', transform: `translate(${fmt(p.x)} ${fmt(p.y)})`, 'data-slot': slot.id });
      g.appendChild(ghostShape[zone.category]());
      ghosts.appendChild(g);
      ghostBySlot.set(slot.id, g);
    }
  }

  // one reusable ghost group per registered surface (CC-005): the shape is
  // redrawn to the dragged item's current-orientation footprint on each move
  const ghostBySurface = new Map<string, SVGGElement>();
  for (const s of level.surfaces ?? []) {
    const g = el('g', { class: 'surface-ghost', 'data-surface-ghost': s.id });
    g.appendChild(el('path', { class: 'surface-ghost-shape', d: '', fill: 'none', stroke: 'none' }));
    g.appendChild(el('line', { class: 'surface-ghost-strike', x1: 0, y1: 0, x2: 0, y2: 0, stroke: 'none' }));
    ghosts.appendChild(g);
    ghostBySurface.set(s.id, g);
  }

  const labels = el('g', { class: 'layer-labels' });
  const labelByCategory = new Map<string, SVGGElement>();
  for (const zone of level.zones) {
    const p = projector.toScreen(zone.labelAnchor.x, zone.labelAnchor.y, zone.labelAnchor.z);
    const t = el<SVGTextElement>('text', {
      class: 'zone-label',
      x: fmt(p.x), y: fmt(p.y),
      'text-anchor': 'middle',
      'data-category': zone.category,
    });
    t.textContent = zone.label;
    labels.appendChild(t);
    labelByCategory.set(zone.category, t);
  }

  const fxLayer = el('g', { class: 'layer-fx' });
  const drag = el('g', { class: 'layer-drag' });
  svg.append(decals, props, ghosts, labels, fxLayer, drag);

  return { svg, projector, layers: { decals, props, ghosts, labels, fx: fxLayer, drag }, furniturePaint, ghostBySlot, ghostBySurface, labelByCategory };
}
