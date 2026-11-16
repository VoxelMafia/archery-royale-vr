import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildArrowMesh } from './bow.js';

const _ray = new THREE.Raycaster();
const _step = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** Ballistic arrows with segment-raycast collision and stick-in-surface. */
export class ArrowManager {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;   // array of meshes (walls, floor, targets)
    this.live = [];
    this.pool = [];
    this.onHit = null;            // (hitObject, point, speed) => void
    _ray.far = 50;
  }

  acquire() {
    const m = this.pool.pop() || buildArrowMesh();
    m.visible = true;
    this.scene.add(m);
    return m;
  }

  fire(origin, dir, speed) {
    const mesh = this.acquire();
    mesh.position.copy(origin);
    const a = {
      mesh,
      vel: dir.clone().multiplyScalar(speed),
      prev: origin.clone(),
      age: 0,
      stuck: false,
    };
    this.orient(a);
    this.live.push(a);
    return a;
  }

  orient(a) {
    _dir.copy(a.vel).normalize();
    // Arrow mesh points down -Z.
    a.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), _dir);
  }

  update(dt) {
    const g = CONFIG.arrow.gravity;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const a = this.live[i];
      a.age += dt;

      if (a.stuck) {
        if (a.age > CONFIG.arrow.stuckLife) this.retire(i);
        continue;
      }

      a.prev.copy(a.mesh.position);
      a.vel.y += g * dt;
      a.vel.multiplyScalar(1 - CONFIG.arrow.drag * dt);
      _step.copy(a.vel).multiplyScalar(dt);
      const dist = _step.length();
      a.mesh.position.add(_step);
      this.orient(a);

      if (dist > 1e-5 && this.colliders.length) {
        _ray.set(a.prev, _dir.copy(_step).divideScalar(dist));
        _ray.far = dist + 0.02;
        const hits = _ray.intersectObjects(this.colliders, false);
        if (hits.length) {
          const h = hits[0];
          const speed = a.vel.length();
          a.mesh.position.copy(h.point).addScaledVector(_dir, Math.min(0.18, CONFIG.arrow.length * 0.25));
          a.stuck = true;
          a.age = 0;
          a.vel.set(0, 0, 0);
          this.onHit?.(h.object, h.point, speed);
          continue;
        }
      }

      if (a.age > CONFIG.arrow.life || a.mesh.position.y < -5) this.retire(i);
    }
  }

  retire(i) {
    const a = this.live[i];
    this.scene.remove(a.mesh);
    a.mesh.visible = false;
    this.pool.push(a.mesh);
    this.live.splice(i, 1);
  }
}
