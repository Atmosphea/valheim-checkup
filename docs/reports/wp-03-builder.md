# WP-03 · Tutorial — builder report

**Date:** 2026-11-10 · **Builder** · **Round:** 1 · **Mode built:** flat, with desk hooks

## Verdict

WP-03 is built for flat mode. All 6 acceptance items pass in flat mode. The desk half of item 1 cannot be shown yet, because the desk does not exist (`DESK_AVAILABLE` is false until WP-04). The hook it needs is in place: the same How-to button is the coin's proxy. All self-checks pass: `scripts/test.cjs`, unit tests 84/84, the checker suite on flat 96 passed and 2 skipped, and the WP-03 browser check 81/81, with 0 axe violations in 8 states. `app.js` is unchanged.

## Files changed

**New**
- `src/tutorial/howto.js`: How-to button, popup, tabs, Copy.
- `src/tutorial/tour.js`: the tour.
- `src/tutorial/place.js`: slip placement and target fitting (pure).
- `src/tutorial/platform.js`: platform detection (pure).
- `src/tutorial/modal.js`: `inert` plus focus trap, written so WP-11 can reuse it.
- `src/tutorial/toast.js`: toasts from new code into the original `#toast`.
- `src/tutorial/tutorial.css`
- `unit/tutorial.test.mjs`: 8 tests.
- `tools/wp03-check.cjs`: builder browser self-check, Playwright from `tests/node_modules` (read-only) plus axe-core.
- `docs/explained/wp-03.md`, this report.

**Modified**
- `src/strings.js`: WP-03 strings, plus `SAVE_PATHS` (the spec table and the DECISIONS macOS row).
- `src/config/render.js`: new `tour` block (`dimTo 0.35`, `cutoutPadPx`, `cutoutRadiusPx`, `cutoutSoftPx`, `slipGapPx`, `slipWidthPx`, `viewportMarginPx`, `arrowInsetPx`, `maxTargetShare`, `moveMs`), added to the default export.
- `src/bus.js`: two toast kinds, `path-copied` and `copy-failed`.
- `src/main.js`: one import line, `./tutorial/howto.js`.
- `package.json` / `package-lock.json`: devDependency `axe-core 4.14.0`, exact (allowed by file 01).
- `CHANGELOG.md`: 4 WP-03 lines. `docs/app-js-changes.md`: "WP-03: no change" section.
- `dist/`: rebuilt with `npm run build:all`.

**Not touched:** `src/app.js`, `src/core.js`, `src/catalog.json`, `src/template.html`, `src/style.css`, `index.html`, `tests/`, `checker-reports/`, `STATUS.md`, `DECISIONS.md`, `../valheim-checkup`.

## How it is built (short)

- **How-to control:** `<button id="howTo" data-tour-anchor aria-label="How to find your save and use Valheim Checkup" aria-haspopup="dialog">`, with an open-book SVG and the visible text "How to". It is inserted directly before `#loadTop`. Following DECISIONS point 27, `#importProgress` and `#exportProgress` move after `#loadTop`, so the header reads and tabs How to → Load → Import → Export.
- **Popup:** `#howToPopup` (full-window layer) holds `[role=dialog][aria-modal=true]`, labelled by `#howToTitle`.
  - Tabs follow the ARIA tabs pattern: roving tabindex, ← / → / Home / End, and selection follows focus.
  - Each row has an `h3` label, a `<code>` path and a Copy button. The button's accessible name is "Copy path for {label}" and it carries `data-path` = the exact path.
  - Copy tries the Clipboard API first. If that is refused, it falls back to a hidden textarea plus `execCommand('copy')`. If both fail, it selects the path and shows a "press Ctrl-C" toast.
  - The Steam Cloud sentence and link are copied out of `details.help` at runtime, so the wording stays exact.
  - The popup is modal by hand (`inert` on the rest of the page plus a Tab trap), not `showModal()`. That keeps the "Path copied." toast above it and still announced (`body.vc-modal-open #toast {z-index: 1100}`). WP-11 step 1 asks for the same recipe for Details.
