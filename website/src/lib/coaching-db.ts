import type { Pool } from 'pg';

export interface Book {
  id: string;
  knowledgeCollectionId: string;
  title: string;
  author: string | null;
  sourceFilename: string;
  licenseNote: string | null;
  ingestedAt: Date;
  chunkCount?: number;
  slug: string;
}

export interface Snippet {
  id: string;
  bookId: string;
  knowledgeChunkId: string | null;
  clusterId: string | null;
  title: string;
  body: string;
  tags: string[];
  page: number | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface Cluster {
  id: string;
  bookId: string | null;
  name: string;
  kind: 'auto' | 'manual';
  parentId: string | null;
  createdAt: Date;
  snippetCount?: number;
}

export type TargetSurface = 'questionnaire' | 'brett' | 'chatroom' | 'assistant';
export type TemplateStatus = 'draft' | 'published' | 'archived';

export interface SourcePointer {
  bookId: string;
  page: number | null;
  chunkId: string | null;
}

export interface Template {
  id: string;
  snippetId: string;
  targetSurface: TargetSurface;
  version: number;
  status: TemplateStatus;
  payload: Record<string, unknown>;
  sourcePointer: SourcePointer;
  surfaceRef: string | null;
  publishedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface ChunkRow {
  id: string;
  position: number;
  text: string;
  metadata: Record<string, unknown>;
}

export async function listBooks(pool: Pool): Promise<Book[]> {
  const r = await pool.query(`
    SELECT b.*, c.chunk_count, c.name AS collection_name
    FROM coaching.books b
    JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
    ORDER BY b.ingested_at DESC
  `);
  return r.rows.map(rowToBook);
}

export async function getBook(pool: Pool, id: string): Promise<Book | null> {
  const r = await pool.query(
    `SELECT b.*, c.chunk_count, c.name AS collection_name
       FROM coaching.books b
       JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
      WHERE b.id = $1`,
    [id],
  );
  return r.rows[0] ? rowToBook(r.rows[0]) : null;
}

export async function listChunksForBook(
  pool: Pool,
  bookId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<ChunkRow[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const r = await pool.query(
    `SELECT k.id, k.position, k.text, k.metadata
       FROM knowledge.chunks k
       JOIN coaching.books b ON b.knowledge_collection_id = k.collection_id
      WHERE b.id = $1
      ORDER BY k.position
      LIMIT $2 OFFSET $3`,
    [bookId, limit, offset],
  );
  return r.rows.map((row) => ({
    id: row.id,
    position: row.position,
    text: row.text,
    metadata: row.metadata ?? {},
  }));
}

export interface CreateSnippetArgs {
  bookId: string;
  title: string;
  body: string;
  tags: string[];
  page?: number | null;
  clusterId?: string | null;
  knowledgeChunkId?: string | null;
  createdBy?: string | null;
}

export async function createSnippet(pool: Pool, args: CreateSnippetArgs): Promise<Snippet> {
  const r = await pool.query(
    `INSERT INTO coaching.snippets (book_id, title, body, tags, page, cluster_id, knowledge_chunk_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      args.bookId,
      args.title,
      args.body,
      args.tags,
      args.page ?? null,
      args.clusterId ?? null,
      args.knowledgeChunkId ?? null,
      args.createdBy ?? null,
    ],
  );
  return rowToSnippet(r.rows[0]);
}

export type UpdateSnippetArgs = Partial<Pick<Snippet, 'title' | 'body' | 'tags' | 'clusterId'>>;

const SNIPPET_COLUMN_MAP: Record<keyof UpdateSnippetArgs, string> = {
  title: 'title',
  body: 'body',
  tags: 'tags',
  clusterId: 'cluster_id',
};

export async function updateSnippet(
  pool: Pool,
  id: string,
  args: UpdateSnippetArgs,
): Promise<Snippet | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(args)) {
    const col = SNIPPET_COLUMN_MAP[k as keyof UpdateSnippetArgs];
    if (!col) continue;
    sets.push(`${col} = $${i++}`);
    vals.push(v);
  }
  if (sets.length === 0) {
    const r = await pool.query(`SELECT * FROM coaching.snippets WHERE id = $1`, [id]);
    return r.rows[0] ? rowToSnippet(r.rows[0]) : null;
  }
  vals.push(id);
  const r = await pool.query(
    `UPDATE coaching.snippets SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return r.rows[0] ? rowToSnippet(r.rows[0]) : null;
}

export async function deleteSnippet(pool: Pool, id: string): Promise<boolean> {
  const r = await pool.query(`DELETE FROM coaching.snippets WHERE id = $1`, [id]);
  return (r.rowCount ?? 0) > 0;
}

export interface ListSnippetsFilter {
  bookId?: string;
  clusterId?: string;
  tag?: string;
}

export async function listSnippets(pool: Pool, filter: ListSnippetsFilter = {}): Promise<Snippet[]> {
  const where: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (filter.bookId)    { where.push(`book_id = $${i++}`); vals.push(filter.bookId); }
  if (filter.clusterId) { where.push(`cluster_id = $${i++}`); vals.push(filter.clusterId); }
  if (filter.tag)       { where.push(`$${i++} = ANY(tags)`); vals.push(filter.tag); }
  const sql = `SELECT * FROM coaching.snippets ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
  const r = await pool.query(sql, vals);
  return r.rows.map(rowToSnippet);
}

export interface CreateClusterArgs {
  bookId?: string | null;
  name: string;
  kind?: 'auto' | 'manual';
  parentId?: string | null;
}

export async function createCluster(pool: Pool, args: CreateClusterArgs): Promise<Cluster> {
  const r = await pool.query(
    `INSERT INTO coaching.snippet_clusters (book_id, name, kind, parent_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [args.bookId ?? null, args.name, args.kind ?? 'manual', args.parentId ?? null],
  );
  return rowToCluster(r.rows[0]);
}

export async function listClusters(
  pool: Pool,
  filter: { bookId?: string } = {},
): Promise<Cluster[]> {
  const sql = filter.bookId
    ? `SELECT * FROM coaching.snippet_clusters WHERE book_id = $1 ORDER BY name`
    : `SELECT * FROM coaching.snippet_clusters ORDER BY name`;
  const r = await pool.query(sql, filter.bookId ? [filter.bookId] : []);
  if (r.rows.length === 0) return [];

  const ids: string[] = r.rows.map((row) => row.id as string);
  const counts = await pool.query(
    `SELECT cluster_id, COUNT(*)::int AS snippet_count
       FROM coaching.snippets
      WHERE cluster_id = ANY($1::uuid[])
      GROUP BY cluster_id`,
    [ids],
  );
  const countByCluster = new Map<string, number>();
  for (const row of counts.rows) {
    countByCluster.set(row.cluster_id as string, row.snippet_count as number);
  }

  return r.rows.map((row) => {
    const c = rowToCluster(row);
    c.snippetCount = countByCluster.get(c.id) ?? 0;
    return c;
  });
}

export interface CreateTemplateDraftArgs {
  snippetId: string;
  targetSurface: TargetSurface;
  payload: Record<string, unknown>;
  sourcePointer: SourcePointer;
  createdBy?: string | null;
}

export async function createTemplateDraft(pool: Pool, args: CreateTemplateDraftArgs): Promise<Template> {
  const v = await pool.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM coaching.templates
      WHERE snippet_id = $1 AND target_surface = $2`,
    [args.snippetId, args.targetSurface],
  );
  const nextVersion: number = v.rows[0].next;
  const r = await pool.query(
    `INSERT INTO coaching.templates
       (snippet_id, target_surface, version, status, payload, source_pointer, created_by)
     VALUES ($1, $2, $3, 'draft', $4::jsonb, $5::jsonb, $6)
     RETURNING *`,
    [
      args.snippetId,
      args.targetSurface,
      nextVersion,
      JSON.stringify(args.payload),
      JSON.stringify({
        book_id: args.sourcePointer.bookId,
        page: args.sourcePointer.page,
        chunk_id: args.sourcePointer.chunkId,
      }),
      args.createdBy ?? null,
    ],
  );
  return rowToTemplate(r.rows[0]);
}

export async function updateTemplate(
  pool: Pool,
  id: string,
  args: { payload?: Record<string, unknown> },
): Promise<Template | null> {
  if (args.payload === undefined) {
    const r = await pool.query(`SELECT * FROM coaching.templates WHERE id = $1`, [id]);
    return r.rows[0] ? rowToTemplate(r.rows[0]) : null;
  }
  const r = await pool.query(
    `UPDATE coaching.templates SET payload = $1::jsonb WHERE id = $2 RETURNING *`,
    [JSON.stringify(args.payload), id],
  );
  return r.rows[0] ? rowToTemplate(r.rows[0]) : null;
}

export async function getTemplate(pool: Pool, id: string): Promise<Template | null> {
  const r = await pool.query(`SELECT * FROM coaching.templates WHERE id = $1`, [id]);
  return r.rows[0] ? rowToTemplate(r.rows[0]) : null;
}

export interface ListTemplatesFilter {
  bookId?: string;
  targetSurface?: TargetSurface;
  status?: TemplateStatus;
  snippetId?: string;
  latestOnly?: boolean;
}

export async function listTemplates(pool: Pool, filter: ListTemplatesFilter = {}): Promise<Template[]> {
  const where: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (filter.snippetId)     { where.push(`t.snippet_id = $${i++}`); vals.push(filter.snippetId); }
  if (filter.targetSurface) { where.push(`t.target_surface = $${i++}`); vals.push(filter.targetSurface); }
  if (filter.status)        { where.push(`t.status = $${i++}`); vals.push(filter.status); }
  if (filter.bookId) {
    where.push(`t.snippet_id IN (SELECT id FROM coaching.snippets WHERE book_id = $${i++})`);
    vals.push(filter.bookId);
  }
  let sql = `SELECT t.* FROM coaching.templates t`;
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
  sql += ` ORDER BY t.created_at DESC`;
  const r = await pool.query(sql, vals);
  let rows = r.rows.map(rowToTemplate);
  if (filter.latestOnly) {
    const seen = new Set<string>();
    rows = rows.filter((t) => {
      const k = `${t.snippetId}::${t.targetSurface}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return rows;
}

export async function listTemplateVersions(
  pool: Pool,
  snippetId: string,
  targetSurface: TargetSurface,
): Promise<Template[]> {
  const r = await pool.query(
    `SELECT * FROM coaching.templates
       WHERE snippet_id = $1 AND target_surface = $2
       ORDER BY version DESC`,
    [snippetId, targetSurface],
  );
  return r.rows.map(rowToTemplate);
}

export async function markTemplatePublished(
  pool: Pool,
  id: string,
  surfaceRef: string | null,
): Promise<Template | null> {
  const r = await pool.query(
    `UPDATE coaching.templates
        SET status = 'published',
            surface_ref = $1,
            published_at = now()
      WHERE id = $2
      RETURNING *`,
    [surfaceRef, id],
  );
  return r.rows[0] ? rowToTemplate(r.rows[0]) : null;
}

function rowToBook(r: Record<string, unknown>): Book {
  const collectionName = (r.collection_name ?? '') as string;
  return {
    id: r.id as string,
    knowledgeCollectionId: r.knowledge_collection_id as string,
    title: r.title as string,
    author: (r.author ?? null) as string | null,
    sourceFilename: r.source_filename as string,
    licenseNote: (r.license_note ?? null) as string | null,
    ingestedAt: r.ingested_at as Date,
    chunkCount: (r.chunk_count ?? undefined) as number | undefined,
    slug: collectionName.startsWith('coaching-') ? collectionName.slice('coaching-'.length) : collectionName,
  };
}

function rowToSnippet(r: Record<string, unknown>): Snippet {
  return {
    id: r.id as string,
    bookId: r.book_id as string,
    knowledgeChunkId: (r.knowledge_chunk_id ?? null) as string | null,
    clusterId: (r.cluster_id ?? null) as string | null,
    title: r.title as string,
    body: r.body as string,
    tags: (r.tags ?? []) as string[],
    page: (r.page ?? null) as number | null,
    createdBy: (r.created_by ?? null) as string | null,
    createdAt: r.created_at as Date,
  };
}

function rowToCluster(r: Record<string, unknown>): Cluster {
  return {
    id: r.id as string,
    bookId: (r.book_id ?? null) as string | null,
    name: r.name as string,
    kind: r.kind as 'auto' | 'manual',
    parentId: (r.parent_id ?? null) as string | null,
    createdAt: r.created_at as Date,
    snippetCount: (r.snippet_count ?? undefined) as number | undefined,
  };
}

function rowToTemplate(r: Record<string, unknown>): Template {
  const sp = (r.source_pointer ?? {}) as { book_id?: string; page?: number; chunk_id?: string };
  return {
    id: r.id as string,
    snippetId: r.snippet_id as string,
    targetSurface: r.target_surface as TargetSurface,
    version: r.version as number,
    status: r.status as TemplateStatus,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    sourcePointer: {
      bookId: (sp.book_id ?? '') as string,
      page: (sp.page ?? null) as number | null,
      chunkId: (sp.chunk_id ?? null) as string | null,
    },
    surfaceRef: (r.surface_ref ?? null) as string | null,
    publishedAt: (r.published_at ?? null) as Date | null,
    createdBy: (r.created_by ?? null) as string | null,
    createdAt: r.created_at as Date,
  };
}

// ---- Drafts (Phase 3) -------------------------------------------------

export type DraftKind = 'reflection' | 'dialog_pattern' | 'exercise' | 'case_example';
export type DraftStatus = 'open' | 'accepted' | 'rejected' | 'skipped';

export interface Draft {
  id: string;
  bookId: string;
  knowledgeChunkId: string;
  templateKind: DraftKind;
  suggestedPayload: Record<string, unknown>;
  classifierModel: string;
  classifierVersion: string;
  status: DraftStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectReason: string | null;
  resultingSnippetId: string | null;
  createdAt: Date;
}

export interface DraftWithChunk extends Draft {
  chunkText: string;
  page: number | null;
}

export interface DraftFilter {
  bookId?: string;
  templateKind?: DraftKind;
  status?: DraftStatus;
}

function rowToDraft(r: Record<string, unknown>): Draft {
  return {
    id: r.id as string,
    bookId: r.book_id as string,
    knowledgeChunkId: r.knowledge_chunk_id as string,
    templateKind: r.template_kind as DraftKind,
    suggestedPayload: (r.suggested_payload ?? {}) as Record<string, unknown>,
    classifierModel: r.classifier_model as string,
    classifierVersion: r.classifier_version as string,
    status: r.status as DraftStatus,
    reviewedBy: (r.reviewed_by ?? null) as string | null,
    reviewedAt: (r.reviewed_at ?? null) as Date | null,
    rejectReason: (r.reject_reason ?? null) as string | null,
    resultingSnippetId: (r.resulting_snippet_id ?? null) as string | null,
    createdAt: r.created_at as Date,
  };
}

export async function insertDraft(
  pool: Pool,
  d: Omit<
    Draft,
    'id' | 'status' | 'reviewedBy' | 'reviewedAt' | 'rejectReason' | 'resultingSnippetId' | 'createdAt'
  >,
): Promise<Draft> {
  const r = await pool.query(
    `INSERT INTO coaching.drafts (book_id, knowledge_chunk_id, template_kind, suggested_payload, classifier_model, classifier_version)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT (knowledge_chunk_id, classifier_version) DO NOTHING
     RETURNING *`,
    [
      d.bookId,
      d.knowledgeChunkId,
      d.templateKind,
      JSON.stringify(d.suggestedPayload),
      d.classifierModel,
      d.classifierVersion,
    ],
  );
  if ((r.rowCount ?? 0) === 0) {
    const existing = await pool.query(
      `SELECT * FROM coaching.drafts WHERE knowledge_chunk_id=$1 AND classifier_version=$2`,
      [d.knowledgeChunkId, d.classifierVersion],
    );
    return rowToDraft(existing.rows[0]);
  }
  return rowToDraft(r.rows[0]);
}

export async function listDrafts(pool: Pool, filter: DraftFilter = {}): Promise<Draft[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filter.bookId) {
    args.push(filter.bookId);
    where.push(`book_id=$${args.length}`);
  }
  if (filter.templateKind) {
    args.push(filter.templateKind);
    where.push(`template_kind=$${args.length}`);
  }
  if (filter.status) {
    args.push(filter.status);
    where.push(`status=$${args.length}`);
  }
  const sql = `SELECT * FROM coaching.drafts ${
    where.length ? 'WHERE ' + where.join(' AND ') : ''
  } ORDER BY created_at ASC`;
  const r = await pool.query(sql, args);
  return r.rows.map(rowToDraft);
}

export async function getDraft(pool: Pool, id: string): Promise<DraftWithChunk | null> {
  const r = await pool.query(
    `SELECT d.*, kc.text AS chunk_text, (kc.metadata->>'page')::int AS page
       FROM coaching.drafts d
       JOIN knowledge.chunks kc ON kc.id = d.knowledge_chunk_id
      WHERE d.id = $1`,
    [id],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  const row = r.rows[0];
  return {
    ...rowToDraft(row),
    chunkText: row.chunk_text as string,
    page: (row.page ?? null) as number | null,
  };
}

export interface AcceptDraftOpts {
  reviewedBy: string;
  /** override of suggested_payload before snippet creation; merged shallow */
  payloadOverrides?: Record<string, unknown>;
  /** override snippet title; defaults to `suggested_payload.title` */
  snippetTitleOverride?: string;
  /** tags for the resulting snippet; defaults to [template_kind] */
  tags?: string[];
}

export async function acceptDraft(
  pool: Pool,
  id: string,
  opts: AcceptDraftOpts,
): Promise<{ draft: Draft; snippetId: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const draftRes = await client.query(
      `SELECT * FROM coaching.drafts WHERE id=$1 FOR UPDATE`,
      [id],
    );
    if ((draftRes.rowCount ?? 0) === 0) throw new Error('draft not found');
    const draft = rowToDraft(draftRes.rows[0]);
    if (draft.status !== 'open')
      throw new Error(`draft ${id} is not open (status=${draft.status})`);

    const payload = { ...draft.suggestedPayload, ...(opts.payloadOverrides ?? {}) };
    const title =
      opts.snippetTitleOverride ?? ((payload as { title?: string }).title ?? `Draft ${id}`);
    const body = JSON.stringify(payload);
    const tags = opts.tags ?? [draft.templateKind];

    const chunkRes = await client.query(
      `SELECT (metadata->>'page')::int AS page FROM knowledge.chunks WHERE id=$1`,
      [draft.knowledgeChunkId],
    );
    const page = chunkRes.rows[0]?.page ?? null;

    const snipRes = await client.query(
      `INSERT INTO coaching.snippets (book_id, knowledge_chunk_id, title, body, tags, page, created_by, created_from_draft)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [draft.bookId, draft.knowledgeChunkId, title, body, tags, page, opts.reviewedBy, draft.id],
    );
    const snippetId = snipRes.rows[0].id as string;

    const updRes = await client.query(
      `UPDATE coaching.drafts
          SET status='accepted', reviewed_by=$2, reviewed_at=now(), resulting_snippet_id=$3
        WHERE id=$1
        RETURNING *`,
      [id, opts.reviewedBy, snippetId],
    );
    await client.query('COMMIT');
    return { draft: rowToDraft(updRes.rows[0]), snippetId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function rejectDraft(
  pool: Pool,
  id: string,
  reviewedBy: string,
  reason?: string,
): Promise<Draft> {
  const r = await pool.query(
    `UPDATE coaching.drafts
        SET status='rejected', reviewed_by=$2, reviewed_at=now(), reject_reason=$3
      WHERE id=$1 AND status='open'
      RETURNING *`,
    [id, reviewedBy, reason ?? null],
  );
  if ((r.rowCount ?? 0) === 0) throw new Error('draft not found or already reviewed');
  return rowToDraft(r.rows[0]);
}

export interface AcceptanceRate {
  bookId: string;
  open: number;
  accepted: number;
  rejected: number;
  skipped: number;
  total: number;
  /** accepted / (accepted + rejected + skipped); null if no reviews yet */
  acceptanceRate: number | null;
}

export async function acceptanceRateByBook(pool: Pool, bookId: string): Promise<AcceptanceRate> {
  const r = await pool.query(
    `SELECT
        SUM(CASE WHEN status='open' THEN 1 ELSE 0 END)::int AS open,
        SUM(CASE WHEN status='accepted' THEN 1 ELSE 0 END)::int AS accepted,
        SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END)::int AS rejected,
        SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END)::int AS skipped,
        COUNT(*)::int AS total
     FROM coaching.drafts WHERE book_id=$1`,
    [bookId],
  );
  const row = r.rows[0] ?? { open: 0, accepted: 0, rejected: 0, skipped: 0, total: 0 };
  const reviewed = (row.accepted ?? 0) + (row.rejected ?? 0) + (row.skipped ?? 0);
  return {
    bookId,
    open: row.open ?? 0,
    accepted: row.accepted ?? 0,
    rejected: row.rejected ?? 0,
    skipped: row.skipped ?? 0,
    total: row.total ?? 0,
    acceptanceRate: reviewed === 0 ? null : (row.accepted ?? 0) / reviewed,
  };
}
