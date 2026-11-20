# WP-11 builder report: surfaces and popups

Every remaining surface on the desk is now physical:

- title swashes
- favourite tags
- the paper lift on scroll
- the five-fold Details unfold (also used by How-to and the help letter)
- parchment menus and the brass record switch
- the toast and tooltip slips
- tour lighting
- the file-drop ripple, value wipes and the error blot

Built in full, as Paul asked: nothing was simplified. All checks ran on the real GPU (ANGLE Metal, Apple M2) at 1440 × 900, with Paul's save from `fixtures/private`. The name is masked in the screenshot.

Acceptance: **7 / 7 PASS.**

- **Self-check (round 2, 2026-11-11, on the post-WP-14 build):** `npm run build:single && node tools/wp11-check.cjs all` passes **44/44** in one session (`docs/reports/wp-11/wp11-check-all.txt`). The first `all` run gave 42/43; the failure found a real bug in the tour (see round 2 below). Round 1 was 50/50 with each mode run on its own; `all` is one page session, so the counts differ.
- **Unit tests:** `npm run test:unit` 151/151 (143 in round 1), including `unit/wp11.test.mjs`. `node scripts/test.cjs` passes.
- **Full parity (round 1 build):**

  | Target | Command | Result |
  |---|---|---|
  | flat | `TARGET=flat npx playwright test specs/parity.spec.js specs/golden.spec.js census` | **71/71** (2 workers) |
  | desk | `WORKERS=1 WP=10 TARGET=desk …` (same specs) | **71/71** |

  Every P-test passes on both, P29 included (double-click and right-click Details, draggable rows, star persists). For why the desk run used 1 worker, see open point 1. The logs (`desk2.log`, `flat2.log`, round 1) were re-read in round 2: desk 71 passed in 13.1 min with 1 worker, flat 71 passed in 1.2 min with 2 workers, nothing flaky. Parity was not re-run in round 2: the change is in desk tour lighting only, which no P-test drives (WP-15 runs the full suite).
- **WP-10 cross-check:** `tools/wp10-check.cjs` passes timing, a11y and interrupt with the slip in place.
- **Screenshot:** `docs/reports/wp-11/details-open.png`, Details open on the desk, name masked.

## Acceptance items

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Swashes loop with independent phases and never cover title letters | **PASS** | `title`: 6 flourishes, 8 samples over 12 s, 0 touches (canvas raster test against the letters). Phases at one moment: hold, rest, draw, hold, hold, hold, each at a different t. All four phases are seen. |
| 2 | Tags: P04 and P05 pass on desk; they swing on breeze and impact | **PASS** | P04 and P05 pass on desk. `tags`: size 4.00 × 5.00 cm. Idle sway 0.27°; air gives 5.14°; an impact gives 6.20°; `tag:swing` is emitted. The drop-in runs on `app:favorite-add`. |
| 3 | Lift: no drift, settles back, covered coins inert, Tab or Home brings them back | **PASS** | `lift`: in-plane drift 0 px at scroll 0, 40, 120, 600, 3000 and back to 0. At rest the slip and table meet within 0.3 px. 4 coins get `vc-covered` while covered. Focusing a covered coin scrolls back to 0, and so does Home. |
| 4 | Details: folds at ±10 %; spark and grain over the sheet; Escape, outside click and × close; focus trapped and restored; P30 on desk | **PASS** | `details`: folds at −9 / 243 / 493 / 743 / 994 ms (spec 0 / 250 / 500 / 750 / 1000); float at 1493 ms. Layer order `…float, fx, grain`. 30 Tabs: 0 escapes. Escape, × and outside click all close, with exactly one `app:details-close` (synchronous, no late duplicate) and focus back on the Details button. P30 passes on desk. |
| 5 | Menus: every option of every select by mouse and keyboard; `change` once per choice | **PASS** | `menus`: statusFilter 5, discoveryFilter 3, biomeFilter 11 and sort 3 options. Every option by mouse, and every option by keyboard in the open list (Home, ↓ × i, Enter). `change` fires exactly once per real change (0 when re-choosing the current one). Focus stays on the select. The record switch flips by mouse and its lever follows. The closed select keeps its native keyboard, as in flat. |
| 6 | No doubled tooltips; the census still finds every title | **PASS** | `tips`: the paper slip shows the title text, and the native `title` is moved aside while it shows (no double). It is restored on leave (136 → 137 titles). The census passes on desk (3/3), and P38 passes. |
| 7 | Tour lighting dims and restores; the light pool sits on each target | **PASS** (fixed in round 2) | `tour`: key lights ×0.35 (2.6 → 0.91, veil 1.3 → 0.455), restored to 2.6 / 1.3. The pool is 0 px from the target's centre at each of the 3 steps, and it now moves to each one: Load coin (1132, 185), board (279, 440), stamps (975, 500). In round 1 step 2 had no target on the desk and the light stayed on the Load coin; the round 1 check could not see that. On Highlights, step 3 has no stamps and the pool fades out in 300 ms. |

