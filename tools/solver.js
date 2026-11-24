// Headless solver and hole checker. DOM-free; used by tests/ and by `node tools/solve.mjs`.
// It plays a hole by brute force: try a grid of angles x powers (x a few start times when things move),
// keep the handful of resting spots closest to the cup "as the ball rolls", and repeat for the next stroke.
import { W, H, BALL_R, CUP_R, compileHole, createWorld, cloneWorld, shoot, step, settle, pointInPoly, distToSeg, inZone, shapePoints } from '../src/physics.js'

const CELL = 12, GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL)

/** Rolling distance to the cup for every grid cell (walls and water block, portals link, gates count as open). */
export function distanceField(c) {
  const free = new Uint8Array(GW * GH), dist = new Float32Array(GW * GH).fill(Infinity)
  const solid = c.segs.filter((s) => !s.gate && !s.oneway)
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const x = gx * CELL + CELL / 2, y = gy * CELL + CELL / 2
    if (!pointInPoly(c.green, x, y)) continue
    let ok = true
    for (const s of solid) if (distToSeg(x, y, s.ax, s.ay, s.bx, s.by) < BALL_R + s.r - 1) { ok = false; break }
    if (ok) for (const z of c.zones) if (z.type === 'water' && inZone(z, x, y)) { ok = false; break }
    if (ok) for (const b of c.bumpers) if (Math.hypot(x - b.x, y - b.y) < b.r + BALL_R - 1) { ok = false; break }
    if (ok) free[gy * GW + gx] = 1
  }
  const cell = (x, y) => Math.min(GH - 1, Math.max(0, Math.floor(y / CELL))) * GW + Math.min(GW - 1, Math.max(0, Math.floor(x / CELL)))
  const start = cell(c.cup[0], c.cup[1])
  dist[start] = 0
  let queue = [start]
  const link = new Map()
  for (const p of c.portals) link.set(cell(p.x, p.y), cell(c.portals[p.other].x, c.portals[p.other].y))
  while (queue.length) {
    const next = []
    for (const i of queue) {
      const gx = i % GW, gy = (i / GW) | 0, d = dist[i]
      const visit = (j, cost) => { if (free[j] && dist[j] > d + cost) { dist[j] = d + cost; next.push(j) } }
      if (gx > 0) visit(i - 1, CELL); if (gx < GW - 1) visit(i + 1, CELL); if (gy > 0) visit(i - GW, CELL); if (gy < GH - 1) visit(i + GW, CELL)
      if (link.has(i)) visit(link.get(i), 0)
    }
    queue = next
  }
  const at = (x, y) => {
    let best = dist[cell(x, y)]
    if (best === Infinity) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) best = Math.min(best, dist[cell(x + dx * CELL, y + dy * CELL)] + CELL)
    return best
  }
  return { at, cell }
}

function waitsFor(c, n) {
  if (!c.movers.length) return [0]
  const out = []
  for (let i = 0; i < n; i++) out.push((c.period * i) / n)
  return out
}
function advance(w, seconds) { for (let i = Math.round(seconds * 120); i > 0; i--) step(w); if (w.state === 'moving') settle(w) }

/**
 * Try to finish a hole. Returns { strokes, shots: [{ angle (deg), power, wait (s) }] } or { strokes: Infinity }.
 * angles = number of directions tried per stroke, powers = list of powers, keep = resting spots carried to the next stroke.
 */
