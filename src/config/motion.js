// @ts-check
/**
 * Motion tunables: every value from spec file 04 (physical and magical behaviour), grouped by
 * object in the same order as the file. Tuning the feel of the desk means editing numbers
 * here, never hunting through code.
 *
 * Units (file 01): lengths in cm, times in ms, angles in degrees (names end in `Deg`; code
 * converts to radians), speeds in cm/s, frequencies in Hz, fractions 0–1 (8% = 0.08).
 * Springs are {stiffness, damping, mass} for src/util/spring.js; file 04 writes them
 * "stiffness / damping" with mass 1.
 *
 * Names in backticks in file 04 (bristleAmp, impactFalloff, breezeDecay…) are kept exactly.
 * Rows with no name in the spec get a descriptive name; the comment quotes the row.
 */

/** @param {number} stiffness @param {number} damping */
const spring = (stiffness, damping) => Object.freeze({ stiffness, damping, mass: 1 });

/** World rules 1–6. */
export const world = {
  /** Rule 3: strength × 1 / (1 + d / impactFalloff), d in cm. */
  impactFalloff: 20,
  /**
   * Rule 4: breeze decay, ms. File 04's 600 ms, read as a half-life
   * (DECISIONS, WP-01 open point 2, which amends point 20).
   */
  breezeDecay: 600,
  breezeDecayIsHalfLife: true,
  /** DECISIONS point 20: breeze field over the desk, value = air speed in cm/s. */
  breezeGridCols: 32,
  breezeGridRows: 24,
  /** DECISIONS point 20: paper lift = min(0.25 cm, speed × 0.002). */
  breezePaperLiftPerSpeed: 0.002,
  breezePaperLiftMax: 0.25,
  /** DECISIONS point 20: tag swing = min(8°, speed × 0.05). */
  breezeTagSwingPerSpeed: 0.05,
  breezeTagSwingMaxDeg: 8,
};

/** Paper (main sheet and the collection inset sheet). */
export const paper = {
  /** Idle bristle: slow vertex ripple and fibre shimmer. */
  bristleAmp: 0.03,
  bristleFreq: 0.08, // per cm
  bristleSpeed: 0.15,
  /** Breeze: edges and corners lift locally, then settle; corners weighted ×2. */
  breezeLiftMax: 0.25,
  breezeLiftSpring: spring(120, 14),
  breezeCornerWeight: 2,
  /** Impact: whole sheet dips and rebounds. */
  impactDip: -0.02,
  impactSpring: spring(600, 20),
  /** File dragged over the window: bristleAmp ×2. */
  fileDragBristleMul: 2,
  /** File dropped: ink ripple ring 0 → 40 cm in 900 ms, 4% darker at the ring. */
  dropRippleRadiusFrom: 0,
  dropRippleRadiusTo: 40,
  dropRippleMs: 900,
  dropRippleDarken: 0.04,
  /**
   * Ink wash passes: sheen 0.3, dries over 800 ms behind the edge. Paul, WP-18 item 1: the damp
   * band no longer darkens the paper (was 0.06, a dark square behind each piece in the veil); the
   * setting and its veil patch were deleted in WP-18P.
   */
  washDampSheen: 0.3,
  washDampDryMs: 800,
};

/** Printed text and controls. */
export const printed = {
  /** Hover on a control: ink 8% darker, bleeds 0.3 px, over 120 ms. */
  hoverDarken: 0.08,
  hoverBleedPx: 0.3,
  hoverMs: 120,
  /** Press: −0.03 cm into the paper, 15% darker; spring 500 / 30 on release. */
  pressDepth: -0.03,
  pressDarken: 0.15,
  pressReleaseSpring: spring(500, 30),
  /** Disabled: faded ink. */
  disabledOpacity: 0.45,
  /** Value change: new ink replaces old with a wipe, never a hard swap. */
  valueWipeMs: 180,
};

