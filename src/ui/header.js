import { theme } from './theme.js';
import * as P from './primitives.js';

export function drawHeader(ctx, b, state, regionsOut) {
  P.panel(ctx, b, { fill: theme.panel, border: theme.border, radius: 0 });

  P.text(ctx, 'notdj', b.x + 20, b.y + 18, { color: theme.deckA, size: 18, weight: 700 });
  P.text(ctx, 'TOUCH EDITION', b.x + 90, b.y + 24, { color: theme.muted, size: 9, weight: 600 });

  // Center status readouts: master level, booth, headphones, rec, output device
  const cx = b.x + b.w / 2;
  const devLabel = (state.ui?.outputDevice || 'Default').replace(/\(.*?\)/g, '').trim();
  const truncated = devLabel.length > 18 ? devLabel.slice(0, 16) + '…' : devLabel;
  const items = [
    { label: 'MASTER', value: '0 DB', color: theme.text },
    { label: 'BOOTH', value: '-3 DB', color: theme.text },
    { label: 'PHONES', value: '65%', color: theme.green },
    { label: 'REC', value: state.mixer?.recording ? '●' : '○', color: state.mixer?.recording ? theme.red : theme.muted },
    { label: 'OUT', value: truncated, color: theme.muted },
  ];
  const itemW = 85;
  const totalW = items.length * itemW;
  let x = cx - totalW / 2;
  for (const it of items) {
    P.text(ctx, it.label, x, b.y + 14, { color: theme.muted, size: 9, weight: 600 });
    P.text(ctx, it.value, x, b.y + 30, { color: it.color, size: it.label === 'OUT' ? 10 : 11, weight: 700 });
    x += itemW;
  }

  // right side buttons
  const btnW = 80, btnH = 32, gap = 8;
  const right = b.x + b.w - 16;
  const settings = { x: right - btnH, y: b.y + (b.h - btnH) / 2, w: btnH, h: btnH };
  const rec = { x: settings.x - btnW - gap, y: settings.y, w: btnW, h: btnH };
  const lib = { x: rec.x - btnW - gap, y: settings.y, w: btnW, h: btnH };
  const intentW = 96;
  const intent = { x: lib.x - intentW - gap, y: settings.y, w: intentW, h: btnH };

  const setIntent = state.ui?.setIntent || 'sustain';
  const intentColor = setIntent === 'build' ? theme.green : setIntent === 'cooldown' ? theme.cyan : theme.amber;
  P.button(ctx, intent, { label: setIntent.toUpperCase(), color: intentColor, bg: theme.panel2 });
  regionsOut.push({ type: 'setIntentCycle', bounds: intent });

  P.button(ctx, lib, { label: 'LIBRARY', bg: theme.panel2 });
  regionsOut.push({ type: 'libraryToggle', bounds: lib });

  P.button(ctx, rec, { label: state.mixer?.recording ? '■ STOP' : 'REC', active: state.mixer?.recording, color: theme.red, glow: state.mixer?.recording });
  regionsOut.push({ type: 'recordToggle', bounds: rec });

  P.button(ctx, settings, { label: '⚙', bg: theme.panel2 });
  regionsOut.push({ type: 'settingsToggle', bounds: settings });
}
