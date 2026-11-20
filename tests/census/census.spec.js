// census.spec.js — file 03 automatic censuses.
//   CENSUS_BUILD=1 TARGET=baseline : record tests/baseline/strings.json, controls.json, outputs.json
//                                    (+ private output files in fixtures/private/baseline-outputs/)
//   any TARGET                      : compare the target with the recorded baseline.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { test, expect } = require('@playwright/test');
const A = require('../helpers/app');
const { states, collectStringsInPage, collectControls } = require('../helpers/states');
const { redact, OUTPUTS } = require('../helpers/private');

const BASE = path.join(__dirname, '..', 'baseline');
const BUILD = !!process.env.CENSUS_BUILD;
if (BUILD && A.TARGET !== 'baseline') throw new Error('CENSUS_BUILD only on TARGET=baseline');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const readJSON = f => JSON.parse(fs.readFileSync(path.join(BASE, f), 'utf8'));
// Paul, WP-16 item 21: "Remove the redundant 'Bring your Viking's progress with you' / 'Choose .fch
// file' block" (redundant with the Load coin). On the reskinned targets only that block's own strings
// and its one button are exempt; every other string and control is still required.
const PAUL_REMOVED = A.TARGET === 'baseline' ? { strings: new Set(), controls: new Set() } : {
  strings: new Set(['Bring your Viking’s progress with you', 'Select a', '.fch', 'character save, or drop it here. Reveal every checklist name and see what’s left to do.', 'Select a .fch character save, or drop it here. Reveal every checklist name and see what’s left to do.', 'Choose .fch file']),
  controls: new Set(['button|Choose .fch file']),
};
// Paul, WP-17 item 25: the Details line "Matched directly …" is rewritten in plain words in a small
// footer on the reskinned targets (checked word for word in P30 instead).
if (A.TARGET !== 'baseline') PAUL_REMOVED.strings.add('Matched directly to a saved action identifier. A completion mark indicates a recorded action, not current inventory.');
// Paul, WP-17 item 23: the default filter is now "All items, missing first", so a state's list count
// reads "N of M items shown" with a different N. It still has to be there, for the same collection
// total M; any other string still has to match exactly.
const listCountMoved = (/** @type {string} */ str, /** @type {Set<string>} */ have) => {
  if (A.TARGET === 'baseline') return false;
  const m = /^[\d,]+ of ([\d,]+) items shown$/.exec(str);
  return !!m && [...have].some(h => new RegExp(`^[\\d,]+ of ${m[1]} items shown$`).test(h));
};

async function runState(browser, s) {
  const context = await browser.newContext(s.opts?.viewport ? { viewport: s.opts.viewport } : {});
  const page = await context.newPage();
  const ctx = { dialogs: [] };
  page.on('dialog', d => { if (!ctx.dialogs.includes(d.message())) { ctx.dialogs.push(d.message()); } });
  await A.openApp(page, { init: s.opts?.init, initArg: s.opts?.initArg });
  await s.run(page, ctx);
  const strings = await page.evaluate(collectStringsInPage);
  strings.dialog = ctx.dialogs;
  const controls = await collectControls(page);
  await context.close();
  return { strings: redact(strings), controls: redact(controls) };
}

test.describe.configure({ mode: 'serial' });

