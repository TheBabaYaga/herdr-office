# public/model.js: the office model

`public/model.js` turns a herdr snapshot and the meeting list into the office plan: rooms, pods, desks, corridors, terraces, meeting seats, kitchen spots, kitchen tables and chairs, the party room, and the game tables. It also plans the idle routes, keeps the break timing, and makes the demo data. For the Halloween night, it plans the corridor candelabra, the lightning, and the ghosts. It has no imports and no DOM, so the Node tests import it. `public/office.js` imports `STATUS_RANK`, `STATUS_COLOR`, `buildOffice`, `demoSnapshot`, `demoMeetings`, `candleSpots`, `lightningPlan`, `flash`, `ghosts`, `ghostAt`, `snowflakes`, `flakeAt`, `twinkle`, `rng`, `outdoors`, `hash`, `season`, `daylight`, `route`, `along`, `calm`, `opens`, `stepBreak`, `endBreak`, and `nextStop`. `public/decor.js` imports only `hash` and `rng`, to seed its fill pass with `room.id`. It reads the room fields `id`, `walk`, `counter`, `tables`, `chairs`, `cooler`, `table`, `seats`, `session`, `number`, `door`, `pods`, `booth`, and `floor`, and the terrace fields `id`, `w`, and `d`. The shapes of the office, a room, a desk, and most exported functions are in CLAUDE.md "Contracts between the files".

## When to read this doc

- You change how panes, tabs, or workspaces become desks, pods, or rooms, or you add a snapshot field.
- You change a room size, the band plan, a corridor, a door, or a room kind.
- You change the meeting seats, the orchestrator choice, or a subagent field.
- You change the idle route, the walk rects, the speeds, the break times, or `opens()`.
- You change the demo data.

## Module state

The file has no mutable state. Each `buildOffice()` call makes new objects. The break state lives in Maps that `office.js` owns.

| Name | Holds | Used by |
|---|---|---|
| `STATUS_RANK`, `STATUS_COLOR` | the rank and the HTML color of each status | `rollup()`, and in `office.js` the label priority, the HUD, `COLOR`, the badges, the door signs |
| `GAP_X`, `GAP_Z`, `POD_GAP`, `WALL`, `HALL`, `MAX_ROW` | the desk cell, the pod gap, the free floor to a wall, the corridor width, the widest pod row | `podLayout()`, `buildOffice()`, `bandZ()` |
| `SEAT`, `TABLE(k)` | the meeting table length | `buildOffice()` |
| `LANE` | the half width of a walk rect | `walkRects()`, `games()` |
| `GAMES`, `BIG`, `PAD` | the kinds of game table in search order with their footprint half widths and place offsets, the free floor of a big room (80 m²), and the gap round a table (0.3) | `games()` |
| `WALK`, `RUN` | the walk and run speeds | `tripAt()`, `test/walk.test.mjs` |
| `WAIT` | how long a waiter stays at a game table or the cooler (20 s) if nobody joins it | `stepBreak()`, `test/walk.test.mjs` |
| `DRIFT` | the ghost speed (0.8 a second) | `ghostAt()` |
| `AREA`, `CYCLE`, `DEMO_*` | the demo data | `demoSnapshot()`, `demoMeetings()` |
| `trips`, `claimed` (`office.js`) | desk id to `{ n, next, trip }`, and the spot key `'<kind>:<index>'` to desk id | `stepBreak()`, `endBreak()`. `update()` clears both when `lay` changes |
| `ajar` (`office.js`) | the room ids from `opens()` in this frame | `pose()` fills it, `swing()` reads it |

## Flow

At import, no function runs. For each update, `office.js` calls `buildOffice(snapshot, meetings, office)`, with the old office as `prev`. `buildOffice()` runs these steps in this order:

1. Make a Map of the agent records by `pane_id`.
2. Make the workspace rooms, with their pods and desks (`podLayout()` for each tab).
3. Add the meeting rooms, then the kitchen, then the lobby.
4. Find the band plan.
5. Add the party room to the row with the most spare width, if that width is 7 or more. Then make `rooms` again from the rows.
6. Put each row in place: rooms, doors, pods, desks, the terrace of a row with 4 or more spare width, the band corridors, then the cross corridor.
7. Set the kitchen `counter`, `spots`, `tables`, `chairs`, `chat`, and `cooler`, and the party `spots`, `floor`, and `booth`. Then set `walk` for each workspace room, the kitchen, and the party room (`walkRects(r, desks)`). Then set `games` for each room (`games(r)`), which adds the lanes of each game table to `walk`.
8. Set the meeting `table` and `seats`, the orchestrator `away`, and `subagents`.
9. Set `counts`, `focus`, `bounds`, `entrance`, and `games` (each table of each room, in `rooms` order, with its room id).

