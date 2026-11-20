// @ts-check
/**
 * WP-18P: a counter that changes whenever the page's layout may have changed, so a module can
 * cache a layout read (an offset, a rect) instead of reading it every frame. A layout read right
 * after another module's style write forces the browser to restyle and relayout in the middle of
 * the frame; the profiler found ~10 of those per frame during a view change.
 *
 *   const pos = cached(el, () => measure(el));   // re-measured only after the epoch moved
 *
 * The epoch moves on: any scroll (capture), a resize, the fonts finishing, an app render or load,
 * a row-height burn, and any added/removed element or class change in the page (one
 * MutationObserver; inline style writes, which the effects make every frame, don't count: none
 * of them moves layout).
 */
import { on } from '../bus.js';

let epoch = 0;
/** The current layout epoch. */
export const layoutEpoch = () => epoch;
/** Mark every cached layout read stale. */
export function invalidateLayout() { epoch++; }

/** @type {WeakMap<object, {epoch: number, value: any}>} */
const store = new WeakMap();
/**
 * A layout read cached until the epoch moves.
 * @template T @param {object} key @param {() => T} read @returns {T}
 */
export function cached(key, read) {
  const c = store.get(key);
  if (c && c.epoch === epoch) return c.value;
  const value = read();
  store.set(key, { epoch, value });
  return value;
}

if (typeof addEventListener === 'function' && typeof document !== 'undefined') {
  addEventListener('scroll', invalidateLayout, { capture: true, passive: true });
  addEventListener('resize', invalidateLayout, { passive: true });
  document.fonts?.addEventListener?.('loadingdone', invalidateLayout);
  for (const type of ['app:render', 'app:load', 'app:category', 'rows:burn', 'rows:height']) on(type, invalidateLayout);
  // classList.add of a class already there still makes a record: only a real change counts
  const changed = (/** @type {MutationRecord[]} */ list) => {
    for (const m of list) if (m.type !== 'attributes' || m.oldValue !== /** @type {Element} */ (m.target).getAttribute(/** @type {string} */ (m.attributeName))) { invalidateLayout(); return; }
  };
  const watch = () => new MutationObserver(changed).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'hidden', 'open'] });
  if (document.body) watch(); else addEventListener('DOMContentLoaded', watch, { once: true });
}
