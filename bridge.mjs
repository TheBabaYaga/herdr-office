import net from 'node:net'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { readFile, readdir, stat, open } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

export function socketPath(env = process.env, home = os.homedir()) {
  if (env.HERDR_SOCKET_PATH) return env.HERDR_SOCKET_PATH
  const config = path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'herdr')
  return env.HERDR_SESSION ? path.join(config, 'sessions', env.HERDR_SESSION, 'herdr.sock') : path.join(config, 'herdr.sock')
}

// herdr reads one JSON line per connection, writes one line back, and closes.
export function herdrRequest(sock, method, params = {}, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const id = method === 'session.snapshot' ? 'office:snap' : 'office:' + method.split('.').pop()
    const c = net.createConnection(sock, () => c.write(JSON.stringify({ id, method, params }) + '\n'))
    const done = (err, result) => {
      clearTimeout(timer)
      c.destroy()
      err ? reject(err) : resolve(result)
    }
    const timer = setTimeout(() => done(new Error(`herdr ${method} timed out`)), timeoutMs)
    let buf = ''
    c.setEncoding('utf8')
    c.on('data', (d) => {
      buf += d
      const i = buf.indexOf('\n')
      if (i < 0) return
      try {
        const msg = JSON.parse(buf.slice(0, i))
        if (msg.error) done(new Error(`${msg.error.code}: ${msg.error.message}`))
        else done(null, msg.result)
      } catch (e) {
        done(e)
      }
    })
    c.on('error', done)
    c.on('close', () => done(new Error(`herdr ${method}: connection closed without a reply`)))
  })
}

// ---- Claude Code subagents, from the local transcript folder (~/.claude/projects) ----
// Reads only folder listings, meta.json files, journal.jsonl, the first 32 KB of a session transcript (for its cwd)
// and the last 32 KB of a plain subagent transcript (for its end marker). Sends no transcript text.
const ls = (d) => readdir(d).catch(() => [])
const readJson = (f) => readFile(f, 'utf8').then((t) => Object(JSON.parse(t))).catch(() => ({}))
async function chunk(file, from, size = 32768) {
  const f = await open(file)
  try {
    const { buffer, bytesRead } = await f.read(Buffer.alloc(size), 0, size, from)
    return buffer.toString('utf8', 0, bytesRead)
  } finally {
    await f.close()
  }
}
// ponytail: two caches, one entry per transcript, never evicted. Fine for thousands of transcripts.
const cwds = new Map() // session transcript -> its first cwd, which never changes
const models = new Map() // subagent transcript -> the last model id seen in its tail
// Most transcripts name their cwd in the first 32 KB. Some have big records first, so a miss reads up to 256 KB.
async function cwdOf(file) {
  if (!cwds.has(file)) for (const size of [32768, 262144]) {
    const m = (await chunk(file, 0, size)).match(/"cwd":("(?:[^"\\]|\\.)*")/)
    if (m) { cwds.set(file, JSON.parse(m[1])); break }
  }
  return cwds.get(file)
}
// Each assistant record names the model. A long tool result can push them all out of the tail, so keep the last one seen.
// Only a claude-* id leaves here, never other transcript text.
function modelIn(file, tail) {
  const m = [...tail.matchAll(/"model":"(claude-[\w.-]+)"/g)].at(-1)
  if (m) models.set(file, m[1])
  return models.get(file) ?? null
}
// The tail of a running plain subagent transcript, else null. It ends with an assistant record that stops the turn.
// Without that marker, a quiet transcript also ends it.
async function plainTail(file, now) {
  const s = await stat(file).catch(() => null)
  if (!s?.isFile() || now - s.mtimeMs > 30_000) return null
  const tail = (await chunk(file, Math.max(0, s.size - 32768))).trimEnd()
  return /"stop_reason":"(end_turn|stop_sequence)"/.test(tail.slice(tail.lastIndexOf('\n') + 1)) ? null : tail
}

