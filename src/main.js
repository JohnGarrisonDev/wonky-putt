// Wonky Putt entry point: wires physics, renderer, input, UI, audio and save data together and owns the game flow.
import { C, makeStore, wireChrome, haptic } from '../kit/kit.js'
import { dailyTalk, tellUs } from '../kit/talk.js'
import { HOLES } from './holes.js'
import { DT, compileHole, createWorld, shoot, step, previewPath } from './physics.js'
import { createRenderer } from './render.js'
import { createInput } from './input.js'
import { createUI } from './ui.js'
import { audio } from './audio.js'
import { makeSave, defaults, strokeLimit, starsFor, resultName, resultQuip, roundMedal, fmtDiff } from './save.js'
import { dailyHole, dateKey, daysBetween, isDateKey, streakInfo, recentDays, shareText, shortDate, weekday, WEEKDAYS, DAY_PLAN } from './daily.js'

const stage = document.getElementById('stage'), canvas = document.getElementById('game')
const save = makeSave(makeStore('wonky-putt', defaults()), HOLES)
save.maxStars = HOLES.length * 3
const R = createRenderer(canvas), fx = R.fx
const TOTAL_PAR = HOLES.reduce((n, h) => n + h.par, 0)
const ATTRACT_HOLE = 8 // the windmill spins behind the title screen
const DEBUG = new URLSearchParams(location.search).has('debug')

// G: everything about the current session that is not saved.
// kind: 'round' | 'practice' (the course) | 'daily' (the official try) | 'dailyPractice'
const G = { mode: 'title', kind: 'round', i: 0, hole: null, date: null, comp: null, world: null, sink: 0, respawn: 0, ending: 0, time: 0, final: null, stepCount: 0, today: null }
const round = () => save.data.round
const daily = () => save.data.daily
const isDaily = () => G.kind === 'daily' || G.kind === 'dailyPractice'
const today = () => G.today || dateKey()
let dailyCache = null
const dailyFor = (key) => (dailyCache && dailyCache.date === key ? dailyCache : (dailyCache = dailyHole(key)))

const ui = createUI(stage, onAction)
let cancelHint = false
const input = createInput(canvas, {
  canAim,
  toLogicalDir: (dx, dy) => R.toLogicalDir(dx, dy),
  defaultAngle: () => Math.atan2(G.comp.cup[1] - G.world.ball.y, G.comp.cup[0] - G.world.ball.x),
  onChange(aim) {
    aim.path = aim.active ? previewPath(G.world, aim.angle, aim.power) : null
    if (aim.back !== cancelHint) { cancelHint = aim.back; ui.toast(aim.back ? 'Let go here to cancel.' : '', 0) }
  },
  onCancel() { ui.toast('Putt cancelled.', 1400) },
  onShoot: putt,
})

function canAim() { return G.mode === 'play' && !ui.screen && G.world.state === 'rest' && G.respawn <= 0 && !G.ending && !G.sink }

