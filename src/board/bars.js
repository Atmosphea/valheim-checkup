// @ts-check
/**
 * The 13 steel bars (WP-06 "Bars and knobs"), all identical: body 12.4 × 1.26 × 0.5 cm with a
 * 0.07 cm bevel of 6 segments, brushed steel brushed along its length, the view's name
 * (without "The ") engraved on its left part; a rivet at the left end. Paul, WP-16 item 11: the
 * knob is a turned, round pull standing up from the bar's right end (a lathe profile: collar,
 * neck, a fluted and knurled grip, a domed top), not the old knurled box.
 *
 * `update(mech)` poses each bar from the mechanism: travel, lift, press tilt, knob roll with
 * speed, rattle and nudge. Hover sweeps a glint across the knurling (300 ms); keyboard focus
 * gives the knob a warm glow.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { bar as MB } from '../config/motion.js';
import { board as BR } from '../config/render.js';
import { createBrushedSteel, createKnurling, createRivets, rivetGeometry, applyEngraving } from '../scene/materials/index.js';
import { addPatch, patchUniforms, lin } from '../scene/materials/patch.js';
import { materials as MATS } from '../config/render.js';
import { rows, board as B } from './layout.js';
import { planarUv } from './geometry.js';

const DEG = Math.PI / 180;

/**
 * A turned knob (Paul, WP-16 item 11), axis along +z, its foot at z = 0 on the bar's top: a
 * collar, a waisted neck, a flared fluted grip with fine knurling, a domed top. A `grip`
 * attribute (1 on the grip band) tells the material where the knurl goes.
 * @param {typeof B.knob} K
 */
export function turnedKnobGeometry(K) {
  const R = K.cap, H = K.rise, st = K.stem;
  /** [radius, height] from the foot up; the grip band is between gripZ0 and gripZ1 */
  const prof = [[0.001, 0], [st * 1.04, 0], [st * 1.04, 0.05], [st * 0.9, 0.1], [st * 0.74, 0.22], [st * 0.72, 0.32], [st * 0.84, 0.42],
    [R * 0.72, 0.52], [R * 0.93, 0.61], [R, 0.68], [R, 0.8], [R, 0.92], [R * 0.985, 1.0], [R * 0.93, 1.07], [R * 0.8, 1.14], [R * 0.6, 1.2], [R * 0.32, 1.24], [0.001, 1.25]]
    .map(([r, z]) => new THREE.Vector2(r, z * H / 1.25));
  const gripZ0 = 0.6 * H / 1.25, gripZ1 = 1.02 * H / 1.25;
  const g = new THREE.LatheGeometry(prof, 96);
  // flutes: N shallow grooves cut round the grip, faded in and out at its ends
  const pos = g.getAttribute('position');
  const grip = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); // lathe: axis y
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const env = smooth(gripZ0, gripZ0 + 0.08, y) * (1 - smooth(gripZ1 - 0.08, gripZ1, y));
    const th = Math.atan2(z, x);
    const k = K.flutes ? 1 - 0.11 * env * (0.5 + 0.5 * Math.cos(K.flutes * th)) ** 2 : 1;
    pos.setXYZ(i, x * k, y, z * k);
    grip[i] = env;
  }
  g.setAttribute('grip', new THREE.BufferAttribute(grip, 1));
  g.computeVertexNormals();
  // Paul, WP-17 item 11: the lathe's first and last columns are the same seam vertices, and
  // computeVertexNormals sees each from one side only, so the specular broke there in a hard line
  // (at six o'clock): weld their normals (and tangents follow the averaged normal)
  const nrm = g.getAttribute('normal'), P = prof.length, S = (pos.count / P) - 1;
  for (let j = 0; j < P; j++) {
    const a = j, b = S * P + j;
    const x = nrm.getX(a) + nrm.getX(b), y = nrm.getY(a) + nrm.getY(b), z = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(a, x / l, y / l, z / l); nrm.setXYZ(b, x / l, y / l, z / l);
  }
  nrm.needsUpdate = true;
  g.rotateX(Math.PI / 2); // axis y → z
  return g;
}
const smooth = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * @param {import('../scene/textures/index.js').Textures} tex
 * @param {THREE.Object3D} parent   the woodblock root (board cm)
 */
