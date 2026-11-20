# WP-02 · Icons — builder report

**Date:** 2026-11-10 · **Builder** · **Round:** 1

## Verdict

WP-02 is built and self-checked, and all 5 acceptance items pass. **1,052 of 1,052** icon-bearing tokens have a bundled icon. The 26 death and tree entries each have their own glyph. There are no hotlinks, so the app makes zero network requests. The atlas is 1.39 MB. One judgement call needs the orchestrator's OK (open point 1: the seven "Aspect of …" creatures).

## Files changed

**New**
- `tools/harvest-icons.mjs`: harvester A → E, incremental, git or tarball (DECISIONS WP-02 git workaround). Run it with `npm run icons`. Flags: `--offline`, `--refresh`. Work folder: `ICON_WORK`, default `<os tmp>/valheim-checkup-icon-work`, outside the project.
- `src/icons/overrides.json`: the 19 spec seed mappings plus 4 more Aspects. Every entry has a `checked` note saying what the builder saw.
- `src/icons/atlas.webp`: 991 cells × 96 px, 32 × 31 grid, 1,452,828 bytes, quality 82.
- `src/icons/icon-map.json`: `{cell, cols, rows, cells, sources, icons: token → {cell} | {hotlink, glyph} | {glyph}}`. A hotlink entry also carries a fallback glyph for when it fails to load.
- `src/icons/sources.json`: provenance per token. Re-runs read it back, so B and C are fetched again only for tokens without an icon.
- `src/icons/coverage.md`: counts per source, every non-automatic match, the hotlink list and the glyph list.
- `src/icons/glyphs.js`: 8 category glyphs, 16 death-cause glyphs and 10 tree glyphs, all distinct, `currentColor` line art.
- `src/icons/lookup.js`: pure lookups (`itemIndex`, `iconFor`, `hotlinkHosts`, `hotlinkPrivacyText`).
- `src/icons/icons.js`, `src/icons/icons.css`: put the icons in the page; credit line; privacy line; `__vc.icons`.
- `unit/icons.test.mjs`: 15 tests.
- `docs/explained/wp-02.md`, this report.

**Modified**
- `src/main.js`: one import line, `./icons/icons.js`, after `./app.js`.
- `src/strings.js`: `iconCredit`, `iconCreditTools`, `iconCreditWiki`, `iconHotlinkPrivacy`, plus an `iconCredit(used)` helper.
- `src/config/render.js`: new `icons` block (`rowPx 28`, `detailsPx 64`, `sepia 0.15`, `blend 'multiply'`, `grainAlphaMin 0.85`, `grainAlphaMax 1.0`, `grainTilePx 64`), added to the default export.
- `package.json`: devDependency `sharp 0.35.5` (exact, allowed by file 01), script `icons`.
- `docs/app-js-changes.md`: a "WP-02: no change" note. `CHANGELOG.md`: 5 WP-02 lines. `dist/`: rebuilt.

**Not touched:** `src/app.js`, `src/core.js`, `src/catalog.json`, `src/template.html`, `src/style.css`, `tests/`, `checker-reports/`, `STATUS.md`, `DECISIONS.md`, `../valheim-checkup`. Nothing was written outside `fixtures/private` that comes from it (see Privacy).

## How the sources went

| Source | Result |
| --- | --- |
| A · Jötunn (tarball, `dev` branch, MIT per the GitHub API) | 1,231 item rows, 541 piece rows, 162 character rows. The automatic match finds 1,033 tokens, exactly the spec's dry-run number, and the 19 left are the spec's override list. **10 Jötunn pictures are blank** (fully transparent, or particle-only at 0.0–1.2% visible pixels): all 7 `Aspect_*`, `TrophyForestTroll`, `NeckTailGrilled` and `Lingonberry`. The harvester rejects any picture below 1.5% visible (alpha > 64). The thinnest real icons, arrows and spears, measure 1.9% and up; I checked the borderline ones on a contact sheet. Final: 1,026 automatic + 22 overrides. |
| B · valheim.tools | `GET /commands` → **HTTP 403** (Cloudflare challenge page). Logged and skipped, as the spec expected. The parser is written but could not be tried against the real page. |
| C · Valheim wiki | 4 bundled: Dundr (`Dundr.png`), Troll (`Troll.png`), Lingonberries (`Lingonberries.png`), Grilled Neck Tail (`Grilled_Neck_Tail.png`). "Grilled Neck Tail" redirects into a *section* of the raw Neck Tail page, so its page image would have shown the wrong (raw) item. The harvester now rejects section redirects and looks up `File:<name>.png` instead. |
| D · hotlink | 0 |
| E · glyph | 26: the 16 death causes and 10 trees. No item falls back to a glyph. The 3 Storage Displays with no token at all get the Carpenter's `piece` glyph at runtime. |

User-Agent for every request: `valheim-checkup-icon-harvester/1.0 (offline fan-tool build script; one request per second)`. It holds no personal details, and B and C are limited to one request per second.

## Acceptance