/** Woodblock and steel bars. */
export const bar = {
  /** Hover on knob: glint sweeps across the knurling. */
  hoverGlintMs: 300,
  /** Press: lifts out of its slot and tilts toward the pull. */
  pressLift: 0.05,
  pressTiltDeg: 0.3,
  pressMs: 80,
  /** Drag: follows the pointer along the slot only; knob rolls ±6° with speed. */
  dragSpring: spring(900, 40),
  dragKnobRollDeg: 6,
  /** Detent every sixth of travel: micro-snap 0.02 cm, event bar:detent. */
  detentDivisions: 6,
  detentSnap: 0.02,
  /** Past 60%: strong magnetic detent toward latch (0.15 cm pull), pre-latch click. */
  latchThreshold: 0.6,
  prelatchPull: 0.15,
  /** Release at ≥ 60%: latch with one overshoot (~0.12 cm), dust puff of 6 particles over 300 ms. */
  latchSpring: spring(700, 22),
  latchOvershoot: 0.12,
  latchDustParticles: 6,
  latchDustMs: 300,
  /** Latch: previous bar returns on the linkage 90 ms after latch, over 260 ms; others twitch 0.03 cm. */
  linkageDelayMs: 90,
  linkageReturnMs: 260,
  linkageTwitch: 0.03,
  /** Release under 60%: springs back right with a soft thunk. */
  springbackSpring: spring(400, 26),
  /** Mouse click without drag: nudge 0.4 cm; a 2nd click within 4 s shows the hint for 2.5 s. */
  /** WP-06 mechanism step 4: a click = moved under 0.3 cm and released within 250 ms. */
  clickMaxMove: 0.3,
  clickMaxMs: 250,
  /** Builder value: the nudge goes out in this long, then the springback spring brings it home. */
  nudgeOutMs: 70,
  nudgeDistance: 0.4,
  nudgeHintWindowMs: 4000,
  nudgeHintMs: 2500,
  /** Keyboard Enter/Space or programmatic click: bar slides by itself. */
  autoSlideMs: 420,
  autoSlideEase: 'inOutCubic',
  /** Builder values: the latch is a landing (world rule 3), the return a smaller one. */
  latchImpact: 0.12,
  returnImpact: 0.06,
  /** Builder value: knob roll reaches ±6° at this bar speed (cm/s). */
  dragKnobRollSpeed: 40,
  /** Builder value: the press lift / drop back uses this spring (80 ms rise ≈ 900 / 60). */
  liftSpring: spring(900, 60),
  /** Builder value: the linkage return curve. */
  linkageEase: 'inOutCubic',
  /** Impact: every bar rattles ±0.03 cm, staggered 0–40 ms. */
  impactRattle: 0.03,
  impactRattleSpring: spring(500, 18),
  impactStaggerMinMs: 0,
  impactStaggerMaxMs: 40,
  /** Counts change: molten brass pours along the slot inlay. */
  brassPourMs: 1200,
  /** DECISIONS point 23: inlay pour uses ease-out quartic. */
  brassPourEase: 'outQuart',
  /** Overall total: plaque digits roll like a mechanical counter (P10: 650 ms delay, 1,800 ms). */
  plaqueRollMs: 1800,
  plaqueRollDelayMs: 650,
  /** DECISIONS point 23. */
  plaqueRollEase: 'outQuart',
};

/** Coins (How to, Load character, Import, Export, Sound). */
export const coin = {
  /**
   * Hover: hop up, tilt toward the pointer, spin, two bounces, a wobble. Paul, WP-18 item 8: more
   * dramatic: hop 0.6 → 0.95 cm (rise 140 → 170 ms), tilt 8° → 22°, and the turn 15° (a snap) → a
   * 75° spin eased over `hoverSpinMs` with a small overshoot. A new hover restarts it at once from
   * wherever the coin is (`hoverRetriggerMs` apart at least, so pointer jitter can't stutter it).
   */
  hoverHop: 0.95,
  hoverHopMs: 170,
  hoverTiltDeg: 22,
  hoverSpinDeg: 75,
  hoverSpinMs: 700,
  hoverRetriggerMs: 120,
  /** Paul, WP-18 item 8: hover is a round hit test on the coin's face (radius × this), every frame. */
  hoverHitScale: 1.04,
  hoverBounces: [0.18, 0.05],
  hoverWobbleMs: 400,
  /** Builder value: the wobble's rocking frequency (Hz) at its start; it speeds up as it dies, like a settling coin. */
  hoverWobbleHz: 9,
  /** Builder value: the first landing is a small impact (world rule 3). */
  landImpact: 0.05,
  /** Builder value: press and release spring. */
  pressSpring: spring(700, 40),
  /** Builder value: file-drag jitter rate (Hz) and the Load coin's rune ring turn (deg/s). */
  fileDragJitterHz: 18,
  fileDragRingDegPerSec: 40,
  /** Builder value: gold motes on "save loaded". */
  loadedMotes: 14,
  loadedMoteRise: 4,
  /** Builder value: "lands with a dull thud" after the shake. */
  failShakeMs: 520,
  /** Spark within 5 cm: rune emblem warms and glows, emissive 0 → 0.6. */
  sparkRuneDistance: 5,
  sparkRuneEmissiveFrom: 0,
  sparkRuneEmissiveTo: 0.6,
  /** Press: into the paper. */
  pressDepth: -0.08,
  /** File dragged over the window: all coins jitter 0.02 cm; Load coin rises 0.4 cm. */
  fileDragJitter: 0.02,
  fileDragLoadRise: 0.4,
  /** Drop accepted: Load coin flips 360° in 500 ms. */
  dropFlipDeg: 360,
  dropFlipMs: 500,
  /** Save loaded: rune flashes gold, motes rise. */
  loadedFlashMs: 600,
  /** Load failed: shakes "no", yaw ±10° twice. */
  failShakeYawDeg: 10,
  failShakeCount: 2,
  /** Impact above 0.7: coins rattle and may hop up to 0.05 cm. */
  impactHopThreshold: 0.7,
  impactHopMax: 0.05,
  /** Import or Export: flips 180° and back in 420 ms. */
  transferFlipDeg: 180,
  transferFlipMs: 420,
  /** Sound muted: turns to its reverse face. */
  muteTurnMs: 300,
};

