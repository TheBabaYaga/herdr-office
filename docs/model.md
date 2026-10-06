# public/model.js: the office model

`public/model.js` turns a herdr snapshot and the meeting list into the office plan: rooms, pods, desks, corridors, meeting seats, kitchen spots, and the party room. It also plans the idle routes, keeps the break timing, and makes the demo data. It has no imports and no DOM, so the Node tests import it. `public/office.js` imports `STATUS_RANK`, `STATUS_COLOR`, `buildOffice`, `demoSnapshot`, `demoMeetings`, `hash`, `route`, `along`, `calm`, `opens`, `stepBreak`, and `endBreak`. `public/decor.js` does not import the file, but it reads the room fields `walk`, `counter`, `table`, `seats`, `session`, `number`, `door`, `pods`, `booth`, and `floor`. The shapes of the office, a room, a desk, and most exported functions are in CLAUDE.md "Contracts between the files".

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
| `LANE` | the half width of a walk rect | `walkRects()` |
| `WALK`, `RUN` | the walk and run speeds | `tripAt()`, `test/walk.test.mjs` |
| `AREA`, `CYCLE`, `DEMO_*` | the demo data | `demoSnapshot()`, `demoMeetings()` |
| `trips`, `claimed` (`office.js`) | desk id to `{ n, next, trip }`, and the spot key `'<room>:<index>'` to desk id | `stepBreak()`, `endBreak()`. `update()` clears both when `lay` changes |
| `ajar` (`office.js`) | the room ids from `opens()` in this frame | `pose()` fills it, `swing()` reads it |

## Flow

At import, no function runs. For each update, `office.js` calls `buildOffice(snapshot, meetings, office)`, with the old office as `prev`. `buildOffice()` runs these steps in this order:

1. Make a Map of the agent records by `pane_id`.
2. Make the workspace rooms, with their pods and desks (`podLayout()` for each tab).
3. Add the meeting rooms, then the kitchen, then the lobby.
4. Find the band plan.
5. Add the party room to the row with the most spare width, if that width is 7 or more. Then make `rooms` again from the rows.
6. Put each row in place: rooms, doors, pods, desks, the band corridors, then the cross corridor.
7. Set the kitchen `counter` and `spots`, and the party `spots`, `floor`, and `booth`. Then set `walk` for each workspace room, the kitchen, and the party room (`walkRects()`).
8. Set the meeting `table` and `seats`, the orchestrator `away`, and `subagents`.
9. Set `counts`, `focus`, `bounds`, and `entrance`.

Each frame, `pose()` calls `breaks()` for each view with a worker. `breaks()` calls `stepBreak()` and `along()`. `stepBreak()` calls its `route(room, i)` callback only when a trip starts. `stroll()` calls `calm()`, and `pose()` calls `opens()` for each walker. A subagent view has the desk `{ status: 'working' }` with no `id`, so `stepBreak()` returns `null` for it.

## Functions

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
- An even row is a north row with its doors in the south wall. The last row is always a south row. The rooms of a row stretch to the row depth and share the building width. The pods and desks of a room stay centered.
- The party room comes after the band plan, so the plan score does not see it. It takes the spare width of its row, so the other rooms of that row get no extra width. Its `d` of 6 never makes the row deeper. A change of a room width (a meeting that starts, ends, or grows) can add, move, or remove the party room.
- The party spots stand in two rows round the room middle, 2.0 apart, with the back row 1.0 deeper and offset by 1.0. The DJ booth stands 1.6 behind the back row. With the smallest row depth of 6, the booth back is 0.55 from the far wall.
- The counter length depends on the kitchen door side, because a north door is in the middle of the north wall. Each current plan gives 3 spots.
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
| `kitchenZ(k)` | the strip in front of the counter |
| `partyZ(r)` | the strip between the party door and the dance floor, `d / 2 - 1.5` from the door wall |

`walkRects(r)` returns the world rects of the free floor that the routes use: the door rects, the door lane and one rect over the strip and the spots (kitchen and party room), and the lanes round each pod (workspace room). `placer()` in `decor.js` keeps each prop off them.

### route(o, deskId, spot, to = 'kitchen')

The legs follow the CLAUDE.md contract, in the order of the `pts` array. It reads only `o.desks`, `o.rooms`, and `o.corridors.at(-1)`.

- `to` is the id of the target room. The kitchen and the party room use the same legs. Only the strip depth differs: `kitchenZ()` or `partyZ()`. A route to the kitchen is the same as before the party room.
- `down`: the last desk row of a south-door room walks straight to the lane. Other desks pass the pod on its east side.
- A room in another band than the target room goes through the cross corridor center.
- The cleanup drops the middle of three points on one line, also when the path turns back on that line. So a new leg must not turn back on its own line.
- Two `ponytail:` comments mark known limits: a room with two pod rows, and the slide through the chair edge.

