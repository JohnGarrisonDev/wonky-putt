// Scoring rules and save-data repair.
import test from 'node:test'
import assert from 'node:assert/strict'
import { HOLES } from '../src/holes.js'
import { starsFor, resultName, roundMedal, fmtDiff, strokeLimit, makeSave, defaults, SKINS } from '../src/save.js'

const fakeStore = (data) => ({ data: { ...defaults(), ...data }, saved: 0, save() { this.saved++ } })

test('stars and result names', () => {
  assert.equal(starsFor(0, 3), 0); assert.equal(starsFor(2, 3), 3); assert.equal(starsFor(3, 3), 2); assert.equal(starsFor(6, 3), 1)
  assert.equal(resultName(1, 3), 'Hole in one!'); assert.equal(resultName(2, 3), 'Birdie'); assert.equal(resultName(3, 3), 'Par')
  assert.equal(resultName(4, 3), 'Bogey'); assert.equal(resultName(2, 4), 'Eagle'); assert.equal(resultName(8, 3, false), 'Picked up')
  assert.equal(strokeLimit(3), 8)
  assert.equal(fmtDiff(0), 'E'); assert.equal(fmtDiff(3), '+3'); assert.equal(fmtDiff(-2), '−2')
  assert.equal(roundMedal(-20).id, 'legend'); assert.equal(roundMedal(0).id, 'silver'); assert.equal(roundMedal(40).id, 'tin')
})

test('recording holes: bests, unlocks, aces, skins', () => {
  const s = makeSave(fakeStore({}), HOLES)
  assert.equal(s.isUnlocked(0), true); assert.equal(s.isUnlocked(1), false)
  let r = s.recordHole(0, 3, true)
  assert.equal(r.newBest, true); assert.equal(s.best(0), 3); assert.equal(s.isUnlocked(1), true); assert.equal(s.stars(0), 1)
  r = s.recordHole(0, 4, true); assert.equal(r.newBest, false); assert.equal(s.best(0), 3)
  r = s.recordHole(0, 1, true); assert.equal(s.data.aces, 1); assert.equal(s.stars(0), 3)
  s.recordHole(1, strokeLimit(HOLES[1].par), false)
  assert.equal(s.best(1), 0, 'a picked-up hole sets no best'); assert.equal(s.isUnlocked(2), true, 'but still unlocks the next hole')
  for (let i = 0; i < 6; i++) s.recordHole(i, 1, true)
  assert.ok(s.totalStars() >= SKINS[1].need)
  s.data.skin = SKINS[1].id; assert.equal(s.skin().id, SKINS[1].id)
  s.data.skin = SKINS[SKINS.length - 1].id; assert.equal(s.skin().id, 'orange', 'a locked skin falls back to the default')
  assert.equal(s.recordRound(60), true); assert.equal(s.recordRound(64), false); assert.equal(s.data.bestRound, 60); assert.equal(s.data.round, null)
})

test('broken save data is repaired, not fatal', () => {
  const s = makeSave(fakeStore({ best: 'nope', unlocked: 'x', aces: null, round: { i: 3, scores: [2] }, skin: 'ghost', aceHoles: 5 }), HOLES)
  assert.deepEqual(s.data.best, {}); assert.equal(s.data.unlocked, 0); assert.equal(s.data.aces, 0); assert.equal(s.data.round, null); assert.equal(s.data.skin, 'orange')
  assert.equal(s.totalStars(), 0)
  const ok = makeSave(fakeStore({ round: { i: 2, scores: [2, 3], cur: null, mulligans: 0 }, unlocked: 99 }), HOLES)
  assert.equal(ok.data.round.i, 2); assert.equal(ok.data.unlocked, HOLES.length - 1)
})
