import * as THREE from 'three'

// ---- voxel helpers: one shared unit cube, y is the bottom of the box ----
const CUBE = new THREE.BoxGeometry()
const MATS = new Map() // color -> one shared material. Marked userData.shared: do not dispose.
const shared = (color) => {
  const k = new THREE.Color(color).getHexString()
  if (!MATS.has(k)) MATS.set(k, Object.assign(new THREE.MeshLambertMaterial({ color }), { userData: { shared: true } }))
  return MATS.get(k)
}
// color may be a color or a material instance (for meshes whose color changes in place).
export function box(parent, [w, h, d], [x, y, z], color) {
  const m = new THREE.Mesh(CUBE, color instanceof THREE.Material ? color : shared(color))
  m.scale.set(w, h, d)
  m.position.set(x, y + h / 2, z)
  parent.add(m)
  return m
}

// ---- palette ----
export const WOOD = '#b5835a', WOOD_D = '#8f6243', CREAM = '#efe4cf'
const WHITE = '#f4f1ea', DARK = '#3b3a40', GREY = '#9a9ca0', TEAL = '#5f8a8b'
const GREENS = ['#4f7a3a', '#6b9a48', '#8dbb5a'], POTS = ['#c0673f', '#5b5f66']
const BOOKS = ['#b0503f', '#4f6f8f', '#c9a24a', '#5f8a5b', '#8a6a86', '#d8cfb8']
const RUGS = [['#7c5d4a', '#a8826a'], ['#55706b', '#7b968f'], ['#6c6788', '#8f8aa8'], ['#8f7340', '#b2955e']]
const E = 0.2 // a prop's back against a wall sits this far from the room edge
export const LAMP = [-0.5, 0.4] // the pod lamp post, from the pod corner

// A group at x, z, turned rot quarter turns. A prop's front faces +z before the turn (rot 1: +x, 2: -z, 3: -x).
function at(g, x, z, rot = 0) {
  const o = new THREE.Group()
  o.position.set(x, 0, z)
  o.rotation.y = (rot * Math.PI) / 2
  g.add(o)
  return o
}
// A prop from data: [[w, h, d], [x, y, z], color] per box.
const prop = (parts) => (g, x, z, rot) => {
  const o = at(g, x, z, rot)
  for (const p of parts) box(o, ...p)
}

