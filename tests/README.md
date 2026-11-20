# Checker tests (WP-00)

Owned by the checker. Never edits product code.

```sh
cd tests
npm install                                    # first time only
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium   # first time only (installs into node_modules)
TARGET=baseline npx playwright test            # P01–P44, golden, censuses, screens
TARGET=flat     npx playwright test            # after WP-01 (dist/valheim-checkup.html?mode=flat)
TARGET=desk     npx playwright test            # after WP-04+ (dist/valheim-checkup.html?mode=desk)
TARGET_URL=http://localhost:5173/ npx playwright test   # any other URL
```

| Path | What |
| --- | --- |
| `specs/parity.spec.js` | One test per file 03 item, titled `P01` … `P44` (plus `P10b` for reduced motion) |
| `specs/golden.spec.js` | File 07 golden values in both record modes, plus the dot-rule arithmetic |
| `census/census.spec.js` | String, control and output censuses; `CENSUS_BUILD=1 TARGET=baseline` re-records them |
| `census/screens.spec.js` | The 20 reference screens; `CENSUS_BUILD=1 TARGET=baseline` re-records `baseline/screens/` |
| `helpers/` | Target-neutral driver (ids, roles, names; programmatic proxy clicks), synthetic `.fch` builder, private-data access |
| `golden-values.json` | File 07 numbers (no character name) |
| `baseline/` | `strings.json`, `controls.json`, `outputs.json` (hashes only), `hashes.json`, `source-strings.*`, `screens/` |

Privacy: the character name comes only from `fixtures/private/expected.json` and is written as `{name}`.
Exported JSON, CSV and localStorage from Paul's save are kept in `fixtures/private/baseline-outputs/`;
`baseline/outputs.json` holds only their SHA-256 and size. Screens mask the name.
Every run fixes the date (2026-11-10T12:00:00Z), locale en-US and timezone UTC so outputs are reproducible.
