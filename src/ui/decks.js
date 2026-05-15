import { theme, deckColor } from './theme.js';
import { deckLayout } from './layout.js';
import { store } from '../state/index.js';
import * as P from './primitives.js';

const PAD_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const PAD_MODES = [
  { id: 'hotcue', label: 'HOT CUE' },
  { id: 'loop', label: 'LOOP' },
  { id: 'beatjump', label: 'BEAT JUMP' },
  { id: 'sampler', label: 'SAMPLER' },
];

export function drawDeck(ctx, rect, deckId, fullState, regionsOut, pressed, pressing) {
  const deckIdx = deckId === 'A' ? 0 : 1;
  const deckState = fullState.decks[deckIdx];
  const layout = deckLayout(rect, deckId);
  const color = deckColor(deckId);

  // panel background
  P.panel(ctx, rect, { fill: theme.panel, border: theme.border, radius: 12 });

  // header row
  P.text(ctx, `DECK ${deckId}`, layout.head.x + 4, layout.head.y + 2, { color, weight: 700, size: 13 });
  P.text(ctx, deckState.isMaster ? 'MASTER · CDJ · XDJ' : 'CDJ · XDJ', layout.head.x + layout.head.w - 4, layout.head.y + 4, { color: deckState.isMaster ? color : theme.muted, size: 10, align: 'right', weight: 500 });

  // track info card
  drawTrackCard(ctx, layout, deckState, color);
  regionsOut.push({ type: 'detail', deckId, bounds: layout.detail });

  // overview waveform
  P.waveOverview(ctx, layout.overview, deckState, color);
  regionsOut.push({ type: 'overview', deckId, bounds: layout.overview });

  // pads grid (8 = 4 rows x 2 cols)
  drawPads(ctx, layout.pads, deckId, deckState, color, regionsOut, pressed, pressing, fullState);

  // jog wheel
  P.jogWheel(ctx, layout.jog, {
    color,
    positionSec: deckState.positionSec,
    bpm: deckState.track?.bpm || 120,
    isPlaying: deckState.isPlaying,
    label: deckId,
  });
  regionsOut.push({ type: 'jog', deckId, bounds: layout.jog });

  // pitch fader (-16 .. +16 %)
  drawPitch(ctx, layout.pitch, deckState, color, regionsOut, deckId);

  // pad mode selector
  drawPadModes(ctx, layout.padMode, deckId, deckState, color, regionsOut, pressed);

  // FX / loop / beat strip
  drawFxStrip(ctx, layout.fxStrip, deckId, deckState, color, regionsOut, pressed);

  // transport
  drawTransport(ctx, layout.transport, deckId, deckState, color, regionsOut, pressed);
}

function drawTrackCard(ctx, layout, state, color) {
  P.panel(ctx, layout.track, { fill: '#0f0f12', border: theme.border, radius: 8 });
  const t = state.track;
  const m = layout.trackMeta;

  // Meta row: NOW PLAYING + title/artist on left, big BPM right
  P.text(ctx, 'NOW PLAYING', m.x, m.y, { color, size: 9, weight: 700 });
  if (t) {
    P.text(ctx, t.title, m.x, m.y + 14, { color: theme.text, size: 15, weight: 600 });
    P.text(ctx, t.artist || '—', m.x, m.y + 32, { color: theme.muted, size: 11 });
    P.text(ctx, t.bpm.toFixed(1), m.x + m.w, m.y + 4, { color, size: 26, weight: 700, align: 'right' });
    P.text(ctx, 'BPM', m.x + m.w, m.y + 32, { color, size: 9, weight: 600, align: 'right' });
  } else {
    P.text(ctx, 'drop a file to load', m.x, m.y + 18, { color: theme.muted, size: 12 });
  }

  // Detail waveform
  P.waveDetail(ctx, layout.detail, state, color, { windowSec: 8 });

  // Time row
  const tr = layout.trackTime;
  if (t) {
    P.text(ctx, fmtTime(state.positionSec), tr.x, tr.y, { color: theme.text, size: 10, weight: 600 });
    P.text(ctx, `KEY ${t.key || '—'}`, tr.x + tr.w / 2, tr.y, { color: theme.muted, size: 10, align: 'center', weight: 600 });
    P.text(ctx, '-' + fmtTime(Math.max(0, t.durationSec - state.positionSec)), tr.x + tr.w, tr.y, { color: theme.text, size: 10, align: 'right', weight: 600 });
  }
}

