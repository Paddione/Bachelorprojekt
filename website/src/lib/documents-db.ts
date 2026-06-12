import pg from 'pg';
import { resolve4 } from 'dns';

const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

function nodeLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addr: string, family: number) => void,
) {
  resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}

const pool = new pg.Pool(
  { connectionString: DB_URL, lookup: nodeLookup } as unknown as import('pg').PoolConfig,
);

let tablesReady = false;
async function ensureTables(): Promise<void> {
  if (tablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS document_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      html_body TEXT NOT NULL,
      docuseal_template_id INTEGER,
      stand_date TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS document_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id UUID NOT NULL,
      template_id UUID NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      signature_data JSONB,
      signed_html TEXT,
      signed_pdf BYTEA,
      expires_at TIMESTAMPTZ,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      signed_at TIMESTAMPTZ
    )
  `);
  tablesReady = true;
}

export async function getPool(): Promise<typeof pool> {
  return pool;
}

export interface DocumentTemplate {
  id: string;
  title: string;
  html_body: string;
  stand_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentAssignment {
  id: string;
  customer_id: string;
  template_id: string;
  template_title?: string;
  status: 'pending' | 'completed' | 'expired' | 'revoked';
  signature_data: import('./signing/types').SignatureData | null;
  signed_html: string | null;
  signed_pdf: Buffer | null;
  expires_at: string | null;
  assigned_at: string;
  signed_at: string | null;
}

// ── Templates ─────────────────────────────────────────────────────

export async function listDocumentTemplates(): Promise<DocumentTemplate[]> {
  await ensureTables();
  const r = await pool.query(
    `SELECT id, title, html_body, stand_date, created_at, updated_at
     FROM document_templates ORDER BY created_at DESC`,
  );
  return r.rows;
}

export async function getDocumentTemplate(id: string): Promise<DocumentTemplate | null> {
  await ensureTables();
  const r = await pool.query(
    `SELECT id, title, html_body, stand_date, created_at, updated_at
     FROM document_templates WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

export async function createDocumentTemplate(params: {
  title: string;
  html_body: string;
}): Promise<DocumentTemplate> {
  await ensureTables();
  const r = await pool.query(
    `INSERT INTO document_templates (title, html_body)
     VALUES ($1, $2)
     RETURNING id, title, html_body, stand_date, created_at, updated_at`,
    [params.title, params.html_body],
  );
  return r.rows[0];
}

export async function updateDocumentTemplate(
  id: string,
  params: { title?: string; html_body?: string; stand_date?: string | null },
): Promise<DocumentTemplate | null> {
  await ensureTables();
  const sets: string[] = ['updated_at = now()'];
  const vals: unknown[] = [];
  if (params.title !== undefined) { vals.push(params.title); sets.push(`title = $${vals.length}`); }
  if (params.html_body !== undefined) { vals.push(params.html_body); sets.push(`html_body = $${vals.length}`); }
  if (params.stand_date !== undefined) { vals.push(params.stand_date); sets.push(`stand_date = $${vals.length}`); }
  vals.push(id);
  const r = await pool.query(
    `UPDATE document_templates SET ${sets.join(', ')}
     WHERE id = $${vals.length}
     RETURNING id, title, html_body, stand_date, created_at, updated_at`,
    vals,
  );
  return r.rows[0] ?? null;
}

export async function deleteDocumentTemplate(id: string): Promise<void> {
  await ensureTables();
  await pool.query(`DELETE FROM document_templates WHERE id = $1`, [id]);
}

// ── Assignments ───────────────────────────────────────────────────

export async function createDocumentAssignment(params: {
  customerId: string;
  templateId: string;
  status: 'pending' | 'completed' | 'expired' | 'revoked';
}): Promise<DocumentAssignment> {
  await ensureTables();
  const r = await pool.query(
    `INSERT INTO document_assignments
       (customer_id, template_id, status)
     VALUES ($1, $2, $3)
     RETURNING id, customer_id, template_id, status, assigned_at, signed_at`,
    [params.customerId, params.templateId, params.status],
  );
  const row = r.rows[0];
  const tpl = await getDocumentTemplate(row.template_id);
  return { ...row, template_title: tpl?.title ?? '', signature_data: null, signed_html: null, signed_pdf: null, expires_at: null };
}

export async function listAssignmentsForCustomer(customerId: string): Promise<DocumentAssignment[]> {
  await ensureTables();
  const r = await pool.query(
    `SELECT a.id, a.customer_id, a.template_id, t.title AS template_title,
            a.status, a.assigned_at, a.signed_at,
            a.signature_data, a.signed_html, a.signed_pdf, a.expires_at
     FROM document_assignments a
     JOIN document_templates t ON t.id = a.template_id
     WHERE a.customer_id = $1
     ORDER BY a.assigned_at DESC`,
    [customerId],
  );
  return r.rows;
}

export async function countPendingAssignmentsForCustomer(customerId: string): Promise<number> {
  await ensureTables();
  const r = await pool.query(
    `SELECT COUNT(*)::int FROM document_assignments
     WHERE customer_id = $1 AND status = 'pending'`,
    [customerId],
  );
  return r.rows[0]?.count ?? 0;
}

// ── New signing functions ─────────────────────────────────────────

export async function markAssignmentSigned(
  id: string,
  signatureData: import('./signing/types').SignatureData,
  signedHtml: string,
  signedPdf: Buffer
): Promise<void> {
  await ensureTables();
  const p = await getPool();
  await p.query(
    `UPDATE document_assignments
     SET status = 'completed', signed_at = NOW(),
         signature_data = $1::jsonb, signed_html = $2, signed_pdf = $3
     WHERE id = $4`,
    [JSON.stringify(signatureData), signedHtml, signedPdf, id]
  );
}

export async function getAssignmentPdf(id: string): Promise<Buffer | null> {
  await ensureTables();
  const p = await getPool();
  const { rows } = await p.query<{ signed_pdf: Buffer | null }>(
    `SELECT signed_pdf FROM document_assignments WHERE id = $1`,
    [id]
  );
  return rows[0]?.signed_pdf ?? null;
}

export async function revokeAssignment(id: string): Promise<void> {
  await ensureTables();
  const p = await getPool();
  await p.query(
    `UPDATE document_assignments SET status = 'revoked' WHERE id = $1`,
    [id]
  );
}

export async function extendAssignmentDeadline(id: string, expiresAt: Date): Promise<void> {
  await ensureTables();
  const p = await getPool();
  await p.query(
    `UPDATE document_assignments SET expires_at = $1 WHERE id = $2`,
    [expiresAt.toISOString(), id]
  );
}

export async function getDocumentAssignmentById(id: string): Promise<DocumentAssignment | null> {
  await ensureTables();
  const p = await getPool();
  const { rows } = await p.query<DocumentAssignment>(
    `SELECT da.*, dt.title AS template_title
     FROM document_assignments da
     JOIN document_templates dt ON da.template_id = dt.id
     WHERE da.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export interface AdminAssignmentRow {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  template_id: string;
  template_title: string;
  status: 'pending' | 'completed' | 'expired' | 'revoked';
  assigned_at: string;
  signed_at: string | null;
  expires_at: string | null;
}

export async function listAllAssignments(): Promise<AdminAssignmentRow[]> {
  await ensureTables();
  const r = await pool.query(
    `SELECT a.id, a.customer_id,
            c.name  AS customer_name,
            c.email AS customer_email,
            a.template_id, t.title AS template_title,
            a.status, a.assigned_at, a.signed_at, a.expires_at
     FROM document_assignments a
     JOIN document_templates t ON t.id = a.template_id
     LEFT JOIN customers c ON c.id = a.customer_id
     ORDER BY a.assigned_at DESC`,
  );
  return r.rows;
}
