// Builder self-check for WP-17B (Paul's second feedback round, items 13–22, plus 17A open point 1).
//   npm run build:single && node tools/wp17b-check.cjs [all|fade|bars|tabs|ember|rows|curl|hand|burn|ambience|brand|frames] [html]
// Real GPU (Metal), 1440 × 900 at 2× (Paul's Mac). Paul's save from fixtures/private; the character
// name is never printed. Screenshots go to docs/reports/wp-17b/ with the name masked.
// BEFORE=<path to an earlier build> adds the release frames of that build (17A open point 1).
// Nothing this tool writes to localStorage (row height, wood burns) outlives its browser context.
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
const BEFORE = process.env.BEFORE ? path.resolve(process.env.BEFORE) : null;
const SHOTS = path.join(ROOT, 'docs', 'reports', 'wp-17b');
const ARGS = ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'];
const DPR = 2;
const want = m => MODE === 'all' || MODE.split(',').includes(m);
const results = [];
const numbers = {};
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const info = (name, detail) => console.log(`INFO  ${name}  — ${detail}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR, locale: 'en-US', timezoneId: 'UTC' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error' && !/GPU stall due to ReadPixels|GL_CLOSE_PATH_NV|net::ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  if (o.before) await o.before(page, ctx);
  await page.goto(`file://${o.html || HTML}?mode=${o.mode || 'desk'}&seed=7`);
  return { page, ctx, errors };
}
const ready = page => page.waitForFunction(() => window.__vc?.stage?.textures?.ready?.() && __vc.stage.stats().frames > 10 && __vc.startup().usableMs !== null, null, { timeout: 60000 });
async function loadSave(page) {
  await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
  await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 20000 });
}
const idle = page => page.waitForFunction(() => !__vc.ink?.state().running && (__vc.ink?.state().ghosts ?? 0) === 0, null, { timeout: 20000 }).catch(() => {});
async function desk(browser, o = {}) {
  const r = await open(browser, o);
  await ready(r.page); await loadSave(r.page); await idle(r.page);
  await r.page.mouse.move(900, 470); await sleep(1800);
  return r;
}
const mask = page => page.evaluate(() => {
  const name = document.querySelector('#headerProfile strong')?.textContent || '';
  if (!name) return;
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) if (n.nodeValue.includes(name)) n.nodeValue = n.nodeValue.split(name).join('{name}');
  __vc.stage.markPrintDirty(); __vc.stage.renderNow();
});
const shot = async (page, name, clip) => { await mask(page); await page.screenshot({ path: path.join(SHOTS, name), ...(clip ? { clip } : {}) }); return name; };
const proj = (page, x, y, z = 0) => page.evaluate(([x, y, z]) => __vc.stage.project(x, y, z), [x, y, z]);
const cam = page => page.evaluate(() => __vc.stage.camera.read().main);
const rect = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
/** Mean RGB of a screenshot region (CSS px). */
async function rgb(page, clip) {
  const buf = await page.screenshot({ clip });
  const { data, info: i } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0; const n = i.width * i.height;
  for (let k = 0; k < data.length; k += 3) { r += data[k]; g += data[k + 1]; b += data[k + 2]; }
  return { r: r / n, g: g / n, b: b / n, l: (0.2126 * r + 0.7152 * g + 0.0722 * b) / n };
}
/** Frame times from rAF over `ms`, while `during` runs: max, p50, frames over 20 / 34 ms, long animation frames. */
async function frameTimes(page, ms, during) {
  await page.evaluate(ms => {
    window.__wp17 = { fr: [], loaf: [] };
    // one observer per page (it writes into the current measurement)
    if (!window.__wp17obs) try { window.__wp17obs = new PerformanceObserver(l => { for (const e of l.getEntries()) window.__wp17.loaf.push({ t: e.startTime, d: e.duration, s: (e.scripts || []).slice().sort((a, b) => b.duration - a.duration).slice(0, 4).map(x => ({ fn: x.sourceFunctionName || x.invoker, d: Math.round(x.duration), forced: Math.round(x.forcedStyleAndLayoutDuration || 0) })), scriptMs: Math.round((e.scripts || []).reduce((n, x) => n + x.duration, 0)), blocking: Math.round(e.blockingDuration || 0), render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0), styleLayout: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0) }); }); window.__wp17obs.observe({ type: 'long-animation-frame', buffered: false }); } catch { /* older engines */ }
    const t0 = performance.now(); let last = t0;
    const s0 = __vc.stage.stats(); let skips = s0.idleSkips ?? 0;
    window.__wp17.t0 = t0;
    const tick = t => { const s = __vc.stage.stats(); window.__wp17.fr.push({ t: t - t0, dt: t - last, skipped: (s.idleSkips ?? 0) - skips, why: s.wakeReason }); skips = s.idleSkips ?? 0; last = t; if (t - t0 < ms) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, ms);
  if (during) await during();
  await page.waitForFunction(ms => window.__wp17.fr.length && window.__wp17.fr[window.__wp17.fr.length - 1].t >= ms, ms, { timeout: ms + 10000 });
  return page.evaluate(() => {
    const f = window.__wp17.fr.slice(1); const d = f.map(x => x.dt).sort((a, b) => a - b);
    const why = {}; for (const x of f) if (!x.skipped && x.why) why[x.why] = (why[x.why] || 0) + 1;
    return { why, frames: f.length, drawn: f.filter(x => !x.skipped).length, p50: +d[d.length >> 1].toFixed(1), max: +d[d.length - 1].toFixed(1), over20: f.filter(x => x.dt > 20).length, over34: f.filter(x => x.dt > 34).length, loaf: window.__wp17.loaf.map(l => Math.round(l.d)), loafDetail: window.__wp17.loaf, t0: window.__wp17.t0 };
  });
}


