// Builder self-check for WP-03 (not a checker test). Run after the builds:
//   npm run build:all && node tools/wp03-check.cjs
// Uses the Playwright + Chromium the checker installed in tests/node_modules (read-only) and
// axe-core from the root devDependencies. Loads only the synthetic "Fixture" save from
// tests/helpers/fch.js, never Paul's save. Prints check names and numbers only.
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const { fixture } = require(path.join(ROOT, 'tests', 'helpers', 'fch'));
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const URL = pathToFileURL(path.join(ROOT, 'dist', 'valheim-checkup.html')).href + '?mode=flat';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const UAS = {
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};
const PATHS = {
  windows: ['%USERPROFILE%\\AppData\\LocalLow\\IronGate\\Valheim\\characters_local'],
  mac: ['~/Library/Application Support/IronGate/Valheim/characters_local', '~/Library/Application Support/IronGate/Valheim/characters', '~/Library/Application Support/com.coffeestain.Valheim'],
  linux: ['~/.config/unity3d/IronGate/Valheim/characters_local', '~/.local/share/Steam/steamapps/compatdata/892970/pfx/drive_c/users/steamuser/AppData/LocalLow/IronGate/Valheim/characters_local', '~/.var/app/com.valvesoftware.Steam/.config/unity3d/IronGate/Valheim/characters_local'],
};
const NAME = 'How to find your save and use Valheim Checkup';

async function newPage(browser, opts = {}) {
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'UTC', userAgent: opts.ua, reducedMotion: opts.reducedMotion });
  const page = await context.newPage();
  // file:// pages can't be granted clipboard permission, so record what the page writes.
  if (opts.clipboard) await page.addInitScript(() => { window.__clip = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__clip = t; return Promise.resolve(); } } }); });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForSelector('#categories [data-category]', { state: 'attached' });
  return { context, page, errors };
}
const howTo = page => page.getByRole('button', { name: NAME, exact: true });
const activeInfo = page => page.evaluate(() => { const a = document.activeElement; return { id: a?.id, role: a?.getAttribute('role'), step: a?.dataset?.step, cls: a?.className }; });
const events = (page, type) => page.evaluate(t => window.__vc.events.filter(e => e.type === t).map(e => e.data), type);
async function axe(page, label) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => { const out = await window.axe.run(document, { resultTypes: ['violations'] }); return out.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, targets: v.nodes.slice(0, 3).map(x => x.target.join(' ')) })); });
  check(`axe: no violations (${label})`, r.length === 0, r.length ? JSON.stringify(r) : '0 violations');
  return r;
}

