/* Default brush colour. Kept here so index.html and DrawCanvas cannot disagree. */
const DEFAULT_COLOR = '#e63946';

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
    this.stampEmoji = null;
    this.stampSize = 48;
    this.sparkleOn = false;
    this.glowOn = false;

    this.ops = [];
    this.redoStack = [];
    this.ref = null;

    this._live = new Map();   // pointerId -> op being drawn right now
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
      this.ctx = this.canvas.getContext('2d');
      this.sCtx = this.stencilEl.getContext('2d');
      this.fxCtx = this.fxEl.getContext('2d');
      this._base = document.createElement('canvas');
      this._baseCtx = this._base.getContext('2d');
    }
    this._base.width = this.canvas.width;
    this._base.height = this.canvas.height;

    // An empty document adopts the current size, so fresh drawings are 1:1.
    if (!this.ref || this.ops.length === 0) this.ref = { w: rect.width, h: rect.height };

    this.drawStencil();
    this._rebuildBase();
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

  setStencil(id) {
    this.stencilId = id;
    this.drawStencil();
  }

  drawStencil() {
    this.sCtx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    this.sCtx.clearRect(0, 0, this._w, this._h);
    if (this.stencilId) drawStencil(this.sCtx, this.stencilId, this._w, this._h);
  }

  /* ─── RENDERING ─── */

  /* Paints one op. Sets its own transform so it can target either canvas. */
  _paint(ctx, op) {
    const t = this._t();
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.translate(t.ox, t.oy);
    ctx.scale(t.s, t.s);
    ctx.save();

    if (op.type === 'stamp') {
      ctx.font = `${op.size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(op.emoji, op.x, op.y);
      ctx.restore();
      return;
    }

    const pts = op.points;
    if (!pts.length) { ctx.restore(); return; }

    ctx.lineWidth = op.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = op.color;
    ctx.fillStyle = op.color;
    if (op.glow) {
      // Glow the stroke's own colour, so it reads against a light background.
      ctx.shadowColor = op.color;
      ctx.shadowBlur = Math.max(8, op.size * 1.5);
    }

    if (pts.length === 1) {
      // A single tap should still leave a dot.
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, op.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // Smoothing is always on: it compensates for unsteady hands, which is the
    // normal case for this app's audience.
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) {
      ctx.lineTo(pts[1].x, pts[1].y);
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
    }
    ctx.stroke();
    ctx.restore();
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

  /* Base + any strokes currently under a finger. */
  _composite() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this._base, 0, 0);
    for (const op of this._live.values()) this._paint(ctx, op);
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
    this.ops.push(op);
    this.redoStack.length = 0;
    if (op.type === 'clear') this._rebuildBase();
    else this._paint(this._baseCtx, op);
    this._composite();
    this._changed();
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

  getDoc() {
    const r = n => Math.round(n * 10) / 10;
    return {
      v: 1,
      ref: this.ref,
      ops: this.ops.map(op => op.type === 'stroke'
        ? { ...op, points: op.points.map(p => ({ x: r(p.x), y: r(p.y) })) }
        : op),
    };
  }

  loadDoc(doc) {
    if (!doc || !Array.isArray(doc.ops)) return false;
    this.ops = doc.ops;
    this.redoStack = [];
    if (doc.ref && doc.ref.w > 0 && doc.ref.h > 0) this.ref = doc.ref;
    this._rebuildBase();
    this._composite();
    return true;
  }

  /* ─── SPARKLES (transient, on their own layer) ─── */

  _addSparkles(x, y) {
    if (!this.sparkleOn) return;
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
      s.life -= 0.03;
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

  /* ─── INPUT ─── */

  _pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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

    // Pointer capture keeps the stroke alive if the finger strays off the canvas.
    if (this.canvas.setPointerCapture) {
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* not capturable */ }
    }

    // Each pointer gets its own stroke, so two fingers draw two lines.
    this._live.set(e.pointerId, {
      type: 'stroke',
      color: this.color,
      size: this.size,
      glow: this.glowOn,
      points: [lp],
    });
    this._addSparkles(p.x, p.y);
    this._scheduleComposite();
  }

  _move(e) {
    const op = this._live.get(e.pointerId);
    if (!op) return;
    e.preventDefault();

    const p = this._pos(e);
    const lp = this._toLogical(p.x, p.y);
    const last = op.points[op.points.length - 1];
    // Drop near-duplicate points: smaller ops, no visible difference.
    if (Math.hypot(lp.x - last.x, lp.y - last.y) < 1) return;

    op.points.push(lp);
    this._addSparkles(p.x, p.y);
    this._scheduleComposite();
  }

  _end(e) {
    const op = this._live.get(e.pointerId);
    if (!op) return;
    e.preventDefault();
    this._live.delete(e.pointerId);
    if (this.canvas.releasePointerCapture) {
      try { this.canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
    }
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
