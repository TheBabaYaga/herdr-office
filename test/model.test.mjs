import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STATUS_RANK, STATUS_COLOR, rollup, buildOffice, demoSnapshot, demoMeetings, season, ghosts, ghostAt, snowflakes, flakeAt, twinkle, outdoors } from '../public/model.js'

// Synthetic snapshot. All values are made up.
const area = { x: 10, y: 2, width: 100, height: 40 }
const rect = (x, y, width, height) => ({ x: area.x + x, y: area.y + y, width, height })
const layout = (ws, tab, rects, focused) => ({
  workspace_id: ws, tab_id: tab, zoomed: false, focused_pane_id: focused, area,
  panes: Object.entries(rects).map(([pane_id, r]) => ({ pane_id, focused: pane_id === focused, rect: r })),
  splits: [],
})
const pane = (id, tab, extra = {}) => ({
  pane_id: id, terminal_id: `term_${id}`, workspace_id: id.split(':')[0], tab_id: tab, focused: false,
  cwd: `/synthetic/${id}`, foreground_cwd: `/synthetic/${id}/fg`, agent_status: 'unknown',
  terminal_title: 'sh', terminal_title_stripped: 'sh',
  scroll: { offset_from_bottom: 0, max_offset_from_bottom: 0, viewport_rows: 20 }, revision: 1, ...extra,
})
const agent = (p, kind, status, seq, extra = {}) => ({
  pane_id: p.pane_id, terminal_id: p.terminal_id, workspace_id: p.workspace_id, tab_id: p.tab_id,
  agent: kind, agent_status: status, focused: p.focused, cwd: p.cwd, foreground_cwd: p.foreground_cwd,
  terminal_title: `${kind} task`, terminal_title_stripped: `${kind} task`, state_change_seq: seq, revision: 1, ...extra,
})

function synthetic() {
  const panes = [
    pane('w1:p1', 'w1:t1', { agent: 'claude', agent_status: 'done', foreground_cwd: '' }),
    pane('w1:p2', 'w1:t2', { label: 'logs' }),
    pane('w2:p1', 'w2:t1', { agent: 'codex', agent_status: 'working' }),
    pane('w2:p2', 'w2:t1', { agent: 'gemini', agent_status: 'blocked', focused: true, terminal_title_stripped: 'gemini task' }),
    pane('w2:p3', 'w2:t1'),
    pane('w2:p4', 'w2:t1', { agent: 'claude', agent_status: 'idle' }),
  ]
  const [a1, , b1, b2, , b4] = panes
  return {
    version: '0.0.0', protocol: 20,
    focused_workspace_id: 'w2', focused_tab_id: 'w2:t1', focused_pane_id: 'w2:p2',
    // Listed out of number order on purpose.
    workspaces: [
      { workspace_id: 'w2', number: 2, label: 'beta', focused: true, pane_count: 4, tab_count: 1, active_tab_id: 'w2:t1', agent_status: 'blocked' },
      { workspace_id: 'w1', number: 1, label: 'alpha', focused: false, pane_count: 2, tab_count: 2, active_tab_id: 'w1:t1', agent_status: 'done' },
    ],
    tabs: [
      { tab_id: 'w1:t2', workspace_id: 'w1', number: 2, label: 'two', focused: false, pane_count: 1, agent_status: 'unknown' },
      { tab_id: 'w1:t1', workspace_id: 'w1', number: 1, label: 'one', focused: false, pane_count: 1, agent_status: 'done' },
      { tab_id: 'w2:t1', workspace_id: 'w2', number: 1, label: 'grid', focused: true, pane_count: 4, agent_status: 'blocked' },
    ],
    panes,
    layouts: [
      layout('w1', 'w1:t1', { 'w1:p1': rect(0, 0, 100, 40) }, 'w1:p1'),
      layout('w1', 'w1:t2', { 'w1:p2': rect(0, 0, 100, 40) }, 'w1:p2'),
      layout('w2', 'w2:t1', {
        'w2:p1': rect(0, 0, 50, 20), 'w2:p2': rect(50, 0, 50, 20),
        'w2:p3': rect(0, 20, 50, 20), 'w2:p4': rect(50, 20, 50, 20),
      }, 'w2:p2'),
    ],
    agents: [
      agent(a1, 'claude', 'done', 3),
      agent(b1, 'codex', 'working', 5),
      agent(b2, 'gemini', 'blocked', 7, { name: 'scout' }),
      agent(b4, 'claude', 'idle', 2, { display_agent: 'Claude Code' }),
    ],
  }
}

// 18 workspaces, 26 tabs, 49 panes, like the live office. Tab j has 4, 2 or 1 panes and sits in workspace j % 18.
function big() {
  const s = { focused_workspace_id: 'w0', focused_tab_id: 'w0:t0', focused_pane_id: 'w0:p0', workspaces: [], tabs: [], panes: [], layouts: [], agents: [] }
  const STATUS = ['working', 'blocked', 'done', 'idle', 'unknown']
  for (let i = 0; i < 18; i++) s.workspaces.push({ workspace_id: `w${i}`, number: 18 - i, label: `ws${i}` }) // reverse number order on purpose
  let k = 0
  for (let j = 0; j < 26; j++) {
    const ws = `w${j % 18}`, tab = `${ws}:t${j}`, n = j < 7 ? 4 : j < 9 ? 2 : 1, cols = Math.min(n, 2)
    s.tabs.push({ tab_id: tab, workspace_id: ws, number: j, label: `tab${j}` })
    const rects = {}
    for (let m = 0; m < n; m++, k++) {
      const p = pane(`${ws}:p${k}`, tab, { agent_status: STATUS[k % 5] })
      s.panes.push(p)
      if (k % 3) s.agents.push(agent(p, 'claude', p.agent_status, k))
      rects[p.pane_id] = rect(m % cols * 100 / cols, Math.floor(m / cols) * 20, 100 / cols, n > 2 ? 20 : 40)
    }
    s.layouts.push(layout(ws, tab, rects, Object.keys(rects)[0]))
  }
  return s
}

// One wide workspace "api" (one tab, 4 panes side by side) and four small ones with one pane each. The rows: api, web (19.6, the
// building width) | docs, infra (5.6 spare) | ops, Meeting (4.6 spare) | Kitchen, Lobby (3.6 spare). No row has 7 spare: no party room.
function garden() {
  const s = { version: '0.0.0', protocol: 20, focused_workspace_id: 'w1', focused_tab_id: 'w1:t1', focused_pane_id: 'w1:p1', workspaces: [], tabs: [], panes: [], layouts: [], agents: [] }
  ;['api', 'web', 'docs', 'infra', 'ops'].forEach((label, i) => {
    const ws = `w${i + 1}`, tab = `${ws}:t1`, n = i ? 1 : 4, rects = {}
    s.workspaces.push({ workspace_id: ws, number: i + 1, label })
    s.tabs.push({ tab_id: tab, workspace_id: ws, number: 1, label: 'main' })
    for (let m = 0; m < n; m++) {
      const p = pane(`${ws}:p${m + 1}`, tab, { agent: 'claude', agent_status: 'idle' })
      s.panes.push(p)
      s.agents.push(agent(p, 'claude', 'idle', s.agents.length + 1))
      rects[p.pane_id] = rect((m * 100) / n, 0, 100 / n, 40)
    }
    s.layouts.push(layout(ws, tab, rects, `${ws}:p1`))
  })
  return s
}

