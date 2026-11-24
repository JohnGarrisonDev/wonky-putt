// Where do the holes-in-one come from? node tools/acemap.mjs <holeNumber>
// Prints, per 10-degree slice of aim, how many (angle, power) samples go in, and the power range that works.
import { HOLES } from '../src/holes.js'
import { compileHole, createWorld, cloneWorld, shoot, settle, step } from '../src/physics.js'
const i = +process.argv[2] - 1, hole = HOLES[i], c = compileHole(hole)
const waits = c.movers.length ? [0, c.period / 4, c.period / 2, (3 * c.period) / 4] : [0]
const direct = (Math.atan2(c.cup[1] - c.tee[1], c.cup[0] - c.tee[0]) * 180) / Math.PI
console.log(`${hole.name}: direct aim is ${((direct + 360) % 360).toFixed(1)} deg`)
const buckets = new Map()
for (const wait of waits) {
  const base = createWorld(c)
  for (let k = Math.round(wait * 120); k > 0; k--) step(base)
  for (let deg = 0; deg < 360; deg += 0.5) for (let p = 0.1; p <= 1.001; p += 0.02) {
    const w = cloneWorld(base); shoot(w, (deg * Math.PI) / 180, p); settle(w)
    if (w.state === 'sunk' && w.strokes === 1) { const b = Math.floor(deg / 10) * 10; const e = buckets.get(b) || { n: 0, lo: 9, hi: 0 }; e.n++; e.lo = Math.min(e.lo, p); e.hi = Math.max(e.hi, p); buckets.set(b, e) }
  }
}
for (const [b, e] of [...buckets].sort((a, z) => a[0] - z[0])) console.log(`${String(b).padStart(4)}..${b + 10} deg  ${String(e.n).padStart(5)}  power ${e.lo.toFixed(2)}..${e.hi.toFixed(2)}`)
