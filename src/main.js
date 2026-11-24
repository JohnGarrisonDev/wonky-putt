// Wonky Putt entry point: wires physics, renderer, input, UI, audio and save data together and owns the game flow.
import { C, makeStore, wireChrome } from '../kit/kit.js'
import { HOLES } from './holes.js'
import { DT, compileHole, createWorld, shoot, step, previewPath } from './physics.js'
import { createRenderer } from './render.js'
import { createInput } from './input.js'
import { createUI } from './ui.js'
import { audio } from './audio.js'
import { makeSave, defaults, strokeLimit, starsFor, resultName, resultQuip, roundMedal, fmtDiff } from './save.js'

const stage = document.getElementById('stage'), canvas = document.getElementById('game')
const save = makeSave(makeStore('wonky-putt', defaults()), HOLES)
save.maxStars = HOLES.length * 3
const R = createRenderer(canvas), fx = R.fx
const TOTAL_PAR = HOLES.reduce((n, h) => n + h.par, 0)
const ATTRACT_HOLE = 8 // the windmill spins behind the title screen

// G: everything about the current session that is not saved
const G = { mode: 'title', kind: 'round', i: 0, comp: null, world: null, sink: 0, respawn: 0, ending: 0, time: 0, final: null, back: null, stepCount: 0 }
const round = () => save.data.round

const ui = createUI(stage, onAction)
const input = createInput(canvas, {
  canAim,
  toLogicalDir: (dx, dy) => R.toLogicalDir(dx, dy),
  defaultAngle: () => Math.atan2(G.comp.cup[1] - G.world.ball.y, G.comp.cup[0] - G.world.ball.x),
  onChange(aim) { aim.path = aim.active ? previewPath(G.world, aim.angle, aim.power) : null },
  onShoot: putt,
})

function canAim() { return G.mode === 'play' && !ui.screen && G.world.state === 'rest' && G.respawn <= 0 && !G.ending && !G.sink }

// ---------- holes
function loadHole(i, kind, resume) {
  G.mode = 'play'; G.kind = kind; G.i = i
  G.comp = compileHole(HOLES[i]); G.world = createWorld(G.comp); G.world.events = []
  G.sink = 0; G.respawn = 0; G.ending = 0
  if (resume && Number.isFinite(resume.x) && Number.isFinite(resume.y) && Number.isFinite(resume.strokes)) {
    const w = G.world
    w.ball.x = w.last.x = resume.x; w.ball.y = w.last.y = resume.y; w.strokes = resume.strokes
    for (const id of resume.open || []) w.open[id] = true
  }
  R.setHole(G.comp); input.cancel(); input.clearKeys()
  ui.hide(); paintHud()
  ui.toast(HOLES[i].hint || '', 5200)
}
function showAttract() {
  G.mode = 'title'
  G.comp = compileHole(HOLES[ATTRACT_HOLE]); G.world = createWorld(G.comp); G.world.events = []
  G.sink = 0; G.respawn = 0; G.ending = 0
  R.setHole(G.comp); input.cancel()
  ui.hud({ show: false }); ui.toast('')
}
function roundDiff() {
  const r = round()
  if (!r) return null
  return r.scores.reduce((n, s, k) => n + s - HOLES[k].par, 0)
}
function paintHud() {
  const hole = HOLES[G.i]
  ui.hud({ show: true, no: G.i + 1, total: HOLES.length, par: hole.par, name: hole.name, strokes: G.world.strokes, round: G.kind === 'round' ? fmtDiff(roundDiff() || 0) : null })
  ui.strokes(G.world.strokes, strokeLimit(hole.par))
}
function saveCursor() {
  if (G.kind !== 'round' || !round()) return
  const w = G.world
  round().cur = w.strokes ? { strokes: w.strokes, x: Math.round(w.ball.x * 10) / 10, y: Math.round(w.ball.y * 10) / 10, open: Object.keys(w.open) } : null
  save.save()
}

