# Game tables: idle workers play chess and ping-pong

Date: 2026-10-06. Status: approved by the user and built. The rulings during the build are marked "Changed during the build".

## Request

In the user's words: "If there is like a chess board setup an da ping pong table, I want the agents to be able to use it when they're free".

The user chose these answers:

| Question | Answer |
|---|---|
| How do the workers play? | Two free workers pair up. |
| Where do the game tables stand? | Big rooms, as now, fixed by the model. |
| Which rooms are big? | "Only do it in big rooms, e.g. the current version has a very big room (not the demo variant)". |
| The lobby chess table? | Decor only. Decision 20 does not change. |
| Which pairing approach? | A: a waiter calls the next free worker. |

INTENT.md gets this as decision 28.

## Today

- `furnish()` in `decor.js` puts `chessTable` and `pingPong` at random places, only in big rooms. The office pool has both, the party pool has `pingPong`, and the lobby pool has `chessTable`.
- The model does not know these places, so no route reaches them.
- `route()` goes only to the kitchen or the party room. Nobody walks to the lobby, and its door never opens (decision 20).
- `stepBreak()` runs one worker at a time. It knows three trip kinds: `kitchen`, `lunch`, and `party`.

## 1. Placement and routes (`model.js`)

### Which rooms get a game table

- A workspace room or the party room is big if its floor minus its pods is 80 m² or more. A big room gets a ping-pong table and a chess table if both fit, else the one that fits, else none.
- The first rule (37 m², the size of the first fill prop) gave a table to almost every room. A measurement then showed that a table on the far side of the main walk line almost never fits. The user then named the very big rooms of the live office. Their free floor is 209 m² and 452 m². The other rooms of that office have 37 to 64 m².
- The lobby, the kitchen, and the meeting room get no game table.

### The table and its places

- `buildOffice()` gives each room `games: [{ kind, x, z, places: [{ x, z, rot }, { x, z, rot }] }]`, in world coords. It is `[]` in a room with no game table.
- A place is the pivot of a player, where its route ends. `rot` is in quarter turns, and the player faces -z before the turn (`rotation.y = rot * PI / 2`), as with the kitchen `chairs`.
- `places[0]` is on the west side (`rot` 3, faces +x). `places[1]` is on the east side (`rot` 1, faces -x). Both are at the table z.
- Chess: a table of 0.7 x 0.7 on a rug. The places are 0.62 west and east of the center. `decor.js` draws each chair 0.1 behind its place, as in the kitchen. The rug turns so the chairs stand west and east.
- Ping-pong: a table of 2.2 x 1.2, the long side along x. The places are 1.55 west and east of the center, 0.45 past each end.
- So a straight lane reaches each place, and no lane crosses the table.

### The main walk line and the search

- The main walk line of a room is the line that the door lane meets in the room:
  - In a workspace room, it is the lane (`laneZ()`) of the pod row nearest to the door.
  - In the party room, it is the strip (`partyZ()`).
- The table can stand on either side of that line: between the line and the door wall, or on the far side. In a deep room with one pod row, the door side has the most free floor.
- The search tries places on a grid, on both sides. A place is good when all of these hold:
  - The table, its chairs or players, and a pad of 0.3 are inside the room.
  - They do not touch a pod (with the pad of `placer()`), the door area, the open leaf, or the lamp post of a pod.
  - In the party room, they do not touch the dance floor, the booth, or the speakers.
  - They do not touch an existing walk rect of the room, or another game table.
  - A straight lane from the main walk line to each place is free of pods and of the table. It keeps 0.4 from each lamp post and 1.0 from each dance spot.
- The model adds to `room.walk`:
  - the main walk line, long enough to reach the x of each place, and
  - a lane from that line to each place.
  So `placer()` keeps every prop off them.

### Routes

- `route(o, deskId, place, to)` takes `to` as the id of any workspace room, the kitchen, or the party room.
- In the target room, the route goes through the door, to the main walk line, along it to the x of the place, then to the place. In the kitchen and the party room, this is the same as now.
- A worker whose own room has the game table does not go through a door. It goes from its desk to the door lane, along the door lane to the main walk line, then to the place.
- `opens()`: a walker opens its own door and the door of `a.room`. Changed during the build: a walker to a game table in its own room opens no door. The lobby and meeting doors stay closed.

## 2. Trip and pairing (`model.js`)

### Plan

- `breakPlan(seed, n)` also returns `game`: a game time of 30 to 60 s for chess and 20 to 40 s for ping-pong. Use one number in [0, 1) and scale it by the kind.

### Kinds and pick

