// @ts-check
/**
 * WP-03 How-to control and the "Find your Valheim character" popup.
 *
 * - The control is a real button, inserted directly left of `#loadTop`. In desk mode the same
 *   button is the invisible proxy of the How-to coin (WP-06 places it over the coin); it carries
 *   `data-tour-anchor`, so the tour knows where to send focus back.
 * - Flat keeps the original header order with How to inserted directly left of Load:
 *   [Import][Export][How to][Load] (DECISIONS "WP-03 open 1"; point 27's coin order is desk only, WP-06).
 * - The popup is modal by hand (src/tutorial/modal.js), not `showModal()`, so the "Path copied."
 *   toast stays visible and announced above it, and WP-11 can unfold it in `#float`.
 * - Nothing here touches app.js. The Steam Cloud sentence and link are copied out of the help
 *   text at runtime, so they stay word for word.
 */
import { STRINGS, SAVE_PATHS } from '../strings.js';
import { browserPlatform } from './platform.js';
import { hold, trapTab, focusables, modalHost } from './modal.js';
import { emit } from '../bus.js';
import { toast } from './toast.js';
import { startTour } from './tour.js';
import { vc } from '../debug.js';
import './tutorial.css';

const $ = (/** @type {string} */ id) => document.getElementById(id);

/** Open-book line glyph (WP-06 gives the coin the same emblem). */
const BOOK_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M12 6.5C10 5 7 4.6 3.5 5v13c3.5-.4 6.5 0 8.5 1.5 2-1.5 5-1.9 8.5-1.5V5C17 4.6 14 5 12 6.5Zm0 0v13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

/** @returns {HTMLButtonElement} the How-to control (created once) */
function makeControl() {
  const existing = /** @type {HTMLButtonElement|null} */ ($('howTo'));
  if (existing) return existing;
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'howTo';
  b.className = 'vc-howto-button';
  b.setAttribute('aria-label', STRINGS.howToName);
  b.setAttribute('aria-haspopup', 'dialog');
  b.setAttribute('data-tour-anchor', '');
  b.innerHTML = BOOK_SVG;
  b.append(document.createTextNode(STRINGS.howTo));
  const load = $('loadTop');
  if (load?.parentElement) {
    load.parentElement.insertBefore(b, load);
  } else {
    document.body.prepend(b);
  }
  return b;
}

/** The Steam Cloud sentence and link from the help text (P34 stays where it is; this is a copy). */
function steamSentence() {
  const p = document.createElement('p');
  p.className = 'vc-howto-steam';
  const link = document.querySelector('details.help a[href*="remotestorageapp"]');
  const before = link?.previousSibling;
  if (link && before && before.nodeType === Node.TEXT_NODE) {
    p.append(document.createTextNode((before.textContent || '').replace(/^.*?(Steam Cloud)/s, '$1')), link.cloneNode(true), document.createTextNode('.'));
  }
  return p;
}

/** @type {{layer: HTMLElement, panel: HTMLElement, tabs: HTMLButtonElement[], panels: HTMLElement[]} | null} */
let ui = null;
/** @type {(() => void) | null} */
let release = null;
/** @type {HTMLButtonElement} */
let control;

