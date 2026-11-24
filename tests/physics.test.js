// Physics invariants. Run with: node --test tests/
import test from 'node:test'
import assert from 'node:assert/strict'
import { HOLES } from '../src/holes.js'
import { W, H, BALL_R, CUP_R, DT, MAX_SPEED, SPEED_CAP, compileHole, createWorld, cloneWorld, shoot, step, settle, pointInPoly, distToSeg, previewPath } from '../src/physics.js'

const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
const BOX = [[100, 100], [860, 100], [860, 500], [100, 500]]
const box = (extra = {}) => ({ name: 'test', par: 3, tee: [200, 300], cup: [800, 460], green: BOX, ...extra })
const speed = (w) => Math.hypot(w.ball.vx, w.ball.vy)
const deg = (d) => (d * Math.PI) / 180

test('every hole: random play never leaves the green, never goes NaN, always comes to rest', () => {
  HOLES.forEach((hole, i) => {
    const c = compileHole(hole), r = rng(1000 + i)
    for (let round = 0; round < 25; round++) {
      const w = createWorld(c)
      for (let s = 0; s < 6 && w.state !== 'sunk'; s++) {
        for (let k = Math.floor(r() * 200); k > 0; k--) step(w) // let movers move
        if (w.state === 'moving') settle(w)
        if (w.state !== 'rest') break
        shoot(w, r() * Math.PI * 2, 0.2 + r() * 0.8)
        let n = 0
        while (w.state === 'moving') {
          step(w); n++
          assert.ok(Number.isFinite(w.ball.x) && Number.isFinite(w.ball.y) && Number.isFinite(w.ball.vx) && Number.isFinite(w.ball.vy), `hole ${i + 1}: NaN`)
          assert.ok(speed(w) <= SPEED_CAP * 1.6, `hole ${i + 1}: speed ran away (${speed(w)})`)
          assert.ok(w.ball.x > 0 && w.ball.x < W && w.ball.y > 0 && w.ball.y < H, `hole ${i + 1}: left the field`)
          assert.ok(n < 120 * 40, `hole ${i + 1}: shot never ended`)
        }
        assert.ok(pointInPoly(c.green, w.ball.x, w.ball.y), `hole ${i + 1}: ball came to rest off the green at ${w.ball.x},${w.ball.y}`)
        if (w.state === 'rest') for (const s of c.segs) {
          if (s.oneway || (s.gate && w.open[s.gate])) continue
          assert.ok(distToSeg(w.ball.x, w.ball.y, s.ax, s.ay, s.bx, s.by) > BALL_R + s.r - 0.6, `hole ${i + 1}: ball came to rest inside a wall at ${w.ball.x},${w.ball.y}`)
        }
      }
    }
  })
})

test('no tunnelling: a max-power ball never crosses a thin wall or the border', () => {
  const c = compileHole(box({ walls: [{ line: [500, 90, 500, 510], w: 4 }], cup: [800, 300] }))
  for (let a = -80; a <= 80; a += 0.5) {
    const w = createWorld(c)
    shoot(w, deg(a), 1)
    while (w.state === 'moving') {
      step(w)
      assert.ok(w.ball.x < 500 - BALL_R + 0.01 && w.ball.x > 100 + BALL_R - 0.01 && w.ball.y > 100 + BALL_R - 0.01 && w.ball.y < 500 - BALL_R + 0.01, `crossed at angle ${a}`)
    }
  }
  assert.ok(SPEED_CAP * DT < BALL_R, 'one step must be shorter than the ball radius')
})

test('corners: shots into a tilted pillar bounce out cleanly', () => {
  const c = compileHole(box({ walls: [{ rect: [460, 260, 80, 80], rot: 20 }], cup: [800, 120] }))
  for (let a = -30; a <= 30; a += 0.25) {
    const w = createWorld(c)
    shoot(w, deg(a), 1); settle(w)
    assert.equal(w.state === 'rest' || w.state === 'sunk', true)
    assert.ok(Math.hypot(w.ball.x - 500, w.ball.y - 300) > 40 + BALL_R - 1, 'ball ended inside the pillar')
  }
})

