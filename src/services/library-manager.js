// Orchestrates: file -> decode -> analyze in worker -> save to IDB.
// Maintains the in-memory track list with subscriber notifications.

import { trackStore } from './track-store.js';
import { extractTags } from './metadata-extractor.js';
import { audio } from '../engine/audio-engine.js';
import AnalysisWorker from '../workers/analysis-worker.js?worker';

class LibraryManager {
  constructor() {
    this.tracks = [];
    this.listeners = new Set();
    this.worker = null;
    this.nextJobId = 1;
    this.pendingJobs = new Map();
    this.importing = new Map(); // id -> { name, progress }
    this._decodedCache = new Map(); // trackId -> AudioBuffer (in-memory, survives page session)
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.tracks);
    return () => this.listeners.delete(fn);
  }

  _emit() { for (const fn of this.listeners) fn(this.tracks); }

  async hydrate() {
    this.tracks = await trackStore.all();
    this.tracks.sort((a, b) => b.addedAt - a.addedAt);
    this._emit();
  }

  _ensureWorker() {
    if (this.worker) return;
    this.worker = new AnalysisWorker();
    this.worker.onmessage = (e) => {
      const job = this.pendingJobs.get(e.data.id);
      if (job) { this.pendingJobs.delete(e.data.id); job.resolve(e.data); }
    };
  }

  _analyze(channelData, sampleRate, duration) {
    this._ensureWorker();
    const id = this.nextJobId++;
    return new Promise((resolve) => {
      this.pendingJobs.set(id, { resolve });
      this.worker.postMessage({ id, channelData, sampleRate, duration }, [channelData.buffer]);
    });
  }

  async importFile(file, { onProgress } = {}) {
    const id = crypto.randomUUID();
    this.importing.set(id, { name: file.name, progress: 0 });
    onProgress?.(0);

    const tags = await extractTags(file);
    onProgress?.(0.2);

    const arrayBuf = await file.arrayBuffer();
    const decoded = await audio.ctx.decodeAudioData(arrayBuf.slice(0));
    this._decodedCache.set(id, decoded); // cache immediately for zero-wait deck load
    onProgress?.(0.5);

    // Mono mixdown for analysis (saves transfer + work)
    const mono = mixdown(decoded);
    const analysis = await this._analyze(mono, decoded.sampleRate, decoded.duration);
    const { peaks, bandedPeaks, bpm, energy, firstBeatSec, introEndSec, outroStartSec, firstVocalSec, firstDropSec } = analysis;
    onProgress?.(0.9);

    // Detect track category from title: acapella, instrumental, or full
    const category = detectCategory(tags.title, file.name);

    const track = {
      id,
      title: tags.title,
      artist: tags.artist,
      album: tags.album,
      year: tags.year,
      genre: tags.genre,
      category,                          // 'full' | 'acapella' | 'instrumental'
      bpm: tags.bpmTag || bpm,
      key: tags.keyTag || '—',
      energy: energy ?? 0.5,             // 0..1 — RMS + high-band weighted loudness/brightness
      firstBeatSec: firstBeatSec ?? 0,   // first downbeat
      introEndSec: introEndSec ?? 0,     // where the intro pad ends and the body begins
      outroStartSec: outroStartSec ?? decoded.duration,  // where outro/tail starts
      firstVocalSec: firstVocalSec ?? 0, // first significant high-band content (for mashups)
      firstDropSec: firstDropSec ?? 0,   // first sustained high-energy plateau (the drop)
      durationSec: decoded.duration,
      sampleRate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
      mime: file.type || 'audio/mpeg',
      encoded: new Blob([arrayBuf], { type: file.type || 'audio/mpeg' }),
      peaks,
      bandedPeaks,
      artwork: tags.artwork,
      addedAt: Date.now(),
      crateIds: [],
      playCount: 0,
      lastPlayedAt: null,
    };

    await trackStore.put(track);
    this.tracks.unshift(track);
    this.importing.delete(id);
    this._emit();
    onProgress?.(1);
    return track;
  }

  async importFiles(files, { onProgress } = {}) {
    const audioFiles = [...files].filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(f.name));
    const results = [];
    for (let i = 0; i < audioFiles.length; i++) {
      try {
        const t = await this.importFile(audioFiles[i], { onProgress: (p) => onProgress?.((i + p) / audioFiles.length, audioFiles[i].name) });
        results.push(t);
      } catch (err) {
        console.error('import failed', audioFiles[i].name, err);
      }
    }
    return results;
  }

  async remove(id) {
    await trackStore.delete(id);
    this.tracks = this.tracks.filter((t) => t.id !== id);
    this._emit();
  }

  async clear() {
    await trackStore.clear();
    this.tracks = [];
    this._emit();
  }

  async getDecodedBuffer(track) {
    const cached = this._decodedCache.get(track.id);
    if (cached) return cached;
    const arrayBuf = await track.encoded.arrayBuffer();
    const decoded = await audio.ctx.decodeAudioData(arrayBuf);
    this._decodedCache.set(track.id, decoded);
    return decoded;
  }
}

function mixdown(buffer) {
  if (buffer.numberOfChannels === 1) return new Float32Array(buffer.getChannelData(0));
  const l = buffer.getChannelData(0);
  const r = buffer.getChannelData(1);
  const out = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) out[i] = (l[i] + r[i]) * 0.5;
  return out;
}

// Detect track category from title or filename.
// Returns 'acapella', 'instrumental', or 'full' (default).
function detectCategory(title, filename) {
  const text = `${title || ''} ${filename || ''}`.toLowerCase();
  // Check acapella variants first so an "Instrumental Acapella" oddity still gets classified
  if (/\bacapella\b|\ba cappella\b/i.test(text)) return 'acapella';
  if (/\binstrumental\b/i.test(text)) return 'instrumental';
  return 'full';
}

export const library = new LibraryManager();
