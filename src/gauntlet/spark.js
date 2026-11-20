// @ts-check
/**
 * WP-09: the spark, drawn on #fx (2D, no bloom). Screen px throughout.
 *
 *   core     radial gradient #fff6d8 → #ffb347 → transparent, 3 px radius at 1× pixel ratio
 *   halo     9 px soft
 *   flicker  0.85–1.1 at 12 Hz (seeded)
 *   trail    14 particles, 220 ms life, emitted above 15 cm/s
 *   embers   a sudden stop (over 80 → under 20 cm/s within 90 ms) throws 4–8 embers on in the
 *            travel direction, 50–90% of the last velocity, ±15°, 250–450 ms, drag 3/s
 *   click    a thin ring 0 → 14 px in 220 ms, with three embers
 *   hover    over a control: core ×1.3, halo ×1.5 (the light +20% is the controller's)
 *   caret    over search / number fields, textareas and selects: a 2 × 16 px ember caret
 *   idle     a tiny crackle ember every 1.5–3 s
 *   window   fades out / pops in over 150 ms
 *   burst    WP-16 item 17: a slow-motion burst as it leaves the gauntlet: streaking sparks
 *            thrown hard in a cone, braked fast, then hanging and fading (and a small one when
 *            the hand catches it again)
 *   dot      WP-16 item 14: the same core and halo drawn white, for the gauntlet's aiming dot
 *
 * All values come from src/config/motion.js `spark`.
 */
import { spark as MS } from '../config/motion.js';

/** @typedef {{ x: number, y: number, vx: number, vy: number, born: number, life: number, size: number, drag: number }} Particle */

/**
 * @param {{ rng: { next(): number, range(a: number, b: number): number }, emit: (type: string, data?: object) => void, now: () => number }} o
 */
