# Tide & Tidy

*Jar the shore. Shelve the tide.*

A calm, randomly generated 2D tidy-up game for the browser — built with Vite +
vanilla TypeScript, rendered on Canvas 2D, sounded entirely by procedural Web
Audio. Zero runtime dependencies, zero downloaded assets.

**Play:** pick a tide size, then sort. Every critter wears its species and a jar
number — drop it into that exact jar. A full jar pops its lid; carry it to the
ledger niche with the same species picture. Fill every niche to complete the
tide. There is no way to lose and no timer.

Every run is generated from a **tide code** (`?tide=e1k4x9`) — share the code
and a friend sorts the exact same shore. New tide → new random code.

## Mechanics map (same loop, different shapes)

The mechanics intentionally mirror [Filing Good: Tidy Up (demo)](https://inglobrio.itch.io/filing-good-tidy-up-demo)
two-stage nesting, while swapping the shape language from flat paper office to
a dusk beach:

| Filing Good | Tide & Tidy |
| --- | --- |
| sheet | sea critter (organic, wiggling, procedurally drawn) |
| binder (symbol + number) | specimen jar (species tag + #number) |
| shelf slot (symbol) | ledger cubby (species specimen, holds that species' jars) |
| hand-crafted archive | seeded random shore + shareable tide code |
| lore records | messages in bottles every 5th shelved jar |

## Built from the demo's community feedback

- *"ability to move multiple sheets at once, increase capacity … possibly add
  upgrades"* (Luisak) → the **skill system**: Both Paws (carry 3, +1 more with
  Slipstream) and the four other skills below, unlocked by XP that persists
  across tides.
- *"needs more fanfare for completion"* (JavaJack) → per-jar seal pops with
  sparkle arpeggios, a species-done burst, and a real finale fanfare with a
  wave wash + stats + a last bottled message.
- *"hand cramps from mouse use"* (JavaJack) → generous magnetic snapping and
  **double-click / double-tap sends anything home by itself** — the whole game
  is playable click-only; dragging is optional. WASD/arrows/wheel/pinch to move.
- *"likes the lore drops"* (JavaJack) → 16 bottle messages, one every 5th jar
  shelved and at the finale.
- *"ending needs more reward"* (the dev's own admission) → finale with fanfare,
  stats card, best-time tracking, and XP that carries into the next tide.
- *"shut my brain up"* (beetroots_beans) → no fail state, mistakes are soft
  muted blips that only reset a streak; generative pad + ocean ambience both
  toggleable (M / N) so podcast listeners can keep the ocean only.

## The skill system

XP comes from filing (+1), golden pearls (+10), sealing (+5), shelving (+3),
completing a tide (+50). Unlocks persist in `localStorage`:

| Level | Skill | Kind | Effect |
| --- | --- | --- | --- |
| 1 | Both Paws | passive | carry up to 3 critters |
| 2 | Moonlight | active (30 s) | glowing threads from every critter to its jar |
| 3 | Tide Pull | active (45 s) | instantly file up to 3 loose critters |
| 4 | Gull's Eye | active (60 s) | everything highlighted for 12 s |
| 5 | Slipstream | passive | double-click flights 1.6× faster, +1 carry |

## Why it feels the way it feels

The sound carries the reward loop: each filing plays a water plop pitched UP a
pentatonic ladder with the jar's fill level (a jar fills as an ascending
melody), streak milestones chime every 5, golden pearls (1 in 25) get a harp
gliss — a variable-ratio reward. Progress bars, pips and counters keep every
loop visibly unfinished (Zeigarnik pull), and the difficulty scales from Drift
(48 critters) to Undertow (432) as a flow ramp. Details in
[docs/tide-and-tidy-design.md](docs/tide-and-tidy-design.md).

## Development

```bash
npm install
npm run dev        # vite dev server on :3000
npm test           # vitest — worldgen, model rules, skills/persistence
npm run build      # tsc --noEmit && vite build → dist/
npm run preview    # serve dist on :4173
```

Layout: pure game logic in `src/game/` (worldgen, model, skills — no DOM, fully
tested), presentation in `src/view/` (canvas renderer, Web Audio engine, input,
camera), bootstrap in `src/main.ts`. `AGENTS.md` pins the ponytail discipline
for anyone (human or agent) extending this.

## Deploy

`main` builds via GitHub Actions → GitHub Pages. This branch holds Tide & Tidy;
merge it into `main` to publish (the deploy trigger in
`.github/workflows/deploy.yml` was corrupted — `branches: ain]` — and is fixed
here to `[main]`).

> The repo's `main` branch still holds the earlier Cozy Corner prototype and
> its docs; nothing there was modified.
