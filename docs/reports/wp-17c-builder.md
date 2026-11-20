# WP-17C builder report: table, highlights, Details (and the WP-17 close-out)

Scope: items 23–30 of `spec/wp-17-feedback.md` (item 28 as revised: a normal new-tab wiki link, no second paper), the 17B overlap check (plain click zooms, drag burns), the full parity + golden + census suite on both targets (which also verifies the 17B app.js stats memo), version 2.2.0, `npm run build:all` and `node scripts/package.cjs`. Paul's words override files 00–07 and WP-16. Each override is in DECISIONS as "Paul, WP-17 item n"; builder calls are tagged "WP-17C".

Acceptance: **9 / 9 PASS** (self-check: items 23–30 and the 17B overlap). `tools/wp17c-check.cjs all`: **43 / 43**, with no page or console errors.
- All runs used the real GPU (Chromium, ANGLE Metal, 1440 × 900 at 2×), at most 2 workers.
- Logs and screenshots are in `docs/reports/wp-17c/`, with the name masked as `{name}`.
- Character-name scan: 0 entries in the 2.2.0 zip, 0 in every file this session wrote.

## Test results

| Run | Result |
| --- | --- |
| `TARGET=flat` parity + golden + census, 2 workers | **71 / 71** (`suite-flat.txt`; first run 5 failures, all from items 23/25, edited as below) |
| `TARGET=desk WP=10 WORKERS=1` parity + golden + census | **71 / 71** (`suite-desk.txt`, 8.3 min). It verifies the 17B app.js memo |
| `node tools/wp17c-check.cjs all` (BEFORE = v2.1.0 zip build) | 43 / 43 (`check-all.txt`), run on the final `build:all` output |
| `node tools/wp16a-check.cjs flash` | 4 / 4 clean: 0 load and 0 view flashes over 1,614 frames; bloom 0 jumps |
| `node scripts/test.cjs` | pass |
| `npm run test:unit` | 154 / 154 (new `unit/wp17c.test.mjs`: every catalog trophy maps to one wiki entry; facts and the no-entry case) |
| `node tools/wp17a-check.cjs all` | 43 / 43 |
| `node tools/wp17b-check.cjs all` | 30 / 30. Carpenter ceiling changed for item 23 (below); it measured 79 ms (90–123 ms in two earlier runs) |
| `node tools/wp16b-check.cjs` | 38 / 38 |
| `node tools/wp16c-check.cjs all` | 58 / 58 (menu pick by value, item 23) |
| `node tools/wp11-check.cjs` | 36 / 42, the same 6 failures that predate 17A (details ×3, menus by mouse, tooltips ×2) |
| `TARGET=flat specs/wp12.spec.js` (1 worker) | 5 / 5 (close waits for the letter to open, item 27) |
| `TARGET=flat specs/wp01.spec.js` | 2 failures, both older than 17C and not touched: `bodyClass` expects no `vc-paper` (added by WP-13) and the canonical-event regex has no `details:` / `menu:` (WP-11/16C events) |
| `npm run build:all` | exit 0. 127.0.0.1:8080 answers 200; `valheim-checkup.html` and `site/` carry the 17C code |
| `node scripts/package.cjs` | `valheim-checkup-3d.zip` 2.2.0, 386,090,400 bytes (368.2 MB, 654 entries; most of it is evidence PNGs, as in WP-15) |

## Acceptance items

