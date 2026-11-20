// Census states (file 03, automatic census 1 and 2). Each state starts from a fresh page.
// A state is {name, run(page, ctx), opts?}. The census collects strings and controls after run().
const fs = require('node:fs');
const { expect } = require('@playwright/test');
const A = require('./app');
const fch = require('./fch');
const { SAVE } = require('./private');

const hideToast = page => page.evaluate(() => document.getElementById('toast').classList.add('hidden'));
const allRows = page => page.locator('#statusFilter').selectOption('all');

/** A Carpenter item with no tokens, an Artisan item with a biomeSource, the first item of each collection. */
async function catalogPicks(page) {
  return page.evaluate(() => {
    const d = JSON.parse(document.getElementById('catalogData').textContent).catalog;
    const by = t => d.find(c => c.title === t);
    return {
      noTokens: by('The Carpenter').items.find(i => !i.tokens.length).name,
      biomeSource: by('The Artisan').items.find(i => i.biomeSource).name,
      noBiome: by('The Artisan').items.find(i => !i.biome).name,
    };
  });
}

function states() {
  const list = [];
  const add = (name, run, opts) => list.push({ name, run, opts });

  // No save: every view, Details, help.
  for (const v of A.VIEWS) add(`nosave/${v}`, async page => { await A.selectView(page, v); });
  add('nosave/details', async page => { await A.openDetails(page, 'Carrot Soup'); });
  add('nosave/help-open', async page => { await page.locator('details.help summary').evaluate(s => s.click()); });

  // Save loaded: every view in both modes, all rows shown.
  for (const mode of ['achievement', 'raw']) {
    for (const v of A.VIEWS) {
      if (mode === 'raw' && A.INSIGHTS.includes(v)) continue;
      add(`save/${mode}/${v}`, async page => {
        await A.loadSave(page);
        if (mode === 'raw') await A.setMode(page, 'raw');
        await A.selectView(page, v);
        if (!A.INSIGHTS.includes(v)) await allRows(page);
      });
    }
  }
  add('save/default-filters', async page => { await A.loadSave(page); });

  // Each filter value (Master Chef, and Carpenter for unverified and unknown biome).
  for (const value of ['remaining', 'all', 'missing', 'done', 'unknown']) add(`filter/status=${value}`, async page => { await A.loadSave(page); await A.selectView(page, 'The Carpenter'); await page.locator('#statusFilter').selectOption(value); });
  for (const value of ['all', 'known', 'undiscovered']) add(`filter/discovery=${value}`, async page => { await A.loadSave(page); await page.locator('#discoveryFilter').selectOption(value); });
  for (const value of ['name', 'source', 'biome']) add(`filter/sort=${value}`, async page => { await A.loadSave(page); await allRows(page); await page.locator('#sort').selectOption(value); });
  add('filter/biome=each', async page => {
    await A.loadSave(page); await allRows(page);
    const values = await page.locator('#biomeFilter option').evaluateAll(o => o.map(x => x.value));
    for (const v of values) await page.locator('#biomeFilter').selectOption(v);
  });
  add('filter/starred', async page => { await A.loadSave(page); await allRows(page); await page.locator('#items [data-pin]').first().evaluate(b => b.click()); await page.locator('#pinnedOnly').evaluate(c => { if (!c.checked) c.click(); }); });
  add('filter/search-empty', async page => { await A.loadSave(page); await page.locator('#search').fill('zzzz-no-such-item'); });

  // Details for one item per collection, plus special items.
  for (const v of A.COLLECTIONS) add(`details/${v}`, async page => {
    await A.loadSave(page); await A.selectView(page, v); await allRows(page);
    const name = (await A.rowNames(page))[0];
    await A.openDetails(page, name);
  });
  add('details/no-tokens-and-biome-source', async page => {
    await A.loadSave(page); const p = await catalogPicks(page);
    await A.selectView(page, 'The Carpenter'); await allRows(page); await A.openDetails(page, p.noTokens);
  });
  add('details/biome-source', async page => {
    await A.loadSave(page); const p = await catalogPicks(page);
    await A.selectView(page, 'The Artisan'); await allRows(page); await page.locator('#search').fill(p.biomeSource); await A.openDetails(page, p.biomeSource);
  });
  add('details/correction-note-favorite', async page => {
    await A.loadSave(page); await allRows(page); await hideToast(page);
    await A.openDetails(page, 'Carrot Soup');
    await page.getByRole('button', { name: 'Mark completed', exact: true }).evaluate(b => b.click());
    await expect(page.locator('#toast')).toHaveText('Correction saved. Recorded counts are unchanged.');
    await page.locator('#itemNote').fill('A private note');
    await page.locator('#saveNote').evaluate(b => b.click());
    await expect(page.locator('#toast')).toHaveText('Private note saved.');
    await page.locator('#favoriteDetail').evaluate(b => b.click());
    await expect(page.locator('#toast')).toHaveText('Count added to header.');
    await A.closeDetails(page);
  });

  // Help open with a save.
  add('save/help-open', async page => { await A.loadSave(page); await page.locator('details.help summary').evaluate(s => s.click()); });

  // Toasts.
  add('toast/loaded', async page => { await A.loadSave(page); });
  add('toast/lifetime', async page => { await A.loadSave(page); await hideToast(page); await A.setMode(page, 'raw'); });
  add('toast/unverified', async page => { await A.loadSave(page); await hideToast(page); await A.selectView(page, 'The Carpenter'); });
  add('toast/already-in-header', async page => {
    await A.loadSave(page); await allRows(page);
    const id = await page.locator('#items tr[data-item]').first().getAttribute('data-item');
    await A.dragRowToHeader(page, id); await A.dragRowToHeader(page, id);
    await expect(page.locator('#toast')).toHaveText('Already in your header.');
  });
  add('toast/six-favorites', async page => {
    await A.loadSave(page); await allRows(page);
    const ids = await page.locator('#items tr[data-item]').evaluateAll(r => r.slice(0, 7).map(x => x.dataset.item));
    for (const id of ids) await A.dragRowToHeader(page, id);
    await expect(page.locator('#toast')).toHaveText('Keep up to six favorite counts. Remove one to add another.');
  });
  add('toast/correction', async page => {
    await A.loadSave(page); await hideToast(page); await A.openDetails(page, 'Carrot Soup');
    await page.getByRole('button', { name: 'Mark missing', exact: true }).evaluate(b => b.click());
    await expect(page.locator('#toast')).toHaveText('Correction saved. Recorded counts are unchanged.');
  });
  add('toast/note-saved', async page => {
    await A.loadSave(page); await hideToast(page); await A.openDetails(page, 'Carrot Soup');
    await page.locator('#itemNote').fill('A private note'); await page.locator('#saveNote').evaluate(b => b.click());
    await expect(page.locator('#toast')).toHaveText('Private note saved.');
  });
  add('toast/progress-restored', async page => {
    await A.loadSave(page, fch.fixture());
    const exp = JSON.stringify(await A.activeSave(page), null, 2);
    await A.setFile(page, '#progressFile', 'p.json', Buffer.from(exp), 'application/json');
    await expect(page.locator('#toast')).toHaveText('Progress restored.');
  });

  // Messages.
  add('message/not-fch', async page => { await A.setFile(page, '#saveFile', 'notes.txt', Buffer.from('x')); });
  add('message/reading', async page => {
    await page.locator('#saveFile').setInputFiles({ name: 'c.fch', mimeType: 'application/octet-stream', buffer: fs.readFileSync(SAVE) });
    await expect(page.locator('#message')).toHaveText('Reading character save…');
  }, { init: A.slowReads, initArg: 4000 });
  add('message/could-not-read', async page => {
    await A.setFile(page, '#saveFile', 'c.fch', Buffer.from('x'));
    await expect(page.locator('#message')).toHaveText('Could not read this save.');
  }, { init: () => { Blob.prototype.arrayBuffer = () => Promise.reject(new Error('')); } });
  add('message/checksum', async page => { await A.setFile(page, '#saveFile', 'c.fch', fch.damaged()); await expect(page.locator('#message')).toContainText('Checksum'); });
  add('message/profile-48', async page => { await A.setFile(page, '#saveFile', 'c.fch', fch.profile48()); await expect(page.locator('#message')).toContainText('profile 48'); });
  add('message/too-small', async page => { await A.setFile(page, '#saveFile', 'c.fch', Buffer.from('tiny')); await expect(page.locator('#message')).toContainText('up to 32 MB'); });
  add('message/truncated', async page => { await A.setFile(page, '#saveFile', 'c.fch', fch.fixture().subarray(0, 200)); await expect(page.locator('#message')).not.toHaveText(''); });
  add('message/progress-too-large', async page => { await A.setFile(page, '#progressFile', 'p.json', Buffer.alloc(10 * 1024 * 1024 + 1, 32), 'application/json'); await expect(page.locator('#message')).toHaveText('Progress file is too large.'); });
  add('message/progress-invalid', async page => { await A.setFile(page, '#progressFile', 'p.json', Buffer.from('{}'), 'application/json'); await expect(page.locator('#message')).toHaveText('Choose a progress export created by Valheim Checkup.'); });
  add('message/storage-unavailable-load', async page => { await A.loadSave(page); await expect(page.locator('#message')).toHaveText('Browser storage is unavailable. Export progress before closing.'); }, { init: A.failingStorage });
  add('message/storage-unavailable-persist', async page => {
    await A.loadSave(page); await allRows(page); await page.locator('#items [data-pin]').first().evaluate(b => b.click());
    await expect(page.locator('#message')).toHaveText('Browser storage is unavailable or full. Export progress to keep your corrections.');
  }, { init: A.failingStorage });
  add('message/forget', async (page, ctx) => {
    await A.loadSave(page);
    page.once('dialog', d => { ctx.dialogs.push(d.message()); d.accept(); });
    await page.locator('#forget').evaluate(b => b.click());
    await expect(page.locator('#message')).toHaveText('Saved progress cleared from this browser.');
  });

  // Insight edge cases with synthetic saves.
  add('insight/highlights-empty', async page => { await A.loadSave(page, fch.fixture({ eat: {} })); await A.selectView(page, 'Highlights'); });
  add('insight/skills-max-and-sandbox-invalid', async page => {
    await A.loadSave(page, fch.fixture({ skills: [{ id: 1, level: 100, xp: 0 }, { id: 102, level: 33.5, xp: 16.5 }] }));
    await A.selectView(page, 'Skills & travel'); await page.locator('#lossDeaths').fill('-1');
  });
  add('insight/skills-old-snapshot', async page => {
    await A.loadSave(page, fch.fixture());
    const old = await A.activeSave(page); delete old.save.discovered.skills;
    await A.setFile(page, '#progressFile', 'p.json', Buffer.from(JSON.stringify(old)), 'application/json');
    await A.selectView(page, 'Skills & travel');
  });
  add('insight/skills-unknown-skill-id', async page => {
    await A.loadSave(page, fch.fixture({ skills: [{ id: 999, level: 10, xp: 1 }] }));
    await A.selectView(page, 'Skills & travel');
  });

  // Phone width: mobile select.
  add('phone/mobile-select', async page => { await A.loadSave(page); }, { viewport: { width: 390, height: 844 } });

  return list;
}