export function createSpark(o) {
  /** @type {Particle[]} */ const trail = [];
  /** @type {Particle[]} */ const embers = [];
  /** @type {(Particle & { streak: number })[]} */ const shots = [];
  /** @type {{ x: number, y: number, born: number, ms: number, size: number }[]} */ const flashes = [];
  /** @type {{ x: number, y: number, born: number }[]} */ const rings = [];
  const st = {
    x: 0, y: 0,
    /** 0…1 how visible (window fade, handover) */
    alpha: 0,
    hover: false, caret: false,
    flicker: 1,
    /** caret height in px (16 at 1×) */
    caretH: MS.caretHeightPx,
  };
  let flickT = 0, flickFrom = 1, flickTo = 1;
  let nextCrackle = o.now() + o.rng.range(MS.idleCrackleMinMs, MS.idleCrackleMaxMs);
  let trailAcc = 0;
  /** speed history (cm/s) for the sudden-stop test: [t, speed, vx, vy] in screen px/s for vx, vy */
  /** @type {[number, number, number, number][]} */
  const hist = [];
  let lastStopAt = -1e9;

  /** @param {number} x @param {number} y @param {number} vx @param {number} vy @param {number} life @param {number} size @param {number} drag */
  const add = (/** @type {Particle[]} */ list, x, y, vx, vy, life, size, drag) => list.push({ x, y, vx, vy, born: o.now(), life, size, drag });

  return {
    state: st,
    /**
     * Per frame. `speedCm` is the true pointer's speed on the paper (cm/s); `vx, vy` its velocity
     * in screen px/s. `moving` = the pointer moved this frame.
     * @param {number} dtMs @param {{ x: number, y: number, speedCm: number, vx: number, vy: number, visible: boolean }} p
     */
    update(dtMs, p) {
      const t = o.now();
      st.x = p.x; st.y = p.y;
      // flicker: a new random level every 1/12 s, eased between
      flickT += dtMs;
      const period = 1000 / MS.lightFlickerHz;
      if (flickT >= period) { flickT %= period; flickFrom = flickTo; flickTo = o.rng.range(MS.lightFlickerMin, MS.lightFlickerMax); }
      const k = flickT / period;
      st.flicker = flickFrom + (flickTo - flickFrom) * k * k * (3 - 2 * k);
      // particles (they live on while the spark is hidden)
      const dt = dtMs / 1000;
      for (const e of [...embers, ...shots]) { const d = Math.exp(-e.drag * dt); e.vx *= d; e.vy *= d; e.x += e.vx * dt; e.y += e.vy * dt; }
      for (const e of shots) e.vy += MS.leaveBurst.gravity * dt;
      for (const list of [trail, embers, shots]) for (let i = list.length - 1; i >= 0; i--) if (t - list[i].born > list[i].life) list.splice(i, 1);
      for (let i = flashes.length - 1; i >= 0; i--) if (t - flashes[i].born > flashes[i].ms) flashes.splice(i, 1);
      for (let i = rings.length - 1; i >= 0; i--) if (t - rings[i].born > MS.clickRingMs) rings.splice(i, 1);
      if (!p.visible) { hist.length = 0; return; }
      // trail
      if (p.speedCm > MS.trailMinSpeed) {
        trailAcc += dtMs;
        const every = MS.trailLifeMs / MS.trailParticles;
        while (trailAcc >= every) { trailAcc -= every; add(trail, p.x, p.y, 0, 0, MS.trailLifeMs, 1, 0); if (trail.length > MS.trailParticles) trail.shift(); }
      } else trailAcc = 0;
      // sudden stop: over stopFromSpeed within the last stopWithinMs, now under stopToSpeed
      hist.push([t, p.speedCm, p.vx, p.vy]);
      while (hist.length && t - hist[0][0] > MS.stopWithinMs + 40) hist.shift();
      if (p.speedCm < MS.stopToSpeed && t - lastStopAt > 200) {
        let fast = null;
        for (const h of hist) if (t - h[0] <= MS.stopWithinMs && h[1] > MS.stopFromSpeed && (!fast || h[1] > fast[1])) fast = h;
        if (fast) {
          lastStopAt = t;
          const n = Math.round(o.rng.range(MS.stopEmbersMin, MS.stopEmbersMax + 0.999) - 0.5);
          const count = Math.max(MS.stopEmbersMin, Math.min(MS.stopEmbersMax, n));
          const sp = Math.hypot(fast[2], fast[3]), a0 = Math.atan2(fast[3], fast[2]);
          for (let i = 0; i < count; i++) {
            const a = a0 + o.rng.range(-MS.stopEmberSpreadDeg, MS.stopEmberSpreadDeg) * Math.PI / 180;
            const s = sp * o.rng.range(MS.stopEmberSpeedMin, MS.stopEmberSpeedMax);
            add(embers, p.x, p.y, Math.cos(a) * s, Math.sin(a) * s, o.rng.range(MS.stopEmberLifeMinMs, MS.stopEmberLifeMaxMs), o.rng.range(0.9, 1.5), MS.stopEmberDrag);
          }
          hist.length = 0;
          o.emit('spark:embers', { count, angle: +(a0 * 180 / Math.PI).toFixed(1), speed: +sp.toFixed(0) });
        }
      }
      // idle crackle
      if (p.speedCm < 2 && t >= nextCrackle) {
        nextCrackle = t + o.rng.range(MS.idleCrackleMinMs, MS.idleCrackleMaxMs);
        const a = o.rng.range(0, Math.PI * 2);
        add(embers, p.x, p.y, Math.cos(a) * 40, Math.sin(a) * 40 - 30, 300, 0.7, 2);
      } else if (p.speedCm >= 2) nextCrackle = Math.max(nextCrackle, t + MS.idleCrackleMinMs);
    },
    /**
     * WP-16 item 17: a burst of sparks thrown from (x, y) in a cone around `angle` (radians,
     * screen), braked hard so they seem to fly in slow motion. @param {number} x @param {number} y
     * @param {number} angle @param {typeof MS.leaveBurst} cfg
     */
    burst(x, y, angle, cfg) {
      const t = o.now();
      flashes.push({ x, y, born: t, ms: cfg.flashMs, size: cfg.flashPx });
      for (let i = 0; i < cfg.count; i++) {
        const a = angle + o.rng.range(-cfg.spreadDeg, cfg.spreadDeg) * Math.PI / 180;
        const sp = o.rng.range(cfg.speedMin, cfg.speedMax);
        shots.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: t + o.rng.range(0, cfg.staggerMs), life: o.rng.range(cfg.lifeMinMs, cfg.lifeMaxMs), size: o.rng.range(0.7, 1.4), drag: cfg.drag, streak: cfg.streakS });
      }
      o.emit('spark:burst', { count: cfg.count, angle: +(angle * 180 / Math.PI).toFixed(1) });
    },
    /**
     * WP-16 item 14: the spark's core and halo, white (the gauntlet's aiming dot).
     * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} a @param {number} [scale]
     */
    dot(ctx, x, y, a, scale = 1) {
      const halo = 9 * scale, core = 3 * scale;
      const hg = ctx.createRadialGradient(x, y, 0, x, y, halo);
      hg.addColorStop(0, `rgba(255, 255, 255, ${0.34 * a})`);
      hg.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = hg;
      ctx.fillRect(x - halo, y - halo, halo * 2, halo * 2);
      const cg = ctx.createRadialGradient(x, y, 0, x, y, core);
      cg.addColorStop(0, `rgba(255, 255, 255, ${a})`);
      cg.addColorStop(0.55, `rgba(250, 250, 255, ${0.95 * a})`);
      cg.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = cg;
      ctx.fillRect(x - core, y - core, core * 2, core * 2);
    },
    /** A click at the spark: ring and three embers. @param {number} x @param {number} y */
    click(x, y) {
      rings.push({ x, y, born: o.now() });
      for (let i = 0; i < MS.clickEmbers; i++) {
        const a = o.rng.range(0, Math.PI * 2), s = o.rng.range(60, 120);
        add(embers, x, y, Math.cos(a) * s, Math.sin(a) * s, o.rng.range(220, 360), 0.9, 3);
      }
      o.emit('spark:click', { x: Math.round(x), y: Math.round(y) });
    },
    /** Draw (an #fx painter; the layer composites with 'lighter'). @param {CanvasRenderingContext2D} ctx */
    paint(ctx) {
      const t = o.now();
      const a = st.alpha;
      if (a <= 0.001 && !embers.length && !rings.length && !shots.length && !flashes.length) return;
      // WP-16: the burst's muzzle flash and its streaking sparks
      for (const f of flashes) {
        const k = (t - f.born) / f.ms;
        if (k < 0 || k > 1) continue;
        const r = f.size * (0.6 + 0.8 * k);
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        g.addColorStop(0, `rgba(255, 240, 200, ${0.85 * (1 - k)})`);
        g.addColorStop(0.4, `rgba(255, 170, 70, ${0.45 * (1 - k)})`);
        g.addColorStop(1, 'rgba(255, 140, 40, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(f.x - r, f.y - r, 2 * r, 2 * r);
      }
      ctx.lineCap = 'round';
      for (const e of shots) {
        const age = t - e.born;
        if (age < 0) continue;
        const k = 1 - age / e.life;
        if (k <= 0) continue;
        const hot = Math.min(1, k * 1.4);
        ctx.strokeStyle = `rgba(255, ${Math.round(150 + 95 * hot)}, ${Math.round(70 + 120 * hot * hot)}, ${0.9 * Math.min(1, k * 1.8)})`;
        ctx.lineWidth = 1.3 * e.size * (0.5 + 0.5 * k);
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x - e.vx * e.streak, e.y - e.vy * e.streak); ctx.stroke();
        dot(ctx, e.x, e.y, 1.3 * e.size * (0.4 + 0.6 * k), `rgba(255, 246, 216, ${0.95 * k})`);
      }
      // trail
      for (const p of trail) {
        const k = 1 - (t - p.born) / p.life;
        if (k <= 0) continue;
        dot(ctx, p.x, p.y, 2.2 * k, `rgba(255, 179, 71, ${0.45 * k * a})`);
      }
      for (const e of embers) {
        const k = 1 - (t - e.born) / e.life;
        if (k <= 0) continue;
        dot(ctx, e.x, e.y, 1.6 * e.size * (0.4 + 0.6 * k), `rgba(255, ${Math.round(150 + 80 * k)}, ${Math.round(60 + 60 * k)}, ${0.95 * k})`);
      }
      for (const r of rings) {
        const k = (t - r.born) / MS.clickRingMs;
        const rad = MS.clickRingFromPx + (MS.clickRingToPx - MS.clickRingFromPx) * (1 - (1 - k) ** 3);
        ctx.strokeStyle = `rgba(255, 200, 120, ${0.9 * (1 - k)})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(0.1, rad), 0, Math.PI * 2); ctx.stroke();
      }
      if (a <= 0.001) return;
      const f = st.flicker;
      if (st.caret) {
        const w = MS.caretWidthPx, h = st.caretH;
        const g = ctx.createLinearGradient(st.x, st.y - h / 2, st.x, st.y + h / 2);
        g.addColorStop(0, `rgba(255, 179, 71, ${0.2 * a})`);
        g.addColorStop(0.5, `rgba(255, 246, 216, ${a * Math.min(1, f)})`);
        g.addColorStop(1, `rgba(255, 179, 71, ${0.2 * a})`);
        ctx.fillStyle = g;
        ctx.fillRect(st.x - w / 2, st.y - h / 2, w, h);
        dot(ctx, st.x, st.y, 5, `rgba(255, 179, 71, ${0.18 * a * f})`);
        return;
      }
      const core = 3 * (st.hover ? MS.hoverCoreMul : 1) * (0.92 + 0.08 * f);
      const halo = 9 * (st.hover ? MS.hoverHaloMul : 1) * f;
      const hg = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, halo);
      hg.addColorStop(0, `rgba(255, 179, 71, ${0.42 * a * f})`);
      hg.addColorStop(1, 'rgba(255, 179, 71, 0)');
      ctx.fillStyle = hg;
      ctx.fillRect(st.x - halo, st.y - halo, halo * 2, halo * 2);
      const cg = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, core);
      cg.addColorStop(0, `rgba(255, 246, 216, ${a})`);
      cg.addColorStop(0.55, `rgba(255, 179, 71, ${a})`);
      cg.addColorStop(1, 'rgba(255, 179, 71, 0)');
      ctx.fillStyle = cg;
      ctx.fillRect(st.x - core, st.y - core, core * 2, core * 2);
    },
    /** Test/debug view. */
    read: () => ({ x: st.x, y: st.y, alpha: +st.alpha.toFixed(3), hover: st.hover, caret: st.caret, trail: trail.length, embers: embers.map(e => ({ vx: +e.vx.toFixed(1), vy: +e.vy.toFixed(1), age: Math.round(o.now() - e.born) })), rings: rings.length,
      shots: shots.map(e => ({ x: Math.round(e.x), y: Math.round(e.y), speed: Math.round(Math.hypot(e.vx, e.vy)), age: Math.round(o.now() - e.born) })) }),
  };
}

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} r @param {string} c */
function dot(ctx, x, y, r, c) {
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(x, y, Math.max(0.2, r), 0, Math.PI * 2); ctx.fill();
}
