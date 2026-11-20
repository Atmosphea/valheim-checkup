// @ts-check
/**
 * The desk stage (WP-04). Loaded only in desk mode (main.js imports it on demand).
 *
 * Builds #desk with the seven layers of file 05 in order, the two WebGL renderers, the CSS3D
 * printed layer, the 2D overlays, the camera rig, lights, environment, post-processing,
 * placeholders, input, quality tiers and the one frame loop.
 *
 * Debug and test hooks live on `__vc.stage` (see the bottom of this file).
 */
import { toBlobUrl } from '../util/image-url.js';
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import './scene.css';
import '../fonts.css';
import render from '../config/render.js';
import layout from '../config/layout.js';
import { clock } from '../util/clock.js';
import { createWoodBurn } from './woodburn.js';
import { clientToPlane } from '../board/geometry.js';
import { rng } from '../util/rng.js';
import { vc, markUsable } from '../debug.js';
import { events as busEvents, emit } from '../bus.js';
import { getQuality, setQuality, onQualityChange } from '../quality.js';
import { createCameraRig, inMain } from './camera-rig.js';
import { addLights, buildEnvironment, configureShadow } from './lights.js';
import { buildPlaceholders } from './placeholders.js';
import { createVeil } from './veil.js';
import { createPost } from './post.js';
import { createOverlays } from './overlays.js';
import { createInput } from './input.js';
import { createGovernor } from './governor.js';
import { createGpuTimer } from './gpu-timer.js';
import { onPhase, runFrame, PHASES, phaseMs, profilePhases } from './frame.js';
import { createTextures } from './textures/index.js';
import { dressPlaceholders } from './dress.js';
import { createWarmup } from './warmup.js';
import { estimateGpuMemory, fitPixelRatio } from './gpu-memory.js';
import { createBoard } from '../board/index.js';
import { bakeSpec } from '../board/layout.js';
import { boardEntries } from '../board/engravings.js';
import { createPaper } from '../paper/index.js';
import { attachDesk as attachInk } from '../ink/index.js';
import { addPatch } from './materials/patch.js';
import { createGauntlet } from '../gauntlet/index.js';
import { createController } from '../gauntlet/controller.js';
import { attachSurfaces } from '../surfaces/index.js';

const R = render;
const S = R.stage;

/** @typedef {'high'|'medium'|'low'|'flat'} Tier */

/** Tier settings; `flat` = Low with no post effects (DECISIONS point 8). @param {Tier} t */
function tierSettings(t) {
  return R.quality.tiers[t === 'flat' ? 'low' : t];
}

/** Create one layer element. @param {'canvas'|'div'} tag @param {string} id */
function layerEl(tag, id) {
  const el = document.createElement(tag);
  el.id = id;
  el.className = 'vc-layer';
  el.setAttribute('aria-hidden', id === 'print' || id === 'float' ? 'false' : 'true');
  return el;
}

