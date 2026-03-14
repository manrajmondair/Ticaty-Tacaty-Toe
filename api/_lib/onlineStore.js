import { randomUUID } from 'node:crypto';

import { DRAW, HARRY, VOLDEMORT } from '../../js/constants.js';
import { QUICK_REACTION_MAP } from '../../js/quickReactions.js';
import {
  ACTION_MOVE,
  ACTION_RESIGN,
  ACTION_SPELL,
  applyActionToState,
  getRoleLabel,
  hydrateState,
  replayHistory,
  serializeState
} from '../../js/engine.js';
import { createInitialState } from '../../js/gameState.js';
import { getAdminAuth, getAdminDb } from './firebaseAdmin.js';

export const STARTING_DUELING_RATING = 1000;
export const DUELING_K_FACTOR = 32;
export const DISCONNECT_GRACE_MS = 60_000;
export const MATCH_CHAT_MAX_LENGTH = 240;

function now() {
  return Date.now();
}

function db() {
  return getAdminDb();
}

export function createGuestName(uid) {
  return `Guest ${uid.slice(0, 6).toUpperCase()}`;
}

export function slugifyDisplayName(value = '') {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

function createBaseProfile(uid, overrides = {}) {
  const guestName = createGuestName(uid);

  return {
    uid,
    displayName: guestName,
    displayNameSlug: slugifyDisplayName(guestName),
    isGuest: true,
    leaderboardEligible: false,
    authProvider: 'anonymous',
    duelingRating: STARTING_DUELING_RATING,
    wins: 0,
    losses: 0,
    draws: 0,
    gamesPlayed: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastMatchDelta: 0,
    currentMatchId: null,
    lastSeenAt: now(),
    createdAt: now(),
    updatedAt: now(),
    ...overrides
  };
}

export function buildLeaderboardEntry(profile) {
  return {
    uid: profile.uid,
    displayName: profile.displayName,
    duelingRating: profile.duelingRating,
    wins: profile.wins,
    losses: profile.losses,
    draws: profile.draws,
    gamesPlayed: profile.gamesPlayed,
    bestStreak: profile.bestStreak,
    lastMatchDelta: profile.lastMatchDelta,
    updatedAt: profile.updatedAt
  };
}

export function deriveProfileAccessState(authUser = null) {
  const tokenProvider = authUser?.firebase?.sign_in_provider || authUser?.sign_in_provider || null;
  const providerIds = Array.isArray(authUser?.providerData)
    ? authUser.providerData.map(entry => entry?.providerId).filter(Boolean)
    : [];
  const resolvedProvider = tokenProvider ||
    providerIds.find(providerId => providerId !== 'anonymous') ||
    (authUser?.email ? 'password' : 'anonymous');
  const hasPermanentAccount = Boolean(resolvedProvider && resolvedProvider !== 'anonymous');

  return {
    authProvider: resolvedProvider || 'anonymous',
    isGuest: !hasPermanentAccount,
    leaderboardEligible: hasPermanentAccount
  };
}

export function isLeaderboardEligible(profile = {}) {
  return profile.isGuest === false && profile.leaderboardEligible === true;
}

export async function getProfile(uid) {
  const snapshot = await db().ref(`profiles/${uid}`).get();
  return snapshot.exists() ? snapshot.val() : null;
}

export async function ensureProfile(uid, overrides = {}) {
  const profileRef = db().ref(`profiles/${uid}`);
  const transaction = await profileRef.transaction(current => {
    if (current) {
      return {
        ...current,
        lastSeenAt: now(),
        updatedAt: now(),
        ...overrides
      };
    }
    return createBaseProfile(uid, overrides);
  });

  return transaction.snapshot.val();
}

function assignRoles(uidOne, uidTwo) {
  const harryUid = Math.random() < 0.5 ? uidOne : uidTwo;
  const voldemortUid = harryUid === uidOne ? uidTwo : uidOne;

  return {
    [uidOne]: harryUid === uidOne ? HARRY : VOLDEMORT,
    [uidTwo]: harryUid === uidTwo ? HARRY : VOLDEMORT,
    [HARRY]: harryUid,
    [VOLDEMORT]: voldemortUid
  };
}

export function createMatchRecord(playerOne, playerTwo) {
  const id = randomUUID();
  const assignedRoles = assignRoles(playerOne.uid, playerTwo.uid);
  const createdAt = now();
  const initialState = serializeState(createInitialState());

  return {
    id,
    players: {
      [playerOne.uid]: {
        uid: playerOne.uid,
        displayName: playerOne.displayName,
        isGuest: playerOne.isGuest,
        role: assignedRoles[playerOne.uid]
      },
      [playerTwo.uid]: {
        uid: playerTwo.uid,
        displayName: playerTwo.displayName,
        isGuest: playerTwo.isGuest,
        role: assignedRoles[playerTwo.uid]
      }
    },
    assignedRoles,
    stateSnapshot: initialState,
    moveHistory: [],
    chat: {
      messages: {},
      latestReaction: null
    },
    status: 'active',
    winner: null,
    winnerUid: null,
    ratingDelta: null,
    ratingProcessed: false,
    ratingLock: false,
    createdAt,
    updatedAt: createdAt,
    lastActionAt: createdAt
  };
}

async function readProfilesForMatch(match) {
  const playerIds = Object.keys(match.players || {});
  const snapshots = await Promise.all(playerIds.map(uid => db().ref(`profiles/${uid}`).get()));

  return playerIds.reduce((acc, uid, index) => {
    acc[uid] = snapshots[index].val();
    return acc;
  }, {});
}

function calculateExpectedScore(playerRating, opponentRating) {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
}

export function calculateRatingDelta(playerRating, opponentRating, actualScore) {
  const expectedScore = calculateExpectedScore(playerRating, opponentRating);
  return Math.round(DUELING_K_FACTOR * (actualScore - expectedScore));
}

function resolveScores(match) {
  const playerIds = Object.keys(match.players);
  const [uidOne, uidTwo] = playerIds;

  if (match.winnerUid === uidOne) {
    return {
      [uidOne]: 1,
      [uidTwo]: 0
    };
  }

  if (match.winnerUid === uidTwo) {
    return {
      [uidOne]: 0,
      [uidTwo]: 1
    };
  }

  return {
    [uidOne]: 0.5,
    [uidTwo]: 0.5
  };
}

function createNextProfile(profile, score, delta, matchId) {
  const next = {
    ...profile,
    duelingRating: Math.max(100, profile.duelingRating + delta),
    gamesPlayed: profile.gamesPlayed + 1,
    lastMatchDelta: delta,
    currentMatchId: null,
    updatedAt: now(),
    lastSeenAt: now(),
    lastCompletedMatchId: matchId
  };

  if (score === 1) {
    next.wins += 1;
    next.currentStreak = Math.max(1, next.currentStreak + 1);
    next.bestStreak = Math.max(next.bestStreak, next.currentStreak);
  } else if (score === 0) {
    next.losses += 1;
    next.currentStreak = 0;
  } else {
    next.draws += 1;
    next.currentStreak = 0;
  }

  return next;
}

function rootUpdateForLeaderboard(updates, profile) {
  if (!isLeaderboardEligible(profile)) {
    updates[`leaderboard/${profile.uid}`] = null;
    return;
  }

  updates[`leaderboard/${profile.uid}`] = buildLeaderboardEntry(profile);
}

export async function finalizeMatch(matchId) {
  const matchRef = db().ref(`matches/${matchId}`);
  const processedSnapshot = await matchRef.child('ratingProcessed').get();
  if (processedSnapshot.val() === true) {
    const snapshot = await matchRef.get();
    return snapshot.val();
  }

  const gate = await matchRef.child('ratingLock').transaction(current => {
    if (current) return;
    return true;
  });

  if (!gate.committed) {
    const snapshot = await matchRef.get();
    return snapshot.val();
  }

  const matchSnapshot = await matchRef.get();
  const match = matchSnapshot.val();
  if (!match) {
    throw new Error('Match not found during finalize.');
  }

  const profiles = await readProfilesForMatch(match);
  const playerIds = Object.keys(match.players);
  const [uidOne, uidTwo] = playerIds;
  const scores = resolveScores(match);

  const deltaOne = calculateRatingDelta(
    profiles[uidOne].duelingRating,
    profiles[uidTwo].duelingRating,
    scores[uidOne]
  );
  const deltaTwo = calculateRatingDelta(
    profiles[uidTwo].duelingRating,
    profiles[uidOne].duelingRating,
    scores[uidTwo]
  );

  const nextProfileOne = createNextProfile(profiles[uidOne], scores[uidOne], deltaOne, matchId);
  const nextProfileTwo = createNextProfile(profiles[uidTwo], scores[uidTwo], deltaTwo, matchId);
  const completedAt = now();

  const updates = {
    [`matches/${matchId}/ratingDelta`]: {
      [uidOne]: deltaOne,
      [uidTwo]: deltaTwo
    },
    [`matches/${matchId}/winnerUid`]: match.winnerUid ?? null,
    [`matches/${matchId}/completedAt`]: completedAt,
    [`matches/${matchId}/ratingProcessed`]: true,
    [`profiles/${uidOne}`]: nextProfileOne,
    [`profiles/${uidTwo}`]: nextProfileTwo
  };

  rootUpdateForLeaderboard(updates, nextProfileOne);
  rootUpdateForLeaderboard(updates, nextProfileTwo);

  await db().ref().update(updates);

  const updatedMatchSnapshot = await matchRef.get();
  return updatedMatchSnapshot.val();
}

export async function createOrJoinRankedMatch(uid) {
  const queueRef = db().ref('queue/ranked');
  const profile = await ensureProfile(uid);

  if (profile.currentMatchId) {
    const currentMatch = await db().ref(`matches/${profile.currentMatchId}`).get();
    if (currentMatch.exists() && currentMatch.val().status === 'active') {
      return {
        status: 'matched',
        matchId: profile.currentMatchId,
        match: currentMatch.val(),
        profile
      };
    }

    await db().ref(`profiles/${uid}/currentMatchId`).remove();
  }

  let opponentUid = null;
  const joinedAt = now();

  const transaction = await queueRef.transaction(current => {
    const queue = current && typeof current === 'object' ? { ...current } : {};
    delete queue[uid];

    const candidates = Object.entries(queue)
      .filter(([, entry]) => entry && entry.status === 'waiting')
      .sort((a, b) => (a[1].queuedAt || 0) - (b[1].queuedAt || 0));

    if (!candidates.length) {
      queue[uid] = {
        uid,
        status: 'waiting',
        queuedAt: joinedAt
      };
      return queue;
    }

    opponentUid = candidates[0][0];
    delete queue[opponentUid];
    return queue;
  });

  if (!transaction.committed) {
    throw new Error('Could not update ranked queue.');
  }

  if (!opponentUid) {
    return {
      status: 'queued',
      profile
    };
  }

  const opponentProfile = await ensureProfile(opponentUid);
  const match = createMatchRecord(profile, opponentProfile);

  await db().ref().update({
    [`matches/${match.id}`]: match,
    [`profiles/${uid}/currentMatchId`]: match.id,
    [`profiles/${opponentUid}/currentMatchId`]: match.id
  });

  return {
    status: 'matched',
    matchId: match.id,
    match,
    profile
  };
}

export async function leaveRankedQueue(uid) {
  await db().ref(`queue/ranked/${uid}`).remove();
}

export async function getMatch(matchId) {
  const snapshot = await db().ref(`matches/${matchId}`).get();
  return snapshot.exists() ? snapshot.val() : null;
}

export function validateMatchParticipant(match, uid) {
  if (!match) {
    const error = new Error('Match not found.');
    error.statusCode = 404;
    throw error;
  }

  if (!match.players || !match.players[uid]) {
    const error = new Error('You are not part of this match.');
    error.statusCode = 403;
    throw error;
  }
}

function requireActiveMatch(match) {
  if (match.status === 'active') {
    return;
  }

  const error = new Error('This match has already ended.');
  error.statusCode = 400;
  throw error;
}

function determineWinnerUid(match, winnerRole) {
  if (!winnerRole || winnerRole === DRAW) return null;
  return match.assignedRoles?.[winnerRole] || null;
}

export async function submitMatchAction(matchId, uid, actionInput) {
  const matchRef = db().ref(`matches/${matchId}`);
  const action = normalizeAction(actionInput);
  let rejectionMessage = 'Could not apply that action.';
  let committedMatch = null;
  let sawExistingMatch = false;

  const transaction = await matchRef.transaction(current => {
    if (!current) {
      return current;
    }

    sawExistingMatch = true;

    if (!current.players || !current.players[uid]) {
      rejectionMessage = 'You are not part of this match.';
      return;
    }

    if (current.status !== 'active') {
      rejectionMessage = 'This match has already ended.';
      return current;
    }

    let liveState;
    try {
      liveState = replayHistory(current.moveHistory || []);
    } catch {
      liveState = hydrateState(current.stateSnapshot);
    }

    const actorRole = current.players[uid].role;
    if (liveState.currentPlayer !== actorRole) {
      rejectionMessage = 'It is not your turn.';
      return;
    }

    const nextState = hydrateState(serializeState(liveState));
    const result = applyActionToState(nextState, action);
    if (!result.success) {
      rejectionMessage = result.message;
      return;
    }

    const actionRecord = {
      ...action,
      actorUid: uid,
      actorRole,
      createdAt: now()
    };

    const nextMatch = {
      ...current,
      stateSnapshot: serializeState(nextState),
      moveHistory: [...(current.moveHistory || []), actionRecord],
      updatedAt: now(),
      lastActionAt: now()
    };

    if (nextState.gameOver) {
      nextMatch.status = 'completed';
      nextMatch.winner = nextState.winner;
      nextMatch.winnerUid = determineWinnerUid(current, nextState.winner);
    }

    committedMatch = nextMatch;
    return nextMatch;
  });

  if (!sawExistingMatch) {
    const error = new Error('Match not found.');
    error.statusCode = 404;
    throw error;
  }

  if (!transaction.committed || !committedMatch) {
    const error = new Error(rejectionMessage);
    error.statusCode = 400;
    throw error;
  }

  if (committedMatch.status === 'completed') {
    committedMatch = await finalizeMatch(matchId);
  }

  return committedMatch;
}

export async function resignMatch(matchId, requesterUid, options = {}) {
  const matchRef = db().ref(`matches/${matchId}`);
  const forfeitingUid = options.forfeitingUid || requesterUid;
  let rejectionMessage = 'Could not concede this match.';
  let committedMatch = null;
  let sawExistingMatch = false;

  if (forfeitingUid !== requesterUid) {
    const presenceSnapshot = await db().ref(`presence/${forfeitingUid}`).get();
    const presence = presenceSnapshot.val();
    const tooSoon = !presence || presence.connected !== false ||
      (presence.lastSeenAt || 0) > now() - DISCONNECT_GRACE_MS;

    if (tooSoon) {
      const error = new Error('The opponent disconnect timer has not expired yet.');
      error.statusCode = 400;
      throw error;
    }
  }

  const transaction = await matchRef.transaction(current => {
    if (!current) {
      return current;
    }

    sawExistingMatch = true;

    if (!current.players || !current.players[requesterUid]) {
      rejectionMessage = 'You are not part of this match.';
      return;
    }

    if (!current.players[forfeitingUid]) {
      rejectionMessage = 'Invalid forfeiting player.';
      return;
    }

    if (current.status !== 'active') {
      rejectionMessage = 'This match has already ended.';
      return current;
    }

    const winnerUid = Object.keys(current.players).find(uid => uid !== forfeitingUid) || null;
    const winnerRole = winnerUid ? current.players[winnerUid].role : DRAW;

    committedMatch = {
      ...current,
      status: 'completed',
      winner: winnerRole,
      winnerUid,
      updatedAt: now(),
      completedAt: now(),
      moveHistory: [
        ...(current.moveHistory || []),
        {
          type: ACTION_RESIGN,
          actorUid: requesterUid,
          actorRole: current.players[requesterUid].role,
          forfeitingUid,
          createdAt: now()
        }
      ]
    };

    return committedMatch;
  });

  if (!sawExistingMatch) {
    const error = new Error('Match not found.');
    error.statusCode = 404;
    throw error;
  }

  if (!transaction.committed || !committedMatch) {
    const error = new Error(rejectionMessage);
    error.statusCode = 400;
    throw error;
  }

  return finalizeMatch(matchId);
}

function createChatMessage(match, uid, text) {
  return {
    id: randomUUID(),
    type: 'message',
    uid,
    displayName: match.players[uid].displayName,
    text,
    createdAt: now()
  };
}

function createReactionMessage(match, uid, reactionKey) {
  const label = QUICK_REACTION_MAP[reactionKey];
  if (!label) {
    const error = new Error('Unknown quick reaction.');
    error.statusCode = 400;
    throw error;
  }

  return {
    id: randomUUID(),
    type: 'reaction',
    uid,
    displayName: match.players[uid].displayName,
    reactionKey,
    label,
    createdAt: now()
  };
}

function normalizeChatMessageText(input) {
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text) {
    const error = new Error('Message cannot be empty.');
    error.statusCode = 400;
    throw error;
  }

  if (text.length > MATCH_CHAT_MAX_LENGTH) {
    const error = new Error(`Messages must be ${MATCH_CHAT_MAX_LENGTH} characters or fewer.`);
    error.statusCode = 400;
    throw error;
  }

  return text;
}

