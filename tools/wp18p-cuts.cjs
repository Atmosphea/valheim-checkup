// WP-18P: what each effect costs, for Paul's "what can be cut" list. Real GPU, 1440 × 900, High,
// governor frozen. For each variant (one effect switched off in the page, nothing changed in the
// build), a fresh page runs two workloads:
//   drag: 5 s of pointer motion over the desk (the 3D layers render every frame)
//         → JS ms per frame (the clock's work), GPU ms per frame (timer queries: scene, veil;
//           they overstate on ANGLE/Metal, so read them as differences), late frames
//   view: Gourmet → The Carpenter (the biggest table) until the wash is done
//         → late frames (> 18.7 ms), worst frame
//
//   node tools/wp18p-cuts.cjs [html] [--dsf=2] [--only=a,b]
const path = require('node:path');
const fs = require('node:fs');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const PRIVATE = path.join(ROOT, 'fixtures', 'private');
const SAVE = fs.readFileSync(path.join(PRIVATE, fs.readdirSync(PRIVATE).find(f => f.endsWith('.fch'))));
const argv = process.argv.slice(2);
const flag = (k, d) => { const a = argv.find(x => x.startsWith(`--${k}`)); return a ? a.split('=')[1] : d; };
const HTML = path.resolve(argv.find(a => !a.startsWith('--')) || path.join(ROOT, 'work', 'wp18p', 'named-after', 'valheim-checkup.html'));
const DSF = +flag('dsf', 1);
const ONLY = flag('only', '') ? flag('only').split(',') : null;
const OUT = path.join(ROOT, 'docs', 'reports', 'wp-18p', `cuts-dsf${DSF}.json`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Each variant switches one thing off in the running page (or, `media`, emulates a setting). */
const VARIANTS = [
  ['all on (High)', null],
  ['bloom (glow on the spark and embers)', () => { const t = __vc.stage.three; t.post.setTier({ bloom: 'off', antialias: 'MSAA', msaaSamples: 4 }); }],
  ['MSAA 4× (edge smoothing of the 3D layer)', () => { const t = __vc.stage.three; t.post.setTier({ bloom: 'half', antialias: 'none', msaaSamples: 0 }); }],
  ['shadow maps (lamp shadows, both 3D layers)', () => { const t = __vc.stage.three; for (const r of [t.renderer, t.veil.renderer]) { r.shadowMap.enabled = false; } t.scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; }); }],
  ['gauntlet reflection cube', () => { __vc.stage.three.dressed.reflections?.setTier({ cubePx: 0, cubeEveryNthFrame: 0 }); }],
  ['veil (lamp light and shadow on the printed page)', () => { const v = __vc.stage.three.veil; v.render = () => {}; document.getElementById('veil').style.display = 'none'; }],
  ['film grain and vignette overlay', () => { __vc.stage.three.overlays.setGrain(false); }],
  ['printed icons\' sepia filter and multiply blend', () => { const s = document.createElement('style'); s.textContent = '#print .vc-icon, #print .vc-icon * { filter: none !important; mix-blend-mode: normal !important; }'; document.head.append(s); }],
  ['ink wash and other motion (reduced motion)', 'reduce'],
];

async function run(browser, name, toggle) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DSF, locale: 'en-US', timezoneId: 'UTC', reducedMotion: toggle === 'reduce' ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.goto(`file://${HTML}?mode=desk&seed=7`);
  await page.waitForFunction(() => window.__vc?.stage?.textures?.ready?.() && __vc.stage.stats().frames > 10 && __vc.startup().usableMs !== null, null, { timeout: 120000 });
  await page.evaluate(() => { __vc.quality('high'); __vc.stage.holdGovernor?.(true); __vc.stage.forceFrameMs(10); });
  await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
  await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 30000 });
  await page.waitForFunction(() => !__vc.ink.state().running, null, { timeout: 30000 }).catch(() => {});
  if (typeof toggle === 'function') await page.evaluate(toggle);
  await sleep(1500);
  // ── drag ──
  await page.evaluate(() => {
    window.__m = { iv: [], js: [], gs: [], gv: [] };
    let last = 0;
    const f = w => { if (!window.__m.stop) { if (last) { const s = __vc.stage.stats(); window.__m.iv.push(w - last); window.__m.js.push(__vc.clock.work().last); const g = s.governor.gpuParts || []; if (g[0] != null) window.__m.gs.push(g[0]); if (g[1] != null) window.__m.gv.push(g[1]); } last = w; requestAnimationFrame(f); } };
    requestAnimationFrame(f);
  });
  for (let k = 0; k < 300; k++) { await page.mouse.move(250 + (k * 37) % 950, 200 + (k * 53) % 550); await sleep(16); }
  const drag = await page.evaluate(() => { window.__m.stop = true; return window.__m; });
  // ── view ──
  const nav = t => page.evaluate(t => document.querySelector(`#categories [data-category="${t}"], #insightNav [data-category="${t}"]`).click(), t);
  await nav('The Gourmet');
  await page.waitForFunction(() => !__vc.ink.state().running, null, { timeout: 30000 }).catch(() => {});
  await sleep(1200);
  await page.evaluate(() => { window.__v = []; let last = 0; window.__vstop = false; const f = w => { if (window.__vstop) return; if (last) window.__v.push(w - last); last = w; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await nav('The Carpenter');
  await sleep(300);
  await page.waitForFunction(() => !__vc.ink.state().running, null, { timeout: 30000 }).catch(() => {});
  const view = await page.evaluate(() => { window.__vstop = true; return window.__v; });
  await ctx.close();
  const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.floor(s.length / 2)].toFixed(2); };
  const mean = a => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null);
  return {
    name, errors,
    drag: { frames: drag.iv.length, late: drag.iv.filter(x => x > 18.7).length, jsMean: mean(drag.js), gpuSceneMed: med(drag.gs), gpuVeilMed: med(drag.gv) },
    view: { frames: view.length, late: view.filter(x => x > 18.7).length, worst: +Math.max(...view).toFixed(1) },
  };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
  const rows = [];
  try {
    for (const [name, toggle] of VARIANTS) {
      if (ONLY && !ONLY.some(o => name.includes(o))) continue;
      const r = await run(browser, name, toggle);
      rows.push(r);
      console.log(JSON.stringify(r));
    }
  } finally { await browser.close(); }
  fs.writeFileSync(OUT, JSON.stringify({ dsf: DSF, html: path.relative(ROOT, HTML), rows }, null, 1));
  console.log(`\n| Switched off | Drag JS ms/frame | Drag GPU scene / veil ms (median) | Drag late frames | Carpenter view late / worst ms |\n| --- | --- | --- | --- | --- |`);
  for (const r of rows) console.log(`| ${r.name} | ${r.drag.jsMean} | ${r.drag.gpuSceneMed} / ${r.drag.gpuVeilMed} | ${r.drag.late} / ${r.drag.frames} | ${r.view.late} / ${r.view.frames} · ${r.view.worst} |`);
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
})();