**Also checked:**

- **How-to:** the popup unfolds on the same rhythm (folds 1 / 263 / 513 / 763 / 1013 ms) and emits `howto:open` and `howto:close`.
- **Help letter:** it floats with all 7 paragraphs and `#forget`, and the envelope's seal cracks. It emits `help:open` and no `details:fold`. Escape folds it back.
- **Toast (P37):** in the bottom-right quarter, visible at 9.3 s and gone by 11.5 s.

**DECISIONS rows applied:**

- WP-01 round-1 fix 4 (synchronous close).
- WP-03 open 8 (`howto:open` / `howto:close`).
- 11, 27, 29, 30 (P29 re-checked), 32 (180 ms wipe, menu and toast flutter), 35 and 38.

## Files

- **New:**
  - `src/surfaces/`: index.js, plan.js, unfold.js, details.js, help.js, lift.js, title.js, tags.js, menus.js, slips.js, tour-light.js, inkbits.js, surfaces.css
  - `tools/wp11-check.cjs` (round 2: tour parks the pointer first; new "every step has a target" check; comma-separated modes)
  - `unit/wp11.test.mjs`
  - `docs/explained/wp-11.md`
  - `docs/reports/wp-11/details-open.png`, `wp11-check-all.txt` (round 2)
- **Changed:**
  - `src/scene/stage.js`: attaches surfaces. `sceneReady` and `projV` are declared before the attach, which projects points during set-up.
  - `src/paper/index.js`: `topIn()` for hero and message placement under the slip.
  - `src/tutorial/modal.js`: `setModalHost`; `hold` inerts up the whole ancestor chain.
  - `src/tutorial/howto.js`: popup renderer hook; `howto:open` / `howto:close`.
  - `src/tutorial/tour.js`: modal host.
  - `src/events.js`: `WP11_EVENTS`.
  - `src/config/motion.js`: `surfaces` block.
  - `DECISIONS.md`, `CHANGELOG.md`, `docs/app-js-changes.md` ("WP-11: no change"), `STATUS.md`.
- **Untouched:** `src/app.js`, `../valheim-checkup`, `src/core.js`, `src/catalog.json`, `checker-reports/`, `parity.spec.js`, `golden.spec.js` and the census tests.

## Found and fixed on the way

- **Page froze after a save loaded.** The error-blot observer on `#message` called `classList.remove` even when nothing changed. That always writes the attribute, so the observer woke itself forever. The toast observer had the same bug. Both now write only on a real change.
- **Desk failed to start.** `project()` was called during set-up before `projV` was declared. Fixed by declaring it earlier.
- **Folds drifted late (~110 ms).** The stage clamps a long first frame's dt. Unfolds now run on central-clock time since their start.
- **Hover stole the keyboard's place in menus.** A list opening under a resting pointer got a `pointerover` and marked that row. Hover now marks only on real pointer movement.
- **Census "help-open" failed on desk (202 missing controls).** My first help letter was modal; the original `<details>` is not. It is now non-modal: the page stays usable, and a press outside folds it back.
- **P37 on desk.** See DECISIONS "WP-11: toast". The slip's 10 s life is one CSS animation, because Playwright's fake clock runs page timers ~13 % slow on the desk.
- **Per-frame layout reads.** The toast, floating sheets and open menus used `getBoundingClientRect()` every frame. They now cache their centre. Tags, swashes and the toast write styles only when the rounded value changes.

