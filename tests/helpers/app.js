// Target-neutral driver for the app. Finds things by original id, role and accessible name only.
// On desk, views are selected through the board proxies (the original button.category elements)
// with a programmatic click, never by pixel position (WP-00 step 4, WP-06 mechanism step 5).
const fs = require('node:fs');
const { expect } = require('@playwright/test');
const { TARGET, targetUrl } = require('./target');
const { SAVE } = require('./private');

const FIXED_NOW = new Date('2026-11-10T12:00:00Z');
const COLLECTIONS = ['The Artisan', 'The Blacksmith', 'The Carpenter', 'The Master Chef', 'The Gourmet', 'The Trophy Collector', 'The Hunter', 'The Master Hunter', 'The Fisherman', 'Are You Alright?', "That Can't Be an Accident"];
const INSIGHTS = ['Highlights', 'Skills & travel'];
const VIEWS = [...COLLECTIONS, ...INSIGHTS];
const UNVERIFIED = 'This name has no reliable save mapping, or several variants share the same identifier. It is separate from Missing. Confirm it in game, then use Details to add a correction.';

/**
 * Open the target with a fixed Date (so loadedAt, exports and the byline are reproducible).
 * @param {import('@playwright/test').Page} page
 * @param {{url?: string, query?: string, init?: Function, initArg?: any, reducedMotion?: 'reduce'|'no-preference'}} [opts]
 */
async function openApp(page, opts = {}) {
  await page.clock.setFixedTime(FIXED_NOW);
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: opts.reducedMotion });
  if (opts.init) await page.addInitScript(opts.init, opts.initArg);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(opts.url || targetUrl(opts.query || ''));
  await expect(page.locator('#categories [data-category]').first()).toBeAttached();
  return errors;
}

async function loadSave(page, file = SAVE) {
  const buffer = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
  const name = Buffer.isBuffer(file) ? 'characters_fixture.fch' : 'characters_test.fch';
  await page.locator('#saveFile').setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
  await expect(page.locator('#toast')).toContainText('Progress is up to date.');
}

async function setFile(page, selector, name, buffer, mimeType = 'application/octet-stream') {
  await page.locator(selector).setInputFiles({ name, mimeType, buffer });
}

/** Select a view through its original button (bar proxy on desk). */
async function selectView(page, title) {
  const button = page.locator(`[data-category="${title.replace(/"/g, '\\"')}"]`).first();
  await button.evaluate(b => b.click());
  await expectView(page, title);
}

async function expectView(page, title) {
  if (INSIGHTS.includes(title)) {
    await expect(page.locator('#insightsView')).toBeVisible();
    await expect(page.locator('#insightsView h1')).toHaveText(title);
  } else {
    await expect(page.locator('#collectionView')).toBeVisible();
    await expect(page.locator('#title')).toHaveText(title);
  }
}

async function setMode(page, value) {
  await page.locator('#recordMode').selectOption(value);
}

/** Read the four stamps / metrics by label, independent of markup. Returns {Completed, Missing, Unverified, Undiscovered}. */
async function readMetrics(page) {
  return page.locator('#metrics').evaluate(root => {
    const out = {};
    const leaves = el => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const t = []; while (w.nextNode()) { const s = w.currentNode.textContent.trim(); if (s) t.push(s); } return t; };
    for (const child of root.children) {
      const t = leaves(child);
      const label = t.find(s => /^(Completed|Missing|Unverified|Undiscovered)( ⓘ)?$/.test(s));
      const value = t.find(s => /^(—|[\d,]+)$/.test(s));
      if (label) out[label.replace(' ⓘ', '')] = value;
    }
    return out;
  });
}

/** Wait until the metric values stop changing (count-up animations on new targets). */
async function stableMetrics(page) {
  let last = null;
  await expect.poll(async () => { const now = JSON.stringify(await readMetrics(page)); const same = now === last; last = now; return same; }, { intervals: [150, 250, 400, 600], timeout: 15000 }).toBe(true);
  return JSON.parse(last);
}

async function toastText(page) { return (await page.locator('#toast').textContent()).trim(); }

async function rowNames(page) {
  return page.locator('#items tr[data-item] .item-name').allTextContents();
}

/** Open Details for a named row via its Details button. */
async function openDetails(page, itemName) {
  await page.getByRole('button', { name: `Details for ${itemName}`, exact: true }).evaluate(b => b.click());
  await expect(page.locator('#itemDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#detailTitle')).toHaveText(itemName);
}

async function closeDetails(page) {
  await page.locator('#closeDetails').evaluate(b => b.click());
  await expect(page.locator('#itemDialog')).not.toHaveAttribute('open', '');
}

/** Synthetic HTML5 drag of a table row onto the header (P05), position independent. */
async function dragRowToHeader(page, itemId, { drop = true } = {}) {
  return page.evaluate(({ itemId, drop }) => {
    const row = [...document.querySelectorAll('#items tr[data-item]')].find(r => r.dataset.item === itemId);
    const header = document.querySelector('header');
    const dt = new DataTransfer();
    row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    header.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const highlighted = header.classList.contains('favorite-drop');
    if (drop) header.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return { highlighted, after: header.classList.contains('favorite-drop') };
  }, { itemId, drop });
}

/** Synthetic file drop on an element (P44). */
async function dropFile(page, selector, name, buffer, { drop = true } = {}) {
  return page.evaluate(({ selector, name, b64, drop }) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], name));
    const el = document.querySelector(selector);
    el.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const dragClass = el.classList.contains('drag');
    if (drop) el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return { dragClass };
  }, { selector, name, b64: buffer.toString('base64'), drop });
}

async function localStorageDump(page) {
  return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
}

async function activeSave(page) {
  return page.evaluate(() => { const id = localStorage.getItem('valheim-checkup:active'); return id ? JSON.parse(localStorage.getItem('valheim-checkup:v1:' + id)) : null; });
}

/** Init script: make Blob.arrayBuffer slow so the "reading" state is observable (P09). */
function slowReads(ms) {
  const original = Blob.prototype.arrayBuffer;
  Blob.prototype.arrayBuffer = function () { return new Promise(r => setTimeout(r, ms)).then(() => original.call(this)); };
}

/** Init script: make localStorage writes fail (P11). */
function failingStorage() {
  Storage.prototype.setItem = function () { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); };
}

module.exports = {
  TARGET, FIXED_NOW, COLLECTIONS, INSIGHTS, VIEWS, UNVERIFIED,
  openApp, loadSave, setFile, selectView, expectView, setMode, readMetrics, stableMetrics, toastText, rowNames,
  openDetails, closeDetails, dragRowToHeader, dropFile, localStorageDump, activeSave, slowReads, failingStorage,
};
