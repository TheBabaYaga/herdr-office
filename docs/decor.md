# public/decor.js: voxel helpers and room decor

`public/decor.js` draws the props of each room kind, the garden of each terrace, and the desk clutter. It also owns `box()` and the material cache for the whole scene. It imports `three`, and `hash` from `public/model.js` to seed the fill pass. Only `public/office.js` imports it. No test imports it.

Related docs: `docs/office.md` (`build()`, `bake()`, `sig`, `live`, `views`). `docs/model.md` (walk rects, counter, spots, seats). CLAUDE.md "Contracts between the files" (room fields).

## When to read this doc

- Add, move, or remove a prop, or change the desk clutter.
- Change the fill pass (`furnish()`), a pool, or how many props a big room gets.
- Add a room kind that needs its own decor.
- Change the garden of a terrace (`terrace()`, `TERRACE`, `GARDEN`).
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
| the palette, the prop makers, `PLANTS`, `BAGS`, `GLYPH`, `CLUTTER` | constant data. `office.js` imports `WOOD`, `WOOD_D`, and `CREAM`. |
| `SNOW` | `'#eef3f8'`: the color of the snow on the terrace grass, the hedge, and the caps. `office.js` imports it. |
| `FREE`, `PER`, `PAD` | 30, 7, 0.3: the fill pass gives one floor prop for each 7 m² of free floor over 30 m², with a gap of 0.3 around each prop. |
| `EDGE`, `NEAR`, `STRIP_EDGE`, `WALL_MAX` | 1.2, 0.6, 0.6, 3: a spot of the floor round is at least 1.2 from each room edge and its prop at least 0.6, a spot of the strip round at least 0.6, and a room gets at most 3 fill wall props. |
| `OFFICE`, `PARTY`, `KITCHEN`, `LOBBY`, `THIN` | the pools of the fill pass and of its strip round: `[make, how, max]` entries. See "furnish(put, room, pool, thin = THIN)". |
| `TERRACE`, `GARDEN` | the fill pool and the strip pool of a terrace: garden props only. |

No state lives for a build or a frame. A decor call reads only its room, and its only effect outside its group `g` is a new `MATS` entry. The fill pass gets its random numbers from a seed of `room.id`, never from `Math.random()`, so each build gives the same props.

## Flow

```text
office.js build()  (only when sig changes)
  plant() at each corridor corner        world coords, no placer()
  each room: DECOR[r.kind](g, r, season)  g at (r.x, 0, r.z)
             the fixed props by priority, then furnish(put, r, pool), not in meeting()
             then inner walls, door(r), partyLights(r) for the party room, the lamp posts at p + LAMP
  each terrace: the grass, terrace(g, t, season)  g at (t.x, 0, t.z)
             the deck, the fixed garden props, then furnish(put, t, TERRACE, GARDEN)
             in winter, snow(g): a cap on each green block
             then the glass walls, and the hedge on an open north edge
  desk(d): deskChair, clutter(g, hash(d.id, 1e6))   returns the west group: live for an agent desk
  bake()                                 merges meshes by material: no decor object is in live (the west clutter group of an agent desk is the one object)
```

In a decor function, `placer()` makes the taken rects once. The order of the `put()` calls is the priority. The fill pass runs last, so it never takes a spot from a fixed prop.

## Functions

### Voxel helpers

- `box(parent, [w, h, d], [x, y, z], color)`: adds a scaled `CUBE` mesh and returns it. `y` is the base. A color value gives the `MATS` material. A `THREE.Material` goes in as is.
- `shared(color)`: the `MATS` lookup. Not exported. `office.js` has its own `shared(m)`, which takes a material.

### Placement primitives

- `at(g, x, z, rot)`: a new group in `g`, turned `rot` quarter turns (facing: CLAUDE.md "Scene conventions").
- `prop(parts)`: a maker `(g, x, z, rot)` from `[[w, h, d], [x, y, z], color]` boxes.
- `seat(c)` (exported): a swivel chair maker, back on local -z. It is not a meeting seat in `room.seats`.
- `corners(room)`: the points 0.75 in from each room corner.
- `rng(seed)`: imported from `model.js`. A seeded random number in [0, 1) for each call (mulberry32). `steps(a, b, s)`: `a`, `a + s`, ... up to `b`.
- `legs(x, z, h, c)`: four leg boxes at `(±x, ±z)` for `prop()` data.