export async function appendMatchChatMessage(matchId, uid, messageInput) {
  const match = await getMatch(matchId);
  validateMatchParticipant(match, uid);
  requireActiveMatch(match);

  const message = createChatMessage(match, uid, normalizeChatMessageText(messageInput));

  await db().ref().update({
    [`matches/${matchId}/chat/messages/${message.id}`]: message,
    [`matches/${matchId}/updatedAt`]: now()
  });

  return getMatch(matchId);
}

export async function sendMatchReaction(matchId, uid, reactionKey) {
  const match = await getMatch(matchId);
  validateMatchParticipant(match, uid);
  requireActiveMatch(match);

  const reaction = createReactionMessage(match, uid, reactionKey);

  await db().ref().update({
    [`matches/${matchId}/chat/messages/${reaction.id}`]: reaction,
    [`matches/${matchId}/chat/latestReaction`]: reaction,
    [`matches/${matchId}/updatedAt`]: now()
  });

  return getMatch(matchId);
}

export async function updateProfile(uid, payload = {}, authUser = null) {
  const profile = await ensureProfile(uid);
  const displayName = typeof payload.displayName === 'string' ? payload.displayName.trim() : '';
  const updates = {};
  let nextProfile = {
    ...profile,
    ...deriveProfileAccessState(authUser),
    lastSeenAt: now(),
    updatedAt: now()
  };

  if (displayName) {
    if (displayName.length < 3 || displayName.length > 24) {
      const error = new Error('Display name must be between 3 and 24 characters.');
      error.statusCode = 400;
      throw error;
    }

    const slug = slugifyDisplayName(displayName);
    if (!slug) {
      const error = new Error('Display name must include letters or numbers.');
      error.statusCode = 400;
      throw error;
    }

    const slugRef = db().ref(`usernames/${slug}`);
    const slugTransaction = await slugRef.transaction(current => {
      if (!current || current === uid) return uid;
      return;
    });

    if (!slugTransaction.committed) {
      const error = new Error('That display name is already taken.');
      error.statusCode = 409;
      throw error;
    }

    if (profile.displayNameSlug && profile.displayNameSlug !== slug) {
      updates[`usernames/${profile.displayNameSlug}`] = null;
    }

    nextProfile = {
      ...nextProfile,
      displayName,
      displayNameSlug: slug
    };
  }

  if (!authUser && typeof payload.isGuest === 'boolean') {
    nextProfile.isGuest = payload.isGuest;
  }

  updates[`profiles/${uid}`] = nextProfile;
  rootUpdateForLeaderboard(updates, nextProfile);

  await db().ref().update(updates);

  return nextProfile;
}

