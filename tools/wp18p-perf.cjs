// WP-18P transition profiler (Paul: "no frame over 16.7 ms in any transition").
//   node tools/wp18p-perf.cjs [label] [html] [--only=a,b] [--throttle=4] [--tier=low] [--quick]
// Real GPU (ANGLE Metal), 1440 × 900, High tier unless --tier. Paul's save from fixtures/private;
// the character name is never printed. Writes docs/reports/wp-18p/perf-<label>.json and prints a
// markdown table.
//
// Every transition is measured over a window with, at the same time:
//   · rAF frame intervals (worst frame, frames over 16.7 ms and 33.4 ms; see OVER below)
//   · Long Animation Frames (script attribution, forced style/layout)
//   · GPU time per frame on both WebGL contexts (EXT_disjoint_timer_query_webgl2)
//   · a CDP trace of the renderer main thread (total busy ms; style, layout, paint, GC…)
//   · a CDP CPU profile (100 µs sampling), each sample mapped to its source module through the
//     `// src/…` markers of an unminified build (`npx vite build --mode single --minify false`)
// "Top costs" = JS self time by module:function, plus the browser's own work from the trace
// (self time, so nothing is counted twice inside the trace; forced layout inside a JS function
// shows once as "Layout (forced)" and is not also in the JS row because V8 samples it as native).
const path = require('node:path');
const fs = require('node:fs');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));
const PRIVATE = path.join(ROOT, 'fixtures', 'private');
const SAVE = fs.readFileSync(path.join(PRIVATE, fs.readdirSync(PRIVATE).find(f => f.endsWith('.fch'))));
const argv = process.argv.slice(2);
const flag = (k, d) => { const a = argv.find(x => x.startsWith(`--${k}`)); return a ? (a.includes('=') ? a.split('=')[1] : true) : d; };
const pos = argv.filter(a => !a.startsWith('--'));
const LABEL = pos[0] || 'now';
const HTML = path.resolve(pos[1] || path.join(ROOT, 'dist', 'valheim-checkup.html'));
const ONLY = flag('only', '') ? String(flag('only')).split(',') : null;
const THROTTLE = +flag('throttle', 1);
const TIER = String(flag('tier', 'high'));
const QUICK = !!flag('quick', false);
/** --stacks: JS stacks on forced style/layout (attributes them to a caller, but slows every frame: diagnosis only) */
const STACKS = !!flag('stacks', false);
/** --sample: also run the V8 sampling profiler (100 µs) for JS attribution. It slows DOM-heavy frames
 * 2–3×, so frame times are taken from runs without it (the default) and attribution from runs with it. */
const SAMPLE = !!flag('sample', false);
/** --frames: no CDP trace at all (rAF, LoAF and GPU timer queries only): the timing runs. */
const FRAMES = !!flag('frames', false);
const OUT = path.join(ROOT, 'docs', 'reports', 'wp-18p');
const ARGS = ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu', '--enable-features=LongAnimationFrameTiming'];
/** A frame "over 16.7 ms": its rAF interval is past one 60 Hz refresh plus 2 ms of timer jitter,
 * i.e. at least one refresh was missed (the idle page here measures 16.6 ± 0.4 ms). */
const OVER = 16.7 + 2, OVER2 = 33.4 + 2;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const want = k => !ONLY || ONLY.some(o => k === o || k.startsWith(o));

