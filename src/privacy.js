// @ts-check
/**
 * Privacy: event data must never carry the character name, the save's profile id or its
 * fingerprint (orchestrator decisions, WP-01 rounds 1–2). The bus redacts every secret its
 * sources report, in any letter case. This module registers the sources:
 *   - the name the app shows in its header (#headerProfile strong);
 *   - the active profile id (localStorage 'valheim-checkup:active') and the fingerprint
 *     stored with that profile ('valheim-checkup:v1:<id>' → save.fingerprint).
 * app.js renders the header and writes storage before every emit that can contain these
 * (the "Loaded …" toast, app:load), so they are known in time. No app.js change needed.
 * Imported by main.js before app.js (ES imports run in order).
 */
import { addSecretSource } from './bus.js';

const ACTIVE_KEY = 'valheim-checkup:active';
const PROFILE_PREFIX = 'valheim-checkup:v1:';

/** Read the active profile once per id (storage may be unavailable; never throw). */
let lastId = null;
/** @type {{profileId: string|null, fingerprint: string|null}} */
let lastSecrets = { profileId: null, fingerprint: null };
function storedSecrets() {
  let id = null;
  try { id = localStorage.getItem(ACTIVE_KEY); } catch { return lastSecrets; }
  if (!id || id === lastId) return id ? lastSecrets : { profileId: null, fingerprint: null };
  let fingerprint = null;
  try { fingerprint = JSON.parse(localStorage.getItem(PROFILE_PREFIX + id) || 'null')?.save?.fingerprint ?? null; } catch { /* unreadable */ }
  lastId = id;
  lastSecrets = { profileId: id, fingerprint };
  return lastSecrets;
}

addSecretSource(() => ({
  name: document.querySelector('#headerProfile strong')?.textContent,
  ...storedSecrets(),
}));
