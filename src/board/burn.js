// @ts-check
/**
 * Paul, WP-16 item 12: "Achievement collections", "Your Viking" and "Save files stay on this
 * device" are burned deep into the woodblock: charred near-black letters with a little ash in
 * them, sunk into the wood (a normal map from the letters' height), a dark scorched rim hugging
 * each stroke and a faint brown halo where the heat spread into the grain.
 *
 * Each label is a thin decal over the slab's top face with its own small canvas texture (the
 * WP-05 engraving atlas has no room for a 65 cm board face). The strings are read word for word
 * from the page, like every other carving (DECISIONS point 12); they stay listed under
 * `board:face` in `__vc.engraved()`.
 */
import * as THREE from 'three';
import { board as B } from '../config/layout.js';
import { board as BR, fonts as F, ember as EM } from '../config/render.js';
import { addPatch, lin } from '../scene/materials/patch.js';
import { divider, fieldCx } from './layout.js';
import { splitInTwo } from './engravings.js';

const BURN = BR.burn;
const text = (/** @type {string} */ sel) => (document.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** @param {'smallCaps'|'body'} kind @param {number} px */
const font = (kind, px) => `${F[kind].weight} ${Math.round(px)}px "${F[kind].family}", serif`;

/** Burned letters spread: each stroke is drawn a little bolder than the type. */
const burnText = (/** @type {CanvasRenderingContext2D} */ c, /** @type {string} */ t, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ ppc) => {
  c.lineWidth = BURN.boldCm * ppc; c.lineJoin = 'round';
  c.strokeText(t, x, y); c.fillText(t, x, y);
};

/**
 * The three labels' strings (from the page) and their boxes on the board (board cm).
 * @returns {{ id: string, text: string, cx: number, cy: number, w: number, h: number, draw: (c: CanvasRenderingContext2D, ppc: number, W: number, H: number) => void }[]}
 */
export function burnLabels() {
  const heading = text('.sidebar > .eyebrow:not(.insights-label)') || 'Achievement collections';
  const viking = text('.sidebar > .insights-label') || 'Your Viking';
  const note = text('.side-note');
  const cx = fieldCx(), fw = B.fieldX1 - B.fieldX0;
  const pxForCap = (/** @type {CanvasRenderingContext2D} */ c, /** @type {'smallCaps'|'body'} */ kind, /** @type {number} */ capPx) => {
    c.font = font(kind, 100);
    return capPx * 100 / (c.measureText('H').actualBoundingBoxAscent || 66);
  };
  const d = divider();
  return [
    {
      id: 'heading', text: heading, cx, cy: B.headingY, w: fw, h: B.headingCap * 2.6,
      draw(c, ppc, W, H) {
        c.font = font('smallCaps', pxForCap(c, 'smallCaps', B.headingCap * ppc));
        burnText(c, heading, W / 2, H / 2 + B.headingCap * ppc / 2, ppc);
      },
    },
    {
      // WP-17 item 17: the divider's rules stop short of the row-height groove on the left
      id: 'divider', text: viking, cx: (B.rowSlider.x0 + B.rowSlider.w + 0.3 + B.fieldX1) / 2, cy: d.cy, w: B.fieldX1 - (B.rowSlider.x0 + B.rowSlider.w + 0.3), h: B.pitch * 0.9,
      draw(c, ppc, W, H) {
        c.font = font('smallCaps', pxForCap(c, 'smallCaps', B.dividerCap * ppc));
        const y = H / 2;
        burnText(c, viking, W / 2, y + B.dividerCap * ppc / 2, ppc);
        // a burned rule either side, ending in a small diamond
        const tw = c.measureText(viking).width, gap = 0.6 * ppc, m = 0.5 * ppc;
        c.lineWidth = 0.11 * ppc; c.lineCap = 'round';
        for (const [a, b] of [[m, W / 2 - tw / 2 - gap], [W / 2 + tw / 2 + gap, W - m]]) {
          c.beginPath(); c.moveTo(a, y); c.lineTo(b, y); c.stroke();
          const e = a === m ? b : a, r = 0.17 * ppc;
          c.beginPath(); c.moveTo(e, y - r); c.lineTo(e + r, y); c.lineTo(e, y + r); c.lineTo(e - r, y); c.closePath(); c.fill();
        }
      },
    },
    {
      id: 'sidenote', text: note, cx, cy: (B.sideNoteY[0] + B.sideNoteY[1]) / 2, w: fw, h: (B.sideNoteY[0] - B.sideNoteY[1]) + B.sideNoteCap * 3.4,
      draw(c, ppc, W, H) {
        c.font = font('body', pxForCap(c, 'body', B.sideNoteCap * ppc));
        const lines = splitInTwo(note, c);
        const mid = (B.sideNoteY[0] + B.sideNoteY[1]) / 2;
        lines.forEach((l, i) => burnText(c, l, W / 2, H / 2 - (B.sideNoteY[i] - mid) * ppc + B.sideNoteCap * ppc / 2, ppc));
      },
    },
  ];
}

/** A blurred copy of a canvas (CSS blur, radius px). @param {HTMLCanvasElement} src @param {number} r */
function blurred(src, r) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: true }));
  g.filter = `blur(${Math.max(0.01, r).toFixed(2)}px)`;
  g.drawImage(src, 0, 0);
  return g.getImageData(0, 0, c.width, c.height).data;
}

