# herdhouse

herdhouse is a local web page that shows herdr agents as workers in a 3D voxel office. `bridge.mjs` polls the herdr socket and streams the snapshot to the browser. The files in `public/` turn the snapshot into rooms (workspaces), pods (tabs), and desks (panes) with three.js.

Read these files for more context:

- `INTENT.md`: why the project exists, the decisions of the user, the features that the user cut, and the open items.
- `docs/herdr-agent-model.md`: how herdr models agents, statuses, and the socket protocol. Its section 6 is an early design. Where it differs from the code (event subscription, the `herdr` CLI for actions), the code and `INTENT.md` are correct.
- `docs/README.md`: the index of the docs: which doc to read for a task, the data flow, and a glossary.

Read the doc for the area that a task touches before you read the code. When a change makes a doc line wrong, fix that line in the same change.

## How the main session works here

The main session orchestrates. It plans the work, briefs subagents and workflows, and verifies the result. It does not write project code itself. Use the model that the user names for an agent.

A brief for a code agent gives:

- the files and the functions that the agent owns,
- the result that the agent must deliver, and the check that proves it,
- the safety rules in this file.

`public/office.js` is the file that most tasks touch. When two or more agents edit it at the same time:

- Give each agent its own region: one or more named functions, for example `build`, `desk`, `worker`, `pose`, `declutter`, `update`, `hud`, or `fill`.
- Tell each agent to use small `Edit` calls. An agent must not `Write` the full file.
- Tell each agent to read its region again before each `Edit`. Another agent can change the file between two edits.

The same rules apply to `public/decor.js`. After the agents finish, the main session runs the checks in the next section.

## Run and check

```sh
npm start                       # the bridge on http://127.0.0.1:4747/ (PORT=<n> for another port)
npm test                        # node --test test/*.test.mjs
node --check public/office.js   # a syntax check only: three.js loads in the browser
```

- Add `?demo` to the URL (`http://127.0.0.1:4747/?demo`) to see simulated agents. The demo page opens no `/events` stream, so the bridge does not poll herdr.
- `npm test` uses a glob. On Node 25, `node --test test/` reads `test/` as a module path and fails with "Cannot find module".
- `node --check` checks one file. It ignores a second file argument, so run it once for each changed file in `public/`.
- The bridge starts from `if (import.meta.main)`. On a Node version without `import.meta.main`, `npm start` exits and starts nothing. The repo runs on Node 25.
- The repo has no npm dependencies and no lockfile. Keep it that way. three.js 0.186.1 comes from jsDelivr through the importmap in `public/index.html`.
- A new three.js addon import needs its URL and its sha384 hash in the importmap `integrity` block. Get the hash with `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`. Write the value as `sha384-<output>`.

## Files

- `bridge.mjs`: the Node HTTP server and the herdr socket client. Exports `socketPath`, `herdrRequest`, `readMeetings`, `readMessages`, `messagesIn`, and `startBridge`.
- `public/index.html`: the importmap, the CSS, the HUD (`#hud`), and the side panel (`#panel`, with `#last`), and the chat window (`#chat`). The bridge replaces `__OFFICE_TOKEN__` in the `office-token` meta tag with the token.
- `public/model.js`: the pure model, with no imports and no DOM, so the Node tests can import it. Exports `STATUS_RANK`, `STATUS_COLOR`, `rollup`, `buildOffice`, `route`, `along`, `tripAt`, `breakPlan`, `hash`, `calm`, `opens`, `pathLen`, `stepBreak`, `endBreak`, `WALK`, `RUN`, `demoSnapshot`, and `demoMeetings`.
- `public/office.js`: the three.js scene, the labels, the HUD, the panel, the desk click, the idle breaks (`breaks()`, `stroll()`, `browse()`), the door swing (`swing()`), and the data source (a demo timer or an `EventSource`).
- `public/decor.js`: `box()` and its material cache, the palette, the props, the decor for each room kind (`workspaceDecor`, `kitchen`, `meeting`, `lobby`), and the desk `clutter`.
- `test/bridge.test.mjs`: the bridge against fake herdr sockets and a fake `~/.claude/projects` tree.
- `test/model.test.mjs`: `buildOffice` against synthetic snapshots and the demo. `assertPlan()` checks that rooms and corridors tile the building, that each door opens into a corridor, and that desks stay apart.
- `test/walk.test.mjs`: the kitchen counter and spots, `route()` for each agent desk in many floor plans (`checkRoute()` samples each route every 0.1), `along`, `tripAt`, `breakPlan`, `pathLen`, `stepBreak`, `endBreak`, and the long-idle agents of the demo.

