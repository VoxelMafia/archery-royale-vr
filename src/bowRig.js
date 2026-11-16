import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildBow, setBowDraw, nockPoint, applyBowModel, buildArrowMesh } from './bow.js';

const _fwd = new THREE.Vector3();
const _nat = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _swing = new THREE.Quaternion();
const BOW_FWD = new THREE.Vector3(0, 0, -1);

// Bow-space -> grip-space correction: how the riser sits in a closed fist.
// Bow limbs (+/-Y) run along the fist-tunnel axis, the arrow leaves across the
// knuckles. Tune this one line if a controller feels rotated in the hand.
const GRIP_FIX = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

/**
 * Owns the bow and the draw state machine.
 *
 * An arrow is always on the string, sitting part-drawn at CONFIG.draw.idle.
 * You start a shot by reaching for that arrow's nock and squeezing: the draw
 * then follows your hand. You are literally pulling the arrow, not pressing a
 * "draw" button somewhere near the bow.
 *
 * Anchoring rule: the bow never leaves the grip hand's position. While drawn
 * its rotation is rebuilt each frame from
 *   aim   = gripPos - stringHandPos   (pulling past your cheek aims it)
 *   cant  = the grip hand's own twist (the bow rolls on its grip anchor)
 */
export class BowRig {
  constructor(scene) {
    this.object = buildBow();
    scene.add(this.object);

    // Arrow lifecycle: the shaft you loose is the shaft that was on the string.
    //   'none'   nothing nocked - reach behind your shoulder
    //   'hand'   an arrow out of the quiver, held in the string hand
    //   'string' resting on the string, nobody holding it
    //   'drawn'  held by the nock and being pulled
    this.state = 'none';
    this.handArrow = buildArrowMesh();
    this.handArrow.visible = false;
    scene.add(this.handArrow);

    this.nocked = false;       // === state 'drawn'
    this.drawLen = CONFIG.draw.idle;
    this.ratio = 0;
    this.visualDraw = CONFIG.draw.idle;
    this.aim = new THREE.Vector3(0, 0, -1);
    this.nockWorld = new THREE.Vector3();
    this.grabDist = Infinity;  // string hand -> nock, for the HUD/debug
    this.canGrab = false;
    this.canFetch = false;     // hand is at the quiver
    this.lastHaptic = 0;
    this.onRelease = null;     // (origin, dir, speed, ratio) => void

    setBowDraw(this.object, this.visualDraw, false);
    this.object.updateMatrixWorld(true);
    this.object.localToWorld(nockPoint(this.object, this.visualDraw, this.nockWorld));
  }

  /** Swap the procedural stand-in for a loaded model, in place. */
  useModel(gltfScene) { return applyBowModel(this.object, gltfScene); }

  get span() { return CONFIG.draw.max - CONFIG.draw.rest; }
  get locked() { return this.nocked; }

  update(dt, grip, draw, quiver = null) {
    if (!grip) { this.object.visible = false; return; }
    this.object.visible = true;

    const d = CONFIG.draw;
    const sep = draw ? grip.pos.distanceTo(draw.pos) : 0;

    this.grabDist = draw ? draw.pos.distanceTo(this.nockWorld) : Infinity;
    this.canFetch = !!(draw && quiver && this.state === 'none' && quiver.canGrab(draw.pos));
    this.canGrab = this.state === 'string' && this.grabDist <= d.grabRadius;

    if (!draw) {
      // Lost the string hand mid-shot: the arrow stays on the string.
      if (this.state === 'drawn') this.state = 'string';
    } else {
      switch (this.state) {
        case 'none':
          // Reach behind the shoulder and squeeze to pull a fresh shaft.
          if (this.canFetch && draw.trigger > 0.6) {
            this.state = 'hand';
            draw.pulse?.(0.3, 30);
          }
          break;

        case 'hand':
          // Carry it to the string. It nocks on contact; if you are still
          // holding the trigger you go straight into the draw.
          if (this.grabDist <= d.grabRadius) {
            this.state = draw.trigger > 0.6 ? 'drawn' : 'string';
            draw.pulse?.(0.25, 25);
          }
          break;

        case 'string':
          if (this.canGrab && draw.trigger > 0.6) {
            this.state = 'drawn';
            draw.pulse?.(0.25, 25);
          }
          break;

        case 'drawn':
          if (draw.trigger < 0.35) this.release(grip, draw);
          break;
      }
    }
    this.nocked = this.state === 'drawn';

    // The loose arrow in the string hand, on its way to the string.
    this.handArrow.visible = this.state === 'hand';
    if (this.state === 'hand') {
      this.handArrow.position.copy(draw.pos);
      this.handArrow.quaternion.copy(draw.quat);
      this.handArrow.translateZ(-CONFIG.arrow.length * 0.28);
    }

    // --- draw amount -------------------------------------------------------
    if (this.nocked) {
      this.drawLen = THREE.MathUtils.clamp(sep - d.rest, d.idle, this.span);
      this.ratio = THREE.MathUtils.clamp(
        (this.drawLen - d.idle) / (this.span - d.idle), 0, 1
      );
      const step = Math.floor(this.ratio * 5);
      if (step !== this.lastHaptic) {
        this.lastHaptic = step;
        draw.pulse?.(0.06 + 0.1 * this.ratio, 18);
        grip.pulse?.(0.04, 12);
      }
    } else {
      this.drawLen = d.idle;
      this.ratio = 0;
      this.lastHaptic = 0;
    }
    // The string snaps home far faster than you can pull it.
    this.visualDraw += (this.drawLen - this.visualDraw) *
      (this.nocked ? 1 : Math.min(1, dt * 28));
    setBowDraw(this.object, this.visualDraw, this.state === 'string' || this.state === 'drawn');

    // --- transform ---------------------------------------------------------
    this.object.position.copy(grip.pos);

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

    // Keep the world-space nock current for next frame's grab test.
    this.object.updateMatrixWorld(true);
    this.object.localToWorld(nockPoint(this.object, this.visualDraw, this.nockWorld));
  }

  release(grip, draw) {
    const ratio = this.ratio;
    this.nocked = false;
    // Loosing SPENDS the arrow: the string is empty until you fetch another.
    // A half-hearted let-go just leaves it resting on the string.
    this.state = ratio >= CONFIG.draw.minReleaseRatio ? 'none' : 'string';
    if (ratio >= CONFIG.draw.minReleaseRatio && this.onRelease) {
      const speed = THREE.MathUtils.lerp(CONFIG.draw.minSpeed, CONFIG.draw.maxSpeed, ratio);
      // Launch from the arrow's own head, not from a point near the fist, so
      // the shot starts exactly where the player sees the arrowhead.
      nockPoint(this.object, this.visualDraw, _tip);
      this.object.localToWorld(_tip).addScaledVector(this.aim, CONFIG.arrow.length);
      this.onRelease(_tip.clone(), this.aim.clone(), speed, ratio);
    }
    grip.pulse?.(0.35 + 0.6 * ratio, 45);
    draw?.pulse?.(0.2 + 0.5 * ratio, 30);
    this.drawLen = CONFIG.draw.idle;
    this.ratio = 0;
  }
}
