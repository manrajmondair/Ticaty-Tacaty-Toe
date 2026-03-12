import assert from 'node:assert/strict';
import test from 'node:test';

import { HARRY, VOLDEMORT } from '../js/constants.js';
import { ACTION_MOVE, ACTION_SPELL, applyActionToState, hydrateState, replayHistory } from '../js/engine.js';
import { createInitialState } from '../js/gameState.js';

test('move actions update the board and pass the turn', () => {
  const state = createInitialState();
  const result = applyActionToState(state, {
    type: ACTION_MOVE,
    board: 0,
    cell: 0
  });

  assert.equal(result.success, true);
  assert.equal(state.boards[0][0], HARRY);
  assert.equal(state.currentPlayer, VOLDEMORT);
  assert.deepEqual(state.lastMove, { board: 0, cell: 0 });
});

test('spell actions enforce the current caster and mutate the board', () => {
  const state = createInitialState();
  state.currentPlayer = VOLDEMORT;

  const result = applyActionToState(state, {
    type: ACTION_SPELL,
    spellKey: 'avadaKedavra',
    board: 0,
    cell: 0,
    direction: 'right'
  });

  assert.equal(result.success, true);
  assert.equal(state.boards[0][0], VOLDEMORT);
  assert.equal(state.boards[0][1], VOLDEMORT);
  assert.equal(state.currentPlayer, HARRY);
});

test('replayHistory rebuilds a state snapshot from sequential actions', () => {
  const state = replayHistory([
    { type: ACTION_MOVE, board: 0, cell: 0 },
    { type: ACTION_MOVE, board: 0, cell: 1 },
    { type: ACTION_MOVE, board: 1, cell: 4 }
  ]);

  assert.equal(state.boards[0][0], HARRY);
  assert.equal(state.boards[0][1], VOLDEMORT);
  assert.equal(state.boards[1][4], HARRY);
  assert.equal(state.currentPlayer, VOLDEMORT);
});

test('hydrateState resets local spell-targeting flags', () => {
  const snapshot = createInitialState();
  snapshot.castingSpell = 'darkMark';
  snapshot.spellTargetStep = 1;
  snapshot._avadaTarget = { board: 3, cell: 4 };

  const state = hydrateState(snapshot);

  assert.equal(state.castingSpell, null);
  assert.equal(state.spellTargetStep, 0);
  assert.equal(state._avadaTarget, null);
});
