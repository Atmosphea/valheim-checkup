/**
 * WP-03 pure parts: platform preselection, slip placement, target fitting, strings and paths.
 * The browser behaviour (popup, tour, axe) is checked by tools/wp03-check.cjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, platformFromText } from '../src/tutorial/platform.js';
import { placeSlip, unionBox, fitTarget } from '../src/tutorial/place.js';
import { STRINGS, SAVE_PATHS } from '../src/strings.js';
import render from '../src/config/render.js';

const UA = {
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  deck: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Valve Steam Client',
  cros: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

test('platform: userAgentData first, then the user agent string', () => {
  assert.equal(detectPlatform({ platform: 'Windows' }, UA.mac), 'windows');
  assert.equal(detectPlatform({ platform: 'macOS' }, UA.win), 'mac');
  assert.equal(detectPlatform({ platform: 'Linux' }, UA.win), 'linux');
  assert.equal(detectPlatform({ platform: 'Chrome OS' }, ''), 'linux');
  assert.equal(detectPlatform(undefined, UA.win), 'windows');
  assert.equal(detectPlatform(null, UA.mac), 'mac');
  assert.equal(detectPlatform({ platform: '' }, UA.linux), 'linux');
  assert.equal(detectPlatform({}, UA.deck), 'linux');
  assert.equal(detectPlatform({}, UA.cros), 'linux');
  assert.equal(detectPlatform({ platform: 'Unknown' }, 'curl/8'), 'windows', 'unknown falls back to Windows');
  assert.equal(platformFromText('Darwin'), 'mac');
  assert.equal(platformFromText(null), null);
});

const view = { w: 1440, h: 900 };
const opts = { gap: 18, margin: 12, arrowInset: 16 };
const slip = { w: 320, h: 160 };
const inView = (p, s = slip) => p.x >= opts.margin && p.y >= opts.margin && p.x + s.w <= view.w - opts.margin && p.y + s.h <= view.h - opts.margin;
const overlaps = (p, b, s = slip) => !(p.x + s.w <= b.left || p.x >= b.right || p.y + s.h <= b.top || p.y >= b.bottom);

test('placement order: right, then left, then above', () => {
  const sidebar = { left: 10, top: 280, right: 250, bottom: 700 };
  const r = placeSlip(sidebar, slip, view, opts);
  assert.equal(r.side, 'right'); assert.ok(inView(r)); assert.ok(!overlaps(r, sidebar));
  assert.equal(r.x, sidebar.right + opts.gap);

  const loadBtn = { left: 1200, top: 20, right: 1410, bottom: 120 };
  const l = placeSlip(loadBtn, slip, view, opts);
  assert.equal(l.side, 'left'); assert.ok(inView(l)); assert.ok(!overlaps(l, loadBtn));

  const wide = { left: 280, top: 470, right: 1420, bottom: 880 };
  const a = placeSlip(wide, slip, view, opts);
  assert.equal(a.side, 'above'); assert.ok(inView(a)); assert.ok(!overlaps(a, wide));
});

test('placement fallbacks: below, then inside; never off-screen', () => {
  const top = { left: 100, top: 20, right: 1340, bottom: 300 };
  const b = placeSlip(top, slip, view, opts);
  assert.equal(b.side, 'below'); assert.ok(inView(b));
  const all = { left: 0, top: 0, right: 1440, bottom: 900 };
  const i = placeSlip(all, slip, view, opts);
  assert.equal(i.side, 'inside'); assert.ok(inView(i));
  // A sweep of targets over the window: every result is on screen.
  for (let x = -200; x < 1600; x += 97) for (let y = -200; y < 1100; y += 89) for (const [w, h] of [[40, 30], [300, 120], [900, 600]]) {
    const t = { left: x, top: y, right: x + w, bottom: y + h };
    const p = placeSlip(t, slip, view, opts);
    assert.ok(inView(p), JSON.stringify({ t, p }));
    if (p.side !== 'inside') assert.ok(!overlaps(p, t), JSON.stringify({ t, p }));
  }
  // Phone: a slip as wide as the window still fits inside the margins.
  const phone = { w: 390, h: 844 }, s2 = { w: 366, h: 200 };
  const p = placeSlip({ left: 16, top: 300, right: 374, bottom: 340 }, s2, phone, opts);
  assert.ok(p.x >= 12 && p.x + s2.w <= 378 && p.y >= 12 && p.y + s2.h <= 832, JSON.stringify(p));
});

test('arrow points at the target centre and stays off the corners', () => {
  const t = { left: 10, top: 400, right: 250, bottom: 440 };
  const r = placeSlip(t, slip, view, opts);
  assert.equal(r.y + r.arrow, 420);
  const corner = placeSlip({ left: 10, top: 0, right: 250, bottom: 20 }, slip, view, opts);
  assert.ok(corner.arrow >= opts.arrowInset && corner.arrow <= slip.h - opts.arrowInset);
});

test('unionBox and fitTarget', () => {
  assert.equal(unionBox([]), null);
  assert.deepEqual(unionBox([{ left: 10, top: 20, right: 30, bottom: 40 }, { left: 5, top: 50, right: 25, bottom: 900 }]), { left: 5, top: 20, right: 30, bottom: 900 });
  // A long table is cut off at maxShare of the free height below the sticky header.
  const f = fitTarget({ left: 280, top: 470, right: 1420, bottom: 6000 }, view, 190, 0.55);
  assert.equal(f.top, 470); assert.ok(Math.abs(f.bottom - (470 + 710 * 0.55)) < 1e-9);
  // Under the header: the top is pushed below it.
  assert.equal(fitTarget({ left: 0, top: 100, right: 50, bottom: 400 }, view, 190, 0.55).top, 190);
  // In the header (the Load button): unchanged.
  assert.deepEqual(fitTarget({ left: 1200, top: 20, right: 1400, bottom: 120 }, view, 190, 0.55), { left: 1200, top: 20, right: 1400, bottom: 120 });
});

test('strings: spec wording, tour text variants, no Done/Finish/Skip', () => {
  assert.equal(STRINGS.howTo, 'How to');
  assert.equal(STRINGS.howToName, 'How to find your save and use Valheim Checkup');
  assert.ok(STRINGS.howToName.startsWith(STRINGS.howTo), 'accessible name contains the visible label');
  assert.equal(STRINGS.howToTitle, 'Find your Valheim character');
  assert.equal(STRINGS.pathCopied, 'Path copied.');
  assert.equal(STRINGS.showMeAround, 'Show me around');
  assert.equal(STRINGS.tour1Desk.replace('coin', 'button'), STRINGS.tour1Flat);
  assert.equal(STRINGS.tour2Flat, 'Pick a collection from the list.');
  for (const k of Object.keys(STRINGS).filter(k => k.startsWith('tour'))) assert.doesNotMatch(STRINGS[k], /\b(done|finish|skip)\b/i, k);
});

test('save paths: spec table plus the verified macOS row, exact text', () => {
  const rows = Object.fromEntries(SAVE_PATHS.flatMap(g => g.rows.map(r => [r.label, r])));
  assert.deepEqual(SAVE_PATHS.map(g => g.tab), ['Windows', 'macOS', 'Linux']);
  assert.equal(rows.Windows.path, '%USERPROFILE%\\AppData\\LocalLow\\IronGate\\Valheim\\characters_local');
  assert.deepEqual(SAVE_PATHS[1].rows.map(r => r.label), ['macOS', 'macOS, older or cloud saves', 'macOS, if that folder is missing']);
  assert.equal(rows['macOS, older or cloud saves'].path, '~/Library/Application Support/IronGate/Valheim/characters');
  assert.equal(rows['macOS, older or cloud saves'].how, rows.macOS.how);
  assert.equal(rows['macOS, if that folder is missing'].path, '~/Library/Application Support/com.coffeestain.Valheim');
  assert.equal(rows['Linux, Proton or Steam Deck'].path, '~/.local/share/Steam/steamapps/compatdata/892970/pfx/drive_c/users/steamuser/AppData/LocalLow/IronGate/Valheim/characters_local');
  assert.equal(rows['Linux, Flatpak Steam'].path, '~/.var/app/com.valvesoftware.Steam/.config/unity3d/IronGate/Valheim/characters_local');
  assert.equal(rows.Linux.how, "Paste into your file manager's location bar (Ctrl-L).");
  for (const r of Object.values(rows)) assert.equal(r.path, r.path.trim());
});

test('config: tour tunables in render.js', () => {
  assert.equal(render.tour.dimTo, 0.35);
  for (const k of ['cutoutPadPx', 'cutoutRadiusPx', 'cutoutSoftPx', 'slipGapPx', 'slipWidthPx', 'viewportMarginPx', 'arrowInsetPx', 'maxTargetShare', 'moveMs']) assert.equal(typeof render.tour[k], 'number', k);
});
