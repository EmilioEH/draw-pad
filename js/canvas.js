/* Default brush colour. Kept here so index.html and DrawCanvas cannot disagree. */
const DEFAULT_COLOR = '#ff3b30';

/* Byte order of a Uint32 view over ImageData, used by the flood fill. */
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;

/*
 * The materials. A stroke is a ribbon of varying width, and these are the
 * knobs that make one feel unlike another:
 *
 *   alpha  how much the ink builds up where strokes cross
 *   taper  how much speed thins the line — 0 is a constant-width pen
 *   ease   width inertia, so the line does not flicker between thick and thin
 *   grain  speckle scattered along the edges, which is what reads as wax
 *
 * The magic brush is a brush rather than a separate toggle, so what she is
 * holding is always one choice rather than a choice plus two switches.
 */
const BRUSHES = {
  pen:    { alpha: 1,    taper: 0.55, ease: 0.65, grain: 0,   glow: false, sparkle: false },
  marker: { alpha: 0.45, taper: 0.12, ease: 0.8,  grain: 0,   glow: false, sparkle: false },
  crayon: { alpha: 0.92, taper: 0.35, ease: 0.55, grain: 1.6, glow: false, sparkle: false },
  magic:  { alpha: 1,    taper: 0.5,  ease: 0.65, grain: 0,   glow: true,  sparkle: true },
};
const DEFAULT_BRUSH = 'pen';

/* Deterministic noise. Crayon grain has to land in the same places every time
   the picture is redrawn, or an undo would reshuffle it. */
