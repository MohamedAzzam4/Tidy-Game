# Tidy Tapes — Specification (spec.md) — v2 follow-up

**Feature:** 001-tidy-tapes · Cozy cassette-sorting shop · Status: v2 reviewed (see review.md)

> Spec Kit CLI (`specify`) is not installed in this sandbox. The specify → plan → tasks →
> analyze steps are followed **manually**; no slash command ran. v1 shipped; this spec is the
> consolidated follow-up applied to the **same Phaser project** (keep working repair/skill/
> save systems; no new engine, no mockup).

## Baseline (captured before v2 work)

- Screenshot: `download/baseline-v1-wide.png` (seed 20261118, 512 tapes, world 4400×3000).
- Confirmed problems: straight-on flat view with no depth; 64 tiny racks spread far apart;
  center/left of the table largely empty; corner-biased tape piles.
- File ownership: board generator `src/game/worldgen.ts` (+ `config.ts` geometry), renderer
  `src/game/textures.ts` + `src/game/scenes/GameScene.ts`, input
  `src/game/controllers/DragController.ts` (+ GameScene.setupInput), storage (racks/slots:
  GameScene + DragController + `types.ts`), progression `src/game/controllers/SkillsController.ts`,
  audio `src/game/audio.ts`, save `src/game/save.ts`, tests `src/game/__tests__/` +
  `src/game/autotest.ts`.

## Problem

The same cozy cassette shop, now with a fixed gentle three-quarter 2.5D look, compact rack
banks, a five-slot carry tray, and honest hidden mistakes: any tape physically fits any slot
with room, correctness is only revealed by explicit verification or late-game skills.

## v2 requirements (user stories)

### A1 — Art direction and rack geometry

- Fixed, gentle three-quarter mostly top-down 2.5D (per reference image): axis-aligned
  objects (no steep diamond grid, no free 3D camera), top face dominant, thin darker extruded
  front/side faces, top-left rim highlights, soft short contact shadows. Same angle for
  table, racks, loose cassettes, props. HUD and text stay upright.
- Logical board/slot positions stay independent of rendering: ground position = logical
  (x,y) 1:1; the 2.5D is baked into angled art and layered sprites (rack bodies, seated
  spines, slot lips as foreground). No canvas/HUD skew. Depth order = base y (painter).
- Loose tapes show broad faces; stored tapes sit snugly edge-on like books: narrow colored
  spine with symbol visible, seated behind a slot lip. Compact rack banks with labeled rows
  and clearly readable empty slots. No full faces flat inside storage; no tiny racks
  scattered across a mostly empty table.

### A2 — Explorable board, ≥400 real tapes

- Default board ≥ 400 actual interactive cassettes (target ~440–470). Table world pannable on
  both axes (bigger than viewport). Loose tapes scattered through ALL usable regions —
  center first, plus corridors between/beside racks — mixed singles and small clusters with
  light overlap. Clearance kept around rack openings and the repair bench. No corner-only
  dumping, no empty middle.
- 8 shell colors × 4 clear symbols = 32 groups (no 8-shape variants). TWO matching rows per
  group (8 slots each, in two different rack units in different banks) — either row equally
  valid for every tape of the group; no hidden per-tape assignment. Tape count per group is
  derived from the combined capacity of its rows (fill fraction, then top-up to ≥ 400).
- Seedable generator; validate every seed: all tapes grabbable and correctly fileable
  (demand ≤ capacity), counts balance, center stays populated across seeds, no
  inaccessible starts (bounds/rack/bench/coverage). Rotation jitter keeps color+symbol
  readable. Existing v1 saves are not silently migrated: layout version bumped; if a v1
  save exists the player chooses "new layout (keep unlocked skills)" vs discard.

### A3 — Camera, precise dragging, carry tray

