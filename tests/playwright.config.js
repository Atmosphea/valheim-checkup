// Checker-owned Playwright config (WP-00). Run from tests/:  TARGET=baseline npx playwright test
// Chromium is installed inside node_modules (PLAYWRIGHT_BROWSERS_PATH=0), so nothing global is needed.
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const { defineConfig } = require('@playwright/test');

// WP-13 acceptance matrix (opt-in, defaults unchanged): VIEWPORT=900x700 | 390x844, REDUCED=1
// (prefers-reduced-motion: reduce), NOWEBGL=1 (Chrome started with --disable-webgl).
const [vw, vh] = (process.env.VIEWPORT || '1440x900').split('x').map(Number);
const gpuArgs = process.env.GPU === 'swiftshader'
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'];

module.exports = defineConfig({
  testDir: '.',
  testMatch: ['specs/**/*.spec.js', 'census/**/*.spec.js'],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.WORKERS ? +process.env.WORKERS : 2, // 8 GB machine: keep memory pressure down
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    viewport: { width: vw, height: vh },
    ...(process.env.REDUCED ? { reducedMotion: 'reduce' } : {}),
    locale: 'en-US',          // fmt() and toLocaleString() are locale dependent
    timezoneId: 'UTC',        // the byline date is timezone dependent
    acceptDownloads: true,
    launchOptions: {
      // Real GPU (Apple Metal) by default: ~100x faster than software WebGL on this Mac.
      // GPU=swiftshader restores the original software renderer (e.g. on a machine without a usable GPU).
      args: process.env.NOWEBGL ? ['--disable-webgl', '--disable-webgl2'] : gpuArgs,
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
