import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { socketPath, herdrRequest, startBridge, readMeetings } from '../bridge.mjs'

// macOS caps unix socket paths at 104 bytes, so the fake sockets use short paths relative to a temp cwd.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-sock-'))
process.chdir(dir)
after(() => fs.rmSync(dir, { recursive: true, force: true }))

const pub = path.join(dir, 'public')
fs.mkdirSync(pub)
fs.writeFileSync(path.join(pub, 'index.html'), '<meta name="office-token" content="__OFFICE_TOKEN__">')
fs.writeFileSync(path.join(pub, 'app.js'), 'export {}')
fs.writeFileSync(path.join(dir, 'secret.js'), 'SECRET')

const SNAP = {
  version: '0.8.2', protocol: 20,
  focused_workspace_id: 'w1', focused_tab_id: 'w1:t1', focused_pane_id: 'w1:p1',
  workspaces: [{ workspace_id: 'w1', number: 1, label: 'alpha', focused: true, pane_count: 2, tab_count: 1, active_tab_id: 'w1:t1', agent_status: 'working' }],
  tabs: [{ tab_id: 'w1:t1', workspace_id: 'w1', number: 1, label: 'main', focused: true, pane_count: 2, agent_status: 'working' }],
  panes: [
    { pane_id: 'w1:p1', terminal_id: 't1', workspace_id: 'w1', tab_id: 'w1:t1', focused: true, cwd: '/src/a', foreground_cwd: '/src/a', agent: 'claude', agent_status: 'working', terminal_title: 'x', terminal_title_stripped: 'x', revision: 1 },
    { pane_id: 'w1:p2', terminal_id: 't2', workspace_id: 'w1', tab_id: 'w1:t1', focused: false, cwd: '/src/b', foreground_cwd: '/src/b', agent_status: 'unknown', terminal_title: 'zsh', terminal_title_stripped: 'zsh', revision: 1 },
  ],
  layouts: [],
  agents: [{ pane_id: 'w1:p1', terminal_id: 't1', workspace_id: 'w1', tab_id: 'w1:t1', agent: 'claude', agent_status: 'working', focused: true, cwd: '/src/a', foreground_cwd: '/src/a', terminal_title: 'x', terminal_title_stripped: 'x', state_change_seq: 3, revision: 1 }],
}

const answer = (req) => {
  if (req.method === 'session.snapshot') return { result: { type: 'session_snapshot', snapshot: SNAP } }
  if (req.params.pane_id === 'w9:p9') return { error: { code: 'pane_not_found', message: 'no pane w9:p9' } }
  return { result: { type: 'ok' } }
}

// Fake herdr server: records each request line; reply() returns the body to send, or null to never answer.
let n = 0
function fakeHerdr(reply = answer) {
  const sock = `h${++n}.sock`
  const lines = []
  const server = net.createServer((c) => {
    let buf = ''
    c.on('data', (d) => {
      buf += d
      if (!buf.includes('\n')) return
      lines.push(buf)
      const req = JSON.parse(buf)
      const body = reply(req)
      if (body) c.end(JSON.stringify({ id: req.id, ...body }) + '\n')
    })
  })
  server.unref() // a failed test must not leave the process hanging on a fake
  return new Promise((resolve) => server.listen(sock, () =>
    resolve({ sock, lines, close: () => new Promise((r) => server.close(r)) })))
}

function request(port, method, p, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      let data = ''
      res.on('data', (d) => { data += d })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
    })
    r.on('error', reject)
    r.end(body)
  })
}

function sse(port) {
  const msgs = []
  const waiters = []
  let buf = ''
  const r = http.get({ host: '127.0.0.1', port, path: '/events' }, (res) => {
    assert.match(res.headers['content-type'], /^text\/event-stream/)
    res.setEncoding('utf8')
    res.on('data', (d) => {
      buf += d
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const m = JSON.parse(buf.slice(0, i).replace(/^data: /, ''))
        buf = buf.slice(i + 2)
        if (waiters.length) waiters.shift()(m)
        else msgs.push(m)
      }
    })
  })
  r.on('error', () => {})
  return {
    msgs,
    next: () => (msgs.length ? Promise.resolve(msgs.shift()) : new Promise((res) => waiters.push(res))),
    close: () => r.destroy(),
  }
}

