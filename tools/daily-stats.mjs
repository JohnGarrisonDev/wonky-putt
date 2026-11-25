// Summary of the published dailies: node tools/daily-stats.mjs [--from=YYYY-MM-DD] [--days=365]
// Prints par by weekday, solver strokes, noisy-player scores vs par, ace rates, layouts, mechanics and attempts.
import { readFileSync } from 'node:fs'
import { weekday, WEEKDAYS, daysBetween } from '../src/daily.js'

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const proofs = JSON.parse(readFileSync(new URL('./daily-proofs.json', import.meta.url), 'utf8'))
let days = proofs.days
if (args.from) days = days.filter((d) => daysBetween(args.from, d.date) >= 0)
if (args.days) days = days.slice(0, +args.days)
const count = (arr) => arr.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {})
const row = (label, m, keys) => `${label.padEnd(11)}${keys.map((k) => String(m[k] || 0).padStart(6)).join('')}`
console.log(`${days.length} dailies, ${days[0].date} .. ${days[days.length - 1].date}\n`)
console.log('par by weekday'.padEnd(11) + [2, 3, 4, 5].map((p) => `par ${p}`.padStart(6)).join('') + '   mean')
for (const wd of [1, 2, 3, 4, 5, 6, 0]) {
  const ds = days.filter((d) => weekday(d.date) === wd)
  console.log(row(WEEKDAYS[wd], count(ds.map((d) => d.par)), [2, 3, 4, 5]) + '   ' + (ds.reduce((n, d) => n + d.par, 0) / ds.length).toFixed(2))
}
console.log(row('all', count(days.map((d) => d.par)), [2, 3, 4, 5]))
console.log('\nsolver strokes ' + JSON.stringify(count(days.map((d) => d.solver))))
const noisy = days.flatMap((d) => d.noisy.map((s) => s - d.par))
console.log(`noisy player vs par (${noisy.length} runs): ` + JSON.stringify(count(noisy.map((x) => (x > 0 ? '+' + x : String(x))))) + `, mean ${(noisy.reduce((a, b) => a + b, 0) / noisy.length).toFixed(2)}`)
const aces = days.map((d) => d.ace).sort((a, b) => a - b)
console.log(`first-putt ace rate: median ${aces[aces.length >> 1]}%, max ${aces[aces.length - 1]}%, holes with no ace in the sweep ${aces.filter((a) => a === 0).length}`)
console.log('layouts ' + JSON.stringify(count(days.map((d) => d.kind))))
console.log('mechanics ' + JSON.stringify(count(days.flatMap((d) => d.mechs))))
const att = days.map((d) => d.attempt).sort((a, b) => a - b)
console.log(`attempts to find a fair hole: median ${att[att.length >> 1]}, max ${att[att.length - 1]}`)
const rej = {}
for (const d of days) for (const [k, v] of Object.entries(d.rejected || {})) rej[k] = (rej[k] || 0) + v
console.log('rejected candidates ' + JSON.stringify(rej))
console.log(`distinct names ${new Set(days.map((d) => d.name)).size}`)
