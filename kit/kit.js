// Oddvale Games kit: tiny shared helpers. No dependencies, plain ES module.
// Source of truth: github.com/JohnGarrisonDev/oddvale-games /kit. Each game keeps its own copy in /kit.

/** Brand palette for canvas drawing. */
export const C = {
  paper: '#FBF6EC', ink: '#17131F', orange: '#FF5B2E', yellow: '#FFC93C', mint: '#2FD6A3', blue: '#5B5BFF', pink: '#FF8FC7',
  night: '#14101B', plum: '#221B2E', plum2: '#2B2339', line: '#382E49', muted: '#A79DB5',
}
export const FONT = {
  display: '"Fraunces Variable", Georgia, serif',
  body: '"Figtree Variable", "Segoe UI", system-ui, sans-serif',
  mono: '"DM Mono", ui-monospace, Consolas, monospace',
}

/** localStorage save data, one JSON blob per game under "oddvale:<slug>". Never throws. */
export function makeStore(slug, defaults = {}) {
  const key = `oddvale:${slug}`
  let data = { ...defaults }
  try { Object.assign(data, JSON.parse(localStorage.getItem(key) || '{}')) } catch { /* private mode or bad JSON */ }
  const save = () => { try { localStorage.setItem(key, JSON.stringify(data)) } catch { /* storage full or blocked */ } }
  return {
    data,
    save,
    set(patch) { Object.assign(data, patch); save() },
    reset() { for (const k of Object.keys(data)) delete data[k]; Object.assign(data, defaults); save() },
  }
}

/** Size a canvas to its CSS box at device pixel ratio. Returns { w, h, dpr } in CSS pixels. Call on resize. */
export function fitCanvas(canvas, maxDpr = 2) {
  const r = canvas.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height))
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr) }
  return { w, h, dpr }
}

/** Seeded random numbers (mulberry32). rng() -> [0, 1). */
export function makeRng(seed) {
  let a = seed >>> 0
  const rng = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  rng.int = (n) => Math.floor(rng() * n)
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)]
  rng.range = (lo, hi) => lo + rng() * (hi - lo)
  return rng
}
export const hashString = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }

/** Tiny synth for sound effects (Web Audio, no files). Mute state is remembered across all Oddvale games. */
export const sfx = (() => {
  let ctx = null, master = null
  let muted = false
  try { muted = localStorage.getItem('oddvale:muted') === '1' } catch { /* ignore */ }
  const ensure = () => {
    if (!ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
      if (!AC) return null
      ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  }
  // Browsers only allow audio after a user gesture.
  const unlock = () => ensure()
  if (typeof window !== 'undefined') { window.addEventListener('pointerdown', unlock, { passive: true }); window.addEventListener('keydown', unlock) }
  return {
    get muted() { return muted },
    setMuted(m) { muted = !!m; try { localStorage.setItem('oddvale:muted', muted ? '1' : '0') } catch { /* ignore */ } if (master) master.gain.value = muted ? 0 : 0.5 },
    /** A pitched blip. type: sine|square|triangle|sawtooth. slide: frequency to glide to. */
    tone({ freq = 440, dur = 0.12, type = 'square', vol = 0.2, slide = 0, delay = 0 } = {}) {
      if (muted || !ensure() || ctx.state !== 'running') return
      const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain()
      o.type = type; o.frequency.setValueAtTime(freq, t)
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur)
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02)
    },
    /** A burst of filtered noise (hits, explosions, swishes). */
    noise({ dur = 0.15, vol = 0.2, freq = 1200, slide = 0, delay = 0 } = {}) {
      if (muted || !ensure() || ctx.state !== 'running') return
      const t = ctx.currentTime + delay, n = Math.ceil(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0)
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
      s.buffer = buf; f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t)
      if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur)
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      s.connect(f).connect(g).connect(master); s.start(t)
    },
    /** Play a little tune: notes = [[freq, dur], ...]. */
    tune(notes, { type = 'triangle', vol = 0.18, gap = 0 } = {}) { let d = 0; for (const [freq, dur] of notes) { if (freq) this.tone({ freq, dur, type, vol, delay: d }); d += dur + gap } },
  }
})()

/** A short vibration on phones that support it (Android). Silent when sound is muted or motion is reduced. */
export function haptic(pattern = 12) {
  if (sfx.muted) return
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; navigator.vibrate?.(pattern) } catch { /* unsupported */ }
}

/**
 * Wire up the standard top-bar buttons: [data-mute] and [data-fullscreen] (target: the .stage element).
 * Full screen uses the browser's Fullscreen API where it exists, and otherwise (iPhone) a "focus" mode that pins the
 * stage over the whole page. Either way the stage gets the class `is-full`, an exit button appears inside it, and
 * the stage fires `oddvale:fullscreen` ({ detail: { on } }). The stage's ResizeObserver re-fits the canvas.
 * orientation: optional 'portrait' | 'landscape' to lock to while in native full screen (Android only).
 * Returns { fullscreen: { enter, exit, toggle, get on } }.
 */
