// @ts-check
/**
 * The main section's single scroll (Paul, WP-17 items 4–6; replaces WP-11's lifting header slip).
 *
 * WP-11 split the collection page into a header slip, moved by a transform on every `scroll`
 * event, and the table under it. The transform always ran a frame behind the browser's own
 * scrolling, so the part above the table lagged (Paul, item 6). Now everything is one native
 * scroll: `.tablewrap` holds, in order,
 *
 *   .vc-masthead     "Valheim Checkup", the byline ("Read locally …") and the lifetime records
 *                    (Paul, item 4: part of the main section, just above the table)
 *   .vc-scrollhead   the eyebrow, title, description, notes, record switch, stamps, track,
 *                    #message, filters and the list line (were the slip)
 *   table            with its sticky heading row
 *
 * so the browser moves all of it together, exactly like the tab switches. Every id stays inside
 * #collectionView except the masthead's and #message, which follow the view that is shown: on the
 * insight pages they sit at the top of the workspace, above #insightsView.
 *
 * Paul, item 5: the scrolled content fades out under the paper's burned top edge (paper/edge-mask.js
 * draws the mask from the paper's own deckle).
 */
import { emit } from '../bus.js';

/**
 * @param {object} o
 * @param {(phase: string, fn: (dt: number, t: number) => void) => () => void} o.onPhase
 * @param {any} [o.THREE]
 * @param {any} [o.scene]
 * @param {any} [o.veil]
 * @param {() => void} [o.printDirty]
 */
export function attachLift(o) {
  const view = /** @type {HTMLElement} */ (document.getElementById('collectionView'));
  const wrap = /** @type {HTMLElement} */ (view.querySelector('.tablewrap'));
  const table = /** @type {HTMLElement} */ (wrap.querySelector('table'));
  const message = /** @type {HTMLElement} */ (document.getElementById('message'));
  const workspace = /** @type {HTMLElement} */ (document.querySelector('main.workspace'));
  const insights = /** @type {HTMLElement} */ (document.getElementById('insightsView'));
  const mast = /** @type {HTMLElement|null} */ (document.querySelector('.vc-masthead'));

  // ── One scroller: the collection page's head moves into the table's scroll box ─────────────
  const head = document.createElement('div');
  head.className = 'vc-scrollhead';
  const parts = [...view.children].filter(el => el !== wrap);
  head.append(...parts);
  wrap.insertBefore(head, table);
  view.classList.add('vc-lift', 'vc-onescroll');
  const track = /** @type {HTMLElement|null} */ (head.querySelector('#mainTrack'));

  /** The masthead and the message follow the view that is shown. */
  function seat() {
    const inCollection = !view.classList.contains('hidden');
    if (inCollection) {
      if (mast && mast.parentElement !== wrap) wrap.insertBefore(mast, head);
      if (track && message.parentElement !== head) track.after(message);
    } else {
      if (mast && mast.parentElement !== workspace) workspace.insertBefore(mast, insights);
      if (message.parentElement !== workspace) workspace.insertBefore(message, insights);
    }
    message.classList.toggle('vc-message-inline', inCollection);
    o.printDirty?.();
  }
  new MutationObserver(seat).observe(view, { attributes: true, attributeFilter: ['class'] });
  seat();

  // Home scrolls back to the top (the wheel and the keyboard scroll natively)
  document.addEventListener('keydown', e => {
    if (e.key !== 'Home' || e.defaultPrevented || wrap.scrollTop === 0) return;
    const t = /** @type {Element} */ (e.target);
    if (t.closest?.('input, textarea, select, [contenteditable="true"], [role="tablist"]')) return;
    if (document.body.classList.contains('vc-modal-open')) return;
    wrap.scrollTo({ top: 0, behavior: 'instant' });
    e.preventDefault();
  });

  // `paper:lift` / `paper:settle` keep their meaning for the sounds: the page started / stopped scrolling
  let moving = false, lastS = 0, still = 0;
  // the table's heading row is stuck (its sticky top reached): surfaces.css covers the gap above it
  const th = /** @type {HTMLElement|null} */ (table.querySelector('th'));
  const stuck = () => { if (!th) return; const top = parseFloat(getComputedStyle(th).top) || 0; wrap.classList.toggle('vc-stuck', wrap.scrollTop > table.offsetTop - top + 0.5); };
  /** WP-18P: the scroll position as the last scroll event saw it (reading it can force a layout). */
  let known = wrap.scrollTop;
  wrap.addEventListener('scroll', () => {
    known = wrap.scrollTop;
    stuck();
    if (!moving && wrap.scrollTop > 0) { moving = true; emit('paper:lift', { sheet: 'slip', speed: 0 }); }
    still = 0;
  }, { passive: true });
  o.onPhase('physics', dt => {
    if (!moving) return;
    if (wrap.scrollTop !== lastS) { lastS = wrap.scrollTop; still = 0; return; }
    still += dt;
    if (still > 180) { moving = false; emit('paper:settle', { sheet: 'slip' }); }
  });

  return {
    slip: head, spacer: null, wrap,
    /** Is the table scrolled away from the top (as of the last scroll event)? */
    scrolled: () => known > 0,
    read: () => {
      const hr = head.getBoundingClientRect(), tr = table.getBoundingClientRect();
      return {
        s: wrap.scrollTop, scrollHeight: wrap.scrollHeight, onescroll: true,
        masthead: mast ? mast.parentElement === wrap : false,
        // the head and the table are in the same scroll box: their gap never changes while scrolling
        headBottom: +hr.bottom.toFixed(2), tableTop: +tr.top.toFixed(2),
        lifted: false, settling: false, drift: 0,
      };
    },
  };
}
