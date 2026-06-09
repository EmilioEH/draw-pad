class DrawCanvas {
  constructor(canvasEl, stencilEl) {
    this.canvas = canvasEl;
    this.stencilEl = stencilEl;
    this.drawing = false;
    this.color = '#1d3557';
    this.size = 10;
    this.stencilId = null;
    this.undoStack = [];
    this.maxUndo = 30;
    this._lastPos = null;
    this._w = 0;
    this._h = 0;

    this.mode = 'draw';
    this.stampId = null;
    this.stampSize = 48;
    this.sparkles = [];
    this.sparkleOn = false;
    this.glowOn = false;
    this._smoothing = false;
    this._strokePoints = [];
    this._animFrame = null;
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.stencilEl.width = rect.width * dpr;
    this.stencilEl.height = rect.height * dpr;
    this.stencilEl.style.width = rect.width + 'px';
    this.stencilEl.style.height = rect.height + 'px';
    if (!this.ctx) {
      this.ctx = this.canvas.getContext('2d');
      this.sCtx = this.stencilEl.getContext('2d');
    }
    this.ctx.scale(dpr, dpr);
    this.sCtx.scale(dpr, dpr);
    this._w = rect.width;
    this._h = rect.height;
    this.drawStencil();
  }

  setColor(c) { this.color = c; }
  setSize(s) { this.size = s; }
  setMode(m) { this.mode = m; }
  setStamp(id, size) { this.stampId = id; this.stampSize = size || 48; this.mode = 'stamp'; }
  setSparkle(on) { this.sparkleOn = on; }
  setGlow(on) {
    this.glowOn = on;
    this.canvas.style.filter = on ? 'drop-shadow(0 0 8px rgba(255,255,255,0.8))' : '';
  }
  setSmoothing(on) { this._smoothing = on; }

  setStencil(id) {
    this.stencilId = id;
    this.drawStencil();
  }

  drawStencil() {
    this.sCtx.clearRect(0, 0, this._w, this._h);
    if (this.stencilId) {
      drawStencil(this.sCtx, this.stencilId, this._w, this._h);
    }
  }

  saveState() {
    const data = this.canvas.toDataURL();
    this.undoStack.push(data);
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    const img = new Image();
    img.src = this.undoStack.pop();
    this.ctx.clearRect(0, 0, this._w, this._h);
    this.ctx.drawImage(img, 0, 0, this._w, this._h);
    return true;
  }

  clear() {
    this.ctx.clearRect(0, 0, this._w, this._h);
    this.undoStack = [];
    this.drawStencil();
  }

  _pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  /* ─── STAMP PLACEMENT ─── */
  _placeStamp(p) {
    if (!this.stampId) return;
    const stamps = {
      star: '⭐',
      heart: '❤️',
      flower: '🌸',
      smile: '😊',
      sun: '☀️',
      moon: '🌙',
      cloud: '☁️',
      tree: '🌳',
      fish: '🐟',
      butterfly: '🦋',
    };
    const emoji = stamps[this.stampId];
    if (!emoji) return;
    this.saveState();
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${this.stampSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, p.x, p.y);
    ctx.restore();
  }

  /* ─── SPARKLE EFFECT ─── */
  _addSparkle(x, y) {
    if (!this.sparkleOn) return;
    for (let i = 0; i < 3; i++) {
      this.sparkles.push({
        x: x + (Math.random() - 0.5) * this.size * 2,
        y: y + (Math.random() - 0.5) * this.size * 2,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2 - 1,
        life: 1,
        size: Math.random() * 4 + 2,
        color: this.color,
      });
    }
  }

  _updateSparkles() {
    if (this.sparkles.length === 0) return;
    const ctx = this.ctx;
    ctx.save();
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.05;
      s.life -= 0.03;
      if (s.life <= 0) {
        this.sparkles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = s.life;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      const spikes = 4;
      const outer = s.size * s.life;
      const inner = outer * 0.4;
      for (let j = 0; j < spikes * 2; j++) {
        const r = j % 2 === 0 ? outer : inner;
        const angle = (j * Math.PI) / spikes - Math.PI / 2;
        const sx = s.x + Math.cos(angle) * r;
        const sy = s.y + Math.sin(angle) * r;
        if (j === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    if (this.sparkles.length > 0) {
      this._animFrame = requestAnimationFrame(() => this._updateSparkles());
    }
  }

  /* ─── AUTO-SMOOTH ─── */
  _smoothStroke() {
    if (this._strokePoints.length < 3) {
      this._strokePoints = [];
      return;
    }
    const pts = this._strokePoints;
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = this.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      const midY = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.restore();
    this._strokePoints = [];
  }

  /* ─── DRAWING ─── */
  _start(e) {
    e.preventDefault();
    const p = this._pos(e);

    if (this.mode === 'stamp') {
      this._placeStamp(p);
      return;
    }

    this.drawing = true;
    this._lastPos = p;
    this._strokePoints = [p];
    saveUndo = true;
  }

  _move(e) {
    e.preventDefault();
    if (!this.drawing) return;
    const p = this._pos(e);
    const ctx = this.ctx;

    if (this._smoothing) {
      this._strokePoints.push(p);
      ctx.clearRect(0, 0, this._w, this._h);
      if (this.undoStack.length > 0) {
        const img = new Image();
        img.src = this.undoStack[this.undoStack.length - 1];
        ctx.drawImage(img, 0, 0, this._w, this._h);
      }
      this._smoothStrokePreview();
    } else {
      ctx.save();
      ctx.lineWidth = this.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(this._lastPos.x, this._lastPos.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
    }

    this._addSparkle(p.x, p.y);
    this._lastPos = p;
  }

  _smoothStrokePreview() {
    const pts = this._strokePoints;
    if (pts.length < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = this.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      const midY = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.restore();
  }

  _end(e) {
    e.preventDefault();
    if (!this.drawing) return;
    this.drawing = false;

    if (this._smoothing && this._strokePoints.length > 0) {
      this.saveState();
      this.ctx.clearRect(0, 0, this._w, this._h);
      if (this.undoStack.length > 1) {
        const img = new Image();
        img.src = this.undoStack[this.undoStack.length - 2];
        this.ctx.drawImage(img, 0, 0, this._w, this._h);
      }
      this._smoothStroke();
      this.undoStack.pop();
      this.saveState();
    } else if (saveUndo) {
      this.saveState();
      saveUndo = false;
    }
  }

  bind() {
    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => this._start(e));
    el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._end(e));
    el.addEventListener('pointercancel', (e) => this._end(e));
    el.addEventListener('pointerleave', (e) => this._end(e));
  }
}

let saveUndo = false;
