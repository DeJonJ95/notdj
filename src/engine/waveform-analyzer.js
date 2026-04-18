// Offline waveform peak extraction. Returns Float32Array of length `buckets`
// where each pair (min,max) is interleaved -> 2 * buckets length.

export function extractPeaks(buffer, buckets = 4096) {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const samplesPerBucket = Math.floor(ch0.length / buckets);
  const out = new Float32Array(buckets * 2);
  for (let b = 0; b < buckets; b++) {
    const start = b * samplesPerBucket;
    const end = start + samplesPerBucket;
    let min = 1, max = -1;
    for (let i = start; i < end; i++) {
      const s = (ch0[i] + ch1[i]) * 0.5;
      if (s < min) min = s;
      if (s > max) max = s;
    }
    out[b * 2] = min;
    out[b * 2 + 1] = max;
  }
  return out;
}

// Frequency-banded peaks for color-coded waveforms (Phase 3).
// Returns { lows, mids, highs } each length buckets, values 0..1.
export function extractBandedPeaks(buffer, buckets = 4096) {
  const sr = buffer.sampleRate;
  const ch = buffer.getChannelData(0);
  const samplesPerBucket = Math.floor(ch.length / buckets);
  const lows = new Float32Array(buckets);
  const mids = new Float32Array(buckets);
  const highs = new Float32Array(buckets);

  // Cheap 3-band envelope follower via one-pole filters.
  const aLow = Math.exp(-2 * Math.PI * 200 / sr);
  const aHigh = Math.exp(-2 * Math.PI * 4000 / sr);
  let lpLow = 0, lpHigh = 0;

  let bucket = 0, sumL = 0, sumM = 0, sumH = 0, count = 0;
  for (let i = 0; i < ch.length; i++) {
    const x = ch[i];
    lpLow = aLow * lpLow + (1 - aLow) * x;
    lpHigh = aHigh * lpHigh + (1 - aHigh) * x;
    const lo = lpLow;
    const hi = x - lpHigh;
    const mi = lpHigh - lpLow;
    sumL += Math.abs(lo);
    sumM += Math.abs(mi);
    sumH += Math.abs(hi);
    count++;
    if (count >= samplesPerBucket && bucket < buckets) {
      lows[bucket] = sumL / count;
      mids[bucket] = sumM / count;
      highs[bucket] = sumH / count;
      bucket++; sumL = sumM = sumH = 0; count = 0;
    }
  }
  // normalize each band
  const norm = (arr) => {
    let m = 0;
    for (const v of arr) if (v > m) m = v;
    if (m > 0) for (let i = 0; i < arr.length; i++) arr[i] /= m;
  };
  norm(lows); norm(mids); norm(highs);
  return { lows, mids, highs };
}
