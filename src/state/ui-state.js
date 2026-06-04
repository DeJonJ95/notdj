export const initialUi = {
  ready: false,           // audio context unlocked
  libraryOpen: false,
  settingsOpen: false,
  activeBank: 'A',        // for shared FX controls if any
  orientation: 'landscape',
  message: null,          // transient toast { text, level }
  outputDevice: 'Default', // active audio output device label
  pressed: null,          // { type, deckId, padIndex } — currently pressed region for press-glow feedback
  pressing: null,         // { deckId, padIndex, startedAt } — long-press tracking for pad delete warning
  smartSyncActive: null,  // 'A' | 'B' | null — which deck is currently smart-sync loading
  mashupActive: null,    // 'A' | 'B' | null — which deck is currently in mashup layering mode
  smartSyncStatus: null,  // transient status message shown in deck header
  mixHistory: [],         // [{ trackId, artist, deckId, loadedAt }] — capped at 20, used to avoid repeats
  setIntent: 'sustain',   // 'build' | 'sustain' | 'cooldown' — biases smart-sync energy direction
};
