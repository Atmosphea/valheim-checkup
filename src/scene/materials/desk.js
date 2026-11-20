// @ts-check
/**
 * Desk (file 05): dark planks under the paper, lit normally, mostly seen at the frame edges.
 *
 * WP-16A (Paul item 6): "more gnarled and woodsy: knots, deep grain, worn edges". Done in the
 * shader over the shared walnut (a texture set of its own would cost ~24 MB of GPU memory, and
 * High is at 287 of its 300 MB):
 *   knots       one cell per ~26 cm of each plank, about half of them holding a knot: a dark,
 *               rough heartwood core with tight rings, and the grain swept around it (the maps
 *               are read from coordinates pushed away from the knot, so the rings bend round it)
 *   deep grain  darker latewood (a contrast curve on the albedo), the normal map at 1.8×, and a
 *               few long drying checks along the grain
 *   worn edges  the last ~1 cm at each plank's long edges is lighter, matte and rubbed, with dirt
 *               packed into the gap between planks
 * Plank rows come from world y (layout.desk); each row has its own random knot offsets.
 */
import * as THREE from 'three';
import { materials as M } from '../../config/render.js';
import { desk as LD } from '../../config/layout.js';
import { view } from './patch.js';

const DESK_HEAD = /* glsl */ `
uniform vec4 uDeskRows;      // y0, plank width, gap, knot cell length (cm)
uniform vec4 uDeskUv;        // uv per cm along x, uv per cm along y (plank uv space), knot share, seed
uniform mat2 uDeskUvMat;     // the maps' uv transform (linear part)
uniform vec4 uDeskLook;      // grain contrast, wear width (cm), wear lift, check share
uniform vec4 uDeskLook2;     // figure bands per cm, figure darkening, relief strength, knot size
varying vec3 vDeskPos;
float dHash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
// knot nearest to world point p in its plank row: centre (xy), radius (z), present (w)
vec4 dKnot(vec2 p, float row, float cell) {
  float L = uDeskRows.w, W = uDeskRows.y;
  float rowOff = dHash(vec2(row, uDeskUv.w)) * 97.0;
  float h1 = dHash(vec2(cell, row + 0.37)), h2 = dHash(vec2(cell + 0.71, row)), h3 = dHash(vec2(row - 0.13, cell));
  vec2 c = vec2((cell + 0.2 + 0.6 * h1) * L - rowOff, uDeskRows.x + (row + 0.28 + 0.44 * h2) * W);
  return vec4(c, 0.55 + 1.15 * h3 * h3, step(h3, uDeskUv.z) * step(0.0, 1.0));
}
// the board-scale figure: wavy latewood bands along the plank (0 = earlywood, 1 = latewood)
float dFigure(vec2 p) {
  float W = uDeskRows.y;
  float row = floor((p.y - uDeskRows.x) / W);
  float rs = dHash(vec2(row, 9.1));
  float x = p.x + rs * 300.0;
  float warp = sin(x * 0.045 + rs * 6.0) * 2.4 + sin(x * 0.11 + rs * 2.0) * 0.8 + sin(x * 0.021 + rs * 11.0) * 3.8;
  float yy = p.y - uDeskRows.x - row * W;
  // flat-sawn: bands crowd towards the plank's heart line and open out to its edges
  float c = yy - W * (0.35 + 0.3 * rs) + warp * 0.35;
  float v = sign(c) * pow(abs(c), 0.8) * uDeskLook2.x + rs * 7.0;
  float f = fract(v);
  return smoothstep(0.0, 0.12, f) * (1.0 - smoothstep(0.32, 0.7, f));
}
// combined knot influence at p: push (world cm, across the grain), core (0–1), rings, nearest distance
vec4 dKnots(vec2 p, out float ringsOut) {
  float W = uDeskRows.y, L = uDeskRows.w;
  float row = floor((p.y - uDeskRows.x) / W);
  float rowOff = dHash(vec2(row, uDeskUv.w)) * 97.0;
  float cell = floor((p.x + rowOff) / L);
  vec2 push = vec2(0.0); float core = 0.0, near = 1e3; ringsOut = 0.0;
  for (int i = -1; i <= 1; i++) {
    float h3 = dHash(vec2(row - 0.13, cell + float(i)));
    if (h3 > uDeskUv.z) continue;
    vec4 k = dKnot(p, row, cell + float(i));
    vec2 d = p - k.xy;
    // stretched along the grain (x), as a branch cut through a board is
    vec2 e = vec2(d.x / (k.z * 1.9), d.y / k.z);
    float r = length(e);
    near = min(near, r);
    // rings sweep round the knot: sample from nearer the knot's centre line, fading over ~5 radii along x
    float sweep = exp(-max(0.0, r - 1.0) * 0.55) * exp(-abs(d.x) / (k.z * 7.0));
    push.y -= sign(d.y) * k.z * 1.25 * sweep * smoothstep(0.0, 1.0, r);
    push.x += d.x * 0.08 * sweep;
    core = max(core, 1.0 - smoothstep(0.75, 1.05, r));
    ringsOut = max(ringsOut, (0.5 + 0.5 * cos(r * 18.0)) * (1.0 - smoothstep(0.8, 1.6, r)));
  }
  return vec4(push, core, near);
}
`;

