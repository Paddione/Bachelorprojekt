// brett/src/server/routes/presets.ts
// Preset-CRUD (GET/POST/DELETE /presets).

import { Router } from 'express';
import { randomUUID } from 'crypto';
import * as presets from '../presets';

export const presetsRouter = Router();

function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
}

presetsRouter.get('/presets', (_req, res) => {
  res.json(presets.loadPresets());
});

presetsRouter.post('/presets', asyncHandler(async (req: any, res: any) => {
  const { name, appearance } = req.body || {};
  if (!name || typeof name !== 'string' || name.length > 100) {
    return res.status(400).json({ error: 'name required (≤100 chars)' });
  }
  const err = presets.validateAppearance(appearance);
  if (err) return res.status(400).json({ error: err });
  const preset = {
    id: randomUUID(),
    name,
    appearance,
    createdAt: new Date().toISOString(),
  };
  const list = presets.loadPresets();
  list.push(preset);
  presets.savePresets(list);
  res.status(201).json(preset);
}));

presetsRouter.delete('/presets/:id', (req, res) => {
  const list = presets.loadPresets();
  const idx = list.findIndex(p => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'not found' });
  list.splice(idx, 1);
  presets.savePresets(list);
  res.status(204).end();
});
