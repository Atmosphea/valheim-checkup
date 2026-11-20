// @ts-check
/**
 * Engraving maps (WP-05 step 3). Text is drawn white on black on a 2D canvas atlas
 * (2,048 px, IM Fell English by default), blurred 1 px for a bevel (in the shader), then turned on the GPU into
 * a normal map (RGB) with the cavity mask in alpha. Used for bar names, coin legends, plaque
 * digits and the carved headings and side note on the board.
 *
 * Every engraved string is listed by slot id in `__vc.engraved()` (DECISIONS point 12), so tests
 * can compare the board's text with the proxies' accessible names.
 */
import * as THREE from 'three';
import { materials as M, fonts as F, textures as T } from '../../config/render.js';

/**
 * @typedef {object} EngraveEntry
 * @property {string} id                 slot id, e.g. "bar:The Artisan", "coin:load"
 * @property {string} text
 * @property {'body'|'smallCaps'|'title'} [font]
 * @property {number} [px]               font size in atlas pixels
 * @property {'line'|'arc'} [shape]      'arc' = around the top of a circle (coin legends)
 * @property {number} [arcRadiusPx]
 * @property {number} [wrapPx]           wrap a long line into several at this width
 * @property {number} [w]                 WP-06: custom drawing, its box in atlas px (with `draw`)
 * @property {number} [h]
 * @property {(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, kit: DrawKit) => void} [draw]
 *                                        WP-06: draws white-on-black into the box (composite faces)
 * @property {Record<string, string>} [texts]  WP-06: strings a composite carries, listed in __vc.engraved()
 */

/**
 * WP-06 helpers handed to custom `draw` entries.
 * @typedef {object} DrawKit
 * @property {(kind: EngraveEntry['font'], px: number) => string} font     CSS font for a face at px
 * @property {(kind: EngraveEntry['font'], capPx: number) => number} pxForCap  font px whose capital H is capPx tall
 * @property {(text: string, cx: number, cy: number, R: number, px: number, startDeg?: number) => void} arc  letters around a circle
 * @property {(text: string, max: number) => string[]} wrap
 */

/** @typedef {{ id: string, text: string, rect: THREE.Vector4, aspect: number }} EngraveSlot */

const NORMAL = /* glsl */ `
uniform sampler2D uText;
uniform float uStrength;
uniform float uBlur;
// the 1 px bevel blur happens here (a CPU canvas blur of 2,048 px is slow); 3 × 3 Gaussian
float ink(vec2 uv) {
  vec2 t = uBlur / uRes;
  float s = texture2D(uText, uv).r * 4.0;
  s += (texture2D(uText, uv + vec2(t.x, 0.0)).r + texture2D(uText, uv - vec2(t.x, 0.0)).r
      + texture2D(uText, uv + vec2(0.0, t.y)).r + texture2D(uText, uv - vec2(0.0, t.y)).r) * 2.0;
  s += texture2D(uText, uv + t).r + texture2D(uText, uv - t).r
     + texture2D(uText, uv + vec2(t.x, -t.y)).r + texture2D(uText, uv + vec2(-t.x, t.y)).r;
  return s / 16.0;
}
void main() {
  vec2 t = 1.0 / uRes;
  float c = ink(vUv);
  // carved in: the letters are the low parts
  float l = 1.0 - ink(vUv - vec2(t.x, 0.0));
  float r = 1.0 - ink(vUv + vec2(t.x, 0.0));
  float d = 1.0 - ink(vUv - vec2(0.0, t.y));
  float u = 1.0 - ink(vUv + vec2(0.0, t.y));
  vec3 n = normalize(vec3((l - r) * uStrength, (d - u) * uStrength, 1.0));
  gl_FragColor = vec4(n * 0.5 + 0.5, c);
}`;

/** CSS font family for an entry. @param {EngraveEntry['font']} f */
function family(f) {
  if (f === 'title') return `${F.title.weight} {px}px "${F.title.family}", serif`;
  if (f === 'smallCaps') return `${F.smallCaps.weight} {px}px "${F.smallCaps.family}", serif`;
  return `${F.body.weight} {px}px "${F.body.family}", serif`;
}

