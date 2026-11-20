// Resolves TARGET=baseline | flat | desk to a URL. TARGET_URL overrides everything.
// Confirmed by DECISIONS point 14: flat and desk use dist/valheim-checkup.html?mode=flat|desk, which overrides
// the automatic choice (reduced motion and viewport included).
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const TARGET = process.env.TARGET || 'baseline';
if (!['baseline', 'flat', 'desk'].includes(TARGET)) throw new Error('TARGET must be baseline, flat or desk');

function targetUrl(query = '') {
  if (process.env.TARGET_URL) return process.env.TARGET_URL + query;
  if (TARGET === 'baseline') return pathToFileURL(path.join(ROOT, 'baseline', 'index.html')).href + query;
  const sep = query ? '&' + query.replace(/^\?/, '') : '';
  return pathToFileURL(path.join(ROOT, 'dist', 'valheim-checkup.html')).href + '?mode=' + TARGET + sep;
}

module.exports = { ROOT, TARGET, targetUrl };
