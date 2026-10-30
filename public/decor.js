import * as THREE from 'three'
import { hash, rng } from './model.js'

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
export const SNOW = '#eef3f8' // snow on the ground and on the caps. office.js uses it for the terrace grass and the hedge cap.
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
// A whiteboard on a stand, so it works in front of glass walls too. board16 is one maker, so put() counts it as one kind.
const board = (w) => prop([
  ...[-1, 1].flatMap((s) => [[[0.08, 2, 0.08], [s * (w / 2 + 0.04), 0, 0.3], GREY], [[0.08, 0.06, 0.6], [s * (w / 2 + 0.04), 0, 0.3], DARK]]),
  [[w, 1.1, 0.06], [0, 0.9, 0.3], GREY], [[w - 0.12, 0.98, 0.02], [0, 0.96, 0.34], WHITE],
  [[w * 0.4, 0.06, 0.02], [-w * 0.2, 1.67, 0.36], '#c0504a'], [[w * 0.5, 0.06, 0.02], [-w * 0.12, 1.45, 0.36], '#4a6fa8'],
  [[w * 0.3, 0.06, 0.02], [w * 0.15, 1.21, 0.36], DARK], [[w * 0.6, 0.04, 0.12], [0, 0.9, 0.36], GREY],
])
const board16 = board(1.6)
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