test.describe('censuses (file 03)', () => {
  const results = {};

  test('string and control census: every state', async ({ browser }) => {
    test.setTimeout(20 * 60_000);
    const baseStrings = BUILD ? null : readJSON('strings.json');
    const baseControls = BUILD ? null : readJSON('controls.json');
    const failures = [];
    for (const s of states()) {
      const r = await runState(browser, s);
      results[s.name] = r;
      if (BUILD) continue;
      const b = baseStrings.states[s.name], have = new Set(Object.values(r.strings).flat());
      if (!b) { failures.push(`${s.name}: state missing from baseline`); continue; }
      for (const str of new Set(Object.values(b).flat())) if (!have.has(str) && !PAUL_REMOVED.strings.has(str) && !listCountMoved(str, have)) failures.push(`${s.name}: string missing: ${JSON.stringify(str)}`);
      const key = c => `${c.role}|${c.name}`;
      const now = new Map(); r.controls.controls.forEach(c => now.set(key(c), (now.get(key(c)) || 0) + 1));
      const want = new Map(); baseControls.states[s.name].controls.forEach(c => want.set(key(c), (want.get(key(c)) || 0) + 1));
      for (const [k, n] of want) if ((now.get(k) || 0) < n && !PAUL_REMOVED.controls.has(k)) failures.push(`${s.name}: control missing: ${k} (want ${n}, have ${now.get(k) || 0})`);
      for (const t of baseControls.states[s.name].dragTargets.dropTargets) if (!r.controls.dragTargets.dropTargets.includes(t)) failures.push(`${s.name}: drop target missing: ${t}`);
      if (r.controls.dragTargets.draggableRows < baseControls.states[s.name].dragTargets.draggableRows) failures.push(`${s.name}: fewer draggable rows`);
    }
    if (BUILD) {
      const meta = { target: 'baseline', app: 'Valheim Checkup v1.2.1 (baseline/index.html)', recorded: 'WP-00', viewport: '1440x900 unless noted', locale: 'en-US', timezone: 'UTC', fixedDate: A.FIXED_NOW.toISOString(), note: 'Character name redacted as {name}.' };
      fs.writeFileSync(path.join(BASE, 'strings.json'), JSON.stringify({ meta, states: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.strings])) }, null, 1) + '\n');
      fs.writeFileSync(path.join(BASE, 'controls.json'), JSON.stringify({ meta, states: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.controls])) }, null, 1) + '\n');
    }
    expect(failures.slice(0, 200)).toEqual([]);
  });

  test('string census holds every on-screen string of template.html and app.js', async ({ page }) => {
    const census = BUILD ? { states: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.strings])) } : readJSON('strings.json');
    const all = new Set(); for (const st of Object.values(census.states)) for (const v of Object.values(st).flat()) all.add(v);
    // Template strings, straight from the original page's DOM (all of it can appear).
    await page.goto(require('../helpers/target').targetUrl().replace(/\?.*$/, '').replace(/dist\/valheim-checkup\.html$/, 'baseline/index.html'));
    const template = await page.evaluate(() => {
      const norm = s => s.replace(/\s+/g, ' ').trim(), out = new Set();
      for (const el of document.body.querySelectorAll('*')) {
        if (['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
        if (el.closest('#categories, #metrics, #items, #insightsView, #detailBody, #headerProfile, #statline, #favorites, #overall, #mobileCategory, #biomeFilter, #collectionNotice, #listCount, #mainTrack, #title, #description, #collectionLabel, #toast, #message')) continue; // filled by app.js
        for (const n of el.childNodes) if (n.nodeType === 3 && norm(n.textContent)) out.add(norm(n.textContent));
        for (const a of ['title', 'aria-label', 'placeholder']) if (el.getAttribute(a)) out.add(norm(el.getAttribute(a)));
      }
      return [...out];
    });
    const patterns = readJSON('source-strings.app.json').patterns;
    const rx = p => new RegExp(p.split(/\{(?:x|name)\}/).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(p.includes('{name}') ? '(?:\\{name\\}|.+?)' : '.+?'));
    const missing = [];
    for (const t of template) if (![...all].some(s => s.includes(t))) missing.push('template: ' + t);
    for (const p of patterns) { const r = rx(p); if (![...all].some(s => r.test(s))) missing.push('app.js: ' + p); }
    if (BUILD) fs.writeFileSync(path.join(BASE, 'source-strings.coverage.json'), JSON.stringify({ templateStrings: template.length, appPatterns: patterns.length, missing }, null, 1) + '\n');
    expect(missing).toEqual([]);
  });

  test('output census: progress JSON, list CSV, localStorage byte-identical', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    // Fixed action script.
    await page.locator('#statusFilter').selectOption('all');
    await page.getByRole('button', { name: 'Star Carrot Soup', exact: true }).evaluate(b => b.click());
    await page.getByRole('button', { name: 'Star Blood Pudding', exact: true }).evaluate(b => b.click());
    await A.openDetails(page, 'Carrot Soup');
    await page.getByRole('button', { name: 'Mark completed', exact: true }).evaluate(b => b.click());
    await page.locator('#itemNote').fill('Census note, "quoted", with comma');
    await page.locator('#saveNote').evaluate(b => b.click());
    await page.locator('#favoriteDetail').evaluate(b => b.click());
    await A.closeDetails(page);
    await page.locator('#statusFilter').selectOption('remaining');
    const grab = async sel => { const dl = page.waitForEvent('download'); await page.locator(sel).evaluate(b => b.click()); const d = await dl; return fs.readFileSync(await d.path()); };
    const json = await grab('#exportProgress');
    const csv = await grab('#exportList');
    const dump = await A.localStorageDump(page);
    const ls = Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(dump).filter(([k]) => /^valheim-checkup:(v1:|active$)/.test(k))), null, 1));
    const now = { 'progress.json': json, 'list.csv': csv, 'localStorage.json': ls };
    if (BUILD) {
      fs.mkdirSync(OUTPUTS, { recursive: true });
      const manifest = { _about: 'Output census (file 03 #3). Files themselves are personal data and live in fixtures/private/baseline-outputs/; this manifest holds only hashes and sizes.', script: 'load save; status All; star Carrot Soup and Blood Pudding; Details Carrot Soup: Mark completed, note \'Census note, "quoted", with comma\', Add count to header; close; status Remaining; export progress; export list (Master Chef); dump localStorage (original keys only, JSON.stringify(...,null,1)). Fixed date ' + A.FIXED_NOW.toISOString() + ', locale en-US, timezone UTC.', files: {} };
      for (const [f, b] of Object.entries(now)) { fs.writeFileSync(path.join(OUTPUTS, f), b); manifest.files[f] = { sha256: sha(b), bytes: b.length }; }
      fs.writeFileSync(path.join(BASE, 'outputs.json'), JSON.stringify(manifest, null, 2) + '\n');
    }
    const manifest = readJSON('outputs.json');
    for (const [f, b] of Object.entries(now)) expect(sha(b), f + ' byte-identical to baseline').toBe(manifest.files[f].sha256);
  });
});
