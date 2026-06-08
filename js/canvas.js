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

  /* ─── POINT HELPERS ─── */
  _pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  /* ─── DRAWING ─── */
  _start(e) {
    e.preventDefault();
    this.drawing = true;
    this._lastPos = this._pos(e);
    saveUndo = true;
  }

  _move(e) {
    e.preventDefault();
    if (!this.drawing) return;
    const p = this._pos(e);
    const ctx = this.ctx;
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
    this._lastPos = p;
  }

  _end(e) {
    e.preventDefault();
    if (!this.drawing) return;
    this.drawing = false;
    if (saveUndo) {
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
