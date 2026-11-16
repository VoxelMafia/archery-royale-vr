import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Both input backends return the same shape, so nothing downstream knows
 * whether it is driven by a headset or by mouse + keyboard:
 *
 *   { head:{pos,quat}, left:HandPose|null, right:HandPose|null, move:{x,y,turn} }
 *   HandPose = { pos, quat, trigger, squeeze, pull, pulse(intensity, ms) }
 *
 * trigger = draw/release.  squeeze = grip, used for the bow-claim gesture.
 */

function makePose() {
  const p = {
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    trigger: 0,
    squeeze: 0,
    pull: 0,
    actuator: null,
    pulse(intensity, ms) {
      try { p.actuator?.pulse(Math.min(1, Math.max(0, intensity)), ms); } catch { /* no haptics */ }
    },
  };
  return p;
}

function buildHandMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4e3b2a, roughness: 0.9 });
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, 0.1), mat);
  g.add(palm);
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), mat);
  fist.position.z = -0.05;
  g.add(fist);
  g.userData.mat = mat;
  return g;
}

// ---------------------------------------------------------------------------
// WebXR controllers
// ---------------------------------------------------------------------------
export class XRInput {
  constructor(renderer, player) {
    this.renderer = renderer;
    this.sources = { left: null, right: null };
    this.grips = { left: null, right: null };
    this.hands = { left: null, right: null };     // visual meshes
    this.head = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this.move = { x: 0, y: 0, turn: 0, turnAxis: 0 };
    this._pose = { left: makePose(), right: makePose() };

    for (let i = 0; i < 2; i++) {
      const grip = renderer.xr.getControllerGrip(i);
      const mesh = buildHandMesh();
      grip.add(mesh);
      player.add(grip);

      const ctrl = renderer.xr.getController(i);
      player.add(ctrl);
      ctrl.addEventListener('connected', (e) => {
        const h = e.data.handedness;
        if (h === 'left' || h === 'right') {
          this.sources[h] = e.data;
          this.grips[h] = grip;
          this.hands[h] = mesh;
        }
      });
      ctrl.addEventListener('disconnected', () => {
        for (const h of ['left', 'right']) {
          if (this.grips[h] === grip) { this.grips[h] = null; this.sources[h] = null; }
        }
      });
    }
  }

