// @ts-check
/**
 * All procedural textures (WP-05), generated on the GPU at startup from one seed.
 *
 *   const tex = createTextures(renderer, { seed });
 *   await tex.run();          // spreads the work over a few frames, then reads back what other
 *                             // contexts and CSS need (paper normal bitmap, data URLs)
 *   tex.out.paper.albedo.texture ...
 *
 * Textures exist (empty) from the start, so materials can be built before `run()` finishes.
 * `tex.timing` holds the log; `tex.hash()` hashes every texture's bytes (acceptance: the same
 * seed gives pixel-identical textures); `tex.memory()` estimates GPU bytes.
 */
import * as THREE from 'three';
import { Rng } from '../../util/rng.js';
import { createPainter, fnv1a, textureBytes, bytesToCanvas, canvasToDataUrl } from './gpu.js';
import { paperGenerator } from './paper.js';
import { walnutGenerator } from './walnut.js';
import { steelGenerator } from './steel.js';
import { knurlGenerator } from './knurl.js';
import { hammeredGenerator } from './hammered.js';
import { leatherGenerator } from './leather.js';
import { grainGenerator } from './grain.js';
import { boardGenerator } from './board.js';
import { createEngraver, defaultEntries, fontsReady } from './engrave.js';
import { gpuDone } from '../gpu-wait.js';
import { textures as T } from '../../config/render.js';
import layout from '../../config/layout.js';
import { clock } from '../../util/clock.js';

const COPY = /* glsl */ `uniform sampler2D uSrc; void main() { gl_FragColor = texture2D(uSrc, vUv); }`;

/** Wait for the next animation frame (or a macrotask where there is none). */
// WP-18P: the central scheduler's next tick (it falls back to a timeout where there is no rAF)
const nextFrame = () => new Promise(r => { clock.nextFrame(() => r(undefined)); });

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {{ seed: number, board?: { widthCm: number, heightCm: number, slots?: {x0: number, y0: number, x1: number, y1: number}[] }, engrave?: import('./engrave.js').EngraveEntry[] | (() => import('./engrave.js').EngraveEntry[]), scale?: number, nextSlice?: () => Promise<void> }} o  `scale`: WP-07, software renderers make big targets smaller; `nextSlice`: WP-07, see run()
 */
