# test/*.test.mjs: tests and checks

The tests use `node:test` and `node:assert/strict` only. `test/bridge.test.mjs` imports `bridge.mjs`. `test/model.test.mjs` and `test/walk.test.mjs` import `public/model.js`. `public/office.js` and `public/decor.js` import `three` through the browser importmap, so Node cannot load them, and no test covers them. No test talks to the live herdr socket or reads `~/.claude`.

## When to read this doc

- A new test, or a test that fails.
- A change to a number that `checkRoute()` in `test/walk.test.mjs` copies from `public/office.js` or `public/decor.js`.
- A change to the demo data (`DEMO_PANES`, `demoSnapshot()`, `demoMeetings()`) or to the break times.
- A check by hand in the browser.

## How to run

```sh
npm test                                                        # node --test test/*.test.mjs
node --test --test-name-pattern="stepBreak" test/walk.test.mjs  # one file, only the matching tests
```

- `CLAUDE.md` "Run and check" has the Node 25 glob rule and the `node --check` rule. `package.json` has no typecheck, lint, or format script.
- A new test file must end in `.test.mjs`, or the glob does not find it.
- `node --test` runs each file in its own process, so the `process.chdir()` in `test/bridge.test.mjs` does not change the other files. Inside one file, the tests run in source order.

## Module state

| State | Where | Rule |
|---|---|---|
| the cwd `dir` | `test/bridge.test.mjs` moves into a temp folder at load. `after()` removes it | A fake socket gets a short relative name (the 104-byte limit) |
| `n` | `fakeHerdr()` | Counts up, so each fake gets its own `h<n>.sock` |
| `projects` | the fake `~/.claude/projects` tree in `dir` | The `readMeetings` tests and the `/events` meetings test write into it. Give a new test its own cwd and session id |
| `codex` | the fake Codex sessions tree in `dir` (`YYYY/MM/DD/rollout-*.jsonl`) | The `readCodexMessages` tests and the codex `/messages` test write into it. Give a new test its own cwd and thread id |
| `metas` | cache in `bridge.mjs` | It keeps `{ cwd, top }` for each rollout file for the process. A whole first line stays cached |
| `cwds`, `models` | caches in `bridge.mjs` | They live until the process ends. `modelIn()` keeps the last model of a file, also when a later tail has none |
| `offices` | `test/walk.test.mjs` builds it from `CASES` at load | A throw in `buildOffice()` for one case fails the whole file |

## test/bridge.test.mjs

### Fixtures and helpers

- `pub`: a fake public folder (an `index.html` with only the `office-token` meta tag, and `app.js`). Pass `publicDir: pub`, never the real `public/`.
- `SNAP`: a working claude pane `w1:p1` (cwd `/src/a`) and a shell pane `w1:p2`.
- `answer(req)`: the default fake reply. `SNAP` for `session.snapshot`, the error `pane_not_found` for the `pane_id` `w9:p9`, the error `agent_blocked` for the `target` `w9:p9`, else `{ type: 'ok' }`.
- `fakeHerdr(reply = answer)`: resolves `{ sock, lines, close }`. `lines` gets each raw request line, with its `\n`. A `reply` that returns `null` never answers.
- `request()` sends one HTTP request (a `host` key replaces the `Host` header). `sse(port)` returns `{ msgs, next, close }`, and `msgs.length === 0` after a sleep proves that nothing came. `portOf(b)` gives the port of a bridge with `port: 0`.
- The meeting fixtures: `esc()`, `line()`, `write(file, text, ageS)` (sets the mtime `ageS` seconds back), `session()`, `said()`, `run()`, and `plain()`. To end a run, write `workflows/<runId>.json` in the session folder.
- The codex fixtures: `ev(type, payload)` (one rollout line), `block()`, `msg(role, ...texts)` (a `response_item` message), `codex` (the fake sessions folder), `C(n)` (a made-up thread uuid), `rollout(day, id, cwd, body, opts)` (a rollout with its `session_meta` line first), `cpane(cwd, id)` (a codex pane), and `cchat(...texts)` (alternating user and agent messages).
- `readMeetings()` decides with mtimes. The newest session for a cwd wins. A plain subagent quiet for 30 s has ended, and a workflow agent quiet for 30 min has ended.

