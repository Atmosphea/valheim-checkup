// @ts-check
/**
 * Toasts from new code ("Path copied."), shown in the original `#toast` exactly the way
 * app.js's notify() does it: same element, same `hidden` class, 10 seconds, `app:toast` event.
 * app.js keeps its own timer private, so an older app.js timer could hide our toast early; a
 * small observer puts it back if that happens. A newer app.js toast changes the text and wins.
 */
import { emit } from '../bus.js';

export const TOAST_MS = 10000;
/** @type {{text: string, until: number} | null} */
let mine = null;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let timer;
let watching = false;

/** @param {string} text */
export function toast(text) {
  const el = document.getElementById('toast');
  if (!el) return;
  emit('app:toast', { text });
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(timer);
  mine = { text, until: performance.now() + TOAST_MS };
  timer = setTimeout(() => { if (el.textContent === text) el.classList.add('hidden'); mine = null; }, TOAST_MS);
  if (!watching) {
    watching = true;
    new MutationObserver(() => {
      if (mine && el.textContent === mine.text && el.classList.contains('hidden') && performance.now() < mine.until - 50) el.classList.remove('hidden');
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  }
}
