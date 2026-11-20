# WP-18A builder report: loading, smoothness, camera, layout

Scope: items 1–10 of `spec/wp-18-feedback.md` (session 18A only). Paul's words override files 00–07 and WP-16/17; each override is in DECISIONS as "Paul, WP-18 item n", builder calls are tagged "WP-18A". No full parity run (18C does it).

Acceptance: **10 / 10 PASS** (self-check), 3 NEEDS PAUL points below. `tools/wp18a-check.cjs all` (BEFORE = the v2.2.0 build): **41 / 41**, no page or console errors.
- Real GPU (Chromium, ANGLE Metal, 1440 × 900), one worker.
- Log and screenshots in `docs/reports/wp-18a/`, the name masked as `{name}`. Character-name scan: 0 hits in every file this session wrote; probe frames that showed it were deleted.

## Test results

| Run | Result |
| --- | --- |
| `node tools/wp18a-check.cjs all` (BEFORE = v2.2.0) | **41 / 41** (`check-all.txt`); item 9 re-run on the final `build:all` output: 7 / 7 |
| `node tools/wp16a-check.cjs flash` | 4 / 4 clean, on the final build: 0 load and 0 view flashes |
| `node scripts/test.cjs` | pass |
| `npm run test:unit` | 154 / 154 (`unit/scene.test.mjs` layout assertions changed for items 7–8, below) |
| `node tools/wp16b-check.cjs reticle,freeze,catch,twirl` | 14 / 15. The one FAIL, "catch with inertia", is item 6's camera, not the hand: see "Checks Paul's items change" |
| `node tools/wp17a-check.cjs camera,edge` | 10 / 11. The one FAIL, "no row shows under the burned edge", is the closer framing changing the reference window: see below |
| `npm run build:all` | exit 0; 127.0.0.1:8080 answers 200 |

## Acceptance items

| # | Paul asked for | What was wrong / what changed | Evidence |
| --- | --- | --- | --- |
| 1 | No dark square behind loading pieces | **Cause:** the ink wash's "damp band" (`paper.washDampDarken` 0.06), a veil-shader patch that darkened a flat rectangle behind every piece while it washed in (and merged neighbouring pieces into bigger blocks). Not a backdrop, texture alpha or warm-up snapshot. **Fix:** strength 0, and the patch is no longer installed. | Pixel check during load (time × 0.2, six frames, 16 px blocks so the moving film grain cancels): largest fully darkened square **19 × 19 blocks on v2.2.0 → 2 × 2 now**; darkened paper 79 % → 4 % (the 4 % is thin strips along text still inking in, gone by 640 ms). |
| 2 | No beat at the fifth unfold; a little faster | The 5th piece is the collection title. After the first pieces (all done by 675 ms) nothing started until the stamps (1,100 ms) and the table (1,250 ms): ~600 ms of still paper. Retimed (`motion.js`, old values in a comment) so every piece starts before the last ends. | 19 pieces, longest pause 0 ms; title 460 ms → description 500 ms; all pieces in by 1,585 ms (was ~1.9 s); last dot 1,985 ms (was 2.8 s). |
| 3 | Frame drops when the cursor leaves the table: name the cause | **Cause, in plain words:** while the cursor is on the paper the gauntlet waits off-screen with a gentle bob. The desk counted that hidden bob as "something casting a shadow moved", so it **redrew both shadow maps every frame** (v2.2.0: 74 of 74 frames). That took most of the frame's GPU budget (~15 of 16.7 ms measured). When the cursor left the table, the camera then **kept creeping for ~2.4 s** in steps too small to see, so the whole desk and the whole printed page (400 rows) re-rendered every frame on top of that. Scrolling was smooth because the browser scrolls on its own thread while the camera is still. **Fixes:** a hidden gauntlet no longer marks the shadows dirty, and the camera springs stop when the remaining motion is below a pixel. | Shadow redraws with the pointer resting on the table: **74/74 → 0/14 frames**. Camera still after leaving: **2,357 → 1,180 ms**. GPU timer per frame ~3–10 ms lower (ANGLE/Metal timer is noisy; used before/after only). The drop itself didn't reproduce as rAF gaps on this Mac, so the cause is reported from the measured work. |
| 4 | Remove the scroll-stop sound | The table's "slip" settle no longer plays `paper.settle`; other sheets keep theirs. | Scroll 1,100 px and stop: no `paper.settle` request. |
| 5 | Spark out: gauntlet idles, ignores the mouse, stretches now and then; the rest stays | New `resting` state (spark fully out, nothing held): idle hover pose, no finger trail from mouse speed. The stretch is played **only** while resting (first after 5–9 s, then every 15–28 s); the old "3 s without moving the mouse" stretch is gone. | Hand moved 0.00 cm while the pointer swept the sheet; stretch seen within 12 s; none in 10 s as the cursor. Freeze, catch, reticle, twirl: wp16b 14/15 (see below). With the camera held still the catch swings 1.276 cm past, v2.2.0 1.295 cm. |
| 6 | Main +20 %, header zoom-out unchanged, collections 50 % closer | New framing solver (`camera-rig.js`): main = fit × 1.2; header zoom keeps the same main ÷ header step as before; the woodblock framing is 1.5× the whole-desk view, with the woodblock still running off the window's left edge. | px/cm main 17.83 → 21.77 (**× 1.221**); main ÷ header 1.314 → 1.337; collections 13.53 → 20.22 (**× 1.494**); at x 4 px the gauntlet is on the woodblock. |
| 7 | Title centred on the sheet (equal margins), woodblock stays, masthead centred above | Sheet's left edge −36 → −25 cm (73 × 54 cm): 3.79 cm of paper each side of the table. The tag strip moved with the edge. The masthead is centred over the title. The woodblock didn't move. | Margins **70.4 vs 69.2 px**; title centre 752, sheet centre 753 px; masthead centre 751 px, above the title. |
| 8 | Coins closer, not in a line, never on text; more dramatic, better, retriggerable hover | Desk: a cluster around the Load coin (gaps ≤ 0.24 cm, heights span 5.9 cm). Hover: hop 0.6 → 0.95, tilt 8° → 22°, spin 15° → 75° with an overshoot; a new hover restarts it after 120 ms. Hit test is now the coin's round face (+4 %) checked every frame, not the square HTML proxy. Flat: gap 9 → 3 px, ±6–8 px off the line, a full spin on hover. | 0 coins over text, with and without a save; caught at 96 % of the radius; a re-hover restarted hop and spin before the last one finished. |
| 9 | One load button, bigger text; button, input and drop all load | Desk: the Load coin's legend is engraved large in the middle of its face. Flat: 14 → 18 px (15 px on narrow screens, 14 px on phones, where it still fits on one line), note 11 → 13 px. **Import ↥ kept** (the user's answer this session: "Keep Import as is"). | Flat and desk: drop on the page loads; the button opens the file picker and loads. No sideways scroll at 1024, 768 and 390 px. |
| 10 | "start here" in script on a circle around the help, a big arrow; only without a save | A canvas on the coins' level: "start here" in IM Fell English italic, red-brown ink, on the How-to coin's ring (lower-left arc), and a hand-drawn arrow from the free paper above. `aria-hidden`, no page text. Fades out once a save is loaded or the table is scrolled. Desk only. | Drawn and shown with no save; crosses no text; gone after loading. |

