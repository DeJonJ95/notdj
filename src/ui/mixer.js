import { theme, deckColor } from './theme.js';
import { mixerLayout, channelLayout } from './layout.js';
import * as P from './primitives.js';

const BEAT_DIVS = ['1/16', '1/8', '1/4', '1/2', '1', '2', '4', '8', '16'];
const FX_TYPES = ['ECHO', 'DELAY', 'REVERB', 'FLNGR', 'FILTR', 'TRANS', 'ROLL', 'SPRL'];

export function drawMixer(ctx, rect, mixerState, decksState, regionsOut) {
  const L = mixerLayout(rect);
  P.panel(ctx, rect, { fill: theme.panel, border: theme.border, radius: 12 });

  P.text(ctx, 'MIXER', L.head.x + 4, L.head.y + 2, { color: theme.text, weight: 700, size: 12 });
  P.text(ctx, '2-CH', L.head.x + L.head.w - 4, L.head.y + 4, { color: theme.muted, size: 10, align: 'right', weight: 500 });

  // channel strips
  drawChannel(ctx, L.ch1, 0, mixerState.channels[0], decksState[0], regionsOut);
  drawChannel(ctx, L.ch2, 1, mixerState.channels[1], decksState[1], regionsOut);

  // beat FX
  drawBeatFx(ctx, L.beatFx, mixerState, regionsOut);

  // master section (crossfader + master VU + master vol)
  drawMaster(ctx, L.master, mixerState, regionsOut, decksState);
}

function drawChannel(ctx, rect, chIdx, ch, deck, regionsOut) {
  const color = deckColor(ch.deckId);
  const C = channelLayout(rect, ch.deckId);

  P.panel(ctx, rect, { fill: theme.panel2, border: theme.border, radius: 8 });

  P.text(ctx, `CH ${chIdx + 1}`, C.label.x + C.label.w / 2, C.label.y + 4, { color, size: 10, weight: 700, align: 'center' });

  const knobBindings = [
    { key: 'trim', value: ch.trim - 1, label: 'TRIM', bipolar: true },
    { key: 'high', value: ch.eq.high, label: 'HI', bipolar: true },
    { key: 'mid',  value: ch.eq.mid,  label: 'MID', bipolar: true },
    { key: 'low',  value: ch.eq.low,  label: 'LOW', bipolar: true },
    { key: 'filter', value: ch.filter, label: 'FILTER', bipolar: true },
  ];
  for (let i = 0; i < knobBindings.length; i++) {
    const k = knobBindings[i];
    const b = C.knobs[i];
    P.knob(ctx, b, k.value, { color, label: k.label, bipolar: k.bipolar });
    regionsOut.push({ type: 'knob', chIdx, knob: k.key, bounds: b });
  }

  // cue button
  P.button(ctx, C.cue, { label: 'CUE', active: ch.cueOn, color, glow: ch.cueOn });
  regionsOut.push({ type: 'cue-toggle', chIdx, bounds: C.cue });

  // volume fader (with live peak from VU)
  P.fader(ctx, C.fader, ch.volume, { color, showLeds: true });
  regionsOut.push({ type: 'volume', chIdx, bounds: C.fader });

  // crossfader assign tri-state
  drawXfAssign(ctx, C.xfAssign, chIdx, ch, regionsOut);
}

function drawXfAssign(ctx, b, chIdx, ch, regionsOut) {
  const opts = ['L', 'C', 'R'];
  const w = b.w / 3;
  for (let i = 0; i < 3; i++) {
    const cell = { x: b.x + i * w, y: b.y, w: w - 2, h: b.h };
    const active = ch.crossfaderAssign === opts[i];
    P.button(ctx, cell, { label: opts[i], active, color: theme.text, bg: theme.panel });
    regionsOut.push({ type: 'xfAssign', chIdx, assign: opts[i], bounds: cell });
  }
}

