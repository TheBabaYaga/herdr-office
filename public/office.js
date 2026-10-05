import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { STATUS_RANK, STATUS_COLOR, buildOffice, demoSnapshot, demoMeetings, hash, route, along, calm, opens, stepBreak, endBreak } from './model.js'
import { box, seat, plant, clutter, workspaceDecor, kitchen, meeting, lobby, LAMP, WOOD, WOOD_D, CREAM } from './decor.js'

const $ = (id) => document.getElementById(id)
const DEMO = new URLSearchParams(location.search).has('demo')
const TOKEN = document.querySelector('meta[name=office-token]').content
// 3D only: herdr's cream working yellow reads pale on the cream walls, so screens, lamps and door lights use a strong yellow.
const COLOR = Object.fromEntries(Object.entries({ ...STATUS_COLOR, working: '#ffd43b' }).map(([s, c]) => [s, new THREE.Color(c)]))
const SHELL = new THREE.Color('#313244')
const fresh = (color, Mat = THREE.MeshBasicMaterial) => new Mat({ color }) // an own material, for a color that changes in place
const SHIRT = { claude: '#d97757', codex: '#e6e6e6', gemini: '#4285f4', opencode: '#9b87f5', opus: '#c0392b', sonnet: '#2f8f83', haiku: '#e59ac0', subagent: '#7f8c8d' } // subagents: by model family, grey when unknown
const shirt = (kind) => SHIRT[kind] ?? `hsl(${hash(kind)}, 55%, 60%)`
const who = (d) => d.agent.name || d.agent.displayAgent || d.agent.kind || 'agent'
const family = (model) => model?.match(/opus|sonnet|haiku/)?.[0] ?? model ?? 'default'
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const VIEW = 30 // world units visible top to bottom at zoom 1
const OFFSET = new THREE.Vector3(100, 100, 100) // equal x, y, z: true isometric

// ---- renderer, camera, lights ----
const renderer = new THREE.WebGLRenderer()
renderer.setPixelRatio(0.5)
document.body.prepend(renderer.domElement)
const labels = new CSS2DRenderer()
labels.domElement.id = 'labels'
renderer.domElement.after(labels.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#181825')
const ambient = new THREE.HemisphereLight('#fff1dc', '#7a6250', 2)
const sun = new THREE.DirectionalLight('#ffdcae', 2.4)
renderer.shadowMap.enabled = sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.bias = -0.0005
scene.add(ambient, sun, sun.target)
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000)
const controls = new OrbitControls(camera, renderer.domElement)
Object.assign(controls, { enableRotate: false, screenSpacePanning: false, zoomToCursor: true, maxZoom: 8 })
controls.mouseButtons.LEFT = THREE.MOUSE.PAN
controls.touches.ONE = THREE.TOUCH.PAN

function resize() {
  const a = innerWidth / innerHeight
  Object.assign(camera, { left: (-VIEW * a) / 2, right: (VIEW * a) / 2, top: VIEW / 2, bottom: -VIEW / 2 })
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
  labels.setSize(innerWidth, innerHeight)
}
addEventListener('resize', resize)
resize()

function label(parent, cls, [x, y, z]) {
  const o = new CSS2DObject(Object.assign(document.createElement('div'), { className: cls }))
  o.position.set(x, y, z)
  parent.add(o)
  return o.element
}

// ---- floors: tiny pixel textures, tinted by the material color ----
function pix(n, f) {
  const a = new Uint8Array(n * n * 4)
  for (let i = 0; i < n * n; i++) a.set([...f(i % n, Math.floor(i / n)), 255], i * 4)
  const t = new THREE.DataTexture(a, n, n)
  return Object.assign(t, { colorSpace: THREE.SRGBColorSpace, magFilter: THREE.NearestFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, needsUpdate: true })
}
const grey = (v) => [v, v, v]
// [texture, world units per texture tile]
const FLOOR = {
  carpet: [pix(4, (x, y) => grey(255 - 1.6 * [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][y * 4 + x])), 1],
  planks: [pix(8, (x, y) => grey(x === (Math.floor(y / 2) * 3) % 8 ? 212 : 250 - 7 * (Math.floor(y / 2) % 3) - (y % 2) * 8)), 2],
  checker: [pix(2, (x, y) => ((x + y) % 2 ? [236, 226, 204] : [178, 112, 88])), 1.5],
  stone: [pix(8, (x, y) => grey(x === 0 || y === 0 ? 196 : (x * y) % 7 === 3 ? 232 : 248)), 2],
}
function floor({ x, z, w, d }, [tex, size], color) {
  const map = Object.assign(tex.clone(), { needsUpdate: true })
  map.repeat.set(w / size, d / size)
  box(world, [w, 0.1, d], [x + w / 2, -0.1, z + d / 2], new THREE.MeshLambertMaterial({ color, map }))
}

// ---- walls: zero-width lines on the room edges, drawn T thick and centered ----
const T = 0.3, H = 2.6, DOOR = 1.2
// C.wood is also the door light and sign of a room without a status: no status color.
const C = { cream: CREAM, inner: '#e8dcc6', cap: '#8a7663', frame: '#8c7b6b', wood: '#9c6f4a', door: WOOD, sill: '#f7f2e8', brass: '#d8b45c', slab: '#3a322d', post: '#5a4d42' }
const shared = (m) => Object.assign(m, { userData: { shared: true } }) // never disposed on rebuild
const GLASS = shared(new THREE.MeshLambertMaterial({ color: '#b3d8f0', transparent: true, opacity: 0.45, depthWrite: false }))
const SKY = shared(new THREE.MeshLambertMaterial({ color: '#a9d5ef', emissive: '#55819e' }))

// A box along a wall line: axis 'x' runs along x at z = c, axis 'z' runs along z at x = c.
const run = (axis, c, s, e, y, h, color, t = T) =>
  axis === 'x' ? box(world, [e - s, h, t], [(s + e) / 2, y, c], color) : box(world, [t, h, e - s], [c, y, (s + e) / 2], color)
