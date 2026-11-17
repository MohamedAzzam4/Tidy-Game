# Tidy Tapes — cozy cassette sorting shop (v2)

A relaxed, gentle three-quarter 2.5D Phaser 3 cassette-shop game. One big
scrollable worktable (2800×1800 world) holds **432 individually movable tapes**
(seed-varied, always ≥ 400); each tape matches by BOTH shell color and printed
symbol, and every group has **two identical matching rows** — either is equally
correct. Tapes slot into ANY row with room: a wrong row is accepted without a
peep, and only the ✓ verify button, the Misfile Finder power, or the end-of-job
check will tell you. No timer, no fail state — power cooldowns gate only the
powers themselves.

- **Engine**: Phaser 3.90.0 (pinned), no physics engine, no backend; hosted in a
  Next.js 16 client-only canvas. All art is procedural (canvas textures, angled
  with baked extrusions, rim lights and contact shadows); all audio is
  synthesized (WebAudio, no files).
- **Run**: `bun install && bun run dev` → http://localhost:3000
  (`?seed=123` replays a specific world; `?autotest=1` runs the in-page
  acceptance suite — results appear in `window.__tidyResults` and an overlay).
- **Tests**: `bun test src/game/__tests__/` (14 unit tests incl. a 200-seed
  generation/validation sweep) + the **20-test browser autotest** (green).

## The v2 follow-up in one breath

A fixed cozy 2.5D angle (axis-aligned, extruded front faces, contact shadows —
no diamond grid), compact rack banks (16 wooden organizers × 4 labeled rows,
edge-on book-style spines behind slot lips), a busy center-first board
(8 colors × 4 symbols = 32 groups × 2 matching rows × 8 slots; counts derive
from row capacity), cursor-anchored wheel zoom with +/−/fit, a five-slot
**carry tray**, hidden misfiling with silent acceptance, the Magnetic Tuck
insertion sound (shff + tuk-at-seat), the Tiny Chime reserved for explicit
verification, short tactile repairs (paint is optional cosmetic), seeded
generation with center-density validation, and save-v2 with a v1-migration
choice that keeps unlocked skills.

## How to play

Sort by BOTH shell color and printed symbol. Each group's two rows are labeled
with a color chip + symbol; either row is correct. A tape physically fits any
row with room — mistakes are silent, so use ✓ on an organizer (Tiny Chime only
when it verifies clean), the Misfile Finder power, or the end-of-job check.
Pull a shelved tape back out any time by dragging its spine. Damaged tapes
(torn sticker, spilled ribbon) need the Repair Bench first; scuffed shells
are purely cosmetic (optional marker touch-up):

- **Rewind**: hold the pencil on the right reel and wind in circular strokes
  until the loose ribbon returns to its guides.
- **Sticker swap**: peel the torn sticker off with the tweezers, wipe the
  sticky residue, drag the fresh sticker of the **same symbol** to the same
  spot and press it down.
- **Paint touch-up**: rub the matching marker over the faded patch — the
  original color shows through the stroke (optional; doesn't block sorting).

### Controls

| Input | Action |
| --- | --- |
| left-drag on a tape | pick it up (the exact grab point stays under the cursor) |
| left-drag on empty table | marquee select (after the skill unlocks); pans before that |
| mouse wheel | smooth zoom, centered on the cursor |
| + / − / fit | zoom buttons (fit shows the whole table); Q/E, +/− keys too |
| Space + drag, right-drag, WASD/arrows | pan the camera (works while carrying tapes) |
| drop onto the carry tray | load a tape into a free slot (bottom-right) |
| drag a tray slot | take that tape back out |
| drag the tray header onto a row | batch-file everything that fits |
| drag a seated spine | pull it back out and re-file |
| Esc | cancel a drag (everything returns) |
| D / M / S / G | defect scanner / misfile finder / match scan / match gather |
| F | fit-to-table |
| touch | one finger pans empty table; two fingers pinch-zoom + pan; Select mode toggle for touch marquee |

### Skills (unlock by shelving; powers show 15 s active / 60 s cooldown)

1. **Defect Scanner** (10) — toggle: highlights tapes that need repair.
2. **Slot Guide** (20) — click a tape: BOTH of its rows light up (offscreen arrows).
3. **Misfile Finder** (35) — power: reveals tapes sitting in wrong rows.
4. **Marquee Pickup** (40) — desktop-style box selection, group carry, tray loading.
5. **Match Scan** (120) — power: highlights the same color + symbol, offscreen arrows + count.
6. **Match Gather** (200) — power: one click loads matching loose tapes into free tray slots only.

Powers never drop held tapes when they expire. The Tiny Chime plays ONLY when
you verify an organizer (✓) or complete the verified job — never for a plain
insertion or a filled row. The Magnetic Tuck (soft descending shff, then a
muted plastic tuk exactly at the seat) plays on every accepted insertion;
audition both from the help panel's **sound check**.

## Verification (what actually ran)

- `bun test src/game/__tests__/` — 14/14 (determinism, ≥400 tapes, group counts
  ≤ 2×8 capacity, two rows per group in different units, center-density across
  seeds, defect mix, save roundtrip + tamper rejection).
- `?autotest=1` browser suite — **20/20**, driving real DOM mouse/touch/wheel/
  key events: grab-point through pan/zoom/resize, wheel-zoom anchoring, cancel
  safety, tuck/tuk timing + no chime on plain inserts, **misfile accepted with
  no tell** (no hint event, no special sound), pull-out + re-file, marquee
  lock/unlock with 5-batch into 3 free slots (leftovers visible), tray
  load/drag-out/batch partial-fit/full-refusal, three repairs via real
  gestures, save + reload restore (incl. tray), powers with timers and
  expiry-keeps-held, one-finger pan + pinch zoom, and the win policy
  (full-but-misfiled board does NOT win; the fixed board completes + chimes).
- agent-browser E2E + screenshots (VLM-inspected): wide board with a populated
  center, edge-on storage close-up, repair close-up, left bank.

**Not verifiable in this sandbox**: audible loudness (headless browser has no
ears — audio is parameter/scheduling-verified and auditionable in-game), and
real-device touch (touch is simulated via synthetic TouchEvents).