/** Gauntlet. */
export const gauntlet = {
  /** Follows the pointer with inertia (~60–90 ms lag). */
  followSpring: spring(220, 26),
  followLagMinMs: 60,
  followLagMaxMs: 90,
  /** Leans into motion: roll 0.02° per cm/s up to 12°, pitch up to 8°; fingers trail. */
  leanRollDegPerSpeed: 0.02,
  leanRollMaxDeg: 12,
  leanPitchMaxDeg: 8,
  fingerSpring: spring(300, 18),
  /** Idle: breathing bob 0.08 cm at 0.25 Hz; finger micro-curl 2° at 0.18 Hz, offset phases. */
  idleBob: 0.08,
  idleBobHz: 0.25,
  idleCurlDeg: 2,
  idleCurlHz: 0.18,
  /** Stretch every 25–40 s once idle over 3 s: spread 18°, wrist 10°, 60 ms between fingers, 1,400 ms. */
  stretchIntervalMinMs: 25000,
  stretchIntervalMaxMs: 40000,
  stretchIdleMs: 3000,
  stretchSpreadDeg: 18,
  stretchWristDeg: 10,
  stretchFingerStaggerMs: 60,
  stretchMs: 1400,
  /**
   * Paul, WP-18 item 5: the stretch plays only while the spark is out and the hand rests in its
   * idle: the first one 5–9 s after the spark has left, then every 15–28 s while it stays out.
   * The mouse no longer delays it (the hand ignores the mouse while the spark is out).
   */
  sparkStretchFirstMinMs: 5000,
  sparkStretchFirstMaxMs: 9000,
  sparkStretchIntervalMinMs: 15000,
  sparkStretchIntervalMaxMs: 28000,
  /** Within 4 cm of a knob: pointing pose, thumb opens 25° to pinch. */
  knobPoseDistance: 4,
  knobThumbOpenDeg: 25,
  /** Press knob: thumb and index close in 120 ms. */
  pinchMs: 120,
  /** Drag: wrist tilts in the drag direction up to 10°. */
  dragWristTiltDeg: 10,
  /**
   * Board border: hand slows against an invisible wall (stiffness 600), wrist bends back −6°.
   * File 04 gives no damping for the wall; 49 ≈ critical (2√600) is a starting value, not spec.
   */
  wallSpring: spring(600, 49),
  wallWristDeg: -6,
  /** Pointer leaves the board: fingertip plate hinges open 70° over 180 ms; spark leaps out. */
  plateOpenDeg: 70,
  plateOpenMs: 180,
  /** Spark is out: hand rests at the border and turns to watch, yaw ±15°. */
  watchYawDeg: 15,
  watchSpring: spring(60, 12),
  /** Pointer returns: plate closes in 140 ms. */
  plateCloseMs: 140,
  /** Impact: small bob in the air. */
  impactBob: 0.05,

  // ── WP-09 builder values (not in file 04; see DECISIONS) ──
  /** Gauntlet zone = woodblock outline + 1 cm (spec), hysteresis band 0.6 cm (spec). */
  zoneGrow: 1,
  zoneHysteresis: 0.6,
  /** pointerTip height over the board's top face: hovering, and while pinching a knob.
   *  WP-16 item 14: 3 cm (was 4), straight above the aiming dot, "hovers slightly above it". */
  hoverHeight: 3,
  pinchHeight: 1.2,
  /** Where the hand rests (board cm from its bottom-left corner) when the pointer is away. WP-16: (15, 34) on the taller board (was 9, 4). */
  restAt: { x: 15, y: 34 },
  /** Fingertip never falls more than this far behind (spec 1.2 cm); a stiffer spring catches up. */
  catchUpStartCm: 1.2,
  catchUpEndCm: 0.4,
  catchUpSpring: spring(900, 60),
  /** Lean and wrist springs, pitch per cm/s of forward speed. */
  leanSpring: spring(160, 22),
  leanPitchDegPerSpeed: 0.015,
  dragWristDegPerSpeed: 0.12,
  /** Impact bob spring. */
  bobSpring: spring(260, 14),
  /** Fingers trail when the hand moves fast. */
  fingerTrailDegPerSpeed: 0.03,
  fingerTrailMaxDeg: 8,
  /** Crossfade between poses. */
  poseBlendMs: 160,
  /** Touch: the hand glides onto a knob being dragged. */
  touchGlideMs: 160,
  /** Handover (spec timeline): spark appears at 120 ms, flies 160 ms out; flies 140 ms back.
   *  Paul, WP-16 item 17: out on a twirl of 1–3 turns, so the flight out takes 380 ms + 200 ms a turn; WP-16 item 16:
   *  the last stretch in, where spark and hand close on each other, 170 ms. */
  sparkOutAtMs: 120,
  sparkOutMs: 380,
  sparkOutPerTurnMs: 200,
  sparkInMs: 170,
  /**
   * Paul, WP-16 items 15–16: frozen while the spark is out; on its return the hand comes with
   * inertia (underdamped, ζ ≈ 0.5: a small overshoot), turns up to 22° to face the spark, and
   * they meet once the socket is within 3.5 cm of it: a jolt of 9 cm/s and a 0.12 cm bob. The
   * normal follow takes over once the hand is within 0.3 cm of the pointer and under 4 cm/s.
   */
  returnSpring: spring(85, 10.5),
  returnDoneCm: 0.3,
  returnDoneSpeed: 4,
  catchMeetCm: 3.5,
  catchJolt: 9,
  catchBob: 0.12,
  catchFaceDeg: 22,
  /** Coin runes wake within 5 cm of the spark (DECISIONS point 32). */
  runeWakeCm: 5,
};

/**
 * WP-08 rig: joint limits (spec), the two-bone arm and where the hand points. Builder values
 * (not in file 04) are marked; all in degrees and cm.
 */
