// website/src/lib/qa-ingest.ts [T000730]
// Rückkanal: mappt E2E-Ergebnisse auf qa_review- und awaiting_deploy-Tickets.
//
// Feature-Slug-Konvention: Spec-/Test-Titel beginnen mit "[<slug>] ..."
// Wenn ALLE Tests für einen Slug PASS sind und ein qa_review- oder
// awaiting_deploy-Ticket mit diesem Slug existiert, wird das Ticket auf
// 'done' gesetzt und der Feature-Flag für beide Brands aktiviert.
import { pool } from './website-db';

export type E2ETestStatus = 'pass' | 'fail' | 'skip';

export interface E2ETestResult {
  testId: string;
  status: E2ETestStatus;
}

/** Extrahiert "[slug]" aus dem Test-Titel. Gibt null zurück wenn kein Prefix. */
function extractSlug(testId: string): string | null {
  const m = testId.match(/^\[([^\]]+)\]/);
  return m ? m[1] : null;
}

/**
 * Prüft alle übergebenen E2E-Ergebnisse auf Feature-Slug-Matches gegen
 * qa_review-Tickets. Schließt vollständig grüne Tickets (→ 'done') ab.
 *
 * @returns Liste der external_ids der geschlossenen Tickets
 */
export async function closeQaTicketsBySlug(results: E2ETestResult[]): Promise<string[]> {
  // Gruppiere Ergebnisse nach Slug
  const bySlug = new Map<string, E2ETestStatus[]>();
  for (const r of results) {
    const slug = extractSlug(r.testId);
    if (!slug) continue;
    const existing = bySlug.get(slug) ?? [];
    existing.push(r.status);
    bySlug.set(slug, existing);
  }
  if (bySlug.size === 0) return [];

  // Alle Slugs aus den Ergebnissen (unabhängig von Pass/Fail) für DB-Lookup
  const allSlugs = [...bySlug.keys()];

  // qa_review- und awaiting_deploy-Tickets mit passenden Slugs laden
  let qaRows: Array<{ id: string; external_id: string; slug_key: string; status: string }> = [];
  try {
    const r = await pool.query<{ id: string; external_id: string; slug_key: string; status: string }>(
      `SELECT DISTINCT t.id, t.external_id,
              substring(c.body FROM 'branch=feature/([^ ]+)') AS slug_key,
              t.status
       FROM tickets.tickets t
       JOIN tickets.ticket_comments c ON c.ticket_id = t.id
       WHERE t.status IN ('qa_review', 'awaiting_deploy')
         AND t.type = 'feature'
         AND c.body LIKE 'FACTORY-PLAN-REF %'
         AND substring(c.body FROM 'branch=feature/([^ ]+)') = ANY($1)`,
      [allSlugs],
    );
    qaRows = r.rows;
  } catch {
    return [];
  }

  if (qaRows.length === 0) return [];

  const closed: string[] = [];
  for (const row of qaRows) {
    // Nur schließen wenn ALLE Tests für diesen Slug bestanden haben
    const statuses = bySlug.get(row.slug_key) ?? [];
    const allPassed = statuses.length > 0 && statuses.every((s) => s === 'pass' || s === 'skip');
    if (!allPassed) continue;

    try {
      const updateResult = await pool.query(
        `UPDATE tickets.tickets
         SET status = 'done', resolution = COALESCE(resolution, 'shipped'), done_at = now(), pipeline_slot = NULL, updated_at = now()
         WHERE id = $1 AND status IN ('qa_review', 'awaiting_deploy')`,
        [row.id],
      );
      if ((updateResult.rowCount ?? 0) === 0) continue;
      closed.push(row.external_id);

      // Feature-Flag für beide Brands aktivieren (idempotent)
      await pool.query(
        `INSERT INTO tickets.feature_flags (brand, key, enabled, set_by)
         VALUES ('mentolder', $1, true, 'qa-auto'), ('korczewski', $1, true, 'qa-auto')
         ON CONFLICT (brand, key) DO UPDATE SET enabled = true, set_by = 'qa-auto'`,
        [row.slug_key],
      );
    } catch {
      // Ticket bleibt auf qa_review — kein Datenverlust
    }
  }
  return closed;
}
