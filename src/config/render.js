// @ts-check
/**
 * Rendering tunables: every value from spec file 05 (rendering and materials), in the order
 * of the file. Units as in motion.js: cm, ms, degrees (`Deg`), colours as linear RGB triples
 * where the spec gives them that way, hex strings where it gives hex.
 */

/** Layer stack (bottom to top) inside #desk. `blend` is the CSS mix-blend-mode / canvas composite. */
export const layers = [
  { n: 1, id: 'scene', kind: 'webgl', blend: 'normal', pointer: false },
  { n: 2, id: 'print', kind: 'css3d', blend: 'normal', pointer: true },
  { n: 3, id: 'veil', kind: 'webgl', blend: 'multiply', pointer: false, resolution: 0.5 },
  { n: 4, id: 'glow', kind: '2d', blend: 'screen', pointer: false },
  { n: 5, id: 'float', kind: 'html', blend: 'normal', pointer: true },
  { n: 6, id: 'fx', kind: '2d', blend: 'normal+lighter', pointer: false },
  { n: 7, id: 'grain', kind: 'css', blend: 'overlay', pointer: false },
];

/** Layer 2 is authored at about twice its on-screen size, then scaled down in 3D. */
export const print = {
  pxPerCm: 29,
  /** Zoom headroom the sharp text must survive (camera drift zoom up to 2.5%). */
  zoomHeadroom: 0.025,
};

/** Camera and lights. */
export const camera = {
  fovDeg: 28,
  /** About 62° (spec); 64 lets the sheet fill the frame like the reference (WP-08+09, DECISIONS). */
  pitchDeg: 64,
};

export const lights = {
  /** Key: warm directional from the upper left, soft shadows. */
  keyKelvin: 3200,
  keyFrom: 'upper-left',
  keyShadows: 'soft',
  /** Fill: hemisphere, warm sky and dark ground, low. Intensities are left to the WP-05 look pass. */
  fillKind: 'hemisphere',
  /** Rim: small cool directional from the right to catch steel edges. */
  rimFrom: 'right',
  /** Spark: point light, no shadow (spark values in motion.js `spark`). */
  sparkShadow: false,
};

export const environment = {
  /** Custom warm studio captured to a cube render target, filtered with PMREMGenerator. */
  studio: ['warm softbox (large)', 'cool fill (small)', 'rim strip'],
  fallback: 'RoomEnvironment',
};

export const output = {
  toneMapping: 'AgXToneMapping',
  exposure: 1.0,
  colorSpace: 'srgb',
};

