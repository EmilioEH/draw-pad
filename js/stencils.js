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

function setup(ctx) {
  ctx.strokeStyle = 'rgba(60,60,60,0.5)';
  ctx.fillStyle = 'rgba(160,160,160,0.15)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

function drawPoly(ctx, pts, close) {
  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(...pts[i]);
  }
  if (close) ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/* ─── T-REX ─── */
function drawTrex(ctx, w, h) {
  const s = Math.min(w, h) * 0.85;
  const ox = (w - s) / 2, oy = (h - s) / 2 + s * 0.02;
  const sc = (x, y) => [ox + x * s, oy + y * s];
  setup(ctx);

  // Body/head outline
  drawPoly(ctx, [
    sc(0.75, 0.08), // head top
    sc(0.92, 0.12), // brow
    sc(0.97, 0.20), // snout
    sc(0.93, 0.28), // upper jaw
    sc(0.88, 0.30), // mouth corner
    sc(0.90, 0.36), // lower jaw
    sc(0.82, 0.40), // jaw hinge
    sc(0.78, 0.48), // chest
    sc(0.75, 0.56), // belly
    sc(0.70, 0.64), // groin
    sc(0.66, 0.72), // leg front
    sc(0.70, 0.84), // foot front toe
    sc(0.72, 0.92), // foot front
    sc(0.64, 0.92), // foot front heel
    sc(0.60, 0.80), // leg back
    sc(0.56, 0.72), // between legs
    sc(0.52, 0.80), // leg back front
    sc(0.56, 0.92), // foot back
    sc(0.46, 0.92), // foot back heel
    sc(0.42, 0.78), // leg back back
    sc(0.38, 0.64), // tail base
    sc(0.18, 0.52), // tail mid
    sc(0.04, 0.42), // tail tip
    sc(0.10, 0.38), // tail top end
    sc(0.28, 0.36), // tail upper
    sc(0.40, 0.30), // lower back
    sc(0.48, 0.22), // mid back
    sc(0.58, 0.14), // neck
    sc(0.65, 0.08), // head back
  ], true);

  // Tiny arm
  drawPoly(ctx, [
    sc(0.72, 0.44),
    sc(0.78, 0.46),
    sc(0.74, 0.50),
  ]);

  // Eye
  drawPoly(ctx, [
    sc(0.86, 0.16),
    sc(0.89, 0.16),
  ]);
}

/* ─── STEGOSAURUS ─── */
function drawStego(ctx, w, h) {
  const s = Math.min(w, h) * 0.85;
  const ox = (w - s) / 2, oy = (h - s) / 2 + s * 0.02;
  const sc = (x, y) => [ox + x * s, oy + y * s];
  setup(ctx);

  // Body outline
  drawPoly(ctx, [
    sc(0.70, 0.10), // head top
    sc(0.78, 0.16), // snout
    sc(0.76, 0.24), // lower jaw
    sc(0.68, 0.28), // neck
    sc(0.65, 0.36), // chest
    sc(0.62, 0.52), // belly front
    sc(0.58, 0.62), // belly mid
    sc(0.48, 0.62), // belly back
    sc(0.42, 0.68), // tail base
    sc(0.22, 0.62), // tail mid
    sc(0.08, 0.56), // tail tip upper
    sc(0.04, 0.58), // tail tip
    sc(0.08, 0.62),
    sc(0.12, 0.56),
    sc(0.16, 0.60),
    sc(0.20, 0.54),
    sc(0.26, 0.56),
    sc(0.30, 0.50),
    sc(0.40, 0.44), // rump
    sc(0.48, 0.34), // back mid
    sc(0.58, 0.22), // back front
    sc(0.65, 0.14), // neck back
  ], true);

  // Legs
  drawPoly(ctx, [sc(0.56, 0.62), sc(0.54, 0.78), sc(0.60, 0.92), sc(0.50, 0.92), sc(0.46, 0.78)]);
  drawPoly(ctx, [sc(0.38, 0.62), sc(0.36, 0.78), sc(0.42, 0.92), sc(0.32, 0.92), sc(0.28, 0.78)]);

  // Plates on back (5 triangular plates)
  const plates = [
    [0.52, 0.28], [0.50, 0.06], [0.56, 0.22],
    [0.56, 0.22], [0.54, 0.04], [0.60, 0.20],
    [0.46, 0.30], [0.44, 0.04], [0.50, 0.28],
    [0.38, 0.36], [0.36, 0.06], [0.42, 0.34],
    [0.30, 0.42], [0.28, 0.08], [0.34, 0.40],
  ];
  for (let i = 0; i < plates.length; i += 3) {
    drawPoly(ctx, [sc(...plates[i]), sc(...plates[i + 1]), sc(...plates[i + 2])]);
  }

  // Eye
  drawPoly(ctx, [sc(0.74, 0.14), sc(0.77, 0.14)]);
}

/* ─── TRICERATOPS ─── */
function drawTrike(ctx, w, h) {
  const s = Math.min(w, h) * 0.85;
  const ox = (w - s) / 2, oy = (h - s) / 2 + s * 0.02;
  const sc = (x, y) => [ox + x * s, oy + y * s];
  setup(ctx);

  // Body + head outline
  drawPoly(ctx, [
    sc(0.20, 0.08), // frill top
    sc(0.26, 0.04), // frill upper
    sc(0.30, 0.06), // frill upper right
    sc(0.34, 0.10), // brow horn base
    sc(0.38, 0.06), // brow horn tip
    sc(0.38, 0.10), // brow horn back
    sc(0.42, 0.12), // snout top
    sc(0.46, 0.16), // beak top
    sc(0.44, 0.22), // beak tip
    sc(0.38, 0.22), // lower beak
    sc(0.34, 0.24), // jaw
    sc(0.28, 0.24), // frill bottom
    sc(0.22, 0.22), // frill lower
    sc(0.16, 0.26), // neck
    sc(0.14, 0.36), // chest
    sc(0.16, 0.48), // belly front
    sc(0.24, 0.56), // belly
    sc(0.34, 0.56), // belly back
    sc(0.40, 0.62), // leg front
    sc(0.40, 0.78), // leg front mid
    sc(0.44, 0.92), // foot front
    sc(0.36, 0.92), // foot front heel
    sc(0.32, 0.78), // leg front back
    sc(0.46, 0.64), // between front legs
    sc(0.50, 0.78), // leg back front
    sc(0.54, 0.92), // foot back
    sc(0.46, 0.92), // foot back heel
    sc(0.42, 0.78), // leg back back
    sc(0.48, 0.56), // groin
    sc(0.60, 0.50), // tail base
    sc(0.72, 0.48), // tail mid
    sc(0.80, 0.46), // tail tip
    sc(0.78, 0.42), // tail top
    sc(0.68, 0.40), // tail upper
    sc(0.60, 0.34), // rump
    sc(0.56, 0.26), // back
    sc(0.50, 0.20), // shoulders
    sc(0.48, 0.16), // neck back
    sc(0.44, 0.12), // frill back
    sc(0.36, 0.08), // frill lower
  ], true);

  // Nose horn
  drawPoly(ctx, [sc(0.44, 0.14), sc(0.46, 0.08), sc(0.44, 0.18)]);
  drawPoly(ctx, [sc(0.42, 0.12), sc(0.44, 0.06), sc(0.44, 0.10)]);

  // Eye
  drawPoly(ctx, [sc(0.32, 0.14), sc(0.35, 0.14)]);

  // Frill edge details (bumps)
  drawPoly(ctx, [sc(0.20, 0.08), sc(0.18, 0.12), sc(0.22, 0.14)]);
  drawPoly(ctx, [sc(0.22, 0.14), sc(0.20, 0.18), sc(0.24, 0.18)]);
  drawPoly(ctx, [sc(0.24, 0.18), sc(0.22, 0.22), sc(0.28, 0.20)]);
}

/* ─── BRACHIOSAURUS ─── */
function drawBrachio(ctx, w, h) {
  const s = Math.min(w, h) * 0.85;
  const ox = (w - s) / 2, oy = (h - s) / 2 + s * 0.02;
  const sc = (x, y) => [ox + x * s, oy + y * s];
  setup(ctx);

  // Entire body outline (long neck, large body, tail)
  drawPoly(ctx, [
    sc(0.88, 0.04), // head top
    sc(0.96, 0.08), // snout
    sc(0.94, 0.14), // lower jaw
    sc(0.88, 0.16), // jaw hinge
    sc(0.84, 0.14), // throat
    sc(0.78, 0.18), // upper neck
    sc(0.70, 0.20), // mid neck
    sc(0.62, 0.22), // lower neck
    sc(0.56, 0.28), // chest
    sc(0.52, 0.36), // belly front

    // Front leg (longer)
    sc(0.50, 0.42),
    sc(0.48, 0.58),
    sc(0.50, 0.72),
    sc(0.52, 0.86),
    sc(0.46, 0.92),
    sc(0.38, 0.92),
    sc(0.40, 0.86),
    sc(0.40, 0.72),
    sc(0.42, 0.60),

    sc(0.44, 0.46), // belly mid
    sc(0.40, 0.42), // belly back
    sc(0.32, 0.38), // tail base

    // Back leg
    sc(0.30, 0.48),
    sc(0.28, 0.62),
    sc(0.30, 0.76),
    sc(0.32, 0.88),
    sc(0.26, 0.92),
    sc(0.18, 0.92),
    sc(0.20, 0.86),
    sc(0.22, 0.74),
    sc(0.24, 0.60),

    sc(0.20, 0.40), // tail base up

    sc(0.08, 0.38), // tail
    sc(0.02, 0.36), // tail tip
    sc(0.04, 0.32), // tail top

    sc(0.16, 0.28), // rump
    sc(0.24, 0.22), // back
    sc(0.34, 0.18), // mid back
    sc(0.44, 0.14), // shoulder
    sc(0.52, 0.12), // lower neck back
    sc(0.60, 0.10), // mid neck back
    sc(0.70, 0.08), // upper neck back
    sc(0.78, 0.06), // head back
  ], true);

  // Eye
  drawPoly(ctx, [sc(0.90, 0.08), sc(0.93, 0.08)]);
}

/* ─── PTERODACTYL ─── */
function drawPtera(ctx, w, h) {
  const s = Math.min(w, h) * 0.85;
  const ox = (w - s) / 2, oy = (h - s) / 2 + s * 0.02;
  const sc = (x, y) => [ox + x * s, oy + y * s];
  setup(ctx);

  // Body + wings (top-down flying view)
  drawPoly(ctx, [
    sc(0.50, 0.04), // head crest top
    sc(0.60, 0.08), // beak top
    sc(0.72, 0.06), // beak tip
    sc(0.60, 0.14), // beak bottom
    sc(0.54, 0.14), // head base
    sc(0.56, 0.20), // neck

    // Right wing
    sc(0.64, 0.18),
    sc(0.78, 0.14),
    sc(0.90, 0.08),
    sc(0.96, 0.10),
    sc(0.92, 0.14),
    sc(0.82, 0.20),
    sc(0.72, 0.28),
    sc(0.64, 0.30),

    sc(0.60, 0.28), // body right
    sc(0.58, 0.32), // tail
    sc(0.56, 0.36), // tail tip
    sc(0.54, 0.32), // tail other side
    sc(0.52, 0.28), // body left

    // Left wing
    sc(0.48, 0.30),
    sc(0.38, 0.28),
    sc(0.28, 0.20),
    sc(0.18, 0.14),
    sc(0.14, 0.10),
    sc(0.18, 0.08),
    sc(0.26, 0.14),
    sc(0.36, 0.18),
    sc(0.46, 0.20),

    sc(0.46, 0.14), // neck left
    sc(0.44, 0.10), // head left
  ], true);

  // Wing membrane lines (right)
  drawPoly(ctx, [sc(0.60, 0.20), sc(0.85, 0.12)]);
  drawPoly(ctx, [sc(0.60, 0.22), sc(0.75, 0.18)]);

  // Wing membrane lines (left)
  drawPoly(ctx, [sc(0.48, 0.20), sc(0.25, 0.12)]);
  drawPoly(ctx, [sc(0.48, 0.22), sc(0.35, 0.18)]);

  // Eye
  drawPoly(ctx, [sc(0.52, 0.08), sc(0.55, 0.08)]);
}
