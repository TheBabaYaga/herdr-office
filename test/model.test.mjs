import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STATUS_RANK, STATUS_COLOR, rollup, buildOffice, demoSnapshot, demoMeetings } from '../public/model.js'

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
  assertParty(o, rows, W)
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
    assert.ok(Math.abs(row.at(-1).x + row.at(-1).w - W) < EPS, 'every row spans the same width')
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

  // Rooms and corridors tile the whole building: inside bounds, no overlap, no gap.
  const rects = [...o.rooms, ...o.corridors]
  for (const r of rects) assert.ok(r.x >= 0 && r.z >= 0 && r.x + r.w <= o.bounds.w + EPS && r.z + r.d <= o.bounds.d + EPS, 'inside bounds')
  rects.forEach((a, i) => rects.slice(i + 1).forEach(b => assert.ok(!overlap(a, b), `${a.id ?? 'corridor'} overlaps ${b.id ?? 'corridor'}`)))
  assert.ok(Math.abs(rects.reduce((s, r) => s + r.w * r.d, 0) - o.bounds.w * o.bounds.d) < 1e-6, 'no gaps')

  for (const r of o.rooms) for (const p of r.pods) assert.ok(p.x >= r.x + 1.5 - EPS && p.z >= r.z + 1.5 - EPS && p.x + p.w <= r.x + r.w - 1.5 + EPS && p.z + p.d <= r.z + r.d - 1.5 + EPS, `${p.id} inside its room`)
  for (const d of o.desks) {
    const r = o.rooms.find(r => r.id === d.roomId)
    assert.ok(d.x - 1 >= r.x && d.x + 1 <= r.x + r.w && d.z - 0.75 >= r.z && d.z + 0.75 <= r.z + r.d, `${d.id} inside its room`)
  }
  assertSpacing(o.desks)
}

// The party room fills the row with the most spare width (the first on a tie), if that width is 7 or more. The spare width is the
// building width minus the normal widths of the other rooms in the row. The other rooms of the party row keep their normal width.
// Each other row stretches as before: every room gets the same extra width.
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} is not ${b}`)
const span = (r) => r.pods.length ? Math.max(...r.pods.map(p => p.x + p.w)) - Math.min(...r.pods.map(p => p.x)) : 0
const normal = (r) => r.kind === 'workspace' ? Math.max(7, 3 + span(r)) : r.kind === 'meeting' ? Math.max(8, r.table.len + 2.6) : 8
function assertParty(o, rows, W) {
  const spare = rows.map(row => W - row.filter(r => r.kind !== 'party').reduce((s, r) => s + normal(r), 0))
  const most = Math.max(...spare), at = spare.findIndex(s => s > most - 1e-6), party = o.rooms.filter(r => r.kind === 'party')
  assert.equal(party.length, most >= 7 ? 1 : 0, `a party room only for a spare width of 7 or more (${most})`)
  rows.forEach((row, i) => {
    if (party.length && i === at) {
      const p = party[0]
      assert.equal(row.at(-1).kind === 'lobby' ? row.at(-2) : row.at(-1), p, 'the party room is the last room of its row, or just before the lobby')
      assert.deepEqual([p.id, p.door.side], ['party', i % 2 ? 'north' : 'south'])
      close(p.w, spare[i], 'the party room takes the spare width')
      for (const r of row) if (r !== p) close(r.w, normal(r), `${r.id} keeps its normal width`)
    } else for (const r of row) close(r.w, normal(r) + spare[i] / row.length, `${r.id} stretches`)
  })
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
  bounds: o.bounds, corridors: o.corridors, entrance: o.entrance,
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

test('no party room without a row with 7 or more spare width', () => {
  const s = synthetic(), o = buildOffice(s) // the most spare width is 6.9
  assert.deepEqual(o.rooms.map(r => r.id), ['w1', 'w2', 'meeting', 'kitchen', 'lobby'])
  assertPlan(o, s) // each row stretches to the building width as before
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
