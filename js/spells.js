import { HARRY, VOLDEMORT, EMPTY, ADJACENCY, PATRONUS_DURATION } from './constants.js';
import { checkBoardWinner, checkGameWinner } from './gameState.js';

export function castExpelliarmus(state, boardIndex, cellIndex) {
  if (state.spellsRemaining[HARRY].expelliarmus <= 0) {
    return { success: false, message: 'Expelliarmus already used!' };
  }
  if (state.boardWinners[boardIndex] !== EMPTY) {
    return { success: false, message: 'Cannot target a completed board.' };
  }
  if (state.boards[boardIndex][cellIndex] !== VOLDEMORT) {
    return { success: false, message: "Must target one of Voldemort's marks." };
  }

  state.boards[boardIndex][cellIndex] = EMPTY;
  state.spellsRemaining[HARRY].expelliarmus--;
  state.currentPlayer = VOLDEMORT;
  state.moveCount++;

  return {
    success: true,
    message: "Expelliarmus! Voldemort's mark has been disarmed.",
    affectedCells: [{ board: boardIndex, cell: cellIndex, effect: 'remove' }]
  };
}

export function castPatronus(state, boardIndex) {
  if (state.spellsRemaining[HARRY].patronus <= 0) {
    return { success: false, message: 'Patronus Shield already used!' };
  }
  if (state.boardWinners[boardIndex] !== EMPTY) {
    return { success: false, message: 'Cannot shield a completed board.' };
  }
  if (state.patronusShields.some(s => s.boardIndex === boardIndex)) {
    return { success: false, message: 'Board is already shielded.' };
  }

  state.patronusShields.push({ boardIndex, turnsLeft: PATRONUS_DURATION });
  state.spellsRemaining[HARRY].patronus--;
  state.currentPlayer = VOLDEMORT;
  state.moveCount++;

  return {
    success: true,
    message: 'Expecto Patronum! A silvery shield protects this board.',
    affectedCells: [{ board: boardIndex, cell: -1, effect: 'shield' }]
  };
}

export function castAvadaKedavra(state, boardIndex, cellIndex, direction) {
  if (state.spellsRemaining[VOLDEMORT].avadaKedavra <= 0) {
    return { success: false, message: 'Avada Kedavra already used!' };
  }
  if (state.boardWinners[boardIndex] !== EMPTY) {
    return { success: false, message: 'Cannot target a completed board.' };
  }
  if (state.boards[boardIndex][cellIndex] !== EMPTY) {
    return { success: false, message: 'Primary cell must be empty.' };
  }

  const adjMap = ADJACENCY[cellIndex];
  if (!adjMap || adjMap[direction] === undefined) {
    return { success: false, message: 'Invalid direction.' };
  }

  const adjCell = adjMap[direction];
  if (state.boards[boardIndex][adjCell] !== EMPTY) {
    return { success: false, message: 'Adjacent cell must also be empty.' };
  }

  state.boards[boardIndex][cellIndex] = VOLDEMORT;
  state.boards[boardIndex][adjCell] = VOLDEMORT;
  state.spellsRemaining[VOLDEMORT].avadaKedavra--;

  const result = checkBoardWinner(state.boards[boardIndex]);
  if (result !== null && state.boardWinners[boardIndex] === EMPTY) {
    const isShielded = state.patronusShields.some(s => s.boardIndex === boardIndex);
    if (!(result === VOLDEMORT && isShielded)) {
      state.boardWinners[boardIndex] = result;
    }
  }

  const gameResult = checkGameWinner(state.boardWinners);
  if (gameResult) {
    state.gameOver = true;
    state.winner = gameResult;
  }

  // Spells don't set activeBoard — opponent gets free choice
  state.activeBoard = null;
  state.currentPlayer = HARRY;
  state.moveCount++;

  return {
    success: true,
    message: 'Avada Kedavra! Two cells have fallen to darkness.',
    affectedCells: [
      { board: boardIndex, cell: cellIndex, effect: 'claim' },
      { board: boardIndex, cell: adjCell, effect: 'claim' }
    ]
  };
}

export function castDarkMark(state, boardIndex, cellIndex) {
  if (state.spellsRemaining[VOLDEMORT].darkMark <= 0) {
    return { success: false, message: 'Dark Mark already used!' };
  }
  if (state.boardWinners[boardIndex] !== EMPTY) {
    return { success: false, message: 'Cannot target a completed board.' };
  }
  if (state.boards[boardIndex][cellIndex] !== HARRY) {
    return { success: false, message: "Must target one of Harry's marks." };
  }

  state.boards[boardIndex][cellIndex] = VOLDEMORT;
  state.spellsRemaining[VOLDEMORT].darkMark--;

  const result = checkBoardWinner(state.boards[boardIndex]);
  if (result !== null && state.boardWinners[boardIndex] === EMPTY) {
    const isShielded = state.patronusShields.some(s => s.boardIndex === boardIndex);
    if (!(result === VOLDEMORT && isShielded)) {
      state.boardWinners[boardIndex] = result;
    }
  }

  const gameResult = checkGameWinner(state.boardWinners);
  if (gameResult) {
    state.gameOver = true;
    state.winner = gameResult;
  }

  state.activeBoard = null;
  state.currentPlayer = HARRY;
  state.moveCount++;

  return {
    success: true,
    message: "The Dark Mark rises! Harry's mark has been corrupted.",
    affectedCells: [{ board: boardIndex, cell: cellIndex, effect: 'swap' }]
  };
}
