import { requireUser } from './_lib/auth.js';
import { readJson, requirePost, sendJson } from './_lib/http.js';
import { createOrJoinRankedMatch, leaveRankedQueue } from './_lib/onlineStore.js';

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  try {
    const user = await requireUser(req);
    const body = await readJson(req);

    if (body.action === 'leave') {
      await leaveRankedQueue(user.uid);
      sendJson(res, 200, { status: 'left' });
      return;
    }

    const result = await createOrJoinRankedMatch(user.uid);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
}