function drawBeatFx(ctx, rect, mixer, regionsOut) {
  P.panel(ctx, rect, { fill: theme.panel2, border: theme.border, radius: 8 });
  const pad = 8;
  P.text(ctx, 'BEAT FX', rect.x + pad, rect.y + 6, { color: theme.text, size: 10, weight: 700 });
  const typeBounds = { x: rect.x + rect.w - 90, y: rect.y + 2, w: 84, h: 16 };
  P.text(ctx, mixer.beatFx.type.toUpperCase(), typeBounds.x + typeBounds.w, rect.y + 6, { color: theme.cyan, size: 10, weight: 700, align: 'right' });
  regionsOut.push({ type: 'beatFxType', bounds: typeBounds });

  // beat divisor row
  const divsY = rect.y + 24;
  const divsW = rect.w - pad * 2;
  const cellW = divsW / BEAT_DIVS.length;
  for (let i = 0; i < BEAT_DIVS.length; i++) {
    const cell = { x: rect.x + pad + i * cellW, y: divsY, w: cellW - 1, h: 20 };
    const active = mixer.beatFx.beatDiv === BEAT_DIVS[i];
    P.button(ctx, cell, { label: BEAT_DIVS[i], active, color: theme.cyan });
    regionsOut.push({ type: 'beatDiv', div: BEAT_DIVS[i], bounds: cell });
  }

  // level knob + on/off
  const ctlY = divsY + 28;
  const knobB = { x: rect.x + pad, y: ctlY, w: 60, h: 50 };
  P.knob(ctx, knobB, mixer.beatFx.level * 2 - 1, { color: theme.cyan, label: 'LEVEL' });
  regionsOut.push({ type: 'beatFxLevel', bounds: knobB });

  const onB = { x: rect.x + rect.w - pad - 60, y: ctlY + 10, w: 60, h: 30 };
  P.button(ctx, onB, { label: mixer.beatFx.on ? 'ON' : 'OFF', active: mixer.beatFx.on, color: theme.cyan, glow: mixer.beatFx.on });
  regionsOut.push({ type: 'beatFxOn', bounds: onB });

  // target selector
  const targets = ['CH1', 'CH2', 'MST'];
  const targetMap = ['ch1', 'ch2', 'master'];
  const targetsX = rect.x + pad + 70;
  const targetW = 38;
  for (let i = 0; i < targets.length; i++) {
    const cell = { x: targetsX + i * (targetW + 2), y: ctlY + 10, w: targetW, h: 30 };
    const active = mixer.beatFx.target === targetMap[i];
    P.button(ctx, cell, { label: targets[i], active, color: theme.cyan });
    regionsOut.push({ type: 'beatFxTarget', target: targetMap[i], bounds: cell });
  }
}

function drawMaster(ctx, rect, mixer, regionsOut, decksState) {
  P.panel(ctx, rect, { fill: theme.panel2, border: theme.border, radius: 8 });
  const pad = 8;
  P.text(ctx, 'MASTER', rect.x + pad, rect.y + 6, { color: theme.text, size: 10, weight: 700 });
  P.text(ctx, 'PHASE', rect.x + rect.w - pad, rect.y + 6, { color: theme.muted, size: 9, weight: 600, align: 'right' });

  // Phase scope
  const phaseB = { x: rect.x + pad, y: rect.y + 18, w: rect.w - pad * 2, h: 10 };
  P.phaseScope(ctx, phaseB, decksState[0], decksState[1]);

  // crossfader
  const xfB = { x: rect.x + pad, y: rect.y + 32, w: rect.w - pad * 2, h: 36 };
  P.hfader(ctx, xfB, mixer.crossfader, {});
  regionsOut.push({ type: 'crossfader', bounds: xfB });

  // master vu (two columns) + master gain knob
  const vuW = 14;
  const vuTop = rect.y + 78;
  const vuH = rect.h - 86;
  const vuL = { x: rect.x + pad, y: vuTop, w: vuW, h: vuH };
  const vuR = { x: rect.x + pad + vuW + 4, y: vuTop, w: vuW, h: vuH };
  P.vumeter(ctx, vuL, mixer.channels[0].peakL || 0);
  P.vumeter(ctx, vuR, mixer.channels[1].peakL || 0);

  const knobB = { x: rect.x + rect.w - pad - 56, y: vuTop, w: 56, h: 56 };
  P.knob(ctx, knobB, mixer.masterVolume * 2 - 1, { color: theme.green, label: 'MASTER', bipolar: false });
  regionsOut.push({ type: 'masterVol', bounds: knobB });
}
