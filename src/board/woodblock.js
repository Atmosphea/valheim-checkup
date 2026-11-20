// @ts-check
/**
 * The woodblock (WP-06): oiled walnut slab 28 × 36 × 3 cm, corner radius 0.6 cm, a 0.25 cm
 * bevel with 8 segments. Paul's scope cut: a plain bevelled border, no braided carving.
 *
 *   slab      ExtrudeGeometry; its top face wears the WP-05 board bake (grain, worn edges, slot
 *             occlusion) and the carved heading / divider / side note / inlay channels
 *             (engraving `board:face`). The grooves and the counter window are cut out of the
 *             top face in the shader (discard) and drawn as real cavities below it.
 *   grooves   13 routed slots 21 × 1.3 × 0.6 cm with a darker floor, plus the counter window
 *   inlays    brass lines 20 × 0.2 cm on the lip above each collection slot, filled to done / total
 *   tabs      brass tabs 1.6 × 0.9 cm at each slot's right end, engraved with the count
 *   plaque    brass, 10 × 2.2 cm, engraved "Collection targets ⓘ" and "/ 1,461", with 4 digit
 *             wheels (a mechanical counter) behind a window
 *
 * Everything is built in board cm inside `root` (placed at the woodblock's corner).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { woodblock as WB } from '../config/layout.js';
import { board as BR } from '../config/render.js';
import { createOiledWood, createBrass, applyEngraving } from '../scene/materials/index.js';
import { addPatch, patchUniforms } from '../scene/materials/patch.js';
import { rows, plaque as plaqueLayout, cutouts, board as B } from './layout.js';
import { planarUv } from './geometry.js';

/** Seen only by the key light's shadow camera (= PROXY_LAYER in gauntlet/model.js). */
const SHADOW_ONLY_LAYER = 2;

/** Rounded rectangle path. @param {THREE.Shape|THREE.Path} p */
function roundRect(p, x0, y0, x1, y1, r) {
  p.moveTo(x0 + r, y0);
  p.lineTo(x1 - r, y0); p.quadraticCurveTo(x1, y0, x1, y0 + r);
  p.lineTo(x1, y1 - r); p.quadraticCurveTo(x1, y1, x1 - r, y1);
  p.lineTo(x0 + r, y1); p.quadraticCurveTo(x0, y1, x0, y1 - r);
  p.lineTo(x0, y0 + r); p.quadraticCurveTo(x0, y0, x0 + r, y0);
  return p;
}

/**
 * @param {import('../scene/textures/index.js').Textures} tex
 * @param {{ tabEngraver: import('../scene/textures/engrave.js').Engraver }} o
 */
