// wp12.spec.js — WP-12 (Audio) acceptance, builder-owned. Run: cd tests && TARGET=flat WORKERS=1 npx playwright test specs/wp12.spec.js
// Scope cuts (Paul, DECISIONS): 21 sounds built, 48 deferred (silent), one take each, no ambience.
// Paul, WP-17 item 21: the tavern ambience (amb.hall) is built again; Paul, WP-18 item 15: fold.close is built as the burn crackle: 23 built, 46 deferred.
// Ambience ducking/crossfade acceptance is dropped with the ambience bed.
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const A = require('../helpers/app');
const { ROOT, targetUrl } = require('../helpers/target');

test.skip(A.TARGET !== 'flat', 'WP-12 checks run on the flat target (audio is mode-independent)');

const MIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/config/audio-mix.json'), 'utf8'));
const BUILT = Object.keys(MIX.sounds).filter(n => !MIX.sounds[n].deferred);

const unlock = page => page.mouse.click(2, 2);
const played = page => page.evaluate(() => window.__vc.sound.log.map(e => e.name));
const requested = page => page.evaluate(() => window.__vc.sound.requests.map(r => r.name + (r.played ? '' : ':' + r.why)));
// WP-15: since WP-10 a real load or view change runs the ink sequence, whose stamp and dot sounds keep
// arriving for a second or two. Wait for the ink to be idle before clearing, so those late sounds stay out.
const inkIdle = page => page.waitForFunction(() => !window.__vc.ink || (!window.__vc.ink.state().running && window.__vc.ink.state().ghosts === 0), null, { timeout: 20_000 });
const clearLogs = async page => { await inkIdle(page); await page.evaluate(() => { window.__vc.sound.log.length = 0; window.__vc.sound.requests.length = 0; window.__vc.sound.resetStats(); }); };

test('69 sounds in the mix, 23 built, 46 deferred (WP-17 item 21, WP-18 item 15); every built take renders cleanly offline', async ({ page }) => {
  await A.openApp(page, { query: 'seed=3' });
  expect(Object.keys(MIX.sounds).length).toBe(69);
  expect(BUILT.length).toBe(23); // Paul, WP-17 item 21; WP-18 item 15
  expect(await page.evaluate(() => window.__vc.sound.built().sort())).toEqual([...BUILT].sort());
  expect((await page.evaluate(() => window.__vc.sound.deferred())).length).toBe(46); // Paul, WP-17 item 21; WP-18 item 15
  const rows = await page.evaluate(async names => {
    const out = [];
    for (const n of names) {
      const s = window.__vc.sound.mix().sounds[n];
      const unity = await window.__vc.sound.check(n, 0), mixed = await window.__vc.sound.check(n, s.gain), hot = await window.__vc.sound.check(n, 12);
      out.push({ n, ms: unity.ms, range: unity.range, rms: unity.rmsDb, outRms: unity.outRmsDb, peak: Math.max(unity.peakDb, mixed.peakDb, hot.peakDb), nan: unity.nan + mixed.nan + hot.nan });
    }
    return out;
  }, BUILT);
  for (const r of rows) {
    console.log(`${r.n.padEnd(14)} ${r.ms.toFixed(0).padStart(5)} ms [${r.range}]  rms ${r.rms.toFixed(1)} dBFS  peak after master ${r.peak.toFixed(2)} dBFS`);
    expect(r.rms, r.n).toBeGreaterThan(-50);
    expect(r.outRms, r.n).toBeGreaterThan(-50);
    expect(r.peak, r.n).toBeLessThanOrEqual(-1 + 1e-3);
    expect(r.ms, r.n).toBeGreaterThanOrEqual(r.range[0]);
    expect(r.ms, r.n).toBeLessThanOrEqual(r.range[1]);
    expect(r.nan, r.n).toBe(0);
  }
});

test('no sound before the first interaction; mute survives a reload', async ({ page }) => {
  await A.openApp(page, { query: 'seed=3' });
  await page.evaluate(() => { window.__vc.sound.emit('app:star', { id: 'x', on: true }); window.__vc.sound.emit('app:toast', { text: 'Path copied.' }); });
  expect(await page.evaluate(() => window.__vc.sound.unlocked())).toBe(false);
  expect(await played(page)).toEqual([]);
  expect(await requested(page)).toEqual(['star.on:locked', 'toast.in:locked']);
  await unlock(page);
  expect(await page.evaluate(() => window.__vc.sound.unlocked())).toBe(true);
  await page.evaluate(() => window.__vc.sound.emit('app:star', { id: 'x', on: false }));
  expect(await played(page)).toEqual(['star.off']);
  await page.evaluate(() => window.__vc.sound.mute(true));
  await page.reload();
  await expect(page.locator('#categories [data-category]').first()).toBeAttached();
  expect(await page.evaluate(() => [window.__vc.sound.muted(), localStorage.getItem('valheim-checkup-3d:sound')])).toEqual([true, '0']);
  await unlock(page);
  await page.evaluate(() => window.__vc.sound.emit('app:star', { id: 'x', on: true }));
  expect(await played(page)).toEqual([]);
  expect(await requested(page)).toEqual(['star.on:muted']);
  await page.evaluate(() => window.__vc.sound.mute(false));
  await page.evaluate(() => window.__vc.sound.emit('app:star', { id: 'x', on: true }));
  expect(await played(page)).toEqual(['star.on']);
});

