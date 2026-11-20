// Builder self-check for WP-14 (performance and accessibility). Run after the build:
//   npm run build:single && node tools/wp14-check.cjs [all|size|perf|longtasks|heap|axe|keys|focus|contrast|sounds|pointer|resize]
//   Optional second argument: desk | flat (default both, where a section supports it).
// Real GPU (Metal). Paul's save from fixtures/private; the character name is never printed.
const path = require('node:path');
const fs = require('node:fs');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const PRIVATE = path.join(ROOT, 'fixtures', 'private');
const SAVE = fs.readFileSync(path.join(PRIVATE, fs.readdirSync(PRIVATE).find(f => f.endsWith('.fch'))));
const DIST = path.join(ROOT, 'dist', 'valheim-checkup.html');
const URL = 'file://' + DIST;
const ARGS = ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu', '--enable-precise-memory-info', '--js-flags=--expose-gc'];
const MODE = process.argv[2] || 'all';
const ONLY = process.argv[3] || null;
const want = m => MODE === 'all' || MODE === m;
const modes = () => (ONLY ? [ONLY] : ['flat', 'desk']);
const results = [];
const numbers = {};
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const VIEWS = ['The Artisan', 'The Blacksmith', 'The Carpenter', 'The Master Chef', 'The Gourmet', 'The Trophy Collector', 'The Hunter', 'The Master Hunter', 'The Fisherman', 'Are You Alright?', "That Can't Be an Accident", 'Highlights', 'Skills & travel'];

async function open(browser, mode, o = {}) {
  const ctx = await browser.newContext({ viewport: o.viewport || { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', reducedMotion: o.reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  // the clock runs frame callbacks through try/catch → console.error, so a broken frame shows only here
  page.on('console', m => { if (m.type() === 'error' && !/GPU stall due to ReadPixels|GL_CLOSE_PATH_NV|net::ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(`${URL}?mode=${mode}&seed=7${o.query || ''}`);
  await page.waitForSelector('#categories [data-category]', { state: 'attached' });
  if (mode === 'desk') await page.waitForFunction(() => __vc.stage?.textures?.ready?.() && __vc.stage.stats().frames > 10 && __vc.startup().usableMs !== null, null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  allErrors.push(errors);
  return { page, ctx, errors };
}
async function loadSave(page) {
  await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
  await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 20000 });
}
const idle = page => page.waitForFunction(() => !__vc.ink?.state().running && (__vc.ink?.state().ghosts ?? 0) === 0, null, { timeout: 20000 }).catch(() => {});
// on the desk a click on a collection button runs the bar to its latch first and selects when it
// latches, so wait for the selection itself (an ink-idle wait alone can return before it)
const select = async (page, title) => {
  await page.evaluate(t => document.querySelector(`[data-category="${t.replace(/"/g, '\\"')}"]`).click(), title);
  await page.waitForFunction(t => document.querySelector(`[data-category="${t.replace(/"/g, '\\"')}"]`)?.getAttribute('aria-current') === 'page', title, { timeout: 8000 }).catch(() => {});
};
/**
 * The one finding the original page brings with it and the parity suite locks in place: #loadTop's
 * aria-label is "Load character" (P-test: exact), its visible text adds the hint "click or drop .fch"
 * (P-test: exact). axe's label-content-name-mismatch wants the hint inside the name. Reported as
 * KNOWN on its own line (DECISIONS, NEEDS PAUL), never hidden; anything else on #loadTop still fails.
 */
const KNOWN = v => v.id === 'label-content-name-mismatch' && v.nodes.every(n => n.target.join(' ') === '#loadTop');
const known = new Set();
const allErrors = [];
async function axeRun(page) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(x => ({ target: x.target, summary: (x.failureSummary || '').split('\n')[1]?.slice(0, 120) })) })));
}
async function axe(page, label) {
  const all = await axeRun(page);
  for (const v of all.filter(KNOWN)) known.add(label);
  const r = all.filter(v => !KNOWN(v)).map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, targets: v.nodes.slice(0, 3).map(x => x.target.join(' ') + ' :: ' + x.summary) }));
  check(`axe: 0 violations (${label})`, r.length === 0, r.length ? JSON.stringify(r) : '');
  return r;
}

