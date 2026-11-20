# WP-01 · Project setup and event bus — builder report

**Date:** 2026-11-10 · **Builder** · **Round:** 1, plus the orchestrator's privacy fix

## Verdict

WP-01 is built and self-checked. Every acceptance item passes except one: the golden test fails 2 of its 3 tests on `TARGET=flat`. The only assertion that fails is the dot-grid check (`tests/specs/golden.spec.js` line 54), and dot grids are WP-10 work. With that one line removed, all golden numbers pass in both record modes (open point 1).

## Files changed

**New**
- Build: `index.html` (Vite entry, made from `src/template.html`), `vite.config.mjs`, `tools/vite-plugin-inline-legacy.mjs`, `tools/smoke.cjs` (builder browser self-check)
- App code: `src/main.js`, `src/bus.js`, `src/events.js`, `src/privacy.js`, `src/debug.js`, `src/quality.js`, `src/mode.js`, `src/strings.js`, `src/util/rng.js`, `src/util/clock.js`, `src/util/spring.js`, `src/util/ease.js`
- Config: `src/config/motion.js`, `src/config/render.js`, `src/config/audio-mix.json`
- Unit tests (`node --test`, 53 tests): `unit/rng.test.mjs`, `unit/clock.test.mjs`, `unit/spring.test.mjs`, `unit/ease.test.mjs`, `unit/bus.test.mjs`, `unit/mode.test.mjs`, `unit/config.test.mjs`, `unit/privacy.test.mjs`
- Docs: `docs/app-js-changes.md`, `docs/explained/wp-01.md`, this report

**Modified**
- `src/app.js`: one `import` added on line 1, plus 15 one-line emits. It is still 142 lines and no line number moved. All changes are listed in `docs/app-js-changes.md`.
- `scripts/build.cjs`: writes `dist/original.html` (DECISIONS point 7), and replaces the `import` with a no-op `emit` (open point 4).
- `package.json`: scripts `dev`, `build:single`, `build:site`, `build:all`, `test:unit`; devDependencies pinned exactly: `vite 8.3.5`, `vite-plugin-singlefile 2.3.4`.
- `README.md`: the Develop section only. `CHANGELOG.md`: a new "2.0.0 — 3D desk" section.

**Not touched:** `tests/`, `checker-reports/`, `STATUS.md`, `DECISIONS.md`, `src/core.js`, `src/catalog.json`, `src/template.html`, `src/style.css`, and `../valheim-checkup`.

## Privacy fix (orchestrator decision)

- `src/bus.js` remembers every character name its source reports during the session, longest first. Before an event is stored or handed to listeners, every string anywhere in its data has those names replaced by `{name}`. The emitter's own object is not changed.
- `app:toast` is stored as `{kind, text}`. `kind` is one of `loaded`, `unverified`, `lifetime`, `favorite-added`, `favorite-duplicate`, `favorite-full`, `note-saved`, `correction-saved`, `progress-restored`, `other`. `text` is the redacted text.
- `src/privacy.js`, imported before `app.js`, points the source at `#headerProfile strong`. `app.js` renders the header before every emit that can contain the name (the load toast and `app:load`). Names stay redacted after "Load another save" and after "Forget". This needed no app.js change; the toast on screen still shows the name, as in the original.
- Evidence:
  - `unit/privacy.test.mjs` (6 tests) proves a toast containing a made-up name is stored in `__vc.events` as `{kind: 'loaded', text: 'Loaded {name}. Progress is up to date.'}`. It also covers listeners, nested data and `app:load` errors, names that change, and a kind for every `notify()` text.
  - `tools/smoke.cjs` with Paul's real save: "load toast stored as {kind, text} with the name redacted" PASS, and "no event anywhere contains the character name" PASS.

## Acceptance

