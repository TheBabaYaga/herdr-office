import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { EventEmitter } from 'node:events'
import { socketPath, herdrRequest, startBridge, readMeetings, readMessages, readCodexMessages, messagesIn, codexMessagesIn, bundleIdsIn, pickTerminal, raiser, openUrl, newer, latestRelease } from '../bridge.mjs'

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
  if (req.params.target === 'w9:p9') return { error: { code: 'agent_blocked', message: 'agent w9:p9 waits for an answer' } }
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

test('GET / and static files come from readStatic, with the same guards', async () => {
  const files = new Map([['index.html', '<meta name="office-token" content="__OFFICE_TOKEN__">'], ['app.js', 'export {}']])
  const seen = []
  const readStatic = (rel) => {
    seen.push(rel)
    if (!files.has(rel)) throw new Error('no asset')
    return Buffer.from(files.get(rel))
  }
  const b = await startBridge({ sock: 'none.sock', port: 0, publicDir: '/virtual/public', readStatic, token: 'tok-abc' })
  const port = portOf(b)
  try {
    const home = await request(port, 'GET', '/')
    assert.equal(home.status, 200)
    assert.ok(home.body.includes('content="tok-abc"'))
    assert.equal(home.headers['cache-control'], 'no-store')
    assert.equal(home.headers['x-frame-options'], 'DENY')
    assert.ok(seen.includes('index.html'))
    const js = await request(port, 'GET', '/app.js')
    assert.equal(js.status, 200)
    assert.match(js.headers['content-type'], /^text\/javascript/)
    assert.equal((await request(port, 'GET', '/missing.js')).status, 404)
    for (const p of ['/../secret.js', '/%2e%2e/secret.js', '/..%2fsecret.js', '/%2e%2e%2fsecret.js', '/%2E%2E%2Fsecret.js']) {
      assert.notEqual((await request(port, 'GET', p)).status, 200, p)
    }
    assert.ok(seen.every((r) => !r.startsWith('..') && !r.startsWith('/')), seen.join())
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
    assert.deepEqual(await es.next(), { online: true, snapshot: SNAP, meetings: [], update: null }, 'no claudeDir, no meetings')
    await sleep(120)
    assert.equal(es.msgs.length, 0, 'an unchanged snapshot sends nothing')
    assert.ok(fake.lines.length > 2, 'the bridge keeps polling')

    await fake.close()
    const off = await es.next()
    assert.equal(off.online, false)
    assert.equal(off.snapshot, null)
    assert.equal(typeof off.error, 'string')
    assert.equal(off.update, null)
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

test('quitMs: the bridge quits after quitMs with no SSE client', async () => {
  const fake = await fakeHerdr()
  let calls = 0
  const b = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, quitMs: 150, quit: () => { calls++ } })
  try {
    await sleep(400)
    assert.equal(calls, 1)
  } finally {
    await b.close()
    await fake.close()
  }
})

test('quitMs: an SSE client holds the bridge, and its close starts the time again', async () => {
  const fake = await fakeHerdr()
  let calls = 0
  const b = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, pollMs: 20, quitMs: 150, quit: () => { calls++ } })
  try {
    const es = sse(portOf(b))
    await es.next()
    await sleep(300)
    assert.equal(calls, 0)
    es.close()
    await sleep(400)
    assert.equal(calls, 1)
  } finally {
    await b.close()
    await fake.close()
  }
})

test('without quitMs the bridge never quits', async () => {
  const fake = await fakeHerdr()
  let threw = false
  const b = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, quit: () => { threw = true } })
  try {
    await sleep(300)
    assert.equal(threw, false)
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

test('newer: compares X.Y.Z as three numbers, and any other form gives false', () => {
  assert.equal(newer('0.2.0', '0.1.0'), true)
  assert.equal(newer('v0.10.0', '0.9.9'), true)
  assert.equal(newer('1.0.0', '0.99.99'), true)
  assert.equal(newer('0.1.0', 'v0.1.0'), false, 'equal')
  assert.equal(newer('0.1.0', '0.2.0'), false, 'older')
  for (const [a, b] of [['0.2.0', '0.0.0-dev'], ['0.0.0-dev', '0.1.0'], ['nightly', '0.1.0'], ['0.2.0', 'nightly'], [null, '0.1.0'], ['0.2.0', null]]) {
    assert.equal(newer(a, b), false, `${a} vs ${b}`)
  }
})

test('latestRelease: one GET to the releases API, and a bad status or tag rejects', async () => {
  const calls = []
  const fetchFn = (body, status = 200) => async (url, opts) => (calls.push([url, opts]), { status, json: async () => body })
  assert.equal(await latestRelease(fetchFn({ tag_name: 'v0.2.0' })), '0.2.0')
  assert.equal(calls[0][0], 'https://api.github.com/repos/TheBabaYaga/herdr-office/releases/latest')
  assert.equal(calls[0][1].headers.accept, 'application/vnd.github+json')
  assert.ok(calls[0][1].signal instanceof AbortSignal)
  assert.equal(await latestRelease(fetchFn({ tag_name: '0.3.0' }), 'https://x.test/latest'), '0.3.0')
  assert.equal(calls[1][0], 'https://x.test/latest')
  await assert.rejects(latestRelease(fetchFn({ tag_name: 'v0.2.0' }, 403)), /403/)
  await assert.rejects(latestRelease(fetchFn({ tag_name: 'nightly' })))
  await assert.rejects(latestRelease(fetchFn(null)))
})

// A fake latest(): it gives the results in turn, then repeats the last one. An Error rejects.
const releases = (...rs) => {
  const f = async () => {
    const r = rs[Math.min(f.calls++, rs.length - 1)]
    if (r instanceof Error) throw r
    return r
  }
  f.calls = 0
  return f
}
const until = async (es, ok) => { for (;;) { const m = await es.next(); if (ok(m)) return m } }

test('update: the start call finds a newer version, the same version keeps it, another newer one replaces it', async () => {
  const fake = await fakeHerdr()
  const latest = releases('0.2.0', '0.2.0', '0.3.0')
  const b = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, pollMs: 10, version: '0.1.0', latest, updateMs: 80 })
  const es = sse(portOf(b))
  try {
    assert.deepEqual((await until(es, (m) => m.update)).update, { current: '0.1.0', latest: '0.2.0', atStart: true })
    assert.deepEqual((await es.next()).update, { current: '0.1.0', latest: '0.3.0', atStart: false }, 'the same version sends nothing')
    await fake.close()
    const off = await es.next()
    assert.equal(off.online, false)
    assert.deepEqual(off.update, { current: '0.1.0', latest: '0.3.0', atStart: false }, 'the offline message carries update')
  } finally {
    es.close()
    await b.close()
  }
})

