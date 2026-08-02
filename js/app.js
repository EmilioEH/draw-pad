const STENCIL_IDS = ['none', 'trex', 'stego', 'trike', 'brachio', 'ptera'];
const STAMPS = ['⭐', '❤️', '🌸', '😊', '☀️', '🌙', '☁️', '🌳', '🐟', '🦋', '🌈', '🍎'];

document.addEventListener('DOMContentLoaded', () => {
  const draw = new DrawCanvas(
    document.getElementById('drawCanvas'),
    document.getElementById('stencilCanvas'),
    document.getElementById('fxCanvas')
  );

  draw.resize();
  draw.bind();
  window.addEventListener('resize', () => draw.resize());
  window.drawPad = draw;   // handle for the smoke tests

  /* Audio can only start after a real user gesture. */
  const wake = () => Sound.init();
  document.addEventListener('pointerdown', wake, { capture: true });

  /* ─── AUTOSAVE ─── */
  const STORE_KEY = 'drawpad.doc';
  let saveTimer = null;

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(draw.getDoc()));
    } catch (_) {
      // Storage full or blocked (private mode). Drawing still works in memory.
    }
  }

  draw.onChange = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  };

  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) draw.loadDoc(JSON.parse(saved));
  } catch (_) {
    // Corrupt or unreadable save — start with a blank page rather than failing.
  }

  window.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
  });

  /* ─── SOUND HOOKS ─── */
  let strokeTone = 0;
  draw.canvas.addEventListener('pointerdown', () => {
    if (draw.mode === 'stamp') Sound.stamp();
    else if (draw.mode === 'fill') Sound.fill();
    else Sound.strokeStart(strokeTone++);
  });
  draw.onCelebrate = () => Sound.celebrate();

  /* ─── COLOURS ─── */
  document.querySelectorAll('.c-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.c-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      draw.setColor(btn.dataset.color);
      Sound.pick();
    });
  });

  const defaultSwatch = document.querySelector(`.c-btn[data-color="${DEFAULT_COLOR}"]`)
    || document.querySelector('.c-btn');
  defaultSwatch.classList.add('on');
  draw.setColor(defaultSwatch.dataset.color);

  /* ─── BRUSH SIZE ─── */
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      draw.setSize(parseInt(btn.dataset.size));
      Sound.pick();
    });
  });
  draw.setSize(parseInt(document.querySelector('.size-btn.active').dataset.size));

  /* ─── MODE: DRAW vs FILL vs STAMP ─── */
  const fillBtn = document.querySelector('.tool-btn[data-mode="fill"]');

  function setMode(mode) {
    draw.setMode(mode);
    fillBtn.classList.toggle('active', mode === 'fill');
  }

  fillBtn.addEventListener('click', () => {
    setMode(draw.mode === 'fill' ? 'draw' : 'fill');
    Sound.pick();
  });

  /* ─── MAGIC BRUSH ─── */
  /* One button instead of separate Sparks and Glow toggles: a child picks a
     brush that is magic, not two independent abstract switches. */
  const magicBtn = document.querySelector('.tool-btn[data-toggle="magic"]');
  magicBtn.addEventListener('click', () => {
    const on = !magicBtn.classList.contains('active');
    magicBtn.classList.toggle('active', on);
    draw.setSparkle(on);
    draw.setGlow(on);
    Sound.pick();
  });

  /* ─── STENCIL PICKER ─── */
  const stencilPicker = document.getElementById('stencilPicker');
  const stencilGrid = document.getElementById('stencilGrid');

  STENCIL_IDS.forEach(id => {
    const cell = document.createElement('button');
    cell.className = 'picker-cell';
    cell.dataset.stencil = id;
    cell.setAttribute('aria-label', id === 'none' ? 'No outline' : STENCILS[id].name);

    if (id === 'none') {
      cell.textContent = '🚫';
    } else {
      // Show the real outline rather than an emoji that looks nothing like it.
      const c = document.createElement('canvas');
      const S = 200;
      c.width = S;
      c.height = S;
      const tctx = c.getContext('2d');
      tctx.translate(S * 0.06, S * 0.06);   // small margin so nothing touches the edge
      tctx.scale(0.88, 0.88);
      drawStencil(tctx, id, S, S);
      cell.appendChild(c);
    }

    cell.addEventListener('click', () => {
      stencilGrid.querySelectorAll('.picker-cell').forEach(b => b.classList.remove('on'));
      cell.classList.add('on');
      draw.setStencil(id === 'none' ? null : id);
      Sound.pick();
      closePickers();
    });
    stencilGrid.appendChild(cell);
  });
  stencilGrid.firstChild.classList.add('on');

  /* ─── STAMP PICKER ─── */
  const stampPicker = document.getElementById('stampPicker');
  const stampGrid = document.getElementById('stampGrid');

  function currentStampSize() {
    const b = document.querySelector('.stamp-size-btn.active');
    return b ? parseInt(b.dataset.stampsize) : 72;
  }

  STAMPS.forEach(emoji => {
    const cell = document.createElement('button');
    cell.className = 'picker-cell stamp-cell';
    cell.textContent = emoji;
    cell.setAttribute('aria-label', `Sticker ${emoji}`);
    cell.addEventListener('click', () => {
      stampGrid.querySelectorAll('.picker-cell').forEach(b => b.classList.remove('on'));
      cell.classList.add('on');
      // The button's own glyph is the stamp — no second list to keep in sync.
      draw.setStamp(emoji, currentStampSize());
      fillBtn.classList.remove('active');
      Sound.stamp();
      closePickers();
    });
    stampGrid.appendChild(cell);
  });

  document.querySelectorAll('.stamp-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stamp-size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const active = stampGrid.querySelector('.picker-cell.on');
      if (active) draw.setStamp(active.textContent.trim(), parseInt(btn.dataset.stampsize));
      Sound.pick();
    });
  });

  /* ─── PICKER OPEN / CLOSE ─── */
  function closePickers() {
    stencilPicker.classList.add('hidden');
    stampPicker.classList.add('hidden');
  }

  document.getElementById('dinosBtn').addEventListener('click', () => {
    stampPicker.classList.add('hidden');
    stencilPicker.classList.remove('hidden');
    Sound.pick();
  });

  document.getElementById('stampsBtn').addEventListener('click', () => {
    stencilPicker.classList.add('hidden');
    stampPicker.classList.remove('hidden');
    Sound.pick();
  });

  document.querySelectorAll('.picker-close').forEach(btn => {
    btn.addEventListener('click', () => {
      closePickers();
      Sound.pick();
    });
  });

  /* ─── UNDO ─── */
  document.getElementById('undoBtn').addEventListener('click', () => {
    if (draw.undo()) Sound.undo();
  });

  /* ─── PRESS AND HOLD ─── */
  /*
   * Used for both clearing and saving. A text confirm() is unusable for a
   * pre-reader, and a single tap is too easy to hit by accident. A ring that
   * fills as you hold needs no reading at all.
   */
  function holdToConfirm(btn, ms, onDone) {
    let raf = null;
    let start = 0;

    const end = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      btn.style.setProperty('--hold', '0%');
    };

    const tick = () => {
      const pct = Math.min(1, (performance.now() - start) / ms);
      btn.style.setProperty('--hold', (pct * 100).toFixed(1) + '%');
      if (pct >= 1) {
        end();
        onDone();
        btn.classList.add('done');
        setTimeout(() => btn.classList.remove('done'), 400);
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      start = performance.now();
      raf = requestAnimationFrame(tick);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
      btn.addEventListener(ev, end));
  }

  holdToConfirm(document.getElementById('clearBtn'), 1200, () => {
    if (draw.isEmpty()) return;
    draw.clear();
    Sound.clear();
  });

  /* Saving leaves the app, so it sits behind the same hold — a small
     parent gate rather than something a 3-year-old triggers by tapping. */
  holdToConfirm(document.getElementById('saveBtn'), 1200, async () => {
    const blob = await draw.toBlob();
    if (!blob) return;
    const file = new File([blob], 'drawing.png', { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'My drawing' });
        return;
      } catch (_) {
        // Cancelled or unavailable — fall through to a download.
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'drawing.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  /* ─── MUTE ─── */
  const muteBtn = document.getElementById('muteBtn');
  try {
    if (localStorage.getItem('drawpad.muted') === '1') {
      Sound.setMuted(true);
      muteBtn.textContent = '🔇';
    }
  } catch (_) { /* storage blocked */ }

  muteBtn.addEventListener('click', () => {
    const muted = !Sound.muted;
    Sound.setMuted(muted);
    muteBtn.textContent = muted ? '🔇' : '🔊';
    try { localStorage.setItem('drawpad.muted', muted ? '1' : '0'); } catch (_) { /* ignore */ }
    if (!muted) Sound.pick();
  });
});