function hash01(n) {
  let t = (n + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function hslToHex(h, s, l) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = n => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * v).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/*
 * The drawing is stored as a list of operations, not as pixels.
 *
 * That makes undo exact and instant, lets the picture survive a resize or a
 * rotate (we simply re-render into the new size), and makes autosave a small
 * bit of JSON instead of a multi-megabyte PNG.
 *
 * Ops are recorded in a fixed "logical" coordinate space (this.ref). Screen
 * space is mapped to it by a uniform scale plus centring offset, so the picture
 * keeps its proportions on any canvas size.
 */
class DrawCanvas {
  constructor(canvasEl, stencilEl, fxEl) {
    this.canvas = canvasEl;
    this.stencilEl = stencilEl;
    this.fxEl = fxEl;

    this.color = DEFAULT_COLOR;
    this.size = 10;
    this.stencilId = null;
    this.mode = 'draw';
    this.brush = DEFAULT_BRUSH;
    this.stampEmoji = null;
    this.stampSize = 48;
    this.sparkleOn = false;
    this.glowOn = false;

    this.ops = [];
    this.redoStack = [];
    this.ref = null;

    this._live = new Map();   // pointerId -> op being drawn right now
    this._hue = 0;            // advances so each rainbow stroke starts somewhere new
    this._celebrated = null;
    this.onCelebrate = null;
    this._sparkles = [];
    this._sparkleRaf = null;
    this._compositeRaf = null;
    this._dpr = 1;
    this._w = 0;
    this._h = 0;
    this.onChange = null;     // fired whenever the document changes (autosave)
  }

  /* ─── SIZING ─── */

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // A hidden or not-yet-laid-out element would blow the canvases away.
    if (!rect.width || !rect.height) return;

    // Mobile browsers fire resize for things that are not resizes — the URL
    // bar sliding, the keyboard, a scroll. Re-rendering the whole picture for
    // each of those is a visible freeze, so ignore the ones that change nothing.
    if (this.ctx && rect.width === this._w && rect.height === this._h && dpr === this._dpr) return;

    this._dpr = dpr;
    this._w = rect.width;
    this._h = rect.height;

    for (const el of [this.canvas, this.stencilEl, this.fxEl]) {
      el.width = Math.round(rect.width * dpr);
      el.height = Math.round(rect.height * dpr);
      el.style.width = rect.width + 'px';
      el.style.height = rect.height + 'px';
    }

    if (!this.ctx) {
      // desynchronized lets the browser skip a compositing step for the layer
      // being drawn on, which measurably shortens the gap between the finger
      // and the ink. It is a hint; browsers that ignore it lose nothing.
      this.ctx = this.canvas.getContext('2d', { desynchronized: true });
      this.sCtx = this.stencilEl.getContext('2d');
      this.fxCtx = this.fxEl.getContext('2d', { desynchronized: true });
      this._base = document.createElement('canvas');
      this._baseCtx = this._base.getContext('2d');
      this._liveLayer = document.createElement('canvas');
      this._liveCtx = this._liveLayer.getContext('2d');
    }
    this._base.width = this.canvas.width;
    this._base.height = this.canvas.height;
    this._liveLayer.width = this.canvas.width;
    this._liveLayer.height = this.canvas.height;
    this._fillCache = new WeakMap();   // worked out for the old size

    // An empty document adopts the current size, so fresh drawings are 1:1.
    if (!this.ref || this.ops.length === 0) this.ref = { w: rect.width, h: rect.height };

    this.drawStencil();
    this._rebuildBase();
    this._refreshLiveLayer();
    this._composite();
  }

  /* Uniform scale + centring offset from logical space to screen space. */
  _t() {
    const s = Math.min(this._w / this.ref.w, this._h / this.ref.h);
    return { s, ox: (this._w - this.ref.w * s) / 2, oy: (this._h - this.ref.h * s) / 2 };
  }

  _toLogical(x, y) {
    const t = this._t();
    return { x: (x - t.ox) / t.s, y: (y - t.oy) / t.s };
  }

  /*
   * Puts a context into logical space, optionally at a fraction of the device
   * resolution. Everything that has to line up with the artwork — the outline,
   * the fill's scratch copy of it — goes through here, so a resize or a rotate
   * moves the outline and the drawing together instead of sliding them apart.
   */
  _useLogical(ctx, scale = 1) {
    const t = this._t();
    const k = this._dpr * scale;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.translate(t.ox, t.oy);
    ctx.scale(t.s, t.s);
  }

  /* ─── SETTINGS ─── */

  setColor(c) { this.color = c; }
  setSize(s) { this.size = s; }
  setMode(m) { this.mode = m; }
  setStamp(emoji, size) { this.stampEmoji = emoji; this.stampSize = size || 48; this.mode = 'stamp'; }
  setGlow(on) { this.glowOn = on; }
  setSparkle(on) {
    this.sparkleOn = on;
    if (!on) this._sparkles = [];
  }

  setBrush(name) {
    if (!BRUSHES[name]) return;
    this.brush = name;
    const b = BRUSHES[name];
    this.setGlow(b.glow);
    this.setSparkle(b.sparkle);
  }

  setStencil(id) {
    this.stencilId = id;
    this._celebrated = null;   // a new outline is a new thing to finish
    this.drawStencil();
  }

  drawStencil() {
    this.sCtx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    this.sCtx.clearRect(0, 0, this._w, this._h);
    if (!this.stencilId) return;
    // In logical space, not screen space: the outline has to stay welded to
    // the lines drawn on it when the tablet is turned sideways.
    this._useLogical(this.sCtx);
    drawStencil(this.sCtx, this.stencilId, this.ref.w, this.ref.h);
  }

  /* ─── RENDERING ─── */

  /* Paints one op. Sets its own transform so it can target either canvas. */
  _paint(ctx, op) {
    if (op.type === 'fill') { this._paintFill(ctx, op); return; }

    this._useLogical(ctx);
    ctx.save();

    if (op.type === 'stamp') {
      ctx.font = `${op.size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(op.emoji, op.x, op.y);
      ctx.restore();
      return;
    }

    this._paintStroke(ctx, op);
    ctx.restore();
  }

  /*
   * A stroke is a ribbon, not a constant-width line. Drawing it as one filled
   * compound path — a quad per segment plus a disc at each joint — rather than
   * as N separate fills matters for the translucent brushes: overlapping fills
   * would darken every joint, while one fill of the whole shape does not.
   *
   * The ends taper here rather than being baked into the recorded widths, so
   * the tail keeps following the finger as the stroke grows and a finished
   * stroke looks exactly like the one that was under the finger.
   */
  _paintStroke(ctx, op) {
    const pts = op.points;
    if (!pts.length) return;

    const b = BRUSHES[op.brush] || BRUSHES.pen;
    const n = pts.length;

    ctx.fillStyle = op.color;
    ctx.globalAlpha = b.alpha;
    if (op.glow) {
      // Glow the stroke's own colour, so it reads against a light background.
      ctx.shadowColor = op.rainbow ? '#ff00cc' : op.color;
      ctx.shadowBlur = Math.max(8, op.size * 1.5);
    }

    if (n === 1) {
      // A single tap should still leave a dot.
      if (op.rainbow) ctx.fillStyle = `hsl(${op.hue || 0} 90% 55%)`;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, Math.max(1, this._widthAt(op, 0) / 2), 0, Math.PI * 2);
      ctx.fill();
      this._paintGrain(ctx, op, b, 0);
      ctx.globalAlpha = 1;
      return;
    }

    if (op.rainbow) {
      // Segment by segment, so the hue can travel along the stroke. Rainbow is
      // always opaque, so the overlap at the joints costs nothing.
      for (let i = 0; i < n - 1; i++) {
        ctx.fillStyle = `hsl(${((op.hue || 0) + i * 9) % 360} 90% 55%)`;
        ctx.fill(this._ribbon(op, i, i + 1, i === 0));
      }
    } else {
      ctx.fill(this._ribbon(op, 0, n - 1, true));
    }

    this._paintGrain(ctx, op, b, 0);
    ctx.globalAlpha = 1;
  }

  /*
   * The width at one point. Only the start of the stroke tapers here — the
   * lift-off taper is written into the recorded widths when the finger comes
   * up, because a taper that depends on where the stroke currently ends would
   * change shape behind the finger and could not be drawn incrementally.
   */
  _widthAt(op, i) {
    const w = op.points[i].w || op.size;
    const k = op.points.length < 3 ? 1 : 0.4 + 0.6 * Math.min(1, i / 6);
    return Math.max(0.6, w * k);
  }

  /* The ribbon for segments [from, to] — a quad per segment plus a disc at
     each joint, all in one path so a translucent fill does not stack up. */
  _ribbon(op, from, to, withStartCap) {
    const pts = op.points;
    const path = new Path2D();
    if (withStartCap) {
      const r = this._widthAt(op, from) / 2;
      path.moveTo(pts[from].x + r, pts[from].y);
      path.arc(pts[from].x, pts[from].y, r, 0, Math.PI * 2, true);
    }
    for (let i = from; i < to; i++) {
      const p = pts[i], q = pts[i + 1];
      const dx = q.x - p.x, dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const r1 = this._widthAt(op, i) / 2, r2 = this._widthAt(op, i + 1) / 2;
      path.moveTo(p.x + nx * r1, p.y + ny * r1);
      path.lineTo(q.x + nx * r2, q.y + ny * r2);
      path.lineTo(q.x - nx * r2, q.y - ny * r2);
      path.lineTo(p.x - nx * r1, p.y - ny * r1);
      path.closePath();
      // Wound the same way round as the quad above. The two shapes overlap, and
      // under nonzero winding an opposite winding subtracts — which punched a
      // row of holes along every line.
      path.moveTo(q.x + r2, q.y);
      path.arc(q.x, q.y, r2, 0, Math.PI * 2, true);
    }
    return path;
  }

  /* Wax speckle along the stroke. Seeded from the op so it never reshuffles. */
  _paintGrain(ctx, op, b, from) {
    if (!b.grain) return;
    const pts = op.points;
    const seed = op.seed || 1;
    ctx.globalAlpha = b.alpha * 0.35;
    const path = new Path2D();
    for (let i = from; i < pts.length; i++) {
      const w = pts[i].w || op.size;
      const flecks = Math.max(1, Math.round(b.grain * Math.sqrt(w) * 0.8));
      for (let k = 0; k < flecks; k++) {
        const h = seed * 7919 + i * 31 + k * 7;
        const a = hash01(h) * Math.PI * 2;
        // Hugging the edge of the ribbon, not thrown clear of it: past w/2 the
        // flecks stop reading as texture and start looking like sprinkles.
        const rad = (0.18 + hash01(h + 401) * 0.34) * w;
        const dot = 0.4 + hash01(h + 977) * (w * 0.075);
        const x = pts[i].x + Math.cos(a) * rad;
        const y = pts[i].y + Math.sin(a) * rad;
        path.moveTo(x + dot, y);
        path.arc(x, y, dot, 0, Math.PI * 2);
      }
    }
    ctx.fill(path);
  }

  /* ─── FLOOD FILL ─── */
  /*
   * Tapping to fill a region is far easier than tracing for a small child, so
   * it has to respect two kinds of boundary: the outline, which lives on its
   * own layer, and the child's own lines. We composite art + outline into a
   * scratch canvas, flood there, and paint the resulting mask into the artwork.
   *
   * Two things matter for how this feels:
   *
   *  - It floods everything matching the colour under the finger, not only
   *    blank paper, so tapping a red patch with blue on turns it blue. Filling
   *    only empty space meant most repeat taps did nothing at all.
   *  - It works at CSS resolution rather than device resolution, a quarter of
   *    the pixels on a retina screen. A fill used to block the page for a third
   *    of a second, which is long enough for a small child to tap again.
   *
   * The op records which outline was showing, so replaying history is exact.
   * Returns true if it actually changed anything.
   */
  _paintFill(ctx, op) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    if (!W || !H) return false;

    const step = Math.max(1, Math.round(this._dpr));
    const w = Math.max(1, Math.round(W / step));
    const h = Math.max(1, Math.round(H / step));

    /*
     * Undo and redo replay the whole history, and re-flooding every earlier
     * fill made each press of the undo button slower than the last. History is
     * a stack, so nothing before a surviving op can ever change: once a fill
     * has been worked out it can simply be stamped back down. Resizing changes
     * the working resolution and throws the lot away.
     */
    const cached = this._fillCache && this._fillCache.get(op);
    if (cached && cached.width === w && cached.height === h) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cached, 0, 0, w, h, 0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
      return true;
    }

    if (!this._scratch) {
      this._scratch = document.createElement('canvas');
      this._scratchCtx = this._scratch.getContext('2d', { willReadFrequently: true });
      this._out = document.createElement('canvas');
      this._outCtx = this._out.getContext('2d');
    }
    for (const c of [this._scratch, this._out]) {
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    }

    const t = this._t();
    const sx = Math.round((op.x * t.s + t.ox) * this._dpr / step);
    const sy = Math.round((op.y * t.s + t.oy) * this._dpr / step);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return false;

    const sctx = this._scratchCtx;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, w, h);
    sctx.drawImage(ctx.canvas, 0, 0, w, h);

    const ALPHA = 40;   // anything fainter than this counts as empty space
    // Read the artwork on its own first: it tells us later whether the finger
    // landed on the child's paint or on the printed outline.
    const artAlpha = sctx.getImageData(sx, sy, 1, 1).data[3];

    if (op.stencil) {
      this._useLogical(sctx, 1 / step);
      drawStencil(sctx, op.stencil, this.ref.w, this.ref.h);
      sctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    const d = sctx.getImageData(0, 0, w, h).data;
    const si = (sy * w + sx) * 4;
    const tr = d[si], tg = d[si + 1], tb = d[si + 2], ta = d[si + 3];

    // The outline is a guide, not paint: tapping it should do nothing rather
    // than recolour it.
    if (ta >= ALPHA && artAlpha < ALPHA) return false;

    const [r, g, b] = [1, 3, 5].map(i => parseInt(op.color.slice(i, i + 2), 16));
    if (![r, g, b].every(v => v >= 0 && v <= 255)) return false;
    // Already this colour — filling it again would only cost an undo press.
    if (ta >= ALPHA && Math.abs(r - tr) <= 8 && Math.abs(g - tg) <= 8 && Math.abs(b - tb) <= 8) return false;

    // One linear pass marks every pixel the flood is allowed to cross, so the
    // flood itself only ever reads a single byte per pixel.
    const TOL = 40;
    const open = new Uint8Array(w * h);
    const blank = ta < ALPHA;
    for (let i = 0, p = 0; i < open.length; i++, p += 4) {
      const a = d[p + 3];
      if (blank) { if (a < ALPHA) open[i] = 1; continue; }
      if (a < ALPHA) continue;
      if (Math.abs(d[p] - tr) <= TOL && Math.abs(d[p + 1] - tg) <= TOL
        && Math.abs(d[p + 2] - tb) <= TOL) open[i] = 1;
    }

    // Scanline flood: push spans rather than pixels, which keeps the stack
    // small. The mask doubles as the visited set.
    const mask = new Uint8Array(w * h);
    const stack = [sx, sx, sy];
    let filled = 0;

    while (stack.length) {
      const y = stack.pop();
      const x2 = stack.pop();
      const x1 = stack.pop();
      const row = y * w;
      let left = x1;
      while (left > 0 && !mask[row + left - 1] && open[row + left - 1]) left--;
      let right = x2;
      while (right < w - 1 && !mask[row + right + 1] && open[row + right + 1]) right++;

      for (let x = left; x <= right; x++) {
        if (!mask[row + x]) { mask[row + x] = 1; filled++; }
      }
      for (const ny of [y - 1, y + 1]) {
        if (ny < 0 || ny >= h) continue;
        const nrow = ny * w;
        let x = left;
        while (x <= right) {
          while (x <= right && (mask[nrow + x] || !open[nrow + x])) x++;
          if (x > right) break;
          const start = x;
          while (x <= right && !mask[nrow + x] && open[nrow + x]) x++;
          stack.push(start, x - 1, ny);
        }
      }
    }
    if (!filled) return false;

    // Paint the mask as a solid colour, then composite it normally so it
    // blends with whatever is already on the canvas.
    if (!this._outImg || this._outImg.width !== w || this._outImg.height !== h) {
      this._outImg = this._outCtx.createImageData(w, h);
      this._outPx = new Uint32Array(this._outImg.data.buffer);
    }
    const px = this._outPx;
    px.fill(0);
    const packed = LITTLE_ENDIAN
      ? (255 << 24 | b << 16 | g << 8 | r) >>> 0
      : (r << 24 | g << 16 | b << 8 | 255) >>> 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) px[i] = packed;

    this._outCtx.setTransform(1, 0, 0, 1, 0, 0);
    this._outCtx.putImageData(this._outImg, 0, 0);

    // Keep it for the replays. A WeakMap rather than a field on the op, so the
    // bitmap is never walked by the autosave and goes away with the op itself.
    if (!this._fillCache) this._fillCache = new WeakMap();
    const keep = document.createElement('canvas');
    keep.width = w;
    keep.height = h;
    keep.getContext('2d').drawImage(this._out, 0, 0);
    this._fillCache.set(op, keep);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Nearest-neighbour: a blurred edge would bleed over the lines the fill
    // just stopped at.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this._out, 0, 0, w, h, 0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    return true;
  }

  /*
   * Roughly what fraction of the stencil outline has been drawn over. Done at
   * low resolution because it runs after every stroke and only needs to be
   * good enough to decide whether to throw confetti.
   */
  coverage() {
    if (!this.stencilId || !this._w) return 0;
    const CW = 128;
    const CH = Math.max(1, Math.round(CW * this._h / this._w));
    if (!this._cov) {
      this._cov = document.createElement('canvas');
      this._covCtx = this._cov.getContext('2d', { willReadFrequently: true });
    }
    const c = this._cov;
    const ctx = this._covCtx;
    c.width = CW;
    c.height = CH;

    ctx.clearRect(0, 0, CW, CH);
    ctx.drawImage(this.stencilEl, 0, 0, CW, CH);
    const stencil = ctx.getImageData(0, 0, CW, CH).data;

    ctx.clearRect(0, 0, CW, CH);
    ctx.drawImage(this._base, 0, 0, CW, CH);
    const art = ctx.getImageData(0, 0, CW, CH).data;

    /*
     * Allow a little slop: a child tracing near the line still counts. Grown
     * the painted pixels outwards by R in a horizontal pass and then a vertical
     * one — the same result as testing a square around every pixel, at a
     * fraction of the reads, which matters because this runs after strokes.
     */
    const R = 2;
    const N = CW * CH;
    const rowGrown = new Uint8Array(N);
    for (let y = 0; y < CH; y++) {
      let run = 0;
      for (let x = 0; x < CW; x++) {
        const i = y * CW + x;
        if (art[i * 4 + 3] > 30) run = R + 1;
        if (run > 0) { rowGrown[i] = 1; run--; }
      }
      run = 0;
      for (let x = CW - 1; x >= 0; x--) {
        const i = y * CW + x;
        if (art[i * 4 + 3] > 30) run = R + 1;
        if (run > 0) { rowGrown[i] = 1; run--; }
      }
    }
    const grown = new Uint8Array(N);
    for (let x = 0; x < CW; x++) {
      let run = 0;
      for (let y = 0; y < CH; y++) {
        const i = y * CW + x;
        if (rowGrown[i]) run = R + 1;
        if (run > 0) { grown[i] = 1; run--; }
      }
      run = 0;
      for (let y = CH - 1; y >= 0; y--) {
        const i = y * CW + x;
        if (rowGrown[i]) run = R + 1;
        if (run > 0) { grown[i] = 1; run--; }
      }
    }

    let total = 0;
    let hit = 0;
    for (let i = 0; i < N; i++) {
      if (stencil[i * 4 + 3] < 30) continue;
      total++;
      if (grown[i]) hit++;
    }
    return total ? hit / total : 0;
  }

  /* Re-renders every committed op into the offscreen base canvas. */
  _rebuildBase() {
    const ctx = this._baseCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this._base.width, this._base.height);
    for (const op of this.ops) {
      if (op.type === 'clear') {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this._base.width, this._base.height);
      } else {
        this._paint(ctx, op);
      }
    }
  }

  /*
   * Base + whatever is under a finger.
   *
   * The stroke being drawn lives on its own layer, and only the newly arrived
   * segments are added to it — repainting the whole stroke every frame cost
   * 40ms once a scribble passed a thousand points, which is exactly the lag
   * this brush work was supposed to remove. The layer is painted opaque and
   * composited at the brush's alpha, so a translucent marker builds up where
   * it crosses another stroke but not along its own length.
   */
  _composite() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this._base, 0, 0);

    if (!this._live.size || !this._liveLayer) return;
    const first = this._live.values().next().value;
    const b = BRUSHES[first.brush] || BRUSHES.pen;
    ctx.globalAlpha = b.alpha;
    ctx.drawImage(this._liveLayer, 0, 0);
    ctx.globalAlpha = 1;
  }

  /* Adds the segments that have arrived since last time to the live layer. */
  _appendLive(op) {
    const ctx = this._liveCtx;
    if (!ctx) return;
    const n = op.points.length;
    const from = op._drawn || 0;
    if (n - 1 <= from && from !== 0) return;

    const b = BRUSHES[op.brush] || BRUSHES.pen;
    this._useLogical(ctx);
    ctx.save();
    ctx.fillStyle = op.color;
    if (op.glow) {
      ctx.shadowColor = op.rainbow ? '#ff00cc' : op.color;
      ctx.shadowBlur = Math.max(8, op.size * 1.5);
    }

    if (n === 1) {
      ctx.beginPath();
      ctx.arc(op.points[0].x, op.points[0].y, Math.max(1, this._widthAt(op, 0) / 2), 0, Math.PI * 2);
      ctx.fill();
    } else if (op.rainbow) {
      for (let i = from; i < n - 1; i++) {
        ctx.fillStyle = `hsl(${((op.hue || 0) + i * 9) % 360} 90% 55%)`;
        ctx.fill(this._ribbon(op, i, i + 1, i === 0));
      }
    } else {
      ctx.fill(this._ribbon(op, from, n - 1, from === 0));
    }
    this._paintGrain(ctx, op, b, from);
    ctx.restore();
    op._drawn = n - 1;
  }

  /* Wipes the live layer and puts back whatever is still under a finger. */
  _refreshLiveLayer() {
    if (!this._liveCtx) return;
    this._liveCtx.setTransform(1, 0, 0, 1, 0, 0);
    this._liveCtx.clearRect(0, 0, this._liveLayer.width, this._liveLayer.height);
    for (const op of this._live.values()) {
      op._drawn = 0;
      this._appendLive(op);
    }
  }

  _scheduleComposite() {
    if (this._compositeRaf) return;
    this._compositeRaf = requestAnimationFrame(() => {
      this._compositeRaf = null;
      this._composite();
    });
  }

  /* ─── HISTORY ─── */

  _commit(op) {
    // A fill that changes no pixels is not history: recording it would give the
    // undo button a press that visibly does nothing.
    if (op.type === 'fill' && !this._paintFill(this._baseCtx, op)) return false;

    this.ops.push(op);
    this.redoStack.length = 0;
    if (op.type === 'clear') this._rebuildBase();
    else if (op.type !== 'fill') this._paint(this._baseCtx, op);
    this._composite();
    this._changed();
    this._maybeCelebrate();
    return true;
  }

  /*
   * Fires once per stencil, when enough of the outline has been traced.
   * Measuring coverage means reading two canvases back, so it is throttled: a
   * child scribbling fast commits strokes far quicker than the celebration
   * needs checking, and the readbacks showed up as a hitch at every stroke end.
   */
  _maybeCelebrate() {
    if (!this.stencilId || this._celebrated === this.stencilId) return;

    const now = performance.now();
    if (now - (this._lastCoverage || 0) < 250) {
      clearTimeout(this._coverageTimer);
      this._coverageTimer = setTimeout(() => this._maybeCelebrate(), 160);
      return;
    }
    this._lastCoverage = now;

    if (this.coverage() < 0.55) return;
    this._celebrated = this.stencilId;
    this.confetti();
    if (this.onCelebrate) this.onCelebrate();
  }

  undo() {
    if (!this.ops.length) return false;
    this.redoStack.push(this.ops.pop());
    this._rebuildBase();
    this._composite();
    this._changed();
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.ops.push(this.redoStack.pop());
    this._rebuildBase();
    this._composite();
    this._changed();
    return true;
  }

  /* Clear is an op, so it can be undone like anything else. */
  clear() {
    if (!this.ops.length) return;
    this._commit({ type: 'clear' });
  }

  isEmpty() {
    return !this.ops.some(op => op.type !== 'clear');
  }

  _changed() {
    if (this.onChange) this.onChange();
  }

  /* ─── PERSISTENCE ─── */

  /*
   * Points go out as a flat [x, y, x, y, …] list rather than {x, y} objects:
   * the same drawing at about half the characters. A busy page was pushing
   * 200 KB per save, and once localStorage refuses the write the child's work
   * quietly stops being kept.
   */
  getDoc() {
    const r = n => Math.round(n * 10) / 10;
    return {
      v: 3,
      ref: this.ref,
      ops: this.ops.map(op => {
        if (op.type !== 'stroke') return op;
        const { points, _t, ...rest } = op;
        const pts = new Array(points.length * 3);
        for (let i = 0; i < points.length; i++) {
          pts[i * 3] = r(points[i].x);
          pts[i * 3 + 1] = r(points[i].y);
          pts[i * 3 + 2] = Math.round(points[i].w || op.size);
        }
        return { ...rest, pts };
      }),
    };
  }

  /* Flattened picture (paper + stencil + artwork) for saving or sharing. */
  toBlob() {
    const out = document.createElement('canvas');
    out.width = this.canvas.width;
    out.height = this.canvas.height;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff8ef';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(this.stencilEl, 0, 0);
    ctx.drawImage(this._base, 0, 0);
    return new Promise(res => out.toBlob(res, 'image/png'));
  }

  /* Reads both the flat format above and the older {x, y} one, and drops any
     op it cannot make sense of rather than throwing the drawing away. */
  loadDoc(doc) {
    if (!doc || !Array.isArray(doc.ops)) return false;

    const ops = [];
    for (const op of doc.ops) {
      if (!op || typeof op !== 'object') continue;
      if (op.type !== 'stroke') { ops.push(op); continue; }

      const { pts, ...rest } = op;
      let points = op.points;
      if (Array.isArray(pts)) {
        // v3 stores x, y and width; v2 stored x and y only.
        const stride = doc.v >= 3 ? 3 : 2;
        points = [];
        for (let i = 0; i + stride - 1 < pts.length; i += stride) {
          points.push({ x: pts[i], y: pts[i + 1], w: stride === 3 ? pts[i + 2] : op.size });
        }
      }
      if (!Array.isArray(points) || !points.length) continue;
      if (!points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) continue;
      // Drawings made before brushes existed were all pen.
      ops.push({ brush: DEFAULT_BRUSH, seed: 1, ...rest, points });
    }

    this.ops = ops;
    this.redoStack = [];
    if (doc.ref && doc.ref.w > 0 && doc.ref.h > 0) this.ref = doc.ref;
    this._rebuildBase();
    this._composite();
    return true;
  }

  /* ─── SPARKLES (transient, on their own layer) ─── */

  _addSparkles(x, y) {
    if (!this.sparkleOn) return;
    // Decoration must never be the reason the line lags behind the finger:
    // sustained scribbling produced a couple of hundred live particles, each
    // an eight-point star redrawn every frame.
    if (this._sparkles.length >= 90) return;
    for (let i = 0; i < 3; i++) {
      this._sparkles.push({
        x: x + (Math.random() - 0.5) * this.size * 2,
        y: y + (Math.random() - 0.5) * this.size * 2,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2 - 1,
        life: 1,
        size: Math.random() * 4 + 2,
        color: this.color,
      });
    }
    if (!this._sparkleRaf) this._sparkleLoop();
  }

  _sparkleLoop() {
    const ctx = this.fxCtx;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.clearRect(0, 0, this._w, this._h);

    for (let i = this._sparkles.length - 1; i >= 0; i--) {
      const s = this._sparkles[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.05;
      s.life -= s.decay || 0.03;
      if (s.life <= 0) { this._sparkles.splice(i, 1); continue; }

      ctx.globalAlpha = s.life;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      const spikes = 4;
      const outer = s.size * s.life;
      const inner = outer * 0.4;
      for (let j = 0; j < spikes * 2; j++) {
        const r = j % 2 === 0 ? outer : inner;
        const a = (j * Math.PI) / spikes - Math.PI / 2;
        const px = s.x + Math.cos(a) * r;
        const py = s.y + Math.sin(a) * r;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    this._sparkleRaf = this._sparkles.length
      ? requestAnimationFrame(() => this._sparkleLoop())
      : null;
  }

  /* Confetti burst for finishing a stencil. Shares the sparkle layer. */
  confetti() {
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 6;
      this._sparkles.push({
        x: this._w / 2,
        y: this._h * 0.45,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 2,
        life: 1,
        decay: 0.012,
        size: 3 + Math.random() * 5,
        color: hslToHex(Math.floor(Math.random() * 360), 90, 55),
      });
    }
    if (!this._sparkleRaf) this._sparkleLoop();
  }

  /* ─── INPUT ─── */

  _pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /*
   * How wide the line is right here. Speed thins it, which is most of what
   * makes a drawn line look drawn; a stylus that reports pressure overrides
   * that with the real thing. The result eases towards its target so an
   * unsteady hand does not make the line flicker.
   */
  _widthFor(op, lp, e) {
    const b = BRUSHES[op.brush] || BRUSHES.pen;
    const prev = op.points[op.points.length - 1];
    let target = op.size;

    if (b.taper && prev) {
      const dt = Math.max(4, (e.timeStamp || 0) - (op._t || 0));
      const speed = Math.hypot(lp.x - prev.x, lp.y - prev.y) / dt;   // px per ms
      target = op.size * (1 - b.taper * Math.min(1, speed / 1.5));
    }
    // Touch reports a flat 0.5, which would just scale everything down; only a
    // real stylus reading is worth listening to.
    if (e.pointerType === 'pen' && e.pressure > 0) {
      target *= 0.45 + 0.85 * e.pressure;
    }

    const last = prev ? prev.w : target;
    return Math.max(0.8, last * b.ease + target * (1 - b.ease));
  }

  /* Records one sample. Returns false if it was too close to the last one. */
  _addPoint(op, p, e) {
    const lp = this._toLogical(p.x, p.y);
    const prev = op.points[op.points.length - 1];
    if (prev && Math.hypot(lp.x - prev.x, lp.y - prev.y) < 0.7) return false;
    lp.w = this._widthFor(op, lp, e);
    op._t = e.timeStamp || 0;
    op.points.push(lp);
    return true;
  }

  _start(e) {
    e.preventDefault();
    const p = this._pos(e);
    const lp = this._toLogical(p.x, p.y);

    if (this.mode === 'stamp') {
      if (!this.stampEmoji) return;
      this._commit({ type: 'stamp', emoji: this.stampEmoji, size: this.stampSize, x: lp.x, y: lp.y });
      return;
    }

    if (this.mode === 'fill') {
      const color = this.color === 'rainbow'
        ? hslToHex((this._hue += 47) % 360, 90, 55)
        : this.color;
      this._commit({ type: 'fill', x: lp.x, y: lp.y, color, stencil: this.stencilId });
      return;
    }

    // Pointer capture keeps the stroke alive if the finger strays off the canvas.
    if (this.canvas.setPointerCapture) {
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* not capturable */ }
    }

    // Each pointer gets its own stroke, so two fingers draw two lines.
    const rainbow = this.color === 'rainbow';
    const op = {
      type: 'stroke',
      brush: this.brush,
      color: rainbow ? '#ff3b30' : this.color,
      rainbow,
      hue: rainbow ? (this._hue += 47) % 360 : undefined,
      size: this.size,
      glow: this.glowOn,
      seed: (this._seed = (this._seed || 0) + 1),
      points: [],
      _t: e.timeStamp || 0,
    };
    this._addPoint(op, p, e);
    this._live.set(e.pointerId, op);
    this._appendLive(op);
    this._addSparkles(p.x, p.y);
    this._scheduleComposite();
  }

  _move(e) {
    const op = this._live.get(e.pointerId);
    if (!op) return;
    e.preventDefault();

    /*
     * A 120Hz screen delivers several real samples per pointermove and hands
     * the rest over only if asked. Reading the last one and dropping the others
     * is what makes a quick line look faceted.
     */
    const batch = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    let added = false;
    for (const s of (batch && batch.length ? batch : [e])) {
      const p = this._pos(s);
      if (this._addPoint(op, p, s)) {
        this._addSparkles(p.x, p.y);
        added = true;
      }
    }
    if (added) {
      this._appendLive(op);
      this._scheduleComposite();
    }
  }

  /*
   * The lift. A real line thins where the hand comes off it, and this is the
   * one moment we know where the stroke actually ends — while it is being
   * drawn, the end keeps moving.
   */
  _taperTail(op) {
    const n = op.points.length;
    if (n < 4) return;
    const k = Math.min(6, Math.floor(n / 3));
    for (let j = 0; j < k; j++) {
      const p = op.points[n - 1 - j];
      p.w = Math.max(0.6, (p.w || op.size) * (0.35 + 0.65 * (j / k)));
    }
  }

  _end(e) {
    const op = this._live.get(e.pointerId);
    if (!op) return;
    e.preventDefault();
    this._live.delete(e.pointerId);
    if (this.canvas.releasePointerCapture) {
      try { this.canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
    }
    this._taperTail(op);
    this._refreshLiveLayer();   // this stroke moves to the base; others stay
    this._commit(op);
  }

  bind() {
    const el = this.canvas;
    el.addEventListener('pointerdown', e => this._start(e));
    el.addEventListener('pointermove', e => this._move(e));
    el.addEventListener('pointerup', e => this._end(e));
    el.addEventListener('pointercancel', e => this._end(e));
    // No pointerleave handler: capture keeps the stroke going past the edge.
  }
}
