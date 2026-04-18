// Region layout for the full controller. Returns a tree of named rects.
// All bounds are { x, y, w, h }. Coordinates are CSS pixels.

export function computeLayout(width, height) {
  const headerH = 56;
  const mixerW = Math.max(280, Math.min(340, width * 0.22));
  const deckW = (width - mixerW) / 2;

  const top = headerH;
  const bodyH = height - top;

  const header = { x: 0, y: 0, w: width, h: headerH };
  const deckA = { x: 0, y: top, w: deckW, h: bodyH };
  const deckB = { x: deckW + mixerW, y: top, w: deckW, h: bodyH };
  const mixer = { x: deckW, y: top, w: mixerW, h: bodyH };

  return { width, height, header, deckA, deckB, mixer };
}

export function deckLayout(rect, deckId) {
  const pad = 12;
  const inner = inset(rect, pad);

  // Vertical stack:
  // 0. Header strip (deck label, mode, BPM)
  // 1. Track info card containing: meta row + scrolling detail waveform + time/key row
  // 2. Overview waveform (thin strip)
  // 3. Main row: pads | jog wheel | pitch slider
  // 4. Pad mode selector
  // 5. FX/loop/beat strip
  // 6. Transport row (CUE PLAY SYNC)

  const headerH = 28;
  const trackH = 130;
  const overviewH = 24;
  const padModeH = 24;
  const transportH = 50;
  const fxStripH = 38;
  const gap = 6;

  const mainH = inner.h - headerH - trackH - overviewH - padModeH - transportH - fxStripH - gap * 6;

  let y = inner.y;
  const head = { x: inner.x, y, w: inner.w, h: headerH }; y += headerH + gap;
  const track = { x: inner.x, y, w: inner.w, h: trackH }; y += trackH + gap;
  const overview = { x: inner.x, y, w: inner.w, h: overviewH }; y += overviewH + gap;

  const main = { x: inner.x, y, w: inner.w, h: mainH }; y += mainH + gap;
  const padMode = { x: inner.x, y, w: inner.w, h: padModeH }; y += padModeH + gap;
  const fxStrip = { x: inner.x, y, w: inner.w, h: fxStripH }; y += fxStripH + gap;
  const transport = { x: inner.x, y, w: inner.w, h: transportH };

  // Main row sub-layout: pads (left or right depending on deck side), jog center, pitch on inner side.
  // Deck A: pads on LEFT, pitch on RIGHT (so pitch sits next to mixer)
  // Deck B: pitch on LEFT (next to mixer), pads on RIGHT
  const padsW = Math.min(140, main.w * 0.22);
  const pitchW = 56;
  const jogW = main.w - padsW - pitchW - gap * 2;
  const jogSize = Math.min(main.h, jogW);
  const jog = {
    x: main.x + (deckId === 'A' ? padsW + gap : pitchW + gap) + (jogW - jogSize) / 2,
    y: main.y + (main.h - jogSize) / 2,
    w: jogSize, h: jogSize,
  };
  const pads = {
    x: deckId === 'A' ? main.x : main.x + main.w - padsW,
    y: main.y, w: padsW, h: main.h,
  };
  const pitch = {
    x: deckId === 'A' ? main.x + main.w - pitchW : main.x,
    y: main.y, w: pitchW, h: main.h,
  };

  // Subdivide track card into meta row + detail waveform + time row.
  const trackInner = inset(track, 10);
  const trackMetaH = 44;
  const trackTimeH = 14;
  const detailH = trackInner.h - trackMetaH - trackTimeH - 8;
  const trackMeta = { x: trackInner.x, y: trackInner.y, w: trackInner.w, h: trackMetaH };
  const detail = { x: trackInner.x, y: trackInner.y + trackMetaH + 4, w: trackInner.w, h: detailH };
  const trackTime = { x: trackInner.x, y: trackInner.y + trackInner.h - trackTimeH, w: trackInner.w, h: trackTimeH };

  return { head, track, trackMeta, detail, trackTime, overview, main, jog, pads, pitch, padMode, fxStrip, transport };
}

export function mixerLayout(rect) {
  const pad = 12;
  const inner = inset(rect, pad);
  const gap = 8;

  const headH = 28;
  const beatFxH = 110;
  const masterH = 150;
  const bottomCluster = beatFxH + masterH + gap;
  const channelsH = inner.h - headH - bottomCluster - gap * 2;

  let y = inner.y;
  const head = { x: inner.x, y, w: inner.w, h: headH }; y += headH + gap;
  const channels = { x: inner.x, y, w: inner.w, h: channelsH }; y += channelsH + gap;
  const beatFx = { x: inner.x, y, w: inner.w, h: beatFxH }; y += beatFxH + gap;
  const master = { x: inner.x, y, w: inner.w, h: masterH };

  const colW = (channels.w - gap) / 2;
  const ch1 = { x: channels.x, y: channels.y, w: colW, h: channels.h };
  const ch2 = { x: channels.x + colW + gap, y: channels.y, w: colW, h: channels.h };

  return { head, channels, ch1, ch2, beatFx, master };
}

export function channelLayout(rect, deckId) {
  const pad = 8;
  const inner = inset(rect, pad);
  const gap = 6;

  const labelH = 18;
  const knobH = 56;
  const cueH = 28;
  const xfH = 22;
  const faderH = inner.h - labelH - knobH * 5 - cueH - xfH - gap * 8;

  let y = inner.y;
  const label = { x: inner.x, y, w: inner.w, h: labelH }; y += labelH + gap;
  const knobs = ['trim', 'high', 'mid', 'low', 'filter'].map((k) => {
    const r = { id: k, x: inner.x, y, w: inner.w, h: knobH };
    y += knobH + gap;
    return r;
  });
  const cue = { x: inner.x, y, w: inner.w, h: cueH }; y += cueH + gap;
  const fader = { x: inner.x + inner.w * 0.2, y, w: inner.w * 0.6, h: faderH }; y += faderH + gap;
  const xfAssign = { x: inner.x, y, w: inner.w, h: xfH };

  return { label, knobs, cue, fader, xfAssign, deckId };
}

export function inset(r, p) {
  return { x: r.x + p, y: r.y + p, w: r.w - p * 2, h: r.h - p * 2 };
}

export function hitTest(regions, x, y) {
  // Iterate in reverse for topmost-first
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i];
    if (x >= r.bounds.x && x <= r.bounds.x + r.bounds.w && y >= r.bounds.y && y <= r.bounds.y + r.bounds.h) {
      return r;
    }
  }
  return null;
}
