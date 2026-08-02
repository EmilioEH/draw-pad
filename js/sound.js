/*
 * Tiny WebAudio noisemaker. No audio files to download, so it stays offline
 * and adds nothing to load time.
 *
 * Browsers refuse to start audio until the user has interacted, so init() is
 * called from the first pointerdown rather than at load.
 */
const Sound = {
  ctx: null,
  muted: false,
  _master: null,

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

  /* One shaped note. */
  note(freq, { dur = 0.18, type = 'sine', slideTo = null, delay = 0, gain = 1 } = {}) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);

    // Soft attack and decay; a hard edge sounds like a click.
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(env);
    env.connect(this._master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  },

  /* A pentatonic scale: any combination of these sounds pleasant. */
  _scale: [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5],

  strokeStart(i) {
    this.note(this._scale[i % this._scale.length], { dur: 0.16, type: 'triangle', gain: 0.5 });
  },
  strokeEnd() {},
  stamp() {
    this.note(880, { dur: 0.12, type: 'sine', gain: 0.6 });
    this.note(1318.5, { dur: 0.18, type: 'sine', delay: 0.05, gain: 0.4 });
  },
  fill() {
    this.note(300, { dur: 0.28, type: 'sine', slideTo: 720, gain: 0.6 });
  },
  pick() {
    this.note(700, { dur: 0.09, type: 'triangle', gain: 0.35 });
  },
  undo() {
    this.note(600, { dur: 0.16, type: 'triangle', slideTo: 330, gain: 0.4 });
  },
  clear() {
    this.note(500, { dur: 0.4, type: 'sine', slideTo: 160, gain: 0.5 });
  },
  celebrate() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.note(f, { dur: 0.35, type: 'triangle', delay: i * 0.1, gain: 0.6 });
    });
  },
};
