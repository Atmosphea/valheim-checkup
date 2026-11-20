// @ts-check
/**
 * Lights and environment, exactly the file 05 list:
 *   Key   warm directional (3,200 K) from the upper left, soft shadows
 *   Fill  hemisphere, warm sky and dark ground, low
 *   Rim   small cool directional from the right, for steel edges
 *   Spark point light, no shadow (parked dark until WP-09)
 *   Environment: a warm studio built in-scene (large warm softbox, small cool fill, rim strip,
 *   plus WP-05's warm bounce from the sheet below),
 *   captured to a cube target and filtered with PMREMGenerator. Fallback: RoomEnvironment.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { lights as lightsCfg, stage as S } from '../config/render.js';

/**
 * Colour of a black body at `kelvin` (Tanner Helland's fit), as a THREE.Color in sRGB.
 * @param {number} kelvin
 */
export function kelvinToColor(kelvin) {
  const t = kelvin / 100;
  const clamp = (/** @type {number} */ v) => Math.min(255, Math.max(0, v)) / 255;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return new THREE.Color().setRGB(clamp(r), clamp(g), clamp(b), THREE.SRGBColorSpace);
}

/** Key light direction (unit vector towards the light). */
export const keyDirection = new THREE.Vector3(...S.keyFromVec).normalize();

/**
 * @param {THREE.Scene} scene
 * @param {{ shadowMap: number, intensityScale?: number }} o
 */
export function addLights(scene, o) {
  const warm = kelvinToColor(lightsCfg.keyKelvin);
  const key = new THREE.DirectionalLight(warm, S.keyIntensity);
  key.name = 'key';
  key.position.copy(keyDirection).multiplyScalar(150);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  configureShadow(key, o.shadowMap);
  scene.add(key, key.target);

  const fill = new THREE.HemisphereLight(S.fillSky, S.fillGround, S.fillIntensity);
  fill.name = 'fill';
  fill.position.set(0, 0, 1); // sky is +z (out of the paper)
  scene.add(fill);

  const rim = new THREE.DirectionalLight(S.rimColor, S.rimIntensity);
  rim.name = 'rim';
  rim.position.set(...S.rimFromVec);
  scene.add(rim);

  const spark = new THREE.PointLight('#ffb36b', S.sparkIntensity, 40, 2);
  spark.name = 'spark';
  spark.castShadow = lightsCfg.sparkShadow;
  spark.position.set(0, 0, 3);
  scene.add(spark);

  return { key, fill, rim, spark, warm };
}

/**
 * Orthographic shadow camera that covers the whole desk area seen by the camera.
 * @param {THREE.DirectionalLight} light @param {number} size
 */
export function configureShadow(light, size) {
  const sc = light.shadow.camera;
  sc.left = -75; sc.right = 75; sc.top = 60; sc.bottom = -60; sc.near = 50; sc.far = 300;
  sc.updateProjectionMatrix();
  light.shadow.mapSize.set(size, size);
  light.shadow.bias = S.keyShadowBias;
  light.shadow.normalBias = 0.02;
  light.shadow.radius = S.keyShadowRadius;
  if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
}

/**
 * The warm studio: a dark room with three glowing panels, captured with PMREM.
 * @param {THREE.WebGLRenderer} renderer
 * @returns {{ texture: THREE.Texture, cube: THREE.Texture | null, kind: 'studio'|'room', dispose: () => void }}
 */
export function buildEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new THREE.Scene();
  const toDispose = /** @type {{dispose(): void}[]} */ ([]);
  try {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(400, 400, 400), new THREE.MeshBasicMaterial({ color: S.envWalls, side: THREE.BackSide }));
    room.add(shell);
    // WP-05: panels fall off softly towards their edges, so polished metal shows a gradient
    // (and reads as metal) instead of one flat sheet of light.
    const falloff = softPanelTexture(S.envSoftboxEdge);
    toDispose.push(falloff);
    /** @param {{color: string, intensity: number}} p @param {number} w @param {number} h @param {[number, number, number]} pos */
    const panel = (p, w, h, pos) => {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color).multiplyScalar(p.intensity), map: falloff, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      mesh.position.set(...pos);
      mesh.lookAt(0, 0, 0);
      room.add(mesh);
      toDispose.push(mesh.geometry, m);
    };
    // large warm softbox, above and towards the key light's side
    panel(S.envSoftbox, S.envSoftbox.size[0], S.envSoftbox.size[1], /** @type {[number, number, number]} */ (S.envSoftbox.pos));
    // warm bounce from the sheet, underneath
    panel(S.envBounce, S.envBounce.size[0], S.envBounce.size[1], /** @type {[number, number, number]} */ (S.envBounce.pos));
    // small cool fill, low on the right
    panel(S.envCoolFill, 50, 40, [150, -60, 40]);
    // thin rim strip, right side
    panel(S.envRimStrip, 14, 160, [160, 40, 90]);
    toDispose.push(shell.geometry, /** @type {THREE.Material} */ (shell.material));
    const rt = pmrem.fromScene(room, 0.04, 1, 1000);
    // WP-05: an unfiltered copy of the same studio as a plain cube, for the gauntlet's
    // reflection mix (60% live cube camera, 40% studio).
    const cubeRT = new THREE.WebGLCubeRenderTarget(S.envCubePx, { type: THREE.HalfFloatType, generateMipmaps: false });
    new THREE.CubeCamera(1, 1000, cubeRT).update(renderer, room);
    return { texture: rt.texture, cube: cubeRT.texture, kind: 'studio', dispose: () => { rt.dispose(); cubeRT.dispose(); pmrem.dispose(); } };
  } catch (e) {
    console.warn('studio environment failed, using RoomEnvironment', e);
    const rt = pmrem.fromScene(new RoomEnvironment(), 0.04);
    return { texture: rt.texture, cube: null, kind: 'room', dispose: () => { rt.dispose(); pmrem.dispose(); } };
  } finally {
    for (const d of toDispose) d.dispose();
  }
}

/**
 * A small radial gradient (centre 1 → edge `edge`) for the studio panels.
 * @param {number} edge
 */
function softPanelTexture(edge) {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + 0.5) / n * 2 - 1, v = (y + 0.5) / n * 2 - 1;
    const r = Math.min(1, Math.max(Math.abs(u), Math.abs(v)) * 0.6 + Math.hypot(u, v) * 0.4);
    const k = edge + (1 - edge) * Math.pow(Math.cos(r * Math.PI / 2), 1.5);
    const i = (y * n + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = Math.round(k * 255); data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n);
  t.colorSpace = THREE.NoColorSpace; // a plain multiplier
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