export const gauntletRig = {
  limits: {
    curl: [0, 95], spread: [-12, 12],
    thumbOpp: [0, 60], thumbCurl1: [-10, 45], thumbSpread1: [-15, 35], thumbCurl: [0, 80],
    wristPitch: [-35, 35], wristYaw: [-20, 20],
    /** Builder: the stretch rolls the wrist 10°; roll is limited to ±15°. */
    wristRoll: [-15, 15],
  },
  /** Tip cap (visor) opens this far. */
  capOpenDeg: 70,
  /** Builder: the arm. Shoulder off-screen to the upper left; upper arm length; the elbow bends toward `pole`. */
  shoulder: { x: -82, y: 30, z: 40 },
  upperArm: 40,
  pole: { x: -0.35, y: 0.55, z: 0.75 },
  /**
   * Builder: the hand points away from this point on the paper (so the arm comes in from the
   * upper left), pitched down by `pitchDeg` in hover; `yawBiasDeg` turns it a little clockwise.
   */
  aimFrom: { x: -78, y: 22 },
  pitchDeg: 18,
  yawBiasDeg: -4,
  /**
   * Paul, WP-17 item 19: a first-person LEFT hand that comes in from the bottom left, like the
   * viewer's own left hand. The same procedural parts, mirrored (gauntlet/index.js: the model's
   * root is mirrored in x and the arm is solved as the mirror image of a right arm). These replace
   * shoulder / pole / upperArm / aimFrom / yawBiasDeg above while `hand` is 'left' (world cm).
   */
  hand: /** @type {'left'|'right'} */ ('left'),
  /** the shoulder leans after the hand (`followK` of the way to tip + `follow`), so the arm keeps a natural bend all over the board */
  left: { shoulder: { x: -50, y: -66, z: 26 }, follow: { x: -14, y: -66, z: 30 }, followK: 0.85, upperArm: 42, pole: { x: -0.6, y: -0.2, z: -0.4 }, aimFrom: { x: -52, y: -60 }, yawBiasDeg: 4 },
};

/** Spark. */
export const spark = {
  /** Movement: no lag; trail of 14 particles, 220 ms life, emitted above 15 cm/s. */
  trailParticles: 14,
  trailLifeMs: 220,
  trailMinSpeed: 15,
  /** Sudden stop: from over 80 to under 20 cm/s within 90 ms. */
  stopFromSpeed: 80,
  stopToSpeed: 20,
  stopWithinMs: 90,
  /** …then 4–8 embers at 50–90% of last velocity, ±15°, 250–450 ms life, drag 3/s. */
  stopEmbersMin: 4,
  stopEmbersMax: 8,
  stopEmberSpeedMin: 0.5,
  stopEmberSpeedMax: 0.9,
  stopEmberSpreadDeg: 15,
  stopEmberLifeMinMs: 250,
  stopEmberLifeMaxMs: 450,
  stopEmberDrag: 3,
  /** Always: warm flickering light, no bloom: 2,700 K, range 18 cm, flicker 0.85–1.1 at 12 Hz. */
  lightKelvin: 2700,
  lightRange: 18,
  lightFlickerMin: 0.85,
  lightFlickerMax: 1.1,
  lightFlickerHz: 12,
  /** Over a control: core ×1.3, halo ×1.5, light +20%. */
  hoverCoreMul: 1.3,
  hoverHaloMul: 1.5,
  hoverLightBoost: 0.2,
  /** Click: thin ring 0 → 14 px in 220 ms, with three embers. */
  clickRingFromPx: 0,
  clickRingToPx: 14,
  clickRingMs: 220,
  clickEmbers: 3,
  /** Over a text field: thin vertical ember caret 2 × 16 px. */
  caretWidthPx: 2,
  caretHeightPx: 16,
  /** Idle: a crackle ember every 1.5–3 s. */
  idleCrackleMinMs: 1500,
  idleCrackleMaxMs: 3000,
  /** Leaves or re-enters the window: fade 150 ms. */
  windowFadeMs: 150,
  /** Builder: the handover flight bows out on a 2 cm arc (spec). WP-16: replaced by the twirl. */
  flightArcCm: 2,
  /** Paul, WP-16 item 17: the twirl's loop radius (cm on the paper; the loops are 2 × this across). */
  twirlRadiusCm: 1.6,
  /** Paul, WP-16 item 17: the leaving burst. Thrown at 260–720 px/s in a ±38° cone toward the
   *  pointer, braked at 4.5/s (so they slow almost to a hang: the slow-motion look), streaks of
   *  0.035 s of motion, 0.65–1.2 s life, a 90 ms flash at the socket. */
  leaveBurst: { count: 16, spreadDeg: 38, speedMin: 260, speedMax: 720, drag: 4.5, gravity: 40, streakS: 0.035, lifeMinMs: 650, lifeMaxMs: 1200, staggerMs: 60, flashMs: 90, flashPx: 16 },
  /** WP-16 item 16: the small burst where the spark and the hand meet. */
  catchBurst: { count: 6, spreadDeg: 70, speedMin: 70, speedMax: 190, drag: 5, gravity: 40, streakS: 0.03, lifeMinMs: 240, lifeMaxMs: 420, staggerMs: 20, flashMs: 70, flashPx: 10 },
  /** WP-16 item 14: the aiming dot fades in over 90 ms (out 120 ms) and pops 1.45× over 240 ms when it spawns. */
  reticleInMs: 90,
  reticleOutMs: 120,
  reticlePopMs: 240,
  reticlePop: 0.45,
};

