import type { PoolClient } from 'pg';
import { pool } from '../website-db';

export interface AuditEntry {
  actor: string;
  action: string;
  target: string;
  outcome: 'success' | 'failure';
  brand: string;
  detail?: unknown;
}

export interface AuditLogEntry extends AuditEntry {
  occurredAt: Date;
}

const AUDIT_MAX_ROWS = 200;

// Every executed cockpit write action must be in the log (Auth-Schnitt promise).
// Unlike the best-effort `audit()` helper in cockpit-db.ts this path throws on
// failure: the caller runs it in the SAME transaction as the business change, so
// a lost audit line fails the action instead of silently vanishing.
export async function recordAudit(
  client: PoolClient,
  entry: AuditEntry,
): Promise<void> {
  await client.query(
    `INSERT INTO tickets.cockpit_audit (actor, action, target, outcome, brand, detail)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entry.actor,
      entry.action,
      entry.target,
      entry.outcome,
      entry.brand,
      entry.detail != null ? JSON.stringify(entry.detail) : null,
    ],
  );
}

export async function listAudit(brand: string, limit: number): Promise<AuditLogEntry[]> {
  const capped = Math.max(1, Math.min(limit, AUDIT_MAX_ROWS));
  const { rows } = await pool.query(
    `SELECT actor, action, target, outcome, brand, detail, occurred_at
       FROM tickets.cockpit_audit
      WHERE brand = $1
      ORDER BY occurred_at DESC
      LIMIT $2`,
    [brand, capped],
  );
  return rows.map((r) => ({
    actor: String(r.actor),
    action: String(r.action),
    target: String(r.target),
    outcome: String(r.outcome) as AuditEntry['outcome'],
    brand: String(r.brand),
    detail: r.detail ?? undefined,
    occurredAt: r.occurred_at,
  }));
}