// ---- fill props for furnish(). A wall prop has its back at local z 0. The other props are centered. ----
const legs = (x, z, h, c) => [-1, 1].flatMap((a) => [-1, 1].map((b) => [[0.07, h, 0.07], [a * x, 0, b * z], c]))
const armchair = prop([
  [[0.8, 0.12, 0.76], [0, 0, 0], DARK], [[0.76, 0.3, 0.72], [0, 0.12, 0], '#b06a4f'], [[0.76, 0.42, 0.18], [0, 0.42, -0.27], '#b06a4f'],
  [[0.14, 0.2, 0.72], [-0.31, 0.42, 0], '#b06a4f'], [[0.14, 0.2, 0.72], [0.31, 0.42, 0], '#b06a4f'], [[0.48, 0.08, 0.5], [0, 0.42, 0.08], CREAM],
])
const sideTable = prop([
  [[0.5, 0.05, 0.5], [0, 0.5, 0], WOOD], ...legs(0.2, 0.2, 0.5, WOOD_D),
  [[0.3, 0.06, 0.22], [0, 0.55, 0], BOOKS[1]], [[0.26, 0.05, 0.2], [0.02, 0.61, 0.01], BOOKS[2]], [[0.1, 0.1, 0.1], [0.14, 0.55, -0.15], WHITE],
])
// A reading nook: two armchairs face each other over a side table, on a rug.
const nook = (g, x, z, rot) => {
  const o = at(g, x, z, rot)
  box(o, [2.5, 0.02, 1.3], [0, 0, 0], RUGS[0][1])
  armchair(o, -0.8, 0, 1)
  armchair(o, 0.8, 0, 3)
  sideTable(o, 0, 0)
}
const stool = prop([
  [[0.36, 0.06, 0.36], [0, 0.72, 0], WOOD], [[0.06, 0.72, 0.06], [0, 0, 0], DARK], [[0.32, 0.04, 0.32], [0, 0, 0], DARK], [[0.26, 0.03, 0.03], [0, 0.3, 0.06], DARK],
])
// A standing high table with three stools.
const highTable = (g, x, z, rot) => {
  const o = at(g, x, z, rot)
  box(o, [0.9, 0.06, 0.9], [0, 1.02, 0], WOOD)
  box(o, [0.1, 1.02, 0.1], [0, 0, 0], DARK)
  box(o, [0.5, 0.04, 0.5], [0, 0, 0], DARK)
  for (const [a, b] of [[-0.75, 0], [0.75, 0], [0, 0.75]]) stool(o, a, b)
}
// A long planter box with bushes: a room divider.
const planter = prop([
  [[2.4, 0.5, 0.5], [0, 0, 0], WOOD_D], [[2.3, 0.03, 0.4], [0, 0.5, 0], '#6b4a35'],
  ...[-0.85, -0.28, 0.28, 0.85].flatMap((x, i) => [
    [[0.5, 0.3 + (i % 2) * 0.2, 0.42], [x, 0.5, 0], GREENS[i % 3]], [[0.3, 0.2, 0.3], [x + 0.04, 0.8 + (i % 2) * 0.2, -0.02], GREENS[(i + 1) % 3]],
  ]),
])
// A low open bookcase with books on both sides: a room divider.
const lowShelf = prop([
  [[1.6, 0.06, 0.5], [0, 0, 0], WOOD_D], [[1.6, 0.05, 0.5], [0, 0.45, 0], WOOD_D], [[1.6, 0.05, 0.5], [0, 0.9, 0], WOOD],
  ...[-0.78, 0, 0.78].map((x) => [[0.05, 0.9, 0.5], [x, 0, 0], WOOD_D]),
  ...[0.06, 0.5].flatMap((y, r) => [[-0.4, 0.12], [0.4, 0.12], [-0.4, -0.12], [0.4, -0.12]].map(([x, z], i) => [[0.6, 0.3 + ((r + i) % 2) * 0.06, 0.2], [x, y, z], BOOKS[(r + i * 2) % 6]])),
  [[0.2, 0.18, 0.2], [-0.5, 0.95, 0], POTS[0]], [[0.3, 0.26, 0.3], [-0.5, 1.13, 0], GREENS[0]],
])
// A ping-pong table: a blue top with white lines, the net across the middle, and two paddles.
const pingPong = prop([
  ...legs(0.9, 0.45, 0.72, DARK),
  [[2.2, 0.05, 1.2], [0, 0.72, 0], '#34507a'], ...[-0.585, 0, 0.585].map((z) => [[2.2, 0.01, 0.03], [0, 0.77, z], WHITE]),
  ...[-1.085, 1.085].map((x) => [[0.03, 0.01, 1.2], [x, 0.77, 0], WHITE]),
  [[0.03, 0.15, 1.3], [0, 0.77, 0], DARK], [[0.16, 0.02, 0.26], [-0.6, 0.77, 0.3], '#b06a4f'], [[0.16, 0.02, 0.26], [0.7, 0.77, -0.25], '#b06a4f'],
])
// A foosball table: eight rods across the field, with small players in two team colors.
const foosball = prop([
  ...legs(0.5, 0.26, 0.62, WOOD_D),
  [[1.2, 0.26, 0.7], [0, 0.62, 0], WOOD_D], [[1.08, 0.02, 0.58], [0, 0.88, 0], '#3f6b4a'],
  [[1.2, 0.08, 0.06], [0, 0.88, -0.32], WOOD], [[1.2, 0.08, 0.06], [0, 0.88, 0.32], WOOD],
  ...[-0.42, -0.3, -0.18, -0.06, 0.06, 0.18, 0.3, 0.42].flatMap((x, i) => [
    [[0.03, 0.03, 1.0], [x, 0.94, 0], GREY], ...[-0.15, 0.15].map((z) => [[0.05, 0.1, 0.06], [x, 0.9, z], i % 2 ? '#4a6fa8' : '#b06a4f']),
  ]),
])
// A bean bag with a raised back. The position sets the color, as it sets the plant kind.
const BAGS = ['#7c5d4a', '#34507a', '#8f7340']
const beanBag = (g, x, z, rot) => {
  const o = at(g, x, z, rot), c = BAGS[Math.abs(Math.round(x * 7 + z * 13)) % 3]
  box(o, [0.8, 0.28, 0.8], [0, 0, 0], c)
  box(o, [0.7, 0.3, 0.32], [0, 0.28, -0.22], c)
}
// A coat rack with two coats.
const coatRack = prop([
  [[0.5, 0.04, 0.08], [0, 0, 0], WOOD_D], [[0.08, 0.04, 0.5], [0, 0, 0], WOOD_D], [[0.07, 1.75, 0.07], [0, 0, 0], WOOD_D],
  [[0.44, 0.04, 0.04], [0, 1.6, 0], WOOD_D], [[0.04, 0.04, 0.44], [0, 1.6, 0], WOOD_D],
  [[0.36, 0.72, 0.14], [0.06, 0.86, 0.12], '#5a3d2b'], [[0.14, 0.62, 0.32], [-0.2, 0.96, 0], '#34507a'],
])
// A flip chart on a stand, the pad toward +z.
const flipChart = prop([
  [[0.05, 1.5, 0.05], [-0.32, 0, 0.1], GREY], [[0.05, 1.5, 0.05], [0.32, 0, 0.1], GREY], [[0.05, 1.45, 0.05], [0, 0, -0.3], GREY],
  [[0.05, 0.05, 0.4], [0, 1.4, -0.12], GREY], [[0.78, 0.06, 0.1], [0, 0.88, 0.16], GREY], [[0.76, 0.06, 0.06], [0, 1.89, 0.14], GREY],
  [[0.72, 0.95, 0.03], [0, 0.94, 0.14], WHITE], [[0.4, 0.05, 0.01], [-0.1, 1.68, 0.16], '#4a6fa8'], [[0.5, 0.04, 0.01], [0, 1.5, 0.16], DARK],
  [[0.3, 0.04, 0.01], [-0.12, 1.36, 0.16], DARK], [[0.22, 0.04, 0.01], [0.1, 1.22, 0.16], '#4a6fa8'],
])
// An upright piano with its bench (wall prop).
const piano = prop([
  [[1.5, 1.2, 0.55], [0, 0, 0.275], '#1e1e2e'], [[1.56, 0.05, 0.6], [0, 1.2, 0.3], '#1e1e2e'], [[1.4, 0.12, 0.3], [0, 0.66, 0.7], '#1e1e2e'],
  [[1.3, 0.03, 0.22], [0, 0.78, 0.72], WHITE], ...[-0.56, -0.47, -0.29, -0.2, -0.11, 0.07, 0.16, 0.34, 0.43, 0.52].map((x) => [[0.05, 0.03, 0.12], [x, 0.81, 0.66], DARK]),
  [[0.08, 0.66, 0.08], [-0.66, 0, 0.78], '#1e1e2e'], [[0.08, 0.66, 0.08], [0.66, 0, 0.78], '#1e1e2e'], [[0.44, 0.3, 0.02], [0, 0.9, 0.56], CREAM],
  [[0.9, 0.06, 0.36], [0, 0.46, 1.25], '#1e1e2e'], [[0.06, 0.46, 0.3], [-0.38, 0, 1.25], '#1e1e2e'], [[0.06, 0.46, 0.3], [0.38, 0, 1.25], '#1e1e2e'],
])
// An aquarium on a stand: dark water, with sand, weed, and fish on the front (wall prop).
const aquarium = prop([
  [[1.4, 0.75, 0.5], [0, 0, 0.25], WOOD_D], [[1.44, 0.05, 0.52], [0, 0.75, 0.26], DARK], [[1.36, 0.6, 0.44], [0, 0.8, 0.25], '#34507a'],
  [[1.44, 0.06, 0.52], [0, 1.4, 0.26], DARK], [[0.04, 0.6, 0.04], [-0.7, 0.8, 0.5], DARK], [[0.04, 0.6, 0.04], [0.7, 0.8, 0.5], DARK],
  [[1.36, 0.08, 0.02], [0, 0.8, 0.48], CREAM], [[0.06, 0.3, 0.02], [-0.45, 0.88, 0.48], GREENS[0]], [[0.06, 0.22, 0.02], [-0.37, 0.88, 0.48], GREENS[1]],
  [[0.06, 0.26, 0.02], [0.5, 0.88, 0.48], GREENS[2]], [[0.12, 0.06, 0.02], [-0.1, 1.15, 0.48], POTS[0]], [[0.1, 0.05, 0.02], [0.25, 1.02, 0.48], POTS[0]],
  [[0.08, 0.05, 0.02], [0.1, 1.25, 0.48], CREAM],
])
// Three filing cabinets with drawer handles, a plant and a file box on top (wall prop).
const cabinets = prop([
  ...[[-0.52, 4], [0, 3], [0.52, 4]].flatMap(([x, n]) => [
    [[0.5, n * 0.32 + 0.02, 0.6], [x, 0, 0.3], '#a9aaa8'], ...Array.from({ length: n }, (_, i) => [[0.2, 0.04, 0.03], [x, 0.2 + i * 0.32, 0.61], DARK]),
  ]),
  [[0.2, 0.18, 0.2], [0.52, 1.3, 0.3], POTS[1]], [[0.28, 0.24, 0.28], [0.52, 1.48, 0.3], GREENS[1]], [[0.34, 0.22, 0.26], [-0.52, 1.3, 0.3], '#d9c6a5'],
])
// A low credenza with a vase and books on top (wall prop).
const credenza = prop([
  ...[-0.82, 0.82].map((x) => [[0.06, 0.1, 0.4], [x, 0, 0.24], DARK]), [[1.8, 0.6, 0.45], [0, 0.1, 0.24], WOOD_D], [[1.86, 0.05, 0.48], [0, 0.7, 0.24], WOOD],
  ...[-0.6, 0, 0.6].map((x) => [[0.02, 0.5, 0.01], [x, 0.15, 0.47], DARK]), ...[-0.36, 0.36].map((x) => [[0.04, 0.12, 0.03], [x, 0.35, 0.48], GREY]),
  [[0.18, 0.34, 0.18], [-0.55, 0.75, 0.24], POTS[1]], [[0.06, 0.24, 0.06], [-0.55, 1.09, 0.24], GREENS[0]], [[0.26, 0.14, 0.26], [-0.55, 1.3, 0.24], GREENS[2]],
  [[0.4, 0.07, 0.28], [0.3, 0.75, 0.24], BOOKS[1]], [[0.36, 0.06, 0.26], [0.31, 0.82, 0.24], BOOKS[3]],
  ...[[0.66, 0.3, 4], [0.73, 0.27, 5], [0.8, 0.32, 0]].map(([x, h, i]) => [[0.06, h, 0.22], [x, 0.75, 0.24], BOOKS[i]]),
])
// A row of four lockers with vents and handles (wall prop).
const lockers = prop([
  [[1.9, 0.08, 0.46], [0, 0, 0.25], DARK], [[1.9, 1.8, 0.5], [0, 0.08, 0.25], '#34507a'], ...[-0.475, 0, 0.475].map((x) => [[0.02, 1.7, 0.01], [x, 0.13, 0.5], DARK]),
  ...[-0.71, -0.24, 0.24, 0.71].flatMap((x) => [
    [[0.28, 0.03, 0.01], [x, 1.6, 0.505], DARK], [[0.28, 0.03, 0.01], [x, 1.52, 0.505], DARK], [[0.04, 0.16, 0.03], [x + 0.15, 0.9, 0.51], GREY],
  ]),
])
// A snack machine: a dark window with rows of snacks, a keypad, and the pickup slot (wall prop).
const vending = prop([
  [[0.95, 1.85, 0.75], [0, 0, 0.375], '#4b4660'], [[0.62, 1.15, 0.02], [-0.1, 0.6, 0.76], '#1e1e2e'],
  ...[0.68, 0.95, 1.22, 1.49].flatMap((y, r) => [-0.31, -0.17, -0.03, 0.11].map((x, i) => [[0.1, 0.16, 0.02], [x, y, 0.775], BOOKS[(r + i * 2) % 6]])),
  [[0.18, 0.5, 0.02], [0.33, 1.1, 0.76], DARK], [[0.1, 0.06, 0.02], [0.33, 0.95, 0.775], GREY], [[0.6, 0.18, 0.03], [-0.1, 0.25, 0.76], DARK],
])
// An arcade cabinet: a screen, a control panel with a stick and two buttons, and a plain marquee (wall prop). Nothing glows.
const arcade = prop([
  [[0.75, 1.8, 0.65], [0, 0, 0.325], '#4b4660'], [[0.75, 0.12, 0.3], [0, 0.92, 0.75], '#2b2a33'],
  [[0.56, 0.46, 0.02], [0, 1.12, 0.66], '#34507a'], [[0.66, 0.2, 0.02], [0, 1.58, 0.66], '#b06a4f'],
  [[0.04, 0.12, 0.04], [-0.15, 1.04, 0.76], DARK], [[0.08, 0.06, 0.08], [-0.15, 1.16, 0.76], '#b06a4f'],
  [[0.06, 0.03, 0.06], [0.06, 1.04, 0.78], '#4a6fa8'], [[0.06, 0.03, 0.06], [0.18, 1.04, 0.78], CREAM],
])
// A sofa corner on a rug: the sofa, an armchair at each end, and a coffee table in the middle.
const sofaCorner = (g, x, z, rot) => {
  const o = at(g, x, z, rot)
  box(o, [3.8, 0.02, 2.4], [0, 0, 0], RUGS[0][0])
  sofa(o, 0, -1)
  coffeeTable(o, 0, 0.35)
  armchair(o, -1.45, 0.35, 1)
  armchair(o, 1.45, 0.35, 3)
}
// A long shared table with three chairs on each side, books and a plant on top.
const workBench = (g, x, z, rot) => {
  const o = at(g, x, z, rot)
  box(o, [2.8, 0.06, 1], [0, 0.72, 0], WOOD)
  for (const s of [-1, 1]) box(o, [0.08, 0.72, 0.8], [s * 1.25, 0, 0], WOOD_D)
  for (const a of [-0.9, 0, 0.9]) { chair(o, a, -0.75, 0); chair(o, a, 0.75, 2) }
  box(o, [0.2, 0.16, 0.2], [0.1, 0.78, 0], POTS[0])
  box(o, [0.28, 0.2, 0.28], [0.1, 0.94, 0], GREENS[0])
  box(o, [0.34, 0.08, 0.26], [-0.8, 0.78, 0.15], BOOKS[4])
  box(o, [0.3, 0.06, 0.24], [0.9, 0.78, -0.2], BOOKS[1])
}
// A chess table with two chairs, on a small rug. A game table of the model passes chairs false and draws its own chairs.
const chessTable = (g, x, z, rot, chairs = true) => {
  const o = at(g, x, z, rot)
  box(o, [1.2, 0.02, 1.9], [0, 0, 0], RUGS[3][1])
  box(o, [0.7, 0.05, 0.7], [0, 0.7, 0], WOOD_D)
  box(o, [0.1, 0.7, 0.1], [0, 0, 0], DARK)
  box(o, [0.4, 0.04, 0.4], [0, 0, 0], DARK)
  for (let i = 0; i < 16; i++) if ((i + (i >> 2)) % 2) box(o, [0.12, 0.01, 0.12], [-0.18 + (i % 4) * 0.12, 0.75, -0.18 + (i >> 2) * 0.12], CREAM)
  for (const [a, b, c] of [[-0.18, -0.18, WHITE], [0.06, -0.06, WHITE], [0.18, 0.18, DARK], [-0.06, 0.06, DARK]]) box(o, [0.05, 0.1, 0.05], [a, 0.76, b], c)
  if (!chairs) return
  chair(o, 0, -0.62, 0)
  chair(o, 0, 0.62, 2)
}
// A bicycle parked along the wall (wall prop): two square wheels, the frame, the saddle, and the handlebar.
const bike = prop([
  ...[-0.5, 0.5].flatMap((x) => [
    [[0.64, 0.05, 0.04], [x, 0, 0.25], DARK], [[0.64, 0.05, 0.04], [x, 0.59, 0.25], DARK],
    [[0.05, 0.64, 0.04], [x - 0.3, 0, 0.25], DARK], [[0.05, 0.64, 0.04], [x + 0.3, 0, 0.25], DARK],
  ]),
  [[0.62, 0.05, 0.05], [0.08, 0.62, 0.25], '#b06a4f'], [[0.55, 0.05, 0.05], [0.02, 0.33, 0.25], '#b06a4f'],
  [[0.05, 0.32, 0.05], [-0.22, 0.62, 0.25], '#b06a4f'], [[0.05, 0.3, 0.05], [0.42, 0.64, 0.25], '#b06a4f'],
  [[0.24, 0.05, 0.1], [-0.22, 0.94, 0.25], DARK], [[0.05, 0.04, 0.42], [0.42, 0.94, 0.25], DARK],
])
// A big indoor tree in a square pot.
const tree = prop([
  [[0.6, 0.5, 0.6], [0, 0, 0], POTS[1]], [[0.12, 1.1, 0.12], [0, 0.5, 0], WOOD_D],
  [[0.9, 0.5, 0.9], [0, 1.3, 0], GREENS[0]], [[0.6, 0.4, 0.6], [0.1, 1.8, -0.05], GREENS[1]], [[0.4, 0.3, 0.4], [-0.25, 1.15, 0.2], GREENS[2]],
])
// A drum kit (party room): a bass drum with its head to +z, a snare, three toms, two cymbals, and the stool on the -z side.
const drums = prop([
  [[0.55, 0.55, 0.4], [0, 0, 0.1], '#b06a4f'], [[0.4, 0.4, 0.02], [0, 0.08, 0.31], CREAM],
  [[0.32, 0.18, 0.32], [-0.45, 0.5, -0.15], '#b06a4f'], [[0.06, 0.5, 0.06], [-0.45, 0, -0.15], GREY],
  [[0.28, 0.22, 0.28], [-0.15, 0.6, 0.05], '#b06a4f'], [[0.28, 0.22, 0.28], [0.18, 0.6, 0.05], '#b06a4f'], [[0.34, 0.4, 0.34], [0.5, 0, -0.1], '#b06a4f'],
  ...[[-0.65, 0.2], [0.7, 0.25]].flatMap(([x, z]) => [[[0.04, 1, 0.04], [x, 0, z], GREY], [[0.42, 0.02, 0.42], [x, 1, z], '#a9aaa8']]),
  [[0.36, 0.06, 0.36], [0, 0.45, -0.6], DARK], [[0.06, 0.45, 0.06], [0, 0, -0.6], DARK],
])
// A backless wooden bench for a strip of floor.
const bench = prop([
  [[1.6, 0.06, 0.42], [0, 0.42, 0], WOOD], [[1.5, 0.04, 0.06], [0, 0.42, 0.18], WOOD_D],
  ...[-0.66, 0.66].map((x) => [[0.08, 0.42, 0.36], [x, 0, 0], WOOD_D]), [[1.24, 0.06, 0.06], [0, 0.14, 0], WOOD_D],
])
// A low lobby table with magazines and a small plant.
const magazines = prop([
  ...legs(0.5, 0.27, 0.38, WOOD_D), [[1.1, 0.06, 0.64], [0, 0.38, 0], WOOD], [[1.0, 0.04, 0.54], [0, 0.12, 0], WOOD_D],
  [[0.24, 0.02, 0.32], [-0.3, 0.44, 0.04], BOOKS[1]], [[0.24, 0.02, 0.32], [-0.12, 0.45, -0.06], BOOKS[2]], [[0.24, 0.02, 0.32], [0.12, 0.44, 0.08], BOOKS[4]],
  [[0.3, 0.1, 0.36], [0.2, 0.16, 0], BOOKS[5]], [[0.14, 0.14, 0.14], [0.36, 0.44, -0.16], POTS[1]], [[0.18, 0.16, 0.18], [0.36, 0.58, -0.16], GREENS[1]],
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

// A pumpkin: an orange body, two darker ribs and a stem, and a face on the +z side. s scales it, as for plant().
function pumpkin(g, x, z, rot = 0, s = 1) {
  const o = at(g, x, z, rot), F = '#2b2a33'
  o.scale.setScalar(s)
  box(o, [0.5, 0.3, 0.46], [0, 0, 0], '#c8742f')
  for (const a of [-1, 1]) box(o, [0.05, 0.3, 0.01], [a * 0.2, 0, 0.235], '#a95f26')
  box(o, [0.08, 0.08, 0.08], [0, 0.3, 0], WOOD_D)
  for (const a of [-1, 1]) box(o, [0.08, 0.08, 0.01], [a * 0.1, 0.17, 0.235], F)
  box(o, [0.2, 0.06, 0.01], [0, 0.06, 0.235], F)
}
// A bat that hangs from a string: the body center is at y, the string reaches up to the wall height 2.6.
// It spans 1.0 with stepped wings (a scalloped edge), two ears, and two white eyes, so it reads over the dark dance floor.
function bat(g, x, y, z) {
  const C = '#2b2a33'
  box(g, [0.16, 0.2, 0.1], [x, y - 0.1, z], C)
  for (const a of [-1, 1]) {
    box(g, [0.04, 0.04, 0.04], [x + a * 0.05, y + 0.1, z], C) // the ears
    box(g, [0.03, 0.03, 0.01], [x + a * 0.035, y + 0.02, z + 0.055], '#f4f1ea') // the eyes
    box(g, [0.18, 0.12, 0.04], [x + a * 0.17, y - 0.06, z], C) // each wing steps down and out in 3 parts
    box(g, [0.14, 0.08, 0.04], [x + a * 0.33, y - 0.1, z], C)
    box(g, [0.1, 0.05, 0.04], [x + a * 0.45, y - 0.14, z], C)
  }
  box(g, [0.02, 2.6 - (y + 0.1), 0.02], [x, y + 0.1, z], C)
}
// A cobweb in a wall corner: 4 strands 0.6 long, 30 degrees apart, below the horizontal toward +x, and two chords between each pair.
function web(g, x, y, z) {
  const o = new THREE.Group(), C = '#e4e4ea'
  o.position.set(x, y, z)
  g.add(o)
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 6, s = at(o, 0, 0)
    s.rotation.set(0, 0, -a)
    box(s, [0.6, 0.035, 0.02], [0.3, -0.035, 0], C)
    if (k < 3) for (const r of [0.25, 0.45]) {
      const p = [a, a + Math.PI / 6].map((t) => [r * Math.cos(t), -r * Math.sin(t)]), v = [p[1][0] - p[0][0], p[1][1] - p[0][1]]
      const c = at(o, 0, 0)
      c.position.set((p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2, 0)
      c.rotation.z = Math.atan2(v[1], v[0])
      box(c, [Math.hypot(...v) - 0.04, 0.035, 0.02], [0, -0.0175, 0], C)
    }
  }
}

// Places props on free floor only: inside the walls, clear of the pods (and their lamp posts), the 2 x 2 area
// inside the door, the walk rects of the room (where idle workers walk), the keep-out rects, and what is placed already.
// Room-local coords. Returns true when the prop fits. pad grows the prop for the test against what is taken, so a gap stays around it.
// put.fits(r, pad) tests a rect, put.taken holds the taken rects, and put.used(make) counts the props of one maker in the room.
// A terrace has no door, no pods, and no walk rects, so only the walls and the props limit it.
// ponytail: greedy first fit over a few candidate spots. A prop that fits none is skipped.
function placer(g, room, ...keep) {
  const { door, pods = [] } = room, dx = door?.x - room.x, dz = door?.side === 'north' ? 0 : room.d - 2
  const taken = [...(door ? [[dx - 1, dz, dx + 1, dz + 2]] : []), ...keep, ...(room.walk ?? []).map(([a, b, c, d]) => [a - room.x, b - room.z, c - room.x, d - room.z])]
  for (const p of pods) {
    const x = p.x - room.x, z = p.z - room.z, lx = x + LAMP[0], lz = z + LAMP[1]
    taken.push([x - 0.3, z - 0.3, x + p.w + 0.3, z + p.d + 0.3], [lx - 0.15, lz - 0.15, lx + 0.15, lz + 0.15])
  }
  const used = new Map(), m = E - 0.01
  // written as a >= m && ..., not as a < m || ..., so a NaN position fails too
  const fits = (r, pad = 0) => r[0] >= m && r[1] >= m && r[2] <= room.w - m && r[3] <= room.d - m &&
    !taken.some((q) => r[0] - pad < q[2] && q[0] < r[2] + pad && r[1] - pad < q[3] && q[1] < r[3] + pad)
  const put = (make, x, z, rot = 0, pad = 0, kind = make) => { // kind: the maker that counts in used(), for a swapped prop
    const t = new THREE.Group()
    make(t, x, z, rot)
    const b = new THREE.Box3().setFromObject(t), r = [b.min.x, b.min.z, b.max.x, b.max.z]
    if (!fits(r, pad)) return false
    taken.push(r)
    used.set(kind, (used.get(kind) ?? 0) + 1)
    g.add(...t.children)
    return true
  }
  return Object.assign(put, { fits, taken, used: (make) => used.get(make) ?? 0 })
}
const corners = ({ w, d }) => [[0.75, 0.75], [w - 0.75, 0.75], [0.75, d - 0.75], [w - 0.75, d - 0.75]]

const steps = (a, b, s) => Array.from({ length: Math.max(0, Math.floor((b - a) / s + 1e-9) + 1) }, (_, i) => a + i * s)
// The fill pass, after the fixed props of a room: props from a pool on the open floor, one for each PER m² of free floor over FREE.
// So a small room gets none. A pool entry is [make, how, max]. how 'w': a wall prop, on the north or the west wall (the walls that the
// camera sees). 'f': a floor prop with a front, which faces the room middle. 's': a floor prop in any turn (two turns are tried, so a
// long prop can lie along its strip). max (default 1) counts the props of the kind that the fixed props placed too.
// The rounds, all in a seeded random order, so each build gives the same props and two rooms get different mixes:
// 1. Floor props from the pool, at most 80% of its floor kinds, so two big rooms differ too.
// 2. THIN props (each kind at most twice in the room) on a finer grid, for the narrow strips between the pods and the walk lanes.
//    Its budget comes from the free floor again. Its spots come to STRIP_EDGE from a room edge, so the thin props spread over the
//    whole room, the band along the corridor side too.
// 3. At most WALL_MAX wall props, outside the budget.
// Floor spots are a grid with a jitter of a full cell and at least EDGE from each room edge, and a floor prop of round 1 keeps NEAR
// from each edge, so the fill stands in the open floor between and around the pods, not along the walls. PAD keeps a gap around each prop.
// A spot test first moves the footprint of the prop at the origin (foot), so only a likely fit builds the prop. A plant or a bean bag
// changes with its position, so put() checks it again.
const FREE = 30, PER = 7, PAD = 0.3, EDGE = 1.2, NEAR = 0.6, STRIP_EDGE = 0.6, WALL_MAX = 3
function furnish(put, room, pool, season, thin = THIN) { // thin: the pool of the strip round. A terrace passes GARDEN.
  const { w, d } = room, rnd = rng(hash(room.id, 1e9)), mix = (a) => a.map((v) => [rnd(), v]).sort((p, q) => p[0] - q[0]).map(([, v]) => v)
  const free = (x, z) => !put.taken.some((q) => x > q[0] && x < q[2] && z > q[1] && z < q[3])
  const budget = () => {
    let cells = 0 // free cells of 0.5 x 0.5
    for (const x of steps(E + 0.25, w - E - 0.25, 0.5)) for (const z of steps(E + 0.25, d - E - 0.25, 0.5)) cells += free(x, z)
    return Math.floor((cells / 4 - FREE) / PER)
  }
  const kinds = mix(pool), floors = kinds.filter(([, how]) => how !== 'w'), first = Math.min(budget(), Math.floor(floors.length * 0.8))
  if (first <= 0) return
  const face = (x, z) => (Math.abs(x - w / 2) / w > Math.abs(z - d / 2) / d ? (x < w / 2 ? 1 : 3) : z < d / 2 ? 0 : 2)
  const feet = new Map(), box3 = new THREE.Box3()
  const foot = (make, q) => {
    const f = feet.get(make) ?? feet.set(make, []).get(make)
    if (!f[q]) {
      const t = new THREE.Group()
      make(t, 0, 0, q)
      box3.setFromObject(t)
      f[q] = [box3.min.x, box3.min.z, box3.max.x, box3.max.z]
    }
    return f[q]
  }
  const tryAt = (make, x, z, q, near) => {
    const m = swap(make, x, z), o = m === make ? q : 0, [a, b, c, e] = foot(m, o), // o: a Christmas tree stays at rot 0, so its ornaments face the camera
       r = [x + a, z + b, x + c, z + e]
    return r[0] >= near && r[1] >= near && r[2] <= w - near && r[3] <= d - near && put.fits(r, PAD) && put(m, x, z, o, PAD, make)
  }
  // In winter, about a third of the indoor trees become Christmas trees. The spot picks, so a rebuild gives the same trees. put() checks
  // the real footprint, and the wider tree may fail where the plain tree fits. Then furnish() goes on to its next spot.
  const swap = (make, x, z) => (season === 'winter' && make === tree && Math.abs(Math.round(x * 7 + z * 13)) % 2 ? xmasTree : make)
  const grid = (s, edge) => mix(steps(edge, w - edge, s).flatMap((x) => steps(edge, d - edge, s).map((z) => [x + (rnd() - 0.5) * s, z + (rnd() - 0.5) * s]))
    .filter(([x, z]) => x >= edge && x <= w - edge && z >= edge && z <= d - edge && put.fits([x - 0.2, z - 0.2, x + 0.2, z + 0.2], PAD))) // each floor prop covers this core
  const round = (entries, n, spots, near) => { // near: the least distance from a prop to a room edge
    for (const [make, how, max = 1] of entries) {
      for (let k = put.used(make); k < max && n > 0; k++) {
        const r = Math.floor(rnd() * 4)
        if (!spots.some(([x, z, q]) => (how === 'w' ? [q] : how === 'f' ? [face(x, z)] : [r, (r + 1) % 4]).some((t) => tryAt(make, x, z, t, near)))) break
        n--
      }
    }
  }
  round(floors, first, grid(0.6, EDGE), NEAR)
  round(mix(thin), budget(), grid(0.4, STRIP_EDGE), 0)
  round(kinds.filter(([, how]) => how === 'w'), WALL_MAX, mix([...steps(1, w - 1, 0.5).map((x) => [x, E, 0]), ...steps(1, d - 1, 0.5).map((z) => [E, z, 1])]), 0)
}

const lounge = (g, x, z, rot) => {
  const o = at(g, x, z, rot)
  sofa(o, 0, 0)
  coffeeTable(o, 0, 1.45)
}

// The spot of the room candelabra, in world coords, or null. The camera looks along (1, 1, 1), so the camera sees a flame when the ray
// from it in that direction misses each mesh of the room, each pod (grown by 0.3, 1.7 high), each lamp post (2.4 high), and the two
// inner-wall headers (y 2.48 to 2.6) that office.js draws on the east and south wall lines. It casts the ray from the flame base and top.
// Candidates lie on a 0.5 grid, 0.6 or more from the walls. The camera-side corner (large x / w + z / d) comes first.
// Call it last: it measures what the room has. It does not draw the candelabra: office.js does.
function candleSpot(g, room, put) {
  const { w, d, pods = [] } = room
  g.updateMatrixWorld(true)
  const at0 = g.position.clone().negate(), aabb = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1))
  const boxes = []
  g.traverse((o) => o.isMesh && boxes.push(new THREE.Box3().setFromObject(o).translate(at0)))
  for (const p of pods) {
    const x = p.x - room.x, z = p.z - room.z, lx = x + LAMP[0], lz = z + LAMP[1]
    boxes.push(aabb(x - 0.3, 0, z - 0.3, x + p.w + 0.3, 1.7, z + p.d + 0.3), aabb(lx - 0.2, 0, lz - 0.2, lx + 0.2, 2.4, lz + 0.2))
  }
  boxes.push(aabb(w - 0.15, 2.48, -0.15, w + 0.15, 2.6, d + 0.7), aabb(-0.15, 2.48, d - 0.15, w + 0.7, 2.6, d + 0.15)) // 0.7 past the corner: the neighbor header
  const dir = new THREE.Vector3(1, 1, 1).normalize(), cands = []
  for (let x = 0.6; x <= w - 0.6; x += 0.5) for (let z = 0.6; z <= d - 0.6; z += 0.5) cands.push([x, z])
  const score = ([x, z]) => Math.round((x / w + z / d) * 1e6)
  cands.sort((a, b) => score(b) - score(a) || b[0] - a[0])
  const spot = cands.find(([x, z]) => put.fits([x - 0.3, z - 0.3, x + 0.3, z + 0.3], 0.3) &&
    [-0.25, 0, 0.25].every((f) => [1.47, 1.53].every((y) => { const ray = new THREE.Ray(new THREE.Vector3(x + f, y, z), dir); return !boxes.some((b) => ray.intersectsBox(b)) })))
  if (!spot) return null
  const [x, z] = spot
  put.taken.push([x - 0.3, z - 0.3, x + 0.3, z + 0.3])
  return { x: room.x + x, z: room.z + z }
}