Contracts between the files:

- `buildOffice(snapshot, meetings = [], prev = null)` returns `{ rooms, desks, counts, subagents, focus, bounds, corridors, entrance }`.
- A room has `id`, `kind`, `label`, `number`, `status`, `x`, `z`, `w`, `d`, `door: { x, z, side }`, and `pods`. `kind` is `workspace`, `meeting`, `kitchen`, or `lobby`.
- A workspace room and the kitchen also have `walk: [[x0, z0, x1, z1], ...]`. These are world rects of the free floor that the idle routes use outside the pods. `placer()` in `decor.js` keeps each prop off them.
- The kitchen also has `counter: { x, z, len }` (world coords of the counter origin on the north wall, and its length) and `spots: [{ x, z }]` (at least 3 standing spots in front of the counter, at least 0.85 apart, each facing -z). `kitchen()` in `decor.js` draws the counter from `room.counter`.
- `route(office, deskId, spot)` returns `[[x, z], ...]`: the way from the worker seat `(d.x, d.z + 0.4)` to a kitchen spot. All segments are axis-aligned. The route first steps 0.65 to the side of the chair, then uses the lane behind the desk row, goes round the pod on its east side (the lamp post stands on the west side), passes the door on the free side of the open leaf (it crosses the wall 0.145 off the door center, then steps aside 0.33 into the room, so a body clears the post and the leaf tip), keeps its lane 1.4 or more from the door wall, follows the corridor center lines, and ends in front of the counter. In the kitchen it walks a strip 1.9 from the north wall. The spots are 1.35 from the wall, so a walker keeps 0.55 from each other worker at the counter.
- `calm(dist)` returns 0 up to 1.4 from the nearest door center and 1 from 2.0. `stroll()` in `office.js` multiplies the arm swing by it, and the mug hand angle is `0.1 + 1.1 * calm`. Near a door the arms hang, so no hand goes through the open leaf or a post.
- `opens(office, d, a)` returns the ids of the rooms whose door the walker of desk `d` opens, with `a = { x, z, phase }` (from `breaks()`). It returns only the room of `d` and the kitchen, and only within 3 of the door center. In the phase `stay` it returns `[]`. A walker in a corridor opens no other door.
- `along(path, s)` returns `{ x, z, dx, dz }`: the point at distance `s` (clamped) and the unit direction of its segment.
- `pathLen(path)` returns the length of a polyline. Use it for each route length.
- `stepBreak(trips, claimed, id, { idle, seed, spots, route }, t)` keeps the trip state of one worker, once a frame. `trips` maps a desk id to `{ n, next, trip }`, and `claimed` maps a kitchen spot index to a desk id. `spots` is the number of spots and `route(i)` gives the path to spot `i`. It returns `{ s, phase, got, trip }` for a worker on a trip, and `null` for a worker at the desk. It claims the spot when the trip starts and frees it when the trip ends. After a rush it drops the state, so the next idle stretch starts with `n` at 0. `endBreak(trips, claimed, id)` drops the state of a desk and frees its spot.
- `tripAt({ len, start, stay, rush? }, t)` returns `{ s, phase }`. `phase` is `out`, `stay`, `back`, `rush`, or `done`. `WALK` is 1.6 and `RUN` is 4 (units a second). `rush` is the time when the status left idle. The worker then runs back from its place.
- `breakPlan(seed, n)` returns `{ wait, stay }` in seconds: the browse wait before trip `n` (5 to 30 for the first, 20 to 60 for the next ones) and the stay (6 to 15). `office.js` uses `hash(terminalId, 1e9)` as the seed.
- A meeting room also has `table` and `seats`, and `session` when it holds a meeting. Without meetings, the office has one empty room with the id `meeting`.
- A desk has `id` (the pane id), `roomId`, `podId`, `terminalId`, `x`, `z`, `focused`, `label`, `cwd`, `title`, `status`, and `agent` (`null` for a shell pane). An orchestrator desk also has `away`: its seat at the head of the meeting table.
- Pass the previous office as `prev`. Then each subagent keeps its seat from one update to the next.
- `demoSnapshot(tick)` and `demoMeetings(tick)` return the fake data for one tick. The page moves one tick each second. The same tick always gives the same data. Two agents in different rooms (`w2:p2` and `w3:p3`) idle for 110 s and 200 s in each cycle, so they take breaks. A trip needs about 100 s.
- `readMeetings(projects, cwds, now)` returns `[{ sessionId, cwd, agents: [{ agentId, label, phase, model, workflow, runId }] }]`. It gives one entry for each herdr claude cwd whose Claude session has subagents that still run.
- `GET /events` is SSE. A message is `{ online: true, snapshot, meetings }`, or `{ online: false, snapshot: null, error }` when the herdr request fails.
- The bridge sends a message only when its JSON changes. While a client is connected, it polls `session.snapshot` every 500 ms and reads meetings every 2000 ms.
- `POST /action` takes the body `{"type":"focus","pane_id":"w<id>:p<id>"}` and the header `x-office-token`. It sends `pane.focus` to herdr and returns 200 `{ ok: true }`.
- `POST /action` also takes `{"type":"prompt","pane_id":"w<id>:p<id>","text":"..."}`, where `text` has at least one non-space character. It sends `agent.prompt` with `{ target: pane_id, text }` to herdr and returns 200 `{ ok: true }`. A prompt does not bring WezTerm to the front. The panel of an agent desk sends it from the message field (`#say`).
- After a successful `pane.focus`, the bridge brings WezTerm to the front with `open -a WezTerm`. `startBridge()` runs this only through its `raise` option. The tests pass a stub. A failed `open` does not change the reply.
- Each start of the bridge makes a new token. The page reloads when its `/events` stream reconnects, so it gets the new token.
- `GET /messages?pane=<pane_id>` needs the header `x-office-token`. It uses the last good snapshot of the poll and sends no request to herdr. A bad token or `Host` gives 403, a bad pane id gives 400, no snapshot or no `claudeDir` gives 503, an unknown pane or no transcript gives 404, and else 200 `{ messages }`. Each JSON reply has `cache-control: no-store`.
- `readMessages(projects, pane, limit = 100)` returns the last `limit` messages of a snapshot pane, or `null`. Only a pane with `agent === 'claude'` has them. With `agent_session.kind === 'id'` and a uuid, it finds `<id>.jsonl` in the cwd folder, then in each folder of `projects`. A valid uuid that it does not find gives `null`. Only a missing or bad id takes the fallback: the newest transcript of the cwd folder whose cwd matches. It reads only the last 512 KB. A read error gives `null`.
- `messagesIn(text)` turns JSONL text into `[{ role: 'user' | 'agent' | 'subagent', text, from? }]` in file order. It keeps user prompts and agent text blocks. It drops thinking, tool calls, tool results, `isSidechain`, `isCompactSummary`, and wrapper texts (`<task-notification`, `<command-name`, `<command-message`, `<local-command-stdout`, `<bash-input`, `<bash-stdout`). It drops each `isMeta` entry, except a user entry with `origin.kind === 'peer'`. A user text that starts with `Another Claude session sent a message` gives one `subagent` message for each `<teammate-message>`, `<agent-message>`, or `<cross-session-message>` block. `from` is `teammate_id`, else `from-name`, else `from`. The text is the first string of `result`, `summary`, `message`, or `content` of a JSON body, with `failed: <failureReason>` first. A leading `[harness: ...]` line and the empty line after it are dropped from each block. A hand-back gives its report after the line that ends with `The report follows:`. Else it is the trimmed body. The head line and the trailing note never show, and an empty block is skipped.
- `POST /action` errors: a bad token or `Host` gives 403, a body over 4 KB gives 413, other bad input gives 400, and a herdr error gives 502.

