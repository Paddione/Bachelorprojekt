import { Router } from 'express';
import type { Repo } from '../../db/repo';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS = ['aktiv', 'pausiert', 'fertig'] as const;

export function makeSessionsRouter(repo: Repo): Router {
  const r = Router();

  r.get('/sessions', async (req, res) => {
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : undefined;
    const list = await repo.listSessions(clientId);
    res.json(list);
  });

  r.post('/sessions', async (req, res) => {
    const { clientId, title, lang, fromTemplate } = req.body ?? {};
    if (!clientId || !title) { res.status(400).json({ error: 'clientId + title required' }); return; }
    if (!UUID_RE.test(clientId)) { res.status(400).json({ error: 'invalid clientId' }); return; }
    const out = await repo.createSession({ clientId, title, lang: lang ?? 'Deutsch', fromTemplate });
    res.status(201).json(out);
  });

  r.get('/sessions/:id', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) { res.status(400).json({ error: 'invalid id' }); return; }
    const out = await repo.getSession(req.params.id);
    if (!out) { res.status(404).json({ error: 'not found' }); return; }
    res.json(out);
  });

  r.patch('/sessions/:id', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) { res.status(400).json({ error: 'invalid id' }); return; }
    const { status } = req.body ?? {};
    if (!STATUS.includes(status)) { res.status(400).json({ error: 'status must be aktiv/pausiert/fertig' }); return; }
    const row = await repo.updateSessionStatus(req.params.id, status);
    if (!row) { res.status(404).json({ error: 'not found' }); return; }
    res.json(row);
  });

  r.post('/sessions/:id/copy', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) { res.status(400).json({ error: 'invalid id' }); return; }
    const src = await repo.getSession(req.params.id);
    if (!src) { res.status(404).json({ error: 'not found' }); return; }
    const { title } = req.body ?? {};
    const out = await repo.createSession({
      clientId: src.session.client_id,
      title: title ?? `Vorlage · ${src.session.title}`,
      lang: src.session.lang,
      fromTemplate: src.session.id,
    });
    res.status(201).json(out);
  });

  return r;
}
