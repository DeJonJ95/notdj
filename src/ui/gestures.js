// Pointer-based gesture engine for the controller canvas.
// Each active finger tracks a region + a gesture handler. Handlers receive
// { type: 'start' | 'move' | 'end', dx, dy, x, y, region } and dispatch into actions.

import { hitTest } from './layout.js';
import { clamp } from '../utils/math.js';
import { store } from '../state/index.js';

export class GestureEngine {
  constructor(canvas, getRegions, actions) {
    this.canvas = canvas;
    this.getRegions = getRegions;
    this.actions = actions;
    this.pointers = new Map(); // pointerId -> { region, startX, startY, lastX, lastY, handler, snapshot }

    canvas.addEventListener('pointerdown', this.onDown, { passive: false });
    canvas.addEventListener('pointermove', this.onMove, { passive: false });
    canvas.addEventListener('pointerup', this.onUp, { passive: false });
    canvas.addEventListener('pointercancel', this.onUp, { passive: false });
  }

  _localCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  onDown = (e) => {
    e.preventDefault();
    const { x, y } = this._localCoords(e);
    const region = hitTest(this.getRegions(), x, y);
    if (!region) return;
    const handler = this._handlerFor(region);
    if (!handler) return;
    this.canvas.setPointerCapture(e.pointerId);
    const entry = { region, startX: x, startY: y, lastX: x, lastY: y, handler, snapshot: handler.start ? handler.start(region) : null };
    this.pointers.set(e.pointerId, entry);
    store.set('ui', { pressed: { type: region.type, deckId: region.deckId, padIndex: region.padIndex } });
  };

  onMove = (e) => {
    const entry = this.pointers.get(e.pointerId);
    if (!entry) return;
    e.preventDefault();
    const { x, y } = this._localCoords(e);
    const dx = x - entry.startX;
    const dy = y - entry.startY;
    entry.handler.move(entry.region, { x, y, dx, dy, snapshot: entry.snapshot });
    entry.lastX = x; entry.lastY = y;
  };

  onUp = (e) => {
    const entry = this.pointers.get(e.pointerId);
    if (!entry) return;
    const { x, y } = this._localCoords(e);
    if (entry.handler.end) entry.handler.end(entry.region, { x, y, snapshot: entry.snapshot });
    this.pointers.delete(e.pointerId);
    try { this.canvas.releasePointerCapture(e.pointerId); } catch {}
    if (this.pointers.size === 0) store.set('ui', { pressed: null });
  };

  _handlerFor(region) {
    return this.handlers[region.type] || null;
  }

