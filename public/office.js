import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { daylight, STATUS_RANK, STATUS_COLOR, buildOffice, demoSnapshot, demoMeetings, candleSpots, lightningPlan, flash, ghosts, ghostAt, snowflakes, flakeAt, twinkle, rng, outdoors, hash, season, calm, idleBreaks, nextStop } from './model.js'
import { box, seat, plant, clutter, workspaceDecor, kitchen, meeting, lobby, party, terrace, SNOW, LAMP, WOOD, WOOD_D, CREAM } from './decor.js'

const $ = (id) => document.getElementById(id)
const DEMO = new URLSearchParams(location.search).has('demo')
const SEASON = new URLSearchParams(location.search).get('season') // halloween or winter shows that season on any date, another value shows none
const TIME = (new URLSearchParams(location.search).get('time') ?? '').match(/^([01]?\d|2[0-3]):([0-5]\d)$/) // ?time=HH:MM shows the light of that time, else the local clock
const clock = () => { if (TIME) return 60 * TIME[1] + +TIME[2]; const n = new Date(); return 60 * n.getHours() + n.getMinutes() } // minutes since local midnight
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
  grass: [pix(4, (x, y) => grey([255, 226, 244, 236, 232, 250, 222, 246, 242, 228, 255, 230, 224, 248, 234, 240][y * 4 + x])), 1],
}
function floor({ x, z, w, d }, [tex, size], color) {
  const map = Object.assign(tex.clone(), { needsUpdate: true })
  map.repeat.set(w / size, d / size)
  box(world, [w, 0.1, d], [x + w / 2, -0.1, z + d / 2], new THREE.MeshLambertMaterial({ color, map }))
}

// ---- walls: zero-width lines on the room edges, drawn T thick and centered ----
const T = 0.3, H = 2.6, DOOR = 1.2
// C.wood is also the door light and sign of a room without a status: no status color.
// C.grass and C.hedge are dark plain greens, far from the idle green.
const C = { cream: CREAM, inner: '#e8dcc6', cap: '#8a7663', frame: '#8c7b6b', wood: '#9c6f4a', door: WOOD, sill: '#f7f2e8', brass: '#d8b45c', slab: '#3a322d', post: '#5a4d42', grass: '#6b9a48', hedge: '#4f7a3a' }
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
const DECOR = { workspace: workspaceDecor, kitchen, meeting, lobby, party }
const ROOM_FLOOR = { meeting: [FLOOR.planks, '#b98b5e'], kitchen: [FLOOR.checker, '#ffffff'], lobby: [FLOOR.stone, '#eee7dc'], party: [FLOOR.carpet, '#3f3a4a'] }

function build(office, season) {
  if (world) {
    views.forEach((v) => v.tex?.dispose()) // typing textures: the screen map is null when the desk is not typing
    world.traverse((o) => {
      o.element?.remove()
      if (o.geometry?.userData.merged) o.geometry.dispose()
      if (o.isInstancedMesh) o.dispose() // frees the instance buffer
      if (o.material && !o.material.userData.shared) { if (!o.material.map?.userData.shared) o.material.map?.dispose(); o.material.dispose() }
    })
    scene.remove(world)
  }
  world = new THREE.Group()
  scene.add(world)
  views.clear()
  live.clear()
  winter = season === 'winter'
  flames = []; pools = []; bulbs = []
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
    const spot = DECOR[r.kind](g, r, season) // Halloween: where the room wants its candelabra
    if (spot) candelabra(spot.x, spot.z, 'x', 2.6)
    // Inner walls, each drawn once: the -x and -z edge of every room, the door wall of a north row, the wall to the cross corridor.
    if (r.x > 0) inner('z', r.x, r.z, r.z + r.d, [])
    if (r.z > 0) inner('x', r.z, r.x, r.x + r.w, r.door.side === 'north' ? [[r.door.x, DOOR]] : [])
    if (r.door.side === 'south') inner('x', r.z + r.d, r.x, r.x + r.w, [[r.door.x, DOOR]])
    if (Math.abs(r.x + r.w - W) < 1e-6) inner('z', W, r.z, r.z + r.d, [])
    door(r)
    if (r.kind === 'party') partyLights(r)
    for (const p of r.pods) {
      const lx = p.x + LAMP[0], lz = p.z + LAMP[1]
      box(world, [0.12, 2, 0.12], [lx, 0, lz], C.post)
      for (const y of [1.94, 2.3]) box(world, [0.38, 0.06, 0.38], [lx, y, lz], C.post) // a dark housing, so the yellow shows on cream
      const lamp = box(world, [0.3, 0.3, 0.3], [lx, 2, lz], fresh(0))
      live.add(lamp)
      views.set(p.id, { lamp })
    }
  }
  // Terraces: the grass, terrace() in a group at the corner, and one glass wall on each edge to a room or a corridor. A room draws
  // no +x wall away from the cross corridor, and a south row draws no +z wall, so the terrace draws these. Two terraces back to back
  // share their edge with no wall: one courtyard. A first-row terrace gets a hedge on its north edge (below), and a last-row one keeps the stub.
  for (const t of office.terraces) {
    floor(t, FLOOR.grass, season === 'winter' ? SNOW : C.grass)
    const g = new THREE.Group()
    g.position.set(t.x, 0, t.z)
    world.add(g)
    terrace(g, t, season)
    const back = office.terraces.find((u) => Math.abs(u.z + u.d - t.z) < 1e-6), x1 = back ? Math.max(t.x, back.x) : W // the wall behind ends where the courtyard starts
    inner('z', t.x, t.z, t.z + t.d, []) // the last room of the row
    inner('z', W, t.z, t.z + t.d, []) // the cross corridor
    if (t.z > 0 && x1 > t.x) inner('x', t.z, t.x, x1, []) // the band corridor, or the rooms of the row behind
    if (office.corridors.some((c) => Math.abs(c.z - t.z - t.d) < 1e-6)) inner('x', t.z + t.d, t.x, W, []) // the band corridor in front
  }
  // Outer walls: the far ones full height with windows, the camera-side ones cut down, the entrance in the south one. The north wall
  // skips a first-row terrace: a low hedge stands there, so the camera sees in, and the cross corridor keeps its piece of the wall.
  outer('z', 0, 0, BD, office.rooms.filter((r) => r.x === 0).flatMap((r) => [0, r.z, r.z + r.d, BD]))
  const open = office.terraces.find((t) => t.z === 0), nx = open ? open.x : BW
  outer('x', 0, 0, nx, office.rooms.filter((r) => r.z === 0).flatMap((r) => [r.x, r.x + r.w, BW]).filter((s) => s <= nx))
  if (open) {
    outer('x', 0, W, BW, [W, BW])
    run('x', 0, open.x + T / 2, W - T / 2, 0, 0.9, C.hedge, T + 0.06)
    if (season === 'winter') run('x', 0, open.x + T / 2, W - T / 2, 0.9, 0.05, SNOW, T + 0.1) // snow on the hedge
  }
  stub('z', BW, 0, BD, [])
  const { x: ex } = office.entrance
  stub('x', BD, 0, BW, [[ex, 2]])
  for (const k of [-1, 1]) box(world, [0.12, 0.7, T + 0.06], [ex + k * 1.0, 0, BD], C.frame) // posts cut down like the wall
  box(world, [2.6, 0.4, 1.4], [ex, -0.5, BD + 0.75], C.slab) // a step outside, with the doormat on it
  box(world, [2.4, 0.04, 1.2], [ex, -0.1, BD + 0.75], C.frame)

  for (const d of office.desks) desk(d)
  for (const s of office.subagents) attendee(s)
  balls = office.games.map((g) => { // a white ball for each ping-pong table, hidden until rally() shows it
    if (g.kind !== 'pingpong') return null
    const b = box(world, [0.07, 0.07, 0.07], [g.x, 0.77, g.z], '#ffffff')
    b.visible = false
    live.add(b)
    return b
  })
  bubble = new THREE.Group() // one speech bubble for the office: a white box with three dots on its +z face
  bubble.visible = false
  world.add(bubble)
  live.add(bubble)
  box(bubble, [0.5, 0.3, 0.1], [0, 0, 0], '#ffffff')
  for (const x of [-0.15, 0, 0.15]) box(bubble, [0.06, 0.06, 0.06], [x, 0.12, 0.05], '#1a1a1a')
  flakes = season === 'winter' ? [...office.terraces, ...outdoors(office.bounds)].flatMap(snowflakes) : []
  flakeMesh = null
  if (flakes.length) { // one mesh for all flakes: snowfall() writes the matrices
    flakeMesh = new THREE.InstancedMesh(flakeGeo, flakeMat, flakes.length)
    flakeMesh.frustumCulled = false // the instances move, so the bounding sphere goes stale
    world.add(flakeMesh)
    live.add(flakeMesh)
  }
  if (season === 'halloween') for (const s of candleSpots(office)) candelabra(s.x, s.z, s.axis, 3.2)
  spooks = season === 'halloween' ? ghosts(office.bounds).map((p, i) => Object.assign(ghost(p), { until: spooks[i]?.until ?? 0 })) : [] // a rebuild keeps a shown balloon
  lightBulbs()
  bake()
  // The sun moves with the clock (night()). Its shadow box holds the whole building for each direction.
  const R = Math.hypot(BW, BD) / 2 + 2
  sun.target.position.set(BW / 2, 0, BD / 2)
  reach = R
  Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 4 * R }).updateProjectionMatrix()
  world.traverse((o) => { if (o.isMesh) { o.castShadow = o.material !== GLASS && o.material !== SKY && o.material.depthWrite; o.receiveShadow = true } }) // depthWrite false: a light beam or a halo, no shadow
}

