// Pure model: herdr session snapshot -> office layout. No imports, no DOM.
// Floor plane is x/z (y is up). North is -z, south is +z.

export const STATUS_RANK = { unknown: 0, idle: 1, working: 2, done: 3, blocked: 4 }
export const STATUS_COLOR = { working: '#f9e2af', blocked: '#fa5252', done: '#94e2d5', idle: '#a6e3a1', unknown: '#6c7086' }

const GAP_X = 2.4, GAP_Z = 2.2 // one desk cell: desk footprint 2 x 1.5 plus room to breathe
const POD_GAP = 1.5, WALL = 1.5, HALL = 3, MAX_ROW = 30 // WALL: free floor between pods and a room wall. HALL: corridor width
const SEAT = 1.15, TABLE = (k) => k * SEAT + 0.8 // meeting table: length per chair on a long side. 0.4 free at each end

export function rollup(statuses) {
  return statuses.reduce((best, s) => (STATUS_RANK[s] > STATUS_RANK[best] ? s : best), 'unknown')
}

// Distinct normalized centers -> offsets. Keeps the proportions, but each value lands at least `gap` past the previous one.
function spread(values, gap) {
  const sorted = [...new Set(values)].sort((a, b) => a - b)
  const out = new Map()
  let last = -Infinity
  for (const v of sorted) out.set(v, (last = Math.max(v * sorted.length * gap, last + gap)))
  return out
}

// Desk centers relative to the pod corner: { w, d, at: Map(pane_id -> [x, z]) }.
function podLayout(panes, layout) {
  const rects = new Map((layout?.panes ?? []).map(p => [p.pane_id, p.rect]))
  const a = layout?.area
  const placed = panes.filter(p => rects.has(p.pane_id))
  const centers = placed.map(p => {
    const r = rects.get(p.pane_id)
    return [(r.x - a.x + r.width / 2) / a.width, (r.y - a.y + r.height / 2) / a.height]
  })
  const xs = spread(centers.map(c => c[0]), GAP_X)
  const zs = spread(centers.map(c => c[1]), GAP_Z)
  const at = new Map(placed.map((p, i) => [p.pane_id, [xs.get(centers[i][0]), zs.get(centers[i][1])]]))
  const rowZ = zs.size ? Math.max(...zs.values()) + GAP_Z : 0
  panes.filter(p => !rects.has(p.pane_id)).forEach((p, i) => at.set(p.pane_id, [i * GAP_X, rowZ]))

  const all = [...at.values()]
  const minX = Math.min(...all.map(c => c[0])), minZ = Math.min(...all.map(c => c[1]))
  for (const [id, [x, z]] of at) at.set(id, [x - minX + GAP_X / 2, z - minZ + GAP_Z / 2])
  return {
    w: Math.max(...all.map(c => c[0])) - minX + GAP_X,
    d: Math.max(...all.map(c => c[1])) - minZ + GAP_Z,
    at,
  }
}

// ---- Walk lanes: the free floor that an idle worker walks on, outside the pods. World coords. ----

const LANE = 0.3 // a walk rect reaches this far to each side of the route line
const R = (x0, z0, x1, z1) => [Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]
const sgn = (r) => (r.door.side === 'south' ? 1 : -1) // +1: the door is in the south wall, the corridor lies on the +z side
// Through a door (see door() in office.js): the leaf turns 1.1 rad into the room, hinged on the +s post, its tip at (door.x + s * 0.05,
// door.z - s * 0.96). The post is at 0.54 from the door center. A body reaches 0.39 to each side. So the worker crosses the wall
// 0.145 off the door center, away from the leaf, steps 0.33 into the room to 0.38 off the center, and then clears the leaf tip.
const doorX = (r) => r.door.x - sgn(r) * 0.145 // where the worker crosses the wall
const stepX = (r) => r.door.x - sgn(r) * 0.38 // where the worker walks past the leaf
const stepZ = (r) => r.door.z - sgn(r) * 0.33 // the depth of the sidestep
const bandZ = (r) => r.door.z + sgn(r) * (HALL / 2) // the center line of the corridor in front of the door
// The lane along the pod row on the door side: 0.4 below the deepest pod of the row, or 0.5 above the row. It stays 1.4 or more
// from the door wall, so a body on the lane (0.39 deep) clears the tip of the open leaf (0.96 deep).
const laneZ = (r, p) => (sgn(r) > 0 ? Math.min(Math.max(...r.pods.filter(q => q.z === p.z).map(q => q.z + q.d)) + 0.4, r.door.z - 1.4) : Math.max(p.z - 0.5, r.door.z + 1.4))