/** Small seeded hash noise for the ash in the char. @param {number} x @param {number} y */
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

/**
 * Colour (sRGB, alpha) and normal maps for one burned label.
 * @param {ReturnType<typeof burnLabels>[number]} L
 */
export function burnMaps(L) {
  const ppc = BURN.pxPerCm;
  const W = Math.ceil(L.w * ppc), H = Math.ceil(L.h * ppc);
  const mask = document.createElement('canvas');
  mask.width = W; mask.height = H;
  const m = /** @type {CanvasRenderingContext2D} */ (mask.getContext('2d', { willReadFrequently: true }));
  m.fillStyle = '#000'; m.fillRect(0, 0, W, H);
  m.fillStyle = '#fff'; m.strokeStyle = '#fff';
  m.textAlign = 'center'; m.textBaseline = 'alphabetic';
  L.draw(m, ppc, W, H);
  const core = m.getImageData(0, 0, W, H).data;
  const soft = blurred(mask, 0.6);
  const scorch = blurred(mask, BURN.scorchCm * ppc);
  const halo = blurred(mask, BURN.haloCm * ppc);
  const wall = blurred(mask, BURN.recessCm * ppc);
  const col = new Uint8ClampedArray(W * H * 4), nrm = new Uint8ClampedArray(W * H * 4);
  const hex = (/** @type {string} */ h) => new THREE.Color(h);
  const cChar = hex(BURN.charColor), cScorch = hex(BURN.scorchColor), cHalo = hex(BURN.haloColor);
  const height = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const k = core[i * 4] / 255, s = Math.min(1, scorch[i * 4] / 255 * 2.4), h = Math.min(1, halo[i * 4] / 255 * 1.8), a0 = soft[i * 4] / 255;
    const x = i % W, y = (i / W) | 0;
    // the char: near black with grey ash flecks; the scorched rim; the brown halo
    const ash = hash(x * 0.37, y * 0.37) < BURN.ashSpeckle * 0.25 ? 0.10 : 0;
    const inChar = Math.max(k, a0);
    const r = cChar.r + ash, gg = cChar.g + ash * 0.95, b = cChar.b + ash * 0.9;
    const mix = (/** @type {number} */ p, /** @type {number} */ q, /** @type {number} */ t) => p + (q - p) * t;
    // from outside in: halo → scorch → char
    let R = cHalo.r, G = cHalo.g, Bc = cHalo.b, A = h * BURN.haloAlpha;
    R = mix(R, cScorch.r, s); G = mix(G, cScorch.g, s); Bc = mix(Bc, cScorch.b, s); A = Math.max(A, s * BURN.scorchAlpha);
    R = mix(R, r, inChar); G = mix(G, gg, inChar); Bc = mix(Bc, b, inChar); A = Math.max(A, inChar * BURN.charAlpha);
    col[i * 4] = Math.round(Math.pow(Math.max(0, R), 1 / 2.2) * 255);
    col[i * 4 + 1] = Math.round(Math.pow(Math.max(0, G), 1 / 2.2) * 255);
    col[i * 4 + 2] = Math.round(Math.pow(Math.max(0, Bc), 1 / 2.2) * 255);
    col[i * 4 + 3] = Math.round(A * 255);
    // sunk in: the letters are the low parts, with sloped charred walls; the rim dips a little
    height[i] = -(0.75 * wall[i * 4] / 255 + 0.25 * s * 0.5);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const hl = height[y * W + Math.max(0, x - 1)], hr = height[y * W + Math.min(W - 1, x + 1)];
    const hd = height[Math.min(H - 1, y + 1) * W + x], hu = height[Math.max(0, y - 1) * W + x];
    // canvas y runs down the board; the texture is uploaded with flipY, so v (and +y) is up
    const nx = (hl - hr) * BURN.normalStrength, ny = (hd - hu) * -BURN.normalStrength;
    const len = Math.hypot(nx, ny, 1);
    nrm[i * 4] = Math.round((nx / len * 0.5 + 0.5) * 255);
    nrm[i * 4 + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
    nrm[i * 4 + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
    nrm[i * 4 + 3] = 255;
  }
  const toTex = (/** @type {Uint8ClampedArray} */ data, /** @type {string} */ space) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).putImageData(new ImageData(/** @type {any} */ (data), W, H), 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = space;
    t.anisotropy = 4;
    return t;
  };
  return { map: toTex(col, THREE.SRGBColorSpace), normalMap: toTex(nrm, THREE.NoColorSpace), W, H, alphaAt: (/** @type {number} */ u, /** @type {number} */ v) => col[(Math.min(H - 1, Math.floor((1 - v) * H)) * W + Math.min(W - 1, Math.floor(u * W))) * 4 + 3] / 255 };
}

