# WP-04 · Scene foundation — builder report

**Date:** 2026-11-10 · **Builder** · **Round:** 1

## Verdict

WP-04 is built. All 7 acceptance items pass in my own checks: `tools/wp04-check.cjs` passes 43/43, including the full 5-minute idle run. `scripts/test.cjs` passes, and the unit tests pass 94/94.

On the checker's suite, `TARGET=flat` gives 125 passed, 2 skipped and **2 failed**. Both failures are in `tests/specs/wp01.spec.js`, and both are tests written to assert the pre-WP-04 state: "no desk yet" (open point 1). Every P-test, every census, golden, WP-02 and WP-03 test passes on flat. Flat mode loads no 3D code at all.

`app.js`, `core.js`, `catalog.json`, `template.html`, `style.css`, `tests/` and `checker-reports/` are untouched.

## Files changed

**New**
- `src/scene/stage.js`: builds `#desk` and its 7 layers, renderer 1, CSS3D, the frame loop and the `__vc.stage` hooks.
- `src/scene/camera-rig.js`: framing solver, pointer drift and zoom (spring 30/10), shake, override.
- `src/scene/lights.js`: key, fill, rim and spark lights; the PMREM studio environment, with RoomEnvironment as fallback; Kelvin → RGB.
- `src/scene/placeholders.js`: the placeholder shapes, and `BLOOM_LAYER`.
- `src/scene/veil.js`: renderer 2, the paper lighting, shadows, occluders and test casters.
- `src/scene/post.js`: selective bloom, MSAA/FXAA by tier, the AgX OutputPass.
- `src/scene/overlays.js`: the `#glow`, `#fx` and `#grain` layers.
- `src/scene/input.js` and `src/scene/velocity.js`: pointer, velocity and hover raycast.
- `src/scene/governor.js`: benchmark and tier drop (pure logic).
- `src/scene/frame.js`: the phase-ordered frame loop.
- `src/scene/scene.css`
- `src/config/layout.js`: the master layout.
- `unit/scene.test.mjs`: 10 tests.
- `tools/wp04-check.cjs`: builder browser self-check.
- `docs/explained/wp-04.md`, this report, and the screenshots in `docs/reports/wp-04/`.

**Modified**
- `src/mode.js`: `DESK_AVAILABLE = true`.
- `src/main.js`: `if (runMode === 'desk') import('./scene/stage.js')`.
- `src/config/render.js`: new `stage` block, holding the values the spec leaves open (see open point 4).
- `unit/mode.test.mjs`: the "until WP-04 lands" test is replaced by a since-WP-04 test. This is a builder-owned unit file.
- `package.json` / `package-lock.json`: runtime dependency `three 0.187.0`, exact, as allowed by file 01.
- `CHANGELOG.md`: 6 WP-04 lines.
- `docs/app-js-changes.md`: "WP-04: no change" section.
- `dist/`: rebuilt with `npm run build:all`. The stage is a separate 800 kB chunk in `dist/site/`, and is inlined but only executed on desk in the single file.

## Acceptance

