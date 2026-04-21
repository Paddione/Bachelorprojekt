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

export interface DocumentTemplate {
  id: string;
  title: string;
  html_body: string;
  docuseal_template_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentAssignment {
  id: string;
  customer_id: string;
  template_id: string;
  template_title: string;
  docuseal_template_id: number | null;
  docuseal_submission_slug: string | null;
  docuseal_embed_src: string | null;
  status: 'pending' | 'completed' | 'expired';
  assigned_at: string;
  signed_at: string | null;
}

// ── Templates ─────────────────────────────────────────────────────

export async function listDocumentTemplates(): Promise<DocumentTemplate[]> {
  const r = await pool.query(
    `SELECT id, title, html_body, docuseal_template_id, created_at, updated_at
     FROM document_templates ORDER BY created_at DESC`,
  );
  return r.rows;
}

export async function getDocumentTemplate(id: string): Promise<DocumentTemplate | null> {
  const r = await pool.query(
    `SELECT id, title, html_body, docuseal_template_id, created_at, updated_at
     FROM document_templates WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

export async function createDocumentTemplate(params: {
  title: string;
  html_body: string;
}): Promise<DocumentTemplate> {
  const r = await pool.query(
    `INSERT INTO document_templates (title, html_body)
     VALUES ($1, $2)
     RETURNING id, title, html_body, docuseal_template_id, created_at, updated_at`,
    [params.title, params.html_body],
  );
  return r.rows[0];
}

export async function updateDocumentTemplate(
  id: string,
  params: { title?: string; html_body?: string; docuseal_template_id?: number },
): Promise<DocumentTemplate | null> {
  const sets: string[] = ['updated_at = now()'];
  const vals: unknown[] = [];
  if (params.title !== undefined) { vals.push(params.title); sets.push(`title = $${vals.length}`); }
  if (params.html_body !== undefined) { vals.push(params.html_body); sets.push(`html_body = $${vals.length}`); }
  if (params.docuseal_template_id !== undefined) { vals.push(params.docuseal_template_id); sets.push(`docuseal_template_id = $${vals.length}`); }
  vals.push(id);
  const r = await pool.query(
    `UPDATE document_templates SET ${sets.join(', ')}
     WHERE id = $${vals.length}
     RETURNING id, title, html_body, docuseal_template_id, created_at, updated_at`,
    vals,
  );
  return r.rows[0] ?? null;
}

export async function deleteDocumentTemplate(id: string): Promise<void> {
  await pool.query(`DELETE FROM document_templates WHERE id = $1`, [id]);
}

// ── Assignments ───────────────────────────────────────────────────

export async function createDocumentAssignment(params: {
  customerId: string;
  templateId: string;
  dsTemplateId: number;
  submissionSlug: string;
  embedSrc: string;
}): Promise<DocumentAssignment> {
  const r = await pool.query(
    `INSERT INTO document_assignments
       (customer_id, template_id, docuseal_template_id, docuseal_submission_slug, docuseal_embed_src)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, customer_id, template_id, docuseal_template_id, docuseal_submission_slug,
               docuseal_embed_src, status, assigned_at, signed_at`,
    [params.customerId, params.templateId, params.dsTemplateId, params.submissionSlug, params.embedSrc],
  );
  const row = r.rows[0];
  const tpl = await getDocumentTemplate(row.template_id);
  return { ...row, template_title: tpl?.title ?? '' };
}

export async function listAssignmentsForCustomer(customerId: string): Promise<DocumentAssignment[]> {
  const r = await pool.query(
    `SELECT a.id, a.customer_id, a.template_id, t.title AS template_title,
            a.docuseal_submission_slug, a.docuseal_embed_src, a.status,
            a.assigned_at, a.signed_at
     FROM document_assignments a
     JOIN document_templates t ON t.id = a.template_id
     WHERE a.customer_id = $1
     ORDER BY a.assigned_at DESC`,
    [customerId],
  );
  return r.rows;
}

export async function markAssignmentCompleted(slug: string): Promise<void> {
  await pool.query(
    `UPDATE document_assignments
     SET status = 'completed', signed_at = now()
     WHERE docuseal_submission_slug = $1`,
    [slug],
  );
}

export async function countPendingAssignmentsForCustomer(customerId: string): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int FROM document_assignments
     WHERE customer_id = $1 AND status = 'pending'`,
    [customerId],
  );
  return r.rows[0]?.count ?? 0;
}
