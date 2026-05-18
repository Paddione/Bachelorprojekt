// website/src/lib/coaching-merge.ts
import type { Pool } from 'pg';

export interface SmallBook {
  id: string;
  title: string;
  sourceFilename: string;
  slug: string;
  chunkCount: number;
  collectionId: string;
}

export interface MergeSpec {
  title: string;
  slug: string;          // becomes collection name `coaching-<slug>`
  sourceBookIds: string[];
}

export interface MergeResult {
  mergedBookId: string;
  mergedCollectionId: string;
  chunksReassigned: number;
  draftsDeleted: number;
}

const SMALL_THRESHOLD = 5;

export async function listSmallBooks(pool: Pool): Promise<SmallBook[]> {
  const r = await pool.query(`
    SELECT b.id, b.title, b.source_filename, c.name AS collection_name,
           c.id AS collection_id, c.chunk_count
    FROM coaching.books b
    JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
    WHERE c.chunk_count <= $1
    ORDER BY c.chunk_count ASC, b.title ASC
  `, [SMALL_THRESHOLD]);
  return r.rows.map(row => ({
    id: row.id as string,
    title: row.title as string,
    sourceFilename: row.source_filename as string,
    slug: (row.collection_name as string).startsWith('coaching-')
      ? (row.collection_name as string).slice('coaching-'.length)
      : row.collection_name as string,
    chunkCount: row.chunk_count as number,
    collectionId: row.collection_id as string,
  }));
}

const STOP_WORDS = new Set(['und', 'der', 'die', 'das', 'ein', 'eine', 'für', 'mit', 'von', 'zu', 'im', 'am', 'an', 'auf', 'bei', 'nach', 'seit', 'vor', 'aus', 'über', 'unter', 'the', 'and', 'for', 'with', 'of', 'in', 'a', 'an', 'to']);

export function proposeTitleFromBooks(books: Pick<SmallBook, 'title'>[]): string {
  if (books.length === 0) return 'Unbenannte Gruppe';
  if (books.length === 1) return books[0].title;

  const wordFreq = new Map<string, number>();
  for (const b of books) {
    const words = b.title.toLowerCase().split(/[\s\-_/]+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
    const unique = new Set(words);
    for (const w of unique) wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
  }

  const common = [...wordFreq.entries()]
    .filter(([, freq]) => freq >= Math.max(2, Math.floor(books.length * 0.4)))
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);

  if (common.length === 0) return books[0].title + ' u.a.';

  const keyword = common[0].charAt(0).toUpperCase() + common[0].slice(1);
  return `${keyword} Materialien`;
}