Wall props (`printer`, `board(w)`, `tv`, `fridge`, `cooler`, `sofa`, `lounge`, `counter(L)`, `logo`, `waiting`, and the fill props `piano`, `aquarium`, `cabinets`, `credenza`, `lockers`, `vending`, `arcade`, `bike`, `bar`) have their back at local z 0, so put them at `E`. Other props are centered, so put them at `E` plus half their depth.

### Props and plants

- The sizes are in the `prop()` data. `lounge()` is a sofa and a coffee table. `cafe()` is a table with three chairs. `board16` is `board(1.6)` as one maker, so `put.used()` counts it.
- The fill props, each facing +z before its turn:
  - floor groups: `nook` (two `armchair`s and a `sideTable` on a rug), `sofaCorner` (a sofa, two armchairs, and a coffee table on a rug), `workBench` (a long table with six chairs), `chessTable` (two chairs, on a rug, only in `LOBBY`), `highTable` (three `stool`s), `cafe`.
  - floor props: `planter` and `lowShelf` (room dividers), `bench` (backless), `pingPong` (only as a game table), `foosball`, `drums`, `tree`, `coatRack`, `flipChart`, `magazines`, `beanBag`, and `pot` (a plant of scale 1). `bench` is only in `THIN`.
  - wall props: `piano` (with its bench), `aquarium`, `cabinets`, `credenza`, `lockers`, `vending`, `arcade`, `bike`, `bar` (a back shelf, the counter, and three stools).
- The garden props, for `terrace()` only: `gardenTree` (a trunk and three crown blocks, no pot), `bush`, `lounger` (the foot end faces +z), `parasol` (the cafe table, four chairs, and a striped canopy at 2.2), and `pond` (a stone rim round water at 0.1). They also use `bench` and `planter`.
- A rug inside a group (`nook`, `sofaCorner`, `chessTable`) is a box 0.02 high. It is part of the group footprint, so the rug never touches another prop.
- `beanBag` takes its color from `BAGS` by its position, as `plant()` takes its kind.
- `counter(L)` has its origin at `room.counter` from `model.js`.
- `plant(g, x, z, s)` (exported): the coordinates set the pot and the kind. `plants(put, spots, n)` puts big plants on the first `n` spots that fit.

### placer(g, room, ...keep)

Returns `put(make, x, z, rot, pad)`, which returns `true` when the prop fits. `pad` (default 0) grows the prop rect for the test against the taken rects, not for the wall test. Rects are `[x0, z0, x1, z1]` in room-local coords. A terrace has no door, no pods, and no walk rects, so only the walls, the `keep` rects, and the props limit it. The taken rects:

1. the 2 x 2 area inside the door,
2. each `keep` rect (`lobby()` passes one for the entrance, and `party()` passes two for the speakers and the dance floor),
3. each `room.walk` rect,
4. each pod grown by 0.3, and its lamp post.

`put()` builds the prop in a loose group and measures it with `Box3.setFromObject()`. A prop inside the room (inset `E - 0.01`) and clear of `taken` moves into `g` and joins `taken`. Otherwise `put()` skips it with no error. A direct `box(g, ...)` call never joins `taken`.

`put` also has three fields for the fill pass:

- `put.fits(r, pad)`: the same test for a rect, with no build.
- `put.taken`: the taken rects.
- `put.used(make)`: how many props of that maker the room has. A maker made in the call (`board(1.6)`, `counter(L)`) counts as a new kind each time.

### furnish(put, room, pool, thin = THIN)

The fill pass. Each room function except `meeting()` calls it last, with the pool of its kind. `terrace()` calls it with `TERRACE` and `GARDEN`. It fills the open floor between and around the pods, in a seeded random order, not the floor along the walls.

