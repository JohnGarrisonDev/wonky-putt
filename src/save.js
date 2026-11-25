// Save data and scoring rules. One JSON blob under "oddvale:wonky-putt" (see kit makeStore).
// The scoring helpers at the top are pure, so tests can import them without a browser.

export const STROKE_LIMIT_OVER = 5 // a hole ends at par + 5 strokes
export const strokeLimit = (par) => par + STROKE_LIMIT_OVER

/** 3 stars = under par, 2 = par, 1 = finished, 0 = not finished. */
export function starsFor(strokes, par) { return !strokes ? 0 : strokes < par ? 3 : strokes === par ? 2 : 1 }

/** Name for a finished hole. */
export function resultName(strokes, par, sunk = true) {
  if (!sunk) return 'Picked up'
  if (strokes === 1) return 'Hole in one!'
  const d = strokes - par
  if (d <= -3) return 'Albatross'
  if (d === -2) return 'Eagle'
  if (d === -1) return 'Birdie'
  if (d === 0) return 'Par'
  if (d === 1) return 'Bogey'
  if (d === 2) return 'Double bogey'
  return 'A wobbly one'
}
const QUIPS = {
  ace: ['The robots are speechless. They often are.', 'One putt. Zero notes.', 'Straight in. Nothing else here is straight.'],
  under: ['Tidy. Suspiciously tidy.', 'The course is filing a complaint.', 'Under par, over the moon.'],
  par: ['Exactly as the robots intended.', 'Perfectly average, in a good way.', 'On the nose.'],
  over: ['The walls send their regards.', 'It went in eventually, which is the main thing.', 'A scenic route.'],
  out: ['The robots have moved the ball on, kindly.', 'We will not speak of this hole again.'],
}
export function resultQuip(strokes, par, sunk, seed = 0) {
  const k = !sunk ? 'out' : strokes === 1 ? 'ace' : strokes < par ? 'under' : strokes === par ? 'par' : 'over'
  return QUIPS[k][seed % QUIPS[k].length]
}
/** Medal for a full round, by total strokes relative to total par. */
export function roundMedal(diff) {
  if (diff <= -14) return { id: 'legend', name: 'Odd Legend', line: 'The windmill bows to you.' }
  if (diff <= -7) return { id: 'gold', name: 'Golden Gear', line: 'Shiny. Slightly bent. Yours.' }
  if (diff <= 0) return { id: 'silver', name: 'Silver Sprocket', line: 'Par or better over eighteen wonky holes.' }
  if (diff <= 12) return { id: 'bronze', name: 'Bronze Bolt', line: 'A solid round with some scenery.' }
  return { id: 'tin', name: 'Tin Wobble', line: 'You finished. The robots clapped anyway.' }
}
export const fmtDiff = (d) => (d === 0 ? 'E' : d > 0 ? '+' + d : String(d).replace('-', '−'))

/** Ball skins, unlocked by total stars. fill = ball, ink = face lines, eye = big eye colour. */
export const SKINS = [
  { id: 'orange', name: 'Odd Orange', need: 0, fill: '#FF5B2E', ink: '#17131F', eye: '#FBF6EC', trail: '#FF5B2E' },
  { id: 'mint', name: 'Minty', need: 8, fill: '#B8F7E2', ink: '#17131F', eye: '#FF5B2E', trail: '#FBF6EC' },
  { id: 'bubblegum', name: 'Bubblegum', need: 16, fill: '#FF8FC7', ink: '#17131F', eye: '#FBF6EC', trail: '#FF8FC7' },
  { id: 'blueberry', name: 'Blueberry', need: 24, fill: '#5B5BFF', ink: '#FBF6EC', eye: '#FFC93C', trail: '#5B5BFF' },
  { id: 'sunny', name: 'Sunny Side', need: 32, fill: '#FFC93C', ink: '#17131F', eye: '#FF5B2E', trail: '#FFC93C' },
  { id: 'night', name: 'Night Shift', need: 40, fill: '#17131F', ink: '#FBF6EC', eye: '#FF5B2E', trail: '#17131F' },
  { id: 'paper', name: 'Fresh Paper', need: 48, fill: '#FBF6EC', ink: '#17131F', eye: '#FF5B2E', trail: '#FBF6EC', shine: true },
]

// v2 (1.1.0) added `daily`. Older saves simply get an empty daily block.
const DAILY_DEFAULTS = { history: {}, cur: null, bestStreak: 0, practice: null }
const DEFAULTS = { v: 2, best: {}, unlocked: 0, aces: 0, aceHoles: {}, round: null, bestRound: null, rounds: 0, skin: 'orange', daily: DAILY_DEFAULTS }
const isKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k)
const posInt = (n) => Number.isInteger(n) && n > 0

