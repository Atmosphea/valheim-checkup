// @ts-check
/**
 * Layer 3, the light veil (file 05). A second WebGL context, drawn at a fraction of the screen
 * resolution and multiplied over everything below it, so the paper and the HTML text printed on
 * it are lit and shadowed identically.
 *
 * It renders only:
 *   - the paper sheets in white, lit by the key and fill lights, receiving shadows;
 *   - the board, coins and gauntlet as white depth-tested occluders that cast shadows
 *     (DECISIONS point 2), posed from layer 1's objects every frame;
 *   - test casters for the WP-04 acceptance check.
 * Everything else is pure white, which has no effect under multiply.
 *
 * Output is written as plain factors (no tone mapping, no colour encoding): 0.8 darkens by 20%.
 */
import * as THREE from 'three';
import { kelvinToColor, keyDirection, configureShadow } from './lights.js';
import { lights as lightsCfg, stage as S, textures as T } from '../config/render.js';
import { createVeilPaper } from './materials/paper.js';
import { addPatch } from './materials/patch.js';

/**
 * WP-07: the veil never exceeds 1.0. `uVeilExcess` = 0 draws min(light, 1) (the normal pass);
 * 1 draws only what is above 1 (max(light − 1, 0)), which the glow layer adds instead.
 */
const excessUniforms = { uVeilExcess: { value: 0 } };
const EXCESS_PATCH = {
  key: 'veilExcess',
  uniforms: excessUniforms,
  fragmentHead: 'uniform float uVeilExcess;',
  fragmentEnd: 'gl_FragColor.rgb = uVeilExcess > 0.5 ? max(gl_FragColor.rgb - 1.0, 0.0) : min(gl_FragColor.rgb, 1.0);',
};

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ papers: THREE.Mesh[], casters: THREE.Mesh[] }} sources  layer 1 objects to mirror
 * @param {{ shadowMap: number, shadowSoft: boolean }} tier
 */
