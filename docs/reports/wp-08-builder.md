# WP-08 builder report: the gauntlet model

The WP-04 stand-in is replaced by the real gauntlet: 19 bones with joint limits, plates as two-skin shells with rolled edges, 60 rivets, a skinned leather under-glove, the hinged index tip cap over an ember socket, vambrace, cuff, strap and buckle; seven poses blended per bone; a shadow proxy for the veil; bloom on plates and rivets only; LOD0 / LOD1 by tier; and the `?gauntlet` review page. All checks ran on the real GPU (ANGLE Metal, Apple M2), 1440 × 900.

Acceptance: **7 / 7 PASS** (one with a config change for Paul to confirm, item 7). Self-check: `node scripts/test.cjs` passes; `npm run test:unit` 131/131 (6 new); `node tools/wp08-check.cjs all` 14/14. No parity/golden run this session (as asked).

## Files

- New: `src/gauntlet/shell.js` (plate kernel: lathe, ellipsoid zone, height field, shells with rolled-edge beads, surface samples), `dims.js` (anatomy in cm), `rig.js` (19 bones, limits, helpers `pointerTip` / `pinchPoint`, pose blending by slerp, pinch solve, two-bone arm IK), `poses.js`, `model.js` (plates, rivets, leather, socket, shadow proxies, LODs), `collide.js` (plate penetration test), `index.js` (puts it in the scene: materials, bloom/proxy layers, veil casters, reflections, merged draws, LOD by tier, `__vc.gauntlet`), `review.js` (`?gauntlet`); `tools/gauntlet-probe.mjs`, `tools/wp08-check.cjs`; `unit/gauntlet.test.mjs`; `docs/explained/wp-08.md`; screenshots in `docs/reports/wp-08/`.
- Changed: `src/scene/stage.js` (creates the gauntlet and the WP-09 controller; LOD on tier change; CSS3D `user-select` fix, see WP-09), `src/scene/dress.js` (`useGauntlet`: reflections follow the real hand; a missing closing brace fixed), `src/scene/materials/gauntlet-reflections.js` (skip refresh while the hand is still), `src/config/motion.js` (`gauntletRig`), `src/config/render.js` (`gauntlet`, reflection gating, High cube every 6th frame, camera pitch 64°, sheet fill 0.99, engraving shades), `src/main.js` (`?gauntlet` route), `package.json` (`three-subdivide 1.1.5`).
- Untouched: `../valheim-checkup`, `src/core.js`, `src/catalog.json`, `src/app.js`, `checker-reports/`, `parity.spec.js`, `golden.spec.js`, the census tests. Nothing from `fixtures/private` was written elsewhere; the character name is masked in the one screenshot with a save (`desk-final-1440.png`).

## Acceptance items

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | No visible facets at 2× in the closest review view | **PASS** (by eye) | `review-close.png` (2× device pixels, Close view): smooth domes, lames, cuff and back plate; silhouettes round. `review-close-wire.png` shows the density. |
| 2 | Rolled edges on every plate; rivets (~60) | **PASS** | Every plate is built by `shell.js` with a bead tube on its free edges (visible in `review-close.png`); `__vc.gauntlet.rivets` = 60. |
| 3 | Triangles: LOD0 80k–150k on High/Medium; LOD1 without subdivision on Low | **PASS** | Desk: LOD0 148,756 on High; `__vc.quality('low')` → LOD1 53,414. Review page: 149,476 (socket shown) / 54,134. Unit test asserts both. |
| 4 | No plate passes through another in any pose or blend | **PASS** | `tools/gauntlet-probe.mjs`: 66 cases (7 poses, 21 pair blends, wrist ±35°/±20° × 4 poses, all fingers curled 95°, fan ±12°) → 0 penetrations; in the browser all 7 poses → 0; unit test repeats poses, blends and wrist extremes. The solved pinch closes the pads (gap 0.000 cm) with the thumb's plates 0.18 cm clear of the index's. |
| 5 | Steel reflects the warm paper and walnut; bloom only on the brightest highlights | **PASS** (by eye) | `look-hover.png`, `desk-final-1440.png`: the plates carry the board's stripes and the paper's warmth; bloom only on the key-light glints (layer test: plates and rivets on BLOOM, leather not, proxies on their own layer). WP-04 open point 2 closed with `envMapIntensity` 1.0. |
| 6 | The vambrace leaves the frame upper-left in every hand position over the board (default camera) | **PASS** | `wp08-check frame`: 63 / 63 hand positions on a 4 cm grid over the board, the elbow end of the vambrace is off-screen every time. Same pass: no plate covers any of the 570 printed text boxes in any of those positions (DECISIONS point 2). |
| 7 | Gauntlet < 3 ms per frame on High (measured) | **PASS** (with a config change) | `wp08-check perf` (forced, GPU-synced frames, gauntlet shown vs hidden, interleaved, medians): **1.68 ms** with the hand still, **2.71 ms** with the hand moving every frame; arm solve 0.019 ms. Needed: skip the cube refresh while the hand is still, and refresh every 6th frame on High instead of file 05's every 3rd (with every 3rd: 4.67 ms moving). See open point 1. |

