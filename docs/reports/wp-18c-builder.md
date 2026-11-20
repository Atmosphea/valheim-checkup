# WP-18C · Builder report: Bosses, Viking records, close-out (2.3.0)

Scope: items 18–20 of `spec/wp-18-feedback.md`, built on WP-18P's architecture (central clock, layout epoch, no new frame loops). Paul's overrides are in DECISIONS as "Paul, WP-18 item n" (7 rows). Real GPU (Metal), 1440 × 900. Nothing from the save is written outside `fixtures/private`; screenshots are in `fixtures/private/wp18c/`. Scan for the character name and the world name across the repo (outside fixtures and spec): 0 hits; the zip has no `.fch` file and nothing from `fixtures/private`.

**Acceptance: 12 / 12 PASS. NEEDS PAUL: the open questions 19–28 in `QUESTIONS-FOR-PAUL.md` (18A/18B taste, the 18P cut list, and the 18C labels).**

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Bosses section above the 20 largest counts: big square tiles, trophy and name, the seven bosses plus Hildir's three | PASS | `wp18c-check`: order intro > Bosses > Viking records > champions; 10 tiles in game order; every tile has its trophy; square (flat 167 × 167 px, desk 355 × 355 layout px), both modes |
| 2 | Undefeated bosses dim | PASS | `.vc-boss--undefeated`: 38 % opacity, dashed border, grey trophy; on Paul's save 7 lit, 3 dim |
| 3 | Kills per boss from `enemy[0]`; `enemy[3]` / `enemy[4]` verified before labelling | PASS | enemy[0] = kills: its main-boss sum equals `BossKills` exactly, and its all-enemy sum is within 0.4 % of `EnemyKills`. enemy[4] looks like last hits (never above kills, and its boss sum equals `BossLastHits`), but its all-enemy sum is ~1.5× `EnemyKillsLastHits`, so it isn't confirmed. enemy[3] matches no stat. Neither is shown (DECISIONS) |
| 4 | Lifetime boss totals | PASS | `BossKills`, `BossLastHits`, `BossKillSolo`, `BossKillMultiplayer`, lifetime bucket; a note that they count the main bosses only (verified) |
| 5 | One quiet line: damage per boss (and per-kill difficulty) not recorded | PASS | "The save doesn't record the damage you dealt to each boss, or how hard the world was for each kill." |
| 6 | "Played on" from the skipped dictionaries, beside core.js, results unchanged | PASS | `src/data/save-extras.js` + `src/insights/played-on.js`. The settings are in the **second** skipped dictionary, not the first as the spec guessed: the first is world name → seconds and the third is console commands (DECISIONS). Paul's save: 7 settings ("Combat: hard · Resources: much more · …"). `unit/wp18c.test.mjs`: core.js parses the same fixture unchanged; a bad layout gives null |
| 7 | Viking records: five groups, big number left, plain labels, straight from the save | PASS | Combat, Travel & world, Building, Harvest & crafting, Deaths & oddities; 90+ non-zero rows on Paul's save (all of the spec's examples: jumps, enemy hits and hits taken, portals, time in and out of base, sleeps, Raven, tombstones, arrows, guardian powers, harvests, pieces built and removed, treasure, maximum building height) |
| 8 | Light: no per-frame work; Highlights measured before and after | PASS | built once per `app:render` (Highlights only); save JSON parsed once per load; no rAF. Highlights release, frames-only, governor frozen, 3 runs each: **before 0 / 133, 0 / 133, 0 / 133 late; after 0 / 138, 0 / 138, 0 / 138** (worst 16.8 ms both); drag 0 late both |
| 9 | Full parity + golden + census, flat (2 workers) and desk (`WP=10 WORKERS=1`) | PASS | flat **71 / 71**, desk **71 / 71** (parity, golden, census, screens). No assertion was edited. First flat run: 2 failures (P11, P34), caused by a localStorage key of mine; the code was fixed, not the tests (below) |
| 10 | wp16a flash clean | PASS | `node tools/wp16a-check.cjs flash`: 4 / 4 (0 load flashes, 0 view flashes, bloom corners 0) on the final build |
| 11 | Version 2.3.0, `npm run build:all`, `node scripts/package.cjs` | PASS | `package.json` 2.3.0, CHANGELOG `# 2.3.0`; build:all exit 0; `valheim-checkup-3d.zip` 429,169,023 bytes (409.3 MB, 753 entries; 2.2.0 was 368 MB: the growth is 18A/18B evidence PNGs) |
| 12 | QUESTIONS-FOR-PAUL.md with the 18A, 18B and 18P open points and the 18P cut list | PASS | questions 19–28: framing, coins over the scrolled table, "start here", coins, burn taste, Gourmet extras, **the cut list** (MSAA on Retina, veil size, wash on slow machines, what to keep, the two remaining pauses), the boss numbers, "Played on", and the records' labels |