/** Repair the daily block in place: history entries { s: strokes, p: par, k: 1 holed / 0 not },
 *  cur = the official attempt in progress { date, strokes, x, y }, practice = { date, best }. */
export function repairDaily(d) {
  let dl = d.daily
  if (!dl || typeof dl !== 'object' || Array.isArray(dl)) dl = d.daily = JSON.parse(JSON.stringify(DAILY_DEFAULTS))
  const hist = dl.history && typeof dl.history === 'object' && !Array.isArray(dl.history) ? dl.history : {}
  dl.history = {}
  for (const [k, r] of Object.entries(hist)) {
    if (isKey(k) && r && posInt(r.s) && posInt(r.p) && r.s <= 20 && r.p <= 5) dl.history[k] = { s: r.s, p: r.p, k: r.k === 1 ? 1 : 0 }
  }
  const c = dl.cur
  dl.cur = c && isKey(c.date) && Number.isInteger(c.strokes) && c.strokes >= 0 && c.strokes <= 20 && Number.isFinite(c.x) && Number.isFinite(c.y) && !dl.history[c.date] ? { date: c.date, strokes: c.strokes, x: c.x, y: c.y } : null
  dl.bestStreak = Number.isInteger(dl.bestStreak) && dl.bestStreak > 0 ? dl.bestStreak : 0
  const pr = dl.practice
  dl.practice = pr && isKey(pr.date) && posInt(pr.best) ? { date: pr.date, best: pr.best } : null
  return dl
}

/** Wrap a kit store with game-specific helpers. `store` comes from makeStore('wonky-putt', defaults()). */
export const defaults = () => JSON.parse(JSON.stringify(DEFAULTS))
export function makeSave(store, holes) {
  const d = store.data
  // repair anything odd in old or hand-edited data
  if (!d.best || typeof d.best !== 'object') d.best = {}
  if (!d.aceHoles || typeof d.aceHoles !== 'object') d.aceHoles = {}
  if (!Number.isFinite(d.unlocked)) d.unlocked = 0
  d.unlocked = Math.max(0, Math.min(holes.length - 1, d.unlocked | 0))
  if (!Number.isFinite(d.aces)) d.aces = 0
  if (d.round && !(Array.isArray(d.round.scores) && Number.isFinite(d.round.i) && d.round.i >= 0 && d.round.i < holes.length && d.round.scores.length === d.round.i)) d.round = null
  if (!SKINS.some((s) => s.id === d.skin)) d.skin = 'orange'
  repairDaily(d)
  d.v = 2
  const api = {
    data: d,
    save: () => store.save(),
    best: (i) => (Number.isFinite(d.best[i]) ? d.best[i] : 0),
    stars: (i) => starsFor(api.best(i), holes[i].par),
    totalStars: () => holes.reduce((n, _, i) => n + api.stars(i), 0),
    isUnlocked: (i) => i <= d.unlocked,
    skin: () => { const s = SKINS.find((k) => k.id === d.skin) || SKINS[0]; return api.totalStars() >= s.need ? s : SKINS[0] },
    /** Record a finished hole. Returns { newBest, starsBefore, starsAfter, newSkins }. */
    recordHole(i, strokes, sunk) {
      const before = api.totalStars(), prev = api.best(i)
      let newBest = false
      if (sunk && (!prev || strokes < prev)) { d.best[i] = strokes; newBest = true }
      if (sunk && strokes === 1) { d.aces++; d.aceHoles[i] = (d.aceHoles[i] || 0) + 1 }
      if (i + 1 > d.unlocked) d.unlocked = Math.min(holes.length - 1, i + 1)
      const after = api.totalStars()
      store.save()
      return { newBest, prev, starsBefore: before, starsAfter: after, newSkins: SKINS.filter((s) => s.need > before && s.need <= after) }
    },
    /** Record a finished round. Returns true when it is a new best total. */
    recordRound(total) {
      d.rounds++; d.round = null
      const isBest = !Number.isFinite(d.bestRound) || d.bestRound === null || total < d.bestRound
      if (isBest) d.bestRound = total
      store.save()
      return isBest
    },
    /** Record the official daily attempt. Returns the stored entry. */
    recordDaily(key, strokes, par, sunk) {
      const rec = { s: strokes, p: par, k: sunk ? 1 : 0 }
      d.daily.history[key] = rec
      if (d.daily.cur && d.daily.cur.date === key) d.daily.cur = null
      // keep the history small: the last 400 days are plenty for streaks and the strip
      const keys = Object.keys(d.daily.history).sort()
      for (let i = 0; i < keys.length - 400; i++) delete d.daily.history[keys[i]]
      store.save()
      return rec
    },
  }
  return api
}
