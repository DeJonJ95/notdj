// Smart Sync — automatic harmonic mixing assistant.
//
// Tapping SMART on a deck does:
//   1. Analyze the CURRENT deck's track (BPM, key, energy)
//   2. Scan the library for the best compatible track for the OPPOSITE deck
//   3. Rank by: harmonic key match → BPM closeness → energy similarity → category
//   4. Load the winner to the other deck, enable sync
//   5. If both decks playable: at the next phrase boundary, run a real DJ-style
//      bass-swap crossfade — incoming bass ramps up over first half while
//      outgoing bass cuts on the second half; crossfader rides through.
//
// Harmonic mixing uses the Camelot Wheel (Open Key standard).
//   Same # + letter      = perfect (0)
//   ±1, same letter      = adjacent, very compatible (1)
//   Same #, opp letter   = relative major/minor, very compatible (1)
//   ±1, opp letter       = energy boost / drop, compatible (2)
//   Everything else      = treated as neutral but penalised

import { store } from '../state/index.js';
import { audio } from './audio-engine.js';
import { library } from '../services/library-manager.js';
import { sync } from './sync-engine.js';

// ── Camelot Wheel ──────────────────────────────────────────────────────────
//
// Both sharp AND flat enharmonic spellings map to the same Camelot position
// so dirty tag data ("Db", "C#", "D♭", "C♯") all resolve correctly.

const KEY_MAP = {
  // Major keys → B (bottom of wheel)
  'C':   { num: 8,  letter: 'B' }, 'G':  { num: 9,  letter: 'B' },
  'D':   { num: 10, letter: 'B' }, 'A':  { num: 11, letter: 'B' },
  'E':   { num: 12, letter: 'B' }, 'B':  { num: 1,  letter: 'B' },
  'F':   { num: 7,  letter: 'B' },
  // Black-key majors (both spellings)
  'F#':  { num: 2,  letter: 'B' }, 'Gb': { num: 2,  letter: 'B' },
  'C#':  { num: 3,  letter: 'B' }, 'Db': { num: 3,  letter: 'B' },
  'G#':  { num: 4,  letter: 'B' }, 'Ab': { num: 4,  letter: 'B' },
  'D#':  { num: 5,  letter: 'B' }, 'Eb': { num: 5,  letter: 'B' },
  'A#':  { num: 6,  letter: 'B' }, 'Bb': { num: 6,  letter: 'B' },

  // Minor keys → A (top of wheel)
  'Am':  { num: 8,  letter: 'A' }, 'Em': { num: 9,  letter: 'A' },
  'Bm':  { num: 10, letter: 'A' },
  'F#m': { num: 11, letter: 'A' }, 'Gbm':{ num: 11, letter: 'A' },
  'C#m': { num: 12, letter: 'A' }, 'Dbm':{ num: 12, letter: 'A' },
  'G#m': { num: 1,  letter: 'A' }, 'Abm':{ num: 1,  letter: 'A' },
  'D#m': { num: 2,  letter: 'A' }, 'Ebm':{ num: 2,  letter: 'A' },
  'A#m': { num: 3,  letter: 'A' }, 'Bbm':{ num: 3,  letter: 'A' },
  'Fm':  { num: 4,  letter: 'A' }, 'Cm': { num: 5,  letter: 'A' },
  'Gm':  { num: 6,  letter: 'A' }, 'Dm': { num: 7,  letter: 'A' },
};

// Parse a key string into Camelot { num, letter } or null on failure.
// Handles: "C", "Am", "F#min", "Eb major", "8A", "11B", "—", "C♯", "D♭m"
function parseKey(key) {
  if (!key || key === '—' || key === '-') return null;
  let s = String(key).trim();

  // Normalize unicode accidentals
  s = s.replace(/♯/g, '#').replace(/♭/g, 'b');

  // Already in Camelot notation (e.g. "8A", "12B", "5B")
  const camelotMatch = s.match(/^(\d{1,2})\s*([AB])$/i);
  if (camelotMatch) {
    const num = parseInt(camelotMatch[1], 10);
    if (num >= 1 && num <= 12) return { num, letter: camelotMatch[2].toUpperCase() };
    return null;
  }

  // Strip "major" / "minor" verbose words
  let root = s.replace(/\s*(major|minor|maj|min)\s*/gi, '').trim();

  // Detect minor by trailing 'm' that isn't part of an accidental letter sequence
  // (Am, Cm, F#m all end in m; A, C don't)
  const isMinor = /m$/.test(root);
  if (isMinor) {
    const nk = root.slice(0, -1).trim();
    const candidate = nk + 'm';
    if (KEY_MAP[candidate]) return KEY_MAP[candidate];
  }

  // Direct match for major
  if (KEY_MAP[root]) return KEY_MAP[root];
  // Try as minor as a fallback
  if (KEY_MAP[root + 'm']) return KEY_MAP[root + 'm'];

  return null;
}

// Compute harmonic compatibility between two Camelot positions.
// Returns: 0 (perfect) / 1 (very compatible) / 2 (good) / Infinity (incompatible)
function harmonicDistance(a, b) {
  if (!a || !b) return Infinity;
  if (a.num === b.num && a.letter === b.letter) return 0;
  if (a.num === b.num && a.letter !== b.letter) return 1;
  const adj = (Math.abs(a.num - b.num) === 1) || (a.num === 1 && b.num === 12) || (a.num === 12 && b.num === 1);
  if (adj && a.letter === b.letter) return 1;
  if (adj && a.letter !== b.letter) return 2;
  return Infinity;
}

// ── Reason-text builder for top-candidate explanations ──────────────────

function camelotStr(c) { return c ? `${c.num}${c.letter}` : '?'; }

function buildReasons({ sourceKey, targetKey, harmDist, sourceBpm, targetBpm, sourceEnergy, targetEnergy, srcCat, tgtCat, setIntent, recentlyPlayedMin }) {
  const out = [];
  if (sourceKey && targetKey) {
    if (harmDist === 0) out.push(`Perfect key (${camelotStr(sourceKey)})`);
    else if (harmDist === 1 && sourceKey.letter !== targetKey.letter) out.push(`Relative ${camelotStr(sourceKey)} → ${camelotStr(targetKey)}`);
    else if (harmDist === 1) out.push(`Adjacent key ${camelotStr(sourceKey)} → ${camelotStr(targetKey)}`);
    else if (harmDist === 2) out.push(`Energy move ${camelotStr(sourceKey)} → ${camelotStr(targetKey)}`);
    else out.push(`Key mismatch ${camelotStr(sourceKey)} → ${camelotStr(targetKey)}`);
  }
  if (sourceBpm && targetBpm) {
    // sourceBpm is effective; targetBpm is candidate natural. Stretch needed = (source - target) / target.
    const stretchPct = ((sourceBpm - targetBpm) / targetBpm) * 100;
    if (Math.abs(stretchPct) < 0.5) out.push(`Natural tempo`);
    else out.push(`${stretchPct > 0 ? '+' : ''}${stretchPct.toFixed(1)}% stretch`);
  }
  const eDelta = (targetEnergy ?? 0.5) - (sourceEnergy ?? 0.5);
  if (Math.abs(eDelta) < 0.08) out.push(`Same energy`);
  else if (eDelta > 0) out.push(`Energy build`);
  else out.push(`Energy drop`);
  if (srcCat === 'acapella' && tgtCat === 'instrumental') out.push(`Acapella over instrumental`);
  else if (srcCat === 'instrumental' && tgtCat === 'acapella') out.push(`Acapella drop`);
  if (setIntent && setIntent !== 'sustain') out.push(`${setIntent} intent`);
  if (recentlyPlayedMin !== undefined && recentlyPlayedMin < 60) {
    out.push(`played ${Math.round(recentlyPlayedMin)}m ago`);
  }
  return out;
}

