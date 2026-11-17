# Tidy Tapes — cozy cassette sorting shop

A relaxed, top-down Phaser 3 cassette-shop game. One big, scrollable worktable
(4400×3000 world) holds **512 individually movable tapes**; match each by BOTH
shell color and printed symbol, slot it into its wooden rack (stored edge-on,
spine out), and repair the occasional defective tape at the bench. No timer,
no fail state — power cooldowns gate only the powers themselves.

- **Engine**: Phaser 3.90.0 (pinned), no physics engine, no backend; hosted in a
  Next.js 16 client-only canvas. All art is procedural (canvas textures); all
  audio is synthesized (WebAudio, no files).
- **Run**: `bun install && bun run dev` → http://localhost:3000
  (`?seed=123` replays a specific world; `?autotest=1` runs the in-page
  acceptance suite — results appear in `window.__tidyResults` and an overlay).
- **Tests**: `bunx vitest run src/game/__tests__/` (13 unit tests incl. a
  200-seed generation/validation sweep) + the 17-test browser autotest.

## How to play

Drag a tape — the exact grab point stays under your cursor. Drop it on the rack
whose header shows the same **color chip + symbol** (racks sit in an 8×8 grid:
symbol = column, color = row) and watch it turn edge-on and glide into its slot
with a soft plastic slide sound. Defective tapes (torn symbol sticker, spilled
ribbon, bleached shell) can't be shelved until repaired — drop one on the
**Repair Bench** (far left) or **double-click** it:

- **Rewind**: hold the pencil on the right reel and wind in circular strokes
  until the loose ribbon returns to its guides.
- **Sticker swap**: peel the torn sticker with the tweezers, wipe the sticky
  residue, drag the fresh sticker of the **same symbol** to the same spot and
  press it down.
- **Paint touch-up**: rub the matching marker over the faded patch — the
  original color shows through the stroke.

### Controls

| Input | Action |
| --- | --- |
| left-drag on a tape | pick it up (exact grab point) |
| left-drag on empty table | marquee select (**after** the skill unlocks); pans the camera before that |
| right-drag / wheel / trackpad / WASD / arrows | pan the big table (works while holding tapes) |
| Q/E or +/− (or HUD buttons) | zoom 0.55–1.6 |
| Esc | cancel a drag (tapes return to where they were) |
| touch: two-finger drag | pan (never conflicts with drag/selection) |
| touch: mode toggle | explicit Select mode for the marquee |
| D / M | toggle Defect Scanner / Misplaced Finder |
| S / G | activate Match Scan / Match Gather powers |

### Skills (unlocked by shelving; chips in the HUD)

1. **Defect Scanner** (10) — highlight tapes that need repair.
2. **Slot Guide** (20) — click a tape: its rack/next free slot lights up; an
   edge arrow points when offscreen.
3. **Misplaced Finder** (35) — highlight loose tapes; correct shelves never lit.
4. **Marquee Pickup** (40) — drag a box on the table to select up to 5 loose
   tapes; grab any selected tape to carry the group. Batch drops stagger — extra
   incompatible tapes land visibly beside the rack.
5. **Match Scan** (120, power) — click a tape: highlights loose tapes with the
   same color **AND** symbol (offscreen ones get arrows + a count).
6. **Match Gather** (200, power) — click a tape: gathers its eligible loose
   matches into a held bundle; never auto-shelves.

Powers run ~15 s with a ~60 s cooldown; expiring a power never drops held tapes.

Progress (positions, repairs, rack contents, skill unlocks) saves to
localStorage and restores on reload. **New Game** reshuffles with a fresh seed.

## Verification (what was actually tested)

- **Unit (vitest, 13 tests)**: RNG determinism + stream isolation; 200-seed
  sweep — 512 tapes, unique IDs, per-combo demand ≤ capacity, no inaccessible
  starts (bounds/rack/bench overlap/coverage), defects all solvable types;
  save roundtrip + corrupted-payload rejection.
- **Browser autotest (17/17 passed, real DOM mouse/touch/keyboard/wheel events
  through Phaser's pipeline)**: world & camera checks; grab-point accuracy
  including camera pan mid-drag, zoom 0.7 and viewport resize; invalid-drop
  safety (no silent accept/loss/duplication, no insertion sound); valid insert
  (slide + glide/tick scheduling); marquee locked vs unlocked (select 5, carry
  together, drop on a row with 3 free slots → 3 enter, 2 remain available);
  all three repairs completed via real gestures and sortable afterwards; repair
  cancel; save → reload → restore of positions/repairs/racks/skills; powers
  (activation, exact color+symbol matching, expiry preserving held tapes,
  cooldown); skill toggles; two-finger touch pan; completion state.
- **Not tested / honest limits**: audio loudness was verified by construction
  (bus gain values, ±1-semitone/±2 dB variation, limiter, batch ducking +
  90 ms stagger) — a headless browser cannot *audibly* verify sound; touch was
  verified with synthetic TouchEvents (no real touchscreen device); the
  autotest's marquee fixture teleports five tapes into a cluster via the debug
  API before the real marquee interaction (documented test scaffolding).

## Project layout

```
src/game/           config, rng (SplitMix64), types, worldgen, validation, save,
                    audio engine, symbols, procedural textures, debug API, autotest
src/game/scenes/    Boot (texture factory) · Game (world/camera/input) ·
                    UI (fixed HUD) · Repair (the three minigames)
src/game/controllers/ DragController (cursor-accurate drag, insert, batch)
                       SkillsController (unlocks, marquee, powers)
specs/001-tidy-tapes/  manual Spec Kit SDD: spec.md · plan.md · tasks.md · review.md
```
