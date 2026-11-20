// parity.spec.js — one test per file 03 item, P01 to P44. Target-neutral (TARGET=baseline|flat|desk).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { test, expect } = require('@playwright/test');
const A = require('../helpers/app');
const { NAME } = require('../helpers/private');
const { ROOT } = require('../helpers/target');
const fch = require('../helpers/fch');
const G = require('../golden-values.json');

const LABELS = { 'The Artisan': 'Crafting', 'The Blacksmith': 'Crafting', 'The Carpenter': 'Building', 'The Master Chef': 'Crafting', 'The Gourmet': 'Eating', 'The Trophy Collector': 'Trophies', 'The Hunter': 'Hunting · Any difficulty', 'The Master Hunter': 'Hunting · Hard or higher', 'The Fisherman': 'Fishing', 'Are You Alright?': 'Deaths', "That Can't Be an Accident": 'Deaths' };
const DESCRIPTIONS = { 'The Blacksmith': 'Craft every kind of weapon.', 'Are You Alright?': 'Die in every way possible. Track all 16 required death causes.', "That Can't Be an Accident": 'Get killed by all 10 tree species.', 'The Artisan': 'Craft every kind of item.', 'The Carpenter': 'Build everything.', 'The Gourmet': 'Eat every kind of edible item.', 'The Master Chef': 'Cook every kind of dish.', 'The Trophy Collector': 'Collect all trophies.', 'The Fisherman': 'Catch every kind of fish.', 'The Master Hunter': 'Kill every kind of creature on Hard difficulty or higher.', 'The Hunter': 'Kill every kind of creature on any difficulty.' };
const NOTES = {
  'The Fisherman': ['Counts fish caught, not fish picked up. Bait is shown in Details.'],
  'The Master Hunter': ['Reads the Hard-or-higher credited kill record. A credited kill is not necessarily a final blow.'],
  'The Hunter': ['Reads credited kill events at any difficulty, not a final-blow counter.'],
  'Are You Alright?': ['Reads death-cause counters. Tree species, not tool tiers or chopped trees, determine tree progress.'],
  "That Can't Be an Accident": ['Reads death-cause counters. Tree species, not tool tiers or chopped trees, determine tree progress.'],
  'The Blacksmith': ['145 game-defined weapons. Includes Club, Stone Axe, and Torch omitted by the original Artisan workbook. Overlapping entries share stars and corrections.'],
  'The Master Chef': ['Cooking counters are separate from eating. The game also credits oven/grill output when removed. Compare both records in Details.'],
};
const TOTALS = Object.fromEntries(G.collections.map(c => [c.title, c.total]));
const OVERALL_TIP = 'Overlapping targets count in each collection. This total is a checklist target count, not the number of Steam achievements.';
const LIFETIME_TOAST = 'Lifetime actions may include actions that did not earn achievement credit. Hard-difficulty requirements are not applied in this view.';
const SAFE = NAME.replace(/[^a-z0-9_-]/gi, '_');

