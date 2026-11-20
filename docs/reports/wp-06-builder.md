# WP-06 builder report: board, bars, coins, slider mechanism

Scope: everything in spec/wp-06-board.md except the braided border carving (Paul's scope cut: plain bevelled border). Parity/golden not re-run for WP-06, per the updated brief (scheduled after WP-07). They did pass on flat (48/48) before the brief changed.

## Files

New: `src/board/` — `index.js` (wiring, readouts, hint, motes, debug API `__vc.board`), `mechanism.js`, `layout.js`, `woodblock.js`, `bars.js`, `coins.js`, `proxies.js`, `engravings.js`, `geometry.js`, `board.css`; `src/scene/breeze.js`, `src/scene/impact.js`, `src/scene/paper-lift.js`; `unit/wp06.test.mjs` (12 tests); `tools/wp06-check.cjs`.
Changed: `src/scene/stage.js` (board before compile, texture options, `markPrintDirty`, `__vc.engraved` merges tab counts), `src/scene/veil.js` (`addCaster`/`removeCaster`), `src/scene/placeholders.js` (sheets subdivided for paper lift), `src/scene/textures/engrave.js` (composite entries, `onEngrave`, atlas size option), `src/scene/materials/engraving.js` (deferred slots, second slot + wipe, `refreshEngraving`), `src/config/{layout,motion,render}.js`, `src/strings.js` (`soundCoin`), `tests/specs/wp05.spec.js` (engraving expectations, see DECISIONS). `src/app.js`, `core.js`, `catalog.json` unchanged.

## Acceptance (evidence: `docs/reports/wp-06/check-output.txt`, real GPU, 23/23 checks)

| Item | Result | Evidence |
| --- | --- | --- |
| 13 bars in the original order, identical geometry and finish, names engraved correctly | PASS | 13 bars, one latched; engraved strings match the page word for word (bar names as the buttons show them, heading, side note; `__vc.engraved()` lists 38 strings). Screens: `desk-1440x900.png`, `board-crop-1440.png`, `latched-artisan.png`. |
| Release at 59% springs back, 61% latches, only one latched | PASS | Real mouse drags re-aimed each step (camera parallax): 59% → travel 0.5896 springs back; 61% latches; one latched. |
| Event order press → drag → detent ×n → latch → app:category → return | PASS | 3 detents; order confirmed from `__vc.events`. |
| Click without drag never selects; hint on 2nd click within 4 s | PASS | No `app:category`; `hint:show` once; hint gone after 2.5 s. `hint.png`. |
| Keyboard and programmatic click select every view; P12–P15, P17, P18 on desk | PASS | Programmatic click 13/13; ↑/↓ moves, Enter/Space selects, focus kept (`keyboard-focus.png`); `TARGET=desk` P12–P15, P17, P18: 6/6 passed. |
| Every coin's reactions, every proxy runs its original handler | PASS | Hover hop + two landings; How to opens the How-to; Import and Load open the file chooser (Import flips); Export follows the disabled state (dimmed); Sound toggles mute, face, aria-pressed; whole-desk drop → one `drop:file`, forwarded to Load, no flip for non-.fch. |
| Timings from `__vc.events` within ±10% | PASS | Latch→return 362 ms (350); auto-slide 416–434 ms (420); hop→first landing 283 ms (280). |

Also: `node scripts/test.cjs` passes; `npm run test:unit` 117/117; desk 1440 and 390 px load with no console errors (`desk-390x844.png`).

## Fixes found by looking at the screenshots

- Coins were inside-out (LatheGeometry winds a centre-outward profile facing down): legends hidden, gold looked matte. Re-wound; legends and emblems now show.
- Bars read paper-white (key-light highlight tone-maps to white); steel tinted to mid-grey like the reference (measured ~150/255), engraving shade darkened.
- A NaN in the WP-05 anisotropy on bevel pixels blacked out the frame on SwiftShader (bloom spread it); a NaN guard patch on the bar steel fixes it (the WP-04 marker test passes again).

## Other desk specs

WP-05 and WP-12 desk specs pass. WP-04 desk: 12 of 14 pass, plus:
- `hidden tab` is timing-flaky on SwiftShader (passed 1 of 2 runs). Frames take ~1.2 s just after the quality switch, so a second frame can finish as the tab hides. Steady state: 625 ms/frame with the board vs 500 ms without. Test not changed.
- `WebGL context loss` fails: the page stays black after restore **with the board hidden too**. Every WP-05 texture lives only on the GPU and is never regenerated after a restore. Pre-existing WP-05 gap, not caused by WP-06 — open point for the next session (re-run texture generation on `webglcontextrestored`).

## Decisions logged (DECISIONS.md, tagged WP-06)

Border, grooves, knob height, tab text fit, bar hit area, engraved text source, plaque wheels, steel/gold look, NaN guard, coin geometry, breeze writers, file drops, tab order, deferred items, wp05.spec update, bar shadows, WP-04 names kept.

## Open points

1. Context-loss restore (WP-05 textures), as above.
2. Deferred to later WPs: red ink blot on a failed load (WP-07, when the message line is printed), coin rune glow near the spark (WP-09), gauntlet/spark as breeze writers (WP-09; the pointer stands in).
3. The original page's other focusables still come before #print in tab order until WP-07 moves them.
4. Look vs reference: no braid (scope cut); metals are tuned by tint rather than lighting — WP-11 lighting polish may want to revisit `render.board.barSteelTint`.
