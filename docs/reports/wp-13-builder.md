# WP-13 builder report: flat fallback, phones and touch

When the desk can't or shouldn't run, the original page layout now wears the desk's parchment and ink. That covers phones, tablets, no WebGL2, reduced motion and `?mode=flat`. Nothing moves to a new place:

- a generated paper tile;
- the desk's ink colours, grain mask and rough edges;
- inked sidebar labels with brass inlays and a steel knob mark;
- gold CSS coins that hop and press;
- the WP-10 stamps, washes and dots;
- the WP-11 unfolds, menus, slips and help letter;
- a page-wide file drop;
- touch long-press;
- the "Show the 3D desk anyway" help switch.

This session was WP-13 followed by WP-14 (grouped, DECISIONS "Usage"). The numbers below are from the **final build**, after the WP-14 changes. All checks ran on the real GPU (ANGLE Metal) with Paul's save from `fixtures/private`. The name is masked in every screenshot.

Acceptance: **2 / 4 PASS, 2 partial.** The partial ones are the 900 / 390 px, reduced-motion and no-WebGL P-test matrix, which Paul moved to WP-15. The switches for it are in place.

- **Self-check:** `node tools/wp13-check.cjs` passes **37/37**. One check (skin) was updated for WP-14's `blob:` paper URL and re-run 6/6.
- **Parity on flat:** `cd tests && TARGET=flat npx playwright test specs/parity.spec.js specs/golden.spec.js --workers=2` passes **48/48** (P01–P44 and golden), on the final build at 1440 × 900.
- **Unit tests:** `npm run test:unit` passes 151/151, including `unit/wp13.test.mjs` and `unit/mode.test.mjs`. `node scripts/test.cjs` passes.
- **Screenshots:**
  - `docs/reports/wp-13/flat-1440.png` (flat parchment, 1440 × 900)
  - `docs/reports/wp-13/flat-390.png` (390 × 844, touch)
  - Desk for the side-by-side: `docs/reports/wp-10/desk-final-1440.png`, re-shot this session by `tools/wp10-check.cjs`.

## Acceptance items

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Every P-test and golden pass on `TARGET=flat` at 1440 × 900, 900 × 700 and 390 × 844 | **Partial** | **1440 × 900: 48/48** (parity and golden, final build). 900 × 700 and 390 × 844 are not run as P-tests (WP-15). `tests/playwright.config.js` now takes `VIEWPORT=900x700` / `VIEWPORT=390x844` (opt-in; unchanged when unset). Functional checks at those widths pass in `wp13-check`. **Brand:** 1 line at 1440 / 900 / 390 / 381 px and 2 lines at 380 / 360 px (the 381 px rule), no sideways scroll. **Phone:** stamps 2 × 2, sidebar hidden, the mobile select opens as a parchment menu and switches view (P16), sticky header with a soft shadow. |
| 2 | The same with reduced motion on, and with `--disable-webgl` | **Partial** | P-tests not run (WP-15; switches `REDUCED=1`, `NOWEBGL=1`). `wp13-check` covers it functionally. **Reduced:** auto mode picks flat; numbers are final at once (16 66 0 47); Details is a 150 ms fade with no fold events; the help switch shows, saves, reloads into the desk and can switch back. **No WebGL:** flat with the full ink sequence (`kind: "full"`). |
| 3 | Flat and desk side by side read as one design | **PASS** (builder review; Paul to confirm) | `flat-1440.png` next to `wp-10/desk-final-1440.png`: same paper tone and grain, same ink colours, stamp frames, dots and lettering, same Grenze Gotisch / IM Fell type. The coins are flat CSS gold in flat and the minted coins on the desk. |
| 4 | Stamps, dots, washes and sounds work in flat; reduced motion removes the motion but keeps every number | **PASS** | `wp13-check` sounds: load.success, toast.in, wash.out, wash.in, stamp.big, stamp.dot, coin.up, unfold.flap, menu.open. `wp10-check` flat: 4 stamps landing at 1009 / 1165 / 1316 / 1465 ms, 57 dots, 12 frames. `wp10-check` flat reduced: one fade, one soft stamp, numbers at once. WP-14's sound session: every built sound fires from its real trigger in flat, too. |

