// @ts-check
/**
 * Small, composable additions to three.js's built-in materials (onBeforeCompile).
 * Several patches can sit on one material (gold = rim polish + engraving). Each patch names
 * its code by hook:
 *
 *   vertexHead / vertexBody     declarations / code after <begin_vertex> (`position`, `normal`, `uv` readable)
 *   fragmentHead                declarations (uniforms, varyings, functions)
 *   afterMap                    after <map_fragment>: `diffuseColor` is set; compute shared values here
 *   afterRoughness              after <roughnessmap_fragment>: `roughnessFactor`
 *   mapN                        inside the normal-map chunk: `mapN` (tangent-space, xy scaled) before
 *                               `normal = normalize(tbn * mapN)` (needs a normalMap on the material)
 *   afterEmissive               after <emissivemap_fragment>: `totalEmissiveRadiance`
 *   afterAO                     after <aomap_fragment>: `reflectedLight`
 *   fragmentEnd                 after <dithering_fragment>: the final `gl_FragColor` (WP-07)
 *
 * Patched materials with the same patch keys share one compiled program.
 */
import * as THREE from 'three';

/**
 * @typedef {object} Patch
 * @property {string} key
 * @property {Record<string, THREE.IUniform>} [uniforms]
 * @property {string} [vertexHead]
 * @property {string} [vertexBody]
 * @property {string} [fragmentHead]
 * @property {string} [afterMap]
 * @property {string} [afterRoughness]
 * @property {string} [mapN]
 * @property {string} [afterEmissive]
 * @property {string} [afterAO]
 * @property {string} [fragmentEnd]
 */

const NORMAL_CHUNK = (/** @type {string} */ hooks) => /* glsl */ `
#if defined( USE_NORMALMAP_TANGENTSPACE )
  vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale;
  ${hooks}
  normal = normalize( tbn * mapN );
#else
  #include <normal_fragment_maps>
#endif
`;

/**
 * @param {THREE.Material} material
 * @param {Patch} patch
 */
export function addPatch(material, patch) {
  /** @type {Patch[]} */
  const list = (material.userData.vcPatches ??= []);
  if (list.some(p => p.key === patch.key)) throw new Error(`patch ${patch.key} is already on this material`);
  list.push(patch);
  const join = (/** @type {keyof Patch} */ k) => list.map(p => p[k] ?? '').filter(Boolean).join('\n');
  material.onBeforeCompile = shader => {
    for (const p of list) Object.assign(shader.uniforms, p.uniforms ?? {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${join('vertexHead')}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${join('vertexBody')}`);
    let fs = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${join('fragmentHead')}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${join('afterMap')}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${join('afterRoughness')}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${join('afterEmissive')}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${join('afterAO')}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${join('fragmentEnd')}`);
    const mapN = join('mapN');
    if (mapN) fs = fs.replace('#include <normal_fragment_maps>', NORMAL_CHUNK(mapN));
    shader.fragmentShader = fs;
  };
  const key = list.map(p => p.key).join('+');
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
  return material;
}

/** The uniforms a patch put on a material (to animate them). @param {THREE.Material} m @param {string} key */
export function patchUniforms(m, key) {
  const p = /** @type {Patch[]} */ (m.userData.vcPatches ?? []).find(x => x.key === key);
  return p?.uniforms ?? {};
}

/**
 * A texture that shares another's GPU image but has its own repeat / offset / rotation.
 * Render-target textures can't be cloned that way in three.js (a clone gets an empty GL
 * texture), so for them this wraps the target's own GL texture in an ExternalTexture; its
 * wrap and filter settings are the target's (textures/gpu.js makes them repeat, mipmapped).
 * @param {THREE.Texture} t
 * @param {{ repeat?: [number, number], offset?: [number, number], rotation?: number }} [o]
 */
export function view(t, o = {}) {
  /** @type {THREE.Texture} */
  let v;
  if (t.isRenderTargetTexture) {
    const gl = t.userData.vcGL;
    if (!gl) throw new Error(`view(): render target texture "${t.name}" has no GL texture yet`);
    v = new THREE.ExternalTexture(gl);
    v.colorSpace = t.colorSpace;
    v.name = t.name;
  } else {
    v = t.clone();
  }
  v.wrapS = v.wrapT = THREE.RepeatWrapping;
  if (o.repeat) v.repeat.set(...o.repeat);
  if (o.offset) v.offset.set(...o.offset);
  if (o.rotation) { v.rotation = o.rotation; v.center.set(0.5, 0.5); }
  return v;
}

export const lin = (/** @type {number[]} */ rgb) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);
