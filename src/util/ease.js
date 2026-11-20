// @ts-check
/**
 * Easing curves. Each takes progress x from 0 to 1 and returns the eased progress
 * (0 at the start, 1 at the end). "out" curves start fast and slow down; "in" curves start
 * slow; "inOut" do both. "Back" curves dip below 0 or overshoot past 1 a little, which gives
 * the anticipation and follow-through of world rule 1.
 *
 * Inputs outside 0–1 are clamped first.
 */

/** @typedef {(x: number) => number} Ease */

/** @param {number} x */
export const clamp01 = x => (x <= 0 ? 0 : x >= 1 ? 1 : x);
/** @param {number} a @param {number} b @param {number} t */
export const lerp = (a, b, t) => a + (b - a) * t;

const BACK = 1.70158;
const BACK_IO = BACK * 1.525;

/** @param {Ease} f @returns {Ease} */
const clamped = f => x => f(clamp01(x));

/** @type {Record<string, Ease>} */
export const ease = {
  linear: clamped(x => x),
  inQuad: clamped(x => x * x),
  outQuad: clamped(x => 1 - (1 - x) * (1 - x)),
  inOutQuad: clamped(x => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2)),
  inCubic: clamped(x => x ** 3),
  /** Stamp count-up (file 04, 800 ms ease-out cubic). */
  outCubic: clamped(x => 1 - (1 - x) ** 3),
  inOutCubic: clamped(x => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2)),
  inQuart: clamped(x => x ** 4),
  /** The original app's count animation, app.js line 100: 1 − (1 − x)^4 (DECISIONS point 23). */
  outQuart: clamped(x => 1 - (1 - x) ** 4),
  inOutQuart: clamped(x => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2)),
  outQuint: clamped(x => 1 - (1 - x) ** 5),
  inSine: clamped(x => 1 - Math.cos((x * Math.PI) / 2)),
  outSine: clamped(x => Math.sin((x * Math.PI) / 2)),
  inOutSine: clamped(x => -(Math.cos(Math.PI * x) - 1) / 2),
  outExpo: clamped(x => (x === 1 ? 1 : 1 - 2 ** (-10 * x))),
  inOutExpo: clamped(x => (x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2)),
  /** Pulls back a little before moving (anticipation). */
  inBack: clamped(x => (BACK + 1) * x ** 3 - BACK * x * x),
  /** Overshoots a little, then settles (follow-through). */
  outBack: clamped(x => 1 + (BACK + 1) * (x - 1) ** 3 + BACK * (x - 1) ** 2),
  inOutBack: clamped(x => (x < 0.5
    ? ((2 * x) ** 2 * ((BACK_IO + 1) * 2 * x - BACK_IO)) / 2
    : ((2 * x - 2) ** 2 * ((BACK_IO + 1) * (x * 2 - 2) + BACK_IO) + 2) / 2)),
  outElastic: clamped(x => (x === 0 ? 0 : x === 1 ? 1 : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1)),
  outBounce: clamped(bounce),
};

/** @param {number} x */
function bounce(x) {
  const n = 7.5625, d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
}

/** Curves that never leave 0–1 and never go backwards. */
export const MONOTONIC = ['linear', 'inQuad', 'outQuad', 'inOutQuad', 'inCubic', 'outCubic', 'inOutCubic', 'inQuart', 'outQuart', 'inOutQuart', 'outQuint', 'inSine', 'outSine', 'inOutSine', 'outExpo', 'inOutExpo'];

/**
 * Value at progress x between `from` and `to` along a named curve.
 * @param {keyof typeof ease | Ease} curve @param {number} from @param {number} to @param {number} x
 */
export function tween(curve, from, to, x) {
  const f = typeof curve === 'function' ? curve : ease[curve];
  if (!f) throw new RangeError('unknown ease ' + String(curve));
  return lerp(from, to, f(x));
}
