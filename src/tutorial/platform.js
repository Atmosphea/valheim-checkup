// @ts-check
/**
 * WP-03 popup step 1: which tab to preselect. Ask `navigator.userAgentData.platform` first
 * (Chromium, secure pages only), then fall back to the user agent string. Pure, so it is
 * unit-tested with made-up inputs.
 */

/** @typedef {'windows'|'mac'|'linux'} PlatformId */

/**
 * @param {string|null|undefined} text  a platform name or a whole user agent string
 * @returns {PlatformId|null}
 */
export function platformFromText(text) {
  if (!text) return null;
  const s = String(text);
  if (/windows|win32|win64|\bwin\b/i.test(s)) return 'windows';
  if (/mac ?os|macintosh|darwin|\bmac\b|iphone|ipad/i.test(s)) return 'mac';
  if (/linux|x11|cros|chrome os|android|ubuntu|fedora|steamos/i.test(s)) return 'linux';
  return null;
}

/**
 * @param {{platform?: string}|null|undefined} uaData  navigator.userAgentData
 * @param {string|null|undefined} userAgent            navigator.userAgent
 * @returns {PlatformId}  Windows when nothing is recognised (most Valheim players)
 */
export function detectPlatform(uaData, userAgent) {
  return platformFromText(uaData?.platform) ?? platformFromText(userAgent) ?? 'windows';
}

/** The real browser's answer. @returns {PlatformId} */
export function browserPlatform() {
  const nav = /** @type {any} */ (typeof navigator !== 'undefined' ? navigator : {});
  return detectPlatform(nav.userAgentData, nav.userAgent);
}
