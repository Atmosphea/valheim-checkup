// @ts-check
/**
 * Item icons in the page (WP-02 steps 3–5), added from the outside so app.js stays unchanged:
 *
 * - Table rows: app.js rebuilds `#items` with innerHTML on every render. A MutationObserver sees
 *   each rebuild and puts a 28 px icon at the start of each row's item cell, before `.item-name`
 *   (the class contract, DECISIONS point 26, is untouched: nothing is moved or renamed).
 * - Details: on `app:details-open` a 64 px icon goes in `.dialog-heading`, beside `#detailTitle`
 *   (the title's text stays exactly the item name).
 * - Footer: the icon credit line inside `.footer`, worded for the sources actually used.
 * - Help: the hotlink privacy sentence, only if any icon is hotlinked.
 *
 * Icons are decorative (the item name sits beside each one), so all are `aria-hidden` and carry
 * no text: the string and control censuses do not change.
 *
 * A bundled icon is one cell of src/icons/atlas.webp, shown as a CSS background. A hotlinked one
 * is an <img loading="lazy" referrerpolicy="no-referrer"> that swaps itself for the glyph if it
 * fails. Everything else is an engraved glyph (src/icons/glyphs.js).
 */
import map from './icon-map.json';
import { glyphSvg } from './glyphs.js';
import { itemIndex, iconFor as lookupIconFor, hotlinkHosts, hotlinkPrivacyText } from './lookup.js';
import { icons as cfg } from '../config/render.js';
import { iconCredit } from '../strings.js';
import { on } from '../bus.js';
import { vc } from '../debug.js';
import './icons.css';

/** @typedef {import('./lookup.js').IconEntry} IconEntry */

/** @type {Record<string, IconEntry>} */
const ICONS = /** @type {any} */ (map).icons;
const iconFor = (/** @type {any} */ item) => lookupIconFor(item, ICONS);

/**
 * One icon element.
 * @param {IconEntry} entry
 * @param {'row'|'details'} size
 * @returns {HTMLElement}
 */
export function iconElement(entry, size) {
  const cls = `vc-icon vc-icon--${size}`;
  if ('cell' in entry) {
    const el = document.createElement('span');
    const { cols, rows } = /** @type {any} */ (map);
    const x = entry.cell % cols, y = Math.floor(entry.cell / cols);
    el.className = cls + ' vc-icon--cell';
    el.style.backgroundPosition = `${cols > 1 ? (x / (cols - 1)) * 100 : 0}% ${rows > 1 ? (y / (rows - 1)) * 100 : 0}%`;
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
  if ('hotlink' in entry) {
    const img = document.createElement('img');
    img.className = cls + ' vc-icon--hotlink';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.replaceWith(iconElement({ glyph: entry.glyph }, size)), { once: true });
    img.src = entry.hotlink;
    return img;
  }
  const el = document.createElement('span');
  el.className = cls + ' vc-icon--glyph';
  el.dataset.glyph = entry.glyph;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = glyphSvg(entry.glyph);
  return el;
}

/** "Slight ink-grain mask": a small tiled noise whose opacity runs from grainAlphaMin to grainAlphaMax. */
export function grainMaskUrl(min = cfg.grainAlphaMin, max = cfg.grainAlphaMax, tile = cfg.grainTilePx) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${tile}' height='${tile}'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' seed='11' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${(max - min).toFixed(3)} 0 0 0 ${min}'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Wires everything up once the page exists. */
export function installIcons(doc = document) {
  const root = doc.documentElement.style;
  root.setProperty('--vc-icon-row', cfg.rowPx + 'px');
  root.setProperty('--vc-icon-details', cfg.detailsPx + 'px');
  root.setProperty('--vc-icon-sepia', String(cfg.sepia));
  root.setProperty('--vc-icon-paper-blend', cfg.blend);
  root.setProperty('--vc-grain-tile', cfg.grainTilePx + 'px');
  root.setProperty('--vc-ink-grain', grainMaskUrl());
  root.setProperty('--vc-atlas-cols', String(/** @type {any} */ (map).cols));
  root.setProperty('--vc-atlas-rows', String(/** @type {any} */ (map).rows));

  const catalogEl = doc.getElementById('catalogData');
  const index = itemIndex(JSON.parse(catalogEl?.textContent || '{"catalog":[]}'));

  // Table rows.
  const items = doc.getElementById('items');
  const decorateRows = () => {
    if (!items) return;
    for (const tr of /** @type {NodeListOf<HTMLTableRowElement>} */ (items.querySelectorAll('tr[data-item]'))) {
      const cell = tr.querySelector('.item-name')?.parentElement;
      if (!cell || cell.querySelector(':scope > .vc-icon')) continue;
      cell.classList.add('vc-icon-cell');
      cell.prepend(iconElement(iconFor(index.get(tr.dataset.item || '')), 'row'));
    }
  };
  if (items) new MutationObserver(decorateRows).observe(items, { childList: true });
  decorateRows();

  // Details heading.
  const heading = doc.querySelector('#itemDialog .dialog-heading');
  on('app:details-open', data => {
    if (!heading) return;
    heading.querySelector(':scope > .vc-icon')?.remove();
    heading.classList.add('vc-has-icon');
    heading.prepend(iconElement(iconFor(index.get(String(data?.id ?? ''))), 'details'));
  });

  // Footer credit (inside .footer, so the original line and its locator stay as they were).
  const footer = doc.querySelector('.footer');
  if (footer && !footer.querySelector('.vc-icon-credit')) {
    const credit = doc.createElement('span');
    credit.className = 'vc-icon-credit';
    credit.textContent = iconCredit(/** @type {any} */ (map).sources);
    footer.append(' ', credit);
  }

  // Help privacy line, only when something is hotlinked.
  const privacy = hotlinkPrivacyText(ICONS);
  const forget = doc.getElementById('forget');
  if (privacy && forget && !doc.querySelector('.vc-hotlink-note')) {
    const note = doc.createElement('span');
    note.className = 'vc-hotlink-note';
    note.textContent = privacy + ' ';
    forget.before(note);
  }

  vc.icons = {
    /** Counts by kind, for tests and the checker. */
    stats: () => {
      const all = Object.entries(ICONS), out = { tokens: all.length, cell: 0, hotlink: 0, glyph: 0, hosts: hotlinkHosts(ICONS) };
      for (const [, e] of all) out['cell' in e ? 'cell' : 'hotlink' in e ? 'hotlink' : 'glyph']++;
      return out;
    },
    /** @param {string} id */
    forItem: id => iconFor(index.get(id)),
    sources: /** @type {any} */ (map).sources,
  };
}

if (typeof document !== 'undefined' && document.getElementById('catalogData')) installIcons();
