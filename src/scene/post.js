// @ts-check
/**
 * Post-processing for layer 1 (file 05):
 *   - selective bloom on the BLOOM layer only (the gauntlet): everything else is drawn black in
 *     the bloom pass. Threshold 0.85, strength 0.6, radius 0.4. Full / half resolution / off by tier.
 *   - anti-aliasing: MSAA 4 on the composer's render target (High, Medium), FXAA on Low.
 *   - AgX tone mapping and sRGB output in the final OutputPass.
 * `flat` quality (DECISIONS point 8) turns off bloom and FXAA.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { post as postCfg } from '../config/render.js';
import { BLOOM_LAYER } from './placeholders.js';

const MixShader = {
  uniforms: { baseTexture: { value: null }, bloomTexture: { value: null } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv;
    void main() { gl_FragColor = texture2D(baseTexture, vUv) + vec4(1.0) * texture2D(bloomTexture, vUv); }`,
};

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 */
export function createPost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const makeTarget = (/** @type {number} */ samples) => new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });

  // Bloom composer: the scene with non-bloom objects blacked out.
  const bloomComposer = new EffectComposer(renderer, makeTarget(0));
  bloomComposer.renderToScreen = false;
  // WP-16A (Paul's flashing): the pre-pass must clear to black. RenderPass with no clear colour
  // clears to whatever colour GL holds from the last pass: the desk's clear colour after a normal
  // frame (the bloom mix then added it to every pixel, a wash), black after a reflection-cube
  // face. The cube draws a face on 6 frames of every 12, so the whole screen flickered at 5 Hz.
  const prePass = new RenderPass(scene, camera, null, new THREE.Color(0x000000), 0);
  bloomComposer.addPass(prePass);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), postCfg.bloomStrength, postCfg.bloomRadius, postCfg.bloomThreshold);
  bloomComposer.addPass(bloomPass);

  // Final chain, wired by hand (WP-05, for memory): the scene renders into ONE multisampled
  // target; the bloom mix writes a plain half-float target; OutputPass (AgX + sRGB) goes to the
  // screen, or to an 8-bit target that FXAA then puts on screen. EffectComposer would keep two
  // multisampled targets and swap them.
  let samples = 4;
  const sceneRT = makeTarget(samples);
  sceneRT.texture.name = 'post.scene';
  const midRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: false });
  midRT.texture.name = 'post.mix';
  const ldrRT = new THREE.WebGLRenderTarget(size.x, size.y, { depthBuffer: false });
  ldrRT.texture.name = 'post.fxaa-in';
  const mix = new ShaderPass(new THREE.ShaderMaterial({ ...MixShader, uniforms: THREE.UniformsUtils.clone(MixShader.uniforms) }), 'baseTexture');
  mix.material.uniforms.bloomTexture.value = bloomComposer.renderTarget2.texture;
  const output = new OutputPass();
  const fxaa = new FXAAPass(); // after output: FXAA works on the display-ready image

  // Blackout for the bloom pass, without allocating per frame.
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const bloomLayer = new THREE.Layers(); bloomLayer.set(BLOOM_LAYER);
  /** @type {THREE.Mesh[]} */ let darkList = [];
  /** @type {THREE.Material[]} */ let saved = [];
  /**
   * WP-14 (draw-call budget): the bloom pre-pass draws only what can glow and what can hide it.
   * Everything that glows (the gauntlet's steel and ember socket) sits above the desk, paper,
   * board and coins, so those can never cover it: only the non-glowing meshes of the same
   * top-level object (the gauntlet's own leather and gold) are drawn, in black, as occluders.
   * The rest stays out of the pass through the camera's layer mask (was ~109 draws, now ~20).
   */
  const OCCLUDER_LAYER = 3;
  const collectDark = () => {
    for (const m of darkList) m.layers.disable(OCCLUDER_LAYER);
    darkList = [];
    /** @type {Set<THREE.Object3D>} */
    const glowing = new Set();
    for (const top of scene.children) top.traverse(o => {
      if (/** @type {THREE.Mesh} */ (o).isMesh && o.visible && bloomLayer.test(o.layers) && o.layers.isEnabled(0)) glowing.add(top);
      // three filters lights by the camera's layers too: keep every light in every pass, so the
      // pre-pass counts the same lights as the main pass and reuses its programs (WP-14)
      if (/** @type {THREE.Light} */ (o).isLight) o.layers.enableAll();
    });
    for (const top of glowing) top.traverse(o => {
      // only meshes the main pass draws (layer 0): not the shadow proxies on their own layer
      if (!(/** @type {THREE.Mesh} */ (o).isMesh) || bloomLayer.test(o.layers) || !o.layers.isEnabled(0)) return;
      o.layers.enable(OCCLUDER_LAYER);
      darkList.push(/** @type {THREE.Mesh} */ (o));
    });
    saved = new Array(darkList.length);
  };
  collectDark();

  let bloomMode = /** @type {'full'|'half'|'off'} */ ('full');
  let width = size.x, height = size.y, pixelRatio = renderer.getPixelRatio();
  const resizeBloom = () => {
    const f = bloomMode === 'half' ? 0.5 : 1;
    bloomComposer.setPixelRatio(pixelRatio * f);
    bloomComposer.setSize(width, height);
  };

  return {
    bloomPass,
    /** @param {number} w @param {number} h @param {number} pr */
    setSize(w, h, pr) {
      width = w; height = h; pixelRatio = pr;
      const W = Math.max(1, Math.round(w * pr)), H = Math.max(1, Math.round(h * pr));
      sceneRT.setSize(W, H); midRT.setSize(W, H); ldrRT.setSize(W, H);
      fxaa.setSize(W, H);
      resizeBloom();
    },
    /** @param {{ bloom: 'full'|'half'|'off', antialias: string, msaaSamples: number }} t @param {boolean} [flat] */
    setTier(t, flat = false) {
      bloomMode = flat ? 'off' : t.bloom;
      mix.enabled = bloomMode !== 'off';
      fxaa.enabled = !flat && t.antialias === 'FXAA';
      const s = flat ? 0 : t.msaaSamples;
      if (s !== samples) { samples = s; sceneRT.samples = s; sceneRT.dispose(); }
      // targets a tier no longer uses give their memory back (they reallocate on next use)
      if (!mix.enabled) midRT.dispose();
      if (!fxaa.enabled) ldrRT.dispose();
      if (bloomMode === 'off') { bloomComposer.renderTarget1.dispose(); bloomComposer.renderTarget2.dispose(); }
      resizeBloom();
    },
    /** Re-scan the scene for the bloom blackout list (call after adding or removing meshes). */
    refresh: collectDark,
    /**
     * WP-14: run `fn` with the blackout materials in place (shader warm-up: the pre-pass draws
     * these meshes with `black`, a program variant of its own per mesh kind).
     * @template T @param {() => T} fn
     */
    withDark(fn) {
      const was = darkList.map(m => m.material);
      for (const m of darkList) m.material = black;
      try { return fn(); } finally { darkList.forEach((m, i) => { m.material = was[i]; }); }
    },
    render() {
      if (bloomMode !== 'off') {
        const bg = scene.background; scene.background = null;
        const mask = camera.layers.mask;
        camera.layers.disableAll(); camera.layers.enable(BLOOM_LAYER); camera.layers.enable(OCCLUDER_LAYER);
        // the shadow map is drawn once per frame, in the main pass below (not for the black pre-pass)
        const shadows = renderer.shadowMap.needsUpdate; renderer.shadowMap.needsUpdate = false;
        for (let i = 0; i < darkList.length; i++) { saved[i] = /** @type {THREE.Material} */ (darkList[i].material); darkList[i].material = black; }
        try { bloomComposer.render(); } finally {
          for (let i = 0; i < darkList.length; i++) darkList[i].material = saved[i];
          camera.layers.mask = mask;
          renderer.shadowMap.needsUpdate = shadows;
          scene.background = bg;
        }
      }
      renderer.setRenderTarget(sceneRT);
      renderer.clear();
      renderer.render(scene, camera);
      /** @type {THREE.WebGLRenderTarget} */
      let src = sceneRT;
      if (mix.enabled) { mix.renderToScreen = false; mix.render(renderer, midRT, src); src = midRT; }
      if (fxaa.enabled) {
        output.renderToScreen = false; output.render(renderer, ldrRT, src);
        fxaa.renderToScreen = true; fxaa.render(renderer, null, ldrRT);
      } else {
        output.renderToScreen = true; output.render(renderer, null, src);
      }
      renderer.setRenderTarget(null);
    },
    /** The targets this chain holds, for the memory estimate. */
    targets: () => ({ sceneRT, midRT: mix.enabled ? midRT : null, ldrRT: fxaa.enabled ? ldrRT : null, bloomRT: bloomMode !== 'off' ? bloomComposer.renderTarget2 : null, bloomScale: bloomMode === 'half' ? 0.5 : 1 }),
    get state() { return { bloom: bloomMode, fxaa: fxaa.enabled, msaa: samples }; },
  };
}
