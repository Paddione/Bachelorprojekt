import { Router } from 'express';

export function makeHealthRouter(): Router {
  const r = Router();
  r.get('/healthz', (_req, res) => {
    res.json({ ok: true, service: 'studio-server' });
  });
  return r;
}
