// @ts-check
/**
 * inline-legacy: a tiny Vite plugin that puts the original save parser (src/core.js) and the
 * catalog (src/catalog.json) into the page exactly the way scripts/build.cjs does:
 *
 *   <script id="catalogData" type="application/json">/*CATALOG*\/</script>  → catalog.json text
 *   <script>/*CORE*\/</script>                                              → core.js text (classic script,
 *                                                                              sets the global ValheimCore)
 *
 * Both files are read as text and inserted byte for byte. The only change is the same safety
 * escape build.cjs applies (`</script` → `<\/script`), and neither file contains that sequence today.
 * Because the replacement runs as a "post" HTML transform, Vite never parses or rewrites the
 * inserted code, in dev and in both builds.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {{ root?: string }} [options] project root (defaults to the Vite root)
 * @returns {import('vite').Plugin}
 */
export default function inlineLegacy(options = {}) {
  /** @type {string} */
  let root = options.root || process.cwd();
  /** @param {string} file */
  const read = file => fs.readFileSync(path.join(root, 'src', file), 'utf8');
  /** Same rule as scripts/build.cjs. @param {string} body */
  const escapeScript = body => body.replace(/<\/script/gi, '<\\/script');

  return {
    name: 'inline-legacy',
    configResolved(config) { if (!options.root) root = config.root; },
    configureServer(server) {
      // Reload the dev page when the inlined files change (they are not part of Vite's module graph).
      for (const file of ['core.js', 'catalog.json']) server.watcher.add(path.join(root, 'src', file));
      server.watcher.on('change', file => {
        if (/src[\\/](core\.js|catalog\.json)$/.test(file)) server.ws.send({ type: 'full-reload' });
      });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        for (const [tag, file] of [['CATALOG', 'catalog.json'], ['CORE', 'core.js']]) {
          const marker = '/*' + tag + '*/';
          if (html.split(marker).length !== 2) throw new Error(`inline-legacy: expected exactly one ${marker} in index.html`);
          const body = escapeScript(read(file));
          html = html.replace(marker, () => body); // function form: no `$&`-style surprises
        }
        return html;
      },
    },
  };
}