function drawPads(ctx, b, deckId, state, color, regionsOut, pressed, pressing, fullState) {
  const cols = 2, rows = 4;
  const gap = 4;
  const cellW = (b.w - gap * (cols - 1)) / cols;
  const cellH = (b.h - gap * (rows - 1)) / rows;
  const isLongPressing = pressing?.deckId === deckId;
  const longPressProgress = isLongPressing ? Math.min(1, (performance.now() - pressing.startedAt) / 1000) : 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const cell = { x: b.x + c * (cellW + gap), y: b.y + r * (cellH + gap), w: cellW, h: cellH };
      let active = false;
      let label = PAD_LABELS[idx];
      if (state.padMode === 'hotcue') {
        active = state.hotCues[idx] != null;
      } else if (state.padMode === 'beatjump') {
        label = ['1', '2', '4', '8', '16', '32', '64', '128'][idx];
      } else if (state.padMode === 'loop') {
        label = ['1/16', '1/8', '1/4', '1/2', '1', '2', '4', '8'][idx];
      } else if (state.padMode === 'sampler') {
        const slot = fullState?.sampler?.slots[idx];
        if (slot) {
          active = !!slot.active; // pulsing glow while playing
          label = slot.name.slice(0, 4);
        }
      }
      const isPressed = pressed?.type === 'pad' && pressed?.deckId === deckId && pressed?.padIndex === idx;
      const isPendingDelete = pressing?.padIndex === idx && state.padMode === 'hotcue' && active && longPressProgress > 0;
      P.pad(ctx, cell, { active, color, label, pressed: isPressed, pendingDelete: isPendingDelete, deleteProgress: longPressProgress });
      regionsOut.push({ type: 'pad', deckId, padIndex: idx, bounds: cell });
    }
  }
}

function drawPadModes(ctx, b, deckId, state, color, regionsOut, pressed) {
  const gap = 4;
  const cellW = (b.w - gap * (PAD_MODES.length - 1)) / PAD_MODES.length;
  for (let i = 0; i < PAD_MODES.length; i++) {
    const cell = { x: b.x + i * (cellW + gap), y: b.y, w: cellW, h: b.h };
    const active = state.padMode === PAD_MODES[i].id;
    const isPressed = pressed?.type === 'padMode' && pressed?.deckId === deckId && pressed?.mode === PAD_MODES[i].id;
    P.button(ctx, cell, { label: PAD_MODES[i].label, active, color, glow: active, pressed: isPressed });
    regionsOut.push({ type: 'padMode', deckId, mode: PAD_MODES[i].id, bounds: cell });
  }
}

function drawPitch(ctx, b, state, color, regionsOut, deckId) {
  const pct = (state.tempo - 1) * 100;
  const value = 0.5 - pct / 32; // top is -16%, bottom is +16%
  P.fader(ctx, b, value, { color, showLeds: false });
  P.text(ctx, 'PITCH', b.x + b.w / 2, b.y + 2, { color: theme.muted, size: 9, align: 'center', weight: 600 });
  P.text(ctx, `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, b.x + b.w / 2, b.y + b.h - 12, { color: theme.text, size: 9, align: 'center', weight: 600 });
  regionsOut.push({ type: 'pitch', deckId, bounds: b });
}

function drawFxStrip(ctx, b, deckId, state, color, regionsOut, pressed) {
  const items = [
    { label: 'LOOP IN', id: 'loopIn' },
    { label: 'LOOP OUT', id: 'loopOut' },
    { label: '1/2 ×', id: 'loopHalf' },
    { label: '2 ×', id: 'loopDouble' },
    { label: '◀ BEAT', id: 'beatBack' },
    { label: 'BEAT ▶', id: 'beatFwd' },
    { label: 'SLIP', id: 'slip' },
    { label: 'QUANT', id: 'quant' },
  ];
  const gap = 4;
  const cellW = (b.w - gap * (items.length - 1)) / items.length;
  for (let i = 0; i < items.length; i++) {
    const cell = { x: b.x + i * (cellW + gap), y: b.y, w: cellW, h: b.h };
    const active = (items[i].id === 'slip' && state.slip) || (items[i].id === 'quant' && state.quantize) || (items[i].id === 'loopIn' && state.loop?.active);
    const isPressed = pressed?.type === 'fxStrip' && pressed?.deckId === deckId && pressed?.action === items[i].id;
    P.button(ctx, cell, { label: items[i].label, active, color, glow: active, pressed: isPressed });
    regionsOut.push({ type: 'fxStrip', deckId, action: items[i].id, bounds: cell });
  }
}

function drawTransport(ctx, b, deckId, state, color, regionsOut, pressed) {
  const gap = 8;
  const w = (b.w - gap * 2) / 3;
  const cue = { x: b.x, y: b.y, w, h: b.h };
  const play = { x: b.x + w + gap, y: b.y, w, h: b.h };
  const sync = { x: b.x + (w + gap) * 2, y: b.y, w, h: b.h };

  P.button(ctx, cue, { label: 'CUE', bg: theme.panel2, pressed: pressed?.type === 'cue' && pressed?.deckId === deckId });
  regionsOut.push({ type: 'cue', deckId, bounds: cue });

  P.button(ctx, play, { label: state.isPlaying ? 'PAUSE' : 'PLAY', active: state.isPlaying, color, glow: state.isPlaying, pressed: pressed?.type === 'play' && pressed?.deckId === deckId });
  regionsOut.push({ type: 'play', deckId, bounds: play });

  P.button(ctx, sync, { label: 'SYNC', active: state.syncEnabled, color, glow: state.syncEnabled, pressed: pressed?.type === 'sync' && pressed?.deckId === deckId });
  regionsOut.push({ type: 'sync', deckId, bounds: sync });
}

function fmtTime(sec) {
  if (!isFinite(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
