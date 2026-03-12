import { HARRY, VOLDEMORT } from './constants.js';
import {
  createInitialState,
  cloneState,
  isValidMove,
  applyMove
} from './gameState.js';
import {
  castExpelliarmus,
  castPatronus,
  castAvadaKedavra,
  castDarkMark
} from './spells.js';

export const ACTION_MOVE = 'move';
export const ACTION_SPELL = 'spell';
export const ACTION_RESIGN = 'resign';

const SPELL_CASTERS = {
  expelliarmus: HARRY,
  patronus: HARRY,
  avadaKedavra: VOLDEMORT,
  darkMark: VOLDEMORT
};

function cloneBoards(boards) {
  return boards.map(board => [...board]);
}

export function hydrateState(snapshot) {
  const base = createInitialState();
  if (!snapshot) return base;

  return {
    ...base,
    boards: Array.isArray(snapshot.boards) ? cloneBoards(snapshot.boards) : base.boards,
    boardWinners: Array.isArray(snapshot.boardWinners)
      ? [...snapshot.boardWinners]
      : base.boardWinners,
    currentPlayer: snapshot.currentPlayer ?? base.currentPlayer,
    activeBoard: snapshot.activeBoard ?? base.activeBoard,
    spellsRemaining: snapshot.spellsRemaining
      ? {
          [HARRY]: {
            ...base.spellsRemaining[HARRY],
            ...snapshot.spellsRemaining[HARRY]
          },
          [VOLDEMORT]: {
            ...base.spellsRemaining[VOLDEMORT],
            ...snapshot.spellsRemaining[VOLDEMORT]
          }
        }
      : base.spellsRemaining,
    patronusShields: Array.isArray(snapshot.patronusShields)
      ? snapshot.patronusShields.map(shield => ({ ...shield }))
      : base.patronusShields,
    moveCount: snapshot.moveCount ?? base.moveCount,
    gameOver: Boolean(snapshot.gameOver),
    winner: snapshot.winner ?? base.winner,
    lastMove: snapshot.lastMove ? { ...snapshot.lastMove } : base.lastMove,
    castingSpell: null,
    spellTargetStep: 0,
    _avadaTarget: null
  };
}

export function serializeState(state) {
  const snapshot = cloneState(state);
  return {
    boards: snapshot.boards,
    boardWinners: snapshot.boardWinners,
    currentPlayer: snapshot.currentPlayer,
    activeBoard: snapshot.activeBoard,
    spellsRemaining: snapshot.spellsRemaining,
    patronusShields: snapshot.patronusShields,
    moveCount: snapshot.moveCount,
    gameOver: snapshot.gameOver,
    winner: snapshot.winner,
    lastMove: snapshot.lastMove
  };
}

export function getRoleLabel(role) {
  return role === HARRY ? 'Harry' : 'Voldemort';
}

function castSpell(state, action) {
  switch (action.spellKey) {
    case 'expelliarmus':
      return castExpelliarmus(state, action.board, action.cell);
    case 'patronus':
      return castPatronus(state, action.board);
    case 'avadaKedavra':
      return castAvadaKedavra(state, action.board, action.cell, action.direction);
    case 'darkMark':
      return castDarkMark(state, action.board, action.cell);
    default:
      return { success: false, message: 'Unknown spell.' };
  }
}

export function applyActionToState(state, action) {
  if (!action || typeof action !== 'object') {
    return { success: false, message: 'Missing action payload.' };
  }

  if (action.type === ACTION_MOVE) {
    if (!Number.isInteger(action.board) || !Number.isInteger(action.cell)) {
      return { success: false, message: 'Move must include board and cell.' };
    }
    if (!isValidMove(state, action.board, action.cell)) {
      return { success: false, message: 'That move is not legal right now.' };
    }

    const player = state.currentPlayer;
    applyMove(state, action.board, action.cell);
    return {
      success: true,
      message: `${getRoleLabel(player)} placed on board ${action.board + 1}, cell ${action.cell + 1}.`,
      affectedCells: [{ board: action.board, cell: action.cell, effect: 'claim' }]
    };
  }

  if (action.type === ACTION_SPELL) {
    if (!action.spellKey) {
      return { success: false, message: 'Spell action is missing spellKey.' };
    }

    const expectedCaster = SPELL_CASTERS[action.spellKey];
    if (!expectedCaster) {
      return { success: false, message: 'Unknown spell.' };
    }
    if (state.currentPlayer !== expectedCaster) {
      return { success: false, message: 'It is not that spellcaster’s turn.' };
    }

    return castSpell(state, action);
  }

  if (action.type === ACTION_RESIGN) {
    return { success: true, message: 'Resignation accepted.' };
  }

  return { success: false, message: 'Unsupported action type.' };
}

export function replayHistory(history = []) {
  const state = createInitialState();

  for (const action of history) {
    const result = applyActionToState(state, action);
    if (!result.success) {
      throw new Error(result.message);
    }
  }

  return state;
}
