# Tidy Tapes — starter art pack

Use this pack to build one playable **2.5D art test corner** in the existing Phaser 3.90 game. The PNGs are real runtime art, not screenshots. This first pack contains one cassette design (teal star), one four-row cabinet, a tabletop surface and rim, and warm lamp lighting. It is not a finished reskin or a replacement for the v3 playtest-fixes prompt.

## Files

| Path | Use |
| --- | --- |
| `art/cassette-teal-star.png` + `.json` | Transparent Phaser atlas. Frame keys `loose`, `turn`, and `spine`. |
| `art/cabinet-walnut.png` + `.json` | Transparent four-row cabinet atlas. Frame `body` plus four separately addressable foreground strips, `lip-1` through `lip-4`. |
| `art/walnut-tile.png` | Opaque horizontal-grain tabletop swatch. Repeat or mirror alternate tiles if a seam is noticeable at close zoom. |
| `art/table-rim.png` + `.json` | Transparent wooden trim with frame key `rim`. Use it along the exposed table edge, not across the playable surface. |
| `art/lamp-brass.png` + `.json` | Transparent brass lamp with frame key `lamp`. The lit bulb is part of the prop, but the glow around it is separate. |
| `art/lamp-pool.svg`, `art/bulb-halo.svg`, `art/contact-shadow.svg` | Reusable transparent lighting layers. Stretch or scale the pool and the contact shadow independently to fit the world. |
| `scene-layout.json` | Suggested cassette pivots, rack lip placement offsets, slot-seat positions, and lighting defaults. These are visual coordinates, not new puzzle rules. |
| `references/` | Mockups for the finished look. Do not load these as game textures. |

For the atlas pairs, keep the PNG and JSON together. The atlas rectangles already select the individual poses and lip layers, so there is no need to crop the source art by hand. Every PNG has its original pixel dimensions. Use display dimensions to fit the game, rather than resizing the source atlas independently of its JSON.

## First integration pass for GLM

1. Preserve the existing Phaser logic, saves, board, zoom, camera, and controls. Do not replace the map or alter snap distances just to fit the image files. For a Next.js build, copy `art/` into `public/tidy-art/` and use the project's actual static-asset base path (including a deployment subpath if applicable).
2. Load the PNG/JSON pairs with `this.load.atlas()`, the walnut with `this.load.image()`, and the glow/shadow SVGs with `this.load.svg()`. Start with one cabinet and a few teal star tapes. Keep old art as the fallback for other colors and symbols until the pilot is approved.
3. Draw the cabinet body, then the stored/inserting cassette sprites, then its four foreground lips. The lips are already present in the full body art, but the additional foreground draw is what masks the lower part of each moving tape. Place the lip frames at the supplied offsets relative to the body's top-left, with the exact same scale as the body. Calculate the slot centers from the existing slot count. Keep label chips, dividers if needed, and hit areas in code.
4. Place a `loose` cassette at the existing loose footprint, then briefly show `turn` as it aligns to an open slot and `spine` during the final slide behind the lip. Map the moving pose's anchor to the same position along the path so the frame change does not jump. Avoid scaling every art frame to the same width. Store each pose's intended display dimensions explicitly, and reset size, origin, and hit area whenever the cassette is extracted back to `loose`. Test a fresh and a removed tape next to each other at the same zoom.
5. Put the lamp at the upper-left of the test corner and anchor its amber pool just down and right of the shade in **world space**. Use the small halo at the bulb and a subtle low-alpha pool on the wood. Add close soft contact shadows under rack/tape bases, nudged slightly down-right. Keep the existing HUD outside the lighting stack, and the labels and symbols readable. Start with normal blending or a restrained additive fill. Do not add a screen-wide orange filter. This pack does not require normal maps, dynamic shadows, or a new renderer.
6. Return a same-zoom before/after of this corner and a short insertion-and-removal clip. Check that the tape feels solid when loose, turns without a jump, seats behind the lip, and returns to the original size. Check the look while panning and zooming and check that the lamp doesn't drift with the camera. Do not roll the new art across the whole board until the look and interaction are approved.

## Keeping the style consistent later

Treat the teal star shell and its poses as the master design. Once approved, recolor the shell and swap a separate symbol overlay while preserving the cream labels, wood color, and dark reel window. Do not tint the entire teal-star atlas for the final set, since that changes every material at once. Do not use the symbols or number of objects in the art references as validation rules for the game.