export function createStage() {
  // ── 1. #desk and the seven layers, bottom to top ────────────────────────────────────────
  const desk = document.createElement('div');
  desk.id = 'desk';
  const els = {
    scene: /** @type {HTMLCanvasElement} */ (layerEl('canvas', 'scene')),
    print: /** @type {HTMLDivElement} */ (layerEl('div', 'print')),
    veil: /** @type {HTMLCanvasElement} */ (layerEl('canvas', 'veil')),
    glow: /** @type {HTMLCanvasElement} */ (layerEl('canvas', 'glow')),
    float: /** @type {HTMLDivElement} */ (layerEl('div', 'float')),
    fx: /** @type {HTMLCanvasElement} */ (layerEl('canvas', 'fx')),
    grain: /** @type {HTMLDivElement} */ (layerEl('div', 'grain')),
  };
  for (const l of R.layers) desk.append(els[/** @type {keyof typeof els} */ (l.id)]);
  els.print.removeAttribute('aria-hidden');
  els.float.removeAttribute('aria-hidden');
  document.body.append(desk);

  let width = innerWidth, height = innerHeight;
  let tier = /** @type {Tier} */ (getQuality() === 'flat' ? 'flat' : getQuality());
  const devicePR = () => (typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1);
  /** Memory model inputs for the current state (WP-05: under stage.gpuBudgetMB on High). */
  const memInputs = () => ({
    texturesBytes: tex.memory().bytes, tier: tierSettings(tier), width, height, scenePixelRatio: 1,
    veilPaper: /** @type {[number, number]} */ (R.textures.paper.size), envCubePx: S.envCubePx, scene,
  });
  // The tier's pixel ratio, lowered (in 1/8 steps, never below 1) if the GPU memory estimate
  // would go over budget: on a 2× screen the full ratio needs ~550 MB (DECISIONS, WP-05).
  const scenePR = () => {
    const full = Math.min(devicePR(), tierSettings(tier).pixelRatioMax);
    // WP-18P: a governor trim lowers it a little (never below 1, nor below the screen's own)
    const want = full <= 1 ? full : Math.max(1, full * trimNow().pixelRatioScale);
    return want <= 1 ? want : fitPixelRatio(memInputs(), want, 1, S.gpuBudgetMB);
  };

  // ── 2. Renderer 1 (#scene) ──────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas: els.scene, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = R.output.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r187: PCFSoft was folded into PCF + shadow.radius
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(S.clearColor, 1);

  // WP-07: a software renderer can't hold High; skip the High benchmark there (render.js `stage.softwareRenderer`)
  const glName = (() => {
    try {
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
    } catch { return ''; }
  })();
  const software = S.softwareRenderer.test(glName);

  const scene = new THREE.Scene();
  scene.name = 'desk';
  const env = buildEnvironment(renderer);
  scene.environment = env.texture;
  scene.environmentIntensity = S.envIntensity;
  const lights = addLights(scene, { shadowMap: tierSettings(tier).shadowMap });
  // WP-14: shadow-only casters (bars, tabs, gauntlet proxies) live on layer 2, seen only by the key's shadow camera
  lights.key.shadow.camera.layers.enable(2);
  const parts = buildPlaceholders(rng.fork());
  scene.add(parts.root);

  // ── WP-05: procedural textures and real materials ───────────────────────────────────────
  // The textures get their own seed stream, so adding scene objects never changes them.
  // WP-07: heavy startup work (texture passes, the software compile) runs at the end of a frame,
  // after every clock read the frame makes. A clock read right after seconds of blocking GPU work
  // makes a test's fake clock (Playwright page.clock) drop those seconds, so page timers run late.
  /** @type {(() => void)[]} */
  const sliceWaiters = [];
  const nextSlice = () => new Promise(resolve => { sliceWaiters.push(() => resolve(undefined)); });
  const tex = createTextures(renderer, { seed: rng.initialSeed, board: bakeSpec(), engrave: boardEntries, scale: software ? S.softwareTextureScale : 1, nextSlice });
  const dressed = dressPlaceholders(parts, tex, { renderer, scene, studioCube: env.cube, tier: tierSettings(tier), rng: rng.fork() });

  const rig = createCameraRig({ rng: rng.fork() });
  const camera = rig.camera;
  const post = createPost(renderer, scene, camera);

  // ── Renderer 2 (#veil) ──────────────────────────────────────────────────────────────────
  const veil = createVeil(els.veil, { papers: parts.papers, casters: parts.casters }, tierSettings(tier));
  // WP-14: count a whole frame (reset in frame()), not just the last render() call of it
  renderer.info.autoReset = false; veil.renderer.info.autoReset = false;
  const warmup = createWarmup({ renderer, key: lights.key, veil });
  tex.onProgress(p => warmup.setProgress(p));

  // ── CSS3D (#print) and the 2D layers ────────────────────────────────────────────────────
  const css = new CSS3DRenderer({ element: els.print });
  // WP-17A: #print is a camera window, never a scroller. CSS3DRenderer gives it overflow: hidden,
  // which focus() and scroll-into-view can still scroll: with the WP-17 main section reaching the
  // sheet's top edge, focusing the Load coin scrolled the whole print layer ~1,000 px aside (wp11
  // tips). overflow: clip cannot scroll; the listener catches any engine that ignores it.
  els.print.style.overflow = 'clip';
  els.print.addEventListener('scroll', () => { if (els.print.scrollTop || els.print.scrollLeft) els.print.scrollTo(0, 0); }, { passive: true });
  const printScene = new THREE.Scene();
  let printDirty = true;
  let lastPrintCamera = -1;
  const overlays = createOverlays({ glow: els.glow, fx: els.fx, grain: els.grain }, rng.fork());

  // ── Input and hover ─────────────────────────────────────────────────────────────────────
  const hoverEmissive = new THREE.Color(S.hoverEmissive);
  const black = new THREE.Color(0);
  const input = createInput({
    camera,
    hoverables: parts.hoverables,
    onHover(name, prev) {
      for (const m of parts.hoverables) {
        const mat = /** @type {THREE.MeshStandardMaterial} */ (m.material);
        if (m.name === prev && mat.emissive) mat.emissive.copy(black);
      }
      for (const m of parts.hoverables) {
        const mat = /** @type {THREE.MeshStandardMaterial} */ (m.material);
        if (m.name === name && mat.emissive) mat.emissive.copy(hoverEmissive);
      }
    },
  });

  // ── Sizes and quality tiers ─────────────────────────────────────────────────────────────
  /** WP-18P: the governor's trim step (0 = none) and its settings. */
  let trim = 0;
  function trimNow() { return trim > 0 ? R.quality.trims[trim - 1] : { cubeEveryNthScale: 1, pixelRatioScale: 1 }; }
  /** The reflection cube's tier settings with the trim's slower refresh. @param {any} t */
  const cubeTier = t => ({ ...t, cubeEveryNthFrame: t.cubeEveryNthFrame * trimNow().cubeEveryNthScale });
  function resize() {
    width = Math.max(1, innerWidth); height = Math.max(1, innerHeight);
    const pr = scenePR();
    renderer.setPixelRatio(pr);
    renderer.setSize(width, height, false);
    post.setSize(width, height, pr);
    veil.setSize(width, height, pr * tierSettings(tier).veilResolution);
    css.setSize(width, height);
    overlays.setSize(width, height, Math.min(pr, 1.5));
    rig.resize(width, height);
    input.setSize(width, height);
    renderer.shadowMap.needsUpdate = true;
    shadowDirty = true; lastActive = clock.frameWall();
    printDirty = true;
  }

  /** @type {ReturnType<typeof createGauntlet> | null} */
  let gauntlet = null;
  /** @param {Tier} next */
  function applyTier(next) {
    tier = next;
    const t = tierSettings(tier);
    const flat = tier === 'flat';
    configureShadow(lights.key, t.shadowMap);
    lights.key.shadow.radius = t.shadowSoft ? S.keyShadowRadius : 1;
    post.setTier(t, flat);
    veil.setTier(t);
    dressed.reflections?.setTier(flat ? { cubePx: 0, cubeEveryNthFrame: 0 } : cubeTier(t));
    overlays.setGrain(!flat);
    gauntlet?.setTier(tier);
    resize();
  }

  // ── The frame loop ──────────────────────────────────────────────────────────────────────
  const qualityLog = /** @type {{t: number, tier: string, why: string}[]} */ ([]);
  /** WP-18P: the governor's trim steps. */
  const trimLog = /** @type {{t: number, trim: number, why: string}[]} */ ([]);
  // WP-18P: GPU time of both WebGL layers (null where the browser has no timer queries)
  const gpuTimers = [createGpuTimer(/** @type {WebGL2RenderingContext} */ (renderer.getContext())), createGpuTimer(/** @type {WebGL2RenderingContext} */ (veil.renderer.getContext()))];
  /** @type {number|null} */ let gpuMs = null;
  /** @type {(number|null)[]} */ const gpuParts = [null, null];
  let gpuAvg = 0;
  /** null = measure for real; a number = every frame reports exactly this (tests). */
  let forcedFrameMs = /** @type {number|null} */ (null);
  let extraFrameMs = 0;
  let lastWall = /** @type {number|null} */ (null);
  let frames = 0, hiddenSkips = 0, lastFrameMs = 0;
  let avgFrameMs = 0;
  let benchArmed = false;

  const governor = createGovernor({
    benchmarkFrames: R.quality.benchmarkFrames,
    warmupFrames: S.benchmarkWarmupFrames,
    highMs: S.benchmarkHighMs,
    mediumMs: S.benchmarkMediumMs,
    dropFrameMs: R.quality.dropFrameMs,
    dropAfterMs: R.quality.dropAfterMs,
    dropLateShare: R.quality.dropLateShare,
    // WP-18P: the adaptive part (trims inside a tier; climbing back with headroom)
    budgetMs: R.quality.budgetMs, trimSteps: R.quality.trims.length, trimWindowMs: R.quality.trimWindowMs,
    strainShare: R.quality.strainShare, cpuStrain: R.quality.cpuStrain, gpuStrain: R.quality.gpuStrain, lateShare: R.quality.lateShare,
    climbWindowMs: R.quality.climbBack ? R.quality.climbWindowMs : 0, climbCpu: R.quality.climbCpu, climbGpu: R.quality.climbGpu, climbBackoffMs: R.quality.climbBackoffMs,
    onTrim(next, why) {
      const before = scenePR();
      trim = next;
      trimLog.push({ t: clock.now(), trim: next, why });
      if (trimLog.length > 100) trimLog.shift();
      if (tier !== 'flat') dressed.reflections?.setTier(cubeTier(tierSettings(tier)));
      if (why !== 'reset' && scenePR() !== before) resize(); // a tier change resizes anyway
    },
    onTier(next, why) {
      qualityLog.push({ t: clock.now(), tier: next, why });
      if (qualityLog.length > 100) qualityLog.shift();
      governorSetting = true;
      try { setQuality(/** @type {Tier} */ (next)); } finally { governorSetting = false; }
    },
  });
  let governorSetting = false;
  onQualityChange(next => {
    if (!governorSetting) { governor.setTier(next); qualityLog.push({ t: clock.now(), tier: next, why: 'override' }); }
    applyTier(/** @type {Tier} */ (next));
  });

  onPhase('input', () => { input.update(rig.version); });
  onPhase('physics', dt => {
    const p = input.state;
    // Paul, WP-17 item 2: the framing follows the pointer's place on the paper
    rig.update(dt, p.inside ? { nx: p.nx, ny: p.ny } : null, { paper: p.inside ? { x: p.x, y: p.y } : null });
  });
  // WP-07: on a software renderer the WebGL layers redraw at most every softwareRedrawMs, unless
  // the camera moved (the printed layer must stay glued to the paper) or a render was forced.
  let drew3D = true, next3D = 0, last3DCamera = -1, forcing = false;
  // ── WP-16A: render on demand ──────────────────────────────────────────────────────────────
  // Activity: input on the page, the camera moving, a shadow caster moving, the ink running, a
  // forced render. Without any for `idleAfterMs`, the 3D layers redraw every `idleRedrawMs` only.
  let lastActive = -Infinity, idleSkips = 0, shadowSkips = 0, shadowDirty = true;
  /** WP-17 item 20: things that animate in the 3D scene without moving a caster (wood burning's cooling embers). @type {Set<() => boolean>} */
  const awake = new Set();
  const animating = () => { for (const f of awake) if (f()) return true; return false; };
  /** @type {any} */ let lastBusEvent = null;
  let moverName = '';
  let wakeReason = '';
  /** @param {Event} e */
  const wake = e => { lastActive = clock.frameWall(); wakeReason = e.type; };
  const wakeEvents = ['pointermove', 'pointerdown', 'pointerup', 'wheel', 'keydown', 'touchstart', 'touchmove', 'dragover', 'drop', 'change', 'input', 'focusin'];
  for (const e of wakeEvents) addEventListener(e, wake, { capture: true, passive: true });
  /** Shadow casters (meshes and lights) of both renderers, re-collected every 120 frames. */
  /** `g`: part of the gauntlet, whose idle bob and finger curl never stop (file 04): its moves
   * redraw the shadows but don't keep the stage awake (the pointer and the bus events do). */
  /** @type {Map<THREE.Object3D, {m: Float64Array, v: boolean, c: boolean, g: boolean}>} */
  let casters = new Map();
  let castersAt = -1e9;
  const collectCasters = () => {
    const next = new Map();
    for (const root of [scene, veil.scene]) root.traverse(o => {
      if (!(/** @type {any} */ (o).isMesh || /** @type {any} */ (o).isLight)) return;
      // kept entries keep what they last saw, so a re-collection alone never counts as a move
      let g = o.name.startsWith('veil-gauntlet');
      for (let p = /** @type {THREE.Object3D|null} */ (o); !g && p; p = p.parent) g = p.name === 'gauntlet';
      next.set(o, casters.get(o) ?? { m: new Float64Array(16).fill(NaN), v: false, c: false, g });
    });
    casters = next; castersAt = frames;
  };
  /**
   * 0 = no shadow caster changed since the last check; 1 = only the gauntlet's; 2 = something else
   * moved, appeared, vanished or changed its cast flag.
   */
  const castersMoved = () => {
    if (frames - castersAt >= 120) collectCasters();
    let moved = 0;
    for (const [o, c] of casters) {
      const hit = c.g ? 1 : 2;
      if (moved >= hit) continue;
      let v = o.visible;
      for (let p = o.parent; v && p; p = p.parent) v = p.visible;
      if (o.castShadow !== c.c) { c.c = o.castShadow; moved = hit; moverName = 'cast:' + o.name; }
      if (v !== c.v) { c.v = v; if (o.castShadow) { moved = hit; moverName = 'shown:' + o.name; } }
      if (!o.castShadow || !v) continue;
      // veil mirrors copy their source's matrix when the veil renders: the source is checked too
      const e = o.matrixWorld.elements, m = c.m;
      for (let i = 0; i < 16; i++) if (m[i] !== e[i]) { moved = hit; moverName = o.name; m.set(e); break; }
    }
    return moved;
  };
  const frustum = new THREE.Frustum(), projM = new THREE.Matrix4(), gBox = new THREE.Box3();
  /** @type {THREE.Object3D | null | undefined} */ let gRoot;
  /** Any part of the gauntlet inside the camera's view (its world box against the frustum). */
  const gauntletOnScreen = () => {
    // the WP-08 rig's root (the WP-04 stand-in shares the name but is hidden once the rig is in)
    if (!gRoot?.visible) { gRoot = null; scene.traverse(o => { if (o.name === 'gauntlet' && o.visible) gRoot = o; }); }
    if (!gRoot) return false;
    projM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projM);
    return frustum.intersectsBox(gBox.setFromObject(gRoot));
  };
  onPhase('scene', dt => {
    warmup.update(dt);
    // WP-05: while the textures are generated and the scene's shaders compile (in parallel),
    // layer 1 only shows the candle-dark desk colour; the full scene joins the fade after.
    if (!sceneReady) { drew3D = true; renderer.setRenderTarget(null); renderer.clear(); return; }
    const now = clock.frameWall();
    scene.updateMatrixWorld();
    let moved = castersMoved();
    // Paul, WP-17 item 10a: the gauntlet's own motion keeps the stage awake only while it is on screen
    if (moved === 1 && !gauntletOnScreen()) moved = 0;
    // Paul, WP-18 item 3: and only then redraws the shadow maps (its idle bob re-rendered both
    // shadow maps every frame while it was off screen, over the main section)
    if (moved) shadowDirty = true;
    const inkBusy = !!(/** @type {any} */ (vc).ink?.state?.().running);
    // anything on the bus (a stamp, the spark, a stretch, a sound…) is activity too
    const lastEvent = busEvents[busEvents.length - 1];
    let busy = false;
    if (lastEvent !== lastBusEvent) {
      // every new entry since the last frame (the ring buffer only ever appends at the end)
      for (let i = busEvents.length - 1; i >= 0 && busEvents[i] !== lastBusEvent; i--) {
        if (!S.idleIgnoreEvents.test(busEvents[i].type)) { busy = true; break; }
      }
      lastBusEvent = lastEvent;
    }
    // Paul, WP-17 item 10a: idle only when nothing animates: the gauntlet's breathing bob and finger
    // curl are animation too (WP-16A let them run at the idle rate, which dropped their frames)
    const why = moved ? 'caster ' + moverName : busy ? 'event ' + lastEvent?.type : inkBusy ? 'ink' : animating() ? 'animating' : forcing ? 'forced' : rig.version !== last3DCamera ? 'camera' : !warmup.state?.done ? 'warm-up' : '';
    if (why) { lastActive = now; wakeReason = why; }
    const idle = now - lastActive >= S.idleAfterMs;
    drew3D = software
      ? forcing || rig.version !== last3DCamera || now >= next3D
      : forcing || !idle || now >= next3D;
    if (!drew3D) { idleSkips++; return; }
    next3D = now + (software ? S.softwareRedrawMs : S.idleRedrawMs); last3DCamera = rig.version;
    // WP-16A: shadow maps only when a caster moved (or the maps were re-made: tier, resize)
    if (shadowDirty || forcing) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
    else { shadowSkips++; veil.holdShadowOnce(); }
    // WP-14 (draw calls): on the frame the reflection cube is filtered, the veil reuses last frame's
    // shadow map (the light layer's shadows lag one frame, once per refresh)
    if (dressed.update() === 'pmrem') veil.holdShadowOnce();
    post.render();
  });
  onPhase('veil', () => { if (drew3D) veil.render(camera); });
  // WP-16A: the 2D layers follow the 3D layers' idle rate (the spark's core and pool, the grain):
  // repainting them re-blends the whole multiply/screen/overlay stack, ~20 % of the GPU at 2×
  let overlayDt = 0;
  onPhase('overlays', dt => {
    overlayDt += dt;
    // Paul, WP-17 item 10a: but anything animating on the 2D layers (the spark's flicker, trail and
    // embers, the glow painters) keeps its own full rate while the 3D layers idle
    if (!drew3D && !software && !overlays.animating()) return;
    overlays.updateGrain(overlayDt); overlays.render(); overlayDt = 0;
  });
  onPhase('print', () => {
    if (!printDirty && rig.version === lastPrintCamera) return;
    css.render(printScene, camera);
    lastPrintCamera = rig.version; printDirty = false;
  });

  /** @param {number} dt @param {number} t */
  /** WP-14: last frame's totals (renderer.info no longer resets per render() call). */
  const perFrame = { calls: 0, triangles: 0 };
  function frame(dt, t) {
    if (document.hidden) { hiddenSkips++; lastWall = null; return; }
    // WP-07: the frame's rAF timestamp, not a fresh clock read (see nextSlice above)
    const wall = clock.frameWall();
    if (lastWall !== null) {
      const measured = forcedFrameMs ?? (wall - lastWall) + extraFrameMs;
      lastFrameMs = measured;
      avgFrameMs = avgFrameMs ? avgFrameMs * 0.95 + measured * 0.05 : measured;
      // WP-05: the benchmark starts once the textures are generated, so startup work (texture
      // passes, first shader compiles) can't pick a lower tier than the machine deserves
      if (benchArmed || forcedFrameMs !== null) {
        // WP-18P: with the frame's load (last tick's JS time; GPU time of the 3D layers when measured).
        // A forced frame time (tests) reports no GPU time, so a test never sees a tier climb.
        governor.sample(measured, forcedFrameMs !== null
          ? { cpu: 0, gpu: null, active: true }
          : { cpu: clock.work().last, gpu: gpuMs, active: clock.frameWall() - lastActive < S.idleAfterMs });
      }
    }
    lastWall = wall;
    frames++;
    // WP-14: draw calls and triangles of the whole frame (both renderers, every pass), for ?perf
    renderer.info.reset(); veil.renderer.info.reset();
    for (const g of gpuTimers) g.begin();
    runFrame(dt, t);
    for (const g of gpuTimers) g.end();
    if (gpuTimers[0].supported) {
      const a = gpuTimers[0].poll(), b = gpuTimers[1].poll();
      gpuParts[0] = a; gpuParts[1] = b;
      gpuMs = a === null && b === null ? null : (a ?? 0) + (b ?? 0);
      if (gpuMs !== null) gpuAvg = gpuAvg ? gpuAvg * 0.95 + gpuMs * 0.05 : gpuMs;
    }
    const ri = renderer.info.render, vi = veil.renderer.info.render;
    perFrame.calls = ri.calls + vi.calls; perFrame.triangles = ri.triangles + vi.triangles;
    // one heavy slice per frame, so a slice's own clock read never follows another slice's work
    sliceWaiters.shift()?.();
  }

  const onVisibility = () => {
    lastWall = null;
    governor.resetWindow();
    input.resetVelocity();
  };
  document.addEventListener('visibilitychange', onVisibility);
  addEventListener('resize', resize);

  // ── WP-18P: the window itself never scrolls on the desk ─────────────────────────────────────
  // (body overflow hidden; the main section scrolls inside its sheet). app.js's setCategory still
  // calls window.scrollTo({top: 0}) for the flat page; on the desk that call made the browser lay
  // out the whole freshly rendered view in the middle of the bar's release (~30 ms for 400 rows),
  // and then once more before painting. A scroll to where the window already is, is skipped.
  {
    const nativeScrollTo = window.scrollTo.bind(window);
    let wx = 0, wy = 0;
    document.addEventListener('scroll', e => { if (e.target === document) { wx = window.scrollX; wy = window.scrollY; } }, { passive: true });
    /** @param {any[]} a */
    window.scrollTo = /** @type {any} */ ((...a) => {
      const o = a[0] !== null && typeof a[0] === 'object' ? a[0] : { left: a[0], top: a[1] };
      const x = o.left ?? wx, y = o.top ?? wy;
      if (x === wx && y === wy) return;
      nativeScrollTo(...a);
    });
  }

  // ── Paul, WP-17 item 2: no wheel or pinch zoom any more (WP-16A's is removed) ─────────────
  // A pinch (Chrome and Safari send it as a wheel with ctrlKey) must still never zoom the browser
  // page, so it is swallowed. The wheel itself just scrolls whatever is under it.
  /** @param {WheelEvent} e */
  const onWheel = e => { if (e.ctrlKey) e.preventDefault(); };
  addEventListener('wheel', onWheel, { passive: false });
  // A click outside the main section (on the wood, the desk or the paper's margin, not on a
  // control) toggles a quick 30 % zoom about it; a second click or the pointer coming back over
  // the main section ends it (camera-rig.js).
  const CONTROL = 'button, a, input, select, textarea, label, summary, details, dialog, [role="button"], [role="slider"], [tabindex], .vc-coin-print, .vc-menu';
  let downAt = /** @type {{x: number, y: number, t: number} | null} */ (null);
  /** @param {PointerEvent} e */
  const onDown = e => { downAt = e.button === 0 && e.isPrimary ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null; };
  /** @param {MouseEvent} e */
  const onClick = e => {
    const d = downAt; downAt = null;
    if (!d || e.button !== 0 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || e.timeStamp - d.t > 600) return;
    if (document.body.classList.contains('vc-modal-open') || document.body.classList.contains('vc-help-open')) return;
    const t = /** @type {Element|null} */ (e.target instanceof Element ? e.target : null);
    if (t?.closest(CONTROL) || input.state.hover) return;
    const p = input.paperAt(e.clientX, e.clientY);
    if (!p || inMain(p.x, p.y)) return;
    rig.clickZoom((e.clientX / width) * 2 - 1, 1 - (e.clientY / height) * 2);
    wake(e);
  };
  addEventListener('pointerdown', onDown, { capture: true, passive: true });
  addEventListener('click', onClick, { passive: true });

  applyTier(tier);
  // Start the benchmark at High (file 05), unless someone already chose a tier.
  if (tier !== 'high') governor.setTier(tier);
  else if (software) {
    // WP-07: no High benchmark on a software renderer; start (and stay) at Low
    governor.setTier('low');
    qualityLog.push({ t: clock.now(), tier: 'low', why: 'software renderer' });
    governorSetting = true;
    try { setQuality('low'); } finally { governorSetting = false; }
  }
  if (software && S.softwareStillGrain) overlays.setGrainStill(true);
  // WP-07: on a software renderer the frame loop starts only once the blocking start is over
  // (see softwareStart below); everywhere else it runs from here.
  let stopFrames = software ? null : clock.onFrame(frame);

  // ── WP-06: the woodblock, bars, plaque and coins replace the placeholders ──────────────
  const board = createBoard({
    scene, camera, parts, veil, post, tex, addPrinted, onPhase, project, overlays, input,
    printDirty: () => { printDirty = true; },
  });

  // ── WP-07: every original text and control printed onto the two sheets ────────────────
  const paper = createPaper({
    addPrinted, onPhase, parts, veil, overlays, project, rig, camera, board, rng: rng.fork(),
    tier: () => tierSettings(tier),
    printDirty: () => { printDirty = true; },
    attach: () => { camera.updateMatrixWorld(); css.render(printScene, camera); },
    renderer,
    isLit: () => sceneReady && drew3D && !!warmup.state?.done,
    willDrawVeil: () => drew3D,
  });
  // ── WP-10: the wash's wet front in the veil, sheen in #glow, stamp impacts shake the camera ──
  attachInk({ glow: paper.glow, veil, shake: (/** @type {number} */ a, /** @type {number} */ ms) => rig.shake(a, ms), THREE, addPatch });

  // ── WP-08: the real gauntlet replaces the stand-in; WP-09: it (or the spark) is the pointer ──
  gauntlet = createGauntlet({ scene, parts, veil, post, tex, lights, dressed, tier });
  const cursor = createController({ gauntlet, camera, input, board, paper, lights, overlays, onPhase, project, desk });
  // ── Paul, WP-17 item 20: click-and-drag burns drawings into the desk and the woodblock's border ──
  const woodBurn = createWoodBurn({
    camera,
    materials: [/** @type {any} */ (parts.desk.getObjectByName('planks'))?.material, board.objects.wood.topMaterial].filter(Boolean),
    toPlane: (cx, cy, z) => clientToPlane(camera, cx, cy, width, height, z),
    keepAwake: f => { awake.add(f); },
    emit, now: () => clock.now(),
  });
  onPhase('physics', () => woodBurn.update());
  /** @type {any} */ (vc).woodBurn = woodBurn;
  // declared before WP-11 attaches: its set-up already projects points and re-slots the paper
  let sceneReady = false;
  const projV = new THREE.Vector3();
  // ── WP-11: title, tags, paper lift, Details / How-to / help unfold, menus, toast, tooltips, tour light ──
  // (before the shaders compile: the tour's two spotlights are added here at intensity 0)
  const surfaces = attachSurfaces({
    float: els.float, print: els.print, THREE, scene, camera, lights, veil, paper, project, onPhase, rng,
    printDirty: () => { printDirty = true; },
  });

  // ── WP-05: generate the textures (spread over a few frames while the desk warms up) ─────
  // Compile every shader before the first scene frame. Without KHR_parallel_shader_compile (some
  // older GPUs) three's compileAsync only warns and polls, so compile in slices there instead.
  /** Debug (`three.startup`): the software blocking start's timings. */
  const startup = { software, compileMs: 0, firstFrameMs: 0, loopStartedAt: 0 };
  const compiled = software ? Promise.resolve(softwareCompile())
    : renderer.extensions.has('KHR_parallel_shader_compile')
      ? warmPrograms().catch(e => { console.warn('compileAsync failed; shaders compile on first use', e); })
      : compileInSlices();
  /**
   * WP-14: compile() skips hidden objects, so the gauntlet's ember socket (shown only while
   * Details is open) compiled on first use: a ~90 ms long task. Show hidden meshes for the
   * synchronous part of the call (compileAsync collects its programs there); lights stay as they
   * are, since their count is part of every program.
   * @template T @param {() => T} fn
   */
  function withHiddenShown(fn) {
    /** @type {THREE.Object3D[]} */
    const hidden = [];
    scene.traverse(o => { if (!o.visible && !(/** @type {any} */ (o).isLight)) { hidden.push(o); o.visible = true; } });
    try { return fn(); } finally { for (const o of hidden) o.visible = false; }
  }
  /**
   * WP-14: the parallel warm-up. Programs depend on the output: the scene is always drawn into
   * the post passes' render target (linear, no tone mapping), so compile with a target bound;
   * compiled for the screen, every program was compiled a second time in the first frames, and
   * whatever was off-screen then (the gauntlet's strap and socket) compiled in the middle of use.
   * The bloom pre-pass's black stand-ins are compiled too.
   */
  function warmPrograms() {
    const prev = renderer.getRenderTarget();
    const rt = new THREE.WebGLRenderTarget(1, 1);
    renderer.setRenderTarget(rt);
    try {
      return withHiddenShown(() => Promise.all([
        renderer.compileAsync(scene, camera),
        post.withDark(() => renderer.compileAsync(scene, camera)),
      ]));
    } finally { renderer.setRenderTarget(prev); rt.dispose(); }
  }
  /**
   * WP-07: the blocking start on a software renderer (SwiftShader, llvmpipe). There every shader
   * compile and texture pass blocks the page (~10 s in all on SwiftShader: the compiler runs
   * when a result is first asked for, so nothing can overlap it). Spread over the first frames,
   * those blocks froze the page again and again while the visitor (or a test) was already using
   * it, and every block made the frame loop replay the missed frames afterwards. So do it all in
   * one go, during page load, before the frame loop starts: compile both contexts (every program drawn
   * once into a 1×1 target), then the textures (`blocking` run, no frame
   * waits); the loop starts when they are done (`softwareStart`). Real GPUs never take this path.
   */
  function softwareCompile() {
    const t0 = performance.now();
    try {
      // the post and shadow passes compile in the first lit frame (softwareStart), still before the loop
      compileAll();
    } catch (e) { console.warn('shader warm-up failed; shaders compile on first use', e); }
    // the printed layer joins the document now, not at the first frame
    css.render(printScene, camera); lastPrintCamera = rig.version; printDirty = false;
    startup.compileMs = +(performance.now() - t0).toFixed(1);
  }
  /**
   * Compile every program of both contexts. three's compile() skips hidden objects (the brass
   * inlays until a save pours them), so everything is shown for the compile only: no program is
   * left to compile in the middle of use.
   */
  function compileAll() {
    /** @type {THREE.Object3D[]} */
    const hidden = [];
    for (const root of [scene, veil.scene]) root.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    // programs depend on the output (screen: sRGB and tone mapped; render target: linear). The
    // scene is always drawn into the post passes' render target (post.js), so compile for that
    // ANGLE (SwiftShader) only really compiles a program when it is first drawn with, so draw
    // everything once into a 1×1 target as well: the inlays' first draw otherwise blocked the
    // page for ~0.5 s just as a save's pour began
    const prev = renderer.getRenderTarget();
    const rt = new THREE.WebGLRenderTarget(1, 1);
    const vrt = new THREE.WebGLRenderTarget(1, 1);
    try {
      renderer.setRenderTarget(rt); renderer.compile(scene, camera); renderer.render(scene, camera);
      veil.renderer.compile(veil.scene, camera);
      veil.renderer.setRenderTarget(vrt); veil.renderer.render(veil.scene, camera); veil.renderer.setRenderTarget(null);
    } finally {
      renderer.setRenderTarget(prev); rt.dispose(); vrt.dispose();
      for (const o of hidden) o.visible = false;
    }
  }
  function softwareStart() {
    if (stopFrames) return;
    // no warm-up fade here; the first lit frame is drawn now, still inside the blocking start, so
    // its one-off readbacks (the paper tone, the veil's excess light: ~0.5 s each on SwiftShader)
    // don't land in the middle of the page's own animations
    const t0 = performance.now();
    warmup.finish();
    sceneReady = true; benchArmed = true; markUsable(); boot();
    // the generated maps changed some programs since softwareCompile (hidden ones included)
    try { compileAll(); forceRender(); } catch (e) { console.warn('first desk frame failed', e); }
    startup.firstFrameMs = +(performance.now() - t0).toFixed(1);
    // read the clock once before the loop's first frame is asked for (also the debug timestamp)
    startup.loopStartedAt = +performance.now().toFixed(1);
    stopFrames = clock.onFrame(frame);
  }
  /**
   * WP-07: without parallel compile (SwiftShader, some older GPUs) one `compile(scene)` blocked the
   * page for ~4 s; compile one object per distinct material set at a time, in ~30 ms slices.
   */
  function compileInSlices() {
    /** @type {THREE.Object3D[]} */
    const items = [];
    const seen = new Set();
    scene.traverse(o => {
      const m = /** @type {any} */ (o).material;
      if (!m) return;
      const key = (Array.isArray(m) ? m : [m]).map(x => x.uuid).join();
      if (seen.has(key)) return;
      seen.add(key); items.push(o);
    });
    return new Promise(resolve => {
      let i = 0;
      const step = () => {
        const t0 = performance.now();
        while (i < items.length && performance.now() - t0 < 30) {
          try { renderer.compile(items[i], camera, scene); } catch (e) { console.warn('shader compile failed; it compiles on first use', e); }
          i++;
        }
        if (i < items.length) setTimeout(step, 0); else resolve(undefined);
      };
      clock.nextFrame(step); // WP-18P: the central scheduler
    });
  }
  const texturesReady = tex.run({ releaseAfterReadback: ['paper.normal', 'paper.roughness'], blocking: software }).then(() => {
    // Paul, WP-17 item 5: the main section's scroll fades out along the deckle (read before the veil takes it)
    paper.setEdge(tex.shared.paperNormalBitmap);
    if (tex.shared.paperNormalBitmap) veil.setPaperNormal(tex.shared.paperNormalBitmap);
    overlays.setGrainTile(tex.shared.filmGrainDataUrl);
    // for the HTML layers (WP-07: floating sheets' paper, ink-grain mask on printed text)
    // WP-14: what CSS reads through var() is a short blob: URL (src/util/image-url.js); `--vc-paper`
    // keeps the data URL for anything that reads the property itself, but no rule uses it
    desk.style.setProperty('--vc-paper', `url(${tex.shared.paperDataUrl})`);
    desk.style.setProperty('--vc-paper-src', `url(${toBlobUrl(tex.shared.paperDataUrl)})`);
    desk.style.setProperty('--vc-ink-grain', `url(${toBlobUrl(tex.shared.inkGrainDataUrl)})`);
    const t = tex.timing;
    const over = tier === 'high' && t.totalMs > R.textures.budgetMs;
    console.info(`[desk] textures generated in ${t.totalMs.toFixed(0)} ms on ${tier}` + (over ? ` (budget ${R.textures.budgetMs} ms)` : ''));
    printDirty = true;
  }).catch(e => {
    console.warn('texture generation failed; the desk keeps its plain colours', e);
    warmup.finish();
  }).finally(() => {
    // memory changed (paper maps handed to the veil): refit the pixel ratio
    resize();
    if (software) softwareStart();
    compiled.then(() => { sceneReady = true; lastWall = null; benchArmed = true; markUsable(); boot(); });
  });

  // ── Printed layer helpers (WP-06/07 build on these) ─────────────────────────────────────
  /**
   * Place an HTML element on a sheet, authored at pxPerCm and scaled down in 3D.
   * @param {HTMLElement} el
   * @param {{x0: number, y0: number, w: number, h: number, z?: number}} rect  cm, x0/y0 = bottom-left
   */
  function addPrinted(el, rect) {
    const px = R.print.pxPerCm;
    el.classList.add('vc-printed');
    el.style.width = `${rect.w * px}px`;
    el.style.height = `${rect.h * px}px`;
    const obj = new CSS3DObject(el);
    // CSS3DObject turns text selection off on its element; printed text must stay selectable (WP-09)
    el.style.userSelect = '';
    el.style.webkitUserSelect = '';
    obj.scale.setScalar(1 / px);
    obj.position.set(rect.x0 + rect.w / 2, rect.y0 + rect.h / 2, (rect.z ?? 0) + layout.printLift);
    printScene.add(obj);
    printDirty = true;
    return obj;
  }

  /** Paper point (cm) → client px. @param {number} x @param {number} y @param {number} [z] */
  function project(x, y, z = 0) {
    camera.updateMatrixWorld();
    projV.set(x, y, z).project(camera);
    return { x: (projV.x + 1) / 2 * width, y: (1 - projV.y) / 2 * height };
  }

  // ── Paul, WP-17 item 7: a seamless load-in ──────────────────────────────────────────────
  // Until the lit scene is ready, layer 1 and the veil are hidden over the desk's own brown, and a
  // printed paper (the sheet's shape, warm parchment tone, soft deckle) lies under the text, so the
  // paper shows from the first desk frame. When the scene is ready it fades in under that paper,
  // then the paper fades away onto the real one (scene.css, `R.stage.bootFadeMs`).
  const underlay = document.createElement('div');
  underlay.className = 'vc-paper-under';
  underlay.setAttribute('aria-hidden', 'true');
  const underObj = addPrinted(underlay, { x0: layout.sheet.x0, y0: layout.sheet.y0, w: layout.sheet.x1 - layout.sheet.x0, h: layout.sheet.y1 - layout.sheet.y0, z: -0.02 });
  desk.classList.add('vc-booting');
  desk.style.setProperty('--vc-boot-ms', S.bootFadeMs + 'ms');
  let booted = false;
  const boot = () => {
    if (booted) return;
    booted = true;
    desk.classList.remove('vc-booting');
    setTimeout(() => { printScene.remove(underObj); underlay.remove(); printDirty = true; }, 2 * S.bootFadeMs + 100);
  };

  // ── Debug and test API ──────────────────────────────────────────────────────────────────
  /** @type {CSS3DObject[]} */
  const testObjects = [];
  const api = {
    phases: PHASES,
    /** WP-07: smoothed CPU ms per frame phase. */
    /** phase CPU times; `phaseMs(true)` starts measuring, `phaseMs(false)` stops */
    phaseMs: (/** @type {boolean} */ on) => { if (on !== undefined) profilePhases(on); return Object.fromEntries(Object.entries(phaseMs).map(([k, v]) => [k, +v.toFixed(1)])); },
    /** DOM inspection of the layer stack (acceptance item 1). */
    layers() {
      return [...desk.children].map((el, i) => {
        const cs = getComputedStyle(el);
        return {
          n: i + 1, id: el.id, tag: el.tagName.toLowerCase(),
          mixBlendMode: cs.mixBlendMode, pointerEvents: cs.pointerEvents,
          isolation: cs.isolation, opacity: cs.opacity, filter: cs.filter,
          childPointerEvents: el.id === 'float' ? 'auto' : undefined,
        };
      });
    },
    /** @param {number} x @param {number} y @param {number} [z] */
    project,
    camera: {
      /** @param {{x?: number, y?: number, zoom?: number}} o */
      set(o) { rig.override(o); printDirty = true; forceRender(); return rig.read(); },
      release() { rig.release(); return rig.read(); },
      /** WP-16A: zoom by a factor about a normalised point (as the wheel does). @param {number} f @param {number} [nx] @param {number} [ny] */
      zoomBy(f, nx, ny) { return rig.zoomBy(f, nx, ny); },
      /** Paul, WP-17 item 2: toggle the click zoom about a normalised point. @param {number} nx @param {number} ny */
      clickZoom(nx, ny) { return rig.clickZoom(nx, ny); },
      resetZoom() { rig.resetZoom(); },
      read: () => rig.read(),
      /** @param {number} [amount] @param {number} [ms] */
      shake(amount, ms) { rig.shake(amount, ms); },
    },
    input: () => input.readNow(),
    /** Every frame reports exactly `ms` to the governor (null = real timing). @param {number|null} ms */
    forceFrameMs(ms) { forcedFrameMs = ms === null || ms === undefined ? null : +ms; },
    /** WP-18P: freeze the governor (pixel diffs, timing tools) or release it. @param {boolean} on */
    holdGovernor(on) { governor.hold(on); },
    /** Adds `ms` to every measured frame. @param {number} ms */
    slowFrames(ms) { extraFrameMs = Math.max(0, +ms || 0); },
    stats: () => ({
      frames, hiddenSkips, lastFrameMs, avgFrameMs, tier, idleSkips, shadowSkips, wakeReason, idle: clock.frameWall() - lastActive >= S.idleAfterMs,
      governor: { phase: governor.phase, benchmarkMs: governor.benchmarkMs, drops: governor.drops, windowMs: governor.windowMs, trim: governor.trim, climbs: governor.climbs, held: governor.held, gpuMs, gpuAvgMs: gpuAvg, gpuParts: [...gpuParts], gpuTimer: gpuTimers[0].supported },
      post: post.state, veilPixelRatio: veil.pixelRatio, scenePixelRatio: renderer.getPixelRatio(),
      shadowMap: lights.key.shadow.mapSize.x, environment: env.kind, software, glRenderer: glName.slice(0, 80),
      perFrame: { ...perFrame },
      renderer: { calls: renderer.info.render.calls, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures },
    }),
    qualityLog,
    trimLog,
    /** WP-05 textures: timing log, hashes (same seed → same bytes), GPU memory. */
    textures: {
      ready: () => texturesReady,
      get timing() { return tex.timing; },
      hash: () => tex.hash(),
      memory: () => tex.memory(),
      shared: () => ({ paperNormalBitmap: !!tex.shared.paperNormalBitmap, paperDataUrl: tex.shared.paperDataUrl.length, inkGrainDataUrl: tex.shared.inkGrainDataUrl.length, filmGrainDataUrl: tex.shared.filmGrainDataUrl.length }),
      warmup: () => warmup.state,
    },
    /** Estimated GPU memory of the whole desk (textures, render targets, shadow maps, geometry). */
    gpuMemory: () => ({ ...estimateGpuMemory({ ...memInputs(), scenePixelRatio: renderer.getPixelRatio() }), pixelRatio: renderer.getPixelRatio(), devicePixelRatio: devicePR(), budgetMB: S.gpuBudgetMB }),
    test: {
      /**
       * Printed test text on the inset sheet, with zero-size markers at its four corners.
       * @param {{x0?: number, y0?: number, w?: number, h?: number, text?: string}} [o]
       */
      printDiv(o = {}) {
        const I = layout.inset;
        const rect = { x0: o.x0 ?? I.x0 + 4, y0: o.y0 ?? I.y1 - 10, w: o.w ?? 24, h: o.h ?? 6, z: I.z };
        const el = document.createElement('div');
        el.className = 'vc-test-print';
        el.dataset.test = 'print';
        el.textContent = o.text ?? 'Printed test: the quick brown fox';
        for (const c of ['tl', 'tr', 'bl', 'br']) { const m = document.createElement('i'); m.dataset.c = c; el.append(m); }
        testObjects.push(addPrinted(el, rect));
        forceRender();
        return rect;
      },
      /** Max distance (px) between each test div's DOM corners and the projected paper corners. */
      alignment() {
        camera.updateMatrixWorld();
        let max = 0;
        const rows = [];
        for (const obj of testObjects) {
          const el = obj.element;
          const w = obj.scale.x * parseFloat(el.style.width), h = obj.scale.y * parseFloat(el.style.height);
          const cx = obj.position.x, cy = obj.position.y, z = obj.position.z;
          const want = { tl: [cx - w / 2, cy + h / 2], tr: [cx + w / 2, cy + h / 2], bl: [cx - w / 2, cy - h / 2], br: [cx + w / 2, cy - h / 2] };
          for (const m of el.querySelectorAll('i[data-c]')) {
            const c = /** @type {keyof typeof want} */ (/** @type {HTMLElement} */ (m).dataset.c);
            const r = m.getBoundingClientRect();
            const p = project(want[c][0], want[c][1], z);
            const d = Math.hypot(r.left - p.x, r.top - p.y);
            max = Math.max(max, d);
            rows.push({ corner: c, dom: [r.left, r.top], paper: [p.x, p.y], d });
          }
        }
        return { max, rows };
      },
      /** A shadow-only caster in the veil whose shadow lands on (x, y) cm. @param {{x: number, y: number, r?: number, height?: number}} o */
      shadow(o) { veil.addTestCaster(o); forceRender(); },
      /** A glow spot in #glow centred on paper point (x, y), radius in cm. @param {{x: number, y: number, r?: number, strength?: number}} o */
      glow(o) {
        const c = project(o.x, o.y), e = project(o.x + (o.r ?? 4), o.y);
        overlays.addGlowSpot({ x: c.x, y: c.y, r: Math.abs(e.x - c.x), strength: o.strength ?? 0.6 });
        forceRender();
      },
      clear() {
        for (const o of testObjects.splice(0)) { printScene.remove(o); o.element.remove(); }
        veil.clearTests(); overlays.clearGlow(); printDirty = true; forceRender();
      },
    },
    /** Render one frame right now (outside rAF), e.g. for a screenshot after a change. */
    renderNow: () => forceRender(),
    addPrinted,
    onPhase,
    dispose() {
      stopFrames?.(); input.dispose(); env.dispose(); veil.dispose(); dressed.reflections?.dispose(); tex.dispose(); renderer.dispose();
      document.removeEventListener('visibilitychange', onVisibility);
      for (const e of wakeEvents) removeEventListener(e, wake, { capture: true });
      removeEventListener('wheel', onWheel); removeEventListener('pointerdown', onDown, true); removeEventListener('click', onClick);
      removeEventListener('resize', resize);
      desk.remove();
    },
    // live objects for later WPs and for debugging in the console
    three: { THREE, scene, camera, renderer, rig, parts, lights, post, veil, overlays, input, governor, els, tex, dressed, warmup, board, paper, startup, get gauntlet() { return gauntlet; }, cursor, surfaces },
    markPrintDirty() { printDirty = true; },
  };

  function forceRender() { forcing = true; try { runFrame(0, clock.now()); } finally { forcing = false; } }

  /** @type {any} */ (vc).stage = api;
  /** @type {any} */ (vc).paper = paper;
  // DECISIONS point 12: every engraved string by slot id
  /** @type {any} */ (vc).engraved = board.engraved; // WP-06: the main atlas plus the tab counts
  /** @type {any} */ (vc).slowFrames = api.slowFrames;
  return api;
}

let stage = null;
try {
  stage = createStage();
} catch (e) {
  // The mode was chosen at load and never changes (DECISIONS point 8); if the GPU refuses a
  // context after all, take the desk away so the original page underneath stays usable.
  console.warn('Desk stage could not start; showing the page without the 3D desk.', e);
  document.getElementById('desk')?.remove();
  document.body.classList.add('vc-desk-failed');
}
export { stage };