export function solveHole(hole, { maxStrokes = hole.par, angles = 180, powers = null, keep = 8, waits = 4 } = {}) {
  const c = compileHole(hole), field = distanceField(c)
  powers = powers || [0.15, 0.22, 0.3, 0.38, 0.46, 0.54, 0.62, 0.7, 0.8, 0.9, 1]
  const waitList = waitsFor(c, waits)
  let frontier = [{ w: createWorld(c), shots: [] }]
  while (frontier.length) {
    const cands = []
    for (const node of frontier) {
      for (const wait of waitList) {
        const base = cloneWorld(node.w)
        if (wait) advance(base, wait)
        if (base.state !== 'rest') continue
        for (let ai = 0; ai < angles; ai++) {
          const deg = (ai * 360) / angles
          for (const power of powers) {
            const w = cloneWorld(base)
            shoot(w, (deg * Math.PI) / 180, power)
            settle(w)
            const shots = [...node.shots, { angle: deg, power, wait }]
            if (w.state === 'sunk') return { strokes: w.strokes, shots }
            if (w.state !== 'rest' || w.strokes >= maxStrokes) continue
            const open = Object.keys(w.open).length
            cands.push({ w, shots, score: field.at(w.ball.x, w.ball.y) + w.strokes * 2000 - open * 300, key: w.strokes + ':' + open + ':' + field.cell(w.ball.x, w.ball.y) })
          }
        }
      }
    }
    cands.sort((a, b) => a.score - b.score)
    const seen = new Set()
    frontier = []
    for (const cand of cands) { if (seen.has(cand.key)) continue; seen.add(cand.key); frontier.push(cand); if (frontier.length >= keep) break }
  }
  return { strokes: Infinity, shots: [] }
}

/** Scan first shots for holes-in-one. Returns { count, tried, best: { angle, power, wait } | null, direct: boolean }.
 *  `direct` is true when simply aiming straight at the cup (any power) goes in: holes after the third should say false. */
export function aceScan(hole, { angleStep = 0.5, powerStep = 0.04, waits = 4 } = {}) {
  const c = compileHole(hole), waitList = waitsFor(c, waits)
  let count = 0, tried = 0, best = null
  const directAngle = Math.atan2(c.cup[1] - c.tee[1], c.cup[0] - c.tee[0])
  let direct = false
  for (const wait of waitList) {
    const base = createWorld(c)
    if (wait) advance(base, wait)
    for (let p = 0.12; p <= 1.0001; p += powerStep) {
      for (let deg = 0; deg < 360; deg += angleStep) {
        const w = cloneWorld(base)
        shoot(w, (deg * Math.PI) / 180, p); settle(w); tried++
        if (w.state === 'sunk' && w.strokes === 1) { count++; if (!best) best = { angle: deg, power: +p.toFixed(2), wait } }
      }
      for (const off of [-0.6, 0, 0.6]) {
        const w = cloneWorld(base)
        shoot(w, directAngle + (off * Math.PI) / 180, p); settle(w)
        if (w.state === 'sunk' && w.strokes === 1) direct = true
      }
    }
  }
  return { count, tried, best, direct }
}

