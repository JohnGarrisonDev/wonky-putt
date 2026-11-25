// Daily hole: dates, the generator snapshot, and the fairness proof for every published daily.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  dateKey, shiftDay, weekday, daysBetween, dailyCandidate, dailyHole, dailyEntry, dailyTableEnd, holeHash,
  streakInfo, recentDays, shareText, DAY_PLAN,
} from '../src/daily.js'
import { DAILY_START } from '../src/daily-table.js'
import { validateHole, solveHole } from '../tools/solver.js'
import { straightAce, directAce, replay, SOLVE_OPTS } from '../tools/daily-check.js'
import { makeSave, defaults, resultName } from '../src/save.js'
import { HOLES } from '../src/holes.js'

const PROOFS = JSON.parse(readFileSync(new URL('../tools/daily-proofs.json', import.meta.url), 'utf8'))

test('date helpers', () => {
  assert.equal(weekday('2026-11-25'), 3) // a Wednesday
  assert.equal(weekday('2027-01-01'), 5)
  assert.equal(weekday('2028-02-29'), 2)
  for (let i = 0; i < 800; i += 37) { const k = shiftDay('2026-11-25', i); assert.equal(weekday(k), new Date(k + 'T12:00:00').getDay(), k) }
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01')
  assert.equal(shiftDay('2027-03-01', -1), '2027-02-28')
  assert.equal(daysBetween('2026-11-25', '2027-11-25'), 365)
  assert.equal(dateKey(new Date(2026, 10, 5, 23, 59)), '2026-11-05')
})

// If this test fails you changed the generator, and with it every player's daily. Read AGENTS.md "Daily hole".
// Do NOT paste in new hashes.
test('snapshot: published dailies never change', () => {
  const SNAP = { '2026-11-25': '96a77a87', '2026-11-30': '0246976c', '2027-01-01': '8081b4af', '2027-06-15': '476b1391', '2027-12-31': '99f56861' }
  for (const [k, h] of Object.entries(SNAP)) assert.equal(holeHash(dailyHole(k)), h, k)
  assert.equal(dailyHole('2026-11-25').name, 'Frosty Hill')
})

test('the generator is deterministic and integer-only', () => {
  for (let i = 0; i < 40; i++) {
    const k = shiftDay('2026-11-25', i * 11), a = dailyCandidate(k, i % 5), b = dailyCandidate(k, i % 5)
    assert.deepEqual(a, b)
    const ints = []
    const walk = (v, path) => { if (Array.isArray(v)) v.forEach((x, j) => walk(x, path + '.' + j)); else if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) walk(x, path + '.' + kk); else if (typeof v === 'number') ints.push([path, v]) }
    walk(a.hole, '')
    for (const [p, v] of ints) if (!/\.(period|phase|speed)$/.test(p) || /zones/.test(p)) assert.ok(Number.isInteger(v), `${k} ${p} = ${v}`)
  }
})

test('the table covers at least a year and matches its proofs', () => {
  assert.equal(PROOFS.start, DAILY_START)
  assert.ok(daysBetween(DAILY_START, dailyTableEnd()) >= 364, `table ends ${dailyTableEnd()}`)
  PROOFS.days.forEach((d, i) => {
    assert.equal(d.date, shiftDay(DAILY_START, i))
    const e = dailyEntry(d.date)
    assert.equal(e.attempt, d.attempt, d.date); assert.equal(e.par, d.par, d.date)
    assert.equal(holeHash(dailyHole(d.date)), d.hash, `${d.date}: the hole changed since it was proven`)
  })
  const left = daysBetween(dateKey(), dailyTableEnd())
  if (left < 60) console.warn(`[wonky-putt] the daily table runs out in ${left} days: run node tools/make-dailies.mjs`)
})

test('every published daily is fair: valid data, par in its weekday band, no straight or direct ace, proven within par', { timeout: 600000 }, () => {
  for (const d of PROOFS.days) {
    const hole = dailyHole(d.date)
    assert.deepEqual(validateHole(hole), [], d.date)
    const band = DAY_PLAN[weekday(d.date)].par
    assert.ok(hole.par >= band[0] && hole.par <= band[1] && hole.par >= 2 && hole.par <= 5, `${d.date}: par ${hole.par}`)
    assert.ok(hole.name.length <= 24 && hole.hint.length < 70, d.date)
    assert.ok(!straightAce(hole), `${d.date}: a straight full-power shot aces it`)
    assert.ok(!directAce(hole), `${d.date}: simply aiming at the cup aces it`)
    assert.ok(d.ace < 2, `${d.date}: ${d.ace}% of first putts are aces`)
    // the solver's line, replayed: it really does go in within par (and with room to spare)
    const w = replay(hole, d.shots.map(([angle, power, wait]) => ({ angle, power, wait })))
    assert.equal(w.state, 'sunk', `${d.date}: the proof line does not sink`)
    assert.ok(w.strokes <= hole.par - 1, `${d.date}: proof line takes ${w.strokes}, par ${hole.par}`)
    // the noisy player made par in at least 3 of 4 tries and never got near the stroke limit
    assert.ok(d.noisy.filter((s) => s > hole.par).length <= d.noisy.length / 4 && Math.max(...d.noisy) < 8, d.date)
  }
})

