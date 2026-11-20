// @ts-check
/**
 * An estimate of the desk's GPU memory (WP-05 acceptance: under 300 MB on High). WebGL can't
 * report real usage, so this adds up what the desk allocates, from the tier and the canvas
 * size: procedural textures (mips included), the post chain (multisampled colour and depth
 * plus the resolve texture), bloom, shadow maps in both renderers, the veil, the environment
 * maps, the gauntlet's cube camera, both canvases' own buffers and every geometry buffer.
 * It errs high: canvases count three buffers (Chrome double-buffers for the compositor) and
 * every depth buffer is 4 bytes per sample.
 *
 * Because it only needs sizes, the stage also uses it to pick the largest pixel ratio that
 * fits the budget (see stage.js resize()).
 */
import * as THREE from 'three';
import { textureBytes } from './textures/gpu.js';

const MB = 1024 * 1024;

/** PMREM cube-UV texture bytes for a cube of `size` px (half float). @param {number} size */
const pmremBytes = size => 3 * Math.max(size, 16 * 7) * 4 * size * 8;

/**
 * @param {{
 *   texturesBytes: number,
 *   tier: { msaaSamples: number, bloom: string, shadowMap: number, antialias: string, cubePx: number, veilResolution: number },
 *   width: number, height: number, scenePixelRatio: number,
 *   veilPaper?: [number, number] | null, envCubePx?: number, studioPmremPx?: number,
 *   scene?: THREE.Scene | null,
 * }} o
 */
export function estimateGpuMemory(o) {
  const t = o.tier;
  const w = Math.round(o.width * o.scenePixelRatio), h = Math.round(o.height * o.scenePixelRatio), px = w * h;
  const vpr = o.scenePixelRatio * t.veilResolution;
  const vpx = Math.round(o.width * vpr) * Math.round(o.height * vpr);
  const samples = t.msaaSamples > 1 ? t.msaaSamples : 1;
  /** @type {Record<string, number>} */
  const parts = {};
  parts.textures = o.texturesBytes;
  parts.sceneCanvas = px * 12;
  // post: the multisampled scene target (colour + depth per sample, plus the resolved texture)
  parts.postScene = samples > 1 ? px * (8 * samples + 4 * samples + 8) : px * (8 + 4);
  parts.postMix = t.bloom === 'off' ? 0 : px * 8;
  parts.postFxaa = t.antialias === 'FXAA' ? px * 4 : 0;
  // bloom: its own scene render (half float + depth) plus the blur pyramid
  const bf = t.bloom === 'off' ? 0 : t.bloom === 'half' ? 0.25 : 1;
  parts.bloom = bf * px * (12 + 8 * 0.92);
  // shadow maps: colour + depth, in renderer 1 and the veil
  parts.shadows = 2 * t.shadowMap * t.shadowMap * 8;
  parts.veil = vpx * 12 + (o.veilPaper ? textureBytes(o.veilPaper[0], o.veilPaper[1], 4, true) : 0);
  parts.environment = pmremBytes(o.studioPmremPx ?? 256) + (o.envCubePx ? o.envCubePx ** 2 * 6 * 8 : 0);
  parts.gauntletCube = t.cubePx ? t.cubePx * t.cubePx * 6 * 12 + pmremBytes(t.cubePx) : 0;
  let geo = 0;
  if (o.scene) {
    const seen = new Set();
    o.scene.traverse(obj => {
      const g = /** @type {THREE.Mesh} */ (obj).geometry;
      if (!g || seen.has(g)) return;
      seen.add(g);
      for (const a of Object.values(g.attributes)) geo += /** @type {THREE.BufferAttribute} */ (a).array.byteLength;
      if (g.index) geo += g.index.array.byteLength;
    });
  }
  parts.geometry = geo;
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { mb: +(total / MB).toFixed(1), parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, +(v / MB).toFixed(2)])) };
}

/**
 * The largest pixel ratio ≤ `want` (in steps of 1/8, never below `floor`) whose estimate
 * stays under `budgetMB`.
 * @param {Parameters<typeof estimateGpuMemory>[0]} o @param {number} want @param {number} floor @param {number} budgetMB
 */
export function fitPixelRatio(o, want, floor, budgetMB) {
  let pr = want;
  while (pr > floor && estimateGpuMemory({ ...o, scenePixelRatio: pr }).mb > budgetMB) pr = Math.max(floor, pr - 0.125);
  return pr;
}