// The solid parts of [s, e] around the gaps, each gap [center, width].
function pieces(s, e, gaps) {
  const out = []
  for (const [c, w] of [...gaps].sort((a, b) => a[0] - b[0])) { out.push([s, c - w / 2]); s = c + w / 2 }
  return [...out, [s, e]]
}
// A far outer wall: full height, cream, with a window every 2.6 between the junctions with inner walls.
function outer(axis, c, s, e, stops) {
  stops = [...new Set(stops)].sort((a, b) => a - b)
  const wins = stops.slice(1).flatMap((b, i) => {
    const a = stops[i], n = Math.floor((b - a) / 2.6)
    return Array.from({ length: n }, (_, j) => [a + ((b - a) * (j + 0.5)) / n, 1.4])
  })
  s -= T / 2; e += T / 2
  run(axis, c, s, e, 0, 0.9, C.cream)
  run(axis, c, s, e, 2.1, H - 2.1, C.cream)
  for (const [a, b] of pieces(s, e, wins)) run(axis, c, a, b, 0.9, 1.2, C.cream)
  for (const [p] of wins) {
    run(axis, c, p - 0.7, p + 0.7, 0.9, 1.2, SKY, 0.1)
    run(axis, c, p - 0.8, p + 0.8, 0.82, 0.08, C.sill, T + 0.12)
    run(axis, c, p - 0.7, p + 0.7, 2.04, 0.06, C.sill, 0.16)
    run(axis, c, p - 0.03, p + 0.03, 0.9, 1.2, C.sill, 0.16)
  }
}
// A camera-side outer wall, cut down Sims style.
function stub(axis, c, s, e, gaps) {
  for (const [a, b] of pieces(s - T / 2, e + T / 2, gaps)) {
    run(axis, c, a, b, 0, 0.5, C.cream)
    run(axis, c, a, b, 0.5, 0.08, C.cap, T + 0.04)
  }
}
// An inner wall: a solid lower part, glass panes with mullions, a solid header over the doors too.
// The header stays thin: a taller one would hide the front-row workers of the room behind it.
function inner(axis, c, s, e, gaps) {
  s -= T / 2; e += T / 2
  for (const [a, b] of pieces(s, e, gaps)) {
    run(axis, c, a, b, 0, 1, C.inner)
    run(axis, c, a, b, 1, 0.06, C.wood, T + 0.04)
    run(axis, c, Math.max(a, s + T / 2), Math.min(b, e - T / 2), 1.06, H - 1.18, GLASS, 0.06) // to the wall ends only: no double glass at a junction
    const n = Math.round((b - a) / 1.5)
    for (let i = 1; i < n; i++) { const p = a + ((b - a) * i) / n; run(axis, c, p - 0.025, p + 0.025, 1.06, H - 1.18, C.frame, 0.08) }
  }
  run(axis, c, s, e, H - 0.12, 0.12, C.inner)
}
// A door in a wall along x: frame, lintel with the status light, glass transom, and a wooden door, closed in the wall line.
// A walker opens it into the room (swing()). The hinge is on the +x post of a south wall and the -x post of a north wall, so an open
// door stands near edge-on to the camera. The hinge is live: bake() skips the leaf and the knob, so they can turn.
function door(r) {
  const { x, z, side } = r.door, s = side === 'south' ? 1 : -1 // s: the corridor side, +1 = +z
  for (const k of [-1, 1]) box(world, [0.12, 2.1, T + 0.06], [x + k * 0.6, 0, z], C.wood)
  box(world, [DOOR + 0.12, 0.12, T + 0.06], [x, 2.1, z], C.wood)
  box(world, [DOOR, 0.28, 0.06], [x, 2.22, z], GLASS)
  const light = box(world, [0.5, 0.16, T + 0.1], [x, 2.26, z], fresh(0))
  const hinge = new THREE.Group()
  hinge.position.set(x + s * 0.54, 0, z)
  hinge.rotation.y = doors.get(r.id) ?? 0 // closed, or the angle from before the rebuild
  world.add(hinge)
  box(hinge, [1.08, 2.04, 0.06], [-s * 0.54, 0.02, 0], C.door)
  box(hinge, [0.05, 0.05, 0.16], [-s * 0.94, 1, 0], C.brass)
  live.add(light).add(hinge)
  // Over the room, not the corridor: facing signs stay apart. Over a meeting room with a south door, the sign covers the
  // south seat about 2 west of it. Seats fill from the head (-x) end, so the sign moves to 1 from the +x wall.
  views.set(r.id, { light, sign: label(world, 'sign', [x + (r.kind === 'meeting' && s === 1 ? r.w / 2 - 1 : 0), 3, z - s * 0.4]), hinge })
}

// The focused pane gets a spotlight. It moves without a rebuild. Cool blue, so a lit desk never looks like the working yellow.
const spot = new THREE.SpotLight('#89b4fa', 400, 0, 0.18, 0.3)
scene.add(spot, spot.target)

// ---- scene build: only when the build signature changes ----
let world = null
const views = new Map() // room, pod and desk id -> the objects that show its state
const live = new Set() // objects whose look changes in place: never merged
const DECOR = { workspace: workspaceDecor, kitchen, meeting, lobby }
const ROOM_FLOOR = { meeting: [FLOOR.planks, '#b98b5e'], kitchen: [FLOOR.checker, '#ffffff'], lobby: [FLOOR.stone, '#eee7dc'] }

