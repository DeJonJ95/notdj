import { crossfadeGains, dbToGain, clamp } from '../utils/math.js';

// Mixer bus owns: per-channel input gain (trim), 3-band EQ, sound-color FX,
// channel volume, crossfader assign groups, master out, headphone cue split.
//
// Graph per channel:
//   chIn(gain=trim) -> eqLow(lowshelf) -> eqMid(peaking) -> eqHigh(highshelf)
//                  -> colorFx (filter/noise/dub/pitch/sweep) -> volume(gain)
//                  -> assignL(gain) + assignR(gain) -> xfL/xfR -> master
//                  -> (tap) -> analyser for VU + master record dest

export class MixerBus {
  constructor(ctx) {
    this.ctx = ctx;
    // Channel 0 (deck A) defaults to L, channel 1 (deck B) to R, matching state.
    this.channels = [this._buildChannel(0), this._buildChannel(1)];

    this.xfL = ctx.createGain(); this.xfL.gain.value = 1;
    this.xfR = ctx.createGain(); this.xfR.gain.value = 1;

    this.masterIn = ctx.createGain();
    this.masterIn.gain.value = 0.85;

    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = 1024;
    this.masterAnalyser.smoothingTimeConstant = 0.7;

    this.masterOut = ctx.createGain();
    this.masterOut.gain.value = 1;

    // Wire channel assign -> xf buses -> master
    for (const ch of this.channels) {
      ch.assignL.connect(this.xfL);
      ch.assignR.connect(this.xfR);
    }
    this.xfL.connect(this.masterIn);
    this.xfR.connect(this.masterIn);
    this.masterIn.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.masterOut);
    this.masterOut.connect(ctx.destination);

    // Headphone cue bus (silent on speaker; future: routed to separate output)
    this.cueBus = ctx.createGain();
    this.cueBus.gain.value = 0;
    for (const ch of this.channels) {
      ch.cueSend.connect(this.cueBus);
    }

    this.setCrossfader(0);
  }

  _buildChannel(deckIdx = 0) {
    const ctx = this.ctx;
    const input = ctx.createGain();      // trim
    input.gain.value = 1;

    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf'; low.frequency.value = 200; low.gain.value = 0;

    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking'; mid.frequency.value = 1200; mid.Q.value = 0.9; mid.gain.value = 0;

    const high = ctx.createBiquadFilter();
    high.type = 'highshelf'; high.frequency.value = 4000; high.gain.value = 0;

    // Color FX: dual filter (one LPF, one HPF) blended by knob sign.
    // Negative -> LPF sweeps down, Positive -> HPF sweeps up.
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass'; lpf.frequency.value = 22000; lpf.Q.value = 0.8;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass'; hpf.frequency.value = 20; hpf.Q.value = 0.8;

    const volume = ctx.createGain();
    volume.gain.value = 0.85;

    const assignL = ctx.createGain();
    const assignR = ctx.createGain();
    // Default per-deck routing: A → L, B → R (matches initial mixer state).
    if (deckIdx === 0) { assignL.gain.value = 1; assignR.gain.value = 0; }
    else               { assignL.gain.value = 0; assignR.gain.value = 1; }

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.6;

    const cueSend = ctx.createGain();
    cueSend.gain.value = 0;

    // wire: input -> low -> mid -> high -> lpf -> hpf -> volume -> [analyser, assignL, assignR, cueSend]
    input.connect(low); low.connect(mid); mid.connect(high);
    high.connect(lpf); lpf.connect(hpf); hpf.connect(volume);
    volume.connect(analyser);
    volume.connect(assignL);
    volume.connect(assignR);
    volume.connect(cueSend);

    return { input, low, mid, high, lpf, hpf, volume, assignL, assignR, analyser, cueSend };
  }

  channelIn(index) { return this.channels[index].input; }

  setTrim(idx, gain) { this.channels[idx].input.gain.value = gain; }
  setVolume(idx, gain) { this.channels[idx].volume.gain.value = gain; }

  // EQ knob value: -1..+1 -> dB curve (kill at -1 = -26dB, +1 = +6dB)
  setEq(idx, band, v) {
    const node = this.channels[idx][band];
    node.gain.value = v >= 0 ? v * 6 : v * 26;
  }

  // Color FX dial -1..+1. 0 = bypass.
  setFilter(idx, v) {
    const ch = this.channels[idx];
    const nyq = this.ctx.sampleRate * 0.5;
    if (v < 0) {
      ch.lpf.frequency.value = Math.max(120, nyq * Math.pow(2, v * 7.5));
      ch.hpf.frequency.value = 20;
    } else if (v > 0) {
      ch.hpf.frequency.value = Math.min(nyq * 0.5, 40 * Math.pow(2, v * 10));
      ch.lpf.frequency.value = nyq;
    } else {
      ch.lpf.frequency.value = nyq;
      ch.hpf.frequency.value = 20;
    }
  }

  setAssign(idx, assign) {
    const ch = this.channels[idx];
    ch.assignL.gain.value = assign === 'L' || assign === 'C' ? 1 : 0;
    ch.assignR.gain.value = assign === 'R' || assign === 'C' ? 1 : 0;
  }

  setCrossfader(x) {
    const curve = this.crossfaderCurve || 'sharp';
    let a, b;
    const t = (clamp(x, -1, 1) + 1) * 0.5; // 0..1

    if (curve === 'smooth') {
      // Linear equal-power
      ({ a, b } = crossfadeGains(x));
    } else if (curve === 'dipped') {
      // -6 dB at center (sums in-phase signals correctly)
      a = 1 - t; b = t;
    } else {
      // Sharp: dead zone at each end — first/last 15% fully muted on the cut side
      const deadZone = 0.15;
      if (t <= deadZone) { a = 1; b = 0; }
      else if (t >= 1 - deadZone) { a = 0; b = 1; }
      else {
        const mt = (t - deadZone) / (1 - 2 * deadZone); // remap 0..1 across live zone
        a = Math.cos(mt * Math.PI * 0.5);
        b = Math.sin(mt * Math.PI * 0.5);
      }
    }
    this.xfL.gain.value = a;
    this.xfR.gain.value = b;
  }

  setMaster(v) { this.masterOut.gain.value = v; }
}
