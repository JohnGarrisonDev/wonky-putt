// Daily hole: one generated hole per local calendar date, the same for everyone. DOM-free and pure.
//
// How a date becomes a hole:
//   1. seed = hashString('wonky-putt:' + date). makeRng(seed) hands out one sub-seed per "attempt".
//   2. dailyCandidate(date, attempt) builds a hole from that sub-seed with integer maths only
//      (no Math.sin/cos/atan2/hypot), so every browser builds byte-identical hole data.
//   3. Not every candidate is fair. tools/make-dailies.mjs runs the headless solver over the candidates
//      (in node, once) and writes the first fair attempt number and its par into src/daily-table.js.
//      The game only reads that table, so no physics runs at load and float differences between
//      browsers can never change which hole you get.
//
// READ AGENTS.md ("Daily hole") BEFORE CHANGING ANYTHING HERE: any change to this file, the kit's makeRng
// or hashString, or the order or number of rng calls changes every published daily.
import { makeRng, hashString } from '../kit/kit.js'
import { DAILY_START, DAILY_TABLE } from './daily-table.js'

// ---------------------------------------------------------------- dates
const pad = (n) => String(n).padStart(2, '0')
/** Local calendar date as YYYY-MM-DD. */
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const isDateKey = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
/** Shift a YYYY-MM-DD key by whole days (noon, so daylight saving never skips a day). */
export function shiftDay(key, days) {
  const [y, m, d] = key.split('-').map(Number)
  return dateKey(new Date(y, m - 1, d + days, 12))
}
/** Day of the week for a key, 0 = Sunday. Integer maths (Sakamoto), no Date or time zone involved. */
export function weekday(key) {
  let [y, m, d] = key.split('-').map(Number)
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
  if (m < 3) y -= 1
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[m - 1] + d) % 7
}
/** Whole days from a to b (b - a). UTC maths, so it is exact. */
export function daysBetween(a, b) {
  const u = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((u(b) - u(a)) / 86400000)
}
/** Milliseconds from d to the next local midnight, when the next daily hole rolls out. */
export function msToMidnight(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - d.getTime() }
/** "5h 07m", "42m", "1m" (rounded up, so it never says 0m while time is left), or "" once it is time. */
export function fmtCountdown(ms) {
  if (!(ms > 0)) return ''
  const m = Math.ceil(ms / 60000), h = Math.floor(m / 60), mm = m % 60
  return h ? `${h}h ${String(mm).padStart(2, '0')}m` : `${mm}m`
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "25 Nov" */
export const shortDate = (key) => { const [, m, d] = key.split('-').map(Number); return `${d} ${MONTHS[m - 1]}` }
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ---------------------------------------------------------------- difficulty by day of the week
/** n = how many mechanics are combined, par = the allowed par range. Index 0 = Sunday. Gentle early in the week. */
export const DAY_PLAN = [
  { n: 3, par: [3, 5], label: 'spicy' },  // Sunday
  { n: 1, par: [2, 3], label: 'gentle' }, // Monday
  { n: 1, par: [2, 3], label: 'gentle' }, // Tuesday
  { n: 2, par: [2, 4], label: 'medium' }, // Wednesday
  { n: 2, par: [3, 4], label: 'medium' }, // Thursday
  { n: 2, par: [3, 4], label: 'tricky' }, // Friday
  { n: 3, par: [3, 5], label: 'spicy' },  // Saturday
]

// ---------------------------------------------------------------- names and hints
export const MECHS = ['sand', 'water', 'ice', 'slope', 'bumpers', 'windmill', 'portals', 'boost', 'sliders', 'blocks']
const MECH_WEIGHT = { sand: 10, water: 10, ice: 7, slope: 8, bumpers: 8, windmill: 8, portals: 6, boost: 6, sliders: 7, blocks: 6 }
const SOLO = {
  sand: ['Sandy Situation', 'Beach Please', 'Grit Happens', 'Dune Deal', 'Sand-wiched'],
  water: ['Splash Zone', 'Puddle Trouble', 'Moat Ado', 'Wet Paint', 'Soggy Bottom'],
  ice: ['Ice to Meet You', 'Slip Knot', 'Cold Feet', 'Polar Putter', 'Brr-die Chance'],
  slope: ['Downhill From Here', 'Uphill Both Ways', 'The Tilt', 'Lean On It', 'Off Kilter'],
  bumpers: ['Boing Theory', 'Bumper Sticker', 'Pinball Wizardry', 'Boing Boing', 'Bounce House'],
  windmill: ['Spin Cycle', 'Fan Mail', 'Whirly Gig', 'Mill About', 'Blade Waltz'],
  portals: ['Pipe Down', 'Tube Rude', 'Wormhole Hello', 'Down the Tubes', 'Now You See It'],
  boost: ['Zoom Service', 'Fast Lane', 'Rocket Putt', 'Turbo Trouble', 'Full Send'],
  sliders: ['Block Party', 'Slide Show', 'Shuffle Board', 'Mind the Doors', 'Push and Shove'],
  blocks: ['Stone Me', 'Block Head', 'Wonky Bricks', 'Chunky Monkey', 'Rubble Trouble'],
}
const ADJ = {
  sand: ['Sandy', 'Gritty', 'Dusty'], water: ['Soggy', 'Damp', 'Drippy'], ice: ['Frosty', 'Slippy', 'Chilly'], slope: ['Tilted', 'Leaning', 'Lopsided'], bumpers: ['Bouncy', 'Boingy', 'Springy'],
  windmill: ['Whirly', 'Breezy', 'Spinny'], portals: ['Loopy', 'Tubular', 'Twisty'], boost: ['Turbo', 'Zippy', 'Speedy'], sliders: ['Shifty', 'Shuffly', 'Nudgy'], blocks: ['Lumpy', 'Chunky', 'Blocky'],
}
const NOUN = {
  sand: ['Bunker', 'Beach'], water: ['Puddle', 'Moat'], ice: ['Rink', 'Freeze'], slope: ['Hill', 'Tilt'], bumpers: ['Bumpers', 'Pinball'],
  windmill: ['Windmill', 'Whirl'], portals: ['Pipes', 'Plumbing'], boost: ['Booster', 'Launch'], sliders: ['Shuffle', 'Sliders'], blocks: ['Bricks', 'Rubble'],
}
const ANY_NOUN = ['Business', 'Affair', 'Pickle', 'Caper', 'Kerfuffle', 'Shenanigans', 'Fiasco', 'Wobble', 'Gambit', 'Muddle', 'Hullabaloo', 'Rigmarole', 'Palaver', 'Escapade', 'Conundrum']
const HINTS = {
  sand: 'Sand eats speed. Hit it firm or go around.',
  water: 'Water costs a stroke and sends you back.',
  ice: 'Ice keeps the ball rolling. Ease off.',
  slope: 'The arrows push. Aim against them.',
  bumpers: 'Bumpers kick back. Use them or dodge them.',
  windmill: 'Wait for a gap between the blades.',
  portals: 'In one pipe, out the other, same heading.',
  boost: 'Roll over the booster to fly across.',
  sliders: 'The blocks keep moving. Time it.',
  blocks: 'Bank off the wonky blocks.',
}

// ---------------------------------------------------------------- the generator
const BALL_R = 10
const FW = 960, FH = 600

// Generator revisions, chosen by date so a published daily never changes (see AGENTS.md, "Daily hole").
// GEN2 (1.4.0, dates from GEN2_START): a sand bunker may not touch a wall or come within a ball radius of it (a room divider, the U-turn wall, a windmill's
// funnel blocks). The check makes no rng calls; it only throws such a candidate away, so every candidate that GEN2 keeps
// is byte-identical to what GEN1 builds, and dates before GEN2_START are untouched.
export const GEN2_START = '2026-11-28'

/** One candidate hole for a date. attempt 0, 1, 2 ... are independent candidates from the same date seed. */
export function dailyCandidate(key, attempt = 0) {
  const top = makeRng(hashString('wonky-putt:' + key))
  let sub = 0
  for (let k = 0; k <= attempt; k++) sub = Math.floor(top() * 4294967296)
  return buildCandidate(makeRng(sub), weekday(key), daysBetween(GEN2_START, key) >= 0 ? 2 : 1)
}

function buildCandidate(rng, wd, gen = 1) {
  const ri = (lo, hi) => lo + rng.int(hi - lo + 1)
  const chance = (pct) => rng.int(100) < pct
  const pick = (arr) => arr[rng.int(arr.length)]
  const plan = DAY_PLAN[wd]

  // which mechanics (weighted, no repeats)
  const mechs = []
  while (mechs.length < plan.n) {
    const pool = MECHS.filter((m) => !mechs.includes(m)), total = pool.reduce((n, m) => n + MECH_WEIGHT[m], 0)
    let r = rng.int(total), m = pool[0]
    for (const p of pool) { if (r < MECH_WEIGHT[p]) { m = p; break } r -= MECH_WEIGHT[p] }
    mechs.push(m)
  }
  const needsRooms = mechs.includes('portals')
  const kinds = needsRooms ? [['rooms', 1], ['uturn', 1]] : [['lane', 26], ['dogleg', 22], ['uturn', 16], ['rooms', 20], ['bowl', 16]]
  let kr = rng.int(kinds.reduce((n, k) => n + k[1], 0)), kind = kinds[0][0]
  for (const [k, wgt] of kinds) { if (kr < wgt) { kind = k; break } kr -= wgt }

  const L = layout(kind, needsRooms, ri, chance)
  const hole = { name: '', par: 3, hint: '', tee: L.tee, cup: L.cup, green: L.green, walls: L.walls, zones: [], bumpers: [], movers: [], portals: [], decor: [] }
  const keep = [{ c: [L.tee[0], L.tee[1], 46] }, { c: [L.cup[0], L.cup[1], 46] }]
  const ctx = { rng, ri, chance, pick, L, hole, keep, ok: true, gen }

  // each mechanic gets its own stretch of the tee-to-cup path, in a random order
  const order = mechs.slice()
  for (let i = order.length - 1; i > 0; i--) { const j = rng.int(i + 1), t = order[i]; order[i] = order[j]; order[j] = t }
  const span = Math.floor(700 / order.length)
  // ice and slopes go in first so the solid things placed later sit on top of them
  const rank = (m) => (m === 'ice' ? 0 : m === 'slope' ? 1 : 2)
  const jobs = order.map((m, i) => ({ m, slot: [180 + i * span, 180 + (i + 1) * span] })).sort((a, b) => rank(a.m) - rank(b.m))
  for (const j of jobs) { if (!PLACE[j.m](ctx, j.slot)) { ctx.ok = false; break } }

  // drop empty lists so the data stays tidy
  for (const k of ['walls', 'zones', 'bumpers', 'movers', 'portals']) if (!hole[k].length) delete hole[k]

  // mirror for variety (all integer)
  const fx = chance(50), fy = chance(50)
  if (fx || fy) mirror(hole, fx, fy)

  hole.decor = decor(hole, ri, pick)
  hole.name = nameFor(mechs, pick, chance)
  hole.hint = HINTS[mechs[0]]
  hole.mechs = mechs
  hole.kind = kind
  return { hole, ok: ctx.ok }
}

// ---------- layouts. Base orientation: tee on the left. segs describe the path from tee to cup:
// axis 'x' or 'y' is the travel axis, a0 -> a1 the travel range, lo..hi the safe across-range inside the green.
function layout(kind, full, ri, chance) {
  const mid = (a, b) => Math.floor((a + b) / 2)
  if (kind === 'lane') {
    const cy = ri(280, 320), half = ri(128, 172), t = cy - half, b = cy + half
    const x0 = ri(66, 96), x1 = ri(864, 894)
    const green = [[x0, t + ri(-12, 12)], [ri(400, 560), t + ri(-28, 10)], [x1, t + ri(-12, 12)], [x1 + ri(-8, 4), b + ri(-12, 12)], [ri(400, 560), b + ri(-10, 28)], [x0 + ri(-4, 8), b + ri(-12, 12)]]
    const tee = [x0 + ri(62, 90), cy + ri(-45, 45)], cup = [x1 - ri(70, 110), cy + ri(-60, 60)]
    return { green, tee, cup, walls: [], segs: [{ axis: 'x', a0: tee[0], a1: cup[0], lo: t + 24, hi: b - 24 }] }
  }
  if (kind === 'dogleg') {
    const x0 = ri(66, 92), yb0 = ri(300, 340), yb1 = ri(490, 516), xa0 = ri(620, 690), xa1 = ri(856, 890), ya = ri(66, 100)
    const green = [[x0, yb0 + ri(-10, 10)], [xa0, yb0 + ri(-10, 10)], [xa0 + ri(-10, 10), ya + ri(0, 16)], [xa1, ya + ri(-8, 8)], [xa1 + ri(-6, 4), yb1 - ri(50, 110)], [xa1 - ri(50, 110), yb1 + ri(-4, 6)], [x0 + ri(-4, 8), yb1 + ri(-8, 8)]]
    const tee = [x0 + ri(60, 90), mid(yb0, yb1) + ri(-20, 20)], cup = [mid(xa0, xa1) + ri(-25, 25), ya + ri(70, 110)]
    return {
      green, tee, cup, walls: [],
      segs: [{ axis: 'x', a0: tee[0], a1: mid(xa0, xa1), lo: yb0 + 22, hi: yb1 - 22 }, { axis: 'y', a0: mid(yb0, yb1), a1: cup[1], lo: xa0 + 22, hi: xa1 - 18 }],
    }
  }
  if (kind === 'uturn') {
    const x0 = ri(66, 92), x1 = ri(820, 892), y0 = ri(70, 100), y1 = ri(500, 530), c1 = ri(50, 150), c2 = ri(50, 150)
    const green = [[x0, y0 + ri(-6, 6)], [x1 - c1, y0 + ri(-6, 6)], [x1, y0 + c1 + ri(-6, 6)], [x1 + ri(-6, 6), y1 - c2], [x1 - c2, y1 + ri(-6, 6)], [x0 + ri(-4, 6), y1 + ri(-6, 6)]]
    const ym = mid(y0, y1) + ri(-16, 16), wt = ri(30, 44), xw = full ? x1 + 40 : ri(560, 660)
    const walls = [{ rect: [x0 - 30, ym - (wt >> 1), xw - x0 + 30, wt] }]
    const tee = [x0 + ri(60, 100), mid(y0, ym) + ri(-20, 20)], cup = [x0 + ri(70, 150), mid(ym, y1) + ri(-20, 20)]
    const up = { lo: y0 + 18, hi: ym - (wt >> 1) - 16 }, dn = { lo: ym + (wt >> 1) + 16, hi: y1 - 18 }
    const turnX = full ? x1 - 90 : mid(xw, x1)
    const segs = full
      ? [{ axis: 'x', a0: tee[0], a1: turnX, ...up, room: 0 }, { axis: 'x', a0: turnX, a1: cup[0], ...dn, room: 1 }]
      : [{ axis: 'x', a0: tee[0], a1: turnX, ...up }, { axis: 'y', a0: mid(y0, ym), a1: mid(ym, y1), lo: xw + 18, hi: x1 - 40 }, { axis: 'x', a0: turnX, a1: cup[0], ...dn }]
    return { green, tee, cup, walls, segs, full }
  }
  if (kind === 'rooms') {
    const x0 = ri(66, 92), x1 = ri(866, 894), y0 = ri(84, 120), y1 = ri(480, 516)
    const green = [[x0, y0 + ri(-10, 10)], [ri(300, 400), y0 + ri(-20, 6)], [x1, y0 + ri(-10, 10)], [x1 + ri(-6, 4), y1 + ri(-10, 10)], [x0 + ri(-4, 6), y1 + ri(-10, 10)]]
    const xd = ri(440, 520), dw = ri(24, 36), l = xd - (dw >> 1)
    const walls = []
    if (full) walls.push({ rect: [l, y0 - 40, dw, y1 - y0 + 80] })
    else {
      const gw = ri(110, 150), gc = ri(y0 + 40 + (gw >> 1), y1 - 40 - (gw >> 1))
      walls.push({ rect: [l, y0 - 40, dw, gc - (gw >> 1) - (y0 - 40)] }, { rect: [l, gc + (gw >> 1), dw, y1 + 40 - (gc + (gw >> 1))] })
    }
    const tee = [x0 + ri(60, 110), ri(y0 + 70, y1 - 70)], cup = [x1 - ri(80, 140), ri(y0 + 70, y1 - 70)]
    const lo = y0 + 30, hi = y1 - 22
    return { green, tee, cup, walls, full, segs: [{ axis: 'x', a0: tee[0], a1: l - 14, lo, hi, room: 0 }, { axis: 'x', a0: l + dw + 14, a1: cup[0], lo, hi, room: 1 }] }
  }
  // bowl: a wobbly octagon, open in the middle
  const cx = 480 + ri(-10, 10), cy = 300 + ri(-10, 10), rx = ri(370, 405), ry = ri(170, 215)
  const K = [[-100, -45], [-45, -100], [45, -100], [100, -45], [100, 45], [45, 100], [-45, 100], [-100, 45]]
  const green = K.map(([kx, ky]) => [cx + Math.trunc((rx * kx) / 100) + ri(-14, 14), cy + Math.trunc((ry * ky) / 100) + ri(-12, 12)])
  const tee = [cx - rx + ri(80, 110), cy + ri(-40, 40)], cup = [cx + rx - ri(85, 125), cy + ri(-50, 50)]
  return { green, tee, cup, walls: [], segs: [{ axis: 'x', a0: tee[0], a1: cup[0], lo: cy - Math.trunc((ry * 3) / 5), hi: cy + Math.trunc((ry * 3) / 5) }] }
}

// ---------- path helpers (all integer)
function segAt(L, tpm) {
  const total = L.segs.reduce((n, s) => n + Math.abs(s.a1 - s.a0), 0)
  let target = Math.floor((total * tpm) / 1000)
  for (const s of L.segs) {
    const len = Math.abs(s.a1 - s.a0)
    if (target <= len || s === L.segs[L.segs.length - 1]) {
      // stay clear of the ends of a stretch (dividers, turns) when there is room
      const m = Math.min(60, Math.max(0, (len >> 1) - 1)), t = Math.max(m, Math.min(len - m, target))
      return { s, along: s.a0 + Math.sign(s.a1 - s.a0) * t }
    }
    target -= len
  }
}
const xy = (s, along, across) => (s.axis === 'x' ? [along, across] : [across, along])
function rectL(s, a0, a1, c0, c1) {
  const amin = Math.min(a0, a1), amax = Math.max(a0, a1), cmin = Math.min(c0, c1), cmax = Math.max(c0, c1)
  return s.axis === 'x' ? [amin, cmin, amax - amin, cmax - cmin] : [cmin, amin, cmax - cmin, amax - amin]
}
const travelDir = (s) => (s.axis === 'x' ? (s.a1 >= s.a0 ? 0 : 180) : (s.a1 >= s.a0 ? 90 : 270))
const acrossDir = (s, sign) => (s.axis === 'x' ? (sign > 0 ? 90 : 270) : (sign > 0 ? 0 : 180))
const sq = (v) => v * v
// keep-out list: circles { c: [x, y, r] } and rects { r: [x, y, w, h] }
function free(keep, x, y, r) {
  for (const k of keep) {
    if (k.c) { if (sq(x - k.c[0]) + sq(y - k.c[1]) < sq(r + k.c[2])) return false }
    else {
      const [rx, ry, rw, rh] = k.r, qx = Math.max(rx, Math.min(x, rx + rw)), qy = Math.max(ry, Math.min(y, ry + rh))
      if (sq(x - qx) + sq(y - qy) < sq(r)) return false
    }
  }
  return true
}
/** Does a rect (grown by margin) touch any keep-out? */
function freeRect(keep, rect, margin = 0) {
  const [x0, y0, w, h] = rect, x1 = x0 + w, y1 = y0 + h
  for (const k of keep) {
    if (k.c) {
      const qx = Math.max(x0, Math.min(k.c[0], x1)), qy = Math.max(y0, Math.min(k.c[1], y1))
      if (sq(k.c[0] - qx) + sq(k.c[1] - qy) < sq(k.c[2] + margin)) return false
    } else {
      const [rx, ry, rw, rh] = k.r
      if (rx < x1 + margin && rx + rw > x0 - margin && ry < y1 + margin && ry + rh > y0 - margin) return false
    }
  }
  return true
}
/** GEN2: does a circle (grown by a ball radius) touch any rect wall placed so far? Rotated rects count with their full turn. */
function touchesWall(hole, x, y, r) {
  for (const wl of hole.walls) {
    if (!wl.rect) continue
    const [rx, ry, rw, rh] = wl.rect, m = wl.rot ? Math.ceil(Math.max(rw, rh) / 4) : 0
    const qx = Math.max(rx - m, Math.min(x, rx + rw + m)), qy = Math.max(ry - m, Math.min(y, ry + rh + m))
    if (sq(x - qx) + sq(y - qy) < sq(r + BALL_R)) return true
  }
  return false
}
const inRect = (r, x, y) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]
const centre = (slot) => (slot[0] + slot[1]) >> 1