/** Wait for the bundled fonts, but never longer than `ms`. @param {number} ms */
export async function fontsReady(ms = T.engraving.fontTimeoutMs) {
  if (typeof document === 'undefined' || !document.fonts) return false;
  const want = [
    document.fonts.load(`${F.body.weight} 48px "${F.body.family}"`),
    document.fonts.load(`${F.smallCaps.weight} 48px "${F.smallCaps.family}"`),
    document.fonts.load(`${F.title.weight} 48px "${F.title.family}"`),
  ];
  const timeout = new Promise(r => setTimeout(() => r('timeout'), ms));
  const res = await Promise.race([Promise.all(want).then(() => 'ok', () => 'error'), timeout]);
  if (res !== 'ok') console.warn(`engraving fonts: ${res}; using the fallback serif`);
  return res === 'ok';
}

/**
 * @param {import('./gpu.js').Painter} painter
 */
export function createEngraver(painter, opts = {}) {
  /** WP-06: a second, smaller engraver holds the board's changing count texts. */
  const size = /** @type {{size?: number}} */ (opts).size ?? M.engraving.atlasPx;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  // CPU-backed: uploading it to WebGL is then a plain copy (a GPU canvas has to be read back first)
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
  const textTex = new THREE.CanvasTexture(canvas);
  textTex.colorSpace = THREE.NoColorSpace;
  textTex.generateMipmaps = false;
  textTex.minFilter = THREE.LinearFilter;
  const out = painter.target(size, size, { color: 'linear', repeat: false, anisotropy: 4 });
  /** @type {Map<string, EngraveSlot & { texts?: Record<string, string> }>} */
  const slots = new Map();
  /** @type {Set<() => void>} */
  const afterEngrave = new Set();
  /** @type {DrawKit} */
  const kit = {
    font: (kind, px) => family(kind).replace('{px}', String(Math.round(px))),
    pxForCap(kind, capPx) {
      ctx.font = family(kind).replace('{px}', '100');
      const m = ctx.measureText('H');
      const cap = m.actualBoundingBoxAscent || 66;
      return capPx * 100 / cap;
    },
    arc: (text, cx, cy, R, px, startDeg) => drawArc(text, cx, cy, R, px, startDeg),
    wrap: (text, max) => wrap(text, max),
  };
  let version = 0;

  /**
   * Draw `entries` into a fresh atlas and rebuild the normal + cavity map.
   * @param {EngraveEntry[]} entries
   */
  function engrave(entries) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    slots.clear();
    const pad = T.engraving.padPx;
    let x = pad, y = pad, rowH = 0;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';
    // tallest first, so the shelves pack tightly (the order of the slots doesn't matter)
    const measured = entries.map(e => ({ e, tall: e.draw ? (e.h ?? 0) : e.shape === 'arc' ? 2 * ((e.arcRadiusPx ?? (e.px ?? 72) * 3) + (e.px ?? 72)) : (e.px ?? T.engraving.linePx) * (e.wrapPx ? 3 : 1.45) }));
    measured.sort((a, b) => b.tall - a.tall);
    for (const { e } of measured) {
      const px = e.px ?? T.engraving.linePx;
      ctx.font = family(e.font).replace('{px}', String(px));
      let w, h;
      /** @type {string[]} */ let lines = [e.text];
      if (e.wrapPx && e.shape !== 'arc') lines = wrap(e.text, e.wrapPx);
      if (e.draw) {
        w = Math.ceil(e.w ?? 0); h = Math.ceil(e.h ?? 0);
      } else if (e.shape === 'arc') {
        const R = e.arcRadiusPx ?? px * 3;
        w = h = Math.ceil(2 * (R + px * 0.4)) + pad;
      } else {
        w = Math.ceil(Math.max(...lines.map(l => ctx.measureText(l).width))) + pad * 2;
        h = Math.ceil(px * 1.45 + (lines.length - 1) * px * 1.25);
      }
      if (x + w > size) { x = pad; y += rowH + pad; rowH = 0; }
      if (y + h > size) { console.warn(`engraving atlas full; "${e.id}" left out`); continue; }
      if (e.draw) {
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
        e.draw(ctx, x, y, w, h, kit);
        ctx.restore();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      } else if (e.shape === 'arc') drawArc(e.text, x + w / 2, y + h / 2, e.arcRadiusPx ?? px * 3, px);
      else lines.forEach((l, i) => ctx.fillText(l, x + pad, y + px * 1.05 + i * px * 1.25));
      // uv rect (v up, as the texture is uploaded with flipY)
      slots.set(e.id, { id: e.id, text: e.text, aspect: w / h, texts: e.texts, rect: new THREE.Vector4(x / size, 1 - (y + h) / size, (x + w) / size, 1 - y / size) });
      x += w + pad; rowH = Math.max(rowH, h);
    }
    textTex.needsUpdate = true;
    painter.paint(out, NORMAL, { uSeed: { value: 0 }, uText: { value: textTex }, uStrength: { value: T.engraving.normalStrength }, uBlur: { value: T.engraving.blurPx } });
    textTex.dispose(); // the canvas copy is only needed for this one pass
    version++;
    for (const fn of afterEngrave) { try { fn(); } catch (err) { console.error(err); } }
    return api;
  }

  /** Greedy word wrap at `max` px with the current font. @param {string} text @param {number} max */
  function wrap(text, max) {
    const out = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (line && ctx.measureText(next).width > max) { out.push(line); line = word; } else line = next;
    }
    if (line) out.push(line);
    return out;
  }

  /** Letters around the top of a circle, centred on 12 o'clock, reading clockwise. */
  function drawArc(/** @type {string} */ text, /** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ R, /** @type {number} */ px, startDeg = -90) {
    const widths = [...text].map(ch => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) / R;
    let a = startDeg * Math.PI / 180 - total / 2;
    ctx.save();
    [...text].forEach((ch, i) => {
      const half = widths[i] / 2 / R;
      a += half;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(ch, -widths[i] / 2, px * 0.35);
      ctx.restore();
      a += half;
    });
    ctx.restore();
  }

  const api = {
    engrave,
    /** The normal (RGB) + cavity (A) atlas. */
    target: out,
    texture: out.texture,
    canvas,
    /** @param {string} id */
    slot: id => slots.get(id),
    /** `{slotId: text}` for every engraved string (composites list each string they carry). */
    list: () => Object.fromEntries([...slots.values()].flatMap(s => (s.texts ? Object.entries(s.texts) : [[s.id, s.text]]))),
    /** WP-06: run `fn` after every engrave (materials refresh their atlas rects). @param {() => void} fn */
    onEngrave(fn) { afterEngrave.add(fn); return () => afterEngrave.delete(fn); },
    size,
    get version() { return version; },
    dispose() { textTex.dispose(); painter.release(out); },
  };
  return api;
}

