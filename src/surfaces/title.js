// @ts-check
/**
 * WP-11 · the title (spec "Title"; P01).
 *
 * "Valheim Checkup" stays the original `.brand` element (WP-07 placed it). Around it, hand-drawn
 * SVG flourishes (Paul, WP-17 item 22: fourteen, most ending in a volute; WP-11 had six): long
 * swashes, counter-loops and a knot under the title, a curl and a tendril at each end, swashes,
 * hairlines and a crest above. Each is three overlapping strokes of different widths (a broad one, a narrower one a
 * hair off it and trimmed at both ends, and a hairline), so the line tapers like a quill.
 *
 * Each flourish loops on its own phase: draws in 2.4 s, holds 3–5 s, erases 2.4 s, rests 1–3 s.
 * While drawing, a tiny warm glint rides the pen tip in #glow, and `title:stroke` is announced
 * (the very quiet `title.quill`). About every 45 s one flourish drops an ink droplet that spreads.
 *
 * The flourishes are laid out from the title's measured ink box, and each one is tested against
 * the letters drawn into a canvas; a flourish that would touch a letter is moved clear of it, so
 * none ever covers the title. On save load the byline writes itself in (a 900 ms handwriting
 * reveal, CSS).
 */
import { emit, on } from '../bus.js';
import { surfaces as MS } from '../config/motion.js';
import { print as PR } from '../config/render.js';
import { inset as LI } from '../config/layout.js';
import { swashCycle } from './plan.js';
import { cached } from '../util/layout-epoch.js';

const PX = PR.pxPerCm;
const NS = 'http://www.w3.org/2000/svg';

/**
 * @param {object} o
 * @param {(phase: string, fn: (dt: number, t: number) => void) => () => void} o.onPhase
 * @param {{ next(): number }} o.rng
 * @param {(x: number, y: number, z?: number) => {x: number, y: number}} [o.project]
 * @param {any} [o.glow]   paper glow (hooks.addSheen)
 */