/**
 * Build the three decals in the woodblock's root (board cm). Call once the fonts are ready.
 * @param {THREE.Object3D} root
 */
export function createBurns(root) {
  const group = new THREE.Group();
  group.name = 'burned-labels';
  root.add(group);
  /** @type {{ mesh: THREE.Mesh, maps: ReturnType<typeof burnMaps>, label: ReturnType<typeof burnLabels>[number] }[]} */
  const list = [];
  /** One set of ember uniforms for all three labels: x, y the fingertip (world cm), z strength, w time (ms). */
  const emberUniforms = {
    uEmber: { value: new THREE.Vector4(0, 0, 0, 0) },
    uEmberColor: { value: lin(EM.color).multiplyScalar(EM.intensity) },
    uEmberHot: { value: lin(EM.hot).multiplyScalar(EM.intensity) },
  };
  let emberK = 0;
  for (const L of burnLabels()) {
    const maps = burnMaps(L);
    const mat = new THREE.MeshStandardMaterial({
      name: `burn:${L.id}`, map: maps.map, normalMap: maps.normalMap, normalScale: new THREE.Vector2(1, 1),
      transparent: true, depthWrite: false, roughness: BURN.roughness, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    // Paul, WP-17 item 16: the char glows like embers near the gauntlet's fingertip (ember.*)
    addPatch(mat, {
      key: 'ember',
      uniforms: emberUniforms,
      vertexHead: 'varying vec2 vcEmW;',
      vertexBody: 'vcEmW = (modelMatrix * vec4(position, 1.0)).xy;',
      fragmentHead: 'uniform vec4 uEmber; uniform vec3 uEmberColor; uniform vec3 uEmberHot; varying vec2 vcEmW;',
      afterEmissive: `if (uEmber.z > 0.001) {
        vec2 dv = vcEmW - uEmber.xy;
        float near = uEmber.z * exp(-dot(dv, dv) / ${(EM.radiusCm * EM.radiusCm).toFixed(3)});
        float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float charred = diffuseColor.a * (1.0 - smoothstep(0.03, 0.3, lum));
        vec2 cell = floor(vcEmW * 7.0);
        float seed = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        float flick = 0.7 + 0.3 * sin(uEmber.w * ${(EM.flickerHz * 2 * Math.PI / 1000).toFixed(5)} + seed * 6.2832);
        vec3 c = mix(uEmberColor, uEmberHot, smoothstep(0.55, 1.0, near * flick));
        totalEmissiveRadiance += c * charred * near * flick;
      }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(L.w, L.h), mat);
    mesh.name = `burn:${L.id}`;
    mesh.position.set(L.cx, L.cy, B.thickness + 0.003);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    group.add(mesh);
    list.push({ mesh, maps, label: L });
  }
  return {
    group, list,
    /**
     * Paul, WP-17 item 16: the fingertip's place (world cm) and whether the gauntlet is there; the
     * glow rises over attackMs and dies over releaseMs. @param {number} x @param {number} y @param {boolean} on @param {number} dt @param {number} t
     */
    setEmber(x, y, on, dt, t) {
      const target = on ? 1 : 0;
      const tau = on ? EM.attackMs : EM.releaseMs;
      emberK += (target - emberK) * Math.min(1, dt / tau);
      if (emberK < 1e-3) emberK = 0;
      const u = emberUniforms.uEmber.value;
      u.set(x, y, emberK, t % 1e6);
    },
    ember: () => ({ ...emberUniforms.uEmber.value, k: +emberK.toFixed(3) }),
    /** The strings burned, by label id (for tests). */
    texts: () => Object.fromEntries(list.map(x => [x.label.id, x.label.text])),
    dispose() { for (const x of list) { x.mesh.geometry.dispose(); x.maps.map.dispose(); x.maps.normalMap.dispose(); /** @type {THREE.Material} */ (x.mesh.material).dispose(); } },
  };
}