1. Count the free floor: the 0.5 x 0.5 cells whose center is clear of `put.taken`.
2. Set the budget: one prop for each `PER` (7) m² over `FREE` (30) m², and at most 80% of the floor kinds of the pool. A small room gets 0 and stays as it was.
3. Shuffle the pool and the spots with `rng(hash(room.id, 1e9))`.
4. The floor round: for each floor entry `[make, how, max]` of the pool, place up to `max` (default 1) props, minus the props of that maker that the room has already.
5. The strip round: count the free floor again for a new budget, then place the props of `thin` on a finer grid. `THIN` holds `planter`, `lowShelf`, `bench`, `coatRack`, `tree`, `beanBag`, and `pot`. `GARDEN` holds `planter`, `bench`, `bush`, and `gardenTree`, so no indoor prop stands on a terrace. The grid comes to `STRIP_EDGE` (0.6) from a room edge. So the thin props spread over the whole room, the band along the corridor side too. Each `THIN` kind can come twice in the room, the floor round included. In `GARDEN`, `bush` and `gardenTree` can come 4 times.
6. The wall round: at most `WALL_MAX` (3) wall entries of the pool, on the north and west walls. This round does not use the budget.
7. A prop that fits no spot does not use the budget. A round ends when its budget is 0 or its entries are done.

The spots and the turns:

- `how` `'w'`: a wall prop. The wall spots are 0.5 apart along the north wall (`rot` 0) and the west wall (`rot` 1), in a random order.
- `how` `'f'`: a floor prop with a front. It turns its front to the room middle (`face()`).
- `how` `'s'`: a floor prop that can turn any way. It tries a random turn and the next one, so a long prop can lie along its strip.
- The floor spots are a grid 0.6 apart, at least `EDGE` (1.2) from each room edge. The strip spots are a grid 0.4 apart, at least `STRIP_EDGE` (0.6) from each room edge. Each spot moves by a random jitter of up to half a cell in x and in z, so the props do not stand in lines. The spots are in a random order.
- A spot is skipped if a core of 0.4 x 0.4 around it, with the gap, does not fit. Each floor prop covers this core in each turn, so the filter drops only spots where no floor prop fits. It makes a room full of pods fast.
- A prop of the floor round also keeps `NEAR` (0.6) from each room edge. So the main groups do not stand along the walls. The corner plants and the fixed props stay where they were.

Each prop gets the gap `PAD` (0.3), so no two groups touch. Before it calls `put()`, `tryAt()` moves the footprint of the maker at the origin (`foot()`, kept for the call) to the spot and tests it with `put.fits()`. Only a likely fit builds the prop. Without this test, one room took 36 ms. With it and the core filter, the slowest test room takes about 6 ms in Node (the median of repeated runs), and less than 14 ms in its first, cold run.

### Room decor

Each function gets `(g, room, season)` with `g` at the room corner. The candidates are in the code. `room.walk`, `counter`, `tables`, `chairs`, `table`, `seats`, `pods`, `booth`, and `floor` are in world coords, so subtract `room.x` and `room.z`.

- `workspaceDecor()`: rugs (direct `box()` calls), a bookshelf, a board or a printer by `room.number`, the game tables of `room.games` (`gameTables()`), a lounge on the north or west wall if it fits, plants, then the fill pass with `OFFICE`.
- `kitchen()`: the counter, the lunch tables, the cooler, the fridge, a plant, then the fill pass with `KITCHEN`. The model sets `room.tables`, `room.chairs`, and `room.cooler`. `kitchen()` puts the cooler at `room.cooler` (the two chat spots stand in front of it). The fridge stands east of the counter, else on the west wall at z 2.8. It never stands east of the cooler, because the camera looks from +x and the fridge would hide it. Each chair point is the body of a seated worker on a walk rect, so `put()` would refuse it. `kitchen()` draws each `cafeTable` and its wooden `chair`s directly, and pushes the footprint of the table with its chairs into `put.taken`. The props after them keep clear. A chair stands as the desk chair does: 0.1 behind the body point, with its back away from the table.
- `meeting()`: `longTable(room)`, a board and a TV on the north wall, plants. `longTable()` ignores `x`, `z`, and `rot`. It reads `room.table`, `room.seats`, and `room.session`.
- `lobby()`: the cat basket, the reception facing the entrance, `waiting` (`logo()` and a lounge) on the west wall, plants, then the fill pass with `LOBBY`. The model sets `room.basket`. `lobby()` draws the basket there without `put()`, because the basket is on a lobby walk rect. It pushes the footprint (0.62 x 0.66) into `put.taken`. The basket is a base (0.62 x 0.04 x 0.66, `WOOD_D`), four rim boards (0.16 high, `WOOD`), and a cream cushion (0.5 x 0.06 x 0.54, y 0.04).

