import { Router } from 'express';
import type { Repo } from '../../db/repo';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function makeLevelsRouter(repo: Repo): Router {
  const r = Router();

  r.get('/sessions/:id/levels', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) { res.status(400).json({ error: 'invalid id' }); return; }
    const out = await repo.getSession(req.params.id);
    if (!out) { res.status(404).json({ error: 'not found' }); return; }
    res.json(out.levels);
  });

  r.put('/sessions/:id/levels/:n', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) { res.status(400).json({ error: 'invalid id' }); return; }
    const n = parseInt(req.params.n, 10);
    if (!Number.isInteger(n) || n < 1 || n > 10) { res.status(400).json({ error: 'n must be 1..10' }); return; }
    const body = req.body ?? {};
    if (body.reset === true) {
      const stds = await repo.getStandardLevels();
      const std = stds.find(s => s.level_no === n);
      if (std) {
        const out = await repo.upsertLevel(req.params.id, n, {
          prompt: std.prompt,
          promptIsDefault: true,
        });
        res.json(out);
        return;
      }
    }
    const out = await repo.upsertLevel(req.params.id, n, {
      prompt: body.prompt,
      promptIsDefault: body.promptIsDefault,
      answer: body.answer,
      notes: body.notes,
      done: body.done,
      clipboard: body.clipboard,
    });
    res.json(out);
  });

  return r;
}
