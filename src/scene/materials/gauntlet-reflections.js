// @ts-check
/**
 * Gauntlet reflections (file 05): a CubeCamera at the hand, 256 px, refreshed every 3rd frame,
 * mixed 60/40 with the studio environment, so the steel visibly reflects the warm paper and the
 * wood. Medium: 128 px every 6th frame. Low: studio only (no cube camera).
 *
 * Each refresh: render the scene from the hand (gauntlet hidden, studio as background), then
 * blend the studio over it at 40% on all six faces, then let three's PMREM pre-filter it for
 * roughness (needsPMREMUpdate). WP-14: one face per frame, and the filtering in the frame after.
 */
import * as THREE from 'three';
import { materials as M } from '../../config/render.js';

/** WP-14: what the reflection cube camera sees (lights and the large surfaces only). */
const REFLECT_LAYER = 4;

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.CubeTexture | THREE.Texture} studioCube  the raw (unfiltered) studio cube
 * @param {{ cubePx: number, cubeEveryNthFrame: number }} tier
 */
export function createGauntletReflections(renderer, scene, studioCube, tier) {
  const R = M.gauntletReflections;
  /** @type {THREE.WebGLCubeRenderTarget | null} */ let rt = null;
  /** @type {THREE.CubeCamera | null} */ let cam = null;
  let every = 0, frame = 0, refreshes = 0, lastRefresh = -1e9;
  /** The next cube face to draw (0–5), or −1 between refreshes. */
  let face = -1;
  /** WP-14 (draw calls): the cube is complete; its PMREM filtering (~36 draws) waits for the next frame. */
  let pmremDue = false;
  const lastAt = new THREE.Vector3(1e9, 0, 0);
  /** @type {THREE.MeshPhysicalMaterial[]} */ const materials = [];

  const mixScene = new THREE.Scene();
  const mixMat = new THREE.ShaderMaterial({
    uniforms: { uStudio: { value: studioCube }, uMix: { value: R.studioMix } },
    vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform samplerCube uStudio; uniform float uMix; varying vec3 vDir;
      void main() { gl_FragColor = vec4(textureCube(uStudio, normalize(vDir)).rgb, uMix); }`,
    side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mixMat);
  sky.frustumCulled = false;
  sky.layers.enable(REFLECT_LAYER);
  mixScene.add(sky);
  /**
   * WP-14 (draw calls): the cube sees only the large surfaces that show in the steel (desk planks,
   * the sheets, the woodblock, the plaque, the coins), not every bar, tab, wheel and rivet: a
   * refresh drew the whole scene six times (~650 draws in one frame), now ~100.
   */
  let tagged = false;
  function tagReflected() {
    tagged = true;
    scene.traverse(o => {
      if (/** @type {THREE.Light} */ (o).isLight) o.layers.enable(REFLECT_LAYER);
      else if (/** @type {THREE.Mesh} */ (o).isMesh && R.reflectNames.some(re => re.test(o.name))) o.layers.enable(REFLECT_LAYER);
    });
  }

  /** @param {{ cubePx: number, cubeEveryNthFrame: number }} t */
  function setTier(t) {
    if (rt && t.cubePx === rt.width && t.cubeEveryNthFrame === every) return;
    rt?.dispose(); rt = null; cam = null;
    every = t.cubeEveryNthFrame;
    if (t.cubePx > 0 && every > 0) {
      rt = new THREE.WebGLCubeRenderTarget(t.cubePx, { type: THREE.HalfFloatType, generateMipmaps: false });
      cam = new THREE.CubeCamera(R.near, R.far, rt);
      for (const c of cam.children) c.layers.set(REFLECT_LAYER);
      frame = 0; face = -1;
    }
    for (const m of materials) apply(m);
  }

  /** @param {THREE.MeshPhysicalMaterial} m */
  function apply(m) {
    m.envMap = rt ? rt.texture : null; // null → the scene's studio environment
    m.needsUpdate = true;
  }

  /**
   * Refresh the cube when it is due. Returns true when the cube was completed, 'pmrem' on the
   * frame its filtering runs (WP-14), false otherwise.
   * @param {THREE.Vector3} at   world position of the hand
   * @param {THREE.Object3D[]} hide  the gauntlet's own meshes
   * @param {boolean} [force]
   */
  function update(at, hide, force = false) {
    if (!rt || !cam) return false;
    frame++;
    // WP-14 (draw calls): the filtering gets a frame of its own, not the one that drew the last face;
    // 'pmrem' tells the stage this frame is the heavy one (it keeps the veil's shadow map once)
    if (pmremDue && !force) { pmremDue = false; rt.texture.needsPMREMUpdate = true; return 'pmrem'; }
    // WP-14 (draw calls): a refresh draws one cube face per frame (six frames in all, the same
    // rate as before at cubeEveryNthFrame 6) instead of six faces in one frame
    if (face >= 0 && !force) return drawFace(hide);
    if (!force && ((frame - 1) % every) !== 0) return false;
    // WP-08 (DECISIONS): the cube depends only on where the hand is. While it has not moved,
    // a refresh draws the same picture and re-filters it (three's PMREM, ~8 ms at 256 px), so it
    // is skipped; a slow refresh still catches the room changing (the spark, the paper).
    if (!force && lastAt.distanceTo(at) < R.stillCm && frame - lastRefresh < R.stillEveryFrames) return false;
    lastAt.copy(at); lastRefresh = frame;
    if (!tagged) tagReflected();
    if (cam.coordinateSystem !== renderer.coordinateSystem) { cam.coordinateSystem = renderer.coordinateSystem; cam.updateCoordinateSystem(); }
    cam.position.copy(at);
    cam.updateMatrixWorld(true);
    sky.position.copy(at);
    face = 0;
    if (force) { let done = false; while (!done) done = drawFace(hide); pmremDue = false; rt.texture.needsPMREMUpdate = true; return true; }
    return drawFace(hide);
  }

  /** Draw the next face (scene, then 40 % studio over it). Returns true when the cube is complete. @param {THREE.Object3D[]} hide */
  function drawFace(hide) {
    if (!rt || !cam || face < 0) return false;
    const i = face;
    const prev = renderer.getRenderTarget(), prevFace = renderer.getActiveCubeFace(), prevMip = renderer.getActiveMipmapLevel();
    const vis = hide.map(o => o.visible);
    for (const o of hide) o.visible = false;
    const bg = scene.background;
    scene.background = studioCube;
    const faceCam = /** @type {THREE.Camera} */ (cam.children[i]);
    renderer.setRenderTarget(rt, i);
    renderer.render(scene, faceCam);
    scene.background = bg;
    hide.forEach((o, k) => { o.visible = vis[k]; });
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(mixScene, faceCam);
    renderer.autoClear = auto;
    renderer.setRenderTarget(prev, prevFace, prevMip);
    face = i + 1;
    if (face < 6) return false;
    face = -1;
    pmremDue = true;
    refreshes++;
    return true;
  }

  setTier(tier);
  return {
    /** Use the reflections on this material. @param {THREE.MeshPhysicalMaterial} m */
    attach(m) { materials.push(m); apply(m); },
    update,
    setTier,
    get texture() { return rt ? rt.texture : null; },
    get state() { return { cubePx: rt ? rt.width : 0, every, refreshes }; },
    dispose() { rt?.dispose(); mixMat.dispose(); sky.geometry.dispose(); },
  };
}
