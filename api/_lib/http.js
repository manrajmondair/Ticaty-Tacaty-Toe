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