/** Collect visible strings, attributes and option labels. Runs in the page. */
function collectStringsInPage() {
  const norm = s => s.replace(/\s+/g, ' ').trim();
  const visible = el => el.checkVisibility ? el.checkVisibility() : !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const out = { text: new Set(), block: new Set(), title: new Set(), 'aria-label': new Set(), placeholder: new Set(), option: new Set(), 'aria-valuetext': new Set(), alt: new Set() };
  for (const el of document.body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'TEMPLATE'].includes(el.tagName)) continue;
    if (!visible(el) && el.tagName !== 'OPTION') continue;
    let direct = false;
    for (const n of el.childNodes) if (n.nodeType === 3 && norm(n.textContent)) { out.text.add(norm(n.textContent)); direct = true; }
    if (direct && el.innerText) out.block.add(norm(el.innerText));
    for (const a of ['title', 'aria-label', 'placeholder', 'aria-valuetext', 'alt']) if (el.hasAttribute(a) && norm(el.getAttribute(a))) out[a].add(norm(el.getAttribute(a)));
    if (el.tagName === 'OPTION' && el.parentElement && visible(el.closest('select'))) out.option.add(norm(el.label || el.textContent));
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]));
}

const INTERACTIVE = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'spinbutton', 'listbox', 'slider', 'progressbar', 'DisclosureTriangle', 'radio', 'switch', 'tab', 'menuitem', 'dialog']);