test('update: the same version at the start and a later older one give null, and close() stops the calls', async () => {
  const fake = await fakeHerdr()
  const latest = releases('0.1.0', '0.0.9')
  const b = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, pollMs: 10, version: '0.1.0', latest, updateMs: 30 })
  const es = sse(portOf(b))
  try {
    assert.deepEqual(await es.next(), { online: true, snapshot: SNAP, meetings: [], update: null })
    while (latest.calls < 3) await sleep(10)
    await sleep(30)
    assert.equal(es.msgs.length, 0, 'update stays null')
  } finally {
    es.close()
    await b.close()
    await fake.close()
  }
  const calls = latest.calls
  await sleep(100)
  assert.equal(latest.calls, calls, 'close() clears the timer')
})

test('update: a failed call changes nothing, a later newer one has atStart false, and an older one clears it', async () => {
  const fake = await fakeHerdr()
  const latest = releases(new Error('offline'), '0.2.0', new Error('timeout'), '0.3.0', '0.1.0')
  const b = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, pollMs: 10, version: '0.1.0', latest, updateMs: 80 })
  const es = sse(portOf(b))
  try {
    assert.deepEqual((await until(es, (m) => m.update)).update, { current: '0.1.0', latest: '0.2.0', atStart: false })
    assert.deepEqual((await es.next()).update, { current: '0.1.0', latest: '0.3.0', atStart: false }, 'the failed call kept update')
    assert.equal((await es.next()).update, null)
  } finally {
    es.close()
    await b.close()
    await fake.close()
  }
})

test('update: without latest or without version the bridge never checks, and update is null', async () => {
  const fake = await fakeHerdr()
  const latest = releases('0.2.0')
  const a = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, pollMs: 10, version: '0.1.0' })
  const b = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, pollMs: 10, latest, updateMs: 10 })
  const ea = sse(portOf(a)), eb = sse(portOf(b))
  try {
    assert.deepEqual(await ea.next(), { online: true, snapshot: SNAP, meetings: [], update: null })
    assert.deepEqual(await eb.next(), { online: true, snapshot: SNAP, meetings: [], update: null })
    await sleep(50)
    assert.equal(latest.calls, 0)
  } finally {
    ea.close()
    eb.close()
    await a.close()
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
    assert.equal(raised, 0, 'no rejected request raises the terminal')

    const ok = await post(focus('w1:p2'))
    assert.equal(ok.status, 200)
    assert.deepEqual(JSON.parse(ok.body), { ok: true })
    assert.deepEqual(fake.lines, ['{"id":"office:focus","method":"pane.focus","params":{"pane_id":"w1:p2"}}\n'])
    assert.equal(raised, 1, 'a focus raises the terminal')

    const fail = await post(focus('w9:p9'))
    assert.equal(fail.status, 502)
    assert.match(JSON.parse(fail.body).error, /pane_not_found/)
    assert.equal(raised, 1, 'a herdr error does not raise the terminal')

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

test('POST /action: guards, then agent.prompt', async () => {
  const fake = await fakeHerdr()
  const TOKEN = 'tok-123'
  let raised = 0
  const b = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, token: TOKEN, raise: () => raised++ })
  const post = (body, headers = { 'x-office-token': TOKEN }) => request(portOf(b), 'POST', '/action', headers, body)
  const prompt = (pane_id, text) => JSON.stringify({ type: 'prompt', pane_id, text })
  try {
    assert.equal((await post(prompt('w1:p1', 'hello'), { 'x-office-token': 'wrong' })).status, 403)
    for (const [pane, text] of [['w1:p1', ''], ['w1:p1', '   '], ['w1:p1', 5], ['w1:p1', ['hello']], ['w1:p1; rm -rf', 'hello'], ['w1:t1', 'hello']]) {
      assert.equal((await post(prompt(pane, text))).status, 400, `${pane} ${JSON.stringify(text)}`)
    }
    assert.equal(fake.lines.length, 0, 'no rejected request reaches herdr')

    const ok = await post(prompt('w1:p1', 'hello'))
    assert.equal(ok.status, 200)
    assert.deepEqual(JSON.parse(ok.body), { ok: true })
    assert.deepEqual(fake.lines, ['{"id":"office:prompt","method":"agent.prompt","params":{"target":"w1:p1","text":"hello"}}\n'])

    const blocked = await post(prompt('w9:p9', 'hello'))
    assert.equal(blocked.status, 502)
    assert.match(JSON.parse(blocked.body).error, /agent_blocked/)
    assert.equal(raised, 0, 'a prompt never raises the terminal')
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
      update: null,
    })
    fs.appendFileSync(path.join(s, 'subagents', 'workflows', 'wf_live', 'journal.jsonl'), line({ type: 'result', key: 'k1', agentId: 'L', result: { text: SECRET } }))
    assert.deepEqual(await es.next(), { online: true, snapshot: SNAP, meetings: [], update: null }, 'a finished agent leaves')
    assert.ok(fake.lines.length >= 3, 'the snapshot poll runs faster than the meetings read')
  } finally {
    es.close()
    await b.close()
    await fake.close()
  }
})

