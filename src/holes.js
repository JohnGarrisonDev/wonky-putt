// The course. Holes are plain data on a fixed 960 x 600 field (x right, y down). Add a hole by adding an entry.
// The full format is documented in AGENTS.md. Short version:
//   name, par (2..5), hint (optional one-liner shown at the start)
//   tee: [x, y]   cup: [x, y]
//   green: [[x, y], ...]            the playable area, one polygon; its edge is the outer wall
//   walls: [{ rect: [x, y, w, h], rot? } | { poly: [[x, y], ...] } | { line: [x1, y1, x2, y2], w? }]
//   zones: [{ type: 'sand' | 'water' | 'ice' | 'slope' | 'boost', rect | poly | circle: [cx, cy, r], dir?, force?, speed? }]
//   bumpers: [[x, y, r]]
//   movers: [{ type: 'slider', size: [w, h], from: [x, y], to: [x, y], period, phase? }
//            | { type: 'spinner', at: [x, y], len, arms, speed, phase? }]
//   portals: [{ a: [x, y], b: [x, y], aOut?, bOut? }]      (a ball entering one end leaves the other, keeping its speed)
//   gates: [{ id, line: [x1, y1, x2, y2] }]   buttons: [{ at: [x, y], opens: id }]
//   oneways: [{ line: [x1, y1, x2, y2] }]      (drawn top-to-bottom, the ball may cross left-to-right)
//   decor: [{ bot: [x, y], color? }]           (little robots standing around, outside the green)
// Angles are degrees: 0 = right, 90 = down, 180 = left, 270 = up.
// After editing, run `node tools/solve.mjs` (and `node --test tests/`): every hole must be finishable within par.

