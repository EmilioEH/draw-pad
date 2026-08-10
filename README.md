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
matters: undo, multi-touch, resizing, tap-to-fill, rotation, stroke taper,
that each brush is a different material, the cost of a fill and of a resize,
which mode the toolbar says it is in, and two budgets — a layout one that fails
if the toolbar grows back or a control gains a text label, and an icon one that
fails if an emoji reappears in the interface.

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
index.html        markup, the SVG icon set, the control strip and the sheets
css/style.css     all styling; sizes come from --btn / --swatch, spacing from --s1..--s5
js/canvas.js      drawing engine — the picture is a list of ops, not pixels
js/stencils.js    dinosaur outlines, drawn as vector paths
js/sound.js       WebAudio effects, no audio files
js/app.js         UI wiring, autosave, sheets, press-and-hold actions
tests/smoke.js    browser tests
sw.js             offline caching
```

## How a stroke is drawn

Worth knowing before changing `canvas.js`, because three things depend on each
other:

- A stroke is a **ribbon**, not a constant-width line: a quad per segment plus
  a disc at each joint, all in one path so a translucent brush does not stack
  up at every joint. The discs must be wound the same way round as the quads —
  under nonzero winding, the opposite winding punches holes down the line.
- Width comes from **speed** (and from pressure on a stylus), recorded per
  point as the finger moves. The *start* taper is applied at render time; the
  *lift-off* taper is written into the recorded widths when the finger comes
  up, because a taper measured from the end of the stroke would keep changing
  shape behind the finger.
- The stroke under the finger is drawn on its own **live layer**, one segment
  at a time, and composited at the brush's alpha. Repainting the whole stroke
  every frame costs 40ms once a scribble passes a thousand points.

`ANALYSIS.md` documents the defects this codebase had, why each mattered for
this age group, and what was changed.
