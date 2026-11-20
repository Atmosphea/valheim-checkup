# Changes to `src/app.js`

File 01 says `app.js` logic changes as little as possible and that every change is listed here with its reason. Each entry gives the WP, the line in `src/app.js` where the change sits, and why. No change alters what the original app does; only event emits were added. Line numbers are the same as in the original, because every addition was made inside an existing line (the file is still 142 lines, and line 2 is still the line that reads `catalogData` and `ValheimCore`).

The untouched original is `../valheim-checkup/src/app.js`.

## WP-01: ES module and event-bus emits

| # | Line | Change | Reason |
| --- | --- | --- | --- |
| 1 | 1 | `'use strict';` → `'use strict';import { emit } from './bus.js';` | WP-01 step 3: app.js is now an ES module, loaded by `src/main.js`. It needs `emit` from the event bus. Kept on line 1 so no other line number moves. |
| 2 | 11 | `notify()` starts with `emit('app:toast',{text})` | `app:toast` (file 01). Every toast goes through `notify`. |
| 3 | 50 | `setCategory()` emits `app:category {title}` after the view has rendered and scrolled to top, and before the Unverified toast | `app:category` (file 01; data shape from DECISIONS point 15). Rendering first means listeners see the new view; emitting before the toast gives the order `app:category → app:toast`. DECISIONS point 3: the board will call `setCategory` straight after `bar:latch`, giving `bar:latch → app:category → bar:return`. |
| 4 | 53, 70 | `render()` emits `app:render {view}` at both of its exits (insight pages and collection pages) | `app:render` (file 01), sent after the DOM is updated. |
| 5 | 95 | `showDetails()`: `if(!open)showModal()` became `if(!open){showModal();emit('app:details-open',{category,id})}` | `app:details-open` (file 01). It fires only when the dialog actually opens, not when a correction re-renders an open dialog. |
| 6 | 97 | `addFavorite()` emits `app:favorite-add {category,id}` on success, before its toast | `app:favorite-add` (file 01). The "already in your header" and "keep up to six" refusals emit only their toast. |
| 7 | 117 | `loadFile()` success emits `app:load {ok:true}` before the "Loaded …" toast | `app:load` (file 01; shape from DECISIONS point 15). The data holds no save contents. |
| 8 | 115, 118 | `loadFile()` failures emit `app:load {ok:false,error}`: once for a non-.fch file and once in the `catch` for parser errors | Same event, failure case (DECISIONS point 15). `error` is the same text shown in `#message`. |
| 9 | 126 | Record-mode change emits `app:mode {mode}` after `render()` | `app:mode` = record mode only (DECISIONS point 16). |
| 10 | 126 | After the original filter listeners, new listeners emit `app:filter {name,value}` for status, discovery, biome, sort, starred and search; search is debounced by 150 ms | DECISIONS point 16. The original `renderRows` listeners are untouched and still run first. Filters that the app itself resets (`setCategory`, favourite open) do not emit. |
| 11 | 127 | Star toggle emits `app:star {id,on}` | DECISIONS point 29 adds `app:star` for the `star.on` / `star.off` sounds. |
| 12 | 129 | Adds `$('itemDialog').addEventListener('close',…)` that emits `app:details-close {category,id}` | `app:details-close` (file 01). The dialog's `close` event covers the × button, Escape and any other close. |
| 13 | 135 | Favourite removal keeps the removed entry (`const [removed]=favorites.splice(…)`) and emits `app:favorite-remove {category,id}` | `app:favorite-remove` (file 01). |
| 14 | 138 | "Export this list" emits `app:export-list {view,rows}` after the download | DECISIONS point 29 adds `app:export-list` for the `export.quill` sound. |

Events are recorded in `__vc.events` and stay in the browser. **Privacy:** app.js still emits `app:toast {text}`, but the bus (`src/bus.js`) stores and forwards `{kind, text}` with the character name replaced by `{name}`. It redacts every string in every event's data the same way, in any letter case, using the name `src/privacy.js` reads from `#headerProfile` and the profile id and fingerprint it reads from the active save in `localStorage` (`{profile}`, `{fingerprint}`). This needed no app.js change. The toast on screen still shows the name, as the original does.

## WP-02: no change

Icons are added from outside by `src/icons/icons.js` (imported in `src/main.js` after `app.js`): a `MutationObserver` on `#items` adds an icon to each row after every re-render, and an `app:details-open` listener adds one to the Details heading. No class, id or text that app.js writes is changed or moved (DECISIONS point 26).

## WP-03: no change

The How-to button, popup and tour are added from outside by `src/tutorial/` (imported last in `src/main.js`). The button is inserted directly before `#loadTop`; no original element moves. One thing touches original elements, not in app.js:

