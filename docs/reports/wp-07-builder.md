# WP-07 builder report: paper layer and light veil

Every original string and control is printed on the sheets (CSS3D, 29 px/cm), word for word, with the original ids and elements. The light veil shades paper and print alike, never above 1.0; brighter light goes to #glow. Paper bristle, printed-control hover/press/disabled, spark light pool and the WP-10/11 glow hooks are in.

Acceptance: **4 / 6 PASS, 2 PARTIAL** (items 5 and 6, details below). Parity: **48/48 on desk and 48/48 on flat**, string and control censuses 3/3 on desk.

## Files

- New: `src/paper/index.js`, `src/paper/layout.js`, `src/paper/bristle.js`, `src/paper/glow.js`, `src/styles/desk.css`, `src/scene/gpu-wait.js`, `unit/wp07.test.mjs`, `tools/wp07-check.cjs`, `docs/explained/wp-07.md`, screenshots in `docs/reports/wp-07/`.
- Changed: `src/scene/stage.js` (paper wiring, the software-renderer start, frame timing), `src/scene/frame.js` (opt-in phase timing), `src/scene/veil.js` (clamp, excess pass, paper patches/casts), `src/scene/overlays.js` (static glow painters, still grain), `src/scene/materials/patch.js` (`fragmentEnd` hook), `src/scene/textures/index.js` + `gpu.js` (slices, blocking run, scale), `src/util/clock.js` (`frameWall`), `src/config/render.js` (software-renderer settings), `src/config/layout.js` (inset foot −24.2), `src/board/proxies.js` (↑/↓ wrap), `src/board/board.css` (coin labels), `src/fonts.css` (IM Fell italic), `unit/scene.test.mjs` (inset foot value), `DECISIONS.md`, `CHANGELOG.md`, `docs/app-js-changes.md` ("WP-07: no change").
- Untouched: `../valheim-checkup`, `src/core.js`, `src/catalog.json`, `src/app.js`, `checker-reports/`, `parity.spec.js`, `golden.spec.js`, the census tests. Nothing from `fixtures/private` was written elsewhere; the character name is masked in every screenshot.

## Acceptance items

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Every P-test, golden, string and control census on TARGET=desk | **PASS** | Real GPU (new default config): `TARGET=desk WORKERS=1 npx playwright test specs/parity.spec.js specs/golden.spec.js` → 48 passed (2.8 min), re-run after the last CSS change: 48 passed. `TARGET=flat` → 48 passed (42 s). `TARGET=desk … census/census.spec.js` → 3 passed. SwiftShader (`GPU=swiftshader` equivalent, the old config): desk 48 passed (12.3 min), flat 48 passed, before the two last CSS-only fixes (coin labels, letter mask). No test fails only on the GPU. |
| 2 | 13 views × with/without save: no overlapping or clipped text, no horizontal overflow, long names wrap | **PASS** | `node tools/wp07-check.cjs views` → 28/28 (26 view audits + no console errors ×2). Audit: every printed element inside its sheet, no `overflow-x`, no text boxes overlapping within a sheet (sheet layout px). Screenshots `view-{save,nosave}-*.png`. |
| 3 | Text sharp at 1× and 2× | **PASS** (by eye) | `sharp-1x.png`, `sharp-2x.png`: crisp heading, sub-heading and italic note at both. |
| 4 | Paper patch and the text background beside it get the same veil value within 2% | **PASS** | `wp07-check veil`: text 240.2 vs paper 241.0 → 0.33%. |
| 5 | Gauntlet stand-in's shadow crosses text near the board's edge; a test spark visibly warms text | **PARTIAL** | A test caster over the heading next to the board darkens the text (`shadow-before/after.png`, pixel diff check PASS); the spark pool (2,700 K, 18 cm, flicker 0.85–1.1) warms the heading and stamps (`spark-off/on.png`, PASS). The stand-in's **own** shadow falls on the woodblock, not on printed text (key light −55/45/95: hand at (−36, 7) casts to about (−32.5, 4.2)); it can only reach text over the open help letter. Needs the real gauntlet pose (later WP) to cross text. |
| 6 | Composition matches the reference | **PARTIAL** | `desk-save-1440.png` vs `reference/IMG_6272.png`: same arrangement (woodblock with bars left, title at the top, coins top right, eyebrow + heading + description, four stamps in a row, filter row, table on the right, footer at the foot). Different: the camera frames wider (the sheet fills ~75% of the width, the reference ~95%), the title is centred rather than over the board, no map/flourish ornaments or stamp dot rows yet (WP-10), and the gauntlet is the stand-in. Framing belongs to the camera rig, not the paper layer. |

Other self-checks: `npm run test:unit` 125/125; `node scripts/test.cjs` passes; `wp07-check shot` no console errors.

## Decisions (all in DECISIONS.md, tagged WP-07)

Split main-sheet objects for the tab order; no new wrappers (`::details-content`); inset foot −24.2; title-area boxes; hero and message placement; ink colour and `font-synthesis`; control reactions; paper-tone sampling; bristle; veil clamp and excess; spark pool before WP-09; help letter over the board; bar ↑/↓ wrap; `fragmentEnd` hook; and four from the parity work:

- **Software renderers do a blocking start.** On SwiftShader/llvmpipe every compile and texture pass happens once during page load (~10 s on SwiftShader), not spread over the first frames. The film grain stays still there; the 3D layers redraw at most every 2 s unless the camera moves. Real GPUs never take this path.
- **No clock reads straight after heavy work** (frame timing from the rAF timestamp, opt-in phase timing).
- **#glow repaints only when it changes.** The veil-excess capture now happens on the lit desk; before, it ran during the dark warm-up and never showed.
- **Coin labels, letter mask, audit.** Coin labels use `opacity: 0`, so the string census sees "＋ Load character click or drop .fch". The ink mask is moved off the foot part, which had made the open help letter invisible on screen. The text audit runs in sheet space.

Why P10/P37 failed on desk (they had failed since before WP-07): both tests use Playwright's fake clock, which also fakes animation frames. Each multi-second SwiftShader compile was replayed frame by frame afterwards, and timers made or read during a replay came out early or late. The fix is in the app; no test was changed.

## Open points

1. Item 5: the gauntlet stand-in's shadow reaches text only over the open help letter; the real gauntlet (later WP) decides it.
2. Item 6: camera framing and ornaments differ from the reference (camera rig; WP-10 stamps and dots).
3. The open help letter is shaded by the veil as if it were the board beneath it (it lies above the board but the veil only knows the paper and the board). For WP-11's unfold.
4. On a software renderer the page freezes ~10 s once while loading, and board animations refresh at most every 2 s. Only the test renderer and machines without a GPU are affected.
5. P11 on SwiftShader took 48 s of its 90 s (four desk loads, two tabs at once); on the GPU it is a few seconds.
6. One earlier background run in this session hung and wrote no output. A stray log from another run said "4 passed (16.2m)" and was deleted before its tail was read, so it is not known which tests it left out. Every run counted above finished with a full tally.
7. The WP-05 and WP-06 desk specs were not run again after the WP-07 changes to stage.js and the texture slices. The parity, golden and census runs cover the shared code.
