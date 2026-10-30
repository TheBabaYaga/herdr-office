# herdr-office docs

These docs describe the code of herdr-office, with one doc for each source area. `CLAUDE.md` holds the contracts between the files and the safety rules, and `INTENT.md` holds the decisions of the user and the cut features.

## Which doc to read

| Task | Doc and section | Main functions |
|---|---|---|
| The 3D look of a worker or a desk | `docs/office.md` "View shapes" (the worker parts, heights, and facing), "Desks, seats, and workers", "Screens", "pose()" | `worker()`, `shirt()`, `desk()`, `seatAt()`, `attendee()`, `pose()`, `typing()`, `browse()` |
| Status ranks, colors, and the roll-up | `docs/model.md` "Status", `docs/office.md` "Pitfalls" (a new status) | `rollup()`, `STATUS_RANK`, `STATUS_COLOR`, `COLOR`, `ARM` |
| Labels and decluttering | `docs/office.md` "declutter()", "update()", the recipe "A new label" | `label()`, `declutter()`, `update()` (`tags`) |
| The HUD and the panel | `docs/office.md` "HUD", "Panel". The markup is in `public/index.html` (`#hud`, `#panel`, `#chat`) | `hud()`, `el()`, `setOnline()`, `open()`, `close()`, `fill()`, `act()` |
| The last reply and the chat window | `docs/office.md` "Panel", `docs/bridge.md` "`messagesIn(text)`", "`readMessages(projects, pane, limit = 100)`", "`GET /messages` branch" | `loadMessages()`, `renderMessages()`, `readMessages()`, `messagesIn()`, `readCodexMessages()`, `codexMessagesIn()` |
| Camera and picking | `docs/office.md` "Camera", "Picking" | `resize()`, `fit()`, `frame()`, `keepInView()`, the camera tour, the canvas `pointerdown` and `click` handlers |
| The floor plan, the room layout, and the terraces | `docs/model.md` "Pods and desks", "buildOffice(snap, meetings = [], prev = null)". `docs/office.md` "Floors and walls", "Build and bake" | `buildOffice()`, `podLayout()`, `spread()`, `build()`, `inner()`, `outer()`, `stub()` |
| Kitchen and party trips, and routes | `docs/model.md` "Walk geometry", "route(o, deskId, spot, to = 'kitchen')", "Breaks". `docs/office.md` "Idle breaks" | `route()`, `walkRects()`, `stepBreak()`, `endBreak()`, `tripAt()`, `breakPlan()`, `along()`, `breaks()`, `stroll()` |
| Doors | `docs/office.md` "Floors and walls" (`door()`), "Idle breaks" (`swing()`), the recipe for the door leaf. `docs/model.md` "Breaks" (`opens()`). `docs/testing.md` "Change when a door opens" | `door()`, `swing()`, `opens()`, `calm()` |
| Seasonal decor | `docs/decor.md` "Seasonal props". `docs/model.md` "season(date)", "snowflakes(t), flakeAt(f, s)", "outdoors(bounds)". `docs/office.md` "Frame loop and data source" (`SEASON`, the minute timer), "Winter snow". `INTENT.md` decisions 31 and 34 | `season()`, `SEASON`, `pumpkin()`, `bat()`, `web()`, `xmasTree`, `snow()`, `snowflakes()`, `flakeAt()`, `snowfall()` |
| The Halloween night and the ghosts | `docs/office.md` "Halloween night". `docs/model.md` "candleSpots(o), lightningPlan(rand), flash(plan, s)" and "rng(s), ghosts(bounds), ghostAt(g, s)". `docs/decor.md` "Seasonal props" (`candleSpot()`). `docs/testing.md` "The Halloween night tests". `INTENT.md` decisions 31 to 33 | `night()`, `candelabra()`, `candles()`, `lightning()`, `ghost()`, `haunt()`, `candleSpots()`, `lightningPlan()`, `flash()`, `ghosts()`, `ghostAt()`, `candleSpot()` |
| The clock light (day and night) | `docs/office.md` "Halloween night" (`night()`, `CASTLE`, `reach`, `TIME`, `clock()`). `docs/model.md` "daylight(min)". `docs/testing.md` (the `daylight()` tests, the `?time` check) | `daylight()`, `night()`, `clock()`, `TIME`, `CASTLE`, `?time` |
| Decor and props | `docs/decor.md` | `box()`, `placer()`, `workspaceDecor()`, `kitchen()`, `meeting()`, `lobby()`, `terrace()`, `plant()`, `clutter()` |
| The bridge: poll, SSE, action, guards | `docs/bridge.md` "Flow", "`startBridge(options)`", "`GET /events` branch", "`GET /messages` branch", "`POST /action` branch" | `startBridge()`, `handle()`, `poll()`, `send()`, `herdrRequest()`, `socketPath()` |
| The build and the release of the single binary | `docs/release.md` "Build", "Make a release" | `threeFiles()`, `sha384()`, `localHtml()` in `build.mjs` |
| The update check (a newer release) | `docs/bridge.md` "`newer(a, b)` and `latestRelease(fetchFn = fetch, url)`", "`startBridge(options)`". `docs/office.md` "HUD". `docs/release.md` "Update check". `docs/testing.md` "Update check tests". `INTENT.md` decision 38. `docs/idr/0005-update-check.md` | `newer()`, `latestRelease()`, `check()`, `offerUpdate()`, `#update`, `#updateNote` |
| Meetings and subagents | `docs/bridge.md` "`readMeetings(projects, cwds, now = Date.now())`", "Claude subagent helpers", "What may reach the browser". `docs/model.md` "buildOffice(snap, meetings = [], prev = null)" (the meeting rooms, the orchestrator, and the seats). `docs/office.md` "Desks, seats, and workers". `docs/decor.md` "Room decor" | `readMeetings()`, `cwdOf()`, `modelIn()`, `plainTail()`, `buildOffice()`, `attendee()`, `seatAt()`, `longTable()` |
| The demo data | `docs/model.md` "Demo", the recipe "A new demo agent" | `demoSnapshot()`, `demoMeetings()`, `DEMO_PANES`, `DEMO_AGENTS` |
| Tests | `docs/testing.md` | `fakeHerdr()`, `sse()`, `synthetic()`, `assertPlan()`, `assertSeats()`, `checkRoute()` |
| Visual checks | `docs/testing.md` "Visual check in the browser", `CLAUDE.md` "Visual checks" | `demoSnapshot()`, `breakPlan()`, `keepInView()` |
| The herdr protocol | `docs/herdr-agent-model.md` section 3, `docs/bridge.md` "`herdrRequest(sock, method, params = {}, timeoutMs = 3000)`", `CLAUDE.md` "herdr facts the code depends on" | `herdrRequest()`, `socketPath()` |
| A split of `office.js` work between agents | `docs/office.md` "Regions for parallel agents" | the region functions in that table |