| # | Paul asked for | Evidence | Shot |
| --- | --- | --- | --- |
| 23 | Default shows all items, missing first; completed rows green with white text; "Remaining" stays | Desk and flat: the default is a new first option "All items, missing first" (`first`). The original five follow word for word. Trophy Collector: 68 of 68, the 32 missing first, then the done rows. Done rows: background rgb(74, 102, 49); text, status and Details button white. "Remaining" still 32 of 68 with 0 done; "All items" still alphabetical. | `rows-desk.png`, `rows-flat.png` |
| 24 | Highlights: big amount left, then the label; rank on the right | Desk and flat, first 5 rows read "993 \| Wood Floor 2x2 Built \| 1" … "633 \| Stone Floor 2x2 Built \| 5". Amount 55 px vs label 25 px (desk), 34 vs 16 px (flat). CSS only. | `highlights-desk.png`, `highlights-flat.png` |
| 25 | Condensed Details: toolbar with icons, dividers, a small record table, a narrower note, a plain-words footer, every breakpoint, parity | 600 px wide (was 700). Toolbar: the wiki link, Use save record, Mark completed, Mark missing, ☆ Add count to header, each with an icon. All 6 ids, 3 corrections and the `_blank` link are present, and they stay after a correction re-render. Note 262 of 643 px beside a solid divider. Footer: "Found under its exact name in your save. …". Fits with no sideways scroll at desk 1440×900 and flat 1440×900, 1024×768, 768×1024 and 390×844. | `details-desk.png`, `details-768.png`, `details-390.png` |
| 26 | Trophy drop chance (big) and usage; bundled; credited; nothing when there's no entry | Fader: "100%" at 40 px, "Used for Fader Power", "Valheim Wiki · CC BY-SA 3.0". Unit test: 68 / 68 trophies map, none twice. A non-trophy (Abyssal Harpoon) shows no facts. The JSON is bundled, so there are no requests. Credited in README, `LICENSES/README.md` and `LICENSES/valheim-wiki-CC-BY-SA-3.0.txt`. | `details-desk.png` |
| 27 | Close burns the letter away in ~1 s (fast front, ember edges, ash); the dim just fades | An outside click closes the dialog at once. The copy burns out in 992–1,001 ms and the last ash is gone at ~2.15 s. 9,333 ember-orange pixels mid-burn. The dim goes 1 → 0.85 → 0.63 → 0.41 → 0.19 → 0. No fold-back run. Focus goes back to the row's Details button. Escape burns too. | `burn-mid.png` |
| 28 | Wiki: a normal new-tab link; the letter stays, no burn (revised) | The click opens `valheim.weirdgloop.org/w/Fader_Trophy` in a new page (routed locally in the test). The dialog stays open, nothing burns, and #float is unchanged. | — |
| 29 | HTML mapped exactly to the sheet's bob | Cause, measured: every per-frame inline transform repainted the sheet layer (CDP LayerTree: v2.1.0 had 137 repaints in 3 s; a translate-only test had 120/120). Now the bob and roll are compositor animations: **0 repaints** in 3 s while the transform keeps moving. The shadow is a sibling with a fixed shadow. | — |
| 30 | Per-item stains seeded from the id, as subtle as now | Fader, then Boar, then Fader again: the same values twice and different ones for Boar. The washes are unchanged (0.55 light, 0.16 brown) and the paper tile is the same. | — |
| 17B | A plain click on the desk toggles the 30 % zoom and leaves no burn mark; a drag burns | It failed first: a click burned a 1-point dot. Fixed (6 px drag threshold, the click zoom's own radius). Now: zoom 1.287 → 1.673 (×1.30), 0 strokes; a drag gives 1 stroke of 12 points. The second click ends the zoom, and the drag starts no zoom. | — |

## Assertions changed (only where Paul's items change them, each with an item comment)

- `tests/specs/golden.spec.js` Master Chef table (item 23). On the reskinned targets it asserts the default `first` and "82 of 82 items shown". It then selects "Remaining" and checks the **unchanged golden values** (66 of 82, first rows). `golden-values.json` is untouched.
- `tests/specs/parity.spec.js`:
  - P26 (item 23): option list = the new option + the original five; default `first`.
  - P27 (item 23): asserts 82 of 82, then checks the unchanged "Remaining" count and its 66-row export.
  - P30 (item 25): the plain-words footer text instead of the first paragraph.
  - Baseline keeps every original expectation.
- `tests/census/census.spec.js`:
  - Item 25: the "Matched directly …" string is exempt on reskinned targets (P30 checks the new text).
  - Item 23: a list count "N of M items shown" passes only if a list count for the same total M is on screen. Every other string still has to match exactly.
- Builder tools:
  - `tools/wp16c-check.cjs`: menu pick by value (item 23).
  - `tools/wp17b-check.cjs`: the Carpenter release ceiling goes 70 → 130 ms (item 23). The default now renders 400 rows instead of 245. Measured app.js render alone: 45 ms vs 30 ms; the green-row CSS costs nothing.
  - `tests/specs/wp12.spec.js`: waits for the letter to open, then closes by DOM click (items 27 and 29).

## Bugs found on the way (fixed)

- **Plain click burned a dot (17B).** Wood burning now starts only after a 6 px move.
- **Closing during the unfold left the open sequence running** on a closed dialog. Close now stops it (`unfold.stop`).
- **The seeded tile offset showed the paper's worn edge band** mid-letter (the desk tile is the whole sheet). The offset is now a percentage inside the body.

## Decisions (DECISIONS.md, 2026-11-12)

Paul, WP-17 items 23–30 (one row each, item 28 as revised). Builder calls tagged WP-17C: the click/burn threshold and the checks Paul's items change. app.js change #16 (lines 78 and 82; still 142 lines) is in `docs/app-js-changes.md`.

## Files

- **New:**
  - `src/surfaces/details-layout.js`, `src/surfaces/burn-away.js`, `src/data/trophy-map.js`
  - `unit/wp17c.test.mjs`, `tools/wp17c-check.cjs`
  - `LICENSES/valheim-wiki-CC-BY-SA-3.0.txt`, `docs/explained/wp-17c.md`, this report and `docs/reports/wp-17c/`
- **Changed:**
  - `src/app.js` (lines 78 and 82 only), `src/template.html`, `index.html`
  - `src/surfaces/`: `details.js`, `unfold.js`, `surfaces.css`
  - `src/styles/`: `desk.css`, `flat.css`
  - `src/scene/woodburn.js`
  - Tests: `tests/specs/{golden,parity,wp12}.spec.js`, `tests/census/census.spec.js`
  - Tools: `tools/wp16c-check.cjs`, `tools/wp17b-check.cjs`
  - `README.md`, `LICENSES/README.md`, `package.json`, `package-lock.json` (2.2.0)
  - `CHANGELOG.md`, `DECISIONS.md`, `docs/app-js-changes.md`, `STATUS.md`, `QUESTIONS-FOR-PAUL.md`
- **Not touched:** `src/core.js`, `src/catalog.json`, `checker-reports/`, `../valheim-checkup`, `tests/golden-values.json`, the census baselines.

## Open points

1. **NEEDS PAUL: the Carpenter's release frame.** With all 400 rows shown by default (item 23), releasing onto The Carpenter takes one long frame of 79–123 ms (17B: 63 ms with 245 rows). The time is app.js's own row render. Other collections have no long frame. Going further means changing how app.js renders the list, which is a parity question.
2. **NEEDS PAUL: taste.**
   - The new option's wording ("All items, missing first").
   - The row green #4a6631.
   - The burn's look and speed (1 s, front from the click side).
   - The two-row toolbar grid.
   - The plain-words footer sentence.
   - "Item Stand decoration" shown for trophies with no use of their own.
3. **Close sound.** The burn still plays file 06's paper `fold.close` (sounds weren't in 17C's scope). A crackle would suit it better; one recipe change.
4. **Older failures, unchanged.** The 6 wp11 failures that predate 17A and the 2 stale `wp01.spec.js` assertions.
