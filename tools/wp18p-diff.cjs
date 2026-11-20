// WP-18P: same-look check, mid-transition. Two builds (before, after) on the real GPU, 1440 × 900,
// High tier with the governor frozen, seed 7, the pointer parked at the same place. Each content
// transition runs in slow motion (time scale 0.1) and is frozen (time scale 0) at the same point of
// its own progress; then both frames are compared.
//
//   node tools/wp18p-diff.cjs [before.html] [after.html]
//
// Comparison: grey levels in 16 px blocks (the film grain, different every frame, averages out).
// Tolerance: a block "differs" when its mean differs by more than 8 of 255; a transition passes
// when at most 1 % of blocks differ. The screenshots show the private save, so they are written
// under fixtures/private/wp18p-diff only; the numbers go to docs/reports/wp-18p/diff.json.
const path = require('node:path');
const fs = require('node:fs');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const sharp = require('sharp');
const PRIVATE = path.join(ROOT, 'fixtures', 'private');
const SAVE = fs.readFileSync(path.join(PRIVATE, fs.readdirSync(PRIVATE).find(f => f.endsWith('.fch'))));
const SHOTS = path.join(PRIVATE, 'wp18p-diff');
const OUT = path.join(ROOT, 'docs', 'reports', 'wp-18p', 'diff.json');
const pos = process.argv.slice(2).filter(a => !a.startsWith('--'));
const BUILDS = {
  before: path.resolve(pos[0] || path.join(ROOT, 'work', 'wp18p', 'named-before', 'valheim-checkup.html')),
  after: path.resolve(pos[1] || path.join(ROOT, 'work', 'wp18p', 'named-after', 'valheim-checkup.html')),
};
const ARGS = ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'];
const BLOCK = 16, LEVELS = 8, SHARE = 0.01;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** In the page: run `trigger`, then freeze the clock when `cond` holds (checked every frame). */
async function freezeWhen(page, trigger, cond) {
  await page.evaluate(c => {
    window.__frozen = false;
    __vc.timeScale(0.1);
    const t0 = __vc.clock.now();
    const f = new Function('t', `return (${c})`);
    const check = () => { if (f(__vc.clock.now() - t0)) { __vc.timeScale(0); window.__frozen = true; } else requestAnimationFrame(check); };
    window.__arm = () => requestAnimationFrame(check);
  }, cond);
  await trigger();
  await page.evaluate(() => window.__arm());
  await page.waitForFunction(() => window.__frozen, null, { timeout: 60000 });
  await sleep(700); // a few frozen frames drawn
  const png = await page.screenshot();
  await page.evaluate(() => __vc.timeScale(1));
  return png;
}
const idle = page => page.waitForFunction(() => !__vc.ink?.state().running && (__vc.ink?.state().ghosts ?? 0) === 0 && !document.querySelector('.vc-burn, .vc-unfold') && !__vc.surfaces?.rowBurn?.read?.().running, null, { timeout: 30000 }).catch(() => {});
const nav = (page, title) => page.evaluate(t => document.querySelector(`#categories [data-category="${t}"], #insightNav [data-category="${t}"]`).click(), title);

const CASES = [
  ['load save, mid-wash', async p => p.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE }), '__vc.ink.state().running && __vc.ink.state().t >= 500'],
  ['view The Carpenter, mid-wash', p => nav(p, 'The Carpenter'), '__vc.ink.state().running && __vc.ink.state().t >= 300'],
  ['view The Gourmet, mid-wash', p => nav(p, 'The Gourmet'), '__vc.ink.state().running && __vc.ink.state().t >= 300'],
  ['view Highlights, mid-wash', p => nav(p, 'Highlights'), '__vc.ink.state().running && __vc.ink.state().t >= 300'],
  ['view The Master Hunter, mid-wash', p => nav(p, 'The Master Hunter'), '__vc.ink.state().running && __vc.ink.state().t >= 300'],
  ['details open, mid-unfold', p => p.evaluate(() => document.querySelector('#items [data-details]').click()), '!!document.querySelector(".vc-unfold") && t >= 200'],
  ['details close, mid-burn', p => p.keyboard.press('Escape'), '!!document.querySelector(".vc-burn") && t >= 600'],
  ['row-height rescale, mid-burn', async p => { await p.evaluate(() => document.querySelector('[role="slider"]').focus()); for (let i = 0; i < 4; i++) await p.keyboard.press('ArrowUp'); }, '__vc.surfaces.rowBurn.read().running && __vc.surfaces.rowBurn.read().lastMs >= 300'],
];