/** Stamps, dots and numbers. */
export const stamp = {
  /** Big stamp: falls from 3 cm in 160 ms, scale 1.12 → 1, tilt ±2°, rebound 0.15 cm, settle 120 ms, impact(1.0). */
  bigFallHeight: 3,
  bigFallMs: 160,
  bigScaleFrom: 1.12,
  bigScaleTo: 1,
  bigTiltDeg: 2,
  bigRebound: 0.15,
  bigSettleMs: 120,
  bigImpact: 1.0,
  /** Desk shake from a big stamp: camera 0.04 cm, 140 ms. */
  shakeAmount: 0.04,
  shakeMs: 140,
  /** Fresh ink bleeds 0.5 px over 400 ms; wet sheen dries over 1,500 ms. */
  freshBleedPx: 0.5,
  freshBleedMs: 400,
  freshSheenDryMs: 1500,
  /** Dot inks in: scale 1.3 → 1 in 90 ms, ±0.4 px, ±6°, impact(0.08). */
  dotScaleFrom: 1.3,
  dotScaleTo: 1,
  dotMs: 90,
  dotJitterPx: 0.4,
  dotRotateDeg: 6,
  dotImpact: 0.08,
  /** Last dot of a grid: soft glint. */
  lastDotGlintMs: 250,
  /** Count-up: rolls up from 0 in 800 ms ease-out cubic; last digit settles 1.06 → 1 in 120 ms. */
  countUpMs: 800,
  countUpEase: 'outCubic',
  countSettleScaleFrom: 1.06,
  countSettleScaleTo: 1,
  countSettleMs: 120,
  /** WP-10 step 6: random ASCII grain in each impression: 'grain' (default), 'scramble' or 'both'. */
  stampAscii: 'grain',
  /** WP-10 step 6: the grain canvas, drawn fresh on every landing. */
  grainW: 512,
  grainH: 280,
  grainCharsMin: 60,
  grainCharsMax: 120,
  grainCharPxMin: 6,
  grainCharPxMax: 14,
  grainCharRotDeg: 10,
  grainCharAlphaMin: 0.15,
  grainCharAlphaMax: 0.5,
  grainChars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&*+=-:;.,\'"/\\|<>~^',
  /** Builder: noise-threshold ink voids, share of the impression left uninked (approx.). */
  grainVoidThreshold: 0.72,
  grainVoidCell: 9,
  /** WP-14: how much ink a void takes away (was 0.9): at 0.9 a void could cut a stroke clean through,
   *  so a 6 read as a 5; at 0.5 the impression stays mottled and every glyph stays whole. */
  grainVoidDepth: 0.5,
  /** `scramble`: the number flickers through random characters before counting. */
  scrambleMs: 300,
  scrambleChars: '#%&*+=-:;/\\|<>~^0123456789',
  /** WP-10 step 8: dots in rows of 10; diameter min(0.42 cm, inner width ÷ 10 × 0.7). */
  dotsPerRow: 10,
  dotDiameterCm: 0.42,
  dotCellShare: 0.7,
  /** DECISIONS point 5: a partial dot is drawn at least this full. */
  dotPartialMin: 0.25,
  /** Dot that empties (smaller updates): fades out. Builder value. */
  dotFadeMs: 150,
  /** Smaller updates: changed dots tick in this far apart. Builder value. */
  dotUpdateIntervalMs: 40,
  /** Reduced motion: the one soft stamp sound's strength (0–1). Builder value. */
  reducedStampStrength: 0.35,
};

/**
 * WP-10: the view-change sequence (times from the latch / selection, ms).
 *   0     old content washes out, element by element top to bottom (outStaggerMs apart, outMs each)
 *   450   new content washes in from the left (inStaggerMs apart, inMs each)
 *   1000  the four stamps land, stampStaggerMs apart; each count-up runs stamp.countUpMs
 *   1500  dot grids ink in, all done by dotsDoneByMs
 *   1600  progress rule draws (ruleMs)
 *   1700  filters, list info, table header; first rowsAnimated rows rowStaggerMs apart
 */
