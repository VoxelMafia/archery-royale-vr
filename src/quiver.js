import * as THREE from 'three';
import { CONFIG } from './config.js';

const LEATHER = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.95 });
const STRAP = new THREE.MeshStandardMaterial({ color: 0x2a1d13, roughness: 1.0 });
const SHAFT = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.7 });
const FLETCH = new THREE.MeshStandardMaterial({
  color: 0x9c2b20, roughness: 0.85, side: THREE.DoubleSide,
});

/**
 * Over-the-shoulder quiver.
 *
 * It rides behind the shoulder of the STRING hand — the hand that is not
 * holding the bow — so it swaps sides the moment the player hands the bow
 * over, and the reach-back is always the same motion with the same arm.
 *
 * It tracks the head's yaw only: tipping your head back must not drag the
 * quiver up out of reach.
 */
export class Quiver {
  constructor(scene) {
    this.object = new THREE.Group();
    this.object.add(buildQuiverMesh());
    scene.add(this.object);

    this.grabPoint = new THREE.Vector3();
    this.side = 'right';
    this.reach = Infinity;      // current hand distance, for the HUD

    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._q = new THREE.Quaternion();
    this._off = new THREE.Vector3();
  }

  /** @param {'left'|'right'} side the string hand's side */
  update(headPos, headQuat, side) {
    this.side = side;
    const q = CONFIG.quiver;

    // Yaw only.
    this._e.setFromQuaternion(headQuat, 'YXZ');
    this._q.setFromEuler(this._e.set(0, this._e.y, 0));

    const sgn = side === 'left' ? -1 : 1;
    this._off.set(sgn * q.shoulder.x, q.shoulder.y, q.shoulder.z);
    this._off.applyQuaternion(this._q);

    this.object.position.copy(headPos).add(this._off);
    this.object.quaternion.copy(this._q);
    this.object.rotateZ(sgn * q.tilt);
    this.object.rotateX(q.lean);

    // The grab point is the fletching end, a little above the tube.
    this.grabPoint.copy(this.object.position)
      .add(this._off.set(0, q.grabHeight, 0).applyQuaternion(this.object.quaternion));
  }

  canGrab(handPos) {
    this.reach = handPos ? handPos.distanceTo(this.grabPoint) : Infinity;
    return this.reach <= CONFIG.quiver.grabRadius;
  }
}

function buildQuiverMesh() {
  const g = new THREE.Group();

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.045, 0.42, 12, 1, true), LEATHER);
  tube.castShadow = true;
  g.add(tube);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.009, 6, 14), STRAP);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.21;
  g.add(rim);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 12), STRAP);
  base.position.y = -0.21;
  g.add(base);

  // A few shafts poking out of the top, so it reads as full at a glance.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const r = 0.028;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.34, 6), SHAFT);
    shaft.position.set(Math.cos(a) * r, 0.33, Math.sin(a) * r);
    shaft.rotation.z = Math.cos(a) * 0.08;
    shaft.rotation.x = -Math.sin(a) * 0.08;
    g.add(shaft);

    for (let v = 0; v < 3; v++) {
      const vane = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.028), FLETCH);
      vane.rotation.y = Math.PI / 2;
      const pivot = new THREE.Group();
      pivot.position.copy(shaft.position).setY(0.44);
      pivot.rotation.z = (v * Math.PI * 2) / 3;
      pivot.add(vane);
      vane.rotation.x = Math.PI / 2;
      g.add(pivot);
    }
  }
  return g;
}
