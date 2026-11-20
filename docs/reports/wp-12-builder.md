# WP-12 · Audio — builder report

**Date:** 2026-11-10 · **Builder** · **Round:** 1 · **Scope:** trimmed by Paul's "Scope cuts" decision (21 key sounds, one take each, no ambience; `?soundboard` kept).

## Verdict

WP-12 is built to the trimmed scope. 5 of 5 remaining acceptance items pass. The ambience item (ducking, bed crossfade) was dropped along with the ambience bed. `node scripts/test.cjs` passes, the unit tests pass 99/99, and parity + golden + wp01 on `TARGET=flat` give 63 passed, 0 failed. `tests/specs/wp12.spec.js` passes 5/5 and `tools/wp12-mix-check.cjs` passes 2/2. `app.js`, `core.js`, `catalog.json` and the checker's tests are untouched.

## Files changed

**New**
- `src/audio/blocks.js`: modal metal, noise bands with sweeps, click, crackle, FM bell, generated room impulse responses with FFT convolution, loop crossfade, `toBuffer`.
- `src/audio/recipes/{mech,coin,magic,paper}.js` and `index.js`: one function per built sound, named as in file 06, plus each sound's expected length range.
- `src/audio/engine.js`: buses, master chain, voices, unlock, idle rendering, loops, mute, hidden-tab fade, logging, offline check.
- `src/audio/wiring.js`: event → sound for all 69 sounds (deferred ones stay silent).
- `src/audio/sequences.js`, `src/audio/soundboard.js`, `src/audio/overrides.js`, `src/audio/index.js`.
- `assets/audio/override/README.md`: the override slot.
- `tests/specs/wp12.spec.js`, `unit/audio.test.mjs`, `tools/wp12-mix-check.cjs`.
- `docs/explained/wp-12.md`, this report, `docs/reports/wp-12/soundboard-{1440,390}.png`.

**Modified**
- `src/main.js`: imports audio in both modes. `?soundboard` loads the soundboard instead of the desk stage.
- `src/config/audio-mix.json`:
  - `"deferred": true` on 48 sounds.
  - `engine.takesBuilt` 1, `voicesPerSound` 4, `limiterCeiling`.
  - The open values listed in DECISIONS.
  - spark.crackle now triggers on `spark:out`.
  - All of file 06's numbers are still there; the config unit test passes.
- `CHANGELOG.md`, `DECISIONS.md` (10 WP-12 rows), `docs/app-js-changes.md` ("WP-12: no change"), `STATUS.md`, `dist/` (rebuilt).

## Acceptance

| Item | Result | Evidence |
| --- | --- | --- |
| All sounds exist and render; offline test per sound: RMS > −50 dBFS, peak ≤ −1 dBFS after the master, duration in range, no NaN | **PASS** (21 built; 48 deferred per Paul) | `wp12.spec.js` test 1 renders each take with `OfflineAudioContext` through the real master chain at 0 dB, mix gain and +12 dB. RMS is −24.0 to −9.4 dBFS. The highest peak is −1.00 dBFS: the ceiling holds even at +12 dB. Every length is inside its range, with 0 non-finite samples. `unit/audio.test.mjs` repeats this in Node. |
| Scripted sessions produce `__vc.sound.log` sequences matching file 06 | **PASS** | Real UI: load → `load.success, toast.in`; failed load → `load.fail`; the tour → `tour.dim, tour.move×3, tour.end` requested (deferred, so silent); Details close → `fold.close` requested (deferred). Scripted canonical events for features not built yet: Details folds → 5 × `unfold.flap`, each about +1.5 semitones; view change → `wash.out, wash.in, stamp.big×4` (pitches 1.00/0.97/1.03/0.95 ±2 %) + 160 × `stamp.dot`; drag-latch → `bar.scrape:start, :stop, bar.latch, bar.return`; spark → `spark.out, spark.crackle:start, :stop, spark.in`; coin hop → `coin.up`, contacts at −14/−22 dB and 3 chatter hits from −28 to −34 dB. |
| The Carpenter view change (40 × 4) never has more than 8 `stamp.dot` voices | **PASS** | Real Carpenter view plus the scripted dot timing: max 4 voices at once. Break attempt with 40 dots in one instant: max 8, with 32 oldest voices cut. Total voices never went over 24. |
| Ambience ducked 5 dB under big stamps; no click at the bed crossfade | **DROPPED** | Scope cuts: no ambience bed. |
| No sound before the first interaction; mute survives a reload | **PASS** | Events before any click: log empty, requests `star.on:locked, toast.in:locked`. After a click, `star.off` plays. `mute(true)` → reload → `muted()` true and storage `'0'`; a play then gives `star.on:muted`, and after unmuting it is audible again. |
| A downloaded `audio-mix.json` dropped into `src/config/` and rebuilt changes the gains | **PASS** | The soundboard test downloads the file: it is byte-format `JSON.stringify(…, null, 2)`, and equal to the config except for the edited gain and pitch. `tools/wp12-mix-check.cjs` writes bar.latch −30 dB and rebuilds: config −10 → −30, played −9.71 → −29.71 dB. Then it restores the file and rebuilds. |

**Also checked:**
- The override slot: a `tour.move.wav` in `assets/audio/override/` replaces the recipe after a rebuild, and even revives the deferred sound (mix-check 2/2).
- Desk mode loads with audio and shows no console errors.
- The soundboard looks right at 1440 px and 390 px, with no horizontal scroll (I looked at both screenshots).
- Privacy scan of all new and changed files plus `dist/valheim-checkup.html`: 0 hits.

## Open points

1. **For later WPs (hand-off):**
   - Emit the events with `category` / `stamp` / `coin` data, or `screenX`, so pan works.
   - `bar:drag` can carry `speed` in cm/s; otherwise it is derived from `travel` with `travelCm` 10.
   - `paper:lift` can carry `speed`, and `impact` / `fx:stamp-land` can carry `strength`.
   - WP-06 must not emit `coin:land` for flip landings. WP-11 must not emit `details:fold` for the help letter.
   - The Sound coin emits `coin:mute {muted?}` and reads `__vc.sound.muted()` for its face.
2. **gauntlet.plate and paper.breeze have no event.** Both are deferred; the WP that brings them back adds one.
3. **WP-14** will need to re-check long tasks. Each take renders in under 30 ms in idle time, but this was not measured on Paul's Mac.
4. **Taste for Paul's mix pass:** all 21 sounds are first-pass synthesis at file 06's starting gains. Use `?soundboard`.

## Self-check commands

| Command | Result |
| --- | --- |
| `node scripts/test.cjs` | Passed |
| `npm run test:unit` | 99 / 99 |
| `cd tests && TARGET=flat WORKERS=1 npx playwright test specs/parity.spec.js specs/golden.spec.js specs/wp01.spec.js` | 63 passed |
| `cd tests && TARGET=flat WORKERS=1 npx playwright test specs/wp12.spec.js` | 5 passed |
| `node tools/wp12-mix-check.cjs` | 2 / 2, config restored |