test('solver, fresh: every daily of the first year finishes within par', { timeout: 600000 }, (t) => {
  const counts = {}
  for (let i = 0; i < 365; i++) {
    const k = shiftDay(DAILY_START, i), hole = dailyHole(k)
    const sol = solveHole(hole, { ...SOLVE_OPTS, maxStrokes: hole.par })
    assert.ok(sol.strokes < hole.par, `${k} "${hole.name}": solver needed ${sol.strokes}, par ${hole.par}`)
    counts[sol.strokes] = (counts[sol.strokes] || 0) + 1
  }
  t.diagnostic('solver strokes over the year: ' + JSON.stringify(counts))
})

test('dates outside the table reuse a proven day with the same weekday', () => {
  const end = dailyTableEnd()
  for (const k of [shiftDay(end, 1), shiftDay(end, 200), shiftDay(end, 900), shiftDay(DAILY_START, -1), shiftDay(DAILY_START, -400)]) {
    const e = dailyEntry(k)
    assert.ok(daysBetween(DAILY_START, e.source) >= 0 && daysBetween(e.source, end) >= 0, k)
    assert.equal(weekday(e.source), weekday(k), k)
    assert.equal(dailyHole(k).par, e.par)
  }
})

test('streaks, the week strip and the share line', () => {
  const H = { '2026-11-20': { s: 3, p: 3, k: 1 }, '2026-11-22': { s: 2, p: 3, k: 1 }, '2026-11-23': { s: 8, p: 3, k: 0 }, '2026-11-24': { s: 4, p: 3, k: 1 }, '2026-11-25': { s: 1, p: 3, k: 1 } }
  assert.deepEqual(streakInfo(H, '2026-11-25'), { current: 2, best: 2 })
  assert.deepEqual(streakInfo(H, '2026-11-26'), { current: 2, best: 2 }, 'today not played yet: the streak still stands')
  assert.deepEqual(streakInfo(H, '2026-11-27'), { current: 0, best: 2 })
  assert.deepEqual(streakInfo({}, '2026-11-25'), { current: 0, best: 0 })
  const days = recentDays(H, '2026-11-25', 7)
  assert.equal(days.length, 7); assert.equal(days[6].key, '2026-11-25'); assert.equal(days[6].today, true); assert.equal(days[6].day, 'W'); assert.equal(days[0].rec, null)
  const rec = { s: 2, p: 3, k: 1 }
  assert.equal(shareText('2026-11-25', 'Sandy Situation', rec, resultName(2, 3)), 'Wonky Putt daily 2026-11-25 · "Sandy Situation" · 2 strokes (par 3) · Birdie\ngames.oddvale.com/wonky-putt')
  assert.match(shareText('2026-11-25', 'X', { s: 1, p: 3, k: 1 }, resultName(1, 3)), / 1 stroke \(par 3\) · Hole in one\n/)
  assert.match(shareText('2026-11-25', 'X', { s: 8, p: 3, k: 0 }, resultName(8, 3, false)), /Picked up/)
})

test('save data: old saves gain a daily block, junk is repaired, the official try resumes', () => {
  const fake = (data) => ({ data: { ...data }, save() {} })
  const old = { v: 1, best: { 0: 2 }, unlocked: 3, aces: 1, aceHoles: {}, round: null, bestRound: null, rounds: 0, skin: 'orange' }
  const s = makeSave(fake(old), HOLES)
  assert.deepEqual(s.data.daily, { history: {}, cur: null, bestStreak: 0, practice: null }); assert.equal(s.best(0), 2); assert.equal(s.data.v, 2)
  const junk = makeSave(fake({ ...defaults(), daily: { history: { nope: 1, '2026-11-20': { s: 'x' }, '2026-11-21': { s: 3, p: 3, k: 1 } }, cur: { date: 5 }, bestStreak: -3, practice: 'x' } }), HOLES)
  assert.deepEqual(junk.data.daily, { history: { '2026-11-21': { s: 3, p: 3, k: 1 } }, cur: null, bestStreak: 0, practice: null })
  assert.equal(makeSave(fake({ ...defaults(), daily: 'garbage' }), HOLES).data.daily.cur, null)
  const live = makeSave(fake({ ...defaults(), daily: { history: {}, cur: { date: '2026-11-25', strokes: 2, x: 300.5, y: 200 }, bestStreak: 4, practice: null } }), HOLES)
  assert.deepEqual(live.data.daily.cur, { date: '2026-11-25', strokes: 2, x: 300.5, y: 200 })
  live.recordDaily('2026-11-25', 3, 3, true)
  assert.deepEqual(live.data.daily.history['2026-11-25'], { s: 3, p: 3, k: 1 }); assert.equal(live.data.daily.cur, null); assert.equal(live.data.daily.bestStreak, 4)
  // a finished day's stale cursor is dropped on load
  const stale = makeSave(fake({ ...defaults(), daily: { history: { '2026-11-25': { s: 3, p: 3, k: 1 } }, cur: { date: '2026-11-25', strokes: 1, x: 1, y: 1 } } }), HOLES)
  assert.equal(stale.data.daily.cur, null)
})
