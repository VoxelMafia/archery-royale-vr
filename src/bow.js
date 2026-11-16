import * as THREE from 'three';
import { CONFIG } from './config.js';

const WOOD = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.75, metalness: 0.05 });
const HORN = new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.5 });
const LEATHER = new THREE.MeshStandardMaterial({ color: 0x3b2a1b, roughness: 0.95 });
const STRING_MAT = new THREE.LineBasicMaterial({ color: 0xd9cfae });
const SHAFT = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.7 });
const FLETCH = new THREE.MeshStandardMaterial({ color: 0x9c2b20, roughness: 0.85, side: THREE.DoubleSide });
const HEAD = new THREE.MeshStandardMaterial({ color: 0x9fa3a8, roughness: 0.35, metalness: 0.8 });

/**
 * Bow local space: grip at the origin, limbs along +/-Y, shooting direction
 * -Z. The string's nocking point sits at (0, nockY, stringZ + drawLen) and
 * the arrow's tail is welded to it, so shaft and string never separate.
 *
 * The string is always ours (it has to deform); the riser and limbs are
 * either the procedural stand-in below or the loaded model.
 */
export function buildBow() {
  const bow = new THREE.Group();
  bow.name = 'bow';

  const b = CONFIG.bow;
  const half = b.length / 2;

  // --- procedural stand-in (shown until the model arrives) -----------------
  const stand = new THREE.Group();
  stand.name = 'proceduralBow';
  bow.add(stand);

  const limb = (sign) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.10 * sign, 0.00),
      new THREE.Vector3(0, 0.44 * sign, -0.045),
      new THREE.Vector3(0, 0.72 * sign, -0.085),
      new THREE.Vector3(0, 0.90 * sign, -0.055),
      new THREE.Vector3(0, half * sign, b.brace),
    ]);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.016, 8, false), WOOD);
    mesh.castShadow = true;
    return mesh;
  };
  stand.add(limb(1), limb(-1));

  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.15, 0.055), WOOD);
  lower.position.set(0, -0.055, 0);
  stand.add(lower);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.07, 0.055), WOOD);
  upper.position.set(0, 0.155, 0);
  stand.add(upper);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.1, 0.018), WOOD);
  spine.position.set(0, 0.09, 0.019);
  stand.add(spine);
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.029, 0.13, 12), LEATHER);
  wrap.position.set(0, -0.045, 0);
  stand.add(wrap);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.03), HORN);
  shelf.position.set(0, b.nockY - 0.008, -0.012);
  stand.add(shelf);

  // --- string (always procedural, three vertices: tip - nock - tip) --------
  const strGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, half, b.brace),
    new THREE.Vector3(0, b.nockY, b.brace),
    new THREE.Vector3(0, -half, b.brace),
  ]);
  const string = new THREE.Line(strGeo, STRING_MAT);
  string.frustumCulled = false;
  bow.add(string);

  // Serving: the thickened wrap at the nocking point. This is what the player
  // reaches for, so it is also the grab marker.
  const serving = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6), HORN);
  serving.rotation.x = Math.PI / 2;
  bow.add(serving);

  const arrow = buildArrowMesh();
  bow.add(arrow);

  bow.userData = {
    string, serving, nocked: arrow, procedural: stand,
    tipY: half,          // where the string meets the limbs
    stringZ: b.brace,    // braced string plane, in front of the grip
    nockY: b.nockY,      // nocking point height
    model: null,
  };
  setBowDraw(bow, 0);
  return bow;
}

/** The string's nocking point in bow-local space at a given draw length. */
export function nockPoint(bow, drawLen, target = new THREE.Vector3()) {
  const u = bow.userData;
  return target.set(0, u.nockY, u.stringZ + drawLen);
}

/**
 * Pull the string back by `drawLen`, carrying the arrow with it.
 *
 * The arrow's TAIL is pinned to the nocking point; only its head swings out
 * to the side of the riser (archer's paradox), so the nock and the string are
 * always exactly coincident however far you draw.
 */
