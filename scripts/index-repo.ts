#!/usr/bin/env tsx
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, extname, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import pg from 'pg';

const { Pool } = pg;

const REPO_ROOT = resolve(import.meta.dirname ?? process.cwd(), '..');
const EMBED_DIM = 1024;
const CHUNK_MAX_TOKENS = 512;
const CHUNK_OVERLAP = 64;
const BATCH_SIZE = 16;

const IGNORE_DIRS = new Set([
  'node_modules', 'dist', '.git', 'docs-content-built',
  'k3d/docs-content-built', '.svelte-kit', '.astro', 'build',
]);

const INDEXABLE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.svelte', '.astro',
  '.yaml', '.yml', '.sh', '.bash', '.mjs', '.mts',
]);

// This script runs both in-cluster (CronJob) and on a developer's host (git hook,
// `task scs:index`) where cluster-internal DNS never resolves. Resolve the
// cluster hostname once; on failure fall back to the local dev stack
// (LM Studio direct on :1234, port-forwarded/local Postgres) instead of
// silently hanging or failing every commit. Explicit env vars always win.
async function clusterDnsResolves(hostname: string): Promise<boolean> {
  try {
    await dnsLookup(hostname);
    return true;
  } catch {
    return false;
  }
}

let EMBED_URL: string;
let EMBED_MODEL: string;

async function resolveEmbedConfig(): Promise<void> {
  const clusterHost = 'llm-gateway-lmstudio.workspace.svc.cluster.local';
  if (process.env.LLM_EMBED_URL) {
    EMBED_URL = process.env.LLM_EMBED_URL;
  } else {
    EMBED_URL = (await clusterDnsResolves(clusterHost))
      ? `http://${clusterHost}:1234`
      : 'http://localhost:1234';
  }
  // Model IDs are not a stable contract across LM Studio setups — override
  // locally with LLM_EMBED_MODEL if your loaded model uses a different ID
  // (e.g. `bge` instead of `text-embedding-bge-m3`).
  EMBED_MODEL = process.env.LLM_EMBED_MODEL ?? 'text-embedding-bge-m3';
}

async function makePool(): Promise<pg.Pool> {
  const clusterHost = 'shared-db.workspace.svc.cluster.local';
  const host = process.env.PGHOST ?? ((await clusterDnsResolves(clusterHost)) ? clusterHost : 'localhost');
  return new Pool({
    host,
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? 'website',
    user: process.env.PGUSER ?? 'website',
    password: process.env.PGPASSWORD ?? 'devwebsitedb',
    connectionTimeoutMillis: 5000,
  });
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function walkDir(dir: string, out: string[] = []): string[] {
  let entries: import('node:fs').Dirent[];
  try { entries = readdirSync(dir, { withFileTypes: true }) as import('node:fs').Dirent[]; } catch { return out; }
  for (const e of entries) {
    if (IGNORE_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walkDir(full, out);
    else if (e.isFile() && INDEXABLE_EXTS.has(extname(e.name))) out.push(full);
  }
  return out;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function chunkCode(content: string, filePath: string): string[] {
  const ext = extname(filePath);
  if (ext === '.yaml' || ext === '.yml') return chunkYaml(content);
  return chunkSource(content);
}

function chunkYaml(content: string): string[] {
  const chunks: string[] = [];
  const lines = content.split('\n');
  let current: string[] = [];
  for (const line of lines) {
    if (/^[^\s#]/.test(line) && current.length > 0) {
      chunks.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) chunks.push(current.join('\n'));
  return chunks.filter(c => c.trim().length > 20);
}

function chunkSource(content: string): string[] {
  const chunks: string[] = [];
  const lines = content.split('\n');
  let current: string[] = [];
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = estimateTokens(line);
    if (currentTokens + lineTokens > CHUNK_MAX_TOKENS && current.length > 0) {
      chunks.push(current.join('\n'));
      const overlapLines: string[] = [];
      let overlapTokens = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const t = estimateTokens(current[i]);
        if (overlapTokens + t > CHUNK_OVERLAP) break;
        overlapLines.unshift(current[i]);
        overlapTokens += t;
      }
      current = overlapLines;
      currentTokens = overlapTokens;
    }
    current.push(line);
    currentTokens += lineTokens;
  }
  if (current.length > 0) chunks.push(current.join('\n'));
  return chunks.filter(c => c.trim().length > 20);
}

function extractImports(content: string, filePath: string): string[] {
  const ext = extname(filePath);
  if (!['.ts', '.tsx', '.js', '.jsx', '.svelte', '.astro', '.mjs', '.mts'].includes(ext)) return [];
  const imports: string[] = [];
  const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRegex.exec(content)) !== null) {
    imports.push(m[1]);
  }
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = requireRegex.exec(content)) !== null) {
    imports.push(m[1]);
  }
  return imports;
}

