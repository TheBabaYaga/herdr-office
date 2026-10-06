# public/decor.js: voxel helpers and room decor

`public/decor.js` draws the props of each room kind and the desk clutter. It also owns `box()` and the material cache for the whole scene. It imports only `three`, and only `public/office.js` imports it. No test imports it.

Related docs: `docs/office.md` (`build()`, `bake()`, `sig`, `live`, `views`). `docs/model.md` (walk rects, counter, spots, seats). CLAUDE.md "Contracts between the files" (room fields).

## When to read this doc

- Add, move, or remove a prop, or change the desk clutter.
- Add a room kind that needs its own decor.
- Make a prop change color or move at run time.
- Change `box()`, the material cache, a palette color, or `LAMP`.
- Change a room field in `model.js` that decor reads, or the entrance x.

## Module state

| Name | Holds |
|---|---|
| `CUBE` | the one unit `BoxGeometry` of every box. `build()` never disposes it. |
| `MATS` | hex color -> one shared `MeshLambertMaterial` (`userData.shared`). `shared(color)` fills it. |
| `E` | 0.2: the gap from a room edge to the back of a wall prop. |
| `LAMP` | `[-0.5, 0.4]`: the pod lamp post from the pod corner. `placer()` and `office.js` `build()` read it. |
| the palette, the prop makers, `PLANTS`, `GLYPH`, `CLUTTER` | constant data. `office.js` imports `WOOD`, `WOOD_D`, and `CREAM`. |

No state lives for a build or a frame. A decor call reads only its room, and its only effect outside its group `g` is a new `MATS` entry.

## Flow

```text
office.js build()  (only when sig changes)
  plant() at each corridor corner        world coords, no placer()
  each room: DECOR[r.kind](g, r)         g at (r.x, 0, r.z)
             then inner walls, door(r), partyLights(r) for the party room, the lamp posts at p + LAMP
  desk(d): deskChair, clutter(g, hash(d.id, 1e6))
  bake()                                 merges meshes by material: no decor object is in live
```

In a decor function, `placer()` makes the taken rects once. The order of the `put()` calls is the priority.

## Functions

### Voxel helpers

- `box(parent, [w, h, d], [x, y, z], color)`: adds a scaled `CUBE` mesh and returns it. `y` is the base. A color value gives the `MATS` material. A `THREE.Material` goes in as is.
- `shared(color)`: the `MATS` lookup. Not exported. `office.js` has its own `shared(m)`, which takes a material.

### Placement primitives

- `at(g, x, z, rot)`: a new group in `g`, turned `rot` quarter turns (facing: CLAUDE.md "Scene conventions").
- `prop(parts)`: a maker `(g, x, z, rot)` from `[[w, h, d], [x, y, z], color]` boxes.
- `seat(c)` (exported): a swivel chair maker, back on local -z. It is not a meeting seat in `room.seats`.
- `corners(room)`: the points 0.75 in from each room corner.

Wall props (`printer`, `board(w)`, `tv`, `fridge`, `cooler`, `sofa`, `counter(L)`, `logo`, `waiting`) have their back at local z 0, so put them at `E`. Other props are centered, so put them at `E` plus half their depth.

### Props and plants

- The sizes are in the `prop()` data. `lounge()` is a sofa and a coffee table. `cafe()` is a table with three chairs and takes no `rot`.
- `counter(L)` has its origin at `room.counter` from `model.js`.
- `plant(g, x, z, s)` (exported): the coordinates set the pot and the kind. `plants(put, spots, n)` puts big plants on the first `n` spots that fit.

### placer(g, room, ...keep)

Returns `put(make, x, z, rot)`, which returns `true` when the prop fits. Rects are `[x0, z0, x1, z1]` in room-local coords. The taken rects:

1. the 2 x 2 area inside the door,
2. each `keep` rect (`lobby()` passes one for the entrance, and `party()` passes two for the speakers and the dance floor),
3. each `room.walk` rect,
4. each pod grown by 0.3, and its lamp post.

`put()` builds the prop in a loose group and measures it with `Box3.setFromObject()`. A prop inside the room (inset `E - 0.01`) and clear of `taken` moves into `g` and joins `taken`. Otherwise `put()` skips it with no error. A direct `box(g, ...)` call never joins `taken`.

### Room decor

Each function gets `(g, room)` with `g` at the room corner. The candidates are in the code. `room.walk`, `counter`, `table`, `seats`, `pods`, `booth`, and `floor` are in world coords, so subtract `room.x` and `room.z`.

- `workspaceDecor()`: rugs (direct `box()` calls), a bookshelf, a board or a printer by `room.number`, lounges and cafes, plants.
- `kitchen()`: the counter, the fridge, the cooler, cafe tables with a fallback that keeps one, a plant.
- `meeting()`: `longTable(room)`, a board and a TV on the north wall, plants. `longTable()` ignores `x`, `z`, and `rot`. It reads `room.table`, `room.seats`, and `room.session`.
- `lobby()`: the reception facing the entrance, `waiting` (`logo()` and a lounge) on the west wall, plants.
- `party()`: the DJ booth at `room.booth` (a direct call, two turntables and a mixer on a dark desk), then a lounge on a side wall beside the dance floor if it fits, then plants. It keeps two rects free: the speaker floor (1.8 to each side of the booth center, 0.45 to the front and the back) and `room.floor`. `office.js` builds the speakers and the lights there, because they move. The lounge goes first, because a corner plant can block it.