export function wireChrome({ stage, orientation } = {}) {
  const muteBtn = document.querySelector('[data-mute]')
  if (muteBtn) {
    const paint = () => { muteBtn.setAttribute('aria-pressed', String(sfx.muted)); muteBtn.title = sfx.muted ? 'Sound off' : 'Sound on'; muteBtn.innerHTML = sfx.muted ? ICON.soundOff : ICON.soundOn }
    muteBtn.addEventListener('click', () => { sfx.setMuted(!sfx.muted); paint() }); paint()
  }
  const fullscreen = stage ? makeFullscreen(stage, { orientation, button: document.querySelector('[data-fullscreen]') }) : null
  return { fullscreen }
}

function makeFullscreen(stage, { orientation, button }) {
  const root = document.documentElement
  let focus = false
  const on = () => focus || document.fullscreenElement === stage
  const exitBtn = document.createElement('button')
  exitBtn.type = 'button'; exitBtn.className = 'stage-exit'; exitBtn.setAttribute('aria-label', 'Exit full screen'); exitBtn.title = 'Exit full screen'
  exitBtn.innerHTML = ICON.exitFull
  exitBtn.addEventListener('click', (e) => { e.stopPropagation(); exit() })
  exitBtn.addEventListener('pointerdown', (e) => e.stopPropagation())
  stage.appendChild(exitBtn)
  // On touch screens, a clear "Play full screen" button under the stage (the top-bar icon is easy to miss).
  const cta = document.createElement('button')
  cta.type = 'button'; cta.className = 'btn small stage-cta'; cta.innerHTML = `${ICON.full}<span>Play full screen</span>`
  cta.addEventListener('click', () => enter())
  stage.insertAdjacentElement('afterend', cta)

  const sync = () => {
    const full = on()
    stage.classList.toggle('is-full', full)
    if (button) { button.setAttribute('aria-pressed', String(full)); button.title = full ? 'Exit full screen' : 'Full screen'; button.innerHTML = full ? ICON.exitFull : ICON.full }
    stage.dispatchEvent(new CustomEvent('oddvale:fullscreen', { detail: { on: full } }))
  }
  const enterFocus = () => {
    if (focus) return
    focus = true; root.classList.add('stage-focus')
    try { history.pushState({ oddvaleFocus: true }, '') } catch { /* ignore */ }
    sync()
  }
  const exitFocus = (fromHistory) => {
    if (!focus) return
    focus = false; root.classList.remove('stage-focus')
    if (!fromHistory && history.state?.oddvaleFocus) history.back()
    sync()
  }
  function enter() {
    if (on()) return
    if (stage.requestFullscreen) {
      // Some embedded browsers never settle the request: fall back to focus mode after a second.
      const fallback = setTimeout(() => { if (!document.fullscreenElement) enterFocus() }, 1000)
      stage.requestFullscreen({ navigationUI: 'hide' })
        .then(() => { clearTimeout(fallback); if (orientation) screen.orientation?.lock?.(orientation).catch(() => {}) })
        .catch(() => { clearTimeout(fallback); enterFocus() })
    } else enterFocus()
  }
  function exit() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else exitFocus(false)
  }
  document.addEventListener('fullscreenchange', () => {
    // A late native success after the focus fallback: keep just the native one.
    if (document.fullscreenElement === stage && focus) { focus = false; root.classList.remove('stage-focus'); if (history.state?.oddvaleFocus) history.back() }
    sync()
  })
  window.addEventListener('popstate', () => exitFocus(true))
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && focus) exitFocus(false) })
  if (button) { button.hidden = false; button.addEventListener('click', () => (on() ? exit() : enter())) }
  return { enter, exit, toggle: () => (on() ? exit() : enter()), get on() { return on() } }
}

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
export const ICON = {
  soundOn: svg('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  soundOff: svg('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="m17 9 5 6M22 9l-5 6"/>'),
  full: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  exitFull: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
}

/** Draw an odd little robot face (the Oddvale mark) on a canvas: big orange eye, small dot eye, V smile. Centre x,y; size s ~ face width.
 *  look/lookY: where the pupil looks, each -1..1 (default: off to the lower right, like the logo). */
export function drawOddFace(g, x, y, s, { look = 0.54, lookY = 0.38, ink = C.ink, eye = C.orange, blink = false } = {}) {
  const u = s / 64
  g.save(); g.translate(x - 32 * u, y - 32 * u); g.scale(u, u)
  if (blink) { g.strokeStyle = ink; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(9, 22); g.lineTo(33, 22); g.stroke() }
  else {
    g.fillStyle = eye; g.beginPath(); g.arc(21, 22, 13, 0, 7); g.fill()
    g.fillStyle = ink; g.beginPath(); g.arc(21 + look * 6.5, 22 + lookY * 6.5, 5.2, 0, 7); g.fill()
  }
  g.fillStyle = ink; g.beginPath(); g.arc(47, 19, 5.5, 0, 7); g.fill()
  g.strokeStyle = ink; g.lineWidth = 7.5; g.lineCap = 'round'; g.lineJoin = 'round'
  g.beginPath(); g.moveTo(9, 41); g.lineTo(32, 57); g.lineTo(55, 41); g.stroke()
  g.restore()
}
