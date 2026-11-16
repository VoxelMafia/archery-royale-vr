/**
 * Headless checks for the parts that matter: hand-role arbitration, the bow's
 * grip-anchored aim/cant, release energy and arrow hit scoring.
 *   node tests/logic.test.mjs
 */
import * as THREE from 'three';
import { CONFIG } from '../src/config.js';
import { HandRoleArbiter } from '../src/handRoles.js';
import { BowRig } from '../src/bowRig.js';
import { ArrowManager } from '../src/arrows.js';
import { buildDungeon, scoreHit } from '../src/dungeon.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

const pose = (x, y, z, { trigger = 0, squeeze = 0, quat = new THREE.Quaternion() } = {}) => ({
  pos: new THREE.Vector3(x, y, z),
  quat,
  trigger, squeeze,
  pull: Math.max(trigger, squeeze),
  pulse() {},
});

const HEAD = new THREE.Vector3(0, 1.6, 0);
const DT = 1 / 72;
const step = (fn, n) => { for (let i = 0; i < n; i++) fn(); };

// ---------------------------------------------------------------------------
console.log('\nhand-role arbitration');
{
  const a = new HandRoleArbiter();
  ok('starts with bow in the left hand', a.bow === 'left' && a.draw === 'right');

  // Shooting pose: bow arm extended, string hand at the cheek (nearest head).
  // This MUST NOT hand the bow to the string hand.
  const hands = {
    left: pose(-0.1, 1.5, -0.6),
    right: pose(0.12, 1.58, -0.05),
  };
  step(() => a.update(DT, HEAD, hands, false), 120);
  ok('a normal draw pose never steals the bow', a.bow === 'left', `-> ${a.bow}`);

  // Claim gesture: right hand up at the head with grip held.
  const claim = {
    left: pose(-0.1, 1.5, -0.6),
    right: pose(0.14, 1.55, -0.12, { squeeze: 1 }),
  };
  let switched = false;
  step(() => { switched = a.update(DT, HEAD, claim, false) || switched; }, 60);
  ok('grip-at-head claims the bow', switched && a.bow === 'right' && a.draw === 'left', `-> ${a.bow}`);

  // Same claim, but the string is nocked: roles are frozen.
  const b = new HandRoleArbiter();
  step(() => b.update(DT, HEAD, claim, true), 120);
  ok('roles are frozen mid-shot', b.bow === 'left');

  // Claim needs the dwell time, not a single frame.
  const c = new HandRoleArbiter();
  const one = c.update(DT, HEAD, claim, false);
  ok('a one-frame touch does not switch', !one && c.progress > 0 && c.progress < 1);

  // Out of reach of the head -> no claim, however hard you squeeze.
  const d = new HandRoleArbiter();
  const far = { left: pose(-0.1, 1.5, -0.6), right: pose(0.3, 1.2, -0.6, { squeeze: 1 }) };
  step(() => d.update(DT, HEAD, far, false), 120);
  ok('grip away from the head does nothing', d.bow === 'left');

  // Literal 'continuous' mode for comparison: it does flip mid-draw.
  CONFIG.hands.mode = 'continuous';
  const e = new HandRoleArbiter();
  step(() => e.update(DT, HEAD, hands, false), 120);
  ok("'continuous' mode flips on the draw (documented trade-off)", e.bow === 'right');
  CONFIG.hands.mode = 'claim';
}