// Workspaces from a list of [label, tabs]. A tab is its pane count: the panes stand side by side, or for a negative count, in one column.
function plan(spec) {
  const s = { version: '0.0.0', protocol: 20, focused_workspace_id: 'w1', focused_tab_id: 'w1:t1', focused_pane_id: 'w1:p1', workspaces: [], tabs: [], panes: [], layouts: [], agents: [] }
  spec.forEach(([label, tabs], i) => {
    const ws = `w${i + 1}`
    s.workspaces.push({ workspace_id: ws, number: i + 1, label })
    tabs.forEach((n, j) => {
      const tab = `${ws}:t${j + 1}`, k = Math.abs(n), rects = {}
      s.tabs.push({ tab_id: tab, workspace_id: ws, number: j + 1, label: 'main' })
      for (let m = 0; m < k; m++) {
        const p = pane(`${ws}:p${s.panes.length + 1}`, tab, { agent: 'claude', agent_status: 'idle' })
        s.panes.push(p)
        s.agents.push(agent(p, 'claude', 'idle', s.agents.length + 1))
        rects[p.pane_id] = n < 0 ? rect(0, (m * 40) / k, 100, 40 / k) : rect((m * 100) / k, 0, 100 / k, 40)
      }
      s.layouts.push(layout(ws, tab, rects, Object.keys(rects)[0]))
    })
  })
  return s
}

const EPS = 1e-9
const overlap = (a, b) => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.z < b.z + b.d - EPS && b.z < a.z + a.d - EPS
const inside = (p, c) => p.x > c.x && p.x < c.x + c.w && p.z > c.z && p.z < c.z + c.d

// The corridor floor plan: bands of a north row, a corridor and a south row, plus one cross corridor on the +x side.
function assertPlan(o, snap, meetings = []) {
  const ws = [...snap.workspaces].sort((a, b) => a.number - b.number).map(w => w.workspace_id)
  const meet = meetings.length ? meetings.map(m => `meeting:${m.sessionId}`) : ['meeting']
  assert.deepEqual(o.rooms.filter(r => r.kind !== 'party').map(r => [r.id, r.kind]), [...ws.map(id => [id, 'workspace']), ...meet.map(id => [id, 'meeting']), ['kitchen', 'kitchen'], ['lobby', 'lobby']])
  for (const r of o.rooms.filter(r => !r.session && r.kind !== 'workspace')) assert.deepEqual([r.label, r.number, r.status, r.pods], [r.kind[0].toUpperCase() + r.kind.slice(1), null, null, []])
  assertSeats(o, meetings)
  for (const r of o.rooms) assert.ok(r.kind === 'workspace' || r.kind === 'party' ? r.w >= 7 && r.d >= 6 : r.w >= 8 && r.d >= 7, `${r.id} size`)

  // Rows are filled in room order, west to east: band 0 north, band 0 south, band 1 north, ...
  const rows = [...new Set(o.rooms.map(r => r.z))].sort((a, b) => a - b).map(z => o.rooms.filter(r => r.z === z))
  assert.deepEqual(rows.flat().map(r => r.id), o.rooms.map(r => r.id), 'rows in room order')
  assert.equal(rows.length % 2, 0)
  const W = o.bounds.w - 3
  assertRows(o, rows, W)
  rows.forEach((row, i) => {
    assert.equal(row[0].x, 0)
    row.forEach((r, j) => {
      if (j) assert.equal(r.x, row[j - 1].x + row[j - 1].w, 'rooms in a row touch')
      assert.equal(r.d, row[0].d, 'rooms in a row share depth')
      const north = i % 2 === 1 // a south row has its door in the north wall
      assert.deepEqual(r.door, { x: r.x + r.w / 2, z: north ? r.z : r.z + r.d, side: north ? 'north' : 'south' })
      const out = { x: r.door.x, z: r.door.z + (north ? -0.1 : 0.1) }
      assert.ok(o.corridors.some(c => inside(out, c)), `${r.id} door opens into a corridor`)
    })
    const end = o.terraces.find(t => t.z === row[0].z) ?? row.at(-1)
    assert.ok(Math.abs(end.x + end.w - W) < EPS, 'the rooms and the terrace of a row span the building width')
    if (i % 2) {
      const n = rows[i - 1][0], s = row[0]
      assert.ok(o.corridors.some(c => c.x === 0 && Math.abs(c.w - W) < EPS && c.z === n.z + n.d && c.d === 3 && c.z + 3 === s.z), `corridor in band ${(i - 1) / 2}`)
    }
  })
  assert.equal(o.corridors.length, rows.length / 2 + 1)
  const cross = o.corridors.find(c => Math.abs(c.x - W) < EPS && c.w === 3 && c.z === 0 && c.d === o.bounds.d)
  assert.ok(cross, 'cross corridor spans all bands')
  const lobby = o.rooms.find(r => r.id === 'lobby')
  assert.equal(lobby.z + lobby.d, o.bounds.d, 'the lobby is on the outer wall')
  assert.deepEqual(o.entrance, { x: lobby.x + lobby.w / 2, z: o.bounds.d }, 'entrance in the middle of the lobby outer wall')

  // Rooms, corridors, and terraces tile the whole building: inside bounds, no overlap, no gap.
  const rects = [...o.rooms, ...o.corridors, ...o.terraces]
  for (const r of rects) assert.ok(r.x >= 0 && r.z >= 0 && r.x + r.w <= o.bounds.w + EPS && r.z + r.d <= o.bounds.d + EPS, 'inside bounds')
  rects.forEach((a, i) => rects.slice(i + 1).forEach(b => assert.ok(!overlap(a, b), `${a.id ?? 'corridor'} overlaps ${b.id ?? 'corridor'}`)))
  assert.ok(Math.abs(rects.reduce((s, r) => s + r.w * r.d, 0) - o.bounds.w * o.bounds.d) < 1e-6, 'no gaps')

  for (const r of o.rooms) for (const p of r.pods) assert.ok(p.x >= r.x + 1.5 - EPS && p.z >= r.z + 1.5 - EPS && p.x + p.w <= r.x + r.w - 1.5 + EPS && p.z + p.d <= r.z + r.d - 1.5 + EPS, `${p.id} inside its room`)
  for (const d of o.desks) {
    const r = o.rooms.find(r => r.id === d.roomId)
    assert.ok(d.x - 1 >= r.x && d.x + 1 <= r.x + r.w && d.z - 0.75 >= r.z && d.z + 0.75 <= r.z + r.d, `${d.id} inside its room`)
  }
  assertSpacing(o.desks)
  assertKitchen(o)
  assertGames(o)
}

