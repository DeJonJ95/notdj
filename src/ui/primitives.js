// Canvas drawing primitives. All accept (ctx, bounds, state, opts).
// State is the value being represented (0..1 for faders, -1..1 for knobs, etc.).

import { theme } from './theme.js';
import { clamp } from '../utils/math.js';

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function panel(ctx, b, { fill = theme.panel, border = theme.border, radius = 10 } = {}) {
  roundRect(ctx, b.x, b.y, b.w, b.h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export function text(ctx, str, x, y, { color = theme.text, size = 12, weight = 400, align = 'left', baseline = 'top', font = 'system-ui' } = {}) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${font}, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
}

// Rotary knob with thin indicator line. value -1..+1.
export function knob(ctx, b, value, { color = theme.deckA, label = null, valueLabel = null, bipolar = true, indicatorOnly = true } = {}) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2 - (label ? 6 : 0);
  const r = Math.min(b.w, b.h) * 0.36;

  // body
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = theme.panel2; ctx.fill();
  ctx.strokeStyle = theme.border; ctx.lineWidth = 1; ctx.stroke();

  // value arc (subtle backdrop)
  const a0 = Math.PI * 0.75;
  const a1 = Math.PI * 2.25;
  if (!indicatorOnly) {
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, a0, a1);
    ctx.strokeStyle = theme.dim; ctx.lineWidth = 2; ctx.stroke();
    const v = bipolar ? (value + 1) / 2 : value;
    const aEnd = a0 + (a1 - a0) * clamp(v, 0, 1);
    ctx.beginPath();
    if (bipolar) {
      const aMid = (a0 + a1) / 2;
      ctx.arc(cx, cy, r + 4, Math.min(aMid, aEnd), Math.max(aMid, aEnd));
    } else {
      ctx.arc(cx, cy, r + 4, a0, aEnd);
    }
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  }

  // indicator line
  const norm = bipolar ? value : value * 2 - 1;
  const ang = a0 + ((norm + 1) / 2) * (a1 - a0);
  const x0 = cx + Math.cos(ang) * (r * 0.32);
  const y0 = cy + Math.sin(ang) * (r * 0.32);
  const x1 = cx + Math.cos(ang) * (r * 0.92);
  const y1 = cy + Math.sin(ang) * (r * 0.92);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();

  if (label) {
    text(ctx, label, cx, b.y + b.h - 2, { color: theme.muted, size: 9, align: 'center', baseline: 'bottom' });
  }
}

// Vertical fader. value 0..1 (bottom..top)
export function fader(ctx, b, value, { color = theme.deckA, showLeds = true, label = null } = {}) {
  const trackW = 6;
  const trackX = b.x + b.w / 2 - trackW / 2;
  const trackY = b.y + 8;
  const trackH = b.h - 16 - (label ? 12 : 0);

  // track
  roundRect(ctx, trackX, trackY, trackW, trackH, 3);
  ctx.fillStyle = theme.panel2; ctx.fill();
  ctx.strokeStyle = theme.border; ctx.lineWidth = 1; ctx.stroke();

  // led strip (left side)
  if (showLeds) {
    const ledX = trackX - 8;
    const segs = 10;
    const segH = trackH / segs;
    for (let i = 0; i < segs; i++) {
      const segVal = 1 - i / segs;
      const lit = value >= segVal - 0.001;
      ctx.fillStyle = lit ? (i < 2 ? theme.red : i < 4 ? theme.amber : theme.green) : theme.dim;
      ctx.fillRect(ledX, trackY + i * segH + 1, 3, segH - 2);
    }
  }

  // cap
  const capH = 26, capW = 32;
  const capY = trackY + (1 - clamp(value, 0, 1)) * trackH - capH / 2;
  const capX = b.x + b.w / 2 - capW / 2;
  roundRect(ctx, capX, capY, capW, capH, 4);
  ctx.fillStyle = theme.panel3; ctx.fill();
  ctx.strokeStyle = theme.borderLit; ctx.lineWidth = 1; ctx.stroke();
  // grip line
  ctx.fillStyle = color;
  ctx.fillRect(capX + 4, capY + capH / 2 - 1, capW - 8, 2);

  if (label) text(ctx, label, b.x + b.w / 2, b.y + b.h - 2, { color: theme.muted, size: 9, align: 'center', baseline: 'bottom' });
}