const chair = prop([
  [[0.46, 0.08, 0.46], [0, 0.42, 0], WOOD], [[0.46, 0.46, 0.08], [0, 0.5, -0.19], WOOD],
  ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [[0.08, 0.42, 0.08], [a * 0.18, 0, b * 0.18], WOOD_D]),
])
export const seat = (c) => prop([
  [[0.12, 0.06, 0.56], [0, 0, 0], DARK], [[0.56, 0.06, 0.12], [0, 0, 0], DARK], [[0.08, 0.36, 0.08], [0, 0.06, 0], DARK],
  [[0.5, 0.1, 0.5], [0, 0.42, 0], c], [[0.5, 0.56, 0.1], [0, 0.52, -0.22], c],
])
const officeChair = seat(TEAL), meetingChair = seat('#b06a4f')
const shelf = prop([
  [[1.4, 1.8, 0.4], [0, 0, 0], WOOD_D],
  ...[0.12, 0.68, 1.24].flatMap((y, i) => [
    [[0.6, 0.44, 0.36], [-0.33, y, 0.03], BOOKS[i]], [[0.55, 0.36, 0.36], [0.33, y, 0.03], BOOKS[i + 3]],
  ]),
])
// No glowing lamps: a light cube on a pole would read as a status lamp.
const printer = prop([
  [[0.8, 0.75, 0.6], [0, 0, 0.3], '#d4d2cc'], [[0.8, 0.2, 0.6], [0, 0.75, 0.3], '#a9aaa8'],
  [[0.4, 0.04, 0.3], [-0.1, 0.95, 0.3], WHITE], [[0.2, 0.06, 0.12], [0.25, 0.95, 0.5], DARK],
])
// A whiteboard on a stand, so it works in front of glass walls too.
const board = (w) => prop([
  ...[-1, 1].flatMap((s) => [[[0.08, 2, 0.08], [s * (w / 2 + 0.04), 0, 0.3], GREY], [[0.08, 0.06, 0.6], [s * (w / 2 + 0.04), 0, 0.3], DARK]]),
  [[w, 1.1, 0.06], [0, 0.9, 0.3], GREY], [[w - 0.12, 0.98, 0.02], [0, 0.96, 0.34], WHITE],
  [[w * 0.4, 0.06, 0.02], [-w * 0.2, 1.67, 0.36], '#c0504a'], [[w * 0.5, 0.06, 0.02], [-w * 0.12, 1.45, 0.36], '#4a6fa8'],
  [[w * 0.3, 0.06, 0.02], [w * 0.15, 1.21, 0.36], DARK], [[w * 0.6, 0.04, 0.12], [0, 0.9, 0.36], GREY],
])
// A TV on a low cabinet.
const tv = prop([
  [[1.8, 0.55, 0.45], [0, 0, 0.23], WOOD_D], [[0.12, 0.2, 0.1], [0, 0.55, 0.2], DARK],
  [[1.6, 0.95, 0.08], [0, 0.75, 0.2], '#1e1e2e'], [[1.48, 0.83, 0.02], [0, 0.81, 0.25], '#34507a'],
])
const fridge = prop([
  [[0.8, 1.9, 0.7], [0, 0, 0.35], '#dfe6e6'], [[0.82, 0.04, 0.72], [0, 1.25, 0.35], GREY],
  [[0.06, 0.4, 0.06], [0.3, 1.38, 0.72], GREY], [[0.06, 0.6, 0.06], [0.3, 0.5, 0.72], GREY],
])
const cooler = prop([[[0.4, 1, 0.4], [0, 0, 0.2], WHITE], [[0.12, 0.08, 0.06], [0, 0.72, 0.42], '#4a6fa8'], [[0.3, 0.45, 0.3], [0, 1, 0.2], '#9fc9e6']])
const sofa = prop([
  [[1.9, 0.1, 0.7], [0, 0, 0.42], DARK], [[2, 0.35, 0.8], [0, 0.1, 0.42], TEAL], [[2, 0.5, 0.22], [0, 0.45, 0.13], TEAL],
  [[0.22, 0.3, 0.8], [-0.89, 0.45, 0.42], TEAL], [[0.22, 0.3, 0.8], [0.89, 0.45, 0.42], TEAL],
  [[0.76, 0.1, 0.56], [-0.39, 0.45, 0.5], '#7ea5a5'], [[0.76, 0.1, 0.56], [0.39, 0.45, 0.5], '#7ea5a5'],
])
const coffeeTable = prop([
  [[1.1, 0.06, 0.6], [0, 0.4, 0], WOOD], [[0.08, 0.4, 0.5], [-0.46, 0, 0], WOOD_D], [[0.08, 0.4, 0.5], [0.46, 0, 0], WOOD_D],
  [[0.3, 0.04, 0.22], [-0.2, 0.46, 0], '#b0503f'], [[0.12, 0.12, 0.12], [0.25, 0.46, 0.05], WHITE],
])

// Three plant kinds: a bush, a small tree, a snake plant. [size, pos, green index offset, or -1 for the trunk]
const PLANTS = [
  [[[0.56, 0.45, 0.56], [0, 0.38, 0], 0], [[0.38, 0.35, 0.38], [0.07, 0.83, -0.05], 1], [[0.22, 0.25, 0.22], [-0.1, 1.15, 0.07], 2]],
  [[[0.1, 0.6, 0.1], [0, 0.38, 0], -1], [[0.62, 0.45, 0.62], [0, 0.85, 0], 0], [[0.4, 0.3, 0.4], [0.06, 1.3, 0.04], 1]],
  [[[0.14, 0.8, 0.14], [-0.08, 0.38, 0.07], 0], [[0.14, 1, 0.14], [0.08, 0.38, -0.07], 1], [[0.14, 0.65, 0.14], [0.1, 0.38, 0.11], 2], [[0.14, 0.7, 0.14], [-0.11, 0.38, -0.1], 0]],
]
export function plant(g, x, z, s = 1) {
  const k = Math.abs(Math.round(x * 7 + z * 13)), o = at(g, x, z)
  o.scale.setScalar(s)
  box(o, [0.4, 0.38, 0.4], [0, 0, 0], POTS[k % 2])
  for (const [size, pos, i] of PLANTS[k % 3]) box(o, size, pos, i < 0 ? WOOD_D : GREENS[(k + i) % 3])
}
const bigPlant = (g, x, z) => plant(g, x, z, 1.2)
// Big plants on the first n free spots.
function plants(put, spots, n) {
  for (const [x, z] of spots) if (n > 0 && put(bigPlant, x, z)) n--
}

