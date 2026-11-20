// Builder self-check for WP-10 (not a checker test). Run after the build:
//   npm run build:single && node tools/wp10-check.cjs [timing|grain|a11y|interrupt|layout|update|reduced|flat|bars|shot|all]
// Real GPU (Metal). Paul's save is loaded from fixtures/private; the character name is never
// printed and is masked in screenshots.
const path = require('node:path');
const fs = require('node:fs');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const { open, check, results, ARGS } = require('./wp08-check.cjs');
const SHOTS = path.join(ROOT, 'docs', 'reports', 'wp-10');
fs.mkdirSync(SHOTS, { recursive: true });
const PRIVATE = path.join(ROOT, 'fixtures', 'private');
const SAVE = fs.readFileSync(path.join(PRIVATE, fs.readdirSync(PRIVATE).find(f => f.endsWith('.fch'))));
const MODE = process.argv[2] || 'all';
const want = m => MODE === 'all' || MODE === m;
// the name shows in the byline and in the "Loaded …" toast: both masked in every shot
const priv = p => ({ mask: [p.locator('#headerProfile strong'), p.locator('#toast')], maskColor: '#ff00ff' });
const VIEWS = ['The Artisan', 'The Blacksmith', 'The Carpenter', 'The Master Chef', 'The Gourmet', 'The Trophy Collector', 'The Hunter', 'The Master Hunter', 'The Fisherman', 'Are You Alright?', "That Can't Be an Accident", 'Highlights', 'Skills & travel'];

async function loadSave(page) {
  await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
  await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 20000 });
}
// on the desk a click first runs the bar's latch animation; the view changes at `app:category`
const select = async (page, title) => {
  const w = await page.evaluate(t => { const w = performance.now(); document.querySelector(`[data-category="${t.replace(/"/g, '\\"')}"]`).click(); return w; }, title);
  await page.waitForFunction(s => __vc.events.some(e => e.type === 'app:category' && e.wall >= s), w, { timeout: 10000 });
  return w;
};
const evts = (page, since) => page.evaluate(s => __vc.events.filter(e => e.wall >= s).map(e => ({ type: e.type, t: e.t, data: e.data })), since);
const idle = page => page.waitForFunction(() => !__vc.ink.state().running && __vc.ink.state().ghosts === 0, null, { timeout: 15000 });

