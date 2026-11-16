# Archery Royale — VR Bow & Arrow Prototype

A three.js / WebXR prototype of the bow for **Archery Royale**, an extraction
shooter set in an open medieval dungeon. No build step, no assets — open it and
shoot.

**Live build:** <https://voxelmafia.github.io/archery-royale-vr/>

On a Quest 3: open that URL in the headset browser and press **Enter VR**.
GitHub Pages serves it over HTTPS, which is all WebXR needs — no sideloading,
no cable. Every push to `main` redeploys it.

```bash
npm run serve        # http://localhost:8080 (local dev)
npm test             # 25 headless checks of the mechanics
```

---

## The mechanics

### 1. Hand switching (rifle-handle swap)

Bring a hand up to your head **holding GRIP** and that hand takes the bow; the
other hand becomes the string hand. Hold it for 0.2 s and the swap commits —
the same deliberate handle-grab as switching rifle handles in ArenaWars.

**Why a gesture and not a raw distance test.** The brief was "hand closer to
the head holds the bow". Taken literally and evaluated every frame, that breaks
as soon as you shoot: once the bow arm is extended, the hand nearest your head
is *always* the string hand at your cheek, so the bow would teleport into your
draw hand on every single shot. So the proximity test is used as the *claim*,
latched: near the head + grip held + a short dwell ⇒ that hand owns the bow,
and it keeps it until you make the gesture again. Roles are additionally frozen
while the string is nocked, so a shot can never flip mid-draw.

The literal every-frame reading is still in the box — set
`CONFIG.hands.mode = 'continuous'` in [src/config.js](src/config.js) and it
behaves exactly as described above (there's a test asserting it flips, so the
trade-off is documented rather than argued about).

### 2. Draw

An arrow is always sitting on the string, part-drawn. You reach for its **nock**
(within 17 cm) and squeeze the trigger to take hold of it — the draw follows
your hand from there, so you are pulling the arrow rather than pressing a
button near the bow. The arrow's tail is welded to the string's nocking point
and only its head swings aside to clear the riser (archer's paradox), so shaft
and string are never apart. Hand separation drives the draw:

```
drawLen = clamp(|grip − string| − rest, 0, max − rest)      rest 0.20 m, max 0.62 m
speed   = lerp(24, 82, drawLen / span)                      m/s
```

Release the trigger to loose. Under 12 % draw the arrow just flops out.
Haptics tick every 20 % of draw (bow limb creak) and thump on release.

### 3. Bow tilt on the grip anchor

The bow's **position** is welded to the grip hand — it never leaves the palm.
Its **rotation** is rebuilt every frame while drawn:

- the shooting axis is `grip − stringHand`, so pulling the string past your
  cheek is what aims the bow;
- the bow is taken *exactly as the grip hand holds it* and rotated by the
  shortest arc onto that axis (minimal swing), so any twist of the grip wrist
  survives as a roll **around the aim line** — cant the wrist, the bow cants on
  its own grip, and the aim does not move.

Minimal swing is used instead of building an up/forward basis because any fixed
"up" reference goes degenerate when it lines up with the aim direction — which
is exactly what happens when you draw straight along your arm. (That was a real
bug here; `npm test` has the case that caught it.)

Undrawn, the bow simply follows the grip hand pose.

### 4. Feather jump

Hold the feather (grip, away from your head) and swing your hand **down**. The
flap reads the hand's real world-space velocity over a ~60 ms window, so a lazy
wave is a hop and a hard beat is a launch. A second flap in mid-air *sets*
upward velocity rather than adding to it, which cancels the fall and catches
you cleanly. Hold the feather above your head on the way down and gravity drops
to a fifth with a 1.6 m/s terminal fall. Landings are absorbed by a critically
damped spring instead of snapping to the floor — a hard stop at ground level
reads as a jolt through the whole view in VR.

Turning rotates the rig about the **head**, not the rig origin, so a room-scale
player is not swung sideways through their room as they turn.

### 5. The bow model

`assets/black_bow.glb` is fitted at load: its limb axis, string plane and
overall size are measured from the geometry, then it is rotated upright, scaled
to `CONFIG.bow.length` (1.72 m tip to tip) and shifted so the grip lands on the
origin one brace height in front of the string. Its own string mesh is dropped —
ours has to bend — and its materials are replaced with flat black. Nothing is
hardcoded to this particular model; drop in another bow and it refits itself.
Until it loads (or if it fails), the procedural stand-in is used.

---

## Controls

| | VR | Desktop |
|---|---|---|
| Hand off the bow | hand to head + **grip** | **Q** |
| Nock & draw | **trigger**, string hand | hold **LMB** |
| Loose | release trigger | release **LMB** |
| Cant the bow | twist the grip wrist | **Z** / **C** |
| Jump (feather) | hold **grip**, swing the hand down | **Space** |
| Double jump | swing again in mid-air | **Space** again |
| Feather-fall | hold the feather above your head | — |
| Move | left thumbstick | **WASD** |
| Turn | right thumbstick (smooth) | mouse or **← →** |

The desktop fallback simulates a head and two hands and feeds them through the
*same* role arbiter and bow rig as VR — **Q** literally poses the free hand at
the head with grip held rather than setting a flag, so what you test on a
monitor is the headset code path.

## Layout

| file | what it owns |
|---|---|
| [src/config.js](src/config.js) | every tuning number |
| [src/handRoles.js](src/handRoles.js) | which hand holds what |
| [src/bowRig.js](src/bowRig.js) | grip anchor, aim, cant, draw, release |
| [src/bow.js](src/bow.js) | bow + arrow meshes, string deformation |
| [src/arrows.js](src/arrows.js) | ballistics, segment-raycast hits, pooling |
| [src/dungeon.js](src/dungeon.js) | courtyard, braziers, straw butts, scoring |
| [src/input.js](src/input.js) | WebXR controllers + desktop simulation |
| [src/hud.js](src/hud.js) | diegetic panel on the lower limb |
| [src/main.js](src/main.js) | wiring, locomotion, frame loop |

`window.__AR` is live in the console for tuning:
`__AR.config.draw.maxSpeed = 95`, `__AR.stats()`.

## Not in this prototype

Multiplayer, extraction/loot loop, arrow types, player damage, bow collision
with the world, quiver-over-the-shoulder arrow retrieval, and proper art.
Locomotion is free-stick with no comfort vignette.