// ---- Halloween night: dim cool light, iron candelabra with flickering flames and a fake glow (no three.js Light: it shines through walls) ----
let flames = [] // { flame, halo, ph, y }
let pools = [] // { mesh, ph }: a flat additive circle on the floor
let dark = false // the night is on
let winter = false // the winter knit sweaters are on: build() sets it, worker() reads it
const CASTLE = { dir: [-4, 10, 5], sun: '#a9bce8', sunPower: 0.8, ambient: '#7f8fb8', ground: '#2e2622', ambientPower: 1.1, window: '#1d2540', windowGlow: '#141c33', background: '#0b0d1a' } // the Halloween light, in the shape of daylight()
let reach = 0 // the shadow radius R: build() sets it, night() puts the sun at 2 * reach
function night(on) { // on: the castle night. Else the light follows the clock.
  dark = on
  const k = on ? CASTLE : daylight(clock())
  ambient.color.set(k.ambient); ambient.groundColor.set(k.ground); ambient.intensity = k.ambientPower
  sun.color.set(k.sun); sun.intensity = k.sunPower; sun.castShadow = k.sunPower > 0
  sun.position.set(...k.dir).setLength(2 * reach).add(sun.target.position)
  SKY.color.set(k.window); SKY.emissive.set(k.windowGlow)
  scene.background.set(k.background)
}
const blob = (() => { // one soft round gradient for all halos and pools: build() never disposes it
  const c = document.createElement('canvas'); c.width = c.height = 64
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, '#fff'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 64, 64)
  return Object.assign(new THREE.CanvasTexture(c), { userData: { shared: true } })
})()
const poolGeo = new THREE.PlaneGeometry(1, 1) // one for all pools: build() never disposes it
const glowMat = (color, opacity) => new THREE.MeshBasicMaterial({ map: blob, color, blending: THREE.AdditiveBlending, transparent: true, opacity, depthWrite: false })
function pool(x, z, size) {
  const mesh = new THREE.Mesh(poolGeo, glowMat('#ff8a30', 0.3))
  mesh.scale.set(size, size, 1)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(x, 0.04, z)
  world.add(mesh); live.add(mesh)
  pools.push({ mesh, ph: hash(`${x},${z}`, 1e9) / 1e9 * 6.28 })
}
function candle(x, y, z, h) { // y: the base of the candle
  box(world, [0.07, h, 0.07], [x, y, z], CREAM)
  const flame = box(world, [0.05, 0.11, 0.05], [x, y + h, z], fresh('#ff8a30'))
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: blob, color: '#ff9a40', blending: THREE.AdditiveBlending, transparent: true, opacity: 0.35, depthWrite: false })) // depth test on: a wall header hides the halo with its flame
  halo.scale.set(0.9, 0.9, 1)
  halo.position.set(x, y + h + 0.08, z)
  world.add(halo); live.add(flame); live.add(halo)
  flames.push({ flame, halo, ph: hash(`${x},${y},${z}`, 1e9) / 1e9 * 6.28, y: y + h })
}
const IRON = '#2b2a2e'
function candelabra(x, z, axis, poolSize) { // three candles on a bar along axis
  box(world, [0.3, 0.06, 0.3], [x, 0, z], IRON)
  box(world, [0.06, 1.2, 0.06], [x, 0.06, z], IRON)
  box(world, axis === 'x' ? [0.6, 0.04, 0.06] : [0.06, 0.04, 0.6], [x, 1.22, z], IRON)
  for (const k of [-0.25, 0, 0.25]) candle(axis === 'x' ? x + k : x, 1.26, axis === 'x' ? z : z + k, 0.16)
  pool(x, z, poolSize)
}
const CALM = matchMedia('(prefers-reduced-motion: reduce)')
const mix = new THREE.Color(), HOT = new THREE.Color('#ff6a1a'), WARM = new THREE.Color('#ffae42')
const wob = (t, ph) => (Math.sin(t * 7 + ph) + 0.6 * Math.sin(t * 11.3 + ph * 1.7) + 0.4 * Math.sin(t * 17.1 + ph * 2.3)) / 4 + 0.5 // 0..1
function candles(t) {
  const amp = CALM.matches ? 0.5 : 1 // reduce motion: half the flicker
  for (const f of flames) {
    const n = 0.5 + (wob(t, f.ph) - 0.5) * amp, h = 0.8 + 0.45 * n
    f.flame.material.color.copy(mix.copy(HOT).lerp(WARM, n))
    f.flame.scale.y = 0.11 * h
    f.flame.position.y = f.y + f.flame.scale.y / 2
    f.halo.material.opacity = 0.25 + 0.2 * n
  }
  for (const p of pools) p.mesh.material.opacity = 0.22 + 0.12 * (0.5 + (wob(t * 0.8, p.ph) - 0.5) * amp)
}
// ---- Winter tree bulbs: decor.js marks the bulb meshes with userData.bulb. Each gets one additive halo in front of its face (no three.js Light). ----
let bulbs = [] // { halo, ph }
function lightBulbs() {
  world.updateMatrixWorld(true)
  const seeds = new Map(), p = new THREE.Vector3(), q = new THREE.Vector3()
  const found = []
  world.traverse((o) => { if (o.isMesh && o.material.userData.bulb) found.push(o) })
  for (const m of found) {
    m.getWorldPosition(p); m.parent.getWorldPosition(q) // q: the tree. The tree stands at rot 0, so a bulb faces +z or +x.
    const key = `${q.x},${q.z}`
    if (!seeds.has(key)) seeds.set(key, rng(hash(key, 1e9)))
    const zFace = Math.abs(p.z - q.z) > Math.abs(p.x - q.x)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: blob, color: m.material.color, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.35, depthWrite: false }))
    halo.scale.set(0.35, 0.35, 1)
    halo.position.set(p.x + (zFace ? 0 : 0.06), p.y, p.z + (zFace ? 0.06 : 0))
    world.add(halo); live.add(halo)
    bulbs.push({ halo, ph: seeds.get(key)() * 6.28 })
  }
}
function bulbLights(t) {
  const amp = CALM.matches ? 0.5 : 1 // reduce motion: half the swing
  for (const b of bulbs) b.halo.material.opacity = twinkle(b.ph, t, amp)
}
const NIGHT_SKY = new THREE.Color('#141c33'), FLASH_SKY = new THREE.Color('#9fb4e0'), NIGHT_BG = new THREE.Color('#0b0d1a'), FLASH_BG = new THREE.Color('#2a3150')
let strike = null // { start, plan }: the next strike or the one in progress
function lightning(t) { // the sky flashes at a random time, at night only, never with reduce motion
  if (!dark || CALM.matches) { if (dark && strike) { ambient.intensity = 1.1; SKY.emissive.copy(NIGHT_SKY); scene.background.copy(NIGHT_BG) } strike = null; return }
  strike ??= (() => { const plan = lightningPlan(); return { start: t + plan.wait, plan } })()
  const p = flash(strike.plan, t - strike.start)
  ambient.intensity = 1.1 + 1.2 * p
  SKY.emissive.copy(NIGHT_SKY).lerp(FLASH_SKY, p)
  scene.background.copy(NIGHT_BG).lerp(FLASH_BG, p)
  if (t > strike.start + 1) strike = null
}
// The Halloween ghosts float through walls, rooms, desks, and workers, and nobody reacts. They are opaque, because a see-through body
// reads as an unknown worker (opacity 0.35). Not in views. The click handler gives each ghost a box: a hit shows its balloon, no panel.
const SHEET = '#f4f4f8'
let spooks = [] // { g, path, rot, boo, until }: the group of each ghost (in live), its loop, its heading, its balloon, and the balloon end. build() makes them.
function ghost(path) { // a sheet with a jagged hem and two black eyes, 1.2 high. The eyes face +z before the turn. y 0 is the base.
  const g = new THREE.Group()
  world.add(g); live.add(g)
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const h = (i + j) % 2 ? 0.1 : 0.2; box(g, [0.14, h, 0.14], [0.14 * i - 0.21, 0.2 - h, 0.14 * j - 0.14], SHEET) } // the hem: teeth in a checker
  box(g, [0.56, 0.75, 0.42], [0, 0.2, 0], SHEET)
  box(g, [0.44, 0.15, 0.34], [0, 0.95, 0], SHEET)
  box(g, [0.28, 0.1, 0.2], [0, 1.1, 0], SHEET)
  for (const s of [-1, 1]) box(g, [0.08, 0.12, 0.02], [s * 0.1, 0.78, 0.215], '#1a1a1a')
  label(g, 'boo', [0, 1.5, 0]).textContent = 'Boohooo!' // the easter egg balloon: a click on the ghost shows it for 2 s
  const boo = g.children.at(-1) // label() returns the div, and its CSS2DObject is the last child
  boo.center.set(0.5, 1) // the bottom edge on the point: the tail points down to the head
  boo.visible = false
  return { g, path, rot: null, boo, until: 0 }
}
function haunt(t) { // each ghost floats on its loop and turns to face the way it floats. Reduce motion: half the speed.
  const s = CALM.matches ? t / 2 : t
  for (const sp of spooks) {
    const p = ghostAt(sp.path, s), to = Math.atan2(p.dx, p.dz)
    sp.rot = sp.rot == null ? to : sp.rot + (to - sp.rot - Math.round((to - sp.rot) / TAU) * TAU) * 0.1 // the shortest way round
    sp.g.position.set(p.x, p.y, p.z)
    sp.g.rotation.y = sp.rot
    sp.boo.visible = t < sp.until // until: the click time plus 2 s, on the clock of the frame time
  }
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
  // Winter: a knit sweater over the shirt. The shirt color stays. The knit is off-white, or navy on a light shirt. One material for all knit parts.
  const knit = winter && lit(new THREE.Color(color).getHSL({}, THREE.SRGBColorSpace).l >= 0.8 ? '#2f3b52' : '#f4f1ea')
  if (knit) {
    box(g, [0.52, 0.05, 0.32], [0, 0, 0], knit) // hem
    box(g, [0.52, 0.07, 0.32], [0, 0.33, 0], knit) // chest band
    box(g, [0.52, 0.03, 0.32], [0, 0.53, 0], knit) // yoke: the camera looks down on it, the chair back hides the rest of the back
    for (const x of [-0.18, -0.06, 0.06, 0.18]) box(g, [0.05, 0.05, 0.32], [x, 0.43, 0], knit) // dots on the back and the front
    for (const z of [-0.075, 0.075]) box(g, [0.52, 0.05, 0.05], [0, 0.43, z], knit) // dots on the sides
  }
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
    if (knit) {
      box(a, [0.16, 0.06, 0.16], [0, -0.5, 0], knit) // cuff
      box(a, [0.16, 0.05, 0.16], [0, -0.2, 0], knit) // ring round the upper arm
    }
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
  // The lunch plate on the table top (stroll() shows it in a lunch stay). It comes after mats: only an idle worker eats, so it never fades,
  // and the cached colors stay opaque. Bread, a carrot and a beet: no color near a status color.
  const plate = new THREE.Group()
  plate.position.set(0, 0.28, -0.5) // the table top (world y 0.78), in front of the worker
  plate.visible = false
  g.add(plate)
  box(plate, [0.36, 0.03, 0.28], [0, 0, 0], '#eef0f4')
  box(plate, [0.12, 0.07, 0.1], [-0.08, 0.03, 0], '#8b5a2b')
  box(plate, [0.06, 0.05, 0.06], [0.08, 0.03, -0.05], '#e8913a')
  box(plate, [0.06, 0.05, 0.06], [0.1, 0.03, 0.06], '#7a4b94')
  // The ping-pong paddle in the right hand (stroll() shows it in a ping-pong stay). It comes after mats, as the plate does. It turns with
  // the arm: a short handle past the hand, and the blade across the arm, so the blade faces the ball when the arm points forward.
  const paddle = new THREE.Group()
  paddle.visible = false
  arms[1].add(paddle)
  box(paddle, [0.05, 0.08, 0.05], [0, -0.58, 0], '#b06a4f')
  box(paddle, [0.2, 0.03, 0.2], [0, -0.61, 0], '#b06a4f')
  // A seated subagent never shows the beacon, so its badge sits just over its head. At 2.2 it would cover the worker behind it.
  return { g, arms, sit, stand, legs, mug, plate, paddle, paper, beacon, mats, badge: label(g, 'badge', [0, d.seated ? 1.2 : 2.2, 0]) }
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

// ---- idle breaks ----
// After a wait, an idle worker walks to a spot, then back. The spot is a counter spot, a lunch chair, a dance spot, a game table, or the water cooler.
// The clock is t of the animation loop. idleBreaks() in model.js keeps each trip by desk id, so a trip survives a rebuild for a new subagent.
// ponytail: a change of the route inputs (`lay` in idleBreaks()) clears every trip: the workers sit at their desks again. Tracking a trip across a new layout needs a new route.
const breaks = idleBreaks() // use() in update(), step() in pose(): where the worker is now, or null at the desk. now() in rally() and tourStep()
const heading = new Map() // desk id -> the eased heading of the worker on a trip. It lives by desk id: a rebuild makes a new group

// ---- doors: closed. A walker opens its own door and the door of its target room (opens() in model.js), and the door closes after it. ----
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

const TAU = Math.PI * 2, HIT = 0.8 // HIT: the seconds of one ping-pong ball crossing, from paddle to paddle
// A worker on a trip stands and walks. The legs swing with the distance, the arms swing the other way. After the
// kitchen the right hand holds the mug. It faces the way it moves, and the counter during the stay.
// Near a door (see calm() in model.js) the arms hang and the mug hand stays low, so no hand goes through the open leaf or a post.
// In the party room the stay is a dance: the worker faces the booth with a sway, at its own tempo and phase.
// In a lunch stay the worker sits on its kitchen chair, faces the table, and eats from the plate.
// In a game stay the worker sits at the chess table or stands with a paddle at the ping-pong table, and faces the table.
// In a chat stay the worker stands at the cooler and faces its partner. The talker waves the arm on the camera side under the speech bubble.
function stroll(w, d, a, t) {
  const g = w.g, back = a.phase === 'back' || a.phase === 'rush', stay = a.phase === 'stay'
  const dance = stay && a.kind === 'party', h = hash(d.id, 1e6), b = t * Math.PI * (1.6 + (h % 100) / 125) + h, beat = Math.sin(b) // 1.6 to 2.4 steps a second: a step is half a turn of b
  const chair = stay && a.kind === 'lunch' && a.seat // a.seat: the kitchen chair of a lunch
  const table = stay && a.kind === 'game' && office.games[a.table] // a.side: 0 west, 1 east
  const talk = stay && a.kind === 'chat' && a.seat // a.seat: the chat spot at the cooler
  const place = table && a.seat, seat = chair || place || talk // a lunch chair point, a game place, or a chat spot: the heading of the stay
  const to = dance ? (office.rooms.find((r) => r.id === a.room).booth.z < a.z ? 0 : Math.PI) + 0.35 * Math.sin(b / 2) : seat ? (seat.rot * Math.PI) / 2 : stay ? 0 : Math.atan2(a.dx * (back ? 1 : -1), a.dz * (back ? 1 : -1))
  const sw = stay ? 0 : 0.7 * Math.sin(a.s * 5), c = calm(Math.min(...office.rooms.map((r) => Math.hypot(a.x - r.door.x, a.z - r.door.z))))
  const hand = stay ? 1.2 + 0.1 * Math.sin(t * 2) : 0.1 + 1.1 * c // the angle of the mug arm
  const was = heading.get(d.id), rot = was == null ? to : was + (to - was - Math.round((to - was) / TAU) * TAU) * 0.25 // the heading lives in heading by desk id: a rebuild makes a new group
  heading.set(d.id, rot)
  g.rotation.set(0, rot, 0)
  g.position.set(a.x - d.x, 0.5 + 0.04 * Math.abs(sw), a.z - d.z)
  w.sit.visible = false
  w.stand.visible = true
  w.mug.visible = a.got
  w.mug.position.set(0.32, 0.43 - 0.5 * Math.cos(hand), -0.56 * Math.sin(hand)) // at the hand, a little past it
  w.legs[0].rotation.x = sw
  w.legs[1].rotation.x = -sw
  w.arms[0].rotation.x = -sw * c
  w.arms[1].rotation.x = a.got ? hand : sw * c
  w.plate.visible = !!chair
  w.paddle.visible = table?.kind === 'pingpong'
  if (talk) { // a chat at the cooler: standing, no mug, both arms down. The talker waves the arm on the camera side and shows the bubble over the head.
    w.arms[0].rotation.x = w.arms[1].rotation.x = 0
    if (a.talk) {
      w.arms[1 - a.side].rotation.x = 0.85 + 0.15 * Math.sin(t * 6) // side 0 (west, faces +x) waves arms[1], side 1 waves arms[0]
      bubble.position.set(a.x, 1.8, a.z)
      bubble.visible = true
    }
    return
  }
  if (place) { // a game: the body at the place, facing the table. A waiter, and a player after the game end, keep the arms down.
    const chess = table.kind === 'chess', u = t - a.begin // u: the time since the game began
    g.position.set(place.x - d.x, 0.5, place.z - d.z)
    w.sit.visible = chess
    w.stand.visible = !chess
    w.arms[0].rotation.x = w.arms[1].rotation.x = 0
    if (!a.play) return
    if (chess) { // both hands on the table. Each turn lasts 3 to 5 s (from begin, so both players agree). The west player moves in the
      // even turns. The player in turn leans to the board and reaches with the right hand, out and back in 1.2 s.
      const turn = 3 + hash(`${a.begin}`, 200) / 100, k = Math.floor(u / turn), f = u - k * turn
      const r = k % 2 === a.side && f < 1.2 ? Math.sin((Math.PI * f) / 1.2) : 0
      w.arms[0].rotation.x = 1.2
      w.arms[1].rotation.x = 1.2 + 0.3 * r // 1.5 or less: a hand over the shoulder means blocked
      g.rotation.set(-0.2 * r, rot, 0, 'YXZ') // YXZ: the lean turns the body about its own x axis, after the heading
    } else { // the ball reaches the west paddle at begin and then each 2 HIT s, the east paddle HIT s later (rally()). The right arm
      // stays at 1.4 or more, so the blade stays over the table top (0.77), and goes to 1.5 at the hit. The stroke is a turn of the
      // body: back by 0.35 0.3 s before the hit, through 0 at the hit, 0.35 through after it, then back again before the next hit.
      const e = (u - a.side * HIT) % (2 * HIT), dt = e > HIT ? e - 2 * HIT : e // the time from the nearest hit of this player
      w.arms[0].rotation.x = 0.3
      w.arms[1].rotation.x = 1.4 + 0.1 * Math.max(0, Math.cos((Math.PI * dt) / 0.6))
      g.rotation.y = rot + 0.35 * (Math.abs(dt) <= 0.3 ? Math.sin((Math.PI * dt) / 0.6) : Math.cos(Math.PI * (dt > 0 ? dt - 0.3 : dt + 1.3)))
    }
    return
  }
  if (chair) { // lunch: sit on the chair (the body point), face the table, and eat. Every 3 to 5 s the right hand goes to the mouth in 1 s.
    g.position.set(chair.x - d.x, 0.5, chair.z - d.z)
    w.sit.visible = true
    w.stand.visible = false
    const u = (t + (h % 50)) % (3 + (h % 200) / 100) // the time in this bite. The phase and the period come from the desk id.
    w.arms[0].rotation.x = 1.2 // on the table
    w.arms[1].rotation.x = 1.2 + 0.8 * (u < 1 ? Math.sin(Math.PI * u) : 0) // 2.0 or less: a hand over the shoulder means blocked
    return
  }
  if (!dance) return
  dancing = true // hop from foot to foot, sway the hips, pump the arms in turn. An arm stays at 1.5 or less: a hand over the shoulder means blocked.
  g.rotation.z = 0.08 * beat
  g.position.y = 0.5 + 0.08 * Math.abs(beat)
  w.legs[0].rotation.x = 0.4 * Math.max(0, beat)
  w.legs[1].rotation.x = 0.4 * Math.max(0, -beat)
  w.arms[0].rotation.x = 0.9 - 0.55 * beat
  w.arms[1].rotation.x = 0.9 + 0.55 * beat
}

// ---- the party room: the parts that move. They show only while a worker dances (disco()). ----
// No three.js light: it shines through the walls into the next room. Magenta, violet and white only, so no light reads as a status.
const DISCO = ['#e040fb', '#8b5cf6', '#ffffff'].map((c) => new THREE.Color(c)), BEAT = 2 // BEAT: the speaker beats a second
let dancing = false // a worker dances this frame. pose() sets it, disco() reads it.
let bubble = null // the speech bubble over the talker at the cooler. build() makes it, the frame loop hides it, stroll() shows it.
function partyLights(r) {
  const [x0, z0, x1, z1] = r.floor, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, { booth } = r
  // The dance floor: 3 own materials on the diagonals, dark like the carpet when off. bake() merges the tiles by material:
  // a color change on a merged mesh still shows, so the tiles need no place in live.
  const tiles = DISCO.map(() => fresh('#2f2b38', THREE.MeshLambertMaterial))
  for (let i = 0; i < Math.round(x1 - x0); i++) for (let j = 0; j < Math.round(z1 - z0); j++) box(world, [0.96, 0.03, 0.96], [x0 + i + 0.5, 0, z0 + j + 0.5], tiles[(i + j) % 3])
  // The disco ball on a rod: a voxel ball of a cube and three slabs. The beams turn with it and hit the floor 1.35 from its axis.
  box(world, [0.03, H - 2.45, 0.03], [cx, 2.45, cz], '#55545c')
  const ball = new THREE.Group(), beams = new THREE.Group(), TILT = 0.55, L = 2.2 / Math.cos(TILT)
  ball.position.set(cx, 2.2, cz)
  ball.add(beams)
  world.add(ball)
  box(ball, [0.4, 0.4, 0.4], [0, -0.2, 0], '#c9c9d6')
  for (const s of [[0.5, 0.3, 0.3], [0.3, 0.5, 0.3], [0.3, 0.3, 0.5]]) box(ball, s, [0, -s[1] / 2, 0], '#ececf4')
  beams.visible = false
  DISCO.forEach((c, k) => {
    const p = new THREE.Group()
    p.rotation.set(TILT, (k * TAU) / 3, 0, 'YXZ') // tilt, then turn
    beams.add(p)
    box(p, [0.1, L, 0.1], [0, -L, 0], Object.assign(fresh(c), { transparent: true, opacity: 0.3, depthWrite: false })).renderOrder = 2 // after the glass
  })
  // Two speakers beside the booth, the fronts turned like the booth front. A woofer and a tweeter on each front.
  // The whole box breathes a little too: a booth of a south-row room faces away from the camera, and so do its cones.
  const cones = [], speakers = [-1, 1].map((s) => {
    const sp = new THREE.Group()
    sp.position.set(booth.x + s * 1.3, 0, booth.z)
    sp.rotation.y = (booth.rot * Math.PI) / 2
    world.add(sp)
    box(sp, [0.6, 1.2, 0.5], [0, 0, 0], '#2b2a33')
    for (const [y, n, f] of [[0.42, 0.42, BEAT], [0.92, 0.18, 2 * BEAT]]) { // [height, size, pulses a second]
      const c = new THREE.Group()
      c.position.set(0, y, 0.25)
      sp.add(c)
      box(c, [n, n, 0.04], [0, -n / 2, 0], '#55545c')
      box(c, [n * 0.6, n * 0.6, 0.04], [0, -n * 0.3, 0.015], '#1b1b20')
      cones.push([c, f])
    }
    live.add(sp)
    return sp
  })
  live.add(ball)
  Object.assign(views.get(r.id), { tiles, ball, beams, speakers, cones })
}
// A breath on each pulse: up fast, then back slowly.
const kick = (t, f) => { const p = (t * f) % 1; return Math.min(1, p * 10) * (1 - p) ** 2 }
function disco(t) {
  const v = views.get('party')
  if (!v?.tiles) return
  const step = Math.floor(t * 2) // the floor pattern moves twice a second
  v.tiles.forEach((m, i) => m.emissive.set(dancing ? DISCO[(i + step) % 3] : 0))
  v.beams.visible = dancing
  if (dancing) v.ball.rotation.y = t * 1.5 // the ball stops where it is when the dance ends
  for (const sp of v.speakers) sp.scale.setScalar(dancing ? 1 + 0.03 * kick(t, BEAT) : 1)
  for (const [c, f] of v.cones) c.scale.setScalar(dancing ? 1 + 0.15 * kick(t, f) : 1)
}

// ---- the ping-pong balls: a ball flies only while both players of its table play ----
// A crossing takes HIT s. It starts at the paddle of the hitter, flies over the net, bounces once on the half of the receiver, and rises
// to its paddle. So each rally of two crossings bounces once on each half. The west player hits first, at begin. A paddle hit point is
// 0.65 from the place toward the table, 0.32 to the right of the player, and 0.96 high: the blade at the right arm angle 1.5 (stroll()).
let balls = [] // table index -> the ball of a ping-pong table, or null for a chess table. build() makes them.
const arc = (y0, y1, h, s) => y0 + (y1 - y0) * s + 4 * h * s * (1 - s) // from y0 to y1, h over the straight line at the middle
function rally(t) {
  const games = breaks.now(t).games // the tables in play: both players hold a place, and begin <= t < the earlier end (a rush ends the game of the partner)
  balls.forEach((ball, i) => {
    if (!ball) return
    const play = games.find((m) => m.table === i)
    ball.visible = !!play
    if (!play) return
    const { x, places: [p, q] } = office.games[i], u = (t - play.begin) / HIT, k = Math.floor(u), f = u - k // k: the crossing, f: the part of it
    const west = [p.x + 0.65, p.z + 0.32], east = [q.x - 0.65, q.z - 0.32], [a, b] = k % 2 ? [east, west] : [west, east]
    const fb = (x + (k % 2 ? -0.55 : 0.55) - a[0]) / (b[0] - a[0]) // the bounce, 0.55 from the net on the half of the receiver
    const y = f < fb ? arc(0.96, 0.805, 0.3, f / fb) : arc(0.805, 0.96, 0.15, (f - fb) / (1 - fb)) // 0.805: the ball center on the top (0.77)
    ball.position.set(a[0] + (b[0] - a[0]) * f, y, a[1] + (b[1] - a[1]) * f)
  })
}

// ---- the snow: each flake falls from its start height to the ground and starts again ----
let flakes = [] // the flakes of the terraces and of outdoors(), in winter only. build() makes them.
let flakeMesh = null // one InstancedMesh for all flakes
const flakeGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06) // one for all builds: build() never disposes it
const flakeMat = shared(new THREE.MeshLambertMaterial({ color: '#ffffff' }))
const flakeM = new THREE.Matrix4()
function snowfall(t) {
  if (!flakeMesh) return
  const s = CALM.matches ? t / 2 : t // reduce motion: half the speed
  flakes.forEach((f, i) => {
    const p = flakeAt(f, s)
    flakeMesh.setMatrixAt(i, flakeM.setPosition(p.x, p.y + 0.03, p.z)) // p.y is the base of the flake
  })
  flakeMesh.instanceMatrix.needsUpdate = true
}

