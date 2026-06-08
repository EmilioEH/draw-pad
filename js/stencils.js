const STENCILS = {
  trex: { name: 'T-Rex', draw: drawTrex },
  stego: { name: 'Stegosaurus', draw: drawStego },
  trike: { name: 'Triceratops', draw: drawTrike },
  brachio: { name: 'Brachiosaurus', draw: drawBrachio },
  ptera: { name: 'Pterodactyl', draw: drawPtera },
};

function drawStencil(ctx, id, w, h) {
  ctx.clearRect(0, 0, w, h);
  if (id && STENCILS[id]) {
    ctx.save();
    STENCILS[id].draw(ctx, w, h);
    ctx.restore();
  }
}

/* ─── T-REX ─── */
function drawTrex(ctx, w, h) {
  const s = Math.min(w, h) * 0.85;
  const ox = (w - s) / 2, oy = (h - s) / 2 + s * 0.02;
  const sc = (x, y) => [ox + x * s, oy + y * s];

  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  function path(pts, close) {
    ctx.beginPath();
    ctx.moveTo(...sc(pts[0][0], pts[0][1]));
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      const [px, py] = pts[i - 1];
      ctx.quadraticCurveTo((px + x) / 2, (py + y) / 2, x, y);
    }
    if (close) ctx.closePath();
    ctx.stroke();
  }

  // Body/head outline
  path([
    [0.75, 0.08], // head top
    [0.92, 0.12], // brow
    [0.97, 0.20], // snout
    [0.93, 0.28], // upper jaw
    [0.88, 0.30], // mouth corner
    [0.90, 0.36], // lower jaw
    [0.82, 0.40], // jaw hinge
    [0.78, 0.48], // chest
    [0.75, 0.56], // belly
    [0.70, 0.64], // groin
    [0.66, 0.72], // leg front
    [0.70, 0.84], // foot front toe
    [0.72, 0.92], // foot front
    [0.64, 0.92], // foot front heel
    [0.60, 0.80], // leg back
    [0.56, 0.72], // between legs
    [0.52, 0.80], // leg back front
    [0.56, 0.92], // foot back
    [0.46, 0.92], // foot back heel
    [0.42, 0.78], // leg back back
    [0.38, 0.64], // tail base
    [0.18, 0.52], // tail mid
    [0.04, 0.42], // tail tip
    [0.10, 0.38], // tail top end
    [0.28, 0.36], // tail upper
    [0.40, 0.30], // lower back
    [0.48, 0.22], // mid back
    [0.58, 0.14], // neck
    [0.65, 0.08], // head back
  ], true);

  // Tiny arm
  path([
    [0.72, 0.44],
    [0.78, 0.46],
    [0.74, 0.50],
  ]);

  // Eye
  path([
    [0.86, 0.16],
    [0.89, 0.16],
  ]);
}

/* ─── STEGOSAURUS ─── */
function drawStego(ctx, w, h) {
  const s = Math.min(w, h) * 0.85;
  const ox = (w - s) / 2, oy = (h - s) / 2 + s * 0.02;
  const sc = (x, y) => [ox + x * s, oy + y * s];

  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  function path(pts, close) {
    ctx.beginPath();
    ctx.moveTo(...sc(pts[0][0], pts[0][1]));
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      const [px, py] = pts[i - 1];
      ctx.quadraticCurveTo((px + x) / 2, (py + y) / 2, x, y);
    }
    if (close) ctx.closePath();
    ctx.stroke();
  }

  // Body outline
  path([
    [0.70, 0.10], // head top
    [0.78, 0.16], // snout
    [0.76, 0.24], // lower jaw
    [0.68, 0.28], // neck
    [0.65, 0.36], // chest
    [0.62, 0.52], // belly front
    [0.58, 0.62], // belly mid
    [0.48, 0.62], // belly back
    [0.42, 0.68], // tail base
    [0.22, 0.62], // tail mid
    [0.08, 0.56], // tail tip upper
    [0.04, 0.58], // tail tip

    // Tail spikes (4)
    [0.08, 0.62],
    [0.12, 0.56],
    [0.16, 0.60],
    [0.20, 0.54],
    [0.26, 0.56],
    [0.30, 0.50],

    [0.40, 0.44], // rump
    [0.48, 0.34], // back mid
    [0.58, 0.22], // back front
    [0.65, 0.14], // neck back
  ], true);

  // Legs
  path([[0.56, 0.62], [0.54, 0.78], [0.60, 0.92], [0.50, 0.92], [0.46, 0.78]]);
  path([[0.38, 0.62], [0.36, 0.78], [0.42, 0.92], [0.32, 0.92], [0.28, 0.78]]);

  // Plates on back (5 triangular plates)
  const plates = [
    [0.52, 0.28], [0.50, 0.06], [0.56, 0.22],
    [0.56, 0.22], [0.54, 0.04], [0.60, 0.20],
    [0.46, 0.30], [0.44, 0.04], [0.50, 0.28],
    [0.38, 0.36], [0.36, 0.06], [0.42, 0.34],
    [0.30, 0.42], [0.28, 0.08], [0.34, 0.40],
  ];
  for (let i = 0; i < plates.length; i += 3) {
    path([plates[i], plates[i + 1], plates[i + 2]]);
  }

  // Eye
  path([[0.74, 0.14], [0.77, 0.14]]);
}