const portOf = (b) => Number(new URL(b.url).port)

test('socketPath precedence', () => {
  const home = '/home/u'
  const all = { HERDR_SOCKET_PATH: '/x.sock', HERDR_SESSION: 's1', XDG_CONFIG_HOME: '/cfg' }
  assert.equal(socketPath(all, home), '/x.sock')
  assert.equal(socketPath({ HERDR_SESSION: 's1', XDG_CONFIG_HOME: '/cfg' }, home), '/cfg/herdr/sessions/s1/herdr.sock')
  assert.equal(socketPath({ HERDR_SESSION: 's1' }, home), '/home/u/.config/herdr/sessions/s1/herdr.sock')
  assert.equal(socketPath({ XDG_CONFIG_HOME: '/cfg' }, home), '/cfg/herdr/herdr.sock')
  assert.equal(socketPath({}, home), '/home/u/.config/herdr/herdr.sock')
})

test('herdrRequest sends one line with params and resolves the result', async () => {
  const fake = await fakeHerdr()
  const result = await herdrRequest(fake.sock, 'session.snapshot')
  assert.deepEqual(result, { type: 'session_snapshot', snapshot: SNAP })
  assert.deepEqual(fake.lines, ['{"id":"office:snap","method":"session.snapshot","params":{}}\n'])
  await fake.close()
})

test('herdrRequest rejects an error object, a timeout, and a missing socket', async () => {
  const fake = await fakeHerdr()
  await assert.rejects(herdrRequest(fake.sock, 'pane.focus', { pane_id: 'w9:p9' }), /pane_not_found/)
  await fake.close()

  const mute = await fakeHerdr(() => null)
  const t0 = Date.now()
  await assert.rejects(herdrRequest(mute.sock, 'session.snapshot', {}, 100), /timed out/)
  assert.ok(Date.now() - t0 < 1000)
  await mute.close()

  await assert.rejects(herdrRequest('missing.sock', 'session.snapshot'), /ENOENT/)
})

test('GET / injects the token, static files serve, traversal is blocked', async () => {
  const b = await startBridge({ sock: 'none.sock', port: 0, publicDir: pub, token: 'tok-abc' })
  const port = portOf(b)
  try {
    const home = await request(port, 'GET', '/')
    assert.equal(home.status, 200)
    assert.match(home.headers['content-type'], /^text\/html/)
    assert.ok(home.body.includes('content="tok-abc"'))
    assert.ok(!home.body.includes('__OFFICE_TOKEN__'))
    assert.equal(home.headers['access-control-allow-origin'], undefined)
    assert.equal(home.headers['x-frame-options'], 'DENY', 'no framing of the page that holds the token')
    assert.equal(home.headers['cache-control'], 'no-store', 'no stale token from a cache')

    const js = await request(port, 'GET', '/app.js')
    assert.equal(js.status, 200)
    assert.match(js.headers['content-type'], /^text\/javascript/)

    assert.equal((await request(port, 'GET', '/missing.js')).status, 404)

    for (const p of ['/../secret.js', '/%2e%2e/secret.js', '/..%2fsecret.js', '/%2e%2e%2fsecret.js', '/%2E%2E%2Fsecret.js']) {
      const r = await request(port, 'GET', p)
      assert.notEqual(r.status, 200, p)
      assert.ok(!r.body.includes('SECRET'), p)
    }

    await request(port, 'GET', '//').catch(() => {}) // new URL('//', base) throws; the bridge must survive it
    assert.equal((await request(port, 'GET', '/')).status, 200)

    assert.equal((await request(port, 'GET', '/', { host: `evil.test:${port}` })).status, 403)
    assert.equal((await request(port, 'GET', '/', { host: `localhost:${port}` })).status, 200)
  } finally {
    await b.close()
  }
})

