// @ts-check
/**
 * Scripted event sequences for the soundboard's "play sequence" buttons and the WP-12 tests.
 * They emit the same canonical events the finished features will emit, in the order and at
 * roughly the timings of files 04 and WP-10, so they exercise the real wiring.
 */
import { emit } from '../bus.js';

const STAMPS = ['done', 'missing', 'unknown', 'discovered'];

/** @param {[number, string, any?][]} steps  [ms, event, data] @returns {Promise<void>} */
function run(steps) {
  return new Promise(resolve => {
    let left = steps.length;
    if (!left) resolve();
    for (const [ms, type, data] of steps) setTimeout(() => { emit(type, data ?? {}); if (--left === 0) resolve(); }, ms);
  });
}

/**
 * Stamps with dots: 4 stamps land, then the 4 dot grids ink in parallel, starts staggered by
 * 80 ms, interval = min(90, (2000 − 80 × (grids − 1)) ÷ largest) (DECISIONS point 4).
 * The Carpenter is 40 dots × 4 grids.
 * @param {number} [t0] @param {number[]} [dots]
 */
export function stampSteps(t0 = 0, dots = [40, 40, 40, 40]) {
  /** @type {[number, string, any?][]} */ const steps = [];
  STAMPS.forEach((stamp, i) => steps.push([t0 + i * 160, 'fx:stamp-land', { stamp }]));
  const start = t0 + 3 * 160 + 250, largest = Math.max(...dots);
  const interval = Math.min(90, (2000 - 80 * (dots.length - 1)) / largest);
  dots.forEach((n, g) => {
    for (let i = 0; i < n; i++) steps.push([start + g * 80 + i * interval, 'fx:dot', { stamp: STAMPS[g], index: i }]);
    steps.push([start + g * 80 + n * interval + 40, 'fx:count-end', { stamp: STAMPS[g], value: n }]);
  });
  return steps;
}

export const sequences = {
  /** View change: wash out, wash in (450 ms), stamps and dots. */
  viewChange: () => run([[0, 'fx:wash-out-start'], [450, 'fx:wash-in-start'], [1050, 'fx:wash-in-end'], ...stampSteps(1100)]),
  /** Drag and latch: press, 600 ms of drag along the slot with detents, pre-latch, latch, the old bar returns. */
  dragLatch: () => {
    const category = 'The Carpenter';
    /** @type {[number, string, any?][]} */ const steps = [[0, 'bar:press', { category, travel: 0 }]];
    for (let i = 1; i <= 30; i++) {
      const travel = i / 30;
      steps.push([60 + i * 20, 'bar:drag', { category, travel }]);
      if (i % 5 === 0 && i < 30) steps.push([60 + i * 20, 'bar:detent', { category, travel, index: i / 5 }]);
      if (i === 18) steps.push([60 + i * 20, 'bar:prelatch', { category, travel }]);
    }
    steps.push([700, 'bar:latch', { category, travel: 1 }], [1050, 'bar:return', { category: 'The Artisan', travel: 0 }]);
    return run(steps);
  },
  /** Details unfold: open, 5 folds 70 ms apart, float; close after 1.5 s. */
  detailsUnfold: () => run([[0, 'app:details-open'], ...[0, 1, 2, 3, 4].map(i => /** @type {[number, string, any]} */ ([60 + i * 70, 'details:fold', { i }])), [450, 'details:float'], [1800, 'app:details-close']]),
  /** Spark out, 1.5 s of crackle, spark in. */
  sparkOutIn: () => run([[0, 'visor:open'], [40, 'spark:out'], [1600, 'spark:in'], [1700, 'visor:close']]),
  /** Coin hop: lift, first and second contact (the second adds the chatter). */
  coinHop: () => run([[0, 'coin:hop', { coin: 'load' }], [220, 'coin:land', { coin: 'load', contact: 1 }], [360, 'coin:land', { coin: 'load', contact: 2 }]]),
  /** Stamps with dots only. */
  stampsDots: () => run(stampSteps(0)),
};
