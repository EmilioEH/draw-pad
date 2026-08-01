# Draw Pad — Review for Ages 3–6

An analysis of the app as it stands, recommendations for the 3–6 age group, and a
code-quality assessment.

Every defect in Part 1 was reproduced in a real browser (headless Chromium driving
the app over HTTP) rather than inferred from reading the source. Reproduction steps
are included so each one can be re-checked.

## Status

**All ten defects in Part 1 are now fixed**, and `tests/smoke.js` covers them so they
can't come back (`npm test`, 13 checks). Part 1 is kept as written — the original
diagnosis — with each item marked.

The **Part 2 recommendations are mostly still open**: the UI has not been restructured
for the age group yet. Landed from Part 2 so far: smoothing is always on, the
unreadable `confirm()` is now a press-and-hold, the drawing autosaves, and stencil
contrast is raised. Still to do: fewer and bigger wordless controls, full-screen
stencil/stamp pickers, sound, tap-to-fill, and redrawing the T-Rex and Triceratops.

---

## Part 1 — Defects (verified)

These are ordered by how badly they hurt a child using the app. The first five are,
in my view, ship-blocking: they destroy the child's drawing.

### 1. Undo erases the entire drawing, permanently — CRITICAL — FIXED

`DrawCanvas.undo()` (js/canvas.js:83) sets `img.src` and calls `drawImage` on the
very next line:

```js
const img = new Image();
img.src = this.undoStack.pop();
this.ctx.clearRect(0, 0, this._w, this._h);
this.ctx.drawImage(img, 0, 0, this._w, this._h);   // img has not decoded yet
```

Image decoding is asynchronous even for `data:` URLs. So `clearRect` wipes the
canvas, `drawImage` draws a not-yet-loaded image (a no-op), and because nothing
re-draws on `img.onload`, the canvas stays blank forever.

**Measured:** two strokes = 5136 painted pixels → tap undo → 0 pixels at +50 ms,
still 0 pixels at +2 s. The drawing is gone and is not recoverable.

The same async-image pattern appears twice more, in `_move` (canvas.js:249) and
`_end` (canvas.js:308) on the smoothing path.

Separately, the undo stack is **off by one even in principle**: `saveState()` runs at
the *end* of a stroke, so the top of the stack is the canvas *including* the stroke
you're trying to remove. Once the async bug is fixed, the first undo tap would still
appear to do nothing.

Fix: don't round-trip through PNG at all — keep a list of strokes (points, colour,
width) and re-render, or hold `ImageBitmap`/`ImageData` snapshots. If images are
kept, you must await `decode()`/`onload` before clearing.

### 2. Two fingers on the screen produce a scribble — CRITICAL — FIXED

`this.drawing` and `this._lastPos` are single values on the instance, shared by every
pointer. With two fingers down, each `pointermove` draws a line from *the other
finger's* last position, so the two strokes cross-connect.

Two fingers dragging straight down should give two parallel lines. Actual result:

```
finger 1 ↓                    finger 2 ↓
  ════════════════════════════════════
  ╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱
```

a solid zigzag block spanning the canvas. This matters enormously for this age
group: 3–6 year olds rest a palm on the screen, poke with a second hand, and hand
the tablet to a sibling mid-drawing. Every one of those produces a ruined picture.

Fix: key the drawing state by `e.pointerId` (a `Map` of in-flight strokes), and call
`setPointerCapture`.

### 3. Rotating the tablet erases the drawing — CRITICAL — FIXED

`resize()` assigns `canvas.width`, which resets the bitmap to transparent, and
nothing restores the previous contents.

**Measured:** 5136 painted pixels before a viewport change → 0 after.

Fix: snapshot to an offscreen canvas before resizing and blit back after.

### 4. The selected colour is a lie — FIXED

`index.html` renders the red swatch, and `app.js:128` marks the first swatch `.on`,
but `DrawCanvas`'s constructor defaults `this.color = '#1d3557'` (navy). The child
sees red selected and draws in navy until they tap a colour.

**Measured:** UI shows `#e63946`; pixels drawn are RGB `[29, 52, 87]`.

### 5. Stegosaurus plates are double-size on every real device — FIXED

`drawArc()` (js/stencils.js:50) computes its radius from `ctx.canvas.width`, which is
the *device-pixel* backing store, while every other coordinate goes through `sc()`
in CSS pixels. On a `devicePixelRatio: 2` screen — i.e. essentially every phone and
tablet — the plates render at twice their intended size and swamp the animal's back.

This is invisible in a DPR-1 desktop browser, which is presumably how it survived.
Fix: use `this._w`/`this._h` (CSS pixels), consistent with the rest of the file.

### 6. A stroke does not resume when the finger re-enters the canvas — FIXED

`pointerleave` is wired to `_end` (canvas.js:326), and there's no pointer capture. A
child who drags past the edge of the canvas and back — constantly, at this age — has
their stroke silently terminated and must lift and re-tap to continue.

