import { Router } from 'express';
import type { Repo } from '../../db/repo';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function makeClientsRouter(repo: Repo): Router {
  const r = Router();

  r.get('/clients', async (_req, res) => {
    const list = await repo.listClients();
    res.json(list);
  });

  r.post('/clients', async (req, res) => {
    const { name, initials, since, lang, category } = req.body ?? {};
    if (!name || !initials) { res.status(400).json({ error: 'name + initials required' }); return; }
    const row = await repo.createClient({
      name, initials,
      since: since ?? String(new Date().getFullYear()),
      lang: lang ?? 'Deutsch',
      category: category ?? 'Orientierung',
    });
    res.status(201).json(row);
  });

  r.get('/clients/:id', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) { res.status(400).json({ error: 'invalid id' }); return; }
    const row = await repo.getClient(req.params.id);
    if (!row) { res.status(404).json({ error: 'not found' }); return; }
    res.json(row);
  });

  r.put('/clients/:id', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) { res.status(400).json({ error: 'invalid id' }); return; }
    const row = await repo.updateClient(req.params.id, req.body ?? {});
    if (!row) { res.status(404).json({ error: 'not found' }); return; }
    res.json(row);
  });

  r.get('/clients/:id/profile', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) { res.status(400).json({ error: 'invalid id' }); return; }
    const fields = await repo.getProfile(req.params.id);
    if (!fields) {
      const stds = await repo.getStandardProfileFields();
      res.json({ fields: stds.map(s => ({ key: s.key, label: s.label, value: s.value, type: s.type, required: s.required, active: s.active })) });
      return;
    }
    res.json({ fields });
  });

  r.put('/clients/:id/profile', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) { res.status(400).json({ error: 'invalid id' }); return; }
    const { fields } = req.body ?? {};
    if (!Array.isArray(fields)) { res.status(400).json({ error: 'fields[] required' }); return; }
    const saved = await repo.upsertProfile(req.params.id, fields);
    res.json({ fields: saved });
  });

  return r;
}
