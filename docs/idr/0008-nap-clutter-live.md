# IDR 0008: the west clutter item stays live

Date: 2026-10-31

Status: accepted

## Context

The office cat naps on the west end of an idle desk (`INTENT.md` decision 41). The cat sits on the spot of the west clutter item. So the item must hide while the cat jumps and naps. `bake()` merges each static mesh into one mesh for each material, so a merged item cannot hide alone.

Each worker is already live, with about 25 to 40 meshes. The demo office has 8 agent desks, so the choice below adds about 15 meshes to a scene of several hundred live meshes. A shell desk never gets a visit, so its west item still merges.

```text
Example: desk w1:p2 has a mug at x -0.72 (west). The cat naps at x -0.7 on that desk.
         Merged mug: it stays on the desk and shows through the cat.
         Live mug:   moveCat() sets v.west.visible = false at 162.9 s and true at 280.4 s.
```

## Decision

- `clutter(g, seed)` draws the west item into its own group and returns that group. The east item stays in `g`.
- `desk()` adds that group to `live` when `d.agent` is set, and stores it as `v.west`. A shell desk has `west: null`.
- Each door leaf also gets a static dark cat flap. It is a child of the hinge, so it turns with the leaf. It is not part of this choice, because it never changes.

```text
Method                                   Draw calls                      Code              Result
1. The west item of each agent desk      + 1 to 3 meshes per agent desk  about 4 lines     chosen
   stays in live (v.west)                (item 5 adds none)
2. Re-merge all west items at each nap   + about 10 (one per color)      about 30 lines:   rejected: more code for a few draw calls
   start and nap end (a second bake)                                     source groups,
                                                                         dispose, re-merge
3. Collapse the vertex range of the      + 0                             bake() records    rejected: couples bake() to clutter(),
   item in the merged buffer                                             ranges per desk   and a wrong range breaks other meshes
4. Rebuild the scene at each nap start   + 0                             the nap desk      rejected: a rebuild disposes everything,
   and nap end (the nap desk in sig)                                     in sig            resets the screens, and stalls twice a visit
5. Move the nap off the clutter          + 0                             0                 rejected: the spec wants the west item hidden,
                                                                                           and the east end has the mouse (x 0.47)
```

## Consequences

- Method 1 costs about 15 draw calls in the demo office (8 agent desks, 1 to 3 meshes each, item 5 none).
- A rebuild makes a new desk group, and the old west group is gone. The scene code must set `v.west.visible` at each frame, not once at the nap start.
- A new clutter item must draw into the group that `clutter()` passes to `CLUTTER[a]`, so it can hide.
