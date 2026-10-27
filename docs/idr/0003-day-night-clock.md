# IDR 0003: the day and night clock

Date: 2026-10-27

Status: accepted

## Context

Issue TheBabaYaga/herdhouse#1 asks for a light that follows the local clock. The user approved the look on 27 October 2026 (`INTENT.md` decision 35). This record holds the technical choices of the build.

## Decision

- `daylight(min)` is pure, in `model.js`, so a Node test covers it. The name is not `sky()`, because `SKY` is the window material in `office.js`.
- It blends six key rows in a cycle: after 21:00 comes 06:00 of the next day. Colors blend per sRGB channel. The 15:00 row is the reference day look of decision 9.
- `night(on)` writes `CASTLE` or `daylight(clock())`. `update()` calls it on each update, after the build check. So the existing 60 s timer moves the light with no new timer and no rebuild.
- `sun.castShadow` is off while `sunPower` is 0, so the GPU draws no shadow pass at night.
- The night rows use the castle night colors, with `ambientPower` 1.5 and no sun. At 1.3 the `done` paper (`MeshLambertMaterial`) read pale grey-blue at 23:00, darker than in the castle night. 1.5 reaches the castle level. A darker night makes the paper hard to read.
- The 18:00 row has `dir` [-10, 5, 2] (about 26 degrees high), not [-10, 2, 1] (about 11 degrees). At 11 degrees the 2.6 m west wall shaded almost all floor at 18:30.
- The 18:00 row has `ambient` '#ffb47a' and `sunPower` 2.0. The camera sees the faces that turn away from a west sun, so the hemisphere color sets the floor color. With the pale '#ffd2a8' the floor read brown, not orange.
- `lightning()` keeps its own constants. They equal `CASTLE`.