- `data-tour="load" | "board" | "stamps"` attributes are added to `#loadTop`, `#categories`, `#mobileCategory`, `#metrics` and `#collectionView .tablewrap`. No class, id or text that app.js writes is changed (DECISIONS point 26).

The "Path copied." toast uses the original `#toast` the same way `notify()` does (`src/tutorial/toast.js`), because `notify()` is private to app.js.

## WP-04: no change

The desk stage lives in `src/scene/` and is loaded by one dynamic `import()` in `src/main.js`, only in desk mode. It adds `#desk` as the last child of `<body>`; no original element, id, class or text is moved or changed. Two scoped CSS rules touch original elements in desk mode only: `body.mode-desk {overflow: hidden}` and `body.mode-desk #toast {z-index: 40}` (so toasts stay readable above the desk until WP-11 moves them into `#float`).

## Build notes (not app.js)

| Where | Change | Reason |
| --- | --- | --- |
| `scripts/build.cjs` | Writes `dist/original.html` (and creates `dist/`) instead of the root `index.html` | DECISIONS point 7: the root `index.html` is the Vite entry now. |
| `scripts/build.cjs` | When inlining app.js, replaces `import { emit } from './bus.js';` with `const emit=()=>{};` | app.js has an `import` now, and an inline classic `<script>` can't import. In the flat original the emits do nothing, so it behaves exactly like v1.2.1. Evidence: the checker's suite passes 71/71 against `dist/original.html` with the baseline expectations. |
| `index.html` (root) | Made from `src/template.html`: `<style>/*STYLE*/</style>` became `<link rel="stylesheet" href="/src/style.css">` and `<script>/*APP*/</script>` became `<script type="module" src="/src/main.js">`. The `/*CATALOG*/` and `/*CORE*/` placeholders stay and are filled by `tools/vite-plugin-inline-legacy.mjs`. | WP-01 steps 1–2. `src/template.html` itself is unchanged; `build.cjs` still uses it. |
| `package.json` | No `"type": "module"` | With it, Node would read `src/core.js` as an ES module and `scripts/test.cjs` (which `require`s it) would break. The Vite config and unit tests use `.mjs` instead. |

## WP-12: no change

Sounds listen to the event bus from `src/audio/wiring.js`; `src/main.js` imports `src/audio/index.js` (both modes) and, with `?soundboard`, the soundboard instead of the desk stage.

## WP-05: no change

Textures and materials live in `src/scene/`; `src/main.js` imports `src/scene/materials-review.js` instead of the stage with `?materials`.

## WP-06: no change

`src/app.js` is untouched. In desk mode `src/board/proxies.js` moves existing elements into the printed layer without changing them: the coin buttons (`#howTo`, `#loadTop`, `#importProgress`, `#exportProgress`) each into a `.vc-coin-print` wrapper, and the whole `aside.sidebar` into `.vc-board-print`. It positions `#overall`, the two eyebrows, the side note and the bar buttons absolutely over the woodblock, gives the bars a roving tabindex, and adds one new button, `#vcSound`. Mouse clicks on bar buttons are stopped in the capture phase (a drag selects instead), keyboard and programmatic clicks go through after the bar slides. `app.js` still rebuilds `#categories` on every render; a MutationObserver re-applies the positions.

## WP-07: no change

`app.js` is untouched. The paper layer moves the original elements (same ids, classes and attributes) onto the sheets and styles them under `body.mode-desk #print` (src/paper/, src/styles/desk.css).

## WP-10: stamp and dot hooks (line 57)

Line 57 (the `#metrics` render) changes in one line; the file is still 142 lines. Per DECISIONS points 25 and 4/5:

- each `.metric` gets `data-metric="done|missing|unknown|discovered"` (the same word as its class);
- an empty `<svg class="stamp-frame" aria-hidden="true" focusable="false">` comes first in each stamp, and `src/ink/stamps.js` draws the ornate frame into it;
- a `<div class="dots" aria-hidden="true">` comes last in each stamp. When the number is shown it carries `data-dots` (=`ceil(total ÷ perDot)`), `data-full` (=`floor(n ÷ perDot)`) and `data-partial` (=`(n mod perDot) ÷ perDot`), with `perDot = ceil(total ÷ 40)`. When the stamp shows "—" it has no data attributes;
- the existing "is this number shown?" test is held in `shown` so the number and the grid agree.

Why: the stamps and dot grids (spec WP-10 steps 4 and 8) and the golden dot assertions need these hooks in the DOM app.js writes. The number, the label, the classes, the Unverified tooltip and tab stop, and the stamp order are unchanged. The two new elements are `aria-hidden`, so the accessible text of each card is the same as before.

