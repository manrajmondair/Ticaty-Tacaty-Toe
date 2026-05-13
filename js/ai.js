import {
  HARRY, VOLDEMORT, EMPTY, DRAW,
  WIN_LINES, VOLDEMORT_WIN_COUNT,
  TOTAL_BOARDS, TOTAL_CELLS,
  ADJACENCY, AI_SEARCH_TIME_MS, AI_MAX_DEPTH
} from './constants.js';
import {
  cloneState, applyMove, getLegalMoves,
  checkBoardWinner, checkGameWinner, opponent
} from './gameState.js';
import { evaluateState, findBestMoveHard } from './aiSearch.js';

// ── Easy: random legal move ──────────────────────────────────────
function aiEasy(state) {
  const moves = getLegalMoves(state);
  return moves[Math.floor(Math.random() * moves.length)];
}

// ── Medium: one-ply lookahead ────────────────────────────────────
function aiMedium(state) {
  const moves = getLegalMoves(state);
  let bestScore = -Infinity;
  let bestMove = moves[0];

  for (const move of moves) {
    const clone = cloneState(state);
    applyMove(clone, move.board, move.cell);
    const score = evaluateState(clone, state.currentPlayer);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}

// ── Hard: iterative deepening negamax with alpha-beta ────────────
// Runs the search in a Web Worker so the main thread never blocks during
// AI thinking. Falls back to a synchronous-with-yields path if Worker is
// unavailable (e.g., SSR, restricted environments).
let aiWorker = null;
let aiWorkerSeq = 0;
let aiWorkerInitFailed = false;
const aiWorkerPending = new Map();

function rejectAllPending(reason) {
  for (const pending of aiWorkerPending.values()) {
    pending.reject(reason);
  }
  aiWorkerPending.clear();
}

function ensureAIWorker() {
  if (aiWorkerInitFailed) return null;
  if (aiWorker) return aiWorker;
  if (typeof Worker === 'undefined') {
    aiWorkerInitFailed = true;
    return null;
  }
  try {
    aiWorker = new Worker(new URL('./aiWorker.js', import.meta.url), { type: 'module' });
    aiWorker.addEventListener('message', (event) => {
      const data = event.data || {};
      const pending = aiWorkerPending.get(data.id);
      if (!pending) return;
      aiWorkerPending.delete(data.id);
      if (data.error) pending.reject(new Error(data.error));
      else pending.resolve(data.move);
    });
    aiWorker.addEventListener('error', (event) => {
      console.error('AI worker error:', event?.message || event);
      rejectAllPending(new Error('AI worker crashed.'));
      aiWorker = null;
      aiWorkerInitFailed = true;
    });
  } catch (error) {
    console.warn('AI worker init failed, using inline fallback:', error);
    aiWorkerInitFailed = true;
    aiWorker = null;
  }
  return aiWorker;
}

async function aiHardInWorker(state) {
  const worker = ensureAIWorker();
  if (!worker) {
    return aiHardInline(state);
  }
  const id = ++aiWorkerSeq;
  return new Promise((resolve, reject) => {
    aiWorkerPending.set(id, { resolve, reject });
    try {
      worker.postMessage({ id, state });
    } catch (error) {
      aiWorkerPending.delete(id);
      reject(error);
    }
  });
}

async function aiHardInline(state) {
  // Fallback for environments without Worker support. findBestMoveHard
  // already self-bounds via AI_SEARCH_TIME_MS, so we just yield once before
  // and after to give the UI a couple of paint windows.
  await new Promise(resolve => setTimeout(resolve, 0));
  const move = findBestMoveHard(state);
  await new Promise(resolve => setTimeout(resolve, 0));
  return move;
}

async function aiHard(state) {
  try {
    return await aiHardInWorker(state);
  } catch (error) {
    console.warn('AI worker request failed, falling back inline:', error);
    return aiHardInline(state);
  }
}

// ── Spell AI (Hard only) ────────────────────────────────────────
export function getAISpellAction(state, difficulty) {
  if (difficulty !== 'hard') return null;

  const player = state.currentPlayer;
  const spells = state.spellsRemaining[player];

  if (player === VOLDEMORT) {
    // Dark Mark: can swapping a Harry mark win a board?
    if (spells.darkMark > 0) {
      for (let bi = 0; bi < TOTAL_BOARDS; bi++) {
        if (state.boardWinners[bi] !== EMPTY) continue;
        for (let ci = 0; ci < TOTAL_CELLS; ci++) {
          if (state.boards[bi][ci] !== HARRY) continue;
          const testBoard = [...state.boards[bi]];
          testBoard[ci] = VOLDEMORT;
          if (checkBoardWinner(testBoard) === VOLDEMORT) {
            return { spell: 'darkMark', board: bi, cell: ci };
          }
        }
      }
    }

    // Avada Kedavra: can double placement win a board?
    if (spells.avadaKedavra > 0) {
      for (let bi = 0; bi < TOTAL_BOARDS; bi++) {
        if (state.boardWinners[bi] !== EMPTY) continue;
        for (let ci = 0; ci < TOTAL_CELLS; ci++) {
          if (state.boards[bi][ci] !== EMPTY) continue;
          const adjMap = ADJACENCY[ci];
          for (const dir of Object.keys(adjMap)) {
            const adjCell = adjMap[dir];
            if (state.boards[bi][adjCell] !== EMPTY) continue;
            const testBoard = [...state.boards[bi]];
            testBoard[ci] = VOLDEMORT;
            testBoard[adjCell] = VOLDEMORT;
            if (checkBoardWinner(testBoard) === VOLDEMORT) {
              return { spell: 'avadaKedavra', board: bi, cell: ci, direction: dir };
            }
          }
        }
      }
    }
  }

  if (player === HARRY) {
    // Expelliarmus: remove a mark threatening to win a board
    if (spells.expelliarmus > 0) {
      for (let bi = 0; bi < TOTAL_BOARDS; bi++) {
        if (state.boardWinners[bi] !== EMPTY) continue;
        for (const [a, b, c] of WIN_LINES) {
          const line = [state.boards[bi][a], state.boards[bi][b], state.boards[bi][c]];
          const vCount = line.filter(x => x === VOLDEMORT).length;
          const eCount = line.filter(x => x === EMPTY).length;
          if (vCount === 2 && eCount === 1) {
            const indices = [a, b, c];
            const target = indices.find(i => state.boards[bi][i] === VOLDEMORT);
            return { spell: 'expelliarmus', board: bi, cell: target };
          }
        }
      }
    }

    // Patronus: shield a highly threatened board
    if (spells.patronus > 0) {
      let mostThreatened = -1;
      let maxThreat = 0;
      for (let bi = 0; bi < TOTAL_BOARDS; bi++) {
        if (state.boardWinners[bi] !== EMPTY) continue;
        if (state.patronusShields.some(s => s.boardIndex === bi)) continue;
        let threat = 0;
        for (const [a, b, c] of WIN_LINES) {
          const line = [state.boards[bi][a], state.boards[bi][b], state.boards[bi][c]];
          const vCount = line.filter(x => x === VOLDEMORT).length;
          const eCount = line.filter(x => x === EMPTY).length;
          if (vCount === 2 && eCount === 1) threat += 10;
          else if (vCount === 1 && eCount === 2) threat += 2;
        }
        if (threat > maxThreat) {
          maxThreat = threat;
          mostThreatened = bi;
        }
      }
      if (mostThreatened >= 0 && maxThreat >= 10) {
        return { spell: 'patronus', board: mostThreatened };
      }
    }
  }

  return null;
}

// ── Public API ───────────────────────────────────────────────────
// Always returns a Promise so callers can use a single await regardless of
// difficulty; hard mode is async (yields to the event loop), the other
// difficulties resolve synchronously.
export async function getAIMove(state, difficulty) {
  switch (difficulty) {
    case 'easy': return aiEasy(state);
    case 'medium': return aiMedium(state);
    case 'hard': return aiHard(state);
    default: return aiMedium(state);
  }
}