### Desk clutter

`CLUTTER` holds 6 items `(o, s) => ...`. `s` is -1 for the west desk end and +1 for the east end. Item 5 draws nothing. `clutter(g, seed)` picks two different items from the seed.

## Change recipes

### Add a prop to one room kind

1. Define it with `prop()`, facing +z. Give each box a color value, not a material, so that it merges.
2. Add `[[x, z, rot], ...].some(([x, z, r]) => put(name, x, z, r))` at the correct priority.
3. If it reads a room field that is not in `sig` (`office.js` `update()`), add the field to `sig`.
4. Run `node --check public/decor.js`, `npm test`, and "Check placement in Node".
5. Look at `?demo` on a check bridge on port 4848, then stop it (CLAUDE.md "Safety rules").
6. Update "Room decor" in this doc.

### Add a decor function for a new room kind

1. Ask the user first. A new room needs a numbered decision in `INTENT.md`.
2. Add the room in `buildOffice()`, before the lobby (`docs/model.md` "A new room kind").
3. Add `export function <kind>(g, room)`. Use `room.w` and `room.d`, because the band plan stretches the room.
4. Add it to `DECOR` in `office.js`, or `build()` throws. Add a `ROOM_FLOOR` entry, or the room gets carpet.
5. If workers cross the room, it needs walk rects, `opens()`, a route, and a place in `lay`.
6. Update the room lists in `assertPlan()` and "buildOffice maps rooms, pods and desks". `CASES` in `test/walk.test.mjs` must still give a kitchen door on each side.
7. Update the `kind` list and the `decor.js` line in CLAUDE.md.

### Make a prop change color or move at run time

1. Build it in `office.js` `build()`, after `door(r)`. `decor.js` has no `fresh()`, `live`, or `views`.
2. Use `box(parent, size, pos, fresh(color))`, and add the mesh or its group to `live`.
3. `door(r)` sets the room view. Add your field after it with `Object.assign(views.get(r.id), { ... })`, and keep `hinge`.
4. Set it in `update()` or in the frame loop. Do not give a room view a `desk` field, or `pose()` runs for it.
5. Keep a value that must survive a rebuild in a `Map` by room id, as `doors` does.
6. Run `node --check` on each changed file, and look at `?demo`.

### Add desk clutter

1. Add `(o, s) => { box(o, ...) }` to `CLUTTER`. Mirror x with `s`, and stay on the free desk end (the comment above `CLUTTER`).
2. In `clutter()`, change each `6` to `CLUTTER.length` and the `5` to `CLUTTER.length - 1`.
3. Each desk gets a new pick. `sig`, `live`, `tags`, and `lay` do not change.
4. Run `node --check public/decor.js`, and look at `?demo`.

### Check placement in Node

Do this after a change to `placer()`, `kitchen()`, or `party()` (the "routes" comment in `test/walk.test.mjs` asks for it). Work in the scratchpad only.

1. Download `three.module.js` and `three.core.js` of three 0.186.1 from jsDelivr into one folder.
2. Copy `public/decor.js`, point `from 'three'` at the local file, and log each `put()` result.
3. Build offices from the demo and from `snap()` and `CASES` in `test/walk.test.mjs`.
4. Call the decor function of each room on a group at `(r.x, 0, r.z)`.
5. Check that each one-try prop fits, that the kitchen has a `cafe`, and that no box above y 0.05 (the rugs) overlaps a walk rect.
6. For a party room, check that the booth is inside the room and off `room.floor`, and that no placed prop overlaps `room.floor` or the speaker floor.

## Pitfalls

- Never change the color of a `MATS` material. Each box with that color changes. Use `fresh()` from `office.js`.
- A decor mesh reference is not valid after `bake()`, because `bake()` removes the merged meshes.
- One-try props: the bookshelf with a south door, the counter, the long table, the meeting board and TV, the reception. No code checks the result, so a taken area loses the prop.
- No test covers decor. Use "Check placement in Node".
- A prop never stands on a walk rect. A new path in `route()` needs walk rects, or `checkRoute()` fails.
- `checkRoute()` copies `LAMP` as a literal, and `route()` passes each pod on its east side because the post stands on the west. Change all three together.
- Keep the `!(a >= m ...)` form in `placer()`. With no fridge, the cooler x is `NaN`, and only this form rejects it.
- Do not shrink the door rect. It also keeps the open door leaf (`door()`, `swing()`) clear.
- The lobby keep rect copies the entrance x (`w / 2`) from `model.js`. Move both together.
- The speaker keep rect in `party()` (1.8 to each side of the booth center, 0.45 deep) holds the speakers of `office.js`. A wider speaker or booth needs a wider rect. The booth itself is a direct call, so only this rect keeps props off it.
- `room.number` is not in `sig`. The rug and the extra prop change only at the next rebuild.
- Keep east-end clutter off the mouse of an agent desk (`desk()` in `office.js`).
- `GLYPH` has only h, e, r, and d. Another letter makes `logo()` throw.
- Do not add a prop that glows or has a status color (the comment above `printer`). The one exception is the party room parts in `office.js` (`partyLights()`). They glow, in magenta, violet, and white only.
- A wrong look shows only in the browser (`docs/testing.md` "Visual check in the browser").
