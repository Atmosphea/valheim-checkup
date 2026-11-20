// screens.spec.js — 20 reference screenshots at 1440 x 900 (WP-00 step 6).
// TARGET=baseline CENSUS_BUILD=1 writes tests/baseline/screens/; other targets write checker-reports/screens/<target>/.
// The character name is masked (privacy; the screens ship with the source tree).
const path = require('node:path');
const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const A = require('../helpers/app');
const { hideToast } = require('../helpers/states');

const OUT = A.TARGET === 'baseline' && process.env.CENSUS_BUILD ? path.join(__dirname, '..', 'baseline', 'screens') : path.join(__dirname, '..', '..', 'checker-reports', 'screens', A.TARGET);
fs.mkdirSync(OUT, { recursive: true });
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const shots = [
  ['01-no-save', async () => { }],
  ...A.VIEWS.map((v, i) => [`${String(i + 2).padStart(2, '0')}-view-${slug(v)}`, async page => { await A.loadSave(page); await hideToast(page); await A.selectView(page, v); if (v === 'The Carpenter') await hideToast(page); }]),
  ['15-lifetime-mode', async page => { await A.loadSave(page); await A.setMode(page, 'raw'); await hideToast(page); }],
  ['16-details-open', async page => { await A.loadSave(page); await hideToast(page); await A.openDetails(page, 'Carrot Soup'); }],
  ['17-help-open', async page => { await A.loadSave(page); await hideToast(page); await page.locator('details.help summary').evaluate(s => s.click()); await page.locator('details.help').scrollIntoViewIfNeeded(); }],
  ['18-toast', async page => { await A.loadSave(page); await hideToast(page); await A.setMode(page, 'raw'); }],
  ['19-error-message', async page => { await A.setFile(page, '#saveFile', 'notes.txt', Buffer.from('x')); await expect(page.locator('#message')).toHaveText('Choose a .fch character file.'); }],
  ['20-file-drag-over-load', async page => { await A.dropFile(page, '#loadTop', 'characters.fch', Buffer.from('x'), { drop: false }); }],
];

for (const [name, run] of shots) {
  test(`screen ${name}`, async ({ page }) => {
    await A.openApp(page);
    await run(page);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, name + '.png'), animations: 'disabled', mask: [page.locator('#headerProfile strong')], maskColor: '#444' });
  });
}