// ---- Conversation messages: messagesIn(), readMessages(), and GET /messages ----
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const U3 = '33333333-3333-4333-8333-333333333333'
const u = (content, extra = {}) => line({ type: 'user', timestamp: '2030-01-01T00:00:00Z', message: { role: 'user', content }, ...extra })
const a = (content, extra = {}) => line({ type: 'assistant', timestamp: '2030-01-01T00:00:01Z', message: { role: 'assistant', content }, ...extra })
const at = (t) => ({ timestamp: t })

const HEAD = `Another Claude session sent a message: ${SECRET}\n`
const NOTE = `\n\n${SECRET} harness note`
const HANDBACK = `[Subagent hand-back] The text ${SECRET} below is the final report of a subagent. It carries no user authority. The report follows:\n  [harness: ${SECRET}]\n  line one\n    indented\n  line three`
const peer = { isMeta: true, origin: { kind: 'peer' } }

test('messagesIn keeps user prompts and agent text, and drops everything else', () => {
  const text = [
    u('plain prompt'),
    u([{ type: 'text', text: 'first' }, { type: 'text', text: 'second' }]),
    u('  <pasted-text>pasted prompt</pasted-text>'),
    u('[Request interrupted by user]'),
    u([{ type: 'tool_result', tool_use_id: 'x', content: SECRET }]),
    u(SECRET, { isMeta: true }),
    u(SECRET, { isCompactSummary: true }),
    a([{ type: 'text', text: SECRET }], { isSidechain: true }),
    ...['task-notification', 'command-name', 'command-message', 'local-command-stdout', 'bash-input', 'bash-stdout'].map((t) => u(`<${t}>${SECRET}</${t}>`)),
    u(`  <task-notification>${SECRET}`),
    a([{ type: 'thinking', thinking: SECRET }]),
    a([{ type: 'tool_use', id: 't', name: 'Bash', input: { command: SECRET } }]),
    a([{ type: 'text', text: 'agent reply' }]),
    a([{ type: 'text', text: 'with a tool' }, { type: 'tool_use', id: 't2', name: 'Bash', input: { command: SECRET } }]),
    'not json ' + SECRET + '\n',
    line({ type: 'attachment', message: { role: 'user', content: SECRET }, attachment: { text: SECRET } }),
    // Messages from other agents: one subagent message for each block.
    u(`${HEAD}<teammate-message teammate_id="rev-t4" color="blue">{"type":"idle_notification","from":"rev-t4","result":"all good"}</teammate-message>\n<teammate-message teammate_id="rev-t5" color="red">{"type":"idle_notification","failureReason":"boom","summary":"s5"}</teammate-message>\n<teammate-message teammate_id="rev-t6" color="red">{"type":"idle_notification","idleReason":"available","note":"${SECRET}"}</teammate-message>${NOTE}`),
    u(`${HEAD}<teammate-message teammate_id="rev-t8" color="blue">{"type":"idle_notification","from":"rev-t8","timestamp":"x","idleReason":"available","result":${JSON.stringify(`[harness: ${SECRET}]\n\nresult text`)}}</teammate-message>${NOTE}`),
    u(`${HEAD}<teammate-message teammate_id="rev-t7" color="blue" summary="short">  plain words  </teammate-message>${NOTE}`),
    u(`${HEAD}<agent-message from="chat-impl">${HANDBACK}</agent-message>${NOTE}`, peer),
    u(`${HEAD}<agent-message from="chat-impl">[harness: ${SECRET}]\n${HANDBACK.replace('  [harness: ' + SECRET + ']\n', '')}</agent-message>${NOTE}`, peer),
    u(`${HEAD}<agent-message from="chat-impl">plain hello</agent-message>${NOTE}`, peer),
    u(`${HEAD}<agent-message from="chat-impl">[harness: ${SECRET}]\n\nafter harness</agent-message>${NOTE}`, peer),
    u(`${HEAD}<cross-session-message from="s1" from-name="Bob" from-mode="x">cross text</cross-session-message><cross-session-message from="s2">no name</cross-session-message>${NOTE}`, peer),
    u(`${HEAD}<teammate-message teammate_id="x">${SECRET}</teammate-message>`, { isMeta: true, origin: { kind: 'user' } }),
    u(`<agent-message from="x">${SECRET}</agent-message>`, peer),
    u(`${HEAD}<teammate-message teammate_id="e"> </teammate-message>${NOTE}`),
    line({ type: 'user', message: { role: 'user', content: 'no time' } }),
  ].join('')
  const out = messagesIn(text)
  assert.ok(!JSON.stringify(out).includes(SECRET))
  assert.deepEqual(out, [
    { role: 'user', text: 'plain prompt' },
    { role: 'user', text: 'first\nsecond' },
    { role: 'user', text: '  <pasted-text>pasted prompt</pasted-text>' },
    { role: 'user', text: '[Request interrupted by user]' },
    { role: 'agent', text: 'agent reply' },
    { role: 'agent', text: 'with a tool' },
    { role: 'subagent', from: 'rev-t4', text: 'all good' },
    { role: 'subagent', from: 'rev-t5', text: 'failed: boom\ns5' },
    { role: 'subagent', from: 'rev-t8', text: 'result text' },
    { role: 'subagent', from: 'rev-t7', text: 'plain words' },
    { role: 'subagent', from: 'chat-impl', text: 'line one\n  indented\nline three' },
    { role: 'subagent', from: 'chat-impl', text: 'line one\n  indented\nline three' },
    { role: 'subagent', from: 'chat-impl', text: 'plain hello' },
    { role: 'subagent', from: 'chat-impl', text: 'after harness' },
    { role: 'subagent', from: 'Bob', text: 'cross text' },
    { role: 'subagent', from: 's2', text: 'no name' },
    { role: 'user', text: 'no time' },
  ])
})

