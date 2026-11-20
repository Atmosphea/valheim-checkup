// @ts-check
/**
 * ?gauntlet — the gauntlet review page (WP-08).
 *
 * The real gauntlet on a sheet of paper on the desk, under the scene's own lights, studio
 * environment and hand reflections, slowly turning. Buttons pick the distance (close: the hand
 * fills the window, for the "no facets at 2×" check; medium; desk: the desk camera's distance),
 * every pose, LOD0 / LOD1 and a wireframe overlay. `?gauntlet=pinch` opens on one pose.
 *
 * Test hooks on `__vc.gauntletReview`: ready, setView(i), setPose(name), setWire(on), setLOD(l),
 * turning(on), triangles(), penetrations().
 */
import * as THREE from 'three';
import '../fonts.css';
import { vc } from '../debug.js';
import { rng } from '../util/rng.js';
import { clock } from '../util/clock.js';
import render from '../config/render.js';
import { gauntlet as GR } from '../config/render.js';
import { addLights, buildEnvironment } from '../scene/lights.js';
import { createTextures } from '../scene/textures/index.js';
import { createGauntletSteel, createGauntletReflections, createLeather, createRivets, createLitPaper, createDeskPlank } from '../scene/materials/index.js';
import { buildGauntlet } from './model.js';
import { placeArm } from './rig.js';
import { POSES, POSE_NAMES } from './poses.js';
import { findPenetrations } from './collide.js';

const R = render;
const S = R.stage;
/** Camera distances (cm from the hand): close, medium, the desk camera's. */
const VIEWS = [{ name: 'Close', dist: 48 }, { name: 'Medium', dist: 70 }, { name: 'Desk', dist: 150 }];