/**
 * One plank's material: the walnut texture turned so the grain runs along x, with its own offset.
 * @param {import('../textures/index.js').Textures} tex
 * @param {{ lengthCm: number, widthCm: number, offset?: [number, number], shade?: number, gnarled?: boolean }} o
 */
export function createDeskPlank(tex, o) {
  const D = M.desk;
  const w = tex.out.walnut;
  // the plank's u runs along its length (x); the walnut's grain runs along its v, so turn it 90°
  // (three applies repeat before rotation: repeat.x ends up along the walnut's 48 cm v)
  const repeat = /** @type {[number, number]} */ ([o.lengthCm / 48, o.widthCm / 24]);
  const opts = { repeat, offset: o.offset ?? [0, 0], rotation: Math.PI / 2 };
  const map = view(w.albedo.texture, opts);
  const gnarled = o.gnarled ?? false;
  const mat = new THREE.MeshStandardMaterial({
    name: 'desk',
    map,
    color: new THREE.Color().setScalar(D.shade * (o.shade ?? 1)),
    normalMap: view(w.normal.texture, opts),
    normalScale: new THREE.Vector2(D.normalStrength, D.normalStrength).multiplyScalar(gnarled ? D.gnarl.normalBoost : 1),
    roughnessMap: view(w.roughness.texture, opts),
    roughness: D.roughness / M.oiledWood.mapMeanRoughness,
    metalness: 0,
  });
  if (gnarled) gnarl(mat, map, o);
  return mat;
}

/**
 * WP-16A: the knots, deep grain and worn edges (see the file comment).
 * @param {THREE.MeshStandardMaterial} mat @param {THREE.Texture} map
 * @param {{ lengthCm: number, widthCm: number }} o
 */
function gnarl(mat, map, o) {
  const G = M.desk.gnarl;
  map.updateMatrix();
  const e = map.matrix.elements;
  const uniforms = {
    uDeskRows: { value: new THREE.Vector4(LD.y0, LD.plankWidth, LD.gap, G.knotCellCm) },
    uDeskUv: { value: new THREE.Vector4(1 / o.lengthCm, 1 / o.widthCm, G.knotShare, G.seed) },
    uDeskUvMat: { value: new THREE.Matrix3().set(e[0], e[3], 0, e[1], e[4], 0, 0, 0, 1) },
    uDeskLook: { value: new THREE.Vector4(G.grainContrast, G.wearCm, G.wearLift, G.checkShare) },
    uDeskLook2: { value: new THREE.Vector4(G.figurePerCm, G.figureDark, G.relief, G.knotCm) },
  };
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    // three's mat2 from a Matrix3 uniform: pass the 2 × 2 through a mat3 and take its corner
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDeskPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvDeskPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    let fs = shader.fragmentShader.replace('uniform mat2 uDeskUvMat;', '');
    fs = fs.replace('#include <common>', `#include <common>\nuniform mat3 uDeskUvMat3;\n${DESK_HEAD.replace('uniform mat2 uDeskUvMat;', '')}`);
    // one shared computation before the first map read: the knot field and the bent uv offset
    fs = fs.replace('void main() {', `vec2 dOff; float dCore, dRings, dNear, dEdge, dGap, dBand, dCheck;
void main() {
  {
    vec4 k = dKnots(vDeskPos.xy, dRings);
    dCore = k.z; dNear = k.w;
    // the figure is read through the same push, so its bands sweep round the knots
    dBand = dFigure(vDeskPos.xy + k.xy * 1.6);
    vec2 duv = vec2(k.x * uDeskUv.x, k.y * uDeskUv.y);
    dOff = mat2(uDeskUvMat3[0].xy, uDeskUvMat3[1].xy) * duv;
    float fv = fract((vDeskPos.y - uDeskRows.x) / uDeskRows.y);
    dEdge = min(fv, 1.0 - fv) * uDeskRows.y;       // cm to the plank's nearer long edge
    dGap = 1.0 - smoothstep(0.0, uDeskRows.z * 0.9, dEdge);
  }`);
    fs = fs.replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv + dOff );
  diffuseColor *= sampledDiffuseColor;
