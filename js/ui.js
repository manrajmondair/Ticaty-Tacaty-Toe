import { ADJACENCY, DRAW, EMPTY, HARRY, SPELLS, VOLDEMORT } from './constants.js';
import { animateSpellEffect, renderBoard, updateBoard } from './board.js';
import { createOnlineClient } from './online.js';
import { getAIMove, getAISpellAction } from './ai.js';
import { hydrateState } from './engine.js';
import { createInitialState, cloneState, isValidMove, applyMove } from './gameState.js';
import {
  castAvadaKedavra,
  castDarkMark,
  castExpelliarmus,
  castPatronus
} from './spells.js';

const SPELL_INSTRUCTIONS = {
  expelliarmus: "Select one of Voldemort's marks to remove.",
  patronus: 'Select a mini-board to shield for 2 turns.',
  avadaKedavra: 'Select an empty cell, then choose an adjacent empty cell.',
  darkMark: "Select one of Harry's marks to corrupt."
};

let app = {
  mode: null,
  humanPlayer: null,
  difficulty: 'hard',
  gameState: null,
  prevGameState: null,
  aiThinking: false,
  actionPending: false,
  onlineClient: null,
  onlineState: {
    available: false,
    authReady: false,
    connected: true,
    user: null,
    profile: null,
    queueEntry: null,
    queueStatus: 'idle',
    match: null,
    leaderboard: [],
    opponentPresence: null,
    error: '',
    loadingText: ''
  },
  lastOnlineMatchId: null,
  previousScreenBeforeLeaderboard: 'screen-title',
  disconnectTimeoutId: null,
  screenTransitionTimeoutId: null
};

function el(id) {
  return document.getElementById(id);
}

function getCurrentScreenId() {
  return document.querySelector('.screen.active')?.id || null;
}

function openRulesModal() {
  el('rules-modal').classList.add('active');
}

function closeRulesModal() {
  el('rules-modal').classList.remove('active');
}

function showScreen(screenId) {
  const currentScreenId = getCurrentScreenId();
  if (currentScreenId === screenId) return;

  if (currentScreenId === 'screen-game' && screenId !== 'screen-game') {
    cancelSpell(true);
  }

  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active', 'is-entering');
  });

  const nextScreen = el(screenId);
  if (nextScreen) {
    document.body.classList.toggle('in-game-screen', screenId === 'screen-game');
    nextScreen.classList.add('active', 'is-entering');
    clearTimeout(app.screenTransitionTimeoutId);
    app.screenTransitionTimeoutId = setTimeout(() => {
      nextScreen.classList.remove('is-entering');
    }, 520);
  }
}

function ensureBoardRendered() {
  const container = el('ultimate-board');
  if (!container.children.length) {
    renderBoard(container);
  }
}

function prepareFreshBoard() {
  const container = el('ultimate-board');
  renderBoard(container);
}

function getOnlineRole(match = app.onlineState.match) {
  const uid = app.onlineState.user?.uid;
  if (!uid || !match?.players?.[uid]) return null;
  return match.players[uid].role;
}

function getOpponentUid(match = app.onlineState.match) {
  const uid = app.onlineState.user?.uid;
  return Object.keys(match?.players || {}).find(playerUid => playerUid !== uid) || null;
}

function formatSignedNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '0';
  return value > 0 ? `+${value}` : `${value}`;
}

function clearDisconnectTimer() {
  if (app.disconnectTimeoutId) {
    clearTimeout(app.disconnectTimeoutId);
    app.disconnectTimeoutId = null;
  }
}

function resetPlayerHeader() {
  el('harry-name').textContent = 'Harry';
  el('voldemort-name').textContent = 'Voldemort';
}

function updatePlayerHeaderNames() {
  if (app.mode !== 'online' || !app.onlineState.match) {
    resetPlayerHeader();
    return;
  }

  const match = app.onlineState.match;
  const harryUid = match.assignedRoles?.[HARRY];
  const voldemortUid = match.assignedRoles?.[VOLDEMORT];
  const harryPlayer = harryUid ? match.players?.[harryUid] : null;
  const voldemortPlayer = voldemortUid ? match.players?.[voldemortUid] : null;

  el('harry-name').textContent = harryPlayer
    ? `${harryPlayer.displayName} as Harry`
    : 'Harry';
  el('voldemort-name').textContent = voldemortPlayer
    ? `${voldemortPlayer.displayName} as Voldemort`
    : 'Voldemort';
}