export const wash = {
  /**
   * Paul, WP-17 item 8: a noisier wash, a little faster than WP-16's, with the stamps landing about
   * halfway through it (they used to come in its second half and read as "after"). Was: outMs 450,
   * inStartMs 450, inStaggerMs 60, inMs 850, stampStartMs 1000, stampStaggerMs 150, dotsStartMs
   * 1500, dotsDoneByMs 3500, dotSpanMs 2000, ruleStartMs 1600, ruleMs 600, listStartMs 1700.
   * The wash-in now runs from 360 ms to about 2,300 ms; the four stamps land at 1,100–1,460 ms.
   *
   * Paul, WP-18 item 2: smoother and a little faster, with no beat after the fifth unit. The
   * masthead units started 360–675 ms, but nothing new began until the stamps at 1,100 ms and the
   * table at 1,250 ms: about 600 ms of blank sheet below the title. Now each group starts as the
   * one before it is still inking: masthead 300–580 ms (40 ms apart, 600 ms each), the stamps from
   * 680 ms (90 ms apart), the rule from 700 ms, the filters and rows from 760 ms (25 ms apart).
   * Was: outStaggerMs 25, outMs 340, inStartMs 360, inStaggerMs 45, inMs 660, stampStartMs 1100,
   * stampStaggerMs 120, dotsStartMs 1450, dotsDoneByMs 2800, dotSpanMs 1300, ruleStartMs 1150,
   * ruleMs 500, listStartMs 1250. Ends about 1,660 ms (rows) and 2,300 ms (last dot).
   */
  outStaggerMs: 18,
  outMs: 320,
  /**
   * Paul, WP-17 item 13: dragging a bar fades the current view out with its travel (0…1 of the
   * slot): from `dragFadeFrom` to fully faded at `dragFadeTo` (smoothstep), back over
   * `dragFadeBackMs` when let go short. At a latch with the fade past `dragFadeSkipOut` the
   * wash-out is skipped and the wash-in starts at once (the timeline starts inStartMs in).
   */
  dragFadeFrom: 0.04,
  dragFadeTo: 0.95,
  dragFadeBackMs: 260,
  dragFadeSkipOut: 0.5,
  inStartMs: 300,
  /** Paul, WP-16 item 18: the wash-in is slower so it reads (WP-17 item 8: a little faster again). */
  inStaggerMs: 40,
  inMs: 600,
  /**
   * Paul, WP-16 item 18: the edge's path across a unit, in unit widths (see ink/index.js washK).
   * The mask's feathered band, blooms and droplets reach about 0.38 W behind and 0.22 W ahead of
   * the edge, so at edgeFrom the unit is fully hidden and at edgeTo fully inked.
   */
  edgeFrom: -0.4,
  edgeTo: 1.24,
  /** Paul, WP-16 item 18: width of the mask's soft wet band (fraction of the 2,048 px mask; was 0.05). */
  bandFrac: 0.09,
  /** Paul, WP-17 item 8: the noisy edge: × the edge's ragged amplitude, and pigment specks in the wet band. */
  edgeNoise: 1.9,
  specks: 2600,
  stampStartMs: 680,
  stampStaggerMs: 90,
  dotsStartMs: 960,
  dotsDoneByMs: 2300,
  dotGridStaggerMs: 80,
  dotIntervalMaxMs: 90,
  dotSpanMs: 1150,
  ruleStartMs: 700,
  ruleMs: 450,
  listStartMs: 760,
  rowStaggerMs: 25,
  rowsAnimated: 12,
  /** Wash edge: cubic in-out. */
  ease: 'inOutCubic',
  /** Watercolour edge mask (step 2), used at mask-size 300 % × 100 %. */
  maskW: 2048,
  maskH: 256,
  /** Reduced motion: a fade replaces the wash. */
  reducedFadeMs: 150,
  /** Number change outside a sequence: ink wipe (file 04 "Value change"). */
  wipeMs: 180,
  /** Wet front: at most this many fronts reach the veil (shader uniforms). */
  maxFronts: 4,
  /** Builder: peak alpha of the damp sheen band in #glow (screen blend), × paper.washDampSheen. */
  sheenAlpha: 0.22,
  /** Builder: width of the sheen band on screen (px). */
  sheenBandPx: 26,
  /** Builder: peak alpha of the fresh-ink sheen over a new stamp in #glow, × fresh-ink dryness. */
  stampSheenAlpha: 0.12,
};

/** Hanging and floating paper (favourite tags, toast slips, Details sheet, menus). */
export const hanging = {
  /** Idle tag: gentle sway from its pin, 0.5° at 0.3 Hz. */
  tagSwayDeg: 0.5,
  tagSwayHz: 0.3,
  /** Breeze or impact: tags swing like pendulums. */
  pendulumDamping: 0.9, // per second
  /** Tag added: drops in from above and swings. */
  tagAddMs: 380,
  /** Tag removed: unpins, curls and floats away left, fading. */
  tagRemoveMs: 700,
  /** Toast: slides in from bottom right with a slight curl; out after 10 s (P37). */
  toastSlideMs: 350,
  toastLifeMs: 10000,
  /** Floating Details sheet: bobs 0.2 cm at 0.31 Hz, roll 0.4°, height 4 cm. */
  detailsBob: 0.2,
  detailsBobHz: 0.31,
  detailsRollDeg: 0.4,
  detailsHeight: 4,
};

/**
 * WP-11 surfaces: the title, favourite tags, the paper lift, the unfold engine (Details, How-to,
 * help letter), menus, toasts, tooltips, tour lighting and the file-drop ripple. Spec values
 * keep their spec wording in the comment; rows the spec leaves open are builder values (marked).
 */
