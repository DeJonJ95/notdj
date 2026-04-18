import { DeckPlayer } from './deck-player.js';
import { MixerBus } from './mixer-bus.js';
import { FxEngine } from './fx-engine.js';
import { Sampler } from './sampler.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.bus = null;
    this.fx = null;
    this.decks = new Map();
    this.recorder = null;
    this.recChunks = [];
  }

  async start() {
    // If main.js already created the AudioContext synchronously inside a gesture
    // (required by iOS Safari), just continue and wire everything else.
    if (this.bus) return this.ctx;
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
    }
    // Non-blocking resume — iOS can hang if awaited inside a gesture handler.
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});

    this.bus = new MixerBus(this.ctx);
    this.master = this.bus.masterIn;

    this.decks.set('A', new DeckPlayer(this.ctx, 'A', this.bus.channelIn(0)));
    this.decks.set('B', new DeckPlayer(this.ctx, 'B', this.bus.channelIn(1)));

    this.fx = new FxEngine(this.ctx, this.bus);
    this.sampler = new Sampler(this.ctx, this.bus.masterIn);

    return this.ctx;
  }

  deck(id) { return this.decks.get(id); }

  startRecording() {
    if (!this.ctx || this.recorder) return;
    const dest = this.ctx.createMediaStreamDestination();
    this.bus.masterOut.connect(dest);
    this.recChunks = [];
    const mime = MediaRecorder.isTypeSupported('audio/mp4;codecs=mp4a.40.2')
      ? 'audio/mp4;codecs=mp4a.40.2'
      : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : '';
    this.recorder = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined);
    this.recorder.ondataavailable = (e) => e.data.size && this.recChunks.push(e.data);
    this.recorder.start(1000);
  }

  async stopRecording() {
    if (!this.recorder) return null;
    const blob = await new Promise((res) => {
      this.recorder.onstop = () => res(new Blob(this.recChunks, { type: this.recorder.mimeType }));
      this.recorder.stop();
    });
    this.recorder = null;
    this.recChunks = [];
    return blob;
  }
}

export const audio = new AudioEngine();
