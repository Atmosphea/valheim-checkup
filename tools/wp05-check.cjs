// Builder self-check for WP-05 (not a checker test). Run after the builds:
//   npm run build:all && node tools/wp05-check.cjs
// Uses the Playwright + Chromium in tests/node_modules (read-only), one browser at a time.
// GPU: the real GPU through Metal by default, so the High-tier timing means something
// (SwiftShader is ~100× slower); GPU=swiftshader runs the same checks on the test renderer.
// Screenshots go to docs/reports/wp-05/. Prints check names and numbers only. No save is loaded.
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const sharp = require('sharp');
const BASE = pathToFileURL(path.join(ROOT, 'dist', 'valheim-checkup.html')).href;
const SHOTS = path.join(ROOT, 'docs', 'reports', 'wp-05');
fs.mkdirSync(SHOTS, { recursive: true });
const SWIFT = process.env.GPU === 'swiftshader';
const ARGS = SWIFT ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'];
const T = SWIFT ? 240000 : 60000;

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const ALLOWED = [/GPU stall due to ReadPixels/, /GL_CLOSE_PATH_NV/];

async function open(browser, query, o = {}) {
  const context = await browser.newContext({ viewport: o.viewport || { width: 1440, height: 900 }, deviceScaleFactor: o.dpr || 1, locale: 'en-US', timezoneId: 'UTC' });
  const page = await context.newPage();
  const errors = [], logs = [];
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' || (m.type() === 'warning' && !ALLOWED.some(r => r.test(t)))) errors.push(`${m.type()}: ${t.slice(0, 200)}`); if (m.type() === 'info') logs.push(t); });
  page.on('pageerror', e => errors.push(String(e)));
  // record the warm-up exposure on every frame, from inside the page
  await page.addInitScript(() => { const wu = (window.__wu = []); const tick = () => { const s = window.__vc && __vc.stage && __vc.stage.textures.warmup(); if (s && !s.done) wu.push(s.exposure); else if (s && s.done) { wu.push(s.exposure); return; } requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await page.goto(BASE + query);
  return { page, context, errors, logs };
}
const materialsReady = page => page.waitForFunction(() => window.__vc && __vc.materials && __vc.materials.ready && __vc.materials.frames() > 3, null, { timeout: T });
const deskReady = page => page.waitForFunction(() => window.__vc && __vc.stage && __vc.stage.textures.timing.done && __vc.stage.textures.warmup().done && __vc.stage.stats().frames > 5, null, { timeout: T });

/** Mean abs difference across the wrap seam vs between neighbouring interior columns/rows. */
function seamRatio(bytes, w, h) {
  const px = (x, y) => (y * w + x) * 4;
  const diffCols = (a, b) => { let s = 0; for (let y = 0; y < h; y++) for (let c = 0; c < 4; c++) s += Math.abs(bytes[px(a, y) + c] - bytes[px(b, y) + c]); return s / (h * 4); };
  const diffRows = (a, b) => { let s = 0; for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) s += Math.abs(bytes[px(x, a) + c] - bytes[px(x, b) + c]); return s / (w * 4); };
  let inU = 0, inV = 0;
  const n = 8;
  for (let i = 1; i <= n; i++) { const x = Math.floor(i * w / (n + 1)); inU += diffCols(x, x + 1); const y = Math.floor(i * h / (n + 1)); inV += diffRows(y, y + 1); }
  inU /= n; inV /= n;
  const su = diffCols(w - 1, 0), sv = diffRows(h - 1, 0);
  return { u: su / Math.max(inU, 1e-6), v: sv / Math.max(inV, 1e-6), su, sv };
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    const renderer = await (async () => { const { page, context } = await open(browser, '?mode=flat'); const r = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); }); await context.close(); return r; })();
    console.log(`GPU: ${renderer}`);

    // ── ?materials renders every material in file 05 ────────────────────────────────────────
    {
      const { page, context, errors } = await open(browser, '?materials&seed=7');
      await materialsReady(page);
      await page.waitForTimeout(400);
      const info = await page.evaluate(() => ({
        table: __vc.materials.table.map(m => m.name), cards: __vc.materials.cards,
        labels: [...document.querySelectorAll('.vc-mr-label b')].map(b => b.textContent),
        meshes: __vc.materials.cards.map(id => __vc.materials.three.scene.getObjectByName(`card-${id}`).children.length),
      }));
      const want = ['Brushed steel', 'Engraving', 'Knurling', 'Polished gauntlet steel', 'Gauntlet reflections', 'Leather', 'Rivets', 'Gold', 'Brass', 'Oiled wood', 'Paper', 'Desk'];
      check('?materials: one card per file 05 material, in table order', JSON.stringify(info.labels) === JSON.stringify(want), `${info.labels.length} cards: ${info.labels.join(', ')}`);
      check('?materials: every card has the four sample shapes', info.meshes.every(n => n === 4), info.meshes.join(','));
      const f0 = await page.evaluate(() => __vc.materials.frames());
      await page.waitForTimeout(600);
      const f1 = await page.evaluate(() => __vc.materials.frames());
      check('?materials: shapes keep turning (frames advance)', f1 > f0, `${f1 - f0} frames in 0.6 s`);
      await page.screenshot({ path: path.join(SHOTS, 'materials-1440.png') });
      check('?materials (1440 × 900): no console errors or warnings', errors.length === 0, errors.slice(0, 3).join(' | '));

      // brushed steel highlight
      const hi = await page.evaluate(async () => ({ a: await __vc.materials.measureHighlight(), b: await __vc.materials.measureHighlight({ anisotropy: 0 }) }));
      check('brushed steel: key-light highlight stretched along the brushing direction ≥ 4:1', hi.a.ratio >= 4, `σu/σv = ${hi.a.ratio.toFixed(2)} (anisotropy 0.85); ${hi.b.ratio.toFixed(2)} with anisotropy 0`);

      // seams in the tiling textures
      const seamFn = seamRatio.toString();
      const seams = await page.evaluate(async src => {
        const seamRatio = eval('(' + src + ')');
        const t = __vc.materials.three.tex;
        const out = {};
        for (const name of ['walnut.albedo', 'walnut.normal', 'walnut.roughness', 'brushedSteel.roughness', 'brushedSteel.normal', 'knurl.normal', 'hammered.normal', 'hammered.data', 'leather.normal', 'grain.ink', 'grain.film']) {
          const [g, k] = name.split('.');
          const rt = t.out[g] && t.out[g][k];
          if (!rt) { out[name] = null; continue; }
          out[name] = seamRatio(await t.painter.read(rt), rt.width, rt.height);
        }
        return out;
      }, seamFn);
      const bad = [];
      const rows = [];
      for (const [name, r] of Object.entries(seams)) {
        if (!r) { bad.push(name + ' (missing)'); continue; }
        rows.push(`${name} ${r.u.toFixed(2)}/${r.v.toFixed(2)}`);
        // a seam counts only if it is both unusual (ratio) and more than ~1.5 levels of 255 (visible)
        if ((r.u > 1.6 && r.su > 1.5) || (r.v > 1.6 && r.sv > 1.5)) bad.push(`${name} (seam ${r.su.toFixed(2)}/${r.sv.toFixed(2)} levels)`);
        else if (r.u > 1.6 || r.v > 1.6) rows.push(`(${name}: seam ${r.su.toFixed(2)}/${r.sv.toFixed(2)} of 255, below visibility)`);
      }
      check('tiling textures: the wrap seam differs no more than ordinary neighbours (ratio ≤ 1.6, or under 1.5/255)', bad.length === 0, (bad.length ? 'bad: ' + bad.join(', ') + '; ' : '') + rows.join(', '));
      await context.close();
    }
    {
      const { page, context, errors } = await open(browser, '?materials&seed=7', { viewport: { width: 390, height: 844 }, dpr: 2 });
      await materialsReady(page);
      await page.waitForTimeout(400);
      const fits = await page.evaluate(() => [...document.querySelectorAll('.vc-mr-label')].every(l => { const r = l.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }) && document.documentElement.scrollWidth <= innerWidth);
      await page.screenshot({ path: path.join(SHOTS, 'materials-390.png') });
      check('?materials (390 px): labels inside the window, no sideways scroll, no errors', fits && errors.length === 0, errors.slice(0, 2).join(' | '));
      await context.close();
    }

    // ── polished gauntlet steel at 2× pixel ratio ──────────────────────────────────────────
    for (const id of ['gauntletSteel', 'gauntletReflections']) {
      const { page, context } = await open(browser, `?materials=${id}&seed=7`, { dpr: 2 });
      await materialsReady(page);
      await page.evaluate(() => __vc.materials.turning(false));
      await page.waitForTimeout(500);
      const png = await page.screenshot({ path: path.join(SHOTS, `${id}-2x.png`) });
      fs.writeFileSync(path.join(SHOTS, `${id}-2x-crop.png`), await sharp(png).extract({ left: 300, top: 500, width: 2200, height: 700 }).png().toBuffer());
      // the box's long side faces the camera and the paper: average colour of that face
      const side = await sharp(png).extract({ left: 640, top: 900, width: 200, height: 60 }).raw().toBuffer({ resolveWithObject: true });
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < side.data.length; i += side.info.channels) { r += side.data[i]; g += side.data[i + 1]; b += side.data[i + 2]; n++; }
      results[`side-${id}`] = [r / n, g / n, b / n];
      await context.close();
    }
    {
      const a = results['side-gauntletSteel'], b = results['side-gauntletReflections'];
      const warm = c => c[0] - c[2];
      check('gauntlet steel: the cube reflections pick up the warm paper (box side warmer and brighter than studio-only)', warm(b) > warm(a) + 10 && b[0] > a[0], `studio only rgb(${a.map(v => v.toFixed(0))}) → with reflections rgb(${b.map(v => v.toFixed(0))})`);
    }

    // ── determinism: the same seed gives the same bytes ────────────────────────────────────
    {
      const hashes = [];
      for (const seed of [7, 7, 8]) {
        const { page, context } = await open(browser, `?mode=desk&seed=${seed}`);
        await deskReady(page);
        hashes.push(await page.evaluate(() => __vc.stage.textures.hash()));
        await context.close();
      }
      const names = Object.keys(hashes[0]);
      const same = names.every(n => hashes[0][n] === hashes[1][n]);
      const differ = names.filter(n => hashes[0][n] !== hashes[2][n]);
      check('same seed (7, two page loads): every texture hash identical', same && names.length >= 18, `${names.length} textures, e.g. paper.albedo ${hashes[0]['paper.albedo']}`);
      check('other seed (8): the generated textures change', differ.length >= names.length - 1, `${differ.length}/${names.length} differ (the engraving atlas is text, not noise)`);
    }

    // ── the desk: timing, memory, warm-up, engraving list, paper ───────────────────────────
    {
      const runs = [];
      let shot = null;
      for (let i = 0; i < 3; i++) {
        const { page, context, errors, logs } = await open(browser, '?mode=desk&seed=7');
        await deskReady(page);
        const samples = await page.evaluate(() => window.__wu || []);
        const info = await page.evaluate(() => ({ t: __vc.stage.textures.timing, tier: __vc.stage.stats().tier, exposure: __vc.materials ? 1 : __vc.stage.three.renderer.toneMappingExposure, mem: __vc.stage.gpuMemory(), engraved: __vc.engraved(), shared: __vc.stage.textures.shared(), cats: [...document.querySelectorAll('#categories [data-category], #insightNav [data-category]')].map(b => b.dataset.category), grain: getComputedStyle(document.querySelector('.vc-grain-noise')).backgroundImage.slice(0, 30), vars: [getComputedStyle(document.getElementById('desk')).getPropertyValue('--vc-paper').length, getComputedStyle(document.getElementById('desk')).getPropertyValue('--vc-ink-grain').length] }));
        runs.push({ ...info, errors, logs, samples });
        if (i === 0) { await page.waitForTimeout(300); shot = await page.screenshot({ path: path.join(SHOTS, 'desk-1440x900.png') }); }
        await context.close();
      }
      const ms = runs.map(r => r.t.totalMs);
      const logged = runs.every(r => r.logs.some(l => /textures generated in \d+ ms/.test(l)) || r.errors.some(e => /textures generated/.test(e)));
      check('generation time is logged on every load', logged, runs[0].logs.find(l => /textures generated/.test(l)) || '');
      check(`generation under ${600} ms on High${SWIFT ? ' (SwiftShader: informational)' : ''}`, SWIFT || ms.every(m => m < 600), `${ms.map(m => m.toFixed(0)).join(' / ')} ms; GPU work done at ${runs.map(r => r.t.gpuMs.toFixed(0)).join(' / ')} ms; fonts ${runs[0].t.fonts}`);
      const r0 = runs[0];
      check('High tier chosen and GPU memory estimate under 300 MB (1440 × 900, 1×)', (SWIFT || r0.tier === 'high') && r0.mem.mb < 300, `tier ${r0.tier}, ${r0.mem.mb} MB: ${Object.entries(r0.mem.parts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      const s = r0.samples;
      const rising = s.length >= 3 && s.every((v, i) => i === 0 || v >= s[i - 1] - 1e-6) && s[0] < 0.5 && Math.abs(s[s.length - 1] - r0.exposure) < 0.005;
      check('startup: the desk fades up from candle-dark (exposure rises to its set value)', rising, `${s.length} samples: ${s.slice(0, 6).map(v => v.toFixed(2)).join(' → ')} … ${s[s.length - 1].toFixed(3)}`);
      const eng = r0.engraved;
      const bars = r0.cats.filter(c => eng[`bar:${c}`] === c);
      check('__vc.engraved() lists every bar name word for word, plus coins, headings, side note, plaque digits', bars.length === r0.cats.length && eng['coin:load'] && eng['sidenote'] && eng['plaque:digits'] && eng['heading:0'], `${Object.keys(eng).length} slots; ${bars.length}/${r0.cats.length} bars; coin:load "${eng['coin:load']}"`);
      check('shared: paper normal bitmap in the veil, paper and ink-grain data URLs on #desk, film grain in #grain', r0.shared.paperNormalBitmap && r0.vars[0] > 1000 && r0.vars[1] > 1000 && r0.grain.startsWith('url("data:image/png'), JSON.stringify(r0.shared));
      check('desk: no console errors or warnings', runs.every(r => r.errors.filter(e => !/textures generated/.test(e)).length === 0), runs.flatMap(r => r.errors).slice(0, 3).join(' | '));
    }
    {
      const { page, context } = await open(browser, '?mode=desk&seed=7', { dpr: 2 });
      await deskReady(page);
      const m = await page.evaluate(() => __vc.stage.gpuMemory());
      check('2× screen on High: the pixel ratio is fitted so the estimate stays under 300 MB', m.mb < 300 && m.pixelRatio >= 1, `device 2× → rendering ${m.pixelRatio}×, ${m.mb} MB`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const list = results.filter(r => r && r.name);
  const pass = list.filter(r => r.ok).length;
  console.log(`\n${pass}/${list.length} passed`);
  process.exit(pass === list.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