### Security checks

- All names and texts in the fake tree are made up. Never copy a file from the real `~/.claude` into a fixture.
- `SECRET` is in the transcripts, the rollouts (the `session_meta` base instructions and the `codexMessagesIn()` test lines), the journal results, the run JSON, and the workflow scripts. The first and the third `readMeetings` tests assert that `JSON.stringify(out)` does not contain it. The `/events` meetings test compares the full message.
- The second `readMeetings` test asserts the same for `READ_FROM_OUTSIDE`, a meta file that an agent id with `../` points to.
- The static test checks the token in the page, `x-frame-options: DENY`, `cache-control: no-store`, no CORS header, five plain and encoded `../secret.js` paths, a `//` path, and the `Host` guard. `secret.js` is a file outside `pub`, not the `SECRET` constant.
- `POST /action`: a wrong, short, or missing token or a bad `Host` gives 403. A bad pane id or body gives 400. A 5 KB body gives 400 or 413, so the test does not pin 413. No rejected request reaches `fake.lines` or calls `raise`.
- `POST /action` with a prompt: a prompt with no text, or with an empty, blank, number, or array text, gives 400. A good prompt reaches the fake as exactly one `agent.prompt` line. A blocked target gives 502 with `agent_blocked`. A prompt never calls `raise`.
- `messagesIn()` test: one JSONL with each kept and each dropped case. `SECRET` is in each dropped part (thinking, tool calls, tool results, `isMeta`, `isSidechain`, `isCompactSummary`, each wrapper tag, an attachment with a user-like `message`, a bad line), and in the head line, the trailing note, and the hand-back preamble of the agent-to-agent entries. The agent-to-agent cases are: each block type, a JSON body with a `result`, with a `failureReason`, and with no text, a plain body with a `summary` attribute, three blocks in one entry, a hand-back with the `[harness:` line and the 2-space indent, a meta peer entry (kept), and a meta non-peer entry (dropped). The test asserts that `JSON.stringify(out)` does not contain it, and checks the exact kept entries.
- `readMessages()` tests, in the fake `projects` tree (`transcript()`, `chat()`, `pane()`, and the uuids `U1` to `U3`): lookup by id in the cwd folder and in another folder, a bad id (`../secret`, `not-a-uuid`) and a `null` session that fall back to the newest transcript of the cwd, no transcript, a non-claude pane, a transcript over 512 KB (the tail, with no partial first message), a cut that lands exactly on a line start (the line stays), a cut inside a multi-byte character, a read error (a file that cannot be opened gives `null`), and `limit`. Use a new uuid for a "not found" case, because the tests share the tree.
- `codexMessagesIn()` test: one rollout with each kept and each dropped case. `SECRET` is in each dropped part (the `session_meta` base instructions, `developer` messages, each injected tag, reasoning, tool calls and output, each `event_msg`, a bad line). The test asserts that `JSON.stringify(out)` does not contain it, and checks the exact kept entries.
- `readCodexMessages()` tests: lookup by thread id in any date folder, a missing or bad id that falls back to the newest top-level rollout of the cwd (a subagent thread and a `session_meta` line over 32 KB included), `limit`, a non-codex pane, no rollout, a missing folder, a folder with a rollout name, and a first line without a newline (not cached, so a later call finds it).
- Codex `GET /messages` test: a codex pane gives its messages, an odd agent name gives 404, and a bridge without `codexDir` gives 503.
- `GET /messages` test: a missing, wrong, or bad-`Host` request gives 403. A bad pane id gives 400. No snapshot yet, and `claudeDir: null`, give 503. An unknown pane and a shell pane give 404. A claude pane gives 200 with `cache-control: no-store`. The fake gets only `session.snapshot` lines, and the first `/events` message holds no reply text. A second test makes the fake fail after the first snapshot, and `/messages` then gives 503. The fake snapshot is `SNAP` with an `agent_session` on `w1:p1`.
- No test checks the listen address `127.0.0.1`.

