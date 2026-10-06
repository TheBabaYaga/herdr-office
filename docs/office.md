# public/office.js: the scene, the HUD, and the panel

`public/office.js` draws the office in three.js, animates the workers and the doors, and runs the HUD, the side panel, the desk click, and the data source. Only `public/index.html` loads it, and it exports nothing. Node cannot resolve the bare `three` import, so no test imports it. `CLAUDE.md` "Scene conventions" holds the rules for `box()` colors, `live`, `sig`, `tags`, labels, and breaks. This doc does not repeat them.

## When to read this doc

- A change to the look of a worker, a desk, a screen, a door, a lamp, or a wall.
- A new status look, label, panel field, or HUD item.
- A change to the idle breaks or the door swing on the 3D side.
- A new room kind, a new desk field that changes geometry, or a new color that changes in place.
- A camera, zoom, click, or label overlap problem.
- A change to the data source.
- A split of `office.js` work between parallel agents.

## Module state

| Name | Holds | Written by | Lifetime |
|---|---|---|---|
| `office` | the last `buildOffice()` result, `null` at first | `update()` | page |
| `sig`, `laid` | the build signature and the last `lay` (route inputs), as JSON | `update()` | page |
| `views` | id -> view (see "View shapes") | the build and screen functions, `pose()`, `update()` (`v.desk`) | one build |
| `world`, `live` | the group of one build, and the objects that `bake()` does not merge | `build()` and the build functions | one build |
| `trips`, `claimed` | desk id -> `{ n, next, trip }`, and kitchen spot index -> desk id | `stepBreak()`, `endBreak()`, `update()` (clears on a `lay` change), `stroll()` (`trip.rot`) | page |
| `doors` | room id -> the door angle now | `swing()` | page. A rebuild keeps it |
| `ajar`, `moving` | the room ids whose door a walker opens, and whether a worker walked, in this frame | frame loop resets, `pose()` sets | one frame |
| `last` | the time of the last frame in seconds, 0 at first | frame loop | page |
| `tags` | the label elements, highest priority first | `update()` | one update |
| `seen`, `nextPass` | the camera key of the last `declutter()` pass (`''` forces one), and the next forced pass | `declutter()`, `update()`, frame loop | page |
| `spot` | the blue light over the focused desk, outside `world` | `update()` | page |
| `rows` | desk id -> HUD list `<button>` | `hud()` | page |
| `goal` | the point that the camera target glides to, or `null` | HUD row click. Frame loop, `keepInView()`, and pointerdown clear it | until reached |
| `selected`, `target`, `down` | the panel id, the pane id to focus or to message, the last pointerdown | `open()`, `fill()`, pointerdown | page |
| `timer`, `msgs`, `msgKey` | the 2000 ms refresh timer, the messages of the open claude desk, and their JSON | `open()`, `close()`, `loadMessages()`, `renderMessages()` | page |

`COLOR` is `STATUS_COLOR` as `THREE.Color`. `GLASS`, `SKY`, and `glow` are marked by `shared()`. `haloGeo` is one plane for all halos.

## View shapes

`views` holds four kinds of view in one map. The frame loop calls `pose()` only for a view with a `desk` field.

- Room view, from `door(r)`: `light`, `sign` (the `div.sign`), and `hinge` (the group of the leaf and the knob). `light` and `hinge` are in `live`.
- Pod view, from `build()`: `lamp`, in `live`.
- Desk view, from `desk(d)`: `desk` (`update()` replaces it each update), `screen` (the monitor, or the head seat laptop when `d.away` is set), `halo` and `logo` (from the head seat only, but `pose()` makes a desk halo on the first typing frame), `phase`, `seed` (for the breaks and the browse picture), and `worker` (`null` for a shell pane).
- Subagent view, from `attendee(s)`: `desk` is a fixed `{ status: 'working' }` that `update()` never replaces. It has `screen`, `halo`, `logo` (`false` for `rot` 0 or 1), `phase`, and `worker`, and no `seed`.
- Later fields: `ctx` and `tex` (`screenCtx()`), `typed` (`typing()`), `shown` (`browse()`).