Each frame, `pose()` calls `breaks()` for each view with a worker. `breaks()` calls `stepBreak()` and `along()`. `stepBreak()` calls its `route(kind, i)` callback only when a trip starts. `stroll()` calls `calm()`, and `pose()` calls `opens()` for each walker. A subagent view has the desk `{ status: 'working' }` with no `id`, so `stepBreak()` returns `null` for it.

## Functions

### season(date)

`season(date)` returns `'halloween'` from 24 October to 1 November, `'winter'` from 1 December to 6 January, else `null`. It reads the local month and day of the `Date` argument, so a test gives it `new Date(2026, 9, 24)` and not a UTC string. It reads no clock itself. `office.js` calls it with `new Date()`. `buildOffice()` does not use it, and the floor plan does not depend on the season. `test/model.test.mjs` pins the ranges.

### daylight(min)

`daylight(min)` returns the light of the local clock: `{ dir, sun, sunPower, ambient, ground, ambientPower, window, windowGlow, background }`. `min` is the minutes since local midnight. The function takes it modulo 1440 and reads no clock.

- `dir` points from the building center to the sun and has any length.
- Each color is a lowercase `#rrggbb` string.

The function blends six key rows in a cycle:

- 06:00: night, no sun.
- 08:00: low warm sun from the east.
- 13:00: high sun.
- 15:00: the reference day look (decision 9).
- 18:00: low orange sun from the west.
- 21:00: night, no sun. After 21:00 the blend goes to 06:00 of the next day.

Numbers and `dir` mix linearly, and each color mixes per sRGB channel. A key minute gives its row. The night rows use the colors of the Halloween night of `night()`, but their `ambientPower` is 1.5 and their `sunPower` is 0. `test/model.test.mjs` pins the 15:00 row, the high sun at 13:00, and no sun at night. It also checks that no color channel steps by more than 3 from one minute to the next.

### snowflakes(t), flakeAt(f, s), twinkle(ph, t, amp)

- `snowflakes(t)`: `[{ x, z, phase }]` for a terrace `{ x, z, w, d }`. It uses a jittered grid of `cols * rows` cells, each about 2 m² (`round((w - 0.6) / √2)` by `round((d - 0.6) / √2)`). Each cell holds one flake at a random point, each 0.3 or more from each rect edge. `phase` is random. `rng(hash("x,z,w,d", 1e9))` gives the numbers, so the result is deterministic and uses no `Math.random()`. Two flakes can lie close together.
- `flakeAt(f, s)`: `{ x, y, z }`. `y` falls from 2.6 at 0.3 a second, so one fall takes about 8.7 s, and starts again at the top. `x` drifts by `0.1 * sin(s + 6 * phase)`. `z` stays. `y` is the base of the flake box.
- `twinkle(ph, t, amp = 1)`: the halo opacity of one tree bulb, `0.35 + 0.25 * amp * sin(1.5 * t + ph)`. It goes from 0.1 to 0.6 in about 4.2 s. With amp 0.5 (reduce motion) it goes from 0.225 to 0.475.
- `outdoors(bounds)`: 4 rects `{ x, z, w, d }` in a band round the slab (0.3 past each building edge), for `office.bounds`. The band is `Math.max(w, d) / 2 + 3` wide. The rects do not overlap. `snowflakes()` gives the outdoor snow, so it looks like the terrace snow. See `CLAUDE.md` for the four rects.
- `office.js` runs all three only in winter. `test/model.test.mjs` pins the count, the margins, the spread, and the fall.

### candleSpots(o), lightningPlan(rand), flash(plan, s)

- `candleSpots(o)`: the corridor candelabra, `[{ x, z, axis }]`. A spot lies every 4 along each corridor from 2, in turn on its two edges, 0.4 in. `axis` is `'z'` in the cross corridor, else `'x'`. It drops a spot:
  - within 1.3 of a door center along the corridor, when the door is on the same edge (within 0.5 across),
  - for a north door, from 3.0 west to 1.3 east of the door on both edges, so no door sign covers a candelabra,
  - in the cross corridor, within 0.4 of a band corridor mouth.
- `lightningPlan(rand = Math.random)`: draws the wait (20 to 60 s), whether a second flash comes (half of the plans), and the lengths. The first flash is at 0 with power 1 and a length of 0.08 to 0.12 s. The second is 0.3 to 0.6 s later with power 0.6. So two flashes are 0.3 s or more apart.
- `flash(plan, s)`: the power of the flash that holds the time `s`, else 0.
- Only `lightningPlan` may use `Math.random()`. `candleSpots` is deterministic. `office.js` runs both only with the Halloween night.

