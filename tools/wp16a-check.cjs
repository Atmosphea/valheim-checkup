// Builder self-check for WP-16A (Paul's feedback items 1–6). Run after the build:
//   npm run build:single && node tools/wp16a-check.cjs [all|flash|gpu|shadow|zoom|spark|desk] [html]
// Real GPU (Metal), 1440 × 900 at 2× (Paul's Mac). Paul's save from fixtures/private; the
// character name is never printed. Screenshots go to docs/reports/wp-16a/ with the name masked.
const path = require('node:path');
const fs = require('node:fs');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const sharp = require('sharp');
const PRIVATE = path.join(ROOT, 'fixtures', 'private');
const SAVE = fs.readFileSync(path.join(PRIVATE, fs.readdirSync(PRIVATE).find(f => f.endsWith('.fch'))));
const MODE = process.argv[2] || 'all';
const HTML = path.resolve(process.argv[3] || path.join(ROOT, 'dist', 'valheim-checkup.html'));
const SHOTS = path.join(ROOT, 'docs', 'reports', 'wp-16a');
const ARGS = ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'];
const DPR = +(process.env.DPR || 2);
const want = m => MODE === 'all' || MODE === m;
const results = [];
const numbers = {};
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

/** Flash thresholds (8-bit luminance of the composited page, 0–255). */
const FLASH = { meanJump: 3, cellJump: 12, bloomJump: 0.01, wholeCells: 13 };

/** macOS GPU load: ioreg's "Device Utilization %" of the GPU, sampled every 250 ms while `fn` runs. */
const { execFile } = require('node:child_process');
const gpuUtil = () => new Promise(res => execFile('ioreg', ['-r', '-d', '1', '-w', '0', '-c', 'IOAccelerator'], (e, out) => {
  const m = /"Device Utilization %"=(\d+)/.exec(out || ''); res(m ? +m[1] : NaN);
}));
async function utilDuring(fn) {
  const v = []; let on = true;
  const loop = (async () => { while (on) { v.push(await gpuUtil()); await new Promise(r => setTimeout(r, 250)); } })();
  try { await fn(); } finally { on = false; await loop; }
  const ok = v.filter(Number.isFinite);
  return ok.length ? +(ok.reduce((a, b) => a + b, 0) / ok.length).toFixed(1) : NaN;
}

async function open(browser, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR, locale: 'en-US', timezoneId: 'UTC' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error' && !/GPU stall due to ReadPixels|GL_CLOSE_PATH_NV|net::ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  if (o.init) await page.addInitScript(o.init);
  await page.goto(`file://${o.html || HTML}?mode=${o.mode || 'desk'}&seed=7`);
  return { page, ctx, errors };
}
const ready = page => page.waitForFunction(() => window.__vc?.stage?.textures?.ready?.() && __vc.stage.stats().frames > 10 && __vc.startup().usableMs !== null, null, { timeout: 60000 });
async function loadSave(page) {
  await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
  await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 20000 });
}
const idle = page => page.waitForFunction(() => !__vc.ink?.state().running && (__vc.ink?.state().ghosts ?? 0) === 0, null, { timeout: 20000 }).catch(() => {});
const select = async (page, title) => {
  await page.evaluate(t => document.querySelector(`[data-category="${t.replace(/"/g, '\\"')}"]`).click(), title);
  await page.waitForFunction(t => document.querySelector(`[data-category="${t.replace(/"/g, '\\"')}"]`)?.getAttribute('aria-current') === 'page', title, { timeout: 8000 }).catch(() => {});
};
/** Mask the character name everywhere it shows (replaced by '{name}') before a screenshot. */
const mask = page => page.evaluate(() => {
  const name = document.querySelector('#headerProfile strong')?.textContent || '';
  if (!name) return;
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) if (n.nodeValue.includes(name)) n.nodeValue = n.nodeValue.split(name).join('{name}');
  __vc.stage.markPrintDirty(); __vc.stage.renderNow();
});
const shot = async (page, name) => { await mask(page); await page.screenshot({ path: path.join(SHOTS, name) }); return name; };
/** Screen point of a paper point (cm). */
const proj = (page, x, y) => page.evaluate(([x, y]) => __vc.stage.project(x, y, 0), [x, y]);
const cam = page => page.evaluate(() => __vc.stage.camera.read());
const settle = (page, ms = 1400) => page.waitForTimeout(ms);

