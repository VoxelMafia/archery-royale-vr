import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildDungeon, scoreHit } from './dungeon.js';
import { HandRoleArbiter } from './handRoles.js';
import { BowRig } from './bowRig.js';
import { ArrowManager } from './arrows.js';
import { XRInput, DesktopInput } from './input.js';
import { BowHud } from './hud.js';

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161c);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 200);
const player = new THREE.Group();          // locomotion rig: camera + hands live here
player.position.set(0, 0, 4);
player.add(camera);
scene.add(player);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------------------
// World, bow, arrows
// ---------------------------------------------------------------------------
const dungeon = buildDungeon(scene);
const bowRig = new BowRig(scene);
const arrows = new ArrowManager(scene, dungeon.colliders);
const hud = new BowHud(bowRig.object);
const roles = new HandRoleArbiter();

let score = 0;
let shafts = 0;
arrows.onHit = (obj, point, speed) => {
  if (obj.name === 'target') {
    const pts = scoreHit(obj, point);
    score += pts;
    hud.set({ score, last: `${pts} points  (${speed.toFixed(0)} m/s)` });
  } else {
    hud.set({ last: `thud - ${obj.name || 'stone'}` });
  }
};
bowRig.onRelease = (origin, dir, speed, ratio) => {
  arrows.fire(origin, dir, speed);
  shafts++;
  hud.set({ arrows: shafts, last: `loosed at ${Math.round(ratio * 100)}% draw` });
};

// ---------------------------------------------------------------------------
// Input backends
// ---------------------------------------------------------------------------
const xrInput = new XRInput(renderer, player);
const deskInput = new DesktopInput(renderer.domElement);

const GOLD = new THREE.Color(0xd9b24c);
const PLAIN = new THREE.Color(0x4e3b2a);
function tintHands() {
  for (const h of ['left', 'right']) {
    const mesh = xrInput.hands[h];
    if (mesh?.userData.mat) mesh.userData.mat.color.copy(h === roles.bow ? GOLD : PLAIN);
  }
}

// ---------------------------------------------------------------------------
// Locomotion
// ---------------------------------------------------------------------------
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
let snapCooldown = 0;

function locomote(dt, move) {
  if (snapCooldown > 0) snapCooldown -= dt;
  if (move.turn && snapCooldown <= 0) {
    player.rotateY(-move.turn * CONFIG.player.snapTurn);
    snapCooldown = 0.28;
  }
  if (!move.x && !move.y) return;

  camera.getWorldDirection(_fwd);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-6) return;
  _fwd.normalize();
  _right.set(_fwd.z, 0, -_fwd.x);

  const s = CONFIG.player.speed * dt;
  player.position.addScaledVector(_fwd, move.y * s);
  player.position.addScaledVector(_right, -move.x * s);
  // Keep the archer inside the courtyard.
  player.position.x = THREE.MathUtils.clamp(player.position.x, -12.6, 12.6);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -12.6, 12.6);
}

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let t = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;

  const presenting = renderer.xr.isPresenting;
  const input = presenting
    ? xrInput.read(camera)
    : deskInput.read(camera, dt, roles.bow);

  // 1. Who holds what (frozen while the string is nocked).
  if (roles.update(dt, input.head.pos, input, bowRig.locked)) deskInput.claimT = 0;
  if (presenting) tintHands();

  // 2. Bow: anchored to the grip hand, aimed by grip<-string vector, canted
  //    by the grip hand's own twist.
  bowRig.update(dt, input[roles.bow], input[roles.draw]);

  // 3. Arrows, world, HUD.
  arrows.update(dt);
  dungeon.update(t);
  hud.set({ bow: roles.bow, draw: roles.draw, ratio: bowRig.ratio, claim: roles.progress });
  hud.render();

  locomote(dt, input.move);
  updateOverlay(presenting);

  renderer.render(scene, camera);
});

// ---------------------------------------------------------------------------
// DOM overlay: enter-VR button + desktop controls + live readout
// ---------------------------------------------------------------------------
const overlay = document.getElementById('overlay');
const readout = document.getElementById('readout');
const vrBtn = document.getElementById('vrBtn');

if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    vrBtn.disabled = !ok;
    vrBtn.textContent = ok ? 'Enter VR' : 'No VR headset detected';
  });
} else {
  vrBtn.disabled = true;
  vrBtn.textContent = 'WebXR unavailable (use HTTPS / localhost)';
}

vrBtn.addEventListener('click', async () => {
  if (renderer.xr.isPresenting) return;
  try {
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
    });
    await renderer.xr.setSession(session);
    overlay.classList.add('hidden');
    session.addEventListener('end', () => overlay.classList.remove('hidden'));
  } catch (err) {
    vrBtn.textContent = `VR failed: ${err.message}`;
  }
});

// Capture the pointer -> get the briefing out of the way.
document.addEventListener('pointerlockchange', () => {
  overlay.classList.toggle('hidden', document.pointerLockElement === renderer.domElement);
});

let overlayTick = 0;
function updateOverlay(presenting) {
  if (presenting) return;
  if ((overlayTick = (overlayTick + 1) % 6) !== 0) return;
  readout.textContent =
    `bow ${roles.bow}  |  string ${roles.draw}  |  draw ${Math.round(bowRig.ratio * 100)}%` +
    `  |  head-dist L ${fmt(roles.headDist.left)} R ${fmt(roles.headDist.right)}` +
    `  |  score ${score}  |  shafts ${shafts}`;
}
const fmt = (v) => (Number.isFinite(v) ? v.toFixed(2) : '--');

// Live handles for tuning from the devtools console, e.g.
//   __AR.config.draw.maxSpeed = 95
window.__AR = {
  config: CONFIG, roles, bowRig, arrows, dungeon, player, camera, renderer,
  stats: () => ({
    bow: roles.bow, string: roles.draw, draw: +bowRig.ratio.toFixed(3),
    nocked: bowRig.nocked, claim: +roles.progress.toFixed(2),
    headDist: { left: +roles.headDist.left.toFixed(3), right: +roles.headDist.right.toFixed(3) },
    live: arrows.live.length, score, shafts,
  }),
};
