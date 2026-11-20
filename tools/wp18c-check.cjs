// WP-18C self-check: Bosses and Viking records in Highlights (Paul, WP-18 items 18–19).
//   node tools/wp18c-check.cjs [html] [--shots]
// Real GPU, 1440 × 900, both modes, Paul's save. Prints PASS/FAIL lines; nothing from the save is
// written outside fixtures/private (screenshots go to fixtures/private/wp18c/).
const path = require('node:path');
const fs = require('node:fs');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const PRIVATE = path.join(ROOT, 'fixtures', 'private');
const SAVE = fs.readFileSync(path.join(PRIVATE, fs.readdirSync(PRIVATE).find(f => f.endsWith('.fch'))));
const HTML = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(ROOT, 'dist', 'valheim-checkup.html'));
const SHOTS = process.argv.includes('--shots');
const results = [];
const check = (ok, name, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
  for (const mode of ['flat', 'desk']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'UTC' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    await page.goto(`file://${HTML}?mode=${mode}&seed=7`);
    await page.waitForFunction(() => window.__vc && document.getElementById('insightNav'), null, { timeout: 120000 });
    if (mode === 'desk') await page.waitForFunction(() => __vc.stage?.textures?.ready?.() && __vc.startup().usableMs !== null, null, { timeout: 120000 });
    await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
    await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 30000 });
    await page.evaluate(() => document.querySelector('#insightNav [data-category="Highlights"]').click());
    await page.waitForFunction(() => !!document.querySelector('#insightsView .vc-bosses'), null, { timeout: 20000 }).catch(() => {});
    await page.waitForFunction(() => !__vc.ink?.state().running, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const v = document.getElementById('insightsView');
      const kids = [...v.children].map(e => e.className.split(' ')[0] || e.tagName);
      const tiles = [...v.querySelectorAll('.vc-boss')].map(t => ({ name: t.querySelector('strong')?.textContent, beaten: !t.classList.contains('vc-boss--undefeated'), icon: !!t.querySelector('.vc-icon'), w: t.getBoundingClientRect().width, h: t.getBoundingClientRect().height, ow: t.offsetWidth, oh: t.offsetHeight }));
      const groups = [...v.querySelectorAll('.vc-records .insight-card h2')].map(h => h.textContent);
      const rows = v.querySelectorAll('.vc-records .vc-recs p').length;
      const totals = [...v.querySelectorAll('.vc-boss-totals p span')].map(s => s.textContent);
      const played = v.querySelector('.vc-played-on');
      const quiet = [...v.querySelectorAll('.vc-bosses > .sub')].map(p => p.textContent).join(' ');
      const champions = v.querySelectorAll('.champions .champion').length;
      return { kids, tiles, groups, rows, totals, played: played && !played.hidden ? played.textContent : null, quiet, champions,
        zeros: [...v.querySelectorAll('.vc-records .vc-recs b')].filter(b => b.textContent.trim() === '0').length };
    });
    const tag = `[${mode}]`;
    check(r.kids.indexOf('insight-card') > 0 && r.kids.indexOf('insight-card') < r.kids.indexOf('champions'), `${tag} Bosses sits above the 20 largest counts`, r.kids.join(' > '));
    check(r.kids.indexOf('vc-records') === r.kids.indexOf('insight-card') + 1, `${tag} Viking records directly below the bosses`);
    check(r.tiles.length === 10 && r.tiles.map(t => t.name).join('|') === 'Eikthyr|The Elder|Bonemass|Moder|Yagluth|The Queen|Fader|Brenna|Geirrhafa|Zil & Thungr', `${tag} ten boss tiles, the seven bosses then Hildir's three`);
    check(r.tiles.every(t => t.icon), `${tag} every tile has its trophy icon`);
    check(r.tiles.every(t => Math.abs(t.ow - t.oh) <= 1), `${tag} tiles are square`, `${Math.round(r.tiles[0]?.ow)} × ${Math.round(r.tiles[0]?.oh)} layout px`);
    check(r.tiles.some(t => t.beaten) && r.tiles.some(t => !t.beaten), `${tag} defeated tiles lit, undefeated dim`, `${r.tiles.filter(t => t.beaten).length} defeated, ${r.tiles.filter(t => !t.beaten).length} dim`);
    check(r.totals.length === 4, `${tag} four lifetime boss totals`);
    check(/doesn't record the damage/.test(r.quiet), `${tag} one quiet line: damage per boss isn't recorded`);
    check(!!r.played && /^Played on: /.test(r.played) && !/default/.test(r.played), `${tag} "Played on" world-settings line`, r.played ? `${r.played.split('·').length} settings` : 'missing');
    check(r.groups.join('|') === 'Combat|Travel & world|Building|Harvest & crafting|Deaths & oddities', `${tag} five record groups`, `${r.rows} records`);
    check(r.zeros === 0 && r.rows >= 60, `${tag} only non-zero records shown`, `${r.rows} rows`);
    check(r.champions === 20, `${tag} the 20 largest counts are still all there`);
    // after a reload (no file): the stored summary still gives the Played on line
    await page.reload();
    await page.waitForFunction(() => window.__vc && document.getElementById('insightNav'), null, { timeout: 120000 });
    await page.evaluate(() => document.querySelector('#insightNav [data-category="Highlights"]').click());
    await page.waitForFunction(() => !!document.querySelector('#insightsView .vc-bosses'), null, { timeout: 20000 }).catch(() => {});
    const again = await page.evaluate(() => { const p = document.querySelector('#insightsView .vc-played-on'); return { bosses: document.querySelectorAll('#insightsView .vc-boss').length, played: !!p && !p.hidden }; });
    check(again.bosses === 10 && again.played, `${tag} after a reload, from the stored save`);
    const ls = await page.evaluate(() => Object.keys(localStorage).filter(k => !k.startsWith('valheim-checkup:')));
    check(ls.length === 0, `${tag} nothing added to localStorage (parity P11)`, ls.join(', '));
    page.once('dialog', dlg => dlg.accept());
    await page.locator('#forget').evaluate(b => b.click());
    await page.waitForTimeout(500);
    const left = await page.evaluate(() => ({ ls: Object.keys(localStorage).length, ss: Object.keys(sessionStorage).filter(k => k.includes('played-on')).length }));
    check(left.ls === 0 && left.ss === 0, `${tag} Forget leaves no saved progress and no Played-on summary`, JSON.stringify(left));
    if (SHOTS) {
      await page.waitForFunction(() => !__vc.ink?.state().running, null, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1500);
      fs.mkdirSync(path.join(PRIVATE, 'wp18c'), { recursive: true });
      await page.screenshot({ path: path.join(PRIVATE, 'wp18c', `highlights-${mode}.png`) });
      if (mode === 'flat') { await page.locator('.vc-records').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(PRIVATE, 'wp18c', `records-${mode}.png`) }); }
    }
    check(errors.length === 0, `${tag} no page or console errors`, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
})();
