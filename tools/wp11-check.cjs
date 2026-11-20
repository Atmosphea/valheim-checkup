// Builder self-check for WP-11 (not a checker test). Run after the build:
//   npm run build:single && node tools/wp11-check.cjs [smoke|details|lift|menus|tags|title|tips|toast|tour|help|shot|all]
// Real GPU (Metal). Paul's save is loaded from fixtures/private; the character name is never
// printed and is masked in screenshots.
const path = require('node:path');
const fs = require('node:fs');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const { open, check, results, ARGS } = require('./wp08-check.cjs');
const SHOTS = path.join(ROOT, 'docs', 'reports', 'wp-11');
fs.mkdirSync(SHOTS, { recursive: true });
const PRIVATE = path.join(ROOT, 'fixtures', 'private');
const SAVE = fs.readFileSync(path.join(PRIVATE, fs.readdirSync(PRIVATE).find(f => f.endsWith('.fch'))));
const MODE = process.argv[2] || 'all';
const want = m => MODE === 'all' || MODE.split(',').includes(m);
const priv = p => ({ mask: [p.locator('#headerProfile strong'), p.locator('#toast')], maskColor: '#ff00ff' });
const near = (v, w, tol = 0.1) => Math.abs(v - w) <= Math.max(Math.abs(w) * tol, 25);

