// Smart Sync — automatic harmonic mixing assistant.
//
// Tapping SMART on a deck does:
//   1. Analyze the CURRENT deck's track (BPM, key, phrase position)
//   2. Scan the library for the best compatible track for the OPPOSITE deck
//   3. Rank by: harmonic key match → BPM closeness → energy proxy
//   4. Load the winner to the other deck, enable sync
//   5. If both decks playable: auto-crossfade at the next phrase boundary
//
// Harmonic mixing uses the Camelot Wheel (Open Key standard).
//   Same # + letter      = perfect (0)
//   ±1, same letter      = adjacent, very compatible (1)
//   Same #, opp letter   = relative major/minor, very compatible (1)
//   ±1, opp letter       = energy boost / drop, compatible (2)
//   Everything else      = not ranked

import { store } from '../state/index.js';
import { audio } from './audio-engine.js';
import { library } from '../services/library-manager.js';
import { sync } from './sync-engine.js';

// ── Camelot Wheel ──────────────────────────────────────────────────────────

// Maps a key string to its Camelot position { number, letter }
// Standard notation (C, Am, F#m, Eb, etc.) → Camelot (8B, 8A, 11A, 5B, etc.)
const KEY_MAP = {
  // Major keys → B (bottom of wheel)
  'C':   { num: 8,  letter: 'B' }, 'G':  { num: 9,  letter: 'B' },
  'D':   { num: 10, letter: 'B' }, 'A':  { num: 11, letter: 'B' },
  'E':   { num: 12, letter: 'B' }, 'B':  { num: 1,  letter: 'B' },
  'F#':  { num: 2,  letter: 'B' }, 'C#': { num: 3,  letter: 'B' },
  'Ab':  { num: 4,  letter: 'B' }, 'Eb': { num: 5,  letter: 'B' },
  'Bb':  { num: 6,  letter: 'B' }, 'F':  { num: 7,  letter: 'B' },
  // Minor keys → A (top of wheel)
  'Am':  { num: 8,  letter: 'A' }, 'Em': { num: 9,  letter: 'A' },
  'Bm':  { num: 10, letter: 'A' }, 'F#m':{ num: 11, letter: 'A' },
  'C#m': { num: 12, letter: 'A' }, 'G#m':{ num: 1,  letter: 'A' },
  'D#m': { num: 2,  letter: 'A' }, 'A#m':{ num: 3,  letter: 'A' },
  'Fm':  { num: 4,  letter: 'A' }, 'Cm': { num: 5,  letter: 'A' },
  'Gm':  { num: 6,  letter: 'A' }, 'Dm': { num: 7,  letter: 'A' },
};

