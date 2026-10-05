# herdr office

The herdr office is a local web page that shows herdr agents as workers in a 3D voxel office. `bridge.mjs` polls the herdr socket and streams the snapshot to the browser. The files in `public/` turn the snapshot into rooms (workspaces), pods (tabs), and desks (panes) with three.js.

Read these files for more context:

- `INTENT.md`: why the project exists, the decisions of the user, the features that the user cut, and the open items.
- `docs/herdr-agent-model.md`: how herdr models agents, statuses, and the socket protocol. Its section 6 is an early design. Where it differs from the code (event subscription, the `herdr` CLI for actions), the code and `INTENT.md` are correct.

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

- `bridge.mjs`: the Node HTTP server and the herdr socket client. Exports `socketPath`, `herdrRequest`, `readMeetings`, and `startBridge`.
- `public/index.html`: the importmap, the CSS, the HUD (`#hud`), and the side panel (`#panel`). The bridge replaces `__OFFICE_TOKEN__` in the `office-token` meta tag with the token.
- `public/model.js`: the pure model, with no imports and no DOM, so the Node tests can import it. Exports `STATUS_RANK`, `STATUS_COLOR`, `rollup`, `buildOffice`, `demoSnapshot`, and `demoMeetings`.
- `public/office.js`: the three.js scene, the labels, the HUD, the panel, the desk click, and the data source (a demo timer or an `EventSource`).
- `public/decor.js`: `box()` and its material cache, the palette, the props, the decor for each room kind (`workspaceDecor`, `kitchen`, `meeting`, `lobby`), and the desk `clutter`.
- `test/bridge.test.mjs`: the bridge against fake herdr sockets and a fake `~/.claude/projects` tree.
- `test/model.test.mjs`: `buildOffice` against synthetic snapshots and the demo. `assertPlan()` checks that rooms and corridors tile the building, that each door opens into a corridor, and that desks stay apart.

Contracts between the files:

- `buildOffice(snapshot, meetings = [], prev = null)` returns `{ rooms, desks, counts, subagents, focus, bounds, corridors, entrance }`.
- A room has `id`, `kind`, `label`, `number`, `status`, `x`, `z`, `w`, `d`, `door: { x, z, side }`, and `pods`. `kind` is `workspace`, `meeting`, `kitchen`, or `lobby`.
- A meeting room also has `table` and `seats`, and `session` when it holds a meeting. Without meetings, the office has one empty room with the id `meeting`.
- A desk has `id` (the pane id), `roomId`, `podId`, `terminalId`, `x`, `z`, `focused`, `label`, `cwd`, `title`, `status`, and `agent` (`null` for a shell pane). An orchestrator desk also has `away`: its seat at the head of the meeting table.
- Pass the previous office as `prev`. Then each subagent keeps its seat from one update to the next.
- `demoSnapshot(tick)` and `demoMeetings(tick)` return the fake data for one tick. The page moves one tick each second. The same tick always gives the same data.
- `readMeetings(projects, cwds, now)` returns `[{ sessionId, cwd, agents: [{ agentId, label, phase, model, workflow, runId }] }]`. It gives one entry for each herdr claude cwd whose Claude session has subagents that still run.
- `GET /events` is SSE. A message is `{ online: true, snapshot, meetings }`, or `{ online: false, snapshot: null, error }` when the herdr request fails.
- The bridge sends a message only when its JSON changes. While a client is connected, it polls `session.snapshot` every 500 ms and reads meetings every 2000 ms.
- `POST /action` takes the body `{"type":"focus","pane_id":"w<id>:p<id>"}` and the header `x-office-token`. It sends `pane.focus` to herdr and returns 200 `{ ok: true }`.
- Each start of the bridge makes a new token. The page reloads when its `/events` stream reconnects, so it gets the new token.
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
- `update()` calls `build()` only when the layout signature `sig` changes. The signature holds the positions of rooms, pods, desks, and subagents.
- The signature also holds the agent kind and `away` of each desk, and the `rot` and `model` of each subagent.
- A status change updates materials and labels in place and never rebuilds the scene. If new geometry depends on a new field, add that field to the signature.
- `build()` disposes each material without `userData.shared` and each merged geometry. Mark a material that must stay across builds with `shared()` from `office.js`.
- `views` maps each room, pod, desk, and subagent id to the objects that show its state. `pose()` runs each frame for each view that has a `desk`.
- Each `DECOR` function gets a group at the room corner, so decor uses room-local coordinates. `placer()` puts a prop on free floor only, and skips a prop that does not fit.
- `COLOR` in `office.js` is for 3D meshes. It uses a strong yellow `#ffd43b` for `working`. `STATUS_COLOR` in `model.js` holds the herdr theme colors for HTML: the HUD, the list, the badges, and the door signs.
- `declutter()` hides a label that overlaps a label with a higher priority. Agent badges come first by status rank, then door signs by status rank. It sets `visibility`, because `CSS2DRenderer` owns `display`.
- Add each new label to `tags` in `update()`. A label that is not in `tags` never hides.
- Put text into a label, the HUD, or the panel with `textContent` only. Pane labels, titles, cwds, and subagent labels come from outside the page, so never use `innerHTML`.
- The look of a worker (skin, hair, trousers, accessory) comes from a hash of its `terminalId` (for a subagent, its agent id). The shirt color comes from `SHIRT`, by agent kind or by model family. A look change must not change the shirt.

