// Bridge between gesture engine and the rest of the app. All side effects (audio + state) go through here.
import { store } from '../state/index.js';
import { audio } from '../engine/audio-engine.js';
import { extractPeaks } from '../engine/waveform-analyzer.js';
import { detectBpm } from '../engine/beat-engine.js';
import { library } from '../services/library-manager.js';
import { sync } from '../engine/sync-engine.js';
import { clamp } from '../utils/math.js';

const idx = (deckId) => (deckId === 'A' ? 0 : 1);

export const actions = {
  // --- Knob get/set router (mixer EQ + trim + filter) ---
  getKnobValue(r) {
    const ch = store.get().mixer.channels[r.chIdx];
    switch (r.knob) {
      case 'trim': return ch.trim - 1;       // -1..+1 maps to gain 0..2
      case 'high': return ch.eq.high;
      case 'mid': return ch.eq.mid;
      case 'low': return ch.eq.low;
      case 'filter': return ch.filter;
    }
    return 0;
  },
  setKnobValue(r, v) {
    v = clamp(v, -1, 1);
    const ch = { ...store.get().mixer.channels[r.chIdx] };
    switch (r.knob) {
      case 'trim':
        ch.trim = 1 + v;
        audio.bus.setTrim(r.chIdx, ch.trim);
        break;
      case 'high':
      case 'mid':
      case 'low':
        ch.eq = { ...ch.eq, [r.knob]: v };
        audio.bus.setEq(r.chIdx, r.knob, v);
        break;
      case 'filter':
        ch.filter = v;
        audio.bus.setFilter(r.chIdx, v);
        break;
    }
    const channels = [...store.get().mixer.channels];
    channels[r.chIdx] = ch;
    store.set('mixer', { channels });
  },

  // --- Channel volume / master / crossfader ---
  getChannelVolume(chIdx) { return store.get().mixer.channels[chIdx].volume; },
  setChannelVolume(chIdx, v) {
    audio.bus.setVolume(chIdx, v);
    const channels = [...store.get().mixer.channels];
    channels[chIdx] = { ...channels[chIdx], volume: v };
    store.set('mixer', { channels });
  },
  getMasterVol() { return store.get().mixer.masterVolume; },
  setMasterVol(v) {
    audio.bus.setMaster(v);
    store.set('mixer', { masterVolume: v });
  },
  getCrossfader() { return store.get().mixer.crossfader; },
  setCrossfader(v) {
    audio.bus.setCrossfader(v);
    store.set('mixer', { crossfader: v });
  },
  setAssign(chIdx, assign) {
    audio.bus.setAssign(chIdx, assign);
    const channels = [...store.get().mixer.channels];
    channels[chIdx] = { ...channels[chIdx], crossfaderAssign: assign };
    store.set('mixer', { channels });
  },
  toggleChannelCue(chIdx) {
    const channels = [...store.get().mixer.channels];
    channels[chIdx] = { ...channels[chIdx], cueOn: !channels[chIdx].cueOn };
    store.set('mixer', { channels });
  },

  // --- Deck transport ---
  togglePlay(deckId) {
    const dp = audio.deck(deckId);
    if (!dp.buffer) return;
    if (dp.isPlaying) dp.pause(); else dp.play();
    store.setIn('decks', idx(deckId), { isPlaying: dp.isPlaying });
  },
  cuePressed(deckId) {
    const dp = audio.deck(deckId);
    if (!dp.buffer) return;
    dp.pause();
    dp.seek(0);
    store.setIn('decks', idx(deckId), { isPlaying: false, positionSec: 0 });
  },
  cueReleased(deckId) {},
  toggleSync(deckId) {
    const d = store.get().decks[idx(deckId)];
    const next = !d.syncEnabled;
    store.setIn('decks', idx(deckId), { syncEnabled: next });
    if (next) sync.align(deckId);
  },
  toggleMaster(deckId) {
    const decks = store.get().decks;
    const isCurrent = decks.find((d) => d.id === deckId)?.isMaster;
    if (isCurrent) sync.setMaster(null);
    else sync.setMaster(deckId);
  },
  setPadMode(deckId, mode) {
    store.setIn('decks', idx(deckId), { padMode: mode });
  },
  getPadMode(deckId) { return store.get().decks[idx(deckId)].padMode; },

  // --- Sampler ---
  async loadSample(slotIdx, file) {
    const buf = await file.arrayBuffer();
    const audioBuf = await audio.ctx.decodeAudioData(buf);
    audio.sampler.load(slotIdx, audioBuf, 1);
    const slots = [...store.get().sampler.slots];
    slots[slotIdx] = {
      name: file.name.replace(/\.[^.]+$/, ''),
      color: ['#ff6a1a', '#ff3d5a', '#22d3ee', '#4ade80', '#fbbf24', '#a78bfa', '#f472b6', '#60a5fa'][slotIdx],
      durationSec: audioBuf.duration,
      lastTriggeredAt: 0,
    };
    store.set('sampler', { slots });
  },
  clearSample(slotIdx) {
    audio.sampler.clear(slotIdx);
    const slots = [...store.get().sampler.slots];
    slots[slotIdx] = null;
    store.set('sampler', { slots });
  },
  padLongPress(deckId, padIdx) {
    const d = store.get().decks[idx(deckId)];
    if (d.padMode === 'hotcue') {
      const cues = [...d.hotCues]; cues[padIdx] = null;
      store.setIn('decks', idx(deckId), { hotCues: cues });
    } else if (d.padMode === 'sampler') {
      if (audio.sampler.has(padIdx)) this.clearSample(padIdx);
      else openSamplePicker(padIdx);
    }
  },
  getDeckTempo(deckId) { return audio.deck(deckId).tempo; },
  setDeckTempo(deckId, rate) {
    audio.deck(deckId).setTempo(rate);
    store.setIn('decks', idx(deckId), { tempo: rate });
  },
  getDeckPosition(deckId) { return audio.deck(deckId).positionSec; },
  scrub(deckId, sec) {
    const dp = audio.deck(deckId);
    if (!dp.buffer) return;
    const t = clamp(sec, 0, dp.durationSec);
    dp.seek(t);
    store.setIn('decks', idx(deckId), { positionSec: t });
  },
  seekTo01(deckId, t01) {
    const dp = audio.deck(deckId);
    if (!dp.buffer) return;
    this.scrub(deckId, t01 * dp.durationSec);
  },

  // --- Pads ---
  padDown(deckId, padIdx) {
    const i = idx(deckId);
    const d = store.get().decks[i];
    const dp = audio.deck(deckId);
    if (!dp.buffer) return;
    const beatSec = 60 / (d.track?.bpm || 120);

    if (d.padMode === 'hotcue') {
      const cues = [...d.hotCues];
      if (cues[padIdx] == null) {
        cues[padIdx] = { positionSec: dp.positionSec, color: deckId === 'A' ? '#ff6a1a' : '#ff3d5a' };
      } else {
        if (d.slip) dp.beginSlip();
        this.scrub(deckId, cues[padIdx].positionSec);
        if (!dp.isPlaying) { dp.play(); store.setIn('decks', i, { isPlaying: true }); }
      }
      store.setIn('decks', i, { hotCues: cues });
    } else if (d.padMode === 'beatjump') {
      const beats = [1, 2, 4, 8, 16, 32, 64, 128][padIdx];
      if (d.slip) dp.beginSlip();
      this.scrub(deckId, dp.positionSec + beats * beatSec);
    } else if (d.padMode === 'loop') {
      const sizes = [1/16, 1/8, 1/4, 1/2, 1, 2, 4, 8];
      const lenBeats = sizes[padIdx];
      const startSec = dp.positionSec;
      const loop = { startSec, endSec: startSec + lenBeats * beatSec, active: true };
      dp.setLoop({ startSec: loop.startSec, endSec: loop.endSec });
      store.setIn('decks', i, { loop });
    } else if (d.padMode === 'sampler') {
      if (audio.sampler.has(padIdx)) {
        const result = audio.sampler.trigger(padIdx);
        const slots = [...store.get().sampler.slots];
        if (slots[padIdx]) {
          slots[padIdx] = { ...slots[padIdx], lastTriggeredAt: Date.now(), active: result === 'started' };
        }
        store.set('sampler', { slots });
      } else {
        openSamplePicker(padIdx);
      }
    }
  },
  padUp(deckId, padIdx) {
    const i = idx(deckId);
    const d = store.get().decks[i];
    const dp = audio.deck(deckId);
    if (d.slip && dp.slip) dp.endSlip();
  },
  clearCue(deckId, padIdx) {
    const i = idx(deckId);
    const cues = [...store.get().decks[i].hotCues];
    cues[padIdx] = null;
    store.setIn('decks', i, { hotCues: cues });
  },

  // --- FX strip ---
  fxAction(deckId, action) {
    const i = idx(deckId);
    const d = store.get().decks[i];
    const dp = audio.deck(deckId);
    const applyLoop = (loop) => {
      store.setIn('decks', i, { loop });
      dp.setLoop(loop && loop.active ? { startSec: loop.startSec, endSec: loop.endSec } : null);
    };
    switch (action) {
      case 'slip': {
        const next = !d.slip;
        store.setIn('decks', i, { slip: next });
        if (next) dp.beginSlip(); else dp.endSlip();
        break;
      }
      case 'quant': store.setIn('decks', i, { quantize: !d.quantize }); break;
      case 'loopIn': {
        if (d.loop?.active) {
          applyLoop(null);
        } else {
          const beatSec = 60 / (d.track?.bpm || 120);
          const startSec = dp.positionSec;
          applyLoop({ startSec, endSec: startSec + beatSec * 4, active: true });
        }
        break;
      }
      case 'loopOut': {
        if (d.loop) applyLoop({ ...d.loop, endSec: dp.positionSec, active: true });
        break;
      }
      case 'loopHalf': if (d.loop) applyLoop({ ...d.loop, endSec: d.loop.startSec + (d.loop.endSec - d.loop.startSec) / 2 }); break;
      case 'loopDouble': if (d.loop) applyLoop({ ...d.loop, endSec: d.loop.startSec + (d.loop.endSec - d.loop.startSec) * 2 }); break;
      case 'beatBack': this.scrub(deckId, dp.positionSec - (60 / (d.track?.bpm || 120))); break;
      case 'beatFwd': this.scrub(deckId, dp.positionSec + (60 / (d.track?.bpm || 120))); break;
    }
  },

  // --- Beat FX (live audio via FxEngine) ---
  setBeatDiv(div) {
    audio.fx.setBeatDiv(div);
    store.set('mixer', { beatFx: { ...store.get().mixer.beatFx, beatDiv: div } });
  },
  toggleBeatFx() {
    const f = store.get().mixer.beatFx;
    audio.fx.setOn(!f.on);
    store.set('mixer', { beatFx: { ...f, on: !f.on } });
  },
  setBeatFxTarget(t) {
    audio.fx.target = t; audio.fx._applyOn();
    store.set('mixer', { beatFx: { ...store.get().mixer.beatFx, target: t } });
  },
  setBeatFxType(t) {
    audio.fx.setType(t);
    store.set('mixer', { beatFx: { ...store.get().mixer.beatFx, type: t } });
  },
  cycleBeatFxType() {
    const order = ['echo', 'delay', 'reverb', 'flanger', 'filter', 'trans'];
    const cur = store.get().mixer.beatFx.type;
    const next = order[(order.indexOf(cur) + 1) % order.length];
    this.setBeatFxType(next);
  },
  getBeatFxLevel() { return store.get().mixer.beatFx.level; },
  setBeatFxLevel(v) {
    audio.fx.setLevel(v);
    store.set('mixer', { beatFx: { ...store.get().mixer.beatFx, level: v } });
  },

  // --- UI toggles ---
  toggleLibrary() { store.set('ui', { libraryOpen: !store.get().ui.libraryOpen }); },
  toggleSettings() { store.set('ui', { settingsOpen: !store.get().ui.settingsOpen }); },
  toggleRecord() {
    const rec = store.get().mixer.recording;
    if (rec) {
      audio.stopRecording().then(async (blob) => {
        if (!blob) return;
        try {
          // Decode to PCM and export as WAV so any editor can open it
          const arrayBuf = await blob.arrayBuffer();
          const audioBuf = await audio.ctx.decodeAudioData(arrayBuf);
          const wavBlob = audioBufToWav(audioBuf);
          const url = URL.createObjectURL(wavBlob);
          const a = document.createElement('a');
          a.href = url; a.download = `notdj-mix-${Date.now()}.wav`; a.click();
          URL.revokeObjectURL(url);
        } catch {
          // Fallback: raw blob
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `notdj-mix-${Date.now()}.wav`; a.click();
        }
      });
    } else {
      audio.startRecording();
    }
    store.set('mixer', { recording: !rec });
  },

  // --- Library loading (called by drop / file picker) ---
  async loadFile(deckId, file) {
    // Import to library (persisted) then load onto deck.
    const track = await library.importFile(file);
    await this.loadFromLibrary(deckId, track);
  },

  // Load an already-imported track from the library onto a deck.
  async loadFromLibrary(deckId, track) {
    const audioBuf = await library.getDecodedBuffer(track);
    audio.deck(deckId).load(audioBuf);
    store.setIn('decks', idx(deckId), {
      track: {
        id: track.id,
        title: track.title,
        artist: track.artist,
        durationSec: track.durationSec,
        bpm: track.bpm,
        key: track.key,
      },
      buffer: audioBuf,
      peaks: track.peaks,
      bandedPeaks: track.bandedPeaks,
      positionSec: 0,
      isPlaying: false,
      hotCues: new Array(8).fill(null),
      loop: null,
    });
  },
};

