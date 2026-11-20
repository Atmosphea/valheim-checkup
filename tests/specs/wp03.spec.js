// wp03.spec.js — WP-03 (How-to popup and tour) acceptance and break attempts, checker-owned.
// Skipped on baseline. Uses no save or the synthetic "Fixture" save only. Never prints save contents.
// Expected strings are typed here from spec/wp-03-tutorial.md and DECISIONS (not imported from src/strings.js).
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { test, expect } = require('@playwright/test');
const A = require('../helpers/app');
const { fixture } = require('../helpers/fch');
const { ROOT } = require('../helpers/target');

test.skip(A.TARGET === 'baseline', 'WP-03 exists only in new builds');
test.skip(A.TARGET === 'desk', 'desk tour arrives with WP-06/WP-11');

const SHOTS = path.join(ROOT, 'checker-reports', 'screens', 'wp-03');
fs.mkdirSync(SHOTS, { recursive: true });
const AXE = fs.readFileSync(path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

const NAME = 'How to find your save and use Valheim Checkup';
const PATHS = {
  windows: [['Windows', '%USERPROFILE%\\AppData\\LocalLow\\IronGate\\Valheim\\characters_local', 'Paste into the File Explorer address bar and press Enter.']],
  mac: [
    ['macOS', '~/Library/Application Support/IronGate/Valheim/characters_local', 'In Finder choose Go → Go to Folder (Shift-Command-G) and paste.'],
    ['macOS, older or cloud saves', '~/Library/Application Support/IronGate/Valheim/characters', 'In Finder choose Go → Go to Folder (Shift-Command-G) and paste.'],
    ['macOS, if that folder is missing', '~/Library/Application Support/com.coffeestain.Valheim', 'Same; look for a characters_local folder inside.'],
  ],
  linux: [
    ['Linux', '~/.config/unity3d/IronGate/Valheim/characters_local', "Paste into your file manager's location bar (Ctrl-L)."],
    ['Linux, Proton or Steam Deck', '~/.local/share/Steam/steamapps/compatdata/892970/pfx/drive_c/users/steamuser/AppData/LocalLow/IronGate/Valheim/characters_local', 'Same; show hidden folders if needed.'],
    ['Linux, Flatpak Steam', '~/.var/app/com.valvesoftware.Steam/.config/unity3d/IronGate/Valheim/characters_local', 'Same.'],
  ],
};
const STEPS = [
  ['load', 'Load your Viking', "Click the Load character button, or drop a recent .fch file anywhere on the page. It's read in your browser and never uploaded."],
  ['board', 'Choose a collection', 'Pick a collection from the list.'],
  ['stamps', 'Read your progress', 'Completed, Missing, Unverified and Undiscovered show where you stand. Filter or search the list, and open Details to compare records, add a note or correct an item.'],
];
const UA = {
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
  deck: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Valve Steam GameOverlay',
};

const events = (page, type) => page.evaluate(t => window.__vc.events.filter(e => e.type === t).map(e => e.data), type);
const active = page => page.evaluate(() => { const a = document.activeElement; return { id: a?.id || '', tag: a?.tagName, inPanel: !!a?.closest('#howToPopup [role=dialog]'), inSlip: !!a?.closest('.vc-slip'), text: (a?.getAttribute('aria-label') || a?.textContent || '').trim().slice(0, 60) }; });
const runAxe = async page => { await page.evaluate(AXE); return page.evaluate(async () => (await window.axe.run(document)).violations.map(v => `${v.id}: ${v.nodes.length}`)); };
const tourOn = page => page.evaluate(() => !!document.querySelector('[data-vc-tour]'));
const slipBox = page => page.evaluate(() => { const s = document.querySelector('.vc-slip'); const r = s.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, side: s.dataset.side, step: +s.dataset.step, w: innerWidth, h: innerHeight }; });
const holeBox = page => page.evaluate(() => { const r = document.querySelector('.vc-tour-hole').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });

async function openPopup(page) {
  await page.locator('#howTo').click();
  await expect(page.locator('#howToPopup [role=dialog]')).toBeVisible();
}
async function startTour(page) {
  await openPopup(page);
  await page.getByRole('button', { name: 'Show me around' }).click();
  await expect(page.locator('.vc-slip[data-step="1"]')).toBeVisible();
}

/** Static server for http:// runs (clipboard permission needs a real origin). */
async function serve() {
  const file = path.join(ROOT, 'dist', 'valheim-checkup.html');
  const srv = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(file)); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { srv, url: `http://127.0.0.1:${srv.address().port}/valheim-checkup.html?mode=flat` };
}

test.describe('WP-03 how-to control', () => {
  test('sits directly left of Load at 1440 and 390, with name and anchor', async ({ page }) => {
    for (const [w, h] of [[1440, 900], [390, 844], [800, 600]]) {
      await page.setViewportSize({ width: w, height: h });
      const errors = await A.openApp(page);
      const r = await page.evaluate(() => {
        const b = document.getElementById('howTo'), l = document.getElementById('loadTop');
        const rb = b.getBoundingClientRect(), rl = l.getBoundingClientRect();
        return {
          next: b.nextElementSibling?.id, order: [...b.parentElement.children].map(e => e.id),
          gap: rl.left - rb.right, sameRow: Math.abs((rb.top + rb.bottom) / 2 - (rl.top + rl.bottom) / 2) < 4,
          anchor: b.hasAttribute('data-tour-anchor'), label: b.textContent.trim(), scroll: document.documentElement.scrollWidth, w: innerWidth,
        };
      });
      expect(r.next, `${w}`).toBe('loadTop');
      expect(r.order).toEqual(['importProgress', 'exportProgress', 'howTo', 'loadTop']);
      expect(r.sameRow, `${w} same row`).toBe(true);
      expect(r.gap, `${w} gap`).toBeGreaterThanOrEqual(0);
      expect(r.gap).toBeLessThan(24);
      expect(r.anchor).toBe(true);
      expect(r.label).toBe('How to');
      expect(r.scroll, `${w} no sideways scroll`).toBeLessThanOrEqual(r.w);
      await expect(page.getByRole('button', { name: NAME, exact: true })).toHaveCount(1);
      expect(errors).toEqual([]);
      if (w === 1440) await page.locator('header').screenshot({ path: path.join(SHOTS, 'header-1440.png') });
      if (w === 390) await page.screenshot({ path: path.join(SHOTS, 'header-390.png') });
    }
  });
});

