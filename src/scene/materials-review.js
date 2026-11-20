// @ts-check
/**
 * ?materials — the material review page (WP-05 step 6).
 *
 * One card per material in file 05's table, each with the four sample shapes (rounded box,
 * cylinder, disc, sphere) slowly turning on a sheet of paper on the desk, under the scene's own
 * lights and studio environment. `?materials=gold` shows one card close up.
 *
 * Test hooks on `__vc.materials`: ready, timing, hash(), memory(), measureHighlight(), turning().
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import '../fonts.css';
import { vc } from '../debug.js';
import { rng } from '../util/rng.js';
import { clock } from '../util/clock.js';
import render from '../config/render.js';
import { addLights, buildEnvironment } from './lights.js';
import { createTextures } from './textures/index.js';
import { defaultEntries } from './textures/engrave.js';
import {
  MATERIAL_TABLE, createBrushedSteel, applyEngraving, createKnurling, createGauntletSteel, createGauntletReflections,
  createLeather, createRivets, createGold, createBrass, setPour, createOiledWood, createLitPaper, createDeskPlank,
} from './materials/index.js';

const R = render;
const S = R.stage;
const CARD = { w: 25, h: 11, gap: 1.5 };
const SHAPES = ['rounded box', 'cylinder', 'disc', 'sphere'];

/** Review board: a small woodblock with two routed slots, so oiled wood shows its bake. */
const REVIEW_BOARD = { widthCm: 7, heightCm: 5, slots: [{ x0: 1.9, y0: 1.5, x1: 5.1, y1: 2.2 }, { x0: 1.9, y0: 2.8, x1: 5.1, y1: 3.5 }] };