const pane = (cwd, session_id, extra = {}) => ({ pane_id: 'w1:p1', agent: 'claude', cwd, foreground_cwd: cwd, agent_session: session_id === undefined ? null : { agent: 'claude', kind: 'id', source: 'herdr:claude', value: session_id }, ...extra })
const chat = (...texts) => texts.map((t, i) => (i % 2 ? a([{ type: 'text', text: t }]) : u(t))).join('')
// The cwd record comes first, as in a real transcript.
const transcript = (cwd, id, body, folder = esc(cwd), ageS = 0) =>
  write(path.join(projects, folder, `${id}.jsonl`), line({ type: 'user', cwd, isMeta: true, message: { role: 'user', content: SECRET } }) + body, ageS)
const texts = (m) => m.map((x) => x.text)

test('readMessages: finds the session by id in the cwd folder, then in any folder', async () => {
  transcript('/m/one', U1, chat('q1', 'r1'), esc('/m/one'), 50)
  transcript('/m/one', U2, chat('other', 'other')) // a newer sibling: the id lookup must not take it
  assert.deepEqual(texts(await readMessages(projects, pane('/m/one', U1))), ['q1', 'r1'])
  write(path.join(projects, 'elsewhere', `${U3}.jsonl`), chat('q3', 'r3'))
  assert.deepEqual(texts(await readMessages(projects, pane('/m/moved', U3))), ['q3', 'r3'])
})

test('readMessages: a bad or missing session id falls back to the newest transcript of the cwd', async () => {
  const cwd = '/m/fall'
  transcript(cwd, U1, chat('old', 'old'), esc(cwd), 100)
  transcript(cwd, U2, chat('new', 'new'))
  transcript('/m/fall/other', U3, chat('alien', 'alien'), esc(cwd), 0) // same folder, other cwd: skipped
  write(path.join(projects, 'secret.jsonl'), chat(SECRET, SECRET))
  for (const id of ['../secret', '../x', 'not-a-uuid', null, undefined]) {
    const out = await readMessages(projects, pane(cwd, id))
    assert.deepEqual(texts(out), ['new', 'new'], String(id))
  }
  assert.deepEqual(texts(await readMessages(projects, { ...pane(cwd, U1), agent_session: { kind: 'path', value: U1 } })), ['new', 'new'])
})

test('readMessages: no transcript and a non-claude pane give null', async () => {
  assert.equal(await readMessages(projects, pane('/m/none', '44444444-4444-4444-8444-444444444444')), null)
  assert.equal(await readMessages(projects, pane('/m/none', null)), null)
  transcript('/m/shell', U2, chat('q', 'r'))
  assert.equal(await readMessages(projects, pane('/m/shell', U2, { agent: 'codex' })), null)
  assert.equal(await readMessages(projects, pane('/m/shell', U2, { agent: undefined })), null)
})

test('readMessages: a transcript over 512 KB gives only the tail, with no partial first message', async () => {
  const cwd = '/m/big'
  const pad = 'x'.repeat(1000)
  let body = ''
  for (let i = 0; i < 700; i++) body += u(`m${i} ${pad}`)
  transcript(cwd, U1, body)
  const out = await readMessages(projects, pane(cwd, U1), 10000)
  assert.ok(out.length > 100 && out.length < 700)
  assert.equal(out.at(-1).text.slice(0, 5), 'm699 ')
  const first = Number(out[0].text.match(/^m(\d+) /)[1])
  assert.ok(first > 0)
  assert.deepEqual(out.map((m) => m.text.slice(0, -pad.length - 1)), Array.from({ length: out.length }, (_, i) => `m${first + i}`))
})