## Data flow

```text
herdr server (unix socket)
  |  session.snapshot: one request each cycle, then a 500 ms sleep (pollMs)
  v
bridge.mjs poll()            only while an /events client is connected
  |  readMeetings(): inside a cycle, when 2000 ms (meetMs) passed since the last read
  |  send(): writes only when the JSON changes
  v
GET /events (SSE)            { online: true, snapshot, meetings, update }
  |                          or { online: false, snapshot: null, error, update }
  v
public/office.js             EventSource('/events')
                             or ?demo: setInterval each 1000 ms with demoSnapshot(tick), demoMeetings(tick)
  |
  v
buildOffice(snapshot, meetings, office)     public/model.js, the old office is prev
  |
  v
update(next)
  |-- lay changed: trips.clear(), claimed.clear()
  |-- endBreak() for each desk with away or with no agent
  |-- sig changed: build() (DECOR[r.kind](), door(), partyLights(), terrace(), desk(), attendee(), bake()), frame() on the first build
  |-- night(): the light from CASTLE or daylight(clock()), on each update
  '-- in place: door lights, signs, pod lamps, badges, tags, spot, hud(), fill() when the panel is open
```

Each frame, `renderer.setAnimationLoop()` runs these calls in this order:

```text
follow -> tour -> goal glide -> zoom glide -> controls.update() -> keepInView() -> label font size
  -> moving = false, dancing = false, bubble hidden, ajar.clear()
  -> pose(v, t) for each view with a desk
       breaks() -> stepBreak(), along()     where a worker on a trip is, and its target room
       typing() or browse()                 the screen
       stroll(), opens() -> ajar            the walk or the dance (sets dancing), and the doors to open: its own room and its target room
  -> disco(t)                               the party room parts, on only while a worker dances
  -> rally(t)                               the ping-pong balls, on only while both players of a table play
  -> snowfall(t)                            the winter flakes, at half speed with reduce motion
  -> candles(t)                             the candle flicker (Halloween night)
  -> haunt(t)                               the ghosts float (Halloween), at half speed with reduce motion, and show a clicked balloon for 2 s
  -> bulbLights(t)                          the tree bulb halos twinkle (winter), at half swing with reduce motion
  -> lightning(t)                           the night flash, off with reduce motion
  -> swing(t - last)
  -> seen = '' while a worker walks, at most 4 times a second
  -> renderer.render() -> labels.render() -> declutter()
```