// ---------- holes
function setupHole(hole, kind, resume) {
  G.mode = 'play'; G.kind = kind; G.hole = hole
  G.comp = compileHole(hole); G.world = createWorld(G.comp); G.world.events = []
  G.sink = 0; G.respawn = 0; G.ending = 0
  if (resume && Number.isFinite(resume.x) && Number.isFinite(resume.y) && Number.isFinite(resume.strokes)) {
    const w = G.world
    w.ball.x = w.last.x = resume.x; w.ball.y = w.last.y = resume.y; w.strokes = resume.strokes
    for (const id of resume.open || []) w.open[id] = true
  }
  ui.hide(); paintHud(); fit()
  R.setHole(G.comp); input.cancel(); input.clearKeys()
  const resumed = resume && resume.strokes > 0
  ui.toast(kind === 'daily' && resumed ? `Welcome back. Stroke ${resume.strokes + 1} of your official try.` : kind === 'daily' ? `Official try. ${hole.hint}` : hole.hint || '', 5200)
}
function loadHole(i, kind, resume) { G.i = i; G.date = null; setupHole(HOLES[i], kind, resume) }
function loadDaily(key, kind, resume) { G.date = key; setupHole(dailyFor(key), kind, resume) }
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
  const hole = G.hole
  if (isDaily()) ui.hud({ show: true, label: `Daily · ${shortDate(G.date)} · Par ${hole.par}`, name: hole.name, strokes: G.world.strokes, round: G.kind === 'daily' ? 'Official' : 'Practice', chip: 'Daily' })
  else ui.hud({ show: true, no: G.i + 1, total: HOLES.length, par: hole.par, name: hole.name, strokes: G.world.strokes, round: G.kind === 'round' ? fmtDiff(roundDiff() || 0) : null })
  ui.strokes(G.world.strokes, strokeLimit(hole.par))
}
/** Save where the ball is, so a reload resumes the round or the official daily try. */
function saveCursor() {
  const w = G.world
  if (G.kind === 'daily') {
    if (daily().history[G.date] || G.sink) return
    daily().cur = { date: G.date, strokes: w.strokes, x: Math.round(w.ball.x * 10) / 10, y: Math.round(w.ball.y * 10) / 10 }
    save.save()
    return
  }
  if (G.kind !== 'round' || !round()) return
  round().cur = w.strokes ? { strokes: w.strokes, x: Math.round(w.ball.x * 10) / 10, y: Math.round(w.ball.y * 10) / 10, open: Object.keys(w.open) } : null
  save.save()
}

