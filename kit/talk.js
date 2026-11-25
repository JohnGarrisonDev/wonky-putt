// Oddvale Games "talk" widgets: anonymous player input. No dependencies, plain ES module.
// Source of truth: github.com/JohnGarrisonDev/oddvale-games /kit. Each game keeps its own copy in /kit.
//
//   import { dailyTalk, tellUs } from '../kit/talk.js'
//   dailyTalk(el, { game: 'lookout', key: '2026-12-02', board: 'small', score: 41, label: 'Small' })  // on a daily result card
//   tellUs(el, { game: 'lookout' })                                                                   // once, on the game page
//
// Rules:
//  - Everything fails silently. If the API is down, switched off or blocked, the widgets stay hidden and the game is unchanged.
//  - Nothing about the player is sent: only the game, the date key, the board, the score and the tapped choice.
//  - What this browser already sent is remembered in localStorage ("oddvale:talk"), never in a cookie.
//  - Fixed choices only. Never add a free-text field.

const API = (() => { try { return new URL('/api/v1/', location.origin).href } catch { return null } })()
const TIMEOUT = 3500
export const VOTES = [['breeze', 'Breeze'], ['fair', 'Fair'], ['tricky', 'Tricky'], ['brutal', 'Brutal']]
export const TELLS = [['broke', 'Something broke'], ['too-hard', 'Too hard'], ['too-easy', 'Too easy'], ['phone', 'Broke on my phone'], ['more', 'Want more like this'], ['devices', 'I want my progress on all my devices']]
const VOTE_LABEL = Object.fromEntries(VOTES)

// ---- local memory

const MEM_KEY = 'oddvale:talk'
function mem() {
  let m = {}
  try { m = JSON.parse(localStorage.getItem(MEM_KEY) || '{}') || {} } catch { /* blocked */ }
  m.sent ||= {}; m.thumb ||= {}; m.told ||= {}
  return m
}
function saveMem(m) {
  // Forget daily entries older than about two weeks so this never grows without bound.
  const cutoff = localKey(new Date(Date.now() - 15 * 86400000))
  for (const k of Object.keys(m.sent)) { const d = k.split('|').pop(); if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < cutoff) delete m.sent[k] }
  for (const k of Object.keys(m.told)) if (k.split('|')[1] < cutoff) delete m.told[k]
  try { localStorage.setItem(MEM_KEY, JSON.stringify(m)) } catch { /* full or blocked */ }
}
const pad = (n) => String(n).padStart(2, '0')
export const localKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Marks a daily as done today in this browser, for the "Today's puzzles" row on the home page. Local only, never sent. */
export function markDailyDone(game, key) {
  try {
    const t = JSON.parse(localStorage.getItem('oddvale:today') || '{}') || {}
    const done = t.key === key ? t.done || {} : {}
    done[game] = true
    localStorage.setItem('oddvale:today', JSON.stringify({ key, done }))
  } catch { /* ignore */ }
}

// ---- network

async function call(path, body) {
  if (!API || typeof fetch !== 'function') return null
  const ctl = typeof AbortController === 'function' ? new AbortController() : null
  const timer = ctl && setTimeout(() => ctl.abort(), TIMEOUT)
  try {
    const r = await fetch(API + path, body
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl?.signal, credentials: 'omit' }
      : { signal: ctl?.signal, credentials: 'omit' })
    if (!r.ok) return null
    const j = await r.json()
    return j && j.ok ? j : null
  } catch { return null } finally { if (timer) clearTimeout(timer) }
}
let statusP = null
/** Resolves true when the API is up and switched on. Checked once per page load. */
export const apiUp = () => (statusP ||= call('status').then((j) => !!j))

// ---- DOM helpers

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v
    else if (k === 'text') e.textContent = v
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v)
  }
  for (const c of kids) if (c != null) e.append(c)
  return e
}
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0)
const plural = (n, one, many) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

// ---- daily result card

/**
 * Adds "You beat N% of today's players" and "How was today's puzzle?" to a daily result card.
 * opts: game, key (the game's own daily key, YYYY-MM-DD), board (optional; the API default otherwise), score (number, optional),
 *       label (optional board name, e.g. "Small"), compact (bool: smaller layout for tight cards).
 * Safe to call again for the same board (e.g. when the card re-renders): nothing is sent twice.
 */
