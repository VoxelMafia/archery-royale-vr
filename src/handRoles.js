import { CONFIG } from './config.js';

/**
 * Decides which hand grips the bow and which draws the string — the
 * ArenaWars rifle-handle swap, adapted to a bow.
 *
 * Why this is a *gesture*, not a per-frame distance compare:
 * once you are shooting, the hand nearest your head is always the string
 * hand (it is at your cheek) while the bow arm is extended. So a naive
 * "closest hand to head owns the bow" test would flip the bow into your
 * draw hand on every shot. Instead, bringing a hand up to your head while
 * holding GRIP is read as "this hand takes the bow" — the same deliberate
 * handle-swap motion as the rifle. Roles then stay put until you do it again.
 *
 * Modes (CONFIG.hands.mode):
 *   'claim'      - hand near head + grip held for `dwell` seconds claims the bow.
 *   'continuous' - literal reading: whichever hand is nearer the head owns the
 *                  bow, every frame. Kept for comparison; it fights the draw.
 */
export class HandRoleArbiter {
  constructor() {
    this.bow = 'left';
    this.draw = 'right';
    this.candidate = null;
    this.timer = 0;
    this.justSwitched = false;
    this.headDist = { left: Infinity, right: Infinity };
    this.progress = 0; // 0..1 claim progress, for the HUD
  }

  /**
   * @param {{left:?{pos,squeeze}, right:?{pos,squeeze}}} hands
   * @param {boolean} locked true while the string is nocked
   */
  update(dt, headPos, hands, locked = false) {
    this.justSwitched = false;
    const L = hands.left, R = hands.right;
    if (!headPos || !L || !R) { this.progress = 0; return false; }

    const dl = L.pos.distanceTo(headPos);
    const dr = R.pos.distanceTo(headPos);
    this.headDist.left = dl;
    this.headDist.right = dr;

    const cfg = CONFIG.hands;
    const nearer = dl < dr ? 'left' : 'right';
    const lead = Math.abs(dl - dr);
    let wanted = null;

    if (cfg.mode === 'continuous') {
      if (lead >= cfg.margin) {
        wanted = cfg.bowHand === 'nearHead' ? nearer : (nearer === 'left' ? 'right' : 'left');
      }
    } else {
      // Claim gesture: hand pulled in to the head/shoulder with grip held.
      const claims = (h, d) => h && d <= cfg.claimRadius && h.squeeze > 0.6;
      const cl = claims(L, dl), cr = claims(R, dr);
      if (cl !== cr) wanted = cl ? 'left' : 'right';
      else if (cl && cr) wanted = nearer; // both claiming: nearer one wins
    }

    const frozen = locked && cfg.lockWhileDrawn;
    if (frozen || !wanted || wanted === this.bow) {
      this.candidate = null;
      this.timer = 0;
      this.progress = 0;
      return false;
    }

    if (this.candidate !== wanted) { this.candidate = wanted; this.timer = 0; }
    this.timer += dt;
    this.progress = Math.min(1, this.timer / cfg.dwell);
    if (this.timer < cfg.dwell) return false;

    this.bow = wanted;
    this.draw = wanted === 'left' ? 'right' : 'left';
    this.candidate = null;
    this.timer = 0;
    this.progress = 0;
    this.justSwitched = true;
    return true;
  }
}