### rng(s), ghosts(bounds), ghostAt(g, s)

- `rng(s)`: a seeded random source (mulberry32). Each call of the function that it returns gives the next number in [0, 1). The same seed gives the same numbers.
- `ghosts({ w, d })`: the 3 ghosts of the Halloween night. Each ghost is a closed loop of 8 points `{ x, z, hover }`. `x` lies in [1, w - 1], `z` in [1, d - 1], and `hover` in [2, 5] s. Ghost `i` takes the seed `hash('<w>,<d>,<i>', 1e9)`, so the same bounds give the same ghosts. Other bounds give other loops.
- `ghostAt(g, s)`: `{ x, y, z, dx, dz }` at `s` seconds. Leg `i` goes from point `i` to the next point, and the last leg returns to point 0. The ghost floats each leg in a straight line at `DRIFT` (0.8 a second). Then it hovers at the end point for the `hover` of that point. At `s` 0 the ghost is at point 0, and it hovers at point 0 at the end of the loop. One loop takes the sum of the leg lengths divided by 0.8, plus the sum of the hovers.
- `dx, dz` is the unit direction of the current leg, and of the last leg during a hover. `y` is the base of the ghost, `0.35 + 0.05 * sin(pi * s + g[0].x)`: a bob from 0.3 to 0.4 in 2 s. The first point gives the phase, so the three ghosts bob out of step.
- The points lie in the building rectangle, so each straight leg stays inside the building. A ghost passes through walls, rooms, desks, and workers. No route, spot, or door takes it into account.
- `ghosts` and `ghostAt` are deterministic. `office.js` runs them only with the Halloween night.

The first ghost of the demo office (`{ w: 22.5, d: 37 }`):

```text
point 0 (8.96, 7.29), point 1 (11.45, 14.23, hover 2.38), leg 0 is 7.38 long
 0.00 s   at point 0, floats toward point 1, dx 0.34, dz 0.94
 9.23 s   at point 1, hovers, still faces dx 0.34, dz 0.94
11.61 s   floats toward point 2 (6.41, 16.66), dx -0.90, dz 0.43
```

### Status

`rollup(statuses)` returns the status with the highest `STATUS_RANK`. An empty list gives `'unknown'`. A string that is not in `STATUS_RANK` never wins. `buildOffice()` calls it only when herdr sends no `agent_status` for a tab or a workspace. `demoSnapshot()` calls it for each demo tab and workspace.

### Pods and desks

`spread(values, gap)` maps each distinct value to an offset that keeps the proportions, with neighbors `gap` or more apart. Panes with the same center share one offset.

`podLayout(panes, layout)` returns `{ w, d, at }`: `at` maps a pane id to `[x, z]` from the pod corner. Layout y becomes floor z. A pane that is not in `layout.panes` goes to an extra row after the deepest row. A tab with no panes gives a size of `-Infinity`.

### buildOffice(snap, meetings = [], prev = null)

It does not change its inputs. A status change never moves a room, a pod, or a desk.

