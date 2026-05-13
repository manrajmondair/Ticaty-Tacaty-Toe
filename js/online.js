import { ACTION_MOVE, ACTION_SPELL } from './engine.js';
import {
  clearPresence,
  disposePresence,
  ensureSignedInGuest,
  getIdToken,
  isFirebaseEnabled,
  linkGuestAccount,
  publishPresence,
  signInExistingAccount,
  signOutCurrentUser,
  subscribeToAuth,
  subscribeToConnection,
  subscribeToLeaderboard,
  subscribeToMatch,
  subscribeToPresence,
  subscribeToProfile,
  subscribeToQueue
} from './firebaseClient.js';

const AUTHED_POST_TIMEOUT_MS = 12_000;

async function authedPost(path, body = {}, options = {}) {
  return executeAuthedPost(path, body, options, false);
}

async function executeAuthedPost(path, body, options, forceRefresh) {
  const token = await getIdToken(forceRefresh);
  if (!token) {
    throw new Error('Missing Firebase session.');
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? AUTHED_POST_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('The server did not respond. Check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  // 401 usually means the cached ID token expired or was rotated; one retry
  // with a forced refresh recovers transparently. Anything else is real.
  if (response.status === 401 && !forceRefresh) {
    return executeAuthedPost(path, body, options, true);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed.');
  }

  return payload;
}

function createInitialOnlineState() {
  return {
    available: isFirebaseEnabled(),
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
    loadingText: '',
    upgrading: false
  };
}

export function createOnlineClient(onChange) {
  const state = createInitialOnlineState();
  const unsubscribers = [];
  const scopedUnsubscribers = {
    profile: null,
    queue: null,
    match: null,
    presence: null
  };
  // Remember which deleted match ids we've already asked the server to clear.
  // Without this, every onValue(null) tick would fire a fresh authedPost.
  const staleMatchIdsAttempted = new Set();

  function emit() {
    onChange({
      ...state
    });
  }

  async function clearStaleMatchPointer(matchId) {
    if (!matchId || staleMatchIdsAttempted.has(matchId)) return;
    staleMatchIdsAttempted.add(matchId);
    try {
      const payload = await authedPost('/api/profile', { clearCurrentMatchId: true });
      state.profile = payload.profile;
      emit();
    } catch {
      // Best-effort; the next queue attempt will run the same cleanup path.
    }
  }

  function resetScopedSubscription(key) {
    if (scopedUnsubscribers[key]) {
      scopedUnsubscribers[key]();
      scopedUnsubscribers[key] = null;
    }
  }

  function setError(message) {
    state.error = message;
    emit();
  }

  async function refreshPresence() {
    if (!state.user) return;
    try {
      await publishPresence(state.user.uid, state.profile?.currentMatchId || null);
    } catch {
      // Presence is best-effort for the free-tier multiplayer flow.
    }
  }

  function watchProfile(uid) {
    resetScopedSubscription('profile');
    resetScopedSubscription('queue');

    scopedUnsubscribers.profile = subscribeToProfile(uid, profile => {
      state.profile = profile;
      if (profile?.currentMatchId) {
        state.queueStatus = 'matched';
        watchMatch(profile.currentMatchId);
      } else if (!state.match || state.match.status !== 'completed') {
        if (!state.match) {
          resetScopedSubscription('match');
          resetScopedSubscription('presence');
          state.opponentPresence = null;
        }
        state.queueStatus = state.queueEntry ? 'searching' : 'idle';
      }
      refreshPresence();
      emit();
    });

    scopedUnsubscribers.queue = subscribeToQueue(uid, queueEntry => {
      state.queueEntry = queueEntry;
      if (!state.profile?.currentMatchId) {
        state.queueStatus = queueEntry ? 'searching' : 'idle';
      }
      emit();
    });
  }

  function watchMatch(matchId) {
    resetScopedSubscription('match');
    resetScopedSubscription('presence');

    scopedUnsubscribers.match = subscribeToMatch(matchId, match => {
      state.match = match;
      if (!match) {
        state.queueStatus = 'idle';
        state.opponentPresence = null;
        resetScopedSubscription('presence');
        // Profile still points at a match the server has thrown away. Ask
        // the server to clear currentMatchId so the user isn't stuck waiting
        // for the next queue attempt to unstick them.
        if (state.profile?.currentMatchId === matchId) {
          clearStaleMatchPointer(matchId);
        }
        emit();
        return;
      }

      const opponentUid = Object.keys(match.players || {}).find(uid => uid !== state.user?.uid) || null;
      if (opponentUid) {
        resetScopedSubscription('presence');
        scopedUnsubscribers.presence = subscribeToPresence(opponentUid, presence => {
          state.opponentPresence = presence;
          emit();
        });
      }

      emit();
    });
  }

  async function ensureProfileExists() {
    const payload = await authedPost('/api/profile', {});
    state.profile = payload.profile;
    await refreshPresence();
    emit();
  }

  async function bootstrap() {
    if (!state.available) {
      state.authReady = true;
      emit();
      return;
    }

    unsubscribers.push(subscribeToConnection(isConnected => {
      state.connected = isConnected;
      emit();
    }));

    unsubscribers.push(subscribeToLeaderboard(rows => {
      state.leaderboard = rows;
      emit();
    }));

    const authUnsubscribe = subscribeToAuth(async user => {
      state.user = user;
      state.error = '';

      if (!user) {
        try {
          await ensureSignedInGuest();
          return;
        } catch (error) {
          state.authReady = true;
          setError(error.message);
          return;
        }
      }

      state.authReady = true;
      watchProfile(user.uid);

      try {
        await ensureProfileExists();
      } catch (error) {
        setError(error.message);
      }
    });

    unsubscribers.push(authUnsubscribe);
    emit();
  }

  async function joinRankedQueue() {
    state.loadingText = 'Searching for another witch or wizard...';
    state.error = '';
    emit();

    try {
      const payload = await authedPost('/api/matchmake', {});
      state.queueStatus = payload.status === 'matched' ? 'matched' : 'searching';
      state.loadingText = '';
      emit();
      return payload;
    } catch (error) {
      state.loadingText = '';
      setError(error.message);
      throw error;
    }
  }

  async function leaveRankedQueue() {
    try {
      await authedPost('/api/matchmake', { action: 'leave' });
      state.queueStatus = 'idle';
      emit();
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  async function submitAction(matchId, action) {
    state.error = '';
    emit();

    try {
      await authedPost(`/api/matches/${matchId}/action`, {
        ...action,
        matchId
      });
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  async function resign(matchId, forfeitingUid = null) {
    try {
      await authedPost(`/api/matches/${matchId}/resign`, {
        matchId,
        forfeitingUid
      });
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  async function sendChatMessage(matchId, message) {
    state.error = '';
    emit();

    try {
      await authedPost(`/api/matches/${matchId}/chat`, {
        matchId,
        message
      });
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  async function sendQuickReaction(matchId, reactionKey) {
    state.error = '';
    emit();

    try {
      await authedPost(`/api/matches/${matchId}/chat`, {
        matchId,
        reactionKey
      });
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  async function updateProfile(payload) {
    try {
      const response = await authedPost('/api/profile', payload);
      state.profile = response.profile;
      emit();
      return response.profile;
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  async function upgradeGuest(payload) {
    state.upgrading = true;
    state.error = '';
    emit();

    try {
      await linkGuestAccount(payload.email, payload.password);
      await updateProfile({
        displayName: payload.displayName,
        isGuest: false
      });
    } catch (error) {
      setError(error.message);
      throw error;
    } finally {
      state.upgrading = false;
      emit();
    }
  }

  async function signIn(payload) {
    state.error = '';
    emit();

    try {
      await signInExistingAccount(payload.email, payload.password);
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  async function signOutToGuest() {
    try {
      await signOutCurrentUser();
      await ensureSignedInGuest();
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  async function acknowledgeMatchComplete() {
    if (!state.user) return;
    await clearPresence(null);
    state.match = null;
    state.queueStatus = state.queueEntry ? 'searching' : 'idle';
    resetScopedSubscription('match');
    resetScopedSubscription('presence');
    state.opponentPresence = null;
    emit();
  }

  async function destroy() {
    resetScopedSubscription('profile');
    resetScopedSubscription('queue');
    resetScopedSubscription('match');
    resetScopedSubscription('presence');
    unsubscribers.forEach(unsubscribe => unsubscribe());
    await disposePresence();
  }

  bootstrap();

  return {
    getState: () => ({ ...state }),
    joinRankedQueue,
    leaveRankedQueue,
    submitMove(matchId, board, cell) {
      return submitAction(matchId, {
        type: ACTION_MOVE,
        board,
        cell
      });
    },
    submitSpell(matchId, spellKey, board, cell, direction) {
      return submitAction(matchId, {
        type: ACTION_SPELL,
        spellKey,
        board,
        cell,
        direction
      });
    },
    sendChatMessage,
    sendQuickReaction,
    resign,
    updateProfile,
    upgradeGuest,
    signIn,
    signOutToGuest,
    acknowledgeMatchComplete,
    destroy
  };
}
