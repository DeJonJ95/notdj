// Two-deck beat sync. When a follower is synced to a master:
//   - follower.tempo = masterEffectiveBPM / followerBaseBPM
//   - follower.position seeks so the next downbeat aligns with master's next downbeat
//
// The renderer's RAF loop calls maintain() each frame to keep the follower's
// tempo locked even if the master's pitch fader moves.

import { audio } from './audio-engine.js';
import { store } from '../state/index.js';

export class SyncEngine {
  // Pick a master automatically if none set. Returns deck id ('A'|'B'|null).
  resolveMaster() {
    const decks = store.get().decks;
    const m = decks.find((d) => d.isMaster);
    if (m) return m.id;
    // Default: first deck with a loaded track and playing
    const playing = decks.find((d) => d.isPlaying && d.track);
    if (playing) return playing.id;
    return decks.find((d) => d.track)?.id || null;
  }

  setMaster(deckId) {
    // store.set on an array slice would overwrite the object; mutate per index.
    const decks = store.get().decks;
    decks.forEach((d, i) => store.setIn('decks', i, { isMaster: deckId != null && d.id === deckId }));
  }

  // Snap follower BPM + phase to master once. Subsequent drift is corrected in maintain().
  align(followerId) {
    const masterId = this.resolveMaster();
    if (!masterId || masterId === followerId) return false;
    const f = store.get().decks.find((d) => d.id === followerId);
    const m = store.get().decks.find((d) => d.id === masterId);
    if (!f.track || !m.track) return false;

    const masterDp = audio.deck(masterId);
    const followerDp = audio.deck(followerId);
    const masterEffectiveBpm = m.track.bpm * masterDp.tempo;
    const targetTempo = masterEffectiveBpm / f.track.bpm;
    followerDp.setTempo(targetTempo);

    // Phase align: compute master's phase within its beat, set follower to same.
    const masterBeatSec = 60 / masterEffectiveBpm;
    const masterPhase = (masterDp.positionSec % masterBeatSec) / masterBeatSec;
    const followerEffBpm = f.track.bpm * targetTempo;
    const followerBeatSec = 60 / followerEffBpm;
    const currentFollowerPhase = (followerDp.positionSec % followerBeatSec) / followerBeatSec;
    let phaseDelta = currentFollowerPhase - masterPhase;
    if (phaseDelta > 0.5) phaseDelta -= 1;
    if (phaseDelta < -0.5) phaseDelta += 1;
    const newPos = followerDp.positionSec - phaseDelta * followerBeatSec;
    if (newPos > 0 && newPos < followerDp.durationSec) followerDp.seek(newPos);

    // Persist tempo into state
    const idx = followerId === 'A' ? 0 : 1;
    store.setIn('decks', idx, { tempo: targetTempo });
    return true;
  }

  // Per-frame: keep tempo locked for any synced deck.
  maintain() {
    const decks = store.get().decks;
    const masterId = this.resolveMaster();
    if (!masterId) return;
    const m = decks.find((d) => d.id === masterId);
    if (!m?.track) return;
    const masterDp = audio.deck(masterId);
    const masterEffectiveBpm = m.track.bpm * masterDp.tempo;
    for (const f of decks) {
      if (f.id === masterId || !f.syncEnabled || !f.track) continue;
      const targetTempo = masterEffectiveBpm / f.track.bpm;
      const followerDp = audio.deck(f.id);
      if (Math.abs(followerDp.tempo - targetTempo) > 0.0005) {
        followerDp.setTempo(targetTempo);
        const idx = f.id === 'A' ? 0 : 1;
        store.setIn('decks', idx, { tempo: targetTempo });
      }
    }
  }
}

export const sync = new SyncEngine();