Also done from the step list: `?gauntlet` review page (turntable at three distances, every pose, LOD0/LOD1, wireframe), helpers `pointerTip` and `pinchPoint`, poses in `src/gauntlet/poses.js` blended by slerp, skinned leather, shadow proxy mirrored into the veil.

From the session brief:

- **WP-07 item 5, re-checked with the real gauntlet: PASS.** With the hand at the board's right wall, its shadow crosses the printed heading and the paper beside it alike: crop mean 181.6 with the hand vs 189.5 hidden (`shadow-on-text.png` / `shadow-off-text.png`).
- **Camera tightened** (pitch 62° → 64°, fill 0.97 → 0.99): the sheet now reaches the window's sides (`desk-final-1440.png` vs `reference/IMG_6272.png`). Unit framing test passes with the new values.
- **Engraving contrast raised**: walnut cavity shade 0.35 → 0.14 (board heading, foot note), steel 0.16 → 0.05 (bar names, coin legends). See open point 3.

## Decisions (all in DECISIONS.md, tagged WP-08)

three-subdivide import path and where subdivision is used; shells with rolled-edge beads; the collision test method and case list; wrist roll to the forearm and sphere wrist lames; pinch solved at load, arm solved for `pinchPoint` while holding; stretch spread as a ±9° fan; rivet layout; merged steel draws per bone; reflection refresh gating and every 6th frame on High; reflection strength 1.0; review page; camera framing; engraving contrast.

## Desktop screenshot vs the reference

`docs/reports/wp-08/desk-final-1440.png` (save loaded, name masked) vs `reference/IMG_6272.png`. Same arrangement: board with steel bars at the left, the gauntlet entering from the upper left over the board, title at the top, coins top right, heading, stamps, filters and table at the right. Still different: the reference's steel is darker and aged where ours is bright polished steel (file 05 asks for polished); the reference's title sits over the board and its stamps have dot rows and ornaments (WP-10); the reference crops the sheet's corners, ours keeps the whole sheet in view.

## Open points

1. **For Paul:** to stay under 3 ms while the hand moves, the hand's reflection cube refreshes every 6th frame on High instead of every 3rd (file 05). I could not see a difference at desk distance. One-line revert: `render.quality.tiers.high.cubeEveryNthFrame: 3` (then ~4.7 ms moving on the M2).
2. The moving case (2.71 ms) leaves little margin; a slower GPU will be over. The quality governor still drops a tier on slow frames.
3. The foot note on the board's lower band is carved small in dark walnut; darker now, but still hard to read at 1440 × 900 at desk distance. A bigger carving or a lighter fill would help; I left the size alone (layout is WP-06's).
4. The steel reads brighter than the reference's dark aged steel; file 05 asks for polished steel (base 0.84), so I kept it.
