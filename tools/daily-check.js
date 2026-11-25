// Fairness checks for generated daily holes. DOM-free; used by tools/make-dailies.mjs and tests/daily.test.js.
// A candidate becomes a published daily only when every check passes. In order (cheap first):
//   1. validateHole: data sanity (tee/cup clear, no pinch points, the cup is reachable, ...)
//   2. no straight full-power ace, and simply aiming at the cup never aces it (aceScan "direct")
//   3. the headless solver finishes it in at most 4 strokes on a coarse 3-degree grid (no pixel-perfect luck)
//   4. under 2% of a sweep of first putts are aces
//   5. a "noisy" player (knows the lines, shaky thumbs: aim +-2.5 deg, power +-6%) never gets near the stroke
//      limit, and makes par in at least 75% of tries. Par comes from here: ceil(mean + 0.5), at least solver + 1.
//   6. par fits the weekday's band (gentle early in the week)
//   7. stuck check: from the worst resting spots that random and noisy play reach, the solver still finishes in 3
import { makeRng, hashString } from '../kit/kit.js'
import { compileHole, createWorld, cloneWorld, shoot, settle, step } from '../src/physics.js'
import { solveHole, aceScan, validateHole, distanceField } from './solver.js'
import { DAY_PLAN, weekday } from '../src/daily.js'

export const SOLVE_OPTS = { angles: 120, keep: 6, waits: 3, maxStrokes: 5 }
const RAD = Math.PI / 180

function wait(w, seconds) { for (let i = Math.round(seconds * 120); i > 0; i--) step(w); if (w.state === 'moving') settle(w) }

/** True when a straight shot at the cup at 90-100% power is a hole in one (at a few mover phases). */
export function straightAce(hole) {
  const c = compileHole(hole), a = Math.atan2(c.cup[1] - c.tee[1], c.cup[0] - c.tee[0])
  const waits = c.movers.length ? [0, 0.25, 0.5, 0.75].map((k) => k * c.period) : [0]
  for (const wt of waits) for (const p of [0.9, 0.95, 1]) for (const off of [-0.01, 0, 0.01]) {
    const w = createWorld(c)
    for (let k = Math.round(wt * 120); k > 0; k--) step(w)
    const s = cloneWorld(w); shoot(s, a + off, p); settle(s)
    if (s.state === 'sunk' && s.strokes === 1) return true
  }
  return false
}

/** Aim straight at the cup (+-0.6 deg) at any power, at a few mover phases: true when that is an ace. */
export function directAce(hole) {
  const c = compileHole(hole), a = Math.atan2(c.cup[1] - c.tee[1], c.cup[0] - c.tee[0])
  for (const k of c.movers.length ? [0, 0.25, 0.5, 0.75] : [0]) {
    const base = createWorld(c)
    for (let n = Math.round(k * c.period * 120); n > 0; n--) step(base)
    for (let p = 0.12; p <= 1.0001; p += 0.04) for (const off of [-0.6, 0, 0.6]) {
      const w = cloneWorld(base); shoot(w, a + (off * Math.PI) / 180, p); settle(w)
      if (w.state === 'sunk' && w.strokes === 1) return true
    }
  }
  return false
}
/** Replay a solver line ({ angle deg, power, wait s }[]). Returns the world after the last shot. */
export function replay(hole, shots) {
  const w = createWorld(compileHole(hole))
  for (const s of shots) {
    if (w.state === 'sunk') break
    if (s.wait) wait(w, s.wait)
    shoot(w, s.angle * RAD, s.power); settle(w)
  }
  return w
}

