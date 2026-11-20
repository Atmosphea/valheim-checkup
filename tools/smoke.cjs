// Builder self-check for WP-01 (not a checker test). Run after the builds:
//   npm run build:single && npm run build:site && node tools/smoke.cjs
// Uses the Playwright + Chromium that the checker installed in tests/node_modules.
// Prints numbers and event types only; never the character name or save contents.
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const { SAVE, NAME } = require(path.join(ROOT, 'tests', 'helpers', 'private'));

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

/** Collect console errors and page errors. */
function watch(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  return errors;
}

async function session(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'UTC', acceptDownloads: true });
  const page = await context.newPage();
  const errors = watch(page);
  // Opened exactly like a double-click: file:// and no query string.
  await page.goto(pathToFileURL(path.join(ROOT, 'dist', 'valheim-checkup.html')).href);
  await page.waitForSelector('#categories [data-category]');

  const api = await page.evaluate(() => ({
    keys: Object.keys(window.__vc).sort(),
    eventsIsArray: Array.isArray(window.__vc.events),
    soundLog: Array.isArray(window.__vc.sound.log),
    state: window.__vc.state(),
    bodyClass: document.body.className,
  }));
  check('__vc has events, state, timeScale, seed, quality, sound.log', ['events', 'state', 'timeScale', 'seed', 'quality', 'sound'].every(k => api.keys.includes(k)) && api.eventsIsArray && api.soundLog);
  check('state() before a save', api.state.view === 'The Master Chef' && api.state.mode === 'achievement' && api.state.runMode === 'flat' && api.state.saveLoaded === false && api.state.quality === 'flat' && api.state.cursor === 'native' && api.state.filters.status === 'remaining', JSON.stringify(api.state));
  check('body gets mode-flat', api.bodyClass.includes('mode-flat'));

  // Scripted session.
  await page.locator('#saveFile').setInputFiles(SAVE);
  await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Progress is up to date.'));
  await page.locator('[data-category="The Carpenter"]').evaluate(b => b.click());
  await page.locator('#items [data-details]').first().evaluate(b => b.click());
  await page.waitForSelector('#itemDialog[open]');
  await page.locator('#closeDetails').evaluate(b => b.click());
  await page.locator('#recordMode').selectOption('raw');
  await page.locator('#statusFilter').selectOption('all');
  await page.locator('#search').pressSequentially('wood', { delay: 20 });
  await page.waitForTimeout(300);
  await page.locator('#items [data-pin]').first().evaluate(b => b.click());
  await page.locator('#items [data-details]').first().evaluate(b => b.click());
  await page.locator('#favoriteDetail').evaluate(b => b.click());
  await page.keyboard.press('Escape');
  await page.locator('[data-remove-favorite="0"]').evaluate(b => b.click());
  await page.locator('#saveFile').setInputFiles({ name: 'broken.fch', mimeType: 'application/octet-stream', buffer: Buffer.from('nope') });
  await page.waitForFunction(() => document.getElementById('message').classList.contains('error'));
  await page.locator('#saveFile').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });

  const ev = await page.evaluate(() => window.__vc.events.map(e => ({ type: e.type, data: e.data, t: e.t, wall: e.wall })));
  const of = type => ev.filter(e => e.type === type);
  const loads = of('app:load');
  check('app:load {ok:true} on success', loads[0]?.data.ok === true && Object.keys(loads[0].data).length === 1);
  check('app:load {ok:false, error} on parser failure and on a non-.fch file', loads.length === 3 && loads[1].data.ok === false && typeof loads[1].data.error === 'string' && loads[2].data.error === 'Choose a .fch character file.', `errors: ${loads.slice(1).map(l => JSON.stringify(l.data.error)).join(', ')}`);
  check('app:category {title}', of('app:category').length === 1 && of('app:category')[0].data.title === 'The Carpenter');
  const opens = of('app:details-open');
  check('app:details-open {category, id}', opens.length === 2 && opens[0].data.category === 'The Carpenter' && typeof opens[0].data.id === 'string');
  check('app:details-close on the × button and on Escape', of('app:details-close').length === 2);
  const toasts = of('app:toast');
  check('app:toast {text}: load, unverified, lifetime, favorite', toasts.length >= 4 && toasts[0].data.text.startsWith('Loaded ') && toasts.some(t => t.data.text.startsWith('This name has no reliable')) && toasts.some(t => t.data.text.startsWith('Lifetime actions')) && toasts.some(t => t.data.text === 'Count added to header.'), `${toasts.length} toasts`);
  const loadedToast = toasts.find(t => t.data.kind === 'loaded');
  check('load toast stored as {kind, text} with the name redacted', loadedToast && loadedToast.data.text === 'Loaded {name}. Progress is up to date.' && Object.keys(loadedToast.data).sort().join() === 'kind,text');
  check('no event anywhere contains the character name', !JSON.stringify(ev).includes(NAME));
  check('the visible toast itself is unchanged (still shows the name)', (await page.locator('#toast').textContent()).length > 0 && await page.evaluate(n => document.getElementById('headerProfile').textContent.includes(n), NAME));
  check('app:mode {mode}', of('app:mode').length === 1 && of('app:mode')[0].data.mode === 'raw');
  const filters = of('app:filter');
  check('app:filter {name, value}; search debounced to one event', filters.some(f => f.data.name === 'status' && f.data.value === 'all') && filters.filter(f => f.data.name === 'search').length === 1 && filters.find(f => f.data.name === 'search').data.value === 'wood', JSON.stringify(filters.map(f => f.data)));
  check('app:star {id, on}', of('app:star').length === 1 && of('app:star')[0].data.on === true);
  check('app:favorite-add / app:favorite-remove {category, id}', of('app:favorite-add').length === 1 && of('app:favorite-remove').length === 1 && of('app:favorite-remove')[0].data.id === of('app:favorite-add')[0].data.id);
  check('app:render {view}', of('app:render').length >= 3 && of('app:render').at(-1).data.view === 'The Carpenter');
  check('order: app:load before its toast; category before unverified toast', ev.findIndex(e => e.type === 'app:load') < ev.findIndex(e => e.type === 'app:toast') && ev.findIndex(e => e.type === 'app:category') < ev.findIndex(e => e.type === 'app:toast' && e.data.text.startsWith('This name')));
  check('entries carry t (scaled) and wall', ev.every(e => Number.isFinite(e.t) && Number.isFinite(e.wall)));

  // Debug controls.
  const ctl = await page.evaluate(() => {
    const vc = window.__vc;
    const a = vc.seed(42), x1 = vc.rng.next(); vc.seed(42); const x2 = vc.rng.next();
    vc.timeScale(0); const t1 = vc.clock.now(); const until = performance.now() + 30; while (performance.now() < until); const t2 = vc.clock.now(); vc.timeScale(1);
    const q = vc.quality('low'), qs = vc.state().quality; vc.quality('flat');
    let bad = false; try { vc.quality('ultra'); } catch { bad = true; }
    return { a, same: x1 === x2, paused: t1 === t2, q, qs, bad, mode: vc.state().runMode };
  });
  check('seed(n) repeats the sequence', ctl.a === 42 && ctl.same);
  check('timeScale(0) pauses the central clock', ctl.paused);
  check('quality(tier) sets and validates; never changes the run mode', ctl.q === 'low' && ctl.qs === 'low' && ctl.bad && ctl.mode === 'flat');
  const saved = await page.evaluate(() => window.__vc.state());
  check('state() after the session', saved.saveLoaded === true && saved.view === 'The Carpenter' && saved.mode === 'raw' && saved.filters.search === 'wood' && saved.filters.status === 'all');

  check('no console errors from file:// with the save loaded', errors.length === 0, errors.join(' | '));
  await context.close();
}