Worker object, from `worker()`: `g` (the body group, in `live`, at `(0, 0.5, 0.4)` in its parent), `arms` (`[0]` is the -x arm), `sit`, `stand`, `legs` (the hip pivots in `stand`), `mug`, `paper`, `beacon`, `mats`, and `badge`. The part sizes and heights are in `worker()`. Add 0.5 to a `g` y for the world y.

The face of a worker is on local -z. At a desk the camera sees its back and its +x side. At the head seat (`rot` 3) it faces +x, toward the camera, so a flat mark that reads correctly at a desk reads mirrored there.

## Flow

At start, the module makes the renderers, the scene, the camera, and the handlers, then starts the frame loop. The data source block at the end of the file makes the first `update()`.

The update path, the frame order, and the click path are in `docs/README.md` "Data flow". `update()` is the only caller of `build()`. The frame loop is the only caller of `pose()`, `swing()`, `keepInView()`, and `declutter()`.

## Functions

### Setup and helpers

- `fresh(color, Mat)`: a new material of its own, unlit by default. `build()` disposes it on the next rebuild.
- `shared(m)`: marks `m` so that `build()` never disposes it. It is not the private `shared()` cache in `decor.js`.
- `shirt(kind)`: `SHIRT[kind]`, else a hash color. `family(model)`: the model family for the subagent badge.
- `who(d)`: the agent name for a badge or a row. It throws for a shell desk.
- `el(tag, text, status)`: an element with `textContent`, and `--c` from `STATUS_COLOR`.
- `label(parent, cls, pos)`: adds a `CSS2DObject` to `parent` and returns its `div`, not the object. `#labels` has `pointer-events: none`, so a click goes to the canvas.

### Floors and walls

- `floor()`: a floor box with a cloned `FLOOR` texture and a new material, which the next rebuild disposes.
- `run()` puts one box on a wall line, and `pieces()` gives the solid spans around the gaps.
- `outer()` draws the far walls (west, north) with windows, and `stub()` the cut camera-side walls (east, south, with the entrance).
- `inner()`: a glass inner wall. Its comment says why the header stays thin.
- `door(r)`: the posts, the lintel, the transom, the status `light`, and a `hinge` group with the leaf and the knob. The hinge starts at `doors.get(r.id) ?? 0`, so a rebuild keeps an open door open. The leaf and the knob use cached colors. Sets the room view.

### Build and bake

- `build(office)`: runs only when `sig` changes. Order:
  1. Dispose `v.tex` of each view, each geometry with `userData.merged`, and each material without `userData.shared` (with its `map`). Remove each label element from the DOM.
  2. Make a new `world`, and clear `views` and `live`.
  3. The corridors, then each room: the floor, `DECOR[r.kind](g, r)` in a group at the room corner, the inner walls (each wall once), `door(r)`, and the pod lamps.
  4. The outer walls, then `desk()` for each desk and `attendee()` for each subagent.
  5. `bake()`, the sun, and the shadow flags.
- `bake()`: skips each object in `live` with its subtree. It merges the meshes of each material with 2 or more meshes into one mesh, and marks its geometry `userData.merged`.

### Desks, seats, and workers

- `desk(d)`: the desk, the monitor, the `screen` (in `live`), the keyboard and mouse for an agent, the chair, and `clutter()`. With `d.away`, `seatAt(d.away)` makes the head seat, the worker sits there, and the desk screen stays black. Sets the desk view.
- `seatAt(s)`: a group at the seat, turned `s.rot` quarter turns, with a laptop, a `screen` and a `halo` (in `live`), and a `logo` when `s.rot > 1`. The chair comes from `meeting()` in `decor.js`.
- `attendee(s)`: `seatAt(s)` and a worker with the shirt of the model family. It has its own family match, with `'subagent'` as the fallback. Sets the subagent view.
- `worker(parent, d)`: builds the worker in `g`. Each part gets its own material (`lit()` or `fresh()`), so `pose()` can set the opacity per worker. The look comes from `hash(d.terminalId ?? d.id, 1e9)` through the local mixer `r(n, i)`, and the shirt from `shirt(d.agent.kind)` only. It collects `mats` last.

### Screens

