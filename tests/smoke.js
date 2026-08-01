/*
 * Canvas smoke tests.
 *
 * These exist because every bug they cover shipped and was invisible to code
 * review: an unawaited image decode, shared stroke state across pointers, a
 * bitmap reset on resize, and a radius computed in device pixels. All of them
 * reproduce in under a second in a real browser.
 *
 *   node tests/smoke.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8123;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

const serve = () => new Promise(res => {
  const server = http.createServer((req, rq) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
    fs.readFile(file, (err, data) => {
      if (err) { rq.writeHead(404); rq.end('not found'); return; }
      rq.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      rq.end(data);
    });
  }).listen(PORT, () => res(server));
});

// Count non-transparent pixels on the drawing canvas.
const painted = page => page.evaluate(() => {
  const c = document.getElementById('drawCanvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++;
  return n;
});

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
  });

  const open = async (opts = {}) => {
    const page = await browser.newPage({
      viewport: { width: 420, height: 800 }, ...opts,
    });
    page.on('pageerror', e => check('no page errors', false, e.message));
    await page.goto(`http://localhost:${PORT}/index.html`);
    await page.waitForTimeout(300);
    return page;
  };

  const stroke = async (page, y) => {
    await page.mouse.move(80, y);
    await page.mouse.down();
    await page.mouse.move(300, y + 40, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(120);
  };

  console.log('\ndraw-pad smoke tests\n');

  /* Undo removes exactly one stroke and keeps the rest. */
  {
    const p = await open();
    await stroke(p, 100);
    const one = await painted(p);
    await stroke(p, 250);
    const two = await painted(p);
    await p.click('#undoBtn');
    await p.waitForTimeout(200);
    const back = await painted(p);
    check('undo removes one stroke, keeps the other',
      back > one * 0.8 && back < two * 0.8, `1=${one} 2=${two} undo=${back}`);
    await p.close();
  }

  /* Undo down to empty, then no further damage. */
  {
    const p = await open();
    await stroke(p, 100);
    await p.click('#undoBtn');
    await p.waitForTimeout(200);
    const empty = await painted(p);
    await p.click('#undoBtn');
    await p.waitForTimeout(150);
    check('undo to empty is safe', empty === 0 && (await painted(p)) === 0, `empty=${empty}`);
    await p.close();
  }

  /* Two fingers make two separate strokes, not one zigzag. */
  {
    const p = await open();
    await p.evaluate(() => {
      const c = document.getElementById('drawCanvas');
      const ev = (t, id, x, y) => c.dispatchEvent(new PointerEvent(t, {
        pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch' }));
      ev('pointerdown', 1, 60, 60); ev('pointerdown', 2, 340, 60);
      for (let i = 0; i <= 10; i++) { ev('pointermove', 1, 60, 60 + i * 25); ev('pointermove', 2, 340, 60 + i * 25); }
      ev('pointerup', 1, 60, 310); ev('pointerup', 2, 340, 310);
    });
    await p.waitForTimeout(200);
    // Two thin vertical lines leave the middle of the canvas untouched.
    const midEmpty = await p.evaluate(() => {
      const c = document.getElementById('drawCanvas');
      const dpr = c.width / c.getBoundingClientRect().width;
      const d = c.getContext('2d').getImageData(150 * dpr, 60 * dpr, 100 * dpr, 240 * dpr).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++;
      return n;
    });
    check('two pointers draw two separate strokes', midEmpty === 0,
      `${midEmpty} px painted between the two fingers (zigzag)`);
    await p.close();
  }

  /* Resize preserves the drawing. */
  {
    const p = await open();
    await stroke(p, 100);
    await stroke(p, 250);
    const before = await painted(p);
    await p.setViewportSize({ width: 420, height: 700 });
    await p.waitForTimeout(400);
    const after = await painted(p);
    check('drawing survives a resize', after > before * 0.5, `${before} -> ${after}`);
    await p.close();
  }

  /* The highlighted swatch is the colour actually drawn. */
  {
    const p = await open();
    await stroke(p, 150);
    const r = await p.evaluate(() => {
      const swatch = document.querySelector('.c-btn.on').dataset.color;
      const c = document.getElementById('drawCanvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 255) return { swatch, drawn: [d[i], d[i + 1], d[i + 2]] };
      }
      return { swatch, drawn: null };
    });
    // Allow a couple of units per channel: alpha premultiplication rounds.
    const want = [1, 3, 5].map(i => parseInt(r.swatch.slice(i, i + 2), 16));
    const close = r.drawn && want.every((v, i) => Math.abs(v - r.drawn[i]) <= 2);
    check('selected swatch matches the colour drawn', close,
      `swatch=${r.swatch} drawn=rgb(${r.drawn})`);
    await p.close();
  }

  /* A stroke continues when the finger strays off the canvas and returns. */
  {
    const p = await open();
    await p.mouse.move(200, 100);
    await p.mouse.down();
    await p.mouse.move(200, 300, { steps: 8 });
    const mid = await painted(p);
    await p.mouse.move(200, 700, { steps: 8 });   // over the toolbar
    await p.mouse.move(320, 300, { steps: 8 });   // back onto the canvas
    await p.mouse.up();
    await p.waitForTimeout(200);
    check('stroke survives straying off the canvas', (await painted(p)) > mid * 1.2);
    await p.close();
  }

  /* A single tap leaves a dot. */
  {
    const p = await open();
    await p.mouse.click(200, 200);
    await p.waitForTimeout(200);
    check('a single tap leaves a mark', (await painted(p)) > 0);
    await p.close();
  }

  /* Sparkles fade instead of staining the artwork. */
  {
    const p = await open();
    await p.click('.tool-btn[data-toggle="magic"]');
    await stroke(p, 150);
    const justAfter = await painted(p);
    await p.waitForTimeout(2000);
    const later = await painted(p);
    check('sparkles do not stain the drawing', later <= justAfter,
      `${justAfter} -> ${later}`);
    await p.close();
  }

  /* The drawing is still there after a reload. */
  {
    const p = await open();
    await p.evaluate(() => localStorage.clear());
    await stroke(p, 150);
    const before = await painted(p);
    await p.waitForTimeout(600);   // let autosave debounce fire
    await p.reload();
    await p.waitForTimeout(500);
    const after = await painted(p);
    check('drawing is restored after a reload', after > before * 0.8, `${before} -> ${after}`);
    await p.evaluate(() => localStorage.clear());
    await p.close();
  }

  /* A tap on the bin does not wipe the page; a long hold does, undoably. */
  {
    const p = await open();
    await p.evaluate(() => localStorage.clear());
    await stroke(p, 150);
    const before = await painted(p);
    await p.click('#clearBtn');
    await p.waitForTimeout(200);
    const afterTap = await painted(p);
    check('a quick tap does not clear the drawing', afterTap === before,
      `${before} -> ${afterTap}`);

    const box = await p.locator('#clearBtn').boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down();
    await p.waitForTimeout(1600);
    await p.mouse.up();
    await p.waitForTimeout(200);
    const afterHold = await painted(p);
    check('press and hold clears the drawing', afterHold === 0, `${afterHold} px left`);

    await p.click('#undoBtn');
    await p.waitForTimeout(250);
    check('clear can be undone', (await painted(p)) > before * 0.8);
    await p.evaluate(() => localStorage.clear());
    await p.close();
  }

  /* Stencil geometry must not depend on devicePixelRatio. */
  {
    const measure = async dpr => {
      const p = await open({ deviceScaleFactor: dpr });
      await p.click('#dinosBtn');
      await p.click('.picker-cell[data-stencil="stego"]');
      await p.waitForTimeout(300);
      const box = await p.evaluate(() => {
        const c = document.getElementById('stencilCanvas');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const scale = c.width / c.getBoundingClientRect().width;
        let top = Infinity, bottom = -1;
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            if (d[(y * c.width + x) * 4 + 3] > 10) { if (y < top) top = y; if (y > bottom) bottom = y; break; }
          }
        }
        return { top: top / scale, bottom: bottom / scale };   // CSS pixels
      });
      await p.close();
      return box;
    };
    const a = await measure(1);
    const b = await measure(2);
    const drift = Math.abs((a.bottom - a.top) - (b.bottom - b.top));
    check('stencil renders identically at dpr 1 and 2', drift < 4,
      `height ${(a.bottom - a.top).toFixed(1)} vs ${(b.bottom - b.top).toFixed(1)} css px`);
  }

  /* Tap-to-fill stays inside the stencil outline. */
  {
    const p = await open();
    await p.click('#dinosBtn');
    await p.click('.picker-cell[data-stencil="trex"]');
    await p.waitForTimeout(300);
    await p.click('.tool-btn[data-mode="fill"]');
    await p.click('.c-btn[data-color="#34c759"]');
    const g = await p.evaluate(() => {
      const r = document.getElementById('canvasWrap').getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    await p.mouse.click(g.w * 0.42, g.h * 0.47);   // inside the body
    await p.waitForTimeout(500);
    const frac = await p.evaluate(() => {
      const c = document.getElementById('drawCanvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++;
      return n / (c.width * c.height);
    });
    check('fill is bounded by the stencil outline', frac > 0.01 && frac < 0.35,
      `filled ${(frac * 100).toFixed(1)}% of the canvas`);

    await p.click('#undoBtn');
    await p.waitForTimeout(300);
    check('a fill can be undone', (await painted(p)) === 0);
    await p.evaluate(() => localStorage.clear());
    await p.close();
  }

  /* The rainbow brush actually varies hue along the stroke. */
  {
    const p = await open();
    await p.click('.c-btn[data-color="rainbow"]');
    await p.mouse.move(60, 150);
    await p.mouse.down();
    for (let i = 0; i < 30; i++) await p.mouse.move(60 + i * 9, 150 + Math.sin(i / 4) * 50);
    await p.mouse.up();
    await p.waitForTimeout(250);
    const hues = await p.evaluate(() => {
      const c = document.getElementById('drawCanvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const set = new Set();
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 255) set.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
      }
      return set.size;
    });
    check('rainbow brush varies colour along the stroke', hues > 10, `${hues} distinct colours`);
    await p.evaluate(() => localStorage.clear());
    await p.close();
  }

  /* Finishing a stencil celebrates, once, on the effects layer only. */
  {
    const p = await open();
    await p.click('#dinosBtn');
    await p.click('.picker-cell[data-stencil="trex"]');
    await p.waitForTimeout(300);
    const before = await p.evaluate(() => window.drawPad.coverage());
    await p.evaluate(() => window.drawPad.confetti());
    await p.waitForTimeout(150);
    const fx = await p.evaluate(() => {
      const c = document.getElementById('fxCanvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++;
      return n;
    });
    check('confetti draws on the effects layer', before === 0 && fx > 0, `coverage=${before} fx=${fx}`);
    await p.waitForTimeout(2600);
    const after = await p.evaluate(() => {
      const c = document.getElementById('fxCanvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++;
      return n;
    });
    check('confetti clears and never touches the artwork',
      after === 0 && (await painted(p)) === 0, `fx left=${after}`);
    await p.evaluate(() => localStorage.clear());
    await p.close();
  }

  /* Tracing the outline triggers the celebration exactly once. */
  {
    const p = await open();
    await p.click('#dinosBtn');
    await p.click('.picker-cell[data-stencil="trex"]');
    await p.waitForTimeout(300);
    await p.click('.size-btn[data-size="34"]');
    const g = await p.evaluate(() => {
      const r = document.getElementById('canvasWrap').getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    for (let y = 20; y < g.h - 20; y += 16) {
      await p.mouse.move(10, y);
      await p.mouse.down();
      await p.mouse.move(g.w - 10, y, { steps: 3 });
      await p.mouse.up();
    }
    await p.waitForTimeout(200);
    const st = await p.evaluate(() => ({
      cov: window.drawPad.coverage(),
      celebrated: window.drawPad._celebrated,
    }));
    check('covering the outline fires the celebration once',
      st.cov > 0.55 && st.celebrated === 'trex', JSON.stringify(st));
    await p.evaluate(() => localStorage.clear());
    await p.close();
  }

  /* The picture can be exported for a grown-up to keep. */
  {
    const p = await open();
    await stroke(p, 150);
    const size = await p.evaluate(async () => {
      const blob = await window.drawPad.toBlob();
      return blob ? blob.size : 0;
    });
    check('the drawing exports as a PNG', size > 1000, `${size} bytes`);
    await p.evaluate(() => localStorage.clear());
    await p.close();
  }

  /* Age-appropriate layout budget: canvas dominates, nothing to read,
     nothing tiny, and no row wraps into a second line. */
  {
    for (const vp of [{ width: 420, height: 800 }, { width: 390, height: 664 },
                      { width: 360, height: 640 }, { width: 768, height: 1024 }]) {
      const p = await open({ viewport: vp });
      const m = await p.evaluate(() => {
        const cw = document.getElementById('canvasWrap').getBoundingClientRect();
        const vis = [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null);
        // offsetTop, not getBoundingClientRect: the selected swatch is scaled
        // up, which shifts its visual box without wrapping the row.
        const lines = ['#colors', '#tools'].map(sel =>
          new Set([...document.querySelector(sel).children].map(k => k.offsetTop)).size);
        return {
          canvasPct: Math.round(cw.height / innerHeight * 100),
          buttons: vis.length,
          withText: vis.filter(b => /[A-Za-z]{2,}/.test(b.textContent)).length,
          tinyTools: vis.filter(b => !b.classList.contains('c-btn'))
            .filter(b => Math.min(b.getBoundingClientRect().width,
                                  b.getBoundingClientRect().height) < 44).length,
          lines,
        };
      });
      check(`layout at ${vp.width}x${vp.height}: canvas ${m.canvasPct}%, ${m.buttons} buttons, ${m.withText} with text`,
        m.canvasPct >= 78 && m.withText === 0 && m.tinyTools === 0 && m.buttons <= 22
          && m.lines.every(l => l === 1),
        JSON.stringify(m));
      await p.close();
    }
  }

  await browser.close();
  server.close();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
