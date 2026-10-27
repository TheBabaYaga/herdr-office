import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { threeFiles, sha384, localHtml } from '../build.mjs'

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')

test('threeFiles reads the five three.js files of the importmap', () => {
  const files = threeFiles(html)
  assert.equal(files.length, 5)
  for (const f of files) {
    assert.ok(f.url.startsWith('https://cdn.jsdelivr.net/npm/three@0.186.1/'))
    assert.match(f.integrity, /^sha384-[A-Za-z0-9+/]+={0,2}$/)
  }
})

test('sha384 gives the importmap form', () => {
  assert.equal(sha384(Buffer.from('abc')), 'sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn')
})

test('localHtml points the importmap at /vendor/ and keeps the hashes', () => {
  const out = localHtml(html)
  assert.ok(!out.includes('cdn.jsdelivr.net'))
  const a = threeFiles(out)
  assert.deepEqual(a.map((f) => f.integrity), threeFiles(html).map((f) => f.integrity))
  for (const f of a) assert.ok(f.url.startsWith('/vendor/three@0.186.1/'))
})