function updateTitleActions() {
  const rematchButton = el('btn-rematch');
  rematchButton.textContent = app.mode === 'online' ? 'Back to Lobby' : 'Rematch';
}

function updateGameExitButton() {
  const exitButton = el('btn-game-exit');
  if (!exitButton) return;
  exitButton.textContent = app.mode === 'online' ? 'Back to Lobby' : 'Main Menu';
}

function getDisplayRank(uid) {
  if (!uid) return 'Unranked';
  const index = app.onlineState.leaderboard.findIndex(entry => entry.uid === uid);
  return index >= 0 ? `#${index + 1}` : 'Unranked';
}

function renderLeaderboard() {
  const body = el('leaderboard-body');
  const empty = el('leaderboard-empty');
  const rows = app.onlineState.leaderboard;
  const currentUid = app.onlineState.user?.uid;

  body.innerHTML = '';

  if (!rows.length) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;

  rows.forEach((entry, index) => {
    const row = document.createElement('tr');
    if (entry.uid === currentUid) {
      row.classList.add('is-you');
    }

    row.innerHTML = `
      <td>#${index + 1}</td>
      <td>${entry.displayName}</td>
      <td>${entry.duelingRating}</td>
      <td>${entry.wins}-${entry.losses}-${entry.draws}</td>
      <td>${entry.bestStreak}</td>
    `;

    body.appendChild(row);
  });

  if (app.onlineState.profile?.isGuest) {
    el('leaderboard-summary').textContent =
      'Guest accounts can play ranked immediately, but they only appear on this leaderboard after upgrading.';
  } else if (app.onlineState.user) {
    el('leaderboard-summary').textContent =
      `Your current standing: ${getDisplayRank(app.onlineState.user.uid)}.`;
  } else {
    el('leaderboard-summary').textContent =
      'The top witches and wizards across every ranked duel.';
  }
}

function updateOnlinePanels() {
  const state = app.onlineState;
  const availability = el('online-availability');
  const authStatus = el('online-auth-status');
  const profileName = el('online-profile-name');
  const profileRating = el('online-profile-rating');
  const profileRecord = el('online-profile-record');
  const profileRank = el('online-profile-rank');
  const profileNote = el('online-profile-note');
  const queueStatus = el('online-queue-status');
  const error = el('online-error');
  const queueButton = el('btn-online-queue');
  const leaveButton = el('btn-online-leave');
  const resumeButton = el('btn-online-resume');
  const signOutButton = el('btn-online-signout');
  const upgradeCard = el('online-upgrade-card');

  availability.textContent = state.available
    ? 'Find an opponent, duel for rank, and return anytime to finish an active match.'
    : 'Online duels are unavailable right now.';

  error.hidden = !state.error;
  error.textContent = state.error || '';

  if (!state.available) {
    authStatus.textContent = 'Online duels are sleeping right now.';
    profileName.textContent = '-';
    profileRating.textContent = '-';
    profileRecord.textContent = '-';
    profileRank.textContent = '-';
    profileNote.textContent = 'Local duel and AI modes still work normally.';
    queueStatus.textContent = 'Online matchmaking is unavailable.';
    queueButton.disabled = true;
    leaveButton.disabled = true;
    resumeButton.hidden = true;
    signOutButton.hidden = true;
    upgradeCard.hidden = true;
    renderLeaderboard();
    return;
  }

  if (!state.authReady || !state.profile) {
    authStatus.textContent = state.loadingText || 'Binding your wand to the network...';
    profileName.textContent = '-';
    profileRating.textContent = '-';
    profileRecord.textContent = '-';
    profileRank.textContent = '-';
    profileNote.textContent = 'Guest accounts are created automatically for ranked play.';
  } else {
    authStatus.textContent = state.profile.isGuest
      ? 'Signed in as a guest.'
      : 'Signed in with a permanent account.';
    profileName.textContent = state.profile.displayName;
    profileRating.textContent = `${state.profile.duelingRating} (${formatSignedNumber(state.profile.lastMatchDelta)})`;
    profileRecord.textContent = `${state.profile.wins}-${state.profile.losses}-${state.profile.draws}`;
    profileRank.textContent = getDisplayRank(state.user?.uid);
    profileNote.textContent = state.profile.isGuest
      ? 'Upgrade this guest to preserve your rating across devices and appear on the public leaderboard.'
      : 'This account can be used on any device to restore your ranked progress.';
  }

  const hasActiveMatch = Boolean(state.match && state.match.status === 'active');
  if (hasActiveMatch) {
    queueStatus.textContent = 'A ranked duel is active. Resume whenever you are ready.';
  } else if (state.queueStatus === 'searching') {
    queueStatus.textContent = 'Searching the castle grounds for another player...';
  } else {
    queueStatus.textContent = 'Step into the ranked queue when you are ready.';
  }

  queueButton.disabled = !state.profile || state.queueStatus === 'searching' || hasActiveMatch;
  leaveButton.disabled = state.queueStatus !== 'searching';
  queueButton.hidden = state.queueStatus === 'searching' || hasActiveMatch;
  leaveButton.hidden = state.queueStatus !== 'searching';
  resumeButton.hidden = !hasActiveMatch;
  signOutButton.hidden = !state.profile || state.profile.isGuest;
  upgradeCard.hidden = !state.profile?.isGuest;

  renderLeaderboard();
}

