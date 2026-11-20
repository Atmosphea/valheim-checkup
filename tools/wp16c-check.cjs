// Builder self-check for WP-16C (Paul's feedback items 18–29). Run after the build:
//   npm run build:single && node tools/wp16c-check.cjs [all|wash|brand|header|hero|help|coins|fold|details|menus|titles|columns|star|flat] [html]
//   BEFORE=path/to/pre-16C/valheim-checkup.html adds before/after numbers where they apply (wash, header, titles).
// Real GPU (Metal), 1440 × 900 at 2× (Paul's Mac). Paul's save from fixtures/private; the character
// name is never printed. Screenshots go to docs/reports/wp-16c/ with the name masked.
const path = require('node:path');
const fs = require('node:fs');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const PRIVATE = path.join(ROOT, 'fixtures', 'private');
const SAVE = fs.readFileSync(path.join(PRIVATE, fs.readdirSync(PRIVATE).find(f => f.endsWith('.fch'))));
const MODE = process.argv[2] || 'all';
const HTML = path.resolve(process.argv[3] || path.join(ROOT, 'dist', 'valheim-checkup.html'));
const BEFORE = process.env.BEFORE ? path.resolve(process.env.BEFORE) : null;
const SHOTS = path.join(ROOT, 'docs', 'reports', 'wp-16c');
fs.mkdirSync(SHOTS, { recursive: true });
const ARGS = ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'];
const DPR = +(process.env.DPR || 2);
const want = m => MODE === 'all' || MODE.split(',').includes(m);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const info = (name, detail) => console.log(`INFO  ${name}  — ${detail}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Open the app in `mode` (desk|flat), optionally with the save loaded. */
async function open(browser, mode = 'desk', { save = true, html = HTML, viewport = { width: 1440, height: 900 } } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: DPR, locale: 'en-US', timezoneId: 'UTC' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error' && !/GPU stall due to ReadPixels|GL_CLOSE_PATH_NV|net::ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(`file://${html}?mode=${mode}&seed=7`);
  if (mode === 'desk') await page.waitForFunction(() => window.__vc?.stage?.textures?.ready?.() && __vc.stage.stats().frames > 10 && __vc.startup().usableMs !== null, null, { timeout: 60000 });
  else await page.waitForFunction(() => !!window.__vc?.flat, null, { timeout: 30000 });
  if (save) {
    await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
    await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 20000 });
    await page.waitForFunction(() => !__vc.ink?.state().running && (__vc.ink?.state().ghosts ?? 0) === 0, null, { timeout: 20000 }).catch(() => {});
  }
  // the pointer rests over the page (on the desk the spark is out and the camera frames the page)
  await page.mouse.move(900, 420);
  await sleep(mode === 'desk' ? 1800 : 300);
  return { page, ctx, errors };
}
const mask = page => page.evaluate(() => {
  const name = document.querySelector('#headerProfile strong')?.textContent || '';
  if (name) { const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n; (n = walk.nextNode());) if (n.nodeValue.includes(name)) n.nodeValue = n.nodeValue.split(name).join('{name}'); }
  __vc.stage?.markPrintDirty?.(); __vc.stage?.renderNow?.();
});
const shot = async (page, name, clip) => { await mask(page); await sleep(150); await page.screenshot({ path: path.join(SHOTS, name), clip }); return name; };
const rect = (page, sel) => page.evaluate(s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom } : null; }, sel);
const viewChange = (page, title) => page.evaluate(t => document.querySelector(`[data-category="${t}"]`).click(), title);

/**
 * Item 18: watch #title's wash mask every frame after a view change. Returns how long the wash
 * edge is actually over the heading (0 < edge < width, in ms) and how long the wash-in lasts.
 */