test('readMessages: limit keeps the newest messages', async () => {
  transcript('/m/lim', U1, chat('a', 'b', 'c', 'd'))
  assert.deepEqual(texts(await readMessages(projects, pane('/m/lim', U1), 2)), ['c', 'd'])
  assert.equal((await readMessages(projects, pane('/m/lim', U1))).length, 4)
})

test('GET /messages: guards, then the messages of a claude pane', async () => {
  transcript('/src/a', U1, chat('hello', 'hi there'))
  const snap = { ...SNAP, panes: [{ ...SNAP.panes[0], agent_session: { agent: 'claude', kind: 'id', source: 'herdr:claude', value: U1 } }, SNAP.panes[1]] }
  const fake = await fakeHerdr((req) => (req.method === 'session.snapshot' ? { result: { type: 'session_snapshot', snapshot: snap } } : { result: { type: 'ok' } }))
  const none = await fakeHerdr()
  const noDir = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, pollMs: 20, token: 'tk', claudeDir: null })
  const early = await startBridge({ sock: none.sock, port: 0, publicDir: pub, pollMs: 20, token: 'tk', claudeDir: projects })
  const b = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, pollMs: 20, token: 'tk', claudeDir: projects })
  const tok = { 'x-office-token': 'tk' }
  const get = (port, q, h = tok) => request(port, 'GET', `/messages?pane=${q}`, h)
  const es = sse(portOf(b)), esNoDir = sse(portOf(noDir))
  try {
    assert.equal((await get(portOf(early), 'w1:p1')).status, 503, 'no snapshot yet')
    const first = await es.next()
    await esNoDir.next()
    assert.equal((await get(portOf(b), 'w1:p1', {})).status, 403)
    assert.equal((await get(portOf(b), 'w1:p1', { 'x-office-token': 'wrong' })).status, 403)
    assert.equal((await get(portOf(b), 'w1:p1', { 'x-office-token': 'tk', host: 'evil.test' })).status, 403)
    for (const bad of ['', 'x', 'w1', 'w1:p1/../x', 'w1:p1%20x']) assert.equal((await get(portOf(b), bad)).status, 400, bad)
    assert.equal((await get(portOf(noDir), 'w1:p1')).status, 503)
    assert.equal((await get(portOf(b), 'w9:p9')).status, 404)
    assert.equal((await get(portOf(b), 'w1:p2')).status, 404, 'a shell pane')
    const ok = await get(portOf(b), 'w1:p1')
    assert.equal(ok.status, 200)
    assert.equal(ok.headers['cache-control'], 'no-store')
    assert.deepEqual(JSON.parse(ok.body), { messages: [{ role: 'user', text: 'hello' }, { role: 'agent', text: 'hi there' }] })
    assert.ok(!ok.body.includes(SECRET))
    assert.ok(fake.lines.every((l) => JSON.parse(l).method === 'session.snapshot'), 'the route sends nothing to herdr')
    assert.ok(!JSON.stringify(first).includes('hi there'), 'no transcript text in the stream')
    assert.ok(!JSON.stringify(es.msgs).includes('hi there'))
  } finally {
    es.close()
    esNoDir.close()
    await Promise.all([b.close(), early.close(), noDir.close()])
    await fake.close()
    await none.close()
  }
})

test('GET /messages: the snapshot goes away when herdr fails, then 503', async () => {
  transcript('/src/a', U1, chat('hello', 'hi there'))
  let calls = 0
  const snap = { ...SNAP, panes: [{ ...SNAP.panes[0], agent_session: { agent: 'claude', kind: 'id', source: 'herdr:claude', value: U1 } }, SNAP.panes[1]] }
  const fake = await fakeHerdr(() => (++calls === 1 ? { result: { type: 'session_snapshot', snapshot: snap } } : { error: { code: 'boom', message: 'down' } }))
  const b = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, pollMs: 20, token: 'tk', claudeDir: projects })
  const es = sse(portOf(b))
  try {
    assert.equal((await es.next()).online, true)
    assert.equal((await es.next()).online, false)
    assert.equal((await request(portOf(b), 'GET', '/messages?pane=w1:p1', { 'x-office-token': 'tk' })).status, 503)
  } finally {
    es.close()
    await b.close()
    await fake.close()
  }
})

test('readMessages: a read error gives null, and the tail cut handles a line start and a multi-byte character', async () => {
  const dirOf = (cwd) => path.join(projects, esc(cwd))
  // An unreadable transcript (a directory with the file name) gives null.
  const U4 = '55555555-5555-4555-8555-555555555555'
  fs.mkdirSync(path.join(dirOf('/m/err'), `${U4}.jsonl`), { recursive: true })
  assert.equal(await readMessages(projects, pane('/m/err', U4)), null)
  // The fallback reads the start of each transcript for its cwd. A file that cannot be opened gives null, not a throw.
  const locked = path.join(dirOf('/m/locked'), `${U4}.jsonl`)
  write(locked, chat('q', 'r'))
  fs.chmodSync(locked, 0)
  try { assert.equal(await readMessages(projects, pane('/m/locked', null)), null) } finally { fs.chmodSync(locked, 0o644) }
  // Lines of exactly 1024 bytes. The 512 KB window starts exactly at line 188, which is complete and stays.
  const mk = (i) => { const base = Buffer.byteLength(u(`m${i} `)); return u(`m${i} ` + 'x'.repeat(1024 - base)) }
  let body = ''
  for (let i = 0; i < 700; i++) body += mk(i)
  write(path.join(dirOf('/m/cut'), `${U2}.jsonl`), body)
  const out = await readMessages(projects, pane('/m/cut', U2), 10000)
  assert.equal(out.length, 512)
  assert.equal(out[0].text.slice(0, 5), 'm188 ')
  // The window starts inside the first character of a two-byte pair: the partial line goes, the next line stays.
  const first = u('é'.repeat(600))
  const k = Buffer.byteLength(first.slice(0, first.indexOf('é'))) + 1
  const rest = 524288 + k - Buffer.byteLength(first)
  write(path.join(dirOf('/m/mb'), `${U3}.jsonl`), first + u('x'.repeat(rest - Buffer.byteLength(u('')))))
  const mb = await readMessages(projects, pane('/m/mb', U3))
  assert.equal(mb.length, 1)
  assert.equal(mb[0].text.length, rest - Buffer.byteLength(u('')))
})

