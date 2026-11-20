// @ts-check
/**
 * WP-13 · flat mode: the original page layout in the desk's parchment and ink.
 *
 * Runs only when the page loaded in flat mode (no WebGL2, reduced motion, touch-first or small
 * screens, or `?mode=flat`). Nothing here loads three.js. What it adds to the original page:
 *
 *   paper      a 2D-canvas parchment tile (paper.js) behind everything; `vc-paper` on <body>
 *              turns on the icons' multiply blend (DECISIONS WP-02 open 2)
 *   #float     the same floating layer the desk has (WP-11), without the scene: Details and the
 *              How-to popup unfold in CSS 3D, parchment menus, paper toast and tooltips, the
 *              tour and the popup live here (modal host)
 *   coins      How to, Load, Import, Export and a new Sound button drawn as flat coins; they hop
 *              on hover (fine pointers) and press on tap; `coin:hop` / `coin:press` / `coin:mute`
 *   sidebar    brass inlays and the steel knob mark are CSS (styles/flat.css)
 *   drop       the whole page takes a dropped .fch, the tour's capture layer included
 *              (DECISIONS point 10); it is forwarded to the original Load button
 *   touch      a long press on a row sends the original `contextmenu` handler (P29); a tap on a
 *              select opens the parchment list; no hover-only reactions
 *   help       "Use the 3D desk anyway", only where the desk can run (mode.js canRunDesk); the
 *              choice is saved and the page reloads, so the mode never changes mid-session
 *
 * The ink wash, stamps, dots and count-ups (WP-10), the tutorial (WP-03) and the sounds (WP-12)
 * already run in both modes.
 */
import { toBlobUrl } from '../util/image-url.js';
import '../styles/flat.css';
import '../surfaces/surfaces.css';
import '../fonts.css';
import { runMode, loadEnv, canRunDesk, FORCE_DESK_KEY } from '../mode.js';
import { emit, on } from '../bus.js';
import { vc, markUsable } from '../debug.js';
import { clock } from '../util/clock.js';
import { rng as rootRng } from '../util/rng.js';
import { STRINGS } from '../strings.js';
import { flat as CF, ink as INK } from '../config/render.js';
import { setModalHost } from '../tutorial/modal.js';
import { setPopupRenderer, popupParts } from '../tutorial/howto.js';
import { createUnfold } from '../surfaces/unfold.js';
import { attachDetails } from '../surfaces/details.js';
import { attachMenus } from '../surfaces/menus.js';
import { attachHelp } from '../surfaces/help.js';
import { attachColumns } from '../surfaces/columns.js';
import { attachSlips } from '../surfaces/slips.js';
import { makePaperUrl } from './paper.js';

const $ = (/** @type {string} */ id) => document.getElementById(id);
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const finePointer = () => { try { return matchMedia('(hover: hover) and (pointer: fine)').matches; } catch { return false; } };

if (runMode === 'flat' && !new URLSearchParams(location.search).has('soundboard')) start();
// On a desk reached through the help switch, the same switch (ticked) is the way back to flat.
else if (runMode === 'desk' && loadEnv.forceDesk && loadEnv.reducedMotion) attachHelpSwitch();