### Breaks

`calm(dd)` gives the arm freedom from the distance to the nearest door. `stroll()` in `office.js` and `checkRoute()` use it.

`hash(s, m = 360)` returns a string hash in `[0, m)`. `office.js` uses it for the hue of an unknown kind and of a floor, the clutter seed, and both the look and the break seed (`hash(d.terminalId ?? d.id, 1e9)`).

`opens(o, d, a)` returns the room ids whose door the walker of desk `d` opens at `a = { x, z, phase, room }`. `room` is the target room id, from `trip.room`.

- Only the room of `d` and the room `a.room` can open, while the walker is less than 3 from the door center. Another door on the way stays closed, also the kitchen door for a party walker.
- The 3 gives the door time to open (`SWING` in `office.js`) before a runner at `RUN` reaches the leaf, about 1.35 from the door center.
- The phase `stay` gives `[]`, so the door of the target room closes at the counter or on the dance floor.

`breakPlan(seed, n)` is deterministic. `wait`, `stay`, and the coin `party` use the value indices 0, 1, and 2, so a change of one value keeps the other values.

CLAUDE.md gives the contracts of `along()`, `tripAt()`, and `pathLen()`.

`stepBreak()` points that one read can miss:

- It claims a spot and calls `route()` once, at the trip start. The coin of the plan picks the first room. A full room, or a room with no spots, sends the worker to the other room. With no free spot in either room, it waits for the next plan.
- The spot search in a room starts at `seed % n`, with `n` the spot count of that room, so `seed` must be a non-negative integer.
- A rush is final: an idle status after it does not stop it. After a rush, it deletes the state.
- At `done` it returns `null` in the same call, so a walk phase is never `done`.
- `got` becomes true in the `stay` of a kitchen trip, so the mug stays in the hand. A party trip never gets it. `stroll()` writes `trip.rot`.

`endBreak(trips, claimed, id)` frees the spot of a running trip (the `claimed` key in `trip.spot`) and deletes the state.

### Demo

A `DEMO_PANES` row is `[paneId, tabId, kind, rect, phase, name, long]`. `kind` `null` is a shell. The comment above `DEMO_PANES` gives the `phase` rule that keeps all four `CYCLE` statuses on each tick. Only `w2:p2` and `w3:p3` have `long` (`[idle ticks, start tick]`), and they ignore `phase`. The row index gives `terminal_id` `term_demo<i>` and breaks `state_change_seq` ties with `* 16 + i`.

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
5. Node cannot load `decor.js`. Check by hand that `kitchen()` still fits the fridge and a cafe table.
6. Update the kitchen line in CLAUDE.md "Contracts between the files".

### New break times or new speeds

1. Change the ranges in `breakPlan()`, or `WALK` and `RUN`, and the test "breakPlan is deterministic and stays in range". The coin test copies the old `wait` and `stay` formula in `before()`, so change it too.
2. Run `npm test`. The long-idle demo test needs a trip that fits in an idle stretch and a trip that a status change cuts short. A longer trip needs larger `long` values.
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
- `assertSpacing()` and `assertPlan()` copy `GAP_X`, `GAP_Z`, `WALL`, and `HALL`. A change of one needs a test change.
- `normal()` in `test/model.test.mjs` copies the room widths: 7 and `2 * WALL` for a workspace, 8 and `TABLE + 2.6` for a meeting room, and 8 for the kitchen and the lobby. A change of one needs a test change.
- The walk helpers, `calm()`, and `checkRoute()` copy the door numbers of `door()` and `OPEN`. The `opens` test uses 1.4 and 3. Change them together.
- `opens()` reads the distance to the door center. A seat within 3 of its own door opens that door at the trip start.
- `LAMP` in `decor.js` puts the lamp post on the west side of each pod. A lamp on the east side breaks the routes.
- Room widths have float noise. Compare positions with a tolerance, as `route()` does.
- A status change can move `away` to another desk, because the orchestrator choice prefers a `working` desk. That changes `sig` and rebuilds the scene.
- A desk with an agent record and no `agent` key gets `kind: null`. `sig` stores it as `'?'`.
- A trip keeps its `path` after a new office arrives. That is why `office.js` clears `trips` when `lay` changes.
- A `claimed` key is a string `'<room>:<index>'`. A number key never matches.
- A new `breakPlan()` value needs the index 3 or more. The index of an old value changes its numbers, for example the coin of each trip.
- A new row in the middle of `DEMO_PANES` changes the terminal id, the look, and the break seed of each later row. The long-idle demo test can then fail.
