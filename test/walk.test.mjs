import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildOffice, demoSnapshot, demoMeetings, along, tripAt, breakPlan, route, hash, calm, opens, pathLen, stepBreak, endBreak, WALK, RUN } from '../public/model.js'

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
  assert.deepEqual([out.trip.room, out.trip.spot], ['kitchen', 'kitchen:1'])
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
  assert.deepEqual([out.trip.room, out.trip.spot, seen], ['party', key, [['party', seed % 5]]], 'the claim starts at (seed + 0) % spots')
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
  assert.deepEqual([out.trip.room, out.trip.spot, seen], ['lunch', key, [['lunch', seed % 4]]], 'the claim starts at (seed + 0) % chairs')
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
  assert.deepEqual([r.trip.room, [...w.claimed]], ['kitchen', [[`kitchen:${seed % 3}`, 'a']]])
})

test('stepBreak: a full kind sends the worker to the next kind in the order kitchen, lunch, party', () => {
  for (const [first, full, next] of [['kitchen', ['kitchen'], 'lunch'], ['lunch', ['lunch'], 'kitchen'], ['party', ['party'], 'kitchen'], ['party', ['party', 'kitchen'], 'lunch'], ['kitchen', ['kitchen', 'lunch'], 'party']]) {
    const w = world(), seed = seedFor(first), over = { seed, spots: ALL }
    for (const kind of full) for (let i = 0; i < ALL[kind]; i++) w.claimed.set(`${kind}:${i}`, `x${i}`)
    step(w, 0, over)
    const r = step(w, w.trips.get('a').next, over)
    assert.equal(r.trip.room, next, `the pick ${first}, ${full} full`)
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
      assert.equal(r.trip.room, kindOf(seed, 0, kinds), `${JSON.stringify(spots)} seed ${seed}`)
      seen.add(r.trip.room)
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
      assert.deepEqual(Object.keys(p), ['wait', 'stay', 'lunch', 'pick'])
      if (!n) firsts.add(p.wait.toFixed(3))
    }
  }
  assert.ok(firsts.size > 150, 'the seeds spread the first trips')
  assert.notDeepEqual(breakPlan(5, 1), breakPlan(5, 2), 'each trip has its own plan')
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

// to: the id of the target room, 'kitchen' or 'party'.
function checkRoute(name, o, d, spot, to = 'kitchen') {
  const path = route(o, d.id, spot, to), tag = `${name}: ${d.id} to ${to} (${spot.x.toFixed(2)}, ${spot.z.toFixed(2)})`
  assert.deepEqual(path[0], [d.x, d.z + 0.4], `${tag}: starts at the seat`)
  assert.deepEqual(path.at(-1), [spot.x, spot.z], `${tag}: ends at the spot`)
  path.slice(1).forEach(([x, z], i) => assert.ok(x === path[i][0] || z === path[i][1], `${tag}: segment ${i} is axis-aligned`))
  const cuts = path.map((_, i) => pathLen(path.slice(0, i + 1)))
  const len = pathLen(path), first = cuts[2] // the first two steps lead out of the chair: aside, then back to the lane
  assert.ok(path[1][1] === d.z + 0.4 && Math.abs(path[1][0] - d.x) >= 0.6, `${tag}: first steps aside, clear of the chair back`)
  const samples = [...new Set([...Array.from({ length: Math.floor(len / 0.1) + 1 }, (_, i) => i * 0.1), ...cuts])].sort((a, b) => a - b)
  const target = o.rooms.find(r => r.id === to), spots = [...target.spots, ...(target.chairs ?? [])] // the other workers in the target room, at the counter or at a table
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

// ---- the demo ----
test('the demo has two long-idle agents in different rooms: time for a trip, and a trip that a status change cuts short', () => {
  const N = 700, ticks = Array.from({ length: N }, (_, t) => demoSnapshot(t)), o = buildOffice(ticks[0], demoMeetings(0))
  const kitchen = o.rooms.find(r => r.kind === 'kitchen'), party = o.rooms.find(r => r.kind === 'party')
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
  let cut = 0
  for (const d of long) {
    const seed = hash(d.terminalId, 1e9)
    const far = (r, spots) => Math.max(...spots.map(s => pathLen(route(o, d.id, s, r.id)))) // the longest route into a room
    const ROOM = { kitchen: [kitchen, kitchen.spots], lunch: [kitchen, kitchen.chairs], party: [party, party.spots] }
    const len = (k) => far(...ROOM[kindOf(seed, k)]) // the pick of trip k picks the kind
    const stay = (k) => (kindOf(seed, k) === 'lunch' ? breakPlan(seed, k).lunch : breakPlan(seed, k).stay)
    for (const [, n] of stretches(d.id).filter(([, n]) => n >= 60)) {
      const need = breakPlan(seed, 0).wait + 2 * len(0) / WALK + stay(0)
      assert.ok(n >= need, `${d.id}: idle ${n} s, the first trip (${kindOf(seed, 0)}) needs ${need.toFixed(1)} s`)
      // The worker waits, walks, stays and walks back, then waits for the next trip. Does the stretch end during a trip?
      for (let t = 0, k = 0; ; k++) {
        const p = breakPlan(seed, k), start = t + p.wait, end = start + 2 * len(k) / WALK + stay(k)
        if (start >= n) break
        if (end > n) { cut++; break }
        t = end
      }
    }
  }
  assert.ok(cut >= 1, 'a status change catches a worker on a trip')
})
