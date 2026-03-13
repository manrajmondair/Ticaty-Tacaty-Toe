function parseBodyString(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  if (typeof body !== 'string') return {};

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

export async function readJson(req) {
  if (req.body) {
    return parseBodyString(req.body);
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  return parseBodyString(Buffer.concat(chunks).toString('utf8'));
}

function normalizeRequestParam(value) {
  if (Array.isArray(value)) {
    return value.find(entry => typeof entry === 'string' && entry.trim()) || null;
  }

  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return null;
}

function getRequestPathname(req) {
  try {
    return new URL(req.url, 'http://localhost').pathname;
  } catch {
    return req.url || '';
  }
}

export function getMatchId(req, body = {}) {
  const fromQuery = normalizeRequestParam(req.query?.id);
  if (fromQuery) return fromQuery;

  const fromBody = normalizeRequestParam(body.matchId);
  if (fromBody) return fromBody;

  const segments = getRequestPathname(req)
    .split('/')
    .filter(Boolean);
  const matchesIndex = segments.lastIndexOf('matches');

  if (matchesIndex >= 0 && segments.length > matchesIndex + 1) {
    return decodeURIComponent(segments[matchesIndex + 1]);
  }

  return null;
}

export function requireMatchId(req, body = {}) {
  const matchId = getMatchId(req, body);
  if (matchId) {
    return matchId;
  }

  const error = new Error('Missing match id.');
  error.statusCode = 400;
  throw error;
}

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function requirePost(req, res) {
  if (req.method === 'POST') return true;

  res.setHeader('Allow', 'POST');
  sendJson(res, 405, { error: 'Method not allowed.' });
  return false;
}
