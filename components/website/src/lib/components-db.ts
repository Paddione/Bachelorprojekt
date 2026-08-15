// website/src/lib/components-db.ts
import { pool } from './website-db';

interface ComponentRow {
  id: number;
  name: string;
  kind: 'physical' | 'non-physical';
  area: string;
  status: 'active' | 'inactive' | 'deprecated';
  cluster: 'mentolder' | 'korczewski' | 'both';
  url: string | null;
  hostname: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ComponentInput {
  name: string;
  kind: 'physical' | 'non-physical';
  area: string;
  status?: 'active' | 'inactive' | 'deprecated';
  cluster?: 'mentolder' | 'korczewski' | 'both';
  url?: string | null;
  hostname?: string | null;
  notes?: string | null;
}

interface ListFilters {
  kind?: string;
  cluster?: string;
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

const SELECT = `SELECT id, name, kind, area, status, cluster, url, hostname, notes, created_at, updated_at
                FROM bachelorprojekt.components`;

export async function listComponents(f: ListFilters = {}): Promise<ComponentRow[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.kind)    { args.push(f.kind);      where.push(`kind = $${args.length}`); }
  if (f.cluster) { args.push(f.cluster);   where.push(`cluster = $${args.length}`); }
  if (f.status)  { args.push(f.status);    where.push(`status = $${args.length}`); }
  if (f.q)       { args.push(`%${f.q}%`);  where.push(`(name ILIKE $${args.length} OR area ILIKE $${args.length} OR notes ILIKE $${args.length})`); }
  const limit  = Math.max(1, Math.min(f.limit  ?? 200, 1000));
  const offset = Math.max(0, f.offset ?? 0);
  args.push(limit); args.push(offset);
  const sql = SELECT +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY kind, area, name LIMIT $${args.length - 1} OFFSET $${args.length}`;
  const { rows } = await pool.query<ComponentRow>(sql, args);
  return rows;
}

export async function createComponent(data: ComponentInput): Promise<ComponentRow> {
  const { rows } = await pool.query<ComponentRow>(
    `INSERT INTO bachelorprojekt.components (name, kind, area, status, cluster, url, hostname, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, name, kind, area, status, cluster, url, hostname, notes, created_at, updated_at`,
    [data.name, data.kind, data.area,
     data.status ?? 'active', data.cluster ?? 'both',
     data.url ?? null, data.hostname ?? null, data.notes ?? null],
  );
  return rows[0];
}

export async function updateComponent(
  id: number,
  patch: Partial<ComponentInput>,
): Promise<ComponentRow | null> {
  const sets: string[] = [];
  const args: unknown[] = [];
  const field = (val: unknown, col: string) => { args.push(val); sets.push(`${col} = $${args.length}`); };
  if (patch.name     !== undefined) field(patch.name,     'name');
  if (patch.kind     !== undefined) field(patch.kind,     'kind');
  if (patch.area     !== undefined) field(patch.area,     'area');
  if (patch.status   !== undefined) field(patch.status,   'status');
  if (patch.cluster  !== undefined) field(patch.cluster,  'cluster');
  if (patch.url      !== undefined) field(patch.url,      'url');
  if (patch.hostname !== undefined) field(patch.hostname, 'hostname');
  if (patch.notes    !== undefined) field(patch.notes,    'notes');
  if (sets.length === 0) return null;
  sets.push(`updated_at = now()`);
  args.push(id);
  const { rows } = await pool.query<ComponentRow>(
    `UPDATE bachelorprojekt.components SET ${sets.join(', ')}
     WHERE id = $${args.length}
     RETURNING id, name, kind, area, status, cluster, url, hostname, notes, created_at, updated_at`,
    args,
  );
  return rows[0] ?? null;
}

export async function deleteComponent(id: number): Promise<boolean> {
  const { rows } = await pool.query<{ id: number }>(
    `UPDATE bachelorprojekt.components SET status = 'deprecated', updated_at = now()
     WHERE id = $1 RETURNING id`,
    [id],
  );
  return rows.length > 0;
}
