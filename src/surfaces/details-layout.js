// @ts-check
/**
 * Paul, WP-17 items 25, 26 and 30: the condensed Details sheet (both reskinned modes).
 *
 * app.js still writes `#detailBody` (every field, control, id and handler is its own); this only
 * moves those same elements into a tidier frame, right after each write:
 *
 *   heading     icon · name · ×, and for trophies the drop chance (big) and usage (item 26)
 *   toolbar     wiki reference | Completion correction: use save record · mark completed ·
 *               mark missing | add count to header, each with a small icon (item 25)
 *   two columns the record table, bait and biome  ‖  the private note (not full width)
 *   footer      the "how it was matched" line in plain words, the source line, the correction hint
 *
 * Item 30: the sheet's faint stains (its two tone washes and the paper tile's offset) are seeded
 * from the item's id, so an item always gets the same sheet. Same images, same strength as before.
 *
 * Paul, WP-18 item 16: the item icon is much bigger, in a square frame (surfaces.css).
 * Paul, WP-18 item 17, Gourmet (eat) items only:
 *   lockup      big item icon · the name, centred · the cooking station's icon, same size · the
 *               station's level as a big number
 *   recipe row  only the recipe: each ingredient an icon, a big quantity, its name below, small
 *               bullets between; then what one cooking makes (yield) or how many servings (uses)
 * Data: src/data/food-recipes.json (Valheim Wiki Food page, CC BY-SA 3.0), keyed by display name.
 * An item with no entry or no recipe (raw foods) shows only what exists. Icons: the bundled atlas,
 * plus src/icons/recipe-icons.webp for raw ingredients the atlas never needed (tools/recipe-icons.mjs).
 */
import drops from '../data/trophy-drops.json';
import { trophyFacts } from '../data/trophy-map.js';
import { toSeed, Rng } from '../util/rng.js';
import foodRecipes from '../data/food-recipes.json';
import recipeIcons from '../icons/recipe-icons.json';
import { iconElement } from '../icons/icons.js';

/** app.js's default line (shown when an item has no note of its own). */
export const MATCHED_TEXT = 'Matched directly to a saved action identifier. A completion mark indicates a recorded action, not current inventory.';
/** Paul, WP-17 item 25: the same thing in plain words, in the footer. */
export const PLAIN_TEXT = 'Found under its exact name in your save. “Completed” means the game recorded you doing it at least once; it does not look at what you carry now.';

