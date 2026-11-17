# Tidy Tapes — Specification (spec.md)

**Feature:** 001-tidy-tapes · Cozy cassette-sorting shop · Status: reviewed (see review.md)

> Spec Kit CLI (`specify`) is not installed in this sandbox. This spec follows the Spec Kit
> SDD workflow (specify → plan → tasks → analyze) **manually**; no slash command ran. See review.md.

## Problem

A cozy top-down cassette shop has one large worktable covered in scattered tapes. The player
turns the mess into a tidy shop by picking up tapes and slotting each into the organizer that
matches **both** its shell color and its printed symbol. Some tapes need a small repair first.
Relaxed mode: no timer, no deadline, no fail state (power-up cooldowns are the only timers and
they only gate the powers themselves).

## Goals

1. One large, scrollable table world holding **400+ real, individually movable tapes** in the
   default New Game, seen through a camera viewport smaller than the world on both axes.
2. Cursor-accurate, tactile drag & drop with a satisfying, physical slot insertion.
3. Three short repair interactions (rewind, sticker swap, paint touch-up) on occasional tapes.
4. Six unlockable sorting skills earned through visible sorting milestones, all obtainable in
   the same 400+ tape run.
5. Persistent progress (positions, repairs, organizer contents, skill unlocks) across reloads.
6. Deterministic, validated world generation with replayable seeds.

## Non-goals

- No backend/server, no multiplayer, no accounts.
- No physics engine for scripted cassette placement (Phaser tweens only).
- No fail state, no scoring pressure, no timed levels.
- No audio files; all sound is synthesized in the browser (WebAudio).
- No external art assets; all art is drawn procedurally at boot (one cassette design, many
  palettes/symbols/label variants).

## The world (user stories, prioritized)

### P1 — Stories that alone make a viable game

**US1. Scrollable shop world.** As a player, I see part of a big table at start and can pan the
camera to reach the rest, so the shop feels like one continuous place.
- World size ≥ 3× viewport width and ≥ 3× viewport height (target 4400×3000 vs ~1200×700).
- Pan via mouse wheel / trackpad (both axes), keyboard (WASD/arrows — works **while holding a
  tape or a group**), right/middle-drag, and touch: two-finger drag plus an explicit Pan/Select
  mode toggle so touch pan never conflicts with drag or selection.
- Optional zoom (keys +/− and HUD buttons, 0.55–1.6). HUD stays fixed to the screen at all times.
- Acceptance: at game start the camera shows only part of the world; panning reveals organizer
  rows in every direction; the HUD never moves with the world.

**US2. 400+ real tapes.** As a player, I want a genuinely full table.
- Default New Game generates **410 seed-varied (405–415) tapes**, each an individually movable
  sprite with a unique ID, a (shell color, symbol) pair from 8 colors × 8 symbols, and a label.
  No decorative stand-ins, no future-level placeholders, no webpage scrolling substitute.
- Different seed per New Game; a seed can be replayed (?seed=123 URL param, and shown in HUD).
- **Validation (must hold for every seed):** every tape has a reachable matching organizer with
  enough compatible free slots for its whole group (demand per combo ≤ rack capacity); no tape
  starts out of bounds, inside an organizer/bench footprint, or fully covered by other tapes;
  every generated defect is one of the three repairable types.
- Real counter: "Shelved X / N" where N is the real starting total. Never color-alone matching:
  symbols are always visible on labels, spines and rack headers.
- Acceptance: window.__tidy debug API reports tapeCount ≥ 400 and unique IDs; validator returns
  ok for multiple seeds.

**US3. Cursor-accurate drag & slotting.** As a player, I grab a tape exactly where I clicked and
it stays under that exact point until I let go.
- Pickup stores the grab offset (pointer world point − tape position); every frame the held tape
  position is recomputed from the **active camera** (camera.getWorldPoint), so panning or zooming
  while the pointer is stationary keeps the grab point locked. No center-jump, no Y offset, no lag.
- Hover preview: dragging over the matching rack highlights the exact free slot (glow + spine ghost).
- Release on matching rack with free slots: the tape turns edge-on and slides smoothly into the
  slot (loose tapes lie face-up with both reels visible; stored tapes show only the slim spine
  with color + symbol, in narrow individual slots). Sound: a soft short plastic-on-plastic glide
  starting as the tape begins to enter, synced to the slide, tapering naturally; optional tiny
  quiet seating tick; **no loud clack/beep/chime per tape**; no sound on hover or invalid drop.
  The held tape itself must never feel laggy — snap smoothness comes only from the release tween.
