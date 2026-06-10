import { pool } from './website-db';

export const QA_CRITERIA = [
  { key: 'spec_match',    label: 'Feature verhält sich wie spezifiziert' },
  { key: 'no_regression', label: 'Keine sichtbaren Regressions' },
  { key: 'responsive',    label: 'Mobile / Responsive OK' },
  { key: 'performance',   label: 'Ladezeit akzeptabel' },
  { key: 'copy',          label: 'Texte / Übersetzungen korrekt' },
] as const;

export type CriterionKey = (typeof QA_CRITERIA)[number]['key'];

export interface CriterionResult { key: string; label: string; passed: boolean; }

export interface QaItem {
  ticketId: string;
  extId: string;
  title: string;
  prNumber: number | null;
  deployedAt: string | null;
  lastReview: { criteria: CriterionResult[]; notes: string | null } | null;
}

export interface QaReviewInput {
  ticketId: string;
  criteria: { key: string; passed: boolean }[];
  notes?: string;
  verdict: 'approved' | 'rejected';
  re_entry_phase?: 'scout' | 'implement' | 'verify';
}

export async function getQaQueue(): Promise<QaItem[]> {
  const r = await pool.query<{
    ticket_id: string; ext_id: string; title: string;
    pr_number: number | null; deployed_at: string | null;
    last_criteria: CriterionResult[] | null; last_notes: string | null;
  }>(`
    SELECT
      t.id            AS ticket_id,
      t.external_id   AS ext_id,
      t.title,
      tl.pr_number,
      pe.at           AS deployed_at,
      qr.criteria     AS last_criteria,
      qr.notes        AS last_notes
    FROM tickets.tickets t
    LEFT JOIN ticket_links tl ON tl.ticket_id = t.id AND tl.pr_number IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT at FROM tickets.factory_phase_events
      WHERE ticket_id = t.id AND phase = 'deploy' AND state = 'done'
      ORDER BY at DESC LIMIT 1
    ) pe ON true
    LEFT JOIN LATERAL (
      SELECT criteria, notes FROM tickets.qa_reviews
      WHERE ticket_id = t.id
      ORDER BY reviewed_at DESC LIMIT 1
    ) qr ON true
    WHERE t.status = 'qa_review'
    ORDER BY pe.at ASC NULLS LAST
  `);
  return r.rows.map((row) => ({
    ticketId: row.ticket_id,
    extId: row.ext_id,
    title: row.title,
    prNumber: row.pr_number ?? null,
    deployedAt: row.deployed_at ? new Date(row.deployed_at).toISOString() : null,
    lastReview: row.last_criteria
      ? { criteria: row.last_criteria, notes: row.last_notes ?? null }
      : null,
  }));
}

export async function createQaReview(input: QaReviewInput): Promise<void> {
  const criteriaSnapshot: CriterionResult[] = QA_CRITERIA.map((c) => ({
    key: c.key,
    label: c.label,
    passed: input.criteria.find((r) => r.key === c.key)?.passed ?? false,
  }));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO tickets.qa_reviews (ticket_id, criteria, notes, verdict, re_entry_phase)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.ticketId, JSON.stringify(criteriaSnapshot), input.notes ?? null,
       input.verdict, input.re_entry_phase ?? null],
    );

    if (input.verdict === 'approved') {
      await client.query(
        `UPDATE tickets.tickets
         SET status = 'done', done_at = now(), pipeline_slot = NULL
         WHERE id = $1`,
        [input.ticketId],
      );
    } else {
      await client.query(
        `UPDATE tickets.tickets SET status = 'in_progress' WHERE id = $1`,
        [input.ticketId],
      );
      const failedLabels = criteriaSnapshot
        .filter((c) => !c.passed)
        .map((c) => `- ${c.label}`)
        .join('\n');
      const content = `QS-Abnahme fehlgeschlagen.\n\nNicht bestanden:\n${failedLabels}${input.notes ? `\n\nKommentar: ${input.notes}` : ''}`;
      await client.query(
        `INSERT INTO tickets.ticket_injections
           (ticket_id, phase, kind, title, content, injected_by)
         VALUES ($1, $2, 'note', 'QS-Feedback', $3, 'qa-admin')`,
        [input.ticketId, input.re_entry_phase ?? 'implement', content],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
