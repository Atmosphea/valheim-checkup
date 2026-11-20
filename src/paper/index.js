// @ts-check
/**
 * WP-07: the paper layer. Every original text and control moves onto the two sheets.
 *
 *   Main sheet (one CSS3D object over the whole 96 × 54 cm sheet)
 *     header.top            the title area, which is also the favourite drop zone (P05):
 *                           .brand (the title, WP-11 animates it), #headerProfile (byline),
 *                           #statline (lifetime records), #favorites (tags on the top edge)
 *     details.help          the help note at the foot of the sheet; its body opens upward
 *     .resources, .footer   the footer lines
 *   Inset sheet (one CSS3D object over the 58 × 39 cm collection sheet)
 *     main.workspace        #dropzone, #message, #collectionView, #insightsView, #mobileCategory
 *
 * Elements keep their ids, classes and attributes (DECISIONS 26); only parents and styles
 * change (the help letter's body opens upward through `::details-content`, no wrapper).
 * Styles: src/styles/desk.css (scoped to body.mode-desk #print).
 *
 * Also here: the printed controls' press spring (file 04), the hero and message placement
 * ("where the stamps go" / "under the stamps"), the paper bristle, the veil glow path and the
 * spark light pool (glow.js).
 */
import '../styles/desk.css';
import { inset as LI, sheet as LS, coins as LC } from '../config/layout.js';
import { attachStartHere } from '../surfaces/start-here.js';
import { RECTS } from './layout.js';
import { print as PR, ink as INK } from '../config/render.js';
import { printed as MPr } from '../config/motion.js';
import { Spring } from '../util/spring.js';
import { createBristle } from './bristle.js';
import { createGlow } from './glow.js';

const PX = PR.pxPerCm;


/**
 * @param {object} ctx
 * @param {(el: HTMLElement, rect: {x0: number, y0: number, w: number, h: number, z?: number}) => any} ctx.addPrinted
 * @param {(phase: string, fn: (dt: number, t: number) => void) => () => void} ctx.onPhase
 * @param {any} ctx.parts     layer 1 placeholders (papers)
 * @param {any} ctx.veil
 * @param {any} ctx.overlays
 * @param {(x: number, y: number, z?: number) => {x: number, y: number}} ctx.project
 * @param {{ version: number }} ctx.rig
 * @param {() => void} ctx.printDirty
 * @param {() => any} ctx.tier       current tier settings
 * @param {{ next(): number }} ctx.rng
 * @param {any} [ctx.board]
 * @param {any} ctx.camera
 * @param {any} ctx.renderer   layer 1 renderer (the paper tone is sampled from its canvas)
 * @param {() => boolean} ctx.isLit  the desk has finished warming up
 * @param {() => void} ctx.attach   render the CSS3D layer now, so the sheets are in the document
 */