// Places props on free floor only: inside the walls, clear of the pods (and their lamp posts), the 2 x 2 area
// inside the door, the walk rects of the room (where idle workers walk), the keep-out rects, and what is placed already.
// Room-local coords. Returns true when the prop fits.
// ponytail: greedy first fit over a few candidate spots. A prop that fits none is skipped.
function placer(g, room, ...keep) {
  const dx = room.door.x - room.x, dz = room.door.side === 'north' ? 0 : room.d - 2
  const taken = [[dx - 1, dz, dx + 1, dz + 2], ...keep, ...(room.walk ?? []).map(([a, b, c, d]) => [a - room.x, b - room.z, c - room.x, d - room.z])]
  for (const p of room.pods) {
    const x = p.x - room.x, z = p.z - room.z, lx = x + LAMP[0], lz = z + LAMP[1]
    taken.push([x - 0.3, z - 0.3, x + p.w + 0.3, z + p.d + 0.3], [lx - 0.15, lz - 0.15, lx + 0.15, lz + 0.15])
  }
  return (make, x, z, rot = 0) => {
    const t = new THREE.Group()
    make(t, x, z, rot)
    const b = new THREE.Box3().setFromObject(t), r = [b.min.x, b.min.z, b.max.x, b.max.z]
    const m = E - 0.01
    // written as !(a >= m ...), so a NaN position fails too
    if (!(r[0] >= m && r[1] >= m && r[2] <= room.w - m && r[3] <= room.d - m)) return false
    if (taken.some((q) => r[0] < q[2] && q[0] < r[2] && r[1] < q[3] && q[1] < r[3])) return false
    taken.push(r)
    g.add(...t.children)
    return true
  }
}
const corners = ({ w, d }) => [[0.75, 0.75], [w - 0.75, 0.75], [0.75, d - 0.75], [w - 0.75, d - 0.75]]

const lounge = (g, x, z, rot) => {
  const o = at(g, x, z, rot)
  sofa(o, 0, 0)
  coffeeTable(o, 0, 1.45)
}

export function workspaceDecor(g, room) {
  const put = placer(g, room), n = room.number, { w, d } = room
  room.pods.forEach((p, i) => {
    const [c1, c2] = RUGS[(n + i) % RUGS.length], x = p.x - room.x + p.w / 2, z = p.z - room.z + p.d / 2
    box(g, [p.w + 0.5, 0.02, p.d + 0.5], [x, 0, z], c1)
    box(g, [p.w + 0.1, 0.03, p.d + 0.1], [x, 0, z], c2)
  })
  // The back walls the camera sees are north and west. The bookshelf takes the north wall unless the door is there.
  if (room.door.side === 'south') put(shelf, w / 2, E + 0.2)
  else [d / 2, d / 3, (2 * d) / 3].some((z) => put(shelf, E + 0.2, z, 1))
  const extra = n % 2 ? board(1.6) : printer
  ;[[E, d / 2, 1], [w / 4, E, 0], [(3 * w) / 4, E, 0]].some(([x, z, r]) => put(extra, x, z, r))
  ;[[(3 * w) / 4, E, 0], [w / 4, E, 0], [E, d / 2, 1]].some(([x, z, r]) => put(lounge, x, z, r)) // fits only a stretched room
  // A big room gets a café table or a lounge for each 35 m² over 60, so it does not read as an empty hall.
  for (let i = Math.floor((w * d - 60) / 35); i > 0; i--) {
    ;[[w / 4, d / 2], [(3 * w) / 4, d / 2], [w / 8, d / 2], [(7 * w) / 8, d / 2]].some(([x, z]) => put(i % 2 ? cafe : lounge, x, z))
  }
  plants(put, corners(room), w * d > 100 ? 4 : 2)
}

