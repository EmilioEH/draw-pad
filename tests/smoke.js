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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

/*
 * `npm install` fetches the playwright library but not its browser binaries,
 * so launching can fail on a clean checkout. Try playwright's own browser
 * first, then any Chrome/Chromium already on the machine, and only then give
 * up — with an instruction rather than a stack trace.
 */
async function launchBrowser() {
  const candidates = [];
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);

  const pwRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (pwRoot && fs.existsSync(pwRoot)) {
    for (const dir of fs.readdirSync(pwRoot).filter(d => d.startsWith('chromium-'))) {
      candidates.push(
        path.join(pwRoot, dir, 'chrome-linux', 'chrome'),
        path.join(pwRoot, dir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      );
    }
  }
  candidates.push(
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  );

  // Playwright's bundled browser, if `npx playwright install` has been run.
  try {
    return await chromium.launch();
  } catch (_) { /* fall through to whatever is on the machine */ }

  for (const exe of candidates) {
    if (!exe || !fs.existsSync(exe)) continue;
    try {
      return await chromium.launch({ executablePath: exe });
    } catch (_) { /* try the next one */ }
  }

  console.error('\nCould not start a browser for the smoke tests.');
  console.error('Install one with:\n\n    npx playwright install chromium\n');
  console.error('or point CHROME_PATH at an existing Chrome/Chromium binary.\n');
  process.exit(1);
}

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