// The kitchen tables for a lunch: a table top is 0.9 x 0.9 round (x, z). A chair stands 0.8 west (rot 3, faces +x) or 0.8 east
// (rot 1, faces -x) of its table. Its seat is 0.5 x 0.5 round the chair point, and its back reaches 0.45 behind the point (decor.js).
const box = (x, z, x0, x1, z0, z1) => [x + x0, z + z0, x + x1, z + z1] // [x0, z0, x1, z1]
const hits = (a, b) => a[0] < b[2] - EPS && b[0] < a[2] - EPS && a[1] < b[3] - EPS && b[1] < a[3] - EPS
function assertKitchen(o) {
  const k = o.rooms.find(r => r.kind === 'kitchen'), { tables, chairs, walk } = k, s = k.door.side === 'south' ? 1 : -1
  assert.ok(chairs.length >= 2, `${chairs.length} kitchen chairs`)
  const tops = tables.map(t => box(t.x, t.z, -0.45, 0.45, -0.45, 0.45))
  const seats = chairs.map(c => {
    const t = tables[c.table]
    assert.ok(t && c.z === t.z && Math.abs(Math.abs(c.x - t.x) - 0.8) < EPS, `chair (${c.x}, ${c.z}) is 0.8 west or east of its table`)
    assert.equal(c.rot, c.x < t.x ? 3 : 1, 'a chair faces its table')
    return c.rot === 3 ? box(c.x, c.z, -0.45, 0.25, -0.25, 0.25) : box(c.x, c.z, -0.25, 0.45, -0.25, 0.25)
  })
  const lane = (c, w) => Math.abs(w[0] - (c.x - 0.3)) < EPS && Math.abs(w[2] - (c.x + 0.3)) < EPS && Math.abs(w[1] - (k.z + 1.9)) < EPS && Math.abs(w[3] - c.z) < EPS
  const door = box(k.door.x, k.door.z, -1, 1, s > 0 ? -1 : 0, s > 0 ? 0 : 1) // the posts, the open leaf and the first step in
  for (const [i, b] of [...tops, ...seats].entries()) {
    const what = i < tops.length ? `table ${i}` : `chair ${i - tops.length}`
    assert.ok(b[0] >= k.x + 0.2 - EPS && b[2] <= k.x + k.w - 0.2 + EPS && b[1] >= k.z + 0.2 - EPS && b[3] <= k.z + k.d - 0.2 + EPS, `${what} is 0.2 or more inside the kitchen`)
    assert.ok(b[1] >= k.z + 1.9 + 0.39 - EPS, `${what} is clear of the counter, its spots and a walker on the strip`)
    assert.ok(!hits(b, door), `${what} is clear of the door`)
    const own = i < tops.length ? [] : walk.filter(w => lane(chairs[i - tops.length], w))
    assert.equal(own.length, i < tops.length ? 0 : 1, `${what}: one lane from the strip`)
    for (const w of walk) assert.ok(own.includes(w) || !hits(b, w), `${what} is on the walk rect ${w}`)
  }
  chairs.forEach((a, i) => chairs.slice(i + 1).forEach(b => assert.ok(a.table === b.table || Math.hypot(a.x - b.x, a.z - b.z) >= 0.85 - EPS, 'chairs of two tables keep 0.85 apart')))
  // The camera looks along (1, 1, 1), and the east wall is 2.6 high. A seated torso (0.8 high) shows only 1.8 or more from that wall.
  if (s < 0 && k.w >= 8.6) for (const c of chairs) assert.ok(k.x + k.w - c.x >= 1.8 - EPS, `the chair at x ${c.x} is ${(k.x + k.w - c.x).toFixed(2)} from the east wall`)
}

// The game tables: only in a big workspace room or a big party room (80 m² or more of free floor), at most one of each kind.
// Each table keeps a pad of 0.3 from the walls, the pods, the lamp posts, the door area, the dance floor, the booth, and the other table.
// It stands off each walk rect of the room, except the lanes of its own places. A lane 0.6 wide or less runs to each place.
const LAMP = [-0.5, 0.4] // the pod lamp post from the pod corner, as in decor.js
const inRect = (p, [x0, z0, x1, z1]) => p.x >= x0 - EPS && p.x <= x1 + EPS && p.z >= z0 - EPS && p.z <= z1 + EPS
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
      for (const p of g.places) {
        const lane = r.walk.find((w) => inRect(p, w) && w[2] - w[0] <= 0.6 + EPS)
        assert.ok(lane, `${r.id}: no lane to the place at ${p.x}`)
        // The lane keeps off the pods, the other table with its pad, the door area, the dance floor, and the booth. Its center line keeps
        // 0.4 from each lamp post and 1.0 from each dance spot.
        const at = `${r.id}: the lane to the ${g.kind} place at ${p.x.toFixed(2)}`
        for (const q of r.pods) {
          assert.ok(!hits(lane, [q.x, q.z, q.x + q.w, q.z + q.d]), `${at} crosses pod ${q.id}`)
          const lx = q.x + LAMP[0], lz = q.z + LAMP[1]
          assert.ok(!hits(lane, [lx - 0.1, lz - 0.1, lx + 0.1, lz + 0.1]), `${at} passes the lamp of ${q.id}`)
        }
        for (const h of r.games) if (h !== g) assert.ok(!hits(lane, foot(h, 0.3)), `${at} crosses the ${h.kind} table`)
        assert.ok(!hits(lane, [r.door.x - 1.2, Math.min(r.door.z, r.door.z - s * 2), r.door.x + 1.2, Math.max(r.door.z, r.door.z - s * 2)]), `${at} is in the door area`)
        if (r.kind === 'party') {
          assert.ok(!hits(lane, r.floor), `${at} crosses the dance floor`)
          assert.ok(!hits(lane, [r.booth.x - 1.8, r.booth.z - 0.45, r.booth.x + 1.8, r.booth.z + 0.45]), `${at} crosses the booth or a speaker`)
          for (const q of r.spots) assert.ok(!hits(lane, [q.x - 0.7, q.z - 0.7, q.x + 0.7, q.z + 0.7]), `${at} passes the dance spot at ${q.x}`)
        }
      }
    }
  }
  for (const r of o.rooms) if (r.kind === 'lobby' || r.kind === 'kitchen' || r.kind === 'meeting') assert.deepEqual(r.games, [])
  assert.deepEqual(o.games.map((g) => g.room), o.rooms.flatMap((r) => r.games.map(() => r.id)))
}