function build(office) {
  if (world) {
    views.forEach((v) => v.tex?.dispose()) // typing textures: the screen map is null when the desk is not typing
    world.traverse((o) => {
      o.element?.remove()
      if (o.geometry?.userData.merged) o.geometry.dispose()
      if (o.material && !o.material.userData.shared) { o.material.map?.dispose(); o.material.dispose() }
    })
    scene.remove(world)
  }
  world = new THREE.Group()
  scene.add(world)
  views.clear()
  live.clear()
  const { w: BW, d: BD } = office.bounds, X = office.corridors.at(-1), W = X.x // X: the cross corridor
  box(world, [BW + 0.6, 0.4, BD + 0.6], [BW / 2, -0.5, BD / 2], C.slab)
  // Corridors: light wood, a runner down each one, a plant in each dead end. The runners meet in the cross corridor.
  const runner = (x0, z0, x1, z1) => box(world, [x1 - x0, 0.02, z1 - z0], [(x0 + x1) / 2, 0, (z0 + z1) / 2], '#9a5b4b')
  const mx = X.x + X.w / 2
  for (const c of office.corridors) {
    floor(c, FLOOR.planks, '#e6cfaa')
    const mz = c.z + c.d / 2
    if (c === X) runner(mx - 0.6, c.z + 0.6, mx + 0.6, c.z + c.d - 0.6)
    else runner(c.x + 1.2, mz - 0.6, mx + 0.6, mz + 0.6)
    plant(world, c.x + 0.6, c.z + 0.6)
  }

  for (const r of office.rooms) {
    const [tex, color] = ROOM_FLOOR[r.kind] ?? [FLOOR.carpet, `hsl(${15 + (hash(r.id) % 35)}, 26%, 62%)`]
    floor(r, tex, color)
    const g = new THREE.Group()
    g.position.set(r.x, 0, r.z)
    world.add(g)
    DECOR[r.kind](g, r)
    // Inner walls, each drawn once: the -x and -z edge of every room, the door wall of a north row, the wall to the cross corridor.
    if (r.x > 0) inner('z', r.x, r.z, r.z + r.d, [])
    if (r.z > 0) inner('x', r.z, r.x, r.x + r.w, r.door.side === 'north' ? [[r.door.x, DOOR]] : [])
    if (r.door.side === 'south') inner('x', r.z + r.d, r.x, r.x + r.w, [[r.door.x, DOOR]])
    if (Math.abs(r.x + r.w - W) < 1e-6) inner('z', W, r.z, r.z + r.d, [])
    door(r)
    for (const p of r.pods) {
      const lx = p.x + LAMP[0], lz = p.z + LAMP[1]
      box(world, [0.12, 2, 0.12], [lx, 0, lz], C.post)
      for (const y of [1.94, 2.3]) box(world, [0.38, 0.06, 0.38], [lx, y, lz], C.post) // a dark housing, so the yellow shows on cream
      const lamp = box(world, [0.3, 0.3, 0.3], [lx, 2, lz], fresh(0))
      live.add(lamp)
      views.set(p.id, { lamp })
    }
  }
  // Outer walls: the far ones full height with windows, the camera-side ones cut down, the entrance in the south one.
  outer('z', 0, 0, BD, office.rooms.filter((r) => r.x === 0).flatMap((r) => [0, r.z, r.z + r.d, BD]))
  outer('x', 0, 0, BW, office.rooms.filter((r) => r.z === 0).flatMap((r) => [r.x, r.x + r.w, BW]))
  stub('z', BW, 0, BD, [])
  const { x: ex } = office.entrance
  stub('x', BD, 0, BW, [[ex, 2]])
  for (const k of [-1, 1]) box(world, [0.12, 0.7, T + 0.06], [ex + k * 1.0, 0, BD], C.frame) // posts cut down like the wall
  box(world, [2.6, 0.4, 1.4], [ex, -0.5, BD + 0.75], C.slab) // a step outside, with the doormat on it
  box(world, [2.4, 0.04, 1.2], [ex, -0.1, BD + 0.75], C.frame)

  for (const d of office.desks) desk(d)
  for (const s of office.subagents) attendee(s)
  bake()
  // The sun shines in through the west windows. Its shadow box holds the whole building.
  const R = Math.hypot(BW, BD) / 2 + 2
  sun.target.position.set(BW / 2, 0, BD / 2)
  sun.position.set(-4, 10, 5).setLength(2 * R).add(sun.target.position)
  Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 4 * R }).updateProjectionMatrix()
  world.traverse((o) => { if (o.isMesh) { o.castShadow = o.material !== GLASS && o.material !== SKY; o.receiveShadow = true } })
}

// Merge every static box into one mesh per material: tens of draw calls instead of thousands.
function bake() {
  world.updateMatrixWorld(true)
  const groups = new Map()
  const walk = (o) => {
    if (live.has(o)) return
    if (o.isMesh) (groups.get(o.material) ?? groups.set(o.material, []).get(o.material)).push(o)
    o.children.forEach(walk)
  }
  walk(world)
  for (const [mat, ms] of groups) {
    if (ms.length < 2) continue
    const m = new THREE.Mesh(mergeGeometries(ms.map((x) => x.geometry.clone().applyMatrix4(x.matrixWorld))), mat)
    m.geometry.userData.merged = true
    m.renderOrder = mat.transparent ? 1 : 0 // glass last, so it tints what stands behind it
    for (const x of ms) x.removeFromParent()
    world.add(m)
  }
}

// Desk 2 x 1.5 around its center. The monitor faces +z, toward the camera. The worker sits on the +z side.
const deskChair = seat('#4b4642')
function desk(d) {
  const g = new THREE.Group()
  g.position.set(d.x, 0, d.z)
  world.add(g)
  box(g, [1.8, 0.1, 0.8], [0, 0.7, -0.35], '#c08a5b')
  for (const s of [-1, 1]) box(g, [0.1, 0.7, 0.8], [s * 0.85, 0, -0.35], WOOD_D)
  box(g, [0.12, 0.25, 0.12], [0, 0.8, -0.6], '#1e1e2e')
  box(g, [1, 0.62, 0.1], [0, 1, -0.62], '#1e1e2e')
  const screen = box(g, [0.86, 0.5, 0.02], [0, 1.06, -0.56], fresh(0))
  live.add(screen)
  if (d.agent) { // keyboard under the typing hands (hands end near z -0.1)
    box(g, [0.8, 0.04, 0.25], [0, 0.8, -0.09], '#2a2a35')
    box(g, [0.72, 0.01, 0.19], [0, 0.84, -0.09], '#5c5c70')
    box(g, [0.1, 0.03, 0.12], [0.47, 0.8, 0.01], '#2a2a35') // mouse, at the desk edge right of the keyboard (z -0.05..0.07): an idle worker browses with its right hand on it (the arm turns 0.3 rad toward it)
  }
  deskChair(g, 0, 0.5, 2) // the back on +z, behind the worker
  clutter(g, hash(d.id, 1e6))
  const away = d.away && seatAt(d.away) // in a meeting: the worker and its typing screen move to the head of the table
  views.set(d.id, { desk: d, screen: away?.screen ?? screen, halo: away?.halo, logo: away?.logo, phase: d.x * 7 + d.z * 3, seed: hash(d.terminalId ?? d.id, 1e9), worker: d.agent && worker(away?.g ?? g, d) })
}