/** Per-frame bloom mean (the pre-pass result the mix adds to every pixel), read in the page. */
const BLOOM_PROBE = () => {
  window.__wp16bloom = [];
  const hook = () => {
    const st = window.__vc?.stage;
    if (!st?.three?.post?.targets) return requestAnimationFrame(hook);
    const th = st.three, r = th.renderer, T = th.THREE;
    let n = 0;
    st.onPhase('veil', () => {
      if (++n % 2) return; // every other frame: the read stalls the GPU
      const rt = th.post.targets().bloomRT;
      if (!rt) return;
      const w = rt.width, h = rt.height, buf = new Uint16Array(4 * 4);
      // four pixels on the right and bottom edges: where the gauntlet never is (it enters top left), so any bloom there is wash
      let s = 0;
      for (const [x, y] of [[w - 4, 2], [w >> 1, 2], [w - 4, h >> 1], [w - 4, h - 3]]) {
        r.readRenderTargetPixels(rt, x, y, 1, 1, buf);
        s += T.DataUtils.fromHalfFloat(buf[0]) + T.DataUtils.fromHalfFloat(buf[1]) + T.DataUtils.fromHalfFloat(buf[2]);
      }
      window.__wp16bloom.push({ t: performance.now(), v: s / 12 });
    });
  };
  requestAnimationFrame(hook);
};

/** Screencast the composited page; returns [{t, mean, cells[16]}]. */
async function screencast(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', f => {
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data });
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 480, maxHeight: 300, everyNthFrame: 1 });
  return {
    async stop() {
      await cdp.send('Page.stopScreencast');
      const out = [];
      for (const f of frames) {
        const { data, info } = await sharp(Buffer.from(f.data, 'base64')).greyscale().raw().toBuffer({ resolveWithObject: true });
        let sum = 0; const cells = new Array(16).fill(0), n = new Array(16).fill(0);
        for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
          const v = data[y * info.width + x]; sum += v;
          const c = Math.min(3, (y * 4 / info.height) | 0) * 4 + Math.min(3, (x * 4 / info.width) | 0); cells[c] += v; n[c]++;
        }
        out.push({ t: f.t, mean: sum / data.length, cells: cells.map((s, k) => s / n[k]), jpg: process.env.DUMP ? f.data : undefined });
      }
      return out;
    },
  };
}
/**
 * Frame-to-frame jumps in a luminance series. A jump that the next frame undoes (a flash) or that
 * repeats is what Paul saw; a single step that stays (a view's new content arriving) is counted
 * only if it is a whole-screen step over the threshold with no content change to explain it, so
 * the check compares the uniform part of the change: the median cell change.
 */
function flashes(series, from, to) {
  const out = [];
  // the uniform part of a change: the median cell change (every cell moved together)
  const med = (a, b) => { const d = b.cells.map((c, j) => c - a.cells[j]).sort((x, y) => x - y); return (d[7] + d[8]) / 2; };
  for (let k = 1; k < series.length; k++) {
    const a = series[k - 1], b = series[k];
    if (b.t < from || b.t > to) continue;
    const m = med(a, b);
    if (Math.abs(m) <= FLASH.meanJump) continue;
    // a flash moves the whole screen together (v2.0.0's moved all 16 cells by ±9.5/255); new content
    // in one view (the table emptying for the next collection) moves only the cells it covers
    const same = b.cells.filter((c, j) => Math.sign(c - a.cells[j]) === Math.sign(m) && Math.abs(c - a.cells[j]) > FLASH.meanJump / 2).length;
    if (same < FLASH.wholeCells && Math.abs(m) <= FLASH.cellJump) continue;
    // a flash comes back: within 300 ms the screen returns to (near) where it was before the jump.
    // A fade or new content is a ramp or a step that stays; a hard step over cellJump is a cut.
    let back = false;
    for (let j = k + 1; j < series.length && series[j].t - b.t < 300; j++) {
      if (Math.abs(med(a, series[j])) < Math.abs(m) * 0.35) { back = true; break; }
    }
    if (back || Math.abs(m) > FLASH.cellJump) out.push({ t: +(b.t - series[0].t).toFixed(0), median: +m.toFixed(2), back });
  }
  return out;
}

