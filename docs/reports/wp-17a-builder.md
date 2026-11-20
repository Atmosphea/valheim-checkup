# WP-17A builder report: camera, layout, smoothness, bugs

Scope: items 1–12 of `spec/wp-17-feedback.md` (session 17A only). Paul's words override files 00–07 and WP-16; each override is in DECISIONS as "Paul, WP-17 item n", with builder calls marked "WP-17A". No full parity run (17C does it).

Acceptance: **12 / 12 PASS** (self-check). `tools/wp17a-check.cjs all`: **43 / 43**. All runs used the real GPU (Chromium, ANGLE Metal, 1440 × 900 at 2×), with at most 2 workers. Logs are in `docs/reports/wp-17a/`. Screenshots are there too, with the name masked as `{name}`. "Before" numbers come from the v2.1.0 build in `valheim-checkup-3d.zip` (`BEFORE=`).

## Test results

| Run | Result |
| --- | --- |
| `npm run build:all` | exit 0; `dist/` rebuilt; 127.0.0.1:8080 answers 200 |
| `node scripts/test.cjs` | pass |
| `npm run test:unit` | 152 / 152 (scene/wp07 layout assertions updated for items 3–4, each with an item comment) |
| `node tools/wp16a-check.cjs flash` | 4 / 4 clean (0 load, 0 view flashes; it caught a 17A regression first, fixed, see below) |
| `node tools/wp17a-check.cjs all` | 43 / 43, no page or console errors (`check-all.txt`) |
| `node tools/wp16a-check.cjs` | 7 / 7 (zoom/spark retired, item 2); still-desk GPU 96–119 ms/s (16A: 128), moving 60 fps |
| `node tools/wp16b-check.cjs` | 38 / 38 (camera helpers updated, item 2) |
| `node tools/wp16c-check.cjs all` | 58 / 58 alone; in the 2-worker run, item 26's statusFilter drift read 9.9 px once, with the camera still mid-zoom. Re-run alone 3 times: 1.95 px each (appended to `wp16c-all.txt`) |
| `node tools/wp11-check.cjs` | 36 / 42. The 6 failures (details ×3, menus by mouse, tooltips ×2) fail the same way on the v2.1.0 build; they predate 17A and are not caused by it |
| `node tools/wp07-check.cjs` | 10 / 33, identical to the v2.1.0 build (collectionLabel overlap rule predates WP-16C) |

## Acceptance items

