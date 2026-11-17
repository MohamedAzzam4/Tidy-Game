# TIDEKEEPER — a bioluminescent tidy-up ritual

The grotto tide has scattered the glowing plankton motes. File every mote into
its glass bell, and every bell into its stone niche. Nothing here can hurt
you. The abyss is patient.

**Play:** https://mohamedazzam4.github.io/Tidy-Game/ (this `tidekeeper` branch
deploys itself via GitHub Actions — `main` is untouched and still holds
Cozy Corner).

---

## Same mechanics, different ocean

TIDEKEEPER is built on the same two-tier filing loop as *Filing Good: Tidy Up*
(demo) by [Inglobrio](https://inglobrio.itch.io/filing-good-tidy-up-demo) —
but it is not its identical twin:

| Filing Good | TIDEKEEPER |
| --- | --- |
| Sheets with a symbol + number | Motes with a species glyph + number of pips |
| Binders (same symbol, same number) | Glass bells (same glyph, same pips) |
| Shelf slots grouped by symbol | Stone niches engraved with glyph + pips |
| Cold, quiet office | A warm, glowing abyss |
| Hand-drawn paper, Soundsnap SFX | Everything drawn and *synthesized* in code |
| "No upgrades, no powers" (by design) | Gentle assist skills, if you want them (by request) |
| Share codes for the same mess | `TIDE-XXXX` codes — same code, same grotto, byte-identical |
| You can't lose; mistakes are only pointed out | Same. Wrong drops bounce with a soft *pumf* |

## What players asked for (and what I did about it)

Read directly from the itch.io comment threads on the Filing Good demo:

| Player said | TIDEKEEPER's answer |
| --- | --- |
| *"use your hand to move several sheets to the side… to see the cards below"* — Luisak | Motes **shy away from your cursor**, so anything buried drifts into view; the Riptide attunement scatters a whole clump on demand |
| *"a way to increase the amount I can hold"* — Luisak | The **Double Sip** attunement: carry two motes at once |
| *"my mouse hand is a bit cramped up"* — JavaJack | **Tap-to-carry** (pick up with a tap, place with a tap — hands-free), generous 40 px grab radius, and the Cradle attunement widens the snap tolerance by 60% |
| *"it needs WAY more fanfare for completion"* — JavaJack | **The Bloom**: every bell ignites in an ascending chime cascade, the whole wall glows, a pad swells, champagne bubbles rise — then the stat card |
| *"worked out a system… this shut my brain up"* — beetroots_beans, sp00pyw00py | Kept sacred: no timer, no fail state, no punishment. Only the pentatonic ladder and the pile |

## Attunements (the skill system)

Pearls come from filing well (motes +1, full bells +3, seated niches +5,
Lumen motes +3). Keeper Rank rises with XP and pays +20 pearls each rank.
Equip **2 passives + 1 active**:

| Skill | Kind | Cost | Effect |
| --- | --- | --- | --- |
| Cradle | passive | 40 | +60% snap tolerance when filing |
| Lantern Hand | passive | 60 | the held mote's matching bell glows |
| Tide Sense | passive | 80 | unfilled bells breathe with a slow pulse |
| Double Sip | passive | 120 | carry two motes at once |
| Echo Pulse | active | 60 | sonar lines connect every bell to its nearest matching mote for 4s (14s cooldown) |
| Riptide | active | 100 | a current swirls the pile apart, uncovering buried motes (18s cooldown) |

Progress lives in `localStorage` (`tidekeeper.save.v1`) — 3 slots were never
asked for, so there is one tide-pouch.

## Why it feels good (the honest science)

No dark patterns — only the mechanics that make tidy-up games satisfying:

- **Immediate multi-sensory feedback (< 80 ms).** Every pickup, filing and
  seat fires its sound the instant the pointer moves; synthesized voices start
  on `pointerdown`, not release.
- **The streak ladder.** Consecutive correct filings ring one step higher up a
  C-pentatonic scale — the Tetris/Balatro "rising pitch" mastery signal. A
  wrong drop only softens the ladder; nothing is taken.
- **Variable-ratio reward.** ~1 in 14 motes is a prismatic **Lumen** (the same
  schedule that keeps slot machines — and loot drops — compelling), but the
  jackpot is extra pearls and a sparkle arpeggio, never a gate.
- **Goal-gradient glow.** Bells brighten as they fill; the wall ignites niche
  by niche during the Bloom. Visible near-completion pulls harder than
  abstractions.
- **Zeigarnik pull.** The title's tide log always shows the last expedition
  and the count so far — the next `TIDE-XXXX` is right there, one tap away.
- **Endowment boost.** Expeditions are short (8–18 bells, 3–6 minutes) and the
  next one is always a single tap — "one more tide" is the whole menu.
- **Flow ramp.** Species 4→8, pips 2→4, capacity 4→6 across expeditions,
  capped so the wall stays readable (tested in `tests/run.mjs`).

## The sound (all synthesized, zero audio files)

Web Audio only: a brown-noise water bed with a slow-breathing LFO, a detuned
pad a fifth apart, random bubble pops that quicken with your streak, and every
event voiced through glass partials (1 : 2.76 : 5.4, real bell ratios) into a
generated 2.2 s cave reverb. Master / music / SFX sliders, mute with `M`.

## Controls

- **Drag** a mote over its bell (same glyph, same pips), or **tap** it and tap
  the bell to play hands-free. Right-click / `Esc` puts a held mote down.
- Drag **full bells** to their engraved niche on the wall.
- `E` uses your equipped active attunement, `M` mutes.
- Phone: landscape recommended (the world letterboxes to keep shared codes
  identical on every screen).

## Tech (ponytail rules)

Zero dependencies, no build step, no engine: vanilla ES modules, Canvas 2D,
Web Audio, Pointer Events, `localStorage`. The only risky logic — the seeded
RNG, share-code codec, generation invariants (every mote matches exactly one
bell, bells ↔ niches bijection, capacity conservation, hue legibility, bell
count cap) and the pearl economy — ships with tests:

```bash
npm install -g agent-browser  # only if you want the browser smoke test
npm test                      # node tests/run.mjs — 68 assertions
python3 -m http.server 8080   # then open http://localhost:8080
```

`AGENTS.md` in this repo is [ponytail](https://github.com/DietrichGebert/ponytail)
copied verbatim — the "laziest senior dev" rules this project was planned and
implemented under: platform features over libraries, smallest complete change,
a test for every risky branch, and a note about what was skipped (see below).

## Credits

- *Filing Good: Tidy Up (demo)* by **Inglobrio** — the two-tier filing loop,
  the no-fail philosophy and the share-code idea are theirs; the ocean is
  mine. Play their demo and wishlist the full game.
- Feedback quotes from the demo's public itch.io comments (Luisak, JavaJack,
  beetroots_beans, sp00pyw00py, dekusfreckle, cheesedarat).
- [ponytail](https://github.com/DietrichGebert/ponytail) by Dietrich Gebert —
  planning and implementation discipline (MIT).
- Fonts: Fraunces & Nunito via Google Fonts (system-fallback safe).

*Skipped and not checked (ponytail signature): no persistence migrations, no
mid-expedition save-resume, no screen-reader support beyond button labels, and
portrait-mobile hit targets are small — landscape is the recommended phone
posture. Everything else in this README is exercised by the tests or the
browser smoke test.*
