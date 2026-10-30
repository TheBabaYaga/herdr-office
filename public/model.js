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

// A worker first steps 0.65 to the side of its chair, past the chair back (the chair is 0.5 wide, the body 0.5).
const asideX = (d) => d.x + 0.65
// A desk of the last row of its pod in a south-door room walks straight down to the lane: the lane behind it is at or past the pod edge.
const lastRow = (d, p) => d.z + 1.1 >= p.z + p.d - 1e-9
const kitchenZ = (k) => k.z + 1.9 // the strip in front of the counter. The spots stand 1.35 from the north wall. A walker (0.39 wide) passes 0.55 south of them, clear of a stander (0.15 deep). It is also clear of the leaf of a north door (0.96 deep).
// The strip between the door and the dance floor: d / 2 - 1.5 from the door wall, so 1.5 or more. The front row of dance spots is 1.0 behind it.
const partyZ = (r) => r.z + r.d / 2 + sgn(r) * 1.5
// The main walk line of a room: the line that the door lane meets. In a workspace room, it is the lane of the pod row nearest to the door.
const mainZ = (r) => r.kind === 'kitchen' ? kitchenZ(r) : r.kind === 'party' ? partyZ(r) : laneZ(r, r.pods.reduce((a, p) => (sgn(r) * (p.z - a.z) > 0 ? p : a)))
const hits = (a, b) => a[0] < b[2] - 1e-9 && b[0] < a[2] - 1e-9 && a[1] < b[3] - 1e-9 && b[1] < a[3] - 1e-9 // two rects [x0, z0, x1, z1] overlap

// desks: the desks of the room, for the lane below each last-row desk of a south-door room.
// In the kitchen the strip also reaches each chair, and a lane runs from the strip to each chair.
function walkRects(r, desks) {
  const x = doorX(r), y = stepX(r), j = stepZ(r)
  const door = [R(x - LANE, r.door.z, x + LANE, j), R(Math.min(x, y) - LANE, j - LANE, Math.max(x, y) + LANE, j + LANE)] // through the door, the sidestep
  if (r.kind === 'kitchen' || r.kind === 'party') { // the door lane, then the strip in front of the counter or the dance floor
    const z = r.kind === 'kitchen' ? kitchenZ(r) : partyZ(r), seats = r.chairs ?? [], xs = [y, ...r.spots.map(p => p.x), ...seats.map(c => c.x)], zs = [z, ...r.spots.map(p => p.z)]
    return [...door, R(Math.min(...xs) - LANE, Math.min(...zs) - LANE, Math.max(...xs) + LANE, Math.max(...zs) + LANE), R(y - LANE, j, y + LANE, z), ...seats.map(c => R(c.x - LANE, z, c.x + LANE, c.z))] // the strip and the spots, the door lane, the chair lanes
  }
  const x0 = Math.min(y - LANE, ...r.pods.map(p => p.x)), x1 = Math.max(y + LANE, ...r.pods.map(p => p.x + p.w + 0.7))
  return r.pods.flatMap(p => {
    const z = laneZ(r, p), e = p.x + p.w, south = sgn(r) > 0
    return [
      R(x0, z - LANE, x1, z + LANE), // along the pod row
      ...door, R(y - LANE, j, y + LANE, z), // the door lane
      south ? R(e, p.z, e + 0.7, z + LANE) : R(e, z - LANE, e + 0.7, p.z + p.d), // east of the pod
      ...(south ? desks.filter(d => d.podId === p.id && lastRow(d, p)).map(d => R(asideX(d) - LANE, p.z + p.d, asideX(d) + LANE, z + LANE)) : []), // straight down from each last-row desk
    ]
  })
}

