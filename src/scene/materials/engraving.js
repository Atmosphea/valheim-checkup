// @ts-check
/**
 * Engraving (file 05): bar names, coin legends, plaque. Adds an engraved string from the
 * engraving atlas to any metal material: a normal map 0.03 cm deep, a darker cavity colour and
 * cavity roughness 0.5. The text sits on the part of the mesh's uv given by `faceRect`, only on
 * faces pointing along `axis` (object space), so a box's sides stay plain; axis [0, 0, 0] = any face.
 */
import * as THREE from 'three';
import { materials as M } from '../../config/render.js';
import { addPatch } from './patch.js';

/**
 * @param {THREE.MeshStandardMaterial} material   must have a normalMap (engraving bends its normals)
 * @param {import('../textures/engrave.js').Engraver} engraver
 * @param {string} slotId
 * @param {{ faceRect?: [number, number, number, number], axis?: [number, number, number], faceWidthCm: number, depth?: number, cavityShade?: number, boldTexels?: number, specCut?: number, rim?: number, rimTexels?: number }} o
 *   boldTexels (WP-10): thicken the strokes by this many atlas texels; specCut: how much of the
 *   key light's direct highlight the cavity loses (0 = WP-05 look); rim: a light catch-line under each stroke
 *   faceRect: mesh uv (u0, v0, u1, v1) the text fills; faceWidthCm: the face's width in cm (for the depth)
 */
export function applyEngraving(material, engraver, slotId, o) {
  const E = M.engraving;
  const slot = engraver.slot(slotId);
  // WP-06: `deferred` lets a material be built before the atlas is drawn; refreshEngraving() fills it in
  if (!slot && !o.deferred) throw new Error(`nothing engraved for "${slotId}"`);
  if (!material.normalMap) throw new Error('applyEngraving needs a material with a normalMap');
  const fr = o.faceRect ?? [0, 0, 1, 1];
  const rect = slot ? slot.rect.clone() : new THREE.Vector4(0, 0, 0, 0);
  const uniforms = {
    uEngMap: { value: engraver.texture },
    uEngRect: { value: rect },
    /** WP-06: a second string and a wipe across the face (the 180 ms label swap). */
    uEngRect2: { value: rect.clone() },
    uEngWipe: { value: 0 },
    uEngFace: { value: new THREE.Vector4(...fr) },
    uEngAxis: { value: new THREE.Vector3(...(o.axis ?? [0, 0, 1])) },
    uEngScale: { value: slot ? engraveScale(slot, engraver, fr, o) : 0 },
    uEngShade: { value: o.cavityShade ?? E.cavityShade },
    uEngRough: { value: E.cavityRoughness },
    // WP-10 bar-name legibility; 0 everywhere else, so other engravings keep their look
    uEngBold: { value: (o.boldTexels ?? 0) / (engraver.size ?? E.atlasPx) },
    uEngSpecCut: { value: o.specCut ?? 0 },
    uEngRim: { value: o.rim ?? 0 },
    uEngRimOff: { value: (o.rimTexels ?? 0) / (engraver.size ?? E.atlasPx) },
  };
  addPatch(material, {
    key: 'engraving',
    uniforms,
    vertexHead: 'varying vec2 vcEngUv; varying vec3 vcEngN;',
    vertexBody: 'vcEngUv = uv; vcEngN = normal;',
    fragmentHead: `uniform sampler2D uEngMap; uniform vec4 uEngRect; uniform vec4 uEngRect2; uniform float uEngWipe; uniform vec4 uEngFace; uniform vec3 uEngAxis;
      uniform float uEngScale; uniform float uEngShade; uniform float uEngRough;
      uniform float uEngBold; uniform float uEngSpecCut; uniform float uEngRim; uniform float uEngRimOff;
      varying vec2 vcEngUv; varying vec3 vcEngN;`,
    afterMap: `
      vec4 vcEng = vec4(0.5, 0.5, 1.0, 0.0);
      vec2 vcEngA = vec2(-1.0);
      {
        vec2 l = (vcEngUv - uEngFace.xy) / (uEngFace.zw - uEngFace.xy);
        if (all(greaterThanEqual(l, vec2(0.0))) && all(lessThanEqual(l, vec2(1.0))) && (dot(uEngAxis, uEngAxis) < 0.01 || dot(normalize(vcEngN), uEngAxis) > 0.5))
          { vec4 r = l.x < uEngWipe ? uEngRect2 : uEngRect; vcEngA = mix(r.xy, r.zw, l); vcEng = texture2D(uEngMap, vcEngA); }
      }
      float vcCav = vcEng.a;
      float vcEngLip = 0.0;
      if (vcEngA.x >= 0.0 && uEngBold > 0.0) {
        vec2 d = vec2(uEngBold, uEngBold * 0.6);
        float b = max(max(texture2D(uEngMap, vcEngA + vec2(d.x, 0.0)).a, texture2D(uEngMap, vcEngA - vec2(d.x, 0.0)).a),
                      max(texture2D(uEngMap, vcEngA + vec2(0.0, d.y)).a, texture2D(uEngMap, vcEngA - vec2(0.0, d.y)).a));
        vcCav = max(vcCav, b);
      }
      if (vcEngA.x >= 0.0 && uEngRim > 0.0) {
        // the stroke just above this point (atlas v is up): a thin lit lip on the cavity's lower edge
        float above = texture2D(uEngMap, vcEngA + vec2(0.0, uEngRimOff)).a;
        vcEngLip = clamp(above - vcCav, 0.0, 1.0) * uEngRim;
      }
      diffuseColor.rgb *= mix(1.0, uEngShade, vcCav);`,
    afterRoughness: 'roughnessFactor = mix(roughnessFactor, uEngRough, vcCav);',
    mapN: 'mapN.xy += (vcEng.xy * 2.0 - 1.0) * uEngScale;',
    afterAO: `reflectedLight.indirectSpecular *= 1.0 - 0.55 * vcCav;
      reflectedLight.directSpecular *= 1.0 - uEngSpecCut * vcCav;
      reflectedLight.indirectSpecular *= 1.0 - uEngSpecCut * vcCav;
      reflectedLight.directDiffuse += vcEngLip * vec3(0.55, 0.5, 0.42);`,
  });
  material.userData.vcEngraving = { slotId, o };
  return material;
}