```text
Example: lobby w 8 -> basket at local (2.8, 4), put.taken gets [2.49, 3.67, 3.11, 4.33].
```
- `terrace(g, t, season)`: a terrace is not a room. `office.js` draws its grass, its walls, and the hedge on an open north edge. `terrace()` draws a wood deck 1 in from each edge (boards 0.05 high along x on a base 0.03 high), so the grass shows round it. Then, by priority: a garden tree in each back corner, a parasol table in the middle, a lounger on each side of it, a bench between the trees, a pond, and a bush in each front corner (low, so the camera sees in). Then the fill pass with `TERRACE` and the strip round with `GARDEN`. The seed is `t.id`. A terrace with less than 37 m² of free floor after the fixed props gets no fill.
- `party()`: the DJ booth at `room.booth` (a direct call, two turntables and a mixer on a dark desk), then the game tables of `room.games` (`gameTables()`), then a lounge on a side wall beside the dance floor if it fits, then plants. It keeps two rects free: the speaker floor (1.8 to each side of the booth center, 0.45 to the front and the back) and `room.floor`. `office.js` builds the speakers and the lights there, because they move. The lounge goes first, because a corner plant can block it. The fill pass with `PARTY` comes last.
- `gameTables(g, room, put)` draws each table of `room.games` (world coords) directly, because a place is on a walk rect and `put()` would refuse it. It pushes the union of the measured box and the model footprint (half width 1.75 for ping-pong, 0.95 for chess, half depth 0.6) into `put.taken`, so the players stay clear, and the caller runs it first, so the props after it keep clear. A chess table lies along x (`chessTable(o, x, z, 1, false)`: no chairs of its own), with a `chair` 0.1 behind each place, so 0.72 from the center. A ping-pong table has rot 0, so its long side runs along x. `OFFICE` and `PARTY` have no `chessTable` and no `pingPong`: the model decides if a room has them.
- The pools: `OFFICE` has 25 kinds (13 floor kinds), `PARTY` 14, `KITCHEN` 11, `LOBBY` 14, and `THIN` 7 for the strip round of each room. `TERRACE` has 7 floor kinds and no wall kind, and `GARDEN` 4 for the strip round of a terrace. `pot` can come twice in each pool. `beanBag` can come twice in `OFFICE` and `PARTY`, and once in `LOBBY`. `bar` and `drums` are only in `PARTY`, `magazines` only in `LOBBY`.

### Seasonal props

`office.js` passes `season` (`'halloween'`, `'winter'`, or `null`, from `season()` in `model.js`) as the third argument of each `DECOR` function and of `terrace()`. With `null`, the decor is the normal one. Only `'halloween'` and `'winter'` have props. `terrace()` uses the season for the winter snow only. `meeting()` takes it for the candelabra only.

- `pumpkin(g, x, z, rot, s = 1)`: a maker, like `plant()`. It is not exported. The body is 0.5 x 0.3 x 0.46, with two ribs, a stem, and a face on the +z side.
- `bat(g, x, y, z)`: a body with ears and two white eyes, and stepped wings with a span of 1.0. It hangs on a string that reaches y 2.6.
- `web(g, x, y, z)`: 4 strands 0.6 long, 30 degrees apart, and two chords between each pair of strands.
- `lobby()`: two pumpkins beside the reception, through `put()`, after `waiting` and before the plants and the fill pass. The west pumpkin stands at (w / 2 - 1.2, d - 2.3), south of the basket. The east pumpkin stands at (w / 2 + 2.3, d - 3). The lobby walk rects take floor, so the fill props of a Halloween lobby can differ from before.
- `kitchen()`: a pumpkin (scale 0.55) on the east end of the counter top, at y 0.94.
- `party()`: four bats round the axis of the disco ball, after the fill pass. Their heights go 2.3 and 2.45 in turn. The beams start at y 2.2.
- `workspaceDecor()`: a web in the north-west corner, on the north wall face. The pivot is at x 0.19, so the strands stay off the west wall face at x 0.15.