function updateMatchStatusBar() {
  const bar = el('match-status-bar');
  const text = el('match-status-text');
  const resignButton = el('btn-online-resign');
  const forfeitButton = el('btn-claim-forfeit');

  if (app.mode !== 'online' || !app.onlineState.match || getCurrentScreenId() !== 'screen-game') {
    bar.hidden = true;
    resignButton.hidden = true;
    forfeitButton.hidden = true;
    clearDisconnectTimer();
    return;
  }

  const match = app.onlineState.match;
  const myRole = getOnlineRole(match);
  const opponentUid = getOpponentUid(match);
  const opponent = opponentUid ? match.players?.[opponentUid] : null;
  const presence = app.onlineState.opponentPresence;

  bar.hidden = false;
  resignButton.hidden = false;
  forfeitButton.hidden = true;

  if (match.status === 'completed') {
    text.textContent = 'This ranked duel has been resolved.';
    resignButton.hidden = true;
    forfeitButton.hidden = true;
    clearDisconnectTimer();
    return;
  }

  if (app.actionPending) {
    text.textContent = 'Casting your move into the duel...';
    clearDisconnectTimer();
    return;
  }

  if (presence?.connected === false && opponent) {
    const elapsed = Date.now() - (presence.lastSeenAt || Date.now());
    const remaining = Math.max(0, Math.ceil((60_000 - elapsed) / 1000));
    text.textContent = `${opponent.displayName} is disconnected. Their duel expires in about ${remaining} seconds.`;

    clearDisconnectTimer();
    if (elapsed >= 60_000) {
      forfeitButton.hidden = false;
    } else {
      app.disconnectTimeoutId = setTimeout(() => {
        claimDisconnectForfeit().catch(() => {});
      }, (60_000 - elapsed) + 100);
    }
    return;
  }

  clearDisconnectTimer();
  text.textContent = `Ranked duel live. You are ${myRole === HARRY ? 'Harry' : 'Voldemort'}.`;
}

function setSpellInstructions(spellKey, overrideText = null) {
  el('spell-instructions-text').textContent = overrideText || SPELL_INSTRUCTIONS[spellKey];
  el('spell-instructions').hidden = false;
}

function activateSpell(spellKey) {
  const state = app.gameState;
  state.castingSpell = spellKey;
  state.spellTargetStep = 0;
  state._avadaTarget = null;

  setSpellInstructions(spellKey);
  const board = el('ultimate-board');
  board.classList.add('spell-targeting', `targeting-${spellKey}`);
  updateSpellButtons(state);
}

function cancelSpell(silent = false) {
  if (!app.gameState) return;

  const state = app.gameState;
  state.castingSpell = null;
  state.spellTargetStep = 0;
  state._avadaTarget = null;

  el('spell-instructions').hidden = true;
  const board = el('ultimate-board');
  board.classList.remove(
    'spell-targeting',
    'targeting-expelliarmus',
    'targeting-patronus',
    'targeting-avadaKedavra',
    'targeting-darkMark'
  );

  document.querySelector('.avada-selected')?.classList.remove('avada-selected');
  document.querySelectorAll('.spell-btn').forEach(button => button.classList.remove('selected'));

  if (!silent) {
    updateUI();
  }
}