## herdr facts the code depends on

- herdr reads one JSON line on each socket connection, writes one reply line, and closes the socket. `herdrRequest()` opens a new connection for each request.
- Each request needs `"params"`, also when it is empty. Without it, herdr returns `invalid_request`.
- The statuses rank `blocked` 4, `done` 3, `working` 2, `idle` 1, `unknown` 0. A tab or a workspace shows the highest rank of its panes.
- The model uses the `agent_status` that herdr sends for each tab and workspace. It calls `rollup()` only when herdr does not send one.
- `done` is the herdr state `Idle` with `seen == false`: the agent finished, and nobody saw the pane after that. The first idle state of a new agent is `idle`, not `done`.
- `unknown` is a plain shell, an unknown program, a new agent in its first 3 s, or a released agent.
- `pane.focus` marks the whole tab as seen, so each `done` desk in that tab turns `idle`. The panel shows this warning.

## Safety rules

- Never send a mutating request to the live herdr socket from a test. Tests use fake unix sockets only.
- Always pass `sock` to `startBridge()` and `herdrRequest()` in a test. herdr sets `HERDR_SOCKET_PATH` in each pane, so `socketPath()` gives the live socket.
- macOS limits a unix socket path to 104 bytes. `test/bridge.test.mjs` changes its cwd to a temp folder and uses short relative names (`h1.sock`). Use the same method for a new fake socket.
- During a check in live mode, never click "Focus in herdr" or "Focus orchestrator". The click switches herdr to that pane and marks the tab as seen. Use `?demo`, where the button is disabled.
- Never run bare `herdr`, because it opens the interactive client. Use read-only commands only, for example `herdr agent list` or `herdr api schema --json`.
- Treat `~/.claude` as read-only. The tests use a fake projects tree in their temp folder.
- Meetings carry metadata only. The bridge reads folder listings, `meta.json` files, and `journal.jsonl`.
- The bridge also reads the start of a session transcript for its cwd. From the end of a subagent transcript, it takes only the end marker and a `claude-*` model id.
- No transcript text goes to the browser. A new meeting field must come from metadata. Its test must check that the `SECRET` text is not in the output.
- Never copy live data from the herdr session of the user into a repo file. This includes workspace labels, project names, terminal titles, pane IDs, and home paths. Use generic examples like `w1:p1`, "api", or "web".
- Keep each bridge guard: listen on 127.0.0.1 only, the `Host` check, the `x-office-token` check, `x-frame-options: DENY`, `cache-control: no-store`, and no CORS headers. `test/bridge.test.mjs` checks each guard except the listen address.
- Stop each server that you start. Start a check bridge on its own port: `PORT=4848 npm start`. Then a check never stops the user's bridge on 4747. To stop the check bridge:
  1. Get the PID with `lsof -nP -tiTCP:4848 -sTCP:LISTEN`. Do not use `$!`, because it can give the PID of a wrapper shell.
  2. Kill that PID.
  3. Run the `lsof` command again to make sure that the port is free.

## Visual checks

The repo has no browser harness. Earlier agents ran headless Chrome with `--remote-debugging-pipe` and sent CDP commands, because the Chrome extension was not connected. To zoom, they dispatched a `WheelEvent` on the canvas from a page eval. The controls zoom to the pointer position.