// ---------- flow
function titleScreen() {
  showAttract()
  ui.title({ round: round(), stars: save.totalStars(), maxStars: save.maxStars, aces: save.data.aces, bestRound: save.data.bestRound, anyProgress: save.totalStars() > 0 || save.data.aces > 0 })
}
function startRound() {
  save.data.round = { i: 0, scores: [], cur: null, mulligans: 0 }
  save.save()
  loadHole(0, 'round')
}
function putt(angle, power) {
  if (!canAim() || !shoot(G.world, angle, power)) return
  audio.putt(power)
  const b = G.world.ball
  fx.dust(b.x, b.y, 4 + Math.round(power * 6), C.paper, 60 + power * 120, 4)
  fx.squash(Math.cos(angle), Math.sin(angle), 0.4 + power * 0.5)
  ui.toast('')
  ui.strokes(G.world.strokes, strokeLimit(HOLES[G.i].par))
}
function retryHole() {
  const used = G.world.strokes > 0
  if (used && G.kind === 'round' && round()) { round().mulligans = (round().mulligans || 0) + 1; round().cur = null; save.save() }
  loadHole(G.i, G.kind)
  if (used && G.kind === 'round') ui.toast('Mulligan. Back to the tee.', 2600)
}
function finishHole(sunk) {
  const hole = HOLES[G.i], strokes = sunk ? G.world.strokes : strokeLimit(hole.par)
  const rec = save.recordHole(G.i, strokes, sunk)
  let roundLine = '', last = G.i === HOLES.length - 1
  if (G.kind === 'round' && round()) {
    const r = round()
    r.scores.push(strokes); r.i = r.scores.length; r.cur = null
    const total = r.scores.reduce((n, s) => n + s, 0), diff = roundDiff()
    roundLine = `Round so far: ${total} strokes, ${fmtDiff(diff)} after ${r.scores.length}.`
    if (r.i >= HOLES.length) {
      const scores = r.scores.slice(), prevBest = save.data.bestRound
      const isBest = save.recordRound(total)
      G.final = { holes: HOLES, scores, total, par: TOTAL_PAR, medal: roundMedal(total - TOTAL_PAR), isBest, bestRound: isBest ? total : prevBest, mulligans: r.mulligans || 0, aces: scores.filter((s) => s === 1).length }
    } else save.save()
  }
  const ace = sunk && strokes === 1
  if (!ace) { if (sunk) audio.result(strokes - hole.par); else audio.fail() }
  if (rec.newSkins.length) setTimeout(() => audio.unlock(), 500)
  ui.hud({ show: false })
  ui.result({
    kind: G.kind, no: G.i + 1, par: hole.par, name: hole.name, title: resultName(strokes, hole.par, sunk), quip: resultQuip(strokes, hole.par, sunk, G.i + strokes),
    strokes, sunk, stars: sunk ? starsFor(strokes, hole.par) : 0, best: save.best(G.i), newBest: rec.newBest, ace, roundLine, last, newSkins: rec.newSkins,
  })
}
function nextHole() {
  if (G.kind === 'round') {
    if (G.final) { audio.fanfare(); ui.hud({ show: false }); ui.final(G.final); if (G.final.medal.id !== 'tin') fx.confetti(480, 300, 90); return }
    if (round()) loadHole(round().i, 'round', round().cur); else titleScreen()
  } else if (G.i + 1 < HOLES.length) loadHole(G.i + 1, 'practice')
  else titleScreen()
}
function openMenu() {
  if (G.mode !== 'play' || ui.screen) return
  input.cancel()
  const hole = HOLES[G.i]
  ui.menu({ kind: G.kind, no: G.i + 1, name: hole.name, par: hole.par, hint: hole.hint })
}

function onAction(act, arg) {
  audio.click()
  switch (act) {
    case 'menu': openMenu(); break
    case 'resume': ui.hide(); break
    case 'retry': retryHole(); break
    case 'quit': G.final = null; titleScreen(); break
    case 'continue': if (round()) loadHole(round().i, 'round', round().cur); break
    case 'newround':
      if (round() && round().scores.length + (round().cur ? 1 : 0) > 0 && !G.final) ui.confirm({ text: `Start a new round? Your round on hole ${round().i + 1} will be dropped.`, yes: 'Start fresh', act: 'newround!' })
      else { G.final = null; startRound() }
      break
    case 'newround!': G.final = null; startRound(); break
    case 'next': nextHole(); break
    case 'select': { const from = ui.screen === 'menu' ? 'menu' : 'title'; G.final = null; ui.select({ holes: HOLES, save, from }); break }
    case 'skins': ui.skins({ save, from: 'title' }); break
    case 'skin': save.data.skin = arg; save.save(); ui.skins({ save, from: 'title' }); break
    case 'play': G.final = null; loadHole(+arg, 'practice'); break
    case 'back': if (arg === 'menu' && G.mode === 'play') { ui.hide(); openMenu() } else titleScreen(); break
  }
}

