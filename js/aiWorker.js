import { findBestMoveHard } from './aiSearch.js';

// Web Worker entry point. The hard AI runs entirely inside this worker so
// the main thread (input, animations, Firebase listeners) never blocks
// during search. Easy/medium difficulties remain inline — they're cheap.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  const { id } = data;
  if (typeof id !== 'number') return;

  try {
    const move = findBestMoveHard(data.state);
    self.postMessage({ id, move });
  } catch (error) {
    self.postMessage({ id, error: error?.message || 'AI search failed.' });
  }
});