The kitchen pumpkin, the bats, and the web are direct calls, not `put()` calls. `put()` tests a floor footprint. It refuses a pumpkin that stands on the counter, a bat over the dance floor (a keep rect), and a web that touches a wall.

- `xmasTree`: a prop from `prop()`. A stand, a trunk, four green tiers (1.3, 1.0, 0.7, and 0.4 wide, 0.45 high, with the top at y 2.2), two ornaments on each of the +z and +x faces of each tier (white, silver, violet, and blue), and a brass star `#d8b45c` with its top at y 2.4. No ornament is red, green, or yellow, because those read as a status color (`docs/idr/0002-winter-decor.md`). Each ornament is a bulb: one unlit `MeshBasicMaterial` for each of the 4 colors, with `userData` `shared` and `bulb`. `office.js` adds a halo to each bulb (`lightBulbs()`).
- `lobby()` in winter: `put(xmasTree, x, z, 0)` for the corners (1, 1), (w - 1, 1), and (1, d - 1), the first that fits. It comes after `waiting` and before the plants. So a winter lobby gets different corner plants and fill props than a normal lobby. The terrace caps change no fill, because `snow()` runs after `furnish()` and does not touch `put.taken`.
- `furnish()` in winter: `furnish(put, room, pool, season, thin)` takes the season. `swap()` in `tryAt()` replaces `tree` with `xmasTree` when `Math.abs(Math.round(x * 7 + z * 13))` is odd. The rule picks half of the tries, but the wider tree fits less often, so about a third of the trees change (25 of 73 in 60 test rooms). The spot decides, so a rebuild gives the same trees. The `xmasTree` always stands at rot 0, so the ornaments face the camera. `foot()` and `put()` check the footprint of `xmasTree`. The wider tree may fail where `tree` fits, and then `furnish()` goes on to its next spot. `put()` counts the swapped prop as `tree`, so the `max` of the pool holds. A terrace has no `tree`, so it does not change.
- `snow(g)`: for each green block of a terrace that is 0.1 high or more, a `SNOW` cap 0.05 high and 0.04 wider than the block, on its top. `terrace(g, t, season)` calls it last in winter. The lily pads are lower than 0.1, so they stay bare. The caps are direct `box()` calls, not `put()`, because a cap stands on a prop and `put()` refuses it.
- `candleSpot(g, room, put)`: with Halloween, `workspaceDecor()`, `kitchen()`, `meeting()`, `party()`, and `lobby()` call it last and return its result: `{ x, z }` in world coords, or `null` when no spot is clear. Other seasons return `undefined`. `office.js` draws the candelabra there (`candelabra()`), so `decor.js` only measures.
  - The candidates lie on a 0.5 grid, 0.6 or more from the walls. The camera-side corner (large `x / w + z / d`) comes first, then the larger x. A candidate must pass `put.fits` for a 0.6 square with a gap of 0.3. The chosen square goes into `put.taken`.
  - The camera sees a flame when a ray in the direction (1, 1, 1) from it hits no box. The test casts the ray from three x offsets (-0.25, 0, 0.25) at two heights (1.47 and 1.53), the base and the top of the flames.
  - The boxes: each mesh of the group, each pod grown by 0.3 (1.7 high), each lamp post (2.4 high), and the east and south inner-wall header slabs (y 2.48 to 2.6, the east one reaches 0.7 past the corner, as the neighbor header does).
  - No `Math.random()`. The same room gives the same spot.

A season change needs a rebuild. `update()` in `office.js` puts the season in `sig`.

### Desk clutter

`CLUTTER` holds 6 items `(o, s) => ...`. `s` is -1 for the west desk end and +1 for the east end. Item 5 draws nothing. `clutter(g, seed)` picks two different items from the seed. It draws the west item into its own group, adds that group to `g`, and returns it. The east item stays in `g`. `desk()` in `office.js` puts the west group in `live` for an agent desk, so `moveCat()` can hide it under a napping cat (`docs/idr/0008-nap-clutter-live.md`).

