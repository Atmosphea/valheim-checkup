// @ts-check
/**
 * `?soundboard` (WP-12 step 9): Paul's mix-pass page. Every file 06 sound grouped by bus, each
 * with Play, gain (dB) and pitch; continuous sounds get Start/Stop and a speed slider; "play
 * sequence" buttons run the scripted event sequences through the real wiring; Download saves
 * audio-mix.json in exactly the config format (drop it into src/config/ and rebuild).
 * Deferred sounds (Paul's scope cuts) are listed greyed out; their gains can still be set.
 */
import { engine } from './index.js';
import { sequences } from './sequences.js';

const LOOPS = new Set(['bar.scrape', 'spark.crackle', 'coin.hum']);
const SEQUENCES = /** @type {[keyof typeof sequences, string][]} */ ([
  ['viewChange', 'View change'], ['dragLatch', 'Drag and latch'], ['detailsUnfold', 'Details unfold'],
  ['sparkOutIn', 'Spark out and in'], ['coinHop', 'Coin hop'], ['stampsDots', 'Stamps with dots'],
]);

const CSS = `
body.vc-soundboard > :not(#soundboard) { display: none !important; }
#soundboard { --ink:#2b2118; --paper:#efe4cc; --line:#c9b48c; --muted:#8a7a62; --accent:#7a3b16;
  position: fixed; inset: 0; overflow: auto; background: var(--paper); color: var(--ink);
  font: 15px/1.4 Georgia, "Times New Roman", serif; padding: 24px 16px 64px; z-index: 1000; }
#soundboard h1 { font-size: 28px; margin: 0 0 4px; }
#soundboard p { margin: 0 0 16px; max-width: 70ch; }
#soundboard .bar { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 20px; align-items: center; }
#soundboard button { font: inherit; color: var(--ink); background: #f8f1e1; border: 1px solid var(--line); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
#soundboard button:hover:not(:disabled) { border-color: var(--accent); }
#soundboard button:disabled { color: var(--muted); cursor: default; }
#soundboard button.primary { background: var(--accent); color: #fff8ec; border-color: var(--accent); }
#soundboard section { max-width: 980px; margin: 0 0 24px; }
#soundboard h2 { font-size: 19px; border-bottom: 1px solid var(--line); margin: 0 0 6px; padding-bottom: 2px; }
#soundboard .row { display: grid; grid-template-columns: minmax(120px, 1.2fr) auto minmax(150px, 1.5fr) minmax(150px, 1.5fr); gap: 4px 12px; align-items: center; padding: 4px 0; border-bottom: 1px dotted var(--line); }
#soundboard .row.deferred .name { color: var(--muted); }
#soundboard .name small { display: block; color: var(--muted); font-size: 12px; }
#soundboard label { display: flex; gap: 6px; align-items: center; font-size: 13px; white-space: nowrap; }
#soundboard input[type=range] { flex: 1; min-width: 60px; accent-color: var(--accent); }
#soundboard output { min-width: 4.5em; font-variant-numeric: tabular-nums; text-align: right; }
@media (max-width: 640px) { #soundboard .row { grid-template-columns: 1fr auto; } #soundboard .row label { grid-column: 1 / -1; } }
`;

/** @param {string} tag @param {Record<string, any>} [props] @param {(Node|string)[]} [kids] */
function h(tag, props = {}, kids = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'on') for (const [t, fn] of Object.entries(v)) el.addEventListener(t, fn);
    else if (k in el) /** @type {any} */ (el)[k] = v; else el.setAttribute(k, v);
  }
  el.append(...kids);
  return el;
}

/** @param {string} name */
function row(name) {
  const s = engine.mix.sounds[name];
  const deferred = engine.isDeferred(name);
  const loop = LOOPS.has(name);
  let running = false;
  const speed = h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0.6', 'aria-label': `${name} speed`,
    on: { input: () => engine.updateLoop(name, { speed: +speed.value }) } });
  const playBtn = h('button', { type: 'button', textContent: loop ? 'Start' : 'Play', disabled: deferred, 'aria-label': `Play ${name}`,
    on: { click: () => {
      engine.unlock();
      if (!loop) { engine.play(name, { pan: 0 }); return; }
      running = !running;
      if (running) engine.startLoop(name, { speed: +speed.value }); else engine.stopLoop(name);
      playBtn.textContent = running ? 'Stop' : 'Start';
    } } });
  const gainOut = h('output', { textContent: `${s.gain} dB` });
  const gain = h('input', { type: 'range', min: '-60', max: '0', step: '0.5', value: String(s.gain), 'aria-label': `${name} gain in dB`,
    on: { input: () => { engine.setGain(name, +gain.value); gainOut.textContent = `${gain.value} dB`; } } });
  const pitchOut = h('output', { textContent: `× ${(s.pitch ?? 1).toFixed(2)}` });
  const pitch = h('input', { type: 'range', min: '0.5', max: '2', step: '0.01', value: String(s.pitch ?? 1), 'aria-label': `${name} pitch`,
    on: { input: () => { engine.setPitch(name, +pitch.value); pitchOut.textContent = `× ${(+pitch.value).toFixed(2)}`; } } });
  const trigger = s.event ? s.event : (s.trigger || 'ambience');
  return h('div', { className: 'row' + (deferred ? ' deferred' : ''), 'data-sound': name }, [
    h('div', { className: 'name' }, [name, h('small', { textContent: (deferred ? 'deferred · ' : '') + trigger })]),
    h('div', {}, loop ? [h('label', {}, [playBtn, 'Speed', speed])] : [playBtn]),
    h('label', {}, ['Gain', gain, gainOut]),
    h('label', {}, ['Pitch', pitch, pitchOut]),
  ]);
}

function download() {
  const text = JSON.stringify(engine.mix, null, 2) + '\n';
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: 'audio-mix.json' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mountSoundboard() {
  document.head.append(h('style', { textContent: CSS }));
  document.body.classList.add('vc-soundboard');
  document.title = 'Soundboard · Valheim Checkup';
  const sounds = Object.keys(engine.mix.sounds);
  const built = sounds.filter(n => !engine.isDeferred(n)).length;
  const root = h('main', { id: 'soundboard' }, [
    h('h1', { textContent: 'Soundboard' }),
    h('p', { textContent: `${sounds.length} sounds, ${built} built, ${sounds.length - built} deferred. Change gain and pitch while you listen, then Download and put the file in src/config/ to keep the mix.` }),
    h('div', { className: 'bar' }, [
      ...SEQUENCES.map(([key, label]) => h('button', { type: 'button', textContent: label, 'data-sequence': key, on: { click: () => { engine.unlock(); sequences[key](); } } })),
      h('button', { type: 'button', className: 'primary', textContent: 'Download audio-mix.json', id: 'soundboardDownload', on: { click: download } }),
    ]),
    ...engine.mix.engine.buses.map((/** @type {string} */ bus) => h('section', { 'data-bus': bus }, [
      h('h2', { textContent: bus }),
      ...sounds.filter(n => engine.mix.sounds[n].bus === bus).map(row),
    ])),
  ]);
  document.body.append(root);
}

mountSoundboard();