### Gotchas

- `startBridge()` calls `raise` only when the test passes it. Only the `import.meta.main` block passes `raiser(terminal)`, which runs `open -b <bundle id>`. `bundleIdsIn()`, `pickTerminal()`, and `raiser()` have tests with made-up `ps` text, fake streams, and stub `detect` and `open` functions.
- A static test can pass `sock: 'none.sock'`. With no SSE client, the bridge never opens it.
- Pass a small `pollMs` and `meetMs` (the defaults are 500 ms and 2000 ms). Close `es`, `b`, and `fake` in `finally`.
- A new codex test needs a new thread id and a new cwd. The tests share the tree, and the bridge caches `metas` by file.
- The `/events` meetings test uses `/src/a`, the cwd of the claude agent in `SNAP`.

## test/model.test.mjs

### Fixtures and helpers

- `season()` has one test, `season() gives halloween from 24 Oct to 1 Nov and winter from 1 Dec to 6 Jan, by the local date`. It builds each date with `new Date(year, month - 1, day)`, so the test does not depend on the time zone.
- `snowflakes()` and `flakeAt()` have four tests in `test/model.test.mjs`: the flake count and the 0.3 margin, the spread and the repeat, the fall from 2.6 at 0.3 a second, and the bounds of the drift. No test covers `snowfall()`, because Node cannot load three.js.
- `rect()`, `layout()`, `pane()` (a shell pane with status `unknown`), and `agent()` build a snapshot.
- `plan(spec)`: workspaces from a list of `[label, tabs]`, with one idle claude agent on each pane. A tab is its pane count: the panes stand side by side, or for a negative count, in one column. `plan([['api', [3]], ['web', [-6]]])` gives a row 16.2 deep, so api has 149 m² of free floor round its one pod row.
- `synthetic()`: two workspaces out of number order, with a shell pane `logs` and a 2x2 split. `big()`: 18 workspaces, 26 tabs, and 49 panes. `garden()`: one wide workspace "api" (4 panes side by side) and four small ones. Its two middle rows get a terrace each, back to back, and its last row (3.6 spare width) stretches.
- `assertPlan(o, snap, meetings = [])`: the floor-plan invariants. Rooms, corridors, and terraces tile the building, and the rooms and the terrace of each row span `W`. It calls `assertSeats()` (the table, the seats, the head seat, the side seats), `assertRows()`, `assertSpacing()`, `assertKitchen()`, and `assertGames()`.
- `assertRows(o, rows, W)`: finds the row with the most spare width from `normal()` (the width of a room before the stretch). It wants a party room only for a spare width of 7 or more, as the last room of that row or just before the lobby, with the spare width. Each other room of that row keeps its normal width, and the row has no terrace. Each other row with 4 or more spare width keeps its normal room widths and has one terrace: the id `terrace:<row index>`, from the last room to the cross corridor, with the spare width and the row depth. Each room of another row gets the same extra width, and the row has no terrace.
- `assertSpacing(desks)`: copies `GAP_X` (2.4) and `GAP_Z` (2.2) from `public/model.js`.
- `assertKitchen(o)`: 2 or more kitchen chairs, each 0.8 west (`rot` 3) or east (`rot` 1) of its table. Each table top (0.9 x 0.9) and each chair (the seat and its back, 0.45 behind the chair point) is 0.2 or more inside the kitchen, south of a walker on the strip, clear of the door, and off each walk rect. A chair may touch only its own lane. Chairs of two tables keep 0.85 apart. With a north door and a kitchen 8.6 or more wide, each chair is 1.8 or more from the east wall, so the wall does not hide a seated worker. It copies the chair size from `decor.js` and `kitchenZ()` (1.9) from `public/model.js`.
- `assertGames(o)`: each room has `games` (a list). Only a workspace room or a party room with 80 m² or more of free floor (`free()`) has a table, with at most one table of each kind. Each place is 0.62 (chess) or 1.55 (ping-pong) west (`rot` 3) and east (`rot` 1) of the table, at the table z. The footprint (`foot()`: chess 1.9 x 1.2, ping-pong 3.5 x 1.2) with a pad of 0.3 is inside the room and off the pods (grown by 0.3), the lamp posts, the door area (2.4 x 2), and in the party room the dance floor and the booth with its speakers. The footprint without the pad is off each walk rect, except the rects that hold a place. The footprint with the pad does not touch the other table. Each place is in a walk rect 0.6 wide or less. That lane keeps off the pods, the other table with its pad, the door area, the dance floor, and the booth, and its center line keeps 0.4 from each lamp post and 1.0 from each dance spot. `o.games` lists each table in `rooms` order. It copies `LAMP` from `decor.js` and `inRect()` from `test/walk.test.mjs`.
- `meeting(sessionId, cwd, n, workflow = 'flow')`: a meeting in the bridge shape with `n` agents.

