import assert from 'node:assert/strict';
import test from 'node:test';

import { DRAW, HARRY, VOLDEMORT } from '../js/constants.js';
import {
  applyMove,
  checkBoardWinner,
  checkGameWinner,
  createInitialState,
  isValidMove,
  opponent
} from '../js/gameState.js';

test('checkBoardWinner detects rows, columns, diagonals, and draws', () => {
  const row = [HARRY, HARRY, HARRY, null, null, null, null, null, null];
  assert.equal(checkBoardWinner(row), HARRY);

  const col = [VOLDEMORT, null, null, VOLDEMORT, null, null, VOLDEMORT, null, null];
  assert.equal(checkBoardWinner(col), VOLDEMORT);

  const diag = [HARRY, null, null, null, HARRY, null, null, null, HARRY];
  assert.equal(checkBoardWinner(diag), HARRY);

  const drawn = [HARRY, VOLDEMORT, HARRY, HARRY, VOLDEMORT, VOLDEMORT, VOLDEMORT, HARRY, HARRY];
  assert.equal(checkBoardWinner(drawn), DRAW);

  const incomplete = [HARRY, VOLDEMORT, null, null, null, null, null, null, null];
  assert.equal(checkBoardWinner(incomplete), null);
});

test('checkGameWinner: Harry needs three boards in a row on the meta-grid', () => {
  const boardWinners = [HARRY, HARRY, HARRY, null, null, null, null, null, null];
  assert.equal(checkGameWinner(boardWinners), HARRY);
});

test('checkGameWinner: Voldemort wins by claiming 5 of 9 boards', () => {
  const boardWinners = [
    VOLDEMORT, VOLDEMORT, VOLDEMORT,
    VOLDEMORT, VOLDEMORT, null,
    null, null, null
  ];
  assert.equal(checkGameWinner(boardWinners), VOLDEMORT);
});

test('checkGameWinner: early draw when neither side can complete a win', () => {
  // Voldemort holds 2 boards + 1 open ⇒ max 3 < 5, can't win.
  // Every Harry line is blocked by Voldemort or Draw ⇒ Harry can't win.
  const boardWinners = [
    HARRY, HARRY, VOLDEMORT,
    HARRY, VOLDEMORT, HARRY,
    DRAW, DRAW, null
  ];
  assert.equal(checkGameWinner(boardWinners), DRAW);
});

test('isValidMove rejects moves on completed boards, taken cells, and wrong active board', () => {
  const state = createInitialState();
  applyMove(state, 0, 4); // Voldemort must play on board 4 next

  // Wrong board: can't play on board 1 because activeBoard is 4.
  assert.equal(isValidMove(state, 1, 0), false);
  // Right board, empty cell.
  assert.equal(isValidMove(state, 4, 0), true);

  // Mark board 4 as Voldemort-won → no more moves there.
  state.boardWinners[4] = VOLDEMORT;
  assert.equal(isValidMove(state, 4, 0), false);

  // gameOver short-circuits everything.
  state.gameOver = true;
  assert.equal(isValidMove(state, 0, 0), false);
});

test('applyMove flips currentPlayer and routes activeBoard via the cell index', () => {
  const state = createInitialState();
  applyMove(state, 4, 2);
  assert.equal(state.currentPlayer, VOLDEMORT);
  assert.equal(state.activeBoard, 2);
  assert.deepEqual(state.lastMove, { board: 4, cell: 2 });
});

test('applyMove sends opponent to free-choice when the routed board is already resolved', () => {
  const state = createInitialState();
  // Pre-resolve board 4 (the routed destination).
  state.boardWinners[4] = HARRY;
  applyMove(state, 0, 4);
  assert.equal(state.activeBoard, null, 'should fall back to free choice');
});

test('opponent flips between the two players', () => {
  assert.equal(opponent(HARRY), VOLDEMORT);
  assert.equal(opponent(VOLDEMORT), HARRY);
});