async function run() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  // 1. Placement: immediately left of Load character.
  {
    const { context, page, errors } = await newPage(browser);
    const info = await page.evaluate(() => {
      const h = document.getElementById('howTo'), l = document.getElementById('loadTop');
      const a = h.getBoundingClientRect(), b = l.getBoundingClientRect();
      return { next: h.nextElementSibling?.id, gap: Math.round(b.left - a.right), sameRow: a.top < b.bottom && b.top < a.bottom, label: h.textContent.trim(), anchor: h.hasAttribute('data-tour-anchor'),
        order: [...document.querySelector('.top-actions').children].map(c => c.id) };
    });
    check('How-to sits immediately left of #loadTop (DOM next sibling, same row, gap ≤ 12 px)', info.next === 'loadTop' && info.sameRow && info.gap >= 0 && info.gap <= 12, `gap ${info.gap}px, order ${info.order.join(',')}`);
    check('How-to label "How to", accessible name and data-tour-anchor', info.label === 'How to' && info.anchor && (await howTo(page).count()) === 1);
    check('flat header order Import, Export, How to, Load (DECISIONS WP-03 open 1)', info.order.join(',') === 'importProgress,exportProgress,howTo,loadTop');
    // 390 px phone width: still left of Load and on screen.
    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await page.evaluate(() => { const a = document.getElementById('howTo').getBoundingClientRect(), b = document.getElementById('loadTop').getBoundingClientRect(); return { ok: a.right <= b.left + 1 && a.left >= 0 && b.right <= innerWidth && a.top < b.bottom && b.top < a.bottom, a: [a.left, a.top, a.right, a.bottom].map(Math.round), b: [b.left, b.top, b.right, b.bottom].map(Math.round), sw: document.documentElement.scrollWidth }; });
    check('390 px: How-to left of Load on the same row, both on screen, no sideways scroll', phone.ok && phone.sw <= 390, JSON.stringify(phone));
    check('no console or page errors (placement session)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // 2. Preselected tab per user agent; Copy copies the exact path; toast.
  for (const [platform, ua] of Object.entries(UAS)) {
    const { context, page } = await newPage(browser, { ua, clipboard: true });
    await howTo(page).click();
    const sel = await page.evaluate(() => document.querySelector('#howToPopup [role="tab"][aria-selected="true"]')?.dataset.platform);
    check(`${platform} user agent preselects the ${platform} tab`, sel === platform, `selected ${sel}`);
    const copies = page.locator(`#howToPanel-${platform} .vc-copy`);
    const n = await copies.count();
    let allOk = n === PATHS[platform].length;
    for (let i = 0; i < n; i++) {
      await page.evaluate(() => { window.__clip = null; document.getElementById('toast').textContent = ''; });
      await copies.nth(i).click();
      await page.waitForFunction(() => document.getElementById('toast').textContent === 'Path copied.', null, { timeout: 5000 });
      const got = await page.evaluate(() => window.__clip);
      if (got !== PATHS[platform][i]) { allOk = false; console.log('   mismatch', i); }
      const toastOk = await page.evaluate(() => !document.getElementById('toast').classList.contains('hidden') && getComputedStyle(document.getElementById('toast')).zIndex === '1100');
      if (!toastOk) allOk = false;
    }
    check(`${platform}: every Copy button copies its exact path (${n} rows) and shows "Path copied." above the popup`, allOk);
    await context.close();
  }
  // Fallback copy path (Clipboard API refused).
  {
    const { context, page } = await newPage(browser);
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('no')) } }); });
    let copied = null;
    await page.exposeFunction('__copied', t => { copied = t; });
    await page.evaluate(() => document.addEventListener('copy', () => window.__copied(document.activeElement?.value ?? getSelection().toString())));
    await howTo(page).click();
    await page.locator('#howToTab-windows').click();
    await page.locator('#howToPanel-windows .vc-copy').click();
    await page.waitForFunction(() => /^(Path copied\.|Copy did not work)/.test(document.getElementById('toast').textContent));
    const t = await page.evaluate(() => document.getElementById('toast').textContent);
    check('fallback copy (no Clipboard API) still copies the exact path', t === 'Path copied.' && copied === PATHS.windows[0], `toast "${t}"`);
    const kinds = await events(page, 'app:toast');
    check('toast event recorded as {kind: "path-copied"}', kinds.some(k => k.kind === 'path-copied'));
    await context.close();
  }

  // 3. Popup: content, Escape, outside click, focus trap, focus return; axe.
  {
    const { context, page, errors } = await newPage(browser, { ua: UAS.mac });
    await howTo(page).focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#howToPopup:not([hidden])');
    const content = await page.evaluate(() => {
      const p = document.querySelector('#howToPopup [role="dialog"]');
      return { title: document.getElementById('howToTitle').textContent, tabs: [...p.querySelectorAll('[role="tab"]')].map(t => t.textContent), text: p.textContent,
        steam: p.querySelector('.vc-howto-steam')?.textContent, link: p.querySelector('.vc-howto-steam a')?.href, modal: p.getAttribute('aria-modal'),
        inert: document.querySelector('header').inert && document.querySelector('.layout').inert };
    });
    check('popup title, 3 tabs Windows/macOS/Linux', content.title === 'Find your Valheim character' && content.tabs.join('|') === 'Windows|macOS|Linux');
    check('popup has the .fch sentence and the Steam Cloud sentence with its link', content.text.includes("Choose your character's .fch file. Pick a recent one, not a world .db file or a backup.") && content.steam === 'Steam Cloud saves can be downloaded from Steam’s Valheim cloud files.' && /remotestorageapp\/\?appid=892970/.test(content.link), content.steam);
    check('popup is modal: aria-modal, page behind inert', content.modal === 'true' && content.inert);
    check('keyboard: Enter on How-to opens, focus on the selected tab', (await activeInfo(page)).role === 'tab');
    await axe(page, 'popup open, macOS tab');
    // Arrow keys switch tabs.
    await page.keyboard.press('ArrowRight');
    check('ArrowRight on the tabs selects Linux', await page.evaluate(() => document.activeElement.dataset.platform === 'linux' && !document.getElementById('howToPanel-linux').hidden));
    await axe(page, 'popup open, Linux tab');
    // Focus trap: 30 Tabs never leave the popup.
    let escaped = false;
    for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => !!document.activeElement.closest('#howToPopup')))) escaped = true; }
    for (let i = 0; i < 10; i++) { await page.keyboard.press('Shift+Tab'); if (!(await page.evaluate(() => !!document.activeElement.closest('#howToPopup')))) escaped = true; }
    check('focus is trapped inside the popup (Tab ×30, Shift-Tab ×10)', !escaped);
    await page.keyboard.press('Escape');
    check('Escape closes the popup and focus returns to How-to', await page.evaluate(() => document.getElementById('howToPopup').hidden && document.activeElement.id === 'howTo' && !document.querySelector('header').inert));
    // Outside click.
    await howTo(page).click();
    await page.mouse.click(10, 890);
    check('click outside closes and returns focus', await page.evaluate(() => document.getElementById('howToPopup').hidden && document.activeElement.id === 'howTo'));
    // Inside click doesn't close.
    await howTo(page).click();
    await page.locator('#howToTitle').click();
    check('click inside the paper keeps it open', await page.evaluate(() => !document.getElementById('howToPopup').hidden));
    await page.locator('#closeHowTo').click();
    check('× closes and returns focus', await page.evaluate(() => document.getElementById('howToPopup').hidden && document.activeElement.id === 'howTo'));
    check('no console or page errors (popup session)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // 4. Tour: keyboard-only, steps, text, no Done/Finish/Skip, swallowed clicks, Escape at 1/2/3, axe.
  for (const withSave of [false, true]) {
    const { context, page, errors } = await newPage(browser);
    if (withSave) {
      await page.locator('#saveFile').setInputFiles({ name: 'characters_fixture.fch', mimeType: 'application/octet-stream', buffer: fixture() });
      await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast').textContent));
    }
    const tag = withSave ? 'save loaded' : 'no save';
    // Keyboard only: Tab from the top to How-to.
    await page.locator('body').focus();
    let n = 0;
    while (n < 10 && (await activeInfo(page)).id !== 'howTo') { await page.keyboard.press('Tab'); n++; }
    check(`[${tag}] Tab reaches How-to after Import and Export (${n} presses)`, (await activeInfo(page)).id === 'howTo' && n === (withSave ? 3 : 2));
    await page.keyboard.press('Enter');
    // Tab to "Show me around" and press Space.
    for (let i = 0; i < 20 && (await activeInfo(page)).id !== 'showMeAround'; i++) await page.keyboard.press('Tab');
    await page.keyboard.press(' ');
    await page.waitForSelector('.vc-slip[data-step="1"]');
    let a = await activeInfo(page);
    check(`[${tag}] Space on "Show me around" starts the tour; focus in step 1 slip (role=dialog)`, a.step === '1' && a.role === 'dialog');
    const slip = async () => {
      // Wait for the 300 ms step glide to settle: the cut-out stops moving.
      let prev = '', now = '';
      for (let k = 0; k < 40; k++) { await page.waitForTimeout(100); now = await page.evaluate(() => JSON.stringify(document.querySelector('.vc-tour-hole').getBoundingClientRect())); if (now === prev) break; prev = now; }
      return page.evaluate(() => {
      const s = document.querySelector('.vc-slip');
      const r = s.getBoundingClientRect(), h = document.querySelector('.vc-tour-hole').getBoundingClientRect();
      const t = [...document.querySelectorAll(`[data-tour="${s.dataset.target}"]`)].filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect());
      const onScreen = r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      const overlapTarget = t.some(b => !(r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom)) && s.dataset.side !== 'inside';
      // The cut-out holds the on-screen top of the target (tall targets are cut off at the bottom).
      const holeCovers = t.length ? t.some(b => Math.max(b.left, 0) >= h.left - 1 && Math.min(b.right, innerWidth) <= h.right + 1 && Math.max(b.top, 0) >= h.top - 1 && Math.max(b.top, 0) < h.bottom) : true;
      const buttons = [...document.querySelectorAll('button, [role="button"]')].filter(b => !b.closest('[inert]') && b.getClientRects().length).map(b => (b.getAttribute('aria-label') || b.textContent).trim());
      return { step: s.dataset.step, side: s.dataset.side, title: s.querySelector('h2').textContent, text: s.querySelector('.vc-slip-text').textContent, onScreen, overlapTarget, holeCovers, buttons, dim: getComputedStyle(document.querySelector('.vc-tour-hole')).boxShadow };
    }); };
    const want = [
      ['Load your Viking', "Click the Load character button, or drop a recent .fch file anywhere on the page. It's read in your browser and never uploaded."],
      ['Choose a collection', 'Pick a collection from the list.'],
      ['Read your progress', 'Completed, Missing, Unverified and Undiscovered show where you stand. Filter or search the list, and open Details to compare records, add a note or correct an item.'],
    ];
    for (let s = 1; s <= 3; s++) {
      const info = await slip();
      check(`[${tag}] step ${s}: title and flat text`, info.title === want[s - 1][0] && info.text === want[s - 1][1]);
      check(`[${tag}] step ${s}: slip on screen, beside the target (${info.side}), cut-out over the target, page dimmed to 35%`, info.onScreen && !info.overlapTarget && info.holeCovers && /0\.65\)/.test(info.dim), JSON.stringify({ side: info.side, onScreen: info.onScreen, overlap: info.overlapTarget, hole: info.holeCovers }));
      check(`[${tag}] step ${s}: no Done, Finish or Skip button; no live button at all outside inert`, !info.buttons.some(b => /^(done|finish|skip)$/i.test(b)) && info.buttons.length === 0, JSON.stringify(info.buttons));
      check(`[${tag}] step ${s}: focus inside the slip`, (await activeInfo(page)).step === String(s));
      await axe(page, `${tag}, tour step ${s}`);
      if (s < 3) await page.keyboard.press(s === 1 ? 'ArrowRight' : 'Enter');
    }
    // Back with ←, forward with Space, then end with Enter on step 3.
    await page.keyboard.press('ArrowLeft');
    check(`[${tag}] ← goes back to step 2`, (await activeInfo(page)).step === '2');
    await page.keyboard.press(' ');
    await page.keyboard.press('Enter');
    a = await activeInfo(page);
    check(`[${tag}] Enter on step 3 ends; focus back on How-to; no tour layer left`, a.id === 'howTo' && (await page.locator('.vc-tour').count()) === 0 && !(await page.evaluate(() => document.querySelector('header').inert)));
    const steps = await events(page, 'tour:step'), ends = await events(page, 'tour:end'), starts = await events(page, 'tour:start');
    check(`[${tag}] events tour:start, tour:step ×5 (1,2,3,2,3), tour:end {step 3, key}`, starts.length === 1 && steps.map(s => s.step).join('') === '12323' && ends.length === 1 && ends[0].step === 3 && ends[0].reason === 'key');
    check(`[${tag}] no console or page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // 5. Mouse: clicks advance and never reach controls underneath; click on step 3 ends; Escape from 1, 2, 3.
  {
    const { context, page, errors } = await newPage(browser);
    await page.evaluate(() => {
      window.__hits = 0;
      for (const el of document.querySelectorAll('button, a, select, input, summary, [data-category]')) for (const t of ['click', 'pointerdown', 'mousedown']) el.addEventListener(t, () => { window.__hits++; });
    });
    await page.evaluate(() => window.__vc.tour.start());
    const before = await page.evaluate(() => ({ view: window.__vc.state().view, hits: window.__hits }));
    // Click right on top of real controls: Load, a collection, a filter, a link.
    const spots = await page.evaluate(() => ['#loadTop', '#categories [data-category="The Carpenter"]', '#statusFilter'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));
    await page.mouse.click(spots[0][0], spots[0][1]);
    check('mouse click on Load (step 1) advances to step 2', (await activeInfo(page)).step === '2');
    await page.mouse.click(spots[1][0], spots[1][1]);
    check('click on The Carpenter (step 2) advances to step 3', (await activeInfo(page)).step === '3');
    await page.mouse.click(spots[2][0], spots[2][1]);
    const after = await page.evaluate(() => ({ view: window.__vc.state().view, hits: window.__hits, chooser: 0 }));
    check('click on step 3 ends the tour', (await page.locator('.vc-tour').count()) === 0 && (await activeInfo(page)).id === 'howTo');
    check('clicks never reached the controls underneath (0 events, view unchanged, no file chooser)', after.hits === before.hits && after.view === before.view, `hits ${after.hits - before.hits}`);
    const ends = await events(page, 'tour:end');
    check('tour:end {step 3, reason click}', ends.at(-1)?.step === 3 && ends.at(-1)?.reason === 'click');
    // Right click and double click also swallowed.
    await page.evaluate(() => window.__vc.tour.start());
    await page.mouse.dblclick(spots[1][0], spots[1][1]);
    check('a double click advances twice (step 3) and reaches nothing underneath', (await activeInfo(page)).step === '3' && (await page.evaluate(() => window.__hits)) === after.hits);
    await page.keyboard.press('Escape');
    for (const s of [1, 2, 3]) {
      await page.evaluate(() => window.__vc.tour.start());
      for (let i = 1; i < s; i++) await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Escape');
      const e = (await events(page, 'tour:end')).at(-1);
      check(`Escape ends the tour from step ${s}; focus on How-to`, (await page.locator('.vc-tour').count()) === 0 && e.step === s && e.reason === 'escape' && (await activeInfo(page)).id === 'howTo');
    }
    check('no console or page errors (mouse session)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // 6. Phone width (390 × 844): board target is the mobile select; slips stay on screen.
  {
    const { context, page, errors } = await newPage(browser, { viewport: { width: 390, height: 844 } });
    await page.evaluate(() => window.__vc.tour.start());
    let ok = true; const sides = [];
    for (let s = 1; s <= 3; s++) {
      const r = await page.evaluate(() => { const b = document.querySelector('.vc-slip').getBoundingClientRect(); return { on: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, side: document.querySelector('.vc-slip').dataset.side }; });
      ok = ok && r.on; sides.push(r.side);
      if (s < 3) await page.keyboard.press('ArrowRight');
    }
    check('390 px: every slip fully on screen', ok, sides.join(','));
    await page.keyboard.press('Escape');
    check('no console or page errors (phone)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // 7. Reduced motion: still works, no transitions.
  {
    const { context, page } = await newPage(browser, { reducedMotion: 'reduce' });
    await page.evaluate(() => window.__vc.tour.start());
    const tr = await page.evaluate(() => getComputedStyle(document.querySelector('.vc-tour-hole')).transitionDuration);
    check('reduced motion: tour works with no cut-out glide', /^0s/.test(tr), tr);
    await context.close();
  }

  // 8. Round 2 fixes 2–4.
  {
    const { context, page, errors } = await newPage(browser, { clipboard: true });
    await howTo(page).click();
    await page.keyboard.press('Tab');
    const t1 = await page.evaluate(() => document.activeElement.textContent);
    await page.keyboard.press('Shift+Tab');
    const t2 = await page.evaluate(() => document.activeElement.getAttribute('role'));
    await page.keyboard.press('Shift+Tab');
    const t3 = await page.evaluate(() => document.activeElement.id);
    check('fix 2: Tab from the selected tab → first Copy; Shift-Tab back → selected tab; again → × (one Tab stop for the tab list)', /^Copy path for/.test(t1) && t2 === 'tab' && t3 === 'closeHowTo', `${t1} | ${t2} | ${t3}`);
    // Fix 3: copy, start the tour, click the toast.
    await page.locator('.vc-copy:visible').first().click();
    await page.locator('#showMeAround').click();
    const tb = await page.locator('#toast').boundingBox();
    const topAtToast = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className, [tb.x + tb.width / 2, tb.y + tb.height / 2]);
    await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
    check('fix 3: a click on the toast during the tour advances (toast still visible)', (await page.evaluate(() => window.__vc.tour.step())) === 2 && await page.locator('#toast').isVisible(), `elementFromPoint ${topAtToast}`);
    // Fix 4: resize mid-tour and mid-glide; the slip is on screen in the very next frames.
    let worst = 0; const sizes = [[1024, 768], [800, 600], [390, 844], [1920, 1080], [600, 400], [1440, 900]];
    for (const step of [2, 3]) {
      if (step === 3) await page.keyboard.press('ArrowRight');
      for (const [w, h] of sizes) {
        await page.waitForTimeout(100); // inside a step glide (300 ms) as well
        await page.setViewportSize({ width: w, height: h });
        for (let f = 0; f < 6; f++) {
          const out = await page.evaluate(() => new Promise(r => requestAnimationFrame(() => { const b = document.querySelector('.vc-slip').getBoundingClientRect(); r(Math.max(0, -b.left, -b.top, b.right - innerWidth, b.bottom - innerHeight)); })));
          worst = Math.max(worst, out);
        }
      }
    }
    check('fix 4: after resizes (also mid-glide) the slip is never off-screen in the following frames', worst <= 0.5, `worst ${worst.toFixed(1)} px off`);
    const tr = await page.evaluate(() => { document.querySelector('.vc-tour').classList.remove('vc-tour--snap'); return getComputedStyle(document.querySelector('.vc-slip')).transitionDuration; });
    check('fix 4: step changes still glide (300 ms)', /0\.3s/.test(tr), tr);
    await page.keyboard.press('Escape');
    check('no console or page errors (round 2 session)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length} / ${results.length} passed`);
  process.exitCode = failed.length ? 1 : 0;
}

run().catch(e => { console.error(e); process.exitCode = 1; });