/** Materials. Colours are linear RGB. */
export const materials = {
  brushedSteel: {
    metalness: 1,
    color: [0.78, 0.80, 0.83],
    /** Roughness map: fine streaks along the bar, 1D noise stretched 400:1, range 0.14–0.32. */
    roughnessMin: 0.14,
    roughnessMax: 0.32,
    streakStretch: 400,
    /** DECISIONS point 22: texture holds 16:1, the rest of the stretch is UV repeat 25× along u. */
    textureAspect: 16,
    uvRepeatU: 25,
    anisotropy: 0.85,
    anisotropyAlongLength: true,
    normalStrength: 0.15,
    bevelRadius: 0.06,
    bevelSegments: 6,
    /** Worn edges (builder values): this much brighter and smoother right on the bevels. */
    edgeBrighten: 0.06,
    edgeSmoother: 0.4,
  },
  engraving: {
    font: 'IM Fell English',
    atlasPx: 2048,
    depth: 0.03,
    cavityRoughness: 0.5,
    /** Darker cavity colour: the base colour is multiplied by this inside the letters. */
    cavityShade: 0.45,
    /** Scales the bevel slope derived from depth ÷ texel size (1 = physically derived). */
    slopeScale: 0.35,
  },
  knurling: {
    roughness: 0.30,
    anisotropy: 0,
    repeat: [2, 1],
  },
  gauntletSteel: {
    metalness: 1,
    color: [0.84, 0.85, 0.87],
    roughness: 0.12,
    scratchRoughnessMin: 0.09,
    scratchRoughnessMax: 0.18,
    /** WP-16A (Paul): 0.3 → 0.22, specular toned down slightly. */
    clearcoat: 0.22,
    clearcoatRoughness: 0.05,
    dentNormalStrength: 0.05,
    repeat: [2, 2],
  },
  gauntletReflections: {
    cubePx: 256,
    everyNthFrame: 3,
    /** WP-08: skip a refresh while the hand has moved less than this (cm) since the last one… */
    stillCm: 0.3,
    /** …unless this many frames have passed. */
    stillEveryFrames: 60,
    /** WP-14: meshes the cube camera draws (by name); everything else is too small to read in the steel. */
    reflectNames: [/^plank/, /^sheet-/, /^woodblock$/, /^plaque$/, /^coin-[a-z]+$/],
    /** Mixed 60/40 with the studio environment. */
    cubeMix: 0.6,
    studioMix: 0.4,
    near: 0.5,
    far: 600,
  },
  leather: {
    color: [0.23, 0.16, 0.12],
    roughness: 0.65,
    sheen: 0.4,
    sheenColor: [0.75, 0.48, 0.28],
    sheenRoughness: 0.5,
    normalStrength: 0.8,
    repeat: [3, 3],
  },
  rivets: {
    roughness: 0.2,
    /** "Slightly darker steel". */
    color: [0.66, 0.67, 0.69],
    /** Dome height ÷ radius. */
    dome: 0.55,
  },
  gold: {
    metalness: 1,
    color: [1.00, 0.71, 0.29],
    roughness: 0.28,
    rimRoughness: 0.12,
    /** The polished rim starts at this share of the coin's radius. */
    rimFrom: 0.86,
    normalStrength: 0.28,
    repeat: [3, 3],
  },
  brass: {
    metalness: 1,
    color: [0.89, 0.72, 0.42],
    roughness: 0.30,
    normalStrength: 0.08,
    repeat: [2, 2],
    /** Molten pour: an orange emissive front moving along the inlay during fills. */
    pour: { color: [1.0, 0.36, 0.06], intensity: 6, frontWidth: 0.05, coolLength: 0.25 },
  },
  oiledWood: {
    roughness: 0.45,
    clearcoat: 0.25,
    clearcoatRoughness: 0.35,
    /** The walnut roughness map's mean; material roughness = 0.45 ÷ this, so the mean lands on 0.45. */
    mapMeanRoughness: 0.5,
    /** Darker than the desk's walnut, as in the reference. */
    shade: 0.62,
    /** The studio's reflection on the oiled top is damped: at full strength its sheen turns the dark walnut grey. */
    envMapIntensity: 0.5,
  },
  paper: {
    roughness: 0.85,
    foldCreases: 2,
    /** Normal strength in layer 3 (the veil). */
    veilNormalStrength: 1.0,
  },
  desk: {
    roughness: 0.72,
    /** Paul, WP-17 item 12 ("table looks good, it can be darker"): 2.6 → 1.95. */
    shade: 1.95,
    normalStrength: 1.0,
    /** WP-16A (Paul item 6): knots, deep grain, worn edges (materials/desk.js). */
    gnarl: {
      /** One possible knot per this much plank length; this share of the cells hold one. */
      knotCellCm: 22,
      knotShare: 0.6,
      /** Knot radius across the grain (cm), before its random size (× 0.6–2). */
      knotCm: 1.6,
      /** The board-scale figure: latewood bands per cm (towards the plank's edges), how dark they are. */
      figurePerCm: 0.5,
      figureDark: 0.42,
      /** Height relief (latewood, checks, knot rims) as a bump on the normal. */
      relief: 1.1,
      seed: 0.37,
      /** Albedo contrast exponent (1 = as the walnut is): the latewood sinks. */
      grainContrast: 1.45,
      /** Normal map strength × this: deep grain. */
      normalBoost: 1.8,
      /** Worn band at each plank's long edges (cm) and how much lighter it is. */
      wearCm: 1.4,
      wearLift: 1.8,
      /** Share of 37 cm plank segments with a drying check. */
      checkShare: 0.35,
    },
  },
};

