// @ts-check
/**
 * The event bus. Any part of the app can `emit(type, data)` and any other part can
 * `on(type, fn)` to react, without the two knowing about each other. Every emit is also
 * written to `events`, which the debug API exposes as `__vc.events` (last 2,000 entries).
 *
 * Entry shape: {t, wall, type, data}
 *   t    = central-clock (scaled) time in ms   (DECISIONS point 15)
 *   wall = performance.now() when emitted
 */
import { clock } from './util/clock.js';
import { isCanonical } from './events.js';

export const MAX_EVENTS = 2000;

/** @typedef {{t: number, wall: number, type: string, data: any}} BusEvent */

/** Ring buffer, oldest first. @type {BusEvent[]} */
export const events = [];

/** @type {Map<string, Set<(data: any, entry: BusEvent) => void>>} */
const listeners = new Map();

// Vite replaces import.meta.env in dev and builds; under plain Node it is undefined.
const dev = !!(/** @type {any} */ (import.meta).env?.DEV);

/*
 * Privacy (orchestrator decisions, WP-01 rounds 1–2): event data must never carry the
 * character name, the save's profile id or its fingerprint. Every secret the sources report
 * during this session is remembered and replaced in every string inside every event's data,
 * in any letter case, before the event is stored or handed to listeners. The name becomes
 * '{name}', the profile id '{profile}', the fingerprint '{fingerprint}'.
 * src/privacy.js registers the sources (the header name and the active save in storage).
 */
export const NAME_PLACEHOLDER = '{name}';
export const PROFILE_PLACEHOLDER = '{profile}';
export const FINGERPRINT_PLACEHOLDER = '{fingerprint}';

/** @typedef {{name?: string|null, profileId?: string|null, fingerprint?: string|null}} Secrets */
/** @type {Array<() => (Secrets|string|null|undefined)>} */
let sources = [];
/** Secrets seen this session, longest first so a longer one wins over a shorter one inside it. @type {{text: string, lower: string, placeholder: string}[]} */
let known = [];
/** One case-insensitive pattern for all secrets, so a placeholder is never redacted again. @type {RegExp|null} */
let pattern = null;

const escapeRe = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Remember one secret (case-insensitive, deduplicated). @param {any} text @param {string} placeholder */
export function addSecret(text, placeholder = NAME_PLACEHOLDER) {
  if (typeof text !== 'string' || !text.trim()) return;
  const lower = text.toLowerCase();
  if (known.some(k => k.lower === lower)) return;
  known = [...known, { text, lower, placeholder }].sort((a, b) => b.text.length - a.text.length);
  pattern = new RegExp(known.map(k => escapeRe(k.text)).join('|'), 'gi');
}

/**
 * Tell the bus where to read secrets. A source returns either a name string or
 * {name, profileId, fingerprint}. Sources are read on every emit.
 * @param {() => (Secrets|string|null|undefined)} fn
 */
export function addSecretSource(fn) { sources = [...sources, fn]; }
/** Older single-source form: the function returns the character name. @param {() => (string|null|undefined)} fn */
export function setNameSource(fn) { addSecretSource(fn); }

function refreshSecrets() {
  for (const src of sources) {
    let v = null;
    try { v = src(); } catch { /* source not ready */ }
    if (typeof v === 'string') addSecret(v, NAME_PLACEHOLDER);
    else if (v && typeof v === 'object') {
      addSecret(v.name, NAME_PLACEHOLDER);
      addSecret(v.profileId, PROFILE_PLACEHOLDER);
      addSecret(v.fingerprint, FINGERPRINT_PLACEHOLDER);
    }
  }
}

/** Replace every known secret in every string of `value`, any case (deep copy). @param {any} value @returns {any} */
export function redact(value) {
  if (typeof value === 'string') {
    if (!pattern) return value;
    return value.replace(pattern, m => known.find(k => k.lower === m.toLowerCase())?.placeholder ?? NAME_PLACEHOLDER);
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  return value;
}

/** Toast kinds, matched on the original app.js texts (redacted text, so the name never matters). */
const TOAST_KINDS = [
  ['loaded', /^Loaded .*\. Progress is up to date\.$/],
  ['unverified', /^This name has no reliable save mapping/],
  ['lifetime', /^Lifetime actions may include/],
  ['favorite-added', /^Count added to header\.$/],
  ['favorite-duplicate', /^Already in your header\.$/],
  ['favorite-full', /^Keep up to six favorite counts/],
  ['note-saved', /^Private note saved\.$/],
  ['correction-saved', /^Correction saved\./],
  ['progress-restored', /^Progress restored\.$/],
  ['path-copied', /^Path copied\.$/],          // WP-03 (src/tutorial/howto.js)
  ['copy-failed', /^Copy did not work here\./],  // WP-03
];
/** @param {string} text */
export function toastKind(text) { return (TOAST_KINDS.find(([, re]) => re.test(text)) || ['other'])[0]; }

/**
 * Announce that something happened. Data is redacted (name, profile id, fingerprint; see above); `app:toast` is stored as
 * {kind, text} with the name replaced by '{name}'.
 * @param {string} type  a canonical name from src/events.js
 * @param {any} [data]
 * @returns {BusEvent}
 */
export function emit(type, data = {}) {
  if (dev && !isCanonical(type)) console.warn(`bus: "${type}" is not a canonical event name (src/events.js)`);
  refreshSecrets();
  data = redact(data);
  if (type === 'app:toast') data = { kind: toastKind(String(data?.text ?? '')), text: String(data?.text ?? '') };
  const entry = { t: clock.now(), wall: performance.now(), type, data };
  events.push(entry);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  for (const key of [type, '*']) {
    const set = listeners.get(key);
    if (!set) continue;
    for (const fn of [...set]) {
      // A broken listener must never break the app code that emitted the event.
      try { fn(data, entry); } catch (e) { console.error(e); }
    }
  }
  return entry;
}

/**
 * Listen for an event (`'*'` hears every event). Returns a function that stops listening.
 * @param {string} type
 * @param {(data: any, entry: BusEvent) => void} fn
 */
export function on(type, fn) {
  let set = listeners.get(type);
  if (!set) listeners.set(type, (set = new Set()));
  set.add(fn);
  return () => { set.delete(fn); };
}

/**
 * Listen for the next single occurrence.
 * @param {string} type
 * @param {(data: any, entry: BusEvent) => void} fn
 */
export function once(type, fn) {
  const off = on(type, (data, entry) => { off(); fn(data, entry); });
  return off;
}

/** Empty the event log (tests). */
export function clearEvents() { events.length = 0; }

/** Forget remembered secrets and sources (tests only). */
export function resetNames() { known = []; pattern = null; sources = []; }