  read(camera) {
    camera.getWorldPosition(this.head.pos);
    camera.getWorldQuaternion(this.head.quat);
    this.move.x = this.move.y = this.move.turn = this.move.turnAxis = 0;

    const out = { head: this.head, left: null, right: null, move: this.move };
    for (const h of ['left', 'right']) {
      const grip = this.grips[h];
      const src = this.sources[h];
      if (!grip || !src) continue;

      const p = this._pose[h];
      grip.getWorldPosition(p.pos);
      grip.getWorldQuaternion(p.quat);

      const gp = src.gamepad;
      p.trigger = gp?.buttons?.[0]?.value ?? 0;
      p.squeeze = gp?.buttons?.[1]?.value ?? 0;
      p.pull = Math.max(p.trigger, p.squeeze);
      p.actuator = gp?.hapticActuators?.[0] ?? null;

      // Locomotion is bound to the physical controllers, not to the bow/string
      // roles, so walking does not change meaning when you swap hands.
      const ax = gp?.axes?.[2] ?? 0;
      const ay = gp?.axes?.[3] ?? 0;
      if (h === 'left') {
        if (Math.abs(ay) > 0.15) this.move.y += -ay;
        if (Math.abs(ax) > 0.15) this.move.x += ax;
      } else {
        this.move.turnAxis = ax;
        this.move.turn = Math.abs(ax) > 0.8 ? Math.sign(ax) : 0;
      }

      out[h] = p;
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Desktop fallback
// ---------------------------------------------------------------------------
/**
 * Simulates a head and two hands so the whole mechanic is testable in a normal
 * browser. It does NOT shortcut the role logic: [Q] raises the free hand to the
 * head with grip held, and the real HandRoleArbiter decides from that pose.
 *
 *   mouse        look (click to capture)
 *   WASD         move
 *   hold LMB     nock + draw, release to shoot
 *   Z / C        cant (roll) the bow hand
 *   Q            raise free hand to head w/ grip -> claim the bow
 */
export class DesktopInput {
  constructor(domElement) {
    this.dom = domElement;
    this.yaw = 0;
    this.pitch = 0;
    this.cant = 0;
    this.pulling = false;
    this.pullT = 0;
    this.claimT = 0;            // seconds of claim gesture left
    this.swingT = -1;           // arm-swing animation clock (s)
    this.fetchT = -1;           // reach-behind-the-shoulder clock (s)
    this.keys = new Set();
    this.move = { x: 0, y: 0, turn: 0, turnAxis: 0 };
    this.head = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this._pose = { left: makePose(), right: makePose() };
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
    this._v = new THREE.Vector3();

    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.repeat) return;      // held keys must not re-fire one-shot actions
      // Hold the claim pose until the arbiter commits (cleared by main), with
      // a safety timeout so a missed commit cannot latch it forever.
      if (e.code === 'KeyQ') this.claimT = 1.5;
      // Space swings the free hand down for real, rather than calling the
      // jump directly: the same velocity detector runs as in the headset.
      if (e.code === 'Space' && this.swingT < 0) this.swingT = 0;
      // R reaches the hand back to the quiver and squeezes, exactly as in VR.
      if (e.code === 'KeyR' && this.fetchT < 0) this.fetchT = 0;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    domElement.addEventListener('click', () => domElement.requestPointerLock?.());
    addEventListener('mousedown', (e) => { if (e.button === 0) this.pulling = true; });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.pulling = false; });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== domElement) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.25, 1.25);
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** @param {'left'|'right'} bowSide which hand currently holds the bow */
  read(camera, dt, bowSide, quiverPoint = null) {
    this.pullT = THREE.MathUtils.clamp(
      this.pullT + (this.pulling ? dt / 0.5 : -dt / 0.1), 0, 1
    );
    this.claimT = Math.max(0, this.claimT - dt);
    if (this.keys.has('KeyZ')) this.cant += dt * 1.8;
    if (this.keys.has('KeyC')) this.cant -= dt * 1.8;

    this._e.set(this.pitch, this.yaw, 0);
    const hq = this.head.quat.setFromEuler(this._e);
    camera.position.set(0, CONFIG.player.eyeHeight, 0);
    camera.quaternion.copy(hq);
    camera.getWorldPosition(this.head.pos);

    this.move.x = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    this.move.y = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    this.move.turnAxis = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
    this.move.turn = 0;

    // Arm swing: 0.5 m down in 0.1 s, then back up over 0.25 s.
    let swingY = 0;
    if (this.swingT >= 0) {
      this.swingT += dt;
      swingY = this.swingT < 0.1
        ? -0.5 * (this.swingT / 0.1)
        : -0.5 * Math.max(0, 1 - (this.swingT - 0.1) / 0.25);
      if (this.swingT > 0.35) this.swingT = -1;
    }
    if (this.fetchT >= 0) {
      this.fetchT += dt;
      if (this.fetchT > 0.6) this.fetchT = -1;
    }

    const drawSide = bowSide === 'left' ? 'right' : 'left';
    const bowSgn = bowSide === 'left' ? -1 : 1;

    // Bow hand: arm extended out front, canted by Z/C.
    const bow = this._pose[bowSide];
    this._v.set(bowSgn * 0.17, -0.17, -0.66);
    bow.pos.copy(this._v).applyQuaternion(hq).add(this.head.pos);
    bow.quat.copy(hq)
      .multiply(this._qa.setFromEuler(new THREE.Euler(0, 0, this.cant)))
      .multiply(this._qb.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
    bow.trigger = 0;
    bow.squeeze = 0;
    bow.pull = 0;

    // Draw hand: chest -> past the cheek as the draw builds.
    const draw = this._pose[drawSide];
    if (this.fetchT >= 0 && quiverPoint) {
      // Hand goes to the quiver and squeezes; the rig's own reach test decides.
      draw.pos.copy(quiverPoint);
      draw.quat.copy(hq);
      draw.trigger = 1;
      draw.squeeze = 0;
      draw.pull = 1;
      return { head: this.head, left: this._pose.left, right: this._pose.right, move: this.move };
    }
    if (this.claimT > 0) {
      // Claim gesture: hand in to the head, grip held.
      this._v.set(-bowSgn * 0.16, -0.04, -0.12);
      draw.squeeze = 1;
      draw.trigger = 0;
    } else {
      // Line the string hand up DIRECTLY behind the grip hand, the way an
      // archer brings the string under their dominant eye: the aim vector is
      // then the view direction rather than a 20-degree cross-body angle.
      // Travel is along z only: rest separation -> full draw.
      const z = THREE.MathUtils.lerp(-0.48, 0.02, this.pullT);
      this._v.set(bowSgn * 0.17, -0.17 + swingY, z);
      draw.squeeze = 0;
      draw.trigger = this.pulling ? 1 : 0;
    }
    draw.pos.copy(this._v).applyQuaternion(hq).add(this.head.pos);
    draw.quat.copy(hq);
    draw.pull = Math.max(draw.trigger, draw.squeeze);

    return { head: this.head, left: this._pose.left, right: this._pose.right, move: this.move };
  }
}
