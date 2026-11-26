// Pre-generate the daily holes: node tools/make-dailies.mjs [--to=YYYY-MM-DD] [--workers=N]
// For every date from the end of the current table up to --to (default: one year past the last date), it walks the
// candidates (attempt 0, 1, 2 ...) from src/daily.js and keeps the first one that passes every check in
// tools/daily-check.js. Results are APPENDED to src/daily-table.js (attempt + par per date) and tools/daily-proofs.json
// (solver line, noisy-player scores, hash) so tests can prove each published hole. Published dates are never redone.
//   --redo-gen   re-pick (in place) every table date on or after GEN2_START whose listed candidate the current
//                generator now throws away (1.4.0: bunkers touching walls). Only for dates nobody has played yet:
//                GEN2_START must stay after the last date any player could have seen.
import { Worker, isMainThread, parentPort } from 'node:worker_threads'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { cpus } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dailyCandidate, shiftDay, daysBetween, holeHash, GEN2_START } from '../src/daily.js'
import { assessDaily } from './daily-check.js'

const TABLE = new URL('../src/daily-table.js', import.meta.url), PROOFS = new URL('./daily-proofs.json', import.meta.url)
const MAX_ATTEMPTS = 400

function solveDate(key) {
  const reasons = {}
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const c = dailyCandidate(key, attempt)
    if (!c.ok) { reasons['does not fit'] = (reasons['does not fit'] || 0) + 1; continue }
    const r = assessDaily(c.hole, key, attempt)
    if (!r.ok) { const k = r.reason.replace(/\d+/g, 'N'); reasons[k] = (reasons[k] || 0) + 1; continue }
    const hole = { ...c.hole, par: r.par, date: key }
    return {
      key, attempt, par: r.par, name: c.hole.name, kind: c.hole.kind, mechs: c.hole.mechs, hash: holeHash(hole),
      solver: r.solver.strokes, shots: r.solver.shots.map((s) => [+s.angle.toFixed(3), s.power, +s.wait.toFixed(6)]),
      noisy: r.noisy.scores, ace: +(r.aceShare * 100).toFixed(3), reasons,
    }
  }
  throw new Error(`${key}: no fair hole in ${MAX_ATTEMPTS} attempts`)
}

if (!isMainThread) {
  parentPort.on('message', (key) => { try { parentPort.postMessage({ ok: true, res: solveDate(key) }) } catch (e) { parentPort.postMessage({ ok: false, key, err: e.message }) } })
} else {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
  const src = readFileSync(TABLE, 'utf8')
  const start = /DAILY_START = '([\d-]+)'/.exec(src)[1], body = /DAILY_TABLE = '([^']*)'/.exec(src)[1]
  const entries = body ? body.split(',') : []
  const proofs = existsSync(PROOFS) ? JSON.parse(readFileSync(PROOFS, 'utf8')) : { start, days: [] }
  if (proofs.days.length !== entries.length) throw new Error('daily-proofs.json and daily-table.js disagree; fix that first')
  const first = shiftDay(start, entries.length), to = args.to || shiftDay(first, 364)
  const redo = 'redo-gen' in args
  let keys
  if (redo) {
    keys = []
    entries.forEach((e, i) => { const k = shiftDay(start, i); if (daysBetween(GEN2_START, k) >= 0 && !dailyCandidate(k, parseInt(e.split('.')[0], 36)).ok) keys.push(k) })
    if (!keys.length) { console.log('no table date needs a new pick'); process.exit(0) }
  } else {
    const n0 = daysBetween(first, to) + 1
    if (n0 <= 0) { console.log(`table already reaches ${shiftDay(start, entries.length - 1)}`); process.exit(0) }
    keys = Array.from({ length: n0 }, (_, i) => shiftDay(first, i))
  }
  const n = keys.length
  console.log(redo ? `re-picking ${n} dailies: ${keys.join(' ')}` : `generating ${n} dailies, ${first} .. ${to}`)
  const results = new Map(), t0 = Date.now()
  const workers = Math.max(1, Math.min(+args.workers || cpus().length - 1, n))
  let next = 0, done = 0
  await new Promise((resolve, reject) => {
    for (let i = 0; i < workers; i++) {
      const w = new Worker(fileURLToPath(import.meta.url))
      const feed = () => { if (next < keys.length) w.postMessage(keys[next++]); else w.terminate() }
      w.on('message', (m) => {
        if (!m.ok) { reject(new Error(m.err)); return }
        results.set(m.res.key, m.res); done++
        const r = m.res
        console.log(`${r.key}  #${String(r.attempt).padStart(3)}  par ${r.par}  solver ${r.solver}  noisy ${r.noisy.join('')}  ${r.mechs.join('+').padEnd(24)} ${r.name}   (${done}/${n}, ${((Date.now() - t0) / 1000).toFixed(0)}s)`)
        if (done === n) resolve()
        feed()
      })
      w.on('error', reject)
      feed()
    }
  })
  for (const k of keys) {
    const r = results.get(k)
    const entry = `${r.attempt.toString(36)}.${r.par}`, proof = { date: r.key, attempt: r.attempt, par: r.par, hash: r.hash, name: r.name, mechs: r.mechs, kind: r.kind, solver: r.solver, shots: r.shots, noisy: r.noisy, ace: r.ace, rejected: r.reasons }
    if (redo) { const i = daysBetween(start, k); entries[i] = entry; proofs.days[i] = proof } else { entries.push(entry); proofs.days.push(proof) }
  }
  writeFileSync(TABLE, `// Generated by tools/make-dailies.mjs. Do not edit by hand (see AGENTS.md, "Daily hole").\n// One entry per day from DAILY_START: "<attempt in base 36>.<par>".\nexport const DAILY_START = '${start}'\nexport const DAILY_TABLE = '${entries.join(',')}'\n`)
  writeFileSync(PROOFS, JSON.stringify(proofs, null, 0).replace(/\{"date"/g, '\n{"date"') + '\n')
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s; table now ends ${shiftDay(start, entries.length - 1)}`)
}