- Workspaces sort by `number`. Tabs keep the order of `snap.tabs` (the tab-bar order), because `tab.number` is a creation counter.
- A pane whose tab is not in `snap.tabs` gets no desk. A tab whose workspace is missing gets no pod. A pod that passes `MAX_ROW` starts a new pod row, unless it is the first pod of its row.
- The `podDesks` map sets the desk fields. `status` comes from the agent record in `snap.agents`, not from `pane.agent_status`. A pane with no agent record gets `'unknown'` and `agent: null`.
- With no meetings, one meeting room has the id `meeting`, status `null`, and no `session`. `side(m)` is the chair count on one long side (4 or more), and the room gets wider with it.
- The band plan tries each even row count. Each row holds a run of rooms in room order. The plan closest to square wins.
- An even row is a north row with its doors in the south wall. The last row is always a south row. The rooms of a row share the row depth. The pods and desks of a room stay centered.
- A row with 4 or more spare width (`W - sum(row, 'w')`, with a tolerance of 1e-6) keeps the width of each room. A terrace `{ id: 'terrace:<row index>', x, z, w, d }` takes the rest of the row, from the last room to `W`. Each other row stretches its rooms to `W`: each room gets the same extra width, and the last room takes the float rest. The party row has no spare width left, so it never gets a terrace.
- A terrace is not in `rooms`, so doors, signs, routes, `opens()`, `lay`, the HUD, and the focus never see it. A terrace in the first row has `z` 0, and two terraces in back-to-back rows share an edge. `build()` in `office.js` reads both cases.
- The party room comes after the band plan, so the plan score does not see it. It takes the spare width of its row, so the other rooms of that row get no extra width. Its `d` of 6 never makes the row deeper. A change of a room width (a meeting that starts, ends, or grows) can add, move, or remove the party room.
- The party spots stand in two rows round the room middle, 2.0 apart, with the back row 1.0 deeper and offset by 1.0. The DJ booth stands 1.6 behind the back row. With the smallest row depth of 6, the booth back is 0.55 from the far wall.
- The counter length depends on the kitchen door side, because a north door is in the middle of the north wall. Each current plan gives 3 spots.
- The kitchen gets two cafe tables, `off` west and east of the room middle, 0.3 south of it. A chair stands 0.8 west (`rot` 3) and 0.8 east (`rot` 1) of each table, so the kitchen has 4 chairs. `off` is 1.3 for a north door: its door lane ends at the strip, and the east chair keeps away from the east wall, which hides a seated worker from the camera. `off` is 2.1 for a south door: its door lane runs through the middle, and a walker on it reaches 0.77 west of the middle. The back of the inner west chair then stays 0.08 west of that walker (2.02 is the least safe `off`). The rule needs a kitchen 7.1 or more wide and 4.7 or more deep. The kitchen is 8 x 7 or more.
- The i-th meeting room pairs with `meetings[i]`. The default room gets a table and seats, but no orchestrator and no subagents.
- The orchestrator is the first `claude` desk with `cwd === m.cwd`, a `working` one first. It gets `away` from `seats[0]`. With no match, each subagent has `deskId: null`.
- Seat 0 is always taken. A subagent keeps its seat index from `prev.subagents` (by agent id) when that index exists and is free. Each other subagent takes the lowest free index from 1.
- `counts` keys are in HUD order. Only desks with an agent count. An unknown status string adds a key with the value `NaN`.

### Walk geometry

These helpers are not exported. Each one except `R` reads the room door or position, so they work only after step 6. The comment above `doorX()` gives the door leaf geometry, which copies `door()` and `OPEN` in `office.js`.

| Helper | Returns |
|---|---|
| `sgn(r)` | +1 for a south door, -1 for a north door |
| `doorX(r)` | where the worker crosses the wall, away from the leaf |
| `stepX(r)`, `stepZ(r)` | the lane past the leaf, and the depth of the sidestep |
| `bandZ(r)` | the center line of the corridor in front of the door |
| `laneZ(r, p)` | the lane along the pod row of `p` on the door side |
| `asideX(d)` | `d.x + 0.65`: where a worker steps aside from its chair, past the chair back |
| `lastRow(d, p)` | true for a desk of the last row of pod `p`: the lane behind it (`d.z + 1.1`) is at or past the pod edge |
| `kitchenZ(k)` | the strip in front of the counter |
| `partyZ(r)` | the strip between the party door and the dance floor, `d / 2 - 1.5` from the door wall |
| `mainZ(r)` | the main walk line, where the door lane meets the room: `kitchenZ()`, `partyZ()`, or `laneZ()` of the pod row nearest to the door. It reads `r.pods`, so a workspace room needs a pod |
| `hits(a, b)` | true when two rects `[x0, z0, x1, z1]` overlap by more than 1e-9 |

`walkRects(r, desks)` returns the world rects of the free floor that the routes use: the door rects, the door lane and one rect over the strip and the spots (kitchen and party room), a lane from the strip to each kitchen chair, and the lanes round each pod (workspace room). `placer()` in `decor.js` keeps each prop off them.

In a workspace room, each pod gets the row lane, the door rects, the door lane, and the lane east of the pod. In a south-door room, each desk of the last row (`lastRow()`) also gets a lane 0.6 wide at `asideX(d)`, from the pod edge down to the row lane. Before, one rect as wide as the pod covered that floor. So the floor under a short pod next to a tall pod stays free for props, except the lane below each desk. `buildOffice()` passes all desks, and `walkRects()` takes the desks of each pod by `podId`.

### Game tables

`games(r)` returns the game tables of a room: `[{ kind, x, z, places }]`, and `[]` for most rooms. CLAUDE.md "Contracts between the files" gives the shape.

