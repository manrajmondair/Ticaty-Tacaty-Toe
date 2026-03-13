import { requireUser } from '../../_lib/auth.js';
import { readJson, requireMatchId, requirePost, sendJson } from '../../_lib/http.js';
import { appendMatchChatMessage, sendMatchReaction } from '../../_lib/onlineStore.js';

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const matchId = requireMatchId(req, body);

    let match;
    if (body.reactionKey) {
      match = await sendMatchReaction(matchId, user.uid, body.reactionKey);
    } else {
      match = await appendMatchChatMessage(matchId, user.uid, body.message);
    }

    sendJson(res, 200, { match });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
}
