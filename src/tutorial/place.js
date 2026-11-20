// @ts-check
/**
 * WP-03 tour: where the paper slip goes. Beside the target, trying right, left, then above
 * (the spec's order), then below, then as a last resort inside the window over the target,
 * so it is never off-screen. Pure; unit-tested.
 */

/** @typedef {{left: number, top: number, right: number, bottom: number}} Box */
/** @typedef {'right'|'left'|'above'|'below'|'inside'} Side */

/** Clamp v into [lo, hi]; if the range is empty, lo wins. */
const clamp = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));

/**
 * @param {Box} target           the cut-out, in window pixels
 * @param {{w: number, h: number}} slip
 * @param {{w: number, h: number}} view   window size
 * @param {{gap: number, margin: number, arrowInset: number}} opts
 * @returns {{x: number, y: number, side: Side, arrow: number}}
 *   x, y = slip's top-left; arrow = distance along the slip's edge (from its top for left/right,
 *   from its left for above/below) where the arrow points at the target's centre.
 */
export function placeSlip(target, slip, view, opts) {
  const { gap, margin, arrowInset } = opts;
  // The part of the target that is on screen; the arrow aims at its centre.
  const vis = {
    left: clamp(target.left, 0, view.w), right: clamp(target.right, 0, view.w),
    top: clamp(target.top, 0, view.h), bottom: clamp(target.bottom, 0, view.h),
  };
  const cx = (vis.left + vis.right) / 2, cy = (vis.top + vis.bottom) / 2;
  const maxX = view.w - margin - slip.w, maxY = view.h - margin - slip.h;
  const alongY = (/** @type {number} */ y) => clamp(cy - y, arrowInset, slip.h - arrowInset);
  const alongX = (/** @type {number} */ x) => clamp(cx - x, arrowInset, slip.w - arrowInset);

  const fitsY = slip.h <= view.h - 2 * margin, fitsX = slip.w <= view.w - 2 * margin;
  if (fitsY) {
    const y = clamp(cy - slip.h / 2, margin, maxY);
    const right = target.right + gap;
    if (right >= margin && right <= maxX) return { x: right, y, side: 'right', arrow: alongY(y) };
    const left = target.left - gap - slip.w;
    if (left >= margin && left <= maxX) return { x: left, y, side: 'left', arrow: alongY(y) };
  }
  if (fitsX) {
    const x = clamp(cx - slip.w / 2, margin, maxX);
    const above = target.top - gap - slip.h;
    if (above >= margin && above <= maxY) return { x, y: above, side: 'above', arrow: alongX(x) };
    const below = target.bottom + gap;
    if (below >= margin && below <= maxY) return { x, y: below, side: 'below', arrow: alongX(x) };
  }
  // Nothing beside it fits: sit inside the window, bottom right, over the target.
  return { x: clamp(maxX, margin, maxX), y: clamp(maxY, margin, maxY), side: 'inside', arrow: 0 };
}

/**
 * Union of boxes (several elements can share one data-tour value, e.g. metrics plus table).
 * @param {Box[]} boxes
 * @returns {Box|null}
 */
export function unionBox(boxes) {
  if (!boxes.length) return null;
  return {
    left: Math.min(...boxes.map(b => b.left)), top: Math.min(...boxes.map(b => b.top)),
    right: Math.max(...boxes.map(b => b.right)), bottom: Math.max(...boxes.map(b => b.bottom)),
  };
}

/**
 * Fit a target into the free part of the window: below `topInset` (the sticky header, unless
 * the target is in it) and at most `maxShare` of the free height tall, cut off at the bottom.
 * @param {Box} box @param {{w: number, h: number}} view @param {number} topInset @param {number} maxShare
 * @returns {Box}
 */
export function fitTarget(box, view, topInset, maxShare) {
  const left = Math.max(box.left, 0), right = Math.min(box.right, view.w);
  // A target inside the sticky header (the Load button) is shown as it is.
  if (box.bottom <= topInset) return { left, right, top: Math.max(box.top, 0), bottom: box.bottom };
  const top = Math.min(Math.max(box.top, topInset), view.h);
  const free = Math.max(0, view.h - topInset);
  const bottom = Math.max(top, Math.min(box.bottom, view.h, top + free * maxShare));
  return { left, right, top, bottom };
}
