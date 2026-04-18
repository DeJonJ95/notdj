// Off-main-thread audio analysis. Receives Float32Array channel data + sampleRate;
// returns BPM + peak data without blocking the UI.

self.onmessage = (e) => {
  const { id, channelData, sampleRate, duration } = e.data;
  try {
    const peaks = extractPeaks(channelData, 4096);
    const bandedPeaks = extractBandedPeaks(channelData, sampleRate, 4096);
    const bpm = detectBpm(channelData, sampleRate);
    self.postMessage(
      { id, ok: true, peaks, bandedPeaks, bpm, duration },
      [peaks.buffer, bandedPeaks.lows.buffer, bandedPeaks.mids.buffer, bandedPeaks.highs.buffer]
    );
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
};

function extractPeaks(ch, buckets) {
  const samplesPerBucket = Math.floor(ch.length / buckets);
  const out = new Float32Array(buckets * 2);
  for (let b = 0; b < buckets; b++) {
    const start = b * samplesPerBucket;
    const end = start + samplesPerBucket;
    let min = 1, max = -1;
    for (let i = start; i < end; i++) {
      const s = ch[i];
      if (s < min) min = s;
      if (s > max) max = s;
    }
    out[b * 2] = min;
    out[b * 2 + 1] = max;
  }
  return out;
}

function extractBandedPeaks(ch, sr, buckets) {
  const samplesPerBucket = Math.floor(ch.length / buckets);
  const lows = new Float32Array(buckets);
  const mids = new Float32Array(buckets);
  const highs = new Float32Array(buckets);
  const aLow = Math.exp(-2 * Math.PI * 200 / sr);
  const aHigh = Math.exp(-2 * Math.PI * 4000 / sr);
  let lpLow = 0, lpHigh = 0;
  let bucket = 0, sumL = 0, sumM = 0, sumH = 0, count = 0;
  for (let i = 0; i < ch.length; i++) {
    const x = ch[i];
    lpLow = aLow * lpLow + (1 - aLow) * x;
    lpHigh = aHigh * lpHigh + (1 - aHigh) * x;
    sumL += Math.abs(lpLow);
    sumM += Math.abs(lpHigh - lpLow);
    sumH += Math.abs(x - lpHigh);
    count++;
    if (count >= samplesPerBucket && bucket < buckets) {
      lows[bucket] = sumL / count;
      mids[bucket] = sumM / count;
      highs[bucket] = sumH / count;
      bucket++; sumL = sumM = sumH = 0; count = 0;
    }
  }
  const norm = (arr) => { let m = 0; for (const v of arr) if (v > m) m = v; if (m > 0) for (let i = 0; i < arr.length; i++) arr[i] /= m; };
  norm(lows); norm(mids); norm(highs);
  return { lows, mids, highs };
}

function detectBpm(ch, sr, { minBpm = 70, maxBpm = 180 } = {}) {
  const hop = 512;
  const frames = Math.floor(ch.length / hop);
  const env = new Float32Array(frames);
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
  while (bpm < 85) bpm *= 2;
  while (bpm > 170) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}