- `screenCtx(v)`: makes `v.ctx` (a 32 x 24 canvas) and `v.tex` on the first call. `typing()` and `browse()` share this canvas.
- `typing(v, tick)`: the yellow code screen. It draws only when the position changes, and it clears `v.shown`.
- `browse(v, t)`: the idle page or video, picked by `v.seed`. It draws only when the picture changes, and it clears `v.typed`. `PIC` holds no status color.

### Idle breaks

- `breaks(v, t)`: calls `stepBreak()` and `along()`. It returns where the worker is on its trip, or `null` at the desk (always for a subagent).
- `stroll(w, d, a, t)`: poses a worker on a trip, as `CLAUDE.md` "Scene conventions" describes. The arm swing and the mug hand use `calm()` of the nearest door.
- `swing(dt)`: turns each door toward `OPEN` when `ajar` has its room id, else toward 0, at a speed set by `SWING`. It writes `doors` and `hinge.rotation.y`.
- `opens()` in `model.js` gives the doors that one walker opens. See `docs/model.md` "Breaks".

### pose()

`pose(v, t)` runs each frame for each view with a `desk`, and writes each animated value of a visible part. Order:

1. `walk = worker && breaks(v, t)`.
2. `typed` (working, not walking) calls `typing()` and shows the halo and the `logo`. `browsing` (idle, not walking, not away) calls `browse()`.
3. The screen gets `v.tex` while `typed` or `browsing`, else `COLOR[status]`, or `SHELL` for a shell desk.
4. A view with no worker stops here.
5. On a walk: `stroll()`, `moving = true`, and the ids from `opens()` go into `ajar`. At the desk: reset the position and rotation, show `sit`, hide `stand` and `mug`, and set the arms from `ARM`.
6. In both cases: `paper` for `done`, `beacon` for `blocked`, and opacity 0.35 for `unknown`. So a run back shows these parts.

### declutter()

- `declutter()`: returns early when the camera key equals `seen`. Else it reads every rect of `tags`, then hides each label that overlaps a kept label (`visibility: hidden`). A label with zero width hides no other label.
- A rect has zero width only when `CSS2DRenderer` sets `display: none` (the object or an ancestor is not visible, or it is outside the depth range).

### update()

`update(next)` order:

1. Store `office`, and build `lay` and the signature `s`. `CLAUDE.md` "Scene conventions" lists what each holds. No status, label, or focus goes into either.
2. On a `lay` change, clear `trips` and `claimed`. Call `endBreak()` for each desk with `away` or with no agent.
3. On a `sig` change, `build()`. After the first build only, `frame()` the focused workspace room or the whole building.
4. Set the door lights, the signs, the pod lamps, `v.desk`, and the badges in place.
5. Fill `tags`: agent badges at `10 + STATUS_RANK[status]`, subagent badges at 12, door signs at `STATUS_RANK[r.status] ?? 0`. A stable sort puts the highest first. Then `seen = ''`.
6. Move `spot` to the focused desk, or hide it. Call `hud()`, and `fill()` when the panel is open.

### HUD

- `hud()`: fills `#counts`, `#meetings`, and `#list`. It keeps one `<button>` for each agent desk in `rows` across updates, so keyboard focus survives, and sorts them with `style.order`. A row click sets `goal` and calls `open()`.
- `setOnline(on, note)`: toggles the `offline` class on `body` and sets `#note`. Only the live data source calls it.

### Camera

- `controls`: set at module start. No rotation, pan on the floor plane, zoom to the cursor.
- `resize()` sets the frustum from `VIEW` and the window. `fit(w, d)`: the zoom that fits a floor, after `resize()`. `frame(rect)`: centers the camera on the rect at that zoom.
- `keepInView()`: sets `controls.minZoom` to the building fit, and clamps the target near the building center (the limit grows with the zoom). A clamp clears `goal`.

### Panel

