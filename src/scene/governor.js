// @ts-check
/**
 * Quality governor (file 05 "Quality tiers"), pure logic so it can be unit-tested.
 *
 * 1. Benchmark: after a few warm-up frames, average the next `benchmarkFrames` frame times
 *    (rendered at High) and pick the start tier.
 * 2. Watch: keep a running window of frame times. When the window holds at least `dropAfterMs`
 *    of frames, their average is over `dropFrameMs` and (WP-18P) at least `dropLateShare` of them
 *    were late, drop exactly one tier and start a fresh window.
 *
 * Frame time = the time between two frames, in wall-clock ms (not scaled by __vc.timeScale).
 * The governor never drops below `low`; `flat` is only reached by `__vc.quality('flat')`.
 *
 * WP-18P (Paul: "perfect framerate on any computer"), adaptive on top of the tiers:
 *
 * 3. Trim: inside a tier, small steps that cost the least to look at (`trims`, config/render.js:
 *    the reflection cube refreshed less often, then the 3D layers' pixel ratio a little lower).
 *    Fed per frame with the frame's JavaScript time (and its GPU time where the browser has timer
 *    queries): a frame is "strained" when its JS time is near the frame budget or the frame was
 *    late (GPU strain is optional: off in config, the Mac's timer queries overstate). When a `trimWindowMs` window of active frames is mostly strained, one trim step is
 *    added: this acts before frames drop, where the tier drop above only acts after they did.
 * 4. Climb: a window of active frames with real headroom (`climb*`) takes one trim step back, and
 *    once no trim is left, one tier back up (only on measured GPU headroom: a browser without GPU
 *    timers, or a test's forced frame times, never climbs a tier). A step that has to be taken
 *    again soon after a climb doubles that step's wait before the next climb (no back-and-forth).
 *    Idle frames (the 3D layers render on demand) count for nothing either way.
 * `hold(true)` freezes all of it (pixel-diff and timing tools).
 */

/** Auto order, best first. @type {readonly ['high', 'medium', 'low']} */
export const AUTO_TIERS = ['high', 'medium', 'low'];

/**
 * @typedef {object} GovernorOptions
 * @property {number} benchmarkFrames
 * @property {number} warmupFrames
 * @property {number} highMs      benchmark average at or under this → high
 * @property {number} mediumMs    … at or under this → medium, else low
 * @property {number} dropFrameMs
 * @property {number} dropAfterMs
 * @property {(tier: string, why: 'benchmark'|'drop'|'climb') => void} onTier
 * @property {number} [budgetMs]        WP-18P: the frame budget (16.7 ms)
 * @property {number} [dropLateShare]   WP-18P: a tier drops only when this share of the window's frames was late
 * @property {number} [trimSteps]       number of trim steps available (0 = no trimming)
 * @property {number} [trimWindowMs]    strain window for a trim step
 * @property {number} [strainShare]     share of strained frames in that window that adds a step
 * @property {number} [cpuStrain]       JS ms over this share of the budget = strained
 * @property {number|null} [gpuStrain]  GPU ms over this share of the budget = strained (null: GPU time never strains)
 * @property {number} [lateShare]       an interval over budget × this = a late frame
 * @property {number} [climbWindowMs]   headroom window for one step back
 * @property {number} [climbCpu]        … JS ms under this share of the budget in 90 % of frames
 * @property {number} [climbGpu]        … GPU ms under this share of the budget in 90 % of frames
 * @property {number} [climbBackoffMs]  first wait after a climb that had to be undone (doubles, up to 8×)
 * @property {(trim: number, why: 'strain'|'climb'|'reset') => void} [onTrim]
 */

/**
 * @typedef {object} FrameLoad  WP-18P: what one frame cost besides its interval
 * @property {number} [cpu]     JavaScript ms in the frame (the clock's work time)
 * @property {number|null} [gpu] GPU ms (null/undefined = not measured)
 * @property {boolean} [active] false = the 3D layers were idle this frame
 */

