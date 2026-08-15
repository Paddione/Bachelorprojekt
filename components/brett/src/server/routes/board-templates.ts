import { Router } from 'express';
import * as db from '../db';
import * as auth from '../auth';
import { listBoardTemplates, createBoardTemplate, deleteBoardTemplate } from '../board-templates';

export const boardTemplatesRouter = Router();

function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
}

boardTemplatesRouter.get('/api/board-templates', asyncHandler(async (req: any, res: any) => {
  const brand = typeof req.query.brand === 'string' ? req.query.brand : 'mentolder';
  const list = await listBoardTemplates(db.getPool(), brand);
  res.json(list);
}));

boardTemplatesRouter.post('/api/board-templates', auth.requireSession, asyncHandler(async (req: any, res: any) => {
  const session = (req as any).session;
  const brand = session?.brand || auth.resolveBrand(process.env);
  const body = req.body || {};
  if (!body.name || typeof body.name !== 'string' || body.name.length > 100) {
    return res.status(400).json({ error: 'name (≤100 chars) required' });
  }
  if (!body.state || typeof body.state !== 'object') {
    return res.status(400).json({ error: 'state object required' });
  }
  try {
    const result = await createBoardTemplate(db.getPool(), {
      brand,
      name: body.name,
      description: body.description,
      category: body.category,
      state: body.state,
      userId: session.userId,
    });
    res.status(201).json(result);
  } catch (err: any) {
    if (err.message === 'limit-reached') {
      return res.status(409).json({ error: 'limit-reached' });
    }
    throw err;
  }
}));

boardTemplatesRouter.delete('/api/board-templates/:id', auth.requireSession, asyncHandler(async (req: any, res: any) => {
  const session = (req as any).session;
  const result = await deleteBoardTemplate(db.getPool(), req.params.id, {
    userId: session.userId,
    isAdmin: !!session.isAdmin,
  });
  if (!result.deleted) {
    const code = result.reason === 'not-found' ? 404 : result.reason === 'forbidden' ? 403 : 400;
    return res.status(code).json({ error: result.reason });
  }
  res.status(204).end();
}));