// ── source map: bundle line → module (unminified builds only) ─────────────────────────────
const html = fs.readFileSync(HTML, 'utf8').split('\n');
const marks = [];
html.forEach((l, i) => { const m = /^\/\/ ((?:src|node_modules)\/\S+)/.exec(l); if (m) marks.push({ line: i, mod: m[1].replace(/^node_modules\/three\/.*/, 'three.js').replace(/^node_modules\//, '') }); });
const named = marks.length > 20;
const moduleAt = line => { let lo = 0, hi = marks.length - 1, r = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (marks[m].line <= line) { r = marks[m]; lo = m + 1; } else hi = m - 1; } return r ? r.mod : '?'; };

// ── trace analysis ────────────────────────────────────────────────────────────────────────
const BROWSER = {
  UpdateLayoutTree: 'Style recalc', Layout: 'Layout', Paint: 'Paint', PrePaint: 'Pre-paint', Layerize: 'Layerize',
  Commit: 'Commit', UpdateLayer: 'Update layer', 'MinorGC': 'GC (minor)', 'MajorGC': 'GC (major)', 'V8.GC_SCAVENGER': 'GC (minor)',
  'BlinkGC.AtomicPhase': 'GC (Blink)', HitTest: 'Hit test', ParseHTML: 'Parse HTML', 'Decode Image': 'Image decode', 'ImageDecodeTask': 'Image decode',
  'IntersectionObserverController::computeIntersections': 'IntersectionObserver', 'ScrollLayer': 'Scroll', 'FireAnimationFrame': null, 'FunctionCall': null,
  'EventDispatch': null, 'TimerFire': null, 'EvaluateScript': null, 'v8.compile': 'JS compile', 'v8.compileModule': 'JS compile', 'V8.CompileCode': 'JS compile',
  'ParseAuthorStyleSheet': 'CSS parse', 'UpdateCounters': null, 'ComputeIntersections': 'IntersectionObserver',
};
function analyseTrace(events, t0us, t1us) {
  const main = events.find(e => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
  if (!main) return { busyMs: 0, browser: {} };
  const ev = events.filter(e => e.pid === main.pid && e.tid === main.tid && e.ph === 'X' && e.ts >= t0us && e.ts <= t1us).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  // top-level tasks → busy time
  let busy = 0, end = -1;
  for (const e of ev) if (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') { if (e.ts >= end) { busy += e.dur || 0; end = e.ts + (e.dur || 0); } }
  // self time per event (subtract direct children), keyed by browser category
  const stack = []; const self = new Map(); const out = {};
  const close = upto => { while (stack.length && stack[stack.length - 1].end <= upto) stack.pop(); };
  for (const e of ev) {
    close(e.ts);
    const node = { e, end: e.ts + (e.dur || 0), child: 0 };
    if (stack.length) stack[stack.length - 1].child += e.dur || 0;
    stack.push(node); self.set(e, node);
  }
  for (const [e, n] of self) {
    let k = BROWSER[e.name];
    if (!k) continue;
    if (k === 'Layout' || k === 'Style recalc') { // forced = inside script
      let inJs = false; for (const s of ev) { if (s.ts > e.ts) break; if ((s.name === 'FunctionCall' || s.name === 'EvaluateScript' || s.name === 'TimerFire' || s.name === 'FireAnimationFrame' || s.name === 'EventDispatch') && s.ts <= e.ts && s.ts + s.dur >= e.ts + e.dur) { inJs = true; break; } }
      if (inJs) k += ' (forced)';
    }
    out[k] = (out[k] || 0) + Math.max(0, (e.dur || 0) - n.child) / 1000;
  }
  return { busyMs: busy / 1000, browser: out };
}
function analyseProfile(p, from = -Infinity, to = Infinity) {
  if (!p) return {};
  const byId = new Map(p.nodes.map(n => [n.id, n]));
  const hits = new Map();
  const dt = p.timeDeltas || [];
  let ts = p.startTime;
  for (let i = 0; i < p.samples.length; i++) { ts += dt[i] || 0; if (ts < from || ts > to) continue; const d = (dt[i + 1] ?? dt[i] ?? 0) / 1000; hits.set(p.samples[i], (hits.get(p.samples[i]) || 0) + d); }
  const out = {};
  for (const [id, ms] of hits) {
    const n = byId.get(id); if (!n) continue;
    const cf = n.callFrame; let key;
    if (/^\((idle|program|root)\)$/.test(cf.functionName)) continue;
    if (cf.functionName === '(garbage collector)') key = 'GC (V8, in JS)';
    else if (!cf.url) key = `native ${cf.functionName || '(anon)'}`;
    else key = `${named ? moduleAt(cf.lineNumber) : 'js'}:${cf.functionName || '(anon)'}`;
    out[key] = (out[key] || 0) + ms;
  }
  return out;
}

// ── page helpers ──────────────────────────────────────────────────────────────────────────
async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  const cdp = await ctx.newCDPSession(page);
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  if (opts.noNav) return { page, ctx, cdp, errors };
  await page.goto(`file://${HTML}?mode=desk&seed=7`);
  await ready(page);
  if (TIER !== 'high') await page.evaluate(t => __vc.quality(t), TIER); else await page.evaluate(() => __vc.quality('high'));
  // --hold: freeze the adaptive governor (WP-18P) so an A/B compares the same quality
  // (the v2.2.0 build has no hold: 10 ms reported frames keep its governor quiet the same way)
  if (process.argv.includes('--hold')) await page.evaluate(() => { __vc.stage.holdGovernor?.(true); __vc.stage.forceFrameMs(10); });
  return { page, ctx, cdp, errors };
}
const ready = page => page.waitForFunction(() => window.__vc?.stage?.textures?.ready?.() && __vc.stage.stats().frames > 10 && __vc.startup().usableMs !== null, null, { timeout: 120000 });
const idle = page => page.waitForFunction(() => !__vc.ink?.state().running && (__vc.ink?.state().ghosts ?? 0) === 0 && !document.querySelector('.vc-burn') && !__vc.surfaces?.rowBurn?.read?.().running, null, { timeout: 30000 }).catch(() => {});
async function loadSave(page) {
  await page.locator('#saveFile').setInputFiles({ name: 'characters_test.fch', mimeType: 'application/octet-stream', buffer: SAVE });
  await page.waitForFunction(() => /Progress is up to date/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 30000 });
}

/** In-page probes: rAF intervals, LoAF and GPU timer queries, written into window.__p18. */
const PROBE = () => {
  if (window.__p18) { window.__p18.reset(); return; }
  const P = window.__p18 = { fr: [], loaf: [], gpu: [], on: false, t0: 0 };
  try {
    new PerformanceObserver(l => { if (!P.on) return; for (const e of l.getEntries()) if (e.startTime >= P.t0) P.loaf.push({ t: e.startTime - P.t0, d: e.duration, blocking: e.blockingDuration || 0, styleLayout: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0, scripts: (e.scripts || []).map(s => ({ d: s.duration, fn: s.sourceFunctionName || '', inv: s.invoker || '', type: s.invokerType || '', forced: s.forcedStyleAndLayoutDuration || 0, char: s.sourceCharPosition ?? -1 })) }); }).observe({ type: 'long-animation-frame', buffered: false });
  } catch { /* no LoAF */ }
  let last = 0;
  const tick = t => { if (P.on && last >= P.t0) { P.fr.push({ t: t - P.t0, dt: t - last }); if (window.__vc?.ink?.state().running) P.inkSeen = true; } last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const st = window.__vc?.stage;
  if (st?.three && st.stats().governor?.gpuTimer) {
    // WP-18P builds time the GPU themselves (scene/gpu-timer.js) and a context runs one timer query
    // at a time: read the app's own results (a new value = a new finished query)
    P.gpuOk = true;
    let prev = '';
    st.onPhase('input', () => { const g = st.stats().governor.gpuParts || []; const k = g.join(); if (P.on && k !== prev && (g[0] != null || g[1] != null)) P.gpu.push((g[0] || 0) + (g[1] || 0)); prev = k; });
  } else if (st?.three) {
    const mk = gl => ({ gl, ext: gl.getExtension('EXT_disjoint_timer_query_webgl2'), q: null, pend: [] });
    const A = mk(st.three.renderer.getContext()), B = mk(st.three.veil.renderer.getContext());
    const begin = c => { if (!c.ext || c.q) return; c.q = c.gl.createQuery(); c.gl.beginQuery(c.ext.TIME_ELAPSED_EXT, c.q); };
    const end = c => { if (!c.q) return; c.gl.endQuery(c.ext.TIME_ELAPSED_EXT); c.pend.push(c.q); c.q = null; };
    const poll = c => { let s = 0, n = 0; while (c.pend.length) { const q = c.pend[0]; if (!c.gl.getQueryParameter(q, c.gl.QUERY_RESULT_AVAILABLE)) break; const dis = c.gl.getParameter(c.ext.GPU_DISJOINT_EXT); const ns = c.gl.getQueryParameter(q, c.gl.QUERY_RESULT); if (!dis) { s += ns / 1e6; n++; } c.gl.deleteQuery(q); c.pend.shift(); } return n ? s : null; };
    P.gpuOk = !!(A.ext && B.ext);
    st.onPhase('input', () => { const a = poll(A), b = poll(B); if (P.on && (a !== null || b !== null)) P.gpu.push((a || 0) + (b || 0)); begin(A); begin(B); });
    st.onPhase('print', () => { end(A); end(B); });
  }
  P.reset = () => { P.fr.length = 0; P.loaf.length = 0; P.gpu.length = 0; P.inkSeen = false; };
};

/** Measure one window: `act` starts the transition; the window ends `settleMs` after `until` holds. */
async function measure(r, name, act, o = {}) {
  const { page, cdp } = r;
  await page.evaluate(PROBE);
  const events = [];
  const onData = d => { for (const e of d.value) events.push(e); };
  cdp.on('Tracing.dataCollected', onData);
  if (!FRAMES) await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,v8,v8.execute,blink.user_timing,toplevel' + (STACKS ? ',disabled-by-default-devtools.timeline.stack' : ''), transferMode: 'ReportEvents' });
  if (SAMPLE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); await cdp.send('Profiler.start'); }
  await sleep(400); // the trace and profiler start stall one frame: let it pass before the window opens
  const t0 = await page.evaluate(() => { const P = window.__p18; P.reset(); P.t0 = performance.now(); P.on = true; performance.mark('p18-start'); return performance.timeOrigin + P.t0; });
  await act();
  if (o.started) await page.waitForFunction(o.started, null, { timeout: 10000 }).catch(() => console.log(`  (${name}: never started)`));
  if (o.until) await page.waitForFunction(o.until, null, { timeout: o.timeout || 15000 }).catch(async () => { console.log(`  (${name}: end condition timed out: ${JSON.stringify(await page.evaluate(() => ({ view: __vc.state().view, ink: __vc.ink.state().running, ghosts: __vc.ink.state().ghosts, latched: __vc.board.mechanism.latched })))})`); });
  await sleep(o.settleMs ?? 600);
  const res = await page.evaluate(() => { const P = window.__p18; P.on = false; performance.mark('p18-end'); return { fr: P.fr, loaf: P.loaf, gpu: P.gpu, gpuOk: !!P.gpuOk, dur: performance.now() - P.t0 }; });
  const profile = SAMPLE ? (await cdp.send('Profiler.stop')).profile : null;
  if (!FRAMES) { const done = new Promise(res2 => cdp.once('Tracing.tracingComplete', res2)); await cdp.send('Tracing.end'); await done; }
  cdp.off('Tracing.dataCollected', onData);
  // window in trace time: the user-timing marks
  const ms = events.filter(e => e.name === 'p18-start' || e.name === 'p18-end');
  const a = ms.find(e => e.name === 'p18-start')?.ts ?? 0, b = ms.find(e => e.name === 'p18-end')?.ts ?? Infinity;
  const tr = analyseTrace(events, a, b);
  const js = analyseProfile(profile);
  const fr = res.fr.filter(f => f.dt > 0);
  const worst = fr.reduce((m, f) => Math.max(m, f.dt), 0);
  // the worst frame on its own: JS samples and browser work inside its interval (trace µs)
  const wf = fr.find(f => f.dt === worst);
  let worstTop = [], worstRecalcs = [];
  if (wf && a) {
    const f0 = a + (wf.t - wf.dt) * 1000, f1 = a + wf.t * 1000;
    const j = analyseProfile(profile, f0, f1), b2 = analyseTrace(events, f0, f1).browser;
    const main = events.find(e => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
    worstRecalcs = events.filter(e => main && e.pid === main.pid && e.tid === main.tid && e.ph === 'X' && (e.name === 'UpdateLayoutTree' || e.name === 'Layout') && e.ts >= f0 && e.ts <= f1 && e.dur > 2000)
      .map(e => `${e.name === 'Layout' ? 'layout' : 'style'} ${(e.dur / 1000).toFixed(1)}ms ${e.args?.elementCount ?? e.args?.beginData?.dirtyObjects ?? ''}el @${(e.args?.beginData?.stackTrace || [])[0]?.functionName || 'frame'}`);
    worstTop = [...Object.entries(j).map(([k, v]) => ['js ' + k, v]), ...Object.entries(b2)].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => [k, +v.toFixed(1)]);
  }
  const costs = [...Object.entries(js).map(([k, v]) => ['js ' + k, v]), ...Object.entries(tr.browser)].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, v]) => [k, +v.toFixed(1)]);
  const out = {
    name, frames: fr.length, worstMs: +worst.toFixed(1), over16: fr.filter(f => f.dt > OVER).length, over33: fr.filter(f => f.dt > OVER2).length,
    mainMs: FRAMES ? null : +tr.busyMs.toFixed(0),
    loafMs: +res.loaf.reduce((x, l) => x + l.d, 0).toFixed(0), jsMs: +Object.values(js).reduce((x, y) => x + y, 0).toFixed(0), windowMs: +res.dur.toFixed(0),
    gpuMs: +res.gpu.reduce((x, y) => x + y, 0).toFixed(0), gpuWorst: +(res.gpu.length ? Math.max(...res.gpu) : 0).toFixed(1), gpuFrames: res.gpu.length,
    loaf: res.loaf.map(l => ({ t: Math.round(l.t), d: Math.round(l.d), sl: Math.round(l.styleLayout), top: l.scripts.sort((x, y) => y.d - x.d).slice(0, 3).map(s => `${s.inv || s.fn}:${Math.round(s.d)}${s.forced ? `(f${Math.round(s.forced)})` : ''}`) })),
    top: costs,
    // worst frames with their time, for attribution against LoAF
    worstFrames: fr.slice().sort((x, y) => y.dt - x.dt).slice(0, 5).map(f => [Math.round(f.t), +f.dt.toFixed(1)]),
    worstTop, worstRecalcs,
  };
  console.log(`${name.padEnd(28)} worst ${String(out.worstMs).padStart(6)} ms  >16.7: ${String(out.over16).padStart(3)}  >33: ${String(out.over33).padStart(3)}  main ${String(out.mainMs).padStart(5)} ms  gpu ${String(out.gpuMs).padStart(5)} ms (worst ${out.gpuWorst})  frames ${out.frames}`);
  console.log('   top: ' + out.top.map(([k, v]) => `${k} ${v}`).join(' · '));
  if (out.worstMs > OVER) console.log('   worst frame: ' + worstTop.map(([k, v]) => `${k} ${v}`).join(' · ') + '\n   recalcs: ' + worstRecalcs.join(' · '));
  return out;
}

/** Drag a bar's knob to the latch end and hold (mouse still down). Retries if the bar was not caught. */
async function dragToLatch(page, cat) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.mouse.move(4, 450, { steps: 6 }); await sleep(1800); // the window's left 3 % frames the woodblock (WP-18 item 6)
    const travel = await page.evaluate(() => __vc.board.mechanism.travel);
    // the framing follows the pointer (WP-17 item 2): re-aim until the knob stops moving under it
    let k0 = await page.evaluate(c => __vc.board.knob(c), cat);
    for (let i = 0; i < 8; i++) {
      await page.mouse.move(k0.x, k0.y, { steps: 3 }); await sleep(450);
      const k1 = await page.evaluate(c => __vc.board.knob(c), cat);
      const d = Math.hypot(k1.x - k0.x, k1.y - k0.y); k0 = k1;
      if (d < 1.5) break;
    }
    await page.mouse.move(k0.x, k0.y); await sleep(100); await page.mouse.down();
    const r = await page.evaluate(([c, d]) => __vc.board.slotPoint(c, 17.65 + d), [cat, travel]);
    for (let k = 1; k <= 20; k++) { await page.mouse.move(k0.x + (r.x - k0.x) * k / 20, k0.y + (r.y - k0.y) * k / 20); await sleep(25); }
    await sleep(250);
    const ok = await page.evaluate(c => { const i = __vc.board.held?.(); return i >= 0 && document.querySelectorAll('#categories [data-category], #insightNav [data-category]').length > 0 && __vc.board.mechanism.bars?.[i]?.category === c; }, cat).catch(() => false);
    if (ok) return true;
    await page.mouse.up(); await sleep(1200);
  }
  return false;
}
const viewIs = cat => `(() => __vc.state().view === ${JSON.stringify(cat)} && window.__p18?.inkSeen && !__vc.ink.state().running && (__vc.ink.state().ghosts ?? 0) === 0)()`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ARGS });
  const rows = [];
  const meta = { label: LABEL, html: path.relative(ROOT, HTML), named, throttle: THROTTLE, tier: TIER, sampled: SAMPLE, framesOnly: FRAMES, at: new Date().toISOString() };
  try {
    // ── start-up flow (navigation → desk visible → idle) ─────────────────────────────────
    if (want('startup')) {
      const r = await open(browser, { noNav: true });
      await r.page.goto('about:blank');
      // probes can't exist before the page; measure with trace + profile, frames from the trace's own rAF are not available: use the page's probe from the first script
      await r.page.addInitScript(() => { window.__p18early = []; let last = 0; const tick = t => { window.__p18early.push(last ? t - last : 0); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
      const events = []; const onData = d => { for (const e of d.value) events.push(e); };
      r.cdp.on('Tracing.dataCollected', onData);
      await r.cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,v8,v8.execute,toplevel', transferMode: 'ReportEvents' });
      if (SAMPLE) { await r.cdp.send('Profiler.enable'); await r.cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await r.cdp.send('Profiler.start'); }
      await r.page.goto(`file://${HTML}?mode=desk&seed=7`);
      await ready(r.page); await sleep(2500);
      const fr = await r.page.evaluate(() => ({ fr: window.__p18early.filter(x => x > 0), usable: __vc.startup().usableMs }));
      const profile = SAMPLE ? (await r.cdp.send('Profiler.stop')).profile : null;
      const done = new Promise(res => r.cdp.once('Tracing.tracingComplete', res)); await r.cdp.send('Tracing.end'); await done;
      const tr = analyseTrace(events, 0, Infinity); const js = analyseProfile(profile);
      // frames after the desk is first visible (before that the loading screen is static)
      const top = [...Object.entries(js).map(([k, v]) => ['js ' + k, v]), ...Object.entries(tr.browser)].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, v]) => [k, +v.toFixed(1)]);
      const f = fr.fr;
      const out = { name: 'start-up', frames: f.length, worstMs: +Math.max(...f).toFixed(1), over16: f.filter(x => x > OVER).length, over33: f.filter(x => x > OVER2).length, mainMs: +tr.busyMs.toFixed(0), jsMs: +Object.values(js).reduce((x, y) => x + y, 0).toFixed(0), gpuMs: null, usableMs: fr.usable, top, worstFrames: [...f].sort((a, b) => b - a).slice(0, 8).map(x => +x.toFixed(1)) };
      console.log(`start-up                     worst ${out.worstMs} ms  >16.7: ${out.over16}  >33: ${out.over33}  main ${out.mainMs} ms  usable ${out.usableMs} ms`);
      console.log('   top: ' + top.map(([k, v]) => `${k} ${v}`).join(' · '));
      rows.push(out);
      await r.ctx.close();
    }

    const r = await open(browser);
    // ── loading a save ─────────────────────────────────────────────────────────────────────
    await r.page.mouse.move(900, 470, { steps: 4 }); await sleep(2000);
    if (want('load')) rows.push(await measure(r, 'load save', () => loadSave(r.page), { until: `(() => !__vc.ink.state().running && (__vc.ink.state().ghosts ?? 0) === 0)()`, settleMs: 800 }));
    else { await loadSave(r.page); await idle(r.page); }
    await idle(r.page); await sleep(1000);

    // ── every collection by slider drag (latch) and release ──────────────────────────────
    const cats = await r.page.evaluate(() => __vc.board.categories ?? [...document.querySelectorAll('#categories [data-category], #insightNav [data-category]')].map(e => e.dataset.category));
    const list = QUICK ? cats.filter(c => /Carpenter|Gourmet|Highlights|Skills/.test(c)) : cats;
    let prev = await r.page.evaluate(() => __vc.state().view);
    for (const cat of list) {
      if (cat === prev) continue;
      const key = 'view ' + cat.replace(/^The /, '');
      if (!want('view') && !want(key)) continue;
      let caught = false;
      const drag = await measure(r, `${key} · drag`, async () => { caught = await dragToLatch(r.page, cat); }, { settleMs: 100 });
      if (!caught) console.log(`  (${key}: bar not caught)`);
      const rel = await measure(r, `${key} · release`, () => r.page.mouse.up(), { until: viewIs(cat), settleMs: 600 });
      rows.push(drag, rel); prev = cat;
      await r.page.mouse.move(900, 470, { steps: 4 }); await idle(r.page); await sleep(800);
    }
    // back to the default view with its 400-row table: The Carpenter
    if (prev !== 'The Carpenter' && cats.includes('The Carpenter')) {
      await dragToLatch(r.page, 'The Carpenter'); await r.page.mouse.up(); await sleep(500);
      await r.page.waitForFunction(() => __vc.state().view === 'The Carpenter' && !__vc.ink.state().running, null, { timeout: 20000 }).catch(() => console.log('  (could not return to The Carpenter)'));
      await r.page.mouse.move(900, 470, { steps: 4 }); await sleep(1000);
    }

    // ── Details open / close (the burn), on the Carpenter table ──────────────────────────
    if (want('details')) {
      await r.page.mouse.move(900, 600, { steps: 4 }); await sleep(800);
      rows.push(await measure(r, 'details open', () => r.page.evaluate(() => document.querySelector('#items [data-details]').click()), { started: `(() => !!document.querySelector('.vc-unfold'))()`, until: `(() => document.getElementById('itemDialog').open && !document.querySelector('.vc-unfold'))()`, settleMs: 500 }));
      await sleep(600);
      rows.push(await measure(r, 'details close (burn)', () => r.page.keyboard.press('Escape'), { started: `(() => !!document.querySelector('.vc-burn'))()`, until: `(() => !document.querySelector('.vc-burn'))()`, settleMs: 400 }));
      await sleep(800);
    }
    // ── row-height rescale (burn away, rescale, burn in) ─────────────────────────────────
    if (want('rows')) {
      await r.page.evaluate(() => document.querySelector('[role="slider"]').focus());
      rows.push(await measure(r, 'row-height rescale', async () => { for (let i = 0; i < 4; i++) { await r.page.keyboard.press('ArrowUp'); await sleep(30); } await r.page.waitForFunction(() => __vc.surfaces.rowBurn.read().running, null, { timeout: 8000 }).catch(() => {}); }, { until: `(() => !__vc.surfaces.rowBurn.read().running)()`, settleMs: 400 }));
      // put it back without measuring
      for (let i = 0; i < 4; i++) { await r.page.keyboard.press('ArrowDown'); await sleep(30); }
      await r.page.waitForFunction(() => !__vc.surfaces.rowBurn.read().running, null, { timeout: 15000 }).catch(() => {});
    }
    meta.errors = r.errors;
    meta.tierEnd = await r.page.evaluate(() => __vc.stage.stats().tier);
    meta.qualityLog = await r.page.evaluate(() => JSON.parse(JSON.stringify(__vc.stage.qualityLog ?? null))).catch(() => null);
    meta.trimLog = await r.page.evaluate(() => JSON.parse(JSON.stringify(__vc.stage.trimLog ?? null))).catch(() => null);
    meta.governor = await r.page.evaluate(() => __vc.stage.stats().governor).catch(() => null);
    console.log('governor', JSON.stringify(meta.governor), 'trims', JSON.stringify(meta.trimLog), 'tiers', JSON.stringify(meta.qualityLog));
    await r.ctx.close();
  } catch (e) {
    console.log('ERROR', String(e.stack || e).slice(0, 600));
    meta.crash = String(e).slice(0, 300);
  } finally {
    await browser.close();
  }
  const file = path.join(OUT, `perf-${LABEL}.json`);
  fs.writeFileSync(file, JSON.stringify({ meta, rows }, null, 1));
  console.log('\n| Transition | Worst frame ms | Frames > 16.7 | > 33 | Main-thread ms | JS ms | GPU ms |\n| --- | --- | --- | --- | --- | --- | --- |');
  for (const x of rows) console.log(`| ${x.name} | ${x.worstMs} | ${x.over16} / ${x.frames} | ${x.over33} | ${x.mainMs} | ${x.jsMs} | ${x.gpuMs ?? '—'} |`);
  console.log(`\nwrote ${path.relative(ROOT, file)}${meta.errors?.length ? `  page errors: ${meta.errors.length}` : ''}`);
})();