// ── Auto-Mix Animation ────────────────────────────────────────────────────

let activeMix = null; // tracking object for in-progress smart mix

// Smoothly move the crossfader from current position to target over `durationMs`.
function animateCrossfader(target, durationMs, onDone) {
  const start = store.get().mixer.crossfader;
  const startTime = performance.now();
  let raf;

  function tick() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(1, elapsed / durationMs);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const value = start + (target - start) * eased;
    audio.bus.setCrossfader(value);
    store.set('mixer', { crossfader: value });
    if (t < 1) raf = requestAnimationFrame(tick);
    else { raf = null; if (onDone) onDone(); }
  }
  raf = requestAnimationFrame(tick);
  return () => { if (raf) cancelAnimationFrame(raf); };
}

// Animate a channel's low EQ from `from` to `to` over `durationMs`,
// starting after `delayMs`. Updates audio + store so the knob renders the move.
function animateEqLow(chIdx, from, to, durationMs, delayMs = 0) {
  const startTime = performance.now() + delayMs;
  let raf;
  function tick(now) {
    if (now < startTime) { raf = requestAnimationFrame(tick); return; }
    const t = Math.min(1, (now - startTime) / durationMs);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const v = from + (to - from) * eased;
    audio.bus.setEq(chIdx, 'low', v);
    const channels = [...store.get().mixer.channels];
    channels[chIdx] = { ...channels[chIdx], eq: { ...channels[chIdx].eq, low: v } };
    store.set('mixer', { channels });
    if (t < 1) raf = requestAnimationFrame(tick);
    else raf = null;
  }
  raf = requestAnimationFrame(tick);
  return () => { if (raf) cancelAnimationFrame(raf); };
}

// Animate a channel's color-FX filter from `from` to `to` over `durationMs`.
// Value: -1 (full LPF cut) → 0 (open) → +1 (full HPF cut).
// Optional ease function (default: ease-in-out quad).
function animateFilter(chIdx, from, to, durationMs, delayMs = 0, ease) {
  const easeFn = ease || ((t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2));
  const startTime = performance.now() + delayMs;
  let raf;
  function tick(now) {
    if (now < startTime) { raf = requestAnimationFrame(tick); return; }
    const t = Math.min(1, (now - startTime) / durationMs);
    const eased = easeFn(t);
    const v = from + (to - from) * eased;
    audio.bus.setFilter(chIdx, v);
    const channels = [...store.get().mixer.channels];
    channels[chIdx] = { ...channels[chIdx], filter: v };
    store.set('mixer', { channels });
    if (t < 1) raf = requestAnimationFrame(tick);
    else raf = null;
  }
  raf = requestAnimationFrame(tick);
  return () => { if (raf) cancelAnimationFrame(raf); };
}

// Late-curve ease for filter sweeps that should "rise into" a target moment:
// stays at start value for first half, then sweeps cubic-ease-out over second half.
// Calibrated so the filter is mostly closed until ~70% of the animation time,
// then opens sharply right before the drop arrives.
function lateRampEase(t) {
  if (t < 0.5) return 0;
  const tt = (t - 0.5) * 2;
  return 1 - Math.pow(1 - tt, 3);
}

// Animate a channel's mid EQ (vocal band) from `from` to `to`.
function animateEqMid(chIdx, from, to, durationMs, delayMs = 0) {
  const startTime = performance.now() + delayMs;
  let raf;
  function tick(now) {
    if (now < startTime) { raf = requestAnimationFrame(tick); return; }
    const t = Math.min(1, (now - startTime) / durationMs);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const v = from + (to - from) * eased;
    audio.bus.setEq(chIdx, 'mid', v);
    const channels = [...store.get().mixer.channels];
    channels[chIdx] = { ...channels[chIdx], eq: { ...channels[chIdx].eq, mid: v } };
    store.set('mixer', { channels });
    if (t < 1) raf = requestAnimationFrame(tick);
    else raf = null;
  }
  raf = requestAnimationFrame(tick);
  return () => { if (raf) cancelAnimationFrame(raf); };
}

function restoreEqMid(chIdx, value) {
  audio.bus.setEq(chIdx, 'mid', value);
  const channels = [...store.get().mixer.channels];
  channels[chIdx] = { ...channels[chIdx], eq: { ...channels[chIdx].eq, mid: value } };
  store.set('mixer', { channels });
}

// Animate a channel's high EQ from `from` to `to`. Used by high-kill finisher.
function animateEqHigh(chIdx, from, to, durationMs, delayMs = 0) {
  const startTime = performance.now() + delayMs;
  let raf;
  function tick(now) {
    if (now < startTime) { raf = requestAnimationFrame(tick); return; }
    const t = Math.min(1, (now - startTime) / durationMs);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const v = from + (to - from) * eased;
    audio.bus.setEq(chIdx, 'high', v);
    const channels = [...store.get().mixer.channels];
    channels[chIdx] = { ...channels[chIdx], eq: { ...channels[chIdx].eq, high: v } };
    store.set('mixer', { channels });
    if (t < 1) raf = requestAnimationFrame(tick);
    else raf = null;
  }
  raf = requestAnimationFrame(tick);
  return () => { if (raf) cancelAnimationFrame(raf); };
}

function restoreEqHigh(chIdx, value) {
  audio.bus.setEq(chIdx, 'high', value);
  const channels = [...store.get().mixer.channels];
  channels[chIdx] = { ...channels[chIdx], eq: { ...channels[chIdx].eq, high: value } };
  store.set('mixer', { channels });
}

// Animate a channel's volume fader from `from` to `to` over `durationMs`.
// Used by the mashup layering mode to fade the overlay track in/out.
function animateChannelVolume(chIdx, from, to, durationMs, delayMs = 0) {
  const startTime = performance.now() + delayMs;
  let raf;
  function tick(now) {
    if (now < startTime) { raf = requestAnimationFrame(tick); return; }
    const t = Math.min(1, (now - startTime) / durationMs);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const v = from + (to - from) * eased;
    audio.bus.setVolume(chIdx, v);
    const channels = [...store.get().mixer.channels];
    channels[chIdx] = { ...channels[chIdx], volume: v };
    store.set('mixer', { channels });
    if (t < 1) raf = requestAnimationFrame(tick);
    else raf = null;
  }
  raf = requestAnimationFrame(tick);
  return () => { if (raf) cancelAnimationFrame(raf); };
}

// ── Finisher rotation ──────────────────────────────────────────────────────
//
// Five outgoing-tail techniques that get rotated across mixes so no single one
// becomes repetitive. A short "recent" memory blocks anything used in the last
// few mixes from being picked again.

const RECENT_FINISHERS_CAP = 3;
const recentFinishers = [];

function pickFinisher({ bars, technique, setIntent, incomingHasNearDrop }) {
  if (bars < 8 || technique === 'quick-cut') return 'none';

  // Base pool — every long mix has at least these to choose from
  let pool = ['echo', 'reverb', 'high-kill', 'none', 'none'];

  // filter-fade conflicts with techniques that already sweep the color filter
  if (technique === 'bass-swap') pool.push('filter-fade', 'filter-fade');

  // Context biases (push extra copies = increase probability)
  if (setIntent === 'build') pool.push('echo', 'filter-fade');
  if (setIntent === 'cooldown') pool.push('reverb', 'high-kill');
  if (incomingHasNearDrop && bars >= 12) pool.push('echo');

  // Exclude finishers used in the last 3 mixes for variety
  let available = pool.filter((f) => !recentFinishers.includes(f));
  if (available.length === 0) available = pool;

  const picked = available[Math.floor(Math.random() * available.length)];
  recentFinishers.unshift(picked);
  if (recentFinishers.length > RECENT_FINISHERS_CAP) recentFinishers.pop();
  return picked;
}