// Horizontal fader (crossfader). value -1..+1
export function hfader(ctx, b, value, { label = null } = {}) {
  const trackH = 6;
  const trackY = b.y + b.h / 2 - trackH / 2 - (label ? 6 : 0);
  const trackX = b.x + 8;
  const trackW = b.w - 16;
  roundRect(ctx, trackX, trackY, trackW, trackH, 3);
  ctx.fillStyle = theme.panel2; ctx.fill();
  ctx.strokeStyle = theme.border; ctx.lineWidth = 1; ctx.stroke();

  // notches
  ctx.fillStyle = theme.dim;
  for (let i = 0; i <= 8; i++) {
    const x = trackX + (trackW / 8) * i;
    ctx.fillRect(x - 0.5, trackY + trackH + 2, 1, 4);
  }

  const capW = 28, capH = 36;
  const capX = trackX + (clamp(value, -1, 1) + 1) / 2 * trackW - capW / 2;
  const capY = trackY + trackH / 2 - capH / 2;
  roundRect(ctx, capX, capY, capW, capH, 4);
  ctx.fillStyle = theme.panel3; ctx.fill();
  ctx.strokeStyle = theme.borderLit; ctx.stroke();
  ctx.fillStyle = theme.text;
  ctx.fillRect(capX + capW / 2 - 0.5, capY + 6, 1, capH - 12);

  if (label) text(ctx, label, b.x + b.w / 2, b.y + b.h - 2, { color: theme.muted, size: 9, align: 'center', baseline: 'bottom' });
}

// Performance pad. active = boolean, color = deck color
export function pad(ctx, b, { active = false, color = theme.deckA, label = '', pressed = false, pendingDelete = false, deleteProgress = 0 } = {}) {
  const inset = 3;
  const x = b.x + inset, y = b.y + inset, w = b.w - inset * 2, h = b.h - inset * 2;
  roundRect(ctx, x, y, w, h, 6);
  if (active) {
    ctx.fillStyle = color;
    ctx.fill();
    // glow
    ctx.shadowColor = color; ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    text(ctx, label, x + w / 2, y + h / 2, { color: '#fff', size: 14, weight: 600, align: 'center', baseline: 'middle' });
  } else {
    ctx.fillStyle = theme.panel2;
    ctx.fill();
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, label, x + w / 2, y + h / 2, { color: theme.muted, size: 14, weight: 500, align: 'center', baseline: 'middle' });
  }
  if (pressed) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.shadowColor = color; ctx.shadowBlur = 24;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  if (pendingDelete && deleteProgress > 0) {
    // Pulsing red border — brighter the longer you hold
    const alpha = Math.min(1, deleteProgress * 2);
    const pulseW = 2 + deleteProgress * 2;
    ctx.strokeStyle = `rgba(239,68,68,${alpha})`;
    ctx.lineWidth = pulseW;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 10 + deleteProgress * 16;
    roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 6);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