export function createBars(tex, parent) {
  const L = B.bar, K = B.knob, T = B.thickness;
  const BRASS = MATS.brass;
  const floor = T - B.groove.depth;
  const bodyGeo = new RoundedBoxGeometry(L.length, L.height, L.thickness, L.segments, L.radius);
  planarUv(bodyGeo, { x0: -L.length / 2, x1: L.length / 2, y0: -L.height / 2, y1: L.height / 2 });
  const knobGeo = turnedKnobGeometry(K);
  const rivetGeo = rivetGeometry(0.16);
  rivetGeo.rotateX(Math.PI / 2);
  const rivetMat = createRivets();
  const glintColor = new THREE.Color(BR.glintColor);
  const focusColor = new THREE.Color(BR.focusGlow);

  /** @type {{ row: import('./layout.js').Row, group: THREE.Group, body: THREE.Mesh, knob: THREE.Mesh, bodyMat: THREE.MeshPhysicalMaterial, knobMat: THREE.MeshPhysicalMaterial, glintT0: number, focus: number }[]} */
  const list = [];
  for (const r of rows()) {
    const group = new THREE.Group();
    group.name = `bar:${r.category}`;
    const bodyMat = createBrushedSteel(tex, { half: new THREE.Vector3(L.length / 2, L.height / 2, L.thickness / 2), bevel: L.radius });
    bodyMat.name = `bar:${r.category}`;
    bodyMat.color.multiplyScalar(BR.barSteelTint);
    // Anisotropy (WP-05) normalises a tangent built from uv derivatives; on the rounded bevel a few
    // pixels have none and come out NaN, which bloom spreads into a black frame (seen on SwiftShader).
    addPatch(bodyMat, {
      key: 'nanGuard',
      afterAO: `
        if (any(isnan(reflectedLight.directSpecular)) || any(isinf(reflectedLight.directSpecular))) reflectedLight.directSpecular = vec3(0.0);
        if (any(isnan(reflectedLight.indirectSpecular)) || any(isinf(reflectedLight.indirectSpecular))) reflectedLight.indirectSpecular = vec3(0.0);
        if (any(isnan(reflectedLight.directDiffuse))) reflectedLight.directDiffuse = vec3(0.0);
        if (any(isnan(reflectedLight.indirectDiffuse))) reflectedLight.indirectDiffuse = vec3(0.0);`,
    });
    applyEngraving(bodyMat, tex.engraver, `bar:${r.category}`, { faceRect: [0.04, 0.14, 0.6, 0.86], axis: [0, 0, 1], faceWidthCm: L.length, deferred: true, cavityShade: BR.metalEngraveShade, depth: BR.metalEngraveDepth, boldTexels: BR.barNameBoldTexels, specCut: BR.barNameSpecCut, rim: BR.barNameRim, rimTexels: BR.barNameRimTexels });
    // Paul, WP-17 item 14: the progress fill is on the bar itself: the bar is gilded from its left
    // end to done / total of its length, with a molten front while it pours (the old lip inlay's look)
    addPatch(bodyMat, {
      key: 'barFill',
      uniforms: {
        uFill: { value: new THREE.Vector4(0, 0, 0, 0) }, // x fill (cm from the left end), y hot 0..1, z on
        uFillTint: { value: (c => new THREE.Color(c.r / Math.max(1e-3, bodyMat.color.r), c.g / Math.max(1e-3, bodyMat.color.g), c.b / Math.max(1e-3, bodyMat.color.b)).multiplyScalar(BR.barFillGain))(lin(BR.barFillColor)) },
        uFillHot: { value: lin(BRASS.pour.color).multiplyScalar(BRASS.pour.intensity * BR.barFillHotGain) },
        uFillEdge: { value: lin(BRASS.color).multiplyScalar(BR.barFillEdgeGlow) },
      },
      vertexHead: 'varying float vcBarX;',
      vertexBody: `vcBarX = position.x + ${(L.length / 2).toFixed(3)};`,
      fragmentHead: 'uniform vec4 uFill; uniform vec3 uFillTint; uniform vec3 uFillHot; uniform vec3 uFillEdge; varying float vcBarX;',
      afterMap: `float vcFillD = uFill.x - vcBarX;
        float vcGilt = uFill.z * smoothstep(-0.025, 0.025, vcFillD);
        diffuseColor.rgb *= mix(vec3(1.0), uFillTint, vcGilt);`,
      afterEmissive: `if (uFill.z > 0.0) {
        float fr = exp(-vcFillD * vcFillD / ${(BR.pourFrontCm * BR.pourFrontCm).toFixed(4)});
        float hot = step(0.0, vcFillD) * exp(-max(vcFillD, 0.0) / ${BR.pourHotCm.toFixed(3)});
        totalEmissiveRadiance += uFillHot * uFill.y * max(fr, hot * 0.55) * step(-${(BR.pourFrontCm * 2).toFixed(3)}, vcFillD);
        totalEmissiveRadiance += uFillEdge * exp(-vcFillD * vcFillD / 0.004) * step(0.02, uFill.x);
      }`,
    });
    // Paul, WP-18 item 11: past the fill front the bar's top face is cut with a row of deep
    // rectangular notches (dark floor, sloped walls in the normal map, a lit lip on the far wall,
    // little specular). Each notch is shown or left out whole: it is cut only past the fill front
    // and the rivet, and where no stroke of the engraved name lies in its columns (widened by
    // clearCm), so the name reads whole on its own land and the notches resume after it. `uFill.w` is on for every collection bar (also at 0 %);
    // insight bars have no progress and stay plain.
    const BN = BR.barNotch;
    addPatch(bodyMat, {
      key: 'barNotch',
      vertexHead: 'varying float vcBarY;',
      vertexBody: 'vcBarY = position.y;',
      fragmentHead: 'varying float vcBarY;',
      afterMap: `float vcNotch = 0.0, vcNotchWall = 0.0, vcNotchLip = 0.0;
        if (uFill.w > 0.5 && vcEngN.z > 0.5) {
          float u = mod(${L.length.toFixed(3)} - vcBarX, ${BN.pitchCm.toFixed(3)});
          // this notch's own span along the bar: a notch is shown or left out whole
          float n0 = vcBarX + u - ${BN.widthCm.toFixed(3)}, n1 = vcBarX + u;
          float aa = max(fwidth(vcBarX), 0.004);
          float inX = smoothstep(0.0, aa, u) * (1.0 - smoothstep(${BN.widthCm.toFixed(3)} - aa, ${BN.widthCm.toFixed(3)}, u));
          float inY = 1.0 - smoothstep(${BN.halfHCm.toFixed(3)} - aa, ${BN.halfHCm.toFixed(3)}, abs(vcBarY));
          // past the fill front (and the rivet at the left end)
          float past = step(uFill.x + ${BN.gapCm.toFixed(3)}, n0) * step(${BN.startCm.toFixed(3)}, n0);
          float clear = 1.0;
          if (uEngRect.z > uEngRect.x) {
            // any stroke of the engraved name in the columns of this notch, widened by clearCm
            float m = 0.0;
            // (level 0 lookups: inside a loop the implicit mip level is undefined and blurred thin strokes away)
            for (int j = 0; j < 8; j++) for (int i = 0; i < 9; i++) {
              float bx = mix(n0 - ${BN.clearCm.toFixed(3)}, n1 + ${BN.clearCm.toFixed(3)}, float(j) / 7.0);
              float lx = (bx / ${L.length.toFixed(3)} - uEngFace.x) / max(1e-3, uEngFace.z - uEngFace.x); // the face is widened per name (board/index.js)
              vec4 er = lx < uEngWipe ? uEngRect2 : uEngRect; // the string the engraving shows there (WP-06 wipe)
              vec2 q = vec2(mix(er.x, er.z, clamp(lx, 0.0, 1.0)), mix(er.y, er.w, (float(i) + 0.5) / 9.0));
              m = max(m, textureLod(uEngMap, q, 0.0).a * step(0.0, lx) * step(lx, 1.0));
            }
            clear = 1.0 - step(0.3, m);
          }
          vcNotch = inX * inY * past * clear;
          // walls: the first and last wallCm of each notch slope down into it
          float w = ${BN.wallCm.toFixed(3)};
          vcNotchWall = vcNotch * ((1.0 - smoothstep(0.0, w, u)) - smoothstep(${BN.widthCm.toFixed(3)} - w, ${BN.widthCm.toFixed(3)}, u));
          vcNotchLip = vcNotch * smoothstep(${BN.widthCm.toFixed(3)} - w, ${BN.widthCm.toFixed(3)}, u);
          diffuseColor.rgb *= mix(1.0, ${BN.floorShade.toFixed(3)}, vcNotch * (1.0 - 0.5 * abs(vcNotchWall)));
        }`,
      afterRoughness: 'roughnessFactor = mix(roughnessFactor, 0.8, vcNotch);',
      mapN: `mapN.x += vcNotchWall * ${BN.wallSlope.toFixed(2)};`,
      afterAO: `reflectedLight.directSpecular *= 1.0 - 0.85 * vcNotch;
        reflectedLight.indirectSpecular *= 1.0 - 0.8 * vcNotch;
        reflectedLight.directDiffuse += vcNotchLip * ${BN.lipGain.toFixed(2)} * vec3(0.32, 0.31, 0.29) * (1.0 - 0.7 * vcNotch + 0.7 * vcNotchLip);`,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.name = `bar-body:${r.category}`;
    body.position.set(L.length / 2, 0, floor + L.thickness / 2);
    body.castShadow = false; body.receiveShadow = true; // the merged caster below casts for it
    const knobMat = createKnurling(tex, { repeat: BR.knobKnurlRepeat });
    knobMat.name = `knob:${r.category}`;
    knobMat.color.multiplyScalar(BR.knobSteelTint);
    knobMat.roughness = BR.knobRoughness;
    knobMat.emissive = new THREE.Color(0);
    // the knurl only on the grip band; collar, neck and dome are plain turned steel
    addPatch(knobMat, {
      key: 'knobGrip',
      vertexHead: 'attribute float grip; varying float vcGrip;',
      vertexBody: 'vcGrip = grip;',
      fragmentHead: 'varying float vcGrip;',
      afterMap: 'diffuseColor.rgb *= mix(1.0, 0.5, vcGrip);',
      mapN: 'mapN.xy *= vcGrip * 1.6;',
    });
    addPatch(knobMat, {
      key: 'glint',
      uniforms: { uGlint: { value: new THREE.Vector2(-1, 0) }, uGlintColor: { value: glintColor.clone().multiplyScalar(BR.glintStrength) } },
      vertexHead: 'varying vec2 vcGlintUv;',
      vertexBody: 'vcGlintUv = uv;',
      fragmentHead: 'uniform vec2 uGlint; uniform vec3 uGlintColor; varying vec2 vcGlintUv;',
      // Paul, WP-17 item 11: the band wraps round the knob (uv.x jumps 1 → 0 at the lathe's seam, which
      // cut the glint in a hard line), and the flash is subtler with a very slight glow on the same timing
      afterEmissive: 'if (uGlint.y > 0.0) { float d = vcGlintUv.x + vcGlintUv.y * 0.35 - uGlint.x; d -= floor(d + 0.5); float g = exp(-pow(d / 0.12, 2.0)); totalEmissiveRadiance += uGlintColor * (g + ' + BR.glintGlow.toFixed(3) + ') * uGlint.y; }',
    });
    const knob = new THREE.Mesh(knobGeo, knobMat);
    knob.name = `knob:${r.category}`;
    knob.position.set(L.length + K.length / 2, 0, floor + L.thickness);
    knob.castShadow = false; knob.receiveShadow = true;
    const rivet = new THREE.Mesh(rivetGeo, rivetMat);
    rivet.position.set(0.45, 0, floor + L.thickness - 0.005);
    group.add(body, knob, rivet);
    group.position.set(r.barRestX0, r.cy, 0);
    parent.add(group);
    list.push({ row: r, group, body, knob, bodyMat, knobMat, glintT0: -1e9, focus: 0 });
  }

  // ── One shadow caster for all 13 bars and knobs ───────────────────────────────────────
  // Each bar casting its own shadow costs 39 draws in every shadow pass (the spark's point light
  // alone renders six); one merged box mesh, moved with the bars every frame, costs one.
  const boxes = list.flatMap(b => [
    { b, cx: L.length / 2, hx: L.length / 2, hy: L.height / 2, z0: floor, z1: floor + L.thickness },
    { b, cx: L.length + K.length / 2, hx: K.cap * 0.92, hy: K.cap * 0.92, z0: floor + L.thickness, z1: floor + L.thickness + K.rise },
  ]);
  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5).toNonIndexed();
  const unitPos = unit.getAttribute('position');
  const casterPos = new Float32Array(boxes.length * unitPos.count * 3);
  const casterGeo = new THREE.BufferGeometry();
  casterGeo.setAttribute('position', new THREE.BufferAttribute(casterPos, 3));
  const caster = new THREE.Mesh(casterGeo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  caster.name = 'bars-shadow-caster';
  caster.castShadow = true; caster.receiveShadow = false; caster.frustumCulled = false; caster.renderOrder = -1;
  caster.layers.set(2); // WP-14: shadow camera only (= PROXY_LAYER, gauntlet/model.js); no empty draw in the main pass
  parent.add(caster);
  const writeCaster = () => {
    let k = 0;
    for (const x of boxes) {
      const g = x.b.group.position;
      for (let i = 0; i < unitPos.count; i++) {
        casterPos[k++] = g.x + x.cx + unitPos.getX(i) * 2 * x.hx;
        casterPos[k++] = g.y + unitPos.getY(i) * 2 * x.hy;
        casterPos[k++] = g.z + x.z0 + unitPos.getZ(i) * (x.z1 - x.z0);
      }
    }
    casterGeo.attributes.position.needsUpdate = true;
    casterGeo.computeBoundingSphere();
  };
  writeCaster();

  // ── Latch dust: 6 fine particles puffed from the slot's left end over 300 ms ─────────────
  const dustN = MB.latchDustParticles * 4; // room for a few overlapping puffs
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustN * 3);
  const dustAlpha = new Float32Array(dustN);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('alpha', new THREE.BufferAttribute(dustAlpha, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(BR.dustColor) }, uSize: { value: BR.dustSizeCm }, uScale: { value: 800 } },
    vertexShader: /* glsl */ `attribute float alpha; varying float vA; uniform float uSize; uniform float uScale;
      void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize * uScale / -mv.z; }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uColor, vA * (1.0 - d * 2.0)); }`,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.name = 'latch-dust';
  dust.frustumCulled = false;
  parent.add(dust);
  /** @type {{x: number, y: number, z: number, vx: number, vy: number, vz: number, t0: number, life: number}[]} */
  const motes = [];

  return {
    list,
    meshes: list.flatMap(b => [b.body, b.knob]),
    /** Puff dust from a bar's slot end. @param {number} index @param {number} now @param {() => number} rnd */
    puff(index, now, rnd) {
      const r = list[index].row;
      for (let i = 0; i < MB.latchDustParticles; i++) {
        motes.push({
          x: r.groove.x1 - 0.25 - rnd() * 0.3, y: r.cy + (rnd() - 0.5) * 0.8, z: T - 0.1,
          vx: 0.8 + rnd() * 1.6, vy: (rnd() - 0.5) * 2.4, vz: 1.2 + rnd() * 2.2,
          t0: now + rnd() * MB.latchDustMs * 0.4, life: MB.latchDustMs * (0.6 + rnd() * 0.6),
        });
      }
      while (motes.length > dustN) motes.shift();
    },
    /**
     * Paul, WP-17 item 14: the gilded fill along a bar (0..1 of done / total) and its molten front (0..1).
     * @param {string} category @param {number} fill @param {number} hot
     */
    setFill(category, fill, hot) {
      const b = list.find(x => x.row.category === category);
      const u = b && patchUniforms(b.bodyMat, 'barFill').uFill;
      if (!u) return;
      const f = Math.max(0, Math.min(1, fill));
      u.value.set(f * L.length, hot, f > 0.0005 ? 1 : 0, 1); // w: WP-18 item 11, the notches
    },
    /** Debug (WP-18 item 11): which bars carry notches, and where their fill ends (cm). */
    notches: () => list.map(b => { const u = patchUniforms(b.bodyMat, 'barFill').uFill.value; return { category: b.row.category ?? null, on: u.w > 0.5, fillCm: +u.x.toFixed(3) }; }),
    /** Start the knurl glint on a bar. @param {number} index @param {number} now */
    glint(index, now) { list[index].glintT0 = now; },
    /** Keyboard focus glow 0/1. @param {number} index @param {boolean} on */
    focus(index, on) { list[index].focus = on ? 1 : 0; },
    /**
     * Pose every bar from the mechanism.
     * @param {import('./mechanism.js').Mechanism} mech @param {number} now @param {number} dt
     * @param {number} scale  CSS px per cm on screen at the board (for the dust size)
     */
    update(mech, now, dt, scale) {
      for (const [i, b] of list.entries()) {
        const s = mech.bars[i];
        // Paul, WP-16 item 9: rest is on the left; travel, the click nudge and the latch go right
        const x = b.row.barRestX0 + s.pos.value + s.nudge.value + s.rattle.value;
        b.group.position.set(x, b.row.cy, Math.max(0, s.lift.value));
        // press tilt toward the pull (the knob end rises a touch) and knob roll with speed
        const tilt = (s.state === 'pinched' || s.state === 'dragging') ? MB.pressTiltDeg * DEG : 0;
        b.group.rotation.y += (tilt - b.group.rotation.y) * Math.min(1, dt / MB.pressMs);
        // the round knob leans into the pull a touch with speed (it was a roll of the box knob)
        const roll = Math.max(-1, Math.min(1, s.pos.velocity / MB.dragKnobRollSpeed)) * MB.dragKnobRollDeg * DEG;
        b.knob.rotation.y += (roll - b.knob.rotation.y) * Math.min(1, dt / 60);
        // knurl glint: a band sweeping across in 300 ms
        const g = (now - b.glintT0) / MB.hoverGlintMs;
        const u = patchUniforms(b.knobMat, 'glint').uGlint;
        if (u) { if (g >= 0 && g <= 1) { u.value.set(-0.3 + 1.9 * g, Math.sin(g * Math.PI)); } else u.value.y = 0; }
        b.knobMat.emissive.copy(focusColor).multiplyScalar(b.focus);
      }
      writeCaster();
      // dust
      let n = 0;
      for (let k = motes.length - 1; k >= 0; k--) {
        const m = motes[k];
        const age = now - m.t0;
        if (age > m.life) { motes.splice(k, 1); continue; }
        if (age < 0) continue;
        const t = age / 1000, drag = Math.exp(-3 * t);
        dustPos[n * 3] = m.x + m.vx * t * drag; dustPos[n * 3 + 1] = m.y + m.vy * t * drag; dustPos[n * 3 + 2] = m.z + m.vz * t * drag - 2 * t * t;
        dustAlpha[n] = 0.55 * (1 - age / m.life);
        n++;
      }
      dustGeo.setDrawRange(0, n);
      dustGeo.attributes.position.needsUpdate = true;
      dustGeo.attributes.alpha.needsUpdate = true;
      dustMat.uniforms.uScale.value = scale;
    },
    dispose() {
      casterGeo.dispose(); unit.dispose(); /** @type {THREE.Material} */ (caster.material).dispose();
      bodyGeo.dispose(); knobGeo.dispose(); rivetGeo.dispose(); rivetMat.dispose(); dustGeo.dispose(); dustMat.dispose();
      for (const b of list) { b.bodyMat.dispose(); b.knobMat.dispose(); }
    },
  };
}