/** Item icons printed on the paper (WP-02 step 3). */
export const icons = {
  /** Size beside each table row. */
  rowPx: 28,
  /** Size in the Details heading. */
  detailsPx: 64,
  /** 15% sepia, so the bright game icons take on the paper's warmth. */
  sepia: 0.15,
  /** Used wherever the page is paper (desk mode, flat parchment). On the original dark page it would black the icons out. */
  blend: 'multiply',
  /** "Slight ink-grain mask": the icon's opacity varies between these two values. */
  grainAlphaMin: 0.85,
  grainAlphaMax: 1.0,
  grainTilePx: 64,
};

/** Ink on HTML (layer 2). */
export const ink = {
  color: '#2b1d14',
  opacity: 0.92,
  /** DECISIONS point 1: multiply inside CSS3D cannot blend with the canvas; optional, not required. */
  blend: 'multiply',
  blendRequired: false,
  grainTilePx: 512,
  grainAlphaMin: 0.85,
  grainAlphaMax: 1.0,
  /** Headings and stamps only. */
  roughTurbulence: 0.9,
  roughDisplacement: 0.6,
  poolEdgePx: 0.4,
  stamps: {
    completed: '#4f6b34',
    missing: '#8e2a1e',
    unverified: '#3c5a7a',
    undiscovered: '#6b655c',
  },
  /** Errors use the Missing red. */
  error: '#8e2a1e',
};

/** Fonts (bundled, offline). */
export const fonts = {
  title: { family: 'Grenze Gotisch', weight: 700 },
  smallCaps: { family: 'IM Fell English SC', weight: 400 },
  body: { family: 'IM Fell English', weight: 400 },
};

/** Post-processing. */
export const post = {
  /** Selective bloom: the gauntlet only. The spark gets no bloom. */
  bloomThreshold: 0.85,
  bloomStrength: 0.6,
  bloomRadius: 0.4,
  /** Film grain: 256 px monochrome tile, re-offset at 24 fps, overlay at 10%. */
  grainIntensity: 0.10,
  grainTilePx: 256,
  grainFps: 24,
  /** Vignette: 18% darkening at the corners, same overlay. */
  vignette: 0.18,
};

/** Quality tiers. The tier order (high → low) is also the drop order. */
export const quality = {
  tiers: {
    high: {
      // WP-14: bloom input at half size (was 'full', file 05): saves ~18 MB so High fits the 300 MB
      // GPU budget at 1x (305 MB); the bloom blur starts at half size anyway (DECISIONS)
      // WP-16A (Paul: GPU load): shadow map 2048 → 1024 (the 4-texel PCF softening hides it), cube every 12th frame (was 6)
      pixelRatioMax: 2, shadowMap: 1024, shadowSoft: true, bloom: 'half',
      cubePx: 256, cubeEveryNthFrame: 12, /* WP-08: was 3 (file 05); 6 keeps the moving gauntlet under 3 ms (DECISIONS); WP-16A: 12 */ veilResolution: 1 / 2, bristle: 'vertex+normal', antialias: 'MSAA', msaaSamples: 4,
    },
    medium: {
      pixelRatioMax: 1.5, shadowMap: 1024, shadowSoft: true, bloom: 'half',
      cubePx: 128, cubeEveryNthFrame: 12, veilResolution: 1 / 4, bristle: 'vertex+normal', antialias: 'MSAA', msaaSamples: 4,
    },
    low: {
      pixelRatioMax: 1, shadowMap: 512, shadowSoft: false, bloom: 'off',
      cubePx: 0, cubeEveryNthFrame: 0, veilResolution: 1 / 4, bristle: 'normal', antialias: 'FXAA', msaaSamples: 0,
    },
  },
  /** Start tier from a 60-frame benchmark at load. */
  benchmarkFrames: 60,
  /** Drop one tier if the average frame time is over 20 ms for 2 s, with half the frames late (WP-18P). */
  dropFrameMs: 20,
  dropAfterMs: 2000,
  dropLateShare: 0.5,
  /**
   * WP-18P (Paul: "perfect framerate on any computer"): the adaptive governor (governor.js).
   * Trims are small steps inside a tier, least visible first, each one adding to the last; they
   * act on strained frames (JS or GPU time near the budget, or a late frame) before frames drop.
   * The governor climbs back a trim, then a tier, on measured headroom (a tier only on GPU timer
   * evidence). On this Mac at High none of it ever triggers (report: WP-18P).
   */
  budgetMs: 1000 / 60,
  trims: [
    // 1: the gauntlet's reflection cube refreshes half as often (CPU draw calls and GPU)
    { cubeEveryNthScale: 2, pixelRatioScale: 1 },
    // 2: the 3D layers' pixel ratio ×0.85 (never below 1): the GPU's fill cost ~×0.72
    { cubeEveryNthScale: 2, pixelRatioScale: 0.85 },
    // 3: ×0.75 and the cube at a quarter of its rate
    { cubeEveryNthScale: 4, pixelRatioScale: 0.75 },
  ],
  trimWindowMs: 750,
  strainShare: 0.5,
  cpuStrain: 0.6,
  // GPU time is not a strain signal: ANGLE/Metal timer queries on this Mac read p90 22 ms while
  // every frame still lands on 16.7 ms (they include pipelined waiting). It only proves headroom.
  gpuStrain: null,
  lateShare: 1.12,
  climbWindowMs: 5000,
  climbCpu: 0.45,
  climbGpu: 0.5,
  climbBackoffMs: 15000,
  climbBack: true,
};