export const HOLES = [
  // ---------------------------------------------------------------- front nine
  {
    name: 'Warm-Up Wobble', par: 2,
    hint: 'Press anywhere, pull back, let go.',
    tee: [180, 312], cup: [770, 292],
    green: [[90, 205], [872, 178], [884, 398], [102, 424]],
    decor: [{ bot: [470, 110], color: 'yellow' }, { bot: [300, 510], color: 'pink' }],
  },
  {
    name: 'Elbow Grease', par: 2,
    hint: 'Nothing here is straight. Bank it off the slanted corner.',
    tee: [160, 436], cup: [786, 150],
    green: [[80, 372], [696, 356], [704, 84], [862, 72], [874, 398], [784, 506], [88, 498]],
    decor: [{ bot: [380, 230], color: 'blue' }],
  },
  {
    name: 'Mind the Gaps', par: 3,
    hint: 'Thread both gaps and it is a hole in one.',
    tee: [160, 300], cup: [800, 262],
    green: [[78, 186], [884, 168], [880, 432], [82, 414]],
    walls: [
      { rect: [330, 176, 26, 90] }, { rect: [330, 322, 26, 100] },
      { rect: [590, 170, 26, 72] }, { rect: [590, 300, 26, 128] },
    ],
    decor: [{ bot: [470, 100], color: 'mint' }, { bot: [700, 510], color: 'yellow' }],
  },
  {
    name: 'Beach Episode', par: 3,
    hint: 'Sand eats speed. The walls do not.',
    tee: [150, 300], cup: [812, 304],
    green: [[70, 150], [886, 136], [896, 468], [82, 458]],
    walls: [{ rect: [456, 270, 48, 62], rot: 9 }],
    zones: [{ type: 'sand', circle: [480, 302, 118] }],
    decor: [{ bot: [300, 80], color: 'pink' }],
  },
  {
    name: 'Puddle Hop', par: 3,
    hint: 'Water costs a stroke and sends you back.',
    tee: [150, 400], cup: [806, 330],
    green: [[72, 140], [888, 150], [884, 470], [78, 462]],
    zones: [{ type: 'water', poly: [[392, 256], [578, 244], [572, 480], [398, 480]] }],
    decor: [{ bot: [480, 540], color: 'blue' }, { bot: [200, 78], color: 'yellow' }],
  },
  {
    name: 'Butter Side Down', par: 3,
    hint: 'Ice barely slows the ball. Let the corners steer.',
    tee: [160, 186], cup: [170, 412],
    green: [[80, 96], [700, 90], [884, 280], [884, 330], [700, 506], [84, 500]],
    walls: [{ rect: [72, 278, 568, 44] }, { rect: [264, 392, 22, 50], rot: -6 }],
    zones: [{ type: 'ice', rect: [280, 60, 640, 480] }],
    decor: [{ bot: [860, 110], color: 'mint' }, { bot: [860, 500], color: 'pink' }],
  },
  {
    name: 'Slightly Downhill', par: 3,
    hint: 'The arrows push. Aim uphill of the cup.',
    tee: [150, 250], cup: [815, 250],
    green: [[70, 142], [890, 150], [888, 468], [74, 460]],
    zones: [
      { type: 'slope', rect: [300, 120, 360, 380], dir: 90, force: 260 },
      { type: 'sand', poly: [[300, 404], [660, 408], [660, 480], [300, 480]] },
    ],
    decor: [{ bot: [480, 80], color: 'yellow' }],
  },
  {
    name: 'The Boing Department', par: 3,
    hint: 'Bumpers kick back. Go around, or use them.',
    tee: [150, 300], cup: [770, 300],
    green: [[80, 200], [300, 120], [700, 110], [890, 220], [880, 400], [690, 490], [310, 480], [90, 390]],
    bumpers: [[400, 300, 30], [590, 300, 24], [700, 204, 26], [700, 396, 26]],
    decor: [{ bot: [130, 120], color: 'blue' }, { bot: [840, 500], color: 'mint' }],
  },
  {
    name: 'The Wonky Windmill', par: 3,
    hint: 'Wait for a gap between the blades.',
    tee: [150, 300], cup: [820, 300],
    green: [[70, 170], [380, 160], [470, 192], [730, 190], [790, 150], [890, 160], [886, 450], [790, 440], [730, 406], [470, 410], [380, 440], [74, 430]],
    movers: [{ type: 'spinner', at: [600, 300], len: 78, arms: 3, speed: 1.25 }],
    decor: [{ bot: [600, 110], color: 'pink' }, { bot: [600, 500], color: 'yellow' }],
  },
  // ---------------------------------------------------------------- back nine
  {
    name: 'Pipe Dream', par: 3,
    hint: 'In one pipe, out the other, same speed, same heading.',
    tee: [150, 400], cup: [822, 262],
    green: [[76, 176], [472, 168], [472, 112], [884, 110], [890, 432], [472, 440], [472, 486], [80, 480]],
    walls: [{ rect: [452, 100, 40, 398] }, { rect: [698, 304, 36, 36], rot: 20 }],
    portals: [{ a: [330, 240], b: [610, 380] }],
    decor: [{ bot: [472, 60], color: 'blue' }],
  },
  {
    name: 'Express Lane', par: 3,
    hint: 'Nobody putts across that much sand. Take the booster.',
    tee: [130, 420], cup: [836, 372],
    green: [[72, 130], [888, 124], [886, 476], [76, 470]],
    zones: [
      { type: 'sand', rect: [400, 100, 158, 400] },
      { type: 'boost', rect: [340, 256, 60, 60], dir: 0, speed: 1080 },
    ],
    decor: [{ bot: [535, 70], color: 'mint' }],
  },
  {
    name: 'Mind Your Toes', par: 3,
    hint: 'The blocks do not stop for anyone.',
    tee: [140, 220], cup: [826, 380],
    green: [[72, 112], [888, 104], [892, 494], [78, 488]],
    walls: [{ rect: [468, 268, 44, 64], rot: 12 }],
    movers: [
      { type: 'slider', size: [40, 120], from: [370, 200], to: [370, 400], period: 3.2 },
      { type: 'slider', size: [40, 120], from: [610, 400], to: [610, 200], period: 3.2, phase: 0.25 },
    ],
    decor: [{ bot: [200, 550], color: 'yellow' }],
  },
  {
    name: 'Ding Dong', par: 4,
    hint: 'Roll over the button to open the door.',
    tee: [140, 400], cup: [800, 400],
    green: [[74, 116], [886, 108], [890, 490], [78, 484]],
    walls: [{ rect: [670, 100, 24, 150] }, { rect: [670, 350, 24, 146] }],
    gates: [{ id: 'door', line: [682, 256, 682, 344] }],
    buttons: [{ at: [330, 240], opens: 'door' }],
    decor: [{ bot: [780, 60], color: 'pink' }],
  },
  {
    name: 'Bumper Crop', par: 4,
    hint: 'One small gap, three loud vegetables.',
    tee: [140, 300], cup: [800, 180],
    green: [[76, 110], [884, 116], [888, 486], [80, 492]],
    walls: [{ rect: [560, 104, 24, 176] }, { rect: [560, 330, 24, 166] }],
    zones: [{ type: 'sand', rect: [604, 246, 110, 118], rot: 6 }],
    bumpers: [[330, 215, 26], [330, 385, 26], [450, 300, 24]],
    decor: [{ bot: [300, 550], color: 'mint' }],
  },
  {
    name: 'Thin Ice', par: 3,
    hint: 'It is slippery and there are holes in it.',
    tee: [140, 300], cup: [810, 300],
    green: [[70, 120], [890, 114], [892, 486], [74, 480]],
    zones: [
      { type: 'ice', rect: [240, 90, 460, 420] },
      { type: 'water', circle: [400, 212, 50] }, { type: 'water', circle: [400, 396, 50] }, { type: 'water', circle: [550, 302, 54] },
      { type: 'water', circle: [650, 172, 36] }, { type: 'water', circle: [650, 436, 36] },
    ],
    decor: [{ bot: [480, 60], color: 'blue' }],
  },
  {
    name: 'Sushi Train', par: 3,
    hint: 'Hop on the belt and enjoy the ride.',
    tee: [800, 420], cup: [800, 190],
    green: [[180, 112], [884, 116], [888, 486], [80, 480], [80, 216]],
    walls: [{ rect: [690, 280, 204, 22] }],
    zones: [
      { type: 'slope', rect: [96, 230, 130, 190], dir: 270, force: 300 },
      { type: 'slope', rect: [250, 130, 440, 140], dir: 0, force: 300 },
      { type: 'water', rect: [320, 296, 290, 84], rot: -2 },
    ],
    oneways: [{ line: [700, 118, 700, 281] }],
    decor: [{ bot: [110, 110], color: 'yellow' }],
  },
  {
    name: 'Pipe Organ', par: 4,
    hint: 'Three rooms, two pipes, one very busy stick.',
    tee: [150, 400], cup: [810, 180],
    green: [[72, 110], [888, 106], [890, 492], [76, 488]],
    walls: [{ rect: [330, 96, 22, 404] }, { rect: [610, 96, 22, 404] }],
    portals: [{ a: [240, 180], b: [420, 420] }, { a: [540, 170], b: [700, 420] }],
    movers: [{ type: 'spinner', at: [480, 300], len: 66, arms: 2, speed: 1.6 }],
    zones: [{ type: 'sand', circle: [760, 300, 40] }],
    decor: [{ bot: [480, 550], color: 'pink' }],
  },
  {
    name: 'The Grand Wonk', par: 5,
    hint: 'Everything the robots own, in one hole.',
    tee: [130, 152], cup: [826, 476],
    green: [[70, 84], [888, 78], [892, 548], [74, 544]],
    walls: [{ rect: [62, 222, 698, 20] }, { rect: [200, 388, 700, 20] }],
    zones: [
      { type: 'sand', rect: [540, 90, 90, 126] },
      { type: 'water', rect: [540, 240, 100, 72] },
      { type: 'boost', rect: [300, 446, 60, 60], dir: 0, speed: 700 },
    ],
    bumpers: [[360, 120, 22], [430, 190, 22]],
    movers: [
      { type: 'spinner', at: [380, 315], len: 40, arms: 3, speed: 1.5 },
      { type: 'slider', size: [44, 64], from: [560, 476], to: [700, 476], period: 3 },
    ],
    portals: [{ a: [850, 118], b: [130, 476] }],
    decor: [],
  },
]
