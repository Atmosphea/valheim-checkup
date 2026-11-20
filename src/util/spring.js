// @ts-check
/**
 * The shared damped spring (file 01 "Springs"). File 04 gives every spring as
 * `stiffness / damping` with mass 1; this helper takes exactly those numbers.
 *
 *   acceleration = (−stiffness × (value − target) − damping × velocity) ÷ mass
 *
 * Integration: semi-implicit Euler (update velocity first, then position with the new
 * velocity) at fixed 1/240 s substeps. Fixed substeps make the motion identical at 30, 60 or
 * 144 fps; leftover time is carried to the next step. Velocity is in units per second.
 */

/** Substep length in seconds. */
export const SUBSTEP = 1 / 240;
/** Longest step handled in one call (ms); longer gaps are cut so a stalled tab can't spin forever. */
export const MAX_STEP_MS = 250;

/**
 * @typedef {object} SpringParams
 * @property {number} stiffness
 * @property {number} damping
 * @property {number} [mass]  defaults to 1
 */

export class Spring {
  /**
   * @param {SpringParams & { value?: number, target?: number, velocity?: number }} params
   */
  constructor({ stiffness, damping, mass = 1, value = 0, target = value, velocity = 0 }) {
    if (!(stiffness > 0) || !(damping >= 0) || !(mass > 0)) throw new RangeError('spring needs stiffness > 0, damping ≥ 0, mass > 0');
    this.stiffness = stiffness;
    this.damping = damping;
    this.mass = mass;
    this.value = value;
    this.target = target;
    this.velocity = velocity;
    /** leftover seconds not yet simulated */
    this.carry = 0;
  }

  /** Advance by `dtMs` milliseconds. Returns the new value. @param {number} dtMs */
  step(dtMs) {
    this.carry += Math.min(Math.max(dtMs, 0), MAX_STEP_MS) / 1000;
    const { stiffness: k, damping: c, mass: m } = this;
    while (this.carry >= SUBSTEP) {
      const a = (-k * (this.value - this.target) - c * this.velocity) / m;
      this.velocity += a * SUBSTEP;
      this.value += this.velocity * SUBSTEP;
      this.carry -= SUBSTEP;
    }
    return this.value;
  }

  /** Jump to `value` at rest (only for setup; world rule 1 says nothing teleports on screen). @param {number} value */
  snap(value) { this.value = value; this.target = value; this.velocity = 0; this.carry = 0; return this; }

  /** Give the spring a kick (units per second). @param {number} velocity */
  impulse(velocity) { this.velocity += velocity; return this; }

  /** True when both distance to target and speed are below `epsilon`. */
  settled(epsilon = 1e-3) { return Math.abs(this.value - this.target) < epsilon && Math.abs(this.velocity) < epsilon; }

  /** Damping ratio ζ: below 1 overshoots, 1 is critical, above 1 creeps in. */
  get dampingRatio() { return this.damping / (2 * Math.sqrt(this.stiffness * this.mass)); }
}

/** A spring over several numbers at once (x/y/z, angles…), sharing one set of parameters. */
export class SpringVec {
  /** @param {SpringParams & { value?: number[], target?: number[] }} params */
  constructor({ value = [0], target = value, ...params }) {
    this.springs = value.map((v, i) => new Spring({ ...params, value: v, target: target[i] ?? v }));
  }
  /** @param {number[]} target */
  setTarget(target) { target.forEach((t, i) => { this.springs[i].target = t; }); return this; }
  /** @param {number} dtMs */
  step(dtMs) { return this.springs.map(s => s.step(dtMs)); }
  get value() { return this.springs.map(s => s.value); }
  settled(epsilon = 1e-3) { return this.springs.every(s => s.settled(epsilon)); }
}
