#!/usr/bin/env tsx
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, extname, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import pg from 'pg';
// T002315: Chunking liegt in scripts/lib/scs-chunking.ts. Re-Export, damit
// scripts/index-repo.test.ts und andere Aufrufer ihren Importpfad behalten.
import { chunkCode } from './lib/scs-chunking.js';
export { estimateTokens, chunkCode, chunkYaml, chunkSource } from './lib/scs-chunking.js';

const { Pool } = pg;

const REPO_ROOT = resolve(import.meta.dirname ?? process.cwd(), '..');
const EMBED_DIM = 1024;
const BATCH_SIZE = 16;



// Helm-Renders und vergleichbare generierte Mega-Manifeste. Sie gehoeren nicht
// in einen semantischen CODE-Index: sie sind Ausgabe, nicht Quelle, und
// kube-prometheus-stack-rendered.yaml allein ist 5 MB.
const IGNORE_FILE_PATTERNS: RegExp[] = [/-rendered\.ya?ml$/];

const IGNORE_DIRS = new Set([
  'node_modules', 'dist', '.git', 'docs-content-built',
  'k3d/docs-content-built', '.svelte-kit', '.astro', 'build',
  // T002259: dev-flow arbeitet in .worktrees/<slug>. Ohne diesen Eintrag
  // indexiert walkDir jeden gleichzeitig existierenden Worktree als weitere
  // Voll-Kopie des Repos — Duplikate unter fremden Pfaden in
  // code_embeddings, Treffer aus Feature-Branches konkurrieren mit main,
  // und die Laufzeit vervielfacht sich (ein DB-Roundtrip pro Datei).
  '.worktrees',
]);

const INDEXABLE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.svelte', '.astro',
  '.yaml', '.yml', '.sh', '.bash', '.mjs', '.mts',
]);

// This script runs both in-cluster (CronJob) and on a developer's host (git hook,
// `task scs:index`) where cluster-internal DNS never resolves. Resolve the
// cluster hostname once; on failure fall back to the local dev stack
// (llama-server embedding pool direct on :8095, port-forwarded/local Postgres)
// instead of silently hanging or failing every commit. Explicit env vars always win.
async function clusterDnsResolves(hostname: string): Promise<boolean> {
  try {
    await dnsLookup(hostname);
    return true;
  } catch {
    return false;
  }
}

