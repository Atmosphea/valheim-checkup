// @ts-check
/**
 * WP-10 step 1: the ghost snapshot. Just before a view change, the inset sheet's current
 * content is copied into an `aria-hidden` ghost exactly on top; `setCategory` then renders the
 * new view at once (masked), and the ghost washes out while the real content washes in.
 *
 * The copy lives in a *closed* shadow root on an `aria-hidden`, `inert` host:
 *   - screen readers skip it (aria-hidden), nothing in it can take focus (inert);
 *   - its ids stay unique to the shadow tree, so `document.getElementById`, app.js and the
 *     tests' locators (which never enter closed shadow roots) only ever see the real view.
 *
 * The page's styles are copied into the shadow root once, with the selectors that reach
 * outside the inset (`:root`, `html`, `body`, `#desk`, `#print`) pointed at three wrapper
 * elements (`.vc-gbody`, `display: contents`) that stand in for that chain. Everything else
 * (ids, classes) matches the copy exactly as it matched the original.
 */

const HOST_CLASS = 'vc-ghost-host';

/** @type {CSSStyleSheet | null} */
let sheet = null;
let sheetKey = '';

/** Rewrite one selector list so it matches inside the ghost. @param {string} sel */
export function ghostSelector(sel) {
  return sel
    .replace(/:root\b/g, '.vc-gbody')
    .replace(/(^|[\s>+~,(])(?:html|body)(?=$|[\s.#:[>+~,)])/g, '$1.vc-gbody')
    .replace(/#(?:desk|print)(?![\w-])/g, '.vc-gbody');
}

/** @param {CSSRuleList} rules @returns {string} */
function rewrite(rules) {
  let out = '';
  for (const r of /** @type {any} */ (rules)) {
    if (r instanceof CSSStyleRule) {
      if (r.cssRules && r.cssRules.length) continue; // nested rules: none in this app's CSS
      out += `${ghostSelector(r.selectorText)}{${r.style.cssText}}\n`;
    } else if (r instanceof CSSMediaRule) {
      out += `@media ${r.conditionText}{${rewrite(r.cssRules)}}\n`;
    } else if (typeof CSSSupportsRule !== 'undefined' && r instanceof CSSSupportsRule) {
      out += `@supports ${r.conditionText}{${rewrite(r.cssRules)}}\n`;
    }
    // @font-face, @keyframes, @property: global or not needed in a still ghost
  }
  return out;
}

/** The ghost style sheet, rebuilt when the page's sheets change. */
function ghostSheet() {
  const sheets = [...document.styleSheets];
  const key = sheets.map(s => { try { return s.cssRules.length; } catch { return 0; } }).join(',');
  if (sheet && key === sheetKey) return sheet;
  let css = '';
  for (const s of sheets) { try { css += rewrite(s.cssRules); } catch { /* cross-origin: none here */ } }
  // the stand-in chain has no boxes; a ghost never moves, animates or takes the pointer
  css += `.vc-gbody{display:contents!important}
:host{position:absolute;display:block;pointer-events:none!important;z-index:6;contain:layout style}
*,*::before,*::after{animation:none!important;transition:none!important;pointer-events:none!important;caret-color:transparent!important}
.vc-ghost-sheet{-webkit-mask-image:none!important;mask-image:none!important;position:absolute!important;left:0;top:0}
`;
  sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  sheetKey = key;
  return sheet;
}

/**
 * Copy `source` (the workspace) into a ghost over `frame`.
 * @param {object} o
 * @param {HTMLElement} o.source      the element to copy (main.workspace)
 * @param {HTMLElement} o.frame       where the ghost host goes (positioned ancestor of source)
 * @param {boolean} o.sheetWrap       desk: wrap the copy in a `.vc-sheet.vc-sheet-inset` like the real one
 * @param {(clone: HTMLElement) => void} [o.prune]  trim the copy (rows out of view, hidden text)
 * @returns {{ host: HTMLElement, root: ShadowRoot, copy: HTMLElement, remove(): void }}
 */
export function makeGhost(o) {
  const host = document.createElement('div');
  host.className = HOST_CLASS;
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;
  const root = host.attachShadow({ mode: 'closed' });
  root.adoptedStyleSheets = [ghostSheet()];

  // the stand-in for body › #desk › #print (body's classes carry mode-desk / mode-flat)
  const b1 = document.createElement('div');
  b1.className = `vc-gbody ${document.body.className}`;
  const b2 = document.createElement('div'); b2.className = 'vc-gbody';
  const b3 = document.createElement('div'); b3.className = 'vc-gbody';
  b1.append(b2); b2.append(b3);

  const copy = /** @type {HTMLElement} */ (o.source.cloneNode(true));
  // form controls show their live values, not their defaults
  const srcCtl = o.source.querySelectorAll('select, input, textarea');
  const dstCtl = copy.querySelectorAll('select, input, textarea');
  srcCtl.forEach((s, i) => {
    const d = /** @type {any} */ (dstCtl[i]); const v = /** @type {any} */ (s);
    if (!d) return;
    if (s.tagName === 'SELECT') d.selectedIndex = v.selectedIndex;
    else if (v.type === 'checkbox') d.checked = v.checked;
    else d.value = v.value;
  });
  for (const el of copy.querySelectorAll('[tabindex]')) el.removeAttribute('tabindex');
  o.prune?.(copy);

  let top = 0, left = 0, width = 0, height = 0;
  if (o.sheetWrap) {
    // the copy keeps its place inside a sheet-sized wrapper: same box as the real sheet
    const wrap = document.createElement('div');
    wrap.className = `${o.frame.className} vc-ghost-sheet`;
    wrap.style.width = `${o.frame.offsetWidth}px`;
    wrap.style.height = `${o.frame.offsetHeight}px`;
    copy.style.cssText = o.source.style.cssText;
    wrap.append(copy);
    b3.append(wrap);
    width = o.frame.offsetWidth; height = o.frame.offsetHeight;
  } else {
    // flat: sit exactly over the workspace inside its offset parent
    b3.append(copy);
    left = o.source.offsetLeft; top = o.source.offsetTop;
    width = o.source.offsetWidth; height = o.source.offsetHeight;
    copy.style.width = `${width}px`;
    copy.style.margin = '0';
  }
  root.append(b1);
  Object.assign(host.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
  o.frame.append(host);

  // scrolled containers keep their scroll position (the table)
  const srcScroll = o.source.querySelectorAll('.tablewrap, #insightsView');
  const dstScroll = copy.querySelectorAll('.tablewrap, #insightsView');
  srcScroll.forEach((s, i) => { const d = /** @type {HTMLElement} */ (dstScroll[i]); if (d) { d.scrollTop = s.scrollTop; d.scrollLeft = s.scrollLeft; } });

  return { host, root, copy, remove() { host.remove(); } };
}

/** Build the ghost style sheet ahead of time (idle), so the first view change does not pay for it. */
export function prepareGhost() { ghostSheet(); }

/** Is any ghost in the document? (tests, the "never two ghosts" rule) */
export const ghostCount = () => [...document.querySelectorAll('.' + HOST_CLASS)].filter(h => /** @type {HTMLElement} */ (h).style.visibility !== 'hidden').length;