test('startBridge makes a random token when none is given', async () => {
  const b = await startBridge({ sock: 'none.sock', port: 0, publicDir: pub })
  try {
    assert.match(b.token, /^[0-9a-f-]{36}$/)
  } finally {
    await b.close()
  }
})

test('GET /events: sends the snapshot, then changes only, then offline', async () => {
  const fake = await fakeHerdr()
  const b = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, pollMs: 20 })
  const es = sse(portOf(b))
  try {
    assert.deepEqual(await es.next(), { online: true, snapshot: SNAP, meetings: [] }, 'no claudeDir, no meetings')
    await sleep(120)
    assert.equal(es.msgs.length, 0, 'an unchanged snapshot sends nothing')
    assert.ok(fake.lines.length > 2, 'the bridge keeps polling')

    await fake.close()
    const off = await es.next()
    assert.equal(off.online, false)
    assert.equal(off.snapshot, null)
    assert.equal(typeof off.error, 'string')
    await sleep(120)
    assert.equal(es.msgs.length, 0, 'offline is sent once')
  } finally {
    es.close()
    await b.close()
  }
})

test('the bridge polls only while an SSE client is connected', async () => {
  const fake = await fakeHerdr()
  const b = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, pollMs: 20 })
  try {
    await sleep(100)
    assert.equal(fake.lines.length, 0, 'no client, no poll')
    const es = sse(portOf(b))
    await es.next()
    es.close()
    await sleep(60)
    const count = fake.lines.length
    await sleep(100)
    assert.equal(fake.lines.length, count, 'the poll stops after the last client leaves')
  } finally {
    await b.close()
    await fake.close()
  }
})

test('the bridge drops an SSE client that stops reading', async () => {
  let k = 0
  const big = (req) => ({ result: { type: 'session_snapshot', snapshot: { ...SNAP, version: String(k++), pad: 'x'.repeat(300_000) } } })
  const fake = await fakeHerdr(big)
  const b = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, pollMs: 10 })
  const port = portOf(b)
  const c = net.connect(port, '127.0.0.1', () => c.write(`GET /events HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`))
  c.on('error', () => {})
  c.pause() // a frozen client: the bridge's buffer for it grows with each changed snapshot
  try {
    // The poll runs only while a client is connected, so a still request count means the bridge dropped it.
    while (!fake.lines.length) await sleep(10)
    let count = -1
    for (let i = 0; i < 40 && fake.lines.length !== count; i++) {
      count = fake.lines.length
      await sleep(250)
    }
    assert.equal(fake.lines.length, count, 'the bridge still polls for a client that reads nothing')
  } finally {
    c.destroy()
    await b.close()
    await fake.close()
  }
})

