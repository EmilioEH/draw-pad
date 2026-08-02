# Draw Pad

A finger-drawing PWA for children aged 3–6: draw, trace dinosaur outlines, tap
to fill them in, and add stickers. No dependencies at runtime, works offline.

## Running it

Any static file server will do — the app is plain HTML, CSS and JS.

```sh
npm start          # http://localhost:8000
```

A service worker is registered, so open it over `http://localhost` rather than
`file://`.

## Tests

```sh
npm test
```

This drives the real app in a headless browser and checks the behaviour that
matters: undo, multi-touch, resizing, tap-to-fill, and a layout budget that
fails if the toolbar grows back or a control gains a text label.

The tests need a Chromium binary. `npm test` installs one automatically the
first time; if that fails (offline, restricted network), either run

```sh
npx playwright install chromium
```

or point `CHROME_PATH` at a Chrome/Chromium you already have:

```sh
CHROME_PATH=/usr/bin/chromium npm test
```

## Layout

```
index.html        markup and the control strip
css/style.css     all styling; button sizes come from --btn / --swatch
js/canvas.js      drawing engine — the picture is a list of ops, not pixels
js/stencils.js    dinosaur outlines, drawn as vector paths
js/sound.js       WebAudio effects, no audio files
js/app.js         UI wiring, autosave, pickers, press-and-hold actions
tests/smoke.js    browser tests
sw.js             offline caching
```

`ANALYSIS.md` documents the defects this codebase had, why each mattered for
this age group, and what was changed.
