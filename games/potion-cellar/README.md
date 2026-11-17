# Potion Cellar

A cozy 2D alchemist sorting game. Sort scattered glowing potions onto their matching element racks in a dim cellar. No timers, no failure state — just the soft hum of the cellar and the chime of a bottle finding its home.

Built as a single self-contained `index.html` (Canvas 2D + Web Audio API, no dependencies, no build step). Lives alongside the existing Cozy Corner game without touching its code.

---

## Why this theme (surprise factor)

The original *Filing Good: Tidy Up* sorts sheets → binders → shelves in a quiet office. **Potion Cellar** keeps the same "sort scattered objects into matching slots" loop but reskins it as alchemy:

- **Different shapes** — hand-drawn potion flasks with corks, liquid gradients, glossy highlights, and an alchemical symbol embossed on each bottle.
- **Richer sound palette** — synthesized chimes, arpeggios, drones, and brown-noise wind instead of office paper rustle.
- **Cozy + brain-off** — dark cellar, warm vignette, soft ambient drone. Preserves the "shut my brain up" relaxing quality that itch.io commenters loved about the original.

Eight elements (Fire, Water, Earth, Air, Void, Light, Shadow, Crystal) each with a distinct color and a canvas-path symbol (no emoji, no font dependency).

---

## Ponytail plan (smallest complete change)

Active rules from the ponytail SKILL:

- **No new dependencies.** Canvas 2D and Web Audio API are both browser-native. No pixi.js, no howler.js, no matter.js.
- **No build step.** A single static `index.html` works directly on GitHub Pages. Doesn't require Vite to build.
- **No backend / no asset files.** All art drawn with canvas paths, all sounds synthesized at runtime. Persistence via `localStorage`.
- **Doesn't touch existing code.** Cozy Corner's `src/`, `index.html`, `vite.config.ts`, and workflow stay untouched. The new game lives in `games/potion-cellar/`.
- **Self-checks instead of a separate test file.** Runtime `console.assert`s verify the XP curve, level-param ranges, and level-gen invariants on load (see the `selfCheck` IIFE at the bottom of the file).

### What was skipped (named per ponytail rule)

- No leaderboard / multiplayer / accounts — out of scope for a static GitHub Pages game.
- No save-slot system (the original has 3 save slots) — single `localStorage` save is enough for the prototype.
- No music loops — the ambient drone + arpeggios carry the audio without needing loop files.
- No mobile-specific layout tuning beyond CSS scaling — desktop is the primary target.
- No tutorial beyond the hint strip and overlay copy — the core loop is one drag.
- No achievements panel UI — toasts handle in-the-moment recognition; a full achievement system can come later.

### Risks the user must know

- **Web Audio requires a user gesture to start.** The game inits audio on the "Enter the cellar" button click — if the user opens the dev console and tries to call audio methods first, they'll be silent.
- **`localStorage` is per-browser, per-origin.** Wiping browser storage loses progression. No cloud backup.
- **Self-hosted file:// won't load Web Audio reliably** — serve over http(s) or open via GitHub Pages.
- **No automated tests** — runtime asserts cover the pure logic (XP curve, level params, level-gen invariants) but not the rendering or input code.

---

## Mechanics (same loop, different skin)

| Original (Filing Good) | Potion Cellar |
| --- | --- |
| Sheets scattered on office carpet | Potions scattered on cellar bench |
| Binders matching each sheet's symbol | Element racks matching each potion's element |
| Shelf slots matching each binder | Rack slots that accept any potion of their element |
| Drag sheet → binder → shelf | Drag potion → rack (one-step drop) |

Drop a potion on the correct rack → it stays, combo increments, XP awarded, sparkle burst.
Drop on wrong rack → combo resets, soft "wrong" tone, no XP lost (loss-averse framing only — protects engagement).
Drop on the bench → potion eases back to its scatter spot.

### User-feedback-driven features (from itch.io comments)

The original game's comments drove specific design choices:

- **Luisak** wished they could "use your 'hand' to move several sheets to the side." → **Multi-Grasp skill** (Lv 3) enables Shift+click multi-select and drag.
- **JavaJack** reported hand cramps. → **Keyboard shortcuts**: number keys `1`–`8` send the selected potion(s) to rack N. Also `R` for new cellar, `S` for skills, `M` mute, `Esc` close.
- **JavaJack** and the developer agreed the ending "deserves more than a dialog." → **Big completion celebration**: 6 staggered particle bursts across the screen, full I-IV-V-I fanfare, then a stats card with XP gained / time / best combo and a next-cellar preview.
- **beetroots_beans** valued that the game "shut my brain up." → **Brain-off mode**: low drone + filtered brown-noise wind ambient, dim warm vignette, no timer, no losing.

---

## Skill system — Apothecary Mastery

XP persists across runs in `localStorage`. Skill level is derived from cumulative XP via a fixed table. Skills unlock at specific levels and are read as flag-set membership by the game logic.

| Lv | Skill | Effect |
| --- | --- | --- |
| 1 | Steady Hand | (cosmetic) Potions ease into place with smoother lerp |
| 2 | Eagle Eye | Hovering a potion softly highlights its matching rack |
| 3 | Multi-Grasp | Shift+click selects multiple potions at once |
| 5 | Magnetism | Potions auto-snap when dropped near the correct rack (within 80px) |
| 7 | Resonance | Dragging near the right rack makes it glow brightly; wrong racks stay dim |
| 10 | Golden Touch | Golden potions spawn twice as often (5% → 10%) |