test.describe('WP-03 phone header', () => {
  // Round 1 finding (major), fixed in round 2. DECISIONS "WP-03 round 2: brand below 381 px": the brand
  // may wrap at its space below 381 px, never inside a word. At 381 px and wider it stays on one line.
  test('320–800 px, with and without a save: brand never broken inside a word; one line from 381 px', async ({ page }) => {
    const rows = [];
    for (const w of [320, 360, 380, 381, 390, 420, 480, 500, 600, 760, 800]) {
      await page.setViewportSize({ width: w, height: 844 });
      await A.openApp(page);
      for (const save of [false, true]) {
        if (save) await A.loadSave(page, fixture());
        const r = await page.evaluate(() => {
          const b = document.querySelector('.brand'), t = b.firstChild, txt = t.textContent;
          const rects = n => { const g = document.createRange(); g.setStart(t, n[0]); g.setEnd(t, n[1]); return [...g.getClientRects()].filter(x => x.width > 0); };
          const lineTops = new Set(rects([0, txt.length]).map(x => Math.round(x.top)));
          const words = [...txt.matchAll(/\S+/g)].map(m => new Set(rects([m.index, m.index + m[0].length]).map(x => Math.round(x.top))).size);
          const hb = document.getElementById('howTo').getBoundingClientRect(), lb = document.getElementById('loadTop').getBoundingClientRect();
          return { text: txt.trim(), lines: lineTops.size, words, header: Math.round(document.querySelector('header').getBoundingClientRect().height),
            next: document.getElementById('howTo').nextElementSibling?.id, sameRow: Math.abs((hb.top + hb.bottom) / 2 - (lb.top + lb.bottom) / 2) < 4 && hb.right <= lb.left,
            scroll: document.documentElement.scrollWidth };
        });
        rows.push({ w, save, ...r });
        expect(r.text).toBe('Valheim Checkup');
        expect(r.words.every(n => n === 1), `${w} ${save} word broken: ${r.words}`).toBe(true);
        expect(r.lines, `${w} ${save} lines`).toBeLessThanOrEqual(w >= 381 ? 1 : 2);
        expect(r.next).toBe('loadTop');
        expect(r.sameRow, `${w} ${save} How to left of Load, same row`).toBe(true);
        expect(r.scroll, `${w} ${save} sideways scroll`).toBeLessThanOrEqual(w);
        if (w === 390 && save) {
          expect(r.header, '390 with save header height (baseline 217)').toBeLessThanOrEqual(240);
          await page.locator('header').screenshot({ path: path.join(SHOTS, 'header-390-with-save.png') });
        }
        if (w === 320 && save) await page.locator('header').screenshot({ path: path.join(SHOTS, 'header-320-with-save.png') });
        if (w === 480 && save) await page.locator('header').screenshot({ path: path.join(SHOTS, 'header-480-with-save.png') });
      }
    }
    console.log('PHONE', JSON.stringify(rows.map(r => [r.w, r.save ? 's' : '-', r.lines, r.header, r.scroll])));
  });
});