test('energy never grows on a passive hole (walls, sand, ice only)', () => {
  const c = compileHole(box({ walls: [{ rect: [450, 200, 60, 90], rot: 15 }, { line: [300, 480, 380, 400], w: 12 }], zones: [{ type: 'sand', circle: [650, 200, 50] }, { type: 'ice', rect: [120, 380, 200, 100] }], cup: [830, 470] }))
  const r = rng(7)
  for (let k = 0; k < 150; k++) {
    const w = createWorld(c)
    shoot(w, r() * Math.PI * 2, 0.3 + r() * 0.7)
    let prev = speed(w)
    while (w.state === 'moving') {
      step(w)
      const far = Math.hypot(w.ball.x - c.cup[0], w.ball.y - c.cup[1]) > CUP_R + 6
      if (far) assert.ok(speed(w) <= prev + 1e-6, `speed grew from ${prev} to ${speed(w)}`)
      prev = speed(w)
    }
  }
})

test('a wall bounce reflects and loses speed', () => {
  const w = createWorld(compileHole(box()))
  shoot(w, 0, 0.8)
  let bounced = false
  for (let i = 0; i < 400 && !bounced; i++) { step(w); if (w.ball.vx < 0) bounced = true }
  assert.ok(bounced)
  assert.ok(speed(w) < MAX_SPEED * 0.8)
  assert.ok(Math.abs(w.ball.vy) < 1e-6, 'a square hit should come straight back')
})

test('surfaces: sand stops the ball sooner than grass, ice later', () => {
  const run = (zones) => { // distance rolled, bounces included
    const w = createWorld(compileHole(box({ zones, tee: [130, 300] })))
    shoot(w, 0, 0.3)
    let d = 0
    while (w.state === 'moving') { const x = w.ball.x; step(w); d += Math.abs(w.ball.x - x) }
    return d
  }
  const grass = run([]), sand = run([{ type: 'sand', rect: [100, 100, 760, 400] }]), ice = run([{ type: 'ice', rect: [100, 100, 760, 400] }])
  assert.ok(sand < grass - 40 && grass < ice - 40, `sand ${sand}, grass ${grass}, ice ${ice}`)
})

test('water: one penalty stroke and back to the last spot', () => {
  const w = createWorld(compileHole(box({ zones: [{ type: 'water', rect: [400, 100, 100, 400] }] })))
  shoot(w, 0, 0.6); settle(w)
  assert.equal(w.state, 'rest'); assert.equal(w.strokes, 2)
  assert.deepEqual([w.ball.x, w.ball.y], [200, 300])
})

test('cup: slow balls drop, fast balls lip out', () => {
  const c = compileHole(box({ cup: [500, 300] }))
  const slow = createWorld(c); shoot(slow, 0, 0.45); settle(slow)
  assert.equal(slow.state, 'sunk'); assert.equal(slow.strokes, 1)
  const fast = createWorld(c); shoot(fast, 0, 1)
  for (let i = 0; i < 60; i++) step(fast)
  assert.equal(fast.state, 'moving'); assert.ok(fast.ball.x > 520, 'a full-power ball should fly over the cup')
})

test('portal: comes out of the other end at the same speed and heading', () => {
  const w = createWorld(compileHole(box({ portals: [{ a: [400, 300], b: [600, 150] }] })))
  shoot(w, 0, 0.5)
  let before = 0
  for (let i = 0; i < 200; i++) { const s = speed(w); step(w); if (w.ball.y < 200) { before = s; break } }
  assert.ok(before > 0, 'never teleported')
  assert.ok(Math.abs(w.ball.x - 600) < 8 && Math.abs(w.ball.y - 150) < 8)
  assert.ok(Math.abs(speed(w) - before) < 12 && w.ball.vx > 0 && Math.abs(w.ball.vy) < 1e-6)
  settle(w)
  assert.ok(w.ball.y < 200, 'should not fall straight back in')
})