function build() {
  if (ui) return ui;
  const layer = document.createElement('div');
  layer.className = 'vc-howto-layer vc-modal-root';
  layer.id = 'howToPopup';
  layer.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'vc-howto vc-paper-slip';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'howToTitle');
  layer.append(panel);

  const h = document.createElement('h2');
  h.id = 'howToTitle';
  h.textContent = STRINGS.howToTitle;
  panel.append(h);

  const list = document.createElement('div');
  list.className = 'vc-tabs';
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-label', STRINGS.platformTabs);
  panel.append(list);

  /** @type {HTMLButtonElement[]} */ const tabs = [];
  /** @type {HTMLElement[]} */ const panels = [];
  for (const group of SAVE_PATHS) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.id = `howToTab-${group.id}`;
    tab.className = 'vc-tab';
    tab.dataset.platform = group.id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `howToPanel-${group.id}`);
    tab.textContent = group.tab;
    list.append(tab);
    tabs.push(tab);

    const tp = document.createElement('div');
    tp.id = `howToPanel-${group.id}`;
    tp.className = 'vc-tabpanel';
    tp.dataset.platform = group.id;
    tp.setAttribute('role', 'tabpanel');
    tp.setAttribute('aria-labelledby', tab.id);
    for (const row of group.rows) {
      const r = document.createElement('div');
      r.className = 'vc-path-row';
      const rh = document.createElement('h3');
      rh.textContent = row.label;
      const box = document.createElement('div');
      box.className = 'vc-path';
      const code = document.createElement('code');
      code.textContent = row.path;
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'vc-copy';
      copy.dataset.path = row.path;
      copy.append(document.createTextNode(STRINGS.copy));
      const more = document.createElement('span');
      more.className = 'vc-sr-only'; // not .visually-hidden: P39 expects exactly one of those
      more.textContent = STRINGS.copyFor.replace('{label}', row.label);
      copy.append(more);
      copy.addEventListener('click', () => copyPath(row.path, code, copy));
      box.append(code, copy);
      const how = document.createElement('p');
      how.className = 'vc-path-how';
      how.textContent = row.how;
      r.append(rh, box, how);
      tp.append(r);
    }
    panel.append(tp);
    panels.push(tp);
  }

  const choose = document.createElement('p');
  choose.className = 'vc-howto-choose';
  choose.textContent = STRINGS.howToChoose;
  panel.append(choose, steamSentence());

  const foot = document.createElement('div');
  foot.className = 'vc-howto-foot';
  const tourBtn = document.createElement('button');
  tourBtn.type = 'button';
  tourBtn.id = 'showMeAround';
  tourBtn.className = 'primary';
  tourBtn.textContent = STRINGS.showMeAround;
  tourBtn.addEventListener('click', () => { close({ focus: false }); startTour(); });
  const x = document.createElement('button');
  x.type = 'button';
  x.id = 'closeHowTo';
  x.className = 'vc-howto-close';
  x.setAttribute('aria-label', STRINGS.howToClose);
  x.textContent = '×';
  x.addEventListener('click', () => close());
  foot.append(tourBtn, x);
  panel.append(foot);

  // Tabs: click, or arrows / Home / End on the tab list (selection follows focus).
  list.addEventListener('click', e => {
    const t = /** @type {HTMLElement} */ (e.target).closest('[role="tab"]');
    if (t instanceof HTMLButtonElement) select(t.dataset.platform || 'windows');
  });
  list.addEventListener('keydown', e => {
    const at = tabs.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    if (at < 0) return;
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const t = tabs[(to + tabs.length) % tabs.length];
    select(t.dataset.platform || 'windows');
    t.focus();
  });

  // Escape closes; Tab stays inside.
  layer.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    trapTab(e, panel);
  });
  // A click outside the paper closes (press and release both outside, so a drag that ends
  // outside doesn't).
  let downOutside = false;
  layer.addEventListener('pointerdown', e => { downOutside = e.target === layer; });
  layer.addEventListener('click', e => { if (downOutside && e.target === layer) close(); downOutside = false; });

  modalHost().append(layer);
  ui = { layer, panel, tabs, panels };
  return ui;
}

/** @param {string} id  'windows' | 'mac' | 'linux' */
function select(id) {
  const u = build();
  for (const t of u.tabs) {
    const on = t.dataset.platform === id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  }
  for (const p of u.panels) p.hidden = p.dataset.platform !== id;
}

/**
 * Copy one path exactly. The Clipboard API first; if the browser refuses (older browsers, some
 * file:// pages), a hidden text area and execCommand; if that fails too, select the path so
 * the user can press Ctrl-C.
 * @param {string} text @param {HTMLElement} code @param {HTMLButtonElement} button
 */
async function copyPath(text, code, button) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch { /* try the old way */ }
  if (!ok) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.tabIndex = -1;
    ta.className = 'vc-copy-buffer';
    button.after(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    button.focus();
  }
  if (ok) { toast(STRINGS.pathCopied); return; }
  const range = document.createRange();
  range.selectNodeContents(code);
  const sel = getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  toast(STRINGS.copyFailed);
}

/** Is the popup open? */
export const isOpen = () => !!ui && !ui.layer.hidden;

/**
 * WP-11: desk mode unfolds the popup's paper with the Details engine. `open(panel, control)` runs
 * after the layer is shown; `close(panel, control)` runs after it is hidden.
 * @typedef {{ open?: (panel: HTMLElement, from: HTMLElement|null) => void, close?: (panel: HTMLElement, to: HTMLElement|null, rect: DOMRect) => void }} PopupRenderer
 */
/** @type {PopupRenderer|null} */
let popupRenderer = null;
/** @param {PopupRenderer|null} r */
export function setPopupRenderer(r) { popupRenderer = r; }
/** The popup's layer and paper (WP-11 moves the layer into #float on the desk). */
export const popupParts = () => { const u = build(); return { layer: u.layer, panel: u.panel }; };

/** Open the popup with the visitor's platform preselected. */
export function open() {
  const u = build();
  if (isOpen()) return;
  select(browserPlatform());
  u.layer.hidden = false;
  release = hold(u.layer);
  const selected = u.tabs.find(t => t.getAttribute('aria-selected') === 'true');
  (selected || focusables(u.panel)[0])?.focus();
  emit('howto:open', {});
  popupRenderer?.open?.(u.panel, control);
}

/**
 * Close the popup; focus goes back to the How-to control unless the tour takes over.
 * @param {{focus?: boolean}} [opts]
 */
export function close(opts = {}) {
  if (!ui || ui.layer.hidden) return;
  const rect = ui.panel.getBoundingClientRect();
  ui.layer.hidden = true;
  release?.();
  release = null;
  if (opts.focus !== false) control?.focus();
  emit('howto:close', {});
  popupRenderer?.close?.(ui.panel, control, rect);
}

control = makeControl();
control.addEventListener('click', () => open());
build();

/** Test hook (additive, like `__vc.icons`). */
/** @type {any} */ (vc).howTo = { open, close, isOpen, select };
