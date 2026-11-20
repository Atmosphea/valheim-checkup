const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
let html = fs.readFileSync(path.join(src, 'template.html'), 'utf8');
for (const [tag, file] of [['STYLE', 'style.css'], ['CATALOG', 'catalog.json'], ['CORE', 'core.js'], ['APP', 'app.js']]) {
  let body = fs.readFileSync(path.join(src, file), 'utf8');
  if (tag !== 'STYLE') body = body.replace(/<\/script/gi, '<\\/script');
  if (tag === 'APP') body = body.replace("import { emit } from './bus.js';", 'const emit=()=>{};'); // app.js is an ES module now; the flat original gets a no-op emit (docs/app-js-changes.md)
  html = html.replace('/*' + tag + '*/', () => body);
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true }); fs.writeFileSync(path.join(root, 'dist', 'original.html'), html); // DECISIONS point 7: root index.html is the Vite entry now
console.log('Built dist/original.html');
