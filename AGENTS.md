# Notes for the next AI working on Wonky Putt

Read the hub's `GAME_GUIDE.md` first (no build step, no dependencies, relative URLs, localStorage only, strict CSP, phone and desktop). This file covers this game.

## What it is
Top-down 2D mini golf. 18 holes of data plus a generated daily hole on a fixed 960 x 600 logical field, a deterministic physics module shared by the game and the tests, canvas rendering in the flat Oddvale print style, DOM overlays for the UI.

## Architecture
| File | Job |
| --- | --- |
| `src/physics.js` | The simulation. No DOM. `compileHole(hole)` turns hole data into segments, zones and object lists; `createWorld` / `cloneWorld` / `shoot` / `step` / `settle` run it; `previewPath` gives the dotted aim line. Fixed step `DT = 1/120`. |
| `src/holes.js` | `HOLES`, the course. Plain data. |
| `src/daily.js` | The daily hole: date helpers, `dailyCandidate(date, attempt)` (the generator), `dailyHole(date)`, streaks, the share line. No DOM. |
| `src/daily-table.js` | Generated. For each date from `DAILY_START`: which candidate is published and its par. |
| `src/main.js` | Owns the flow (title, round, practice, result card, scorecard), the frame loop, turning physics events into sound and particles, the keyboard, and the `?debug` hook. |
| `src/render.js` | Everything drawn on the canvas, the particle pool, and the view transform (landscape, or rotated 90 degrees on tall stages). |
| `src/input.js` | Slingshot pointer aim and keyboard aim. Produces `{ active, angle, power }`; `main.js` decides what a putt does. |
| `src/ui.js` | DOM overlays inside `.stage`: HUD, hint toast, title, pause menu, result card, final scorecard, hole select, balls. Buttons carry `data-act`; `main.js` `onAction` handles them. |
| `src/save.js` | Scoring rules (stars, result names, medals, stroke limit), ball skins, and the save-data wrapper with repair of bad data. |
| `src/audio.js` | Sound effects built from the kit's `sfx` synth. |
| `kit/talk.js` | The hub's anonymous player-input widgets (copy, do not edit). `main.js` calls `tellUs` once for the `#tell-us` card and `dailyTalk` on the daily card (`ui.dailyCard` returns its `.talk-slot`) for today's official result only, with `score` = official strokes (the stroke limit when not holed; lower is better, API board `hole`, range 1..12). Hidden when the API is unreachable. |
| `tools/` | `solver.js` (solver, ace scan, hole validator), `solve.mjs` (course report), `acemap.mjs`, `probe.mjs`, `humanlike.mjs`, `autoplay.js` (browser autoplayer), `daily-check.js` (daily fairness checks), `make-dailies.mjs` (writes the daily table and proofs), `daily-proofs.json` (per-day proof data), `daily-stats.mjs`. |
| `tests/` | `node --test tests/`. `tests/index.js` only exists so that command works on every Node version. |

### Physics in one page
- Units are logical pixels and seconds. Hole data uses degrees: 0 = right, 90 = down, 180 = left, 270 = up (y grows downward).
- Ball radius 10, cup radius 15. Full power is 1000 px/s; speed is capped at 1080 px/s so one step (9 px) is always shorter than the ball radius. That is the whole anti-tunnelling argument, so keep `SPEED_CAP * DT < BALL_R` (a test checks it).
- Friction is `decel = a + k * speed` per surface (`SURFACES`): grass, sand (heavy), ice (almost none).
- Everything solid is a segment with an optional thickness: the green's edge, wall polygon edges, thick `line` walls, gate doors, one-way gates. Collision is circle vs closest point on segment, which handles corners. Polygon edges carry a normal so a ball that somehow gets behind an edge is pushed back out the right side.
- Order inside `step`: zones (water, surface, slope, boost) -> friction -> move -> portals -> movers (push capped at 5 px a step) -> bumpers -> static walls twice -> buttons -> cup -> safety net -> rest check. Static walls go last so a mover can never shove the ball through one.
- The cup takes any ball slower than `SINK_SPEED` (260) whose centre is over it. Faster balls get tugged sideways and hop out ("lip").
- Water: +1 stroke, ball returns to where the putt was taken (`world.last`).
- Boost pads kick: forward speed along the arrow becomes at least `speed`; sideways speed is kept. (An earlier version set the whole velocity, which turned every pad into a funnel that aced the hole from anywhere.)
- Movers run on world time `world.t`, which never stops, so timing matters. A mover may sweep a resting ball along; that costs no stroke.
- The ball is forced to rest below 8 px/s (16 on ice) or after 12 s, so a shot can never stall the game. If the ball is ever off the green or NaN it goes back to `world.last` free of charge.
- `step` pushes plain objects onto `world.events` when that array exists (`wall`, `bumper`, `splash`, `penalty`, `sand`, `ice`, `boost`, `portal`, `button`, `lip`, `mover`, `sunk`, `stop`, `reset`). The game reads and clears them; the solver leaves `events` null.