// ---- state looks, every frame from the latest status ----
let moving = false // a worker walks this frame: its badge moves, so declutter() must look again
const ARM = { working: [1.35, 1.35], blocked: [1.35, 3], done: [2.6, 2.6], idle: [0.2, 0.2], unknown: [0.2, 0.2] }
function pose(v, t) {
  const s = v.desk.status, w = v.worker, k = v.phase
  const walk = w && breaks.step(v.desk, t) // on a trip: where the worker is now. null: at the desk.
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
    for (const id of walk.doors) ajar.add(id)
  } else {
    heading.delete(v.desk.id) // the next trip starts with the heading of its first step
    const bob = s === 'working' ? 0.15 * Math.sin(t * 16 + k) : 0
    w.g.position.set(0, 0.5, 0.4)
    w.g.rotation.set(s === 'idle' ? 0.25 : 0, 0, 0)
    w.sit.visible = true
    w.stand.visible = w.mug.visible = w.plate.visible = w.paddle.visible = false
    w.arms[0].rotation.x = ARM[s][0] + bob
    w.arms[1].rotation.x = browsing ? 1.15 + 0.02 * Math.sin(t * 1.3 + k) : ARM[s][1] - bob // browsing: the right hand rests on the mouse
  }
  w.arms[1].rotation.z = !walk && browsing ? 0.3 : 0 // browsing: the arm turns out to the mouse
  w.out = !!walk // on a trip: the click handler makes a walker box
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
let office = null, sig = '' // sig: the build signature

