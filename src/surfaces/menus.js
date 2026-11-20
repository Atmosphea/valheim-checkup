// @ts-check
/**
 * WP-11 · parchment menus and the record-mode switch (spec "Menus, toasts, tooltips, messages").
 *
 * Menus: every native `<select>` on the printed sheets stays the source of truth for the keyboard
 * and screen readers. A mouse press on one opens a parchment list in #float instead of the
 * browser's own list: it unfolds in two folds (400 ms), hover darkens the ink, choosing draws a
 * quill tick, sets the native value and dispatches `input` and `change` (once, and only when the
 * value really changes, as the native list does). While it is open, ↑ ↓ Home End move, Enter or
 * Space chooses, Escape or Tab closes. Breeze and impacts make the open list flutter (DECISIONS 32).
 * Events: `menu:open`, `menu:select`, `menu:close` (sounds menu.open / menu.select / menu.close).
 *
 * Paul, WP-16 item 26: on the desk the list lies on the paper's own plane: it is a child of the
 * select's positioned box inside the printed sheet (so it rides the sheet's 3D transform, the
 * header slip's lift and the camera's every move), placed in that box's layout px. In flat mode
 * the page has no camera, so the list stays in #float.
 *
 * Record-mode switch: a printed two-position switch with a small brass lever drawn in SVG drives
 * `#recordMode`. The native select lies over the switch, transparent, so it keeps its label, focus
 * and keyboard; a mouse press flips it to the other position. `app:mode` plays toggle.brass.
 */
import { emit } from '../bus.js';
import { surfaces as MS } from '../config/motion.js';
import { Spring } from '../util/spring.js';
import { onImpact } from '../scene/impact.js';

const NS = 'http://www.w3.org/2000/svg';

/**
 * @param {object} o
 * @param {HTMLElement} o.host  #float
 * @param {HTMLElement} o.print #print
 * @param {(phase: string, fn: (dt: number, t: number) => void) => () => void} o.onPhase
 * @param {(x: number, y: number) => number} [o.air]  breeze speed under a client point
 */
