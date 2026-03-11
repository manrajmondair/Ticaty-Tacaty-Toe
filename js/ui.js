import { HARRY, VOLDEMORT, EMPTY, ADJACENCY, SPELLS } from './constants.js';
import { renderBoard, updateBoard, animateSpellEffect } from './board.js';
import {
  createInitialState, cloneState, isValidMove, applyMove, opponent
} from './gameState.js';
import {
  castExpelliarmus, castPatronus, castAvadaKedavra, castDarkMark
} from './spells.js';
import { getAIMove, getAISpellAction } from './ai.js';

let app = {
  mode: null,        // 'pvp' | 'ai'
  humanPlayer: null,
  difficulty: null,
  gameState: null,
  prevGameState: null,
  aiThinking: false
};

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

export function initUI() {
  // Title screen
  document.getElementById('btn-pvp').addEventListener('click', () => {
    app.mode = 'pvp';
    startGame();
  });

  document.getElementById('btn-ai').addEventListener('click', () => {
    app.mode = 'ai';
    showScreen('screen-setup');
  });

  // Setup screen — role selection
  document.querySelectorAll('.role-card').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.role-card').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  document.getElementById('btn-start-game').addEventListener('click', () => {
    const roleBtn = document.querySelector('.role-card.selected');
    app.humanPlayer = roleBtn ? roleBtn.dataset.role : HARRY;
    app.difficulty = document.getElementById('difficulty').value;
    startGame();
  });

  // Board clicks (event delegation)
  document.getElementById('ultimate-board').addEventListener('click', handleCellClick);

  // Spell buttons
  document.querySelectorAll('.spell-btn').forEach(btn => {
    btn.addEventListener('click', () => handleSpellActivation(btn.dataset.spell));
  });

  document.getElementById('spell-cancel').addEventListener('click', cancelSpell);

  // Game over
  document.getElementById('btn-rematch').addEventListener('click', startGame);
  document.getElementById('btn-main-menu').addEventListener('click', () => showScreen('screen-title'));

  // How-to-play toggle
  document.getElementById('btn-how-to-play').addEventListener('click', () => {
    document.getElementById('rules-modal').classList.add('active');
  });
  document.getElementById('close-rules').addEventListener('click', () => {
    document.getElementById('rules-modal').classList.remove('active');
  });
}

function startGame() {
  app.gameState = createInitialState();
  app.prevGameState = null;
  app.aiThinking = false;

  showScreen('screen-game');

  const container = document.getElementById('ultimate-board');
  renderBoard(container);
  updateBoard(app.gameState, null);
  updateUI();
  clearLog();
  logMessage('The duel begins. Harry moves first.');

  // If AI goes first
  if (app.mode === 'ai' && app.humanPlayer === VOLDEMORT) {
    scheduleAIMove();
  }
}

function handleCellClick(event) {
  const cellEl = event.target.closest('.cell');
  if (!cellEl) return;

  const boardIndex = parseInt(cellEl.dataset.board);
  const cellIndex = parseInt(cellEl.dataset.cell);
  const state = app.gameState;

  // Spell targeting mode
  if (state.castingSpell) {
    handleSpellTarget(boardIndex, cellIndex);
    return;
  }

  // Block clicks when AI is thinking or not your turn
  if (app.aiThinking) return;
  if (app.mode === 'ai' && state.currentPlayer !== app.humanPlayer) return;

  if (!isValidMove(state, boardIndex, cellIndex)) return;

  app.prevGameState = cloneState(state);
  applyMove(state, boardIndex, cellIndex);
  updateBoard(state, app.prevGameState);
  updateUI();

  const playerName = app.prevGameState.currentPlayer === HARRY ? 'Harry' : 'Voldemort';
  logMessage(`${playerName} placed on board ${boardIndex + 1}, cell ${cellIndex + 1}.`);

  if (state.gameOver) {
    setTimeout(() => endGame(), 800);
    return;
  }

  if (app.mode === 'ai') {
    scheduleAIMove();
  }
}

