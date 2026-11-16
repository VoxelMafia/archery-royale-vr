// Central tuning sheet for the bow prototype. Everything gameplay-feel lives here.
export const CONFIG = {
  // --- Hand switching (ArenaWars rifle-handle style) -----------------------
  hands: {
    // 'claim'      -> bring a hand up to your head WITH GRIP HELD and that
    //                 hand takes the bow (rifle handle-swap gesture). Default.
    // 'continuous' -> literal distance test every frame (see handRoles.js).
    mode: 'claim',
    // How close to the head a hand must come to claim the bow (m).
    claimRadius: 0.34,
    // 'continuous' mode only: which hand owns the bow, and the dead-band.
    bowHand: 'nearHead',
    margin: 0.07,
    // How long (seconds) that lead must hold before the roles actually commit.
    dwell: 0.20,
    // Roles are frozen while the string is nocked/drawn so a shot never flips.
    lockWhileDrawn: true,
  },

  // --- Bow ------------------------------------------------------------------
  bow: {
    modelUrl: 'assets/black_bow.glb',
    length: 1.72,          // tip to tip (m); the model is scaled to fit this
    brace: 0.17,           // braced string plane in front of the grip (m)
    nockY: 0.075,          // nocking point above the grip (m)
    paradoxOffset: 0.022,  // how far the arrowhead sits off the riser (m)
    tint: 0x121216,        // black bow
    roughness: 0.42,
    metalness: 0.22,
  },

  // --- Draw ----------------------------------------------------------------
  draw: {
    idle: 0.08,        // string sits part-drawn with an arrow on it (m)
    grabRadius: 0.17,  // how near the nock your hand must be to take the arrow
    rest: 0.20,        // hand separation at zero draw (m)
    max: 0.62,         // separation at full draw (m)
    minSpeed: 24,      // arrow muzzle speed at ~0 draw (m/s)
    maxSpeed: 82,      // arrow muzzle speed at full draw (m/s)
    minReleaseRatio: 0.12, // below this the arrow just flops out
    // Bow roll/cant follows the grip hand; aim axis follows grip<-draw vector.
    aimSmoothing: 22,  // higher = snappier bow follow (1/s)
  },

  arrow: {
    gravity: -9.81,
    drag: 0.015,       // simple linear-ish air drag coefficient
    length: 0.78,
    life: 14,          // seconds before a spent arrow despawns
    stuckLife: 20,
  },

  player: {
    speed: 2.8,        // thumbstick locomotion (m/s)
    turnMode: 'smooth',      // 'smooth' | 'snap'
    turnSpeed: Math.PI * 0.72, // smooth turn rate at full stick (rad/s)
    turnDeadzone: 0.2,
    snapTurn: Math.PI / 6,   // used when turnMode is 'snap'
    eyeHeight: 1.65,         // used by the desktop fallback only
    gravity: -16,            // snappier than real g: VR jumps feel floaty at 9.81
    airControl: 0.35,        // fraction of ground speed usable mid-air
  },

  // --- Feather jump (Bonelab-style physical flap) --------------------------
  feather: {
    // Swing the feather hand DOWN to launch. Impulse scales with how hard.
    minSwing: 1.5,     // hand speed (m/s) that counts as a flap
    maxSwing: 4.5,     // speed at which you get the full impulse
    minImpulse: 3.4,   // upward velocity at minSwing (m/s)
    maxImpulse: 6.2,   // upward velocity at maxSwing (m/s)
    airScale: 0.82,    // the mid-air catch is a touch softer than the first
    maxFlaps: 2,       // ground flap + one in the air = double jump
    cooldown: 0.22,    // seconds between flaps, stops stick-shake spam
    // Feather-fall: hold the feather up and you sink slowly and land soft.
    glideHold: 0.25,   // hand must be above the head by this much (m)
    glideGravity: 0.22,// gravity multiplier while gliding
    glideMaxFall: 1.6, // terminal speed while gliding (m/s)
    landSmoothing: 14, // how fast the view settles after touchdown (1/s)
  },
};
