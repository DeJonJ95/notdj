// Off-main-thread audio analysis. Receives Float32Array channel data + sampleRate;
// returns BPM + peak data without blocking the UI.

self.onmessage = (e) => {
  const { id, channelData, sampleRate, duration } = e.data;
  try {
    const peaks = extractPeaks(channelData, 4096);
    const bandedPeaks = extractBandedPeaks(channelData, sampleRate, 4096);
    const bpm = detectBpm(channelData, sampleRate);
    const energy = computeEnergy(channelData, bandedPeaks);
    const firstBeatSec = detectFirstBeat(channelData, sampleRate);
    const structure = detectStructure(bandedPeaks, duration);
    self.postMessage(
      {
        id, ok: true, peaks, bandedPeaks, bpm, energy, duration,
        firstBeatSec,
        introEndSec: structure.introEndSec,
        outroStartSec: structure.outroStartSec,
        firstVocalSec: structure.firstVocalSec,
        firstDropSec: structure.firstDropSec,
      },
      [peaks.buffer, bandedPeaks.lows.buffer, bandedPeaks.mids.buffer, bandedPeaks.highs.buffer]
    );
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
};

// Find the first significant onset (= first kick / downbeat) in the track.
// Scans the first 60 seconds, finds the first frame where the onset envelope
// exceeds 2× the running mean of the leading 30 seconds.
function detectFirstBeat(ch, sr) {
  const hop = 512;
  const scanFrames = Math.min(Math.floor(ch.length / hop), Math.floor(60 * sr / hop));
  const env = new Float32Array(scanFrames);
  let prev = 0;
  for (let f = 0; f < scanFrames; f++) {
    let e = 0;
    for (let i = 0; i < hop; i++) {
      const s = ch[f * hop + i] || 0;
      const d = s - prev; prev = s;
      e += d * d;
    }
    env[f] = Math.sqrt(e / hop);
  }
  // Mean over first 30 seconds of the scan window
  const meanFrames = Math.min(scanFrames, Math.floor(30 * sr / hop));
  let mean = 0;
  for (let i = 0; i < meanFrames; i++) mean += env[i];
  mean /= meanFrames || 1;
  const threshold = mean * 2;

  for (let i = 0; i < scanFrames; i++) {
    if (env[i] > threshold) return (i * hop) / sr;
  }
  return 0;
}

// Detect track structure from banded peaks: intro end, outro start, first vocal entry, first drop.
// All times are in seconds. Uses smoothed total energy and high-band envelope.
function detectStructure(banded, durationSec) {
  const n = banded.lows.length;
  if (n === 0 || !durationSec) return { introEndSec: 0, outroStartSec: durationSec, firstVocalSec: 0, firstDropSec: 0 };

  // Combined energy envelope
  const total = new Float32Array(n);
  for (let i = 0; i < n; i++) total[i] = banded.lows[i] + banded.mids[i] + banded.highs[i];

  // Smooth with a ~2-second moving average
  const w = Math.max(8, Math.floor(n / 64));
  const smoothed = movingAverage(total, w);

  let maxV = 0;
  for (const v of smoothed) if (v > maxV) maxV = v;
  const threshold = maxV * 0.55;

  // Intro end: first bucket where smoothed energy crosses the threshold
  let introEnd = 0;
  for (let i = 0; i < n; i++) if (smoothed[i] > threshold) { introEnd = i; break; }
  // Outro start: last bucket where energy was above threshold
  let outroStart = n - 1;
  for (let i = n - 1; i >= 0; i--) if (smoothed[i] > threshold) { outroStart = i; break; }

  // First vocal: significant high-band entry after the start. Useful for acapella positioning.
  const highsSmoothed = movingAverage(banded.highs, Math.max(4, Math.floor(n / 128)));
  let firstVocal = 0;
  for (let i = 0; i < n; i++) {
    if (highsSmoothed[i] > 0.4) { firstVocal = i; break; }
  }

  // First drop: first sustained plateau at ≥85% of max energy.
  // Smooths harder to ignore transient spikes (snare flams, crash hits).
  const dropSmoothed = movingAverage(total, Math.max(16, Math.floor(n / 32)));
  const dropThreshold = maxV * 0.85;
  const minPlateauBuckets = Math.max(4, Math.floor(n / 80));
  let plateauStart = -1, plateauCount = 0;
  let firstDrop = 0;
  for (let i = 0; i < n; i++) {
    if (dropSmoothed[i] >= dropThreshold) {
      if (plateauCount === 0) plateauStart = i;
      plateauCount++;
      if (plateauCount >= minPlateauBuckets) {
        firstDrop = plateauStart;
        break;
      }
    } else {
      plateauCount = 0;
      plateauStart = -1;
    }
  }

  const bucketSec = durationSec / n;
  return {
    introEndSec: introEnd * bucketSec,
    outroStartSec: Math.max(outroStart * bucketSec, durationSec - 60),
    firstVocalSec: firstVocal * bucketSec,
    firstDropSec: firstDrop * bucketSec,
  };
}

function movingAverage(arr, w) {
  const n = arr.length;
  const out = new Float32Array(n);
  const halfW = Math.floor(w / 2);
  let sum = 0;
  // Prime first window
  for (let i = 0; i < Math.min(w, n); i++) sum += arr[i];
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - halfW);
    const end = Math.min(n - 1, i + halfW);
    let s = 0, count = 0;
    for (let j = start; j <= end; j++) { s += arr[j]; count++; }
    out[i] = s / (count || 1);
  }
  return out;
}

// Track-level energy proxy. Weighs RMS loudness and high-frequency content.
// Returns 0..1 — chill ambient ~0.15, peak-time techno ~0.85.
function computeEnergy(channelData, banded) {
  // RMS over the whole track (loudness)
  let sumSq = 0;
  for (let i = 0; i < channelData.length; i++) sumSq += channelData[i] * channelData[i];
  const rms = Math.sqrt(sumSq / channelData.length);

  // Mean high-band content — bright tracks (cymbals, synths, vocals) feel more energetic
  let highMean = 0;
  for (let i = 0; i < banded.highs.length; i++) highMean += banded.highs[i];
  highMean /= banded.highs.length;

  // Mean mid-band — kick/snare/melody body
  let midMean = 0;
  for (let i = 0; i < banded.mids.length; i++) midMean += banded.mids[i];
  midMean /= banded.mids.length;

  // Weighted combination. Coefficients chosen so typical mixes land in ~0.3-0.8.
  return Math.min(1, rms * 1.4 + highMean * 0.35 + midMean * 0.15);
}

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
