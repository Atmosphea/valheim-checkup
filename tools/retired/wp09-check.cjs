// Builder self-check for WP-09 (not a checker test). Run after the build:
//   npm run build:single && node tools/wp09-check.cjs [zone|handover|lag|click|pinch|embers|stretch|text|touch|all]
// Real GPU (Metal). No save loaded; nothing private is read or printed.
const path = require('node:path');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const ROOT = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const { open, proj, check, results, ARGS } = require('../wp08-check.cjs');
const MODE = process.argv[2] || 'all';
const want = m => MODE === 'all' || MODE === m;
const st = page => page.evaluate(() => __vc.cursor.state());
// record per frame: clock time, mode, cap, flight, spark xy
const record = page => page.evaluate(() => {
  window.__rec = [];
  const loop = () => { const s = __vc.cursor.state(); __rec.push({ t: __vc.clock.now(), w: performance.now(), mode: s.mode, cap: s.cap, flight: s.flight, sx: s.spark.x, sy: s.spark.y }); if (__rec.length < 4000) requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
const evts = (page, since = 0) => page.evaluate(s => __vc.events.filter(e => e.wall >= s).map(e => ({ type: e.type, t: e.t, wall: e.wall, data: e.data })), since);
const wallNow = page => page.evaluate(() => performance.now());
// board-top point (cm) → client px
const top = (page, x, y) => proj(page, x, y, 3);

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    const { page, errors } = await open(browser);
    await page.mouse.move(700, 450);
    await page.waitForTimeout(600);

    if (want('zone')) {
      // walk across the right border (zone x1 = −15) in 0.05 cm steps, out and back; the plane is
      // re-projected every step because the camera drifts with the pointer
      const flips = [];
      const xs = [];
      for (let x = -16.5; x <= -13.5; x += 0.05) xs.push(+x.toFixed(2));
      { const p = await top(page, xs[0], 0); await page.mouse.move(p.x, p.y); await page.waitForTimeout(300); }
      let last = (await st(page)).mode;
      for (const x of [...xs, ...xs.slice().reverse()]) {
        const p = await top(page, x, 0);
        await page.mouse.move(p.x, p.y);
        await page.waitForTimeout(20);
        const m = (await st(page)).mode;
        if (m !== last) { flips.push({ x, m }); last = m; }
      }
      check('zone: one switch each way across the border', flips.length === 2, JSON.stringify(flips));
      const out = flips.find(f => f.m === 'spark'), back = flips.find(f => f.m === 'gauntlet');
      check('zone: switches at border ± 0.3 cm (1 cm grow, 0.6 cm hysteresis)', out && back && Math.abs(out.x - -14.7) <= 0.1 && Math.abs(back.x - -15.3) <= 0.1, `out at ${out?.x}, back at ${back?.x}`);
      // sit on the border, jitter ±0.2 cm for 1 s: no flicker
      const n0 = await page.evaluate(() => __vc.cursor.switches.length);
      for (let i = 0; i < 40; i++) { const p = await top(page, -15 + (i % 2 ? 0.2 : -0.2), 0); await page.mouse.move(p.x, p.y); await page.waitForTimeout(25); }
      const n1 = await page.evaluate(() => __vc.cursor.switches.length);
      check('zone: no flicker while sitting on the border', n1 - n0 <= 1, `${n1 - n0} switches`);
      const css = await page.evaluate(() => getComputedStyle(document.querySelector('#print') || document.body).cursor);
      check('#desk hides the native cursor', css === 'none', css);
    }

    if (want('handover')) {
      const inP = await top(page, -25, 0), outP = await top(page, 0, 0);
      await page.mouse.move(inP.x, inP.y); await page.waitForTimeout(800);
      await record(page);
      const w0 = await wallNow(page);
      await page.mouse.move(outP.x, outP.y);
      await page.waitForTimeout(700);
      await page.mouse.move(inP.x, inP.y);
      await page.waitForTimeout(700);
      const rec = await page.evaluate(() => __rec.slice());
      const ev = await evts(page, w0);
      const sw = await page.evaluate(() => __vc.cursor.switches.slice(-2));
      const tOut = sw[0].t, tIn = sw[1].t;
      const at = (type, after) => { const e = ev.find(x => x.type === type && x.t >= after); return e ? e.t : NaN; };
      const firstRec = (pred, after) => { const r = rec.find(x => x.t >= after && pred(x)); return r ? r.t : NaN; };
      const T = {
        'leave: visor:open ≈ 0': [at('visor:open', tOut) - tOut, 0],
        'leave: cap fully open ≈ 180': [firstRec(r => r.cap >= 1, tOut) - tOut, 180],
        'leave: spark:out ≈ 120': [at('spark:out', tOut) - tOut, 120],
        'leave: spark is the pointer ≈ 280': [firstRec(r => r.flight >= 1, tOut) - tOut, 280],
        'return: spark:in ≈ 140': [at('spark:in', tIn) - tIn, 140],
        'return: visor:close ≈ 140': [at('visor:close', tIn) - tIn, 140],
        'return: cap closed ≈ 280': [firstRec(r => r.cap <= 0, tIn) - tIn, 280],
      };
      for (const [name, [got, exp]] of Object.entries(T)) {
        const tol = Math.max(exp * 0.15, 20); // one 60 Hz frame of slack at 0 ms
        check(`handover ${name} ms`, Math.abs(got - exp) <= tol, `${got.toFixed(0)} ms`);
      }
      const after = rec.filter(r => r.t > tOut + 300 && r.t < tIn);
      check('after the flight the spark is on the pointer (≤ 0.5 px)', after.length > 3 && after.every(r => Math.hypot(r.sx - outP.x, r.sy - outP.y) <= 0.5), `max ${Math.max(...after.map(r => Math.hypot(r.sx - outP.x, r.sy - outP.y))).toFixed(2)} px`);
      // reversal mid-handover: out, back after 100 ms, out again after 90 ms
      await record(page);
      await page.mouse.move(outP.x, outP.y); await page.waitForTimeout(100);
      await page.mouse.move(inP.x, inP.y); await page.waitForTimeout(90);
      await page.mouse.move(outP.x, outP.y); await page.waitForTimeout(600);
      const r2 = await page.evaluate(() => __rec.slice());
      // rAF samples are not exactly one per stage frame, so compare each step with what the fastest
      // rate (1/140 ms) allows over one ~20 ms frame
      let worst = 0;
      for (let i = 1; i < r2.length; i++) worst = Math.max(worst, Math.abs(r2[i].cap - r2[i - 1].cap), Math.abs(r2[i].flight - r2[i - 1].flight));
      const dirs = r2.map(r => r.mode).filter((m, i, a) => i && m !== a[i - 1]).length;
      check('reversal mid-handover never jumps (largest step per frame ≤ 0.15)', worst <= 0.15 && dirs >= 2, `largest step ${worst.toFixed(3)}, ${dirs} reversals`);
      await page.mouse.move(inP.x, inP.y); await page.waitForTimeout(500);
    }

    if (want('lag')) {
      const a = await top(page, -40, -15), b = await top(page, -19, 12);
      await page.mouse.move(a.x, a.y); await page.waitForTimeout(600);
      await page.evaluate(() => __vc.cursor.resetMaxLag());
      for (let k = 0; k < 3; k++) {
        await page.mouse.move(b.x, b.y, { steps: 4 }); await page.waitForTimeout(16);
        await page.mouse.move(a.x, a.y, { steps: 4 }); await page.waitForTimeout(16);
      }
      await page.waitForTimeout(300);
      const s = await st(page);
      check('fast flick: fingertip lag ≤ 1.2 cm', s.maxLag <= 1.2 + 1e-3, `max ${s.maxLag} cm`);
    }

    if (want('click')) {
      const btn = page.locator('#print button', { hasText: 'Details' }).first();
      const box = await btn.boundingBox();
      await page.evaluate(() => { window.__clicked = 0; const b = [...document.querySelectorAll('#print button')].find(x => /Details/.test(x.textContent)); b.addEventListener('click', () => window.__clicked++, { once: true }); });
      const a = await top(page, -30, 0);
      await page.mouse.move(a.x, a.y); await page.waitForTimeout(300);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
      await page.mouse.down(); await page.mouse.up();
      const n = await page.evaluate(() => window.__clicked);
      check('fast move then click: the Details button gets the click', n === 1, `clicks ${n}; button ${Math.round(box.width)}×${Math.round(box.height)} px`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    }

    if (want('pinch')) {
      const cat = 'The Gourmet';
      // the camera drifts with the pointer: aim, settle, aim again
      for (let i = 0; i < 3; i++) { const k = await page.evaluate(c => __vc.board.knob(c), cat); await page.mouse.move(k.x, k.y, { steps: 4 }); await page.waitForTimeout(400); }
      check('pose over a knob: pinchReady', (await st(page)).pose === 'pinchReady', (await st(page)).pose);
      await page.mouse.down();
      let worst = 0, n = 0;
      for (let i = 1; i <= 30; i++) {
        const f = 0.5 * Math.min(1, i / 24);
        const p = await page.evaluate(([c, f]) => { const r = __vc.board.rows.find(x => x.category === c); return __vc.board.slotPoint(c, r.barRestX0 + 12 + 0.65 - f * 7); }, [cat, f]);
        await page.mouse.move(p.x, p.y); await page.waitForTimeout(16);
        const s = await page.evaluate(() => { const s = __vc.cursor.state(); return { s, k: s.held >= 0 ? __vc.board.knobWorld(s.held) : null }; });
        if (s.s.holdBlend >= 1 && s.k) { n++; worst = Math.max(worst, Math.hypot(s.s.pinch[0] - s.k.x, s.s.pinch[1] - s.k.y, s.s.pinch[2] - s.k.z)); }
      }
      check('drag: pinchPoint within 0.2 cm of the knob centre', n > 10 && worst <= 0.2, `${n} samples, worst ${worst.toFixed(3)} cm`);
      await page.mouse.up(); await page.waitForTimeout(800);
    }

    if (want('embers')) {
      const a = await proj(page, 0, -5), b = await proj(page, 30, -5);
      await page.mouse.move(a.x, a.y); await page.waitForTimeout(500);
      const w0 = await wallNow(page);
      for (let i = 1; i <= 10; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / 10, a.y); await page.waitForTimeout(12); }
      await page.waitForTimeout(250);
      const ev = (await evts(page, w0)).filter(e => e.type === 'spark:embers');
      const e = ev[0]?.data;
      check('sudden stop: 4–8 embers in the travel direction (→)', e && e.count >= 4 && e.count <= 8 && Math.abs(e.angle) <= 20, JSON.stringify(e));
    }

    if (want('stretch')) {
      const a = await top(page, -30, -2);
      await page.mouse.move(a.x, a.y); await page.waitForTimeout(300);
      await page.evaluate(() => __vc.timeScale(20));
      const t0 = await page.evaluate(() => __vc.clock.now());
      await page.waitForTimeout(9000);
      const t1 = await page.evaluate(() => __vc.clock.now());
      await page.evaluate(() => __vc.timeScale(1));
      const ev = (await page.evaluate(() => __vc.events.filter(e => e.type === 'gauntlet:stretch').map(e => e.t))).filter(t => t >= t0 && t <= t1);
      const gaps = ev.slice(1).map((t, i) => t - ev[i]);
      check('stretch every 25–40 s while idle (timeScale 20)', ev.length >= 3 && gaps.every(g => g >= 25000 * 0.97 && g <= 40000 * 1.05), `${ev.length} over ${((t1 - t0) / 1000).toFixed(0)} s; gaps ${gaps.map(g => (g / 1000).toFixed(1)).join(', ')} s`);
    }

    if (want('text')) {
      const search = page.locator('#print input[type="search"]').first();
      const box = await search.boundingBox();
      await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 4 }); await page.waitForTimeout(200);
      const s = await st(page);
      check('caret mode over the search field', s.spark.caret === true && s.mode === 'spark');
      await page.mouse.click(box.x + 20, box.y + box.height / 2);
      await page.keyboard.type('bread');
      const v = await search.inputValue();
      check('typing works in the search field', v === 'bread', v);
      await search.fill(''); await search.dispatchEvent('input');
      const d = page.locator('#print p').filter({ hasText: 'Cook every kind of dish' }).first();
      const db = await d.boundingBox();
      await page.mouse.dblclick(db.x + 12, db.y + db.height / 2);
      const sel = await page.evaluate(() => String(getSelection()).trim());
      check('text selection works (double-click a word)', sel.length > 0, JSON.stringify(sel));
      await page.evaluate(() => getSelection().removeAllRanges());
    }

    if (want('tour')) {
      const a = await proj(page, 10, -5);
      await page.mouse.move(a.x, a.y, { steps: 4 }); await page.waitForTimeout(500);
      await page.evaluate(() => __vc.tour.start());
      await page.waitForTimeout(600);
      await page.mouse.move(a.x + 30, a.y + 10, { steps: 4 }); await page.waitForTimeout(300);
      const t = await page.evaluate(() => {
        const top = document.querySelector('.vc-spark-top'), cs = top && getComputedStyle(top);
        const px = top ? top.getContext('2d').getImageData(0, 0, top.width, top.height).data : [];
        let lit = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) lit++;
        return { running: __vc.tour.isRunning(), z: cs && +cs.zIndex, hidden: top?.hidden, lit, alpha: __vc.cursor.state().spark.alpha, cursor: getComputedStyle(document.querySelector('.vc-tour')).cursor };
      });
      check('tour: the spark stays visible above the capture layer', t.running && !t.hidden && t.z > 1000 && t.lit > 0 && t.alpha > 0.5, JSON.stringify(t));
      const step0 = await page.evaluate(() => __vc.tour.step());
      await page.mouse.click(a.x + 30, a.y + 10); await page.waitForTimeout(400);
      const step1 = await page.evaluate(() => __vc.tour.step());
      check('tour: the capture layer still takes the click (advances the tour)', step1 !== step0, `${step0} → ${step1}`);
      await page.evaluate(() => __vc.tour.end()); await page.waitForTimeout(300);
    }

    if (want('switch')) {
      const sw = await page.evaluate(() => { const l = document.querySelector('details.help label.vc-pointer-switch'); return { text: l?.textContent.trim(), ps: document.querySelectorAll('details.help > p').length }; });
      await page.evaluate(() => document.querySelector('#vcShowPointer').click());
      const on = await page.evaluate(() => ({ cls: document.body.classList.contains('vc-show-pointer'), cur: getComputedStyle(document.querySelector('#print')).cursor }));
      await page.reload();
      await page.waitForFunction(() => window.__vc?.cursor, null, { timeout: 60000 });
      const kept = await page.evaluate(() => ({ cls: document.body.classList.contains('vc-show-pointer'), box: document.querySelector('#vcShowPointer').checked }));
      await page.evaluate(() => document.querySelector('#vcShowPointer').click());
      check('Help switch "Also show the normal pointer": shows the pointer, remembered after a reload; help still has 7 paragraphs', sw.text === 'Also show the normal pointer' && sw.ps === 7 && on.cls && on.cur !== 'none' && kept.cls && kept.box, JSON.stringify({ sw, on, kept }));
    }

    check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.context().close();

    if (want('touch')) {
      const { page: tp, errors: te } = await open(browser, { touch: true });
      const cdp = await tp.context().newCDPSession(tp);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      const views = await tp.evaluate(() => __vc.board.rows.map(r => r.category));
      const ok = [];
      let worstPinch = 0;
      for (const cat of views) {
        const k = await tp.evaluate(c => __vc.board.knob(c), cat);
        await touch('touchStart', k.x, k.y);
        for (let i = 1; i <= 28; i++) {
          const f = Math.min(1, i / 22) * 1.0;
          const p = await tp.evaluate(([c, f]) => { const r = __vc.board.rows.find(x => x.category === c); return __vc.board.slotPoint(c, r.barRestX0 + 12 + 0.65 - f * 7); }, [cat, f]);
          await touch('touchMove', p.x, p.y);
          await tp.waitForTimeout(16);
          if (i === 26) { const s = await tp.evaluate(() => { const s = __vc.cursor.state(); return { s, k: s.held >= 0 ? __vc.board.knobWorld(s.held) : null }; }); if (s.k && s.s.holdBlend >= 1) worstPinch = Math.max(worstPinch, Math.hypot(s.s.pinch[0] - s.k.x, s.s.pinch[1] - s.k.y)); else worstPinch = Infinity; }
        }
        await touch('touchEnd');
        await tp.waitForTimeout(700);
        const v = await tp.evaluate(() => __vc.state().view);
        if (v === cat) ok.push(cat);
      }
      check('touch: dragging a knob selects every view', ok.length === views.length, `${ok.length}/${views.length}`);
      check('touch: the gauntlet glides in and pinches the dragged knob', worstPinch <= 0.25, `worst ${worstPinch.toFixed(3)} cm`);
      const s = await tp.evaluate(() => __vc.cursor.state());
      check('touch: no spark', s.spark.alpha === 0 && s.touch === true);
      check('touch: no console errors', te.length === 0, te.slice(0, 3).join(' | '));
    }
  } finally { await browser.close(); }
  const bad = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} passed`);
  process.exitCode = bad ? 1 : 0;
})();
