// Sound effects: all synthesised with the kit's tiny synth, no audio files.
import { sfx } from '../kit/kit.js'

let lastWall = 0
const now = () => performance.now()

export const audio = {
  putt(power) { sfx.noise({ dur: 0.05, vol: 0.12 + power * 0.2, freq: 900 + power * 1500 }); sfx.tone({ freq: 150 + power * 130, dur: 0.09, type: 'triangle', vol: 0.18 + power * 0.14, slide: 80 }) },
  wall(v) {
    if (now() - lastWall < 45) return
    lastWall = now()
    const k = Math.min(1, v / 700)
    sfx.tone({ freq: 190 + k * 160, dur: 0.05 + k * 0.04, type: 'square', vol: 0.04 + k * 0.13, slide: 110 }); sfx.noise({ dur: 0.04, vol: 0.03 + k * 0.1, freq: 2200 })
  },
  mover(v) { const k = Math.min(1, v / 600); sfx.tone({ freq: 130, dur: 0.09, type: 'sawtooth', vol: 0.06 + k * 0.1, slide: 70 }) },
  bumper() { sfx.tone({ freq: 330, dur: 0.16, type: 'sine', vol: 0.26, slide: 760 }); sfx.tone({ freq: 660, dur: 0.1, type: 'triangle', vol: 0.12, slide: 990, delay: 0.03 }) },
  splash() { sfx.noise({ dur: 0.35, vol: 0.26, freq: 2600, slide: 300 }); sfx.tone({ freq: 420, dur: 0.22, type: 'sine', vol: 0.14, slide: 110 }) },
  sand() { sfx.noise({ dur: 0.2, vol: 0.14, freq: 5200, slide: 1800 }) },
  ice() { sfx.tone({ freq: 1500, dur: 0.14, type: 'sine', vol: 0.06, slide: 2300 }) },
  portal() { sfx.tone({ freq: 240, dur: 0.2, type: 'sawtooth', vol: 0.1, slide: 1300 }); sfx.tone({ freq: 1300, dur: 0.16, type: 'sine', vol: 0.1, slide: 320, delay: 0.1 }) },
  boost() { sfx.tone({ freq: 220, dur: 0.24, type: 'sawtooth', vol: 0.13, slide: 1200 }); sfx.noise({ dur: 0.2, vol: 0.1, freq: 800, slide: 5000 }) },
  button() { sfx.tone({ freq: 880, dur: 0.07, type: 'square', vol: 0.14 }); sfx.tone({ freq: 1320, dur: 0.12, type: 'square', vol: 0.12, delay: 0.08 }) },
  lip() { sfx.tone({ freq: 520, dur: 0.07, type: 'triangle', vol: 0.12, slide: 340 }) },
  sink() { sfx.tone({ freq: 300, dur: 0.07, type: 'sine', vol: 0.25, slide: 120 }); sfx.noise({ dur: 0.05, vol: 0.14, freq: 600 }); sfx.tone({ freq: 180, dur: 0.16, type: 'triangle', vol: 0.2, slide: 70, delay: 0.07 }) },
  result(diff) {
    if (diff < 0) sfx.tune([[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.22]], { vol: 0.16 })
    else if (diff === 0) sfx.tune([[523, 0.1], [659, 0.1], [784, 0.2]], { vol: 0.15 })
    else sfx.tune([[440, 0.12], [392, 0.2]], { vol: 0.13 })
  },
  ace() { sfx.tune([[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.08], [784, 0.08], [1047, 0.08], [1319, 0.34]], { vol: 0.18 }); sfx.tune([[262, 0.16], [330, 0.16], [392, 0.16], [523, 0.36]], { type: 'square', vol: 0.06 }) },
  fanfare() { sfx.tune([[392, 0.12], [523, 0.12], [659, 0.12], [784, 0.2], [659, 0.1], [784, 0.4]], { vol: 0.17 }) },
  fail() { sfx.tune([[330, 0.14], [262, 0.14], [196, 0.3]], { type: 'sawtooth', vol: 0.09 }) },
  click() { sfx.tone({ freq: 620, dur: 0.045, type: 'square', vol: 0.08 }) },
  tick() { sfx.tone({ freq: 900, dur: 0.02, type: 'square', vol: 0.03 }) },
  unlock() { sfx.tune([[784, 0.07], [988, 0.07], [1175, 0.2]], { vol: 0.14 }) },
}
