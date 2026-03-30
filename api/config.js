/**
 * Rota experimental (Node) — não faz parte do deploy HostGator.
 * Em produção use api/config.php e src/js/config.js (apiBaseUrl se precisar).
 */
import { loadData, parseBody, saveData, sendJson } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });

  try {
    const body = parseBody(req);
    const data = await loadData();
    if (body.webhookConfig) data.webhookConfig = body.webhookConfig;
    if (body.plannerConfig) data.plannerConfig = body.plannerConfig;
    const saved = await saveData(data);
    if (!saved) {
      return sendJson(res, 503, {
        ok: false,
        error: 'Persistência remota não configurada (este .js não é usado na HostGator).',
      });
    }
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error?.message || 'internal error' });
  }
}

