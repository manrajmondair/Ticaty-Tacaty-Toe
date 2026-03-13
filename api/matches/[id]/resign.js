import { requireUser } from '../../_lib/auth.js';
import { readJson, requireMatchId, requirePost, sendJson } from '../../_lib/http.js';
import { resignMatch } from '../../_lib/onlineStore.js';

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const matchId = requireMatchId(req, body);
    const match = await resignMatch(matchId, user.uid, {
      forfeitingUid: body.forfeitingUid
    });
    sendJson(res, 200, { match });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
}