## Change recipes

### Add a prop to one room kind

1. Define it with `prop()`, facing +z. Give each box a color value, not a material, so that it merges. A wall prop has its back at local z 0. Other props are centered.
2. For a fill prop, add `[name, how, max]` to the pool of each room kind. For a fixed prop, add `[[x, z, rot], ...].some(([x, z, r]) => put(name, x, z, r))` at the correct priority, before `furnish()`.
3. If it reads a room field that is not in `sig` (`office.js` `update()`), add the field to `sig`.
4. Run `node --check public/decor.js`, `npm test`, and "Check placement in Node".
5. Look at `?demo` on a check bridge on port 4848, then stop it (CLAUDE.md "Safety rules").
6. Update "Room decor" in this doc.

### Add a decor function for a new room kind

1. Ask the user first. A new room needs a numbered decision in `INTENT.md`.
2. Add the room in `buildOffice()`, before the lobby (`docs/model.md` "A new room kind").
3. Add `export function <kind>(g, room, season)`. Use `room.w` and `room.d`, because the band plan stretches the room.
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

Do this after a change to `placer()`, `furnish()`, a pool, a prop size, `kitchen()`, or `party()` (the "routes" comment in `test/walk.test.mjs` asks for it). Work in the scratchpad only.

1. Download `three.module.js` and `three.core.js` of three 0.186.1 from jsDelivr into one folder.
2. Copy `public/decor.js`, point `from 'three'` at the local file and `from './model.js'` at the repo file, and log each `put()` result. Also copy the `git show HEAD` version, to compare.
3. Build offices from the demo, from `synthetic()`, `big()`, and `garden()` in `test/model.test.mjs`, and from `snap()` and `CASES` in `test/walk.test.mjs`. Add a few big rooms and terraces: a room with one pod in a row of 30 or more (since decision 26 it gets a terrace of about 25), and a room with 8 or more tabs.
4. Call the decor function of each room on a group at `(r.x, 0, r.z)`.
5. Check that each one-try prop fits, that the kitchen has a table for each `room.tables` entry, and that no box above y 0.05 (the rugs) overlaps a walk rect, the door rect, a pod, or a lamp post. The lunch chairs stand on their lanes, so skip them in the walk rect test. Check that no two props overlap, and that a second call gives the same props.
6. With `'halloween'`, check that each room returns a candle spot whose 6 flame rays (three flames, at y 1.47 and 1.53, along (1, 1, 1)) miss every mesh box, pod box (to y 1.7), lamp post (to y 2.4), and the east and south header slabs (y 2.48 to 2.6).
6. Check that no two flat boxes (0.05 high or less) of different colors overlap at the same height. Print a map of each big room, and check that the fill props stand in the open floor, not along the walls.
7. For a party room, check that the booth is inside the room and off `room.floor`, and that no placed prop overlaps `room.floor` or the speaker floor.
8. For each terrace, call `terrace()` on a group at `(t.x, 0, t.z)`. Check that each prop is inside the terrace, that no two props overlap, that no prop of a first-row terrace touches the hedge (local z 0.18), and that no two flat boxes of different colors overlap at one height (the deck boards and the table base).
9. With `'winter'`, check that each lobby gets the tree, and where it stands. For each terrace, check that each green block 0.1 high or more has a `SNOW` cap on its top, and that the lily pads have none.
10. Compare the count of props of each kind and the share of free floor with the old version. The demo rooms "api" and "docs" must not change. A room in a terrace row has a new size, so its one-try props can move.

## Pitfalls