export function workspaceDecor(g, room, season) {
  const put = placer(g, room), n = room.number, { w, d } = room
  gameTables(g, room, put)
  room.pods.forEach((p, i) => {
    const [c1, c2] = RUGS[(n + i) % RUGS.length], x = p.x - room.x + p.w / 2, z = p.z - room.z + p.d / 2
    box(g, [p.w + 0.5, 0.02, p.d + 0.5], [x, 0, z], c1)
    box(g, [p.w + 0.1, 0.03, p.d + 0.1], [x, 0, z], c2)
  })
  // The back walls the camera sees are north and west. The bookshelf takes the north wall unless the door is there.
  if (room.door.side === 'south') put(shelf, w / 2, E + 0.2)
  else [d / 2, d / 3, (2 * d) / 3].some((z) => put(shelf, E + 0.2, z, 1))
  const extra = n % 2 ? board16 : printer
  ;[[E, d / 2, 1], [w / 4, E, 0], [(3 * w) / 4, E, 0]].some(([x, z, r]) => put(extra, x, z, r))
  ;[[(3 * w) / 4, E, 0], [w / 4, E, 0], [E, d / 2, 1]].some(([x, z, r]) => put(lounge, x, z, r)) // fits only a stretched room
  plants(put, corners(room), w * d > 100 ? 4 : 2)
  furnish(put, room, OFFICE, season) // a big room gets more, so it does not read as an empty hall
  if (season === 'halloween') web(g, 0.19, 2.6, 0.17) // not through put(): it hangs on the wall, over the props. The wall face is at 0.15, the strand is 0.035 thick.
  if (season === 'halloween') return candleSpot(g, room, put)
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
const cafe = (g, x, z, rot) => {
  const o = at(g, x, z, rot)
  cafeTable(o, 0, 0)
  chair(o, -0.8, 0, 1)
  chair(o, 0.8, 0, 3)
  chair(o, 0, 0.8, 2)
}

// The game tables of the model (room.games, in world coords). A place is the body of a seated player and stands on a walk rect, so put()
// would refuse it. Draw each table directly, and add its footprint to put.taken. Call it before the fixed props and the fill.
// A chess table lies along x: the rug is 1.9 long, and the chairs stand west and east. Each chair stands as in kitchen(): 0.1 behind its
// place, the back away from the table, so 0.72 from the table center. A ping-pong table has its long side along x.
function gameTables(g, room, put) {
  for (const t of room.games ?? []) {
    const o = new THREE.Group(), x = t.x - room.x, z = t.z - room.z
    if (t.kind === 'chess') {
      chessTable(o, x, z, 1, false)
      for (const p of t.places) chair(at(o, p.x - room.x, p.z - room.z, p.rot), 0, 0.1, 2)
    } else pingPong(o, x, z, 0)
    const b = new THREE.Box3().setFromObject(o)
    // Take the union of the box and the model footprint (GAMES in model.js), so the players at the places stay clear too.
    const f = t.kind === 'chess' ? 0.95 : 1.75
    put.taken.push([Math.min(b.min.x, x - f), Math.min(b.min.z, z - 0.6), Math.max(b.max.x, x + f), Math.max(b.max.z, z + 0.6)])
    g.add(...o.children)
  }
}

export function kitchen(g, room, season) {
  const put = placer(g, room), { w, d } = room, { len: L } = room.counter // the model sets the counter, the spots and the walk rects
  const cx = room.counter.x - room.x, cz = room.counter.z - room.z
  put(counter(L), cx, cz)
  if (season === 'halloween') { // on the counter top east of the sink, under the wall cabinets (y 1.6). Not through put(): it stands on a prop.
    const o = at(g, cx + L / 2 - 0.16, cz + 0.42)
    o.position.y = 0.94
    pumpkin(o, 0, 0, 0, 0.55)
  }
  // The lunch tables and chairs come from the model (room.tables, room.chairs, in world coords). A chair point is the body of a seated
  // worker and stands on a walk rect, so put() would refuse it. Draw each table with its chairs directly, and add their footprint to
  // put.taken, so the props after them keep clear. A chair stands as a desk chair does: 0.1 behind the body, the back away from the table.
  for (const [i, t] of (room.tables ?? []).entries()) {
    const o = new THREE.Group()
    cafeTable(o, t.x - room.x, t.z - room.z)
    for (const c of room.chairs.filter((c) => c.table === i)) chair(at(o, c.x - room.x, c.z - room.z, c.rot), 0, 0.1, 2)
    const b = new THREE.Box3().setFromObject(o)
    put.taken.push([b.min.x, b.min.z, b.max.x, b.max.z])
    g.add(...o.children)
  }
  put(cooler, room.cooler.x - room.x, room.cooler.z - room.z) // the model sets the spot, so the two chat spots stand in front of it
  ;[E + L + 0.5, room.cooler.x - room.x + 0.75, w - E - 0.45].some((x) => put(fridge, x, E))
  const [nw, , sw, se] = corners(room)
  plants(put, [sw, nw, se], 1)
  furnish(put, room, KITCHEN, season)
  if (season === 'halloween') return candleSpot(g, room, put)
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

export function meeting(g, room, season) {
  const put = placer(g, room), { w } = room
  put(longTable(room))
  // The head of the table is at the west wall, so the whiteboard and the TV share the north wall, clear of a door there.
  put(board(1.6), w / 4, E)
  put(tv, (3 * w) / 4, E)
  const [nw, ne, sw] = corners(room)
  plants(put, [ne, sw, nw], 2)
  if (season === 'halloween') return candleSpot(g, room, put)
}

// A DJ booth: a desk 1.6 x 0.9 x 0.7 with two turntables and a mixer on top. The front faces +z. Plain colors only, so no part reads as a status.
const booth = prop([
  [[1.6, 0.86, 0.7], [0, 0, 0], '#2b2a33'], [[1.64, 0.04, 0.74], [0, 0.86, 0], DARK], [[1.4, 0.5, 0.02], [0, 0.2, 0.35], '#4b4660'],
  ...[-1, 1].flatMap((s) => [
    [[0.5, 0.04, 0.5], [s * 0.5, 0.9, 0], '#55545c'], [[0.38, 0.03, 0.38], [s * 0.5, 0.94, 0], '#1b1b20'],
    [[0.1, 0.01, 0.1], [s * 0.5, 0.97, 0], CREAM], [[0.04, 0.03, 0.24], [s * 0.5 + 0.2, 0.94, -0.02], GREY],
  ]),
  [[0.34, 0.08, 0.46], [0, 0.9, 0], DARK], [[0.12, 0.02, 0.03], [0, 0.98, -0.17], WHITE], // the crossfader on the DJ side
  ...[-1, 1].flatMap((s) => [[[0.03, 0.02, 0.14], [s * 0.07, 0.98, -0.04], WHITE], [[0.04, 0.03, 0.04], [s * 0.07, 0.98, 0.14], GREY]]),
])

// The model sets the booth, the dance floor, the spots, and the walk rects. office.js builds the speakers beside the booth and the
// moving lights, so the speaker floor (1.8 to each side of the booth center) and the dance floor stay free.
export function party(g, room, season) {
  const { w, d } = room, x = room.booth.x - room.x, z = room.booth.z - room.z, [x0, z0, x1, z1] = room.floor
  booth(g, x, z, room.booth.rot)
  const fz0 = z0 - room.z, fz1 = z1 - room.z
  const put = placer(g, room, [x - 1.8, z - 0.45, x + 1.8, z + 0.45], [x0 - room.x, fz0, x1 - room.x, fz1])
  gameTables(g, room, put)
  ;[[E, fz0 / 2, 1], [w - E, fz0 / 2, 3], [E, (fz1 + d) / 2, 1], [w - E, (fz1 + d) / 2, 3]].some(([x, z, r]) => put(lounge, x, z, r)) // on a side wall, beside the floor
  plants(put, corners(room), 2)
  furnish(put, room, PARTY, season)
  if (season === 'halloween') { // four bats round the disco ball, above the beams (they start at y 2.2). Not through put(): the keep rect covers the floor.
    const fx = (x0 + x1) / 2 - room.x, fz = (z0 + z1) / 2 - room.z
    ;[[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], i) => bat(g, fx + a, i % 2 ? 2.45 : 2.3, fz + b))
  }
  if (season === 'halloween') return candleSpot(g, room, put)
}
// A bar (wall prop): a back shelf with two rows of bottles, the counter, and three stools in front.
const bar = (g, x, z, rot) => {
  const o = at(g, x, z, rot)
  box(o, [2.4, 1.7, 0.3], [0, 0, 0.15], WOOD_D)
  ;[0.95, 1.35].forEach((y, r) => {
    box(o, [2.3, 0.04, 0.14], [0, y - 0.04, 0.37], WOOD)
    for (let i = 0; i < 9; i++) box(o, [0.08, 0.22 + (i % 3) * 0.04, 0.08], [-1 + i * 0.25, y, 0.37], ['#3f6b4a', '#6b4a35', CREAM, '#7ea5a5'][(i + r) % 4])
  })
  box(o, [2.4, 1, 0.55], [0, 0, 1.1], '#2b2a33')
  box(o, [2.5, 0.06, 0.7], [0, 1, 1.12], WOOD)
  for (const a of [-0.8, 0, 0.8]) stool(o, a, 1.8)
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

// Winter tree: four tiers, two ornaments on the +z and +x face of each tier, a brass star (not yellow, so it never reads as `working`).
// An ornament is a bulb: one unlit shared material for each color. office.js finds `userData.bulb` and adds a halo (INTENT.md decision 25 exception).
const BULBS = [WHITE, '#c9ccd3', '#8b5cf6', '#4a6fa8'].map((c) => new THREE.MeshBasicMaterial({ color: c, userData: { shared: true, bulb: true } }))
const xmasTree = prop([
  [[0.5, 0.2, 0.5], [0, 0, 0], POTS[1]], [[0.16, 0.2, 0.16], [0, 0.2, 0], WOOD_D],
  ...[1.3, 1, 0.7, 0.4].flatMap((w, i) => {
    const y = 0.4 + i * 0.45, c = BULBS[i]
    return [
      [[w, 0.45, w], [0, y, 0], GREENS[0]],
      ...[-1, 1].flatMap((s) => [[[0.08, 0.08, 0.08], [s * w / 4, y + 0.05, w / 2 - 0.02], c], [[0.08, 0.08, 0.08], [w / 2 - 0.02, y + 0.05, s * w / 4], c]]),
    ]
  }),
  [[0.2, 0.2, 0.2], [0, 2.2, 0], '#d8b45c'],
])

// The building entrance is in the middle of the lobby's south wall. The reception faces it.
export function lobby(g, room, season) {
  const { w, d } = room, put = placer(g, room, [w / 2 - 1, d - 2, w / 2 + 1, d])
  put(reception, w / 2 + 0.6, d - 3.2, 0)
  ;[d / 2 + 0.4, d / 2, d - 1.6].some((z) => put(waiting, E, z, 1))
  if (season === 'halloween') for (const x of [w / 2 - 1.1, w / 2 + 2.3]) put(pumpkin, x, d - 3, 0)
  if (season === 'winter') [[1, 1], [w - 1, 1], [1, d - 1]].some(([x, z]) => put(xmasTree, x, z, 0))
  plants(put, corners(room), 2)
  furnish(put, room, LOBBY, season)
  if (season === 'halloween') return candleSpot(g, room, put)
}

// ---- garden props for terrace(): plain colors, no status color, nothing glows ----
// A garden tree: a trunk and a crown of three blocks. No pot: it stands in the grass.
const gardenTree = prop([
  [[0.22, 1.1, 0.22], [0, 0, 0], WOOD_D],
  [[1.1, 0.6, 1.1], [0, 1, 0], GREENS[0]], [[0.8, 0.5, 0.8], [0.08, 1.6, -0.06], GREENS[1]], [[0.46, 0.34, 0.46], [-0.08, 2.1, 0.08], GREENS[0]],
])
const bush = prop([[[0.8, 0.45, 0.7], [0, 0, 0], GREENS[1]], [[0.55, 0.3, 0.5], [0.06, 0.45, -0.04], GREENS[0]]])
// A sun lounger: a wood frame on low legs and a cushion with a raised back at the -z end. The foot end faces +z.
const lounger = prop([
  ...legs(0.26, 0.78, 0.18, WOOD_D), [[0.64, 0.07, 1.8], [0, 0.18, 0], WOOD], [[0.58, 0.06, 1.15], [0, 0.25, 0.28], '#34507a'],
  [[0.58, 0.22, 0.3], [0, 0.25, -0.5], '#34507a'], [[0.58, 0.24, 0.3], [0, 0.4, -0.75], '#34507a'],
])
// A garden table with four chairs under a parasol. The canopy has stripes in two plain colors.
const parasol = (g, x, z, rot) => {
  const o = at(g, x, z, rot)
  cafeTable(o, 0, 0)
  for (const [a, b, r] of [[-0.8, 0, 1], [0.8, 0, 3], [0, 0.8, 2], [0, -0.8, 0]]) chair(o, a, b, r)
  box(o, [0.06, 1.42, 0.06], [0, 0.78, 0], GREY)
  for (let i = 0; i < 4; i++) box(o, [1.8, 0.08, 0.45], [0, 2.2, -0.675 + i * 0.45], i % 2 ? CREAM : '#b06a4f')
  box(o, [0.5, 0.1, 0.5], [0, 2.28, 0], '#b06a4f')
}
// A small pond: a stone rim round dark water with two lily pads. The water top is at 0.1, above the deck boards.
const pond = prop([
  ...[-0.6, 0.6].map((z) => [[2, 0.14, 0.2], [0, 0, z], GREY]), ...[-0.9, 0.9].map((x) => [[0.2, 0.14, 1], [x, 0, 0], GREY]),
  [[1.6, 0.1, 1], [0, 0, 0], '#34507a'], [[0.26, 0.02, 0.22], [0.3, 0.1, -0.15], GREENS[1]], [[0.2, 0.02, 0.18], [-0.35, 0.1, 0.2], GREENS[0]],
])

// Snow: a cap on the top of each green block 0.1 high or more (tree crowns, bushes, planters). The cap is 0.04 wider, so no face is shared.
function snow(g) {
  g.updateMatrixWorld(true)
  const greens = new Set(GREENS.map(shared)), tops = []
  g.traverse((o) => o.isMesh && greens.has(o.material) && tops.push(new THREE.Box3().setFromObject(o)))
  for (const b of tops) if (b.max.y - b.min.y >= 0.1) box(g, [b.max.x - b.min.x + 0.04, 0.05, b.max.z - b.min.z + 0.04], [(b.min.x + b.max.x) / 2 - g.position.x, b.max.y, (b.min.z + b.max.z) / 2 - g.position.z], SNOW)
}

// A terrace: the spare width of a row, a garden with no door, no pods, and no walk rects. office.js draws the grass, the walls, and the
// hedge on an open north edge. This draws a wood deck 1 in from each edge, so the grass shows round it. Then trees in the back corners,
// a parasol table in the middle, loungers beside it, a bench, a pond, bushes in the front corners (low, so the camera sees in), and
// the fill pass with TERRACE and the strip round with GARDEN.
export function terrace(g, t, season) {
  const { w, d } = t, put = placer(g, t)
  box(g, [w - 2, 0.03, d - 2], [w / 2, 0, d / 2], WOOD_D)
  for (const z of steps(1.05, d - 1.35, 0.35)) box(g, [w - 2.1, 0.05, 0.3], [w / 2, 0, z + 0.15], WOOD) // the boards along x, over the 0.04 table base of a parasol
  for (const x of [0.75, w - 0.75]) put(gardenTree, x, 0.75)
  ;[d / 2, d / 2 + 0.6].some((z) => put(parasol, w / 2, z))
  for (const x of [w / 2 - 1.7, w / 2 + 1.7]) put(lounger, x, d / 2)
  put(bench, w / 2, 0.6)
  ;[[w / 4, d / 2], [(3 * w) / 4, d / 2]].some(([x, z]) => put(pond, x, z))
  for (const x of [0.75, w - 0.75]) put(bush, x, d - 0.75)
  furnish(put, t, TERRACE, season, GARDEN)
  if (season === 'winter') snow(g)
}

// The pools of furnish(): [make, how, max]. A filler (a plant, a bean bag) can come twice.
const pot = (g, x, z) => plant(g, x, z)
const OFFICE = [
  [lounge, 'w'], [piano, 'w'], [aquarium, 'w'], [cabinets, 'w'], [credenza, 'w'], [lockers, 'w'], [vending, 'w'], [arcade, 'w'], [cooler, 'w'],
  [printer, 'w'], [board16, 'w'], [bike, 'w'], [cafe, 's'], [nook, 's'], [highTable, 's'], [planter, 's'], [lowShelf, 's'],
  [foosball, 's'], [workBench, 's'], [tree, 's'], [coatRack, 's'], [sofaCorner, 'f'], [flipChart, 'f'], [beanBag, 'f', 2],
  [pot, 's', 2],
]
const PARTY = [
  [bar, 'w'], [arcade, 'w'], [piano, 'w'], [vending, 'w'], [lounge, 'w'], [sofaCorner, 'f'], [drums, 'f'], [highTable, 's'], [foosball, 's'],
  [planter, 's'], [tree, 's'], [coatRack, 's'], [beanBag, 'f', 2], [pot, 's', 2],
]
const KITCHEN = [
  [vending, 'w'], [credenza, 'w'], [lockers, 'w'], [bike, 'w'], [highTable, 's'], [workBench, 's'], [nook, 's'], [planter, 's'], [tree, 's'],
  [coatRack, 's'], [pot, 's', 2],
]
// The strip round of furnish(): thin props, each kind at most twice in a room (the main fill counts too).
const THIN = [[planter, 's', 2], [lowShelf, 's', 2], [bench, 's', 2], [coatRack, 's', 2], [tree, 's', 2], [beanBag, 'f', 2], [pot, 's', 2]]
const LOBBY = [
  [aquarium, 'w'], [credenza, 'w'], [piano, 'w'], [bike, 'w'], [magazines, 's'], [nook, 's'], [sofaCorner, 'f'], [planter, 's'], [lowShelf, 's'],
  [chessTable, 's'], [tree, 's'], [coatRack, 's'], [beanBag, 'f'], [pot, 's', 2],
]
// A terrace: garden props only, no wall props. GARDEN replaces THIN in its strip round, so no indoor prop stands in the grass.
const TERRACE = [[gardenTree, 's', 4], [bush, 's', 4], [lounger, 'f', 4], [parasol, 's', 2], [pond, 's'], [bench, 's', 2], [planter, 's', 2]]
const GARDEN = [[planter, 's', 2], [bench, 's', 2], [bush, 's', 4], [gardenTree, 's', 4]]

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