/**
 * WP-03 tour, flat mode: the page dims around a soft cut-out on the target, and a paper slip
 * sits beside it (right, left, then above; below and "inside" are last resorts so it is never
 * off-screen). Pixels and ms. Desk mode lights the tour with the lamp instead (WP-11).
 */
export const tour = {
  /** "Dims the page to 35%": what is left of the page's brightness outside the cut-out. */
  dimTo: 0.35,
  /** Space between the target's edge and the cut-out's edge. */
  cutoutPadPx: 8,
  cutoutRadiusPx: 12,
  /** Blur on the cut-out's edge, so it is soft. */
  cutoutSoftPx: 10,
  /** Gap between the cut-out and the slip (the arrow sits in it). */
  slipGapPx: 18,
  slipWidthPx: 320,
  /** The slip never comes closer than this to the window edge. */
  viewportMarginPx: 12,
  /** The arrow stays this far from the slip's corners. */
  arrowInsetPx: 16,
  /** A target taller than this share of the free window height is cut off at the bottom. */
  maxTargetShare: 0.55,
  /** Cut-out glide between steps (skipped with reduced motion). */
  moveMs: 300,
};

/**
 * WP-04 stage: numbers the spec leaves to the builder. Placeholder looks only; WP-05 owns the
 * final materials and may retune every value here.
 */
