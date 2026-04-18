// BPM detection via onset envelope + autocorrelation. Works on AudioBuffer at offline rate.
// Good enough for 4-on-the-floor / mainstream dance material; falls back gracefully.

export function detectBpm(buffer, { minBpm = 70, maxBpm = 180 } = {}) {
  const sr = buffer.sampleRate;
  const ch = buffer.getChannelData(0);
  const hop = 512;
  const frames = Math.floor(ch.length / hop);
  const env = new Float32Array(frames);

  // High-passed energy envelope (emphasises transients).
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = 0; i < hop; i++) {
      const s = ch[f * hop + i] || 0;
      const d = s - prev; prev = s;
      e += d * d;
    }
    env[f] = Math.sqrt(e / hop);
  }

  // Autocorrelate envelope over lag range corresponding to BPM range.
  const fps = sr / hop;
  const minLag = Math.floor(fps * 60 / maxBpm);
  const maxLag = Math.ceil(fps * 60 / minBpm);
  let bestLag = minLag, bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    const n = frames - lag;
    for (let i = 0; i < n; i++) s += env[i] * env[i + lag];
    s /= n;
    if (s > bestScore) { bestScore = s; bestLag = lag; }
  }
  let bpm = (fps * 60) / bestLag;

  // Fold into [85, 170] band — most modern DJ material lives here.
  while (bpm < 85) bpm *= 2;
  while (bpm > 170) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}

// Compute beat grid (sec[] of downbeats) from bpm + first downbeat offset.
export function beatGrid(bpm, durationSec, firstBeatSec = 0) {
  const period = 60 / bpm;
  const grid = [];
  for (let t = firstBeatSec; t < durationSec; t += period) grid.push(t);
  return grid;
}