test('scripted sessions: load, failed load, tour, Details, view change, drag-latch, spark — log matches file 06 triggers', async ({ page }) => {
  await A.openApp(page, { query: 'seed=3' });
  await unlock(page);

  // Load (real): app:load ok → load.success, then the "Loaded …" toast → toast.in.
  await clearLogs(page);
  await A.loadSave(page);
  expect(await played(page)).toEqual(['load.success', 'toast.in']);

  // Failed load (real): not a .fch → load.fail (no toast in the original).
  await clearLogs(page);
  await A.setFile(page, '#saveFile', 'notes.txt', Buffer.from('nope'));
  await expect.poll(() => played(page)).toEqual(['load.fail']);

  // Tour (real, WP-03): tour.dim, tour.move ×3, tour.end — all deferred (ui bus), so wired but silent.
  await clearLogs(page);
  await page.getByRole('button', { name: /how to/i }).first().click();
  await page.getByRole('button', { name: 'Show me around' }).click();
  await expect(page.locator('.vc-slip[data-step="1"]')).toBeVisible();
  for (let i = 0; i < 2; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200); }
  await page.keyboard.press('Escape');
  // WP-15: since WP-11/WP-13 the How to button is a coin (coin.up) and How-to unfolds (unfold.flap ×5), and the
  // load toast leaves (toast.out); those belong to their own WPs, so this block checks the tour's sounds only.
  const tourOnly = list => list.filter(n => n.startsWith('tour.'));
  await expect.poll(async () => tourOnly(await requested(page))).toEqual(['tour.dim:deferred', 'tour.move:deferred', 'tour.move:deferred', 'tour.move:deferred', 'tour.end:deferred']);
  expect(tourOnly(await played(page))).toEqual([]);

  // Details open and close (real dialog) + the WP-11 fold events (scripted): 5 flaps rising 1.5 semitones each.
  await A.selectView(page, 'The Master Chef');
  await clearLogs(page);
  await page.locator('[data-details]').first().click();
  await expect(page.locator('#itemDialog')).toHaveJSProperty('open', true);
  // WP-15: since WP-11 the real dialog unfolds with its own 5 fold events, so the scripted unfold is no longer needed.
  // Paul, WP-17 item 27: closing now burns the sheet away and stops an unfold still running, so the
  // close waits for the letter to have opened (as a person would) before the flap is counted.
  await page.waitForFunction(() => !document.querySelector('#float .vc-unfold'));
  // the open letter bobs, so Playwright's "stable" wait never ends: a DOM click, as the parity specs use
  await page.locator('#closeDetails').evaluate(b => b.click());
  await page.waitForTimeout(2000);
  const flaps = await page.evaluate(() => window.__vc.sound.log.filter(e => e.name === 'unfold.flap').map(e => e.pitch));
  // Paul, WP-16 item 25: "Details … not a five-step fold. One step, like opening a letter": one flap sound
  expect(flaps.length).toBe(1);
  expect((await requested(page)).filter(n => n.startsWith('fold.close'))).toEqual(['fold.close']); // the dialog's own close; Paul, WP-18 item 15: now the burn crackle, played

  // View change (scripted WP-10 events): wash.out, wash.in, 4 × stamp.big, 160 × stamp.dot.
  await clearLogs(page);
  await page.evaluate(() => window.__vc.sound.sequences.viewChange());
  const view = await played(page);
  expect(view.slice(0, 6)).toEqual(['wash.out', 'wash.in', 'stamp.big', 'stamp.big', 'stamp.big', 'stamp.big']);
  expect(view.filter(n => n === 'stamp.dot').length).toBe(160);
  const stampPitch = await page.evaluate(() => window.__vc.sound.log.filter(e => e.name === 'stamp.big').map(e => e.pitch));
  [1.0, 0.97, 1.03, 0.95].forEach((p, i) => expect(Math.abs(stampPitch[i] / p - 1)).toBeLessThan(0.021));

  // Drag and latch (scripted WP-06 events): scrape starts, stops at the latch, latch clink, old bar returns.
  await clearLogs(page);
  await page.evaluate(() => window.__vc.sound.sequences.dragLatch());
  await page.waitForTimeout(200);
  const drag = await page.evaluate(() => window.__vc.sound.log.map(e => e.name + (e.phase ? ':' + e.phase : '')));
  expect(drag).toEqual(['bar.scrape:start', 'bar.scrape:stop', 'bar.latch', 'bar.return']);
  expect((await requested(page)).filter(n => /pickup|detent|prelatch|linkage/.test(n))).toEqual(['bar.pickup:deferred', 'bar.detent:deferred', 'bar.detent:deferred', 'bar.detent:deferred', 'bar.prelatch:deferred', 'bar.detent:deferred', 'bar.detent:deferred', 'bar.linkage:deferred']);

  // Spark out and in (scripted WP-09 events): spark.out, crackle loop start … stop, spark.in.
  await clearLogs(page);
  await page.evaluate(() => window.__vc.sound.sequences.sparkOutIn());
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__vc.sound.log.map(e => e.name + (e.phase ? ':' + e.phase : '')))).toEqual(['spark.out', 'spark.crackle:start', 'spark.crackle:stop', 'spark.in']);

  // Coin hop: coin.up, first contact −14 dB, second −22 dB, then 3 chatter hits −28 … −34 dB.
  await clearLogs(page);
  await page.evaluate(() => window.__vc.sound.sequences.coinHop());
  await page.waitForTimeout(300);
  const coin = await page.evaluate(() => window.__vc.sound.log.map(e => [e.name, e.gain]));
  expect(coin.map(c => c[0])).toEqual(['coin.up', 'coin.land', 'coin.land', 'coin.land', 'coin.land', 'coin.land']);
  expect(Math.abs(coin[1][1] + 14)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(coin[2][1] + 22)).toBeLessThanOrEqual(1.5);
  for (const [, g] of coin.slice(3)) { expect(g).toBeLessThanOrEqual(-28); expect(g).toBeGreaterThanOrEqual(-34); }
});