- **Tour:** a full-window capture layer swallows pointer, mouse, touch, double-click, aux-click and context-menu events. The rest of the page is `inert`. A document keydown listener in the capture phase handles Esc, →, Enter, Space, ← and Tab.
  - A new `role=dialog` slip is built at each step, and focus moves into it, so screen readers read the new step. `aria-describedby` points at the step counter, the text and the hint.
  - The cut-out is a fixed box with a 200vmax `box-shadow` at `1 − dimTo` = 0.65 black, plus `filter: blur(10px)` for the soft edge. It glides 300 ms between steps, with no glide under reduced motion.
- **Flat targets:**

  | `data-tour` | Elements |
  | --- | --- |
  | `load` | `#loadTop` |
  | `board` | `#categories` (on phones `#mobileCategory`, because the sidebar is hidden) |
  | `stamps` | `#metrics` + `#collectionView .tablewrap` (one combined cut-out) |

- **Desk hooks:**
  - `data-tour` / `data-tour-anchor` lookups work on any element, so WP-06 only has to tag its proxies.
  - `setTourRenderer({start, step(n, target, box, elements), end})` lets WP-11 drive the lamp and light pool and move the slip into `#float`.
  - In desk mode the layer gets `vc-tour--desk`, which turns off the CSS dim.
  - Step texts switch on `runMode`: "coin" and the bar sentence in desk, "button" and "Pick a collection from the list." in flat.
- **Events:** `tour:start {mode}`, `tour:step {step, of, target, side}` (at every step, including going back), `tour:end {step, reason: 'click'|'key'|'escape'}`. Sound triggers `tour.dim`, `tour.move` and `tour.end` in `audio-mix.json` already point at these.
- **Test hooks (additive, like `__vc.icons`):**
  - `__vc.howTo` = `{open, close, isOpen, select}`
  - `__vc.tour` = `{start, end, isRunning, step, steps}`

## Acceptance

| Item | Result | Evidence (`node tools/wp03-check.cjs`, 1440 × 900 unless noted) |
| --- | --- | --- |
| How-to sits immediately left of Load character in both modes | **PASS (flat)**; desk not testable until WP-04/06 | `#howTo.nextElementSibling` is `#loadTop`, on the same row, 9 px gap. Header order is `howTo, loadTop, importProgress, exportProgress`. At 390 px: same row, How-to left of Load, `scrollWidth` 390, the same as the original. At phone width the How-to label sits under its icon, like Load's, and the brand wraps. Desk: this button is the coin's proxy, with the same accessible name; WP-06 places it. |
| Right tab preselected on Windows, macOS and Linux user agents; every Copy copies its exact path | **PASS** | Windows, macOS and Linux UAs preselect `windows`, `mac` and `linux`. All 7 Copy buttons (1 + 3 + 3) wrote exactly the spec or DECISIONS path to the clipboard. These are recorded through a stubbed `navigator.clipboard`, because file:// can't be granted clipboard permission. The fallback path, with the Clipboard API refused, also copies the exact path through `execCommand`. "Path copied." shows above the popup and is recorded as `app:toast {kind:'path-copied'}`. In Playwright's Chromium on file://, `navigator.userAgentData` is `null`, so the browser runs exercise the UA fallback; `unit/tutorial.test.mjs` covers the `userAgentData` path, including the case where it wins over the UA string. |
| No button named Done, Finish or Skip during the tour | **PASS** | At every step, with no save and with a save: the list of visible, non-inert buttons is `[]`. A unit test also checks that no tour string contains done, finish or skip. |
| A click on step 3 ends; Escape ends from 1, 2, 3; clicks never reach controls underneath | **PASS** | Real mouse clicks land on the centres of `#loadTop` (step 1), The Carpenter (step 2) and `#statusFilter` (step 3). They advance the tour and then end it (`tour:end {step:3, reason:'click'}`). Listeners on every button, link, select, input, summary and `[data-category]` counted **0** click, pointerdown or mousedown events. The view stayed The Master Chef and no file chooser opened. A double click counts as two advances and also reaches nothing. Escape from steps 1, 2 and 3 gives `tour:end {step:n, reason:'escape'}` and focus returns to How-to. |
| Keyboard-only: open popup, start tour, step through, leave | **PASS** (with no save and with the synthetic save) | One Tab from `body` reaches How-to. Enter opens the popup, with focus on the selected tab, and → changes tabs. 30 Tabs and 10 Shift-Tabs never leave the popup. Escape closes it and returns focus to How-to. Tab to "Show me around" and Space starts the tour, with focus in the step 1 slip. → and Enter advance, ← goes back, Enter on step 3 ends it, and focus returns to How-to. Events: `tour:start` ×1, `tour:step` 1,2,3,2,3, `tour:end {3, key}`. |
| axe-core: no violations with the popup or tour open | **PASS** | axe-core 4.14.0 `axe.run(document)`: **0 violations** with the popup on the macOS tab, the popup on the Linux tab, and tour steps 1, 2 and 3, each with no save and with a save loaded (8 states). |

