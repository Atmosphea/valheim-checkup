// @ts-check
/**
 * WP-10: the generated pictures the ink effects are made of.
 *
 *   washMasks()   the watercolour edge (step 2): a 2,048 × 256 picture, opaque on the left,
 *                 transparent on the right, with a ragged noisy edge, a few cauliflower blooms
 *                 and droplets. `in` reveals from the left; `out` is its mirror image, so the
 *                 erased part grows from the left too. Both are used at mask-size 300 % × 100 %.
 *   stampGrain()  a fresh 512 × 280 impression mask for one landing (step 6): 60–120 random
 *                 ASCII characters punched out of the ink at 15–50 % strength, plus ink voids
 *                 where a value noise passes a threshold. Returns an object URL and a hash.
 *
 * All randomness comes from the seeded generator handed in (file 01 "Randomness").
 */
import { stamp as MS, wash as MW } from '../config/motion.js';
import { toBlobUrl } from '../util/image-url.js';

/** @typedef {{ next(): number, range(a: number, b: number): number, int(a: number, b: number): number }} Rand */

/** Smooth 1D value noise from a seeded table. @param {Rand} rng @param {number} n */
function noise1(rng, n) {
  const t = Array.from({ length: n + 1 }, () => rng.next());
  return (/** @type {number} */ x) => {
    const xx = ((x % n) + n) % n, i = Math.floor(xx), f = xx - i, u = f * f * (3 - 2 * f);
    return t[i] + (t[i + 1] - t[i]) * u;
  };
}

/** @type {{ in: string, out: string } | null} */
let cached = null;

/**
 * The two wash masks as data URLs (made once per page).
 * @param {Rand} rng
 */
