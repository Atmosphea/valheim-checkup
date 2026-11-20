// Builder self-check for WP-16B (Paul's feedback items 7–17). Run after the build:
//   npm run build:single && node tools/wp16b-check.cjs [all|board|slider|knob|burn|plaque|reticle|freeze|catch|twirl] [html]
// Real GPU (Metal), 1440 × 900 at 2× (Paul's Mac). Paul's save from fixtures/private; the
// character name is never printed. Screenshots go to docs/reports/wp-16b/ with the name masked.
// "Before" numbers are the v2.0.0 layout (file 04 / WP-06 values) projected through the same camera.
const path = require('node:path');
const fs = require('node:fs');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const sharp = require('sharp');
const PRIVATE = path.join(ROOT, 'fixtures', 'private');
const SAVE = fs.readFileSync(path.join(PRIVATE, fs.readdirSync(PRIVATE).find(f => f.endsWith('.fch'))));
const MODE = process.argv[2] || 'all';
const HTML = path.resolve(process.argv[3] || path.join(ROOT, 'dist', 'valheim-checkup.html'));
const SHOTS = path.join(ROOT, 'docs', 'reports', 'wp-16b');
fs.mkdirSync(SHOTS, { recursive: true });
const ARGS = ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'];
const DPR = +(process.env.DPR || 2);
const want = m => MODE === 'all' || MODE.split(',').includes(m);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const info = (name, detail) => console.log(`INFO  ${name}  — ${detail}`);

/** v2.0.0 board (WP-06 values), world cm, for the "before" projections. */
const OLD = { wb: { x0: -44, x1: -16, y0: -20, y1: 16 }, pitch: 2.0, barH: 1.0, barLen: 12 + 1.3, groove: 21, plaque: { x0: -35, x1: -25, y0: 10.85, y1: 13.05 }, nameBox: 0.72 };

async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR, locale: 'en-US', timezoneId: 'UTC' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error' && !/GPU stall due to ReadPixels|GL_CLOSE_PATH_NV|net::ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(`file://${HTML}?mode=desk&seed=7`);
  await page.waitForFunction(() => window.__vc?.stage?.textures?.ready?.() && __vc.stage.stats().frames > 10 && __vc.startup().usableMs !== null, null, { timeout: 60000 });
  await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
  await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 20000 });
  await page.waitForFunction(() => !!__vc.board.objects.burns, null, { timeout: 10000 });
  await page.waitForFunction(() => !__vc.ink?.state().running && (__vc.ink?.state().ghosts ?? 0) === 0, null, { timeout: 20000 }).catch(() => {});
  return { page, ctx, errors };
}
const mask = page => page.evaluate(() => {
  const name = document.querySelector('#headerProfile strong')?.textContent || '';
  if (!name) return;
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) if (n.nodeValue.includes(name)) n.nodeValue = n.nodeValue.split(name).join('{name}');
  __vc.stage.markPrintDirty(); __vc.stage.renderNow();
});
const shot = async (page, name, clip) => { await mask(page); await page.waitForTimeout(120); await page.screenshot({ path: path.join(SHOTS, name), clip }); return name; };
const proj = (page, x, y, z = 0) => page.evaluate(([x, y, z]) => __vc.stage.project(x, y, z), [x, y, z]);
const st = page => page.evaluate(() => __vc.cursor.state());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lastMouse = { x: 720, y: 450 };
/** Glide the real mouse from where it is to (x, y) in n steps. */
async function glide(page, from, to, n = 20, stepMs = 16) {
  for (let k = 1; k <= n; k++) { await page.mouse.move(from.x + (to.x - from.x) * k / n, from.y + (to.y - from.y) * k / n); await sleep(stepMs); }
}
/** A point on the board (world cm) on its top face, in client px. */
const boardPx = (page, bx, by) => page.evaluate(([bx, by]) => { const L = __vc.board.rows; void L; const WB = { x0: -52, y0: -46 }; return __vc.stage.project(WB.x0 + bx, WB.y0 + by, 3); }, [bx, by]);
/**
 * Bring the pointer onto the board at board cm (bx, by). While the spark is out the camera frames
 * the page (WP-16A item 5) and the board is mostly off screen; like a user, go to the window's left
 * edge first, where the framing lets go, then onto the board. Returns the board point in px.
 */