const counter = (L) => (g, x, z, rot) => {
  const o = at(g, x, z, rot)
  box(o, [L - 0.1, 0.1, 0.5], [0, 0, 0.3], DARK)
  box(o, [L, 0.78, 0.6], [0, 0.1, 0.3], CREAM)
  box(o, [L, 0.06, 0.66], [0, 0.88, 0.33], WOOD)
  box(o, [L, 1.16, 0.05], [0, 0.94, 0.025], '#d9c6a5') // tiled back wall, then the wall cabinets on it
  box(o, [L, 0.5, 0.36], [0, 1.6, 0.23], CREAM)
  // coffee machine with a cup, then the sink with its tap
  box(o, [0.4, 0.5, 0.36], [-L / 2 + 0.35, 0.94, 0.25], DARK)
  box(o, [0.24, 0.14, 0.2], [-L / 2 + 0.35, 1.44, 0.2], '#6b4a35')
  box(o, [0.12, 0.12, 0.12], [-L / 2 + 0.35, 0.94, 0.5], WHITE)
  box(o, [0.6, 0.02, 0.42], [L / 2 - 0.6, 0.94, 0.36], GREY)
  box(o, [0.07, 0.3, 0.07], [L / 2 - 0.6, 0.94, 0.12], GREY)
  box(o, [0.07, 0.07, 0.2], [L / 2 - 0.6, 1.17, 0.22], GREY)
}
// A small round table (two crossed tops) with three chairs.
const cafeTable = prop([
  [[0.9, 0.06, 0.6], [0, 0.72, 0], WOOD], [[0.6, 0.06, 0.9], [0, 0.72, 0], WOOD],
  [[0.12, 0.72, 0.12], [0, 0, 0], WOOD_D], [[0.5, 0.04, 0.5], [0, 0, 0], WOOD_D],
])
const cafe = (g, x, z) => {
  cafeTable(g, x, z)
  chair(g, x - 0.8, z, 1)
  chair(g, x + 0.8, z, 3)
  chair(g, x, z + 0.8, 2)
}

export function kitchen(g, room) {
  const put = placer(g, room), { w, d } = room, { len: L } = room.counter // the model sets the counter, the spots and the walk rects
  put(counter(L), room.counter.x - room.x, room.counter.z - room.z)
  const fx = [E + L + 0.5, w / 2 + 1.5, w - E - 0.45].find((x) => put(fridge, x, E))
  ;[[fx + 0.7, E, 0], [E, 1.6, 1], [E, d - 1.2, 1]].some(([x, z, r]) => put(cooler, x, z, r))
  // The walk rects can block a table. Then the other spots try, so the kitchen keeps one table.
  if (![w / 3, (2 * w) / 3].filter((x) => put(cafe, x, d / 2 + 0.3)).length) [w / 4, (3 * w) / 4, w / 2].some((x) => put(cafe, x, d / 2 + 0.3))
  const [nw, , sw, se] = corners(room)
  plants(put, [sw, nw, se], 1)
}

// The long table and a chair behind each seat, from the model: room.table and room.seats, in world coords.
// A seat faces the table, so its chair sits like a desk chair: 0.5 behind the seat, the back away from the table.
const longTable = (room) => (g) => {
  const { x, z, len: L } = room.table, o = at(g, x - room.x, z - room.z)
  box(o, [L, 0.08, 1.2], [0, 0.72, 0], WOOD)
  for (const s of [-1, 1]) box(o, [0.12, 0.72, 0.8], [s * (L / 2 - 0.35), 0, 0], WOOD_D)
  box(o, [0.3, 0.04, 0.3], [0, 0.8, 0], DARK) // conference phone
  for (const s of room.seats) {
    meetingChair(at(g, s.x - room.x, s.z - room.z, s.rot), 0, 0.5, 2)
    if (!room.session && s.rot === 0) box(o, [0.3, 0.01, 0.4], [s.x - x + 0.1, 0.8, 0.3], WHITE) // papers, while no meeting brings laptops
  }
}

export function meeting(g, room) {
  const put = placer(g, room), { w } = room
  put(longTable(room))
  // The head of the table is at the west wall, so the whiteboard and the TV share the north wall, clear of a door there.
  put(board(1.6), w / 4, E)
  put(tv, (3 * w) / 4, E)
  const [nw, ne, sw] = corners(room)
  plants(put, [ne, sw, nw], 2)
}

