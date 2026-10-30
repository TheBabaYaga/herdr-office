import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildOffice, candleSpots, lightningPlan, flash, demoSnapshot, demoMeetings, along, tripAt, breakPlan, route, hash, calm, opens, pathLen, stepBreak, endBreak, idleBreaks, WALK, RUN, WAIT } from '../public/model.js'

// Synthetic snapshots. All values are made up.
const AREA = { x: 10, y: 2, width: 100, height: 40 }
const G = (c, r) => Array.from({ length: c * r }, (_, i) => [(i % c) * 100 / c, Math.floor(i / c) * 40 / r, 100 / c, 40 / r]) // a c x r grid of pane rects
const SIX = [[0, 0, 60, 40], [60, 0, 30, 13], [60, 13, 30, 14], [60, 27, 30, 13], [90, 0, 10, 20], [90, 20, 10, 20]]
// spec: one entry for each workspace, one entry for each tab in it: a list of pane rects [x, y, w, h] in cells.
// Every fourth pane is a shell. The others are idle claude agents.
function snap(spec) {
  const s = { version: 'test', protocol: 20, focused_workspace_id: 'w1', focused_tab_id: 'w1:t1', focused_pane_id: 'w1:p1', workspaces: [], tabs: [], panes: [], layouts: [], agents: [] }
  let k = 0
  spec.forEach((tabs, i) => {
    const ws = `w${i + 1}`
    s.workspaces.push({ workspace_id: ws, number: i + 1, label: ws })
    tabs.forEach((rects, j) => {
      const tab = `${ws}:t${j + 1}`, ids = rects.map(() => `${ws}:p${++k}`)
      s.tabs.push({ tab_id: tab, workspace_id: ws, number: j + 1, label: tab })
      s.layouts.push({
        workspace_id: ws, tab_id: tab, zoomed: false, focused_pane_id: ids[0], area: AREA, splits: [],
        panes: rects.map((r, m) => ({ pane_id: ids[m], focused: false, rect: { x: AREA.x + r[0], y: AREA.y + r[1], width: r[2], height: r[3] } })),
      })
      ids.forEach((id, m) => {
        const kind = (k - ids.length + m + 1) % 4 === 0 ? null : 'claude', cwd = `/synthetic/${id}`
        s.panes.push({ pane_id: id, terminal_id: `term_${id}`, workspace_id: ws, tab_id: tab, focused: false, cwd, foreground_cwd: cwd, agent_status: kind ? 'idle' : 'unknown', terminal_title: 'sh', terminal_title_stripped: 'sh', scroll: {}, revision: 1, ...(kind && { agent: kind }) })
        if (kind) s.agents.push({ pane_id: id, terminal_id: `term_${id}`, workspace_id: ws, tab_id: tab, agent: kind, agent_status: 'idle', focused: false, cwd, foreground_cwd: cwd, terminal_title: 'x', terminal_title_stripped: 'x', state_change_seq: k, revision: 1 })
      })
    })
  })
  return s
}

// The floor plans to test. Different workspace counts put the kitchen into a north row or a south row.
const SHAPES = [[G(2, 2)], [G(1, 1)], [G(2, 1), G(1, 3)], [SIX], [G(3, 1)], [G(1, 2), G(2, 2), G(1, 1)]]
const CASES = {
  demo: [demoSnapshot(0), demoMeetings(0)],
  'the demo with a quiet meeting': [demoSnapshot(30), []],
  '2x2 split': [snap([[G(2, 2)]]), []],
  '6-way uneven split': [snap([[SIX]]), []],
  'two pods side by side': [snap([[G(2, 1), G(1, 2)]]), []],
}
for (let n = 1; n <= 9; n++) {
  CASES[`${n} workspaces`] = [snap(Array.from({ length: n }, (_, i) => SHAPES[(i * 5 + n) % SHAPES.length])), []]
  CASES[`${n} small workspaces`] = [snap(Array.from({ length: n }, () => [G(1, 1)])), []]
}
CASES['a deep room with one pod row'] = [snap([[G(3, 1)], [G(1, 6)]]), []] // w1 gets its game tables between the row lane and the door wall
for (const n of [12, 18]) CASES[`${n} workspaces, with a meeting`] = [snap(Array.from({ length: n }, (_, i) => SHAPES[i % SHAPES.length])), demoMeetings(0)]
const offices = Object.entries(CASES).map(([name, [s, m]]) => [name, buildOffice(s, m)])

test('the kitchen has a counter and at least 3 standing spots in front of it', () => {
  for (const [name, o] of offices) {
    const k = o.rooms.find(r => r.kind === 'kitchen'), { counter: c, spots } = k
    assert.ok(c.len >= 2.6 && c.len <= 3.2, `${name}: counter length ${c.len}`)
    assert.ok(Math.abs(c.x - c.len / 2 - (k.x + 0.2)) < 1e-9, `${name}: the counter starts 0.2 from the west wall`)
    assert.equal(c.z, k.z + 0.2, `${name}: the counter stands 0.2 from the north wall`)
    assert.ok(spots.length >= 3, `${name}: ${spots.length} spots`)
    for (const [i, a] of spots.entries()) {
      assert.ok(a.x >= c.x - c.len / 2 && a.x <= c.x + c.len / 2, `${name}: spot ${i} in front of the counter`)
      assert.ok(a.z > c.z + 0.8 && a.z < c.z + 2 && a.z < k.z + k.d, `${name}: spot ${i} in front, not at the counter`)
      for (const b of spots.slice(i + 1)) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 0.85, `${name}: spots apart`)
    }
  }
})

test('the cases cover both kitchen door sides', () => {
  assert.deepEqual([...new Set(offices.map(([, o]) => o.rooms.find(r => r.kind === 'kitchen').door.side))].sort(), ['north', 'south'])
})

