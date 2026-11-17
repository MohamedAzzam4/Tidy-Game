# Tide & Tidy — design notes

Research → decisions → implementation, in one page. Written at build time so
the "why" survives contact with future edits (ponytail: comment the why the
code cannot show).

## 1. The brief

Make a game with the same mechanics as [Filing Good: Tidy Up (demo)](https://inglobrio.itch.io/filing-good-tidy-up-demo)
but "not the identical twin" — different shapes, a skill system, random
generation, ASMR-grade sound, "addictive based on science", 2D. Learn from what
the demo's players said.

## 2. What the original is (verified from its itch page)

Two-stage nesting sort: drag sheets into their matching binder (symbol +
number), then binders into shelf slots (symbol). No fail state, no pressure,
mistakes only pointed out. Hand-drawn cold office, ~30 min demo (4×4 shelf, 128
binders, 768 sheets), shareable "game codes" that reproduce the same mess,
music toggle. 4.7/5 from 20 ratings.

## 3. What players said → what we shipped

| Source | Said | Shipped |
| --- | --- | --- |
| Luisak (itch comment) | wants multi-sheet carry, more capacity, "possibly add upgrades" | Skill system with Both Paws (carry 3) + Slipstream (+1); XP persists across tides |
| JavaJack (itch comment) | "needs more fanfare for completion"; likes lore drops | Seal pops with sparkle arpeggios; finale fanfare + wave wash + stats + final bottle; 16 lore lines, one every 5th shelved jar |
| JavaJack | hand cramps from mouse use | Magnetic snapping, generous hit radii, and double-click/double-tap auto-flight — click-only play; WASD/wheel/pinch camera |
| beetroots_beans | "shut my brain up", 1 h 8 m session | No fail state; mistakes are soft muted blips; toggleable generative music + ocean (podcast-friendly, mirrors the demo's music toggle) |
| Inglobrio (dev reply) | ending needs more reward | Finale overlay: fanfare, stats card, best time, XP that rolls into the next tide |
| several | "can't wait for the full game" | Three tide sizes up to Undertow (432 critters), infinite random variation |

## 4. Same mechanics, different shapes

sheet → binder → shelf slot becomes **critter → specimen jar → ledger cubby**:

- Critter carries species (shape + hue) and jar tag (its binder's number).
- Jar seals when full (lid pop), then carries to the cubby showing that
  species.
- Shape language deliberately organic: five-point starfish, spiralling moon
  shells, pulsing jellies, scuttling hermit crabs, spiky urchins — all drawn
  procedurally with per-frame wobble (hand-drawn feel, no image assets).
- Setting swaps the cold office for a dusk beach: warm sand, animated foam,
  lantern glow, a driftwood ledger wall.

## 5. Random generation

Seeded Mulberry32 (same primitive the repo used before). A tide code is
`scale letter + seed(base36)`; `generateWorld(seed, scale)` derives species
subset, jar/critter assignment, ~4 % golden pearls, scatter positions (rejection
sampling → relaxed ladder → jittered-grid fallback, always in-bounds) and even
the pebble/shell/lantern decor. Untrusted codes are validated (regex + uint32
range) and fall back to a fresh random tide — same trust-boundary discipline as
the repo's earlier `parseSeedParam`.

Scales: Drift 2×2×3 jars ×4 = 48 critters · Ebb 3×2×5×5 = 150 · Undertow 3×3×8×6
= 432 (the demo's "Relaxed" is 768; Undertow keeps the spirit at browser-safe
costs).

## 6. Sound (all synthesized, Web Audio)

- Master chain: compressor → destination; a two-delay feedback "cozy space"
  reverb send; every repeated sound gets ±4 cents random detune to resist
  habituation.
- **The hook:** filing plays a water plop (pitch glide f×1.4→f + splash noise)
  whose f walks UP a C-pentatonic ladder with the jar's fill index — filling a
  jar is a little ascending melody. Seal = cork pop + sparkle arpeggio; shelve
  = wooden thunk + warm add9 chord; streak milestone every 5 = two-note chime;
  golden pearl = harp gliss; finale = 8-note run → full chord → 2.4 s wave wash.
- Ambience: two LFO-swelled noise layers (deep swell 11 s, foam hiss 7 s) +
  sparse distant gulls. Music: soft 4-chord pad loop with sparse pentatonic
  plucks, separately toggleable (M / N).
- Mistakes: two soft descending sines — feedback, never punishment.
- Everything guarded; audio is decorative and must never break the game (the
  repo's existing audio-module discipline). `sfxLogSnapshot()` keeps it
  observable.

## 7. "Addictive based on science" — the honest list

- **Variable-ratio reward:** golden pearls (~1 in 25) worth 10 XP with a
  jackpot sound — the slot-machine schedule that resists extinction longest.
- **Loss aversion, sized for a zen game:** streaks escalate milestone chimes;
  a wrong filing resets the streak (and counts one "gentle mistake") but never
  destroys progress or items.
- **Zeigarnik effect:** jar pips, cubby counts (n/3), per-jar fill melodies and
  the two big progress bars keep loops visibly unfinished.
- **Flow ramp:** three scales, no timers; challenge comes from search space,
  not pressure.
- **Micro-celebrations:** every seal/shelve pops, bursts and chimes — small
  frequent dopamine hits between the big ones.
- **Collection/endowment:** lore bottles accumulate; XP/levels persist
  (localStorage) so returning players start stronger — the "one more tide" pull.

No dark patterns: no timers, no loss of items, no urgency mechanics.

## 8. Architecture (ponytail-shaped)

Pure logic in `src/game/` (types, worldgen, model, skills — no DOM, 31 vitest
tests), presentation in `src/view/` (render, audio, gameView), bootstrap in
`src/main.ts`. The model emits typed events; view/audio consume them — rules
never know about pixels or sound. No runtime dependencies; the platform
provides canvas, audio and storage.

## 9. Skipped / risks

- No mobile-specific gesture tuning beyond pointer events + pinch-free tap
  (two-finger pinch zoom is NOT implemented; wheel/buttons cover zoom).
- Audio can't be asserted in headless CI beyond the guarded call path; tune
  volumes by ear on real speakers.
- Undertow's 432 wiggling critters are culled by viewport but unprofiled on
  low-end devices.