### View and input
- `render.js` fits the 960 x 600 field under a 46 px HUD strip. If the stage is taller than wide it rotates the field 90 degrees (logical +x points up the screen, so tees sit at the bottom). `toLogicalDir` converts a screen drag into a logical direction; `upright()` draws faces, the flag and text screen-aligned in both views.
- Static art is cached in two offscreen canvases (ground and walls). Call `R.invalidate()` if something static changes; `setHole` does it for you.
- The stage ratio is 3:2, or 4:7 on portrait phones (`src/game.css`).

### Save data (`oddvale:wonky-putt`)
`{ v: 2, best: { holeIndex: strokes }, unlocked, aces, aceHoles, round: { i, scores[], cur: { strokes, x, y, open[] } | null, mulligans } | null, bestRound, rounds, skin, daily }`.
`daily` (added in v2 / 1.1.0) is `{ history: { 'YYYY-MM-DD': { s: strokes, p: par, k: 1 holed | 0 not } }, cur: { date, strokes, x, y } | null, bestStreak, practice: { date, best } | null }`. `cur` is the official try in progress; it is written when a putt is taken (so reloading mid-roll still costs the stroke and puts the ball back where it was hit) and when the ball stops. The result is written the moment the ball drops. History keeps the last 400 days. `makeSave` / `repairDaily` repair anything malformed; v1 saves just gain an empty `daily`. Never break old saves: add fields with defaults, migrate on `v`.

## Hole format
A hole is one object in `HOLES`. Everything except `name`, `par`, `tee`, `cup` and `green` is optional.

```js
{
  name: 'Ding Dong', par: 4,                       // par 2..5; the stroke limit is par + 5
  hint: 'Roll over the button to open the door.',  // one short line shown at the start (under 70 characters)
  tee: [140, 400], cup: [800, 400],                // ball start and cup centre
  green: [[74, 116], [886, 108], [890, 490], [78, 484]], // the playable area: ONE polygon. Its edge is the outer wall.
                                                   // Keep every point 40 px inside the 960 x 600 field. Skew it a little: nothing is straight.
  walls: [
    { rect: [670, 100, 24, 150] },                 // x, y, w, h. Add rot: degrees to tilt it about its centre.
    { poly: [[300, 200], [340, 210], [320, 250]] },// any polygon
    { line: [792, 150, 862, 250], w: 16 },         // a thick rounded bar, handy for deflectors
  ],
  zones: [                                         // shape is rect (+rot), poly, or circle: [cx, cy, r]. Zones are clipped to the green when drawn.
    { type: 'sand', circle: [480, 302, 118] },     // heavy friction
    { type: 'water', rect: [320, 296, 290, 84] },  // +1 stroke, back to the last spot
    { type: 'ice', rect: [280, 60, 640, 480] },    // almost no friction
    { type: 'slope', rect: [300, 120, 360, 380], dir: 90, force: 260 }, // constant push along dir (px/s^2). Keep force >= 200.
    { type: 'boost', rect: [340, 256, 60, 60], dir: 0, speed: 1080 },    // kick along dir to at least this speed
  ],
  bumpers: [[400, 300, 30]],                       // x, y, radius. They kick the ball away.
  movers: [
    { type: 'slider', size: [40, 120], from: [370, 200], to: [370, 400], period: 3.2, phase: 0.25 }, // axis-aligned block, eases between two centres
    { type: 'spinner', at: [600, 300], len: 78, arms: 3, speed: 1.25, phase: 0 },                    // windmill; speed in rad/s, phase in degrees
  ],
  portals: [{ a: [330, 240], b: [610, 380] }],     // enter one end, leave the other with the same speed and heading. aOut / bOut: force an exit angle.
  gates: [{ id: 'door', line: [682, 256, 682, 344] }], // a door that is solid until its button is pressed
  buttons: [{ at: [330, 240], opens: 'door' }],    // rolling over it opens the gate for the rest of the hole
  oneways: [{ line: [700, 118, 700, 281] }],       // drawn top-to-bottom, the ball may cross left-to-right only
  decor: [{ bot: [780, 60], color: 'pink' }],      // little robots standing outside the green: yellow, pink, blue, mint, orange
}
```

Two separate rooms? Use one green polygon and a wall that spans it (see Pipe Dream, Pipe Organ).

