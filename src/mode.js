// @ts-check
/**
 * Run mode switch: `desk` (the 3D scene) or `flat` (the parchment page). Decided once at page
 * load; the mode never changes mid-session (WP-13, DECISIONS points 8 and 24).
 *
 * Desk needs (WP-04 step 10): WebGL2, no reduced-motion preference (unless the help switch
 * "Use the 3D desk anyway" is on), a fine pointer, and a viewport of at least 1024 × 640.
 * `?mode=flat|desk` overrides the automatic choice for tests (DECISIONS point 14); forced desk
 * ignores reduced motion and viewport, but still needs WebGL2.
 *
 * WP-04 delivered the desk stage, so DESK_AVAILABLE is true. Setting it to false sends every
 * page load to flat mode again (an emergency switch).
 */

/** True since WP-04: the scene exists. */
export const DESK_AVAILABLE = true;

export const MIN_DESK_WIDTH = 1024;
export const MIN_DESK_HEIGHT = 640;
/** DECISIONS point 9. */
export const FORCE_DESK_KEY = 'valheim-checkup-3d:force-desk';

/**
 * @typedef {object} ModeEnv
 * @property {boolean | (() => boolean)} webgl2   may be a function so detection only runs when needed
 * @property {boolean} reducedMotion
 * @property {boolean} finePointer
 * @property {number} width
 * @property {number} height
 * @property {boolean} [forceDesk]   the help switch
 * @property {string|null} [query]   value of ?mode=
 * @property {boolean} [deskAvailable]
 */

/**
 * Pure decision, easy to unit-test.
 * @param {ModeEnv} env
 * @returns {'desk'|'flat'}
 */
export function decideMode(env) {
  const webgl2 = () => (typeof env.webgl2 === 'function' ? env.webgl2() : env.webgl2);
  const available = env.deskAvailable ?? DESK_AVAILABLE;
  if (env.query === 'flat' || !available) return 'flat';
  if (env.query === 'desk') return webgl2() ? 'desk' : 'flat';
  if (env.reducedMotion && !env.forceDesk) return 'flat';
  if (!env.finePointer) return 'flat';
  if (env.width < MIN_DESK_WIDTH || env.height < MIN_DESK_HEIGHT) return 'flat';
  return webgl2() ? 'desk' : 'flat';
}

/**
 * WP-13 step 9: can this device run the desk at all (WebGL2, a fine pointer, a big enough
 * window)? Only reduced motion stands between it and the desk. The help switch "Use the 3D desk
 * anyway" is offered only then.
 * @param {ModeEnv} env
 */
export function canRunDesk(env) {
  return decideMode({ ...env, reducedMotion: false, forceDesk: false, query: null }) === 'desk';
}

/** Does this browser give us a WebGL2 context? The test context is released straight away. */
export function hasWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

/** @returns {ModeEnv} the real browser environment */
export function readEnv() {
  const media = (/** @type {string} */ q) => { try { return matchMedia(q).matches; } catch { return false; } };
  let forceDesk = false;
  try { forceDesk = localStorage.getItem(FORCE_DESK_KEY) === '1'; } catch { /* storage blocked */ }
  let query = null;
  try { query = new URLSearchParams(location.search).get('mode'); } catch { /* no location */ }
  return {
    webgl2: hasWebGL2,
    reducedMotion: media('(prefers-reduced-motion: reduce)'),
    finePointer: media('(pointer: fine)'),
    width: typeof innerWidth === 'number' ? innerWidth : 0,
    height: typeof innerHeight === 'number' ? innerHeight : 0,
    forceDesk,
    query: query === 'flat' || query === 'desk' ? query : null,
  };
}

/** The environment read once at load (the help switch reads it again). */
export const loadEnv = readEnv();
/** The mode for this page load. */
export const runMode = decideMode(loadEnv);

// Styling hook (DECISIONS point 26: style through `body.mode-desk` / `body.mode-flat` scoping).
if (typeof document !== 'undefined' && document.body) {
  document.body.classList.add('mode-' + runMode);
}
