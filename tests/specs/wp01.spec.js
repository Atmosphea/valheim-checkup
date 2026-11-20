// wp01.spec.js — WP-01 acceptance and break attempts that the P-suite doesn't cover:
// debug API, event bus data, privacy of __vc.events, file:// console cleanliness, breakage.
// Skipped on baseline (no __vc there).
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { test, expect } = require('@playwright/test');
const A = require('../helpers/app');
const fch = require('../helpers/fch');
const { NAME, SAVE } = require('../helpers/private');
const { ROOT } = require('../helpers/target');
const G = require('../golden-values.json');

test.skip(A.TARGET === 'baseline', '__vc and the bus exist only in new builds');

const events = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__vc.events)));
const ofType = (list, type) => list.filter(e => e.type === type);
const hide = page => page.evaluate(() => document.getElementById('toast').classList.add('hidden'));

/** Strings from the save that must never be in __vc.events: name, profile id, fingerprint. */
async function secrets(page) {
  const s = await A.activeSave(page);
  return [NAME, s.save.id, s.save.fingerprint].filter(Boolean);
}
/** Returns labels only (never the secret itself): which secret, in which event types. */
function leaks(list, secretList) {
  const labels = ['name', 'profile id', 'fingerprint'];
  const out = [];
  secretList.forEach((x, i) => {
    const needle = String(x).toLowerCase();
    const types = [...new Set(list.filter(e => JSON.stringify(e).toLowerCase().includes(needle)).map(e => e.type || e.name || '?'))];
    const exact = list.filter(e => JSON.stringify(e).includes(String(x))).length;
    if (types.length) out.push(`${labels[i]} in ${types.join(', ')} (${exact} exact-case hits)`);
  });
  return out;
}

