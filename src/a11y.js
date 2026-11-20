// @ts-check
/**
 * WP-14 · small accessibility repairs to the original page, in both modes, without touching
 * app.js or the markup the parity tests read.
 *
 * The star column's header has an aria-label but no content, which axe flags (empty-table-header).
 * Parity requires its text to stay empty, so the content is an image role with a name: screen
 * readers get "Star" in the header row; textContent stays ''.
 */
const th = document.querySelector('thead th[aria-label="Star item"]');
if (th && !th.querySelector('[role="img"]')) {
  const star = document.createElement('span');
  star.setAttribute('role', 'img');
  star.setAttribute('aria-label', 'Star');
  th.append(star);
}