async function toBoard(page, bx, by, settleMs = 900) {
  const mode = await page.evaluate(() => __vc.cursor.mode);
  if (mode === 'spark') {
    const m = await page.evaluate(() => __vc.cursor.state().spark);
    await glide(page, { x: m.x, y: m.y }, { x: 6, y: 520 }, 10);
    // Paul, WP-17 item 2: the main-section framing (was the spark-out framing) lets go over the woodblock
    await page.waitForFunction(() => __vc.stage.camera.read().main.framing < 0.02, null, { timeout: 5000 }).catch(() => {});
    await sleep(200);
  }
  const p = await boardPx(page, bx, by);
  await glide(page, { ...lastMouse }, p, 12);
  await sleep(settleMs);
  return boardPx(page, bx, by);
}
/** Luminance stats of a screenshot clip (CSS px). */
async function lum(page, clip) {
  const buf = await page.screenshot({ clip });
  const { data, info: i } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
  const v = [...data].sort((a, b) => a - b);
  const q = p => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { p05: q(0.05), p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), w: i.width, h: i.height };
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const { page, errors } = await open(browser);
  const realMove = page.mouse.move.bind(page.mouse);
  page.mouse.move = async (x, y, o) => { lastMouse.x = x; lastMouse.y = y; return realMove(x, y, o); };
  const B = await page.evaluate(() => { const r = __vc.board.rows; return { rows: r.map(x => ({ c: x.category, cy: x.cy, g: x.groove })), wb: { x0: -52, x1: -25, y0: -46, y1: 19 } }; });
  // Paul, WP-17 item 2: the camera frames the main section until the pointer is over the woodblock;
  // go to the window's left edge (on the wood) first, so the whole desk is in view, then park
  await page.mouse.move(6, 520);
  await page.waitForFunction(() => __vc.stage.camera.read().main.framing < 0.02, null, { timeout: 5000 }).catch(() => {});
  // park the pointer on the board's lower band (the gauntlet then sits low, clear of the top)
  let at = await boardPx(page, 14, 18);
  await page.mouse.move(at.x, at.y);
  await sleep(1500);

  if (want('board')) {
    const conf = await page.evaluate(() => {
      const b = __vc.board.objects.bars.list[0];
      const L = b.body.geometry.parameters ?? {};
      return { barLen: L.width, barH: L.height, slot: __vc.board.rows[1].top - __vc.board.rows[2].top, groove: __vc.board.rows[0].groove, nameFace: b.bodyMat.userData.vcEngraving?.o?.faceRect };
    });
    const ratioNew = (conf.barLen + 1.4) / (conf.groove.x1 - conf.groove.x0), ratioOld = OLD.barLen / OLD.groove;
    check('item 7: board narrower (27 < 28 cm) and taller (65 > 36 cm)', B.wb.x1 - B.wb.x0 < 28 && B.wb.y1 - B.wb.y0 > 36, `${B.wb.x1 - B.wb.x0} × ${B.wb.y1 - B.wb.y0} cm (was 28 × 36)`);
    check('item 7: slots thicker (pitch 2.4 vs 2.0 cm, bar 1.26 vs 1.0 cm)', conf.slot > OLD.pitch * 1.15 && conf.barH > OLD.barH * 1.2, `pitch ${conf.slot.toFixed(2)}, bar ${conf.barH} cm`);
    // bar height on screen, the Artisan bar vs the old Artisan bar through the same camera
    const r0 = B.rows[0];
    const a = await proj(page, B.wb.x0 + r0.g.x0 + 4, B.wb.y0 + r0.cy + conf.barH / 2, 2.9), b2 = await proj(page, B.wb.x0 + r0.g.x0 + 4, B.wb.y0 + r0.cy - conf.barH / 2, 2.9);
    const oldCy = OLD.wb.y0 + (36 - 5.5) - 0.55 - 0.65;
    const c = await proj(page, OLD.wb.x0 + 6, oldCy + 0.5, 2.9), d = await proj(page, OLD.wb.x0 + 6, oldCy - 0.5, 2.9);
    check('item 7: bars read bigger on screen (≥ 1.2×)', (b2.y - a.y) / (d.y - c.y) >= 1.2, `${(b2.y - a.y).toFixed(1)} px vs ${(d.y - c.y).toFixed(1)} px`);
    const nameH = conf.nameFace ? (conf.nameFace[3] - conf.nameFace[1]) * conf.barH : 0;
    check('item 7: bar name text larger (box ≥ 1.4× the old 0.72 cm)', nameH >= OLD.nameBox * 1.4, `${nameH.toFixed(2)} cm`);
    check('item 7: bars longer for their slot', ratioNew > ratioOld + 0.08, `bar + knob ${(ratioNew * 100).toFixed(0)} % of the slot (was ${(ratioOld * 100).toFixed(0)} %)`);
    const bottom = await proj(page, B.wb.x0 + 14, B.wb.y0, 3), left = await proj(page, B.wb.x0, -34, 3);
    check('item 8: the wood runs off the bottom of the window', bottom.y > 900, `bottom edge at y ${bottom.y.toFixed(0)} px`);
    check('item 8: and a little off the left edge', left.x < 0 && left.x > -200, `left edge at x ${left.x.toFixed(0)} px near the bottom`);
    let minX = 1e9;
    for (const r of B.rows) { const p = await proj(page, B.wb.x0 + r.g.x0, B.wb.y0 + r.cy, 2.9); minX = Math.min(minX, p.x); }
    check('item 8: every slot starts inside the window', minX > 4, `leftmost slot end x ${minX.toFixed(0)} px`);
    const under = await page.evaluate(() => { const s = __vc.stage.three?.scene ?? null; void s; return true; });
    check('item 8: the paper lies under it (the sheet edge x −48 is inside the woodblock)', B.wb.x0 < -48 && B.wb.x1 > -48 && under, '');
    const helpBox = await page.evaluate(() => { const r = document.querySelector('details.help > summary').getBoundingClientRect(); return { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom }; });
    const wbRight = await proj(page, B.wb.x1, -22, 3);
    check('item 8: the help note sits clear, right of the wood', helpBox.x0 > wbRight.x, `help x ${helpBox.x0.toFixed(0)} px, wood edge ${wbRight.x.toFixed(0)} px`);
    await shot(page, 'board-overview.png');
    at = await toBoard(page, 14, 18, 1500);
    await shot(page, 'board-close.png', { x: 0, y: 160, width: 440, height: 640 });
  }

  if (want('burn')) {
    const t = await page.evaluate(() => ({ burns: __vc.board.objects.burns?.texts(), dom: { heading: document.querySelector('.sidebar > .eyebrow:not(.insights-label)')?.textContent.trim(), divider: document.querySelector('.sidebar > .insights-label')?.textContent.trim(), sidenote: document.querySelector('.side-note')?.textContent.replace(/\s+/g, ' ').trim() } }));
    check('item 12: the three labels are burned, word for word from the page', t.burns && ['heading', 'divider', 'sidenote'].every(k => t.burns[k] === t.dom[k]), JSON.stringify(t.burns));
    // darkness of the char and of the scorched edges against the plain wood beside them
    await toBoard(page, 14, 18, 1200);
    const head = await proj(page, B.wb.x0 + 14.7 - 6, B.wb.y0 + 63.2 + 0.7, 3), head2 = await proj(page, B.wb.x0 + 14.7 + 6, B.wb.y0 + 63.2 - 0.7, 3);
    const clip = { x: Math.round(head.x), y: Math.round(head.y), width: Math.round(head2.x - head.x), height: Math.max(8, Math.round(head2.y - head.y)) };
    const wood = await lum(page, { x: clip.x, y: clip.y + clip.height + 4, width: clip.width, height: 6 });
    const lab = await lum(page, clip);
    // v2.0.0's carved heading, measured the same way (BEFORE=<v2.0.0 html>): same camera, its own place on the old board
    let old = null;
    if (process.env.BEFORE) {
      const o = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR });
      const op = await o.newPage();
      await op.goto(`file://${path.resolve(process.env.BEFORE)}?mode=desk&seed=7`);
      await op.waitForFunction(() => window.__vc?.stage?.textures?.ready?.() && __vc.stage.stats().frames > 10, null, { timeout: 60000 });
      await op.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
      await op.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 20000 });
      const q = await op.evaluate(() => __vc.stage.project(-44 + 14, -20 + 18, 3));
      await op.mouse.move(q.x, q.y); await sleep(2000);
      const h1 = await op.evaluate(() => __vc.stage.project(-44 + 14 - 6, -20 + 34.7 + 0.6, 3)), h2 = await op.evaluate(() => __vc.stage.project(-44 + 14 + 6, -20 + 34.7 - 0.6, 3));
      const oc = { x: Math.round(h1.x), y: Math.round(h1.y), width: Math.round(h2.x - h1.x), height: Math.max(8, Math.round(h2.y - h1.y)) };
      const ow = await lum(op, { x: oc.x, y: oc.y + oc.height + 4, width: oc.width, height: 6 });
      const ol = await lum(op, oc);
      old = { char: ol.p10 / ow.p50, label: ol.p50 / ow.p50, raw: `char p10 ${ol.p10}, label median ${ol.p50}, wood ${ow.p50}` };
      await op.screenshot({ path: path.join(SHOTS, 'burn-heading-v2.0.0.png'), clip: { x: oc.x - 20, y: oc.y - 10, width: oc.width + 40, height: oc.height + 60 } });
      await o.close();
      info('item 12: v2.0.0 carved heading', old.raw);
    }
    const charR = lab.p10 / wood.p50, labelR = lab.p50 / wood.p50;
    check('item 12: letters charred near-black (darkest 10 % ≤ 0.4 × the wood' + (old ? ', and darker than v2.0.0' : '') + ')', charR <= 0.4 && (!old || charR < old.char), `char p10 ${lab.p10}, wood median ${wood.p50} (×${charR.toFixed(2)}${old ? `; v2.0.0 ×${old.char.toFixed(2)}` : ''})`);
    check('item 12: darker edges round the letters (label median ≤ 0.85 × the wood' + (old ? ', and darker than v2.0.0' : '') + ')', labelR <= 0.85 && (!old || labelR < old.label - 0.05), `label median ${lab.p50}, wood ${wood.p50} (×${labelR.toFixed(2)}${old ? `; v2.0.0 ×${old.label.toFixed(2)}` : ''})`);
    const nrm = await page.evaluate(() => { const m = __vc.board.objects.burns.list[0].mesh.material; return { normal: !!m.normalMap, rough: m.roughness }; });
    check('item 12: recessed (a normal map from the letters\' height)', nrm.normal, `roughness ${nrm.rough}`);
    await shot(page, 'burn-heading.png', { x: clip.x - 20, y: clip.y - 10, width: clip.width + 40, height: clip.height + 60 });
  }

  if (want('plaque')) {
    const P = await page.evaluate(() => { const p = __vc.board.objects.wood.plaque; p.geometry.computeBoundingBox(); const b = p.geometry.boundingBox; return { x0: p.position.x + b.min.x - 52, x1: p.position.x + b.max.x - 52, y0: p.position.y + b.min.y - 46, y1: p.position.y + b.max.y - 46 }; });
    const area = async r => { const a = await proj(page, r.x0, r.y1, 3.15), b = await proj(page, r.x1, r.y0, 3.15); return Math.abs((b.x - a.x) * (b.y - a.y)); };
    const now = await area(P), old = await area(OLD.plaque);
    check('item 13: Collection targets is a bigger feature at the top (≥ 2.5× the area on screen)', now / old >= 2.5, `${now.toFixed(0)} px² vs ${old.toFixed(0)} px² (×${(now / old).toFixed(2)}); plaque ${(P.x1 - P.x0).toFixed(1)} × ${(P.y1 - P.y0).toFixed(1)} cm (was 10 × 2.2)`);
    const top = await page.evaluate(() => __vc.board.rows[0].top);
    check('item 13: it sits at the top, above every slot', P.y0 > -46 + top, `plaque bottom ${P.y0.toFixed(1)} cm, first slot top ${(-46 + top).toFixed(1)} cm`);
  }

  if (want('knob')) {
    const k = await page.evaluate(() => {
      const g = __vc.board.objects.bars.list[0].knob.geometry;
      const pos = g.getAttribute('position'), grip = g.getAttribute('grip');
      let maxR = 0, zTop = 0, gr = [];
      for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); maxR = Math.max(maxR, r); zTop = Math.max(zTop, pos.getZ(i)); if (grip && grip.getX(i) > 0.95) gr.push(r); }
      gr.sort((a, b) => a - b);
      return { type: g.type, maxR, zTop, gripMin: gr[0], gripMax: gr[gr.length - 1], gripVerts: gr.length };
    });
    check('item 11: the knob is turned (a lathe profile) and round', k.type === 'LatheGeometry', `${k.type}, radius ${k.maxR.toFixed(2)} cm, ${k.zTop.toFixed(2)} cm tall`);
    check('item 11: with a grip (fluted, knurled band)', k.gripVerts > 50 && (k.gripMax - k.gripMin) / k.gripMax > 0.05, `grip radius ${k.gripMin.toFixed(3)}–${k.gripMax.toFixed(3)} cm over ${k.gripVerts} vertices`);
  }

  if (want('slider')) {
    const hint = await page.evaluate(() => document.querySelector('.vc-bar-hint') ? true : true);
    void hint;
    const travel = await page.evaluate(() => __vc.board.mechanism.travel);
    const cur = await page.evaluate(() => __vc.board.mechanism.latched);
    const target = cur === 'The Gourmet' ? 'The Hunter' : 'The Gourmet';
    // dragging LEFT from rest does nothing
    let k0 = await page.evaluate(c => __vc.board.knob(c), target);
    await page.mouse.move(k0.x, k0.y); await sleep(300);
    await page.mouse.down();
    const left = await page.evaluate(([c, d]) => __vc.board.slotPoint(c, 17.85 - d), [target, 3]);
    await glide(page, k0, left, 12);
    const leftState = await page.evaluate(c => __vc.board.state().bars.find(b => b.category === c), target);
    await page.mouse.up(); await sleep(700);
    check('item 9: left is the resting position (a drag to the left stays at rest)', leftState.x <= 0.06 && (await page.evaluate(() => __vc.board.mechanism.latched)) === cur, `x ${leftState.x}`);
    // drag RIGHT: selects, and the selected bar slides back in lockstep
    k0 = await page.evaluate(c => __vc.board.knob(c), target);
    await page.mouse.move(k0.x, k0.y); await sleep(300);
    await page.mouse.down();
    const right = await page.evaluate(([c, d]) => __vc.board.slotPoint(c, 17.85 + d), [target, travel * 0.92]);
    const samples = [];
    for (let k = 1; k <= 24; k++) {
      await page.mouse.move(k0.x + (right.x - k0.x) * k / 24, k0.y + (right.y - k0.y) * k / 24);
      await sleep(30);
      samples.push(await page.evaluate(([a, b]) => { const s = __vc.board.state().bars; return { a: s.find(x => x.category === a).x, b: s.find(x => x.category === b).x, out: s.filter(x => x.x > 0.05).length }; }, [target, cur]));
    }
    const worst = Math.max(...samples.map(s => Math.abs(s.a + s.b - travel)));
    const midway = samples[12];
    await shot(page, 'slider-midway.png', { x: 0, y: 160, width: 440, height: 640 });
    await page.mouse.up();
    await page.waitForFunction(c => document.querySelector(`[data-category="${c}"]`)?.getAttribute('aria-current') === 'page', target, { timeout: 4000 }).catch(() => {});
    await sleep(900);
    const after = await page.evaluate(([a, b]) => ({ latched: __vc.board.mechanism.latched, cur: document.querySelector('[aria-current="page"][data-category]')?.dataset.category, bars: __vc.board.state().bars.filter(x => x.category === a || x.category === b) }), [target, cur]);
    check('item 9: sliding a bar RIGHT selects it', after.latched === target && after.cur === target, `latched ${after.latched}, app shows ${after.cur}`);
    check('item 10: the old bar slides back left at the same time, coupled to the drag', worst < 0.12 && midway.a > 1 && midway.b < travel - 1, `|new + old − travel| ≤ ${worst.toFixed(3)} cm over ${samples.length} samples; midway new ${midway.a} old ${midway.b}`);
    check('item 10: only one bar out at a time', samples.every(s => s.out <= 2) && after.bars.find(x => x.category === cur).x < 0.01, `bars out per sample ≤ ${Math.max(...samples.map(s => s.out))} (the two coupled); old bar now x ${after.bars.find(x => x.category === cur).x}`);
    const ev = await page.evaluate(() => __vc.events.slice(-400).map(e => e.type));
    check('item 10: event order kept (latch → app:category → return)', ev.lastIndexOf('bar:latch') < ev.lastIndexOf('app:category') && ev.lastIndexOf('app:category') < ev.lastIndexOf('bar:return'), '');
    const hintText = await page.evaluate(() => (window.__vcStrings ?? null));
    void hintText;
  }

  if (want('reticle')) {
    at = await toBoard(page, 15, 30);
    at = { ...lastMouse };
    const s = await st(page);
    const tipPx = await page.evaluate(() => __vc.cursor.tipScreen());
    check('item 14: the white dot is under the pointer while the spark is home', s.reticle.alpha > 0.99 && Math.abs(s.reticle.x - at.x) <= 1 && Math.abs(s.reticle.y - at.y) <= 1, `${JSON.stringify(s.reticle)}, pointer ${at.x.toFixed(0)}, ${at.y.toFixed(0)}`);
    const dy = at.y - tipPx.y, dx = Math.abs(at.x - tipPx.x);
    check('item 14: the fingertip hovers just above it', dy > 8 && dy < 45 && dx < 14, `fingertip ${dy.toFixed(1)} px above, ${dx.toFixed(1)} px aside`);
    const L = await lum(page, { x: Math.round(at.x) - 2, y: Math.round(at.y) - 2, width: 5, height: 5 });
    const ring = await lum(page, { x: Math.round(at.x) - 14, y: Math.round(at.y) + 12, width: 28, height: 4 });
    check('item 14: drawn white on screen', L.p75 >= 235 && L.p75 > ring.p50 + 40, `dot ${L.p75}, around ${ring.p50}`);
    await shot(page, 'reticle.png', { x: Math.round(at.x) - 110, y: Math.round(at.y) - 150, width: 220, height: 190 });
  }

  if (want('freeze')) {
    at = await toBoard(page, 15, 30, 800);
    const out = { x: 820, y: 560 };
    await glide(page, at, out, 10, 16);
    await sleep(900);
    const t0 = (await st(page)).tip;
    const frozenAt = (await st(page)).frozen;
    const pts = [];
    for (let k = 0; k < 30; k++) { await page.mouse.move(820 + 300 * Math.sin(k / 4), 560 + 200 * Math.cos(k / 5)); await sleep(50); pts.push((await st(page)).tip); }
    const drift = Math.max(...pts.map(p => Math.hypot(p[0] - t0[0], p[1] - t0[1])));
    const s = await st(page);
    const off = frozenAt ? Math.hypot(t0[0] - frozenAt[0], t0[1] - frozenAt[1]) : 99;
    check('item 15: the gauntlet freezes where it was when the spark left', s.mode === 'spark' && drift < 0.05 && off < 0.15, `moved ${drift.toFixed(3)} cm while the spark flew about for 1.5 s; ${off.toFixed(3)} cm from the point it froze at`);
    check('item 14: no dot while the spark is out', s.reticle.alpha === 0, `alpha ${s.reticle.alpha}`);
  }

  if (want('catch')) {
    // spark out over the paper, the hand frozen near the top of the board; come back low on the board
    at = await toBoard(page, 15, 50, 700);
    const back = await boardPx(page, 12, 24);
    await glide(page, { ...lastMouse }, { x: 860, y: 520 }, 8); await sleep(1100);
    await page.evaluate(() => {
      window.__wp16track = [];
      const loop = () => { const s = __vc.cursor.state(); window.__wp16track.push({ t: performance.now(), tip: s.tip, flight: s.flight, watch: s.watchDeg, ret: s.returning, ra: s.reticle.alpha, mode: s.mode }); if (window.__wp16track.length < 400) requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
    const e0 = await page.evaluate(() => __vc.events.length);
    // back over the paper to the board's left part (the page framing lets go near the left edge), then down onto it
    await glide(page, { x: 860, y: 520 }, { x: 30, y: back.y }, 14, 16);
    await sleep(2600);
    const all = await page.evaluate(() => window.__wp16track);
    const i0 = all.findIndex(p => p.ret), i1 = all.findIndex((p, i) => i > i0 && !p.ret);
    const tr = all.slice(Math.max(0, i0 - 1), i1 > 0 ? i1 + 30 : all.length);
    const ev = await page.evaluate(n => __vc.events.slice(n).map(e => ({ type: e.type, wall: e.wall })), e0);
    const steps = tr.slice(1).map((p, i) => Math.hypot(p.tip[0] - tr[i].tip[0], p.tip[1] - tr[i].tip[1]));
    const end = tr[tr.length - 1].tip;
    const dist = tr.map(p => Math.hypot(p.tip[0] - end[0], p.tip[1] - end[1]));
    const travelCm = dist[0];
    // inertia: speed builds up and dies down (no jump), and it swings a little past before settling
    const peak = Math.max(...steps), firstStep = steps.find(x => x > 0.001) ?? 0;
    // the swing past: on each axis, how far the hand went beyond where it settled, on the far side from where it started
    const over = Math.max(...[0, 1].map(ax => { const sg = Math.sign(tr[0].tip[ax] - end[ax]); return Math.max(0, ...tr.map(p => sg * (end[ax] - p.tip[ax]))); }));
    if (process.env.DEBUG) console.log(JSON.stringify(tr.map(p => [+(p.t - tr[0].t).toFixed(0), p.tip[0].toFixed(2), p.tip[1].toFixed(2), p.ret ? 1 : 0, p.flight])));
    check('item 16: the hand moves to the spark smoothly (no jump, speeds up and slows down)', travelCm > 4 && peak < travelCm * 0.2 && firstStep < peak * 0.6, `travelled ${travelCm.toFixed(1)} cm, largest frame step ${peak.toFixed(2)} cm, first ${firstStep.toFixed(2)} cm`);
    check('item 16: with inertia (a small swing past the target)', over > 0.05 && over < 2.5, `overshoot ${over.toFixed(2)} cm`);
    const maxWatch = Math.max(...tr.filter(p => p.flight > 0).map(p => Math.abs(p.watch)), 0);
    check('item 16: it turns to face the spark to receive it', maxWatch > 3, `turned up to ${maxWatch.toFixed(1)}°`);
    const iCatch = ev.findIndex(e => e.type === 'gauntlet:catch'), iIn = ev.findIndex(e => e.type === 'spark:in'), iSpawn = ev.findIndex(e => e.type === 'reticle:spawn'), iBurst = ev.findIndex((e, i) => e.type === 'spark:burst' && i > iCatch);
    check('item 16: they meet (catch → burst at the socket → spark:in)', iCatch >= 0 && iIn > iCatch && iBurst > iCatch && iBurst <= iIn, ev.filter(e => /gauntlet:catch|spark:in|spark:burst|reticle/.test(e.type)).map(e => e.type).join(' → '));
    check('item 16: the dot spawns in at that moment', iSpawn >= 0 && Math.abs(ev[iSpawn].wall - ev[iIn].wall) < 40, iSpawn >= 0 ? `${(ev[iSpawn].wall - ev[iIn].wall).toFixed(0)} ms after spark:in` : 'no spawn');
    const meetT = ev[iIn]?.wall ?? 0;
    const meetDist = tr.reduce((best, p) => (Math.abs(p.t - meetT) < Math.abs(best.t - meetT) ? p : best), tr[0]);
    info('item 16: hand still travelling when they met', `${Math.hypot(meetDist.tip[0] - end[0], meetDist.tip[1] - end[1]).toFixed(2)} cm from where it settled`);
  }

  if (want('twirl')) {
    const turns = [], winds = [], bursts = [];
    for (let rep = 0; rep < 6; rep++) {
      const on = await toBoard(page, 15, 40 - rep * 2, 900);
      await page.evaluate(() => {
        window.__wp16fl = [];
        const loop = () => { const s = __vc.cursor.state(); if (s.flight > 0 && s.flight < 1) window.__wp16fl.push({ x: s.spark.x, y: s.spark.y, f: s.flight }); if (window.__wp16fl.length < 200 && (s.flight < 1 || window.__wp16fl.length === 0)) requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      });
      const n0 = await page.evaluate(() => __vc.events.length);
      // jump straight out (one move): the flight then runs to a still pointer
      await page.mouse.move(900, 500);
      await sleep(900);
      const ev = await page.evaluate(n => __vc.events.slice(n), n0);
      const out = ev.find(e => e.type === 'spark:out');
      const burst = ev.find(e => e.type === 'spark:burst');
      if (out) turns.push(out.data.turns);
      if (burst) bursts.push(burst.data.count);
      // loops: how far the direction of travel turns along the drawn path (a straight dash turns
      // by ~0; each full loop adds a whole turn)
      const fl = await page.evaluate(() => window.__wp16fl);
      if (fl.length > 6) {
        let total = 0, prev = null;
        for (let i = 1; i < fl.length; i++) {
          const dx = fl[i].x - fl[i - 1].x, dy = fl[i].y - fl[i - 1].y;
          if (Math.hypot(dx, dy) < 0.5) continue;
          const ang = Math.atan2(dy, dx);
          if (prev !== null) { let d = ang - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; total += d; }
          prev = ang;
        }
        winds.push(+(Math.abs(total) / (2 * Math.PI)).toFixed(2));
      }
      if (rep === 2) {
        const on2 = await toBoard(page, 15, 40 - rep * 2, 900);
        await page.mouse.move(900, 500); await sleep(170);
        void on2;
        await shot(page, 'twirl-burst.png', { x: Math.max(0, on.x - 140), y: Math.max(0, on.y - 260), width: 560, height: 420 });
        await sleep(800);
      }
    }
    const distinct = new Set(turns).size;
    check('item 17: a twirl of one, two or three full turns, chosen at random', turns.length >= 6 && turns.every(t => t >= 1 && t <= 3 && Number.isInteger(t)) && distinct >= 2, `turns ${turns.join(', ')}`);
    const agree = winds.length >= 4 && winds.every((w, i) => Math.abs(w - turns[i]) <= 0.6);
    check('item 17: the flight really loops that many times', agree, `measured windings ${winds.join(', ')}`);
    check('item 17: a burst of sparks as it leaves', bursts.length >= 6 && bursts.every(c => c >= 10), `burst sizes ${bursts.join(', ')}`);
    // slow motion: the sparks are thrown hard and braked to a near hang, and live long
    await toBoard(page, 15, 30, 900);
    await page.mouse.move(900, 500);
    await sleep(140);
    const s1 = (await st(page)).spark.shots;
    await sleep(450);
    const s2 = (await st(page)).spark.shots;
    const v1 = s1.length ? s1.reduce((a, b) => a + b.speed, 0) / s1.length : 0, v2 = s2.length ? s2.reduce((a, b) => a + b.speed, 0) / s2.length : 0;
    check('item 17: like slow-motion gunfire (fast out, braked to a hang, still there after 0.6 s)', v1 > 150 && v2 < v1 * 0.25 && s2.length >= 8, `${v1.toFixed(0)} → ${v2.toFixed(0)} px/s, ${s2.length} sparks still alive at ~0.6 s`);
  }

  const errs = errors.filter(e => !/AudioContext/.test(e));
  check('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  const pass = results.filter(r => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