test.describe('WP-01 debug API and event bus', () => {
  // DECISIONS "WP-04 open 1": since WP-04 the automatic choice at 1440x900 is desk, so this test forces ?mode=flat,
  // and the SwiftShader "GPU stall due to ReadPixels" driver warning is allow-listed (warning only).
  test('opens from file:// with ?mode=flat: no console errors, __vc complete, flat mode', async ({ page }) => {
    const consoleErrors = [];
    const allowed = m => m.type() === 'warning' && /GPU stall due to ReadPixels/.test(m.text());
    page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !allowed(m)) consoleErrors.push(m.type() + ': ' + m.text()); });
    await page.clock.setFixedTime(A.FIXED_NOW);
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e)));
    await page.goto(require('node:url').pathToFileURL(path.join(ROOT, 'dist', 'valheim-checkup.html')).href + '?mode=flat');
    await A.loadSave(page);
    for (const v of A.VIEWS) await A.selectView(page, v);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    const api = await page.evaluate(() => ({
      events: Array.isArray(window.__vc.events), state: typeof window.__vc.state, timeScale: typeof window.__vc.timeScale,
      seed: typeof window.__vc.seed, quality: typeof window.__vc.quality, soundLog: Array.isArray(window.__vc.sound?.log),
      bodyClass: document.body.className,
    }));
    expect(api).toEqual({ events: true, state: 'function', timeScale: 'function', seed: 'function', quality: 'function', soundLog: true, bodyClass: 'mode-flat' });
    const st = await page.evaluate(() => window.__vc.state());
    expect(st).toMatchObject({ view: 'Skills & travel', mode: 'achievement', runMode: 'flat', saveLoaded: true, quality: 'flat', cursor: 'native' });
    expect(st.filters).toMatchObject({ status: 'remaining', sort: 'name', starred: false, search: '' });
  });

  // DECISIONS "WP-04 open 1": since WP-04 (DESK_AVAILABLE true) ?mode=desk gives desk.
  test('?mode=desk gives desk since WP-04; ?mode=flat is flat', async ({ page }) => {
    const base = require('node:url').pathToFileURL(path.join(ROOT, 'dist', 'valheim-checkup.html')).href;
    await page.goto(base + '?mode=flat');
    expect(await page.evaluate(() => window.__vc.state().runMode)).toBe('flat');
    await page.goto(base + '?mode=desk');
    expect(await page.evaluate(() => window.__vc.state().runMode)).toBe('desk');
    await expect(page.locator('#desk')).toHaveCount(1);
  });

  test('timeScale, seed and quality behave; quality never changes the run mode', async ({ page }) => {
    await A.openApp(page, { query: '?seed=7' });
    const r = await page.evaluate(async () => {
      const vc = window.__vc, out = {};
      out.initialSeed = vc.seed();
      vc.seed(42); const a = [vc.rng.next(), vc.rng.next()]; vc.seed(42); const b = [vc.rng.next(), vc.rng.next()];
      out.repeatable = JSON.stringify(a) === JSON.stringify(b);
      vc.timeScale(0); const t0 = vc.clock.now(); await new Promise(r => setTimeout(r, 120)); out.paused = vc.clock.now() - t0;
      vc.timeScale(2); const t1 = vc.clock.now(); await new Promise(r => setTimeout(r, 200)); out.double = (vc.clock.now() - t1) / 200;
      vc.timeScale(1);
      try { vc.timeScale(-1); out.negThrows = false; } catch { out.negThrows = true; }
      vc.quality('low'); out.q = vc.state().quality; out.run = vc.state().runMode;
      try { vc.quality('ultra'); out.badThrows = false; } catch { out.badThrows = true; }
      return out;
    });
    expect(r.initialSeed).toBe(7);
    expect(r.repeatable).toBe(true);
    expect(r.paused).toBe(0);
    expect(r.double).toBeGreaterThan(1.8); expect(r.double).toBeLessThan(2.3);
    expect(r.negThrows).toBe(true);
    expect(r.q).toBe('low'); expect(r.run).toBe('flat');
    expect(r.badThrows).toBe(true);
  });

  test('scripted session: app:* events carry the agreed data (DECISIONS 15, 16, 29)', async ({ page }) => {
    await A.openApp(page);
    await A.setFile(page, '#saveFile', 'bad.fch', fch.damaged());
    await A.loadSave(page);
    await A.selectView(page, 'The Carpenter');
    await A.selectView(page, 'The Master Chef');
    await A.setMode(page, 'raw'); await A.setMode(page, 'achievement');
    await page.locator('#statusFilter').selectOption('all');
    await page.locator('#search').pressSequentially('carrot', { delay: 20 });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Star Carrot Soup', exact: true }).evaluate(b => b.click());
    await A.openDetails(page, 'Carrot Soup');
    await page.locator('#favoriteDetail').evaluate(b => b.click());
    await page.keyboard.press('Escape');
    await expect(page.locator('#itemDialog')).not.toHaveAttribute('open', '');
    // The native dialog 'close' event (which app:details-close listens to) is delivered late in headless
    // Chromium, on baseline too; give it frames to arrive.
    await expect.poll(() => page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(window.__vc.events.filter(e => e.type === 'app:details-close').length)))), { timeout: 5000 }).toBe(1);
    await page.locator('[data-remove-favorite="0"]').evaluate(b => b.click());
    const dl = page.waitForEvent('download'); await page.locator('#exportList').evaluate(b => b.click()); await dl;
    const ev = await events(page);
    for (const e of ev) { expect(typeof e.t).toBe('number'); expect(typeof e.wall).toBe('number'); }
    const loads = ofType(ev, 'app:load').map(e => e.data);
    expect(loads[0]).toEqual({ ok: false, error: 'Checksum failed. This file may be incomplete or damaged.' });
    expect(loads[1]).toEqual({ ok: true });
    const iLoad = ev.findIndex(e => e.type === 'app:load' && e.data.ok), iToast = ev.findIndex((e, i) => i > iLoad && e.type === 'app:toast');
    expect(ev[iToast].data).toEqual({ kind: 'loaded', text: 'Loaded {name}. Progress is up to date.' });
    expect(ofType(ev, 'app:category').map(e => e.data)).toEqual([{ title: 'The Carpenter' }, { title: 'The Master Chef' }]);
    const iCarp = ev.findIndex(e => e.type === 'app:category');
    expect(ev[iCarp + 1]).toMatchObject({ type: 'app:toast', data: { kind: 'unverified' } });
    expect(ofType(ev, 'app:mode').map(e => e.data)).toEqual([{ mode: 'raw' }, { mode: 'achievement' }]);
    expect(ofType(ev, 'app:filter').map(e => e.data)).toEqual([{ name: 'status', value: 'all' }, { name: 'search', value: 'carrot' }]);
    expect(ofType(ev, 'app:star').map(e => e.data)).toEqual([{ id: expect.any(String), on: true }]);
    const open = ofType(ev, 'app:details-open').map(e => e.data);
    expect(open).toEqual([{ category: 'The Master Chef', id: expect.any(String) }]);
    expect(ofType(ev, 'app:details-close').map(e => e.data)).toEqual(open);
    expect(ofType(ev, 'app:favorite-add').map(e => e.data)).toEqual(open);
    expect(ofType(ev, 'app:favorite-remove').map(e => e.data)).toEqual(open);
    expect(ofType(ev, 'app:export-list').map(e => e.data)).toEqual([{ view: 'The Master Chef', rows: 1 }]);
    expect(ofType(ev, 'app:render').length).toBeGreaterThan(3);
    // Every type is canonical.
    const types = [...new Set(ev.map(e => e.type))];
    expect(types.every(t => /^(app|fx|bar|gauntlet|spark|coin|paper|tour|sound):/.test(t))).toBe(true);
  });

  test('privacy: __vc.events never holds the name, profile id or fingerprint (Paul\'s save, long session)', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    const sec = await secrets(page);
    for (const v of A.VIEWS) await A.selectView(page, v);
    await A.selectView(page, 'The Master Chef');
    await page.locator('#statusFilter').selectOption('all');
    // The user types the character's name and the profile id into search (worst case for app:filter).
    await page.locator('#search').fill(NAME); await page.waitForTimeout(250);
    await page.locator('#search').fill(`${NAME.toLowerCase()} soup`); await page.waitForTimeout(250);
    await page.locator('#search').fill(sec[1]); await page.waitForTimeout(250);
    await page.locator('#search').fill('');
    await A.openDetails(page, 'Carrot Soup');
    await page.locator('#itemNote').fill(`Note about ${NAME}`);
    await page.locator('#saveNote').evaluate(b => b.click());
    await page.locator('#favoriteDetail').evaluate(b => b.click());
    await A.closeDetails(page);
    // Export and re-import, reload (restore from storage), load again, then forget.
    const dl = page.waitForEvent('download'); await page.locator('#exportProgress').evaluate(b => b.click());
    const exported = fs.readFileSync(await (await dl).path());
    await A.setFile(page, '#progressFile', 'p.json', exported, 'application/json');
    await expect(page.locator('#toast')).toHaveText('Progress restored.');
    let all = await events(page);
    await page.reload();
    await A.loadSave(page);
    page.once('dialog', d => d.accept());
    await page.locator('#forget').evaluate(b => b.click());
    await expect(page.locator('#message')).toHaveText('Saved progress cleared from this browser.');
    await page.locator('#search').fill(NAME); await page.waitForTimeout(250);
    all = all.concat(await events(page));
    expect(all.length).toBeGreaterThan(30);
    console.log('LEAKS ' + JSON.stringify(leaks(all, sec)));
    expect(leaks(all, sec), 'secrets found in __vc.events').toEqual([]);
    expect(JSON.stringify(all)).toContain('{name}');
    expect(leaks(await page.evaluate(() => window.__vc.sound.log), sec)).toEqual([]);
  });

  test('privacy round 2: every secret in odd letter cases, after restore and after Forget', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    const sec = await secrets(page);
    expect(sec.length, 'name, profile id and fingerprint all present').toBe(3);
    const mixed = s => [...s].map((c, i) => (i % 2 ? c.toLowerCase() : c.toUpperCase())).join('');
    const typeAll = async () => {
      for (const s of sec) for (const v of [s.toUpperCase(), mixed(s), `x${s.toLowerCase()}y`]) {
        await page.locator('#search').fill(v); await page.waitForTimeout(200);
      }
      await page.locator('#search').fill(''); await page.waitForTimeout(200);
    };
    await A.selectView(page, 'The Master Chef');
    await typeAll();
    let all = await events(page);
    // Reload: the save is restored from storage, no new load.
    await page.reload();
    await expect(page.locator('#headerProfile strong')).toHaveText(NAME);
    await A.selectView(page, 'The Master Chef');
    await typeAll();
    all = all.concat(await events(page));
    // After Forget: secrets seen this session must still be redacted.
    page.once('dialog', d => d.accept());
    await page.locator('#forget').evaluate(b => b.click());
    await expect(page.locator('#message')).toHaveText('Saved progress cleared from this browser.');
    await typeAll();
    all = all.concat(await events(page));
    expect(ofType(all, 'app:filter').length).toBeGreaterThan(20);
    console.log('LEAKS2 ' + JSON.stringify(leaks(all, sec)));
    expect(leaks(all, sec), 'secrets found in __vc.events').toEqual([]);
    for (const p of ['{name}', '{profile}', '{fingerprint}']) expect(JSON.stringify(all)).toContain(p);
  });

  test('privacy: name typed before any save is loaded, in a fresh session', async ({ page }) => {
    // A fresh page has no known name yet: does a search for the name leak before load?
    await A.openApp(page);
    await page.locator('#search').fill(NAME); await page.waitForTimeout(250);
    const before = await events(page);
    test.info().annotations.push({ type: 'observation', description: `search before load stored: ${JSON.stringify(ofType(before, 'app:filter').map(e => e.data.value === NAME ? '<name>' : '{redacted/other}'))}` });
    // Documented limitation, checked separately in the report: the bus can't know a name it has never seen.
    await expect.poll(async () => ofType(await events(page), 'app:filter').length, { timeout: 3000 }).toBe(1);
  });

  test('ring buffer keeps at most 2,000 events, oldest dropped', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    const r = await page.evaluate(() => {
      const s = document.getElementById('sort');
      for (let i = 0; i < 2600; i++) { s.value = ['name', 'source', 'biome'][i % 3]; s.dispatchEvent(new Event('change')); }
      const ev = window.__vc.events;
      return { n: ev.length, firstIsLoad: ev.some(e => e.type === 'app:load'), monotonic: ev.every((e, i) => !i || e.wall >= ev[i - 1].wall) };
    });
    expect(r.n).toBe(2000);
    expect(r.firstIsLoad).toBe(false);
    expect(r.monotonic).toBe(true);
  });
});

