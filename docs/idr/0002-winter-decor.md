# IDR 0002: the winter decor

Date: 2026-10-26

Status: accepted

## Context

Issue TheBabaYaga/herdhouse#11 asks for winter props: a tree in the lobby, snow on the terrace, and snowflakes over each terrace. The user has not yet approved the props (`INTENT.md` "Open items and known limits"). This record holds the technical choices of the build.

## Decision

- The flake logic is pure, in `model.js` (`snowflakes()`, `flakeAt()`), so Node tests cover it. `office.js` only moves the meshes.
- A flake starts 0.3 or more from each terrace edge and drifts 0.1 in x only. The inner-wall rail and the stub cap reach 0.17 into a terrace, and the hedge 0.18, so a flake (half size 0.03) never enters them.
- A terrace gets `Math.round(w * d / 2)` flakes, spread with the R2 steps (0.7549, 0.5698). The code does not use `Math.random()`.
- A flake falls from y 2.6 (the wall height) at 0.3 a second, about 8.7 s a fall, then starts again at the top.
- With reduce motion, the flakes fall at half speed (the rule of the Halloween flames). The user has not decided this.
- The snow caps each green block of a terrace that is 0.1 high or more, as direct `box()` calls after `furnish()`. This is one rule, with no snowy copy of a prop. The lily pads stay bare.
- The tree tries the north-west, the north-east, and the south-west corner of the lobby through `put()`, before the plants and the fill. With no free corner, the lobby has no tree.
- Each flake is one mesh, in `live`, with shadows on. An `InstancedMesh` is the upgrade if the frame rate drops.

## Consequences

- The tree changes the corner plants and the fill of a winter lobby.
- A flake passes through each garden prop.
- The demo has no terrace, so it shows only the tree.
- A rebuild replaces the world and the flakes.