/** @param {GovernorOptions} o */
export function createGovernor(o) {
  let phase = /** @type {'warmup'|'benchmark'|'watch'|'off'} */ ('warmup');
  let seen = 0;
  let benchSum = 0;
  let benchCount = 0;
  let winSum = 0;
  let winCount = 0;
  let winLate = 0;
  /** @type {string} */
  let tier = 'high';
  /** Last benchmark result, for reports. */
  let benchmarkMs = NaN;
  let drops = 0;
  /** WP-18P: index in AUTO_TIERS the governor climbs back to at most (0 = High). */
  let ceiling = 0;
  // WP-18P: trims and climbing
  const B = o.budgetMs ?? 1000 / 60;
  const trimSteps = o.trimSteps ?? 0;
  let trim = 0, climbs = 0, held = false;
  // strain window and headroom window (counters only: nothing allocated per frame)
  let sWin = 0, sN = 0, sBad = 0;
  let cWin = 0, cN = 0, cLate = 0, cCpuHi = 0, cGpuHi = 0, cGpuN = 0;
  /** step key ('t1', 'high'…) → { wait: ms before climbing to it again, lastClimb: wall-ish ms } */
  const backoff = new Map();
  let since = 0; // ms of frames fed (for the backoff clock)
  const resetLoad = () => { sWin = 0; sN = 0; sBad = 0; cWin = 0; cN = 0; cLate = 0; cCpuHi = 0; cGpuHi = 0; cGpuN = 0; };
  const resetWindow = () => { winSum = 0; winCount = 0; winLate = 0; resetLoad(); };
  /** A step was taken down: if it undoes a recent climb, that climb waits longer next time. @param {string} key */
  const steppedDown = key => {
    const b = backoff.get(key);
    const base = o.climbBackoffMs ?? 15000;
    if (!b) { backoff.set(key, { wait: 0, lastClimb: -Infinity, downAt: since }); return; }
    // undone soon after it was climbed: wait longer before the next climb (15 s, 30 s … 2 min)
    if (since - b.lastClimb < (o.climbWindowMs ?? 5000) * 2) b.wait = Math.min(Math.max(base, b.wait * 2), base * 8);
    b.downAt = since;
  };
  const mayClimbTo = (/** @type {string} */ key) => { const b = backoff.get(key); return !b || since - b.downAt >= b.wait; };
  const climbed = (/** @type {string} */ key) => { const b = backoff.get(key); if (b) b.lastClimb = since; };
  /** @param {number} next @param {'strain'|'climb'|'reset'} why */
  const setTrim = (next, why) => { if (next === trim) return; trim = next; o.onTrim?.(trim, why); };

  return {
    /**
     * Feed one frame time (ms). Returns the new tier when it changed, else null.
     * @param {number} ms @param {FrameLoad} [load] WP-18P
     */
    sample(ms, load) {
      if (!(ms >= 0) || !Number.isFinite(ms)) return null;
      if (phase === 'off' || held) return null;
      if (phase === 'warmup') {
        if (++seen >= o.warmupFrames) phase = 'benchmark';
        return null;
      }
      if (phase === 'benchmark') {
        benchSum += ms; benchCount++;
        if (benchCount < o.benchmarkFrames) return null;
        benchmarkMs = benchSum / benchCount;
        phase = 'watch';
        resetWindow();
        const pick = benchmarkMs <= o.highMs ? 'high' : benchmarkMs <= o.mediumMs ? 'medium' : 'low';
        tier = pick;
        o.onTier(pick, 'benchmark');
        return pick;
      }
      // watch
      since += ms;
      if (load) {
        const r = this.load(ms, load);
        if (r) return r;
      }
      winSum += ms; winCount++;
      if (ms > B * (o.lateShare ?? 1.12)) winLate++;
      if (winSum < o.dropAfterMs) return null;
      const avg = winSum / winCount, lateShare = winLate / winCount;
      winSum = 0; winCount = 0; winLate = 0;
      if (avg <= o.dropFrameMs) return null;
      // WP-18P: and most frames late, not a burst: a view change's few long frames (Master Hunter:
      // 16 of 134) pushed the 2 s average over 20 ms and dropped this Mac from High to Low for good
      if (lateShare < (o.dropLateShare ?? 0)) return null;
      const i = AUTO_TIERS.indexOf(/** @type {any} */ (tier));
      if (i < 0 || i >= AUTO_TIERS.length - 1) return null; // already at low (or flat): nowhere to drop
      steppedDown(tier);
      tier = AUTO_TIERS[i + 1];
      drops++;
      resetLoad();
      setTrim(0, 'reset'); // a new tier starts untrimmed
      o.onTier(tier, 'drop');
      return tier;
    },
    /**
     * WP-18P: trims and climbing, from one frame's load. Returns a new tier on a climb, else null.
     * @param {number} ms @param {FrameLoad} load
     */
    load(ms, load) {
      if (load.active === false || !(trimSteps > 0 || o.climbWindowMs)) return null;
      const cpu = load.cpu ?? 0, gpu = load.gpu;
      const hasGpu = typeof gpu === 'number' && Number.isFinite(gpu);
      const late = ms > B * (o.lateShare ?? 1.12);
      const strained = late || cpu > B * (o.cpuStrain ?? 0.6) || (hasGpu && typeof o.gpuStrain === 'number' && /** @type {number} */ (gpu) > B * o.gpuStrain);
      // strain → one more trim step
      sWin += ms; sN++; if (strained) sBad++;
      if (sWin >= (o.trimWindowMs ?? 750)) {
        const share = sBad / sN;
        sWin = 0; sN = 0; sBad = 0;
        if (share >= (o.strainShare ?? 0.4) && trim < trimSteps) {
          steppedDown('t' + (trim + 1));
          setTrim(trim + 1, 'strain');
          cWin = 0; cN = 0; cLate = 0; cCpuHi = 0; cGpuHi = 0; cGpuN = 0;
          return null;
        }
      }
      // headroom → one step back
      if (!o.climbWindowMs) return null;
      cWin += ms; cN++;
      if (late) cLate++;
      if (cpu > B * (o.climbCpu ?? 0.45)) cCpuHi++;
      if (hasGpu) { cGpuN++; if (/** @type {number} */ (gpu) > B * (o.climbGpu ?? 0.5)) cGpuHi++; }
      if (cWin < o.climbWindowMs) return null;
      const roomy = cLate / cN <= 0.02 && cCpuHi / cN <= 0.1;
      const gpuRoomy = cGpuN >= cN * 0.5 && cGpuHi / cGpuN <= 0.1;
      cWin = 0; cN = 0; cLate = 0; cCpuHi = 0; cGpuHi = 0; cGpuN = 0;
      if (!roomy) return null;
      if (trim > 0) {
        // a trim comes back on JS headroom alone when the GPU isn't measured (it was strain or lateness that set it)
        if (cGpuN && !gpuRoomy) return null;
        const key = 't' + trim;
        if (!mayClimbTo(key)) return null;
        climbed(key); climbs++;
        setTrim(trim - 1, 'climb');
        return null;
      }
      const i = AUTO_TIERS.indexOf(/** @type {any} */ (tier));
      if (i <= 0 || !gpuRoomy || i <= ceiling) return null;
      const up = AUTO_TIERS[i - 1];
      if (!mayClimbTo(up)) return null;
      climbed(up); climbs++;
      tier = up;
      winSum = 0; winCount = 0; winLate = 0;
      o.onTier(tier, 'climb');
      return tier;
    },
    /** Someone else set the tier (`__vc.quality()`): skip any pending benchmark and start a fresh window. @param {string} next */
    setTier(next, { manual = true } = {}) {
      tier = next;
      if (phase === 'warmup' || phase === 'benchmark') phase = 'watch';
      // WP-18P: a tier chosen by hand is the highest the governor climbs back to
      if (manual) ceiling = Math.max(0, AUTO_TIERS.indexOf(/** @type {any} */ (next)));
      resetWindow();
      setTrim(0, 'reset');
    },
    /** WP-18P: freeze (true) or release the governor; a held governor changes nothing. @param {boolean} on */
    hold(on) { held = !!on; resetWindow(); },
    get trim() { return trim; },
    get climbs() { return climbs; },
    get held() { return held; },
    /** Forget the running window (tab hidden, resize). The benchmark keeps its frames. */
    resetWindow,
    stop() { phase = 'off'; },
    get tier() { return tier; },
    get phase() { return phase; },
    get benchmarkMs() { return benchmarkMs; },
    get drops() { return drops; },
    get windowMs() { return winSum; },
  };
}
