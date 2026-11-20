// @ts-check
/**
 * GPU texture painting (WP-05 step 1). Every procedural texture is a full-screen fragment
 * shader rendered once into a render target: no image files, nothing downloaded.
 *
 *   const painter = createPainter(renderer);
 *   const rt = painter.target(512, 512, { color: 'srgb' });
 *   painter.paint(rt, fragmentSource, { uSeed: { value: 7 } });
 *
 * Randomness is integer hashing (PCG) of the lattice cell plus a 32-bit seed, so the same
 * seed gives the same bytes on the same GPU (acceptance: hash compare).
 */
import * as THREE from 'three';
import { GLSL_NOISE } from './noise.glsl.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/**
 * @typedef {object} TargetOptions
 * @property {'srgb'|'linear'|'float'} [color]  'srgb' = albedo (8-bit, sRGB storage, decoded on
 *   sampling); 'linear' = data such as normals or roughness (8-bit); 'float' = half-float scratch.
 * @property {boolean} [mips]       generate mipmaps (default true for 8-bit targets)
 * @property {boolean} [repeat]     RepeatWrapping (default true)
 * @property {number} [anisotropy]
 */

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {{ scale?: number }} [po]  WP-07: targets larger than 512 px are made `scale` times smaller
 *   (software renderers only; the shaders are resolution-independent full-screen passes)
 */
export function createPainter(renderer, po = {}) {
  const scale = po.scale ?? 1;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  /** @type {Map<string, THREE.ShaderMaterial>} */
  const programs = new Map();
  /** Every target this painter made, for memory accounting and disposal. */
  /** @type {Set<THREE.WebGLRenderTarget>} */
  const targets = new Set();

  const api = {
    /** Wait for the GPU after every pass (diagnostics only). */
    sync: false,
    /** Wait once for the GPU after all passes (diagnostics only). */
    drain: false,
    /**
     * @param {number} w @param {number} h @param {TargetOptions} [o]
     */
    target(w, h, o = {}) {
      if (scale !== 1 && Math.max(w, h) > 512) { w = Math.max(4, Math.round(w * scale)); h = Math.max(4, Math.round(h * scale)); }
      const kind = o.color ?? 'linear';
      const float = kind === 'float';
      const mips = o.mips ?? !float;
      const rt = new THREE.WebGLRenderTarget(w, h, {
        type: float ? THREE.HalfFloatType : THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        colorSpace: kind === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: mips,
        minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: o.repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping,
        wrapT: o.repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping,
        anisotropy: o.anisotropy ?? 1,
      });
      rt.texture.name = 'procedural';
      /** @type {any} */ (rt).vcKind = kind;
      // Create the GL texture now, so materials can wrap it (materials/patch.js view()) before
      // anything is painted into it.
      renderer.initRenderTarget(rt);
      rt.texture.userData.vcGL = /** @type {any} */ (renderer.properties.get(rt.texture)).__webglTexture;
      targets.add(rt);
      return rt;
    },
    /**
     * Render `fragment` into `rt`. The fragment shader gets `vUv`, `uRes` (target size in px),
     * `uSeed` (uint) and the shared noise library; it writes gl_FragColor.
     * @param {THREE.WebGLRenderTarget} rt
     * @param {string} fragment
     * @param {Record<string, THREE.IUniform>} [uniforms]
     */
    paint(rt, fragment, uniforms = {}) {
      let mat = programs.get(fragment);
      if (!mat) {
        mat = new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: `precision highp float;\nprecision highp int;\nuniform vec2 uRes;\nuniform uint uSeed;\nvarying vec2 vUv;\n${GLSL_NOISE}\n${fragment}`,
          uniforms: { uRes: { value: new THREE.Vector2() }, uSeed: { value: 0 } },
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        });
        programs.set(fragment, mat);
      }
      for (const [k, v] of Object.entries(uniforms)) mat.uniforms[k] = v;
      mat.uniforms.uRes.value.set(rt.width, rt.height);
      mesh.material = mat;
      const prevTarget = renderer.getRenderTarget();
      const prevAuto = renderer.autoClear;
      const prevXr = renderer.xr.enabled;
      renderer.xr.enabled = false;
      renderer.autoClear = false;
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      if (api.sync) {
        // diagnostics (?texsync): wait for the GPU after every pass so the log shows its real cost
        const gl = renderer.getContext();
        const one = /** @type {any} */ (rt).vcKind === 'float' ? new Float32Array(4) : new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, one instanceof Float32Array ? gl.FLOAT : gl.UNSIGNED_BYTE, one);
      }
      renderer.setRenderTarget(prevTarget);
      renderer.autoClear = prevAuto;
      renderer.xr.enabled = prevXr;
    },
    /**
     * Read a target's RGBA8 bytes without stalling the GPU pipeline (PBO + fence).
     * Rows run bottom (v = 0) to top, as WebGL stores them.
     * @param {THREE.WebGLRenderTarget} rt
     */
    async read(rt) {
      const buf = new Uint8Array(rt.width * rt.height * 4);
      await renderer.readRenderTargetPixelsAsync(rt, 0, 0, rt.width, rt.height, buf);
      return buf;
    },
    /**
     * The same, synchronously. Used at startup once the GPU is idle anyway: Chrome only updates
     * fence status between tasks, so at startup the async path can wait several hundred ms.
     * @param {THREE.WebGLRenderTarget} rt
     */
    readNow(rt) {
      const buf = new Uint8Array(rt.width * rt.height * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, buf);
      return buf;
    },
    targets,
    /** Free a scratch target early. @param {THREE.WebGLRenderTarget} rt */
    release(rt) { rt.dispose(); targets.delete(rt); },
    dispose() {
      for (const m of programs.values()) m.dispose();
      programs.clear();
      geometry.dispose();
    },
  };
  return api;
}

/** @typedef {ReturnType<typeof createPainter>} Painter */

/**
 * FNV-1a 32-bit hash of a byte array, as 8 hex digits.
 * @param {Uint8Array | Uint8ClampedArray} bytes
 */
export function fnv1a(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Bytes a texture of this size takes on the GPU, mip chain included.
 * @param {number} w @param {number} h @param {number} bytesPerPixel @param {boolean} mips
 */
export function textureBytes(w, h, bytesPerPixel, mips) {
  let total = 0;
  do {
    total += w * h * bytesPerPixel;
    w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
  } while (mips && (w > 1 || h > 1));
  return mips ? total + bytesPerPixel : total;
}

/**
 * Turn bottom-up RGBA rows into a canvas (top-down), optionally downscaled.
 * @param {Uint8Array} bytes @param {number} w @param {number} h @param {number} [outW] @param {number} [outH]
 */
export function bytesToCanvas(bytes, w, h, outW = w, outH = h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const img = ctx.createImageData(w, h);
  const row = w * 4;
  for (let y = 0; y < h; y++) img.data.set(bytes.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  ctx.putImageData(img, 0, 0);
  if (outW === w && outH === h) return c;
  const s = document.createElement('canvas');
  s.width = outW; s.height = outH;
  const sctx = /** @type {CanvasRenderingContext2D} */ (s.getContext('2d'));
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(c, 0, 0, outW, outH);
  return s;
}

/**
 * A canvas as a PNG data URL. Synchronous toDataURL on purpose: Chrome runs toBlob's encoder in
 * idle time, which at startup arrives up to a second late; these tiles encode in a few ms.
 * @param {HTMLCanvasElement} c
 */
export function canvasToDataUrl(c) {
  return Promise.resolve(c.toDataURL('image/png'));
}