export function attachMenus(o) {
  /** @type {null | {select: HTMLSelectElement, el: HTMLElement, items: HTMLElement[], at: number, flutter: Spring, closing: boolean, cx: number, cy: number}} */
  let open = null;

  /** @param {HTMLSelectElement} sel */
  function show(sel) {
    if (open) close(false);
    const r = sel.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'vc-menu vc-keep-alive vc-menu--fit';
    el.setAttribute('aria-hidden', 'true');
    const items = [...sel.options].map((opt, i) => {
      const it = document.createElement('div');
      it.className = 'vc-menu-item';
      it.dataset.index = String(i);
      it.textContent = opt.textContent;
      if (opt.disabled) it.classList.add('vc-menu-item--disabled');
      if (i === sel.selectedIndex) it.classList.add('vc-menu-item--current');
      const tick = document.createElementNS(NS, 'svg');
      tick.setAttribute('class', 'vc-menu-tick');
      tick.setAttribute('viewBox', '0 0 16 12');
      tick.innerHTML = '<path d="M1.5 6.8 C3.2 7.6 4.6 9 5.6 10.6 C8 6.2 10.8 3.2 14.6 1.2" pathLength="1"/>';
      it.prepend(tick);
      el.append(it);
      return it;
    });
    const sheet = sel.closest('.vc-sheet');
    const box = /** @type {HTMLElement|null} */ (sel.offsetParent);
    const onPaper = !!sheet && !!box && sheet.contains(box);
    el.style.setProperty('--vc-menu-ms', MS.menuUnfoldMs + 'ms');
    if (onPaper && box) {
      // on the paper: layout px of the select's own positioned box (Paul, WP-16 item 26)
      el.classList.add('vc-menu--paper');
      el.style.setProperty('--vc-menu-font', parseFloat(getComputedStyle(sel).fontSize).toFixed(2) + 'px');
      // Paul, WP-17 item 1: exactly the box's width (it used to run past its right edge)
      el.style.width = el.style.minWidth = el.style.maxWidth = sel.offsetWidth + 'px';
      el.style.left = sel.offsetLeft + 'px';
      el.style.top = (sel.offsetTop + sel.offsetHeight + 2) + 'px';
      box.append(el);
      // open upward if it would run off the window below
      const b = el.getBoundingClientRect();
      if (b.bottom > innerHeight - 8 && r.top - b.height > 8) { el.style.top = (sel.offsetTop - 2 - el.offsetHeight) + 'px'; el.classList.add('vc-menu--up'); }
    } else {
      // font size follows the printed select (its on-screen size)
      const scale = r.height / Math.max(1, sel.offsetHeight || r.height);
      el.style.setProperty('--vc-menu-font', (parseFloat(getComputedStyle(sel).fontSize) * scale).toFixed(2) + 'px');
      el.style.width = el.style.minWidth = el.style.maxWidth = r.width + 'px'; // Paul, WP-17 item 1
      el.style.left = r.left + 'px';
      el.style.top = (r.bottom + 2) + 'px';
      o.host.append(el);
      // keep it on screen: open upward if there is no room below
      const h = el.offsetHeight;
      if (r.bottom + 2 + h > innerHeight - 8) { el.style.top = Math.max(8, r.top - 2 - h) + 'px'; el.classList.add('vc-menu--up'); }
      const w = el.offsetWidth;
      if (r.left + w > innerWidth - 8) el.style.left = Math.max(8, innerWidth - 8 - w) + 'px';
    }
    el.classList.add('vc-menu--open');
    open = { select: sel, el, items, at: Math.max(0, sel.selectedIndex), flutter: new Spring({ ...MS.menuFlutterSpring, value: 0 }), closing: false, cx: 0, cy: 0 };
    { const b = el.getBoundingClientRect(); open.cx = b.left + b.width / 2; open.cy = b.top; } // once, not per frame
    mark(open.at);
    el.addEventListener('pointerdown', e => e.preventDefault()); // the select keeps focus
    el.addEventListener('click', e => {
      const it = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest('.vc-menu-item'));
      if (it && !it.classList.contains('vc-menu-item--disabled')) choose(+(it.dataset.index || 0));
    });
    // hover marks only on real movement: a list that opens under a resting pointer must not
    // steal the keyboard's place (Chrome sends pointerover when content appears under it)
    let lastXY = '';
    el.addEventListener('pointermove', e => {
      const xy = e.clientX + ',' + e.clientY;
      if (xy === lastXY) return;
      const first = lastXY === ''; lastXY = xy;
      if (first && e.movementX === 0 && e.movementY === 0) return;
      const it = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest('.vc-menu-item'));
      if (it && open) mark(+(it.dataset.index || 0));
    });
    sel.focus({ preventScroll: true });
    emit('menu:open', { id: sel.id || null, options: items.length });
  }

  /** @param {number} i */
  function mark(i) {
    if (!open) return;
    open.at = i;
    open.items.forEach((it, k) => it.classList.toggle('vc-menu-item--active', k === i));
  }

  /** @param {number} i */
  function choose(i) {
    if (!open || open.closing) return;
    const { select, items } = open;
    const opt = select.options[i];
    if (!opt || opt.disabled) return;
    open.closing = true;
    items[i].classList.add('vc-menu-item--chosen');
    const changed = select.selectedIndex !== i;
    if (changed) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    emit('menu:select', { id: select.id || null, index: i, changed });
    setTimeout(() => close(true), MS.menuTickMs);
  }

  /** @param {boolean} chosen */
  function close(chosen) {
    if (!open) return;
    const { el, select } = open;
    open = null;
    el.classList.remove('vc-menu--open');
    el.classList.add('vc-menu--closing');
    setTimeout(() => el.remove(), MS.menuCloseMs);
    emit('menu:close', { id: select.id || null, chosen });
  }

  // a mouse press on a printed select opens the parchment list instead of the browser's own
  document.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const sel = /** @type {HTMLSelectElement|null} */ (/** @type {Element} */ (e.target).closest?.('select'));
    if (!sel || !o.print.contains(sel) || sel.id === 'recordMode' || sel.disabled || sel.multiple) {
      if (open && !/** @type {Element} */ (e.target).closest?.('.vc-menu')) close(false);
      return;
    }
    e.preventDefault();
    if (open?.select === sel) { close(false); return; }
    show(sel);
  }, true);

  document.addEventListener('keydown', e => {
    if (!open) return;
    const n = open.items.length;
    let to = -1;
    if (e.key === 'ArrowDown') to = Math.min(n - 1, open.at + 1);
    else if (e.key === 'ArrowUp') to = Math.max(0, open.at - 1);
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = n - 1;
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); choose(open.at); return; }
    else if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); e.stopPropagation(); close(false); return; }
    else if (e.key === 'Tab') { close(false); return; }
    if (to >= 0) { e.preventDefault(); e.stopPropagation(); mark(to); }
  }, true);
  for (const t of ['resize', 'blur']) addEventListener(t, () => close(false));
  document.addEventListener('scroll', () => close(false), true);

  let side = 1;
  onImpact(felt => { side = -side; open?.flutter.impulse(side * felt * 40); }, () => ({ x: 20, y: 0 }));
  o.onPhase('physics', dt => {
    if (!open) return;
    const air = o.air ? o.air(open.cx, open.cy) : 0;
    open.flutter.target = Math.min(MS.menuFlutterMaxDeg, air * MS.menuFlutterDegPerSpeed);
    open.flutter.step(dt);
    open.el.style.setProperty('--vc-flutter', open.flutter.value.toFixed(3) + 'deg');
  });

  // ── The record-mode switch ──────────────────────────────────────────────────────────────
  const mode = /** @type {HTMLSelectElement|null} */ (document.getElementById('recordMode'));
  if (mode) {
    const label = /** @type {HTMLElement} */ (mode.closest('label'));
    label.classList.add('vc-rswitch-host');
    const sw = document.createElement('span');
    sw.className = 'vc-rswitch';
    sw.setAttribute('aria-hidden', 'true');
    const names = [...mode.options].map(op => op.textContent || '');
    sw.innerHTML = `<span class="vc-rswitch-side vc-rswitch-side--a"></span><svg class="vc-rswitch-plate" viewBox="0 0 64 26"><rect class="vc-rswitch-slot" x="10" y="10.5" width="44" height="5" rx="2.5"/><circle class="vc-rswitch-rivet" cx="5" cy="13" r="1.6"/><circle class="vc-rswitch-rivet" cx="59" cy="13" r="1.6"/><g class="vc-rswitch-lever"><rect x="-3.2" y="2" width="6.4" height="22" rx="3.2"/><circle cx="0" cy="13" r="4.4"/><circle class="vc-rswitch-shine" cx="-1.2" cy="11.6" r="1.4"/></g></svg><span class="vc-rswitch-side vc-rswitch-side--b"></span>`;
    /** @type {HTMLElement} */ (sw.querySelector('.vc-rswitch-side--a')).textContent = names[0] ?? '';
    /** @type {HTMLElement} */ (sw.querySelector('.vc-rswitch-side--b')).textContent = names[1] ?? '';
    label.insertBefore(sw, mode);
    sw.style.setProperty('--vc-toggle-ms', MS.toggleMs + 'ms');
    const sync = () => { sw.dataset.pos = String(mode.selectedIndex); };
    mode.addEventListener('change', sync);
    sync();
    mode.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      mode.focus({ preventScroll: true });
      mode.selectedIndex = mode.selectedIndex === 0 ? 1 : 0;
      mode.dispatchEvent(new Event('input', { bubbles: true }));
      mode.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // the app may change it too (an import restores nothing here, but keep in step on every render)
    new MutationObserver(sync).observe(mode, { attributes: true, childList: true });
  }

  return {
    isOpen: () => !!open,
    read: () => (open ? { id: open.select.id, items: open.items.map(i => i.textContent), at: open.at } : null),
    /** Test hook: open the list for a select as a mouse press would. @param {string} id */
    openFor(id) { const s = /** @type {HTMLSelectElement|null} */ (document.getElementById(id)); if (s) show(s); return !!open; },
    /** Test hook: click item i of the open list. @param {number} i */
    pick(i) { open?.items[i]?.click(); },
    close: () => close(false),
  };
}
