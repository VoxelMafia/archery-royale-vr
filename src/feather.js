import * as THREE from 'three';
import { CONFIG } from './config.js';

const QUILL = new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.7 });
const BARB = new THREE.MeshStandardMaterial({
  color: 0xdcd3bd, roughness: 0.85, side: THREE.DoubleSide, transparent: true, opacity: 0.95,
});

/** A single long quill, pointing down its own -Y. */
export function buildFeather() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.0015, 0.34, 6), QUILL);
  shaft.position.y = 0.17;
  g.add(shaft);

  const shape = new THREE.Shape();
  shape.moveTo(0, 0.04);
  shape.quadraticCurveTo(0.055, 0.14, 0.012, 0.30);
  shape.quadraticCurveTo(0.0, 0.18, 0, 0.04);
  const vane = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), BARB);
  g.add(vane);
  const vane2 = vane.clone();
  vane2.scale.x = -1;
  g.add(vane2);
  return g;
}

/**
 * Bonelab-style feather jump.
 *
 * Hold the feather (grip on the free hand) and swing it DOWN: the flap reads
 * the hand's real world-space velocity, so a lazy wave gives a hop and a hard
 * beat gives a full launch. Catch yourself in mid-air with a second flap for
 * the double jump. Hold the feather up over your head and you glide: gravity
 * drops to a fifth and the landing is soft.
 *
 * Velocity is measured over a short window rather than per frame, so a single
 * noisy tracking sample cannot fire a jump, and the impulse is a smooth ramp
 * between minSwing and maxSwing instead of a threshold step.
 */
export class FeatherController {
  constructor(scene) {
    this.object = buildFeather();
    this.object.visible = false;
    scene.add(this.object);

    this.held = false;
    this.swingSpeed = 0;      // downward component, m/s
    this.cooldown = 0;
    this.gliding = false;
    this.lastFlap = 0;        // impulse of the most recent flap, for the HUD

    this._prev = new THREE.Vector3();
    this._vel = new THREE.Vector3();
    this._smoothVel = new THREE.Vector3();
    this._hasPrev = false;
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3();
  }

  /**
   * @param {?object} hand   the free hand's pose (null if it has the bow)
   * @param {THREE.Vector3} headPos
   * @param {object} body    PlayerBody
   */
  update(dt, hand, headPos, body) {
    this.cooldown = Math.max(0, this.cooldown - dt);

    // The feather is held whenever the free hand squeezes grip away from the
    // head (grip AT the head is the bow handover gesture, so it never clashes).
    const nearHead = hand ? hand.pos.distanceTo(headPos) < CONFIG.hands.claimRadius : false;
    this.held = !!hand && hand.squeeze > 0.5 && !nearHead;

    if (!hand) {
      this.object.visible = false;
      this._hasPrev = false;
      this.gliding = false;
      return;
    }

    // Pose the feather in the hand (or stow it, nib-down, at the hip).
    this.object.visible = true;
    if (this.held) {
      this.object.position.copy(hand.pos);
      this.object.quaternion.copy(hand.quat).multiply(
        this._q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))
      );
    } else {
      this.object.position.set(headPos.x, headPos.y - 0.95, headPos.z);
      this.object.quaternion.identity();
    }

    // --- hand velocity ------------------------------------------------------
    if (!this._hasPrev) {
      this._prev.copy(hand.pos);
      this._hasPrev = true;
      return;
    }
    if (dt > 1e-4) {
      this._vel.subVectors(hand.pos, this._prev).divideScalar(dt);
      // ~60 ms window: smooths tracking noise without blunting a real beat.
      this._smoothVel.lerp(this._vel, Math.min(1, dt / 0.06));
    }
    this._prev.copy(hand.pos);
    this.swingSpeed = Math.max(0, -this._smoothVel.y);

    if (!this.held) { this.gliding = false; return; }

    const f = CONFIG.feather;

    // --- glide: feather held above the head ---------------------------------
    this.gliding = hand.pos.y > headPos.y + f.glideHold && body.vel.y < 0;

    // --- flap ---------------------------------------------------------------
    if (this.cooldown > 0 || this.swingSpeed < f.minSwing) return;
    if (body.flapsUsed >= f.maxFlaps) return;

    const t = THREE.MathUtils.clamp(
      (this.swingSpeed - f.minSwing) / (f.maxSwing - f.minSwing), 0, 1
    );
    let impulse = THREE.MathUtils.lerp(f.minImpulse, f.maxImpulse, t);
    if (!body.grounded) impulse *= f.airScale;

    body.flap(impulse);
    this.lastFlap = impulse;
    this.cooldown = f.cooldown;
    this._smoothVel.set(0, 0, 0);     // consume the swing
    hand.pulse?.(0.4 + 0.4 * t, 60);
  }
}
