/* Default brush colour. Kept here so index.html and DrawCanvas cannot disagree. */
const DEFAULT_COLOR = '#ff3b30';

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
    this._celebrated = null;   // a new outline is a new thing to finish
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
    if (op.type === 'fill') { this._paintFill(ctx, op); return; }

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
      ctx.shadowColor = op.rainbow ? '#ff00cc' : op.color;
      ctx.shadowBlur = Math.max(8, op.size * 1.5);
    }

    if (pts.length === 1) {
      // A single tap should still leave a dot.
      if (op.rainbow) ctx.fillStyle = `hsl(${op.hue || 0} 90% 55%)`;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, op.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (op.rainbow) {
      // Segment-by-segment so the hue can travel along the stroke.
      for (let i = 0; i < pts.length - 1; i++) {
        ctx.strokeStyle = `hsl(${((op.hue || 0) + i * 9) % 360} 90% 55%)`;
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
        ctx.stroke();
      }
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

  /* ─── FLOOD FILL ─── */
  /*
   * Tapping to fill a region is far easier than tracing for a small child, so
   * it has to respect the stencil outline as a boundary even though the
   * stencil lives on a separate layer. We composite art + stencil into a
   * scratch canvas, flood there, and paint the resulting mask into the artwork.
   *
   * The op records which stencil was showing, so replaying history is exact.
   */
  _paintFill(ctx, op) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    if (!W || !H) return;

    if (!this._scratch) {
      this._scratch = document.createElement('canvas');
      this._scratchCtx = this._scratch.getContext('2d', { willReadFrequently: true });
      this._out = document.createElement('canvas');
      this._outCtx = this._out.getContext('2d');
    }
    for (const c of [this._scratch, this._out]) {
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    }

    const sctx = this._scratchCtx;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, W, H);
    sctx.drawImage(ctx.canvas, 0, 0);
    if (op.stencil) {
      sctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
      drawStencil(sctx, op.stencil, this._w, this._h);
      sctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    const t = this._t();
    const sx = Math.round((op.x * t.s + t.ox) * this._dpr);
    const sy = Math.round((op.y * t.s + t.oy) * this._dpr);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return;

    const src = sctx.getImageData(0, 0, W, H).data;
    const seen = new Uint8Array(W * H);
    const ALPHA = 40;   // anything fainter than this counts as empty space
    if (src[(sy * W + sx) * 4 + 3] >= ALPHA) return;   // tapped a line, not a gap

    // Scanline flood: push spans rather than pixels, which keeps the stack small.
    const stack = [[sx, sx, sy, 0]];
    const mask = new Uint8Array(W * H);
    const empty = i => src[i * 4 + 3] < ALPHA;

    while (stack.length) {
      const [x1, x2, y] = stack.pop();
      if (y < 0 || y >= H) continue;
      let left = x1;
      while (left > 0 && !seen[y * W + left - 1] && empty(y * W + left - 1)) left--;
      let right = x2;
      while (right < W - 1 && !seen[y * W + right + 1] && empty(y * W + right + 1)) right++;

      for (let x = left; x <= right; x++) {
        const i = y * W + x;
        seen[i] = 1;
        mask[i] = 1;
      }
      for (const ny of [y - 1, y + 1]) {
        if (ny < 0 || ny >= H) continue;
        let x = left;
        while (x <= right) {
          while (x <= right && (seen[ny * W + x] || !empty(ny * W + x))) x++;
          if (x > right) break;
          const start = x;
          while (x <= right && !seen[ny * W + x] && empty(ny * W + x)) x++;
          stack.push([start, x - 1, ny]);
        }
      }
    }

    // Paint the mask as a solid colour, then composite it normally so it
    // blends with whatever is already on the canvas.
    const out = this._outCtx.createImageData(W, H);
    const px = out.data;
    const [r, g, b] = [1, 3, 5].map(i => parseInt(op.color.slice(i, i + 2), 16));
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      px[i * 4] = r;
      px[i * 4 + 1] = g;
      px[i * 4 + 2] = b;
      px[i * 4 + 3] = 255;
    }
    this._outCtx.setTransform(1, 0, 0, 1, 0, 0);
    this._outCtx.putImageData(out, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this._out, 0, 0);
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

    let total = 0;
    let hit = 0;
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        if (stencil[(y * CW + x) * 4 + 3] < 30) continue;
        total++;
        // Allow a little slop: a child tracing near the line still counts.
        let near = false;
        for (let dy = -2; dy <= 2 && !near; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue;
            if (art[(ny * CW + nx) * 4 + 3] > 30) { near = true; break; }
          }
        }
        if (near) hit++;
      }
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
    this._maybeCelebrate();
  }

  /* Fires once per stencil, when enough of the outline has been traced. */
  _maybeCelebrate() {
    if (!this.stencilId || this._celebrated === this.stencilId) return;
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
    this._live.set(e.pointerId, {
      type: 'stroke',
      color: rainbow ? '#ff3b30' : this.color,
      rainbow,
      hue: rainbow ? (this._hue += 47) % 360 : undefined,
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
