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
  // A child tracing this needs a line they can clearly see.
  ctx.strokeStyle = 'rgba(70,70,70,0.75)';
  ctx.fillStyle = 'rgba(160,160,160,0.15)';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

function drawSmooth(ctx, pts, close) {
  const n = pts.length;
  if (n < 2) return;
  const tension = 3;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < (close ? n : n - 1); i++) {
    const p0 = pts[close ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[close ? (i + 2) % n : Math.min(n - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / tension;
    const cp1y = p1[1] + (p2[1] - p0[1]) / tension;
    const cp2x = p2[0] - (p3[0] - p1[0]) / tension;
    const cp2y = p2[1] - (p3[1] - p1[1]) / tension;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1]);
  }
  if (close) ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/* Straight-edged shape, for horns, spikes and teeth. */
function poly(ctx, pts, close = true) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/* A filled circle, for eyes. */
function dot(ctx, p, r) {
  ctx.beginPath();
  ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
  ctx.save();
  ctx.fillStyle = 'rgba(70,70,70,0.75)';
  ctx.fill();
  ctx.restore();
}

/*
 * `s` is the stencil's scale in CSS pixels, the same value sc() uses.
 * Deriving the radius from ctx.canvas.width instead would use the device-pixel
 * backing store, doubling these on any retina screen.
 */
function drawArc(ctx, sc, cx, cy, radius, s) {
  const [px, py] = sc(cx, cy);
  const r = radius * s;
  ctx.beginPath();
  ctx.arc(px, py, r, Math.PI, 0, false);
  ctx.fill();
  ctx.stroke();
}

/* ─── T-REX ─── */
/*
 * Each animal is built from a few separate closed shapes (body, legs, head)
 * rather than one long self-intersecting outline. It is far easier to keep a
 * recognisable silhouette that way, and legs stop tangling into the body.
 */
function drawTrex(ctx, w, h) {
  const s = Math.min(w, h) * 0.85;
  const ox = (w - s) / 2, oy = (h - s) / 2;
  const sc = (x, y) => [ox + x * s, oy + y * s];
  setup(ctx);

  // Far leg first, so the near leg reads as in front of it.
  drawSmooth(ctx, [
    sc(0.29, 0.48), sc(0.43, 0.50), sc(0.45, 0.61), sc(0.41, 0.69),
    sc(0.43, 0.80), sc(0.49, 0.87), sc(0.37, 0.88), sc(0.33, 0.80),
    sc(0.33, 0.67), sc(0.27, 0.58),
  ], true);

  // Torso, neck, head and tail.
  drawSmooth(ctx, [
    sc(0.99, 0.26), sc(0.93, 0.19), sc(0.84, 0.16), sc(0.76, 0.19),
    sc(0.69, 0.26), sc(0.60, 0.31), sc(0.48, 0.33), sc(0.36, 0.36),
    sc(0.27, 0.39), sc(0.17, 0.40), sc(0.08, 0.38), sc(0.01, 0.35),
    sc(0.07, 0.43), sc(0.17, 0.47), sc(0.27, 0.52), sc(0.37, 0.57),
    sc(0.48, 0.59), sc(0.57, 0.56), sc(0.64, 0.50), sc(0.70, 0.42),
    sc(0.77, 0.35), sc(0.86, 0.32), sc(0.94, 0.30),
  ], true);

  // Near leg, over the body.
  drawSmooth(ctx, [
    sc(0.43, 0.48), sc(0.57, 0.50), sc(0.59, 0.61), sc(0.55, 0.69),
    sc(0.57, 0.80), sc(0.63, 0.87), sc(0.51, 0.88), sc(0.47, 0.80),
    sc(0.47, 0.67), sc(0.41, 0.58),
  ], true);

  // Jaw and a couple of teeth.
  drawSmooth(ctx, [sc(0.98, 0.275), sc(0.91, 0.285), sc(0.84, 0.285), sc(0.78, 0.28)], false);
  poly(ctx, [sc(0.94, 0.29), sc(0.925, 0.325), sc(0.91, 0.29)]);
  poly(ctx, [sc(0.88, 0.29), sc(0.865, 0.325), sc(0.85, 0.29)]);

  // Little arm, kept inside the chest outline so the curves don't cross.
  drawSmooth(ctx, [
    sc(0.585, 0.43), sc(0.625, 0.45), sc(0.645, 0.50),
    sc(0.625, 0.525), sc(0.60, 0.50), sc(0.575, 0.46),
  ], true);

  dot(ctx, sc(0.865, 0.225), s * 0.018);
}

/* ─── STEGOSAURUS ─── */
function drawStego(ctx, w, h) {
  const s = Math.min(w, h) * 0.85;
  const ox = (w - s) / 2, oy = (h - s) / 2;
  const sc = (x, y) => [ox + x * s, oy + y * s];
  setup(ctx);

  drawSmooth(ctx, [
    sc(0.72, 0.14),
    sc(0.78, 0.16),
    sc(0.76, 0.22),
    sc(0.66, 0.28),
    sc(0.56, 0.38),
    sc(0.46, 0.50),
    sc(0.36, 0.56),
    sc(0.24, 0.54),
    sc(0.14, 0.50),
    sc(0.06, 0.46),
    sc(0.10, 0.40),
    sc(0.22, 0.36),
    sc(0.34, 0.30),
    sc(0.46, 0.24),
    sc(0.58, 0.18),
    sc(0.68, 0.14),
  ], true);

  drawSmooth(ctx, [
    sc(0.48, 0.52),
    sc(0.50, 0.68),
    sc(0.54, 0.86),
    sc(0.58, 0.94),
    sc(0.48, 0.94),
    sc(0.44, 0.84),
    sc(0.42, 0.68),
  ]);

  drawSmooth(ctx, [
    sc(0.34, 0.54),
    sc(0.32, 0.70),
    sc(0.36, 0.86),
    sc(0.40, 0.94),
    sc(0.30, 0.94),
    sc(0.26, 0.84),
    sc(0.24, 0.70),
  ]);

  drawArc(ctx, sc, 0.54, 0.20, 0.04, s);
  drawArc(ctx, sc, 0.46, 0.24, 0.05, s);
  drawArc(ctx, sc, 0.38, 0.28, 0.055, s);
  drawArc(ctx, sc, 0.30, 0.32, 0.05, s);
  drawArc(ctx, sc, 0.22, 0.36, 0.04, s);

  drawSmooth(ctx, [sc(0.06, 0.46), sc(0.02, 0.38), sc(0.10, 0.40)]);
  drawSmooth(ctx, [sc(0.06, 0.46), sc(0.00, 0.44), sc(0.08, 0.42)]);

  drawSmooth(ctx, [sc(0.74, 0.16), sc(0.76, 0.16)]);
}

/* ─── TRICERATOPS ─── */
function drawTrike(ctx, w, h) {
  const s = Math.min(w, h) * 0.85;
  const ox = (w - s) / 2, oy = (h - s) / 2;
  const sc = (x, y) => [ox + x * s, oy + y * s];
  setup(ctx);

  // Far pair of legs: shorter and set back, so they read as the far side.
  drawSmooth(ctx, [
    sc(0.10, 0.60), sc(0.19, 0.60), sc(0.20, 0.70), sc(0.21, 0.80),
    sc(0.14, 0.81), sc(0.11, 0.70),
  ], true);
  drawSmooth(ctx, [
    sc(0.42, 0.62), sc(0.51, 0.62), sc(0.52, 0.72), sc(0.53, 0.82),
    sc(0.46, 0.83), sc(0.43, 0.72),
  ], true);

  // Body and tail.
  drawSmooth(ctx, [
    sc(0.62, 0.40), sc(0.52, 0.33), sc(0.40, 0.30), sc(0.28, 0.31),
    sc(0.17, 0.36), sc(0.09, 0.44), sc(0.03, 0.53), sc(0.00, 0.60),
    sc(0.06, 0.60), sc(0.12, 0.55), sc(0.18, 0.62), sc(0.30, 0.68),
    sc(0.44, 0.69), sc(0.56, 0.66), sc(0.63, 0.58), sc(0.65, 0.48),
  ], true);

  // Near pair of legs, over the body.
  drawSmooth(ctx, [
    sc(0.25, 0.66), sc(0.36, 0.66), sc(0.37, 0.78), sc(0.39, 0.90),
    sc(0.29, 0.91), sc(0.26, 0.79),
  ], true);
  drawSmooth(ctx, [
    sc(0.55, 0.65), sc(0.66, 0.65), sc(0.66, 0.77), sc(0.68, 0.89),
    sc(0.58, 0.90), sc(0.55, 0.78),
  ], true);

  // Head: a big frill at the back, beak at the front.
  drawSmooth(ctx, [
    sc(0.60, 0.32), sc(0.67, 0.22), sc(0.78, 0.19), sc(0.86, 0.23),
    sc(0.90, 0.31), sc(0.96, 0.38), sc(1.00, 0.45), sc(0.94, 0.50),
    sc(0.87, 0.52), sc(0.79, 0.57), sc(0.70, 0.60), sc(0.62, 0.55),
    sc(0.58, 0.44),
  ], true);

  // Where the frill meets the face — runs down the head, not across it.
  drawSmooth(ctx, [sc(0.715, 0.225), sc(0.745, 0.34), sc(0.75, 0.46), sc(0.73, 0.585)], false);

  // Two brow horns and a nose horn.
  poly(ctx, [sc(0.785, 0.275), sc(0.82, 0.09), sc(0.845, 0.295)]);
  poly(ctx, [sc(0.86, 0.30), sc(0.90, 0.13), sc(0.918, 0.335)]);
  poly(ctx, [sc(0.905, 0.325), sc(0.965, 0.255), sc(0.945, 0.375)]);

  dot(ctx, sc(0.855, 0.395), s * 0.018);
}

/* ─── BRACHIOSAURUS ─── */
function drawBrachio(ctx, w, h) {
  const s = Math.min(w, h) * 0.85;
  const ox = (w - s) / 2, oy = (h - s) / 2;
  const sc = (x, y) => [ox + x * s, oy + y * s];
  setup(ctx);

  drawSmooth(ctx, [
    sc(0.76, 0.02),
    sc(0.88, 0.06),
    sc(0.94, 0.12),
    sc(0.88, 0.16),
    sc(0.78, 0.14),
    sc(0.68, 0.18),
    sc(0.58, 0.24),
    sc(0.50, 0.34),
    sc(0.46, 0.46),
    sc(0.44, 0.58),
    sc(0.46, 0.74),
    sc(0.50, 0.90),
    sc(0.42, 0.94),
    sc(0.34, 0.94),
    sc(0.36, 0.78),
    sc(0.38, 0.62),
    sc(0.36, 0.48),
    sc(0.30, 0.46),
    sc(0.28, 0.62),
    sc(0.30, 0.80),
    sc(0.22, 0.94),
    sc(0.14, 0.94),
    sc(0.16, 0.78),
    sc(0.18, 0.62),
    sc(0.20, 0.48),
    sc(0.14, 0.40),
    sc(0.06, 0.36),
    sc(0.02, 0.34),
    sc(0.06, 0.30),
    sc(0.18, 0.28),
    sc(0.32, 0.26),
    sc(0.46, 0.22),
    sc(0.58, 0.18),
    sc(0.68, 0.14),
    sc(0.74, 0.08),
  ], true);

  drawSmooth(ctx, [sc(0.86, 0.08), sc(0.88, 0.08)]);
}

/* ─── PTERODACTYL ─── */
function drawPtera(ctx, w, h) {
  const s = Math.min(w, h) * 0.85;
  const ox = (w - s) / 2, oy = (h - s) / 2;
  const sc = (x, y) => [ox + x * s, oy + y * s];
  setup(ctx);

  drawSmooth(ctx, [
    sc(0.50, 0.02),
    sc(0.56, 0.04),
    sc(0.66, 0.06),
    sc(0.74, 0.04),
    sc(0.64, 0.12),
    sc(0.54, 0.16),
    sc(0.52, 0.22),
    sc(0.58, 0.18),
    sc(0.72, 0.10),
    sc(0.86, 0.04),
    sc(0.96, 0.04),
    sc(0.86, 0.12),
    sc(0.72, 0.22),
    sc(0.60, 0.28),
    sc(0.54, 0.26),
    sc(0.52, 0.32),
    sc(0.50, 0.36),
    sc(0.48, 0.32),
    sc(0.46, 0.26),
    sc(0.40, 0.28),
    sc(0.28, 0.22),
    sc(0.14, 0.12),
    sc(0.04, 0.04),
    sc(0.14, 0.04),
    sc(0.28, 0.10),
    sc(0.42, 0.18),
    sc(0.48, 0.22),
    sc(0.48, 0.16),
    sc(0.46, 0.10),
  ], true);

  drawSmooth(ctx, [sc(0.58, 0.20), sc(0.82, 0.10)]);
  drawSmooth(ctx, [sc(0.46, 0.20), sc(0.22, 0.10)]);
  drawSmooth(ctx, [sc(0.52, 0.08), sc(0.55, 0.08)]);
}