function scheduleAIMove() {
  app.aiThinking = true;
  updateUI();

  setTimeout(() => {
    const state = app.gameState;
    const aiPlayer = state.currentPlayer;
    const playerName = aiPlayer === HARRY ? 'Harry' : 'Voldemort';

    // Check if AI should cast a spell
    const spellAction = getAISpellAction(state, app.difficulty);
    if (spellAction) {
      executeAISpell(spellAction);
    } else {
      const move = getAIMove(state, app.difficulty);
      if (move) {
        app.prevGameState = cloneState(state);
        applyMove(state, move.board, move.cell);
        updateBoard(state, app.prevGameState);
        logMessage(`${playerName} placed on board ${move.board + 1}, cell ${move.cell + 1}.`);
      }
    }

    app.aiThinking = false;
    updateUI();

    if (state.gameOver) {
      setTimeout(() => endGame(), 800);
    }
  }, 400);
}

function executeAISpell(action) {
  const state = app.gameState;
  let result;

  switch (action.spell) {
    case 'expelliarmus':
      result = castExpelliarmus(state, action.board, action.cell);
      break;
    case 'patronus':
      result = castPatronus(state, action.board);
      break;
    case 'avadaKedavra':
      result = castAvadaKedavra(state, action.board, action.cell, action.direction);
      break;
    case 'darkMark':
      result = castDarkMark(state, action.board, action.cell);
      break;
  }

  if (result && result.success) {
    animateSpellEffect(result.affectedCells, action.spell);
    updateBoard(state, null);
    logMessage(result.message);
  }
}

function handleSpellActivation(spellKey) {
  const state = app.gameState;
  const player = state.currentPlayer;

  if (app.aiThinking) return;
  if (app.mode === 'ai' && player !== app.humanPlayer) return;

  // Verify ownership
  const spell = SPELLS[spellKey];
  if (!spell || spell.owner !== player) return;

  // Check uses remaining
  const remaining = state.spellsRemaining[player][spellKey];
  if (remaining <= 0) return;

  state.castingSpell = spellKey;
  state.spellTargetStep = 0;
  state._avadaTarget = null;

  const instructions = {
    expelliarmus: "Select one of Voldemort's marks to remove.",
    patronus: 'Select a mini-board to shield for 2 turns.',
    avadaKedavra: 'Select an empty cell — then choose an adjacent cell.',
    darkMark: "Select one of Harry's marks to corrupt."
  };

  document.getElementById('spell-instructions-text').textContent = instructions[spellKey];
  document.getElementById('spell-instructions').hidden = false;
  document.getElementById('ultimate-board').classList.add('spell-targeting', `targeting-${spellKey}`);
}

function handleSpellTarget(boardIndex, cellIndex) {
  const state = app.gameState;
  const spell = state.castingSpell;
  let result;

  switch (spell) {
    case 'expelliarmus':
      result = castExpelliarmus(state, boardIndex, cellIndex);
      break;

    case 'patronus':
      result = castPatronus(state, boardIndex);
      break;

    case 'avadaKedavra':
      if (state.spellTargetStep === 0) {
        // First click: select primary cell
        if (state.boardWinners[boardIndex] !== EMPTY) {
          logMessage('Must target an active board.');
          return;
        }
        if (state.boards[boardIndex][cellIndex] !== EMPTY) {
          logMessage('Primary cell must be empty.');
          return;
        }
        state._avadaTarget = { board: boardIndex, cell: cellIndex };
        state.spellTargetStep = 1;

        // Highlight the selected cell
        const cellEl = document.querySelector(
          `.cell[data-board="${boardIndex}"][data-cell="${cellIndex}"]`
        );
        if (cellEl) cellEl.classList.add('avada-selected');

        document.getElementById('spell-instructions-text').textContent =
          'Now select an adjacent empty cell.';
        return;
      } else {
        // Second click: select direction
        const target = state._avadaTarget;
        if (target.board !== boardIndex) {
          logMessage('Must target the same board.');
          return;
        }
        const adjMap = ADJACENCY[target.cell];
        const dirEntry = Object.entries(adjMap).find(([, idx]) => idx === cellIndex);
        if (!dirEntry) {
          logMessage('Must select an adjacent cell.');
          return;
        }
        result = castAvadaKedavra(state, target.board, target.cell, dirEntry[0]);

        // Remove highlight
        const prevEl = document.querySelector('.avada-selected');
        if (prevEl) prevEl.classList.remove('avada-selected');
      }
      break;

    case 'darkMark':
      result = castDarkMark(state, boardIndex, cellIndex);
      break;
  }

  if (result) {
    if (result.success) {
      animateSpellEffect(result.affectedCells, spell);
      cancelSpell();
      updateBoard(state, null);
      updateUI();
      logMessage(result.message);

      if (state.gameOver) {
        setTimeout(() => endGame(), 800);
        return;
      }

      if (app.mode === 'ai') {
        scheduleAIMove();
      }
    } else {
      logMessage(result.message);
    }
  }
}