// The party room fills the row with the most spare width (the first on a tie), if that width is 7 or more. The spare width is the
// building width minus the normal widths of the other rooms in the row. The other rooms of the party row keep their normal width.
// Each other row with a spare width of 4 or more keeps its normal room widths, and a terrace fills the spare width at its east end:
// from the last room to the cross corridor at W, with the row depth. Each other row stretches as before: every room gets the same extra width.
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} is not ${b}`)
const span = (r) => r.pods.length ? Math.max(...r.pods.map(p => p.x + p.w)) - Math.min(...r.pods.map(p => p.x)) : 0
const normal = (r) => r.kind === 'workspace' ? Math.max(7, 3 + span(r)) : r.kind === 'meeting' ? Math.max(8, r.table.len + 2.6) : 8
function assertRows(o, rows, W) {
  const spare = rows.map(row => W - row.filter(r => r.kind !== 'party').reduce((s, r) => s + normal(r), 0))
  const most = Math.max(...spare), at = spare.findIndex(s => s > most - 1e-6), party = o.rooms.filter(r => r.kind === 'party')
  assert.equal(party.length, most >= 7 ? 1 : 0, `a party room only for a spare width of 7 or more (${most})`)
  let n = 0
  rows.forEach((row, i) => {
    const ts = o.terraces.filter(t => t.z === row[0].z)
    if (party.length && i === at) {
      const p = party[0]
      assert.equal(row.at(-1).kind === 'lobby' ? row.at(-2) : row.at(-1), p, 'the party room is the last room of its row, or just before the lobby')
      assert.deepEqual([p.id, p.door.side], ['party', i % 2 ? 'north' : 'south'])
      close(p.w, spare[i], 'the party room takes the spare width')
      for (const r of row) if (r !== p) close(r.w, normal(r), `${r.id} keeps its normal width`)
      assert.equal(ts.length, 0, 'the party row has no terrace')
    } else if (spare[i] >= 4 - 1e-6) {
      for (const r of row) close(r.w, normal(r), `${r.id} keeps its normal width next to a terrace`)
      assert.equal(ts.length, 1, `row ${i} with ${spare[i]} spare width has one terrace`)
      const [t] = ts, last = row.at(-1)
      assert.equal(t.id, `terrace:${i}`)
      close(t.x, last.x + last.w, `${t.id} starts at the east wall of the last room`)
      close(t.x + t.w, o.corridors.at(-1).x, `${t.id} touches the cross corridor`)
      close(t.w, spare[i], `${t.id} takes the spare width`)
      assert.ok(t.w >= 4 - 1e-6, `${t.id} is ${t.w} wide`)
      assert.deepEqual([t.z, t.d], [row[0].z, row[0].d], `${t.id} has the row depth`)
      n++
    } else {
      for (const r of row) close(r.w, normal(r) + spare[i] / row.length, `${r.id} stretches`)
      assert.equal(ts.length, 0, `row ${i} with ${spare[i]} spare width stretches and has no terrace`)
    }
  })
  assert.equal(o.terraces.length, n, 'each terrace sits in a row')
}

// Meeting rooms: the table and every seat inside the room, seats apart, one seat per attendee, the head seat for the orchestrator.
const turn = (s, a) => [s.x + a * Math.sin(s.rot * Math.PI / 2), s.z + a * Math.cos(s.rot * Math.PI / 2)] // seat-local (0, a) in world coords
function assertSeats(o, meetings) {
  for (const r of o.rooms.filter(r => r.kind === 'meeting')) {
    const t = r.table, n = meetings.find(m => r.id === `meeting:${m.sessionId}`)?.agents.length ?? 0
    assert.ok(t.x - t.len / 2 > r.x + 1 && t.x + t.len / 2 < r.x + r.w - 1 && t.z - 0.6 > r.z + 1 && t.z + 0.6 < r.z + r.d - 1, `${r.id} table inside`)
    assert.ok(r.seats.length >= n + 1 && r.seats.length >= 9, `${r.id} has a seat for each attendee`)
    const chairs = r.seats.map(s => turn(s, 0.45)) // chair and worker center
    for (const [x, z] of chairs) assert.ok(x - 0.45 >= r.x + 0.2 && x + 0.45 <= r.x + r.w - 0.2 && z - 0.45 >= r.z + 0.2 && z + 0.45 <= r.z + r.d - 0.2, `${r.id} seat inside`)
    chairs.forEach((a, i) => chairs.slice(i + 1).forEach(b => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= 0.9, `${r.id} seats apart`)))
    for (const s of r.seats) { // every seat faces the table: one step forward lands on it, or right before the head end
      const [x, z] = turn(s, -0.6)
      assert.ok(Math.abs(x - t.x) <= t.len / 2 + 1e-9 && Math.abs(z - t.z) <= 0.6 + 1e-9, `${r.id} seat at the table`)
    }
    const subs = o.subagents.filter(a => a.roomId === r.id), away = o.desks.filter(d => d.away?.roomId === r.id)
    assert.equal(subs.length, n)
    assert.ok(away.length <= 1)
    const at = a => [a.x, a.z, a.rot]
    assert.deepEqual(away.map(d => at(d.away)), away.length ? [at(r.seats[0])] : [], `${r.id}: the orchestrator at the head`)
    assert.deepEqual(subs.map(a => at(r.seats[a.seat])), subs.map(at), `${r.id}: a subagent sits on its seat`)
    assert.ok(subs.every(a => a.seat >= 1) && new Set(subs.map(a => a.seat)).size === n, `${r.id}: one side seat per subagent`)
  }
  assert.equal(o.subagents.length, meetings.reduce((s, m) => s + m.agents.length, 0))
}

function assertSpacing(desks) {
  for (let i = 0; i < desks.length; i++) {
    for (let j = i + 1; j < desks.length; j++) {
      const a = desks[i], b = desks[j]
      const ok = Math.abs(a.x - b.x) >= 2.4 - 1e-9 || Math.abs(a.z - b.z) >= 2.2 - 1e-9
      assert.ok(ok, `${a.id} at (${a.x}, ${a.z}) is too close to ${b.id} at (${b.x}, ${b.z})`)
    }
  }
}

const positions = (o) => ({
  bounds: o.bounds, corridors: o.corridors, entrance: o.entrance, terraces: o.terraces,
  rooms: o.rooms.map(r => [r.id, r.x, r.z, r.w, r.d, r.door, r.pods.map(p => [p.id, p.x, p.z, p.w, p.d])]),
  desks: o.desks.map(d => [d.id, d.x, d.z]),
})

test('constants', () => {
  assert.deepEqual(STATUS_RANK, { unknown: 0, idle: 1, working: 2, done: 3, blocked: 4 })
  assert.deepEqual(STATUS_COLOR, { working: '#f9e2af', blocked: '#fa5252', done: '#94e2d5', idle: '#a6e3a1', unknown: '#6c7086' })
})

test('rollup takes the highest rank', () => {
  assert.equal(rollup([]), 'unknown')
  assert.equal(rollup(['done', 'working', 'idle']), 'done')
  assert.equal(rollup(['done', 'blocked', 'working', 'idle', 'unknown']), 'blocked')
})

test('buildOffice maps rooms, pods and desks', () => {
  const o = buildOffice(synthetic())

  assert.deepEqual(o.rooms.map(r => r.id), ['w1', 'w2', 'meeting', 'kitchen', 'lobby'])
  assert.deepEqual(o.rooms.slice(0, 2).map(r => [r.label, r.number, r.status]), [['alpha', 1, 'done'], ['beta', 2, 'blocked']])
  // Pods keep the snapshot tab order (the tab-bar order). tab.number is a creation counter and stays put when a tab moves.
  assert.deepEqual(o.rooms[0].pods.map(p => p.id), ['w1:t2', 'w1:t1'])
  assert.deepEqual(o.rooms[1].pods.map(p => p.id), ['w2:t1'])
  const grid = o.rooms[1].pods[0]
  assert.deepEqual([grid.roomId, grid.label, grid.number, grid.status, grid.focusedPaneId, grid.zoomed], ['w2', 'grid', 1, 'blocked', 'w2:p2', false])

  assert.equal(o.desks.length, 6)
  assert.deepEqual(o.desks.map(d => d.id).sort(), ['w1:p1', 'w1:p2', 'w2:p1', 'w2:p2', 'w2:p3', 'w2:p4'])
  const desk = id => o.desks.find(d => d.id === id)

  const shell = desk('w1:p2')
  assert.equal(shell.agent, null)
  assert.equal(shell.status, 'unknown')
  assert.equal(shell.label, 'logs')
  assert.equal(shell.roomId, 'w1')
  assert.equal(shell.podId, 'w1:t2')

  assert.deepEqual(desk('w2:p2'), {
    id: 'w2:p2', roomId: 'w2', podId: 'w2:t1', terminalId: 'term_w2:p2',
    x: desk('w2:p2').x, z: desk('w2:p2').z,
    focused: true, label: null, cwd: '/synthetic/w2:p2/fg', title: 'gemini task', status: 'blocked',
    agent: { kind: 'gemini', name: 'scout', displayAgent: null, status: 'blocked', title: 'gemini task', stateChangeSeq: 7 },
  })
  assert.equal(desk('w2:p4').agent.displayAgent, 'Claude Code')
  assert.equal(desk('w2:p4').agent.name, null)
  assert.equal(desk('w1:p1').cwd, '/synthetic/w1:p1', 'falls back to cwd when foreground_cwd is empty')
  assert.deepEqual(o.desks.filter(d => d.focused).map(d => d.id), ['w2:p2'])

  assert.deepEqual(o.counts, { blocked: 1, done: 1, working: 1, idle: 1, unknown: 0 })
  assert.deepEqual(Object.keys(o.counts), ['blocked', 'done', 'working', 'idle', 'unknown'], 'the HUD shows counts in key order')
  assert.deepEqual(o.focus, { workspaceId: 'w2', tabId: 'w2:t1', paneId: 'w2:p2' })

  for (const d of o.desks) {
    const p = o.rooms.flatMap(r => r.pods).find(p => p.id === d.podId)
    assert.ok(d.x - 1 >= p.x && d.x + 1 <= p.x + p.w && d.z - 0.75 >= p.z && d.z + 0.75 <= p.z + p.d, `${d.id} inside its pod`)
  }
})

test('floor plan: corridors, walled rooms, doors to a corridor', () => {
  const s = synthetic()
  assertPlan(buildOffice(s), s)
  assertPlan(buildOffice(demoSnapshot(0)), demoSnapshot(0))
  const b = big(), o = buildOffice(b)
  assert.equal(o.desks.length, 49)
  assertPlan(o, b)
  assert.ok(o.corridors.length > 2, 'more than one band')
  assert.ok(Math.max(o.bounds.w / o.bounds.d, o.bounds.d / o.bounds.w) < 1.5, 'close to square')
})

test('room and pod status fall back to the rollup of their desks', () => {
  const s = synthetic()
  delete s.workspaces[0].agent_status
  delete s.tabs[2].agent_status
  const o = buildOffice(s)
  assert.equal(o.rooms[1].status, 'blocked')
  assert.equal(o.rooms[1].pods[0].status, 'blocked')
})

test('2x2 split keeps the grid and never overlaps', () => {
  const o = buildOffice(synthetic())
  const d = Object.fromEntries(o.desks.map(x => [x.id, x]))
  assert.equal(d['w2:p1'].z, d['w2:p2'].z)
  assert.equal(d['w2:p1'].x, d['w2:p3'].x)
  assert.ok(d['w2:p1'].x < d['w2:p2'].x && d['w2:p1'].z < d['w2:p3'].z)
  assertSpacing(o.desks)
})

test('6-way uneven split never overlaps', () => {
  const s = synthetic()
  const rects = {
    'w2:p1': rect(0, 0, 60, 40),
    'w2:p2': rect(60, 0, 30, 13), 'w2:p3': rect(60, 13, 30, 14), 'w2:p4': rect(60, 27, 30, 13),
    'w2:p5': rect(90, 0, 10, 20), 'w2:p6': rect(90, 20, 10, 20),
  }
  s.panes.push(pane('w2:p5', 'w2:t1'), pane('w2:p6', 'w2:t1'))
  s.layouts[2] = layout('w2', 'w2:t1', rects, 'w2:p2')
  const o = buildOffice(s)
  assert.equal(o.desks.filter(d => d.podId === 'w2:t1').length, 6)
  assertSpacing(o.desks)
})

test('a pane missing from layouts goes to a row at the pod end', () => {
  const s = synthetic()
  s.panes.push(pane('w2:p9', 'w2:t1'))
  const o = buildOffice(s)
  const pod = o.desks.filter(d => d.podId === 'w2:t1')
  const extra = pod.find(d => d.id === 'w2:p9')
  assert.ok(pod.every(d => d === extra || d.z < extra.z))
  assertSpacing(o.desks)
})

test('positions do not change when only statuses change', () => {
  for (const make of [synthetic, big]) {
    const a = make(), b = make()
    for (const r of [...b.workspaces, ...b.tabs, ...b.panes, ...b.agents]) r.agent_status = 'working'
    const oa = buildOffice(a), ob = buildOffice(b)
    assert.notDeepEqual(oa.counts, ob.counts)
    assert.deepEqual(positions(oa), positions(ob))
  }
})

const KEYS = {
  snapshot: ['version', 'protocol', 'focused_workspace_id', 'focused_tab_id', 'focused_pane_id', 'workspaces', 'tabs', 'panes', 'layouts', 'agents'],
  workspace: ['workspace_id', 'number', 'label', 'focused', 'pane_count', 'tab_count', 'active_tab_id', 'agent_status'],
  tab: ['tab_id', 'workspace_id', 'number', 'label', 'focused', 'pane_count', 'agent_status'],
  pane: ['pane_id', 'terminal_id', 'workspace_id', 'tab_id', 'focused', 'cwd', 'foreground_cwd', 'agent_status', 'terminal_title', 'terminal_title_stripped', 'scroll', 'revision'],
  agent: ['pane_id', 'terminal_id', 'workspace_id', 'tab_id', 'agent', 'agent_status', 'focused', 'cwd', 'foreground_cwd', 'terminal_title', 'terminal_title_stripped', 'state_change_seq', 'revision'],
  layout: ['workspace_id', 'tab_id', 'zoomed', 'focused_pane_id', 'area', 'panes', 'splits'],
}
const hasKeys = (obj, keys, what) => { for (const k of keys) assert.ok(k in obj, `${what} misses ${k}`) }

test('demoSnapshot has the snapshot shape', () => {
  const s = demoSnapshot(0)
  hasKeys(s, KEYS.snapshot, 'snapshot')
  s.workspaces.forEach(w => hasKeys(w, KEYS.workspace, w.workspace_id))
  s.tabs.forEach(t => hasKeys(t, KEYS.tab, t.tab_id))
  s.panes.forEach(p => hasKeys(p, KEYS.pane, p.pane_id))
  s.agents.forEach(a => hasKeys(a, KEYS.agent, a.pane_id))
  s.layouts.forEach(l => hasKeys(l, KEYS.layout, l.tab_id))

  assert.equal(s.workspaces.length, 4)
  assert.equal(s.tabs.length, 6)
  assert.ok(s.panes.length >= 10 && s.panes.length <= 14)
  assert.equal(s.agents.length, 9) // two long-idle agents on former shell panes: see test/walk.test.mjs
  assert.deepEqual([...new Set(s.agents.map(a => a.agent))].sort(), ['claude', 'codex', 'gemini', 'opencode'])
  assert.ok(s.panes.filter(p => !p.agent).length >= 2, 'has shell panes')
  for (const a of s.agents) assert.equal(s.panes.find(p => p.pane_id === a.pane_id).agent, a.agent)
  assert.equal(s.layouts.length, s.tabs.length)
  const sizes = s.layouts.map(l => l.panes.length)
  assert.ok(sizes.includes(4) && sizes.includes(1), 'has a 2x2 split and a single pane')
  for (const l of s.layouts) {
    assert.deepEqual(l.panes.map(p => p.pane_id).sort(), s.panes.filter(p => p.tab_id === l.tab_id).map(p => p.pane_id).sort())
  }
  assert.deepEqual(demoSnapshot(7), demoSnapshot(7), 'deterministic')
})

test('demo ticks 0..50 build and cover every status', () => {
  for (let t = 0; t <= 50; t++) {
    const o = buildOffice(demoSnapshot(t))
    assert.equal(o.rooms.filter(r => r.kind === 'workspace').length, 4)
    assert.equal(o.desks.filter(d => d.agent).length, 9)
    assert.ok(o.desks.every(d => Number.isFinite(d.x) && Number.isFinite(d.z)))
    assertSpacing(o.desks)
    for (const s of ['working', 'blocked', 'done', 'idle']) assert.ok(o.counts[s] >= 1, `tick ${t} has no ${s} agent`)
    // herdr marks a completion in the active tab as seen at once, so it shows idle.
    assert.ok(!o.desks.some(d => d.podId === o.focus.tabId && d.status === 'done'), `tick ${t} has a done agent in the focused tab`)
  }
  assert.ok(buildOffice(demoSnapshot(0)).counts.unknown >= 1, 'tick 0 has an unknown agent')
})

test('demo state_change_seq is one server-wide counter that moves only on a state change', () => {
  let prev = null
  for (let t = 0; t <= 50; t++) {
    const agents = demoSnapshot(t).agents
    assert.equal(new Set(agents.map(a => a.state_change_seq)).size, agents.length, `tick ${t} has a seq tie`)
    for (const a of agents) {
      const p = prev?.find(x => x.pane_id === a.pane_id)
      if (!p) continue
      // done -> idle only marks the pane seen. It is not a state change.
      if (p.agent_status === a.agent_status || (p.agent_status === 'done' && a.agent_status === 'idle')) {
        assert.equal(a.state_change_seq, p.state_change_seq, `${a.pane_id} tick ${t}`)
      } else {
        assert.ok(a.state_change_seq > Math.max(...prev.map(x => x.state_change_seq)), `${a.pane_id} tick ${t}`)
      }
    }
    prev = agents
  }
})

// ---- meetings: Claude Code sessions with running subagents (the shape the bridge sends) ----
const MODELS = ['opus', 'sonnet', 'haiku', null]
const meeting = (sessionId, cwd, n, workflow = 'flow') => ({
  sessionId, cwd, agents: Array.from({ length: n }, (_, i) => ({
    agentId: `${sessionId}-a${i}`, label: `build:${i}`, phase: workflow && 'Build', model: MODELS[i % 4], workflow, runId: workflow && 'wf_1',
  })),
})

test('meeting rooms appear only for meetings, and fit every attendee', () => {
  const s = synthetic()
  const none = buildOffice(s)
  assert.deepEqual(none.rooms.filter(r => r.kind === 'meeting').map(r => r.id), ['meeting'], 'the default meeting room stays')
  assert.deepEqual(none.subagents, [])
  assert.ok(none.desks.every(d => !('away' in d)))
  assertPlan(none, s)

  for (const sizes of [[1], [4, 13], [8, 2, 30]]) {
    const ms = sizes.map((n, i) => meeting(`S${i}`, `/nowhere/${i}`, n, i === 1 ? null : 'flow'))
    const o = buildOffice(s, ms)
    assertPlan(o, s, ms)
    assert.deepEqual(o.rooms.filter(r => r.session).map(r => [r.label, r.status]), sizes.map((n, i) => [i === 1 ? 'Meeting · subagents' : 'Meeting · flow', 'working']))
    const b = big()
    assertPlan(buildOffice(b, ms), b, ms)
  }
  const wide = buildOffice(s, [meeting('S', '/x', 13)]).rooms.find(r => r.session)
  assert.ok(wide.w > 8 && wide.table.len > 4.6, 'the table and the room grow for a big meeting')
})

test('the demo gets a party room in the row of the docs workspace', () => {
  const o = buildOffice(demoSnapshot(0), demoMeetings(0)), p = o.rooms.find(r => r.kind === 'party'), docs = o.rooms.find(r => r.label === 'docs')
  assert.ok(p, 'a party room')
  assert.equal(p.z, docs.z, 'in the row of docs')
  close(p.w, 11.7, 'the spare width of the row')
  close(docs.w, 7.8, 'docs keeps its normal width')
  close(p.x, docs.x + docs.w, 'east of docs')
  assert.equal(o.rooms.at(-1).id, 'lobby')
})

test('the demo kitchen has two tables with a chair on each side', () => {
  const k = buildOffice(demoSnapshot(0), demoMeetings(0)).rooms.find(r => r.kind === 'kitchen')
  assert.deepEqual([k.tables.length, k.chairs.map(c => [c.table, c.rot])], [2, [[0, 3], [0, 1], [1, 3], [1, 1]]])
})

test('no party room without a row with 7 or more spare width', () => {
  const s = synthetic(), o = buildOffice(s) // the most spare width is 6.9
  assert.deepEqual(o.rooms.map(r => r.id), ['w1', 'w2', 'meeting', 'kitchen', 'lobby'])
  assertPlan(o, s) // the row with 6.9 spare width gets a terrace instead
  assert.deepEqual(o.terraces.map(t => t.id), ['terrace:0'])
})

test('a row with 4 or more spare width keeps its room widths and gets a terrace, a row with less stretches', () => {
  const s = garden(), o = buildOffice(s), w = (z) => o.rooms.filter(r => r.z === z).map(r => [r.label, +r.w.toFixed(9)])
  assertPlan(o, s)
  assert.equal(o.rooms.find(r => r.kind === 'party'), undefined, 'no party room: the most spare width is 5.6')
  assert.deepEqual(o.terraces.map(t => [t.id, +t.x.toFixed(9), +t.w.toFixed(9)]), [['terrace:1', 14, 5.6], ['terrace:2', 15, 4.6]])
  const [a, b] = o.terraces
  assert.deepEqual(w(a.z), [['docs', 7], ['infra', 7]])
  assert.deepEqual(w(b.z), [['ops', 7], ['Meeting', 8]])
  assert.equal(a.z + a.d, b.z, 'the two middle rows sit back to back, so the terraces make one courtyard')
  assert.deepEqual(w(o.rooms.at(-1).z), [['Kitchen', 9.8], ['Lobby', 9.8]], 'the row with 3.6 spare width stretches')
  assert.deepEqual(buildOffice(demoSnapshot(0), demoMeetings(0)).terraces, [], 'the demo has no terrace: each of its rows has less than 4 spare width, or the party room')
})

test('the party room is the last room of the row with the most spare width, before the lobby in the lobby row', () => {
  const s = synthetic(), b = big()
  for (const [snap, ms, row] of [
    [demoSnapshot(0), demoMeetings(0), ['w3', 'party']],
    [s, [meeting('S', '/x', 13)], ['w2', 'party']],
    [b, [], ['w2', 'w1', 'party']],
    [b, [meeting('S', '/x', 11)], ['meeting:S', 'kitchen', 'party', 'lobby']],
  ]) {
    const o = buildOffice(snap, ms), p = o.rooms.find(r => r.kind === 'party')
    assertPlan(o, snap, ms)
    assert.deepEqual(o.rooms.filter(r => r.z === p.z).map(r => r.id), row)
    assert.equal(o.rooms.at(-1).id, 'lobby')
  }
})

test('the orchestrator desk is away: its worker takes the head seat', () => {
  const s = synthetic()
  // Two claude panes and a codex pane share a cwd. The working claude pane is the orchestrator.
  for (const id of ['w1:p1', 'w2:p1', 'w2:p4']) s.panes.find(p => p.pane_id === id).foreground_cwd = '/shared'
  s.agents.find(a => a.pane_id === 'w2:p4').agent_status = 'working'
  const ms = [meeting('S1', '/shared', 3)]
  const o = buildOffice(s, ms)
  assertPlan(o, s, ms)
  const room = o.rooms.find(r => r.id === 'meeting:S1')
  assert.deepEqual(o.desks.filter(d => d.away).map(d => [d.id, d.away]), [['w2:p4', { roomId: 'meeting:S1', ...room.seats[0] }]])
  assert.deepEqual(o.subagents[0], {
    id: 'S1-a0', roomId: 'meeting:S1', ...room.seats[1], seat: 1, sessionId: 'S1', deskId: 'w2:p4',
    label: 'build:0', phase: 'Build', model: 'opus', workflow: 'flow', runId: 'wf_1',
  })
  const desk = id => o.desks.find(d => d.id === id), plainDesk = buildOffice(s).desks
  assert.deepEqual([desk('w2:p4').x, desk('w2:p4').z], [plainDesk.find(d => d.id === 'w2:p4').x, plainDesk.find(d => d.id === 'w2:p4').z], 'the desk stays put')

  s.agents.find(a => a.pane_id === 'w2:p4').agent_status = 'idle' // no working claude pane: the first one
  assert.deepEqual(buildOffice(s, ms).desks.filter(d => d.away).map(d => d.id), ['w1:p1'])
  const lost = buildOffice(s, [meeting('S1', '/elsewhere', 3)]) // no herdr pane in that cwd: the head seat stays empty
  assert.ok(lost.desks.every(d => !d.away))
  assert.ok(lost.subagents.every(a => a.deskId === null))
})

test('a subagent keeps its seat while others come and go', () => {
  const s = synthetic(), m = meeting('S', '/x', 4), xz = o => Object.fromEntries(o.subagents.map(a => [a.id, [a.x, a.z]]))
  const a = buildOffice(s, [m])
  const gone = { ...m, agents: m.agents.filter((_, i) => i !== 1) } // the second agent leaves
  const b = buildOffice(s, [gone], a)
  assertPlan(b, s, [gone])
  for (const id of Object.keys(xz(b))) assert.deepEqual(xz(b)[id], xz(a)[id], `${id} stays put`)
  const back = { ...m, agents: [...gone.agents, { ...m.agents[1], agentId: 'S-new' }] } // a new agent, last in the list
  const c = buildOffice(s, [back], b)
  assertPlan(c, s, [back])
  assert.deepEqual(xz(c)['S-new'], xz(a)['S-a1'], 'the new agent takes the free seat nearest the head')
})

test('demo meeting: the lead and subagents that finish and restart', () => {
  const ids = new Set(), sizes = new Set()
  let prev = null
  for (let t = 0; t <= 90; t++) {
    const snap = demoSnapshot(t), ms = demoMeetings(t), o = buildOffice(snap, ms, prev)
    assert.equal(ms.length, 1)
    assertPlan(o, snap, ms)
    for (const a of o.subagents) { const was = prev?.subagents.find(x => x.id === a.id); if (was) assert.deepEqual([a.x, a.z], [was.x, was.z], `tick ${t}: ${a.id} stays put`) }
    prev = o
    assert.deepEqual(o.desks.filter(d => d.away).map(d => d.id), ['w1:p1'], `tick ${t}: the lead is in the meeting`)
    sizes.add(o.subagents.length)
    for (const a of o.subagents) ids.add(a.id)
  }
  assert.ok(Math.min(...sizes) >= 1 && Math.max(...sizes) >= 4 && sizes.size > 1, [...sizes].join())
  assert.ok(ids.size > 8, 'agents finish and new ones take the seats')
  assert.ok(new Set(demoMeetings(0)[0].agents.map(a => a.model)).size >= 3, 'mixed models')
  assert.deepEqual(demoMeetings(7), demoMeetings(7), 'deterministic')
})

test('the demo party room gets a ping-pong table and a chess table', () => {
  const o = buildOffice(demoSnapshot(0), demoMeetings(0))
  assertGames(o)
  assert.deepEqual(o.games.map((g) => [g.room, g.kind]), [['party', 'pingpong'], ['party', 'chess']])
})

test('a deep workspace room with one pod row gets a table on the door side of its main walk line', () => {
  // api has one pod of 3 desks side by side. web has 6 desks in one column, so the row is 16.2 deep.
  const s = plan([['api', [3]], ['web', [-6]]]), o = buildOffice(s), r = o.rooms.find((r) => r.label === 'api')
  assertPlan(o, s)
  assert.ok(free(r) >= 80 && r.pods.length === 1 && r.door.side === 'south', `api: ${free(r)} m² free, ${r.door.side} door`)
  assert.deepEqual(r.games.map((g) => g.kind), ['pingpong', 'chess'])
  for (const g of r.games) assert.ok(g.z - 0.6 > r.pods[0].z + r.pods[0].d + 0.4, `the ${g.kind} table at z ${g.z} is between the row lane and the door wall`)
})

test('a big room with no free place for a table gets none', () => {
  const s = plan([['api', [1, 1, 1, 1, 1, 1, 1, 1]]]), o = buildOffice(s), r = o.rooms[0] // 8 pods in one row, 6 deep
  assertPlan(o, s)
  assert.ok(free(r) >= 80, `${free(r)} m² free`)
  assert.deepEqual(r.games, [])
})

test('season() gives halloween from 24 Oct to 1 Nov and winter from 1 Dec to 6 Jan, by the local date', () => {
  const on = (m, d) => season(new Date(2026, m - 1, d))
  assert.deepEqual(
    [on(10, 23), on(10, 24), on(11, 1), on(11, 2), on(11, 30), on(12, 1), on(12, 31), on(1, 1), on(1, 6), on(1, 7)],
    [null, 'halloween', 'halloween', null, null, 'winter', 'winter', 'winter', 'winter', null],
  )
})

// The ghosts: the demo bounds and two made-up ones. A leg takes its length / 0.8 s, then the ghost hovers at its end point.
const GHOST_BOUNDS = [buildOffice(demoSnapshot(0), demoMeetings(0)).bounds, { w: 8, d: 12 }, { w: 41.7, d: 23.4 }]
const legTime = (p, q) => Math.hypot(q.x - p.x, q.z - p.z) / 0.8
const loopTime = (g) => g.reduce((s, p, i) => s + legTime(p, g[(i + 1) % g.length]) + g[(i + 1) % g.length].hover, 0)

test('ghosts() gives 3 loops of 8 points inside the building, the same for the same bounds', () => {
  for (const b of GHOST_BOUNDS) {
    const gs = ghosts(b)
    assert.equal(gs.length, 3)
    assert.deepEqual(ghosts({ ...b }), gs)
    assert.notDeepEqual(gs[0], gs[1])
    for (const g of gs) {
      assert.equal(g.length, 8)
      for (const p of g) {
        assert.ok(p.x >= 1 && p.x <= b.w - 1, `x ${p.x} in ${b.w}`)
        assert.ok(p.z >= 1 && p.z <= b.d - 1, `z ${p.z} in ${b.d}`)
        assert.ok(p.hover >= 2 && p.hover <= 5, `hover ${p.hover}`)
      }
    }
  }
})

test('ghostAt() floats at 0.8 a second or less inside the building, bobs from 0.3 to 0.4, and gives a unit direction', () => {
  for (const b of GHOST_BOUNDS) for (const g of ghosts(b)) {
    let prev = ghostAt(g, 0), lo = Infinity, hi = -Infinity
    for (let i = 1, end = 2 * loopTime(g); i * 0.05 <= end; i++) {
      const p = ghostAt(g, i * 0.05)
      assert.ok(p.x >= 1 - EPS && p.x <= b.w - 1 + EPS && p.z >= 1 - EPS && p.z <= b.d - 1 + EPS, `(${p.x}, ${p.z}) in ${b.w} x ${b.d}`)
      assert.ok(p.y >= 0.3 - EPS && p.y <= 0.4 + EPS, `y ${p.y}`)
      close(Math.hypot(p.dx, p.dz), 1, 'direction length')
      assert.ok(Math.hypot(p.x - prev.x, p.z - prev.z) <= 0.8 * 0.05 + 1e-6, `step at ${i * 0.05}`)
      lo = Math.min(lo, p.y)
      hi = Math.max(hi, p.y)
      prev = p
    }
    assert.ok(lo < 0.31 && hi > 0.39, `bob ${lo} to ${hi}`)
  }
})

test('ghostAt() hovers at each point for its hover time, facing the leg it came on, and the loop closes', () => {
  for (const b of GHOST_BOUNDS) for (const g of ghosts(b)) {
    close(ghostAt(g, 0).x, g[0].x, 'start x')
    close(ghostAt(g, 0).z, g[0].z, 'start z')
    let s = 0
    g.forEach((p, i) => {
      const q = g[(i + 1) % g.length], len = Math.hypot(q.x - p.x, q.z - p.z)
      s += legTime(p, q)
      for (const u of [s + 1e-6, s + q.hover / 2, s + q.hover - 1e-6]) {
        const a = ghostAt(g, u)
        close(a.x, q.x, `x at point ${i + 1}`)
        close(a.z, q.z, `z at point ${i + 1}`)
        close(a.dx, (q.x - p.x) / len, `dx at point ${i + 1}`)
        close(a.dz, (q.z - p.z) / len, `dz at point ${i + 1}`)
      }
      const a = ghostAt(g, s + q.hover + 0.05) // it moves again
      assert.ok(Math.hypot(a.x - q.x, a.z - q.z) > 0.01, `moves on after point ${i + 1}`)
      s += q.hover
    })
    for (const u of [0, 3.7, 41.2, 100]) {
      const a = ghostAt(g, u), c = ghostAt(g, u + s)
      close(a.x, c.x, `loop x at ${u}`)
      close(a.z, c.z, `loop z at ${u}`)
    }
  }
})

const TERRACE = { x: 14, z: 7.4, w: 5.6, d: 7.4 }

test('snowflakes() gives one flake for each cell of a grid of about 2 m² cells, each 0.3 or more inside the edges', () => {
  const fl = snowflakes(TERRACE)
  assert.equal(fl.length, 20)
  assert.ok(Math.abs(fl.length - TERRACE.w * TERRACE.d / 2) <= TERRACE.w * TERRACE.d / 20)
  for (const f of fl) {
    assert.ok(f.x >= TERRACE.x + 0.3 - 1e-9 && f.x <= TERRACE.x + TERRACE.w - 0.3 + 1e-9)
    assert.ok(f.z >= TERRACE.z + 0.3 - 1e-9 && f.z <= TERRACE.z + TERRACE.d - 0.3 + 1e-9)
  }
})

test('snowflakes() spreads the flakes over the terrace and gives the same flakes each call', () => {
  const fl = snowflakes(TERRACE)
  const mx = TERRACE.x + TERRACE.w / 2
  const mz = TERRACE.z + TERRACE.d / 2
  const quarters = [0, 0, 0, 0]
  for (const f of fl) quarters[(f.x < mx ? 0 : 1) + (f.z < mz ? 0 : 2)]++
  assert.ok(quarters.every(q => q >= 4), `quarters ${quarters}`)
  assert.deepEqual(snowflakes(TERRACE), fl)
})

test('the outdoor flakes form no lattice and do not fall in rows', () => {
  const fl = snowflakes(outdoors({ w: 35, d: 22 })[0])
  const offsets = new Set(), phases = new Set()
  for (const f of fl) {
    let best = null, dist = Infinity
    for (const g of fl) {
      const e = Math.hypot(f.x - g.x, f.z - g.z)
      if (g !== f && e < dist) { dist = e; best = g }
    }
    offsets.add(`${(best.x - f.x).toFixed(2)},${(best.z - f.z).toFixed(2)}`)
    phases.add(Math.abs(f.phase - best.phase).toFixed(2))
  }
  assert.ok(offsets.size >= 0.8 * fl.length, `offsets ${offsets.size} of ${fl.length}`)
  assert.ok(phases.size >= 30, `phase differences ${phases.size}`)
})

test('flakeAt() falls from 2.6 at 0.3 m/s, then starts again', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`)
  const f = { x: 15, z: 8, phase: 0 }
  near(flakeAt(f, 0).y, 2.6)
  near(flakeAt(f, 1).y, 2.3)
  near(flakeAt(f, 0.5 + 26 / 3).y, flakeAt(f, 0.5).y)
})

