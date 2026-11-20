# Valheim Checkup

A Valheim achievement collection tracker that reads character saves locally in the browser.

## Use the tracker

Open the GitHub Pages website and choose **Load character**, then select a recent `.fch` file. You can also download `index.html` and open it directly in a modern browser for offline use. No installation is required.

- Completed, missing, undiscovered, and unverified totals
- Crafting, building, cooking, eating, trophies, fish, and creature checklists
- Separate any-difficulty and Hard-or-higher hunting lists
- Search, biome and status filters, alphabetical or workbook order
- Pins, manual corrections, and local progress restoration
- JSON progress export/import and filtered-list CSV export
- Achievement-credit and lifetime-action views

## Version 2.0 — the 3D desk

- **The desk:** on a computer with WebGL2, a mouse or trackpad and a window of at least 1024 × 640, the tracker opens as a candle-lit desk. Collections are brass bars you slide, the buttons are coins, the list is a parchment sheet, and an armoured gauntlet follows your pointer.
- **Flat parchment page:** phones, small windows, reduced-motion settings, computers without WebGL and `?mode=flat` get the same parchment look as a normal web page. Every text, control and number is the same in both modes.
- **Ink and stamps:** a view change washes the ink out and back in; status stamps and completion dots are printed on.
- **Icons** beside every row and in Details (1,052 items, pieces and creatures).
- **"How to" guide:** where to find your save on Windows, macOS and Linux, plus a three-step tour.
- **Sounds:** 21 short sounds (paper, brass, coins, stamps); the Sound coin mutes them. No sound plays before your first click.
- **Two builds:** `valheim-checkup.html` (one file, double-click, works offline) and `site/` (for hosting).

## Privacy

Character saves are never uploaded. The app has no backend, analytics, or account requirement. Extracted progress, pins, and corrections are stored only in your browser. It never modifies saves or Steam achievements. Exported progress files contain character information; keep them private unless you intend to share them.

Version 2.0 still makes no network requests: the fonts, icons, sounds and 3D models are all inside the app. No icon is loaded from another website.

Loading a file replaces the automatic snapshot for that character while preserving saved corrections and pins. Load again after playing to refresh progress. Export/import is needed when moving between browsers or website origins.

## Supported saves and catalog

The importer supports profiles **46–47**, player data **33–34**, and inventories **109–110**. It validates SHA-512 and consumes the complete profile and embedded player data. Unsupported or damaged files are rejected without replacing loaded progress.

The catalog preserves the community workbook's 108 creatures, 68 trophies, 82 cooked dishes, 415 crafting entries, 400 building entries, 97 edible items, and 12 fish. Collection targets overlap. Seven building entries need manual verification: four roof variants share display names, and three storage-display names have unresolved mappings. These appear as **Unverified**, separately from **Missing**.

**Undiscovered** means an item is absent from the character's known recipes/materials and has no matching action in the selected record. It does not mean the achievement is hidden, and the app does not evaluate all recipe prerequisites.

## Develop

Node.js 20 or newer. Run `npm install` once (Vite and the single-file plugin, pinned versions).

```sh
npm run dev            # development server at http://localhost:5173/
npm run build:single   # dist/valheim-checkup.html — one file, opens by double-click, works offline
npm run build:site     # dist/site/ — separate files for hosting later
npm run build          # dist/original.html — the flat original page (scripts/build.cjs)
npm test               # scripts/test.cjs, the save-parser regression tests
npm run test:unit      # unit tests for the shared helpers and config (unit/)
npm run check          # syntax check of src/core.js and src/app.js
```

The page entry is `index.html` at the root. `src/core.js` and `src/catalog.json` are inlined into it unchanged by `tools/vite-plugin-inline-legacy.mjs`. After a build, `node tools/smoke.cjs` runs the WP-01 browser self-check using the checker's Playwright install in `tests/`.

## Sources and attribution

- [Tudzer's community achievement tracker](https://docs.google.com/spreadsheets/d/1Hc167FeYYJlXQUui1SCOazS0LH-6N3wpdy4UAz7-wZw/edit) and [Steam achievement guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3799211007)
- [Jötunn English localization reference](https://valheim-modding.github.io/Jotunn/data/localization/translations/English.html)
- [Valheim wiki achievements](https://valheim.weirdgloop.org/w/Achievements)
- Trophy drop chances and uses in Details: the Valheim Wiki [Trophies](https://valheim.weirdgloop.org/w/Trophies) page, under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/); bundled as `src/data/trophy-drops.json` (fetched 2026-11-11, no network requests at run time)
- Supplemental identifiers and save semantics verified from installed Valheim game files
- Food recipes in Gourmet Details (station, level, ingredients): the Valheim Wiki [Food](https://valheim.weirdgloop.org/w/Food) page, under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/); bundled as `src/data/food-recipes.json` (fetched 2026-11-12, no network requests at run time)
- Item, piece and creature icons © Iron Gate AB, via the [Jötunn documentation](https://github.com/Valheim-Modding/Jotunn) (MIT) and the Valheim wiki
- Fonts: Grenze Gotisch, IM Fell English and IM Fell English SC, under the SIL Open Font License 1.1 (via Fontsource)
- [Three.js](https://threejs.org/) (MIT) and [three-subdivide](https://github.com/stevinz/three-subdivide) (MIT) for the 3D desk
- Licence texts are in `LICENSES/`

Unofficial fan tool. Valheim and its game data belong to Iron Gate AB. No character saves, exported player progress, game binaries, or personal test data are included in this repository.

## Death collections

Are You Alright? tracks the 16 required death causes; That Can't Be an Accident tracks 10 tree species. Both read numeric PlayerStatType counters already present in profile 46–47 saves, so existing progress snapshots remain compatible. Tree chopping and tree tool tiers do not count as species deaths. Requirements were cross-checked with the community achievement guide and identifiers with the local game code.

## Blacksmith collection

The Blacksmith tracks 145 craftable weapons, verified from recipe items, ItemData.IsWeapon, and the achievement exclusion list in installed game assets. The game dynamically regenerates this list; its serialized 164-entry list includes excluded items. Shields and ammunition are excluded; pickaxes, bombs, staves, and torches count when the game classifies them as weapons. 142 entries overlap with Artisan and share item IDs, pins, and corrections. Club, Stone Axe, and Torch are added only to Blacksmith because the original workbook omitted them. Artisan remains at 415 entries. No game binaries are published.