// Port 0 lets the OS pick a free port, so a busy port can't fail the run.
const serve = () => new Promise(res => {
  const server = http.createServer((req, rq) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
    fs.readFile(file, (err, data) => {
      if (err) { rq.writeHead(404); rq.end('not found'); return; }
      rq.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      rq.end(data);
    });
  }).listen(0, () => res(server));
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
  const PORT = server.address().port;
  const browser = await launchBrowser();

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

  /*
   * Fill has to treat the child's own lines as walls, including while an
   * outline is showing. Compositing the outline into the scratch copy used to
   * clear the artwork out of it first, so drawing a box and colouring it in
   * flooded almost the whole page.
   */
  {
    const p = await open();
    await p.click('#dinosBtn');
    await p.click('.picker-cell[data-stencil="trex"]');
    await p.waitForTimeout(300);

    // A closed box, drawn as one stroke.
    const box = [[90, 150], [300, 150], [300, 330], [90, 330], [90, 150]];
    await p.mouse.move(...box[0]);
    await p.mouse.down();
    for (const [x, y] of box.slice(1)) await p.mouse.move(x, y, { steps: 12 });
    await p.mouse.up();
    await p.waitForTimeout(150);

    await p.click('.tool-btn[data-mode="fill"]');
    await p.click('.c-btn[data-color="#34c759"]');
    await p.mouse.click(195, 240);   // inside her box
    await p.waitForTimeout(400);

    const frac = await p.evaluate(() => {
      const c = document.getElementById('drawCanvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++;
      return n / (c.width * c.height);
    });
    // The box is roughly a sixth of the canvas; a leak covers most of it.
    check('fill stops at her own lines, not just the outline', frac > 0.03 && frac < 0.30,
      `filled ${(frac * 100).toFixed(1)}% of the canvas`);

    /* Tapping a filled patch with another colour recolours it. Filling only
       blank paper meant most repeat taps did nothing at all. */
    await p.click('.c-btn[data-color="#007aff"]');
    await p.mouse.click(195, 240);
    await p.waitForTimeout(400);
    const rgb = await p.evaluate(() => {
      const c = document.getElementById('drawCanvas');
      const dpr = c.width / c.getBoundingClientRect().width;
      const d = c.getContext('2d').getImageData(Math.round(195 * dpr), Math.round(240 * dpr), 1, 1).data;
      return [d[0], d[1], d[2]];
    });
    check('tapping a filled area with a new colour recolours it',
      rgb[2] > 200 && rgb[0] < 60, `rgb(${rgb})`);

    /* A tap that changes nothing must not become an undo press that does
       nothing either: the same colour again, or the printed outline, which is
       a guide to trace rather than something to paint. */
    const ops = await p.evaluate(() => window.drawPad.ops.length);
    await p.mouse.click(195, 240);        // same colour, same region
    await p.waitForTimeout(300);
    const afterRepeat = await p.evaluate(() => window.drawPad.ops.length);

    const onOutline = await p.evaluate(() => {
      // A point on the dinosaur outline with none of her own paint on it.
      const s = document.getElementById('stencilCanvas');
      const a = document.getElementById('drawCanvas');
      const dpr = s.width / s.getBoundingClientRect().width;
      const sd = s.getContext('2d').getImageData(0, 0, s.width, s.height).data;
      const ad = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
      for (let i = 0; i < sd.length / 4; i++) {
        if (sd[i * 4 + 3] > 200 && ad[i * 4 + 3] < 10) {
          return { x: (i % s.width) / dpr, y: Math.floor(i / s.width) / dpr };
        }
      }
      return null;
    });
    await p.mouse.click(onOutline.x, onOutline.y);
    await p.waitForTimeout(300);
    const afterOutline = await p.evaluate(() => window.drawPad.ops.length);

    check('a fill that changes nothing is not recorded',
      afterRepeat === ops && afterOutline === ops,
      `${ops} ops -> ${afterRepeat} after a repeat tap -> ${afterOutline} after tapping the outline`);

    /* Undo replays the history, and re-flooding every earlier fill made each
       press slower than the one before it. */
    const replay = await p.evaluate(() => {
      const d = window.drawPad;
      let floods = 0;
      const orig = d._scratchCtx.getImageData.bind(d._scratchCtx);
      d._scratchCtx.getImageData = (...a) => { floods++; return orig(...a); };
      const at = () => {
        const c = d.canvas;
        const dpr = c.width / c.getBoundingClientRect().width;
        return c.getContext('2d').getImageData(Math.round(195 * dpr), Math.round(240 * dpr), 1, 1).data[2];
      };
      const blue = at();
      d.undo();
      d.redo();
      return { floods, blue, back: at() };
    });
    check('undo does not flood every earlier fill again', replay.floods === 0,
      `${replay.floods} re-floods`);
    check('undo then redo puts the fill back exactly', replay.back === replay.blue,
      `${replay.blue} -> ${replay.back}`);

    await p.evaluate(() => localStorage.clear());
    await p.close();
  }

  /* Picking a sticker must be visible and escapable. Nothing in the toolbar
     showed sticker mode, and no control returned to drawing, so every tap on
     the paper kept producing stickers. */
  {
    const p = await open();
    await p.click('#stampsBtn');
    await p.click('#stampGrid .picker-cell');
    await p.waitForTimeout(150);
    const shown = await p.evaluate(() => ({
      mode: window.drawPad.mode,
      lit: document.getElementById('stampsBtn').classList.contains('active'),
    }));
    check('sticker mode is visible on the toolbar', shown.mode === 'stamp' && shown.lit,
      JSON.stringify(shown));

    await p.click('.c-btn[data-color="#007aff"]');
    const afterColor = await p.evaluate(() => ({
      mode: window.drawPad.mode,
      lit: document.getElementById('stampsBtn').classList.contains('active'),
    }));
    check('a colour tap gets back out of sticker mode',
      afterColor.mode === 'draw' && !afterColor.lit, JSON.stringify(afterColor));

    await p.click('#stampsBtn');
    await p.click('#stampGrid .picker-cell');
    await p.click('.size-btn[data-size="34"]');
    check('a brush size tap gets back out of sticker mode',
      (await p.evaluate(() => window.drawPad.mode)) === 'draw');

    // And the paper agrees: this leaves a line, not a row of stickers.
    await stroke(p, 200);
    check('drawing works again after sticker mode', (await painted(p)) > 0);
    await p.evaluate(() => localStorage.clear());
    await p.close();
  }

  /* Phones fire resize for the URL bar sliding, not only for real resizes.
     Re-rendering the picture for each one froze the app mid-stroke. */
  {
    const p = await open();
    await stroke(p, 150);
    const rebuilds = await p.evaluate(async () => {
      const d = window.drawPad;
      let n = 0;
      const orig = d._rebuildBase.bind(d);
      d._rebuildBase = () => { n++; orig(); };
      for (let i = 0; i < 12; i++) window.dispatchEvent(new Event('resize'));
      await new Promise(r => setTimeout(r, 400));
      return n;
    });
    check('a burst of resize events with no size change rebuilds nothing',
      rebuilds === 0, `${rebuilds} rebuilds`);
    await p.evaluate(() => localStorage.clear());
    await p.close();
  }

  /* Coverage means reading two canvases back off the GPU. Doing it at every
     stroke end was a hitch on every single line. */
  {
    const p = await open();
    await p.click('#dinosBtn');
    await p.click('.picker-cell[data-stencil="trex"]');
    await p.waitForTimeout(300);
    const calls = await p.evaluate(() => {
      const d = window.drawPad;
      let n = 0;
      const orig = d.coverage.bind(d);
      d.coverage = () => { n++; return orig(); };
      for (let i = 0; i < 12; i++) {
        d._commit({ type: 'stroke', color: '#ff3b30', size: 10,
          points: [{ x: 20, y: 20 + i * 4 }, { x: 60, y: 40 + i * 4 }] });
      }
      return n;
    });
    check('the celebration check is throttled, not run per stroke', calls <= 2,
      `${calls} coverage readbacks for 12 strokes`);
    await p.evaluate(() => localStorage.clear());
    await p.close();
  }

  /* Turning the tablet must not slide the outline off the lines drawn on it:
     the outline was laid out in screen space while the artwork lives in its
     own, so the two scaled by different amounts. */
  {
    const p = await open();
    await p.click('#dinosBtn');
    await p.click('.picker-cell[data-stencil="trex"]');
    await p.waitForTimeout(300);
    await stroke(p, 150);   // a drawing exists, so the page keeps its proportions

    const logicalBox = () => p.evaluate(() => {
      const c = document.getElementById('stencilCanvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let top = Infinity, bottom = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (d[(y * c.width + x) * 4 + 3] > 10) { if (y < top) top = y; if (y > bottom) bottom = y; break; }
        }
      }
      // In the artwork's own units, which is where it has to stay put.
      const t = window.drawPad._t();
      const k = t.s * window.drawPad._dpr;
      return { top: top / k, height: (bottom - top) / k };
    });

    const before = await logicalBox();
    await p.setViewportSize({ width: 800, height: 420 });
    await p.waitForTimeout(500);
    const after = await logicalBox();
    check('the outline stays put on the drawing when the tablet is turned',
      Math.abs(before.height - after.height) < 4 && Math.abs(before.top - after.top) < 4,
      `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    await p.evaluate(() => localStorage.clear());
    await p.close();
  }

  /* Two fingers on the bin — how a small child presses a button — must clear
     once and leave the button usable. */
  {
    const p = await open();
    await p.evaluate(() => localStorage.clear());
    await stroke(p, 150);
    const box = await p.locator('#clearBtn').boundingBox();
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cleared = await p.evaluate(async ([x, y]) => {
      const el = document.getElementById('clearBtn');
      let n = 0;
      const orig = window.drawPad.clear.bind(window.drawPad);
      window.drawPad.clear = () => { n++; orig(); };
      const ev = (t, id) => el.dispatchEvent(new PointerEvent(t, {
        pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch' }));
      ev('pointerdown', 11);
      ev('pointerdown', 12);
      await new Promise(r => setTimeout(r, 1500));
      ev('pointerup', 11);
      ev('pointerup', 12);
      await new Promise(r => setTimeout(r, 100));
      return { n, hold: el.style.getPropertyValue('--hold') };
    }, [at.x, at.y]);
    check('a two-finger hold clears once and resets the button',
      cleared.n === 1 && cleared.hold === '0%', JSON.stringify(cleared));
    await p.evaluate(() => localStorage.clear());
    await p.close();
  }

  /* Saves shrank; drawings saved by the old build must still open. */
  {
    const p = await open();
    await p.evaluate(() => localStorage.clear());
    const r = await p.evaluate(() => {
      const d = window.drawPad;
      d.ops = [];
      for (let k = 0; k < 20; k++) {
        const points = [];
        for (let i = 0; i < 200; i++) points.push({ x: i * 1.5, y: k * 7 + i * 0.1 });
        d.ops.push({ type: 'stroke', color: '#ff3b30', size: 10, points });
      }
      const now = JSON.stringify(d.getDoc()).length;
      const old = JSON.stringify({ v: 1, ref: d.ref, ops: d.ops.map(o => ({ ...o,
        points: o.points.map(q => ({ x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 })) })) });
      // An old-format document has to survive the upgrade.
      d.ops = [];
      const loaded = d.loadDoc(JSON.parse(old));
      const pointsBack = d.ops[0] && d.ops[0].points && d.ops[0].points.length;
      // And so does a round trip through the new one.
      const roundTrip = d.loadDoc(JSON.parse(JSON.stringify(d.getDoc())))
        && d.ops.length === 20 && d.ops[19].points.length === 200;
      return { now, old: old.length, loaded, pointsBack, roundTrip };
    });
    check('saves are smaller and old ones still load',
      r.now < r.old * 0.7 && r.loaded && r.pointsBack === 200 && r.roundTrip,
      `${Math.round(r.old / 1024)}KB -> ${Math.round(r.now / 1024)}KB, ${JSON.stringify(r)}`);
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