// Game tables, in the order of the search. fx: the half width of the footprint (chess: the rug and the chairs with their backs,
// ping-pong: the players). The footprint of each kind is 1.2 deep. half: a place is this far west and east of the table center.
// A lane to a place never crosses the table top: the chess top reaches 0.35 from the center, the ping-pong top 1.1.
const GAMES = [['pingpong', 1.75, 1.55], ['chess', 0.95, 0.62]]
const BIG = 80, PAD = 0.3 // a big room has this much free floor (m²). PAD: the gap round a table, as in placer() in decor.js
// The game tables of a big workspace room or a big party room: a ping-pong table and a chess table if both fit, else the one that fits.
// The search tries centers on a 0.25 grid, nearest to the main walk line first, on both sides of it. A table with its PAD stays inside
// the room and off the pods, the lamp posts, the door area, the dance floor, the booth, the walk rects, and the other table. The main
// walk line then reaches the x of each place, and a lane runs from it to each place. These rects go into r.walk. Each lane keeps off the
// pods, the door area, the dance floor, the booth, and the other table, 0.4 from each lamp post, and 1.0 from each dance spot.
// The main walk line already crosses the door area and touches the dance floor, so only the lanes get that test. Returns [{ kind, x, z, places }].
// ponytail: a grid search, 16 centers for each m² and each kind. A table that fits only between two grid points is lost.
function games(r) {
  const area = r.pods.reduce((a, p) => a + p.w * p.d, 0)
  if (!(r.kind === 'party' || (r.kind === 'workspace' && r.pods.length)) || r.w * r.d - area < BIG) return [] // a room with no pods has no main walk line
  const s = sgn(r), mz = mainZ(r), y = stepX(r), E = 1e-9
  const zone = [
    R(r.door.x - 1.2, r.door.z, r.door.x + 1.2, r.door.z - s * 2), // the door area with the open leaf
    ...(r.kind === 'party' ? [r.floor, [r.booth.x - 1.8, r.booth.z - 0.45, r.booth.x + 1.8, r.booth.z + 0.45]] : []), // with the speakers
  ]
  const keep = [
    ...r.pods.map((p) => [p.x - PAD, p.z - PAD, p.x + p.w + PAD, p.z + p.d + PAD]),
    ...r.pods.map((p) => [p.x - 0.65, p.z + 0.25, p.x - 0.35, p.z + 0.55]), // the lamp post (LAMP in decor.js), 0.3 wide
    ...zone,
  ]
  // A lane rect reaches LANE to each side of its line. So a lane that misses these rects keeps its line 0.4 from a lamp post, 1.0 from a dance spot.
  const posts = [...r.pods.map((p) => [p.x - 0.6, p.z + 0.3, p.x - 0.4, p.z + 0.5]), ...(r.spots ?? []).map((q) => [q.x - 0.7, q.z - 0.7, q.x + 0.7, q.z + 0.7])]
  const at = []
  for (let i = 0; i * 0.25 <= r.w + E; i++) for (let j = 0; j * 0.25 <= r.d + E; j++) at.push([r.x + i * 0.25, r.z + j * 0.25])
  at.sort((a, b) => Math.abs(a[1] - mz) - Math.abs(b[1] - mz) || a[0] - b[0])
  const out = []
  for (const [kind, fx, half] of GAMES) {
    const block = [...keep, ...r.walk, ...out.map((g) => g.core)], avoid = [...posts, ...out.map((g) => g.foot)]
    for (const [x, z] of at) {
      const f = [x - fx - PAD, z - 0.6 - PAD, x + fx + PAD, z + 0.6 + PAD], px = [x - half, x + half]
      if (f[0] < r.x - E || f[1] < r.z - E || f[2] > r.x + r.w + E || f[3] > r.z + r.d + E) continue
      if (block.some((k) => hits(f, k))) continue
      const line = R(Math.min(y, px[0]) - LANE, mz - LANE, Math.max(y, px[1]) + LANE, mz + LANE), lanes = px.map((q) => R(q - LANE, mz, q + LANE, z))
      if (hits(f, line) || lanes.some((l) => [...zone, ...r.pods.map((p) => [p.x, p.z, p.x + p.w, p.z + p.d])].some((k) => hits(l, k)))) continue
      if ([line, ...lanes].some((l) => avoid.some((k) => hits(l, k)))) continue
      r.walk.push(line, ...lanes)
      out.push({ kind, x, z, places: [{ x: px[0], z, rot: 3 }, { x: px[1], z, rot: 1 }], foot: f, core: [x - fx, z - 0.6, x + fx, z + 0.6] })
      break
    }
  }
  return out.map(({ kind, x, z, places }) => ({ kind, x, z, places }))
}

// The way from the seat of a desk to a spot in the room `to` (the kitchen, the party room, or the room of a game table): [[x, z], ...] with axis-aligned
// segments. Out of the chair to the side, then to the lane behind the desk row, around the pod on its east side (the lamp post
// stands on the west side), along the pod row to the door lane, through the door on the free side of the leaf, along the corridor
// centers (a band corridor joins the others through the cross corridor), then along the strip in front of the counter or the dance floor.
// A lunch route is a kitchen route to a chair: from the strip it goes straight to the chair point, 0.8 beside the table.
// A game route goes along the main walk line of the target room to the x of the place, then straight to the place. A desk in the room
// of the table does not cross the door: it goes along the door lane to the main walk line.
// ponytail: a room with two pod rows (wider than MAX_ROW) may get a route across the lower pod row. It has no lane between the rows.
export function route(o, deskId, spot, to = 'kitchen') {
  const d = o.desks.find(k => k.id === deskId), r = o.rooms.find(k => k.id === d.roomId), k = o.rooms.find(k => k.id === to)
  const p = r.pods.find(q => q.id === d.podId), z = laneZ(r, p), lane = d.z + 1.1, e = p.x + p.w + 0.4, x = doorX(r), y = stepX(r)
  const kz = bandZ(k), zr = Math.abs(bandZ(r) - kz) < 1e-6 ? kz : bandZ(r), X = o.corridors.at(-1), c = X.x + X.w / 2, kx = doorX(k), sz = mainZ(k)
  const down = sgn(r) > 0 && lastRow(d, p) // the last desk row of a south door room walks straight down
  // ponytail: the worker stands up inside the chair and slides 0.65 aside through its edge (about 0.4 s at the start and at the end).
  // A clean exit needs a chair that moves, or a first step on the +z side of it.
  const sx = asideX(d) // first aside, past the chair back, then on
  const pts = [[d.x, d.z + 0.4], [sx, d.z + 0.4], ...(down ? [[sx, z]] : [[sx, lane], [e, lane], [e, z]]), [y, z]]
  if (r === k) pts.push([y, sz]) // the own room: along the door lane to the main walk line
  else {
    pts.push([y, stepZ(r)], [x, stepZ(r)], [x, zr])
    if (zr !== kz) pts.push([c, zr], [c, kz])
    pts.push([kx, kz], [kx, stepZ(k)], [stepX(k), stepZ(k)], [stepX(k), sz])
  }
  pts.push([spot.x, sz], [spot.x, spot.z])
  const out = []
  for (const q of pts) { // drop repeated points and the middle point of a straight run
    const b = out.at(-1), a = out.at(-2)
    if (b && b[0] === q[0] && b[1] === q[1]) continue
    if (a && ((a[0] === b[0] && b[0] === q[0]) || (a[1] === b[1] && b[1] === q[1]))) out.pop()
    out.push(q)
  }
  return out
}