// ---- Codex: codexMessagesIn(), readCodexMessages(), and GET /messages for a codex pane. All names and texts are made up. ----
const ev = (type, payload) => line({ timestamp: '2030-01-01T00:00:00Z', type, payload, ordinal: 0 })
const block = (role, t) => (typeof t === 'string' ? { type: role === 'assistant' ? 'output_text' : 'input_text', text: t } : t)
const msg = (role, ...ts) => ev('response_item', { type: 'message', role, content: ts.map((t) => block(role, t)) })

test('codexMessagesIn keeps user prompts and agent text, and drops everything else', () => {
  const text = [
    ev('session_meta', { id: 'x', cwd: '/c/x', source: 'cli', base_instructions: { text: SECRET } }),
    ev('turn_context', { cwd: '/c/x', model: 'gpt-x', user_instructions: SECRET }),
    msg('developer', `<permissions>${SECRET}</permissions>`),
    msg('user', `# AGENTS.md instructions for /c/x\n\n<INSTRUCTIONS>${SECRET}</INSTRUCTIONS>`),
    msg('user', `<environment_context>${SECRET}</environment_context>`),
    msg('user', `<subagent_notification>${SECRET}</subagent_notification>`),
    msg('user', `<agent_message_board_notification>${SECRET}</agent_message_board_notification>`),
    msg('user', `<codex_internal_context source="x">${SECRET}</codex_internal_context>`),
    msg('user', `<goal_context>${SECRET}</goal_context>`),
    msg('user', `<external_foo>${SECRET}</external_foo>`),
    msg('user', `<recommended_plugins>${SECRET}</recommended_plugins>`),
    msg('user', `<hook_prompt hook_run_id="h1">${SECRET}</hook_prompt>`),
    msg('user', 'plain prompt'),
    msg('user', '# heading prompt'),
    msg('user', '  <div>pasted html</div>'),
    msg('user', 'look at this', '<image name=[Image #1]>', { type: 'input_image', image_url: `data:${SECRET}` }, '</image>'),
    msg('user', `<skill>${SECRET}</skill>`),
    msg('user', ''),
    ev('response_item', { type: 'reasoning', summary: [{ type: 'summary_text', text: SECRET }], encrypted_content: SECRET }),
    ev('response_item', { type: 'function_call', name: 'shell', arguments: SECRET, call_id: 'c1' }),
    ev('response_item', { type: 'function_call_output', call_id: 'c1', output: SECRET }),
    ev('response_item', { type: 'custom_tool_call', name: 'apply_patch', input: SECRET, call_id: 'c2' }),
    ev('response_item', { type: 'custom_tool_call_output', call_id: 'c2', output: SECRET }),
    msg('assistant', 'progress note'),
    msg('assistant', 'part one', 'part two'),
    ev('event_msg', { type: 'item_completed', item: { type: 'AgentMessage', id: 'i1', content: [{ type: 'Text', text: SECRET }] } }),
    ev('event_msg', { type: 'user_message', message: SECRET }),
    ev('event_msg', { type: 'agent_message', message: SECRET }),
    ev('event_msg', { type: 'task_complete', last_agent_message: SECRET }),
    'not json ' + SECRET + '\n',
  ].join('')
  const out = codexMessagesIn(text)
  assert.ok(!JSON.stringify(out).includes(SECRET))
  assert.deepEqual(out, [
    { role: 'user', text: 'plain prompt' },
    { role: 'user', text: '# heading prompt' },
    { role: 'user', text: '  <div>pasted html</div>' },
    { role: 'user', text: 'look at this' },
    { role: 'agent', text: 'progress note' },
    { role: 'agent', text: 'part one\npart two' },
  ])
})

const codex = path.join(dir, 'codex', 'sessions')
const C = (n) => `c${String(n).padStart(7, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`
// A rollout: the session_meta line first, as in a real rollout. Its base instructions hold SECRET.
const rollout = (day, id, cwd, body, { ageS = 0, source = 'cli', pad = '' } = {}) =>
  write(path.join(codex, '2030', '01', day, `rollout-2030-01-${day}T00-00-00-${id}.jsonl`),
    ev('session_meta', { id, timestamp: '2030-01-01T00:00:00Z', cwd, source, base_instructions: { text: SECRET + pad } }) + body, ageS)
