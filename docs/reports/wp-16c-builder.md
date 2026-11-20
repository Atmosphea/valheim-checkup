# WP-16C builder report: header, help letter, Details, menus, titles, columns, stars

Scope: items 18–29 of `spec/wp-16-feedback.md`, the last part of WP-16. Paul's words override files 00–07, and each such change is logged in DECISIONS as "Paul, WP-16 (16C item n)". Each item is also applied to flat mode where it makes sense. Version **2.1.0**.

Acceptance: **12 / 12 PASS** (self-check). `tools/wp16c-check.cjs all`: **58 / 58**. The full suite (parity + golden + census) passes in both modes: flat **71 / 71** (2 workers), desk **71 / 71** (WP=10, 1 worker). 16A and 16B are intact: `wp16a-check flash` is 4 / 4 (0 flashes over 1,585 frames) and `wp16b-check all` is 38 / 38.

All runs used the real GPU (Chromium, ANGLE Metal, Apple M2, 1440 × 900 at 2×), with at most 2 workers. Logs are in `docs/reports/wp-16c/`: `check-all.txt`, `suite-flat.txt`, `suite-desk.txt`, `flash-16a.txt` and `check-16b.txt`.

## Test results

| Run | Result |
| --- | --- |
| `TARGET=flat` parity + golden + census, 2 workers | 71 / 71 |
| `TARGET=desk WP=10` parity + golden + census, 1 worker | 71 / 71 |
| `node tools/wp16c-check.cjs all` | 58 / 58, no page or console errors |
| `node tools/wp16a-check.cjs flash` | 4 / 4: 0 load flashes and 0 view flashes over 1,585 frames; 0 bloom jumps |
| `node tools/wp16b-check.cjs all` | 38 / 38 |
| `node scripts/test.cjs` | pass |
| `npm run test:unit` | 152 / 152 (layout assertions updated for items 20 and 22, each with a "Paul, WP-16 item n" comment) |
| `npm run build:all` | exit 0; `dist/` rebuilt; 127.0.0.1:8080 answers 200 |
| `node scripts/package.cjs` | `valheim-checkup-3d.zip` rewritten (no `fixtures/private`) |
| Name scan (the name is read in memory from the private fixture and never written) across `src`, `dist`, `tools`, `docs/reports/wp-16c`, this report, `docs/explained/wp-16c.md`, DECISIONS, CHANGELOG, STATUS and QUESTIONS | 0 hits. Screenshots are masked to `{name}`. |

## Acceptance items

| # | Paul asked for | Evidence | Shot |
| --- | --- | --- | --- |
| 18 | An ink wash that is visible on entry | Before, the wet edge swept −0.5 → 1.5 widths with an in-out ease and sat on the heading for about 125 ms. Now it moves at an even pace from −0.4 to 1.24 widths over 850 ms, with a wider wet band. It sits on the heading for 516 / 500 / 500 ms on the desk and 516 ms in flat (check: ≥ 450). | `wash-mid-*.png` |
| 19 | A brand that cannot be selected | `user-select: none` and `-webkit-user-drag: none`. A double-click and a drag over "Valheim Checkup" select nothing, in both modes. | — |
| 20 | A smaller header | Desk: the title is 1 cm higher (y 22) and the collection sheet starts 1 cm sooner (inset y1 15), so the header is 11.9 cm (was 12.9). Flat: 136 px at 1440 × 900 (was 172). | `overview-*.png` |
| 21 | No "Bring your Viking's progress / Choose .fch" block, with loading still working | `#dropzone` is hidden in both modes but kept in the DOM, because app.js uses it. The Load control opens the file chooser, the file input loads, and a save dropped anywhere on the page loads, in both modes. | `nosave-*.png` |
| 22 | "How progress is read" at the top right, under the coins | Desk: the note is on its own small strip of paper (`helpStrip`) at the top right, under the coin row and above the collection sheet (x 1128–1320, y 127). Flat: it is in the header's right column, under the coins. | `help-note-desk.png` |
| 23 | Varied coins | Desk: the coin centres spread 13.3 px vertically (howto 79, load 89, import 78, export 91). Each coin rests with its own tilt of 1.6–3.2°. Flat: each coin has its own angle (−9° to 5°) and offset (±2–4 px). | `coins-*.png` |
| 24 | Piece-by-piece fold-outs with the text already printed | The help letter opens in 11 strips, one every ~95 ms (28 → 954 ms). Each strip carries its own part of the printed letter: 11 distinct offsets, with no wipe-in and 0 ink-wash frames. Then the real letter takes over with no duplicate ids, and Escape folds it back to the note. Same in flat. | `fold-mid-*.png`, `fold-open-*.png` |
| 25 | Details in one step, with the button peeling off and floating | A single letter fold, finished 609 ms (desk) and 613 ms (flat) after the sheet appears. The Details button peels off (lifted, turned, bobbing) while the letter is open, then settles back on close. | `details-mid-*.png`, `details-open-*.png` |
| 26 | Drop-downs on the paper plane | On the desk all four lists (status, discovery, biome, sort) open on the paper and move with their box: the box moved 5.7–10.1 px while the list drifted at most 0.22 px from it. Choosing from a paper list sets the filter. Flat keeps its overlay lists. | `menu-on-paper.png` |
| 27 | Bigger, centred, ornate collection titles | Desk 3.0 → 3.7 cm, flat 46 → 58 px. The text centre is within 0.5 % of the row centre. Drawn flourishes on both sides and a red initial. The text is unchanged ("The Master Chef"). | `title-*.png` |
| 28 | Resizable columns, saved per viewer | Dragging the Item edge: desk 622 → 753 px while Status went 165 → 34; flat 381 → 471 px. Widths are stored in `valheim-checkup:vc-column-widths` (written only after a resize) and come back after a reload. With storage blocked it still works and logs no error. Double-click resets. | `columns-*.png` |
| 29 | Outlined starred rows | A starred row has a 1 px-looking gold-brown outline (`rgba(122, 79, 18, 0.55)`); other rows have none. Both modes. | `star-*.png` |