- Only a big room gets a table: a workspace room with a pod, or the party room, with 80 m² or more of free floor (the room floor minus its pods). The rule follows the very big rooms of the live office (209 m² and 452 m² free). Its other rooms had 37 to 64 m².
- It tries ping-pong first, then chess, and places one of each kind at most.
- The search tries each center on a 0.25 grid from the room corner, nearest to `mainZ(r)` first, then west to east. So a table can stand on either side of the main walk line. In the demo party room, both tables stand between the strip and the door wall.
- The footprint (ping-pong 3.5 x 1.2 with its players, chess 1.9 x 1.2 with its rug and chairs) grows by `PAD`. It must stay inside the room, off the pods (grown by `PAD`), the lamp posts, the door area (2.4 x 2, with the open leaf), the dance floor, the booth with its speakers, each walk rect, and the other table.
- Each table adds two kinds of walk rect: the main walk line from the door lane x to the x of each place, and a lane 0.6 wide from that line to each place. The main walk line keeps off its own table. A lane keeps off the pods, the door area, the dance floor, and the booth with its speakers. The main walk line does not get that test, because it crosses the door area and touches the dance floor by design. Both keep off the other table with its pad, and keep their center line 0.4 from each lamp post and 1.0 from each dance spot. `checkRoute()` checks these margins for a route to a place. In 170 test plans, no lane reached the door area, the floor, or the booth before the lane test existed.
- The lanes of the first table join `r.walk` before the second search, so the second table keeps off them.
- A place is 0.62 (chess) or 1.55 (ping-pong) from the center, and the top reaches 0.35 or 1.1. So no lane crosses the table top.
- In a south-door room, a table between the main walk line and the door wall can stand close to the south wall. The camera looks over that wall, so the wall can hide a seated chess player. The `big()` party room and w7 of `big()` with a meeting of 11 show this case.

### route(o, deskId, spot, to = 'kitchen')

The legs follow the CLAUDE.md contract, in the order of the `pts` array. It reads only `o.desks`, `o.rooms`, and `o.corridors.at(-1)`.

- `to` is the id of the target room: the kitchen, the party room, or the room of a game table. Each target uses the same legs. In the target room, the route goes through the door to the main walk line (`mainZ()`: `kitchenZ()`, `partyZ()`, or the row lane of a workspace room), along it to the x of the spot, then straight to the spot. A route to the kitchen or the party room is the same as before the game tables.
- A game route is `route(o, deskId, place, g.room)`. The walk rects of the table (the main walk line to each place x and a lane to each place) hold its last two legs.
- A desk in the room `to` does not cross the door. Its route goes from the desk to the door lane at its own row lane (`[stepX(r), laneZ(r, p)]`), along the door lane to `mainZ(r)`, then to the place x and the place. It stays inside the room.
- A lunch route is `route(o, deskId, chair, 'kitchen')`. The strip of the kitchen walk rects reaches each chair x, so the route goes along the strip to the chair x and then straight to the chair point. That last leg passes 0.8 from the table center.
- `down`: the last desk row of a south-door room (`lastRow()`) walks straight to the lane at `asideX(d)`. Other desks pass the pod on its east side. `walkRects()` uses the same two helpers for the lane below each last-row desk, so change them in one place.
- A room in another band than the target room goes through the cross corridor center.
- The cleanup drops the middle of three points on one line, also when the path turns back on that line. So a new leg must not turn back on its own line.
- Two `ponytail:` comments mark known limits: a room with two pod rows, and the slide through the chair edge.

### Breaks

`calm(dd)` gives the arm freedom from the distance to the nearest door. `stroll()` in `office.js` and `checkRoute()` use it.

`hash(s, m = 360)` returns a string hash in `[0, m)`. `office.js` uses it for the hue of an unknown kind and of a floor, the clutter seed, and both the look and the break seed (`hash(d.terminalId ?? d.id, 1e9)`).

`opens(o, d, a)` returns the room ids whose door the walker of desk `d` opens at `a = { x, z, phase, room }`. `room` is the target room id, from `trip.kind`.

- Only the room of `d` and the room `a.room` can open, while the walker is less than 3 from the door center. Another door on the way stays closed, also the kitchen door for a party walker.
- The 3 gives the door time to open (`SWING` in `office.js`) before a runner at `RUN` reaches the leaf, about 1.35 from the door center.
- The phase `stay` gives `[]`, so the door of the target room closes at the counter or on the dance floor.
- A walker with `a.room` equal to its own room (a game table in its own room) gets `[]`. Its route never leaves the room.

`breakPlan(seed, n)` is deterministic. `wait`, `stay`, `lunch`, `pick`, `game`, and `chat` use the value indices 0, 1, 3, 6, 7, and 8, so a change of one value keeps the other values. `game` sets the game time of a waiter: `30 + 30 * game` s for chess, `20 + 20 * game` s for ping-pong. `chat` is `10 + 15 * u(8)` s, the chat time of a waiter at the cooler. With the 5 kinds of the demo, the index 6 gives `w1:p2` a game first, `w2:p2` a chat first, and `w3:p3` a dance first. The index 2 held the old party coin.