export function createWoodblock(tex, o) {
  const root = new THREE.Group();
  root.name = 'woodblock-root';
  root.position.set(WB.x0, WB.y0, 0);
  const T = B.thickness;

  // ── Slab ──────────────────────────────────────────────────────────────────────────────
  const bev = B.bevel;
  const shape = roundRect(new THREE.Shape(), bev, bev, B.width - bev, B.height - bev, Math.max(0.05, B.cornerRadius - bev));
  const slabGeo = new THREE.ExtrudeGeometry(shape, {
    depth: T - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: B.bevelSegments, curveSegments: 8,
  });
  slabGeo.translate(0, 0, bev);
  // caps: uv = the board's top face 0..1 (the bake and the engraving); sides: cm, for raw walnut
  {
    const pos = slabGeo.getAttribute('position'), uv = slabGeo.getAttribute('uv');
    const caps = slabGeo.groups[0];
    for (let i = 0; i < pos.count; i++) {
      const inCap = i >= caps.start && i < caps.start + caps.count;
      if (inCap) uv.setXY(i, pos.getX(i) / B.width, pos.getY(i) / B.height);
    }
    uv.needsUpdate = true;
  }
  const top = createOiledWood(tex);
  top.name = 'woodblock-top';
  const sides = createOiledWood(tex, { raw: true, repeat: [1 / 24, 1 / 48] });
  sides.name = 'woodblock-sides';
  // the grooves and the counter window are cut out of the top face (and drawn as cavities)
  const cuts = cutouts();
  const cutVecs = Array.from({ length: 16 }, (_, i) => (cuts[i] ? new THREE.Vector4(cuts[i].x0, cuts[i].y0, cuts[i].x1, cuts[i].y1) : new THREE.Vector4(1e4, 1e4, 1e4, 1e4)));
  addPatch(top, {
    key: 'boardCutouts',
    uniforms: { uCut: { value: cutVecs }, uTopZ: { value: T } },
    vertexHead: 'varying vec3 vcBoardPos;',
    vertexBody: 'vcBoardPos = position;',
    fragmentHead: 'uniform vec4 uCut[16]; uniform float uTopZ; varying vec3 vcBoardPos;',
    afterMap: `if (vcBoardPos.z > uTopZ - 0.002) {
        for (int i = 0; i < 16; i++) {
          vec4 r = uCut[i];
          if (vcBoardPos.x > r.x && vcBoardPos.x < r.z && vcBoardPos.y > r.y && vcBoardPos.y < r.w) discard;
        }
      }`,
  });
  applyEngraving(top, tex.engraver, 'board:face', { faceRect: [0, 0, 1, 1], axis: [0, 0, 1], faceWidthCm: B.width, deferred: true, depth: BR.engraveDepth, cavityShade: BR.engraveCavityShade });
  const slab = new THREE.Mesh(slabGeo, [top, sides]);
  slab.name = 'woodblock';
  slab.receiveShadow = true;
  // Layer 1 draws the paper unlit, so the slab's own shadow would only fall into its grooves;
  // the board's shadow on the paper comes from its veil copy (layer 3).
  slab.castShadow = false;
  root.add(slab);

  // ── Grooves (and the counter window's pit) as cavities ───────────────────────────────────
  const boxes = cuts.map((c, i) => {
    const depth = i < cuts.length - 2 ? B.groove.depth : i === cuts.length - 2 ? B.rowSlider.depth : BR.windowPitDepth; // WP-17 item 17: the row-height groove
    const g = new THREE.BoxGeometry(c.x1 - c.x0, c.y1 - c.y0, depth);
    g.translate((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, T - depth / 2);
    planarUv(g, { scale: 1 / 24 });
    return g;
  });
  const grooveMat = createOiledWood(tex, { raw: true, repeat: [1, 0.5] });
  grooveMat.name = 'groove';
  grooveMat.color.setScalar(BR.grooveShade);
  grooveMat.side = THREE.BackSide; // the inside of each box: floor and walls
  const grooves = new THREE.Mesh(mergeGeometries(boxes), grooveMat);
  grooves.name = 'grooves';
  grooves.receiveShadow = true;
  for (const g of boxes) g.dispose();
  root.add(grooves);

  // ── Brass inlays and tabs ────────────────────────────────────────────────────────────────
  const rowList = rows();
  /** @type {Map<string, {inlay: THREE.Mesh|null, tab: THREE.Mesh, tabMat: THREE.MeshPhysicalMaterial, inlayMat: THREE.MeshPhysicalMaterial|null, row: import('./layout.js').Row}>} */
  const perRow = new Map();
  const tabGeo = new RoundedBoxGeometry(B.tab.w, B.tab.h, B.tab.thickness, 2, 0.03);
  planarUv(tabGeo, { x0: -B.tab.w / 2, x1: B.tab.w / 2, y0: -B.tab.h / 2, y1: B.tab.h / 2 });
  for (const r of rowList) {
    // Paul, WP-17 item 14: no lip inlay any more (the progress fill is on the bar itself, bars.js)
    const inlay = null, inlayMat = null;
    const tabMat = createBrass(tex, { repeat: [0.6, 0.4] });
    tabMat.name = `tab:${r.category}`;
    applyEngraving(tabMat, o.tabEngraver, `tab:${r.category}`, { faceRect: [0, 0, 1, 1], axis: [0, 0, 1], faceWidthCm: B.tab.w, deferred: true, cavityShade: BR.tabEngraveShade, depth: BR.tabEngraveDepth, boldTexels: BR.tabBoldTexels, specCut: BR.tabSpecCut, rim: BR.tabRim, rimTexels: BR.tabRimTexels }); // Paul, WP-17 item 15
    const tab = new THREE.Mesh(tabGeo, tabMat);
    tab.name = `tab:${r.category}`;
    tab.position.set((r.tab.x0 + r.tab.x1) / 2, (r.tab.y0 + r.tab.y1) / 2, T + B.tab.thickness / 2);
    tab.castShadow = false; tab.receiveShadow = true; // WP-14: one merged shadow box for all tabs (below)
    root.add(tab);
    perRow.set(r.category, { inlay, tab, tabMat, inlayMat, row: r });
  }

  // WP-14 (draw calls): the 13 tabs throw their shadows through one merged box mesh that only the
  // key light's shadow camera sees (layer 2, the gauntlet's proxy layer): 1 shadow draw, not 13
  {
    const boxes = rowList.map(r => new THREE.BoxGeometry(B.tab.w, B.tab.h, B.tab.thickness)
      .translate((r.tab.x0 + r.tab.x1) / 2, (r.tab.y0 + r.tab.y1) / 2, T + B.tab.thickness / 2).toNonIndexed());
    for (const g of boxes) { g.deleteAttribute('uv'); g.deleteAttribute('normal'); }
    const merged = mergeGeometries(boxes, false);
    for (const g of boxes) g.dispose();
    if (merged) {
      const tabShadow = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
      tabShadow.name = 'tabs-shadow-caster';
      tabShadow.castShadow = true;
      tabShadow.layers.set(SHADOW_ONLY_LAYER);
      root.add(tabShadow);
    }
  }

  // ── Plaque, window and digit wheels ──────────────────────────────────────────────────────
  const P = plaqueLayout(), PL = B.plaque;
  const hw = PL.w / 2, hh = PL.h / 2, pb = 0.03;
  const pShape = roundRect(new THREE.Shape(), -hw + pb, -hh + pb, hw - pb, hh - pb, PL.radius);
  const win = PL.window;
  pShape.holes.push(roundRect(new THREE.Path(), win.x0 - pb, win.y0 - pb, win.x1 + pb, win.y1 + pb, 0.05));
  const plaqueGeo = new THREE.ExtrudeGeometry(pShape, { depth: PL.thickness - 2 * pb, bevelEnabled: true, bevelThickness: pb, bevelSize: pb, bevelSegments: 2, curveSegments: 6 });
  plaqueGeo.translate(0, 0, pb);
  {
    const pos = plaqueGeo.getAttribute('position'), uv = plaqueGeo.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + hw) / PL.w, (pos.getY(i) + hh) / PL.h);
    uv.needsUpdate = true;
  }
  const plaqueMat = createBrass(tex, { repeat: [3, 0.7] });
  plaqueMat.name = 'plaque';
  applyEngraving(plaqueMat, tex.engraver, 'plaque:face', { faceRect: [0, 0, 1, 1], axis: [0, 0, 1], faceWidthCm: PL.w, deferred: true });
  const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
  plaque.name = 'plaque';
  plaque.position.set(P.cx, P.cy, T);
  plaque.castShadow = true; plaque.receiveShadow = true;
  root.add(plaque);

  const wheelTex = digitWheelTexture();
  const wheelMat = new THREE.MeshStandardMaterial({ name: 'digitWheel', map: wheelTex, metalness: 0.35, roughness: 0.42, color: 0xffffff });
  const wheelGeo = swapUv(new THREE.CylinderGeometry(PL.wheelRadius, PL.wheelRadius, PL.wheelWidth, 48, 1, false));
  wheelGeo.rotateZ(-Math.PI / 2); // axis along x
  /** @type {THREE.Mesh[]} */
  const wheels = [];
  const wx0 = P.window.x0, wx1 = P.window.x1;
  const gap = ((wx1 - wx0) - PL.wheels * PL.wheelWidth) / (PL.wheels + 1);
  for (let k = 0; k < PL.wheels; k++) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.name = `wheel-${k}`;
    w.position.set(wx0 + gap + PL.wheelWidth / 2 + k * (PL.wheelWidth + gap), (P.window.y0 + P.window.y1) / 2, T + PL.thickness - PL.wheelRadius - 0.025);
    w.receiveShadow = true;
    root.add(w);
    wheels.push(w);
  }

  return {
    root, slab, grooves, plaque, wheels, perRow, topMaterial: top, plaqueMaterial: plaqueMat,
    /** Meshes the veil copies as shadow casters. */
    casters: [slab, plaque],
    /** Turn wheel k to face position f (0…12, continuous; 0–9 digits, 10 "—", 11 blank). @param {number} k @param {number} f */
    setWheel(k, f) { wheels[k].rotation.x = wheelAngle(f); },
    dispose() {
      slabGeo.dispose(); grooves.geometry.dispose(); tabGeo.dispose(); plaqueGeo.dispose(); wheelGeo.dispose(); wheelTex.dispose();
      for (const m of [top, sides, grooveMat, plaqueMat, wheelMat]) m.dispose();
      for (const r of perRow.values()) r.tabMat.dispose();
    },
  };
}

