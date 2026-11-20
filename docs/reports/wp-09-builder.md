# WP-09 builder report: gauntlet behaviour and the spark

On the desk the gauntlet is the pointer over the board and a spark is the pointer everywhere else; the handover runs both ways and reverses smoothly. The true pointer still decides hover and clicks. All checks ran on the real GPU (ANGLE Metal, Apple M2), 1440 × 900.

Acceptance: **10 / 10 PASS**. Self-check: `node scripts/test.cjs` passes; `npm run test:unit` 131/131 (spark tests in `unit/gauntlet.test.mjs`); `node tools/wp09-check.cjs all` 27/27 on the final build, plus `tour` 3/3 and `switch` 2/2 added afterwards. No parity/golden run this session (as asked); the help switch is a `<label>`, so P34's seven help paragraphs are unchanged (checked).

## Files

- New: `src/gauntlet/controller.js` (zones, follow and catch-up, lean, pose machine, stretch, wall and watch, handover, hold/pinch, touch, window leave, spark light, runes, impact bob, breeze, help switch, `__vc.cursor`), `src/gauntlet/spark.js` (core, halo, flicker, trail, embers, click ring, hover, caret, crackle), `src/gauntlet/cursor.css`; `tools/wp09-check.cjs`; `docs/explained/wp-09.md`.
- Changed: `src/board/index.js` (`knobWorld(i)`, `held()`, `heldVelocity()`, `setRuneGlow()`; the pointer's stand-in breeze writer removed), `src/scene/stage.js` (controller wiring; the spark light is no longer parked under the pointer by the stage; CSS3D objects keep text selectable), `src/config/motion.js` (WP-09 builder values, `spark.flightArcCm`), `src/config/render.js` (spark light height and intensity).
- Untouched: `../valheim-checkup`, `src/core.js`, `src/catalog.json`, `src/app.js`, `checker-reports/`, `parity.spec.js`, `golden.spec.js`, the census tests. No save was loaded in any WP-09 check.

## Acceptance items

| # | Item | Result | Evidence (`node tools/wp09-check.cjs <mode>`) |
|---|---|---|---|
| 1 | Mode changes exactly at the zone border with hysteresis; no flicker on the border | **PASS** | `zone`: walking across the board's right border in 0.05 cm steps → one switch each way, out at x −14.7, back at −15.3 (border −15 ± 0.3); jittering ±0.2 cm on the border for 1 s → 0 switches. `#desk` cursor is `none`. |
| 2 | Handover timings within ±15%, both directions; reversing never jumps | **PASS** | `handover`: leaving: `visor:open` 0 ms, cap open 169 ms (180), `spark:out` 116 ms (120), spark on the pointer 268 ms (280). Returning: `spark:in` 133 ms (140), `visor:close` 133 ms (140), cap closed 271 ms (280). Out → back after 100 ms → out after 90 ms: largest per-frame step 0.12 (one frame at the fastest rate), 3 reversals. |
| 3 | After any spark flight the spark is within 0.5 px of the true pointer | **PASS** | max 0.00 px over every frame after the flight (the flight blends into the live pointer). |
| 4 | Fingertip never lags more than 1.2 cm in a fast flick | **PASS** | `lag`: 3 board-wide flicks in 4-step jumps → max 1.2 cm (catch-up spring + hard limit). |
| 5 | Fast move then a click on a small target (Details) reaches it | **PASS** | `click`: a 43 × 12 px Details button got exactly 1 click. |
| 6 | `pinchPoint` within 0.2 cm of the knob centre during a drag | **PASS** | `pinch`: pose over the knob is pinch-ready; 27 samples during the drag, worst 0.000 cm (arm solved for `pinchPoint`). Touch: 0.000 cm. |
| 7 | A sudden stop throws 4–8 embers in the travel direction | **PASS** | `embers`: 4 embers at 0° for a rightward stop. Unit test: three directions (0°, 90°, −135°), 4–8 embers each, every ember within ±15°; a slow stop throws none. |
| 8 | Stretch every 25–40 s while idle (`timeScale`) | **PASS** | `stretch` at `timeScale(20)`: 6 stretches over 180 s, gaps 33.0, 25.7, 29.0, 29.3, 27.3 s. |
| 9 | Text selection and typing work; caret mode over text fields | **PASS** | `text`: caret mode over the search field; typing "bread" works; double-click selects "Cook". Selection was broken by three's CSS3D (`user-select: none`), fixed in the stage. |
| 10 | Touch emulation can select every view by dragging a knob | **PASS** | `touch` (CDP touch events): 13 / 13 views selected by dragging their knob; the hand glides in and pinches the dragged knob; no spark. |

Also from the spec: Help switch "Also show the normal pointer" (`switch`: shows the pointer, remembered after a reload); spark on `#fx` with core, halo, flicker, trail, click ring, hover growth, caret, idle crackle; spark light to the scene's point light and `#glow`; breeze written by the hand and the spark; window leave fades the spark in 150 ms and the hand drifts to rest; during the tour the spark stays visible above the capture layer, which still takes the click (`tour`: spark canvas z-index 1001 painted, click advanced step 1 → 2). From DECISIONS point 32: coin runes glow within 5 cm of the spark, impacts bob the hand (0.05 cm, falloff with distance).

## Decisions (all in DECISIONS.md, tagged WP-09)

Zone tested on the board's top face; catch-up spring plus a hard 1.2 cm limit; handover as two reversible values; builder values (heights, rest point, springs, crossfade, touch glide, rune distance, spark light); the help switch as a `<label>`; the spark's own canvas during the tour; printed text selectable again; breeze writers.

## Open points

1. Fingertip lag sits exactly at the 1.2 cm limit during the synthetic flick: the hard limit is doing the work there; in normal use the catch-up spring keeps it lower.
2. The handover is checked by frame timing; the sounds for `visor:open`, `spark:out` and friends come from WP-12's existing mapping and were not listened to this session.
3. Text-field caret: the native I-beam is hidden too (the spark draws a 2 × 16 px caret instead); with "Also show the normal pointer" the I-beam is back.
