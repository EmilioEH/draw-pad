/*
 * Tiny WebAudio noisemaker. No audio files to download, so it stays offline
 * and adds nothing to load time.
 *
 * Browsers refuse to start audio until the user has interacted, so init() is
 * called from the first pointerdown rather than at load.
 *
 * Every note goes through a lowpass and a stereo panner. That is the whole
 * difference between a test tone and something that sounds made on purpose:
 * two oscillators a few cents apart instead of one, a filter that opens with
 * the size of the brush, a tail that decays instead of stopping, and the sound
 * arriving from the side of the screen she is drawing on.
 */
const Sound = {
  ctx: null,
  muted: false,
  _master: null,
  _width: 1,          // canvas width in CSS px, for panning

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this._master = this.ctx.createGain();
    this._master.gain.value = 0.22;   // gentle: this is played near a child's face
    this._master.connect(this.ctx.destination);
  },

  setMuted(m) {
    this.muted = m;
    if (this._master) this._master.gain.value = m ? 0 : 0.22;
  },

  /* Where the canvas is, so a note can be placed across the stereo field. */
  setStage(width) { this._width = width || 1; },

  /*
   * One shaped note.
   *
   *   detune   cents between the two oscillators; a little makes it warm
   *   cutoff   lowpass corner, so small brushes sound smaller
   *   pan      -1..1, or pass panX in CSS pixels to place it on the canvas
   */
  note(freq, {
    dur = 0.18, type = 'sine', slideTo = null, delay = 0, gain = 1,
    detune = 6, cutoff = 4200, pan = 0, panX = null, tail = 0.7,
  } = {}) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;

    const env = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.max(200, cutoff), t0);
    // Close the filter as the note falls away: bright at the attack, soft at
    // the end, which is how a struck thing actually behaves.
    filter.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.35), t0 + dur);
    filter.Q.value = 0.7;

    const oscs = [];
    for (const cents of (detune ? [-detune, detune] : [0])) {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.detune.value = cents;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      osc.connect(filter);
      oscs.push(osc);
    }

    // Soft attack, then a decay tail that runs past the note rather than
    // stopping dead — a hard edge sounds like a click.
    const peak = gain / (detune ? 2 : 1);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * (1 + tail));

    filter.connect(env);

    let out = env;
    if (this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      const p = panX === null ? pan : (panX / this._width) * 2 - 1;
      panner.pan.value = Math.max(-0.8, Math.min(0.8, p || 0));
      env.connect(panner);
      out = panner;
    }
    out.connect(this._master);

    const stop = t0 + dur * (1 + tail) + 0.02;
    for (const osc of oscs) { osc.start(t0); osc.stop(stop); }
  },

  /* A pentatonic scale: any combination of these sounds pleasant. */
  _scale: [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5],

  /* Bigger brush, darker note; and it comes from where she touched. */
  strokeStart(i, x, size) {
    const s = size || 18;
    this.note(this._scale[i % this._scale.length] * (s > 24 ? 0.5 : s > 12 ? 0.75 : 1), {
      dur: 0.16, type: 'triangle', gain: 0.5, panX: x,
      cutoff: 1200 + 2600 * Math.min(1, 20 / s), tail: 1.2,
    });
  },
  strokeEnd() {},
  stamp(x) {
    this.note(880, { dur: 0.1, type: 'sine', gain: 0.6, panX: x, cutoff: 5000 });
    this.note(1318.5, { dur: 0.16, type: 'sine', delay: 0.05, gain: 0.4, panX: x, cutoff: 6000 });
  },
  fill(x) {
    this.note(300, { dur: 0.28, type: 'sine', slideTo: 720, gain: 0.6, panX: x, cutoff: 2400 });
  },
  pick() {
    this.note(700, { dur: 0.07, type: 'triangle', gain: 0.3, cutoff: 3800, tail: 0.4 });
  },
  brush(i) {
    // A short two-note flourish, rising with the position in the brush row.
    this.note(this._scale[i % this._scale.length], { dur: 0.09, type: 'triangle', gain: 0.35 });
    this.note(this._scale[(i + 2) % this._scale.length] * 2, {
      dur: 0.13, type: 'sine', delay: 0.055, gain: 0.22, cutoff: 5200 });
  },
  undo() {
    this.note(600, { dur: 0.16, type: 'triangle', slideTo: 330, gain: 0.4, cutoff: 2200 });
  },
  clear() {
    this.note(500, { dur: 0.4, type: 'sine', slideTo: 160, gain: 0.5, cutoff: 1800, tail: 1 });
  },
  celebrate() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.note(f, {
        dur: 0.32, type: 'triangle', delay: i * 0.1, gain: 0.6,
        pan: -0.5 + i * 0.33, cutoff: 5000, tail: 1.4,
      });
    });
  },
};