| Item | Result | Evidence |
| --- | --- | --- |
| `scripts/test.cjs` passes; `core.js` and `catalog.json` byte-identical to the original | **PASS** | `node scripts/test.cjs` → "Passed: skill decoding, cooking/eating separation, checksum validation, catalog integrity, difficulty records." `cmp` against `../valheim-checkup/src/` matches for core.js, catalog.json, template.html and style.css. The SHA-256 of both matches `tests/baseline/hashes.json`. In `dist/valheim-checkup.html`, `#catalogData` text equals `catalog.json` exactly and the `<script>` equals `core.js` exactly. |
| Every P-test and the golden test pass on `TARGET=flat` | **69 / 71** | `cd tests && TARGET=flat npx playwright test` → 69 passed, 2 failed. The failures are `golden … record mode achievement` and `… raw`, both at "dot grids present on new targets" (line 54). All P01–P44, P10b, the 3 censuses (string, control, output byte-identical) and the 20 screens pass. P09/P10/P11/P18/P37/P42 with `--repeat-each 3` pass 21/21. A copy of `golden.spec.js` in the builder scratchpad, with only line 54 removed, passes 3/3 on flat with no page errors. |
| `dist/valheim-checkup.html` opens from `file://` with no console errors and loads Paul's save | **PASS** | `node tools/smoke.cjs`: opened with no query string, Paul's save loaded, 0 console errors and 0 page errors through the whole scripted session. `?seed=7&mode=desk` also loads with no errors. |
| Unit tests for rng, clock, spring and ease pass; spring settles within 1% for the file 04 pairs | **PASS** | `npm run test:unit` → 53/53. The spring tests check that the config holds all 11 stiffness/damping pairs from file 04. Every spring in `motion.js` settles to within 1% at 60 fps, inside its analytic bound and under 3 s. The 700/22 spring matches the exact underdamped solution within 0.02. 30, 60 and 144 fps agree within 0.01. |
| `__vc.events` records `app:category`, `app:load`, `app:details-open`, `app:toast` with correct data during a scripted session | **PASS** | `tools/smoke.cjs`: 29/29. Data checked: `app:category {title}`; `app:load {ok:true}`, and `{ok:false, error}` for a damaged save and for a non-.fch file; `app:details-open {category, id}`; `app:toast {kind, text}` redacted. Also checked: `app:details-close` (× and Escape), `app:mode {mode}`, `app:filter {name, value}` (search debounced to one event), `app:star`, `app:favorite-add`/`-remove`, `app:render {view}`, the order load → toast and category → Unverified toast, and `t`/`wall` on every entry. |
| Every named value in files 04 to 06 exists in `src/config/` | **PASS** | `unit/config.test.mjs`: all 630 numbers in the tables, bullets and numbered rules of files 04–06 are present in the config (with kHz→Hz, s→ms, %→fraction). The backticked names (`bristleAmp`, `bristleFreq`, `bristleSpeed`, `impactFalloff`, `breezeDecay`, `pxPerCm`, `grainIntensity`) are keys. All 69 sounds are in `audio-mix.json` with a bus, a gain equal to file 06's, and a canonical trigger event. |

**Also verified**
- `build.cjs` output: `cd tests && TARGET=baseline TARGET_URL=file://…/dist/original.html npx playwright test` → **71/71**. The flat original still builds and behaves as v1.2.1.
- `dist/site/` served over local HTTP renders the 11 collections and loads the save with no console errors.
- `npm run dev` serves the page with `catalog.json` and `core.js` inlined; `src/main.js` and `src/app.js` load (HTTP 200).
- `npm run check` passes.
- The debug API: `seed(n)` repeats the sequence, `timeScale(0)` pauses the clock, `quality()` validates its tier and never changes the run mode, and `state()` reports the view, the record mode, `runMode: 'flat'`, the filters, `saveLoaded`, the quality tier and `cursor: 'native'`.
- Privacy scan: the character name and the save's filename stem appear in no file outside `fixtures/private/` except Paul's own `spec/07-golden-values.md`, `spec/00-orchestrator.md` and `spec/valheim-checkup-herder-spec.md`. Those were already there, and WP-15 leaves `spec/` out of the zip.

## Open points

1. **Golden dot-grid assertion on flat.** `golden.spec.js` line 54 requires `#metrics [data-dots]` on every non-baseline target, but grids arrive in WP-10 (with the DECISIONS point 25 hooks). Tests are checker-owned, so I didn't change it. Please have the checker hold that assertion until WP-10, or accept 69/71 for WP-01.
2. **`breezeDecay` conflict.** File 04 says 600 ms; DECISIONS point 20 says a 400 ms half-life. `motion.js` uses `breezeDecay: 400` with `breezeDecayIsHalfLife: true` and a comment. Please confirm.
3. **Gauntlet wall spring damping is not in the spec.** File 04 gives stiffness 600 only. I used damping 49 (≈ critical, 2√600), marked "starting value, not spec". Worth a DECISIONS line.
4. **`build.cjs` needed a second change.** DECISIONS point 7 describes a one-line change. Because app.js now has an `import` and an inline classic script can't import, `build.cjs` also swaps that line for `const emit=()=>{};`. It's logged in `docs/app-js-changes.md`; please add it to DECISIONS.
5. **`@playwright/test` not moved to the root.** DECISIONS point 37 makes it optional. Chromium is installed inside `tests/node_modules`, so moving it would mean downloading the browser again. `tools/smoke.cjs` uses the checker's install read-only.
6. **Smaller choices to note:**
   - No `"type": "module"` in `package.json`: it would make Node read `src/core.js` as an ES module and break `scripts/test.cjs`. The Vite config and unit tests use `.mjs` instead.
   - `state().cursor` is `'native'` in flat mode (WP-09 adds gauntlet and spark).
   - `app:filter` names are `status`, `discovery`, `biome`, `sort`, `starred` and `search`.
   - `app:star` and `app:export-list` (DECISIONS point 29) are emitted now, so app.js won't need another edit for them.
   - README line 7 still says "download index.html"; that's for WP-15.

