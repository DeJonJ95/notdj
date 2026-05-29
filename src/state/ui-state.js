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
  smartSyncStatus: null,  // transient status message shown in deck header
};
