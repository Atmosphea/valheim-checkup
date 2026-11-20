# WP-10 builder report: ink wash, stamps and dots

A view change washes the old view out and the new one in like watercolour. The four count cards are inked stamps that land with a thump, take a fresh grain and count up. Their dot grids ink in one by one and are done by 3.5 s. Flat mode runs the same modules. All checks ran on the real GPU (ANGLE Metal, Apple M2) at 1440 × 900, with Paul's save from `fixtures/private` (the name is masked in every screenshot).

Acceptance: **7 / 7 PASS**.

- **Self-check:** `node tools/wp10-check.cjs all` 19/19 on the final build. `node scripts/test.cjs` passes. `npm run test:unit` 137/137, including the new `unit/wp10.test.mjs` and a gauntlet LOD regression test.
- **Golden:** `WP=10 TARGET=desk` 3/3 and `WP=10 TARGET=flat` 3/3 (`specs/golden.spec.js`, 2 workers). The dot-grid assertions are live at WP=10.
- **Not run:** full parity, as asked (after WP-11).

## Files

- **New:**
  - `src/ink/index.js` (sequence, timing, units, stamps, dots, small updates, desk wiring, `__vc.ink`)
  - `src/ink/ghost.js` (closed-shadow ghost)
  - `src/ink/masks.js` (wash edge, stamp grain, hash)
  - `src/ink/stamps.js` (frame paths, dot model and cells)
  - `src/ink/ink.css`
  - `tools/wp10-check.cjs`
  - `unit/wp10.test.mjs`
  - `docs/explained/wp-10.md`
  - `docs/reports/wp-10/` (wash-mid-700ms, stamps-1200ms, desk-final-1440, flat-carpenter, bars-before, bars-after)
- **Changed:**
  - `src/app.js` line 57: hooks; logged in `docs/app-js-changes.md`
  - `src/main.js`: imports the ink
  - `src/scene/stage.js`: `attachInk` with the veil patch, sheen, shake and impact
  - `src/styles/desk.css`: stamp card layout, ink roughness on the number and label only
  - `src/config/motion.js`: `stamp` additions and the new `wash` section
  - `src/scene/materials/engraving.js`: optional bold, highlight cut and light lip
  - `src/board/bars.js` and `src/config/render.js`: bar-name values
  - `src/gauntlet/model.js`: LOD fix
  - `unit/gauntlet.test.mjs`
  - `DECISIONS.md`, `CHANGELOG.md`, `STATUS.md`
- **Untouched:** `../valheim-checkup`, `src/core.js`, `src/catalog.json`, `checker-reports/`, `parity.spec.js`, `golden.spec.js` and the census tests.

## Acceptance items

| # | Item | Result | Evidence (`node tools/wp10-check.cjs <mode>`) |
|---|---|---|---|
| 1 | Event timings ±10 % of the table; dots done by 3,500 ms in every view | **PASS** | `timing`: all 13 views in tolerance. Example, Carpenter: in 487, landings 1036 / 1165 / 1311 / 1461, count-ends 1830–2343, 57 dots 1512…3278, wash-in-end 2657. The last dot in any view lands at ≤ 3365 ms. |
| 2 | Final numbers and dot fills equal file 07 in both record modes | **PASS** | `fills`: drawn dots equal the grid hooks in all 11 collections, in both achievement and raw modes. Golden (file 07 numbers plus `data-dots/full/partial`): 3/3 on desk and 3/3 on flat. |
| 3 | Two stampings of the same view give different grain masks | **PASS** | `grain`: Gourmet stamped twice gives hashes `0d8bfe53,42b2aa7b,88d496db,896905a2` and then `bf1143f9,e34c3e6b,02cbb834,e8cbd650`; each stamp carries its mask as an object URL. |
| 4 | Accessibility tree shows the new view at once; the ghost is aria-hidden | **PASS** | `a11y`: on the first frame after a selection the DOM holds the new view. The ghost is `aria-hidden`, `inert` and in a closed shadow root. `getByRole('heading')` finds only the new title; `#title` resolves to one element during the wash. |
| 5 | Two selections 300 ms apart end in the second view, no ghost left | **PASS** | `interrupt`: ends on The Trophy Collector with the correct numbers, 0 ghosts, 0 masks and 0 waiting stamps. |
| 6 | No layout shift during the sequence | **PASS** | `layout`: the sheet's element offsets stay constant over 3 s (one distinct layout). The wash is masks only, and the stamps scale through transforms. |
| 7 | The same modules work in flat mode | **PASS** | `flat`: 4 landings at 1025 / 1159 / 1310 / 1458 ms, 57 dots, 12 frames, no page errors. Reduced motion: one soft stamp at 35 ms, everything final by 208 ms. |

**Also covered by the check:**

- A filter change does not re-stamp.
- A record-mode correction wipes the number (180 ms) and ticks the changed dots without re-stamping.
- The wash fronts are cleared after the sequence.
- No console errors on desk or flat.

**DECISIONS rows:**

- 4: dot interval.
- 5: drawn fill is at least 25 %.
- 17: `fx:wash-in-start` and `fx:wash-in-end`.
- 25: the hooks.
- 32: fresh-ink bleed 0 → 0.5 px, wet sheen drying over 1.5 s, last-dot glint.
- Bar-name legibility: before and after in `docs/reports/wp-10/bars-*.png`. Every bar name reads at 100 % zoom.

## Found and fixed on the way

- **Gauntlet "rods":** after any quality drop to Medium or Low, the gauntlet's arm was drawn as long brown rods across the desk.
  - **Cause:** a WP-08 bug. The later LOD's leather was built from the arm's live pose but bound to the rest-pose skeleton.
  - **Why ink exposed it:** on load, the startup benchmark ran during the ink's load wash and chose Low.
  - **Fix:** the LOD is now built from the bind matrices (`src/gauntlet/model.js`). A unit test fails without the fix (49 cm off) and passes with it.
- **Coin shader error:** my first engraving change redefined a variable that `gold.js` also uses, and the coin shader failed to compile (coins missing). It was renamed, and the console is clean.

## Decisions (all in DECISIONS.md, tagged WP-10)

- Closed-shadow ghost with rewritten styles.
- Time 0 is the first painted frame after a selection.
- Only on-screen rows wash.
- "—" stamps emit count-end at landing.
- Grain is made 450 ms before landing.
- Stamp DOM order is unchanged.
- An interrupt drops the old ghost.
- Reduced motion: a fade plus one soft stamp at strength 0.35.
- Dot ink is drawn as strength.
- The ink has its own random stream.
- The impact point comes from the inset offsets.
- Bar-name legibility values.
- The gauntlet LOD fix (a WP-08 file).

## Open points

1. **Selection to first painted frame.** On the big tables (Artisan ~990 ms, Carpenter ~700 ms, Blacksmith ~390 ms) app.js's own render blocks the page. This happens with ink off too. Time 0 is anchored after it, so the sequence itself is on time, but the click still feels late on those views. A fix belongs in render work (WP-11 or later), not in app.js logic.
2. **Frame cost.** During a sequence the average frame is ~22 ms against ~17 ms without ink. The quality benchmark can therefore pick a lower tier if it runs during the load wash (seen here when the save loads right after page open). Paul normally takes seconds to pick a file, so the benchmark is long done by then. Not changed.
3. **The stamp thump sounds** come from WP-12's existing mapping (`fx:stamp-land`, `fx:dot`, `fx:count-end`). They were not listened to this session.
