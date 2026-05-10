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

export interface ChunkRow {
  id: string;
  position: number;
  text: string;
  metadata: Record<string, unknown>;
}

export async function listBooks(pool: Pool): Promise<Book[]> {
  const r = await pool.query(`
    SELECT b.*, c.chunk_count
    FROM coaching.books b
    JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
    ORDER BY b.ingested_at DESC
  `);
  return r.rows.map(rowToBook);
}

export async function getBook(pool: Pool, id: string): Promise<Book | null> {
  const r = await pool.query(
    `SELECT b.*, c.chunk_count
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

function rowToBook(r: Record<string, unknown>): Book {
  return {
    id: r.id as string,
    knowledgeCollectionId: r.knowledge_collection_id as string,
    title: r.title as string,
    author: (r.author ?? null) as string | null,
    sourceFilename: r.source_filename as string,
    licenseNote: (r.license_note ?? null) as string | null,
    ingestedAt: r.ingested_at as Date,
    chunkCount: (r.chunk_count ?? undefined) as number | undefined,
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