async function seededAndForced(browser) {
  const page = await browser.newPage();
  const errors = watch(page);
  const url = pathToFileURL(path.join(ROOT, 'dist', 'valheim-checkup.html')).href;
  await page.goto(url + '?seed=7&mode=desk');
  await page.waitForSelector('#categories [data-category]');
  const r = await page.evaluate(() => ({ seed: window.__vc.seed(), mode: window.__vc.state().runMode }));
  check('?seed=7 fixes the seed', r.seed === 7);
  check('?mode=desk stays flat until WP-04 (no desk yet)', r.mode === 'flat');
  check('no errors with query flags', errors.length === 0, errors.join(' | '));
  await page.close();
}

async function site(browser) {
  const dir = path.join(ROOT, 'dist', 'site');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    const file = path.join(dir, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(dir) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const page = await browser.newPage();
  const errors = watch(page);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForSelector('#categories [data-category]');
  const n = await page.locator('#categories [data-category]').count();
  await page.locator('#saveFile').setInputFiles(SAVE);
  await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Progress is up to date.'));
  check('dist/site/ serves, renders 11 collections and loads the save', n === 11);
  check('dist/site/ has no console errors', errors.length === 0, errors.join(' | '));
  await page.close();
  server.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    await session(browser);
    await seededAndForced(browser);
    await site(browser);
  } finally { await browser.close(); }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
