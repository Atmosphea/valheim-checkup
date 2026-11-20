# WP-05 · Textures and materials — builder report

**Date:** 2026-11-10 · **Builder** · **Round:** 1

## Verdict

WP-05 is built with Paul's scope cut: the woodblock has a plain bevelled border and no braided carving. Everything else in the WP-05 table and every material in file 05 is in full, including `?materials`.

All 6 acceptance items pass in my own checks. `tools/wp05-check.cjs` passes 18/18 on the real GPU (Apple M2 through Metal); its output is in `docs/reports/wp-05/check-output.txt`. `tests/specs/wp05.spec.js` passes 3/3 on SwiftShader (`TARGET=desk`). The unit tests pass 105/105, `scripts/test.cjs` passes, and parity + golden pass 48/48 on flat. WP-04 desk spec regression run: WP04_RESULT.

`app.js`, `core.js`, `catalog.json`, `template.html`, `checker-reports/` and the parity/golden/census tests are untouched.

## Files changed

**New**
- `src/scene/textures/`:
  - `gpu.js`: the painter, render targets, readback, FNV-1a hash and byte sizes.
  - `noise.glsl.js`: tileable PCG gradient noise, fbm, worley, normal-from-height.
  - One generator per texture: `paper.js`, `walnut.js`, `board.js`, `steel.js`, `knurl.js`, `hammered.js`, `leather.js`, `grain.js`.
  - `engrave.js`: text → height atlas → normal + cavity.
  - `index.js`: the scheduler (frame budget 10 ms), timing, hashes, memory, the shared bitmaps and data URLs.
- `src/scene/materials/`: one file per file 05 material, plus `patch.js` (the shader-patch helper and texture views) and `index.js` (`MATERIAL_TABLE`).
- `src/scene/materials-review.js`: the `?materials` page.
- `src/scene/dress.js`: dresses the WP-04 placeholders in the new materials.
- `src/scene/warmup.js`: the candle-to-full fade at startup.
- `src/scene/gpu-memory.js`: the memory estimate and the pixel-ratio fit.
- `src/fonts.css`
- Tests and checks: `unit/wp05.test.mjs` (6 tests), `tests/specs/wp05.spec.js` (3 tests), `tools/wp05-check.cjs`.
- `docs/explained/wp-05.md`, this report, and `docs/reports/wp-05/` (screenshots and check output).

**Changed**
- `src/scene/stage.js`: builds the textures, dresses the scene, adds the warm-up and memory fit, compiles before the first frame, arms the benchmark after textures, and adds hooks (`__vc.stage.textures`, `__vc.stage.gpuMemory()`, `__vc.engraved()`).
- `src/scene/post.js`: a hand-wired chain with one MSAA scene target, replacing the second EffectComposer.
- `src/scene/lights.js`: softbox falloff, bounce panel, and the room cube kept for the reflections.
- `src/scene/veil.js`: the paper normal on the veil paper, plus `setLightScale` for the warm-up.
- `src/scene/overlays.js`: the generated film-grain tile.
- `src/main.js`: `?materials`.
- `src/config/render.js`: a new `textures` block, material values, and stage environment and budget values.
- `package.json` and the lockfile: `@fontsource/grenze-gotisch`, `@fontsource/im-fell-english` and `@fontsource/im-fell-english-sc`, all 5.3.0 exact.
- `DECISIONS.md`, `CHANGELOG.md`, `docs/app-js-changes.md` ("WP-05: no change") and `STATUS.md`.

