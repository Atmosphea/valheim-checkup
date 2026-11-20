// @ts-check
/**
 * WP-08: the gauntlet's anatomy, in centimetres.
 *
 * Frames (all right-handed):
 *   forearm bone  origin at the elbow, +x along the forearm to the wrist, +z the back of the arm.
 *   wrist / hand  origin at the wrist pivot, +x toward the fingers, +y toward the thumb, +z the
 *                 back of the hand. The wrist bone takes half of the wrist's bend, the hand the
 *                 other half, so the three wrist lames (forearm, wrist, hand) fan over each other.
 *   finger bones  origin at the joint, +x along the finger, +z its back; a positive curl (about
 *                 +y) bends toward the palm, a positive spread (about +z) turns toward the thumb.
 *
 * Hand 18 cm from the wrist pivot to the index tip (spec), cuff 12 cm long, vambrace to the elbow.
 */

/** Plate thickness and rolled-edge bead radius by plate size. */
export const SHELL = {
  big: { t: 0.09, rb: 0.085 },
  mid: { t: 0.07, rb: 0.065 },
  small: { t: 0.05, rb: 0.045 },
};

/** Finger lames: the outer lame of a segment is this much larger than the inner one. */
export const LAME_STEP = 0.125;
/** Each segment's outer lame runs this far past its joint, over the next segment. */
export const LAME_OVERLAP = 0.26;
/** Radial clearance kept between nested plates. */
export const CLEARANCE = 0.02;
/** Finger lames cover the back of the finger, ±this many degrees from the top. */
export const LAME_ARC_DEG = 100;

/**
 * Fingers: knuckle position in the hand frame, rest turn (deg), segment lengths, base radius,
 * and the taper of each segment's radius.
 */
export const FINGERS = {
  index: { at: [9.45, 3.7, 0.25], yaw: 2.5, pitch: -3, len: [4.1, 2.5, 1.95], r: 0.97, taper: 0.965 },
  middle: { at: [9.8, 1.2, 0.3], yaw: 0.8, pitch: -3, len: [4.4, 2.8, 2.05], r: 1.0, taper: 0.965 },
  ring: { at: [9.4, -1.3, 0.25], yaw: -1, pitch: -3, len: [4.1, 2.6, 1.95], r: 0.96, taper: 0.965 },
  little: { at: [8.6, -3.75, 0.1], yaw: -3, pitch: -3, len: [3.3, 2.1, 1.75], r: 0.86, taper: 0.965 },
};
/** @typedef {keyof typeof FINGERS} FingerName */
export const FINGER_NAMES = /** @type {FingerName[]} */ (['index', 'middle', 'ring', 'little']);

/** Thumb: base joint (in the palm, near the wrist), rest turn, segments, larger lames. */
export const THUMB = { at: [2.0, 3.3, -0.9], yaw: 40, pitch: 26, roll: -55, len: [4.0, 3.1, 2.6], r: 1.18, taper: 0.95, lamesFrom: 1.7 };

/** Tip caps: a short barrel under the last lame, then a dome to the tip. */
export const CAP = { barrel: 0.45, dome: 0.5, tipR: 0.16 };
/** The distal segment's outer lame steps out further, so the opening visor swings inside it. */
export const DISTAL_STEP = 0.2;

/** Hand body (for the back plate, knuckle plate and the leather). */
export const HAND = {
  /** Back-of-hand plate outline (hand frame x, y), from the wrist side round to the knuckles. */
  plateX0: 2.2, plateX1: 8.3,
  plateHalfWidthWrist: 2.1, plateHalfWidthKnuckles: 4.6,
  /** Dome height of the back plate's mid-surface over the hand axis (wrist → knuckle end), and its crown. */
  domeZ0: 1.55, domeZ1: 1.85, domeCrown: 0.55, fluteHeight: 0.18, fluteWidth: 0.55,
  /** Knuckle plate: band from x0 to x1, bosses over each knuckle. */
  knuckleX0: 7.55, knuckleX1: 9.15, knuckleZ: 2.2, bossHeight: 0.42, bossRadius: 0.85,
  /** Palm (leather) half sizes. */
  palmHalfWidth: 4.2, palmHalfHeight: 1.45,
};

/**
 * Wrist lames: zones about the wrist pivot (semi-axes a along x, b across, c up). The wrist and
 * hand lames are spheres, so any turn of the wrist (pitch or yaw) slides them over each other
 * without collision; the forearm lame (fixed to the cuff) is a wider ellipsoid around them.
 */
export const WRIST_LAMES = [
  { bone: 'forearm', a: 3.9, b: 5.35, c: 3.9, th0: -30, th1: 8 },
  { bone: 'wrist', a: 3.3, b: 3.3, c: 3.3, th0: -6, th1: 28 },
  { bone: 'hand', a: 3.1, b: 3.1, c: 3.1, th0: 12, th1: 46 },
];
export const WRIST_LAME_ARC_DEG = 78;

/** Forearm (vambrace, cuff, strap) in the forearm frame; `length` is elbow → wrist. */
export const ARM = {
  length: 40,
  /** Cuff: a flared bell from the wrist back toward the elbow. */
  cuff: { x0: -12.0, x1: -1.7, r0: 5.15, r1: 3.75, ey: 1.12, ez: 0.82 },
  /** Vambrace halves: from near the elbow into the cuff. */
  vambrace: { x0: -38.5, x1: -10.2, r0: 4.75, r1: 4.12, ey: 1.12, ez: 0.82, gapDeg: 5.5 },
  /** Strap and buckle around the vambrace. */
  strap: { x: -22, width: 2.0, lift: 0.09 },
};