function canHumanAct() {
  if (!app.gameState || app.gameState.gameOver) return false;

  if (app.mode === 'online') {
    const match = app.onlineState.match;
    return Boolean(
      match &&
      match.status === 'active' &&
      getOnlineRole(match) === app.gameState.currentPlayer &&
      !app.actionPending
    );
  }

  if (app.mode === 'ai') {
    return app.gameState.currentPlayer === app.humanPlayer && !app.aiThinking;
  }

  return !app.aiThinking;
}

function updateSpellButtons(state) {
  const player = state.currentPlayer;
  const onlineRole = getOnlineRole();

  const showHarry = app.mode === 'online'
    ? onlineRole === HARRY
    : app.mode === 'pvp'
      ? player === HARRY
      : app.humanPlayer === HARRY;
  const showVoldemort = app.mode === 'online'
    ? onlineRole === VOLDEMORT
    : app.mode === 'pvp'
      ? player === VOLDEMORT
      : app.humanPlayer === VOLDEMORT;

  el('harry-spells').classList.toggle('visible', showHarry);
  el('voldemort-spells').classList.toggle('visible', showVoldemort);

  const setButtonState = (id, spellKey, owner) => {
    const button = el(id);
    const remaining = state.spellsRemaining[owner][spellKey];
    const canCast = canHumanAct() && owner === player;

    button.disabled = remaining <= 0 || !canCast;
    button.classList.toggle('used', remaining <= 0);
    button.classList.toggle('selected', state.castingSpell === spellKey);
  };

  setButtonState('spell-expelliarmus', 'expelliarmus', HARRY);
  setButtonState('spell-patronus', 'patronus', HARRY);
  setButtonState('spell-avada', 'avadaKedavra', VOLDEMORT);
  setButtonState('spell-darkmark', 'darkMark', VOLDEMORT);
}

function updateTurnIndicator() {
  const indicator = el('turn-indicator');
  const state = app.gameState;

  if (!state) {
    indicator.textContent = 'Awaiting the duel';
    indicator.className = 'turn-indicator';
    return;
  }

  if (app.actionPending) {
    indicator.textContent = 'The spell is in motion...';
    indicator.className = 'turn-indicator thinking';
    return;
  }

  if (app.aiThinking) {
    const thinker = state.currentPlayer === HARRY ? 'Harry' : 'The Dark Lord';
    indicator.textContent = `${thinker} ponders...`;
    indicator.className = 'turn-indicator thinking';
    return;
  }

  if (app.mode === 'online' && app.onlineState.match) {
    const currentUid = app.onlineState.match.assignedRoles?.[state.currentPlayer];
    const currentPlayer = currentUid ? app.onlineState.match.players?.[currentUid] : null;
    indicator.textContent = currentPlayer
      ? `${currentPlayer.displayName}'s Turn (${state.currentPlayer === HARRY ? 'Harry' : 'Voldemort'})`
      : `${state.currentPlayer === HARRY ? 'Harry' : 'Voldemort'}'s Turn`;
    indicator.className = `turn-indicator turn-${state.currentPlayer}`;
    return;
  }

  indicator.textContent = state.currentPlayer === HARRY ? "Harry's Turn" : "Voldemort's Turn";
  indicator.className = `turn-indicator turn-${state.currentPlayer}`;
}

function updateUI() {
  const state = app.gameState;
  if (!state) return;

  updateTurnIndicator();
  updatePlayerHeaderNames();
  el('harry-boards').textContent = state.boardWinners.filter(value => value === HARRY).length;
  el('voldemort-boards').textContent = state.boardWinners.filter(value => value === VOLDEMORT).length;
  el('harry-goal').textContent = '3 in a row';
  el('voldemort-goal').textContent = '5 of 9';
  updateSpellButtons(state);
  updateMatchStatusBar();
  updateTitleActions();
  updateGameExitButton();
}

function formatActionLogEntry(action, match = null) {
  const actorName = match?.players?.[action.actorUid]?.displayName ||
    (action.actorRole === HARRY ? 'Harry' : 'Voldemort');

  if (action.type === 'move') {
    return `${actorName} placed on board ${action.board + 1}, cell ${action.cell + 1}.`;
  }
  if (action.type === 'spell') {
    return `${actorName} cast ${SPELLS[action.spellKey]?.name || action.spellKey}.`;
  }
  if (action.type === 'resign') {
    return `${actorName} conceded the duel.`;
  }
  return 'A new action was recorded.';
}

function clearLog() {
  el('game-log').innerHTML = '';
}

function logMessage(message) {
  const log = el('game-log');
  const entry = document.createElement('div');
  entry.classList.add('log-entry');
  entry.textContent = message;
  log.prepend(entry);
  while (log.children.length > 8) {
    log.removeChild(log.lastChild);
  }
}

