// scripts/devflow-mcp/sync-db.mjs — lokaler Graph-Cache → knowledge.* (SSOT, T900985 design.md D3).
//
// Collection „Code Graph" (source code_graph), ein Dokument je Datei (source_uri code:<pfad>), ein
// Chunk je Symbol mit dem Vektor aus dem Cache — es wird nichts neu eingebettet. Dokumente mit
// unverändertem Hash bleiben unangetastet, Dateien ohne Symbole werden gelöscht.
// Braucht PGURL (Schreib-Port-Forward, Taskfile agents:devflow:graph:index).
//
// CLI: node scripts/devflow-mcp/sync-db.mjs --repo <pfad>   (Taskfile agents:devflow:graph:index SYNC_DB=1)
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readCache, vectorAt } from './lib/graph-cache.mjs';
import { findCache } from './lib/retrieve.mjs';

export async function syncCacheToDb(dir) {
  if (!process.env.PGURL) throw new Error('PGURL nicht gesetzt (Port-Forward auf shared-db fehlt)');
  const { makePool, ensureCollection, upsertDocumentAndChunks, bumpCollectionStats } = await import('../knowledge/lib-knowledge-pg.mjs');
  const cache = readCache(dir);
  if (!cache) throw new Error(`kein Cache in ${dir}`);

  const byFile = new Map();
  cache.records.forEach((r, i) => {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(i);
  });

  const pool = makePool();
  try {
    const collectionId = await ensureCollection(pool, {
      name: 'Code Graph',
      source: 'code_graph',
      description: `Symbole aus dem codebase-memory-Graphen (${cache.meta.project}), ein Chunk je Function/Method/Class`,
    });
    const existing = await pool.query('SELECT source_uri, sha256 FROM knowledge.documents WHERE collection_id = $1', [collectionId]);
    const known = new Map(existing.rows.map(r => [r.source_uri, r.sha256]));
    let written = 0;
    for (const [file, idx] of byFile) {
      const sourceUri = `code:${file}`;
      const hash = createHash('sha256').update(idx.map(i => cache.records[i].text_hash).join(',')).digest('hex');
      known.delete(sourceUri);
      if (existing.rows.some(r => r.source_uri === sourceUri && r.sha256 === hash)) continue;
      await upsertDocumentAndChunks(pool, {
        collectionId,
        title: file,
        sourceUri,
        rawText: idx.map(i => cache.records[i].text).join('\n\n'),
        hash,
        metadata: { commit: cache.meta.commit, project: cache.meta.project },
        chunks: idx.map((i, position) => ({
          position,
          text: cache.records[i].text,
          embedding: vectorAt(cache, i),
          metadata: { qn: cache.records[i].qn, kind: cache.records[i].kind, line: cache.records[i].line, signature: cache.records[i].signature },
        })),
      });
      written++;
    }
    for (const sourceUri of known.keys()) {
      await pool.query('DELETE FROM knowledge.documents WHERE collection_id = $1 AND source_uri = $2', [collectionId, sourceUri]);
    }
    await bumpCollectionStats(pool, collectionId);
    return `knowledge code_graph: ${byFile.size} Dateien, ${written} geschrieben, ${known.size} gelöscht`;
  } finally {
    await pool.end();
  }
}

// CLI-Einstieg: Cache des Repos finden und synchronisieren. Exit 0 auch bei Fehlern — der
// lokale Cache ist aktuell, der Sync holt der nächste Lauf nach.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--repo');
  const repo = path.resolve(i >= 0 ? process.argv[i + 1] : process.cwd());
  const found = findCache(repo);
  if (!found) { console.log(`sync-db: kein Graph-Cache für ${repo}`); process.exit(0); }
  try { console.log(`sync-db: ${await syncCacheToDb(found.dir)}`); } catch (e) { console.log(`sync-db: fehlgeschlagen — ${e.message}`); }
  process.exit(0);
}