/* ─── TRICERATOPS ─── */
function drawTrike(ctx, w, h) {
  const s = Math.min(w, h) * 0.85;
  const ox = (w - s) / 2, oy = (h - s) / 2 + s * 0.02;
  const sc = (x, y) => [ox + x * s, oy + y * s];

  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  function path(pts, close) {
    ctx.beginPath();
    ctx.moveTo(...sc(pts[0][0], pts[0][1]));
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      const [px, py] = pts[i - 1];
      ctx.quadraticCurveTo((px + x) / 2, (py + y) / 2, x, y);
    }
    if (close) ctx.closePath();
    ctx.stroke();
  }

  // Body + head outline
  path([
    [0.20, 0.08], // frill top
    [0.26, 0.04], // frill upper
    [0.30, 0.06], // frill upper right
    [0.34, 0.10], // brow horn base
    [0.38, 0.06], // brow horn tip
    [0.38, 0.10], // brow horn back
    [0.42, 0.12], // snout top
    [0.46, 0.16], // beak top
    [0.44, 0.22], // beak tip
    [0.38, 0.22], // lower beak
    [0.34, 0.24], // jaw
    [0.28, 0.24], // frill bottom
    [0.22, 0.22], // frill lower
    [0.16, 0.26], // neck
    [0.14, 0.36], // chest
    [0.16, 0.48], // belly front
    [0.24, 0.56], // belly
    [0.34, 0.56], // belly back
    [0.40, 0.62], // leg front
    [0.40, 0.78], // leg front mid
    [0.44, 0.92], // foot front
    [0.36, 0.92], // foot front heel
    [0.32, 0.78], // leg front back
    [0.46, 0.64], // between front legs
    [0.50, 0.78], // leg back front
    [0.54, 0.92], // foot back
    [0.46, 0.92], // foot back heel
    [0.42, 0.78], // leg back back
    [0.48, 0.56], // groin
    [0.60, 0.50], // tail base
    [0.72, 0.48], // tail mid
    [0.80, 0.46], // tail tip
    [0.78, 0.42], // tail top
    [0.68, 0.40], // tail upper
    [0.60, 0.34], // rump
    [0.56, 0.26], // back
    [0.50, 0.20], // shoulders
    [0.48, 0.16], // neck back
    [0.44, 0.12], // frill back
    [0.36, 0.08], // frill lower
  ], true);

  // Nose horn
  path([[0.44, 0.14], [0.46, 0.08], [0.44, 0.18]]);
  path([[0.42, 0.12], [0.44, 0.06], [0.44, 0.10]]);

  // Eye
  path([[0.32, 0.14], [0.35, 0.14]]);

  // Frill edge details (bumps)
  path([[0.20, 0.08], [0.18, 0.12], [0.22, 0.14]]);
  path([[0.22, 0.14], [0.20, 0.18], [0.24, 0.18]]);
  path([[0.24, 0.18], [0.22, 0.22], [0.28, 0.20]]);
}