// ---------------------------------------------------------------------------
console.log('\nbow rig: grip anchor, aim, cant');
const scene = new THREE.Scene();
const rig = new BowRig(scene);
{
  const grip = pose(-0.2, 1.5, -0.6);
  const draw = pose(-0.2, 1.5, -0.45, { trigger: 1 });

  // You have to reach the string before you can nock it...
  step(() => rig.update(DT, grip, draw), 4);
  ok('the string nocks on trigger', rig.nocked);
  // ...then the hand travels back to full draw.
  draw.pos.set(-0.2, 1.5, 0.0);
  step(() => rig.update(DT, grip, draw), 180);
  ok('bow stays anchored at the grip hand',
    rig.object.position.distanceTo(grip.pos) < 1e-6);

  const expectAim = new THREE.Vector3().subVectors(grip.pos, draw.pos).normalize();
  ok('aim axis is grip - string hand', rig.aim.distanceTo(expectAim) < 1e-6,
    `${rig.aim.toArray()}`);

  const bowFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(rig.object.quaternion);
  ok("bow's own forward tracks the aim axis", bowFwd.distanceTo(expectAim) < 2e-3,
    `${bowFwd.toArray()}`);

  const span = CONFIG.draw.max - CONFIG.draw.rest;
  const expectRatio = Math.min(1, (0.6 - CONFIG.draw.rest) / span);
  ok('draw ratio follows hand separation', near(rig.ratio, expectRatio, 1e-6),
    `${rig.ratio} vs ${expectRatio}`);

  // Cant: twist the grip hand 40 deg about the aim axis -> bow rolls with it.
  const upBefore = new THREE.Vector3(0, 1, 0).applyQuaternion(rig.object.quaternion);
  const twist = new THREE.Quaternion().setFromAxisAngle(expectAim, THREE.MathUtils.degToRad(40));
  grip.quat.premultiply(twist);
  step(() => rig.update(DT, grip, draw), 240);
  const upAfter = new THREE.Vector3(0, 1, 0).applyQuaternion(rig.object.quaternion);
  const rolled = THREE.MathUtils.radToDeg(upBefore.angleTo(upAfter));
  ok('grip twist rolls the bow on its anchor', near(rolled, 40, 1.5), `${rolled.toFixed(2)} deg`);

  const stillAim = new THREE.Vector3(0, 0, -1).applyQuaternion(rig.object.quaternion);
  ok('cant does not disturb the aim', stillAim.distanceTo(expectAim) < 3e-3);

  // Release
  let shot = null;
  rig.onRelease = (origin, dir, speed, ratio) => { shot = { origin, dir, speed, ratio }; };
  draw.trigger = 0;
  rig.update(DT, grip, draw);
  const expectSpeed = THREE.MathUtils.lerp(CONFIG.draw.minSpeed, CONFIG.draw.maxSpeed, expectRatio);
  ok('release fires one arrow', !!shot);
  ok('muzzle speed scales with draw', shot && near(shot.speed, expectSpeed, 1e-6),
    shot && `${shot.speed.toFixed(1)} vs ${expectSpeed.toFixed(1)}`);
  ok('arrow leaves along the aim axis', shot && shot.dir.distanceTo(expectAim) < 1e-6);
  ok('the string is released', !rig.nocked && rig.ratio === 0);

  // A feather-touch draw should not loose a shaft.
  shot = null;
  const g2 = pose(0, 1.5, -0.22);
  const d2 = pose(0, 1.5, 0.0, { trigger: 1 });
  step(() => rig.update(DT, g2, d2), 10);
  d2.trigger = 0;
  rig.update(DT, g2, d2);
  ok('a 5% draw does not shoot', shot === null);
}

// ---------------------------------------------------------------------------
console.log('\narrows and scoring');
{
  const s2 = new THREE.Scene();
  const dungeon = buildDungeon(s2);
  s2.updateMatrixWorld(true);
  const arrows = new ArrowManager(s2, dungeon.colliders);
  const butt = dungeon.targets[0];           // centred at x 0, z -11.5, y 1.35
  const centre = new THREE.Vector3();
  butt.getWorldPosition(centre);

  let hit = null;
  arrows.onHit = (obj, point, speed) => { hit = { obj, point, speed }; };

  // Flat, fast shot straight into the gold, gravity compensated by aiming high.
  const origin = new THREE.Vector3(0, 1.35, -1.5);
  const dist = Math.abs(centre.z - origin.z);
  const speed = 80;
  const tof = dist / speed;
  const drop = 0.5 * -CONFIG.arrow.gravity * tof * tof;
  const dir = new THREE.Vector3(0, drop / dist, -1).normalize();
  arrows.fire(origin, dir, speed);
  step(() => arrows.update(DT), 40);

  ok('the arrow hits the butt', hit && hit.obj.name === 'target', hit ? hit.obj.name : 'no hit');
  if (hit) {
    const pts = scoreHit(hit.obj, hit.point);
    ok('gold counts 10', pts === 10, `scored ${pts}`);
    ok('it slows in flight', hit.speed < speed, `${hit.speed.toFixed(1)} m/s`);
    ok('the shaft sticks where it landed', arrows.live.length === 1 && arrows.live[0].stuck);
  }

  // Stone stops arrows too.
  hit = null;
  arrows.fire(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 0, -1), 70);
  step(() => arrows.update(DT), 60);
  ok('a miss buries itself in the keep wall', hit && ['wall', 'target'].includes(hit.obj.name),
    hit ? hit.obj.name : 'no hit');

  // Spent shafts are recycled, not leaked.
  const before = arrows.live.length;
  step(() => arrows.update(DT), Math.ceil(CONFIG.arrow.stuckLife / DT) + 5);
  ok('spent shafts are pooled', arrows.live.length === 0 && arrows.pool.length >= before,
    `live ${arrows.live.length} pool ${arrows.pool.length}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