- The chair of a game place has the same offset as a kitchen chair (`kitchen()`): 0.1 behind the place, the back away from the table. Change both together.
- Never change the color of a `MATS` material. Each box with that color changes. Use `fresh()` from `office.js`.
- A decor mesh reference is not valid after `bake()`, because `bake()` removes the merged meshes.
- The lunch tables and chairs do not go through `put()`. Only their `put.taken` entry keeps the other props off them. Keep that entry, and add each new part of a lunch table to the same group, so the footprint holds it.
- The chair offset (0.1 behind the body point) copies `desk()` in `office.js`: the chair at local z 0.5, the worker pivot at 0.4. Change both together.
- One-try props: the bookshelf with a south door, the counter, the long table, the meeting board and TV, the reception. No code checks the result, so a taken area loses the prop.
- No test covers decor. Use "Check placement in Node".
- The fill pass shuffles the pool with the room seed. A new pool entry, or a new order of a pool, gives every big room a new mix. That is correct, but the main session must look at the rooms again.
- A `'w'` pool entry must have its back at local z 0, and an `'s'` or `'f'` entry must be about centered. Else the wall spots put the prop into the wall, and the floor spots skip it.
- Never use `Math.random()` in decor. `build()` runs again on many updates, and the props must not jump.
- The fill puts no prop on the south or the east wall. These walls face the camera, so a tall prop there hides the room.
- The strip round also runs in an open room. It adds a second planter, shelf, bench, coat rack, tree, bean bag, or plant there.
- The user does not want flat runners on the walk lanes (decision 25). A flat box on a lane also needs a height under the pod rugs (0.02 and 0.03) to stay clear of z-fighting.
- Do not order the spots by the distance to the placed props. That rule sent the props to the corners and the walls, and the user rejected it (decision 25).
- In a room full of pods (two pod rows, about 30 x 13), most props are thin props of the strip round: under a short pod between the desk lanes (`walkRects()` in `docs/model.md`), and in the band along the north wall. The band along the corridor side is about 0.5 deep after the gap, so it stays empty.
- A new floor prop must cover the core [-0.2, 0.2] around its origin in each turn. Else the spot filter skips spots where it fits.
- `FREE` comes from the demo rooms: "api" has 14 m² and "docs" 16.5 m² of free floor at the fill pass, so they get 0. "web" and "infra" (36 m²) also get 0. A smaller `FREE` or `PER` changes them.
- A prop never stands on a walk rect. A new path in `route()` needs walk rects, or `checkRoute()` fails.
- `checkRoute()` copies `LAMP` as a literal, and `route()` passes each pod on its east side because the post stands on the west. Change all three together.
- Keep the `a >= m && ...` form in `fits()` (in `placer()`). This way a `NaN` position fails too.
- Do not shrink the door rect. It also keeps the open door leaf (`door()`, `swing()`) clear.
- The lobby keep rect copies the entrance x (`w / 2`) from `model.js`. Move both together.
- The speaker keep rect in `party()` (1.8 to each side of the booth center, 0.45 deep) holds the speakers of `office.js`. A wider speaker or booth needs a wider rect. The booth itself is a direct call, so only this rect keeps props off it.
- A prop in the air or on another prop needs no `put()` and no `placer()` rect. Draw it with a direct call, as the bats and the web do. A `put()` call refuses it.
- `?demo` shows the Halloween props from 24 October to 1 November. Use `?demo&season=none` to see the normal decor.
- The demo has no terrace, so `?demo&season=winter` shows the trees and the outdoor snow, but no terrace snow. Check the terrace snow with a fake socket (`docs/testing.md`).
- `room.number` is not in `sig`. The rug and the extra prop change only at the next rebuild.
- Keep east-end clutter off the mouse of an agent desk (`desk()` in `office.js`).
- Draw a new clutter item into the group that `clutter()` gives `CLUTTER[a]`. Else it cannot hide under the cat.
- The basket spot comes from the model (`room.basket`). Do not copy the numbers into `lobby()`.
- `GLYPH` has only h, e, r, and d. Another letter makes `logo()` throw.
- Keep the deck boards of `terrace()` at 0.05 high. The cafe table base of `parasol` is 0.04 high, and a board of the same height z-fights with it.
- The hedge on the open north edge reaches 0.18 into a first-row terrace. The placer inset (`E - 0.01`, 0.19) keeps the props off it. A thicker hedge needs a `keep` rect.
- Do not add a prop that glows or has a status color (the comment above `printer`). The one exception is the party room parts in `office.js` (`partyLights()`). They glow, in magenta, violet, and white only. The other exception is the Halloween candle flames in `office.js` (`candle()`), which glow in orange only (`INTENT.md` decision 32).
- A wrong look shows only in the browser (`docs/testing.md` "Visual check in the browser").