#endif
  {
    // deep grain: a contrast curve that sinks the latewood
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    diffuseColor.rgb *= pow(clamp(lum / 0.075, 0.0, 3.0), uDeskLook.x - 1.0);
    // drying checks: a few long, thin dark splits along the grain
    float rowC = floor((vDeskPos.y - uDeskRows.x) / uDeskRows.y);
    float seg = floor(vDeskPos.x / 37.0 + dHash(vec2(rowC, 3.1)) * 9.0);
    float on = step(1.0 - uDeskLook.w, dHash(vec2(seg, rowC + 5.3)));
    float cy = uDeskRows.x + (rowC + 0.2 + 0.6 * dHash(vec2(seg + 0.5, rowC))) * uDeskRows.y + sin(vDeskPos.x * 0.21 + seg) * 0.25;
    float along = fract(vDeskPos.x / 37.0 + dHash(vec2(rowC, 3.1)) * 9.0);
    float check = on * (1.0 - smoothstep(0.015, 0.07, abs(vDeskPos.y - cy))) * smoothstep(0.0, 0.25, along) * smoothstep(1.0, 0.6, along);
    dCheck = check;
    diffuseColor.rgb *= 1.0 - check * 0.75;
    diffuseColor.rgb *= 1.0 - dBand * uDeskLook2.y;
    // knots: dark heartwood core with tight rings, a darker halo where the grain crowds in
    vec3 heart = diffuseColor.rgb * vec3(0.42, 0.33, 0.28);
    diffuseColor.rgb = mix(diffuseColor.rgb, heart * (0.75 + 0.5 * dRings), dCore);
    diffuseColor.rgb *= 1.0 - 0.28 * (1.0 - smoothstep(1.0, 2.2, dNear)) * (1.0 - dCore);
    // worn edges: the oil and the dark wax rubbed off the long edges; dirt packed in the gap
    float wear = 1.0 - smoothstep(uDeskRows.z * 0.6, uDeskLook.y, dEdge);
    float rub = dHash(floor(vDeskPos.xy * vec2(0.9, 6.0)));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uDeskLook.z * (0.85 + 0.3 * rub), wear * 0.8);
    diffuseColor.rgb *= 1.0 - dGap * 0.85;
  }`);
    fs = fs.replace('#include <roughnessmap_fragment>', `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv + dOff );
  roughnessFactor *= texelRoughness.g;
#endif
  {
    float wear = 1.0 - smoothstep(uDeskRows.z * 0.6, uDeskLook.y, dEdge);
    roughnessFactor = mix(roughnessFactor, 0.85, max(wear * 0.7, max(dCore * 0.6, dGap)));
  }`);
    fs = fs.replace('#include <normal_fragment_maps>', `
#if defined( USE_NORMALMAP_TANGENTSPACE )
  vec3 mapN = texture2D( normalMap, vNormalMapUv + dOff ).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale * (1.0 + dCore * 0.8);
  normal = normalize( tbn * mapN );
#else
  #include <normal_fragment_maps>
#endif
  {
    // relief: latewood and checks sit low, knot rims stand proud (screen-space bump)
    float h = -dBand * 0.5 - dCheck * 1.2 + dRings * 0.35 * (1.0 - dCore) + dCore * 0.25 - dGap * 0.8;
    vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
    float hx = dFdx(h), hy = dFdy(h);
    vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
    float det = dot(dpdx, r1);
    vec3 grad = sign(det) * (hx * r1 + hy * r2);
    normal = normalize(abs(det) * normal - grad * uDeskLook2.z);
  }`);
    shader.fragmentShader = fs;
    shader.uniforms.uDeskUvMat3 = uniforms.uDeskUvMat;
  };
  mat.customProgramCacheKey = () => 'desk-gnarl';
}
