/**
 * View + input: renders the scene, converts pointer events into room
 * coordinates, drags items, previews valid placements and animates results.
 * All rules come from the game model — the view never invents its own.
 *
 * Target precedence (plan §8.3, C-10): (1) slot match wins; else (2) the
 * nearest [data-surface] element under the pointer; else (3) implicit floor.
 * When a furniture surface is hovered, the pointer maps through that surface's
 * plane (C-2): the floor-projected pointer is shifted by (+topZ, +topZ), the
 * exact inverse of the projector's z offset.
 */
import type { DropTarget, ItemDef, LevelDef, SlotDef } from '../game/types';
import type { ItemLocation } from '../game/model';
import { TidyingGame, isTierSurface, orientationForPlacement } from '../game/model';
import { palette as P } from './palette';
import { itemFootprint } from '../level/footprints';
import { buildScene, type Scene } from './scene';
import { itemAssets, itemShadowRx, ip } from './assets';
import { el, fmt } from './svg';
import * as audio from './audio';

const DROP_RADIUS = 0.95; // forgiving snap radius, world units
const LIFT = 0.55; // drag lift height, world units
const DRAG_SCALE = 1.07;
const SNAP_MS = 170;

type FromLoc = NonNullable<ReturnType<TidyingGame['pickUp']>['from']>; // floor | slot | surface