### Gotchas

- `constants` pins each `STATUS_COLOR` value.
- `assertPlan()` pins the room order (without the party room) and the label of a room that is not a workspace. A new room kind must update both lines, and `normal()` if its width differs.
- `synthetic()` gets no party room (its most spare width is 6.9), but it gets a terrace in its first row. The demo, `big()`, `synthetic()` with a meeting of 13, and `big()` with a meeting of 11 (the party room before the lobby) get a party room. The demo gets no terrace, so its routes did not change with the terraces.
- `assertRows()` copies the 4 of the terrace rule from `buildOffice()`.
- `assertGames()` copies the 80 m² rule, the place offsets, and the footprints from `games()` in `public/model.js`. The demo gets a ping-pong table and a chess table in the party room, between the strip and the door wall. Of the other plans, `big()` (with no meeting or a meeting of 1) and `synthetic()` with a meeting of 13 get both tables in the party room, and `big()` with a meeting of 11 gets both in w7. The 8-pod room of "a big room with no free place" has 154 m² free and no table.
- `demoSnapshot has the snapshot shape` and `demo ticks 0..50 ...` pin the demo counts. The second test also wants each of `working`, `blocked`, `done`, and `idle` in every tick. A change to `DEMO_PANES` can break them. Two of the 9 agents are the long-idle agents of `test/walk.test.mjs`.
- A status change can still change `sig`, because `away` goes to the working claude desk in the session cwd. `positions do not change when only statuses change` uses no meetings and does not see this.
- `the orchestrator desk is away` compares the full `o.subagents[0]`. A new subagent field must go into it.

## test/walk.test.mjs

### Fixtures and helpers