export function setBowDraw(bow, drawLen, arrowVisible = true) {
  const u = bow.userData;
  const z = u.stringZ + drawLen;

  const p = u.string.geometry.attributes.position;
  p.setXYZ(0, 0, u.tipY, u.stringZ);
  p.setXYZ(1, 0, u.nockY, z);
  p.setXYZ(2, 0, -u.tipY, u.stringZ);
  p.needsUpdate = true;
  u.string.geometry.computeBoundingSphere();

  u.serving.position.set(0, u.nockY, z);

  const arrow = u.nocked;
  arrow.visible = arrowVisible;
  if (!arrowVisible) return;

  const L = CONFIG.arrow.length;
  const side = CONFIG.bow.paradoxOffset;        // head clears the riser
  const dx = side;
  const dz = -L;
  const len = Math.hypot(dx, dz);
  _dir.set(dx / len, 0, dz / len);
  arrow.quaternion.setFromUnitVectors(BACK_Z, _dir);
  arrow.position.set(0, u.nockY, z).addScaledVector(_dir, L * 0.5);
}

const _dir = new THREE.Vector3();
const BACK_Z = new THREE.Vector3(0, 0, -1);

/**
 * Fit a loaded bow model into the rig.
 *
 * Nothing about the source model is assumed beyond "it is a bow": the limbs,
 * the string plane and the overall size are all measured from its geometry,
 * then it is rotated, scaled and shifted so that
 *   - the limbs run along +/-Y,
 *   - the grip lands on the origin one brace height in front of the string,
 *   - the whole bow is CONFIG.bow.length tall.
 * The model's own string mesh is removed — ours has to bend.
 */
export function applyBowModel(bow, gltfScene) {
  const b = CONFIG.bow;
  const u = bow.userData;

  const model = gltfScene;
  const holder = new THREE.Group();
  holder.name = 'bowModel';

  // The source has its limbs along X; stand it up. (A model already standing
  // up measures the same either way -- we pick the axis with the longest run.)
  const raw = new THREE.Box3().setFromObject(model);
  const size = raw.getSize(new THREE.Vector3());
  if (size.x > size.y) model.rotation.z = Math.PI / 2;

  // Split out the model's own string before measuring the limbs.
  let modelString = null;
  model.traverse((o) => { if (/string/i.test(o.name) && o.isMesh) modelString = o; });

  holder.add(model);
  holder.updateMatrixWorld(true);

  const stringBox = modelString ? new THREE.Box3().setFromObject(modelString) : null;
  if (modelString) modelString.visible = false;

  const box = new THREE.Box3().setFromObject(holder);
  const span = box.max.y - box.min.y;
  const scale = span > 1e-6 ? b.length / span : 1;
  holder.scale.setScalar(scale);

  // Where the string attaches, in the scaled model's own space.
  const tipY = stringBox
    ? Math.max(Math.abs(stringBox.max.y), Math.abs(stringBox.min.y)) * scale
    : (span * scale) / 2;
  const stringZ = stringBox ? ((stringBox.max.z + stringBox.min.z) / 2) * scale : 0;
  const midY = ((box.max.y + box.min.y) / 2) * scale;

  // Put the grip on the origin: centred on the limbs, one brace height in
  // front of the string plane.
  holder.position.set(
    -((box.max.x + box.min.x) / 2) * scale,
    -midY,
    -(stringZ - b.brace)
  );

  const blacken = new THREE.MeshStandardMaterial({
    color: b.tint, roughness: b.roughness, metalness: b.metalness,
  });
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.material = blacken;
    o.castShadow = true;
  });

  bow.add(holder);
  u.procedural.visible = false;
  u.model = holder;
  u.tipY = tipY - midY;
  u.stringZ = b.brace;
  u.nockY = b.nockY;

  setBowDraw(bow, 0);
  return { scale, tipY: u.tipY, stringZ: u.stringZ };
}

export function buildArrowMesh() {
  const g = new THREE.Group();
  const L = CONFIG.arrow.length;

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, L, 7), SHAFT);
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);

  const head = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.06, 8), HEAD);
  head.rotation.x = -Math.PI / 2;
  head.position.z = -L / 2 - 0.02;
  g.add(head);

  // Nock: the slot that rides the string, at the very tail.
  const nock = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.007, 0.022, 6), HORN);
  nock.rotation.x = Math.PI / 2;
  nock.position.z = L / 2 - 0.011;
  g.add(nock);

  for (let i = 0; i < 3; i++) {
    const vane = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.03), FLETCH);
    vane.position.z = L / 2 - 0.06;
    vane.rotation.y = Math.PI / 2;
    const pivot = new THREE.Group();
    pivot.rotation.z = (i * Math.PI * 2) / 3;
    pivot.add(vane);
    g.add(pivot);
  }
  return g;
}