/** @typedef {ReturnType<typeof createEngraver>} Engraver */

/**
 * The board and coin strings the original page already shows, read word-for-word from the DOM
 * (bar names, coin legends, carved headings, side note) plus the plaque digits. WP-06 may call
 * `engrave()` again with its own list once the board exists.
 * @returns {EngraveEntry[]}
 */
export function defaultEntries() {
  /** @type {EngraveEntry[]} */
  const list = [];
  const seen = new Set();
  for (const b of document.querySelectorAll('#categories [data-category], #insightNav [data-category]')) {
    const name = /** @type {HTMLElement} */ (b).dataset.category ?? '';
    if (!name || seen.has(name)) continue;
    seen.add(name);
    list.push({ id: `bar:${name}`, text: name, font: 'body', px: T.engraving.linePx });
  }
  const text = (/** @type {string} */ sel) => (document.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const label = (/** @type {string} */ sel) => document.querySelector(sel)?.getAttribute('aria-label') ?? '';
  const loadTop = document.querySelector('#loadTop');
  const loadLegend = loadTop ? [...loadTop.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : '';
  const coins = [
    ['coin:howto', text('#howTo')],
    ['coin:load', loadLegend],
    ['coin:import', label('#importProgress')],
    ['coin:export', label('#exportProgress')],
  ];
  for (const [id, t] of coins) if (t) list.push({ id, text: t, font: 'smallCaps', px: T.engraving.coinPx, shape: 'arc', arcRadiusPx: T.engraving.coinArcPx });
  document.querySelectorAll('.sidebar .eyebrow').forEach((el, i) => {
    const t = (el.textContent ?? '').trim();
    if (t) list.push({ id: `heading:${i}`, text: t, font: 'smallCaps', px: T.engraving.linePx });
  });
  const note = text('.side-note');
  if (note) list.push({ id: 'sidenote', text: note, font: 'body', px: T.engraving.notePx, wrapPx: T.engraving.noteWrapPx });
  list.push({ id: 'plaque:digits', text: T.engraving.plaqueGlyphs, font: 'body', px: T.engraving.linePx });
  return list;
}
