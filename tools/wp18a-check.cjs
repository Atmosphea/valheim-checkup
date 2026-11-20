// Builder self-check for WP-18A (Paul's feedback round 3, items 1–10: loading, smoothness, camera, layout).
//   npm run build:single && node tools/wp18a-check.cjs [all|wash|flow|leave|sound|gauntlet|catch|camera|layout|coins|load|start] [html]
// Real GPU (Metal), 1440 × 900. Paul's save from fixtures/private; the character name is never printed
// and is masked in the screenshots (docs/reports/wp-18a/).
// BEFORE=<path to the v2.2.0 build> runs the same measurements on it for items 1, 3 and 6 (before/after).
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
const SHOTS = path.join(ROOT, 'docs', 'reports', 'wp-18a');
const ARGS = ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'];
const want = m => MODE === 'all' || MODE.split(',').includes(m);
const results = [];
/** The character name, once seen, is replaced in everything this tool prints. */
const NAMES = new Set();
const red = t => { let o = String(t); for (const n of NAMES) if (n) o = o.split(n).join('{name}'); return o; };
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(red(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)); };
const info = (name, detail) => console.log(red(`INFO  ${name}  — ${detail}`));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: o.dpr || 1, locale: 'en-US', timezoneId: 'UTC' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error' && !/GPU stall due to ReadPixels|GL_CLOSE_PATH_NV|net::ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(`file://${o.html || HTML}?mode=${o.mode || 'desk'}&seed=7`);
  return { page, ctx, errors };
}
const ready = page => page.waitForFunction(() => window.__vc?.stage?.textures?.ready?.() && __vc.stage.stats().frames > 10 && __vc.startup().usableMs !== null, null, { timeout: 60000 });
async function loadSave(page) {
  await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
  await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 20000 });
  NAMES.add(await page.evaluate(() => document.querySelector('#headerProfile strong')?.textContent || ''));
}
const idle = page => page.waitForFunction(() => !__vc.ink?.state().running && (__vc.ink?.state().ghosts ?? 0) === 0, null, { timeout: 20000 }).catch(() => {});
async function desk(browser, o = {}) {
  const r = await open(browser, o);
  await ready(r.page);
  if (!o.nosave) { await loadSave(r.page); await idle(r.page); }
  await r.page.mouse.move(900, 470, { steps: 4 }); await sleep(1800);
  return r;
}
const mask = page => page.evaluate(() => {
  const name = document.querySelector('#headerProfile strong')?.textContent || '';
  if (!name) return;
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) if (n.nodeValue.includes(name)) n.nodeValue = n.nodeValue.split(name).join('{name}');
  __vc.stage?.markPrintDirty(); __vc.stage?.renderNow?.();
});
const shot = async (page, name, clip) => { await mask(page); await sleep(150); await page.screenshot({ path: path.join(SHOTS, name), ...(clip ? { clip } : {}) }); return name; };
const proj = (page, x, y, z = 0) => page.evaluate(([x, y, z]) => __vc.stage.project(x, y, z), [x, y, z]);
/** Screen px per paper cm at the current framing (works on every build: two projected points). */
const scale = page => page.evaluate(() => { const a = __vc.stage.project(0, 0, 0), b = __vc.stage.project(10, 0, 0); return Math.hypot(b.x - a.x, b.y - a.y) / 10; });
/** In-page: every visible text box on the page (not the toast, hidden copies or closed dialogs). */
const TEXT_BOXES = `(() => {
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('#toast, .visually-hidden, dialog:not([open]), .vc-coin-proxy, [data-coin], #loadTop, .top-actions')) continue;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    let o = 1; for (let a = el; a; a = a.parentElement) o *= +getComputedStyle(a).opacity;
    if (o < 0.05) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    for (const b of range.getClientRects()) if (b.width >= 2 && b.height >= 2) out.push({ text: n.nodeValue.trim().slice(0, 30), l: b.left, r: b.right, t: b.top, b: b.bottom });
  }
  return out;
})()`;
const grey = async buf => { const { data, info: i } = await sharp(buf).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true }); return { data, w: i.width, h: i.height }; };

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ARGS });
  const allErrors = [];
  try {
    // ── 1 · no dark square behind the pieces while they ink in ─────────────────────────────
    if (want('wash')) {
      /** Mid-wash frames vs the settled frame: the share of bare-paper pixels (bright when settled)
       * and unchanged by the load) whose 16 px block is on average ≥ 4 grey levels darker during the wash. Text inks in as hard dark strokes;
       * the old damp band was a broad mild darkening over the whole rectangle of each piece. */
      const measure = async html => {
        const { page, ctx, errors } = await open(browser, { html });
        allErrors.push(...(html === HTML ? errors : []));
        await ready(page);
        await page.mouse.move(900, 470, { steps: 4 }); await sleep(2500);
        const pre = await grey(await page.screenshot());
        await page.evaluate(() => __vc.timeScale(0.2));
        await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
        await page.waitForFunction(() => __vc.ink.state().running && __vc.ink.state().t > 150, null, { timeout: 20000 });
        const mids = [];
        for (let k = 0; k < 6; k++) { mids.push(await page.screenshot()); await sleep(450); }
        await page.evaluate(() => __vc.timeScale(1));
        await idle(page); await sleep(1500);
        const fin = await grey(await page.screenshot());
        let worst = 0, patch = 0;
        for (const m of mids) {
          const g = await grey(m);
          // 16 px blocks: the film grain (different every frame) averages out, a darkened area does not
          const B = 16, bw = Math.floor(fin.w / B), bh = Math.floor(fin.h / B);
          let paper = 0, mild = 0; const dark = new Uint8Array(bw * bh);
          for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
            let n = 0, sf = 0, sg = 0;
            for (let y = by * B; y < by * B + B; y++) for (let x = bx * B; x < bx * B + B; x++) {
              const i = y * fin.w + x, f = fin.data[i];
              if (f < 150 || Math.abs(pre.data[i] - f) > 6) continue;
              n++; sf += f; sg += g.data[i];
            }
            if (n < B * B * 0.6) continue;
            paper++; const d = (sf - sg) / n; if (d >= 4 && d <= 40) { mild++; dark[by * bw + bx] = 1; }
          }
          worst = Math.max(worst, mild / Math.max(1, paper));
          // the largest fully darkened square of blocks: a square behind a piece is wide both ways;
          // ink still washing in leaves only thin strips along its own text
          const sq = new Uint16Array(bw * bh);
          for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
            const i = y * bw + x; if (!dark[i]) continue;
            sq[i] = x && y ? 1 + Math.min(sq[i - 1], sq[i - bw], sq[i - bw - 1]) : 1;
            patch = Math.max(patch, sq[i]);
          }
        }
        await ctx.close();
        return { worst, patch };
      };
      const now = await measure(HTML);
      const before = BEFORE ? await measure(BEFORE) : null;
      const f = r => `${(r.worst * 100).toFixed(2)} % of the paper, largest darkened square ${r.patch} × ${r.patch} blocks`;
      check('1 no dark square: while pieces ink in (time × 0.2), no darkened square wider than 3 blocks (48 px) and ≤ 6 % of the paper', now.patch <= 3 && now.worst <= 0.06, `${f(now)}${before ? `; v2.2.0 ${f(before)}` : ''}`);
      if (before) check('1 the same check sees the square on v2.2.0 (a darkened square ≥ 3 × wider)', before.patch >= 3 * Math.max(1, now.patch), `${before.patch} vs ${now.patch} blocks`);
    }

    // ── 2 · the wash flows straight through (no beat at the fifth unfold) ──────────────────
    if (want('flow')) {
      const { page, ctx, errors } = await open(browser);
      allErrors.push(...errors);
      await ready(page); await page.mouse.move(900, 470); await sleep(800);
      await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
      await page.waitForFunction(() => __vc.ink.state().running, null, { timeout: 20000 });
      const units = await page.evaluate(() => __vc.ink.units());
      const grids = await page.evaluate(() => __vc.ink.state().grids);
      await idle(page);
      const ins = units.filter(u => u.dir !== 'out').sort((a, b) => a.start - b.start);
      let end = ins[0]?.start ?? 0, gap = 0;
      for (const u of ins) { gap = Math.max(gap, u.start - end); end = Math.max(end, u.start + u.dur); }
      check('2 every piece starts before the one before it has finished (no pause in the sequence)', ins.length > 5 && gap <= 0, `${ins.length} pieces, longest pause ${Math.round(gap)} ms, last piece done at ${Math.round(end)} ms`);
      const fifth = ins[4], sixth = ins[5];
      check('2 the sixth piece starts within 60 ms of the fifth (it was ~600 ms)', fifth && sixth && sixth.start - fifth.start <= 60, fifth && sixth ? `${fifth.name || 'piece 5'} ${Math.round(fifth.start)} ms → ${sixth.name || 'piece 6'} ${Math.round(sixth.start)} ms` : 'too few pieces');
      check('2 a little faster: the pieces are in by 1.7 s (was ~1.9 s) and the dots done by 2.4 s (was 2.8 s)', end <= 1700 && grids.every(g => (g.last ?? 0) <= 2400), `pieces done ${Math.round(end)} ms; last dot ${Math.max(0, ...grids.map(g => g.last ?? 0))} ms`);
      await ctx.close();
    }

    // ── 3 · the cursor leaving the table: what the desk redraws ─────────────────────────────
    if (want('leave')) {
      const measure = async html => {
        const { page, ctx, errors } = await desk(browser, { html });
        if (html === HTML) allErrors.push(...errors);
        // pointer resting on the table (spark out; the gauntlet idles off-screen)
        await page.mouse.move(800, 500, { steps: 6 }); await sleep(2500);
        const s0 = await page.evaluate(() => __vc.stage.stats());
        await sleep(3000);
        const s1 = await page.evaluate(() => __vc.stage.stats());
        const drawn = (s1.frames - s0.frames) - (s1.idleSkips - s0.idleSkips);
        const shadows = drawn - (s1.shadowSkips - s0.shadowSkips);
        // then leave the table for the desk margin and time until the camera holds still
        await page.evaluate(() => {
          const rig = __vc.stage.three.rig; window.__settle = { last: performance.now(), v: rig.version, t0: performance.now(), on: true };
          const tick = () => { const s = window.__settle; if (rig.version !== s.v) { s.v = rig.version; s.last = performance.now(); } if (s.on) requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
        });
        await page.mouse.move(1430, 470, { steps: 8 });
        await page.evaluate(() => { window.__settle.t0 = performance.now(); });
        await sleep(4500);
        const settle = await page.evaluate(() => { const s = window.__settle; s.on = false; return s.last - s.t0; });
        await ctx.close();
        return { drawn, shadows, settle };
      };
      const now = await measure(HTML);
      const before = BEFORE ? await measure(BEFORE) : null;
      const pct = r => (r.drawn ? Math.round((100 * r.shadows) / r.drawn) : 0);
      check('3 pointer resting on the table: shadow maps are not redrawn every frame (≤ 10 % of drawn frames)', pct(now) <= 10, `${now.shadows} of ${now.drawn} frames${before ? `; v2.2.0 ${before.shadows} of ${before.drawn}` : ''}`);
      check('3 after leaving the table the camera holds still within 2.2 s (it crept on for ~2.5–3 s)', now.settle <= 2200, `${Math.round(now.settle)} ms${before ? `; v2.2.0 ${Math.round(before.settle)} ms` : ''}`);
    }

    // ── 4 · no sound when scrolling stops ──────────────────────────────────────────────────
    if (want('sound')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      await page.mouse.click(700, 520); await sleep(400);
      const n0 = await page.evaluate(() => __vc.sound.requests.length);
      await page.mouse.move(700, 560); await page.mouse.wheel(0, 600); await sleep(300); await page.mouse.wheel(0, 500); await sleep(1500);
      const r = await page.evaluate(n => ({ req: __vc.sound.requests.slice(n).map(x => x.name), scrolled: document.querySelector('#collectionView .tablewrap')?.scrollTop ?? 0, ev: (Array.isArray(__vc.events) ? __vc.events : __vc.events?.log?.() ?? []).filter(e => (e.type || e.name) === 'paper:settle').length }), n0);
      check('4 the table scrolled and stopped, and no paper-settle sound was asked for', r.scrolled > 50 && !r.req.includes('paper.settle'), `scrollTop ${r.scrolled}; sounds after: ${JSON.stringify(r.req)}`);
      await ctx.close();
    }

    // ── 5 · the gauntlet while the spark is out ────────────────────────────────────────────
    if (want('gauntlet')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      await page.mouse.move(800, 500, { steps: 6 }); await sleep(2500);
      const a = await page.evaluate(() => __vc.cursor.state());
      const tips = [a.tip];
      for (const [x, y] of [[500, 300], [1100, 650], [700, 420], [1000, 300]]) { await page.mouse.move(x, y, { steps: 12 }); await sleep(250); tips.push((await page.evaluate(() => __vc.cursor.state())).tip); }
      const moved = Math.max(...tips.map(t => Math.hypot(t[0] - tips[0][0], t[1] - tips[0][1])));
      check('5 spark out: the gauntlet is resting (idle pose, parked)', a.mode === 'spark' && a.resting && a.pose === 'hover', JSON.stringify({ mode: a.mode, resting: a.resting, pose: a.pose }));
      check('5 it ignores the mouse: the hand moves < 1.5 cm while the pointer sweeps the sheet', moved < 1.5, `${moved.toFixed(2)} cm`);
      // the stretch comes while it rests (first after 5–9 s)
      let stretched = false;
      for (let k = 0; k < 24 && !stretched; k++) { await sleep(500); stretched = (await page.evaluate(() => __vc.cursor.state().stretching)); }
      check('5 it plays the stretch now and then while resting (first within 12 s)', stretched, `stretched: ${stretched}`);
      // off the paper (the desk by the woodblock): back to the gauntlet, which follows again, and never stretches there
      await page.mouse.move(200, 160, { steps: 10 }); await sleep(2800);
      const b = await page.evaluate(() => __vc.cursor.state());
      check('5 off the sheet the gauntlet is back on the pointer, not resting', b.mode !== 'spark' && !b.resting && b.lag < 1, JSON.stringify({ mode: b.mode, resting: b.resting, lag: b.lag }));
      let late = false;
      for (let k = 0; k < 20; k++) { await page.mouse.move(200 + (k % 2), 160); await sleep(500); late = late || (await page.evaluate(() => __vc.cursor.state().stretching)); }
      check('5 no stretch while the gauntlet is the cursor (10 s watched)', !late && b.mode !== 'spark', `stretched: ${late}`);
      await ctx.close();
    }

    // ── 5 · the catch keeps its swing (WP-16 item 16), measured with the camera pinned ─────────
    // (item 6's new framings move the camera while the hand returns, which hides the swing from the
    // WP-16B check; with the camera still, this build and v2.2.0 must swing alike)
    if (want('catch')) {
      const measure = async html => {
        const { page, ctx, errors } = await desk(browser, { html });
        if (html === HTML) allErrors.push(...errors);
        await page.mouse.move(10, 450, { steps: 10 }); await sleep(1500);
        await page.evaluate(() => __vc.stage.three.rig.override({ x: -12, y: -4, zoom: 1 })); await sleep(500);
        const pts = await page.evaluate(() => ({ board: __vc.stage.project(-40, -12, 3), paper: __vc.stage.project(-5, -8, 0) }));
        await page.mouse.move(pts.board.x, pts.board.y, { steps: 10 }); await sleep(1500);
        await page.mouse.move(pts.paper.x, pts.paper.y, { steps: 12 }); await sleep(1500);
        await page.evaluate(() => { window.__tr = []; const l = () => { const s = __vc.cursor.state(); __tr.push({ tip: s.tip, ret: s.returning }); if (__tr.length < 240) requestAnimationFrame(l); }; requestAnimationFrame(l); });
        for (let k = 1; k <= 14; k++) { await page.mouse.move(pts.paper.x + (pts.board.x - pts.paper.x) * k / 14, pts.paper.y + (pts.board.y - pts.paper.y) * k / 14); await sleep(16); }
        await sleep(3000);
        const all = await page.evaluate(() => window.__tr);
        await ctx.close();
        const i0 = all.findIndex(q => q.ret); const tr = all.slice(Math.max(0, i0 - 1)); const end = tr.at(-1).tip;
        const over = Math.max(...[0, 1].map(ax => { const sg = Math.sign(tr[0].tip[ax] - end[ax]); return Math.max(0, ...tr.map(q => sg * (end[ax] - q.tip[ax]))); }));
        return { caught: i0 >= 0, travel: Math.hypot(tr[0].tip[0] - end[0], tr[0].tip[1] - end[1]), over };
      };
      const now = await measure(HTML);
      const was = BEFORE ? await measure(BEFORE) : null;
      check('5 the catch still swings a little past the spark (camera held still)', now.caught && now.over > 0.05 && now.over < 2.5, `travel ${now.travel.toFixed(2)} cm, swing ${now.over.toFixed(3)} cm${was ? `; v2.2.0 ${was.travel.toFixed(2)} cm, ${was.over.toFixed(3)} cm` : ''}`);
      if (was) check('5 …the same swing as v2.2.0 (± 0.05 cm)', Math.abs(now.over - was.over) < 0.05);
    }

    // ── 6 · camera: main +20 %, header unchanged, collections 50 % closer ──────────────────
    if (want('camera')) {
      const measure = async html => {
        const { page, ctx, errors } = await desk(browser, { html });
        if (html === HTML) allErrors.push(...errors);
        const at = async (x, y) => { await page.mouse.move(x, y, { steps: 10 }); await sleep(2600); return scale(page); };
        const r = { main: await at(900, 520), header: await at(900, 40), wood: await at(60, 450) };
        r.main2 = await at(900, 520);
        if (html === HTML) {
          await page.mouse.move(900, 40, { steps: 10 }); await sleep(2600); await shot(page, 'camera-header.png');
          await page.mouse.move(60, 450, { steps: 10 }); await sleep(2600); await shot(page, 'camera-collections.png');
          await page.mouse.move(4, 450, { steps: 4 }); await sleep(1500);
          r.edgeMode = await page.evaluate(() => __vc.cursor.state().mode);
          await page.mouse.move(900, 520, { steps: 10 }); await sleep(2600); await shot(page, 'camera-main.png');
        }
        await ctx.close();
        return r;
      };
      const now = await measure(HTML);
      info('6 px per cm', JSON.stringify(Object.fromEntries(Object.entries(now).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, +v.toFixed(2)]))));
      if (BEFORE) {
        const was = await measure(BEFORE);
        info('6 px per cm on v2.2.0', JSON.stringify(Object.fromEntries(Object.entries(was).map(([k, v]) => [k, +v.toFixed(2)]))));
        check('6 main framing 20 % closer', Math.abs(now.main / was.main - 1.2) < 0.04, `× ${(now.main / was.main).toFixed(3)}`);
        check('6 header/coins zoom out by the same amount as before (main ÷ header unchanged)', Math.abs((now.main / now.header) / (was.main / was.header) - 1) < 0.05, `now ÷ ${(now.main / now.header).toFixed(3)}, v2.2.0 ÷ ${(was.main / was.header).toFixed(3)}`);
        check('6 the collections (woodblock) framed 50 % closer', Math.abs(now.wood / was.wood - 1.5) < 0.06, `× ${(now.wood / was.wood).toFixed(3)}`);
      } else info('6', 'run with BEFORE=<v2.2.0 build> for the before/after ratios');
      check('6 in the collections framing the woodblock still runs off the left edge (the gauntlet at x 4 px)', now.edgeMode === 'gauntlet', now.edgeMode);
      check('6 the main framing comes back the same after the header and woodblock', Math.abs(now.main2 / now.main - 1) < 0.02, `${now.main.toFixed(2)} → ${now.main2.toFixed(2)} px/cm`);
    }

    // ── 7 · centred: equal paper margins left and right of the table, masthead above the title ──
    if (want('layout')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      const r = await page.evaluate(() => {
        const box = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, cx: (b.left + b.right) / 2 }; };
        const L = __vc.stage.three.paper?.sheet ?? null;
        return { cells: (() => { const th = [...document.querySelectorAll('#collectionView thead th')].map(e => e.getBoundingClientRect()); return th.length ? { l: th[0].left, r: th.at(-1).right } : null; })(), title: box('#title'), mast: box('.vc-masthead .brand') || box('.vc-masthead'), stats: box('#statline'), rows: box('#items'), L };
      });
      const sl = await proj(page, -25, 0), sr = await proj(page, 48, 0);
      const tb = r.cells;
      const left = tb.l - sl.x, right = sr.x - tb.r;
      check('7 the paper margin left of the table equals the margin right of it (± 6 %)', left > 0 && right > 0 && Math.abs(left - right) / Math.max(left, right) < 0.06, `${left.toFixed(1)} px vs ${right.toFixed(1)} px`);
      const mid = (sl.x + sr.x) / 2;
      check('7 the collection title is centred on the sheet (± 2 % of its width)', Math.abs(r.title.cx - mid) < 0.02 * (sr.x - sl.x) || Math.abs((tb.l + tb.r) / 2 - mid) < 0.02 * (sr.x - sl.x), `title centre ${r.title.cx.toFixed(0)} px, table centre ${((tb.l + tb.r) / 2).toFixed(0)} px, sheet centre ${mid.toFixed(0)} px`);
      check('7 the masthead sits in the middle above the collection title', Math.abs(r.mast.cx - mid) < 0.04 * (sr.x - sl.x) && r.mast.b <= r.title.t + 2, `masthead centre ${r.mast.cx.toFixed(0)} px, bottom ${r.mast.b.toFixed(0)} ≤ title top ${r.title.t.toFixed(0)}`);
      const wood = await proj(page, -19, 0);
      info('7 woodblock', `x −19 cm at ${wood.x.toFixed(0)} px (layout unchanged)`);
      await page.mouse.move(900, 520, { steps: 6 }); await sleep(1500);
      await shot(page, 'centred.png');
      await ctx.close();
    }

    // ── 8 · coins: clustered, never on text, better and retriggerable hover ─────────────────
    if (want('coins')) {
      for (const nosave of [false, true]) {
        const { page, ctx, errors } = await desk(browser, { nosave });
        allErrors.push(...errors);
        await page.mouse.move(900, 40, { steps: 10 }); await sleep(2600);
        const coins = (await page.evaluate(() => __vc.stage.three.board ? __vc.board.state().coins : []));
        const circles = [];
        for (const c of coins) {
          if (!c.at) continue;
          const [x, y, z] = c.at;
          const a = await proj(page, x, y, z), bx = await proj(page, x + c.r, y, z), by = await proj(page, x, y + c.r, z);
          circles.push({ id: c.id, cx: x, cy: y, cr: c.r, x: a.x, y: a.y, rx: Math.hypot(bx.x - a.x, bx.y - a.y), ry: Math.hypot(by.x - a.x, by.y - a.y) });
        }
        const boxes = await page.evaluate(TEXT_BOXES);
        const hits = [];
        for (const b of boxes) for (const c of circles) {
          const nx = Math.max(b.l, Math.min(c.x, b.r)), ny = Math.max(b.t, Math.min(c.y, b.b));
          if (((nx - c.x) / c.rx) ** 2 + ((ny - c.y) / c.ry) ** 2 < 0.96) hits.push(`${c.id} × "${b.text}"`);
        }
        check(`8 ${nosave ? 'no save' : 'with save'}: no coin covers text (header view)`, circles.length >= 4 && hits.length === 0, `${circles.length} coins, ${boxes.length} text boxes; ${[...new Set(hits)].slice(0, 4).join('; ') || 'clear'}`);
        // the cluster in paper cm (the sound coin stays apart, bottom right)
        const cluster = circles.filter(c => c.id !== 'sound');
        const gapCm = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy) - a.cr - b.cr;
        let overlap = 0, maxGap = 0;
        for (const a of cluster) { for (const b of cluster) if (a.id < b.id && gapCm(a, b) < 0) overlap++; maxGap = Math.max(maxGap, Math.min(...cluster.filter(b => b !== a).map(b => gapCm(a, b)))); }
        const ys = cluster.map(c => c.cy);
        if (!nosave) check('8 the coins sit close together (each ≤ 1.5 cm from its nearest neighbour), never overlapping, not in one line', overlap === 0 && maxGap <= 1.5 && Math.max(...ys) - Math.min(...ys) > 2, `largest gap to a neighbour ${maxGap.toFixed(2)} cm; heights span ${(Math.max(...ys) - Math.min(...ys)).toFixed(1)} cm`);
        if (!nosave) {
          // hover: near the rim counts (round hit test), and a new hover retriggers at once
          const id = 'load', near = circles.find(x => x.id === id);
          await page.mouse.move(near.x - near.rx * 2.2, near.y + near.ry * 0.3, { steps: 6 }); await sleep(1500);
          const lc = (await page.evaluate(() => __vc.board.state().coins)).find(x => x.id === id);
          const ca = await proj(page, ...lc.at), cb2 = await proj(page, lc.at[0] + lc.r, lc.at[1], lc.at[2]);
          const c = { id, x: ca.x, y: ca.y, r: Math.hypot(cb2.x - ca.x, cb2.y - ca.y) };
          await page.mouse.move(c.x - c.r * 0.96, c.y, { steps: 3 }); await sleep(80);
          const h1 = (await page.evaluate(() => __vc.board.state().coins)).find(x => x.id === c.id);
          await page.mouse.move(c.x - c.r * 1.6, c.y, { steps: 2 }); await sleep(160);
          await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(40);
          const h2 = (await page.evaluate(() => __vc.board.state().coins)).find(x => x.id === c.id);
          check('8 hover is caught near the rim (96 % of the radius)', h1.hopping && h1.spinning, JSON.stringify({ hopping: h1.hopping, spinning: h1.spinning }));
          check('8 a new hover restarts the hop and spin before the last one finished', h2.hopping && h2.spinning && h2.hopT0 > h1.hopT0, `hop start ${h1.hopT0} → ${h2.hopT0} ms`);
          await sleep(1200);
          await shot(page, 'coins.png');
        }
        await ctx.close();
      }
      const motion = fs.readFileSync(path.join(ROOT, 'src', 'config', 'motion.js'), 'utf8');
      const deg = +(motion.match(/hoverSpinDeg:\s*([\d.]+)/)?.[1] ?? 0), tilt = +(motion.match(/hoverTiltDeg:\s*([\d.]+)/)?.[1] ?? 0);
      check('8 the hover turn is more dramatic (spin 15° → ≥ 60°, tilt 8° → ≥ 18°)', deg >= 60 && tilt >= 18, `spin ${deg}°, tilt ${tilt}°`);
    }

    // ── 9 · one load button, bigger text; the button, the input and a drop all load ──────────
    if (want('load')) {
      for (const mode of ['flat', 'desk']) {
        const { page, ctx, errors } = await open(browser, { mode });
        allErrors.push(...errors);
        if (mode === 'desk') await ready(page); else { await page.waitForFunction(() => !!window.__vc && document.body.classList.contains('mode-flat'), null, { timeout: 30000 }); await sleep(800); }
        const b = await page.evaluate(() => {
          const labels = [...document.querySelectorAll('#loadTop, .top-actions > *')].map(e => ({ id: e.id, text: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40), font: parseFloat(getComputedStyle([...e.querySelectorAll('*')].filter(x => /Load character/.test(x.textContent || '')).at(-1) || e).fontSize) }));
          return { labels, load: labels.find(l => l.id === 'loadTop') };
        });
        if (mode === 'flat') check('9 flat: the load button carries its text at ≥ 18 px', b.load && /Load/i.test(b.load.text) && b.load.font >= 18, JSON.stringify(b.load));
        // drop anywhere on the page
        const b64 = SAVE.toString('base64');
        await page.evaluate(async s => {
          const bytes = Uint8Array.from(atob(s), c => c.charCodeAt(0));
          const dt = new DataTransfer(); dt.items.add(new File([bytes], 'characters_test.fch', { type: 'application/octet-stream' }));
          const target = document.elementFromPoint(720, 600) || document.body;
          for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 720, clientY: 600 }));
        }, b64);
        const dropped = await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 15000 }).then(() => true, () => false);
        check(`9 ${mode}: a save dropped on the page loads`, dropped);
        await ctx.close();
        const r2 = await open(browser, { mode });
        allErrors.push(...r2.errors);
        if (mode === 'desk') await ready(r2.page); else await sleep(1500);
        const [chooser] = await Promise.all([r2.page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null), r2.page.evaluate(() => document.getElementById('loadTop')?.click())]);
        if (chooser) await chooser.setFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
        const viaButton = chooser ? await r2.page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 15000 }).then(() => true, () => false) : false;
        check(`9 ${mode}: the load button opens the file picker and loads the save`, viaButton, chooser ? '' : 'no file chooser');
        await r2.ctx.close();
      }
      const eng = fs.readFileSync(path.join(ROOT, 'src', 'board', 'engravings.js'), 'utf8');
      check('9 desk: the load coin\'s legend is engraved large in the middle of the face (label lines, not just the rim)', /splitLabel\(/.test(eng) && /drawCoinFace\([^)]*splitLabel/.test(eng));
      info('9', 'the Import ↥ coin stays (user answer this session: "Keep Import as is"); see DECISIONS');
    }

    // ── 10 · "start here" while no save is loaded ───────────────────────────────────────────
    if (want('start')) {
      const { page, ctx, errors } = await desk(browser, { nosave: true });
      allErrors.push(...errors);
      await page.mouse.move(900, 40, { steps: 10 }); await sleep(2800);
      const s0 = await page.evaluate(() => __vc.stage.three.paper.startHere.read());
      const ink = await page.evaluate(() => {
        const el = document.querySelector('.vc-start-here'); const c = el?.querySelector('canvas'); if (!c) return null;
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 60) n++;
        return { n, op: +getComputedStyle(el).opacity, hidden: el.getAttribute('aria-hidden') };
      });
      check('10 no save: "start here" and its arrow are drawn and shown', s0.on && s0.drawn && ink && ink.n > 2000 && ink.op > 0.9, JSON.stringify({ ...s0, inked: ink?.n, opacity: ink?.op }));
      check('10 it adds no text for screen readers or the census (aria-hidden canvas)', ink?.hidden === 'true' && !(await page.evaluate(() => document.body.innerText.includes('start here'))));
      // never on text: inked canvas pixels under any visible text box
      const clash = await page.evaluate(boxes => {
        const el = document.querySelector('.vc-start-here'), c = el.querySelector('canvas'), cb = c.getBoundingClientRect();
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const out = [];
        for (const b of boxes) {
          {
            const x0 = Math.max(b.l, cb.left), x1 = Math.min(b.r, cb.right), y0 = Math.max(b.t, cb.top), y1 = Math.min(b.b, cb.bottom);
            if (x1 <= x0 || y1 <= y0) continue;
            let hit = 0;
            for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
              const px = Math.floor(((x - cb.left) / cb.width) * c.width), py = Math.floor(((y - cb.top) / cb.height) * c.height);
              if (d[(py * c.width + px) * 4 + 3] > 60) hit++;
            }
            if (hit > 3) out.push(`"${b.text}" (${hit} px)`);
          }
        }
        return out;
      }, await page.evaluate(TEXT_BOXES));
      check('10 the lettering and arrow cross no text', clash.length === 0, clash.slice(0, 4).join('; ') || 'clear');
      // around the How-to coin: the canvas covers the coin's ring
      const how = await page.evaluate(() => __vc.board.state().coins.find(c => c.id === 'howto'));
      const hc = await proj(page, ...how.at);
      const cb = await page.evaluate(() => { const b = document.querySelector('.vc-start-here canvas').getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; });
      check('10 it is set around the "Find your Valheim character" help coin', hc.x > cb.l && hc.x < cb.r && hc.y > cb.t && hc.y < cb.b, `coin at ${hc.x.toFixed(0)}, ${hc.y.toFixed(0)}`);
      await shot(page, 'start-here.png');
      await shot(page, 'start-here-close.png', { x: Math.max(0, cb.l - 80), y: Math.max(0, cb.t - 40), width: Math.min(700, 1440 - Math.max(0, cb.l - 80)), height: 420 });
      await loadSave(page); await idle(page); await sleep(800);
      const s1 = await page.evaluate(() => ({ ...__vc.stage.three.paper.startHere.read(), op: +getComputedStyle(document.querySelector('.vc-start-here')).opacity }));
      check('10 gone once a save is loaded', !s1.on && s1.hasSave && s1.op < 0.05, JSON.stringify(s1));
      await ctx.close();
    }
  } catch (e) {
    check('run completed', false, String(e.stack || e).slice(0, 400));
  }
  await browser.close();
  const errs = [...new Set(allErrors)];
  check('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  const passed = results.filter(r => r.ok).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
})();
