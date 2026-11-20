// @ts-check
/**
 * Audio entry point (imported by src/main.js in both run modes). Creates the engine from
 * src/config/audio-mix.json, wires it to the event bus and adds the audio part of the debug API:
 *
 *   __vc.sound.log            every play {name, gain (dB), pitch (rate), t, phase?}
 *   __vc.sound.muted() / mute(bool)   the Sound coin's state, remembered under valheim-checkup-3d:sound
 *   __vc.sound.unlocked()     true after the first pointer or key press
 *   __vc.sound.requests       every play request, also silent ones {name, played, why?: locked|muted|deferred}
 *   __vc.sound.stats()        voices, takes, maximum voices per sound
 *   __vc.sound.check(name, gainDb?)   offline render through the master chain (tests)
 *   __vc.sound.built() / deferred()   which sounds have recipes / were cut
 *   __vc.sound.emit(type, data)       emit a canonical event (tests, soundboard)
 *   __vc.sound.sequences.*            scripted event sequences
 */
import mixConfig from '../config/audio-mix.json';
import { emit } from '../bus.js';
import { vc } from '../debug.js';
import { createEngine } from './engine.js';
import { wire } from './wiring.js';
import { sequences } from './sequences.js';

export const engine = createEngine(mixConfig);
wire(engine);

Object.assign(vc.sound, {
  muted: engine.muted,
  /** @param {boolean} m */
  mute: m => engine.setMuted(m),
  unlocked: engine.unlocked,
  requests: engine.requests,
  stats: engine.stats,
  resetStats: engine.resetStats,
  check: engine.offlineCheck,
  built: engine.built,
  // Paul, WP-17 item 21: is a loop (amb.hall) running
  looping: engine.looping,
  deferred: () => Object.keys(engine.mix.sounds).filter(n => engine.isDeferred(n)),
  mix: () => engine.mix,
  emit,
  sequences,
});