- `snap(spec)`: a snapshot from a list of tabs for each workspace, and a list of pane rects for each tab. Every fourth pane is a shell, the others are idle claude agents. `G(c, r)` gives a grid, `SIX` a 6-way split.
- `CASES` maps a name to `[snapshot, meetings]`. `close(a, b, msg)` compares floats to 1e-6. `a deep room with one pod row` gives w1 its game tables between the row lane and the door wall. The cases have 71 game tables, in workspace rooms (on both sides of the main walk line) and in party rooms.
- `world()` and `step(w, t, over, id = 'a')`: `step()` calls `stepBreak()` with `idle: true`, `seed: 7`, `spots: { kitchen: 3 }`, and `route: () => PATH`. `over` replaces any of these.
- `ALL` is `{ kitchen: 3, lunch: 4, party: 5 }`, the spot counts of the three kinds. `KINDS` is `['kitchen', 'lunch', 'party']`, and `KINDS4` adds `'game'`. `kindOf(seed, n, kinds = KINDS)` copies the first pick of `stepBreak()`. `seedFor(kind, kinds = KINDS)` gives the first seed whose first trip picks that kind.
- The game helpers: `GAME` is `{ tables: ['chess'] }`. `arrive(trip)` is the arrival time. `gstep(w, t, id, over)` steps a worker whose first pick is a game (no other spots). `kstep(w, t, id, over)` steps a worker whose first pick is the counter. `pair()` makes a waiter `a` at the chess table and a worker `b` that joins it 5 s into the wait, and returns `{ w, a, b }` (the two trips). The first call of `stepBreak()` only sets the first wait, so each test primes its workers at `t = 0` and starts the trips at 100 or later.
- The game tests: a waiter alone walks back after `WAIT`. A join, whatever the pick, sets `partner`, `begin`, and `end` on both trips, with the game time of the waiter. `play` is true only from `begin` to `end`. A rush of one player, or `endBreak()`, ends the game of the other: it walks back. After the game end, a rush or `endBreak()` of one player leaves the phase and the place of the other unchanged, also when both rush. A partner that rushes on the way out sends the waiter back at once, and nobody joins the waiter again. With two waiters, each new trip joins one of them, and a third finds both tables full. A trip after the 20 s wait makes its own pick. With no tables the pick never gives a game, and with 4 kinds each kind gets about a quarter of 400 picks. The test with two waiters builds the second waiter in a world of its own, because a new trip always joins a waiter.
- `ROWS`: one workspace with two rows of 4 pods, short and tall pods in each row. The short-pod test uses it with the `CASES` offices. It copies the last-row test (`d.z + 1.1`) and the aside x (`d.x + 0.65`) from `route()`.
- `checkRoute(name, o, d, spot, to = 'kitchen')`: samples the route to a spot of the room `to` every 0.1, plus each corner, against the walls, doors, desks, lamp posts, walk rects, the open leaf and posts, the other spots, chairs, and game places of that room, the kitchen tables and chairs, and the game table tops of each room on the way. `to` can also be the room of a game table, with `spot` one of its places. The route line keeps 0.3 from a table top (a game top: chess 0.7 x 0.7, ping-pong 2.2 x 1.2). It keeps 0.25 from the top of its own chess table, because a chess place is 0.27 from it. The body keeps 0.39 from each other chair. Its comments give each box and margin.
- `players(o, g)`: the desks of the game route test, each agent desk in the room of table `g` and the first agent desk of each other room. All desks gave 4782 routes and 47 s. This set gives 1708 routes (360 from the room of the table) and about 14 s.

### Gotchas

- `checkRoute()` copies numbers from files that Node cannot import. A change to one of them needs the same change in `checkRoute()`:
  - the leaf hinge, the leaf width, and the posts at 0.6 in `door()`, and `OPEN` in `public/office.js`. The leaf tip is in the comment above `doorX` in `public/model.js`.
  - `LAMP` in `public/decor.js`.
  - the arm swing and the mug hand from `worker()` and `stroll()` in `public/office.js`.
- The checks are 2D boxes. The posts and the leaf are as tall as a worker, so each worker part below 2.1 must stay inside the footprint that `checkRoute()` models.
- `checkRoute()` opens the leaf of every door within 3, also a door that `opens()` keeps closed. So no test fails on a route through a third room, but in the page that door stays closed. Such a route needs a change in `opens()`.
- The wall loop also holds the building rect, which has no `door`. A point closer than 0.3 to the outer wall makes `inDoor()` throw a `TypeError`, not a clean message.
- Only '3 small workspaces' has a kitchen door in the south wall. If a room width change moves it, `the cases cover both kitchen door sides` fails. Then add a case.
- 11 cases get one or two terraces. The routes never enter a terrace, but the rooms of a terrace row keep their normal width, so their routes differ from a stretched room.
- 12 cases get a party room. The two demo cases, '3 small workspaces', and '7 small workspaces' give it a north door, and the others a south door. The party room test needs both sides, so a room width change can make it fail. Then add a case.
- The three route tests are the slowest tests: about 15 s for the party room (1802 routes), 10 s for the kitchen chairs (1208 routes), and 7 s for the counter (906 routes).
- The pick test of `breakPlan()` copies the `wait` and `stay` formula in `before()`. It fails when a new plan value takes the index 0 or 1.
- The demo test runs `stepBreak()` for each agent desk of the demo, 10 frames a second for 700 s, with the seed `hash(d.terminalId, 1e9)` and the spots and tables of the demo office, as `public/office.js` will. It wants a full trip of each long-idle agent, a trip that a status change cuts short, and a game of `w2:p2` and `w3:p3`. In the current run, they play twice (from 214.8 s and from 367.1 s), and status changes cut 7 trips. It depends on the long-idle entries of `w2:p2` and `w3:p3` in `DEMO_PANES`, on `WALK`, on `breakPlan()` (also the indices of `pick` and `game`), and on the demo floor plan.

