// @ts-check
/**
 * WP-18P: GPU time per frame for one WebGL2 context (EXT_disjoint_timer_query_webgl2), for the
 * adaptive governor. A query wraps the whole frame's work on the context; its result arrives a
 * few frames later, so `last` is a frame or three old (fine for a governor). Browsers without the
 * extension (Safari, Firefox) report null: the governor then works from frame and JS times only.
 */
const RING = 4;

/** @param {WebGL2RenderingContext} gl */
export function createGpuTimer(gl) {
  const ext = /** @type {any} */ (gl.getExtension?.('EXT_disjoint_timer_query_webgl2'));
  if (!ext) return { begin() {}, end() {}, poll: () => null, get supported() { return false; } };
  /** @type {(WebGLQuery|null)[]} */ const ring = Array.from({ length: RING }, () => null);
  /** @type {boolean[]} */ const busy = Array(RING).fill(false);
  let i = 0, open = false;
  /** @type {number|null} */ let last = null;
  return {
    begin() {
      if (open || busy[i]) return; // the slot's last result hasn't come back yet: skip a frame
      ring[i] ??= gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, /** @type {WebGLQuery} */ (ring[i]));
      open = true;
    },
    end() {
      if (!open) return;
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      busy[i] = true; open = false;
      i = (i + 1) % RING;
    },
    /** The newest finished result in ms (null = none yet or unreliable). */
    poll() {
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      for (let k = 1; k <= RING; k++) {
        const j = (i + RING - k) % RING, q = ring[j];
        if (!busy[j] || !q) continue;
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
        const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
        busy[j] = false;
        if (!disjoint) last = ns / 1e6;
      }
      return last;
    },
    get supported() { return true; },
  };
}
