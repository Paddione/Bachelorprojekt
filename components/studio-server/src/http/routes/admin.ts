import { Router } from 'express';
import type { Repo } from '../../db/repo';

export function makeAdminRouter(repo: Repo): Router {
  const r = Router();

  r.get('/admin/levels', async (_req, res) => {
    const list = await repo.getStandardLevels();
    res.json(list);
  });

  r.put('/admin/levels', async (req, res) => {
    const body = req.body ?? {};
    if (!Array.isArray(body)) { res.status(400).json({ error: 'array required' }); return; }
    const out = await repo.setStandardLevels(body);
    res.json(out);
  });

  r.get('/admin/profile-fields', async (_req, res) => {
    const list = await repo.getStandardProfileFields();
    res.json(list);
  });

  r.put('/admin/profile-fields', async (req, res) => {
    const body = req.body ?? {};
    if (!Array.isArray(body)) { res.status(400).json({ error: 'array required' }); return; }
    const out = await repo.setStandardProfileFields(body);
    res.json(out);
  });

  return r;
}