export const stage = {
  /** Camera framing: the main sheet takes this share of the limiting screen dimension (the reference leaves a thin desk border). */
  sheetFill: 0.99,
  near: 5,
  far: 2000,
  /** Light rig, layer 1 (scene). Directions are "from" vectors (towards the light), in cm. */
  keyFromVec: [-55, 45, 95],
  keyIntensity: 2.6,
  keyShadowRadius: 4,
  keyShadowBias: -0.0004,
  fillSky: '#ffe2bf',
  fillGround: '#2a1d14',
  fillIntensity: 0.45,
  rimFromVec: [80, -10, 30],
  rimColor: '#cfe0ff',
  rimIntensity: 0.8,
  /** Spark point light: parked dark until WP-09 drives it. */
  sparkIntensity: 0,
  /** WP-05 acceptance: GPU memory under this on High. The pixel ratio is lowered to fit (never below 1). */
  gpuBudgetMB: 300,
  /** Raw studio cube (WP-05) for the gauntlet reflection mix. */
  envCubePx: 128,
  /** Studio environment for reflections (file 05): emissive strengths of its three panels. */
  /** Softbox overhead and up the page, where flat coins and the sheet's far half reflect it. */
  /** WP-05: centred and wider than WP-04's, so the coins at the top right mirror it too. */
  envSoftbox: { color: '#ffcf98', intensity: 0.95, size: [280, 170], pos: [10, 100, 170] },
  /** WP-05: warm light bounced off the sheet, below everything (the paper is right there). */
  envBounce: { color: '#e9cfa6', intensity: 0.22, size: [400, 400], pos: [0, 0, -80] },
  envCoolFill: { color: '#b8ccff', intensity: 0.6 },
  envRimStrip: { color: '#ffffff', intensity: 1.2 },
  /** The studio's walls: warm and dim, so gold reads as gold even where no panel reflects. */
  envWalls: '#33261c',
  /** The softbox's edge brightness relative to its centre (a soft falloff gives metals contrast). */
  envSoftboxEdge: 0.12,
  envIntensity: 0.9,
  /**
   * Layer 3 (veil) lighting: the paper's only light. Values are the multiply factor on the
   * paper, so they must stay ≤ 1. Lambert in three.js divides by π, hence the π-scaled numbers.
   */
  veilKeyIntensity: 1.3,
  /** Share of the key's 3,200 K warmth used on the paper (full warmth would turn it orange under multiply). */
  veilKeyWarmth: 0.35,
  veilFillIntensity: 2.26,
  veilFillSky: '#fffaf2',
  veilFillGround: '#d9c6ad',
  /** Paper albedo (layer 1 draws it unlit). AgX is applied by the output pass, so these are pre-AgX. */
  paperMain: '#fbe6c2',
  /** Paul, WP-17 item 4 (no seam between header and main): the inset is the main sheet's own tone (was '#fdeed2'). */
  paperInset: '#fbe6c2',
  /** AgX maps 1.0 to a dull grey-cream; the albedo is pushed above 1 so the paper reads like the reference. */
  paperBoost: 1.42,
  /** Placeholder colours. */
  deskPlank: '#3a2416',
  deskPlankVariation: 0.18,
  deskRoughness: 0.72,
  woodblock: '#3b2213',
  clearColor: '#120c08',
  /** The capsule stand-in reflects the softbox along its whole length; damp it so it doesn't glow like a tube (WP-08 replaces it). */
  standInEnvIntensity: 0.5,
  /** Hover visual (raycast only): warm emissive lift on the hovered placeholder. */
  hoverEmissive: '#3a2410',
  /**
   * Benchmark at load (file 05): 60 frames at the High tier, measured as frame-to-frame time.
   * A 60 Hz display reports ~16.7 ms even when the GPU is idle, so the cut-offs sit above that.
   */
  benchmarkWarmupFrames: 10,
  benchmarkHighMs: 18,
  benchmarkMediumMs: 26,
  /**
   * WP-07: software renderers (SwiftShader, llvmpipe…; matched on the WebGL renderer name) start
   * at Low without the High benchmark (it took ~35 s there), and redraw the two WebGL layers at
   * most every `softwareRedrawMs` unless the camera moved, so the page's own animations keep
   * their frame rate. A real GPU is never affected.
   */
  softwareRenderer: /swiftshader|llvmpipe|softpipe|software|basic render driver/i,
  softwareRedrawMs: 2000,
  /**
   * WP-16A (Paul: "it works the graphics card hard"): render on demand. The two WebGL layers draw
   * every frame while anything moves (input, the camera, a shadow caster, the ink); after
   * `idleAfterMs` with none of that they redraw only every `idleRedrawMs` (anything animated by a
   * uniform alone still advances, at that rate). Shadow maps redraw only when a caster moved.
   */
  /** Paul, WP-17 item 7: the load-in cross-fade: the scene fades in under the boot paper, then the paper fades out (each this long). */
  bootFadeMs: 450,
  idleAfterMs: 1500,
  idleRedrawMs: 200,
  /** Bus events that never change the 3D layers (the title's quill loops on its own, toasts, hints): they don't wake it. */
  idleIgnoreEvents: /^(title:stroke|toast:|hint:|tooltip:)/,
  /** WP-07: and generate the big procedural textures at this scale (the GPU work there runs on the CPU). */
  softwareTextureScale: 0.5,
  /** WP-07: on a software renderer the film grain stays still (moving it re-composites every layer: 58 → 10 frames/s on SwiftShader). */
  softwareStillGrain: true,
  /** Film-grain overlay: vignette is a radial gradient, clear inside this share of the half-diagonal. */
  vignetteInner: 0.55,
};