// ---------- flow
function dailyTitleInfo() {
  const key = today(), dl = daily(), rec = dl.history[key], st = streakInfo(dl.history, key)
  const streak = st.current ? ` · ${st.current}-day streak` : ''
  if (dl.cur && !dl.history[dl.cur.date]) {
    const past = dl.cur.date !== key
    return { label: past ? 'Finish yesterday’s daily' : 'Continue daily', status: `${past ? shortDate(dl.cur.date) + ' · ' : ''}official try in progress · ${dl.cur.strokes} ${dl.cur.strokes === 1 ? 'stroke' : 'strokes'}`, todo: true }
  }
  if (rec) return { label: 'Daily hole <small>done</small>', status: `Today: ${rec.k ? `${resultName(rec.s, rec.p).replace(/!$/, '')} in ${rec.s}` : 'not holed'}${streak} · new hole at midnight`, todo: false }
  const hole = dailyFor(key)
  return { label: 'Daily hole', status: `${shortDate(key)}: “${hole.name}” · par ${hole.par}${streak}`, todo: true }
}
function titleScreen() {
  showAttract()
  ui.title({ round: round(), stars: save.totalStars(), maxStars: save.maxStars, aces: save.data.aces, bestRound: save.data.bestRound, anyProgress: save.totalStars() > 0 || save.data.aces > 0, daily: dailyTitleInfo() })
}
function startRound() {
  save.data.round = { i: 0, scores: [], cur: null, mulligans: 0 }
  save.save()
  loadHole(0, 'round')
}
function openDaily() {
  const key = today(), dl = daily()
  if (dl.cur && !dl.history[dl.cur.date]) { loadDaily(dl.cur.date, 'daily', dl.cur); return }
  if (dl.history[key]) { showDailyCard(key, false); return }
  const hole = dailyFor(key), plan = DAY_PLAN[weekday(key)]
  G.date = key
  ui.dailyIntro({ date: shortDate(key), dayName: WEEKDAYS[weekday(key)], dayLabel: `a ${plan.label} one`, name: hole.name, par: hole.par, hint: hole.hint, streak: streakInfo(dl.history, key) })
}
function showDailyCard(key, fresh) {
  G.date = key
  const dl = daily(), rec = dl.history[key]
  if (!rec) { openDaily(); return }
  const st = streakInfo(dl.history, today())
  const pr = dl.practice && dl.practice.date === key ? dl.practice.best : 0
  if (G.mode === 'play' && !fresh) showAttract()
  ui.hud({ show: false })
  const slot = ui.dailyCard({ date: key, name: dailyFor(key).name, rec, streak: { current: st.current, best: Math.max(st.best, dl.bestStreak) }, days: recentDays(dl.history, today(), 7), fresh, practiceBest: pr, isToday: key === today() })
  // Anonymous difficulty vote and "you beat N%": today's official result only (or yesterday's, right after finishing it).
  // Score is the official strokes (the stroke limit when not holed); fewer is better. Fills in after; hidden if the API is off.
  const age = daysBetween(key, today())
  if (age === 0 || (age === 1 && fresh)) dailyTalk(slot, { game: 'wonky-putt', key, score: rec.s, compact: true })
}
/** Write the official result (once). Called the moment the ball drops, so a reload during the celebration loses nothing. */
function recordOfficial(sunk) {
  const dl = daily()
  if (G.kind !== 'daily' || dl.history[G.date]) return
  save.recordDaily(G.date, sunk ? G.world.strokes : strokeLimit(G.hole.par), G.hole.par, sunk)
  const st = streakInfo(dl.history, G.date)
  if (st.best > dl.bestStreak) { dl.bestStreak = st.best; save.save() }
}
function putt(angle, power) {
  if (!canAim() || !shoot(G.world, angle, power)) return
  audio.putt(power); haptic(10)
  const b = G.world.ball
  fx.dust(b.x, b.y, 4 + Math.round(power * 6), C.paper, 60 + power * 120, 4)
  fx.squash(Math.cos(angle), Math.sin(angle), 0.4 + power * 0.5)
  ui.toast('')
  ui.strokes(G.world.strokes, strokeLimit(G.hole.par))
  // The official try counts the stroke the moment it is taken: reloading mid-roll puts the ball back where it was hit.
  if (G.kind === 'daily' && !daily().history[G.date]) { daily().cur = { date: G.date, strokes: G.world.strokes, x: G.world.last.x, y: G.world.last.y }; save.save() }
}
function retryHole() {
  if (G.kind === 'daily') { ui.toast('No restarts on the official try. Practise once it is done.', 2600); return }
  if (G.kind === 'dailyPractice') { loadDaily(G.date, 'dailyPractice'); return }
  const used = G.world.strokes > 0
  if (used && G.kind === 'round' && round()) { round().mulligans = (round().mulligans || 0) + 1; round().cur = null; save.save() }
  loadHole(G.i, G.kind)
  if (used && G.kind === 'round') ui.toast('Mulligan. Back to the tee.', 2600)
}
function finishDaily(sunk) {
  const hole = G.hole, strokes = sunk ? G.world.strokes : strokeLimit(hole.par)
  if (sunk) audio.result(strokes - hole.par); else audio.fail()
  ui.hud({ show: false })
  if (G.kind === 'daily') { recordOfficial(sunk); showDailyCard(G.date, true); return }
  const dl = daily(), prev = dl.practice && dl.practice.date === G.date ? dl.practice.best : 0
  const newBest = sunk && (!prev || strokes < prev)
  if (newBest) { dl.practice = { date: G.date, best: strokes }; save.save() }
  ui.practiceResult({ name: hole.name, par: hole.par, strokes, sunk, best: newBest ? strokes : prev, newBest, official: dl.history[G.date] || null })
}
function finishHole(sunk) {
  if (isDaily()) { finishDaily(sunk); return }
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
  const hole = G.hole
  ui.menu({ kind: G.kind, no: G.i + 1, name: hole.name, par: hole.par, hint: hole.hint })
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { /* fall through to the old way */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-99px;top:0;width:1px;height:1px;opacity:0'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy'); ta.remove()
    return ok
  } catch { return false }
}
function copyResult() {
  const key = G.date, rec = key && daily().history[key]
  if (!rec) return
  const text = shareText(key, dailyFor(key).name, rec, resultName(rec.s, rec.p, rec.k === 1))
  G.lastShare = text
  copyText(text).then((ok) => ui.copied(ok, text))
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
    case 'daily': G.final = null; openDaily(); break
    case 'teeoff': if (isDateKey(G.date) && !daily().history[G.date]) loadDaily(G.date, 'daily'); else openDaily(); break
    case 'dailycard': showDailyCard(G.date, false); break
    case 'practise': if (G.date) loadDaily(G.date, 'dailyPractice'); break
    case 'copy': copyResult(); break
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
        audio.splash(); haptic(40); fx.ring(e.x, e.y, C.paper, 46, 0.6); fx.ring(e.x, e.y, '#8F8FFF', 28, 0.45); fx.dust(e.x, e.y, 14, C.paper, 170, 5)
        fx.text(e.x, e.y, '+1', C.yellow, 30);
        G.respawn = 0.75
        break
      case 'penalty': ui.strokes(w.strokes, strokeLimit(G.hole.par)); saveCursor(); break
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
  const w = G.world, hole = G.hole, cup = G.comp.cup
  if (G.mode !== 'play') { w.state = 'rest'; return }
  if (G.kind === 'daily') recordOfficial(true)
  audio.sink(); haptic([15, 60, 15]); fx.flag(); fx.ring(cup[0], cup[1], C.paper, 50, 0.5)
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
      else if (w.state === 'rest' && w.strokes >= strokeLimit(G.hole.par) && !ui.screen && G.respawn <= 0) { G.ending += dt; if (G.ending > 0.7) finishHole(false) }
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
      else if (['select', 'skins', 'confirm', 'dailyintro', 'dailycard'].includes(ui.screen)) { const b = stage.querySelector('.overlay [data-act="back"]'); if (b) b.click(); e.preventDefault() }
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
tellUs(document.getElementById('tell-us'), { game: 'wonky-putt', issueUrl: 'https://github.com/JohnGarrisonDev/wonky-putt/issues/new?template=feedback.yml' })
/** Re-fit the canvas under the real HUD height (taller on touch screens, plus the notch in full screen). */
function fit() {
  const hud = stage.querySelector('.hud'), c = canvas.getBoundingClientRect()
  if (hud && !hud.hidden) R.view.top = Math.max(8, Math.round(hud.getBoundingClientRect().bottom - c.top))
  R.resize()
}
new ResizeObserver(fit).observe(stage)
fit()
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => R.invalidate())
if (DEBUG) { const d = new URLSearchParams(location.search).get('date'); if (isDateKey(d)) G.today = d }
titleScreen()
requestAnimationFrame((ts) => { last = ts; frame(ts) })

