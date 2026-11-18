# Tidy Tapes — Tasks (tasks.md) — v4 full-board art + hover rollout

Baseline verified first (unit 14/14; suite 20/28 with the 8 failures probed manually and confirmed
environment artifacts — see spec.md). Checkpoints: **C1 planning → C2 cassettes → C3 board →
C4 delivery**, each committed and pushed to `tidy-tapes`.

## C1 — Planning + baseline (this push)
- [x] Inspect project/branch/commit; extract handoff ZIP; read layout PNG, layer-layout.json, all art SVGs
- [x] Verify baseline: unit tests 14/14; suite on the rebuilt standalone build (port 3100); manual probes for the 8 flakes
- [x] spec.md / plan.md / tasks.md / review.md rewritten for the full-board rollout

## C2 — Cassette template, every tape (F1)
- [x] cassetteArt.ts: port loose/turn/spine SVG geometry to canvas bakes (bounds computed from paths + matrices)
- [x] Bake 32× loose (`tape-face-N`), 32× turn (`tape-turn-N`), 32× spine (`spine-N`); legacy look under `legacy-*`
- [x] poses.ts: toggle-driven specs, geometry identical in both modes; DragController: turn for all units, pilot special cases removed
- [x] Check: boot renders; insert/remove ×3 keeps exact loose size; tray + repair face show new art; screenshot spot check

## C3 — Cabinets, background, hover everywhere (F2 art + F3)
- [x] config.ts: uniform compact geometry (unit 12 revert, right bank 220 pitch); ART_PILOT trimmed to lamp/light consts
- [x] textures.ts: new unit-body/unit-lips (same slot constants) + new wood tile; legacy under `legacy-*`
- [x] GameScene: delete pilot inlay/seams/rim; single buildUnit path; contact shadows under every cabinet; board-wide lighting rebuild
- [x] nudge.ts: region gate removed (hash all loose tapes; guards kept)
- [x] UIScene: toggle label + help copy updated
- [x] Check: no visible art boundary anywhere; before/after toggle swaps textures but not geometry; nudge in ≥2 corners; drag suppresses nudge

## C4 — Tools, tests, delivery (F2 tools + F4)
- [x] tool-pencil + tool-tweezers re-baked in reference materials (keys/origins/gestures unchanged)
- [x] autotest.ts: T13c full-board rewrite, T13b viewport-robust, T13d retarget + second corner; gentle settle windows
- [x] Full suite re-run (phase 1 + phase 2 restore) + unit tests
- [x] Screenshots: fit board, 2 far-apart close-ups, cabinet before/after same zoom, insert/remove frames, tools in action
- [x] Old-save load check (v3 save from before the geometry revert)
- [x] README refresh; final push to `tidy-tapes`; delivery report (automated vs manual, tested vs not)
