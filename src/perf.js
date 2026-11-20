// @ts-check
/**
 * WP-14 · the `?perf` overlay, so Paul can check the budgets on his own machine (the checker's
 * headless browser renders WebGL in software and can't measure real GPU frame rates).
 *
 * Open `dist/valheim-checkup.html?perf` (add `&mode=flat` for the flat page). A small panel at the
 * top left shows, twice a second:
 *
 *   FPS          frames per second over the last second (requestAnimationFrame)
 *   Tier         the desk's quality tier (high / medium / low), or "flat"
 *   Draw calls   per frame, both WebGL renderers, every pass (desk only)      budget 250 (High)
 *   Triangles    per frame, the same way (desk only)                          budget 600,000 (High)
 *   JS ms        JavaScript time per frame on the central clock, average and worst of the last
 *                240 frames; "settling…" until those frames all fall after the 5 s settle,
 *                red only on Low and flat (where the budget applies)          budget 6 / 12 (Low)
 *   Long tasks   tasks over 100 ms since the page settled (5 s after load)    budget 0
 *   Heap         JavaScript heap in MB (Chrome only)                          budget 250
 *   Startup      when flat content was usable / the desk scene first visible  budget 1.5 s / 3 s
 *
 * A number over its budget turns red. "Copy" puts all of it on the clipboard as plain text.
 * Nothing is sent anywhere.
 */
import { vc } from './debug.js';
import { clock } from './util/clock.js';
import { runMode } from './mode.js';

const BUDGET = { calls: 250, triangles: 600000, jsAvg: 6, jsWorst: 12, heapMB: 250, flatMs: 1500, deskMs: 3000 };
const SETTLE_MS = 5000;

const box = document.createElement('section');
box.id = 'vcPerf';
box.setAttribute('aria-label', 'Performance');
box.style.cssText = 'position:fixed;left:8px;top:8px;z-index:2000;min-width:230px;padding:8px 10px;border-radius:6px;'
  + 'background:rgba(16,10,4,.86);color:#f3e6c8;font:12px/1.45 ui-monospace,Menlo,monospace;box-shadow:0 4px 14px rgba(0,0,0,.4)';
const table = document.createElement('div');
const copy = document.createElement('button');
copy.type = 'button';
copy.textContent = 'Copy';
copy.style.cssText = 'margin-top:6px;padding:2px 10px;font:inherit;color:#2b1d14;background:#e9c98a;border:0;border-radius:4px;cursor:pointer';
box.append(table, copy);
document.body.append(box);

// frames per second from rAF: the overlay measures the browser's own frame rate, so it keeps its
// own counter, outside the scheduler it is measuring (WP-18P)
let frames = 0, fps = 0, since = performance.now();
const count = () => { frames++; requestAnimationFrame(count); };
requestAnimationFrame(count);

// long tasks after the page settled
let longTasks = 0, longestMs = 0;
try {
  new PerformanceObserver(list => {
    for (const e of list.getEntries()) {
      if (e.startTime < SETTLE_MS || e.duration <= 100) continue;
      longTasks++; longestMs = Math.max(longestMs, e.duration);
    }
  }).observe({ type: 'longtask', buffered: true });
} catch { /* no long-task timing in this browser */ }

/** @returns {{label: string, value: string, over?: boolean}[]} */
function rows() {
  const st = /** @type {any} */ (vc).stage?.stats?.();
  const work = clock.work();
  const mem = /** @type {any} */ (performance).memory;
  const heap = mem ? mem.usedJSHeapSize / 1048576 : null;
  const startup = /** @type {any} */ (vc).startup?.() ?? {};
  const tier = runMode === 'desk' ? (st?.tier ?? '…') : 'flat';
  /** @type {{label: string, value: string, over?: boolean}[]} */
  const r = [
    { label: 'Mode', value: runMode },
    { label: 'FPS', value: fps.toFixed(0) },
    { label: 'Tier', value: String(tier) },
  ];
  if (runMode === 'desk') {
    const calls = st?.perFrame?.calls ?? 0, tris = st?.perFrame?.triangles ?? 0;
    r.push({ label: 'Draw calls', value: String(calls), over: tier === 'high' && calls > BUDGET.calls });
    r.push({ label: 'Triangles', value: tris.toLocaleString('en-US'), over: tier === 'high' && tris > BUDGET.triangles });
  }
  // the JS budget is for the Low tier (flat counts as Low), over 240 frames (~4 s) that start after the page settled
  const jsSettled = performance.now() > SETTLE_MS + 4000, jsBudget = tier === 'low' || tier === 'flat';
  const js = (/** @type {number} */ v, /** @type {number} */ d) => (jsSettled ? v.toFixed(d) : `${v.toFixed(d)} (settling…)`);
  r.push({ label: 'JS ms avg', value: js(work.avg, 2), over: jsSettled && jsBudget && work.avg > BUDGET.jsAvg });
  r.push({ label: 'JS ms worst', value: js(work.worst, 1), over: jsSettled && jsBudget && work.worst > BUDGET.jsWorst });
  r.push({ label: 'Long tasks', value: performance.now() < SETTLE_MS ? 'settling…' : `${longTasks}${longTasks ? ` (max ${longestMs.toFixed(0)} ms)` : ''}`, over: longTasks > 0 });
  if (heap !== null) r.push({ label: 'Heap MB', value: heap.toFixed(0), over: heap > BUDGET.heapMB });
  if (startup.usableMs != null) r.push({ label: runMode === 'desk' ? 'Desk visible' : 'Flat usable', value: (startup.usableMs / 1000).toFixed(2) + ' s', over: startup.usableMs > (runMode === 'desk' ? BUDGET.deskMs : BUDGET.flatMs) });
  return r;
}

function draw() {
  const now = performance.now();
  fps = frames * 1000 / Math.max(1, now - since);
  frames = 0; since = now;
  table.replaceChildren(...rows().map(x => {
    const line = document.createElement('div');
    line.style.cssText = 'display:flex;justify-content:space-between;gap:16px';
    const a = document.createElement('span'); a.textContent = x.label;
    const b = document.createElement('b'); b.textContent = x.value; b.style.color = x.over ? '#ff8a7a' : '#f8e7b8';
    line.append(a, b);
    return line;
  }));
}
setInterval(draw, 500);
draw();

copy.addEventListener('click', async () => {
  const text = [`Valheim Checkup ?perf — ${new Date().toISOString()}`, navigator.userAgent, `${innerWidth}×${innerHeight} @${devicePixelRatio}x`,
    ...rows().map(x => `${x.label}: ${x.value}${x.over ? '  (over budget)' : ''}`)].join('\n');
  try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; } catch { copy.textContent = 'Copy failed'; }
  setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
});

/** @type {any} */ (vc).perf = { rows, longTasks: () => ({ count: longTasks, longestMs }) };
