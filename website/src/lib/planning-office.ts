import { pool } from './website-db';

export const DOR_KEYS = [
  'spec_skizziert', 'offene_fragen_geklaert', 'abhaengigkeiten_klar', 'aufwand_geschaetzt',
] as const;
export type DorKey = (typeof DOR_KEYS)[number];
export type Readiness = Partial<Record<DorKey, boolean>>;

export interface OfficeItem {
  extId: string; title: string; valueProp: string | null; priority: string;
  effort: string | null; areas: string[]; dependsOn: string[];
  rank: number | null; readiness: Readiness; dorScore: number;
  isNextCandidate: boolean; createdAt: string; updatedAt: string;
}

export function dorScore(r: Readiness | null): number {
  if (!r) return 0;
  return DOR_KEYS.reduce((n, k) => n + (r[k] === true ? 1 : 0), 0);
}

function mapRow(row: any): OfficeItem {
  const readiness: Readiness = row.readiness ?? {};
  return {
    extId: row.external_id, title: row.title, valueProp: row.value_prop,
    priority: row.priority, effort: row.effort,
    areas: row.areas ?? [], dependsOn: row.depends_on ?? [],
    rank: row.planning_rank, readiness, dorScore: dorScore(readiness),
    isNextCandidate: (row.planning_rank ?? 99) === 0 && dorScore(readiness) === 4,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function listOffice(): Promise<OfficeItem[]> {
  const r = await pool.query(
    `SELECT external_id, title, value_prop, priority, effort, areas, depends_on,
            planning_rank, readiness, created_at, updated_at
       FROM tickets.tickets
      WHERE type = 'feature' AND status = 'planning'
      ORDER BY COALESCE(planning_rank, 2147483647), created_at`,
  );
  return r.rows.map(mapRow);
}

export interface CreateInput {
  title: string; brand: string; valueProp?: string; priority?: string;
  effort?: string; areas?: string[];
}
export async function createIdea(inp: CreateInput): Promise<string> {
  const r = await pool.query(
    `INSERT INTO tickets.tickets
       (type, brand, title, status, value_prop, priority, effort, areas, planning_rank, readiness)
     VALUES ('feature', $1, $2, 'planning', $3, COALESCE($4,'mittel'), $5, $6,
       (SELECT COALESCE(MAX(planning_rank),0)+1 FROM tickets.tickets WHERE status='planning'),
       '{}'::jsonb)
     RETURNING external_id`,
    [inp.brand, inp.title, inp.valueProp ?? null, inp.priority ?? null,
     inp.effort ?? null, inp.areas ?? null],
  );
  return r.rows[0].external_id;
}

export interface PatchInput {
  valueProp?: string; priority?: string; effort?: string;
  areas?: string[]; dependsOn?: string[]; rank?: number; readiness?: Readiness;
}
export async function patchItem(extId: string, p: PatchInput): Promise<boolean> {
  const sets: string[] = []; const vals: any[] = []; let i = 1;
  const add = (col: string, v: any) => { sets.push(`${col} = $${i++}`); vals.push(v); };
  if (p.valueProp !== undefined) add('value_prop', p.valueProp);
  if (p.priority !== undefined) add('priority', p.priority);
  if (p.effort !== undefined) add('effort', p.effort);
  if (p.areas !== undefined) add('areas', p.areas);
  if (p.dependsOn !== undefined) add('depends_on', p.dependsOn);
  if (p.rank !== undefined) add('planning_rank', p.rank);
  if (p.readiness !== undefined) {
    const clean: Readiness = {};
    for (const k of DOR_KEYS) if (p.readiness[k] !== undefined) clean[k] = !!p.readiness[k];
    add('readiness', JSON.stringify(clean));
  }
  if (!sets.length) return false;
  vals.push(extId);
  const r = await pool.query(
    `UPDATE tickets.tickets SET ${sets.join(', ')}, updated_at = now()
      WHERE external_id = $${i} AND status = 'planning'`,
    vals,
  );
  return (r.rowCount ?? 0) > 0;
}

export async function promoteItem(extId: string, override: boolean): Promise<{ ok: boolean; reason?: string }> {
  const r = await pool.query(
    `SELECT id, title, value_prop, priority, effort, areas, depends_on, readiness
       FROM tickets.tickets WHERE external_id = $1 AND status = 'planning'`,
    [extId],
  );
  const t = r.rows[0];
  if (!t) return { ok: false, reason: 'not_found' };
  if (!override && dorScore(t.readiness) < 4) return { ok: false, reason: 'dor_incomplete' };

  await pool.query(`UPDATE tickets.tickets SET planning_rank = 0, updated_at = now() WHERE id = $1`, [t.id]);
  const ctx = [
    `DEVFLOW-PLAN-CONTEXT`,
    `Titel: ${t.title}`,
    `Kern-Nutzen: ${t.value_prop ?? '—'}`,
    `Priorität: ${t.priority} · Aufwand: ${t.effort ?? '—'}`,
    `Bereiche: ${(t.areas ?? []).join(', ') || '—'}`,
    `Abhängigkeiten: ${(t.depends_on ?? []).join(', ') || '—'}`,
  ].join('\n');
  await pool.query(
    `INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
     VALUES ($1, 'planning-office', $2, 'internal')`,
    [t.id, ctx],
  );
  return { ok: true };
}

export async function officeCount(): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM tickets.tickets WHERE type='feature' AND status='planning'`,
  );
  return r.rows[0]?.n ?? 0;
}