// ---------- mechanics. Each returns false when it cannot fit (the candidate is then thrown away).
const PLACE = {
  sand(ctx, slot) {
    const { ri, chance, L, hole, keep } = ctx
    if (chance(40)) {
      // guard bunkers by the cup
      const s = L.segs[L.segs.length - 1], dir = Math.sign(s.a1 - s.a0) || 1
      const ca = s.axis === 'x' ? hole.cup[0] : hole.cup[1], cc = s.axis === 'x' ? hole.cup[1] : hole.cup[0]
      const spots = chance(50) ? [[-dir, 0]] : chance(50) ? [[0, -1], [0, 1]] : [[0, ctx.pick([-1, 1])]]
      for (const [da, dc] of spots) {
        const r = ri(34, 48), gap = r + ri(26, 40)
        const [x, y] = xy(s, ca + da * gap + (da ? 0 : ri(-24, 24)), cc + dc * gap + (dc ? 0 : ri(-18, 18)))
        if (!free(keep.slice(2), x, y, r + 8)) return false
        if (ctx.gen >= 2 && touchesWall(hole, x, y, r)) return false
        hole.zones.push({ type: 'sand', circle: [x, y, r] })
        keep.push({ c: [x, y, r] })
      }
      return true
    }
    const { s, along } = segAt(L, centre(slot)), w = s.hi - s.lo
    const r = Math.max(40, Math.min(ri(55, 110), (w >> 1) - 5)), across = ((s.lo + s.hi) >> 1) + ri(-Math.floor(w / 5), Math.floor(w / 5))
    const [x, y] = xy(s, along, across)
    if (!free(keep, x, y, r + 4)) return false
    if (ctx.gen >= 2 && touchesWall(hole, x, y, r)) return false
    hole.zones.push({ type: 'sand', circle: [x, y, r] })
    keep.push({ c: [x, y, r] })
    return true
  },
  water(ctx, slot) {
    const { ri, chance, L, hole, keep } = ctx
    const { s, along } = segAt(L, centre(slot)), w = s.hi - s.lo
    if (w >= 290 && chance(35)) {
      const r = ri(45, Math.min(70, (w - 190) >> 1)), [x, y] = xy(s, along, (s.lo + s.hi) >> 1)
      if (!free(keep, x, y, r + 6)) return false
      hole.zones.push({ type: 'water', circle: [x, y, r] })
      keep.push({ c: [x, y, r] })
      return true
    }
    const thick = ri(64, 100), gap = ri(105, 135)
    if (w - gap < 50) return false
    const rect = ctx.pick([true, false]) ? rectL(s, along - (thick >> 1), along + (thick >> 1), s.lo - 60, s.hi - gap) : rectL(s, along - (thick >> 1), along + (thick >> 1), s.lo + gap, s.hi + 60)
    if (!freeRect(keep, rect, 4)) return false
    hole.zones.push({ type: 'water', rect, rot: ri(-3, 3) })
    keep.push({ r: [rect[0] - 6, rect[1] - 6, rect[2] + 12, rect[3] + 12] })
    return true
  },
  ice(ctx, slot) {
    const { ri, chance, L, hole } = ctx
    if (chance(35)) { hole.zones.push({ type: 'ice', rect: [0, 0, FW, FH] }); return true }
    const { s, along } = segAt(L, centre(slot)), half = ri(110, 170)
    hole.zones.push({ type: 'ice', rect: rectL(s, along - half, along + half, s.lo - 60, s.hi + 60) })
    return true
  },
  slope(ctx, slot) {
    const { ri, chance, L, hole } = ctx
    const { s, along } = segAt(L, centre(slot)), half = ri(100, 160)
    const rect = rectL(s, along - half, along + half, s.lo - 60, s.hi + 60)
    if (inRect(rect, hole.tee[0], hole.tee[1])) return false
    if (chance(25)) hole.zones.push({ type: 'slope', rect, dir: (travelDir(s) + 180) % 360, force: ri(200, 240) })
    else hole.zones.push({ type: 'slope', rect, dir: acrossDir(s, ctx.pick([-1, 1])), force: ri(220, 300) })
    return true
  },
  bumpers(ctx, slot) {
    const { ri, L, hole, keep } = ctx
    const n = ri(2, 3), { s, along } = segAt(L, centre(slot))
    let placed = 0
    for (let tries = 0; tries < 30 && placed < n; tries++) {
      const r = ri(22, 30), [x, y] = xy(s, along + ri(-90, 90), ri(s.lo + 45, s.hi - 45))
      if (!free(keep, x, y, r + 2 * BALL_R + 14)) continue
      hole.bumpers.push([x, y, r]); keep.push({ c: [x, y, r] }); placed++
    }
    return placed >= 2
  },
  windmill(ctx, slot) {
    const { ri, L, hole, keep, pick } = ctx
    const { s, along } = segAt(L, centre(slot)), w = s.hi - s.lo
    let len = ri(56, 74)
    const maxReach = ((w + 24) >> 1) - 24 - 12
    if (len + 7 > maxReach) len = maxReach - 7
    if (len < 48) return false
    const reach = len + 7, across = ((s.lo + s.hi) >> 1) + ri(-10, 10), [x, y] = xy(s, along, across)
    if (!free(keep, x, y, reach + 2 * BALL_R + 10)) return false
    hole.movers.push({ type: 'spinner', at: [x, y], len, arms: pick([2, 3, 3, 4]), speed: pick([-1, 1]) * ri(100, 150) / 100, phase: ri(0, 359) })
    keep.push({ c: [x, y, reach + 6] })
    // two blocks that funnel the ball through the blades
    const gapR = reach + 2 * BALL_R + 10, thick = ri(28, 40)
    for (const [c0, c1] of [[s.lo - 60, across - gapR], [across + gapR, s.hi + 60]]) {
      if (Math.abs(c1 - c0) < 84) continue
      const rect = rectL(s, along - (thick >> 1), along + (thick >> 1), c0, c1)
      if (!freeRect(keep, rect, 4)) return false
      hole.walls.push({ rect })
      keep.push({ r: rect })
    }
    return true
  },
  portals(ctx) {
    const { ri, L, hole, keep } = ctx
    const r0 = L.segs.find((q) => q.room === 0), r1 = L.segs.find((q) => q.room === 1)
    if (!r0 || !r1) return false
    let a = null, b = null
    for (let t = 0; t < 30 && !a; t++) {
      const p = xy(r0, ri(Math.min(r0.a0, r0.a1), Math.max(r0.a0, r0.a1)), ri(r0.lo + 30, r0.hi - 30))
      if (sq(p[0] - hole.tee[0]) + sq(p[1] - hole.tee[1]) >= sq(130) && free(keep, p[0], p[1], 40)) a = p
    }
    for (let t = 0; t < 30 && !b; t++) {
      const p = xy(r1, ri(Math.min(r1.a0, r1.a1), Math.max(r1.a0, r1.a1)), ri(r1.lo + 30, r1.hi - 30))
      if (sq(p[0] - hole.cup[0]) + sq(p[1] - hole.cup[1]) >= sq(140) && free(keep, p[0], p[1], 40)) b = p
    }
    if (!a || !b) return false
    hole.portals.push({ a, b })
    keep.push({ c: [a[0], a[1], 24] }, { c: [b[0], b[1], 24] })
    return true
  },
  boost(ctx, slot) {
    const { ri, L, hole, keep } = ctx
    const { s, along } = segAt(L, centre(slot)), dir = Math.sign(s.a1 - s.a0) || 1
    const thick = ri(110, 150), size = ri(54, 64)
    const strip = rectL(s, along - (thick >> 1), along + (thick >> 1), s.lo - 60, s.hi + 60)
    const pa = along - dir * ((thick >> 1) + ri(40, 80) + (size >> 1)), pc = ri(s.lo + (size >> 1) + 10, s.hi - (size >> 1) - 10)
    const pad = rectL(s, pa - (size >> 1), pa + (size >> 1), pc - (size >> 1), pc + (size >> 1))
    if (!freeRect(keep, pad, 8) || !freeRect(keep, strip, 4)) return false
    hole.zones.push({ type: 'sand', rect: strip }, { type: 'boost', rect: pad, dir: travelDir(s), speed: ri(860, 1080) })
    keep.push({ r: pad }, { r: strip })
    return true
  },
  sliders(ctx, slot) {
    const { ri, L, hole, keep, pick } = ctx
    const n = ri(1, 2), { s, along } = segAt(L, centre(slot)), w = s.hi - s.lo
    for (let k = 0; k < n; k++) {
      const a = along + (n === 2 ? (k ? 70 : -70) : 0), hw = ri(18, 22), hh = Math.min(ri(48, 64), (w - 140) >> 1)
      if (hh < 30) return false
      const c0 = s.lo + hh + 28, c1 = s.hi - hh - 28
      if (c1 - c0 < 60) return false
      const box = rectL(s, a - hw, a + hw, c0 - hh, c1 + hh)
      if (!freeRect(keep, box, 6)) return false
      const ends = pick([true, false]) ? [c0, c1] : [c1, c0]
      hole.movers.push({ type: 'slider', size: s.axis === 'x' ? [hw * 2, hh * 2] : [hh * 2, hw * 2], from: xy(s, a, ends[0]), to: xy(s, a, ends[1]), period: ri(26, 40) / 10, phase: ri(0, 99) / 100 })
      keep.push({ r: box })
    }
    return true
  },
  blocks(ctx, slot) {
    const { ri, L, hole, keep } = ctx
    const n = ri(1, 3), { s, along } = segAt(L, centre(slot))
    let placed = 0
    for (let tries = 0; tries < 30 && placed < n; tries++) {
      const w = ri(30, 54), h = ri(40, 76), rr = Math.ceil((Math.max(w, h) * 3) / 4)
      const [x, y] = xy(s, along + ri(-110, 110), ri(s.lo + 30, s.hi - 30))
      if (!free(keep, x, y, rr + 30)) continue
      hole.walls.push({ rect: [x - (w >> 1), y - (h >> 1), w, h], rot: ri(-28, 28) })
      keep.push({ c: [x, y, rr] }); placed++
    }
    return placed >= 1
  },
}

