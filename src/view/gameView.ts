/**
 * View + input: renders the scene, converts pointer events into room
 * coordinates, drags items, previews valid placements and animates results.
 * All rules come from the game model — the view never invents its own.
 */
import type { ItemDef, LevelDef, SlotDef } from '../game/types';
import { TidyingGame } from '../game/model';
import { buildScene, type Scene } from './scene';
import { itemAssets, itemShadowRx } from './assets';
import { el, fmt } from './svg';
import * as audio from './audio';

const DROP_RADIUS = 0.95; // forgiving snap radius, world units
const LIFT = 0.55; // drag lift height, world units
const DRAG_SCALE = 1.07;
const SNAP_MS = 170;

type FromLoc = NonNullable<ReturnType<TidyingGame['pickUp']>['from']>; // floor | slot

interface DragState {
  id: string;
  pointerId: number;
  from: FromLoc;
  offX: number;
  offY: number;
  tx: number;
  ty: number;
  target: SlotDef | null;
  node: SVGGElement;
  art: SVGGElement;
  shadow: SVGEllipseElement;
  variant: number;
  asset: string;
  raf: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function initGameView(root: HTMLElement, level: LevelDef): void {
  const game = new TidyingGame(level);
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
      <div class="hud-actions">
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
    <div class="hint" id="hint">An open box, a fresh start — drag each thing to its place.</div>
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
  const btnReset = stage.querySelector('#btnReset')!;
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

  function orientationFor(def: ItemDef, inSlot: boolean): 'flat' | 'upright' {
    if (def.asset === 'book') return inSlot ? 'upright' : 'flat';
    return 'flat';
  }

  function makeItemNode(def: ItemDef, inSlot: boolean): { root: SVGGElement; art: SVGGElement; shadow: SVGEllipseElement } {
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
    art.appendChild(itemAssets[def.asset](def.variant, orientationFor(def, inSlot)));
    root.append(hit, shadow, art);
    return { root, art, shadow };
  }

  function renderItems(): void {
    layers.items.replaceChildren();
    layers.drag.replaceChildren(); // drop any leftover drag-layer node
    const entries = game.items
      .map((def) => {
        const loc = game.locationOf(def.id)!;
        if (loc.kind === 'slot') {
          const a = game.slotById(loc.slotId)!.anchor;
          return { def, x: a.x, y: a.y, z: a.z, rot: 0, inSlot: true, depth: a.x + a.y };
        }
        if (loc.kind === 'held') return null; // being dragged — lives in the drag layer
        return {
          def, x: loc.x, y: loc.y, z: 0, rot: loc.rotation, inSlot: false,
          depth: loc.x + loc.y,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
    entries.sort((a, b) => a.depth - b.depth);
    for (const e of entries) {
      const { root } = makeItemNode(e.def, e.inSlot);
      const p = pj.toScreen(e.x, e.y, e.z);
      root.setAttribute('transform', `translate(${fmt(p.x)} ${fmt(p.y)})${e.rot ? ` rotate(${fmt(e.rot)})` : ''}`);
      layers.items.appendChild(root);
    }
  }

  function updateHud(): void {
    const p = game.progress();
    hudPlaced.textContent = String(p.placed);
    hudTotal.textContent = String(p.total);
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

  // ---- ghost + zone hints ---------------------------------------------------

  function showGhost(slot: SlotDef | null): void {
    for (const g of scene.ghostBySlot.values()) g.classList.remove('on');
    if (slot) scene.ghostBySlot.get(slot.id)?.classList.add('on');
  }

  function showZoneHints(category: string): void {
    for (const t of scene.labelByCategory.values()) t.classList.remove('on');
    scene.labelByCategory.get(category)?.classList.add('on');
  }

  function hideHints(): void {
    showGhost(null);
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
    drag.target = game.findDropTarget(drag.id, tx, ty, DROP_RADIUS, LIFT);
    setDragTransform(drag, tx, ty, LIFT, DRAG_SCALE);
    showGhost(drag.target);
  }

  function endDragVisuals(d: DragState): void {
    d.node.classList.remove('dragging');
    hideHints();
  }

  function animateSettle(d: DragState, anchor: { x: number; y: number; z: number }, wasSnap: boolean): void {
    const startX = d.tx;
    const startY = d.ty;
    const startZ = LIFT;
    const t0 = performance.now();
    // books stand up when they reach a shelf
    if (wasSnap) {
      const def = game.itemById(d.id)!;
      const fresh = itemAssets[def.asset](def.variant, orientationFor(def, true));
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

  function restoreItem(d: DragState): void {
    if (d.from.kind === 'slot') {
      const res = game.drop(d.id, d.from.slotId);
      if (res.ok) {
        const a = game.slotById(d.from.slotId)!.anchor;
        audio.play('return');
        animateSettle(d, a, true);
        return;
      }
      // extremely defensive: place back on the floor near the drop point
      game.returnToFloor(d.id, d.tx, d.ty, 0);
      renderItems();
      updateHud();
      return;
    }
    game.returnToFloor(d.id, d.from.x, d.from.y, d.from.rotation);
    audio.play('return');
    animateSettle(d, { x: d.from.x, y: d.from.y, z: 0 }, false);
  }

  function finishDrag(): void {
    if (!drag) return;
    const d = drag;
    drag = null;
    endDragVisuals(d);
    if (d.raf) cancelAnimationFrame(d.raf);
    const target = d.target;
    if (target) {
      const res = game.drop(d.id, target.id);
      if (res.ok) {
        audio.play('place');
        hint.classList.add('faded');
        animateSettle(d, target.anchor, true);
        updateHud();
        if (res.completed) celebrate();
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
    const cur = from.kind === 'slot' ? game.slotById(from.slotId)!.anchor : { x: from.x, y: from.y };
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
    game.reset();
    renderItems();
    updateHud();
    hint.classList.remove('faded');
  }

  btnReset.addEventListener('click', () => {
    audio.unlock();
    audio.play('return');
    resetGame();
  });
  btnAgain.addEventListener('click', () => {
    audio.unlock();
    audio.play('pickup');
    resetGame();
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
  ;(window as unknown as Record<string, unknown>).__cozy = {
    game,
    level,
    itemClientPos: (id: string) => {
      const loc = game.locationOf(id)!;
      const w =
        loc.kind === 'slot' ? game.slotById(loc.slotId)!.anchor
        : loc.kind === 'floor' ? { x: loc.x, y: loc.y, z: 0 }
        : { x: 0, y: 0, z: 0 };
      return worldToClient(w.x, w.y, w.z);
    },
    clientFromWorld: (x: number, y: number, z = 0) => worldToClient(x, y, z),
  };

  renderItems();
  updateHud();
}
