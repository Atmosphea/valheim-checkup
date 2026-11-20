# Architecture (for whoever maintains this next)

Valheim Checkup 3D is one HTML file. The original checker (`src/app.js`, `src/core.js`, `src/catalog.json`) renders the page and stays the source of truth; everything else dresses that page, either as a 3D desk or as a flat parchment page. Saves never leave the browser.

## Layers, from the bottom up

| Layer | Where | What it owns |
| --- | --- | --- |
| Data and rules | `core.js`, `catalog.json`, `app.js` (never edited, except `app.js` as listed in `docs/app-js-changes.md`) | Parsing the `.fch`, every collection, the DOM table, filters, Details. Parity and the census read this DOM. |
| Bus | `bus.js`, `events.js` | `emit`/`on` for everything that happens (`app:render`, `app:category`, `rows:burn`, …). Modules talk only through it and through `window.__vc` (debug API, `debug.js`). |
| Mode | `mode.js` | `desk` or `flat`, picked once at start. Flat never loads three.js (`main.js` imports `scene/stage.js` only on the desk). |
| Clock and scheduler | `util/clock.js` | The single frame loop (below). |
| Layout cache | `util/layout-epoch.js` | `cached(key, read)`: a layout read that is re-measured only after scroll, resize, fonts, a render or a DOM/class change. |
| 3D desk | `scene/` (stage, camera, lights, post, veil, overlays, governor), `board/`, `gauntlet/`, `paper/` | WebGL renderer 1 (`#scene`: desk, board, gauntlet, bloom), renderer 2 (`#veil`: the paper's lighting over the printed page), 2D canvases (`#glow`, `#fx`, `#grain`), and the printed page itself as a CSS3D object (`#print`). |
| Surfaces | `surfaces/` | What happens on the printed page: title, lift (scroll), menus, Details unfold and burn, row burn, row window, slips, tags. |
| Ink | `ink/` | The wash, stamps and dots (both modes). |
| Sound | `audio/` | Web Audio, built lazily in idle slices; wired to bus events. |
| Flat skin | `flat/`, `styles/flat.css` | The parchment page and its surfaces on phones and on `?mode=flat`. |
| Config | `config/render.js`, `motion.js`, `layout.js`, `audio-mix.json` | Every number Paul may want changed. Code reads config; it does not hold its own tuning. |

## One clock, one frame (WP-18P)

Nothing calls `requestAnimationFrame` or `requestIdleCallback` itself. Two exceptions, on purpose: `app.js`'s own progress-bar animation (original code, parity reference) and `perf.js` (the `?perf` overlay measures the browser's frame rate, so it can't run inside the thing it measures).

Each animation frame, `clock.tick()` runs, in this order:

1. **read**: `clock.onRead(fn)` and one-shot `clock.nextRead(fn)`. Layout reads only (`offsetTop`, `getBoundingClientRect`, `elementFromPoint`). The layout is still clean from the last paint, so reads are free here.
2. **timers**: `clock.after(ms, fn)`, in scaled clock time (`__vc.timeScale` slows everything for tests).
3. **frame**: `clock.onFrame(fn)` and the stage's phases (`scene/frame.js`: input → physics → scene → veil → overlays → print). Writes only: styles, classes, uniforms, draws.
4. **next-frame one-shots**: `clock.nextFrame(fn)` queued during the previous tick (the "start an animation after a paint" pattern).
5. **idle**: `clock.idle(task, {timeoutMs})` runs only while this tick's JS is under 5 ms. A task may be a generator: one `yield` per slice (the sound bank builds one sound per slice). A task with a timeout runs by then anyway.

Rule of thumb: **read in read, write in frame**. A read after a write in the same frame forces the browser to restyle and lay out the page in the middle of the frame. Before WP-18P the profiler found about 10 such reads per frame during a view change. Where a read can't move into the read phase, wrap it in `cached()`.

## The printed page and why it is expensive

The page is one big DOM (≈5,700 elements; The Carpenter's table alone is 400 rows, ≈5,000 elements) under a CSS3D transform. Under a 3D transform Chromium can't cull, so it paints the whole table, not just what's on screen. What keeps it cheap:

- `surfaces/row-window.js` hides only the icons of rows more than one screen above or below the view (`tr.vc-far .vc-icon {visibility:hidden}`). The rows, their text and their handlers stay in place, so parity, the census and exports see the same page.
- Button press transforms are only set on buttons that are actually pressed (`desk.css`, `[style*="--vc-press"]`). A transform on every button made 400 compositing nodes to layerize each frame.
- `window.scrollTo` is a no-op on the desk when the window is already there (`stage.js`). The window never scrolls on the desk, and app.js's call forced a full table layout on every view change.

## Quality: tiers, trims and the governor

`config/render.js quality` defines the tiers: High, Medium, Low, and Flat (Low with no post effects, reached only by hand). `scene/governor.js` is pure logic, unit-tested in `unit/scene.test.mjs` and `unit/wp18p.test.mjs`:

1. **Benchmark** (60 frames once the textures exist) picks the start tier.
2. **Trims** act inside a tier, before frames drop. A 750 ms window in which half the frames are strained (JS over 60 % of the budget, or late) adds one trim step: the reflection cube refreshes ½ as often, then the 3D layers' pixel ratio ×0.85 and ×0.75 (never below 1).
3. **Tier drop**: the 2 s average is over 20 ms *and* half the frames are late. A view change's short burst doesn't count.
4. **Climb**: 5 s of headroom gives back one trim step, then one tier. A tier climbs back only on GPU-timer evidence (`scene/gpu-timer.js`; Chrome has it, Safari and Firefox don't). A step that is undone right after a climb waits longer before the next climb (15 s, 30 s, … 2 min).
5. Idle frames count for nothing: the 3D layers render on demand.

`__vc.stage.holdGovernor(true)` freezes it for pixel diffs and timing. `__vc.quality(t)` picks a tier by hand, and that tier becomes the highest the governor climbs back to. `__vc.stage.stats().governor`, `qualityLog` and `trimLog` show what it did.

## Measuring

`node tools/wp18p-perf.cjs <label> [html] [--only=view,details,rows,load,startup] [--frames] [--hold] [--throttle=4] [--tier=low]` drives every content transition on the real GPU at 1440×900. It writes `docs/reports/wp-18p/perf-<label>.json`: worst frame, frames over 16.7/33 ms, main-thread and GPU ms, and top costs. Build an unminified copy first (`npx vite build --mode single --minify false --outDir work/…`) to get per-module attribution. This machine is noisy (8 GB RAM, other apps), so compare builds interleaved and repeated.

## Adding something

- An animation: `clock.onFrame` (stop it by calling the function it returns) or a stage phase. Read layout in `clock.onRead`.
- Work that can wait: `clock.idle`, as a generator if it's long.
- A number: put it in `config/`, with a comment saying who asked for it.
- A decision: add a row to `DECISIONS.md`.
- Never edit `src/core.js`, `src/catalog.json` or `../valheim-checkup`. Never weaken `parity.spec.js`, `golden.spec.js` or the census tests.