const kitchenZ = (k) => k.z + 1.9 // the strip in front of the counter. The spots stand 1.35 from the north wall. A walker (0.39 wide) passes 0.55 south of them, clear of a stander (0.15 deep). It is also clear of the leaf of a north door (0.96 deep).

function walkRects(r) {
  const x = doorX(r), y = stepX(r), j = stepZ(r)
  const door = [R(x - LANE, r.door.z, x + LANE, j), R(Math.min(x, y) - LANE, j - LANE, Math.max(x, y) + LANE, j + LANE)] // through the door, the sidestep
  if (r.kind === 'kitchen') { // the door lane, then the strip in front of the counter
    const z = kitchenZ(r), xs = [y, ...r.spots.map(p => p.x)], sz = r.spots[0].z
    return [...door, R(Math.min(...xs) - LANE, sz - LANE, Math.max(...xs) + LANE, z + LANE), R(y - LANE, j, y + LANE, z)] // the strip and the spots
  }
  const x0 = Math.min(y - LANE, ...r.pods.map(p => p.x)), x1 = Math.max(y + LANE, ...r.pods.map(p => p.x + p.w + 0.7))
  return r.pods.flatMap(p => {
    const z = laneZ(r, p), e = p.x + p.w, south = sgn(r) > 0
    return [
      R(x0, z - LANE, x1, z + LANE), // along the pod row
      ...door, R(y - LANE, j, y + LANE, z), // the door lane
      south ? R(e, p.z, e + 0.7, z + LANE) : R(e, z - LANE, e + 0.7, p.z + p.d), // east of the pod
      ...(south ? [R(p.x, p.z + p.d, e, z + LANE)] : []), // straight down from the last desk row
    ]
  })
}

// The way from the seat of a desk to a kitchen spot: [[x, z], ...] with axis-aligned segments. Out of the chair to the side,
// then to the lane behind the desk row, around the pod on its east side (the lamp post stands on the west side), along the pod
// row to the door lane, through the door on the free side of the leaf, along the corridor centers (a band corridor joins
// the others through the cross corridor), then in front of the counter.
// ponytail: a room with two pod rows (wider than MAX_ROW) may get a route across the lower pod row. It has no lane between the rows.
export function route(o, deskId, spot) {
  const d = o.desks.find(k => k.id === deskId), r = o.rooms.find(k => k.id === d.roomId), k = o.rooms.find(k => k.kind === 'kitchen')
  const p = r.pods.find(q => q.id === d.podId), z = laneZ(r, p), lane = d.z + 1.1, e = p.x + p.w + 0.4, x = doorX(r), y = stepX(r)
  const kz = bandZ(k), zr = Math.abs(bandZ(r) - kz) < 1e-6 ? kz : bandZ(r), X = o.corridors.at(-1), c = X.x + X.w / 2, kx = doorX(k), sz = kitchenZ(k)
  const down = sgn(r) > 0 && lane >= p.z + p.d - 1e-9 // the last desk row of a south door room walks straight down
  // ponytail: the worker stands up inside the chair and slides 0.65 aside through its edge (about 0.4 s at the start and at the end).
  // A clean exit needs a chair that moves, or a first step on the +z side of it.
  const sx = d.x + 0.65 // first aside, past the chair back (the chair is 0.5 wide, the body 0.5), then on
  const pts = [[d.x, d.z + 0.4], [sx, d.z + 0.4], ...(down ? [[sx, z]] : [[sx, lane], [e, lane], [e, z]]), [y, z], [y, stepZ(r)], [x, stepZ(r)], [x, zr]]
  if (zr !== kz) pts.push([c, zr], [c, kz])
  pts.push([kx, kz], [kx, stepZ(k)], [stepX(k), stepZ(k)], [stepX(k), sz], [spot.x, sz], [spot.x, spot.z])
  const out = []
  for (const q of pts) { // drop repeated points and the middle point of a straight run
    const b = out.at(-1), a = out.at(-2)
    if (b && b[0] === q[0] && b[1] === q[1]) continue
    if (a && ((a[0] === b[0] && b[0] === q[0]) || (a[1] === b[1] && b[1] === q[1]))) out.pop()
    out.push(q)
  }
  return out
}