/**
 * WP-05 procedural textures (src/scene/textures/). Sizes are from the WP-05 table; the rest are
 * the builder's starting values for the look, tuned against reference/IMG_6272.png.
 * Colours are linear RGB.
 */
export const textures = {
  /** Generation runs in steps; after this much main-thread time in one frame it waits for the next. */
  frameBudgetMs: 10,
  /** Logged budget on the High tier (WP-05 step 7). */
  budgetMs: 600,
  maxAnisotropy: 8,
  /** ?materials review page: how fast the sample shapes turn. */
  reviewTurnDegPerSec: 9,
  /** Startup fade: the desk warms up from candle-dark over this long. */
  fadeMs: 800,
  /** The fade never reaches full light before the textures are done: lit share = min(time, floor + rest × progress). */
  fadeProgressFloor: 0.3,
  /** Candle-dark start: exposure and a warm tint on the light. */
  fadeStartExposure: 0.06,
  fadeStartKelvin: 1700,
  paper: {
    size: [2048, 1152],
    /** Paul, WP-17 item 3: the sheet is 84 × 54 cm (was 96 × 54). Paul, WP-18 item 7: 73 × 54 cm. */
    sheetCm: [73, 54],
    /** Fold creases as in the reference: one vertical near x = +10 cm, one horizontal near y = −3 cm. */
    creaseX: 10,
    creaseY: -3,
    creaseWidth: 0.4,
    /** How far in from the sheet edge the deckle can bite, cm. */
    deckleCm: 0.45,
    /** About linear '#fbe6c2' (the WP-04 sheet colour), a touch less red; layer 1 multiplies by stage.paperBoost. */
    cream: [0.955, 0.80, 0.55],
    stain: [0.78, 0.58, 0.36],
    burnt: [0.28, 0.15, 0.07],
    normalStrength: 5.0,
    roughness: 0.85,
    /** Small copy for the HTML floating sheets (CSS background). */
    dataUrlSize: [512, 288],
  },
  walnut: {
    size: [1024, 2048],
    /** One texture covers this much wood (cm) and tiles. */
    cm: [24, 48],
    /** Growth rings per cm across the board (24 × this must be a whole number). */
    ringsPerCm: 2.25,
    early: [0.05, 0.022, 0.0095],
    late: [0.02, 0.0085, 0.0038],
    light: [0.1, 0.048, 0.021],
    roughness: 0.45,
    normalStrength: 2.2,
  },
  board: {
    /** Baked width in px; the height follows the board's aspect. WP-16: 768 (was 1024) for the 27 × 65 cm board, about the same pixel count as before. */
    widthPx: 768,
    /** Plain bevelled border (Paul's scope cut: no braid). */
    borderCm: 1.8, // WP-16: matches layout.board.border
    chamferCm: 0.45,
    roundCm: 0.3,
    fieldDropCm: 0.25,
    slotDepthCm: 0.8,
    worn: [0.42, 0.26, 0.15],
    woodOffset: [3.1, 7.7],
  },
  brushedSteel: { size: [2048, 128], normalStrength: 1.0 },
  knurl: { size: 256, diamonds: 16, normalStrength: 2.4 },
  hammered: { size: 512, normalStrength: 3.0 },
  leather: { size: 512, normalStrength: 3.0 },
  inkGrain: { size: 512 },
  grainTile: 256,
  engraving: {
    blurPx: 1,
    padPx: 6,
    linePx: 72,
    notePx: 44,
    noteWrapPx: 900,
    coinPx: 64,
    coinArcPx: 230,
    normalStrength: 1.0,
    plaqueGlyphs: '0123456789/%·',
    fontTimeoutMs: 1500,
  },
};

