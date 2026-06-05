// Shared sampler bank state. Buffers live on audio.sampler; this slice
// holds display metadata (slot label + color + last-triggered timestamp for glow).

export const initialSampler = {
  slots: new Array(8).fill(null), // { name, color, durationSec, lastTriggeredAt }
};