Also checked:
- Escape, ×, and a click outside all close the popup and return focus. A click inside the paper keeps it open.
- At 390 × 844 every slip stays fully on screen.
- With reduced motion the tour works with no glide.
- No console or page errors in any session.
- I looked at screenshots of the popup and of all 3 steps at 1440 and 390, all without a save (kept in the builder scratchpad).

## Self-check runs (final build)

| Command | Result |
| --- | --- |
| `node scripts/test.cjs` | Passed (skill decoding, cooking/eating separation, checksum validation, catalog integrity, difficulty records) |
| `npm run test:unit` | **84 / 84** (76 before + 8 new) |
| `cd tests && TARGET=flat npx playwright test` | **96 passed, 2 skipped, 0 failed.** The 2 skipped are `wp02-screens`, which skip unless `WP02_SCREENS=1`. This includes all P-tests, golden, the 3 censuses and the 20 screens. |
| `node tools/wp03-check.cjs` | **81 / 81** |

Two honest notes from the runs:
1. **P39 failure, fixed.** The first full run failed P39 because my Copy buttons used `.visually-hidden`, and P39 expects exactly one element with that class. They now use their own `.vc-sr-only` (same CSS recipe).
2. **One `wp01` failure that did not repeat.** In the same first run, `wp01 › scripted session` failed once: search produced two `app:filter` events ("carro", then "carrot") instead of one. That is the 150 ms search debounce racing the typing under 4 parallel workers. WP-03 does not touch search or that code. It passed in the next full run and 5/5 with `--repeat-each 5`. It could be a timing flake for the checker to watch.

## Privacy

- No browser run used Paul's save. The loaded-state checks use the synthetic "Fixture" save from `tests/helpers/fch.js`.
- A case-insensitive raw-byte scan of the 19 changed and built files (including `dist/valheim-checkup.html` and `dist/original.html`) against the name and the save-file stems found **0** hits.
- No screenshot contains save data.

## Open points

