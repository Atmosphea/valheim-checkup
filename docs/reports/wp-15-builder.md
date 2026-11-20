# WP-15 builder report: packaging

`valheim-checkup-3d.zip` is built: version 2.0.0, **163.5 MB** (171.4 million bytes, 498 entries). `node scripts/package.cjs` rebuilds it and prints the exact byte count. Nothing was pushed or deployed.

Acceptance: **5 / 5 PASS** (self-check). The independent audit was skipped by Paul, so `checker-reports/final-audit.md` is a builder self-audit, titled as such.

All runs used the real GPU (ANGLE Metal, Apple M2, 8 GB). Logs are in `docs/reports/wp-15/`.

## Test results

| Run | Result | Log |
| --- | --- | --- |
| `node scripts/test.cjs` | pass | — |
| `npm run test:unit` | 151/151 | — |
| Flat: parity + golden + censuses, 2 workers | **71/71** | `run-flat-full.txt` |
| Desk: same, `WP=10`, `WORKERS=1` | **71/71** | `run-desk-full.txt` |
| Flat: parity + golden at `VIEWPORT=900x700` | **48/48** | `run-flat-v900.txt` |
| Flat: same at `VIEWPORT=390x844` | **47/48**. P39 fails; the original app fails it the same way at 390 px (`run-baseline-v390-P39.txt`), because the test tabs into the desktop sidebar that phones hide | `run-flat-v390.txt` |
| Flat: same with `REDUCED=1` | **48/48** | `run-flat-reduced.txt` |
| Flat: same with `NOWEBGL=1` | **48/48** | `run-flat-nowebgl.txt` |
| Unzipped `valheim-checkup.html` from `file://`, flat: golden + P03/P23/P42/P43 | **7/7** | `accept-file-flat.txt` |
| Same, desk (`WP=10`) | **7/7** | `accept-file-desk.txt` |
| Unzipped `site/` from `python3 -m http.server`, desk: parity + golden | **46/48**. P40 and P43 test the downloaded file (no non-file requests; works with all web traffic cut), so over http they fail by design. All 16 requests were to the local server. Both pass from `file://` | `accept-site-desk.txt` |
| `specs/wp12.spec.js`, flat (updated) | **5/5** (was 3/5) | — |
| `specs/wp04.spec.js`, desk (updated) | **12/15** (was 0 run past test 1). Fails: "frame loop" (placeholder sheet sizes from WP-04), "context loss" (real bug, open point 1), "4× CPU throttle" (never drops a tier now) | `run-wp04.txt`, `run-wp04-before.txt` |

## Acceptance items

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Unzipped into an empty folder, `valheim-checkup.html` opens from `file://`, loads the save, passes golden | **PASS** | The zip was unzipped into an empty scratch folder; `cmp` shows the file is identical to `dist/`. Golden 3/3 in flat and on the desk, with the dot grids, from `file://`. P43 (offline) passes there too. |
| 2 | `site/` served by a static server passes the P-tests on desk | **PASS, with 2 by-design exceptions** | 46/48. P40 and P43 assert a `file://` page; see the table above. Every other P-test and golden passes. |
| 3 | No `.fch`, no progress or CSV export, character name nowhere | **PASS** | `unzip -l` holds no `.fch`, `.csv`, progress JSON, `spec/`, `fixtures/`, `reference/`, `node_modules`, test output or `checker-reports/screens/`. The scan reads the name from `fixtures/private/expected.json`, plus the save's file stem. Over all 445 unzipped files it finds **0** in every form: exact, any letter case, UTF-16, `strings -a`, and the zip listing. It prints counts only. |
| 4 | START-HERE.md readable by someone new to code | **PASS** (builder review) | Plain steps, a folder table, the three terms it uses (browser, build, test) explained, and what to ask a Claude session (`npm install`, `npm run dev`, `npm run build:all`, `node scripts/package.cjs`). |
| 5 | Zip size recorded | **PASS** | 163.5 MB, above. Most of it is the earlier WPs' evidence screenshots in `source/docs/reports/` (154 MB of PNGs, which don't compress). |

## What was done

- **Version and README:**
  - `package.json` is at 2.0.0.
  - README: a "Version 2.0 — the 3D desk" section, and a privacy line: still no network requests, no hotlinked icons, so no icon line is needed.
  - README attribution: icons (Iron Gate AB via Jötunn, MIT), fonts (SIL OFL 1.1), Three.js and three-subdivide (MIT), and a pointer to `LICENSES/`.