// ---------- mirroring
function mirror(h, fx, fy) {
  const P = (p) => [fx ? FW - p[0] : p[0], fy ? FH - p[1] : p[1]]
  const R = (r) => [fx ? FW - r[0] - r[2] : r[0], fy ? FH - r[1] - r[3] : r[1], r[2], r[3]]
  const D = (d) => { let a = d; if (fx) a = 180 - a; if (fy) a = -a; return ((a % 360) + 360) % 360 }
  const flipRot = fx !== fy
  h.tee = P(h.tee); h.cup = P(h.cup); h.green = h.green.map(P)
  if (h.walls) h.walls = h.walls.map((wl) => (wl.rect ? { rect: R(wl.rect), ...(wl.rot ? { rot: flipRot ? -wl.rot : wl.rot } : {}) } : wl))
  if (h.zones) h.zones = h.zones.map((z) => {
    const o = { type: z.type }
    if (z.circle) { const p = P(z.circle); o.circle = [p[0], p[1], z.circle[2]] }
    if (z.rect) o.rect = R(z.rect)
    if (z.rot) o.rot = flipRot ? -z.rot : z.rot
    if (z.dir != null) o.dir = D(z.dir)
    if (z.force != null) o.force = z.force
    if (z.speed != null) o.speed = z.speed
    return o
  })
  if (h.bumpers) h.bumpers = h.bumpers.map((b) => { const p = P(b); return [p[0], p[1], b[2]] })
  if (h.movers) h.movers = h.movers.map((m) => (m.type === 'spinner' ? { ...m, at: P(m.at), speed: flipRot ? -m.speed : m.speed } : { ...m, from: P(m.from), to: P(m.to) }))
  if (h.portals) h.portals = h.portals.map((p) => ({ a: P(p.a), b: P(p.b) }))
}

