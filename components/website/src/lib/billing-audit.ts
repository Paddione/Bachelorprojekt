import { pool } from './website-db';

export interface BillingActor {
  userId?: string;
  email?: string;
}

export interface BillingAuditEntry {
  id: number;
  invoiceId: string;
  action: string;
  actorUserId?: string;
  actorEmail?: string;
  fromStatus?: string;
  toStatus?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export async function logBillingEvent(p: {
  invoiceId: string;
  action: string;
  actor?: BillingActor;
  fromStatus?: string;
  toStatus?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `INSERT INTO billing_audit_log
       (invoice_id, action, actor_user_id, actor_email, from_status, to_status, reason, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      p.invoiceId, p.action,
      p.actor?.userId ?? null, p.actor?.email ?? null,
      p.fromStatus ?? null, p.toStatus ?? null,
      p.reason ?? null,
      p.metadata ? JSON.stringify(p.metadata) : null,
    ]
  );
}

export async function getBillingAuditLog(invoiceId: string): Promise<BillingAuditEntry[]> {
  const r = await pool.query(
    `SELECT * FROM billing_audit_log WHERE invoice_id=$1 ORDER BY created_at DESC, id DESC`,
    [invoiceId]
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    invoiceId: row.invoice_id as string,
    action: row.action as string,
    actorUserId: (row.actor_user_id as string) ?? undefined,
    actorEmail: (row.actor_email as string) ?? undefined,
    fromStatus: (row.from_status as string) ?? undefined,
    toStatus: (row.to_status as string) ?? undefined,
    reason: (row.reason as string) ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
    createdAt: (row.created_at as Date).toISOString(),
  }));
}