  handlers = {
    // Knob: vertical drag = value change. Right-drag works too. Range maps 200px of travel to full sweep.
    knob: {
      start: (r) => ({ initialValue: this.actions.getKnobValue(r) }),
      move: (r, { dy, snapshot }) => {
        const delta = -dy / 200; // 200px = full sweep
        const next = clamp(snapshot.initialValue + delta * 2, -1, 1);
        this.actions.setKnobValue(r, next);
      },
    },
    volume: {
      start: (r) => ({ initial: this.actions.getChannelVolume(r.chIdx), height: r.bounds.h }),
      move: (r, { dy, snapshot }) => {
        const next = clamp(snapshot.initial - dy / snapshot.height, 0, 1);
        this.actions.setChannelVolume(r.chIdx, next);
      },
    },
    pitch: {
      start: (r) => ({ initial: this.actions.getDeckTempo(r.deckId), height: r.bounds.h }),
      move: (r, { dy, snapshot }) => {
        // 16% range across full slider, vertical drag inverted (up = faster like Pioneer pitch fader inverted? CDJ has up = slower)
        // We'll do up = faster to match expectations of the +pitch range being at the bottom (Pioneer convention)
        const deltaPct = (dy / snapshot.height) * 32; // full sweep = ±16
        const pctInitial = (snapshot.initial - 1) * 100;
        const nextPct = clamp(pctInitial + deltaPct, -16, 16);
        this.actions.setDeckTempo(r.deckId, 1 + nextPct / 100);
      },
    },
    crossfader: {
      start: (r) => ({ initial: this.actions.getCrossfader(), width: r.bounds.w }),
      move: (r, { dx, snapshot }) => {
        const next = clamp(snapshot.initial + (dx / snapshot.width) * 2, -1, 1);
        this.actions.setCrossfader(next);
      },
    },
    masterVol: {
      start: (r) => ({ initial: this.actions.getMasterVol() }),
      move: (r, { dy, snapshot }) => {
        const next = clamp(snapshot.initial - dy / 200, 0, 1);
        this.actions.setMasterVol(next);
      },
    },
    jog: {
      // Side ring: pitch bend. Center: scratch (Phase 6 — for now, scrub).
      start: (r, { x, y } = {}) => ({ initial: this.actions.getDeckPosition(r.deckId) }),
      move: (r, { dx, dy, snapshot }) => {
        // Horizontal drag = scrub in seconds (1 px = 0.01s)
        this.actions.scrub(r.deckId, snapshot.initial + dx * 0.01);
      },
    },
    overview: {
      start: (r, ctx) => null,
      move: (r, { x }) => {
        const t01 = clamp((x - r.bounds.x) / r.bounds.w, 0, 1);
        this.actions.seekTo01(r.deckId, t01);
      },
      end: (r, { x }) => {
        const t01 = clamp((x - r.bounds.x) / r.bounds.w, 0, 1);
        this.actions.seekTo01(r.deckId, t01);
      },
    },
    // Detail waveform: horizontal drag = scrub at fine resolution
    detail: {
      start: (r) => ({ initial: this.actions.getDeckPosition(r.deckId) }),
      move: (r, { dx, snapshot }) => {
        // 1 px ≈ 0.04 sec (matches 8-sec window across ~200 px-wide region)
        this.actions.scrub(r.deckId, snapshot.initial - dx * 0.04);
      },
    },
    padMode: { start: (r) => this.actions.setPadMode(r.deckId, r.mode), move: () => {} },
    pad: {
      start: (r) => {
        const mode = this.actions.getPadMode(r.deckId);
        store.set('ui', { pressing: { deckId: r.deckId, padIndex: r.padIndex, startedAt: performance.now() } });
        // Sampler mode defers to release so we can distinguish tap vs long-press.
        if (mode === 'sampler') {
          return { mode, startTime: performance.now(), longFired: false };
        }
        // Hotcue / loop / beatjump: act immediately on press. Long-press (1000ms)
        // available for hotcue clear — generous threshold avoids accidental deletes.
        this.actions.padDown(r.deckId, r.padIndex);
        const timer = setTimeout(() => {
          store.set('ui', { pressing: null });
          this.actions.padLongPress(r.deckId, r.padIndex);
        }, 1000);
        return { mode, timer };
      },
      move: (r, { dx, dy, snapshot }) => {
        if (snapshot.timer && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
          clearTimeout(snapshot.timer);
          snapshot.timer = null;
        }
      },
      end: (r, { snapshot }) => {
        store.set('ui', { pressing: null });
        if (snapshot.mode === 'sampler') {
          const duration = performance.now() - snapshot.startTime;
          if (duration >= 500) this.actions.padLongPress(r.deckId, r.padIndex);
          else this.actions.padDown(r.deckId, r.padIndex);
          return;
        }
        if (snapshot.timer) clearTimeout(snapshot.timer);
        this.actions.padUp(r.deckId, r.padIndex);
      },
    },
    play: { start: (r) => this.actions.togglePlay(r.deckId), move: () => {} },
    cue: { start: (r) => this.actions.cuePressed(r.deckId), move: () => {}, end: (r) => this.actions.cueReleased(r.deckId) },
    sync: { start: (r) => this.actions.toggleSync(r.deckId), move: () => {} },
    smartSync: { start: (r) => this.actions.smartSync(r.deckId), move: () => {} },
    'xfAssign': { start: (r) => this.actions.setAssign(r.chIdx, r.assign), move: () => {} },
    'cue-toggle': { start: (r) => this.actions.toggleChannelCue(r.chIdx), move: () => {} },
    fxStrip: { start: (r) => this.actions.fxAction(r.deckId, r.action), move: () => {} },
    beatDiv: { start: (r) => this.actions.setBeatDiv(r.div), move: () => {} },
    beatFxOn: { start: () => this.actions.toggleBeatFx(), move: () => {} },
    beatFxTarget: { start: (r) => this.actions.setBeatFxTarget(r.target), move: () => {} },
    beatFxType: { start: () => this.actions.cycleBeatFxType(), move: () => {} },
    beatFxLevel: {
      start: () => ({ initial: this.actions.getBeatFxLevel() }),
      move: (r, { dy, snapshot }) => this.actions.setBeatFxLevel(clamp(snapshot.initial - dy / 200, 0, 1)),
    },
    libraryToggle: { start: () => this.actions.toggleLibrary(), move: () => {} },
    recordToggle: { start: () => this.actions.toggleRecord(), move: () => {} },
    settingsToggle: { start: () => this.actions.toggleSettings(), move: () => {} },
    setIntentCycle: { start: () => this.actions.cycleSetIntent(), move: () => {} },
  };
}