/** Faces on each counter wheel: digits 0–9, "—" (no save) and a blank (leading digits). */
export const WHEEL_FACES = 12;
/**
 * The counter wheels' numerals: ivory on blued steel, one face per 30°. The wheel's uv is
 * swapped (see below) so v runs around it: face i covers v ∈ [i/12, (i+1)/12], and its centre
 * is at angle 2π(i + 0.5)/12 + π/2 measured from +y towards +z.
 */
function digitWheelTexture() {
  const facePx = 96, W = 128, H = facePx * WHEEL_FACES;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  ctx.fillStyle = '#1d2026';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '400 80px "IM Fell English", Georgia, serif';
  const glyphs = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '—', ''];
  glyphs.forEach((g, i) => {
    const yTop = H * (1 - (i + 1) / WHEEL_FACES);
    ctx.fillStyle = '#0c0d10';
    ctx.fillRect(0, yTop, W, 2);
    ctx.save();
    ctx.translate(W / 2, yTop + facePx / 2);
    ctx.scale(1, -1); // on the wheel's top, "up the board" is down the canvas
    ctx.fillStyle = '#efe3c6';
    ctx.fillText(g, 0, 3);
    ctx.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Swap a CylinderGeometry's uv so u runs along the axis and v around it. @param {THREE.BufferGeometry} g */
export function swapUv(g) {
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, u); }
  uv.needsUpdate = true;
  return g;
}

/** Wheel rotation (about x) that shows face position f on top. @param {number} f */
export const wheelAngle = f => -2 * Math.PI * (f + 0.5) / WHEEL_FACES;
