// wp02.spec.js — WP-02 (icons) acceptance and break attempts, checker-owned.
// Skipped on baseline (no icons there). Prints labels and counts only, never save contents.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { test, expect } = require('@playwright/test');
const A = require('../helpers/app');
const { ROOT } = require('../helpers/target');

test.skip(A.TARGET === 'baseline', 'icons exist only in new builds');

const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'icons', 'icon-map.json'), 'utf8'));
const CAT = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'catalog.json'), 'utf8'));

/** Checker's own expectation for an item id, written independently of lookup.js. */
function expectedIcon(id) {
  let tokens = null;
  if (id.startsWith('The Hunter:')) {
    const order = +id.split(':')[1];
    tokens = CAT.catalog.find(c => c.type === 'killHard').items.find(i => i.order === order).tokens;
  } else {
    for (const c of CAT.catalog) { const i = c.items.find(x => x.id === id); if (i) { tokens = i.tokens; break; } }
  }
  for (const t of tokens || []) { const e = MAP.icons[t]; if (e && 'cell' in e) return { cell: e.cell }; }
  for (const t of tokens || []) { const e = MAP.icons[t]; if (e && 'glyph' in e) return { glyph: e.glyph }; }
  return { glyph: '*' }; // tokenless rows: any collection glyph
}

/** For every visible row: id, number of icons, shown cell (from background-position) or glyph. */
const readRows = page => page.evaluate(({ cols, rows }) => [...document.querySelectorAll('#items tr[data-item]')].map(tr => {
  const icons = tr.querySelectorAll('.vc-icon');
  const el = icons[0];
  const out = { id: tr.dataset.item, n: icons.length, inNameCell: !!el && el.parentElement === tr.querySelector('.item-name')?.parentElement };
  if (el?.classList.contains('vc-icon--cell')) {
    const [px, py] = getComputedStyle(el).backgroundPosition.split(' ').map(parseFloat);
    out.cell = Math.round(py / 100 * (rows - 1)) * cols + Math.round(px / 100 * (cols - 1));
    out.w = el.getBoundingClientRect().width; out.h = el.getBoundingClientRect().height;
    out.bg = getComputedStyle(el).backgroundImage.slice(0, 30);
  } else if (el) out.glyph = el.dataset.glyph;
  return out;
}), { cols: MAP.cols, rows: MAP.rows });

async function showAll(page) {
  await page.locator('#statusFilter').selectOption('all');
}

function compare(rows) {
  const bad = [];
  for (const r of rows) {
    const e = expectedIcon(r.id);
    if (r.n !== 1 || !r.inNameCell) { bad.push(`${r.id}: ${r.n} icons, inNameCell=${r.inNameCell}`); continue; }
    if ('cell' in e && r.cell !== e.cell) bad.push(`${r.id}: shows cell ${r.cell}, expected ${e.cell}`);
    if ('glyph' in e && e.glyph !== '*' && r.glyph !== e.glyph) bad.push(`${r.id}: shows glyph ${r.glyph}, expected ${e.glyph}`);
    if ('glyph' in e && e.glyph === '*' && !r.glyph) bad.push(`${r.id}: tokenless row without glyph`);
  }
  return bad;
}