export function createTextures(renderer, o) {
  const painter = createPainter(renderer, { scale: o.scale ?? 1 });
  /** Wait for the next slice of work: the stage passes "the end of the next frame" (after the frame's own clock reads). */
  const nextSlice = o.nextSlice ?? nextFrame;
  const diag = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('texsync') : null;
  painter.sync = diag === '' || diag === 'each';
  painter.drain = diag === 'end';
  const aniso = Math.min(T.maxAnisotropy, renderer.capabilities.getMaxAnisotropy());
  const seeds = new Rng((o.seed ^ 0x7e57) >>> 0);
  const s = () => Math.floor(seeds.next() * 4294967296) >>> 0;
  const W = layout.woodblock;
  const boardSpec = o.board ?? { widthCm: W.x1 - W.x0, heightCm: W.y1 - W.y0, slots: [] };

  const paper = paperGenerator(painter, s(), aniso);
  const walnut = walnutGenerator(painter, s(), aniso);
  const steel = steelGenerator(painter, s(), aniso);
  const knurl = knurlGenerator(painter, s());
  const hammered = hammeredGenerator(painter, s(), aniso);
  const leather = leatherGenerator(painter, s());
  const grain = grainGenerator(painter, s());
  const board = boardGenerator(painter, s(), walnut.outputs, boardSpec, aniso);
  const generators = [paper, walnut, board, steel, knurl, hammered, leather, grain];
  const engraver = createEngraver(painter);
  const paperSmall = painter.target(T.paper.dataUrlSize[0], T.paper.dataUrlSize[1], { color: 'srgb', mips: false, repeat: false });

  const out = {
    paper: paper.outputs, walnut: walnut.outputs, board: board.outputs, brushedSteel: steel.outputs,
    knurl: knurl.outputs, hammered: hammered.outputs, leather: leather.outputs, grain: grain.outputs,
    engraving: engraver.target,
  };
  for (const [name, group] of Object.entries(out)) {
    if (group instanceof THREE.WebGLRenderTarget) { group.texture.name = name; continue; }
    for (const [k, rt] of Object.entries(group)) rt.texture.name = `${name}.${k}`;
  }

  /** @type {{ startedAt: number, totalMs: number, gpuMs: number, frames: number, steps: {name: string, ms: number}[], engraveMs: number, readbackMs: number, readsMs: number, bitmapMs: number, drainMs: number, engraveDrainMs: number, fonts: boolean, gpuWaitSlices?: number, done: boolean }} */
  const timing = { startedAt: 0, totalMs: 0, gpuMs: 0, frames: 0, steps: [], engraveMs: 0, readbackMs: 0, readsMs: 0, bitmapMs: 0, drainMs: 0, engraveDrainMs: 0, fonts: false, done: false };
  /** Results for the other contexts and for CSS. */
  const shared = {
    /** Paper normal (RGB) + deckle (A) as an ImageBitmap, for renderer 2 (the veil). @type {ImageBitmap | null} */
    paperNormalBitmap: null,
    /** Small paper albedo for the HTML floating sheets' backgrounds. */
    paperDataUrl: '',
    inkGrainDataUrl: '',
    filmGrainDataUrl: '',
  };
  /** @type {((p: number) => void)[]} */
  const progressFns = [];
  let stepsDone = 0;
  const stepCount = generators.reduce((n, g) => n + g.steps.length, 0) + 3;
  const progress = () => { const p = Math.min(1, stepsDone / stepCount); for (const f of progressFns) f(p); };

  /** @type {Promise<void> | null} */
  let running = null;

  /** Hashes of targets released after readback, so hash() still covers them. @type {Record<string, string>} */
  const releasedHashes = {};

  /**
   * @param {{ releaseAfterReadback?: string[], blocking?: boolean }} [ro]  `releaseAfterReadback`:
   *   targets to free once read back (the desk hands the paper normal to the veil; layer 1 draws
   *   the paper unlit and never samples it). `blocking` (WP-07, software renderers): no frame
   *   waits; every pass runs straight through, before the stage starts its frame loop
   */
  async function run(ro = {}) {
    if (running) return running;
    running = (async () => {
      // WP-07: the clock is read only where a slice starts (straight after `nextSlice`), never
      // straight after GPU work: on a software renderer that work blocks for seconds, and a
      // read there makes a test's fake clock (Playwright page.clock) drop the time, so every
      // page timer (the toast's 10 s, the count animation) runs late. Steps per slice adapt to
      // how long the last slice took instead of being timed one by one.
      const t0 = performance.now();
      timing.startedAt = t0;
      const fontWait = fontsReady();
      let sliceAt = t0, perSlice = 1, inSlice = 0;
      const blocking = !!ro.blocking;
      const slice = async () => {
        if (blocking) { inSlice = 0; return (sliceAt = performance.now()); }
        await nextSlice(); timing.frames++;
        const now = performance.now(), took = now - sliceAt;
        sliceAt = now; inSlice = 0;
        const frame = T.frameBudgetMs + 17; // the budget plus one display frame
        perSlice = took > 2 * frame ? Math.max(1, perSlice >> 1) : took < frame ? perSlice + 1 : perSlice;
        return now;
      };
      for (const g of generators) {
        const g0 = sliceAt;
        for (const [i, step] of g.steps.entries()) {
          const s0 = painter.sync ? performance.now() : 0; // ?texsync diagnostics only
          step();
          if (painter.sync) timing.steps.push({ name: `${g.name}#${i}`, ms: +(performance.now() - s0).toFixed(2) });
          stepsDone++; progress();
          if (++inSlice >= perSlice) await slice();
        }
        // to the slice boundary after the generator's last step (it includes up to one frame)
        if (inSlice) await slice();
        timing.steps.push({ name: g.name, ms: +(sliceAt - g0).toFixed(2) });
      }
      if (painter.drain) {
        const d0 = performance.now();
        const gl = renderer.getContext(); const one = new Uint8Array(4);
        renderer.setRenderTarget(grain.outputs.film); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, one); renderer.setRenderTarget(null);
        timing.drainMs = +(performance.now() - d0).toFixed(2);
      }
      // engraving waits for the fonts (bundled, so this is quick)
      const e0 = await slice();
      timing.fonts = await fontWait;
      const entries = typeof o.engrave === 'function' ? o.engrave() : (o.engrave ?? defaultEntries());
      engraver.engrave(entries);
      if (painter.drain) {
        const d0 = performance.now();
        const gl = renderer.getContext(); const one = new Uint8Array(4);
        renderer.setRenderTarget(engraver.target); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, one); renderer.setRenderTarget(null);
        timing.engraveDrainMs = +(performance.now() - d0).toFixed(2);
      }
      const r0 = await slice();
      timing.engraveMs = +(r0 - e0).toFixed(2);
      stepsDone++; progress();
      // read back what the veil and the CSS layers need. WP-07: first let the GPU finish every
      // pass without blocking the page (gpu-wait.js); the reads after it then return at once
      painter.paint(paperSmall, COPY, { uSrc: { value: paper.outputs.albedo.texture } });
      if (!blocking) timing.gpuWaitSlices = await gpuDone(renderer.getContext(), nextSlice);
      const [nrm, small, inkB, filmB] = [paper.outputs.normal, paperSmall, grain.outputs.ink, grain.outputs.film].map(rt => painter.readNow(rt));
      const b0 = await slice();
      timing.gpuMs = +(b0 - t0).toFixed(2);
      timing.readsMs = +(b0 - r0).toFixed(2);
      stepsDone++; progress();
      const pw = paper.outputs.normal.width, ph = paper.outputs.normal.height;
      shared.paperNormalBitmap = typeof createImageBitmap === 'function'
        ? await createImageBitmap(new ImageData(new Uint8ClampedArray(nrm.buffer), pw, ph), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
        : null;
      const sw = paperSmall.width, sh = paperSmall.height;
      [shared.paperDataUrl, shared.inkGrainDataUrl, shared.filmGrainDataUrl] = await Promise.all([
        canvasToDataUrl(bytesToCanvas(small, sw, sh)),
        canvasToDataUrl(bytesToCanvas(inkB, grain.outputs.ink.width, grain.outputs.ink.height)),
        canvasToDataUrl(bytesToCanvas(filmB, grain.outputs.film.width, grain.outputs.film.height)),
      ]);
      const m0 = await slice();
      timing.bitmapMs = +(m0 - b0).toFixed(2);
      painter.release(paperSmall);
      for (const name of ro.releaseAfterReadback ?? []) {
        const rt = targets()[name];
        if (!rt) continue;
        releasedHashes[name] = fnv1a(name === 'paper.normal' ? nrm : painter.readNow(rt));
        painter.release(rt);
        released.add(name);
      }
      const end = await slice();
      timing.readbackMs = +(end - r0).toFixed(2);
      timing.totalMs = +(end - t0).toFixed(2);
      timing.done = true;
      stepsDone = stepCount; progress();
    })();
    return running;
  }

  /** @type {Set<string>} */
  const released = new Set();
  /** Every output target still held, by name. */
  function targets() {
    /** @type {Record<string, THREE.WebGLRenderTarget>} */
    const list = {};
    for (const [name, group] of Object.entries(out)) {
      if (group instanceof THREE.WebGLRenderTarget) list[name] = group;
      else for (const [k, rt] of Object.entries(group)) list[`${name}.${k}`] = rt;
    }
    for (const n of released) delete list[n];
    return list;
  }

  return {
    out,
    shared,
    engraver,
    painter,
    timing,
    run,
    /** @param {(p: number) => void} fn  called with 0..1 as the steps finish */
    onProgress(fn) { progressFns.push(fn); },
    /** FNV-1a of every texture's bytes, read back from the GPU. */
    async hash() {
      /** @type {Record<string, string>} */
      const h = { ...releasedHashes };
      for (const [name, rt] of Object.entries(targets())) h[name] = fnv1a(await painter.read(rt));
      return Object.fromEntries(Object.entries(h).sort(([a], [b]) => a.localeCompare(b)));
    },
    /** GPU bytes held by the textures this module made (mip chains included). */
    memory() {
      let bytes = 0;
      /** @type {Record<string, number>} */
      const by = {};
      for (const rt of painter.targets) {
        const kind = /** @type {any} */ (rt).vcKind;
        const bpp = kind === 'float' ? 8 : 4;
        const b = textureBytes(rt.width, rt.height, bpp, rt.texture.generateMipmaps);
        by[rt.texture.name] = (by[rt.texture.name] ?? 0) + b;
        bytes += b;
      }
      return { bytes, byTexture: by };
    },
    dispose() {
      for (const rt of [...painter.targets]) painter.release(rt);
      painter.dispose();
      shared.paperNormalBitmap?.close?.();
    },
  };
}

/** @typedef {ReturnType<typeof createTextures>} Textures */