const SVG = (/** @type {string} */ d) => `<svg class="vc-dt-ic" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
export const ICONS = {
  wiki: SVG('M2.5 3.2c1.9-.7 3.8-.6 5.5.6 1.7-1.2 3.6-1.3 5.5-.6v9.4c-1.9-.7-3.8-.6-5.5.6-1.7-1.2-3.6-1.3-5.5-.6zM8 3.8v9.4'),
  auto: SVG('M3 8.5a5 5 0 1 0 1.6-3.7M3.2 2.6v2.6h2.6M6 8.2l1.5 1.5L10.5 6.5'),
  true: SVG('M3 8.6l3.2 3.1L13 4.6'),
  false: SVG('M4 4l8 8M12 4l-8 8'),
};

/** @type {Map<string, {type: string, tokens: string[], name: string}> | null} */
let byId = null;
function catalogItem(/** @type {string|null|undefined} */ id) {
  if (!id) return null;
  if (!byId) {
    byId = new Map();
    try {
      const data = JSON.parse(document.getElementById('catalogData')?.textContent || '{}');
      for (const c of data.catalog || []) for (const i of c.items || []) byId.set(i.id, { type: c.type, tokens: i.tokens || [], name: i.name });
    } catch { /* no catalog: no facts */ }
  }
  return byId.get(id) ?? null;
}

/** Drop chance and usage for a Details item id, or null (item 26). @param {string|null|undefined} id */
export function factsFor(id) {
  const it = catalogItem(id);
  if (!it || it.type !== 'pickup') return null;
  return trophyFacts(it.tokens, /** @type {any} */ (drops));
}

/**
 * Paul, WP-18 item 17: the Gourmet recipe for a Details item id, or null when the item is not a
 * Gourmet (eat) item. `recipe` is the food-recipes.json entry, or null when there is none.
 * @param {string|null|undefined} id
 * @returns {{name: string, recipe: null | {ingredients: {qty: number, name: string}[], yield: number|null, uses: number|null, station: string|null, stationLevel: number|null}} | null}
 */
export function gourmetFor(id) {
  const it = catalogItem(id);
  if (!it || it.type !== 'eat') return null;
  const r = /** @type {any} */ (foodRecipes).foods[it.name];
  return { name: it.name, recipe: r ?? null };
}

const esc = (/** @type {string} */ t) => t.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] || ch);

/**
 * A recipe icon (ingredient or station) by display name: an atlas cell, or a cell of the extra
 * sheet; null when there is none. @param {string} name @param {string} cls
 */
export function recipeIcon(name, cls) {
  const e = /** @type {any} */ (recipeIcons).icons[name];
  if (!e) return null;
  /** @type {HTMLElement} */
  let el;
  if ('cell' in e) el = iconElement({ cell: e.cell }, 'details');
  else {
    const { cols, rows } = /** @type {any} */ (recipeIcons);
    const x = e.extra % cols, y = Math.floor(e.extra / cols);
    el = document.createElement('span');
    el.className = 'vc-icon vc-icon--details vc-icon--extra';
    el.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
    el.style.backgroundPosition = `${cols > 1 ? (x / (cols - 1)) * 100 : 0}% ${rows > 1 ? (y / (rows - 1)) * 100 : 0}%`;
    el.setAttribute('aria-hidden', 'true');
  }
  el.classList.add(cls);
  return el;
}

/** Item 17: the header lockup and the recipe row (or nothing, for other items). @param {HTMLElement} dlg @param {string|null|undefined} id */
function gourmet(dlg, id) {
  const heading = dlg.querySelector('.dialog-heading');
  dlg.querySelector(':scope > .vc-dt-recipe')?.remove();
  heading?.querySelector(':scope > .vc-dt-station')?.remove();
  const g = gourmetFor(id);
  heading?.classList.toggle('vc-dt-lockup', !!g);
  if (!g || !heading) return;
  const r = g.recipe;
  if (r?.station) {
    const st = el('span', 'vc-dt-station', { role: 'img', 'aria-label': r.station + (r.stationLevel ? `, level ${r.stationLevel}` : ''), title: r.station });
    const ic = recipeIcon(r.station, 'vc-dt-station-ic');
    if (ic) st.append(ic);
    else st.append(Object.assign(el('span', 'vc-dt-station-name'), { textContent: r.station }));
    if (r.stationLevel) st.append(Object.assign(el('b', 'vc-dt-level', { 'aria-hidden': 'true' }), { textContent: String(r.stationLevel) }));
    heading.querySelector('h2')?.after(st);
  }
  if (!r || (!r.ingredients?.length && !r.station)) return;
  const row = el('section', 'vc-dt-recipe', { 'aria-label': 'Recipe' });
  (r.ingredients || []).forEach((ing, i) => {
    if (i) row.append(Object.assign(el('span', 'vc-dt-sep', { 'aria-hidden': 'true' }), { textContent: '•' }));
    const f = el('figure', 'vc-dt-ing');
    const top = el('span', 'vc-dt-ing-top');
    const ic = recipeIcon(ing.name, 'vc-dt-ing-ic');
    if (ic) top.append(ic);
    top.insertAdjacentHTML('beforeend', `<b class="vc-dt-qty">${Number(ing.qty) || 1}</b>`);
    f.append(top);
    f.insertAdjacentHTML('beforeend', `<figcaption>${esc(ing.name)}</figcaption>`);
    row.append(f);
  });
  const makes = r.yield ? `Makes ${r.yield}` : r.uses ? `${r.uses} servings` : '';
  if (makes) row.append(Object.assign(el('span', 'vc-dt-makes'), { textContent: makes }));
  // credited like the trophy data (item 26)
  row.append(Object.assign(el('small', 'vc-dt-credit'), { textContent: 'Valheim Wiki · CC BY-SA 3.0' }));
  (dlg.querySelector(':scope > .vc-dt-facts') || heading).after(row);
}

/** Item 30: stain placement from the id. @param {string} id */
export function stainsFor(id) {
  const r = new Rng(toSeed('stain:' + id));
  const pct = (/** @type {number} */ a, /** @type {number} */ b) => (a + (b - a) * r.next()).toFixed(1) + '%';
  return {
    ax: pct(10, 55), ay: pct(5, 45), bx: pct(50, 95), by: pct(60, 105),
    // the desk's sheet tile is the whole paper, worn edges and all: percentages keep the window
    // inside its body (flat's 384 px tile repeats, any offset is fine)
    tx: pct(25, 75), ty: pct(30, 70),
  };
}

const el = (/** @type {string} */ tag, /** @type {string} */ cls, /** @type {Record<string,string>} */ attrs = {}) => {
  const e = document.createElement(tag);
  e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

/** Put a small icon in front of a control's text (once). @param {Element|null} c @param {string} svg */
function icon(c, svg) {
  if (!c || c.querySelector(':scope > .vc-dt-ic')) return;
  c.insertAdjacentHTML('afterbegin', svg);
}

/**
 * Lay the dialog out (idempotent: a body already laid out is left alone).
 * @param {HTMLElement} dlg #itemDialog
 * @param {string|null|undefined} id the item shown (app.js's item id)
 */
export function layoutDetails(dlg, id) {
  const body = dlg.querySelector('#detailBody');
  if (!body) return;
  if (id) {
    const s = stainsFor(id);
    dlg.style.setProperty('--vc-st-ax', s.ax); dlg.style.setProperty('--vc-st-ay', s.ay);
    dlg.style.setProperty('--vc-st-bx', s.bx); dlg.style.setProperty('--vc-st-by', s.by);
    dlg.style.setProperty('--vc-st-tx', s.tx); dlg.style.setProperty('--vc-st-ty', s.ty);
    dlg.dataset.vcItem = id;
  }
  // item 26: trophy facts under the name
  dlg.querySelector(':scope > .vc-dt-facts')?.remove();
  const f = factsFor(id);
  if (f) {
    const box = el('div', 'vc-dt-facts');
    box.innerHTML = `<span class="vc-dt-drop"><b>${f.dropChance}</b><span>drop chance</span></span>${f.usage.length ? `<span class="vc-dt-usage"><span class="vc-dt-usage-k">Used for</span> ${f.usage.map(u => u.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch] || ch)).join(' · ')}</span>` : ''}<small class="vc-dt-credit">Valheim Wiki · CC BY-SA 3.0</small>`;
    dlg.querySelector('.dialog-heading')?.after(box);
  }
  // Paul, WP-18 item 17: the Gourmet lockup and recipe row
  gourmet(dlg, id);
  if (body.querySelector(':scope > .vc-dt-toolbar')) return;

  const kids = /** @type {HTMLElement[]} */ ([...body.children]);
  const link = kids.find(k => k.tagName === 'A') || null;
  const h3s = kids.filter(k => k.tagName === 'H3');
  const corr = kids.find(k => k.classList.contains('correction-buttons')) || null;
  const hint = corr?.nextElementSibling?.matches('p.sub') ? /** @type {HTMLElement} */ (corr.nextElementSibling) : null;
  const fav = kids.find(k => k.id === 'favoriteDetail') || null;
  const label = kids.find(k => k.tagName === 'LABEL') || null;
  const note = kids.find(k => k.id === 'itemNote') || null;
  const save = kids.find(k => k.id === 'saveNote') || null;
  const table = kids.find(k => k.classList.contains('record-comparison')) || null;
  const source = kids.find(k => k.matches('p.sub') && /^Source:/.test(k.textContent || '')) || null;
  const lead = kids[0]?.tagName === 'P' && !kids[0].classList.contains('sub') && !kids[0].querySelector('b') ? kids[0] : null;
  const facts = kids.filter(k => k.tagName === 'P' && !k.classList.contains('sub') && k !== lead);

  const bar = el('div', 'vc-dt-toolbar', { role: 'group', 'aria-label': 'Item tools' });
  const gWiki = el('div', 'vc-dt-group vc-dt-group--wiki');
  const gCorr = el('div', 'vc-dt-group vc-dt-group--correct');
  const gFav = el('div', 'vc-dt-group vc-dt-group--fav');
  if (link) { link.classList.add('vc-dt-tool'); icon(link, ICONS.wiki); gWiki.append(link); }
  if (h3s[0]) gCorr.append(h3s[0]);
  if (corr) {
    for (const b of corr.querySelectorAll('[data-correction]')) { b.classList.add('vc-dt-tool'); icon(b, /** @type {any} */ (ICONS)[/** @type {HTMLElement} */ (b).dataset.correction || 'auto']); }
    gCorr.append(corr);
  }
  // its own ☆ is its icon
  if (fav) { fav.classList.add('vc-dt-tool'); gFav.append(fav); }
  bar.append(gWiki, gCorr, gFav);

  const main = el('div', 'vc-dt-main');
  const rec = el('section', 'vc-dt-record');
  const pad = el('section', 'vc-dt-note');
  if (lead && (lead.textContent || '').trim() !== MATCHED_TEXT) rec.append(lead);
  if (table) rec.append(table);
  rec.append(...facts);
  if (h3s[1]) pad.append(h3s[1]);
  for (const x of [label, note, save]) if (x) pad.append(x);
  main.append(rec, pad);

  const foot = el('footer', 'vc-dt-foot');
  if (lead && (lead.textContent || '').trim() === MATCHED_TEXT) { lead.textContent = PLAIN_TEXT; lead.classList.add('vc-dt-plain'); foot.append(lead); }
  for (const x of [source, hint]) if (x) foot.append(x);

  // anything app.js adds that this layout does not know stays, after the columns
  const rest = [...body.children];
  body.replaceChildren(bar, main, foot, ...rest);
}