(async () => {
  if (want('size')) {
    const mb = fs.statSync(DIST).size / 1048576;
    numbers.distMB = +mb.toFixed(2);
    check('budget: dist/valheim-checkup.html ≤ 12 MB', mb <= 12, `${mb.toFixed(2)} MB`);
  }
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (want('perf')) {
      for (const mode of modes()) {
        const { page, ctx } = await open(browser, mode);
        const startup = await page.evaluate(() => __vc.startup());
        if (mode === 'flat') { numbers.flatUsableMs = startup.usableMs; check('budget: flat content usable ≤ 1.5 s', startup.usableMs <= 1500, `${startup.usableMs} ms`); }
        else { numbers.deskVisibleMs = startup.usableMs; check('budget: desk scene visible ≤ 3 s', startup.usableMs <= 3000, `${startup.usableMs} ms`); }
        await loadSave(page); await idle(page);
        if (mode === 'desk') {
          // High tier: draw calls / triangles, over a few seconds and a view change
          await page.evaluate(() => __vc.quality('high'));
          await page.waitForTimeout(800);
          let maxCalls = 0, maxTris = 0;
          for (let i = 0; i < 20; i++) {
            if (i === 4) await select(page, 'The Carpenter');
            const s = await page.evaluate(() => __vc.stage.stats().perFrame);
            maxCalls = Math.max(maxCalls, s.calls); maxTris = Math.max(maxTris, s.triangles);
            await page.waitForTimeout(150);
          }
          numbers.highCalls = maxCalls; numbers.highTriangles = maxTris;
          check('budget: High ≤ 250 draw calls, ≤ 600,000 triangles per frame', maxCalls <= 250 && maxTris <= 600000, `max ${maxCalls} calls, ${maxTris.toLocaleString('en-US')} triangles`);
          await idle(page);
          // Low tier: JavaScript time per frame, over idle, a view change, Details, the pointer moving
          await page.evaluate(() => __vc.quality('low'));
          await page.waitForTimeout(600);
          await page.evaluate(() => { __vc.clock.work(); });
          const w0 = await page.evaluate(() => __vc.clock.work().frames);
          for (let i = 0; i < 30; i++) { await page.mouse.move(400 + i * 25, 300 + (i % 5) * 40); await page.waitForTimeout(40); }
          await select(page, 'The Gourmet');
          await page.waitForTimeout(2500);
          const w = await page.evaluate(() => __vc.clock.work());
          numbers.deskLowJs = { avg: +w.avg.toFixed(2), worst: +w.worst.toFixed(1), frames: w.frames - w0 };
          check('budget: desk Low JS per frame ≤ 6 ms avg, ≤ 12 ms worst (last 240 frames)', w.avg <= 6 && w.worst <= 12, `avg ${w.avg.toFixed(2)} ms, worst ${w.worst.toFixed(1)} ms`);
          await page.evaluate(() => __vc.quality('high'));
        } else {
          await select(page, 'The Gourmet');
          await page.waitForTimeout(2500);
          const w = await page.evaluate(() => __vc.clock.work());
          numbers.flatJs = { avg: +w.avg.toFixed(2), worst: +w.worst.toFixed(1) };
          check('budget: flat JS per frame ≤ 6 ms avg, ≤ 12 ms worst', w.avg <= 6 && w.worst <= 12, `avg ${w.avg.toFixed(2)} ms, worst ${w.worst.toFixed(1)} ms`);
        }
        // the overlay itself
        await page.goto(`${URL}?mode=${mode}&seed=7&perf`);
        await page.waitForSelector('#vcPerf');
        await page.waitForTimeout(mode === 'desk' ? 4000 : 1200);
        const rows = await page.evaluate(() => __vc.perf.rows().map(r => r.label + '=' + r.value));
        check(`?perf overlay works (${mode})`, rows.length >= (mode === 'desk' ? 8 : 6), rows.join(', '));
        await ctx.close();
      }
    }

    if (want('longtasks')) {
      for (const mode of modes()) {
        const { page, ctx } = await open(browser, mode);
        await page.evaluate(() => {
          window.__lt = [];
          new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push({ s: Math.round(e.startTime), d: Math.round(e.duration) }); }).observe({ type: 'longtask', buffered: true });
        });
        await loadSave(page); await idle(page);
        // "after startup": the same settle point as the ?perf overlay (5 s after navigation)
        await page.waitForFunction(() => performance.now() > 5000, null, { timeout: 20000 });
        const steps = [];
        const mark = async label => steps.push({ label, t: await page.evaluate(() => performance.now()) });
        await mark('start');
        const t0 = steps[0].t;
        for (const v of VIEWS) { await mark(v); await select(page, v); await page.waitForTimeout(250); }
        await mark('settle'); await idle(page);
        await mark('Master Chef'); await select(page, 'The Master Chef'); await idle(page);
        await mark('Details open'); await page.locator('#items tr[data-item]').first().dblclick(); await page.waitForTimeout(2600);
        await mark('Details close'); await page.keyboard.press('Escape'); await page.waitForTimeout(1200);
        await mark('How-to open'); await page.locator('#howTo').click(); await page.waitForTimeout(2000);
        await mark('How-to close'); await page.keyboard.press('Escape'); await page.waitForTimeout(1200);
        const lt = await page.evaluate(t => window.__lt.filter(x => x.s >= t), t0);
        const stepOf = s => [...steps].reverse().find(x => x.t <= s)?.label ?? '?';
        for (const x of lt.filter(x => x.d > 80)) console.log(`      ${mode} long task ${x.d} ms during "${stepOf(x.s)}"`);
        const over = lt.filter(x => x.d > 100);
        numbers[`longTasks_${mode}`] = { over100: over.length, max: Math.max(0, ...lt.map(x => x.d)) };
        check(`budget: no long task over 100 ms after startup (${mode}: 13 views, Details, How-to)`, over.length === 0, `${lt.length} tasks >50 ms, max ${Math.max(0, ...lt.map(x => x.d))} ms`);
        await ctx.close();
      }
    }

    if (want('heap')) {
      for (const mode of modes()) {
        const { page, ctx } = await open(browser, mode);
        await loadSave(page); await idle(page);
        const heap = async () => { await page.evaluate(() => { window.gc?.(); }); await page.waitForTimeout(300); await page.evaluate(() => { window.gc?.(); }); return page.evaluate(() => performance.memory.usedJSHeapSize / 1048576); };
        await page.evaluate(() => __vc.timeScale(8)); // the sequences run 8× faster; the same work
        for (let i = 0; i < 13; i++) { await select(page, VIEWS[i]); await page.waitForTimeout(120); }
        await idle(page);
        const base = await heap();
        for (let i = 0; i < 100; i++) { await select(page, VIEWS[i % 13]); await page.waitForTimeout(60); }
        await idle(page); await page.waitForTimeout(1500);
        const after = await heap();
        const peak = await page.evaluate(() => performance.memory.totalJSHeapSize / 1048576);
        numbers[`heap_${mode}`] = { baseMB: +base.toFixed(1), afterMB: +after.toFixed(1), totalMB: +peak.toFixed(1) };
        check(`budget: heap ≤ 250 MB and back within 10 % after 100 view changes (${mode})`, peak <= 250 && after <= base * 1.1, `base ${base.toFixed(1)} MB → ${after.toFixed(1)} MB, total ${peak.toFixed(1)} MB`);
        await ctx.close();
      }
    }

    // ── Keyboard only: every flow in the spec, Tab / Enter / Space / arrows / typing only ──────
    if (want('keys')) {
      for (const mode of modes()) {
        const { page, ctx, errors } = await open(browser, mode);
        page.on('dialog', d => d.accept());
        const fails = [];
        const ok = (name, cond) => { if (!cond) fails.push(name); };
        const isActive = sel => page.evaluate(sl => !!document.activeElement && document.activeElement.matches(sl), sel);
        const tabTo = async (sel, max = 700) => { for (let i = 0; i < max; i++) { if (await isActive(sel)) return true; await page.keyboard.press('Tab'); } return false; };
        const waitFor = (fn, arg, ms = 6000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
        const toast = re => waitFor(r => new RegExp(r).test(document.getElementById('toast')?.textContent || ''), re.source);
        // Enter on a file button: the app clicks its hidden input; Playwright now and then misses the chooser event
        // on the GPU build, so a lost event falls back to setInputFiles when the input really was clicked (counted).
        await page.evaluate(() => { window.__vcInputClicks = {}; for (const id of ['saveFile', 'progressFile']) document.getElementById(id)?.addEventListener('click', () => { __vcInputClicks[id] = (__vcInputClicks[id] || 0) + 1; }); });
        const lostChooser = [];
        const chooseByEnter = async (inputId, files) => {
          const before = await page.evaluate(i => __vcInputClicks[i] || 0, inputId);
          const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null), page.keyboard.press('Enter')]);
          if (fc) { await fc.setFiles(files); return true; }
          const clicked = await page.evaluate(([i, b]) => (__vcInputClicks[i] || 0) > b, [inputId, before]);
          if (!clicked) return false;
          lostChooser.push(inputId);
          await page.locator('#' + inputId).setInputFiles(files);
          return true;
        };
        // load a save through the file input
        ok('load: reach #loadTop', await tabTo('#loadTop'));
        const fc = await chooseByEnter('saveFile', { name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
        ok('load: Enter opens the file chooser', fc);
        if (fc) ok('load: save loaded', await toast(/Progress is up to date/));
        await idle(page);
        // every view
        for (const v of VIEWS) {
          const sel = `[data-category="${v.replace(/"/g, '\\"')}"]`;
          let reached = await tabTo(`:is(#categories, #insightNav) ${sel}`, mode === 'desk' ? 120 : 700);
          if (!reached && mode === 'desk') {
            // roving tabindex on the bars: reach the current one, then arrow to the wanted one
            reached = await tabTo(':is(#categories, #insightNav) [data-category]');
            for (let i = 0; i < 16 && reached && !(await isActive(`:is(#categories, #insightNav) ${sel}`)); i++) await page.keyboard.press('ArrowDown');
            reached = await isActive(`:is(#categories, #insightNav) ${sel}`);
          }
          ok(`view ${v}: reachable`, reached);
          if (!reached) continue;
          await page.keyboard.press('Enter');
          ok(`view ${v}: selected`, await waitFor(s => document.querySelector(s)?.getAttribute('aria-current') === 'page', `:is(#categories, #insightNav) ${sel}`));
          await idle(page);
        }
        await page.keyboard.press('Shift+Tab');
        // pick a collection view with rows for the item flows
        if (await tabTo(':is(#categories, #insightNav) [data-category="The Master Chef"]', mode === 'desk' ? 40 : 700) || (mode === 'desk' && await (async () => { await tabTo(':is(#categories, #insightNav) [data-category]'); for (let i = 0; i < 16 && !(await isActive('[data-category="The Master Chef"]')); i++) await page.keyboard.press('ArrowUp'); return isActive('[data-category="The Master Chef"]'); })())) {
          await page.keyboard.press('Enter'); await waitFor(() => document.querySelector('[data-category="The Master Chef"]')?.getAttribute('aria-current') === 'page'); await idle(page);
        }
        // filter and sort: typeahead on the focused native select (the parchment list is for the mouse)
        for (const id of ['statusFilter', 'sort']) {
          const reach = await tabTo(`#${id}`);
          ok(`${id}: reachable`, reach);
          if (!reach) continue;
          const want = await page.evaluate(i => { const s = document.getElementById(i); const o = [...s.options].find((x, k) => k !== s.selectedIndex && x.textContent.trim()); return { v: o.value, t: o.textContent.trim() }; }, id);
          await page.keyboard.type(want.t.slice(0, 4), { delay: 30 });
          ok(`${id}: changed by keyboard`, await waitFor(([i, v]) => document.getElementById(i).value === v, [id, want.v], 3000));
          await idle(page);
        }
        // search
        ok('search: reachable', await tabTo('#search'));
        const before = await page.evaluate(() => document.getElementById('listCount')?.textContent || '');
        await page.keyboard.type('bread', { delay: 20 });
        ok('search: filters the list', await waitFor(b => (document.getElementById('listCount')?.textContent || '') !== b, before));
        for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
        await idle(page);
        // reset the filter so rows exist
        await page.evaluate(() => { const s = document.getElementById('statusFilter'); s.focus(); });
        await page.keyboard.press('Home').catch(() => {});
        await page.evaluate(() => { const s = document.getElementById('statusFilter'); if (s.selectedIndex !== 0) { s.selectedIndex = 0; s.dispatchEvent(new Event('change', { bubbles: true })); } });
        await idle(page);
        // star
        ok('star: reachable', await tabTo('#items tr[data-item] button.pin'));
        const starred = await page.evaluate(() => document.activeElement.getAttribute('aria-pressed'));
        await page.keyboard.press('Enter');
        ok('star: toggled', await waitFor(b => document.querySelector('#items tr[data-item] button.pin')?.getAttribute('aria-pressed') !== b, starred));
        // Details
        ok('Details: reachable', await tabTo('#items tr[data-item] [data-details]'));
        await page.keyboard.press('Enter');
        ok('Details: opens', await waitFor(() => document.getElementById('itemDialog')?.open === true));
        await page.waitForTimeout(2600);
        ok('Details: correction reachable', await tabTo('#detailBody [data-correction="true"]', 80));
        await page.keyboard.press('Enter');
        ok('Details: correction set', await waitFor(() => document.querySelector('#detailBody [data-correction="true"]')?.getAttribute('aria-pressed') === 'true'));
        ok('Details: back to automatic', await tabTo('#detailBody [data-correction="auto"]', 80));
        await page.keyboard.press('Enter');
        ok('Details: note field reachable', await tabTo('#itemNote', 80));
        await page.keyboard.type('keyboard note', { delay: 10 });
        ok('Details: Save note reachable', await tabTo('#saveNote', 80));
        await page.keyboard.press('Enter');
        ok('Details: note saved', await toast(/Private note saved/));
        ok('Details: add favourite reachable', await tabTo('#favoriteDetail', 80));
        await page.keyboard.press('Enter');
        ok('Details: favourite added', await waitFor(() => !!document.querySelector('#favorites [data-remove-favorite]')));
        await page.keyboard.press('Escape');
        ok('Details: Escape closes', await waitFor(() => document.getElementById('itemDialog')?.open === false));
        await page.waitForTimeout(1300);
        ok('favourite: remove reachable', await tabTo('#favorites [data-remove-favorite]'));
        await page.keyboard.press('Enter');
        ok('favourite: removed', await waitFor(() => !document.querySelector('#favorites [data-remove-favorite]')));
        // export both files
        let progressPath = null;
        for (const [id, kind] of [['exportProgress', 'progress'], ['exportList', 'list']]) {
          const reach = await tabTo(`#${id}`);
          ok(`export ${kind}: reachable`, reach);
          if (!reach) continue;
          const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.keyboard.press('Enter')]);
          ok(`export ${kind}: downloads`, !!dl);
          if (dl && kind === 'progress') progressPath = await dl.path();
        }
        // import the progress file just exported
        ok('import: reachable', await tabTo('#importProgress'));
        const ic = !!progressPath && await chooseByEnter('progressFile', progressPath);
        ok('import: Enter opens the file chooser', ic);
        if (ic) ok('import: progress imported', await toast(/import|Import|restored|Restored|up to date/));
        await idle(page);
        // help
        ok('help: reachable', await tabTo('details.help > summary'));
        await page.keyboard.press('Enter');
        ok('help: opens', await waitFor(() => document.querySelector('details.help')?.open === true));
        await page.waitForTimeout(2600);
        // forget lives inside the open help panel (confirm accepted)
        ok('forget: reachable', await tabTo('#forget'));
        await page.keyboard.press('Enter');
        ok('forget: save forgotten', await waitFor(() => document.getElementById('loadTop')?.getAttribute('aria-label') === 'Load character'));
        if (await page.evaluate(() => document.querySelector('details.help')?.open)) { await tabTo('details.help > summary'); await page.keyboard.press('Enter'); }
        await page.waitForTimeout(1500);
        // the tour (How-to → Show me around → keys → Escape)
        ok('How-to: reachable', await tabTo('#howTo'));
        await page.keyboard.press('Enter');
        ok('How-to: Show me around reachable', await waitFor(() => !!document.getElementById('showMeAround')) && await tabTo('#showMeAround', 60));
        await page.keyboard.press('Enter');
        ok('tour: runs', await waitFor(() => document.body.classList.contains('vc-tour-open')));
        for (let i = 0; i < 2; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(400); }
        await page.keyboard.press('Escape');
        ok('tour: Escape ends', await waitFor(() => !document.body.classList.contains('vc-tour-open')));
        await page.waitForTimeout(800);
        ok('no page errors', errors.length === 0);
        check(`keyboard only: every flow (${mode})`, fails.length === 0, fails.length ? 'failed: ' + fails.join('; ') : 'load, 13 views, filter, sort, search, star, Details, correction, note, favourite add/remove, both exports, import, help, tour, forget' + (lostChooser.length ? ` (chooser event lost, input clicked: ${lostChooser.join(', ')})` : ''));
        await ctx.close();
      }
    }

    // ── Focus visible on every control (Tab through the whole page) ───────────────────────────
    if (want('focus')) {
      for (const mode of modes()) {
        const { page, ctx } = await open(browser, mode);
        await loadSave(page); await idle(page);
        await select(page, 'The Master Chef'); await idle(page);
        const seen = new Map();
        let first = null;
        for (let i = 0; i < 900; i++) {
          await page.keyboard.press('Tab');
          const r = await page.evaluate(() => {
            const e = document.activeElement;
            if (!e || e === document.body) return null;
            const id = e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : '') + (e.dataset.category ? `[${e.dataset.category}]` : '');
            const path = []; for (let x = e; x && x !== document.body; x = x.parentElement) path.push(x.tagName + ([...(x.parentElement?.children || [])].indexOf(x)));
            const cs = getComputedStyle(e);
            const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1 && !/rgba\([^)]*,\s*0\)|transparent/.test(cs.outlineColor);
            const shadow = cs.boxShadow !== 'none';
            let op = 1; for (let x = e; x; x = x.parentElement) op *= +getComputedStyle(x).opacity;
            const b = e.getBoundingClientRect();
            // a wrapper drawing the ring for its field (the record switch, slips)
            const host = e.closest('.vc-rswitch-host');
            const hostRing = !!host && !!host.querySelector('.vc-rswitch') && getComputedStyle(host.querySelector('.vc-rswitch')).outlineStyle !== 'none';
            // with the host ring the transparent native field is not what is seen: measure the switch itself
            if (hostRing) { op = 1; for (let x = host.querySelector('.vc-rswitch'); x; x = x.parentElement) op *= +getComputedStyle(x).opacity; }
            return { key: path.join('/'), id, visible: (outline || shadow || hostRing) && op > 0.3 && cs.visibility === 'visible', size: b.width > 0 && b.height > 0, why: { outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor, shadow: cs.boxShadow.slice(0, 40), op: +op.toFixed(2) } };
          });
          if (!r) continue;
          if (first === r.key) break;
          first ??= r.key;
          if (!seen.has(r.key)) seen.set(r.key, r);
        }
        const all = [...seen.values()];
        const bad = all.filter(r => !r.visible && r.size);
        numbers[`focusStops_${mode}`] = all.length;
        check(`focus visible on every control (${mode}: ${all.length} tab stops, one view with rows)`, bad.length === 0, bad.length ? bad.slice(0, 8).map(r => `${r.id} ${JSON.stringify(r.why)}`).join(' | ') : '');
        await ctx.close();
      }
    }

    // ── Contrast: ink against the paper actually behind it (screenshot with the text hidden) ──────
    if (want('contrast')) {
      const lumOf = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a, b) => { const [x, y] = [lumOf(a), lumOf(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      for (const mode of modes()) {
        const { page, ctx } = await open(browser, mode);
        await loadSave(page); await idle(page);
        await select(page, 'The Master Chef'); await idle(page);
        const samples = await page.evaluate(desk => {
          const pick = (sel, kind) => [...document.querySelectorAll(sel)].filter(e => { const b = e.getBoundingClientRect(); return b.width > 4 && b.height > 4 && b.top > 0 && b.bottom < innerHeight && b.left > 0 && b.right < innerWidth; }).slice(0, 3).map(e => ({ sel, kind, e }));
          const list = [
            ...pick('#items .item-name', 'body'), ...pick('#items .status', 'body'), ...pick('.description, #description', 'body'), ...pick('#listCount', 'body'),
            // on the desk the collection names are engraved on steel bars (WP-10 legibility check), not ink on paper
            ...(desk ? [] : pick('#categories [data-category] .label span', 'body')), ...pick('.statline, #statline', 'body'), ...pick('p.resources', 'body'),
            ...pick('#metrics .metric strong', 'stamp'), ...pick('#metrics .metric > span', 'stamp'),
          ];
          return list.map((x, i) => {
            const b = x.e.getBoundingClientRect(); const cs = getComputedStyle(x.e);
            const tone = getComputedStyle(x.e).getPropertyValue('--vc-paper-tone').trim();
            let op = 1; for (let y = x.e; y; y = y.parentElement) op *= +getComputedStyle(y).opacity;
            const card = x.e.closest('.metric')?.getBoundingClientRect();
            const R = q => q && { x: Math.floor(q.left), y: Math.floor(q.top), width: Math.ceil(q.width), height: Math.ceil(q.height) };
            return { i, sel: x.sel, kind: x.kind, color: cs.color, tone, op, card: R(card), rect: R(b) };
          });
        }, mode === 'desk');
        // what is on screen, grain included (the stamps and wipes paint on canvas, so the DOM colour is not the ink):
        // ink = the darkest 2 % of the box, paper = its 40th-percentile pixel (darker than most of the paper)
        await page.waitForTimeout(400);
        const shot = await page.screenshot();
        const sharp = require('sharp');
        const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const rows = [];
        for (const sm of samples) {
          const px = [];
          for (let y = sm.rect.y; y < sm.rect.y + sm.rect.height; y++) for (let x = sm.rect.x; x < sm.rect.x + sm.rect.width; x++) {
            const i = (y * info.width + x) * 3; px.push([data[i], data[i + 1], data[i + 2]]);
          }
          px.sort((a, b) => lumOf(a) - lumOf(b));
          // paper: a ring 4–12 px outside the box, its median pixel (paper mottling, row tints and desk shading included)
          const ring = [];
          const { x: rx, y: ry, width: rw, height: rh } = sm.rect;
          for (let y = ry - 12; y < ry + rh + 12; y++) for (let x = rx - 12; x < rx + rw + 12; x++) {
            if (x < 0 || y < 0 || x >= info.width || y >= info.height) continue;
            if (x >= rx - 4 && x < rx + rw + 4 && y >= ry - 4 && y < ry + rh + 4) continue;
            const i = (y * info.width + x) * 3; ring.push([data[i], data[i + 1], data[i + 2]]);
          }
          ring.sort((a, b) => lumOf(a) - lumOf(b));
          // a stamp's paper is its own card (tint included); the ring there would sample its frame and dots
          let cardPx = null;
          if (sm.card) { cardPx = []; for (let y = sm.card.y; y < sm.card.y + sm.card.height; y++) for (let x = sm.card.x; x < sm.card.x + sm.card.width; x++) { const i = (y * info.width + x) * 3; cardPx.push([data[i], data[i + 1], data[i + 2]]); } cardPx.sort((a, b) => lumOf(a) - lumOf(b)); }
          const seen = px[Math.floor(px.length * 0.02)], bg = cardPx ? cardPx[Math.floor(cardPx.length * 0.5)] : (ring[Math.floor(ring.length * 0.5)] || px[Math.floor(px.length * 0.6)]);
          // the pass rule is colour contrast (WCAG): the ink's colour at its alpha × the ink grain's mean (render.js 0.85–1.0 → 0.925) over that paper.
          // On the desk the ink is the DOM print layer over the rendered (lit) paper, so it is not lit itself.
          const m = sm.color.match(/[\d.]+/g).map(Number);
          const ink = m.slice(0, 3); const k = (m[3] ?? 1) * sm.op * 0.925;
          const eff = ink.map((c, j) => c * k + bg[j] * (1 - k));
          rows.push({ ...sm, r: +ratio(eff, bg).toFixed(2), seen: +ratio(seen, bg).toFixed(2), need: sm.kind === 'stamp' ? 3 : 4.5, ink: eff.map(Math.round), bg });
        }
        const bad = rows.filter(r => r.r < r.need);
        numbers[`contrast_${mode}`] = { minBody: Math.min(...rows.filter(r => r.kind === 'body').map(r => r.r)), minStamp: Math.min(...rows.filter(r => r.kind === 'stamp').map(r => r.r)), samples: rows.length, seenMinBody: Math.min(...rows.filter(r => r.kind === 'body').map(r => r.seen)), seenMinStamp: Math.min(...rows.filter(r => r.kind === 'stamp').map(r => r.seen)) };
        check(`contrast: body ink ≥ 4.5:1, stamp ink ≥ 3:1 on the paper behind it (${mode}, ${rows.length} samples)`, bad.length === 0 && rows.length >= 10,
          bad.length ? bad.map(b => `${b.sel} ${b.r}:1 < ${b.need} ink ${b.ink} paper ${b.bg}`).join(' | ') : `lowest body ${numbers[`contrast_${mode}`].minBody}:1, lowest stamp ${numbers[`contrast_${mode}`].minStamp}:1`);
        await ctx.close();
      }
    }

    // ── Sounds: a session of real interactions; every built sound must play from its trigger ──────
    if (want('sounds')) {
      const mix = require(path.join(ROOT, 'src', 'config', 'audio-mix.json'));
      const built = Object.keys(mix.sounds).filter(n => !mix.sounds[n].deferred);
      const playedBy = {};
      const deferredSeen = new Set();
      for (const mode of modes()) {
        const { page, ctx } = await open(browser, mode);
                await page.mouse.click(720, 880);
        await page.waitForTimeout(300);
        // failed and real load
        await page.locator('#saveFile').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('nope') });
        await page.waitForTimeout(600);
        await loadSave(page); await idle(page);
        // coins: hover each (hop), press one
        for (const id of ['howTo', 'importProgress', 'exportProgress', 'loadTop']) {
          const b = await page.locator('#' + id).boundingBox().catch(() => null);
          if (!b) continue;
          await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 }); await page.waitForTimeout(500);
          await page.mouse.move(b.x + b.width / 2, b.y + b.height + 120, { steps: 4 }); await page.waitForTimeout(300);
        }
        // view change by mouse (wash, stamps, dots)
        await page.locator('[data-category="The Carpenter"]').click({ force: true }).catch(() => select(page, 'The Carpenter'));
        await idle(page); await page.waitForTimeout(800);
        // desk: drag a bar to its latch (scrape, latch, the old bar's return)
        if (mode === 'desk') {
          const k = await page.evaluate(() => __vc.board.knob('The Hunter'));
          await page.mouse.move(k.x, k.y); await page.mouse.down();
          for (let i = 1; i <= 28; i++) {
            const p = await page.evaluate(f => { const r = __vc.board.rows.find(x => x.category === 'The Hunter'); return __vc.board.slotPoint('The Hunter', r.barRestX0 + 12 + 0.65 - Math.min(1, f) * 7); }, i / 24);
            await page.mouse.move(p.x, p.y); await page.waitForTimeout(16);
          }
          await page.mouse.up(); await idle(page); await page.waitForTimeout(800);
        }
        // menus
        await page.locator('#statusFilter').click({ force: true }); await page.waitForTimeout(700);
        await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
        await page.evaluate(() => { const s = document.getElementById('statusFilter'); s.selectedIndex = 0; s.dispatchEvent(new Event('change', { bubbles: true })); });
        await idle(page);
        // star on, star off
        await page.locator('#items tr[data-item] button.pin').first().click({ force: true }); await page.waitForTimeout(400);
        await page.locator('#items tr[data-item] button.pin').first().click({ force: true }); await page.waitForTimeout(400);
        // Details open (unfold flaps; on the desk the pointer over the floating sheet sends the spark out)
        await page.locator('#items tr[data-item]').first().dblclick(); await page.waitForTimeout(2800);
        const d = await page.locator('#itemDialog').boundingBox().catch(() => null);
        if (d) { for (let i = 0; i < 12; i++) { await page.mouse.move(d.x + 40 + i * 20, d.y + 60 + i * 6); await page.waitForTimeout(60); } await page.waitForTimeout(1200); }
        await page.keyboard.press('Escape'); await page.waitForTimeout(500);
        // back on the desk: the spark returns; fast sweeps over the paper lift its corners
        for (let r = 0; r < 3; r++) for (let i = 0; i <= 20; i++) { await page.mouse.move(200 + i * 55, 250 + (r * 180) + (i % 2) * 30); await page.waitForTimeout(8); }
        await page.waitForTimeout(2500);
        const req = await page.evaluate(() => __vc.sound.requests.map(r => [r.name, r.played, r.why || '']));
        for (const [n, played, why] of req) { if (played) (playedBy[n] ??= new Set()).add(mode); else if (why === 'deferred') deferredSeen.add(n); }
        await ctx.close();
      }
      const missing = built.filter(n => !playedBy[n]);
      numbers.sounds = { built: built.length, played: built.length - missing.length, deferredWired: deferredSeen.size };
      check(`sounds: every built sound plays from its real trigger (${built.length} built; ${deferredSeen.size} deferred ones requested, silent)`, missing.length === 0,
        missing.length ? 'not heard: ' + missing.join(', ') : built.map(n => `${n} (${[...playedBy[n]].join('+')})`).join(', '));
    }

    // ── "Also show the normal pointer" (WP-09 help switch), by keyboard; it survives a reload ──
    if (want('pointer') && (!ONLY || ONLY === 'desk')) {
      const { page, ctx } = await open(browser, 'desk');
      const isActive = sel => page.evaluate(sl => !!document.activeElement && document.activeElement.matches(sl), sel);
      const tabTo = async (sel, max = 300) => { for (let i = 0; i < max; i++) { if (await isActive(sel)) return true; await page.keyboard.press('Tab'); } return false; };
      const cursor = () => page.evaluate(() => getComputedStyle(document.querySelector('#desk canvas') || document.getElementById('desk')).cursor);
      const fails = [];
      const before = await cursor();
      if (before !== 'none') fails.push(`gauntlet pointer: native cursor ${before}`);
      if (!(await tabTo('details.help > summary'))) fails.push('help summary not reachable');
      await page.keyboard.press('Enter'); await page.waitForTimeout(2600);
      if (!(await tabTo('#vcShowPointer', 80))) fails.push('switch not reachable');
      await page.keyboard.press('Space'); await page.waitForTimeout(300);
      const on = await page.evaluate(() => ({ cls: document.body.classList.contains('vc-show-pointer'), checked: document.getElementById('vcShowPointer').checked }));
      const shown = await cursor();
      if (!on.cls || !on.checked || shown === 'none') fails.push(`switch on: ${JSON.stringify(on)} cursor ${shown}`);
      await page.reload(); await page.waitForSelector('#categories [data-category]', { state: 'attached' }); await page.waitForTimeout(1500);
      const kept = await page.evaluate(() => document.body.classList.contains('vc-show-pointer') && document.getElementById('vcShowPointer')?.checked);
      if (!kept) fails.push('not kept after reload');
      await page.evaluate(() => { const b = document.getElementById('vcShowPointer'); b.click(); });
      if ((await cursor()) !== 'none') fails.push('switching off did not hide the native pointer again');
      check('"Also show the normal pointer": by keyboard, the native pointer comes back, kept after a reload, off again', fails.length === 0, fails.join('; ') || `cursor none → ${shown}`);
      await ctx.close();
    }

    // ── DECISIONS 24: a desk window resized below 1024 × 640 stays desk and fits the scene ──────
    if (want('resize') && (!ONLY || ONLY === 'desk')) {
      const { page, ctx, errors } = await open(browser, 'desk');
      await loadSave(page); await idle(page);
      const fails = [];
      let k = 0;
      for (const [w, h] of [[1000, 620], [900, 600], [800, 500], [1440, 900]]) {
        const target = k++ % 2 ? 'The Hunter' : 'The Carpenter'; // a real change at every size
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(900);
        const r = await page.evaluate(() => {
          const c = document.getElementById('scene') || document.querySelector('#desk canvas');
          const b = c?.getBoundingClientRect();
          return { desk: document.body.classList.contains('mode-desk') && !!document.getElementById('desk'), cw: Math.round(b?.width || 0), ch: Math.round(b?.height || 0), iw: innerWidth, ih: innerHeight, overflowX: document.documentElement.scrollWidth > innerWidth + 1, frames: __vc.stage.stats().frames };
        });
        if (!r.desk) fails.push(`${w}×${h}: left desk mode`);
        if (Math.abs(r.cw - r.iw) > 1 || Math.abs(r.ch - r.ih) > 1) fails.push(`${w}×${h}: scene ${r.cw}×${r.ch} not fitted to ${r.iw}×${r.ih}`);
        if (r.overflowX) fails.push(`${w}×${h}: horizontal scroll`);
        await select(page, target); await idle(page);
        const sel = await page.evaluate(c => document.querySelector(`[data-category="${c}"]`)?.getAttribute('aria-current'), target);
        if (sel !== 'page') fails.push(`${w}×${h}: view change failed`);
      }
      if (errors.length) fails.push('page errors: ' + errors.join(' / '));
      check('DECISIONS 24: desk resized to 1000×620, 900×600, 800×500 stays desk, scene fills the window, views still change', fails.length === 0, fails.join('; '));
      await ctx.close();
    }

    if (want('axe')) {
      for (const mode of modes()) {
        const { page, ctx } = await open(browser, mode);
        await axe(page, `${mode}, no save`);
        await loadSave(page); await idle(page);
        const bad = [];
        for (const v of VIEWS) {
          await select(page, v); await idle(page);
          const all = await axeRun(page);
          if (all.some(KNOWN)) known.add(`${mode}, ${v}`);
          const r = all.filter(x => !KNOWN(x)).map(x => `${x.id}×${x.nodes.length}: ${x.nodes[0].target.join(' ')}`);
          if (r.length) bad.push(`${v}: ${r.join('; ')}`);
        }
        check(`axe: 0 violations in all 13 views (${mode})`, !bad.length, bad.join(' | '));
        await select(page, 'The Master Chef'); await idle(page);
        await page.locator('#items tr[data-item]').first().dblclick(); await page.waitForTimeout(2700);
        await axe(page, `${mode}, Details open`);
        await page.keyboard.press('Escape'); await page.waitForTimeout(1300);
        await page.locator('#howTo').click(); await page.waitForTimeout(2700);
        await axe(page, `${mode}, How-to open`);
        await page.keyboard.press('Escape'); await page.waitForTimeout(1300);
        await page.evaluate(() => __vc.tour.start()); await page.waitForTimeout(700);
        await axe(page, `${mode}, tour open`);
        await page.keyboard.press('Escape'); await page.waitForTimeout(700);
        await page.locator('#statusFilter').click({ force: true }); await page.waitForTimeout(500);
        await axe(page, `${mode}, menu open`);
        await page.keyboard.press('Escape'); await page.waitForTimeout(400);
        await page.evaluate(() => { const d = document.querySelector('details.help'); d.open = true; d.dispatchEvent(new Event('toggle')); });
        await page.waitForTimeout(2600);
        await axe(page, `${mode}, help open`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  const errs = [...new Set(allErrors.flat())];
  check('no page or console errors in any session of this run', errs.length === 0, errs.slice(0, 4).join(' | '));
  if (known.size) console.log(`KNOWN  axe label-content-name-mismatch on #loadTop (original markup, locked by parity P-tests; not counted): ${[...known].join(' · ')}`);
  const bad = results.filter(r => !r.ok).length;
  console.log('\nNUMBERS ' + JSON.stringify(numbers));
  console.log(`${results.length - bad}/${results.length} passed`);
  process.exit(bad ? 1 : 0);
})();