// Parse a key string into Camelot { num, letter } or null on failure.
// Handles: "C", "Am", "F#min", "Eb major", "8A", "11B", "—"
function parseKey(key) {
  if (!key || key === '—' || key === '-') return null;
  const s = String(key).trim();

  // Already in Camelot notation (e.g. "8A", "12B", "5B")
  const camelotMatch = s.match(/^(\d{1,2})\s*([AB])$/i);
  if (camelotMatch) {
    const num = parseInt(camelotMatch[1], 10);
    if (num >= 1 && num <= 12) return { num, letter: camelotMatch[2].toUpperCase() };
    return null;
  }

  // Normalize: strip words like "major", "minor", "maj", "min"
  let root = s.replace(/\s*(major|minor|maj|min)\s*/gi, '').trim();

  // If it ends with "m" treat as minor
  const isMinor = /m$/i.test(root);
  if (isMinor) {
    const nk = root.slice(0, -1).trim();
    // Handle accidentals: "F#m", "Bbm", etc.
    const flatSharp = /[#♯b♭]$/.test(nk);
    root = nk;
    if (!flatSharp) {
      // Could be just a letter + 'm' like "Am" → already in our map
      const candidate = root + 'm';
      if (KEY_MAP[candidate]) return KEY_MAP[candidate];
    }
    const candidate = root + 'm';
    if (KEY_MAP[candidate]) return KEY_MAP[candidate];
  }

  // Try direct match (C, G, Dm, etc.)
  if (KEY_MAP[root]) return KEY_MAP[root];
  // Try with lower-case m for minor that wasn't handled above
  if (KEY_MAP[root + 'm']) return KEY_MAP[root + 'm'];

  // Fuzzy: match first char, see if it's a known root
  const single = root.charAt(0).toUpperCase();
  const accidental = /[#♯b♭]/.test(root.charAt(1) || '') ? root.charAt(1) : '';
  const tryKey = single + (accidental === '#' ? '#' : accidental === 'b' ? 'b' : '');
  if (KEY_MAP[tryKey]) return KEY_MAP[tryKey];
  if (KEY_MAP[tryKey + 'm']) return KEY_MAP[tryKey + 'm'];

  return null;
}

// Compute harmonic compatibility between two Camelot positions.
// Returns: 0 (perfect) / 1 (very compatible) / 2 (good) / Infinity (don't mix)
//                                          ↓ ±1 around wheel wraps 12→1
function harmonicDistance(a, b) {
  if (!a || !b) return Infinity;

  // Same number + same letter = perfect (0)
  if (a.num === b.num && a.letter === b.letter) return 0;

  // Same number, opposite letter = relative major/minor (1)
  if (a.num === b.num && a.letter !== b.letter) return 1;

  // Adjacent on wheel, same letter = energy move (1)
  const adj = (Math.abs(a.num - b.num) === 1) || (a.num === 1 && b.num === 12) || (a.num === 12 && b.num === 1);
  if (adj && a.letter === b.letter) return 1;

  // Adjacent, opposite letter = bigger energy shift (2)
  if (adj && a.letter !== b.letter) return 2;

  return Infinity;
}

// ── Energy proxy (BPM-based) ──────────────────────────────────────────────
// Higher BPM = generally more energetic for the same genre.
// We compute a 0..1 score from the playing deck's BPM range.

function energyScore(bpm, referenceBpm) {
  if (!bpm || !referenceBpm) return 0.5;
  const ratio = bpm / referenceBpm;
  // 0.75x - 1.33x range → map to 0..1 energy scale
  if (ratio >= 0.8 && ratio <= 1.25) return 0.5 + 0.5 * ((ratio - 0.8) / 0.45);
  if (ratio < 0.8) return Math.max(0, 0.5 * (ratio / 0.8));
  return Math.min(1, 0.5 + 0.5 * ((ratio - 1.25) / 0.3));
}

// ── Auto-Crossfade ────────────────────────────────────────────────────────

let autoMixTimer = null;

// Smoothly move the crossfader from current position to target over `durationMs`.
// Calls setCrossfader() incrementally so the hardware channel assignment is respected.
function animateCrossfader(target, durationMs) {
  if (autoMixTimer) {
    cancelAnimationFrame(autoMixTimer);
    autoMixTimer = null;
  }
  const start = store.get().mixer.crossfader;
  const startTime = performance.now();

  function tick() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(1, elapsed / durationMs);
    // Ease-in-out cubic for smooth transition
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const value = start + (target - start) * eased;

    const { setCrossfader } = getActions();
    setCrossfader(value);

    if (t < 1) {
      autoMixTimer = requestAnimationFrame(tick);
    } else {
      autoMixTimer = null;
      // Signal completion: turn off smart sync indicator on the faded-OUT deck
      store.set('ui', { smartSyncActive: null });
    }
  }
  tick();
}

// Wait until the next downbeat boundary (phrase start) then fire callback.
function waitForPhrase(deckId, callback, { bars = 4 } = {}) {
  const dp = audio.deck(deckId);
  const deckState = store.get().decks.find(d => d.id === deckId);
  const bpm = deckState?.track?.bpm || 120;
  const beatSec = 60 / bpm;
  const phraseSec = bars * 4 * beatSec; // 4 beats per bar × N bars

  // Phase within current 4-bar phrase
  const currentPos = dp.positionSec;
  const beatsElapsed = (currentPos * bpm) / 60;
  const phraseBeats = 16; // 4 bars × 4 beats
  const beatsIntoPhrase = beatsElapsed % phraseBeats;
  const secUntilNextPhrase = (phraseBeats - beatsIntoPhrase) * beatSec;

  // Small delay to avoid clicking in the same frame
  const delayMs = Math.max(50, secUntilNextPhrase * 1000);

  setTimeout(callback, delayMs);
}

function getActions() {
  // Dynamic import to avoid circular dependency at module load time
  return { setCrossfader: (v) => {
    audio.bus.setCrossfader(v);
    store.set('mixer', { crossfader: v });
  }};
}

// ── Main API ──────────────────────────────────────────────────────────────

export const smartSync = {

  // Find the best compatible track from the library for the given source deck.
  // Returns: track object or null (only null if library is empty).
  findMatch(deckId) {
    const decks = store.get().decks;
    const sourceDeck = decks.find(d => d.id === deckId);
    const targetDeck = decks.find(d => d.id !== deckId);

    const sourceTrack = sourceDeck?.track;
    if (!sourceTrack || !sourceTrack.bpm) return null;

    const sourceBpm = sourceTrack.bpm;
    const sourceKey = parseKey(sourceTrack.key);
    const tracks = library.tracks;
    if (!tracks.length) return null;

    // Don't recommend the currently loaded track on the other deck
    const excludeIds = new Set();
    if (targetDeck?.track?.id) excludeIds.add(targetDeck.track.id);
    if (sourceTrack?.id) excludeIds.add(sourceTrack.id);

    // Score every candidate (NO hard skips beyond empty library or active deck tracks)
    let best = null;
    let bestScore = -Infinity;

    for (const t of tracks) {
      if (excludeIds.has(t.id)) continue;

      // ── Key / harmonic score ──────────────────────────────────────
      const targetKey = parseKey(t.key);
      let harmDist;
      if (!sourceKey || !targetKey) {
        harmDist = 0; // unknown key → treat as neutral
      } else {
        harmDist = harmonicDistance(sourceKey, targetKey);
      }
      // Score 100 (perfect) down to 10 (compatible). Incompatible = still 5 not 0.
      const harmScore = harmDist === Infinity ? 5 : 100 - harmDist * 30;

      // ── BPM score (always scored, never skipped) ──────────────────
      const bpmRatio = t.bpm ? t.bpm / sourceBpm : 1;
      let bpmScore;
      if (bpmRatio >= 0.95 && bpmRatio <= 1.05) bpmScore = 100;
      else if (bpmRatio >= 0.90 && bpmRatio <= 1.10) bpmScore = 70;
      else if (bpmRatio >= 0.85 && bpmRatio <= 1.15) bpmScore = 40;
      else if (bpmRatio >= 0.75 && bpmRatio <= 1.25) bpmScore = 15;  // stretchable
      else bpmScore = 5;                                               // big stretch but possible

      // ── Energy ────────────────────────────────────────────────────
      const energy = energyScore(t.bpm || sourceBpm, sourceBpm);
      const energyScoreVal = 50 - Math.abs(energy - 0.5) * 40;
      const energyDirection = (t.bpm || sourceBpm) > sourceBpm ? 5 : 0;

      // ── Category compatibility ────────────────────────────────────
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

      const total = harmScore * 3 + bpmScore * 2 + energyScoreVal + energyDirection + categoryScore;

      if (total > bestScore) {
        bestScore = total;
        best = t;
      }
    }

    return best;
  },

  // Execute the full smart sync + auto-mix workflow.
  // deckId = the deck whose SMART button was tapped.
  async execute(deckId) {
    // Already in a smart sync transition?
    if (store.get().ui.smartSyncActive) {
      this.cancel();
      return;
    }

    const decks = store.get().decks;
    const sourceDeck = decks.find(d => d.id === deckId);
    const targetId = deckId === 'A' ? 'B' : 'A';
    const targetDeck = decks.find(d => d.id === targetId);

    // Step 1: Find the best matching track
    const match = this.findMatch(deckId);
    if (!match) {
      const count = library.tracks.length;
      const otherDeckTrack = store.get().decks.find(d => d.id !== deckId)?.track;
      let msg;
      if (count === 0) {
        msg = 'Library empty — import tracks first';
      } else if (otherDeckTrack && count <= 2) {
        msg = `Only "${otherDeckTrack.title}" on other deck — nothing else to load`;
      } else {
        msg = `No match found in ${count} tracks`;
      }
      store.set('ui', { smartSyncStatus: msg });
      setTimeout(() => store.set('ui', { smartSyncStatus: null }), 3000);
      return;
    }

    // Step 2: Mark active
    store.set('ui', { smartSyncActive: targetId, smartSyncStatus: `→ ${match.title}` });

    // Step 3: Load match to the other deck
    const { loadFromLibrary } = await getActionsAsync();
    await loadFromLibrary(targetId, match);

    // Step 4: Enable sync on the target deck
    const tIdx = targetId === 'A' ? 0 : 1;
    store.setIn('decks', tIdx, { syncEnabled: true });
    sync.setMaster(deckId);
    sync.align(targetId);

    // Step 5: Auto-mix — wait for phrase boundary then crossfade
    const sourcePlaying = sourceDeck?.isPlaying;
    if (sourcePlaying) {
      const sIdx = deckId === 'A' ? 0 : 1;
      store.set('ui', { smartSyncStatus: 'Waiting for phrase boundary…' });

      waitForPhrase(deckId, async () => {
        // Start playing the loaded track
        audio.deck(targetId).play();
        store.setIn('decks', tIdx, { isPlaying: true });

        // Crossfade over 8 bars (≈ 16 sec at 120 BPM)
        const bpm = sourceDeck.track?.bpm || 120;
        const crossfadeDuration = (8 * 4 * 60 / bpm) * 1000;

        store.set('ui', { smartSyncStatus: `Mixing over ${Math.round(crossfadeDuration / 1000)}s…` });

        animateCrossfader(targetId === 'A' ? -1 : 1, crossfadeDuration);

        // After crossfade completes, stop the source deck
        setTimeout(() => {
          audio.deck(deckId).pause();
          store.setIn('decks', sIdx, { isPlaying: false });
          store.set('ui', { smartSyncStatus: 'Smart mix complete ✓' });
          setTimeout(() => store.set('ui', { smartSyncStatus: null }), 2000);
        }, crossfadeDuration + 200);

      }, { bars: 2 });
    } else {
      // Source not playing — just load and let the user take over
      store.set('ui', { smartSyncActive: null, smartSyncStatus: `Loaded to Deck ${targetId}` });
      setTimeout(() => store.set('ui', { smartSyncStatus: null }), 2000);
    }
  },

  // Cancel an in-progress auto-mix
  cancel() {
    if (autoMixTimer) {
      cancelAnimationFrame(autoMixTimer);
      autoMixTimer = null;
    }
    store.set('ui', { smartSyncActive: null, smartSyncStatus: null });
  },
};

// Async import for actions to avoid circular dependency
async function getActionsAsync() {
  const { actions } = await import('../ui/actions.js');
  return actions;
}