// Corridor candelabra: a spot every 4 along each corridor, in turn on its two edges, 0.4 in. A spot near a door on its edge, or in a band corridor mouth, is dropped.
export function candleSpots(o) {
  const X = o.corridors.at(-1), bands = o.corridors.slice(0, -1), out = []
  for (const c of o.corridors) {
    const cross = c === X, len = cross ? c.d : c.w
    for (let i = 0, t = 2; t <= len - 2; i++, t += 4) {
      const e = i % 2 ? 0.4 : (cross ? c.w : c.d) - 0.4, x = cross ? c.x + e : c.x + t, z = cross ? c.z + t : c.z + e
      // The sign of a north door falls west of the door on the floor, seen from the camera. So it skips 3.0 west, on both edges.
      const doorNear = o.rooms.some(r => {
        const a = cross ? z - r.door.z : x - r.door.x, north = r.door.side === 'north' && !cross
        return (north ? Math.abs(r.door.z - z) < 3 : Math.abs(cross ? r.door.x - x : r.door.z - z) < 0.5) && a < 1.3 && a > (north ? -3 : -1.3)
      })
      const mouth = cross && bands.some(b => z >= b.z - 0.4 && z <= b.z + b.d + 0.4)
      if (!doorNear && !mouth) out.push({ x, z, axis: cross ? 'z' : 'x' })
    }
  }
  return out
}

// One strike: the wait in seconds and one or two flashes. rand() draws: wait, count, len, then at and len of the second flash.
export function lightningPlan(rand = Math.random) {
  const wait = 20 + 40 * rand(), two = rand() < 0.5
  const flashes = [{ at: 0, len: 0.08 + 0.04 * rand(), power: 1 }]
  if (two) flashes.push({ at: 0.3 + 0.3 * rand(), len: 0.08 + 0.04 * rand(), power: 0.6 })
  return { wait, flashes }
}

// The flash power s seconds after the strike start, or 0 between flashes.
export function flash(plan, s) {
  const f = plan.flashes.find(f => s >= f.at && s < f.at + f.len)
  return f ? f.power : 0
}