test.describe('WP-03 popup', () => {
  for (const [os, ua] of Object.entries(UA)) {
    test(`preselects from user agent: ${os}`, async ({ browser }) => {
      const ctx = await browser.newContext({ userAgent: ua, locale: 'en-US', timezoneId: 'UTC', viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await A.openApp(page);
      await openPopup(page);
      const want = os === 'deck' ? 'linux' : os;
      await expect(page.locator(`#howToPopup [role=tab][aria-selected=true]`)).toHaveText({ windows: 'Windows', mac: 'macOS', linux: 'Linux' }[want]);
      await expect(page.locator('#howToPopup [role=tab][aria-selected=true]')).toBeFocused();
      await expect(page.locator('#howToPopup [role=tabpanel]:visible')).toHaveCount(1);
      await ctx.close();
    });
  }

  test('preselects from userAgentData first (overrides a Windows UA)', async ({ browser }) => {
    for (const [plat, want] of [['macOS', 'macOS'], ['Linux', 'Linux'], ['Chrome OS', 'Linux'], ['Windows', 'Windows']]) {
      const ctx = await browser.newContext({ userAgent: plat === 'Windows' ? UA.mac : UA.windows, viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await A.openApp(page, { init: p => Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => ({ platform: p, brands: [], mobile: false }) }), initArg: plat });
      await openPopup(page);
      await expect(page.locator('#howToPopup [role=tab][aria-selected=true]'), plat).toHaveText(want);
      await ctx.close();
    }
  });

  test('content matches the spec table and DECISIONS macOS rows, word for word', async ({ page }) => {
    await A.openApp(page);
    await openPopup(page);
    const dlg = page.locator('#howToPopup [role=dialog]');
    await expect(dlg).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByRole('dialog', { name: 'Find your Valheim character' })).toBeVisible();
    await expect(dlg.getByRole('tab')).toHaveText(['Windows', 'macOS', 'Linux']);
    for (const [id, rows] of Object.entries(PATHS)) {
      await dlg.getByRole('tab', { name: { windows: 'Windows', mac: 'macOS', linux: 'Linux' }[id] }).click();
      const got = await page.locator('[role=tabpanel]:not([hidden]) .vc-path-row').evaluateAll(rs => rs.map(r => [r.querySelector('h3').textContent, r.querySelector('code').textContent, r.querySelector('.vc-path-how').textContent]));
      expect(got, id).toEqual(rows);
      for (const [label] of rows) await expect(dlg.getByRole('button', { name: `Copy path for ${label}`, exact: true })).toBeVisible();
    }
    await expect(dlg).toContainText("Choose your character's .fch file. Pick a recent one, not a world .db file or a backup.");
    // The Steam Cloud sentence and link: same words and href as the help text.
    const help = await page.evaluate(() => { const a = document.querySelector('details.help a[href*="remotestorageapp"]'); return { href: a.href, text: a.textContent, para: a.parentElement.textContent }; });
    const mine = await page.evaluate(() => { const a = document.querySelector('#howToPopup a[href*="remotestorageapp"]'); return { href: a.href, text: a.textContent, para: a.parentElement.textContent.trim() }; });
    expect(mine.href).toBe(help.href);
    expect(mine.text).toBe(help.text);
    expect(mine.para.startsWith('Steam Cloud')).toBe(true);
    expect(help.para.replace(/\s+/g, ' ')).toContain(mine.para.replace(/\.$/, '').replace(/\s+/g, ' '));
    // Order: paths, then the choose sentence, then Steam, then footer.
    const order = await page.evaluate(() => [...document.querySelector('#howToPopup [role=dialog]').children].map(e => e.className || e.tagName));
    expect(order.indexOf('vc-howto-choose')).toBeGreaterThan(order.lastIndexOf('vc-tabpanel'));
    await expect(dlg.getByRole('button', { name: 'Show me around' })).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Close' })).toHaveText('×');
    for (const id of ['windows', 'mac', 'linux']) {
      await dlg.getByRole('tab', { name: { windows: 'Windows', mac: 'macOS', linux: 'Linux' }[id] }).click();
      await page.screenshot({ path: path.join(SHOTS, `popup-${id}-1440.png`) });
    }
    await dlg.screenshot({ path: path.join(SHOTS, 'popup-linux-crop200.png'), scale: 'device' });
  });

  test('every Copy button puts its exact path on the real clipboard (http, permission granted)', async ({ browser }) => {
    const { srv, url } = await serve();
    const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await A.openApp(page, { url });
    await openPopup(page);
    const dlg = page.locator('#howToPopup [role=dialog]');
    let n = 0;
    for (const [id, rows] of Object.entries(PATHS)) {
      await dlg.getByRole('tab', { name: { windows: 'Windows', mac: 'macOS', linux: 'Linux' }[id] }).click();
      for (const [label, p] of rows) {
        await page.evaluate(() => navigator.clipboard.writeText('sentinel'));
        await dlg.getByRole('button', { name: `Copy path for ${label}`, exact: true }).click();
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), label).toBe(p);
        await expect(page.locator('#toast')).toHaveText('Path copied.');
        await expect(page.locator('#toast')).toBeVisible();
        n++;
      }
    }
    expect(n).toBe(7);
    // Toast is above the popup's backdrop.
    const top = await page.evaluate(() => { const r = document.getElementById('toast').getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.id; });
    expect(top).toBe('toast');
    const toasts = (await events(page, 'app:toast')).filter(d => d.text === 'Path copied.');
    expect(toasts.length).toBe(7);
    await page.screenshot({ path: path.join(SHOTS, 'popup-copied-toast.png') });
    await ctx.close();
    srv.close();
  });

  test('copy on file:// (the shipped single file) still copies or tells the user', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await A.openApp(page);
    await openPopup(page);
    let g = 0;
    while (!(await active(page)).text.startsWith('Copy path') && g++ < 10) await page.keyboard.press('Tab');
    await page.keyboard.press('Enter'); // first Copy button, by keyboard
    await expect(page.locator('#toast')).toBeVisible();
    const text = await page.locator('#toast').textContent();
    expect(['Path copied.'].includes(text) || /Copy did not work here/.test(text)).toBe(true);
    console.log('file:// copy toast:', text);
    // Popup still open, focus still inside.
    expect((await active(page)).inPanel).toBe(true);
    await ctx.close();
  });

  test('Escape, ×, click outside close and return focus; click inside and drag-out keep it open', async ({ page }) => {
    await A.openApp(page);
    const closed = async how => {
      await expect(page.locator('#howToPopup')).toBeHidden();
      await expect(page.locator('#howTo'), how).toBeFocused();
      expect(await page.evaluate(() => [...document.body.children].filter(e => e.inert).length), how).toBe(0);
    };
    await openPopup(page); await page.keyboard.press('Escape'); await closed('escape');
    await openPopup(page); await page.getByRole('button', { name: 'Close' }).click(); await closed('x');
    await openPopup(page); await page.mouse.click(20, 880); await closed('outside');
    await openPopup(page);
    const box = await page.locator('#howToPopup [role=dialog]').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + 30); // on the title, inside the paper
    await expect(page.locator('#howToPopup')).toBeVisible();
    await page.mouse.move(box.x + 40, box.y + 40); await page.mouse.down(); await page.mouse.move(10, 10, { steps: 5 }); await page.mouse.up();
    await expect(page.locator('#howToPopup'), 'drag ending outside').toBeVisible();
    // A click outside right on top of the Load button must not open the file chooser.
    let chooser = false; page.on('filechooser', () => { chooser = true; });
    const lb = await page.evaluate(() => { const r = document.getElementById('loadTop').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(lb.x, lb.y);
    await closed('outside on Load');
    await page.waitForTimeout(300);
    expect(chooser).toBe(false);
  });

  test('focus is trapped inside on every tab, background is inert', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page, fixture());
    await openPopup(page);
    for (const tab of ['Windows', 'macOS', 'Linux']) {
      await page.getByRole('tab', { name: tab }).click();
      const seen = new Set();
      for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); const a = await active(page); expect(a.inPanel, `${tab} Tab ${i} → ${a.tag}#${a.id}`).toBe(true); seen.add(a.text); }
      for (let i = 0; i < 12; i++) { await page.keyboard.press('Shift+Tab'); const a = await active(page); expect(a.inPanel, `${tab} Shift-Tab ${i}`).toBe(true); }
      expect(seen.has('Show me around')).toBe(true);
      expect(seen.has('Close')).toBe(true);
    }
    const inert = await page.evaluate(() => ({ main: document.querySelector('.layout').closest('[inert]') !== null, header: document.querySelector('header').closest('[inert]') !== null, toast: document.getElementById('toast').inert }));
    expect(inert).toEqual({ main: true, header: true, toast: false });
    // Tab-list keyboard: ←/→/Home/End move selection.
    await page.getByRole('tab', { name: 'Windows' }).focus();
    await page.keyboard.press('ArrowRight'); await expect(page.getByRole('tab', { name: 'macOS' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End'); await expect(page.getByRole('tab', { name: 'Linux' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight'); await expect(page.getByRole('tab', { name: 'Windows' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft'); await expect(page.getByRole('tab', { name: 'Linux' })).toBeFocused();
  });
});

test.describe('WP-03 popup tab order', () => {
  // Round 1 finding (minor), fixed in round 2: one Tab stop for the tab list (ARIA tabs pattern).
  test('Tab from the selected tab goes to the first Copy button, not another tab', async ({ page }) => {
    await A.openApp(page);
    await openPopup(page);
    for (const tab of ['Windows', 'macOS', 'Linux']) {
      await page.getByRole('tab', { name: tab }).click();
      await page.getByRole('tab', { name: tab }).focus();
      await page.keyboard.press('Tab');
      expect((await active(page)).text, tab).toMatch(/^Copy path for/);
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => [document.activeElement.getAttribute('role'), document.activeElement.textContent]), tab).toEqual(['tab', tab]);
      await page.keyboard.press('Shift+Tab');
      expect((await active(page)).text, tab + ' wraps to ×').toBe('Close');
      // A full cycle has exactly one tab stop in the tab list.
      const stops = [];
      for (let i = 0; i < 20; i++) { await page.keyboard.press('Tab'); stops.push(await page.evaluate(() => document.activeElement.getAttribute('role') === 'tab')); }
      const cycle = stops.indexOf(true, stops.indexOf(true) + 1) - stops.indexOf(true);
      expect(stops.slice(0, cycle).filter(Boolean).length, tab).toBe(1);
    }
  });
});