Screenshots: `camera-main.png`, `camera-header.png`, `camera-collections.png`, `centred.png`, `coins.png`, `start-here.png`, `start-here-close.png`.

## Checks Paul's items change

- `unit/scene.test.mjs` (items 7–8): the sheet's `x0` (−36 → −25), the tag strip and the coin positions, each with an item comment.
- **`tools/wp16b-check.cjs` "catch with inertia" (left as it is).** It now reads 0 cm. The test returns the pointer to x 30 px, which now enters the 1.5× woodblock framing (item 6); the camera moves for ~1 s while the hand flies, so the target keeps sliding and soaks up the swing. With the camera pinned, both builds swing alike: 1.276 vs 1.295 cm (new check in `wp18a-check.cjs catch`).
- **`tools/wp17a-check.cjs` "no row under the burned edge" (left as it is).** It reads 6.1 vs 10.1 (limit 55 %). The screenshot shows no row text between the edge and the stuck heading. The ratio moved because the 20 % closer zoom puts less text in the rows' fixed reference window (14.4 → 10.1).
- Debug only: `__vc.board.state().coins` adds `spinning`, `hopT0`, `r` and `at`; `__vc.ink.units()` is new.

## Found on the way (fixed)

- **Woodblock framing showed bare desk at the left edge.** Centring x −19 cm at 1.5× left ~2.5 cm of desk at the window's left edge, where the cursor turned back into the spark. It is now aimed so the woodblock runs off the left edge, as WP-16 items 7–8 want.
- **"start here" stayed after loading.** It watched a `#loadTop` element that is re-seated later. It now follows `app:render`/`app:load`.

## Not done / side effects

- **Report images overwritten.** Re-running the 16B and 17A sections rewrote `docs/reports/wp-16b/reticle.png`, `twirl-burst.png` and `docs/reports/wp-17a/camera-click-zoom.png`, `camera-main.png`, `camera-wood.png`, `edge-scrolled.png`. They now show this build (name masked). There is no git history to restore the originals.
- Other WP-16/17 tools were not re-run in full (18C runs the full suite).

## Open points

1. **NEEDS PAUL: main framing at 1440 × 900.** At +20 % the main view trims about 1 cm off the table's left edge (the Completed tile) and puts the coin cluster at the window's top-right corner. Coins and table are fully seen in the header view.
2. **NEEDS PAUL: coins over a scrolled table.** The coins and the help note sit on a fixed level above the main section (WP-17 item 4), so when the table scrolls, rows pass under them. v2.2.0 does the same. Unscrolled, nothing is covered (checked). Fading the rows out under the coins is possible (the scroll mask already does this along the burned edge), if Paul wants "never cover text" to hold while scrolled too.
3. **NEEDS PAUL: taste.**
   - The "start here" script, colour and arrow.
   - The coin cluster's arrangement.
   - The stronger hover (75° spin with a small overshoot).
   - Keeping the Import ↥ coin (spec item 9 asked to remove the icon-only button; the user chose to keep it this session).
4. "start here" is desk only; flat mode has no equivalent yet.