function start() {
  const body = document.body;
  body.classList.add('vc-paper');
  body.classList.toggle('vc-reduced', reducedMotion());

  // rough ink edges on headings and stamps: the desk's filter (file 05), defined here for flat
  if (!document.getElementById('vc-ink-rough')) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.innerHTML = `<filter id="vc-ink-rough" x="-2%" y="-5%" width="104%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="${INK.roughTurbulence}" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${INK.roughDisplacement}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
    body.append(svg);
  }

  // ── Paper ─────────────────────────────────────────────────────────────────────────────
  const seed = ((/** @type {any} */ (rootRng).initialSeed ?? 1) ^ 0xf1a7) >>> 0;
  const paper = { ready: false, url: '' };
  makePaperUrl(seed).then(url => {
    if (!url) return;
    paper.ready = true; paper.url = url;
    const css = `url(${toBlobUrl(url)})`; // WP-14: short var values (src/util/image-url.js)
    body.style.setProperty('--vc-flat-paper', css);
    body.style.setProperty('--vc-paper', css);
    body.style.setProperty('--vc-paper-src', css);
  });

  // ── Frame phases (the desk stage has these; here one rAF loop on the central clock) ────
  /** @type {Set<(dt: number, t: number) => void>} */
  const phys = new Set();
  const onPhase = (/** @type {string} */ _phase, /** @type {(dt: number, t: number) => void} */ fn) => { phys.add(fn); return () => phys.delete(fn); };
  clock.onFrame((dt, t) => { for (const fn of phys) fn(dt, t); });
  clock.start();

  // ── #float: the floating layer ────────────────────────────────────────────────────────
  const float = document.createElement('div');
  float.id = 'float';
  float.className = 'vc-float vc-flat-float';
  body.append(float);
  setModalHost(() => float);
  // the How-to popup was built into <body> before this ran (WP-03 builds it lazily; move it if so)

  const unfold = createUnfold({ host: float, pxPerCm: () => CF.pxPerCm });
  onPhase('physics', dt => unfold.update(dt));

  const pp = popupParts();
  float.append(pp.layer);
  setPopupRenderer({
    open(panel, from) {
      if (reducedMotion()) { emit('details:float', { surface: 'howto', reduced: true }); return; }
      const r = from?.getBoundingClientRect();
      unfold.open({ sheet: panel, origin: r && r.width > 0 ? r : null, onFold: i => emit('details:fold', { i, surface: 'howto' }), onFloat: () => emit('details:float', { surface: 'howto' }), float: false });
    },
    close(panel, to, rect) {
      panel.classList.remove('vc-unfolding', 'vc-inkin');
      if (reducedMotion()) return;
      const r = to?.getBoundingClientRect();
      unfold.close({ rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height }, to: r && r.width > 0 ? r : null });
    },
  });

  const details = attachDetails({ host: float, unfold: reducedUnfold(unfold) });
  const menus = attachMenus({ host: float, print: /** @type {HTMLElement} */ (document.querySelector('.layout')), onPhase });
  const slips = attachSlips({ host: float, project: () => ({ x: innerWidth - 16, y: innerHeight - 16 }), onPhase });

  const coins = attachCoins();
  attachDrop(float);
  const touch = attachTouch(menus);
  const help = attachHelpSwitch();
  // Paul, WP-16 items 22 + 24: the help note lies in the header under the coins and opens as the
  // desk's letter does, piece by piece (help.js); in the tab order it now follows the coins
  const helpEl = document.querySelector('details.help'), headerEl = document.querySelector('header.top');
  if (helpEl && headerEl) headerEl.append(helpEl);
  const letter = attachHelp({ host: float, unfold: reducedUnfold(unfold) });
  const columns = attachColumns(); // Paul, WP-16 item 28
  attachStickyHeader();

  /** @type {any} */ (vc).flat = {
    paper: () => ({ ...paper, url: paper.url ? paper.url.slice(0, 32) + '…' : '' }),
    details, menus, slips, unfold, coins, touch, help, letter, columns,
    read: () => ({ paper: paper.ready, reduced: body.classList.contains('vc-reduced'), float: float.isConnected, details: details.read(), menu: menus.read(), toast: slips.toast.read() }),
  };
  // WP-14 budget "flat content usable after load": the app has rendered and every flat control is wired
  markUsable();
}

/**
 * Reduced motion (step 7): unfolds become a 150 ms fade and scale (CSS on `.vc-fade-in`); the
 * engine is skipped but every event the sounds listen for still fires once.
 * @param {ReturnType<typeof createUnfold>} u
 */
function reducedUnfold(u) {
  return {
    ...u,
    /** @param {Parameters<typeof u.open>[0]} p */
    open(p) {
      if (!reducedMotion()) return u.open(p);
      p.sheet.classList.remove('vc-fade-in'); void p.sheet.offsetWidth; p.sheet.classList.add('vc-fade-in');
      p.onFloat?.(); p.onDone?.();
      return 0;
    },
    /** @param {Parameters<typeof u.close>[0]} p */
    close(p) { if (!reducedMotion()) return u.close(p); p.onDone?.(); return 0; },
  };
}

// ── Coins (step 3) ──────────────────────────────────────────────────────────────────────
function attachCoins() {
  const actions = /** @type {HTMLElement|null} */ (document.querySelector('header.top .top-actions'));
  if (!actions) return null;
  // Sound: the desk's Sound coin as a toggle button, last in the header (aria-pressed = sound on)
  const sound = document.createElement('button');
  sound.type = 'button';
  sound.id = 'vcSound';
  sound.className = 'vc-flat-sound';
  sound.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path d="M12 3c-3.3 0-5.5 2.6-5.5 6v4.2L4.6 16.4h14.8l-1.9-3.2V9c0-3.4-2.2-6-5.5-6Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 18.6a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.7"/><path class="vc-mute-slash" d="M4 4l16 16" stroke="currentColor" stroke-width="1.9"/></svg><span>' + STRINGS.soundCoin + '</span>';
  const sync = () => sound.setAttribute('aria-pressed', String(!(/** @type {any} */ (vc).sound?.muted?.())));
  sync();
  sound.addEventListener('click', () => {
    const muted = !!(/** @type {any} */ (vc).sound?.muted?.());
    emit('coin:mute', { coin: 'sound', muted: !muted });
    // wiring.js mutes 120 ms after the click sound; the pressed state follows at once
    sound.setAttribute('aria-pressed', String(muted));
    setTimeout(sync, 200);
  });
  actions.append(sound);

  const ids = { howTo: 'howto', loadTop: 'load', importProgress: 'import', exportProgress: 'export', vcSound: 'sound' };
  for (const [id, coin] of Object.entries(ids)) {
    const el = $(id);
    if (!el) continue;
    el.classList.add('vc-coin');
    el.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse' || !finePointer() || /** @type {HTMLButtonElement} */ (el).disabled) return;
      el.classList.remove('vc-hop'); void el.offsetWidth; el.classList.add('vc-hop');
      emit('coin:hop', { coin });
    });
    el.addEventListener('animationend', () => el.classList.remove('vc-hop'));
    el.addEventListener('pointerdown', () => { if (!/** @type {HTMLButtonElement} */ (el).disabled) emit('coin:press', { coin }); });
  }
  // a successful drop flips the Load coin (as on the desk)
  on('app:load', d => {
    const load = $('loadTop');
    if (!load) return;
    const cls = d?.ok ? 'vc-coin-ok' : 'vc-coin-fail';
    load.classList.remove('vc-coin-ok', 'vc-coin-fail'); void load.offsetWidth; load.classList.add(cls);
    setTimeout(() => load.classList.remove(cls), 700);
  });
  return { sound, read: () => ({ sound: sound.getAttribute('aria-pressed') }) };
}

// ── Whole-page drop (DECISIONS point 10, including the tour's capture layer) ─────────────
/** @param {HTMLElement} float */
function attachDrop(float) {
  let depth = 0;
  const hasFiles = (/** @type {DragEvent} */ e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  const set = (/** @type {boolean} */ onOff) => document.body.classList.toggle('vc-file-drag', onOff);
  addEventListener('dragenter', e => { if (hasFiles(e) && depth++ === 0) { set(true); emit('drag:file-enter', {}); } }, true);
  addEventListener('dragleave', e => { if (hasFiles(e) && --depth <= 0) { depth = 0; set(false); emit('drag:file-leave', {}); } }, true);
  addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  const forwarded = new WeakSet();
  addEventListener('drop', e => {
    if (!hasFiles(e) || forwarded.has(e)) return;
    depth = 0; set(false);
    emit('drop:file', { x: e.clientX, y: e.clientY });
  }, true);
  // drops the app's own targets didn't take (they stop propagation): forward to the Load button
  addEventListener('drop', e => {
    if (!hasFiles(e) || e.defaultPrevented || !e.dataTransfer?.files.length) return;
    e.preventDefault();
    const load = $('loadTop');
    if (!load) return;
    const fwd = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: e.dataTransfer, clientX: e.clientX, clientY: e.clientY });
    forwarded.add(fwd);
    load.dispatchEvent(fwd);
  });
  void float;
}

// ── Touch (step 6) ──────────────────────────────────────────────────────────────────────
/** @param {ReturnType<typeof attachMenus>} menus */
function attachTouch(menus) {
  const items = $('items');
  let longPresses = 0;
  if (items) {
    /** @type {{x: number, y: number, timer: ReturnType<typeof setTimeout>, target: Element, fired: boolean, native: boolean} | null} */
    let press = null;
    items.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) { press = null; return; }
      const t = e.touches[0];
      const target = /** @type {Element} */ (e.target);
      if (!target.closest('tr[data-item]') || target.closest('button, a, input, select, textarea')) return;
      clearTimeout(press?.timer);
      const p = { x: t.clientX, y: t.clientY, target, fired: false, native: false, timer: setTimeout(() => {
        if (press !== p || p.native) return;
        p.fired = true; longPresses++;
        // the original contextmenu handler on #items opens Details (P29)
        p.target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 2 }));
      }, CF.longPressMs) };
      press = p;
    }, { passive: true });
    items.addEventListener('touchmove', e => {
      if (!press) return;
      const t = e.touches[0];
      if (Math.hypot(t.clientX - press.x, t.clientY - press.y) > CF.longPressSlopPx) { clearTimeout(press.timer); press = null; }
    }, { passive: true });
    items.addEventListener('touchend', e => {
      if (press?.fired && e.cancelable) e.preventDefault(); // no click after a long press
      if (press) clearTimeout(press.timer);
      press = null;
    });
    items.addEventListener('touchcancel', () => { if (press) clearTimeout(press.timer); press = null; });
    // Android sends its own contextmenu on a long press: let that one through once, not ours too
    items.addEventListener('contextmenu', e => {
      if (!press || !e.isTrusted) return;
      if (press.fired) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      press.native = true;
    }, true);
  }

  // a tap on a select opens the parchment list (the closed select keeps its native keyboard)
  /** @type {{x: number, y: number, sel: HTMLSelectElement} | null} */
  let tap = null;
  document.addEventListener('touchstart', e => {
    const sel = /** @type {Element} */ (e.target).closest?.('select');
    tap = sel instanceof HTMLSelectElement && sel.id !== 'recordMode' && !sel.disabled && sel.closest('.layout') && e.touches.length === 1
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY, sel } : null;
  }, { passive: true, capture: true });
  document.addEventListener('touchend', e => {
    if (!tap) return;
    const t = e.changedTouches[0];
    const { sel, x, y } = tap; tap = null;
    if (!t || Math.hypot(t.clientX - x, t.clientY - y) > CF.longPressSlopPx) return; // a scroll, not a tap
    if (e.cancelable) e.preventDefault(); // no native picker
    if (menus.isOpen() && menus.read()?.id === sel.id) { menus.close(); return; }
    menus.openFor(sel.id);
  }, { capture: true });

  // taps press the ink: a short-lived class on whatever control was tapped
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    const c = /** @type {Element} */ (e.target).closest?.('button, a, summary, select, .filterbar label');
    if (!c) return;
    c.classList.add('vc-tap');
    const off = () => { c.classList.remove('vc-tap'); removeEventListener('pointerup', off, true); removeEventListener('pointercancel', off, true); };
    addEventListener('pointerup', off, true); addEventListener('pointercancel', off, true);
  }, true);
  return { read: () => ({ longPresses }) };
}

// ── Help switch (step 9) ────────────────────────────────────────────────────────────────
function attachHelpSwitch() {
  const helpEl = document.querySelector('details.help');
  // only where the desk can run, and not when a test forces the mode with ?mode=
  if (!helpEl || loadEnv.query || !canRunDesk(loadEnv)) return { shown: false };
  const label = document.createElement('label');
  label.className = 'vc-desk-switch';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.id = 'vcForceDesk';
  box.checked = !!loadEnv.forceDesk;
  box.addEventListener('change', () => {
    try { localStorage.setItem(FORCE_DESK_KEY, box.checked ? '1' : '0'); } catch { /* storage blocked */ }
    location.reload();
  });
  label.append(box, ' ', STRINGS.forceDesk);
  helpEl.append(label);
  return { shown: true };
}

// ── Phones (step 5): the sticky header gets a soft shadow once the page scrolls ───────────
function attachStickyHeader() {
  const header = document.querySelector('header.top');
  if (!header) return;
  let lifted = false;
  const check = () => {
    const now = scrollY > 2;
    if (now !== lifted) { lifted = now; header.classList.toggle('vc-lifted', now); }
  };
  addEventListener('scroll', check, { passive: true });
  check();
}
