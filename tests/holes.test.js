// Hole data checks and the solver proof: every hole can be finished within par.
import test from 'node:test'
import assert from 'node:assert/strict'
import { HOLES } from '../src/holes.js'
import { compileHole, createWorld, cloneWorld, shoot, settle, step } from '../src/physics.js'
import { solveHole, aceScan, validateHole } from '../tools/solver.js'

test('the course is 18 holes with sane data', () => {
  assert.equal(HOLES.length, 18)
  assert.equal(new Set(HOLES.map((h) => h.name)).size, 18, 'names must be unique')
  for (const h of HOLES) assert.ok(h.hint && h.hint.length < 70, `${h.name}: needs a short hint`)
  const errs = HOLES.flatMap((h, i) => validateHole(h, i))
  assert.deepEqual(errs, [])
  const total = HOLES.reduce((n, h) => n + h.par, 0)
  assert.ok(total >= 48 && total <= 62, `course par ${total}`)
})

test('hole 1 is a gimme: aiming straight at the cup at medium power goes in', () => {
  const c = compileHole(HOLES[0]), w = createWorld(c)
  shoot(w, Math.atan2(c.cup[1] - c.tee[1], c.cup[0] - c.tee[0]), 0.55); settle(w)
  assert.equal(w.state, 'sunk')
})

test('after hole 3, a straight full-power shot at the cup never goes in', () => {
  HOLES.forEach((hole, i) => {
    if (i < 3) return
    const c = compileHole(hole), a = Math.atan2(c.cup[1] - c.tee[1], c.cup[0] - c.tee[0])
    const waits = c.movers.length ? [0, 0.25, 0.5, 0.75].map((k) => k * c.period) : [0]
    for (const wait of waits) for (const p of [0.9, 0.95, 1]) for (const off of [-0.01, 0, 0.01]) {
      const w = createWorld(c)
      for (let k = Math.round(wait * 120); k > 0; k--) step(w)
      const s = cloneWorld(w); shoot(s, a + off, p); settle(s)
      assert.ok(!(s.state === 'sunk' && s.strokes === 1), `hole ${i + 1} "${hole.name}" is aced by a straight power-${p} shot`)
    }
  })
})

test('solver: every hole can be finished within par (coarse 3-degree search, so no pixel-perfect luck)', { timeout: 600000 }, (t) => {
  const lines = []
  HOLES.forEach((hole, i) => {
    const sol = solveHole(hole, { angles: 120, keep: 6, waits: 3 })
    assert.ok(sol.strokes <= hole.par, `hole ${i + 1} "${hole.name}": solver needed ${sol.strokes}, par is ${hole.par}`)
    lines.push(`${String(i + 1).padStart(2)} ${hole.name.padEnd(24)} par ${hole.par}  solver ${sol.strokes}`)
  })
  t.diagnostic('\n' + lines.join('\n'))
})

test('ace report: which holes allow a hole in one', { timeout: 600000 }, (t) => {
  const lines = []
  let aceable = 0
  HOLES.forEach((hole, i) => {
    const r = aceScan(hole, { angleStep: 1, powerStep: 0.05, waits: 3 })
    if (r.count) aceable++
    lines.push(`${String(i + 1).padStart(2)} ${hole.name.padEnd(24)} ${r.count ? `ace-able (${((r.count / r.tried) * 100).toFixed(2)}% of sampled shots, e.g. ${r.best.angle} deg at power ${r.best.power})` : 'no ace found'}`)
    if (i >= 3) assert.ok(r.count / r.tried < 0.03, `hole ${i + 1} "${hole.name}" is too easy to ace (${((r.count / r.tried) * 100).toFixed(1)}% of random shots)`)
  })
  t.diagnostic('\n' + lines.join('\n'))
  assert.ok(aceable >= 8, `only ${aceable} holes can be aced`)
})
