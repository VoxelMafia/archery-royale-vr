# Lessons

Patterns to keep applying on this project. Reviewed at session start.

## 2026-11-16 — "you're stuck?"

**What happened.** The working directory was empty, so the first inspection
command returned nothing and exited non-zero. I had queued a plan-mode /
plan-approval step before writing any code, and from the user's side that read
as being stuck.

**Rule.** An empty directory plus a detailed brief is not ambiguity — it is a
greenfield build. Start building. Reserve the plan-and-confirm loop for work
that touches existing code or where a wrong assumption is expensive. Say in one
line what the non-result meant ("folder is empty") instead of letting a bare
error stand.

## 2026-11-16 — Verify the mechanic, don't eyeball it

**What happened.** The browser preview pane throttles `requestAnimationFrame`
when hidden, so frame-sampled readings showed "draw 0%" and looked like a bug
that wasn't there. Separately, a screenshot made the bow look mis-aimed when it
was exact — the pane captured 800x600 of a 1024x768 canvas.

**Rule.** For 3D/VR work, assert on numbers (dot products, angles, projected
NDC) in a headless test; use screenshots only to judge art. Low FPS in a hidden
pane is an artifact of the harness, not of the code — check frame rate before
blaming the mechanic.

## 2026-11-16 — Degenerate reference axes in orientation math

**What happened.** Deriving the bow's roll from "a fixed hand axis
orthogonalised against the aim vector" silently collapsed when that axis lined
up with the aim — precisely the drawn pose it existed to serve.

**Rule.** When mapping a held object onto a direction, prefer minimal-swing
(`setFromUnitVectors(currentForward, targetForward)` premultiplied onto the
hand's own rotation) over building an up/forward basis. It has no reference
axis to go singular, and it preserves the hand's twist exactly. Always test the
degenerate pose explicitly.

## 2026-11-16 — Take the spec's intent, state the deviation

**What happened.** "Hand closer to the head holds the bow", applied literally
every frame, flips the bow into the draw hand on every shot.

**Rule.** Implement what the mechanic needs, keep the literal reading behind a
config flag, add a test that demonstrates why it was rejected, and say so in
one short paragraph. Don't silently "fix" a brief, and don't build something
known-broken either.
