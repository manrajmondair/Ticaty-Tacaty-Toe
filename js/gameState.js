import {
  HARRY, VOLDEMORT, EMPTY, DRAW,
  WIN_LINES, VOLDEMORT_WIN_COUNT,
  TOTAL_BOARDS, TOTAL_CELLS, PATRONUS_DURATION
} from './constants.js';

export function createInitialState() {
  return {
    boards: Array.from({ length: TOTAL_BOARDS }, () => Array(TOTAL_CELLS).fill(EMPTY)),
    boardWinners: Array(TOTAL_BOARDS).fill(EMPTY),
    currentPlayer: HARRY,
    activeBoard: null,
    spellsRemaining: {
      [HARRY]: { expelliarmus: 1, patronus: 1 },
      [VOLDEMORT]: { avadaKedavra: 1, darkMark: 1 }
    },
    patronusShields: [],
    moveCount: 0,
    gameOver: false,
    winner: null,
    lastMove: null,
    castingSpell: null,
    spellTargetStep: 0,
    _avadaTarget: null
  };
}

export function cloneState(state) {
  return {
    boards: state.boards.map(b => [...b]),
    boardWinners: [...state.boardWinners],
    currentPlayer: state.currentPlayer,
    activeBoard: state.activeBoard,
    spellsRemaining: {
      [HARRY]: { ...state.spellsRemaining[HARRY] },
      [VOLDEMORT]: { ...state.spellsRemaining[VOLDEMORT] }
    },
    patronusShields: state.patronusShields.map(s => ({ ...s })),
    moveCount: state.moveCount,
    gameOver: state.gameOver,
    winner: state.winner,
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    castingSpell: null,
    spellTargetStep: 0,
    _avadaTarget: null
  };
}

export function checkBoardWinner(cells) {
  for (const [a, b, c] of WIN_LINES) {
    if (cells[a] && cells[a] === cells[b] && cells[b] === cells[c]) {
      return cells[a];
    }
  }
  if (cells.every(c => c !== EMPTY)) return DRAW;
  return null;
}

export function checkGameWinner(boardWinners) {
  // Harry wins: 3 in a row on the meta-grid
  for (const [a, b, c] of WIN_LINES) {
    if (boardWinners[a] === HARRY &&
        boardWinners[b] === HARRY &&
        boardWinners[c] === HARRY) {
      return HARRY;
    }
  }

  // Voldemort wins: 5+ boards won
  const voldemortCount = boardWinners.filter(w => w === VOLDEMORT).length;
  if (voldemortCount >= VOLDEMORT_WIN_COUNT) return VOLDEMORT;

  // Early draw detection
  const harryCount = boardWinners.filter(w => w === HARRY).length;
  const openCount = boardWinners.filter(w => w === EMPTY).length;

  const harryCanWin = WIN_LINES.some(([a, b, c]) => {
    return boardWinners[a] !== VOLDEMORT && boardWinners[a] !== DRAW &&
           boardWinners[b] !== VOLDEMORT && boardWinners[b] !== DRAW &&
           boardWinners[c] !== VOLDEMORT && boardWinners[c] !== DRAW;
  });
  const voldemortCanWin = voldemortCount + openCount >= VOLDEMORT_WIN_COUNT;

  if (!harryCanWin && !voldemortCanWin) return DRAW;

  // All boards resolved but no winner
  if (openCount === 0) return DRAW;

  return null;
}

export function isValidMove(state, boardIndex, cellIndex) {
  if (state.gameOver) return false;
  if (state.boardWinners[boardIndex] !== EMPTY) return false;
  if (state.boards[boardIndex][cellIndex] !== EMPTY) return false;
  // If activeBoard points to an unresolved board, must play there
  if (state.activeBoard !== null &&
      state.boardWinners[state.activeBoard] === EMPTY &&
      state.activeBoard !== boardIndex) {
    return false;
  }
  return true;
}

export function getLegalMoves(state) {
  const moves = [];

  // If activeBoard is set but that board is already resolved, fall back to free choice
  let targetBoards;
  if (state.activeBoard !== null && state.boardWinners[state.activeBoard] === EMPTY) {
    targetBoards = [state.activeBoard];
  } else {
    targetBoards = Array.from({ length: TOTAL_BOARDS }, (_, i) => i);
  }

  for (const bi of targetBoards) {
    if (state.boardWinners[bi] !== EMPTY) continue;
    for (let ci = 0; ci < TOTAL_CELLS; ci++) {
      if (state.boards[bi][ci] === EMPTY) {
        moves.push({ board: bi, cell: ci });
      }
    }
  }
  return moves;
}

export function applyMove(state, boardIndex, cellIndex) {
  const player = state.currentPlayer;

  state.boards[boardIndex][cellIndex] = player;
  state.moveCount++;
  state.lastMove = { board: boardIndex, cell: cellIndex };

  // Check mini-board winner
  const boardResult = checkBoardWinner(state.boards[boardIndex]);
  if (boardResult !== null && state.boardWinners[boardIndex] === EMPTY) {
    if (boardResult === VOLDEMORT) {
      const isShielded = state.patronusShields.some(s => s.boardIndex === boardIndex);
      if (!isShielded) {
        state.boardWinners[boardIndex] = boardResult;
      }
      // If shielded, Voldemort's win is denied — board stays active
    } else {
      state.boardWinners[boardIndex] = boardResult;
    }
  }

  // Determine next active board (Ultimate TTT rule)
  const nextBoard = cellIndex;
  if (state.boardWinners[nextBoard] !== EMPTY) {
    state.activeBoard = null;
  } else {
    state.activeBoard = nextBoard;
  }

  // Decrement Patronus shields and re-evaluate expired shields
  state.patronusShields = state.patronusShields
    .map(s => ({ ...s, turnsLeft: s.turnsLeft - 1 }))
    .filter(s => s.turnsLeft > 0);

  // Re-check boards that lost their shield
  for (let bi = 0; bi < TOTAL_BOARDS; bi++) {
    if (state.boardWinners[bi] !== EMPTY) continue;
    const isShielded = state.patronusShields.some(s => s.boardIndex === bi);
    if (!isShielded) {
      const result = checkBoardWinner(state.boards[bi]);
      if (result !== null) {
        state.boardWinners[bi] = result;
      }
    }
  }

  // Check game winner
  const gameResult = checkGameWinner(state.boardWinners);
  if (gameResult) {
    state.gameOver = true;
    state.winner = gameResult;
  }

  // Switch player
  state.currentPlayer = player === HARRY ? VOLDEMORT : HARRY;

  return state;
}

export function opponent(player) {
  return player === HARRY ? VOLDEMORT : HARRY;
}
