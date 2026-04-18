// Sampler: shared 8-slot bank. Each slot holds an AudioBuffer + per-slot gain.
// trigger(idx) toggles play/stop — tap once to play, tap again to stop.

export class Sampler {
  constructor(ctx, masterIn) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(masterIn);
    this.slots = new Array(8).fill(null); // { buffer, gain }
    this.activeSources = new Array(8).fill(null); // { source, gain } | null
    this.onTrigger = null;
  }

  has(idx) { return !!this.slots[idx]; }
  load(idx, buffer, gain = 1) { this.slots[idx] = { buffer, gain }; }
  clear(idx) {
    this.stop(idx);
    this.slots[idx] = null;
  }

  isPlaying(idx) { return !!this.activeSources[idx]; }

  trigger(idx) {
    const slot = this.slots[idx];
    if (!slot) return false;

    // If already playing, stop it (toggle off)
    if (this.activeSources[idx]) {
      this.stop(idx);
      if (this.onTrigger) this.onTrigger(idx);
      return 'stopped';
    }

    // Start playback
    const src = this.ctx.createBufferSource();
    src.buffer = slot.buffer;
    const g = this.ctx.createGain();
    g.gain.value = slot.gain;
    src.connect(g).connect(this.out);
    src.onended = () => {
      if (this.activeSources[idx]?.source === src) {
        this.activeSources[idx] = null;
        if (this.onTrigger) this.onTrigger(idx);
      }
    };
    src.start(0);
    this.activeSources[idx] = { source: src, gain: g };
    if (this.onTrigger) this.onTrigger(idx);
    return 'started';
  }

  stop(idx) {
    const active = this.activeSources[idx];
    if (!active) return;
    try { active.source.stop(); } catch {}
    active.source.disconnect();
    active.gain.disconnect();
    this.activeSources[idx] = null;
  }

  stopAll() {
    for (let i = 0; i < this.activeSources.length; i++) this.stop(i);
  }
}
