// @ts-check
/**
 * WP-08 poses (spec table). Angles in degrees.
 *
 *   fingers  [curl1, curl2, curl3] per finger (0 = straight, + toward the palm), `spread` at the
 *            knuckle (+ toward the thumb)
 *   thumb    opp (opposition, rolls the thumb under the palm), curl1 / spread1 at the base,
 *            curl2, curl3
 *   wrist    pitch (+ = fingers down), yaw (+ = toward the thumb), roll
 *   cap      the index tip cap: 0 closed … 1 open (70°)
 *
 * Blending is per bone by quaternion slerp (rig.js). The pinch pose's thumb is solved at load so
 * the thumb pad meets the index pad exactly at `pinchPoint` (rig.js `solvePinch`).
 */

/** @typedef {{ curl: [number, number, number], spread: number }} FingerPose */
/** @typedef {{ opp: number, curl1: number, spread1: number, curl2: number, curl3: number }} ThumbPose */
/** @typedef {{ index: FingerPose, middle: FingerPose, ring: FingerPose, little: FingerPose, thumb: ThumbPose, wrist: { pitch: number, yaw: number, roll: number }, cap: number }} Pose */

/** @param {[number, number, number]} curl @param {number} [spread] @returns {FingerPose} */
const f = (curl, spread = 0) => ({ curl, spread });

/** @type {Record<string, Pose>} */
export const POSES = {
  /** Index slightly forward, others relaxed at 25–40° curl, thumb relaxed. */
  hover: {
    index: f([8, 7, 5]), middle: f([26, 30, 22]), ring: f([32, 34, 25]), little: f([38, 40, 28], -2),
    thumb: { opp: 18, curl1: 4, spread1: 4, curl2: 12, curl3: 10 },
    wrist: { pitch: 0, yaw: 0, roll: 0 }, cap: 0,
  },
  /** Index straight, others curled 60–80°, thumb tucked. */
  point: {
    index: f([0, 0, 0]), middle: f([66, 74, 52]), ring: f([72, 78, 55]), little: f([78, 80, 55], -2),
    thumb: { opp: 26, curl1: 8, spread1: 0, curl2: 18, curl3: 12 },
    wrist: { pitch: 0, yaw: 0, roll: 0 }, cap: 0,
  },
  /** Point, plus thumb open 25° and index bent 10°. */
  pinchReady: {
    index: f([10, 4, 2]), middle: f([66, 74, 52]), ring: f([72, 78, 55]), little: f([78, 80, 55], -2),
    thumb: { opp: 30, curl1: 4, spread1: 25, curl2: 10, curl3: 8 },
    wrist: { pitch: 0, yaw: 0, roll: 0 }, cap: 0,
  },
  /** Thumb tip meets the index pad at pinchPoint (thumb solved at load). */
  pinch: {
    index: f([48, 50, 26]), middle: f([66, 74, 52]), ring: f([72, 78, 55]), little: f([78, 80, 55], -2),
    thumb: { opp: 40, curl1: 10, spread1: 6, curl2: 20, curl3: 18 },
    wrist: { pitch: 0, yaw: 0, roll: 0 }, cap: 0,
  },
  /** All fingers extended and spread (18° fan between index and little, within ±12° per knuckle), wrist rolled 10°. */
  stretch: {
    index: f([0, 0, 0], 9), middle: f([0, 0, 0], 3), ring: f([0, 0, 0], -3), little: f([0, 0, 0], -9),
    thumb: { opp: 0, curl1: -4, spread1: 30, curl2: 0, curl3: 0 },
    wrist: { pitch: -6, yaw: 0, roll: 10 }, cap: 0,
  },
  /** Index extended, tip cap open, other fingers loosely curled. */
  release: {
    index: f([0, 0, 0]), middle: f([44, 46, 32]), ring: f([48, 50, 35]), little: f([52, 54, 38], -2),
    thumb: { opp: 24, curl1: 6, spread1: 6, curl2: 18, curl3: 14 },
    wrist: { pitch: -4, yaw: 0, roll: 0 }, cap: 1,
  },
  /** Fingers loosely cupped under the index, tip cap open. */
  receive: {
    index: f([6, 6, 2]), middle: f([52, 56, 40]), ring: f([56, 60, 44]), little: f([60, 62, 46], -2),
    thumb: { opp: 26, curl1: 8, spread1: 8, curl2: 16, curl3: 12 },
    wrist: { pitch: 4, yaw: 0, roll: 0 }, cap: 1,
  },
};

export const POSE_NAMES = /** @type {(keyof typeof POSES)[]} */ (Object.keys(POSES));
