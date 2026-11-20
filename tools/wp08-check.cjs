// Builder self-check for WP-08 and WP-09 (not a checker test). Run after the build:
//   npm run build:single && node tools/wp08-check.cjs [look|model|perf|frame|cursor|all]
// Real GPU (Metal) by default. Screenshots go to docs/reports/wp-08/. No save is loaded except
// in 'final' (name masked, never printed).
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '..');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const BASE = pathToFileURL(process.env.VC_HTML || path.join(ROOT, 'dist', 'valheim-checkup.html')).href;
const SHOTS = path.join(ROOT, 'docs', 'reports', 'wp-08');
fs.mkdirSync(SHOTS, { recursive: true });
const ARGS = ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'];
const MODE = process.argv[2] || 'all';
const ALLOWED = [/GPU stall due to ReadPixels/, /GL_CLOSE_PATH_NV/, /textures generated/];
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

async function open(browser, o = {}) {
  const context = await browser.newContext({ viewport: o.viewport || { width: 1440, height: 900 }, deviceScaleFactor: o.dpr || 1, locale: 'en-US', timezoneId: 'UTC', hasTouch: !!o.touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' || (m.type() === 'warning' && !ALLOWED.some(r => r.test(t)))) errors.push(`${m.type()}: ${t.slice(0, 200)}`); });
  page.on('pageerror', e => errors.push(String(e.stack || e).slice(0, 400)));
  await page.goto(BASE + '?mode=desk&seed=7' + (o.query || ''));
  await page.waitForFunction(() => window.__vc && __vc.stage && __vc.cursor && __vc.stage.textures.timing.done && __vc.stage.textures.warmup().done && __vc.stage.stats().frames > 5, null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  return { page, context, errors };
}
const proj = (page, x, y, z = 0) => page.evaluate(([x, y, z]) => __vc.stage.project(x, y, z), [x, y, z]);
module.exports = { open, proj, check, results, SHOTS, ARGS };

if (require.main === module) (async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (MODE === 'review' || MODE === 'all') {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
      const rp = await context.newPage();
      const rerr = [];
      rp.on('pageerror', e => rerr.push(String(e).slice(0, 300)));
      rp.on('console', m => { if (m.type() === 'error') rerr.push(m.text().slice(0, 300)); });
      await rp.goto(BASE + '?gauntlet&seed=7');
      await rp.waitForFunction(() => window.__vc?.gauntletReview?.ready, null, { timeout: 60000 });
      await rp.evaluate(() => __vc.gauntletReview.turning(false));
      for (const [i, n] of ['close', 'medium', 'desk'].entries()) {
        await rp.evaluate(i => __vc.gauntletReview.setView(i), i);
        await rp.waitForTimeout(300);
        await rp.screenshot({ path: path.join(SHOTS, `review-${n}.png`) });
      }
      await rp.evaluate(() => { __vc.gauntletReview.setView(0); __vc.gauntletReview.setWire(true); });
      await rp.waitForTimeout(300);
      await rp.screenshot({ path: path.join(SHOTS, 'review-close-wire.png') });
      await rp.evaluate(() => __vc.gauntletReview.setWire(false));
      const pen = {};
      for (const n of ['hover', 'point', 'pinchReady', 'pinch', 'stretch', 'release', 'receive']) {
        await rp.evaluate(n => __vc.gauntletReview.setPose(n), n);
        pen[n] = await rp.evaluate(() => __vc.gauntletReview.penetrations().length);
        if (n === 'pinch' || n === 'stretch' || n === 'release') { await rp.waitForTimeout(200); await rp.screenshot({ path: path.join(SHOTS, `review-pose-${n}.png`) }); }
      }
      check('review: no plate passes through another in any pose (in the browser)', Object.values(pen).every(v => v === 0), JSON.stringify(pen));
      const t0 = await rp.evaluate(() => __vc.gauntletReview.triangles());
      await rp.evaluate(() => __vc.gauntletReview.setLOD(1));
      const t1 = await rp.evaluate(() => __vc.gauntletReview.triangles());
      check('review: LOD0 80k–150k triangles, LOD1 lower', t0 >= 80000 && t0 <= 150000 && t1 < t0, `LOD0 ${t0}, LOD1 ${t1}`);
      check('review: rivets ≈ 60', Math.abs((await rp.evaluate(() => __vc.gauntletReview.rivets)) - 60) <= 4, String(await rp.evaluate(() => __vc.gauntletReview.rivets)));
      check('review: no console errors', rerr.length === 0, rerr.slice(0, 2).join(' | '));
      await context.close();
      if (MODE === 'review') return;
    }
    const { page, errors } = await open(browser);
    if (MODE === 'model' || MODE === 'all') {
      const g = await page.evaluate(() => ({ bones: __vc.gauntlet.bones(), tris: __vc.gauntlet.triangles(), lod: __vc.gauntlet.lod(), rivets: __vc.gauntlet.rivets, buildMs: __vc.gauntlet.buildMs, q: __vc.quality() }));
      check('19 bones', g.bones === 19, String(g.bones));
      check(`LOD0 on ${g.q}: 80k–150k triangles`, g.lod === 0 && g.tris >= 80000 && g.tris <= 150000, `${g.tris} tris, built in ${g.buildMs} ms`);
      await page.evaluate(() => __vc.quality('low')); await page.waitForTimeout(300);
      const low = await page.evaluate(() => ({ tris: __vc.gauntlet.triangles(), lod: __vc.gauntlet.lod() }));
      check('Low: LOD1 (no subdivision)', low.lod === 1 && low.tris < g.tris, `${low.tris} tris`);
      await page.evaluate(q => __vc.quality(q), g.q); await page.waitForTimeout(300);
      const bloom = await page.evaluate(() => { const s = __vc.stage.three; const g = s.gauntlet.model; return { steel: g.steelMeshes.every(m => m.layers.isEnabled(1)), leather: !g.leather.layers.isEnabled(1), proxies: g.proxies.every(p => p.layers.mask === 4) }; });
      check('bloom layer on plates and rivets, not leather; shadow proxy on its own layer', bloom.steel && bloom.leather && bloom.proxies, JSON.stringify(bloom));
    }
    if (MODE === 'perf' || MODE === 'all') {
      // GPU + CPU cost of the gauntlet: forced renders (each synced with a 1-pixel read) with the
      // gauntlet shown vs hidden, the controller's own per-frame time measured inside the page
      const k = await page.evaluate(() => __vc.board.knob('The Hunter'));
      await page.mouse.move(k.x, k.y); await page.waitForTimeout(500);
      const r = await page.evaluate(async k => {
        const s = __vc.stage.three, gl = s.renderer.getContext(), px = new Uint8Array(4);
        let i = 0;
        // moving: a real pointermove (5 px) before every frame, so the hand moves ~0.4 cm a frame
        const move = on => { if (!on) return; i++; const x = k.x + 40 * Math.sin(i / 8), y = k.y + 30 * Math.cos(i / 11); dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerType: 'mouse', bubbles: true })); };
        const run = (n, moving) => { const t0 = performance.now(); for (let j = 0; j < n; j++) { move(moving); __vc.stage.renderNow(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return (performance.now() - t0) / n; };
        run(10, false);
        const acc = { stillOn: [], stillOff: [], movingOn: [], movingOff: [] };
        for (let r = 0; r < 10; r++) for (const key of Object.keys(acc)) {
          s.gauntlet.root.visible = key.endsWith('On');
          acc[key].push(run(15, key.startsWith('moving')));
        }
        s.gauntlet.root.visible = true;
        const med = a => a.sort((x, y) => x - y)[a.length >> 1];
        return { still: med(acc.stillOn) - med(acc.stillOff), moving: med(acc.movingOn) - med(acc.movingOff), base: med(acc.stillOff), q: __vc.quality(), refreshes: s.dressed.reflections?.state };
      }, k);
      const cpu = await page.evaluate(() => {
        const c = __vc.stage.three.gauntlet, T = __vc.stage.three.THREE, tip = new T.Vector3(-30, 0, 7), q = new T.Quaternion();
        const t0 = performance.now(); for (let i = 0; i < 200; i++) { tip.x = -30 + (i % 10) * 0.1; c.place(tip, q); } return (performance.now() - t0) / 200;
      });
      check(`gauntlet < 3 ms per frame on ${r.q}, hand still (hover)`, r.still + cpu < 3, `${r.still.toFixed(2)} ms render + ${cpu.toFixed(3)} ms arm solve (frame without gauntlet ${r.base.toFixed(2)} ms)`);
      check(`gauntlet < 3 ms per frame on ${r.q}, hand moving`, r.moving + cpu < 3, `${r.moving.toFixed(2)} ms render + ${cpu.toFixed(3)} ms arm solve`);
    }
    if (MODE === 'frame' || MODE === 'all') {
      // every hand position over the board: the vambrace's elbow end is off-screen (left or top),
      // and no plate covers printed text (DECISIONS point 2)
      const res = await page.evaluate(async () => {
        const s = __vc.stage.three, THREE = s.THREE, g = s.gauntlet;
        const visible = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0 || cs.color === 'rgba(0, 0, 0, 0)') return false; } return true; };
        const texts = [];
        const walker = document.createTreeWalker(document.querySelector('#print'), NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent.trim() || !visible(n.parentElement)) continue;
          const r = document.createRange(); r.selectNodeContents(n);
          for (const b of r.getClientRects()) if (b.width > 1 && b.height > 1) texts.push({ b, t: n.textContent.trim().slice(0, 30) });
        }
        const pts = [];
        for (const m of g.model.steelMeshes) {
          if (m.isInstancedMesh) continue;
          const p = m.geometry.attributes.position;
          const step = Math.max(1, Math.floor(p.count / 300));
          for (let i = 0; i < p.count; i += step) pts.push([m, i]);
        }
        const v = new THREE.Vector3(), elbow = new THREE.Vector3();
        let offscreen = 0, total = 0;
        const hits = new Map();
        const W = innerWidth, H = innerHeight;
        for (let x = -43; x <= -17; x += 4) for (let y = -19; y <= 15; y += 4) {
          const tip = new THREE.Vector3(x, y, 7);
          const yaw = Math.atan2(y - 22, x + 78) - 4 * Math.PI / 180;
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 18 * Math.PI / 180, yaw, 'ZYX'));
          g.rig.setPose({ hover: 1 });
          g.place(tip, q);
          total++;
          // vambrace end ring at the elbow (forearm x ≈ 1.5 cm in from the elbow), 12 points
          let allOut = true;
          for (let k = 0; k < 12; k++) {
            const a = k / 12 * Math.PI * 2;
            elbow.set(1.5, Math.cos(a) * 5.3, Math.sin(a) * 3.9);
            g.model.bones.forearm.localToWorld(elbow);
            const p = __vc.stage.project(elbow.x, elbow.y, elbow.z);
            if (p.x >= 0 && p.y >= 0 && p.x <= W && p.y <= H) allOut = false;
          }
          if (allOut) offscreen++;
          for (const [m, i] of pts) {
            v.fromBufferAttribute(m.geometry.attributes.position, i);
            m.localToWorld(v);
            const p = __vc.stage.project(v.x, v.y, v.z);
            for (const t of texts) if (p.x >= t.b.left && p.x <= t.b.right && p.y >= t.b.top && p.y <= t.b.bottom) hits.set(t.t, (hits.get(t.t) ?? 0) + 1);
          }
        }
        return { offscreen, total, hits: [...hits.entries()].slice(0, 12), texts: texts.length };
      });
      check('vambrace leaves the frame (upper left) in every hand position over the board', res.offscreen === res.total, `${res.offscreen}/${res.total}`);
      check('no plate over printed text in any hand position over the board', res.hits.length === 0, `${res.texts} text boxes; hits ${JSON.stringify(res.hits)}`);
    }
    if (MODE === 'shadow' || MODE === 'all') {
      // WP-07 item 5 with the real gauntlet: its shadow (proxy → veil) darkens the printed text and
      // the paper alike. The hand waits at the board's right wall while the spark is out.
      const p = await proj(page, -6, 9, 0);
      await page.mouse.move(p.x, p.y, { steps: 6 }); await page.waitForTimeout(1200);
      const a = await proj(page, -15, 14, 0), b = await proj(page, 4, 2, 0);
      const clip = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
      await page.evaluate(() => __vc.stage.renderNow());
      const on = await page.screenshot({ clip });
      fs.writeFileSync(path.join(SHOTS, 'shadow-on-text.png'), on);
      await page.evaluate(() => { __vc.stage.three.gauntlet.root.visible = false; __vc.stage.renderNow(); });
      const off = await page.screenshot({ clip });
      fs.writeFileSync(path.join(SHOTS, 'shadow-off-text.png'), off);
      await page.evaluate(() => { __vc.stage.three.gauntlet.root.visible = true; __vc.stage.renderNow(); });
      // mean brightness of both crops, decoded in the page
      const m = await page.evaluate(async ([x, y]) => {
        const mean = async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return s / (d.length / 4); };
        return { on: await mean(x), off: await mean(y) };
      }, [on.toString('base64'), off.toString('base64')]);
      check('WP-07 item 5: the real gauntlet\'s shadow darkens the printed heading and the paper beside it', m.on < m.off - 3, `mean ${m.on.toFixed(1)} with the hand vs ${m.off.toFixed(1)} without (docs/reports/wp-08/shadow-on-text.png)`);
    }
    if (MODE === 'final') {
      // the end-of-session desktop screenshot vs reference/IMG_6272.png: Paul's save loaded, the
      // character name masked (never printed), the gauntlet on the Master Chef knob
      const PRIVATE = path.join(ROOT, 'fixtures', 'private');
      const SAVE = path.join(PRIVATE, fs.readdirSync(PRIVATE).find(f => f.endsWith('.fch')));
      await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: fs.readFileSync(SAVE) });
      await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast').textContent), null, { timeout: 60000 });
      await page.evaluate(() => document.getElementById('toast').classList.add('hidden'));
      for (let i = 0; i < 3; i++) { const k = await page.evaluate(() => __vc.board.knob('The Master Chef')); await page.mouse.move(k.x + 30, k.y - 20, { steps: 4 }); await page.waitForTimeout(700); }
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(SHOTS, 'desk-final-1440.png'), mask: [page.locator('#headerProfile strong')] });
      check('final screenshot written (name masked)', true, 'docs/reports/wp-08/desk-final-1440.png');
    }
    if (MODE === 'crop') {
      const b = await proj(page, 30, -10, 0);
      await page.mouse.move(b.x, b.y, { steps: 5 });
      await page.waitForTimeout(1500);
      const a = await proj(page, -44, 16, 3), c = await proj(page, -16, -20, 3);
      await page.screenshot({ path: path.join(SHOTS, 'crop-board.png'), clip: { x: a.x - 10, y: a.y - 10, width: c.x - a.x + 20, height: c.y - a.y + 20 } });
    }
    if (MODE === 'look' || MODE === 'all') {
      const k = await page.evaluate(() => __vc.board.knob('The Artisan'));
      await page.mouse.move(k.x + 40, k.y - 60, { steps: 10 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SHOTS, 'look-hover.png') });
      await page.mouse.move(k.x, k.y, { steps: 10 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SHOTS, 'look-knob.png') });
      console.log(JSON.stringify(await page.evaluate(() => __vc.cursor.state())));
      const b = await proj(page, 10, 0, 0);
      await page.mouse.move(b.x, b.y, { steps: 12 });
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(SHOTS, 'look-spark.png') });
      console.log(JSON.stringify(await page.evaluate(() => __vc.cursor.state())));
      check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    }
  } finally { await browser.close(); }
  const bad = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} passed`);
  process.exitCode = bad ? 1 : 0;
})();