/** Normal-map slope for a slot on a face. @param {{rect: THREE.Vector4}} slot @param {{size?: number}} engraver @param {number[]} fr @param {{faceWidthCm: number, depth?: number}} o */
function engraveScale(slot, engraver, fr, o) {
  const E = M.engraving;
  const rectPx = (slot.rect.z - slot.rect.x) * (engraver.size ?? E.atlasPx);
  const texelCm = o.faceWidthCm * (fr[2] - fr[0]) / Math.max(1, rectPx);
  return (o.depth ?? E.depth) / texelCm * E.slopeScale;
}

/**
 * WP-06: point an engraved material at its slot again (after the atlas was (re)drawn), or at
 * another slot. `altSlotId` sets the second string the wipe reveals.
 * @param {THREE.Material} material
 * @param {import('../textures/engrave.js').Engraver} engraver
 * @param {{ slotId?: string, altSlotId?: string }} [o]
 */
export function refreshEngraving(material, engraver, o = {}) {
  const info = material.userData.vcEngraving;
  const p = /** @type {Patch[]} */ (material.userData.vcPatches ?? []).find(x => x.key === 'engraving');
  if (!info || !p?.uniforms) return false;
  if (o.slotId) info.slotId = o.slotId;
  const slot = engraver.slot(info.slotId);
  if (!slot) return false;
  const u = p.uniforms;
  u.uEngRect.value.copy(slot.rect);
  u.uEngScale.value = engraveScale(slot, engraver, info.o.faceRect ?? [0, 0, 1, 1], info.o);
  const alt = engraver.slot(o.altSlotId ?? info.altSlotId ?? info.slotId);
  if (o.altSlotId) info.altSlotId = o.altSlotId;
  u.uEngRect2.value.copy((alt ?? slot).rect);
  return true;
}

/** WP-06: wipe position 0..1 across the face (0 = first string everywhere, 1 = second). @param {THREE.Material} material @param {number} w */
export function setEngravingWipe(material, w) {
  const p = /** @type {Patch[]} */ (material.userData.vcPatches ?? []).find(x => x.key === 'engraving');
  if (p?.uniforms) p.uniforms.uEngWipe.value = w;
}

/** @typedef {import('./patch.js').Patch} Patch */