## Round 2

Fixes from `checker-reports/wp-01-round-1.md`, Required fixes 1–3. Fix 4 (`app:details-close` timing) is deferred to WP-11 per DECISIONS and was not done.

**Fix 1 [blocker]: case-insensitive redaction; profile id and fingerprint are secrets**
- `src/bus.js`: secrets are matched with one case-insensitive pattern (special characters escaped), longest first, and deduplicated case-insensitively. Because it is one pass, a placeholder is never redacted again. The bus now takes several sources (`addSecretSource`); a source returns a name string or `{name, profileId, fingerprint}`. Placeholders: `{name}`, `{profile}`, `{fingerprint}`. `setNameSource` still works. A throwing source never breaks `emit`.
- `src/privacy.js`: registers the header name, plus the profile id from `localStorage['valheim-checkup:active']` and `save.fingerprint` from `valheim-checkup:v1:<id>`. All storage reads are guarded. No `app.js` change.
- `unit/privacy.test.mjs` adds 6 tests, all with made-up values: the name in lower, upper and mixed case in `app:filter`; case-variant names remembered once; the profile id and fingerprint redacted (also inside `app:load` errors and in upper case); secrets kept after Forget, with regex characters taken literally; a placeholder never re-redacted; a throwing source.
- `tests/specs/wp01.spec.js` › "privacy: __vc.events never holds the name, profile id or fingerprint": **pass**, `LEAKS []`.
- Remaining limit: if browser storage is unavailable, the profile id and fingerprint are only in app.js memory, so they can't be registered without an app.js change. In that case the user also has no way to see the id, so they are unlikely to type it. The name is still redacted. The name typed before any save is loaded is still stored (checker's observation; the bus can't know it yet).

**Fix 2 [minor]: `breezeDecay` 600**
- `src/config/motion.js`: `breezeDecay: 600`, `breezeDecayIsHalfLife: true`, comment cites DECISIONS WP-01 open point 2. CHANGELOG's "every value from spec files 04–06" is now true.

**Fix 3 [minor]: config test by key name**
- `unit/config.test.mjs` adds 2 tests. The first checks the 7 backticked tunables at their exact paths (`motion.paper.bristleAmp`, … `render.post.grainIntensity`) against the spec value, and asserts that the spec still uses that wording. The second checks the 11 named springs: each config path equals `{stiffness, damping, mass: 1}` and its file 04 row (by first cell) says `spring \`k / c\``. It also checks the wall stiffness of 600. With `breezeDecay: 400` the new test fails, so this kind of mistake can't get through again.

**Re-run**
| Command | Result |
| --- | --- |
| `node scripts/test.cjs` | Passed (skill decoding, cooking/eating, checksum, catalog, difficulty records) |
| `npm run test:unit` | **61 / 61** (53 + 6 privacy + 2 config) |
| `cd tests && TARGET=flat npx playwright test specs/wp01.spec.js` | **14 / 14**, privacy `LEAKS []` |
| Also: `cd tests && TARGET=flat npx playwright test` (full suite) | 85 / 85 |
| Also: `node tools/smoke.cjs` | 29 / 29 |

`dist/` was rebuilt with `npm run build:all` before the browser runs. A scan of every changed file finds no character name; the tests use made-up values only.

**Files changed in round 2:** `src/bus.js`, `src/privacy.js`, `src/config/motion.js`, `unit/privacy.test.mjs`, `unit/config.test.mjs`, `CHANGELOG.md`, `docs/app-js-changes.md`, `docs/explained/wp-01.md`, this report, and `dist/` (rebuilt).