### The Halloween night tests (in `test/walk.test.mjs`)

- `candleSpots`: for every test floor plan (`offices`), it checks a cross corridor spot, the axis, the 0.25 inset inside a corridor, no spot in a band mouth, 1.2 from each door, 3 between spots on one corridor, determinism, and no door sign over a flame. The sign check projects the middle flame on the screen plane of the camera and needs a horizontal offset of 1.6 or a vertical offset of 0.4 from the sign of each north door. It also samples each route from each agent desk to each kitchen and party spot every 0.1, and checks 0.5 from each spot.
- `lightningPlan`: fixed random numbers give the wait and the flash count. 10000 random plans stay in range (wait, count, lengths, the 0.3 to 0.6 gap, the powers).
- `flash`: the power inside a flash, and 0 between flashes and before the start.
- `candleSpot()` in `decor.js` has no Node test, because the module needs three.js. A scratch ray test in Node loads `decor.js` with three.js and checks, for each room of the test plans, that the ray from each flame misses each prop, pod, and lamp post. See `docs/decor.md` "Check placement in Node".

## Change recipes

### Add a bridge test with a fake socket

1. Put the test in `test/bridge.test.mjs`, below the helpers.
2. Make the fake with `await fakeHerdr(reply)`. Leave `reply` out for `answer`.
3. Start the bridge with `sock: fake.sock`, `port: 0`, `publicDir: pub`, and a small `pollMs`. Pass `raise: () => raised++` for a focus test.
4. Send with `request(portOf(b), ...)` or `sse(portOf(b))`. Assert on the reply and on `fake.lines`.
5. Close `es`, `b`, and `fake` in `finally`.

- Always pass `sock` to `startBridge()` and `herdrRequest()`, and `env` and `home` to `socketPath()`. herdr sets `HERDR_SOCKET_PATH` in each pane, so a default gives the live socket. Never send a mutating request to the live socket.
- A new test file copies the temp folder setup: `mkdtempSync()`, `process.chdir()`, and `after()` with `rmSync()`.
- A new bridge guard goes into `CLAUDE.md` "Safety rules" and `docs/bridge.md`.

### Add a test for a new meeting field

1. Take the field from metadata only: a journal event, a `meta.json`, a folder listing, or a `claude-*` model id from a tail.
2. Add the field to the fixture: an event in `run()`, a `metas` entry, or the `meta` of `plain()`.
3. If the code reads a new file, put `SECRET` into the parts of that file that must not leave.
4. Add the field to the expected objects of the three `readMeetings` tests and of `GET /events: adds the meetings...`.
5. Keep the check `assert.ok(!JSON.stringify(out).includes(SECRET))`. Use a new cwd and session id.

- If `buildOffice()` copies the field into `subagents`, update `meeting()`, the expected `o.subagents[0]` in `test/model.test.mjs`, and `demoMeetings()`.
- If the field changes the 3D look of a subagent, add it to `sig` in `update()`. No test finds a missing `sig` field.
- Update the `readMeetings` contract in `CLAUDE.md` "Contracts between the files", and `docs/bridge.md`.

### Add a floor-plan case

