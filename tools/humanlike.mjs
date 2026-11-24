// Rough "how will this score for a person?" estimate: node tools/humanlike.mjs [holeNumber ...] [--trials=20]
// A greedy player picks the most forgiving putt that goes in, or else the one that ends nearest the cup; the putt is then jittered (aim +-2.5 deg, power +-6%)
// the way a thumb would. Prints the mean score per hole next to par. Use it to sanity-check par when tuning a hole:
// a mean far above par means the hole punishes small errors too hard; far below means par is generous.
import { HOLES } from '../src/holes.js'
import { compileHole, createWorld, cloneWorld, shoot, settle, step } from '../src/physics.js'
import { distanceField } from './solver.js'

const args = process.argv.slice(2)
const trials = +(args.find((a) => a.startsWith('--trials=')) || '--trials=20').split('=')[1]
const pick = args.filter((a) => /^\d+$/.test(a)).map((a) => +a - 1)
let seed = 12345
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.73

let sumMean = 0, sumPar = 0
for (const i of pick.length ? pick : HOLES.map((_, k) => k)) {
  const hole = HOLES[i], c = compileHole(hole), field = distanceField(c), limit = hole.par + 5
  const scores = []
  for (let t = 0; t < trials; t++) {
    const w = createWorld(c)
    for (let k = Math.floor(rnd() * 300); k > 0; k--) step(w)
    while (w.state !== 'sunk' && w.strokes < limit) {
      if (w.state === 'moving') settle(w)
      let best = null
      for (let deg = 0; deg < 360; deg += 3) for (let p = 0.15; p <= 1.001; p += 0.085) {
        const k = cloneWorld(w)
        shoot(k, (deg * Math.PI) / 180, p); settle(k)
        let score
        if (k.state === 'sunk') {
          // a putt that goes in: prefer the forgiving ones (still in when nudged), then the gentle ones
          let robust = 0
          for (const [da, dp] of [[-2, 1], [2, 1], [0, 0.94], [0, 1.06]]) { const n = cloneWorld(w); shoot(n, ((deg + da) * Math.PI) / 180, Math.min(1, p * dp)); settle(n); if (n.state === 'sunk') robust++ }
          score = -1000 - robust * 100 + p
        } else score = k.strokes !== w.strokes + 1 ? 1e6 : field.at(k.ball.x, k.ball.y) - Object.keys(k.open).length * 300
        if (!best || score < best.score) best = { deg, p, score }
      }
      shoot(w, ((best.deg + gauss() * 2.5) * Math.PI) / 180, Math.min(1, Math.max(0.05, best.p * (1 + gauss() * 0.06))))
      settle(w)
    }
    scores.push(w.state === 'sunk' ? w.strokes : limit)
  }
  const mean = scores.reduce((a, b) => a + b, 0) / trials
  sumMean += mean; sumPar += hole.par
  const hist = [1, 2, 3, 4, 5, 6].map((n) => `${n}:${scores.filter((s) => (n === 6 ? s >= 6 : s === n)).length}`).join(' ')
  console.log(`${String(i + 1).padStart(2)} ${hole.name.padEnd(24)} par ${hole.par}  mean ${mean.toFixed(2)}  (${hist})`)
}
console.log(`course: par ${sumPar}, noisy greedy player averages ${sumMean.toFixed(1)}`)
