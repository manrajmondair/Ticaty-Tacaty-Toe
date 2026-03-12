import { getAdminAuth } from './firebaseAdmin.js';

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return null;
  }
  return header.slice('Bearer '.length).trim();
}

export async function requireUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    const error = new Error('Missing Firebase ID token.');
    error.statusCode = 401;
    throw error;
  }

  try {
    return await getAdminAuth().verifyIdToken(token);
  } catch {
    const error = new Error('Invalid Firebase ID token.');
    error.statusCode = 401;
    throw error;
  }
}
