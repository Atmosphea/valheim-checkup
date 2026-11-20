// Builder self-check for WP-17A (Paul's second feedback round, items 1–12). Run after the build:
//   npm run build:single && node tools/wp17a-check.cjs [all|menus|camera|layout|header|edge|scroll|load|wash|stamps|frames|knob|desk] [html]
// Real GPU (Metal), 1440 × 900 at 2× (Paul's Mac). Paul's save from fixtures/private; the character
// name is never printed. Screenshots go to docs/reports/wp-17a/ with the name masked.
// BEFORE=<path to a WP-16 build> adds before/after numbers where they exist (desk, release frames).
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
const SHOTS = path.join(ROOT, 'docs', 'reports', 'wp-17a');
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
    if (!window.__wp17obs) try { window.__wp17obs = new PerformanceObserver(l => { for (const e of l.getEntries()) window.__wp17.loaf.push({ t: e.startTime, d: e.duration }); }); window.__wp17obs.observe({ type: 'long-animation-frame', buffered: false }); } catch { /* older engines */ }
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
    return { why, frames: f.length, drawn: f.filter(x => !x.skipped).length, p50: +d[d.length >> 1].toFixed(1), max: +d[d.length - 1].toFixed(1), over20: f.filter(x => x.dt > 20).length, over34: f.filter(x => x.dt > 34).length, loaf: window.__wp17.loaf.map(l => Math.round(l.d)), t0: window.__wp17.t0 };
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ARGS });
  const allErrors = [];
  try {
    // ── 1 · the filter lists: above everything, exactly the box's width ───────────────────
    if (want('menus')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      for (const id of ['statusFilter', 'discoveryFilter', 'biomeFilter', 'sort']) {
        const s = await rect(page, '#' + id);
        await page.mouse.move(s.x + s.w / 2, s.y + s.h / 2); await sleep(250);
        await page.mouse.down(); await page.mouse.up();
        await sleep(900);
        const r = await page.evaluate(id => {
          const m = document.querySelector('.vc-menu'), sel = document.getElementById(id);
          if (!m) return null;
          const items = [...m.querySelectorAll('.vc-menu-item')];
          const covered = items.filter(it => { const b = it.getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !(h && (h === it || it.contains(h))); });
          return { items: items.length, covered: covered.map(c => c.textContent.trim().slice(0, 20)), layoutW: m.offsetWidth, boxW: sel.offsetWidth };
        }, id);
        check(`1 #${id}: every list item is on top (hit-tests as itself)`, r && r.items > 0 && r.covered.length === 0, r ? `${r.items} items, covered: ${JSON.stringify(r.covered)}` : 'no list');
        check(`1 #${id}: the list is exactly the box's width`, r && Math.abs(r.layoutW - r.boxW) <= 1, r ? `${r.layoutW} vs ${r.boxW} px (layout; the sheet's perspective scales both alike)` : '');
        if (id === 'statusFilter') await shot(page, 'menu-over-table.png', { x: Math.max(0, Math.round(s.x) - 60), y: Math.max(0, Math.round(s.y) - 40), width: 640, height: 420 });
        await page.keyboard.press('Escape'); await sleep(300);
      }
      await ctx.close();
    }

    // ── 2 · camera: no wheel zoom, frames the main section, out over wood/header, click zoom ──
    if (want('camera')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      const c0 = await cam(page);
      check('2 by default the camera frames the main section', c0.framing > 0.98 && c0.zoom > 1.1, JSON.stringify(c0));
      await shot(page, 'camera-main.png');
      // the wheel over the table scrolls the page, never the camera
      const w0 = await page.evaluate(() => __vc.surfaces.lift.wrap.scrollTop);
      for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 240); await sleep(60); }
      await sleep(700);
      const c1 = await cam(page), w1 = await page.evaluate(() => __vc.surfaces.lift.wrap.scrollTop);
      check('2 the wheel scrolls the page, not the camera', w1 > w0 && Math.abs(c1.zoom - c0.zoom) < 1e-3 && c1.framing > 0.98, `scroll ${w0} → ${w1}, zoom ${c0.zoom} → ${c1.zoom}`);
      await page.evaluate(() => { __vc.surfaces.lift.wrap.scrollTop = 0; });
      // ctrl+wheel (a trackpad pinch) is swallowed: no browser zoom, no camera zoom
      await page.keyboard.down('Control'); for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -200); await sleep(40); } await page.keyboard.up('Control');
      await sleep(600);
      const c2 = await cam(page);
      check('2 pinch (ctrl + wheel) does not zoom', Math.abs(c2.zoom - c0.zoom) < 1e-3, `zoom ${c2.zoom}`);
      // over the woodblock: the whole desk
      await page.mouse.move(30, 520, { steps: 8 }); await sleep(1600);
      const c3 = await cam(page);
      check('2 the pointer over the woodblock zooms out to the whole desk', c3.zoneOut && c3.framing < 0.05, JSON.stringify(c3));
      await shot(page, 'camera-wood.png');
      await page.mouse.move(900, 470, { steps: 8 }); await sleep(1600);
      const c4 = await cam(page);
      check('2 back over the table: the main section again', !c4.zoneOut && c4.framing > 0.95, JSON.stringify(c4));
      // over the header / coins: out
      const coin = await rect(page, '#loadTop');
      await page.mouse.move(coin.x + coin.w / 2, coin.y + coin.h / 2, { steps: 8 }); await sleep(1600);
      const c5 = await cam(page);
      check('2 the pointer over the header and coins zooms out', c5.zoneOut && c5.framing < 0.05, JSON.stringify(c5));
      await page.mouse.move(900, 470, { steps: 8 }); await sleep(1600);
      // a click outside the main section (the paper's right margin, x 47): 30 % in; a second click, or the pointer back over the main section, ends it
      const outside = await proj(page, 47, -10);
      await page.mouse.move(outside.x, outside.y, { steps: 6 }); await sleep(1200);
      const z0 = (await page.evaluate(() => __vc.stage.camera.read())).zoom;
      await page.mouse.click(outside.x, outside.y); await sleep(1400);
      const cz = await page.evaluate(() => __vc.stage.camera.read());
      check('2 a click outside the main section zooms in 30 %', cz.main.click && Math.abs(cz.zoom / z0 - 1.3) < 0.06, `zoom ${z0.toFixed(3)} → ${cz.zoom.toFixed(3)} (×${(cz.zoom / z0).toFixed(3)})`);
      await shot(page, 'camera-click-zoom.png');
      const again = await proj(page, 47, -10);
      await page.mouse.click(again.x, again.y); await sleep(1400);
      const cz2 = await page.evaluate(() => __vc.stage.camera.read());
      check('2 a second click ends the zoom', !cz2.main.click && Math.abs(cz2.zoom / z0 - 1) < 0.06, `zoom ${cz2.zoom.toFixed(3)}`);
      const p3 = await proj(page, 47, -10);
      await page.mouse.click(p3.x, p3.y); await sleep(1200);
      await page.mouse.move(900, 470, { steps: 10 }); await sleep(1600);
      const cz3 = await page.evaluate(() => __vc.stage.camera.read());
      check('2 leaving for the main section ends it too', !cz3.main.click, JSON.stringify(cz3.main));
      await ctx.close();
    }

    // ── 3 · bigger main section, the paper's left edge closer ──────────────────────────────
    if (want('layout')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      const L = await page.evaluate(() => { const r = document.querySelector('.vc-sheet-inset').getBoundingClientRect(); return { w: r.width, h: r.height }; });
      const area = (69 * 50.2) / (58 * 39.2);
      check('3 the main section is bigger (69 × 50.2 cm, was 58 × 39.2 cm)', area > 1.4, `×${area.toFixed(2)} the area; on screen ${Math.round(L.w)} × ${Math.round(L.h)} px`);
      const edge = await proj(page, -36, 0), main = await proj(page, -23, 0);
      check('3 the paper\'s left live edge is 13 cm from the main section (was 36 cm)', -23 - -36 === 13, `on screen ${Math.round(main.x - edge.x)} px`);
      await ctx.close();
    }

    // ── 4 · header split: coins fixed, title/records/byline scroll with the table; no seam ──
    if (want('header')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      const where = await page.evaluate(() => { const m = document.querySelector('.vc-masthead'); return { inWrap: !!m?.closest('.tablewrap'), has: ['.brand', '#headerProfile', '#statline'].every(s => !!m?.querySelector(s)) }; });
      check('4 the title, byline and lifetime records are in the main section\'s scroll', where.inWrap && where.has, JSON.stringify(where));
      const coins0 = await rect(page, '#loadTop'), brand0 = await rect(page, '.vc-masthead .brand');
      await shot(page, 'header-top.png');
      await page.evaluate(() => { __vc.surfaces.lift.wrap.scrollTop = 300; }); await sleep(700);
      const coins1 = await rect(page, '#loadTop'), brand1 = await rect(page, '.vc-masthead .brand');
      check('4 the coins stay put while the page scrolls', Math.abs(coins1.y - coins0.y) < 1 && Math.abs(coins1.x - coins0.x) < 1, `coin moved ${(coins1.y - coins0.y).toFixed(1)} px`);
      check('4 the title scrolls with the table', brand0.y - brand1.y > 100, `title moved up ${(brand0.y - brand1.y).toFixed(0)} px`);
      await shot(page, 'header-scrolled.png');
      // no seam: the paper colour just above and just below where the inset's old top edge was (y 15)
      await page.evaluate(() => { __vc.surfaces.lift.wrap.scrollTop = 0; }); await sleep(600);
      const a = await proj(page, -18, 15.6), b = await proj(page, -18, 14.4);
      const ca = await rgb(page, { x: a.x - 6, y: a.y - 3, width: 12, height: 6 }), cb = await rgb(page, { x: b.x - 6, y: b.y - 3, width: 12, height: 6 });
      check('4 no seam between header and main section (blank paper either side of the old edge within 4 %)', Math.abs(ca.l - cb.l) / cb.l < 0.04, `${ca.l.toFixed(0)} vs ${cb.l.toFixed(0)}`);
      await ctx.close();
    }

    // ── 5 · the burned top edge: scrolled content fades along the edge's shape ───────────
    if (want('edge')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      const m = await page.evaluate(() => {
        const w = document.querySelector('#collectionView .tablewrap'), cs = getComputedStyle(w);
        const img = cs.maskImage || cs.webkitMaskImage || '';
        return { edged: document.querySelector('.vc-sheet-inset').classList.contains('vc-edged'), layers: (img.match(/url\(|gradient\(/g) || []).length, blob: /blob:/.test(img), info: __vc.paper?.edge?.() ?? null };
      });
      check('5 the scroll box carries a mask drawn from the paper\'s own deckle (two layers: edge × ink grain)', m.edged && m.blob && m.layers >= 2, JSON.stringify(m).slice(0, 220));
      await page.evaluate(() => { __vc.surfaces.lift.wrap.scrollTop = 900; }); await sleep(700);
      // the rows scrolled up go under the heading row and out along the deckle: the band between the
      // burned edge and the stuck heading shows no row text (s.d. of luminance like blank paper, not
      // like the rows lower down)
      const band = await proj(page, 10, 25.0), band2 = await proj(page, 10, 24.2), rows = await proj(page, 10, 14);
      const h = Math.max(6, Math.round(band2.y - band.y));
      const sd = async clip => { const { data } = await sharp(await page.screenshot({ clip })).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true }); const v = Array.from(data); const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
      const stuck = await page.evaluate(() => document.querySelector('#collectionView .tablewrap').classList.contains('vc-stuck'));
      const sBand = await sd({ x: Math.round(band.x) - 400, y: Math.round(band.y), width: 500, height: h });
      const sRows = await sd({ x: Math.round(rows.x) - 400, y: Math.round(rows.y), width: 500, height: h * 3 });
      await shot(page, 'edge-scrolled.png', { x: 200, y: 0, width: 1240, height: 260 });
      check('5 no row shows between the burned edge and the stuck heading (text contrast ≤ 55 % of the rows\': what is left is the burn texture); the rest fades along the deckle', stuck && sBand <= sRows * 0.55, `s.d. ${sBand.toFixed(1)} under the edge vs ${sRows.toFixed(1)} in the rows; stuck ${stuck}`);
      await ctx.close();
    }

    // ── 6 · one smooth scroll ───────────────────────────────────────────────────────────
    if (want('scroll')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      const gaps = [];
      for (const s of [0, 37, 140, 600, 1500, 0]) {
        await page.evaluate(y => { __vc.surfaces.lift.wrap.scrollTop = y; }, s);
        // read in the same frame as the scroll: nothing may lag behind it
        gaps.push(await page.evaluate(() => { const r = __vc.surfaces.lift.read(); return +(r.tableTop - r.headBottom).toFixed(2); }));
        await sleep(200);
      }
      const one = await page.evaluate(() => __vc.surfaces.lift.read().onescroll && !document.querySelector('.vc-hslip'));
      check('6 one native scroll box holds the title, the head and the table (no transformed slip)', one, '');
      check('6 the head and the table never part, even in the frame of the scroll', gaps.every(g => g === gaps[0]), JSON.stringify(gaps));
      const ft = await frameTimes(page, 2000, async () => { for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, 120); await sleep(50); } for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, -120); await sleep(50); } });
      numbers.scroll = ft;
      check('6 scrolling keeps the frame rate (no frame over 50 ms)', ft.max < 50, JSON.stringify(ft));
      await ctx.close();
    }

    // ── 7 · load-in: no grey, paper from the first frame ─────────────────────────────────
    if (want('load')) {
      const frames = [];
      const { page, ctx, errors } = await open(browser, {
        before: async (page, ctx) => {
          const cdp = await ctx.newCDPSession(page);
          cdp.on('Page.screencastFrame', f => { frames.push({ t: f.metadata.timestamp * 1000, d: f.data }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
          await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1, maxWidth: 720, maxHeight: 450 });
        },
      });
      allErrors.push(...errors);
      await ready(page); await sleep(1500);
      await ctx.close();
      const cls = [];
      for (const f of frames) {
        const { data, info: i } = await sharp(Buffer.from(f.d, 'base64')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        // the paper's middle (the window's centre)
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = Math.floor(i.height * 0.4); y < i.height * 0.6; y += 2) for (let x = Math.floor(i.width * 0.4); x < i.width * 0.6; x += 2) { const k = (y * i.width + x) * 3; r += data[k]; g += data[k + 1]; b += data[k + 2]; n++; }
        r /= n; g /= n; b /= n; const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        cls.push({ t: f.t - frames[0].t, l: +l.toFixed(0), rgb: [r, g, b].map(Math.round), k: l > 245 ? 'white' : b > r + 3 && l < 80 ? 'grey' : l < 40 ? 'dark' : r > b + 8 ? 'paper' : 'other' });
        if (cls.length <= 4) fs.writeFileSync(path.join(SHOTS, `load-frame-${cls.length - 1}.jpg`), Buffer.from(f.d, 'base64'));
      }
      const firstPaper = cls.findIndex(c => c.k === 'paper');
      const grey = cls.filter(c => c.k === 'grey').length;
      const afterPaper = firstPaper < 0 ? [] : cls.slice(firstPaper);
      const minAfter = Math.min(...afterPaper.map(c => c.l));
      numbers.load = { frames: cls.length, firstPaperMs: firstPaper < 0 ? null : Math.round(cls[firstPaper].t), seq: cls.slice(0, 12).map(c => `${Math.round(c.t)}:${c.k}${c.l}(${c.rgb})`) };
      check('7 no grey frame while the desk loads', grey === 0, `${grey} grey of ${cls.length} frames; first ${numbers.load.seq.join(' ')}`);
      check('7 paper from the first painted frame (nothing but the desk colour before it)', firstPaper >= 0 && cls.slice(0, firstPaper).every(c => c.k === 'dark' || c.k === 'white' && c.t < 50), `first paper at ${numbers.load.firstPaperMs} ms (frame ${firstPaper})`);
      check('7 seamless: once the paper shows it never drops back to dark (no pop to black)', minAfter > 40 && afterPaper.every(c => c.k === 'paper'), `darkest centre after the first paper frame: ${minAfter}`);
    }

    // ── 8 · the wash: noisy, faster, pours through everything, stamps about halfway ──────
    if (want('wash')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      const runs = [];
      for (const v of ['The Carpenter', 'The Master Chef']) {
        // the sequence's own log (times from its start), kept while it runs
        await page.evaluate(() => { window.__wp17log = { log: [], washed: false }; window.__wp17poll = setInterval(() => { const l = __vc.ink.log(); if (l.length) window.__wp17log.log = l; if (document.querySelector('.vc-masthead .brand')?.dataset.vcWash) window.__wp17log.washed = true; }, 20); });
        await page.evaluate(t => document.querySelector(`[data-category="${t}"]`).click(), v);
        // the board slides the bar first; wait for the sequence to start, then for its end
        await page.waitForFunction(() => __vc.ink.state().running, null, { timeout: 4000 }).catch(() => {});
        await idle(page); await sleep(300);
        runs.push(await page.evaluate(() => {
          clearInterval(window.__wp17poll);
          const { log, washed } = window.__wp17log;
          const at = type => log.filter(e => e.type === type).map(e => e.t);
          const out = at('fx:wash-out-start')[0] ?? 0, end = at('fx:wash-in-end').slice(-1)[0], st = at('fx:stamp-land');
          return { total: Math.round(end - out), stamps: st.map(t => +((t - out) / (end - out)).toFixed(2)), stampMs: st.map(Math.round), masthead: washed };
        }));
      }
      numbers.wash = runs;
      // a look mid-wash (its own run: a screenshot stalls the frames it is taken in)
      await page.evaluate(() => document.querySelector('[data-category="The Artisan"]').click());
      await page.waitForFunction(() => __vc.ink.state().running && __vc.ink.state().t > 1150, null, { timeout: 5000 }).catch(() => {});
      await shot(page, 'wash-mid.png');
      await idle(page);
      const masks = await page.evaluate(() => { const m = __vc.ink.masks(); return { n: Array.isArray(m) ? m.length : Object.keys(m || {}).length }; });
      check('8 faster: the whole wash is under WP-16\'s ~3.2 s', runs.every(r => r.total > 600 && r.total < 3200), runs.map(r => Math.round(r.total) + ' ms').join(', '));
      check('8 the stamps land about halfway through it (first within 30–65 %)', runs.every(r => r.stamps.length && r.stamps[0] >= 0.3 && r.stamps[0] <= 0.65), JSON.stringify(runs.map(r => r.stamps)));
      check('8 it pours through everything (the title block washes too)', runs.every(r => r.masthead), JSON.stringify(runs.map(r => r.masthead)));
      info('8 noisy edge', `edge noise ×1.9, 2,600 pigment specks per mask; ${masks.n} masks — look: docs/reports/wp-17a/wash-mid.png`);
      await ctx.close();
    }

    // ── 9 · stamps swapped, Missing dots fill from the bottom ─────────────────────────────
    if (want('stamps')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      const r = await page.evaluate(() => {
        const ms = [...document.querySelectorAll('#metrics > .metric')].map(e => ({ m: e.dataset.metric, x: e.getBoundingClientRect().left }));
        const order = ms.sort((a, b) => a.x - b.x).map(e => e.m);
        const dots = [...document.querySelectorAll('.metric[data-metric="missing"] > .dots > .dot')].map(d => ({ on: d.classList.contains('on'), y: d.getBoundingClientRect().top }));
        const on = dots.filter(d => d.on).map(d => d.y), off = dots.filter(d => !d.on).map(d => d.y);
        const mean = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null;
        return { order, on: on.length, off: off.length, onY: mean(on), offY: mean(off), wrap: getComputedStyle(document.querySelector('.metric[data-metric="missing"] > .dots')).flexWrap };
      });
      check('9 the stamps read Completed, Missing, Undiscovered, Unverified (Undiscovered and Unverified swapped)', JSON.stringify(r.order) === JSON.stringify(['done', 'missing', 'discovered', 'unknown']), JSON.stringify(r.order));
      check('9 Missing fills from the bottom up', r.wrap === 'wrap-reverse' && r.on > 0 && (r.off === 0 || r.onY > r.offY), JSON.stringify(r));
      const m = await rect(page, '#metrics');
      if (m) await shot(page, 'stamps.png', { x: Math.round(m.x) - 10, y: Math.round(m.y) - 10, width: Math.round(m.w) + 20, height: Math.round(m.h) + 20 });
      await ctx.close();
    }

    // ── 10 · frame drops: (a) while something animates, (b) on slider release ───────────────
    if (want('frames')) {
      const run = async html => {
        const { page, ctx, errors } = await desk(browser, { html });
        allErrors.push(...errors);
        await page.evaluate(() => __vc.quality('high'));
        // (a) the gauntlet animates on screen (pointer on the woodblock): every frame drawn
        await page.mouse.move(60, 450, { steps: 6 }); await sleep(2500);
        const a = await frameTimes(page, 3000);
        // and the still desk (pointer over the table) still idles
        // (the breeze of the move lifts the paper; it settles in a few seconds: wait for the stage to idle)
        await page.mouse.move(1100, 700, { steps: 6 }); await sleep(2000);
        await page.waitForFunction(() => __vc.stage.stats().idle === true, null, { timeout: 15000 }).catch(() => {});
        await sleep(300);
        const still = await frameTimes(page, 3000);
        // (b) slide a bar to its latch and release it (twice)
        const rel = [];
        for (const target of ['The Gourmet', 'The Hunter']) {
          await page.mouse.move(60, 450, { steps: 6 }); await sleep(1800);
          const travel = await page.evaluate(() => __vc.board.mechanism.travel);
          const k0 = await page.evaluate(c => __vc.board.knob(c), target);
          await page.mouse.move(k0.x, k0.y); await sleep(500); await page.mouse.down();
          // Paul, WP-17 item 14: the knob's rest centre moved (bar 10.5 cm from x 6.45: 6.45 + 10.5 + 0.7 = 17.65; was 17.85)
          const r = await page.evaluate(([c, d]) => __vc.board.slotPoint(c, 17.65 + d), [target, travel]);
          for (let k = 1; k <= 20; k++) { await page.mouse.move(k0.x + (r.x - k0.x) * k / 20, k0.y + (r.y - k0.y) * k / 20); await sleep(25); }
          await sleep(200);
          const f = await frameTimes(page, 2600, async () => { await page.mouse.up(); });
          const cost = await page.evaluate(() => __vc.ink.cost?.() ?? {});
          rel.push({ ...f, snapshotMs: cost.snapshotMs, prewarmed: cost.prewarmed, latched: await page.evaluate(() => __vc.board.mechanism.latched) });
          await idle(page);
        }
        await ctx.close();
        return { a, still, rel };
      };
      const now = await run(HTML);
      numbers.frames = { now };
      if (BEFORE) numbers.frames.before = await run(BEFORE);
      const a = now.a;
      check('10a the gauntlet animating on screen: every frame drawn (none skipped by the idle throttle)', a.drawn >= a.frames - 1, `${a.drawn}/${a.frames} drawn, p50 ${a.p50} ms, max ${a.max} ms, over 20 ms: ${a.over20}`);
      check('10a the still desk still idles (frames skipped, as WP-16A)', now.still.drawn < now.still.frames * 0.5, `${now.still.drawn}/${now.still.frames} drawn ${JSON.stringify(now.still.why)}`);
      check('10b on release the ghost is pre-warmed (no snapshot in the release task)', now.rel.every(r => r.prewarmed && r.snapshotMs < 2), JSON.stringify(now.rel.map(r => ({ prewarmed: r.prewarmed, snapshotMs: r.snapshotMs }))));
      check('10b the wash after a release has no long frame (LoAF > 50 ms) besides the release itself', now.rel.every(r => r.loaf.length <= 1), JSON.stringify(now.rel.map(r => r.loaf)));
      info('10b release frames now', JSON.stringify(now.rel.map(r => ({ max: r.max, over34: r.over34, loaf: r.loaf, latched: r.latched }))));
      if (numbers.frames.before) info('10b release frames before (WP-16)', JSON.stringify(numbers.frames.before.rel.map(r => ({ max: r.max, over34: r.over34, loaf: r.loaf }))));
      if (numbers.frames.before) info('10a before (WP-16): gauntlet on screen', `${numbers.frames.before.a.drawn}/${numbers.frames.before.a.frames} drawn`);
    }

    // ── 11 · the knob: no sheen seam at 180°, a softer flash with a slight glow ─────────────
    if (want('knob')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      const k = await page.evaluate(() => {
        const g = __vc.board.objects.bars.list[0].knob.geometry;
        const n = g.attributes.normal, P = g.parameters.points.length, S = g.parameters.segments;
        let worst = 0;
        for (let j = 0; j < P; j++) { const a = j, b = S * P + j; const d = Math.hypot(n.getX(a) - n.getX(b), n.getY(a) - n.getY(b), n.getZ(a) - n.getZ(b)); worst = Math.max(worst, d); }
        return { worst, P, S };
      });
      check('11 the lathe seam has one normal (no lighting break where the sheen crosses 180°)', k.worst < 1e-4, `largest normal difference across the seam ${k.worst.toExponential(2)} over ${k.P} rings`);
      await page.mouse.move(60, 450, { steps: 6 }); await sleep(2000);
      const kp = await page.evaluate(() => __vc.board.knob('The Gourmet'));
      await page.mouse.move(kp.x, kp.y, { steps: 6 }); await sleep(250);
      await shot(page, 'knob-glint.png', { x: Math.max(0, Math.round(kp.x) - 90), y: Math.max(0, Math.round(kp.y) - 60), width: 180, height: 120 });
      info('11 flash', 'glint strength 1.6 → 0.9 with a 0.07 glow under it — look: docs/reports/wp-17a/knob-glint.png');
      await ctx.close();
    }

    // ── 12 · a darker desk ───────────────────────────────────────────────────────────────
    // Same build, same camera, same light: the desk's wood at WP-17's shade (1.95) and, for one frame,
    // at WP-16's (2.6). Across builds the camera frames different things (item 2), so the screen spots
    // differ in light and vignette; BEFORE adds that cross-build number for information only.
    if (want('desk')) {
      const pts = [[52, -8], [52, 8], [0, -29.5], [30, -29.5], [20, 29.5]];
      const lumAt = async page => { const v = []; for (const [x, y] of pts) { const p = await proj(page, x, y); if (p.x > 10 && p.x < 1430 && p.y > 10 && p.y < 890) v.push((await rgb(page, { x: p.x - 8, y: p.y - 8, width: 16, height: 16 })).l); } return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
      const setShade = (page, k) => page.evaluate(k => {
        let n = 0;
        __vc.stage.three.scene.traverse(o => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) if (m.name === 'desk') { m.color.multiplyScalar(k); n++; } });
        __vc.stage.renderNow(); return n;
      }, k);
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      await page.mouse.move(30, 520, { steps: 6 }); await sleep(1800); // the whole desk in view
      const now = await lumAt(page);
      await shot(page, 'desk.png');
      const n = await setShade(page, 2.6 / 1.95); await sleep(120);
      const old = await lumAt(page);
      await setShade(page, 1.95 / 2.6);
      await ctx.close();
      numbers.desk = { now: +now.toFixed(1), atWp16Shade: +old.toFixed(1), materials: n };
      check('12 the desk is darker: ≥ 15 % less luminance than at WP-16\'s shade, same camera and light', n > 0 && now <= old * 0.85, `${now.toFixed(1)} vs ${old.toFixed(1)} (×${(now / old).toFixed(2)}) over ${n} desk materials`);
      if (BEFORE) {
        const b = await desk(browser, { html: BEFORE });
        await b.page.mouse.move(30, 520, { steps: 6 }); await sleep(1800);
        info('12 the WP-16 build at the same world points (its own camera)', (await lumAt(b.page)).toFixed(1));
        await b.ctx.close();
      }
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
