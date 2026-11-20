// Builder self-check for WP-12 build-time steps (not a checker test). Run from the project root:
//   node tools/wp12-mix-check.cjs
// 1. "Dropping a downloaded audio-mix.json into src/config/ and rebuilding changes the gains":
//    writes a copy with bar.latch at −30 dB, rebuilds the single file, plays bar.latch, checks the gain.
// 2. Override slot: writes assets/audio/override/tour.move.wav (a deferred sound), rebuilds, checks
//    that tour:step now plays it. Restores the original config, removes the wav and rebuilds at the end.
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const CONFIG = path.join(ROOT, 'src/config/audio-mix.json');
const WAV = path.join(ROOT, 'assets/audio/override/tour.move.wav');
const URL = pathToFileURL(path.join(ROOT, 'dist/valheim-checkup.html')).href + '?mode=flat&seed=5';
const build = () => execSync('npm run build:single', { cwd: ROOT, stdio: 'ignore' });

/** 0.2 s, 16-bit mono 440 Hz tone. */
function wav() {
  const sr = 22050, n = sr / 5, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sr) * 12000 * (1 - i / n)), 44 + i * 2);
  return b;
}

async function latchGain(browser) {
  const page = await browser.newPage();
  await page.goto(URL);
  await page.waitForFunction(() => window.__vc && window.__vc.sound.emit);
  await page.mouse.click(2, 2);
  await page.evaluate(() => window.__vc.sound.emit('bar:latch', { category: 'The Carpenter', travel: 1 }));
  const r = await page.evaluate(() => ({ config: window.__vc.sound.mix().sounds['bar.latch'].gain, played: window.__vc.sound.log.find(e => e.name === 'bar.latch')?.gain }));
  await page.close();
  return r;
}

(async () => {
  const original = fs.readFileSync(CONFIG, 'utf8');
  const browser = await chromium.launch();
  let ok = true;
  const check = (name, pass, detail) => { ok = ok && pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  — ${detail}`); };
  try {
    build();
    const before = await latchGain(browser);
    const mix = JSON.parse(original);
    mix.sounds['bar.latch'].gain = -30;
    fs.writeFileSync(CONFIG, JSON.stringify(mix, null, 2) + '\n');
    build();
    const after = await latchGain(browser);
    check('rebuilt mix changes the gain', before.config === -10 && after.config === -30 && Math.abs(after.played + 30) <= 1.5,
      `before: config ${before.config} dB, played ${before.played} dB; after: config ${after.config} dB, played ${after.played} dB`);
    fs.writeFileSync(CONFIG, original);

    fs.writeFileSync(WAV, wav());
    build();
    const page = await browser.newPage();
    await page.goto(URL);
    await page.waitForFunction(() => window.__vc && window.__vc.sound.emit);
    await page.mouse.click(2, 2);
    await page.waitForTimeout(500); // overrides decode after unlock
    await page.evaluate(() => window.__vc.sound.emit('tour:step', { step: 1, of: 3 }));
    const r = await page.evaluate(() => ({ played: window.__vc.sound.log.map(e => e.name), deferred: window.__vc.sound.deferred().includes('tour.move') }));
    await page.close();
    check('override wav replaces the recipe (and revives a deferred sound)', r.played.includes('tour.move') && !r.deferred, JSON.stringify(r));
  } finally {
    fs.writeFileSync(CONFIG, original);
    if (fs.existsSync(WAV)) fs.unlinkSync(WAV);
    build();
    await browser.close();
  }
  console.log(fs.readFileSync(CONFIG, 'utf8') === original ? 'config restored' : 'CONFIG NOT RESTORED');
  process.exit(ok ? 0 : 1);
})();