const cpane = (cwd, id, extra = {}) => ({ pane_id: 'w1:p3', agent: 'codex', cwd, foreground_cwd: cwd, agent_session: id === undefined ? null : { agent: 'codex', kind: 'id', source: 'herdr:codex', value: id }, ...extra })
const cchat = (...ts) => ts.map((t, i) => msg(i % 2 ? 'assistant' : 'user', t)).join('')

test('readCodexMessages: finds the rollout by thread id in any date folder', async () => {
  rollout('01', C(1), '/c/one', cchat('q1', 'r1'), { ageS: 50 })
  rollout('02', C(2), '/c/one', cchat('other', 'other')) // a newer sibling: the id lookup must not take it
  assert.deepEqual(texts(await readCodexMessages(codex, cpane('/c/one', C(1)))), ['q1', 'r1'])
  assert.deepEqual(texts(await readCodexMessages(codex, cpane('/c/moved', C(1)))), ['q1', 'r1'], 'the id wins over the cwd')
  assert.equal(await readCodexMessages(codex, cpane('/c/one', C(0))), null, 'a valid id that is not found gives null')
})

test('readCodexMessages: a missing or bad id takes the newest top-level rollout of the cwd', async () => {
  const cwd = '/c/fall'
  rollout('03', C(3), cwd, cchat('old', 'old'), { ageS: 100 })
  rollout('03', C(4), cwd, cchat('new', 'new'), { ageS: 10, pad: 'x'.repeat(40_000) }) // a session_meta line over 32 KB
  rollout('04', C(5), cwd, cchat(SECRET, SECRET), { source: { subagent: { thread_spawn: { parent_thread_id: C(4), depth: 1 } } } }) // newer, but a subagent thread
  rollout('04', C(6), '/c/fall/other', cchat('alien', 'alien'))
  for (const id of ['../x', 'not-a-uuid', null, undefined]) {
    assert.deepEqual(texts(await readCodexMessages(codex, cpane(cwd, id))), ['new', 'new'], String(id))
  }
  assert.deepEqual(texts(await readCodexMessages(codex, { ...cpane(cwd, C(3)), agent_session: { kind: 'path', value: C(3) } })), ['new', 'new'])
})

test('readCodexMessages: limit, a non-codex pane, no rollout, a missing folder, and a folder with a rollout name', async () => {
  rollout('05', C(7), '/c/lim', cchat('a', 'b', 'c', 'd'))
  assert.deepEqual(texts(await readCodexMessages(codex, cpane('/c/lim', C(7)), 2)), ['c', 'd'])
  assert.equal(await readCodexMessages(codex, cpane('/c/lim', C(7), { agent: 'claude' })), null)
  assert.equal(await readCodexMessages(codex, cpane('/c/none', null)), null)
  assert.equal(await readCodexMessages(path.join(dir, 'no-such'), cpane('/c/lim', null)), null)
  fs.mkdirSync(path.join(codex, '2030', '01', '06', `rollout-2030-01-06T00-00-00-${C(9)}.jsonl`), { recursive: true })
  assert.deepEqual(texts(await readCodexMessages(codex, cpane('/c/lim', null))), ['a', 'b', 'c', 'd'], 'a folder is skipped')
  assert.equal(await readCodexMessages(codex, cpane('/c/lim', C(9))), null)
})

test('readCodexMessages: a first line without a newline is not cached, so a later call finds it', async () => {
  const cwd = '/c/grow'
  const file = path.join(codex, '2030', '01', '08', `rollout-2030-01-08T00-00-00-${C(10)}.jsonl`)
  const first = ev('session_meta', { id: C(10), timestamp: '2030-01-01T00:00:00Z', cwd, source: 'cli' })
  write(file, first.slice(0, 20))
  assert.equal(await readCodexMessages(codex, cpane(cwd, null)), null, 'a new rollout with no whole line yet')
  write(file, first + cchat('q', 'r'))
  assert.deepEqual(texts(await readCodexMessages(codex, cpane(cwd, null))), ['q', 'r'])
})

test('GET /messages: the messages of a codex pane, and 503 without a codex folder', async () => {
  rollout('07', C(8), '/src/c', cchat('hello codex', 'hi from codex'))
  const cp = { pane_id: 'w1:p3', terminal_id: 't3', workspace_id: 'w1', tab_id: 'w1:t1', focused: false, cwd: '/src/c', foreground_cwd: '/src/c', agent: 'codex', agent_status: 'idle', revision: 1 }
  const odd = { ...cp, pane_id: 'w1:p4', agent: 'constructor' }
  const snap = { ...SNAP, panes: [...SNAP.panes, cp, odd] }
  const fake = await fakeHerdr((req) => (req.method === 'session.snapshot' ? { result: { type: 'session_snapshot', snapshot: snap } } : { result: { type: 'ok' } }))
  const b = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, pollMs: 20, token: 'tk', claudeDir: projects, codexDir: codex })
  const noCodex = await startBridge({ sock: fake.sock, port: 0, publicDir: pub, pollMs: 20, token: 'tk', claudeDir: projects })
  const get = (br, q) => request(portOf(br), 'GET', `/messages?pane=${q}`, { 'x-office-token': 'tk' })
  const es = sse(portOf(b)), es2 = sse(portOf(noCodex))
  try {
    await es.next()
    await es2.next()
    const ok = await get(b, 'w1:p3')
    assert.equal(ok.status, 200)
    assert.deepEqual(JSON.parse(ok.body), { messages: [{ role: 'user', text: 'hello codex' }, { role: 'agent', text: 'hi from codex' }] })
    assert.ok(!ok.body.includes(SECRET))
    assert.equal((await get(noCodex, 'w1:p3')).status, 503, 'no codex folder')
    assert.equal((await get(noCodex, 'w1:p2')).status, 404, 'a shell pane')
    assert.equal((await get(b, 'w1:p4')).status, 404, 'an agent name that is an Object key')
    assert.ok(fake.lines.every((l) => JSON.parse(l).method === 'session.snapshot'), 'the route sends nothing to herdr')
    assert.ok(!JSON.stringify(es.msgs).includes('hi from codex'), 'no transcript text in the stream')
  } finally {
    es.close()
    es2.close()
    await Promise.all([b.close(), noCodex.close()])
    await fake.close()
  }
})

