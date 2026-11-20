# WP-17B builder report: woodblock, gauntlet, sound, wood burning, brand

Scope: items 13–22 of `spec/wp-17-feedback.md` (session 17B only), plus WP-17A open point 1 (memoise app.js's per-category stats). Paul's words override files 00–07 and WP-16. Each override is in DECISIONS as "Paul, WP-17 item n", and builder calls are marked "WP-17B". No full parity run (17C does it). 17A still passes everything it passed (wp17a-check 43 / 43).

Acceptance: **11 / 11 PASS** (self-check: items 13–22 and 17A-1). `tools/wp17b-check.cjs all`: **30 / 30**, with no page or console errors.
- All runs used the real GPU (Chromium, ANGLE Metal, 1440 × 900 at 2×), with at most 2 workers.
- Logs and screenshots are in `docs/reports/wp-17b/`, with the name masked as `{name}`. A scan of `docs/`, `tools/`, `src/`, the specs and the root logs found the character name in 0 files.

## Test results

| Run | Result |
| --- | --- |
| `npm run build:all` | exit 0; `dist/` rebuilt; 127.0.0.1:8080 answers 200 and serves the 17B code (single file and `site/`) |
| `node scripts/test.cjs` | pass |
| `npm run test:unit` | 152 / 152 (`unit/audio.test.mjs` counts and amb.hall take length updated, item 21 comments) |
| `node tools/wp16a-check.cjs flash` | 4 / 4 clean (0 load, 0 view flashes over 1,599 frames; bloom 0 jumps) |
| `node tools/wp17b-check.cjs all` (BEFORE = this session's build before the memo) | 30 / 30 (`check-all.txt`) |
| `node tools/wp17a-check.cjs all` | 43 / 43 (latch point 17.85 → 17.65 for item 14's shorter bar) (`wp17a-all.txt`) |
| `node tools/wp16b-check.cjs` | 38 / 38, unchanged (`wp16b-all.txt`) |
| `node tools/wp16c-check.cjs all` | 58 / 58, unchanged (`wp16c-all.txt`) |
| `node tools/wp11-check.cjs` | 36 / 42 (`wp11-all.txt`). Title now expects 14 flourishes (item 22) and passes. The same 6 failures 17A recorded as predating it (details ×3, menus by mouse, tooltips ×2) |
| `TARGET=flat npx playwright test specs/wp12.spec.js` (1 worker) | 5 / 5 (built/deferred 22/47 and soundboard 22 playable, item 21 comments) |

## Acceptance items

| # | Paul asked for | Evidence | Shot |
| --- | --- | --- | --- |
| 13 | Slider fades the view with its travel | Halfway: fade 0.45, opacity 0.55. Short release: back to 0 / 1 within 0.7 s. At the latch: 1 / 0. After the wash: 0 / 1, new view shown. Over 50 % faded, the wash skips its fade-out. | — |
| 14 | Progress fill on the bars; thicker bars; bigger plaque | Fill on every collection bar = done / total within 2 % (13 bars; insight pages 0). Bars 1.48 cm tall (was 1.26), 10.5 long. Plaque 19.4 × 4.7 cm (was 17 × 4.1). Inlays removed. | `board.png` |
| 15 | Thicker, dark-filled engraved counts | Tab 2.3 × 1.4 cm, 52 px glyphs, bold 4 texels, cut 0.06 deep, shade 0.03. Darkest tenth of the tab's pixels 58 vs brightest 188 (× 0.31). | `tab-count.png`, `board.png` |
| 16 | Ember glow on burned labels near the gauntlet | Gauntlet over the woodblock: ember k 1 at its tip. Pointer away: k 0.012 after 3 s (700 ms release). | `ember.png` |
| 17 | Vertical row-height slider; rows 1.3× by default | Default 1.3: row 67 px (17A: 52). Keyboard: End 114 px, Home 52 px. Mouse drag on the thumb raises it (1.30) and the fingers curl. Kept across a reload (localStorage). Proxy `role="slider"`, vertical. | `row-slider.png` |
| 18 | Finger curl over the whole bar | Pointer over the middle of bar 3's body: `over` true, pose pinchReady. Off the bar: false. | `curl-bar.png` |
| 19 | Left-hand first-person gauntlet from the bottom left | `hand` left. At 4 screen points the elbow is left of and below the wrist (e.g. elbow (−84, −49), wrist (−61, −17)). Settled tip lag 0.014 cm (max 0.15 in a fast sweep). The mirror broke nothing, so there was no NEEDS PAUL stop. | `left-hand.png` |
| 20 | Click-drag wood burning, saved per viewer | A drag on the desk: 13 points, hot. After 3 s: heat 0, char 0.82. A drag on the paper: nothing. After a reload: the same stroke. Both desk and woodblock border are burnable. | `burn-hot.png` |
| 21 | Quiet tavern ambience | None before the first input. After one key press `amb.hall` loops on the ambience bus at −32 dB. Mute stops it, unmute restarts it within 1.6 s. Generated in code, built in idle time. | — |
| 22 | 3× brand embellishments; OFL Gothic font side by side | 14 flourishes (was 6), 262 cubic segments (WP-11: 12), most ending in a volute. None touches a letter in any face. Grenze Gotisch kept: in UnifrakturMaguntia and UnifrakturCook the Fraktur V reads as B or D. | `brand-grenze.png`, `brand-maguntia.png`, `brand-cook.png` |
| 17A-1 | No lag on slider release (memoise stats) | Long frames on release (LoAF), before → after: Gourmet 51 → none, Hunter 54 → none, Carpenter 108 → 63 ms. `core.evaluate` in the release profile: ~39 → 3.6 ms. Output identical before and after across 9 steps (load, view, mode, corrections done/missing/auto); see `docs/app-js-changes.md` #15. | — |

## Bugs found on the way (fixed)

- **Row-height proxy ignored the mouse.** The board's proxy layer is `pointer-events: none`, so only the keyboard worked; the proxy now takes the pointer like the bar proxies.
- **Item 22's longer paths cost ~19 ms per 0.7 s.** The title's per-frame `getPointAtLength` is replaced by a track sampled at build.
- **Bar fill shader threw at start-up.** `THREE.Color` has no `divide`; the division is now done per channel.

## Decisions (DECISIONS.md, 2026-11-11)

Paul, WP-17 items 13–22, one row each. Builder calls tagged WP-17B:
- The font devDependencies, logged before install.
- The row height applies on the desk only.
- The stats memo.
- The proxy pointer-events fix.
- The sampled pen-tip track.
- The checks the new layout contradicts.

## Files

- **New:**
  - `src/board/rowheight.js`, `src/scene/woodburn.js`, `src/audio/recipes/ambience.js`
  - `tools/wp17b-check.cjs`
  - `docs/explained/wp-17b.md`, this report and `docs/reports/wp-17b/`
- **Changed:**
  - `src/app.js` (line 25 only, still 142 lines)
  - `src/ink/index.js`
  - `src/board/`: `bars.js`, `woodblock.js`, `engravings.js`, `layout.js`, `index.js`, `burn.js`, `board.css`
  - `src/gauntlet/`: `controller.js`, `rig.js`, `index.js`
  - `src/scene/stage.js`
  - `src/audio/`: `engine.js`, `wiring.js`, `index.js`, `recipes/index.js`
  - `src/config/`: `motion.js`, `layout.js`, `render.js`, `audio-mix.json`
  - `src/surfaces/title.js`, `src/styles/desk.css`
  - `package.json` (2 devDependencies, exact)
  - `unit/audio.test.mjs`, `tests/specs/wp12.spec.js`
  - `tools/wp17a-check.cjs`, `tools/wp11-check.cjs`
  - `docs/app-js-changes.md`, `LICENSES/README.md`, `DECISIONS.md`, `CHANGELOG.md`, `STATUS.md`

## Open points

1. **NEEDS PAUL: the Carpenter release.** It still has one ~55–63 ms frame (108 before). Profile: app.js's own 400-row render and its `window.scrollTo` forced layout (~16 ms). Other collections release with no long frame. Going further means changing app.js beyond the memo (e.g. deferring its scroll), which is a parity question for Paul.
2. **NEEDS PAUL: taste checks to listen to and look at.**
   - The generated ambience: character, and the −32 dB level from file 06.
   - The left-hand pose.
   - Keeping Grenze Gotisch over the Unifraktur faces.
3. **17C's full parity run verifies the app.js memo.** The text comparison here covered 9 steps; this save has equal counts in both record modes, so mode is covered by the key, not by a visible difference.
4. **Ember values are shared with 17C item 27.** `render.js ember` is meant to be reused there.
5. **Old wp11 failures.** The 6 failures that predate 17A are unchanged.