// LED-style VU meter, vertical. value 0..1, peak 0..1
export function vumeter(ctx, b, value, peak = 0) {
  const segs = 18;
  const segH = b.h / segs;
  for (let i = 0; i < segs; i++) {
    const segVal = 1 - i / segs;
    const lit = value >= segVal - 0.001;
    const c = i < 2 ? theme.red : i < 5 ? theme.amber : theme.green;
    ctx.fillStyle = lit ? c : theme.dim;
    ctx.beginPath();
    ctx.arc(b.x + b.w / 2, b.y + i * segH + segH / 2, Math.min(b.w / 2, segH / 2) - 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (peak > 0) {
    const peakIdx = Math.floor((1 - peak) * segs);
    const y = b.y + peakIdx * segH + segH / 2;
    ctx.strokeStyle = theme.text;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(b.x + 2, y);
    ctx.lineTo(b.x + b.w - 2, y);
    ctx.stroke();
  }
}

// Jog wheel / platter. positionSec used for spinning indicator, color = deck.
export function jogWheel(ctx, b, { color = theme.deckA, positionSec = 0, bpm = 120, isPlaying = false, label = 'A' } = {}) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const rOuter = Math.min(b.w, b.h) / 2 - 4;
  const rInner = rOuter * 0.55;
  const rHub = rOuter * 0.25;

  // outer ring (touch surface for pitch bend)
  ctx.beginPath(); ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fillStyle = theme.panel2; ctx.fill();
  ctx.strokeStyle = theme.border; ctx.lineWidth = 2; ctx.stroke();

  // inner platter
  const grad = ctx.createRadialGradient(cx, cy - rInner * 0.3, rInner * 0.2, cx, cy, rInner);
  grad.addColorStop(0, '#28282f');
  grad.addColorStop(1, '#0a0a0d');
  ctx.beginPath(); ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = theme.borderLit; ctx.lineWidth = 1; ctx.stroke();

  // spinning marker — full revolution per beat
  const beatsElapsed = (positionSec * bpm) / 60;
  const ang = (beatsElapsed % 1) * Math.PI * 2 - Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(ang) * rInner * 0.92, cy + Math.sin(ang) * rInner * 0.92);
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();

  // arc highlight on outer ring during play
  if (isPlaying) {
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter - 1, ang - 0.3, ang + 0.3);
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
  }

  // hub
  ctx.beginPath(); ctx.arc(cx, cy, rHub, 0, Math.PI * 2);
  ctx.fillStyle = theme.panel3; ctx.fill();
  ctx.strokeStyle = theme.borderLit; ctx.stroke();

  // deck letter
  text(ctx, label, cx, cy, { color: color, size: rHub * 0.9, weight: 700, align: 'center', baseline: 'middle' });
}

// Overview waveform: full-track preview with playhead, hot cue markers, loop range.
export function waveOverview(ctx, b, deckState, color) {
  roundRect(ctx, b.x, b.y, b.w, b.h, 4); ctx.fillStyle = '#0a0a0d'; ctx.fill();
  const peaks = deckState.peaks;
  const t = deckState.track;
  if (!peaks || !t) return;
  ctx.save();
  ctx.beginPath(); roundRect(ctx, b.x, b.y, b.w, b.h, 4); ctx.clip();

  const buckets = peaks.length / 2;
  const bw = b.w / buckets;
  const midY = b.y + b.h / 2;
  ctx.fillStyle = color;
  for (let i = 0; i < buckets; i++) {
    const min = peaks[i * 2], max = peaks[i * 2 + 1];
    const y1 = midY - max * b.h * 0.45;
    const y2 = midY - min * b.h * 0.45;
    ctx.fillRect(b.x + i * bw, y1, Math.max(1, bw), Math.max(1, y2 - y1));
  }

  const pos01 = deckState.positionSec / t.durationSec;
  // played overlay
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(b.x, b.y, pos01 * b.w, b.h);

  // loop region
  if (deckState.loop && deckState.loop.active && t.durationSec) {
    const xs = b.x + (deckState.loop.startSec / t.durationSec) * b.w;
    const xe = b.x + (deckState.loop.endSec / t.durationSec) * b.w;
    ctx.fillStyle = 'rgba(34,211,238,0.22)';
    ctx.fillRect(xs, b.y, Math.max(2, xe - xs), b.h);
  }

  // hot cue ticks
  for (let i = 0; i < deckState.hotCues.length; i++) {
    const cue = deckState.hotCues[i];
    if (!cue) continue;
    const x = b.x + (cue.positionSec / t.durationSec) * b.w;
    ctx.fillStyle = cue.color || color;
    ctx.fillRect(x, b.y, 1, b.h);
  }

  // playhead
  const phX = b.x + pos01 * b.w;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(phX, b.y); ctx.lineTo(phX, b.y + b.h); ctx.stroke();
  ctx.restore();
}