export async function mergeBooks(pool: Pool, spec: MergeSpec): Promise<MergeResult> {
  if (spec.sourceBookIds.length < 2) throw new Error('At least 2 source books required');
  if (!spec.title.trim()) throw new Error('title is required');
  if (!spec.slug.trim()) throw new Error('slug is required');

  const collectionName = `coaching-${spec.slug}`;

  const placeholders = spec.sourceBookIds.map((_, i) => `$${i + 1}`).join(',');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Resolve source collection IDs and validate all are <= SMALL_THRESHOLD
    const booksRes = await client.query(`
      SELECT b.id, c.id AS collection_id, c.chunk_count
      FROM coaching.books b
      JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
      WHERE b.id IN (${placeholders})
    `, spec.sourceBookIds);

    if (booksRes.rows.length !== spec.sourceBookIds.length) {
      throw new Error('One or more source book IDs not found');
    }
    const oversized = booksRes.rows.filter(r => (r.chunk_count as number) > SMALL_THRESHOLD);
    if (oversized.length > 0) throw new Error(`Source books exceed ${SMALL_THRESHOLD}-chunk threshold: ${oversized.map(r => r.id).join(', ')}`);

    const sourceCollectionIds = booksRes.rows.map(r => r.collection_id as string);
    const colPlaceholders = sourceCollectionIds.map((_, i) => `$${i + 2}`).join(',');
    const totalChunks: number = booksRes.rows.reduce((s, r) => s + (r.chunk_count as number), 0);

    // 2. Create merged collection
    const colRes = await client.query(`
      INSERT INTO knowledge.collections (name, source, description, embedding_model, chunk_count)
      VALUES ($1, 'custom', $2, 'voyage-multilingual-2', $3)
      RETURNING id
    `, [collectionName, spec.title, totalChunks]);
    const mergedCollectionId: string = colRes.rows[0].id;

    // 3. Create merged book
    const bookRes = await client.query(`
      INSERT INTO coaching.books (knowledge_collection_id, title, source_filename)
      VALUES ($1, $2, 'merged')
      RETURNING id
    `, [mergedCollectionId, spec.title]);
    const mergedBookId: string = bookRes.rows[0].id;

    // 4. Move documents
    await client.query(`
      UPDATE knowledge.documents SET collection_id = $1
      WHERE collection_id IN (${colPlaceholders})
    `, [mergedCollectionId, ...sourceCollectionIds]);

    // 5. Move chunks
    const chunksRes = await client.query(`
      UPDATE knowledge.chunks SET collection_id = $1
      WHERE collection_id IN (${colPlaceholders})
    `, [mergedCollectionId, ...sourceCollectionIds]);
    const chunksReassigned: number = chunksRes.rowCount ?? 0;

    // 6. Delete stale drafts
    const draftsRes = await client.query(`
      DELETE FROM coaching.drafts WHERE book_id IN (${placeholders})
    `, spec.sourceBookIds);
    const draftsDeleted: number = draftsRes.rowCount ?? 0;

    // 7. Delete source books (cascades to their collections)
    await client.query(`
      DELETE FROM coaching.books WHERE id IN (${placeholders})
    `, spec.sourceBookIds);

    await client.query('COMMIT');
    return { mergedBookId, mergedCollectionId, chunksReassigned, draftsDeleted };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function clusterByEmbedding(
  pool: Pool,
  minSimilarity: number = 0.75,
): Promise<MergeSpec[]> {
  // Fetch all small books with their first chunk's embedding
  const r = await pool.query(`
    SELECT b.id AS book_id, b.title, c.id AS collection_id,
           (SELECT kc.embedding::text
              FROM knowledge.chunks kc
             WHERE kc.collection_id = c.id
             LIMIT 1) AS embedding
    FROM coaching.books b
    JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
    WHERE c.chunk_count <= $1
      AND EXISTS (
        SELECT 1 FROM knowledge.chunks kc2 WHERE kc2.collection_id = c.id
        AND kc2.embedding IS NOT NULL
      )
  `, [SMALL_THRESHOLD]);

  if (r.rows.length < 2) return [];

  // Greedy single-linkage clustering using pgvector similarity
  const clusterRes = await pool.query(`
    SELECT a.book_id AS book_a, b.book_id AS book_b,
           1 - (
             (SELECT kc.embedding FROM knowledge.chunks kc WHERE kc.collection_id = a.collection_id LIMIT 1)
             <=>
             (SELECT kc.embedding FROM knowledge.chunks kc WHERE kc.collection_id = b.collection_id LIMIT 1)
           ) AS similarity
    FROM (
      SELECT b.id AS book_id, c.id AS collection_id
      FROM coaching.books b JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
      WHERE c.chunk_count <= $1
    ) a
    CROSS JOIN (
      SELECT b.id AS book_id, c.id AS collection_id
      FROM coaching.books b JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
      WHERE c.chunk_count <= $1
    ) b
    WHERE a.book_id < b.book_id
    HAVING 1 - (
      (SELECT kc.embedding FROM knowledge.chunks kc WHERE kc.collection_id = a.collection_id LIMIT 1)
      <=>
      (SELECT kc.embedding FROM knowledge.chunks kc WHERE kc.collection_id = b.collection_id LIMIT 1)
    ) >= $2
    ORDER BY similarity DESC
  `, [SMALL_THRESHOLD, minSimilarity]);

  // Union-find clustering
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };
  const union = (x: string, y: string) => parent.set(find(x), find(y));

  for (const row of clusterRes.rows) {
    union(row.book_a as string, row.book_b as string);
  }

  // Group by root
  const groups = new Map<string, string[]>();
  for (const row of r.rows) {
    const root = find(row.book_id as string);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(row.book_id as string);
  }

  const bookMap = new Map(r.rows.map(row => [row.book_id as string, row.title as string]));
  const specs: MergeSpec[] = [];
  for (const [, bookIds] of groups) {
    if (bookIds.length < 2) continue;
    const books = bookIds.map(id => ({ title: bookMap.get(id) ?? id }));
    const title = proposeTitleFromBooks(books);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    specs.push({ title, slug, sourceBookIds: bookIds });
  }
  return specs;
}