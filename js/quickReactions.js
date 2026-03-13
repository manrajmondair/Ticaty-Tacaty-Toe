export const QUICK_REACTIONS = [
  { key: 'lumos', label: 'Lumos!' },
  { key: 'not-so-fast', label: 'Not so fast!' },
  { key: 'bold-move', label: 'Bold move.' },
  { key: 'well-played', label: 'Well played.' }
];

export const QUICK_REACTION_MAP = QUICK_REACTIONS.reduce((acc, reaction) => {
  acc[reaction.key] = reaction.label;
  return acc;
}, {});