## Scene conventions

- The floor is x/z, and y is up. North is -z, south is +z, and the west outer wall is at x = 0.
- The camera looks from +x +z. `OFFSET` is (100, 100, 100), and rotation is off.
- The north and west outer walls are the far walls: full height, with windows (`outer()`). The south and east outer walls face the camera, and `stub()` cuts them to 0.5 high.
- Rooms stand in bands: a north row, a corridor, and a south row. A north-row room has its door in its south wall. A south-row room has its door in its north wall (`room.door.side`).
- The cross corridor runs along the +x side. The lobby is the last room. It touches the south outer wall, and the entrance is in that wall.
- A desk is 2 x 1.5 around `(d.x, d.z)`. The monitor faces +z, toward the camera. The worker sits on the +z side.
- A prop from `at()` in `decor.js` faces +z before its turn (`rot` 1: +x, 2: -z, 3: -x). A meeting seat faces -z before its turn. `seats[0]` is the head seat at the -x end of the table.
- `box(parent, [w, h, d], [x, y, z], color)` puts `y` at the base of the box, not at its center.
- `box()` with a color string uses one cached material for each color (`MATS` in `decor.js`). Never change the color of a cached material, because every box with that color changes. For a color that changes in place, pass `fresh(color)` from `office.js`.
- `bake()` merges the static meshes into one mesh for each material after each build. It skips each object in `live` and all children of that object. Add to `live` each object whose color, visibility, position, or rotation changes after the build.
- Each door is closed (hinge angle 0). Only a walker on a trip opens a door: its own room door and the kitchen door (`opens()`). `pose()` adds the ids to `ajar` each frame, and `swing()` turns each door toward open (-1.1, into the room) or closed. A door takes 0.25 s from closed to open, from the frame time, at any frame rate. The hinge is in `live`, and the room view has `hinge`. The angle lives in `doors` (by room id), outside `views`, so a rebuild keeps it. The doors of the meeting room and the lobby never open.
- `update()` calls `build()` only when the build signature `sig` changes. The signature holds the positions of rooms, pods, desks, and subagents.
- The build signature also holds the agent kind and `away` of each desk, and the `rot` and `model` of each subagent.
- A status change updates materials and labels in place and never rebuilds the scene. If new geometry depends on a new field, add that field to the build signature.
- `build()` disposes each material without `userData.shared` and each merged geometry. Mark a material that must stay across builds with `shared()` from `office.js`.
- `views` maps each room, pod, desk, and subagent id to the objects that show its state. `pose()` runs each frame for each view that has a `desk`.
- Each `DECOR` function gets a group at the room corner, so decor uses room-local coordinates. `placer()` puts a prop on free floor only, and skips a prop that does not fit.
- `COLOR` in `office.js` is for 3D meshes. It uses a strong yellow `#ffd43b` for `working`. `STATUS_COLOR` in `model.js` holds the herdr theme colors for HTML: the HUD, the list, the badges, and the door signs. For `blocked`, it uses a strong red `#fa5252` instead of the herdr pink-red, in the HTML and in 3D.
- `declutter()` hides a label that overlaps a label with a higher priority. Agent badges come first by status rank, then door signs by status rank. It sets `visibility`, because `CSS2DRenderer` owns `display`.
- Add each new label to `tags` in `update()`. A label that is not in `tags` never hides.
- Put text into a label, the HUD, the panel, or the chat window with `textContent` only. Pane labels, titles, cwds, subagent labels, and transcript text come from outside the page, so never use `innerHTML`.
- Only a desk worker with the status `idle` takes breaks. An orchestrator with `away`, a subagent, and a shell desk never do.
- A trip belongs to `trips` (by desk id), not to a view, so a rebuild of the scene for a new subagent does not end it. `update()` also builds `lay`, the route inputs: the position, the size, the door, and the pods of each workspace room and of the kitchen, the cross corridor, and the id, position, room, and pod of each desk. A change of `lay` clears `trips` and `claimed`. A meeting start or end ends no trip while the floor plan stays the same. A meeting room that gets wider (9 or more subagents in the demo plan) and a second meeting at the same time move the rooms, so they end every trip. A desk that gets `away` or loses its agent loses its trip at once (`endBreak()`). In the first case the worker moves to the seat. In the second case no worker is left. A worker takes a free kitchen spot from `claimed` when the trip starts and frees it when the trip ends. With no free spot the worker keeps browsing.
- A worker on a trip stays a child of its desk group. `stroll()` sets its local position from the route (the world point minus the desk position) and eases `rotation.y` toward a target heading. The target is `atan2(-dx, -dz)` on the way out, `atan2(dx, dz)` on the way back and in the run, and 0 (the counter) during the stay. So the worker faces the way it moves, and the counter during the stay. The seated legs (`sit`) and the standing legs (`stand`, two hip pivots) switch by visibility. The mug shows after the kitchen. The run back shows the status parts that work while standing: the beacon, the paper, and the transparency.
- `pose()` raises `moving` while a worker walks. The loop then clears `seen` four times a second, so `declutter()` follows the walking badges.
- An idle worker at the desk shows a fake page or a video on the screen. `browse()` draws into the same canvas as `typing()` and draws only when the picture changes. The idle green stays the main color of the picture, and no picture color is near a status color. A worker on a trip shows the plain idle green.
- The look of a worker (skin, hair, trousers, accessory) comes from a hash of its `terminalId` (for a subagent, its agent id). The shirt color comes from `SHIRT`, by agent kind or by model family. A look change must not change the shirt.