// One entry per herdr claude cwd whose Claude session runs subagents: { sessionId, cwd, agents: [...] }.
export async function readMeetings(projects, cwds, now = Date.now()) {
  const out = []
  for (const cwd of new Set(cwds)) {
    try { // a bad file or input (or a transcript deleted mid-read) drops only this cwd, for this read
      // Claude Code names the folder after the cwd with every other character as '-'. That is lossy, so the cwd
      // in the transcript decides. ponytail: heuristic, one session per cwd: the transcript written last.
      // Long paths get a hashed folder name and are not found.
      const dir = path.join(projects, cwd.replace(/[^a-zA-Z0-9]/g, '-'))
      // Regular files only: open() on a FIFO never returns.
      const files = await Promise.all((await ls(dir)).filter((f) => f.endsWith('.jsonl')).map(async (f) => [f, await stat(path.join(dir, f)).then((x) => (x.isFile() ? x.mtimeMs : -1), () => -1)]))
      let sessionId = null
      for (const [f, t] of files.sort((a, b) => b[1] - a[1])) {
        if (t >= 0 && (await cwdOf(path.join(dir, f))) === cwd) { sessionId = f.slice(0, -6); break }
      }
      if (!sessionId) continue
      const s = path.join(dir, sessionId), agents = []
      // Workflow agents: a started journal event with no result or failed event yet. A run with workflows/<runId>.json has ended.
      const ended = await ls(path.join(s, 'workflows')), scripts = await ls(path.join(s, 'workflows', 'scripts'))
      for (const runId of await ls(path.join(s, 'subagents', 'workflows'))) {
        if (ended.includes(`${runId}.json`)) continue
        const run = path.join(s, 'subagents', 'workflows', runId), running = new Map()
        for (const l of (await readFile(path.join(run, 'journal.jsonl'), 'utf8').catch(() => '')).split('\n')) {
          let e = null
          try { e = JSON.parse(l) } catch { continue }
          if (e?.type === 'started') running.set(e.key, e)
          else if (e?.type === 'result' || e?.type === 'failed') running.delete(e.key)
        }
        const workflow = scripts.find((f) => f.endsWith(`-${runId}.js`))?.slice(0, -runId.length - 4) ?? null
        for (const e of running.values()) {
          if (!/^[\w-]+$/.test(e.agentId ?? '')) continue // the id goes into a file path
          const file = path.join(run, `agent-${e.agentId}.jsonl`), t = await stat(file).catch(() => null)
          // ponytail: a run whose session died never gets its run JSON. An agent transcript quiet for 30 min has ended.
          if (t && now - t.mtimeMs > 1_800_000) continue
          const meta = await readJson(path.join(run, `agent-${e.agentId}.meta.json`))
          const model = meta.model ?? (t?.isFile() ? modelIn(file, await chunk(file, Math.max(0, t.size - 32768))) : null)
          agents.push({ agentId: e.agentId, label: e.label ?? meta.description ?? null, phase: e.phase ?? meta.workflowPhase ?? null, model, workflow, runId })
        }
      }
      for (const f of await ls(path.join(s, 'subagents'))) {
        const id = f.match(/^agent-(.+)\.meta\.json$/)?.[1], file = id && path.join(s, 'subagents', `agent-${id}.jsonl`)
        const tail = id && (await plainTail(file, now))
        if (tail == null) continue
        const meta = await readJson(path.join(s, 'subagents', f))
        agents.push({ agentId: id, label: meta.description ?? null, phase: null, model: meta.model ?? modelIn(file, tail), workflow: null, runId: null })
      }
      if (agents.length) out.push({ sessionId, cwd, agents })
    } catch {}
  }
  return out
}