// ---------- little robots standing around outside the green
const BOT_SPOTS = [[480, 54], [220, 54], [740, 54], [480, 548], [220, 548], [740, 548], [52, 300], [908, 300], [300, 220], [300, 380], [660, 220], [660, 380], [200, 150], [200, 450], [760, 150], [760, 450]]
function decor(h, ri, pick) {
  const edges = []
  const addPoly = (pts) => { for (let i = 0; i < pts.length; i++) edges.push([pts[i], pts[(i + 1) % pts.length]]) }
  addPoly(h.green)
  for (const wl of h.walls || []) if (wl.rect) { const [x, y, w, hh] = wl.rect, m = wl.rot ? 30 : 0; addPoly([[x - m, y - m], [x + w + m, y - m], [x + w + m, y + hh + m], [x - m, y + hh + m]]) }
  const near = (x, y, d) => edges.some(([a, b]) => {
    const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey
    let t = l2 ? ((x - a[0]) * ex + (y - a[1]) * ey) / l2 : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    return sq(x - (a[0] + ex * t)) + sq(y - (a[1] + ey * t)) < d * d
  })
  const ok = BOT_SPOTS.filter(([x, y]) => !insidePoly(h.green, x, y) && !near(x, y, 40))
  const out = [], n = Math.min(ok.length, ri(1, 2)), colors = ['yellow', 'pink', 'blue', 'mint', 'orange']
  for (let k = 0; k < n; k++) {
    const i = ri(0, ok.length - 1), p = ok.splice(i, 1)[0]
    if (out.some((o) => sq(o.bot[0] - p[0]) + sq(o.bot[1] - p[1]) < sq(120))) continue
    out.push({ bot: p, color: pick(colors) })
  }
  return out
}
function insidePoly(pts, x, y) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]
    if ((yi > y) !== (yj > y) && (x - xi) * (yj - yi) < (xj - xi) * (y - yi) === (yj - yi) > 0) inside = !inside
  }
  return inside
}

