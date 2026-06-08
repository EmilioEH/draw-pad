document.addEventListener('DOMContentLoaded', () => {
  const drawEl = document.getElementById('drawCanvas');
  const stencilEl = document.getElementById('stencilCanvas');
  const draw = new DrawCanvas(drawEl, stencilEl);

  draw.bind();
  draw.resize();

  window.addEventListener('resize', () => draw.resize());

  /* ─── STENCILS ─── */
  document.querySelectorAll('.stencil-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stencil-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      draw.setStencil(btn.dataset.stencil === 'none' ? null : btn.dataset.stencil);
    });
  });

  /* ─── COLORS ─── */
  document.querySelectorAll('.c-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.c-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      draw.setColor(btn.dataset.color);
    });
  });
  document.querySelector('.c-btn').classList.add('on');

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