function renderOnlineLog(match) {
  const log = el('game-log');
  log.innerHTML = '';

  const entries = (match.moveHistory || [])
    .slice(-8)
    .map(action => formatActionLogEntry(action, match))
    .reverse();

  if (!entries.length) {
    const intro = document.createElement('div');
    intro.classList.add('log-entry');
    intro.textContent = 'A ranked duel has begun. Harry moves first.';
    log.appendChild(intro);
    return;
  }

  entries.forEach(message => {
    const entry = document.createElement('div');
    entry.classList.add('log-entry');
    entry.textContent = message;
    log.appendChild(entry);
  });
}

function startLocalGame() {
  app.gameState = createInitialState();
  app.prevGameState = null;
  app.aiThinking = false;
  app.actionPending = false;
  app.lastOnlineMatchId = null;
  clearDisconnectTimer();

  prepareFreshBoard();
  cancelSpell(true);
  updateBoard(app.gameState, null);
  updateUI();
  clearLog();
  logMessage('The duel begins. Harry moves first.');
  showScreen('screen-game');

  if (app.mode === 'ai' && app.humanPlayer === VOLDEMORT) {
    scheduleAIMove();
  }
}

function startOnlineGame(match) {
  const isSameMatch = app.lastOnlineMatchId === match.id;
  app.prevGameState = isSameMatch && app.gameState ? cloneState(app.gameState) : null;
  app.gameState = hydrateState(match.stateSnapshot);
  app.aiThinking = false;
  app.actionPending = false;

  if (!isSameMatch) {
    prepareFreshBoard();
    clearLog();
    cancelSpell(true);
  } else {
    ensureBoardRendered();
  }

  updateBoard(app.gameState, app.prevGameState);
  renderOnlineLog(match);
  app.lastOnlineMatchId = match.id;
  updateUI();
  showScreen('screen-game');

  if (match.status === 'completed' && match.ratingDelta) {
    endGame();
  }
}

function endGame() {
  const title = el('result-title');
  const description = el('result-desc');
  const state = app.gameState;

  if (app.mode === 'online' && app.onlineState.match) {
    const match = app.onlineState.match;
    const myUid = app.onlineState.user?.uid;
    const myDelta = match.ratingDelta?.[myUid] ?? 0;
    const winnerName = match.winnerUid ? match.players?.[match.winnerUid]?.displayName : null;

    if (state.winner === DRAW) {
      title.textContent = 'The Ranked Duel Ends in a Draw';
      title.className = 'result-title';
      description.textContent = `Neither side prevailed. Your Dueling Rating changed by ${formatSignedNumber(myDelta)}.`;
    } else if (match.winnerUid === myUid) {
      title.textContent = 'Victory in the Ranked Duel';
      title.className = `result-title ${state.winner === HARRY ? 'harry-victory' : 'voldemort-victory'}`;
      description.textContent = `${winnerName || 'You'} claimed the match. Your Dueling Rating changed by ${formatSignedNumber(myDelta)}.`;
    } else {
      title.textContent = 'The Ranked Duel Was Lost';
      title.className = `result-title ${state.winner === HARRY ? 'harry-victory' : 'voldemort-victory'}`;
      description.textContent = `${winnerName || 'Your rival'} prevailed. Your Dueling Rating changed by ${formatSignedNumber(myDelta)}.`;
    }
  } else if (state.winner === HARRY) {
    title.textContent = 'The Boy Who Lived Triumphs!';
    title.className = 'result-title harry-victory';
    description.textContent = 'Harry has aligned three boards and vanquished the Dark Lord.';
  } else if (state.winner === VOLDEMORT) {
    title.textContent = 'Darkness Prevails...';
    title.className = 'result-title voldemort-victory';
    description.textContent = 'Lord Voldemort has corrupted enough Horcruxes to reign supreme.';
  } else {
    title.textContent = 'A Stalemate in the Wizarding World';
    title.className = 'result-title';
    description.textContent = 'Neither side could claim victory. The battle rages on...';
  }

  updateTitleActions();
  showScreen('screen-gameover');
}

