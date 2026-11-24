// Wonky Putt physics. DOM-free and deterministic: the game, the solver and the node tests all run this file.
// Fixed timestep (DT). A "world" is one hole in play: compiled geometry + a ball + a clock.
// Units: logical pixels on a 960x600 field, seconds, degrees in hole data (0 = right, 90 = down).

export const W = 960, H = 600
export const BALL_R = 10, CUP_R = 15, PORTAL_R = 17, BUTTON_R = 18
export const DT = 1 / 120
export const MAX_SPEED = 1000      // putt speed at full power
export const SPEED_CAP = 1080      // hard cap, keeps one step (9 px) shorter than the ball radius: no tunnelling
export const SINK_SPEED = 260      // slower than this over the cup: it drops. Faster: it lips out.
export const SURFACES = { grass: { a: 80, k: 0.5 }, sand: { a: 700, k: 3.5 }, ice: { a: 10, k: 0.06 } } // decel = a + k * speed
const STOP_SPEED = 8, STOP_SPEED_ICE = 16, REST_STEPS = 18, MAX_SHOT_TIME = 12
const WALL_E = 0.78, WALL_MU = 0.03, MOVER_E = 0.6, MOVER_PUSH_CAP = 5, BUMPER_KICK = 430, BOOST_SPEED = 620
const RAD = Math.PI / 180

// ---------- geometry helpers
/** Polygon points for a shape given as { rect: [x, y, w, h], rot? } or { poly: [[x, y], ...] }. */
export function shapePoints(s) {
  if (s.poly) return s.poly.map((p) => [p[0], p[1]])
  if (s.rect) {
    const [x, y, w, h] = s.rect
    const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
    if (s.rot) {
      const cx = x + w / 2, cy = y + h / 2, c = Math.cos(s.rot * RAD), sn = Math.sin(s.rot * RAD)
      for (const p of pts) { const dx = p[0] - cx, dy = p[1] - cy; p[0] = cx + dx * c - dy * sn; p[1] = cy + dx * sn + dy * c }
    }
    return pts
  }
  return null
}
export function pointInPoly(pts, x, y) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
export function distToSeg(px, py, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey
  let t = l2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - (ax + ex * t), py - (ay + ey * t))
}
function compileZoneShape(z) {
  if (z.circle) { const [cx, cy, r] = z.circle; return { pts: null, cx, cy, r, minx: cx - r, maxx: cx + r, miny: cy - r, maxy: cy + r } }
  const pts = shapePoints(z)
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9
  for (const p of pts) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]) }
  return { pts, cx: 0, cy: 0, r: 0, minx, maxx, miny, maxy }
}
export function inZone(z, x, y) {
  if (x < z.minx || x > z.maxx || y < z.miny || y > z.maxy) return false
  if (!z.pts) { const dx = x - z.cx, dy = y - z.cy; return dx * dx + dy * dy <= z.r * z.r }
  return pointInPoly(z.pts, x, y)
}