- The kinds are `['kitchen', 'lunch', 'party', 'game']`. The pick counts the kinds that have places, and a full kind sends the worker to the next kind, as before. Changed during the build: this spec first said that the pick counts only the kinds with a free place, but that rule broke an old test. For `game`, a free place is a place at a table where nobody is.
- `spots.game` is the place count (two for each table). Place `2t` and place `2t + 1` belong to table `t`. The claimed key is `game:<i>`.

### The waiter

- A worker that picks `game` takes place `2t` or `2t + 1` of a free table. Use the seed start rule of `free()`.
- It walks there and waits up to 20 s after it arrives (`WAIT = 20`). If nobody joins in that time, its stay ends, and it walks back.

### The join (approach A)

- When any idle worker starts a trip, it first looks for a waiter:
  - one claimed place of a table, with the other place free,
  - the trip of the claimant has no partner, no rush, and is in phase `out`, or in phase `stay` before its 20 s end.
- If it finds one, it takes the other place, whatever its own pick was. Both trips get `partner`: the desk id of the other player.
- From the join on, the waiter waits until the partner arrives. The 20 s limit no longer applies.

### The game

- Let `at(trip)` be `trip.start + trip.len / WALK`, the arrival time. The game starts at the later arrival.
- The game time comes from the plan of the waiter. The game ends at the start plus the game time.
- At the join, `stepBreak()` sets the `stay` of both trips so that both stays end at the game end. `tripAt()` does not change.
- Both players walk back at the same time.

### A status change

- If one player's status leaves `idle`, that player runs back (`rush`), as now.
- The game of the other player ends: its stay ends now (or at its arrival, if it is still on the way), and it walks back.
- The other player is still on a trip. It does not wait for a new partner.

### State

- The trip state stays in `trips` and `claimed`. A rebuild of the scene does not end a game. A change of `lay` ends every trip, as now.
- `endBreak()` also ends the game of the partner.

## 3. Look (`office.js`, `decor.js`)

### Chess

- Both players sit on the chairs with the seated legs and face the table.
- Every 3 to 5 s, one player reaches to the board and back. The players take turns.
- Each arm angle stays at 1.5 or less.

### Ping-pong

- Both players stand at the table ends and face each other.
- Each holds a paddle in the right hand. The paddle shows in the same way as the mug.
- A white ball flies in an arc between the paddles and bounces once on each half. One crossing takes about 0.8 s.
- The arm of the player who hits swings when the ball reaches it.
- The ball shows only while a game runs. It is in `live`.

### Waiting

- A waiter sits on its chair or stands at its table end, with its arms down. It faces the table.

### Clicks

- A click on a player opens its panel and follows it, as for the other trips.
- The click handler makes a walker box for a seated chess player, as for a lunch eater.

### Decor

- `decor.js` draws each game table from `room.games`, without `put()`, because its places are on walk rects. It puts the footprint in `put.taken`.
- Chess and ping-pong leave the fill pools of the workspace rooms and the party room. The lobby keeps its chess table as decor only.
- The two paddles that lie on the ping-pong table stay as decor.

### Colors

- The ball is white. The paddles are `#b06a4f`, the brown of the paddles on the table. No new color is near a status color.

## 4. Tests (first)

Each test must fail before the code exists.

### `test/model.test.mjs`, in every floor plan

- A room gets a game table only if its floor minus its pods is 80 m² or more. It gets at most one table of each kind.
- A table and its places stay inside the room, with the clearances in "The main walk line and the search".
- The lobby, the kitchen, and the meeting room get no game table.

### `test/walk.test.mjs`

- `checkRoute()` runs from each agent desk to each game place, in many floor plans. This includes a desk in the same room as the table.
- `opens()` gives only the own room and the target room.
- `stepBreak()`:
  - A waiter leaves after 20 s alone.
  - A new trip joins a waiter, whatever its pick.
  - Both players end at the same time.
  - A rush of one player ends the game for the other.
  - The `game:<i>` keys are claimed and freed.
  - The pick counts only the kinds with free places.

## 5. Work split

1. One agent writes the model and the tests: sections 1 and 2.
2. Then two agents work in parallel:
   - One changes `decor.js`: the game tables and the fill pools.
   - One changes `office.js`: the poses, the ball, the paddle, and the clicks.
3. The main session runs the checks, the browser check with `?demo` on port 4848, and writes INTENT.md decision 28 and the CLAUDE.md contracts.

## Open risk

In the demo, only the party room is big (112 m²). A measurement shows that its door-side band holds a chess table and a ping-pong table. In a party room with its door in the south wall, the south wall can hide the tables from the camera.