/**
 * WP-06 board look: builder values for the real woodblock, bars and coins (file 05 gives the
 * materials; these are the extra numbers the shapes need).
 */
/**
 * Paul, WP-17 item 16: the ember look. Burned labels on the woodblock glow with it while the
 * gauntlet is near; item 27 (17C) uses the same colours for the Details burn-away's edges.
 *   color / hot   ember orange and its hottest yellow core (linear-ish RGB, × intensity)
 *   radiusCm      how far from the fingertip the glow reaches (gaussian sigma, cm)
 *   flickerHz     how fast the coals flicker
 */
export const ember = { color: [1.0, 0.36, 0.06], hot: [1.0, 0.78, 0.36], intensity: 2.6, radiusCm: 5.5, flickerHz: 2.2, attackMs: 180, releaseMs: 700 };

/**
 * Paul, WP-17 item 20: wood burning (src/scene/woodburn.js). `rect` is the burnable desk area
 * (world cm); char at `charPx` px/cm, heat at `heatPx`; a pen `widthCm` wide with a scorched
 * halo × `haloScale`; each pass adds `lineAlpha` / `haloAlpha` of char; burned wood is
 * × (1 − darken). The ember edge cools with a `coolMs` time constant. At most `maxPoints` stored.
 */
export const woodBurn = {
  rect: { x0: -90, x1: 90, y0: -60, y1: 60 },
  charPx: 6, heatPx: 3,
  widthCm: 0.32, haloScale: 2.6, lineAlpha: 0.55, haloAlpha: 0.08, heatScale: 1.8,
  darken: 0.86, emberGain: 0.9, coolMs: 650, stepCm: 0.12, maxPoints: 12000,
};

