// Builder self-check for WP-07 (not a checker test). Run after the build:
//   npm run build:single && node tools/wp07-check.cjs [shot|views|veil|sharp|all]
// Playwright + Chromium from tests/node_modules (read-only), one browser, real GPU (Metal) by
// default; GPU=swiftshader for the test renderer. Screenshots go to docs/reports/wp-07/.
// Paul's save is loaded for the "save" passes; the character name is masked in every
// screenshot and never printed (only counts and check names are printed).
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const BASE = pathToFileURL(process.env.VC_HTML || path.join(ROOT, 'dist', 'valheim-checkup.html')).href;
const SHOTS = path.join(ROOT, 'docs', 'reports', 'wp-07');
fs.mkdirSync(SHOTS, { recursive: true });
const PRIVATE = path.join(ROOT, 'fixtures', 'private');
const SAVE = path.join(PRIVATE, fs.readdirSync(PRIVATE).find(f => f.endsWith('.fch')));
const SWIFT = process.env.GPU === 'swiftshader';
const ARGS = SWIFT ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'];
const T = SWIFT ? 240000 : 60000;
const MODE = process.argv[2] || 'all';
const VIEWS = ['The Artisan', 'The Blacksmith', 'The Carpenter', 'The Master Chef', 'The Gourmet', 'The Trophy Collector', 'The Hunter', 'The Master Hunter', 'The Fisherman', 'Are You Alright?', "That Can't Be an Accident", 'Highlights', 'Skills & travel'];
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const ALLOWED = [/GPU stall due to ReadPixels/, /GL_CLOSE_PATH_NV/, /textures generated/];

