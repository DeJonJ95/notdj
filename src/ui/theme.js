export const theme = {
  bg: '#0d0d10',
  panel: '#15151a',
  panel2: '#1c1c22',
  panel3: '#22222a',
  border: '#26262e',
  borderLit: '#3a3a44',
  text: '#e8e8ec',
  muted: '#7a7a85',
  dim: '#4a4a52',
  deckA: '#ff6a1a',
  deckB: '#ff3d5a',
  green: '#4ade80',
  amber: '#fbbf24',
  red: '#ef4444',
  cyan: '#22d3ee',
};

export const deckColor = (id) => (id === 'A' ? theme.deckA : theme.deckB);
