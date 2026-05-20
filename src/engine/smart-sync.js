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
    const delta = targetBpm - sourceBpm;
    if (Math.abs(delta) < 0.5) out.push(`Same BPM`);
    else out.push(`${delta > 0 ? '+' : ''}${delta.toFixed(1)} BPM`);
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

    const sourceBpm = sourceTrack.bpm;
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
    const bpm = sourceDeck.track?.bpm || 120;
    const beatSec = 60 / bpm;
    const phraseSec = 16 * beatSec;

    // ── Dynamic mix duration based on compatibility ──────────────────────
    const compat = (harmScore + bpmScore + energyScore) / 300;
    let bars = Math.max(4, Math.min(16, Math.round(4 + 12 * compat)));
    const sourceLibTrack2 = library.tracks.find(t => t.id === sourceDeck.track.id);
    const sourceOutroStart = sourceLibTrack2?.outroStartSec ?? sourceDeck.track.durationSec;

    // ── "Mix now" timing — next phrase boundary from current source position ─
    const sourcePosNow = audio.deck(deckId).positionSec;
    const beatsElapsed = (sourcePosNow * bpm) / 60;
    const beatsIntoPhrase = beatsElapsed % 16;
    const secUntilMix = (16 - beatsIntoPhrase) * beatSec;
    const phraseDelayMs = Math.max(50, secUntilMix * 1000);
    const mixStartInSource = sourcePosNow + secUntilMix;

    // ── Source loop extension ─────────────────────────────────────────────
    // If the mix would run past the source's body section, set a 4-bar beat
    // loop on source so the body keeps repeating until the mix completes.
    let sourceLoopApplied = null;
    const crossfadeDurationNoLoop = (bars * 4 * 60 / bpm) * 1000;
    const mixEndInSource = mixStartInSource + crossfadeDurationNoLoop / 1000;
    const bodyHeadroom = sourceOutroStart - mixEndInSource;

    if (bodyHeadroom < 0 && sourcePosNow < sourceOutroStart - phraseSec) {
      // Source body would run out mid-mix. Loop a 4-bar section right at the mix start.
      const loopBars = 4;
      const loopLength = loopBars * 4 * beatSec;
      const loopStart = mixStartInSource;
      const loopEnd = Math.min(loopStart + loopLength, sourceOutroStart);
      if (loopEnd - loopStart >= 2 * beatSec) {
        sourceLoopApplied = { startSec: loopStart, endSec: loopEnd, bars: loopBars };
      } else {
        // Not enough body left to loop — shrink mix duration instead
        const safeBars = Math.max(2, Math.floor((sourceOutroStart - mixStartInSource - 2) / (4 * beatSec)));
        bars = Math.min(bars, safeBars);
      }
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

    // ── Status text ───────────────────────────────────────────────────────
    const etaTxt = secUntilMix > 6 ? `in ${Math.round(secUntilMix)}s` : `next phrase`;
    const loopTxt = sourceLoopApplied ? ` · src loop ${sourceLoopApplied.bars}b` : '';
    const barsTxt = ` · ${bars}b mix`;
    store.set('ui', { smartSyncStatus: `${reasonText}${barsTxt}${loopTxt} · ${etaTxt}` });

    // ── Snapshot EQ so we can restore + drive the bass swap ──────────────
    const sourceLowSnapshot = store.get().mixer.channels[sIdx].eq.low;
    const targetLowSnapshot = store.get().mixer.channels[tIdx].eq.low;

    const phraseTimer = setTimeout(() => {
      // Apply source loop if needed to keep source body looping during the mix
      let loopReleaseTimer = null;
      if (sourceLoopApplied) {
        audio.deck(deckId).setLoop({ startSec: sourceLoopApplied.startSec, endSec: sourceLoopApplied.endSec });
        store.setIn('decks', sIdx, { loop: { ...sourceLoopApplied, active: true } });

        // Schedule loop release ~4 bars before mix-end so source plays naturally into the final fade.
        // This lets the outgoing track's natural tail be heard rather than a mid-loop seam.
        const fourBarsMs = (4 * 4 * 60 / bpm) * 1000;
        const releaseAtMs = Math.max(100, crossfadeDuration - fourBarsMs);
        loopReleaseTimer = setTimeout(() => {
          audio.deck(deckId).setLoop(null);
          store.setIn('decks', sIdx, { loop: null });
        }, releaseAtMs);
      }

      // Pre-kill incoming bass before its first beat plays
      restoreEqLow(tIdx, -1);

      audio.deck(targetId).play();
      store.setIn('decks', tIdx, { isPlaying: true });

      const loopMsg = sourceLoopApplied ? ` · src looped ${sourceLoopApplied.bars}b → release` : '';
      store.set('ui', {
        smartSyncStatus: `Mixing · ${bars} bars · bass swap${loopMsg}`,
      });

      // First half: ramp incoming low up to its snapshot value
      const cancelEqUp = animateEqLow(tIdx, -1, targetLowSnapshot, crossfadeDuration / 2);

      // Second half: cut outgoing low from snapshot to kill
      const cancelEqDown = animateEqLow(sIdx, sourceLowSnapshot, -1, crossfadeDuration / 2, crossfadeDuration / 2);

      // Crossfader runs the full duration
      const targetCrossfader = targetId === 'A' ? -1 : 1;
      const cancelXf = animateCrossfader(targetCrossfader, crossfadeDuration);

      // Track for cancel()
      activeMix = {
        cancels: [cancelEqUp, cancelEqDown, cancelXf],
        sIdx, tIdx,
        sourceLowSnapshot, targetLowSnapshot,
        finishTimeout: null,
        loopReleaseTimer,
        sourceId: deckId,
      };

      activeMix.finishTimeout = setTimeout(() => {
        // Clear source loop if we had one
        if (sourceLoopApplied) {
          audio.deck(deckId).setLoop(null);
          store.setIn('decks', sIdx, { loop: null });
        }
        audio.deck(deckId).pause();
        store.setIn('decks', sIdx, { isPlaying: false });
        // Restore source EQ for next time the deck is played
        restoreEqLow(sIdx, sourceLowSnapshot);
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
      phraseTimer,
      sourceId: deckId,
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
    // Clear source loop if it was applied
    if (activeMix.sourceId) {
      audio.deck(activeMix.sourceId).setLoop(null);
      store.setIn('decks', activeMix.sIdx, { loop: null });
    }
    // Restore EQ values
    restoreEqLow(activeMix.sIdx, activeMix.sourceLowSnapshot);
    restoreEqLow(activeMix.tIdx, activeMix.targetLowSnapshot);
    activeMix = null;
    store.set('ui', { smartSyncActive: null, smartSyncStatus: 'Smart mix cancelled' });
    setTimeout(() => store.set('ui', { smartSyncStatus: null }), 1500);
  },
};
