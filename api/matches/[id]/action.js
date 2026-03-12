import { requireUser } from '../../_lib/auth.js';
import { readJson, requirePost, sendJson } from '../../_lib/http.js';
import { submitMatchAction } from '../../_lib/onlineStore.js';

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const match = await submitMatchAction(req.query.id, user.uid, body);
    sendJson(res, 200, { match });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
}