// T002292 — eine explizit gesetzte LLM_EMBED_URL wurde bisher ungeprueft
// uebernommen ("Explicit env vars always win"). environments/mentolder.yaml
// setzt sie auf den cluster-internen DNS-Namen, der auf dem WSL-Host nicht
// aufloest — dadurch scheiterte JEDER embedTexts()-Aufruf und der Indexer lief
// mit Exit 0 durch, ohne etwas zu schreiben. Jede HTTP-Antwort zaehlt als
// erreichbar; nur Transportfehler und Timeout zaehlen als nicht erreichbar.
async function endpointReachable(url: string): Promise<boolean> {
  try {
    await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

let EMBED_URL: string;
let EMBED_MODEL: string;

async function resolveEmbedConfig(): Promise<void> {
  // T002258: was llm-gateway-lmstudio:1234 (LM Studio). bge-m3 moved to a
  // dedicated llama-server, and LM Studio is gone. T002551: the host-local
  // llama-server (was :8095) is decommissioned; the Service in k3d/llm-gpu.yaml
  // is `llm-gateway-embed` on port 8081 (T002570 corrected the stale :8095
  // fallback references below).
  const clusterHost = 'llm-gateway-embed.workspace.svc.cluster.local';
  const localUrl = 'http://localhost:8081';
  const configured = process.env.LLM_EMBED_URL;

  if (configured && await endpointReachable(configured)) {
    EMBED_URL = configured;
  } else {
    if (configured) {
      process.stderr.write(
        `[SCS] WARN LLM_EMBED_URL=${configured} ist nicht erreichbar — `
        + `faellt auf ${localUrl} zurueck (T002292).\n`,
      );
    }
    EMBED_URL = (await endpointReachable(localUrl))
      ? localUrl
      : (await clusterDnsResolves(clusterHost)) ? `http://${clusterHost}:8081` : localUrl;
  }
  // llama-server serves a single model and ignores the `model` field, so this
  // is cosmetic there — it still matters for any OpenAI-compatible router in
  // front. Keep it aligned with website/src/lib/embeddings.ts ('bge-m3').
  EMBED_MODEL = process.env.LLM_EMBED_MODEL ?? 'bge-m3';
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

// T002292 — Fehler, die niemals datei-spezifisch sein koennen.
//
// main() fing bisher JEDEN Fehler pro Datei und verbuchte ihn als SKIP. Damit
// wurden zwei globale Stoerungen unsichtbar: eine unerreichbare Embed-URL und
// ein abgerissener port-forward auf shared-db. Beide entwerten den GESAMTEN
// Lauf — sie muessen hart abbrechen, nicht 4772-mal still uebersprungen werden.
// Ein HTTP 500 des Embedding-Servers dagegen betrifft genau einen zu langen
// Chunk (T002266) und bleibt zu Recht ein SKIP.
const INFRA_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT', 'EPIPE',
]);

// undici verpackt Socket-Fehler in ein nacktes "fetch failed"; pg meldet einen
// weggebrochenen Pool als Klartext ohne .code.
const INFRA_ERROR_MESSAGES = [
  'fetch failed',
  'Connection terminated',
  'timeout exceeded when trying to connect',
  // Nachtrag T002292: Beim Pod-Replace meldet Postgres eine Abfolge, die VOR
  // dem Socket-Fehler kommt und keinen .code traegt. Gemessen 2026-07-27:
  // erst 1x "terminating connection due to administrator command" (SIGTERM),
  // dann 9x "the database system is shutting down", erst danach ECONNREFUSED.
  // Ohne diese Muster liefen die ersten Dateien nach jedem Replace als
  // per-Datei-SKIP durch — also genau die Maskierung, die dieser Fix abstellt.
  'terminating connection due to administrator command',
  'the database system is shutting down',
  'the database system is starting up',
];

export function isInfrastructureError(err: unknown, depth = 0): boolean {
  // Nicht-Error-Werte (null, Strings) sind nie eine Diagnose — sonst wuerde ein
  // Dateiinhalt, der zufaellig "ECONNREFUSED" enthaelt, den Lauf abbrechen.
  if (depth > 5 || !(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (typeof code === 'string' && INFRA_ERROR_CODES.has(code)) return true;
  if (INFRA_ERROR_MESSAGES.some(m => err.message.includes(m))) return true;
  // Der echte Socket-Code steckt bei fetch eine Ebene tiefer in .cause.
  const cause = (err as { cause?: unknown }).cause;
  return cause != null && isInfrastructureError(cause, depth + 1);
}

function walkDir(dir: string, out: string[] = []): string[] {
  let entries: import('node:fs').Dirent[];
  try { entries = readdirSync(dir, { withFileTypes: true }) as import('node:fs').Dirent[]; } catch { return out; }
  for (const e of entries) {
    if (IGNORE_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walkDir(full, out);
    else if (
      e.isFile()
      && INDEXABLE_EXTS.has(extname(e.name))
      && !IGNORE_FILE_PATTERNS.some(re => re.test(e.name))
    ) out.push(full);
  }
  return out;
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
  // T002315: Die Pruefung lief frueher ueber `indexname LIKE '%ivfflat%'` und
  // traf damit NIE zu: Postgres benennt einen namenlosen CREATE INDEX nach der
  // Tabelle und Spalte (code_embeddings_embedding_idx, _idx1, _idx2 …), nie
  // nach der Zugriffsmethode. Jeder Lauf legte deshalb einen weiteren Index an
  // — am 2026-07-27 lagen drei identische ivfflat-Indizes auf der Tabelle, die
  // jeden INSERT verdreifachten. Jetzt wird ueber pg_index/relam geprueft, also
  // ueber die tatsaechliche Zugriffsmethode statt ueber den Namen.
  const idxCheck = await pool.query(
    `SELECT 1 FROM pg_index i
       JOIN pg_class c ON c.oid = i.indexrelid
       JOIN pg_am am ON am.oid = c.relam
      WHERE i.indrelid = 'code_embeddings'::regclass
        AND am.amname IN ('hnsw', 'ivfflat')
      LIMIT 1`
  );
  if (idxCheck.rows.length === 0) {
    const countRes = await pool.query(`SELECT COUNT(*)::int AS n FROM code_embeddings`);
    if (countRes.rows[0].n >= 100) {
      // HNSW statt ivfflat (T002315): bei ~18.5k Vektoren lieferte ivfflat mit
      // lists=100 spuerbar schlechteren Recall — die Faustregel waere rows/1000
      // gewesen, der Wert war also fuer den gewachsenen Bestand zu niedrig.
      // HNSW braucht diese Kalibrierung nicht, bleibt beim Wachsen gueltig und
      // baute den Bestand in 20 Sekunden auf.
      await pool.query(
        `CREATE INDEX code_embeddings_embedding_hnsw ON code_embeddings
           USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`);
    }
  }
}

// T002315: Frueher lief hier ein eigener INSERT — und damit ein eigener
// Netzwerk-Roundtrip — pro Chunk. Gemessen am 2026-07-27: ~30 ms je Roundtrip,
// bei 18.549 Chunks also rund neun Minuten reine Wartezeit. Das Einbetten
// derselben Menge dauert auf der GPU ~110 Sekunden. Der Flaschenhals lag also
// nie beim Modell, sondern in dieser Schleife. Mit gebuendelten Inserts sank
// der Voll-Lauf auf 158 Sekunden.
const INSERT_BATCH = 200;

async function upsertFile(pool: pg.Pool, filePath: string, fileHash: string, chunks: string[], embeddings: number[][]): Promise<void> {
  await pool.query(`DELETE FROM code_embeddings WHERE file_path = $1`, [filePath]);
  for (let start = 0; start < chunks.length; start += INSERT_BATCH) {
    const slice = chunks.slice(start, start + INSERT_BATCH);
    const values = slice.map((_, i) =>
      `($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`).join(',');
    const params: unknown[] = [];
    slice.forEach((chunk, i) =>
      params.push(filePath, start + i, chunk, fileHash, vecLiteral(embeddings[start + i])));
    await pool.query(
      `INSERT INTO code_embeddings (file_path, chunk_index, content, file_hash, embedding)
       VALUES ${values}`, params);
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
  // T002315: NUL-Bytes sind in einer TEXT-Spalte strukturell unzulaessig —
  // Postgres lehnt sie mit "invalid byte sequence for encoding UTF8: 0x00" ab,
  // unabhaengig vom Encoding. Betroffen sind generierte und minifizierte
  // Dateien (2026-07-27: scripts/docs-gen/graph-data.mjs und graph-layout.mjs).
  // Vorher aussortieren statt sie am INSERT scheitern zu lassen: der Fehler ist
  // vorhersagbar und keine Diagnose wert.
  if (content.indexOf('\u0000') !== -1) return 0;
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
    // T002292: bisher zaehlte EIN Zaehler beides — unveraenderte Dateien (der
    // Hash-Skip in indexFile() gibt 0 zurueck) UND fehlgeschlagene. Dadurch sah
    // die Abschluss-JSON eines komplett kaputten Laufs genauso aus wie die eines
    // gesunden No-op-Laufs.
    let unchangedFiles = 0;
    let failedFiles = 0;

    // T002315: Der Embedding-Server bedient mehrere Anfragen gleichzeitig
    // (llama-server meldet seine Slots unter /props als total_slots). Gemessen
    // am 2026-07-27: mit 4 Workern lief ein Voll-Index von 18.549 Chunks in
    // 158 Sekunden statt in Stunden.
    //
    // Default ist trotzdem 1: der Regelfall ist der inkrementelle Lauf aus dem
    // git-Hook oder mit --file, bei dem Nebenlaeufigkeit nichts bringt und die
    // Ausgabe nur verschachtelt. SCS_WORKERS=4 lohnt beim Voll-Neuaufbau.
    const workers = Math.max(1, Number(process.env.SCS_WORKERS ?? 1));

    const indexOne = async (absPath: string): Promise<void> => {
      const relPath = relative(REPO_ROOT, absPath);
      try {
        const chunks = await indexFile(pool, absPath, relPath);
        if (chunks > 0) {
          totalChunks += chunks;
          indexedFiles++;
          if (!singleFile) process.stderr.write(`[SCS] ${relPath}: ${chunks} chunks\n`);
        } else {
          unchangedFiles++;
        }
      } catch (err) {
        if (isInfrastructureError(err)) {
          process.stderr.write(
            `[SCS] FATAL bei ${relPath}: ${err instanceof Error ? err.message : err}\n`
            + `[SCS] embed=${EMBED_URL} pghost=${pool.options.host}:${pool.options.port} — `
            + `Endpunkt nicht erreichbar, Lauf nach ${indexedFiles} indexierten Dateien abgebrochen.\n`,
          );
          throw err;
        }
        process.stderr.write(`[SCS] SKIP ${relPath}: ${err instanceof Error ? err.message : err}\n`);
        failedFiles++;
      }
    };

    if (workers === 1) {
      for (const absPath of files) await indexOne(absPath);
    } else {
      // Round-Robin statt zusammenhaengender Bloecke: grosse YAML-Manifeste und
      // kleine Quelldateien liegen verzeichnisweise beieinander, ein blockweises
      // Aufteilen liefe deshalb unausgewogen.
      const shards: string[][] = Array.from({ length: workers }, () => []);
      files.forEach((f, i) => shards[i % workers].push(f));
      await Promise.all(shards.map(async shard => {
        for (const absPath of shard) await indexOne(absPath);
      }));
    }

    const countRes = await pool.query(`SELECT COUNT(*)::int AS n FROM code_embeddings`);
    console.log(JSON.stringify({
      indexed_files: indexedFiles,
      unchanged_files: unchangedFiles,
      failed_files: failedFiles,
      new_chunks: totalChunks,
      total_rows: countRes.rows[0].n,
    }));
  } finally {
    await pool.end();
  }
}

// T002266: main() lief bisher beim Modulladen, wodurch die Datei nicht
// importierbar war — ein Unit-Test der Chunk-Logik haette eine DB-Verbindung
// aufgebaut und den ganzen Index angefasst. Der Guard prueft, ob die Datei als
// Skript aufgerufen wurde. Unter `npx tsx scripts/index-repo.ts` ist argv[1]
// der Pfad dieser Datei; importiert ein Test-Runner sie, zeigt argv[1] auf
// dessen Entrypoint und main() bleibt aus. Das CLI-Verhalten ist unveraendert.
const invokedAsScript = /(^|[\\/])index-repo\.ts$/.test(process.argv[1] ?? '');
if (invokedAsScript) {
  main().catch(err => {
    console.error('[SCS] FATAL:', err);
    process.exit(1);
  });
}