// Convert an AudioBuffer to a WAV Blob (44.1 kHz, 16-bit PCM, stereo).
// WAV is uncompressed and universally editable in any DAW / audio editor.
function audioBufToWav(buf) {
  const sr = Math.min(buf.sampleRate, 48000);
  const numCh = buf.numberOfChannels;
  const len = buf.length;
  const bitsPerSample = 16;
  const byteRate = sr * numCh * bitsPerSample / 8;
  const blockAlign = numCh * bitsPerSample / 8;
  const dataSize = len * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);           // chunk size
  view.setUint16(20, 1, true);            // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  // Interleave channels into 16-bit samples
  let off = 44;
  for (let s = 0; s < len; s++) {
    for (let ch = 0; ch < numCh; ch++) {
      const sample = Math.max(-1, Math.min(1, buf.getChannelData(ch)[s]));
      const val = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(off, val, true);
      off += 2;
    }
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

let samplePicker = null;
function openSamplePicker(slotIdx) {
  if (!samplePicker) {
    samplePicker = document.createElement('input');
    samplePicker.type = 'file';
    samplePicker.accept = 'audio/*';
    samplePicker.style.display = 'none';
    document.body.appendChild(samplePicker);
  }
  samplePicker.onchange = async () => {
    const f = samplePicker.files[0];
    samplePicker.value = '';
    if (f) await actions.loadSample(slotIdx, f);
  };
  samplePicker.click();
}