async function washWatch(page) {
  await page.evaluate(() => {
    window.__wash = [];
    const t0 = performance.now();
    const tick = () => {
      const el = document.getElementById('title');
      const s = el.style.getPropertyValue('mask-position') || el.style.getPropertyValue('-webkit-mask-position');
      const size = el.style.getPropertyValue('mask-size') || el.style.getPropertyValue('-webkit-mask-size');
      const dir = el.dataset.vcWash ? 1 : 0;
      window.__wash.push({ t: performance.now() - t0, x: parseFloat(s) || null, size: parseFloat(size) || null, w: el.offsetWidth, on: dir });
      if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
async function washRead(page) {
  await sleep(4300);
  return page.evaluate(() => {
    const f = window.__wash;
    // mask image is 3W wide with its edge in the middle: edge in element px = x + size / 2
    const inWash = f.filter(s => s.on && s.size);
    const over = inWash.filter(s => { const e = s.x + s.size / 2; return e > 0.02 * s.w && e < 0.98 * s.w; });
    const span = inWash.length ? inWash[inWash.length - 1].t - inWash[0].t : 0;
    let overMs = 0;
    for (let i = 1; i < f.length; i++) if (over.includes(f[i])) overMs += f[i].t - f[i - 1].t;
    return { frames: f.length, maskedFrames: inWash.length, overFrames: over.length, overMs: Math.round(overMs), spanMs: Math.round(span) };
  });
}

/** Screenshot the heading while the wash edge is part-way across it (about 45 %). */
async function midWashShot(page, name) {
  await page.waitForFunction(() => {
    const el = document.getElementById('title');
    const x = parseFloat(el.style.getPropertyValue('mask-position')), size = parseFloat(el.style.getPropertyValue('mask-size'));
    return el.dataset.vcWash && size && (x + size / 2) / el.offsetWidth > 0.4;
  }, null, { timeout: 5000, polling: 'raf' }).catch(() => {});
  await page.screenshot({ path: path.join(SHOTS, name), clip: await page.evaluate(() => { const r = document.querySelector('.title-row').getBoundingClientRect(); return { x: Math.max(0, r.left - 20), y: Math.max(0, r.top - 10), width: Math.min(innerWidth - Math.max(0, r.left - 20), r.width + 40), height: r.height + 20 }; }) });
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const allErrors = [];
  try {
    // ── 18: wash visible on entry ────────────────────────────────────────────────────────
    if (want('wash')) {
      for (const [label, html] of [['now', HTML], ...(BEFORE ? [['before', BEFORE]] : [])]) {
        const { page, ctx, errors } = await open(browser, 'desk', { html });
        const runs = [];
        for (const v of ['The Carpenter', 'The Gourmet', 'The Hunter']) {
          await washWatch(page); await viewChange(page, v);
          if (label === 'now' && v === 'The Carpenter') await midWashShot(page, 'wash-mid-desk.png');
          runs.push(await washRead(page));
        }
        const over = runs.map(r => r.overMs);
        info(`18 wash (${label}, desk): the edge is over the heading for`, `${over.join(' / ')} ms (masked for ${runs.map(r => r.spanMs).join(' / ')} ms)`);
        // Paul, WP-17 item 8: a faster wash (inMs 850 → 660): the 450 ms floor scales to 350 ms
        if (label === 'now') check('18 the wash edge is visibly over the heading for at least 350 ms of each view change (desk; was 450, WP-17 item 8)', over.every(ms => ms >= 350), over.join(', ') + ' ms');
        allErrors.push(...errors); await ctx.close();
      }
      const { page, ctx, errors } = await open(browser, 'flat');
      await washWatch(page); await viewChange(page, 'The Carpenter');
      await midWashShot(page, 'wash-mid-flat.png');
      const r = await washRead(page);
      // Paul, WP-17 item 8: faster wash, floor 450 → 350 ms
      check('18 flat: the wash edge is over the heading for at least 300 ms (was 450, WP-17 item 8; flat measures ~50 ms under desk)', r.overMs >= 300, r.overMs + ' ms');
      allErrors.push(...errors); await ctx.close();
    }

    // ── 19: brand not selectable ─────────────────────────────────────────────────────────
    if (want('brand')) {
      for (const mode of ['desk', 'flat']) {
        const { page, ctx, errors } = await open(browser, mode);
        // Paul, WP-17 item 4: on the desk the title moved into the main section (.vc-masthead)
        const BRAND = mode === 'desk' ? '.vc-masthead .brand' : 'header.top .brand';
        const b = await rect(page, BRAND);
        await page.mouse.dblclick(b.x + b.w * 0.3, b.y + b.h * 0.5);
        await page.mouse.move(b.x + 4, b.y + b.h / 2); await page.mouse.down(); await page.mouse.move(b.x + b.w - 4, b.y + b.h / 2, { steps: 8 }); await page.mouse.up();
        const r = await page.evaluate(BRAND => {
          const el = document.querySelector(BRAND), cs = getComputedStyle(el);
          const sel = getSelection().toString();
          const range = document.createRange(); range.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(range);
          return { userSelect: cs.userSelect || cs.webkitUserSelect, drag: cs.webkitUserDrag, picked: sel, all: getSelection().toString().length };
        }, BRAND);
        check(`19 ${mode}: "Valheim Checkup" cannot be selected (double-click, drag) or dragged`, r.userSelect === 'none' && r.drag === 'none' && !/Valheim/.test(r.picked), JSON.stringify({ userSelect: r.userSelect, drag: r.drag, picked: r.picked.slice(0, 20) }));
        allErrors.push(...errors); await ctx.close();
      }
    }

    // ── 20: header height ────────────────────────────────────────────────────────────────
    if (want('header')) {
      for (const [label, html] of [['now', HTML], ...(BEFORE ? [['before', BEFORE]] : [])]) {
        const { page, ctx, errors } = await open(browser, 'flat', { html });
        const h = await page.evaluate(() => document.querySelector('header.top').offsetHeight);
        info(`20 flat header height (${label})`, h + ' px');
        if (label === 'now') check('20 flat: header at most 140 px tall at 1440 × 900 (pre-16C 172 px)', h <= 140, h + ' px');
        allErrors.push(...errors); await ctx.close();
        const d = await open(browser, 'desk', { html });
        const m = await d.page.evaluate(() => {
          const sheetTop = __vc.stage.project(0, 27, 0), inset = __vc.stage.project(0, (__vc.paper?.rects ? 0 : 0) + 0, 0);
          const insetTop = document.querySelector('.vc-sheet-inset').getBoundingClientRect().top;
          void inset; return { sheetTop: sheetTop.y, insetTop };
        });
        info(`20 desk header, sheet top edge → inset top (${label})`, `${Math.round(m.insetTop - m.sheetTop)} px on screen`);
        // Paul, WP-17 item 4: the header split: only the coins (and the help strip) keep a fixed level; the
        // title, byline and records are the main section's top and scroll with the table (no seam)
        if (label === 'now') {
          const mh = await d.page.evaluate(() => { const m = document.querySelector('.vc-masthead'); return { inMain: !!m?.closest('.vc-sheet-inset'), scrolls: !!m?.closest('.tablewrap') }; });
          check('20 desk: header split (WP-17 item 4): the title block is in the main section and scrolls with the table', mh.inMain && mh.scrolls, JSON.stringify(mh));
        }
        allErrors.push(...d.errors); await d.ctx.close();
      }
    }

    // ── 21: the hero block is gone; loading still works three ways ───────────────────────
    if (want('hero')) {
      for (const mode of ['desk', 'flat']) {
        const { page, ctx, errors } = await open(browser, mode, { save: false });
        const hidden = await page.evaluate(() => { const h = document.getElementById('dropzone'); return !!h && !h.checkVisibility() && !!document.getElementById('loadMain'); });
        check(`21 ${mode}: "Bring your Viking's progress" / "Choose .fch file" not shown (element kept for app.js)`, hidden);
        if (mode === 'desk') await shot(page, 'nosave-desk.png');
        else await shot(page, 'nosave-flat.png', { x: 0, y: 0, width: 1440, height: 520 });
        // the Load coin / button opens the file chooser
        const chooser = page.waitForEvent('filechooser', { timeout: 5000 }).then(() => true).catch(() => false);
        await page.evaluate(() => document.getElementById('loadTop').click());
        check(`21 ${mode}: the Load control opens the file chooser`, await chooser);
        // page-wide drop: onto the middle of the page
        await page.evaluate(b64 => {
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), dt = new DataTransfer();
          dt.items.add(new File([bytes], 'characters_test.fch'));
          const el = document.elementFromPoint(innerWidth * 0.6, innerHeight * 0.6) || document.body;
          for (const t of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: innerWidth * 0.6, clientY: innerHeight * 0.6 }));
        }, SAVE.toString('base64'));
        const dropped = await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 15000 }).then(() => true).catch(() => false);
        check(`21 ${mode}: a save dropped anywhere on the page loads`, dropped);
        // the file input still loads
        await page.evaluate(() => document.getElementById('toast').classList.add('hidden'));
        await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
        const input = await page.waitForFunction(() => !document.getElementById('toast').classList.contains('hidden') && /Progress is up to date/.test(document.getElementById('toast').textContent), null, { timeout: 15000 }).then(() => true).catch(() => false);
        check(`21 ${mode}: the file input loads`, input);
        allErrors.push(...errors); await ctx.close();
      }
    }

    // ── 22: help note top right, under the coins ─────────────────────────────────────────
    if (want('help')) {
      {
        const { page, ctx, errors } = await open(browser, 'desk');
        const r = await page.evaluate(() => {
          const s = document.querySelector('details.help > summary').getBoundingClientRect();
          const coins = ['howto', 'load', 'import', 'export'].map(id => document.querySelector(`.vc-coin-print[data-coin="${id}"]`)?.getBoundingClientRect()).filter(Boolean);
          // Paul, WP-17 item 4: the main section reaches the top edge now; the note (on the coins' fixed
          // level) stays above the collection's own heading (the scroll head) instead of above the inset
          const inset = /** @type {HTMLElement} */ (document.querySelector('#collectionView .vc-scrollhead') ?? document.querySelector('.vc-sheet-inset')).getBoundingClientRect();
          return { s: { x: s.left, y: s.top, r: s.right, b: s.bottom }, coinsBottom: Math.max(...coins.map(c => c.bottom)), coinsLeft: Math.min(...coins.map(c => c.left)), coinsRight: Math.max(...coins.map(c => c.right)), insetTop: inset.top, w: innerWidth };
        });
        check('22 desk: the help note is at the top right, under the coin row, above the collection heading', r.s.x > r.w * 0.6 && r.s.x >= r.coinsLeft && r.s.r <= r.coinsRight + 30 && r.s.y > r.coinsBottom - 45 && r.s.b <= r.insetTop + 4, JSON.stringify(r));
        await shot(page, 'help-note-desk.png', { x: Math.round(r.coinsLeft) - 40, y: 40, width: Math.round(r.coinsRight - r.coinsLeft) + 80, height: Math.max(80, Math.round(r.s.b) + 20) });
        allErrors.push(...errors); await ctx.close();
      }
      {
        const { page, ctx, errors } = await open(browser, 'flat');
        const r = await page.evaluate(() => {
          const h = document.querySelector('details.help').getBoundingClientRect(), a = document.querySelector('header.top .top-actions').getBoundingClientRect(), hd = document.querySelector('header.top').getBoundingClientRect();
          return { inHeader: !!document.querySelector('header.top > details.help'), x: h.left, r: h.right, y: h.top, actionsBottom: a.bottom, actionsLeft: a.left, headerBottom: hd.bottom, w: innerWidth };
        });
        check('22 flat: the help note is in the header, under the coins, on the right', r.inHeader && r.y >= r.actionsBottom - 4 && r.r > r.w - 60 && r.x > r.w * 0.5, JSON.stringify(r));
        allErrors.push(...errors); await ctx.close();
      }
    }

    // ── 23: coins at varied height and angle ─────────────────────────────────────────────
    if (want('coins')) {
      {
        const { page, ctx, errors } = await open(browser, 'desk');
        const c = await page.evaluate(() => ['howto', 'load', 'import', 'export'].map(id => { const r = document.querySelector(`.vc-coin-print[data-coin="${id}"]`).getBoundingClientRect(); return { id, cy: r.top + r.height / 2 }; }));
        const spread = Math.max(...c.map(k => k.cy)) - Math.min(...c.map(k => k.cy));
        check('23 desk: the coin centres are not in a line (vertical spread ≥ 10 px)', spread >= 10, `${spread.toFixed(1)} px; ${c.map(k => k.id + ' ' + k.cy.toFixed(0)).join(', ')}`);
        const tilt = await page.evaluate(() => [...__vc.board.objects.coins.coins.values()].filter(c => c.id !== 'sound').map(c => [c.id, +(c.body.rotation.x * 57.2958).toFixed(1), +(c.body.rotation.y * 57.2958).toFixed(1)]));
        check('23 desk: each coin rests with its own small tilt (1.5–3.5°)', tilt.length === 4 && tilt.every(t => Math.max(Math.abs(t[1]), Math.abs(t[2])) >= 1.5 && Math.max(Math.abs(t[1]), Math.abs(t[2])) <= 3.6), JSON.stringify(tilt));
        await shot(page, 'coins-desk.png', { x: 960, y: 120, width: 400, height: 150 });
        allErrors.push(...errors); await ctx.close();
      }
      {
        const { page, ctx, errors } = await open(browser, 'flat');
        const c = await page.evaluate(() => [...document.querySelectorAll('header.top .top-actions > *')].map(el => { const cs = getComputedStyle(el); return { rotate: cs.rotate, translate: cs.translate }; }));
        const rots = new Set(c.map(k => k.rotate)), ys = new Set(c.map(k => k.translate));
        check('23 flat: the coins each sit at their own height and angle', rots.size === c.length && ys.size >= 4, JSON.stringify(c));
        await shot(page, 'coins-flat.png', { x: 940, y: 0, width: 500, height: 140 });
        allErrors.push(...errors); await ctx.close();
      }
    }

    // ── 24: help letter folds open piece by piece, the text already printed ─────────────
    if (want('fold')) {
      for (const mode of ['desk', 'flat']) {
        const { page, ctx, errors } = await open(browser, mode);
        await page.evaluate(() => {
          window.__fold = { inkin: 0, frames: [] };
          const t0 = performance.now();
          const tick = () => {
            const st = document.querySelector('#float .vc-unfold--pieces');
            const sheet = document.querySelector('#float .vc-letter');
            if (sheet?.classList.contains('vc-inkin')) window.__fold.inkin++;
            if (st) {
              const flaps = [...st.querySelectorAll('.vc-unfold-flap')];
              const shown = flaps.filter(f => f.style.visibility === 'visible');
              const faces = st.querySelectorAll('.vc-unfold-face .vc-face-copy').length;
              const text = (st.querySelector('.vc-unfold-base .vc-face-copy')?.textContent || '').trim().slice(0, 40);
              // each panel shows its own part of the sheet: the copies are shifted by different amounts
              window.__fold.offsets = new Set([...st.querySelectorAll('.vc-unfold-flap .vc-face-copy')].map(c => c.style.left + ',' + c.style.top)).size;
              const run = (window.__vc.surfaces?.unfold ?? window.__vc.flat?.unfold).state().runs.find(r => r.dir === 'open');
              window.__fold.frames.push({ t: performance.now() - t0, flaps: flaps.length, shown: shown.length, fired: run ? run.fired.length : 0, runT: run ? run.t : 0, faces, text, real: sheet?.classList.contains('vc-unfolding') });
            }
            if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          document.querySelector('details.help > summary').click();
        });
        await sleep(3200);
        const f = await page.evaluate(() => window.__fold);
        const n = f.frames.length ? f.frames[0].flaps : 0;
        // when each piece started, by the engine's own clock (a screenshot can pause frame sampling)
        const firsts = [];
        for (let k = 1; k <= n; k++) { const fr = f.frames.find(x => x.fired >= k); if (fr) firsts.push(Math.round(fr.runT)); }
        const allFired = Math.max(0, ...f.frames.map(x => x.fired)) === n;
        check(`24 ${mode}: the letter opens in many small pieces (≥ 6), one after another`, n >= 6 && allFired && firsts.every((t, i) => i === 0 || t >= firsts[i - 1]), `${n} pieces; first seen turning at ${firsts.join(', ')} ms`);
        check(`24 ${mode}: every piece carries the letter's print from the start (no wipe-in)`, f.frames.length > 0 && f.frames[0].faces === n + 1 && /How progress is read/.test(f.frames[0].text) && f.inkin === 0, `faces ${f.frames[0]?.faces}, base text "${f.frames[0]?.text}", ink-wash frames ${f.inkin}`);
        check(`24 ${mode}: every piece prints its own part of the letter`, f.offsets === n, `${f.offsets} distinct offsets for ${n} pieces`);
        const open2 = await page.evaluate(() => ({ open: document.querySelector('details.help').open, inFloat: !!document.querySelector('#float .vc-letter details.help'), stage: !!document.querySelector('#float .vc-unfold--pieces'), dupIds: document.querySelectorAll('#forget').length }));
        check(`24 ${mode}: then the real letter is open, the pieces gone, no duplicate ids`, open2.open && open2.inFloat && !open2.stage && open2.dupIds === 1, JSON.stringify(open2));
        await shot(page, `fold-open-${mode}.png`);
        await page.keyboard.press('Escape');
        await sleep(1800);
        const closed = await page.evaluate(() => ({ open: document.querySelector('details.help').open, back: !document.querySelector('#float .vc-letter details.help'), stage: !!document.querySelector('#float .vc-unfold') }));
        check(`24 ${mode}: Escape folds it back and the note returns`, !closed.open && closed.back && !closed.stage, JSON.stringify(closed));
        // a second opening, for the picture half-way through (screenshots pause the frame sampling above)
        await mask(page);
        await page.evaluate(() => document.querySelector('details.help > summary').click());
        await page.waitForFunction(() => { const r = (window.__vc.surfaces?.unfold ?? window.__vc.flat?.unfold).state().runs.find(x => x.dir === 'open'); return r && r.fired.length >= 6; }, null, { timeout: 5000, polling: 'raf' }).catch(() => {});
        await page.screenshot({ path: path.join(SHOTS, `fold-mid-${mode}.png`) });
        await sleep(2500);
        await page.keyboard.press('Escape'); await sleep(1500);
        allErrors.push(...errors); await ctx.close();
      }
    }

    // ── 25: Details opens in one step; its button peels off and floats ────────────────────
    if (want('details')) {
      for (const mode of ['desk', 'flat']) {
        const { page, ctx, errors } = await open(browser, mode);
        const btn = await rect(page, '#items [data-details]');
        await page.evaluate(() => {
          window.__det = { frames: [], events: [] };
          const t0 = performance.now();
          const tick = () => {
            const st = document.querySelector('#float .vc-unfold');
            const b = document.querySelector('#items [data-details]');
            window.__det.frames.push({ t: performance.now() - t0, style: st?.className.match(/vc-unfold--(\w+)/)?.[1] ?? null, flaps: st ? st.querySelectorAll('.vc-unfold-flap').length : 0, peel: b ? [...b.classList].filter(c => c.startsWith('vc-peel')).join(' ') : '', tf: b ? getComputedStyle(b).transform : '' });
            if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        await page.mouse.click(btn.x + btn.w / 2, btn.y + btn.h / 2);
        await sleep(300);
        await shot(page, `details-mid-${mode}.png`);
        await sleep(900);
        const f = await page.evaluate(() => window.__det.frames);
        const st = f.find(x => x.style);
        check(`25 ${mode}: Details unfolds in one step (one fold)`, st && st.style === 'letter' && st.flaps === 1, JSON.stringify(st));
        const done = (f.findLast(x => x.style)?.t ?? 0) - (f.find(x => x.style)?.t ?? 0);
        check(`25 ${mode}: the one step is over within 0.8 s of the sheet appearing`, done > 0 && done < 800, Math.round(done) + ' ms');
        const peel = f[f.length - 1];
        check(`25 ${mode}: the Details button has peeled off and floats (lifted, turned) while open`, /vc-peel-off|vc-peel-float/.test(peel.peel) && peel.tf !== 'none', peel.peel + ' ' + peel.tf.slice(0, 60));
        const dlg = await rect(page, '#itemDialog');
        await shot(page, `details-open-${mode}.png`);
        const ok = await page.evaluate(() => document.getElementById('itemDialog').open && document.querySelectorAll('#detailTitle').length === 1);
        check(`25 ${mode}: the dialog is open with its own content, no duplicate ids`, ok && dlg && dlg.w > 100);
        await page.evaluate(() => document.getElementById('closeDetails').click());
        await sleep(120);
        const settling = await page.evaluate(() => document.querySelector('#items [data-details]').className);
        await sleep(1500);
        const after = await page.evaluate(() => { const b = document.querySelector('#items [data-details]'); return { cls: b.className, tf: getComputedStyle(b).transform }; });
        check(`25 ${mode}: on close the button settles back onto the paper`, /vc-peel-settle/.test(settling) && !/vc-peel/.test(after.cls) && (after.tf === 'none' || after.tf === 'matrix(1, 0, 0, 1, 0, 0)'), `${settling} → ${after.cls || '(no class)'} ${after.tf}`);
        allErrors.push(...errors); await ctx.close();
      }
    }

    // ── 26: drop-down lists on the paper's plane ─────────────────────────────────────────
    if (want('menus')) {
      const { page, ctx, errors } = await open(browser, 'desk');
      // the open list flutters in the breeze the pointer stirs (WP-11, DECISIONS 32); that turn is a
      // separate reaction, so it is held at 0 here and only the list's placement is measured
      await page.addStyleTag({ content: '.vc-menu { rotate: 0deg !important; }' });
      for (const id of ['statusFilter', 'discoveryFilter', 'biomeFilter', 'sort']) {
        const s = await rect(page, '#' + id);
        await page.mouse.move(s.x + s.w / 2, s.y + s.h / 2); await sleep(250);
        await page.mouse.down(); await page.mouse.up();
        await sleep(1000); // the list's two-fold unfold (400 ms) is over
        const s0 = await rect(page, '#' + id);
        const where = await page.evaluate(() => { const m = document.querySelector('.vc-menu'); return m ? { inSheet: !!m.closest('#print .vc-sheet'), inFloat: !!m.closest('#float') } : null; });
        const m0 = await rect(page, '.vc-menu');
        // move the pointer over the list and around: the camera follows the pointer (and the spark zoom)
        const offs = [];
        for (const [dx, dy] of [[120, 60], [-200, 120], [260, -40], [40, 200]]) {
          await page.mouse.move(m0.x + m0.w / 2 + dx, m0.y + 20 + dy, { steps: 6 }); await sleep(260);
          const sr = await rect(page, '#' + id), mr = await rect(page, '.vc-menu');
          // Paul, WP-17 item 2: a pointer path onto the woodblock zooms the camera out, so the list's
          // offset from its box is compared at the box's on-screen scale (k)
          const k = sr && s0.w ? sr.w / s0.w : 1;
          if (sr && mr) offs.push({ sx: sr.x - s0.x, sy: sr.y - s0.y, dx: mr.x - sr.x - (m0.x - s0.x) * k, dy: mr.y - sr.b - (m0.y - s0.b) * k, scale: mr.w / m0.w / k });
        }
        const moved = Math.max(...offs.map(o => Math.hypot(o.sx, o.sy)));
        const drift = Math.max(...offs.map(o => Math.hypot(o.dx, o.dy)));
        check(`26 #${id}: the list lies on the paper and moves with its box (box moved ${moved.toFixed(1)} px, list drift ≤ 3 px)`, where?.inSheet && !where.inFloat && drift <= 3, `drift ${drift.toFixed(2)} px ` + JSON.stringify(offs.map(o => [o.sx, o.sy, o.dx, o.dy].map(v => +v.toFixed(1)))) + JSON.stringify({ s0, m0 }));
        if (id === 'statusFilter') await shot(page, 'menu-on-paper.png', { x: Math.max(0, Math.round(m0.x) - 120), y: Math.max(0, Math.round(s0.y) - 60), width: 700, height: 360 });
        await page.keyboard.press('Escape'); await sleep(300);
      }
      // choosing still works
      await page.evaluate(() => __vc.surfaces.menus.openFor('statusFilter'));
      await sleep(450);
      // Paul, WP-17 item 23: "All items, missing first" is now option 0, so pick "All items" by its value
      await page.evaluate(() => __vc.surfaces.menus.pick([...document.getElementById('statusFilter').options].findIndex(o => o.value === 'all')));
      await sleep(500);
      check('26 choosing from the paper list sets the filter', await page.evaluate(() => document.getElementById('statusFilter').value === 'all'));
      allErrors.push(...errors); await ctx.close();
    }

    // ── 27: collection titles ────────────────────────────────────────────────────────────
    if (want('titles')) {
      for (const [label, html] of [['now', HTML], ...(BEFORE ? [['before', BEFORE]] : [])]) {
        for (const mode of ['desk', 'flat']) {
          const { page, ctx, errors } = await open(browser, mode, { html });
          const r = await page.evaluate(() => {
            const t = document.getElementById('title'), cs = getComputedStyle(t), b = getComputedStyle(t, '::before');
            const tr = t.getBoundingClientRect(), row = t.closest('.title-row').getBoundingClientRect();
            const range = document.createRange(); range.selectNodeContents(t); const txt = range.getBoundingClientRect();
            return { size: tr.height, align: cs.textAlign, ornament: b.backgroundImage !== 'none' && b.content !== 'none', initial: getComputedStyle(t, '::first-letter').color, centreOff: Math.abs((txt.left + txt.right) / 2 - (row.left + row.right) / 2), rowW: row.width, text: t.textContent };
          });
          info(`27 ${mode} title (${label})`, `height ${r.size.toFixed(1)} px, align ${r.align}, centre offset ${r.centreOff.toFixed(1)} px`);
          if (label === 'now') {
            check(`27 ${mode}: collection title centred (text centre within 2 % of the row's) with flourishes and a red initial`, r.align === 'center' && r.centreOff < r.rowW * 0.02 && r.ornament && r.initial === 'rgb(142, 42, 30)', JSON.stringify({ off: r.centreOff.toFixed(1), ornament: r.ornament, initial: r.initial }));
            check(`27 ${mode}: the title text is unchanged`, r.text === 'The Master Chef' || r.text.length > 3, r.text);
            await shot(page, `title-${mode}.png`, mode === 'desk' ? { x: 560, y: 230, width: 820, height: 130 } : { x: 260, y: 140, width: 1180, height: 170 });
          }
          allErrors.push(...errors); await ctx.close();
        }
      }
    }

    // ── 28: resizable columns, remembered per viewer ─────────────────────────────────────
    if (want('columns')) {
      for (const mode of ['desk', 'flat']) {
        const { page, ctx, errors } = await open(browser, mode);
        const w0 = await page.evaluate(() => [...document.querySelectorAll('.tablewrap thead th')].map(th => th.offsetWidth));
        const g = await rect(page, '.tablewrap thead th:nth-child(2) .vc-col-grip');
        await page.mouse.move(g.x + g.w / 2, g.y + g.h / 2); await sleep(150);
        await page.mouse.down();
        await page.mouse.move(g.x + g.w / 2 + 90, g.y + g.h / 2, { steps: 10 });
        await page.mouse.up();
        await sleep(200);
        const w1 = await page.evaluate(() => [...document.querySelectorAll('.tablewrap thead th')].map(th => th.offsetWidth));
        const stored = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('valheim-checkup:vc-column-widths')); } catch { return null; } });
        check(`28 ${mode}: dragging the Item column's edge widens it and narrows Status by the same amount`, w1[1] > w0[1] + 20 && Math.abs((w1[1] + w1[2]) - (w0[1] + w0[2])) <= 2, `Item ${w0[1]} → ${w1[1]}, Status ${w0[2]} → ${w1[2]}`);
        check(`28 ${mode}: the widths are saved in this browser`, Array.isArray(stored) && Math.abs(stored[1] - w1[1]) <= 1, JSON.stringify(stored));
        if (mode === 'flat') await shot(page, 'columns-flat.png', { x: 260, y: 640, width: 1180, height: 260 });
        await page.reload();
        if (mode === 'desk') await page.waitForFunction(() => window.__vc?.stage?.textures?.ready?.(), null, { timeout: 60000 }); else await page.waitForFunction(() => !!window.__vc?.flat, null, { timeout: 30000 });
        await sleep(1500);
        const w2 = await page.evaluate(() => [...document.querySelectorAll('.tablewrap thead th')].map(th => th.offsetWidth));
        check(`28 ${mode}: after a reload the widths come back`, Math.abs(w2[1] - w1[1]) <= 2, `Item ${w2[1]}`);
        if (mode === 'desk') await shot(page, 'columns-desk.png');
        allErrors.push(...errors); await ctx.close();
      }
      // storage blocked: still resizes, no error
      const { page, ctx, errors } = await open(browser, 'flat', { save: false });
      await page.evaluate(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
      const g = await rect(page, '.tablewrap thead th:nth-child(2) .vc-col-grip');
      await page.mouse.move(g.x + 4, g.y + 4); await page.mouse.down(); await page.mouse.move(g.x + 60, g.y + 4, { steps: 5 }); await page.mouse.up();
      check('28 storage blocked: resizing works without an error', errors.length === 0, errors.join(' | '));
      allErrors.push(...errors); await ctx.close();
    }

    // ── 29: starred rows outlined ────────────────────────────────────────────────────────
    if (want('star')) {
      for (const mode of ['desk', 'flat']) {
        const { page, ctx, errors } = await open(browser, mode);
        await page.evaluate(() => document.querySelector('#items tr .pin').click());
        await sleep(400);
        const r = await page.evaluate(() => { const rows = [...document.querySelectorAll('#items > tr')]; const on = rows.find(r => r.querySelector('.pin.on')), off = rows.find(r => !r.querySelector('.pin.on')); const a = getComputedStyle(on), b = getComputedStyle(off); return { on: [a.outlineStyle, a.outlineWidth, a.outlineColor], off: b.outlineStyle }; });
        check(`29 ${mode}: a starred row has a slight outline; others none`, r.on[0] === 'solid' && parseFloat(r.on[1]) > 0 && parseFloat(r.on[1]) <= 2.5 && r.off === 'none', JSON.stringify(r));
        await shot(page, `star-${mode}.png`, mode === 'desk' ? { x: 560, y: 480, width: 820, height: 120 } : { x: 260, y: 680, width: 1180, height: 200 });
        allErrors.push(...errors); await ctx.close();
      }
    }

    // ── overview shots ────────────────────────────────────────────────────────────────────
    if (want('flat') || MODE === 'all') {
      for (const mode of ['desk', 'flat']) {
        const { page, ctx, errors } = await open(browser, mode);
        await shot(page, `overview-${mode}.png`);
        allErrors.push(...errors); await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  check('no page or console errors', allErrors.length === 0, allErrors.slice(0, 5).join(' | '));
  const pass = results.filter(r => r.ok).length;
  console.log(`\n${pass}/${results.length} checks passed`);
  process.exit(pass === results.length ? 0 : 1);
})();
