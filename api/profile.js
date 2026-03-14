import { requireUser } from './_lib/auth.js';
import { readJson, requirePost, sendJson } from './_lib/http.js';
import { updateProfile } from './_lib/onlineStore.js';

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const profile = await updateProfile(user.uid, body, user);
    sendJson(res, 200, { profile });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
}