- In `test/model.test.mjs`, build a snapshot and call `assertPlan(buildOffice(s, ms), s, ms)`.
- A pane in `synthetic()` that is not in `layouts` goes to a row at the pod end.
- In `test/walk.test.mjs`, add an entry to `CASES`. The kitchen, door side, route, and `opens()` tests then run on it.
- Keep both kitchen door sides in `CASES`. Each agent desk adds one route for each kitchen spot and for each dance spot to the two slowest tests, so prefer a small case.

### Add a route check

1. For a check at each point, add the assertion in the `for (const s of samples)` loop of `checkRoute()`. Use `at` in the message.
2. For a check of the whole route, assert on `path` before the loop.
3. If the check needs a size from `public/office.js` or `public/decor.js`, copy the number. Add a comment that names the source.
4. If `route()` changes, update its contract in `CLAUDE.md` "Contracts between the files", the comments above `route()`, and `docs/model.md`.
5. A new route point in a room must lie in a pod or a `walk` rect. Extend `walkRects()`. `placer()` then keeps props off the new rect, and no test checks that.

### Add a break test

1. Start with `const w = world()`. Call `step(w, t, over, id)` for each frame time `t`.
2. Read the times from `breakPlan(7, n)` or `w.trips.get('a').next`. Do not pin a `breakPlan()` value. Only `breakPlan is deterministic and stays in range` holds the ranges, and only the coin test holds the formula.
3. With `seed: 7` and `spots: { kitchen: 3 }`, a worker takes the first free spot in the order `'kitchen:1'`, `'kitchen:2'`, `'kitchen:0'`. For a lunch or a party trip, pass `seed: seedFor('lunch')` or `seedFor('party')` and `spots: ALL`. The worker then starts at `'lunch:<seed % 4>'` or `'party:<seed % 5>'`.
4. Assert on the return value (`null` at the desk, else `{ s, phase, got, trip }`), `w.trips`, and `w.claimed`.

- For a timing change in `tripAt()`, build a trip `{ len, start, stay, rush }` and compare `s` with `close()`.
- For a change of the demo idle times or of `WALK`, run the demo test and update the long-idle entries in `DEMO_PANES` if it fails.
- A change of the break behavior updates `INTENT.md` decision 19 and "Open items and known limits". A change of a break function shape or number updates its contract in `CLAUDE.md`.

### Change when a door opens

1. Change `opens()` in `public/model.js`. The `opens()` test wants an open door at 1.4 or less and a closed door at 3 or more. Change those numbers if the radius moves.
2. `checkRoute()` treats each door within 3 as open. If the radius grows past 3, grow that loop too.
3. A change to `OPEN` or `SWING` in `public/office.js` needs the same change in `checkRoute()` (the angle) or in the comment above `opens()` (the time).
4. Update `INTENT.md` decision 20, the `opens()` contract in `CLAUDE.md` "Contracts between the files", and the door line in `CLAUDE.md` "Scene conventions".

## What no test covers

- The terrace walls, the hedge, and the grass in `build()`. A scratch check can copy the wall lines of `build()` and count the walls on each region edge: one, and none between two terraces.
- `public/office.js` and `public/decor.js`. After a change to `placer()`, `kitchen()`, `party()`, or `terrace()`, load `decor.js` with three.js in a scratch script. Check that no prop stands on a walk rect, that the kitchen draws a table and two chairs at each `room.tables` entry, and that no party prop stands on the dance floor or the speaker floor (`docs/decor.md` "Check placement in Node").
- The sha384 `integrity` values in `public/index.html`. A wrong hash fails only in the browser.
- The `if (import.meta.main)` block of `bridge.mjs`, the focus with the real terminal raise, and `detectTerminals()` (`pgrep` and `ps`). The `raiser()` test uses stubs.
- The message field in the page: the `#say` hide rule, the demo lock, and the `#msg` clear. Use a fake herdr socket for a browser check (see "Visual check in the browser").
- A room with two pod rows (wider than `MAX_ROW`). A route can cross the lower row.
- Two workers on trips can overlap in a corridor. No test checks that a door is open before a walker gets to it.