// Detail waveform with scrolling playhead in the center (CDJ style).
// Renders frequency-banded peaks (blue=low, green=mid, red=high) when available.
export function waveDetail(ctx, b, deckState, color, { windowSec = 8 } = {}) {
  roundRect(ctx, b.x, b.y, b.w, b.h, 4); ctx.fillStyle = '#06060a'; ctx.fill();
  const t = deckState.track;
  if (!t || !deckState.peaks) return;
  const durationSec = t.durationSec;
  const positionSec = deckState.positionSec;
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, b.x, b.y, b.w, b.h, 4);
  ctx.clip();

  const peaks = deckState.peaks;
  const banded = deckState.bandedPeaks;
  const buckets = peaks.length / 2;
  const bucketsPerSec = buckets / durationSec;
  const visibleBuckets = windowSec * bucketsPerSec;
  const startBucket = positionSec * bucketsPerSec - visibleBuckets / 2;
  const pxPerBucket = b.w / visibleBuckets;
  const midY = b.y + b.h / 2;
  const i0 = Math.max(0, Math.floor(startBucket));
  const i1 = Math.min(buckets, Math.ceil(startBucket + visibleBuckets));

  for (let i = i0; i < i1; i++) {
    const x = b.x + (i - startBucket) * pxPerBucket;
    const w = Math.max(1, pxPerBucket);
    if (banded) {
      const lo = banded.lows[i] || 0;
      const mi = banded.mids[i] || 0;
      const hi = banded.highs[i] || 0;
      const total = Math.min(1, lo + mi + hi);
      const h = total * b.h * 0.45;
      // lows = blue at bottom, mids = green middle, highs = red top of bar
      const loH = (lo / (total || 1)) * h;
      const miH = (mi / (total || 1)) * h;
      const hiH = (hi / (total || 1)) * h;
      // upper half
      let y = midY;
      ctx.fillStyle = '#ef4444'; ctx.fillRect(x, y - hiH, w, hiH); y -= hiH;
      ctx.fillStyle = '#4ade80'; ctx.fillRect(x, y - miH, w, miH); y -= miH;
      ctx.fillStyle = '#3b82f6'; ctx.fillRect(x, y - loH, w, loH);
      // lower half mirror
      y = midY;
      ctx.fillStyle = '#ef4444'; ctx.fillRect(x, y, w, hiH); y += hiH;
      ctx.fillStyle = '#4ade80'; ctx.fillRect(x, y, w, miH); y += miH;
      ctx.fillStyle = '#3b82f6'; ctx.fillRect(x, y, w, loH);
    } else {
      const min = peaks[i * 2], max = peaks[i * 2 + 1];
      ctx.fillStyle = color;
      const y1 = midY - max * b.h * 0.42;
      const y2 = midY - min * b.h * 0.42;
      ctx.fillRect(x, y1, w, Math.max(1, y2 - y1));
    }
  }

  // Beat grid
  if (t.bpm > 0) {
    const beatSec = 60 / t.bpm;
    const startTime = positionSec - windowSec / 2;
    const firstBeatN = Math.ceil(startTime / beatSec);
    const lastBeatN = Math.floor((positionSec + windowSec / 2) / beatSec);
    for (let n = firstBeatN; n <= lastBeatN; n++) {
      const t0 = n * beatSec;
      const x = b.x + ((t0 - startTime) / windowSec) * b.w;
      const isDownbeat = n % 4 === 0;
      ctx.strokeStyle = isDownbeat ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = isDownbeat ? 1 : 0.5;
      ctx.beginPath(); ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.h); ctx.stroke();
      if (isDownbeat) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '8px system-ui';
        ctx.fillText(String(n / 4 + 1), x + 2, b.y + 9);
      }
    }
  }

  // Loop region overlay
  if (deckState.loop && deckState.loop.active) {
    const ls = deckState.loop.startSec, le = deckState.loop.endSec;
    const startTime = positionSec - windowSec / 2;
    const xs = b.x + ((ls - startTime) / windowSec) * b.w;
    const xe = b.x + ((le - startTime) / windowSec) * b.w;
    ctx.fillStyle = 'rgba(34,211,238,0.18)';
    ctx.fillRect(xs, b.y, xe - xs, b.h);
    ctx.strokeStyle = 'rgba(34,211,238,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xs, b.y); ctx.lineTo(xs, b.y + b.h);
    ctx.moveTo(xe, b.y); ctx.lineTo(xe, b.y + b.h);
    ctx.stroke();
  }

  // Hot cue flags
  for (let i = 0; i < deckState.hotCues.length; i++) {
    const cue = deckState.hotCues[i];
    if (!cue) continue;
    const startTime = positionSec - windowSec / 2;
    const x = b.x + ((cue.positionSec - startTime) / windowSec) * b.w;
    if (x < b.x - 8 || x > b.x + b.w + 8) continue;
    ctx.fillStyle = cue.color || color;
    ctx.fillRect(x, b.y, 1.5, b.h);
    // flag at top
    ctx.beginPath();
    ctx.moveTo(x, b.y);
    ctx.lineTo(x + 10, b.y);
    ctx.lineTo(x + 10, b.y + 8);
    ctx.lineTo(x + 5, b.y + 10);
    ctx.lineTo(x, b.y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x + 5, b.y + 6);
  }

  // center playhead
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(b.x + b.w / 2, b.y); ctx.lineTo(b.x + b.w / 2, b.y + b.h); ctx.stroke();
  // playhead diamond
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(b.x + b.w / 2, b.y - 2);
  ctx.lineTo(b.x + b.w / 2 + 4, b.y + 2);
  ctx.lineTo(b.x + b.w / 2, b.y + 6);
  ctx.lineTo(b.x + b.w / 2 - 4, b.y + 2);
  ctx.closePath(); ctx.fill();

  ctx.restore();
}