function handleLocalMove(boardIndex, cellIndex) {
  const state = app.gameState;
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

async function handleOnlineMove(boardIndex, cellIndex) {
  const match = app.onlineState.match;
  if (!match || !isValidMove(app.gameState, boardIndex, cellIndex)) return;

  app.actionPending = true;
  updateUI();

  try {
    await app.onlineClient.submitMove(match.id, boardIndex, cellIndex);
  } catch (error) {
    logMessage(error.message);
  } finally {
    app.actionPending = false;
    updateUI();
  }
}

function scheduleAIMove() {
  app.aiThinking = true;
  updateUI();

  setTimeout(() => {
    const state = app.gameState;
    const aiPlayer = state.currentPlayer;
    const playerName = aiPlayer === HARRY ? 'Harry' : 'Voldemort';
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
  let result = null;

  if (action.spell === 'expelliarmus') result = castExpelliarmus(state, action.board, action.cell);
  if (action.spell === 'patronus') result = castPatronus(state, action.board);
  if (action.spell === 'avadaKedavra') {
    result = castAvadaKedavra(state, action.board, action.cell, action.direction);
  }
  if (action.spell === 'darkMark') result = castDarkMark(state, action.board, action.cell);

  if (result?.success) {
    animateSpellEffect(result.affectedCells, action.spell);
    updateBoard(state, null);
    logMessage(result.message);
  }
}

function handleSpellActivation(spellKey) {
  if (!app.gameState || !canHumanAct()) return;

  const state = app.gameState;
  const player = state.currentPlayer;
  const spell = SPELLS[spellKey];
  if (!spell || spell.owner !== player) return;

  if (state.castingSpell === spellKey) {
    cancelSpell();
    return;
  }

  if (state.spellsRemaining[player][spellKey] <= 0) return;

  cancelSpell(true);
  activateSpell(spellKey);
}

function prepareAvadaPrimary(boardIndex, cellIndex) {
  const state = app.gameState;
  if (state.boardWinners[boardIndex] !== EMPTY) {
    logMessage('Must target an active board.');
    return false;
  }
  if (state.boards[boardIndex][cellIndex] !== EMPTY) {
    logMessage('Primary cell must be empty.');
    return false;
  }

  state._avadaTarget = { board: boardIndex, cell: cellIndex };
  state.spellTargetStep = 1;
  document.querySelector('.avada-selected')?.classList.remove('avada-selected');
  document
    .querySelector(`.cell[data-board="${boardIndex}"][data-cell="${cellIndex}"]`)
    ?.classList.add('avada-selected');
  setSpellInstructions('avadaKedavra', 'Now select an adjacent empty cell.');
  updateSpellButtons(state);
  return true;
}

function getAvadaDirection(boardIndex, cellIndex) {
  const target = app.gameState._avadaTarget;
  if (!target) return null;
  if (target.board !== boardIndex) {
    logMessage('Must target the same board.');
    return null;
  }

  const adjacency = ADJACENCY[target.cell];
  const directionEntry = Object.entries(adjacency).find(([, index]) => index === cellIndex);
  if (!directionEntry) {
    logMessage('Must select an adjacent cell.');
    return null;
  }

  return directionEntry[0];
}

async function submitOnlineSpell(spellKey, boardIndex, cellIndex, direction = null) {
  const match = app.onlineState.match;
  if (!match) return;

  app.actionPending = true;
  updateUI();

  try {
    await app.onlineClient.submitSpell(match.id, spellKey, boardIndex, cellIndex, direction);
    cancelSpell(true);
  } catch (error) {
    logMessage(error.message);
  } finally {
    app.actionPending = false;
    updateUI();
  }
}

function handleLocalSpellTarget(boardIndex, cellIndex) {
  const state = app.gameState;
  const spell = state.castingSpell;
  let result = null;

  if (spell === 'expelliarmus') result = castExpelliarmus(state, boardIndex, cellIndex);
  if (spell === 'patronus') result = castPatronus(state, boardIndex);
  if (spell === 'darkMark') result = castDarkMark(state, boardIndex, cellIndex);

  if (spell === 'avadaKedavra') {
    if (state.spellTargetStep === 0) {
      prepareAvadaPrimary(boardIndex, cellIndex);
      return;
    }

    const direction = getAvadaDirection(boardIndex, cellIndex);
    if (!direction) return;
    result = castAvadaKedavra(state, state._avadaTarget.board, state._avadaTarget.cell, direction);
  }

  if (!result) return;

  if (result.success) {
    animateSpellEffect(result.affectedCells, spell);
    cancelSpell(true);
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

async function handleOnlineSpellTarget(boardIndex, cellIndex) {
  const state = app.gameState;
  const spell = state.castingSpell;

  if (spell === 'expelliarmus') {
    await submitOnlineSpell(spell, boardIndex, cellIndex);
    return;
  }

  if (spell === 'patronus') {
    await submitOnlineSpell(spell, boardIndex);
    return;
  }

  if (spell === 'darkMark') {
    await submitOnlineSpell(spell, boardIndex, cellIndex);
    return;
  }

  if (spell === 'avadaKedavra') {
    if (state.spellTargetStep === 0) {
      prepareAvadaPrimary(boardIndex, cellIndex);
      return;
    }

    const direction = getAvadaDirection(boardIndex, cellIndex);
    if (!direction) return;

    await submitOnlineSpell(
      spell,
      state._avadaTarget.board,
      state._avadaTarget.cell,
      direction
    );
  }
}

function handleSpellTarget(boardIndex, cellIndex) {
  if (app.mode === 'online') {
    handleOnlineSpellTarget(boardIndex, cellIndex);
    return;
  }

  handleLocalSpellTarget(boardIndex, cellIndex);
}

function handleCellClick(event) {
  const cellEl = event.target.closest('.cell');
  if (!cellEl || !app.gameState) return;

  const boardIndex = Number(cellEl.dataset.board);
  const cellIndex = Number(cellEl.dataset.cell);

  if (app.gameState.castingSpell) {
    handleSpellTarget(boardIndex, cellIndex);
    return;
  }

  if (!canHumanAct()) return;

  if (app.mode === 'online') {
    handleOnlineMove(boardIndex, cellIndex);
  } else {
    handleLocalMove(boardIndex, cellIndex);
  }
}

function shouldAutoOpenOnlineMatch(previousState, nextState) {
  if (app.mode !== 'online') return false;
  if (!nextState.match || nextState.match.status !== 'active') return false;
  if (getCurrentScreenId() === 'screen-game') return true;

  return previousState?.queueStatus === 'searching' && nextState.queueStatus === 'matched';
}

function handleOnlineStateChange(nextState) {
  const previousState = app.onlineState;
  app.onlineState = nextState;

  if (shouldAutoOpenOnlineMatch(previousState, nextState)) {
    startOnlineGame(nextState.match);
  } else if (
    app.mode === 'online' &&
    getCurrentScreenId() === 'screen-game' &&
    nextState.match
  ) {
    startOnlineGame(nextState.match);
  }

  if (
    app.mode === 'online' &&
    nextState.match?.status === 'completed' &&
    nextState.match.ratingDelta &&
    getCurrentScreenId() === 'screen-game'
  ) {
    startOnlineGame(nextState.match);
  }

  updateOnlinePanels();
  updateMatchStatusBar();
}

async function claimDisconnectForfeit() {
  const match = app.onlineState.match;
  const opponentUid = getOpponentUid(match);
  if (!match || !opponentUid || match.status !== 'active') return;

  try {
    await app.onlineClient.resign(match.id, opponentUid);
  } catch (error) {
    logMessage(error.message);
  }
}

async function handleQueueJoin() {
  try {
    await app.onlineClient.joinRankedQueue();
  } catch {
    // Error is surfaced in the online panel.
  }
}

async function handleQueueLeave() {
  try {
    await app.onlineClient.leaveRankedQueue();
  } catch {
    // Error is surfaced in the online panel.
  }
}

async function handleUpgradeSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  try {
    await app.onlineClient.upgradeGuest({
      displayName: form.get('displayName')?.toString().trim(),
      email: form.get('email')?.toString().trim(),
      password: form.get('password')?.toString()
    });
    event.currentTarget.reset();
  } catch {
    // Error is surfaced in the online panel.
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  try {
    await app.onlineClient.signIn({
      email: form.get('email')?.toString().trim(),
      password: form.get('password')?.toString()
    });
    event.currentTarget.reset();
  } catch {
    // Error is surfaced in the online panel.
  }
}

function openOnlineLobby() {
  app.mode = 'online';
  showScreen('screen-online');
  updateOnlinePanels();
}

function openLeaderboardScreen() {
  app.previousScreenBeforeLeaderboard = getCurrentScreenId() || 'screen-title';
  renderLeaderboard();
  showScreen('screen-leaderboard');
}

async function leaveOnlineContextToTitle() {
  if (app.onlineState.queueStatus === 'searching') {
    try {
      await app.onlineClient.leaveRankedQueue();
    } catch {
      // Error is already visible in the online screen.
    }
  }

  if (app.mode === 'online' && app.onlineState.match?.status === 'completed') {
    await app.onlineClient.acknowledgeMatchComplete();
  }

  app.mode = null;
  clearDisconnectTimer();
  showScreen('screen-title');
}

async function handleRematchClick() {
  if (app.mode !== 'online') {
    startLocalGame();
    return;
  }

  await app.onlineClient.acknowledgeMatchComplete();
  openOnlineLobby();
}

function handleGameExitClick() {
  cancelSpell(true);

  if (app.mode === 'online') {
    showScreen('screen-online');
    updateOnlinePanels();
    return;
  }

  app.mode = null;
  clearDisconnectTimer();
  showScreen('screen-title');
}

function wireEventListeners() {
  el('btn-pvp').addEventListener('click', () => {
    app.mode = 'pvp';
    startLocalGame();
  });

  el('btn-ai').addEventListener('click', () => {
    app.mode = 'ai';
    showScreen('screen-setup');
  });

  el('btn-online').addEventListener('click', openOnlineLobby);
  el('btn-title-leaderboard').addEventListener('click', openLeaderboardScreen);
  el('btn-how-to-play').addEventListener('click', openRulesModal);
  el('close-rules').addEventListener('click', closeRulesModal);
  el('rules-modal').addEventListener('click', event => {
    if (event.target === el('rules-modal')) {
      closeRulesModal();
    }
  });

  document.querySelectorAll('.role-card').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.role-card').forEach(card => card.classList.remove('selected'));
      button.classList.add('selected');
    });
  });

  el('btn-start-game').addEventListener('click', () => {
    const roleButton = document.querySelector('.role-card.selected');
    app.humanPlayer = roleButton ? roleButton.dataset.role : HARRY;
    app.difficulty = el('difficulty').value;
    startLocalGame();
  });
  el('btn-setup-back').addEventListener('click', () => {
    app.mode = null;
    showScreen('screen-title');
  });

  el('ultimate-board').addEventListener('click', handleCellClick);

  document.querySelectorAll('.spell-btn').forEach(button => {
    button.addEventListener('click', () => handleSpellActivation(button.dataset.spell));
  });

  el('spell-cancel').addEventListener('click', () => cancelSpell());
  el('btn-game-exit').addEventListener('click', handleGameExitClick);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;

    if (el('rules-modal').classList.contains('active')) {
      closeRulesModal();
      return;
    }

    if (app.gameState?.castingSpell) {
      cancelSpell();
    }
  });

  el('btn-rematch').addEventListener('click', () => {
    handleRematchClick().catch(() => {});
  });
  el('btn-main-menu').addEventListener('click', () => {
    leaveOnlineContextToTitle().catch(() => {});
  });

  el('btn-online-main-menu').addEventListener('click', () => {
    leaveOnlineContextToTitle().catch(() => {});
  });
  el('btn-online-queue').addEventListener('click', () => {
    handleQueueJoin().catch(() => {});
  });
  el('btn-online-leave').addEventListener('click', () => {
    handleQueueLeave().catch(() => {});
  });
  el('btn-online-resume').addEventListener('click', () => {
    if (app.onlineState.match) {
      startOnlineGame(app.onlineState.match);
    }
  });
  el('btn-online-leaderboard').addEventListener('click', openLeaderboardScreen);
  el('btn-leaderboard-back').addEventListener('click', () => {
    showScreen(app.previousScreenBeforeLeaderboard || 'screen-title');
  });
  el('btn-online-signout').addEventListener('click', () => {
    app.onlineClient.signOutToGuest().catch(() => {});
  });
  el('btn-online-resign').addEventListener('click', () => {
    if (app.onlineState.match) {
      app.onlineClient.resign(app.onlineState.match.id).catch(() => {});
    }
  });
  el('btn-claim-forfeit').addEventListener('click', () => {
    claimDisconnectForfeit().catch(() => {});
  });

  el('form-upgrade').addEventListener('submit', handleUpgradeSubmit);
  el('form-login').addEventListener('submit', handleLoginSubmit);
}

export function initUI() {
  app.onlineClient = createOnlineClient(handleOnlineStateChange);
  app.onlineState = app.onlineClient.getState();
  wireEventListeners();
  updateOnlinePanels();
  renderLeaderboard();
  updateTitleActions();
  updateGameExitButton();
  resetPlayerHeader();
}
