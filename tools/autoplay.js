// Dev helper for browser play-testing (not loaded by the game). With the game open at ?debug, in the console:
//   const auto = await import('./tools/autoplay.js'); await auto.playRound(window.__game)
// It plays the current round to the end with brute-force "best next putt" choices, through the real game loop,
// result cards and scorecard, so the whole flow gets exercised. Works in background tabs (it does not wait for frames).
import { cloneWorld, shoot, settle } from '../src/physics.js'
import { distanceField } from './solver.js'

/** Best next putt from the world's current state: a sinking shot if one exists on the grid, else the one that ends nearest the cup. */
export function bestShot(world, { angleStep = 1.5, sloppy = false } = {}) {
  const field = distanceField(world.c)
  let best = null
  for (let deg = 0; deg < 360; deg += angleStep) for (let p = 0.14; p <= 1.001; p += 0.06) {
    const w = cloneWorld(world)
    shoot(w, (deg * Math.PI) / 180, p); settle(w)
    if (w.state === 'sunk' && !sloppy) return { deg, power: p, sunk: true }
    if (w.state !== 'rest' || w.strokes !== world.strokes + 1) continue
    const score = field.at(w.ball.x, w.ball.y) - Object.keys(w.open).length * 300
    if (!best || score < best.score) best = { deg, power: p, sunk: false, score }
  }
  return best || { deg: 0, power: 0.3, sunk: false }
}

/** Putt until the current hole ends (result card showing). Returns strokes taken. */
export function playHole(game, opts) {
  for (let n = 0; n < 12 && !game.ui.screen; n++) {
    const s = bestShot(game.G.world, opts)
    game.shoot(s.deg, s.power)
    for (let k = 0; k < 80 && (game.G.world.state === 'moving' || game.G.sink) && !game.ui.screen; k++) game.advance(0.5)
    game.advance(1)
  }
  return game.G.world.strokes
}

/** Play from the current hole to the final scorecard, clicking "next" on each result card. */
export function playRound(game, opts) {
  const log = []
  for (let n = 0; n < 60; n++) {
    if (game.ui.screen === 'final') break
    if (game.ui.screen === 'result') { document.querySelector('.overlay [data-act="next"]').click(); game.advance(0.2); continue }
    const hole = game.G.i
    log.push(`${hole + 1}:${playHole(game, opts)}`)
  }
  return log.join(' ')
}