test('the party room has dance spots in two rows, a dance floor and a DJ booth, all inside the room', () => {
  const sides = []
  for (const [name, o] of offices) {
    const r = o.rooms.find(r => r.kind === 'party')
    if (!r) continue
    sides.push(r.door.side)
    const s = r.door.side === 'south' ? 1 : -1, wall = s > 0 ? r.z + r.d : r.z, far = s > 0 ? r.z : r.z + r.d // the door wall and the far wall
    const deep = (z) => Math.abs(z - wall), inRoom = (x, z) => x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d
    const nf = Math.floor((r.w - 3) / 2) + 1, front = r.spots.slice(0, nf), back = r.spots.slice(nf)
    assert.equal(back.length, nf - 1, `${name}: one back spot less than the front row`)
    for (const p of r.spots) assert.ok(inRoom(p.x, p.z), `${name}: spot (${p.x}, ${p.z}) inside`)
    for (const row of [front, back]) row.forEach((p, i) => {
      assert.equal(p.z, row[0].z, `${name}: a row of spots is straight`)
      if (i) close(p.x - row[i - 1].x, 2, `${name}: spots in a row are 2.0 apart`)
    })
    close(deep(back[0].z) - deep(front[0].z), 1, `${name}: the back row is 1.0 deeper`)
    back.forEach((p, i) => { close(p.x - front[i].x, 1, `${name}: back spot ${i}`); close(front[i + 1].x - p.x, 1, `${name}: back spot ${i}`) })

    const [x0, z0, x1, z1] = r.floor, strip = s > 0 ? z1 : z0 // the floor reaches from the strip to 1.0 behind the back row
    assert.ok(x0 < x1 && z0 < z1 && inRoom(x0, z0) && inRoom(x1, z1), `${name}: the floor is inside`)
    close(x0, front[0].x - 1, `${name}: the floor west edge`)
    close(x1, front.at(-1).x + 1, `${name}: the floor east edge`)
    close(deep(strip), deep(front[0].z) - 1, `${name}: the strip is 1.0 in front of the front row`)
    close(Math.abs(z1 - z0), deep(back[0].z) + 1 - deep(strip), `${name}: the floor depth`)
    for (const v of [x1 - x0, z1 - z0]) close(v, Math.round(v), `${name}: whole floor tiles`)
    assert.ok(deep(strip) >= 1.4, `${name}: the strip is ${deep(strip)} from the door wall`)

    const b = r.booth
    assert.deepEqual([b.x, b.rot], [r.x + r.w / 2, s > 0 ? 0 : 2], `${name}: the booth is centered and faces the door`)
    assert.ok(inRoom(b.x - 0.8, b.z - 0.35) && inRoom(b.x + 0.8, b.z + 0.35), `${name}: the booth is inside`)
    assert.ok(Math.abs(b.z - s * 0.35 - far) >= 0.5, `${name}: the booth back is 0.5 or more from the far wall`)
    assert.ok(deep(b.z) - 0.35 >= deep(back[0].z) + 1, `${name}: the booth is off the floor`)

    assert.ok(r.walk.length && r.walk.every(w => w[0] <= w[2] && w[1] <= w[3] && w[0] >= r.x && w[1] >= r.z && w[2] <= r.x + r.w && w[3] <= r.z + r.d), `${name}: walk rects of the party room are inside it`)
    for (const p of r.spots) assert.ok(r.walk.some(w => p.x >= w[0] && p.x <= w[2] && p.z >= w[1] && p.z <= w[3]), `${name}: spot (${p.x}, ${p.z}) on a walk rect`)
  }
  assert.deepEqual([...new Set(sides)].sort(), ['north', 'south'], 'the cases cover both party door sides')
})

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} is not ${b}`)

test('along gives the point and the direction at a distance on a polyline', () => {
  const path = [[0, 0], [0, 4], [3, 4]] // 4 south, then 3 east
  assert.deepEqual(along(path, 0), { x: 0, z: 0, dx: 0, dz: 1 })
  assert.deepEqual(along(path, 2), { x: 0, z: 2, dx: 0, dz: 1 })
  assert.deepEqual(along(path, 5), { x: 1, z: 4, dx: 1, dz: 0 })
  assert.deepEqual(along(path, 7), { x: 3, z: 4, dx: 1, dz: 0 })
  assert.deepEqual(along(path, 99), along(path, 7), 'clamped at the end')
  assert.deepEqual(along(path, -3), along(path, 0), 'clamped at the start')
  assert.deepEqual(along([[1, 1], [0, 1]], 0.25), { x: 0.75, z: 1, dx: -1, dz: 0 })
})

test('tripAt: out, stay, back and done at the walk speed', () => {
  const trip = { len: 10 * WALK, start: 10, stay: 8 } // 10 s out, 8 s stay, 10 s back
  const at = (t, rush) => tripAt(rush === undefined ? trip : { ...trip, rush }, t)
  for (const [t, s, phase] of [[10, 0, 'out'], [15, 5 * WALK, 'out'], [19.9, 9.9 * WALK, 'out'], [20, 10 * WALK, 'stay'], [27.9, 10 * WALK, 'stay'], [28, 10 * WALK, 'back'], [33, 5 * WALK, 'back'], [37.9, 0.1 * WALK, 'back'], [38, 0, 'done'], [99, 0, 'done']]) {
    const r = at(t)
    assert.equal(r.phase, phase, `t ${t}`)
    close(r.s, s, `t ${t}`)
  }
  assert.deepEqual(at(3), { s: 0, phase: 'out' }, 'before the start the worker is still at the desk')
})

test('tripAt: a rush runs back at the run speed from where the worker is', () => {
  const trip = { len: 10 * WALK, start: 10, stay: 8 }
  const at = (rush, t) => tripAt({ ...trip, rush }, t)
  // [rush time, the distance from the desk at that time]: in out, in stay, in back
  for (const [rush, away] of [[15, 5 * WALK], [22, 10 * WALK], [33, 5 * WALK]]) {
    const home = away / RUN // seconds to run back
    for (const [dt, s, phase] of [[0, away, 'rush'], [home / 2, away / 2, 'rush'], [home - 0.1, 0.1 * RUN, 'rush'], [home, 0, 'done'], [home + 20, 0, 'done']]) {
      const r = at(rush, rush + dt)
      assert.equal(r.phase, phase, `rush ${rush}, dt ${dt}`)
      close(r.s, s, `rush ${rush}, dt ${dt}`)
    }
  }
  assert.deepEqual(at(15, 14), { s: 4 * WALK, phase: 'out' }, 'before the rush the trip goes on')
  for (const [rush, t] of [[5, 6], [5, 12], [50, 60]]) assert.deepEqual(at(rush, t), { s: 0, phase: 'done' }, `before the start and after the end: nothing to run back from (${rush}, ${t})`)
})

test('pathLen is the length of a polyline', () => {
  assert.equal(pathLen([[0, 0], [0, 4], [3, 4]]), 7)
  assert.equal(pathLen([[1, 1]]), 0)
  assert.equal(pathLen([[0, 0], [3, 4]]), 5)
})

// ---- stepBreak: the trip bookkeeping of one worker ----
const PATH = [[0, 0], [0, 16]] // a route of 16 units: 10 s out at the walk speed
const OUT = 16 / WALK
const world = () => ({ trips: new Map(), claimed: new Map() })
const step = (w, t, over = {}, id = 'a') => stepBreak(w.trips, w.claimed, id, { idle: true, seed: 7, spots: { kitchen: 3 }, route: () => PATH, ...over }, t)
const ALL = { kitchen: 3, lunch: 4, party: 5 } // the spot counts of the three kinds: counter spots, chairs, dance spots
const KINDS = ['kitchen', 'lunch', 'party']
const kindOf = (seed, n, kinds = KINDS) => kinds[Math.floor(breakPlan(seed, n).pick * kinds.length)] // the kind that the plan picks first
const seedFor = (kind, kinds = KINDS) => { let s = 0; while (kindOf(s, 0, kinds) !== kind) assert.ok(++s < 100, `no seed for ${kind}`); return s } // the first seed whose first trip picks this kind

test('stepBreak: a worker waits, claims a spot, walks, stays, walks back and frees the spot', () => {
  const w = world()
  assert.equal(step(w, 0), null, 'the first call starts the wait at the desk')
  const wait = breakPlan(7, 0).wait, stay = breakPlan(7, 0).stay
  assert.equal(w.trips.get('a').next, wait)
  assert.equal(step(w, wait - 0.01), null)
  assert.equal(w.claimed.size, 0, 'no claim before the trip')
  const out = step(w, wait)
  assert.equal(out.phase, 'out')
  assert.equal(out.got, false)
  assert.deepEqual([...w.claimed], [['kitchen:1', 'a']], 'the claim starts at (seed + 0) % spots')
  assert.deepEqual([out.trip.kind, out.trip.spot], ['kitchen', 'kitchen:1'])
  assert.equal(step(w, wait + OUT / 2).phase, 'out')
  const at = step(w, wait + OUT + stay / 2)
  assert.deepEqual([at.phase, at.got, at.s], ['stay', true, 16])
  assert.equal(step(w, wait + OUT + stay + 1).got, true, 'the mug stays in the hand on the way back')
  const t = wait + 2 * OUT + stay
  assert.equal(step(w, t), null, 'back at the desk')
  assert.equal(w.claimed.size, 0, 'the spot is free again')
  assert.deepEqual([w.trips.get('a').n, w.trips.get('a').next, w.trips.get('a').trip], [1, t + breakPlan(7, 1).wait, null])
})

test('stepBreak: a second worker takes the next free spot', () => {
  const w = world()
  step(w, 0); step(w, 0, {}, 'b')
  const t = Math.max(w.trips.get('a').next, w.trips.get('b').next)
  step(w, t); step(w, t, {}, 'b')
  assert.deepEqual([...w.claimed].sort(), [['kitchen:1', 'a'], ['kitchen:2', 'b']])
})

test('stepBreak: with no free spot of any kind the worker keeps browsing and tries later with the next plan', () => {
  const w = world(), over = { spots: ALL }
  for (const [room, n] of Object.entries(ALL)) for (let i = 0; i < n; i++) w.claimed.set(`${room}:${i}`, `x${i}`)
  step(w, 0, over)
  const wait = breakPlan(7, 0).wait
  assert.equal(step(w, wait, over), null)
  assert.equal(w.trips.get('a').trip, null)
  assert.equal(w.trips.get('a').n, 1)
  const next = wait + breakPlan(7, 1).wait
  assert.equal(w.trips.get('a').next, next)
  assert.equal(w.claimed.size, 12, 'it took no spot')
  w.claimed.delete('kitchen:0')
  assert.equal(step(w, next - 0.01, over), null, 'not before the next try')
  assert.equal(step(w, next, over).phase, 'out')
  assert.deepEqual([...w.claimed].find(([, id]) => id === 'a'), ['kitchen:0', 'a'], 'it takes the one free spot')
  const stay = breakPlan(7, 1).stay
  assert.equal(step(w, next + OUT + 0.1, over).phase, 'stay')
  assert.equal(step(w, next + OUT + stay - 0.1, over).phase, 'stay', 'the stay comes from plan 1')
  assert.equal(step(w, next + OUT + stay + 0.1, over).phase, 'back')
})

test('stepBreak: a party pick sends the worker to a dance spot with no mug, and the end of the trip frees the spot', () => {
  const w = world(), seed = seedFor('party'), seen = [], over = { seed, spots: ALL, route: (room, i) => (seen.push([room, i]), PATH) }
  step(w, 0, over)
  const t = w.trips.get('a').next, out = step(w, t, over), key = `party:${seed % 5}`
  assert.deepEqual([out.trip.kind, out.trip.spot, seen], ['party', key, [['party', seed % 5]]], 'the claim starts at (seed + 0) % spots')
  assert.deepEqual([...w.claimed], [[key, 'a']])
  const stay = breakPlan(seed, 0).stay, at = step(w, t + OUT + stay / 2, over)
  assert.deepEqual([at.phase, at.got], ['stay', false], 'a dancer gets no mug')
  assert.equal(step(w, t + OUT + stay + 1, over).got, false)
  assert.equal(step(w, t + 2 * OUT + stay, over), null, 'back at the desk')
  assert.equal(w.claimed.size, 0, 'the dance spot is free again')
})

test('stepBreak: a lunch pick sends the worker to a chair for the lunch stay, with no mug, and the end of the trip frees the chair', () => {
  const w = world(), seed = seedFor('lunch'), seen = [], over = { seed, spots: ALL, route: (room, i) => (seen.push([room, i]), PATH) }
  step(w, 0, over)
  const t = w.trips.get('a').next, out = step(w, t, over), key = `lunch:${seed % 4}`, { stay, lunch } = breakPlan(seed, 0)
  assert.deepEqual([out.trip.kind, out.trip.spot, seen], ['lunch', key, [['lunch', seed % 4]]], 'the claim starts at (seed + 0) % chairs')
  assert.deepEqual([...w.claimed], [[key, 'a']])
  assert.equal(out.trip.stay, lunch)
  assert.ok(lunch > stay)
  assert.deepEqual([step(w, t + OUT + stay + 0.1, over).phase, step(w, t + OUT + lunch - 0.1, over).phase], ['stay', 'stay'], 'the stay is the lunch')
  assert.equal(step(w, t + OUT + lunch / 2, over).got, false, 'a lunch gets no mug')
  assert.deepEqual([step(w, t + OUT + lunch + 0.1, over).phase, step(w, t + OUT + lunch + 0.1, over).got], ['back', false])
  assert.equal(step(w, t + 2 * OUT + lunch, over), null, 'back at the desk')
  assert.equal(w.claimed.size, 0, 'the chair is free again')
})

test('stepBreak: a kitchen pick sends the worker to the counter, also with chairs and a party room', () => {
  const w = world(), seed = seedFor('kitchen'), over = { seed, spots: ALL }
  step(w, 0, over)
  const r = step(w, w.trips.get('a').next, over)
  assert.deepEqual([r.trip.kind, [...w.claimed]], ['kitchen', [[`kitchen:${seed % 3}`, 'a']]])
})

test('stepBreak: a full kind sends the worker to the next kind in the order kitchen, lunch, party', () => {
  for (const [first, full, next] of [['kitchen', ['kitchen'], 'lunch'], ['lunch', ['lunch'], 'kitchen'], ['party', ['party'], 'kitchen'], ['party', ['party', 'kitchen'], 'lunch'], ['kitchen', ['kitchen', 'lunch'], 'party']]) {
    const w = world(), seed = seedFor(first), over = { seed, spots: ALL }
    for (const kind of full) for (let i = 0; i < ALL[kind]; i++) w.claimed.set(`${kind}:${i}`, `x${i}`)
    step(w, 0, over)
    const r = step(w, w.trips.get('a').next, over)
    assert.equal(r.trip.kind, next, `the pick ${first}, ${full} full`)
    assert.equal(w.claimed.get(`${next}:${seed % ALL[next]}`), 'a')
  }
})

test('stepBreak: a kind with no spots is never picked', () => {
  for (const [spots, kinds] of [[{ kitchen: 3, lunch: 4, party: 0 }, ['kitchen', 'lunch']], [{ kitchen: 3, lunch: 4 }, ['kitchen', 'lunch']], [{ kitchen: 3 }, ['kitchen']], [{ kitchen: 3, lunch: 0, party: 5 }, ['kitchen', 'party']]]) {
    const seen = new Set()
    for (let seed = 0; seed < 40; seed++) {
      const w = world(), over = { seed, spots }
      step(w, 0, over)
      const r = step(w, w.trips.get('a').next, over)
      assert.equal(r.trip.kind, kindOf(seed, 0, kinds), `${JSON.stringify(spots)} seed ${seed}`)
      seen.add(r.trip.kind)
    }
    assert.deepEqual([...seen].sort(), kinds, JSON.stringify(spots))
  }
})

test('stepBreak: a rush starts once and keeps its start time', () => {
  const w = world()
  step(w, 0)
  const start = w.trips.get('a').next, rush = start + 5, away = 5 * WALK
  step(w, start)
  const r = step(w, rush, { idle: false })
  assert.equal(w.trips.get('a').trip.rush, rush)
  assert.deepEqual([r.phase, r.trip.rush], ['rush', rush])
  close(r.s, away, 'runs back from where it was')
  close(step(w, rush + 1, { idle: false }).s, away - RUN, 'one s later')
  const again = step(w, rush + 1, { idle: true })
  assert.equal(again.phase, 'rush', 'idle again does not stop the run')
  assert.equal(again.trip.rush, rush, 'the start time stays')
  close(again.s, away - RUN, 'the same place')
})

test('stepBreak: after a rush the state starts fresh, also when the status is idle again', () => {
  for (const idleAgain of [true, false]) {
    const w = world()
    step(w, 0)
    const start = w.trips.get('a').next, rush = start + 5, home = rush + 5 * WALK / RUN
    step(w, start); step(w, rush, { idle: false })
    assert.equal(step(w, home - 0.1, { idle: idleAgain }).phase, 'rush')
    assert.equal(step(w, home + 0.1, { idle: idleAgain }), null, 'the worker sits')
    assert.equal(w.claimed.size, 0, 'the spot is free')
    assert.equal(w.trips.has('a'), false, 'the state is gone')
    const t = home + 1
    assert.equal(step(w, t), null)
    assert.deepEqual([w.trips.get('a').n, w.trips.get('a').next], [0, t + breakPlan(7, 0).wait], 'the next idle frame starts n at 0')
  }
})

test('stepBreak: a status that is not idle drops the state when there is no trip', () => {
  const w = world()
  assert.equal(step(w, 0, { idle: false }), null)
  assert.equal(w.trips.has('a'), false, 'no state for a worker that is not idle')
  step(w, 0)
  assert.equal(w.trips.has('a'), true)
  assert.equal(step(w, 1, { idle: false }), null)
  assert.equal(w.trips.has('a'), false)
  assert.equal(w.claimed.size, 0)
})

test('stepBreak: the length of a trip comes from the route of the spot', () => {
  const w = world()
  step(w, 0)
  const t = w.trips.get('a').next, seen = []
  const r = step(w, t, { route: (room, i) => (seen.push([room, i]), PATH) })
  assert.deepEqual(seen, [['kitchen', 1]])
  assert.equal(r.trip.len, pathLen(PATH))
  assert.equal(r.trip.path, PATH)
})

test('endBreak frees the spot and drops the state', () => {
  for (const room of KINDS) {
    const w = world(), over = { seed: seedFor(room), spots: ALL }
    step(w, 0, over); step(w, w.trips.get('a').next, over)
    assert.deepEqual([...w.claimed.keys()].map(k => k.split(':')[0]), [room])
    endBreak(w.trips, w.claimed, 'a')
    assert.deepEqual([w.claimed.size, w.trips.size], [0, 0], room)
    endBreak(w.trips, w.claimed, 'a') // a desk without a state is fine
  }
})

test('breakPlan is deterministic and stays in range', () => {
  const firsts = new Set()
  for (let seed = 0; seed < 200; seed++) {
    for (let n = 0; n < 6; n++) {
      const p = breakPlan(seed * 4999 + 17, n)
      assert.deepEqual(p, breakPlan(seed * 4999 + 17, n))
      const [lo, hi] = n ? [20, 60] : [5, 30]
      assert.ok(p.wait >= lo && p.wait <= hi, `seed ${seed} n ${n}: wait ${p.wait}`)
      assert.ok(p.stay >= 6 && p.stay <= 15, `seed ${seed} n ${n}: stay ${p.stay}`)
      assert.ok(p.lunch >= 20 && p.lunch <= 40, `seed ${seed} n ${n}: lunch ${p.lunch}`)
      assert.ok(p.pick >= 0 && p.pick < 1, `seed ${seed} n ${n}: pick ${p.pick}`)
      assert.ok(p.game >= 0 && p.game < 1, `seed ${seed} n ${n}: game ${p.game}`)
      assert.ok(p.chat >= 10 && p.chat <= 25, `seed ${seed} n ${n}: chat ${p.chat}`)
      assert.deepEqual(Object.keys(p), ['wait', 'stay', 'lunch', 'pick', 'game', 'chat'])
      if (!n) firsts.add(p.wait.toFixed(3))
    }
  }
  assert.ok(firsts.size > 150, 'the seeds spread the first trips')
  assert.notDeepEqual(breakPlan(5, 1), breakPlan(5, 2), 'each trip has its own plan')
})

test('breakPlan: the chat value keeps the other values', () => {
  const { chat, ...rest } = breakPlan(7, 0)
  assert.deepEqual(rest, { wait: 12.767192198662087, stay: 8.823785769520327, lunch: 26.875684433616698, pick: 0.6198440259322524, game: 0.5614819778129458 })
})

test('breakPlan: a pick for each trip gives each of 3 kinds about a third, with the same wait and stay as before the pick', () => {
  // The plan before the party room. INTENT.md decision 19 holds its numbers, so the pick must not move them.
  const before = (seed, n) => {
    const u = (i) => { let h = Math.imul((seed ^ Math.imul(n + 1, 0x9e3779b1)) + i * 0x85ebca6b, 0xc2b2ae35); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); return ((h ^ (h >>> 13)) >>> 0) / 4294967296 }
    const [lo, hi] = n ? [20, 60] : [5, 30]
    return { wait: lo + u(0) * (hi - lo), stay: 6 + u(1) * 9 }
  }
  const seeds = Array.from({ length: 1000 }, (_, i) => (i * 1000003 + 11) % 1e9) // like hash(terminalId, 1e9)
  const picks = seeds.map(seed => Array.from({ length: 10 }, (_, n) => {
    const p = breakPlan(seed, n)
    assert.deepEqual({ wait: p.wait, stay: p.stay }, before(seed, n), `seed ${seed} n ${n}`)
    return kindOf(seed, n)
  }))
  for (let n = 0; n < 10; n++) for (const kind of KINDS) {
    const k = picks.filter(c => c[n] === kind).length
    assert.ok(k >= 270 && k <= 400, `trip ${n}: ${k} of 1000 picks are ${kind}`)
  }
  assert.ok(picks.filter(c => new Set(c).size < 3).length < 100, 'most workers get each kind in 10 trips')
})

// ---- stepBreak: the game tables. Two free workers pair up at a table. ----
// The first call of stepBreak() for a worker only sets its first wait (5 to 30 s), so each test primes the workers at t = 0 and starts
// the trips at 100 or later.
const KINDS4 = [...KINDS, 'game']
const GAME = { tables: ['chess'] }
const arrive = (trip) => trip.start + trip.len / WALK
const gstep = (w, t, id, over = {}) => stepBreak(w.trips, w.claimed, id, { idle: true, seed: seedFor('game', KINDS4), spots: {}, route: () => PATH, ...GAME, ...over }, t)
const kstep = (w, t, id, over = {}) => gstep(w, t, id, { seed: seedFor('kitchen', KINDS4), spots: { kitchen: 3 }, ...over }) // a worker whose pick is the counter
// a waits at the chess table, and b joins it 5 s into the wait of a. Both arrive, then the game runs.
const pair = () => {
  const w = world()
  gstep(w, 0, 'a'); kstep(w, 0, 'b')
  const a = gstep(w, 100, 'a'), b = kstep(w, arrive(a.trip) + 5, 'b')
  return { w, a: a.trip, b: b.trip }
}

const KC = ['kitchen', 'chat'], CHAT = { kitchen: 3, chat: 2 }
const cstep = (w, t, id, over = {}) => stepBreak(w.trips, w.claimed, id, { idle: true, seed: seedFor('chat', KC), spots: CHAT, route: () => PATH, ...over }, t) // first pick: chat
const jstep = (w, t, id, over = {}) => cstep(w, t, id, { seed: seedFor('kitchen', KC), ...over }) // first pick: the counter
// a waits at the cooler, and b joins it 5 s into the wait of a.
const cpair = () => {
  const w = world()
  cstep(w, 0, 'a'); jstep(w, 0, 'b')
  const a = cstep(w, 100, 'a'), b = jstep(w, arrive(a.trip) + 5, 'b')
  return { w, a: a.trip, b: b.trip }
}

test('stepBreak: a chat waiter goes to a free chat spot and walks back after 20 s alone', () => {
  const w = world()
  assert.equal(cstep(w, 0, 'a'), null)
  const a = cstep(w, 100, 'a')
  assert.equal(a.trip.kind, 'chat'); assert.match(a.trip.spot, /^chat:[01]$/); assert.equal(a.play, false)
  assert.deepEqual([a.trip.partner, a.trip.begin, a.trip.end], [null, null, null])
  assert.deepEqual([...w.claimed], [[a.trip.spot, 'a']])
  const end = arrive(a.trip) + WAIT
  assert.deepEqual([cstep(w, end - 0.1, 'a').phase, cstep(w, end - 0.1, 'a').play], ['stay', false])
  assert.equal(cstep(w, end + 0.1, 'a').phase, 'back')
  assert.equal(cstep(w, end + OUT + 0.1, 'a'), null)
  assert.equal(w.claimed.size, 0)
})

test('stepBreak: a new trip joins a chat waiter, whatever its pick, and both end at the same time', () => {
  const { w, a, b } = cpair()
  assert.equal(b.kind, 'chat'); assert.notEqual(b.spot, a.spot)
  assert.deepEqual([...w.claimed.keys()].sort(), ['chat:0', 'chat:1'])
  assert.equal(a.partner, 'b'); assert.equal(b.partner, 'a')
  assert.equal(a.begin, Math.max(arrive(a), arrive(b))); assert.equal(a.end, b.end)
  close(a.end - a.begin, breakPlan(seedFor('chat', KC), 0).chat, 'the chat time comes from the plan of the waiter')
  close(arrive(a) + a.stay, a.end, 'the stay of a ends at the chat end')
  close(arrive(b) + b.stay, b.end, 'the stay of b ends at the chat end')
  assert.equal(cstep(w, a.begin - 0.1, 'a').play, false); assert.equal(cstep(w, a.begin + 0.1, 'a').play, true)
})

test('stepBreak: a rush of one talker ends the chat of the other, and endBreak() does too', () => {
  { // b rushes during the chat
    const { w, a } = cpair(), tr = a.begin + 5
    assert.equal(jstep(w, tr, 'b', { idle: false }).phase, 'rush')
    assert.equal(a.end, tr, 'the chat of a ends at the rush')
    const r = cstep(w, tr + 0.1, 'a')
    assert.deepEqual([r.phase, r.play], ['back', false], 'a walks back, it does not run')
  }
  { // b leaves the breaks during the chat
    const { w, a } = cpair(), te = a.begin + 5
    endBreak(w.trips, w.claimed, 'b', te)
    assert.deepEqual([...w.claimed.values()], ['a'], 'only the spot of b is free')
    assert.equal(a.end, te)
  }
})

test('stepBreak: a third worker takes another kind while the chat spots are taken or a lone waiter walks back', () => {
  { // both spots taken
    const { w, a } = cpair()
    cstep(w, 0, 'c')
    const c = cstep(w, a.begin + 1, 'c')
    assert.equal(c.trip.kind, 'kitchen', 'c picks chat, finds it full, and takes the next free kind')
    assert.equal(a.partner, 'b')
  }
  { // a lone waiter walks back after its 20 s. Its spot stays claimed, and nobody takes the other spot.
    const w = world()
    cstep(w, 0, 'a'); cstep(w, 0, 'c')
    const a = cstep(w, 100, 'a').trip, t = arrive(a) + WAIT + 0.1
    assert.equal(cstep(w, t, 'a').phase, 'back')
    assert.equal(cstep(w, t, 'c').trip.kind, 'kitchen')
    assert.equal(a.partner, null)
  }
})

test('stepBreak: with 5 kinds each kind gets about a fifth, and with 3 kinds about a third', () => {
  const tally = (spots, tables) => {
    const n = {}
    for (let seed = 0; seed < 400; seed++) {
      const w = world(), over = { seed: seed * 7919, spots, tables }
      step(w, 0, over)
      const room = step(w, w.trips.get('a').next, over).trip.kind
      n[room] = (n[room] ?? 0) + 1
    }
    return n
  }
  const five = tally({ ...ALL, chat: 2 }, ['chess', 'pingpong']), three = tally({ kitchen: 3, lunch: 4, chat: 2 }, [])
  for (const kind of [...KINDS4, 'chat']) assert.ok(five[kind] >= 56 && five[kind] <= 104, `${five[kind]} of 400 picks are ${kind}`)
  for (const kind of ['kitchen', 'lunch', 'chat']) assert.ok(three[kind] >= 100 && three[kind] <= 170, `${three[kind]} of 400 picks are ${kind}`)
})

test('stepBreak: a waiter goes to a free game place and walks back after 20 s alone', () => {
  const w = world()
  assert.equal(gstep(w, 0, 'a'), null)
  const a = gstep(w, 100, 'a')
  assert.equal(a.trip.kind, 'game'); assert.match(a.trip.spot, /^game:[01]$/); assert.equal(a.play, false)
  assert.deepEqual([a.trip.table, a.trip.partner, a.trip.begin, a.trip.end], [0, null, null, null])
  assert.deepEqual([...w.claimed], [[a.trip.spot, 'a']], 'the place is claimed when the trip starts')
  const end = arrive(a.trip) + WAIT
  assert.equal(gstep(w, end - 0.1, 'a').phase, 'stay')
  assert.equal(gstep(w, end - 0.1, 'a').play, false, 'a waiter does not play')
  assert.equal(gstep(w, end + 0.1, 'a').phase, 'back')
  assert.equal(gstep(w, end + OUT + 0.1, 'a'), null)
  assert.equal(w.claimed.size, 0, 'the place is free when the trip ends')
})

test('stepBreak: a new trip joins a waiter, whatever its pick, and both end at the same time', () => {
  const w = world()
  gstep(w, 0, 'a'); kstep(w, 0, 'b') // both wait for their first trip
  const a = gstep(w, 100, 'a')
  const tj = arrive(a.trip) + 5 // b starts its trip 5 s into the wait of a
  const b = kstep(w, tj, 'b')
  assert.equal(b.trip.kind, 'game'); assert.equal(b.trip.table, a.trip.table); assert.notEqual(b.trip.spot, a.trip.spot)
  assert.deepEqual([...w.claimed.keys()].sort(), ['game:0', 'game:1'])
  assert.equal(a.trip.partner, 'b'); assert.equal(b.trip.partner, 'a')
  assert.equal(a.trip.begin, Math.max(arrive(a.trip), arrive(b.trip))); assert.equal(a.trip.end, b.trip.end)
  assert.ok(a.trip.end - a.trip.begin >= 30 && a.trip.end - a.trip.begin <= 60, 'a chess game lasts 30 to 60 s')
  close(a.trip.end - a.trip.begin, 30 + 30 * breakPlan(seedFor('game', KINDS4), 0).game, 'the game time comes from the plan of the waiter')
  close(arrive(a.trip) + a.trip.stay, a.trip.end, 'the stay of a ends at the game end')
  close(arrive(b.trip) + b.trip.stay, b.trip.end, 'the stay of b ends at the game end')
  assert.equal(gstep(w, a.trip.begin - 0.1, 'a').play, false) // a waits for b
  assert.equal(gstep(w, a.trip.begin + 0.1, 'a').play, true)
})

test('stepBreak: a game gives play only between its begin and its end', () => {
  const { w, a, b } = pair(), id = (trip) => (trip === a ? 'a' : 'b'), st = (trip, t) => (trip === a ? gstep(w, t, 'a') : kstep(w, t, 'b'))
  assert.deepEqual([st(b, a.begin - 1).phase, st(b, a.begin - 1).play], ['out', false], 'b is on the way')
  assert.deepEqual([st(a, a.begin - 1).phase, st(a, a.begin - 1).play], ['stay', false], 'a waits for b')
  for (const trip of [a, b]) {
    assert.deepEqual([st(trip, a.begin + 0.1).phase, st(trip, a.begin + 0.1).play], ['stay', true], `${id(trip)} plays`)
    assert.equal(st(trip, a.end - 0.1).play, true)
    assert.deepEqual([st(trip, a.end + 0.1).phase, st(trip, a.end + 0.1).play], ['back', false], `${id(trip)} walks back`)
  }
  assert.equal(st(a, a.end + OUT + 0.1), null); assert.equal(st(b, a.end + OUT + 0.1), null)
  assert.equal(w.claimed.size, 0, 'both places are free')
})

test('stepBreak: a rush of one player ends the game of the other, who walks back', () => {
  const { w, a, b } = pair(), tr = a.begin + 5
  assert.equal(kstep(w, tr, 'b', { idle: false }).phase, 'rush')
  assert.equal(a.end, tr, 'the game of a ends at the rush')
  close(arrive(a) + a.stay, tr, 'the stay of a ends at the rush')
  const r = gstep(w, tr + 0.1, 'a')
  assert.deepEqual([r.phase, r.play], ['back', false], 'a walks back, it does not run')
  assert.equal(gstep(w, tr + OUT + 0.2, 'a'), null)
  assert.equal(b.partner, 'a')
})

test('stepBreak: a partner that rushes on the way out sends the waiter back at once, and the waiter does not wait again', () => {
  const { w, a, b } = pair(), tr = b.start + 2 // b is still on the way out
  kstep(w, tr, 'b', { idle: false })
  close(arrive(a) + a.stay, tr, 'the stay of a ends now')
  assert.equal(gstep(w, tr + 0.1, 'a').phase, 'back')
  kstep(w, 0, 'c')
  const c = kstep(w, tr + 0.2, 'c')
  assert.equal(c.trip.kind, 'kitchen', 'c does not join a')
  assert.equal(a.partner, 'b')
})

test('stepBreak: the end of the trip of a player (endBreak) ends the game of the other', () => {
  const { w, a } = pair(), te = a.begin + 5
  endBreak(w.trips, w.claimed, 'b', te)
  assert.deepEqual([...w.claimed.values()], ['a'], 'the place of b is free')
  assert.equal(a.end, te)
  close(arrive(a) + a.stay, te, 'the stay of a ends now')
  assert.equal(gstep(w, te + 0.1, 'a').phase, 'back')
})

test('stepBreak: after the game end, a rush or endBreak() of one player does not move the other player', () => {
  const at = (r) => [r.phase, r.s]
  { // b rushes 3 s after the end, while both walk back
    const { w, a } = pair(), t = a.end + 3, before = at(gstep(w, t, 'a')), end = a.end
    kstep(w, t, 'b', { idle: false })
    assert.deepEqual(at(gstep(w, t, 'a')), before, 'a keeps its way back')
    assert.equal(a.end, end, 'the game end stays')
  }
  { // b leaves the breaks 3 s after the end
    const { w, a } = pair(), t = a.end + 3, before = at(gstep(w, t, 'a')), end = a.end
    endBreak(w.trips, w.claimed, 'b', t)
    assert.deepEqual(at(gstep(w, t, 'a')), before, 'a keeps its way back')
    assert.equal(a.end, end, 'the game end stays')
  }
  { // a rushes 3 s after the end, then b rushes 1 s later
    const { w, a } = pair(), t = a.end + 3
    gstep(w, t, 'a', { idle: false })
    const before = at(gstep(w, t + 1, 'a', { idle: false }))
    kstep(w, t + 1, 'b', { idle: false })
    assert.deepEqual(at(gstep(w, t + 1, 'a', { idle: false })), before, 'a keeps its run back')
    assert.equal(before[0], 'rush')
  }
})

test('stepBreak: with two waiters, each new trip joins one of them, and a third new trip finds both tables full', () => {
  const two = { tables: ['chess', 'pingpong'] }, w = world()
  // Two waiters at once: a second waiter only comes from another frame of the world (a new trip always joins a waiter). So b starts its
  // trip in a world of its own, at the table that a does not take.
  const sa = seedFor('game', KINDS4), sb = [...Array(100).keys()].find((s) => kindOf(s, 0, KINDS4) === 'game' && (s % 4) >> 1 !== (sa % 4) >> 1)
  gstep(w, 0, 'a', two)
  const a = gstep(w, 100, 'a', two).trip, v = world()
  gstep(v, 0, 'b', { ...two, seed: sb })
  const b = gstep(v, 100, 'b', { ...two, seed: sb }).trip
  w.trips.set('b', v.trips.get('b')); w.claimed.set(b.spot, 'b')
  assert.notEqual(a.table, b.table)
  for (const id of ['c', 'd', 'e']) kstep(w, 0, id, two)
  const c = kstep(w, 105, 'c', two).trip
  assert.deepEqual([c.kind, c.table, c.partner, a.partner, b.partner], ['game', 0, 0 === a.table ? 'a' : 'b', 0 === a.table ? 'c' : null, 0 === b.table ? 'c' : null], 'c joins the waiter of table 0, and only that waiter')
  const d = kstep(w, 106, 'd', two).trip, e = kstep(w, 107, 'e', two).trip
  assert.deepEqual([d.kind, d.table, d.partner], ['game', 1, 1 === a.table ? 'a' : 'b'], 'd joins the other waiter')
  assert.equal(e.kind, 'kitchen', 'e finds no free table and no waiter')
  assert.equal(w.claimed.size, 5)
})

test('stepBreak: a trip that starts after the 20 s wait of a waiter does not join it', () => {
  const w = world()
  gstep(w, 0, 'a'); kstep(w, 0, 'b')
  const a = gstep(w, 100, 'a').trip, b = kstep(w, arrive(a) + WAIT + 0.1, 'b').trip
  assert.equal(b.kind, 'kitchen', 'b makes its own pick')
  assert.equal(a.partner, null)
})

test('stepBreak: with no game tables the pick never gives a game, and with 4 kinds each kind gets about a quarter', () => {
  for (const tables of [undefined, []]) for (let seed = 0; seed < 40; seed++) {
    const w = world(), over = { seed, spots: ALL, tables }
    step(w, 0, over)
    assert.equal(step(w, w.trips.get('a').next, over).trip.kind, kindOf(seed, 0), `tables ${tables} seed ${seed}`)
  }
  const n = {}
  for (let seed = 0; seed < 400; seed++) {
    const w = world(), over = { seed: seed * 7919, spots: ALL, tables: ['chess', 'pingpong'] }
    step(w, 0, over)
    const room = step(w, w.trips.get('a').next, over).trip.kind
    n[room] = (n[room] ?? 0) + 1
  }
  for (const kind of KINDS4) assert.ok(n[kind] >= 70 && n[kind] <= 130, `${n[kind]} of 400 picks are ${kind}`)
})

// ---- idleBreaks(): the breaks of a whole office, through use(), step(), and now() ----
// The demo office has a ping-pong table and a chess table in its party room. WORKERS: its agent desks in workspace rooms, with no away.
const O = buildOffice(demoSnapshot(0), demoMeetings(0))
const ROOM = (o, id) => o.rooms.find((r) => r.id === id)
const WORKERS = O.desks.filter((d) => d.agent && !d.away && ROOM(O, d.roomId).kind === 'workspace')
const KINDS5 = ['kitchen', 'lunch', 'party', 'game', 'chat']
// A fresh idleBreaks() on o, with desk deskId as an idle worker of the terminal id term. It steps the desk every 0.5 s from 0 until
// its first trip starts, and returns the breaks, the desk, that time, and the first result.
const start = (o, deskId, term) => {
  const b = idleBreaks(), d = { ...o.desks.find((d) => d.id === deskId), terminalId: term, status: 'idle' }
  b.use(o, 0)
  for (let t = 0; t < 60; t += 0.5) { const r = b.step(d, t); if (r) return { b, d, t, r } }
  assert.fail(`${deskId} ${term}: no trip in 60 s`)
}
const firstTrip = (o, deskId, term) => start(o, deskId, term).r
// The first terminal id from t<from> to t199 whose first trip has this kind.
const termFor = (o, deskId, kind, from = 0) => {
  for (let i = from; i < 200; i++) if (firstTrip(o, deskId, `t${i}`).kind === kind) return `t${i}`
  assert.fail(`no terminal id for ${kind}`)
}
// Steps desk d from the time t every dt s until ok(result). Returns that time and result, and every result on the way.
const until = (b, d, t, ok, dt = 0.1) => {
  for (const seen = []; t < 1000; t += dt) { const r = b.step(d, t); seen.push(r); if (ok(r)) return { t, r, seen } }
  assert.fail(`${d.id}: never`)
}
const near = (p, q) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-6
// Each spot of each kind, with the id of its room.
const spotsOf = (o) => {
  const k = ROOM(o, 'kitchen'), p = ROOM(o, 'party')
  return {
    kitchen: k.spots.map((s) => [s, 'kitchen']), lunch: k.chairs.map((s) => [s, 'kitchen']), party: p.spots.map((s) => [s, 'party']),
    game: o.games.flatMap((g) => g.places.map((s) => [s, g.room])), chat: k.chat.map((s) => [s, 'kitchen']),
  }
}

test('idleBreaks: each kind ends at its spot in its room', () => {
  const d = WORKERS[0], spots = spotsOf(O)
  for (const kind of KINDS5) {
    const s = start(O, d.id, termFor(O, d.id, kind)), { r } = until(s.b, s.d, s.t, (r) => r?.phase === 'stay')
    const hit = spots[kind].find(([p]) => near(p, r))
    assert.equal(r.kind, kind)
    assert.ok(hit, `${kind}: the stay at (${r.x}, ${r.z}) is no ${kind} spot`)
    assert.equal(r.room, hit[1], `${kind}: the room`)
    assert.deepEqual(r.seat, ['lunch', 'game', 'chat'].includes(kind) ? hit[0] : null, `${kind}: the seat`)
  }
})

// A walker to a game table in its own room opens no door: the opens() test of the game places covers it.
test('idleBreaks: a walker opens its own door and the door of its target room', () => {
  const d = WORKERS[0]
  for (const kind of KINDS5) {
    const s = start(O, d.id, termFor(O, d.id, kind)), { r, seen } = until(s.b, s.d, s.t, (r) => r?.phase === 'stay')
    const ids = new Set(seen.filter((x) => x.phase === 'out').flatMap((x) => x.doors))
    assert.deepEqual([...ids].sort(), [d.roomId, r.room].sort(), `${kind}: the doors on the way out`)
  }
})

test('idleBreaks: side and table come from the spot', () => {
  const d = WORKERS[0], places = O.games.flatMap((g) => g.places), chat = ROOM(O, 'kitchen').chat, got = new Set()
  for (let n = 0; n < 200; n++) {
    const s = start(O, d.id, `t${n}`)
    if (s.r.kind !== 'game' && s.r.kind !== 'chat') { assert.deepEqual([s.r.side, s.r.table], [null, null], `t${n}: ${s.r.kind}`); continue }
    const { r } = until(s.b, s.d, s.t, (r) => r?.phase === 'stay'), i = (r.kind === 'game' ? places : chat).findIndex((p) => near(p, r))
    assert.deepEqual([r.side, r.table], r.kind === 'game' ? [i & 1, i >> 1] : [i, null], `t${n}: ${r.kind} place ${i}`)
    got.add(`${r.kind}:${i}`)
  }
  assert.deepEqual([...got].sort(), ['chat:0', 'chat:1', 'game:0', 'game:1', 'game:2', 'game:3'])
})

test('idleBreaks: the seed comes from the terminal id, else the desk id', () => {
  const d = WORKERS[0]
  for (const [desk, key] of [[{ ...d, terminalId: 't5' }, 't5'], [{ ...d, terminalId: undefined }, d.id]]) {
    const b = idleBreaks(), w = { ...desk, status: 'idle' }, wait = breakPlan(hash(key, 1e9), 0).wait
    b.use(O, 0)
    assert.equal(b.step(w, 0), null, `${key}: at 0`)
    assert.equal(b.step(w, wait - 0.01), null, `${key}: just before the wait`)
    assert.notEqual(b.step(w, wait), null, `${key}: at the wait ${wait}`)
  }
})

// A subagent view has the desk { status: 'working' } with no id. A working desk that turns idle at 100 waits its first wait from 100.
test('idleBreaks: a desk that is not idle, or a subagent desk with no id, gets null and no state', () => {
  const b = idleBreaks(), d = { ...WORKERS[0], status: 'working' }, wait = breakPlan(hash(d.terminalId, 1e9), 0).wait
  b.use(O, 0)
  for (let t = 0; t <= 100; t++) {
    assert.equal(b.step({ status: 'working' }, t), null, `the subagent desk at ${t}`)
    assert.equal(b.step(d, t), null, `the working desk at ${t}`)
  }
  assert.deepEqual(b.now(100), { games: [], stays: [] })
  const w = { ...d, status: 'idle' }
  assert.equal(b.step(w, 100), null)
  assert.equal(b.step(w, 100 + wait - 0.01), null, 'the wait starts at 100')
  assert.notEqual(b.step(w, 100 + wait), null)
})

// Two workers whose first pick is a game: a waits at a table, and c starts its trip 1 s after a arrives, so it joins a.
// Returns the breaks, both desks, the terminal id of a (the waiter), and go: the first time on the 0.1 s grid when c plays.
const gamePair = () => {
  const ta = termFor(O, WORKERS[0].id, 'game'), tc = termFor(O, WORKERS[1].id, 'game', +ta.slice(1) + 1)
  const s = start(O, WORKERS[0].id, ta), c = { ...WORKERS[1], terminalId: tc, status: 'idle' }
  const arr = until(s.b, s.d, s.t, (r) => r?.phase === 'stay').t
  s.b.step(c, arr - breakPlan(hash(tc, 1e9), 0).wait + 1) // the first wait of c ends 1 s after a arrives
  return { b: s.b, a: s.d, c, ta, go: until(s.b, c, arr + 1, (r) => r?.play).t }
}

test('idleBreaks: now() lists a game only while both play, and a stay kind only in the stay', () => {
  const d = WORKERS[0], s = start(O, d.id, termFor(O, d.id, 'game')) // a lone worker
  assert.deepEqual(s.b.now(s.t), { games: [], stays: [] }, 'on the way out')
  const { t } = until(s.b, s.d, s.t, (r) => r?.phase === 'stay')
  assert.deepEqual(s.b.now(t), { games: [], stays: ['game'] }, 'a waiter alone')
  assert.equal(s.b.step({ ...s.d, status: 'working' }, t + 0.1).phase, 'rush')
  assert.deepEqual(s.b.now(t + 0.1), { games: [], stays: [] }, 'in a rush')
  // A pair: the game lasts the game time of the waiter from begin, the arrival of c.
  const { b, a, c, ta, go } = gamePair(), r = b.step(c, go), table = r.table
  const g = breakPlan(hash(ta, 1e9), 0).game, end = r.begin + (O.games[table].kind === 'chess' ? 30 + 30 * g : 20 + 20 * g)
  assert.deepEqual(b.now(go - 0.1).games, [], 'c walks to the table')
  assert.equal(b.step(a, go).begin, r.begin, 'one begin for both')
  assert.deepEqual(b.now(go), { games: [{ table, begin: r.begin, end }], stays: ['game'] })
  assert.deepEqual(b.now(end - 0.01).games, [{ table, begin: r.begin, end }])
  assert.deepEqual(b.now(end), { games: [], stays: [] }, 'after the end both walk back')
})

test('idleBreaks: a rush of one player removes the game from now() at once', () => {
  const { b, a, go } = gamePair(), t = go + 1
  assert.equal(b.now(t).games.length, 1, 'the game runs')
  assert.equal(b.step({ ...a, status: 'working' }, t).phase, 'rush')
  assert.deepEqual(b.now(t).games, [])
})

test('idleBreaks: an office with the same route inputs keeps each trip, a new layout ends each trip', () => {
  const d = WORKERS[0], s = start(O, d.id, termFor(O, d.id, 'kitchen')), { t } = until(s.b, s.d, s.t, (r) => r?.phase === 'stay')
  const same = buildOffice(demoSnapshot(0), demoMeetings(0))
  s.b.use(same, t)
  assert.equal(s.b.step(s.d, t + 0.1)?.phase, 'stay', 'the same layout')
  assert.deepEqual(s.b.now(t + 0.1).stays, ['kitchen'])
  s.b.use({ ...same, rooms: same.rooms.map((r) => (r.id === 'kitchen' ? { ...r, x: r.x + 1 } : r)) }, t + 0.2)
  assert.equal(s.b.step(s.d, t + 0.3), null, 'a new layout')
  assert.deepEqual(s.b.now(t + 0.3).stays, [])
})

test('idleBreaks: use() ends the trip of an away desk and the game of its partner at t', () => {
  const { b, a, c, go } = gamePair(), t = go + 1
  assert.equal(b.now(t).games.length, 1, 'the game runs')
  b.use({ ...O, desks: O.desks.map((d) => (d.id === a.id ? { ...d, away: { x: 0, z: 0, rot: 0 } } : d)) }, t)
  assert.deepEqual(b.now(t).games, [])
  const r = b.step(c, t + 0.1)
  assert.equal(r.phase, 'back', 'the partner walks back')
  assert.equal(r.play, false)
})

test('along at the full length of a real route is the last point', () => {
  let n = 0
  for (const [name, o] of offices) {
    const kitchen = o.rooms.find(r => r.kind === 'kitchen')
    for (const d of o.desks.filter(d => d.agent)) for (const spot of kitchen.spots) {
      const path = route(o, d.id, spot), a = along(path, pathLen(path))
      assert.ok(Math.hypot(a.x - spot.x, a.z - spot.z) < 1e-6, `${name}: ${d.id}: ends at (${a.x}, ${a.z}), not at the spot`)
      assert.equal(a.dx ** 2 + a.dz ** 2, 1, 'a unit direction'); n++
    }
  }
  assert.ok(n > 500, `${n} routes`)
})

// ---- routes ----
// Not covered here: that no decor prop stands on a walk rect, and that decor.js draws the kitchen tables and chairs. decor.js imports three,
// which Node cannot load. Check both by hand after a change to placer() or kitchen() (load decor.js with three.js in a scratch script).
const EPS = 1e-9
const strictIn = (p, c) => p.x > c.x + EPS && p.x < c.x + c.w - EPS && p.z > c.z + EPS && p.z < c.z + c.d - EPS
const closedIn = (p, c) => p.x >= c.x - EPS && p.x <= c.x + c.w + EPS && p.z >= c.z - EPS && p.z <= c.z + c.d + EPS
const inRect = (p, [x0, z0, x1, z1]) => p.x >= x0 - EPS && p.x <= x1 + EPS && p.z >= z0 - EPS && p.z <= z1 + EPS
// The distance from a point to the border of a rect, from inside or from outside.
const edge = (p, c) => {
  const dx = Math.max(c.x - p.x, 0, p.x - c.x - c.w), dz = Math.max(c.z - p.z, 0, p.z - c.z - c.d)
  return dx || dz ? Math.hypot(dx, dz) : Math.min(p.x - c.x, c.x + c.w - p.x, p.z - c.z, c.z + c.d - p.z)
}
const inDoor = (p, r) => Math.abs(p.x - r.door.x) <= 0.6 + EPS && Math.abs(p.z - r.door.z) <= 0.3 + EPS

// to: the id of the target room: 'kitchen', 'party', or the room of a game table (spot is then one of its places).
function checkRoute(name, o, d, spot, to = 'kitchen') {
  const path = route(o, d.id, spot, to), tag = `${name}: ${d.id} to ${to} (${spot.x.toFixed(2)}, ${spot.z.toFixed(2)})`
  assert.deepEqual(path[0], [d.x, d.z + 0.4], `${tag}: starts at the seat`)
  assert.deepEqual(path.at(-1), [spot.x, spot.z], `${tag}: ends at the spot`)
  path.slice(1).forEach(([x, z], i) => assert.ok(x === path[i][0] || z === path[i][1], `${tag}: segment ${i} is axis-aligned`))
  const cuts = path.map((_, i) => pathLen(path.slice(0, i + 1)))
  const len = pathLen(path), first = cuts[2] // the first two steps lead out of the chair: aside, then back to the lane
  assert.ok(path[1][1] === d.z + 0.4 && Math.abs(path[1][0] - d.x) >= 0.6, `${tag}: first steps aside, clear of the chair back`)
  const samples = [...new Set([...Array.from({ length: Math.floor(len / 0.1) + 1 }, (_, i) => i * 0.1), ...cuts])].sort((a, b) => a - b)
  // The other workers in the target room: at the counter, on a dance spot, at a kitchen table, or at a game table.
  const target = o.rooms.find(r => r.id === to), spots = [...(target.spots ?? []), ...(target.chairs ?? []), ...(target.chat ?? []), ...target.games.flatMap(g => g.places)]
  const tops = target.tables ?? [], seats = (target.chairs ?? []).filter(c => c !== spot)
  const walls = [...o.rooms, { x: 0, z: 0, w: o.bounds.w, d: o.bounds.d }]
  let prev = null
  for (const s of samples) {
    const p = along(path, s), at = `${tag} at (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`
    const room = o.rooms.find(r => strictIn(p, r)), cor = o.corridors.find(c => strictIn(p, c))
    if (!room && !cor) assert.ok(o.rooms.some(r => inDoor(p, r)) || o.corridors.filter(c => closedIn(p, c)).length > 1, `${at}: on a wall line outside a door`)
    for (const r of walls) assert.ok(edge(p, r) >= 0.3 - EPS || inDoor(p, r), `${at}: closer than 0.3 to the wall of ${r.id ?? 'the building'}`)
    for (const q of o.desks) {
      const hit = Math.abs(p.x - q.x) < 1.4 - EPS && Math.abs(p.z - q.z) < 1 - EPS // the desk half width 1 plus the reach of an arm, 0.39
      assert.ok(!hit || (q === d && s <= first + EPS), `${at}: inside the desk of ${q.id}`)
    }
    for (const q of o.rooms.flatMap(r => r.pods)) assert.ok(Math.hypot(p.x - (q.x - 0.5), p.z - (q.z + 0.4)) >= 0.4 - EPS, `${at}: closer than 0.4 to the lamp post of ${q.id}`) // LAMP in decor.js
    if (room) assert.ok(room.pods.some(q => closedIn(p, q)) || room.walk.some(w => inRect(p, w)), `${at}: in ${room.id}, not in a pod and not in a walk rect`)
    const label = room ? room.id : cor ? 'corridor' : null
    if (label && prev && prev.label !== label) { // a crossing: a room and a corridor, through the door of the room, on the free side of its leaf
      const r = room ?? o.rooms.find(r => r.id === prev.label), other = room ? prev.label : label
      assert.ok(r && other === 'corridor', `${at}: from ${prev.label} to ${label}`)
      const mid = { x: (p.x + prev.p.x) / 2, z: (p.z + prev.p.z) / 2 }, free = mid.x - r.door.x, sgn = r.door.side === 'south' ? -1 : 1
      assert.ok(Math.abs(mid.z - r.door.z) <= 0.15 && free * sgn >= 0.1 - EPS && free * sgn <= 0.6 + EPS, `${at}: crosses the wall of ${r.id} off its door (${mid.x}, ${mid.z})`)
    }
    if (label) prev = { label, p }
    // The body keeps clear of the open door leaf and of the door posts. A footprint is 0.39 to each side and 0.15 along the walk
    // direction (the torso). The arms swing 0.7 rad at most, and 0.5 long, so they reach 0.5 sin(0.7 calm) + 0.07 along. Walking back, the
    // right hand holds the mug (0.14 wide in worker(), at x 0.32), 0.25 to 0.39 to the right of the body and 0.56 sin(0.1 + 1.1 calm) + 0.08 ahead (see stroll() in office.js).
    // At a corner both directions count. The leaf is a segment from its hinge to its tip (see door() in office.js), 0.06 thick.
    const dirs = [along(path, s), along(path, Math.max(0, s - 1e-7))]
    for (const r of o.rooms) if (r.door && Math.hypot(p.x - r.door.x, p.z - r.door.z) < 3) {
      const c = calm(Math.hypot(p.x - r.door.x, p.z - r.door.z)), reach = Math.max(0.15, 0.5 * Math.sin(0.7 * c) + 0.07), mug = 0.56 * Math.sin(0.1 + 1.1 * c) + 0.08, k = r.door.side === 'south' ? 1 : -1
      const boxes = [] // [x0, x1, z0, z1]
      for (const a of dirs) {
        const ax = Math.abs(a.dx) > 0.5
        boxes.push(ax ? [p.x - reach, p.x + reach, p.z - 0.39, p.z + 0.39] : [p.x - 0.39, p.x + 0.39, p.z - reach, p.z + reach])
        const bx = -a.dx, bz = -a.dz, rx = -bz, rz = bx // the way back, and the right side of the body on the way back
        const [x0, x1] = [p.x + rx * 0.25, p.x + rx * 0.39 + bx * mug].sort((m, n) => m - n), [z0, z1] = [p.z + rz * 0.25, p.z + rz * 0.39 + bz * mug].sort((m, n) => m - n)
        boxes.push([x0, x1, z0, z1])
      }
      for (const [x0, x1, z0, z1] of boxes) {
        for (let i = 0; i <= 30; i++) {
          const f = i / 30, lx = r.door.x + k * (0.54 - 0.49 * f), lz = r.door.z - k * 0.96 * f
          assert.ok(lx < x0 - 0.03 || lx > x1 + 0.03 || lz < z0 - 0.03 || lz > z1 + 0.03, `${at}: the body or a hand touches the open leaf of ${r.id} (${lx.toFixed(2)}, ${lz.toFixed(2)})`)
        }
        for (const px of [-0.6, 0.6]) assert.ok(r.door.x + px < x0 - 0.06 || r.door.x + px > x1 + 0.06 || r.door.z < z0 - 0.18 + EPS || r.door.z > z1 + 0.18 - EPS, `${at}: the body or a hand touches a post of ${r.id}`)
      }
    }
    // A table top is 0.9 x 0.9 round its center. A chair reaches 0.25 to each side of its point and 0.45 behind it, away from the table.
    // A game table top: chess 0.7 x 0.7, ping-pong 2.2 x 1.2. The route line keeps 0.3 from it. A chess place is 0.27 from its own top,
    // because the player sits at the table, so the route to it keeps 0.25 from that top.
    for (const g of room?.games ?? []) {
      const [hx, hz] = g.kind === 'chess' ? [0.35, 0.35] : [1.1, 0.6], m = g.places.includes(spot) ? 0.25 : 0.3
      assert.ok(Math.abs(p.x - g.x) >= hx + m - EPS || Math.abs(p.z - g.z) >= hz + m - EPS, `${at}: the route line is closer than ${m} to the ${g.kind} table at (${g.x.toFixed(2)}, ${g.z.toFixed(2)})`)
    }
    for (const t of tops) assert.ok(Math.abs(p.x - t.x) >= 0.75 - EPS || Math.abs(p.z - t.z) >= 0.75 - EPS, `${at}: the route line is closer than 0.3 to the table at (${t.x.toFixed(2)}, ${t.z.toFixed(2)})`)
    for (const c of seats) {
      const [x0, x1] = c.rot === 3 ? [c.x - 0.45, c.x + 0.25] : [c.x - 0.25, c.x + 0.45]
      assert.ok(Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(c.z - 0.25 - p.z, 0, p.z - c.z - 0.25)) >= 0.39 - EPS, `${at}: the body touches the chair at (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`)
    }
    for (const q of spots) if (q !== spot) assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= 0.55 - EPS, `${at}: closer than 0.55 to a worker at the spot (${q.x.toFixed(2)}, ${q.z.toFixed(2)})`) // 0.39 half width of the walker and 0.15 half depth of the stander
  }
}

test('every route runs from a seat to a kitchen spot through rooms, doors and corridors', () => {
  let n = 0
  for (const [name, o] of offices) {
    const kitchen = o.rooms.find(r => r.kind === 'kitchen')
    for (const r of [kitchen, ...o.rooms.filter(r => r.kind === 'workspace')]) {
      assert.ok(r.walk.length && r.walk.every(w => w.length === 4 && w[0] <= w[2] && w[1] <= w[3] && w[0] >= r.x && w[1] >= r.z && w[2] <= r.x + r.w && w[3] <= r.z + r.d), `${name}: walk rects of ${r.id} are inside it`)
    }
    for (const d of o.desks.filter(d => d.agent)) for (const spot of kitchen.spots) { checkRoute(name, o, d, spot); n++ }
  }
  assert.ok(n > 500, `${n} routes`)
})

test('a small kitchen has its chat spots and its cooler at the worked values', () => {
  const at = (name) => { const k = offices.find(([n]) => n === name)[1].rooms.find(r => r.kind === 'kitchen'); return [k.door.side, ...[k.chat[0].x, k.cooler.x, k.chat[1].x].map(x => +(x - k.x).toFixed(2))] }
  assert.deepEqual(at('1 small workspaces'), ['north', 5.28, 5.73, 6.18])
  assert.deepEqual(at('3 small workspaces'), ['south', 4.52, 4.97, 5.42])
})

test('every lunch route runs from a seat to a kitchen chair, and its last leg comes from the strip', () => {
  let n = 0
  for (const [name, o] of offices) {
    const kitchen = o.rooms.find(r => r.kind === 'kitchen')
    for (const d of o.desks.filter(d => d.agent)) for (const chair of kitchen.chairs) {
      checkRoute(name, o, d, chair)
      assert.deepEqual(route(o, d.id, chair).slice(-2), [[chair.x, kitchen.z + 1.9], [chair.x, chair.z]], `${name}: ${d.id}: along the strip, then straight to the chair`)
      n++
    }
  }
  assert.ok(n > 1000, `${n} routes`)
})

test('every route to a chat spot runs from a seat, and its last leg comes from the strip', () => {
  let n = 0
  for (const [name, o] of offices) {
    const k = o.rooms.find(r => r.kind === 'kitchen')
    for (const d of o.desks.filter(d => d.agent)) for (const s of k.chat) {
      checkRoute(name, o, d, s)
      assert.deepEqual(route(o, d.id, s).slice(-2), [[s.x, k.z + 1.9], [s.x, s.z]], `${name}: ${d.id}: along the strip, then straight to the spot`)
      n++
    }
  }
  assert.ok(n > 500, `${n} routes`)
})

test('a walker to a chat spot opens only its own door and the kitchen door', () => {
  let n = 0
  for (const [name, o] of offices) {
    const k = o.rooms.find(r => r.kind === 'kitchen')
    for (const s of k.chat) for (const d of o.desks.filter((d) => d.agent)) {
      const path = route(o, d.id, s), len = pathLen(path), mine = [o.rooms.find((r) => r.id === d.roomId), k]
      for (let i = 0; i * 0.1 <= len; i++) {
        const p = along(path, i * 0.1), ids = opens(o, d, { x: p.x, z: p.z, phase: 'out', room: 'kitchen' }), at = `${name}: ${d.id} to a chat spot at (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`
        assert.ok(ids.every((id) => mine.some((r) => r.id === id)), `${at}: opens ${ids}`)
      }
      assert.deepEqual(opens(o, d, { x: s.x, z: s.z, phase: 'stay', room: 'kitchen' }), [], `${name}: ${d.id}: in the stay at a chat spot`)
      n++
    }
  }
  assert.ok(n > 0)
})

test('the kitchen has 2 or more chairs at its tables, inside the room, off the walk rects of the other chairs, and apart', () => {
  for (const [name, o] of offices) {
    const k = o.rooms.find(r => r.kind === 'kitchen'), { tables, chairs, walk } = k
    assert.ok(chairs.length >= 2, `${name}: ${chairs.length} chairs`)
    const lanes = walk.filter(w => chairs.some(c => Math.abs(w[0] + 0.3 - c.x) < EPS && Math.abs(w[3] - c.z) < EPS)) // the lane of each chair ends at the chair
    assert.equal(lanes.length, chairs.length, `${name}: one lane for each chair`)
    const parts = [...tables.map(t => [t.x - 0.45, t.z - 0.45, t.x + 0.45, t.z + 0.45, null]), ...chairs.map(c => [c.x - (c.rot === 3 ? 0.45 : 0.25), c.z - 0.25, c.x + (c.rot === 3 ? 0.25 : 0.45), c.z + 0.25, c])]
    for (const [x0, z0, x1, z1, c] of parts) {
      assert.ok(x0 >= k.x + 0.2 - EPS && x1 <= k.x + k.w - 0.2 + EPS && z0 >= k.z + 0.2 - EPS && z1 <= k.z + k.d - 0.2 + EPS, `${name}: (${x0}, ${z0}) inside`)
      for (const w of walk) if (!(c && Math.abs(w[0] + 0.3 - c.x) < EPS && Math.abs(w[3] - c.z) < EPS)) assert.ok(x1 <= w[0] + EPS || w[2] <= x0 + EPS || z1 <= w[1] + EPS || w[3] <= z0 + EPS, `${name}: (${x0}, ${z0}) on the walk rect ${w}`)
    }
    chairs.forEach((a, i) => chairs.slice(i + 1).forEach(b => assert.ok(a.table === b.table || Math.hypot(a.x - b.x, a.z - b.z) >= 0.85 - EPS, `${name}: chairs apart`)))
  }
})

// Two rows of 4 pods, with short and tall pods in each row.
const ROWS = [[G(2, 2), G(3, 1), G(2, 1), G(2, 2), G(3, 2), G(2, 1), G(2, 2), G(2, 1)]]
test('under a short pod next to a tall pod, only a narrow lane below each last-row desk is a walk rect', () => {
  let n = 0
  for (const o of [...offices.map(([, o]) => o), buildOffice(snap(ROWS))]) {
    for (const r of o.rooms.filter(r => r.kind === 'workspace' && r.door.side === 'south')) for (const p of r.pods) {
      const bottom = Math.max(...r.pods.filter(q => q.z === p.z).map(q => q.z + q.d)) // the deepest pod of the row
      if (bottom - (p.z + p.d) < 1) continue // not a short pod
      const xs = o.desks.filter(d => d.podId === p.id && d.z + 1.1 >= p.z + p.d - 1e-9).map(d => d.x + 0.65).sort((a, b) => a - b) // the lanes of the last row, as in route()
      const z = (p.z + p.d + bottom) / 2, free = { x: xs.length > 1 ? (xs[0] + xs[1]) / 2 : xs[0] - 1, z }
      assert.ok(!r.walk.some(w => inRect(free, w)), `${r.id}: (${free.x.toFixed(2)}, ${z.toFixed(2)}) under the short pod ${p.id} is in a walk rect`)
      for (const x of xs) assert.ok(r.walk.some(w => inRect({ x, z }, w)), `${r.id}: the lane at x ${x.toFixed(2)} under ${p.id} is in no walk rect`)
      n++
    }
  }
  assert.ok(n > 5, `${n} short pods`)
})

test('every route to the party room runs from a seat to a dance spot through rooms, doors and corridors', () => {
  let n = 0
  for (const [name, o] of offices) {
    const party = o.rooms.find(r => r.kind === 'party')
    if (!party) continue
    for (const d of o.desks.filter(d => d.agent)) for (const spot of party.spots) { checkRoute(name, o, d, spot, 'party'); n++ }
  }
  assert.ok(n > 1500, `${n} routes`)
})

// A seat can stand within 3 of its own door. That door then opens when the worker stands up.
test('a walker opens only its own door and the door of its target room, near the door, and none in the stay', () => {
  for (const [name, o] of offices) {
    const kitchen = o.rooms.find(r => r.kind === 'kitchen'), party = o.rooms.find(r => r.kind === 'party')
    for (const target of [kitchen, party].filter(Boolean)) for (const d of o.desks.filter(d => d.agent)) for (const spot of [...target.spots, ...(target.chairs ?? [])]) { // office.js opens the kitchen for a lunch
      const path = route(o, d.id, spot, target.id), len = pathLen(path), mine = [o.rooms.find(r => r.id === d.roomId), target]
      for (let i = 0; i * 0.1 <= len; i++) {
        const p = along(path, i * 0.1), ids = opens(o, d, { x: p.x, z: p.z, phase: 'out', room: target.id }), at = `${name}: ${d.id} to ${target.id} at (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`
        assert.ok(ids.every(id => mine.some(r => r.id === id)), `${at}: opens ${ids}`)
        for (const r of mine) {
          const dd = Math.hypot(p.x - r.door.x, p.z - r.door.z)
          if (dd <= 1.4) assert.ok(ids.includes(r.id), `${at}: the door of ${r.id} stays closed`)
          if (dd >= 3) assert.ok(!ids.includes(r.id), `${at}: opens the door of ${r.id} from ${dd.toFixed(2)}`)
        }
      }
      assert.deepEqual(opens(o, d, { x: spot.x, z: spot.z, phase: 'stay', room: target.id }), [], `${name}: ${d.id}: in the stay in ${target.id}`)
    }
    if (!party) continue
    const d = o.desks.find(d => d.agent) // a walker to one room keeps the door of the other room closed, also at its center
    for (const phase of ['out', 'back', 'rush']) {
      assert.ok(!opens(o, d, { ...kitchen.door, phase, room: 'party' }).includes('kitchen'), `${name}: a party walker opens the kitchen door`)
      assert.ok(!opens(o, d, { ...party.door, phase, room: 'kitchen' }).includes('party'), `${name}: a kitchen walker opens the party door`)
    }
  }
})

// The desks that walk to a game table in the route test: each agent desk of its room, and the first agent desk of each other room.
// Routes from one room share most of their legs. All desks would give 4782 routes and 47 s, most of them in the 18-workspace case.
const players = (o, g) => o.desks.filter((d, i, all) => d.agent && (d.roomId === g.room || all.findIndex((e) => e.agent && e.roomId === d.roomId) === i))
test('every route to a game place runs from a seat to the place through rooms, doors and corridors', () => {
  let n = 0, same = 0, other = 0
  for (const [name, o] of offices) for (const g of o.games) for (const place of g.places) for (const d of players(o, g)) {
    checkRoute(name, o, d, place, g.room)
    const path = route(o, d.id, place, g.room)
    const r = o.rooms.find((r) => r.id === g.room)
    const zm = path.at(-2) // the last leg comes straight from the main walk line
    assert.ok(Math.abs(zm[0] - place.x) < 1e-9, `${name}: the last leg to ${place.x} is not straight`)
    if (d.roomId === g.room) { same++; assert.ok(path.every(([x, z]) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d), `${name}: ${d.id} leaves its own room`) }
    else if (r.kind === 'workspace') other++ // checkRoute() wants each step between a room and a corridor at a door
    n++
  }
  assert.ok(n > 0, 'no game routes: add a case with a big room to CASES')
  assert.ok(same > 0, 'no route from a desk in the room of the table: add a case')
  assert.ok(other > 0, 'no route from another room to a workspace room with a table: add a case')
})

test('the cases have a game table in a workspace room, on each side of its main walk line, with desks in that room and in other rooms', () => {
  const sides = new Set()
  for (const [, o] of offices) for (const g of o.games) {
    const r = o.rooms.find((r) => r.id === g.room), mine = o.desks.filter((d) => d.agent && d.roomId === r.id)
    if (r.kind !== 'workspace' || !mine.length || mine.length === o.desks.filter((d) => d.agent).length) continue
    const s = r.door.side === 'south' ? 1 : -1, row = Math.max(...r.pods.map((p) => s * (p.z + (s > 0 ? p.d : 0)))) // the pod edge nearest to the door
    sides.add(s * g.z > row ? 'door side' : 'far side')
  }
  assert.deepEqual([...sides].sort(), ['door side', 'far side'])
})

// A walker in its own room never leaves it, so no door opens.
test('a walker to a game place opens only its own door and the door of the game room, and none in its own room', () => {
  let n = 0
  for (const [name, o] of offices) for (const g of o.games) for (const place of g.places) for (const d of o.desks.filter((d) => d.agent)) {
    const path = route(o, d.id, place, g.room), len = pathLen(path), target = o.rooms.find((r) => r.id === g.room)
    const mine = d.roomId === g.room ? [] : [o.rooms.find((r) => r.id === d.roomId), target]
    for (let i = 0; i * 0.1 <= len; i++) {
      const p = along(path, i * 0.1), ids = opens(o, d, { x: p.x, z: p.z, phase: 'out', room: g.room }), at = `${name}: ${d.id} to ${g.kind} in ${g.room} at (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`
      assert.ok(ids.every((id) => mine.some((r) => r.id === id)), `${at}: opens ${ids}`)
      for (const r of mine) {
        const dd = Math.hypot(p.x - r.door.x, p.z - r.door.z)
        if (dd <= 1.4) assert.ok(ids.includes(r.id), `${at}: the door of ${r.id} stays closed`)
      }
    }
    assert.deepEqual(opens(o, d, { x: place.x, z: place.z, phase: 'stay', room: g.room }), [], `${name}: ${d.id}: in the stay at ${g.kind}`)
    n++
  }
  assert.ok(n > 0)
})

// ---- the demo ----
test('the demo has long-idle agents in different rooms: time for a trip, a trip that a status change cuts short, a game, and a chat', () => {
  const N = 700, ticks = Array.from({ length: N }, (_, t) => demoSnapshot(t)), o = buildOffice(ticks[0], demoMeetings(0))
  const party = o.rooms.find(r => r.kind === 'party')
  assert.ok(party, 'the demo has a party room')
  // Idle stretches [start, length] that begin and end inside the window. A change from done to idle starts one too.
  const stretches = (id) => {
    const st = ticks.map(s => s.agents.find(a => a.pane_id === id)?.agent_status), out = []
    for (let i = 1, from = null; i < N; i++) {
      if (st[i] === 'idle' && st[i - 1] !== 'idle') from = i
      else if (st[i] !== 'idle' && from !== null) { out.push([from, i - from]); from = null }
    }
    return out
  }
  const long = o.desks.filter(d => d.agent && stretches(d.id).some(([, n]) => n >= 60))
  assert.ok(long.length >= 2, `${long.length} long-idle agents`)
  assert.ok(new Set(long.map(d => d.roomId)).size >= 2, 'in different rooms')
  const starts = long.map(d => stretches(d.id).find(([, n]) => n >= 60)[0])
  assert.ok(Math.max(...starts) - Math.min(...starts) >= 30, `the idle stretches start apart: ${starts}`)
  // Run the breaks of each agent desk as office.js does, 10 frames a second. The other agents never idle long enough for a trip.
  const breaks = idleBreaks(), desks = o.desks.filter((d) => d.agent && !d.away), last = new Map(), done = new Map(), pairs = []
  let cut = 0
  breaks.use(o, 0)
  for (let i = 0; i < N * 10; i++) {
    const t = i / 10, snap = ticks[Math.floor(t)], play = new Map() // '<kind>:<table>' -> the desks that play in this frame
    for (const d of desks) {
      const r = breaks.step({ ...d, status: snap.agents.find((a) => a.pane_id === d.id).agent_status }, t), prev = last.get(d.id), key = `${r?.kind}:${r?.table}`
      if (!r && prev) prev.phase === 'rush' ? cut++ : done.set(d.id, (done.get(d.id) ?? 0) + 1) // back at the desk: a run back, or a full trip
      if (r?.play) play.set(key, [...(play.get(key) ?? []), d.id])
      last.set(d.id, r)
    }
    for (const [key, ids] of play) if (ids.length === 2) pairs.push([...ids, key.split(':')[0]])
  }
  for (const d of long) assert.ok(done.get(d.id) >= 1, `${d.id}: no full trip in ${N} s`)
  assert.ok(cut >= 1, 'a status change catches a worker on a trip')
  const of = (kind) => pairs.some(([a, b, k]) => k === kind && long.some((d) => d.id === a) && long.some((d) => d.id === b))
  assert.ok(of('game'), 'two long-idle agents play a game')
  assert.ok(of('chat'), 'two long-idle agents chat')
})

test('candleSpots: corridor candelabra stand clear of the edges, doors, junction mouths, and every route', () => {
  for (const [name, o] of offices) {
    const spots = candleSpots(o)
    assert.ok(spots.some((s) => s.axis === 'z'), `${name}: a cross corridor spot`)
    // Screen offset of the middle flame (x, 1.5, z) from a north door sign (door.x, 3, door.z + 0.4), camera along (1, 1, 1): right axis (1, 0, -1)/sqrt2, up axis (-1, 2, -1)/sqrt6.
    for (const r of o.rooms.filter((r) => r.door.side === 'north')) for (const s of spots) {
      const dx = s.x - r.door.x, dy = 1.5 - 3, dz = s.z - (r.door.z + 0.4), du = (dx - dz) / Math.SQRT2, dv = (-dx + 2 * dy - dz) / Math.sqrt(6)
      assert.ok(Math.abs(du) >= 1.6 || Math.abs(dv) >= 0.4, `${name}: candles at (${s.x}, ${s.z}) hide behind the sign of ${r.id} (du ${du.toFixed(2)}, dv ${dv.toFixed(2)})`)
    }
    assert.deepEqual(spots, candleSpots(o), `${name}: deterministic`)
    assert.ok(spots.length >= 1, `${name}: at least one spot`)
    const X = o.corridors.at(-1), bands = o.corridors.slice(0, -1)
    const home = (s) => o.corridors.find(c => s.x >= c.x + 0.25 - EPS && s.x <= c.x + c.w - 0.25 + EPS && s.z >= c.z + 0.25 - EPS && s.z <= c.z + c.d - 0.25 + EPS)
    for (const s of spots) {
      const c = home(s)
      assert.ok(c, `${name}: spot (${s.x}, ${s.z}) is 0.25 inside a corridor`)
      assert.equal(s.axis, c === X ? 'z' : 'x', `${name}: axis`)
      if (c === X) { for (const b of bands) assert.ok(s.z < b.z - 0.4 || s.z > b.z + b.d + 0.4, `${name}: cross spot z ${s.z} in the mouth of a band corridor`) }
      for (const r of o.rooms) assert.ok(Math.hypot(s.x - r.door.x, s.z - r.door.z) >= 1.2 - EPS, `${name}: spot (${s.x}, ${s.z}) near the door of ${r.id}`)
      for (const t of spots) if (t !== s && home(t) === c) assert.ok(Math.hypot(s.x - t.x, s.z - t.z) >= 3 - EPS, `${name}: spots apart`)
    }
    const kitchen = o.rooms.find(r => r.kind === 'kitchen'), party = o.rooms.find(r => r.kind === 'party')
    const clear = (d, spot, to) => {
      const path = route(o, d.id, spot, to), len = pathLen(path)
      for (let s = 0; s <= len; s += 0.1) { const p = along(path, s); for (const c of spots) assert.ok(Math.hypot(p.x - c.x, p.z - c.z) >= 0.5 - EPS, `${name}: ${d.id} to ${to} passes (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) near the candles at (${c.x}, ${c.z})`) }
    }
    for (const d of o.desks.filter(d => d.agent)) {
      for (const spot of kitchen.spots) clear(d, spot, 'kitchen')
      if (party) for (const spot of party.spots) clear(d, spot, 'party')
    }
  }
})

// Lightning: fixed random numbers, then the sampled ranges, then the flash power by time.
test('lightningPlan gives the wait and the flash count from the random numbers', () => {
  const low = lightningPlan(() => 0), high = lightningPlan(() => 0.999)
  assert.equal(low.wait, 20)
  assert.equal(low.flashes.length, 2)
  assert.ok(Math.abs(high.wait - 60) < 0.1, `wait ${high.wait}`)
  assert.equal(high.flashes.length, 1)
})

test('lightningPlan stays in range over many plans', () => {
  for (let i = 0; i < 10000; i++) {
    const p = lightningPlan()
    assert.ok(p.wait >= 20 && p.wait <= 60, `wait ${p.wait}`)
    assert.ok(p.flashes.length === 1 || p.flashes.length === 2, `count ${p.flashes.length}`)
    assert.equal(p.flashes[0].at, 0)
    assert.equal(p.flashes[0].power, 1)
    for (const f of p.flashes) assert.ok(f.len >= 0.08 && f.len <= 0.12, `len ${f.len}`)
    if (p.flashes.length === 2) {
      assert.ok(p.flashes[1].at >= 0.3 && p.flashes[1].at <= 0.6, `at ${p.flashes[1].at}`)
      assert.equal(p.flashes[1].power, 0.6)
    }
  }
})

test('flash returns the power of the flash that holds the time', () => {
  const plan = { wait: 30, flashes: [{ at: 0, len: 0.1, power: 1 }, { at: 0.4, len: 0.1, power: 0.6 }] }
  for (const s of [0, 0.05]) assert.equal(flash(plan, s), 1, `s ${s}`)
  assert.equal(flash(plan, 0.45), 0.6)
  for (const s of [0.1, 0.2, 0.39, 0.5, -1]) assert.equal(flash(plan, s), 0, `s ${s}`)
})

test('stepBreak: in a chat exactly one worker talks at each time, the waiter first, and each turn lasts 2 to 3 s', () => {
  const { w, a } = cpair(), both = (t) => [cstep(w, t, 'a').talk, jstep(w, t, 'b').talk], turns = []
  assert.deepEqual(both(a.begin + 0.001), [true, false], 'the waiter talks first')
  let last = true, from = a.begin
  for (let t = a.begin + 0.001; t < a.end; t += 0.01) {
    const [x, y] = both(t)
    assert.notEqual(x, y, `one worker talks at ${t}`)
    if (x !== last) { turns.push(t - from); from = t; last = x }
  }
  assert.ok(turns.length >= 2, `${turns.length} full turns`)
  for (const u of turns) assert.ok(u >= 2 - 0.02 && u <= 3 + 0.02, `a turn of ${u} s`)
})

test('stepBreak: the turn length differs from one chat to the next, and each lies in 2 to 3 s', () => {
  const lens = [1, 3, 5, 7].map((late) => { // b joins late s after a arrives, so each chat begins at another time
    const w = world()
    cstep(w, 0, 'a'); jstep(w, 0, 'b')
    const a = cstep(w, 100, 'a').trip, b = jstep(w, arrive(a) + late, 'b').trip
    const flips = []
    for (let t = b.begin + 0.001, last = true; t < b.end; t += 0.01) { const x = cstep(w, t, 'a').talk; if (x !== last) { flips.push(t); last = x } }
    assert.ok(flips.length >= 2, `late ${late}: ${flips.length} flips`)
    return flips[1] - flips[0]
  })
  for (const u of lens) assert.ok(u >= 2 - 0.02 && u <= 3 + 0.02, `a turn of ${u} s`)
  assert.ok(Math.max(...lens) - Math.min(...lens) > 0.05, `the turn lengths ${lens.map((u) => u.toFixed(2))} are all equal`)
})

test('stepBreak: no talk for a waiter alone, before the chat begins, after its end, or in a game', () => {
  { const { w, a } = cpair()
    assert.deepEqual([cstep(w, a.begin - 0.1, 'a').talk, jstep(w, a.begin - 0.1, 'b').talk], [false, false])
    assert.deepEqual([cstep(w, a.end + 0.1, 'a').talk, jstep(w, a.end + 0.1, 'b').talk], [false, false]) }
  { const w = world()
    cstep(w, 0, 'a')
    const a = cstep(w, 100, 'a').trip
    assert.equal(cstep(w, arrive(a) + 5, 'a').talk, false) }
  { const { w, a } = pair()
    const r = gstep(w, a.begin + 0.1, 'a')
    assert.deepEqual([r.play, r.talk], [true, false]) }
})

test('stepBreak: a joiner that arrives first does not talk until the waiter arrives', () => {
  const w = world(), near = { route: () => [[0, 0], [0, 4]] }
  cstep(w, 0, 'a'); jstep(w, 0, 'b', near)
  const a = cstep(w, 100, 'a').trip // a walks 10 s
  jstep(w, 101, 'b', near) // b walks 2.5 s
  const both = (t) => [cstep(w, t, 'a').talk, jstep(w, t, 'b', near).talk]
  assert.deepEqual(both(105), [false, false])
  assert.deepEqual(both(a.begin + 0.001), [true, false])
})

test('stepBreak: two trips that start in one frame still give one talker', () => {
  const w = world()
  cstep(w, 0, 'a'); jstep(w, 0, 'b')
  const a = cstep(w, 100, 'a').trip, b = jstep(w, 100, 'b').trip
  assert.equal(a.start, b.start)
  assert.deepEqual([cstep(w, a.begin + 0.001, 'a').talk, jstep(w, a.begin + 0.001, 'b').talk], [true, false])
})

test('stepBreak: a joiner whose waiter rushes on its way never talks', () => {
  const { w, b } = cpair(), tr = b.start + 2
  cstep(w, tr, 'a', { idle: false })
  for (let t = tr; t < arrive(b) + OUT; t += 0.1) { const r = jstep(w, t, 'b'); assert.ok(!r?.talk, `b talks at ${t}`) }
})