// ---------- physics events -> sound and particles
function handleEvents() {
  const w = G.world, ev = w.events, b = w.ball
  for (let k = 0; k < ev.length; k++) {
    const e = ev[k]
    switch (e.type) {
      case 'wall': {
        audio.wall(e.v)
        const sp = Math.hypot(b.vx, b.vy) || 1
        fx.dust(e.x, e.y, 2 + Math.min(6, (e.v / 140) | 0), C.paper, 40 + e.v * 0.2, 3.5)
        fx.squash(b.vx / sp, b.vy / sp, Math.min(1, e.v / 600))
        if (e.v > 620) fx.shake(0.25)
        break
      }
      case 'mover': audio.mover(e.v); fx.dust(e.x, e.y, 5, C.paper, 90, 4); break
      case 'bumper': audio.bumper(); fx.bumper(e.i); fx.ring(e.x, e.y, C.yellow, 54, 0.35); fx.dust(b.x, b.y, 6, C.pink, 140, 4); fx.shake(0.3); break
      case 'splash':
        audio.splash(); fx.ring(e.x, e.y, C.paper, 46, 0.6); fx.ring(e.x, e.y, '#8F8FFF', 28, 0.45); fx.dust(e.x, e.y, 14, C.paper, 170, 5)
        fx.text(e.x, e.y, '+1', C.yellow, 30);
        G.respawn = 0.75
        break
      case 'penalty': ui.strokes(w.strokes, strokeLimit(HOLES[G.i].par)); saveCursor(); break
      case 'reset': ui.toast('Out of bounds. Back you go, no charge.', 2600); G.respawn = 0.4; break
      case 'sand': audio.sand(); fx.spray(e.x, e.y, 12, '#DDB862', b.vx, b.vy, 150); break
      case 'ice': audio.ice(); break
      case 'boost': audio.boost(); fx.spray(e.x, e.y, 12, C.orange, -b.vx, -b.vy, 220); fx.ring(e.x, e.y, C.orange, 40, 0.3); break
      case 'portal': audio.portal(); fx.ring(e.x, e.y, C.paper, 44, 0.4); fx.ring(e.tx, e.ty, C.paper, 54, 0.45); fx.dust(e.tx, e.ty, 8, C.paper, 120, 4); break
      case 'button': audio.button(); fx.ring(e.x, e.y, C.orange, 60, 0.5); ui.toast('Click. The door is open.', 2200); break
      case 'lip': audio.lip(); fx.text(e.x, e.y, 'too fast!', C.paper, 17); break
      case 'sunk': onSunk(); break
      case 'stop': saveCursor(); break
    }
  }
  ev.length = 0
}
function onSunk() {
  const w = G.world, hole = HOLES[G.i], cup = G.comp.cup
  if (G.mode !== 'play') { w.state = 'rest'; return }
  audio.sink(); fx.flag(); fx.ring(cup[0], cup[1], C.paper, 50, 0.5)
  G.sink = 0.0001
  ui.toast('')
  if (w.strokes === 1) { setTimeout(() => audio.ace(), 260); fx.confetti(cup[0], cup[1], 130); fx.text(cup[0], cup[1], 'Hole in one!', C.yellow, 40); fx.shake(0.5) }
  else if (w.strokes < hole.par) fx.confetti(cup[0], cup[1], 44)
  else fx.dust(cup[0], cup[1], 10, C.yellow, 120, 4)
}