function nameFor(mechs, pick, chance) {
  const a = mechs[0], b = mechs[1]
  if (mechs.length === 1) return chance(45) ? pick(SOLO[a]) : `${pick(ADJ[a])} ${pick(ANY_NOUN)}`
  if (chance(30)) return `${pick(ADJ[a])} ${pick(ANY_NOUN)}`
  return `${pick(ADJ[a])} ${pick(NOUN[b])}`
}

// ---------------------------------------------------------------- the published dailies
let table = null
function parsed() {
  if (!table) table = DAILY_TABLE ? DAILY_TABLE.split(',').map((e) => { const [a, p] = e.split('.'); return { attempt: parseInt(a, 36), par: +p } }) : []
  return table
}
/** Last date the table covers. */
export function dailyTableEnd() { return shiftDay(DAILY_START, parsed().length - 1) }
/** Table entry for a date: { attempt, par, source } where source is the date whose entry is used.
 *  Dates outside the table reuse the entry from a whole number of 52-week blocks away (same weekday). */
export function dailyEntry(key) {
  const t = parsed()
  if (!t.length) return { attempt: 0, par: 3, source: key, generated: false }
  let i = daysBetween(DAILY_START, key)
  const inside = i >= 0 && i < t.length
  while (i >= t.length) i -= 364
  while (i < 0) i += 364
  if (i >= t.length) i = i % 7 // tiny tables (tests): any day with the same weekday
  return { ...t[i], source: shiftDay(DAILY_START, i), inside }
}
/** The daily hole for a date, ready to play. */
export function dailyHole(key) {
  const e = dailyEntry(key)
  const { hole } = dailyCandidate(e.source, e.attempt)
  hole.par = e.par
  hole.date = key
  return hole
}
/** Fingerprint of a hole's data, for snapshot tests. */
export const holeHash = (hole) => hashString(JSON.stringify(hole)).toString(16).padStart(8, '0')