async function start() {
  document.body.classList.add('vc-gauntlet-review');
  const params = new URLSearchParams(location.search);
  const root = document.createElement('div');
  root.id = 'gauntletReview';
  root.innerHTML = '<canvas id="gauntletCanvas" aria-label="Gauntlet"></canvas><h1 class="vc-gr-title">Gauntlet</h1><div class="vc-gr-bar"></div>';
  document.body.append(root);
  const style = document.createElement('style');
  style.textContent = `
    body.vc-gauntlet-review { overflow: hidden; }
    body.vc-gauntlet-review > :not(#gauntletReview):not(script):not(dialog):not(#toast) { display: none !important; }
    #gauntletReview { position: fixed; inset: 0; background: #120c08; z-index: 50; }
    #gauntletCanvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .vc-gr-title { position: absolute; left: 16px; top: 10px; margin: 0; font: 400 22px/1.2 "IM Fell English SC", serif; color: #f3e3c3; text-shadow: 0 1px 3px #000; }
    .vc-gr-bar { position: absolute; left: 16px; right: 16px; bottom: 12px; display: flex; flex-wrap: wrap; gap: 6px; }
    .vc-gr-bar button { font: 400 14px/1 "IM Fell English", serif; padding: 6px 10px; border-radius: 4px; border: 1px solid #6b5137; background: #2a1d13; color: #f3e3c3; cursor: pointer; }
    .vc-gr-bar button[aria-pressed="true"] { background: #f3e3c3; color: #2a1d13; }
    .vc-gr-bar .vc-gr-gap { flex: 0 0 12px; }
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

  const tex = createTextures(renderer, { seed: rng.initialSeed });
  /** @type {any} */ (vc).gauntletReview = { ready: false, timing: tex.timing };
  await tex.run();

  // desk, and a sheet of paper under the hand (so the steel reflects warm paper and wood)
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), createDeskPlank(tex, { lengthCm: 400, widthCm: 400 }));
  desk.position.z = -0.05;
  desk.receiveShadow = true;
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), createLitPaper(tex));
  paper.receiveShadow = true;
  scene.add(desk, paper);

  const steel = createGauntletSteel(tex, { envMapIntensity: GR.envMapIntensity });
  const leather = createLeather(tex);
  const rivet = createRivets();
  rivet.envMapIntensity = GR.envMapIntensity;
  const socket = new THREE.MeshStandardMaterial({ name: 'emberSocket', color: 0x301008, emissive: new THREE.Color(GR.socketColor), emissiveIntensity: GR.socketGlow, roughness: 0.6 });
  const model = buildGauntlet({ lod: 0, materials: { steel, leather, rivet, socket } });
  const turn = new THREE.Group();
  turn.add(model.root);
  scene.add(turn);
  for (const m of [...model.steelMeshes, /** @type {any} */ (model.leather)]) { if (m) { m.castShadow = true; m.receiveShadow = true; } }
  const reflections = createGauntletReflections(renderer, scene, env.cube, { cubePx: R.materials.gauntletReflections.cubePx, cubeEveryNthFrame: 1 });
  for (const m of [steel, rivet]) reflections.attach(m);

  // place the hand: index tip 6 cm over the paper's centre, pointing along +x, arm from upper left
  const tip = new THREE.Vector3(6, 0, 6);
  const handQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 18 * Math.PI / 180, -0.35, 'ZYX'));
  let poseName = POSES[params.get('gauntlet') ?? ''] ? /** @type {string} */ (params.get('gauntlet')) : 'hover';
  function pose(name) {
    poseName = name;
    model.rig.setPose(POSES[name]);
    const capB = model.bones.indexCap;
    capB.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -POSES[name].cap * 70 * Math.PI / 180);
    model.socket.visible = POSES[name].cap > 0;
    model.root.position.set(0, 0, 0);
    model.root.updateMatrixWorld(true);
    placeArm(model.rig, tip, handQ);
    // the turntable turns about the hand's middle (halfway from the wrist to the fingertip)
    const c = new THREE.Vector3(), d = new THREE.Vector3();
    model.bones.hand.getWorldPosition(c);
    model.rig.helpers.pointerTip.getWorldPosition(d);
    c.lerp(d, 0.5);
    model.root.position.set(-c.x, -c.y, 0);
    model.root.updateMatrixWorld(true);
    sync();
  }

  // ── camera ──────────────────────────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(R.camera.fovDeg, 1, 2, 2000);
  camera.up.set(0, 0, 1);
  let view = 0, wire = false, spinning = true;
  function layout() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const pitch = R.camera.pitchDeg * Math.PI / 180, d = VIEWS[view].dist;
    camera.position.set(0, -Math.cos(pitch) * d, Math.sin(pitch) * d + 4);
    camera.lookAt(0, 0, 4);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', layout);

  // ── wireframe overlay ───────────────────────────────────────────────────────────────────
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.35, depthTest: true });
  /** @type {THREE.Mesh[]} */ let wires = [];
  function setWire(on) {
    wire = !!on;
    for (const w of wires) w.parent?.remove(w);
    wires = [];
    if (wire) {
      /** @type {THREE.Mesh[]} */ const meshes = [];
      model.root.traverse(o => { if (/** @type {THREE.Mesh} */ (o).isMesh) meshes.push(/** @type {THREE.Mesh} */ (o)); });
      meshes.forEach(m => {
        if (/** @type {any} */ (m).isSkinnedMesh || m.layers.mask === 4 || !m.visible) return;
        const w = /** @type {any} */ (m).isInstancedMesh ? new THREE.InstancedMesh(m.geometry, wireMat, /** @type {any} */ (m).count) : new THREE.Mesh(m.geometry, wireMat);
        if (/** @type {any} */ (m).isInstancedMesh) /** @type {any} */ (w).instanceMatrix = /** @type {any} */ (m).instanceMatrix;
        w.raycast = () => {};
        m.add(w);
        wires.push(w);
      });
    }
    sync();
  }

  // ── buttons ─────────────────────────────────────────────────────────────────────────────
  const bar = /** @type {HTMLElement} */ (root.querySelector('.vc-gr-bar'));
  const buttons = /** @type {{ el: HTMLButtonElement, on: () => boolean }[]} */ ([]);
  const button = (label, onClick, on) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.addEventListener('click', () => { onClick(); sync(); });
    bar.append(el);
    buttons.push({ el, on });
  };
  const gap = () => { const s = document.createElement('span'); s.className = 'vc-gr-gap'; bar.append(s); };
  VIEWS.forEach((v, i) => button(v.name, () => { view = i; layout(); }, () => view === i));
  gap();
  for (const n of POSE_NAMES) button(n, () => pose(n), () => poseName === n);
  gap();
  button('LOD0', () => { model.setLOD(0); setWire(wire); }, () => model.lod === 0);
  button('LOD1', () => { model.setLOD(1); setWire(wire); }, () => model.lod === 1);
  gap();
  button('Wireframe', () => setWire(!wire), () => wire);
  button('Turn', () => { spinning = !spinning; }, () => spinning);
  function sync() { for (const b of buttons) b.el.setAttribute('aria-pressed', String(b.on())); }

  pose(poseName);
  layout();
  const at = new THREE.Vector3();
  let frame = 0;
  void frame;
  clock.onFrame(dt => {
    if (spinning) turn.rotation.z += dt * 0.00025;
    turn.updateMatrixWorld(true);
    if (frame++ % 3 === 0) { model.bones.hand.getWorldPosition(at); reflections.update(at, [...model.steelMeshes, /** @type {any} */ (model.leather)]); }
    renderer.render(scene, camera);
  });

  Object.assign(/** @type {any} */ (vc).gauntletReview, {
    ready: true,
    views: VIEWS.map(v => v.name),
    setView(i) { view = i; layout(); sync(); renderer.render(scene, camera); },
    setPose(n) { pose(n); renderer.render(scene, camera); },
    setWire(on) { setWire(on); renderer.render(scene, camera); },
    setLOD(l) { model.setLOD(l); setWire(wire); renderer.render(scene, camera); },
    turning(on) { spinning = !!on; if (!on) turn.rotation.z = 0; sync(); renderer.render(scene, camera); },
    triangles: () => model.triangles(),
    penetrations: () => findPenetrations(model),
    rivets: model.rivetCount,
  });
  console.info('[gauntlet] review ready');
}

start().catch(e => { console.error(e); });