**Measured:** pixel count identical before and after the finger returns to the canvas
while still held down.

### 7. Sparkles never fade; they permanently stain the drawing — FIXED

`_updateSparkles()` draws particles directly onto the artwork canvas and never
erases them. The `life`/`globalAlpha` fade is written as though the layer were being
cleared each frame, but since it isn't, every frame composites another semi-opaque
star on top of the last — so particles get *denser*, then set permanently into the
picture.

**Measured:** 3743 painted pixels immediately after a stroke → 4190 after the
particles had supposedly expired.

Fix: render particles on a third, transient canvas above the artwork.

### 8. Everything is lost on close, and Clear is unrecoverable — FIXED

There is no persistence: reloading the page yields an empty canvas (measured: 2568
pixels → 0). `clear()` also resets `undoStack = []`, so it cannot be undone — and it's
gated behind `confirm('Clear your drawing?')`, a text dialog that a 3–6 year old
cannot read and will dismiss at random.

### 9. Glow is invisible and expensive — FIXED

`setGlow` applies `filter: drop-shadow(0 0 12px rgba(255,255,255,0.8))` to the whole
canvas element — a white glow on a cream (`#fff3e6`) background, so it barely shows,
while forcing a full-canvas GPU filter pass on every frame during drawing.

### 10. Service worker is network-first and caches failures — FIXED

`sw.js:30` tries the network first for every request, so an offline-first PWA is
online-dependent for launch speed. It also `cache.put`s any response it receives,
including 404s and 500s, which can poison the cache with error pages.

---

## Part 2 — Recommendations for ages 3–6

The app is currently built like a scaled-down adult drawing tool. The gap to a
preschool app is mostly about **removing** things.

### Read nothing, tap anything

Most 3–4 year olds cannot read at all, and 5–6 year olds read haltingly. Every text
label in the UI is invisible to the user:

- Mode labels: `Draw`, `Sparks`, `Glow`, `Smooth`, `Stamps`
- Brush and stamp sizes: `S` / `M` / `L`
- Mix bar: `OK`, `✕`
- The `confirm()` dialog on Clear

Replace all of them with pictures: three dots of increasing size instead of S/M/L, a
green check instead of "OK". The dialog needs to go entirely (see below).

### Cut the toolbar roughly in half

Measured on a 420×800 phone: **25 visible buttons**, and the toolbar takes **26% of
the screen** — rising to **~39%** when the stamp row opens (**47%** on a small 664 px-tall
phone). The canvas is the fun part and should dominate.

- Move the 6 stencil buttons into a full-screen picker opened by a single big dino
  button. Choosing what to draw is a distinct moment from drawing.
- Same for the 10 stamps + 3 stamp sizes.
- Target ~8–10 controls visible while drawing.

### Make the targets much bigger

**14 of the 25 visible buttons are under 44 px**, the smallest being 32 px. 44 px is the
*adult* minimum. Preschool fine-motor control wants **60–75 px targets with 12 px+
gaps**, and destructive controls placed far from everything else — right now Undo
(36 px) sits directly beside Clear (36 px).

### Delete colour mixing

The flow is: tap the palette icon → tap colour A → tap colour B → tap OK. Four steps
holding invisible intermediate state, with two abstract confirm buttons. That is
beyond this age group and will only generate frustration and accidental colour
changes. If you want to keep the idea, make it physical: drag one swatch onto
another and the blend just happens.

### Turn modes into brushes

The mode row mixes two different kinds of control that look nearly identical
(only the border colour differs): exclusive modes (Draw, Stamps) and independent
toggles (Sparks, Glow, Smooth). Even adults misread this.

Collapse it into a single row of **brushes** — a plain crayon, a sparkle brush, a
rainbow brush — where the choice is exclusive and visible. Toggles are an abstraction
that doesn't survive contact with a 4-year-old.

### Turn smoothing on permanently

Auto-smoothing directly compensates for the unsteady hands this age group has. It
shouldn't be an off-by-default toggle the child will never find — it should always be
on, and the toggle removed.

### Make Clear hard, and reversible

Replace the text `confirm()` with a **press-and-hold** (~2 s) on the trash button, with a
ring that visibly fills as they hold — young children rarely hold a deliberate press
that long by accident, and it needs no reading. Then keep the cleared bitmap so Undo
can bring it back.

### Auto-save every stroke

Persist the canvas to IndexedDB (or `localStorage` for a small PNG) after each stroke
and restore on launch. A lost drawing is a genuinely upsetting event at this age, and
right now it happens every time the app closes.

### Add sound