// ---------------------------------------------------------------- streaks and sharing
/** history: { 'YYYY-MM-DD': { s: strokes, p: par, k: 1 if holed else 0 } }.
 *  current = run of holed days ending today (or yesterday, when today is not holed yet); best = longest run in the history. */
export function streakInfo(history, today) {
  const holed = (k) => !!(history && history[k] && history[k].k === 1)
  let current = 0
  for (let k = holed(today) ? today : shiftDay(today, -1); holed(k); k = shiftDay(k, -1)) current++
  let best = 0
  for (const k of Object.keys(history || {})) {
    if (!isDateKey(k) || !holed(k) || holed(shiftDay(k, -1))) continue
    let run = 0
    for (let j = k; holed(j); j = shiftDay(j, 1)) run++
    if (run > best) best = run
  }
  return { current, best: Math.max(best, current) }
}
/** The last n days ending today, oldest first: { key, day: 'M', rec | null, today }. */
export function recentDays(history, today, n = 7) {
  const out = []
  for (let k = -(n - 1); k <= 0; k++) { const key = shiftDay(today, k); out.push({ key, day: 'SMTWTFS'[weekday(key)], rec: (history && history[key]) || null, today: k === 0 }) }
  return out
}
/** Spoiler-free result line for the clipboard. */
export function shareText(key, name, rec, resultLabel) {
  return `Wonky Putt daily ${key} · "${name}" · ${rec.s} ${rec.s === 1 ? 'stroke' : 'strokes'} (par ${rec.p}) · ${resultLabel.replace(/!$/, '')}\nhttps://games.oddvale.com/wonky-putt/`
}
