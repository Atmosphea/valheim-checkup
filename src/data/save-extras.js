// @ts-check
/**
 * WP-18C (Paul, WP-18 item 18): the parts of the save that core.js reads past without keeping.
 * core.js stays untouched and remains the source of every result the app shows; this walks the
 * same profile layout a second time (after core.js has checked the checksum) and keeps only the
 * three per-bucket dictionaries core.js skips (`r.dict(); r.dict(); r.dict();` after the stats).
 *
 * Layout per bucket (profile 46–47): 205 Float32 stats, then three string→Float32 dictionaries,
 * then 5 enemy dictionaries, then pickup, craft, fish, eat, build. Any surprise → null (the new
 * sections then say nothing rather than guess).
 */

/** @param {Uint8Array} body */
function reader(body) {
  const v = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const dec = new TextDecoder('utf-8', { fatal: true });
  let o = 0;
  const need = (/** @type {number} */ n) => { if (!Number.isSafeInteger(n) || n < 0 || o + n > body.length) throw Error('truncated'); };
  const r = {
    i() { need(4); const n = v.getInt32(o, true); o += 4; return n; },
    f() { need(4); const n = v.getFloat32(o, true); o += 4; return n; },
    skip(/** @type {number} */ n) { need(n); o += n; },
    count(max = 100000) { const n = r.i(); if (n < 0 || n > max) throw Error('count'); return n; },
    str() {
      let n = 0, m = 1;
      for (let j = 0; j < 5; j++) {
        need(1); const b = body[o++];
        n += (b & 127) * m;
        if (!(b & 128)) { need(n); const s = dec.decode(body.subarray(o, o + n)); o += n; return s; }
        m *= 128;
      }
      throw Error('string');
    },
    dict() { /** @type {Record<string, number>} */ const d = {}; for (let n = r.count(); n--;) { const k = r.str(); d[k] = r.f(); } return d; },
  };
  return r;
}

/**
 * @typedef {object} SaveExtras
 * @property {Record<string, number>[]} extraA  first skipped dictionary, per bucket
 * @property {Record<string, number>[]} extraB  second, per bucket
 * @property {Record<string, number>[]} extraC  third, per bucket
 */

/**
 * The skipped per-bucket dictionaries of a .fch file (the whole file, as loaded).
 * @param {ArrayBuffer|Uint8Array} input @returns {SaveExtras|null}
 */
export function readSaveExtras(input) {
  try {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(0, true);
    if (size < 12 || size + 4 > bytes.length) return null;
    const r = reader(bytes.subarray(4, 4 + size));
    const version = r.i(), statCount = r.count(1000), bucketCount = r.count(20);
    if (![46, 47].includes(version) || statCount !== 205 || bucketCount !== 10) return null;
    /** @type {SaveExtras} */ const out = { extraA: [], extraB: [], extraC: [] };
    for (let b = 0; b < bucketCount; b++) {
      r.skip(statCount * 4);
      out.extraA.push(r.dict()); out.extraB.push(r.dict()); out.extraC.push(r.dict());
      const enemies = r.count(10); for (let k = 0; k < enemies; k++) r.dict();
      for (let k = 0; k < 5; k++) r.dict(); // pickup, craft, fish, eat, build
    }
    return out;
  } catch { return null; }
}
