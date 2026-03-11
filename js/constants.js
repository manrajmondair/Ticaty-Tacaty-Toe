// Players
export const HARRY = 'harry';
export const VOLDEMORT = 'voldemort';
export const EMPTY = null;
export const DRAW = 'draw';

// Board dimensions
export const BOARD_SIZE = 3;
export const TOTAL_CELLS = 9;
export const TOTAL_BOARDS = 9;

// Win lines for a 3x3 grid (indices 0-8)
export const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6]              // diagonals
];

// Voldemort needs 5 boards to win
export const VOLDEMORT_WIN_COUNT = 5;

// Patronus shield duration in half-turns (moves by either player)
export const PATRONUS_DURATION = 4;

// Adjacent cell map for each cell index (0-8) in a 3x3 grid
// Used by Avada Kedavra to find neighboring empty cells
export const ADJACENCY = {
  0: { right: 1, down: 3, dr: 4 },
  1: { left: 0, right: 2, down: 4, dl: 3, dr: 5 },
  2: { left: 1, down: 5, dl: 4 },
  3: { up: 0, right: 4, down: 6, ur: 1, dr: 7 },
  4: { up: 1, down: 7, left: 3, right: 5, ul: 0, ur: 2, dl: 6, dr: 8 },
  5: { up: 2, left: 4, down: 8, ul: 1, dl: 7 },
  6: { up: 3, right: 7, ur: 4 },
  7: { up: 4, left: 6, right: 8, ul: 3, ur: 5 },
  8: { up: 5, left: 7, ul: 4 }
};

// Spell definitions
export const SPELLS = {
  expelliarmus: {
    owner: HARRY,
    name: 'Expelliarmus',
    description: "Remove one of Voldemort's marks from any active board",
    icon: '\u2728' // sparkles
  },
  patronus: {
    owner: HARRY,
    name: 'Patronus Shield',
    description: 'Shield a board — Voldemort cannot win it for 2 turns',
    icon: '\u{1F6E1}' // shield
  },
  avadaKedavra: {
    owner: VOLDEMORT,
    name: 'Avada Kedavra',
    description: 'Claim an empty cell AND an adjacent empty cell',
    icon: '\u26A1' // lightning
  },
  darkMark: {
    owner: VOLDEMORT,
    name: 'Dark Mark',
    description: "Corrupt one of Harry's marks, making it yours",
    icon: '\u2620' // skull
  }
};

// AI settings
export const AI_SEARCH_TIME_MS = 1500;
export const AI_MAX_DEPTH = 6;
