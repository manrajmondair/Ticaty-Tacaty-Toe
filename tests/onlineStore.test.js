import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MATCH_CHAT_MAX_MESSAGES,
  MATCH_CHAT_MIN_INTERVAL_MS,
  STARTING_DUELING_RATING,
  buildLeaderboardEntry,
  calculateRatingDelta,
  createMatchRecord,
  createGuestName,
  deriveProfileAccessState,
  evaluateChatRateLimit,
  isLeaderboardEligible,
  slugifyDisplayName
} from '../api/_lib/onlineStore.js';

test('guest names are deterministic and readable', () => {
  assert.equal(createGuestName('abcdef123456'), 'Guest ABCDEF');
});

test('display names are normalized into leaderboard-safe slugs', () => {
  assert.equal(slugifyDisplayName('  Luna Lovegood!  '), 'luna-lovegood');
  assert.equal(slugifyDisplayName('Bellatrix___Lestrange'), 'bellatrix-lestrange');
});

test('elo-style deltas reward upsets and punish favorites', () => {
  const underdogWin = calculateRatingDelta(1000, 1200, 1);
  const favoriteLoss = calculateRatingDelta(1200, 1000, 0);

  assert.ok(underdogWin > 16);
  assert.ok(favoriteLoss < -16);
});

test('leaderboard entries expose only the public profile fields', () => {
  const entry = buildLeaderboardEntry({
    uid: 'wizard-1',
    displayName: 'Hermione',
    duelingRating: STARTING_DUELING_RATING,
    wins: 8,
    losses: 2,
    draws: 1,
    gamesPlayed: 11,
    bestStreak: 4,
    lastMatchDelta: 12,
    updatedAt: 1234,
    email: 'hidden@example.com'
  });

  assert.deepEqual(entry, {
    uid: 'wizard-1',
    displayName: 'Hermione',
    duelingRating: STARTING_DUELING_RATING,
    wins: 8,
    losses: 2,
    draws: 1,
    gamesPlayed: 11,
    bestStreak: 4,
    lastMatchDelta: 12,
    updatedAt: 1234
  });
});

test('match records include social state for chat and reactions', () => {
  const match = createMatchRecord(
    { uid: 'harry-user', displayName: 'Harry', isGuest: false },
    { uid: 'voldy-user', displayName: 'Voldemort', isGuest: true }
  );

  assert.equal(typeof match.id, 'string');
  assert.deepEqual(match.chat, {
    messages: {},
    latestReaction: null
  });
});

test('anonymous auth users stay off the public leaderboard', () => {
  const accessState = deriveProfileAccessState({
    firebase: {
      sign_in_provider: 'anonymous'
    }
  });

  assert.deepEqual(accessState, {
    authProvider: 'anonymous',
    isGuest: true,
    leaderboardEligible: false
  });
  assert.equal(isLeaderboardEligible(accessState), false);
});

test('evaluateChatRateLimit allows the first message from a sender', () => {
  assert.doesNotThrow(() => evaluateChatRateLimit({}, 'wizard-1', Date.now()));
});

test('evaluateChatRateLimit ignores messages from other senders', () => {
  const messages = {
    a: { uid: 'other', createdAt: Date.now() }
  };
  assert.doesNotThrow(() => evaluateChatRateLimit(messages, 'wizard-1', Date.now()));
});

test('evaluateChatRateLimit rejects messages within the min interval', () => {
  const now = Date.now();
  const messages = {
    a: { uid: 'wizard-1', createdAt: now - 100 }
  };
  assert.throws(() => evaluateChatRateLimit(messages, 'wizard-1', now), /Slow down/);
});

test('evaluateChatRateLimit allows messages after the interval has passed', () => {
  const now = Date.now();
  const messages = {
    a: { uid: 'wizard-1', createdAt: now - MATCH_CHAT_MIN_INTERVAL_MS - 50 }
  };
  assert.doesNotThrow(() => evaluateChatRateLimit(messages, 'wizard-1', now));
});

test('evaluateChatRateLimit rejects when the message cap is hit', () => {
  const messages = {};
  for (let i = 0; i < MATCH_CHAT_MAX_MESSAGES; i++) {
    messages[`m${i}`] = { uid: 'someone', createdAt: 0 };
  }
  assert.throws(() => evaluateChatRateLimit(messages, 'wizard-1', Date.now()), /chat history is full/);
});

test('password auth users are eligible for the public leaderboard', () => {
  const accessState = deriveProfileAccessState({
    firebase: {
      sign_in_provider: 'password'
    },
    email: 'wizard@example.com'
  });

  assert.deepEqual(accessState, {
    authProvider: 'password',
    isGuest: false,
    leaderboardEligible: true
  });
  assert.equal(isLeaderboardEligible(accessState), true);
});