/* ─── BRACHIOSAURUS ─── */
function drawBrachio(ctx, w, h) {
  const s = Math.min(w, h) * 0.85;
  const ox = (w - s) / 2, oy = (h - s) / 2 + s * 0.02;
  const sc = (x, y) => [ox + x * s, oy + y * s];

  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  function path(pts, close) {
    ctx.beginPath();
    ctx.moveTo(...sc(pts[0][0], pts[0][1]));
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      const [px, py] = pts[i - 1];
      ctx.quadraticCurveTo((px + x) / 2, (py + y) / 2, x, y);
    }
    if (close) ctx.closePath();
    ctx.stroke();
  }

  // Entire body outline (long neck, large body, tail)
  path([
    [0.88, 0.04], // head top
    [0.96, 0.08], // snout
    [0.94, 0.14], // lower jaw
    [0.88, 0.16], // jaw hinge
    [0.84, 0.14], // throat
    [0.78, 0.18], // upper neck
    [0.70, 0.20], // mid neck
    [0.62, 0.22], // lower neck
    [0.56, 0.28], // chest
    [0.52, 0.36], // belly front

    // Front leg (longer)
    [0.50, 0.42],
    [0.48, 0.58],
    [0.50, 0.72],
    [0.52, 0.86],
    [0.46, 0.92],
    [0.38, 0.92],
    [0.40, 0.86],
    [0.40, 0.72],
    [0.42, 0.60],

    [0.44, 0.46], // belly mid
    [0.40, 0.42], // belly back
    [0.32, 0.38], // tail base

    // Back leg
    [0.30, 0.48],
    [0.28, 0.62],
    [0.30, 0.76],
    [0.32, 0.88],
    [0.26, 0.92],
    [0.18, 0.92],
    [0.20, 0.86],
    [0.22, 0.74],
    [0.24, 0.60],

    [0.20, 0.40], // tail base up

    [0.08, 0.38], // tail
    [0.02, 0.36], // tail tip
    [0.04, 0.32], // tail top

    [0.16, 0.28], // rump
    [0.24, 0.22], // back
    [0.34, 0.18], // mid back
    [0.44, 0.14], // shoulder
    [0.52, 0.12], // lower neck back
    [0.60, 0.10], // mid neck back
    [0.70, 0.08], // upper neck back
    [0.78, 0.06], // head back
  ], true);

  // Eye
  path([[0.90, 0.08], [0.93, 0.08]]);
}

/* ─── PTERODACTYL ─── */
function drawPtera(ctx, w, h) {
  const s = Math.min(w, h) * 0.85;
  const ox = (w - s) / 2, oy = (h - s) / 2 + s * 0.02;
  const sc = (x, y) => [ox + x * s, oy + y * s];

  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  function path(pts, close) {
    ctx.beginPath();
    ctx.moveTo(...sc(pts[0][0], pts[0][1]));
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      const [px, py] = pts[i - 1];
      ctx.quadraticCurveTo((px + x) / 2, (py + y) / 2, x, y);
    }
    if (close) ctx.closePath();
    ctx.stroke();
  }

  // Body + wings (top-down flying view)
  path([
    [0.50, 0.04], // head crest top
    [0.60, 0.08], // beak top
    [0.72, 0.06], // beak tip
    [0.60, 0.14], // beak bottom
    [0.54, 0.14], // head base
    [0.56, 0.20], // neck

    // Right wing
    [0.64, 0.18],
    [0.78, 0.14],
    [0.90, 0.08],
    [0.96, 0.10],
    [0.92, 0.14],
    [0.82, 0.20],
    [0.72, 0.28],
    [0.64, 0.30],

    [0.60, 0.28], // body right
    [0.58, 0.32], // tail
    [0.56, 0.36], // tail tip
    [0.54, 0.32], // tail other side
    [0.52, 0.28], // body left

    // Left wing
    [0.48, 0.30],
    [0.38, 0.28],
    [0.28, 0.20],
    [0.18, 0.14],
    [0.14, 0.10],
    [0.18, 0.08],
    [0.26, 0.14],
    [0.36, 0.18],
    [0.46, 0.20],

    [0.46, 0.14], // neck left
    [0.44, 0.10], // head left
  ], true);

  // Wing membrane lines (right)
  path([[0.60, 0.20], [0.85, 0.12]]);
  path([[0.60, 0.22], [0.75, 0.18]]);

  // Wing membrane lines (left)
  path([[0.48, 0.20], [0.25, 0.12]]);
  path([[0.48, 0.22], [0.35, 0.18]]);

  // Eye
  path([[0.52, 0.08], [0.55, 0.08]]);
}