/**
 * GPU time per frame on both WebGL contexts (EXT_disjoint_timer_query_webgl2), frames per second,
 * and GPU ms per second (how hard the card works), over `ms` of wall time.
 */
async function gpuSample(page, ms, during) {
  let res;
  const util = await utilDuring(async () => { res = await gpuSample0(page, ms, during); });
  return { ...res, gpuUtilPct: util };
}
async function gpuSample0(page, ms, during) {
  await page.evaluate(() => {
    const st = __vc.stage, th = st.three;
    if (window.__wp16gpu) { window.__wp16gpu.reset(); return; }
    const mk = gl => ({ gl, ext: gl.getExtension('EXT_disjoint_timer_query_webgl2'), q: null, pend: [] });
    const A = mk(th.renderer.getContext()), B = mk(th.veil.renderer.getContext());
    const begin = c => { if (!c.ext || c.q) return; c.q = c.gl.createQuery(); c.gl.beginQuery(c.ext.TIME_ELAPSED_EXT, c.q); };
    const end = c => { if (!c.q) return; c.gl.endQuery(c.ext.TIME_ELAPSED_EXT); c.pend.push(c.q); c.q = null; };
    const res = { a: [], b: [], frames: 0, t0: performance.now() };
    const poll = c => {
      const out = [];
      while (c.pend.length) {
        const q = c.pend[0];
        if (!c.gl.getQueryParameter(q, c.gl.QUERY_RESULT_AVAILABLE)) break;
        const dis = c.gl.getParameter(c.ext.GPU_DISJOINT_EXT);
        const ns = c.gl.getQueryParameter(q, c.gl.QUERY_RESULT);
        if (!dis) out.push(ns / 1e6);
        c.gl.deleteQuery(q); c.pend.shift();
      }
      return out;
    };
    // the main context's work runs in the scene phase (and the cube face before it); the veil's in
    // the scene phase (excess readback) and the veil phase: one query per context per frame
    st.onPhase('physics', () => { res.a.push(...poll(A)); res.b.push(...poll(B)); begin(A); begin(B); res.frames++; });
    st.onPhase('overlays', () => { end(A); end(B); });
    window.__wp16gpu = { res, reset() { res.a.length = 0; res.b.length = 0; res.frames = 0; res.t0 = performance.now(); } };
  });
  const t0 = Date.now();
  if (during) await during();
  const left = ms - (Date.now() - t0);
  if (left > 0) await page.waitForTimeout(left);
  return page.evaluate(() => {
    const r = window.__wp16gpu.res, secs = (performance.now() - r.t0) / 1000;
    const n = Math.min(r.a.length, r.b.length);
    const tot = []; for (let i = 0; i < n; i++) tot.push(r.a[i] + r.b[i]);
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    const p95 = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * 0.95)] : 0; };
    return { fps: +(r.frames / secs).toFixed(1), gpuMsAvg: +avg(tot).toFixed(2), gpuMsP95: +p95(tot).toFixed(2), sceneMs: +avg(r.a).toFixed(2), veilMs: +avg(r.b).toFixed(2), gpuMsPerSec: +(avg(tot) * r.frames / secs).toFixed(0), samples: n, tier: __vc.stage.stats().tier };
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ARGS });
  const allErrors = [];
  try {
    // ── 1 · flashing: composited luminance and the bloom wash, first 20 s and view changes ──
    if (want('flash')) {
      const { page, ctx, errors } = await open(browser, { init: BLOOM_PROBE });
      allErrors.push(errors);
      const cast = await screencast(ctx, page);
      const t0 = Date.now();
      await ready(page);
      await page.waitForTimeout(1000);
      const tUsable = Date.now();
      await loadSave(page);
      // pointer drifting over the page for the rest of the first 20 s (the cube refreshes while the hand moves)
      let i = 0;
      while (Date.now() - t0 < 20000) { await page.mouse.move(700 + Math.sin(i / 9) * 260, 450 + Math.cos(i / 13) * 160); i++; await page.waitForTimeout(40); }
      const tViews = Date.now();
      for (const v of ['The Carpenter', 'The Master Chef', 'Highlights', 'The Artisan']) {
        await select(page, v);
        for (let k = 0; k < 30; k++) { await page.mouse.move(700 + Math.sin(i / 9) * 260, 450 + Math.cos(i / 13) * 160); i++; await page.waitForTimeout(40); }
      }
      const series = await cast.stop();
      const bloom = await page.evaluate(() => window.__wp16bloom);
      const sT0 = series[0].t;
      // the first lit frame (fade-in from the dark desk) is an intended change: start 0.5 s after usable
      const loadFlashes = flashes(series, sT0 + (tUsable - t0) - 500, sT0 + (tViews - t0));
      const viewFlashes = flashes(series, sT0 + (tViews - t0), Infinity);
      if (process.env.DUMP) {
        fs.mkdirSync(process.env.DUMP, { recursive: true });
        for (const f of [...loadFlashes, ...viewFlashes]) for (const fr of series) {
          const dt = fr.t - sT0 - f.t;
          if (dt > -120 && dt < 320) fs.writeFileSync(path.join(process.env.DUMP, `${String(Math.round(fr.t - sT0)).padStart(6, '0')}.jpg`), Buffer.from(fr.jpg, 'base64'));
        }
        console.log('usable at', tUsable - t0, 'ms; views at', tViews - t0);
      }
      numbers.flash = { frames: series.length, loadFlashes: loadFlashes.length, viewFlashes: viewFlashes.length, sample: [...loadFlashes, ...viewFlashes].slice(0, 6) };
      check(`flash: no whole-screen flash (jump > ${FLASH.meanJump}/255 that comes back within 300 ms, or a cut > ${FLASH.cellJump}), first 20 s (${series.length} frames)`, loadFlashes.length === 0, `${loadFlashes.length} jumps ${JSON.stringify(loadFlashes.slice(0, 4))}`);
      check(`flash: none during 4 view changes`, viewFlashes.length === 0, `${viewFlashes.length} jumps ${JSON.stringify(viewFlashes.slice(0, 4))}`);
      let bj = 0, bmax = 0;
      for (let k = 1; k < bloom.length; k++) { const d = Math.abs(bloom[k].v - bloom[k - 1].v); if (d > FLASH.bloomJump) bj++; bmax = Math.max(bmax, bloom[k].v); }
      numbers.bloom = { samples: bloom.length, jumps: bj, cornerMax: +bmax.toFixed(4) };
      check(`flash: bloom at the right and bottom edges (no gauntlet there) stays black, no jump > ${FLASH.bloomJump}`, bj === 0 && bmax < 0.01, `${bloom.length} samples, ${bj} jumps, corner max ${bmax.toFixed(4)}`);
      await ctx.close();
    }

    // ── 2 · GPU: frame time and rate, before/after in the report ──
    if (want('gpu')) {
      const baseline = await utilDuring(() => new Promise(r => setTimeout(r, 3000)));
      const { page, ctx, errors } = await open(browser);
      allErrors.push(errors);
      await ready(page); await loadSave(page); await idle(page);
      await page.evaluate(() => __vc.quality('high'));
      if (process.env.PRE) await page.evaluate(process.env.PRE);
      await page.mouse.move(720, 450);
      await page.waitForTimeout(2500);
      // "still" means settled: wait until the stage reports idle (the spark zoom has eased in and
      // 1.5 s have passed with nothing moving). v2.0.0 has no idle flag and never idles: the plain wait.
      await page.waitForFunction(() => __vc.stage.stats().idle !== false, null, { timeout: 15000 });
      await page.waitForTimeout(500);
      const still = await gpuSample(page, 5000);
      if (process.env.STILL_ONLY) { console.log('STILL', 'baseline', baseline, JSON.stringify(still), JSON.stringify(await page.evaluate(() => { const s = __vc.stage.stats(); return { pr: s.scenePixelRatio, veilPr: s.veilPixelRatio, post: s.post }; }))); await ctx.close(); return; }
      if (process.env.MOVING_ONLY) { let i = 0; const m = await gpuSample(page, 5000, async () => { const t = Date.now(); while (Date.now() - t < 5000) { await page.mouse.move(600 + Math.sin(i / 7) * 300, 450 + Math.cos(i / 11) * 200); i++; await page.waitForTimeout(16); } }); console.log('MOVING', JSON.stringify(m)); await ctx.close(); return; }
      let i = 0;
      const moving = await gpuSample(page, 5000, async () => { const t = Date.now(); while (Date.now() - t < 5000) { await page.mouse.move(600 + Math.sin(i / 7) * 300, 450 + Math.cos(i / 11) * 200); i++; await page.waitForTimeout(16); } });
      const view = await gpuSample(page, 3000, () => select(page, 'The Carpenter'));
      numbers.gpu = { baselineUtilPct: baseline, still, moving, view };
      console.log('GPU', JSON.stringify(numbers.gpu));
      if (process.env.GPU_BEFORE) {
        const b = JSON.parse(process.env.GPU_BEFORE);
        check('gpu: still desk: GPU ms per second ≤ 40 % of before', still.gpuMsPerSec <= b.still.gpuMsPerSec * 0.4, `${still.gpuMsPerSec} vs ${b.still.gpuMsPerSec} ms/s`);
        check('gpu: still desk: GPU utilisation above baseline ≤ 50 % of before', still.gpuUtilPct - baseline <= (b.still.gpuUtilPct - b.baselineUtilPct) * 0.5, `${(still.gpuUtilPct - baseline).toFixed(1)} vs ${(b.still.gpuUtilPct - b.baselineUtilPct).toFixed(1)} points`);
        // not an acceptance item (Paul asked for the numbers): the moving case is recorded, see the report's open points
        console.log(`INFO  gpu: moving pointer ${moving.gpuMsPerSec} vs ${b.moving.gpuMsPerSec} ms/s before (${Math.round(moving.gpuMsPerSec / b.moving.gpuMsPerSec * 100)} %)`);
      }
      check('gpu: moving pointer keeps ≥ 55 frames/s', moving.fps >= 55, `${moving.fps} fps`);
      await ctx.close();
    }

    // ── 3 · the blue shadow: the lifted header slip must not tint the paper above the inset ──
    if (want('shadow')) {
      const { page, ctx, errors } = await open(browser);
      allErrors.push(errors);
      await ready(page); await loadSave(page); await idle(page);
      const board = await proj(page, -30, 0);
      await page.mouse.move(board.x, board.y); await settle(page);
      // blank paper between the coins and the inset's top edge, where the ghost sat
      const sample = async () => {
        const p = await proj(page, 30, 15.4);
        const buf = await page.screenshot({ clip: { x: p.x - 6, y: p.y - 6, width: 12, height: 12 } });
        const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        let r = 0, g = 0, b = 0; const n = info.width * info.height;
        for (let i = 0; i < data.length; i += 3) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
        return { r: r / n, g: g / n, b: b / n };
      };
      const c0 = await sample();
      await page.evaluate(() => { document.querySelector('#collectionView .tablewrap').scrollTop = 960; });
      await settle(page, 2000);
      const c1 = await sample();
      await shot(page, 'scrolled-table.png');
      const br = c => c.b / c.r;
      numbers.slip = { before: c0, scrolled: c1 };
      check('blue shadow: blank paper above the inset keeps its colour when the table scrolls (blue/red within 0.03, brightness within 5 %)', Math.abs(br(c1) - br(c0)) < 0.03 && Math.abs((c1.r + c1.g + c1.b) / (c0.r + c0.g + c0.b) - 1) < 0.05,
        `b/r ${br(c0).toFixed(3)} → ${br(c1).toFixed(3)}, rgb ${[c0.r, c0.g, c0.b].map(v => v.toFixed(0))} → ${[c1.r, c1.g, c1.b].map(v => v.toFixed(0))}`);
      await ctx.close();
    }

    // ── 4 · wheel and pinch zoom; 5 · spark out frames the page ──
    // Retired in WP-17A (Paul, WP-17 item 2: no wheel or pinch zoom, the camera frames the main
    // section and zooms out over the woodblock and the header). The old block is in
    // tools/retired/wp16a-zoom-spark.cjs.txt; tools/wp17a-check.cjs camera checks the new rules.
    if (MODE === 'zoom' || MODE === 'spark') console.log('SKIP  zoom/spark: retired (Paul, WP-17 item 2); run tools/wp17a-check.cjs camera');

    // ── 6 · the desk: knots, deep grain, worn edges (a desk-only strip below the paper, measured) ──
    if (want('desk')) {
      const deskStats = async html => {
        const { page, ctx, errors } = await open(browser, { html });
        allErrors.push(errors);
        await ready(page); await loadSave(page); await idle(page);
        const board = await proj(page, -30, 0);
        await page.mouse.move(board.x, board.y); await settle(page, 1800);
        const buf = await page.screenshot({ clip: { x: 0, y: 795, width: 700, height: 95 } });
        const { data, info } = await sharp(buf).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
        const v = Array.from(data); const n = v.length; const mean = v.reduce((a, b) => a + b, 0) / n;
        const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
        const sorted = v.slice().sort((a, b) => a - b); const range = sorted[Math.floor(n * 0.98)] - sorted[Math.floor(n * 0.02)];
        // figure, not film grain: s.d. after an 8× box downsample (the #grain overlay is per-pixel noise and averages out)
        const B = 8 * DPR, cw = Math.floor(info.width / B), chh = Math.floor(info.height / B), cells = [];
        for (let cy = 0; cy < chh; cy++) for (let cx = 0; cx < cw; cx++) { let t = 0; for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) t += v[(cy * B + y) * info.width + cx * B + x]; cells.push(t / (B * B)); }
        const cm = cells.reduce((a, b) => a + b, 0) / cells.length;
        const step = Math.sqrt(cells.reduce((a, b) => a + (b - cm) ** 2, 0) / cells.length);
        await ctx.close();
        return { buf, mean: +mean.toFixed(1), sd: +sd.toFixed(2), range, figure: +step.toFixed(2) };
      };
      const after = await deskStats(HTML);
      fs.writeFileSync(path.join(SHOTS, 'desk-after.png'), after.buf);
      numbers.desk = { after: { mean: after.mean, sd: after.sd, range: after.range, figure: after.figure } };
      check('desk: the wood has deep figure (luminance spread p2–p98 ≥ 40/255)', after.range >= 40, JSON.stringify(numbers.desk.after));
      if (process.env.DESK_BEFORE) {
        const before = await deskStats(path.resolve(process.env.DESK_BEFORE));
        fs.writeFileSync(path.join(SHOTS, 'desk-before.png'), before.buf);
        numbers.desk.before = { mean: before.mean, sd: before.sd, range: before.range, figure: before.figure };
        check('desk: luminance spread (p2–p98) at least 1.5× v2.0.0', after.range >= before.range * 1.5, `${before.range} → ${after.range}`);
        check('desk: coarse figure (8× downsampled s.d.) at least 1.5× v2.0.0', after.figure >= before.figure * 1.5, `${before.figure} → ${after.figure}`);
      }
    }
  } finally {
    await browser.close();
  }
  const errs = allErrors.flat();
  check('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  const pass = results.filter(r => r.ok).length;
  console.log(`\n${pass}/${results.length} checks pass`);
  console.log('NUMBERS ' + JSON.stringify(numbers));
  process.exitCode = pass === results.length ? 0 : 1;
})();
