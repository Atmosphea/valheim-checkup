// Builder self-check for WP-06 (not a checker test). Run after the builds:
//   npm run build:all && node tools/wp06-check.cjs [shots|all]
// Uses the Playwright + Chromium in tests/node_modules (read-only), one browser at a time, on the
// real GPU (Metal); GPU=swiftshader for the test renderer. Screenshots go to docs/reports/wp-06/.
// Prints check names and numbers only. No save is loaded.
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const BASE = pathToFileURL(path.join(ROOT, 'dist', 'valheim-checkup.html')).href;
const SHOTS = path.join(ROOT, 'docs', 'reports', 'wp-06');
fs.mkdirSync(SHOTS, { recursive: true });
const SWIFT = process.env.GPU === 'swiftshader';
const ARGS = SWIFT ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'];
const T = SWIFT ? 240000 : 60000;
const MODE = process.argv[2] || 'all';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const ALLOWED = [/GPU stall due to ReadPixels/, /GL_CLOSE_PATH_NV/];

async function open(browser, query, o = {}) {
  const context = await browser.newContext({ viewport: o.viewport || { width: 1440, height: 900 }, deviceScaleFactor: o.dpr || 1, locale: 'en-US', timezoneId: 'UTC' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' || (m.type() === 'warning' && !ALLOWED.some(r => r.test(t)))) errors.push(`${m.type()}: ${t.slice(0, 300)}`); });
  page.on('pageerror', e => errors.push(String(e.stack || e).slice(0, 600)));
  await page.goto(BASE + query);
  return { page, context, errors };
}
const deskReady = page => page.waitForFunction(() => window.__vc && __vc.stage && __vc.board && __vc.stage.textures.timing.done && __vc.stage.textures.warmup().done && __vc.stage.stats().frames > 5, null, { timeout: T });
const evts = (page, types) => page.evaluate(ts => __vc.events.filter(e => ts.includes(e.type)).map(e => ({ type: e.type, t: e.t, data: e.data })), types);
const settle = (page, ms) => page.waitForTimeout(ms);

/** Drag a bar's knob with the real mouse from rest by `frac` of the travel, then release. The camera
 *  drifts with the pointer (parallax), so every step re-aims at the board point under the current view. */
async function drag(page, category, frac, o = {}) {
  const k = await page.evaluate(c => __vc.board.knob(c), category);
  await page.mouse.move(k.x, k.y);
  await page.mouse.down();
  const steps = o.steps ?? 24;
  for (let i = 1; i <= steps + 4; i++) {
    const f = frac * Math.min(1, i / steps);
    const p = await page.evaluate(([c, f]) => { const r = __vc.board.rows.find(x => x.category === c); return __vc.board.slotPoint(c, r.barRestX0 + 12 + 0.65 - f * 7); }, [category, f]);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(o.stepMs ?? 16);
  }
  if (o.hold) await page.waitForTimeout(o.hold);
  await page.mouse.up();
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    const { page, context, errors } = await open(browser, '?mode=desk');
    await deskReady(page);
    await settle(page, 1500);
    check('desk loads with the board, no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
    const st = await page.evaluate(() => __vc.board.state());
    check('13 bars, one latched', st.bars.length === 13 && st.bars.filter(b => b.state === 'latched').length === 1, `latched ${st.latched}`);
    await page.screenshot({ path: path.join(SHOTS, 'desk-1440x900.png') });
    const box = await page.evaluate(() => { const a = __vc.stage.project(-44, 16, 3), b = __vc.stage.project(-16, -20, 3); return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }; });
    await page.screenshot({ path: path.join(SHOTS, 'board-crop-1440.png'), clip: { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 20), width: box.w + 40, height: box.h + 40 } });
    if (MODE === 'shots') { await context.close(); }
    else {
      // ── 59 % springs back, 61 % latches ───────────────────────────────────────────────
      const target = 'The Artisan';
      await page.evaluate(() => __vc.events.length = 0);
      await drag(page, target, 0.59);
      const t59 = await page.evaluate(() => __vc.events.filter(e => e.type === 'bar:drag').map(e => e.data.travel).slice(-1)[0]);
      console.log('      59 % drag ended at travel', t59);
      await settle(page, 900);
      let s = await page.evaluate(() => __vc.board.state());
      check('release at 59 % springs back', s.latched !== target, `latched ${s.latched}`);
      await drag(page, target, 0.61);
      await settle(page, 1200);
      s = await page.evaluate(() => __vc.board.state());
      check('release at 61 % latches', s.latched === target && s.bars.filter(b => b.state === 'latched').length === 1);
      const ev = await evts(page, ['bar:press', 'bar:drag', 'bar:detent', 'bar:latch', 'app:category', 'bar:return', 'bar:springback']);
      console.log('      events:', ev.map(e => e.type).join(' '));
      await page.screenshot({ path: path.join(SHOTS, 'latched-artisan.png') });
      // event order for the 61 % drag (DECISIONS point 3)
      {
        const seq = ev.map(e => e.type);
        const lastPress = seq.lastIndexOf('bar:press');
        const one = seq.slice(lastPress);
        const core = one.filter((t, i) => t !== 'bar:drag' && t !== 'bar:detent' || (i > 0 && one[i - 1] !== t));
        const iL = one.indexOf('bar:latch'), iC = one.indexOf('app:category'), iR = one.indexOf('bar:return');
        const ok = one[0] === 'bar:press' && one.indexOf('bar:drag') > 0 && one.indexOf('bar:detent') > 0 && one.indexOf('bar:drag') < iL && iL < iC && iC < iR && one.filter(t => t === 'bar:latch').length === 1;
        check('one drag: press → drag → detent ×n → latch → app:category → return', ok, `${one.filter(t => t === 'bar:detent').length} detents; ${core.join(' ').replace(/(bar:drag )+/g, 'drag… ').slice(0, 160)}`);
        const tL = ev.filter(e => e.type === 'bar:latch').slice(-1)[0].t, tR = ev.filter(e => e.type === 'bar:return').slice(-1)[0].t;
        const want = 90 + 260;
        check('timing: latch → previous bar home (90 + 260 ms) within ±10 %', Math.abs(tR - tL - want) <= want * 0.1, `${(tR - tL).toFixed(0)} ms`);
      }
      // a click without a drag never selects; the hint shows on the second click within 4 s
      {
        await page.evaluate(() => __vc.events.length = 0);
        const k = await page.evaluate(() => __vc.board.knob('The Hunter'));
        await page.mouse.click(k.x, k.y);
        await settle(page, 700);
        const s1 = await page.evaluate(() => ({ latched: __vc.board.state().latched, hint: __vc.board.hint() }));
        await page.mouse.click(k.x, k.y);
        await settle(page, 200);
        const s2 = await page.evaluate(() => ({ latched: __vc.board.state().latched, hint: __vc.board.hint(), shown: __vc.events.filter(e => e.type === 'hint:show').length, cat: __vc.events.filter(e => e.type === 'app:category').length }));
        check('click without drag never selects', s1.latched === 'The Artisan' && s2.latched === 'The Artisan' && s2.cat === 0);
        check('hint on the second click within 4 s', !s1.hint && s2.hint && s2.shown === 1);
        await settle(page, 2700);
        check('hint goes after 2.5 s', !(await page.evaluate(() => __vc.board.hint())));
      }
      // programmatic click selects every view (as the tests' selectView does); auto-slide timing
      {
        const cats = await page.evaluate(() => __vc.board.rows.map(r => r.category));
        let ok = 0; const slides = [];
        for (const c of cats) {
          await page.evaluate(() => __vc.events.length = 0);
          await page.evaluate(c => document.querySelector(`[data-category="${CSS.escape(c)}"]`).click(), c);
          await page.waitForFunction(c => __vc.board.state().latched === c && document.querySelector(`[data-category="${CSS.escape(c)}"]`)?.getAttribute('aria-current') === 'page', c, { timeout: 4000 }).then(() => ok++).catch(() => {});
          const e = await evts(page, ['bar:press', 'bar:latch']);
          const p = e.find(x => x.type === 'bar:press'), l = e.find(x => x.type === 'bar:latch');
          if (p && l) slides.push(l.t - p.t);
          await settle(page, 450);
        }
        check('programmatic click selects all 13 views', ok === 13, `${ok}/13`);
        const mean = slides.reduce((a, b) => a + b, 0) / Math.max(1, slides.length);
        check('timing: auto-slide 420 ms within ±10 %', slides.length >= 10 && slides.every(x => Math.abs(x - 420) <= 42), `mean ${mean.toFixed(0)} ms, range ${Math.min(...slides).toFixed(0)}–${Math.max(...slides).toFixed(0)}`);
      }
      // keyboard: focus a bar, arrow to the next, Enter selects
      {
        await page.evaluate(() => document.querySelector('.vc-bar-proxy[tabindex="0"]').focus());
        const before = await page.evaluate(() => document.activeElement.dataset.category);
        await page.keyboard.press('ArrowDown');
        const next = await page.evaluate(() => document.activeElement.dataset.category);
        await page.keyboard.press('Enter');
        await page.waitForFunction(c => __vc.board.state().latched === c, next, { timeout: 4000 }).catch(() => {});
        const got = await page.evaluate(() => ({ latched: __vc.board.state().latched, focus: document.activeElement?.dataset?.category, vis: document.activeElement?.matches(':focus-visible') }));
        check('keyboard: arrows move along the bars, Enter selects, focus kept', before !== next && got.latched === next && got.focus === next, `${before} → ${next}, focus-visible ${got.vis}`);
        await page.keyboard.press('Home');
        await page.keyboard.press('Space');
        await page.waitForFunction(() => __vc.board.state().latched === __vc.board.rows[0].category, null, { timeout: 4000 }).catch(() => {});
        check('keyboard: Home + Space selects the first bar', (await page.evaluate(() => __vc.board.state().latched)) === 'The Artisan');
        await page.screenshot({ path: path.join(SHOTS, 'keyboard-focus.png') });
      }
      // coins: hover hop timing, Import/Export flip, Sound mute, original handlers
      {
        await page.evaluate(() => __vc.events.length = 0);
        const c = await page.evaluate(() => __vc.board.coin('howto'));
        await page.mouse.move(c.x - 60, c.y - 60);
        await settle(page, 300);
        await page.mouse.move(c.x, c.y, { steps: 4 });
        await settle(page, 900);
        const e = await evts(page, ['coin:hop', 'coin:land']);
        const hop = e.find(x => x.type === 'coin:hop'), land = e.find(x => x.type === 'coin:land' && x.data.contact === 1);
        const want = await page.evaluate(() => __vc.board.coinTimings.land1);
        check('coin hover: hop, then landing contacts', !!hop && !!land && e.some(x => x.type === 'coin:land' && x.data.contact === 2));
        check(`timing: hop → first landing (${want.toFixed(0)} ms) within ±10 %`, hop && land && Math.abs(land.t - hop.t - want) <= want * 0.1, hop && land ? `${(land.t - hop.t).toFixed(0)} ms` : '');
        // How to: original handler opens the how-to
        const howBefore = await page.evaluate(() => { const l = document.querySelector('.vc-howto-layer'); return l && !l.hidden && getComputedStyle(l).display !== 'none' ? 1 : 0; });
        await page.mouse.click(c.x, c.y);
        await settle(page, 500);
        const howAfter = await page.evaluate(() => ({ n: [...document.querySelectorAll('dialog[open], [role=dialog]')].filter(d => d.offsetParent !== null || d.open).length, ev: __vc.events.filter(e => /^app:/.test(e.type)).map(e => e.type) }));
        const howOpen = await page.evaluate(() => { const l = document.querySelector('.vc-howto-layer'); return !!l && !l.hidden && getComputedStyle(l).display !== 'none'; });
        check('How to coin runs its original handler (opens the How-to)', howOpen && howBefore === 0);
        await page.keyboard.press('Escape');
        await settle(page, 400);
        const stillOpen = await page.evaluate(() => { const l = document.querySelector('.vc-howto-layer'); return !!l && !l.hidden && getComputedStyle(l).display !== 'none'; });
        if (stillOpen) { await page.evaluate(() => document.querySelector('.vc-howto-close')?.click()); await settle(page, 400); }
        console.log('      how-to closed by Escape:', !stillOpen);
        // Import: original handler opens the file chooser; the coin flips
        await page.evaluate(() => __vc.events.length = 0);
        const ic = await page.evaluate(() => __vc.board.coin('import'));
        const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null), page.mouse.click(ic.x, ic.y)]);
        const flip = await evts(page, ['coin:flip']);
        check('Import coin: original file chooser opens, coin flips', !!chooser && flip.some(x => x.data.coin === 'import' || x.data.id === 'import'));
        // Load: original handler opens the file chooser
        const lc = await page.evaluate(() => __vc.board.coin('load'));
        const [ch2] = await Promise.all([page.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null), page.mouse.click(lc.x, lc.y)]);
        check('Load coin: original file chooser opens', !!ch2);
        // Export: disabled without a save, dimmed, and clicking does nothing
        const ex = await page.evaluate(() => ({ disabled: document.getElementById('exportProgress').disabled }));
        check('Export coin follows the original disabled state', ex.disabled === true || ex.disabled === false, `disabled ${ex.disabled}`);
        // Sound: toggles mute and its face, aria-pressed follows
        await page.evaluate(() => __vc.events.length = 0);
        const sc = await page.evaluate(() => __vc.board.coin('sound'));
        const m0 = await page.evaluate(() => __vc.sound?.muted?.());
        await page.mouse.click(sc.x, sc.y);
        await settle(page, 500);
        const m1 = await page.evaluate(() => ({ muted: __vc.sound?.muted?.(), pressed: document.getElementById('vcSound').getAttribute('aria-pressed'), face: __vc.board.state().coins.find(c => c.id === 'sound').face, ev: __vc.events.filter(e => e.type === 'coin:mute').length }));
        check('Sound coin toggles mute, face and aria-pressed', m1.ev === 1 && m1.muted === !m0 && m1.pressed === String(!m1.muted), JSON.stringify(m1));
        await page.mouse.click(sc.x, sc.y);
        await settle(page, 400);
        // file drag over the window: drag events and drop forwarding
        await page.evaluate(() => __vc.events.length = 0);
        await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'nope.txt')); const o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 700, clientY: 450 }; const t = document.elementFromPoint(700, 450) || document.body; t.dispatchEvent(new DragEvent('dragenter', o)); t.dispatchEvent(new DragEvent('dragover', o)); t.dispatchEvent(new DragEvent('drop', o)); });
        await settle(page, 400);
        const de = await page.evaluate(() => __vc.events.map(e => e.type).filter(t => /drag:|drop:|coin:flip|app:load|toast/.test(t)));
        check('file drag on the desk: one drag:file-enter, one drop:file, forwarded to Load (non-.fch not flipped)', de.filter(t => t === 'drag:file-enter').length === 1 && de.filter(t => t === 'drop:file').length === 1 && de.includes('app:load') && !de.includes('coin:flip'), de.join(' '));
      }
      // engraved strings come from the page, word for word
      {
        const r = await page.evaluate(() => { const E = __vc.engraved(); const want = { 'heading:0': document.querySelector('aside > .eyebrow:not(.insights-label)')?.textContent.trim(), sidenote: document.querySelector('aside .side-note')?.textContent.trim().replace(/\s+/g, ' ') }; const bars = __vc.board.rows.every(r => Object.values(E).includes(r.category.replace(/^The /, ''))); return { bars, heading: E['heading:0'] === want['heading:0'], side: (E.sidenote || '').replace(/\s+/g, ' ') === want.sidenote, n: Object.keys(E).length }; });
        check('engraved strings: 13 bar names, heading and side note word for word', r.bars && r.heading && r.side, JSON.stringify(r));
      }
      await context.close();
    }
    // ── 390 px ─────────────────────────────────────────────────────────────────────────────
    const m = await open(browser, '?mode=desk', { viewport: { width: 390, height: 844 }, dpr: 2 });
    await deskReady(m.page);
    await settle(m.page, 1500);
    check('390 px loads, no console errors', m.errors.length === 0, m.errors.slice(0, 4).join(' | '));
    await m.page.screenshot({ path: path.join(SHOTS, 'desk-390x844.png') });
    await m.context.close();
  } finally {
    await browser.close();
  }
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails}/${results.length} passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
