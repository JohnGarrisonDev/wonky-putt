// DOM overlays inside the stage: HUD, hint toast, and the menu screens (title, pause, result, scorecard, hole select, balls).
// Screens are plain HTML built from data; every button carries data-act and main.js handles the action.
import { SKINS, starsFor, fmtDiff, resultName } from './save.js'

const STAR = (on) => `<svg class="star${on ? ' on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.9-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.1 1.1-6.5L2.6 9.5l6.5-.9z"/></svg>`
export const starsHtml = (n, label = true) => `<span class="stars"${label ? ` role="img" aria-label="${n} of 3 stars"` : ''}>${STAR(n > 0)}${STAR(n > 1)}${STAR(n > 2)}</span>`
const face = (ink, eye) => `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="21" cy="22" r="13" fill="${eye}"/><circle cx="24.5" cy="24.5" r="5.2" fill="${ink}"/><circle cx="47" cy="19" r="5.5" fill="${ink}"/><path d="M9 41 32 57 55 41" fill="none" stroke="${ink}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const ballHtml = (s) => `<span class="ball" style="background:${s.fill}">${face(s.ink, s.eye)}</span>`
const MENU_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>'
const LOCK = '<svg class="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
/** The last days as a strip of marks: circle = under par, plain = par, square = over, cross = not holed, dashed = not played. */
const weekStrip = (days) => `<ol class="week" aria-label="Last ${days.length} days">${days.map((d) => {
  const r = d.rec, cls = !r ? 'none' : !r.k ? 'miss' : r.s === 1 ? 'ace' : r.s < r.p ? 'under' : r.s === r.p ? 'par' : 'over'
  const label = !r ? 'not played' : !r.k ? `${r.s} strokes, not holed` : `${r.s} ${r.s === 1 ? 'stroke' : 'strokes'}, par ${r.p}`
  return `<li class="${cls}${d.today ? ' today' : ''}" title="${d.key}: ${label}" aria-label="${d.key}: ${label}"><span>${r ? (r.k ? r.s : '×') : ''}</span><small>${d.day}</small></li>`
}).join('')}</ol>`
const streakHtml = (st) => `<div class="streak"><div><b>${st.current}</b><span>day streak</span></div><div><b>${st.best}</b><span>best</span></div></div>`
const btn = (act, label, cls = '', arg = '') => `<button type="button" class="btn ${cls}" data-act="${act}"${arg !== '' ? ` data-arg="${arg}"` : ''}>${label}</button>`

export function createUI(stage, onAction) {
  const el = (tag, cls, html = '') => { const n = document.createElement(tag); n.className = cls; n.innerHTML = html; stage.appendChild(n); return n }
  const hud = el('div', 'hud', `
    <div class="hud-hole"><span class="hud-label" data-h="label"></span><span class="hud-name" data-h="name"></span></div>
    <div class="hud-right">
      <span class="hud-chip" data-h="roundchip"><small>Round</small><b data-h="round">E</b></span>
      <span class="hud-chip strokes"><small>Strokes</small><b data-h="strokes">0</b></span>
      <button type="button" class="hud-btn" data-act="menu" aria-label="Menu" title="Menu (Esc)">${MENU_ICON}</button>
    </div>`)
  const toast = el('div', 'toast')
  toast.setAttribute('aria-live', 'polite')
  const overlay = el('div', 'overlay')
  hud.hidden = true; overlay.hidden = true
  const h = (k) => hud.querySelector(`[data-h="${k}"]`)
  let screen = null, toastTimer = 0

  const click = (e) => {
    const b = e.target.closest('[data-act]')
    if (!b || b.disabled) return
    onAction(b.dataset.act, b.dataset.arg)
  }
  hud.addEventListener('click', click); overlay.addEventListener('click', click)
  // keep presses on UI from starting an aim drag
  for (const n of [hud, overlay]) n.addEventListener('pointerdown', (e) => e.stopPropagation())

  function show(name, html, { focus = '.btn.primary', wide = false, clear = false } = {}) {
    screen = name
    overlay.className = `overlay scr-${name}${clear ? ' clear' : ''}`
    overlay.innerHTML = `<div class="panel${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${name}">${html}</div>`
    overlay.hidden = false
    const f = overlay.querySelector(focus) || overlay.querySelector('button:not([disabled])')
    if (f) f.focus({ preventScroll: true })
  }

  const ui = {
    get screen() { return screen },
    hide() { screen = null; overlay.hidden = true; overlay.innerHTML = ''; if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur() },
    hud({ show: on, no, total, par, name, strokes, round, label, chip = 'Round' }) {
      hud.hidden = !on
      if (!on) return
      h('label').textContent = label || `Hole ${no}/${total} · Par ${par}`
      h('name').textContent = name
      h('strokes').textContent = strokes
      h('roundchip').hidden = round == null
      h('roundchip').querySelector('small').textContent = chip
      if (round != null) h('round').textContent = round
    },
    strokes(n, limit) { const s = h('strokes'); s.textContent = n; s.parentElement.classList.toggle('warn', n >= limit - 1) },
    toast(text, ms = 4200) {
      clearTimeout(toastTimer)
      toast.textContent = text
      toast.classList.toggle('on', !!text)
      if (text && ms) toastTimer = setTimeout(() => toast.classList.remove('on'), ms)
    },

    /** daily: { label, status, todo }. todo = today's official try is not finished yet (it becomes the main button). */
    title({ round, stars, maxStars, aces, bestRound, anyProgress, daily }) {
      show('title', `
        <span class="eyebrow">Mini golf · 18 holes + a daily</span>
        <h2 class="logo-title">Wonky <em>Putt</em></h2>
        <p class="sub">The robots built a golf course. Nothing on it is straight.</p>
        <div class="btns col">
          <div class="daily-row">${btn('daily', daily.label, daily.todo ? 'primary' : '')}<p class="daily-status">${daily.status}</p></div>
          ${round ? btn('continue', `Continue round <small>hole ${round.i + 1}</small>`, daily.todo ? '' : 'primary') : ''}
          ${btn('newround', round ? 'New round' : 'Play round', round || daily.todo ? '' : 'primary')}
          <div class="btns">${btn('select', 'Hole select', 'small')}${btn('skins', 'Balls', 'small')}</div>
        </div>
        <p class="how">Press anywhere, pull back, let go. Or aim with <kbd>←</kbd><kbd>→</kbd> and putt with <kbd>Space</kbd>.</p>
        ${anyProgress ? `<p class="stats">${STAR(true)} ${stars}/${maxStars} <i>·</i> Aces ${aces} <i>·</i> Best round ${bestRound ?? '—'}</p>` : ''}`, { clear: true })
    },
    menu({ kind, no, name, par, hint }) {
      const daily = kind === 'daily' || kind === 'dailyPractice'
      const where = kind === 'daily' ? 'daily, official try' : kind === 'dailyPractice' ? 'daily practice' : `hole ${no}`
      const note = kind === 'round' ? 'Your round is saved after every putt.'
        : kind === 'daily' ? 'This is your one official try, so no restarts. It is saved after every putt: quit and come back any time.'
          : kind === 'dailyPractice' ? 'Practice runs never change your daily score.' : ''
      show('menu', `
        <span class="eyebrow">Paused · ${where} · par ${par}</span>
        <h2>${esc(name)}</h2>
        ${hint ? `<p class="sub">${hint}</p>` : ''}
        <div class="btns col">
          ${btn('resume', 'Keep putting', 'primary')}
          ${kind === 'daily' ? '' : btn('retry', kind === 'round' ? 'Restart hole <small>mulligan</small>' : 'Restart hole <small>R</small>')}
          ${kind === 'dailyPractice' ? btn('dailycard', 'Daily card') : daily ? '' : btn('select', 'Hole select')}
          ${btn('quit', 'Quit to title')}
        </div>
        ${note ? `<p class="note">${note}</p>` : ''}`)
    },
    /** Before the official try. */
    dailyIntro({ date, dayName, dayLabel, name, par, hint, streak }) {
      show('dailyintro', `
        <span class="eyebrow">Daily hole · ${dayName} ${date}</span>
        <h2>${esc(name)}</h2>
        <p class="score"><b>Par ${par}</b> <i>·</i> ${dayLabel}</p>
        <p class="sub">${hint}</p>
        <p class="note">One official try: every stroke counts until the ball drops, or par + 5. After that, practise it as often as you like. Same hole for everyone today.</p>
        ${streak.current ? `<p class="note">You are on a ${streak.current}-day streak. Sink it to keep it going.</p>` : ''}
        <div class="btns">${btn('teeoff', 'Tee off', 'primary')}${btn('back', 'Back', '', 'title')}</div>`)
    },
    /** The official result, right after the try or any time later. rec: { s, p, k }. */
    dailyCard({ date, name, rec, streak, days, fresh, practiceBest, isToday }) {
      const title = resultName(rec.s, rec.p, rec.k === 1), d = rec.s - rec.p
      const vs = !rec.k ? 'not holed' : d === 0 ? 'level par' : d < 0 ? `${-d} under par` : `${d} over par`
      const first = fresh ? (rec.k ? 'That one counts.' : 'The robots moved you on. No streak point today.') : 'Your official score for the day.'
      show('dailycard', `
        <span class="eyebrow">Daily · ${date} · par ${rec.p}</span>
        <h2 class="${rec.k && rec.s === 1 ? 'ace' : ''}">${title}</h2>
        <p class="dname">"${esc(name)}"</p>
        <p class="score"><b>${rec.s}</b> ${rec.s === 1 ? 'stroke' : 'strokes'}${rec.k ? '' : ' (limit)'} <i>·</i> ${vs}</p>
        ${streakHtml(streak)}
        ${weekStrip(days)}
        <p class="note">${first} ${practiceBest ? `Practice best: ${practiceBest}.` : 'Practise it as often as you like; practice never counts.'}${isToday ? ' A new hole rolls out at midnight.' : ''}</p>
        <div class="btns">${btn('copy', 'Copy result', 'primary')}${btn('practise', 'Practise it')}${btn('back', 'Title', '', 'title')}</div>`)
    },
    practiceResult({ name, par, strokes, sunk, best, newBest, official }) {
      const off = official ? ` Your official score: ${official.s} (${resultName(official.s, official.p, official.k === 1)}).` : ''
      show('result', `
        <span class="eyebrow">Practice · ${esc(name)} · par ${par}</span>
        <h2>${resultName(strokes, par, sunk)}</h2>
        <p class="score"><b>${strokes}</b> ${strokes === 1 ? 'stroke' : 'strokes'}${sunk ? '' : ' (limit)'} <i>·</i> ${newBest ? '<span class="tag">Practice best</span>' : `practice best ${best || '—'}`}</p>
        <p class="note">Practice does not count.${off}</p>
        <div class="btns">${btn('retry', 'Again', 'primary')}${btn('dailycard', 'Daily card')}${btn('back', 'Title', '', 'title')}</div>`)
    },
    /** Flash "Copied!" (or a failure note) on the copy button. */
    copied(ok, text) {
      const b = overlay.querySelector('[data-act="copy"]')
      if (!b) return
      b.textContent = ok ? 'Copied!' : 'Copy it below'
      if (!ok && text && !overlay.querySelector('.share-text')) {
        // the browser said no (permissions, old browser): show the line so it can be copied by hand
        const ta = document.createElement('textarea')
        ta.className = 'share-text'; ta.readOnly = true; ta.rows = 3; ta.value = text; ta.setAttribute('aria-label', 'Result to copy')
        b.closest('.btns').before(ta); ta.focus(); ta.select()
      }
      setTimeout(() => { if (b.isConnected) b.textContent = 'Copy result' }, 1600)
    },
    result({ kind, no, par, name, title, quip, strokes, sunk, stars, best, newBest, ace, roundLine, last, newSkins, nextLocked }) {
      const next = kind === 'round'
        ? btn('next', last ? 'See the scorecard' : 'Next hole', 'primary')
        : (last ? '' : btn('next', 'Next hole', 'primary', '')) + btn('retry', 'Play it again', last ? 'primary' : '') + btn('select', 'Hole select')
      show('result', `
        <span class="eyebrow">Hole ${no} · ${name} · par ${par}</span>
        <h2 class="${ace ? 'ace' : ''}">${title}</h2>
        ${starsHtml(stars)}
        <p class="score"><b>${strokes}</b> ${strokes === 1 ? 'stroke' : 'strokes'}${sunk ? '' : ' (limit)'} <i>·</i> ${newBest ? '<span class="tag">New best</span>' : best ? `best ${best}` : 'no best yet'}</p>
        <p class="sub">${quip}</p>
        ${roundLine ? `<p class="note">${roundLine}</p>` : ''}
        ${(newSkins || []).map((s) => `<p class="unlock">${ballHtml(s)} New ball: <b>${s.name}</b></p>`).join('')}
        <div class="btns${kind === 'round' ? '' : ' col'}">${next}</div>`)
      void nextLocked
    },
    final({ holes, scores, total, par, medal, isBest, bestRound, mulligans, aces }) {
      const half = (from, label) => {
        const idx = holes.slice(from, from + 9).map((_, k) => from + k)
        const sumPar = idx.reduce((n, i) => n + holes[i].par, 0), sum = idx.reduce((n, i) => n + scores[i], 0)
        const cell = (i) => { const d = scores[i] - holes[i].par; return `<td class="${scores[i] === 1 ? 'ace' : d < 0 ? 'under' : d > 0 ? 'over' : ''}"><span>${scores[i]}</span></td>` }
        return `<table class="card"><caption>${label}</caption>
          <tr><th scope="row">Hole</th>${idx.map((i) => `<td>${i + 1}</td>`).join('')}<td class="sum">${from ? 'In' : 'Out'}</td></tr>
          <tr><th scope="row">Par</th>${idx.map((i) => `<td>${holes[i].par}</td>`).join('')}<td class="sum">${sumPar}</td></tr>
          <tr class="you"><th scope="row">You</th>${idx.map(cell).join('')}<td class="sum">${sum}</td></tr></table>`
      }
      show('final', `
        <span class="eyebrow">Round complete · 18 holes</span>
        <h2>${medal.name}</h2>
        <p class="sub">${medal.line}</p>
        <p class="total"><b>${total}</b> strokes <i>·</i> <b>${fmtDiff(total - par)}</b> vs par ${par} ${isBest ? '<span class="tag">Best round</span>' : `<i>·</i> best ${bestRound}`}</p>
        <div class="cards">${half(0, 'Front nine')}${half(9, 'Back nine')}</div>
        <p class="note">Circle = under par, square = over. Aces this round: ${aces}. ${mulligans ? `Mulligans: ${mulligans}.` : 'No mulligans: a clean round.'}</p>
        <div class="btns">${btn('newround', 'Play again', 'primary')}${btn('select', 'Hole select')}${btn('quit', 'Title')}</div>`, { wide: true })
    },
    select({ holes, save, from }) {
      const cells = holes.map((hole, i) => {
        const open = save.isUnlocked(i), best = save.best(i)
        return `<button type="button" class="cell${open ? '' : ' locked'}" data-act="play" data-arg="${i}" ${open ? '' : 'disabled'} aria-label="Hole ${i + 1}, ${hole.name}, par ${hole.par}${open ? (best ? `, best ${best}` : ', not played') : ', locked'}">
          <span class="num">${i + 1}</span><span class="nm">${hole.name}</span>
          ${open ? `${starsHtml(starsFor(best, hole.par), false)}<span class="bs">par ${hole.par}${best ? ` · best ${best}` : ''}</span>` : `${LOCK}<span class="bs">finish hole ${i}</span>`}
        </button>`
      })
      show('select', `
        <span class="eyebrow">Practice any unlocked hole</span>
        <h2>Hole select</h2>
        <h3>Front nine</h3><div class="grid">${cells.slice(0, 9).join('')}</div>
        <h3>Back nine</h3><div class="grid">${cells.slice(9).join('')}</div>
        <div class="btns">${btn('back', 'Back', 'small', from || '')}</div>`, { wide: true, focus: '.cell:not([disabled])' })
    },
    skins({ save, from }) {
      const total = save.totalStars(), cur = save.skin().id
      const cells = SKINS.map((s) => {
        const open = total >= s.need
        return `<button type="button" class="cell skin${open ? '' : ' locked'}${s.id === cur ? ' picked' : ''}" data-act="skin" data-arg="${s.id}" ${open ? '' : 'disabled'} aria-pressed="${s.id === cur}" aria-label="${s.name}${open ? '' : `, needs ${s.need} stars`}">
          ${ballHtml(s)}<span class="nm">${s.name}</span><span class="bs">${open ? (s.id === cur ? 'In play' : 'Use') : `${s.need} stars`}</span></button>`
      })
      show('skins', `
        <span class="eyebrow">You have ${total} of ${save.maxStars} stars</span>
        <h2>Balls</h2>
        <p class="sub">Three stars for under par, two for par, one for finishing.</p>
        <div class="grid skins">${cells.join('')}</div>
        <div class="btns">${btn('back', 'Back', 'small', from || '')}</div>`, { wide: true, focus: '.cell.picked' })
    },
    confirm({ text, yes, act }) {
      show('confirm', `<h2>Hang on</h2><p class="sub">${text}</p><div class="btns">${btn(act, yes, 'primary')}${btn('back', 'Never mind', '', 'title')}</div>`)
    },
  }
  return ui
}
