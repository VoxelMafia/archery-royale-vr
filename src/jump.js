import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Physical swing jump, Bonelab-style: no item, no button.
 *
 * Throw your free hand DOWN and you launch. The impulse comes from the hand's
 * real world-space velocity, so a lazy wave is a hop and a hard beat is a full
 * launch. Swing again in mid-air to catch yourself — the second flap SETS
 * upward velocity instead of adding to it, so the double jump lands on a
 * predictable height however you were falling.
 *
 * Velocity is averaged over a ~60 ms window rather than read per frame: one
 * noisy tracking sample can't fire a jump, and the impulse is a smooth ramp
 * between minSwing and maxSwing instead of a threshold step.
 *
 * Crucially the hand is tracked RELATIVE TO THE HEAD, not in world space.
 * Measured in world space, falling drags your hand down with your body at
 * several m/s, which reads as a swing and re-launches you the instant you
 * start to drop: an infinite bounce you cannot stop. Relative to the head,
 * only your arm moving in your own body counts.
 */
export class SwingJump {
  constructor() {
    this.swingSpeed = 0;      // downward component of hand velocity (m/s)
    this.cooldown = 0;
    this.floating = false;
    this.lastFlap = 0;

    this._rel = new THREE.Vector3();      // hand, relative to the head
    this._prev = new THREE.Vector3();
    this._vel = new THREE.Vector3();
    this._smoothVel = new THREE.Vector3();
    this._hasPrev = false;
  }

  /**
   * @param {?object} hand the free hand's pose (null while drawing the bow)
   * @param {THREE.Vector3} headPos
   * @param {object} body PlayerBody
   */
  update(dt, hand, headPos, body) {
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (!hand) {
      this._hasPrev = false;
      this.floating = false;
      this.swingSpeed = 0;
      return;
    }

    this._rel.subVectors(hand.pos, headPos);
    if (!this._hasPrev) {
      this._prev.copy(this._rel);
      this._hasPrev = true;
      return;
    }
    if (dt > 1e-4) {
      this._vel.subVectors(this._rel, this._prev).divideScalar(dt);
      this._smoothVel.lerp(this._vel, Math.min(1, dt / 0.06));
    }
    this._prev.copy(this._rel);
    this.swingSpeed = Math.max(0, -this._smoothVel.y);

    const j = CONFIG.jump;

    // Reach for the sky on the way down and you sink slowly: the arm acts as
    // a brake, which also gives you a soft, aimable landing.
    this.floating = hand.pos.y > headPos.y + j.floatHold && body.vel.y < 0;

    if (this.cooldown > 0 || this.swingSpeed < j.minSwing) return;
    // A launch swing finishes LOW. Requiring that keeps ordinary gesturing at
    // chest height from throwing you into the air.
    if (hand.pos.y > headPos.y - j.minBelow) return;
    if (body.flapsUsed >= j.maxFlaps) return;

    const t = THREE.MathUtils.clamp(
      (this.swingSpeed - j.minSwing) / (j.maxSwing - j.minSwing), 0, 1
    );
    let impulse = THREE.MathUtils.lerp(j.minImpulse, j.maxImpulse, t);
    if (!body.grounded) impulse *= j.airScale;

    body.flap(impulse);
    this.lastFlap = impulse;
    this.cooldown = j.cooldown;
    this._smoothVel.set(0, 0, 0);   // consume the swing
    hand.pulse?.(0.4 + 0.4 * t, 60);
  }
}