// "herdr" in a 3 x 7 pixel font: [x, y, w, h] per bar, y up from the baseline.
const GLYPH = {
  h: [[0, 0, 1, 7], [1, 4, 1, 1], [2, 0, 1, 4]],
  e: [[0, 0, 1, 5], [1, 4, 2, 1], [2, 2, 1, 2], [1, 2, 1, 1], [1, 0, 2, 1]],
  r: [[0, 0, 1, 5], [1, 4, 1, 1], [2, 3, 1, 1]],
  d: [[2, 0, 1, 7], [0, 1, 1, 3], [1, 0, 1, 1], [1, 4, 1, 1]],
}
const logo = (g, x, z, rot) => {
  const o = at(g, x, z, rot), P = 0.1
  box(o, [2.3, 2.3, 0.1], [0, 0, 0.05], '#5a3d2b') // a wood feature wall from the floor up
  ;[...'herdr'].forEach((c, i) => {
    for (const [bx, by, bw, bh] of GLYPH[c]) box(o, [bw * P, bh * P, 0.03], [(i * 4 + bx + bw / 2 - 9.5) * P, 1.35 + by * P, 0.11], CREAM)
  })
}
const reception = (g, x, z, rot) => {
  const o = at(g, x, z, rot)
  box(o, [2.4, 0.06, 0.7], [0, 0.74, 0], WOOD)
  box(o, [2.5, 1.1, 0.14], [0, 0, 0.35], WOOD_D) // high front panel toward the visitors
  box(o, [2.5, 0.05, 0.36], [0, 1.1, 0.3], CREAM)
  for (const s of [-1, 1]) box(o, [0.1, 0.74, 0.6], [s * 1.15, 0, -0.02], WOOD_D)
  box(o, [0.1, 0.2, 0.1], [0.3, 0.8, 0.05], DARK)
  box(o, [0.7, 0.42, 0.06], [0.3, 0.95, 0.05], DARK) // monitor, screen toward the chair
  box(o, [0.62, 0.34, 0.02], [0.3, 0.99, 0.01], '#5b7a99')
  officeChair(o, 0.3, -0.75, 0)
}
const waiting = (g, x, z, rot) => {
  const o = at(g, x, z, rot)
  logo(o, 0, 0)
  lounge(o, 0, 0.12)
}

// The building entrance is in the middle of the lobby's south wall. The reception faces it.
export function lobby(g, room) {
  const { w, d } = room, put = placer(g, room, [w / 2 - 1, d - 2, w / 2 + 1, d])
  put(reception, w / 2 + 0.6, d - 3.2, 0)
  ;[d / 2 + 0.4, d / 2, d - 1.6].some((z) => put(waiting, E, z, 1))
  plants(put, corners(room), 2)
}

// ---- desk clutter: desk-local coords, desk top at y 0.8, free ends at x +-0.55..0.9 ----
const CLUTTER = [
  (o, s) => box(o, [0.13, 0.15, 0.13], [s * 0.72, 0.8, -0.12], s < 0 ? '#c0504a' : '#4a6fa8'), // mug
  (o, s) => (box(o, [0.3, 0.06, 0.38], [s * 0.7, 0.8, -0.4], WHITE).rotation.y = s * 0.2), // paper stack
  (o, s) => {
    box(o, [0.2, 0.04, 0.2], [s * 0.75, 0.8, -0.55], DARK)
    box(o, [0.06, 0.45, 0.06], [s * 0.75, 0.84, -0.55], DARK)
    box(o, [0.26, 0.1, 0.18], [s * 0.68, 1.22, -0.45], '#3f6b4a') // a green banker's lamp shade
  },
  (o, s) => {
    box(o, [0.3, 0.1, 0.24], [s * 0.72, 0.8, -0.45], BOOKS[(s + 1) / 2])
    box(o, [0.26, 0.08, 0.2], [s * 0.72, 0.9, -0.45], BOOKS[3])
  },
  (o, s) => {
    box(o, [0.16, 0.14, 0.16], [s * 0.74, 0.8, -0.5], POTS[0])
    box(o, [0.2, 0.16, 0.2], [s * 0.74, 0.94, -0.5], GREENS[1])
  },
  () => {},
]
export function clutter(g, seed) {
  const a = seed % 6, b = (a + 1 + (Math.floor(seed / 6) % 5)) % 6 // two different items, from the seed only
  CLUTTER[a](g, -1)
  CLUTTER[b](g, 1)
}