interface DragState {
  id: string;
  pointerId: number;
  from: FromLoc;
  offX: number;
  offY: number;
  tx: number;
  ty: number;
  target: DropTarget | null;
  node: SVGGElement;
  art: SVGGElement;
  shadow: SVGEllipseElement;
  variant: number;
  asset: string;
  raf: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function initGameView(root: HTMLElement, level: LevelDef, seed?: number): void {
  const game = new TidyingGame(level, seed);
  const scene: Scene = buildScene(level);
  const { svg, projector: pj, layers } = scene;

  const stage = document.createElement('div');
  stage.className = 'stage';
  stage.appendChild(svg);
  stage.insertAdjacentHTML(
    'beforeend',
    `
    <div class="hud">
      <div class="hud-head">
        <span class="hud-title">Cozy Corner</span>
        <span class="hud-sub">move-in day</span>
      </div>
      <div class="hud-progress" aria-live="polite"><span id="hudPlaced">0</span><span class="hud-sep">/</span><span id="hudTotal">0</span></div>
      <div class="hud-chips" id="hudChips" aria-label="Book collections"></div>
      <div class="hud-actions">
        <button id="btnMess" class="btn" type="button">New Mess</button>
        <button id="btnReset" class="btn" type="button">Reset</button>
        <button id="btnMute" class="btn btn-icon" type="button" aria-pressed="false" aria-label="Toggle sound">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"></path>
            <path class="snd-waves" d="M16.5 8.5a5 5 0 0 1 0 7" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"></path>
            <line class="snd-slash" x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
          </svg>
        </button>
      </div>
    </div>
    <div class="hint" id="hint">An open box, a fresh start — put things anywhere they fit; gather each book color on one shelf tier.</div>
    <div class="fx" id="fx" hidden>
      <div class="fx-glow"></div>
      <div class="fx-sparks" aria-hidden="true"></div>
    </div>
    <div class="done-wrap" id="doneWrap" hidden>
      <div class="done-card" role="status">
        <h2>Home, at last.</h2>
        <p>Every little thing found its place.</p>
        <button id="btnAgain" class="btn btn-big" type="button">Play again</button>
      </div>
    </div>
    `,
  );
  root.appendChild(stage);

  const hudPlaced = stage.querySelector('#hudPlaced')!;
  const hudTotal = stage.querySelector('#hudTotal')!;
  const hint = stage.querySelector<HTMLElement>('#hint')!;
  const fx = stage.querySelector<HTMLElement>('#fx')!;
  const doneWrap = stage.querySelector<HTMLElement>('#doneWrap')!;
  const btnMess = stage.querySelector('#btnMess')!;
  const btnReset = stage.querySelector('#btnReset')!;
  const hudChips = stage.querySelector<HTMLElement>('#hudChips')!;
  const hudSub = stage.querySelector<HTMLElement>('.hud-sub')!;
  const btnMute = stage.querySelector('#btnMute')!;
  const btnAgain = stage.querySelector('#btnAgain')!;

  hudTotal.textContent = String(game.progress().total);

  // sparkles for the completion moment (deterministic, gentle)
  const sparks = stage.querySelector('.fx-sparks')!;
  const sparkSpecs = [8, 22, 37, 49, 58, 66, 74, 83, 91, 15, 44, 70, 29, 87];
  sparkSpecs.forEach((left, i) => {
    const s = document.createElement('span');
    s.className = 'sparkle';
    s.style.left = `${left}%`;
    s.style.top = `${18 + ((i * 29) % 55)}%`;
    s.style.animationDelay = `${(i % 7) * 0.22}s`;
    s.style.background = ['#f6efe0', '#e8a06b', '#7fb3a9'][i % 3];
    s.style.animationDuration = `${2.2 + (i % 4) * 0.5}s`;
    sparks.appendChild(s);
  });

  // ---- item rendering ----------------------------------------------------

  /** Display orientation of a resting item (C-9): books stand upright on
   *  bookshelf tiers — in slots or on the tier surface — flat everywhere else. */
  function orientationForLoc(def: ItemDef, loc: ItemLocation): 'flat' | 'upright' {
    if (def.asset !== 'book') return 'flat';
    if (loc.kind === 'slot') return 'upright';
    if (loc.kind === 'surface') {
      return orientationForPlacement(level, def, loc.surfaceId);
    }
    return 'flat';
  }

  function makeItemNode(def: ItemDef, orient: 'flat' | 'upright'): { root: SVGGElement; art: SVGGElement; shadow: SVGEllipseElement } {
    const root = el<SVGGElement>('g', { class: 'item', 'data-item-id': def.id });
    const r = itemShadowRx[def.asset] ?? 0.15;
    // generous, explicit grab area (transparent rect — reliable hit-testing)
    const hit = el<SVGRectElement>('rect', {
      class: 'item-hit',
      x: fmt(-r * 1.5), y: fmt(-r * 1.15),
      width: fmt(r * 3), height: fmt(r * 2.1),
      fill: 'transparent', stroke: 'none',
    });
    const shadow = el<SVGEllipseElement>('ellipse', {
      class: 'item-shadow',
      cx: 0, cy: 0,
      rx: fmt(r * 1.2247),
      ry: fmt(r * 1.2247 * 0.42),
      'pointer-events': 'none',
    });
    const art = el<SVGGElement>('g', { class: 'art' });
    art.appendChild(itemAssets[def.asset](def.variant, orient));
    root.append(hit, shadow, art);
    return { root, art, shadow };
  }

  /** Painter key for a resting item (C-6, support-relative): floor items key
   *  plain x + y; items resting on furniture F (slot or surface) key
   *  depth(F) + ε so the support never paints over what stands on it; the
   *  item's own position breaks ties within one support. */
  function itemPaintKey(loc: ItemLocation): number {
    const SUB = 0.0005; // within-support tie-break
    const EPS = 0.01; // above the support
    if (loc.kind === 'held') return 0; // held items render in the drag layer, never here
    if (loc.kind === 'floor') return loc.x + loc.y;
    if (loc.kind === 'slot') {
      const slot = game.slotById(loc.slotId)!;
      const host = game.hostSurfaceIdOfSlot(slot);
      const base = host && host !== 'floor'
        ? furnitureKey(game.surfaceById(host)?.furnitureId)
        : slot.anchor.x + slot.anchor.y;
      return base + EPS + (slot.anchor.x + slot.anchor.y) * SUB;
    }
    const s = game.surfaceById(loc.surfaceId)!;
    if (!s.furnitureId) return loc.x + loc.y; // floor-entry rests key plain
    return furnitureKey(s.furnitureId) + EPS + (loc.x + loc.y) * SUB;
  }

  function furnitureKey(furnitureId: string | undefined): number {
    if (!furnitureId) return 0;
    const f = level.furniture.find((x) => x.id === furnitureId);
    if (!f) return 0;
    return pj.depth(f.anchor.x, f.anchor.y) + (f.sortBias ?? 0);
  }

  function renderItems(): void {
    layers.drag.replaceChildren(); // drop any leftover drag-layer node
    const itemEntries = game.items
      .map((def) => {
        const loc = game.locationOf(def.id)!;
        if (loc.kind === 'slot') {
          const a = game.slotById(loc.slotId)!.anchor;
          return { def, x: a.x, y: a.y, z: a.z, rot: 0, orient: orientationForLoc(def, loc), key: itemPaintKey(loc) };
        }
        if (loc.kind === 'surface') {
          const s = game.surfaceById(loc.surfaceId)!;
          return { def, x: loc.x, y: loc.y, z: s.topZ, rot: loc.rotation, orient: orientationForLoc(def, loc), key: itemPaintKey(loc) };
        }
        if (loc.kind === 'held') return null; // being dragged — lives in the drag layer
        return {
          def, x: loc.x, y: loc.y, z: 0, rot: loc.rotation,
          orient: orientationForLoc(def, loc),
          key: itemPaintKey(loc),
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
    const paint: Array<{ node: SVGGElement; key: number }> = [];
    for (const e of itemEntries) {
      const { root } = makeItemNode(e.def, e.orient);
      const p = pj.toScreen(e.x, e.y, e.z);
      root.setAttribute('transform', `translate(${fmt(p.x)} ${fmt(p.y)})${e.rot ? ` rotate(${fmt(e.rot)})` : ''}`);
      paint.push({ node: root, key: e.key });
    }
    // merged, support-relative paint list: furniture + items, one order (C-6)
    for (const fe of scene.furniturePaint) paint.push(fe);
    paint.sort((a, b) => a.key - b.key);
    layers.props.replaceChildren(...paint.map((e) => e.node));
  }

  function updateHud(): void {
    const p = game.progress();
    hudPlaced.textContent = String(p.placed);
    hudTotal.textContent = String(p.total);
  }

  // collection chips (CC-014): filled = currently complete; quiet un-fill on a
  // committed break; rendered from collectionStatus() on committed changes only
  const CHIP_COLORS: Record<string, string> = {
    red: P.terracotta, green: P.leaf, blue: P.slateBlue,
  };
  const chipEls = new Map<string, HTMLElement>();
  for (const c of level.collections ?? []) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset.collection = c.id;
    chip.title = c.label;
    const dot = document.createElement('span');
    dot.className = 'chip-dot';
    dot.style.background = CHIP_COLORS[c.colorKey] ?? P.cream;
    chip.appendChild(dot);
    hudChips.appendChild(chip);
    chipEls.set(c.id, chip);
  }

  function updateChips(): void {
    for (const s of game.collectionStatus()) {
      chipEls.get(s.id)?.classList.toggle('on', s.complete);
    }
  }

  function updateSeedTitle(): void {
    hudSub.title = `seed: ${game.currentSeed}`;
  }

  // ---- pointer → world ----------------------------------------------------

  function pointerToFloor(e: PointerEvent): { x: number; y: number } {
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return pj.toFloor(p.x, p.y);
  }

  function worldToClient(x: number, y: number, z = 0): { x: number; y: number } {
    const p = pj.toScreen(x, y, z);
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: p.x, y: p.y };
    const pt = new DOMPoint(p.x, p.y).matrixTransform(ctm);
    return { x: pt.x, y: pt.y };
  }

  /** Nearest `[data-surface]` group under the pointer, topmost first (C-10).
   *  The dragged item and non-surface art are skipped by the walk. */
  function resolveSurface(e: PointerEvent): string | null {
    for (const node of document.elementsFromPoint(e.clientX, e.clientY)) {
      const g = node.closest('[data-surface]');
      const id = g?.getAttribute('data-surface');
      if (id) return id;
    }
    return null;
  }

  // ---- ghost + zone hints ---------------------------------------------------

  function showGhost(slot: SlotDef | null): void {
    for (const g of scene.ghostBySlot.values()) g.classList.remove('on');
    if (slot) scene.ghostBySlot.get(slot.id)?.classList.add('on');
  }

  /** Draw the dragged item's current-orientation footprint outline at a surface
   *  point, projected onto that surface's plane — fit or no-fit (physical
   *  information only; collection state is unreachable here, R4). */
  function showSurfaceGhost(itemId: string, surfaceId: string, px: number, py: number, fit: boolean): void {
    for (const g of scene.ghostBySurface.values()) g.classList.remove('on');
    const g = scene.ghostBySurface.get(surfaceId);
    const surface = game.surfaceById(surfaceId);
    const def = game.itemById(itemId);
    if (!g || !surface || !def) return;
    const fp = itemFootprint(def.asset, orientationForPlacement(level, def, surfaceId));
    if (!fp) return;
    const x0 = -fp.dx / 2, x1 = fp.dx / 2;
    const oy = fp.offsetY ?? 0;
    const y0 = -fp.dy / 2 + oy, y1 = fp.dy / 2 + oy;
    const pt = (lx: number, ly: number) => { const p = ip(lx, ly, 0); return `${fmt(p[0])},${fmt(p[1])}`; };
    g.querySelector('.surface-ghost-shape')!.setAttribute('d',
      `M ${pt(x0, y0)} L ${pt(x1, y0)} L ${pt(x1, y1)} L ${pt(x0, y1)} Z`);
    const strike = g.querySelector('.surface-ghost-strike')!;
    const a = ip(x0, y0, 0), b = ip(x1, y1, 0);
    strike.setAttribute('x1', fmt(a[0])); strike.setAttribute('y1', fmt(a[1]));
    strike.setAttribute('x2', fmt(b[0])); strike.setAttribute('y2', fmt(b[1]));
    const p = pj.toScreen(px, py, surface.topZ);
    g.setAttribute('transform', `translate(${fmt(p.x)} ${fmt(p.y)})`);
    g.classList.toggle('fit', fit);
    g.classList.toggle('no-fit', !fit);
    g.classList.add('on');
  }

  function showZoneHints(category: string): void {
    for (const t of scene.labelByCategory.values()) t.classList.remove('on');
    scene.labelByCategory.get(category)?.classList.add('on');
  }

  function hideHints(): void {
    showGhost(null);
    for (const g of scene.ghostBySurface.values()) g.classList.remove('on');
    for (const t of scene.labelByCategory.values()) t.classList.remove('on');
  }

  // ---- dragging -------------------------------------------------------------

  let drag: DragState | null = null;

  function setDragTransform(d: DragState, wx: number, wy: number, z: number, scale: number): void {
    const p = pj.toScreen(wx, wy, z);
    d.node.setAttribute('transform', `translate(${fmt(p.x)} ${fmt(p.y)}) scale(${fmt(scale)})`);
    const f = pj.toScreen(wx, wy, 0);
    d.shadow.setAttribute('transform', `translate(${fmt(f.x - p.x)} ${fmt(f.y - p.y)}) scale(${fmt(scale > 1 ? 0.82 : 1)})`);
    d.shadow.style.opacity = scale > 1 ? '0.55' : '1';
  }

  function updateDrag(e: PointerEvent): void {
    if (!drag) return;
    const w = pointerToFloor(e);
    // slightly negative bounds let wall-mounted slots (rack, shelves) be reached
    const tx = clamp(w.x + drag.offX, -0.9, level.room.width + 0.6);
    const ty = clamp(w.y + drag.offY, -0.9, level.room.depth + 0.6);
    drag.tx = tx;
    drag.ty = ty;
    setDragTransform(drag, tx, ty, LIFT, DRAG_SCALE);

    // (1) slot match wins (existing radius + carry-height compensation)
    const slotMatch = game.findDropTarget(drag.id, tx, ty, DROP_RADIUS, LIFT);
    if (slotMatch) {
      drag.target = { type: 'slot', slotId: slotMatch.id };
      showGhost(slotMatch);
      for (const g of scene.ghostBySurface.values()) g.classList.remove('on');
      return;
    }
    showGhost(null);

    // (2) hovered [data-surface] → aim through that surface's plane (C-2):
    // the floor-projected pointer shifts by (+topZ, +topZ) — the exact inverse
    // of the projector's z offset (a surface point (px, py, topZ) floor-projects
    // to (px − topZ, py − topZ); ISO_SIN = 0.5)
    const hovered = resolveSurface(e);
    if (hovered && hovered !== 'floor' && game.surfaceById(hovered)) {
      const s = game.surfaceById(hovered)!;
      const px = w.x + s.topZ;
      const py = w.y + s.topZ;
      drag.target = { type: 'surface', surfaceId: hovered, x: px, y: py };
      showSurfaceGhost(drag.id, hovered, px, py, game.validateSurfaceDrop(drag.id, hovered, px, py).ok);
      return;
    }

    // (3) implicit floor — the plain floor-plane mapping at the carried position
    drag.target = { type: 'surface', surfaceId: 'floor', x: tx, y: ty };
    showSurfaceGhost(drag.id, 'floor', tx, ty, game.validateSurfaceDrop(drag.id, 'floor', tx, ty).ok);
  }

  function endDragVisuals(d: DragState): void {
    d.node.classList.remove('dragging');
    hideHints();
  }

  function animateSettle(d: DragState, anchor: { x: number; y: number; z: number }, orient: 'flat' | 'upright' | null): void {
    const startX = d.tx;
    const startY = d.ty;
    const startZ = LIFT;
    const t0 = performance.now();
    // books swap orientation as they land (stand up on tiers, lie down elsewhere)
    if (orient) {
      const def = game.itemById(d.id)!;
      const fresh = itemAssets[def.asset](def.variant, orient);
      d.art.replaceChildren(...Array.from(fresh.childNodes));
    }
    const step = (now: number) => {
      const t = clamp((now - t0) / SNAP_MS, 0, 1);
      const k = easeOut(t);
      const wx = startX + (anchor.x - startX) * k;
      const wy = startY + (anchor.y - startY) * k;
      const z = startZ + (anchor.z - startZ) * k;
      const scale = 1 + (DRAG_SCALE - 1) * (1 - k);
      setDragTransform(d, wx, wy, z, scale);
      if (t < 1) {
        d.raf = requestAnimationFrame(step);
      } else {
        renderItems();
        updateHud();
      }
    };
    d.raf = requestAnimationFrame(step);
  }

  /** Settle anchor for a committed target. */
  function anchorFor(target: DropTarget): { x: number; y: number; z: number } {
    if (target.type === 'slot') return game.slotById(target.slotId)!.anchor;
    const s = game.surfaceById(target.surfaceId)!;
    return { x: target.x, y: target.y, z: s.topZ };
  }

  /** Orientation the item lands with for a committed target. */
  function orientForTarget(def: ItemDef, target: DropTarget): 'flat' | 'upright' | null {
    if (def.asset !== 'book') return null;
    if (target.type === 'slot') return 'upright';
    return isTierSurface(level, target.surfaceId) ? 'upright' : 'flat';
  }

  /** The one commit consumer for normal drops AND restore drops (C-17/Q2):
   *  sound, settle, HUD, tier-collection feedback, completion card. Feedback
   *  consumes only commit-time data from the model — an exact put-back or a
   *  cancel-restore never carries a transition, so it can never re-celebrate. */
  function applyCommittedDrop(res: Extract<ReturnType<TidyingGame['drop']>, { ok: true }>, d: DragState, sound: 'place' | 'return'): void {
    audio.play(sound);
    hint.classList.add('faded');
    animateSettle(d, anchorFor(res.target), orientForTarget(game.itemById(d.id)!, res.target));
    updateHud();
    updateChips();
    for (const cid of res.collectionCompleted ?? []) {
      const delay = (celebrationCount++) % 4 * 250; // concurrent completions stagger (A4)
      window.setTimeout(() => {
        const st = game.collectionStatus().find((c) => c.id === cid);
        if (st?.complete && st.tierId) {
          tierAnimation(st.tierId);
          audio.play('collection');
        }
      }, delay);
    }
    if (res.completed) celebrate();
  }

  let celebrationCount = 0;

  /** Short animation anchored at the completed tier (CC-008): a glowing tier
   *  outline + gentle sparks in the existing FX language; self-clears. */
  function tierAnimation(tierId: string): void {
    const s = game.surfaceById(tierId);
    if (!s) return;
    const cx = (s.bounds.minX + s.bounds.maxX) / 2;
    const cy = (s.bounds.minY + s.bounds.maxY) / 2;
    const w = s.bounds.maxX - s.bounds.minX;
    const dep = s.bounds.maxY - s.bounds.minY;
    const g = el<SVGGElement>('g', { class: 'tier-fx' });
    const p = pj.toScreen(cx, cy, s.topZ);
    g.setAttribute('transform', `translate(${fmt(p.x)} ${fmt(p.y)})`);
    const pt = (lx: number, ly: number) => { const q = ip(lx, ly, 0); return `${fmt(q[0])},${fmt(q[1])}`; };
    g.appendChild(el('path', {
      class: 'tier-fx-outline',
      d: `M ${pt(-w / 2, -dep / 2)} L ${pt(w / 2, -dep / 2)} L ${pt(w / 2, dep / 2)} L ${pt(-w / 2, dep / 2)} Z`,
    }));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const q = ip(Math.cos(a) * w * 0.34, Math.sin(a) * dep * 0.34, 0);
      const spark = el('circle', { class: 'tier-fx-spark', cx: fmt(q[0]), cy: fmt(q[1] - 0.12), r: fmt(0.05) });
      spark.style.animationDelay = `${i * 0.09}s`;
      g.appendChild(spark);
    }
    layers.fx.appendChild(g);
    window.setTimeout(() => g.remove(), 1500);
  }

  function restoreItem(d: DragState): void {
    const from = d.from;
    if (from.kind === 'slot') {
      const res = game.drop(d.id, { type: 'slot', slotId: from.slotId });
      if (res.ok) {
        applyCommittedDrop(res, d, 'return');
        return;
      }
      // deterministic fallback: floor near the drop point (C-18)
      game.returnToFloor(d.id, d.tx, d.ty, 0);
      renderItems();
      updateHud();
      return;
    }
    if (from.kind === 'surface') {
      const res = game.drop(d.id, { type: 'surface', surfaceId: from.surfaceId, x: from.x, y: from.y });
      if (res.ok) {
        applyCommittedDrop(res, d, 'return');
        return;
      }
      game.returnToFloor(d.id, d.tx, d.ty, 0);
      renderItems();
      updateHud();
      return;
    }
    game.returnToFloor(d.id, from.x, from.y, from.rotation);
    audio.play('return');
    animateSettle(d, { x: from.x, y: from.y, z: 0 }, 'flat');
  }

  function finishDrag(): void {
    if (!drag) return;
    const d = drag;
    drag = null;
    endDragVisuals(d);
    if (d.raf) cancelAnimationFrame(d.raf);
    const target = d.target;
    if (target) {
      const res = game.drop(d.id, target);
      if (res.ok) {
        applyCommittedDrop(res, d, 'place');
        return;
      }
    }
    restoreItem(d);
    updateHud();
  }

  function cancelDrag(): void {
    if (!drag) return;
    const d = drag;
    drag = null;
    endDragVisuals(d);
    if (d.raf) cancelAnimationFrame(d.raf);
    restoreItem(d);
    updateHud();
  }

  svg.addEventListener('pointerdown', (e: PointerEvent) => {
    if (drag || game.isComplete()) return;
    const hit = (e.target as Element).closest('[data-item-id]') as SVGGElement | null;
    if (!hit) return;
    const id = hit.getAttribute('data-item-id')!;
    const def = game.itemById(id);
    const picked = game.pickUp(id);
    if (!picked.ok || !picked.from || !def) return;
    audio.unlock();
    audio.play('pickup');

    const w = pointerToFloor(e);
    const from = picked.from;
    const cur = from.kind === 'slot' ? game.slotById(from.slotId)!.anchor
      : from.kind === 'surface' ? { x: from.x, y: from.y }
      : { x: from.x, y: from.y };
    layers.drag.appendChild(hit);
    hit.classList.add('dragging');
    showZoneHints(def.category);
    drag = {
      id,
      pointerId: e.pointerId,
      from,
      offX: cur.x - w.x,
      offY: cur.y - w.y,
      tx: cur.x,
      ty: cur.y,
      target: null,
      node: hit,
      art: hit.querySelector('.art') as SVGGElement,
      shadow: hit.querySelector('.item-shadow') as SVGEllipseElement,
      variant: def.variant,
      asset: def.asset,
      raf: 0,
    };
    svg.setPointerCapture(e.pointerId);
    updateDrag(e);
    updateHud();
    e.preventDefault();
  });

  svg.addEventListener('pointermove', (e: PointerEvent) => {
    if (drag && e.pointerId === drag.pointerId) updateDrag(e);
  });
  svg.addEventListener('pointerup', (e: PointerEvent) => {
    if (drag && e.pointerId === drag.pointerId) finishDrag();
  });
  svg.addEventListener('pointercancel', (e: PointerEvent) => {
    if (drag && e.pointerId === drag.pointerId) cancelDrag();
  });
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') cancelDrag();
  });

  // ---- completion & buttons --------------------------------------------------

  function celebrate(): void {
    audio.play('complete');
    fx.hidden = false;
    window.setTimeout(() => {
      doneWrap.hidden = false;
      requestAnimationFrame(() => doneWrap.classList.add('show'));
    }, 900);
  }

  function resetGame(): void {
    cancelDrag();
    doneWrap.classList.remove('show');
    doneWrap.hidden = true;
    fx.hidden = true;
    game.reset(); // same seed → identical layout (CC-013)
    renderItems();
    updateHud();
    updateChips();
    updateSeedTitle();
    hint.classList.remove('faded');
  }

  function newMessGame(): void {
    cancelDrag();
    doneWrap.classList.remove('show');
    doneWrap.hidden = true;
    fx.hidden = true;
    game.newMess(); // fresh seed → another layout, state quietly cleared
    renderItems();
    updateHud();
    updateChips();
    updateSeedTitle();
    hint.classList.remove('faded');
  }

  btnReset.addEventListener('click', () => {
    audio.unlock();
    audio.play('return');
    resetGame();
  });
  btnMess.addEventListener('click', () => {
    audio.unlock();
    audio.play('return');
    newMessGame();
  });
  btnAgain.addEventListener('click', () => {
    audio.unlock();
    audio.play('pickup');
    newMessGame(); // "Play again" behaves as New Mess (A3)
  });
  btnMute.addEventListener('click', () => {
    const muted = !audio.isMuted();
    audio.setMuted(muted);
    btnMute.setAttribute('aria-pressed', String(muted));
    btnMute.classList.toggle('muted', muted);
    if (!muted) {
      audio.unlock();
      audio.play('pickup');
    }
  });

  // read-only debug/testing hook (used by the e2e script; never mutates state)
  const cozyHook: Record<string, unknown> = {
    game,
    level,
    itemClientPos: (id: string) => {
      const loc = game.locationOf(id)!;
      const w =
        loc.kind === 'slot' ? game.slotById(loc.slotId)!.anchor
        : loc.kind === 'surface' ? { x: loc.x, y: loc.y, z: game.surfaceById(loc.surfaceId)?.topZ ?? 0 }
        : loc.kind === 'floor' ? { x: loc.x, y: loc.y, z: 0 }
        : { x: 0, y: 0, z: 0 };
      return worldToClient(w.x, w.y, w.z);
    },
    clientFromWorld: (x: number, y: number, z = 0) => worldToClient(x, y, z),
  };
  // read-only snapshot getter — callers cannot mutate the internal log (C-14)
  Object.defineProperty(cozyHook, 'lastSfx', {
    get: () => audio.sfxLogSnapshot(),
    enumerable: true,
  });
  ;(window as unknown as Record<string, unknown>).__cozy = cozyHook;

  renderItems();
  updateHud();
  updateChips();
  updateSeedTitle();
}