- `open(id)`: sets `selected`, clears `#result`, `#chatResult`, and both inputs, closes `#chat`, clears the timer and the messages, shows `#panel`, and calls `fill()`. For a claude desk (not in the demo) it calls `loadMessages()` at once and starts one `setInterval` of 2000 ms, also for a desk that is not claude (`loadMessages()` then returns at once). `close()` clears the timer, closes `#chat`, and hides the panel. The `#msg` clear stops a half-typed message from going to another desk.
- `fill()`: finds the desk or subagent with the id `selected`, else it calls `close()`. For a subagent, `target` is its orchestrator desk id. The button is disabled when `DEMO` is set or `target` is empty. It shows the `#say` form only for a desk with an agent, and disables both forms when `DEMO` is set. It shows `#last` only for a desk whose agent kind is `claude`, and closes `#chat` when `#last` turns hidden. In the demo, `#lastText` says "no messages in the demo". It never changes the input values, never fetches, and never renders the log, because it runs on each update. It writes the local `rows` object as `dt` and `dd` through `el()`.
- `act(body, done, out = $('result'))`: `POST /action` with `body` and the header `x-office-token: TOKEN`. `out` shows `done` on success, else the error. It returns `r.ok`.
- The focus button handler: `act({ type: 'focus', pane_id: target }, ...)`.
- The `#say` submit handler: skips an empty message, then calls `act({ type: 'prompt', pane_id: target, text }, ...)`. On success it clears `#msg` if the text did not change during the request.
- `loadMessages()`: for a claude desk, `GET /messages?pane=<id>` with the header `x-office-token: TOKEN`. It drops a reply when the pane is no longer `selected`. On success it stores the list. On an error it shows the error in `#lastText` and keeps the messages and the log.
- `renderMessages(err)`: `#lastText` gets the text of the last `agent` message. `#chatLog` gets one `.msg` element for each message: a role line (`you`, the agent name, or `subagent · <from>`) and the text. The three roles have three border colors. `#lastText` changes only when its text changes, and shows `...` until the first agent reply. It re-renders only when the list changed, so the scroll position and a selection stay. It keeps the log at the bottom when the log was at the bottom.
- `#chatOpen` calls `showModal()` on `#chat`, sets `#chatWho`, scrolls the log to the bottom, and focuses `#replyMsg`. `#chatClose` and Esc close it. The Escape handler closes the panel only when `#chat` is not open.
- The `#reply` submit handler works like `#say`: it calls `act()` with `type: 'prompt'` and `$('chatResult')`, clears `#replyMsg` on success, and calls `loadMessages()`.
- Transcript text goes into the page with `textContent` only.
- The `p.warn` text in `#panel` is about focus only. The message field has no warning. A new write button needs its own warning.

### Picking

- The pointerdown handler stores `down` and clears `goal`.
- The click handler ignores a drag over 4 px. It casts a ray against one box for each desk, each away head seat, and each subagent seat, and opens the nearest hit. The boxes come from the model, because `bake()` merged the desk meshes. A worker on a trip has no box, and a new clickable object needs its own box.

### Frame loop and data source

- Demo (`?demo`): disables the focus button and the message field, and calls `update()` with `demoSnapshot()` and `demoMeetings()` at once and each 1000 ms.
- Live: `es.onmessage` calls `setOnline()`, and `update()` only when `m.snapshot` is set. An offline message keeps the old scene, dimmed.
- `es.onerror` sets `es.onopen` to `location.reload()`, so the page gets the new token of a restarted bridge. A herdr outage with a live bridge sends an offline message, and the page does not reload.

## Regions for parallel agents

Two agents in one region need a split by function.

| Region | Functions | Shares with |
|---|---|---|
| build | `build()`, `bake()`, the floor and wall functions, `door()`, their constants, `DECOR`, `ROOM_FLOOR` | update, desk |
| desk | `desk()`, `seatAt()`, `attendee()`, `deskChair` | worker, pose, picking (seat offset) |
| worker | `worker()`, `shirt()`, `SHIRT` | pose, breaks, update, `test/walk.test.mjs` |
| screens | `screenCtx()`, `typing()`, `browse()`, `rnd()`, `glow`, `haloGeo`, `IDLE`, `INK`, `PIC` | pose, build |
| breaks | `breaks()`, `stroll()`, `trips`, `claimed` | update, pose, `model.js`, `test/walk.test.mjs` |
| doors | `swing()`, `doors`, `ajar`, `OPEN`, `SWING` | build (`door()`), pose, frame loop, `model.js`, `test/walk.test.mjs` |
| pose | `pose()`, `ARM`, `moving` | screens, breaks, doors, frame loop |
| declutter | `declutter()`, `tags`, `seen`, `nextPass` | update, frame loop |
| update | `update()`, `family()`, `office`, `sig`, `laid` | all regions |
| hud | `hud()`, `el()`, `rows`, `setOnline()`, `who()`, `plural()` | fill, camera (`goal`), `index.html` |
| fill | `open()`, `close()`, `fill()`, `act()`, `loadMessages()`, `renderMessages()`, `timer`, `msgs`, `msgKey`, the focus button, `#say`, `#chatOpen`, `#chatClose`, and `#reply` handlers | hud, picking, `index.html` |
| camera | `fit()`, `frame()`, `keepInView()`, `resize()`, `VIEW`, `OFFSET`, `controls`, the `goal` glide | hud, update, picking |
| picking | the pointerdown and click handlers | fill, desk (seat geometry) |