// A seeded random number in [0, 1) for each call (mulberry32), so a room or a rect gets the same result in each build.
export const rng = (s) => () => {
  s = (s + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// The snow of one rect { x, z, w, d }: [{ x, z, phase }]. A grid of cells of about 2 m² with one flake at a random point of each cell, 0.3 in from each edge.
// The seed comes from the rect, so the same rect gives the same flakes.
export function snowflakes(t) {
  const x0 = t.x + 0.3, z0 = t.z + 0.3, W = t.w - 0.6, D = t.d - 0.6
  const cols = Math.max(1, Math.round(W / Math.SQRT2)), rows = Math.max(1, Math.round(D / Math.SQRT2))
  const r = rng(hash(`${t.x},${t.z},${t.w},${t.d}`, 1e9))
  const out = []
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++)
      out.push({ x: x0 + (i + r()) * W / cols, z: z0 + (j + r()) * D / rows, phase: r() })
  return out
}

// The outdoor snow area: 4 rects { x, z, w, d } in a band round the slab. The slab reaches 0.3 past the building. The band is half the longer side plus 3 wide, so the flakes fill the screen corners at the min zoom.
export function outdoors({ w, d }) {
  const P = 0.3, M = Math.max(w, d) / 2 + 3
  return [
    { x: -P - M, z: -P - M, w: w + 2 * P + 2 * M, d: M },
    { x: -P - M, z: d + P, w: w + 2 * P + 2 * M, d: M },
    { x: -P - M, z: -P, w: M, d: d + 2 * P },
    { x: w + P, z: -P, w: M, d: d + 2 * P },
  ]
}

// The place { x, y, z } of one flake at s seconds: it falls from 2.6 to 0 at 0.3 a second, then starts again, and drifts 0.1 in x.
export function flakeAt(f, s) {
  return {
    x: f.x + 0.1 * Math.sin(s + 6 * f.phase),
    y: 2.6 * (1 - ((0.3 * s / 2.6 + f.phase) % 1)),
    z: f.z,
  }
}

// The halo opacity of one tree bulb at s seconds: 0.1 to 0.6 in about 4.2 s. amp 0.5 (reduce motion) gives 0.225 to 0.475.
export const twinkle = (ph, s, amp = 1) => 0.35 + 0.25 * amp * Math.sin(1.5 * s + ph)

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
  // The party room fills the spare width of the row with the most spare width (the first on a tie), if that width is 7 or more.
  // It is the last room of its row, or the room just before the lobby. The other rooms of its row then keep their width.
  const spare = plan.rows.map(row => plan.w - sum(row, 'w')), best = spare.indexOf(Math.max(...spare))
  if (spare[best] >= 7) {
    const row = plan.rows[best]
    row.splice(row.at(-1).kind === 'lobby' ? -1 : row.length, 0, { id: 'party', kind: 'party', label: 'Party', number: null, status: null, x: 0, z: 0, w: spare[best], d: 6, door: null, pods: [] }) // d 6: the row sets the depth
    rooms.splice(0, rooms.length, ...plan.rows.flat()) // the rows keep the room order, so the lobby stays the last room
  }

  // Rooms in a row touch and share the row depth. Rows of two bands sit back to back. A row with 4 or more spare width keeps its
  // room widths, and a terrace (a garden, not a room) fills the spare width at its east end, up to the cross corridor. Each other
  // row stretches its rooms to the building width. The party row has no spare width left. A door sits in the middle of the wall
  // to the corridor. Pods and desks stay centered in the room.
  const W = plan.w, corridors = [], terraces = []
  let z = 0
  plan.rows.forEach((row, i) => {
    const d = Math.max(...row.map(r => r.d)), left = W - sum(row, 'w'), yard = left >= 4 - 1e-6, extra = yard ? 0 : left / row.length
    let x = 0
    for (const r of row) {
      const iw = Math.max(0, ...r.pods.map(p => p.x + p.w)), ih = Math.max(0, ...r.pods.map(p => p.z + p.d))
      Object.assign(r, { x, z, w: r === row.at(-1) && !yard ? W - x : r.w + extra, d })
      r.door = { x: x + r.w / 2, z: i % 2 ? z : z + d, side: i % 2 ? 'north' : 'south' }
      const dx = x + (r.w - iw) / 2, dz = z + (d - ih) / 2
      for (const p of r.pods) { p.x += dx; p.z += dz }
      for (const k of desks) if (k.roomId === r.id) { k.x += dx; k.z += dz }
      x += r.w
    }
    if (yard) terraces.push({ id: `terrace:${i}`, x, z, w: W - x, d })
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
  // Two cafe tables for a lunch, off west and east of the room middle, 0.3 south of it. A chair stands 0.8 west (rot 3, faces +x) and
  // 0.8 east (rot 1, faces -x) of each table. Its back reaches 0.45 behind the chair point. The tables stay south of the strip.
  // A north door lane ends at the strip, so off is 1.3: the inner chairs stand 1.0 apart, and the east chair keeps away from the east
  // wall, which hides a seated worker near it. A south door lane runs through the middle, and a walker on it reaches 0.77 west of the
  // middle. The back of the inner west chair reaches off - 1.25 west of the middle, so off is 2.1 (2.02 or more).
  const off = kit.door.side === 'north' ? 1.3 : 2.1
  kit.tables = [-off, off].map((x) => ({ x: kit.x + kit.w / 2 + x, z: kit.z + kit.d / 2 + 0.3 }))
  kit.chairs = kit.tables.flatMap((t, i) => [{ x: t.x - 0.8, z: t.z, rot: 3, table: i }, { x: t.x + 0.8, z: t.z, rot: 1, table: i }])
  // Two workers chat at the water cooler on the north wall, east of the counter: 0.9 apart, 1.35 from the wall, the west spot 0.8
  // east of the door lane. They face each other (rot 3 and 1), and the cooler origin stands between them, 0.2 from the wall.
  kit.chat = [0, 0.9].map((dx, i) => ({ x: stepX(kit) + 0.8 + dx, z: kit.z + 1.35, rot: 3 - 2 * i }))
  kit.cooler = { x: stepX(kit) + 1.25, z: kit.z + 0.2 }
  // The party room: a front row of dance spots 2.0 apart, 0.5 to the door side of the room middle, then a back row 1.0 deeper with
  // each spot between two front spots. The dance floor reaches from the strip to 1.0 behind the back row, in whole 1 x 1 tiles.
  // The DJ booth stands behind the floor, and its front faces the dancers and the door.
  const party = rooms.find(r => r.kind === 'party')
  if (party) {
    const s = sgn(party), cx = party.x + party.w / 2, zm = party.z + party.d / 2, zb = zm - s * 0.5, nf = Math.floor((party.w - 3) / 2) + 1
    const line = (k, z) => Array.from({ length: k }, (_, i) => ({ x: cx + (i - (k - 1) / 2) * 2, z }))
    party.spots = [...line(nf, zm + s * 0.5), ...line(nf - 1, zb)]
    party.floor = R(party.spots[0].x - 1, partyZ(party), party.spots[nf - 1].x + 1, zb - s)
    party.booth = { x: cx, z: zb - s * 1.6, rot: s > 0 ? 0 : 2 }
  }
  for (const r of rooms) if (r.kind === 'workspace' || r === kit || r === party) r.walk = walkRects(r, desks) // decor.js keeps props off them
  for (const r of rooms) r.games = games(r) // after the walk rects: a table keeps off them, and its lanes join them

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
    bounds: { w: W + HALL, d: z }, corridors, terraces,
    games: rooms.flatMap((r) => r.games.map((g) => ({ room: r.id, ...g }))), // table t is games[t]
    entrance: { x: lobby.x + lobby.w / 2, z }, // in the lobby's outer +z wall
  }
}

// ---- Idle breaks: how long a worker walks and waits. The scene draws it, the model keeps the numbers pure. ----

export const WALK = 1.6, RUN = 4 // world units a second
export const WAIT = 20 // a worker at a game table or the cooler waits this long (s) after it arrives. If nobody joins in that time, it walks back
// How free the arms of a walker are, from the distance to the nearest door center: 0 up to 1.4, 1 from 2.0. An open leaf reaches 0.96
// into the room, so near a door the arms hang and the mug hand stays low (stroll() in office.js).
export const calm = (dd) => Math.min(1, Math.max(0, (dd - 1.4) / 0.6))
// The ids of the rooms whose door the walker of desk d opens, at a = { x, z, phase, room }: its own room and its target room a.room,
// within 3 of the door center. A runner needs about 0.4 s from 3 to the sweep of the leaf (the door lane, about 1.35 from the center),
// so the door has time to open. Another door in a corridor stays closed. In the stay the door of the target room closes.
// A walker to a game table in its own room never leaves the room, so it opens no door.
export const opens = (o, d, a) => a.phase === 'stay' || a.room === d.roomId ? [] :
  o.rooms.filter((r) => (r.id === d.roomId || r.id === a.room) && Math.hypot(a.x - r.door.x, a.z - r.door.z) < 3).map((r) => r.id)
export const hash = (s, m = 360) => [...(s ?? '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % m, 0)
// Halloween is 24 Oct to 1 Nov. Winter is 1 Dec to 6 Jan. The date is local.
export function season(date) {
  const md = 100 * (date.getMonth() + 1) + date.getDate()
  if (md >= 1024 && md <= 1101) return 'halloween'
  if (md >= 1201 || md <= 106) return 'winter'
  return null
}

// [minute, dir, sun, sunPower, ambient, ground, ambientPower, window, windowGlow, background]
const KEYS = [
  [360, [10, 1, 2], '#a9bce8', 0, '#7f8fb8', '#2e2622', 1.5, '#1d2540', '#141c33', '#0b0d1a'], // 06:00 the night ends
  [480, [10, 3, 3], '#ffc58a', 1.8, '#ffe6c8', '#6e5a4c', 1.7, '#a9d5ef', '#55819e', '#181825'], // 08:00 a low warm sun from the east
  [780, [0, 10, 4], '#ffe4bd', 2.6, '#fff1dc', '#7a6250', 2, '#a9d5ef', '#55819e', '#181825'], // 13:00 a high sun from the south
  [900, [-4, 10, 5], '#ffdcae', 2.4, '#fff1dc', '#7a6250', 2, '#a9d5ef', '#55819e', '#181825'], // 15:00 the reference day look (decision 9)
  [1080, [-10, 5, 2], '#ff9a50', 2, '#ffb47a', '#6a4a3a', 1.6, '#f2b58a', '#8a5a40', '#181825'], // 18:00 a low orange sun from the west
  [1260, [-10, 1, 1], '#a9bce8', 0, '#7f8fb8', '#2e2622', 1.5, '#1d2540', '#141c33', '#0b0d1a'], // 21:00 the night starts
]

// The light of the day at min (minutes since local midnight): the sun, the sky, the windows, and the background.
// It blends the KEYS rows in a cycle (after 21:00 comes 06:00 of the next day). Numbers and dir mix linearly, colors per sRGB channel.
export function daylight(min) {
  let m = ((min % 1440) + 1440) % 1440
  if (m < 360) m += 1440
  const i = KEYS.findLastIndex((k) => k[0] <= m)
  const a = KEYS[i], b = KEYS[i + 1] || [KEYS[0][0] + 1440, ...KEYS[0].slice(1)]
  const t = (m - a[0]) / (b[0] - a[0])
  const num = (x, y) => x + (y - x) * t
  const col = (x, y) => '#' + [1, 3, 5].map((j) => Math.round(num(parseInt(x.slice(j, j + 2), 16), parseInt(y.slice(j, j + 2), 16))).toString(16).padStart(2, '0')).join('')
  return {
    dir: a[1].map((v, j) => num(v, b[1][j])), sun: col(a[2], b[2]), sunPower: num(a[3], b[3]),
    ambient: col(a[4], b[4]), ground: col(a[5], b[5]), ambientPower: num(a[6], b[6]),
    window: col(a[7], b[7]), windowGlow: col(a[8], b[8]), background: col(a[9], b[9]),
  }
}

// The Halloween ghosts of a building { w, d }: 3 closed loops of 8 points { x, z, hover }, 1 or more from each outer wall.
// hover: the seconds at the point (2 to 5). The seed comes from the bounds and the ghost index, so the same bounds give the same ghosts.
export const ghosts = ({ w, d }) => [0, 1, 2].map((i) => {
  const r = rng(hash(`${w},${d},${i}`, 1e9))
  return Array.from({ length: 8 }, () => ({ x: 1 + r() * (w - 2), z: 1 + r() * (d - 2), hover: 2 + 3 * r() }))
})
const DRIFT = 0.8 // the ghost speed, world units a second
// Ghost g at s seconds: { x, y, z, dx, dz }. It floats from each point to the next, hovers there, and returns to point 0 at the end of the loop.
// dx, dz: the unit direction of the leg it floats on, or came on. y: the base, a bob from 0.3 to 0.4 in 2 s.
export function ghostAt(g, s) {
  const legs = g.map((p, i) => [p, g[(i + 1) % g.length]])
  const loop = legs.reduce((a, [p, q]) => a + Math.hypot(q.x - p.x, q.z - p.z) / DRIFT + q.hover, 0)
  const y = 0.35 + 0.05 * Math.sin(Math.PI * s + g[0].x) // the phase from the first point: the ghosts bob out of step
  let u = ((s % loop) + loop) % loop
  for (const [p, q] of legs) {
    const len = Math.hypot(q.x - p.x, q.z - p.z), dx = (q.x - p.x) / len, dz = (q.z - p.z) / len, k = Math.min(u * DRIFT, len)
    if (u < len / DRIFT + q.hover || q === g[0]) return { x: p.x + dx * k, y, z: p.z + dz * k, dx, dz } // the last leg also takes a rest of float noise
    u -= len / DRIFT + q.hover
  }
}

// The browse wait before trip n, the stay, and the lunch stay, in seconds, for one idle stretch. The first trip comes sooner.
// pick: a number in [0, 1) that picks the first kind of trip n in stepBreak(). game: a number in [0, 1) that sets the game time of a
// waiter (chess 30 to 60 s, ping-pong 20 to 40 s). chat: the chat time in seconds (10 to 25) of a waiter at the cooler. Each value has its own index i, so a new value keeps the others. The index 2 held
// the old party coin.
export function breakPlan(seed, n) {
  const u = (i) => { // a mixed number in [0, 1) for each plan value i
    let h = Math.imul((seed ^ Math.imul(n + 1, 0x9e3779b1)) + i * 0x85ebca6b, 0xc2b2ae35)
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296
  }
  const [lo, hi] = n ? [20, 60] : [5, 30]
  return { wait: lo + u(0) * (hi - lo), stay: 6 + u(1) * 9, lunch: 20 + u(3) * 20, pick: u(6), game: u(7), chat: 10 + u(8) * 15 }
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
// and trip is the one that runs now. claimed: '<kind>:<spot index>' -> desk id, so two workers never take one spot.
// idle: the worker may take a break. spots: the spot count of each kind, { kitchen, lunch, party, chat }: the counter spots, the
// kitchen chairs, the dance spots, and the chat spots at the cooler (2). A missing or 0 count means that the office has no such spot. tables: the kind of each game table
// (office.games), or missing. Table t has the places 2t (west) and 2t + 1 (east), so the kind 'game' has 2 * tables.length places.
// route(kind, i): the path to spot i of kind.
// Returns { s, phase, got, play, talk, trip } for a worker on a trip, or null for a worker at the desk. trip.room is the kind: 'kitchen',
// 'lunch', 'party', 'game', or 'chat'. play: true while two players play their game or two workers chat. talk: true while play is true in
// a chat and it is the turn of this worker. A turn lasts 2 + hash(begin) / 100 s, and the waiter (trip.first) talks in the even turns.
// A game or chat trip also has partner (the desk id of the other worker, or null), begin and end (null until a join), and time (the
// game or chat time of the waiter). A game trip has table too.
// A worker that starts a trip first looks for a waiter: a worker alone at a table or at the cooler, with no rush, in its first WAIT s
// there. It then takes the other place of that pair, whatever its pick. The game or chat begins when the later worker arrives, and
// lasts the time of the waiter. Both stays end at the game end. A waiter that nobody joins stays WAIT s. A rush of one player ends the game of
// the other: its stay ends now, or at its arrival.
export function stepBreak(trips, claimed, id, { idle, seed, spots, route, tables = [] }, t) {
  let b = trips.get(id)
  if (!b) {
    if (!idle) return null
    trips.set(id, b = { n: 0, next: t + breakPlan(seed, 0).wait, trip: null })
  }
  if (!b.trip) {
    if (!idle) return trips.delete(id), null
    if (t < b.next) return null
    const count = { ...spots, game: 2 * tables.length }, open = (room, j) => !claimed.has(`${room}:${j}`) && (room !== 'game' && room !== 'chat' || !claimed.has(`${room}:${j ^ 1}`))
    const free = (room) => { // a free spot of the kind, from a start that differs for each worker. A free game or chat place has a free pair
      const n = count[room] ?? 0, i = Array.from({ length: n }, (_, j) => (j + seed) % n).find((j) => open(room, j))
      return i === undefined ? null : [room, i]
    }
    const plan = breakPlan(seed, b.n)
    let pick = null, mate = null
    const pairs = [...tables.map((_, k) => ['game', 2 * k]), ...(spots.chat > 0 ? [['chat', 0]] : [])] // the pairs of places: a game table, the cooler
    for (const [kind, j] of pairs) { // a waiter first: one place of the pair is taken, the other is free
      const [w, e] = [j, j + 1].map((x) => claimed.get(`${kind}:${x}`))
      if ((w === undefined) === (e === undefined)) continue
      const other = trips.get(w ?? e)?.trip
      if (other?.partner === null && other.rush == null && t < arrive(other) + WAIT) { pick = [kind, w === undefined ? j : j + 1]; mate = w ?? e; break }
    }
    if (!pick) { // plan.pick picks the first kind. A full kind sends the worker to the next kind in the order kitchen, lunch, party, game, chat.
      const kinds = ['kitchen', 'lunch', 'party', 'game', 'chat'].filter((k) => count[k] > 0), first = kinds.splice(Math.floor(plan.pick * kinds.length), 1)
      pick = [...first, ...kinds].map(free).find(Boolean)
    }
    if (!pick) { b.next = t + breakPlan(seed, ++b.n).wait; return null } // no free spot: keep browsing
    const [room, i] = pick, path = route(room, i)
    claimed.set(`${room}:${i}`, id)
    b.trip = { len: pathLen(path), start: t, stay: room === 'lunch' ? plan.lunch : room === 'game' || room === 'chat' ? WAIT : plan.stay, path, room, spot: `${room}:${i}`, got: false }
    if (room === 'game' || room === 'chat') {
      const time = room === 'chat' ? plan.chat : tables[i >> 1] === 'chess' ? 30 + 30 * plan.game : 20 + 20 * plan.game // the game or chat time, if this worker is the waiter
      Object.assign(b.trip, { partner: null, begin: null, end: null, time })
      if (room === 'game') b.trip.table = i >> 1
      if (mate !== null) { // the join: both stays end at the same time
        const other = trips.get(mate).trip, begin = Math.max(arrive(other), arrive(b.trip)), end = begin + other.time
        Object.assign(other, { partner: id, begin, end, stay: end - arrive(other), first: true })
        Object.assign(b.trip, { partner: mate, begin, end, stay: end - arrive(b.trip), time: other.time })
      }
    }
  }
  const trip = b.trip
  if (!idle && trip.rush == null) { trip.rush = t; quit(trips, id, t) } // the status changed: run back. The game of the partner ends
  const { s, phase } = tripAt(trip, t)
  if (phase === 'done') {
    claimed.delete(trip.spot)
    b.trip = null
    if (idle && trip.rush == null) b.next = t + breakPlan(seed, ++b.n).wait
    else trips.delete(id) // after a rush the next idle stretch starts fresh
    return null
  }
  if (phase === 'stay' && trip.room === 'kitchen') trip.got = true // the mug at the counter. A lunch and a dance get none
  const play = inPlay(trip, phase, t)
  return { s, phase, got: trip.got, play, talk: play && trip.room === 'chat' && ((t - trip.begin) / (2 + hash(String(trip.begin), 100) / 100) | 0) % 2 === (trip.first ? 0 : 1), trip }
}

// True while two players play their game: the trip is in its stay, between begin and end.
const inPlay = (trip, phase, t) => phase === 'stay' && trip.begin != null && trip.begin <= t && t < trip.end

const arrive = (trip) => trip.start + trip.len / WALK // the time when a trip reaches its spot
// The player id leaves its game at time t: the stay of its partner ends at t, or at the arrival of the partner if that is later.
// The partner then walks back and waits for nobody. After the game end, both already walk back, so nothing changes: a longer stay
// would move the partner back toward the table.
function quit(trips, id, t) {
  const other = trips.get(trips.get(id)?.trip?.partner)?.trip
  if (other?.partner === id && t < other.end) Object.assign(other, { end: t, stay: Math.max(0, t - arrive(other)) })
}

// A worker leaves the idle breaks for good (it moves to a meeting seat): drop its state and free its spot, chair, dance spot, or game
// place (the claimed key in trip.spot). t: the time now. The game of its partner ends at t.
export function endBreak(trips, claimed, id, t) {
  const spot = trips.get(id)?.trip?.spot
  if (spot !== undefined) claimed.delete(spot)
  quit(trips, id, t)
  trips.delete(id)
}

// The next stop of the camera tour. trips: the map of stepBreak(). seen: the keys of the stops of this round.
// The stops, in order: a blocked desk, a done desk, a game in play, a dance, a lunch. With none of these, each room.
// It picks the first stop that is not in seen. When all are seen, a new round starts and skips the stop that came last.
// Returns { stop: { key, x, z, room, whole }, seen }. whole: true for a room stop only.
export function nextStop(o, trips, t, seen = []) {
  const stops = []
  const desk = (d) => stops.push({ key: `desk:${d.id}`, x: (d.away ?? d).x, z: (d.away ?? d).z, room: d.roomId, whole: false })
  for (const status of ['blocked', 'done']) o.desks.filter((d) => d.status === status).forEach(desk)
  const stays = [...trips.values()].map((e) => e.trip && { trip: e.trip, phase: tripAt(e.trip, t).phase }).filter((x) => x?.phase === 'stay')
  const tables = new Set(stays.filter((x) => x.trip.room === 'game' && inPlay(x.trip, x.phase, t)).map((x) => x.trip.table))
  for (const i of [...tables].sort((a, b) => a - b)) stops.push({ key: `game:${i}`, x: o.games[i].x, z: o.games[i].z, room: o.games[i].room, whole: false })
  const party = o.rooms.find((r) => r.id === 'party')
  if (party?.floor && stays.some((x) => x.trip.room === 'party')) {
    const [x0, z0, x1, z1] = party.floor
    stops.push({ key: 'dance', x: (x0 + x1) / 2, z: (z0 + z1) / 2, room: 'party', whole: false })
  }
  const tabs = o.rooms.find((r) => r.id === 'kitchen')?.tables
  if (tabs?.length && stays.some((x) => x.trip.room === 'lunch'))
    stops.push({ key: 'lunch', x: tabs.reduce((a, c) => a + c.x, 0) / tabs.length, z: tabs.reduce((a, c) => a + c.z, 0) / tabs.length, room: 'kitchen', whole: false })
  if (!stops.length) for (const r of o.rooms) stops.push({ key: `room:${r.id}`, x: r.x + r.w / 2, z: r.z + r.d / 2, room: r.id, whole: true })
  const fresh = stops.find((s) => !seen.includes(s.key))
  if (fresh) return { stop: fresh, seen: [...seen, fresh.key] }
  const stop = stops.find((s) => s.key !== seen.at(-1)) ?? stops[0]
  return { stop, seen: [stop.key] }
}

// ---- Demo: a fake session with the same shape as a real snapshot. ----

const AREA = { x: 30, y: 1, width: 200, height: 60 }
const CYCLE = ['working', 'blocked', 'done', 'idle']
const DEMO_WORKSPACES = { w1: 'api', w2: 'web', w3: 'docs', w4: 'infra' }
const DEMO_TABS = { 'w1:t1': 'server', 'w2:t1': 'app', 'w2:t2': 'tests', 'w3:t1': 'notes', 'w4:t1': 'deploy', 'w4:t2': 'ops' }
// pane id, tab id, agent kind (null = shell), rect [x, y, w, h] in cells inside AREA, status phase, agent name, long idle.
// Outside the focused tab w1:t1, phases 0, 3, 6 and 9 sit one cycle step apart, so every tick shows all four CYCLE statuses.
// The focused tab never shows done. Its phases give the idle agent while w4:p1 is still unknown.
// A long-idle agent ([idle ticks, start tick in its cycle]) ignores the phase: it idles for a long time, so it goes on kitchen,
// party, game, and chat trips. Three of them idle, because with two the fifth kind would hide the games.
// Then it works 20 s, waits for the user 15 s and finishes 15 s. The idle times differ, so one trip finishes and a
// status change cuts another short. Their kitchen routes are 55 to 76 units long: a full kitchen trip takes about 100 s. A party trip is shorter.
const DEMO_PANES = [
  ['w1:p1', 'w1:t1', 'claude', [0, 0, 100, 30], 1, 'lead'],
  ['w1:p2', 'w1:t1', 'codex', [100, 0, 100, 30], 5, null, [200, 170]],
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