/** Event times relative to the selection, in clock ms. */
function times(ev) {
  // the table's 0 ms is fx:wash-out-start (first frame after the new view is painted, DECISIONS WP-10)
  const t0 = ev.find(e => e.type === 'fx:wash-out-start')?.t ?? ev.find(e => e.type === 'app:category' || e.type === 'app:load')?.t ?? ev[0]?.t;
  const at = type => ev.filter(e => e.type === type).map(e => +(e.t - t0).toFixed(0));
  return { t0, at };
}
const near = (v, want, tol = 0.1) => Math.abs(v - want) <= Math.max(want * tol, 20);

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    const { page, errors } = await open(browser);
    // INK_OFF=1: the same run without the sequence (to tell WP-10 effects from others)
    if (process.env.INK_OFF) await page.evaluate(() => __vc.ink.enable(false));
    if (process.env.FX_OFF) await page.evaluate(o => __vc.ink.off(Object.fromEntries(o.split(',').map(k => [k, true]))), process.env.FX_OFF);
    await loadSave(page);
    await idle(page);

    if (want('timing')) {
      let worstDots = 0, okAll = true; const bad = [], lags = [];
      for (const v of VIEWS) {
        const w = await select(page, v);
        await idle(page);
        const ev = await evts(page, w);
        const { at } = times(ev);
        const insight = v === 'Highlights' || v === 'Skills & travel';
        const wo = at('fx:wash-out-start'), wis = at('fx:wash-in-start'), sl = at('fx:stamp-land'), ce = at('fx:count-end'), dots = at('fx:dot'), wie = at('fx:wash-in-end');
        const lastDot = dots.length ? Math.max(...dots) : 0;
        const cat = ev.find(e => e.type === 'app:category'), wos = ev.find(e => e.type === 'fx:wash-out-start');
        if (cat && wos) lags.push(`${v.replace('The ', '')} ${Math.round(wos.t - cat.t)}`);
        worstDots = Math.max(worstDots, lastDot);
        let ok = wo.length === 1 && near(wo[0], 0, 0) && wis.length === 1 && near(wis[0], 450) && wie.length === 1 && lastDot <= 3500;
        if (!insight) {
          ok = ok && sl.length === 4 && [1000, 1150, 1300, 1450].every((x, i) => near(sl[i], x)) && ce.length === 4 && near(ev.find(e => e.type === 'fx:count-end' && e.data.stamp === 'done').t - times(ev).t0, 1800) && dots.length > 0 && near(Math.min(...dots), 1500);
        } else ok = ok && sl.length === 0;
        if (!ok) { okAll = false; bad.push(`${v}: out ${wo} in ${wis} land ${sl} count ${ce} dots ${dots.length}@${dots[0]}..${lastDot} end ${wie}`); }
        if (v === 'The Carpenter') console.log(`      Carpenter: out ${wo} in ${wis} land ${sl} count-end ${ce} dots ${dots.length} ${Math.min(...dots)}..${lastDot} wash-in-end ${wie}`);
      }
      check('timing: events within ±10% of the table in all 13 views; dots done by 3,500 ms', okAll, `last dot at most ${worstDots} ms ${bad.join(' | ')}`);
      console.log(`      selection → first painted frame (ms): ${lags.join(', ')}`);
      // file 07 fills, both record modes, after the sequence
      // the record toggle lives on collection views (and a latched bar does not select again)
      await select(page, 'The Fisherman'); await idle(page);
      for (const mode of ['achievement', 'raw']) {
        await page.selectOption('#recordMode', mode);
        let ok = true; const bad2 = [];
        for (const v of VIEWS.slice(0, 11)) {
          await select(page, v); await idle(page);
          const r = await page.evaluate(() => [...document.querySelectorAll('#metrics [data-metric]')].map(m => {
            const g = m.querySelector('.dots'), cells = [...(g?.children || [])];
            const fs = cells.map(c => +c.style.getPropertyValue('--f'));
            return { m: m.dataset.metric, text: m.querySelector('strong').textContent, show: m.querySelector('strong').dataset.show ?? null, dots: g?.dataset.dots ?? null, full: g?.dataset.full ?? null, partial: g?.dataset.partial ?? null, cells: cells.length, drawnFull: fs.filter(f => f === 1).length, drawnPartial: fs.filter(f => f > 0 && f < 1) };
          }));
          for (const x of r) {
            if (x.show !== null) { ok = false; bad2.push(`${v} ${x.m} still counting`); }
            if (x.dots === null) { if (x.cells) { ok = false; bad2.push(`${v} ${x.m} blank grid has cells`); } continue; }
            const p = +x.partial;
            if (x.cells !== +x.dots || x.drawnFull !== +x.full || (p > 0 ? x.drawnPartial.length !== 1 || Math.abs(x.drawnPartial[0] - Math.max(0.25, p)) > 1e-3 : x.drawnPartial.length)) { ok = false; bad2.push(`${v} ${x.m} ${JSON.stringify(x)}`); }
          }
        }
        check(`fills: drawn dots equal the grid hooks in all 11 collections (${mode})`, ok, bad2.slice(0, 3).join(' | '));
      }
      await page.selectOption('#recordMode', 'achievement');
      await idle(page);
    }

    if (want('grain')) {
      // the same view stamped twice (a latched bar does not re-select, so another view sits between)
      const take = async () => { const n0 = await page.evaluate(() => __vc.ink.grains().length); await select(page, 'The Gourmet'); await idle(page); return (await page.evaluate(n => __vc.ink.grains().slice(n), n0)).map(x => x.hash); };
      const first = await take();
      await select(page, 'The Fisherman'); await idle(page);
      const second = await take();
      check('grain: two stampings of the same view give different masks (hash)', first.length === 4 && second.length === 4 && first.every((h, i) => h !== second[i]) && new Set([...first, ...second]).size === 8, `${first.join(',')} / ${second.join(',')}`);
      const url = await page.evaluate(() => document.querySelector('#metrics [data-metric="done"]').style.maskImage || document.querySelector('#metrics [data-metric="done"]').style.webkitMaskImage);
      check('grain: the stamp carries its mask (object URL)', /blob:/.test(url), url.slice(0, 40));
    }

    if (want('a11y')) {
      // read the page in the first frame after the view changed (the ghost is up for ~1 s)
      const r = await page.evaluate(() => new Promise(resolve => {
        const before = document.getElementById('title').textContent;
        document.querySelector('[data-category="The Fisherman"]').click();
        const look = () => {
          if (document.getElementById('title').textContent === before) return requestAnimationFrame(look);
          const host = document.querySelector('.vc-ghost-host');
          resolve({
            before, title: document.getElementById('title').textContent, done: document.querySelector('#metrics [data-metric="done"] strong').textContent,
            ghost: !!host, hidden: host?.getAttribute('aria-hidden'), inert: host?.inert, shadowOpen: !!host?.shadowRoot,
            titles: document.querySelectorAll('#title').length,
          });
        };
        look();
      }));
      check('a11y: right after a selection the DOM holds the new view; the ghost is aria-hidden, inert and closed', r.title === 'The Fisherman' && r.done === '0' && r.ghost && r.hidden === 'true' && r.inert && !r.shadowOpen && r.titles === 1, JSON.stringify({ ...r, before: undefined }));
      const roles = { now: await page.getByRole('heading', { name: 'The Fisherman' }).count(), old: await page.getByRole('heading', { name: r.before, exact: true }).count(), ghost: await page.evaluate(() => __vc.ink.state().ghosts) };
      check('a11y: accessibility tree shows only the new heading while the ghost washes out', roles.now === 1 && roles.old === 0 && roles.ghost === 1, JSON.stringify(roles));
      const l = page.locator('#title'); check('a11y: locator #title resolves to one element during the wash', (await l.count()) === 1);
      await idle(page);
    }

    if (want('interrupt')) {
      // on the desk a bar takes ~1.4 s to latch, so the two selections go through the original
      // collection select (app.js `setCategory` straight away), exactly 300 ms of clock time apart
      const { w, mid } = await page.evaluate(() => new Promise(resolve => {
        const sel = document.getElementById('mobileCategory');
        const pick = v => { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); };
        pick('The Artisan');
        const t0 = __vc.clock.now();
        const wait = () => {
          if (__vc.clock.now() - t0 < 300) return requestAnimationFrame(wait);
          const w = performance.now();
          pick('The Trophy Collector');
          resolve({ w, mid: __vc.ink.state().ghosts });
        };
        wait();
      }));
      await idle(page);
      const r = await page.evaluate(() => ({ title: document.getElementById('title').textContent, m: [...document.querySelectorAll('#metrics strong')].map(s => s.textContent), ghosts: document.querySelectorAll('.vc-ghost-host').length, masks: [...document.querySelectorAll('main.workspace [data-vc-wash]')].length, wait: document.querySelectorAll('.vc-wait').length }));
      const ev = await evts(page, w);
      check('interrupt: two views 300 ms apart end in the second, correct, no ghost left', r.title === 'The Trophy Collector' && r.m.join() === '36,32,0,32' && r.ghosts === 0 && r.masks === 0 && r.wait === 0 && mid <= 1 && ev.filter(e => e.type === 'fx:stamp-land').length === 4, JSON.stringify({ ...r, mid }));
    }

    if (want('layout')) {
      const w = await select(page, 'The Master Chef');
      const boxes = [];
      for (let i = 0; i < 18; i++) {
        boxes.push(await page.evaluate(() => [...document.querySelectorAll('main.workspace, #metrics, #metrics .metric, #mainTrack, .filterbar, .tablewrap, #title')].map(e => [e.offsetLeft, e.offsetTop, e.offsetWidth, e.offsetHeight].join(',')).join('|')));
        await page.waitForTimeout(170);
      }
      check('layout: no layout shift on the sheet during the sequence (offsets constant over 3 s)', new Set(boxes).size === 1, `${new Set(boxes).size} distinct`);
      await idle(page);
      const fr = await page.evaluate(() => __vc.ink.fronts().length);
      check('desk: fronts cleared after the sequence', fr === 0);
    }

    if (want('update')) {
      await select(page, 'The Carpenter'); await idle(page);
      const w = await page.evaluate(() => performance.now());
      await page.selectOption('#statusFilter', 'all');
      await page.waitForTimeout(500);
      let ev = await evts(page, w);
      check('update: a filter change does not re-stamp', !ev.some(e => e.type === 'fx:stamp-land' || e.type === 'fx:wash-out-start'));
      // a correction changes a number: wipe + dot ticks, no re-stamp
      const w2 = await page.evaluate(() => performance.now());
      const name = await page.evaluate(() => { const r = document.querySelector('#items tr.row-missing'); return r?.dataset.item; });
      await page.evaluate(id => document.querySelector(`#items tr[data-item="${CSS.escape(id)}"] [data-details]`).click(), name);
      // watch for the wipe (it lasts 180 ms, shorter than a round trip to the page)
      await page.evaluate(() => { window.__wiped = false; new MutationObserver(() => { if (document.querySelector('#metrics strong[data-old]')) window.__wiped = true; }).observe(document.getElementById('metrics'), { subtree: true, attributes: true, childList: true }); });
      await page.getByRole('button', { name: 'Mark completed', exact: true }).click();
      await page.waitForTimeout(100);
      const wiping = await page.evaluate(() => window.__wiped);
      await page.waitForTimeout(700);
      ev = await evts(page, w2);
      check('update: a correction wipes the number and ticks dots, without re-stamping', wiping && !ev.some(e => e.type === 'fx:stamp-land') && ev.some(e => e.type === 'fx:dot' && e.data.update), `wipe ${wiping}, dots ${ev.filter(e => e.type === 'fx:dot').length}`);
      await page.getByRole('button', { name: 'Use save record', exact: true }).click();
      await page.keyboard.press('Escape');
      await page.selectOption('#statusFilter', 'remaining');
      await page.waitForTimeout(500);
    }

    if (want('shot')) {
      if (await page.locator('#title').textContent() === 'The Master Chef') { await select(page, 'The Gourmet'); await idle(page); }
      await select(page, 'The Master Chef');
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(SHOTS, 'wash-mid-700ms.png'), ...priv(page) });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SHOTS, 'stamps-1200ms.png'), ...priv(page) });
      await idle(page); await page.waitForTimeout(400);
      await page.mouse.move(900, 600);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS, 'desk-final-1440.png'), ...priv(page) });
      check('shots written', true, SHOTS);
    }
    check('no console errors (desk)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.context().close();

    if (want('reduced') || want('flat')) {
      for (const [label, query, reduce] of [['flat', '&mode=flat', false], ['flat reduced', '&mode=flat', true]]) {
        if (!want('flat') && !reduce) continue;
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'UTC', reducedMotion: reduce ? 'reduce' : 'no-preference' });
        const p = await ctx.newPage();
        const errs = []; p.on('pageerror', e => errs.push(String(e)));
        await p.goto(path.join('file://', ROOT, 'dist', 'valheim-checkup.html') + '?seed=7' + query);
        await p.waitForFunction(() => window.__vc && __vc.ink);
        await loadSave(p);
        await idle(p);
        const w = await select(p, 'The Carpenter');
        await idle(p);
        const ev = await evts(p, w);
        const { at } = times(ev);
        const r = await p.evaluate(() => ({ m: [...document.querySelectorAll('#metrics strong')].map(s => s.textContent), frames: [...document.querySelectorAll('#metrics svg.stamp-frame path')].length, cells: document.querySelectorAll('#metrics .dot').length, mode: document.body.className }));
        if (reduce) check(`${label}: a fade, one soft stamp, everything at once`, at('fx:stamp-land').length === 1 && ev.find(e => e.type === 'fx:stamp-land').data.strength < 1 && at('fx:wash-out-start').length === 0 && at('fx:wash-in-end')[0] >= 150 && at('fx:wash-in-end')[0] <= 300 && at('fx:dot').length === 0 && r.m.join() === '155,238,7,152', JSON.stringify({ land: at('fx:stamp-land'), end: at('fx:wash-in-end'), m: r.m }));
        else check(`${label}: same modules run (4 stamps, dots, frames)`, at('fx:stamp-land').length === 4 && at('fx:dot').length > 0 && r.frames === 12 && r.cells === 160 && /mode-flat/.test(r.mode) && r.m.join() === '155,238,7,152', JSON.stringify({ land: at('fx:stamp-land'), dots: at('fx:dot').length, ...r }));
        if (!reduce) await p.screenshot({ path: path.join(SHOTS, 'flat-carpenter.png'), ...priv(p) });
        check(`${label}: no page errors`, errs.length === 0, errs.join(' | '));
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    const pass = results.filter(r => r.ok).length;
    console.log(`\n${pass}/${results.length} passed`);
  }
})();
