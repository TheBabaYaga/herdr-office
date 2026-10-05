// Pure model: herdr session snapshot -> office layout. No imports, no DOM.
// Floor plane is x/z (y is up). North is -z, south is +z.

export const STATUS_RANK = { unknown: 0, idle: 1, working: 2, done: 3, blocked: 4 }
export const STATUS_COLOR = { working: '#f9e2af', blocked: '#f38ba8', done: '#94e2d5', idle: '#a6e3a1', unknown: '#6c7086' }

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

// ---- Demo: a fake session with the same shape as a real snapshot. ----

const AREA = { x: 30, y: 1, width: 200, height: 60 }
const CYCLE = ['working', 'blocked', 'done', 'idle']
const DEMO_WORKSPACES = { w1: 'api', w2: 'web', w3: 'docs', w4: 'infra' }
const DEMO_TABS = { 'w1:t1': 'server', 'w2:t1': 'app', 'w2:t2': 'tests', 'w3:t1': 'notes', 'w4:t1': 'deploy', 'w4:t2': 'ops' }
// pane id, tab id, agent kind (null = shell), rect [x, y, w, h] in cells inside AREA, status phase, agent name.
// Outside the focused tab w1:t1, phases 0, 3, 6 and 9 sit one cycle step apart, so every tick shows all four CYCLE statuses.
// The focused tab never shows done. Its phases give the idle agent while w4:p1 is still unknown.
const DEMO_PANES = [
  ['w1:p1', 'w1:t1', 'claude', [0, 0, 100, 30], 1, 'lead'],
  ['w1:p2', 'w1:t1', 'codex', [100, 0, 100, 30], 5],
  ['w1:p3', 'w1:t1', null, [0, 30, 100, 30]],
  ['w1:p4', 'w1:t1', 'gemini', [100, 30, 100, 30], 10],
  ['w2:p1', 'w2:t1', 'opencode', [0, 0, 100, 60], 6],
  ['w2:p2', 'w2:t1', null, [100, 0, 100, 60]],
  ['w2:p3', 'w2:t2', 'claude', [0, 0, 200, 60], 0, 'tester'],
  ['w3:p1', 'w3:t1', 'codex', [0, 0, 100, 60], 3],
  ['w3:p2', 'w3:t1', null, [100, 0, 100, 30]],
  ['w3:p3', 'w3:t1', null, [100, 30, 100, 30]],
  ['w4:p1', 'w4:t1', 'gemini', [0, 0, 200, 60], 9],
  ['w4:p2', 'w4:t2', null, [0, 0, 200, 60]],
]

export function demoSnapshot(tick) {
  const panes = [], agents = [], layouts = []
  DEMO_PANES.forEach(([id, tab, kind, r, phase, name], i) => {
    const ws = id.split(':')[0]
    const step = Math.floor((tick + phase) / 3)
    // w4:p1 is a new agent: herdr reports unknown during its first 3 s.
    let status = !kind || (id === 'w4:p1' && tick < 3) ? 'unknown' : CYCLE[step % 4]
    // herdr marks a completion in the active tab as seen at once, so it shows idle there.
    if (status === 'done' && tab === 'w1:t1') status = 'idle'
    // herdr bumps one server-wide counter on each state change. done -> idle only marks the pane seen, so the seq stays.
    const changed = tick - (tick + phase) % 3 - (step % 4 === 3 ? 3 : 0) // the tick of the last state change
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
        state_change_seq: (changed + 12) * 16 + i, revision: tick, // + 12 keeps it positive, * 16 + i breaks ties
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
