// WP-15: assembles valheim-checkup-3d.zip from the built outputs and the source tree.
// Run after `npm run build:all`:   node scripts/package.cjs [stagingDir]
// Needs the `zip` command (built into macOS). Writes ./valheim-checkup-3d.zip and prints its size.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const stage = path.resolve(process.argv[2] || path.join(root, 'work', 'package'));
const out = path.join(stage, 'valheim-checkup-3d');
const zipPath = path.join(root, 'valheim-checkup-3d.zip');

// Left out of source/ (spec: no node_modules, no dist, no fixtures/private; spec/ and reference/ name the
// character or are Paul's own material; test output, checker screens, saves and exports never ship).
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'fixtures', 'spec', 'reference', 'work', '.claude',
  'test-results', 'playwright-report']);
const EXCLUDE_PATHS = new Set(['checker-reports/screens', 'valheim-checkup-3d.zip']);
const EXCLUDE_FILE = name => /\.fch(\.old)?$/i.test(name) || /valheim-progress.*\.json$/i.test(name) || /\.csv$/i.test(name)
  || name === '.DS_Store' || /^h\d\.png$|^help\.png$/.test(name); // h0–h3/help.png: stray debug screenshots at the root

function copyTree(from, to, rel = '') {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const r = rel ? rel + '/' + ent.name : ent.name;
    if (EXCLUDE_PATHS.has(r)) continue;
    if (ent.isDirectory()) { if (!EXCLUDE_DIRS.has(ent.name)) copyTree(path.join(from, ent.name), path.join(to, ent.name), r); continue; }
    if (ent.isSymbolicLink() || EXCLUDE_FILE(ent.name)) continue;
    fs.copyFileSync(path.join(from, ent.name), path.join(to, ent.name));
  }
}
const need = p => { if (!fs.existsSync(path.join(root, p))) throw new Error('missing ' + p + ' (run npm run build:all first?)'); return path.join(root, p); };

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(need('dist/valheim-checkup.html'), path.join(out, 'valheim-checkup.html'));
copyTree(need('dist/site'), path.join(out, 'site'));
copyTree(root, path.join(out, 'source'));
for (const f of ['START-HERE.md', 'CHANGELOG.md', 'QUESTIONS-FOR-PAUL.md']) if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(out, f));
copyTree(need('docs/explained'), path.join(out, 'docs', 'explained'));
copyTree(need('LICENSES'), path.join(out, 'LICENSES'));
fs.mkdirSync(path.join(out, 'checker-reports'), { recursive: true });
fs.copyFileSync(need('checker-reports/final-audit.md'), path.join(out, 'checker-reports', 'final-audit.md'));

fs.rmSync(zipPath, { force: true });
execFileSync('zip', ['-r', '-X', '-q', zipPath, '.'], { cwd: out, stdio: 'inherit' });
const bytes = fs.statSync(zipPath).size;
console.log(`Wrote ${path.relative(root, zipPath)}: ${bytes} bytes (${(bytes / 1048576).toFixed(2)} MB)`);