test('POST /action: guards, then pane.focus', async () => {
  const fake = await fakeHerdr()
  const TOKEN = 'tok-123'
  let raised = 0
  const b = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, token: TOKEN, raise: () => raised++ })
  const port = portOf(b)
  const post = (body, headers = { 'x-office-token': TOKEN }) => request(port, 'POST', '/action', headers, body)
  const focus = (pane_id) => JSON.stringify({ type: 'focus', pane_id })
  try {
    assert.equal((await post(focus('w1:p2'), { 'x-office-token': 'wrong' })).status, 403)
    assert.equal((await post(focus('w1:p2'), { 'x-office-token': 'tok-12' })).status, 403)
    assert.equal((await post(focus('w1:p2'), {})).status, 403)
    assert.equal((await post(focus('w1:p2'), { 'x-office-token': TOKEN, host: `evil.test:${port}` })).status, 403)

    for (const bad of ['w1:p2; rm -rf', '../w1:p2', 'w1:t1', '', 'w1:p2\n']) {
      assert.equal((await post(focus(bad))).status, 400, bad)
    }
    for (const bad of ['nope', '{}', JSON.stringify({ type: 'prompt', pane_id: 'w1:p2' }), JSON.stringify({ type: 'focus', pane_id: ['w1:p2'] }), 'null']) {
      assert.equal((await post(bad)).status, 400, bad)
    }
    const big = await post(JSON.stringify({ type: 'focus', pane_id: 'w1:p2', pad: 'x'.repeat(5000) }))
    assert.ok([400, 413].includes(big.status), String(big.status))
    assert.equal(fake.lines.length, 0, 'no rejected request reaches herdr')
    assert.equal(raised, 0, 'no rejected request raises WezTerm')

    const ok = await post(focus('w1:p2'))
    assert.equal(ok.status, 200)
    assert.deepEqual(JSON.parse(ok.body), { ok: true })
    assert.deepEqual(fake.lines, ['{"id":"office:focus","method":"pane.focus","params":{"pane_id":"w1:p2"}}\n'])
    assert.equal(raised, 1, 'a focus raises WezTerm')

    const fail = await post(focus('w9:p9'))
    assert.equal(fail.status, 502)
    assert.match(JSON.parse(fail.body).error, /pane_not_found/)
    assert.equal(raised, 1, 'a herdr error does not raise WezTerm')

    const b2 = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, token: TOKEN, raise: () => { throw new Error('x') } })
    try {
      const thrown = await request(portOf(b2), 'POST', '/action', { 'x-office-token': TOKEN }, focus('w1:p2'))
      assert.equal(thrown.status, 200, 'a throw in raise does not change the reply')
      assert.deepEqual(JSON.parse(thrown.body), { ok: true })
    } finally {
      await b2.close()
    }
  } finally {
    await b.close()
    await fake.close()
  }
})

// ---- Claude Code subagents: a fake ~/.claude/projects tree. All names and texts are made up. ----
const SECRET = 'TOP-SECRET-TRANSCRIPT-TEXT'
const projects = path.join(dir, 'projects')
const esc = (cwd) => cwd.replace(/[^a-zA-Z0-9]/g, '-')
const line = (o) => JSON.stringify(o) + '\n'
function write(file, text, ageS = 0) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  const t = (Date.now() - ageS * 1000) / 1000
  fs.utimesSync(file, t, t)
}
// A session transcript: a prompt record first, then a record with the cwd. Returns the session folder.
function session(cwd, id, ageS = 0) {
  const p = path.join(projects, esc(cwd), id)
  write(`${p}.jsonl`, line({ type: 'last-prompt', lastPrompt: SECRET }) + line({ type: 'user', cwd, sessionId: id, message: { role: 'user', content: SECRET } }), ageS)
  return p
}
const said = (stop) => line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: SECRET }], stop_reason: stop } })
// A workflow run: journal events, the script file (its name holds the workflow name), and agent files.
function run(s, runId, events, metas = {}) {
  write(path.join(s, 'subagents', 'workflows', runId, 'journal.jsonl'), events.map(line).join(''))
  write(path.join(s, 'workflows', 'scripts', `my-flow-${runId}.js`), `// ${SECRET}`)
  for (const [id, meta] of Object.entries(metas)) {
    write(path.join(s, 'subagents', 'workflows', runId, `agent-${id}.meta.json`), JSON.stringify(meta))
    write(path.join(s, 'subagents', 'workflows', runId, `agent-${id}.jsonl`), said(null))
  }
}
const plain = (s, id, meta, tail, ageS = 0) => {
  write(path.join(s, 'subagents', `agent-${id}.meta.json`), JSON.stringify({ agentType: 'general-purpose', ...meta }))
  write(path.join(s, 'subagents', `agent-${id}.jsonl`), said(null) + tail, ageS)
}