CLAUDE.md gives the contracts of `along()`, `tripAt()`, and `pathLen()`.

`stepBreak()` points that one read can miss:

- It claims a spot and calls `route()` once, at the trip start. The kinds are `kitchen` (a counter spot), `lunch` (a kitchen chair), `party` (a dance spot), `game` (a place at a game table), and `chat` (a place at the water cooler), in this order, and only the kinds with a count above 0. The count of `game` is `2 * tables.length`. `plan.pick` picks the first kind. A full kind sends the worker to the next kind in the order. With no free spot of any kind, it waits for the next plan.
- A free game or chat place for the pick is a place of a pair where both places are free. Table `t` has the places `2t` (west) and `2t + 1` (east), with the keys `'game:<i>'`. The cooler has the places `0` and `1`, with the keys `'chat:<i>'`, when `spots.chat` is above 0.
- Before the pick, a new trip looks for a waiter: a table or the cooler with one claimed place, whose trip has `partner === null`, no rush, and `t < arrival + WAIT`. It takes the other place of the first such table, whatever its pick (the join). Both trips then get `partner`, `begin` (the later arrival), and `end` (`begin` plus the time of the waiter, in `trip.time`). Each `stay` becomes `end - arrival`, so `tripAt()` does not change.
- A waiter that nobody joins stays `WAIT` s and walks back.
- A rush of a player with a partner ends the game of the partner (`quit()`): its `end` becomes the rush time, and its stay ends then, or at its arrival if that is later. The partner walks back, not runs, and keeps its `partner`, so nobody joins it again. After the game end, both players already walk back, so a rush or `endBreak()` of one player does not change the other.
- It returns `play`: true in the `stay` while `begin <= t < end`. A waiter alone never plays.
- It returns `talk`: true only in a chat, while `play` is true and it is the turn of this worker. A turn lasts `2 + hash(String(begin), 100) / 100` s (2 to 3 s), counted from `begin`, the later arrival. The join sets `first: true` on the waiter, and the waiter talks in the even turns. So exactly one of the two talks at each time, also when both trips start in one frame.
- `trip.kind` is the trip kind, so a lunch trip has `kind: 'lunch'`. `office.js` gives `opens()` the room id `kitchen` for it. For a game trip, `opens()` needs the room of the table: `o.games[trip.table].room`.
- A lunch trip stays `plan.lunch` (20 to 40 s). A game or chat trip stays `WAIT` until a join. The other trips stay `plan.stay`.
- The spot search of a kind starts at `seed % n`, with `n` the spot count of that kind, so `seed` must be a non-negative integer.
- A rush is final: an idle status after it does not stop it. After a rush, it deletes the state.
- At `done` it returns `null` in the same call, so a walk phase is never `done`.
- `got` becomes true in the `stay` of a kitchen trip, so the mug stays in the hand. A lunch trip and a party trip never get it. `stroll()` writes `trip.rot`.

`endBreak(trips, claimed, id, t)` frees the spot of a running trip (the `claimed` key in `trip.spot`), ends the game of its partner at `t` (as a rush does), and deletes the state. Pass `t`: without it, the stay of the partner becomes `NaN`.

### nextStop(o, trips, t, seen)

`nextStop()` picks the next stop of the camera tour. It reads `trips` (the map of `stepBreak()`) and the phase from `tripAt()`. It returns `{ stop: { key, x, z, room, whole }, seen }`. `whole` is `true` for a room stop only.

| Kind | Key | x, z | room | Rule |
|---|---|---|---|---|
| blocked desk | `desk:<id>` | `d.away ?? d` | `d.roomId` | each blocked desk, in `o.desks` order |
| done desk | `desk:<id>` | `d.away ?? d` | `d.roomId` | each done desk, in `o.desks` order |
| game | `game:<table>` | `o.games[table]` | the room of the table | each table with a player in play, by table index |
| dance | `dance` | the center of the party `floor` | `party` | a trip in the phase `stay` with `kind === 'party'` |
| lunch | `lunch` | the mean of the kitchen `tables` | `kitchen` | a trip in the phase `stay` with `kind === 'lunch'` |
| room | `room:<id>` | the room center | `r.id` | each room of `o.rooms`, only when the list above is empty |