// ---------- main loop
let last = 0, acc = 0
function frame(ts) {
  requestAnimationFrame(frame)
  const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000))
  last = ts
  if (document.hidden) return
  update(dt)
  draw(dt)
}
function update(dt) {
  G.time += dt
  const w = G.world
  const frozen = G.mode === 'play' && (ui.screen === 'menu' || ui.screen === 'select' || ui.screen === 'confirm')
  if (!frozen) {
    acc += dt
    while (acc >= DT) {
      acc -= DT
      const was = w.state
      step(w); G.stepCount++
      if (w.state === 'moving') {
        if (G.stepCount % 2 === 0) fx.trail(w.ball.x, w.ball.y)
        if (w.surface === 'sand' && G.stepCount % 5 === 0) fx.spray(w.ball.x, w.ball.y, 1, '#DDB862', -w.ball.vx, -w.ball.vy, 70)
      } else if (G.stepCount % 3 === 0) fx.fadeTrail()
      if (w.events.length) handleEvents()
      if (G.mode === 'title' && was === 'moving' && w.state === 'rest') w.ball.x = G.comp.tee[0], w.ball.y = G.comp.tee[1]
    }
    if (G.mode === 'play') {
      if (G.respawn > 0) { G.respawn -= dt; if (G.respawn <= 0) fx.dust(w.ball.x, w.ball.y, 6, C.paper, 70, 4) }
      if (G.sink) { G.sink += dt; if (G.sink > (w.strokes === 1 ? 2.1 : 1.15) && !ui.screen) finishHole(true) }
      else if (w.state === 'rest' && w.strokes >= strokeLimit(HOLES[G.i].par) && !ui.screen && G.respawn <= 0) { G.ending += dt; if (G.ending > 0.7) finishHole(false) }
    }
  }
  input.update(dt, shiftDown)
}
function draw(dt) {
  const w = G.world
  R.draw({ world: w, aim: G.mode === 'play' ? input.aim : null, skin: save.skin(), sink: G.sink, hideBall: G.sink > 0.32 || G.respawn > 0.2 || (G.mode === 'title') }, G.time, dt)
}

// ---------- keyboard
let shiftDown = false
document.addEventListener('keydown', (e) => {
  shiftDown = e.shiftKey
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (ui.screen) {
    const btns = [...stage.querySelectorAll('.overlay button:not([disabled])')], at = btns.indexOf(document.activeElement)
    if (k === 'Escape') {
      if (ui.screen === 'menu') { onAction('resume'); e.preventDefault() }
      else if (ui.screen === 'select' || ui.screen === 'skins' || ui.screen === 'confirm') { const b = stage.querySelector('.overlay [data-act="back"]'); if (b) b.click(); e.preventDefault() }
    } else if ((k === 'ArrowRight' || k === 'ArrowDown') && btns.length) { btns[(at + 1) % btns.length].focus(); e.preventDefault() }
    else if ((k === 'ArrowLeft' || k === 'ArrowUp') && btns.length) { btns[(at - 1 + btns.length) % btns.length].focus(); e.preventDefault() }
    else if ((k === ' ' || k === 'Enter') && at < 0 && btns.length && stage.contains(document.activeElement) === false && document.activeElement === document.body) {
      const p = stage.querySelector('.overlay .btn.primary') || btns[0]; p.click(); e.preventDefault()
    }
    return
  }
  if (G.mode !== 'play') return
  const t = e.target
  if (t && t !== document.body && t.closest && t.closest('a, button, input, textarea, select') && !stage.contains(t)) return
  if (k === 'Escape' && !input.aim.active || k === 'p') { openMenu(); e.preventDefault(); return }
  if (k === 'r' && !e.repeat) { if (!G.sink) retryHole(); e.preventDefault(); return }
  if (input.keyDown(e)) e.preventDefault()
})
document.addEventListener('keyup', (e) => { shiftDown = e.shiftKey; input.keyUp(e) })
document.addEventListener('visibilitychange', () => { last = performance.now(); acc = 0; input.cancel(); input.clearKeys() })
window.addEventListener('blur', () => input.clearKeys())

// ---------- boot
wireChrome({ stage })
new ResizeObserver(() => R.resize()).observe(stage)
R.resize()
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => R.invalidate())
titleScreen()
requestAnimationFrame((ts) => { last = ts; frame(ts) })

// Debug hook for automated play-testing: only with ?debug in the URL.
if (new URLSearchParams(location.search).has('debug')) {
  window.__game = {
    G, HOLES, save, ui, R,
    goto: (i, kind = 'practice') => loadHole(i, kind),
    shoot: (deg, power) => { putt((deg * Math.PI) / 180, power); return G.world.strokes },
    state: () => ({ mode: G.mode, kind: G.kind, hole: G.i, screen: ui.screen, state: G.world.state, strokes: G.world.strokes, x: Math.round(G.world.ball.x), y: Math.round(G.world.ball.y), t: +G.world.t.toFixed(2) }),
    unlockAll: () => { save.data.unlocked = HOLES.length - 1; save.save() },
    /** Run the game loop for some seconds without waiting for real time (background tabs throttle frames). */
    advance: (seconds) => { for (let n = Math.round(seconds * 60); n > 0; n--) update(1 / 60); draw(1 / 60); return window.__game.state() },
    action: onAction,
  }
}