- Smooth bounded wheel zoom centered on the cursor (clamped by board edges), plus visible
  +, − and fit-to-table buttons; zoom range tunable (0.6–2.0). Pan via Space+drag,
  right/middle-drag, WASD/arrows — all usable while carrying tapes; touch keeps one-finger
  pan on empty table + two-finger pinch zoom/pan; explicit Select mode for touch marquee.
  HUD fixed. Pan/zoom/move/select gestures stay distinct.
- Pickup keeps the grabbed point exactly under the cursor (grab offset recomputed from the
  active camera every frame; works through pan and zoom, edge and center grabs, after
  resize). One coordinate model (logical ground = camera world) for selection, rack drop
  zones, marquee and tray drops.
- Five-slot carry tray as basic equipment (visible, collapsible): load/remove tapes
  individually, carry across the map, drag one out or drop the batch into a rack. Tapes in
  the tray stay identifiable (color + symbol). Partial rack → insert only what fits, keep
  the rest in the tray. A full tray never accepts a sixth (gentle refuse + hint). Carried
  or stored tapes can always go back onto a free table spot.

### A4 — Hidden mistakes and skill progression

- Any tape physically enters any rack row with room, even wrong color/symbol: identical
  snap preview, motion and sound for every accepted placement — no red flash, rejection,
  special sound, tooltip or correctness-based counter during normal sorting. Rack counts
  show physical occupancy only. Win validation checks actual group matches: fully occupied
  but misfiled board is NOT a win. When the last loose tape is filed but misfiles remain, a
  general message appears (no location revealed). Tapes can be pulled back out and re-filed.
- Progression kept: marquee pickup unlocks by achievement; LMB on empty table draws a
  desktop-style rectangle; release selects; selected tapes move as a group or load into free
  tray slots (extras stay put, fit is shown). Tray itself is available from the start.
- Skills, separate effects: spot damaged tapes; reveal misfiled tapes; show compatible racks
  for the selected tape (both matching rows, incl. duplicates) with offscreen pointers;
  highlight other tapes with same color+symbol. Last skill: one-click pickup of matching
  loose tapes into free tray slots only (no teleporting past capacity). The powerful
  late-game skills are temporary: tunable 15 s active / 60 s cooldown, remaining time and
  cooldown shown; expiry never drops held tapes; no skill reveals mistakes before
  activation.

### A5 — Insertion is the most satisfying moment

- No teleport: align over the selected opening, turn broad-face → edge-on, slide a short
  visible distance in; slot lip as foreground layer conceals the leading part; spine visible
  once seated. ~200–300 ms per tape (tunable), batch entries staggered slightly.
- Two short, quiet curved motion strokes behind the tape during the slide (light comic cue,
  not arrows/burst/bubble), fading before settle; at most one pair at a time during batches.
- Magnetic Tuck on every accepted insertion: soft descending shff then a short muted plastic
  tuk exactly at seat; calm, slightly game-like; subtle variation; overlapping peaks
  controlled on a batch of five. Audition control (single / batch / chime) in the HUD.
- Tiny Chime ONLY for explicit confirmations: a rack the player intentionally verifies, or
  a verified end-of-job milestone. Never on correct insertion, filled rack, power
  activation or repair finish.

### A6 — Repairs stay short and tactile (refined in place)

- Mechanism: open the shell, one or two simple actions (circular pencil winding of the
  loose ribbon onto the reel) — no simulator complexity.
- Sticker: peel off and discard the old symbol sticker, wipe the adhesive, press a new
  same-symbol sticker — one short peel–wipe–press sequence; the old sticker is truly
  discarded, never recolored.
- Marker touch-up: separate and optional (cosmetic scuff on the shell, visible before/after;
  does not block sorting).

## Non-goals (unchanged from v1)

No backend, no multiplayer, no physics placement, no fail state, no audio files, no
external art assets.

## Constraints

- Phaser 3.90.0 (pinned, installed) inside the existing Next.js 16 host; client-only canvas.
- Keyboard, mouse and simulated touch all work; acceptance via unit tests + in-page
  autotest + agent-browser E2E with screenshots.
- Design knobs (group fill, zoom bounds, power timings, insertion duration) live in
  `src/game/config.ts`.