The pick is the first stop whose key is not in `seen`, and `seen` gets its key. When all stops are in `seen`, a new round starts. It picks the first stop whose key is not `seen.at(-1)`, else the first stop, and `seen` is `[key]`. So the same stop never comes two times in a row, unless it is the only stop. A new blocked desk comes next, also in the middle of a round. `office.js` calls it every 10 s. The play rule is `inPlay()`, which `stepBreak()` also uses for `play`.

### Demo

A `DEMO_PANES` row is `[paneId, tabId, kind, rect, phase, name, long]`. `kind` `null` is a shell. The comment above `DEMO_PANES` gives the `phase` rule that keeps all four `CYCLE` statuses on each tick. Only `w1:p2`, `w2:p2`, and `w3:p3` have `long` (`[idle ticks, start tick]`), and they ignore `phase`. The row index gives `terminal_id` `term_demo<i>` and breaks `state_change_seq` ties with `* 16 + i`.

`demoSnapshot(tick)` has the shape of a herdr `session.snapshot`. `w4:p1` is `unknown` while `tick < 3`. `done` in the focused tab `w1:t1` shows as `idle`.

`demoMeetings(tick)` returns one meeting with the cwd `/home/demo/api`, so `w1:p1` is the orchestrator. Each subagent run gets a new id. The meeting exists from tick 0, so `?demo` never shows a meeting start, a meeting end, or an orchestrator move. A check of these needs a scratch change to the demo data.

## Change recipes

### A new room kind

1. Push the room after the meeting rooms and before `lobby`, with the fields of the `['kitchen', 'lobby']` loop. The room order and the widths set the row and the door side. No option pins a room to a row, so a room that needs one door side needs a change to the band plan.
2. If workers walk to it, extend `walkRects()`, the `r.walk` line, the strip depth in `route()`, the room pick in `stepBreak()`, `spots` in `breaks()`, and the room filter of `lay` in `office.js`. `opens()` already opens the door of the target room.
3. Add a decor function in `decor.js` and an entry in `DECOR` in `office.js`, else `build()` throws. Add a floor to `ROOM_FLOOR`, else it gets carpet.
4. `sig` already holds each room position. A room that changes size at run time moves other rooms, so `lay` changes and each trip ends.
5. Update `assertPlan()` and the room id list in "buildOffice maps rooms, pods and desks" in `test/model.test.mjs`. `assertPlan()` checks the exact room list (without the party room), and the label, `number`, `status`, `pods`, and minimum size of each room that is not a workspace. `normal()` in `test/model.test.mjs` copies the width of each room kind, so a new kind with another width needs a change there.
6. A new room is a user decision (INTENT.md decision 9). Ask the user first, then add a numbered decision to INTENT.md "Decisions". Update the `kind` list in CLAUDE.md "Contracts between the files", and this doc.

### A new kitchen spot or a new counter length

1. Change `len` or the spot formula in the kitchen block. Keep the spot count at 2 or more, because `n - 1` is a divisor.
2. "the kitchen has a counter and at least 3 standing spots in front of it" asserts the ranges. Change it if the user wants another range.
3. For more spots, raise the cap in `len` and the kitchen width together. The `['kitchen', 'lobby']` loop gives both kinds one size. The test of step 2 limits `len` to 3.2, so change it too.
4. Keep the spot depth and `kitchenZ()` together, so a walker passes 0.55 from each spot.
5. A longer counter or a wider strip can touch a table. `assertKitchen()` in `test/model.test.mjs` and the kitchen test in `test/walk.test.mjs` check the tables and chairs. Node cannot load `decor.js`, so check by hand that `kitchen()` still fits the fridge.
6. Update the kitchen line in CLAUDE.md "Contracts between the files".

### New break times or new speeds

1. Change the ranges in `breakPlan()`, or `WALK` and `RUN`, and the test "breakPlan is deterministic and stays in range". The pick test copies the `wait` and `stay` formula in `before()`, so change it too.
2. Run `npm test`. The long-idle demo test needs a full trip of each long-idle agent, a trip that a status change cuts short, a game, and a chat. A longer trip needs larger `long` values.
3. A faster `RUN` gives a door less time. Keep `(3 - 1.35) / RUN` above `SWING` (0.25 s) in `office.js`, or change the 3 in `opens()`.
4. Update the trip times in CLAUDE.md "Contracts between the files", the comment above `DEMO_PANES`, INTENT.md "Open items and known limits", and `docs/testing.md` "Visual check in the browser".
5. INTENT.md decision 19 holds the times that the user approved. Ask the user before you change them. Then update decision 19 and the sentence "The user did not tune them" in INTENT.md "Open items and known limits".

### A new desk field

