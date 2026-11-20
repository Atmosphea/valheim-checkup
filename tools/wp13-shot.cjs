// WP-13: screenshots of flat mode (name masked). Usage: node tools/wp13-shot.cjs <outDir> [width] [height] [extra query] [reduce]
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
const path = require('node:path'), fs = require('node:fs');
const { chromium } = require(path.join(__dirname, '..', 'tests', 'node_modules', '@playwright/test'));
const ROOT = path.join(__dirname, '..');
(async () => {
  const [out = 'docs/reports/wp-13', w = '1440', h = '900', q = '', reduce = ''] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
  const touch = +w < 760;
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', reducedMotion: reduce ? 'reduce' : 'no-preference' });
  page.on('pageerror', e => console.log('pageerror', String(e)));
  await page.goto('file://' + path.join(ROOT, 'dist/valheim-checkup.html') + '?mode=flat&seed=7' + q);
  await page.waitForSelector('#categories [data-category]', { state: 'attached' });
  const dir = path.join(ROOT, 'fixtures/private');
  const save = path.join(dir, fs.readdirSync(dir).find(f => f.endsWith('.fch'))); // never named here: the file name is private
  await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: fs.readFileSync(save) });
  await page.waitForFunction(() => /Progress is up to date/.test(document.querySelector('#toast')?.textContent || ''));
  // the load's wash, stamps and dots finish first (WP-14: the wash starts a frame later, so a fixed wait caught it mid-way)
  await page.waitForFunction(() => window.__vc?.ink && !__vc.ink.state().running && __vc.ink.state().ghosts === 0, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
  // privacy: mask the character name everywhere it shows
  await page.evaluate(() => {
    const strong = document.querySelector('#headerProfile strong');
    const name = strong?.textContent || '';
    if (!name) return;
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) if (n.nodeValue.includes(name)) n.nodeValue = n.nodeValue.split(name).join('{name}');
  });
  const file = path.join(out, `flat-${w}${reduce ? '-reduced' : ''}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('wrote', file);
  await browser.close();
})();