export function createVeil(canvas, sources, tier) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0xffffff, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.name = 'veil';
  // Mirrored meshes get their world matrices copied from layer 1 each frame, so the scene must
  // not recompute them; lights and test casters are updated by hand when they change.
  scene.matrixWorldAutoUpdate = false;

  const warm = kelvinToColor(lightsCfg.keyKelvin);
  const keyColor = new THREE.Color(1, 1, 1).lerp(warm, S.veilKeyWarmth);
  const key = new THREE.DirectionalLight(keyColor, S.veilKeyIntensity);
  key.position.copy(keyDirection).multiplyScalar(150);
  key.castShadow = true;
  configureShadow(key, tier.shadowMap);
  scene.add(key, key.target);
  const fill = new THREE.HemisphereLight(S.veilFillSky, S.veilFillGround, S.veilFillIntensity);
  fill.position.set(0, 0, 1);
  scene.add(fill);

  // Paper copies: white, lit, receive shadows. They share the layer 1 geometry. Until WP-05's
  // paper normal arrives (setPaperNormal), they are flat Lambert.
  /** @type {THREE.Material} */
  let paperMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  addPatch(paperMat, EXCESS_PATCH);
  /** WP-07: extra patches for every paper material, now and after setPaperNormal (the bristle). */
  /** @type {((m: THREE.Material) => void)[]} */
  const paperPatches = [];
  /** @type {THREE.Mesh[]} */
  const paperMirrors = [];
  /** @type {[THREE.Mesh, THREE.Object3D][]} */
  const mirrored = [];
  for (const p of sources.papers) {
    const m = new THREE.Mesh(p.geometry, paperMat);
    m.name = 'veil-' + p.name;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    scene.add(m);
    mirrored.push([m, p]);
    paperMirrors.push(m);
  }
  // Occluders: white, unlit, depth-tested, cast shadows. In the excess pass they draw black.
  const occluderMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  addPatch(occluderMat, { ...EXCESS_PATCH, key: 'veilExcessOcc' });
  for (const c of sources.casters) {
    const m = new THREE.Mesh(c.geometry, occluderMat);
    m.name = 'veil-' + c.name;
    m.castShadow = true;
    m.matrixAutoUpdate = false;
    scene.add(m);
    mirrored.push([m, c]);
  }

  /** WP-16A: flat white paper, lit like the sheets (no normal map: a floating slip is smooth). */
  /** @type {THREE.MeshLambertMaterial | null} */ let lit = null;
  const litMat = () => {
    if (!lit) { lit = new THREE.MeshLambertMaterial({ color: 0xffffff }); addPatch(lit, { ...EXCESS_PATCH, key: 'veilExcessLit' }); }
    return lit;
  };
  // Test casters: invisible in colour, visible to the shadow map (acceptance item 3).
  const testMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  /** @type {THREE.Mesh[]} */
  const testCasters = [];

  scene.updateMatrixWorld(true);

  let pixelRatio = 1;
  const keyFull = { color: keyColor.clone(), intensity: S.veilKeyIntensity };
  const fillFull = fill.intensity;
  const candle = kelvinToColor(T.fadeStartKelvin);
  /** @type {THREE.WebGLRenderTarget | null} */ let excessRT = null;
  /** WP-14: skip the shadow map's redraw in the next render (draw calls). */
  let holdShadow = false;
  const api = {
    renderer,
    scene,
    key,
    /** @param {number} w CSS px @param {number} h @param {number} pr device pixels per CSS px for this layer */
    setSize(w, h, pr) {
      pixelRatio = pr;
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h, false);
    },
    /** @param {{ shadowMap: number, shadowSoft: boolean }} t */
    setTier(t) {
      configureShadow(key, t.shadowMap);
      key.shadow.radius = t.shadowSoft ? S.keyShadowRadius : 1;
    },
    /** @param {THREE.Camera} camera */
    render(camera) {
      for (const [m, src] of mirrored) {
        m.visible = src.visible && isShown(src);
        if (m.visible) m.matrixWorld.copy(src.matrixWorld);
      }
      renderer.shadowMap.autoUpdate = !holdShadow;
      holdShadow = false;
      try { renderer.render(scene, camera); } finally { renderer.shadowMap.autoUpdate = true; }
    },
    /** WP-14 (draw calls): the next render reuses the current shadow map (24 draws fewer). */
    holdShadowOnce() { holdShadow = true; },
    /**
     * Put a shadow-only sphere above the paper so its shadow lands centred on (x, y).
     * @param {{x: number, y: number, r?: number, height?: number}} o
     */
    addTestCaster({ x, y, r = 3, height = 8 }) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12), testMat);
      s.name = 'veil-test-caster';
      s.castShadow = true;
      // walk back along the key direction so the shadow falls on (x, y, 0)
      s.position.set(x, y, 0).addScaledVector(keyDirection, height / keyDirection.z);
      scene.add(s);
      s.updateMatrixWorld(true);
      testCasters.push(s);
      return s;
    },
    /**
     * WP-06: mirror another layer 1 mesh as a white shadow-casting occluder. WP-16A: `lit` mirrors it
     * as paper instead (lit by the veil's lights, receiving shadows): for paper that floats over
     * the sheets (the header slip), which must multiply like the paper around it.
     * @param {THREE.Mesh} c @param {{ lit?: boolean }} [o]
     */
    addCaster(c, o = {}) {
      const m = new THREE.Mesh(c.geometry, o.lit ? litMat() : occluderMat);
      if (o.lit) m.receiveShadow = true;
      m.name = 'veil-' + c.name;
      m.castShadow = true;
      m.matrixAutoUpdate = false;
      scene.add(m);
      mirrored.push([m, c]);
      return m;
    },
    /** WP-06: stop mirroring a layer 1 mesh (a placeholder replaced by the real object). @param {THREE.Object3D} c */
    removeCaster(c) {
      for (let i = mirrored.length - 1; i >= 0; i--) {
        if (mirrored[i][1] !== c) continue;
        scene.remove(mirrored[i][0]);
        mirrored.splice(i, 1);
      }
    },
    clearTests() {
      for (const s of testCasters.splice(0)) { scene.remove(s); s.geometry.dispose(); }
    },
    /**
     * WP-05: light the paper with its real normals (and cut out the deckle). The bitmap is the
     * paper normal map read back once from renderer 1; RGB = normal, A = deckle.
     * @param {ImageBitmap} bitmap
     */
    setPaperNormal(bitmap) {
      const next = createVeilPaper(bitmap);
      addPatch(next, EXCESS_PATCH);
      for (const f of paperPatches) f(next);
      for (const m of paperMirrors) m.material = next;
      paperMat.dispose();
      paperMat = next;
    },
    /**
     * WP-05 warm-up: scale the paper's light (0 = dark, 1 = normal) and warm it towards candle
     * colour (0 = the key's own colour, 1 = candle).
     * @param {number} k @param {number} warmth
     */
    setLightScale(k, warmth) {
      key.color.copy(keyFull.color).lerp(candle, warmth);
      key.intensity = keyFull.intensity * k;
      fill.intensity = fillFull * k;
    },
    /** WP-07: apply `fn` to the paper material now and to every later one. @param {(m: THREE.Material) => void} fn */
    setPaperPatch(fn) { paperPatches.push(fn); fn(paperMat); },
    /**
     * WP-07: a sheet's veil copy also casts a shadow (the inset sheet while it is lifted).
     * @param {string} name layer 1 mesh name, e.g. 'sheet-inset' @param {boolean} on
     */
    setPaperCasts(name, on) {
      for (const m of paperMirrors) if (m.name === 'veil-' + name) m.castShadow = on;
    },
    /** WP-07: cast state per paper copy, for tests. */
    paperCasts: () => Object.fromEntries(paperMirrors.map(m => [m.name, m.castShadow])),
    /**
     * WP-07: render only the light above 1.0 into the veil canvas and hand the canvas to `use`
     * (in the same task, while its drawing buffer is valid), then render the normal pass again.
     * @param {THREE.Camera} camera @param {(c: HTMLCanvasElement) => void} use
     * @param {boolean} [restore]  draw the normal pass again afterwards (default true)
     */
    renderExcess(camera, use, restore = true) {
      excessUniforms.uVeilExcess.value = 1;
      renderer.setClearColor(0x000000, 1);
      try { api.render(camera); use(canvas); }
      finally {
        excessUniforms.uVeilExcess.value = 0;
        renderer.setClearColor(0xffffff, 1);
        // WP-14: skipped when the normal veil pass follows in the same frame (one render fewer)
        if (restore) api.render(camera);
      }
    },
    /**
     * WP-14: the same excess pass, read back without stalling. It renders at quarter size into
     * its own target (the canvas is untouched, so no restore pass) and reads the pixels through
     * a pixel buffer and a fence (three's readRenderTargetPixelsAsync), a frame or two later.
     * The synchronous read waited for the GPU to finish the whole frame: up to ~70 ms.
     * Resolves to bottom-up RGBA rows, or null when the read isn't possible (renderExcess then).
     * @param {THREE.Camera} camera
     * @returns {Promise<{data: Uint8Array, w: number, h: number} | null>}
     */
    async readExcess(camera) {
      const w = Math.max(1, Math.round(canvas.width / 4)), h = Math.max(1, Math.round(canvas.height / 4));
      if (!excessRT) {
        excessRT = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true });
        excessRT.texture.colorSpace = renderer.outputColorSpace; // same programs as the canvas pass
      } else if (excessRT.width !== w || excessRT.height !== h) excessRT.setSize(w, h);
      const prev = renderer.getRenderTarget();
      excessUniforms.uVeilExcess.value = 1;
      renderer.setClearColor(0x000000, 1);
      // the shadow map is the one this frame's veil pass drew: not drawn again (24 draws)
      holdShadow = true;
      try { renderer.setRenderTarget(excessRT); api.render(camera); }
      finally {
        excessUniforms.uVeilExcess.value = 0;
        renderer.setClearColor(0xffffff, 1);
        renderer.setRenderTarget(prev);
      }
      const data = new Uint8Array(w * h * 4);
      try { await renderer.readRenderTargetPixelsAsync(excessRT, 0, 0, w, h, data); } catch { return null; }
      return { data, w, h };
    },
    get paperMaterial() { return paperMat; },
    get pixelRatio() { return pixelRatio; },
    dispose() { excessRT?.dispose(); lit?.dispose(); renderer.dispose(); paperMat.dispose(); occluderMat.dispose(); testMat.dispose(); },
  };
  api.setTier(tier);
  return api;
}

/** Visible all the way up the parent chain. @param {THREE.Object3D} o */
function isShown(o) {
  for (let p = /** @type {THREE.Object3D|null} */ (o); p; p = p.parent) if (!p.visible) return false;
  return true;
}
