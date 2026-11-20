// Private-data access. The character name is read only from fixtures/private/expected.json
// (gitignored) and is redacted from everything the checker writes.
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./target');

const PRIVATE = path.join(ROOT, 'fixtures', 'private');
// Paul's save: the single .fch in fixtures/private (its filename is not written here, it contains the name).
const SAVE = path.join(PRIVATE, fs.readdirSync(PRIVATE).find(f => f.endsWith('.fch')));
const OUTPUTS = path.join(PRIVATE, 'baseline-outputs');
const expected = JSON.parse(fs.readFileSync(path.join(PRIVATE, 'expected.json'), 'utf8'));
const NAME = expected.name;

function redact(value) {
  if (typeof value === 'string') return value.split(NAME).join('{name}');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  return value;
}

module.exports = { PRIVATE, SAVE, OUTPUTS, NAME, redact };