async function loadSave(page) {
  await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
  await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 20000 });
}
const idle = page => page.waitForFunction(() => !__vc.ink?.state().running && (__vc.ink?.state().ghosts ?? 0) === 0, null, { timeout: 15000 }).catch(() => {});
const evts = (page, since) => page.evaluate(s => __vc.events.filter(e => e.wall >= s).map(e => ({ type: e.type, t: e.t, data: e.data })), since);
const now = page => page.evaluate(() => performance.now());
const wait = (page, ms) => page.waitForTimeout(ms);

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  let errors = [];
  try {
    const o = await open(browser);
    const page = o.page; errors = o.errors;
    await loadSave(page);
    await idle(page);
    await wait(page, 600);

    if (want('smoke')) {
      const r = await page.evaluate(() => __vc.surfaces.read());
      console.log(JSON.stringify(r, null, 1).slice(0, 2500));
      check('smoke: no page errors after load', errors.length === 0, errors.join(' | '));
    }

    if (want('details') || want('shot')) {
      // open Details on the first row through its own button
      const w = await now(page);
      await page.evaluate(() => document.querySelector('#items button[data-details]')?.click());
      await page.waitForSelector('#itemDialog[open]', { timeout: 5000 });
      await wait(page, 2700);
      const ev = await evts(page, w);
      const open0 = ev.find(e => e.type === 'app:details-open')?.t;
      const folds = ev.filter(e => e.type === 'details:fold').map(e => +(e.t - open0).toFixed(0));
      const want5 = [0, 250, 500, 750, 1000]; // fold i starts (and plays its flap) here
      check('details: five folds', folds.length === 5, JSON.stringify(folds));
      check('details: fold timings ±10%', folds.length === 5 && folds.every((f, i) => Math.abs(f - want5[i]) <= Math.max(25, want5[i] * 0.1)), `${JSON.stringify(folds)} want ≈ ${JSON.stringify(want5)}`);
      const fl = ev.find(e => e.type === 'details:float');
      check('details: float at ≈1500 ms', fl && near(fl.t - open0, 1500), fl ? String(Math.round(fl.t - open0)) : 'none');
      const st = await page.evaluate(() => {
        const d = document.getElementById('itemDialog');
        const z = el => +getComputedStyle(el).zIndex || 0;
        const desk = document.getElementById('desk');
        const order = [...desk.children].map(c => c.id || c.className);
        return { read: __vc.surfaces.details.read(), active: document.activeElement?.closest('#itemDialog') != null, opacity: getComputedStyle(d).opacity, order };
      });
      check('details: in #float layer, aria-modal', st.read.inLayer && st.read.ariaModal === 'true', JSON.stringify(st.read));
      check('details: focus inside', st.active);
      check('details: sheet visible after unfold', st.opacity === '1', st.opacity);
      check('details: fx and grain stack above #float', st.order.indexOf('fx') > st.order.indexOf('float') && st.order.indexOf('grain') > st.order.indexOf('float'), st.order.join(','));
      if (want('shot')) {
        await page.screenshot({ path: path.join(SHOTS, 'details-open.png'), ...priv(page) });
        console.log('shot: docs/reports/wp-11/details-open.png');
      }
      // Tab trap: 30 tabs never leave the dialog
      let left = 0;
      for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => !!document.activeElement?.closest('#itemDialog')))) left++; }
      check('details: Tab trapped', left === 0, `${left} escapes`);
      // Escape closes; app:details-close is emitted synchronously; focus back to the Details button
      const w2 = await now(page);
      await page.keyboard.press('Escape');
      const after = await page.evaluate(s => ({ open: document.getElementById('itemDialog').open, closeEv: __vc.events.filter(e => e.wall >= s && e.type === 'app:details-close').length, focus: document.activeElement?.closest('#items') != null }), w2);
      check('details: Escape closes, one app:details-close, focus back in the table', !after.open && after.closeEv === 1 && after.focus, JSON.stringify(after));
      await wait(page, 1200);
      const late = await page.evaluate(s => __vc.events.filter(e => e.wall >= s && e.type === 'app:details-close').length, w2);
      check('details: no late duplicate close event', late === 1, String(late));
      // × and outside click
      for (const how of ['x', 'outside']) {
        await page.evaluate(() => document.querySelector('#items button[data-details]')?.click());
        await page.waitForSelector('#itemDialog[open]');
        await wait(page, 2500);
        if (how === 'x') { const b = await page.locator('#closeDetails').boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
        else await page.mouse.click(12, 450);
        await wait(page, 100);
        check(`details: ${how === 'x' ? '×' : 'outside click'} closes`, !(await page.evaluate(() => document.getElementById('itemDialog').open)));
        await wait(page, 2100); // close 900 + shrink 220 + puff 750
      }
      // reduced unfold state: nothing left behind
      check('details: unfold cleaned up', await page.evaluate(() => document.querySelectorAll('#float .vc-unfold').length === 0));
    }

    if (want('lift')) {
      const r = [];
      for (const s of [0, 40, 120, 600, 3000, 0]) {
        await page.evaluate(y => { __vc.surfaces.lift.wrap.scrollTop = y; }, s);
        await wait(page, 700);
        r.push(await page.evaluate(() => __vc.surfaces.lift.read()));
      }
      console.log(JSON.stringify(r.map(x => ({ ...x }))).slice(0, 1500));
      const drift = r.map(x => Math.abs(x.drift ?? 0));
      check('lift: no drift between slip and table (in-plane ≤1 px at every scroll)', drift.every(d => d <= 1), JSON.stringify(drift));
      // Paul, WP-17 item 6: one native scroll, no slip: the slip-on-table gap and the covered coins are retired
      if (false) check('lift: at rest the slip sits on the table (screen gap ≤1 px)', Math.abs(r[0].slipBottom - r[0].tableTop) <= 1 && Math.abs(r[r.length - 1].slipBottom - r[r.length - 1].tableTop) <= 1, `${r[0].slipBottom}/${r[0].tableTop}`);
      check('lift: settles back at the top', r[r.length - 1].lifted === false || r[r.length - 1].f === 0, JSON.stringify(r[r.length - 1]));
      await page.evaluate(() => { __vc.surfaces.lift.wrap.scrollTop = 600; });
      await wait(page, 500);
      const cov = await page.evaluate(() => document.querySelectorAll('.vc-covered').length);
      // Paul, WP-17 items 4–6: the coins stay on their own level and the scrolled content passes under
      // them (punched out of the edge mask), so they are never covered: none may be inert
      check('lift: the coins stay live while the page is scrolled (WP-17 items 4–6; was: covered coins inert)', cov === 0, String(cov));
      const coinWhat = await page.evaluate(() => { const c = document.querySelector('.vc-coin-print.vc-covered'); const f = c && (c.matches('button,[tabindex],a,input,select') ? c : c.querySelector('button,[tabindex],a,input,select')); f?.focus(); return f ? (c.dataset.coin + ' ' + (document.activeElement === f)) : 'none'; });
      console.log('focused covered coin:', coinWhat);
      await wait(page, 600);
      // Paul, WP-17 items 4–6: a coin is never covered, so focusing it no longer scrolls back (retired)
      await page.evaluate(() => { __vc.surfaces.lift.wrap.scrollTop = 600; document.body.focus(); });
      await wait(page, 300);
      await page.keyboard.press('Home');
      await wait(page, 600);
      check('lift: Home scrolls back to the top', await page.evaluate(() => __vc.surfaces.lift.wrap.scrollTop === 0));
    }

    if (want('menus')) {
      const sels = await page.evaluate(() => [...document.querySelectorAll('#print select')].filter(s => s.id !== 'recordMode' && s.offsetParent).map(s => ({ id: s.id, n: s.options.length })));
      let okMouse = true, okKey = true; const bad = [];
      for (const s of sels) {
        if (!s.id) continue;
        await page.evaluate(id => { const el = document.getElementById(id); el.__n = 0; el.addEventListener('change', () => el.__n++); }, s.id);
        for (let i = 0; i < s.n; i++) {
          // mouse: press the select, click the item
          const before = await page.evaluate(id => document.getElementById(id).selectedIndex, s.id);
          await page.locator('#' + s.id).dispatchEvent('mousedown', { button: 0 });
          await wait(page, 450);
          const item = page.locator(`#float .vc-menu .vc-menu-item[data-index="${i}"]`);
          if (!(await item.count())) { okMouse = false; bad.push(`${s.id} no item ${i}`); continue; }
          await item.click();
          await wait(page, 450);
          const r = await page.evaluate(id => ({ i: document.getElementById(id).selectedIndex, n: document.getElementById(id).__n }), s.id);
          const expectN = before === i ? 0 : 1;
          if (r.i !== i || r.n !== expectN) { okMouse = false; bad.push(`${s.id}#${i} mouse ${JSON.stringify(r)}`); }
          await page.evaluate(id => { document.getElementById(id).__n = 0; }, s.id);
          await idle(page);
        }
        // keyboard: in the open parchment list, Home, ↓ × i, Enter picks option i (the closed
        // select keeps the native keyboard: on macOS ↓ opens the system list, same as flat)
        for (let i = 0; i < s.n; i++) {
          const before = await page.evaluate(id => { const el = document.getElementById(id); el.__n = 0; return el.selectedIndex; }, s.id);
          await page.locator('#' + s.id).dispatchEvent('mousedown', { button: 0 });
          await wait(page, 450);
          await page.keyboard.press('Home');
          for (let k = 0; k < i; k++) await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Enter');
          await wait(page, 450);
          const k = await page.evaluate(id => ({ i: document.getElementById(id).selectedIndex, n: document.getElementById(id).__n, focus: document.activeElement?.id }), s.id);
          if (k.i !== i || k.n !== (before === i ? 0 : 1) || k.focus !== s.id) { okKey = false; bad.push(`${s.id}#${i} key ${JSON.stringify(k)}`); }
          await idle(page);
        }
        // reset
        await page.evaluate(id => { const el = document.getElementById(id); el.selectedIndex = 0; el.dispatchEvent(new Event('change', { bubbles: true })); }, s.id);
        await idle(page);
      }
      check(`menus: every option by mouse, change once per choice (${sels.map(s => s.id + ':' + s.n).join(' ')})`, okMouse, bad.join('; '));
      check('menus: every option by keyboard (open list), change once per choice, focus stays on the select', okKey, bad.join('; '));
      // keyboard inside the parchment list
      const id = sels[0]?.id;
      if (id) {
        await page.locator('#' + id).dispatchEvent('mousedown', { button: 0 });
        await wait(page, 450);
        await page.keyboard.press('End'); await page.keyboard.press('Enter');
        await wait(page, 450);
        const r = await page.evaluate(id => document.getElementById(id).selectedIndex === document.getElementById(id).options.length - 1, id);
        check('menus: open list takes End + Enter', r);
        await page.evaluate(id => { const el = document.getElementById(id); el.selectedIndex = 0; el.dispatchEvent(new Event('change', { bubbles: true })); }, id);
        await idle(page);
      }
      // record switch
      const m0 = await page.evaluate(() => document.getElementById('recordMode').selectedIndex);
      await page.locator('#recordMode').dispatchEvent('mousedown', { button: 0 });
      await wait(page, 300);
      const m1 = await page.evaluate(() => ({ i: document.getElementById('recordMode').selectedIndex, pos: document.querySelector('.vc-rswitch').dataset.pos }));
      check('menus: record switch flips by mouse and moves its lever', m1.i !== m0 && m1.pos === String(m1.i), JSON.stringify(m1));
      await page.locator('#recordMode').dispatchEvent('mousedown', { button: 0 });
      await idle(page);
    }

    if (want('tags')) {
      // add three favourites the way the app does (drag a row onto the header)
      const w = await now(page);
      const added = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('#items tr[data-item]')].slice(0, 3);
        const header = document.querySelector('header');
        for (const row of rows) {
          const dt = new DataTransfer();
          row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
          header.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
          header.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        }
        return document.querySelectorAll('#favorites .favorite').length;
      });
      await wait(page, 400);
      const drop = await page.evaluate(() => [...document.querySelectorAll('#favorites .favorite')].some(e => e.classList.contains('vc-tag-drop')) || __vc.events.some(e => e.type === 'app:favorite-add'));
      check('tags: three tags added, drop-in runs', added >= 3 && drop, String(added));
      // in the sheet's own units (29 px per cm), independent of the camera
      const box = await page.evaluate(() => { const e = document.querySelector('#favorites .favorite'); const cm = parseFloat(getComputedStyle(document.body).getPropertyValue('--cm')) || 29; return { w: (e.offsetWidth + parseFloat(getComputedStyle(e).marginLeft) * 2) / cm, h: e.offsetHeight / cm }; });
      check('tags: 4 × 5 cm', Math.abs(box.w - 4) < 0.15 && Math.abs(box.h - 5) < 0.15, `${box.w.toFixed(2)} × ${box.h.toFixed(2)} cm`);
      await wait(page, 3000);
      const a0 = await page.evaluate(() => __vc.surfaces.tags.read());
      // breeze: a puff of air across the header (Paul, WP-17 item 3: at the tags' new place, x −34.6…−24.6; was x −42)
      const swingPeak = async () => { const p = []; for (let i = 0; i < 14; i++) { await wait(page, 60); p.push(...(await page.evaluate(() => __vc.surfaces.tags.read().map(t => Math.abs(t.swing))))); } return Math.max(...p); };
      const base = await swingPeak();
      for (let i = 0; i < 6; i++) { await page.evaluate(() => __vc.surfaces.poke.air(-29.6, 24.5, 80, 6)); await wait(page, 50); }
      const airPeak = await swingPeak();
      await wait(page, 3500);
      await page.evaluate(() => __vc.surfaces.poke.impact(-34, 20, 1));
      const hitPeak = await swingPeak();
      check('tags: swing on breeze', airPeak > base + 0.3, `idle ${base.toFixed(2)}° → air ${airPeak.toFixed(2)}°`);
      check('tags: swing on impact', hitPeak > base + 0.3, `idle ${base.toFixed(2)}° → impact ${hitPeak.toFixed(2)}°`);
      const peak = Math.max(airPeak, hitPeak);
      check('tags: idle sway present', a0.every(t => t.rotate && t.rotate !== '0deg'), JSON.stringify(a0));
      console.log('tags swing peak after air/impact (deg):', peak.toFixed(3), 'tag:swing events', await page.evaluate(s => __vc.events.filter(e => e.wall >= s && e.type === 'tag:swing').length, w));
    }

    if (want('title')) {
      const samples = [];
      for (let i = 0; i < 8; i++) { samples.push(await page.evaluate(() => __vc.surfaces.title.read())); await wait(page, 1500); }
      const fl = samples.flatMap(s => s.flourishes);
      const touching = fl.filter(f => f.touches);
      check('title: fourteen flourishes (Paul, WP-17 item 22; was six), none touches the letters (8 samples over 12 s)', samples[0].flourishes.length === 14 && touching.length === 0, JSON.stringify(touching.slice(0, 3)));
      const ts = samples[0].flourishes.map(f => f.t);
      check('title: independent phases', new Set(ts).size === ts.length, JSON.stringify(samples[0].flourishes.map(f => [f.name, f.t, f.phase])));
      const phases = new Set(fl.map(f => f.phase));
      check('title: the cycle loops (draw/hold/erase/rest seen)', phases.size >= 3, [...phases].join(','));
    }

    if (want('tips')) {
      const el = page.locator('#desk [title]:visible').first();
      const t = await el.getAttribute('title');
      // WP-17A: the first titled element is the Load coin, which lifts under the pointer; Playwright's
      // hit pre-check then finds the main section (WP-17 items 3–4: it now reaches under the coins) at
      // the old point and retries forever, though real mouse events reach the coin (checked by hand)
      await el.hover({ force: true });
      await wait(page, 800);
      const r = await page.evaluate(() => __vc.surfaces.slips.tooltips.read());
      const cnt = await page.evaluate(() => document.querySelectorAll('[title]').length);
      check('tooltips: paper slip shown, native title moved aside (no double)', r.shown && r.moved && r.text === t, JSON.stringify(r));
      await page.mouse.move(5, 5);
      await wait(page, 200);
      const cnt2 = await page.evaluate(() => document.querySelectorAll('[title]').length);
      check('tooltips: title restored on leave', cnt2 === cnt + 1, `${cnt} → ${cnt2}`);
    }

    if (want('tour')) {
      const w = await now(page);
      // the camera drifts toward the pointer (spring 30 / 10): park it and let the drift settle, so
      // the box each step measured is still where its target is when the pool is read
      await page.mouse.move(720, 450);
      await wait(page, 1500);
      await page.evaluate(() => __vc.tour.start());
      await wait(page, 800);
      const r = await page.evaluate(() => __vc.surfaces.tourLight.read());
      console.log('tour', JSON.stringify(r));
      check('tour: lamp dims to ≈0.35', r && Math.abs(r.k - 0.35) < 0.03, JSON.stringify(r));
      const pools = [];
      const n = await page.evaluate(() => __vc.tour.steps().length);
      for (let i = 0; i < n; i++) {
        await wait(page, 1600); // the pool's spring (90/16) settles in about a second
        const r = await page.evaluate(() => __vc.surfaces.tourLight.read());
        if (r.phase === 'off' || r.phase === 'restoring') break;
        pools.push({ i, pool: r.poolScreen, target: r.targetScreen, vis: r.vis, d: r.poolScreen && r.targetScreen ? +Math.hypot(r.poolScreen[0] - r.targetScreen[0], r.poolScreen[1] - r.targetScreen[1]).toFixed(1) : null });
        await page.keyboard.press('ArrowRight');
      }
      const okPool = pools.length > 1 && pools.every(p => p.d !== null && p.d <= 6);
      check(`tour: light pool sits on each target (${pools.length} steps, ≤6 px)`, okPool, JSON.stringify(pools.map(p => p.d)));
      // every step has a target on the desk (step 2's #categories is a 0-px wrapper there) and the
      // pool moves to it: comparing with a box that never updated hid a pool left on step 1
      const moved = pools.every((p, k) => k === 0 || (p.pool && pools[k - 1].pool && Math.hypot(p.pool[0] - pools[k - 1].pool[0], p.pool[1] - pools[k - 1].pool[1]) > 40));
      check('tour: every step has a target and the pool moves to it', pools.length === n && pools.every(p => p.target && p.vis > 0.99) && moved, JSON.stringify(pools.map(p => [p.pool, p.vis])));
      console.log('tour pools', JSON.stringify(pools));
      if (await page.evaluate(() => __vc.tour.isRunning())) await page.keyboard.press('Escape');
      await wait(page, 900);
      const r2 = await page.evaluate(() => __vc.surfaces.tourLight.read());
      check('tour: lamp restores', r2 && r2.k > 0.99, JSON.stringify(r2));
    }

    if (want('help')) {
      const w = await now(page);
      await page.evaluate(() => { const d = document.querySelector('details.help'); d.querySelector('summary').click(); });
      await wait(page, 2600);
      const r = await page.evaluate(s => {
        const d = document.querySelector('details.help');
        const letter = d.closest('.vc-letter');
        return { open: d.open, inLetter: !!letter, role: letter?.getAttribute('role'), modal: letter?.getAttribute('aria-modal'), ps: d.querySelectorAll(':scope > p').length, forget: !!d.querySelector('#forget'), envelope: !!document.querySelector('#print .vc-letter-envelope.vc-cracked'), focus: !!document.activeElement?.closest('.vc-letter'), pageInert: document.querySelectorAll('[inert]').length,
          ev: __vc.events.filter(e => e.wall >= s).map(e => e.type).filter(t => /help|details:fold|seal/.test(t)) };
      }, w);
      check('help: letter floats as a non-modal sheet (like the original details) with all 7 paragraphs and #forget, envelope cracked', r.open && r.inLetter && r.role === 'dialog' && r.modal === null && r.pageInert === 0 && r.ps === 7 && r.forget && r.envelope && r.focus, JSON.stringify(r));
      check('help: help:open, no details:fold (seal.crack chains its own flaps)', r.ev.includes('help:open') && !r.ev.includes('details:fold'), r.ev.join(','));
      await page.keyboard.press('Escape');
      await wait(page, 2200);
      const b = await page.evaluate(() => { const d = document.querySelector('details.help'); return { open: d.open, back: !d.closest('.vc-letter') && !!d.closest('#print'), envelope: !!document.querySelector('#print .vc-letter-envelope:not([hidden])') }; });
      check('help: Escape folds it back onto the sheet', !b.open && b.back && !b.envelope, JSON.stringify(b));
    }

    if (want('howto')) {
      const w = await now(page);
      await page.evaluate(() => __vc.howTo.open());
      await wait(page, 2600);
      const r = await page.evaluate(s => {
        const ev = __vc.events.filter(e => e.wall >= s);
        const o = ev.find(e => e.type === 'howto:open');
        const panel = document.querySelector('.vc-howto');
        return { open: !!o, folds: ev.filter(e => e.type === 'details:fold' && e.data?.surface === 'howto').map(e => Math.round(e.t - o.t)), float: ev.some(e => e.type === 'details:float' && e.data?.surface === 'howto'), inFloat: !!panel?.closest('#float'), opacity: panel && getComputedStyle(panel).opacity, focus: !!document.activeElement?.closest('.vc-howto') };
      }, w);
      check('howto: howto:open, five folds on the Details rhythm, floats, focus inside', r.open && r.folds.length === 5 && r.folds.every((f, i) => Math.abs(f - i * 250) <= Math.max(25, i * 25)) && r.float && r.inFloat && r.opacity === '1' && r.focus, JSON.stringify(r));
      const w2 = await now(page);
      await page.keyboard.press('Escape');
      await wait(page, 2100);
      const c = await page.evaluate(s => ({ close: __vc.events.filter(e => e.wall >= s && e.type === 'howto:close').length, open: __vc.howTo.isOpen(), left: document.querySelectorAll('#float .vc-unfold').length }), w2);
      check('howto: Escape closes, one howto:close, folds away', c.close === 1 && !c.open && c.left === 0, JSON.stringify(c));
    }

    check('no page errors', errors.length === 0, errors.join(' | '));
  } catch (e) {
    console.error(e); check('run completed', false, String(e).slice(0, 300));
    if (errors.length) console.log(errors.join('\n'));
  } finally {
    await browser.close();
    const f = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - f}/${results.length} passed`);
    process.exit(f ? 1 : 0);
  }
})();
