import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, statSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT = resolve('install.sh')

// A temp HOME, a shim folder with a fake uname, and a tar with one fake binary.
function setup(os = 'Darwin', arch = 'arm64') {
  const root = mkdtempSync(join(tmpdir(), 'inst-'))
  const home = join(root, 'home'), shim = join(root, 'shim'), pack = join(root, 'pack')
  for (const d of [home, shim, pack]) mkdirSync(d)
  writeFileSync(join(shim, 'uname'), `#!/bin/sh\ncase "$1" in -s) echo ${os};; -m) echo ${arch};; esac\n`, { mode: 0o755 })
  writeFileSync(join(pack, 'herdr-office'), '#!/bin/sh\necho hi\n', { mode: 0o755 })
  const tar = join(root, 'ho.tar.gz')
  execFileSync('tar', ['-czf', tar, '-C', pack, 'herdr-office'])
  return { root, home, shim, tar, url: `file://${tar}` }
}

function run(s, extra = {}, pathAdd = '') {
  const env = { HOME: s.home, PATH: `${s.shim}:/usr/bin:/bin${pathAdd}`, HERDR_OFFICE_URL: s.url, ...extra }
  if (extra.HERDR_OFFICE_URL === null) delete env.HERDR_OFFICE_URL
  return spawnSync('sh', [SCRIPT], { env, encoding: 'utf8' })
}

const BIN = (s) => join(s.home, '.local', 'bin', 'herdr-office')

test('install.sh writes ~/.local/bin/herdr-office and prints the PATH hint', () => {
  const s = setup()
  const r = run(s)
  assert.equal(r.status, 0, r.stderr)
  assert.ok(statSync(BIN(s)).mode & 0o100, 'executable')
  assert.equal(execFileSync(BIN(s), { encoding: 'utf8' }), 'hi\n')
  for (const part of ['export PATH="$HOME/.local/bin:$PATH"', '~/.zshrc', 'open a new terminal', '.local/bin/herdr-office']) assert.ok(r.stdout.includes(part), part)
})

test('install.sh prints no hint when ~/.local/bin is on the PATH', () => {
  const s = setup()
  const r = run(s, {}, `:${s.home}/.local/bin`)
  assert.equal(r.status, 0, r.stderr)
  assert.ok(!r.stdout.includes('export PATH'))
  assert.ok(r.stdout.includes('herdr-office'))
})

test('install.sh replaces a running binary with a new file', () => {
  const s = setup()
  assert.equal(run(s).status, 0)
  const first = statSync(BIN(s)).ino
  assert.equal(run(s).status, 0)
  assert.notEqual(statSync(BIN(s)).ino, first)
  assert.deepEqual(readdirSync(join(s.home, '.local', 'bin')), ['herdr-office'])
})

test('install.sh stops on an unsupported system', () => {
  const s = setup('Linux', 'aarch64')
  const r = run(s)
  assert.notEqual(r.status, 0)
  assert.ok(r.stderr.includes('not supported'), r.stderr)
  assert.ok(!existsSync(join(s.home, '.local', 'bin')) || readdirSync(join(s.home, '.local', 'bin')).length === 0)
})

test('install.sh picks linux-x64 on Linux', () => {
  const s = setup('Linux', 'x86_64')
  const log = join(s.root, 'curl.log')
  writeFileSync(join(s.shim, 'curl'), `#!/bin/sh
echo "$@" > "${log}"
while [ $# -gt 0 ]; do case "$1" in -o) out=$2; shift;; esac; shift; done
cp "${s.tar}" "$out"
`, { mode: 0o755 })
  const r = run(s, { HERDR_OFFICE_URL: null })
  assert.equal(r.status, 0, r.stderr)
  assert.match(readFileSync(log, 'utf8').trim(), /herdr-office-linux-x64\.tar\.gz$/)
  assert.ok(r.stdout.includes('~/.bashrc'))
})