**Also checked (`wp13-check`):**

- **Coins:** How to, Load, Import, Export and Sound are coins. Hover hops and emits `coin:hop`. The Sound coin mutes and unmutes with `aria-pressed` following. Taps press (`coin:press`) and never hop.
- **Surfaces:**
  - Details unfolds in CSS 3D: 5 folds and the float, the parchment sheet in `#float`, focus inside. Escape folds it shut and returns focus.
  - How-to unfolds (5 folds).
  - A mouse press on a filter opens the parchment list; choosing sets the select and fires `change`. The record-mode brass switch is present.
- **Drop:** a `.fch` dropped anywhere loads once, also on the tour's capture layer (DECISIONS 10).
- **Touch:** a long press on a row opens Details exactly once.
- **Skin:**
  - `body.mode-flat` + `vc-paper`, with the 2D-canvas paper tile applied.
  - Icons use the multiply blend on paper (WP-02 open 2).
  - No 3D stage in flat.
  - A brass inlay on every collection, counts kept, the knob mark on the active one.
- **No page errors** in any session (desk, phone, reduced, no-WebGL).

**DECISIONS rows applied:**

- points 8, 9 and 10 (whole-page flat drop, including the tour capture layer);
- 14, 24, 27, and 30 (P29 re-checked: it passes in the flat parity run);
- WP-02 open 2 (the parchment skin adds `vc-paper`);
- the 381 px brand rule;
- the WP-05 GPU budget row (see the WP-14 report).

New WP-13 rows: flat skin scope, flat uses the WP-11 surfaces, the paper tile, the Sound coin, touch, the help switch, stamp lettering, the whole-page drop, and the Playwright env switches.

## Files

- **New:**
  - `src/flat/index.js`, `src/flat/paper.js`
  - `tools/wp13-check.cjs`, `tools/wp13-shot.cjs`
  - `unit/wp13.test.mjs`
  - `docs/explained/wp-13.md`
  - `docs/reports/wp-13/flat-1440.png`, `flat-390.png`
- **Changed:**
  - `src/styles/flat.css`: the parchment skin, scoped to `body.mode-flat`.
  - `src/config/render.js`: `flat` block.
  - `src/surfaces/surfaces.css`, `slips.js`, `inkbits.js`: shared with flat.
  - `src/mode.js`, `src/main.js`, `src/debug.js`: mode choice, the force-desk key, `__vc.flat`.
  - `unit/mode.test.mjs`
  - `tests/playwright.config.js`: opt-in `VIEWPORT`, `REDUCED`, `NOWEBGL`.
  - `DECISIONS.md`, `CHANGELOG.md`, `docs/app-js-changes.md` ("WP-13: no change"; flat now also loads `details.js`), `STATUS.md`.
- **Untouched:** `src/app.js`, `src/core.js`, `src/catalog.json`, `../valheim-checkup`, `checker-reports/`, `parity.spec.js`, `golden.spec.js` and the census tests.

## Found and fixed on the way

- **Privacy: the character name sat in a tool file.** `tools/wp13-shot.cjs` had the private save's file name written in it, and that name contains the character name. It now finds the `.fch` in `fixtures/private` like every other tool. A search of `tools/`, `src/`, `docs/`, `tests/`, `unit/`, `scripts/` and the root notes finds no other copy. The spec files name that file themselves; they are Paul's and were left alone.
- **Screenshot timing.** The shot tool waited a fixed 4.2 s and could catch the wash mid-way. It now waits for the ink to be idle.

## Open points

1. **The P-test matrix (WP-15):** 900 × 700, 390 × 844, `REDUCED=1` and `NOWEBGL=1` on `TARGET=flat`. The switches are ready; none of these were run as P-tests this session (Paul's scope).
2. **WP-12's `wp12.spec.js` fails 2 of 5 on flat:** tests 3 and 4 expect exact sound lists, and since WP-10 the ink sequence's stamp and dot sounds keep arriving after the spec clears its log. This is not caused by WP-13 or WP-14, and the spec was not edited (DECISIONS). WP-15 should wait for `__vc.ink.state()` to be idle before each clear.