Give a change to `label()`, `fresh()`, `shared()`, a shared constant, or the import lines to one agent only. A new decor function changes the `./decor.js` import and `DECOR`, so it goes to the build agent.

## Change recipes

After each recipe, run `node --check` once for each changed file in `public/`, and run `npm test`.

A new status look on the worker:

1. `worker()`: add the part with `lit()` or `fresh()`, before the `mats` line, and return it. Do not pass a color string.
2. `pose()`: set its visibility after the walk or desk branch, like `paper`, so a run back shows it. To hide it on a walk, set it in both branches.
3. An arm pose goes in `ARM` (desk), or in `stroll()` and the arm reach in `test/walk.test.mjs` (walk).
4. No `sig`, `live`, or `tags` change: `g` is in `live`, and the geometry stays the same after the build.
5. Check the look in `?demo` (`docs/testing.md` "Visual check in the browser").
6. Update the status row in `INTENT.md` "What the office shows". Ask the user first if the look is new.

A new label:

1. Make it with `label()` in a build function, under `world`, and add its CSS in `public/index.html`. Do not put it on a mesh outside `live`, because `bake()` can remove that mesh.
2. Keep the element in a view, and set its text in `update()` with `textContent`.
3. Add it to the `tags` literal in `update()`. Badges use 10 to 14, and door signs 0 to 4.
4. If it moves without a camera move, set `moving = true` in that frame. Else `declutter()` skips the label until the camera moves or `update()` runs.

A new field in the panel:

1. `fill()`: add a key to the local `rows` object, in the desk or the subagent branch.
2. A new model field goes into `buildOffice()`, with a test in `test/model.test.mjs`.
3. A field from the bridge must come from metadata. Its test in `test/bridge.test.mjs` checks that `SECRET` is not in the output.
4. No `sig` change: `update()` calls `fill()` while the panel is open.
5. Update `INTENT.md` "What the office shows" or "Meetings", and `CLAUDE.md` "Contracts between the files".

A new HUD column:

1. In `hud()`, put `el('span', ...)` children into the button with `replaceChildren()`. Add a grid layout for `#list button` in `public/index.html`, and keep the `::before` mark. The row ellipsis comes from the `#list button` rules, so each span needs them too.
2. Keep the button in `rows`. A new button each update breaks keyboard focus.
3. A new HUD line: add an element to `#hud`, and set its `textContent` in `hud()`.
4. Update the HUD line in `INTENT.md` "What the office shows".

New geometry that depends on a new desk field:

1. `buildOffice()`: add the field to the desk, with a test in `test/model.test.mjs`.
2. `desk()`: draw the part. `update()`: add the field to the desk tuple in `s`, or the scene keeps the old geometry.
3. If `route()` reads the field, add it to `lay` too. A `lay` change ends every trip, so keep a field that changes often out of it.
4. If the part changes after the build, add it to `live` and to the desk view.
5. Update the signature line in `CLAUDE.md` "Scene conventions" and the desk line in "Contracts between the files".

A new room kind on the 3D side:

1. `buildOffice()` makes the room with `door` and `pods` (`[]` is valid).
2. `decor.js`: export a decor function `(g, room)` in room-local coordinates, with props from `placer()`.
3. `office.js`: import it and add it to `DECOR`, or `build()` throws. Add a `ROOM_FLOOR` entry, or the room gets carpet. `door()`, `swing()`, and `update()` need no change, and a room with `status: null` gets the `C.wood` light and sign.
4. Routes use only the workspace rooms, the corridors, and the kitchen. For a walk through the new room, change `route()`, `lay`, and `opens()`.
5. Add the `kind` to `CLAUDE.md` "Contracts between the files", and update `assertPlan()` and the room id checks in `test/model.test.mjs`.

