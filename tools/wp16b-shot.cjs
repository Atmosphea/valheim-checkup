// Quick masked screenshot helper for WP-16B: node tools/wp16b-shot.cjs out.png [html] [js-to-eval-before]
const path = require('node:path');
const fs = require('node:fs');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const PRIVATE = path.join(ROOT, 'fixtures', 'private');
const SAVE = fs.readFileSync(path.join(PRIVATE, fs.readdirSync(PRIVATE).find(f => f.endsWith('.fch'))));
const OUT = path.resolve(process.argv[2] || 'shot.png');
const HTML = path.resolve(process.argv[3] || path.join(ROOT, 'dist', 'valheim-checkup.html'));
const JS = process.argv[4] || '';
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: +(process.env.VW || 1440), height: +(process.env.VH || 900) }, deviceScaleFactor: +(process.env.DPR || 1) });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error' && !/GPU stall|GL_CLOSE_PATH_NV|ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(`file://${HTML}?mode=${process.env.MODE || 'desk'}&seed=7`);
  await page.waitForFunction(() => window.__vc?.stage?.textures?.ready?.() && __vc.stage.stats().frames > 10, null, { timeout: 60000 }).catch(() => {});
  if (!process.env.NOSAVE) {
    await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
    await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
  }
  await page.mouse.move(+(process.env.PX || 300), +(process.env.PY || 300));
  await page.waitForTimeout(2500);
  if (JS) { const r = await page.evaluate(JS); if (r !== undefined) console.log(JSON.stringify(r)); await page.waitForTimeout(+(process.env.WAIT || 1500)); }
  await page.evaluate(() => {
    const name = document.querySelector('#headerProfile strong')?.textContent || '';
    if (name) { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) if (n.nodeValue.includes(name)) n.nodeValue = n.nodeValue.split(name).join('{name}'); }
    __vc.stage?.markPrintDirty?.(); __vc.stage?.renderNow?.();
  });
  await page.waitForTimeout(300);
  const clip = process.env.CLIP ? (([x, y, width, height]) => ({ x, y, width, height }))(process.env.CLIP.split(',').map(Number)) : undefined;
  await page.screenshot({ path: OUT, clip });
  if (errors.length) console.log('ERRORS', errors);
  await browser.close();
})();