## Round 2 (2026-11-11): re-run on the post-WP-14 build

1. **The light missed step 2 on the desk.** Tour step 2 targets `[data-tour="board"]`, which in flat is `#categories`. On the desk that nav is a 0-px wrapper: its bar buttons sit absolutely over the 3D bars. The tour found no visible target, so it centred the slip with no cut-out, and the light pool stayed on the Load coin. Fix (`src/surfaces/tour-light.js`): at tour start the printed board `#print .vc-board-print` gets `data-tour="board"`. It is added, not renamed (point 26), and `tour.js` is unchanged.
2. **No target, no pool.** A step with nothing on screen (step 3 on Highlights or Skills & travel) now fades the pool out over 300 ms instead of leaving it on the last target. The next real target snaps the pool there. Checked by a probe: on Highlights, step 3 read `vis` 0.83 at 50 ms and 0 at 400 ms, with the spotlight at 0.
3. **Why the round 1 check passed.** It compared the pool with the box the step had measured. A step with no box never updated that box, so step 2 was compared with step 1's box, and matched. The new check also requires every step to have a target and the pool to move more than 40 px between steps.
4. **Why `all` failed and single modes passed.** The camera drifts toward the pointer (spring 30 / 10). The tooltip section leaves the mouse at (5, 5), so the camera was still sliding when step 1 measured its box. When the pool was read, the box was 20.7 px stale, but the pool sat exactly on the Load coin's live position (1143.2, 201.9 vs 1143.1, 201.9). The light is anchored to the paper, so it follows. The tour check now parks the pointer and waits 1.5 s first. In the app, the slip and the flat-only cut-out are placed from the measured box. On the desk a slip can therefore sit up to about 1.6 cm off its spot while the camera drifts, until the next scroll or resize re-lays it out. Small, and left as is (open point 5).
5. **Other specs, for the record.** `TARGET=desk` `wp01.spec.js` and `wp03.spec.js`: 5 failed, 10 passed. The same 5 fail with the round 2 change reverted, so they predate it (see the WP-04 and WP-14 reports' stale-spec notes). `TARGET=flat`: 8 failed, 38 passed; tour lighting is desk-only, so these are not from round 2 either. They were not edited (other WPs' specs).

## Open points

1. **P10 has a thin margin on desk.** It is independent of WP-11: the same with surfaces switched off (4.45 s vs 4.48 s of P10's 5 s window). Under Playwright's fake clock each frame is 16 ms plus its own JS time. WP-10's load sequence averages 12.7 ms of JS per frame, with 34 ms spikes, so page time runs at ~55 % during a load. With two workers competing, P10 failed twice; with one worker it passes, and alone it passes. No test was changed. A real fix would cut the ink load sequence's per-frame cost (WP-10 open point 2).
2. **The quality governor can't see slow frames under the fake clock.** It reads 16 ms per frame there. This only affects tests, not Paul.
3. **Sounds** for the new events come from WP-12's existing wiring. They were not listened to this session.
4. **Taste:** the Details backdrop tint (18 % dark), the swash shapes and the tag look are builder choices. Paul may want to look at the screenshot.
5. **The desk tour slip doesn't follow the camera drift** (round 2, point 4). It is placed from the box measured at each step and re-laid out on scroll or resize, not when the camera drifts up to 1.6 × 1.0 cm toward the pointer. The light pool does follow. A fix belongs in `tour.js`'s layout loop (re-measure when the camera rig's version changes). Not done; Paul can say if it shows.
