# Final audit (builder self-audit, not independent)

**This is not the independent checker audit.** Paul chose to skip that. This report was written by the builder of WP-15, who also built most of what it checks. It lists every command run and what came out, so anyone can repeat it.

- **Date:** 2026-11-11
- **Machine:** Paul's Mac (Apple M2, 8 GB)
- **Browser:** Chromium from Playwright, on the real GPU (ANGLE Metal)
- **Settings for every run:** 1440 × 900 unless a run says otherwise; locale en-US; timezone UTC; date fixed to 2026-11-10
- **Build:** version 2.0.0, from `npm run build:all`

The full logs are in `source/docs/reports/wp-15/`.

## 1. The three main test families (file 03 parity, file 07 golden values, the censuses)

| Run | Command (from `tests/`) | Result |
| --- | --- | --- |
| Flat, everything | `TARGET=flat WORKERS=2 npx playwright test specs/parity.spec.js specs/golden.spec.js census/` | **71/71 pass** |
| Desk, everything | `WP=10 TARGET=desk WORKERS=1 npx playwright test specs/parity.spec.js specs/golden.spec.js census/` | **71/71 pass** |
| Flat, 900 × 700 | `VIEWPORT=900x700 TARGET=flat WORKERS=2 npx playwright test specs/parity.spec.js specs/golden.spec.js` | **48/48 pass** |
| Flat, 390 × 844 (phone) | `VIEWPORT=390x844 …` (same specs) | **47/48**: P39 fails (see below) |
| Flat, reduced motion | `REDUCED=1 …` | **48/48 pass** |
| Flat, WebGL switched off | `NOWEBGL=1 …` | **48/48 pass** |

**P39 at 390 × 844.** P39's keyboard step tabs until focus lands in the desktop sidebar (`#categories`). At phone width the original app hides that sidebar and uses the "Collection" drop-down instead. The original app (`TARGET=baseline`) fails P39 at 390 × 844 in exactly the same way (`run-baseline-v390-P39.txt`). So this is a limit of the test at phone width, not a change made by the 3D build. Nothing was changed. P39 passes at 1440 and 900 in every mode.

## 2. Acceptance from the zip itself

The zip was unzipped into a new, empty folder, and every check below ran on that copy.

| Check | Command | Result |
| --- | --- | --- |
| `valheim-checkup.html` is byte-identical to the build | `cmp` | **same** |
| From `file://`, flat: load the save and check the golden values, plus the offline and record-mode P-tests | `WP=10 TARGET=flat TARGET_URL=file://…/valheim-checkup.html?mode=flat … golden.spec.js parity.spec.js -g "golden\|dot\|P42\|P43\|record"` | **7/7 pass** |
| From `file://`, desk | same, with `?mode=desk` | **7/7 pass** (golden 3/3, with the dot grids) |
| `site/` served by a static server (`python3 -m http.server`), desk: P-tests and golden | `WP=10 TARGET=desk TARGET_URL=http://127.0.0.1:8765/index.html?mode=desk WORKERS=1 … parity.spec.js golden.spec.js` | **46/48**: P40 and P43 fail by design (see below) |

**P40 and P43 on the served site.** These two tests check the downloaded single file:

- P40 lists every request that isn't a local file.
- P43 cuts off all web traffic and still expects the app to load.

A site served over http can't pass either test. All 16 requests P40 saw went to the local test server itself (`127.0.0.1:8765`), and none went anywhere else. Both tests pass on `valheim-checkup.html` from `file://`, both in the row above and in the full runs.

## 3. Personal data

The name check reads the character name from `fixtures/private/expected.json`. It also checks the save's file name, because that name contains the character name. Neither string is ever printed; the check reports counts only.

| Check | Result |
| --- | --- |
| Every file in the unzipped zip (445 files) | **0** exact matches |
| The same, ignoring capital letters | **0** |
| The same, as UTF-16 text | **0** |
| `strings -a` output of every file (inside pictures, fonts, the zip's binaries) | **0** |
| The zip's file list (`unzip -l`) | **0** |
| `.fch` files, `.csv` files, progress exports | **0** |
| `spec/`, `fixtures/`, `reference/`, `node_modules/`, test output folders, `checker-reports/screens/` | **none in the zip** |

**What the search can't see.** A text search can't read pictures. Earlier WPs' evidence screenshots in `source/docs/reports/` were taken by tools that paint over the name. The one screenshot opened in WP-15 that has a save loaded (`wp-10/desk-final-1440.png`) shows the name covered. Not every screenshot was opened one by one.

## 4. Other checks

| Check | Result |
| --- | --- |
| `node scripts/test.cjs` (save-parser regression tests) | **pass** |
| `npm run test:unit` | **151/151 pass** |
| `specs/wp12.spec.js` on flat (brought up to date in WP-15) | **5/5 pass** |
| `specs/wp04.spec.js` on desk (brought up to date in WP-15) | **12/15 pass**: the 6 acceptance tests (including the 5-minute idle heap run), camera, input, visual review, resize, hidden tab and WebGL failure. **3 fail; open:** "frame loop" (it measures WP-04's placeholder sheet, which WP-07's real paper replaced), "context loss" (a real bug, below), and "4× CPU throttle" (the desk stays on High for 10 minutes: since WP-14 the M2 never gets slow enough to drop a tier). The file runs in order and stops at its first failure, so the groups after "frame loop" were run on their own with `-g`. |

## 5. Open findings

1. **The desk stays black after the graphics card resets** (WebGL context loss). The textures are made once on the graphics card and aren't remade after a restore. This was found in WP-06 and is still open. On an 8 GB Mac a reset can happen after sleep or when memory runs low. Reloading the page fixes it.
2. **The four `wp04.spec.js` tests** listed above.
3. **There is no independent audit.** Everything here was checked by the builder.
