// wp04.spec.js — WP-04 scene foundation: acceptance items, timings, visual screens and break attempts.
// Runs on TARGET=desk only (the stage exists only in desk mode). SwiftShader renders ~0.4 s per frame
// at 1440×900, so tests that need many frames use a small forced-desk window (DECISIONS point 14)
// and generous timeouts. Every screenshot uses ?seed=7 and no save (or the synthetic fixture save).
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, expect } = require('@playwright/test');
const A = require('../helpers/app');
const fch = require('../helpers/fch');
const { ROOT, targetUrl } = require('../helpers/target');
const sharp = require(path.join(ROOT, 'node_modules', 'sharp'));

test.skip(A.TARGET !== 'desk', 'WP-04 stage exists only on desk');
test.describe.configure({ mode: 'serial' });

const SHOTS = path.join(ROOT, 'checker-reports', 'screens', 'wp-04');
fs.mkdirSync(SHOTS, { recursive: true });
const DIST = pathToFileURL(path.join(ROOT, 'dist', 'valheim-checkup.html')).href;
const GL_ALLOWED = /GPU stall due to ReadPixels/;

/** Open forced desk and wait for the stage. Collects console errors/warnings and page errors. */
// Playwright's clock (setFixedTime) also fakes performance.now and rAF, which skews frame timing, so the
// fixed date is opt-in (screens only); timing, tier, heap and throttle tests run on the real clock.
async function openDesk(page, query = '?seed=7', { url, fixedClock = false } = {}) {
  const log = { errors: [], warnings: [], pageErrors: [] };
  page.on('console', m => {
    if (m.type() === 'error') log.errors.push(m.text());
    if (m.type() === 'warning' && !GL_ALLOWED.test(m.text())) log.warnings.push(m.text());
  });
  page.on('pageerror', e => log.pageErrors.push(String(e)));
  if (fixedClock) await page.clock.setFixedTime(A.FIXED_NOW);
  await page.goto(url || targetUrl(query));
  await expect.poll(() => page.evaluate(() => !!(window.__vc && window.__vc.stage)), { timeout: 60_000 }).toBe(true);
  return log;
}
const frames = page => page.evaluate(() => window.__vc.stage.stats().frames);
async function waitFrames(page, n, timeout = 240_000) {
  const f0 = await frames(page);
  await expect.poll(() => frames(page), { timeout, intervals: [200] }).toBeGreaterThanOrEqual(f0 + n);
}
/** WP-15: since WP-05 the desk fades up from exposure 0.06 over ~800 ms once its textures are made; pixel
 *  comparisons taken during that fade see a near-black desk, so they wait for the fade to finish first. */
