// @ts-check
/**
 * Paul, WP-18 item 10: "start here". While no save is loaded, script lettering reading "start
 * here" runs along a circle around the How-to coin (the "Find your Valheim character" help), a
 * little out from its rim, and a big hand-drawn arrow points at it.
 *
 * Desk only. It is drawn into a canvas printed on the coins' fixed level (so it adds no text to the
 * page: screen readers and the parity census read the page unchanged), never takes the pointer,
 * and fades out once a save is loaded or the main section is scrolled (the table would pass under it).
 * Placement (cm, layout `coins` and `startHere`): the lettering sits on the ring's lower-left arc,
 * left of the record toggle and above the collection title; the arrow comes down from the free
 * paper right of "Valheim Checkup" to the coin's upper-left rim, crossing no text.
 */
import { coins as LC, startHere as SH } from '../config/layout.js';
import { STRINGS } from '../strings.js';
import { on } from '../bus.js';

/**
 * @param {{ addPrinted: (el: HTMLElement, r: {x0: number, y0: number, w: number, h: number, z: number}) => any, z: number }} o
 */
export function attachStartHere(o) {
  const coin = LC.find(c => c.id === 'howto');
  if (!coin) return null;
  const R = SH.rect;
  const el = document.createElement('div');
  el.className = 'vc-start-here';
  el.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  el.append(canvas);
  const obj = o.addPrinted(el, { x0: R.x0, y0: R.y0, w: R.x1 - R.x0, h: R.y1 - R.y0, z: o.z });

  /** Paper cm → canvas px (y down). */
  const PX = SH.pxPerCm;
  const W = Math.round((R.x1 - R.x0) * PX), H = Math.round((R.y1 - R.y0) * PX);
  canvas.width = W; canvas.height = H;
  const X = (/** @type {number} */ x) => (x - R.x0) * PX;
  const Y = (/** @type {number} */ y) => (R.y1 - y) * PX;

  let drawn = false;
  function draw() {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const cx = X(coin.x), cy = Y(coin.y), rr = (coin.r + SH.ringGap) * PX;
    // ── the lettering along the ring: upright on the lower arc (tops toward the coin) ──
    ctx.fillStyle = SH.ink;
    ctx.font = `italic 400 ${Math.round(SH.letterCm * PX)}px 'IM Fell English', Georgia, serif`;
    ctx.textBaseline = 'alphabetic';
    const text = STRINGS.startHere;
    const widths = [...text].map(ch => ctx.measureText(ch).width);
    const track = SH.trackCm * PX;
    const total = widths.reduce((a, w) => a + w + track, -track);
    // screen angles (y down): 90° is straight below the coin; the text is centred at `centerDeg`
    // and runs counter-clockwise on screen (left to right along the bottom), baseline outside
    const radius = rr + SH.letterCm * PX * 0.72;
    let a = (SH.centerDeg * Math.PI) / 180 + total / 2 / radius;
    [...text].forEach((ch, i) => {
      const w = widths[i];
      const mid = a - w / 2 / radius;
      ctx.save();
      ctx.translate(cx + Math.cos(mid) * radius, cy + Math.sin(mid) * radius);
      ctx.rotate(mid - Math.PI / 2);
      // a hand's small wobble in size and lean (fixed, no randomness)
      const k = 1 + 0.05 * Math.sin(i * 2.3);
      ctx.scale(k, k);
      ctx.rotate(0.04 * Math.sin(i * 1.7));
      ctx.fillText(ch, -w / 2, 0);
      ctx.restore();
      a -= (w + track) / radius;
    });
    // ── the arrow: one wobbly stroke and an open, slightly uneven head ──
    const [sx, sy] = SH.arrowFrom, [tx, ty] = SH.arrowTo, [qx, qy] = SH.arrowBend;
    ctx.strokeStyle = SH.ink;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const pass = (/** @type {number} */ wPx, /** @type {number} */ off) => {
      ctx.lineWidth = wPx;
      ctx.beginPath();
      ctx.moveTo(X(sx) + off, Y(sy));
      const steps = 24;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        const x = u * u * sx + 2 * u * t * qx + t * t * tx, y = u * u * sy + 2 * u * t * qy + t * t * ty;
        const wob = Math.sin(t * 9.4 + off) * 0.05 * (1 - t);
        ctx.lineTo(X(x + wob), Y(y + wob * 0.6));
      }
      ctx.stroke();
    };
    pass(SH.strokeCm * PX, 0);
    pass(SH.strokeCm * PX * 0.45, 0.6);
    // head: two barbs back from the tip along the curve's last direction
    const dx = tx - qx, dy = ty - qy, dl = Math.hypot(dx, dy) || 1;
    const ux = dx / dl, uy = dy / dl, L = SH.headCm;
    ctx.lineWidth = SH.strokeCm * PX;
    for (const [side, len] of [[1, 1], [-1, 0.86]]) {
      const ang = (side * 28 * Math.PI) / 180;
      const bx = -(ux * Math.cos(ang) - uy * Math.sin(ang)), by = -(ux * Math.sin(ang) + uy * Math.cos(ang));
      ctx.beginPath();
      ctx.moveTo(X(tx), Y(ty));
      ctx.quadraticCurveTo(X(tx + bx * L * len * 0.5 + 0.08 * side), Y(ty + by * L * len * 0.5), X(tx + bx * L * len), Y(ty + by * L * len));
      ctx.stroke();
    }
    drawn = true;
  }

  const wrap = /** @type {HTMLElement|null} */ (document.querySelector('#collectionView .tablewrap'));
  let scrolled = false;
  // looked up each time: the header's load button can be re-seated after this sheet is built
  const hasSave = () => !!document.querySelector('#loadTop.has-save');
  function sync() {
    const on = !hasSave() && !scrolled;
    el.classList.toggle('vc-start-here--on', on);
    if (on && !drawn) {
      // the script face may still be loading: draw once it is there
      const f = `italic 400 ${Math.round(SH.letterCm * PX)}px 'IM Fell English'`;
      if (document.fonts?.check?.(f)) draw();
      else document.fonts?.load?.(f).then(draw, draw);
    }
  }
  // app.js sets #loadTop.has-save in its render; every render emits app:render
  on('app:render', () => sync());
  on('app:load', () => sync());
  wrap?.addEventListener('scroll', () => { const s = (wrap.scrollTop || 0) > 4; if (s !== scrolled) { scrolled = s; sync(); } }, { passive: true });
  sync();

  return {
    obj,
    read: () => ({ on: el.classList.contains('vc-start-here--on'), drawn, hasSave: hasSave(), scrolled }),
  };
}
