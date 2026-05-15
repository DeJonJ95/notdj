export const createDeckState = (id) => ({
  id,
  track: null,            // { id, title, artist, durationSec, bpm, key, sampleRate, channels }
  buffer: null,           // AudioBuffer (kept off the snapshot path; stored by ref)
  peaks: null,            // Float32Array of waveform peaks
  bandedPeaks: null,      // { lows, mids, highs } Float32Arrays for frequency-colored waveform
  isPlaying: false,
  isCued: false,
  positionSec: 0,         // sampled by RAF; authoritative position lives in DeckPlayer
  tempo: 1.0,             // playbackRate multiplier
  pitchSemis: 0,          // key shift (independent of tempo, applied in Phase 6)
  syncEnabled: false,
  isMaster: false,
  quantize: true,
  slip: false,
  hotCues: new Array(8).fill(null),  // { positionSec, color, label }
  loop: null,             // { startSec, endSec, active }
  beatJump: 1,            // bars
  padMode: 'hotcue',      // hotcue | loop | beatjump | sampler | pitchplay | slip | beatloop | keyboard
});

export const initialDecks = [createDeckState('A'), createDeckState('B')];
