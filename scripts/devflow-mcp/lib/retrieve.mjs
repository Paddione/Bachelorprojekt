// scripts/devflow-mcp/lib/retrieve.mjs — Code-, Wissens- und Rerank-Pfade (T900985, design.md D4).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cacheRoot, readCache, topK } from './graph-cache.mjs';

// Reranker-Eingang: n_ctx=2048 Tokens je Anfrage (Messung 2026-08-14, lib-context-retrieve.mjs).
// Alle Kandidaten teilen sich deshalb ein Zeichenbudget.
const RERANK_INPUT_CHARS = Number(process.env.DEVFLOW_RERANK_INPUT_CHARS || 4500);
const VECTOR_CANDIDATES = 40;

// Cache, dessen meta.repo auf dieses Repo zeigt (Projektname vergibt codebase-memory).
export function findCache(repoRoot, env = process.env) {
  const root = cacheRoot(env);
  let dirs = [];
  try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => path.join(root, d.name)); } catch { return null; }
  for (const dir of dirs) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
      if (path.resolve(meta.repo) === path.resolve(repoRoot)) return { dir, meta };
    } catch { /* kein Cache */ }
  }
  return null;
}

export function headCommit(repoRoot) {
  try { return execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return null; }
}

const words = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9äöüß]{3,}/g) ?? []);

// Ersatzordnung ohne Reranker für Kandidaten ohne Vektor-Reihenfolge (Werkzeuge): Anzahl der
// gemeinsamen Wörter mit der Anfrage, stabil. Code und Wissen behalten ihre Vektor-Reihenfolge.
export function lexicalOrder(query, items, textOf) {
  const q = words(query);
  return items
    .map((item, i) => ({ item, i, s: [...words(textOf(item))].filter(w => q.has(w)).length }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(x => x.item);
}

// Rerank mit gemeinsamem Zeichenbudget. Bei Ausfall: Eingangsreihenfolge (bzw. lexikalisch,
// fallback='lexical') + degraded.
export async function rerankItems(bge, query, items, textOf, k, fallback = 'input') {
  if (items.length === 0) return { items: [], degraded: [] };
  const per = Math.max(80, Math.floor(RERANK_INPUT_CHARS / items.length));
  const docs = items.map(it => textOf(it).slice(0, per));
  try {
    const ranked = await bge.rerank(query, docs);
    const seen = new Set(ranked.map(r => r.index));
    const order = [...ranked.map(r => ({ item: items[r.index], rerank: r.score })), ...items.filter((_, i) => !seen.has(i)).map(item => ({ item, rerank: null }))];
    return { items: order.slice(0, k).map(o => ({ ...o.item, rerank_score: o.rerank })), degraded: [] };
  } catch {
    const ordered = fallback === 'lexical' ? lexicalOrder(query, items, textOf) : items;
    return { items: ordered.slice(0, k), degraded: ['rerank'] };
  }
}

const excerpt = (s, n) => (s.length > n ? s.slice(0, n) + ' …' : s);

// queryVector: bereits eingebettete Anfrage (context_for_task bettet nur einmal ein — bge arbeitet
// seriell, jeder gesparte Aufruf ist Wartezeit hinter laufenden Index-Batches).
export async function searchCode({ bge, repoRoot, query, k = 8, pathPrefix = null, excerptChars = 400, queryVector = null }) {
  const found = findCache(repoRoot);
  if (!found) throw new Error(`kein Graph-Index für ${repoRoot} — node scripts/devflow-mcp/graph-index.mjs --repo ${repoRoot}`);
  const cache = readCache(found.dir);
  const qv = queryVector ?? (await bge.embed([query]))[0];
  const cand = topK(cache, qv, VECTOR_CANDIDATES, pathPrefix ? (r) => r.file.startsWith(pathPrefix) : null)
    .map(c => ({ ...cache.records[c.index], vector_score: c.score }));
  const { items, degraded } = await rerankItems(bge, query, cand, r => r.text, k);
  return {
    results: items.map(r => ({
      qualified_name: r.qn, name: r.name, kind: r.kind, file: r.file, line: r.line,
      signature: r.signature || null, score: r.rerank_score ?? r.vector_score, excerpt: excerpt(r.text, excerptChars),
    })),
    degraded,
    graph: { commit: cache.meta.commit, stale: cache.meta.commit !== headCommit(repoRoot) },
  };
}

const vecLiteral = (v) => `'[${v.map(x => Number(x).toFixed(6)).join(',')}]'::vector`;

// Pläne/Bugs/PRs aus knowledge.* über mcp-postgres (nur lesend). Eine Zeile je Dokument (bester Chunk).
export async function searchKnowledge({ bge, pg, query, sources = ['specs_plans', 'bug_tickets', 'pr_history'], k = 5, excerptChars = 400, queryVector = null }) {
  const qv = queryVector ?? (await bge.embed([query]))[0];
  const v = vecLiteral(qv);
  const srcList = sources.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
  const sql = `SELECT col.source AS source, d.title AS title, d.source_uri AS uri, c.text AS text, 1 - (c.embedding <=> ${v}) AS score
FROM knowledge.chunks c JOIN knowledge.collections col ON col.id = c.collection_id JOIN knowledge.documents d ON d.id = c.document_id
WHERE col.source IN (${srcList}) ORDER BY c.embedding <=> ${v} LIMIT ${VECTOR_CANDIDATES}`;
  const rows = await pg.query(sql);
  const best = new Map();
  for (const r of rows) if (!best.has(r.uri) || Number(r.score) > Number(best.get(r.uri).score)) best.set(r.uri, r);
  const { items, degraded } = await rerankItems(bge, query, [...best.values()], r => `${r.title}\n${r.text}`, k);
  return {
    results: items.map(r => ({ source: r.source, title: r.title, uri: r.uri, score: r.rerank_score ?? Number(r.score), excerpt: excerpt(r.text, excerptChars) })),
    degraded,
  };
}
