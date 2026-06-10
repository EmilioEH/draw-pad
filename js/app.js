document.addEventListener('DOMContentLoaded', () => {
  const drawEl = document.getElementById('drawCanvas');
  const stencilEl = document.getElementById('stencilCanvas');
  const draw = new DrawCanvas(drawEl, stencilEl);

  draw.resize();
  draw.bind();

  window.addEventListener('resize', () => draw.resize());

  /* ─── STENCILS ─── */
  document.querySelectorAll('.stencil-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stencil-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      draw.setStencil(btn.dataset.stencil === 'none' ? null : btn.dataset.stencil);
    });
  });

  /* ─── STAMPS ─── */
  document.querySelectorAll('.stamp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stamp-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      const sizeBtn = document.querySelector('.stamp-size-btn.active');
      const size = sizeBtn ? parseInt(sizeBtn.dataset.stampsize) : 48;
      draw.setStamp(btn.dataset.stamp, size);
      updateModeUI('stamp');
    });
  });

  document.querySelectorAll('.stamp-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stamp-size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const activeStamp = document.querySelector('.stamp-btn.on');
      if (activeStamp) {
        draw.setStamp(activeStamp.dataset.stamp, parseInt(btn.dataset.stampsize));
      }
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
      const toggle = btn.dataset.toggle;
      if (toggle === 'sparkle') draw.setSparkle(btn.classList.contains('active'));
      if (toggle === 'glow') draw.setGlow(btn.classList.contains('active'));
      if (toggle === 'smooth') draw.setSmoothing(btn.classList.contains('active'));
    });
  });

  /* ─── COLORS ─── */
  let mixing = false;
  let mixColor1 = null;
  let mixColor2 = null;
  const mixBar = document.getElementById('mixBar');
  const mixPreview = document.getElementById('mixPreview');

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
  }

  function mixColors(c1, c2) {
    const a = hexToRgb(c1);
    const b = hexToRgb(c2);
    return rgbToHex(
      (a.r + b.r) / 2,
      (a.g + b.g) / 2,
      (a.b + b.b) / 2
    );
  }

  function updateMixPreview() {
    if (mixColor1 && mixColor2) {
      const mixed = mixColors(mixColor1, mixColor2);
      mixPreview.style.background = mixed;
      mixPreview.dataset.mixed = mixed;
    } else if (mixColor1) {
      mixPreview.style.background = mixColor1;
    }
  }

  document.querySelectorAll('.c-btn:not(.mix-btn)').forEach(btn => {
    btn.addEventListener('click', () => {
      if (mixing) {
        document.querySelectorAll('.c-btn').forEach(b => b.classList.remove('mix1', 'mix2'));
        if (!mixColor1) {
          mixColor1 = btn.dataset.color;
          btn.classList.add('mix1');
        } else if (!mixColor2) {
          mixColor2 = btn.dataset.color;
          btn.classList.add('mix2');
          updateMixPreview();
        }
      } else {
        document.querySelectorAll('.c-btn').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        draw.setColor(btn.dataset.color);
      }
    });
  });

  document.querySelector('.c-btn').classList.add('on');

  document.querySelector('.mix-btn').addEventListener('click', () => {
    mixing = !mixing;
    document.querySelectorAll('.c-btn').forEach(b => b.classList.remove('mix1', 'mix2'));
    mixBar.classList.toggle('hidden', !mixing);
    mixColor1 = null;
    mixColor2 = null;
    mixPreview.style.background = '#ccc';
  });

  document.getElementById('mixApply').addEventListener('click', () => {
    if (mixColor1 && mixColor2) {
      const mixed = mixColors(mixColor1, mixColor2);
      draw.setColor(mixed);
      document.querySelectorAll('.c-btn').forEach(b => b.classList.remove('on', 'mix1', 'mix2'));
      document.querySelector('.mix-btn').classList.add('on');
      document.querySelector('.mix-btn').style.background = mixed;
      mixing = false;
      mixBar.classList.add('hidden');
      mixColor1 = null;
      mixColor2 = null;
    }
  });

  document.getElementById('mixCancel').addEventListener('click', () => {
    mixing = false;
    mixBar.classList.add('hidden');
    mixColor1 = null;
    mixColor2 = null;
    document.querySelectorAll('.c-btn').forEach(b => b.classList.remove('mix1', 'mix2'));
  });

  /* ─── BRUSH SIZE ─── */
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      draw.setSize(parseInt(btn.dataset.size));
    });
  });

  /* ─── UNDO ─── */
  document.getElementById('undoBtn').addEventListener('click', () => {
    draw.undo();
  });

  /* ─── CLEAR ─── */
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (confirm('Clear your drawing?')) {
      draw.clear();
    }
  });
});