function cancelSpell() {
  const state = app.gameState;
  state.castingSpell = null;
  state.spellTargetStep = 0;
  state._avadaTarget = null;

  document.getElementById('spell-instructions').hidden = true;
  const board = document.getElementById('ultimate-board');
  board.classList.remove('spell-targeting',
    'targeting-expelliarmus', 'targeting-patronus',
    'targeting-avadaKedavra', 'targeting-darkMark');

  const prevEl = document.querySelector('.avada-selected');
  if (prevEl) prevEl.classList.remove('avada-selected');
}

function updateUI() {
  const state = app.gameState;

  // Turn indicator
  const indicator = document.getElementById('turn-indicator');
  if (app.aiThinking) {
    const name = state.currentPlayer === HARRY ? 'Harry' : 'The Dark Lord';
    indicator.textContent = `${name} ponders...`;
    indicator.className = 'turn-indicator thinking';
  } else {
    const name = state.currentPlayer === HARRY ? "Harry's Turn" : "Voldemort's Turn";
    indicator.textContent = name;
    indicator.className = `turn-indicator turn-${state.currentPlayer}`;
  }

  // Board counts
  const bw = state.boardWinners;
  document.getElementById('harry-boards').textContent = bw.filter(w => w === HARRY).length;
  document.getElementById('voldemort-boards').textContent = bw.filter(w => w === VOLDEMORT).length;

  // Win condition reminders
  document.getElementById('harry-goal').textContent = '3 in a row';
  document.getElementById('voldemort-goal').textContent = '5 of 9';

  updateSpellButtons(state);
}

function updateSpellButtons(state) {
  const player = state.currentPlayer;

  // In PvP: show current player's spells. In AI: show human's spells only.
  const showHarry = app.mode === 'pvp'
    ? player === HARRY
    : app.humanPlayer === HARRY;
  const showVoldemort = app.mode === 'pvp'
    ? player === VOLDEMORT
    : app.humanPlayer === VOLDEMORT;

  document.getElementById('harry-spells').classList.toggle('visible', showHarry);
  document.getElementById('voldemort-spells').classList.toggle('visible', showVoldemort);

  const setBtn = (id, spellKey, owner) => {
    const btn = document.getElementById(id);
    const remaining = state.spellsRemaining[owner][spellKey];
    btn.disabled = remaining <= 0 || app.aiThinking ||
      (app.mode === 'ai' && player !== app.humanPlayer);
    btn.classList.toggle('used', remaining <= 0);
  };

  setBtn('spell-expelliarmus', 'expelliarmus', HARRY);
  setBtn('spell-patronus', 'patronus', HARRY);
  setBtn('spell-avada', 'avadaKedavra', VOLDEMORT);
  setBtn('spell-darkmark', 'darkMark', VOLDEMORT);
}

function endGame() {
  const state = app.gameState;
  const title = document.getElementById('result-title');
  const desc = document.getElementById('result-desc');

  if (state.winner === HARRY) {
    title.textContent = 'The Boy Who Lived Triumphs!';
    title.className = 'result-title harry-victory';
    desc.textContent = 'Harry has aligned three boards and vanquished the Dark Lord.';
  } else if (state.winner === VOLDEMORT) {
    title.textContent = 'Darkness Prevails...';
    title.className = 'result-title voldemort-victory';
    desc.textContent = 'Lord Voldemort has corrupted enough Horcruxes to reign supreme.';
  } else {
    title.textContent = 'A Stalemate in the Wizarding World';
    title.className = 'result-title';
    desc.textContent = 'Neither side could claim victory. The battle rages on...';
  }

  showScreen('screen-gameover');
}

function logMessage(msg) {
  const log = document.getElementById('game-log');
  const entry = document.createElement('div');
  entry.classList.add('log-entry');
  entry.textContent = msg;
  log.prepend(entry);
  while (log.children.length > 8) {
    log.removeChild(log.lastChild);
  }
}

function clearLog() {
  document.getElementById('game-log').innerHTML = '';
}