| Item | Result | Evidence |
| --- | --- | --- |
| Layer order, blend modes and pointer settings match file 05 (DOM inspection) | **PASS** | `__vc.stage.layers()`: the 7 direct children of `#desk` are, in order, `canvas#scene` normal/none, `div#print` normal/auto, `canvas#veil` multiply/none, `canvas#glow` screen/none, `div#float` normal/none (its children take the pointer: computed `auto`), `canvas#fx` normal/none, `div#grain` overlay/none. No layer sets isolation, opacity < 1 or filter. The grain noise child has opacity 0.1 and re-offsets at 24 fps; the vignette is `rgba(0,0,0,0.18)` at the corners (open point 3). |
| A test div of printed text on the inset sheet stays within 1 px of its paper position at camera offsets (0, 0), (1.6, 1.0) and zoom 1.025 | **PASS** | `__vc.stage.test.printDiv()` puts zero-size markers on the 4 corners. Their `getBoundingClientRect()` is compared with the WebGL projection of the same paper points. Max error is **0.000 px** at (0,0)×1, (1.6,1)×1, (0,0)×1.025, (1.6,1)×1.025 and (−1.6,−1)×1.025. It is also 0.000 px while the spring-driven camera drifts with a real pointer (camera at (0.87, 0.53), zoom 1.011). |
| A test shadow in `#veil` darkens both the paper and the text above it; a test glow in `#glow` brightens both | **PASS** | Measured on screenshot crops of the test text, with grain hidden for the measurement. Shadow: paper luminance 191.2 → 142.0 (−26%), ink 42.0 → 31.7 (−25%). Glow: paper 191.2 → 213.7, ink 42.0 → 91.0. Crops: `wp-04/veil-test-before.png`, `veil-test-shadow.png`, `glow-test.png`; in context: `veil-test-window.png`. I looked at all four: inside the shadow the letters darken exactly like the paper, and the letters outside it don't change. |
| The flat/desk switch picks correctly for: no WebGL2, reduced motion, coarse pointer, 900 px wide window | **PASS** | Real browser, no `?mode`. 1440×900 → desk. `getContext('webgl2')` returning null → flat. `reducedMotion: 'reduce'` → flat. Touch phone emulation (`pointer: fine` false) → flat. 900 × 800 → flat. Help switch plus reduced motion → desk. In every flat case there is no `#desk` and no errors. Also unit-tested in `unit/mode.test.mjs`. |
| Forcing slow frames through `__vc` drops exactly one tier and never climbs back | **PASS** | `__vc.stage.forceFrameMs(30)` (every frame reports 30 ms; `__vc.slowFrames(ms)` adds ms on top of real timing instead). From High it drops once to Medium after 2 s of frames; the quality log has exactly 1 new entry. 8 s of 8 ms frames afterwards: still Medium. Unit tests cover 1,980 ms (no drop) vs 2,010 ms (drop), exactly 20 ms (no drop), never below Low, and a manual tier cancelling the benchmark. |
| No console errors; heap stable over a 5-minute idle run | **PASS** | 0 console errors and 0 page errors on both desk pages. JS heap after forced GC, once a minute: 5.78, 5.92, 5.97, 5.99, 6.00, 6.00 MB. It levels off, +0.22 MB in total, with 1,422 frames rendered. GPU resources stay constant (13 geometries, 19 textures). |
| All P-tests still pass on `TARGET=flat` | **PASS** (P-suite) | `cd tests && TARGET=flat WORKERS=1 npx playwright test`: 125 passed, 2 skipped, 2 failed. All of `parity.spec.js` (P01–P44), the censuses, golden, wp02 and wp03 pass. The 2 failures are the WP-01 tests in open point 1. |

**Also built and checked (WP-04 steps)**
- Camera: fov 28°, pitch 62°. The distance is solved so the sheet is centred and its widest edge fills 97% of the screen, and it refits on resize: 1440×900 → 135.5 cm, 1100×700 → 137.8 cm. Resizing below 1024 × 640 stays desk (DECISIONS 24). Drift reaches 1.6 × 1.0 cm, and zoom reaches 1.0241 → 1.025 in the middle third. `shake(amount, ms)` defaults to 0.04 cm / 140 ms.
- Renderer 1: AgX tone mapping, exposure 1, sRGB output, PCF shadows with radius 4. Three r187 removed `PCFSoftShadowMap` and prints a warning when you use it, so "soft" is PCF plus `shadow.radius`.
- Lights: key (3,200 K, from upper left), hemisphere fill, rim, spark (intensity 0 until WP-09). The environment is the studio (`stats().environment === 'studio'`).
- Bloom layer: the gauntlet stand-in only. Per tier: full, half, off.
- Tiers apply every file 05 value: High has PR ≤ 2, shadow 2,048, MSAA 4, veil ½. Medium has PR 1.5, 1,024, bloom half, veil ¼. Low has PR 1, 512, bloom off, FXAA, veil ¼. `quality('flat')` gives no bloom, no FXAA, no MSAA and no grain, and the run mode stays desk.
- Frame loop: `input → physics → scene → veil → overlays → print`. CSS3D re-renders only when the camera moved. The loop pauses while the tab is hidden: 0 frames rendered in 1.5 s hidden, and it resumes after.
- Input: the pointer position is exact (no smoothing). Velocity on a scripted 40 cm / 400 ms sweep reads 100.1 cm/s, and 0 when stopped. Hovering the Load coin gives `hover: 'coin-load'` and a warm emissive lift. The native cursor stays (`cursor: auto`).
- Unit tests: benchmark picks, drop rules, velocity window, framing at 4 aspect ratios, middle-third zone, layout table, layer config.

## Screenshots vs the reference

`docs/reports/wp-04/compare-reference.png` puts the reference above our High render at 1440×900. Also: `desk-high-1440x900.png` and `desk-low-1440x900.png`. I looked at each.
- **Matches:** the sheet fills the frame with a thin desk border. The woodblock sits left, with the arm coming in from the top-left corner and the hand over the top of the board. The inset sheet fills the right two-thirds. The coin row is top right and the Sound coin bottom right. The key light from the upper left throws the board's shadow down and to the right onto the paper (through the veil), as in the reference. The planks run left to right. The grain is visible, the corners are slightly darker, and the paper is warm cream.
- **Differs (expected for placeholders):** no texture, deckle, stains or creases (WP-05/07). The woodblock is a plain box (WP-06), the coins are flat discs (WP-06), and the gauntlet is a capsule (WP-08). The reference looks a little more top-down: at 62° the near edge of the sheet is wider than the far edge. I kept the spec's pitch.
- **The gauntlet stand-in blooms into a glowing bar at High** (open point 2). At Low, with bloom off, it reads as polished steel.

