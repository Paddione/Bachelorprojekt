import type { Pool } from 'pg';

export async function allPredecessorsDone(dependsOn: string[], pool: Pool): Promise<boolean> {
  if (!dependsOn.length) return true;
  const { rows } = await pool.query(
    `SELECT external_id, status FROM tickets.tickets WHERE external_id = ANY($1)`,
    [dependsOn],
  );
  return rows.length === dependsOn.length && rows.every((r: { status: string }) => r.status === 'done');
}

export async function updateSuccessorReadiness(ticketId: string, pool: Pool): Promise<number> {
  const { rows: successors } = await pool.query(
    `SELECT id, external_id, depends_on FROM tickets.tickets WHERE $1 = ANY(depends_on)`,
    [ticketId],
  );

  let updated = 0;
  for (const s of successors) {
    const done = await allPredecessorsDone(s.depends_on, pool);
    if (done) {
      const r = await pool.query(
        `UPDATE tickets.tickets SET readiness = COALESCE(readiness, '{}'::jsonb) || '{"abhaengigkeiten_klar":true}'::jsonb, updated_at = now() WHERE id = $1`,
        [s.id],
      );
      if ((r.rowCount ?? 0) > 0) updated++;
    }
  }
  return updated;
}
