// @ts-check
/**
 * WP-14: big generated images (paper, ink grain) go into CSS custom properties as short `blob:`
 * URLs, not data URLs. Chrome re-parses a var() value for every element that uses it, every time
 * that element is restyled: a 280–425 KB data URL cost ~0.14 ms per element, which turned the
 * desk's view changes, Details and How-to into 150–700 ms long tasks. A blob URL is ~60 bytes.
 */

/**
 * The same image as a `blob:` URL (lives as long as the page). Falls back to the data URL.
 * @param {string} dataUrl
 */
export function toBlobUrl(dataUrl) {
  try {
    const comma = dataUrl.indexOf(',');
    if (!dataUrl.startsWith('data:') || comma < 0 || typeof URL.createObjectURL !== 'function') return dataUrl;
    const meta = dataUrl.slice(5, comma);
    const base64 = meta.endsWith(';base64');
    const type = base64 ? meta.slice(0, -7) : meta;
    let bytes;
    if (base64) {
      const bin = atob(dataUrl.slice(comma + 1));
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else bytes = new TextEncoder().encode(decodeURIComponent(dataUrl.slice(comma + 1)));
    return URL.createObjectURL(new Blob([bytes], { type }));
  } catch { return dataUrl; }
}
