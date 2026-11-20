// @ts-check
/**
 * WP-11 · favourite tags (spec "Favourite tags"; P04, P05; file 04 "Hanging and floating paper").
 *
 * Each favourite (`#favorites .favorite`, written by app.js) is a 4 × 5 cm paper tag hanging from
 * a brass pin on the sheet's top edge: the name, the count in bold and "{action} · lifetime"
 * (unchanged markup). Click opens the collection (P04); × removes it.
 *
 * Every tag is a pendulum on its pin: an idle sway (0.5° at 0.3 Hz), swings from the breeze
 * (air pushes it away from the stronger side) and from impacts (away from the impact point),
 * damped at 0.9 /s. A new tag drops in from above (380 ms) and swings; a removed tag unpins,
 * curls and floats away to the left, fading (700 ms; a copy without any controls does that, since
 * app.js has already rebuilt the list). The title area is the `<header>`, so app.js's own drag
 * handlers keep working; it glows faintly while a row is dragged over it (CSS, `favorite-drop`).
 */
import { emit, on } from '../bus.js';
import { surfaces as MS, hanging as MH } from '../config/motion.js';
import { RECTS } from '../paper/layout.js';
import { onImpact } from '../scene/impact.js';
import { breeze } from '../scene/breeze.js';
import { Pendulum } from './plan.js';

/**
 * @param {object} o
 * @param {(phase: string, fn: (dt: number, t: number) => void) => () => void} o.onPhase
 * @param {{ next(): number }} o.rng
 */
