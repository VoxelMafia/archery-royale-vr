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

  // --- Draw ----------------------------------------------------------------
  draw: {
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
    snapTurn: Math.PI / 6,
    eyeHeight: 1.65,   // used by the desktop fallback only
  },
};