async function start() {
  document.body.classList.add('vc-materials');
  const params = new URLSearchParams(location.search);
  const focus = params.get('materials') || '';
  const root = document.createElement('div');
  root.id = 'materialsReview';
  root.innerHTML = '<canvas id="materialsCanvas" aria-label="Material samples"></canvas><div class="vc-mr-labels" aria-hidden="false"></div><h1 class="vc-mr-title">Materials</h1>';
  document.body.append(root);
  const style = document.createElement('style');
  style.textContent = `
    body.vc-materials { overflow: hidden; }
    body.vc-materials > :not(#materialsReview):not(script):not(dialog):not(#toast) { display: none !important; }
    #materialsReview { position: fixed; inset: 0; background: #120c08; z-index: 50; }
    #materialsCanvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .vc-mr-title { position: absolute; left: 16px; top: 10px; margin: 0; font: 400 22px/1.2 "IM Fell English SC", serif; color: #f3e3c3; text-shadow: 0 1px 3px #000; }
    .vc-mr-labels { position: absolute; inset: 0; pointer-events: none; }
    .vc-mr-label { position: absolute; transform: translate(-50%, 0); text-align: center; white-space: nowrap;
      font: 400 15px/1.15 "IM Fell English", serif; color: #2b1d14; }
    .vc-mr-label b { display: block; font: 400 16px/1.1 "IM Fell English SC", serif; }
    .vc-mr-label small { font-size: 12px; opacity: 0.8; }
    @media (max-width: 600px) { .vc-mr-label { font-size: 12px; } .vc-mr-label b { font-size: 13px; } .vc-mr-label small { display: none; } }
  `;
  document.head.append(style);

  const canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('canvas'));
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = R.output.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(S.clearColor, 1);

  const scene = new THREE.Scene();
  const env = buildEnvironment(renderer);
  scene.environment = env.texture;
  scene.environmentIntensity = S.envIntensity;
  const lights = addLights(scene, { shadowMap: 2048 });
  lights.key.shadow.radius = S.keyShadowRadius;

  const tex = createTextures(renderer, {
    seed: rng.initialSeed,
    board: REVIEW_BOARD,
    engrave: () => [
      ...defaultEntries(),
      { id: 'review:bar', text: 'Master Chef', font: 'body', px: 96 },
      { id: 'review:plaque', text: '50/82', font: 'body', px: 110 },
      { id: 'review:coin', text: 'Load character', font: 'smallCaps', px: 64, shape: 'arc', arcRadiusPx: 230 },
      { id: 'review:heading', text: 'Achievements', font: 'smallCaps', px: 80 },
    ],
  });
  /** @type {any} */ (vc).materials = { ready: false, timing: tex.timing };
  await tex.run();
  console.info(`[materials] textures generated in ${tex.timing.totalMs.toFixed(0)} ms`);
  const turning = /** @type {THREE.Object3D[]} */ ([]);
  /** @type {{ id: string, group: THREE.Group, label: HTMLElement }[]} */
  const cards = [];
  let reflections = /** @type {ReturnType<typeof createGauntletReflections> | null} */ (null);
  let reflectionCard = /** @type {THREE.Group | null} */ (null);
  let brass = /** @type {THREE.Material | null} */ (null);

  // shapes (cm): all stand on the card at z = 0
  const geo = {
    box: new RoundedBoxGeometry(6, 3, 2.4, R.materials.brushedSteel.bevelSegments, R.materials.brushedSteel.bevelRadius * 4),
    cylinder: new THREE.CylinderGeometry(1.5, 1.5, 3.2, 64, 1),
    disc: new THREE.CylinderGeometry(2.2, 2.2, 0.4, 96, 1),
    sphere: new THREE.SphereGeometry(1.7, 96, 48),
  };
  geo.cylinder.rotateX(Math.PI / 2); // axis along z (up)
  /** Geometry that keeps the coin convention (axis along the geometry's y) for gold's rim. */
  const coinGeo = geo.disc;

  /** @param {string} id @returns {THREE.Material[]} materials for [box, cylinder, disc, sphere] */
  function materialsFor(id) {
    const half = new THREE.Vector3(3, 1.5, 1.2);
    switch (id) {
      case 'brushedSteel': return [createBrushedSteel(tex, { repeatU: 2, half }), createBrushedSteel(tex, { repeatU: 2 }), createBrushedSteel(tex, { repeatU: 2 }), createBrushedSteel(tex, { repeatU: 2 })];
      case 'engraving': {
        const bar = createBrushedSteel(tex, { repeatU: 2, half });
        applyEngraving(bar, tex.engraver, 'review:bar', { faceRect: [0.04, 0.12, 0.96, 0.88], axis: [0, 0, 1], faceWidthCm: 6 });
        const plaque = createBrass(tex);
        applyEngraving(plaque, tex.engraver, 'review:plaque', { faceRect: [0, 0.3, 0.5, 0.7], axis: [0, 0, 0], faceWidthCm: 9.4 });
        const coin = createGold(tex, { radius: 2.2 });
        applyEngraving(coin, tex.engraver, 'review:coin', { faceRect: [0, 0, 1, 1], axis: [0, 1, 0], faceWidthCm: 4.4 });
        const ball = createGauntletSteel(tex);
        applyEngraving(ball, tex.engraver, 'review:heading', { faceRect: [0.3, 0.42, 0.7, 0.58], axis: [0, 0, 0], faceWidthCm: 10.7 });
        return [bar, plaque, coin, ball];
      }
      case 'knurling': return [createKnurling(tex, { repeat: [3, 2] }), createKnurling(tex, { repeat: [6, 2] }), createKnurling(tex, { repeat: [2, 2] }), createKnurling(tex, { repeat: [6, 3] })];
      case 'gauntletSteel': return [0, 1, 2, 3].map(() => createGauntletSteel(tex));
      case 'gauntletReflections': return [0, 1, 2, 3].map(() => createGauntletSteel(tex));
      case 'leather': return [0, 1, 2, 3].map(() => createLeather(tex));
      case 'rivets': return [0, 1, 2, 3].map(() => createRivets());
      case 'gold': return [0, 1, 2, 3].map(i => createGold(tex, { radius: i === 2 ? 2.2 : 1e3 })); // rim polish only on the coin
      case 'brass': { const m = createBrass(tex); brass = m; return [m, createBrass(tex), createBrass(tex), createBrass(tex)]; }
      case 'oiledWood': return [createOiledWood(tex), createOiledWood(tex, { raw: true }), createOiledWood(tex, { raw: true }), createOiledWood(tex, { raw: true })];
      case 'paper': return [0, 1, 2, 3].map(() => createLitPaper(tex));
      case 'desk': return [0, 1, 2, 3].map(i => createDeskPlank(tex, { lengthCm: 12, widthCm: 6, offset: [i * 0.21, i * 0.13] }));
      default: throw new Error(id);
    }
  }

  // ── base: the desk, then one sheet of paper under the cards ─────────────────────────────
  const table = focus ? MATERIAL_TABLE.filter(m => m.id === focus) : MATERIAL_TABLE;
  if (!table.length) throw new Error(`?materials=${focus}: no such material (${MATERIAL_TABLE.map(m => m.id).join(', ')})`);
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), createDeskPlank(tex, { lengthCm: 400, widthCm: 400 }));
  desk.position.z = -0.05;
  desk.receiveShadow = true;
  scene.add(desk);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), createLitPaper(tex));
  sheet.receiveShadow = true;
  scene.add(sheet);

  const labels = /** @type {HTMLElement} */ (root.querySelector('.vc-mr-labels'));
  for (const entry of table) {
    const group = new THREE.Group();
    group.name = `card-${entry.id}`;
    const mats = materialsFor(entry.id);
    const meshes = [
      new THREE.Mesh(geo.box, mats[0]), new THREE.Mesh(geo.cylinder, mats[1]), new THREE.Mesh(coinGeo, mats[2]), new THREE.Mesh(geo.sphere, mats[3]),
    ];
    meshes[0].position.set(-9, 0, 1.2);
    meshes[1].position.set(-2.4, 0, 1.6);
    meshes[2].position.set(3.6, 0, 1.6); meshes[2].rotation.x = Math.PI / 2 - 0.9; // a coin propped up, face to the camera
    meshes[3].position.set(9.4, 0, 1.7);
    meshes.forEach((m, i) => {
      m.name = `${entry.id}-${SHAPES[i]}`;
      m.castShadow = true; m.receiveShadow = true;
      const spin = new THREE.Group();
      spin.position.copy(m.position); m.position.set(0, 0, 0);
      spin.add(m); group.add(spin);
      turning.push(spin);
    });
    if (entry.id === 'gauntletReflections') {
      reflectionCard = group;
      reflections = createGauntletReflections(renderer, scene, /** @type {THREE.Texture} */ (env.cube), R.quality.tiers.high);
      for (const m of mats) reflections.attach(/** @type {THREE.MeshPhysicalMaterial} */ (m));
    }
    scene.add(group);
    const label = document.createElement('div');
    label.className = 'vc-mr-label';
    label.dataset.material = entry.id;
    label.innerHTML = `<b></b><small></small>`;
    /** @type {HTMLElement} */ (label.querySelector('b')).textContent = entry.name;
    /** @type {HTMLElement} */ (label.querySelector('small')).textContent = entry.usedOn;
    labels.append(label);
    cards.push({ id: entry.id, group, label });
  }

  // ── layout and camera ───────────────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(R.camera.fovDeg, 1, 5, 2000);
  camera.up.set(0, 0, 1);
  // close to the desk camera's 62°, so flat faces reflect the same part of the studio as on the desk
  const pitch = THREE.MathUtils.degToRad(focus ? 50 : 55);
  function layout() {
    const w = innerWidth, h = innerHeight;
    const cols = focus ? 1 : w / h < 0.9 ? 2 : w / h < 1.3 ? 3 : 4;
    const rows = Math.ceil(cards.length / cols);
    cards.forEach((c, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      c.group.position.set((col - (cols - 1) / 2) * (CARD.w + CARD.gap), ((rows - 1) / 2 - row) * (CARD.h + CARD.gap), 0);
    });
    const gw = cols * (CARD.w + CARD.gap) + CARD.gap, gh = rows * (CARD.h + CARD.gap) + CARD.gap;
    sheet.scale.set(gw + 4, gh + 5, 1);
    sheet.position.y = -1;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, R.quality.tiers.high.pixelRatioMax));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // fit: distance so the grid fills the frame (vertical extent foreshortened by the pitch)
    const vfov = THREE.MathUtils.degToRad(R.camera.fovDeg);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const fill = focus ? 0.8 : 1.0;
    const dV = (gh * Math.sin(pitch)) / 2 / Math.tan(vfov / 2) / fill;
    const dH = gw / 2 / Math.tan(hfov / 2) / fill;
    const dist = Math.max(dV, dH) * 1.04;
    camera.position.set(0, -Math.cos(pitch) * dist, Math.sin(pitch) * dist);
    camera.lookAt(0, focus ? 0 : -0.8, 0);
    camera.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
  }
  addEventListener('resize', layout);
  layout();

  const v = new THREE.Vector3();
  function placeLabels() {
    const w = innerWidth, h = innerHeight;
    for (const c of cards) {
      v.set(0, -CARD.h / 2 + 1.2, 0).add(c.group.position).project(camera);
      c.label.style.left = `${(v.x + 1) / 2 * w}px`;
      c.label.style.top = `${(1 - v.y) / 2 * h}px`;
    }
  }

  let turn = true;
  let frame = 0;
  const handPos = new THREE.Vector3();
  clock.onFrame((dt, t) => {
    if (turn) for (const s of turning) s.rotation.z += dt * THREE.MathUtils.degToRad(R.textures.reviewTurnDegPerSec) / 1000;
    if (brass) { const f = (t % 4000) / 2000; setPour(brass, f, f < 1.15 ? 1 : 0); } // pour for 2.3 s, rest 1.7 s
    if (reflections && reflectionCard) {
      reflectionCard.getWorldPosition(handPos); handPos.z = 2;
      reflections.update(handPos, reflectionCard.children);
    }
    renderer.render(scene, camera);
    placeLabels();
    frame++;
  });

  const api = {
    focus,
    cards: cards.map(c => c.id),
    table: MATERIAL_TABLE,
    ready: true,
    timing: tex.timing,
    frames: () => frame,
    /** @param {boolean} on */
    turning(on) { turn = !!on; if (!on) for (const s of turning) s.rotation.z = 0; renderer.render(scene, camera); },
    hash: () => tex.hash(),
    memory: () => tex.memory(),
    engraved: () => tex.engraver.list(),
    reflections: () => reflections?.state ?? null,
    /**
     * Brushed-steel acceptance: the key light's highlight on a sample box, measured.
     * Returns the highlight's spread along the brushing direction (u) and across it.
     * @param {{ anisotropy?: number }} [o]
     */
    measureHighlight: (o = {}) => measureHighlight(renderer, tex, lights.key, o),
    three: { THREE, renderer, scene, camera, tex },
  };
  /** @type {any} */ (vc).materials = api;

}