export function dailyTalk(el, { game, key, board, score, label, compact = false } = {}) {
  if (!el || !game || !key) return
  markDailyDone(game, key)
  el.replaceChildren()
  el.hidden = true
  el.classList.add('talk', 'talk-daily')
  if (compact) el.classList.add('compact')
  const id = `${game}|${board || ''}|${key}`
  apiUp().then(async (up) => {
    if (!up || !el.isConnected) return
    const m = mem()
    const beat = h('p', { class: 'talk-beat', 'aria-live': 'polite' })
    const after = h('p', { class: 'talk-after', 'aria-live': 'polite' })
    const buttons = VOTES.map(([v, text]) => h('button', { type: 'button', class: 'talk-choice', 'data-vote': v, 'aria-pressed': 'false', text, onclick: () => vote(v) }))
    const group = h('div', { class: 'talk-row', role: 'group', 'aria-label': 'How was today\'s puzzle?' }, ...buttons)
    el.append(beat, h('p', { class: 'talk-q', text: label ? `How was today's ${label}?` : 'How was today\'s puzzle?' }), group, after)
    el.hidden = false

    const showBeat = (j) => {
      if (!j) { beat.hidden = true; return }
      beat.hidden = false
      if (j.beat != null) beat.replaceChildren('You beat ', h('b', { text: `${j.beat}%` }), ` of today's ${plural(j.players, 'player', 'players')}.`)
      else beat.textContent = j.players > 1 ? `${plural(j.players, 'player', 'players')} so far today. Rankings show from 30.` : 'You\'re one of the first today. Rankings show from 30 players.'
    }
    const showVotes = (votes, mine) => {
      for (const b of buttons) { const on = b.dataset.vote === mine; b.setAttribute('aria-pressed', String(on)); b.disabled = !!mine }
      if (!mine) { after.textContent = ''; return }
      if (!votes || !votes.top) { after.textContent = 'Thanks! We\'ll show what everyone thinks once a few more people vote.'; return }
      after.replaceChildren('Most players found it ', h('b', { text: VOTE_LABEL[votes.top] }), ` (${pct(votes.counts[votes.top], votes.total)}% of ${plural(votes.total, 'vote', 'votes')}).`)
    }
    async function vote(v) {
      const mm = mem()
      if (mm.sent[`v|${id}`]) return
      for (const b of buttons) b.disabled = true
      const j = await call('vote', { game, key, board, choice: v })
      if (!j) { for (const b of buttons) b.disabled = false; after.textContent = 'Couldn\'t send that. Try again in a minute.'; return }
      mm.sent[`v|${id}`] = v; saveMem(mm)
      showVotes(j.votes, v)
    }

    const hasScore = typeof score === 'number' && Number.isFinite(score)
    const qs = new URLSearchParams({ game, key, ...(board ? { board } : {}), ...(hasScore ? { score: String(score) } : {}) })
    let stats
    if (hasScore && m.sent[`s|${id}`] == null) {
      stats = await call('score', { game, key, board, score })
      if (stats) { m.sent[`s|${id}`] = score; saveMem(m) }
    } else stats = await call(`daily?${qs}`)
    showBeat(hasScore ? stats : null)
    const mine = m.sent[`v|${id}`]
    if (mine) showVotes(stats?.votes || (await call(`daily?${qs}`))?.votes, mine)
    else showVotes(null, null)
  })
}

// ---- Tell us + thumbs (one per game page)

const THUMB_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v11H3V10h4zM7 10l4-8c1.7 0 3 1.3 3 3v4h5.5a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.1 21H7"/></svg>'
const THUMB_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 14V3h4v11h-4zM17 14l-4 8c-1.7 0-3-1.3-3-3v-4H4.5a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 5.9 3H17"/></svg>'

/**
 * A "Tell us" card: thumbs up/down (private to the studio) and fixed-choice feedback taps. No account, no free text.
 * opts: game, issueUrl (optional link for people who want to write).
 */