test.describe('WP-01 break attempts', () => {
  test('rapid repeated view selection ends correct, one app:category per selection', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    await page.evaluate(views => { for (let i = 0; i < 130; i++) document.querySelector(`[data-category="${views[i % views.length]}"]`).click(); }, A.VIEWS);
    const last = A.VIEWS[129 % A.VIEWS.length];
    await A.expectView(page, last);
    expect(ofType(await events(page), 'app:category').length).toBe(130);
    await A.selectView(page, 'The Carpenter');
    expect(await A.readMetrics(page)).toEqual({ Completed: '155', Missing: '238', Unverified: '7', Undiscovered: '152' });
  });

  test('rapid repeated loads (5 at once, plus a bad file in between) end in a correct, enabled state', async ({ page }) => {
    const errors = await A.openApp(page);
    const good = fs.readFileSync(SAVE);
    await page.evaluate(({ g, b }) => {
      const mk = (b64, name) => { const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bytes], name)); return dt; };
      const z = document.getElementById('dropzone');
      for (let i = 0; i < 5; i++) z.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: mk(i === 2 ? b : g, 'c.fch') }));
    }, { g: good.toString('base64'), b: fch.damaged().toString('base64') });
    await expect(page.locator('#overallCount')).toHaveText(G.overall.done, { timeout: 15000 });
    await expect(page.locator('#loadTop')).toBeEnabled();
    await expect(page.locator('#loadMain')).toBeEnabled();
    await page.waitForTimeout(500);
    const loads = ofType(await events(page), 'app:load');
    expect(loads.length).toBe(5);
    expect(errors).toEqual([]);
  });

  test('window resize and hidden (frozen) tab during the re-load count animation', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page);
    const old = await A.activeSave(page);
    for (const b of old.save.buckets) { for (const k of ['pickup', 'craft', 'fish', 'eat', 'build']) b[k] = {}; b.enemy = b.enemy.map(() => ({})); b.stats = b.stats.map(() => 0); }
    await A.setFile(page, '#progressFile', 'old.json', Buffer.from(JSON.stringify(old)), 'application/json');
    await A.loadSave(page);
    await page.waitForTimeout(800);
    await page.setViewportSize({ width: 900, height: 700 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await new Promise(r => setTimeout(r, 1500));
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('#overallCount')).toHaveText(G.overall.done, { timeout: 5000 });
    await A.selectView(page, 'The Artisan');
    expect(await A.readMetrics(page)).toEqual({ Completed: '59', Missing: '356', Unverified: '0', Undiscovered: '212' });
  });

  test('4× CPU throttling: load, every view and golden plaque still correct', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const errors = await A.openApp(page);
    await A.loadSave(page);
    for (const c of G.collections) {
      await A.selectView(page, c.title);
      expect((await A.readMetrics(page)).Completed, c.title).toBe(c.completed);
    }
    await expect(page.locator('#overallCount')).toHaveText(G.overall.done);
    expect(errors).toEqual([]);
  });

  test('browser storage fully disabled (localStorage access throws): starts, loads, warns', async ({ page }) => {
    const errors = await A.openApp(page, { init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }); } });
    expect(await page.evaluate(() => window.__vc.state().runMode)).toBe('flat');
    await A.loadSave(page);
    await expect(page.locator('#message')).toHaveText('Browser storage is unavailable. Export progress before closing.');
    await expect(page.locator('#overallCount')).toHaveText(G.overall.done);
    expect(errors).toEqual([]);
  });

  test('odd files: empty .fch, 33 MB .fch, upper-case .FCH, non-.fch with save bytes', async ({ page }) => {
    const errors = await A.openApp(page);
    await A.setFile(page, '#saveFile', 'empty.fch', Buffer.alloc(0));
    await expect(page.locator('#message')).toHaveText('Choose a valid .fch character save (up to 32 MB).');
    await A.setFile(page, '#saveFile', 'huge.fch', Buffer.alloc(33 * 1024 * 1024, 1));
    await expect(page.locator('#message')).toHaveText('Choose a valid .fch character save (up to 32 MB).');
    await A.setFile(page, '#saveFile', 'save.bin', fs.readFileSync(SAVE));
    await expect(page.locator('#message')).toHaveText('Choose a .fch character file.');
    await A.setFile(page, '#saveFile', 'CHARACTERS.FCH', fs.readFileSync(SAVE));
    await expect(page.locator('#toast')).toContainText('Progress is up to date.');
    const loads = ofType(await events(page), 'app:load').map(e => e.data.ok);
    expect(loads).toEqual([false, false, false, true]);
    expect(errors).toEqual([]);
  });

  test('dist/site served over HTTP loads the save with no errors', async ({ page }) => {
    const root = path.join(ROOT, 'dist', 'site');
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
    const server = http.createServer((req, res) => {
      const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
      if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
      const errors = await A.openApp(page, { url: `http://127.0.0.1:${server.address().port}/` });
      await A.loadSave(page);
      await expect(page.locator('#overallCount')).toHaveText(G.overall.done);
      expect(await page.evaluate(() => typeof window.__vc.state)).toBe('function');
      expect(errors).toEqual([]);
    } finally { server.close(); }
  });
});
