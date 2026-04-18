const createChannel = (deckId) => ({
  deckId,                 // bound to deck A or B
  trim: 1.0,              // 0..2 (input gain trim)
  eq: { low: 0, mid: 0, high: 0 },   // -26..+6 dB-ish per knob position (-1..+1 normalized)
  filter: 0,              // -1 (full LPF) .. 0 (off) .. +1 (full HPF)
  colorFx: 'filter',      // filter | noise | dub | pitch | sweep
  volume: 0.85,           // 0..1 channel fader
  cueOn: false,           // headphone cue routing
  crossfaderAssign: deckId === 'A' ? 'L' : 'R', // L | R | center
  peakL: 0, peakR: 0,     // live VU sampling (written by analyser tap)
});

export const initialMixer = {
  channels: [createChannel('A'), createChannel('B')],
  crossfader: 0,          // -1..+1
  crossfaderCurve: 'sharp', // smooth | sharp | dipped
  masterVolume: 0.85,
  boothVolume: 0.7,
  headphoneVolume: 0.6,
  headphoneMix: 0.5,      // 0 = cue only, 1 = master only
  recording: false,
  beatFx: {
    type: 'echo',         // delay | echo | reverb | flanger | filter | trans | roll | spiral
    target: 'master',     // ch1 | ch2 | master
    beatDiv: '1/4',       // 1/16 1/8 1/4 1/2 1 2 4 8 16
    level: 0.5,
    on: false,
  },
};