/**
 * Render a brushed-steel box lit by the key light only, from straight above its face, with the
 * light placed so its mirror highlight lands in the middle; then measure the highlight's
 * second moments along the box's length (u, the brushing direction) and across it.
 * @param {THREE.WebGLRenderer} renderer
 * @param {import('./textures/index.js').Textures} tex
 * @param {THREE.DirectionalLight} key
 * @param {{ anisotropy?: number }} o
 */
async function measureHighlight(renderer, tex, key, o) {
  const size = 512;
  const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType, samples: 4 });
  const scene = new THREE.Scene();
  const light = new THREE.DirectionalLight(key.color, key.intensity);
  // light from 25° off the face normal (in the plane across the bar), camera on the mirror side
  const tilt = THREE.MathUtils.degToRad(25);
  light.position.set(0, -Math.sin(tilt) * 100, Math.cos(tilt) * 100);
  scene.add(light);
  const half = new THREE.Vector3(14, 3, 0.5);
  const mat = createBrushedSteel(tex, { repeatU: 6, half, anisotropy: o.anisotropy });
  const box = new THREE.Mesh(new RoundedBoxGeometry(28, 6, 1, 6, 0.06), mat);
  scene.add(box);
  const cam = new THREE.PerspectiveCamera(55, 1, 1, 500);
  const dist = 22;
  cam.position.set(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist);
  cam.up.set(1, 0, 0); // screen "up" = the bar's length
  cam.lookAt(0, 0, 0);
  const prevTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(render.stage.clearColor, 1);
  const px = new Uint8Array(size * size * 4);
  await renderer.readRenderTargetPixelsAsync(rt, 0, 0, size, size, px);
  rt.dispose(); box.geometry.dispose(); mat.dispose();
  let max = 0;
  const lum = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) { lum[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]; max = Math.max(max, lum[i]); }
  const thr = max * 0.5;
  let w = 0, mx = 0, my = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const l = lum[y * size + x] - thr; if (l > 0) { w += l; mx += l * x; my += l * y; } }
  mx /= w; my /= w;
  let sxx = 0, syy = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const l = lum[y * size + x] - thr; if (l > 0) { sxx += l * (x - mx) ** 2; syy += l * (y - my) ** 2; } }
  // camera up = bar length, so screen y (rows) runs along u and screen x across it
  const sigmaU = Math.sqrt(syy / w), sigmaV = Math.sqrt(sxx / w);
  return { ratio: sigmaU / sigmaV, sigmaU, sigmaV, max, anisotropy: mat.anisotropy };
}

start().catch(e => { console.error('materials review failed', e); });