## Acceptance

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | `?materials` renders every material in file 05 | PASS | 12 cards in table order (brushed steel … desk), 4 shapes each, turning, no console errors at 1440 × 900 or 390 px; `materials-1440.png`, `materials-390.png`; wp05.spec test 1 |
| 2 | Brushed steel highlight stretched along the brushing ≥ 4:1 | PASS | `measureHighlight()` renders the key light alone on a 28 × 6 cm bar and takes second moments of the highlight: σ along/σ across = **4.50** (anisotropy 0.85); the same bar with anisotropy 0 gives 2.03 |
| 3 | Gauntlet steel reflects the warm environment, no blotchy normals at 2× | PASS | `gauntletSteel-2x.png` vs `gauntletReflections-2x.png`: with the cube camera the box side facing the paper goes from rgb(105,92,75) to rgb(173,142,113). Looked at `gauntletReflections-2x-crop.png` myself: smooth, warm reflections, no lumpy or blotchy normals |
| 4 | No visible tiling seams on the paper at 1440 × 900 | PASS | The paper is one texture per sheet and never repeats. Looked at `desk-1440x900.png` myself: no seams, only the intended creases. Every tiling texture (walnut, steel, knurl, hammered, leather, grains) has a wrap-seam difference ≤ 1.6× ordinary neighbours, or under 1.5/255 |
| 5 | Same seed → pixel-identical textures (hash) | PASS | Seed 7 loaded three times (desk): all 18 FNV-1a hashes identical; seed 8 changes 17/18 (the engraving atlas is text, so it doesn't depend on the seed). Also on SwiftShader via `?materials` (wp05.spec test 2) |
| 6 | Generation logged and < 600 ms on High; GPU memory < 300 MB on High | PASS | Console: `[desk] textures generated in 364 ms on high`; three loads 364 / 305 / 320 ms (Metal, 1440 × 900, High picked by the benchmark). Estimate 295.9 MB (textures 81, post 79, shadows 64, bloom 24, veil 16, other 32) |

## Screenshots vs the reference

These are in `docs/reports/wp-05/` and I looked at them against `reference/IMG_6272.png`:

- **Paper:** reads like the reference (cream, fibrous, ragged deckle, brown edge burn, tide-line stains, the cross of folds). Overall it's a shade darker: (211,192,167) average against (226,205,180).
- **Desk planks:** walnut grain with per-plank shade, close to the reference's warm brown.
- **Woodblock:** walnut grain and a plain bevelled frame. It's lighter and redder than the reference's dark oiled block (135,98,69 vs 114,72,48), because the key light's broad specular at file 05's roughness washes it. WP-06 replaces the box with the real carved block, so retune then.
- **Coins:** the hammered gold reads, but they're still flat WP-04 discs; WP-06 gives them rims and legends. AgX tone mapping desaturates the gold a little (187,146,98 vs 172,124,67).
- **Gauntlet stand-in:** polished, warm reflections; the bloom on the capsule is WP-04 open 2 (WP-08).

## Open points

1. **NEEDS PAUL: Retina sharpness vs the 300 MB limit.** Full 2× on High estimates about 550 MB. To meet the acceptance limit, High's pixel ratio is lowered until it fits (in 1/8 steps, never below 1), so a 2× MacBook screen renders the 3D layer at 1× at 1440 × 900. Printed text (layer 2) stays sharp; only the 3D picture is softer. To change it, raise `stage.gpuBudgetMB` in `src/config/render.js` (e.g. 600 for full 2×), or accept 1×. It's reversible and a single number.
2. Woodblock tone (see above): kept the spec roughness. Revisit in WP-06.
3. `?texsync` diagnostics are kept (documented in `textures/index.js`).
4. Generation on SwiftShader (Low) takes several seconds. It's functional, the fade waits for it, and nothing errors.

## Self-check commands

```
npm run build:all
node scripts/test.cjs                       # passes
npm run test:unit                           # 105/105
cd tests && TARGET=flat npx playwright test specs/parity.spec.js specs/golden.spec.js   # 48/48
cd tests && TARGET=desk npx playwright test specs/wp05.spec.js                          # 3/3
cd tests && TARGET=desk npx playwright test specs/wp04.spec.js                          # WP04_RESULT
node tools/wp05-check.cjs                   # 18/18 (Metal GPU)
```
