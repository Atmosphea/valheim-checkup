// Builder self-check for WP-17C (Paul's second feedback round, items 23–30, plus the 17B click/burn overlap).
//   npm run build:single && node tools/wp17c-check.cjs [all|table|highlights|details|facts|close|wiki|bob|stains|overlap] [html]
// Real GPU (Metal), 1440 × 900 at 2× (Paul's Mac). Paul's save from fixtures/private; the character
// name is never printed. Screenshots go to docs/reports/wp-17c/ with the name masked.
// BEFORE=<path to an earlier build> adds that build's Details repaint count (item 29).
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
const SHOTS = path.join(ROOT, 'docs', 'reports', 'wp-17c');
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
  __vc.stage?.markPrintDirty(); __vc.stage?.renderNow();
});
const shot = async (page, name, clip) => { await mask(page); await page.screenshot({ path: path.join(SHOTS, name), ...(clip ? { clip } : {}) }); return name; };
const proj = (page, x, y, z = 0) => page.evaluate(([x, y, z]) => __vc.stage.project(x, y, z), [x, y, z]);

const rect = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);

async function flat(browser, o = {}) {
  const r = await open(browser, { ...o, mode: 'flat' });
  if (o.viewport) await r.page.setViewportSize(o.viewport);
  await r.page.waitForFunction(() => document.body.classList.contains('mode-flat') && !!window.__vc, null, { timeout: 30000 });
  await sleep(800); await loadSave(r.page); await sleep(1200);
  return r;
}
/** Switch the collection (the board's own path: the category button's click). */
async function category(page, title) {
  await page.evaluate(t => document.querySelector(`#categories [data-category="${t}"], #insightNav [data-category="${t}"]`).click(), title);
  await sleep(600); await idle(page); await sleep(400);
}
/** Open Details for the row whose name matches. */
async function details(page, name) {
  await page.evaluate(n => { const r = [...document.querySelectorAll('#items tr')].find(t => t.querySelector('.item-name')?.textContent === n); r.querySelector('[data-details]').click(); }, name);
  await page.waitForFunction(() => document.getElementById('itemDialog').open && !document.querySelector('.vc-unfold'), null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
}
const ORIGINAL_STATUS = ['Remaining (missing + unverified)', 'All items', 'Missing only', 'Completed only', 'Unverified only'];
const MATCHED = 'Matched directly to a saved action identifier. A completion mark indicates a recorded action, not current inventory.';

/** Details layout facts, read in the page. */
const readDialog = page => page.evaluate(() => {
  const d = document.getElementById('itemDialog'), r = d.getBoundingClientRect();
  const q = s => d.querySelector(s);
  const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
  const tools = [...d.querySelectorAll('.vc-dt-toolbar a, .vc-dt-toolbar button')].map(t => ({ text: t.textContent.trim(), icon: !!t.querySelector('svg.vc-dt-ic') || /^☆/.test(t.textContent.trim()) }));
  return {
    open: d.open, rect: { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }, vw: innerWidth, vh: innerHeight,
    overflowX: d.scrollWidth - d.clientWidth,
    width: d.offsetWidth, tools,
    ids: ['detailTitle', 'closeDetails', 'detailBody', 'itemNote', 'saveNote', 'favoriteDetail'].filter(id => document.getElementById(id) && d.contains(document.getElementById(id))),
    corrections: [...d.querySelectorAll('[data-correction]')].map(b => b.dataset.correction),
    link: q('a[href*="weirdgloop"]')?.getAttribute('target'),
    table: !!q('.vc-dt-record .record-comparison'),
    note: box(q('#itemNote')), dialogBox: box(d), dividers: !!q('.vc-dt-note') && getComputedStyle(q('.vc-dt-note')).borderLeftStyle,
    foot: q('.vc-dt-foot')?.textContent || '', body: q('#detailBody')?.textContent || '',
    facts: q('.vc-dt-facts')?.textContent || null, drop: q('.vc-dt-drop b')?.textContent || null,
    dropPx: q('.vc-dt-drop b') ? parseFloat(getComputedStyle(q('.vc-dt-drop b')).fontSize) : 0,
    stains: ['ax', 'ay', 'bx', 'by', 'tx', 'ty'].map(k => d.style.getPropertyValue('--vc-st-' + k)).join(' '),
  };
});

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ARGS });
  const allErrors = [];
  try {
    // ── 23 · default "All items, missing first"; completed rows green with white text ────────
    if (want('table')) {
      for (const mode of ['desk', 'flat']) {
        const { page, ctx, errors } = mode === 'desk' ? await desk(browser) : await flat(browser);
        allErrors.push(...errors);
        await category(page, 'The Trophy Collector');
        const t = await page.evaluate(() => {
          const s = document.getElementById('statusFilter');
          const rows = [...document.querySelectorAll('#items tr[data-item]')];
          const done = rows.find(r => r.classList.contains('row-done'));
          const cs = done ? getComputedStyle(done.querySelector('td:nth-child(2)')) : null;
          const st = done ? getComputedStyle(done.querySelector('.status')) : null;
          const btn = done ? getComputedStyle(done.querySelector('[data-details]')) : null;
          return { value: s.value, options: [...s.options].map(o => o.textContent), order: rows.map(r => r.className.replace('row-', '')), count: document.getElementById('listCount').textContent, bg: cs?.backgroundColor, color: cs?.color, status: st?.color, button: btn?.color };
        });
        const rank = { missing: 0, unknown: 1, done: 2 };
        const sorted = t.order.every((s, i) => i === 0 || rank[t.order[i - 1]] <= rank[s]);
        check(`23 ${mode}: the default is "All items, missing first"; the original five options stay, word for word`, t.value === 'first' && t.options[0] === 'All items, missing first' && JSON.stringify(t.options.slice(1)) === JSON.stringify(ORIGINAL_STATUS), JSON.stringify({ value: t.value, options: t.options }));
        check(`23 ${mode}: every item shown, missing first, then unverified, then completed`, sorted && /^68 of 68/.test(t.count) && t.order[0] === 'missing' && t.order.at(-1) === 'done', `${t.count}; ${t.order.filter(x => x === 'missing').length} missing, ${t.order.filter(x => x === 'done').length} done`);
        const rgbOf = s => (s || '').match(/\d+(\.\d+)?/g)?.map(Number) || [];
        const [r, g, b] = rgbOf(t.bg);
        check(`23 ${mode}: completed rows are green with white text and controls`, g > r + 15 && g > b + 15 && [t.color, t.status, t.button].every(c => /rgb\(255, 255, 255\)/.test(c)), JSON.stringify({ bg: t.bg, text: t.color, status: t.status, button: t.button }));
        // "Remaining" is still there and still hides completed rows
        await page.locator('#statusFilter').selectOption('remaining'); await sleep(300);
        const rem = await page.evaluate(() => ({ count: document.getElementById('listCount').textContent, done: document.querySelectorAll('#items tr.row-done').length }));
        check(`23 ${mode}: "Remaining (missing + unverified)" still filters as before`, rem.done === 0 && /^32 of 68/.test(rem.count), JSON.stringify(rem));
        await page.locator('#statusFilter').selectOption('all'); await sleep(300);
        const all = await page.evaluate(() => [...document.querySelectorAll('#items .item-name')].map(n => n.textContent));
        check(`23 ${mode}: "All items" keeps its alphabetical order`, all.every((n, i) => i === 0 || all[i - 1].localeCompare(n) <= 0), `${all.length} rows`);
        await page.locator('#statusFilter').selectOption('first'); await sleep(300);
        if (mode === 'desk') {
          await page.evaluate(() => { const r = document.querySelector('#items tr.row-done'); r.scrollIntoView({ block: 'center' }); });
          await sleep(600); await shot(page, 'rows-desk.png');
        } else await shot(page, 'rows-flat.png');
        await ctx.close();
      }
    }

    // ── 24 · highlights: big amount left, label, rank right ─────────────────────────────────
    if (want('highlights')) {
      for (const mode of ['desk', 'flat']) {
        const { page, ctx, errors } = mode === 'desk' ? await desk(browser) : await flat(browser);
        allErrors.push(...errors);
        await category(page, 'Highlights'); await sleep(1500);
        const h = await page.evaluate(() => [...document.querySelectorAll('.champion')].slice(0, 5).map(c => {
          const b = c.querySelector('.champion-label > b').getBoundingClientRect(), n = c.querySelector('.champion-label > span').getBoundingClientRect(), k = c.querySelector('.rank').getBoundingClientRect();
          const fs = e => parseFloat(getComputedStyle(c.querySelector(e)).fontSize);
          return { count: c.querySelector('.champion-label > b').textContent, name: c.querySelector('.champion-label > span').textContent.trim(), rank: c.querySelector('.rank').textContent, bx: b.right, nx: n.left, kx: k.left, countPx: fs('.champion-label > b'), namePx: fs('.champion-label > span') };
        }));
        check(`24 ${mode}: amount on the left, then the label, rank on the right (first 5 rows)`, h.length === 5 && h.every((c, i) => c.bx <= c.nx + 1 && c.nx < c.kx && c.rank === String(i + 1)), JSON.stringify(h.map(c => `${c.count} | ${c.name} | ${c.rank}`)));
        check(`24 ${mode}: the amount is big (≥ 2 × the label's size)`, h.every(c => c.countPx >= 2 * c.namePx), `${h[0]?.countPx} px vs ${h[0]?.namePx} px`);
        await shot(page, `highlights-${mode}.png`);
        await ctx.close();
      }
    }

    // ── 25 + 26 · condensed Details, toolbar, small table, narrower note, plain footer, breakpoints; trophy facts ──
    if (want('details') || want('facts')) {
      const views = [
        { mode: 'desk', vp: { width: 1440, height: 900 } },
        { mode: 'flat', vp: { width: 1440, height: 900 } },
        { mode: 'flat', vp: { width: 1024, height: 768 } },
        { mode: 'flat', vp: { width: 768, height: 1024 } },
        { mode: 'flat', vp: { width: 390, height: 844 } },
      ];
      for (const v of views) {
        const { page, ctx, errors } = v.mode === 'desk' ? await desk(browser) : await flat(browser, { viewport: v.vp });
        allErrors.push(...errors);
        await category(page, 'The Trophy Collector');
        await details(page, 'Fader Trophy');
        const d = await readDialog(page);
        const tag = `${v.mode} ${v.vp.width}×${v.vp.height}`;
        if (v === views[0]) {
          check('25 smaller than before (700 px → ≤ 600 px wide)', d.width <= 600, `${d.width} px`);
          check('25 toolbar: wiki reference, use save record, mark completed, mark missing, add count, each with a small icon', d.tools.length === 5 && d.tools.every(t => t.icon) && /Open wiki reference/.test(d.tools[0].text) && /Add count to header/.test(d.tools[4].text), JSON.stringify(d.tools));
          check('25 every original field and control is still in the dialog', d.ids.length === 6 && d.corrections.join() === 'auto,true,false' && d.link === '_blank' && /Bait|Biome/.test(d.body) && /Source:/.test(d.body) && /Use a correction only/.test(d.body) && /Stored only in this browser/.test(d.body), JSON.stringify({ ids: d.ids, corr: d.corrections }));
          check('25 the record and count are a small table; the note is not full width, beside a divider', d.table && d.note.w < d.dialogBox.w * 0.5 && d.dividers === 'solid', `note ${Math.round(d.note.w)} of ${Math.round(d.dialogBox.w)} px`);
          check('25 the "matched directly" line is in plain words in the small footer', !d.body.includes(MATCHED) && /Found under its exact name in your save/.test(d.foot), d.foot.slice(0, 90));
          check('26 a trophy shows its big drop chance and usage under the name (Fader: 100 %, Fader Power)', d.drop === '100%' && /Fader Power/.test(d.facts) && d.dropPx >= 30 && /CC BY-SA 3.0/.test(d.facts), `${d.drop} at ${d.dropPx} px; ${d.facts}`);
          // a correction re-renders the body: still laid out, still the same controls
          await page.evaluate(() => document.querySelector('[data-correction="true"]').click()); await sleep(400);
          const d2 = await readDialog(page);
          check('25 after a correction (app.js re-writes the body) the layout and controls come back the same', d2.tools.length === 5 && d2.ids.length === 6 && d2.facts === d.facts, JSON.stringify(d2.tools.map(t => t.text)));
          await page.evaluate(() => document.querySelector('[data-correction="auto"]').click()); await sleep(300);
          await shot(page, 'details-desk.png');
          // no entry: show nothing (a non-trophy)
          await page.keyboard.press('Escape'); await sleep(1800);
          await category(page, 'The Artisan');
          const first = await page.evaluate(() => document.querySelector('#items .item-name').textContent);
          await details(page, first);
          const d3 = await readDialog(page);
          check('26 an item without an entry shows no facts', d3.facts === null, `${first}: ${d3.facts}`);
          await page.keyboard.press('Escape'); await sleep(1500);
        }
        const inside = d.rect.x >= 0 && d.rect.r <= d.vw + 0.5 && d.rect.y >= -0.5 && d.rect.b <= d.vh + 0.5;
        check(`25 ${tag}: the sheet fits the screen, no sideways scroll`, inside && d.overflowX <= 1, JSON.stringify({ rect: d.rect, overflowX: d.overflowX }));
        if (v.vp.width === 390) await shot(page, 'details-390.png');
        if (v.vp.width === 768) await shot(page, 'details-768.png');
        await ctx.close();
      }
    }

    // ── 27 · close = burn away in about 1 s; the dim just fades ─────────────────────────────
    if (want('close')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      await category(page, 'The Trophy Collector');
      await details(page, 'Fader Trophy');
      const box = await rect(page, '#itemDialog');
      await page.evaluate(() => {
        window.__burn = { t: [], end: null, gone: null };
        const t0 = performance.now(); window.__burn.t0 = t0;
        const tick = () => {
          const s = document.querySelector('.vc-burn-sheet'), dim = document.querySelector('.vc-burn-dim');
          const now = performance.now() - window.__burn.t0;
          if (s) window.__burn.t.push({ t: now, clip: s.style.clipPath.slice(0, 12), dim: dim ? +getComputedStyle(dim).opacity : null, ash: !!document.querySelector('.vc-burn-ash') });
          if (s && s.style.clipPath === 'inset(50%)' && window.__burn.end === null) window.__burn.end = now;
          if (!document.querySelector('.vc-burn') && window.__burn.t.length && window.__burn.gone === null) window.__burn.gone = now;
          if (now < 4000) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      // a click on the paper outside the sheet (left of it), on the dim
      const at = { x: Math.max(4, box.x - 40), y: box.y + box.h * 0.6 };
      await page.mouse.click(at.x, at.y);
      await sleep(4000);
      const b = await page.evaluate(() => { const B = window.__burn; const start = B.t[0]?.t ?? 0; return { start, end: B.end - start, gone: B.gone - start, t: B.t.filter((_, i) => i % 6 === 0).slice(0, 14), first: B.t.find(x => x.clip) }; });
      const st = await page.evaluate(() => ({ dlg: document.getElementById('itemDialog').open, unfoldRuns: __vc.surfaces?.unfold?.state?.().runs.length ?? null, burn: document.querySelectorAll('.vc-burn').length, focus: document.activeElement?.dataset?.details || null }));
      const ember = await page.evaluate(() => !!document.querySelector('script') && true);
      check('27 a click outside closes the dialog at once (app.js sees the close) and the sheet burns where it was', !st.dlg && b.first && /^path\(evenodd/.test(b.first.clip), JSON.stringify(b.first));
      info('27 burn copy appeared', `${Math.round(b.start)} ms after the probe started (the click itself is in between)`);
      check('27 burned to nothing in about 1 s (0.9–1.25 s from the copy appearing), with ash floating on after it', b.end > 850 && b.end < 1250 && b.gone > b.end, `burnt at ${Math.round(b.end)} ms, last ash gone at ${Math.round(b.gone)} ms`);
      const dims = b.t.map(x => x.dim).filter(x => x !== null);
      check('27 the dim simply fades out (monotone to 0 within 0.6 s), no fold-back sequence', dims[0] <= 1 && dims.every((x, i) => i === 0 || x <= dims[i - 1] + 1e-3) && st.unfoldRuns === 0 && st.burn === 0, JSON.stringify({ dims: dims.map(x => +x.toFixed(2)), unfoldRuns: st.unfoldRuns }));
      check('27 focus goes back to the row\'s Details button', !!st.focus, String(st.focus));
      void ember;
      // the ember canvas uses render.js ember colours: sample the shot for orange pixels around the front
      await details(page, 'Boar Trophy');
      const box2 = await rect(page, '#itemDialog');
      await page.mouse.click(Math.max(4, box2.x - 40), box2.y + box2.h * 0.6); await sleep(420);
      await shot(page, 'burn-mid.png');
      await sleep(2600);
      const { data, info: i } = await sharp(path.join(SHOTS, 'burn-mid.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let hot = 0;
      for (let k = 0; k < data.length; k += 3) { const r = data[k], g = data[k + 1], bb = data[k + 2]; if (r > 200 && g > 50 && g < 200 && bb < 100 && r - bb > 130) hot++; }
      check('27 live ember edges (orange pixels on the burn front)', hot > 2000, `${hot} ember pixels of ${i.width * i.height}`);
      // Escape also burns (from the lower left corner)
      await details(page, 'Fader Trophy');
      await page.keyboard.press('Escape'); await sleep(80);
      const esc = await page.evaluate(() => ({ burning: !!document.querySelector('.vc-burn-sheet'), open: document.getElementById('itemDialog').open }));
      check('27 Escape burns it away too', esc.burning && !esc.open, JSON.stringify(esc));
      await sleep(2500);
      await ctx.close();
    }

    // ── 28 · wiki link: a normal new-tab link; the letter stays, nothing burns ───────────────
    if (want('wiki')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      await ctx.route('https://valheim.weirdgloop.org/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>wiki</title>' }));
      await category(page, 'The Trophy Collector');
      await details(page, 'Fader Trophy');
      const link = page.locator('#itemDialog a[href*="weirdgloop"]');
      const attrs = await link.evaluate(a => ({ target: a.target, rel: a.rel, href: a.href }));
      // the sheet bobs, so Playwright's "stable" wait never ends: a plain mouse click at its centre
      const lb = await link.boundingBox();
      const sheets = () => page.evaluate(() => [...document.querySelectorAll('#float > *')].filter(e => !e.hidden && e.offsetParent !== null && getComputedStyle(e).display !== 'none' && !e.matches('#toast, .vc-ripple')).map(e => e.className).join(' | '));
      const before = await sheets();
      const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }), page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2)]);
      await sleep(600);
      const s = await page.evaluate(() => ({ open: document.getElementById('itemDialog').open, burn: document.querySelectorAll('.vc-burn').length }));
      s.sheets = await sheets(); s.same = s.sheets === before;
      check('28 the wiki reference opens the real wiki page in a new tab', attrs.target === '_blank' && /noopener/.test(attrs.rel) && /valheim\.weirdgloop\.org\/w\/Fader_Trophy/.test(popup.url()), `${popup.url()}`);
      check('28 the letter stays open, nothing burns, no second paper', s.open && s.burn === 0 && s.same, JSON.stringify(s));
      await popup.close();
      await ctx.close();
    }

    // ── 29 · the print rides the sheet's bob exactly ────────────────────────────────────────
    if (want('bob')) {
      const paints = async html => {
        const { page, ctx, errors } = await desk(browser, { html });
        if (html === HTML) allErrors.push(...errors);
        await category(page, 'The Trophy Collector');
        await details(page, 'Fader Trophy');
        await sleep(1500);
        const box = await rect(page, '#itemDialog');
        await page.mouse.move(box.x + box.w / 2, box.y + 12); await sleep(800);
        const t0 = await page.evaluate(() => getComputedStyle(document.getElementById('itemDialog')).transform);
        // how often the dialog's own compositing layer is repainted (CDP LayerTree.layerPainted)
        const cdp = await page.context().newCDPSession(page);
        const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#itemDialog' });
        const { node } = await cdp.send('DOM.describeNode', { nodeId });
        let layers = []; const painted = {};
        cdp.on('LayerTree.layerTreeDidChange', e => { if (e.layers) layers = e.layers; });
        cdp.on('LayerTree.layerPainted', e => { painted[e.layerId] = (painted[e.layerId] || 0) + 1; });
        await cdp.send('LayerTree.enable');
        await sleep(500);
        for (const k in painted) delete painted[k];
        const f0 = await page.evaluate(() => __vc.stage.stats().frames);
        await sleep(3000);
        const f1 = await page.evaluate(() => __vc.stage.stats().frames);
        const t1 = await page.evaluate(() => getComputedStyle(document.getElementById('itemDialog')).transform);
        const mine = layers.filter(l => l.backendNodeId === node.backendNodeId).map(l => l.layerId);
        const sheet = { length: mine.reduce((n, id) => n + (painted[id] || 0), 0) };
        info('29 dialog layer repaints over 3 s' + (html === HTML ? '' : ' (before)'), `${sheet.length} repaints, ${f1 - f0} desk frames, layers ${mine.join(',')}`);
        const st = await page.evaluate(() => { const d = document.getElementById('itemDialog'); return { willChange: d.style.willChange, shadowOnSheet: d.style.boxShadow, shade: !!d.previousElementSibling?.classList.contains('vc-float-shadow') }; });
        await ctx.close();
        return { paints: sheet.length, moved: t0 !== t1, ...st };
      };
      const now = await paints(HTML);
      numbers.bob = { now };
      if (BEFORE) numbers.bob.before = await paints(BEFORE);
      check('29 the sheet bobs (transform changes) but its layer is not repainted over 3 s (≤ 2): print and paper move as one', now.moved && now.paints <= 2, JSON.stringify(numbers.bob));
      check('29 the sheet is rastered once (will-change, compositor bob) and its shadow is a separate element', now.willChange === 'transform' && !now.shadowOnSheet && now.shade, JSON.stringify(now));
    }

    // ── 30 · per-item stains from the id ────────────────────────────────────────────────────
    if (want('stains')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      await category(page, 'The Trophy Collector');
      const get = async n => { await details(page, n); const s = (await readDialog(page)).stains; await page.keyboard.press('Escape'); await sleep(1600); return s; };
      const a1 = await get('Fader Trophy'), b1 = await get('Boar Trophy'), a2 = await get('Fader Trophy');
      check('30 stains seeded from the id: the same item gets the same stains, another item different ones', a1 && a1 === a2 && a1 !== b1, JSON.stringify({ fader: a1, boar: b1, faderAgain: a2 }));
      const sizes = await page.evaluate(() => { const d = document.getElementById('itemDialog'); const cs = getComputedStyle(d); return cs.backgroundImage.match(/rgba\([^)]*\)/g)?.slice(0, 4); });
      check('30 as subtle as before: the same washes (0.55 light, 0.16 brown) and the same paper tile', JSON.stringify(sizes) === JSON.stringify(['rgba(255, 250, 235, 0.55)', 'rgba(255, 250, 235, 0)', 'rgba(150, 105, 55, 0.16)', 'rgba(150, 105, 55, 0)']), JSON.stringify(sizes));
      await ctx.close();
    }

    // ── 17B overlap: a plain click on the desk zooms (no burn mark); a drag burns ─────────────
    if (want('overlap')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      await page.evaluate(() => __vc.woodBurn.clear());
      // bare desk wood right of the paper (the sheet ends at x 48)
      // bare desk wood on screen in the default framing (right of / below the paper), clear of controls
      const pt = await page.evaluate(() => { for (let x = 1430; x > 900; x -= 10) for (let y = 880; y > 300; y -= 10) { const w = __vc.woodBurn.at(x, y); if (w && w.on === 'desk' && !document.elementFromPoint(x, y)?.closest('button, a, input, select, textarea, [role="slider"], [tabindex], .vc-coin-print')) return { x, y }; } return null; });
      if (!pt) throw new Error('no bare desk point found');
      await page.mouse.move(pt.x, pt.y, { steps: 6 }); await sleep(1200);
      const z0 = (await page.evaluate(() => __vc.stage.camera.read())).zoom;
      const b0 = await page.evaluate(() => __vc.woodBurn.state());
      await page.mouse.click(pt.x, pt.y); await sleep(1400);
      const c1 = await page.evaluate(() => __vc.stage.camera.read());
      const b1 = await page.evaluate(() => __vc.woodBurn.state());
      check('17B overlap: a plain click on the desk toggles the 30 % zoom', c1.main.click && Math.abs(c1.zoom / z0 - 1.3) < 0.06, `zoom ${z0.toFixed(3)} → ${c1.zoom.toFixed(3)}`);
      check('17B overlap: the plain click leaves no burn mark', b1.points === b0.points && b1.strokes === b0.strokes, JSON.stringify({ before: b0, after: b1 }));
      await page.mouse.click(pt.x, pt.y); await sleep(1400);
      const z1 = (await page.evaluate(() => __vc.stage.camera.read())).zoom;
      // a drag on the same wood burns (the whole desk in view first, like wp17b)
      await page.mouse.move(700, 70, { steps: 6 }); await sleep(2000);
      const q = await page.evaluate(() => { for (let x = 1430; x > 900; x -= 10) for (let y = 880; y > 300; y -= 10) { const w = __vc.woodBurn.at(x, y); if (w && w.on === 'desk' && !document.elementFromPoint(x, y)?.closest('button, a, input, select, textarea, [role="slider"], [tabindex], .vc-coin-print')) return { x, y }; } return null; });
      const zBefore = await page.evaluate(() => __vc.stage.camera.read().main.click);
      await page.mouse.move(q.x, q.y); await page.mouse.down(); await page.mouse.move(q.x - 40, q.y - 8, { steps: 12 }); await page.mouse.up(); await sleep(300);
      const b2 = await page.evaluate(() => __vc.woodBurn.state());
      const zAfter = await page.evaluate(() => __vc.stage.camera.read().main.click);
      check('17B overlap: a drag on the desk burns a line', b2.points > b1.points + 4, JSON.stringify(b2));
      info('17B overlap: second click ended the zoom; the drag did not start one', `zoom back ${z1.toFixed(3)}; click zoom before/after drag ${zBefore}/${zAfter}`);
      await page.evaluate(() => __vc.woodBurn.clear());
      await ctx.close();
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
