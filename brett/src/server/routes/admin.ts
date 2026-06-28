// brett/src/server/routes/admin.ts
// Admin- und Session-API-Routen (requireAdmin-geschützt).

import { Router } from 'express';
import * as db from '../db';
import * as auth from '../auth';
import * as rooms from '../rooms';
import * as eventLog from '../event-log';
import * as sessions from '../sessions';
import { listCoachingTemplates, getCoachingTemplate } from '../coaching-templates';

export const adminRouter = Router();

function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
}

adminRouter.get('/healthz', (_req, res) => res.type('text/plain').send('ok'));

adminRouter.get('/api/config', (_req, res) =>
  res.json({ ...auth.buildConfig(process.env), brand: auth.resolveBrand(process.env) }));

export function resolveJoinTarget(code: any): { redirect?: string; error?: string } {
  const room = typeof code === 'string' ? sessions.resolveSessionCode(code) : null;
  return room ? { redirect: `/?room=${room}` } : { error: 'unknown-code' };
}

adminRouter.get('/api/join', (req, res) => {
  const result = resolveJoinTarget(req.query.code);
  if (result.redirect) return res.redirect(result.redirect);
  return res.status(404).type('text/plain').send('Unbekannter oder abgelaufener Session-Code.');
});

// Live state for a room.
adminRouter.get('/api/state', auth.requireSession, asyncHandler(async (req: any, res: any) => {
  const room = String(req.query.room || '');
  if (!room) return res.status(400).json({ error: 'room required' });
  const { rows } = await db.getPool().query(
    'SELECT state FROM brett_rooms WHERE room_token = $1',
    [room]
  );
  res.json(rows[0]?.state ?? { figures: [] });
}));

// Customer dropdown source.
adminRouter.get('/api/customers', asyncHandler(async (_req: any, res: any) => {
  const { rows } = await db.getPool().query(
    'SELECT id, name FROM customers ORDER BY name ASC'
  );
  res.json(rows);
}));

// Coaching-step templates surfaced in the lobby. Public read (no admin gate) —
// they contain only generic coaching prompts, no client data.
adminRouter.get('/api/templates', asyncHandler(async (_req: any, res: any) => {
  const brand = process.env.BRAND || 'mentolder';
  const rows = await listCoachingTemplates(db.getPool() as any, brand);
  res.json(rows);
}));

adminRouter.get('/api/templates/:id', asyncHandler(async (req: any, res: any) => {
  const tpl = await getCoachingTemplate(db.getPool() as any, req.params.id);
  if (!tpl) { res.status(404).json({ error: 'not_found' }); return; }
  res.json(tpl);
}));

// ── Replay / Event-Log API (Slice 5, T000472) ───────────────────────────────

/** GET /api/sessions/:room/events — liefert alle Events einer Session (admin only). */
adminRouter.get('/api/sessions/:room/events', auth.requireAdmin, asyncHandler(async (req: any, res: any) => {
  const { room } = req.params;
  const sinceSeqRaw = parseInt(req.query.sinceSeq as string, 10);
  const sinceSeq = req.query.sinceSeq && !isNaN(sinceSeqRaw) ? sinceSeqRaw : undefined;
  const limitRaw = parseInt(req.query.limit as string, 10);
  const limit = req.query.limit && !isNaN(limitRaw) ? Math.min(limitRaw, 10_000) : undefined;
  const events = await eventLog.loadEvents(room, { sinceSeq, limit });
  res.json({ events });
}));

/** GET /api/sessions/:room/snapshot — liefert den initial gespeicherten State (admin only). */
adminRouter.get('/api/sessions/:room/snapshot', auth.requireAdmin, asyncHandler(async (req: any, res: any) => {
  const { room } = req.params;
  const state = await db.readState(room);
  res.json({ state, recordedAt: new Date().toISOString() });
}));

/** GET /api/sessions — listet Sessions eines Rooms (admin only). */
adminRouter.get('/api/sessions', auth.requireAdmin, asyncHandler(async (req: any, res: any) => {
  const room = req.query.room as string;
  if (!room) { return res.status(400).json({ error: 'room required' }); }
  const sessions = await eventLog.loadSessionMetas(room);
  res.json({ sessions });
}));

// Admin room list.
adminRouter.get('/api/admin/rooms', auth.requireAdmin, asyncHandler(async (_req: any, res: any) => {
  const liveTokens = Array.from(rooms.rooms.keys());
  const nameMap: Record<string, string> = {};
  if (liveTokens.length > 0) {
    const placeholders = liveTokens.map((_, i) => `$${i + 1}`).join(',');
    const rows = await db.getPool().query(
      `SELECT room_token, state->>'name' AS name FROM brett_rooms WHERE room_token = ANY(ARRAY[${placeholders}])`,
      liveTokens
    ).catch(() => ({ rows: [] }));
    for (const r of rows.rows) nameMap[r.room_token] = r.name;
  }
  const result = liveTokens.map(token => {
    const playerCount = Array.from(rooms.rooms.get(token) || []).length;
    return {
      token,
      name:        nameMap[token] || token,
      playerCount,
      maxPlayers:  4,
      lastActive:  new Date().toISOString(),
    };
  });
  res.json(result);
}));