This is the single highest-value addition for the money. A soft tone that varies with
stroke speed, a chime when a stamp lands, a sparkle noise on the magic brush, applause
when a stencil is finished. Include a mute control for parents (behind a parent gate,
not in the child's reach).

### Add tap-to-fill

Tracing an outline demands motor precision a 3-year-old doesn't have. **Flood-filling a
region with one tap** is instantly rewarding and needs no precision at all. Combined
with the stencils, this turns the app into a colouring book, which is much better
matched to the low end of the age range.

### Redo the stencils

Rendered at real device sizes, the quality varies a lot:

- **Pterodactyl** — good, clearly reads as a flying reptile.
- **Brachiosaurus** — acceptable, though it reads more like a giraffe.
- **Stegosaurus** — recognisable, but ruined on retina by the plate bug (#5).
- **T-Rex** — an unrecognisable blob; no legs, arms, jaw, or teeth are discernible.
- **Triceratops** — an abstract self-intersecting knot. No horns, no frill, not
  identifiable as an animal at all.

Half the stencil set doesn't communicate what it is. The hand-tuned coordinate arrays
are also a poor authoring tool. I'd draw these as SVG paths in a vector editor and
render the path data, which lets a designer iterate without touching code.

Also: raise the stencil's contrast. `rgba(60,60,60,0.5)` at 2 px on cream is faint,
and a child tracing it needs a clear line to follow.

### Brighten the palette

The current palette is a tasteful, muted, designer-ish set. Children this age respond
to **saturated primaries**. Also drop the 4 px brush — it's thinner than a fingertip can
reliably control.

### Give them something to keep

A save/share button (behind a parent gate) so a drawing can go to a grandparent, plus
a small celebration when a stencil is traced, gives the activity a satisfying end
rather than trailing off.

---

## Part 3 — Is the code good?

**Short answer: no — but it's fixable, and some foundations are right.**

The app is roughly 1,000 lines with zero dependencies, and it's consistently
formatted and readably organised. But it has a high density of real, user-visible
correctness bugs, and its central data structure (undo) is both broken and
expensive.

### What's genuinely good

- **Zero dependencies, no build step, ~1,000 lines.** Excellent fit for a kids' PWA —
  it will load instantly and never break from a dependency update.
- **Two-canvas split** (stencil layer / drawing layer) is the correct architecture and
  keeps the guide from ever contaminating the artwork.
- **Pointer Events** rather than parallel mouse and touch code paths — the right API.
- **DPR-aware sizing**, capped at 2 to avoid pathological memory on 3x screens.
- **Consistent style** with clear section banners; easy to navigate.

### What's not

**Correctness.** Ten verified defects, five of which destroy the child's work. Undo —
the single most important feature in a drawing app for children, because they undo
constantly — is not merely buggy but wipes the canvas irrecoverably. The same
unawaited-image pattern is copy-pasted in three places, which suggests the pattern was
never tested rather than a one-off slip.

**Undo design.** Snapshotting via `toDataURL()` means a synchronous, main-thread PNG
encode of the full canvas at the end of *every* stroke — a visible hitch on the
low-end tablets this app will run on. Thirty base64 PNGs of a 1200×1800 backing store
is tens of megabytes of retained string data. A stroke list (a few hundred bytes per
stroke) is both faster and smaller by orders of magnitude, and it makes redo trivial.

**A mutable global as instance state.** `saveUndo` is declared at file scope
(canvas.js:330) and mutated from inside `DrawCanvas` methods. It should be
`this._pendingUndo`. As written, two `DrawCanvas` instances would silently corrupt each
other, and the declaration sits at the bottom of the file, below its uses.

**Duplication.** `_smoothStroke` and `_smoothStrokePreview` are ~25 lines of
character-for-character identical curve code. The 10 stamp emoji are declared twice —
in `index.html` attributes and again in a map inside `_placeStamp` — so adding a stamp
means editing two files in sync. All five stencil functions repeat the same
`s`/`ox`/`oy`/`sc` preamble.

**Shadowing.** `DrawCanvas.drawStencil()` (a method) and `drawStencil()` (a global in
stencils.js) share a name and are called from within each other's scope. It works, but
it's needlessly confusing.

**No tests, no linter, no CI.** For a codebase with this many latent async and
DPR-dependent bugs, even a handful of canvas smoke tests would have caught items 1, 3,
and 4 immediately. Notably, all three of those reproduce in a headless browser in
under a second.

### Suggested order of work

1. Fix undo (rewrite as a stroke list), multi-touch, resize-preservation, the default
   colour, and the DPR arc bug. — *the app is not usable by a child until these land*
2. Add auto-save and pointer capture.
3. Restructure the UI for the age group: fewer, bigger, wordless controls; stencils
   and stamps behind full-screen pickers.
4. Redo the T-Rex and Triceratops artwork; raise stencil contrast.
5. Add sound and tap-to-fill.
6. Add a smoke-test harness so items 1–4 don't regress.

Items 1 and 2 are perhaps a day's work and would remove every way the app currently
destroys a child's drawing. That's where I'd start.
