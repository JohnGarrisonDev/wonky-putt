# Wonky Putt

Mini golf on a course built by the odd little robots of Oddvale, where nothing is straight. An [Oddvale Games](https://games.oddvale.com) title, played at `games.oddvale.com/wonky-putt/`. Designed, coded and updated by AI models.

## The game
- Top-down mini golf, 18 holes: a front nine that teaches one idea per hole and a back nine that mixes them.
- Pull back anywhere on the course like a slingshot and let go. A dotted line shows the path to the first bounce.
- Slow balls drop in the cup, fast balls hop over it.
- Sand, water, ice, slopes and conveyor belts, boost pads, bumpers, sliding blocks, windmills, pipes that teleport, a button-operated door and a one-way gate.
- Play a full round for a scorecard and a medal, or practise any hole you have unlocked. Stars per hole (3 under par, 2 par, 1 finished) unlock new balls. Rounds resume after a reload.

## Controls
- Mouse or touch: press anywhere, pull back, release. Longer pull, harder putt.
- Keyboard: left/right aim, up/down power, Space or Enter to putt, Shift for fine aim, R to restart the hole, Esc for the menu.

## Run it
No build step and no dependencies. Serve the folder with any static server and open it:

```
node ../oddvale-games/scripts/serve.mjs . 4302     # the hub's tiny server, or any other
# then open http://127.0.0.1:4302/
```

Add `?debug` to the URL for a `window.__game` hook used in automated play-testing.

## Test it
```
node --test tests/        # physics invariants, hole data checks, and a solver that proves every hole can be finished within par
node tools/solve.mjs      # course report: fewest strokes found per hole and how ace-able each one is
node tools/humanlike.mjs  # rough expected score per hole for a player with shaky thumbs
```

## Layout
```
index.html        the page (Oddvale shell + the stage)
game.json         metadata the hub reads
cover.webp        cover art (supplied separately)
src/main.js       game flow: title, rounds, practice, result cards, scorecard, the frame loop
src/physics.js    deterministic fixed-step simulation (no DOM): ball, walls, zones, movers, portals, cup
src/holes.js      the 18 holes as data
src/render.js     canvas drawing, particles, the landscape/portrait view transform
src/input.js      slingshot pointer aim and keyboard aim
src/ui.js         DOM overlays: HUD, menus, result card, scorecard, hole select, balls
src/audio.js      synthesised sound effects
src/save.js       scoring rules, ball skins, save data
src/game.css      stage shape, HUD and overlay styles
kit/              copy of the Oddvale kit (do not edit; re-copy from the hub)
tools/            solver, course report, ace map, shot probe, browser autoplayer
tests/            node tests
```

See [AGENTS.md](AGENTS.md) for the architecture, the hole format and how to add a hole.

## License
Code is MIT licensed, see [LICENSE](LICENSE). The fonts in `kit/fonts/` (Fraunces, Figtree, DM Mono) are under the SIL Open Font License 1.1. The Oddvale name and mark are not covered by the MIT license.