// A meeting seat (see the model): a group like a desk group, turned to the table, with a laptop under the typing hands.
// The chair comes with the table. The laptop screen and a small halo change in place.
function seatAt(s) {
  const g = new THREE.Group()
  g.position.set(s.x, 0, s.z)
  g.rotation.y = (s.rot * Math.PI) / 2
  world.add(g)
  box(g, [0.5, 0.03, 0.32], [0, 0.8, -0.12], '#2a2a35')
  box(g, [0.5, 0.32, 0.03], [0, 0.83, -0.29], '#2a2a35')
  const screen = box(g, [0.44, 0.26, 0.01], [0, 0.86, -0.27], fresh(0))
  const halo = new THREE.Mesh(haloGeo, glow)
  halo.scale.setScalar(0.35)
  halo.position.set(0, 0.99, -0.25)
  g.add(halo)
  live.add(screen).add(halo)
  // The screen of a north or head seat faces away from the camera: a logo on the lid back shows the work.
  const logo = s.rot > 1 && box(g, [0.1, 0.1, 0.01], [0, 0.86, -0.31], fresh(COLOR.working))
  return { g, screen, halo, logo }
}

// A subagent at the meeting table: always working. Its look comes from its agent id, its shirt from its model family.
// An unknown model gets a grey shirt: a hash color can come close to a family color.
function attendee(s) {
  const { g, screen, halo, logo } = seatAt(s)
  const kind = s.model?.match(/opus|sonnet|haiku/)?.[0] ?? 'subagent'
  const v = { desk: { status: 'working' }, screen, halo, logo, phase: s.x * 7 + s.z * 3, worker: worker(g, { id: s.id, agent: { kind }, seated: true }) }
  v.worker.badge.style.setProperty('--c', STATUS_COLOR.working)
  views.set(s.id, v)
}

function worker(parent, d) {
  const g = new THREE.Group()
  g.position.set(0, 0.5, 0.4) // pivot on the seat, so a lean back tilts the body
  parent.add(g)
  live.add(g)
  const color = shirt(d.agent.kind), lit = (c) => fresh(c, THREE.MeshLambertMaterial) // own materials: opacity changes per worker
  box(g, [0.5, 0.55, 0.3], [0, 0, 0], lit(color))
  // Look from the pane id: the same worker always looks the same. Shirt stays the agent kind.
  const h = hash(d.terminalId ?? d.id, 1e9), r = (n, i) => { // r: a mixed pick of 0..n-1, one stream per feature i
    let x = Math.imul(h + i * 0x9e3779b1, 0x85ebca6b)
    x = Math.imul(x ^ (x >>> 15), 0xc2b2ae35)
    return ((x ^ (x >>> 13)) >>> 0) % n
  }
  const skin = ['#f2c9a0', '#e0ac7e', '#c68c5c', '#8d5a3b', '#5c3b28'][r(5, 1)]
  const hair = ['#45372d', '#1e1a18', '#e8c56a', '#a8431f', '#b9b9b9', '#6b4423'][r(6, 2)]
  const style = r(5, 3), acc = r(7, 4), pants = ['#3b4a6b', '#2f2f35', '#6b5b45', '#4d6b4a'][r(4, 5)]
  box(g, [0.36, 0.36, 0.36], [0, 0.6, 0], lit(skin))
  if (style !== 4) box(g, [0.38, 0.1, 0.38], [0, 0.92, 0], lit(hair)) // 4 = bald
  if (style === 0 || style === 1) box(g, [0.38, 0.3, 0.06], [0, 0.62, 0.17], lit(hair)) // back of the head
  if (style === 1) [-1, 1].forEach((s) => box(g, [0.05, 0.3, 0.3], [s * 0.2, 0.55, 0.02], lit(hair))) // long: sides
  if (style === 2) box(g, [0.14, 0.14, 0.14], [0, 1.0, 0.05], lit(hair)) // bun
  if (style === 3) box(g, [0.1, 0.32, 0.1], [0, 0.55, 0.22], lit(hair)) // ponytail
  if (acc === 0) { // glasses: a bar on the face, temple arms along the sides to the ears (the camera sees the +x side)
    box(g, [0.34, 0.07, 0.03], [0, 0.72, -0.19], lit('#1a1a1a'))
    ;[-1, 1].forEach((s) => box(g, [0.03, 0.05, 0.19], [s * 0.195, 0.72, -0.095], lit('#1a1a1a')))
  }
  if (acc === 1) { // headphones: band over the head and a cup on each side
    box(g, [0.4, 0.04, 0.08], [0, 1.0, 0], lit('#222'))
    ;[-1, 1].forEach((s) => box(g, [0.06, 0.14, 0.14], [s * 0.21, 0.66, 0], lit('#222')))
  }
  if (acc === 2) { // cap: crown and a brim at the front
    box(g, [0.4, 0.1, 0.4], [0, 0.96, 0], lit('#c0392b'))
    box(g, [0.3, 0.03, 0.14], [0, 0.96, -0.25], lit('#c0392b'))
  }
  // Seated legs: thighs under the desk top, lower legs down to the floor. Standing legs hang from the hips and swing on a walk.
  const sit = new THREE.Group(), stand = new THREE.Group()
  g.add(sit, stand)
  stand.visible = false
  const legs = [-1, 1].map((s) => {
    box(sit, [0.16, 0.16, 0.34], [s * 0.12, 0.02, -0.18], lit(pants)) // rests on the cushion top (0.02 above the pivot)
    box(sit, [0.16, 0.52, 0.16], [s * 0.12, -0.5, -0.36], lit(pants))
    const l = new THREE.Group()
    l.position.set(s * 0.12, 0, 0)
    stand.add(l)
    box(l, [0.16, 0.52, 0.16], [0, -0.5, 0], lit(pants))
    return l
  })
  const arms = [-1, 1].map((s) => {
    const a = new THREE.Group()
    a.position.set(s * 0.32, 0.5, 0)
    g.add(a)
    box(a, [0.14, 0.5, 0.14], [0, -0.5, 0], lit(color))
    return a
  })
  const paper = box(g, [0.5, 0.6, 0.04], [0, 0.9, -0.3], lit('#f5f5f5'))
  const beacon = new THREE.Group()
  beacon.position.y = 1.35
  g.add(beacon)
  box(beacon, [0.16, 0.16, 0.16], [0, 0, 0], fresh(COLOR.blocked))
  box(beacon, [0.16, 0.4, 0.16], [0, 0.24, 0], fresh(COLOR.blocked))
  const mug = box(g, [0.14, 0.18, 0.16], [0.32, 0.25, -0.47], lit('#4a6fa8')) // in the right hand: raised at the counter, low near a door (stroll() puts it at the hand)
  mug.visible = false
  const mats = []
  g.traverse((o) => o.material && mats.push(Object.assign(o.material, { transparent: true })))
  // A seated subagent never shows the beacon, so its badge sits just over its head. At 2.2 it would cover the worker behind it.
  return { g, arms, sit, stand, legs, mug, paper, beacon, mats, badge: label(g, 'badge', [0, d.seated ? 1.2 : 2.2, 0]) }
}