// Phase scope: visualises beat-phase difference between two decks for sync feedback.
export function phaseScope(ctx, b, deckA, deckB) {
  roundRect(ctx, b.x, b.y, b.w, b.h, 3); ctx.fillStyle = '#06060a'; ctx.fill();
  const tA = deckA.track, tB = deckB.track;
  if (!tA || !tB || !tA.bpm || !tB.bpm) return;
  const phaseA = ((deckA.positionSec * tA.bpm) / 60) % 4 / 4;
  const phaseB = ((deckB.positionSec * tB.bpm) / 60) % 4 / 4;
  const xA = b.x + phaseA * b.w;
  const xB = b.x + phaseB * b.w;
  const midY = b.y + b.h / 2;
  ctx.fillStyle = theme.deckA;
  ctx.fillRect(xA - 1, b.y, 2, b.h);
  ctx.fillStyle = theme.deckB;
  ctx.fillRect(xB - 1, b.y, 2, b.h);
  // alignment indicator
  const diff = Math.abs(phaseA - phaseB);
  const aligned = diff < 0.02 || diff > 0.98;
  ctx.fillStyle = aligned ? theme.green : theme.dim;
  ctx.fillRect(b.x + b.w - 6, midY - 2, 4, 4);
}

// Generic rect button with optional active glow and press-indicator overlay.
export function button(ctx, b, { label = '', active = false, color = theme.text, bg = theme.panel2, glow = false, pressed = false } = {}) {
  roundRect(ctx, b.x, b.y, b.w, b.h, 6);
  ctx.fillStyle = active ? color : bg;
  ctx.fill();
  if (!active) {
    ctx.strokeStyle = theme.border; ctx.lineWidth = 1; ctx.stroke();
  } else if (glow) {
    ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
  }
  if (pressed) {
    // Bright press overlay
    ctx.fillStyle = active ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
    roundRect(ctx, b.x, b.y, b.w, b.h, 6);
    ctx.fill();
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  text(ctx, label, b.x + b.w / 2, b.y + b.h / 2, { color: active ? '#fff' : theme.text, size: 11, weight: 600, align: 'center', baseline: 'middle' });
}
