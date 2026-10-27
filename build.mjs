// Packs bridge.mjs, public/, and three.js into one Node single executable, then a tar.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const CDN = 'https://cdn.jsdelivr.net/npm/'

// The entries of the importmap "integrity" block (jsDelivr or /vendor/ urls).
export function threeFiles(html) {
  const re = /"((?:https:\/\/cdn\.jsdelivr\.net\/npm|\/vendor)\/three@[^"]+)":\s*"(sha384-[A-Za-z0-9+/]+={0,2})"/g
  return [...html.matchAll(re)].map((m) => ({ url: m[1], integrity: m[2] }))
}

export function sha384(buf) {
  return 'sha384-' + createHash('sha384').update(buf).digest('base64')
}

export function localHtml(html) {
  return html.replaceAll(CDN, '/vendor/')
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])
}

async function build() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 25 || (major === 25 && minor < 5)) {
    console.error(`herdr-office build: Node 25.5 or later is needed for --build-sea (found ${process.versions.node})`)
    process.exit(1)
  }
  const root = dirname(fileURLToPath(import.meta.url))
  const dist = join(root, 'dist')
  const stage = join(dist, 'stage')
  rmSync(dist, { recursive: true, force: true })
  mkdirSync(stage, { recursive: true })

  // asset key -> stage file
  const assets = {}
  const put = (key, data) => {
    const file = join(stage, key)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data)
    assets[key] = file
  }

  const pub = join(root, 'public')
  let html
  for (const file of walk(pub)) {
    const rel = relative(pub, file).split('\\').join('/')
    const data = readFileSync(file)
    if (rel === 'index.html') html = data.toString('utf8')
    put('public/' + rel, rel === 'index.html' ? localHtml(html) : data)
  }

  const files = threeFiles(html)
  if (files.length === 0) throw new Error('herdr-office build: the importmap integrity block has no three.js entry')
  for (const { url, integrity } of files) {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (res.status !== 200) throw new Error(`herdr-office build: ${url} gave status ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (sha384(buf) !== integrity) throw new Error(`herdr-office build: wrong sha384 for ${url}`)
    put('public/vendor/' + url.slice(CDN.length), buf)
  }

  put('version', (process.env.HERDR_OFFICE_VERSION || '').replace(/^v/, '') || '0.0.0-dev')

  const config = {
    main: 'bridge.mjs',
    mainFormat: 'module',
    output: join(dist, 'herdr-office'),
    disableExperimentalSEAWarning: true,
    useCodeCache: false,
    useSnapshot: false,
    assets,
  }
  if (process.platform === 'darwin') {
    // A stripped copy of node: 145 MB become 109 MB (probed on darwin only).
    const slim = join(dist, 'node-slim')
    copyFileSync(process.execPath, slim)
    execFileSync('strip', ['-x', slim], { stdio: 'ignore' })
    config.executable = slim
  }
  const cfg = join(dist, 'sea.json')
  writeFileSync(cfg, JSON.stringify(config, null, 2))
  execFileSync(process.execPath, ['--build-sea', cfg], { stdio: 'inherit', cwd: root })
  if (process.platform === 'darwin') execFileSync('codesign', ['--sign', '-', join(dist, 'herdr-office')], { stdio: 'inherit' })

  const tar = `herdr-office-${process.platform}-${process.arch}.tar.gz`
  execFileSync('tar', ['-czf', join(dist, tar), '-C', dist, 'herdr-office'], { stdio: 'inherit' })
  console.log(`herdr-office build: dist/herdr-office and dist/${tar}`)
}

if (import.meta.main) await build()
