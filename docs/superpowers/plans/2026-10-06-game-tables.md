# Game Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Idle workers walk to a chess table or a ping-pong table, pair up, play, and walk back.

**Architecture:** `model.js` places one game table in each big workspace room and in a big party room, adds walk lanes to its two places, routes workers there, and pairs two workers in `stepBreak()`. `decor.js` draws the tables from the model data. `office.js` poses the players and animates the ball.

**Tech Stack:** Plain ES modules, three.js 0.186.1 from the importmap, `node --test`. No npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-06-game-tables-design.md`. Read it before a task. Also read `CLAUDE.md` (contracts, scene conventions, safety rules) and the doc in `docs/` for the area of the task.

## Global Constraints

- The project rule says the main session does not write project code. So this plan gives the interfaces, the rules, and the test cases with their assertions. The agent of a task writes the code. Match the style of the file: short names, comments in ASD-STE100 Simplified Technical English.
- Do not commit. The user commits and pushes only on request. The main session asks at the end.
- No npm dependencies, no lockfile. Run tests with `npm test` (`node --test test/*.test.mjs`) and syntax with `node --check <file>` for each changed file in `public/`.
- `public/model.js` has no imports and no DOM.
- 80 m²: a workspace room or the party room is big if `w * d - sum(pod.w * pod.d)` is 80 or more. A big room gets a ping-pong table and a chess table if both fit, else the one that fits. (Ruling after the Task 1 measurement: 37 gave tables to almost every room, and the user asked for big rooms only.)
- Chess places: 0.62 west and east of the table center. Ping-pong places: 1.55 west and east of the center.
- Wait for a partner: 20 s after the arrival (`WAIT = 20`). Chess: 30 to 60 s. Ping-pong: 20 to 40 s.
- Claimed keys: `game:<i>`. Place `2t` (west, `rot` 3) and place `2t + 1` (east, `rot` 1) belong to table `t`.
- Arm angles of a player stay at 1.5 or less. Ball white, paddles `#b06a4f`.
- The lobby, the kitchen, and the meeting room get no game table. The lobby keeps its chess table as fill decor. The lobby and meeting doors never open.
- Safety: tests never touch the live herdr socket. Treat `~/.claude` as read-only. A check bridge runs on port 4848 only, and the agent that starts it stops it.
- `public/office.js` and `public/decor.js`: use small `Edit` calls, never `Write` the full file. Read the region again before each `Edit`.

## Review Focus

1. A desk in the same room as the game table: the route must not leave the room or cross a pod. Task 2 tests it.
2. The waiter's partner rushes while still on the way out: the waiter must not wait for ever. Task 3 tests it.
3. A rebuild or a `lay` change during a game: no player stays frozen at a table. `lay` already clears `trips` and `claimed`. Task 5 checks that `lay` includes nothing new that needs clearing, because the game tables derive from the rooms and pods.
4. Two tables with waiters: a new trip joins exactly one waiter, and two new trips do not join the same waiter. Task 3 tests it.
5. A party room or a workspace room whose free floor reaches 80 m² but has no place for a table: no game table, and no crash. Task 1 tests it.

---

### Task 1: Place the game tables and their lanes

**Files:**
- Modify: `public/model.js` (`buildOffice()` after the party block, `walkRects()`, new helpers near `kitchenZ`/`partyZ`)
- Test: `test/model.test.mjs` (`assertPlan()` or a new `assertGames()` that `assertPlan()` calls)
- Docs: `docs/model.md`, `docs/testing.md`

**Interfaces:**
- Produces: `room.games = [{ kind: 'chess' | 'pingpong', x, z, places: [{ x, z, rot: 3 }, { x, z, rot: 1 }] }]` in world coords, on every room. It is `[]` except in a big workspace room or a big party room. At most one table of each kind.
- Produces: `buildOffice()` also returns `games: [{ room, kind, x, z, places }]`, one entry for each table of each `room.games`, in `rooms` order. `room` is the room id. Table `t` is `games[t]`.
- Produces: a helper `mainZ(r)`: the main walk line of a room. For a workspace room, it is `laneZ(r, p)` of the pod row nearest to the door. For the party room, it is `partyZ(r)`. For the kitchen, it is `kitchenZ(r)`.
- Produces: in `room.walk`, the main walk line reaches the x of each place, and a lane `R(place.x - LANE, mainZ, place.x + LANE, place.z)` runs to each place.

- [ ] **Step 1: Write the failing tests** in `test/model.test.mjs`. Run them on every floor plan that `assertPlan()` sees, and on `big()` and `garden()`:

```js
const LAMP = [-0.5, 0.4] // the pod lamp post from the pod corner, as in decor.js
const free = (r) => r.w * r.d - r.pods.reduce((s, p) => s + p.w * p.d, 0)
// The footprint of a table with a pad: chess 1.9 x 1.2 (the rug, the chairs at 0.72 and their backs), ping-pong 3.5 x 1.2 (players).
const foot = (g, pad) => { const fx = g.kind === 'chess' ? 0.95 : 1.75; return [g.x - fx - pad, g.z - 0.6 - pad, g.x + fx + pad, g.z + 0.6 + pad] }
function assertGames(o) {
  for (const r of o.rooms) {
    assert.ok(Array.isArray(r.games), `${r.id}: games is a list`)
    if (!r.games.length) continue
    assert.ok(r.kind === 'workspace' || r.kind === 'party', `${r.id}: a ${r.kind} room gets no game table`)
    assert.ok(free(r) >= 80 - EPS, `${r.id}: ${free(r)} m² free is less than 80`)
    assert.ok(new Set(r.games.map((g) => g.kind)).size === r.games.length, `${r.id}: two tables of one kind`)
    const old = r.walk.filter((w) => !r.games.some((g) => g.places.some((p) => inRect(p, w)))) // the walk rects without the lanes of the games
    for (const g of r.games) {
      const half = g.kind === 'chess' ? 0.62 : 1.55, f = foot(g, 0.3), core = foot(g, 0)
      assert.deepEqual(g.places.map((p) => p.rot), [3, 1])
      close(g.places[0].x, g.x - half, 'west place'); close(g.places[1].x, g.x + half, 'east place')
      for (const p of g.places) close(p.z, g.z, 'place z')
      assert.ok(f[0] >= r.x - EPS && f[2] <= r.x + r.w + EPS && f[1] >= r.z - EPS && f[3] <= r.z + r.d + EPS, `${r.id}: the table is inside`)
      for (const p of r.pods) {
        assert.ok(!hits(f, [p.x - 0.3, p.z - 0.3, p.x + p.w + 0.3, p.z + p.d + 0.3]), `${r.id}: the table hits pod ${p.id}`)
        const lx = p.x + LAMP[0], lz = p.z + LAMP[1]
        assert.ok(!hits(f, [lx - 0.15, lz - 0.15, lx + 0.15, lz + 0.15]), `${r.id}: the table hits the lamp of ${p.id}`)
      }
      const s = r.door.side === 'south' ? 1 : -1
      assert.ok(!hits(f, [r.door.x - 1.2, Math.min(r.door.z, r.door.z - s * 2), r.door.x + 1.2, Math.max(r.door.z, r.door.z - s * 2)]), `${r.id}: the table is in the door area`)
      for (const w of old) assert.ok(!hits(core, w), `${r.id}: the ${g.kind} table stands on the walk rect ${w}`)
      for (const h of r.games) if (h !== g) assert.ok(!hits(f, foot(h, 0)), `${r.id}: two tables touch`)
      if (r.kind === 'party') {
        assert.ok(!hits(f, r.floor), `${r.id}: the table is on the dance floor`)
        assert.ok(!hits(f, [r.booth.x - 1.8, r.booth.z - 0.45, r.booth.x + 1.8, r.booth.z + 0.45]), `${r.id}: the table hits the booth or a speaker`)
      }
      for (const p of g.places) assert.ok(r.walk.some((w) => inRect(p, w) && w[2] - w[0] <= 0.6 + EPS), `${r.id}: no lane to the place at ${p.x}`)
    }
  }
  for (const r of o.rooms) if (r.kind === 'lobby' || r.kind === 'kitchen' || r.kind === 'meeting') assert.deepEqual(r.games, [])
  assert.deepEqual(o.games.map((g) => g.room), o.rooms.flatMap((r) => r.games.map(() => r.id)))
}
```

Add `inRect` to `test/model.test.mjs` if it is missing (copy it from `test/walk.test.mjs`). Also add one test with a floor plan whose workspace room has 80 m² or more of free floor but no place for a table: it must give `games: []` and no crash. Add a test that the demo office (`buildOffice(demoSnapshot(0), demoMeetings(0))`) gives a chess table and a ping-pong table in the party room. Add a test with a deep workspace room of one pod row (a row whose other room has many pods, so the row is deep): it gets a table on the door side of the main walk line. The lanes of `checkRoute()` (0.4 from each lamp post, 1.0 from each dance spot) are Task 2 checks, but the search must already keep them.

- [ ] **Step 2: Run the tests and see them fail.** Run: `npm test`. Expected: the new tests fail on `r.game` being undefined, or on `o.games` being undefined.

- [ ] **Step 3: Write the placement.**
  - In `buildOffice()`, compute the walk rects first (the `walkRects()` loop), then for each workspace room and the party room with `free(r) >= 80`:
    - Try ping-pong first, then chess. For each kind, search candidate centers on a 0.5 grid (finer if needed), in a fixed order, on both sides of `mainZ(r)`. Take the first center that passes all the checks of Step 1, keeps off the walk rects and the other table, and whose lane from `mainZ(r)` to each place (0.6 wide) does not hit a pod, the table, a lamp post (0.4), or a dance spot (1.0).
    - Push each table to `r.games` and `{ room: r.id, ...table }` to `games`. Then add the lanes to `r.walk`.
  - In `walkRects()`, for a room with `game`: extend the main walk line rect to reach each place x, and add the lane to each place.
  - Return `games` from `buildOffice()`.

- [ ] **Step 4: Run the tests and see them pass.** Run: `npm test` and `node --check public/model.js`. Expected: all pass. The old tests must stay green.

- [ ] **Step 5: Fix the docs.** In `docs/model.md`, add `room.games`, `games`, `mainZ()`, and the walk lanes. In `docs/testing.md`, add `assertGames()`.

### Task 2: Route to a game place

**Files:**
- Modify: `public/model.js` (`route()`)
- Test: `test/walk.test.mjs` (`checkRoute()` and new tests)

**Interfaces:**
- Consumes: `room.games`, `games`, `mainZ(r)` from Task 1.
- Produces: `route(o, deskId, place, to)`. `to` is the id of a workspace room, the kitchen, or the party room. In the target room, the route goes through the door to `[stepX(k), stepZ(k)]`, to `[stepX(k), mainZ(k)]`, to `[place.x, mainZ(k)]`, then to `[place.x, place.z]`. For the kitchen and the party room, the result is the same as now.
- Produces: for a desk in room `to`, the route does not cross the door. It goes from the desk to `[stepX(r), z]` (the door lane at the desk row lane), along the door lane to `[stepX(r), mainZ(r)]`, then `[place.x, mainZ(r)]` and `[place.x, place.z]`.

- [ ] **Step 1: Write the failing tests** in `test/walk.test.mjs`:

```js
test('every route to a game place runs from a seat to the place through rooms, doors and corridors', () => {
  let n = 0, same = 0
  for (const [name, o] of offices) for (const g of o.games) for (const place of g.places) for (const d of o.desks.filter((d) => d.agent)) {
    checkRoute(name, o, d, place, g.room)
    const path = route(o, d.id, place, g.room)
    const r = o.rooms.find((r) => r.id === g.room)
    const zm = path.at(-2) // the last leg comes straight from the main walk line
    assert.ok(Math.abs(zm[0] - place.x) < 1e-9, `${name}: the last leg to ${place.x} is not straight`)
    if (d.roomId === g.room) { same++; assert.ok(path.every(([x, z]) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d), `${name}: ${d.id} leaves its own room`) }
    n++
  }
  assert.ok(n > 0, 'no game routes: add a case with a big room to CASES')
  assert.ok(same > 0, 'no route from a desk in the room of the table: add a case')
})
```

Extend `checkRoute()` so that a route to a workspace room accepts that room and its door, and so that it checks the game table tops (chess 0.7 x 0.7, ping-pong 2.2 x 1.2) like the kitchen table tops. If `CASES` has no big room with a game table, add a case: a row with one big workspace room of two small pods, and a desk of the agent in that room. Extend the `opens()` test: a walker to a game place opens only its own door and the door of `g.room`, and no door when both are the same room.

- [ ] **Step 2: Run the tests and see them fail.** Run: `npm test`. Expected: `checkRoute()` fails for the game routes, or `route()` throws on a workspace target.

- [ ] **Step 3: Write the route.** In `route()`, use `mainZ(k)` for `sz`. When `d.roomId === to`, build the path from the desk to the door lane point, then to `mainZ(r)`, the place x, and the place, with no door legs. Keep the dedupe loop at the end.

- [ ] **Step 4: Run the tests and see them pass.** Run: `npm test` and `node --check public/model.js`. Expected: all pass, also the 1208 lunch routes.

- [ ] **Step 5: Fix the docs.** `docs/model.md`: the route rule for a game place and for the same room.

### Task 3: Pair the players in `stepBreak()`

**Files:**
- Modify: `public/model.js` (`breakPlan()`, `stepBreak()`, `endBreak()`)
- Test: `test/walk.test.mjs`

**Interfaces:**
- Produces: `breakPlan(seed, n)` returns `{ wait, stay, lunch, pick, game }`. `game` is a number in [0, 1), from a new index of `u()`. `wait`, `stay`, `lunch`, and `pick` keep their values.
- Produces: `stepBreak(trips, claimed, id, { idle, seed, spots, route, tables }, t)`. `tables` is the kind of each game table, `office.games.map((g) => g.kind)`, or missing. The kind `game` has a count of `2 * tables.length`. `route('game', i)` gives the path to place `i`.
- Produces: the kinds in order are `['kitchen', 'lunch', 'party', 'game']`, filtered to those with a free place. For `game`, a free place is place `2t` or `2t + 1` of a table where both places are free.
- Produces: a game trip has `room: 'game'`, `spot: 'game:<i>'`, `table: t`, `partner` (a desk id or `null`), `begin` and `end` (the game times, or `null` before a join), and the usual fields.
- Produces: the return value `{ s, phase, got, play, trip }`. `play` is true while `phase === 'stay'` and `begin <= t < end`.
- Produces: `export const WAIT = 20`. The game time is `30 + 30 * plan.game` for chess and `20 + 20 * plan.game` for ping-pong, from the plan of the waiter.

- [ ] **Step 1: Write the failing tests** in `test/walk.test.mjs`. Use a straight `PATH` of 16 units, so the arrival is `start + OUT`:

```js
// Import WAIT from model.js too. The first call of stepBreak() for a worker only sets its first wait (5 to 30 s),
// so each test primes the workers at t = 0 and starts the trips at 100 or later.
const GAME = { tables: ['chess'] }
const arrive = (trip) => trip.start + trip.len / WALK
const gstep = (w, t, id, over = {}) => stepBreak(w.trips, w.claimed, id, { idle: true, seed: seedFor('game', [...KINDS, 'game']), spots: {}, route: () => PATH, ...GAME, ...over }, t)
const kstep = (w, t, id) => gstep(w, t, id, { seed: seedFor('kitchen', [...KINDS, 'game']), spots: { kitchen: 3 } }) // a worker whose pick is the counter

test('stepBreak: a waiter goes to a free game place and walks back after 20 s alone', () => {
  const w = world()
  assert.equal(gstep(w, 0, 'a'), null)
  const a = gstep(w, 100, 'a')
  assert.equal(a.trip.room, 'game'); assert.match(a.trip.spot, /^game:[01]$/); assert.equal(a.play, false)
  const end = arrive(a.trip) + WAIT
  assert.equal(gstep(w, end - 0.1, 'a').phase, 'stay')
  assert.equal(gstep(w, end + 0.1, 'a').phase, 'back')
  assert.equal(gstep(w, end + OUT + 0.1, 'a'), null)
  assert.equal(w.claimed.size, 0)
})

test('stepBreak: a new trip joins a waiter, whatever its pick, and both end at the same time', () => {
  const w = world()
  gstep(w, 0, 'a'); kstep(w, 0, 'b') // both wait for their first trip
  const a = gstep(w, 100, 'a')
  const tj = arrive(a.trip) + 5 // b starts its trip 5 s into the wait of a
  const b = kstep(w, tj, 'b')
  assert.equal(b.trip.room, 'game'); assert.equal(b.trip.table, a.trip.table); assert.notEqual(b.trip.spot, a.trip.spot)
  assert.equal(a.trip.partner, 'b'); assert.equal(b.trip.partner, 'a')
  assert.equal(a.trip.begin, Math.max(arrive(a.trip), arrive(b.trip))); assert.equal(a.trip.end, b.trip.end)
  assert.ok(a.trip.end - a.trip.begin >= 30 && a.trip.end - a.trip.begin <= 60, 'a chess game lasts 30 to 60 s')
  close(arrive(a.trip) + a.trip.stay, a.trip.end, 'the stay of a ends at the game end')
  close(arrive(b.trip) + b.trip.stay, b.trip.end, 'the stay of b ends at the game end')
  assert.equal(gstep(w, a.trip.begin - 0.1, 'a').play, false) // a waits for b
  assert.equal(gstep(w, a.trip.begin + 0.1, 'a').play, true)
})
```

Write these tests too, in the same style. Use the same `seedFor` helper with the 4 kinds.
  - A join gives `play: true` only between `begin` and `end`. The waiter in its stay before `begin` gets `play: false`.
  - A rush of one player ends the game of the other: its `stay` ends at `max(t, arrival)`, it walks back (phase `back` after the end, not `rush`), and its `end` is the rush time.
  - The partner rushes while it is still on the way out: the waiter walks back at once, and does not wait again.
  - `endBreak()` of one player ends the game of the other in the same way.
  - Two tables, two waiters: one new trip joins exactly one waiter. A second new trip joins the other waiter. A third new trip does not join a full table.
  - A trip that starts after the 20 s wait of a waiter does not join it. It makes its own pick.
  - With `tables` missing or `[]`, the pick never gives `game`. The 3-kind pick test still passes.
  - The pick test: over many seeds, with 4 kinds that all have free places, each kind gets about a quarter.
  - The `game:<i>` keys are claimed when a trip starts and freed when it ends.

- [ ] **Step 2: Run the tests and see them fail.** Run: `npm test`. Expected: the new tests fail. The old `stepBreak` tests stay green.

- [ ] **Step 3: Write the pairing.**
  - In `breakPlan()`, add `game: u(7)`. Do not change the other indexes, so the demo story stays the same.
  - In `stepBreak()`, when a trip starts:
    1. Look for a waiter first: for each table `t`, exactly one of `game:<2t>` and `game:<2t+1>` is claimed. The claimant's trip has `partner === null`, `rush == null`, and `t < at(trip) + WAIT`. Take the free place of the first such table.
    2. Else make the normal pick over the 4 kinds.
  - At a join, set `partner` on both trips, `begin = max(at(a), at(b))`, `end = begin + gameTime`, and `stay = end - at(trip)` on both.
  - A waiter starts with `stay = WAIT`.
  - At a rush of a player with a partner, set the partner's `end = t` and its `stay = max(0, t - at(partner))`. Do the same in `endBreak()`.
  - Return `play` as in Interfaces.
  - Update the comments of `breakPlan()`, `stepBreak()`, and `endBreak()`.

- [ ] **Step 4: Run the tests and see them pass.** Run: `npm test` and `node --check public/model.js`. Expected: all pass, also the demo test (`the demo has two long-idle agents...`). If the demo test fails because a game changes the demo story, report it and do not change the demo.

- [ ] **Step 5: Fix the docs.** `docs/model.md`: `breakPlan()`, `stepBreak()`, `endBreak()`, `WAIT`. `docs/testing.md`: the new tests.

### Task 4: Draw the game tables (`decor.js`)

Runs after Tasks 1 to 3, in parallel with Task 5.

**Files:**
- Modify: `public/decor.js` (`workspaceDecor()`, `party()`, a new helper `gameTable(g, room, put)` near `chessTable`, the `OFFICE` and `PARTY` pools)
- Docs: `docs/decor.md`

**Interfaces:**
- Consumes: `room.games` from Task 1. `places[0]` and `places[1]` are the pivots of the players, as the kitchen `chairs` are.
- Produces: nothing for other files.

- [ ] **Step 1: Draw each game table** from `room.games`, in room-local coords, before the fixed props and the fill of the room:
  - Chess: the rug, the table, the board, and the pieces of `chessTable`, turned so the chairs stand west and east. Draw each chair 0.1 behind its place, with its back away from the table. This is the same offset as the kitchen chairs (see `kitchen()`). Keep `chessTable` as it is for the lobby pool.
  - Ping-pong: `pingPong` at `(x, z)`, rot 0, so the long side runs along x.
  - Draw them without `put()`, because the places are on walk rects. Push the footprint (from `Box3.setFromObject`, as in `kitchen()`) into `put.taken`.
- [ ] **Step 2: Take `chessTable` and `pingPong` out of the `OFFICE` and `PARTY` pools.** Keep `chessTable` in the `LOBBY` pool.
- [ ] **Step 3: Check.** Run: `node --check public/decor.js` and `npm test`. Expected: pass.
- [ ] **Step 4: Fix the docs.** `docs/decor.md`: the game tables, the pools, and a pitfall line that the chair offset copies `kitchen()`.

### Task 5: Pose the players, the ball, and the paddle (`office.js`)

Runs after Tasks 1 to 3, in parallel with Task 4.

**Files:**
- Modify: `public/office.js` (`breaks()`, `worker()`, `stroll()`, the desk branch of `pose()`, the click handler, `build()` for the ball, the animation loop for one call of a new `rally(t)`)
- Docs: `docs/office.md`

**Interfaces:**
- Consumes: `office.games`, `route()` with a room id, `stepBreak()` with `tables`, the return value `{ s, phase, got, play, trip }`, and the trip fields `room: 'game'`, `spot`, `table`, `partner`, `begin`, `end`.
- Produces: nothing for other files.

- [ ] **Step 1: `breaks()`.** Pass `tables: office.games.map((g) => g.kind)`. For `route('game', i)`, call `route(office, d.id, office.games[i >> 1].places[i & 1], office.games[i >> 1].room)`. Return `room: office.games[trip.table].room` for a game trip, so `opens()` gets a room id.
- [ ] **Step 2: `worker()`.** Add `paddle`, hidden, like `mug` and `plate`: a brown `#b06a4f` paddle in the right hand. Make it after the `mats` traverse, as the plate is.
- [ ] **Step 3: `stroll()`, the stay of a game trip.** Put the group at the place (no 0.4 offset), with the target heading `rot * PI / 2`, as for the lunch eater.
  - Chess: `sit` shows. While `play`, one player reaches to the board and back every 3 to 5 s. The players take turns: the player at place `2t` moves in even turns, from `begin`. Each arm angle stays at 1.5 or less.
  - Ping-pong: `stand` shows, and `paddle` shows. While `play`, the right arm swings when the ball reaches the player.
  - While not `play` (waiting, or after the game ended): arms down, facing the table.
  - Hide `paddle` in every other phase and in the desk branch of `pose()`.
- [ ] **Step 4: The ball.** In `build()`, for each ping-pong table, make a small white ball in `live`, hidden. Each frame, `rally(t)` finds the two players of the table (from `claimed` and `trips`). While both `play`, the ball flies from one paddle to the other in 0.8 s, along an arc, and bounces once on each half. Its phase starts at `begin`. Else the ball hides.
- [ ] **Step 5: The click.** A seated chess player gets a walker box, like a lunch eater. Change the filter of the walker boxes so that it takes every worker on a trip. One way: `pose()` sets `w.out = !!walk`, and the filter reads `v.worker?.out`.
- [ ] **Step 6: Check.** Run: `node --check public/office.js` and `npm test`. Then run the browser check: start `PORT=4848 npm start` in the background, open `http://127.0.0.1:4848/?demo` in a browser that draws frames (the Claude Browser pane draws nothing while it is hidden), and look at a game. Never click "Focus in herdr" and never send a message. Stop the bridge: `lsof -nP -tiTCP:4848 -sTCP:LISTEN`, kill that PID, and run `lsof` again.
- [ ] **Step 7: Fix the docs.** `docs/office.md`: `breaks()`, `worker()`, `stroll()`, `rally()`, and the click filter.

### Task 6: Main session: docs of record and the final check

**Files:**
- Modify: `INTENT.md` (decision 28, the `idle` row, decision 20 note), `CLAUDE.md` (contracts and scene conventions)

- [ ] **Step 1:** Write INTENT.md decision 28 from the spec "Request" table and sections 1 to 3.
- [ ] **Step 2:** Update CLAUDE.md: `buildOffice()` returns `games`, `room.games`, the walk lanes, `route()` with a room id, `breakPlan()`, `stepBreak()` with `tables` and `play`, `WAIT`, `opens()` for a game trip, the poses, the ball in `live`, and the click filter.
- [ ] **Step 3:** Run `npm test` and `node --check` on each file in `public/`. Expected: all pass.
- [ ] **Step 4:** Browser check with `?demo` on port 4848 in a browser that draws frames. Get one screenshot of a chess game or a ping-pong game. Stop the bridge.
- [ ] **Step 5:** Report to the user and ask whether to commit and push.