export const surfaces = {
  // ── Title (spec "Title") ──
  /** Each flourish draws in 2.4 s, holds 3–5 s, erases 2.4 s, rests 1–3 s, on its own phase. */
  swashDrawMs: 2400,
  swashHoldMinMs: 3000,
  swashHoldMaxMs: 5000,
  swashEraseMs: 2400,
  swashRestMinMs: 1000,
  swashRestMaxMs: 3000,
  /** About every 45 s one flourish drops an ink droplet that spreads. */
  swashDropletEveryMs: 45000,
  /** builder: the droplet spreads over this long, to this radius (cm). */
  swashDropletMs: 1800,
  swashDropletCm: 0.32,
  /** builder: the pen-tip glint in #glow (radius cm, strength). */
  swashGlintCm: 0.45,
  swashGlintStrength: 0.5,
  /** On save load the byline writes itself in, 900 ms. */
  bylineRevealMs: 900,

  // ── Favourite tags (spec "Favourite tags"; file 04 "Hanging and floating paper") ──
  /** Each tag is 4 × 5 cm. */
  tagW: 4,
  tagH: 5,
  /** builder: natural swing frequency of a tag on its pin (Hz) and the swing an impact of 1 gives. */
  tagSwingHz: 1.1,
  tagImpactDeg: 9,
  /** builder: a swing past this many degrees emits `tag:swing` (at most every tagSwingEventMs). */
  tagSwingEventDeg: 2.5,
  tagSwingEventMs: 900,
  /** builder: tags drop in from this far above (cm) and start with this swing (deg). */
  tagDropCm: 3,
  tagDropSwingDeg: 7,
  /** builder: the removed tag floats this far left (cm) while it curls (deg). */
  tagRemoveDriftCm: 9,
  tagRemoveCurlDeg: 38,

  // ── Paper lift on table scroll (spec "Paper lift") ──
  /** z = 0.6 cm + 0.6 cm × (offset / H). */
  slipLiftBase: 0.6,
  slipLiftExtra: 0.6,
  /** Its top 0.8 cm strip bends up to 8°. */
  slipCurlCm: 0.8,
  slipCurlDeg: 8,
  /** Its shadow grows from 2 to 14 px blur. */
  slipShadowMinPx: 2,
  slipShadowMaxPx: 14,
  /** builder: the lift follows the scroll on this spring; "the settle spring" (soft flop) when it lands. */
  slipLiftSpring: spring(500, 44),
  slipSettleSpring: spring(220, 12),
  /** builder: the air the landing slip pushes out (cm/s, radius cm), so nearby tags swing. */
  slipSettleAir: 60,
  slipSettleAirRadius: 14,

  // ── Unfold engine (spec "Details unfold"; How-to and the help letter use it too) ──
  /** Starts as a folded square: final width ÷ 8 by final height ÷ 4. */
  unfoldStartW: 1 / 8,
  unfoldStartH: 1 / 4,
  /** Five folds: width ×2, height ×2, width ×2, height ×2, width ×2. */
  foldAxes: ['x', 'y', 'x', 'y', 'x'],
  /** builder: alternating directions (+x right, +y down, −x left, −y up, +x right). */
  foldDirs: [1, 1, -1, -1, 1],
  /** Folds start at 0, 250, 500, 750 and 1,000 ms; each turns 180° in 260 ms with a 3° overshoot. */
  foldStartsMs: [0, 250, 500, 750, 1000],
  foldMs: 260,
  foldOvershootDeg: 3,
  /** The sheet rises to its 4 cm float by 1,500 ms (height: hanging.detailsHeight). */
  unfoldRiseMs: 1500,
  /** Glowing ink lines along the creases fade over 600 ms, then the content inks in with a 300 ms wash. */
  creaseGlowMs: 600,
  contentWashMs: 300,
  /** Close: the folds reverse in 900 ms. */
  closeMs: 900,
  /** builder: then the square shrinks into the button and an ink puff rises. */
  closeShrinkMs: 220,
  puffMs: 750,
  puffParticles: 7,
  /**
   * Paul, WP-16 item 24: the help letter ("How progress is read, catalog notes, and save
   * locations") folds open piece by piece: one width crease, then a strip at a time down the
   * sheet, each strip about `pieceStripPx` tall (between `piecesMin` and `piecesMax` strips).
   * A piece starts `pieceStepMs` after the one before and turns 180° in `pieceMs`. The text is
   * printed on every piece; it faces the reader once the piece passes 90° (the last half of its
   * turn). The real sheet takes over when the last piece lands: no crease glow, no ink wash.
   */
  pieceStripPx: 58,
  piecesMin: 6,
  piecesMax: 12,
  pieceStepMs: 95,
  pieceMs: 230,
  pieceCloseMs: 650,
  pieceCloseFoldMs: 150,
  /**
   * Paul, WP-16 item 25: Details opens in ONE step, like a letter: the sheet comes out of the
   * Details button folded in half (scaling up from the button's size while it travels and
   * rises over `letterEmergeMs`), then its top half opens on the middle crease in `letterFoldMs`.
   * Close: the half folds down, then the letter goes back into the button.
   */
  letterEmergeMs: 340,
  /** Paul, WP-18 item 14: Details appears from nothing mid-screen: fade-in time and the packet's first scale. */
  appearFadeMs: 420,
  appearScale: 0.72,
  letterFoldStartMs: 260,
  letterFoldMs: 380,
  letterCloseFoldMs: 260,
  letterCloseMs: 520,
  /**
   * Paul, WP-16 item 25: the Details button peels off the paper, right edge first (a curl that
   * runs right to left), and floats while the dialog is open; it settles back when it closes.
   */
  peelMs: 420,
  peelSettleMs: 360,
  peelLiftPx: 7,
  peelCurlDeg: 58,
  peelFloatBobPx: 1.6,
  peelFloatHz: 0.45,

  // ── Menus, toasts, tooltips (spec "Menus, toasts, tooltips, messages") ──
  /** A parchment list unfolds in two folds (400 ms). */
  menuUnfoldMs: 400,
  /** builder: the quill tick draws in this long, then the list folds away. */
  menuTickMs: 200,
  menuCloseMs: 220,
  /** Menu flutter (DECISIONS 32, WP-11): breeze and impacts tip the open list on this spring. */
  menuFlutterSpring: spring(160, 9),
  menuFlutterDegPerSpeed: 0.03,
  menuFlutterMaxDeg: 2.5,
  /** builder: toast slip curl (deg) and its flutter spring. */
  toastCurlDeg: 4,
  toastFlutterSpring: spring(140, 8),
  toastFlutterDegPerSpeed: 0.04,
  toastFlutterMaxDeg: 3,
  /** Tooltips: after a 500 ms hover. */
  tooltipDelayMs: 500,
  /** builder: brass record-mode lever throw time. */
  toggleMs: 260,
  /** DECISIONS 32 (WP-11): every other printed value change is a 180 ms wipe (printed.valueWipeMs). */

  // ── Tour lighting (spec "Tour lighting") ──
  /** Key light ×0.35 in the scene and the veil over 300 ms; back over 400 ms. */
  tourDimTo: 0.35,
  tourDimMs: 300,
  tourRestoreMs: 400,
  /** The pool glides between steps on a 90 / 16 spring. */
  tourMoveSpring: spring(90, 16),
  /** builder: the pool (cm radius, scene spotlight intensity, veil intensity, glow strength). */
  tourPoolCm: 9,
  tourSpotIntensity: 2200,
  tourVeilSpotIntensity: 1.1,
  tourGlowStrength: 0.22,
  tourSpotHeight: 40,
};