test.describe('WP-02 icons', () => {
  test('every row in every collection shows exactly one icon, the right one, at 28 px (with save)', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    let total = 0; const bad = []; const sizes = new Set(); const bgs = new Set();
    for (const v of A.COLLECTIONS) {
      await A.selectView(page, v);
      await showAll(page);
      const rows = await readRows(page);
      total += rows.length;
      bad.push(...compare(rows));
      rows.filter(r => r.w).forEach(r => { sizes.add(`${r.w}x${r.h}`); bgs.add(r.bg); });
    }
    console.log('WP02 rows checked', total, 'sizes', [...sizes], 'bg', [...bgs]);
    expect(bad).toEqual([]);
    expect(total).toBe(1353 + 108); // all catalog rows plus The Hunter copy
    expect([...sizes]).toEqual(['28x28']);
    expect([...bgs].every(b => b.startsWith('url("data:image/webp'))).toBe(true);
  });

  test('rows also get icons with no save loaded', async ({ page }) => {
    await A.openApp(page);
    await A.selectView(page, 'The Carpenter');
    await showAll(page);
    const rows = await readRows(page);
    expect(rows.length).toBeGreaterThan(0);
    expect(compare(rows)).toEqual([]);
  });

  test('printed look: sepia 15%, grain mask, no multiply on the dark flat page, aria-hidden, not focusable', async ({ page }) => {
    await A.openApp(page);
    await A.selectView(page, 'The Artisan');
    const s = await page.locator('#items .vc-icon').first().evaluate(el => {
      const cs = getComputedStyle(el);
      return { filter: cs.filter, blend: cs.mixBlendMode, mask: (cs.maskImage || cs.webkitMaskImage).slice(0, 22), hidden: el.getAttribute('aria-hidden'), tab: el.tabIndex, text: el.textContent };
    });
    expect(s).toEqual({ filter: 'sepia(0.15)', blend: 'normal', mask: 'url("data:image/svg+xm', hidden: 'true', tab: -1, text: '' });
    const focusable = await page.evaluate(() => document.querySelectorAll('.vc-icon a, .vc-icon button, .vc-icon [tabindex], img.vc-icon:not([aria-hidden])').length);
    expect(focusable).toBe(0);
  });

  test('Details shows one 64 px icon of the right item; switching items replaces it', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    await A.selectView(page, 'The Master Chef');
    await A.openDetails(page, 'Carrot Soup');
    const first = await page.evaluate(() => {
      const h = document.querySelector('#itemDialog .dialog-heading');
      const el = h.querySelector('.vc-icon');
      return { n: h.querySelectorAll('.vc-icon').length, w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, title: document.getElementById('detailTitle').textContent, bp: getComputedStyle(el).backgroundPosition };
    });
    expect(first.n).toBe(1);
    expect([first.w, first.h]).toEqual([64, 64]);
    expect(first.title).toBe('Carrot Soup');
    await A.closeDetails(page);
    // Rapid open/close of many items: always exactly one icon, matching the open item.
    await A.selectView(page, 'Are You Alright?');
    await showAll(page);
    const ids = await page.evaluate(() => [...document.querySelectorAll('#items tr[data-item]')].map(t => t.dataset.item));
    for (const id of ids.slice(0, 8)) {
      const name = await page.locator(`#items tr[data-item="${id}"] .item-name`).first().textContent();
      await A.openDetails(page, name.trim());
      const g = await page.evaluate(() => [...document.querySelectorAll('#itemDialog .dialog-heading .vc-icon')].map(e => e.dataset.glyph));
      expect(g, id).toEqual([expectedIcon(id).glyph]);
      await A.closeDetails(page);
    }
  });

  test('credit line exact and inside .footer; no hotlink privacy line (0 hotlinks)', async ({ page }) => {
    await A.openApp(page);
    const r = await page.evaluate(() => ({
      credit: document.querySelector('.footer .vc-icon-credit')?.textContent,
      n: document.querySelectorAll('.vc-icon-credit').length,
      note: document.querySelectorAll('.vc-hotlink-note').length,
      help: document.querySelector('details.help').textContent.includes('item icons load from'),
      stats: window.__vc.icons.stats(),
    }));
    expect(r.credit).toBe('Item, piece and creature icons © Iron Gate AB, via the Jötunn documentation (MIT) and the Valheim wiki.');
    expect(r.n).toBe(1);
    expect(r.note).toBe(0);
    expect(r.help).toBe(false);
    expect(r.stats).toMatchObject({ tokens: 1078, cell: 1052, hotlink: 0, glyph: 26, hosts: [] });
    expect(Object.values(MAP.icons).filter(e => 'hotlink' in e)).toEqual([]);
  });

  test('network: zero requests beyond the page itself, through a full session', async ({ page }) => {
    const requests = [];
    page.on('request', r => requests.push(r.url()));
    await A.openApp(page);
    await A.loadSave(page);
    for (const v of A.VIEWS) {
      await A.selectView(page, v);
      if (A.COLLECTIONS.includes(v)) { await showAll(page); await page.locator('#items tr').last().scrollIntoViewIfNeeded().catch(() => {}); }
    }
    await A.selectView(page, 'The Master Chef');
    await A.openDetails(page, 'Carrot Soup');
    await A.closeDetails(page);
    await A.setMode(page, 'raw');
    await page.locator('#search').fill('troll');
    await page.waitForTimeout(400);
    const nonPage = requests.filter(u => !(u.startsWith('file:') && u.includes('valheim-checkup.html')));
    console.log('WP02 total requests', requests.length, 'non-page', nonPage.length);
    expect(nonPage).toEqual([]);
  });

  test('offline: the single file opens with the network off and the atlas decodes', async ({ browser }) => {
    const context = await browser.newContext();
    await context.setOffline(true);
    await context.route(/^https?:/, r => r.abort());
    const page = await context.newPage();
    await A.openApp(page);
    await A.selectView(page, 'The Trophy Collector');
    const img = await page.evaluate(async () => {
      const el = document.querySelector('#items .vc-icon--cell');
      const url = getComputedStyle(el).backgroundImage.slice(5, -2);
      const im = new Image(); im.src = url; await im.decode();
      return { w: im.naturalWidth, h: im.naturalHeight };
    });
    expect(img).toEqual({ w: MAP.cols * 96, h: MAP.rows * 96 });
    await context.close();
  });

  test('site build over http: only same-origin requests (page, js, css, atlas)', async ({ page }) => {
    const dir = path.join(ROOT, 'dist', 'site');
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' };
    const server = http.createServer((req, res) => {
      const p = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
      if (!p.startsWith(dir) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const requests = [];
    page.on('request', r => requests.push(r.url()));
    try {
      await A.openApp(page, { url: origin + '/index.html?mode=flat' });
      await A.selectView(page, 'The Artisan');
      await page.waitForLoadState('networkidle');
      const foreign = requests.filter(u => !u.startsWith(origin) && !u.startsWith('data:'));
      const atlas = requests.filter(u => /atlas.*\.webp/.test(u));
      console.log('WP02 site requests', requests.map(u => u.replace(origin, '')).join(' '));
      expect(foreign).toEqual([]);
      expect(atlas.length).toBe(1);
      const ok = await page.evaluate(() => getComputedStyle(document.querySelector('#items .vc-icon--cell')).backgroundImage);
      expect(ok).toContain('atlas');
    } finally { server.close(); }
  });

  test('break: rapid view switching, search, sort, mode toggles and resize never duplicate or drop icons', async ({ page }) => {
    const errors = await A.openApp(page);
    await A.loadSave(page);
    for (let k = 0; k < 40; k++) {
      const v = A.COLLECTIONS[k % A.COLLECTIONS.length];
      await page.locator(`[data-category="${v.replace(/"/g, '\\"')}"]`).first().evaluate(b => b.click());
      if (k % 5 === 0) await page.setViewportSize({ width: k % 10 ? 800 : 1440, height: 900 });
    }
    await A.expectView(page, A.COLLECTIONS[39 % A.COLLECTIONS.length]);
    await showAll(page);
    for (const q of ['a', 'ab', '', 'troll', 'zz-no-match', '']) await page.locator('#search').fill(q);
    await page.waitForTimeout(400);
    for (const s of await page.locator('#sort option').evaluateAll(o => o.map(x => x.value))) await page.locator('#sort').selectOption(s);
    await A.setMode(page, 'raw'); await A.setMode(page, 'achievement');
    await page.locator('#statusFilter').selectOption('all');
    const rows = await readRows(page);
    expect(rows.length).toBeGreaterThan(0);
    expect(compare(rows)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('break: storage disabled still shows icons and credit', async ({ page }) => {
    const errors = await A.openApp(page, { init: A.failingStorage });
    await A.selectView(page, 'The Gourmet');
    await showAll(page);
    expect(compare(await readRows(page))).toEqual([]);
    expect(await page.locator('.vc-icon-credit').count()).toBe(1);
    expect(errors).toEqual([]);
  });
});