test.describe('WP-03 tour', () => {
  test('three steps: exact flat text, dialog role, focus in the slip, events, screenshots', async ({ page }) => {
    await A.openApp(page, { query: 'seed=1' });
    await page.evaluate(() => window.__vc.timeScale(0.25));
    await startTour(page);
    for (let i = 0; i < 3; i++) {
      const [target, title, text] = STEPS[i];
      const slip = page.locator(`.vc-slip[data-step="${i + 1}"]`);
      await expect(slip).toBeVisible();
      await expect(slip).toHaveAttribute('role', 'dialog');
      await expect(slip).toBeFocused();
      await expect(page.getByRole('dialog', { name: title, exact: true })).toBeVisible();
      await expect(slip.locator('.vc-slip-count')).toHaveText(`${i + 1} of 3`);
      await expect(slip.locator('.vc-slip-text')).toHaveText(text);
      expect(await slip.getAttribute('data-target')).toBe(target);
      // Accessible description includes the step text (screen readers announce it on focus).
      const desc = await slip.evaluate(s => s.getAttribute('aria-describedby').split(' ').map(id => document.getElementById(id).textContent).join(' '));
      expect(desc).toContain(text);
      await page.waitForTimeout(450); // 300 ms cut-out glide
      // Slip fully on screen, beside the target (not on top of it), arrow side matches geometry.
      const s = await slipBox(page), h = await holeBox(page);
      expect(s.l).toBeGreaterThanOrEqual(0); expect(s.t).toBeGreaterThanOrEqual(0); expect(s.r).toBeLessThanOrEqual(s.w); expect(s.b).toBeLessThanOrEqual(s.h);
      if (s.side === 'right') expect(s.l).toBeGreaterThanOrEqual(h.r - 1);
      if (s.side === 'left') expect(s.r).toBeLessThanOrEqual(h.l + 1);
      if (s.side === 'above') expect(s.b).toBeLessThanOrEqual(h.t + 1);
      console.log(`step ${i + 1}: side=${s.side}`);
      // No Done/Finish/Skip anywhere in the document (visible or not).
      await expect(page.getByRole('button', { name: /done|finish|skip/i, includeHidden: true })).toHaveCount(0);
      expect(await page.evaluate(() => [...document.querySelectorAll('button, [role=button], a, input[type=button], input[type=submit]')].filter(b => /\b(done|finish|skip)\b/i.test(b.textContent + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.value || ''))).length)).toBe(0);
      expect(await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => !b.closest('[inert]') && b.getClientRects().length).length), 'no live buttons').toBe(0);
      await page.screenshot({ path: path.join(SHOTS, `tour-step${i + 1}-1440.png`) });
      if (i < 2) await page.keyboard.press('ArrowRight');
    }
    await page.keyboard.press('Enter');
    expect(await tourOn(page)).toBe(false);
    await expect(page.locator('#howTo')).toBeFocused();
    const steps = await events(page, 'tour:step');
    expect(steps.map(d => d.step)).toEqual([1, 2, 3]);
    expect(steps.map(d => d.target)).toEqual(['load', 'board', 'stamps']);
    expect(steps.every(d => d.of === 3)).toBe(true);
    expect(await events(page, 'tour:start')).toEqual([{ mode: 'flat' }]);
    expect(await events(page, 'tour:end')).toEqual([{ step: 3, reason: 'key' }]);
  });

  test('flat dims to 35% around the cut-out', async ({ page }) => {
    await A.openApp(page);
    // Test-only white patch under the tour layer (z 999), far from every target.
    await page.evaluate(() => { const d = document.createElement('div'); d.id = 'checkerProbe'; Object.assign(d.style, { position: 'fixed', left: '880px', top: '840px', width: '80px', height: '50px', background: '#fff', zIndex: 999 }); document.body.append(d); });
    const probe = { x: 900, y: 850 };
    const before = await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 900 } });
    await startTour(page);
    await page.waitForTimeout(500);
    const after = await page.screenshot();
    // Read pixels in the page itself (no image library): draw both screenshots on a canvas.
    const ratio = await page.evaluate(async ({ a, b, probe }) => {
      const load = async src => { const i = new Image(); i.src = 'data:image/png;base64,' + src; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x; };
      const ca = await load(a), cb = await load(b);
      const lum = (ctx, x, y, w, h) => { const d = ctx.getImageData(x, y, w, h).data; let s = 0; for (let k = 0; k < d.length; k += 4) s += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]; return s / (d.length / 4); };
      const lb = document.getElementById('loadTop').getBoundingClientRect();
      return {
        dim: lum(cb, probe.x, probe.y, 40, 30) / lum(ca, probe.x, probe.y, 40, 30),
        bright: lum(ca, probe.x, probe.y, 40, 30),
        cut: lum(cb, lb.left + 4, lb.top + 4, lb.width - 8, lb.height - 8) / lum(ca, lb.left + 4, lb.top + 4, lb.width - 8, lb.height - 8),
      };
    }, { a: before.toString('base64'), b: after.toString('base64'), probe });
    console.log('dim ratio', ratio);
    expect(ratio.dim).toBeGreaterThan(0.315);
    expect(ratio.dim).toBeLessThan(0.385);
    expect(ratio.cut).toBeGreaterThan(0.8);
    const alpha = await page.evaluate(() => getComputedStyle(document.querySelector('.vc-tour-hole')).boxShadow);
    expect(alpha).toContain('0.65');
  });

  test('clicks advance and never reach controls underneath; click on step 3 ends', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page, fixture());
    await A.selectView(page, 'The Master Chef');
    const before = await page.evaluate(() => ({ view: document.getElementById('title').textContent, status: document.getElementById('statusFilter').value, ls: JSON.stringify(localStorage), url: location.href }));
    await startTour(page);
    await page.evaluate(() => {
      window.__hits = [];
      for (const t of ['click', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick', 'contextmenu', 'auxclick', 'input', 'change', 'focusin']) {
        document.addEventListener(t, e => { if (!e.target.closest?.('[data-vc-tour]') && e.target !== document && e.target !== document.body) window.__hits.push(t + ':' + (e.target.id || e.target.tagName)); }, true);
      }
    });
    let chooser = false; page.on('filechooser', () => { chooser = true; });
    const centre = sel => page.evaluate(s => { const el = document.querySelector(s); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    // Step 1: click right on Load (inside the cut-out).
    let c = await centre('#loadTop'); await page.mouse.click(c.x, c.y);
    await expect(page.locator('.vc-slip[data-step="2"]')).toBeVisible();
    // Step 2: click right on a different collection, plus a right click and a middle click.
    c = await centre('[data-category="The Carpenter"]');
    await page.mouse.click(c.x, c.y, { button: 'right' });
    await page.mouse.click(c.x, c.y, { button: 'middle' });
    await expect(page.locator('.vc-slip[data-step="2"]')).toBeVisible();
    await page.mouse.click(c.x, c.y);
    await expect(page.locator('.vc-slip[data-step="3"]')).toBeVisible();
    // Step 3: click on the status filter (inside the cut-out) ends the tour.
    c = await centre('#statusFilter'); await page.mouse.click(c.x, c.y);
    expect(await tourOn(page)).toBe(false);
    await page.waitForTimeout(300);
    const hits = await page.evaluate(() => window.__hits.filter(h => !/^focusin:howTo$/.test(h)));
    expect(hits).toEqual([]);
    expect(chooser).toBe(false);
    const after = await page.evaluate(() => ({ view: document.getElementById('title').textContent, status: document.getElementById('statusFilter').value, ls: JSON.stringify(localStorage), url: location.href }));
    expect(after).toEqual(before);
    expect(await events(page, 'tour:end')).toEqual([{ step: 3, reason: 'click' }]);
    expect(await events(page, 'app:category')).toHaveLength(1); // only my selectView before the tour
    await expect(page.locator('#howTo')).toBeFocused();
    expect(await page.evaluate(() => [...document.body.children].filter(e => e.inert).length)).toBe(0);
  });

  for (const n of [1, 2, 3]) {
    test(`Escape ends the tour from step ${n}`, async ({ page }) => {
      await A.openApp(page);
      await startTour(page);
      for (let i = 1; i < n; i++) await page.keyboard.press('ArrowRight');
      await expect(page.locator(`.vc-slip[data-step="${n}"]`)).toBeFocused();
      await page.keyboard.press('Escape');
      expect(await tourOn(page)).toBe(false);
      expect(await events(page, 'tour:end')).toEqual([{ step: n, reason: 'escape' }]);
      await expect(page.locator('#howTo')).toBeFocused();
      await expect(page.locator('#howToPopup')).toBeHidden();
    });
  }

  test('keys: → Enter Space advance, ← goes back, Tab stays in the slip', async ({ page }) => {
    await A.openApp(page);
    await startTour(page);
    const at = () => page.evaluate(() => window.__vc.tour.step());
    await page.keyboard.press('ArrowLeft'); expect(await at()).toBe(1);
    await page.keyboard.press('Space'); expect(await at()).toBe(2);
    await page.keyboard.press('ArrowLeft'); expect(await at()).toBe(1);
    await page.keyboard.press('Enter'); expect(await at()).toBe(2);
    await page.keyboard.press('ArrowRight'); expect(await at()).toBe(3);
    for (let i = 0; i < 6; i++) { await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab'); expect((await active(page)).inSlip).toBe(true); }
    for (const k of ['a', '/', 'PageDown', 'Home', 'Backspace']) await page.keyboard.press(k);
    expect(await at()).toBe(3);
    await page.keyboard.press('Space');
    expect(await tourOn(page)).toBe(false);
    expect(await events(page, 'tour:end')).toEqual([{ step: 3, reason: 'key' }]);
  });

  test('keyboard only, from page load: open popup, start tour, step through, leave', async ({ page }) => {
    await A.openApp(page);
    let presses = 0;
    while (!(await page.locator('#howTo').evaluate(e => e === document.activeElement)) && presses < 10) { await page.keyboard.press('Tab'); presses++; }
    expect(presses).toBeLessThanOrEqual(3);
    // Visible focus outline on the control.
    const outline = await page.locator('#howTo').evaluate(e => getComputedStyle(e).outlineStyle + ' ' + getComputedStyle(e).outlineWidth);
    expect(outline).toMatch(/solid 3px/);
    await page.keyboard.press('Enter');
    await expect(page.locator('#howToPopup [role=tab][aria-selected=true]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    let guard = 0;
    while ((await active(page)).text !== 'Show me around' && guard++ < 20) await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('.vc-slip[data-step="1"]')).toBeFocused();
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    await expect(page.locator('.vc-slip[data-step="3"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#howTo')).toBeFocused();
    // And again with Space instead of Enter.
    await page.keyboard.press('Space');
    await expect(page.locator('#howToPopup')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#howTo')).toBeFocused();
  });

  test('screen reader view: popup and slips expose role, name and text; page behind is hidden', async ({ page }) => {
    await A.openApp(page);
    await openPopup(page);
    const cdp = await page.context().newCDPSession(page);
    const axNames = async () => (await cdp.send('Accessibility.getFullAXTree')).nodes.filter(n => !n.ignored).map(n => `${n.role?.value} "${n.name?.value || ''}"`);
    const snapPopup = await page.locator('body').ariaSnapshot();
    const treePopup = await axNames();
    expect(treePopup.some(n => n.includes('Load character')), 'background in AX tree').toBe(false);
    fs.writeFileSync(path.join(SHOTS, 'ax-tree-popup.txt'), treePopup.join('\n'));
    expect(treePopup).toContain('dialog "Find your Valheim character"');
    expect(snapPopup).toContain('dialog "Find your Valheim character"');
    expect(snapPopup).toContain('tablist "Your computer"');
    expect(snapPopup).toMatch(/tab "Windows" \[selected\]|tab "macOS" \[selected\]|tab "Linux" \[selected\]/);
    await page.getByRole('button', { name: 'Show me around' }).click();
    for (let i = 0; i < 3; i++) {
      const snap = await page.locator('body').ariaSnapshot();
      expect(snap).toContain(`dialog "${STEPS[i][1]}"`);
      expect(snap).toContain(STEPS[i][2]);
      const tree = await axNames();
      expect(tree.filter(n => /^(button|link|combobox|textbox|table|row|cell|columnheader) /.test(n)), 'background controls in AX tree').toEqual([]);
      expect(tree).toContain(`dialog "${STEPS[i][1]}"`);
      await page.keyboard.press('ArrowRight');
    }
    const live = await page.locator('#toast').getAttribute('role');
    expect(live).toBe('status');
  });

  for (const withSave of [false, true]) {
    test(`axe-core: no violations, popup (3 tabs) and tour (3 steps), ${withSave ? 'with' : 'no'} save`, async ({ page }) => {
      await A.openApp(page);
      if (withSave) { await A.loadSave(page, fixture()); await A.hideToast?.(page); }
      const report = {};
      await openPopup(page);
      for (const tab of ['Windows', 'macOS', 'Linux']) { await page.getByRole('tab', { name: tab }).click(); report['popup ' + tab] = await runAxe(page); }
      await page.getByRole('button', { name: 'Show me around' }).click();
      for (let i = 1; i <= 3; i++) { await expect(page.locator(`.vc-slip[data-step="${i}"]`)).toBeVisible(); report['step ' + i] = await runAxe(page); if (i < 3) await page.keyboard.press('ArrowRight'); }
      await page.keyboard.press('Escape');
      // The full page after the tour may only show the two violations the baseline already has
      // (checked on baseline/index.html: empty-table-header on th "Star item", label-content-name-mismatch on #loadTop).
      report.after = (await runAxe(page)).filter(v => !/^(empty-table-header|label-content-name-mismatch): 1$/.test(v));
      console.log('axe', withSave ? 'save' : 'nosave', JSON.stringify(report));
      for (const [k, v] of Object.entries(report)) expect(v, k).toEqual([]);
    });
  }
});

test.describe('WP-03 break attempts', () => {
  test('rapid input: hammering How to, Show me around, start() twice, 200 random keys', async ({ page }) => {
    const errors = await A.openApp(page);
    await page.evaluate(() => { for (let i = 0; i < 30; i++) document.getElementById('howTo').click(); });
    await expect(page.locator('#howToPopup')).toBeVisible();
    expect(await page.locator('#howToPopup').count()).toBe(1);
    await page.evaluate(() => { for (let i = 0; i < 10; i++) document.getElementById('showMeAround').click(); window.__vc.tour.start(); window.__vc.tour.start(); });
    expect(await page.locator('[data-vc-tour]').count()).toBe(1);
    expect(await events(page, 'tour:start')).toHaveLength(1);
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowLeft', 'ArrowRight', 'Tab'];
    for (let i = 0; i < 200 && await tourOn(page); i++) await page.keyboard.press(keys[(i * 7 + 3) % keys.length]);
    if (await tourOn(page)) await page.keyboard.press('Escape');
    expect(await tourOn(page)).toBe(false);
    expect(await page.evaluate(() => [...document.body.children].filter(e => e.inert).length)).toBe(0);
    expect(await page.locator('.vc-slip').count()).toBe(0);
    expect(await events(page, 'tour:end')).toHaveLength(1);
    // A quick double click on step 1 = two advances, nothing else.
    await startTour(page);
    await page.mouse.dblclick(700, 500);
    expect(await page.evaluate(() => window.__vc.tour.step())).toBe(3);
    await page.keyboard.press('Escape');
    // Holding Enter (auto-repeat) must not race through and end instantly.
    await startTour(page);
    await page.keyboard.down('Enter'); for (let i = 0; i < 10; i++) await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
    console.log('after held Enter: step', await page.evaluate(() => window.__vc.tour.step()));
    expect(await tourOn(page)).toBe(true);
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });

  test('resize mid-tour and mid-glide: slip stays on screen, cut-out follows the target', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page, fixture());
    await startTour(page);
    const settle = [];
    for (const step of [1, 2, 3]) {
      for (const [w, h] of [[1440, 900], [1024, 640], [800, 600], [390, 844], [1920, 1080], [600, 400]]) {
        await page.setViewportSize({ width: w, height: h });
        // The slip glides (300 ms) to its new place after a resize: wait until it has settled.
        const t0 = Date.now();
        let s = await slipBox(page), prev = null;
        while (Date.now() - t0 < 4000 && (!prev || Math.abs(prev.l - s.l) + Math.abs(prev.t - s.t) > 0.5 || s.r > w + 0.5 || s.b > h + 0.5)) { prev = s; await page.waitForTimeout(150); s = await slipBox(page); }
        settle.push(Date.now() - t0);
        expect(s.l, `step ${step} ${w}x${h} left`).toBeGreaterThanOrEqual(0);
        expect(s.t, `step ${step} ${w}x${h} top`).toBeGreaterThanOrEqual(0);
        expect(s.r, `step ${step} ${w}x${h} right`).toBeLessThanOrEqual(w + 0.5);
        expect(s.b, `step ${step} ${w}x${h} bottom`).toBeLessThanOrEqual(h + 0.5);
        // Cut-out still around a visible target element.
        // The cut-out glides too: poll until it surrounds the target (or 5 s pass).
        await expect.poll(() => page.evaluate(t => {
          const hole = document.querySelector('.vc-tour-hole').getBoundingClientRect();
          const els = [...document.querySelectorAll(`[data-tour="${t}"]`)].filter(e => e.getClientRects().length && !e.closest('.hidden,[hidden]'));
          return els.some(e => { const r = e.getBoundingClientRect(); return r.left >= hole.left - 2 && r.right <= hole.right + 2 && r.top >= hole.top - 2 - 10000; });
        }, STEPS[step - 1][0]), { message: `step ${step} ${w}x${h} cut-out`, timeout: 5000 }).toBe(true);
        if (step === 3 && w === 390) await page.screenshot({ path: path.join(SHOTS, 'tour-step3-390.png') });
        if (step === 1 && w === 390) await page.screenshot({ path: path.join(SHOTS, 'tour-step1-390.png') });
        if (step === 2 && w === 390) await page.screenshot({ path: path.join(SHOTS, 'tour-step2-390.png') });
      }
      console.log('settle ms', step, JSON.stringify(settle.splice(0)));
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100); // resize in the middle of the 300 ms glide
      await page.setViewportSize({ width: 1000, height: 700 });
      await page.waitForTimeout(450);
    }
  });

  test('round 2 fix 4: no glide on resize — slip on screen in every frame after a resize; steps still glide', async ({ page }) => {
    await A.openApp(page);
    await A.loadSave(page, fixture());
    await startTour(page);
    const bad = [];
    let frames = 0;
    for (const step of [1, 2, 3]) {
      for (const [w, h] of [[1024, 640], [1440, 900], [800, 600], [390, 844], [600, 400], [1920, 1080], [1440, 900]]) {
        // Headless Chromium updates innerWidth ~200 ms before it fires 'resize'; the page can only react
        // to the event, so count the 12 frames that follow the resize event.
        await page.evaluate(() => { window.__frames = []; window.__resized = false; addEventListener('resize', () => { window.__resized = true; }, { once: true }); const f = () => { const s = document.querySelector('.vc-slip'); if (!s) return; if (window.__resized) { const r = s.getBoundingClientRect(); window.__frames.push([r.left, r.top, r.right, r.bottom, innerWidth, innerHeight]); } if (window.__frames.length < 12) requestAnimationFrame(f); }; requestAnimationFrame(f); });
        await page.setViewportSize({ width: w, height: h });
        await expect.poll(() => page.evaluate(() => window.__frames.length), { timeout: 5000 }).toBe(12);
        const fr = await page.evaluate(() => window.__frames);
        frames += fr.length;
        for (const [l, t, r, b, W, H] of fr) if (l < -0.5 || t < -0.5 || r > W + 0.5 || b > H + 0.5) bad.push(`step ${step} ${W}x${H}: ${Math.round(l)},${Math.round(t)},${Math.round(r)},${Math.round(b)}`);
      }
      if (step < 3) {
        await page.keyboard.press('ArrowRight');
        const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.vc-slip')).transitionDuration);
        expect(dur, 'step change still glides').toMatch(/0\.3s/);
        await page.waitForTimeout(500);
      }
    }
    expect(bad).toEqual([]);
    console.log('fix4 frames checked', frames);
    // Resize in the middle of a step glide.
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(80);
    await page.evaluate(() => { window.__resized = false; addEventListener('resize', () => { window.__resized = true; }, { once: true }); });
    await page.setViewportSize({ width: 700, height: 500 });
    await expect.poll(() => page.evaluate(() => window.__resized)).toBe(true);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); // two frames after the event
    const s = await slipBox(page);
    expect(s.l >= 0 && s.t >= 0 && s.r <= 700.5 && s.b <= 500.5, JSON.stringify(s)).toBe(true);
  });

  test('scrolled to the bottom, Highlights (no stamps), reduced motion, hidden tab', async ({ page }) => {
    await A.openApp(page, { reducedMotion: 'reduce' });
    await A.loadSave(page, fixture());
    await A.selectView(page, 'The Hunter');
    await page.locator('#statusFilter').selectOption('all');
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await startTour(page);
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    const h = await holeBox(page);
    expect(h.t).toBeLessThan(900); expect(h.b).toBeGreaterThan(0);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.vc-slip')).transitionDuration)).toMatch(/^0s/);
    await page.keyboard.press('Escape');
    await A.selectView(page, 'Highlights');
    await startTour(page);
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    const s = await slipBox(page);
    expect(s.side).toBe('none');
    expect(s.l).toBeGreaterThanOrEqual(0); expect(s.r).toBeLessThanOrEqual(1440);
    await page.screenshot({ path: path.join(SHOTS, 'tour-step3-highlights.png') });
    // Tab hidden mid-tour.
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(await tourOn(page)).toBe(true);
    await page.mouse.click(700, 450);
    expect(await tourOn(page)).toBe(false);
  });

  test('4× CPU throttling and storage disabled: still works, no errors', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const errors = await A.openApp(page, { init: A.failingStorage });
    await A.loadSave(page, fixture()).catch(() => {});
    await startTour(page);
    for (let i = 0; i < 3; i++) await page.mouse.click(100 + i * 300, 700);
    expect(await tourOn(page)).toBe(false);
    await expect(page.locator('#howTo')).toBeFocused();
    expect(errors).toEqual([]);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  });

  test('dropping a file on the page during the tour', async ({ page }) => {
    await A.openApp(page);
    await startTour(page);
    const url = page.url();
    // Synthetic drop on the capture layer (the user follows step 1: "drop … anywhere").
    const res = await page.evaluate(async b64 => {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const dt = new DataTransfer(); dt.items.add(new File([bytes], 'characters_fixture.fch'));
      const layer = document.querySelector('[data-vc-tour]');
      const over = new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true });
      layer.dispatchEvent(over);
      const drop = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
      layer.dispatchEvent(drop);
      return { overPrevented: over.defaultPrevented, dropPrevented: drop.defaultPrevented };
    }, fixture().toString('base64'));
    console.log('drop during tour:', JSON.stringify(res), 'tour still on:', await tourOn(page));
    expect(page.url()).toBe(url);
  });

  // Round 1 finding (minor), fixed in round 2: a click on the toast during the tour advances.
  test('copy a path then start the tour: toast stays above, a click on it still advances', async ({ page }) => {
    await A.openApp(page);
    await openPopup(page);
    await page.locator('.vc-copy:visible').first().click();
    await expect(page.locator('#toast')).toBeVisible();
    await page.getByRole('button', { name: 'Show me around' }).click();
    const r = await page.locator('#toast').boundingBox();
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    const step = await page.evaluate(() => window.__vc.tour.step());
    console.log('click on toast during tour → step', step);
    expect(step).toBe(2);
  });
});