// Debug hook for automated play-testing: only with ?debug in the URL (add &date=YYYY-MM-DD to pretend it is another day).
if (DEBUG) {
  window.__game = {
    G, HOLES, save, ui, R,
    goto: (i, kind = 'practice') => loadHole(i, kind),
    daily: (key = today(), kind = 'daily') => { G.final = null; if (kind === 'daily') openDaily(); else loadDaily(key, kind) },
    dailyHole: (key = today()) => dailyFor(key),
    setToday: (key) => { G.today = isDateKey(key) ? key : null; dailyCache = null; return today() },
    shoot: (deg, power) => { putt((deg * Math.PI) / 180, power); return G.world.strokes },
    state: () => ({ mode: G.mode, kind: G.kind, hole: G.i, date: G.date, screen: ui.screen, state: G.world.state, strokes: G.world.strokes, x: Math.round(G.world.ball.x), y: Math.round(G.world.ball.y), t: +G.world.t.toFixed(2) }),
    unlockAll: () => { save.data.unlocked = HOLES.length - 1; save.save() },
    /** Run the game loop for some seconds without waiting for real time (background tabs throttle frames). */
    advance: (seconds) => { for (let n = Math.round(seconds * 60); n > 0; n--) update(1 / 60); draw(1 / 60); return window.__game.state() },
    action: onAction,
    lastShare: () => G.lastShare || null,
  }
}