## Open points

1. **Two WP-01 checker tests assume the desk doesn't exist yet.** Both are in `tests/specs/wp01.spec.js`, which I may not edit.
   - Line 61, "?mode=desk falls back to flat until WP-04 (DESK_AVAILABLE false)": `?mode=desk` now correctly gives desk.
   - Line 39, "opens from file:// with no query … flat mode": with no query at 1440×900 the automatic choice is now desk (WP-04 step 10), so `bodyClass` is `mode-desk`. Its console check also catches 2 warnings, `GL Driver Message … GPU stall due to ReadPixels`. These are Chromium/SwiftShader compositor messages. A bare page with two WebGL2 canvases that only call `clear()` prints the same warnings (I reproduced it), so they are not from the stage. Both are warnings, not errors.

   Suggestion for the checker: run the no-query test with `?mode=flat` (or with `reducedMotion: 'reduce'`) and ignore that one GL driver warning text, and flip line 61 to expect desk.
2. **Bloom on the capsule stand-in.** With the spec's bloom (threshold 0.85, strength 0.6, radius 0.4), the polished capsule's one long specular line blooms into a bright bar. I lowered only the stand-in's `envMapIntensity` (`stage.standInEnvIntensity 0.5`) and kept every spec value. WP-08's plated gauntlet breaks the highlight into small glints. WP-05/WP-08 should look at it again with the real model.
3. **Grain opacity vs vignette.** File 05 says `#grain` is overlay at opacity 0.10 and also holds an 18% vignette, but an 18% vignette can't live inside a 10% layer. So `#grain` itself is overlay at opacity 1. Its noise child carries opacity 0.10, and its vignette child is a radial gradient to `rgba(0,0,0,0.18)`. Over the dark desk at the corners, an overlay of black at alpha 0.18 darkens by exactly 18%. Please confirm or log in DECISIONS.
4. **Values the spec leaves open.** These are in `render.js` → `stage`; please log the ones you want in DECISIONS.
   - Benchmark cut-offs: average ≤ 18 ms → High, ≤ 26 ms → Medium, else Low, after 10 warm-up frames. Frame time is measured frame-to-frame, so a 60 Hz screen reads 16.7 ms even when idle; the cut-offs sit above that.
   - The drop window counts frame time, not wall time: "2 s of frames over 20 ms". After a drop the window restarts, so sustained slowness can drop again 2 s later, one tier at a time, never below Low.
   - Sheet fill 97%.
   - Light intensities, veil intensities and the veil key warmth of 35%. Full 3,200 K warmth under multiply turned the paper orange.
   - Paper albedo boosted ×1.3, because AgX maps 1.0 to a dull grey-cream.
   - Studio panel strengths and positions.
5. **Interim desk mode hides the app.** Until WP-06/07 move the controls into `#print`, a desktop visitor with no `?mode` sees the placeholder desk over the original page. The original DOM is still there underneath, so the tests and the proxies-by-id still work, and toasts show above the desk (`body.mode-desk #toast {z-index: 40}`). Paul shouldn't judge the desk from today's build; `?mode=flat` gives the full app. If a usable interim build matters, setting `DESK_AVAILABLE` to false is a one-line switch.
6. **SwiftShader speed.** In the test browser the benchmark measures about 380 ms/frame and picks Low. Each frame at High takes about 0.35 s, so desk tests that step through animations need generous timeouts. `__vc.stage.forceFrameMs()` makes tier tests deterministic. On a real GPU it will pick High; Paul's `?perf` check is in WP-14.
7. **Hooks for later WPs:**
   - `__vc.stage.onPhase(phase, fn)` adds work to a frame phase.
   - `addPrinted(el, {x0, y0, w, h, z})` places HTML on a sheet at `pxPerCm` 29.
   - `overlays.glowPainters` / `fxPainters` (WP-09/10).
   - `rig.shake()` (impacts, WP-06).
   - `veil` mirrors any mesh in `parts.casters` / `parts.papers`.
   - After swapping meshes, call `post.refresh()` for the bloom blackout list.
   - `three` holds the live objects.
   - A runtime WebGL failure after choosing desk removes `#desk` (with a `console.warn`) and leaves the original page usable.

## Self-check commands

| Command | Result |
| --- | --- |
| `node scripts/test.cjs` | Passed (skill decoding, cooking/eating, checksum, catalog, difficulty records) |
| `npm run test:unit` | 94 / 94 |
| `cd tests && TARGET=flat WORKERS=1 npx playwright test` | 125 passed, 2 skipped, 2 failed (open point 1) |
| `node tools/wp04-check.cjs` (5-min idle) | 43 / 43 |
| Privacy scan of all new and changed files plus `dist/valheim-checkup.html` | 0 hits for the character name or save stem |
