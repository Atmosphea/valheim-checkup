// WP-16A diagnosis probe: what flashes after load, on the real GPU (Metal).
//   node tools/wp16a-probe.cjs [html path] [seconds=20] [dpr=2] [save=1] [headed=0]
// Records the composited page through a CDP screencast (mean luminance per frame, per 4×4 cell)
// and, in the page, one row per frame: tier, governor phase, reflection-cube step, excess readback,
// shadow-map size, draw calls. Writes JSON to the scratch path given by WP16_OUT (or ./wp16a-probe.json).
// Never prints anything from the save.
const path = require('node:path');
const fs = require('node:fs');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const sharp = require('sharp');
const PRIVATE = path.join(ROOT, 'fixtures', 'private');
const SAVE = fs.readFileSync(path.join(PRIVATE, fs.readdirSync(PRIVATE).find(f => f.endsWith('.fch'))));
const HTML = path.resolve(process.argv[2] || path.join(ROOT, 'dist', 'valheim-checkup.html'));
const SECS = +(process.argv[3] || 20), DPR = +(process.argv[4] || 2), WITH_SAVE = process.argv[5] !== '0', HEADED = process.argv[6] === '1';
const OUT = process.env.WP16_OUT || path.join(process.cwd(), 'wp16a-probe.json');
const ARGS = ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'];

(async () => {
  const browser = await chromium.launch({ args: ARGS, headless: !HEADED });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  if (process.env.HIDE) await page.addInitScript(h => { const css = h.split(',').map(id => `#desk > #${id}{visibility:hidden!important}`).join(''); const put = () => { if (document.getElementById('wp16hide')) return; const st = document.createElement('style'); st.id = 'wp16hide'; st.textContent = css; (document.head || document.documentElement).append(st); }; document.addEventListener('DOMContentLoaded', put); setInterval(put, 200); }, process.env.HIDE);
  await page.addInitScript(() => {
    // per-frame log, installed as soon as the stage exists
    const log = []; window.__wp16log = log;
    const t0 = performance.now();
    const hook = () => {
      const st = window.__vc?.stage;
      if (!st?.three) return requestAnimationFrame(hook);
      const th = st.three;
      let cube = null, excess = 0;
      const du = th.dressed.update.bind(th.dressed);
      th.dressed.update = () => { const r = du(); cube = r; return r; };
      const re = th.veil.readExcess?.bind(th.veil);
      if (re) th.veil.readExcess = c => { excess++; return re(c); };
      st.onPhase('print', () => {
        const s = st.stats();
        const g = window.__vc.paper?.glow?.read?.();
        log.push({ t: +(performance.now() - t0).toFixed(1), te: performance.timeOrigin + performance.now(), face: th.dressed.reflections ? 0 : 0, ms: +s.lastFrameMs.toFixed(1), tier: s.tier, gov: s.governor.phase,
          cube: cube === false || cube == null ? '' : String(cube), excess, exAny: g?.excessAny ? 1 : 0, exMax: g?.excessMax ?? 0,
          sm: s.shadowMap, pr: s.scenePixelRatio, calls: s.perFrame.calls, warm: th.warmup.state?.done ? 1 : 0, cam: th.rig.version });
        cube = null; excess = 0;
      });
    };
    requestAnimationFrame(hook);
  });
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  let tStart = 0;
  cdp.on('Page.screencastFrame', async f => {
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data });
  });
  await page.goto('file://' + HTML + '?mode=desk&seed=7');
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: 480, maxHeight: 300, everyNthFrame: 1 });
  tStart = Date.now();
  if (WITH_SAVE) {
    await page.waitForSelector('#saveFile', { state: 'attached', timeout: 30000 });
    await page.waitForFunction(() => window.__vc?.startup?.().usableMs != null, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
  }
  if (process.env.PRE) { await page.waitForFunction(() => window.__vc?.stage?.three, null, { timeout: 60000 }); await page.evaluate(process.env.PRE); }
  // a slow pointer drift (Paul has the mouse on the page)
  const until = tStart + SECS * 1000;
  let i = 0;
  while (Date.now() < until) { await page.mouse.move(700 + Math.sin(i / 9) * 200, 450 + Math.cos(i / 13) * 120); i++; await page.waitForTimeout(50); }
  await cdp.send('Page.stopScreencast');
  const log = await page.evaluate(() => window.__wp16log);
  const gl = await page.evaluate(() => __vc.stage?.stats().glRenderer);
  const qlog = await page.evaluate(() => __vc.stage?.qualityLog);
  await browser.close();
  const t0 = frames[0]?.t || 0;
  const lum = [];
  if (process.env.DUMP) fs.mkdirSync(process.env.DUMP, { recursive: true });
  for (const f of frames) {
    if (process.env.DUMP) fs.writeFileSync(path.join(process.env.DUMP, `${String(Math.round(f.t - t0)).padStart(6, '0')}.jpg`), Buffer.from(f.data, 'base64'));
    const { data, info } = await sharp(Buffer.from(f.data, 'base64')).greyscale().raw().toBuffer({ resolveWithObject: true });
    let sum = 0; const cells = new Array(16).fill(0), n = new Array(16).fill(0);
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const v = data[y * info.width + x]; sum += v;
      const c = Math.min(3, (y * 4 / info.height) | 0) * 4 + Math.min(3, (x * 4 / info.width) | 0); cells[c] += v; n[c]++;
    }
    lum.push({ te: f.t, t: +(f.t - t0).toFixed(1), mean: +(sum / data.length).toFixed(2), cells: cells.map((s, k) => +(s / n[k]).toFixed(1)) });
  }
  fs.writeFileSync(OUT, JSON.stringify({ html: HTML, dpr: DPR, gl, qlog, errors, lum, log }, null, 0));
  // summary: frame-to-frame jumps
  const jumps = [];
  for (let k = 1; k < lum.length; k++) {
    const d = lum[k].mean - lum[k - 1].mean;
    const dc = Math.max(...lum[k].cells.map((c, j) => Math.abs(c - lum[k - 1].cells[j])));
    if (Math.abs(d) > 1.5 || dc > 6) jumps.push({ t: lum[k].t, d: +d.toFixed(2), cellMax: +dc.toFixed(1) });
  }
  console.log(JSON.stringify({ gl, frames: lum.length, pageFrames: log.length, qlog, errors, jumps: jumps.length, firstJumps: jumps.slice(0, 40) }, null, 1));
})();
