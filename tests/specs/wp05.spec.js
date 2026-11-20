// wp05.spec.js — WP-05 textures and materials. Runs on TARGET=desk (the review page and the stage are
// desk-only code). On the default SwiftShader renderer these are functional checks; the High-tier timing,
// the 2× look and the screenshots against the reference are in tools/wp05-check.cjs on the real GPU.
// Every page uses ?seed=7 and no save.
const { test, expect } = require('@playwright/test');
const A = require('../helpers/app');
const { targetUrl } = require('../helpers/target');

test.skip(A.TARGET !== 'desk', 'WP-05 materials exist only on desk');
test.describe.configure({ mode: 'serial' });
const GL_ALLOWED = /GPU stall due to ReadPixels|GL_CLOSE_PATH_NV/;

function collect(page) {
  const log = { problems: [], info: [] };
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') log.problems.push(t);
    if (m.type() === 'warning' && !GL_ALLOWED.test(t) && !/textures generated/.test(t)) log.problems.push(t);
    if (/textures generated in \d+ ms/.test(t)) log.info.push(t);
  });
  page.on('pageerror', e => log.problems.push(String(e)));
  return log;
}
const materialsReady = page => expect.poll(() => page.evaluate(() => !!(window.__vc && __vc.materials && __vc.materials.ready && __vc.materials.frames() > 1)), { timeout: 240_000, intervals: [500] }).toBe(true);
const texturesDone = page => expect.poll(() => page.evaluate(() => !!(window.__vc && __vc.stage && __vc.stage.textures.timing.done)), { timeout: 240_000, intervals: [500] }).toBe(true);

test('?materials renders one card per file 05 material, each with four shapes', async ({ page }) => {
  test.setTimeout(300_000);
  const log = collect(page);
  await page.setViewportSize({ width: 1000, height: 640 });
  await page.goto(targetUrl('?materials&seed=7'));
  await materialsReady(page);
  const info = await page.evaluate(() => ({
    cards: __vc.materials.cards,
    labels: [...document.querySelectorAll('.vc-mr-label b')].map(b => b.textContent),
    shapes: __vc.materials.cards.map(id => __vc.materials.three.scene.getObjectByName(`card-${id}`).children.length),
  }));
  expect(info.cards).toEqual(['brushedSteel', 'engraving', 'knurling', 'gauntletSteel', 'gauntletReflections', 'leather', 'rivets', 'gold', 'brass', 'oiledWood', 'paper', 'desk']);
  expect(info.labels).toHaveLength(12);
  expect(info.shapes.every(n => n === 4)).toBe(true);
  // brushed steel: the key light's highlight is stretched along the brushing ≥ 4:1, and that is the anisotropy's doing
  const hi = await page.evaluate(async () => ({ a: await __vc.materials.measureHighlight(), b: await __vc.materials.measureHighlight({ anisotropy: 0 }) }));
  expect(hi.a.ratio).toBeGreaterThanOrEqual(4);
  expect(hi.b.ratio).toBeLessThan(hi.a.ratio);
  expect(log.problems).toEqual([]);
});

test('the same seed gives the same texture bytes; another seed does not', async ({ browser }) => {
  test.setTimeout(600_000);
  const hashes = [];
  for (const seed of [7, 7, 8]) {
    const context = await browser.newContext({ viewport: { width: 800, height: 500 } });
    const page = await context.newPage();
    await page.goto(targetUrl(`?materials&seed=${seed}`));
    await materialsReady(page);
    hashes.push(await page.evaluate(() => __vc.materials.hash()));
    await context.close();
  }
  const names = Object.keys(hashes[0]);
  expect(names.length).toBeGreaterThanOrEqual(18);
  expect(hashes[1]).toEqual(hashes[0]);
  expect(names.filter(n => hashes[2][n] !== hashes[0][n]).length).toBeGreaterThanOrEqual(names.length - 1);
});

test('desk: generation is logged, memory estimate under 300 MB, engraving list and shared tiles', async ({ page }) => {
  test.setTimeout(300_000);
  const log = collect(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(targetUrl('?seed=7'));
  await texturesDone(page);
  await expect.poll(() => log.info.length, { timeout: 30_000 }).toBeGreaterThan(0);
  const r = await page.evaluate(() => ({
    t: __vc.stage.textures.timing, mem: __vc.stage.gpuMemory(), eng: __vc.engraved(), shared: __vc.stage.textures.shared(),
    // WP-06: each bar carries the name its button shows (P13: without "The "), word for word
    cats: [...document.querySelectorAll('#categories [data-category], #insightNav [data-category]')].map(b => [b.dataset.category, (b.querySelector('.label span') || b).firstChild.textContent.trim()]),
    paperVar: getComputedStyle(document.getElementById('desk')).getPropertyValue('--vc-paper').length,
  }));
  expect(r.t.totalMs).toBeGreaterThan(0);
  expect(r.mem.mb).toBeLessThan(300);
  for (const [c, shown] of r.cats) expect(r.eng[`bar:${c}`]).toBe(shown);
  expect(r.eng['coin:load']).toBeTruthy();
  expect(r.eng['plaque:total'] ?? r.eng['plaque:digits']).toBeTruthy(); // WP-06: the plaque's own strings (digits are wheels)
  expect(r.shared.paperNormalBitmap).toBe(true);
  expect(r.paperVar).toBeGreaterThan(1000);
  expect(log.problems).toEqual([]);
});
