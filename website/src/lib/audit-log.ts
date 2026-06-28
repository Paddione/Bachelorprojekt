import type { Pool } from 'pg';
import { logger } from './logger';

export interface AuditEntry {
  actor_id?: string | null;
  actor_email?: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  ip?: string | null;
  /** Security-relevant metadata (identifier/status values only — never plaintext secrets). */
  metadata?: unknown;
}

export function clientIpFromRequest(request: Request): string | null {
  const fwd = request.headers.get('x-forwarded-for');
  if (!fwd) return null;
  return fwd.split(',')[0]?.trim() || null;
}

export async function recordAudit(pool: Pool, e: AuditEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit.audit_log (actor_id, actor_email, action, target_type, target_id, ip, metadata)
       VALUES ($1,$2,$3,$4,$5,$6::inet,$7::jsonb)`,
      [
        e.actor_id ?? null,
        e.actor_email ?? null,
        e.action,
        e.target_type ?? null,
        e.target_id ?? null,
        e.ip ?? null,
        JSON.stringify(e.metadata ?? null),
      ],
    );
  } catch (err) {
    logger.warn({ err }, '[audit] recordAudit failed');
  }
}
