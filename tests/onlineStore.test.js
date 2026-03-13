import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STARTING_DUELING_RATING,
  buildLeaderboardEntry,
  calculateRatingDelta,
  createMatchRecord,
  createGuestName,
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