/** Static checks on hole data. Returns a list of problems (empty = fine). */
export function validateHole(hole, index = 0) {
  const errs = [], tag = `hole ${index + 1} "${hole.name}"`
  const bad = (m) => errs.push(`${tag}: ${m}`)
  if (!hole.name) bad('needs a name')
  if (!(hole.par >= 2 && hole.par <= 5)) bad('par must be 2..5')
  if (!Array.isArray(hole.green) || hole.green.length < 3) { bad('needs a green polygon'); return errs }
  for (const p of hole.green) if (p[0] < 40 || p[0] > W - 40 || p[1] < 40 || p[1] > H - 40) bad(`green point ${p} is too close to the field edge (keep 40px for the border)`)
  let c
  try { c = compileHole(hole) } catch (e) { bad('does not compile: ' + e.message); return errs }
  const solid = c.segs.filter((s) => !s.oneway)
  const clearance = (x, y) => { let d = Infinity; for (const s of solid) d = Math.min(d, distToSeg(x, y, s.ax, s.ay, s.bx, s.by) - s.r); return d }
  const inWall = (x, y) => (hole.walls || []).some((wl) => !wl.line && pointInPoly(shapePoints(wl), x, y))
  const spot = (label, x, y, need) => {
    if (!pointInPoly(c.green, x, y)) bad(`${label} is outside the green`)
    else if (inWall(x, y)) bad(`${label} is inside a wall`)
    else if (clearance(x, y) < need) bad(`${label} is within ${need}px of a wall`)
  }
  spot('tee', c.tee[0], c.tee[1], BALL_R + 6)
  spot('cup', c.cup[0], c.cup[1], CUP_R + 6)
  if (Math.hypot(c.tee[0] - c.cup[0], c.tee[1] - c.cup[1]) < 120) bad('tee and cup are too close')
  for (const z of c.zones) {
    if (!['sand', 'water', 'ice', 'slope', 'boost'].includes(z.type)) bad(`unknown zone type ${z.type}`)
    if (z.type === 'water' || z.type === 'sand') for (const [n, p] of [['tee', c.tee], ['cup', c.cup]]) if (inZone(z, p[0], p[1])) bad(`${n} is in ${z.type}`)
  }
  c.bumpers.forEach((b, i) => {
    spot(`bumper ${i}`, b.x, b.y, b.r - 4)
    for (const [n, p] of [['tee', c.tee], ['cup', c.cup]]) if (Math.hypot(b.x - p[0], b.y - p[1]) < b.r + 30) bad(`bumper ${i} crowds the ${n}`)
    c.bumpers.forEach((o, j) => { if (j > i && Math.hypot(b.x - o.x, b.y - o.y) < b.r + o.r + 2 * BALL_R + 4) bad(`bumpers ${i} and ${j} leave no room for the ball between them`) })
  })
  c.portals.forEach((p, i) => {
    spot(`portal end ${i}`, p.x, p.y, 22)
    for (const [n, q] of [['tee', c.tee], ['cup', c.cup]]) if (Math.hypot(p.x - q[0], p.y - q[1]) < 50) bad(`portal end ${i} crowds the ${n}`)
    for (const z of c.zones) if (z.type === 'water' && inZone(z, p.x, p.y)) bad(`portal end ${i} is in water`)
  })
  for (const b of c.buttons) { spot('button', b.x, b.y, 20); if (!(hole.gates || []).some((g) => g.id === b.opens)) bad(`button opens unknown gate "${b.opens}"`) }
  // movers: must not crush the ball against a wall, and must not sweep over the tee or cup
  c.movers.forEach((m, i) => {
    if (m.type === 'spinner') {
      const reach = m.len + m.r
      if (clearance(m.x, m.y) < reach + 2 * BALL_R + 2) bad(`spinner ${i} sweeps within a ball width of a wall (pinch point)`)
      for (const [n, p] of [['tee', c.tee], ['cup', c.cup]]) if (Math.hypot(m.x - p[0], m.y - p[1]) < reach + BALL_R + 6) bad(`spinner ${i} sweeps over the ${n}`)
    } else {
      if (m.fx !== m.tx && m.fy !== m.ty) bad(`slider ${i} must move along one axis`)
      const x0 = Math.min(m.fx, m.tx) - m.hw, x1 = Math.max(m.fx, m.tx) + m.hw, y0 = Math.min(m.fy, m.ty) - m.hh, y1 = Math.max(m.fy, m.ty) + m.hh
      for (const [n, p] of [['tee', c.tee], ['cup', c.cup]]) if (p[0] > x0 - 16 && p[0] < x1 + 16 && p[1] > y0 - 16 && p[1] < y1 + 16) bad(`slider ${i} sweeps over the ${n}`)
      // gap in front of each end of travel
      const horiz = m.fy === m.ty
      for (const end of [[m.fx, m.fy], [m.tx, m.ty]]) {
        const other = end[0] === m.fx && end[1] === m.fy ? [m.tx, m.ty] : [m.fx, m.fy]
        const sx = Math.sign(end[0] - other[0]), sy = Math.sign(end[1] - other[1])
        for (let k = -1; k <= 1; k++) {
          const px = end[0] + sx * m.hw + (horiz ? 0 : k * m.hw), py = end[1] + sy * m.hh + (horiz ? k * m.hh : 0)
          if (!pointInPoly(c.green, px, py) || clearance(px, py) < 2 * BALL_R + 4) bad(`slider ${i} stops within a ball width of a wall (pinch point)`)
        }
      }
    }
  })
  const field = distanceField(c)
  if (field.at(c.tee[0], c.tee[1]) === Infinity) bad('the cup cannot be reached from the tee')
  return errs
}