| Item | Result | Evidence |
| --- | --- | --- |
| ≥ 1,050 of 1,052 tokens bundled; every other one has a hotlink or glyph; the 26 death and tree entries have their own glyphs | **PASS** (1,052 / 1,052) | `coverage.md`; `unit/icons.test.mjs` "acceptance 1" (×2): every token is in the map with a valid cell or glyph. `DEATH_GLYPHS` has 16 and `TREE_GLYPHS` has 10, each stat token maps to `{glyph: <its own token>}`, and all 34 glyph drawings are distinct. A test also checks that every one of the 991 atlas cells is visibly non-blank. In the browser, `__vc.icons.stats()` → `{tokens:1078, cell:1052, hotlink:0, glyph:26}`, and every row has an icon: Master Chef 82/82, The Hunter 108/108, Are You Alright? 16/16, That Can't Be an Accident 10/10, The Carpenter 400/400. |
| Spot check of 40 random rows across all collections shows the right icon | **PASS** (40 / 40) | 40 rows from a seeded generator (seed 20261110), 3–4 from each of the 11 collections, rendered through `lookup.js`'s `iconFor` from the real atlas. Checked by eye, all correct, e.g. Aspect of the Lightning Stag → tinted Eikthyr trophy, Deathsquito Trophy, Marinated Greens, Yule Garland, Pufferfish, Burning glyph, Yggdrasil shoot glyph, Lava Blob and Lava Blob Trophy (different pictures), Root, Greyling, Geirrhafa, Tetra, Snow fir, Oak and Beech glyphs, Frostfire Atgeir, Flametal Mace. The one unclear thumbnail (Northern Vengeance, small) was confirmed against Jötunn's row: `$item_staff_frostorbs` → `StaffFrostOrbs`, "A caged snowflake". The 26 non-automatic icons were also checked on a separate sheet, and the 34 glyphs on a third. |
| With every icon bundled, the app makes zero network requests at runtime | **PASS** | Parity P40 passes (loads Paul's save, every view, Details: external requests `[]`). Builder browser run from `file://` with no save: 1 request (the page itself), 0 external, 0 console errors. |
| Atlas under 4 MB; the single-file build still opens offline | **PASS** | `atlas.webp` 1,452,828 bytes (unit test asserts < 4 MiB, WebP, 96 px cells, size = cols × rows × 96). `dist/valheim-checkup.html` is 2,300,310 bytes with the atlas inlined as one `data:image/webp` URI. P43 "works offline from a downloaded file" passes. `dist/site/` references `assets/atlas-*.webp` beside the CSS. |
| Credit line present and accurate; privacy line present if and only if hotlinks exist | **PASS** | The footer shows, inside `.footer` after the original line: "Item, piece and creature icons © Iron Gate AB, via the Jötunn documentation (MIT) and the Valheim wiki." The wording comes from `icon-map.json` `sources`, which a unit test checks against `sources.json`. All four combinations are unit-tested. `.vc-hotlink-note` count is 0 (no hotlinks). A unit test confirms the sentence "A few item icons load from {host}; your save is never sent." appears only when a hotlink exists, with the host filled in. P36 still passes. |

**Self-check runs (final build)**

| Command | Result |
| --- | --- |
| `node scripts/test.cjs` | Passed (skill decoding, cooking/eating separation, checksum validation, catalog integrity, difficulty records) |
| `npm run test:unit` | **76 / 76** (61 earlier + 15 new) |
| `cd tests && TARGET=flat npx playwright test` | **86 / 86** (all P-tests, golden, the 3 censuses, 20 screens, WP-01 specs) |

**Also verified**
- **Harvester repeatability.** From an empty work folder, the harvester's own tarball path downloads and extracts only the four documentation folders (37 MB, in 21 s), and the atlas and `icon-map.json` come out byte-identical to the earlier run. An `--offline` re-run is also byte-identical. The incremental re-run fetched only the one token still missing.
- **How the page changes.** Icons are `aria-hidden`, carry no text and add no controls. `.item-name` text, `#detailTitle` text and every class and attribute that app.js writes are unchanged (DECISIONS point 26). The string, control and output censuses pass.
- **Rendering.** Screenshots of the rows (Master Chef, Hunter, death causes, trees, Carpenter) and of Details show the 28 px icon floated left of the name and the 64 px icon left of the title, with the close button still top right.

## Privacy

- **A chance match, found and removed.** The one-file build carries the atlas as base64 text. By chance, that text contained the 5-letter character name in different letter case, at one spot inside the `data:image/webp` URI. It was not in any source file or in `dist/original.html`. The harvester now reads `fixtures/private/expected.json` (name keys) and the `.fch` stems there, never printing or writing them. It re-encodes the atlas at the next WebP effort level if the raw bytes or the base64 contain any of them. This run needed one re-encode (effort 6 → 5; 1.39 MB, same quality setting). The guard is unit-tested with made-up values.
- **Final scan.** A case-insensitive scan of the raw bytes of every file under `src/`, `tools/`, `unit/`, `dist/`, `docs/` and `scripts/`, plus the root files (57 files), against all 3 private strings (the name, the save stem, the stem's name part): **no hit**.
- No screenshot was taken with a save loaded. All contact sheets and screenshots are in the builder scratchpad, and none contain save data.

## Open points

1. **Aspects (judgement call, needs an OK).** The spec seeds `Aspect_Elder`, `Aspect_Moder` and `Aspect_Yagluth`, but all three images are blank, as are the automatic matches for the other four Aspects. The wiki has no Aspect pages. Leaving them as glyphs would give 1,045, which fails acceptance item 1. I mapped each Aspect to its boss's own Jötunn trophy with a `spectral` (ghost-blue) tint. Aspects are spectral copies of those bosses, summoned by Kall Fimbulbringer, and the tint keeps the row distinct from the boss's trophy row. All 7 were looked at. If the orchestrator prefers glyphs, delete the 7 `$enemy_aspect_*` entries from `overrides.json` and re-run `npm run icons`. That gives 1,045 bundled and would need a DECISIONS entry relaxing item 1.
2. **Multiply blend scoped to paper.** WP-02 says "multiply blend", but on today's dark flat page multiply turns icons nearly black. `icons.css` applies it only under `body.mode-desk` and `.vc-paper`; WP-13's parchment skin should add `vc-paper` (or set `--vc-icon-blend`). Sepia and the grain mask apply everywhere now. The desk side can't be seen until WP-04/07.
3. **Two orders from the spec, kept.** Overrides win over the automatic match. For creatures, the order is the trophy, then the item with the same token (this is how the 12 fish get their item icons; the spec's dry-run count includes them), then the character render. This means some bosses (The Elder, Moder) show T-pose character renders on their kill rows, because their trophy tokens have different names (`$item_trophy_elder`, not `…_gdking`). That's correct by the spec rule but less pretty. It could be a future override if wanted.
4. **Source B is untested against the real page** (HTTP 403). It fails safely, logging the problem and moving on.
5. **Small notes.**
   - Imprisoned Dvergr and Dvergr Mage share the same-looking model. Cast: Nord Greataxe and Cast: Nord Sledge are near-identical moulds. Both are right.
   - Dundr's wiki picture is 64 px, upscaled to 96 px, so it is a little softer.
   - The 3 Storage Displays have no token at all, so they get the `piece` glyph at runtime. They aren't counted among the 1,052.
   - `__vc.icons` (`stats()`, `forItem(id)`, `sources`) was added for the checker. It isn't in file 01's list, but it's additive.

## Orchestrator follow-up (DECISIONS: WP-02 open 3)

Every boss and mini-boss kill row that was on a character render, but has its own trophy in Jötunn under a different token name, now uses that trophy. I looked at each image on a contact sheet against the old render, and again as it sits in the rebuilt atlas.

| Token | Row | Was | Now | What the image shows |
| --- | --- | --- | --- | --- |
| `$enemy_gdking` | The Elder | `characters/gd_king` (T-pose, automatic) | `items/TrophyTheElder` | mossy wooden head with a glowing mark |
| `$enemy_dragon` | Moder | `characters/Dragon` (automatic) | `items/TrophyDragonQueen` | pale dragon head with spread frills |
| `$enemy_fenringcultist_hildir` | Geirrhafa | `characters/Fenring_Cultist_Hildir` (automatic) | `items/TrophyCultist_Hildir` | cultist head in a wolf-pelt hood |
| `$enemy_goblin_hildir` | Zil | `characters/GoblinShaman_Hildir` (spec seed) | `items/TrophyGoblinBruteBrosShaman` | pale fuling head (Zil Trophy) |
| `$enemy_goblinbrute_hildircombined` | Zil & Thungr | `characters/GoblinBruteBros` (spec seed) | `items/TrophyGoblinBruteBrosBrute` | dark fuling brute head (Thungr Trophy, the brute of the pair; Zil has its own row) |

- **Stay on renders (no trophy in Jötunn):** Kall Fimbulbringer, phases 1 and 3 (`characters/FrozenKing`, `FrozenKing_p3`), and Lord Reto (`characters/Charred_Melee_Dyrnwyn`).
- **Already on trophies:** Eikthyr, Bonemass, Yagluth, The Queen, Fader and Brenna.
- **Out of scope, available if wanted later:** ordinary creatures on renders that also have a trophy under another name, e.g. Charred Marksman/Warlock/Warrior, Stone Golem, Cultist, Seeker Soldier, Krigen, Hexen, Eyeless One, Vile and Bonemaw.
- **Re-run:** `npm run icons` → bundled **1,052 / 1,052** (A 1,023 automatic, 25 overrides, C 4, glyphs 26 for the death and tree entries). The atlas is 986 cells (boss rows now share cells with their Trophy Collector rows), 1,431,330 bytes, effort 6. No chance-match re-encode was needed. `overrides.json` now has 28 entries, each with a `checked` note; the unit test accepts the follow-up wording.
- **Self-checks:** `node scripts/test.cjs` passed; `npm run test:unit` **76 / 76**; `cd tests && TARGET=flat npx playwright test` **86 / 86**. Privacy scan of 59 files (case-insensitive, raw bytes): no hit.
