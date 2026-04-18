// Per-deck audio source with native looping + slip-mode bookkeeping.

export class DeckPlayer {
  constructor(ctx, id, downstream) {
    this.ctx = ctx;
    this.id = id;
    this.downstream = downstream;
    this.buffer = null;
    this.source = null;
    this.tempo = 1.0;
    this._startCtxTime = 0;
    this._startBufferOffset = 0;
    this._pausedAt = 0;
    this.isPlaying = false;
    this.loopRange = null; // { startSec, endSec }
    this.slip = null;      // { ghostStartSec, ghostStartCtxTime } when slip active
    this.onEnded = null;
  }

  load(buffer) {
    this.stop();
    this.buffer = buffer;
    this._startBufferOffset = 0;
    this._pausedAt = 0;
    this.loopRange = null;
    this.slip = null;
  }

  _spawn(offset) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.tempo;
    if (this.loopRange) {
      src.loop = true;
      src.loopStart = this.loopRange.startSec;
      src.loopEnd = this.loopRange.endSec;
    }
    src.connect(this.downstream);
    src.onended = () => {
      if (this.source === src) {
        this.isPlaying = false;
        if (this.onEnded) this.onEnded();
      }
    };
    this.source = src;
    this._startCtxTime = this.ctx.currentTime;
    this._startBufferOffset = offset;
    src.start(0, offset);
  }

  play() {
    if (!this.buffer || this.isPlaying) return;
    this._spawn(this._pausedAt);
    this.isPlaying = true;
  }

  pause() {
    if (!this.isPlaying) return;
    this._pausedAt = this._positionWithLoop();
    this.source.stop();
    this.source.disconnect();
    this.source = null;
    this.isPlaying = false;
  }

  stop() {
    if (this.source) {
      try { this.source.stop(); } catch {}
      this.source.disconnect();
      this.source = null;
    }
    this.isPlaying = false;
    this._pausedAt = 0;
    this.loopRange = null;
  }

  seek(sec) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      this.source.stop();
      this.source.disconnect();
      this.source = null;
      this._spawn(sec);
    } else {
      this._pausedAt = sec;
    }
  }

  setTempo(rate) {
    this.tempo = rate;
    if (this.source) {
      this.source.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.01);
      this._startBufferOffset = this._positionWithLoop();
      this._startCtxTime = this.ctx.currentTime;
    }
  }

  // Native sample-accurate loop on the source node. Pass null to clear.
  setLoop(range) {
    this.loopRange = range;
    if (this.source) {
      if (range) {
        this.source.loop = true;
        this.source.loopStart = range.startSec;
        this.source.loopEnd = range.endSec;
        // If the playhead is past the loop end, snap back to start
        if (this.positionSec > range.endSec) this.seek(range.startSec);
      } else {
        this.source.loop = false;
      }
    }
  }

  // Slip mode: remember the "ghost" position so we can return when slip ends.
  beginSlip() {
    if (this.slip) return;
    this.slip = { ghostStartSec: this.positionSec, ghostStartCtxTime: this.ctx.currentTime };
  }

  // End slip: snap playhead back to where we WOULD have been had we not jumped.
  endSlip() {
    if (!this.slip) return;
    const elapsed = (this.ctx.currentTime - this.slip.ghostStartCtxTime) * this.tempo;
    const target = this.slip.ghostStartSec + elapsed;
    this.slip = null;
    if (this.buffer && target < this.buffer.duration) {
      this.seek(target);
    }
  }

  _positionWithLoop() {
    if (!this.buffer || !this.isPlaying) return this._pausedAt;
    let pos = this._startBufferOffset + (this.ctx.currentTime - this._startCtxTime) * this.tempo;
    if (this.loopRange) {
      const { startSec, endSec } = this.loopRange;
      const len = endSec - startSec;
      if (pos > endSec && len > 0) {
        pos = startSec + ((pos - startSec) % len);
      }
    }
    return pos;
  }

  get positionSec() { return this._positionWithLoop(); }
  get durationSec() { return this.buffer ? this.buffer.duration : 0; }
}