## Adding or changing a hole
1. Add the entry to `src/holes.js`. Open the game with `?debug`, run `__game.unlockAll(); __game.goto(index)` and look at it at desktop size and at phone size (the field rotates).
2. `node tools/solve.mjs <holeNumber>` prints data problems, the fewest strokes the solver found, the share of random first putts that ace it, and whether simply aiming at the cup aces it.
3. `node tools/acemap.mjs <holeNumber>` shows which aim directions ace it and over what power range. A wide power range from many directions means the hole has a funnel: move the cup or break the funnel.
4. `node tools/humanlike.mjs <holeNumber>` estimates the score of a player who knows the lines but has jittery thumbs. Use it to set par.
5. `node tools/probe.mjs <holeNumber> <deg> <power> ...` replays specific putts.
6. `node --test tests/` must pass. The tests enforce: valid data (tee and cup clear of walls, nothing crowding them, movers leave no pinch points, the cup is reachable), solvable within par on a coarse 3-degree grid, no hole after the third aced by a straight full-power shot at the cup, and under 3% of random first putts acing any hole after the third.

Design rules that have held up:
- One new idea per hole in the front nine, shown in the easiest possible form. Combine ideas in the back nine.
- Every hole should read at a glance. If it needs a paragraph, it is two holes.
- Give each hole one clever line (a bank, a timing window, a ride) that a good player can find. An ace should be earned by angle, not luck.
- Things that add energy (bumpers, steep slopes, boost pads) create chaos, and chaos finds the cup. Keep the cup away from where their streams end unless that is the point.
- Moving parts must stay at least a ball width (plus a little) from walls at every position; the validator checks sliders at both ends of travel and spinners over their whole sweep.
- Fairness beats difficulty. Water lanes should be at least 90 px wide where a first-time player has to thread them.

## Balance notes (v1.1.0)
- Dailies, first year (2026-11-25 .. 2027-11-24, `node tools/daily-stats.mjs --days=365`): par 2: 25, par 3: 234, par 4: 100, par 5: 6. Mean par Mon 2.88, Tue 2.79, Wed 3.15, Thu 3.40, Fri 3.42, Sat 3.48, Sun 3.54. The solver needs 1 stroke on 232, 2 on 132, 3 on one. The noisy player averages about 1 under par (as on the course, where it averages 37 against par 57) and was over par on 147 of 2,920 runs.
- Daily par is generous on purpose: the official try is everyone's first look at that hole.

### Course (v1.0.0)
- Course par 57. The solver finishes most holes in 1 and the rest in 2; the jittery "knows every line" bot in `tools/humanlike.mjs` averages about 40. A first-time human should land near or over par.
- Medals (`roundMedal` in `save.js`): Odd Legend at 14 under, Golden Gear at 7 under, Silver Sprocket at par, Bronze Bolt up to 12 over.
- Skins unlock at 8, 16, 24, 32, 40 and 48 stars of 54.
- Holes 14, 17 and 18 have no known hole-in-one. That is fine, but a discoverable one would be a nice update.

## Daily hole (read before touching `src/daily.js`)
One hole per local date, the same for everyone. How a date becomes a hole:
1. `hashString('wonky-putt:' + date)` seeds `makeRng`; each draw from it is the sub-seed of one candidate (`attempt` 0, 1, 2 ...).
2. `dailyCandidate(date, attempt)` builds a hole with integer maths only (no `Math.sin/cos/atan2/hypot`; only `+ - * /` and `Math.floor/trunc/round`), so every browser builds byte-identical data. The weekday (`DAY_PLAN`) sets how many mechanics are combined (Mon/Tue 1, Wed-Fri 2, Sat/Sun 3) and the allowed par range. Layouts: lane, dogleg, U-turn, two rooms, bowl. Mechanics are placed along the tee-to-cup path, each in its own stretch; then an optional mirror; then robots, a name and a hint. Walls of daily holes may run past the green's edge; the renderer trims them to the green.
3. `tools/make-dailies.mjs` (node, worker threads, about 2.5 minutes a year on 16 cores) walks the candidates and keeps the first that passes `assessDaily` in `tools/daily-check.js`: valid data; no straight full-power ace and no ace from simply aiming at the cup; the solver finishes it in 4 or fewer on a 3-degree grid; under 2% of first putts ace it; a noisy player (aim +-2.5 deg, power +-6%) never nears the stroke limit and makes par in at least 3 of 4 tries; par fits the weekday band; and from the worst resting spots that random and noisy play reach, the solver still finishes in 3 (no stuck spots). Par = `max(solver + 1, ceil(noisy mean + 0.5))`, clamped to 2..5.
4. It appends `<attempt>.<par>` per date to `src/daily-table.js` and the proof (solver line, noisy scores, hole hash) to `tools/daily-proofs.json`. The game only reads the table, so no physics runs at load and float differences between browsers can never change which hole is published. Dates past the end of the table reuse the entry from 52 weeks earlier (same weekday): a safety net, not a plan.