Also: `node scripts/test.cjs` passed; `npm run test:unit` **172 / 172** (4 new in `unit/wp18c.test.mjs`); `node tools/wp18c-check.cjs` **32 / 32** (both modes, including after a reload, nothing added to localStorage, and Forget leaving nothing behind).

## The parity failure, and why the code changed instead of the test

The first flat run failed P11 ("localStorage keys": exactly the app's two keys) and P34 ("Forget … leaves storage empty"). Both were caused by my `valheim-checkup-3d:played-on:<id>` localStorage key. These tests protect the app's storage and privacy promise, not anything Paul's items change, so the summary now lives in **sessionStorage**: it lasts for the tab and is wiped whenever the app has no active save, i.e. after Forget. The trade-off: "Played on" shows after the file is loaded in a tab, until the tab closes. A save restored from storage in a new tab shows the bosses and records but no "Played on" line. That is noted in question 27. The re-run is 71 / 71 on both targets.

## How it works

- `src/insights/records.js`:
  - It listens for `app:render`. It is imported in `main.js` before the ink, so the new sections are planned into the ink wash like the rest of Highlights.
  - It inserts two sections before app.js's `.champions` list, with no ids and no app.js or core.js change.
  - Kills and stats come from core.js's own parse, as app.js stores it (`valheim-checkup:v1:<id>`, lifetime bucket 0, the bucket Highlights already uses).
- `src/data/save-extras.js`: a second walk of the same profile layout, keeping only the three dictionaries core.js skips. It reads the file's bytes from the file input or drop at load time, in the capture phase, beside app.js's own read.
- `src/insights/played-on.js`: pure; presets as words, then the numeric modifiers; defaults, older duplicates and world keys left out.
- `src/insights/records.css`: base, flat parchment, and desk (`--cm`) rules. The trophies are the bundled atlas cells, at the Details icon size inside the tile.

## Files changed

- **New:**
  - `src/data/save-extras.js`, `src/insights/records.js`, `src/insights/played-on.js`, `src/insights/records.css`
  - `unit/wp18c.test.mjs`, `tools/wp18c-check.cjs`
  - `docs/explained/wp-18c.md`, this report
- **Changed:**
  - `src/main.js` (one import)
  - `package.json` (2.3.0)
  - `CHANGELOG.md`, `DECISIONS.md` (7 rows), `QUESTIONS-FOR-PAUL.md` (19–28), `STATUS.md`, `docs/explained/README.md`
- **Not touched:** `src/core.js`, `src/catalog.json`, `src/app.js`, `../valheim-checkup`, `checker-reports/`, and every test assertion.

## Open points

1. **NEEDS PAUL:** questions 19–28 (taste items from 18A and 18B, the 18P cut list, and the 18C labels).
2. **Not shown, because they couldn't be confirmed:**
   - the second and third per-boss numbers (`enemy[3]`, `enemy[4]`);
   - the `Explore*` counters, `DeepestDungeon`, `VillagePointsMax`, `TombstonesFit`, `BuiltPiecesNoDebt` and `HarvestBonus`.
3. **"Played on" lasts for the tab** (sessionStorage), so the app's storage stays exactly as parity requires.
4. **Carried over from 18P:** a big table's first frame (~0.1 s) and the row-height burn still go over 16.7 ms (question 25).
