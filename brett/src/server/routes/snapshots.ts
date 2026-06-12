// brett/src/server/routes/snapshots.ts
// Snapshot-CRUD + Curated-Template-Verwaltung (D8).

import { Router } from 'express';
import * as db from '../db';
import * as auth from '../auth';

export const snapshotsRouter = Router();

function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
}

// D8 — Pure: build the snapshot-list SELECT. `isTemplate:true` is a valid
// standalone filter (curated templates need no room/customer). room/customer_id
// still filter as before; an empty filter set yields `valid:false`.
export function buildSnapshotListQuery(
  opts: { room?: string | null; customerId?: string | null; isTemplate?: boolean }
): { sql: string; args: any[]; valid: boolean } {
  const where: string[] = [];
  const args: any[] = [];
  if (opts.room)       { args.push(opts.room);       where.push(`room_token = $${args.length}`); }
  if (opts.customerId) { args.push(opts.customerId); where.push(`customer_id = $${args.length}`); }
  if (opts.isTemplate) { where.push('is_template = true'); }
  const sql =
    `SELECT id, name, room_token, customer_id, is_template, created_at
       FROM brett_snapshots` +
    (where.length ? `\n      WHERE ${where.join(' AND ')}` : '') +
    `\n      ORDER BY created_at DESC
      LIMIT 200`;
  return { sql, args, valid: where.length > 0 };
}

// D8 — Pure: validate + normalize a snapshot-insert body. is_template defaults
// to false; name (≤200) and state.figures[] are required.
export function parseSnapshotInsert(
  body: any
): { valid: boolean; values?: { room_token: string | null; customer_id: string | null; name: string; state: any; is_template: boolean } } {
  const b = body || {};
  if (!b.name || typeof b.name !== 'string' || b.name.length > 200) return { valid: false };
  if (!b.state || typeof b.state !== 'object' || !Array.isArray(b.state.figures)) return { valid: false };
  return {
    valid: true,
    values: {
      room_token: b.room_token || null,
      customer_id: b.customer_id || null,
      name: b.name,
      state: b.state,
      is_template: b.is_template === true,
    },
  };
}

// D8 / SEC-2 — Pure: may this request create a curated TEMPLATE (is_template=true)?
// Admin-only — allowed iff the OIDC session is admin OR the request carries the
// valid x-e2e-secret (E2E bypass). Extracted so the admin gate is unit-testable
// against the real route logic, not a copy.
export function canCreateTemplate(req: { session?: { isAdmin?: boolean }; header: (n: string) => string | undefined }): boolean {
  if (req.session?.isAdmin) return true;
  const e2eSecret = process.env.BRETT_OIDC_SECRET;
  return !!e2eSecret && req.header('x-e2e-secret') === e2eSecret;
}

// List snapshots, optionally filtered (incl. curated templates via is_template).
snapshotsRouter.get('/api/snapshots', asyncHandler(async (req: any, res: any) => {
  const room = req.query.room ? String(req.query.room) : null;
  const customerId = req.query.customer_id ? String(req.query.customer_id) : null;
  const isTemplate = req.query.is_template === 'true';
  const q = buildSnapshotListQuery({ room, customerId, isTemplate });
  if (!q.valid) {
    return res.status(400).json({ error: 'room, customer_id or is_template required' });
  }
  const { rows } = await db.getPool().query(q.sql, q.args);
  res.json(rows);
}));

// Load one snapshot.
snapshotsRouter.get('/api/snapshots/:id', auth.requireSession, asyncHandler(async (req: any, res: any) => {
  const { rows } = await db.getPool().query(
    `SELECT id, name, state, customer_id, room_token, created_at
       FROM brett_snapshots WHERE id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
}));

// Create a snapshot. Template creation (is_template=true) is admin-only —
// curated Vorlagen may only be authored by admins (§5c / D8 guardrail).
snapshotsRouter.post('/api/snapshots', auth.requireSession, asyncHandler(async (req: any, res: any) => {
  const parsed = parseSnapshotInsert(req.body);
  if (!parsed.valid || !parsed.values) {
    return res.status(400).json({ error: 'name (≤200 chars) + state.figures[] required' });
  }
  const v = parsed.values;
  if (v.is_template && !canCreateTemplate(req)) {
    return res.status(403).json({ error: 'forbidden: template creation is admin-only' });
  }
  const { rows } = await db.getPool().query(
    `INSERT INTO brett_snapshots (room_token, customer_id, name, state, is_template)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [v.room_token, v.customer_id, v.name, v.state, v.is_template]
  );
  res.status(201).json({ id: rows[0].id });
}));
