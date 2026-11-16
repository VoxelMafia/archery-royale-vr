import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildDungeon, scoreHit } from './dungeon.js';
import { HandRoleArbiter } from './handRoles.js';
import { BowRig } from './bowRig.js';
import { ArrowManager } from './arrows.js';
import { XRInput, DesktopInput } from './input.js';
import { BowHud } from './hud.js';
import { PlayerBody } from './playerBody.js';
import { SwingJump } from './jump.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
const body = new PlayerBody(player);
const swingJump = new SwingJump();

// The black bow replaces the procedural stand-in as soon as it arrives, so a
// slow download (or a missing file) never blocks the prototype.
new GLTFLoader().load(
  CONFIG.bow.modelUrl,
  (gltf) => {
    const fit = bowRig.useModel(gltf.scene);
    console.info(`[bow] model fitted: scale ${fit.scale.toFixed(4)}, tips +/-${fit.tipY.toFixed(3)} m`);
  },
  undefined,
  (err) => console.warn('[bow] model failed, keeping the stand-in:', err?.message || err)
);

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

const _pivot = new THREE.Vector3();

/**
 * Turning rotates the rig about the HEAD, not about the rig's origin. Spin a
 * room-scale rig around its origin and the player gets swung sideways through
 * the room, which is a reliable way to make someone ill; about the head, the
 * world turns around them and they stay put.
 */
function turn(dt, axis) {
  const p = CONFIG.player;
  if (p.turnMode === 'snap') {
    if (snapCooldown > 0) snapCooldown -= dt;
    if (Math.abs(axis) > 0.8 && snapCooldown <= 0) {
      rotateAboutHead(-Math.sign(axis) * p.snapTurn);
      snapCooldown = 0.28;
    }
    return;
  }
  if (Math.abs(axis) < p.turnDeadzone) return;
  // Re-map past the deadzone so there is no step at the edge of it.
  const a = (Math.abs(axis) - p.turnDeadzone) / (1 - p.turnDeadzone);
  rotateAboutHead(-Math.sign(axis) * a * a * p.turnSpeed * dt);
}

function rotateAboutHead(angle) {
  camera.getWorldPosition(_pivot);
  player.position.sub(_pivot);
  player.position.applyAxisAngle(UP, angle);
  player.position.add(_pivot);
  player.rotateY(angle);
}

const UP = new THREE.Vector3(0, 1, 0);

function locomote(dt, move) {
  turn(dt, move.turnAxis);
  if (!move.x && !move.y) return;

  camera.getWorldDirection(_fwd);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-6) return;
  _fwd.normalize();
  _right.set(_fwd.z, 0, -_fwd.x);

  const s = CONFIG.player.speed * dt * body.controlScale;
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

// three re-arms its animation loop *after* the callback returns, so a single
// thrown frame kills rendering for good -- in a headset that reads as a freeze.
// Catch, report once, keep drawing.
let frameErrors = 0;
renderer.setAnimationLoop(() => {
  try { frame(); } catch (err) {
    if (frameErrors++ === 0) console.error('[frame]', err);
    window.__frameError = String(err?.stack || err);
  }
});

function frame() {
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

  // 3. Swing the free hand down to launch, again in the air to catch
  //    yourself, hold it overhead to sink slowly.
  swingJump.update(dt, bowRig.nocked ? null : input[roles.draw], input.head.pos, body);
  body.update(dt, swingJump.floating);

  // 4. Arrows, world, HUD.
  arrows.update(dt);
  dungeon.update(t);
  hud.set({
    bow: roles.bow, draw: roles.draw, ratio: bowRig.ratio, claim: roles.progress,
    grab: bowRig.canGrab, air: !body.grounded, flaps: body.flapsUsed,
    glide: swingJump.floating,
  });
  hud.render();

  locomote(dt, input.move);
  updateOverlay(presenting);

  renderer.render(scene, camera);
}

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
    `  |  grab ${fmt(bowRig.grabDist)}${bowRig.canGrab ? ' *' : ''}` +
    `  |  y ${player.position.y.toFixed(2)} vy ${body.vel.y.toFixed(1)} flaps ${body.flapsUsed}` +
    `${swingJump.floating ? ' float' : ''}  |  score ${score}  |  shafts ${shafts}`;
}
const fmt = (v) => (Number.isFinite(v) ? v.toFixed(2) : '--');

// Live handles for tuning from the devtools console, e.g.
//   __AR.config.draw.maxSpeed = 95
window.__AR = {
  config: CONFIG, roles, bowRig, arrows, dungeon, player, camera, renderer, body, swingJump,
  input: { xr: xrInput, desktop: deskInput },
  error: () => window.__frameError || null,
  stats: () => ({
    bow: roles.bow, string: roles.draw, draw: +bowRig.ratio.toFixed(3),
    nocked: bowRig.nocked, claim: +roles.progress.toFixed(2),
    headDist: { left: +roles.headDist.left.toFixed(3), right: +roles.headDist.right.toFixed(3) },
    live: arrows.live.length, score, shafts,
    canGrab: bowRig.canGrab, grabDist: +bowRig.grabDist.toFixed(3),
    y: +player.position.y.toFixed(3), vy: +body.vel.y.toFixed(2),
    grounded: body.grounded, flaps: body.flapsUsed, floating: swingJump.floating,
    swing: +swingJump.swingSpeed.toFixed(2),
  }),
};
