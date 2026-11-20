// @ts-check
/**
 * WP-11 · the unfold engine (spec "Details unfold" steps 2–6; How-to and the help letter use it).
 *
 * Open (1.5 s, then 0.9 s of ink):
 *   0 ms        a folded square, final width ÷ 8 by final height ÷ 4, sits on the button it came from
 *   0–1,260     five folds (width ×2, height ×2, width ×2, height ×2, width ×2), alternating
 *               directions, starting 0 / 250 / 500 / 750 / 1,000 ms; each flap is a CSS 3D panel
 *               turning 180° on its hinge in 260 ms with a 3° overshoot
 *   0–1,500     the packet travels from the button to its place and rises to its 4 cm float
 *   1,500–2,100 glowing ink lines along the creases fade (magic)
 *   2,100–2,400 the real sheet's content inks in with a wash; the blank panels go
 * Floating: bob 0.2 cm at 0.31 Hz and roll 0.4°, the shadow on the paper matching the height;
 * breeze and impacts make it flutter.
 * Close (0.9 s): the folds reverse, the packet travels back and sinks, the square shrinks into the
 * button and an ink puff rises.
 *
 * Everything is drawn in #float (layer 5) with plain DOM; the real sheet (the dialog, the How-to
 * paper, the help letter) keeps its content and accessibility the whole time: during the unfold it
 * is only transparent.
 *
 * Paul, WP-16 (items 24–25): two more styles (plan.js `timedPlan`). `pieces` (the help letter)
 * opens a width crease and then one narrow strip at a time down the sheet; `letter` (Details)
 * comes out of the button folded in half and opens in one step. In both the text is already
 * printed on the paper: every panel carries a picture of its part of the sheet (an inert,
 * aria-hidden copy without ids) on its front, blank paper on its back, so a turning piece shows
 * its text in the last half of its turn. The real sheet takes over the moment the last piece
 * lands: no crease glow and no ink wash.
 */
import { clock } from '../util/clock.js';
import { surfaces as MS, hanging as MH } from '../config/motion.js';
import { Spring } from '../util/spring.js';
import { timedPlan, timedAngle } from './plan.js';

/** @typedef {import('./plan.js').Rect} Rect */

const easeOutCubic = (/** @type {number} */ u) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);
const easeInOutCubic = (/** @type {number} */ u) => { u = Math.min(1, Math.max(0, u)); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };

/**
 * @param {object} o
 * @param {HTMLElement} o.host   #float
 * @param {() => number} o.pxPerCm   screen px per paper cm at the middle of the sheet
 * @param {(x: number, y: number) => number} [o.air]  breeze speed (cm/s) under a client point
 */
