import { Pool } from 'pg';

interface Cache {
  ids: string[];
  expiresAt: number;
}

let _cache: Cache | null = null;

export function __resetCacheForTests(): void {
  _cache = null;
}

export async function resolveCoachingCollectionIds(pool: Pool): Promise<string[]> {
  if (_cache && Date.now() < _cache.expiresAt) return _cache.ids;

  const brand = process.env.BRAND ?? process.env.BRAND_ID ?? 'mentolder';
  const r = await pool.query(`
    SELECT b.knowledge_collection_id AS collection_id
      FROM coaching.books b
      JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
     WHERE c.source = 'custom'
       AND (c.brand = $1 OR c.brand IS NULL)
  `, [brand]);
  const ids = r.rows.map((row: { collection_id: string }) => row.collection_id);
  _cache = { ids, expiresAt: Date.now() + 60_000 };
  return ids;
}