export function createPaper(ctx) {
  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const q = (/** @type {string} */ s) => /** @type {HTMLElement|null} */ (document.querySelector(s));
  const cmPx = (/** @type {number} */ cm) => `${(cm * PX).toFixed(2)}px`;

  /** Position `el` absolutely at paper rect `r`, relative to its parent's paper rect `p`. */
  const place = (/** @type {HTMLElement|null} */ el, /** @type {{x0:number,x1:number,y0:number,y1:number}} */ r, /** @type {{x0:number,y1:number}} */ p) => {
    if (!el) return;
    Object.assign(el.style, { position: 'absolute', left: cmPx(r.x0 - p.x0), top: cmPx(p.y1 - r.y1), width: cmPx(r.x1 - r.x0), height: cmPx(r.y1 - r.y0) });
  };

  // Headings and stamps: rough ink edges (file 05: feTurbulence 0.9, feDisplacementMap 0.6)
  if (!document.getElementById('vc-ink-rough')) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.innerHTML = `<filter id="vc-ink-rough" x="-2%" y="-5%" width="104%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="${INK.roughTurbulence}" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${INK.roughDisplacement}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
    document.body.append(svg);
  }

  // Every element is looked up before anything moves: the sheets join the document only when
  // CSS3D first renders them (ctx.attach does that straight away).
  const hero = $('dropzone'), message = $('message'), metrics = $('metrics'), track = $('mainTrack');
  const collection = $('collectionView'), insights = $('insightsView');
  const notice = $('collectionNotice'), description = $('description');

  // ── Main sheet ──────────────────────────────────────────────────────────────────────────
  // Two CSS3D objects on the main sheet, so the tab order can follow reading order
  // (DECISIONS 27): the title area (tags) comes before the board, the help letter and the footer
  // after the inset sheet. Each object only covers its own part of the sheet.
  /** @param {string} cls @param {{x0:number,x1:number,y0:number,y1:number}} r @param {number} z */
  const sheetPart = (cls, r, z) => {
    const el = document.createElement('div');
    el.className = `vc-sheet ${cls}`;
    return { el, rect: r, obj: () => ctx.addPrinted(el, { x0: r.x0, y0: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, z }) };
  };
  const top = sheetPart('vc-sheet-main vc-sheet-title', RECTS.header, 0);
  const main = top.el;
  const header = /** @type {HTMLElement} */ (q('header.top'));
  header.classList.add('vc-titlearea');
  main.append(header);
  Object.assign(header.style, { position: 'absolute', inset: '0' });
  const inHeader = (/** @type {string} */ s) => /** @type {HTMLElement|null} */ (header.querySelector(s));
  place(inHeader('#favorites'), RECTS.favorites, RECTS.header);
  // Paul, WP-17 item 4: "Valheim Checkup", the byline and the lifetime records are part of the main
  // section now, just above the table, and scroll with it (surfaces/lift.js seats the masthead)
  const mast = document.createElement('div');
  mast.className = 'vc-masthead';
  for (const s of ['.brand', '#headerProfile', '#statline']) { const el = inHeader(s); if (el) mast.append(el); }
  // the header stays the favourite drop zone (app.js listens there): drops on the masthead go to it
  for (const type of ['dragover', 'dragleave', 'drop']) mast.addEventListener(type, e => {
    const fwd = new DragEvent(type, { bubbles: false, cancelable: true, dataTransfer: e.dataTransfer, relatedTarget: type === 'dragleave' ? header : null, clientX: e.clientX, clientY: e.clientY });
    header.dispatchEvent(fwd);
    if (fwd.defaultPrevented) e.preventDefault();
  });
  new MutationObserver(() => mast.classList.toggle('favorite-drop', header.classList.contains('favorite-drop'))).observe(header, { attributes: true, attributeFilter: ['class'] });
  const mainObj = top.obj();

  const foot = sheetPart('vc-sheet-main vc-sheet-foot', RECTS.foot, 0);
  // WP-14 (axe "region"): the help letter, resources and footer lines left <main> for their own
  // sheet; that sheet is the page's foot, so it is the contentinfo landmark
  foot.el.setAttribute('role', 'contentinfo');
  const help = /** @type {HTMLDetailsElement} */ (q('details.help'));
  // Paul, WP-16 item 22: the help letter lies top right, under the coins, on its own strip of the
  // main sheet (a complementary landmark; in the tab order it still comes after the inset sheet)
  // Paul, WP-17 item 4: on the coins' fixed level, above the main section that scrolls under it
  const helpPart = sheetPart('vc-sheet-main vc-sheet-help', RECTS.helpStrip, LI.z + 0.12);
  helpPart.el.setAttribute('role', 'complementary');
  helpPart.el.setAttribute('aria-label', help.querySelector('summary')?.textContent?.trim() || 'Help');
  helpPart.el.append(help);
  place(help, RECTS.help, RECTS.helpStrip);
  // While the letter is open it lies over the board: the board's invisible proxies must not take its clicks.
  const syncHelp = () => { document.body.classList.toggle('vc-help-open', help.open); ctx.printDirty(); };
  help.addEventListener('toggle', syncHelp);
  const resources = q('p.resources'), footer = q('.footer');
  if (resources) { foot.el.append(resources); place(resources, RECTS.resources, RECTS.foot); }
  if (footer) { foot.el.append(footer); place(footer, RECTS.footer, RECTS.foot); }

  // ── Inset sheet ─────────────────────────────────────────────────────────────────────────
  const inset = document.createElement('div');
  inset.className = 'vc-sheet vc-sheet-inset';
  const workspace = /** @type {HTMLElement} */ (q('main.workspace'));
  inset.append(workspace);
  workspace.prepend(mast);
  const insetObj = ctx.addPrinted(inset, { x0: LI.x0, y0: LI.y0, w: LI.x1 - LI.x0, h: LI.y1 - LI.y0, z: LI.z });
  const footObj = foot.obj();
  const helpObj = helpPart.obj();
  // Paul, WP-18 item 10: "start here" round the How-to coin while no save is loaded
  const startHere = attachStartHere({ addPrinted: ctx.addPrinted, z: LI.z + 0.12 });
  // the original .layout grid is empty now; keep it out of the page's height
  q('body > .layout')?.classList.add('vc-emptied');

  // Tab order = DOM order inside the CSS3D camera element: coins, title area (tags), board, inset
  // sheet, help letter and footer, then the Sound coin last (DECISIONS 27).
  ctx.attach();
  const cam = /** @type {HTMLElement} */ (main.parentElement);
  const boardEl = cam.querySelector(':scope > .vc-board-print');
  const soundEl = cam.querySelector(':scope > .vc-coin-print[data-coin="sound"]');
  if (boardEl) cam.insertBefore(main, boardEl);
  if (soundEl) { cam.insertBefore(inset, soundEl); cam.insertBefore(helpPart.el, soundEl); cam.insertBefore(foot.el, soundEl); }

  // ── The hero "where the stamps go" and the message "under the stamps" ──────────────────
  // WP-14 (JS per frame): app.js hides the hero, the message and the views only with the `hidden`
  // class, so the class is read instead of getComputedStyle (which forced a full style recalc,
  // ~60 ms, right after every re-render of the table)
  const shown = (/** @type {HTMLElement} */ el) => !el.classList.contains('hidden') && !el.hidden && el.style.display !== 'none';
  /** Layout top of `el` inside the workspace (WP-11 wraps the stamps in the header slip). @param {HTMLElement} el */
  const topIn = el => { let y = 0; for (let p = /** @type {HTMLElement|null} */ (el); p && p !== workspace; p = /** @type {HTMLElement|null} */ (p.offsetParent)) y += p.offsetTop; return y; };
  let slotting = false;
  /** @type {HTMLElement|null} */
  let pushed = null;
  function slot() {
    if (slotting) return;
    slotting = true;
    try {
      metrics.style.marginTop = ''; track.style.marginBottom = ''; insights.style.paddingBottom = '';
      if (pushed) { pushed.style.marginTop = ''; pushed = null; }
      // Paul, WP-16 item 21: the hero block is not shown any more (CSS); `vc-nosave` still marks the no-save page
      const noSave = shown(hero), heroOn = false, msgOn = shown(message) && message.childNodes.length > 0 && message.textContent?.trim() !== '';
      const inCollection = shown(collection);
      workspace.classList.toggle('vc-nosave', noSave);
      const gap = 0.5 * PX;
      if (inCollection) {
        if (heroOn) {
          hero.style.top = `${topIn(metrics)}px`;
          metrics.style.marginTop = `${hero.offsetHeight + gap}px`;
        }
        // Paul, WP-17 item 4: in the collection view the message is in the scroll, under the track
        if (msgOn && message.parentElement === workspace) {
          message.style.top = `${topIn(track) + track.offsetHeight + gap}px`;
          track.style.marginBottom = `${message.offsetHeight + 2 * gap}px`;
        }
      } else {
        const intro = /** @type {HTMLElement|null} */ (insights.querySelector('.insight-intro'));
        let y = intro ? insights.offsetTop + intro.offsetTop + intro.offsetHeight + gap : insights.offsetTop;
        let pad = 0;
        if (heroOn) { hero.style.top = `${y}px`; y += hero.offsetHeight + gap; pad += hero.offsetHeight + gap; }
        if (msgOn) { message.style.top = `${y + (mast && mast.parentElement === workspace ? mast.offsetHeight : 0)}px`; pad += message.offsetHeight + gap; }
        // push the insight content below them: padding on the view, under its intro
        if (pad && intro && intro.nextElementSibling) { pushed = /** @type {HTMLElement} */ (intro.nextElementSibling); pushed.style.marginTop = `${pad}px`; }
        else if (pad) insights.style.paddingBottom = `${pad}px`;
      }
    } finally { slotting = false; }
    ctx.printDirty();
  }
  const mo = new MutationObserver(() => slot());
  for (const el of [hero, message, collection, insights, metrics, notice, description]) mo.observe(el, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: el === message || el === insights });
  slot();
  document.fonts?.ready.then(slot);

  // ── Printed controls: hover (CSS), press into the paper with a spring on release ────────
  const PRESSABLE = 'button, select, summary, input[type="checkbox"], .filterbar label, a';
  /** @type {Map<HTMLElement, Spring>} */
  const pressing = new Map();
  /** @type {HTMLElement|null} */
  let held = null;
  const setPress = (/** @type {HTMLElement} */ el, /** @type {number} */ v) => {
    el.style.setProperty('--vc-press', v.toFixed(3));
  };
  const onDown = (/** @type {PointerEvent} */ e) => {
    if (e.button !== 0) return;
    const el = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest?.(PRESSABLE));
    if (!el || /** @type {any} */ (el).disabled || !(main.contains(el) || foot.el.contains(el) || inset.contains(el) || helpPart.el.contains(el))) return;
    held = el;
    pressing.delete(el);
    setPress(el, 1);
    el.classList.add('vc-pressed');
  };
  const onUp = () => {
    if (!held) return;
    const el = held; held = null;
    el.classList.remove('vc-pressed');
    pressing.set(el, new Spring({ ...MPr.pressReleaseSpring, value: 1, target: 0 }));
  };
  for (const s of [main, foot.el, inset, helpPart.el]) s.addEventListener('pointerdown', onDown);
  addEventListener('pointerup', onUp, true);
  addEventListener('pointercancel', onUp, true);
  addEventListener('blur', onUp);

  // ── Paper bristle and the glow layer ────────────────────────────────────────────────────
  const bristle = createBristle({ parts: ctx.parts, veil: ctx.veil, tier: ctx.tier });
  const glow = createGlow({ overlays: ctx.overlays, project: ctx.project, veil: ctx.veil, camera: ctx.camera, rng: ctx.rng });

  // The inset sheet casts a shadow on the main sheet only while it is lifted (WP-11 lifts it on scroll).
  let insetCasts = false;
  ctx.onPhase('physics', dt => {
    for (const [el, s] of pressing) {
      s.step(dt);
      setPress(el, s.value);
      if (s.settled(1e-3)) { pressing.delete(el); el.style.removeProperty('--vc-press'); }
    }
    bristle.update(dt);
    // the printed inset follows its paper when the sheet dips or lifts as a whole
    const z = ctx.parts.inset.position.z + 0.005;
    if (Math.abs(insetObj.position.z - z) > 0.004) { insetObj.position.z = z; ctx.printDirty(); }
    const lift = ctx.board?.state?.().paper?.inset?.maxLift ?? 0;
    const lifted = ctx.parts.inset.position.z - LI.z > 0.05 || lift > 0.05;
    if (lifted !== insetCasts) { insetCasts = lifted; ctx.veil.setPaperCasts?.('sheet-inset', lifted); }
  });
  // WP-14: the excess-light readback runs at the end of the scene phase, right before the stage's
  // veil pass, which then restores the veil canvas (one veil render fewer on those frames); when
  // the stage skips its veil pass this frame (software renderer), the readback restores it itself
  ctx.onPhase('scene', (_dt, t) => glow.afterVeil(ctx.rig.version, t, !(ctx.willDrawVeil?.() ?? false)));

  // The few printed things with an opaque backing (the sticky table header, tags, the help letter)
  // use the paper's own colour as layer 1 shows it there, sampled from the rendered scene once
  // the desk is lit, so the veil lights backing and paper alike.
  let toneDue = true;
  const probe = document.createElement('canvas');
  probe.width = probe.height = 8;
  const pc = /** @type {CanvasRenderingContext2D} */ (probe.getContext('2d', { willReadFrequently: true }));
  /** @type {Record<string, string>} */
  const tones = {};
  ctx.onPhase('scene', () => {
    if (!toneDue || !ctx.isLit()) return;
    toneDue = false;
    const src = ctx.renderer.domElement, k = src.width / Math.max(1, innerWidth);
    /** @param {HTMLElement} el @param {number} x @param {number} y */
    const sample = (el, x, y) => {
      const p = ctx.project(x, y, 0);
      pc.drawImage(src, Math.round(p.x * k) - 4, Math.round(p.y * k) - 4, 8, 8, 0, 0, 8, 8);
      const d = pc.getImageData(0, 0, 8, 8).data;
      const r = [], g = [], b = [];
      for (let i = 0; i < d.length; i += 4) { r.push(d[i]); g.push(d[i + 1]); b.push(d[i + 2]); }
      const med = (/** @type {number[]} */ a) => a.sort((u, v) => u - v)[a.length >> 1];
      const tone = `rgb(${med(r)}, ${med(g)}, ${med(b)})`;
      el.style.setProperty('--vc-paper-tone', tone);
      return tone;
    };
    // the table header sits about 13 cm below the inset's top; the main sheet's tone next to the help note
    tones.inset = sample(inset, (LI.x0 + LI.x1) / 2, LI.y1 - 13.5);
    // bare main sheet between the woodblock and the inset sheet (Paul, WP-16 item 22 moved the help note)
    tones.main = sample(main, -18, 5);
    foot.el.style.setProperty('--vc-paper-tone', tones.main);
    helpPart.el.style.setProperty('--vc-paper-tone', tones.main);
  });
  addEventListener('resize', () => { slot(); glow.invalidate(); toneDue = true; });

  /** Not drawn: screen-reader-only text, and the body of a closed details (its summary is drawn). @param {HTMLElement} h */
  const shownNot = h => !!h.closest('.visually-hidden') || [...ancestors(h)].some(d => d.tagName === 'DETAILS' && !(/** @type {HTMLDetailsElement} */ (d)).open && !h.closest('summary'));
  /** @param {HTMLElement} h */
  function* ancestors(h) { for (let p = h.parentElement; p; p = p.parentElement) yield p; }
  /** Position inside a sheet in layout px (untransformed). @param {HTMLElement} h @param {HTMLElement} sheet */
  const layoutPos = (h, sheet) => {
    let x = 0, y = 0;
    for (let p = /** @type {HTMLElement|null} */ (h); p && p !== sheet; p = /** @type {HTMLElement|null} */ (p.offsetParent)) {
      const op = /** @type {HTMLElement|null} */ (p.offsetParent);
      x += p.offsetLeft - (op && op !== sheet ? op.scrollLeft : 0);
      y += p.offsetTop - (op && op !== sheet ? op.scrollTop : 0);
    }
    return { x, y };
  };

  // ── Paul, WP-17 item 5: the scroll passes under the paper's burned top edge ─────────────────
  // The text can't go under layer 1's paper (the printed layer is drawn over it), so it fades out
  // along the edge's own shape, inside the dark burned band: the mask is read from the paper's
  // deckle (the alpha of the paper normal the textures hand to the veil), column by column.
  /** @type {{ url: string, cols: number[] } | null} */
  let edge = null;
  const EDGE = { pxPerCm: 8, inCm: 0.7, fadeCm: 1.1 };
  /** @param {ImageBitmap | null} bmp */
  function setEdge(bmp) {
    try {
      if (!bmp) return;
      const w = Math.min(1536, bmp.width), h = Math.round(bmp.height * w / bmp.width);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: true }));
      g.drawImage(bmp, 0, 0, w, h);
      const sw = LS.x1 - LS.x0, sh = LS.y1 - LS.y0;
      // the bitmap comes from a WebGL read: its first row is the sheet's bottom edge
      const r0 = Math.floor((LI.y1 - 6 - LS.y0) / sh * h), x0 = Math.floor((LI.x0 - LS.x0) / sw * w), x1 = Math.ceil((LI.x1 - LS.x0) / sw * w);
      const d = g.getImageData(x0, r0, x1 - x0, h - r0).data, rows = h - r0, cols = x1 - x0;
      /** The sheet's top edge (cm) per column: the first fully opaque paper below the deckle. */
      const top = [];
      for (let i = 0; i < cols; i++) {
        let row = rows - 1;
        while (row > 0 && d[(row * cols + i) * 4 + 3] < 250) row--;
        top.push(LS.y0 + (r0 + row + 0.5) / h * sh);
      }
      // the mask over the whole inset sheet, 8 px per cm: hidden above (edge − in), clear below (edge − in − fade)
      const W = Math.round((LI.x1 - LI.x0) * EDGE.pxPerCm), H = Math.round((LI.y1 - LI.y0) * EDGE.pxPerCm);
      const m = document.createElement('canvas'); m.width = W; m.height = H;
      const mg = /** @type {CanvasRenderingContext2D} */ (m.getContext('2d'));
      const img = mg.createImageData(W, H);
      for (let x = 0; x < W; x++) {
        // smooth the edge over ~1 cm so the fade follows its shape, not its fibres
        const fx = x / W * cols, k0 = Math.max(0, Math.floor(fx - cols / (LI.x1 - LI.x0) * 0.5)), k1 = Math.min(cols - 1, Math.ceil(fx + cols / (LI.x1 - LI.x0) * 0.5));
        let e = Infinity; for (let k = k0; k <= k1; k++) e = Math.min(e, top[k]);
        const hide = e - EDGE.inCm, clear = hide - EDGE.fadeCm;
        for (let y = 0; y < H; y++) {
          const cm = LI.y1 - (y + 0.5) / EDGE.pxPerCm;
          const a = cm >= hide ? 0 : cm <= clear ? 1 : (hide - cm) / EDGE.fadeCm;
          img.data[(y * W + x) * 4 + 3] = Math.round(255 * a * a * (3 - 2 * a));
        }
      }
      mg.putImageData(img, 0, 0);
      // the coins and the help strip are on their own level above the main section: the scroll
      // passes under them, so they are cut out of the mask (a soft 0.3 cm rim)
      mg.globalCompositeOperation = 'destination-out';
      const P = EDGE.pxPerCm, cx = (/** @type {number} */ x) => (x - LI.x0) * P, cy = (/** @type {number} */ y) => (LI.y1 - y) * P;
      for (const c of LC) {
        const r = (c.r + 0.25) * P, grad = mg.createRadialGradient(cx(c.x), cy(c.y), r - 0.3 * P, cx(c.x), cy(c.y), r);
        grad.addColorStop(0, '#000'); grad.addColorStop(1, 'rgba(0,0,0,0)');
        mg.fillStyle = grad; mg.beginPath(); mg.arc(cx(c.x), cy(c.y), r, 0, Math.PI * 2); mg.fill();
      }
      const hs = RECTS.helpStrip;
      mg.fillStyle = '#000'; mg.fillRect(cx(hs.x0) - 0.1 * P, cy(hs.y1) - 0.1 * P, (hs.x1 - hs.x0 + 0.2) * P, (hs.y1 - hs.y0 + 0.2) * P);
      mg.globalCompositeOperation = 'source-over';
      m.toBlob(b => {
        if (!b) return;
        edge = { url: URL.createObjectURL(b), cols: top };
        inset.style.setProperty('--vc-edge-mask', `url(${edge.url})`);
        inset.classList.add('vc-edged');
        placeEdge();
      });
    } catch (e) { console.warn('edge mask unavailable; the scroll is cut at the sheet', e); }
  }
  /** Each scroller's mask is the one inset-wide picture, shifted to the scroller's own place. */
  function placeEdge() {
    for (const el of /** @type {HTMLElement[]} */ ([...inset.querySelectorAll('.tablewrap, #insightsView')])) {
      const { x, y } = layoutPos(el, inset);
      el.style.setProperty('--vc-edge-pos', `${(-x).toFixed(1)}px ${(-y).toFixed(1)}px`);
    }
  }
  addEventListener('resize', () => placeEdge());
  { const mo = new MutationObserver(() => placeEdge()); for (const el of [collection, insights]) mo.observe(el, { attributes: true, attributeFilter: ['class'] }); }

  /** For tests and the WP-07 self-check. */
  const api = {
    sheets: { main, foot: foot.el, inset, help: helpPart.el },
    objects: { main: mainObj, foot: footObj, inset: insetObj, help: helpObj },
    rects: RECTS,
    /** Paul, WP-18 item 10 */
    startHere,
    slot,
    setEdge,
    /** Paul, WP-17 item 5: the edge read from the deckle (cm per inset column) and the fade. */
    edge: () => (edge ? { cols: edge.cols.length, min: Math.min(...edge.cols), max: Math.max(...edge.cols), ...EDGE } : null),
    tones: () => ({ ...tones }),
    resampleTone() { toneDue = true; },
    bristle,
    glow,
    /** Every printed text box that spills outside its sheet or overflows sideways (acceptance item 2). */
    audit() {
      const out = /** @type {{what: string, el: string, text: string}[]} */ ([]);
      const name = (/** @type {Element} */ el) => el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter(Boolean).join('.') : '');
      for (const sheet of [main, foot.el, inset, helpPart.el]) {
        const sr = { w: sheet.offsetWidth, h: sheet.offsetHeight };
        for (const el of sheet.querySelectorAll('*')) {
          const h = /** @type {HTMLElement} */ (el);
          if (!h.offsetParent && getComputedStyle(h).position !== 'fixed') continue;
          if (shownNot(h)) continue;
          if (h.closest('.tablewrap') && h !== h.closest('.tablewrap')) continue; // the table scrolls vertically by design
          if (h.closest('#insightsView') && h !== insights) continue;            // so does the insight page
          if (h.scrollWidth > h.clientWidth + 1 && getComputedStyle(h).overflowX !== 'visible' && !['SELECT', 'INPUT', 'TEXTAREA'].includes(h.tagName)) out.push({ what: 'overflow-x', el: name(h), text: (h.textContent || '').trim().slice(0, 40) });
          const { x, y } = layoutPos(h, sheet);
          if (h.offsetWidth && (x < -1 || x + h.offsetWidth > sr.w + 1)) out.push({ what: 'outside-x', el: name(h), text: (h.textContent || '').trim().slice(0, 40) });
          if (h.offsetHeight && !h.closest('details.help') && (y < -1 || y + h.offsetHeight > sr.h + 1)) out.push({ what: 'outside-y', el: name(h), text: (h.textContent || '').trim().slice(0, 40) });
        }
      }
      return out;
    },
    /** Pairs of text boxes that overlap inside the same sheet (siblings with text; acceptance item 2). */
    overlaps() {
      const boxes = [];
      for (const sheet of [main, foot.el, inset, helpPart.el]) {
        const els = [...sheet.querySelectorAll('h1, h2, p, span, strong, b, small, label, button, select, input, a, summary, th, .eyebrow, .item-name, .sub, .status')]
          .filter(el => /** @type {HTMLElement} */ (el).offsetParent && !shownNot(/** @type {HTMLElement} */ (el)) && !el.closest('.tablewrap tbody') && !el.closest('#insightsView .insight-grid, #insightsView .champions, #insightsView .skills-grid') && el.getClientRects().length);
        for (const el of els) {
          // compared in the sheet's own layout px: on screen the sheet is in perspective, and the
          // screen bounding boxes of neighbouring words on a tilted sheet overlap where the words don't
          const h = /** @type {HTMLElement} */ (el), { x, y } = layoutPos(h, sheet);
          const w = h.offsetWidth, hh = h.offsetHeight;
          if (w < 2 || hh < 2) continue;
          boxes.push({ el, sheet, r: { left: x, top: y, right: x + w, bottom: y + hh } });
        }
      }
      const out = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.sheet !== b.sheet || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ix > 2 && iy > 2) out.push(`${a.el.tagName}${a.el.id ? '#' + a.el.id : ''}「${(a.el.textContent || '').trim().slice(0, 24)}」 × ${b.el.tagName}${b.el.id ? '#' + b.el.id : ''}「${(b.el.textContent || '').trim().slice(0, 24)}」`);
      }
      return out;
    },
  };
  return api;
}
