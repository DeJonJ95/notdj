export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const remap = (v, a1, b1, a2, b2) => lerp(a2, b2, invLerp(a1, b1, v));

// dB conversion for EQ / gain knobs. range: -inf..+12 dB typical.
export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(g, 1e-6));

// Equal-power crossfade: x in [-1, 1] (-1 = full A, +1 = full B)
export const crossfadeGains = (x) => {
  const t = (clamp(x, -1, 1) + 1) * 0.5; // 0..1
  return { a: Math.cos(t * Math.PI * 0.5), b: Math.sin(t * Math.PI * 0.5) };
};