## WP-11: no change

`app.js` is untouched. Details still calls `$('itemDialog').showModal()` and `.close()`: on the desk, `src/surfaces/details.js` defines `showModal` and `close` as own properties of that one dialog element. `showModal` shows it non-modally inside a #float layer and makes it modal by hand (`inert` on everything else, a Tab trap, Escape, outside click). `close` emits `app:details-close` synchronously, as DECISIONS WP-01 round-1 fix 4 asks, then calls the native close. The native `close` event arrives a task later; a capture listener swallows that one event so nothing hears the close twice. Flat mode does not load this code.

WP-11 round 2: still no change. The desk tour adds `data-tour="board"` to the printed board wrapper (`.vc-board-print`, a WP-06 element, not an original one).

## WP-13: no change

`app.js` is untouched. One correction to the WP-11 note above: flat mode now loads `src/surfaces/details.js` too (WP-13 gives the flat page the same unfolding Details), so the own-property `showModal` / `close` on `#itemDialog` exist in both modes; their behaviour is the one described above, with `#float` a child of `<body>` instead of `#desk`. The flat skin, coins, drop target and touch handling only add listeners and classes around the original DOM.

## WP-14: no change

`app.js` is untouched. Its own costs show up in the long-task profile (a view change: `core.evaluate` plus the forced layout of `window.scrollTo`, 50–75 ms in the original page on the checker machine) and are left as they are. Two original-markup accessibility findings are handled outside app.js: the empty star column header gets a child `<span role="img" aria-label="Star">` from `src/a11y.js` (its text stays empty, as parity P-tests require), and `#loadTop`'s aria-label / hint mismatch is reported, not changed, because the parity suite locks both strings (DECISIONS, NEEDS PAUL).

Timing around app.js, not inside it: the board's own selection now calls the original category button's `click()` in a task of its own (`setTimeout 0`), and the ink wash begins one animation frame after app.js's `app:category` event. The DOM app.js renders is complete and readable at once, as before.

## WP-17B: per-category stats memoised (WP-17A open point 1)

| # | Line | Change | Reason |
| --- | --- | --- | --- |
| 15 | 25 | `stats(category)` keeps its totals in a memo (`stats.memo`, a `WeakMap` keyed on the `save` object, or on `stats` itself while no save is loaded) holding one `Map` per category, valid while `mode + '|' + JSON.stringify(overrides)` is unchanged. A hit returns a copy; a miss computes exactly the original loop and stores a copy. | Paul asked for no lag on slider release (WP-17 feedback, carried over as WP-17A open point 1). The release task re-ran `core.evaluate` over every item of every category for the sidebar (~39 ms of the ~57 ms `setCategory`). |

Why it is parity-safe: `core.evaluate` is pure, and its inputs are `category` (static catalog object), the item, `save`, `mode` and `overrides[item.id]`. `save` is only ever replaced (`save=n`, `save=d`), never mutated, so a new save is a new key. `mode` and the whole `overrides` content are in the key, so a correction (which mutates `overrides` in place) or a mode change misses and recomputes. Callers get a fresh object each time, as before. The function is declared memo-lazily (`stats.memo ||= …`), so there is no top-level binding to hit a TDZ, and the file is still 142 lines.

Checked (not the full parity run, which is 17C): the sidebar, the header totals and every table row compared, as text, between the build before and after the change through load → category switch → record mode raw → back → correction done / missing / auto → another category: 9 of 9 steps identical, the corrections changed the output and the memo followed them. Release frame (`tools/wp17a-check.cjs frames`, 2 releases): before, one long animation frame of 57 / 54 ms; after, none over 50 ms; the worst rAF interval 33.4 ms both times.

## WP-17C: default filter "All items, missing first" (Paul, WP-17 item 23)

| # | Line | Change | Reason |
| --- | --- | --- | --- |
| 16 | 78, 82 | `renderRows()`: the status test also lets the new value `first` through (like `all`), and the sort puts, when `f==='first'`, missing (0) before unverified (1) before completed (2) ahead of the chosen sort (`firstRank[...]` then the original comparator). | Paul asked for the default view to show all items with missing ones first. The new `<option value="first" selected>All items, missing first</option>` is the first option in `src/template.html` (and the root `index.html`). Every original option keeps its text, value and behaviour; with any other value both lines behave exactly as before. |

The file is still 142 lines. Since `src/template.html` feeds `dist/original.html` too, that file shows the new default as well; the parity suite's baseline target is the untouched `../valheim-checkup`.