// ---------- compile a hole (data -> fast structures)
/** Turn a hole from src/holes.js into collision segments, zones and object lists. Pure; safe to share between worlds. */
export function compileHole(hole) {
  const segs = []
  // Edges of a closed polygon. (nx, ny) points to the side the ball is allowed on.
  const addPoly = (pts, ballInside, extra) => {
    let s = 0
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1] }
    const sign = (s > 0 ? 1 : -1) * (ballInside ? -1 : 1)
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey)
      if (l < 1e-6) continue
      segs.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], r: 0, nx: (ey / l) * sign, ny: (-ex / l) * sign, gate: null, oneway: false, ...extra })
    }
  }
  const addLine = (l, w, extra) => segs.push({ ax: l[0], ay: l[1], bx: l[2], by: l[3], r: w / 2, nx: 0, ny: 0, gate: null, oneway: false, ...extra })
  addPoly(hole.green, true)
  for (const wl of hole.walls || []) { if (wl.line) addLine(wl.line, wl.w || 16); else addPoly(shapePoints(wl), false) }
  for (const g of hole.gates || []) addLine(g.line, g.w || 12, { gate: g.id })
  for (const o of hole.oneways || []) {
    const [ax, ay, bx, by] = o.line, l = Math.hypot(bx - ax, by - ay)
    // Pass direction: drawn top-to-bottom, the ball may cross left-to-right.
    segs.push({ ax, ay, bx, by, r: 3, nx: (by - ay) / l, ny: -(bx - ax) / l, gate: null, oneway: true })
  }
  const zones = (hole.zones || []).map((z) => {
    const d = (z.dir || 0) * RAD
    return { type: z.type, ...compileZoneShape(z), dx: Math.cos(d), dy: Math.sin(d), force: z.force ?? 260, speed: z.speed ?? BOOST_SPEED }
  })
  const bumpers = (hole.bumpers || []).map((b) => ({ x: b[0], y: b[1], r: b[2] || 26 }))
  const movers = (hole.movers || []).map((m) => m.type === 'spinner'
    ? { type: 'spinner', x: m.at[0], y: m.at[1], len: m.len || 70, arms: m.arms || 4, speed: m.speed ?? 1.2, phase: (m.phase || 0) * RAD, r: (m.w || 14) / 2, hub: m.hub || 13 }
    : { type: 'slider', hw: m.size[0] / 2, hh: m.size[1] / 2, fx: m.from[0], fy: m.from[1], tx: m.to[0], ty: m.to[1], period: m.period || 3, phase: m.phase || 0 })
  const portals = []
  ;(hole.portals || []).forEach((p, i) => {
    const n = portals.length
    portals.push({ x: p.a[0], y: p.a[1], other: n + 1, pair: i, out: p.aOut == null ? null : p.aOut * RAD })
    portals.push({ x: p.b[0], y: p.b[1], other: n, pair: i, out: p.bOut == null ? null : p.bOut * RAD })
  })
  const buttons = (hole.buttons || []).map((b) => ({ x: b.at[0], y: b.at[1], opens: b.opens }))
  const mv = movers.map(() => ({ x: 0, y: 0, vx: 0, vy: 0, ang: 0 }))
  let period = 0
  for (const m of movers) period = Math.max(period, m.type === 'spinner' ? (Math.PI * 2) / Math.abs(m.speed || 1) / m.arms : m.period)
  return { hole, segs, zones, bumpers, movers, mv, portals, buttons, green: hole.green, tee: hole.tee, cup: hole.cup, period }
}

// ---------- world
export function createWorld(holeOrCompiled) {
  const c = holeOrCompiled.segs ? holeOrCompiled : compileHole(holeOrCompiled)
  return {
    c, t: 0, state: 'rest', strokes: 0, shotTime: 0, restCount: 0, portalLock: -1, boostIn: -1, lipped: false, surface: 'grass',
    ball: { x: c.tee[0], y: c.tee[1], vx: 0, vy: 0 }, last: { x: c.tee[0], y: c.tee[1] }, open: {}, events: null,
  }
}
/** Cheap copy for the solver and the aim preview (shares compiled geometry, drops the event list). */
export function cloneWorld(w) {
  return { c: w.c, t: w.t, state: w.state, strokes: w.strokes, shotTime: w.shotTime, restCount: w.restCount, portalLock: w.portalLock, boostIn: w.boostIn, lipped: w.lipped, surface: w.surface,
    ball: { x: w.ball.x, y: w.ball.y, vx: w.ball.vx, vy: w.ball.vy }, last: { x: w.last.x, y: w.last.y }, open: { ...w.open }, events: null, ghost: w.ghost }
}
/** Putt. angle in radians (0 = right, clockwise on screen), power 0..1. Returns false if the ball is not at rest. */
export function shoot(w, angle, power) {
  if (w.state !== 'rest') return false
  const p = Math.min(1, Math.max(0.04, power)), b = w.ball
  w.last.x = b.x; w.last.y = b.y
  b.vx = Math.cos(angle) * MAX_SPEED * p; b.vy = Math.sin(angle) * MAX_SPEED * p
  w.strokes++; w.state = 'moving'; w.shotTime = 0; w.restCount = 0; w.lipped = false
  return true
}

/** Fill c.mv with where every mover is at time t. */
export function updateMovers(c, t) {
  for (let i = 0; i < c.movers.length; i++) {
    const m = c.movers[i], s = c.mv[i]
    if (m.type === 'spinner') { s.ang = m.phase + m.speed * t; s.x = m.x; s.y = m.y }
    else {
      const ph = Math.PI * 2 * (t / m.period + m.phase), u = 0.5 - 0.5 * Math.cos(ph), du = 0.5 * Math.sin(ph) * Math.PI * 2 / m.period
      s.x = m.fx + (m.tx - m.fx) * u; s.y = m.fy + (m.ty - m.fy) * u; s.vx = (m.tx - m.fx) * du; s.vy = (m.ty - m.fy) * du
    }
  }
}