export async function repairLeaderboardIntegrity() {
  const auth = getAdminAuth();
  const profilesSnapshot = await db().ref('profiles').get();
  const profiles = profilesSnapshot.val() || {};
  const updates = {};

  for (const [uid, profile] of Object.entries(profiles)) {
    const isProbeAccount = uid.startsWith('probe-') || /^Probe\b/.test(profile.displayName || '');
    if (isProbeAccount) {
      updates[`profiles/${uid}`] = null;
      updates[`leaderboard/${uid}`] = null;

      if (profile.displayNameSlug) {
        updates[`usernames/${profile.displayNameSlug}`] = null;
      }

      continue;
    }

    let authState;
    try {
      const userRecord = await auth.getUser(uid);
      authState = deriveProfileAccessState(userRecord);
    } catch {
      authState = deriveProfileAccessState(null);
    }

    const nextProfile = {
      ...profile,
      ...authState,
      updatedAt: now()
    };

    updates[`profiles/${uid}`] = nextProfile;
    rootUpdateForLeaderboard(updates, nextProfile);
  }

  await db().ref().update(updates);
  return updates;
}

export function normalizeAction(input = {}) {
  if (input.type === ACTION_MOVE) {
    return {
      type: ACTION_MOVE,
      board: Number(input.board),
      cell: Number(input.cell)
    };
  }

  if (input.type === ACTION_SPELL) {
    return {
      type: ACTION_SPELL,
      spellKey: input.spellKey,
      board: Number.isInteger(input.board) ? input.board : Number(input.board),
      cell: input.cell === undefined ? undefined : Number(input.cell),
      direction: input.direction ?? null
    };
  }

  if (input.type === ACTION_RESIGN) {
    return {
      type: ACTION_RESIGN
    };
  }

  return input;
}

export function createMatchLogEntry(action) {
  if (action.type === ACTION_MOVE) {
    return `${getRoleLabel(action.actorRole)} placed on board ${action.board + 1}, cell ${action.cell + 1}.`;
  }

  if (action.type === ACTION_SPELL) {
    return `${getRoleLabel(action.actorRole)} cast ${action.spellKey}.`;
  }

  if (action.type === ACTION_RESIGN) {
    return `${getRoleLabel(action.actorRole)} conceded the duel.`;
  }

  return 'A new action was recorded.';
}
