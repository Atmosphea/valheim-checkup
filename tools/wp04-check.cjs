// Builder self-check for WP-04 (not a checker test). Run after the builds:
//   npm run build:all && node tools/wp04-check.cjs            (about 10 minutes, mostly the idle run)
//   IDLE_MS=60000 node tools/wp04-check.cjs                     (shorter idle run while iterating)
// Uses the Playwright + Chromium the checker installed in tests/node_modules (read-only), one
// browser at a time, with the same SwiftShader flags as tests/playwright.config.js. No save is
// loaded. Screenshots go to docs/reports/wp-04/. Prints check names and numbers only.
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const sharp = require('sharp');
const BASE = pathToFileURL(path.join(ROOT, 'dist', 'valheim-checkup.html')).href;
const SHOTS = path.join(ROOT, 'docs', 'reports', 'wp-04');
fs.mkdirSync(SHOTS, { recursive: true });
const IDLE_MS = +(process.env.IDLE_MS || 300000);
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, query, opts = {}) {
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'UTC', reducedMotion: opts.reducedMotion, hasTouch: opts.hasTouch, isMobile: opts.isMobile });
  const page = await context.newPage();
  if (opts.init) await page.addInitScript(opts.init);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + query);
  await page.waitForFunction(() => window.__vc && document.querySelector('#categories [data-category]'), null, { timeout: 60000 });
  return { page, context, errors };
}
const waitStage = page => page.waitForFunction(() => window.__vc.stage && window.__vc.stage.stats().frames > 2, null, { timeout: 90000 });

