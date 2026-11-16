# Archery Royale — VR bow prototype

## Plan

- [x] Scaffold: three.js via importmap, no build step, static server
- [x] Hand-role arbitration (ArenaWars-style handle swap)
- [x] Bow rig: grip anchor, draw state machine, aim + cant
- [x] Bow/arrow meshes with a string that deforms on draw
- [x] Arrow ballistics, segment raycast hits, stick-in-surface, pooling
- [x] Medieval dungeon courtyard + straw butts with ring scoring
- [x] Desktop fallback driving the same code path as VR
- [x] Diegetic HUD on the lower limb
- [x] Headless tests for the mechanics
- [x] Verify in a real browser (draw → loose → score → hand swap)

## Review

**Delivered.** `npm run serve`, open <http://localhost:8080>. 25/25 headless
checks pass (`npm test`). Verified live in-browser: full draw → loose → arrow
stuck in the butt for 4 points → bow handed from left hand to right via the
claim gesture.

**Design call worth knowing about.** The brief said "left hand closer to head →
left hand holds the bow". Evaluated every frame that is self-defeating: with
the bow arm extended, the hand nearest the head is always the string hand at
the cheek, so the bow would jump hands on every shot. Implemented instead as a
*claim gesture* — hand to the head **with grip held**, 0.2 s dwell, frozen
while nocked. The literal reading is kept behind
`CONFIG.hands.mode = 'continuous'`, with a test asserting it flips mid-draw.

**Two real bugs found by testing, not by reading:**

1. Bow cant was derived from a fixed hand axis that goes degenerate when it
   lines up with the aim direction — i.e. exactly when you draw along your arm.
   Replaced with a minimal-swing construction: the bow keeps the hand's
   orientation and is rotated by the shortest arc onto the aim line, so wrist
   twist maps to roll about the aim axis *exactly* (verified at 40°).
2. Arrow raycasts used stale world matrices before the first render, and a
   pillar sat squarely in the main firing lane. Fixed both.

## Next

- [ ] Quiver: reach over the shoulder to draw an arrow, instead of infinite nocks
- [ ] Bow collision/penetration so you can't shoot through the riser or walls
- [ ] Arrow types (broadhead / bodkin / rope) for the extraction loop
- [ ] Comfort options: vignette, snap-turn angle, seated recentre
- [ ] Networked shots (authority on the shooter, lag-compensated hit volumes)
- [ ] Replace procedural geometry with art once the feel is locked