// ---- typing screens: a tiny canvas per working desk, redrawn 10x a second ----
const SCR_W = 32, SCR_H = 24, ROWS = 8, LINE = 30 // a line takes 30 ticks to type, so a screen scrolls every 3 s
const rnd = (a, b, c) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 1, 0xc2b2ae35) ^ Math.imul(c + 7, 0x27d4eb2f); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); return ((h ^ (h >>> 13)) >>> 0) / 4294967296 }
const glow = shared(new THREE.MeshBasicMaterial({ // one soft yellow halo for all desks
  map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, '#fff'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c) })(),
  color: COLOR.working, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.35, depthWrite: false,
}))
const haloGeo = new THREE.PlaneGeometry(1.7, 1.2) // one for all desks: build() never disposes it
function screenCtx(v) { // the canvas of a desk screen: typing and browsing draw into it, one at a time
  if (!v.ctx) {
    const c = Object.assign(document.createElement('canvas'), { width: SCR_W, height: SCR_H })
    v.ctx = c.getContext('2d')
    v.tex = Object.assign(new THREE.CanvasTexture(c), { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, colorSpace: THREE.SRGBColorSpace })
  }
  return v.ctx
}
function typing(v, tick) {
  const seed = v.phase * 1000 | 0, pos = tick + (rnd(seed, 0, 0) * 1e4 | 0), li = Math.floor(pos / LINE), cc = pos % LINE
  if (v.typed === pos) return
  v.typed = pos
  v.shown = null
  const x = screenCtx(v)
  x.fillStyle = '#ffd43b'
  x.fillRect(0, 0, SCR_W, SCR_H)
  x.fillStyle = '#7a5a00'
  for (let r = 0; r < ROWS; r++) {
    const l = li - (ROWS - 1) + r, len = 6 + (rnd(seed, l, 1) * 20 | 0), n = r === ROWS - 1 ? Math.min(cc, len) : len, indent = rnd(seed, l, 2) < 0.3 ? 3 : 1
    for (let c = 0; c < n; c++) if (rnd(seed, l, c + 10) > 0.18) x.fillRect(indent + c, 1 + r * 3, 1, 1 + (rnd(seed, l, c + 99) > 0.5)) // gaps are spaces
  }
  v.tex.needsUpdate = true
}
// ---- browsing screens: an idle worker looks at a fake web page, or watches a video. The idle green stays the main color. ----
const IDLE = '#a6e3a1', INK = '#40704a', PIC = ['#89b4fa', '#cba6f7', '#f5c2e7', '#b4befe', '#cdd6f4'] // no status color: a picture must never read as working or done
function browse(v, t) {
  const seed = v.seed, video = rnd(seed, 0, 5) < 0.4, f = Math.floor(t * 2) // 2 frames a second. A worker watches a video, or reads a page.
  const sc = Math.floor(t) // the page scrolls 1 pixel a second
  const key = video ? f : sc
  if (v.shown === key) return // draw only when the picture changes
  v.shown = key
  v.typed = null
  const x = screenCtx(v)
  x.fillStyle = IDLE
  x.fillRect(0, 0, SCR_W, SCR_H)
  if (video) {
    x.fillStyle = INK
    x.fillRect(2, 1, 12, 1) // the title
    x.fillRect(4, 4, 24, 12) // the player frame
    x.fillStyle = PIC[(f >> 2) % PIC.length]
    x.fillRect(5, 5, 22, 10) // the picture changes every 2 s
    x.fillStyle = INK
    x.fillRect(5 + (f * 2) % 18, 8 + (f >> 1) % 3, 4, 4) // something moves in it
    x.fillRect(2, 19, 28, 2) // the progress bar: a 60 s clip
    x.fillStyle = '#fff'
    x.fillRect(2, 19, Math.floor(28 * ((t % 60) / 60)), 2)
  } else {
    for (let k = Math.floor(sc / 7); k <= Math.floor((sc + SCR_H) / 7); k++) { // rows of 7 pixels: a picture with text, or text
      const y = 4 + k * 7 - sc, pic = rnd(seed, k, 6) < 0.4, left = pic ? 16 : 2
      if (pic) { x.fillStyle = PIC[(rnd(seed, k, 7) * PIC.length) | 0]; x.fillRect(2, y, 12, 5) }
      x.fillStyle = INK
      for (let i = 0; i < 3; i++) x.fillRect(left, y + i * 2, 8 + ((rnd(seed, k, 8 + i) * (pic ? 6 : 20)) | 0), 1)
    }
    x.fillStyle = INK
    x.fillRect(0, 0, SCR_W, 3) // the header bar, over the rows that scroll under it
    x.fillStyle = '#fff'
    x.fillRect(2, 1, 3, 1)
    x.fillStyle = IDLE
    for (const nx of [20, 24, 28]) x.fillRect(nx, 1, 2, 1)
  }
  v.tex.needsUpdate = true // the texture uploads again, also when it came from a typing screen
}