/** Luminance of every pixel in a box of a PNG. */
async function regionStats(png, box) {
  const { data, info } = await sharp(png).extract(box).raw().toBuffer({ resolveWithObject: true });
  const lum = [];
  for (let i = 0; i < data.length; i += info.channels) lum.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
  return lum;
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    // ── Mode switch (acceptance 4) ──────────────────────────────────────────────────────────
    {
      const cases = [
        ['1440 × 900, fine pointer, WebGL2 → desk', '', {}, 'desk'],
        ['no WebGL2 → flat', '', { init: () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return t === 'webgl2' ? null : g.call(this, t, ...a); }; } }, 'flat'],
        ['reduced motion → flat', '', { reducedMotion: 'reduce' }, 'flat'],
        ['coarse pointer (touch phone emulation at 1440 × 900) → flat', '', { hasTouch: true, isMobile: true }, 'flat'],
        ['900 px wide window → flat', '', { viewport: { width: 900, height: 800 } }, 'flat'],
        ['help switch on + reduced motion → desk', '', { reducedMotion: 'reduce', init: () => localStorage.setItem('valheim-checkup-3d:force-desk', '1') }, 'desk'],
      ];
      for (const [name, q, opts, want] of cases) {
        const { page, context, errors } = await open(browser, q, opts);
        const got = await page.evaluate(() => ({ run: __vc.state().runMode, body: document.body.className, desk: !!document.getElementById('desk'), fine: matchMedia('(pointer: fine)').matches }));
        check(`mode: ${name}`, got.run === want && got.desk === (want === 'desk') && got.body.includes('mode-' + want) && errors.length === 0, `runMode ${got.run}, #desk ${got.desk}, pointer:fine ${got.fine}, errors ${errors.length}`);
        await context.close();
      }
    }

    // ── Main desk page ──────────────────────────────────────────────────────────────────────
    const { page, context, errors } = await open(browser, '?mode=desk&seed=7');
    await waitStage(page);
    await page.waitForFunction(() => __vc.stage.stats().governor.phase === 'watch', null, { timeout: 120000 });
    const bench = await page.evaluate(() => ({ s: __vc.stage.stats(), log: __vc.stage.qualityLog.slice() }));
    check('benchmark ran 60 frames after warm-up and picked a start tier', bench.log[0] && bench.log[0].why === 'benchmark', `benchmark ${bench.s.governor.benchmarkMs.toFixed(1)} ms → ${bench.log[0] && bench.log[0].tier} (SwiftShader)`);

    // Acceptance 1: layer order, blend modes, pointer settings
    {
      const L = await page.evaluate(() => ({ layers: __vc.stage.layers(), parent: document.getElementById('desk').parentElement.tagName, floatChild: (() => { const d = document.createElement('div'); document.getElementById('float').append(d); const p = getComputedStyle(d).pointerEvents; d.remove(); return p; })() }));
      const want = [['scene', 'canvas', 'normal', 'none'], ['print', 'div', 'normal', 'auto'], ['veil', 'canvas', 'multiply', 'none'], ['glow', 'canvas', 'screen', 'none'], ['float', 'div', 'normal', 'none'], ['fx', 'canvas', 'normal', 'none'], ['grain', 'div', 'overlay', 'none']];
      const got = L.layers.map(l => [l.id, l.tag, l.mixBlendMode, l.pointerEvents]);
      check('layers: seven direct children of #desk in file 05 order, tag, blend and pointer', JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
      check('layers: #float content takes the pointer (layer passes it through where empty)', L.floatChild === 'auto');
      check('layers: no isolation, opacity < 1 or filter on any layer', L.layers.every(l => l.isolation === 'auto' && l.opacity === '1' && l.filter === 'none'));
      const grain = await page.evaluate(() => { const n = document.querySelector('#grain .vc-grain-noise'); const a = n.style.backgroundPosition; return new Promise(r => setTimeout(() => r({ a, b: n.style.backgroundPosition, op: getComputedStyle(n).opacity, vig: getComputedStyle(document.querySelector('#grain .vc-grain-vignette')).backgroundImage }), 1500)); });
      check('grain: 10% noise tile re-offsets over time; 18% vignette in the same overlay', grain.op === '0.1' && grain.a !== grain.b && /0\.18\)/.test(grain.vig), `opacity ${grain.op}, ${grain.a} → ${grain.b}`);
      const r1 = await page.evaluate(() => { const s = __vc.stage.three; return { tone: s.renderer.toneMapping === s.THREE.AgXToneMapping, exp: s.renderer.toneMappingExposure, cs: s.renderer.outputColorSpace, fov: s.camera.fov, pitch: __vc.stage.camera.read().pitchDeg, env: __vc.stage.stats().environment, lights: s.scene.children.filter(o => o.isLight).map(o => o.type + ':' + o.name), bloomOnly: s.parts.bloom.map(m => m.name), shadowType: s.renderer.shadowMap.type }; });
      check('renderer 1: AgX tone mapping, exposure 1, sRGB output, soft shadows', r1.tone === true && r1.exp === 1 && r1.cs === 'srgb', JSON.stringify(r1));
      check('camera fov 28°, pitch 62°; lights key/fill/rim/spark; studio env via PMREM; bloom layer = gauntlet only', r1.fov === 28 && r1.pitch === 62 && r1.env === 'studio' && JSON.stringify(r1.lights) === JSON.stringify(['DirectionalLight:key', 'HemisphereLight:fill', 'DirectionalLight:rim', 'PointLight:spark']) && r1.bloomOnly.every(n => n.startsWith('gauntlet')));
    }

    // Reference-style screenshots at High and Low
    await page.evaluate(() => { __vc.stage.forceFrameMs(10); __vc.quality('high'); });
    await page.mouse.move(720, 450);
    await wait(3000);
    await page.evaluate(() => __vc.stage.renderNow());
    await page.screenshot({ path: path.join(SHOTS, 'desk-high-1440x900.png') });
    await page.evaluate(() => { __vc.quality('low'); __vc.stage.renderNow(); });
    await wait(500);
    await page.screenshot({ path: path.join(SHOTS, 'desk-low-1440x900.png') });
    await page.evaluate(() => __vc.quality('high'));

    // Acceptance 2: printed test div stays within 1 px of its paper position
    {
      await page.evaluate(() => __vc.stage.test.printDiv());
      for (const o of [{ x: 0, y: 0, zoom: 1 }, { x: 1.6, y: 1.0, zoom: 1 }, { x: 0, y: 0, zoom: 1.025 }, { x: 1.6, y: 1.0, zoom: 1.025 }, { x: -1.6, y: -1.0, zoom: 1.025 }]) {
        const a = await page.evaluate(c => { __vc.stage.camera.set(c); return __vc.stage.test.alignment(); }, o);
        check(`print alignment at offset (${o.x}, ${o.y}) zoom ${o.zoom}`, a.max <= 1 && a.rows.length === 4, `max ${a.max.toFixed(3)} px over 4 corners`);
      }
      // the same through a real pointer drift: spring-driven camera
      await page.evaluate(() => __vc.stage.camera.release());
      await page.mouse.move(1430, 20);
      await wait(2500);
      const drift = await page.evaluate(() => ({ cam: __vc.stage.camera.read(), a: __vc.stage.test.alignment() }));
      check('print alignment while the camera drifts toward the pointer (spring 30/10)', drift.a.max <= 1 && drift.cam.x > 0.5 && drift.cam.y > 0.3, `camera (${drift.cam.x.toFixed(2)}, ${drift.cam.y.toFixed(2)}) zoom ${drift.cam.zoom.toFixed(4)}, max ${drift.a.max.toFixed(3)} px`);
      await page.mouse.move(720, 450);
      await wait(2500);
      const mid = await page.evaluate(() => __vc.stage.camera.read());
      check('camera zooms toward 1.025 with the pointer in the middle third', mid.zoom > 1.02 && mid.zoom <= 1.0251, `zoom ${mid.zoom.toFixed(4)}`);
    }

    // Acceptance 3: veil shadow darkens paper and text; glow brightens both
    {
      await page.evaluate(() => { __vc.stage.camera.set({ x: 0, y: 0, zoom: 1 }); document.querySelector('#grain').style.visibility = 'hidden'; });
      const box = await page.evaluate(() => {
        const el = document.querySelector('#print .vc-test-print');
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
      });
      const shot = async name => { await page.evaluate(() => __vc.stage.renderNow()); await wait(150); const b = await page.screenshot({ clip: { x: box.left, y: box.top, width: box.width, height: box.height } }); fs.writeFileSync(path.join(SHOTS, name), b); return b; };
      const split = lum => { const s = [...lum].sort((a, b) => a - b); const n = s.length; const text = s.slice(0, Math.floor(n * 0.04)); const paper = s.slice(Math.floor(n * 0.5)); const mean = a => a.reduce((x, y) => x + y, 0) / a.length; return { text: mean(text), paper: mean(paper) }; };
      const before = split(await regionStats(await shot('veil-test-before.png'), { left: 0, top: 0, width: box.width, height: box.height }));
      // the test print sits at x −8…16, y 4…10 on the inset sheet: centre (4, 7)
      await page.evaluate(() => __vc.stage.test.shadow({ x: 4, y: 7, r: 15, height: 20 }));
      const shadowed = split(await regionStats(await shot('veil-test-shadow.png'), { left: 0, top: 0, width: box.width, height: box.height }));
      check('test shadow in #veil darkens the paper', shadowed.paper < before.paper * 0.9, `paper ${before.paper.toFixed(1)} → ${shadowed.paper.toFixed(1)}`);
      check('… and the printed text above it', shadowed.text < before.text * 0.95, `text ${before.text.toFixed(1)} → ${shadowed.text.toFixed(1)}`);
      await page.evaluate(() => __vc.stage.test.clear());
      await page.evaluate(() => { __vc.stage.test.printDiv(); __vc.stage.test.glow({ x: 4, y: 7, r: 16, strength: 0.6 }); });
      const glowed = split(await regionStats(await shot('glow-test.png'), { left: 0, top: 0, width: box.width, height: box.height }));
      check('test glow in #glow brightens the paper', glowed.paper > before.paper * 1.03, `paper ${before.paper.toFixed(1)} → ${glowed.paper.toFixed(1)}`);
      check('… and the printed text above it', glowed.text > before.text * 1.2, `text ${before.text.toFixed(1)} → ${glowed.text.toFixed(1)}`);
      // whole-window context shots for the report
      await page.evaluate(() => { __vc.stage.test.clear(); __vc.stage.test.printDiv(); __vc.stage.test.shadow({ x: 4, y: 7, r: 15, height: 20 }); });
      await page.evaluate(() => __vc.stage.renderNow()); await wait(150);
      await page.screenshot({ path: path.join(SHOTS, 'veil-test-window.png') });
      await page.evaluate(() => { __vc.stage.test.clear(); document.querySelector('#grain').style.visibility = ''; __vc.stage.camera.release(); });
    }

    // Input: true pointer, velocity in cm/s on the paper plane, hover raycast, native cursor
    {
      const coin = await page.evaluate(() => __vc.stage.project(31.5, 20, 0.2));
      await page.mouse.move(coin.x, coin.y);
      await wait(800);
      const hov = await page.evaluate(() => __vc.stage.input());
      check('hover raycast finds the Load coin under the pointer', hov.hover === 'coin-load', `hover ${hov.hover}`);
      const exact = await page.evaluate(p => { const i = __vc.stage.input(); return { dx: i.clientX - p.x, dy: i.clientY - p.y }; }, coin);
      check('pointer position is the true position (no smoothing)', Math.abs(exact.dx) < 0.01 && Math.abs(exact.dy) < 0.01);
      const cssCursor = await page.evaluate(() => getComputedStyle(document.getElementById('print')).cursor);
      check('native cursor stays visible on the desk', cssCursor !== 'none', `cursor ${cssCursor}`);
      // Real mouse moves: Playwright spaces them in real time; read the speed while moving.
      const p0 = await page.evaluate(() => __vc.stage.project(-20, -5)), p1 = await page.evaluate(() => __vc.stage.project(20, -5));
      await page.mouse.move(p0.x, p0.y);
      await wait(300);
      const samples = await page.evaluate(async ({ p0, p1 }) => {
        // drive by script so the timing is known: 40 cm over 400 ms → 100 cm/s
        const out = [];
        const start = performance.now();
        await new Promise(res => {
          const step = () => {
            const f = Math.min(1, (performance.now() - start) / 400);
            window.dispatchEvent(new PointerEvent('pointermove', { clientX: p0.x + (p1.x - p0.x) * f, clientY: p0.y + (p1.y - p0.y) * f, pointerType: 'mouse', isPrimary: true }));
            const s = __vc.stage.input();
            if (f > 0.25 && f < 0.95) out.push(s.speed);
            if (f < 1) setTimeout(step, 4); else res();
          };
          step();
        });
        return out;
      }, { p0, p1 });
      const mean = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
      check('velocity estimate ≈ 100 cm/s for a 40 cm / 400 ms sweep (30 ms moving average)', samples.length > 3 && Math.abs(mean - 100) < 15, `mean ${mean.toFixed(1)} cm/s over ${samples.length} reads`);
      await wait(200);
      const still = await page.evaluate(() => __vc.stage.input().speed);
      check('velocity falls to 0 when the pointer stops', still === 0, `speed ${still}`);
    }

    // Frame order and quality 'flat'
    {
      const ph = await page.evaluate(() => __vc.stage.phases.join(' → '));
      check('frame loop phase order', ph === 'input → physics → scene → veil → overlays → print', ph);
      const f = await page.evaluate(() => { __vc.quality('flat'); const s = __vc.stage.stats(); const st = __vc.state(); const grain = getComputedStyle(document.querySelector('#grain .vc-grain-noise')).display; __vc.quality('high'); return { post: s.post, run: st.runMode, q: st.quality, grain }; });
      check("__vc.quality('flat') = lowest cost, no post FX, run mode stays desk", f.post.bloom === 'off' && !f.post.fxaa && f.post.msaa === 0 && f.run === 'desk' && f.q === 'flat' && f.grain === 'none', JSON.stringify(f));
      const lo = await page.evaluate(() => { __vc.quality('low'); const s = __vc.stage.stats(); return s; });
      check('Low tier: pixel ratio 1, shadow 512, bloom off, FXAA, veil 1/4', lo.scenePixelRatio === 1 && lo.shadowMap === 512 && lo.post.bloom === 'off' && lo.post.fxaa && Math.abs(lo.veilPixelRatio - 0.25) < 1e-9, JSON.stringify({ pr: lo.scenePixelRatio, sm: lo.shadowMap, post: lo.post, veil: lo.veilPixelRatio }));
      const me = await page.evaluate(() => { __vc.quality('medium'); return __vc.stage.stats(); });
      check('Medium tier: shadow 1,024, bloom half, MSAA 4, veil 1/4', me.shadowMap === 1024 && me.post.bloom === 'half' && me.post.msaa === 4 && !me.post.fxaa && Math.abs(me.veilPixelRatio - 0.25) < 1e-9);
      const hi = await page.evaluate(() => { __vc.quality('high'); return __vc.stage.stats(); });
      check('High tier: shadow 2,048, bloom full, MSAA 4, veil 1/2', hi.shadowMap === 2048 && hi.post.bloom === 'full' && hi.post.msaa === 4 && Math.abs(hi.veilPixelRatio - 0.5) < 1e-9);
    }

    // Acceptance 5: slow frames drop exactly one tier, never climb back
    {
      await page.evaluate(() => { __vc.stage.forceFrameMs(10); __vc.quality('high'); });
      await wait(1500);
      const t0 = await page.evaluate(() => ({ tier: __vc.state().quality, drops: __vc.stage.stats().governor.drops, log: __vc.stage.qualityLog.length }));
      await page.evaluate(() => __vc.stage.forceFrameMs(30));
      await page.waitForFunction(n => __vc.stage.qualityLog.length > n, t0.log, { timeout: 180000 });
      const dropped = await page.evaluate(() => ({ tier: __vc.state().quality, last: __vc.stage.qualityLog.slice(-1)[0], frames: __vc.stage.stats().frames }));
      await page.evaluate(() => __vc.stage.forceFrameMs(8));
      await wait(8000);
      const after = await page.evaluate(() => ({ tier: __vc.state().quality, log: __vc.stage.qualityLog.slice(), drops: __vc.stage.stats().governor.drops }));
      const newEntries = after.log.slice(t0.log);
      check('slow frames (30 ms for 2 s) drop exactly one tier: high → medium', dropped.tier === 'medium' && dropped.last.why === 'drop' && newEntries.length === 1, JSON.stringify(newEntries));
      check('… and it never climbs back (8 s of 8 ms frames later)', after.tier === 'medium');
      await page.evaluate(() => __vc.stage.forceFrameMs(null));
    }

    // Pause while the tab is hidden
    {
      const r = await page.evaluate(async () => {
        const s0 = __vc.stage.stats();
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
        await new Promise(r => setTimeout(r, 1500));
        const s1 = __vc.stage.stats();
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
        await new Promise(r => setTimeout(r, 1500));
        const s2 = __vc.stage.stats();
        return { rendered: s1.frames - s0.frames, skipped: s1.hiddenSkips - s0.hiddenSkips, resumed: s2.frames - s1.frames };
      });
      check('frame loop pauses while the tab is hidden and resumes after', r.rendered === 0 && r.resumed > 0, JSON.stringify(r));
    }

    // Resize (DECISIONS point 24): stays desk, framing refits
    {
      const a = await page.evaluate(() => __vc.stage.camera.read().distance);
      await page.setViewportSize({ width: 1100, height: 700 });
      await wait(800);
      const b = await page.evaluate(() => ({ d: __vc.stage.camera.read().distance, run: __vc.state().runMode, w: document.getElementById('scene').clientWidth }));
      await page.setViewportSize({ width: 880, height: 600 });
      await wait(800);
      const c = await page.evaluate(() => ({ run: __vc.state().runMode, w: document.getElementById('scene').clientWidth }));
      check('resize refits the camera and stays desk (also below 1024 × 640)', b.run === 'desk' && c.run === 'desk' && b.w === 1100 && c.w === 880 && Math.abs(a - b.d) > 0.1, `distance ${a.toFixed(1)} → ${b.d.toFixed(1)}`);
      await page.setViewportSize({ width: 1440, height: 900 });
      await wait(500);
    }

    check('no console errors on the desk page so far', errors.length === 0, errors.slice(0, 3).join(' | '));
    await context.close();

    // Acceptance 6: no console errors; heap stable over an idle run
    {
      const { page, context, errors } = await open(browser, '?mode=desk&seed=7');
      await waitStage(page);
      await page.waitForFunction(() => __vc.stage.stats().governor.phase === 'watch', null, { timeout: 120000 });
      const cdp = await context.newCDPSession(page);
      await cdp.send('HeapProfiler.enable');
      const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); const h = await cdp.send('Runtime.getHeapUsage'); return h.usedSize; };
      await wait(10000);
      const start = await heap();
      const info0 = await page.evaluate(() => __vc.stage.stats());
      const series = [start];
      const step = Math.min(60000, IDLE_MS / 5);
      for (let t = step; t <= IDLE_MS; t += step) { await wait(step); series.push(await heap()); }
      const info1 = await page.evaluate(() => __vc.stage.stats());
      const growth = series[series.length - 1] - start;
      const mb = x => (x / 1048576).toFixed(2);
      check(`heap stable over ${Math.round(IDLE_MS / 60000 * 10) / 10} min idle (after GC)`, growth < 1048576 && Math.max(...series) - Math.min(...series) < 2 * 1048576, `MB: ${series.map(mb).join(', ')}; frames ${info0.frames} → ${info1.frames}; tier ${info1.tier}`);
      check('GPU resources stable over the idle run', info0.renderer.geometries === info1.renderer.geometries && info0.renderer.textures === info1.renderer.textures, `geometries ${info1.renderer.geometries}, textures ${info1.renderer.textures}`);
      check('no console errors during the idle run', errors.length === 0, errors.slice(0, 3).join(' | '));
      await context.close();
    }

    // Flat mode untouched: no #desk, no three.js running
    {
      const { page, context, errors } = await open(browser, '?mode=flat');
      const f = await page.evaluate(() => ({ desk: !!document.getElementById('desk'), stage: !!__vc.stage, canvases: document.querySelectorAll('canvas').length, body: document.body.className, overflow: getComputedStyle(document.body).overflow }));
      check('flat mode: no #desk, no stage, no canvases, normal scrolling', !f.desk && !f.stage && f.canvases === 0 && f.overflow !== 'hidden' && errors.length === 0, JSON.stringify(f));
      await context.close();
    }
  } finally {
    await browser.close();
  }

  // Side-by-side with the reference, for the report
  try {
    const ref = await sharp(path.join(ROOT, 'reference', 'IMG_6272.png')).resize(960, 540).png().toBuffer();
    const ours = await sharp(path.join(SHOTS, 'desk-high-1440x900.png')).resize(960, 600).png().toBuffer();
    await sharp({ create: { width: 960, height: 540 + 10 + 600, channels: 3, background: '#000' } })
      .composite([{ input: ref, top: 0, left: 0 }, { input: ours, top: 550, left: 0 }])
      .png().toFile(path.join(SHOTS, 'compare-reference.png'));
  } catch (e) { console.log('compare image skipped: ' + e.message); }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