async function shoot(browser, html) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.goto(`file://${html}?mode=desk&seed=7`);
  await page.waitForFunction(() => window.__vc?.stage?.textures?.ready?.() && __vc.stage.stats().frames > 10 && __vc.startup().usableMs !== null, null, { timeout: 120000 });
  await page.evaluate(() => { __vc.quality('high'); __vc.stage.holdGovernor?.(true); __vc.stage.forceFrameMs(10); });
  await page.mouse.move(1300, 120, { steps: 4 }); // parked over the header: the same framing in both
  await sleep(2500);
  const shots = [];
  for (const [name, trigger, cond] of CASES) {
    shots.push(await freezeWhen(page, () => trigger(page), cond));
    await idle(page); await sleep(1200);
  }
  await ctx.close();
  return { shots, errors };
}
const grey = async buf => { const { data, info: i } = await sharp(buf).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true }); return { data, w: i.width, h: i.height }; };

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ARGS });
  const got = {};
  try {
    for (const [k, html] of Object.entries(BUILDS)) got[k] = await shoot(browser, html);
  } finally { await browser.close(); }
  const rows = [];
  for (let i = 0; i < CASES.length; i++) {
    const a = await grey(got.before.shots[i]), b = await grey(got.after.shots[i]);
    const bw = Math.floor(a.w / BLOCK), bh = Math.floor(a.h / BLOCK);
    let over = 0, worst = 0, sum = 0;
    const heat = Buffer.alloc(bw * bh);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      let d = 0;
      for (let y = by * BLOCK; y < by * BLOCK + BLOCK; y++) for (let x = bx * BLOCK; x < bx * BLOCK + BLOCK; x++) { const j = y * a.w + x; d += a.data[j] - b.data[j]; }
      d = Math.abs(d / (BLOCK * BLOCK));
      sum += d; worst = Math.max(worst, d); if (d > LEVELS) over++;
      heat[by * bw + bx] = Math.min(255, d * 16);
    }
    const share = over / (bw * bh);
    const slug = String(i + 1).padStart(2, '0');
    fs.writeFileSync(path.join(SHOTS, `${slug}-before.png`), got.before.shots[i]);
    fs.writeFileSync(path.join(SHOTS, `${slug}-after.png`), got.after.shots[i]);
    await sharp(heat, { raw: { width: bw, height: bh, channels: 1 } }).resize(bw * 4, bh * 4, { kernel: 'nearest' }).png().toFile(path.join(SHOTS, `${slug}-diff.png`));
    rows.push({ name: CASES[i][0], blocks: bw * bh, over, sharePct: +(share * 100).toFixed(2), worstBlock: +worst.toFixed(1), meanBlock: +(sum / (bw * bh)).toFixed(2), pass: share <= SHARE });
  }
  const res = { tolerance: `a 16 px block differs when its mean grey level differs by more than ${LEVELS}/255; pass = at most ${SHARE * 100} % of blocks differ`, errors: { before: got.before.errors, after: got.after.errors }, rows };
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  console.log('| Transition (frozen mid-way) | Blocks over tolerance | Worst block | Mean | Pass |\n| --- | --- | --- | --- | --- |');
  for (const r of rows) console.log(`| ${r.name} | ${r.over} / ${r.blocks} (${r.sharePct} %) | ${r.worstBlock} | ${r.meanBlock} | ${r.pass ? 'yes' : 'NO'} |`);
  console.log(`errors: before ${got.before.errors.length}, after ${got.after.errors.length}; wrote ${path.relative(ROOT, OUT)}`);
})();
