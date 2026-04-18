// Beat-synced FX bus. Mirrors DJM-A9 BEAT FX semantics:
//   - One FX active at a time
//   - Target = CH1 / CH2 / MASTER (selects which dry signal feeds the FX)
//   - Beat divisor in [1/16 .. 16] beats, time = (60/bpm) * div
//   - LEVEL knob = wet mix (0..1)
//   - ON / OFF latches the wet output

const DIVS = { '1/16': 1/16, '1/8': 1/8, '1/4': 1/4, '1/2': 1/2, '1': 1, '2': 2, '4': 4, '8': 8, '16': 16 };

export class FxEngine {
  constructor(ctx, bus) {
    this.ctx = ctx;
    this.bus = bus;
    this.bpm = 120;
    this.type = 'echo';
    this.target = 'master';
    this.beatDiv = '1/4';
    this.level = 0.5;
    this.on = false;

    // Per-target sends. We always tap all three; only the active target has gain.
    this.sends = {
      ch1: ctx.createGain(),
      ch2: ctx.createGain(),
      master: ctx.createGain(),
    };
    for (const s of Object.values(this.sends)) s.gain.value = 0;

    bus.channels[0].volume.connect(this.sends.ch1);
    bus.channels[1].volume.connect(this.sends.ch2);
    bus.masterIn.connect(this.sends.master);

    // FX input merges all sends.
    this.fxIn = ctx.createGain();
    this.sends.ch1.connect(this.fxIn);
    this.sends.ch2.connect(this.fxIn);
    this.sends.master.connect(this.fxIn);

    // Wet bus → master out (post master-gain so wet doesn't get attenuated again).
    this.wet = ctx.createGain();
    this.wet.gain.value = 0;
    this.wet.connect(bus.masterOut);

    this.chain = null;
    this._buildChain('echo');
    this._setTarget('master');
  }

  _setTarget(t) {
    this.target = t;
    this.sends.ch1.gain.value = t === 'ch1' && this.on ? 1 : 0;
    this.sends.ch2.gain.value = t === 'ch2' && this.on ? 1 : 0;
    this.sends.master.gain.value = t === 'master' && this.on ? 1 : 0;
  }

  _buildChain(type) {
    if (this.chain) {
      try { this.chain.input.disconnect(); } catch {}
      try { this.chain.output.disconnect(); } catch {}
      this.chain = null;
    }
    const ctx = this.ctx;
    const beatSec = (60 / this.bpm) * DIVS[this.beatDiv];

    let chain;
    switch (type) {
      case 'delay': chain = buildDelay(ctx, beatSec); break;
      case 'echo': chain = buildPingPong(ctx, beatSec); break;
      case 'reverb': chain = buildReverb(ctx); break;
      case 'flanger': chain = buildFlanger(ctx, beatSec); break;
      case 'filter': chain = buildFilter(ctx, beatSec); break;
      case 'trans': chain = buildTrans(ctx, beatSec); break;
      default: chain = buildDelay(ctx, beatSec);
    }
    this.chain = chain;
    // Wire: fxIn -> chain.input ... chain.output -> wet
    this.fxIn.connect(chain.input);
    chain.output.connect(this.wet);
  }

  setBpm(bpm) {
    this.bpm = bpm;
    this._updateTimes();
  }
  setType(t) {
    if (t === this.type) return;
    this.type = t;
    this._buildChain(t);
    this._applyOn();
  }
  setBeatDiv(d) {
    this.beatDiv = d;
    this._updateTimes();
  }
  setLevel(v) {
    this.level = v;
    this._applyLevel();
  }
  setOn(b) {
    this.on = b;
    this._applyOn();
  }
  _applyOn() {
    this._setTarget(this.target);
    this._applyLevel();
  }
  _applyLevel() {
    this.wet.gain.setTargetAtTime(this.on ? this.level : 0, this.ctx.currentTime, 0.02);
  }
  _updateTimes() {
    const beatSec = (60 / this.bpm) * DIVS[this.beatDiv];
    if (this.chain?.setBeat) this.chain.setBeat(beatSec);
  }
}

// ---------- FX chain builders ----------

