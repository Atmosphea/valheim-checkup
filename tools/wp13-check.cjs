// Builder self-check for WP-13 (flat fallback, phones, touch). Run after the build:
//   npm run build:single && node tools/wp13-check.cjs [all|skin|coins|details|menus|touch|drop|reduced|nowebgl|help|sounds|widths]
// Real GPU (Metal) except the --disable-webgl section. Paul's save comes from fixtures/private; the
// character name is never printed.
const path = require('node:path');
const fs = require('node:fs');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const PRIVATE = path.join(ROOT, 'fixtures', 'private');
const SAVE = fs.readFileSync(path.join(PRIVATE, fs.readdirSync(PRIVATE).find(f => f.endsWith('.fch'))));
const URL = 'file://' + path.join(ROOT, 'dist', 'valheim-checkup.html');
const ARGS = ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'];
const MODE = process.argv[2] || 'all';
const want = m => MODE === 'all' || MODE === m;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

async function open(browser, o = {}) {
  const ctx = await browser.newContext({
    viewport: o.viewport || { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC',
    hasTouch: !!o.touch, isMobile: !!o.touch, reducedMotion: o.reduced ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await page.goto(URL + (o.query ?? '?mode=flat&seed=7'));
  await page.waitForSelector('#categories [data-category]', { state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
  return { page, ctx, errors };
}
async function loadSave(page) {
  await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
  await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 20000 });
}
const idle = page => page.waitForFunction(() => !__vc.ink?.state().running && (__vc.ink?.state().ghosts ?? 0) === 0, null, { timeout: 15000 }).catch(() => {});
const since = page => page.evaluate(() => performance.now());
const evts = (page, s) => page.evaluate(s => __vc.events.filter(e => e.wall >= s).map(e => ({ type: e.type, data: e.data })), s);
const types = (list, t) => list.filter(e => e.type === t);

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (want('skin') || want('coins') || want('details') || want('menus') || want('drop') || want('sounds')) {
      const { page, ctx, errors } = await open(browser);
      await page.mouse.click(5, 890); // unlock audio (first press)
      await loadSave(page);
      await idle(page);
      await page.waitForFunction(() => __vc.flat?.read().paper, null, { timeout: 5000 }).catch(() => {});

      if (want('skin')) {
        const r = await page.evaluate(() => {
          const cs = getComputedStyle(document.body);
          return {
            flat: document.body.classList.contains('mode-flat'), paper: document.body.classList.contains('vc-paper'),
            paperReady: __vc.flat.read().paper, bg: /url\("?(data:image\/png|blob:)/.test(cs.backgroundImage), // WP-14: a blob: URL now
            brandFont: getComputedStyle(document.querySelector('.brand')).fontFamily,
            itemFont: getComputedStyle(document.querySelector('.item-name')).fontFamily,
            iconBlend: getComputedStyle(document.querySelector('.vc-icon')).mixBlendMode,
            three: !!window.__vc.stage, knob: getComputedStyle(document.querySelector('.category.active'), '::before').content,
            inlay: getComputedStyle(document.querySelector('.category .track i')).backgroundImage.includes('gradient'),
            counts: [...document.querySelectorAll('#categories .category small')].length,
          };
        });
        check('skin: body.mode-flat + vc-paper; 2D-canvas paper tile applied', r.flat && r.paper && r.paperReady && r.bg);
        check('skin: Grenze Gotisch brand, IM Fell English text', /Grenze/.test(r.brandFont) && /IM Fell English/.test(r.itemFont), `${r.brandFont} / ${r.itemFont}`);
        check('skin: icons multiply on paper (WP-02 open 2)', r.iconBlend === 'multiply', r.iconBlend);
        check('skin: no 3D stage in flat', !r.three);
        check('sidebar: brass inlay on every collection, counts kept, knob mark on the active one', r.inlay && r.counts === 11 && r.knob === '""', `${r.counts} counts`);
      }

      if (want('coins')) {
        const s = await since(page);
        const imp = page.locator('#importProgress');
        await imp.hover(); await page.waitForTimeout(350);
        await page.mouse.move(700, 500);
        const hop = await page.evaluate(() => document.getElementById('importProgress').getAnimations().length);
        const e1 = await evts(page, s);
        check('coins: hover hops and emits coin:hop', types(e1, 'coin:hop').length >= 1, `coin:hop ${types(e1, 'coin:hop').length}`);
        const coins = await page.evaluate(() => ['howTo', 'loadTop', 'importProgress', 'exportProgress', 'vcSound'].map(id => { const el = document.getElementById(id); return el && el.classList.contains('vc-coin') && getComputedStyle(el).borderRadius; }));
        check('coins: How to, Load, Import, Export and Sound are coins', coins.every(Boolean), JSON.stringify(coins));
        const before = await page.evaluate(() => __vc.sound.muted());
        await page.locator('#vcSound').click(); await page.waitForTimeout(300);
        const after = await page.evaluate(() => ({ muted: __vc.sound.muted(), pressed: document.getElementById('vcSound').getAttribute('aria-pressed') }));
        await page.locator('#vcSound').click(); await page.waitForTimeout(300);
        const back = await page.evaluate(() => __vc.sound.muted());
        check('coins: Sound mutes and unmutes; aria-pressed follows', before === false && after.muted === true && after.pressed === 'false' && back === false, JSON.stringify(after));
        void hop;
      }

      if (want('details')) {
        const s = await since(page);
        await page.locator('#items tr[data-item]').first().dblclick();
        await page.waitForTimeout(2600);
        const e = await evts(page, s);
        const r = await page.evaluate(() => ({ open: document.getElementById('itemDialog').open, layer: document.getElementById('itemDialog').parentElement.className, focus: document.activeElement?.id }));
        check('details: dblclick unfolds in CSS 3D (5 folds, float)', r.open && types(e, 'details:fold').length === 5 && types(e, 'details:float').length === 1, `folds ${types(e, 'details:fold').length}`);
        check('details: parchment sheet in #float, focus inside', /vc-details-layer/.test(r.layer) && r.focus === 'closeDetails', r.focus);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1300);
        const c = await page.evaluate(() => ({ open: document.getElementById('itemDialog').open, focus: document.activeElement?.dataset?.details !== undefined }));
        check('details: Escape folds it shut and returns focus to Details', !c.open && c.focus);
        const s2 = await since(page);
        await page.locator('#howTo').click();
        await page.waitForTimeout(1700);
        const e2 = await evts(page, s2);
        check('how-to: popup unfolds (5 folds)', types(e2, 'details:fold').filter(x => x.data?.surface === 'howto').length === 5);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1200);
      }

      if (want('menus')) {
        const s = await since(page);
        await page.locator('#statusFilter').click();
        await page.waitForTimeout(450);
        const m = await page.evaluate(() => __vc.flat.menus.read());
        await page.locator('#float .vc-menu-item').nth(1).click();
        await page.waitForTimeout(500);
        const v = await page.evaluate(() => document.getElementById('statusFilter').value);
        const e = await evts(page, s);
        check('menus: a mouse press opens the parchment list; choosing sets the select and fires change', m?.id === 'statusFilter' && v === 'all' && types(e, 'menu:open').length === 1, v);
        const sw = await page.evaluate(() => !!document.querySelector('.vc-rswitch'));
        check('menus: record-mode brass switch present', sw);
      }

      if (want('drop')) {
        // tour open, then a file dropped on its capture layer (DECISIONS point 10)
        await page.evaluate(() => __vc.tour.start());
        await page.waitForTimeout(400);
        const s = await since(page);
        const dt = await page.evaluateHandle(bytes => {
          const d = new DataTransfer();
          d.items.add(new File([new Uint8Array(bytes)], 'characters_test.fch'));
          return d;
        }, [...SAVE]);
        const layer = page.locator('.vc-tour');
        await layer.dispatchEvent('dragenter', { dataTransfer: dt });
        const dragOn = await page.evaluate(() => document.body.classList.contains('vc-file-drag'));
        await layer.dispatchEvent('dragover', { dataTransfer: dt });
        await layer.dispatchEvent('drop', { dataTransfer: dt });
        await page.waitForTimeout(1500);
        const e = await evts(page, s);
        const loads = types(e, 'app:load');
        check('drop: whole page takes a .fch, also on the tour capture layer', dragOn && loads.length === 1 && loads[0].data?.ok, `loads ${loads.length}`);
        await page.keyboard.press('Escape');
        await idle(page);
      }

      if (want('sounds')) {
        const log = await page.evaluate(() => [...new Set(__vc.sound.log.map(x => x.name))]);
        const need = ['stamp.big', 'stamp.dot', 'wash.out', 'wash.in', 'menu.open', 'unfold.flap', 'toast.in', 'load.success', 'coin.up'];
        const miss = need.filter(n => !log.includes(n));
        check('sounds: flat plays stamps, dots, washes, menu, unfold, toast, load and coin sounds', !miss.length, miss.length ? 'missing ' + miss.join(', ') : log.join(', '));
      }
      check('no page errors (desk-mode session)', !errors.length, errors.join(' | '));
      await ctx.close();
    }

    if (want('touch')) {
      const { page, ctx, errors } = await open(browser, { viewport: { width: 390, height: 844 }, touch: true });
      await loadSave(page);
      await idle(page);
      const s = await since(page);
      // long press on a row → original contextmenu handler → Details
      const row = page.locator('#items tr[data-item] .item-name').first();
      await row.scrollIntoViewIfNeeded();
      const b = await row.boundingBox();
      const cdp = await ctx.newCDPSession(page);
      const pt = { x: b.x + 10, y: b.y + 5 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
      await page.waitForTimeout(700);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(400);
      const e = await evts(page, s);
      check('touch: long press on a row opens Details (once)', types(e, 'app:details-open').length === 1, `opens ${types(e, 'app:details-open').length}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1300);
      // tap the phone select → parchment menu → pick Fisherman
      const sel = page.locator('#mobileCategory');
      await sel.scrollIntoViewIfNeeded();
      await sel.tap();
      await page.waitForTimeout(450);
      const m = await page.evaluate(() => __vc.flat.menus.read());
      const idx = m?.items?.indexOf('The Fisherman') ?? -1;
      if (idx >= 0) await page.locator('#float .vc-menu-item').nth(idx).tap();
      await page.waitForTimeout(600);
      const title = await page.locator('#title').textContent();
      check('phones: the mobile select opens as a parchment menu on tap and switches view', m?.id === 'mobileCategory' && title === 'The Fisherman', title);
      const r = await page.evaluate(() => ({
        grid: getComputedStyle(document.getElementById('metrics')).gridTemplateColumns.split(' ').length,
        sticky: getComputedStyle(document.querySelector('header.top')).position,
        sidebar: getComputedStyle(document.querySelector('.sidebar')).display,
        overflow: document.documentElement.scrollWidth - innerWidth,
      }));
      await page.evaluate(() => scrollTo(0, 600));
      await page.waitForTimeout(300);
      const lifted = await page.evaluate(() => ({ cls: document.querySelector('header.top').classList.contains('vc-lifted'), sh: getComputedStyle(document.querySelector('header.top')).boxShadow }));
      check('phones: stamps 2 × 2, sidebar hidden, no sideways scroll', r.grid === 2 && r.sidebar === 'none' && r.overflow <= 0, JSON.stringify(r));
      check('phones: sticky header with a soft shadow once scrolled', r.sticky === 'sticky' && lifted.cls && lifted.sh !== 'none', lifted.sh);
      // no hover-only reactions: a tap on a coin never hops
      const s2 = await since(page);
      await page.evaluate(() => scrollTo(0, 0));
      await page.locator('#importProgress').tap().catch(() => {});
      await page.waitForTimeout(300);
      const e2 = await evts(page, s2);
      check('touch: taps press (coin:press), never hop', types(e2, 'coin:hop').length === 0 && types(e2, 'coin:press').length >= 1);
      check('no page errors (phone session)', !errors.length, errors.join(' | '));
      await ctx.close();
    }

    if (want('reduced')) {
      const { page, ctx, errors } = await open(browser, { reduced: true, query: '?seed=7' });
      const mode = await page.evaluate(() => __vc.state().runMode ?? document.body.className);
      await loadSave(page);
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => ({
        kind: __vc.ink.state().kind ?? null,
        shows: [...document.querySelectorAll('#metrics strong[data-show]')].length,
        numbers: [...document.querySelectorAll('#metrics .metric strong')].map(x => x.textContent),
        switchShown: !!document.getElementById('vcForceDesk'),
      }));
      const s = await since(page);
      await page.locator('#items tr[data-item]').first().dblclick();
      await page.waitForTimeout(200);
      const d = await page.evaluate(() => ({ open: document.getElementById('itemDialog').open, fade: document.getElementById('itemDialog').classList.contains('vc-fade-in'), stages: document.querySelectorAll('#float .vc-unfold').length }));
      const e = await evts(page, s);
      check('reduced: auto mode picks flat', /flat/.test(String(mode)), String(mode));
      check('reduced: numbers final at once (no count-up)', r.shows === 0 && r.numbers.every(n => n && n !== '0' || n === '0'), r.numbers.join(' '));
      check('reduced: Details is a 150 ms fade, no unfold, no fold events', d.open && d.fade && d.stages === 0 && types(e, 'details:fold').length === 0);
      check('help switch "Use the 3D desk anyway" shown (device can run desk)', r.switchShown);
      // the switch: saves and reloads into desk
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await page.locator('details.help > summary').click();
      await Promise.all([page.waitForEvent('load'), page.locator('#vcForceDesk').check()]);
      await page.waitForFunction(() => window.__vc && document.body.className, null, { timeout: 20000 });
      const after = await page.evaluate(() => ({ cls: document.body.className, key: localStorage.getItem('valheim-checkup-3d:force-desk'), sw: !!document.getElementById('vcForceDesk') }));
      check('help switch: saved, reloaded into desk, switch still there (ticked) to go back', /mode-desk/.test(after.cls) && after.key === '1' && after.sw, after.cls);
      check('no page errors (reduced session)', !errors.length, errors.join(' | '));
      await ctx.close();
    }

    if (want('widths')) {
      for (const [w, h] of [[1440, 900], [900, 700], [390, 844], [381, 800], [380, 800], [360, 780]]) {
        const { page, ctx } = await open(browser, { viewport: { width: w, height: h }, touch: w < 760 });
        await loadSave(page);
        const r = await page.evaluate(() => {
          const b = document.querySelector('.brand');
          const lh = parseFloat(getComputedStyle(b).lineHeight) || 30;
          return { lines: Math.round(b.getBoundingClientRect().height / lh), overflow: document.documentElement.scrollWidth - innerWidth, text: b.innerText };
        });
        const brandOk = w >= 381 ? r.lines === 1 : r.lines <= 2 && /^Valheim\s+Checkup$/.test(r.text.replace(/\n/, ' '));
        check(`width ${w}: brand ${r.lines} line(s), sideways overflow ${r.overflow}px`, brandOk && (w < 381 || r.overflow <= 0));
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }

  if (want('nowebgl')) {
    const b2 = await chromium.launch({ args: ['--disable-webgl', '--disable-webgl2'] });
    try {
      const { page, ctx, errors } = await open(b2, { query: '?seed=7' });
      await loadSave(page);
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => ({ cls: document.body.className, kind: __vc.ink.state().kind ?? null, running: __vc.ink.state().running }));
      await idle(page);
      check('no WebGL: flat with full animations (ink sequence "full")', /mode-flat/.test(r.cls) && (r.kind === 'full' || r.running), JSON.stringify(r));
      check('no page errors (no-WebGL session)', !errors.length, errors.join(' | '));
      await ctx.close();
    } finally { await b2.close(); }
  }

  const bad = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} passed`);
  process.exit(bad ? 1 : 0);
})();