## Visual check in the browser

1. Start a check bridge in the background: `PORT=4848 npm start`.
2. Open `http://127.0.0.1:4848/?demo`. From 24 October to 1 November, `?demo` shows the Halloween props. Open `?demo&season=none` for the normal decor, and `?demo&season=halloween` for the props on any date. The `?season` value `none` shows no seasonal props. The demo page opens no `/events` stream, and the focus button and the message field are disabled.
2a. For the Halloween night, open `?demo&season=halloween`. Check the dim cool light, the candelabra in the corridors and in each room, and the flicker. A strike comes 20 to 60 s after load. Check with the emulated media feature `prefers-reduced-motion: reduce` that no strike shows and the flicker is weaker. For the switch back, set the page clock to 1 November 23:59:30 before load (override `Date`, with no `?season`), wait for the minute timer, and check that the normal light, background, and windows return at 2 November 00:00.
2b. For the winter decor, open `?demo&season=winter`. It shows the tree in the lobby and no snow, because the demo has no terrace. For the snow, start a fake herdr socket that serves the `synthetic()` snapshot of `test/model.test.mjs` (one terrace, `terrace:0`), and open `/?season=winter`. Check the snow grass, the hedge cap, the caps on the tree crowns, and the falling flakes. No browser check covered the half speed with reduce motion.
3. For a party trip, watch `w2:p2` in the "web" room. It walks to the party room about 18 s after load and sits again about 51 s after load. Its second trip goes to the kitchen at about 100 s, and the status change at 110 s cuts it short.
4. For a rush, watch `w3:p3` in the "docs" room. It turns `working` at tick 30, during the walk to its first lunch. A rush in the demo always shows `working`, never `blocked` or `done`.
5. For a lunch, watch `w3:p3` again. It is idle again from tick 80. It walks to a kitchen chair about 97 s after load, sits there from about 144 s to 183 s, and sits at its desk again about 229 s after load.
6. Stop the check bridge:
   1. Get the PID with `lsof -nP -tiTCP:4848 -sTCP:LISTEN`. Do not use `$!`, because it can give the PID of a wrapper shell.
   2. Kill that PID.
   3. Run the `lsof` command again to make sure that the port is free.

- Without `?demo`, the bridge polls the live herdr. Never click "Focus in herdr" or "Focus orchestrator" there, because the click marks the tab as seen. Never send a message there, because herdr types it into a live agent.
- To check a write path without the live herdr, use a fake herdr socket:
  1. Write a small fake in a scratch folder. It answers `session.snapshot` with a snapshot that has an agent pane, and each other request with `{ type: 'ok' }`. It logs each request.
  2. Start the fake with its cwd in that folder, on a short relative socket name such as `h.sock`. macOS caps a socket path at 104 bytes.
  3. Start the check bridge from the same folder: `PORT=4848 HERDR_SOCKET_PATH=h.sock node <repo>/bridge.mjs`.
  4. Use the page without `?demo`, and read the fake log. Then stop the bridge and the fake.
- For a pod lamp that changes from `working` to `blocked`, watch the "tests" pod (`w2:t2`) at ticks 3 to 5 of each 12-tick cycle. The demo never shows a meeting start or end. See `docs/model.md` "Demo".
- A page eval cannot read the state of `public/office.js`, because it exports nothing and sets no `window` property. It can read `.sign` and `.badge` in `#labels`: the text, the `--c` color, and `style.visibility`. Check the lamps, doors, and screens with a screenshot.
- `CLAUDE.md` "Visual checks" gives the headless Chrome method. With `--remote-debugging-pipe`, Chrome reads CDP on fd 3 and writes on fd 4. Each JSON message ends with a NUL byte.
- A zoom on the canvas (`keepInView()` sets `minZoom` each frame):

```js
document.querySelector('canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: -500, clientX: 600, clientY: 400, bubbles: true }))
```