// Push the ball out along (nx, ny) by pen and bounce it off a surface moving at (svx, svy). Returns impact speed.
function bounce(b, nx, ny, pen, svx, svy, e) {
  b.x += nx * pen; b.y += ny * pen
  let rx = b.vx - svx, ry = b.vy - svy
  const vn = rx * nx + ry * ny
  if (vn >= 0) return 0
  rx -= (1 + e) * vn * nx; ry -= (1 + e) * vn * ny
  const tx = -ny, ty = nx, vt = rx * tx + ry * ty
  rx -= WALL_MU * vt * tx; ry -= WALL_MU * vt * ty
  b.vx = rx + svx; b.vy = ry + svy
  return -vn
}
// Ball vs one (possibly thick) segment. Returns impact speed, 0 for a touch, -1 for no contact.
function hitSeg(b, s, e, cap, svOmega, ox, oy) {
  const ex = s.bx - s.ax, ey = s.by - s.ay, l2 = ex * ex + ey * ey
  let t = l2 > 0 ? ((b.x - s.ax) * ex + (b.y - s.ay) * ey) / l2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = s.ax + ex * t, cy = s.ay + ey * t, dx = b.x - cx, dy = b.y - cy, min = BALL_R + s.r, d2 = dx * dx + dy * dy
  if (d2 >= min * min) return -1
  const d = Math.sqrt(d2), oriented = s.nx !== 0 || s.ny !== 0
  let nx, ny, pen
  if (s.oneway) {
    // Solid only from the exit side, and only when the ball is heading back into it.
    if (dx * s.nx + dy * s.ny <= 0 || b.vx * s.nx + b.vy * s.ny >= 0) return -1
    nx = s.nx; ny = s.ny; pen = Math.min(min - d, 3)
  } else if (oriented && t > 0 && t < 1 && dx * s.nx + dy * s.ny < 0) { nx = s.nx; ny = s.ny; pen = min + d } // centre got behind the edge: push back through it
  else if (d > 1e-9) { nx = dx / d; ny = dy / d; pen = min - d }
  else if (oriented) { nx = s.nx; ny = s.ny; pen = min }
  else { const l = Math.sqrt(l2) || 1; nx = -ey / l; ny = ex / l; pen = min }
  if (cap && pen > cap) pen = cap
  let svx = 0, svy = 0
  if (svOmega) { svx = -svOmega * (cy - oy); svy = svOmega * (cx - ox) }
  return bounce(b, nx, ny, pen, svx, svy, e)
}
const arm = { ax: 0, ay: 0, bx: 0, by: 0, r: 0, nx: 0, ny: 0, oneway: false }
// Ball vs sliders and spinners. Pushes are capped so a mover can never shove the ball through a wall; walls are resolved after.
function hitMovers(w) {
  const c = w.c, b = w.ball
  let best = -1
  for (let i = 0; i < c.movers.length; i++) {
    const m = c.movers[i], s = c.mv[i]
    if (m.type === 'slider') {
      const lx = b.x - s.x, ly = b.y - s.y
      const qx = lx < -m.hw ? -m.hw : lx > m.hw ? m.hw : lx, qy = ly < -m.hh ? -m.hh : ly > m.hh ? m.hh : ly
      const dx = lx - qx, dy = ly - qy, d2 = dx * dx + dy * dy
      if (d2 >= BALL_R * BALL_R) continue
      let nx, ny, pen
      if (d2 > 1e-9) { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = BALL_R - d }
      else {
        const px = m.hw - Math.abs(lx), py = m.hh - Math.abs(ly)
        if (px < py) { nx = lx < 0 ? -1 : 1; ny = 0; pen = px + BALL_R } else { nx = 0; ny = ly < 0 ? -1 : 1; pen = py + BALL_R }
      }
      best = Math.max(best, bounce(b, nx, ny, Math.min(pen, MOVER_PUSH_CAP), s.vx, s.vy, MOVER_E))
    } else {
      const dxh = b.x - m.x, dyh = b.y - m.y, reach = m.len + m.r + BALL_R
      if (dxh * dxh + dyh * dyh >= reach * reach) continue
      const dh = Math.hypot(dxh, dyh)
      if (dh < m.hub + BALL_R && dh > 1e-9) best = Math.max(best, bounce(b, dxh / dh, dyh / dh, Math.min(m.hub + BALL_R - dh, MOVER_PUSH_CAP), 0, 0, WALL_E))
      for (let k = 0; k < m.arms; k++) {
        const a = s.ang + (k * Math.PI * 2) / m.arms
        arm.ax = m.x; arm.ay = m.y; arm.bx = m.x + Math.cos(a) * m.len; arm.by = m.y + Math.sin(a) * m.len; arm.r = m.r
        best = Math.max(best, hitSeg(b, arm, MOVER_E, MOVER_PUSH_CAP, m.speed, m.x, m.y))
      }
    }
  }
  return best
}
const emit = (w, type, x, y, v, extra) => { if (w.events) w.events.push({ type, x, y, v: v || 0, ...extra }) }

