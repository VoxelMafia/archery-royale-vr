import * as THREE from 'three';
import { CONFIG } from './config.js';

const WOOD = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.75, metalness: 0.05 });
const HORN = new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.5 });
const LEATHER = new THREE.MeshStandardMaterial({ color: 0x3b2a1b, roughness: 0.95 });
const STRING = new THREE.LineBasicMaterial({ color: 0xd9cfae });
const SHAFT = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.7 });
const FLETCH = new THREE.MeshStandardMaterial({ color: 0x9c2b20, roughness: 0.85, side: THREE.DoubleSide });
const HEAD = new THREE.MeshStandardMaterial({ color: 0x9fa3a8, roughness: 0.35, metalness: 0.8 });

/**
 * Bow local space: grip at origin, limbs along +/-Y, shooting direction -Z.
 * The string nock slides along +Z as the bow is drawn.
 */
export function buildBow() {
  const bow = new THREE.Group();
  bow.name = 'bow';

  const limb = (sign) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.10 * sign, 0.00),
      new THREE.Vector3(0, 0.38 * sign, -0.045),
      new THREE.Vector3(0, 0.62 * sign, -0.085),
      new THREE.Vector3(0, 0.78 * sign, -0.055),
      new THREE.Vector3(0, 0.86 * sign, 0.015),
    ]);
    const geo = new THREE.TubeGeometry(curve, 24, 0.016, 8, false);
    const mesh = new THREE.Mesh(geo, WOOD);
    mesh.castShadow = true;
    return mesh;
  };
  bow.add(limb(1), limb(-1));

  // Riser / grip block
  const riser = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.26, 0.055), WOOD);
  riser.castShadow = true;
  bow.add(riser);

  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.029, 0.13, 12), LEATHER);
  bow.add(wrap);

  // Horn tips
  for (const s of [1, -1]) {
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), HORN);
    tip.position.set(0, 0.86 * s, 0.015);
    bow.add(tip);
  }

  // Arrow rest shelf
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.03), HORN);
  shelf.position.set(0.028, 0.075, -0.01);
  bow.add(shelf);

  // String: upper tip -> nock -> lower tip
  const strGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.86, 0.015),
    new THREE.Vector3(0, 0, 0.015),
    new THREE.Vector3(0, -0.86, 0.015),
  ]);
  const string = new THREE.Line(strGeo, STRING);
  string.frustumCulled = false;
  bow.add(string);

  // Nocked arrow (shown only while drawn)
  const nocked = buildArrowMesh();
  nocked.visible = false;
  bow.add(nocked);

  bow.userData.string = string;
  bow.userData.nocked = nocked;
  return bow;
}

/** Push the string nock back by `drawLen` metres and park the nocked arrow. */
export function setBowDraw(bow, drawLen, nockVisible) {
  const str = bow.userData.string;
  const p = str.geometry.attributes.position;
  p.setXYZ(1, 0, 0.0, 0.015 + drawLen);   // middle vertex = nock
  p.needsUpdate = true;

  const arrow = bow.userData.nocked;
  arrow.visible = nockVisible;
  if (nockVisible) {
    // Shaft points -Z; back end sits at the nock, so slide the whole arrow.
    arrow.position.set(0.028, 0.075, 0.015 + drawLen - CONFIG.arrow.length * 0.5);
    arrow.rotation.set(0, 0, 0);
  }
}

export function buildArrowMesh() {
  const g = new THREE.Group();
  const L = CONFIG.arrow.length;

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, L, 7), SHAFT);
  shaft.rotation.x = Math.PI / 2;          // align cylinder (+Y) with -Z
  g.add(shaft);

  const head = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.06, 8), HEAD);
  head.rotation.x = -Math.PI / 2;
  head.position.z = -L / 2 - 0.02;
  g.add(head);

  for (let i = 0; i < 3; i++) {
    const vane = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.03), FLETCH);
    vane.position.z = L / 2 - 0.055;
    vane.rotation.y = Math.PI / 2;
    const pivot = new THREE.Group();
    pivot.rotation.z = (i * Math.PI * 2) / 3;
    pivot.add(vane);
    g.add(pivot);
  }
  return g;
}