The screenshots are in `docs/reports/wp-16c/`.

## Assertions changed (Paul's items only)

Each change has a comment quoting the item number and a DECISIONS row. Nothing else was loosened.

- `tests/specs/parity.spec.js` P19: the hero is `toBeVisible` on the baseline target and `toBeHidden` otherwise (item 21).
- `tests/census/census.spec.js`: on non-baseline targets, the six hero strings and the `button|Choose .fch file` control are exempt as `PAUL_REMOVED` (item 21).
- `tests/specs/wp12.spec.js`: Details expects 1 flap (item 25).
- `unit/wp07.test.mjs`, `unit/scene.test.mjs`: help-strip placement, coin heights, inset y1 15, helpNote, title y 22 (items 20, 22, 23).

## A bug the full suite found

While a fold runs (~0.6 s), the printed copies of the sheet are in the DOM. Their ids were already removed, but a cloned `label for="itemNote"` doubled the note box's accessible name, and a cloned `<details class="help">` matched `details.help`. This failed the control census, P30 and P34 in flat. The copies now also lose `for`, `name` and `form`, and a cloned `<details>` becomes a `<div class="help vc-details-copy">` with the same look. No test was changed for this.

## Files changed

- **Config:** `src/config/motion.js` (wash path, piece, letter and peel timings), `src/config/layout.js` (title y, coin heights and tilts, inset, help note).
- **Ink:** `src/ink/index.js` (linear wash path), `src/ink/masks.js` (wider wet band).
- **Fold engine:** `src/surfaces/plan.js` (timed plans: five, pieces, letter), `src/surfaces/unfold.js` (printed faces, letter style, safe copies).
- **Surfaces:** `src/surfaces/details.js` (one-step letter, peel), `src/surfaces/help.js` (pieces, fold back to the note), `src/surfaces/menus.js` (paper lists), `src/surfaces/columns.js` (new), `src/surfaces/index.js`, `src/surfaces/surfaces.css`, `src/events.js` (`details:peel`, `table:columns`).
- **Paper and board:** `src/paper/layout.js`, `src/paper/index.js` (help strip), `src/board/coins.js` (resting tilt).
- **Flat:** `src/flat/index.js`, `src/styles/flat.css`. **Desk CSS:** `src/styles/desk.css`.
- **Tests and tools:** the assertions above; `tools/wp16c-check.cjs` (new); `tools/retired/` (wp06 and wp09 checks with a README).
- **Docs:** DECISIONS, CHANGELOG (2.1.0), STATUS, QUESTIONS-FOR-PAUL, `docs/explained/wp-16c.md`, this report. `package.json` version 2.1.0.

Untouched: `../valheim-checkup`, `src/core.js`, `src/catalog.json`, `checker-reports/`.

## Decisions

Fourteen rows in DECISIONS: one per item 18–29, the retired tools, and the safe fold copies. The ones that interpret Paul's words:

- **Item 21:** "remove" means hidden, not deleted, because app.js still needs `#dropzone`. Loading moves to the Load coin and dropping anywhere on the page.
- **Item 22:** on the desk the note is on its own small strip of paper under the coins, so the main sheet's layout is not squeezed.
- **Item 25:** "one step" means a single fold with no rise-then-unfold stages. The peel is CSS on the real button, so it stays clickable and keyboard-reachable.
- **Item 26:** desk only. In flat the overlay list already sits on the page, so nothing changes there.
- **Item 28:** widths are per viewer in localStorage under their own key, so the app's export, import and storage census are untouched.

## Open points (NEEDS PAUL: taste)

1. **Ornaments (27):** are the flourishes and red initial the right amount, or too much?
2. **Peel (25):** is the lift and turn of the Details button (7 px, 58° curl) readable but not distracting?
3. **Wash speed (18):** 850 ms at an even pace. Faster or slower?
4. **Coin tilt (23):** 1.6–3.2° at rest. Enough "varied"?
5. **Help strip (22):** is its place on the desk right?

The 16A open point (GPU cost while the pointer moves) is unchanged.
