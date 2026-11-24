// Aiming input. Pointer: press anywhere on the stage, pull back like a slingshot, release to putt
// (works the same with mouse and touch, and the finger never has to cover the ball).
// Keyboard: left/right aim, up/down power, space or enter to putt.
// The module only produces an aim { active, angle, power, mode }; main.js decides what a putt does.

export function createInput(canvas, { canAim, toLogicalDir, onChange, onShoot, defaultAngle }) {
  const aim = { active: false, angle: 0, power: 0, mode: 'none' }
  let pointerId = null, sx = 0, sy = 0
  const keys = new Set()
  const maxPull = () => { const r = canvas.getBoundingClientRect(); return Math.max(90, Math.min(190, Math.min(r.width, r.height) * 0.36)) }
  const cancel = () => { if (!aim.active) return; aim.active = false; aim.mode = 'none'; pointerId = null; onChange(aim) }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button > 0) { cancel(); return }
    if (!canAim() || pointerId !== null) return
    pointerId = e.pointerId; sx = e.clientX; sy = e.clientY
    try { canvas.setPointerCapture(e.pointerId) } catch { /* synthetic events have no capture */ }
    aim.mode = 'pointer'; aim.active = false; aim.power = 0
    e.preventDefault()
  })
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return
    const dx = e.clientX - sx, dy = e.clientY - sy, len = Math.hypot(dx, dy)
    if (len < 8) { if (aim.active) { aim.active = false; onChange(aim) } return }
    const d = toLogicalDir(-dx, -dy)
    aim.angle = Math.atan2(d[1], d[0]); aim.power = Math.min(1, (len - 8) / maxPull()); aim.active = true
    onChange(aim)
  })
  const release = (e, fire) => {
    if (e.pointerId !== pointerId) return
    pointerId = null
    const go = fire && aim.active && aim.power > 0.03 && canAim()
    const a = aim.angle, p = aim.power
    aim.active = false; aim.mode = 'none'; onChange(aim)
    if (go) onShoot(a, p)
  }
  canvas.addEventListener('pointerup', (e) => release(e, true))
  canvas.addEventListener('pointercancel', (e) => release(e, false))
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  const AIM_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's']
  const startKeys = () => {
    if (aim.mode === 'keys' && aim.active) return
    if (aim.mode === 'pointer') return
    aim.mode = 'keys'; aim.active = true; aim.angle = defaultAngle(); aim.power = 0.5
    onChange(aim)
  }
  /** Returns true when the key was used (caller prevents default). */
  function keyDown(e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    if (!canAim()) return false
    if (AIM_KEYS.includes(k)) { keys.add(k); startKeys(); return true }
    if (k === ' ' || k === 'Enter') {
      if (e.repeat) return true
      if (aim.mode === 'keys' && aim.active) { const a = aim.angle, p = aim.power; aim.active = false; aim.mode = 'none'; onChange(aim); onShoot(a, p) } else startKeys()
      return true
    }
    if (k === 'Escape' && aim.active) { cancel(); return true }
    return false
  }
  function keyUp(e) { keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key) }
  /** Call every frame: held keys turn the aim smoothly. shift = fine control. */
  function update(dt, fine) {
    if (aim.mode !== 'keys' || !aim.active || !keys.size) return
    if (!canAim()) { keys.clear(); return }
    const turn = (fine ? 0.35 : 1.5) * dt, pw = (fine ? 0.2 : 0.7) * dt
    let changed = false
    if (keys.has('ArrowLeft') || keys.has('a')) { aim.angle -= turn; changed = true }
    if (keys.has('ArrowRight') || keys.has('d')) { aim.angle += turn; changed = true }
    if (keys.has('ArrowUp') || keys.has('w')) { aim.power = Math.min(1, aim.power + pw); changed = true }
    if (keys.has('ArrowDown') || keys.has('s')) { aim.power = Math.max(0.05, aim.power - pw); changed = true }
    if (changed) onChange(aim)
  }
  return { aim, keyDown, keyUp, update, cancel, clearKeys: () => keys.clear() }
}