- Batch drops stagger insertions (≈90 ms) so each tape is heard; a limiter plus per-batch gain
  ducking prevents a pile-up into one loud hit.
- Invalid drop: never silently accepted, never destroys or duplicates a tape. Incompatible rack →
  gentle shake + hint; tape lands on the table in a visible, valid position.
- Acceptance: autotest asserts grab-point math (incl. mid-drag camera pan and a second zoom
  level), insert invariants, and no loss/duplication on invalid drops.

**US4. Sorting session with milestones.** As a player, I sort at my own pace and see progress.
- Shelved counter, loose counter, repairs-left counter, all derived from real state.
- Completion state (all tapes shelved): gentle panel with stats; no fail state anywhere.
- Acceptance: driving all tapes to shelved shows the completion panel; counters are consistent.

### P2 — Makes the session special

**US5. Repair bench.** Some tapes (≈11%, exactly one defect each, type ∈ {rewind, sticker, paint})
arrive defective and cannot be shelved until repaired. Open a repair by dropping the tape on the
bench mat or double-clicking/two-tapping it. Repairs are short, tactile, restrained (no screen
shake, no loud effects); after repair the tape returns to the sorting loop, sortable and tracked.
- **Rewind:** opened cassette with two reels; rotate one reel with a pencil in continuous
  circular strokes until the loose brown ribbon returns to its guides.
- **Sticker swap:** peel off only the damaged symbol sticker with tweezers (drag off), wipe the
  small adhesive residue (rub), press a new sticker of the **same symbol** in the same spot. The
  large label stays intact; no marker drawing.
- **Paint touch-up:** rub a matching-color marker over a small faded patch on the shell; the
  original color is revealed directly under the stroke. Full repaint or covering the label is
  forbidden.
- Acceptance: all three minigames completable via simulated pointer gestures; repaired tapes are
  retained across reload and become sortable.

**US6. Unlockable sorting skills.** Earned by shelving milestones (all thresholds < 410 so all
are obtainable in one 400+ run). Unlock toasts announce them.
1. Defect Scanner (10 shelved) — toggle: highlights tapes that need repair.
2. Slot Guide (20 shelved) — click a tape: highlights its compatible rack / next free slot; if
   offscreen, an arrow at the screen edge points the way. Never highlights correct shelves.
3. Misplaced Finder (35 shelved) — toggle: highlights tapes that are loose or in a wrong slot;
   already-correct tapes are never highlighted.
4. Marquee Pickup (40 shelved) — hold left mouse on empty table, draw a visible selection
   rectangle (desktop-style), release to select enclosed loose tapes (cap 5, nearest to rect
   center). Grab any selected tape to carry the group together. **Before unlock the same gesture
   must not allow batch pickup** (it pans the camera instead). Touch gets an explicit Select mode;
   marquee never shares a gesture with camera panning. Other held tapes stay close to the lead
   tape in a readable cluster; the lead obeys the cursor-accurate rule.
5. Match Scan (120 shelved) — power: click a tape, highlight other loose tapes with the same
   color **AND** symbol (blue star ≠ blue moon ≠ pink star), including offscreen matches shown
   via edge indicators + count.
6. Match Gather (200 shelved) — power: click a tape, gather the eligible loose tapes of that
   same color+symbol into the held bundle (also offscreen), excluding shelved tapes and tapes still
   awaiting repair; nothing is auto-shelved; a compact stack + count is shown.
- Powers 5 & 6 run in a ~15 s activation window with a ~60 s cooldown after expiry, shown
  clearly. Power expiry never drops already-held tapes. Timers gate only the powers.
- Acceptance: autotest exercises unlock thresholds, marquee before/after unlock, batch carry with
  partial capacity, power activation/expiry/cooldown, and held-tape preservation on expiry.

### P3 — Polish that makes it cozy

**US7. Sound & feel.** Soft UI-free soundscape: pickup tick, glide+tick on insert, gentle invalid
thud, repair gesture sounds, soft unlock chime, completion arpeggio. Variation on repeats
(pitch/gain offsets, no immediate repeats) and a master limiter.
**US8. Persistence.** localStorage save/restore of tape positions, shelved contents, completed
repairs, skill unlocks, power states; New Game confirmation; seed replay for debugging.
**US9. Warm retro art.** Wood table, 8 shell colors × 8 printed symbols, cream labels, wooden
racks with color+symbol headers, bench mat, small props (lamp, radio, plant) — all procedural.

## Constraints

- Runs in the Z.ai sandbox preview (Next.js 16 host, client-only canvas, port 3000).
- Keyboard, mouse and (simulated) touch input must all work.
- Accessibility: reduced motion/effects toggles (shake-free by design), color never the only cue.