function update(next) {
  office = next
  const rooms = office.rooms.map((r) => [r.id, r.x, r.z, r.w, r.d, r.pods.map((p) => [p.id, p.x, p.z, p.w, p.d])])
  const se = SEASON ?? season(new Date())
  const s = JSON.stringify([rooms, office.terraces, office.desks.map((d) => [d.id, d.x, d.z, d.agent ? d.agent.kind ?? '?' : 0, d.away]), office.subagents.map((s) => [s.id, s.x, s.z, s.rot, s.model]), se])
  breaks.use(office, last) // a change of the routes ends every trip, and a desk with away or no agent loses its trip. last: the frame time, so the game of a partner ends now
  if (s !== sig) {
    build(office, se)
    if (!sig) frame(office.rooms.find((r) => r.id === office.focus.workspaceId) ?? { x: 0, z: 0, w: office.bounds.w, d: office.bounds.d })
    sig = s
  }
  night(se === 'halloween')
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

let online = true // the demo never calls setOnline(), so it stays online
function setOnline(on, note) {
  online = on
  document.body.classList.toggle('offline', !on) // CSS dims the scene and its labels
  $('note').textContent = note
}

// The bridge sends version numbers only: null or { current, latest, atStart }. Later is remembered per bridge start (the token).
let offer = null, offered = false // offered: the dialog opened by itself once on this page
function offerUpdate(u) {
  offer = u
  if (!u) { $('updateNote').hidden = true; $('update').close(); return }
  $('updateText').textContent = `herdr-office ${u.latest} is out. You use ${u.current}.`
  $('updateNote').textContent = `Update ${u.latest} available`
  $('updateLink').href = `https://github.com/TheBabaYaga/herdr-office/releases/tag/v${u.latest}`
  let later = null
  try { later = sessionStorage.updateLater } catch {}
  if (u.atStart && !offered && later !== TOKEN) { offered = true; $('update').showModal() } else $('updateNote').hidden = $('update').open
}
$('update').onclose = () => {
  if (!offer) return // offerUpdate(null) closed it
  $('updateNote').hidden = false
  try { sessionStorage.updateLater = TOKEN } catch {}
}
$('updateNote').onclick = () => { $('updateNote').hidden = true; $('update').showModal() }
$('updateClose').onclick = $('updateLater').onclick = () => $('update').close()
$('updateCopy').onclick = async () => {
  const b = $('updateCopy')
  try { await navigator.clipboard.writeText($('updateCode').textContent); b.textContent = 'Copied' } catch { b.textContent = 'Copy failed' }
  setTimeout(() => { b.textContent = 'Copy' }, 2000)
}

// ---- camera ----
let goal = null
let follow = null, zoomTo = null // follow: the desk id of the clicked walker, the frame loop sets goal to it. zoomTo: the zoom to glide to
const tracked = new THREE.Vector3() // the world point of the followed worker
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

// The tour: after TOUR s with no input, the camera visits a stop every HOLD s. Any input ends it.
const TOUR = 300, HOLD = 10
let input = 0 // the time of the last input in seconds, from the same origin as the frame time
let tour = null // null, or { at: the stop, next: the time of the next stop, seen: the stop keys of this round }
function tourStep(t) {
  const { stop, seen: keys } = nextStop(office, breaks.now(t), tour?.seen)
  const r = office.rooms.find((x) => x.id === stop.room), z = fit(r.w, r.d)
  tour = { at: new THREE.Vector3(stop.x, 0, stop.z), next: t + HOLD, seen: keys }
  zoomTo = stop.whole ? z : Math.min(controls.maxZoom, 1.5 * z)
  follow = null // else the follow sets goal over the tour
  $('tour').hidden = false
}
function stopTour() {
  tour = goal = zoomTo = null // the camera stays where it is
  $('tour').hidden = true
}
for (const type of ['pointerdown', 'wheel', 'keydown']) {
  window.addEventListener(type, () => { input = performance.now() / 1000; if (tour) stopTour() }, { capture: true, passive: true })
}

// ---- side panel ----
let selected = null, target = null // target: the pane the focus button focuses
function open(id) {
  selected = id
  follow = null // a walker click sets it again after open()
  $('result').textContent = ''
  $('chatResult').textContent = ''
  $('msg').value = '' // a half-typed message never goes to another desk
  $('replyMsg').value = ''
  $('chat').close()
  clearInterval(timer)
  timer = null
  msgs = []
  msgKey = ''
  $('panel').hidden = false
  fill()
  renderMessages()
  if (!DEMO) { // loadMessages() skips a desk with no transcript
    loadMessages()
    timer = setInterval(loadMessages, 2000) // one timer: open() clears the old one
  }
}
const close = () => {
  follow = null
  clearInterval(timer)
  timer = null
  $('chat').close()
  $('panel').hidden = true
}

// ---- last reply and the chat window: the messages come from GET /messages (transcript text: untrusted, textContent only) ----
let timer = null, msgs = [], msgKey = ''
const CHAT = new Set(['claude', 'codex']) // the agent kinds with a transcript reader in the bridge
const hasChat = () => CHAT.has(office.desks.find((x) => x.id === selected)?.agent?.kind)
const atBottom = (e) => e.scrollHeight - e.scrollTop - e.clientHeight < 8
function renderMessages(err) {
  const d = office.desks.find((x) => x.id === selected)
  const last = DEMO ? 'no messages in the demo' : err ?? msgs.findLast((m) => m.role === 'agent')?.text ?? '...'
  if ($('lastText').textContent !== last) $('lastText').textContent = last // a write only on a change
  const key = JSON.stringify(msgs)
  if (key === msgKey) return
  msgKey = key
  const log = $('chatLog'), stick = atBottom(log)
  const name = d?.agent ? who(d) : 'agent'
  log.replaceChildren(...msgs.map((m) => {
    const e = document.createElement('div')
    e.className = `msg ${m.role}`
    e.append(el('div', m.role === 'user' ? 'you' : m.role === 'subagent' ? `subagent · ${m.from}` : name), el('div', m.text))
    e.firstChild.className = 'role'
    e.lastChild.className = 'body'
    return e
  }))
  if (stick) log.scrollTop = log.scrollHeight
}
async function loadMessages() {
  const id = selected
  if (DEMO || !hasChat()) return
  let list, err
  try {
    const r = await fetch(`/messages?pane=${encodeURIComponent(id)}`, { headers: { 'x-office-token': TOKEN } })
    const j = await r.json()
    if (r.ok) list = j.messages
    else err = j.error
  } catch (e) {
    err = e.message
  }
  if (id !== selected || $('panel').hidden) return
  if (!err) msgs = list // an error keeps the messages and the log, and shows the error only
  renderMessages(err)
}
$('chatOpen').onclick = () => {
  const d = office.desks.find((x) => x.id === selected)
  $('chatWho').textContent = d?.agent ? who(d) : 'agent'
  $('chat').showModal()
  renderMessages()
  $('chatLog').scrollTop = $('chatLog').scrollHeight
  $('replyMsg').focus()
}
$('chatClose').onclick = () => $('chat').close()

function fill() {
  const d = office.desks.find((x) => x.id === selected), s = office.subagents.find((x) => x.id === selected)
  if (!d && !s) return close()
  const o = s && office.desks.find((x) => x.id === s.deskId) // a subagent has no pane: the button focuses its orchestrator
  target = s ? o?.id : d.id
  $('focus').textContent = s ? 'Focus orchestrator' : 'Focus in herdr'
  $('focus').disabled = DEMO || !target
  $('say').hidden = !d?.agent // only an agent desk takes a message: never a subagent or a shell
  for (const c of [...$('say').elements, ...$('reply').elements]) c.disabled = DEMO
  $('last').hidden = !CHAT.has(d?.agent?.kind) // only a claude or codex desk has a transcript
  if ($('last').hidden) $('chat').close() // the agent exited
  if (DEMO) $('lastText').textContent = 'no messages in the demo'
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
addEventListener('keydown', (e) => e.key === 'Escape' && !$('chat').open && !$('update').open && close()) // with a dialog open, Esc closes only the dialog
// POST one action to the bridge and show the outcome. Returns true on success.
async function act(body, done, out = $('result')) {
  out.textContent = '...'
  try {
    const r = await fetch('/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-office-token': TOKEN },
      body: JSON.stringify(body),
    })
    out.textContent = r.ok ? done : `error: ${(await r.json()).error}`
    return r.ok
  } catch (e) {
    out.textContent = `error: ${e.message}`
    return false
  }
}
$('focus').onclick = () => act({ type: 'focus', pane_id: target }, `ok: herdr focused ${target}`)
$('say').onsubmit = async (e) => {
  e.preventDefault()
  const text = $('msg').value
  if (!text.trim()) return
  if (await act({ type: 'prompt', pane_id: target, text }, `ok: sent to ${target}`) && $('msg').value === text) $('msg').value = ''
}