test('readMeetings: running workflow and plain subagents of the newest session per herdr cwd', async () => {
  const cwd = '/w/my-app'
  const old = session(cwd, 'old-s', 100) // an older session in the same cwd: never read
  run(old, 'wf_old', [{ type: 'started', key: 'k', agentId: 'OLD', label: 'old' }])
  session('/w/my.app', 'other', 0) // the newest file in the same folder, but its real cwd differs (the folder name is lossy)
  const s = session(cwd, 's1', 10)
  run(s, 'wf_1', [
    { type: 'launched' },
    { type: 'started', key: 'k1', agentId: 'A', label: 'build:a', phase: 'Build' },
    { type: 'started', key: 'k2', agentId: 'B', label: 'build:b', phase: 'Build' },
    { type: 'result', key: 'k2', agentId: 'B', result: { text: SECRET } },
    { type: 'started', key: 'k3', agentId: 'C', label: 'build:c', phase: 'Build' },
    { type: 'failed', key: 'k3', agentId: 'C' },
    { type: 'started', key: 'k4', agentId: 'D' }, // no label or phase in the journal: the meta has them
  ], {
    A: { agentType: 'workflow-subagent', description: 'build:a', workflowPhase: 'Build', model: 'sonnet' },
    D: { agentType: 'workflow-subagent', description: 'verify', workflowPhase: 'Verify' },
  })
  run(s, 'wf_2', [{ type: 'started', key: 'k1', agentId: 'E', label: 'ended run' }])
  write(path.join(s, 'workflows', 'wf_2.json'), JSON.stringify({ status: 'completed', result: SECRET })) // the run ended
  plain(s, 'P1', { description: 'plain one', model: 'haiku' }, line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }], stop_reason: 'tool_use' } }))
  plain(s, 'P2', { description: 'plain done' }, said('end_turn'))
  plain(s, 'P3', { description: 'plain stopped' }, said('stop_sequence'))
  plain(s, 'P4', { description: 'plain quiet' }, said(null), 60) // no end marker, but quiet for 60 s
  session('/w/idle', 'idle-s') // a herdr cwd with no running subagents
  const hidden = session('/w/not-in-herdr', 'h')
  run(hidden, 'wf_h', [{ type: 'started', key: 'k', agentId: 'H', label: 'hidden' }])

  const out = await readMeetings(projects, [cwd, '/w/idle', cwd, '/w/missing'])
  assert.deepEqual(out, [{
    sessionId: 's1', cwd, agents: [
      { agentId: 'A', label: 'build:a', phase: 'Build', model: 'sonnet', workflow: 'my-flow', runId: 'wf_1' },
      { agentId: 'D', label: 'verify', phase: 'Verify', model: null, workflow: 'my-flow', runId: 'wf_1' },
      { agentId: 'P1', label: 'plain one', phase: null, model: 'haiku', workflow: null, runId: null },
    ],
  }])
  assert.ok(!JSON.stringify(out).includes(SECRET), 'no transcript text reaches the output')
  assert.deepEqual(await readMeetings(path.join(dir, 'no-such-dir'), [cwd]), [])
})

test('readMeetings: a bad file or input drops only itself', async () => {
  const cwd = '/w/robust'
  const s = session(cwd, 'r1', 10)
  fs.mkdirSync(path.join(projects, esc(cwd), 'zz.jsonl')) // the newest entry, but a folder: not a transcript
  const evil = '/' + '../'.repeat(40) + path.join(dir, 'outside', 'evil').slice(1) // an agent id that climbs out of the run folder
  write(path.join(dir, 'outside', 'evil.meta.json'), JSON.stringify({ description: 'READ_FROM_OUTSIDE' }))
  run(s, 'wf_r', [
    null, // a journal line that parses to null
    { type: 'started', key: 'k1', agentId: 'OK1', label: 'ok' },
    { type: 'started', key: 'k2', agentId: evil },
    { type: 'started', key: 'k3', agentId: 'NUL', label: 'nul' },
  ], { OK1: { model: 'sonnet' } })
  write(path.join(s, 'subagents', 'workflows', 'wf_r', 'agent-NUL.meta.json'), 'null')
  write(path.join(projects, esc('/w/bad-json'), 'b.jsonl'), '{"cwd":"\\q"}\n') // a head that the cwd regex finds but JSON.parse rejects
  const out = await readMeetings(projects, [null, '/w/bad-json', cwd])
  assert.deepEqual(out, [{
    sessionId: 'r1', cwd, agents: [
      { agentId: 'OK1', label: 'ok', phase: null, model: 'sonnet', workflow: 'my-flow', runId: 'wf_r' },
      { agentId: 'NUL', label: 'nul', phase: null, model: null, workflow: 'my-flow', runId: 'wf_r' },
    ],
  }])
  assert.ok(!JSON.stringify(out).includes('READ_FROM_OUTSIDE'))
})