// meetings: Claude Code sessions with running subagents, as the bridge sends them: [{ sessionId, cwd, agents: [...] }].
// prev: the previous office, so a subagent keeps its seat.
export function buildOffice(snap, meetings = [], prev = null) {
  const agents = new Map(snap.agents.map(a => [a.pane_id, a]))
  const byNumber = (a, b) => a.number - b.number
  const desks = []

  const rooms = [...snap.workspaces].sort(byNumber).map(ws => {
    const pods = []
    let px = 0, pz = 0, rowD = 0, innerW = 0
    // snap.tabs is in tab-bar order. tab.number is a creation counter, so it is no sort key.
    for (const tab of snap.tabs.filter(t => t.workspace_id === ws.workspace_id)) {
      const layout = snap.layouts.find(l => l.tab_id === tab.tab_id)
      const panes = snap.panes.filter(p => p.tab_id === tab.tab_id)
      const { w, d, at } = podLayout(panes, layout)
      if (px > 0 && px + w > MAX_ROW) { px = 0; pz += rowD + POD_GAP; rowD = 0 }
      const pod = {
        id: tab.tab_id, roomId: ws.workspace_id, label: tab.label, number: tab.number, status: null,
        x: px, z: pz, w, d, focusedPaneId: layout?.focused_pane_id ?? null, zoomed: layout?.zoomed ?? false,
      }
      const podDesks = panes.map(p => {
        const a = agents.get(p.pane_id)
        const [x, z] = at.get(p.pane_id)
        return {
          id: p.pane_id, roomId: ws.workspace_id, podId: tab.tab_id, terminalId: p.terminal_id,
          x: pod.x + x, z: pod.z + z,
          focused: p.pane_id === snap.focused_pane_id, label: p.label ?? null,
          cwd: p.foreground_cwd || p.cwd, title: p.terminal_title_stripped || '',
          status: a ? a.agent_status : 'unknown',
          agent: a ? {
            kind: a.agent ?? null, name: a.name ?? null, displayAgent: a.display_agent ?? null,
            status: a.agent_status, title: a.terminal_title_stripped || '', stateChangeSeq: a.state_change_seq,
          } : null,
        }
      })
      pod.status = tab.agent_status ?? rollup(podDesks.map(d => d.status))
      desks.push(...podDesks)
      pods.push(pod)
      px += w + POD_GAP
      rowD = Math.max(rowD, d)
      innerW = Math.max(innerW, px - POD_GAP)
    }
    return {
      id: ws.workspace_id, kind: 'workspace', label: ws.label, number: ws.number,
      status: ws.agent_status ?? rollup(desks.filter(d => d.roomId === ws.workspace_id).map(d => d.status)),
      x: 0, z: 0, w: Math.max(7, 2 * WALL + innerW), d: Math.max(6, 2 * WALL + pz + rowD), door: null, pods,
    }
  })
  // One meeting room per meeting, else the default one. A long side of the table seats at least 4.
  const side = (m) => Math.max(4, Math.ceil((m?.agents.length ?? 0) / 2))
  for (const m of meetings.length ? meetings : [null]) {
    const names = m && [...new Set(m.agents.map(a => a.workflow).filter(Boolean))].join(' + ')
    rooms.push({
      id: m ? `meeting:${m.sessionId}` : 'meeting', kind: 'meeting', label: m ? `Meeting · ${names || 'subagents'}` : 'Meeting',
      number: null, status: m ? 'working' : null, x: 0, z: 0, w: Math.max(8, TABLE(side(m)) + 2.6), d: 7, door: null, pods: [], ...(m && { session: m.sessionId }),
    })
  }
  for (const kind of ['kitchen', 'lobby']) {
    rooms.push({ id: kind, kind, label: kind[0].toUpperCase() + kind.slice(1), number: null, status: null, x: 0, z: 0, w: 8, d: 7, door: null, pods: [] })
  }

  // Bands along x: a north row of rooms, a corridor, a south row. Rows fill in room order and split where the
  // running width passes a row's share. The band count that makes the building closest to square wins.
  const sum = (rs, k) => rs.reduce((s, r) => s + r[k], 0)
  const total = sum(rooms, 'w')
  let plan = null
  for (let n = 2; n <= rooms.length; n += 2) {
    const rows = Array.from({ length: n }, () => [])
    let run = 0
    for (const r of rooms) { rows[Math.min(n - 1, Math.floor((run + r.w / 2) * n / total))].push(r); run += r.w }
    if (rows.some(row => !row.length)) continue
    const w = Math.max(...rows.map(row => sum(row, 'w')))
    const d = rows.reduce((s, row) => s + Math.max(...row.map(r => r.d)), 0) + n / 2 * HALL
    const score = Math.max((w + HALL) / d, d / (w + HALL))
    if (!plan || score < plan.score) plan = { score, rows, w }
  }

  // Rooms in a row touch and stretch to the building width and the row depth. Rows of two bands sit back to back.
  // A door sits in the middle of the wall to the corridor. Pods and desks stay centered in the room.
  const W = plan.w, corridors = []
  let z = 0
  plan.rows.forEach((row, i) => {
    const d = Math.max(...row.map(r => r.d)), extra = (W - sum(row, 'w')) / row.length
    let x = 0
    for (const r of row) {
      const iw = Math.max(0, ...r.pods.map(p => p.x + p.w)), ih = Math.max(0, ...r.pods.map(p => p.z + p.d))
      Object.assign(r, { x, z, w: r === row.at(-1) ? W - x : r.w + extra, d })
      r.door = { x: x + r.w / 2, z: i % 2 ? z : z + d, side: i % 2 ? 'north' : 'south' }
      const dx = x + (r.w - iw) / 2, dz = z + (d - ih) / 2
      for (const p of r.pods) { p.x += dx; p.z += dz }
      for (const k of desks) if (k.roomId === r.id) { k.x += dx; k.z += dz }
      x += r.w
    }
    z += d
    if (i % 2 === 0) { corridors.push({ x: 0, z, w: W, d: HALL }); z += HALL }
  })
  corridors.push({ x: W, z: 0, w: HALL, d: z }) // the cross corridor on the +x side links the band corridors

  // The kitchen counter stands against the north wall, 0.2 from the west wall (decor.js draws it from this). Idle workers
  // stand in a row in front of it, on spots at least 0.85 apart, 1.15 from the counter origin. A north door leaves less room.
  const kit = rooms.find(r => r.kind === 'kitchen'), len = Math.min(3.2, kit.door.side === 'north' ? kit.w / 2 - 1.4 : kit.w - 2.5)
  const n = Math.floor((len - 0.8) / 0.85) + 1
  kit.counter = { x: kit.x + 0.2 + len / 2, z: kit.z + 0.2, len }
  kit.spots = Array.from({ length: n }, (_, i) => ({ x: kit.x + 0.6 + (i * (len - 0.8)) / (n - 1), z: kit.z + 1.35 }))
  for (const r of rooms) if (r.kind === 'workspace' || r === kit) r.walk = walkRects(r) // decor.js keeps props off them

  // Meeting tables: centered, a chair at the head (the -x end: a back wall, so the orchestrator faces the camera) and
  // along both long sides. A seat is the origin of a desk-like group: it faces -z before rot quarter turns, the table
  // edge 0.05 and the chair 0.5 behind it. The orchestrator takes the head seat. A subagent keeps its seat from prev, so
  // a leaver leaves an empty chair and nobody moves. A new subagent takes the free seat nearest the head.
  const subagents = [], had = new Map(prev?.subagents.map(s => [s.id, s.seat]))
  rooms.filter(r => r.kind === 'meeting').forEach((r, i) => {
    const m = meetings[i], k = side(m), len = TABLE(k), x = r.x + r.w / 2, z = r.z + r.d / 2
    r.table = { x, z, len }
    r.seats = [{ x: x - len / 2 + 0.05, z, rot: 3 }]
    for (let j = 0; j < k; j++) for (const [dz, rot] of [[-0.55, 2], [0.55, 0]]) r.seats.push({ x: x + (j - (k - 1) / 2) * SEAT, z: z + dz, rot })
    if (!m) return
    // ponytail: heuristic, the session's herdr pane is a claude desk in its cwd, a working one first.
    const orch = desks.filter(d => d.agent?.kind === 'claude' && d.cwd === m.cwd).sort((a, b) => (b.status === 'working') - (a.status === 'working'))[0]
    if (orch) orch.away = { roomId: r.id, ...r.seats[0] }
    const taken = new Set([0]), seat = new Map()
    for (const a of m.agents) { const j = had.get(a.agentId); if (j < r.seats.length && !taken.has(j)) { taken.add(j); seat.set(a.agentId, j) } }
    for (const a of m.agents) {
      let j = seat.get(a.agentId)
      if (j === undefined) { j = 1; while (taken.has(j)) j++; taken.add(j) }
      subagents.push({
        id: a.agentId, roomId: r.id, ...r.seats[j], seat: j, sessionId: m.sessionId, deskId: orch?.id ?? null,
        label: a.label, phase: a.phase, model: a.model, workflow: a.workflow, runId: a.runId,
      })
    }
  })

  const lobby = rooms.at(-1) // the last room, so it sits in the last row, on the outer +z wall
  const counts = { blocked: 0, done: 0, working: 0, idle: 0, unknown: 0 }
  for (const d of desks) if (d.agent) counts[d.agent.status]++

  return {
    rooms, desks, counts, subagents,
    focus: { workspaceId: snap.focused_workspace_id, tabId: snap.focused_tab_id, paneId: snap.focused_pane_id },
    bounds: { w: W + HALL, d: z }, corridors,
    entrance: { x: lobby.x + lobby.w / 2, z }, // in the lobby's outer +z wall
  }
}