export function attachTitle(o) {
  // Paul, WP-17 item 4: the title lives in the main section's masthead now (it scrolls with the table)
  const brand = /** @type {HTMLElement} */ (document.querySelector('.brand'));
  const header = /** @type {HTMLElement} */ (brand.parentElement);
  const profile = /** @type {HTMLElement} */ (document.getElementById('headerProfile'));
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'vc-swashes');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  header.append(svg);
  const range = (/** @type {number} */ a, /** @type {number} */ b) => a + (b - a) * o.rng.next();

  /** @typedef {{ g: SVGGElement, paths: SVGPathElement[], len: number[], main: SVGPathElement, t: number, hold: number, rest: number, drawing: boolean, end: number, name: string, drop?: {el: SVGCircleElement, t: number, x: number, y: number} | null, pts: Float32Array }} Flourish */
  /** @type {Flourish[]} */
  let flourishes = [];
  /** @type {{ left: number, right: number, top: number, bottom: number, baseline: number } | null} */
  let ink = null;
  let nextDrop = MS.swashDropletEveryMs * range(0.8, 1.2);

  /** Measure the title's text box in header px: the letters' ink and the baseline. */
  function measure() {
    const probe = /** @type {HTMLElement} */ (brand.cloneNode(false));
    probe.className = brand.className;
    probe.setAttribute('aria-hidden', 'true');
    probe.style.visibility = 'hidden';
    Object.assign(probe.style, { position: 'absolute', left: brand.offsetLeft + 'px', top: brand.offsetTop + 'px', width: brand.offsetWidth + 'px', height: brand.offsetHeight + 'px', margin: '0' });
    // one flex item holding the text and a zero-size baseline marker (both relative to the probe)
    probe.innerHTML = '<span><span></span><i style="display:inline-block;width:0;height:0;vertical-align:baseline"></i></span>';
    const span = /** @type {HTMLElement} */ (probe.querySelector('span > span')), mark = /** @type {HTMLElement} */ (probe.querySelector('i'));
    span.textContent = brand.textContent;
    header.append(probe);
    const left = probe.offsetLeft + span.offsetLeft, width = span.offsetWidth;
    const baseline = probe.offsetTop + mark.offsetTop;
    const cs = getComputedStyle(probe);
    const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    probe.remove();
    const c = document.createElement('canvas').getContext('2d');
    if (!c) return null;
    c.font = font;
    /** @type {any} */ (c).letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    const m = c.measureText(brand.textContent || '');
    return { left: left - m.actualBoundingBoxLeft, right: left + Math.min(width, m.actualBoundingBoxRight), top: baseline - m.actualBoundingBoxAscent, bottom: baseline + m.actualBoundingBoxDescent, baseline, textLeft: left, font, letterSpacing: /** @type {any} */ (c).letterSpacing };
  }

  /**
   * Path data for the flourishes from the ink box (header px). Paul, WP-17 item 22: about three
   * times as intricate as WP-11's six single curves: fourteen flourishes, most a longer run that
   * ends in a volute (a spiral curl), drawn as smooth Catmull-Rom curves through hand-placed
   * points (cm from an anchor; `u` runs outward from the title's centre, `v` down).
   * @param {any} b
   */
  function shapes(b) {
    const cm = PX, W = b.right - b.left, cx = (b.left + b.right) / 2;
    const bylineTop = profile.offsetHeight ? profile.offsetTop : brand.offsetTop + brand.offsetHeight + 0.3 * PX;
    const yU = Math.min(b.baseline + 0.38 * cm, bylineTop - 0.62 * cm);
    const capMid = b.baseline - 0.42 * (b.baseline - b.top);
    const yA = b.top - 0.4 * cm;
    const f = (/** @type {number} */ n) => n.toFixed(1);
    /** A smooth path through points [x, y] (px), Catmull-Rom as cubic Béziers. @param {number[][]} P */
    const smooth = P => {
      let d = `M${f(P[0][0])} ${f(P[0][1])}`;
      for (let i = 0; i < P.length - 1; i++) {
        const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
        d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
      }
      return d;
    };
    /**
     * Points of a volute: from angle a0 (rad, 0 = outward, π/2 = down) turning `turns` times
     * toward the centre, radius r0 → r0·shrink (cm), about (u, v) cm. dir 1 clockwise on the left side.
     * @param {number} u @param {number} v @param {number} r0 @param {number} a0 @param {number} turns @param {number} dir @param {number} [shrink]
     */
    const volute = (u, v, r0, a0, turns, dir, shrink = 0.22) => {
      const n = Math.max(6, Math.round(turns * 10)), out = [];
      for (let i = 1; i <= n; i++) {
        const t = i / n, a = a0 + dir * t * turns * 2 * Math.PI, r = r0 * (1 - (1 - shrink) * t);
        out.push([u + r * Math.cos(a), v + r * Math.sin(a)]);
      }
      return out;
    };
    /** Local (u cm outward, v cm down) → header px about (ox, oy), mirrored by side s. @param {number} s @param {number} ox @param {number} oy @param {number[][]} P */
    const place = (s, ox, oy, P) => P.map(([u, v]) => [ox - s * u * cm, oy + v * cm]);
    const Wc = W / cm;
    /** @param {number} s mirror sign (1 left, −1 right) */
    const under = s => {
      // a long wave out from the middle, a counter-turn, and a volute at the outer end
      const u0 = Wc * 0.03, u1 = Wc * 0.39; // short of the last letter's descender
      const P = [[u0, 0.28], [u0 + 0.25, 0.04], [u0 + (u1 - u0) * 0.22, 0.2], [u0 + (u1 - u0) * 0.45, -0.06], [u0 + (u1 - u0) * 0.7, 0.22], [u1 - 0.55, 0.02], [u1 - 0.1, -0.02]];
      return smooth(place(s, cx, yU, [...P, [u1 + 0.3, 0.08], ...volute(u1 + 0.05, 0.22, 0.3, 0, 1.6, 1)]));
    };
    /** @param {number} s */
    const underLoop = s => {
      // the thinner counter-swash under it: a single loop crossing itself, then a hook
      const u0 = Wc * 0.12, u1 = Wc * 0.3;
      const P = [[u0, 0.38], [u0 + (u1 - u0) * 0.3, 0.5], [u0 + (u1 - u0) * 0.58, 0.32], [u0 + (u1 - u0) * 0.5, 0.12], [u0 + (u1 - u0) * 0.4, 0.3], [u0 + (u1 - u0) * 0.7, 0.5], [u1, 0.4], [u1 + 0.3, 0.18], [u1 + 0.5, 0.3]];
      return smooth(place(s, cx, yU, P));
    };
    /** The knot at the middle under the title: a figure-eight with a dot-like turn at each lobe. */
    const knot = () => {
      const P = [];
      for (let i = 0; i <= 28; i++) { const t = i / 28 * 2 * Math.PI; P.push([0.85 * Math.sin(t), 0.22 + 0.22 * Math.sin(2 * t)]); }
      return smooth(place(1, cx, yU, P));
    };
    /** @param {number} s */
    const curl = s => {
      // off the title's end: out, round a double volute, back up in a tendril
      const ox = s > 0 ? b.left - 0.3 * cm : b.right + 0.3 * cm;
      const P = [[0, 0], [0.6, -0.2], [1.25, 0.05], [1.65, 0.6]];
      return smooth(place(s, ox, capMid, [...P, ...volute(1.0, 0.65, 0.66, 0, 2.1, 1, 0.14)]));
    };
    /** @param {number} s */
    const tendril = s => {
      // above the curl: a leafy S rising out from the cap line, closing in a small volute
      const ox = s > 0 ? b.left - 0.15 * cm : b.right + 0.15 * cm;
      const oy = b.top + 0.25 * (b.baseline - b.top);
      const P = [[0, 0.1], [0.45, -0.2], [0.85, 0.0], [1.3, -0.45], [1.6, -0.95]];
      return smooth(place(s, ox, oy, [...P, ...volute(1.28, -0.95, 0.32, 0, 1.5, -1)]));
    };
    /** @param {number} s */
    const above = s => {
      // over the title: a swash with a hook in and a curl out
      const u = Wc * 0.29;
      const P = [[u - 1.75, 0.1], [u - 1.5, -0.2], [u - 0.9, -0.62], [u - 0.2, -0.08], [u + 0.6, -0.5], [u + 1.35, -0.62]];
      return smooth(place(s, cx, yA, [...P, ...volute(u + 1.35, -0.3, 0.32, -Math.PI / 2, 1.5, -1)]));
    };
    /** @param {number} s */
    const aboveDash = s => {
      // a short hairline with a small loop, between the swash above and the middle crest
      const u = Wc * 0.125;
      const P = [[u - 0.7, -0.08], [u - 0.2, -0.42], [u + 0.15, -0.2], [u - 0.05, -0.04], [u + 0.25, -0.32], [u + 0.75, -0.4], [u + 0.95, -0.2]];
      return smooth(place(s, cx, yA, P));
    };
    /** The crest over the middle: a shallow arch ending in a volute at each side. */
    const crest = () => {
      const L = volute(-1.25, -0.2, 0.3, Math.PI / 2, 1.4, 1).reverse();
      const R = volute(1.25, -0.2, 0.3, Math.PI / 2, 1.4, -1);
      return smooth(place(1, cx, yA, [...L, [-1.25, 0.1], [-0.7, -0.45], [-0.25, -0.62], [0, -0.85], [0.25, -0.62], [0.7, -0.45], [1.25, 0.1], ...R]));
    };
    return [
      { name: 'under-left', d: under(1) }, { name: 'under-right', d: under(-1) },
      { name: 'under-loop-left', d: underLoop(1) }, { name: 'under-loop-right', d: underLoop(-1) },
      { name: 'under-knot', d: knot() },
      { name: 'curl-left', d: curl(1) }, { name: 'curl-right', d: curl(-1) },
      { name: 'above-tendril-left', d: tendril(1) }, { name: 'above-tendril-right', d: tendril(-1) },
      { name: 'above-left', d: above(1) }, { name: 'above-right', d: above(-1) },
      { name: 'above-dash-left', d: aboveDash(1) }, { name: 'above-dash-right', d: aboveDash(-1) },
      { name: 'above-crest', d: crest() },
    ];
  }

  /** Is any stroke of `d` (at width w px) on a letter? Canvas raster test. @param {any} b @param {string} d @param {number} dy */
  function touches(b, d, dy) {
    const w = Math.ceil(header.offsetWidth), h = Math.ceil(header.offsetHeight);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (!x) return false;
    x.font = b.font; /** @type {any} */ (x).letterSpacing = b.letterSpacing;
    x.fillStyle = '#f00';
    x.fillText(brand.textContent || '', b.textLeft, b.baseline);
    x.globalCompositeOperation = 'source-in';
    x.translate(0, dy);
    x.lineWidth = 0.16 * PX + 4; x.strokeStyle = '#0f0'; x.lineCap = 'round';
    x.stroke(new Path2D(d));
    const data = x.getImageData(0, 0, w, h).data;
    for (let i = 1; i < data.length; i += 4) if (data[i] > 40) return true;
    return false;
  }

  function build() {
    ink = measure();
    if (!ink) return;
    for (const fl of flourishes) fl.g.remove();
    flourishes = [];
    svg.setAttribute('viewBox', `0 0 ${header.offsetWidth} ${header.offsetHeight}`);
    for (const s of shapes(ink)) {
      // move a flourish clear of the letters if it would touch one (down for the lower ones, up for the others)
      let dy = 0;
      const dir = s.name.startsWith('above') ? -1 : 1;
      for (let n = 0; n < 12 && touches(ink, s.d, dy); n++) dy += dir * 0.12 * PX;
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'vc-swash');
      g.dataset.name = s.name;
      if (dy) g.setAttribute('transform', `translate(0 ${dy.toFixed(1)})`);
      g.dataset.dy = dy.toFixed(1);
      // three strokes: broad, a narrower one a hair off and trimmed, a hairline a little longer
      const widths = [0.11, 0.055, 0.022].map(c => c * PX);
      const offs = [[0, 0], [0.035 * PX, 0.03 * PX], [-0.02 * PX, -0.025 * PX]];
      const paths = widths.map((w, k) => {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', s.d);
        p.setAttribute('stroke-width', w.toFixed(2));
        if (k) p.setAttribute('transform', `translate(${offs[k][0].toFixed(2)} ${offs[k][1].toFixed(2)})`);
        p.setAttribute('pathLength', '1');
        p.setAttribute('class', `vc-swash-stroke vc-swash-stroke--${k}`);
        p.style.strokeDasharray = '0 1';
        g.append(p);
        return p;
      });
      svg.append(g);
      const len = paths.map(p => { try { return p.getTotalLength(); } catch { return 1; } });
      // each flourish on its own phase: start somewhere inside its first cycle
      const hold = range(MS.swashHoldMinMs, MS.swashHoldMaxMs), rest = range(MS.swashRestMinMs, MS.swashRestMaxMs);
      const end = MS.swashDrawMs + hold + MS.swashEraseMs + rest;
      // the pen-tip track sampled once here (WP-17 item 22's long paths made a per-frame getPointAtLength cost ~0.5 ms)
      const N = 160, pts = new Float32Array((N + 1) * 2);
      for (let k = 0; k <= N; k++) { let q; try { q = paths[0].getPointAtLength(len[0] * k / N); } catch { q = { x: 0, y: 0 }; } pts[k * 2] = q.x; pts[k * 2 + 1] = q.y; }
      flourishes.push({ g, paths, len, main: paths[0], t: range(0, end), hold, rest, drawing: false, end, name: s.name, drop: null, pts });
    }
  }

  /** Show the stretch [from, to] (0–1) of a stroke, trimmed for the narrower companions. @param {SVGPathElement} p @param {number} k @param {number} from @param {number} to */
  function show(p, k, from, to) {
    const trim = k === 1 ? 0.07 : 0;
    const a = Math.min(1, from + trim), b = Math.max(a, (k === 2 ? to : to - trim));
    const v = b - a > 1e-4 ? `0 ${a.toFixed(4)} ${(b - a).toFixed(4)} 2` : '0 2';
    // write only on change: during hold and rest nothing moves, and each write restyles #print
    if (/** @type {any} */ (p).__vcDash !== v) { /** @type {any} */ (p).__vcDash = v; p.style.strokeDasharray = v; }
  }

  // the pen-tip glint in #glow
  /** @type {{x: number, y: number}[]} */
  let tips = [];
  /** @param {CanvasRenderingContext2D} ctx */
  const glint = ctx => {
    if (!o.project) return;
    for (const tp of tips) {
      const c = o.project(tp.x, tp.y, 0), e = o.project(tp.x + MS.swashGlintCm, tp.y, 0);
      const r = Math.max(2, Math.abs(e.x - c.x));
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
      g.addColorStop(0, `rgba(255, 196, 120, ${MS.swashGlintStrength})`);
      g.addColorStop(1, 'rgba(255, 170, 90, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
    }
  };
  /** @type {null | (() => void)} */
  let glintOff = null;

  /** The masthead's origin in the inset sheet (px, through the main section's scroll). WP-18P: read
   * once per layout change, not every frame (each read after the strokes' style writes forced a
   * restyle: 850 forced recalcs in one view change). */
  const headerOrigin = () => cached(header, () => {
    let X = 0, Y = 0;
    for (let p = /** @type {HTMLElement|null} */ (header); p && !p.classList.contains('vc-sheet-inset'); p = /** @type {HTMLElement|null} */ (p.offsetParent)) {
      X += p.offsetLeft; Y += p.offsetTop;
      const op = /** @type {HTMLElement|null} */ (p.offsetParent);
      if (op && !op.classList.contains('vc-sheet-inset')) { X -= op.scrollLeft; Y -= op.scrollTop; }
    }
    return { X, Y };
  });
  /** masthead px → paper cm (through the main section's scroll). @param {number} x @param {number} y */
  const toCm = (x, y) => {
    const { X, Y } = headerOrigin();
    return { x: LI.x0 + (X + x) / PX, y: LI.y1 - (Y + y) / PX };
  };

  /** A point along a flourish's sampled track, u 0…1. @param {Flourish} fl @param {number} u */
  const trackAt = (fl, u) => {
    const n = fl.pts.length / 2 - 1, f = Math.max(0, Math.min(1, u)) * n, i = Math.min(n - 1, Math.floor(f)), k = f - i;
    return { x: fl.pts[i * 2] + (fl.pts[i * 2 + 2] - fl.pts[i * 2]) * k, y: fl.pts[i * 2 + 1] + (fl.pts[i * 2 + 3] - fl.pts[i * 2 + 1]) * k };
  };

  o.onPhase('physics', dt => {
    if (!ink || !flourishes.length) return;
    const nowTips = [];
    nextDrop -= dt;
    for (const [i, fl] of flourishes.entries()) {
      fl.t += dt;
      if (fl.t >= fl.end) {
        fl.t -= fl.end;
        fl.hold = range(MS.swashHoldMinMs, MS.swashHoldMaxMs); fl.rest = range(MS.swashRestMinMs, MS.swashRestMaxMs);
        fl.end = MS.swashDrawMs + fl.hold + MS.swashEraseMs + fl.rest;
      }
      const c = swashCycle(fl.t, { hold: fl.hold, rest: fl.rest });
      fl.paths.forEach((p, k) => show(p, k, c.from, c.drawn));
      const drawing = c.phase === 'draw';
      if (drawing && !fl.drawing) emit('title:stroke', { i, name: fl.name });
      fl.drawing = drawing;
      if (drawing && c.drawn > 0.01 && c.drawn < 0.995) {
        let pt;
        pt = trackAt(fl, c.drawn);
        if (pt) nowTips.push(toCm(pt.x, pt.y + +(fl.g.dataset.dy || 0)));
      }
      // the droplet
      if (nextDrop <= 0 && c.phase === 'hold' && !fl.drop) {
        nextDrop = MS.swashDropletEveryMs * range(0.8, 1.2);
        let pt;
        pt = trackAt(fl, 1);
        if (pt) {
          const el = document.createElementNS(NS, 'circle');
          el.setAttribute('class', 'vc-swash-drop');
          el.setAttribute('cx', pt.x.toFixed(1)); el.setAttribute('cy', (pt.y + 0.06 * PX).toFixed(1)); el.setAttribute('r', '0');
          fl.g.append(el);
          fl.drop = { el, t: 0, x: pt.x, y: pt.y };
        }
      }
      if (fl.drop) {
        fl.drop.t += dt;
        const u = Math.min(1, fl.drop.t / MS.swashDropletMs);
        const e = 1 - Math.pow(1 - u, 3);
        fl.drop.el.setAttribute('r', (MS.swashDropletCm * PX * e).toFixed(2));
        // it soaks in and fades with the erase that follows
        const fade = c.phase === 'erase' ? 1 - c.from : c.phase === 'rest' ? 0 : 1;
        fl.drop.el.style.opacity = (0.85 * fade).toFixed(3);
        if (c.phase === 'rest') { fl.drop.el.remove(); fl.drop = null; }
      }
    }
    tips = nowTips;
    if (tips.length && !glintOff && o.glow) glintOff = o.glow.hooks.addSheen(glint);
    else if (!tips.length && glintOff) { glintOff(); glintOff = null; }
  });

  // the byline writes itself in on save load
  on('app:load', d => {
    if (!d?.ok) return;
    profile.classList.remove('vc-writing');
    void profile.offsetWidth;
    profile.classList.add('vc-writing');
    setTimeout(() => profile.classList.remove('vc-writing'), MS.bylineRevealMs + 50);
  });

  build();
  document.fonts?.ready.then(build);

  return {
    svg,
    rebuild: build,
    /** For the report's screenshots: put every flourish just into its hold (fully drawn). */
    holdAll() { for (const fl of flourishes) fl.t = MS.swashDrawMs + 1; },
    /** For the acceptance check: ink box, flourish boxes (header px), their phases, and any overlap with the letters. */
    read() {
      return {
        ink,
        flourishes: flourishes.map(fl => {
          let bb = null;
          try { const b = fl.main.getBBox(); bb = { x: +b.x.toFixed(1), y: +(b.y + +(fl.g.dataset.dy || 0)).toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; } catch { /* not rendered */ }
          return { name: fl.name, t: Math.round(fl.t), end: Math.round(fl.end), phase: swashCycle(fl.t, { hold: fl.hold, rest: fl.rest }).phase, dy: +(fl.g.dataset.dy || 0), box: bb, touches: ink ? touches(ink, fl.main.getAttribute('d') || '', +(fl.g.dataset.dy || 0)) : null, strokes: fl.paths.length };
        }),
      };
    },
  };
}