1. **Header order changed in flat (DECISIONS point 27).** Import and Export now sit right of Load: [How to][Load character][↥][↧]. Before, they were left of it. Same elements and handlers, and every test passes. If the orchestrator prefers the original visual order, deleting one line in `howto.js` (`load.after(imp, exp)`) reverts it. The tab order would then be Import, Export, How to, Load.
2. **Flat step 2 text.** The spec says flat step 2 "says 'Pick a collection from the list.'" I read that as the whole text. The second sentence ("The one that was open slides back on its own.") describes the desk bars and is dropped in flat. Please confirm.
3. **Placement fallbacks beyond the spec.** The order is right, left, above, as the spec says. Then I added below, then "inside the window" (bottom right, over the target), so the slip is never off-screen. On the real pages: step 1 lands left, step 2 right, step 3 above (desktop) or below (phone).
4. **Tall targets are cut off.** `stamps` (metrics plus a table that can be 5,000 px tall) and `board` show at most 55% of the free window height (`maxTargetShare`). The tour scrolls the target under the sticky header first if it isn't in view. On Highlights or Skills & travel there are no stamps, so step 3 dims the whole page and centres the slip.
5. **New strings not in the spec.** All are in `src/strings.js` and need a DECISIONS line:
   - `tourHint`: "Click anywhere or press → to continue. ← goes back, Esc leaves the tour." With no buttons, keyboard and screen-reader users need to be told how to continue.
   - `tourStep` ("1 of 3")
   - `copyFor` (the rest of the Copy button's accessible name)
   - `copyFailed`
   - `howToClose` = "Close" (the ×)
   - `platformTabs` = "Your computer" (the tab list's label)
6. **Tour text says "drop … anywhere on the page"** (DECISIONS point 10). Today flat still accepts drops only on the hero and the Load button. The whole-page drop target is WP-13's job.
7. **Toast timer.** app.js's `notify()` timer is private. If an app toast was shown less than 10 s before a copy, its timer would hide "Path copied." early. `src/tutorial/toast.js` puts it back when that happens; a newer app toast still replaces it as normal.
8. **Event data shapes** for DECISIONS (point 15 style): `tour:start {mode}`, `tour:step {step, of, target, side}`, `tour:end {step, reason}`. No popup open or close event was added, because none is canonical. WP-11 may want one for its unfold sounds.
9. **For WP-06 and WP-11:** tag the desk proxies with `data-tour` and put `data-tour-anchor` on the How-to coin proxy (which is `#howTo` itself). Register lighting with `setTourRenderer`. Reuse `src/tutorial/modal.js` (`hold`, `trapTab`) for Details and the help letter. The popup root is a body-level `.vc-modal-root`, ready to be unfolded.

## Orchestrator follow-up

DECISIONS "WP-03 open 1–9" resolve every open point. One change was asked for and is done:

- **Header order reverted (open 1).** Flat keeps the original order, with How to inserted directly left of Load: [Import][Export][How to][Load]. I removed the reorder line from `src/tutorial/howto.js` and changed nothing else; no original element moves now. Point 27's coin order applies to desk only (WP-06).
- **Evidence:**
  - DOM order is `importProgress, exportProgress, howTo, loadTop`, and `#howTo` is still directly before `#loadTop`.
  - At 390 px, How-to and Load share a row with `scrollWidth` 390.
  - Keyboard: Tab reaches How-to after Import, plus Export once a save is loaded (Export is disabled without a save): 2 presses with no save, 3 with a save.
- **Updated to match:** `tools/wp03-check.cjs` (order and Tab-count checks), `CHANGELOG.md`, `docs/app-js-changes.md`. `dist/` was rebuilt.
- **Re-run:**

  | Command | Result |
  | --- | --- |
  | `node scripts/test.cjs` | passed |
  | `npm run test:unit` | **84 / 84** |
  | `node tools/wp03-check.cjs` | **81 / 81** (0 axe violations in 8 states) |
  | `cd tests && TARGET=flat npx playwright test` | **96 passed, 2 skipped** (`wp02-screens`, gated), 0 failed |

- **Acceptance:** still 6/6 in flat. Desk item 1 still waits for WP-04/06.

## Round 2

Fixes for `checker-reports/wp-03-round-1.md`, Required fixes 1–4. `app.js` is still unchanged and `tests/` was not edited.

**Fix 1 [major]: phone header, brand never broken inside a word.** File: `src/tutorial/tutorial.css`. I removed the round-1 `flex-wrap: nowrap` and `overflow-wrap: anywhere` rules.
- **481–760 px:** one row, with How to stacked (icon over label) like Load.
- **≤ 480 px:** the original already wraps Load under Import and Export at this width. With How to the actions use the same 140 px block: Import and Export on the top row at the right, How to + Load together on the row below. The grid columns are `min-content | 1fr | auto`, so Load takes all the width left. "Load another save" wraps inside Load as normal text, and "How to" stacks as "How / to" under its icon.
- **≤ 380 px:** there is no room for a one-line brand beside How to, and the original itself scrolls sideways at 320 px. The brand may wrap only at its space ("Valheim / Checkup"), never inside a word, and Load's label wraps as in the original.
- DOM and Tab order are unchanged, still [Import][Export][How to][Load].
- **Measured against `baseline/index.html`:**

  | Width | Brand lines | Header height, no save / with save | Sideways scroll |
  | --- | --- | --- | --- |
  | 390 | 1 (baseline 1) | 151 / 233 px (baseline 151 / 217) | none |
  | 360 and 320 | 2, split at the space | 151 / 235 px | none (baseline scrolls to 324 px at 320) |
  | 500, 600, 760, 800 | 1 | as baseline, except 185 vs 161 with a save at 500 | none |

  At every width from 320 to 800, How to sits directly left of Load on the same row.

**Fix 2 [minor]: the focus trap skips `tabindex="-1"`.** `focusables()` in `src/tutorial/modal.js` now keeps only elements with `tabIndex >= 0`. The tab list has one Tab stop, the selected tab. Tab goes from it to the first Copy button. Shift-Tab goes back to the selected tab, then wraps to ×.

**Fix 3 [minor]: the toast no longer blocks tour clicks.** While the tour runs, `body.vc-tour-open #toast { pointer-events: none }`. The toast stays visible above the dim, and clicks pass through it to the capture layer. The class is added on `startTour()` and removed in `end()`.

**Fix 4 [minor]: no glide on resize or scroll.** `onMove()` in `src/tutorial/tour.js` now lays out in the event handler itself, with a `vc-tour--snap` class (`transition: none`), and removes the class one frame later. Step changes still glide 300 ms. An earlier attempt that laid out in the next animation frame was not reliable; its frame order varied, and one run left the slip 451 px off-screen. So the layout is now synchronous.

**Checker `test.fail` tests that should flip to `test`** (all three now report "Expected to fail, but passed"):
1. `specs/wp03.spec.js:104` › WP-03 phone header › "390 px with a save: brand stays whole words on one line, as in the baseline"
2. `specs/wp03.spec.js:272` › WP-03 popup tab order › "Tab from the selected tab goes to the first Copy button, not another tab"
3. `specs/wp03.spec.js:626` › WP-03 break attempts › "copy a path then start the tour: toast stays above, a click on it still advances"

Fix 4 has no `test.fail`. The checker's existing "resize mid-tour and mid-glide" test passes.

**Re-run (final build)**

| Command | Result |
| --- | --- |
| `node scripts/test.cjs` | passed |
| `npm run test:unit` | **84 / 84** |
| `node tools/wp03-check.cjs` | **86 / 86**, 3 runs in a row. 5 checks were added for fixes 2–4: the Tab path; a click on the toast advances; across 12 resizes (some mid-glide), the slip is 0.0 px off-screen in each of the 6 frames after the resize; step changes still glide 0.3 s. The step checks now wait for the glide to settle rather than a fixed 400 ms, after one timing miss under load. |
| `cd tests && TARGET=flat npx playwright test` | **123 passed, 2 skipped** (`wp02-screens`, gated). **3 "failed"**, and those are exactly the 3 `test.fail` tests above, now passing. No other failure. |
| `cd tests && TARGET=flat npx playwright test specs/wp03.spec.js --repeat-each 3` | 81 passed. The 9 "failed" are only those 3 `test.fail` tests ×3, all passing. |

**Privacy:** a raw-byte, case-insensitive scan of the changed and built files found 0 hits. Only the synthetic "Fixture" save was used.

**Files changed in round 2:** `src/tutorial/tutorial.css`, `src/tutorial/modal.js`, `src/tutorial/tour.js`, `tools/wp03-check.cjs`, `CHANGELOG.md`, this report, `dist/` (rebuilt).

**Note for the orchestrator:** at 360 and 320 px the brand wraps to 2 lines at its space, where the baseline keeps 1 line. At 320 px the baseline also scrolls sideways. One line beside How to + Load doesn't fit below about 381 px without breaking the brand inside a word or adding a sideways scroll, so this seemed the least bad option.