const faded = page => page.waitForFunction(() => !!window.__vc.stage.textures.warmup()?.done, null, { timeout: 60_000 });
/** Freeze grain (hidden) so pixel comparisons are deterministic. */
const hideGrain = page => page.evaluate(() => { document.getElementById('grain').style.visibility = 'hidden'; });
async function shot(page, name, clip) {
  const buf = await page.screenshot({ clip, animations: 'disabled' });
  if (name) fs.writeFileSync(path.join(SHOTS, name), buf);
  return buf;
}
async function raw(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
async function crop200(buf, name) {
  const m = await sharp(buf).metadata();
  await sharp(buf).resize(m.width * 2, m.height * 2, { kernel: 'nearest' }).toFile(path.join(SHOTS, name));
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
test.describe('WP-04 acceptance', () => {
  test.setTimeout(600_000);

  test('1 · layer order, blend modes, pointer settings (DOM inspection, own computed styles)', async ({ page }) => {
    const log = await openDesk(page);
    const r = await page.evaluate(() => {
      const desk = document.getElementById('desk');
      const kids = [...desk.children].map(el => {
        const cs = getComputedStyle(el);
        const b = el.getBoundingClientRect();
        return { id: el.id, tag: el.tagName.toLowerCase(), blend: cs.mixBlendMode, pe: cs.pointerEvents,
          iso: cs.isolation, op: cs.opacity, filter: cs.filter, rect: [b.left, b.top, b.width, b.height] };
      });
      // Nothing between <html> and #desk (inclusive) may break blending either.
      const chain = [];
      for (let el = desk; el; el = el.parentElement) {
        const cs = getComputedStyle(el);
        chain.push({ tag: el.tagName.toLowerCase(), id: el.id, iso: cs.isolation, op: cs.opacity, filter: cs.filter, mix: cs.mixBlendMode });
      }
      // Functional pointer checks: a child of #print and a child of #float receive hits through the layers above.
      const t = window.__vc.stage.test.printDiv({ text: 'Pointer probe' });
      window.__vc.stage.renderNow();
      const probe = document.querySelector('[data-test="print"]').getBoundingClientRect();
      const hitPrint = document.elementFromPoint(probe.left + probe.width / 2, probe.top + probe.height / 2);
      const f = document.createElement('button'); f.textContent = 'float probe';
      f.style.cssText = 'position:absolute;left:100px;top:100px;width:80px;height:30px';
      document.getElementById('float').append(f);
      const hitFloat = document.elementFromPoint(140, 115);
      const hitEmpty = document.elementFromPoint(700, 450);
      f.remove(); window.__vc.stage.test.clear();
      return { kids, chain, hitPrint: hitPrint && (hitPrint.closest('[data-test="print"]') ? 'print-probe' : hitPrint.id || hitPrint.tagName),
        hitFloat: hitFloat === f ? 'float-probe' : (hitFloat && (hitFloat.id || hitFloat.tagName)),
        hitEmpty: hitEmpty && (hitEmpty.id || hitEmpty.tagName), cursor: getComputedStyle(document.getElementById('print')).cursor,
        vw: innerWidth, vh: innerHeight, t };
    });
    fs.writeFileSync(path.join(SHOTS, 'layers.json'), JSON.stringify(r, null, 1));
    expect(r.kids.map(k => `${k.tag}#${k.id}`)).toEqual(['canvas#scene', 'div#print', 'canvas#veil', 'canvas#glow', 'div#float', 'canvas#fx', 'div#grain']);
    expect(r.kids.map(k => k.blend)).toEqual(['normal', 'normal', 'multiply', 'screen', 'normal', 'normal', 'overlay']);
    expect(r.kids.map(k => k.pe)).toEqual(['none', 'auto', 'none', 'none', 'none', 'none', 'none']);
    for (const k of r.kids) {
      expect(k.iso, k.id).toBe('auto'); expect(k.op, k.id).toBe('1'); expect(k.filter, k.id).toBe('none');
      expect(k.rect, k.id).toEqual([0, 0, r.vw, r.vh]);
    }
    for (const c of r.chain) { expect(c.op, c.tag + c.id).toBe('1'); expect(c.filter, c.tag + c.id).toBe('none'); }
    expect(r.chain.slice(1).every(c => c.iso === 'auto')).toBe(true);
    expect(r.hitPrint).toBe('print-probe');   // layer 2 takes the pointer through layers 3–7
    expect(r.hitFloat).toBe('float-probe');   // layer 5 content takes the pointer
    expect(r.cursor).toBe('none');            // WP-15: since WP-09 the gauntlet and spark are the pointer (native one hidden unless "Also show the normal pointer" is on)
    expect(log.errors).toEqual([]); expect(log.pageErrors).toEqual([]);
  });

  test('2 · printed test div stays within 1 px of its paper position (DOM math + rendered pixel markers)', async ({ page }) => {
    const log = await openDesk(page);
    await page.evaluate(() => window.__vc.quality('high'));
    await faded(page);
    await hideGrain(page);
    const rect = await page.evaluate(() => window.__vc.stage.test.printDiv());
    const states = [{ x: 0, y: 0, zoom: 1 }, { x: 1.6, y: 1.0, zoom: 1 }, { x: 0, y: 0, zoom: 1.025 }, { x: 1.6, y: 1.0, zoom: 1.025 }, { x: -1.6, y: -1.0, zoom: 1.025 }];
    const results = [];
    for (const s of states) {
      // (a) DOM marker positions vs my own projection of the paper corners (z = inset sheet surface, not the print lift).
      const dom = await page.evaluate(({ s, rect }) => {
        const st = window.__vc.stage; st.camera.set(s);
        const { THREE, camera } = st.three;
        camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        const want = { tl: [rect.x0, rect.y0 + rect.h], tr: [rect.x0 + rect.w, rect.y0 + rect.h], bl: [rect.x0, rect.y0], br: [rect.x0 + rect.w, rect.y0] };
        const out = {};
        for (const m of document.querySelectorAll('[data-test="print"] i[data-c]')) {
          const c = m.dataset.c, v = new THREE.Vector3(want[c][0], want[c][1], rect.z);
          v.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
          const px = (v.x + 1) / 2 * innerWidth, py = (1 - v.y) / 2 * innerHeight;
          const b = m.getBoundingClientRect();
          out[c] = { dom: [b.left, b.top], proj: [px, py], d: Math.hypot(b.left - px, b.top - py) };
        }
        return out;
      }, { s, rect });
      // (b) Pixel evidence: draw small spheres in the WebGL scene at the same paper corners and find them on screen.
      const before = await raw(await shot(page, null));
      await page.evaluate(({ rect }) => {
        const { THREE, scene } = window.__vc.stage.three;
        const g = new THREE.Group(); g.name = 'checker-markers';
        for (const [x, y] of [[rect.x0, rect.y0 + rect.h], [rect.x0 + rect.w, rect.y0 + rect.h], [rect.x0, rect.y0], [rect.x0 + rect.w, rect.y0]]) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
          m.position.set(x, y, rect.z); g.add(m);
        }
        scene.add(g); window.__vc.stage.renderNow();
      }, { rect });
      const after = await raw(await shot(page, null));
      await page.evaluate(() => { const { scene } = window.__vc.stage.three; scene.remove(scene.getObjectByName('checker-markers')); window.__vc.stage.renderNow(); });
      const pix = {};
      for (const [c, v] of Object.entries(dom)) {
        let sx = 0, sy = 0, n = 0;
        const [cx, cy] = v.dom.map(Math.round);
        for (let y = cy - 25; y <= cy + 25; y++) for (let x = cx - 25; x <= cx + 25; x++) {
          const i = (y * after.w + x) * 3;
          const diff = Math.abs(after.data[i] - before.data[i]) + Math.abs(after.data[i + 1] - before.data[i + 1]) + Math.abs(after.data[i + 2] - before.data[i + 2]);
          if (diff > 60) { sx += x + 0.5; sy += y + 0.5; n++; }
        }
        pix[c] = n ? { centroid: [sx / n, sy / n], n, d: Math.hypot(sx / n - v.dom[0], sy / n - v.dom[1]) } : { n: 0, d: Infinity };
      }
      results.push({ s, domMax: Math.max(...Object.values(dom).map(v => v.d)), pixMax: Math.max(...Object.values(pix).map(v => v.d)), dom, pix });
    }
    // 200% crop of the printed text at zoom 1.025 (sharpness of layer 2).
    await page.evaluate(() => window.__vc.stage.camera.set({ x: 0, y: 0, zoom: 1.025 }));
    const box = await page.locator('[data-test="print"]').boundingBox();
    const crop = await shot(page, 'print-text-zoom1025.png', { x: Math.floor(box.x) - 10, y: Math.floor(box.y) - 10, width: Math.ceil(box.width) + 20, height: Math.ceil(box.height) + 20 });
    await crop200(crop, 'print-text-zoom1025-200pct.png');
    fs.writeFileSync(path.join(SHOTS, 'alignment.json'), JSON.stringify(results, null, 1));
    for (const r of results) {
      expect(r.domMax, JSON.stringify(r.s)).toBeLessThanOrEqual(1);
      // Rendered sphere centroid (WebGL) vs DOM marker (CSS3D): rasterisation of a ~4 px dot is ±0.5 px.
      expect(r.pixMax, JSON.stringify(r.s)).toBeLessThanOrEqual(1);
    }
    expect(log.errors).toEqual([]); expect(log.pageErrors).toEqual([]);
  });

  test('3 · veil test shadow darkens paper and text; glow test brightens both', async ({ page }) => {
    const log = await openDesk(page);
    await page.evaluate(() => window.__vc.quality('high'));
    await faded(page);
    await hideGrain(page);
    const rect = await page.evaluate(() => {
      const st = window.__vc.stage; st.camera.set({ x: 0, y: 0, zoom: 1 });
      const r = st.test.printDiv({ text: 'SHADOW AND GLOW TEST TEXT' });
      document.querySelector('[data-test="print"]').style.fontSize = '60px';
      st.renderNow(); return r;
    });
    const box = await page.locator('[data-test="print"]').boundingBox();
    const clip = { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.ceil(box.width), height: Math.ceil(box.height) };
    const cx = rect.x0 + rect.w / 2, cy = rect.y0 + rect.h / 2;
    const b0 = await shot(page, 'veil-before.png', clip);
    await page.evaluate(({ cx, cy }) => window.__vc.stage.test.shadow({ x: cx, y: cy, r: 5 }), { cx, cy });
    const b1 = await shot(page, 'veil-shadow.png', clip);
    await shot(page, 'veil-shadow-context.png', { x: clip.x - 150, y: clip.y - 120, width: clip.width + 300, height: clip.height + 240 });
    await page.evaluate(() => window.__vc.stage.test.clear());
    await page.evaluate(() => { const st = window.__vc.stage; st.test.printDiv({ text: 'SHADOW AND GLOW TEST TEXT' }); document.querySelector('[data-test="print"]').style.fontSize = '60px'; st.renderNow(); });
    await page.evaluate(({ cx, cy }) => window.__vc.stage.test.glow({ x: cx, y: cy, r: 5, strength: 0.6 }), { cx, cy });
    const b2 = await shot(page, 'glow-test.png', clip);
    const [i0, i1, i2] = await Promise.all([raw(b0), raw(b1), raw(b2)]);
    // Classify on the before image, central 40% of the width (inside the shadow/glow core).
    const ink = [], paper = [];
    const x0 = Math.floor(i0.w * 0.3), x1 = Math.floor(i0.w * 0.7);
    for (let y = 0; y < i0.h; y++) for (let x = x0; x < x1; x++) {
      const i = (y * i0.w + x) * 3, L = lum(i0.data, i);
      if (L < 90) ink.push(i); else if (L > 150) paper.push(i);
    }
    const mean = (img, set) => set.reduce((s, i) => s + lum(img.data, i), 0) / set.length;
    const m = { inkN: ink.length, paperN: paper.length,
      before: { ink: mean(i0, ink), paper: mean(i0, paper) }, shadow: { ink: mean(i1, ink), paper: mean(i1, paper) }, glow: { ink: mean(i2, ink), paper: mean(i2, paper) } };
    fs.writeFileSync(path.join(SHOTS, 'veil-glow.json'), JSON.stringify(m, null, 1));
    expect(m.inkN).toBeGreaterThan(200); expect(m.paperN).toBeGreaterThan(200);
    expect(m.shadow.paper).toBeLessThan(m.before.paper * 0.9);
    expect(m.shadow.ink).toBeLessThan(m.before.ink * 0.9);
    // Multiply: the ink darkens by about the same factor as the paper.
    expect(Math.abs(m.shadow.ink / m.before.ink - m.shadow.paper / m.before.paper)).toBeLessThan(0.12);
    expect(m.glow.paper).toBeGreaterThan(m.before.paper + 8);
    expect(m.glow.ink).toBeGreaterThan(m.before.ink + 8);
    expect(log.errors).toEqual([]); expect(log.pageErrors).toEqual([]);
  });

  test('4 · flat/desk switch (no ?mode): WebGL2, reduced motion, coarse pointer, window size', async ({ browser }) => {
    const noGL2 = () => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, ...a) { return t === 'webgl2' ? null : orig.call(this, t, ...a); };
    };
    const cases = [
      { name: '1440x900 default', ctx: { viewport: { width: 1440, height: 900 } }, want: 'desk' },
      { name: 'no WebGL2', ctx: { viewport: { width: 1440, height: 900 } }, init: noGL2, want: 'flat' },
      { name: 'no WebGL2 + ?mode=desk', ctx: { viewport: { width: 1440, height: 900 } }, init: noGL2, q: '?mode=desk', want: 'flat' },
      { name: 'reduced motion', ctx: { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }, want: 'flat' },
      { name: 'reduced motion + help switch', ctx: { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }, init: () => localStorage.setItem('valheim-checkup-3d:force-desk', '1'), want: 'desk' },
      { name: 'coarse pointer (touch)', ctx: { viewport: { width: 1440, height: 900 }, hasTouch: true, isMobile: true }, want: 'flat' },
      { name: '900x800', ctx: { viewport: { width: 900, height: 800 } }, want: 'flat' },
      { name: '1024x640 (edge)', ctx: { viewport: { width: 1024, height: 640 } }, want: 'desk' },
      { name: '1023x640', ctx: { viewport: { width: 1023, height: 640 } }, want: 'flat' },
      { name: '1024x639', ctx: { viewport: { width: 1024, height: 639 } }, want: 'flat' },
      { name: 'storage throws', ctx: { viewport: { width: 1440, height: 900 } }, init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); }, want: 'desk' },
    ];
    const rows = [];
    for (const c of cases) {
      const ctx = await browser.newContext({ ...c.ctx, locale: 'en-US', timezoneId: 'UTC' });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
      if (c.init) await page.addInitScript(c.init);
      await page.goto(DIST + (c.q || ''));
      await expect(page.locator('#categories [data-category]').first()).toBeAttached({ timeout: 60_000 });
      if (c.want === 'desk') await expect.poll(() => page.evaluate(() => !!window.__vc.stage), { timeout: 60_000 }).toBe(true);
      const r = await page.evaluate(() => ({ run: window.__vc.state().runMode, body: document.body.className, desk: !!document.getElementById('desk'),
        coarse: matchMedia('(pointer: coarse)').matches, fine: matchMedia('(pointer: fine)').matches }));
      rows.push({ case: c.name, want: c.want, ...r, errs: errs.length });
      await ctx.close();
    }
    fs.writeFileSync(path.join(SHOTS, 'mode-switch.json'), JSON.stringify(rows, null, 1));
    for (const r of rows) {
      expect(r.run, r.case).toBe(r.want);
      expect(r.body, r.case).toContain('mode-' + r.want);
      expect(r.desk, r.case).toBe(r.want === 'desk');
      expect(r.errs, r.case).toBe(0);
    }
  });

  test('5 · tiers: benchmark picks, forced slow frames drop exactly one tier after 2 s, never climb', async ({ browser }) => {
    // Small forced-desk window (fast frames on SwiftShader), DPR 2 so the pixel-ratio cap per tier is visible.
    const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2, locale: 'en-US', timezoneId: 'UTC' });
    const page = await ctx.newPage();
    // Force 10 ms frames as soon as the stage exists, so the whole benchmark sees 10 ms.
    await page.addInitScript(() => {
      const iv = setInterval(() => { if (window.__vc && window.__vc.stage) { window.__vc.stage.forceFrameMs(10); window.__phaseAtForce = window.__vc.stage.stats().governor.phase; clearInterval(iv); } }, 1);
    });
    const log = await openDesk(page);
    await expect.poll(() => page.evaluate(() => window.__vc.stage.stats().governor.phase), { timeout: 300_000, intervals: [500] }).toBe('watch');
    const bench = await page.evaluate(() => ({ phaseAtForce: window.__phaseAtForce, log: JSON.parse(JSON.stringify(window.__vc.stage.qualityLog)), s: window.__vc.stage.stats(), q: window.__vc.state().quality }));
    expect(bench.phaseAtForce).toBe('warmup');
    expect(bench.log).toEqual([expect.objectContaining({ tier: 'high', why: 'benchmark' })]);
    expect(bench.s.governor.benchmarkMs).toBe(10);
    expect(bench.q).toBe('high');
    const tierHigh = bench.s;
    // Drop: 30 ms frames. Count frames until the drop: 2000 / 30 → 67 frames.
    const f0 = await page.evaluate(() => { const st = window.__vc.stage; st.forceFrameMs(30); st.__f0 = st.stats().frames; return st.__f0; });
    await expect.poll(() => page.evaluate(() => window.__vc.stage.qualityLog.length), { timeout: 300_000, intervals: [200] }).toBe(2);
    const drop = await page.evaluate(() => { const st = window.__vc.stage; st.forceFrameMs(8); return { log: JSON.parse(JSON.stringify(st.qualityLog)), s: st.stats(), q: window.__vc.state().quality }; });
    const dropFrames = drop.s.frames - f0;
    expect(drop.log[1]).toMatchObject({ tier: 'medium', why: 'drop' });
    expect(drop.s.governor.drops).toBe(1);
    expect(drop.q).toBe('medium');
    // Never climbs back: 3 full governor windows of 8 ms frames (3 × 250 frames).
    const f1 = await frames(page);
    await waitFrames(page, 760, 540_000);
    const after = await page.evaluate(() => ({ log: JSON.parse(JSON.stringify(window.__vc.stage.qualityLog)), s: window.__vc.stage.stats(), q: window.__vc.state().quality }));
    // Sustained slow frames from Medium: one more single step to Low, then never below Low.
    await page.evaluate(() => window.__vc.stage.forceFrameMs(60));
    await expect.poll(() => page.evaluate(() => window.__vc.stage.qualityLog.length), { timeout: 300_000, intervals: [200] }).toBe(3);
    await waitFrames(page, 120, 300_000); // 7.2 s of 60 ms frames at Low
    const low = await page.evaluate(() => ({ log: JSON.parse(JSON.stringify(window.__vc.stage.qualityLog)), s: window.__vc.stage.stats(), q: window.__vc.state().quality }));
    const summary = { bench: { log: bench.log, benchmarkMs: bench.s.governor.benchmarkMs, high: { pr: tierHigh.scenePixelRatio, shadow: tierHigh.shadowMap, post: tierHigh.post, veil: tierHigh.veilPixelRatio } },
      drop: { dropFrames, frameTimeMs: dropFrames * 30, log: drop.log, medium: { pr: drop.s.scenePixelRatio, shadow: drop.s.shadowMap, post: drop.s.post, veil: drop.s.veilPixelRatio } },
      after8ms: { frames: after.s.frames - f1, q: after.q, drops: after.s.governor.drops },
      low: { log: low.log, q: low.q, drops: low.s.governor.drops, pr: low.s.scenePixelRatio, shadow: low.s.shadowMap, post: low.s.post, veil: low.s.veilPixelRatio } };
    fs.writeFileSync(path.join(SHOTS, 'tiers.json'), JSON.stringify(summary, null, 1));
    expect(dropFrames).toBeGreaterThanOrEqual(60); expect(dropFrames).toBeLessThanOrEqual(74); // 2,000 ms ±10%
    expect(after.q).toBe('medium'); expect(after.s.governor.drops).toBe(1);
    expect(low.log.map(l => l.tier)).toEqual(['high', 'medium', 'low']);
    expect(low.q).toBe('low'); expect(low.s.governor.drops).toBe(2);
    // Tier values from file 05 (DPR 2 window).
    expect([tierHigh.scenePixelRatio, tierHigh.shadowMap, tierHigh.post.bloom, tierHigh.post.msaa, tierHigh.post.fxaa]).toEqual([2, 2048, 'half', 4, false]); // WP-15: High glow at half size since WP-14 (DECISIONS, NEEDS PAUL)
    expect(tierHigh.veilPixelRatio).toBeCloseTo(1, 5);
    expect([drop.s.scenePixelRatio, drop.s.shadowMap, drop.s.post.bloom, drop.s.post.msaa, drop.s.post.fxaa]).toEqual([1.5, 1024, 'half', 4, false]);
    expect(drop.s.veilPixelRatio).toBeCloseTo(0.375, 5);
    expect([low.s.scenePixelRatio, low.s.shadowMap, low.s.post.bloom, low.s.post.fxaa]).toEqual([1, 512, 'off', true]);
    expect(low.s.veilPixelRatio).toBeCloseTo(0.25, 5);
    expect(log.errors).toEqual([]); expect(log.pageErrors).toEqual([]);
    await ctx.close();
  });

  test('6 · no console errors; heap stable over a 5-minute idle run (1440×900)', async ({ page }) => {
    test.setTimeout(900_000);
    const log = await openDesk(page);
    const cdp = await page.context().newCDPSession(page);
    const sample = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      const h = await cdp.send('Runtime.getHeapUsage');
      const s = await page.evaluate(() => window.__vc.stage.stats());
      return { mb: +(h.usedSize / 1048576).toFixed(3), frames: s.frames, geo: s.renderer.geometries, tex: s.renderer.textures, tier: s.tier, dom: await page.evaluate(() => document.getElementsByTagName('*').length) };
    };
    const rows = [await sample()];
    for (let m = 1; m <= 5; m++) { await page.waitForTimeout(60_000); rows.push(await sample()); }
    fs.writeFileSync(path.join(SHOTS, 'heap-idle.json'), JSON.stringify({ rows, log }, null, 1));
    const mb = rows.map(r => r.mb);
    expect(mb[5] - mb[1]).toBeLessThan(0.5);
    expect(Math.max(...mb.slice(3)) - Math.min(...mb.slice(3))).toBeLessThan(0.3);
    expect(new Set(rows.slice(1).map(r => r.geo)).size).toBe(1);
    expect(new Set(rows.slice(1).map(r => r.tex)).size).toBe(1);
    // WP-15: since WP-10/WP-14 idle-time work (stamp grain, slips) can add an element for a moment; a leak
    // would keep growing, so the count must be back where it started and never more than 2 above it.
    expect(rows[5].dom).toBe(rows[1].dom);
    expect(Math.max(...rows.map(r => r.dom)) - rows[0].dom).toBeLessThanOrEqual(2);
    expect(rows[5].frames).toBeGreaterThan(rows[0].frames + 100);
    expect(log.errors).toEqual([]); expect(log.pageErrors).toEqual([]); expect(log.warnings).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
test.describe('WP-04 timings and steps', () => {
  test.setTimeout(600_000);

  test('camera: framing, drift spring 30/10 to 1.6 × 1.0 cm, middle-third zoom 1.025, shake 0.04 cm / 140 ms', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 500 }, locale: 'en-US', timezoneId: 'UTC' });
    const page = await ctx.newPage();
    const log = await openDesk(page);
    await page.evaluate(() => window.__vc.quality('low'));
    // Record per-frame scaled time and camera offset/zoom from inside the frame loop.
    await page.evaluate(() => {
      const st = window.__vc.stage; window.__rec = [];
      st.onPhase('print', () => { const c = st.three.camera; window.__rec.push({ t: window.__vc.clock.now(), x: c.position.x, zoom: c.zoom, r: st.camera.read() }); });
    });
    const fill = await page.evaluate(() => {
      const st = window.__vc.stage; st.camera.set({ x: 0, y: 0, zoom: 1 });
      const pts = [[-48, -27], [48, -27], [-48, 27], [48, 27]].map(([x, y]) => st.project(x, y));
      const xs = pts.map(p => p.x / innerWidth * 2 - 1), ys = pts.map(p => 1 - p.y / innerHeight * 2);
      return { widest: Math.max(...xs.map(Math.abs), ...ys.map(Math.abs)), cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2, fov: st.three.camera.fov };
    });
    expect(fill.fov).toBe(28);
    expect(fill.widest).toBeCloseTo(0.99, 2); // WP-15: stage.sheetFill 0.97 → 0.99 since WP-08+09 (DECISIONS: camera framing)
    expect(Math.abs(fill.cy)).toBeLessThan(0.01);
    // Drift: release, slow time ×0.1 so each ~frame is a small scaled step, move pointer to the top-right corner.
    await page.evaluate(() => { window.__vc.stage.camera.release(); window.__vc.timeScale(0.1); });
    await page.mouse.move(400, 250); await waitFrames(page, 3);
    await page.evaluate(() => { window.__vc.timeScale(1); });
    await waitFrames(page, 120); // settle at centre (zoom up); WP-15: 25 frames read 1.0229 on the current build, still rising
    const centre = await page.evaluate(() => window.__vc.stage.three.camera.zoom);
    await page.evaluate(() => { window.__vc.timeScale(0.1); window.__rec = []; window.__t0 = window.__vc.clock.now(); });
    await page.mouse.move(799, 0);
    // WP-15: wait on scaled time, not a frame count: since WP-14 frames are shorter, and 150 frames at ×0.1
    // no longer covered the spring's 90 % point (~0.52 s scaled).
    const scaledSince = (ms) => page.waitForFunction(m => window.__vc.clock.now() - window.__t0 >= m, ms, { timeout: 400_000, polling: 100 });
    await scaledSince(1200);
    const rec = await page.evaluate(() => ({ rec: window.__rec, t0: window.__t0 }));
    await page.evaluate(() => { window.__vc.timeScale(1); window.__t0 = window.__vc.clock.now(); });
    await scaledSince(1500); // settle fully before reading the end offsets (WP-15: by time, was 20 frames)
    rec.rig = await page.evaluate(() => window.__vc.stage.camera.read());
    // The drift offset relative to centre: use the rig's read() (x, y offsets) when available.
    const series = rec.rec.map(r => ({ t: r.t - rec.t0, x: r.r.x, y: r.r.y, zoom: r.zoom }));
    const finalX = rec.rig.x, finalY = rec.rig.y;
    const t63 = series.find(p => p.x >= 0.632 * 1.6)?.t, t90 = series.find(p => p.x >= 0.9 * 1.6)?.t;
    // Analytic step response of x'' = −30(x−1) − 10x' (mass 1): 63.2% at ~0.307 s, 90% at ~0.515 s (from 0 velocity).
    const analytic = (() => { let x = 0, v = 0, t = 0, a63 = null, a90 = null; const h = 1 / 2400; while (t < 3) { v += (-30 * (x - 1) - 10 * v) * h; x += v * h; t += h; if (a63 === null && x >= 0.632) a63 = t * 1000; if (a90 === null && x >= 0.9) { a90 = t * 1000; break; } } return { a63, a90 }; })();
    // Shake: pin, then shake(), record offsets.
    await page.evaluate(() => { const st = window.__vc.stage; st.camera.set({ x: 0, y: 0, zoom: 1 }); window.__vc.timeScale(0.05); window.__rec = []; window.__t0 = window.__vc.clock.now(); st.camera.shake(); });
    await scaledSince(300); // WP-15: by scaled time (was 60 frames, which now covers only ~50 ms of the 140 ms shake)
    const sh = await page.evaluate(() => ({ rec: window.__rec.map(r => ({ t: r.t - window.__t0, x: r.x })) }));
    await page.evaluate(() => window.__vc.timeScale(1));
    const shaking = sh.rec.filter(r => Math.abs(r.x) > 1e-6);
    const shake = { maxAbs: Math.max(...sh.rec.map(r => Math.abs(r.x))), lastShakeT: shaking.length ? shaking[shaking.length - 1].t : null, firstStillT: sh.rec.find(r => r.t > 0 && Math.abs(r.x) <= 1e-6 && r.t > (shaking[0]?.t ?? 0))?.t, samples: shaking.length };
    const out = { fill, centreZoom: centre, drift: { finalX, finalY, finalZoom: series.at(-1)?.zoom, t63, t90, analytic, samples: series.length }, shake };
    fs.writeFileSync(path.join(SHOTS, 'camera-timing.json'), JSON.stringify(out, null, 1));
    expect(centre).toBeCloseTo(1.025, 3);
    expect(finalX).toBeCloseTo(1.6 * (799 / 800 * 2 - 1), 2); expect(finalY).toBeCloseTo(1.0, 2);
    expect(series.at(-1).zoom).toBeCloseTo(1, 3); // corner is outside the middle third
    expect(t63).toBeGreaterThan(analytic.a63 * 0.9); expect(t63).toBeLessThan(analytic.a63 * 1.1 + 40);
    expect(t90).toBeGreaterThan(analytic.a90 * 0.9); expect(t90).toBeLessThan(analytic.a90 * 1.1 + 40);
    expect(shake.maxAbs).toBeLessThanOrEqual(0.04 + 1e-9); expect(shake.maxAbs).toBeGreaterThan(0.005);
    expect(shake.lastShakeT).toBeLessThanOrEqual(140 * 1.1);
    expect(shake.lastShakeT).toBeGreaterThan(140 * 0.7);
    expect(log.errors).toEqual([]); expect(log.pageErrors).toEqual([]);
    await ctx.close();
  });

  test('input: exact pointer, 30 ms velocity in cm/s, hover raycast lifts the Load coin, grain at 24 fps', async ({ page }) => {
    const log = await openDesk(page);
    await page.evaluate(() => window.__vc.quality('low'));
    // Exact pointer: the paper point under the cursor, from my own unprojection (camera pinned so it can't drift in between).
    await page.evaluate(() => window.__vc.stage.camera.set({ x: 0.7, y: -0.3, zoom: 1.01 }));
    await page.mouse.move(901, 333);
    const exact = await page.evaluate(() => {
      const st = window.__vc.stage, { THREE, camera } = st.three, s = st.input();
      const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(901 / innerWidth * 2 - 1, 1 - 333 / innerHeight * 2), camera);
      const p = new THREE.Vector3(); rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), p);
      return { dx: Math.abs(s.x - p.x), dy: Math.abs(s.y - p.y), clientX: s.clientX, clientY: s.clientY };
    });
    expect(exact.clientX).toBe(901); expect(exact.clientY).toBe(333);
    expect(exact.dx).toBeLessThan(1e-3); expect(exact.dy).toBeLessThan(1e-3);
    // Velocity: synthetic pointermoves every 4 ms at exactly 100 cm/s along x on the paper.
    const vel = await page.evaluate(async () => {
      const st = window.__vc.stage; st.camera.set({ x: 0, y: 0, zoom: 1 });
      const a = st.project(-20, 0), b = st.project(20, 0); const pxPerCm = (b.x - a.x) / 40;
      const t0 = performance.now(); let last = t0; const readings = [];
      while (performance.now() - t0 < 400) {
        const now = performance.now();
        if (now - last >= 4) { last = now; const xCm = -20 + (now - t0) / 1000 * 100; const p = st.project(xCm, 0);
          window.dispatchEvent(new PointerEvent('pointermove', { clientX: p.x, clientY: p.y, pointerType: 'mouse', isPrimary: true, bubbles: true }));
          if (now - t0 > 100) readings.push(st.input().speed); }
      }
      const mid = readings.slice(Math.floor(readings.length * 0.2));
      const avg = mid.reduce((s, v) => s + v, 0) / mid.length;
      await new Promise(r => setTimeout(r, 150));
      return { avg, min: Math.min(...mid), max: Math.max(...mid), stopped: st.input().speed, pxPerCm };
    });
    // Hover the Load coin: raycast name and an emissive change.
    const coin = await page.evaluate(() => { const st = window.__vc.stage; st.camera.set({ x: 0, y: 0, zoom: 1 }); return st.project(31.5, 20, 0.35); });
    await page.mouse.move(10, 10); await waitFrames(page, 2);
    const clip = { x: Math.round(coin.x) - 40, y: Math.round(coin.y) - 40, width: 80, height: 80 };
    await hideGrain(page);
    const off = await shot(page, 'coin-load-no-hover.png', clip);
    await page.mouse.move(coin.x, coin.y); await waitFrames(page, 3);
    const hover = await page.evaluate(() => window.__vc.stage.input().hover);
    const on = await shot(page, 'coin-load-hover.png', clip);
    const [r0, r1] = await Promise.all([raw(off), raw(on)]);
    let d = 0, changedPx = 0;
    for (let i = 0; i < r0.data.length; i += 3) {
      const p = Math.abs(r0.data[i] - r1.data[i]) + Math.abs(r0.data[i + 1] - r1.data[i + 1]) + Math.abs(r0.data[i + 2] - r1.data[i + 2]);
      d += p; if (p > 15) changedPx++;
    }
    const meanDiff = d / r0.data.length;
    await crop200(on, 'coin-load-hover-200pct.png');
    // Grain re-offset rate: drive the overlay with 10 ms steps for 2 s of clock → 48 re-offsets expected.
    const grain = await page.evaluate(() => {
      const o = window.__vc.stage.three.overlays, n = document.querySelector('#grain .vc-grain-noise');
      let changes = 0, prev = n.style.backgroundPosition;
      for (let i = 0; i < 200; i++) { o.updateGrain(10); if (n.style.backgroundPosition !== prev) { changes++; prev = n.style.backgroundPosition; } }
      const cs = getComputedStyle(n), vg = getComputedStyle(document.querySelector('#grain .vc-grain-vignette'));
      return { changes, opacity: cs.opacity, vignette: vg.backgroundImage, tile: cs.backgroundImage.slice(0, 30) };
    });
    const ev = await page.evaluate(() => [...new Set(window.__vc.events.map(e => e.type))]);
    fs.writeFileSync(path.join(SHOTS, 'input.json'), JSON.stringify({ exact, vel, hover, meanDiff, changedPx, grain, eventTypes: ev }, null, 1));
    expect(vel.avg).toBeGreaterThan(90); expect(vel.avg).toBeLessThan(110);
    expect(vel.stopped).toBe(0);
    expect(hover).toBe('coin-load');
    // Visible change on the placeholder coin (minor finding: only the rim lifts, see report).
    expect(changedPx).toBeGreaterThan(100);
    expect(grain.changes).toBeGreaterThanOrEqual(44); expect(grain.changes).toBeLessThanOrEqual(52);
    expect(grain.opacity).toBe('0.1');
    expect(grain.vignette).toContain('0.18');
    expect(log.errors).toEqual([]); expect(log.pageErrors).toEqual([]);
  });

  test('frame loop: phase order, CSS3D only re-renders when the camera moved, placeholders at the master layout', async ({ page }) => {
    const log = await openDesk(page);
    const r = await page.evaluate(async () => {
      const st = window.__vc.stage, order = [];
      for (const p of st.phases) st.onPhase(p, () => { if (order.length < st.phases.length * 3) order.push(p); });
      const css = st.three.els.print; let mut = 0;
      // WP-15: since WP-07/10 the ink, masks and slips animate other style properties inside #print; CSS3D's own
      // re-render is a transform write, so only mutations that change an element's transform are counted.
      const tf = v => { const m = /(?:^|;)\s*transform:\s*([^;]*)/.exec(v || ''); return m ? m[1].trim() : ''; };
      const mo = new MutationObserver(l => { mut += l.filter(m => tf(m.oldValue) !== m.target.style.transform).length; });
      mo.observe(css, { attributes: true, subtree: true, attributeFilter: ['style'], attributeOldValue: true });
      st.camera.set({ x: 0, y: 0, zoom: 1 });
      await new Promise(r => setTimeout(r, 50)); mut = 0;
      const f0 = st.stats().frames; while (st.stats().frames < f0 + 4) await new Promise(r => setTimeout(r, 50));
      const still = mut; mut = 0;
      st.camera.set({ x: 1, y: 0.5, zoom: 1.01 });
      const f1 = st.stats().frames; while (st.stats().frames < f1 + 2) await new Promise(r => setTimeout(r, 50));
      const moved = mut; mo.disconnect();
      const P = st.three.parts.root; const names = []; P.traverse(o => { if (o.isMesh) names.push(o.name); });
      const pos = n => { const o = P.getObjectByName(n); const b = new st.three.THREE.Box3().setFromObject(o); return { min: [b.min.x, b.min.y, b.min.z].map(v => +v.toFixed(2)), max: [b.max.x, b.max.y, b.max.z].map(v => +v.toFixed(2)) }; };
      return { phases: st.phases, order: order.slice(0, st.phases.length), still, moved, names,
        sheet: pos('sheet-main'), inset: pos('sheet-inset'), block: pos('woodblock'), load: pos('coin-load'), sound: pos('coin-sound'), howto: pos('coin-howto'),
        bloomLayer: (() => { const out = []; st.three.scene.traverse(o => { if (o.isMesh && o.layers.mask & 2) out.push(o.name); }); return out; })(),
        renderer: { tone: st.three.renderer.toneMapping, agx: st.three.THREE.AgXToneMapping, cs: st.three.renderer.outputColorSpace, exposure: st.three.renderer.toneMappingExposure, shadows: st.three.renderer.shadowMap.enabled },
        env: st.stats().environment };
    });
    fs.writeFileSync(path.join(SHOTS, 'frame-loop.json'), JSON.stringify(r, null, 1));
    expect(r.order).toEqual(['input', 'physics', 'scene', 'veil', 'overlays', 'print']);
    expect(r.still).toBe(0); expect(r.moved).toBeGreaterThan(0);
    expect(r.sheet.min.slice(0, 2)).toEqual([-48, -27]); expect(r.sheet.max.slice(0, 2)).toEqual([48, 27]);
    expect(r.inset.min.slice(0, 2)).toEqual([-12, -25]); expect(r.inset.max.slice(0, 2)).toEqual([46, 14]);
    expect(r.block.min).toEqual([-44, -20, expect.any(Number)]); expect(r.block.max.slice(0, 2)).toEqual([-16, 16]);
    expect(+(r.block.max[2] - r.block.min[2]).toFixed(2)).toBe(3);
    const near = (a, b) => a.forEach((v, k) => expect(v).toBeCloseTo(b[k], 2));
    near([(r.load.min[0] + r.load.max[0]) / 2, (r.load.min[1] + r.load.max[1]) / 2, (r.load.max[0] - r.load.min[0]) / 2], [31.5, 20, 3.4]);
    near([(r.howto.min[0] + r.howto.max[0]) / 2, (r.howto.min[1] + r.howto.max[1]) / 2, (r.howto.max[0] - r.howto.min[0]) / 2], [24, 20, 2.2]);
    near([(r.sound.min[0] + r.sound.max[0]) / 2, (r.sound.min[1] + r.sound.max[1]) / 2, (r.sound.max[0] - r.sound.min[0]) / 2], [46.2, -26, 1.6]); // DECISIONS point 6
    expect(r.bloomLayer.every(n => n.startsWith('gauntlet'))).toBe(true);
    expect(r.renderer).toMatchObject({ tone: r.renderer.agx, cs: 'srgb', exposure: 1, shadows: true });
    expect(r.env).toBe('studio');
    expect(log.errors).toEqual([]); expect(log.pageErrors).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
test.describe('WP-04 visual review', () => {
  test.setTimeout(900_000);

  test('screens at seed 7, slowed time: 1440×900 High/Medium/Low, crops, 390 px phone (desk forced and flat)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'UTC' });
    const page = await ctx.newPage();
    const log = await openDesk(page, '?seed=7', { fixedClock: true });
    await page.evaluate(() => window.__vc.timeScale(0.25));
    for (const t of ['high', 'medium', 'low']) {
      await page.evaluate(t => { window.__vc.quality(t); window.__vc.stage.camera.set({ x: 0, y: 0, zoom: 1 }); }, t);
      await waitFrames(page, 2);
      const full = await shot(page, `desk-${t}-1440x900.png`);
      if (t === 'high') {
        await crop200(await sharp(full).extract({ left: 0, top: 0, width: 520, height: 400 }).png().toBuffer(), 'crop-high-gauntlet-200pct.png');
        await crop200(await sharp(full).extract({ left: 980, top: 80, width: 460, height: 200 }).png().toBuffer(), 'crop-high-coins-200pct.png');
        await crop200(await sharp(full).extract({ left: 1100, top: 700, width: 340, height: 200 }).png().toBuffer(), 'crop-high-corner-200pct.png');
      }
    }
    // Reference beside ours.
    const ref = path.join(ROOT, 'reference', 'IMG_6272.png');
    const refBuf = await sharp(ref).resize(1440, 900, { fit: 'contain', background: '#000' }).png().toBuffer();
    await sharp({ create: { width: 1440, height: 1800, channels: 3, background: '#000' } })
      .composite([{ input: refBuf, top: 0, left: 0 }, { input: path.join(SHOTS, 'desk-high-1440x900.png'), top: 900, left: 0 }]).png().toFile(path.join(SHOTS, 'compare-reference-high.png'));
    expect(log.errors).toEqual([]); expect(log.pageErrors).toEqual([]);
    await ctx.close();
    // Phone width 390 px.
    for (const mode of ['desk', 'flat']) {
      const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', timezoneId: 'UTC' });
      const p = await c.newPage();
      const errs = []; p.on('pageerror', e => errs.push(String(e)));
      await p.clock.setFixedTime(A.FIXED_NOW);
      await p.goto(DIST + `?mode=${mode}&seed=7`);
      await expect(p.locator('#categories [data-category]').first()).toBeAttached({ timeout: 60_000 });
      if (mode === 'desk') { await expect.poll(() => p.evaluate(() => !!window.__vc.stage), { timeout: 60_000 }).toBe(true); await waitFrames(p, 3); }
      await A.loadSave(p, fch.fixture());
      await p.waitForTimeout(600);
      fs.writeFileSync(path.join(SHOTS, `phone-390-${mode}.png`), await p.screenshot());
      const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, run: window.__vc.state().runMode }));
      fs.writeFileSync(path.join(SHOTS, `phone-390-${mode}.json`), JSON.stringify(m));
      expect(m.run).toBe(mode);
      expect(m.sw).toBeLessThanOrEqual(m.iw);
      expect(errs).toEqual([]);
      await c.close();
    }
    // Phone without ?mode: automatic choice is flat (width < 1024).
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', timezoneId: 'UTC' });
    const p = await c.newPage(); await p.goto(DIST);
    await expect(p.locator('#categories [data-category]').first()).toBeAttached({ timeout: 60_000 });
    expect(await p.evaluate(() => window.__vc.state().runMode)).toBe('flat');
    await c.close();
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
test.describe('WP-04 break attempts', () => {
  test.setTimeout(900_000);

  test('resize mid-drift and mid-shake: canvases, framing and print alignment follow; stays desk below 1024 × 640', async ({ page }) => {
    const log = await openDesk(page);
    await page.evaluate(() => { window.__vc.quality('low'); window.__vc.timeScale(0.25); });
    await page.evaluate(() => window.__vc.stage.test.printDiv());
    const sizes = [[1100, 700], [1600, 1000], [800, 600], [390, 844], [1440, 900]];
    const rows = [];
    let i = 0;
    for (const [w, h] of sizes) {
      await page.mouse.move(i % 2 ? 50 : w - 50, i % 2 ? 50 : h - 50); // start a drift
      if (i % 2) await page.evaluate(() => window.__vc.stage.camera.shake(0.04, 400));
      await waitFrames(page, 1);
      await page.setViewportSize({ width: w, height: h });
      await waitFrames(page, 3);
      const r = await page.evaluate(() => {
        const st = window.__vc.stage, el = id => document.getElementById(id);
        const s = el('scene'), v = el('veil'), g = el('glow'), f = el('fx');
        const pts = [[-48, -27], [48, -27], [-48, 27], [48, 27]].map(([x, y]) => st.project(x, y));
        const xs = pts.map(p => p.x / innerWidth * 2 - 1), ys = pts.map(p => 1 - p.y / innerHeight * 2);
        const pr = st.stats().scenePixelRatio;
        const al = st.test.alignment();
        const cam = st.camera.read();
        return { iw: innerWidth, ih: innerHeight, run: window.__vc.state().runMode, scene: [s.width, s.height], veil: [v.width, v.height], glow: [g.width, g.height], fx: [f.width, f.height],
          client: [s.clientWidth, s.clientHeight], pr, aspect: st.three.camera.aspect, widest: Math.max(...xs.map(Math.abs), ...ys.map(Math.abs)), align: al.max,
          finite: [cam.x, cam.y, cam.zoom].every(Number.isFinite) };
      });
      rows.push({ size: [w, h], ...r });
      i++;
    }
    fs.writeFileSync(path.join(SHOTS, 'resize.json'), JSON.stringify(rows, null, 1));
    for (const r of rows) {
      expect(r.run).toBe('desk');
      expect([r.iw, r.ih]).toEqual(r.size);
      expect(r.client).toEqual(r.size);
      expect(r.scene).toEqual([Math.round(r.iw * r.pr), Math.round(r.ih * r.pr)]);
      expect(r.aspect).toBeCloseTo(r.iw / r.ih, 5);
      expect(r.widest).toBeGreaterThan(0.9); expect(r.widest).toBeLessThan(1.06); // drift/zoom may push it a little past 0.97
      expect(r.align).toBeLessThanOrEqual(1);
      expect(r.finite).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await waitFrames(page, 2);
    await shot(page, 'resize-to-390-desk.png');
    expect(log.errors).toEqual([]); expect(log.pageErrors).toEqual([]);
  });

  test('hidden tab: loop pauses, no tier drop on return, camera stays finite', async ({ page }) => {
    const log = await openDesk(page);
    await page.evaluate(() => window.__vc.quality('high'));
    await page.evaluate(() => window.__vc.stage.forceFrameMs(10)); // keep the governor quiet except for what hiding does
    await page.mouse.move(1300, 100);
    await page.evaluate(() => window.__vc.stage.camera.shake(0.04, 2000));
    await waitFrames(page, 2);
    const before = await page.evaluate(() => window.__vc.stage.stats());
    await page.evaluate(() => {
      window.__hid = true;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hid });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__hid ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(4000);
    const hidden = await page.evaluate(() => window.__vc.stage.stats());
    await page.evaluate(() => { window.__hid = false; document.dispatchEvent(new Event('visibilitychange')); window.__vc.stage.forceFrameMs(null); window.__vc.stage.slowFrames(0); });
    await page.evaluate(() => window.__vc.stage.forceFrameMs(10));
    await waitFrames(page, 5);
    const back = await page.evaluate(() => ({ s: window.__vc.stage.stats(), cam: window.__vc.stage.camera.read(), log: JSON.parse(JSON.stringify(window.__vc.stage.qualityLog)) }));
    // Real lifecycle freeze (rAF stops without a visibilitychange) for 3 s, then resume.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await new Promise(r => setTimeout(r, 3000));
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await waitFrames(page, 5);
    const thawed = await page.evaluate(() => ({ s: window.__vc.stage.stats(), cam: window.__vc.stage.camera.read() }));
    const out = { before: { frames: before.frames, hiddenSkips: before.hiddenSkips }, hidden: { frames: hidden.frames, hiddenSkips: hidden.hiddenSkips }, back: { frames: back.s.frames, tier: back.s.tier, cam: back.cam, log: back.log }, thawed: { frames: thawed.s.frames, tier: thawed.s.tier, cam: thawed.cam } };
    fs.writeFileSync(path.join(SHOTS, 'hidden-tab.json'), JSON.stringify(out, null, 1));
    expect(hidden.frames - before.frames).toBeLessThanOrEqual(1); // at most the frame in flight
    expect(hidden.hiddenSkips).toBeGreaterThan(before.hiddenSkips);
    expect(back.s.frames).toBeGreaterThan(hidden.frames);
    expect(back.s.tier).toBe('high');
    expect(Object.values(back.cam).filter(v => typeof v === 'number').every(Number.isFinite)).toBe(true);
    expect(thawed.s.frames).toBeGreaterThan(back.s.frames);
    expect(log.errors).toEqual([]); expect(log.pageErrors).toEqual([]);
  });

  // test.fail = round-1 required fix 1 (major): body.mode-desk keeps overflow:hidden after the fallback, so the wheel can't scroll.
  test.fail('WebGL failure after choosing desk: #desk removed with a warning, original page usable', async ({ page }) => {
    // The mode probe gets WebGL2; every later webgl2 request (the renderers) fails.
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext; let n = 0;
      HTMLCanvasElement.prototype.getContext = function (t, ...a) { if (t === 'webgl2' && n++ > 0) return null; return orig.call(this, t, ...a); };
    });
    const warnings = [], errs = [];
    page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    await page.clock.setFixedTime(A.FIXED_NOW);
    await page.goto(DIST + '?seed=7');
    await expect(page.locator('#categories [data-category]').first()).toBeAttached({ timeout: 60_000 });
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('vc-desk-failed')), { timeout: 60_000 }).toBe(true);
    const st = await page.evaluate(() => ({ desk: !!document.getElementById('desk'), run: window.__vc.state().runMode, overflow: getComputedStyle(document.body).overflow, stage: !!window.__vc.stage }));
    await A.loadSave(page, fch.fixture());
    await A.selectView(page, 'The Master Chef');
    const vis = await page.locator('#collectionView').isVisible();
    fs.writeFileSync(path.join(SHOTS, 'webgl-fail.png'), await page.screenshot());
    // Scroll check with a real wheel (desk set overflow hidden on body; scrollTo() would bypass that).
    await page.evaluate(() => scrollTo(0, 0));
    await page.mouse.move(720, 450);
    for (let k = 0; k < 5; k++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(150); }
    const scroll = await page.evaluate(() => ({ y: scrollY, h: document.documentElement.scrollHeight, ih: innerHeight, bodyClass: document.body.className, run: window.__vc.state().runMode }));
    // Keyboard reach: Tab to the last footer link and check it is scrolled into view.
    const lastLink = await page.evaluate(() => { const a = [...document.querySelectorAll('footer a, a')].pop(); a.focus(); const r = a.getBoundingClientRect(); return { top: r.top, ih: innerHeight }; });
    fs.writeFileSync(path.join(SHOTS, 'webgl-fail.json'), JSON.stringify({ st, vis, scroll, lastLink, warnings: warnings.filter(w => !GL_ALLOWED.test(w)).map(w => w.slice(0, 120)), errs }, null, 1));
    expect(st.desk).toBe(false);
    expect(vis).toBe(true);
    expect(warnings.some(w => /Desk stage could not start/.test(w))).toBe(true);
    // three.js itself logs this one console.error before throwing; it is the failure being simulated.
    expect(errs.filter(e => !/Error creating WebGL context/.test(e))).toEqual([]);
    expect(scroll.h).toBeGreaterThan(scroll.ih);
    expect(scroll.y, 'wheel must scroll the fallback page').toBeGreaterThan(0);
  });

  test('WebGL context loss mid-session: no uncaught errors; rendering resumes after restore', async ({ page }) => {
    const log = await openDesk(page);
    await page.evaluate(() => window.__vc.quality('low'));
    await waitFrames(page, 2);
    await hideGrain(page);
    const r = await page.evaluate(async () => {
      const ext = document.getElementById('scene').getContext('webgl2').getExtension('WEBGL_lose_context');
      const extV = document.getElementById('veil').getContext('webgl2').getExtension('WEBGL_lose_context');
      ext.loseContext(); extV.loseContext();
      const f0 = window.__vc.stage.stats().frames;
      await new Promise(r => setTimeout(r, 3000));
      const f1 = window.__vc.stage.stats().frames;
      ext.restoreContext(); extV.restoreContext();
      await new Promise(r => setTimeout(r, 4000));
      return { framesWhileLost: f1 - f0, framesAfter: window.__vc.stage.stats().frames - f1 };
    });
    await waitFrames(page, 3);
    const buf = await shot(page, 'context-restored.png');
    const img = await raw(buf);
    let s = 0; for (let i = 0; i < img.data.length; i += 3) s += lum(img.data, i);
    const meanLum = s / (img.w * img.h);
    fs.writeFileSync(path.join(SHOTS, 'context-loss.json'), JSON.stringify({ ...r, meanLum, log }, null, 1));
    expect(log.pageErrors).toEqual([]);
    expect(r.framesAfter).toBeGreaterThan(0);
    expect(meanLum).toBeGreaterThan(60); // the cream sheet is back, not a black canvas
  });

  test('4× CPU throttle from High: single-step drops only, never climbs, app still works, alignment holds', async ({ page }) => {
    const log = await openDesk(page);
    const cdp = await page.context().newCDPSession(page);
    // Let the load benchmark finish (SwiftShader → Low), then override to High and throttle.
    await expect.poll(() => page.evaluate(() => window.__vc.stage.stats().governor.phase), { timeout: 300_000, intervals: [500] }).toBe('watch');
    await page.evaluate(() => { window.__vc.quality('high'); window.__vc.stage.test.printDiv(); });
    const n0 = await page.evaluate(() => window.__vc.stage.qualityLog.length);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // Rapid input while throttled.
    for (let k = 0; k < 120; k++) await page.mouse.move(100 + (k * 37) % 1200, 100 + (k * 53) % 700);
    await expect.poll(() => page.evaluate(() => window.__vc.state().quality), { timeout: 600_000, intervals: [1000] }).toBe('low');
    await waitFrames(page, 5, 600_000);
    await A.loadSave(page, fch.fixture());
    await A.selectView(page, 'The Carpenter');
    const r = await page.evaluate(n0 => ({ log: JSON.parse(JSON.stringify(window.__vc.stage.qualityLog)).slice(n0 - 1), drops: window.__vc.stage.stats().governor.drops, align: window.__vc.stage.test.alignment().max, speed: window.__vc.stage.input().speed }), n0);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    fs.writeFileSync(path.join(SHOTS, 'throttle.json'), JSON.stringify({ ...r, console: log }, null, 1));
    expect(r.log.map(l => l.tier)).toEqual(['high', 'medium', 'low']);
    expect(r.drops).toBe(2);
    const order = ['high', 'medium', 'low'];
    const tiers = r.log.map(l => order.indexOf(l.tier));
    for (let k = 1; k < tiers.length; k++) { if (r.log[k].why === 'drop') expect(tiers[k] - tiers[k - 1]).toBe(1); expect(tiers[k]).toBeGreaterThanOrEqual(tiers[k - 1]); }
    expect(r.align).toBeLessThanOrEqual(1);
    expect(Number.isFinite(r.speed)).toBe(true);
    expect(log.errors).toEqual([]); expect(log.pageErrors).toEqual([]);
  });
});