The click path:

```text
click on a desk, a seat, or a worker on a trip (not a drag), or a HUD row
  -> open(id) -> fill()           target = the pane id, or the orchestrator desk of a subagent
  -> a worker on a trip only      follow = id, zoomTo = 1.5 times the zoom
  -> a ghost hit (Halloween)      no open(): until = now + 2 s, and haunt() shows the balloon until then
  -> "Focus in herdr" button      act(): fetch POST /action, header x-office-token, body { type: 'focus', pane_id }
  -> bridge.mjs handle()          Host check, token check, body check
  -> herdrRequest(sock, 'pane.focus', { pane_id })
  -> raiser(): detect again, then open -b <bundle id>   one herdr terminal wins, else the start pick. A failure does not change the reply
  -> 200 { ok: true }             #result shows "ok: herdr focused <id>"

the read path (claude and codex desks only, not in the demo)
  -> open(id) -> loadMessages()   fetch GET /messages?pane=<id>, header x-office-token, then each 2000 ms
  -> bridge.mjs handle()          Host check, token check, pane check, snap
  -> readers.get(pane.agent)      claude: readMessages(claudeDir, pane) and messagesIn(). codex: readCodexMessages(codexDir, pane) and codexMessagesIn()
  -> 200 { messages }             #lastText shows the last agent reply. "Show all" opens #chat

the message field (agent desks only), Enter or "Send"; #reply in the chat window works the same
  -> act(): fetch POST /action    body { type: 'prompt', pane_id, text }
  -> bridge.mjs handle()          Host check, token check, body check
  -> herdrRequest(sock, 'agent.prompt', { target: pane_id, text })
                                  herdr types the text and presses Enter, or rejects a blocked agent
  -> 200 { ok: true }             no raise. #result shows "ok: sent to <id>", and #msg clears
```

- `GET /` serves `public/index.html`, and the bridge puts the token into the `office-token` meta tag.
- The demo page opens no `/events` stream, so the bridge does not poll herdr. The focus button and the message field are disabled in the demo.
- `readMeetings()` gets the cwds of the claude agents in the snapshot. No transcript text goes into the `/events` stream.
- In the release binary, `check()` calls `latestRelease()` at the start and then each hour. Each `/events` message holds its `update`, and `offerUpdate()` shows the update dialog or the update notice.
- An offline message keeps the old scene, and `setOnline()` dims it.
- The first open after an `EventSource` error reloads the page, so the page gets the new token of a restarted bridge.
- A status change calls `build()` only when it moves `away` to another desk (`docs/model.md` "Pitfalls"). Else `update()` and `pose()` set the new look in place.

## Module map

```text
bridge.mjs ------------- serves -------------> public/ (index.html with the token, office.js, model.js, decor.js)
public/index.html ------ importmap ----------> three, three/addons/ (jsDelivr with `npm start`, `/vendor/` in the binary, three 0.186.1)
                  ------ <script module> ----> public/office.js
public/office.js ------- imports ------------> public/model.js, public/decor.js, three, three/addons/
public/decor.js -------- imports ------------> three, public/model.js (hash)
public/model.js -------- imports nothing
test/bridge.test.mjs --- imports ------------> bridge.mjs
test/model.test.mjs, test/walk.test.mjs -----> public/model.js
```

- `bridge.mjs`: the HTTP server, the herdr socket client, the meeting reader, and the message reader. Doc: `docs/bridge.md`.
- `public/index.html`: the importmap, the CSS, the HUD and panel markup, and the `office-token` meta tag. Doc: `docs/office.md` "HUD" and "Panel".
- `public/model.js`: the pure model: the floor plan, the routes, the break timing, the door rule, and the demo data. Doc: `docs/model.md`.
- `public/office.js`: the scene, the workers, the doors, the labels, the HUD, the panel, the camera, the click, and the data source. Doc: `docs/office.md`.
- `public/decor.js`: `box()` and its material cache, the props, the room decor, and the desk clutter. Doc: `docs/decor.md`.
- `test/*.test.mjs`: the bridge, model, and route tests. Doc: `docs/testing.md`.
- Node cannot resolve the bare `three` import, so no test imports `office.js` or `decor.js`.