// ---- Idle breaks: how long a worker walks and waits. The scene draws it, the model keeps the numbers pure. ----

export const WALK = 1.6, RUN = 4 // world units a second
// How free the arms of a walker are, from the distance to the nearest door center: 0 up to 1.4, 1 from 2.0. An open leaf reaches 0.96
// into the room, so near a door the arms hang and the mug hand stays low (stroll() in office.js).
export const calm = (dd) => Math.min(1, Math.max(0, (dd - 1.4) / 0.6))
export const hash = (s, m = 360) => [...(s ?? '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % m, 0)

// The browse wait before trip n and the stay in the kitchen, in seconds, for one idle stretch. The first trip comes sooner.
export function breakPlan(seed, n) {
  const u = (i) => { // a mixed number in [0, 1) for each plan value i
    let h = Math.imul((seed ^ Math.imul(n + 1, 0x9e3779b1)) + i * 0x85ebca6b, 0xc2b2ae35)
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296
  }
  const [lo, hi] = n ? [20, 60] : [5, 30]
  return { wait: lo + u(0) * (hi - lo), stay: 6 + u(1) * 9 }
}

// The point at distance s on a polyline (s is clamped) and the unit direction of its segment.
export function along(path, s) {
  let left = Math.max(0, s), seg = null
  for (let i = 1; i < path.length; i++) {
    const [x0, z0] = path[i - 1], [x1, z1] = path[i], l = Math.hypot(x1 - x0, z1 - z0)
    if (!l) continue
    seg = { dx: (x1 - x0) / l, dz: (z1 - z0) / l }
    if (left <= l) return { x: x0 + seg.dx * left, z: z0 + seg.dz * left, ...seg }
    left -= l
  }
  const [x, z] = path.at(-1) // past the end, or a rest of float noise: the last point
  return { x, z, ...seg }
}

// A trip { len, start, stay, rush? } at time t: s is the distance from the desk along the route. out, stay, back, done.
// rush: the time when the status left idle. The worker then runs back from where it is.
export function tripAt({ len, start, stay, rush }, t) {
  const out = len / WALK
  const at = (u) => (u < out ? ['out', u * WALK] : u < out + stay ? ['stay', len] : u < 2 * out + stay ? ['back', len - (u - out - stay) * WALK] : ['done', 0])
  const [phase, s] = at(Math.max(0, t - start))
  if (rush == null || t < rush) return { s, phase }
  const left = at(Math.max(0, rush - start))[1] - RUN * (t - rush)
  return left > 0 ? { s: left, phase: 'rush' } : { s: 0, phase: 'done' }
}

export const pathLen = (path) => path.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - path[i][0], q[1] - path[i][1]), 0)

