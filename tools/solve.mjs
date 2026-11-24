// Course report: node tools/solve.mjs [holeNumber ...] [--fast]
// For each hole: data problems, fewest strokes the solver found (must be <= par), and how ace-able it is.
import { HOLES } from '../src/holes.js'
import { solveHole, aceScan, validateHole } from './solver.js'

const args = process.argv.slice(2), fast = args.includes('--fast')
const pick = args.filter((a) => /^\d+$/.test(a)).map((a) => +a - 1)
const list = pick.length ? pick : HOLES.map((_, i) => i)
let failed = false
for (const i of list) {
  const hole = HOLES[i], t0 = Date.now()
  const errs = validateHole(hole, i)
  for (const e of errs) console.log('  ! ' + e)
  const ace = aceScan(hole, fast ? { angleStep: 1, powerStep: 0.08, waits: 2 } : {})
  const sol = ace.best ? { strokes: 1, shots: [ace.best] } : solveHole(hole)
  const ok = sol.strokes <= hole.par && !errs.length
  if (!ok) failed = true
  const pct = ((ace.count / ace.tried) * 100).toFixed(2)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${String(i + 1).padStart(2)} ${hole.name.padEnd(24)} par ${hole.par}  solved in ${sol.strokes}  aces ${String(ace.count).padStart(5)} (${pct}% of shots)${ace.direct ? '  DIRECT-AIM ACE' : ''}  ${Date.now() - t0}ms`)
  if (sol.shots.length) console.log('       ' + sol.shots.map((s) => `${s.angle.toFixed(1)}deg p${s.power}${s.wait ? ` wait ${s.wait.toFixed(2)}s` : ''}`).join('  ->  '))
}
process.exit(failed ? 1 : 0)
