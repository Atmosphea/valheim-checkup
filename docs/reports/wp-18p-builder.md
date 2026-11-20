# WP-18P · Builder report: transition performance

Scope: `spec/wp-18p-performance.md` (Paul's top priority, before 18C). Builder calls are logged in DECISIONS as "WP-18P" (11 rows). Nothing visible was cut.

**Acceptance: 10 / 12 PASS, 2 PARTIAL. NEEDS PAUL: the cut list (section 6) and the two partial items.**

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Profiler + baseline table before changing anything | PASS | `tools/wp18p-perf.cjs`; baseline section 1 (`perf-before-other.json`, `work/wp18p/perf-before-views.json`) |
| 2 | No frame over 16.7 ms in any transition (this Mac, 1440 × 900, High) | **PARTIAL** | late frames 96 → 40 (sum of medians, 3 interleaved runs). 18 of 31 transitions at 0, 10 at 1 (mostly the first frame of a view change); left: load (4), row-height burn (14), start-up (12). Section 2 |
| 3 | Look unchanged | PASS | 8 / 8 mid-transition pixel diffs within tolerance (section 3) |
| 4 | Degrade gracefully: 4×, 6× throttle, Low tier | **PARTIAL** | Governor steps down correctly under 4× and 6× and climbs back with headroom, no errors. Low tier: 0–1 late frames per transition. At 6× the big tables still drop many frames: that is DOM work 3D quality can't buy back (section 4) |
| 5 | Adaptive governor (down before drops, back up with headroom, invisible on this Mac at High) | PASS | `scene/governor.js` trims + climbing; unit tests 6 new + 5 old; live on this Mac at High through load, every view, Details and rows (`perf-gov-live.json`): 0 trims, 0 tier changes (the old rule dropped it to Low) |
| 6 | One central scheduler, no ad-hoc rAF loops | PASS | `util/clock.js`; `grep requestAnimationFrame src` leaves only the clock, `app.js` (parity reference) and `perf.js` (measures the browser's rate) |
| 7 | Delete dead code | PASS | damp-band veil patch + `washDampDarken`, row feed, `toWorld`, `BONE_NAMES`, an unused import |
| 8 | `docs/explained/architecture.md` | PASS | written |
| 9 | wp16a flash clean | PASS | `node tools/wp16a-check.cjs flash`: 4 / 4 (0 load flashes, 0 view flashes, bloom corners 0) |
| 10 | 18A and 18B checks | PASS | `wp18a-check all` 36 / 36 (the 5 before/after comparisons need `BEFORE=`, not set); `wp18b-check all` 35 / 35 |
| 11 | Unit tests, `scripts/test.cjs`, parity on desk once | PASS | unit 168 / 168; `scripts/test.cjs` passed; `TARGET=desk playwright test specs/parity.spec.js` 45 / 45 (2 workers, Metal) |
| 12 | Cut list, docs, STATUS, `npm run build:all` | PASS | section 6; `docs/explained/wp-18p.md`, CHANGELOG, STATUS row; build:all clean |

## How it was measured

Real GPU (ANGLE Metal), 1440 × 900, deviceScaleFactor 1, seed 7, Paul's save. A frame is **late** when its rAF interval is over 18.7 ms (one missed 60 Hz refresh plus timer jitter; the idle page measures 16.6 ± 0.4 ms). Views are changed the way Paul does it: drag a bar to the latch in the woodblock zone, then let go. Builds are compared unminified (per-module attribution). Before = the v2.2.0-era build in `work/wp18p/named-before`, after = `work/wp18p/named-after`, **interleaved** (before, after, before, after…) over 3 rounds: one traced (CDP trace for main-thread ms and attribution), two frames-only (no trace, no sampler: the sampler slowed DOM frames 2–3×). Both with the governor frozen (`--hold`) so both run at High.

**Noise, honestly:** this Mac has 8 GB of RAM with other apps using ~4.5 GB and a load average of 4–8. The same build swung from 2 to 30 late frames on one transition between runs, so section 2 uses medians and lists every run.

## 1. Baseline (before any change; traced, governor not frozen)

Note: in this run the old governor dropped from High to Low partway through the views (see section 5), so later rows were partly measured at Low. That is the reason for the frozen-governor A/B in section 2.

| Transition | Worst ms | > 16.7 | > 33 | Main ms | GPU ms | Top 10 costs (ms over the transition) |
| --- | --- | --- | --- | --- | --- | --- |
| start-up | 1016.6 | 11 / 159 | 9 | 2838 | — | three.js:onFirstUse 339 · src/surfaces/title.js:build 248 · src/audio/engine.js:createContext 153 · Layout 90 · src/board/burn.js:burnMaps 86 · Paint 80 · src/gauntlet/collide.js:findPenetrations 73 · src/mode.js:readEnv 67 · src/ink/masks.js:stampGrain 58 · src/audio/recipes/ambience.js:speaker 57 |
| load save | 50 | 8 / 189 | 1 | 1476 | 1661 | Style recalc 307 · Layerize 148 · Paint 122 · Style recalc (forced) 78 · Hit test 63 · native getBoundingClientRect 62 · native elementFromPoint 57 · Pre-paint 51 · three.js:updateMatrixWorld 36 · Layout 34 |
| details open | 50 | 1 / 68 | 1 | 1048 | 584 | Layerize 509 · Paint 169 · native elementFromPoint 117 · Pre-paint 87 · Style recalc (forced) 48 · native getClientRects 25 · three.js:updateMatrixWorld 17 · native querySelectorAll 17 · Commit 14 · Style recalc 13 |
| details close (burn) | 83.3 | 17 / 212 | 2 | 2623 | 2071 | Layerize 1002 · Paint 506 · native elementFromPoint 275 · Hit test 209 · Style recalc (forced) 74 · Commit 50 · Pre-paint 39 · three.js:updateMatrixWorld 38 · native querySelectorAll 35 · native focus 34 |
| row-height rescale | 83.4 | 19 / 98 | 5 | 1408 | 1580 | Layerize 433 · Paint 283 · native elementFromPoint 201 · Style recalc (forced) 102 · Hit test 86 · Layout (forced) 58 · native getBoundingClientRect 58 · Style recalc 56 · Pre-paint 44 · Commit 28 |
| view Artisan · release | 150.1 | 24 / 146 | 1 | 2758 | 1853 | Layerize 950 · Paint 410 · Style recalc 314 · Pre-paint 144 · Style recalc (forced) 95 · Layout (forced) 82 · native scrollTo 68 · native getBoundingClientRect 62 · native querySelectorAll 56 · GC (V8, in JS) 34 |
| view Blacksmith · release | 66.7 | 4 / 163 | 1 | 1641 | 2388 | Style recalc 355 · Layerize 212 · Paint 165 · Pre-paint 80 · Style recalc (forced) 79 · native getBoundingClientRect 53 · Layout (forced) 40 · three.js:updateMatrixWorld 35 · native querySelectorAll 31 · Layout 25 |
| view Carpenter · drag | 16.8 | 0 / 288 | 0 | 1683 | 3997 | Layerize 484 · Paint 323 · three.js:updateMatrixWorld 60 · Commit 48 · Style recalc (forced) 35 · three.js:WebGLRenderer.renderBufferDirect 30 · native get offsetLeft 28 · three.js:renderObject 27 · three.js:projectObject 25 · three.js:setProgram 24 |
| view Carpenter · release | 133.4 | 26 / 142 | 2 | 2685 | 1713 | Layerize 871 · Paint 395 · Style recalc 317 · Pre-paint 153 · Style recalc (forced) 110 · native getBoundingClientRect 69 · Layout (forced) 68 · native scrollTo 58 · native querySelectorAll 54 · three.js:updateMatrixWorld 35 |
| view Master Chef · release | 33.3 | 1 / 166 | 0 | 1345 | 1475 | Style recalc 306 · Layerize 140 · Paint 100 · Pre-paint 61 · Style recalc (forced) 58 · native toBlob 31 · native getBoundingClientRect 30 · native get offsetLeft 30 · three.js:updateMatrixWorld 28 · Layout 25 |
| view Gourmet · release | 33.4 | 2 / 168 | 0 | 1388 | 1598 | Style recalc 350 · Layerize 150 · Paint 121 · Style recalc (forced) 68 · Pre-paint 57 · native getBoundingClientRect 51 · Layout (forced) 27 · Layout 24 · three.js:updateMatrixWorld 24 · native querySelectorAll 23 |
| view Trophy Collector · release | 33.4 | 1 / 168 | 0 | 1241 | 1526 | Style recalc 346 · Layerize 109 · Paint 98 · Style recalc (forced) 56 · Pre-paint 45 · native getBoundingClientRect 33 · Layout 25 · three.js:updateMatrixWorld 22 · native querySelectorAll 20 · native toBlob 20 |
| view Hunter · release | 50.1 | 1 / 166 | 1 | 1333 | 1524 | Style recalc 303 · Layerize 155 · Paint 136 · Style recalc (forced) 59 · Pre-paint 58 · native getBoundingClientRect 34 · Layout 26 · three.js:updateMatrixWorld 25 · Layout (forced) 24 · native toBlob 22 |
| view Master Hunter · release | 50.1 | 1 / 166 | 1 | 1395 | 1343 | Style recalc 303 · Layerize 152 · Paint 134 · Style recalc (forced) 64 · Pre-paint 59 · native getBoundingClientRect 37 · Layout 26 · Layout (forced) 26 · native querySelectorAll 26 · GC (V8, in JS) 26 |
| view Fisherman · release | 16.8 | 0 / 166 | 0 | 875 | 1767 | Style recalc 149 · Layerize 51 · Paint 40 · Style recalc (forced) 39 · GC (V8, in JS) 31 · three.js:updateMatrixWorld 24 · Pre-paint 23 · native getBoundingClientRect 21 · Layout 19 · three.js:WebGLRenderer.renderBufferDirect 17 |
| view Are You Alright? · release | 16.8 | 0 / 166 | 0 | 840 | 1851 | Style recalc 170 · Layerize 55 · Paint 45 · Style recalc (forced) 36 · GC (V8, in JS) 27 · three.js:updateMatrixWorld 24 · Pre-paint 24 · Layout 20 · native toBlob 20 · native getBoundingClientRect 18 |
| view That Can't Be an Accident · release | 16.8 | 0 / 167 | 0 | 837 | 1902 | Style recalc 132 · GC (V8, in JS) 56 · Layerize 50 · Paint 41 · Style recalc (forced) 36 · three.js:updateMatrixWorld 23 · Pre-paint 22 · native toBlob 20 · Layout 20 · native getBoundingClientRect 18 |
| view Highlights · drag | 16.8 | 0 / 303 | 0 | 830 | 4012 | Layerize 103 · Paint 57 · Commit 32 · three.js:updateMatrixWorld 32 · Style recalc (forced) 28 · native get offsetLeft 28 · three.js:WebGLRenderer.renderBufferDirect 23 · three.js:renderObject 20 · Style recalc 18 · Pre-paint 17 |
| view Highlights · release | 50 | 1 / 133 | 1 | 441 | 1744 | Style recalc (forced) 36 · Pre-paint 30 · Layerize 23 · Paint 21 · native get offsetLeft 19 · src/main.js:evaluate 17 · three.js:updateMatrixWorld 15 · GC (V8, in JS) 13 · native scrollTo 12 · three.js:WebGLRenderer.renderBufferDirect 12 |
| view Skills & travel · drag | 16.8 | 0 / 303 | 0 | 723 | 4638 | Layerize 68 · three.js:updateMatrixWorld 32 · Commit 30 · Style recalc (forced) 25 · GC (V8, in JS) 25 · native get offsetLeft 24 · Paint 24 · three.js:WebGLRenderer.renderBufferDirect 22 · three.js:renderObject 20 · native querySelectorAll 16 |
| view Skills & travel · release | 16.8 | 0 / 136 | 0 | 384 | 2087 | native scrollTo 28 · Style recalc (forced) 22 · Paint 20 · Layout (forced) 19 · Layerize 15 · native clear 15 · native get offsetLeft 14 · three.js:updateMatrixWorld 13 · native querySelectorAll 13 · three.js:WebGLRenderer.renderBufferDirect 13 |

Big tables: Layerize ~870–950 ms, Paint ~400, Style ~315 and Pre-paint ~150 per view change. Causes found: (a) under the CSS3D transform Chromium paints the whole 400-row table, every icon with a sepia filter and multiply blend; (b) a transform on every button and label (~400 compositing nodes to layerize each frame); (c) layout reads after style writes in the middle of a frame: the title's toCm (850 per view change), audio pan, the stamps' sheen, the gauntlet's elementFromPoint, `window.scrollTo` in the release frame, the board's focus restore, the lift's scroll reset.

## 2. Before → after (medians of 3 interleaved runs, governor frozen at High)

| Transition | Worst ms before → after | Frames > 16.7 before → after (each run) | > 33 | Main-thread ms | GPU ms |
| --- | --- | --- | --- | --- | --- |
| start-up | 866.7 → 866.6 | 11 → **12** (11, 11, 12 → 15, 12, 11) | 8 → 8 | 2650 → 2649 | — → — |
| load save | 50 → 50 | 5 → **4** (2, 5, 12 → 30, 4, 2) | 1 → 1 | 1489 → 1346 | 1594 → 1411 |
| view Artisan · drag | 16.8 → 16.8 | 0 → **0** (0, 0, 0 → 0, 0, 0) | 0 → 0 | 1865 → 1471 | 4357 → 4377 |
| view Artisan · release | 66.7 → 116.7 | 20 → **1** (12, 20, 21 → 24, 1, 1) | 1 → 1 | 2573 → 1903 | 1717 → 1796 |
| view Blacksmith · drag | 16.8 → 50 | 0 → **1** (0, 0, 1 → 1, 0, 3) | 0 → 1 | 3974 → 5118 | 3579 → 3841 |
| view Blacksmith · release | 16.8 → 100 | 0 → **1** (0, 0, 6 → 1, 1, 10) | 0 → 1 | 1630 → 2337 | 2165 → 2008 |
| view Carpenter · drag | 33.3 → 16.8 | 1 → **0** (1, 1, 0 → 1, 0, 0) | 0 → 0 | 1915 → 1355 | 3773 → 3695 |
| view Carpenter · release | 100 → 116.8 | 18 → **1** (12, 18, 23 → 4, 1, 1) | 1 → 1 | 2599 → 2010 | 1770 → 1857 |
| view Master Chef · drag | 33.4 → 16.8 | 2 → **0** (0, 5, 2 → 1, 0, 0) | 0 → 0 | 4345 → 1984 | 3775 → 3427 |
| view Master Chef · release | 33.4 → 16.8 | 1 → **0** (0, 1, 5 → 0, 0, 1) | 0 → 0 | 1507 → 1495 | 2334 → 2095 |
| view Gourmet · drag | 16.8 → 16.8 | 0 → **0** (0, 0, 0 → 1, 0, 0) | 0 → 0 | 1651 → 1241 | 3770 → 3852 |
| view Gourmet · release | 16.8 → 33.4 | 0 → **1** (0, 0, 5 → 1, 0, 2) | 0 → 0 | 1731 → 1324 | 2323 → 2138 |
| view Trophy Collector · drag | 16.8 → 16.8 | 0 → **0** (0, 0, 1 → 0, 0, 0) | 0 → 0 | 1755 → 1240 | 3885 → 3790 |
| view Trophy Collector · release | 16.8 → 16.8 | 0 → **0** (0, 0, 7 → 0, 0, 1) | 0 → 0 | 1579 → 1243 | 2368 → 2059 |
| view Hunter · drag | 16.8 → 16.8 | 0 → **0** (0, 0, 0 → 0, 0, 0) | 0 → 0 | 1518 → 1206 | 3937 → 3491 |
| view Hunter · release | 16.8 → 33.4 | 0 → **1** (0, 0, 4 → 1, 1, 1) | 0 → 0 | 1539 → 1247 | 2331 → 2212 |
| view Master Hunter · drag | 16.8 → 16.8 | 0 → **0** (0, 0, 0 → 0, 0, 0) | 0 → 0 | 1941 → 1257 | 3761 → 3773 |
| view Master Hunter · release | 33.3 → 33.2 | 1 → **1** (0, 1, 4 → 1, 0, 1) | 0 → 0 | 1557 → 1239 | 2329 → 2242 |
| view Fisherman · drag | 16.8 → 16.8 | 0 → **0** (0, 0, 0 → 0, 0, 0) | 0 → 0 | 1784 → 1289 | 3791 → 3812 |
| view Fisherman · release | 16.8 → 16.8 | 0 → **0** (0, 0, 3 → 0, 0, 0) | 0 → 0 | 1091 → 904 | 2623 → 2407 |
| view Are You Alright? · drag | 16.8 → 16.8 | 0 → **0** (0, 0, 18 → 0, 0, 0) | 0 → 0 | 3782 → 1087 | 5020 → 4529 |
| view Are You Alright? · release | 16.8 → 16.8 | 0 → **0** (0, 0, 3 → 0, 0, 0) | 0 → 0 | 1364 → 996 | 2537 → 2374 |
| view That Can't Be an Accident · drag | 16.8 → 16.8 | 0 → **0** (0, 0, 0 → 1, 0, 0) | 0 → 0 | 1358 → 1081 | 5047 → 4621 |
| view That Can't Be an Accident · release | 16.8 → 16.8 | 0 → **0** (0, 0, 0 → 0, 0, 0) | 0 → 0 | 1088 → 889 | 2495 → 2346 |
| view Highlights · drag | 16.8 → 16.8 | 0 → **0** (0, 0, 1 → 0, 0, 0) | 0 → 0 | 1176 → 1035 | 4925 → 4536 |
| view Highlights · release | 16.8 → 16.8 | 0 → **0** (0, 0, 1 → 0, 0, 1) | 0 → 0 | 612 → 502 | 2178 → 2020 |
| view Skills & travel · drag | 33.4 → 16.8 | 1 → **0** (1, 0, 9 → 0, 0, 0) | 0 → 0 | 1720 → 996 | 5071 → 4483 |
| view Skills & travel · release | 16.8 → 33.3 | 0 → **1** (0, 0, 2 → 1, 0, 1) | 0 → 0 | 610 → 492 | 2316 → 2232 |
| details open | 50 → 33.4 | 7 → **1** (7, 2, 9 → 2, 1, 1) | 1 → 0 | 1191 → 471 | 602 → 576 |
| details close (burn) | 66.7 → 33.3 | 13 → **1** (13, 12, 17 → 2, 0, 1) | 1 → 0 | 2694 → 1322 | 1573 → 865 |
| row-height rescale | 83.3 → 66.6 | 16 → **14** (30, 14, 16 → 14, 14, 14) | 3 → 2 | 1342 → 878 | 1753 → 1490 |

total late frames (sum of medians): before 96, after 40

**What did it:**
- `surfaces/row-window.js`: icons of rows more than one box height outside the view don't paint (`tr.vc-far .vc-icon {visibility:hidden}`). Every row and its text stay in the DOM.
- `desk.css`: the press transform only on pressed buttons.
- Layout reads moved to the clock's read phase or behind `util/layout-epoch.js` `cached()`.
- The desk-only `scrollTo` guard (`stage.js`), the board's focus restore deferred, and the lift's scroll reset only when the table is scrolled.

**Tried and rejected:**
- A row feed (render the rows after the first screen in slices). Layout 113 → 170 ms and more late frames: table auto-layout re-lays out the whole table each slice.
- `visibility:hidden` on far rows. It hides their text from `innerText`, which the census reads.

**Not tried:** `content-visibility`. Under the 3D transform the browser can't tell what is on screen, which is the same problem as painting.

**What is left (not fixable without changing app.js, the parity reference):**
- **The first frame of a big table (~100–150 ms).** `app.js` builds the 400 rows in one task. The browser then needs one full style pass and one full layout of ~7,300 elements (forced style 40 ms, layout 27 + 26 ms in the traced run).
- **The row-height burn (14 late frames).** `--vc-row-k` restyles all ~5,600 table elements (25 ms), and the SVG burn filter repaints the scroll box each frame (~3 ms).
- **Start-up (12 late frames, worst ~870 ms).** Shader compile on first use, the title build, and creating the audio context. All of this happens before the page is usable, as it did in 2.2.0.

## 3. Same look: mid-transition pixel diffs

`tools/wp18p-diff.cjs`: both builds, High with the governor frozen, seed 7, pointer parked. Each transition runs at time scale 0.1 and freezes (time scale 0) at the same point of its own progress. **Tolerance:** a 16 px block differs when its mean grey level differs by more than 8 / 255 (the film grain is different every frame and averages out); a transition passes when at most 1 % of blocks differ. The screenshots show Paul's save, so they stay in `fixtures/private/wp18p-diff/`; the numbers are in `docs/reports/wp-18p/diff.json`.

| Transition (frozen mid-way) | Blocks over tolerance | Worst block | Pass |
| --- | --- | --- | --- |
| load save, mid-wash | 0 / 5040 | 4.3 | yes |
| view The Carpenter, mid-wash | 1 / 5040 (0.02 %) | 12.1 | yes |
| view The Gourmet, mid-wash | 0 / 5040 | 4.3 | yes |
| view Highlights, mid-wash | 0 / 5040 | 2.2 | yes |
| view The Master Hunter, mid-wash | 0 / 5040 | 1.3 | yes |
| details open, mid-unfold | 0 / 5040 | 1.8 | yes |
| details close, mid-burn | 24 / 5040 (0.48 %) | 15.8 | yes: the blocks trace the falling sheet's edge (the freeze landed a fraction of a frame apart), not a change in look |
| row-height rescale, mid-burn | 0 / 5040 | 2.5 | yes |

## 4. Weak machines: 4× and 6× CPU throttle, Low tier

`--frames --quick`, governor live. Files: `perf-throttle4.json`, `perf-throttle6.json`, `perf-tierlow.json`.

- **4×:**
  - The benchmark picks Medium.
  - Trims 1 → 2 → 3 over ~1.5 s, then a drop to Low (trims reset).
  - Trims came back under load, then two trim steps climbed back in a quiet stretch and were re-taken when load returned (back-off doubled).
  - No page errors.
  - Small views and Highlights/Skills: 1 late frame per release. The Carpenter release: 62 of 97 late.
- **6×:**
  - Medium → Low, then trims 1–3; no errors.
  - Highlights/Skills: 3–4 late frames. The Carpenter release: 57 of 67 late (worst 717 ms); Details close: 80 of 138.
- **Low tier, unthrottled:** every transition 0 or 1 late frames (the Carpenter release: 1, at 67 ms).

On a slow CPU the big tables are bound by DOM work (style and layout of 400 rows, and the wash's per-frame style), not by the 3D quality the governor controls. The step that would help is visible (turning the ink wash into its reduced-motion form when the machine is struggling), so it is offered as a cut in section 6 instead of being done here.

## 5. The adaptive governor

`scene/governor.js` (pure, unit-tested), wired in `scene/stage.js`, config `render.js quality`:

- **Trims:** small steps inside a tier, least visible first:
  1. the reflection cube refreshes half as often;
  2. 3D pixel ratio ×0.85;
  3. 3D pixel ratio ×0.75 with the cube at a quarter rate (the ratio never goes below 1).
  A 750 ms window in which half the active frames were strained adds one step. Strained means the frame's JS took more than 60 % of the budget, or the frame was late. This acts before a tier drop.
- **Tier drop:** a 2 s average over 20 ms, **and (new) half the window's frames late**.
  - This fixes a real fault: the old rule dropped this Mac from High to Medium to Low during ordinary view changes, and before WP-18P it never climbed back. The v2.2.0 baseline views run ended at Low.
  - Sustained slowness still drops a tier as before: forced 30 ms frames, 4× throttle.
- **Climb:** 5 s of headroom gives back a trim step, then a tier.
  - A tier only climbs on GPU-timer evidence (`scene/gpu-timer.js`). A browser without timer queries, or a test's forced frame times, never climbs a tier.
  - A step taken again soon after its climb waits longer next time: 15 s, 30 s, … up to 2 min.
- **Idle frames** count for nothing (the 3D layers render on demand). A hand-picked tier (`__vc.quality`) is the ceiling.
- **Controls:** `__vc.stage.holdGovernor(true)` freezes it. `stats().governor`, `qualityLog` and `trimLog` show what it did.
- **GPU time is not a strain signal:** on this Mac the timer queries read p90 22 ms (2×: 29 ms) while every frame still lands on 16.7 ms. They include pipelined waiting.
- **This Mac at High, governor live** (`perf-gov-live.json`, load + every view + Details + rows): benchmark High, 0 trims, 0 tier changes, no errors. The timing runs in section 2 froze it on purpose.

## 6. What can be cut: for Paul (nothing has been cut)

Measured with `tools/wp18p-cuts.cjs`: one effect off at a time on the running page, High, governor frozen.
- **Drag:** 5 s of pointer motion. JS ms per frame, and GPU ms per frame from the timer queries (scene / veil). The GPU figures overstate on this Mac, so read them as differences from "all on".
- **View:** The Gourmet → The Carpenter, counting late frames.
- **Settings:** 1× and 2× (Paul's Retina screen). Single runs, so view counts of ±3 are noise. Files: `cuts-dsf1.json`, `cuts-dsf2.json`.

| Effect | What it is | JS ms/frame (drag) | GPU saved at 1× / 2× (scene + veil, ms/frame) | Carpenter view, late frames 1× / 2× | Without it | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| (all on) | | 1.76 | — (4.98 + 2.59 / 6.61 + 3.41) | 4 / 13 | | |
| MSAA 4× | smoothing of the 3D layer's edges | ±0 | 2.7 / 3.9 | 1 / **2** | at 2× the edges are already fine; at 1× the board's and gauntlet's edges show steps | **Simplify:** MSAA 2× or FXAA on screens with a pixel ratio of 2 or more. The biggest single win on Paul's screen |
| Veil | the lamp's light and shadow over the printed page | ±0 | 2.6 / 3.4 (+0.7 scene) | 1 / **2** | the page goes flat: no lamp pool, no gauntlet shadow on the paper. Very visible | **Keep.** Possible simplification: render the veil at a quarter size on 2× screens (now half) |
| Bloom | the glow around the spark, embers and the burn | −0.1 | 2.1 / 1.8 | 5 / 12 | the spark and embers look flat, no halo | **Keep** (cheap at 2×, and it is the spark's look) |
| Shadow maps | the lamp's shadows (board, gauntlet) | +0.3 | 0.6 / 0.5 | 6 / 15 | no shadows under the gauntlet and coins | **Keep:** already only redrawn when something moves (WP-18A) |
| Gauntlet reflection cube | reflections on the gauntlet's steel | ±0 | ~0 / ~0 | 2 / 12 | dull steel | **Keep:** refreshed every 12th frame; the governor's first trim halves it on weak machines |
| Film grain + vignette | the moving grain over everything | ±0 | 0.2 / 0.1 | 3 / 15 | cleaner, more "digital" image | **Keep** (costs nothing measurable) |
| Printed icons' sepia + multiply | the icons look printed on the paper | ±0 | ~0.3 / ~0.2 | 4 / 14 | icons look pasted on, full colour | **Keep:** after the row window, only visible rows' icons pay for it |
| Ink wash (and other motion) | pieces ink in on every view change and load | ±0 on drag | — | **0 / 0** (17 frames: no animation) | content appears at once, like reduced motion | **Keep on capable machines.** Offer as the governor's last step below Low on weak machines (section 4): it is the only thing that helps a 6×-slow CPU. Needs Paul's yes |
| Row-height burn | rows burn away and back in on release | 25 ms restyle + ~3 ms/frame filter | — | (row-height rescale: 14 late) | the rows resize at once | **Simplify or keep:** burn only the rows in view (would need a snapshot of them). Paul's item 12, so his call |
| Details burn (falling sheet) | the letter burns and falls | — | — | Details close: 1 late (was 13) | a plain close | **Keep:** cheap now |

Start-up's long tasks (shader compile 339 ms, title 248, audio 153 at load) aren't effects to cut. They are candidates for slicing in idle time in a later WP; this one didn't change them.

## Files changed

- **New:**
  - `src/util/layout-epoch.js`, `src/surfaces/row-window.js`, `src/scene/gpu-timer.js`
  - `unit/wp18p.test.mjs`
  - `tools/wp18p-perf.cjs`, `wp18p-diff.cjs`, `wp18p-cuts.cjs`, `wp18p-summary.cjs`
  - `docs/explained/architecture.md`, `docs/explained/wp-18p.md`, this report, `docs/reports/wp-18p/*.json`
- **Scheduler:** `src/util/clock.js` (read, nextFrame, nextRead, idle), `unit/clock.test.mjs` (+4 tests).
- **Moved onto the clock:** `surfaces/burn-away.js`, `surfaces/row-burn.js`, `surfaces/inkbits.js`, `tutorial/tour.js`, `ink/index.js`, `flat/paper.js`, `audio/engine.js`, `scene/textures/index.js`, `scene/stage.js`.
- **Layout reads:** `surfaces/title.js`, `audio/wiring.js`, `ink/index.js` (sheen rects), `gauntlet/controller.js`, `board/proxies.js`, `surfaces/lift.js`, `surfaces/index.js`, `scene/stage.js` (scrollTo guard).
- **CSS:** `styles/desk.css` (press transform gate, `.vc-far` icons).
- **Governor:** `scene/governor.js`, `scene/stage.js`, `config/render.js`.
- **Dead code:** `ink/index.js`, `config/motion.js`, `board/layout.js`, `gauntlet/rig.js`.
- **Docs:** `DECISIONS.md`, `CHANGELOG.md`, `STATUS.md`, `docs/explained/README.md`.

## Open points

1. **NEEDS PAUL: the cut list** (section 6). The two candidates with a measured effect on his screen are MSAA 4× → 2×/FXAA at 2× pixel ratio and a quarter-size veil. The ink wash as the governor's last step on weak machines needs his yes.
2. **The first frame of a big table and the row-height burn** still go over 16.7 ms. The cause is in `app.js`'s one-task render (parity reference) and in the row scale restyle. A later WP could split `app.js`'s render behind an unchanged DOM result, or burn a snapshot.
3. **Start-up long tasks** were not changed.
4. **wp04 spec 5's name** still says "never climb". The forced-frame sequence it drives is unchanged, because forced frames never climb. Not run this session.
5. **Not run this session:** golden, census and the full parity suite (18C), and the other WP-16/17 tools.