// The trip bookkeeping of one worker, once a frame. trips: desk id -> { n, next, trip }, n is the next trip, next is when it starts
// and trip is the one that runs now. claimed: kitchen spot index -> desk id, so two workers never stand on one spot.
// idle: the worker may take a break. spots: how many kitchen spots. route(i): the path to spot i.
// Returns { s, phase, got, trip } for a worker on a trip, or null for a worker at the desk.
export function stepBreak(trips, claimed, id, { idle, seed, spots, route }, t) {
  let b = trips.get(id)
  if (!b) {
    if (!idle) return null
    trips.set(id, b = { n: 0, next: t + breakPlan(seed, 0).wait, trip: null })
  }
  if (!b.trip) {
    if (!idle) return trips.delete(id), null
    if (t < b.next) return null
    const free = Array.from({ length: spots }, (_, i) => (i + seed) % spots).find((i) => !claimed.has(i)) // from a start that differs for each worker
    if (free === undefined) { b.next = t + breakPlan(seed, ++b.n).wait; return null } // no free spot: keep browsing
    claimed.set(free, id)
    const path = route(free)
    b.trip = { len: pathLen(path), start: t, stay: breakPlan(seed, b.n).stay, path, spot: free, got: false }
  }
  const trip = b.trip
  if (!idle && trip.rush == null) trip.rush = t // the status changed: run back
  const { s, phase } = tripAt(trip, t)
  if (phase === 'done') {
    claimed.delete(trip.spot)
    b.trip = null
    if (idle && trip.rush == null) b.next = t + breakPlan(seed, ++b.n).wait
    else trips.delete(id) // after a rush the next idle stretch starts fresh
    return null
  }
  if (phase === 'stay') trip.got = true
  return { s, phase, got: trip.got, trip }
}

