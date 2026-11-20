# Third-party licences

| What | Where it is used | Licence | File |
| --- | --- | --- | --- |
| Three.js 0.187.0 | the 3D desk | MIT | `three.js-MIT.txt` |
| three-subdivide 1.1.5 | smoothing the gauntlet model | MIT | `three-subdivide-MIT.txt` |
| Grenze Gotisch (via @fontsource 5.3.0) | headings | SIL Open Font License 1.1 | `font-grenze-gotisch-OFL.txt` |
| IM Fell English (via @fontsource 5.3.0) | body text | SIL Open Font License 1.1 | `font-im-fell-english-OFL.txt` |
| IM Fell English SC (via @fontsource 5.3.0) | small capitals | SIL Open Font License 1.1 | `font-im-fell-english-sc-OFL.txt` |
| Trophy drop chances and uses (`src/data/trophy-drops.json`, fetched 2026-11-11) | the Details sheet for trophies (WP-17 item 26) | CC BY-SA 3.0, from the Valheim Wiki [Trophies](https://valheim.weirdgloop.org/w/Trophies) page (weirdgloop); this data file is shared under the same licence | `valheim-wiki-CC-BY-SA-3.0.txt` |
| Food recipes (`src/data/food-recipes.json`, fetched 2026-11-12) | the Details sheet for Gourmet items: station, level and recipe (WP-18 item 17) | CC BY-SA 3.0, from the Valheim Wiki [Food](https://valheim.weirdgloop.org/w/Food) page (weirdgloop); this data file is shared under the same licence | `valheim-wiki-CC-BY-SA-3.0.txt` |
| Item, piece and creature icons (`src/icons/atlas.webp`, and `src/icons/recipe-icons.webp` for raw recipe ingredients, WP-18 item 17) | the icon beside each row, in Details and in the Gourmet recipe row | game art © Iron Gate AB, via the Jötunn documentation (MIT) and the Valheim wiki | `jotunn-icons-MIT.txt` |

The tavern ambience (`amb.hall`, WP-17 item 21) and every other sound are generated in code at run time
(`src/audio/recipes/`); no recorded or third-party audio ships, so there is nothing to license.
UnifrakturMaguntia and UnifrakturCook (@fontsource 5.3.0, SIL OFL 1.1) are devDependencies used only
by `tools/wp17b-check.cjs` to compare title faces (WP-17 item 22); they are not shipped.

Build-only tools (Vite, vite-plugin-singlefile, sharp, axe-core, Playwright) are not shipped inside
the app; their licences come with them when `npm install` fetches them.
