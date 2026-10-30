# IDR 0006: the break module

Date: 2026-10-30

Status: accepted

## Context

`stepBreak()` in `public/model.js` was shallow. `public/office.js` owned its state (`trips`, `claimed`) and three lookups for each trip kind: kind to route, kind to room id, and spot key to index. Node cannot load `office.js`, so no test covered these lookups, the layout check (`lay`), or the end of the trip of an `away` desk. The chat branch (a84141f..b5af30f) added one trip kind and changed 12 files. The spec is `.local/specs/2026-10-30-break-module.md`. This record holds the technical choices of the refactor.

## Decision

- A pure refactor. No visible behaviour changes. `npm test` and the demo run in `test/walk.test.mjs` are the check.
- One factory in `public/model.js`, with no new file: `idleBreaks()` returns `{ use, step, now }`. `trips`, `claimed`, the office, and every lookup of a trip kind live in its closure.
- `use(office, t)` keeps the office of an update. It owns the layout check: a change of the route inputs clears every trip. It also ends the trip of each desk with `away` or no `agent` at `t`.
- `step(desk, t)` computes the seed (`hash(desk.terminalId ?? desk.id, 1e9)`) and `idle` (`desk.status === 'idle' && !desk.away`). It returns `null`, or a flat value with no trip object: `{ x, z, dx, dz, s, phase, kind, room, seat, side, table, begin, got, play, talk, doors }`.
- `now(t)` returns `{ games: [{ table, begin, end }], stays }`. `rally()` and `nextStop()` read it and no longer read `trips` or `claimed`.
- One rule for a game in play: both places hold a trip, and `begin <= t <` the earlier end. This is the rule that `rally()` had.
- The trip field `room` is now `kind`. So `kind` is always a trip kind, and `room` is always a room id.
- The eased heading moves from the trip to a `heading` Map by desk id in `office.js`.
- `nextStop(office, now, seen = [])` takes the `now` value, so a test passes a plain value.

The demo run of `test/walk.test.mjs` gives these values. `t` is in seconds, and table 1 is the chess table of the party room.

```text
t   0.0  use(office, 0): the first office. No trip yet.
t 117.1  step(w3:p3) -> { kind: 'game', room: 'party', side: 0, table: 1, begin: 117.08, play: true, doors: [] }
t 117.1  step(w1:p2) -> { kind: 'game', room: 'party', side: 1, table: 1, begin: 117.08, play: true, doors: [] }
t 117.1  now() -> { games: [{ table: 1, begin: 117.08, end: 173.42 }], stays: ['game'] }
t 173.5  both walk back (phase 'back', play false). now() -> { games: [], stays: [] }
```

A rush of one player before 173.42 removes the game from `now()` in the same frame. The test "idleBreaks: a rush of one player removes the game from now() at once" checks it.

## Consequences

- `stepBreak()` and `endBreak()` stay exported as the internal seam of `idleBreaks()`. The rule tests in `test/walk.test.mjs` call them with a fixed `PATH`, fake spot counts, and a hand-filled `claimed`.
- `office.js` must call only `idleBreaks()`: `breaks.use()` in `update()`, `breaks.step()` in `pose()`, and `breaks.now()` in `rally()` and `tourStep()`.
- A new trip kind changes the break module (`idleBreaks()` and its seam `stepBreak()`) and `stroll()`. `pose()` and `update()` do not change.
- The heading ease and the chess turn stay in `office.js` until the pose moves to the model.
