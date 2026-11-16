import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Vertical physics for the play-space rig.
 *
 * A flap SETS upward velocity rather than adding to it, so a mid-air beat
 * cancels whatever fall you were in and catches you cleanly — that is what
 * makes a double jump feel deliberate instead of mushy.
 *
 * Landing is absorbed rather than snapped: the rig dips by a few centimetres
 * on impact and springs back. In VR a hard stop at the floor reads as a jolt
 * through the whole view, and this costs one spring to avoid.
 */
export class PlayerBody {
  constructor(rig) {
    this.rig = rig;
    this.vel = new THREE.Vector3(0, 0, 0);
    this.groundY = 0;
    this.grounded = true;
    this.flapsUsed = 0;
    this.absorb = 0;        // current landing dip (m, negative = down)
    this.absorbVel = 0;
    this.airborneFor = 0;
    this.lastLanding = 0;   // impact speed of the last touchdown (m/s)
  }

  flap(impulse) {
    this.vel.y = impulse;
    this.grounded = false;
    this.flapsUsed++;
    this.airborneFor = 0;
  }

  update(dt, floating = false) {
    const p = CONFIG.player;
    const j = CONFIG.jump;

    if (!this.grounded) {
      this.airborneFor += dt;
      const g = p.gravity * (floating ? j.floatGravity : 1);
      this.vel.y += g * dt;
      if (floating) this.vel.y = Math.max(this.vel.y, -j.floatMaxFall);

      this.rig.position.y += this.vel.y * dt;

      if (this.rig.position.y <= this.groundY) {
        this.lastLanding = Math.abs(this.vel.y);
        this.rig.position.y = this.groundY;
        this.grounded = true;
        this.flapsUsed = 0;
        this.airborneFor = 0;
        // Soak up to 9 cm of the impact, proportional to how hard it was.
        this.absorb = -Math.min(0.09, this.lastLanding * 0.012);
        this.absorbVel = 0;
        this.vel.y = 0;
      }
    } else if (this.rig.position.y > this.groundY + 1e-4) {
      // Walked off something.
      this.grounded = false;
    }

    // Critically damped spring back up to standing.
    if (this.absorb !== 0 || this.absorbVel !== 0) {
      const k = CONFIG.jump.landSmoothing;
      this.absorbVel += (-this.absorb * k * k - 2 * k * this.absorbVel) * dt;
      this.absorb += this.absorbVel * dt;
      if (Math.abs(this.absorb) < 1e-4 && Math.abs(this.absorbVel) < 1e-3) {
        this.absorb = 0;
        this.absorbVel = 0;
      }
    }
    if (this.grounded) this.rig.position.y = this.groundY + this.absorb;
  }

  /** Ground speed multiplier for locomotion. */
  get controlScale() {
    return this.grounded ? 1 : CONFIG.player.airControl;
  }
}