function applyBeatFxThrow(type, sIdx, level, snapshot) {
  audio.fx.setType(type);
  audio.fx.target = sIdx === 0 ? 'ch1' : 'ch2';
  audio.fx.setBeatDiv('1/2');
  audio.fx.setLevel(level);
  audio.fx.setOn(true);
  store.set('mixer', {
    beatFx: { type, target: sIdx === 0 ? 'ch1' : 'ch2', beatDiv: '1/2', level, on: true },
  });
}

function restoreBeatFx(snapshot) {
  audio.fx.setOn(false);
  audio.fx.setType(snapshot.type);
  audio.fx.target = snapshot.target;
  audio.fx.setBeatDiv(snapshot.beatDiv);
  audio.fx.setLevel(snapshot.level);
  audio.fx.setOn(snapshot.on);
  store.set('mixer', { beatFx: { ...snapshot } });
}

// Probe whether a track has significant high-band content (vocals / open hats) at a given position.
// Reads bandedPeaks.highs averaged over a ~4-bucket window around the position.
function hasVocalAt(libTrack, positionSec) {
  if (!libTrack || !libTrack.bandedPeaks || !libTrack.durationSec) return false;
  const highs = libTrack.bandedPeaks.highs;
  const n = highs.length;
  if (n === 0) return false;
  const bucket = Math.floor((positionSec / libTrack.durationSec) * n);
  const start = Math.max(0, bucket - 4);
  const end = Math.min(n, bucket + 4);
  let sum = 0, count = 0;
  for (let i = start; i < end; i++) { sum += highs[i]; count++; }
  const avg = sum / (count || 1);
  return avg > 0.35;
}

function restoreFilter(chIdx, value) {
  audio.bus.setFilter(chIdx, value);
  const channels = [...store.get().mixer.channels];
  channels[chIdx] = { ...channels[chIdx], filter: value };
  store.set('mixer', { channels });
}

// Wait until the next phrase boundary then fire callback.
function waitForPhrase(deckId, callback, { bars = 4 } = {}) {
  const dp = audio.deck(deckId);
  const deckState = store.get().decks.find(d => d.id === deckId);
  const bpm = deckState?.track?.bpm || 120;
  const beatSec = 60 / bpm;
  const phraseBeats = bars * 4;

  const currentPos = dp.positionSec;
  const beatsElapsed = (currentPos * bpm) / 60;
  const beatsIntoPhrase = beatsElapsed % phraseBeats;
  const secUntilNextPhrase = (phraseBeats - beatsIntoPhrase) * beatSec;
  const delayMs = Math.max(50, secUntilNextPhrase * 1000);
  return setTimeout(callback, delayMs);
}

// Restore EQ low to its snapshot value (used on completion or cancel).
function restoreEqLow(chIdx, value) {
  audio.bus.setEq(chIdx, 'low', value);
  const channels = [...store.get().mixer.channels];
  channels[chIdx] = { ...channels[chIdx], eq: { ...channels[chIdx].eq, low: value } };
  store.set('mixer', { channels });
}

// ── Main API ──────────────────────────────────────────────────────────────

