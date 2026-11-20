// @ts-check
/**
 * Override slot (WP-12 step 8): at build time, any `assets/audio/override/<name>.ogg` or `.wav`
 * replaces that sound's recipe (for example `bar.latch.wav`). Vite finds the files when it builds;
 * in the single-file build they are inlined, so the page still needs no network.
 * An override also brings a deferred sound back to life.
 */
const files = import.meta.glob('/assets/audio/override/*.{ogg,wav}', { eager: true, query: '?url', import: 'default' });

/** sound name → URL of the recorded file. @type {Record<string, string>} */
export const overrides = Object.fromEntries(
  Object.entries(files).map(([file, url]) => [file.split('/').pop().replace(/\.(ogg|wav)$/i, ''), /** @type {string} */ (url)]),
);