// A worker leaves the idle breaks for good (it moves to a meeting seat): drop its state and free its spot.
export function endBreak(trips, claimed, id) {
  const spot = trips.get(id)?.trip?.spot
  if (spot !== undefined) claimed.delete(spot)
  trips.delete(id)
}

// ---- Demo: a fake session with the same shape as a real snapshot. ----

const AREA = { x: 30, y: 1, width: 200, height: 60 }
const CYCLE = ['working', 'blocked', 'done', 'idle']
const DEMO_WORKSPACES = { w1: 'api', w2: 'web', w3: 'docs', w4: 'infra' }
const DEMO_TABS = { 'w1:t1': 'server', 'w2:t1': 'app', 'w2:t2': 'tests', 'w3:t1': 'notes', 'w4:t1': 'deploy', 'w4:t2': 'ops' }
// pane id, tab id, agent kind (null = shell), rect [x, y, w, h] in cells inside AREA, status phase, agent name, long idle.
// Outside the focused tab w1:t1, phases 0, 3, 6 and 9 sit one cycle step apart, so every tick shows all four CYCLE statuses.
// The focused tab never shows done. Its phases give the idle agent while w4:p1 is still unknown.
// A long-idle agent ([idle ticks, start tick in its cycle]) ignores the phase: it idles for a long time, so it goes on kitchen
// trips. Then it works 20 s, waits for the user 15 s and finishes 15 s. The two idle times differ, so one trip finishes and a
// status change cuts the other short. The routes in the demo are 56 to 68 units long: a full trip takes about 100 s.
const DEMO_PANES = [
  ['w1:p1', 'w1:t1', 'claude', [0, 0, 100, 30], 1, 'lead'],
  ['w1:p2', 'w1:t1', 'codex', [100, 0, 100, 30], 5],
  ['w1:p3', 'w1:t1', null, [0, 30, 100, 30]],
  ['w1:p4', 'w1:t1', 'gemini', [100, 30, 100, 30], 10],
  ['w2:p1', 'w2:t1', 'opencode', [0, 0, 100, 60], 6],
  ['w2:p2', 'w2:t1', 'claude', [100, 0, 100, 60], 0, 'review', [110, 0]],
  ['w2:p3', 'w2:t2', 'claude', [0, 0, 200, 60], 0, 'tester'],
  ['w3:p1', 'w3:t1', 'codex', [0, 0, 100, 60], 3],
  ['w3:p2', 'w3:t1', null, [100, 0, 100, 30]],
  ['w3:p3', 'w3:t1', 'opencode', [100, 30, 100, 30], 0, null, [200, 170]],
  ['w4:p1', 'w4:t1', 'gemini', [0, 0, 200, 60], 9],
  ['w4:p2', 'w4:t2', null, [0, 0, 200, 60]],
]

