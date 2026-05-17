// website/src/lib/coaching-project-db.ts
import type { Pool } from 'pg';

export interface CoachingProject {
  id: string;
  brand: string;
  clientId: string | null;
  customerNumber: string;
  displayAlias: string | null;
  kiContext: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  sessionCount?: number;
  lastSessionAt?: Date | null;
}

export interface ListProjectsOpts {
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface ListProjectsResult {
  projects: CoachingProject[];
  total: number;
  page: number;
  pageSize: number;
}

function rowToProject(row: Record<string, unknown>): CoachingProject {
  return {
    id: row.id as string,
    brand: row.brand as string,
    clientId: (row.client_id as string | null) ?? null,
    customerNumber: row.customer_number as string,
    displayAlias: (row.display_alias as string | null) ?? null,
    kiContext: (row.ki_context as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    sessionCount: row.session_count != null ? Number(row.session_count) : undefined,
    lastSessionAt: (row.last_session_at as Date | null) ?? null,
  };
}

export async function findOrCreateProject(
  pool: Pool,
  brand: string,
  clientId: string,
): Promise<CoachingProject> {
  const existing = await pool.query(
    `SELECT * FROM coaching.projects WHERE brand = $1 AND client_id = $2`,
    [brand, clientId],
  );
  if (existing.rows[0]) return rowToProject(existing.rows[0]);

  const customer = await pool.query(
    `SELECT customer_number FROM customers WHERE id = $1`,
    [clientId],
  );
  const customerNumber = (customer.rows[0]?.customer_number as string | null) ?? clientId;

  const r = await pool.query(
    `INSERT INTO coaching.projects (brand, client_id, customer_number)
     VALUES ($1, $2, $3)
     ON CONFLICT (brand, client_id) DO UPDATE SET updated_at = now()
     RETURNING *`,
    [brand, clientId, customerNumber],
  );
  return rowToProject(r.rows[0]);
}

export async function getProject(pool: Pool, id: string): Promise<CoachingProject | null> {
  const r = await pool.query(
    `SELECT p.id, p.brand, p.client_id, p.customer_number, p.display_alias,
       p.ki_context, p.notes, p.created_at, p.updated_at,
       COUNT(s.id)::int AS session_count,
       MAX(s.created_at) AS last_session_at
     FROM coaching.projects p
     LEFT JOIN coaching.sessions s ON s.project_id = p.id
     WHERE p.id = $1
     GROUP BY p.id, p.brand, p.client_id, p.customer_number, p.display_alias,
       p.ki_context, p.notes, p.created_at, p.updated_at`,
    [id],
  );
  return r.rows[0] ? rowToProject(r.rows[0]) : null;
}

export async function listProjects(
  pool: Pool,
  brand: string,
  opts: ListProjectsOpts = {},
): Promise<ListProjectsResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const params: unknown[] = [brand];
  const whereParts = [`p.brand = $1`];
  let p = 2;

  if (opts.q) {
    const hasSpecial = /[%_\\]/.test(opts.q);
    const pattern = `%${opts.q.replace(/[%_\\]/g, c => `\\${c}`)}%`;
    const ilike = hasSpecial
      ? `(p.customer_number ILIKE $${p} ESCAPE '\\\\' OR p.display_alias ILIKE $${p} ESCAPE '\\\\')`
      : `(p.customer_number ILIKE $${p} OR p.display_alias ILIKE $${p})`;
    whereParts.push(ilike);
    params.push(pattern);
    p++;
  }

  const where = whereParts.join(' AND ');

  const countR = await pool.query(
    `SELECT COUNT(*)::int AS total FROM coaching.projects p WHERE ${where}`,
    params,
  );
  const total = Number(countR.rows[0]?.total ?? 0);

  const dataParams = [...params, pageSize, offset];
  const r = await pool.query(
    `SELECT p.id, p.brand, p.client_id, p.customer_number, p.display_alias,
       p.ki_context, p.notes, p.created_at, p.updated_at,
       COUNT(s.id)::int AS session_count,
       MAX(s.created_at) AS last_session_at
     FROM coaching.projects p
     LEFT JOIN coaching.sessions s ON s.project_id = p.id
     WHERE ${where}
     GROUP BY p.id, p.brand, p.client_id, p.customer_number, p.display_alias,
       p.ki_context, p.notes, p.created_at, p.updated_at
     ORDER BY MAX(s.created_at) DESC NULLS LAST, p.created_at DESC
     LIMIT $${p} OFFSET $${p + 1}`,
    dataParams,
  );

  return { projects: r.rows.map(rowToProject), total, page, pageSize };
}

export async function updateProject(
  pool: Pool,
  id: string,
  fields: Partial<{ kiContext: string | null; notes: string | null; displayAlias: string | null }>,
): Promise<CoachingProject | null> {
  const sets: string[] = [`updated_at = now()`];
  const vals: unknown[] = [];
  let i = 1;

  if ('kiContext' in fields) { sets.push(`ki_context = $${i++}`); vals.push(fields.kiContext); }
  if ('notes' in fields)     { sets.push(`notes = $${i++}`);      vals.push(fields.notes); }
  if ('displayAlias' in fields) { sets.push(`display_alias = $${i++}`); vals.push(fields.displayAlias); }

  vals.push(id);
  const r = await pool.query(
    `UPDATE coaching.projects SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return r.rows[0] ? rowToProject(r.rows[0]) : null;
}