test('flakeAt() keeps each flake between the ground and 2.6, and 0.2 or more inside the terrace edges', () => {
  for (const f of snowflakes(TERRACE)) {
    for (let k = 0; k <= 200; k++) {
      const p = flakeAt(f, k / 10)
      assert.ok(p.y > 0 && p.y <= 2.6, `y ${p.y}`)
      assert.ok(Math.abs(p.x - f.x) <= 0.1 + 1e-9, `drift ${p.x - f.x}`)
      assert.equal(p.z, f.z)
      // the rail and the stub cap reach 0.17 into a terrace, and half a flake is 0.03
      assert.ok(p.x >= TERRACE.x + 0.2 - 1e-9 && p.x <= TERRACE.x + TERRACE.w - 0.2 + 1e-9, `x ${p.x}`)
      assert.ok(p.z >= TERRACE.z + 0.3 - 1e-9 && p.z <= TERRACE.z + TERRACE.d - 0.3 + 1e-9, `z ${p.z}`)
    }
  }
})

test('outdoors() gives 4 rects round the slab, with no overlap and the area of the band', () => {
  const b = { w: 35, d: 22 }, P = 0.3, M = 20.5
  const slab = [-P, -P, b.w + P, b.d + P]
  const rs = outdoors(b)
  assert.equal(rs.length, 4)
  const hit = (a, [x0, z0, x1, z1]) => a.x < x1 && a.x + a.w > x0 && a.z < z1 && a.z + a.d > z0
  for (const [i, r] of rs.entries()) {
    assert.ok(!hit(r, slab), `rect ${i} overlaps the slab`)
    for (const [j, q] of rs.entries()) if (j > i) assert.ok(!hit(r, [q.x, q.z, q.x + q.w, q.z + q.d]), `rects ${i} and ${j} overlap`)
  }
  const area = rs.reduce((n, r) => n + r.w * r.d, 0)
  assert.ok(Math.abs(area - ((b.w + 2 * P + 2 * M) * (b.d + 2 * P + 2 * M) - (b.w + 2 * P) * (b.d + 2 * P))) < 1e-9)
  assert.deepEqual(outdoors(b), rs)
})