/** Camera. */
export const camera = {
  /** Pointer drift: offset up to 1.6 × 1.0 cm; zoom up to 1.025 in the middle third; spring 30 / 10. */
  driftX: 1.6,
  driftY: 1.0,
  driftZoomMax: 1.025,
  driftZoomZone: 1 / 3,
  driftSpring: spring(30, 10),
  /** Impact: shake added on top (values in `stamp.shakeAmount` / `stamp.shakeMs`). */
  /**
   * WP-16A (Paul item 4): scroll-wheel and trackpad-pinch zoom, anchored at the pointer. Limits keep
   * the page readable: out to 0.7 (the whole desk with room around it), in to 2.5 (a few rows of
   * the table fill the window). Wheel: one notch (100 px) = × 0.87 / 1.15; pinch is finer.
   */
  zoomMin: 0.8,
  zoomMax: 2.5,
  zoomPerWheelPx: 0.0014,
  zoomPerPinchPx: 0.012,
  /** Near-critical (ζ ≈ 1): smooth, no bounce. */
  zoomSpring: spring(90, 19),
  /**
   * WP-16A (Paul item 5): spark out = zoom in about 30 % onto the whole text page (the inset sheet,
   * footer to coins) plus the board's right edge, so the spark can still reach the board. It eases
   * back out while the spark is at the window's left edge (heading for the board).
   */
  sparkZoom: 1.3,
  /** Aim (cm on the paper) at full spark zoom: midway between x −26 (board's right edge) and the sheet's right edge, the inset's centre in y. */
  sparkAim: [11, -5.1],
  sparkSpring: spring(40, 13),
  /** Pointer x (−1…1) under which the spark zoom lets go, and over which it comes back. */
  sparkReleaseNx: -0.8,
  sparkReturnNx: -0.6,
  /**
   * Paul, WP-17 item 2: the WP-16A wheel/pinch zoom and spark-out zoom are gone. The camera frames
   * the main section (layout `mainFrame`) and shows the whole desk while the pointer is over the
   * woodblock or the header; `sparkSpring` eases between the two. A click outside the main section
   * toggles a quick zoom of × `clickZoom` (30 %) about the click.
   */
  clickZoom: 1.3,
};

/**
 * WP-06 breeze writers (DECISIONS point 20): how strongly moving things stir the air.
 * Until WP-09 brings the gauntlet and spark, the pointer itself stands in for them.
 */
export const breeze = {
  /** Air speed written = object speed × this, cm/s. */
  pointerGain: 1.0,
  barGain: 1.4,
  /** Radius (cm) each writer stirs. */
  pointerRadius: 6,
  barRadius: 5,
  /** Paper lift (DECISIONS point 20) shows as a `paper:lift` once it passes this, `paper:settle` once back under the lower value. */
  paperLiftEventAt: 0.05,
  paperSettleEventAt: 0.01,
  /** Edge band (cm) of the sheet that can lift; inside it the lift fades in. */
  paperEdgeBand: 4,
};

const motion = { world, breeze, paper, printed, bar, coin, gauntlet, gauntletRig, spark, stamp, wash, hanging, surfaces, camera };
export default motion;

/**
 * Paul, WP-18 item 12: the table's burn-away and burn-in when the row-height slider is let go.
 * Times (ms), the char band ahead of the edge and the ember band behind it (in burn-map units 0…1),
 * the edge's sharpness, the colours, and the delay before keyboard steps commit.
 */
export const rowBurn = { awayMs: 420, holdMs: 60, inMs: 540, charBand: 0.1, emberBand: 0.035, edgeSlope: 60, glowPx: 2.2, emberColor: '#ff8a2a', charColor: '#160c06', keyCommitMs: 350 };
