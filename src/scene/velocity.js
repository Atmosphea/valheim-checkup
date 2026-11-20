// @ts-check
/**
 * Pointer velocity on the paper plane (WP-04 step 7): a 30 ms moving average, in cm/s.
 * Pure and allocation-free (fixed ring of samples), so the frame loop can call it forever.
 *
 * The velocity is the distance travelled between the oldest and the newest sample inside the
 * window, divided by their time gap. Wall-clock ms: the pointer moves in real time even when
 * `__vc.timeScale` slows the animations.
 */

export const VELOCITY_WINDOW_MS = 30;
const RING = 64;

export function createVelocityTracker(windowMs = VELOCITY_WINDOW_MS) {
  const ts = new Float64Array(RING);
  const xs = new Float64Array(RING);
  const ys = new Float64Array(RING);
  let head = 0;
  let count = 0;
  const out = { vx: 0, vy: 0, speed: 0 };

  return {
    /** @param {number} t wall ms @param {number} x cm @param {number} y cm */
    add(t, x, y) {
      ts[head] = t; xs[head] = x; ys[head] = y;
      head = (head + 1) % RING;
      if (count < RING) count++;
    },
    /**
     * Velocity as of time `now`. Samples older than the window are ignored; with fewer than
     * two samples in the window the pointer is treated as still.
     * @param {number} now wall ms
     */
    read(now) {
      out.vx = 0; out.vy = 0; out.speed = 0;
      if (count < 2) return out;
      const newest = (head - 1 + RING) % RING;
      if (now - ts[newest] > windowMs) return out; // pointer has stopped
      let oldest = newest;
      for (let k = 1; k < count; k++) {
        const i = (newest - k + RING) % RING;
        if (ts[newest] - ts[i] > windowMs) break;
        oldest = i;
      }
      if (oldest === newest) {
        // only one sample inside the window: use the step from the one before it
        const prev = (newest - 1 + RING) % RING;
        const dt = ts[newest] - ts[prev];
        if (!(dt > 0) || dt > windowMs * 4) return out;
        oldest = prev;
      }
      const dt = (ts[newest] - ts[oldest]) / 1000;
      if (!(dt > 0)) return out;
      out.vx = (xs[newest] - xs[oldest]) / dt;
      out.vy = (ys[newest] - ys[oldest]) / dt;
      out.speed = Math.hypot(out.vx, out.vy);
      return out;
    },
    reset() { count = 0; head = 0; },
  };
}
