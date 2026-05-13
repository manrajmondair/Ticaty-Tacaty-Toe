import assert from 'node:assert/strict';
import test from 'node:test';

import { HARRY, VOLDEMORT } from '../js/constants.js';
import { getAIMove, getAISpellAction } from '../js/ai.js';
import { applyMove, createInitialState, getLegalMoves, isValidMove } from '../js/gameState.js';

test('getAIMove resolves to a Promise on every difficulty', () => {
  const state = createInitialState();
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const result = getAIMove(state, difficulty);
    assert.ok(result instanceof Promise, `${difficulty} should return a Promise`);
  }
});

test('getAIMove easy always returns a legal move on a fresh board', async () => {
  const state = createInitialState();
  const move = await getAIMove(state, 'easy');
  assert.ok(move);
  assert.ok(isValidMove(state, move.board, move.cell));
});

test('getAIMove medium always returns a legal move on a fresh board', async () => {
  const state = createInitialState();
  const move = await getAIMove(state, 'medium');
  assert.ok(move);
  assert.ok(isValidMove(state, move.board, move.cell));
});

test('getAIMove hard always returns a legal move on a fresh board', async () => {
  const state = createInitialState();
  const move = await getAIMove(state, 'hard');
  assert.ok(move);
  assert.ok(isValidMove(state, move.board, move.cell));
});

test('getAIMove hard respects the constrained active board (ultimate TTT rule)', async () => {
  const state = createInitialState();
  applyMove(state, 0, 4); // Harry plays center of board 0, sends Voldemort to board 4
  assert.equal(state.activeBoard, 4);

  const move = await getAIMove(state, 'hard');
  assert.ok(move);
  assert.equal(move.board, 4);
  assert.ok(isValidMove(state, move.board, move.cell));
});

test('getAIMove never proposes a move on a completed mini-board', async () => {
  const state = createInitialState();
  // Force board 0 to a Harry win so it is closed off.
  state.boards[0] = [HARRY, HARRY, HARRY, null, null, null, null, null, null];
  state.boardWinners[0] = HARRY;
  // Voldemort to move, free choice.
  state.currentPlayer = VOLDEMORT;
  state.activeBoard = null;

  for (const difficulty of ['easy', 'medium', 'hard']) {
    const move = await getAIMove(state, difficulty);
    assert.ok(move);
    assert.notEqual(move.board, 0, `${difficulty} chose a closed board`);
    assert.ok(isValidMove(state, move.board, move.cell));
  }
});

test('getAISpellAction never returns spells that have already been used', () => {
  const state = createInitialState();
  // Drain Harry's spell budget.
  state.spellsRemaining[HARRY].expelliarmus = 0;
  state.spellsRemaining[HARRY].patronus = 0;

  // Even if Voldemort threatens to win a board, Harry can no longer cast.
  state.boards[0] = [VOLDEMORT, VOLDEMORT, null, null, null, null, null, null, null];

  const action = getAISpellAction(state, 'hard');
  assert.equal(action, null);
});

test('legal moves shrink to zero only when the game is fully resolved', () => {
  const state = createInitialState();
  // Fill every cell with HARRY → all boards are HARRY-won → no legal moves.
  for (let bi = 0; bi < 9; bi++) {
    state.boards[bi] = Array(9).fill(HARRY);
    state.boardWinners[bi] = HARRY;
  }
  assert.equal(getLegalMoves(state).length, 0);
});
