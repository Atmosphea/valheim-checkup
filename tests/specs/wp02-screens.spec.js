// wp02-screens.spec.js — checker visual review for WP-02 (no save loaded, so no private data on screen).
const path = require('node:path');
const { test } = require('@playwright/test');
const A = require('../helpers/app');
const { ROOT } = require('../helpers/target');
const OUT = path.join(ROOT, 'checker-reports', 'screens', 'wp-02');
test.skip(A.TARGET === 'baseline' || !process.env.WP02_SCREENS, 'run with WP02_SCREENS=1');
test('WP-02 screens', async ({ page }) => {
  await A.openApp(page, { query: 'seed=1' });
  await page.evaluate(() => window.__vc.timeScale(0.25));
  for (const v of ['The Master Hunter', 'Are You Alright?', 'The Carpenter']) {
    await A.selectView(page, v);
    await page.locator('#statusFilter').selectOption('all');
    await page.locator('#items').scrollIntoViewIfNeeded();
    const f = v.replace(/[^A-Za-z]+/g, '-').toLowerCase();
    await page.screenshot({ path: path.join(OUT, `rows-${f}.png`) });
    const box = await page.locator('#items tr[data-item]').first().boundingBox();
    await page.screenshot({ path: path.join(OUT, `rows-${f}-crop200.png`), clip: { x: box.x, y: box.y, width: 360, height: 180 }, scale: 'device' });
  }
  await A.selectView(page, 'The Master Chef');
  await A.openDetails(page, 'Carrot Soup');
  await page.screenshot({ path: path.join(OUT, 'details-carrot-soup.png') });
  await A.closeDetails(page);
  await page.locator('.footer').scrollIntoViewIfNeeded();
  const fb = await page.locator('.footer').boundingBox();
  await page.screenshot({ path: path.join(OUT, 'footer-credit.png'), clip: { x: fb.x, y: fb.y - 10, width: Math.min(1000, fb.width), height: fb.height + 20 } });
});
test('WP-02 200% crop', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await A.openApp(page, { query: 'seed=1' });
  await A.selectView(page, 'The Trophy Collector');
  await page.locator('#statusFilter').selectOption('all');
  const box = await page.locator('#items tr[data-item]').first().boundingBox();
  await page.screenshot({ path: path.join(OUT, 'rows-trophy-crop200.png'), clip: { x: box.x, y: box.y, width: 420, height: 220 } });
  await ctx.close();
});