export function createUnfold(o) {
  /** @type {Set<Run>} */
  const runs = new Set();
  let seq = 0;
  /** knocks alternate sides (no unseeded randomness, file 01) */
  let side = 1;

  /**
   * @typedef {object} Run
   * @property {'open'|'close'} dir
   * @property {number} t
   * @property {HTMLElement} stage
   * @property {HTMLElement} pack
   * @property {HTMLElement} base
   * @property {HTMLElement[]} flaps
   * @property {HTMLElement[]} creases
   * @property {HTMLElement} shadow
   * @property {Rect} rect      the final sheet in client px
   * @property {{dx: number, dy: number}} travel  start cell → origin centre offset
   * @property {number[]} fired
   * @property {boolean} [floated]
   * @property {boolean} [inked]
   * @property {boolean} [shrunk]
   * @property {HTMLElement|null} [sheet]
   * @property {object} opts
   * @property {number} id
   */

  /**
   * A printed face: a copy of `src` laid out at the sheet's size, shifted so that panel rect `pr`
   * shows its own part. Ids become data-vc-id (no duplicates for tests or labels), form values are
   * copied, and the copy is inert and hidden from assistive technology.
   * @param {HTMLElement} src @param {Rect} rect @param {Rect} pr
   */
  function face(src, rect, pr) {
    const wrap = document.createElement('div');
    wrap.className = 'vc-unfold-face';
    const c = /** @type {HTMLElement} */ (src.cloneNode(true));
    for (const el of [c, ...c.querySelectorAll('[id]')]) { if (el.id) { el.setAttribute('data-vc-id', el.id); el.removeAttribute('id'); } }
    for (const a of ['role', 'aria-modal', 'aria-labelledby', 'aria-live', 'hidden']) c.removeAttribute(a);
    c.classList.remove('vc-unfolding', 'vc-inkin');
    c.classList.add('vc-face-copy');
    if (c.tagName === 'DIALOG') c.setAttribute('open', '');
    // the copy must not be found as the real thing while it is on screen: a label's `for` would
    // join the copy's text to the real field's name, and a cloned <details> matches `details.help`
    for (const el of c.querySelectorAll('[for], [name], [form]')) for (const a of ['for', 'name', 'form']) el.removeAttribute(a);
    for (const d of [...c.querySelectorAll('details')]) {
      const div = document.createElement('div');
      for (const at of [...d.attributes]) if (at.name !== 'open') div.setAttribute(at.name, at.value);
      div.classList.add('vc-details-copy');
      div.append(...d.childNodes);
      d.replaceWith(div);
    }
    const from = src.querySelectorAll('textarea, select, input'), to = c.querySelectorAll('textarea, select, input');
    from.forEach((f, i) => { const t = /** @type {any} */ (to[i]); if (t) t.value = /** @type {any} */ (f).value; });
    // `inset` first: it would reset left/top if it came after them
    c.style.inset = 'auto';
    Object.assign(c.style, { position: 'absolute', left: -pr.x + 'px', top: -pr.y + 'px', width: rect.w + 'px', height: rect.h + 'px', maxHeight: 'none', margin: '0', transform: 'none', boxShadow: 'none', opacity: '1' });
    wrap.append(c);
    return wrap;
  }

  /**
   * Build the paper panels for a sheet of w × h at client rect `rect`.
   * @param {Rect} rect @param {'five'|'pieces'|'letter'} [style] @param {{w: number, h: number}|null} [origin] @param {HTMLElement|null} [src] the sheet to print on the panels
   */
  function build(rect, style = 'five', origin = null, src = null) {
    const plan = timedPlan(style, rect.w, rect.h, origin);
    const printed = plan.faces && !!src;
    const stage = document.createElement('div');
    stage.className = `vc-unfold vc-keep-alive vc-unfold--${style}`;
    stage.inert = true;
    stage.setAttribute('aria-hidden', 'true');
    stage.dataset.unfold = String(++seq);
    Object.assign(stage.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
    const shadow = document.createElement('div');
    shadow.className = 'vc-unfold-shadow';
    const pack = document.createElement('div');
    pack.className = 'vc-unfold-pack';
    const cell = (/** @type {Rect} */ r, /** @type {string} */ cls) => {
      const el = document.createElement('div');
      el.className = cls;
      Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
      return el;
    };
    const base = cell(plan.start, 'vc-unfold-panel vc-unfold-base');
    if (printed && src) { base.classList.add('vc-unfold-panel--faced'); base.append(face(src, rect, plan.start)); }
    pack.append(base);
    const flaps = plan.flaps.map(f => {
      const el = cell(f.rect, `vc-unfold-panel vc-unfold-flap vc-unfold-flap--${f.hinge}`);
      el.dataset.fold = String(f.i);
      el.dataset.axis = f.axis;
      el.style.transformOrigin = { left: 'left center', right: 'right center', top: 'center top', bottom: 'center bottom' }[f.hinge];
      el.style.visibility = 'hidden';
      if (printed && src) {
        el.classList.add('vc-unfold-panel--faced');
        const back = document.createElement('div');
        back.className = `vc-unfold-back vc-unfold-back--${f.axis}`;
        el.append(face(src, rect, f.rect), back);
      }
      pack.append(el);
      return el;
    });
    // the creases: one glowing ink line along each hinge
    const creases = plan.flaps.map(f => {
      const vertical = f.hinge === 'left' || f.hinge === 'right';
      const x = f.hinge === 'left' ? f.rect.x : f.hinge === 'right' ? f.rect.x + f.rect.w : f.rect.x;
      const y = f.hinge === 'top' ? f.rect.y : f.hinge === 'bottom' ? f.rect.y + f.rect.h : f.rect.y;
      const el = cell(vertical ? { x: x - 1, y, w: 2, h: f.rect.h } : { x, y: y - 1, w: f.rect.w, h: 2 }, 'vc-unfold-crease');
      el.style.opacity = '0';
      pack.append(el);
      return el;
    });
    if (plan.faces) for (const c of creases) c.classList.add('vc-unfold-crease--fine');
    stage.append(shadow, pack);
    o.host.append(stage);
    return { plan, stage, pack, base, flaps, creases, shadow };
  }

  /** Union of the panels that lie open (angle under 90°), for the shadow. @param {Run} r @param {number[]} angles */
  function openArea(r, angles) {
    const plan = /** @type {any} */ (r).plan;
    let x0 = plan.start.x, y0 = plan.start.y, x1 = plan.start.x + plan.start.w, y1 = plan.start.y + plan.start.h;
    plan.flaps.forEach((f, i) => {
      if (!(Math.abs(angles[i]) < 90)) return;
      x0 = Math.min(x0, f.rect.x); y0 = Math.min(y0, f.rect.y);
      x1 = Math.max(x1, f.rect.x + f.rect.w); y1 = Math.max(y1, f.rect.y + f.rect.h);
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /** CSS transform of flap i at angle a (deg). @param {HTMLElement} el @param {number} a @param {number} i */
  function setFlap(el, a, i) {
    const hinge = el.className.match(/--(left|right|top|bottom)/)?.[1];
    const z = (i + 1) * 0.6;
    // turn toward the viewer: right-hand flaps rotateY(−a), left-hand rotateY(+a), lower rotateX(+a), upper rotateX(−a)
    const rot = hinge === 'left' ? `rotateY(${-a}deg)` : hinge === 'right' ? `rotateY(${a}deg)` : hinge === 'top' ? `rotateX(${a}deg)` : `rotateX(${-a}deg)`;
    el.style.transform = `translateZ(${z}px) ${rot}`;
    // the side facing away is in shadow: a little darker while it turns
    el.style.setProperty('--vc-turn', (Math.abs(Math.sin(a * Math.PI / 180)) * 0.5).toFixed(3));
  }

  // ── Floating sheets: bob, roll, flutter and the shadow matching the height ─────────────
  /** @typedef {{ el: HTMLElement, t: number, phase: number, flutter: Spring, lift: number, id: number }} Floater */
  /** @type {Set<Floater>} */
  const floaters = new Set();

  /** Transform and shadow for a sheet floating `h` cm high. @param {number} hCm @param {number} bobCm @param {number} rollDeg @param {number} flutterDeg */
  function floatStyle(hCm, bobCm, rollDeg, flutterDeg) {
    const px = o.pxPerCm();
    const z = (hCm + bobCm) * px;
    return {
      transform: `translate3d(0, ${(-bobCm * px * 0.35).toFixed(2)}px, ${z.toFixed(2)}px) rotateZ(${rollDeg.toFixed(3)}deg) rotateX(${flutterDeg.toFixed(3)}deg)`,
      // the key light comes from the upper left: the shadow falls down and right, further and softer the higher it floats
      shadow: `${(z * 0.42).toFixed(1)}px ${(z * 0.55).toFixed(1)}px ${(8 + z * 0.9).toFixed(1)}px rgba(28, 16, 6, ${Math.max(0.16, 0.42 - z * 0.002).toFixed(3)})`,
    };
  }

  const api = {
    /** A printed, inert copy of a sheet (Paul, WP-17 item 27 burns one away). */
    face,
    /** Finish at once any sequence running on `sheet` (its panels go). @param {HTMLElement} sheet */
    stop(sheet) { for (const r of [...runs]) if (r.sheet === sheet) finish(r); },
    /**
     * Unfold `sheet` (already laid out at its final place, transparent while this runs).
     * @param {object} p
     * @param {HTMLElement} p.sheet
     * @param {DOMRect|null} [p.origin]  where the folded square starts (the button)
     * @param {(i: number) => void} [p.onFold]
     * @param {() => void} [p.onFloat]
     * @param {() => void} [p.onDone]
     * @param {boolean} [p.float]  bob and roll once open (default true)
     * @param {'five'|'pieces'|'letter'} [p.style]  Paul, WP-16 items 24–25 (default five)
     * @param {boolean} [p.appear]  Paul, WP-18 item 14: no origin; the packet appears from nothing
     *   where the sheet will lie, fading in and growing from `appearScale` while it unfolds
     */
    open(p) {
      // a sheet still folding shut from before finishes at once
      for (const r of runs) if (r.sheet === p.sheet) finish(r);
      p.sheet.style.transform = '';
      p.sheet.style.boxShadow = '';
      const b = p.sheet.getBoundingClientRect();
      const rect = { x: b.left, y: b.top, w: Math.max(8, b.width), h: Math.max(8, b.height) };
      const style = p.style ?? 'five';
      // appear: the letter plan's start scale from a pretend origin of appearScale × the folded half
      const from = p.appear ? { w: rect.w * MS.appearScale, h: rect.h / 2 * MS.appearScale } : p.origin ? { w: p.origin.width, h: p.origin.height } : null;
      const parts = build(rect, style, from, p.sheet);
      p.sheet.classList.add('vc-unfolding');
      p.sheet.classList.remove('vc-inkin');
      const s = parts.plan.start;
      const oc = p.origin && !p.appear ? { x: p.origin.left + p.origin.width / 2, y: p.origin.top + p.origin.height / 2 } : { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
      /** @type {Run} */
      const r = { dir: 'open', t: 0, t0: clock.now(), ...parts, rect, travel: { dx: oc.x - (rect.x + s.x + s.w / 2), dy: oc.y - (rect.y + s.y + s.h / 2) }, fired: [], sheet: p.sheet, opts: p, id: seq };
      runs.add(r);
      step(r, 0);
      return r.id;
    },
    /**
     * Fold a sheet shut. The caller has already hidden the real sheet (the dialog closed).
     * @param {object} p
     * @param {Rect} p.rect   the sheet's client rect when it was open
     * @param {DOMRect|null} [p.to]  the button it folds into
     * @param {() => void} [p.onDone]
     * @param {'five'|'pieces'|'letter'} [p.style]
     * @param {HTMLElement|null} [p.face]  the sheet whose print the closing panels carry
     */
    close(p) {
      const parts = build(p.rect, p.style ?? 'five', p.to ? { w: p.to.width, h: p.to.height } : null, p.face ?? null);
      const s = parts.plan.start;
      const tc = p.to && p.to.width > 0 ? { x: p.to.left + p.to.width / 2, y: p.to.top + p.to.height / 2 } : { x: p.rect.x + p.rect.w / 2, y: p.rect.y + p.rect.h / 2 };
      /** @type {Run} */
      const r = { dir: 'close', t: 0, t0: clock.now(), ...parts, rect: p.rect, travel: { dx: tc.x - (p.rect.x + s.x + s.w / 2), dy: tc.y - (p.rect.y + s.y + s.h / 2) }, fired: [], sheet: null, opts: p, id: seq };
      for (const f of r.flaps) f.style.visibility = 'visible';
      runs.add(r);
      step(r, 0);
      return r.id;
    },
    /** Make `el` float (bob, roll, flutter, shadow). Returns a function that stops it. @param {HTMLElement} el */
    float(el) {
      /** @type {Floater} */
      // its centre is read once here: a per-frame rect read would force a full layout every frame
      const b = el.getBoundingClientRect();
      // Paul, WP-17 item 29: the print must ride the bob exactly. Measured: any per-frame change of
      // the sheet's inline transform (or box-shadow) repaints it every frame (120 of 120 frames),
      // re-rastering its text at each new depth, so the text swims against the paper. The passive
      // bob and roll are therefore compositor animations (0 repaints), shared with the shadow,
      // which is a sibling with a fixed shadow; only a breeze flutter (rare) is set inline.
      const shade = document.createElement('div');
      shade.className = 'vc-float-shadow';
      shade.setAttribute('aria-hidden', 'true');
      const place = () => Object.assign(shade.style, { left: el.offsetLeft + 'px', top: el.offsetTop + 'px', width: el.offsetWidth + 'px', height: el.offsetHeight + 'px' });
      place();
      el.before(shade);
      const ro = new ResizeObserver(place);
      ro.observe(el);
      el.style.willChange = 'transform';
      el.style.boxShadow = '';
      el.style.transform = '';
      const f = { el, shade, t: 0, phase: 0, flutter: new Spring({ ...MS.toastFlutterSpring, value: 0 }), lift: 0, id: ++seq, cx: b.left + b.width / 2, cy: b.top + b.height / 2, px: 0, anims: /** @type {Animation[]} */ ([]), t0: clock.now() };
      floaters.add(f);
      bob(f);
      apply(f, 0);
      return () => {
        floaters.delete(f); ro.disconnect(); shade.remove();
        for (const a of f.anims) a.cancel();
        el.style.transform = ''; el.style.boxShadow = ''; el.style.willChange = ''; el.style.rotate = '';
      };
    },
    /** A knock for every floating sheet (impact strength already reduced by distance). @param {number} felt */
    knock(felt) { side = -side; for (const f of floaters) f.flutter.impulse(side * felt * 60); },
    /** @param {number} dt ms */
    update(dt) {
      for (const r of [...runs]) step(r, dt);
      for (const f of floaters) apply(f, dt);
    },
    /** Running sequences, for tests. */
    state: () => ({ runs: [...runs].map(r => ({ id: r.id, dir: r.dir, t: Math.round(r.t), fired: [...r.fired] })), floating: floaters.size }),
    /** Geometry of a plan, for tests. @param {number} w @param {number} h */
    plan: (w, h) => timedPlan('five', w, h),
    /** Any style's timed plan, for tests. @param {'five'|'pieces'|'letter'} style @param {number} w @param {number} h */
    timed: (style, w, h) => timedPlan(style, w, h),
  };

  /**
   * The passive bob (0.2 cm at 0.31 Hz, the same sinusoid as before) and roll (0.4° at 0.73 × that,
   * phase 1.1) as two infinite compositor animations, the roll added onto the bob. Sheet and
   * shadow get the same pair, started together. Rebuilt (same phase) when the cm → px scale moves.
   * @param {any} f
   */
  function bob(f) {
    const px = o.pxPerCm(), N = 24;
    const bobMs = 1000 / MH.detailsBobHz, rollMs = bobMs / 0.73;
    const lift = [], roll = [];
    for (let k = 0; k <= N; k++) {
      const s = Math.sin(2 * Math.PI * k / N);
      lift.push({ transform: `translate3d(0, ${(-MH.detailsBob * s * px * 0.35).toFixed(3)}px, ${((MH.detailsHeight + MH.detailsBob * s) * px).toFixed(3)}px)` });
      roll.push({ transform: `rotateZ(${(MH.detailsRollDeg * Math.sin(2 * Math.PI * k / N + 1.1)).toFixed(4)}deg)` });
    }
    const since = clock.now() - f.t0;
    for (const a of f.anims) a.cancel();
    f.anims = [];
    for (const el of [f.el, f.shade]) {
      const a = el.animate(lift, { duration: bobMs, iterations: Infinity });
      const r = el.animate(roll, { duration: rollMs, iterations: Infinity, composite: 'add' });
      a.currentTime = since % bobMs; r.currentTime = since % rollMs;
      f.anims.push(a, r);
    }
    f.shade.style.boxShadow = floatStyle(MH.detailsHeight, 0, 0, 0).shadow;
    f.px = px;
  }

  /** @param {Floater} f @param {number} dt */
  function apply(f, dt) {
    const g = /** @type {any} */ (f);
    f.t += dt;
    if (Math.abs(o.pxPerCm() - g.px) > g.px * 0.01) bob(g);
    const air = o.air ? o.air(g.cx, g.cy) : 0;
    f.flutter.target = Math.min(MS.toastFlutterMaxDeg, air * MS.toastFlutterDegPerSpeed);
    f.flutter.step(dt);
    // only a breeze flutter touches the sheet's inline style (and repaints it while it lasts)
    const fl = Math.abs(f.flutter.value) > 0.01 ? `x ${f.flutter.value.toFixed(3)}deg` : '';
    if (f.el.style.rotate !== fl) { f.el.style.rotate = fl; g.shade.style.rotate = fl; }
  }

  /** @param {Run} r */
  function finish(r) {
    runs.delete(r);
    r.stage.remove();
    if (r.sheet) { r.sheet.classList.remove('vc-unfolding'); }
  }

  /** Advance one sequence. @param {Run} r @param {number} dt */
  function step(r, dt) {
    // time since the open/close call on the central clock (not summed frame dts: a long first
    // frame is clamped by the stage and would push every later fold late)
    r.t = Math.max(r.t + Math.min(dt, 1), clock.now() - r.t0);
    const t = r.t;
    const plan = /** @type {import('./plan.js').TimedPlan} */ (/** @type {any} */ (r).plan);
    const angles = plan.flaps.map(f => timedAngle(f, t, r.dir));
    if (r.dir === 'open') {
      r.flaps.forEach((el, i) => {
        if (t >= plan.flaps[i].t0) {
          if (!r.fired.includes(i)) { r.fired.push(i); /** @type {any} */ (r.opts).onFold?.(i); }
          el.style.visibility = 'visible';
          setFlap(el, angles[i], i);
        }
      });
      const riseMs = plan.style === 'letter' ? MS.letterEmergeMs : plan.riseMs;
      const u = t / riseMs, e = easeOutCubic(u);
      const px = o.pxPerCm();
      const z = MH.detailsHeight * px * easeInOutCubic(u);
      const k = plan.startScale + (1 - plan.startScale) * e;
      if (k !== 1) { const s0 = plan.start; r.pack.style.transformOrigin = `${s0.x + s0.w / 2}px ${s0.y + s0.h / 2}px`; }
      r.pack.style.transform = `translate3d(${(r.travel.dx * (1 - e)).toFixed(2)}px, ${(r.travel.dy * (1 - e)).toFixed(2)}px, ${z.toFixed(2)}px)` + (k !== 1 ? ` scale(${k.toFixed(4)})` : '');
      // Paul, WP-18 item 14: from nothing (opacity 0 → 1; its shadow with it)
      if (/** @type {any} */ (r.opts).appear) r.pack.style.opacity = appearK(r).toFixed(3);
      shade(r, openArea(r, angles), z);
      if (plan.faces) {
        // Paul, WP-16 items 24–25: the print is on the panels, so the real sheet simply takes over
        // when the last piece lies flat (no crease glow, no ink wash)
        r.creases.forEach((c, i) => { const f = plan.flaps[i]; c.style.opacity = t > f.t0 + f.dur * 0.7 && t < plan.doneMs ? '0.55' : '0'; });
        if (t >= Math.max(plan.doneMs, riseMs)) {
          if (!r.floated) {
            r.floated = true;
            /** @type {any} */ (r.opts).onFloat?.();
            if (r.sheet && /** @type {any} */ (r.opts).float !== false) { /** @type {any} */ (r.sheet).__vcUnfloat = api.float(r.sheet); }
          }
          finish(r);
          /** @type {any} */ (r.opts).onDone?.();
        }
        return;
      }
      if (t >= MS.unfoldRiseMs && !r.floated) {
        r.floated = true;
        /** @type {any} */ (r.opts).onFloat?.();
        // from here the sheet and its blank panels float together
        if (r.sheet && /** @type {any} */ (r.opts).float !== false) {
          const stop = api.float(r.sheet);
          /** @type {any} */ (r.sheet).__vcUnfloat = stop;
        }
      }
      if (t >= MS.unfoldRiseMs) {
        // the panels ride the sheet's float transform
        if (r.sheet) { r.pack.style.transform = getComputedStyle(r.sheet).transform; r.shadow.style.opacity = '0'; }
        const g = (t - MS.unfoldRiseMs) / MS.creaseGlowMs;
        for (const c of r.creases) c.style.opacity = String(Math.max(0, 1 - g).toFixed(3));
      } else {
        // the creases start to glow as each fold lands
        r.creases.forEach((c, i) => { c.style.opacity = t > MS.foldStartsMs[i] + MS.foldMs * 0.7 ? '1' : '0'; });
      }
      if (t >= MS.unfoldRiseMs + MS.creaseGlowMs && !r.inked) {
        r.inked = true;
        if (r.sheet) { r.sheet.classList.remove('vc-unfolding'); r.sheet.classList.add('vc-inkin'); }
        r.stage.classList.add('vc-unfold--handover');
      }
      if (t >= MS.unfoldRiseMs + MS.creaseGlowMs + MS.contentWashMs) {
        finish(r);
        r.sheet?.classList.remove('vc-inkin');
        /** @type {any} */ (r.opts).onDone?.();
      }
      return;
    }
    // ── close ──
    r.flaps.forEach((el, i) => {
      setFlap(el, angles[i], i);
      if (t >= plan.flaps[i].c0 + plan.flaps[i].cdur) el.style.visibility = 'hidden';
    });
    const closeMs = plan.closeMs;
    const u = t / closeMs, e = easeInOutCubic(u);
    const px = o.pxPerCm();
    const z = MH.detailsHeight * px * (1 - e);
    let scale = 1;
    // letter: after its half folds down it shrinks back to the button's size on the way home
    if (plan.style === 'letter') {
      const fold = plan.flaps[0].cdur, v = Math.max(0, (t - fold) / Math.max(1, closeMs - fold));
      scale = 1 - (1 - plan.startScale) * easeInOutCubic(v);
    }
    if (t > closeMs) {
      scale = (plan.style === 'letter' ? plan.startScale : 1) * Math.max(0, 1 - (t - closeMs) / MS.closeShrinkMs);
      if (!r.shrunk && scale === 0) { r.shrunk = true; puff(r); }
    }
    const s = plan.start;
    r.pack.style.transformOrigin = `${s.x + s.w / 2}px ${s.y + s.h / 2}px`;
    r.pack.style.transform = `translate3d(${(r.travel.dx * e).toFixed(2)}px, ${(r.travel.dy * e).toFixed(2)}px, ${z.toFixed(2)}px) scale(${scale.toFixed(3)})`;
    shade(r, openArea(r, angles), z * scale);
    if (t >= closeMs + MS.closeShrinkMs + MS.puffMs) { finish(r); /** @type {any} */ (r.opts).onDone?.(); }
  }

  /** The packet's shadow on the paper, matching its height. @param {Run} r @param {Rect} a @param {number} zPx */
  /** Paul, WP-18 item 14: how far an appearing packet has faded in (1 otherwise). @param {Run} r */
  const appearK = r => (/** @type {any} */ (r.opts).appear && r.dir === 'open' ? easeOutCubic(r.t / MS.appearFadeMs) : 1);
  function shade(r, a, zPx) {
    const tr = r.pack.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/);
    const dx = tr ? +tr[1] : 0, dy = tr ? +tr[2] : 0;
    Object.assign(r.shadow.style, {
      left: (a.x + dx + zPx * 0.42) + 'px', top: (a.y + dy + zPx * 0.55) + 'px', width: a.w + 'px', height: a.h + 'px',
      filter: `blur(${(4 + zPx * 0.6).toFixed(1)}px)`, opacity: String((Math.max(0, Math.min(0.55, 0.15 + zPx * 0.006)) * appearK(r)).toFixed(3)),
    });
  }

  /** An ink puff rising from where the square vanished. @param {Run} r */
  function puff(r) {
    const s = /** @type {any} */ (r).plan.start;
    const cx = s.x + s.w / 2 + r.travel.dx, cy = s.y + s.h / 2 + r.travel.dy;
    for (let i = 0; i < MS.puffParticles; i++) {
      const p = document.createElement('i');
      p.className = 'vc-unfold-puff';
      const a = (i / MS.puffParticles) * Math.PI * 2;
      p.style.left = (cx + Math.cos(a) * 6) + 'px';
      p.style.top = (cy + Math.sin(a) * 4) + 'px';
      p.style.setProperty('--dx', (Math.cos(a) * 14).toFixed(1) + 'px');
      p.style.setProperty('--dy', (-18 - (i % 3) * 9).toFixed(1) + 'px');
      p.style.setProperty('--d', MS.puffMs + 'ms');
      p.style.animationDelay = (i * 18) + 'ms';
      r.stage.append(p);
    }
  }

  return api;
}