XP curve (cumulative): L1=100, L2=250, L3=500, L4=900, L5=1500, L6=2300, L7=3300, L8=4500, L9=6000, L10=8000.

**XP sources:**
- Correct placement: 10 XP × combo multiplier (combo capped at ×3 at streak 20)
- Golden potion: 50 XP × combo multiplier (5% spawn chance, 10% with Golden Touch)
- Level complete: 100 XP × level number + 50 XP speed bonus if under 60s

---

## Random generation

Each cellar is seeded (mulberry32 PRNG). Seeds are `Date.now()` at level start so each run is unique, but the algorithm is deterministic for a given seed — shareable seeds are possible.

```
levelParams(levelNum):
  potionCount  = clamp(8 + floor(levelNum * 1.4), 8, 28)
  elementCount = clamp(3 + floor(levelNum / 2),   3, 8)
```

Generation picks `elementCount` distinct elements from the 8, scatters `potionCount` potions (collision-free up to 30 tries each, falling back to overlap), and assigns each a random element from the chosen set. Each potion independently rolls golden status.

Difficulty scales smoothly: more potions, more elements, more racks → tighter bench space → higher cognitive load → flow channel.

---

## Sound design (Web Audio API, all synthesized)

Every sound is generated at runtime from oscillators + filters + envelopes — no audio files, no howler.js, no asset loading.

| Event | Sound |
| --- | --- |
| Pickup | Triangle pluck 520 Hz + sine 780 Hz, 80 ms exp decay |
| Hover | Sine blip 900 Hz, 40 ms |
| Drop success | Triad arpeggio (G4 → B4 → D5 → G5) ascending one note per combo step + 2200 Hz sparkle tail |
| Drop wrong | Square 150 Hz + sawtooth 110 Hz, 140 ms |
| Level complete | Full I-IV-V-I fanfare (G-B-D-G arpeggio + sustained chord + sparkle wash) |
| Apothecary level up | Triumphant I-IV-V-I in C, four-note block chords |
| Ambient (looping) | 80 Hz sine drone + filtered brown-noise wind (220 Hz lowpass) |

**Combo variable reward:** the success arpeggio extends by one scale degree every 2 combo steps — so the satisfying chord literally grows as the player keeps the streak alive. This couples auditory reward to the streak mechanic.

---

## Addictive hooks (science-grounded)

These map to well-documented behavioral mechanisms:

1. **Variable ratio reinforcement (Skinner).** Golden potions appear stochastically (~5%) and pay 5× XP. Unpredictable reward → stronger habit formation than fixed reward.
2. **Loss aversion via combo streaks.** Combo resets on wrong drop but no XP is lost — the "loss" is purely the streak, which the player feels protective over. Visible `×N` multiplier in HUD.
3. **Goal-gradient effect.** XP bar toward next skill level is always visible. Bar starts at a minimum 4% width (endowed progress effect) to lower the activation energy.
4. **Flow channel.** Difficulty scales smoothly with level — potion count and element count ramp together. No cliff jumps.
5. **Status / recognition dopamine.** Toast notifications for golden potions, level-ups, and skill unlocks.
6. **Persistent progression.** XP, best cellar level, and total sorted count survive in `localStorage`. Sunk-cost / identity investment grows across sessions.
7. **Anticipation tease.** Completion card shows "Next cellar preview: N potions · M elements" — primes the next run before the player decides.
8. **Rich audiovisual juice on every correct action.** Particle burst + ascending arpeggio + glow halo — multi-sensory dopamine release.
9. **Near-miss glow.** With Eagle Eye / Resonance, the correct rack softly glows when a potion is held — encourages precision without forcing it.
10. **Frictionless restart.** `R` starts a fresh cellar instantly. Levels are 2-4 minutes each — "just one more" is one keystroke away.
11. **Soft failure.** Wrong drops don't lose XP. The combo resets, the tone is soft, the potion eases home. Engagement-protective.
12. **Endowed progress.** XP bar fill starts at a visible minimum (4%) even at 0 XP — endowment effect lowers the perceived cost of starting.

---

## How to run

### Option A — open the file directly
Open `games/potion-cellar/index.html` in a modern browser. Web Audio needs the page to be served over http(s) or opened as a file in some browsers — if sound is silent, serve it.

### Option B — serve locally
```bash
cd games/potion-cellar
python3 -m http.server 8080
# open http://localhost:8080
```

### Option C — on GitHub Pages
Once the branch is merged (or Pages is pointed at the branch), the game is reachable at:
```
https://mohamedazzam4.github.io/Tidy-Game/games/potion-cellar/
```

---

## Controls

- **Drag** a potion onto its matching rack.
- **Shift + click** to multi-select (requires Multi-Grasp skill, Lv 3).
- **1 – 8** send the currently selected potion(s) to rack N.
- **R** start a fresh cellar.
- **S** open the skill tree.
- **M** toggle mute.
- **Esc** close the skill overlay.

---

## File layout

```
games/potion-cellar/
├── index.html      # the whole game (markup + styles + logic, ~700 lines)
└── README.md       # this file
```

Single-file architecture is deliberate: smallest complete change that fits the repo without touching the existing Vite + Cozy Corner setup.