test('readMeetings: a late cwd, a quiet workflow agent, and the model from the transcript tail', async () => {
  const cwd = '/w/late', p = path.join(projects, esc(cwd), 'late')
  // The first 32 KB hold no cwd: a big record comes first.
  write(`${p}.jsonl`, line({ type: 'file-history-snapshot', pad: SECRET + 'x'.repeat(40_000) }) + line({ type: 'user', cwd, sessionId: 'late', message: { content: SECRET } }))
  run(p, 'wf_t', [
    { type: 'started', key: 'k1', agentId: 'Q1', label: 'quiet' }, // its run JSON never comes, and its transcript stopped 31 min ago
    { type: 'started', key: 'k2', agentId: 'M1', label: 'tail model' },
  ], { Q1: {}, M1: {} })
  const runDir = path.join(p, 'subagents', 'workflows', 'wf_t')
  write(path.join(runDir, 'agent-Q1.jsonl'), said(null), 31 * 60)
  const used = (model, input) => line({ type: 'assistant', message: { model, content: [{ type: 'tool_use', input }], stop_reason: 'tool_use' } })
  // Only a claude-* id counts: a "model" key with other text (here in a tool input) never reaches the output.
  write(path.join(runDir, 'agent-M1.jsonl'), used('claude-opus-5-5', {}) + used('<synthetic>', { model: SECRET }))
  plain(p, 'PM', { description: 'plain model' }, used('claude-haiku-4-5', {}))
  const out = await readMeetings(projects, [cwd])
  assert.deepEqual(out, [{
    sessionId: 'late', cwd, agents: [
      { agentId: 'M1', label: 'tail model', phase: null, model: 'claude-opus-5-5', workflow: 'my-flow', runId: 'wf_t' },
      { agentId: 'PM', label: 'plain model', phase: null, model: 'claude-haiku-4-5', workflow: null, runId: null },
    ],
  }])
  assert.ok(!JSON.stringify(out).includes(SECRET))
})

test('GET /events: adds the meetings of herdr claude agents, read at the slower rate', async () => {
  const s = session('/src/a', 'live') // the cwd of the claude agent in SNAP
  run(s, 'wf_live', [{ type: 'started', key: 'k1', agentId: 'L', label: 'build:live', phase: 'Build' }], { L: { model: 'opus' } })
  const fake = await fakeHerdr()
  const b = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, pollMs: 20, claudeDir: projects, meetMs: 60 })
  const es = sse(portOf(b))
  try {
    const first = await es.next()
    assert.deepEqual(first, {
      online: true, snapshot: SNAP,
      meetings: [{ sessionId: 'live', cwd: '/src/a', agents: [{ agentId: 'L', label: 'build:live', phase: 'Build', model: 'opus', workflow: 'my-flow', runId: 'wf_live' }] }],
    })
    fs.appendFileSync(path.join(s, 'subagents', 'workflows', 'wf_live', 'journal.jsonl'), line({ type: 'result', key: 'k1', agentId: 'L', result: { text: SECRET } }))
    assert.deepEqual(await es.next(), { online: true, snapshot: SNAP, meetings: [] }, 'a finished agent leaves')
    assert.ok(fake.lines.length >= 3, 'the snapshot poll runs faster than the meetings read')
  } finally {
    es.close()
    await b.close()
    await fake.close()
  }
})