export const board = {
  /** Carving in the walnut is deeper and darker than steel engraving. */
  engraveDepth: 0.06,
  /** WP-08+09: darker (was 0.35) so the board heading and foot note read at 1440 × 900 (DECISIONS). */
  engraveCavityShade: 0.14,
  /** Bar names and coin legends: darker cavities than the WP-05 default (0.45), so they read at desk distance like the reference. */
  metalEngraveShade: 0.05,
  metalEngraveDepth: 0.05,
  /** WP-10 bar-name legibility (DECISIONS): the bar names' strokes are thickened by this many atlas
   *  texels, lose this share of the key light's highlight in the cavity, and get a faint light lip
   *  (rim) this many texels below each stroke. 0 / 0 / 0 is the WP-09 look. */
  barNameBoldTexels: 3,
  /** Paul, WP-17 item 15: the tab counts (achieved / total) are cut thicker and filled dark, like the bar names. */
  tabEngraveShade: 0.03,
  tabEngraveDepth: 0.06,
  tabBoldTexels: 4,
  tabSpecCut: 0.9,
  tabRim: 0.35,
  tabRimTexels: 4,
  barNameSpecCut: 0.9,
  barNameRim: 0.35,
  barNameRimTexels: 5,
  /** Bar and knob steel colour × these. The key light's highlight on the flat bar tops tone-maps to
   *  paper white at the WP-05 colour; the reference shows mid-grey steel (measured ~150/255 at 0.22). */
  barSteelTint: 0.22,
  knobSteelTint: 0.45,
  /** Paul, WP-16 item 11: the turned knob's knurl tiling (around, along the profile) and its turned-steel roughness. */
  knobKnurlRepeat: [5, 1.4],
  knobRoughness: 0.26,
  /** The routed grooves' walls and floor (raw walnut × this). "Darker floor". */
  grooveShade: 0.42,
  /** Depth of the pit under the counter window (WP-16: deeper, for the bigger wheels). */
  windowPitDepth: 2.0,
  /**
   * Paul, WP-16 item 12: the board's labels are burned into the wood, not lightly carved.
   * Texture px per cm; colours of the charred letters, the scorched rim around them and the
   * faint brown halo; their widths (cm); the recess's normal strength.
   */
  burn: {
    pxPerCm: 60,
    charColor: '#0b0604', scorchColor: '#2b1307', haloColor: '#4a2810',
    charAlpha: 0.98, scorchAlpha: 0.95, haloAlpha: 0.72,
    scorchCm: 0.12, haloCm: 0.42, recessCm: 0.045,
    normalStrength: 8, ashSpeckle: 0.18, roughness: 0.92,
    /** strokes thickened by this (cm) */
    boldCm: 0.05,
  },
  /** Molten brass: width of the hot front and how far behind it the metal glows, cm. */
  pourFrontCm: 0.5,
  /** Paul, WP-17 item 14: the gilded progress on the bars: tint gain, molten front gain, the cold fill edge's glint. */
  barFillColor: [0.88, 0.5, 0.13],
  barFillGain: 0.8,
  barFillHotGain: 0.55,
  barFillEdgeGlow: 0.18,
  pourHotCm: 2.5,
  /**
   * Paul, WP-18 item 11: the unfilled part of each bar is a row of deep rectangular notches.
   * Pitch and notch width along the bar, the notches' half height (cm from the bar's centre line),
   * the floor's shade, the wall slope (normal map), the lit lip on the far wall, the clear land
   * kept round the engraved name, the gap after the fill front and the plain left end (cm).
   */
  barNotch: { pitchCm: 0.38, widthCm: 0.24, halfHCm: 0.5, floorShade: 0.16, wallCm: 0.045, wallSlope: 2.6, lipGain: 0.5, clearCm: 0.16, gapCm: 0.08, startCm: 0.75 },
  /** Inlay channel cut into the lip (drawn into the carving). */
  channelDepthShade: 1,
  /** Fine dust puffed from the slot end on a latch. */
  dustColor: '#b49a74',
  dustSizeCm: 0.16,
  /** Knurl glint: warm highlight swept across the knob on hover. */
  glintColor: '#ffd9a8',
  /** Paul, WP-17 item 11: subtler (was 1.6), plus a very slight glow of the whole knob on the same timing (× strength). */
  glintStrength: 0.9,
  glintGlow: 0.07,
  /** Focus glow on the 3D object when its proxy has keyboard focus (file 01 Accessibility). */
  focusGlow: '#6a3a10',
  /** Rune glow colour (the spark wakes it, WP-09; "save loaded" flashes it). */
  runeColor: '#ffb347',
  /** Gold motes rising from the Load coin on "save loaded". */
  moteColor: 'rgba(255, 205, 120, 0.9)',
  /** Coin face recessed below the raised rim, cm. */
  coinFieldDrop: 0.05,
  coinSegments: 96,
  /** Disabled Export coin: its gold is dimmed to this. */
  disabledShade: 0.55,
};

/** WP-08 gauntlet (builder values). */
export const gauntlet = {
  /** Reflection strength on the plates (the WP-04 stand-in needed 0.5; WP-04 open point 2). WP-16A (Paul): 1.0 → 0.85, specular toned down slightly. */
  envMapIntensity: 0.85,
  /** The ember socket under the index tip cap: orange emissive, shown only when the cap is open. */
  socketColor: '#ff7a1a',
  socketGlow: 2.6,
  /** WP-09 spark light: a point light this high over the paper under the spark (file 04 colour/range). */
  sparkLightHeight: 2.5,
  sparkLightIntensity: 60,
};

/** WP-13 flat parchment (builder values; DECISIONS "WP-13"). */
export const flat = {
  /** Parchment tile, 2D canvas (paper.js). Base = the desk paper tone #f3dfbd, a shade darker. */
  paperTilePx: 384,
  paperBase: [240, 222, 188],
  /** Darkening amounts (fraction of the base) for each noise band. */
  stain: 0.16,
  mottle: 0.07,
  fibre: 0.05,
  grain: 0.05,
  fibresPer1000Px: 2.2,
  /** Long press on a row opens Details (touch). */
  longPressMs: 500,
  longPressSlopPx: 10,
  /** Paper px per "cm" for the unfold engine's float height in flat mode. */
  pxPerCm: 7,
};

const render = { flat, gauntlet, board, layers, print, icons, camera, lights, environment, output, materials, ink, fonts, post, quality, tour, stage, textures };
export default render;
