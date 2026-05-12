import { Router } from 'express';
import { requireUser, requireAdmin } from './middleware';
import type { Lifecycle } from '../lobby/lifecycle';
import { activeLobby } from '../lobby/registry';
import type { Repo } from '../db/repo';

export function makeRoutes(deps: { lc: Lifecycle; repo: Repo }) {
  const r = Router();

  r.get('/healthz', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  r.get('/lobby/active', requireUser, (_req, res) => {
    const l = activeLobby();
    if (!l) { res.json({ active: false }); return; }
    res.json({
      active: true,
      code: l.code,
      phase: l.phase,
      hostKey: l.hostKey,
      expiresAt: l.expiresAt,
      players: [...l.players.values()],
    });
  });

  r.post('/lobby/open', requireUser, requireAdmin, (req, res) => {
    try {
      const out = deps.lc.open({
        hostKey: req.userKey!,
        hostName: req.user!.displayName,
      });
      res.status(201).json(out);
    } catch (e: any) {
      res.status(e.code === 409 ? 409 : 500).json({ error: e.message });
    }
  });

  r.get('/match/:id', requireUser, async (req, res) => {
    const rows = await deps.repo.getRecentMatches(50);
    const m = rows.find(r => r.id === req.params.id);
    if (!m) { res.status(404).json({ error: 'not found' }); return; }
    res.json(m);
  });

  r.get('/match', requireUser, async (_req, res) => {
    res.json(await deps.repo.getRecentMatches(50));
  });

  return r;
}