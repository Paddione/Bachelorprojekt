// website/src/lib/tickets/reporter-link.ts
import { pool } from '../website-db';

/**
 * If a customer with this email exists and has a keycloak_user_id,
 * link any tickets where reporter_email = email AND reporter_id IS NULL.
 * Idempotent — safe to call repeatedly.
 */
export async function linkReporterByEmail(email: string): Promise<number> {
  if (!email) return 0;
  const r = await pool.query(
    `UPDATE tickets.tickets t
       SET reporter_id = c.id
       FROM customers c
      WHERE t.reporter_email = $1
        AND t.reporter_id IS NULL
        AND c.email = $1
        AND c.keycloak_user_id IS NOT NULL`,
    [email]
  );
  return r.rowCount ?? 0;
}

/**
 * Batch link: for every distinct reporter_email in tickets where reporter_id is null,
 * try to match against customers. Used by the migration script and as a nightly cron.
 */
export async function linkAllReporters(): Promise<number> {
  const r = await pool.query(
    `UPDATE tickets.tickets t
       SET reporter_id = c.id
       FROM customers c
      WHERE t.reporter_id IS NULL
        AND t.reporter_email IS NOT NULL
        AND c.email = t.reporter_email
        AND c.keycloak_user_id IS NOT NULL`
  );
  return r.rowCount ?? 0;
}
