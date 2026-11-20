// @ts-check
/**
 * Modal behaviour by hand (no `showModal()`), so the toast and, later, the desk layers stay
 * above and alive: the rest of the page becomes `inert` (it can't be clicked, focused or read
 * by a screen reader), Tab and Shift-Tab cycle inside, and `release()` undoes exactly what
 * `hold()` did. WP-03 uses it for the How-to popup and the tour; WP-11 is meant to reuse it
 * for Details and the help letter (its step 1 asks for the same recipe).
 */

/** Elements that must stay alive while something is modal: the toast and the root itself. */
const KEEP = ['#toast', '.vc-keep-alive'];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Every focusable, visible element inside `root`, in Tab order.
 * @param {HTMLElement} root
 * @returns {HTMLElement[]}
 */
export function focusables(root) {
  return /** @type {HTMLElement[]} */ ([...root.querySelectorAll(FOCUSABLE)])
    // tabindex="-1" is never a Tab stop (round 2, fix 2: the roving tabs leave only the
    // selected tab in the Tab order, as the ARIA tabs pattern asks).
    .filter(el => el.tabIndex >= 0 && !el.closest('[hidden]') && el.getClientRects().length > 0);
}

/**
 * WP-11: where modal layers live. Flat mode: <body>. Desk mode: `#float` (layer 5), so the
 * spark and the film grain stay visible above them (spec WP-11 Details step 1).
 * @type {() => HTMLElement}
 */
let host = () => document.body;
/** @param {() => HTMLElement} fn */
export function setModalHost(fn) { host = fn; }
/** The element modal layers are appended to. */
export const modalHost = () => host();

/**
 * Make everything outside `root` inert. Returns a function that undoes it.
 * WP-11: `root` may sit deeper than <body> (inside `#float` on the desk); every sibling of every
 * ancestor up to <body> is made inert, so only `root`, the toast and the ancestors stay alive.
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function hold(root) {
  /** @type {Element[]} */
  const made = [];
  for (let node = /** @type {HTMLElement|null} */ (root); node && node !== document.body && node.parentElement; node = node.parentElement) {
    for (const el of node.parentElement.children) {
      if (el === node || el.tagName === 'SCRIPT' || KEEP.some(sel => el.matches(sel))) continue;
      if (el instanceof HTMLElement && !el.inert) { el.inert = true; made.push(el); }
    }
  }
  document.body.classList.add('vc-modal-open');
  return () => {
    for (const el of made) /** @type {HTMLElement} */ (el).inert = false;
    if (!document.querySelector('.vc-modal-root:not([hidden])')) document.body.classList.remove('vc-modal-open');
  };
}

/**
 * Keep Tab inside `root`. Call from a keydown listener; returns true when it handled the key.
 * With nothing focusable inside, focus stays on `fallback`.
 * @param {KeyboardEvent} e @param {HTMLElement} root @param {HTMLElement} [fallback]
 */
export function trapTab(e, root, fallback) {
  if (e.key !== 'Tab') return false;
  const list = focusables(root);
  e.preventDefault();
  if (!list.length) { fallback?.focus(); return true; }
  const at = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
  const next = e.shiftKey ? (at <= 0 ? list.length - 1 : at - 1) : (at === -1 || at === list.length - 1 ? 0 : at + 1);
  list[next].focus();
  return true;
}
