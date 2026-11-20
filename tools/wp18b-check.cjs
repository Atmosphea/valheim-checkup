// Builder self-check for WP-18B (Paul's feedback round 3, items 11–17: board bars, table rows, stamps, Details).
//   npm run build:single && node tools/wp18b-check.cjs [all|notches|rows|stamps|open|burn|icon|gourmet] [html]
// Real GPU (Metal), 1440 × 900. Paul's save from fixtures/private; the character name is never printed
// and is masked in the screenshots (docs/reports/wp-18b/).
const path = require('node:path');
const fs = require('node:fs');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const PRIVATE = path.join(ROOT, 'fixtures', 'private');
const SAVE = fs.readFileSync(path.join(PRIVATE, fs.readdirSync(PRIVATE).find(f => f.endsWith('.fch'))));
const MODE = process.argv[2] || 'all';
const HTML = path.resolve(process.argv[3] || path.join(ROOT, 'dist', 'valheim-checkup.html'));
const SHOTS = path.join(ROOT, 'docs', 'reports', 'wp-18b');
const ARGS = ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'];
const FOODS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'food-recipes.json'), 'utf8')).foods;
const want = m => MODE === 'all' || MODE.split(',').includes(m);
const results = [];
const NAMES = new Set();
const red = t => { let o = String(t); for (const n of NAMES) if (n) o = o.split(n).join('{name}'); return o; };
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(red(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)); };
const info = (name, detail) => console.log(red(`INFO  ${name}  — ${detail}`));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'UTC', reducedMotion: o.reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error' && !/GPU stall due to ReadPixels|GL_CLOSE_PATH_NV|net::ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(`file://${HTML}?mode=${o.mode || 'desk'}&seed=7`);
  return { page, ctx, errors };
}
const idle = page => page.waitForFunction(() => !__vc.ink?.state().running && (__vc.ink?.state().ghosts ?? 0) === 0, null, { timeout: 20000 }).catch(() => {});
async function loadSave(page) {
  await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
  await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 20000 });
  NAMES.add(await page.evaluate(() => document.querySelector('#headerProfile strong')?.textContent || ''));
}
async function desk(browser, o = {}) {
  const r = await open(browser, o);
  if ((o.mode || 'desk') === 'desk') await r.page.waitForFunction(() => window.__vc?.stage?.textures?.ready?.() && __vc.stage.stats().frames > 10, null, { timeout: 60000 });
  else await r.page.waitForFunction(() => document.body.classList.contains('mode-flat') && !!window.__vc, null, { timeout: 30000 });
  await loadSave(r.page); await idle(r.page);
  await r.page.mouse.move(800, 600, { steps: 4 }); await sleep(1500);
  return r;
}
const mask = page => page.evaluate(() => {
  const name = document.querySelector('#headerProfile strong')?.textContent || '';
  if (!name) return;
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) if (n.nodeValue.includes(name)) n.nodeValue = n.nodeValue.split(name).join('{name}');
  __vc.stage?.markPrintDirty(); __vc.stage?.renderNow?.();
});
const shot = async (page, name, clip) => { await mask(page); await sleep(120); await page.screenshot({ path: path.join(SHOTS, name), ...(clip ? { clip } : {}) }); return name; };
async function category(page, title) {
  await page.evaluate(t => document.querySelector(`#categories [data-category="${t}"], #insightNav [data-category="${t}"]`).click(), title);
  await sleep(600); await idle(page); await sleep(400);
}
async function details(page, name) {
  await page.evaluate(n => { const r = [...document.querySelectorAll('#items tr')].find(t => t.querySelector('.item-name')?.textContent === n); r.querySelector('[data-details]').click(); }, name);
  await page.waitForFunction(() => document.getElementById('itemDialog').open && !document.querySelector('.vc-unfold'), null, { timeout: 8000 }).catch(() => {});
  await sleep(400);
}
const closeNow = async page => { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.vc-burn'), null, { timeout: 10000 }).catch(() => {}); };

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ARGS });
  const allErrors = [];
  try {
    // ── 11 · notched tracks on the bars ───────────────────────────────────────────────────
    if (want('notches')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      const n = await page.evaluate(() => __vc.board.state().notches);
      const coll = await page.evaluate(() => [...document.querySelectorAll('#categories [data-bar]')].map(b => b.dataset.category || b.closest('[data-category]')?.dataset.category));
      const on = n.filter(b => b.on), off = n.filter(b => !b.on);
      check('11 every collection bar carries the notched track', on.length > 0 && on.length >= coll.filter(Boolean).length, `${on.length} notched of ${n.length} bars; ${coll.length} collection bars`);
      check('11 the insight bars stay plain (no notches)', off.length === n.length - on.length && off.length > 0, `${off.length} plain`);
      const zero = on.filter(b => b.fillCm === 0).length;
      info('11 notches also on a 0 % bar', `${zero} notched bar(s) at 0 %`);
      await page.mouse.move(5, 450, { steps: 8 }); await sleep(2600);
      await shot(page, 'bars.png');
      await shot(page, 'bars-close.png', { x: 0, y: 120, width: 760, height: 700 });
      await ctx.close();
    }

    // ── 12 · row-height release: burn away, rescale, burn in ──────────────────────────────
    if (want('rows')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      const m0 = await page.evaluate(() => ({ font: parseFloat(getComputedStyle(document.querySelector('#items .item-name')).fontSize), icon: document.querySelector('#items .vc-icon')?.getBoundingClientRect().width ?? 0, k: __vc.surfaces.rowBurn.read().k }));
      await page.evaluate(() => __vc.timeScale(0.25));
      await page.evaluate(() => document.querySelector('[role="slider"]').focus());
      for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowUp'); await sleep(30); }
      await page.waitForFunction(() => __vc.surfaces.rowBurn.read().running, null, { timeout: 8000 });
      await sleep(900);
      const away = await page.evaluate(() => ({ ...__vc.surfaces.rowBurn.read(), wrapFilter: getComputedStyle(document.querySelector('#print .tablewrap')).filter }));
      check('12 letting go burns the rows away (the SVG burn filter on the table)', away.running && /vc-row-burn/.test(away.wrapFilter), JSON.stringify({ phase: away.phase, filter: away.wrapFilter.slice(0, 30) }));
      await shot(page, 'rows-away.png', { x: 400, y: 480, width: 1040, height: 420 });
      await page.waitForFunction(() => __vc.surfaces.rowBurn.read().phase === 'in', null, { timeout: 10000 });
      await sleep(700);
      await shot(page, 'rows-in.png', { x: 400, y: 480, width: 1040, height: 420 });
      await page.waitForFunction(() => !__vc.surfaces.rowBurn.read().running, null, { timeout: 15000 });
      await page.evaluate(() => __vc.timeScale(1)); await sleep(400);
      const m1 = await page.evaluate(() => ({ font: parseFloat(getComputedStyle(document.querySelector('#items .item-name')).fontSize), icon: document.querySelector('#items .vc-icon')?.getBoundingClientRect().width ?? 0, k: __vc.surfaces.rowBurn.read().k, scale: +getComputedStyle(document.documentElement).getPropertyValue('--vc-row-scale'), filter: getComputedStyle(document.querySelector('#print .tablewrap')).filter }));
      check('12 after the burn-in the row content is rescaled to the new height (text and icon)', m1.font > m0.font * 1.05 && m1.icon > m0.icon * 1.05 && Math.abs(m1.k - m1.scale / 1.3) < 0.01, JSON.stringify({ before: m0, after: m1 }));
      check('12 the filter is gone afterwards', m1.filter === 'none', m1.filter);
      await shot(page, 'rows-after.png', { x: 400, y: 480, width: 1040, height: 420 });
      await ctx.close();
      // reduced motion: the size is set straight away, no burn
      const r = await desk(browser, { reduced: true });
      allErrors.push(...r.errors);
      await r.page.evaluate(() => document.querySelector('[role="slider"]').focus());
      for (let i = 0; i < 3; i++) { await r.page.keyboard.press('ArrowUp'); await sleep(30); }
      await sleep(900);
      const rr = await r.page.evaluate(() => ({ ...__vc.surfaces.rowBurn.read(), scale: +getComputedStyle(document.documentElement).getPropertyValue('--vc-row-scale') }));
      check('12 reduced motion: no burn, the new size applies directly', !rr.running && rr.runs === 0 && Math.abs(rr.k - rr.scale / 1.3) < 0.01, JSON.stringify({ runs: rr.runs, k: rr.k, scale: rr.scale }));
      await r.ctx.close();
    }

    // ── 13 · stamp dots ───────────────────────────────────────────────────────────────────
    if (want('stamps')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      for (const cat of ['The Trophy Collector', 'The Gourmet']) {
        await category(page, cat); await sleep(2500);
        const g = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#metrics [data-metric]')].map(m => {
          const cells = [...m.querySelectorAll('.dots > .dot')];
          const box = m.querySelector('.dots')?.getBoundingClientRect();
          const cs = m.querySelector('.dots') ? getComputedStyle(m.querySelector('.dots')) : null;
          return [m.dataset.metric, { on: cells.map(c => c.classList.contains('on') ? 1 : 0).join(''), dir: cs?.flexDirection, wrap: cs?.flexWrap, full: +(m.querySelector('.dots')?.dataset.full || 0) }];
        })));
        const pre = s => /^1*0*$/.test(s), suf = s => /^0*1*$/.test(s);
        const same = ['done', 'missing', 'unknown', 'discovered'].every(k => !g[k] || (g[k].dir === g.done.dir && g[k].wrap === g.done.wrap));
        check(`13 ${cat}: every stamp uses Completed's circle layout`, same, JSON.stringify(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.dir + '/' + v.wrap]))));
        check(`13 ${cat}: Completed fills from the first circle`, pre(g.done.on), g.done.on);
        check(`13 ${cat}: Missing is the reverse (filled run at the end)`, suf(g.missing.on), g.missing.on);
        for (const k of ['discovered', 'unknown']) if (g[k]?.on) check(`13 ${cat}: ${k === 'discovered' ? 'Undiscovered' : 'Unverified'} fills from the end`, suf(g[k].on), g[k].on);
      }
      await page.mouse.move(800, 600, { steps: 4 }); await sleep(800);
      await shot(page, 'stamps.png', { x: 0, y: 330, width: 1440, height: 160 });
      await ctx.close();
    }

    // ── 14 · Details opens from nothing in the middle ─────────────────────────────────────
    if (want('open')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      await category(page, 'The Trophy Collector');
      await page.evaluate(() => __vc.timeScale(0.25));
      const btn = await page.evaluate(() => { const b = document.querySelector('#items [data-details]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      await page.evaluate(() => {
        window.__open = [];
        const t0 = performance.now();
        const tick = () => {
          const u = document.querySelector('#float .vc-unfold');
          if (u) { const b = u.getBoundingClientRect(); const pk = u.querySelector('.vc-unfold-pack'); window.__open.push({ t: performance.now() - t0, cx: b.left + b.width / 2, cy: b.top + b.height / 2, w: b.width, op: +getComputedStyle(u).opacity * (pk ? +getComputedStyle(pk).opacity : 1) }); }
          if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
        };
        document.querySelector('#items [data-details]').click();
        requestAnimationFrame(tick);
      });
      await sleep(500); await shot(page, 'open-early.png');
      await page.waitForFunction(() => !document.querySelector('#float .vc-unfold') && document.getElementById('itemDialog').open, null, { timeout: 15000 }).catch(() => {});
      await page.evaluate(() => __vc.timeScale(1)); await sleep(400);
      const fr = await page.evaluate(() => window.__open);
      const d = await page.evaluate(() => { const b = document.getElementById('itemDialog').getBoundingClientRect(); return { cx: b.left + b.width / 2, cy: b.top + b.height / 2 }; });
      const first = fr[0];
      check('14 the letter appears where it will lie (mid-screen), not at the Details button', first && Math.hypot(first.cx - d.cx, first.cy - d.cy) < 40 && Math.hypot(first.cx - btn.x, first.cy - btn.y) > 200, JSON.stringify({ first: first && { cx: Math.round(first.cx), cy: Math.round(first.cy) }, final: { cx: Math.round(d.cx), cy: Math.round(d.cy) }, button: { x: Math.round(btn.x), y: Math.round(btn.y) } }));
      check('14 it fades in from nothing (opacity rises from near 0)', first && first.op < 0.35 && fr.some(f => f.op > 0.9), `opacity ${fr.filter((_, i) => i % 4 === 0).slice(0, 8).map(f => f.op.toFixed(2)).join(' ')}`);
      await shot(page, 'open.png');
      await ctx.close();
    }

    // ── 15 · the burn: falling, wind, char ahead of the ember, black fragments, crackle ────
    if (want('burn')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      await category(page, 'The Trophy Collector');
      await details(page, 'Fader Trophy');
      await page.evaluate(() => { window.__vc.sound.requests.length = 0; });
      await page.evaluate(() => __vc.timeScale(0.2));
      await page.evaluate(() => {
        window.__burn = [];
        const t0 = __vc.clock?.now?.() ?? performance.now();
        const tick = () => {
          const s = document.querySelector('.vc-burn-sheet'), st = document.querySelector('.vc-burn');
          if (st) {
            const m = s ? new DOMMatrix(getComputedStyle(s).transform) : null;
            window.__burn.push({ frags: +(st.dataset.frags || 0), sheet: !!s, clip: s?.style.clipPath.slice(0, 10) ?? '', ty: m ? m.m42 : null, tx: m ? m.m41 : null, rot: m ? Math.atan2(m.m12, m.m11) * 180 / Math.PI : null, t: s?.style.transform ?? '' });
          }
          if (window.__burn.length < 2000 && (st || window.__burn.length === 0)) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await page.keyboard.press('Escape');
      await sleep(1500); await shot(page, 'burn-catch.png');
      await sleep(1500); await shot(page, 'burn-fall.png');
      await sleep(1500); await shot(page, 'burn-late.png');
      await page.waitForFunction(() => !document.querySelector('.vc-burn'), null, { timeout: 30000 }).catch(() => {});
      await page.evaluate(() => __vc.timeScale(1));
      const b = await page.evaluate(() => window.__burn);
      const withSheet = b.filter(x => x.sheet && x.t && x.clip !== 'inset(50%');
      const fallPx = Math.max(...withSheet.map(x => { const m = x.t.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/); return m ? +m[2] : 0; }));
      const drift = Math.max(...withSheet.map(x => { const m = x.t.match(/translate\(([-\d.]+)px/); return m ? Math.abs(+m[1]) : 0; }));
      const turn = Math.max(...withSheet.map(x => { const m = x.t.match(/ rotate\(([-\d.]+)deg\)/); return m ? Math.abs(+m[1]) : 0; }));
      const tumble = Math.max(...withSheet.map(x => { const m = x.t.match(/rotateX\(([-\d.]+)deg\)/); return m ? Math.abs(+m[1]) : 0; }));
      check('15 the sheet falls (moves down) while it burns', fallPx > 60, `${fallPx.toFixed(0)} px down`);
      check('15 carried by the wind and turning, with a slight 3D tumble', drift > 25 && turn > 8 && tumble > 5, `drift ${drift.toFixed(0)} px, turn ${turn.toFixed(1)}°, tumble ${tumble.toFixed(1)}°`);
      const maxFrags = Math.max(0, ...b.map(x => x.frags));
      check('15 black paper fragments float off (a cloud, not specks)', maxFrags >= 40, `${maxFrags} fragments at once`);
      const lastSheet = b.findLastIndex(x => x.sheet && x.clip !== 'inset(50%)');
      check('15 fragments outlive the sheet and drift on', lastSheet >= 0 && b.slice(lastSheet + 1).some(x => x.frags > 0), `${b.length - lastSheet - 1} frames after the sheet`);
      const req = await page.evaluate(() => window.__vc.sound.requests.map(r => r.name + (r.played ? '' : ':' + r.why)));
      check('15 the close plays the crackle (fold.close built as a burn crackle), no fold sound', req.includes('fold.close') && !req.some(n => /fold\.close:deferred|unfold\.flap/.test(n)), req.join(' '));
      await ctx.close();
    }

    // ── 16 · a big square item icon ───────────────────────────────────────────────────────
    if (want('icon')) {
      for (const mode of ['desk', 'flat']) {
        const { page, ctx, errors } = await desk(browser, { mode });
        allErrors.push(...errors);
        await category(page, 'The Trophy Collector');
        await details(page, 'Fader Trophy');
        const ic = await page.evaluate(() => { const e = document.querySelector('#itemDialog .dialog-heading > .vc-icon'); const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { w: b.width, h: b.height, border: parseFloat(cs.borderTopWidth), content: parseFloat(cs.width) }; });
        check(`16 ${mode}: the item icon is much bigger (was 44 px) and square, in a frame`, ic.content >= 80 && Math.abs(ic.w - ic.h) < 1 && ic.border >= 1, JSON.stringify(ic));
        await shot(page, `icon-${mode}.png`);
        await ctx.close();
      }
    }

    // ── 17 · Gourmet lockup and recipe row ────────────────────────────────────────────────
    if (want('gourmet')) {
      const { page, ctx, errors } = await desk(browser);
      allErrors.push(...errors);
      await category(page, 'The Gourmet');
      const read = () => page.evaluate(() => {
        const d = document.getElementById('itemDialog'), h = d.querySelector('.dialog-heading');
        const box = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height, cx: b.left + b.width / 2 }; };
        const row = d.querySelector('.vc-dt-recipe');
        return {
          lockup: h.classList.contains('vc-dt-lockup'), heading: box(h), name: box(h.querySelector('h2')), nameText: h.querySelector('h2')?.textContent,
          icon: box(h.querySelector(':scope > .vc-icon')), station: box(h.querySelector('.vc-dt-station .vc-icon')), stationLabel: h.querySelector('.vc-dt-station')?.getAttribute('aria-label') ?? null,
          level: h.querySelector('.vc-dt-level')?.textContent ?? null, levelPx: h.querySelector('.vc-dt-level') ? parseFloat(getComputedStyle(h.querySelector('.vc-dt-level')).fontSize) : 0,
          ings: row ? [...row.querySelectorAll('.vc-dt-ing')].map(f => ({ name: f.querySelector('figcaption').textContent, qty: f.querySelector('.vc-dt-qty').textContent, icon: !!f.querySelector('.vc-icon'), qtyPx: parseFloat(getComputedStyle(f.querySelector('.vc-dt-qty')).fontSize), nameBelow: f.querySelector('figcaption').getBoundingClientRect().top >= f.querySelector('.vc-dt-ing-top').getBoundingClientRect().bottom - 1 })) : [],
          seps: row ? row.querySelectorAll('.vc-dt-sep').length : 0, credit: row?.querySelector('.vc-dt-credit')?.textContent ?? null, makes: row?.querySelector('.vc-dt-makes')?.textContent ?? null,
          rowAfterHeading: row ? row.previousElementSibling === h : null,
        };
      });
      // Pancakes: Cauldron level 6, 4 ingredients, makes 3
      await details(page, 'Pancakes');
      let g = await read();
      const P = FOODS.Pancakes;
      check('17 Pancakes: the name is centred in the header', g.lockup && Math.abs(g.name.cx - g.heading.cx) < 4, `name centre ${g.name.cx.toFixed(0)}, header centre ${g.heading.cx.toFixed(0)}`);
      check('17 the big item icon left of the name, the station icon right of it at the same size', g.icon && g.station && g.icon.r <= g.name.l + 1 && g.station.l >= g.name.r - 1 && Math.abs(g.icon.w - g.station.w) < 1 && Math.abs(g.icon.h - g.station.h) < 1, JSON.stringify({ icon: g.icon?.w, station: g.station?.w, label: g.stationLabel }));
      check('17 the station level is a big number right of the station icon', g.level === String(P.stationLevel) && g.levelPx >= 40, `${g.level} at ${g.levelPx}px (data: ${P.station} ${P.stationLevel})`);
      check('17 the recipe row: each ingredient an icon, a big quantity and its name below, bullets between', g.ings.length === P.ingredients.length && g.ings.every((x, i) => x.name === P.ingredients[i].name && x.qty === String(P.ingredients[i].qty) && x.icon && x.qtyPx >= 26 && x.nameBelow) && g.seps === P.ingredients.length - 1, JSON.stringify(g.ings.map(x => `${x.qty} ${x.name}`)) + ` · ${g.seps} bullets · ${g.makes}`);
      check('17 the recipe row sits right under the header and is credited like the trophy data', g.rowAfterHeading && g.credit === 'Valheim Wiki · CC BY-SA 3.0', String(g.credit));
      await shot(page, 'gourmet-pancakes.png');
      await closeNow(page);
      // a raw food: only what exists (no station, no recipe)
      await details(page, 'Raspberries');
      g = await read();
      check('17 Raspberries (raw food): the lockup, and no station or recipe', g.lockup && !g.station && g.ings.length === 0 && g.credit === null, JSON.stringify({ station: !!g.station, ings: g.ings.length }));
      await shot(page, 'gourmet-raw.png');
      await closeNow(page);
      // the one item without an entry
      await details(page, 'Blue Mushroom');
      g = await read();
      check('17 Blue Mushroom (no entry): the lockup only', g.lockup && !g.station && g.ings.length === 0, JSON.stringify({ station: !!g.station, ings: g.ings.length }));
      await closeNow(page);
      // a station without a level, many ingredients, servings
      const feast = Object.entries(FOODS).find(([, v]) => v.uses && v.ingredients.length >= 4)?.[0];
      if (feast) {
        await details(page, feast);
        g = await read();
        check(`17 ${feast}: every ingredient shown with an icon; servings noted`, g.ings.length === FOODS[feast].ingredients.length && g.ings.every(x => x.icon) && /servings/.test(g.makes || ''), `${g.ings.length} ingredients · ${g.makes}`);
        await shot(page, 'gourmet-feast.png');
        await closeNow(page);
      }
      // other collections: no lockup
      await category(page, 'The Trophy Collector');
      await details(page, 'Fader Trophy');
      g = await read();
      check('17 other collections keep the plain heading', !g.lockup && !g.station && g.ings.length === 0, JSON.stringify({ lockup: g.lockup }));
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