## herdr facts the code depends on

- herdr reads one JSON line on each socket connection, writes one reply line, and closes the socket. `herdrRequest()` opens a new connection for each request.
- Each request needs `"params"`, also when it is empty. Without it, herdr returns `invalid_request`.
- The statuses rank `blocked` 4, `done` 3, `working` 2, `idle` 1, `unknown` 0. A tab or a workspace shows the highest rank of its panes.
- The model uses the `agent_status` that herdr sends for each tab and workspace. It calls `rollup()` only when herdr does not send one.
- `done` is the herdr state `Idle` with `seen == false`: the agent finished, and nobody saw the pane after that. The first idle state of a new agent is `idle`, not `done`.
- `unknown` is a plain shell, an unknown program, a new agent in its first 3 s, or a released agent.
- `pane.focus` marks the whole tab as seen, so each `done` desk in that tab turns `idle`. The panel shows this warning.
- `agent.prompt` types the text and presses Enter. It refuses a blocked agent with `agent_blocked` and sends nothing. The office relies on this, so a message never answers a blocked question.

## Safety rules

- Never send a mutating request to the live herdr socket from a test. Tests use fake unix sockets only.
- Always pass `sock` to `startBridge()` and `herdrRequest()` in a test. herdr sets `HERDR_SOCKET_PATH` in each pane, so `socketPath()` gives the live socket.
- macOS limits a unix socket path to 104 bytes. `test/bridge.test.mjs` changes its cwd to a temp folder and uses short relative names (`h1.sock`). Use the same method for a new fake socket.
- During a check in live mode, never click "Focus in herdr" or "Focus orchestrator". The click switches herdr to that pane and marks the tab as seen. Use `?demo`, where the button is disabled.
- During a check in live mode, never send a message from the panel. herdr types it into a live agent of the user. Use `?demo`, where the field is disabled, or a fake herdr socket (`docs/testing.md` "Visual check in the browser").
- Never run bare `herdr`, because it opens the interactive client. Use read-only commands only, for example `herdr agent list` or `herdr api schema --json`.
- Treat `~/.claude` as read-only. The tests use a fake projects tree in their temp folder.
- Meetings carry metadata only. The bridge reads folder listings, `meta.json` files, and `journal.jsonl`.
- The bridge also reads the start of a session transcript for its cwd. From the end of a subagent transcript, it takes only the end marker and a `claude-*` model id. For `GET /messages`, it also reads the last 512 KB of a session transcript.
- Transcript text goes to the browser only through `GET /messages`: the user prompts and the agent replies of one claude pane, on request, behind the token. Never put transcript text into the `/events` stream. `messagesIn()` drops thinking, tool calls, tool results, and wrapper texts, and its test must check that their `SECRET` text is not in the output. A new meeting field must still come from metadata, and its test must check that the `SECRET` text is not in the output.
- Never copy live data from the herdr session of the user into a repo file. This includes workspace labels, project names, terminal titles, pane IDs, and home paths. Use generic examples like `w1:p1`, "api", or "web".
- Keep each bridge guard: listen on 127.0.0.1 only, the `Host` check, the `x-office-token` check (also on `GET /messages`), `x-frame-options: DENY`, `cache-control: no-store`, and no CORS headers. `test/bridge.test.mjs` checks each guard except the listen address.
- Stop each server that you start. Start a check bridge on its own port: `PORT=4848 npm start`. Then a check never stops the user's bridge on 4747. To stop the check bridge:
  1. Get the PID with `lsof -nP -tiTCP:4848 -sTCP:LISTEN`. Do not use `$!`, because it can give the PID of a wrapper shell.
  2. Kill that PID.
  3. Run the `lsof` command again to make sure that the port is free.

## Visual checks

The repo has no browser harness. Earlier agents ran headless Chrome with `--remote-debugging-pipe` and sent CDP commands, because the Chrome extension was not connected. To zoom, they dispatched a `WheelEvent` on the canvas from a page eval. The controls zoom to the pointer position.