/** Advance the world by one DT. Game code reads w.events (if set) for sounds and particles and clears it. */
export function step(w) {
  const c = w.c, b = w.ball
  w.t += DT
  if (c.movers.length) updateMovers(c, w.t)
  if (w.state === 'sunk') return
  if (w.state === 'rest') {
    // A mover can sweep a resting ball along: free of charge, no stroke counted.
    if (!c.movers.length || w.ghost || hitMovers(w) < 0) return
    w.state = 'moving'; w.shotTime = 0; w.restCount = 0
  }
  w.shotTime += DT

  // zones under the ball centre
  let surface = 'grass', boost = -1
  for (let i = 0; i < c.zones.length; i++) {
    const z = c.zones[i]
    if (!inZone(z, b.x, b.y)) continue
    if (z.type === 'water') {
      emit(w, 'splash', b.x, b.y, Math.hypot(b.vx, b.vy))
      b.x = w.last.x; b.y = w.last.y; b.vx = 0; b.vy = 0
      w.strokes++; w.state = 'rest'; w.portalLock = -1; w.boostIn = -1; w.surface = 'grass'
      emit(w, 'penalty', b.x, b.y)
      return
    }
    if (z.type === 'sand' || z.type === 'ice') { if (surface !== 'sand') surface = z.type }
    else if (z.type === 'slope') { b.vx += z.dx * z.force * DT; b.vy += z.dy * z.force * DT }
    else if (z.type === 'boost') {
      boost = i
      if (w.boostIn !== i) {
        // a kick along the pad: forward speed jumps to at least z.speed, sideways speed is kept
        const along = b.vx * z.dx + b.vy * z.dy, sp = Math.max(z.speed, Math.min(along + z.speed * 0.5, SPEED_CAP))
        b.vx += z.dx * (sp - along); b.vy += z.dy * (sp - along)
        emit(w, 'boost', b.x, b.y, sp)
      }
    }
  }
  w.boostIn = boost
  if (surface !== w.surface) { if (surface !== 'grass') emit(w, surface, b.x, b.y, Math.hypot(b.vx, b.vy)); w.surface = surface }

  // friction, speed cap, move
  let sp = Math.hypot(b.vx, b.vy)
  const f = SURFACES[surface], dec = (f.a + f.k * sp) * DT
  if (sp <= dec) { b.vx = 0; b.vy = 0; sp = 0 } else { const k = (sp - dec) / sp; b.vx *= k; b.vy *= k; sp -= dec }
  if (sp > SPEED_CAP) { const k = SPEED_CAP / sp; b.vx *= k; b.vy *= k }
  b.x += b.vx * DT; b.y += b.vy * DT

  // portals
  if (w.portalLock >= 0) {
    const p = c.portals[w.portalLock]
    if (Math.hypot(b.x - p.x, b.y - p.y) > PORTAL_R + BALL_R + 2) w.portalLock = -1
  } else {
    for (let i = 0; i < c.portals.length; i++) {
      const p = c.portals[i], dx = b.x - p.x, dy = b.y - p.y
      if (dx * dx + dy * dy >= PORTAL_R * PORTAL_R) continue
      const q = c.portals[p.other]
      let s2 = Math.max(Math.hypot(b.vx, b.vy), 140), a = q.out == null ? Math.atan2(b.vy, b.vx) : q.out
      if (b.vx === 0 && b.vy === 0 && q.out == null) a = 0
      emit(w, 'portal', p.x, p.y, s2, { tx: q.x, ty: q.y, pair: p.pair })
      b.x = q.x; b.y = q.y; b.vx = Math.cos(a) * s2; b.vy = Math.sin(a) * s2
      w.portalLock = p.other
      break
    }
  }

  // collisions: movers first (capped), then bumpers, then static walls twice so walls always win
  if (c.movers.length && !w.ghost) { const v = hitMovers(w); if (v > 40) emit(w, 'mover', b.x, b.y, v) }
  for (let i = 0; i < c.bumpers.length; i++) {
    const bu = c.bumpers[i], dx = b.x - bu.x, dy = b.y - bu.y, min = bu.r + BALL_R, d2 = dx * dx + dy * dy
    if (d2 >= min * min || d2 < 1e-9) continue
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d
    b.x = bu.x + nx * min; b.y = bu.y + ny * min
    const vn = b.vx * nx + b.vy * ny
    if (vn < 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny }
    const out = b.vx * nx + b.vy * ny
    if (out < BUMPER_KICK) { b.vx += nx * (BUMPER_KICK - out); b.vy += ny * (BUMPER_KICK - out) }
    emit(w, 'bumper', bu.x, bu.y, Math.abs(vn), { i })
  }
  for (let pass = 0; pass < 2; pass++) {
    let any = false
    for (let i = 0; i < c.segs.length; i++) {
      const s = c.segs[i]
      if (s.gate && w.open[s.gate]) continue
      const v = hitSeg(b, s, WALL_E, 0, 0, 0, 0)
      if (v >= 0) { any = true; if (v > 30) emit(w, 'wall', b.x, b.y, v) }
    }
    if (!any) break
  }

  // buttons
  for (let i = 0; i < c.buttons.length; i++) {
    const bt = c.buttons[i]
    if (!w.open[bt.opens] && Math.hypot(b.x - bt.x, b.y - bt.y) < BUTTON_R + 4) { w.open[bt.opens] = true; emit(w, 'button', bt.x, bt.y, 0, { id: bt.opens }) }
  }

  // the cup
  sp = Math.hypot(b.vx, b.vy)
  const cdx = c.cup[0] - b.x, cdy = c.cup[1] - b.y, cd = Math.hypot(cdx, cdy)
  if (cd < CUP_R) {
    if (sp < SINK_SPEED || (cd < CUP_R * 0.45 && sp < SINK_SPEED * 1.35)) {
      w.state = 'sunk'; b.vx = 0; b.vy = 0
      emit(w, 'sunk', c.cup[0], c.cup[1], sp)
      return
    }
    // too fast: the rim tugs the ball sideways and it hops out
    if (cd > 1e-6) { b.vx += (cdx / cd) * 2600 * DT; b.vy += (cdy / cd) * 2600 * DT }
    b.vx *= 1 - 1.5 * DT; b.vy *= 1 - 1.5 * DT
    if (!w.lipped) { w.lipped = true; emit(w, 'lip', b.x, b.y, sp) }
  } else {
    w.lipped = false
    if (cd < CUP_R + 4 && sp < 70 && cd > 1e-6) { b.vx += (cdx / cd) * 400 * DT; b.vy += (cdy / cd) * 400 * DT } // a slow ball on the rim topples in
  }

  // safety net: never NaN, never off the green
  if (!(b.x === b.x && b.y === b.y) || ((w.shotTime * 120 | 0) % 8 === 0 && !pointInPoly(c.green, b.x, b.y))) {
    b.x = w.last.x; b.y = w.last.y; b.vx = 0; b.vy = 0; w.state = 'rest'; w.portalLock = -1
    emit(w, 'reset', b.x, b.y)
    return
  }

  // come to rest (slow rolls are cut short so the game never stalls)
  if (sp < (surface === 'ice' ? STOP_SPEED_ICE : STOP_SPEED)) w.restCount++; else w.restCount = 0
  if (w.restCount >= REST_STEPS || w.shotTime > MAX_SHOT_TIME) {
    b.vx = 0; b.vy = 0; w.state = 'rest'
    emit(w, 'stop', b.x, b.y)
  }
}

/** Run until the ball is at rest or sunk. Returns the number of steps taken. For tests and the solver. */
export function settle(w, maxSteps = 120 * 20) {
  let n = 0
  while (w.state === 'moving' && n < maxSteps) { step(w); n++ }
  return n
}

/** Dotted aim preview: the path up to and a little past the first bounce, ignoring movers. Returns [[x, y], ...]. */
export function previewPath(w, angle, power, maxLen = 330) {
  const g = cloneWorld(w)
  g.ghost = true; g.events = []
  if (!shoot(g, angle, power)) return []
  const pts = []
  let len = 0, after = -1, px = g.ball.x, py = g.ball.y
  for (let i = 0; i < 400 && g.state === 'moving'; i++) {
    g.events.length = 0
    step(g)
    len += Math.hypot(g.ball.x - px, g.ball.y - py); px = g.ball.x; py = g.ball.y
    if (i % 3 === 2) pts.push([px, py])
    if (after < 0) { for (const e of g.events) if (e.type === 'wall' || e.type === 'bumper' || e.type === 'portal' || e.type === 'boost') after = 0 }
    else if (++after > 26) break
    if (len > maxLen) break
  }
  return pts
}