export function startBridge({ sock, port, publicDir, pollMs = 500, token = crypto.randomUUID(), claudeDir = null, meetMs = 2000 }) {
  publicDir = path.resolve(publicDir)
  const clients = new Set()
  let last = null // the last SSE payload; null while nobody listens
  let polling = false

  const send = (msg) => {
    const s = JSON.stringify(msg)
    if (s === last) return
    last = s
    // A client with 1 MB unread gets dropped. Its EventSource reconnects and gets the latest state.
    for (const res of clients) if (res.writableLength > 1e6) res.destroy(); else res.write(`data: ${s}\n\n`)
  }

  let meetings = [], readAt = 0 // Claude Code subagents: read every meetMs, slower than the herdr poll
  async function poll() {
    polling = true
    while (clients.size) {
      try {
        const { snapshot } = await herdrRequest(sock, 'session.snapshot')
        if (claudeDir && Date.now() - readAt >= meetMs) {
          readAt = Date.now()
          const cwds = snapshot.agents.filter((a) => a.agent === 'claude').map((a) => a.foreground_cwd || a.cwd)
          meetings = await readMeetings(claudeDir, cwds).catch(() => meetings)
        }
        send({ online: true, snapshot, meetings })
      } catch (e) {
        send({ online: false, snapshot: null, error: e.message })
      }
      await sleep(pollMs)
    }
    polling = false
    last = null
    readAt = 0
  }

  const json = (res, status, body) =>
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))

  // Reads at most 4 KB; returns null when the body is larger.
  const readBody = (req) => new Promise((resolve, reject) => {
    let body = Buffer.alloc(0)
    req.on('data', (d) => {
      if (body) body = body.length + d.length > 4096 ? null : Buffer.concat([body, d])
    })
    req.on('end', () => resolve(body && String(body)))
    req.on('error', reject)
  })

  const server = http.createServer((req, res) => handle(req, res).catch(() => res.destroy()))

  async function handle(req, res) {
    const { port } = server.address()
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return res.writeHead(403).end()
    const { pathname } = new URL(req.url, 'http://h')

    if (req.method === 'POST' && pathname === '/action') {
      const given = Buffer.from(String(req.headers['x-office-token'] ?? ''))
      const want = Buffer.from(token)
      if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return json(res, 403, { error: 'bad token' })
      const body = await readBody(req)
      if (body === null) return json(res, 413, { error: 'body over 4 KB' })
      let msg = null
      try { msg = JSON.parse(body) } catch {}
      if (msg?.type !== 'focus' || typeof msg.pane_id !== 'string' || !/^w[0-9A-Za-z]+:p[0-9A-Za-z]+$/.test(msg.pane_id)) {
        return json(res, 400, { error: 'expected {"type":"focus","pane_id":"w<id>:p<id>"}' })
      }
      try {
        await herdrRequest(sock, 'pane.focus', { pane_id: msg.pane_id })
        return json(res, 200, { ok: true })
      } catch (e) {
        return json(res, 502, { error: e.message })
      }
    }

    if (req.method !== 'GET') return res.writeHead(404).end()

    if (pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })
      clients.add(res)
      res.on('close', () => clients.delete(res))
      if (last) res.write(`data: ${last}\n\n`)
      if (!polling) poll()
      return
    }

    try {
      const file = path.join(publicDir, pathname === '/' ? 'index.html' : decodeURIComponent(pathname))
      const type = TYPES[path.extname(file)]
      if (!type || !file.startsWith(publicDir + path.sep)) throw new Error('blocked')
      let body = await readFile(file)
      if (type.startsWith('text/html')) body = String(body).replaceAll('__OFFICE_TOKEN__', token)
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'x-frame-options': 'DENY' }).end(body)
    } catch {
      res.writeHead(404).end('not found')
    }
  }

  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(port, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}/`,
      token,
      close: () => {
        clients.clear()
        const closed = new Promise((r) => server.close(r))
        server.closeAllConnections()
        return closed
      },
    }))
  })
}

if (import.meta.main) {
  const { url } = await startBridge({
    sock: socketPath(),
    port: Number(process.env.PORT) || 4747,
    publicDir: fileURLToPath(new URL('public', import.meta.url)),
    claudeDir: path.join(os.homedir(), '.claude', 'projects'),
  })
  console.log(`herdr office: ${url}`)
}
