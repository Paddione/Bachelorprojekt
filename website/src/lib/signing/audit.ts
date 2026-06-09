import { getPool } from '../documents-db';
import type { AuditEvent } from './types';

export async function logSigningEvent(
  assignmentId: string,
  event: AuditEvent,
  ip: string | null,
  userAgent: string | null,
  actorId: string | null
): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO signing_audit_log (assignment_id, event, ip, user_agent, actor_id)
     VALUES ($1, $2, $3::inet, $4, $5)`,
    [assignmentId, event, ip, userAgent, actorId]
  );
}
