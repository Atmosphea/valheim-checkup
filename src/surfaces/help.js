// @ts-check
/**
 * WP-11 · the help letter (spec "Help letter"; P34).
 *
 * `details.help` stays one element with its summary, all paragraphs, links and `#forget`. Closed,
 * it is a sealed letter at the help-note position on the main sheet (WP-07 placed it). Opening it
 * (any way: a click on the summary, Enter or Space, or `open = true`) cracks the wax seal (two
 * halves part, crumbs fall; `help:open` plays seal.crack and its five flaps, DECISIONS WP-12) and
 * the whole element moves into a floating sheet in #float, unfolded by the Details engine. Like the
 * original `<details>` it is NOT modal: the rest of the page stays usable and in the accessibility
 * tree (census state "help-open"). Escape, the summary, or a press anywhere outside the letter
 * (which still reaches what it pressed) fold it back; focus goes back to the summary. On the
 * sheet, the broken seal and an empty envelope stay behind (aria-hidden).
 */
import { emit } from '../bus.js';

/**
 * @param {object} o
 * @param {HTMLElement} o.host  #float
 * @param {ReturnType<typeof import('./unfold.js').createUnfold>} o.unfold
 */
export function attachHelp(o) {
  const help = /** @type {HTMLDetailsElement} */ (document.querySelector('details.help'));
  const summary = /** @type {HTMLElement} */ (help.querySelector('summary'));
  const layer = document.createElement('div');
  layer.className = 'vc-float-layer vc-letter-layer';
  layer.hidden = true;
  const sheet = document.createElement('div');
  sheet.className = 'vc-letter';
  sheet.setAttribute('role', 'dialog');
  if (!summary.id) summary.id = 'vcHelpSummary';
  sheet.setAttribute('aria-labelledby', summary.id);
  layer.append(sheet);
  o.host.append(layer);

  // what stays on the sheet while the letter is out: the envelope with its broken seal
  const envelope = document.createElement('div');
  envelope.className = 'vc-letter-envelope';
  envelope.setAttribute('aria-hidden', 'true');
  envelope.innerHTML = '<i class="vc-seal-half vc-seal-half--l"></i><i class="vc-seal-half vc-seal-half--r"></i>' + '<i class="vc-seal-crumb"></i>'.repeat(5);

  let out = false;
  /** @type {import('./plan.js').Rect | null} */
  let openRect = null;

  function takeOut() {
    if (out) return;
    out = true;
    const from = summary.getBoundingClientRect();
    // the envelope keeps the letter's place and look on the sheet
    Object.assign(envelope.style, { left: help.style.left, top: help.style.top, width: help.style.width || help.offsetWidth + 'px', height: help.style.height || help.offsetHeight + 'px' });
    help.after(envelope);
    envelope.classList.remove('vc-cracked');
    void envelope.offsetWidth;
    envelope.classList.add('vc-cracked');
    sheet.append(help);
    layer.hidden = false;
    summary.focus({ preventScroll: true });
    emit('help:open', {});
    // Paul, WP-16 item 24: piece by piece, the text already printed on every piece
    o.unfold.open({ sheet, origin: from.width > 0 ? from : null, style: 'pieces' });
    const r = sheet.getBoundingClientRect();
    openRect = { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  function putBack() {
    if (!out) return;
    out = false;
    const r = sheet.getBoundingClientRect();
    const rect = openRect ?? { x: r.left, y: r.top, w: r.width, h: r.height };
    /** @type {any} */ (sheet).__vcUnfloat?.();
    sheet.classList.remove('vc-unfolding', 'vc-inkin');
    // the closing pieces carry the letter's print, so they are built while the letter is still in the sheet
    const to = envelope.getBoundingClientRect();
    o.unfold.close({ rect, to: to.width > 0 ? to : null, style: 'pieces', face: sheet });
    layer.hidden = true;
    envelope.replaceWith(help);
    emit('help:close', {});
    summary.focus({ preventScroll: true });
  }

  help.addEventListener('toggle', () => { if (help.open) takeOut(); else putBack(); });
  // opened before the desk was ready
  if (help.open) takeOut();

  sheet.addEventListener('keydown', e => {
    if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); e.stopPropagation(); help.open = false; }
  });
  // a press outside the letter puts it away; the press itself goes on to whatever it hit
  document.addEventListener('pointerdown', e => {
    if (out && !sheet.contains(/** @type {Node} */ (e.target))) help.open = false;
  }, true);

  return {
    layer, sheet, envelope,
    isOpen: () => out,
    read: () => ({ open: help.open, out, inFloat: help.parentElement === sheet }),
  };
}