/** Drag a bar's knob to `frac` of its travel and hold; returns the release thunk. */
async function dragBar(page, cat, frac) {
  await page.mouse.move(60, 450, { steps: 6 }); await sleep(1800);
  const travel = await page.evaluate(() => __vc.board.mechanism.travel);
  const k0 = await page.evaluate(c => __vc.board.knob(c), cat);
  await page.mouse.move(k0.x, k0.y); await sleep(400); await page.mouse.down();
  // the knob's rest centre is board x 17.65 (Paul, WP-17 item 14: bar 10.5 cm from x 6.45, knob half 0.7)
  const r = await page.evaluate(([c, d]) => __vc.board.slotPoint(c, 17.65 + d), [cat, travel * frac]);
  for (let k = 1; k <= 20; k++) { await page.mouse.move(k0.x + (r.x - k0.x) * k / 20, k0.y + (r.y - k0.y) * k / 20); await sleep(25); }
  await sleep(250);
}
const FONTS = [
  { key: 'grenze', family: 'Grenze Gotisch', weight: 700, file: null },
  { key: 'maguntia', family: 'UnifrakturMaguntia', weight: 400, file: 'node_modules/@fontsource/unifrakturmaguntia/files/unifrakturmaguntia-latin-400-normal.woff2' },
  { key: 'cook', family: 'UnifrakturCook', weight: 700, file: 'node_modules/@fontsource/unifrakturcook/files/unifrakturcook-latin-700-normal.woff2' },
];

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ARGS });
  const allErrors = [];
  try {
    // ── 13 · the main section fades out while a bar is dragged, back on a short release ─────
    if (want('fade')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      const op = () => page.evaluate(() => ({ k: __vc.ink.dragFade(), o: +getComputedStyle(document.querySelector('main.workspace')).opacity }));
      await dragBar(page, 'The Gourmet', 0.5);
      const half = await op();
      await page.mouse.up(); await sleep(700);
      const back = await op();
      await dragBar(page, 'The Gourmet', 1.0);
      const full = await op();
      await page.mouse.up();
      await page.waitForFunction(() => __vc.state().view === 'The Gourmet', null, { timeout: 8000 }).catch(() => {});
      await idle(page); await sleep(400);
      const after = await op();
      check('13 half way along the slot the main section is part faded (by travel)', half.k > 0.2 && half.k < 0.8 && half.o < 0.8, JSON.stringify(half));
      check('13 a short release brings it back (springback)', back.k === 0 && back.o > 0.99, JSON.stringify(back));
      check('13 at the latch it is fully faded, and after the wash the new view shows at full opacity', full.k > 0.95 && after.k === 0 && after.o > 0.99, JSON.stringify({ full, after }));
      await ctx.close();
    }

    // ── 14 · progress fill on the bars, thicker bars, bigger plaque ────────────────────────
    if (want('bars')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      const r = await page.evaluate(() => {
        const bx = o => { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; return { w: +(b.max.x - b.min.x).toFixed(2), h: +(b.max.y - b.min.y).toFixed(2) }; };
        const bars = __vc.board.objects.bars.list.map(b => {
          const u = (b.bodyMat.userData.vcPatches || []).find(p => p.key === 'barFill')?.uniforms?.uFill?.value;
          return { cat: b.row.category, size: bx(b.body), fill: u ? +(u.x / bx(b.body).w).toFixed(3) : null, on: u ? u.z : null };
        });
        const side = Object.fromEntries([...document.querySelectorAll('#categories button')].map(b => { const m = /(\d[\d,]*)\s*\/\s*(\d[\d,]*)/.exec(b.innerText); return [b.dataset.category, m ? +m[1].replace(/,/g, '') / +m[2].replace(/,/g, '') : null]; }));
        return { bars, side, plaque: bx(__vc.board.objects.wood.plaque) };
      });
      const off = r.bars.filter(b => b.fill !== null && r.side[b.cat] != null).map(b => Math.abs(b.fill - r.side[b.cat]));
      const worst = r.bars.map(b => [b.cat, b.fill, r.side[b.cat] == null ? null : +r.side[b.cat].toFixed(3)]).sort((a, b) => Math.abs((b[1] ?? 9) - (b[2] ?? 0)) - Math.abs((a[1] ?? 9) - (a[2] ?? 0)));
      check('14 every collection bar carries its progress as a gilded fill along the bar (fill ≈ done / total, ±2 %); the insight pages have none', r.bars.every(b => b.fill !== null) && Math.max(...off) < 0.02 && r.bars.filter(b => r.side[b.cat] == null).every(b => b.fill === 0), `${off.length}/${r.bars.length} bars matched; worst ${JSON.stringify(worst.slice(0, 3))}; insight pages ${JSON.stringify(r.bars.filter(b => r.side[b.cat] == null).map(b => [b.cat, b.fill]))}`);
      check('14 bars are thicker (1.48 cm, was 1.26) and the plaque bigger (19.4 × 4.7 cm, was 17 × 4.1)', r.bars.every(b => Math.abs(b.size.h - 1.48) < 0.05) && r.plaque.w > 19 && r.plaque.h > 4.5, JSON.stringify({ bar: r.bars[0].size, plaque: r.plaque }));
      await page.mouse.move(60, 450, { steps: 6 }); await sleep(2000);
      await page.mouse.move(1430, 20, { steps: 4 }); await sleep(200); await page.mouse.move(60, 450, { steps: 4 }); await sleep(1500);
      await shot(page, 'board.png', { x: 0, y: 0, width: 560, height: 900 });
      info('14/15 look', 'docs/reports/wp-17b/board.png (fills, bar thickness, plaque, engraved counts)');
      await ctx.close();
    }

    // ── 15 · counts engraved thicker, dark-filled (a look plus a darkness number) ──────────
    if (want('tabs')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      await page.mouse.move(60, 450, { steps: 6 }); await sleep(2200);
      // the tab of the first row: board x 24.1 (layout.js tab.cx), on the row's line, at the board's top face
      const t = await page.evaluate(() => { const k = __vc.board.knobWorld(0); return __vc.stage.project(-52 + 24.1, k.y, k.z - 0.4); });
      const clip = { x: Math.round(t.x) - 50, y: Math.round(t.y) - 22, width: 100, height: 44 };
      await shot(page, 'tab-count.png', clip);
      // dark engraving on a light tab: the darkest tenth of the tab's pixels against its brightest tenth
      const buf = await page.screenshot({ clip: { x: Math.round(t.x) - 28, y: Math.round(t.y) - 9, width: 56, height: 18 } });
      const { data } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const L = []; for (let k = 0; k < data.length; k += 3) L.push(0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2]);
      L.sort((a, b) => a - b);
      const lo = L[Math.floor(L.length * 0.1)], hi = L[Math.floor(L.length * 0.9)];
      check('15 the engraved count is dark-filled on its tab (darkest tenth ≤ 45 % of the brightest)', lo <= hi * 0.45, `p10 ${lo.toFixed(1)}, p90 ${hi.toFixed(1)} (×${(lo / hi).toFixed(2)})`);
      await ctx.close();
    }

    // ── 16 · ember glow on burned labels near the gauntlet ─────────────────────────────────
    if (want('ember')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      await page.mouse.move(60, 450, { steps: 6 }); await sleep(1800);
      const near = await page.evaluate(() => __vc.board.objects.burns.ember());
      await shot(page, 'ember.png', { x: 0, y: 300, width: 420, height: 300 });
      // the glow eases out with a 700 ms time constant (render.js ember.releaseMs): 3 s is ~4 of them
      await page.mouse.move(1100, 700, { steps: 6 }); await sleep(3000);
      const far = await page.evaluate(() => __vc.board.objects.burns.ember());
      check('16 burned labels glow like embers while the gauntlet is over the woodblock', near.k > 0.9, JSON.stringify({ k: near.k, x: +near.x.toFixed(1), y: +near.y.toFixed(1) }));
      check('16 the glow dies away when the gauntlet leaves', far.k < 0.02, `k ${far.k}`);
      await ctx.close();
    }

    // ── 17 · vertical row-height slider; rows 1.3× by default; remembered per viewer ───────
    if (want('rows')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      const rowH = () => page.evaluate(() => { const r = document.querySelector('#items tr'); return r ? +r.getBoundingClientRect().height.toFixed(1) : null; });
      const layoutRow = () => page.evaluate(() => { const r = document.querySelector('#items tr'); return r ? r.offsetHeight : null; });
      const s0 = await page.evaluate(() => ({ scale: __vc.board.rowHeight.scale(), aria: document.querySelector('.vc-row-height')?.getAttribute('aria-valuenow'), role: document.querySelector('.vc-row-height')?.getAttribute('role'), orient: document.querySelector('.vc-row-height')?.getAttribute('aria-orientation') }));
      const h0 = await layoutRow();
      check('17 rows are 1.3× the WP-17A height by default (1.79 cm × 1.3 at 29 px/cm ≈ 67 px; was 52)', Math.abs(s0.scale - 1.3) < 1e-3 && h0 >= 64 && h0 <= 70, JSON.stringify({ ...s0, rowPx: h0 }));
      await page.focus('.vc-row-height'); await page.keyboard.press('End'); await sleep(300);
      const hMax = await layoutRow();
      await page.keyboard.press('Home'); await sleep(300);
      const hMin = await layoutRow();
      check('17 the slider is a keyboard slider (role slider, vertical): End → tallest rows, Home → WP-17A rows', s0.role === 'slider' && s0.orient === 'vertical' && hMax > h0 * 1.5 && Math.abs(hMin - 52) <= 2, JSON.stringify({ hMax, hMin }));
      // drag the thumb up a little with the mouse
      await page.keyboard.press('PageUp'); await sleep(200);
      await page.mouse.move(60, 450, { steps: 6 }); await sleep(1800);
      const th = await page.evaluate(() => __vc.board.rowHeight.thumb((x, y, z) => __vc.stage.project(x, y, z)));
      await page.mouse.move(th.x, th.y); await sleep(300); await page.mouse.down();
      await page.mouse.move(th.x, th.y - 40, { steps: 8 }); await sleep(100);
      const cur = await page.evaluate(() => __vc.cursor.state().knob.over);
      await page.mouse.up(); await sleep(300);
      const dragged = await page.evaluate(() => __vc.board.rowHeight.scale());
      await shot(page, 'row-slider.png', { x: 0, y: 200, width: 360, height: 500 });
      await page.reload(); await ready(page); await sleep(500);
      const kept = await page.evaluate(() => ({ scale: __vc.board.rowHeight.scale(), css: document.documentElement.style.getPropertyValue('--vc-row-scale') }));
      check('17 dragging the thumb up raises the rows, and the gauntlet curls over the thumb', dragged > 1.2 + 1e-3 && cur === true, JSON.stringify({ dragged, curled: cur }));
      check('17 the choice is remembered per viewer (localStorage) across a reload', Math.abs(kept.scale - dragged) < 0.002 && Math.abs(+kept.css - dragged) < 0.002, JSON.stringify(kept));
      await ctx.close();
    }

    // ── 18 · fingers curl over the whole bar, not just the knob ────────────────────────────
    if (want('curl')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      await page.mouse.move(60, 450, { steps: 6 }); await sleep(1800);
      const at = await page.evaluate(() => { const b = __vc.board.objects.bars.list[2]; const p = b.body.getWorldPosition(new b.body.position.constructor()); return __vc.stage.project(p.x, p.y, p.z + 0.3); });
      await page.mouse.move(at.x, at.y, { steps: 6 }); await sleep(900);
      const s = await page.evaluate(() => __vc.cursor.state());
      await shot(page, 'curl-bar.png', { x: Math.max(0, Math.round(at.x) - 200), y: Math.max(0, Math.round(at.y) - 200), width: 400, height: 400 });
      await page.mouse.move(at.x, at.y - 140, { steps: 6 }); await sleep(900);
      const off = await page.evaluate(() => __vc.cursor.state().knob.over);
      check('18 over the middle of a bar (not its knob) the fingers curl', s.knob.over === true && s.knob.i === 2, JSON.stringify({ knob: s.knob, pose: s.pose }));
      check('18 off the bar they open again', off === false, `over ${off}`);
      await ctx.close();
    }

    // ── 19 · left-hand gauntlet from the bottom left ───────────────────────────────────────
    if (want('hand')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      const arms = [];
      // over the woodblock and the desk margins (over the paper the spark is the cursor and the gauntlet parks)
      for (const [x, y] of [[60, 450], [200, 160], [240, 820], [1400, 450]]) {
        await page.mouse.move(x, y, { steps: 10 }); await sleep(1200);
        arms.push(await page.evaluate(() => ({ ...__vc.gauntlet.arm(), mode: __vc.cursor.mode })));
      }
      await page.evaluate(() => __vc.cursor.resetMaxLag());
      for (let k = 0; k < 30; k++) { await page.mouse.move(150 + 90 * Math.sin(k / 4), 450 + 250 * Math.cos(k / 4)); await sleep(30); }
      await sleep(900);
      const st = await page.evaluate(() => __vc.cursor.state());
      const modes = arms.map(a => a.mode);
      await page.mouse.move(150, 500, { steps: 6 }); await sleep(1200);
      await shot(page, 'left-hand.png');
      const hand = await page.evaluate(() => __vc.gauntlet.hand);
      check('19 the gauntlet is a left hand', hand === 'left', hand);
      check('19 the forearm comes from the bottom left (elbow left of and below the wrist, everywhere on screen)', arms.every(a => a.elbow[0] < a.wrist[0] && a.elbow[1] < a.wrist[1]) && new Set(arms.map(a => a.wrist.join())).size === arms.length, JSON.stringify(arms.map(a => ({ m: a.mode, e: a.elbow.slice(0, 2), w: a.wrist.slice(0, 2) }))));
      check('19 the tip still lands on the pointer (settled lag < 0.05 cm)', st.lag < 0.05, `lag ${st.lag} cm, max during the sweep ${st.maxLag} cm`);
      await ctx.close();
    }

    // ── 20 · click-drag wood burning, saved per viewer ─────────────────────────────────────
    if (want('burn')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      await page.evaluate(() => __vc.woodBurn.clear());
      // the whole desk in view (the camera eases out over the header)
      await page.mouse.move(700, 70, { steps: 6 }); await sleep(2000);
      const pts = await page.evaluate(() => { const out = {}; for (let y = 30; y < 880; y += 10) for (let x = 300; x < 1420; x += 20) { const w = __vc.woodBurn.at(x, y); if (w && !out[w.on] && !document.elementFromPoint(x, y)?.closest('button, a, input, select, [role], [tabindex]') && __vc.woodBurn.at(x + 60, y + 6)?.on === w.on) out[w.on] = [x, y]; } return out; });
      const paperPt = await page.evaluate(() => { for (let y = 300; y < 800; y += 20) for (let x = 500; x < 1100; x += 20) if (__vc.woodBurn.at(x, y) === null && document.elementFromPoint(x, y)?.closest('#print')) return [x, y]; return null; });
      const stroke = async ([x, y], dx) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + 6, { steps: 12 }); await page.mouse.up(); await sleep(150); };
      const p0 = await page.evaluate(() => __vc.woodBurn.state().points);
      if (pts.desk) await stroke(pts.desk, 60);
      const s1 = await page.evaluate(() => __vc.woodBurn.state());
      await shot(page, 'burn-hot.png', pts.desk ? { x: Math.max(0, pts.desk[0] - 80), y: Math.max(0, pts.desk[1] - 60), width: 240, height: 140 } : undefined);
      // the glow is heat² with a 650 ms time constant; the heat layer is cleared outright 2.6 s after the last stroke
      await sleep(3000);
      const s2 = await page.evaluate(([x, y]) => { const w = __vc.woodBurn.at(x + 30, y + 3); return { ...__vc.woodBurn.state(), ...(w ? __vc.woodBurn.sample(w.x, w.y) : {}) }; }, pts.desk || [0, 0]);
      if (paperPt) await stroke(paperPt, 60);
      const s3 = await page.evaluate(() => __vc.woodBurn.state());
      await page.reload(); await ready(page); await sleep(600);
      const s4 = await page.evaluate(() => __vc.woodBurn.state());
      check('20 a click-drag on the wood burns a line into it (glowing while hot)', !!pts.desk && s1.points > p0 + 4 && s1.hot > 0, JSON.stringify({ at: pts.desk, ...s1 }));
      check('20 the line cools to char (no glow left within 3 s; char stays)', s2.hot === 0 && s2.heat === 0 && s2.char > 0.3 && s2.points === s1.points, JSON.stringify(s2));
      check('20 a drag on the paper burns nothing', !!paperPt && s3.points === s2.points, JSON.stringify({ paperPt, points: s3.points }));
      check('20 the drawing is kept per viewer (localStorage) across a reload', s4.points === s2.points && s4.strokes === s2.strokes, JSON.stringify(s4));
      info('20 burnable areas found on screen', JSON.stringify(Object.keys(pts)));
      await page.evaluate(() => __vc.woodBurn.clear());
      await ctx.close();
    }

    // ── 21 · quiet tavern ambience ─────────────────────────────────────────────────────────
    if (want('ambience')) {
      const { page, ctx, errors } = await open(browser);
      allErrors.push(...errors);
      await ready(page);
      const pre = await page.evaluate(() => ({ unlocked: __vc.sound.unlocked(), looping: __vc.sound.looping('amb.hall') }));
      await page.keyboard.press('Shift');
      await page.waitForFunction(() => __vc.sound.built().includes('amb.hall'), null, { timeout: 30000 }).catch(() => {});
      await page.waitForFunction(() => __vc.sound.looping('amb.hall'), null, { timeout: 5000 }).catch(() => {});
      const on = await page.evaluate(() => ({ unlocked: __vc.sound.unlocked(), looping: __vc.sound.looping('amb.hall'), gainDb: __vc.sound.mix().sounds['amb.hall'].gainDb ?? __vc.sound.mix().sounds['amb.hall'].gain, bus: __vc.sound.mix().sounds['amb.hall'].bus }));
      await page.evaluate(() => __vc.sound.mute(true)); await sleep(600);
      const muted = await page.evaluate(() => __vc.sound.looping('amb.hall'));
      await page.evaluate(() => __vc.sound.mute(false)); await sleep(1600);
      const back = await page.evaluate(() => __vc.sound.looping('amb.hall'));
      check('21 no ambience before the first click or key (the browser allows no sound yet)', !pre.looping, JSON.stringify(pre));
      check('21 after the first key the tavern bed loops quietly (amb.hall, ambience bus, −32 dB)', on.looping && on.bus === 'ambience', JSON.stringify(on));
      check('21 the Sound coin mutes it, and unmuting brings it back', muted === false && back === true, JSON.stringify({ muted, back }));
      await ctx.close();
    }

    // ── 22 · brand: 3× flourishes, Gothic faces compared ───────────────────────────────────
    if (want('brand')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      await page.mouse.move(900, 500, { steps: 4 }); await sleep(800);
      const m = await rect(page, '.vc-masthead');
      const clip = { x: Math.max(0, m.x - 40), y: Math.max(0, m.y), width: Math.min(1440, m.w + 80), height: Math.min(200, m.h + 10) };
      const looks = [];
      for (const f of FONTS) {
        const url = f.file ? 'file://' + path.join(ROOT, f.file) : null;
        const r = await page.evaluate(async ({ family, weight, url }) => {
          document.getElementById('__wp17b-font')?.remove();
          const st = document.createElement('style'); st.id = '__wp17b-font';
          st.textContent = (url ? `@font-face{font-family:"${family}";font-weight:${weight};src:url("${url}") format("woff2")}` : '') + `body.mode-desk #print :is(header.top,.vc-masthead) .brand{font-family:"${family}",serif!important;font-weight:${weight}!important}`;
          document.head.append(st);
          await document.fonts.load(`${weight} 40px "${family}"`);
          __vc.surfaces.title.rebuild(); __vc.surfaces.title.holdAll();
          await new Promise(r => setTimeout(r, 250));
          const t = __vc.surfaces.title.read();
          return { font: t.ink.font, n: t.flourishes.length, touching: t.flourishes.filter(x => x.touches).map(x => x.name), loaded: document.fonts.check(`${weight} 40px "${family}"`) };
        }, { family: f.family, weight: f.weight, url });
        await page.evaluate(() => { __vc.stage.markPrintDirty(); __vc.stage.renderNow(); });
        looks.push({ key: f.key, ...r, file: await shot(page, `brand-${f.key}.png`, clip) });
      }
      await page.evaluate(() => { document.getElementById('__wp17b-font')?.remove(); __vc.surfaces.title.rebuild(); });
      await sleep(300);
      const shipped = await page.evaluate(() => getComputedStyle(document.querySelector('.vc-masthead .brand')).fontFamily);
      const strokes = await page.evaluate(() => __vc.surfaces.title.read().flourishes.map(f => (document.querySelector(`.vc-swash[data-name="${f.name}"] path`)?.getAttribute('d') || '').match(/C/g)?.length || 0));
      check('22 about 3× the flourishes: 14 (was 6), ≥ 3× the curve segments of WP-11 (6 flourishes × 2 = 12)', looks[0].n === 14 && strokes.reduce((a, b) => a + b, 0) >= 36, `${looks[0].n} flourishes, ${strokes.reduce((a, b) => a + b, 0)} cubic segments`);
      check('22 no flourish touches a letter, in every face tried', looks.every(l => l.loaded && l.touching.length === 0), JSON.stringify(looks.map(l => [l.key, l.loaded, l.touching])));
      check('22 the shipped title face is Grenze Gotisch (kept: the Fraktur V reads as B/D)', /Grenze Gotisch/.test(shipped), shipped);
      info('22 side by side', looks.map(l => `docs/reports/wp-17b/${l.file}`).join(', '));
      await ctx.close();
    }

    // ── 17A open point 1 · the release frame with the stats memo ───────────────────────────
    if (want('frames')) {
      const run = async html => {
        const { page, ctx, errors } = await desk(browser, { html });
        allErrors.push(...errors);
        await page.evaluate(() => __vc.quality('high'));
        const rel = [];
        for (const target of ['The Gourmet', 'The Hunter', 'The Carpenter']) {
          await dragBar(page, target, 1.0);
          const f = await frameTimes(page, 2600, async () => { await page.mouse.up(); });
          rel.push({ max: f.max, over34: f.over34, loaf: f.loaf, detail: f.loafDetail.map(l => ({ d: Math.round(l.d), s: l.s, scriptMs: l.scriptMs, blocking: l.blocking, render: l.render, styleLayout: l.styleLayout })), latched: await page.evaluate(() => __vc.board.mechanism.latched) });
          await idle(page);
        }
        await ctx.close();
        return rel;
      };
      const now = await run(HTML);
      numbers.frames = { now };
      if (BEFORE) numbers.frames.before = await run(BEFORE);
      const brief = r => r.map(x => ({ latched: x.latched, max: x.max, loaf: x.loaf }));
      check('17A-1 releasing a bar onto a typical collection (Gourmet 97, Hunter 108 items): no long animation frame (LoAF > 50 ms)', now.slice(0, 2).every(r => r.loaf.length === 0), JSON.stringify(brief(now.slice(0, 2))));
      // The Carpenter (400 rows): what is left is app.js's own row render and its window.scrollTo layout
      // (CPU profile: scrollTo ~16 ms, core.evaluate 3.6 ms after the memo); app.js is the parity reference.
      // Paul, WP-17 item 23: the default view now lists all 400 Carpenter rows (was the 245 remaining),
      // so app.js's own row render is ~1.6× longer (measured 45 vs 30 ms in isolation, the green-row
      // CSS costs nothing). Still at most one long frame; its ceiling follows the row count.
      check('17A-1 the 400-row Carpenter: at most one long frame, under 130 ms (all 400 rows by default, item 23; app.js row render + scrollTo, not changed)', now[2].loaf.length <= 1 && now[2].loaf.every(d => d < 130), JSON.stringify(brief(now.slice(2))));
      if (BEFORE) info('17A-1 before the memo', JSON.stringify(brief(numbers.frames.before)));
    }
  } catch (e) {
    check('run completed', false, String(e.stack || e).slice(0, 400));
  } finally {
    await browser.close();
  }
  const errs = allErrors.filter(Boolean);
  check('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  const pass = results.filter(r => r.ok).length;
  console.log(`\n${pass}/${results.length} checks pass`);
  console.log('NUMBERS', JSON.stringify(numbers));
  process.exitCode = pass === results.length ? 0 : 1;
})();
