import test from 'node:test';
import assert from 'node:assert/strict';
import { emit, clearEvents, setNameSource, addSecretSource, resetNames, toastKind, redact } from '../src/bus.js';
import '../src/debug.js';

const NAME = 'Testvik'; // a made-up name, never the real one
const PROFILE_ID = '1234567890123'; // made-up profile id
const FINGERPRINT = 'ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12'; // made-up hash
const vcEvents = () => globalThis.__vc.events;

test('a toast containing the name is stored redacted in __vc.events as {kind, text}', () => {
  resetNames(); clearEvents();
  setNameSource(() => NAME);
  emit('app:toast', { text: `Loaded ${NAME}. Progress is up to date.` });
  const last = vcEvents().at(-1);
  assert.equal(last.type, 'app:toast');
  assert.deepEqual(last.data, { kind: 'loaded', text: 'Loaded {name}. Progress is up to date.' });
  assert.ok(!JSON.stringify(vcEvents()).includes(NAME));
});

test('listeners get the redacted data too', async () => {
  resetNames(); clearEvents();
  setNameSource(() => NAME);
  const { on } = await import('../src/bus.js');
  let seen;
  const off = on('app:toast', d => { seen = d; });
  emit('app:toast', { text: `Loaded ${NAME}. Progress is up to date.` });
  off();
  assert.equal(seen.text, 'Loaded {name}. Progress is up to date.');
});

test('other events (app:load, nested data) are redacted as well', () => {
  resetNames(); clearEvents();
  setNameSource(() => NAME);
  emit('app:load', { ok: false, error: `Something about ${NAME}` });
  emit('app:favorite-add', { category: 'x', id: 'y', extra: [{ note: `${NAME} and ${NAME}` }] });
  assert.equal(vcEvents().at(-2).data.error, 'Something about {name}');
  assert.equal(vcEvents().at(-1).data.extra[0].note, '{name} and {name}');
});

test('a name stays redacted after the source changes or clears (Load another / Forget)', () => {
  resetNames(); clearEvents();
  let current = NAME;
  setNameSource(() => current);
  emit('app:render', { view: 'v' });            // learns the first name
  current = 'Othervik'; emit('app:render', {}); // learns the second
  current = null;                               // Forget: header empty
  emit('app:toast', { text: `${NAME} / Othervik` });
  assert.equal(vcEvents().at(-1).data.text, '{name} / {name}');
});

test('the emitter\'s own object is not modified; no source means no redaction', () => {
  resetNames(); clearEvents();
  setNameSource(() => NAME);
  const data = { text: `Loaded ${NAME}. Progress is up to date.` };
  emit('app:toast', data);
  assert.equal(data.text, `Loaded ${NAME}. Progress is up to date.`);
  resetNames();
  emit('app:category', { title: 'The Artisan' });
  assert.deepEqual(vcEvents().at(-1).data, { title: 'The Artisan' });
});

test('toast kinds cover every notify() text in app.js', () => {
  const cases = {
    'Loaded {name}. Progress is up to date.': 'loaded',
    'This name has no reliable save mapping, or several variants share the same identifier.': 'unverified',
    'Lifetime actions may include actions that did not earn achievement credit.': 'lifetime',
    'Count added to header.': 'favorite-added',
    'Already in your header.': 'favorite-duplicate',
    'Keep up to six favorite counts. Remove one to add another.': 'favorite-full',
    'Private note saved.': 'note-saved',
    'Correction saved. Recorded counts are unchanged.': 'correction-saved',
    'Progress restored.': 'progress-restored',
    'Something new': 'other',
  };
  for (const [text, kind] of Object.entries(cases)) assert.equal(toastKind(text), kind, text);
});

// WP-01 round 2 (checker fix 1): any letter case, plus profile id and fingerprint.

test('the name is redacted in any letter case (search typed in lower or upper case)', () => {
  resetNames(); clearEvents();
  setNameSource(() => NAME);
  emit('app:filter', { name: 'search', value: `${NAME.toLowerCase()} soup` });
  emit('app:filter', { name: 'search', value: NAME.toUpperCase() });
  emit('app:filter', { name: 'search', value: 'tEsTvIk' });
  assert.deepEqual(vcEvents().slice(-3).map(e => e.data.value), ['{name} soup', '{name}', '{name}']);
  assert.ok(!JSON.stringify(vcEvents()).toLowerCase().includes(NAME.toLowerCase()));
});

test('names that differ only in case are remembered once', () => {
  resetNames(); clearEvents();
  let current = NAME;
  setNameSource(() => current);
  emit('app:render', {});
  current = NAME.toUpperCase(); emit('app:render', {});
  current = null;
  emit('app:filter', { name: 'search', value: `${NAME} and ${NAME.toLowerCase()}` });
  assert.equal(vcEvents().at(-1).data.value, '{name} and {name}');
});

test('the profile id and the fingerprint are registered as secrets and redacted', () => {
  resetNames(); clearEvents();
  addSecretSource(() => ({ name: NAME, profileId: PROFILE_ID, fingerprint: FINGERPRINT }));
  emit('app:filter', { name: 'search', value: PROFILE_ID });
  emit('app:filter', { name: 'search', value: `x ${FINGERPRINT.toUpperCase()} y` });
  emit('app:load', { ok: false, error: `${NAME}/${PROFILE_ID}/${FINGERPRINT}` });
  assert.deepEqual(vcEvents().slice(-3).map(e => e.data.value ?? e.data.error),
    ['{profile}', 'x {fingerprint} y', '{name}/{profile}/{fingerprint}']);
  const all = JSON.stringify(vcEvents()).toLowerCase();
  for (const secret of [NAME, PROFILE_ID, FINGERPRINT]) assert.ok(!all.includes(secret.toLowerCase()));
});

test('secrets stay redacted after the sources clear (Forget), and regex characters are literal', () => {
  resetNames(); clearEvents();
  let s = { name: 'Bjørn (the) *Bold*', profileId: PROFILE_ID, fingerprint: FINGERPRINT };
  addSecretSource(() => s);
  emit('app:render', {});
  s = { name: null, profileId: null, fingerprint: null };
  assert.equal(redact('bjørn (THE) *bold* ' + PROFILE_ID), '{name} {profile}');
  assert.equal(redact('Bjørn the Bold'), 'Bjørn the Bold'); // only the literal text matches
});

test('a placeholder is never redacted again, even if a secret matches its letters', () => {
  resetNames(); clearEvents();
  addSecretSource(() => ({ name: 'name', profileId: 'file' }));
  emit('app:toast', { text: 'Loaded name. Progress is up to date.' });
  emit('app:filter', { name: 'search', value: 'name profile file' });
  assert.equal(vcEvents().at(-2).data.text, 'Loaded {name}. Progress is up to date.');
  assert.equal(vcEvents().at(-1).data.value, '{name} pro{profile} {profile}');
});

test('a throwing source never breaks emit', () => {
  resetNames(); clearEvents();
  addSecretSource(() => { throw new Error('storage blocked'); });
  setNameSource(() => NAME);
  emit('app:filter', { name: 'search', value: NAME });
  assert.equal(vcEvents().at(-1).data.value, '{name}');
});