// ---- idle breaks: after a wait, an idle worker walks to the kitchen counter and back ----
// The clock is t of the animation loop. A trip lives in trips by desk id, so it survives a rebuild for a new subagent.
// ponytail: a change of the route inputs (`lay`) clears every trip: the workers sit at their desks again. Tracking a trip across a new layout needs a new route.
const trips = new Map() // desk id -> { n: the next trip, next: when it starts, trip: the one that runs now }
const claimed = new Map() // kitchen spot index -> desk id: two workers never stand on one spot
// Where the worker of this view is now: { x, z, dx, dz, s, phase, got, trip }, or null at the desk. stepBreak() in model.js keeps the state.
function breaks(v, t) {
  const d = v.desk, k = office.rooms.find((r) => r.kind === 'kitchen')
  const a = stepBreak(trips, claimed, d.id, { idle: d.status === 'idle' && !d.away, seed: v.seed, spots: k.spots.length, route: (i) => route(office, d.id, k.spots[i]) }, t)
  return a && { ...along(a.trip.path, a.s), ...a }
}

// ---- doors: closed. A walker opens its own door and the kitchen door (opens() in model.js), and the door closes after it. ----
// The angle lives by room id, outside views: a rebuild for a new subagent keeps a door open while a worker stands in it.
const OPEN = -1.1, SWING = 0.25 // the open angle (into the room), and the seconds from closed to open: open before a runner gets to the leaf
const doors = new Map() // room id -> the door angle now
const ajar = new Set() // the room ids whose door a walker opens this frame. pose() fills it.
function swing(dt) { // dt: the frame time in seconds, so a door moves at the same speed at any frame rate
  const step = (dt * -OPEN) / SWING
  for (const r of office.rooms) {
    const a = doors.get(r.id) ?? 0, b = a + Math.max(-step, Math.min(step, (ajar.has(r.id) ? OPEN : 0) - a))
    doors.set(r.id, b)
    views.get(r.id).hinge.rotation.y = b
  }
}

const TAU = Math.PI * 2
// A worker on a trip stands and walks. The legs swing with the distance, the arms swing the other way. After the
// kitchen the right hand holds the mug. It faces the way it moves, and the counter during the stay.
// Near a door (see calm() in model.js) the arms hang and the mug hand stays low, so no hand goes through the open leaf or a post.
function stroll(w, d, a, t) {
  const g = w.g, back = a.phase === 'back' || a.phase === 'rush', stay = a.phase === 'stay'
  const to = stay ? 0 : Math.atan2(a.dx * (back ? 1 : -1), a.dz * (back ? 1 : -1)), tr = a.trip
  const sw = stay ? 0 : 0.7 * Math.sin(a.s * 5), c = calm(Math.min(...office.rooms.map((r) => Math.hypot(a.x - r.door.x, a.z - r.door.z))))
  const hand = stay ? 1.2 + 0.1 * Math.sin(t * 2) : 0.1 + 1.1 * c // the angle of the mug arm
  tr.rot = tr.rot == null ? to : tr.rot + (to - tr.rot - Math.round((to - tr.rot) / TAU) * TAU) * 0.25 // the heading lives on the trip: a rebuild makes a new group
  g.rotation.set(0, tr.rot, 0)
  g.position.set(a.x - d.x, 0.5 + 0.04 * Math.abs(sw), a.z - d.z)
  w.sit.visible = false
  w.stand.visible = true
  w.mug.visible = a.got
  w.mug.position.set(0.32, 0.43 - 0.5 * Math.cos(hand), -0.56 * Math.sin(hand)) // at the hand, a little past it
  w.legs[0].rotation.x = sw
  w.legs[1].rotation.x = -sw
  w.arms[0].rotation.x = -sw * c
  w.arms[1].rotation.x = a.got ? hand : sw * c
}

// ---- state looks, every frame from the latest status ----
let moving = false // a worker walks this frame: its badge moves, so declutter() must look again
const ARM = { working: [1.35, 1.35], blocked: [1.35, 3], done: [2.6, 2.6], idle: [0.2, 0.2], unknown: [0.2, 0.2] }
function pose(v, t) {
  const s = v.desk.status, w = v.worker, k = v.phase
  const walk = w && breaks(v, t) // on a trip: where the worker is now. null: at the desk.
  const typed = w && s === 'working' && !walk, browsing = w && s === 'idle' && !walk && !v.desk.away, m = v.screen.material // an empty chair types nothing
  if (typed) {
    typing(v, Math.floor(t * 10))
    if (!v.halo) { v.halo = new THREE.Mesh(haloGeo, glow); v.halo.position.set(v.screen.position.x, v.screen.position.y, v.screen.position.z + 0.04); v.screen.parent.add(v.halo) }
  }
  if (v.halo) v.halo.visible = typed
  if (v.logo) v.logo.visible = typed, v.logo.material.color.copy(COLOR.working).multiplyScalar(0.75 + 0.25 * Math.sin(t * 3 + k))
  if (browsing) browse(v, t)
  const lit = typed || browsing // the screen shows a picture
  if (!!m.map !== !!lit) { m.map = lit ? v.tex : null; m.needsUpdate = true } // a screen that stops working loses its text at once
  (lit ? m.color.setRGB(1, 1, 1) : m.color.copy(w ? COLOR[s] : SHELL)).multiplyScalar(typed ? 0.925 + 0.075 * Math.sin(t * 23 + k) : 1) // 0.85..1: a flicker that stays yellow
  if (!w) return
  if (walk) {
    stroll(w, v.desk, walk, t)
    moving = true
    for (const id of opens(office, v.desk, walk)) ajar.add(id)
  } else {
    const bob = s === 'working' ? 0.15 * Math.sin(t * 16 + k) : 0
    w.g.position.set(0, 0.5, 0.4)
    w.g.rotation.set(s === 'idle' ? 0.25 : 0, 0, 0)
    w.sit.visible = true
    w.stand.visible = w.mug.visible = false
    w.arms[0].rotation.x = ARM[s][0] + bob
    w.arms[1].rotation.x = browsing ? 1.15 + 0.02 * Math.sin(t * 1.3 + k) : ARM[s][1] - bob // browsing: the right hand rests on the mouse
  }
  w.arms[1].rotation.z = !walk && browsing ? 0.3 : 0 // browsing: the arm turns out to the mouse
  w.paper.visible = s === 'done'
  w.beacon.visible = s === 'blocked'
  w.beacon.scale.setScalar(1 + 0.25 * Math.sin(t * 8))
  for (const m of w.mats) m.opacity = s === 'unknown' ? 0.35 : 1
}