export function washMasks(rng) {
  if (cached) return cached;
  const W = MW.maskW, H = MW.maskH;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  // the edge sits in the middle of the picture (x = W/2); the left of it is ink-opaque
  const n1 = noise1(rng, 16), n2 = noise1(rng, 48), n3 = noise1(rng, 128), n4 = noise1(rng, 256);
  // Paul, WP-17 item 8: a noisier edge (× edgeNoise, plus a fine fourth octave)
  const k = MW.edgeNoise ?? 1;
  const edge = (/** @type {number} */ y) => {
    const v = y / H;
    return W / 2 + k * ((n1(v * 16) - 0.5) * W * 0.06 + (n2(v * 48) - 0.5) * W * 0.022 + (n3(v * 128) - 0.5) * W * 0.008 + (n4(v * 256) - 0.5) * W * 0.006);
  };
  // a soft wet band just inside the edge: the paint thins out towards the front
  for (let y = 0; y < H; y++) {
    const e = edge(y);
    const B = W * MW.bandFrac;
    const grad = g.createLinearGradient(e - B, 0, e + 2, 0);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.45, 'rgba(0,0,0,0.85)');
    grad.addColorStop(0.8, 'rgba(0,0,0,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = '#000';
    g.fillRect(0, y, Math.max(0, e - B), 1);
    g.fillStyle = grad;
    g.fillRect(e - B, y, B + 2, 1);
  }
  // Paul, WP-17 item 8: pigment specks through the wet band: dark grains ahead of the paint, pale
  // pinholes behind it, so the wash looks grainy and noisy as it pours through
  for (let i = 0; i < (MW.specks ?? 0); i++) {
    const y = rng.next() * H, e = edge(y), B = W * MW.bandFrac;
    const ahead = rng.next() < 0.45;
    const x = ahead ? e + rng.range(-2, 46) : e - rng.range(0, 1.6 * B);
    const r = rng.range(0.6, 2.4);
    g.globalCompositeOperation = ahead ? 'source-over' : 'destination-out';
    g.fillStyle = `rgba(0,0,0,${(ahead ? rng.range(0.35, 0.95) : rng.range(0.25, 0.7)).toFixed(2)})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  // cauliflower blooms: rings of paint pushed out past the edge (backruns)
  const blooms = rng.int(3, 5);
  for (let b = 0; b < blooms; b++) {
    const y = rng.range(0.1, 0.9) * H, x = edge(y) + rng.range(-4, 10), r = rng.range(14, 34);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rng.range(-0.3, 0.3), rr = r * rng.range(0.35, 0.65);
      const bx = x + Math.cos(a) * r * 0.55, by = y + Math.sin(a) * r * 0.55;
      const rg = g.createRadialGradient(bx, by, 0, bx, by, rr);
      rg.addColorStop(0, 'rgba(0,0,0,0.85)'); rg.addColorStop(0.8, 'rgba(0,0,0,0.6)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(bx, by, rr, 0, Math.PI * 2); g.fill();
    }
  }
  // droplets thrown ahead of the edge
  const drops = rng.int(10, 18);
  for (let d = 0; d < drops; d++) {
    const y = rng.next() * H, x = edge(y) + rng.range(8, 70), r = rng.range(1.5, 5);
    g.fillStyle = `rgba(0,0,0,${rng.range(0.5, 0.9).toFixed(2)})`;
    g.beginPath(); g.ellipse(x, y, r * rng.range(0.8, 1.4), r, rng.range(0, Math.PI), 0, Math.PI * 2); g.fill();
  }
  const inUrl = c.toDataURL('image/png');
  // the mirror: transparent on the left, opaque on the right
  const m = document.createElement('canvas');
  m.width = W; m.height = H;
  const mg = /** @type {CanvasRenderingContext2D} */ (m.getContext('2d'));
  mg.translate(W, 0); mg.scale(-1, 1); mg.drawImage(c, 0, 0);
  // WP-14: blob URLs; the ink writes `url(…)` per cell per frame, and a 2,048 px PNG as a data URL
  // made every write rebuild and compare a string of hundreds of KB (≈ 30 ms frames in a wash)
  cached = { in: toBlobUrl(inUrl), out: toBlobUrl(m.toDataURL('image/png')) };
  return cached;
}

/** FNV-1a over the bytes, as 8 hex digits. @param {Uint8ClampedArray} d */
export function hashBytes(d) {
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i += 3) { h ^= d[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/**
 * One stamp impression's mask, drawn fresh: opaque ink with ASCII characters and noise voids
 * punched out. The callback gets an object URL (revoke it when the stamp is gone) and the hash.
 * @param {Rand} rng
 * @returns {{ canvas: HTMLCanvasElement, hash: string, url: Promise<string> }}
 */
export function stampGrain(rng) {
  const W = MS.grainW, H = MS.grainH;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  // WP-14: the hash is taken from what made it, not read back. Paul, WP-17 item 10b: but toBlob reads
  // the canvas back to encode it, which on a GPU canvas stalled ~40 ms: a CPU canvas encodes cheaply
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: true }));
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  // ink voids: value noise over a coarse grid, smoothly interpolated, thresholded
  const cell = MS.grainVoidCell, gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2;
  const grid = Float32Array.from({ length: gw * gh }, () => rng.next());
  // computed at half resolution and drawn scaled up (soft edges, a quarter of the work)
  const VW = W >> 1, VH = H >> 1;
  const img = g.createImageData(VW, VH);
  const at = (/** @type {number} */ x, /** @type {number} */ y) => {
    const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy;
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = grid[iy * gw + ix], b = grid[iy * gw + ix + 1], cc = grid[(iy + 1) * gw + ix], d = grid[(iy + 1) * gw + ix + 1];
    return a + (b - a) * su + (cc - a) * sv + (a - b - cc + d) * su * sv;
  };
  const T = MS.grainVoidThreshold;
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const n = at(x * 2, y * 2) * 0.75 + at((x * 6.2 + 17) % (W - cell), (y * 6.2 + 5) % (H - cell)) * 0.25;
    const k = Math.max(0, Math.min(1, (n - T) / 0.08));
    const i = (y * VW + x) * 4;
    img.data[i + 3] = Math.round(k * 255 * MS.grainVoidDepth);
  }
  // draw the voids as a punch-out layer
  const voids = document.createElement('canvas');
  voids.width = VW; voids.height = VH;
  /** @type {CanvasRenderingContext2D} */ (voids.getContext('2d')).putImageData(img, 0, 0);
  g.drawImage(voids, 0, 0, W, H);
  // ASCII grain
  const chars = MS.grainChars, count = rng.int(MS.grainCharsMin, MS.grainCharsMax);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const draws = [];
  for (let i = 0; i < count; i++) {
    const ch = chars[Math.floor(rng.next() * chars.length)];
    const px = rng.range(MS.grainCharPxMin, MS.grainCharPxMax);
    const x = rng.next() * W, y = rng.next() * H;
    const rot = rng.range(-MS.grainCharRotDeg, MS.grainCharRotDeg), alpha = rng.range(MS.grainCharAlphaMin, MS.grainCharAlphaMax);
    draws.push(`${ch}${px.toFixed(1)},${x.toFixed(1)},${y.toFixed(1)},${rot.toFixed(2)},${alpha.toFixed(3)}`);
    g.save();
    g.translate(x, y);
    g.rotate(rot * Math.PI / 180);
    g.globalAlpha = alpha;
    g.font = `${px.toFixed(1)}px ui-monospace, Menlo, monospace`;
    g.fillStyle = '#000';
    g.fillText(ch, 0, 0);
    g.restore();
  }
  // WP-14: the impression's hash from its voids and its characters; reading the 512 × 280 canvas
  // back cost ≈ 20 ms per stamp in the frame the stamp lands
  const hash = hashBytes(img.data) + hashBytes(/** @type {any} */ (new TextEncoder().encode(draws.join(';'))));
  const url = new Promise(resolve => {
    c.toBlob(b => resolve(b ? URL.createObjectURL(b) : c.toDataURL()), 'image/png');
  });
  return { canvas: c, hash, url };
}
