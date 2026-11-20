# WP-18B builder report: board, table, Details

Scope: items 11–17 of `spec/wp-18-feedback.md` (session 18B only; 18A untouched). Paul's words override files 00–07 and WP-16/17. Each override is in DECISIONS as "Paul, WP-18 item n"; builder calls are tagged "WP-18B". No full parity run (18C does it).

Acceptance: **7 / 7 PASS** (self-check). `tools/wp18b-check.cjs all`: **35 / 35**, with no page or console errors.
- Real GPU (Chromium, ANGLE Metal, 1440 × 900), one worker.
- Log and screenshots are in `docs/reports/wp-18b/`, with the name masked as `{name}`.
- Character-name scan: 0 hits in every file this session wrote. Scratch probe frames were deleted.

## Test results

| Run | Result |
| --- | --- |
| `node tools/wp18b-check.cjs all` | **35 / 35** (`check-all.txt`) |
| `node tools/wp16a-check.cjs flash` | 4 / 4 clean: 0 load flashes, 0 view flashes, bloom corners 0 |
| `node tools/wp18a-check.cjs wash,flow,sound,leave` (18A not broken) | 8 / 8 |
| `node scripts/test.cjs` | pass |
| `npm run test:unit` | 158 / 158 (new `unit/wp18b.test.mjs`; `unit/audio.test.mjs` counts, see item 15) |
| `TARGET=flat playwright test specs/wp12.spec.js` (changed lines) | 5 / 5 |
| `npm run build:all` | exit 0; 127.0.0.1:8080 answers 200 |

## Acceptance items

| # | Paul asked for | What changed | Evidence |
| --- | --- | --- | --- |
| 11 | Notched progress tracks | Shader notches cut into each collection bar's top face, from the end of the gilded fill to the far end (also at 0 %). They stop around the engraved name (both strings) and at the rivet end, and come in whole notches only. Insight bars stay plain. | 11 of 13 bars notched (the 11 collection bars), 2 insight bars plain, 1 bar at 0 % notched. `bars.png`, `bars-close.png` |
| 12 | Row-height release: burn away, rescale, burn in | On release (keys: 350 ms after the last press), a noisy SVG burn (char band, ember rim, bottom first) takes the visible rows away. The row content is rescaled (`--vc-row-k`), and the rows burn back in over about 1 s. The heading row, filters and title are not burned. With reduced motion, or no rows on screen, the new size applies directly. | Font 21.75 → 25.10 px, icon 32.7 → 37.7 px at scale 1.5. Filter on during the burn, gone after. Reduced motion: 0 burns, size applied. `rows-away.png`, `rows-in.png`, `rows-after.png` |
| 13 | Stamp dots | All four stamps use Completed's layout. Missing is the reverse, with its filled run at the end. Undiscovered and Unverified fill from the end. The ink order, glints and fades follow the same order. | Trophy Collector and Gourmet: Completed `1…10…0`, Missing / Undiscovered `0…01…1`, all `row/wrap`. `stamps.png` |
| 14 | Details from nothing, mid-screen | The letter appears where it will lie, from 72 % size and opacity 0, fading in over 420 ms as it unfolds. No box comes from the button. The button's peel is kept. | First frame centre (720, 450); final position (720, 449); button at (1326, 603). Opacity 0.00 → 1. `open-early.png`, `open.png` |
| 15 | A stronger, falling, wind-blown burn with fragments and a crackle | `burn-away.js` was rewritten. The sheet catches, then falls, drifts, sways, turns and tumbles in 3D while it toasts darker. A fast, noisy char front runs ahead of the ember front, which consumes it. Black paper fragments with ember rims tumble on the wind and outlive the sheet. The burn takes 1.5 s (was 1.0 s) and now runs on the central clock. `fold.close` is now built as the crackle. | Fall 303 px, drift 379 px, turn 26°, tumble 22°. 306 fragments at peak, still drifting 640 frames after the sheet is gone. `fold.close` played, no flap. `burn-catch.png`, `burn-fall.png`, `burn-late.png` |
| 16 | A much bigger item icon in a square frame | 44 → 88 px (60 px on narrow screens), with a 2 px ink frame and inset rules. Both modes. | Desk 113 × 113 px on screen, flat 107 × 107 px. `icon-desk.png`, `icon-flat.png` |
| 17 | Gourmet lockup and recipe row | **Lockup:** the name is centred; the framed item icon is on its left; the station icon (same size) and its level as a big number are on its right. **Recipe row** (under the lockup): icon, big quantity, name below, bullets between, then "Makes n" or "n servings", and the in-sheet credit as on trophies. Items without a recipe show only the lockup. **Credits:** `README.md` and `LICENSES/README.md` | **Pancakes:** name centre 722 = header 722; icon and station both 113 px; level "6" at 54 px; "2 Blueberries · 2 Egg · 1 Oat Milk · 2 Oat Flour", 3 bullets, "Makes 3". **Raspberries** and **Blue Mushroom:** lockup only. **Whole Roasted Meadow Boar:** 4 ingredients, "10 servings". **Trophies:** unchanged. `gourmet-pancakes.png`, `gourmet-raw.png`, `gourmet-feast.png` |

## Item 17 icons (builder call)

- All 85 ingredient and station names in `food-recipes.json` now have an icon.
- 47 of them use cells that already exist in the main atlas (matched by Jötunn English name → token).
- The other 38 are raw materials that no collection tracks (Boar Meat, Barley, Ice, …). They are in a small extra sheet, `src/icons/recipe-icons.webp` (50 KB, 96 px cells).
  - It is built offline from the same cached Jötunn images (MIT) by the new `tools/recipe-icons.mjs`.
- The main atlas, `icon-map.json` and the WP-02 counts did not change.

## Checks Paul's items change

- **Item 15, sound counts:**
  - `fold.close` moved from deferred to built (22 → 23 built, 47 → 46 deferred), so the 69-sound total holds.
  - `unit/audio.test.mjs` and `tests/specs/wp12.spec.js` were updated, each with an item comment. The Details-close expectation is now `fold.close` (played).
- **`tools/wp17c-check.cjs close`:** its "burned to nothing in 0.9–1.25 s" check will now read about 1.5 s (item 15).
  - Not re-run, so the WP-17C report images stay as they are.
- **Debug only:** `__vc.board.state().notches` and `.vc-burn[data-frags]`.

## Found on the way (fixed)

- **Under the 3D fall, a CSS filter on the burn copy made Chromium stop drawing it.** The toast is painted on the edge canvas instead.
- **`burn-away.js` read `performance.now()` against file 01's one-clock rule.** It now uses the central clock, so `__vc.timeScale` slows it too.

## Open points

1. **NEEDS PAUL: taste of the burn.**
   - Its length (1.5 s, was about 1 s).
   - The wind strength (it drifts about 380 px sideways by the end).
   - The crackle sound.
2. **NEEDS PAUL: Gourmet extras.**
   - The "Makes n" / "n servings" line under the recipe.
   - The Jötunn station pictures (for example, the Cauldron is a pot on a tripod).
3. **Data as given:** a few recipes list only their first station. For example, Lox Meat Pie shows the Food Preparation Table, not the Stone Oven step. `food-recipes.json` is not edited.
4. **Not run this session:** the other WP-16/17 tools, and the full parity, golden and census suites (18C does these).
