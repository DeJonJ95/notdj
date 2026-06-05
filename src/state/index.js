import { createStore } from './store.js';
import { initialDecks } from './deck-state.js';
import { initialMixer } from './mixer-state.js';
import { initialUi } from './ui-state.js';
import { initialSampler } from './sampler-state.js';

export const store = createStore({
  decks: initialDecks,
  mixer: initialMixer,
  ui: initialUi,
  sampler: initialSampler,
});