export function tellUs(el, { game, issueUrl } = {}) {
  if (!el || !game) return
  el.hidden = true
  apiUp().then((up) => {
    if (!up || !el.isConnected) return
    const m = mem()
    const today = localKey()
    const thanks = h('p', { class: 'talk-after', 'aria-live': 'polite' })
    const mkThumb = (up, svg, text) => {
      const b = h('button', { type: 'button', class: 'talk-choice talk-thumb', 'aria-pressed': String(m.thumb[game] === up) })
      b.innerHTML = svg; b.append(h('span', { text }))
      b.addEventListener('click', async () => {
        const mm = mem()
        if (mm.thumb[game] === up) return
        const ok = await call('thumb', { game, up })
        if (!ok) { thanks.textContent = 'Couldn\'t send that. Try again in a minute.'; return }
        mm.thumb[game] = up; saveMem(mm)
        for (const t of thumbs) t.setAttribute('aria-pressed', String(t === b))
        thanks.textContent = up ? 'Thanks! Glad you like it.' : 'Thanks for telling us. A tap below says what to fix.'
      })
      return b
    }
    const thumbs = [mkThumb(true, THUMB_UP, 'I like it'), mkThumb(false, THUMB_DOWN, 'Not for me')]
    const choices = TELLS.map(([c, text]) => {
      const told = !!m.told[`${game}:${c}|${today}`]
      const b = h('button', { type: 'button', class: 'talk-choice', 'aria-pressed': String(told), text })
      if (told) b.disabled = true
      b.addEventListener('click', async () => {
        b.disabled = true
        const ok = await call('tell', { game, choice: c })
        if (!ok) { b.disabled = false; thanks.textContent = 'Couldn\'t send that. Try again in a minute.'; return }
        const mm = mem(); mm.told[`${game}:${c}|${today}`] = 1; saveMem(mm)
        b.setAttribute('aria-pressed', 'true')
        thanks.textContent = c === 'devices' ? 'Noted. Enough taps on this one and we\'ll build a way to sync.' : 'Thanks! We read these every week.'
      })
      return b
    })
    el.classList.add('talk', 'talk-tell')
    el.replaceChildren(
      h('h2', { text: 'Tell us' }),
      h('p', { class: 'talk-sub', text: 'One tap, anonymous, no account needed.' }),
      h('div', { class: 'talk-row', role: 'group', 'aria-label': 'Do you like this game?' }, ...thumbs),
      h('div', { class: 'talk-row wrap', role: 'group', 'aria-label': 'Tell us about this game' }, ...choices),
      thanks,
      issueUrl ? h('p', { class: 'talk-sub' }, 'Want to write more? ', h('a', { href: issueUrl, target: '_blank', rel: 'noopener', text: 'Open a GitHub issue' }), '.') : null,
    )
    el.hidden = false
  })
}

// ---- owner polls (home page)

/** Renders the open owner polls into el. Results (bars with numbers) show after you vote. */
export function polls(el) {
  if (!el) return
  el.hidden = true
  apiUp().then(async (up) => {
    if (!up) return
    const j = await call('polls')
    if (!j || !j.polls.length || !el.isConnected) return
    const m = mem()
    el.replaceChildren(...j.polls.map((p) => pollCard(p, m)))
    el.hidden = false
  })
}
function pollCard(p, m) {
  const box = h('div', { class: 'talk talk-poll' })
  const status = h('p', { class: 'talk-after', 'aria-live': 'polite' })
  const list = h('div', { class: 'talk-poll-list', role: 'group', 'aria-label': p.question })
  const render = (counts, mine) => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    list.replaceChildren(...p.choices.map((c) => {
      const b = h('button', { type: 'button', class: 'talk-poll-choice', 'aria-pressed': String(mine === c.id) })
      if (mine) {
        b.disabled = true
        const share = pct(counts[c.id] || 0, total)
        b.style.setProperty('--share', `${share}%`)
        b.append(h('span', { class: 'lbl', text: c.label }), h('span', { class: 'num', text: `${share}%` }))
      } else {
        b.append(h('span', { class: 'lbl', text: c.label }))
        b.addEventListener('click', async () => {
          for (const x of list.children) x.disabled = true
          const r = await call('poll', { poll: p.id, choice: c.id })
          if (!r) { for (const x of list.children) x.disabled = false; status.textContent = 'Couldn\'t send that. Try again in a minute.'; return }
          const mm = mem(); mm.sent[`p|${p.id}`] = c.id; saveMem(mm)
          render(r.counts, c.id)
        })
      }
      return b
    }))
    status.textContent = mine ? `Thanks for voting. ${plural(total, 'vote', 'votes')} so far; closes ${new Date(`${p.closes}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}.` : ''
  }
  box.append(h('h3', { text: p.question }), list, status)
  render(p.counts, m.sent[`p|${p.id}`])
  return box
}

/** Today's community difficulty per daily game ({ game: { top, total } }), or {} when unavailable. Used by the home page. */
export async function todayDifficulty(key = localKey()) {
  if (!(await apiUp())) return {}
  return (await call(`today?key=${encodeURIComponent(key)}`))?.games || {}
}
export const voteLabel = (v) => VOTE_LABEL[v] || v