**The rule: generator changes alter everyone's daily.** Any change to `dailyCandidate` and its helpers, the name or hint lists, `DAY_PLAN`, the kit's `makeRng` / `hashString`, or the order or number of `rng` calls changes published holes, breaks players' saved results and resumes, and makes two players on different versions see different holes. `tests/daily.test.js` holds a snapshot of five dates and checks every table day against its proof hash. If those fail, you changed the holes: do not paste in new hashes or regenerate the table. To change the generator, add a new code path chosen by date (for example `if (daysBetween(GEN2_START, key) >= 0)`) that only affects dates after the table's last published day, and keep the old path byte-for-byte. Physics and `validateHole` changes are just as dangerous: the tests replay each day's solver line and re-run the solver over the first year, so if they fail, published dailies may no longer be fair.

**Extending the table** (do it well before it runs out; `node --test` warns when fewer than 60 days are left): `node tools/make-dailies.mjs` adds a year after the last date (or `--to=YYYY-MM-DD`). It never rewrites existing days. Then run `node tools/daily-stats.mjs` and `node --test tests/`, and look at a few new holes in the browser (`?debug`, then `__game.daily('2028-01-03', 'dailyPractice')`). The fresh-solver test covers the first 365 days from `DAILY_START`; widen it if you want later years re-solved too (about 30 s a year).

Game flow: the title shows today's status (not played, in progress, or result and streak). The first press shows a short intro card; "Tee off" starts the official try (no restarts: R and the menu refuse). When it ends, the daily card shows the result, streak, best streak, the last seven days and Copy result; "Practise it" starts unlimited practice runs (`kind: 'dailyPractice'`) that only track a practice best. An official try left unfinished on a past date is offered first ("Finish yesterday's daily") and counts for its own date. A day counts toward the streak only when the ball was holed in the official try. Daily holes do not touch course stars, bests or the ace counter.

## Phones and full screen
- `wireChrome({ stage })` (kit) gives native full screen or the iPhone focus mode; both set `.stage.is-full`. `src/game.css` pads the HUD with `env(safe-area-inset-*)` there and keeps it clear of the kit's exit button.
- The HUD is 52 px on touch screens and taller with a notch, so `fit()` in main.js measures it against the canvas rect into `R.view.top` before `R.resize()` (it used to be the fixed `HUD_H`). It runs on stage resize and when a hole opens.
- Input: the dead zone is 8 px for a mouse, 20 px for touch. Coming back inside it after a live pull sets `aim.back` (main shows "Let go here to cancel."). A second pointer cancels (`onCancel`); `pointercancel` and `lostpointercapture` cancel without putting.
- `table.card` (scorecard) shares the kit's `.card` class name, so game.css resets its grid, padding and shadow.
- `haptic()` on a putt, a splash and a sunk ball.

## Testing in a browser
- `?debug` exposes `window.__game`: `goto(i)`, `shoot(deg, power)`, `state()`, `advance(seconds)` (runs the loop without waiting for frames; background tabs throttle `requestAnimationFrame`), `unlockAll()`, `action(name, arg)`, `daily(date, kind)` (`kind` 'daily' goes through the real flow; 'dailyPractice' just loads that date's hole), `dailyHole(date)`, `setToday(date)`, `lastShare()`. `?debug&date=YYYY-MM-DD` pretends today is that date.
- `auto.playHole(__game)` from `tools/autoplay.js` also plays the daily hole.
- `const auto = await import('./tools/autoplay.js'); auto.playRound(__game)` plays a whole round through the real result cards and scorecard.
- Before shipping: no console errors or warnings, play at desktop size and at about 390 x 800, check keyboard-only play, reload mid-round and continue.

## Backlog (ideas for future updates)
- A second course ("The Back Garden"): nine night holes with new parts. The structure to add is a `course` field or a second array plus a course picker on the title screen.
- Daily: an archive of past dailies (practice only, never streak credit); a streak freeze; a share image; a countdown to the next hole; daily-only parts (wind, a magnet) behind a generator switch dated after the table's end (see "Daily hole"). Names repeat now and then (286 distinct in the first year).
- New parts: a loop or tunnel that hides the ball for a moment, a magnet that bends paths, a ramp that lets the ball hop a wall, a rotating one-way turnstile, a second ball to knock in ("snooker hole"), wind that changes each stroke.
- Ghost of your best run on a hole, drawn as a faint dotted path.
- Replay of a hole-in-one with a share-friendly still.
- Per-hole "ace found" badges in hole select (the data is already saved in `aceHoles`).
- More skins with small physical jokes (a square "ball" that only looks square, a trail of footprints).
- Robots that react: clap on a birdie, duck when the ball flies near, hold up score cards.
- Colour-blind check on zone tints, and an option for a thicker aim line.
- Sound: a soft rolling loop tied to ball speed, and per-surface roll tones.
- Hole editor in `?debug`: drag points, dump the object to the console.