test('The Carpenter view change (40 dots × 4 grids) never has more than 8 stamp.dot voices', async ({ page }) => {
  await A.openApp(page, { query: 'seed=3' });
  await unlock(page);
  await A.loadSave(page);
  await A.selectView(page, 'The Carpenter');
  await clearLogs(page);
  await page.evaluate(() => window.__vc.sound.sequences.viewChange());
  const a = await page.evaluate(() => window.__vc.sound.stats());
  expect(await page.evaluate(() => window.__vc.sound.log.filter(e => e.name === 'stamp.dot').length)).toBe(160);
  expect(a.maxVoices['stamp.dot']).toBeLessThanOrEqual(8);
  // Break attempt: 40 dots in the same instant — the cap still holds, the oldest are cut.
  await clearLogs(page);
  await page.evaluate(() => { for (let i = 0; i < 40; i++) window.__vc.sound.emit('fx:dot', { stamp: 'done', index: i }); });
  const b = await page.evaluate(() => window.__vc.sound.stats());
  console.log(`dot voices: sequence max ${a.maxVoices['stamp.dot']}, burst max ${b.maxVoices['stamp.dot']}, cut ${b.cut}`);
  expect(b.maxVoices['stamp.dot']).toBe(8);
  expect(b.cut).toBeGreaterThanOrEqual(32);
  expect(b.maxTotal).toBeLessThanOrEqual(24);
});

test('?soundboard lists every sound by bus with controls, plays, runs sequences and downloads audio-mix.json in the config format', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(targetUrl('soundboard&seed=3'));
  await expect(page.locator('#soundboard')).toBeVisible();
  await expect(page.locator('#soundboard [data-sound]')).toHaveCount(69);
  expect(await page.locator('#soundboard section[data-bus]').evaluateAll(s => s.map(x => x.dataset.bus))).toEqual(MIX.engine.buses);
  await expect(page.locator('#soundboard [data-sound] button:not([disabled])')).toHaveCount(23); // Paul, WP-17 item 21: amb.hall is built now (was 21); WP-18 item 15: fold.close (crackle)
  await expect(page.locator('#soundboard [data-sequence]')).toHaveCount(6);
  await expect(page.locator('#desk')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play bar.latch' }).click();
  await expect.poll(() => played(page)).toEqual(['bar.latch']);
  await page.locator('[data-sequence="coinHop"]').click();
  await expect.poll(() => played(page)).toContain('coin.up');
  // Change one gain and one pitch, then download.
  await page.getByLabel('bar.latch gain in dB').fill('-12.5');
  await page.getByLabel('stamp.big pitch').fill('0.9');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#soundboardDownload').click()]);
  expect(dl.suggestedFilename()).toBe('audio-mix.json');
  const text = fs.readFileSync(await dl.path(), 'utf8');
  const got = JSON.parse(text);
  expect(text).toBe(JSON.stringify(got, null, 2) + '\n');
  expect(got.sounds['bar.latch'].gain).toBe(-12.5);
  expect(got.sounds['stamp.big'].pitch).toBe(0.9);
  const want = JSON.parse(JSON.stringify(MIX));
  want.sounds['bar.latch'].gain = -12.5; want.sounds['stamp.big'].pitch = 0.9;
  expect(got).toEqual(want);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.getElementById('soundboard').scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