export function attachTags(o) {
  const list = /** @type {HTMLElement} */ (document.getElementById('favorites'));
  const header = /** @type {HTMLElement} */ (document.querySelector('header.top'));
  /** Pendulums by tag identity (the item name in the open button), so a re-render keeps the swing. @type {Map<string, Pendulum>} */
  const swings = new Map();
  /** @type {{el: HTMLElement, key: string, p: Pendulum, x: number, y: number}[]} */
  let tags = [];
  let lastSwingEvent = -Infinity, clockMs = 0;
  /** @type {Set<string>} */
  const dropping = new Set();

  const keyOf = (/** @type {HTMLElement} */ el) => (el.querySelector('[data-favorite-open]')?.firstChild?.textContent || el.textContent || '').trim();
  const slotW = (RECTS.favorites.x1 - RECTS.favorites.x0) / 6;

  function bind() {
    const els = /** @type {HTMLElement[]} */ ([...list.querySelectorAll(':scope > .favorite')]);
    tags = els.map((el, i) => {
      const key = keyOf(el);
      let p = swings.get(key);
      if (!p) { p = new Pendulum(o.rng.next() * Math.PI * 2); swings.set(key, p); }
      el.style.setProperty('--vc-tag-i', String(i));
      // a fixed small hang-angle per tag, so a row of tags never looks machine-straight
      if (!el.style.getPropertyValue('--vc-tag-rest')) el.style.setProperty('--vc-tag-rest', ((p.phase / Math.PI - 1) * 1.1).toFixed(2) + 'deg');
      return { el, key, p, x: RECTS.favorites.x0 + slotW * (i + 0.5), y: RECTS.favorites.y1 - MS.tagH / 2 };
    });
    for (const k of [...swings.keys()]) if (!tags.some(t => t.key === k)) swings.delete(k);
    for (const t of tags) if (dropping.has(t.key)) { dropping.delete(t.key); dropIn(t); }
  }
  new MutationObserver(bind).observe(list, { childList: true });

  /** @param {{el: HTMLElement, p: Pendulum}} t */
  function dropIn(t) {
    t.el.classList.remove('vc-tag-drop');
    void t.el.offsetWidth;
    t.el.classList.add('vc-tag-drop');
    t.el.addEventListener('animationend', () => t.el.classList.remove('vc-tag-drop'), { once: true });
    t.p.kick(MS.tagDropSwingDeg * 2 * Math.PI * MS.tagSwingHz);
  }

  on('app:favorite-add', () => {
    // app.js has rebuilt the list already (header() runs before the emit): the last tag is new
    const last = /** @type {HTMLElement|null} */ (list.querySelector(':scope > .favorite:last-child'));
    if (!last) return;
    bind();
    const t = tags.find(x => x.el === last);
    if (t) dropIn(t);
  });

  // removal: copy the tag (without its controls) before app.js rebuilds the list, then let the copy float away
  /** @type {{ghost: HTMLElement} | null} */
  let leaving = null;
  list.addEventListener('click', e => {
    const b = /** @type {Element} */ (e.target).closest?.('[data-remove-favorite]');
    const tag = /** @type {HTMLElement|null} */ (b?.closest('.favorite') ?? null);
    if (!tag) return;
    const ghost = document.createElement('div');
    ghost.className = 'vc-tag-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    // the look of the tag, as text only: no buttons, titles or labels survive in the copy
    const open = tag.querySelector('[data-favorite-open]');
    const name = document.createElement('span'); name.className = 'vc-tag-ghost-name';
    name.textContent = (open?.firstChild?.textContent || '').trim();
    const count = document.createElement('b'); count.textContent = open?.querySelector('b')?.textContent || '';
    const sm = document.createElement('small'); sm.textContent = open?.querySelector('small')?.textContent || '';
    ghost.append(name, count, sm);
    Object.assign(ghost.style, {
      left: (tag.offsetLeft + list.offsetLeft) + 'px', top: (tag.offsetTop + list.offsetTop) + 'px',
      width: tag.offsetWidth + 'px', height: tag.offsetHeight + 'px',
    });
    ghost.style.setProperty('--vc-tag-angle', getComputedStyle(tag).rotate === 'none' ? '0deg' : getComputedStyle(tag).rotate);
    leaving = { ghost };
  }, true);
  on('app:favorite-remove', () => {
    if (!leaving) return;
    const g = leaving.ghost; leaving = null;
    header.append(g);
    g.classList.add('vc-tag-leave');
    setTimeout(() => g.remove(), MH.tagRemoveMs + 60);
  });

  onImpact((felt, e) => {
    for (const t of tags) {
      const dir = t.x >= e.x ? 1 : -1;
      t.p.kick(dir * felt * MS.tagImpactDeg * 2 * Math.PI * MS.tagSwingHz);
    }
  }, () => ({ x: (RECTS.favorites.x0 + RECTS.favorites.x1) / 2, y: (RECTS.favorites.y0 + RECTS.favorites.y1) / 2 }));

  o.onPhase('physics', dt => {
    clockMs += dt;
    let big = 0;
    for (const t of tags) {
      // the air pushes a tag away from the stronger side, up to the breeze swing limit
      const l = breeze.sample(t.x - 1.5, t.y), r = breeze.sample(t.x + 1.5, t.y);
      const push = Math.sign(l - r) * breeze.tagSwingDeg(t.x, t.y);
      const a = t.p.step(dt, push);
      const v = a.toFixed(2) + 'deg';
      if (/** @type {any} */ (t.el).__vcRot !== v) { /** @type {any} */ (t.el).__vcRot = v; t.el.style.rotate = v; }
      big = Math.max(big, Math.abs(t.p.theta));
    }
    if (big > MS.tagSwingEventDeg && clockMs - lastSwingEvent > MS.tagSwingEventMs) {
      lastSwingEvent = clockMs;
      emit('tag:swing', { deg: +big.toFixed(1) });
    }
  });

  bind();
  return {
    read: () => tags.map(t => ({ key: t.key.length, angle: +t.p.angle().toFixed(3), swing: +t.p.theta.toFixed(3), rotate: t.el.style.rotate })),
    kick: (/** @type {number} */ deg) => { for (const t of tags) t.p.kick(deg); },
  };
}