test('bundleIdsIn keeps the distinct valid bundle ids and nothing else', () => {
  const ps = (id) => `herdr FOO=1 SECRET_TOKEN=abc123 __CFBundleIdentifier=${id} HOME=/x`
  assert.deepEqual(bundleIdsIn([ps('com.example.term')]), ['com.example.term'])
  assert.deepEqual(bundleIdsIn([ps('com.example.term'), ps('com.example.term')]), ['com.example.term'])
  assert.deepEqual(bundleIdsIn([ps('com.a.b'), ps('org.c-d')]), ['com.a.b', 'org.c-d'])
  assert.deepEqual(bundleIdsIn(['herdr server HOME=/x', '']), [])
  assert.deepEqual(bundleIdsIn([ps('bad;rm'), '__CFBundleIdentifier=;x']), [])
  assert.ok(!JSON.stringify(bundleIdsIn([ps('com.a.b')])).includes('SECRET'))
})

test('pickTerminal: one id wins, no TTY guesses, a TTY asks', async () => {
  const { PassThrough } = await import('node:stream')
  const ask = async (found, line, tty = true) => {
    const input = new PassThrough(); input.isTTY = tty
    const output = new PassThrough()
    const p = pickTerminal(found, { input, output })
    if (tty && found.length !== 1) input.write(line + '\n')
    return p
  }
  assert.equal(await ask(['com.a.b'], ''), 'com.a.b')
  assert.equal(await ask([], '', false), 'com.github.wez.wezterm')
  assert.equal(await ask(['com.a.b', 'com.c.d'], '', false), 'com.a.b')
  assert.equal(await ask([], ''), 'com.github.wez.wezterm')
  assert.equal(await ask(['com.a.b', 'com.c.d'], '2'), 'com.c.d')
  assert.equal(await ask(['com.github.wez.wezterm', 'com.c.d'], '3'), 'com.mitchellh.ghostty')
  assert.equal(await ask([], '8'), null)
  assert.equal(await ask([], 'x'), null)
})

test('raiser: opens the one detected terminal, else the start pick', async (t) => {
  const opened = []
  const open = (id) => opened.push(id)
  await raiser('y', async () => ['x'], open)()
  await raiser('y', async () => [], open)()
  await raiser('y', async () => ['x', 'z'], open)()
  assert.deepEqual(opened, ['x', 'y', 'y'])
  const err = t.mock.method(console, 'error', () => {})
  await assert.doesNotReject(raiser('y', () => Promise.reject(new Error('boom')), open)())
  assert.deepEqual(opened, ['x', 'y', 'y'], 'a failed detect opens nothing')
  assert.match(err.mock.calls[0].arguments[0], /raise: boom/)
})

test('openUrl: open on a Mac, chromium then xdg-open on Linux, and a failed open only logs', () => {
  const url = 'http://127.0.0.1:5000/'
  const fake = () => {
    const calls = []
    const spawn = (cmd, args, opts) => {
      const child = Object.assign(new EventEmitter(), { unrefs: 0, unref() { this.unrefs++ } })
      calls.push({ cmd, args, opts, child })
      return child
    }
    return { calls, spawn }
  }
  const mac = fake()
  openUrl(url, { platform: 'darwin', spawn: mac.spawn })
  assert.deepEqual(mac.calls.map((c) => [c.cmd, c.args]), [['open', [url]]])

  const lin = fake()
  openUrl(url, { platform: 'linux', spawn: lin.spawn })
  assert.deepEqual([lin.calls[0].cmd, lin.calls[0].args], ['chromium', ['--app=' + url]])
  assert.equal(lin.calls[0].opts.detached, true)
  assert.equal(lin.calls[0].opts.stdio, 'ignore')
  assert.equal(lin.calls[0].child.unrefs, 1)
  lin.calls[0].child.emit('error', new Error('ENOENT'))
  assert.deepEqual([lin.calls[1].cmd, lin.calls[1].args], ['xdg-open', [url]])
  assert.equal(lin.calls[1].opts.detached, true)
  assert.equal(lin.calls[1].opts.stdio, 'ignore')

  const log = console.error
  const logged = []
  console.error = (m) => logged.push(m)
  try {
    mac.calls[0].child.emit('error', new Error('boom'))
    lin.calls[1].child.emit('error', new Error('nope'))
  } finally { console.error = log }
  assert.deepEqual(logged, ['herdr-office: open: boom', 'herdr-office: open: nope'])
})