/** A player who picks the best grid putt (preferring forgiving sinks), then fluffs it a little. */
export function noisyPlayer(hole, { trials = 8, seed = 1, angleStep = 4, limit = 9 } = {}) {
  const c = compileHole(hole), field = distanceField(c), rng = makeRng(seed)
  const gauss = () => (rng() + rng() + rng() + rng() - 2) * 1.73
  const powers = [0.15, 0.24, 0.33, 0.42, 0.52, 0.62, 0.73, 0.86, 1]
  const scores = [], spots = []
  for (let t = 0; t < trials; t++) {
    const w = createWorld(c)
    for (let k = Math.floor(rng() * 300); k > 0; k--) step(w)
    while (w.state !== 'sunk' && w.strokes < limit) {
      if (w.state === 'moving') settle(w)
      let best = null
      for (let deg = 0; deg < 360; deg += angleStep) for (const p of powers) {
        const k = cloneWorld(w)
        shoot(k, deg * RAD, p); settle(k)
        let score
        if (k.state === 'sunk') {
          let robust = 0
          for (const [da, dp] of [[-2, 1], [2, 1], [0, 0.94], [0, 1.06]]) { const n = cloneWorld(w); shoot(n, (deg + da) * RAD, Math.min(1, p * dp)); settle(n); if (n.state === 'sunk') robust++ }
          score = -1000 - robust * 100 + p
        } else score = k.strokes !== w.strokes + 1 ? 1e6 + field.at(k.ball.x, k.ball.y) : field.at(k.ball.x, k.ball.y)
        if (!best || score < best.score) best = { deg, p, score }
      }
      shoot(w, (best.deg + gauss() * 2.5) * RAD, Math.min(1, Math.max(0.05, best.p * (1 + gauss() * 0.06))))
      settle(w)
      if (w.state === 'rest') spots.push([w.ball.x, w.ball.y])
    }
    scores.push(w.state === 'sunk' ? w.strokes : limit)
  }
  const mean = scores.reduce((a, b) => a + b, 0) / trials
  return { scores, mean, spots }
}

/** Resting spots that random putts reach (first and second putts). */
function randomSpots(hole, rng, n = 36) {
  const c = compileHole(hole), out = []
  for (let i = 0; i < n; i++) {
    const w = createWorld(c)
    for (let k = Math.floor(rng() * 240); k > 0; k--) step(w)
    for (let s = 0; s < 2 && w.state === 'rest'; s++) {
      shoot(w, rng() * Math.PI * 2, 0.15 + rng() * 0.85); settle(w)
      if (w.state === 'rest') out.push([w.ball.x, w.ball.y])
    }
  }
  return out
}

/** From the hardest-looking resting spots, can the hole still be finished in 3? Returns the first spot that fails, or null. */
export function stuckSpot(hole, spots, count = 5) {
  const c = compileHole(hole), field = distanceField(c)
  const seen = new Set(), ranked = spots.map((p) => ({ p, d: field.at(p[0], p[1]), key: field.cell(p[0], p[1]) })).sort((a, b) => b.d - a.d)
  let n = 0
  for (const r of ranked) {
    if (seen.has(r.key)) continue
    seen.add(r.key)
    if (r.d === Infinity) return r.p
    const sol = solveHole({ ...hole, tee: [r.p[0], r.p[1]] }, { angles: 72, keep: 4, waits: 2, maxStrokes: 3 })
    if (sol.strokes > 3) return r.p
    if (++n >= count) break
  }
  return null
}

/** Run every check. Returns { ok, reason, par, solver, noisy, aceShare }. */
export function assessDaily(hole, key, attempt = 0) {
  const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra })
  const errs = validateHole(hole)
  if (errs.length) return fail('data: ' + errs[0].replace(/^hole \d+ "[^"]*": /, ''))
  if (straightAce(hole)) return fail('straight ace')
  if (directAce(hole)) return fail('aiming at the cup aces it')
  const sol = solveHole({ ...hole, par: 5 }, SOLVE_OPTS)
  if (sol.strokes > 4) return fail('solver needs more than 4')
  const ace = aceScan(hole, { angleStep: 1.5, powerStep: 0.06, waits: 2 })
  if (ace.direct) return fail('aiming at the cup aces it')
  const aceShare = ace.count / ace.tried
  if (aceShare >= 0.02) return fail('too many aces')
  const seed = hashString(`wonky-putt-check:${key}:${attempt}`)
  const noisy = noisyPlayer(hole, { seed })
  if (Math.max(...noisy.scores) >= 8) return fail('noisy player hits the limit')
  if (noisy.mean > 4.3) return fail('too hard')
  const par = Math.min(5, Math.max(2, sol.strokes + 1, Math.ceil(noisy.mean + 0.5)))
  const over = noisy.scores.filter((s) => s > par).length / noisy.scores.length
  if (over > 0.25) return fail('par is luck')
  const band = DAY_PLAN[weekday(key)].par
  if (par < band[0] || par > band[1]) return fail(`par ${par} outside ${band[0]}-${band[1]}`)
  const stuck = stuckSpot(hole, [...noisy.spots, ...randomSpots(hole, makeRng(seed ^ 0x5bd1e995))])
  if (stuck) return fail('stuck spot')
  return { ok: true, par, solver: sol, noisy: { mean: noisy.mean, scores: noisy.scores }, aceShare }
}
