# Small Hours

A roof garden, a little before four.

The roof garden waters itself by sensor, all except one shelf of seedlings a
neighbour left as a gift. You come up the stairs before dawn with a copper cup
and water them by hand. Three nights, one neighbour on the stairs, and one
choice about whether the system should be told. About eight minutes, with two
endings.

Play it at https://cyborg.garden/games/small-hours/

## Where it plays

- **cyborg.garden/games/small-hours/** and the **Discord arcade**, from the
  `built` branch, through the site's `games.sources.json`. `meta.json` sets
  the card and the status.
- **xbox50 console**, served under `/cart/`. The console finds the game in
  the site's arcade index and takes its pad map from the `xbox50` block in
  `meta.json`. On that path the words are bigger, the next thing to use
  always has a ring on it, and the sound is voiced for TV speakers.

## Controls

| | Mouse or touch | Keyboard | xbox50 |
|---|---|---|---|
| Use a thing | tap it | arrows to choose, Enter | stick to choose, button |
| Water the next pot | tap it | | button |
| Look around | drag | | |
| The choice | tap a label | arrows, then Enter | stick left or right, then button |
| Sound on or off | the Sound button | M | the TV's own volume |

At the choice the button alone does nothing. Pick a label first.

## Build

Node 22.

    npm ci
    node tools/build.mjs --site

That packs `assets/` into `src/assets/pack.gen.js` when the models have
changed, then writes `dist/small-hours.html`, the whole game in one file, and `site/`,
the same game as `index.html`, `game.js` and `style.css`. A push to `main`
builds `site/` and publishes it as the `built` branch
(`.github/workflows/build.yml`).

To play a local build:

    python3 -m http.server -d site

## Checks

    npm run release    # about two minutes: the arcade's rules, a strict
                       # content policy, a keys-only console run to both
                       # endings, and the console's sound
    npm run gates      # about an hour: every check, including four whole
                       # playthroughs by a player that can only see the screen

They run in headless Chromium with the sound muted. Nothing reaches a speaker.

## Credits

Made at Cyborg Garden. Written, drawn and scored by Claude for Juniper
Bevensee. The roof, the plants, the city, the light and every sound are made
by the code in `src/` when the page loads.

The two people are MakeHuman bodies (CC0), and they move with Quaternius's
Universal Animation Library clips (CC0). The seat, the book and the bucket
are from Poly Haven (CC0). The models are in `assets/` and are packed into
the game by `tools/assets.mjs`, with every texture re-encoded so no image
carries metadata. `CREDITS.md` lists each one, where it came from and what
was changed.

Drawn with [three.js](https://threejs.org), MIT licence. Its licence ships
beside the game as `three.LICENSE.txt`.
