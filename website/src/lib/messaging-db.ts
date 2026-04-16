// website/src/lib/messaging-db.ts
// DB operations for the inbox, messaging, and chat room system.
// Uses the same shared-db connection as website-db.ts.

import pg from 'pg';
const { Pool } = pg;

const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

const pool = new Pool({ connectionString: DB_URL });

// ── Types ─────────────────────────────────────────────────────────────────────

export type InboxType =
  | 'registration' | 'booking' | 'contact' | 'bug' | 'meeting_finalize' | 'user_message';
export type InboxStatus = 'pending' | 'actioned' | 'archived';

export interface InboxItem {
  id: number;
  type: InboxType;
  status: InboxStatus;
  reference_id: string | null;
  reference_table: string | null;
  payload: Record<string, unknown>;
  created_at: Date;
  actioned_at: Date | null;
  actioned_by: string | null;
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

export async function createInboxItem(params: {
  type: InboxType;
  referenceId?: string;
  referenceTable?: string;
  payload: Record<string, unknown>;
}): Promise<InboxItem> {
  const { rows } = await pool.query<InboxItem>(
    `INSERT INTO inbox_items (type, reference_id, reference_table, payload)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.type, params.referenceId ?? null, params.referenceTable ?? null, params.payload],
  );
  return rows[0];
}

export async function listInboxItems(filter: {
  status?: InboxStatus;
  type?: InboxType;
}): Promise<InboxItem[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filter.status) {
    conditions.push(`status = $${conditions.length + 1}`);
    values.push(filter.status);
  }
  if (filter.type) {
    conditions.push(`type = $${conditions.length + 1}`);
    values.push(filter.type);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query<InboxItem>(
    `SELECT * FROM inbox_items ${where} ORDER BY created_at DESC`,
    values,
  );
  return rows;
}

export async function getInboxItem(id: number): Promise<InboxItem | null> {
  const { rows } = await pool.query<InboxItem>(
    'SELECT * FROM inbox_items WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function updateInboxItemStatus(
  id: number,
  status: InboxStatus,
  actionedBy?: string,
): Promise<void> {
  await pool.query(
    `UPDATE inbox_items
     SET status = $1, actioned_at = $2, actioned_by = $3
     WHERE id = $4`,
    [status, status !== 'pending' ? new Date() : null, actionedBy ?? null, id],
  );
}

export async function countPendingByType(): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ type: string; count: string }>(
    `SELECT type, count(*) AS count FROM inbox_items WHERE status = 'pending' GROUP BY type`,
  );
  const out: Record<string, number> = {};
  for (const row of rows) out[row.type] = parseInt(row.count, 10);
  return out;
}