## Glossary

- tour: the camera visits `nextStop()` places for 10 s each after 5 minutes with no input. Any input ends it. `tourStep()` and `stopTour()` in `office.js`.
- building: the whole office for one herdr session. `office.bounds` holds its size, and `office.entrance` is the entrance in the south outer wall.
- room: an entry of `office.rooms`, with `kind` `workspace`, `meeting`, `kitchen`, `party`, or `lobby`.
- workspace room: the room of one herdr workspace (`kind: 'workspace'`, the id is the workspace id). The rooms follow the workspace `number`.
- cooler: the water cooler on the north wall of the kitchen (`room.cooler`). Two workers chat in front of it.
- chat spot: one of the two places in front of the cooler (`room.chat`). This is not the chat window (`#chat`, the transcript of one agent).
- kitchen: the room with the counter (`room.counter`), the standing spots (`room.spots`), the cooler (`room.cooler`), and the chat spots (`room.chat`). `kitchen()` in `decor.js` draws it.
- lobby: the last room (`rooms.at(-1)`), with the reception and the entrance. `lobby()` in `decor.js` draws it.
- party room: the room with the id `party` in the spare width of one row, if that width is 7 or more. It has the dance spots (`room.spots`), the dance floor (`room.floor`), and the DJ booth (`room.booth`). `party()` in `decor.js` draws it.
- meeting room: one room for each entry of `meetings` (id `meeting:<sessionId>`), or one empty room with the id `meeting`. It has `table` and `seats`.
- corridor: an entry of `office.corridors`, 3 wide (`HALL`). The cross corridor is `corridors.at(-1)` on the +x side.
- terrace: a garden at the east end of a row with 4 or more spare width (not the party row), an entry of `office.terraces`: `{ id, x, z, w, d }` with the id `terrace:<row index>`. The rooms of that row keep their width. It has grass, a wood deck, and props from `terrace()` in `decor.js`, behind glass walls. It is not a room: it has no door, no sign, and no walk rects, and nobody walks there. Two terraces back to back make one courtyard.
- band: a north row of rooms, a band corridor, and a south row of rooms. `bandZ()` gives the center line of the corridor in front of a door.
- door: `room.door: { x, z, side }`, the gap in the corridor wall. `door()` in `office.js` draws the posts, the leaf, the light, and the sign.
- pod: the desks of one herdr tab, an entry of `room.pods` (the id is the tab id). The pod lamp shows the tab status.
- desk: one herdr pane, an entry of `office.desks` (the id is the pane id). `desk()` in `office.js` draws it.
- seat: a meeting chair position in `room.seats` (`{ x, z, rot }`), with the head seat at `seats[0]`. The worker seat at a desk is `(d.x, d.z + 0.4)`.
- worker: the figure of an agent, from `worker()` in `office.js`. It sits at a desk or at a meeting seat.
- ghost: a white sheet with two black eyes that floats through the office in the Halloween season. `ghosts()` in `model.js` gives its loop, and `ghost()` in `office.js` draws it. It is not a worker: it has no desk, no status, and no badge. A click on it shows a balloon with `Boohooo!` for 2 s.
- shell desk: a desk with `agent: null`. It has no worker, and its screen is dark (`SHELL`).
- orchestrator: the claude desk with the same cwd as a meeting session. It gets `away`, and its subagents have its id as `deskId`.
- subagent: a Claude Code subagent that still runs, an entry of `office.subagents`. It sits at a meeting seat and always shows `working`.
- away: `desk.away = { roomId, x, z, rot }`, the head seat of the orchestrator. The worker sits there, and the desk shows an empty chair.
- view: an entry of `views` in `office.js`, by room, pod, desk, or subagent id. It holds the objects that show the state of that id.
- build signature (`sig`): the JSON of the room, pod, desk, and subagent positions, with the agent kind, `away`, `rot`, `model`, the terraces, and the season. `build()` runs only when it changes.
- live: the `Set` of objects that `bake()` does not merge, because their look changes after the build.
- tags: the label elements that `declutter()` checks, highest priority first. `update()` fills it.
- bake: `bake()` merges the static meshes of a build into one mesh for each material.
- route: the path `[[x, z], ...]` from the worker seat to a spot in the kitchen (a counter spot, a chair, or a chat spot), the party room, or at a game table, from `route()` in `model.js`.
- lane: a strip of floor that a route follows: the lane behind the desk row, the row lane (`laneZ()`), and the door lane (`stepX()`). A walk rect reaches `LANE` (0.3) to each side of a route line.
- spot: a standing place at the end of a trip, an entry of `room.spots`: in front of the kitchen counter, a dance spot in the party room, or a chat spot at the water cooler. One worker holds a spot at a time (`claimed`).
- dance spot: a standing place on the dance floor of the party room, an entry of `room.spots` of that room. The spots stand in a front row and a back row, 2.0 apart in a row.
- bubble: the one speech bubble of the office. It shows over the talker of a cooler chat, and the frame loop hides it each frame.
- talker: the worker whose turn it is in a cooler chat (`a.talk`). It waves the right hand, and the bubble shows over it.
- trip: one walk to a spot in the kitchen, the party room, at a game table, or at the water cooler, and back, `trips.get(deskId).trip`. `trip.kind` is `kitchen`, `lunch`, `party`, `game`, or `chat`, and `breakPlan().pick` picks the first kind. A worker that joins a waiter at a game table takes the kind `game`, whatever its pick. The same holds at the cooler for the kind `chat`. Its phases are `out`, `stay`, `back`, `rush`, and `done` (`tripAt()`).
- rush: the run back at `RUN` (4) when the status leaves `idle` during a trip. `trip.rush` holds the start time of the run.
- waiter: a worker alone at a game table or at the water cooler, with no partner and no rush, in its first `WAIT` s after it arrives. A new trip joins it, whatever its pick (`stepBreak()`).
- claimed: the `Map` from a spot key `'<room>:<index>'` (for example `'kitchen:0'`, `'party:3'`, or `'chat:1'`) to the desk id that holds the spot. `stepBreak()` and `endBreak()` change it.
- lay: the JSON of the route inputs in `update()`. A change clears `trips` and `claimed`, so every trip ends.
- browse: the idle screen at the desk, a fake web page or a video, from `browse()`.
- ajar: the `Set` of room ids whose door a walker opens in this frame. `pose()` fills it from `opens()`, and `swing()` reads it.
- hinge: the group in the room view that holds the door leaf and the knob. `swing()` sets `hinge.rotation.y`, and `doors` keeps the angle.
- status: the agent state: `blocked`, `done`, `working`, `idle`, or `unknown`, with the ranks 4 to 0 in `STATUS_RANK`.
- roll-up: the highest-ranked status of a tab or a workspace. The model uses the herdr `agent_status`, and calls `rollup()` only when herdr sends none.
- focus: the herdr focus in `office.focus` (`workspaceId`, `tabId`, `paneId`) and `desk.focused`. The blue `spot` light marks the focused desk, and "Focus in herdr" sends `pane.focus`.
- update: the field `update` of each `/events` message. It is `{ current, latest, atStart }` while a newer release exists, else `null`. `offerUpdate()` shows it as the update dialog (`#update`) or the update notice (`#updateNote`). It is not `update(next)` in `office.js`.
- message: one entry of an agent conversation: a user prompt, an agent reply, or a subagent message (a message from another agent, with `from`). The panel fields (`#say`, `#msg`, `#reply`, `#replyMsg`) send a user message as `type: 'prompt'`, and the bridge sends it as `agent.prompt`. `GET /messages` gives the messages of one claude or codex pane.

## docs/herdr-agent-model.md

- Sections 1 to 3 still help: the herdr hierarchy, the statuses, the `seen` flag, the roll-up, the state detection, and the socket protocol.
- Sections 4 (orchestration concepts), 7 (prior art), and 8 (open questions) are background. The code does not use the `herdr agent` CLI.
- Sections 5 and 6 are the early design. The table "What the office shows" in `INTENT.md` and `bridge.mjs` replace them.

## Keep the docs true

- When a change makes a doc line wrong, fix that line in the same change.
- A new function gets an entry in its file doc.
- A new task kind gets a row in "Which doc to read". A new term gets a line in "Glossary".
- `INTENT.md` records what the user wants, and why. Decisions 18 to 26 each quote the words of the user for one request. Decision 19 holds the approved numbers (5 to 30, 6 to 15, 20 to 60). So a change of a number in a decision, after the user approves it, updates that decision. A new request that sets behavior gets a new numbered decision with the words of the user.
