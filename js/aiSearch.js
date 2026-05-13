import {
  HARRY, VOLDEMORT, EMPTY, DRAW,
  WIN_LINES, VOLDEMORT_WIN_COUNT,
  TOTAL_BOARDS, TOTAL_CELLS,
  AI_SEARCH_TIME_MS, AI_MAX_DEPTH
} from './constants.js';
import {
  cloneState, applyMove, getLegalMoves,
  checkBoardWinner, opponent
} from './gameState.js';

// Synchronous iterative-deepening negamax with alpha-beta pruning. Designed
// to run either inline on the main thread (with a wrapper that yields
// between depths) or inside a Web Worker (no yielding required).
export function findBestMoveHard(state) {
  const aiPlayer = state.currentPlayer;
  let bestMove = null;
  const searchStart = Date.now();

  for (let depth = 1; depth <= AI_MAX_DEPTH; depth++) {
    const result = minimaxRoot(state, depth, aiPlayer, searchStart);
    if (result.timedOut && bestMove) break;
    bestMove = result.move;
    if (result.score >= 9000) break;
  }

  return bestMove || getLegalMoves(state)[0];
}

function minimaxRoot(state, maxDepth, aiPlayer, searchStart) {
  const moves = getLegalMoves(state);
  orderMoves(moves, state);

  let bestScore = -Infinity;
  let bestMove = moves[0];
  let alpha = -Infinity;
  const beta = Infinity;

  for (const move of moves) {
    if (Date.now() - searchStart > AI_SEARCH_TIME_MS) {
      return { move: bestMove, score: bestScore, timedOut: true };
    }

    const clone = cloneState(state);
    applyMove(clone, move.board, move.cell);

    const score = -minimax(clone, maxDepth - 1, -beta, -alpha,
      opponent(aiPlayer), aiPlayer, searchStart);

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    alpha = Math.max(alpha, score);
  }

  return { move: bestMove, score: bestScore, timedOut: false };
}

function minimax(state, depth, alpha, beta, currentPlayer, aiPlayer, searchStart) {
  if (state.gameOver) {
    if (state.winner === aiPlayer) return 10000 - state.moveCount;
    if (state.winner === opponent(aiPlayer)) return -10000 + state.moveCount;
    return 0;
  }

  if (depth <= 0 || Date.now() - searchStart > AI_SEARCH_TIME_MS) {
    return evaluateState(state, aiPlayer);
  }

  const moves = getLegalMoves(state);
  if (moves.length === 0) return 0;

  orderMoves(moves, state);

  let bestScore = -Infinity;
  for (const move of moves) {
    const clone = cloneState(state);
    applyMove(clone, move.board, move.cell);

    const score = -minimax(clone, depth - 1, -beta, -alpha,
      opponent(currentPlayer), aiPlayer, searchStart);

    bestScore = Math.max(bestScore, score);
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }

  return bestScore;
}

function orderMoves(moves, state) {
  const player = state.currentPlayer;
  moves.sort((a, b) => moveHeuristic(b, state, player) - moveHeuristic(a, state, player));
}

function moveHeuristic(move, state, player) {
  let score = 0;

  if (move.cell === 4) score += 3;
  else if (move.cell === 0 || move.cell === 2 || move.cell === 6 || move.cell === 8) score += 2;

  const boardCopy = [...state.boards[move.board]];
  boardCopy[move.cell] = player;
  if (checkBoardWinner(boardCopy) === player) score += 10;

  if (state.boardWinners[move.cell] !== EMPTY) score -= 2;

  return score;
}

export function evaluateState(state, aiPlayer) {
  const harryEval = evaluateHarry(state);
  const voldemortEval = evaluateVoldemort(state);
  return aiPlayer === HARRY ? harryEval - voldemortEval : voldemortEval - harryEval;
}

function evaluateHarry(state) {
  let score = 0;
  const bw = state.boardWinners;

  for (const [a, b, c] of WIN_LINES) {
    const line = [bw[a], bw[b], bw[c]];
    const harryCount = line.filter(x => x === HARRY).length;
    const blocked = line.filter(x => x === VOLDEMORT || x === DRAW).length;

    if (blocked === 0) {
      if (harryCount === 3) score += 10000;
      else if (harryCount === 2) score += 200;
      else if (harryCount === 1) score += 20;
    }
  }

  const posWeights = [1.3, 1.0, 1.3, 1.0, 1.5, 1.0, 1.3, 1.0, 1.3];
  if (bw[4] === HARRY) score += 40;
  for (const c of [0, 2, 6, 8]) {
    if (bw[c] === HARRY) score += 25;
  }

  for (let bi = 0; bi < TOTAL_BOARDS; bi++) {
    if (bw[bi] !== EMPTY) continue;
    score += evaluateMiniBoard(state.boards[bi], HARRY) * posWeights[bi];
  }

  if (state.spellsRemaining[HARRY].expelliarmus > 0) score += 15;
  if (state.spellsRemaining[HARRY].patronus > 0) score += 10;

  return score;
}

function evaluateVoldemort(state) {
  let score = 0;
  const bw = state.boardWinners;

  const voldemortBoards = bw.filter(x => x === VOLDEMORT).length;
  const openBoards = bw.filter(x => x === EMPTY).length;

  score += voldemortBoards * 100;

  if (voldemortBoards === 4 && openBoards >= 1) score += 300;
  if (voldemortBoards + openBoards < VOLDEMORT_WIN_COUNT) score -= 500;

  for (let bi = 0; bi < TOTAL_BOARDS; bi++) {
    if (bw[bi] !== EMPTY) continue;
    score += evaluateMiniBoard(state.boards[bi], VOLDEMORT);
  }

  if (state.spellsRemaining[VOLDEMORT].avadaKedavra > 0) score += 20;
  if (state.spellsRemaining[VOLDEMORT].darkMark > 0) score += 15;

  score -= state.patronusShields.length * 30;

  return score;
}

function evaluateMiniBoard(cells, player) {
  let score = 0;
  const opp = opponent(player);

  for (const [a, b, c] of WIN_LINES) {
    const line = [cells[a], cells[b], cells[c]];
    const playerCount = line.filter(x => x === player).length;
    const oppCount = line.filter(x => x === opp).length;

    if (oppCount === 0) {
      if (playerCount === 2) score += 10;
      else if (playerCount === 1) score += 2;
    }
    if (playerCount === 0 && oppCount === 2) {
      score -= 8;
    }
  }

  if (cells[4] === player) score += 3;
  return score;
}