| # | Paul asked for | Evidence | Shot |
| --- | --- | --- | --- |
| 1 | Drop-downs above everything, box width | Cause: the WP-11 slip's `preserve-3d` depth sort beat the menu's z-index. With one scroller (item 6) every list item hit-tests as itself; widths 337/168/193/194 px = their boxes. | `menu-over-table.png` |
| 2 | No wheel/pinch zoom; frame the main section; out over wood/header; click zoom | Default framing 1, zoom 1.287; wheel scrolls 0 → 960 px, camera unchanged; ctrl+wheel swallowed. Over the woodblock or the coins: framing 0.001. A click on the right margin: ×1.300; a second click or the pointer back on the page ends it. | `camera-*.png` |
| 3 | Bigger main section, left edge closer | 69 × 50.2 cm (was 58 × 39.2): ×1.52 the area; the sheet's left edge 13 cm from it (was 36). | `camera-main.png` |
| 4 | Header split, no seam | Title, byline and records live in `.vc-masthead` inside the scroll; at scroll 300 the coins moved 0.0 px and the title 137 px. Blank paper either side of the old edge: 189 vs 189. | `header-*.png` |
| 5 | Content under the burned edge or fading along it | Fade (print can't go under the WebGL paper): mask from the deckle bitmap × ink grain; once the heading sticks, rows go under it. Band under the edge s.d. 5.3 (the burn texture) vs rows 11.5. | `edge-scrolled.png` |
| 6 | One smooth scroll | One native scroll box, no slip; head-to-table gap 0 at every offset in the same frame; wheel scroll 120/120 frames drawn, max 16.8 ms. | — |
| 7 | Seamless load-in | Before: white, then grey-blue #0c131c until ~1.2 s, black until ~2.0 s. Now 0 grey frames; the first painted desk frame already shows paper, which only brightens as the light fades in. | `load-frame-0…3.jpg` |
| 8 | Noisy, faster wash; stamps mid-wash | Noise ×1.9 + pigment specks; ~2.24 s in all (16C: ~3.2 s); stamps at 1.10–1.48 s = 49–66 % of the wash; the title block washes too. | `wash-mid.png` |
| 9 | Swap Undiscovered/Unverified; Missing fills from the bottom | Order Completed, Missing, Undiscovered, Unverified; Missing dots `wrap-reverse`, filled dots lower (mean y 372.8 vs 359.9). | `stamps.png` |
| 10a | No dropped frames while something animates | Gauntlet animating on screen: 180/180 frames drawn, max 16.8 ms. At session start an off-screen/at-rest bob made the throttle skip frames of the visible gauntlet (15/180 drawn); now only on-screen casters count. The still desk still idles (15/180). | — |
| 10b | Release hitch, measured | Before (v2.1.0): worst frame 67–117 ms, 4–5 long frames (51–149 ms) through the wash. Now: worst 50–67 ms, one long frame (55–71 ms) at the release itself, none in the wash. Fixed: grain blobs off the wash, ghost pre-warmed at prelatch (snapshot 0 ms at release, was 10–22 ms), no second ghost for the board's stopped click. | — |
| 11 | No sheen seam at 180°, subtler flash with glow | Seam normals identical (max difference 0) over 18 rings; band wraps; glint 1.6 → 0.9 with a 0.07 glow. | `knob-glint.png` |
| 12 | Darker desk | Shade 2.6 → 1.95: same camera and light, luminance × 0.77 (77.0 vs 100.0). | `desk.png` |

## Bugs found on the way (fixed)

- **View-change flicker** (wp16a flash, 1 jump of ~5/255): when the ghost was removed, every out-unit's damp band in the veil vanished at once. With 17A's large units (masthead, page head) that was a whole-screen step. The bands now dry off from the last rect.
- **`#print` scrolled aside**: focusing the Load coin scrolled the CSS3D layer ~1,000 px. It is now `overflow: clip` with a scroll reset.
- **Masthead under the coins**: its coin-side 23 cm is a margin, not padding, so its box never takes the coins' pointer.

## Open points

1. **NEEDS PAUL: the remaining release frame (10b).** About 57 ms of it is app.js's own `setCategory` render, about 39 ms of that being `core.evaluate` stats for every category, run twice per render. app.js is the parity reference and core.js is off-limits, so it was not changed. Possible fixes: memoise the stats per save/mode/overrides in app.js (a parity-safe edit, 17C would verify), or accept one ~60 ms frame per selection.
2. **NEEDS PAUL: taste.**
   - The desk darkness (×0.77).
   - The wash look (noise, specks, 2.2 s).
   - The edge fade width (0.7 cm in, 1.1 cm fade).
   - The main framing (zoom 1.287) and its zone lines (wood x −25, header y 15.4).
   - The tag strip's width (10 cm).
3. One 100 ms frame was seen once on the still desk (`check-all.txt`, 10a still, LoAF 116 ms) with nothing moving. It was not reproduced; possibly the idle-time grain-pool fill or GC. Worth watching in 17B.
4. The flash, menu-drift and wp11 tooltip checks rely on hover/camera timing. Under 2-worker load, 16C item 26 can sample the camera mid-zoom.

## Files

- Source: `src/config/{layout,motion,render}.js`, `src/scene/{camera-rig,stage,overlays}.js`, `src/scene/scene.css`, `src/template.html`, `src/paper/{index,layout}.js`, `src/surfaces/{lift,title,menus}.js`, `src/surfaces/surfaces.css`, `src/styles/desk.css`, `src/ink/{index,masks,stamps}.js`, `src/ink/ink.css`, `src/board/{bars,proxies}.js`, `src/gauntlet/controller.js`.
- Tests and tools:
  - New: `tools/wp17a-check.cjs`, `tools/retired/wp16a-zoom-spark.cjs.txt`.
  - Updated: `tools/wp16a-check.cjs`, `tools/wp16b-check.cjs`, `tools/wp16c-check.cjs`, `tools/wp11-check.cjs`, `tools/wp07-check.cjs`, `tools/wp08-check.cjs` (`VC_HTML`), `unit/scene.test.mjs`, `unit/wp07.test.mjs`, `unit/wp10.test.mjs`.
- Not touched: `src/core.js`, `src/catalog.json`, `src/app.js`, `checker-reports/`, `../valheim-checkup`.
