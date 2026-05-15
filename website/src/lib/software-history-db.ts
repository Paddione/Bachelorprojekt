import { Pool, type PoolClient } from 'pg';
import { resolve4 } from 'node:dns';
import type { Event } from './software-history-classifier';

function nodeLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addr: string, family: number) => void,
) {
  resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}

export const trackingPool = new Pool({
  connectionString: (process.env.SESSIONS_DATABASE_URL ?? '').replace(/\/website$/, '/postgres'),
  lookup: nodeLookup,
} as unknown as import('pg').PoolConfig);

export interface StackRow {
  service: string;
  area: string;
  as_of: string;     // ISO timestamp
  last_pr: number;
}

export interface HistoryRow {
  id: number;
  pr_number: number;
  merged_at: string;
  title: string;
  brand: string | null;
  merged_by: string | null;
  service: string;
  area: string;
  kind: 'added' | 'removed' | 'changed' | 'irrelevant';
  confidence: number;
  classifier: string;
  classified_at: string;
  notes: string | null;
}

export interface ListFilters {
  kind?: string;
  area?: string;
  brand?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function listStack(pool: Pool): Promise<StackRow[]> {
  const { rows } = await pool.query<StackRow>(
    `SELECT service, area, as_of, last_pr FROM bachelorprojekt.v_software_stack`,
  );
  return rows;
}

export async function listHistory(pool: Pool, f: ListFilters = {}): Promise<HistoryRow[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.kind)  { args.push(f.kind);  where.push(`kind = $${args.length}`); }
  if (f.area)  { args.push(f.area);  where.push(`area = $${args.length}`); }
  if (f.brand) { args.push(f.brand); where.push(`(brand = $${args.length} OR brand IS NULL)`); }
  if (f.q)     { args.push(`%${f.q}%`); where.push(`(title ILIKE $${args.length} OR notes ILIKE $${args.length})`); }
  const limit  = Math.max(1, Math.min(f.limit ?? 200, 1000));
  const offset = Math.max(0, f.offset ?? 0);
  args.push(limit); args.push(offset);
  const sql =
    `SELECT id, pr_number, merged_at, title, brand, merged_by,
            service, area, kind, confidence, classifier, classified_at, notes
       FROM bachelorprojekt.v_software_history` +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` LIMIT $${args.length - 1} OFFSET $${args.length}`;
  const { rows } = await pool.query<HistoryRow>(sql, args);
  return rows;
}

/**
 * Insert classified events for a PR. Skips if the PR already has events
 * unless `replaceFailed` is true (then deletes only llm:failed rows first).
 * Manual overrides (classifier='manual') are NEVER touched.
 */
export async function upsertEventsForPR(
  pool: Pool,
  pr_number: number,
  events: Event[],
  classifier: string,
  opts: { replaceFailed?: boolean } = {},
): Promise<{ inserted: number; skipped: boolean }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      `SELECT id, classifier FROM bachelorprojekt.software_events WHERE pr_number = $1`,
      [pr_number],
    );
    const hasManual = existing.some((r) => r.classifier === 'manual');
    if (hasManual) {
      await client.query('ROLLBACK');
      return { inserted: 0, skipped: true };
    }

    if (existing.length > 0) {
      if (!opts.replaceFailed) {
        await client.query('ROLLBACK');
        return { inserted: 0, skipped: true };
      }
      await client.query(
        `DELETE FROM bachelorprojekt.software_events
          WHERE pr_number = $1 AND classifier = 'llm:failed'`,
        [pr_number],
      );
    }

    let inserted = 0;
    for (const e of events) {
      await client.query(
        `INSERT INTO bachelorprojekt.software_events
           (pr_number, service, area, kind, confidence, classifier, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [pr_number, e.service, e.area, e.kind, e.confidence, classifier, e.notes ?? null],
      );
      inserted++;
    }

    await client.query('COMMIT');
    return { inserted, skipped: false };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Promote a single event to manual override. */
export async function overrideEvent(
  pool: Pool,
  id: number,
  patch: { service: string; area: string; kind: string; notes: string | null },
): Promise<HistoryRow | null> {
  const { rows } = await pool.query<HistoryRow>(
    `UPDATE bachelorprojekt.software_events
        SET service = $2, area = $3, kind = $4, notes = $5,
            classifier = 'manual', confidence = 1.0, classified_at = now()
      WHERE id = $1
      RETURNING (SELECT row_to_json(v) FROM bachelorprojekt.v_software_history v WHERE v.id = software_events.id) AS row`,
    [id, patch.service, patch.area, patch.kind, patch.notes],
  );
  const r = rows[0] as unknown as { row: HistoryRow } | undefined;
  return r?.row ?? null;
}

export async function listUnclassifiedPRs(
  pool: Pool,
  limit?: number,
): Promise<Array<{ pr_number: number; title: string; description: string | null }>> {
  const sql =
    `SELECT f.pr_number, f.title, f.description
       FROM bachelorprojekt.features f
      WHERE NOT EXISTS (
        SELECT 1 FROM bachelorprojekt.software_events e WHERE e.pr_number = f.pr_number
      )
      ORDER BY f.merged_at ASC` + (limit ? ` LIMIT ${Math.max(1, limit | 0)}` : '');
  const { rows } = await pool.query(sql);
  return rows;
}