function resolveImportPath(importSpec: string, fromFile: string): string | null {
  if (importSpec.startsWith('.') || importSpec.startsWith('/')) {
    const base = resolve(REPO_ROOT, fromFile);
    const resolved = resolve(dirname(base), importSpec);
    const rel = relative(REPO_ROOT, resolved);
    return rel;
  }
  return null;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const r = await fetch(`${EMBED_URL}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-LLM-Purpose': 'index' },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!r.ok) {
    throw new Error(`embed ${r.status}: ${await r.text()}`);
  }
  const j = await r.json() as { data: Array<{ embedding: number[] }> };
  return j.data.map(d => d.embedding);
}

function vecLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

async function ensureSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS code_embeddings (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      file_path    TEXT NOT NULL,
      chunk_index  INT NOT NULL,
      content      TEXT NOT NULL,
      file_hash    TEXT NOT NULL,
      embedding    vector(${EMBED_DIM}),
      indexed_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(file_path, chunk_index)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS file_dependencies (
      from_path TEXT NOT NULL,
      to_path   TEXT NOT NULL,
      PRIMARY KEY (from_path, to_path)
    )
  `);
  const idxCheck = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'code_embeddings' AND indexname LIKE '%ivfflat%'`
  );
  if (idxCheck.rows.length === 0) {
    const countRes = await pool.query(`SELECT COUNT(*)::int AS n FROM code_embeddings`);
    if (countRes.rows[0].n >= 100) {
      await pool.query(`CREATE INDEX ON code_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`);
    }
  }
}

async function upsertFile(pool: pg.Pool, filePath: string, fileHash: string, chunks: string[], embeddings: number[][]): Promise<void> {
  await pool.query(`DELETE FROM code_embeddings WHERE file_path = $1`, [filePath]);
  for (let i = 0; i < chunks.length; i++) {
    await pool.query(
      `INSERT INTO code_embeddings (file_path, chunk_index, content, file_hash, embedding)
       VALUES ($1, $2, $3, $4, $5)`,
      [filePath, i, chunks[i], fileHash, vecLiteral(embeddings[i])],
    );
  }
}

async function upsertDependencies(pool: pg.Pool, filePath: string, deps: string[]): Promise<void> {
  await pool.query(`DELETE FROM file_dependencies WHERE from_path = $1`, [filePath]);
  for (const dep of deps) {
    await pool.query(
      `INSERT INTO file_dependencies (from_path, to_path) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [filePath, dep],
    );
  }
}

async function indexFile(pool: pg.Pool, filePath: string, relPath: string): Promise<number> {
  const content = readFileSync(filePath, 'utf8');
  const fileHash = sha256(content);

  const existing = await pool.query(
    `SELECT file_hash FROM code_embeddings WHERE file_path = $1 LIMIT 1`,
    [relPath],
  );
  if (existing.rows.length > 0 && existing.rows[0].file_hash === fileHash) {
    return 0;
  }

  const chunks = chunkCode(content, filePath);
  if (chunks.length === 0) return 0;

  const embeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchEmbeds = await embedTexts(batch);
    embeddings.push(...batchEmbeds);
  }

  await upsertFile(pool, relPath, fileHash, chunks, embeddings);

  const imports = extractImports(content, filePath);
  const resolvedDeps = imports
    .map(imp => resolveImportPath(imp, relPath))
    .filter((p): p is string => p !== null);
  if (resolvedDeps.length > 0) {
    await upsertDependencies(pool, relPath, resolvedDeps);
  }

  return chunks.length;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const singleFileFlag = args.indexOf('--file');
  const singleFile = singleFileFlag >= 0 ? args[singleFileFlag + 1] : null;

  await resolveEmbedConfig();
  const pool = await makePool();
  process.stderr.write(`[SCS] embed=${EMBED_URL} model=${EMBED_MODEL} pghost=${pool.options.host}\n`);
  try {
    await ensureSchema(pool);

    let files: string[];
    if (singleFile) {
      const absPath = resolve(REPO_ROOT, singleFile);
      files = [absPath];
    } else {
      files = walkDir(REPO_ROOT);
    }

    let totalChunks = 0;
    let indexedFiles = 0;
    let skippedFiles = 0;

    for (const absPath of files) {
      const relPath = relative(REPO_ROOT, absPath);
      try {
        const chunks = await indexFile(pool, absPath, relPath);
        if (chunks > 0) {
          totalChunks += chunks;
          indexedFiles++;
          if (!singleFile) process.stderr.write(`[SCS] ${relPath}: ${chunks} chunks\n`);
        } else {
          skippedFiles++;
        }
      } catch (err) {
        process.stderr.write(`[SCS] SKIP ${relPath}: ${err instanceof Error ? err.message : err}\n`);
        skippedFiles++;
      }
    }

    const countRes = await pool.query(`SELECT COUNT(*)::int AS n FROM code_embeddings`);
    console.log(JSON.stringify({
      indexed_files: indexedFiles,
      skipped_files: skippedFiles,
      new_chunks: totalChunks,
      total_rows: countRes.rows[0].n,
    }));
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('[SCS] FATAL:', err);
  process.exit(1);
});