test('outdoors() snow stays 0.2 or more outside the slab at every time', () => {
  const b = { w: 35, d: 22 }, P = 0.3
  for (const r of outdoors(b)) {
    for (const f of snowflakes(r)) {
      for (let k = 0; k <= 40; k++) {
        const p = flakeAt(f, k / 2)
        const out = Math.max(-P - p.x, p.x - (b.w + P), -P - p.z, p.z - (b.d + P))
        assert.ok(out >= 0.2 - 1e-9, `flake at ${p.x}, ${p.z} is ${out} from the slab`)
      }
    }
  }
})

test('twinkle() stays in 0.1..0.6 and swings the full range with amp 1', () => {
  let lo = 1, hi = 0
  for (const ph of [0, 2, 4]) for (let k = 0; k <= 200; k++) {
    const v = twinkle(ph, k * 0.05)
    assert.ok(v >= 0.1 - 1e-9 && v <= 0.6 + 1e-9, `${v}`)
    lo = Math.min(lo, v); hi = Math.max(hi, v)
  }
  assert.ok(lo < 0.12 && hi > 0.58, `${lo} ${hi}`)
})

test('twinkle() stays in 0.225..0.475 with amp 0.5', () => {
  for (let k = 0; k <= 200; k++) {
    const v = twinkle(1, k * 0.05, 0.5)
    assert.ok(v >= 0.225 - 1e-9 && v <= 0.475 + 1e-9, `${v}`)
  }
})

test('twinkle() peaks at 0.6 and repeats after 2 PI / 1.5 s', () => {
  assert.ok(Math.abs(twinkle(Math.PI / 2, 0) - 0.6) < 1e-9)
  assert.ok(Math.abs(twinkle(0.7, 1.3) - twinkle(0.7, 1.3 + 2 * Math.PI / 1.5)) < 1e-9)
})