1. Add the field in the `podDesks` map. Put an agent-only field inside `agent`.
2. Add it to the `deepEqual` of `desk('w2:p2')` in "buildOffice maps rooms, pods and desks" in `test/model.test.mjs`. That assertion fails on any new key.
3. If geometry depends on it, add it to `sig` in `update()`. If a route depends on it, add it to `lay`.
4. Show text from herdr with `textContent` only.
5. For a new snapshot key, add it to `demoSnapshot()`, `KEYS`, and the `pane()` or `agent()` helper that `synthetic()` uses in `test/model.test.mjs`.
6. The field must not move a desk on a status change. "positions do not change when only statuses change" checks this.
7. Update the desk line in CLAUDE.md "Contracts between the files".

### A new demo agent

1. Append a row to `DEMO_PANES`. Do not insert it in the middle (see Pitfalls).
2. Give it a rect that fits the tiling of its tab. Add a new tab to `DEMO_TABS` and a new workspace to `DEMO_WORKSPACES`.
3. Pick a `phase` that keeps all four `CYCLE` statuses on each tick.
4. Do not add a claude pane in `w1`, because it can become the orchestrator. "demo meeting: the lead and subagents that finish and restart" expects `w1:p1`.
5. Update the counts in "demoSnapshot has the snapshot shape" and "demo ticks 0..50".
6. For a new subagent, append a row to `DEMO_AGENTS`. The offsets `8 * i` keep the empty windows apart for 4 agents only.
7. Keep `DEMO_PANES` at 16 rows or fewer, because of the `* 16 + i` tie break.
8. Update the demo lines in CLAUDE.md "Contracts between the files" and INTENT.md "What the office shows".

### A change of the route or the door geometry

1. Change `route()` and the matching rects in `walkRects()`. Each route point in a room must be in a pod or a walk rect, else `checkRoute()` fails.
2. A route through a third door needs a change in `opens()`. No test finds this, because `checkRoute()` treats each door within 3 as open.
3. A door change touches `door()` and `OPEN` in `office.js`, the walk helpers, `calm()`, the 3 in `opens()`, and the leaf checks in `checkRoute()`.
4. If `route()` reads a new office field, add it to `lay` in `update()`.
5. Update the `route()` and `calm()` lines in CLAUDE.md "Contracts between the files", and the route items in INTENT.md "Open items and known limits".

## Pitfalls

- Do not add an import or a DOM call. The Node tests import the file directly.
- The lobby must stay `rooms.at(-1)`, because `entrance` uses it.
- The cross corridor must stay `corridors.at(-1)`. `route()`, `build()`, and `lay` read it there.
- Meeting rooms pair with `meetings` by index. Do not sort or filter them.
- With a party room, `rooms` comes again from `plan.rows`. The rows hold the rooms in room order, so the meeting order and the lobby place stay. A change to the band plan must keep that order.
- The 4 of the terrace rule is also in `assertRows()` in `test/model.test.mjs`. Change both together. A terrace id holds the row index, and `terrace()` in `decor.js` seeds its fill with it.
- `assertSpacing()` and `assertPlan()` copy `GAP_X`, `GAP_Z`, `WALL`, and `HALL`. A change of one needs a test change.
- `normal()` in `test/model.test.mjs` copies the room widths: 7 and `2 * WALL` for a workspace, 8 and `TABLE + 2.6` for a meeting room, and 8 for the kitchen and the lobby. A change of one needs a test change.
- The walk helpers, `calm()`, and `checkRoute()` copy the door numbers of `door()` and `OPEN`. The `opens` test uses 1.4 and 3. Change them together.
- `opens()` reads the distance to the door center. A seat within 3 of its own door opens that door at the trip start.
- `LAMP` in `decor.js` puts the lamp post on the west side of each pod. A lamp on the east side breaks the routes.
- Room widths have float noise. Compare positions with a tolerance, as `route()` does.
- A status change can move `away` to another desk, because the orchestrator choice prefers a `working` desk. That changes `sig` and rebuilds the scene.
- A desk with an agent record and no `agent` key gets `kind: null`. `sig` stores it as `'?'`.
- A trip keeps its `path` after a new office arrives. That is why `office.js` clears `trips` when `lay` changes.
- A `claimed` key is a string `'<kind>:<index>'`, for example `'lunch:2'` or `'game:3'`. A number key never matches.
- A new `breakPlan()` value needs a free index: 2, 4, 5, or 9 or more. The index of an old value changes its numbers, for example the pick of each trip. A new pick index changes the trips of the demo agents.
- A new row in the middle of `DEMO_PANES` changes the terminal id, the look, and the break seed of each later row. The long-idle demo test can then fail.