// ---- labels: hide one that overlaps a more important one ----
let tags = [], seen = '', nextPass = 0 // seen: the view of the last pass. '' forces a new pass.
function declutter() {
  const key = [camera.zoom, camera.position.x, camera.position.z, innerWidth, innerHeight].join()
  if (key === seen) return
  seen = key
  const kept = []
  // Read all rects first, then write: no layout per label. visibility, not display: CSS2DRenderer owns display.
  tags.map((e) => [e, e.getBoundingClientRect()]).forEach(([e, r]) => {
    const hide = kept.some((k) => r.left < k.right && k.left < r.right && r.top < k.bottom && k.top < r.bottom)
    e.style.visibility = hide ? 'hidden' : ''
    if (!hide && r.width) kept.push(r)
  })
}

// ---- update from a new office model ----
let office = null, sig = '', laid = '' // sig: the build signature. laid: the route inputs of the last update

function update(next) {
  office = next
  const rooms = office.rooms.map((r) => [r.id, r.x, r.z, r.w, r.d, r.pods.map((p) => [p.id, p.x, p.z, p.w, p.d])])
  const lay = JSON.stringify([ // the inputs of route(): the workspace rooms and the kitchen with their doors, the cross corridor and the desks
    office.rooms.filter((r) => r.kind === 'workspace' || r.kind === 'kitchen').map((r) => [r.id, r.x, r.z, r.w, r.d, r.door, r.pods.map((p) => [p.id, p.x, p.z, p.w, p.d])]),
    office.corridors.at(-1),
    office.desks.map((d) => [d.id, d.x, d.z, d.roomId, d.podId]),
  ])
  const s = JSON.stringify([rooms, office.desks.map((d) => [d.id, d.x, d.z, d.agent ? d.agent.kind ?? '?' : 0, d.away]), office.subagents.map((s) => [s.id, s.x, s.z, s.rot, s.model])])
  if (lay !== laid) { trips.clear(); claimed.clear(); laid = lay } // a change of the routes ends every trip
  for (const d of office.desks) if (d.away || !d.agent) endBreak(trips, claimed, d.id) // the worker sits at the meeting table, or the agent quit: no worker, no trip
  if (s !== sig) {
    build(office)
    if (!sig) frame(office.rooms.find((r) => r.id === office.focus.workspaceId) ?? { x: 0, z: 0, w: office.bounds.w, d: office.bounds.d })
    sig = s
  }
  for (const r of office.rooms) {
    const v = views.get(r.id)
    v.light.material.color.set(r.status ? COLOR[r.status] : C.wood)
    v.sign.textContent = r.label
    v.sign.style.setProperty('--c', r.status ? STATUS_COLOR[r.status] : C.wood)
    for (const p of r.pods) views.get(p.id).lamp.material.color.copy(COLOR[p.status])
  }
  for (const d of office.desks) {
    const v = views.get(d.id)
    v.desk = d
    if (!v.worker) continue
    v.worker.badge.textContent = `${who(d)} · ${d.id}`
    v.worker.badge.style.setProperty('--c', STATUS_COLOR[d.status])
  }
  for (const s of office.subagents) views.get(s.id).worker.badge.textContent = `${s.label ?? 'subagent'} · ${family(s.model)}`
  // Labels for declutter(), most important first: agent badges by status, then door signs by status.
  tags = [
    ...office.desks.filter((d) => d.agent).map((d) => [10 + STATUS_RANK[d.status], views.get(d.id).worker.badge]),
    ...office.subagents.map((s) => [10 + STATUS_RANK.working, views.get(s.id).worker.badge]),
    ...office.rooms.map((r) => [STATUS_RANK[r.status] ?? 0, views.get(r.id).sign]),
  ].sort((a, b) => b[0] - a[0]).map(([, e]) => e)
  seen = ''
  const f = office.desks.find((d) => d.focused)
  spot.visible = !!f
  if (f) { spot.position.set(f.x, 8, f.z); spot.target.position.set(f.x, 0, f.z) }
  hud()
  if (!$('panel').hidden) fill()
}

const el = (tag, text, status) => {
  const e = Object.assign(document.createElement(tag), { textContent: text })
  if (status) e.style.setProperty('--c', STATUS_COLOR[status])
  return e
}

const rows = new Map() // desk id -> list button. A button stays across updates, so keyboard focus and a held click survive.
function hud() {
  $('counts').replaceChildren(...Object.entries(office.counts).map(([s, n]) => el('span', `${n} ${s}`, s)))
  $('meetings').textContent = `${plural(office.rooms.filter((r) => r.session).length, 'meeting')} · ${plural(office.subagents.length, 'subagent')}`
  const agents = office.desks
    .filter((d) => d.agent)
    .sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status] || b.agent.stateChangeSeq - a.agent.stateChangeSeq)
  for (const [id, b] of rows) if (!agents.some((d) => d.id === id)) { b.remove(); rows.delete(id) }
  agents.forEach((d, i) => {
    if (!rows.has(d.id)) rows.set(d.id, $('list').appendChild(document.createElement('button')))
    const b = rows.get(d.id)
    b.textContent = `${who(d)} · ${d.status} · ${office.rooms.find((r) => r.id === d.roomId).label}`
    b.style.setProperty('--c', STATUS_COLOR[d.status])
    b.style.order = i // #list is a flex column, so CSS order sorts the rows without a DOM move
    b.onclick = () => { const at = d.away ?? d; goal = new THREE.Vector3(at.x, 0, at.z); open(d.id) }
  })
}

function setOnline(on, note) {
  document.body.classList.toggle('offline', !on) // CSS dims the scene and its labels
  $('note').textContent = note
}

