import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildBow, setBowDraw } from './bow.js';

const _fwd = new THREE.Vector3();
const _nat = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _swing = new THREE.Quaternion();
const BOW_FWD = new THREE.Vector3(0, 0, -1);

// Bow-space -> grip-space correction: how the riser sits in a closed fist.
// Bow limbs (+/-Y) run along the fist-tunnel axis, the arrow leaves across the
// knuckles. Tune this one line if a controller feels rotated in the hand.
const GRIP_FIX = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

/**
 * Owns the bow object and the draw state machine.
 *
 * Anchoring rule: the bow NEVER leaves the grip hand's position. While the
 * string is drawn the bow's *rotation* is re-derived each frame from
 *   aim axis  = gripPos - drawPos      (so pulling past your cheek aims it)
 *   roll/cant = grip hand's own twist  (so the bow tilts on its grip anchor)
 * which is what makes the bow feel pivoted on the grip rather than snapped
 * to a hand pose.
 */
export class BowRig {
  constructor(scene) {
    this.object = buildBow();
    scene.add(this.object);

    this.nocked = false;
    this.drawLen = 0;
    this.ratio = 0;
    this.visualDraw = 0;
    this.aim = new THREE.Vector3(0, 0, -1);
    this.origin = new THREE.Vector3();
    this.lastHaptic = 0;
    this.onRelease = null; // (origin, dir, speed, ratio) => void
  }

  get span() { return CONFIG.draw.max - CONFIG.draw.rest; }

  /** True while the shot is committed — role switching is locked here. */
  get locked() { return this.nocked; }

  /**
   * @param {{pos:THREE.Vector3, quat:THREE.Quaternion, trigger:number, pulse:Function}} grip
   * @param {{pos:THREE.Vector3, quat:THREE.Quaternion, trigger:number, pulse:Function}} draw
   */
  update(dt, grip, draw) {
    if (!grip) { this.object.visible = false; return; }
    this.object.visible = true;

    const d = CONFIG.draw;
    const sep = draw ? grip.pos.distanceTo(draw.pos) : 0;

    // --- nock / release -----------------------------------------------------
    if (draw) {
      if (!this.nocked && draw.trigger > 0.6 && sep < 0.45) {
        this.nocked = true;
        draw.pulse?.(0.25, 25);
      } else if (this.nocked && draw.trigger < 0.35) {
        this.release(grip, draw);
      }
    } else if (this.nocked) {
      this.nocked = false;
    }

    // --- draw amount -------------------------------------------------------
    if (this.nocked) {
      this.drawLen = THREE.MathUtils.clamp(sep - d.rest, 0, this.span);
      this.ratio = this.drawLen / this.span;
      // Creaking feedback every 20% of draw.
      const step = Math.floor(this.ratio * 5);
      if (step !== this.lastHaptic) {
        this.lastHaptic = step;
        draw.pulse?.(0.06 + 0.1 * this.ratio, 18);
        grip.pulse?.(0.04, 12);
      }
    } else {
      this.drawLen = 0;
      this.ratio = 0;
      this.lastHaptic = 0;
    }
    // String snaps forward faster than it is pulled back.
    const k = this.nocked ? 1 : Math.min(1, dt * 28);
    this.visualDraw += (this.drawLen - this.visualDraw) * (this.nocked ? 1 : k);
    setBowDraw(this.object, this.visualDraw, this.nocked);

    // --- transform ---------------------------------------------------------
    this.object.position.copy(grip.pos);
    this.origin.copy(grip.pos);

    if (this.nocked && draw && sep > 0.03) {
      _fwd.subVectors(grip.pos, draw.pos).normalize();
      this.aim.copy(_fwd);

      // Minimal-swing aim: take the bow exactly as the hand holds it, then
      // rotate it by the shortest arc that puts its shooting axis on the aim
      // line. Any twist of the grip hand about that line survives untouched,
      // so canting the wrist rolls the bow around its own grip anchor -- and
      // there is no reference axis that can go degenerate against the aim.
      _q.copy(grip.quat).multiply(GRIP_FIX);
      _nat.copy(BOW_FWD).applyQuaternion(_q);
      if (_nat.dot(_fwd) < -0.9999) _nat.x += 1e-3;   // exact 180 deg flip
      _swing.setFromUnitVectors(_nat.normalize(), _fwd);
      _q.premultiply(_swing);
      this.object.quaternion.slerp(_q, Math.min(1, dt * CONFIG.draw.aimSmoothing));
    } else {
      _q.copy(grip.quat).multiply(GRIP_FIX);
      this.object.quaternion.slerp(_q, Math.min(1, dt * 30));
      this.aim.set(0, 0, -1).applyQuaternion(this.object.quaternion);
    }
  }

  release(grip, draw) {
    const ratio = this.ratio;
    this.nocked = false;
    if (ratio >= CONFIG.draw.minReleaseRatio && this.onRelease) {
      const speed = THREE.MathUtils.lerp(CONFIG.draw.minSpeed, CONFIG.draw.maxSpeed, ratio);
      const origin = grip.pos.clone().addScaledVector(this.aim, 0.12);
      this.onRelease(origin, this.aim.clone(), speed, ratio);
    }
    grip.pulse?.(0.35 + 0.6 * ratio, 45);
    draw?.pulse?.(0.2 + 0.5 * ratio, 30);
    this.drawLen = 0;
    this.ratio = 0;
  }
}