A new color that changes in place:

1. Make the mesh with `box(parent, size, pos, fresh(color))`. Pass `THREE.MeshLambertMaterial` to `fresh()` for a lit look.
2. Add the mesh to `live`, and keep it in a view. Set a status color in `update()`, and a color that changes each frame in `pose()`.
3. A module-level material for many builds needs `shared()`, like `glow`.

A change to the door leaf, the open angle, or the door speed:

1. The leaf and the hinge are in `door()`. The angle and the speed are `OPEN` and `SWING`. Keep the hinge in `live` and in the room view, or `swing()` throws.
2. Update the leaf tip terms in `checkRoute()` in `test/walk.test.mjs`. They come from the hinge at 0.54, the leaf length 1.08, and `OPEN`.
3. Update the leaf numbers in `doorX()`, `stepX()`, `stepZ()`, `laneZ()`, `kitchenZ()`, and `calm()` in `model.js`.
4. A change of which door opens goes in `opens()` (`docs/testing.md` "Change when a door opens").
5. Update decision 20 in `INTENT.md`, and the `route()` and `calm()` lines in `CLAUDE.md` "Contracts between the files".

## Pitfalls

- On a merged mesh, a material color change still shows, but a position, rotation, or visibility change does nothing (`bake()` removed the mesh).
- `bake()` leaves a material with one mesh alone. The seat `logo` is not in `live` and works only for this reason. Do not copy it.
- `bake()` throws when `mergeGeometries()` gets a mix of attribute sets or index types. Put a geometry that is not a `box()` in `live`, or give it its own material.
- `build()` disposes only geometries with `userData.merged`, so never mark a shared one (`CUBE`, `haloGeo`).
- The build reads fields that are not in `sig`: `room.number` in `workspaceDecor()`, and `d.terminalId` in `worker()` and the view `seed`. A change of only such a field keeps the old look until the next rebuild.
- Much module state (`world`, `views`, `live`, `doors`, `glow`, `haloGeo`, `office`) is declared below the functions that use it. A call to `update()` or `build()` above those lines throws a `ReferenceError`.
- `update()` replaces `v.desk` each update, so a desk captured in a build closure goes stale. Read `v.desk`.
- In `fill()`, the local `rows` object hides the module `rows` map.
- A desk or tab status outside the five makes `pose()` or `update()` throw (`COLOR[s]` and `ARM[s]` are `undefined`). A new herdr status needs entries in `STATUS_RANK`, `STATUS_COLOR`, and `counts` in `model.js` (`test/model.test.mjs` checks the keys), and in `ARM`.
- The desk branch of `pose()` must reset each value that `stroll()` sets, or a worker keeps the walk pose.
- `stroll()` sets a desk-local position without a turn. This works only because a desk group has no rotation.
- A worker part from `box(g, ..., '#hex')` gets the cached material. `mats` makes it transparent, so every box with that color fades for `unknown`.
- A worker part below world y 2.1 (the door height) must stay inside the `checkRoute()` footprint. A part above it passes through the lintel, as the beacon does on a blocked run back.
- `swing()` reads `hinge` for each room, so a room without `door()` makes it throw each frame. It must run after the `pose()` loop, or it sees an empty `ajar` and closes each door.
- Keep `SWING` under about 0.4 s. A runner at `RUN` 4 needs about 0.41 s from 3 (where `opens()` starts) to the door lane at about 1.35. No test checks this timing.
- `test/walk.test.mjs` copies numbers from this file: the door posts at 0.6, the leaf tip, the arm length 0.5, the 0.7 swing, the mug size and offset, and `0.1 + 1.1 * calm`. Change them together.
- Text from outside the page goes into the DOM through `textContent` only (`el()`, `update()`, `hud()`, `fill()`). Never use `innerHTML`.
- Keep the demo guard in `fill()` (`DEMO || !target`).
- A new three.js addon import needs an `integrity` entry. See `CLAUDE.md` "Run and check".