/** Controls through the browser's own accessibility tree (role + accessible name), plus DOM ids. */
async function collectControls(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const picked = nodes.filter(n => !n.ignored && n.role && INTERACTIVE.has(n.role.value) && n.backendDOMNodeId);
  const { nodeIds } = await cdp.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: picked.map(n => n.backendDOMNodeId) });
  const out = [];
  for (let k = 0; k < picked.length; k++) {
    const n = picked[k];
    let attrs = {};
    try { const { attributes } = await cdp.send('DOM.getAttributes', { nodeId: nodeIds[k] }); for (let j = 0; j < attributes.length; j += 2) attrs[attributes[j]] = attributes[j + 1]; } catch { }
    const prop = name => n.properties?.find(p => p.name === name)?.value?.value;
    out.push({ role: n.role.value, name: (n.name?.value || '').replace(/\s+/g, ' ').trim(), id: attrs.id, dataCategory: attrs['data-category'], disabled: !!prop('disabled'), draggable: attrs.draggable === 'true' || undefined });
  }
  // Drag targets: draggable rows and the three drop targets.
  const dragTargets = await page.evaluate(() => ({
    draggableRows: document.querySelectorAll('#items tr[draggable="true"]').length,
    dropTargets: ['header', '#dropzone', '#loadTop'].filter(s => document.querySelector(s)),
  }));
  await cdp.detach();
  return { controls: out, dragTargets };
}

module.exports = { states, collectStringsInPage, collectControls, hideToast };
