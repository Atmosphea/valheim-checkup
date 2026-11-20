// @ts-check
/**
 * Entry point (loaded as <script type="module"> by index.html).
 * Order matters: the debug API, clock, random generator and run mode exist before the
 * original app code runs, so the app's very first emits are recorded.
 *
 * By the time this runs, index.html has already run the inlined classic scripts:
 * #catalogData (catalog.json) and core.js (sets the global ValheimCore) — see inline-legacy.
 */
import './debug.js';
import './privacy.js';
import './app.js';
import './a11y.js'; // WP-14: accessibility repairs that leave app.js and the parity-read markup alone
import './icons/icons.js'; // WP-02: after app.js, so the first render already exists
import './tutorial/howto.js'; // WP-03: How-to control, save-location popup and tour
import './insights/records.js'; // WP-18C: Bosses and Viking records in Highlights (before the ink, so they ink in)
import './ink/index.js'; // WP-10: ink wash, stamps and dots (both modes)
import { runMode } from './mode.js';

import './audio/index.js'; // WP-12: sounds in both modes; silent until the first pointer or key press
import './flat/index.js'; // WP-13: the parchment skin and flat-mode surfaces (does nothing on the desk)

// WP-12: ?soundboard is Paul's mix page; it needs no 3D desk.
// WP-05: ?materials is the material review page; it builds its own small scene instead of the desk.
const query = new URLSearchParams(location.search);
const soundboard = query.has('soundboard');
// WP-14: ?perf shows the frame-rate / draw-call / JS-time overlay (both modes)
if (query.has('perf')) import('./perf.js');
if (soundboard) import('./audio/soundboard.js');
else if (query.has('materials')) import('./scene/materials-review.js');
// WP-08: ?gauntlet is the gauntlet review page (turntable, every pose, LOD, wireframe).
else if (query.has('gauntlet')) import('./gauntlet/review.js');
// WP-04: the 3D desk stage, only in desk mode. Flat mode never runs (or pays for) any 3D code.
else if (runMode === 'desk') import('./scene/stage.js');
