document.addEventListener('DOMContentLoaded', () => {
  const draw = new DrawCanvas(
    document.getElementById('drawCanvas'),
    document.getElementById('stencilCanvas'),
    document.getElementById('fxCanvas')
  );

  draw.resize();
  draw.bind();

  window.addEventListener('resize', () => draw.resize());

  /* ─── AUTOSAVE ─── */
  const STORE_KEY = 'drawpad.doc';
  let saveTimer = null;

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(draw.getDoc()));
    } catch (_) {
      // Storage full or blocked (private mode). Drawing still works in memory.
    }
  }

  draw.onChange = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  };

  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) draw.loadDoc(JSON.parse(saved));
  } catch (_) {
    // Corrupt or unreadable save — start with a blank page rather than failing.
  }

  // Don't lose the last few strokes if the app is closed mid-timer.
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });

  /* ─── STENCILS ─── */
  document.querySelectorAll('.stencil-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stencil-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      draw.setStencil(btn.dataset.stencil === 'none' ? null : btn.dataset.stencil);
    });
  });

  /* ─── STAMPS ─── */
  function currentStampSize() {
    const b = document.querySelector('.stamp-size-btn.active');
    return b ? parseInt(b.dataset.stampsize) : 48;
  }

  document.querySelectorAll('.stamp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stamp-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      // The button's own glyph is the stamp — no second list to keep in sync.
      draw.setStamp(btn.textContent.trim(), currentStampSize());
      updateModeUI('stamp');
    });
  });

  document.querySelectorAll('.stamp-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stamp-size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const active = document.querySelector('.stamp-btn.on');
      if (active) draw.setStamp(active.textContent.trim(), parseInt(btn.dataset.stampsize));
    });
  });

  /* ─── MODE BUTTONS ─── */
  function updateModeUI(mode) {
    document.querySelectorAll('.mode-btn[data-mode]').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.mode-btn[data-mode="${mode}"]`);
    if (btn) btn.classList.add('active');
    document.getElementById('stampRow').classList.toggle('hidden', mode !== 'stamp');
    draw.setMode(mode);
  }

  document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      updateModeUI(btn.dataset.mode);
      document.querySelectorAll('.stamp-btn').forEach(b => b.classList.remove('on'));
    });
  });

  /* ─── TOGGLE BUTTONS ─── */
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      const on = btn.classList.contains('active');
      if (btn.dataset.toggle === 'sparkle') draw.setSparkle(on);
      if (btn.dataset.toggle === 'glow') draw.setGlow(on);
    });
  });

  /* ─── COLOURS ─── */
  document.querySelectorAll('.c-btn:not(.mix-btn)').forEach(btn => {
    btn.addEventListener('click', () => {
      if (mixing) { pickMixColor(btn); return; }
      document.querySelectorAll('.c-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      draw.setColor(btn.dataset.color);
    });
  });

  // Select the swatch that matches the engine's actual default colour.
  const defaultSwatch = document.querySelector(`.c-btn[data-color="${DEFAULT_COLOR}"]`)
    || document.querySelector('.c-btn');
  defaultSwatch.classList.add('on');
  draw.setColor(defaultSwatch.dataset.color);

  /* ─── COLOUR MIXING ─── */
  const mixBtn = document.querySelector('.mix-btn');
  const mixBar = document.getElementById('mixBar');
  const mixPreview = document.getElementById('mixPreview');
  let mixing = false;
  let mixA = null;
  let mixB = null;

  function mixColors(c1, c2) {
    const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const [a, b] = [rgb(c1), rgb(c2)];
    return '#' + a.map((v, i) => Math.round((v + b[i]) / 2).toString(16).padStart(2, '0')).join('');
  }

  function pickMixColor(btn) {
    if (!mixA) {
      mixA = btn.dataset.color;
      btn.classList.add('mix1');
      mixPreview.style.background = mixA;
    } else if (!mixB) {
      mixB = btn.dataset.color;
      btn.classList.add('mix2');
      mixPreview.style.background = mixColors(mixA, mixB);
    }
  }

  function endMixing() {
    mixing = false;
    mixA = null;
    mixB = null;
    mixBar.classList.add('hidden');
    document.querySelectorAll('.c-btn').forEach(b => b.classList.remove('mix1', 'mix2'));
  }

  mixBtn.addEventListener('click', () => {
    if (mixing) { endMixing(); return; }
    mixing = true;
    mixA = null;
    mixB = null;
    document.querySelectorAll('.c-btn').forEach(b => b.classList.remove('mix1', 'mix2'));
    mixPreview.style.background = '#ccc';
    mixBar.classList.remove('hidden');
  });

  document.getElementById('mixApply').addEventListener('click', () => {
    if (!mixA || !mixB) return;
    const mixed = mixColors(mixA, mixB);
    draw.setColor(mixed);
    document.querySelectorAll('.c-btn').forEach(b => b.classList.remove('on'));
    mixBtn.classList.add('on');
    mixBtn.style.background = mixed;
    endMixing();
  });

  document.getElementById('mixCancel').addEventListener('click', endMixing);

  /* ─── BRUSH SIZE ─── */
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      draw.setSize(parseInt(btn.dataset.size));
    });
  });

  /* ─── UNDO ─── */
  document.getElementById('undoBtn').addEventListener('click', () => draw.undo());

  /* ─── CLEAR (press and hold) ─── */
  /*
   * A text confirm() is unusable for a pre-reader, and a single tap wipes the
   * page by accident. Holding for HOLD_MS with a ring that fills as you hold
   * needs no reading, and clear is undoable anyway.
   */
  const clearBtn = document.getElementById('clearBtn');
  const HOLD_MS = 1200;
  let holdStart = 0;
  let holdRaf = null;

  function holdTick() {
    const pct = Math.min(1, (performance.now() - holdStart) / HOLD_MS);
    clearBtn.style.setProperty('--hold', (pct * 100).toFixed(1) + '%');
    if (pct >= 1) {
      endHold();
      draw.clear();
      clearBtn.classList.add('cleared');
      setTimeout(() => clearBtn.classList.remove('cleared'), 300);
      return;
    }
    holdRaf = requestAnimationFrame(holdTick);
  }

  function startHold(e) {
    if (draw.isEmpty()) return;
    e.preventDefault();
    holdStart = performance.now();
    clearBtn.classList.add('holding');
    holdRaf = requestAnimationFrame(holdTick);
  }

  function endHold() {
    if (holdRaf) cancelAnimationFrame(holdRaf);
    holdRaf = null;
    clearBtn.classList.remove('holding');
    clearBtn.style.setProperty('--hold', '0%');
  }

  clearBtn.addEventListener('pointerdown', startHold);
  clearBtn.addEventListener('pointerup', endHold);
  clearBtn.addEventListener('pointercancel', endHold);
  clearBtn.addEventListener('pointerleave', endHold);
});
