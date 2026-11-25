// Canvas renderer: everything is drawn in code in the flat Oddvale print style.
// The hole lives on a 960x600 logical field. On tall stages the field is rotated 90 degrees (tee at the bottom)
// so the hole fills a portrait phone; anything that must stay upright (faces, flag, text) goes through upright().
import { C, FONT, drawOddFace, fitCanvas } from '../kit/kit.js'
import { W, H, BALL_R, CUP_R, PORTAL_R, BUTTON_R, shapePoints, updateMovers } from './physics.js'

const FELT = '#2FD6A3', FELT_2 = '#27C896', SHADOW = 'rgba(23,19,31,0.32)', SAND = '#F8DE9C', SAND_2 = '#DDB862', ICE = '#DFF5FF', ICE_2 = '#B5E2F6', WATER_2 = '#8F8FFF'
const BOT_COLORS = { yellow: C.yellow, pink: C.pink, blue: C.blue, mint: '#8FF0D0', orange: C.orange }
const PORTAL_COLORS = [C.pink, C.yellow, '#8FF0D0']
export const HUD_H = 46
const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d')
  const ground = document.createElement('canvas'), top = document.createElement('canvas')
  const view = { w: 1, h: 1, dpr: 1, s: 1, ox: 0, oy: 0, portrait: false }
  let comp = null, dirty = true, shake = 0
  const parts = [], trail = []
  const bumperPulse = []
  let squash = 0, squashA = 0, flagWiggle = 0, sv = [5, 7], seedCounter = 1
  const rnd = () => { seedCounter = (seedCounter * 16807) % 2147483647; return seedCounter / 2147483647 }

  function resize() {
    const f = fitCanvas(canvas)
    view.w = f.w; view.h = f.h; view.dpr = f.dpr
    view.portrait = f.h > f.w * 1.05
    const lw = view.portrait ? H : W, lh = view.portrait ? W : H, ah = f.h - HUD_H - 4
    view.s = Math.min(f.w / lw, ah / lh)
    view.ox = (f.w - lw * view.s) / 2; view.oy = HUD_H + 2 + (ah - lh * view.s) / 2
    sv = toLogicalDir(5, 7)
    for (const cv of [ground, top]) { cv.width = canvas.width; cv.height = canvas.height }
    dirty = true
  }
  function applyView(g, sx = 0, sy = 0) {
    const k = view.dpr, s = view.s * k
    if (!view.portrait) g.setTransform(s, 0, 0, s, (view.ox + sx) * k, (view.oy + sy) * k)
    else g.setTransform(0, -s, s, 0, (view.ox + sx) * k, (view.oy + sy) * k + W * s)
  }
  /** Draw fn at logical (x, y) with screen-aligned axes. */
  function upright(g, x, y, fn) { g.save(); g.translate(x, y); if (view.portrait) g.rotate(Math.PI / 2); fn(g); g.restore() }
  function toLogical(clientX, clientY) {
    const r = canvas.getBoundingClientRect(), px = clientX - r.left, py = clientY - r.top
    return view.portrait ? [W - (py - view.oy) / view.s, (px - view.ox) / view.s] : [(px - view.ox) / view.s, (py - view.oy) / view.s]
  }
  /** A screen-space direction as a logical-space direction. */
  function toLogicalDir(dx, dy) { return view.portrait ? [-dy, dx] : [dx, dy] }
  function toScreenDir(dx, dy) { return view.portrait ? [dy, -dx] : [dx, dy] }

  // ---------- paths
  const polyPath = (g, pts, ox = 0, oy = 0) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0] + ox, p[1] + oy) : g.moveTo(p[0] + ox, p[1] + oy))); g.closePath() }
  const zonePath = (g, z) => { if (z.pts) polyPath(g, z.pts); else { g.beginPath(); g.arc(z.cx, z.cy, z.r, 0, 7) } }
  const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, 7) }

  // ---------- static layers
  function buildGround() {
    const g = ground.getContext('2d'), k = view.dpr
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.fillStyle = C.plum; g.fillRect(0, 0, ground.width, ground.height)
    g.fillStyle = C.plum2
    for (let y = 10, row = 0; y < view.h; y += 24, row++) for (let x = (row % 2) * 12 + 6; x < view.w; x += 24) { g.beginPath(); g.arc(x * k, y * k, 1.7 * k, 0, 7); g.fill() }
    if (!comp) return
    // a scatter of print shapes on the table, different for every hole
    seedCounter = 91 + comp.green.length * 977 + Math.round(comp.cup[0] * 13 + comp.cup[1] * 7 + comp.tee[1])
    g.lineCap = 'round'; g.lineJoin = 'round'
    for (let i = 0; i < 22; i++) {
      const x = rnd() * view.w * k, y = (HUD_H + rnd() * (view.h - HUD_H)) * k, sz = (9 + rnd() * 13) * k, rot = rnd() * 6.3
      g.save(); g.translate(x, y); g.rotate(rot)
      g.strokeStyle = g.fillStyle = i % 5 === 4 ? C.line : C.plum2; g.lineWidth = 4 * k
      g.beginPath()
      if (i % 4 === 0) { g.moveTo(-sz, 0); g.lineTo(sz, 0); g.moveTo(0, -sz); g.lineTo(0, sz); g.stroke() }
      else if (i % 4 === 1) { g.arc(0, 0, sz * 0.8, 0, 7); g.stroke() }
      else if (i % 4 === 2) { g.moveTo(-sz, 0); g.quadraticCurveTo(-sz / 2, -sz, 0, 0); g.quadraticCurveTo(sz / 2, sz, sz, 0); g.stroke() }
      else { g.moveTo(0, -sz); g.lineTo(sz * 0.9, sz * 0.7); g.lineTo(-sz * 0.9, sz * 0.7); g.closePath(); g.fill() }
      g.restore()
    }
    applyView(g)
    g.lineJoin = 'round'; g.lineCap = 'round'
    // hard shadow, border, felt
    polyPath(g, comp.green, sv[0] * 1.5, sv[1] * 1.5); g.fillStyle = C.night; g.strokeStyle = C.night; g.lineWidth = 26; g.stroke(); g.fill()
    polyPath(g, comp.green); g.strokeStyle = C.ink; g.lineWidth = 26; g.stroke()
    g.strokeStyle = C.paper; g.lineWidth = 19; g.stroke()
    g.fillStyle = FELT; g.fill()
    g.save(); g.clip()
    g.save(); g.translate(W / 2, H / 2); g.rotate(-0.09); g.fillStyle = FELT_2
    for (let y = -520, r = 0; y < 520; y += 48, r++) for (let x = -720 + (r % 2) * 48; x < 720; x += 96) g.fillRect(x, y, 48, 48)
    g.restore()
    seedCounter = 7 + comp.green.length * 131 + Math.round(comp.cup[0])
    for (const z of comp.zones) {
      if (z.type === 'slope' || z.type === 'boost') {
        zonePath(g, z)
        g.fillStyle = z.type === 'boost' ? C.yellow : z.force >= 800 ? '#F2A07A' : 'rgba(23,19,31,0.13)'; g.fill()
        g.strokeStyle = C.ink; g.lineWidth = z.type === 'boost' ? 3 : 2; g.setLineDash(z.type === 'boost' ? [] : [7, 7]); g.stroke(); g.setLineDash([])
        continue
      }
      zonePath(g, z)
      g.fillStyle = z.type === 'sand' ? SAND : z.type === 'water' ? C.blue : ICE; g.fill()
      g.save(); g.clip()
      if (z.type === 'sand') {
        g.fillStyle = SAND_2
        const n = Math.round(((z.maxx - z.minx) * (z.maxy - z.miny)) / 420)
        for (let i = 0; i < n; i++) { circle(g, z.minx + rnd() * (z.maxx - z.minx), z.miny + rnd() * (z.maxy - z.miny), 1.6 + rnd() * 1.4); g.fill() }
      } else if (z.type === 'water') {
        g.strokeStyle = WATER_2; g.lineWidth = 3
        for (let y = z.miny + 16, r = 0; y < z.maxy; y += 26, r++) for (let x = z.minx - 10 + (r % 2) * 26; x < z.maxx; x += 52) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - 7, x + 16, y); g.quadraticCurveTo(x + 24, y + 7, x + 32, y); g.stroke() }
      } else {
        g.strokeStyle = '#fff'; g.lineWidth = 5
        for (let x = z.minx - (z.maxy - z.miny); x < z.maxx; x += 74) { g.beginPath(); g.moveTo(x, z.maxy); g.lineTo(x + (z.maxy - z.miny), z.miny); g.stroke() }
        g.strokeStyle = ICE_2; g.lineWidth = 2.5
        for (let x = z.minx - (z.maxy - z.miny) + 16; x < z.maxx; x += 74) { g.beginPath(); g.moveTo(x, z.maxy); g.lineTo(x + (z.maxy - z.miny), z.miny); g.stroke() }
      }
      g.restore()
      zonePath(g, z); g.strokeStyle = C.ink; g.lineWidth = 2.5; g.stroke()
    }
    g.restore()
    polyPath(g, comp.green); g.strokeStyle = C.ink; g.lineWidth = 3; g.stroke()
    // tee mat
    g.save(); g.translate(comp.tee[0], comp.tee[1]); g.rotate(-0.08)
    g.fillStyle = 'rgba(23,19,31,0.16)'; g.beginPath(); g.roundRect(-20, -15, 40, 30, 8); g.fill()
    g.fillStyle = C.paper; circle(g, -13, -8, 2.5); g.fill(); circle(g, -13, 8, 2.5); g.fill()
    g.restore()
    // cup
    circle(g, comp.cup[0], comp.cup[1], CUP_R + 2.5); g.fillStyle = C.ink; g.fill()
    circle(g, comp.cup[0], comp.cup[1], CUP_R - 1); g.fillStyle = '#0B0810'; g.fill()
    g.beginPath(); g.arc(comp.cup[0], comp.cup[1], CUP_R - 4, 0.3, 1.9); g.strokeStyle = '#3A2F4D'; g.lineWidth = 3; g.stroke()
  }
  function buildTop() {
    const g = top.getContext('2d')
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, top.width, top.height)
    if (!comp) return
    applyView(g)
    g.lineJoin = 'round'; g.lineCap = 'round'
    const walls = comp.hole.walls || []
    // generated daily holes let walls run past the edge; trim them to the green (plus the border) so nothing pokes out
    if (comp.hole.date) { polyPath(g, comp.green); g.save(); g.lineWidth = 0; g.clip() }
    for (let pass = 0; pass < 2; pass++) for (const wl of walls) {
      if (wl.line) {
        const [x1, y1, x2, y2] = wl.line, w = wl.w || 16
        g.beginPath()
        if (!pass) { g.moveTo(x1 + sv[0], y1 + sv[1]); g.lineTo(x2 + sv[0], y2 + sv[1]); g.strokeStyle = SHADOW; g.lineWidth = w + 2; g.stroke() }
        else { g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokeStyle = C.ink; g.lineWidth = w + 2; g.stroke(); g.strokeStyle = C.paper; g.lineWidth = w - 4; g.stroke() }
      } else {
        const pts = shapePoints(wl)
        if (!pass) { polyPath(g, pts, sv[0], sv[1]); g.fillStyle = SHADOW; g.fill() }
        else { polyPath(g, pts); g.fillStyle = C.paper; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 3; g.stroke() }
      }
    }
    if (comp.hole.date) { g.restore(); polyPath(g, comp.green); g.strokeStyle = C.ink; g.lineWidth = 3; g.stroke() }
  }

  // ---------- dynamic pieces
  function chevrons(g, z, time) {
    g.save()
    polyPath(g, comp.green); g.clip(); zonePath(g, z); g.clip()
    const boost = z.type === 'boost', steep = z.force >= 800
    const gap = boost ? 26 : steep ? 34 : 46, rate = boost ? 90 : steep ? 60 : 34
    const cx = (z.minx + z.maxx) / 2, cy = (z.miny + z.maxy) / 2, R = Math.hypot(z.maxx - z.minx, z.maxy - z.miny) / 2 + gap
    const off = reducedMotion ? 0 : (time * rate) % gap
    g.translate(cx, cy); g.rotate(Math.atan2(z.dy, z.dx))
    g.beginPath()
    for (let u = -R + off, r = 0; u < R; u += gap, r++) for (let v = -R + ((r & 1) ? 20 : 0); v < R; v += 40) { g.moveTo(u - 6, v - 9); g.lineTo(u + 5, v); g.lineTo(u - 6, v + 9) }
    g.strokeStyle = boost ? C.orange : steep ? 'rgba(23,19,31,0.55)' : 'rgba(23,19,31,0.3)'; g.lineWidth = boost ? 6 : 5; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke()
    g.restore()
  }
  function drawBot(g, d, ball, time) {
    const [x, y] = d.bot, col = BOT_COLORS[d.color] || C.yellow
    upright(g, x, y, () => {
      const bob = reducedMotion ? 0 : Math.sin(time * 2 + x) * 1.5
      g.lineJoin = 'round'; g.lineCap = 'round'
      g.fillStyle = C.night; g.beginPath(); g.roundRect(-21 + 4, -20 + 5 + bob, 42, 38, 11); g.fill()
      g.strokeStyle = C.ink; g.lineWidth = 3
      g.beginPath(); g.moveTo(-9, 16); g.lineTo(-9, 25); g.moveTo(9, 16); g.lineTo(9, 25); g.stroke()
      g.beginPath(); g.moveTo(4, -20 + bob); g.lineTo(8, -31 + bob); g.stroke()
      g.fillStyle = C.orange; circle(g, 8, -32 + bob, 4); g.fill(); g.stroke()
      g.fillStyle = col; g.beginPath(); g.roundRect(-21, -20 + bob, 42, 38, 11); g.fill(); g.stroke()
      g.fillStyle = C.paper; g.beginPath(); g.roundRect(-16, -15 + bob, 32, 27, 7); g.fill()
      const sd = toScreenDir(ball.x - x, ball.y - y), l = Math.hypot(sd[0], sd[1]) || 1
      const blink = ((time * 0.6 + x * 0.013) % 3.1) < 0.09
      drawOddFace(g, 0, -1 + bob, 25, { look: (sd[0] / l) * 0.8, lookY: (sd[1] / l) * 0.8, blink })
    })
  }
  function drawPortal(g, p, time) {
    const col = PORTAL_COLORS[p.pair % PORTAL_COLORS.length]
    circle(g, p.x + sv[0] * 0.5, p.y + sv[1] * 0.5, PORTAL_R + 5); g.fillStyle = SHADOW; g.fill()
    circle(g, p.x, p.y, PORTAL_R + 5); g.fillStyle = C.ink; g.fill()
    circle(g, p.x, p.y, PORTAL_R + 2); g.fillStyle = col; g.fill()
    circle(g, p.x, p.y, PORTAL_R - 4); g.fillStyle = C.night; g.fill()
    g.save(); g.translate(p.x, p.y); g.rotate(reducedMotion ? 0 : time * 2.4 * (p.pair % 2 ? -1 : 1))
    g.strokeStyle = col; g.lineWidth = 2.5; g.lineCap = 'round'
    const arms = 2 + (p.pair % 3)
    for (let i = 0; i < arms; i++) { g.rotate((Math.PI * 2) / arms); g.beginPath(); g.arc(0, 0, PORTAL_R - 8, 0, 1.1); g.stroke() }
    g.restore()
  }
  function drawBall(g, st, time) {
    const b = st.world.ball, skin = st.skin
    let scale = 1, x = b.x, y = b.y
    if (st.sink > 0) { const k = Math.min(1, st.sink / 0.3); scale = 1 - k * 0.75; x += (comp.cup[0] - x) * k; y += (comp.cup[1] - y) * k }
    g.save(); g.translate(x, y)
    circle(g, sv[0] * 0.55, sv[1] * 0.55, BALL_R * scale); g.fillStyle = SHADOW; if (st.sink <= 0) g.fill()
    if (squash > 0) { g.rotate(squashA); g.scale(1 - 0.32 * squash, 1 + 0.22 * squash); g.rotate(-squashA) }
    g.scale(scale, scale)
    circle(g, 0, 0, BALL_R); g.fillStyle = skin.fill; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2.2; g.stroke()
    if (skin.shine) { g.beginPath(); g.arc(0, 0, BALL_R - 3.5, 3.6, 4.9); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2; g.lineCap = 'round'; g.stroke() }
    let lx = 0.5, ly = 0.35
    const sp = Math.hypot(b.vx, b.vy)
    if (sp > 20) { const d = toScreenDir(b.vx / sp, b.vy / sp); lx = d[0] * 0.85; ly = d[1] * 0.85 }
    else if (st.aim && st.aim.active) { const d = toScreenDir(Math.cos(st.aim.angle), Math.sin(st.aim.angle)); lx = d[0] * 0.85; ly = d[1] * 0.85 }
    g.restore()
    upright(g, x, y, () => { g.scale(scale, scale); drawOddFace(g, 0, 0.5, 14.5, { look: lx, lookY: ly, ink: skin.ink, eye: skin.eye, blink: ((time * 0.7) % 4.3) < 0.1 && sp < 20 }) })
  }
  function drawAim(g, st) {
    const a = st.aim, b = st.world.ball
    if (!a || !a.active) return
    const dx = Math.cos(a.angle), dy = Math.sin(a.angle), p = a.power
    const col = p < 0.4 ? '#8FF0D0' : p < 0.75 ? C.yellow : C.orange
    // preview dots
    if (a.path) for (let i = 0; i < a.path.length; i++) {
      const q = a.path[i], d = Math.hypot(q[0] - b.x, q[1] - b.y)
      if (d < 26) continue
      circle(g, q[0], q[1], 4.4); g.fillStyle = C.ink; g.fill()
      circle(g, q[0], q[1], 2.6); g.fillStyle = C.paper; g.fill()
    }
    // pull-back band
    const pull = 16 + p * 62
    g.lineCap = 'round'
    g.beginPath(); g.moveTo(b.x - dx * 12, b.y - dy * 12); g.lineTo(b.x - dx * pull, b.y - dy * pull)
    g.strokeStyle = C.ink; g.lineWidth = 8; g.stroke(); g.strokeStyle = C.paper; g.lineWidth = 4; g.stroke()
    circle(g, b.x - dx * pull, b.y - dy * pull, 8); g.fillStyle = col; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2.5; g.stroke()
    // power arrow
    const len = 24 + p * 86, tx = b.x + dx * (len + 14), ty = b.y + dy * (len + 14), nx = -dy, ny = dx
    g.beginPath()
    g.moveTo(b.x + dx * 16 + nx * 4, b.y + dy * 16 + ny * 4); g.lineTo(b.x + dx * len + nx * 5, b.y + dy * len + ny * 5); g.lineTo(b.x + dx * len + nx * 12, b.y + dy * len + ny * 12)
    g.lineTo(tx, ty)
    g.lineTo(b.x + dx * len - nx * 12, b.y + dy * len - ny * 12); g.lineTo(b.x + dx * len - nx * 5, b.y + dy * len - ny * 5); g.lineTo(b.x + dx * 16 - nx * 4, b.y + dy * 16 - ny * 4)
    g.closePath(); g.lineJoin = 'round'; g.fillStyle = col; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2.5; g.stroke()
  }

  function draw(st, time, dt) {
    if (dirty) { buildGround(); buildTop(); dirty = false }
    const k = view.dpr
    let sx = 0, sy = 0
    if (shake > 0 && !reducedMotion) { sx = (Math.random() - 0.5) * shake * 6; sy = (Math.random() - 0.5) * shake * 6; shake = Math.max(0, shake - dt * 5) }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(ground, Math.round(sx * k), Math.round(sy * k))
    if (!comp) return
    const g = ctx, w = st.world, b = w.ball
    applyView(g, sx, sy)
    g.lineJoin = 'round'; g.lineCap = 'round'
    for (const z of comp.zones) if (z.type === 'slope' || z.type === 'boost') chevrons(g, z, time)
    for (const d of comp.hole.decor || []) drawBot(g, d, b, time)
    // buttons, gates, one-ways
    for (const bt of comp.buttons) {
      const down = !!w.open[bt.opens]
      circle(g, bt.x, bt.y, BUTTON_R + 3); g.fillStyle = C.ink; g.fill()
      circle(g, bt.x, bt.y, BUTTON_R); g.fillStyle = C.paper; g.fill()
      if (!down) { circle(g, bt.x + sv[0] * 0.4, bt.y + sv[1] * 0.4, BUTTON_R - 5); g.fillStyle = C.ink; g.fill() }
      circle(g, bt.x, bt.y, BUTTON_R - 5); g.fillStyle = down ? '#8FF0D0' : C.orange; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2.5; g.stroke()
    }
    for (const gt of comp.hole.gates || []) {
      const [x1, y1, x2, y2] = gt.line, wd = gt.w || 12
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2)
      if (w.open[gt.id]) { g.strokeStyle = 'rgba(23,19,31,0.35)'; g.lineWidth = 3; g.setLineDash([4, 9]); g.stroke(); g.setLineDash([]) }
      else {
        g.strokeStyle = C.ink; g.lineWidth = wd + 3; g.stroke(); g.strokeStyle = C.pink; g.lineWidth = wd - 2; g.stroke()
        g.strokeStyle = C.ink; g.lineWidth = wd - 2; g.lineCap = 'butt'; g.setLineDash([5, 11]); g.stroke(); g.setLineDash([]); g.lineCap = 'round'
      }
    }
    for (const o of comp.hole.oneways || []) {
      const [x1, y1, x2, y2] = o.line, l = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / l, uy = (y2 - y1) / l, nx = uy, ny = -ux
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokeStyle = C.ink; g.lineWidth = 4; g.stroke()
      const n = Math.max(2, Math.floor(l / 26)), wob = reducedMotion ? 0 : Math.sin(time * 5) * 1.5
      for (let i = 0; i < n; i++) {
        const t = ((i + 0.5) / n) * l, px = x1 + ux * t + nx * wob, py = y1 + uy * t + ny * wob
        g.beginPath(); g.moveTo(px + nx * 11, py + ny * 11); g.lineTo(px - nx * 5 + ux * 9, py - ny * 5 + uy * 9); g.lineTo(px - nx * 5 - ux * 9, py - ny * 5 - uy * 9); g.closePath()
        g.fillStyle = C.yellow; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2.5; g.stroke()
      }
    }
    for (const p of comp.portals) drawPortal(g, p, time)
    // trail
    for (let i = 0; i < trail.length; i++) { const t = trail[i]; circle(g, t[0], t[1], BALL_R * (0.25 + 0.6 * (i / trail.length))); g.fillStyle = st.skin.trail; g.globalAlpha = 0.5 * (i / trail.length); g.fill() }
    g.globalAlpha = 1
    // static walls
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(top, Math.round(sx * k), Math.round(sy * k)); applyView(g, sx, sy)
    // bumpers
    comp.bumpers.forEach((bu, i) => {
      const pulse = bumperPulse[i] || 0, r = bu.r * (1 + 0.16 * pulse)
      if (pulse > 0) bumperPulse[i] = Math.max(0, pulse - dt * 5)
      circle(g, bu.x + sv[0], bu.y + sv[1], bu.r); g.fillStyle = SHADOW; g.fill()
      circle(g, bu.x, bu.y, r); g.fillStyle = pulse > 0.4 ? C.yellow : C.pink; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 3; g.stroke()
      circle(g, bu.x, bu.y, r * 0.68); g.fillStyle = C.paper; g.fill(); g.lineWidth = 2; g.stroke()
      upright(g, bu.x, bu.y, () => drawOddFace(g, 0, 0, r * 0.95, { look: pulse > 0.2 ? 0 : 0.5, lookY: pulse > 0.2 ? 0 : 0.4, blink: pulse > 0.5 }))
    })
    // movers
    updateMovers(comp, w.t)
    comp.movers.forEach((m, i) => {
      const s = comp.mv[i]
      if (m.type === 'slider') {
        g.fillStyle = SHADOW; g.beginPath(); g.roundRect(s.x - m.hw + sv[0], s.y - m.hh + sv[1], m.hw * 2, m.hh * 2, 7); g.fill()
        g.fillStyle = C.blue; g.beginPath(); g.roundRect(s.x - m.hw, s.y - m.hh, m.hw * 2, m.hh * 2, 7); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 3; g.stroke()
        const fs = Math.min(m.hw, m.hh) * 1.5
        upright(g, s.x, s.y, () => { g.fillStyle = C.paper; g.beginPath(); g.roundRect(-fs * 0.62, -fs * 0.6, fs * 1.24, fs * 1.2, 6); g.fill(); drawOddFace(g, 0, 0, fs, { look: 0.3, lookY: 0.6 }) })
      } else {
        for (let pass = 0; pass < 2; pass++) for (let a = 0; a < m.arms; a++) {
          const an = s.ang + (a * Math.PI * 2) / m.arms, ex = m.x + Math.cos(an) * m.len, ey = m.y + Math.sin(an) * m.len
          g.beginPath()
          if (!pass) { g.moveTo(m.x + sv[0], m.y + sv[1]); g.lineTo(ex + sv[0], ey + sv[1]); g.strokeStyle = SHADOW; g.lineWidth = m.r * 2 + 2; g.stroke() }
          else { g.moveTo(m.x, m.y); g.lineTo(ex, ey); g.strokeStyle = C.ink; g.lineWidth = m.r * 2 + 2; g.stroke(); g.strokeStyle = a % 2 ? C.paper : C.orange; g.lineWidth = m.r * 2 - 4; g.stroke() }
        }
        circle(g, m.x, m.y, m.hub); g.fillStyle = C.ink; g.fill()
        circle(g, m.x, m.y, m.hub - 5); g.fillStyle = C.yellow; g.fill()
      }
    })
    // ball
    if (squash > 0) squash = Math.max(0, squash - dt * 7)
    if (!st.hideBall) drawBall(g, st, time)
    // flag (upright, drawn over the ball so the cup always reads)
    if (flagWiggle > 0) flagWiggle = Math.max(0, flagWiggle - dt * 0.9)
    upright(g, comp.cup[0], comp.cup[1], () => {
      const wig = reducedMotion ? 0 : Math.sin(time * 26) * flagWiggle * 0.3, lift = st.sink > 0 ? Math.min(1, st.sink / 0.25) * 10 : 0
      g.rotate(0.06 + wig); g.translate(0, -lift)
      g.strokeStyle = C.ink; g.lineWidth = 3.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -52); g.stroke()
      const wave = reducedMotion ? 0 : Math.sin(time * 4) * 3
      g.beginPath(); g.moveTo(0, -52); g.quadraticCurveTo(16, -52 + wave, 30, -43 + wave * 0.5); g.quadraticCurveTo(16, -36 - wave, 0, -32); g.closePath()
      g.fillStyle = C.orange; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2.5; g.lineJoin = 'round'; g.stroke()
    })
    // particles
    const grav = toLogicalDir(0, 1)
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      p.life -= dt
      if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue }
      const t = p.life / p.max
      p.vx += grav[0] * p.g * dt; p.vy += grav[1] * p.g * dt
      p.x += p.vx * dt; p.y += p.vy * dt
      if (p.k === 0) { circle(g, p.x, p.y, p.size * (0.3 + 0.7 * t)); g.fillStyle = p.color; g.globalAlpha = Math.min(1, t * 2); g.fill(); g.globalAlpha = 1 }
      else if (p.k === 1) { p.rot += p.vr * dt; g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.color; g.globalAlpha = Math.min(1, t * 3); g.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size); g.restore(); g.globalAlpha = 1 }
      else if (p.k === 2) { circle(g, p.x, p.y, p.size * (1 - t) + 4); g.strokeStyle = p.color; g.lineWidth = 1 + 4 * t; g.globalAlpha = t; g.stroke(); g.globalAlpha = 1 }
      else upright(g, p.x, p.y, () => { g.font = `800 ${p.size}px ${FONT.display}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.globalAlpha = Math.min(1, t * 2.5); g.strokeStyle = C.ink; g.lineWidth = 5; g.strokeText(p.str, 0, 0); g.fillStyle = p.color; g.fillText(p.str, 0, 0); g.globalAlpha = 1 })
    }
    drawAim(g, st)
  }

  // ---------- effects API (logical coordinates)
  const add = (p) => { if (parts.length < 420) parts.push(p) }
  const fx = {
    dust(x, y, n, color, speed = 90, size = 5) { for (let i = 0; i < n; i++) { const a = Math.random() * 7, s = speed * (0.3 + Math.random() * 0.7); add({ k: 0, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.3, max: 0.6, size: size * (0.6 + Math.random() * 0.6), color, g: 0 }) } },
    spray(x, y, n, color, dx, dy, speed = 160) { for (let i = 0; i < n; i++) { const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.6, s = speed * (0.3 + Math.random() * 0.8); add({ k: 0, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.3, max: 0.65, size: 3 + Math.random() * 3, color, g: 0 }) } },
    ring(x, y, color, size = 40, life = 0.5) { add({ k: 2, x, y, vx: 0, vy: 0, life, max: life, size, color, g: 0 }) },
    confetti(x, y, n) { const cols = [C.orange, C.yellow, C.pink, C.blue, C.paper]; const up = toLogicalDir(0, -1); for (let i = 0; i < n; i++) { const a = Math.random() * 7, s = 80 + Math.random() * 260; add({ k: 1, x, y, vx: Math.cos(a) * s + up[0] * 220, vy: Math.sin(a) * s + up[1] * 220, life: 1.2 + Math.random() * 1.1, max: 2.3, size: 4 + Math.random() * 4, color: cols[i % cols.length], rot: Math.random() * 7, vr: (Math.random() - 0.5) * 16, g: 520 }) } },
    text(x, y, str, color = C.yellow, size = 30) { const up = toLogicalDir(0, -1); add({ k: 3, x, y, vx: up[0] * 46, vy: up[1] * 46, life: 1.1, max: 1.1, size, color, str, g: 0 }) },
    squash(nx, ny, amount) { if (reducedMotion) return; squash = Math.min(1, amount); squashA = Math.atan2(ny, nx) },
    bumper(i) { bumperPulse[i] = 1 },
    flag() { flagWiggle = 1 },
    shake(a) { shake = Math.min(1, Math.max(shake, a)) },
    trail(x, y) { trail.push([x, y]); if (trail.length > 12) trail.shift() },
    fadeTrail() { if (trail.length) trail.shift() },
    clear() { parts.length = 0; trail.length = 0; squash = 0; flagWiggle = 0; bumperPulse.length = 0 },
  }

  return { resize, draw, fx, view, toLogical, toLogicalDir, toScreenDir, setHole(c) { comp = c; dirty = true; fx.clear() }, invalidate() { dirty = true } }
}
