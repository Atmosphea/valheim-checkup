// @ts-check
/**
 * Canonical event names: file 01 plus the extension from DECISIONS point 29.
 * Data shapes follow DECISIONS points 15, 16 and 29. Every `emit()` lands in `__vc.events`.
 */

/** File 01 "Canonical event names". */
export const FILE_01_EVENTS = [
  'app:load', 'app:render', 'app:category', 'app:mode', 'app:filter', 'app:details-open', 'app:details-close',
  'app:toast', 'app:favorite-add', 'app:favorite-remove',
  'fx:wash-out-start', 'fx:wash-in-end', 'fx:stamp-land', 'fx:dot', 'fx:count-end',
  'bar:press', 'bar:drag', 'bar:detent', 'bar:latch', 'bar:return', 'bar:springback',
  'gauntlet:stretch', 'gauntlet:pinch', 'spark:out', 'spark:in', 'coin:hop', 'paper:lift', 'paper:settle',
  'tour:step', 'tour:end', 'sound:play',
];

/** DECISIONS point 29: events added so every sound in file 06 has a cause. */
export const POINT_29_EVENTS = [
  'bar:hover', 'bar:prelatch', 'bar:nudge', 'impact', 'brass:pour', 'plaque:tick',
  'coin:land', 'coin:press', 'coin:flip', 'coin:mute',
  'gauntlet:creak', 'gauntlet:wall', 'visor:open', 'visor:close',
  'spark:embers', 'spark:click', 'spark:hover',
  'drag:file-enter', 'drag:file-leave', 'drop:file',
  'fx:wash-in-start', 'details:float', 'details:fold',
  'menu:open', 'menu:close', 'menu:select', 'app:star', 'toast:out', 'tag:swing',
  'help:open', 'app:export-list', 'title:stroke', 'hint:show', 'tour:start',
];

/** WP-11 (DECISIONS WP-03 open 8 and WP-11 rows): popup open/close for the unfold engine. */
export const WP11_EVENTS = ['howto:open', 'howto:close', 'help:close'];

/** WP-16B (Paul's items 14–17): the hand freezing and catching the spark, the leaving burst, the aiming dot. */
export const WP16_EVENTS = ['gauntlet:freeze', 'gauntlet:catch', 'spark:burst', 'reticle:spawn',
  // WP-16C (Paul's item 25): the Details button peeling off the paper and settling back {dir: 'off'|'settle'}
  'details:peel',
  // WP-16C (Paul's item 28): a column resized {widths} or reset {reset: true}
  'table:columns'];

/** Every name the bus knows. */
export const EVENT_NAMES = Object.freeze([...FILE_01_EVENTS, ...POINT_29_EVENTS, ...WP11_EVENTS, ...WP16_EVENTS]);

const known = new Set(EVENT_NAMES);
/** @param {string} type */
export const isCanonical = type => known.has(type);

/**
 * Data shapes (for readers; not enforced at runtime):
 *   app:load {ok: boolean, error?: string}        app:category {title}
 *   app:mode {mode: 'achievement'|'raw'}          app:filter {name, value}  (search debounced 150 ms)
 *   app:details-open {category, id}               app:details-close {category, id}
 *   app:toast {kind, text}  (name → '{name}')                            app:favorite-add / -remove {category, id}
 *   app:star {id, on}                             app:export-list {view, rows}
 *   app:render {view}
 *   bar:* {category, travel}   fx:stamp-land {stamp}   fx:dot {stamp, index}   fx:count-end {stamp, value}
 *   impact {strength, x, y}    details:fold {i}        sound:play {name, gain, pitch}
 */