async function firstRow(page) { return page.locator('#items tr[data-item]').first(); }
async function rowId(page, name) { return page.locator('#items tr[data-item]').filter({ has: page.locator('.item-name', { hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).getAttribute('data-item'); }
async function addFavoriteViaDetails(page, name) { await A.openDetails(page, name); await page.locator('#favoriteDetail').evaluate(b => b.click()); await A.closeDetails(page); }

test.describe('parity P01–P44', () => {
  test('P01 page title, meta description, brand', async ({ page }) => {
    await A.openApp(page);
    await expect(page).toHaveTitle('Valheim Checkup');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', 'Track Valheim crafting, building, cooking, eating, hunting, trophies, and fishing from your character save. Your file stays in your browser.');
    await expect(page.locator('.brand')).toHaveText('Valheim Checkup');
    await expect(page.locator('.brand')).toBeVisible();
  });

  test('P02 character name and import line only with a save', async ({ page }) => {
    await A.openApp(page);
    await expect(page.locator('#headerProfile')).toBeHidden();
    await expect(page.locator('#headerProfile')).toBeEmpty();
    await A.loadSave(page);
    await expect(page.locator('#headerProfile')).toBeVisible();
    await expect(page.locator('#headerProfile strong')).toHaveText(NAME);
    const stamp = await page.evaluate(() => new Date().toLocaleString());
    await expect(page.locator('#headerProfile span')).toHaveText('Read locally · Imported ' + stamp);
  });

  test('P03 lifetime records: five stats, floored, locale-formatted', async ({ page }) => {
    await A.openApp(page);
    await expect(page.locator('#statline')).toBeEmpty();
    await A.loadSave(page);
    await expect(page.locator('#statline')).toContainText('Lifetime records');
    const parts = await page.locator('#statline > span:not(.eyebrow)').allInnerTexts();
    expect(parts.map(s => s.replace(/\s+/g, ' ').trim())).toEqual(Object.entries(G.lifetime).map(([k, v]) => `${k} ${v}`));
    // Check the stat indices 13, 49, 2, 6, 0 and flooring against the stored save.
    const s = await A.activeSave(page);
    const raw = s.save.buckets[0].stats;
    expect([13, 49, 2, 6, 0].map(i => Math.floor(raw[i]).toLocaleString('en-US'))).toEqual(Object.values(G.lifetime));
  });

  test('P04 favourite counts: open with search and All items, × removes', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    await A.setMode(page, 'achievement');
    await page.locator('#statusFilter').selectOption('all');
    const name = (await A.rowNames(page))[0];
    await addFavoriteViaDetails(page, name);
    const fav = page.locator('#favorites .favorite');
    await expect(fav).toHaveCount(1);
    await expect(page.locator('#favorites')).toHaveAttribute('aria-label', 'Favorite statistics');
    const open = page.locator('[data-favorite-open="0"]');
    await expect(open).toHaveAttribute('title', 'Open this collection');
    await expect(open).toContainText(name);
    await expect(open.locator('small')).toHaveText('Cooked · lifetime');
    await expect(open.locator('b')).toHaveText(/^[\d,]+$/);
    await A.selectView(page, 'The Gourmet');
    await open.evaluate(b => b.click());
    await A.expectView(page, 'The Master Chef');
    await expect(page.locator('#search')).toHaveValue(name);
    await expect(page.locator('#statusFilter')).toHaveValue('all');
    expect(await A.rowNames(page)).toContain(name);
    const remove = page.getByRole('button', { name: `Remove ${name} from header`, exact: true });
    await expect(remove).toHaveText('×');
    await remove.evaluate(b => b.click());
    await expect(fav).toHaveCount(0);
    expect((await A.activeSave(page)).favorites).toEqual([]);
  });

  test('P05 drag a row onto the header: highlight, added, duplicate, full', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    await page.locator('#statusFilter').selectOption('all');
    const ids = await page.locator('#items tr[data-item]').evaluateAll(rows => rows.slice(0, 7).map(r => r.dataset.item));
    const r = await A.dragRowToHeader(page, ids[0]);
    expect(r.highlighted, 'header highlights while dragging').toBe(true);
    expect(r.after, 'highlight cleared on drop').toBe(false);
    await expect(page.locator('#toast')).toHaveText('Count added to header.');
    await A.dragRowToHeader(page, ids[0]);
    await expect(page.locator('#toast')).toHaveText('Already in your header.');
    for (const id of ids.slice(1, 6)) await A.dragRowToHeader(page, id);
    await expect(page.locator('#favorites .favorite')).toHaveCount(6);
    await A.dragRowToHeader(page, ids[6]);
    await expect(page.locator('#toast')).toHaveText('Keep up to six favorite counts. Remove one to add another.');
    await expect(page.locator('#favorites .favorite')).toHaveCount(6);
  });

  test('P06 import progress JSON: size limit, validation, restore', async ({ page }) => {
    await A.openApp(page);
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#importProgress').evaluate(b => b.click());
    await chooser;
    await expect(page.locator('#importProgress')).toHaveAttribute('aria-label', 'Import progress');
    await expect(page.locator('#importProgress')).toHaveAttribute('title', 'Import progress JSON');
    await A.setFile(page, '#progressFile', 'big.json', Buffer.alloc(10 * 1024 * 1024 + 1, 32), 'application/json');
    await expect(page.locator('#message')).toHaveText('Progress file is too large.');
    await expect(page.locator('#message')).toHaveClass(/error/);
    await A.setFile(page, '#progressFile', 'other.json', Buffer.from('{"format":"something-else"}'), 'application/json');
    await expect(page.locator('#message')).toHaveText('Choose a progress export created by Valheim Checkup.');
    // A real v1 export (made from the synthetic fixture) restores.
    await A.loadSave(page, fch.fixture());
    const exported = JSON.stringify(await A.activeSave(page), null, 2);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await A.setFile(page, '#progressFile', 'fixture-valheim-progress.json', Buffer.from(exported), 'application/json');
    await expect(page.locator('#message')).toHaveText('Restored an exported snapshot. Load a current .fch to refresh automatic progress.');
    await expect(page.locator('#toast')).toHaveText('Progress restored.');
    await expect(page.locator('#headerProfile strong')).toHaveText('Fixture');
  });

  test('P07 export progress JSON: disabled without save, filename, exact format', async ({ page }) => {
    await A.openApp(page);
    await expect(page.locator('#exportProgress')).toBeDisabled();
    await expect(page.locator('#exportProgress')).toHaveAttribute('aria-label', 'Export progress');
    await expect(page.locator('#exportProgress')).toHaveAttribute('title', 'Export progress JSON');
    await A.loadSave(page);
    await expect(page.locator('#exportProgress')).toBeEnabled();
    const dl = page.waitForEvent('download');
    await page.locator('#exportProgress').evaluate(b => b.click());
    const d = await dl;
    expect(d.suggestedFilename()).toBe(`${SAFE}-valheim-progress.json`);
    const text = fs.readFileSync(await d.path(), 'utf8');
    const stored = await A.activeSave(page);
    expect(text).toBe(JSON.stringify(stored, null, 2));
    expect(Object.keys(JSON.parse(text))).toEqual(['format', 'version', 'save', 'overrides', 'pins', 'notes', 'favorites']);
  });

  test('P08 load button text, aria-label, drag-over state', async ({ page }) => {
    await A.openApp(page);
    const load = page.locator('#loadTop');
    await expect(load).toHaveAttribute('aria-label', 'Load character');
    await expect(load).toHaveAttribute('title', 'Choose a .fch file or drop one here');
    await expect(load).toContainText('Load character');
    await expect(load.locator('small')).toHaveText('click or drop .fch');
    const r = await A.dropFile(page, '#loadTop', 'x.fch', Buffer.from('x'), { drop: false });
    expect(r.dragClass, 'drag-over state').toBe(true);
    await page.locator('#loadTop').dispatchEvent('dragleave');
    await expect(load).not.toHaveClass(/(^|\s)drag(\s|$)/);
    await A.loadSave(page);
    await expect(load).toHaveAttribute('aria-label', 'Load another character save');
    await expect(load).toContainText('Load another save');
    await expect(load.locator('small')).toHaveText('click or drop .fch');
  });

  test('P09 load flow: rejects non-.fch, busy state, errors keep previous progress', async ({ page }) => {
    await A.openApp(page, { init: A.slowReads, initArg: 600 });
    await A.setFile(page, '#saveFile', 'notes.txt', Buffer.from('hello'));
    await expect(page.locator('#message')).toHaveText('Choose a .fch character file.');
    await expect(page.locator('#message')).toHaveClass(/error/);
    await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: fs.readFileSync(require('../helpers/private').SAVE) });
    await expect(page.locator('#message')).toHaveText('Reading character save…');
    await expect(page.locator('#loadTop')).toBeDisabled();
    await expect(page.locator('#loadMain')).toBeDisabled();
    await expect(page.locator('#toast')).toHaveText(`Loaded ${NAME}. Progress is up to date.`);
    await expect(page.locator('#loadTop')).toBeEnabled();
    await expect(page.locator('#message')).toHaveText('');
    await A.setFile(page, '#saveFile', 'characters_bad.fch', fch.damaged());
    await expect(page.locator('#message')).toHaveText('Checksum failed. This file may be incomplete or damaged.');
    await expect(page.locator('#message')).toHaveClass(/error/);
    await expect(page.locator('#headerProfile strong')).toHaveText(NAME);
    await expect(page.locator('#overallCount')).toHaveText(G.overall.done);
    await A.setFile(page, '#saveFile', 'characters_new.fch', fch.profile48());
    await expect(page.locator('#message')).toHaveText('This tool supports profile 46–47 with 205 stats and 10 record buckets. This save uses profile 48.');
    await expect(page.locator('#headerProfile strong')).toHaveText(NAME);
  });

  test('P10 re-load animates counts from the old snapshot (650 ms delay, 1,800 ms), reduced motion is instant', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    // Build an older snapshot of the same character with no action records, import it, then re-load the .fch.
    const old = await A.activeSave(page);
    for (const b of old.save.buckets) { for (const k of ['pickup', 'craft', 'fish', 'eat', 'build']) b[k] = {}; b.enemy = b.enemy.map(() => ({})); b.stats = b.stats.map(() => 0); }
    await A.setFile(page, '#progressFile', 'old.json', Buffer.from(JSON.stringify(old)), 'application/json');
    await expect(page.locator('#overallCount')).toHaveText('0');
    await page.evaluate(() => {
      window.__plaque = [];
      new MutationObserver(() => { const el = document.getElementById('overallCount'); if (el) window.__plaque.push([performance.now(), el.textContent]); }).observe(document.getElementById('overall'), { subtree: true, childList: true, characterData: true });
      document.getElementById('saveFile').addEventListener('change', () => { window.__plaqueStart = performance.now(); }, { capture: true });
    });
    await A.loadSave(page);
    await expect(page.locator('#overallCount')).toHaveText(G.overall.done, { timeout: 5000 });
    const { start, log } = await page.evaluate(() => ({ start: window.__plaqueStart, log: window.__plaque }));
    // Find first intermediate value and the time the final value was reached.
    const values = log.map(([t, v]) => [t - start, v]);
    const firstNonZero = values.find(([, v]) => v !== '0');
    const final = values.find(([, v]) => v === '430');
    expect(firstNonZero[0], 'count starts after the 650 ms delay').toBeGreaterThan(600);
    expect(final[0], 'count ends about 650 + 1,800 ms after load').toBeGreaterThan(2000);
    expect(final[0]).toBeLessThan(2900);
    expect(values.some(([, v]) => v !== '0' && v !== '430'), 'intermediate values shown').toBe(true);
  });

  test('P10b reduced motion: no count animation on re-load', async ({ page }) => {
    await A.openApp(page, { reducedMotion: 'reduce' });
    await A.loadSave(page);
    const old = await A.activeSave(page);
    for (const b of old.save.buckets) { for (const k of ['pickup', 'craft', 'fish', 'eat', 'build']) b[k] = {}; b.enemy = b.enemy.map(() => ({})); }
    await A.setFile(page, '#progressFile', 'old.json', Buffer.from(JSON.stringify(old)), 'application/json');
    await expect(page.locator('#overallCount')).not.toHaveText(G.overall.done);
    await A.loadSave(page);
    await expect(page.locator('#overallCount')).toHaveText(G.overall.done, { timeout: 300 });
  });

  test('P11 localStorage keys, restore on start, both storage-failure messages', async ({ page, context }) => {
    await A.openApp(page);
    await A.loadSave(page);
    const ls = await A.localStorageDump(page);
    const s = await A.activeSave(page);
    expect(Object.keys(ls).sort()).toEqual(['valheim-checkup:active', 'valheim-checkup:v1:' + s.save.id].sort());
    expect(ls['valheim-checkup:active']).toBe(s.save.id);
    await page.reload();
    await expect(page.locator('#headerProfile strong')).toHaveText(NAME);
    await expect(page.locator('#overallCount')).toHaveText(G.overall.done);

    const p2 = await context.newPage();
    await A.openApp(p2, { init: A.failingStorage });
    await p2.evaluate(() => localStorage.clear());
    await p2.reload();
    await A.loadSave(p2);
    await expect(p2.locator('#message')).toHaveText('Browser storage is unavailable. Export progress before closing.');
    await p2.locator('#statusFilter').selectOption('all');
    await (await firstRow(p2)).locator('[data-pin]').evaluate(b => b.click());
    await expect(p2.locator('#message')).toHaveText('Browser storage is unavailable or full. Export progress to keep your corrections.');
  });

  test('P12 collection targets: tooltip, done / 1,461 or —', async ({ page }) => {
    await A.openApp(page);
    const label = page.locator('#overall').getByText('Collection targets ⓘ');
    await expect(label).toHaveAttribute('title', OVERALL_TIP);
    await expect(label).toHaveAttribute('tabindex', '0');
    await expect(page.locator('#overallCount')).toHaveText('—');
    await expect(page.locator('#overall')).toContainText('/ 1,461');
    await A.loadSave(page);
    await expect(page.locator('#overallCount')).toHaveText('430');
  });

  test('P13 eleven collection buttons: order, names, counts, bar, active, aria-current', async ({ page }) => {
    await A.openApp(page);
    await expect(page.locator('#categories')).toHaveAttribute('aria-label', 'Achievement collections');
    await expect(page.locator('.sidebar').getByText('Achievement collections', { exact: true })).toBeAttached();
    const buttons = page.locator('#categories [data-category]');
    await expect(buttons).toHaveCount(11);
    expect(await buttons.evaluateAll(b => b.map(x => x.dataset.category))).toEqual(A.COLLECTIONS);
    for (const title of A.COLLECTIONS) {
      const b = page.locator(`#categories [data-category="${title.replace(/"/g, '\\"')}"]`);
      await expect(b.locator('.label span')).toHaveText(title.replace('The ', ''));
      await expect(b.locator('[data-count]')).toHaveText(`${TOTALS[title]} items`);
      await expect(b).toHaveAttribute('aria-current', title === 'The Master Chef' ? 'page' : 'false');
    }
    await A.loadSave(page);
    for (const c of G.collections) {
      const b = page.locator(`#categories [data-category="${c.title.replace(/"/g, '\\"')}"]`);
      await expect(b.locator('[data-count]')).toHaveText(`${c.completed} / ${c.total}`);
      const w = await b.locator('[data-bar]').evaluate(i => parseFloat(i.style.width));
      expect(Math.abs(w - (+c.completed / c.total * 100))).toBeLessThan(0.01);
    }
    await A.selectView(page, 'The Carpenter');
    await expect(page.locator('#categories [data-category="The Carpenter"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#categories [data-category="The Carpenter"]')).toHaveClass(/active/);
    await expect(page.locator('#categories [aria-current="page"]')).toHaveCount(1);
  });

  test('P14 Your Viking: Highlights ↗ and Skills & travel ↗', async ({ page }) => {
    await A.openApp(page);
    await expect(page.locator('.sidebar').getByText('Your Viking', { exact: true })).toBeAttached();
    await expect(page.locator('#insightNav')).toHaveAttribute('aria-label', 'Character insights');
    for (const t of A.INSIGHTS) {
      const b = page.locator(`#insightNav [data-category="${t}"]`);
      await expect(b).toHaveText(`${t} ↗`);
      await expect(b.locator('span[aria-hidden="true"]')).toHaveText('↗');
      await A.selectView(page, t);
      await expect(b).toHaveAttribute('aria-current', 'page');
    }
  });

  test('P15 side note', async ({ page }) => {
    await A.openApp(page);
    await expect(page.locator('.side-note')).toHaveText('Save files stay on this device. Load a fresh save after playing to update your progress.');
  });

  test('P16 mobile collection select lists all 13 views', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await A.openApp(page);
    const sel = page.locator('#mobileCategory');
    await expect(sel).toHaveAttribute('aria-label', 'Collection');
    await expect(sel).toBeVisible();
    expect(await sel.locator('option').allTextContents()).toEqual(A.VIEWS);
    await expect(sel).toHaveValue('The Master Chef');
    await sel.selectOption('The Fisherman');
    await A.expectView(page, 'The Fisherman');
    await sel.selectOption('Highlights');
    await A.expectView(page, 'Highlights');
  });

  test('P17 default view is The Master Chef', async ({ page }) => {
    await A.openApp(page);
    await A.expectView(page, 'The Master Chef');
    await expect(page.locator('#categories [data-category="The Master Chef"]')).toHaveAttribute('aria-current', 'page');
  });

  test('P18 switching view resets filters, scrolls to top, stops animation, Unverified toast', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    await page.locator('#biomeFilter').selectOption({ index: 1 });
    await page.locator('#discoveryFilter').selectOption('known');
    await page.locator('#search').fill('soup');
    await page.evaluate(() => window.scrollTo(0, 600));
    await A.selectView(page, 'The Artisan');
    await expect(page.locator('#biomeFilter')).toHaveValue('all');
    await expect(page.locator('#discoveryFilter')).toHaveValue('all');
    await expect(page.locator('#search')).toHaveValue('');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.evaluate(() => document.getElementById('toast').classList.add('hidden'));
    await A.selectView(page, 'The Carpenter');
    await expect(page.locator('#toast')).toHaveText(A.UNVERIFIED);
    await expect(page.locator('#toast')).toBeVisible();
    // Stops count animation: start a re-load animation, switch during the 650 ms delay, final values show at once.
    const old = await A.activeSave(page);
    for (const b of old.save.buckets) { for (const k of ['pickup', 'craft', 'fish', 'eat', 'build']) b[k] = {}; b.enemy = b.enemy.map(() => ({})); }
    await A.setFile(page, '#progressFile', 'old.json', Buffer.from(JSON.stringify(old)), 'application/json');
    await A.loadSave(page);
    await A.selectView(page, 'The Gourmet');
    await expect(page.locator('#overallCount')).toHaveText(G.overall.done, { timeout: 300 });
    await page.waitForTimeout(900);
    await expect(page.locator('#overallCount')).toHaveText(G.overall.done);
  });

  test('P19 no-save hero', async ({ page }) => {
    await A.openApp(page);
    const hero = page.locator('#dropzone');
    // Paul, WP-16 item 21: "Remove the redundant 'Bring your Viking's progress with you' / 'Choose .fch
    // file' block … Keep the Load coin, page-wide drop, and file input working." On the reskinned
    // targets the block stays in the page (its text and button below are unchanged) but is not shown.
    if (A.TARGET === 'baseline') await expect(hero).toBeVisible(); else await expect(hero).toBeHidden();
    await expect(hero.locator('h1')).toHaveText('Bring your Viking’s progress with you');
    await expect(hero.locator('p')).toHaveText('Select a .fch character save, or drop it here. Reveal every checklist name and see what’s left to do.');
    await expect(page.locator('#loadMain')).toHaveText('Choose .fch file');
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#loadMain').evaluate(b => b.click());
    await chooser;
    await A.loadSave(page);
    await expect(hero).toBeHidden();
  });

  test('P20 status and error message line', async ({ page }) => {
    await A.openApp(page);
    const m = page.locator('#message');
    await expect(m).toHaveAttribute('role', 'status');
    await expect(m).toHaveAttribute('aria-live', 'polite');
    await A.setFile(page, '#saveFile', 'x.txt', Buffer.from('x'));
    await expect(m).toHaveClass(/notice/);
    await expect(m).toHaveClass(/error/);
    await A.setFile(page, '#progressFile', 'old.json', Buffer.from(JSON.stringify((await (async () => { await A.loadSave(page, fch.fixture()); return A.activeSave(page); })()))), 'application/json');
    await expect(m).toHaveText('Restored an exported snapshot. Load a current .fch to refresh automatic progress.');
    await expect(m).not.toHaveClass(/error/);
  });

  test('P21 eyebrow labels (8 variants), titles, descriptions (11 variants)', async ({ page }) => {
    await A.openApp(page);
    expect(new Set(Object.values(LABELS)).size).toBe(8);
    for (const title of A.COLLECTIONS) {
      await A.selectView(page, title);
      await expect(page.locator('#collectionLabel')).toHaveText(LABELS[title]);
      await expect(page.locator('#description')).toHaveText(DESCRIPTIONS[title]);
    }
  });

  test('P22 six collection notes', async ({ page }) => {
    await A.openApp(page);
    for (const title of A.COLLECTIONS) {
      await A.selectView(page, title);
      expect(await page.locator('#collectionNotice p').allTextContents(), title).toEqual(NOTES[title] || []);
    }
  });

  test('P23 record mode switch and lifetime toast', async ({ page }) => {
    await A.openApp(page);
    const sel = page.locator('#recordMode');
    expect(await sel.locator('option').allTextContents()).toEqual(['Achievement credit', 'Lifetime actions']);
    await expect(sel).toHaveValue('achievement');
    await expect(page.locator('.visually-hidden', { hasText: 'Progress records' })).toBeAttached();
    await expect(page.getByRole('combobox', { name: 'Progress records' })).toHaveCount(1);
    await A.setMode(page, 'raw');
    await expect(page.locator('#toast')).toHaveText(LIFETIME_TOAST);
    await page.evaluate(() => document.getElementById('toast').classList.add('hidden'));
    await A.setMode(page, 'achievement');
    await expect(page.locator('#toast')).toBeHidden();
  });

  test('P24 four stamps with labels, Unverified tooltip, — rules', async ({ page }) => {
    await A.openApp(page);
    expect(await A.readMetrics(page)).toEqual({ Completed: '—', Missing: '—', Unverified: '—', Undiscovered: '—' });
    const unv = page.locator('#metrics [title]');
    await expect(unv).toHaveCount(1);
    await expect(unv).toHaveAttribute('title', A.UNVERIFIED);
    await expect(unv).toHaveAttribute('tabindex', '0');
    await expect(unv).toContainText('Unverified ⓘ');
    await A.loadSave(page);
    expect((await A.stableMetrics(page)).Undiscovered).toBe('47');
    await A.selectView(page, 'The Hunter');
    expect((await A.stableMetrics(page)).Undiscovered).toBe('—');
  });

  test('P25 progress bar: role, aria values, hover text', async ({ page }) => {
    await A.openApp(page);
    const t = page.locator('#mainTrack');
    await expect(t).toHaveAttribute('role', 'progressbar');
    await expect(t).toHaveAttribute('aria-label', 'Collection completion');
    await expect(t).toHaveAttribute('tabindex', '0');
    await expect(t).toHaveAttribute('aria-valuemin', '0');
    await expect(t).toHaveAttribute('aria-valuemax', '100');
    await expect(t).toHaveAttribute('aria-valuenow', '0');
    await expect(t).toHaveAttribute('aria-valuetext', 'No save loaded');
    await expect(t.locator('.progress-hover')).toHaveText('Load a character');
    await A.loadSave(page);
    await expect(t).toHaveAttribute('aria-valuenow', '20');
    await expect(t).toHaveAttribute('aria-valuetext', '20% complete');
    await expect(t.locator('.progress-hover')).toHaveText('20%');
    await t.focus();
    await expect.poll(() => t.locator('.progress-hover').evaluate(e => +getComputedStyle(e).opacity)).toBeGreaterThan(0.9);
  });

  test('P26 filters: status, discovery, biome, sort, starred, search', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    const status = page.locator('#statusFilter');
    await expect(status).toHaveAttribute('aria-label', 'Completion filter');
    // Paul, WP-17 item 23: the reskinned targets add a first, default option "All items, missing
    // first"; the original five follow word for word, and "Remaining" stays available.
    const original = ['Remaining (missing + unverified)', 'All items', 'Missing only', 'Completed only', 'Unverified only'];
    expect(await status.locator('option').allTextContents()).toEqual(A.TARGET === 'baseline' ? original : ['All items, missing first', ...original]);
    await expect(status).toHaveValue(A.TARGET === 'baseline' ? 'remaining' : 'first');
    await expect(page.locator('#discoveryFilter')).toHaveAttribute('aria-label', 'Discovery filter');
    expect(await page.locator('#discoveryFilter option').allTextContents()).toEqual(['Any discovery', 'Discovered', 'Undiscovered']);
    await expect(page.locator('#discoveryFilter')).toBeEnabled();
    await expect(page.locator('#biomeFilter')).toHaveAttribute('aria-label', 'Biome filter');
    await expect(page.locator('#sort')).toHaveAttribute('aria-label', 'Sort items');
    expect(await page.locator('#sort option').allTextContents()).toEqual(['Alphabetical', 'Workbook order', 'Biome order']);
    // Biome list = items' biomes sorted + All biomes + Unknown biome.
    const biomes = await page.locator('#biomeFilter option').allTextContents();
    expect(biomes[0]).toBe('All biomes');
    expect(biomes.at(-1)).toBe('Unknown biome');
    expect(biomes.slice(1, -1)).toEqual([...biomes.slice(1, -1)].sort());
    // Kept when still valid (re-render through record mode).
    await page.locator('#biomeFilter').selectOption(biomes[1]);
    await A.setMode(page, 'raw');
    await expect(page.locator('#biomeFilter')).toHaveValue(biomes[1]);
    await A.setMode(page, 'achievement');
    await page.locator('#biomeFilter').selectOption('all');
    // Status filters.
    await status.selectOption('all'); await expect(page.locator('#listCount')).toHaveText('82 of 82 items shown');
    await status.selectOption('done'); await expect(page.locator('#listCount')).toHaveText('16 of 82 items shown');
    await status.selectOption('missing'); await expect(page.locator('#listCount')).toHaveText('66 of 82 items shown');
    await status.selectOption('unknown'); await expect(page.locator('#listCount')).toHaveText('0 of 82 items shown');
    await status.selectOption('all');
    await page.locator('#discoveryFilter').selectOption('undiscovered'); await expect(page.locator('#listCount')).toHaveText('47 of 82 items shown');
    await page.locator('#discoveryFilter').selectOption('all');
    // Biome sort uses the fixed order.
    await page.locator('#sort').selectOption('biome');
    const order = ['Meadows', 'Black Forest', 'Swamp', 'Mountain', 'Plains', 'Mistlands', 'Ashlands', 'Deep North', 'Ocean'];
    const cells = (await page.locator('#items tr[data-item] td.biome-cell').allTextContents()).map(b => order.indexOf(b));
    expect(cells).toEqual([...cells].sort((a, b) => a - b));
    await page.locator('#sort').selectOption('source');
    await page.locator('#sort').selectOption('name');
    // Starred.
    await expect(page.getByRole('checkbox', { name: 'Starred' })).toHaveCount(1);
    const first = (await A.rowNames(page))[0];
    await (await firstRow(page)).locator('[data-pin]').evaluate(b => b.click());
    await page.locator('#pinnedOnly').evaluate(c => { if (!c.checked) c.click(); });
    expect(await A.rowNames(page)).toEqual([first]);
    await page.locator('#pinnedOnly').evaluate(c => { if (c.checked) c.click(); });
    // Search over name, biome, bait, tokens, note.
    const search = page.locator('#search');
    await expect(search).toHaveAttribute('placeholder', 'Search items…');
    await expect(search).toHaveAttribute('aria-label', 'Search items');
    await search.fill('carrot soup'); expect(await A.rowNames(page)).toEqual(['Carrot Soup']);
    await search.fill('$item_carrotsoup'); expect(await A.rowNames(page)).toEqual(['Carrot Soup']);
    await search.fill('mistlands'); expect((await A.rowNames(page)).length).toBeGreaterThan(0);
    await search.fill('');
    await A.openDetails(page, 'Carrot Soup');
    await page.locator('#itemNote').fill('zebra-quill-marker');
    await page.locator('#saveNote').evaluate(b => b.click());
    await A.closeDetails(page);
    await search.fill('zebra-quill'); expect(await A.rowNames(page)).toEqual(['Carrot Soup']);
    await A.selectView(page, 'The Fisherman');
    await expect(page.locator('#discoveryFilter')).toBeDisabled();
    const bait = await page.evaluate(() => JSON.parse(document.getElementById('catalogData').textContent).catalog.find(c => c.type === 'fish').items[0]);
    await search.fill(bait.bait.toLowerCase()); expect(await A.rowNames(page)).toContain(bait.name);
  });

  test('P27 list count and Export this list CSV', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    // Paul, WP-17 item 23: the reskinned default lists every item; the original "Remaining" list
    // (and its export) is checked unchanged by choosing it.
    if (A.TARGET !== 'baseline') {
      await expect(page.locator('#listCount')).toHaveText('82 of 82 items shown');
      await page.locator('#statusFilter').selectOption('remaining');
    }
    await expect(page.locator('#listCount')).toHaveText(G.masterChefTable.listCount);
    await expect(page.locator('#exportList')).toHaveText('Export this list');
    const dl = page.waitForEvent('download');
    await page.locator('#exportList').evaluate(b => b.click());
    const d = await dl;
    expect(d.suggestedFilename()).toBe(`${SAFE}-The-Master-Chef.csv`);
    const buf = fs.readFileSync(await d.path());
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = buf.toString('utf8').slice(1).split('\r\n');
    expect(lines[0]).toBe('"Collection","Item","Status","Discovery","Recorded count","Biome","Bait","Manual correction","Starred","Private note"');
    expect(lines.length).toBe(1 + 66);
    expect(lines[1].startsWith('"The Master Chef","Baked Poteitr",')).toBe(true);
  });

  test('P28 table rows: star, name, count, correction, note, status, discovery, biome, Details, empty state', async ({ page }) => {
    await A.openApp(page);
    await expect(page.locator('thead th').first()).toHaveAttribute('aria-label', 'Star item');
    expect(await page.locator('thead th').allTextContents()).toEqual(['', 'Item', 'Status', 'Discovery', 'Biome', 'Details']);
    await expect(page.locator('#items tr[data-item]').first().locator('.status')).toHaveText('Load a save');
    await A.loadSave(page);
    await page.locator('#statusFilter').selectOption('all');
    const done = page.locator('#items tr.row-done').first();
    const doneName = await done.locator('.item-name').textContent();
    await expect(done.locator('.sub').first()).toHaveText(/^Cooked: [\d,]+$/);
    await expect(done.locator('.status')).toHaveText('Completed');
    await expect(done).toHaveAttribute('title', 'Open Details to compare records or add a note. Double-click or right-click also opens Details.');
    await expect(page.locator('#items tr.row-missing').first().locator('.status')).toHaveText('Missing');
    const star = done.locator('[data-pin]');
    await expect(star).toHaveText('☆'); await expect(star).toHaveAttribute('aria-pressed', 'false'); await expect(star).toHaveAttribute('aria-label', `Star ${doneName}`);
    await star.evaluate(b => b.click());
    const star2 = page.getByRole('button', { name: `Unstar ${doneName}`, exact: true });
    await expect(star2).toHaveText('★'); await expect(star2).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: `Details for ${doneName}`, exact: true })).toHaveText('Details');
    const discovery = await page.locator('#items tr[data-item] td.discovery-cell').allTextContents();
    expect(new Set(discovery)).toEqual(new Set(['Discovered', 'Undiscovered']));
    await expect(page.locator('#items tr[data-item] td.biome-cell').first()).toHaveAttribute('title', 'Community catalog biome; recipes may use materials from multiple biomes.');
    // Manual correction and note marker.
    await A.openDetails(page, doneName);
    await page.getByRole('button', { name: 'Mark missing', exact: true }).evaluate(b => b.click());
    await page.locator('#itemNote').fill('n');
    await page.locator('#saveNote').evaluate(b => b.click());
    await A.closeDetails(page);
    const row = page.locator(`#items tr[data-item="${await rowId(page, doneName)}"]`);
    await expect(row).toHaveClass(/row-missing/);
    await expect(row.locator('.sub', { hasText: 'Manual correction' })).toHaveCount(1);
    await expect(row.locator('.note-indicator')).toHaveText('✎ Note');
    await expect(row.locator('.note-indicator')).toHaveAttribute('title', 'Has a private note');
    // Unverified status and tooltip (Carpenter) and the Unknown-biome tooltip.
    await A.selectView(page, 'The Carpenter');
    await page.locator('#statusFilter').selectOption('unknown');
    const u = page.locator('#items tr.row-unknown').first().locator('.status');
    await expect(u).toHaveText('Unverified ⓘ'); await expect(u).toHaveAttribute('title', A.UNVERIFIED); await expect(u).toHaveAttribute('tabindex', '0');
    await expect(page.locator('#items tr[data-item] td.biome-cell').first()).toHaveText('Unknown');
    await expect(page.locator('#items tr[data-item] td.biome-cell').first()).toHaveAttribute('title', 'Not verified in the catalog. Use the wiki link in Details.');
    await page.locator('#search').fill('zzzz-no-such-item');
    await expect(page.locator('#items td.empty')).toHaveText('No items match. Try All items or clear your filters.');
  });

  test('P29 double-click and right-click open Details; draggable with a save; star persists', async ({ page }) => {
    await A.openApp(page);
    await expect(page.locator('#items tr[data-item]').first()).toHaveAttribute('draggable', 'false');
    await A.loadSave(page);
    const row = await firstRow(page);
    await expect(row).toHaveAttribute('draggable', 'true');
    const name = await row.locator('.item-name').textContent();
    await row.locator('.item-name').dispatchEvent('dblclick');
    await expect(page.locator('#detailTitle')).toHaveText(name);
    await A.closeDetails(page);
    await row.locator('.item-name').dispatchEvent('contextmenu');
    await expect(page.locator('#itemDialog')).toHaveAttribute('open', '');
    await A.closeDetails(page);
    await row.locator('[data-pin]').evaluate(b => b.click());
    await page.reload();
    await expect(page.getByRole('button', { name: `Unstar ${name}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('P30 Details: content, corrections, favourite, note, disabled states, close, Escape', async ({ page }) => {
    await A.openApp(page);
    // Without a save.
    await A.openDetails(page, 'Carrot Soup');
    for (const n of ['Use save record', 'Mark completed', 'Mark missing']) await expect(page.getByRole('button', { name: n, exact: true })).toBeDisabled();
    await expect(page.locator('#favoriteDetail')).toBeDisabled();
    await expect(page.locator('#itemNote')).toBeDisabled();
    await expect(page.locator('#saveNote')).toBeDisabled();
    await expect(page.locator('#detailBody .record-comparison')).toHaveCount(0);
    await A.closeDetails(page);
    await A.loadSave(page);
    await A.openDetails(page, 'Carrot Soup');
    const body = page.locator('#detailBody');
    await expect(page.locator('#closeDetails')).toHaveAttribute('aria-label', 'Close details');
    await expect(page.locator('#itemDialog')).toHaveAttribute('aria-labelledby', 'detailTitle');
    // Paul, WP-17 item 25: on the reskinned targets this line is rewritten in plain words and sits in
    // the small footer; the original keeps it as the body's first paragraph.
    if (A.TARGET === 'baseline') await expect(body.locator('p').first()).toHaveText('Matched directly to a saved action identifier. A completion mark indicates a recorded action, not current inventory.');
    else await expect(body.locator('.vc-dt-foot p').first()).toHaveText('Found under its exact name in your save. “Completed” means the game recorded you doing it at least once; it does not look at what you carry now.');
    expect((await body.locator('.record-comparison tr').allInnerTexts()).map(r => r.split('\t')[0].trim())).toEqual(['Record', 'Cooked · achievement credit', 'Cooked · lifetime', 'Eaten · lifetime', 'Crafted / cooked · lifetime']);
    await expect(body).toContainText('Source: Cooked records · $item_carrotsoup. Manual corrections never change the recorded count.');
    await expect(body).toContainText('Biome: ');
    const href = await body.getByRole('link', { name: 'Open wiki reference ↗' }).getAttribute('href');
    expect(href).toBe('https://valheim.weirdgloop.org/w/Carrot_Soup');
    await expect(body.getByRole('link', { name: 'Open wiki reference ↗' })).toHaveAttribute('target', '_blank');
    await expect(body.locator('h3')).toHaveText(['Completion correction', 'Private note']);
    await expect(page.getByRole('button', { name: 'Use save record', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Mark completed', exact: true }).evaluate(b => b.click());
    await expect(page.locator('#toast')).toHaveText('Correction saved. Recorded counts are unchanged.');
    await expect(page.getByRole('button', { name: 'Mark completed', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Use save record', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(body).toContainText('Use a correction only when you can verify it in game. Shared Artisan / Blacksmith entries share corrections.');
    await expect(page.locator('#favoriteDetail')).toHaveText('☆ Add count to header');
    await page.locator('#favoriteDetail').evaluate(b => b.click());
    await expect(page.locator('#toast')).toHaveText('Count added to header.');
    await expect(page.locator('label[for="itemNote"]')).toHaveText('Stored only in this browser; included in progress exports.');
    await expect(page.locator('#itemNote')).toHaveAttribute('maxlength', '4000');
    await page.locator('#itemNote').fill('x'.repeat(4100));
    expect((await page.locator('#itemNote').inputValue()).length).toBe(4000);
    await page.locator('#saveNote').evaluate(b => b.click());
    await expect(page.locator('#toast')).toHaveText('Private note saved.');
    expect(Object.values((await A.activeSave(page)).notes)[0].length).toBe(4000);
    await page.keyboard.press('Escape');
    await expect(page.locator('#itemDialog')).not.toHaveAttribute('open', '');
    // Fisherman shows bait.
    await A.selectView(page, 'The Fisherman');
    const fish = (await A.rowNames(page))[0];
    await A.openDetails(page, fish);
    await expect(body).toContainText('Bait: ');
  });

  test('P31 insight pages without a save', async ({ page }) => {
    await A.openApp(page);
    for (const t of A.INSIGHTS) {
      await A.selectView(page, t);
      await expect(page.locator('#insightsView .eyebrow')).toHaveText('Your Viking');
      await expect(page.locator('#insightsView p')).toHaveText('Load a character with the button in the header to reveal your records.');
      await expect(page.locator('#collectionView')).toBeHidden();
    }
  });

  test('P32 Highlights: top 20, rank, bars, ☆ adds, empty text, 35 ms stagger', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    await A.selectView(page, 'Highlights');
    const v = page.locator('#insightsView');
    await expect(v.locator('.eyebrow')).toHaveText('Your greatest hits');
    await expect(v.locator('.insight-intro p').first()).toHaveText('Your 20 largest lifetime action counts. Counts mix different activities; they are not a score or a comparison with other players.');
    await expect(v.locator('.insight-intro p.sub')).toHaveText('Add a count to the header with ☆, or drag any checklist row onto the header.');
    const rows = v.locator('.champion');
    await expect(rows).toHaveCount(20);
    expect(await v.locator('.rank').allTextContents()).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1)));
    const counts = (await v.locator('.champion-label b').allTextContents()).map(s => +s.replace(/,/g, ''));
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    const labels = await v.locator('.champion-label span').allTextContents();
    expect(new Set(labels).size, 'deduplicated').toBe(20);
    expect(await rows.first().locator('.chart-track i').evaluate(i => i.style.width)).toBe('100%');
    expect(await rows.evaluateAll(r => r.map(x => x.style.getPropertyValue('--delay')))).toEqual(Array.from({ length: 20 }, (_, i) => i * 35 + 'ms'));
    const add = page.getByRole('button', { name: `Add ${G.highlightsTop3[0].name} count to header`, exact: true });
    await expect(add).toHaveText('☆');
    await add.evaluate(b => b.click());
    await expect(page.locator('#toast')).toHaveText('Count added to header.');
    await expect(page.locator('#favorites .favorite')).toHaveCount(1);
    // Empty text with a save that has no action records.
    await A.loadSave(page, fch.fixture({ eat: {} }));
    await A.selectView(page, 'Highlights');
    await expect(v.locator('.champions')).toHaveText('No action records in this save yet.');
  });

  test('P33 Skills & travel: distances, work stats, skills, old snapshot, sandbox', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    await A.selectView(page, 'Skills & travel');
    const v = page.locator('#insightsView');
    expect(await v.locator('h2').allTextContents()).toEqual(['Distance travelled', 'Work & survival', 'Skills', 'Death-loss sandbox']);
    expect(await v.locator('.distance span').allTextContents()).toEqual(['Walked', 'Ran', 'Sailed', 'At the helm', 'Airborne']);
    await expect(v.locator('.distance .chart-track')).toHaveCount(5);
    await expect(v).toContainText('Sailing at the helm overlaps Sailed. This save layout has no separate sneak or swim distance counter; those skills are shown below.');
    expect((await v.locator('.work-stats p').allInnerTexts()).map(s => s.replace(/^[\d,]+\s*/, ''))).toEqual(['deaths', 'build actions', 'crafting actions', 'upgrades']);
    await expect(v.locator('.work-stats p').first()).toHaveText(`${G.lifetime.Deaths} deaths`);
    await expect(v).toContainText('Build actions and Crafting skill are different records. The save does not contain enough action-by-action history to calculate the skill level you “should” have.');
    const levels = (await v.locator('.skill b').allTextContents()).map(Number);
    expect(levels.length).toBe(G.skills);
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
    for (const s of await v.locator('.skill small').allTextContents()) expect(s).toMatch(/^(Maximum level|[\d.]+ \/ [\d.]+ XP to next level \(\d+%\))$/);
    // Sandbox.
    await expect(page.locator('label:has(#lossSkill)')).toHaveText(/^Skill/);
    expect(await page.locator('#lossSkill option').count()).toBe(G.skills);
    await expect(v.getByLabel('Assumed skill-draining deaths')).toHaveValue('1');
    await expect(v.getByLabel('Loss per death (%)')).toHaveValue('5');
    await expect(page.locator('#lossResult')).toHaveAttribute('role', 'status');
    await expect(page.locator('#lossResult')).toHaveText(/^Current [\d.]+ → hypothetical [\d.]+ \([\d.-]+ levels difference\)\. This is an illustration, not total skill lost\.$/);
    await page.locator('#lossDeaths').fill('-1');
    await expect(page.locator('#lossResult')).toHaveText('Enter 0–1,000 whole deaths and a loss rate from 0–99%.');
    await page.locator('#lossDeaths').fill('3');
    await expect(page.locator('#lossResult')).toContainText('Current ');
    await expect(v).toContainText('Formula: current level ÷ (1 − loss rate)assumed deaths, capped at 100. This assumes no skill gains between the assumed deaths and ignores XP resets.');
    await expect(v).toContainText('This is a hypothetical reversal, not recovered history.');
    // Maximum level, via a synthetic save with a level-100 skill.
    await A.loadSave(page, fch.fixture({ skills: [{ id: 1, level: 100, xp: 0 }, { id: 102, level: 33.5, xp: 16.5 }] }));
    await A.selectView(page, 'Skills & travel');
    await expect(v.locator('.skill small').first()).toHaveText('Maximum level');
    // Old snapshot without skills.
    const old = await A.activeSave(page);
    delete old.save.discovered.skills;
    await A.setFile(page, '#progressFile', 'old.json', Buffer.from(JSON.stringify(old)), 'application/json');
    await A.selectView(page, 'Skills & travel');
    await expect(v).toContainText('Reload your .fch to read skills. Older saved snapshots did not retain them.');
    await expect(page.locator('#lossResult')).toHaveText('Load a fresh save with skill records to use this sandbox.');
  });

  test('P34 help: summary, six paragraphs, links, Forget with confirm', async ({ page }) => {
    await A.openApp(page);
    const help = page.locator('details.help');
    await expect(help.locator('summary')).toHaveText('How progress is read, catalog notes, and save locations');
    await expect(help.locator('> p')).toHaveCount(7); // 6 explanatory paragraphs + the Forget paragraph
    await expect(page.locator('#forget')).toBeDisabled();
    await expect(page.locator('#forget')).toHaveText('Forget this character’s saved progress');
    expect(await help.locator('a').evaluateAll(a => a.map(x => [x.textContent, x.href]))).toEqual([
      ['Jötunn’s localization reference', 'https://valheim-modding.github.io/Jotunn/data/localization/translations/English.html'],
      ['Steam’s Valheim cloud files', 'https://store.steampowered.com/account/remotestorageapp/?appid=892970'],
    ]);
    await help.locator('summary').evaluate(s => s.click());
    await expect(help).toHaveAttribute('open', '');
    await A.loadSave(page);
    await expect(page.locator('#forget')).toBeEnabled();
    let seen = '';
    page.once('dialog', d => { seen = d.message(); d.dismiss(); });
    await page.locator('#forget').evaluate(b => b.click());
    expect(seen).toBe(`Forget ${NAME}’s extracted progress, corrections, and pins in this browser? Your game save will not change.`);
    await expect(page.locator('#headerProfile strong')).toHaveText(NAME);
    page.once('dialog', d => d.accept());
    await page.locator('#forget').evaluate(b => b.click());
    await expect(page.locator('#message')).toHaveText('Saved progress cleared from this browser.');
    expect(await A.localStorageDump(page)).toEqual({});
    await expect(page.locator('#headerProfile')).toBeHidden();
  });

  test('P35 resource links', async ({ page }) => {
    await A.openApp(page);
    expect(await page.locator('.resources a').evaluateAll(a => a.map(x => [x.textContent, x.href, x.target, x.rel]))).toEqual([
      ['Wiki achievements', 'https://valheim.weirdgloop.org/w/Achievements', '_blank', 'noopener'],
      ['Community achievement guide', 'https://steamcommunity.com/sharedfiles/filedetails/?id=3799211007', '_blank', 'noopener'],
      ['Original checklist', 'https://docs.google.com/spreadsheets/d/1Hc167FeYYJlXQUui1SCOazS0LH-6N3wpdy4UAz7-wZw/edit', '_blank', 'noopener'],
      ['Report a problem', 'https://github.com/JohnBrock137/valheim-checkup/issues', '_blank', 'noopener'],
    ]);
  });

  test('P36 footer disclaimer and catalog snapshot', async ({ page }) => {
    await A.openApp(page);
    await expect(page.locator('.footer')).toContainText('Unofficial fan tool. Valheim belongs to Iron Gate AB. Catalog snapshot: community workbook, October 2026.');
  });

  test('P37 toast bottom right, role=status, 10 s', async ({ page }) => {
    await A.openApp(page);
    const t = page.locator('#toast');
    await expect(t).toHaveAttribute('role', 'status');
    await A.setMode(page, 'raw');
    const t0 = Date.now();
    await expect(t).toBeVisible();
    const box = await t.boundingBox();
    const vp = page.viewportSize();
    expect(box.x + box.width).toBeGreaterThan(vp.width * 0.75);
    expect(box.y + box.height).toBeGreaterThan(vp.height * 0.75);
    await page.waitForTimeout(Math.max(0, 9300 - (Date.now() - t0)));
    await expect(t).toBeVisible();
    await expect(t).toBeHidden({ timeout: 2000 });
    expect(Date.now() - t0).toBeLessThan(11500);
  });

  test('P38 every title tooltip text is present', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    await A.openDetails(page, 'Carrot Soup');
    await page.locator('#itemNote').fill('n');
    await page.locator('#saveNote').evaluate(b => b.click());
    await page.locator('#favoriteDetail').evaluate(b => b.click());
    await A.closeDetails(page);
    const titles = async () => new Set(await page.locator('[title]').evaluateAll(e => e.map(x => x.getAttribute('title'))));
    let all = await titles();
    await A.selectView(page, 'The Carpenter');
    await page.locator('#statusFilter').selectOption('all');
    for (const t of await titles()) all.add(t);
    await A.selectView(page, 'The Artisan');
    await page.locator('#statusFilter').selectOption('all');
    for (const t of await titles()) all.add(t);
    for (const t of ['Import progress JSON', 'Export progress JSON', 'Choose a .fch file or drop one here', OVERALL_TIP, A.UNVERIFIED, 'Open this collection',
      'Open Details to compare records or add a note. Double-click or right-click also opens Details.', 'Has a private note',
      'Not verified in the catalog. Use the wiki link in Details.', 'Community catalog biome; recipes may use materials from multiple biomes.', 'Same item in community catalog']) {
      expect(all.has(t), t).toBe(true);
    }
  });

  test('P39 aria-labels, live regions, hidden label, keyboard use', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    for (const [sel, label] of [['#importProgress', 'Import progress'], ['#exportProgress', 'Export progress'], ['#loadTop', 'Load another character save'], ['#favorites', 'Favorite statistics'], ['#categories', 'Achievement collections'], ['#insightNav', 'Character insights'], ['#mobileCategory', 'Collection'], ['#statusFilter', 'Completion filter'], ['#discoveryFilter', 'Discovery filter'], ['#biomeFilter', 'Biome filter'], ['#sort', 'Sort items'], ['#search', 'Search items'], ['#mainTrack', 'Collection completion'], ['#closeDetails', 'Close details']]) {
      await expect(page.locator(sel), sel).toHaveAttribute('aria-label', label);
    }
    await expect(page.locator('#message')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#insightsView')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#toast')).toHaveAttribute('role', 'status');
    await expect(page.locator('.visually-hidden')).toHaveText('Progress records');
    // Keyboard: reach a collection control by Tab and select The Carpenter with the keyboard only.
    await page.locator('body').focus();
    let found = false;
    for (let n = 0; n < 60 && !found; n++) {
      await page.keyboard.press('Tab');
      found = await page.evaluate(() => !!document.activeElement?.closest?.('#categories'));
    }
    expect(found, 'Tab reaches the collection list').toBe(true);
    for (let n = 0; n < 15; n++) {
      if (await page.evaluate(() => document.activeElement?.dataset?.category === 'The Carpenter')) break;
      const before = await page.evaluate(() => document.activeElement?.dataset?.category);
      await page.keyboard.press('ArrowDown');
      if (await page.evaluate(b => document.activeElement?.dataset?.category === b, before)) await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Enter');
    await A.expectView(page, 'The Carpenter');
    // Keyboard reaches the search field and the table's Details buttons.
    await page.locator('#search').focus();
    await page.keyboard.type('wood');
    await expect(page.locator('#listCount')).toContainText('of 400 items shown');
  });

  test('P40 no uploads, analytics or accounts', async ({ page }) => {
    const requests = [];
    page.on('request', r => requests.push(r.url()));
    await A.openApp(page);
    await A.loadSave(page);
    for (const v of A.VIEWS) await A.selectView(page, v);
    await A.selectView(page, 'The Master Chef');
    await A.openDetails(page, 'Carrot Soup');
    await A.closeDetails(page);
    const external = requests.filter(u => !u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:'));
    expect(external).toEqual([]);
    expect(await page.context().cookies()).toEqual([]);
    expect(await page.evaluate(() => document.querySelectorAll('input[type=password], input[type=email], form[action]').length)).toBe(0);
  });

  test('P41 scripts/test.cjs passes; core.js and catalog.json unchanged', async ({ page }) => {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'test.cjs')], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toContain('Passed:');
    const hashes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'baseline', 'hashes.json'), 'utf8'));
    for (const f of ['src/core.js', 'src/catalog.json']) {
      const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
      expect(h, f).toBe(hashes[f]);
    }
    await A.openApp(page);
    const inlined = await page.evaluate(() => document.getElementById('catalogData').textContent);
    expect(crypto.createHash('sha256').update(inlined).digest('hex')).toBe(hashes['src/catalog.json']);
    expect(await page.evaluate(() => typeof ValheimCore.parseSave === 'function' && typeof ValheimCore.evaluate === 'function')).toBe(true);
  });

  test('P42 version-1 exports and profile 46 and 47 saves load', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page, fch.fixture({ latest: false }));
    expect((await A.activeSave(page)).save.version).toBe(46);
    await A.loadSave(page, fch.fixture({ latest: true }));
    const s47 = await A.activeSave(page);
    expect(s47.save.version).toBe(47);
    expect(s47.version).toBe(1);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await A.setFile(page, '#progressFile', 'v1.json', Buffer.from(JSON.stringify(s47, null, 2)), 'application/json');
    await expect(page.locator('#toast')).toHaveText('Progress restored.');
    await A.loadSave(page);
    expect((await A.activeSave(page)).save.version).toBe(G.profile);
  });

  test('P43 works offline from a downloaded file', async ({ page, context }) => {
    await context.setOffline(true);
    await context.route(/^https?:/, r => r.abort());
    await A.openApp(page);
    const externals = await page.evaluate(() => [...document.querySelectorAll('script[src], link[rel=stylesheet][href], img[src]')].map(e => e.src || e.href).filter(u => /^https?:/.test(u)));
    expect(externals).toEqual([]);
    await A.loadSave(page);
    await expect(page.locator('#overallCount')).toHaveText(G.overall.done);
    expect(page.url().startsWith('file:') || !!process.env.TARGET_URL).toBe(true);
  });

  test('P44 drag-and-drop a file onto the hero and the load button', async ({ page }) => {
    await A.openApp(page);
    const bytes = fs.readFileSync(require('../helpers/private').SAVE);
    const r1 = await A.dropFile(page, '#dropzone', 'characters_test.fch', bytes);
    expect(r1.dragClass).toBe(true);
    await expect(page.locator('#toast')).toHaveText(`Loaded ${NAME}. Progress is up to date.`);
    await expect(page.locator('#dropzone')).not.toHaveClass(/(^|\s)drag(\s|$)/);
    await page.evaluate(() => document.getElementById('toast').classList.add('hidden'));
    await A.dropFile(page, '#loadTop', 'characters_fixture.fch', fch.fixture());
    await expect(page.locator('#toast')).toHaveText('Loaded Fixture. Progress is up to date.');
    await A.dropFile(page, '#loadTop', 'notes.txt', Buffer.from('x'));
    await expect(page.locator('#message')).toHaveText('Choose a .fch character file.');
  });
});
