import * as THREE from 'three';

const MAT = {
  stone: new THREE.MeshStandardMaterial({ color: 0x6b6660, roughness: 0.95 }),
  darkStone: new THREE.MeshStandardMaterial({ color: 0x47433f, roughness: 0.95 }),
  mossy: new THREE.MeshStandardMaterial({ color: 0x55604a, roughness: 1.0 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.9 }),
  straw: new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 1.0 }),
  ringRed: new THREE.MeshStandardMaterial({ color: 0xb33c2c, roughness: 0.9 }),
  ringGold: new THREE.MeshStandardMaterial({ color: 0xd9b24c, roughness: 0.8 }),
  iron: new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.6, metalness: 0.7 }),
};

/**
 * An open medieval dungeon courtyard: ruined keep walls, pillars, braziers,
 * crates and five straw butts to shoot at. Fully procedural, no assets.
 */
export function buildDungeon(scene) {
  const colliders = [];
  const targets = [];
  const flickers = [];
  const root = new THREE.Group();
  scene.add(root);

  const add = (mesh, solid = true) => {
    root.add(mesh);
    if (solid) colliders.push(mesh);
    return mesh;
  };

  // --- ground -------------------------------------------------------------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), MAT.darkStone);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  add(floor);

  // Flagstone slabs: one instanced draw call, reads well at VR scale.
  const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.06, 2.4), MAT.stone, 121);
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      m4.makeTranslation(x * 2.5, 0.03, z * 2.5);
      slabs.setMatrixAt(n++, m4);
    }
  }
  slabs.receiveShadow = true;
  root.add(slabs);

  // --- outer walls --------------------------------------------------------
  const W = 14, H = 5.5, T = 0.8;
  const wallGeo = new THREE.BoxGeometry(W * 2, H, T);
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2;
    const w = new THREE.Mesh(wallGeo, MAT.stone);
    w.position.set(Math.sin(ang) * W, H / 2, Math.cos(ang) * W);
    w.rotation.y = ang;
    w.castShadow = true;
    w.receiveShadow = true;
    w.name = 'wall';
    add(w);
  }

  // Crenellations
  const merlon = new THREE.BoxGeometry(0.9, 0.9, T);
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2;
    for (let s = -12; s <= 12; s += 2.2) {
      const m = new THREE.Mesh(merlon, MAT.stone);
      m.position.set(
        Math.sin(ang) * W + Math.cos(ang) * s,
        H + 0.45,
        Math.cos(ang) * W - Math.sin(ang) * s
      );
      m.rotation.y = ang;
      root.add(m);
    }
  }

  // --- pillars ------------------------------------------------------------
  const pillarGeo = new THREE.CylinderGeometry(0.42, 0.5, 4.6, 10);
  const capGeo = new THREE.BoxGeometry(1.2, 0.3, 1.2);
  for (const [px, pz] of [[-7, -7], [7, -7], [-7, 7], [7, 7], [-3.2, -9], [3.2, 9]]) {
    const p = new THREE.Mesh(pillarGeo, MAT.stone);
    p.position.set(px, 2.3, pz);
    p.castShadow = true;
    p.name = 'pillar';
    add(p);
    const cap = new THREE.Mesh(capGeo, MAT.mossy);
    cap.position.set(px, 4.7, pz);
    root.add(cap);
  }

  // --- extraction gate (portcullis) ---------------------------------------
  const gate = new THREE.Group();
  gate.position.set(0, 0, -W + 0.5);
  for (let i = -3; i <= 3; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6), MAT.iron);
    bar.position.set(i * 0.5, 2.1, 0);
    gate.add(bar);
  }
  for (let j = 0; j < 4; j++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.09, 0.09), MAT.iron);
    bar.position.set(0, 0.6 + j * 1.1, 0);
    gate.add(bar);
  }
  root.add(gate);

  // --- crates / cover -----------------------------------------------------
  for (const [cx, cz, ry] of [[-4, 3, 0.3], [-3.2, 3.6, 0.9], [5, -2, -0.4], [4.4, -3.1, 0.2], [-6, -3, 0.7]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), MAT.wood);
    c.position.set(cx, 0.48, cz);
    c.rotation.y = ry;
    c.castShadow = true;
    c.name = 'crate';
    add(c);
  }

  // --- braziers -----------------------------------------------------------
  for (const [bx, bz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.16, 0.3, 10), MAT.iron);
    bowl.position.set(bx, 1.25, bz);
    root.add(bowl);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.1, 8), MAT.iron);
    stem.position.set(bx, 0.55, bz);
    root.add(stem);
    const fire = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff9a3c })
    );
    fire.position.set(bx, 1.45, bz);
    root.add(fire);
    const light = new THREE.PointLight(0xffa348, 6, 16, 2);
    light.position.set(bx, 1.6, bz);
    root.add(light);
    flickers.push({ light, fire, base: 6, seed: Math.random() * 10 });
  }

  // --- straw butts --------------------------------------------------------
  const makeTarget = (x, z, yaw, scale = 1) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    g.scale.setScalar(scale);

    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), MAT.wood);
    stand.position.set(0, 0.5, 0.12);
    g.add(stand);

    // Butt body; its flat face looks down the group's -Z.
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.22, 20), MAT.straw);
    butt.rotation.x = Math.PI / 2;
    butt.position.set(0, 1.35, 0);
    butt.castShadow = true;
    butt.name = 'target';
    butt.userData.target = { group: g, maxR: 0.62 };
    g.add(butt);
    colliders.push(butt);
    targets.push(butt);

    const ring = (r, mat, zo) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat);
      m.position.set(0, 1.35, -0.112 - zo);
      g.add(m);
    };
    ring(0.44, MAT.ringRed, 0.001);
    ring(0.26, MAT.straw, 0.002);
    ring(0.12, MAT.ringGold, 0.003);

    root.add(g);
    return butt;
  };

  makeTarget(0, -11.5, 0, 1.0);
  makeTarget(-6, -11.0, 0.35, 1.0);
  makeTarget(6.5, -10.5, -0.4, 0.85);
  makeTarget(-11.5, 2, Math.PI / 2, 1.0);
  makeTarget(11.5, -1, -Math.PI / 2, 1.15);

  // --- lighting -----------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0x7f8fa6, 0x2a2622, 0.55));
  const moon = new THREE.DirectionalLight(0xbfd2ff, 0.8);
  moon.position.set(-8, 14, 6);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
  moon.shadow.camera.updateProjectionMatrix();
  scene.add(moon);

  scene.fog = new THREE.FogExp2(0x14161c, 0.022);

  // The world is static: resolve world matrices once so arrow raycasts are
  // correct even on the first frame, before any render has run.
  root.updateMatrixWorld(true);

  return {
    root,
    colliders,
    targets,
    update(t) {
      for (const f of flickers) {
        const v = 0.78 + 0.22 * Math.sin(t * 9 + f.seed) * Math.sin(t * 3.7 + f.seed * 2);
        f.light.intensity = f.base * v;
        f.fire.scale.setScalar(0.85 + 0.25 * v);
      }
    },
  };
}

/** Ring score for a hit on a straw butt: 10 / 7 / 4 / 1. */
export function scoreHit(targetMesh, point) {
  const g = targetMesh.userData.target?.group;
  if (!g) return 0;
  const local = g.worldToLocal(point.clone());
  const r = Math.hypot(local.x, local.y - 1.35);
  if (r <= 0.12) return 10;
  if (r <= 0.26) return 7;
  if (r <= 0.44) return 4;
  return 1;
}