// ---- camera ----
let goal = null
// The zoom that fits a w x d floor. It spans 0.71 (w + d) across the screen and 0.41 (w + d) top to bottom in isometric view.
const fit = (w, d) => Math.min((camera.right * 2) / (0.71 * (w + d) + 4), VIEW / (0.41 * (w + d) + 5))
function frame({ x, z, w, d }) {
  controls.target.set(x + w / 2, 0, z + d / 2)
  camera.position.copy(controls.target).add(OFFSET)
  camera.zoom = fit(w, d)
  camera.updateProjectionMatrix()
}
// Zoomed far out, the target may stray less from the building center, so min zoom shows the whole building.
const center = new THREE.Vector3(), off = new THREE.Vector3()
function keepInView() {
  const { w, d } = office.bounds, min = fit(w, d)
  controls.minZoom = min
  const max = (Math.hypot(w, d) / 2) * Math.max(0, Math.min(1, 2 * (camera.zoom / min - 1)))
  off.copy(controls.target).sub(center.set(w / 2, 0, d / 2))
  if (off.length() <= max + 1e-3) return
  goal = null
  controls.target.copy(center).add(off.setLength(max))
  camera.position.copy(controls.target).add(OFFSET)
}

// ---- side panel ----
let selected = null, target = null // target: the pane the focus button focuses
function open(id) {
  selected = id
  $('result').textContent = ''
  $('panel').hidden = false
  fill()
}
const close = () => { $('panel').hidden = true }

function fill() {
  const d = office.desks.find((x) => x.id === selected), s = office.subagents.find((x) => x.id === selected)
  if (!d && !s) return close()
  const o = s && office.desks.find((x) => x.id === s.deskId) // a subagent has no pane: the button focuses its orchestrator
  target = s ? o?.id : d.id
  $('focus').textContent = s ? 'Focus orchestrator' : 'Focus in herdr'
  $('focus').disabled = DEMO || !target
  let rows
  if (s) {
    $('who').textContent = s.label ?? 'subagent'
    rows = { label: s.label, phase: s.phase ?? '-', model: s.model ?? 'default', workflow: s.workflow ?? '- (plain subagent)', orchestrator: o ? `${who(o)} · ${o.id}` : 'not in herdr' }
  } else {
    const room = office.rooms.find((r) => r.id === d.roomId)
    $('who').textContent = d.agent ? who(d) : 'empty desk'
    rows = {
      kind: d.agent ? d.agent.kind ?? 'agent' : 'shell (no agent)', name: d.agent?.name ?? '-', status: d.status,
      room: room.label, tab: room.pods.find((p) => p.id === d.podId).label, cwd: d.cwd, title: d.title, pane: d.id,
    }
  }
  $('fields').replaceChildren(...Object.entries(rows).flatMap(([k, v]) => [el('dt', k), el('dd', v ?? '')]))
}

$('close').onclick = close
addEventListener('keydown', (e) => e.key === 'Escape' && close())
$('focus').onclick = async () => {
  $('result').textContent = '...'
  try {
    const r = await fetch('/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-office-token': TOKEN },
      body: JSON.stringify({ type: 'focus', pane_id: target }),
    })
    $('result').textContent = r.ok ? `ok: herdr focused ${target}` : `error: ${(await r.json()).error}`
  } catch (e) {
    $('result').textContent = `error: ${e.message}`
  }
}

// Click (not drag) on a desk or a worker opens the panel. The desks are merged meshes, so test the ray against a box per desk
// and per meeting seat (the worker sits 0.4 behind the seat origin).
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), pick = new THREE.Box3(), hit = new THREE.Vector3()
let down = [0, 0]
renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; goal = null })
renderer.domElement.addEventListener('click', (e) => {
  if (!office || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return
  ray.setFromCamera(ndc.set((e.clientX / innerWidth) * 2 - 1, (-e.clientY / innerHeight) * 2 + 1), camera)
  const seated = (id, s) => {
    const x = s.x + 0.4 * Math.sin((s.rot * Math.PI) / 2), z = s.z + 0.4 * Math.cos((s.rot * Math.PI) / 2)
    return [id, x - 0.45, z - 0.45, x + 0.45, z + 0.45]
  }
  let best = null, near = Infinity
  for (const [id, x0, z0, x1, z1] of [
    ...office.desks.map((d) => [d.id, d.x - 1, d.z - 0.8, d.x + 1, d.z + 0.9]),
    ...office.desks.filter((d) => d.away).map((d) => seated(d.id, d.away)),
    ...office.subagents.map((s) => seated(s.id, s)),
  ]) {
    pick.min.set(x0, 0, z0)
    pick.max.set(x1, 1.8, z1)
    const t = ray.ray.intersectBox(pick, hit) && hit.distanceTo(ray.ray.origin)
    if (t !== null && t < near) { near = t; best = id }
  }
  if (best) open(best)
})

let last = 0 // the time of the last frame
renderer.setAnimationLoop((ms) => {
  const t = ms / 1000
  if (goal) {
    controls.target.lerp(goal, 0.15)
    if (controls.target.distanceTo(goal) < 0.01) goal = null
    camera.position.copy(controls.target).add(OFFSET)
  }
  controls.update()
  if (office) keepInView()
  labels.domElement.style.fontSize = `${Math.min(13, Math.max(8, 3 + camera.zoom * 4))}px` // labels shrink with the rooms
  moving = false
  ajar.clear()
  for (const v of views.values()) if (v.desk) pose(v, t)
  if (office) swing(t - last)
  last = t
  if (moving && t > nextPass) { seen = ''; nextPass = t + 0.25 } // a walking badge: a few passes a second
  renderer.render(scene, camera)
  labels.render(scene, camera)
  declutter()
})

// ---- data source ----
if (DEMO) {
  $('focus').disabled = true
  $('demo').hidden = false
  let tick = 0
  const step = () => update(buildOffice(demoSnapshot(tick), demoMeetings(tick++), office)) // office: subagents keep their seats
  step()
  setInterval(step, 1000)
} else {
  const es = new EventSource('/events')
  es.onmessage = (e) => {
    const m = JSON.parse(e.data)
    setOnline(m.online, m.online ? '' : 'offline — herdr socket not reachable')
    if (m.snapshot) update(buildOffice(m.snapshot, m.meetings, office))
  }
  // A restarted bridge has a new token. Reload when the stream comes back, so the page gets it.
  es.onerror = () => { setOnline(false, 'offline — bridge not reachable'); es.onopen = () => location.reload() }
}
