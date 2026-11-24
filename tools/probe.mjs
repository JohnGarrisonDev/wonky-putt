// Fire one shot and print the path summary: node tools/probe.mjs <hole> <deg> <power> [more deg power pairs]
import { HOLES } from '../src/holes.js'
import { compileHole, createWorld, shoot, settle } from '../src/physics.js'
const a = process.argv.slice(2).map(Number), w = createWorld(compileHole(HOLES[a[0] - 1]))
for (let k = 1; k + 1 < a.length; k += 2) { shoot(w, (a[k] * Math.PI) / 180, a[k + 1]); const n = settle(w); console.log(`shot ${a[k]}deg p${a[k + 1]} -> ${w.state} at (${w.ball.x.toFixed(0)}, ${w.ball.y.toFixed(0)}) strokes ${w.strokes} after ${(n / 120).toFixed(1)}s`) }