- **`LICENSES/`:** the npm packages' LICENSE files, copied verbatim, the Jötunn MIT text with an icon note, and an index.
- **`scripts/package.cjs`:** assembles the layout from WP-15 and zips it with the macOS `zip` tool.
- **New docs:**
  - `START-HERE.md`. The old kit note moved to `docs/kit-notes.md`.
  - `QUESTIONS-FOR-PAUL.md`.
  - `docs/explained/README.md` (the index) and `docs/explained/wp-15.md`.
  - `checker-reports/final-audit.md`.
- **Stale specs** (orchestrator note 3; no parity, golden or census test was touched):
  - `wp12.spec.js`:
    - `clearLogs` waits for `__vc.ink.state()` to be idle.
    - The tour block checks only `tour.*` sounds, since the How to coin and the How-to unfold (WP-11/13) add their own.
    - Details uses the real dialog's 5 fold events instead of an extra scripted unfold, so one `fold.close`.
  - `wp04.spec.js`:
    - Native cursor is `none` since WP-09.
    - Pixel tests wait for the start-up fade (`textures.warmup().done`).
    - High bloom `'half'` (WP-14 row).
    - `sheetFill` 0.99 (WP-08+09 row).
    - Zoom settle is 120 frames.
    - Drift and shake waits use scaled time instead of frame counts, because frames are shorter since WP-14.
    - The idle DOM count must return to its start value, never more than +2.
    - The CSS3D re-render check counts transform changes only.
  - No target value in the WP-04 spec was loosened, except the DOM count. That one is still a leak check.

## Decisions logged (DECISIONS.md, WP-15)

- `source/` has no git history (git is not installed).
- The final audit is a builder self-audit.
- What `source/` leaves out, including the 5 stray root debug screenshots (`h0–h3.png`, `help.png`, no save loaded).
- The stale-spec fixes.
- The Jötunn licence text was written from the standard MIT text, not re-downloaded.
- START-HERE.md was replaced and the old kit note moved.

## Files

- **New:**
  - `scripts/package.cjs`, `LICENSES/` (7 files)
  - `START-HERE.md` (replaced), `QUESTIONS-FOR-PAUL.md`
  - `docs/explained/README.md`, `docs/explained/wp-15.md`, `docs/kit-notes.md`
  - `checker-reports/final-audit.md`
  - `docs/reports/wp-15/` (logs)
  - `valheim-checkup-3d.zip`
- **Changed:**
  - `package.json`, `README.md`, `CHANGELOG.md`, `DECISIONS.md`, `STATUS.md`
  - `tests/specs/wp04.spec.js`, `tests/specs/wp12.spec.js`
- **Untouched:**
  - `src/`, including `src/app.js`, `src/core.js` and `src/catalog.json`
  - `../valheim-checkup`
  - `parity.spec.js`, `golden.spec.js` and the census tests
  - The built app is the same build that passed every run above.

## NEEDS PAUL

Everything is in `QUESTIONS-FOR-PAUL.md`, in plain language:

- The open rows: GPU budget 300 vs 600 on Retina; the cube refresh every 6th frame; High bloom at half size; the `#loadTop` axe finding; the desk green stamp; the stamp void depth.
- Taste: the Aspect tint, and flat and desk read as one design.
- Things to try on the Mac: aspect tint, dark icons, T-pose creatures, paper warmth, GPU budget, bloom, green stamp, void depth, small desk text, `?soundboard`, `?perf`.

## Open points

1. **WebGL context loss leaves the desk black** until reload. The textures aren't regenerated on `webglcontextrestored`. This was open since WP-06 and is real on an 8 GB Mac after sleep. Paul was told in plain words. The fix is to re-run texture generation on restore.
2. **`wp04.spec.js` still fails 3 tests:**
   - "frame loop": WP-04 placeholder geometry asserts, which need rewriting against the WP-07 paper.
   - "context loss": point 1.
   - "4× CPU throttle": needs a heavier forced load to make the M2 drop a tier.
3. **P39 at 390 px** fails on the original app too. The test is desktop-only by construction.
4. **Screenshots in `source/docs/reports/`** can't be checked by a text search. Their tools mask the name, and the one opened here was masked; not all 81 were opened.
5. **Safari and Firefox weren't tested.** START-HERE says so.