export const smartSync = {

  // Score every library track for compatibility against the source deck.
  // Returns sorted list of { track, harmScore, bpmScore, energyScore, categoryScore, total, reasons[] }.
  findCandidates(deckId, n = 3) {
    const decks = store.get().decks;
    const sourceDeck = decks.find(d => d.id === deckId);
    const targetDeck = decks.find(d => d.id !== deckId);

    const sourceTrack = sourceDeck?.track;
    if (!sourceTrack || !sourceTrack.bpm) return [];

    // CRITICAL: use EFFECTIVE BPM (track.bpm × current tempo multiplier).
    // Otherwise chained mixes accumulate stretch — each pick is matched against the
    // natural BPM, but playback is at effective, so each new track gets stretched
    // further from its natural tempo. By song 5 you can be ~5-7% off → time-stretch
    // artifacts in lows + vocals.
    const sourceTempo = audio.deck(deckId).tempo || 1;
    const sourceBpm = sourceTrack.bpm * sourceTempo;
    const sourceKey = parseKey(sourceTrack.key);
    const sourceLibTrack = library.tracks.find(t => t.id === sourceTrack.id);
    const sourceEnergy = sourceLibTrack?.energy ?? 0.5;
    const tracks = library.tracks;
    if (!tracks.length) return [];

    const excludeIds = new Set();
    if (targetDeck?.track?.id) excludeIds.add(targetDeck.track.id);
    if (sourceTrack?.id) excludeIds.add(sourceTrack.id);

    // ── History + intent context ──────────────────────────────────────────
    const ui = store.get().ui;
    const setIntent = ui.setIntent || 'sustain';
    const history = ui.mixHistory || [];
    const now = Date.now();
    const recentMs15 = 15 * 60 * 1000;  // 15 min
    const recentMs60 = 60 * 60 * 1000;  // 60 min
    const recentTrackIds = new Map(); // trackId -> minutesAgo
    for (const h of history) {
      const ageMin = (now - h.loadedAt) / 60000;
      if (!recentTrackIds.has(h.trackId) || recentTrackIds.get(h.trackId) > ageMin) {
        recentTrackIds.set(h.trackId, ageMin);
      }
    }
    const sourceArtist = (sourceTrack.artist || '').trim().toLowerCase();

    const ranked = [];

    for (const t of tracks) {
      if (excludeIds.has(t.id)) continue;

      const targetKey = parseKey(t.key);
      let harmDist;
      if (!sourceKey || !targetKey) harmDist = 0;
      else harmDist = harmonicDistance(sourceKey, targetKey);
      const harmScore = harmDist === Infinity ? 10 : 100 - harmDist * 30;

      const bpmRatio = t.bpm ? t.bpm / sourceBpm : 1;
      let bpmScore;
      if (bpmRatio >= 0.95 && bpmRatio <= 1.05) bpmScore = 100;
      else if (bpmRatio >= 0.90 && bpmRatio <= 1.10) bpmScore = 70;
      else if (bpmRatio >= 0.85 && bpmRatio <= 1.15) bpmScore = 40;
      else if (bpmRatio >= 0.75 && bpmRatio <= 1.25) bpmScore = 15;
      else bpmScore = 5;

      const targetEnergy = t.energy ?? 0.5;
      const energyDelta = Math.abs(targetEnergy - sourceEnergy);
      const energyScore = Math.max(0, 100 - energyDelta * 200);
      // Intent-biased energy direction
      const energyDiff = targetEnergy - sourceEnergy;
      let energyDirection = 0;
      if (setIntent === 'build')      energyDirection = energyDiff > 0 ? 20 : -10;
      else if (setIntent === 'cooldown') energyDirection = energyDiff < 0 ? 20 : -10;
      else /* sustain */              energyDirection = Math.abs(energyDiff) < 0.1 ? 10 : -5;

      const srcCat = sourceTrack.category || 'full';
      const tgtCat = t.category || 'full';
      let categoryScore = 0;
      if (srcCat === 'acapella' && tgtCat === 'instrumental') categoryScore = 100;
      else if (srcCat === 'instrumental' && tgtCat === 'acapella') categoryScore = 100;
      else if (srcCat === 'acapella' && tgtCat === 'full') categoryScore = 20;
      else if (srcCat === 'full' && tgtCat === 'acapella') categoryScore = 20;
      else if (srcCat === 'instrumental' && tgtCat === 'full') categoryScore = 10;
      else if (srcCat === 'full' && tgtCat === 'instrumental') categoryScore = 10;
      else if (srcCat === 'acapella' && tgtCat === 'acapella') categoryScore = -100;

      // ── History penalty ──────────────────────────────────────────────
      let historyPenalty = 0;
      const ageMin = recentTrackIds.get(t.id);
      if (ageMin !== undefined) {
        if (ageMin < 15) historyPenalty = -300;       // very recently played, hard avoid
        else if (ageMin < 60) historyPenalty = -100;  // played within the hour, mild avoid
        else historyPenalty = -20;                    // played within the session
      }
      // Same-artist back-to-back penalty (skipped for mashup pairings, where it's intentional)
      const targetArtist = (t.artist || '').trim().toLowerCase();
      const sameArtist = sourceArtist && targetArtist && sourceArtist === targetArtist;
      const isMashupPair = (srcCat === 'acapella' && tgtCat === 'instrumental') || (srcCat === 'instrumental' && tgtCat === 'acapella');
      if (sameArtist && !isMashupPair) historyPenalty -= 30;

      const total = harmScore * 3 + bpmScore * 2 + energyScore + energyDirection + categoryScore + historyPenalty;

      const reasons = buildReasons({
        sourceKey, targetKey, harmDist,
        sourceBpm, targetBpm: t.bpm,
        sourceEnergy, targetEnergy,
        srcCat, tgtCat,
        setIntent,
        recentlyPlayedMin: ageMin,
      });

      ranked.push({ track: t, harmScore, bpmScore, energyScore, categoryScore, historyPenalty, total, reasons });
    }

    ranked.sort((a, b) => b.total - a.total);
    return ranked.slice(0, n);
  },

  // Convenience: return the single best match.
  findMatch(deckId) {
    const top = this.findCandidates(deckId, 1);
    return top[0] || null;
  },

  // Execute the full smart sync + auto-mix workflow.
  async execute(deckId) {
    if (store.get().ui.smartSyncActive) {
      this.cancel();
      return;
    }

    const decks = store.get().decks;
    const sourceDeck = decks.find(d => d.id === deckId);
    const targetId = deckId === 'A' ? 'B' : 'A';

    const match = this.findMatch(deckId);
    if (!match) {
      const count = library.tracks.length;
      const otherTrack = store.get().decks.find(d => d.id !== deckId)?.track;
      let msg;
      if (count === 0) msg = 'Library empty — import tracks first';
      else if (otherTrack && count <= 2) msg = `Only "${otherTrack.title}" on other deck — nothing else to load`;
      else msg = `No match found in ${count} tracks`;
      store.set('ui', { smartSyncStatus: msg });
      setTimeout(() => store.set('ui', { smartSyncStatus: null }), 3000);
      return;
    }

    const { track: matchTrack, harmScore, bpmScore, energyScore, reasons } = match;
    const reasonText = reasons.slice(0, 2).join(' · ');
    store.set('ui', { smartSyncActive: targetId, smartSyncStatus: `→ ${matchTrack.title} · ${reasonText}` });

    // Load match to opposite deck
    const { actions } = await import('../ui/actions.js');
    await actions.loadFromLibrary(targetId, matchTrack);

    const tIdx = targetId === 'A' ? 0 : 1;
    store.setIn('decks', tIdx, { syncEnabled: true });
    sync.setMaster(deckId);

    // ── Position incoming track based on structure + mashup intent ──────
    // Default: skip the intro pad and start at the body (introEndSec).
    const incomingDp = audio.deck(targetId);
    const matchOnLib = library.tracks.find(t => t.id === matchTrack.id) || matchTrack;
    let incomingStart = Math.max(0, matchOnLib.introEndSec || matchOnLib.firstBeatSec || 0);
    let incomingEntryLabel = 'body';

    const srcCat = sourceDeck.track.category || 'full';
    const tgtCat = matchTrack.category || 'full';
    const isMashup = (srcCat === 'acapella' && (tgtCat === 'instrumental' || tgtCat === 'full')) ||
                     ((srcCat === 'instrumental' || srcCat === 'full') && tgtCat === 'acapella');
    // Mashup positioning is computed AFTER we know the mix start time (deferred below).

    if (incomingStart > 0 && incomingStart < incomingDp.durationSec - 30) {
      incomingDp.seek(incomingStart);
      store.setIn('decks', tIdx, { positionSec: incomingStart });
    }

    sync.align(targetId);

    const sourcePlaying = sourceDeck?.isPlaying;
    if (!sourcePlaying) {
      store.set('ui', { smartSyncActive: null, smartSyncStatus: `Loaded to Deck ${targetId} · ${reasonText}` });
      setTimeout(() => store.set('ui', { smartSyncStatus: null }), 3000);
      return;
    }

    const sIdx = deckId === 'A' ? 0 : 1;
    // Effective BPM — what's actually playing. All phrase/mix timing must use this.
    const sourceTempoNow = audio.deck(deckId).tempo || 1;
    const bpm = (sourceDeck.track?.bpm || 120) * sourceTempoNow;
    const beatSec = 60 / bpm;
    const phraseSec = 16 * beatSec;

    // ── Dynamic mix duration based on compatibility + energy + intent ────
    const sourceLibTrack2 = library.tracks.find(t => t.id === sourceDeck.track.id);
    const sourceOutroStart = sourceLibTrack2?.outroStartSec ?? sourceDeck.track.durationSec;

    const compat = (harmScore + bpmScore + energyScore) / 300;
    let bars = Math.max(4, Math.min(16, Math.round(4 + 12 * compat)));

    // Energy delta: big shifts deserve short mixes (long fades expose the gap)
    const sourceEnergyVal = sourceLibTrack2?.energy ?? 0.5;
    const targetEnergyVal = matchOnLib.energy ?? 0.5;
    const energyDelta = targetEnergyVal - sourceEnergyVal;
    const absEnergyDelta = Math.abs(energyDelta);
    if (absEnergyDelta > 0.3) bars = Math.min(bars, 4);
    else if (absEnergyDelta > 0.2) bars = Math.min(bars, 8);

    // Intent pulling against natural energy flow = shorter (don't drag through a mood shift)
    const setIntent = store.get().ui.setIntent || 'sustain';
    if (setIntent === 'build' && energyDelta > 0.15) bars = Math.min(bars, 10);
    if (setIntent === 'cooldown' && energyDelta < -0.15) bars = Math.min(bars, 10);
    // Mashups stay long
    if (isMashup) bars = Math.max(bars, 8);

    // ── "Mix now" timing — next phrase boundary from current source position ─
    const sourcePosNow = audio.deck(deckId).positionSec;
    const beatsElapsed = (sourcePosNow * bpm) / 60;
    const beatsIntoPhrase = beatsElapsed % 16;
    const secUntilMix = (16 - beatsIntoPhrase) * beatSec;
    const phraseDelayMs = Math.max(50, secUntilMix * 1000);
    const mixStartInSource = sourcePosNow + secUntilMix;

    // ── Cap mix duration by available body ────────────────────────────────
    // The groove loop will hold the source body if it has the room. If even a
    // 2-bar loop won't fit, shrink the mix so it ends before outro.
    const crossfadeDurationNoLoop = (bars * 4 * 60 / bpm) * 1000;
    const mixEndInSource = mixStartInSource + crossfadeDurationNoLoop / 1000;
    if (mixEndInSource > sourceOutroStart && (sourceOutroStart - mixStartInSource) < 8 * beatSec) {
      const safeBars = Math.max(2, Math.floor((sourceOutroStart - mixStartInSource - 2) / (4 * beatSec)));
      bars = Math.min(bars, safeBars);
    }

    const crossfadeDuration = (bars * 4 * 60 / bpm) * 1000;

    // ── Mashup positioning (now that we know mixStartInSource) ───────────
    if (isMashup) {
      const sourceMixStartToOutro = Math.max(0, sourceOutroStart - mixStartInSource);
      const vocalAnchor = matchOnLib.firstVocalSec || matchOnLib.introEndSec || 0;
      const mashupStart = Math.max(0, vocalAnchor - sourceMixStartToOutro);
      if (mashupStart < incomingDp.durationSec - 30 && Math.abs(mashupStart - incomingStart) > 1) {
        incomingDp.seek(mashupStart);
        store.setIn('decks', tIdx, { positionSec: mashupStart });
        incomingStart = mashupStart;
        incomingEntryLabel = 'vocal';
      }
    } else {
      // ── Drop-at-midpoint positioning ──────────────────────────────────
      // If the incoming has a detectable drop, position so it lands at the
      // crossfader midpoint — the drop arrives exactly as both decks blend 50/50.
      const drop = matchOnLib.firstDropSec || 0;
      const introEnd = matchOnLib.introEndSec || matchOnLib.firstBeatSec || 0;
      if (drop > introEnd + 4) {
        const dropArrivalTimeSec = crossfadeDuration / 2 / 1000;
        const candidate = drop - dropArrivalTimeSec;
        if (candidate >= introEnd) {
          if (Math.abs(candidate - incomingStart) > 1) {
            incomingDp.seek(candidate);
            store.setIn('decks', tIdx, { positionSec: candidate });
          }
          incomingStart = candidate;
          incomingEntryLabel = 'drop@mid';
        }
      }
    }

    // ── Hot cues on incoming for manual recall ────────────────────────────
    const incomingHotCues = new Array(8).fill(null);
    const incomingColor = targetId === 'A' ? '#ff6a1a' : '#ff3d5a';
    incomingHotCues[0] = { positionSec: incomingStart, color: incomingColor, label: incomingEntryLabel };
    const incomingOutroStart = matchOnLib.outroStartSec;
    if (incomingOutroStart && incomingOutroStart > incomingStart + 30 && incomingOutroStart < incomingDp.durationSec) {
      incomingHotCues[1] = { positionSec: incomingOutroStart, color: incomingColor, label: 'outro' };
    }
    store.setIn('decks', tIdx, { hotCues: incomingHotCues });

    // ── Transition technique selection ────────────────────────────────────
    const incomingHasNearDrop = (matchOnLib.firstDropSec || 0) > (matchOnLib.introEndSec || 0) + 4;
    let technique = 'bass-swap';
    if (bars <= 3) {
      technique = 'quick-cut';
    } else if (absEnergyDelta > 0.22) {
      technique = 'hpf-lift';
    } else if (incomingHasNearDrop && bars >= 10 && !isMashup) {
      technique = 'lpf-open';
    }

    // ── Add-ons (rare, only when context truly calls for them) ───────────
    const srcHasVocals = hasVocalAt(sourceLibTrack2, mixStartInSource + crossfadeDuration / 2000);
    const tgtHasVocals = hasVocalAt(matchOnLib, incomingStart + crossfadeDuration / 2000);

    // Mid kill: only with smooth bass-swap technique (hpf-lift already kills mids).
    // Requires both tracks to have vocals AND a long-enough mix to ride.
    const useMidKill = bars >= 8 && technique === 'bass-swap' && srcHasVocals && tgtHasVocals;

    // Finisher — rotating outgoing-tail technique with recency avoidance.
    // Possible: 'echo', 'reverb', 'filter-fade', 'high-kill', 'none'
    const finisher = pickFinisher({ bars, technique, setIntent, incomingHasNearDrop });

    // ── Groove hold loop — AUDIBLE during the FIRST HALF of mix ────────
    // 2 bars by default so the wrap is short enough to actually HEAR (4-bar
    // wraps land on phrase boundaries and sound like natural music).
    // For mixes ≥ 10 bars, schedule a 1-bar trim just before midpoint for a
    // mild "stutter into the bass swap" build-up.
    const useGrooveLoop = bars >= 6 && !isMashup && technique !== 'quick-cut';
    let grooveLoop = null;
    let useGrooveTrim = false;
    if (useGrooveLoop) {
      const beatSecLocal = 60 / bpm;
      const grooveStart = mixStartInSource;
      const availableSec = sourceOutroStart - grooveStart;
      // Want at least 8 bars of body for a clean 2-bar loop with room to play out
      const grooveBars = availableSec >= 8 * beatSecLocal ? 2 : 0;
      if (grooveBars >= 2) {
        grooveLoop = {
          startSec: grooveStart,
          endSec: grooveStart + grooveBars * 4 * beatSecLocal,
          bars: grooveBars,
        };
        useGrooveTrim = bars >= 10;
      }
    }

    // ── Status text ───────────────────────────────────────────────────────
    const etaTxt = secUntilMix > 6 ? `in ${Math.round(secUntilMix)}s` : `next phrase`;
    const loopTxt = grooveLoop ? ` · ${grooveLoop.bars}b loop${useGrooveTrim ? '→1b' : ''}` : '';
    const addonTxt = (useMidKill ? ' · mid kill' : '') +
                     (finisher !== 'none' ? ` · ${finisher}` : '');
    const techTxt = ` · ${technique.replace('-', ' ')}`;
    const barsTxt = ` · ${bars}b`;
    store.set('ui', { smartSyncStatus: `${reasonText}${barsTxt}${techTxt}${addonTxt}${loopTxt} · ${etaTxt}` });

    // ── Snapshot EQ + filters + beat FX so we can restore + drive the transition
    const sourceLowSnapshot = store.get().mixer.channels[sIdx].eq.low;
    const targetLowSnapshot = store.get().mixer.channels[tIdx].eq.low;
    const sourceMidSnapshot = store.get().mixer.channels[sIdx].eq.mid;
    const sourceFilterSnapshot = store.get().mixer.channels[sIdx].filter;
    const targetFilterSnapshot = store.get().mixer.channels[tIdx].filter;
    const beatFxSnapshot = { ...store.get().mixer.beatFx };

    const phraseTimer = setTimeout(() => {
      // ── Groove loop: AUDIBLE source loop applied at mix start.
      //    Released at midpoint so source plays naturally during the bass swap.
      let loopReleaseTimer = null;
      let loopTrimTimer = null;
      if (grooveLoop) {
        audio.deck(deckId).setLoop({ startSec: grooveLoop.startSec, endSec: grooveLoop.endSec });
        store.setIn('decks', sIdx, { loop: { ...grooveLoop, active: true } });

        const oneBarSec = 4 * 60 / bpm;
        const midpointMs = crossfadeDuration / 2;

        // Optional 1-bar trim a couple bars before midpoint — audible stutter build
        if (useGrooveTrim) {
          const trimAtMs = Math.max(0, midpointMs - 2 * oneBarSec * 1000);
          loopTrimTimer = setTimeout(() => {
            const dp = audio.deck(deckId);
            const trimEnd = grooveLoop.startSec + oneBarSec;
            dp.setLoop({ startSec: grooveLoop.startSec, endSec: trimEnd });
            store.setIn('decks', sIdx, { loop: { startSec: grooveLoop.startSec, endSec: trimEnd, active: true, bars: 1 } });
          }, trimAtMs);
        }

        // Release at midpoint
        loopReleaseTimer = setTimeout(() => {
          audio.deck(deckId).setLoop(null);
          store.setIn('decks', sIdx, { loop: null });
        }, midpointMs);
      }

      // Tuning constants — chosen so transitions are clear but not jarring.
      const BASS_KILL = -0.6;     // ~-15dB cut on lows (audible reduction, not full kill)
      const HPF_LIFT_MAX = 0.4;   // ~640Hz HPF — thins lows, keeps presence
      const LPF_OPEN_START = -0.7;// ~640Hz LPF — "underwater" but not extreme
      const MID_KILL = -0.4;      // ~-10dB cut on mids — suppress vocals, not silence

      // Pre-kill incoming bass before its first beat plays (except for quick-cut)
      if (technique !== 'quick-cut') restoreEqLow(tIdx, BASS_KILL);
      if (technique === 'lpf-open') restoreFilter(tIdx, LPF_OPEN_START); // start muffled

      audio.deck(targetId).play();
      store.setIn('decks', tIdx, { isPlaying: true });

      // ── MASHUP BRANCH: acapella + instrumental layering ───────────────
      if (isMashup) {
        // Identify bed (beat provider) vs layer (overlay)
        // The bed track loops underneath while the layer plays on top.
        const srcIsAcapella = srcCat === 'acapella';
        const bedIdx = srcIsAcapella ? tIdx : sIdx;
        const layerIdx = srcIsAcapella ? sIdx : tIdx;
        const bedDeckId = srcIsAcapella ? targetId : deckId;
        const layerDeckId = srcIsAcapella ? deckId : targetId;
        const fourBarMs = (4 * 4 * 60 / bpm) * 1000;

        // Route layer to Center so it's heard regardless of crossfader position
        audio.bus.setAssign(layerIdx, 'C');
        const channels = [...store.get().mixer.channels];
        channels[layerIdx] = { ...channels[layerIdx], crossfaderAssign: 'C' };
        store.set('mixer', { channels });

        // Loop the bed deck at its current position (4 bars)
        const bedPos = audio.deck(bedDeckId).positionSec;
        const loopEnd = bedPos + 4 * 4 * 60 / bpm;
        audio.deck(bedDeckId).setLoop({ startSec: bedPos, endSec: loopEnd });
        store.setIn('decks', bedIdx, { loop: { startSec: bedPos, endSec: loopEnd, active: true, bars: 4 } });

        store.set('ui', {
          smartSyncStatus: `Mashup · ${srcIsAcapella ? 'instrumental bed' : 'acapella layer'}`,
        });

        // Fade layer in over 2 bars
        const cancels = [];
        cancels.push(animateChannelVolume(layerIdx, 0, 0.75, fourBarMs / 2));

        // Calculate when the layer's usable content ends
        const layerLibTrack = library.tracks.find(t => t.id === (srcIsAcapella ? sourceTrack.id : matchTrack.id));
        const layerPosition = srcIsAcapella ? audio.deck(deckId).positionSec : incomingStart;
        const layerEndSec = (layerLibTrack?.outroStartSec || (layerLibTrack?.durationSec || 300) - 30);
        const layerRemainingSec = Math.max(8 * 60 / bpm, layerEndSec - layerPosition);

        // Schedule fade-out: animate volume down over 2 bars, ending when layer content is done
        const totalMs = layerRemainingSec * 1000;
        const fadeOutStartMs = Math.max(fourBarMs / 2, totalMs - fourBarMs / 2);
        cancels.push(animateChannelVolume(layerIdx, 0.75, 0, fourBarMs / 2, fadeOutStartMs));

        // Schedule loop release and cleanup after fade-out completes (+ small buffer)
        const cleanupMs = fadeOutStartMs + fourBarMs / 2 + 200;
        activeMix = {
          cancels,
          sIdx, tIdx, bedIdx, layerIdx, bedDeckId, layerDeckId,
          // Capture real snapshot values so cancel() restores safely
          sourceLowSnapshot: store.get().mixer.channels[sIdx].eq.low,
          targetLowSnapshot: store.get().mixer.channels[tIdx].eq.low,
          sourceMidSnapshot: store.get().mixer.channels[sIdx].eq.mid,
          sourceHighSnapshot: store.get().mixer.channels[sIdx].eq.high,
          sourceFilterSnapshot: store.get().mixer.channels[sIdx].filter,
          targetFilterSnapshot: store.get().mixer.channels[tIdx].filter,
          beatFxSnapshot: { ...store.get().mixer.beatFx },
          finisherOnTimer: null, finisherOffTimer: null,
          finishTimeout: null,
          loopReleaseTimer: null,
          loopTrimTimer: null,
          sourceId: bedDeckId,
          technique: 'mashup',
          useMidKill: false, finisher: 'none', useGrooveLoop: false,
          isMashup: true,
        };
        activeMix.finishTimeout = setTimeout(() => {
          audio.deck(bedDeckId).setLoop(null);
          store.setIn('decks', bedIdx, { loop: null });
          store.set('ui', { smartSyncActive: null, smartSyncStatus: 'Mashup complete ✓' });
          setTimeout(() => store.set('ui', { smartSyncStatus: null }), 2000);
          activeMix = null;
        }, cleanupMs);
        return; // ← skip the standard bass-swap / finisher / crossfader flow
      }
      // ── End mashup branch ──────────────────────────────────────────────

      const loopMsg = grooveLoop ? ` · ${grooveLoop.bars}b loop` : '';
      store.set('ui', {
        smartSyncStatus: `Mixing · ${bars}b · ${technique.replace('-', ' ')}${loopMsg}`,
      });

      // ── Animation set per technique ─────────────────────────────────────
      const cancels = [];
      const halfDur = crossfadeDuration / 2;

      if (technique === 'quick-cut') {
        // Snappy: just crossfade, no slow EQ ride. Bass swap compressed into 1 bar at midpoint.
        const oneBar = (4 * 60 / bpm) * 1000;
        cancels.push(animateEqLow(tIdx, targetLowSnapshot, targetLowSnapshot, oneBar)); // no-op for symmetry
        cancels.push(animateEqLow(sIdx, sourceLowSnapshot, BASS_KILL, oneBar, crossfadeDuration - oneBar));
      } else {
        // Default bass swap (applies to bass-swap, hpf-lift, lpf-open)
        cancels.push(animateEqLow(tIdx, BASS_KILL, targetLowSnapshot, halfDur));
        cancels.push(animateEqLow(sIdx, sourceLowSnapshot, BASS_KILL, halfDur, halfDur));
      }

      if (technique === 'hpf-lift') {
        // Outgoing gets a high-pass sweep that thins it out across the mix.
        cancels.push(animateFilter(sIdx, sourceFilterSnapshot, HPF_LIFT_MAX, crossfadeDuration));
      } else if (technique === 'lpf-open') {
        // Incoming starts muffled and opens precisely at the drop midpoint.
        cancels.push(animateFilter(tIdx, LPF_OPEN_START, targetFilterSnapshot, halfDur, 0, lateRampEase));
      }

      // Add-on: gentle mid attenuation on outgoing during second half — pulls vocals away
      if (useMidKill) {
        cancels.push(animateEqMid(sIdx, sourceMidSnapshot, MID_KILL, halfDur, halfDur));
      }

      // ── Finisher — rotating outgoing-tail effect ──────────────────────
      // Five techniques that get applied over the last ~4 bars of the mix.
      // Recency avoidance (pickFinisher) ensures no two mixes in a row feel
      // the same, even when the base transition technique is identical.
      let finisherOnTimer = null;
      let finisherOffTimer = null;
      if (finisher !== 'none') {
        const fourBarsMs = (4 * 4 * 60 / bpm) * 1000;
        const fxStartMs = Math.max(50, crossfadeDuration - fourBarsMs);

        if (finisher === 'echo' || finisher === 'reverb') {
          // Beat-synced FX tail on outgoing channel for the last 4 bars
          finisherOnTimer = setTimeout(() => {
            applyBeatFxThrow(finisher, sIdx, 0.55, beatFxSnapshot);
          }, fxStartMs);
          // Let the tail ring ~2s after mix end, then restore
          finisherOffTimer = setTimeout(() => {
            restoreBeatFx(beatFxSnapshot);
          }, crossfadeDuration + 2000);

        } else if (finisher === 'filter-fade') {
          // Sweep outgoing channel's colour filter from current to full LPF
          // over the last 4 bars — rolls the track off like turning a knob.
          cancels.push(animateFilter(sIdx, sourceFilterSnapshot, -1, fourBarsMs, fxStartMs));

        } else if (finisher === 'high-kill') {
          // Rapid high EQ sweep on outgoing over last 2 bars — pulls out
          // hats / sibilance / cymbals so the track thins into the outro.
          const twoBarsMs = (2 * 4 * 60 / bpm) * 1000;
          const hKillStartMs = Math.max(50, crossfadeDuration - twoBarsMs);
          const sourceHighSnapshot = store.get().mixer.channels[sIdx].eq.high;
          cancels.push(animateEqHigh(sIdx, sourceHighSnapshot, -1, twoBarsMs, hKillStartMs));
        }
      }

      // Crossfader runs the full duration
      const targetCrossfader = targetId === 'A' ? -1 : 1;
      cancels.push(animateCrossfader(targetCrossfader, crossfadeDuration));

      activeMix = {
        cancels,
        sIdx, tIdx,
        sourceLowSnapshot, targetLowSnapshot,
        sourceMidSnapshot, sourceHighSnapshot: null,
        sourceFilterSnapshot, targetFilterSnapshot,
        beatFxSnapshot,
        finisherOnTimer, finisherOffTimer,
        finishTimeout: null,
        loopReleaseTimer,
        loopTrimTimer,
        sourceId: deckId,
        technique,
        useMidKill, finisher, useGrooveLoop,
      };

      activeMix.finishTimeout = setTimeout(() => {
        // Defensive: clear any lingering source loop
        audio.deck(deckId).setLoop(null);
        store.setIn('decks', sIdx, { loop: null });
        audio.deck(deckId).pause();
        store.setIn('decks', sIdx, { isPlaying: false });
        // Restore source EQ + filter for next time the deck is played
        restoreEqLow(sIdx, sourceLowSnapshot);
        if (useMidKill) restoreEqMid(sIdx, sourceMidSnapshot);
        restoreFilter(sIdx, sourceFilterSnapshot);
        // Restore target filter (lpf-open finished at snapshot but be defensive)
        restoreFilter(tIdx, targetFilterSnapshot);
        store.set('ui', { smartSyncActive: null, smartSyncStatus: 'Smart mix complete ✓' });
        setTimeout(() => store.set('ui', { smartSyncStatus: null }), 2000);
        activeMix = null;
      }, crossfadeDuration + 200);
    }, phraseDelayMs);

    // If the user cancels before phrase boundary even fires, kill the timer.
    activeMix = {
      cancels: [],
      sIdx, tIdx,
      sourceLowSnapshot, targetLowSnapshot,
      sourceMidSnapshot,
      sourceFilterSnapshot, targetFilterSnapshot,
      beatFxSnapshot,
      phraseTimer,
      sourceId: deckId,
      finisher,
      isMashup,
    };
  },

  // ── MASHUP MODE: explicit acapella/instrumental layering ──────────────
  //
  // Tapping MASH on a deck finds a complementary track (acapella ↔ instrumental/full),
  // loads it to the other deck, loops the beat-providing track, and layers the other
  // on top. No bass-swap, no crossfader — the bed track plays through uninterrupted.
  async executeMashup(deckId) {
    if (store.get().ui.mashupActive) {
      this.cancel();
      return;
    }

    const decks = store.get().decks;
    const sourceDeck = decks.find(d => d.id === deckId);
    const targetId = deckId === 'A' ? 'B' : 'A';
    const sourceTrack = sourceDeck?.track;

    if (!sourceTrack || !sourceTrack.bpm) {
      store.set('ui', { smartSyncStatus: 'No track on this deck' });
      setTimeout(() => store.set('ui', { smartSyncStatus: null }), 2500);
      return;
    }

    // Find complementary match — bias toward opposite category
    const srcCat = sourceTrack.category || 'full';
    const candidates = this.findCandidates(deckId, 5);
    const complementary = candidates.filter(c => {
      const tgtCat = c.track.category || 'full';
      if (srcCat === 'acapella') return tgtCat === 'instrumental' || tgtCat === 'full';
      if (srcCat === 'instrumental') return tgtCat === 'acapella' || tgtCat === 'full';
      // full source → prefer acapella or instrumental (anything complementary)
      return tgtCat === 'acapella' || tgtCat === 'instrumental';
    });

    const match = complementary.length > 0 ? complementary[0] : candidates[0];
    if (!match) {
      const count = library.tracks.length;
      store.set('ui', { smartSyncStatus: count ? 'No complementary track found' : 'Library empty' });
      setTimeout(() => store.set('ui', { smartSyncStatus: null }), 2500);
      return;
    }

    const matchTrack = match.track;
    const tgtCat = matchTrack.category || 'full';
    const reasonText = match.reasons?.slice(0, 2).join(' · ') || '';

    // Mark mashup active
    store.set('ui', { mashupActive: targetId, smartSyncStatus: `Mashup → ${matchTrack.title} · ${reasonText}` });

    // Load + sync
    const { actions } = await import('../ui/actions.js');
    await actions.loadFromLibrary(targetId, matchTrack);
    const tIdx = targetId === 'A' ? 0 : 1;
    store.setIn('decks', tIdx, { syncEnabled: true });
    sync.setMaster(deckId);

    // Position incoming — skip intro, seek to vocal/body
    const incomingDp = audio.deck(targetId);
    const matchOnLib = library.tracks.find(t => t.id === matchTrack.id) || matchTrack;
    const incomingStart = Math.max(0, matchOnLib.introEndSec || matchOnLib.firstBeatSec || 0);
    if (incomingStart > 0 && incomingStart < incomingDp.durationSec - 30) {
      incomingDp.seek(incomingStart);
      store.setIn('decks', tIdx, { positionSec: incomingStart });
    }
    sync.align(targetId);

    // Determine bed (beat provider) vs layer (overlay)
    const sIdx = deckId === 'A' ? 0 : 1;
    const srcIsAcapella = srcCat === 'acapella';
    const bedIdx = srcIsAcapella ? tIdx : sIdx;
    const layerIdx = srcIsAcapella ? sIdx : tIdx;
    const bedDeckId = srcIsAcapella ? targetId : deckId;
    const layerDeckId = srcIsAcapella ? deckId : targetId;

    const sourcePlaying = sourceDeck?.isPlaying;
    if (!sourcePlaying) {
      store.set('ui', { mashupActive: null, smartSyncStatus: `Loaded to Deck ${targetId} — press play` });
      setTimeout(() => store.set('ui', { smartSyncStatus: null }), 2500);
      return;
    }

    const sourceTempoNow = audio.deck(deckId).tempo || 1;
    const bpm = (sourceTrack.bpm || 120) * sourceTempoNow;
    const fourBarMs = (4 * 4 * 60 / bpm) * 1000;

    // Short phrase wait (2 bars for tighter feel)
    const beatSec = 60 / bpm;
    const sourcePosNow = audio.deck(deckId).positionSec;
    const beatsElapsed = (sourcePosNow * bpm) / 60;
    const beatsIntoPhrase = beatsElapsed % 8; // 2-bar phrase boundary
    const secUntilStart = (8 - beatsIntoPhrase) * beatSec;
    const delayMs = Math.max(50, secUntilStart * 1000);

    store.set('ui', { smartSyncStatus: `Mashup in ${Math.round(secUntilStart)}s · ${srcIsAcapella ? 'instrumental' : tgtCat} on top` });

    const phraseTimer = setTimeout(() => {
      // Route layer to Center so it's heard regardless of crossfader
      audio.bus.setAssign(layerIdx, 'C');
      const channels = [...store.get().mixer.channels];
      channels[layerIdx] = { ...channels[layerIdx], crossfaderAssign: 'C' };
      store.set('mixer', { channels });

      // Loop the bed deck (4 bars from current position)
      const bedPos = audio.deck(bedDeckId).positionSec;
      const bpmLocal = (store.get().decks[bedIdx].track?.bpm || 120) * (audio.deck(bedDeckId).tempo || 1);
      const loopEnd = bedPos + 4 * 4 * 60 / bpmLocal;
      audio.deck(bedDeckId).setLoop({ startSec: bedPos, endSec: loopEnd });
      store.setIn('decks', bedIdx, { loop: { startSec: bedPos, endSec: loopEnd, active: true, bars: 4 } });

      // If the bed is the target deck (acapella source), start it now
      if (srcIsAcapella) {
        audio.deck(targetId).play();
        store.setIn('decks', tIdx, { isPlaying: true });
      }

      store.set('ui', { smartSyncStatus: `Mashup · ${srcIsAcapella ? 'instrumental bed' : tgtCat + ' layer'}` });

      // Fade layer in over 2 bars
      const cancels = [];
      cancels.push(animateChannelVolume(layerIdx, 0, 0.75, fourBarMs / 2));

      // Calculate when the layer's content ends
      const layerLibTrack = library.tracks.find(t => t.id === (srcIsAcapella ? sourceTrack.id : matchTrack.id));
      const layerPosition = srcIsAcapella ? audio.deck(deckId).positionSec : incomingStart;
      const layerEndSec = (layerLibTrack?.outroStartSec || (layerLibTrack?.durationSec || 300) - 30);
      const layerRemainingSec = Math.max(8 * 60 / bpmLocal, layerEndSec - layerPosition);

      // Schedule fade-out
      const totalMs = layerRemainingSec * 1000;
      const fadeOutStartMs = Math.max(fourBarMs / 2, totalMs - fourBarMs / 2);
      cancels.push(animateChannelVolume(layerIdx, 0.75, 0, fourBarMs / 2, fadeOutStartMs));

      // Cleanup
      const cleanupMs = fadeOutStartMs + fourBarMs / 2 + 200;
      activeMix = {
        cancels,
        sIdx, tIdx, bedIdx, layerIdx, bedDeckId, layerDeckId,
        sourceLowSnapshot: store.get().mixer.channels[sIdx].eq.low,
        targetLowSnapshot: store.get().mixer.channels[tIdx].eq.low,
        sourceMidSnapshot: store.get().mixer.channels[sIdx].eq.mid,
        sourceHighSnapshot: store.get().mixer.channels[sIdx].eq.high,
        sourceFilterSnapshot: store.get().mixer.channels[sIdx].filter,
        targetFilterSnapshot: store.get().mixer.channels[tIdx].filter,
        beatFxSnapshot: { ...store.get().mixer.beatFx },
        finisherOnTimer: null, finisherOffTimer: null,
        finishTimeout: null,
        loopReleaseTimer: null, loopTrimTimer: null,
        sourceId: bedDeckId,
        technique: 'mashup',
        useMidKill: false, finisher: 'none', useGrooveLoop: false,
        isMashup: true,
      };
      activeMix.finishTimeout = setTimeout(() => {
        audio.deck(bedDeckId).setLoop(null);
        store.setIn('decks', bedIdx, { loop: null });
        store.set('ui', { mashupActive: null, smartSyncActive: null, smartSyncStatus: 'Mashup complete ✓' });
        setTimeout(() => store.set('ui', { smartSyncStatus: null }), 2000);
        activeMix = null;
      }, cleanupMs);
    }, delayMs);

    activeMix = {
      cancels: [],
      sIdx, tIdx,
      sourceLowSnapshot: store.get().mixer.channels[sIdx].eq.low,
      targetLowSnapshot: store.get().mixer.channels[tIdx].eq.low,
      sourceMidSnapshot: store.get().mixer.channels[sIdx].eq.mid,
      sourceFilterSnapshot: store.get().mixer.channels[sIdx].filter,
      targetFilterSnapshot: store.get().mixer.channels[tIdx].filter,
      beatFxSnapshot: { ...store.get().mixer.beatFx },
      phraseTimer,
      sourceId: bedDeckId,
      finisher: 'none',
      isMashup: true,
    };
  },

  // Cancel an in-progress auto-mix. Restores EQ snapshots + clears any source loop.
  cancel() {
    if (!activeMix) {
      store.set('ui', { smartSyncActive: null, smartSyncStatus: null });
      return;
    }
    for (const c of activeMix.cancels || []) { try { c(); } catch {} }
    if (activeMix.finishTimeout) clearTimeout(activeMix.finishTimeout);
    if (activeMix.phraseTimer) clearTimeout(activeMix.phraseTimer);
    if (activeMix.loopReleaseTimer) clearTimeout(activeMix.loopReleaseTimer);
    if (activeMix.finisherOnTimer) clearTimeout(activeMix.finisherOnTimer);
    if (activeMix.finisherOffTimer) clearTimeout(activeMix.finisherOffTimer);
    if (activeMix.loopTrimTimer) clearTimeout(activeMix.loopTrimTimer);
    // If a beat-FX finisher (echo/reverb) was already fired, restore beat FX
    if (activeMix.finisher === 'echo' || activeMix.finisher === 'reverb') {
      if (activeMix.beatFxSnapshot) {
        audio.fx.setOn(false);
        audio.fx.setType(activeMix.beatFxSnapshot.type);
        audio.fx.target = activeMix.beatFxSnapshot.target;
        audio.fx.setBeatDiv(activeMix.beatFxSnapshot.beatDiv);
        audio.fx.setLevel(activeMix.beatFxSnapshot.level);
        audio.fx.setOn(activeMix.beatFxSnapshot.on);
        store.set('mixer', { beatFx: { ...activeMix.beatFxSnapshot } });
      }
    }
    if (activeMix.sourceMidSnapshot !== undefined) restoreEqMid(activeMix.sIdx, activeMix.sourceMidSnapshot);
    // Restore high EQ if high-kill finisher was in progress
    if (activeMix.sourceHighSnapshot !== undefined) restoreEqHigh(activeMix.sIdx, activeMix.sourceHighSnapshot);
    // Clear source loop if it was applied
    if (activeMix.sourceId) {
      audio.deck(activeMix.sourceId).setLoop(null);
      store.setIn('decks', activeMix.sIdx, { loop: null });
    }
    // Restore EQ + filter values
    restoreEqLow(activeMix.sIdx, activeMix.sourceLowSnapshot);
    restoreEqLow(activeMix.tIdx, activeMix.targetLowSnapshot);
    if (activeMix.sourceFilterSnapshot !== undefined) restoreFilter(activeMix.sIdx, activeMix.sourceFilterSnapshot);
    if (activeMix.targetFilterSnapshot !== undefined) restoreFilter(activeMix.tIdx, activeMix.targetFilterSnapshot);
    activeMix = null;
    store.set('ui', { smartSyncActive: null, mashupActive: null, smartSyncStatus: 'Smart mix cancelled' });
    setTimeout(() => store.set('ui', { smartSyncStatus: null }), 1500);
  },
};