test('one-way gate lets the ball through one way only', () => {
  const c = compileHole(box({ oneways: [{ line: [500, 100, 500, 500] }], cup: [840, 480] }))
  const a = createWorld(c); shoot(a, 0, 0.5)
  let maxX = 0
  while (a.state === 'moving') { step(a); maxX = Math.max(maxX, a.ball.x); if (maxX > 520) assert.ok(a.ball.x > 500, 'came back through the gate') }
  assert.ok(maxX > 600, 'should pass left to right')
  const b = createWorld(c); b.ball.x = 700; shoot(b, Math.PI, 0.5); settle(b)
  assert.ok(b.ball.x > 500, 'should not pass right to left')
})

test('button opens its gate', () => {
  const c = compileHole(box({ gates: [{ id: 'd', line: [600, 100, 600, 500] }], buttons: [{ at: [400, 300], opens: 'd' }], cup: [840, 480] }))
  const closed = createWorld(c); closed.ball.y = 200; shoot(closed, 0, 0.7); settle(closed)
  assert.ok(closed.ball.x < 600)
  const w = createWorld(c); shoot(w, 0, 0.7)
  let maxX = 0
  while (w.state === 'moving') { step(w); maxX = Math.max(maxX, w.ball.x) }
  assert.equal(w.open.d, true); assert.ok(maxX > 620)
})

test('boost pad kicks the ball along its arrow', () => {
  const w = createWorld(compileHole(box({ zones: [{ type: 'boost', rect: [300, 260, 60, 80], dir: 270, speed: 600 }] })))
  shoot(w, 0, 0.3)
  for (let i = 0; i < 60; i++) step(w)
  assert.ok(w.ball.vy < -200, 'should be heading up')
})

test('movers cannot crush the ball through a wall or trap it', () => {
  // a slider that slams into the wall on purpose, and a spinner scraping it: worst cases the validator normally forbids
  const hole = box({ tee: [130, 300], movers: [{ type: 'slider', size: [60, 200], from: [300, 300], to: [131, 300], period: 1.5 }, { type: 'spinner', at: [760, 400], len: 110, arms: 4, speed: 3 }] })
  const c = compileHole(hole), r = rng(99)
  for (let k = 0; k < 40; k++) {
    const w = createWorld(c)
    w.ball.x = k % 2 ? 115 + r() * 60 : 700 + r() * 140; w.ball.y = k % 2 ? 210 + r() * 180 : 320 + r() * 160; w.last.x = w.ball.x; w.last.y = w.ball.y
    for (let i = 0; i < 120 * 12; i++) {
      step(w)
      assert.ok(Number.isFinite(w.ball.x + w.ball.y))
      assert.ok(w.ball.x >= 100 + BALL_R - 0.5 && w.ball.x <= 860 - BALL_R + 0.5 && w.ball.y >= 100 + BALL_R - 0.5 && w.ball.y <= 500 - BALL_R + 0.5, `pushed through the wall to ${w.ball.x},${w.ball.y}`)
    }
  }
})

test('deterministic: the same shot gives the same result', () => {
  const c = compileHole(HOLES[8])
  const run = () => { const w = createWorld(c); for (let i = 0; i < 77; i++) step(w); shoot(w, 0.3, 0.83); settle(w); return [w.ball.x, w.ball.y, w.t, w.state] }
  assert.deepEqual(run(), run())
  const w = createWorld(c), k = cloneWorld(w)
  shoot(w, 1, 0.5); shoot(k, 1, 0.5); settle(w); settle(k)
  assert.deepEqual([w.ball.x, w.ball.y], [k.ball.x, k.ball.y])
})

test('aim preview returns a short path and does not touch the real world', () => {
  const w = createWorld(compileHole(HOLES[1]))
  const pts = previewPath(w, 0, 0.8)
  assert.ok(pts.length > 5 && pts.length < 200)
  assert.equal(w.state, 'rest'); assert.equal(w.strokes, 0)
})