function buildDelay(ctx, beatSec) {
  const input = ctx.createGain();
  const delay = ctx.createDelay(8);
  delay.delayTime.value = beatSec;
  const fb = ctx.createGain(); fb.gain.value = 0.55;
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 4000;
  const output = ctx.createGain();
  input.connect(delay);
  delay.connect(tone);
  tone.connect(fb);
  fb.connect(delay);
  delay.connect(output);
  return {
    input, output,
    setBeat(t) { delay.delayTime.setTargetAtTime(t, ctx.currentTime, 0.03); },
  };
}

function buildPingPong(ctx, beatSec) {
  const input = ctx.createGain();
  const splitL = ctx.createGain(), splitR = ctx.createGain();
  const dL = ctx.createDelay(8); dL.delayTime.value = beatSec;
  const dR = ctx.createDelay(8); dR.delayTime.value = beatSec;
  const fb = ctx.createGain(); fb.gain.value = 0.6;
  const merger = ctx.createChannelMerger(2);
  const output = ctx.createGain();
  input.connect(dL);
  dL.connect(merger, 0, 0);
  dL.connect(fb);
  fb.connect(dR);
  dR.connect(merger, 0, 1);
  dR.connect(dL);
  merger.connect(output);
  return {
    input, output,
    setBeat(t) {
      dL.delayTime.setTargetAtTime(t, ctx.currentTime, 0.03);
      dR.delayTime.setTargetAtTime(t, ctx.currentTime, 0.03);
    },
  };
}

function buildReverb(ctx) {
  const input = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 2.5, 2.2);
  const output = ctx.createGain();
  input.connect(conv);
  conv.connect(output);
  return { input, output };
}

function buildFlanger(ctx, beatSec) {
  const input = ctx.createGain();
  const delay = ctx.createDelay(0.1);
  delay.delayTime.value = 0.005;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 1 / (beatSec * 4);
  const depth = ctx.createGain(); depth.gain.value = 0.003;
  lfo.connect(depth); depth.connect(delay.delayTime);
  lfo.start();
  const fb = ctx.createGain(); fb.gain.value = 0.5;
  const output = ctx.createGain();
  input.connect(delay);
  delay.connect(fb); fb.connect(delay);
  delay.connect(output);
  input.connect(output);
  return {
    input, output,
    setBeat(t) { lfo.frequency.setTargetAtTime(1 / (t * 4), ctx.currentTime, 0.03); },
  };
}

function buildFilter(ctx, beatSec) {
  const input = ctx.createGain();
  const bq = ctx.createBiquadFilter(); bq.type = 'bandpass'; bq.frequency.value = 800; bq.Q.value = 4;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 1 / (beatSec * 4);
  const depth = ctx.createGain(); depth.gain.value = 1500;
  const offset = ctx.createConstantSource(); offset.offset.value = 1500;
  offset.start();
  lfo.connect(depth);
  depth.connect(bq.frequency);
  offset.connect(bq.frequency);
  lfo.start();
  const output = ctx.createGain();
  input.connect(bq); bq.connect(output);
  return {
    input, output,
    setBeat(t) { lfo.frequency.setTargetAtTime(1 / (t * 4), ctx.currentTime, 0.03); },
  };
}

function buildTrans(ctx, beatSec) {
  // Beat gate: amplitude follows a square LFO at the beat divisor.
  const input = ctx.createGain();
  const gate = ctx.createGain(); gate.gain.value = 0;
  const output = ctx.createGain();
  input.connect(gate); gate.connect(output);

  // Programmatic square via setValueAtTime ramps.
  const ramp = () => {
    const now = ctx.currentTime;
    const period = beatSec;
    gate.gain.cancelScheduledValues(now);
    for (let i = 0; i < 16; i++) {
      gate.gain.setValueAtTime(1, now + i * period);
      gate.gain.setValueAtTime(0, now + i * period + period / 2);
    }
  };
  ramp();
  const interval = setInterval(ramp, 4000);

  return {
    input, output,
    setBeat(t) { beatSec = t; ramp(); },
    dispose() { clearInterval(interval); },
  };
}

function makeImpulse(ctx, durationSec, decay) {
  const sr = ctx.sampleRate;
  const len = sr * durationSec;
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}
