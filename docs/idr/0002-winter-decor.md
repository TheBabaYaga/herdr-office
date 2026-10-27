# IDR 0002: the winter decor

Date: 2026-10-26

Status: accepted

## Context

Issue TheBabaYaga/herdhouse#11 asks for winter props: a tree in the lobby, snow on the terrace, and snowflakes over each terrace. The user has not yet approved the props (`INTENT.md` "Open items and known limits"). This record holds the technical choices of the build.

## Decision

- The flake logic is pure, in `model.js` (`snowflakes()`, `flakeAt()`, `outdoors()`), so Node tests cover it. `office.js` only moves the instances.
- One `InstancedMesh` shows all flakes (about 2000 outdoors in a 35 x 22 office), so the scene adds one draw call. It has `frustumCulled = false`, because the instances move. Its geometry and material are shared, and `build()` disposes the mesh to free the instance buffer.
- Snow also falls outdoors. `outdoors(bounds)` gives 4 rects in a band round the slab, `Math.max(w, d) / 2 + 3` wide, so the flakes fill the screen corners at the min zoom. The flakes use the terrace density, size, speed, and drift.
- A flake starts 0.3 or more from each terrace edge and drifts 0.1 in x only. The inner-wall rail and the stub cap reach 0.17 into a terrace, and the hedge 0.18, so a flake (half size 0.03) never enters them.
- A rect gets one flake for each cell of a grid of about 2 m² cells, at a random point of the cell, with a random phase from `rng` (seeded from the rect). The code does not use `Math.random()`.
- The R2 spread formed visible rows on the long outdoor strips, so a jittered grid with a random phase replaced it.
- A flake falls from y 2.6 (the wall height) at 0.3 a second, about 8.7 s a fall, then starts again at the top.
- With reduce motion, the flakes fall at half speed (the rule of the Halloween flames). The user has not decided this.
- The snow caps each green block of a terrace that is 0.1 high or more, as direct `box()` calls after `furnish()`. This is one rule, with no snowy copy of a prop. The lily pads stay bare.
- A winter room replaces about a third of its `tree` props with `xmasTree` (25 of 73 in 60 test rooms). The rule picks half of the tries, and the wider tree fails some of them. The rule is `Math.abs(Math.round(x * 7 + z * 13)) % 2` on the spot, as `plant()` picks its kind. No `Math.random()`, so a rebuild gives the same trees. The `xmasTree` stands at rot 0, so the ornaments face the camera.
- `xmasTree` is wider than `tree` (1.3 against 0.9). `foot()` and `put()` measure it, and a tree that does not fit is skipped as any prop. `put()` counts it as `tree`, so the `max` of the pool holds.
- The tree tries the north-west, the north-east, and the south-west corner of the lobby through `put()`, before the plants and the fill. With no free corner, the lobby has no tree.
- The flake mesh is in `live`, with shadows on.
- The tree bulbs glow: unlit shared materials, and one additive halo sprite for each bulb (the method of the candle halos, no three.js light). The halo phase comes from `rng` seeded with the tree position, not from `hash()` of the bulb, because `hash` gives near phases for near strings. This is an exception to decision 25, and the user approved it with the winter decor (decision 34 in `INTENT.md`).
- With reduce motion, the bulbs swing at half strength (`twinkle(ph, t, 0.5)`), as the candle flames do.
- The winter sweater keeps the shirt color, because the shirt shows the agent kind. The knit is off-white or navy, not red or green, because red and green are status colors (blocked and idle). Navy replaces off-white on a light shirt, so the knit stays visible.

## Consequences

- The tree changes the corner plants and the fill of a winter lobby.
- A flake passes through each garden prop.
- The demo has no terrace, so it shows the tree and the outdoor snow.
- A rebuild replaces the world and the flakes.