export function demoSnapshot(tick) {
  const panes = [], agents = [], layouts = []
  DEMO_PANES.forEach(([id, tab, kind, r, phase, name, long], i) => {
    const ws = id.split(':')[0]
    const step = Math.floor((tick + phase) / 3)
    // w4:p1 is a new agent: herdr reports unknown during its first 3 s.
    let status = !kind || (id === 'w4:p1' && tick < 3) ? 'unknown' : CYCLE[step % 4]
    // herdr bumps one server-wide counter on each state change. done -> idle only marks the pane seen, so the seq stays.
    let changed = tick - (tick + phase) % 3 - (step % 4 === 3 ? 3 : 0) // the tick of the last state change
    if (long) {
      const [idle, from] = long, k = (tick + from) % (idle + 50), p = [['idle', 0], ['working', idle], ['blocked', idle + 20], ['done', idle + 35]].findLast(([, at]) => k >= at)
      status = p[0]
      changed = tick - k + (p[0] === 'idle' ? -15 : p[1]) // idle follows done, so the last change was 15 ticks before the cycle start
    }
    // herdr marks a completion in the active tab as seen at once, so it shows idle there.
    if (status === 'done' && tab === 'w1:t1') status = 'idle'
    const title = kind ? `${kind} ${status}` : 'zsh'
    const cwd = `/home/demo/${DEMO_WORKSPACES[ws]}`
    const pane = {
      pane_id: id, terminal_id: `term_demo${i}`, workspace_id: ws, tab_id: tab, focused: id === 'w1:p1',
      cwd, foreground_cwd: cwd, ...(kind && { agent: kind }), agent_status: status,
      terminal_title: title, terminal_title_stripped: title,
      scroll: { offset_from_bottom: 0, max_offset_from_bottom: 0, viewport_rows: r[3] }, revision: tick,
    }
    panes.push(pane)
    if (kind) {
      agents.push({
        pane_id: id, terminal_id: pane.terminal_id, workspace_id: ws, tab_id: tab, agent: kind, ...(name && { name }),
        agent_status: status, focused: pane.focused, cwd, foreground_cwd: cwd,
        terminal_title: title, terminal_title_stripped: title,
        state_change_seq: (changed + 400) * 16 + i, revision: tick, // + 400 keeps it positive, * 16 + i breaks ties
      })
    }
    let layout = layouts.find(l => l.tab_id === tab)
    if (!layout) layouts.push(layout = { workspace_id: ws, tab_id: tab, zoomed: false, focused_pane_id: id, area: AREA, panes: [], splits: [] })
    layout.panes.push({ pane_id: id, focused: id === layout.focused_pane_id, rect: { x: AREA.x + r[0], y: AREA.y + r[1], width: r[2], height: r[3] } })
  })

  const statuses = id => panes.filter(p => p.workspace_id === id || p.tab_id === id).map(p => p.agent_status)
  const tabs = Object.entries(DEMO_TABS).map(([tab_id, label]) => ({
    tab_id, workspace_id: tab_id.split(':')[0], number: Number(tab_id.split(':t')[1]), label, focused: tab_id === 'w1:t1',
    pane_count: statuses(tab_id).length, agent_status: rollup(statuses(tab_id)),
  }))
  const workspaces = Object.entries(DEMO_WORKSPACES).map(([workspace_id, label], i) => {
    const mine = tabs.filter(t => t.workspace_id === workspace_id)
    return {
      workspace_id, number: i + 1, label, focused: workspace_id === 'w1', pane_count: statuses(workspace_id).length,
      tab_count: mine.length, active_tab_id: mine[0].tab_id, agent_status: rollup(statuses(workspace_id)),
    }
  })
  return {
    version: 'demo', protocol: 20, focused_workspace_id: 'w1', focused_tab_id: 'w1:t1', focused_pane_id: 'w1:p1',
    workspaces, tabs, panes, layouts, agents,
  }
}

// One meeting: the lead (w1:p1, cwd /home/demo/api) runs a workflow with 4 agents. Each agent works 26 ticks, then
// its seat stays empty for 4 ticks and a new agent starts. The empty ticks of the 4 never overlap.
const DEMO_AGENTS = [['build:model', 'Build', 'sonnet'], ['build:bridge', 'Build', 'opus'], ['build:scene', 'Build', 'haiku'], ['review', 'Review', 'opus']]
export function demoMeetings(tick) {
  const agents = DEMO_AGENTS.flatMap(([label, phase, model], i) => {
    const t = tick + i * 8, run = Math.floor(t / 30)
    return t % 30 < 26 ? [{ agentId: `demo${i}r${run}`, label, phase, model, workflow: 'demo-build', runId: 'wf_demo' }] : []
  })
  return [{ sessionId: 'demo', cwd: '/home/demo/api', agents }]
}