$('reply').onsubmit = async (e) => {
  e.preventDefault()
  const text = $('replyMsg').value
  if (!text.trim()) return
  if (await act({ type: 'prompt', pane_id: target, text }, `ok: sent to ${target}`, $('chatResult')) && $('replyMsg').value === text) $('replyMsg').value = ''
  loadMessages()
}

// Click (not drag) on a desk or a worker opens the panel. The desks are merged meshes, so test the ray against a box per desk,
// per meeting seat (the worker sits 0.4 behind the seat origin), and per worker on a trip (at its body, 1.7 high at most).
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), pick = new THREE.Box3(), hit = new THREE.Vector3(), hip = new THREE.Vector3()
let down = [0, 0]
renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; goal = follow = zoomTo = null })
renderer.domElement.addEventListener('wheel', () => { zoomTo = null }) // the glide never fights the user's zoom
renderer.domElement.addEventListener('click', (e) => {
  if (!office || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return
  ray.setFromCamera(ndc.set((e.clientX / innerWidth) * 2 - 1, (-e.clientY / innerHeight) * 2 + 1), camera)
  const sq = (id, x, z) => [id, x - 0.45, z - 0.45, x + 0.45, z + 0.45]
  const seated = (id, s) => sq(id, s.x + 0.4 * Math.sin((s.rot * Math.PI) / 2), s.z + 0.4 * Math.cos((s.rot * Math.PI) / 2))
  let best = null, near = Infinity, walker = false
  for (const [id, x0, z0, x1, z1, walks = false, y0 = 0, y1 = 1.8] of [
    ...office.desks.map((d) => [d.id, d.x - 1, d.z - 0.8, d.x + 1, d.z + 0.9]),
    ...office.desks.filter((d) => d.away).map((d) => seated(d.id, d.away)),
    ...office.subagents.map((s) => seated(s.id, s)),
    ...[...views].filter(([, v]) => v.worker?.out).map(([id, v]) => (v.worker.g.getWorldPosition(hip), [...sq(id, hip.x, hip.z), true])), // pose() sets out for each worker on a trip
    ...spooks.map((sp) => { const { x, y, z } = sp.g.position; return [sp, x - 0.28, z - 0.28, x + 0.28, z + 0.28, false, y, y + 1.2] }), // a ghost: its sheet, from its base
  ]) {
    pick.min.set(x0, y0, z0)
    pick.max.set(x1, y1, z1)
    const t = ray.ray.intersectBox(pick, hit) && hit.distanceTo(ray.ray.origin)
    if (t !== null && t < near) { near = t; best = id; walker = walks }
  }
  if (best?.boo) { best.until = performance.now() / 1000 + 2; return } // a ghost: the balloon for 2 s (haunt() shows it), no panel
  if (best) open(best)
  if (walker) { follow = best; zoomTo = Math.min(controls.maxZoom, camera.zoom * 1.5) } // after open(): it clears follow
})

let last = 0 // the time of the last frame
renderer.setAnimationLoop((ms) => {
  const t = ms / 1000
  if (follow) { // on a trip or seated again: the camera stays on the worker
    const w = views.get(follow)?.worker
    if (w) goal = w.g.getWorldPosition(tracked).setY(0)
    else follow = null // the agent exited
  }
  if (tour && !online) stopTour()
  else if (office && online && t - input > TOUR && (!tour || t >= tour.next)) tourStep(t)
  if (tour) goal = tour.at // each frame: a keepInView() clamp clears goal at a low zoom, so the glide goes on
  if (goal) {
    controls.target.lerp(goal, 0.15)
    if (controls.target.distanceTo(goal) < 0.01) goal = null
    camera.position.copy(controls.target).add(OFFSET)
  }
  if (zoomTo !== null) {
    camera.zoom += (zoomTo - camera.zoom) * 0.15
    if (Math.abs(zoomTo - camera.zoom) < 0.01) zoomTo = null
    camera.updateProjectionMatrix()
  }
  controls.update()
  if (office) keepInView()
  labels.domElement.style.fontSize = `${Math.min(13, Math.max(8, 3 + camera.zoom * 4))}px` // labels shrink with the rooms
  moving = false
  dancing = false
  if (bubble) bubble.visible = false // stroll() shows it again for a talker
  ajar.clear()
  for (const v of views.values()) if (v.desk) pose(v, t)
  if (office) disco(t)
  if (office) rally(t)
  snowfall(t)
  candles(t)
  haunt(t)
  bulbLights(t)
  lightning(t)
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
    offerUpdate(m.update)
    if (m.snapshot) update(buildOffice(m.snapshot, m.meetings, office))
  }
  // A restarted bridge has a new token. Reload when the stream comes back, so the page gets it.
  es.onerror = () => { setOnline(false, 'offline — bridge not reachable'); es.onopen = () => location.reload() }
}

// The season can change at midnight, and the live stream may send nothing for a while. Check the date and the clock light each minute (INTENT.md decision 31).
setInterval(() => office && update(office), 60e3)
