import assert from 'node:assert/strict';
import test from 'node:test';

import { getMatchId } from '../api/_lib/http.js';

test('getMatchId prefers explicit query params', () => {
  const matchId = getMatchId({
    query: { id: 'query-match-id' },
    url: '/api/matches/path-match-id/action'
  }, {
    matchId: 'body-match-id'
  });

  assert.equal(matchId, 'query-match-id');
});

test('getMatchId falls back to request body when query params are missing', () => {
  const matchId = getMatchId({
    query: {},
    url: '/api/matches/path-match-id/action'
  }, {
    matchId: 'body-match-id'
  });

  assert.equal(matchId, 'body-match-id');
});

test('getMatchId parses the match id from nested match routes', () => {
  const matchId = getMatchId({
    query: {},
    url: '/api/matches/8bfc9b6d-8d77-4c31-a7ea-3a3f5d278f11/action'
  }, {});

  assert.equal(matchId, '8bfc9b6d-8d77-4c31-a7ea-3a3f5d278f11');
});