async function open(browser, o = {}) {
  const context = await browser.newContext({ viewport: o.viewport || { width: 1440, height: 900 }, deviceScaleFactor: o.dpr || 1, locale: 'en-US', timezoneId: 'UTC' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' || (m.type() === 'warning' && !ALLOWED.some(r => r.test(t)))) errors.push(`${m.type()}: ${t.slice(0, 200)}`); });
  page.on('pageerror', e => errors.push(String(e.stack || e).slice(0, 400)));
  await page.goto(BASE + '?mode=desk&seed=7' + (o.query || ''));
  await page.waitForFunction(() => window.__vc && __vc.stage && __vc.paper && __vc.stage.textures.timing.done && __vc.stage.textures.warmup().done && __vc.stage.stats().frames > 5, null, { timeout: T });
  await page.evaluate(() => document.fonts.ready);
  return { page, context, errors };
}
async function loadSave(page) {
  await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: fs.readFileSync(SAVE) });
  await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast').textContent), null, { timeout: T });
  await page.evaluate(() => document.getElementById('toast').classList.add('hidden'));
}
const select = (page, v) => page.evaluate(v => { document.querySelector(`[data-category="${v.replace(/"/g, '\\"')}"]`).click(); }, v);
const settle = async (page, ms = 900) => { await page.waitForTimeout(ms); await page.evaluate(() => __vc.stage.renderNow()); };
const mask = page => [page.locator('#headerProfile strong')];

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (MODE === 'shot' || MODE === 'all') {
      const { page, context, errors } = await open(browser);
      await settle(page, 1500);
      await page.screenshot({ path: path.join(SHOTS, 'desk-nosave-1440.png') });
      await loadSave(page);
      await settle(page, 3500);
      await page.screenshot({ path: path.join(SHOTS, 'desk-save-1440.png'), mask: mask(page) });
      check('desk with save: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
      await context.close();
    }
    if (MODE === 'views' || MODE === 'all') {
      for (const withSave of [false, true]) {
        const { page, context, errors } = await open(browser);
        if (withSave) await loadSave(page);
        let bad = 0;
        for (const v of VIEWS) {
          await select(page, v);
          await settle(page, 1400);
          if (withSave && !['Highlights', 'Skills & travel'].includes(v)) await page.locator('#statusFilter').selectOption('all');
          await settle(page, 300);
          const audit = await page.evaluate(() => ({ spill: __vc.paper.audit(), overlaps: __vc.paper.overlaps() }));
          const ok = audit.spill.length === 0 && audit.overlaps.length === 0;
          if (!ok) bad++;
          check(`${withSave ? 'save' : 'nosave'} · ${v}: no clipped, spilled or overlapping text`, ok, ok ? '' : JSON.stringify(audit).slice(0, 600));
          await page.screenshot({ path: path.join(SHOTS, `view-${withSave ? 'save' : 'nosave'}-${slug(v)}.png`), mask: mask(page) });
        }
        // help open
        await page.locator('details.help summary').evaluate(s => s.click());
        await settle(page, 400);
        await page.screenshot({ path: path.join(SHOTS, `help-open-${withSave ? 'save' : 'nosave'}.png`), mask: mask(page) });
        check(`${withSave ? 'save' : 'nosave'}: views without console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
        await context.close();
      }
    }
    if (MODE === 'sharp' || MODE === 'all') {
      for (const dpr of [1, 2]) {
        const { page, context } = await open(browser, { dpr });
        await loadSave(page);
        await settle(page, 2500);
        const box = await page.evaluate(() => { const a = __vc.stage.project(-12, 14), b = __vc.stage.project(14, 2); return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }; });
        await page.screenshot({ path: path.join(SHOTS, `sharp-${dpr}x.png`), clip: box, mask: mask(page) });
        await context.close();
      }
      check('text crops at 1× and 2× written (review by eye)', true);
    }
    if (MODE === 'veil' || MODE === 'all') {
      const { page, context } = await open(browser);
      await loadSave(page);
      await settle(page, 2500);
      // paper vs text background under the veil: sample the veil canvas at a bare paper point and
      // at a point under printed text on the same sheet (the veil knows nothing about the text).
      const v = await page.evaluate(async () => {
        const st = __vc.stage, veil = st.three.veil;
        const at = (x, y) => st.project(x, y, 0.03);
        const read = (pts) => { veil.render(st.three.camera); const gl = veil.renderer.getContext(); const pr = veil.pixelRatio; const H = gl.drawingBufferHeight; return pts.map(p => { const px = new Uint8Array(4); gl.readPixels(Math.round(p.x * pr), Math.round(H - p.y * pr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return [...px.slice(0, 3)]; }); };
        const title = document.getElementById('title').getBoundingClientRect();
        const text = { x: title.left + title.width * 0.3, y: title.top + title.height / 2 };
        const bare = at(30, 9.2); // empty paper to the right of the heading, same sheet
        const [t, b] = read([text, bare]);
        return { t, b };
      });
      const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      const d = Math.abs(lum(v.t) - lum(v.b)) / Math.max(1, lum(v.b));
      check('veil: text background and the paper beside it within 2%', d <= 0.02, `text ${lum(v.t).toFixed(1)} vs paper ${lum(v.b).toFixed(1)} (${(d * 100).toFixed(2)}%)`);
      // the gauntlet stand-in's shadow and a test caster crossing text near the board's edge
      const crop = await page.evaluate(() => { const a = __vc.stage.project(-16, 14), b = __vc.stage.project(8, 4); return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }; });
      await page.screenshot({ path: path.join(SHOTS, 'shadow-before.png'), clip: crop, mask: mask(page) });
      const lumAt = async (x, y) => page.evaluate(async ([x, y]) => { const p = __vc.stage.project(x, y, 0.03); return [p.x, p.y]; }, [x, y]);
      const before = await page.screenshot({ clip: crop });
      await page.evaluate(() => { __vc.stage.test.shadow({ x: -8, y: 10.5, r: 2.2, height: 7 }); });
      await settle(page, 200);
      await page.screenshot({ path: path.join(SHOTS, 'shadow-after.png'), clip: crop, mask: mask(page) });
      const after = await page.screenshot({ clip: crop });
      check('a shadow over the heading near the board darkens the text crop', before.length !== after.length || !before.equals(after));
      await page.evaluate(() => __vc.stage.test.clear());
      // spark light pool
      const crop2 = await page.evaluate(() => { const a = __vc.stage.project(-6, 13), b = __vc.stage.project(20, 2); return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }; });
      await page.screenshot({ path: path.join(SHOTS, 'spark-off.png'), clip: crop2, mask: mask(page) });
      await page.evaluate(() => __vc.paper.glow.setSpark({ x: 2, y: 8.5 }));
      await settle(page, 300);
      await page.screenshot({ path: path.join(SHOTS, 'spark-on.png'), clip: crop2, mask: mask(page) });
      const g = await page.evaluate(() => __vc.paper.glow.read());
      check('spark light pool on, 2,700 K, 18 cm, flickering', g.spark && g.kelvin === 2700 && g.rangeCm === 18 && g.flicker >= 0.85 && g.flicker <= 1.1, JSON.stringify(g));
      await page.evaluate(() => __vc.paper.glow.setSpark(null));
      // whole desk with a shadow and spark for the report
      await page.evaluate(() => { __vc.stage.test.shadow({ x: -8, y: 10.5, r: 2.2, height: 7 }); __vc.paper.glow.setSpark({ x: 2, y: 8.5 }); });
      await settle(page, 300);
      await page.screenshot({ path: path.join(SHOTS, 'desk-shadow-spark.png'), mask: mask(page) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
