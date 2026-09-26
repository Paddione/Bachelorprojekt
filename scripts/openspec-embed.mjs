#!/usr/bin/env node
// scripts/openspec-embed.mjs — Write-CLI: indexes OpenSpec changes & specs/docs
// into knowledge.chunks via TEI embeddings. Best-effort: logs errors, exits 0.
//   node scripts/openspec-embed.mjs --slug <slug> [--dry-run]
//   node scripts/openspec-embed.mjs --path <path> --source <specs_ssot|docs>
//   node scripts/openspec-embed.mjs --all-specs | --all-docs | --migrate-changes

import pg from 'pg';
import crypto from 'node:crypto';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CHUNK_MAX_TOKENS,
  CHUNK_OVERLAP,
  CHARS_PER_TOKEN,
  chunkMarkdown,
  estimateTokens,
} from './lib/scs-chunking.ts';

export function stripFrontmatter(raw) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!m) return { body: raw, frontmatter: {} };
  const frontmatter = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line.trim());
    if (kv) frontmatter[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { body: raw.slice(m[0].length).replace(/^\n+/, ''), frontmatter };
}

export function approxTokens(s) {
  return Math.ceil(s.length / 4);
}

export const ACTIVE_STATUSES = ['planning', 'plan_staged', 'active'];

export const SOURCE_DEFS = {
  specs_ssot: {
    collection: 'OpenSpec SSOT Specs',
    glob: 'openspec/specs/*.md',
  },
  docs: {
    collection: 'Repo Docs',
    globs: ['docs/adr/*.md', 'docs/runbooks/*.md'],
  },
};

export function parsePartialManifest(tasksMd) {
  const lines = tasksMd.split('\n');
  let inTable = false;
  const rows = [];
  for (const line of lines) {
    if (/^## Partials/.test(line)) { inTable = true; continue; }
    if (!inTable) continue;
    if (/^## /.test(line)) break;
    if (/^\|/.test(line)) {
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (cells.length >= 4 && !cells[0].includes('---') && cells[0].toLowerCase() !== 'id') {
        rows.push({
          partialId: cells[0],
          role: cells[2] || '',
          targetFiles: cells[3] ? cells[3].split(',').map(s => s.trim().replace(/`/g, '')).filter(s => s !== '—' && s !== '') : [],
          dependsOn: cells[4] ? cells[4].split(',').map(s => s.trim().replace(/`/g, '')).filter(s => s !== '—' && s !== '') : [],
        });
      }
    }
  }
  return rows;
}

export function listLocalActivePlans(repoRoot) {
  const changesDir = path.join(repoRoot, 'openspec', 'changes');
  if (!existsSync(changesDir)) return [];
  const activeSlugs = [];
  for (const slug of readdirSync(changesDir)) {
    if (slug === 'archive') continue;
    const tasksPath = path.join(changesDir, slug, 'tasks.md');
    if (!existsSync(tasksPath)) continue;
    const raw = readFileSync(tasksPath, 'utf8');
    const { frontmatter } = stripFrontmatter(raw);
    if (ACTIVE_STATUSES.includes(frontmatter.status)) activeSlugs.push(slug);
  }
  return activeSlugs;
}

export function countLocalActivePlans(repoRoot) {
  return listLocalActivePlans(repoRoot).length;
}

export function computeCoverageGap(localActiveSlugs, indexedSlugs) {
  const indexed = new Set(indexedSlugs);
  const missing = localActiveSlugs.filter((s) => !indexed.has(s));
  const total = localActiveSlugs.length;
  return {
    missing,
    missingCount: missing.length,
    total,
    coverageRatio: total === 0 ? 0 : (total - missing.length) / total,
  };
}

export function completenessGateMessage(gap, tolerance = 0.10) {
  const { total, missingCount, missing } = gap;
  if (total === 0) return 'completeness gate OK — no local active plans to cover';
  const pct = Math.round(tolerance * 100);
  if (gap.coverageRatio < 1 - tolerance) {
    return `WARN: completeness gate — collection covers ${total - missingCount}/${total} local active plans, missing ${missingCount} (> ${pct}% tolerance, status=${ACTIVE_STATUSES.join('|')}): ${missing.join(', ')}`;
  }
  return `completeness gate OK — collection covers ${total - missingCount}/${total} local active plans (missing ${missingCount} within ${pct}% tolerance)`;
}

export function chunkProposal(body, opts = {}) {
  const chunks = chunkMarkdown(body, opts);
  return chunks.map((c, i) => ({
    position: i,
    text: c.text,
    sectionTitle: c.title,
    charOffset: c.charOffset,
  }));
}

export function chunkSections(body, opts = {}) {
  const chunks = chunkMarkdown(body, opts);
  return chunks.map((c, i) => ({
    position: i,
    text: c.text,
    sectionTitle: c.title,
    charOffset: c.charOffset,
  }));
}

export function resolveEmbeddingModel() {
  return process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2';
}

export function buildChunks(files) {
  const out = [];
  let pos = 0;
  if (files.proposal != null) {
    for (const c of chunkProposal(stripFrontmatter(files.proposal).body)) {
      out.push({ ...c, position: pos++, fileType: 'proposal' });
    }
  }
  if (files.tasks != null) {
    for (const c of chunkSections(stripFrontmatter(files.tasks).body)) {
      out.push({ ...c, position: pos++, fileType: 'task_section' });
    }
  }
  if (files.spec != null) {
    for (const c of chunkSections(stripFrontmatter(files.spec).body)) {
      out.push({ ...c, position: pos++, fileType: 'spec_section' });
    }
  }
  if (files.partials != null) {
    for (const [partialId, content] of Object.entries(files.partials)) {
      const chunks = chunkMarkdown(content);
      for (const c of chunks) {
        out.push({
          position: pos++,
          text: c.text,
          sectionTitle: partialId,
          charOffset: c.charOffset,
          fileType: 'partial',
        });
      }
    }
  }
  return out;
}

function readIfExists(p) {
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function vecLiteral(v) {
  return `[${v.join(',')}]`;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

const DEFAULT_EMBED_URL = () =>
  process.env.LLM_EMBED_URL ?? 'http://llm-gateway-embed.workspace.svc.cluster.local:8081';

const embedFetchTimeoutMs = () => Number(process.env.OPENSPEC_EMBED_FETCH_TIMEOUT_MS ?? 60_000);
const dbConnectTimeoutMs = () => Number(process.env.OPENSPEC_EMBED_DB_CONNECT_TIMEOUT_MS ?? 10_000);

export async function defaultEmbed(texts) {
  const model = resolveEmbeddingModel();
  const batchSize = Number(process.env.OPENSPEC_EMBED_BATCH_SIZE ?? 5);
  const embeddings = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const r = await fetch(`${DEFAULT_EMBED_URL()}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'X-LLM-Purpose': 'index',
        ...(process.env.LLM_PROXY_ADMIN_TOKEN ? { Authorization: `Bearer ${process.env.LLM_PROXY_ADMIN_TOKEN}` } : {}),
      },
      body: JSON.stringify({ model, input: batch }),
      signal: AbortSignal.timeout(embedFetchTimeoutMs()),
    });
    if (!r.ok) throw new Error(`embed ${r.status} ${await r.text().catch(() => '')}`);
    const j = await r.json();
    for (const d of j.data) {
      embeddings.push(d.embedding);
    }
  }
  return embeddings;
}

export function estimateSlugTokenWorst(slug, repoRoot) {
  const changeDir = path.join(repoRoot, 'openspec', 'changes', slug);
  const files = {
    proposal: readIfExists(path.join(changeDir, 'proposal.md')) ?? undefined,
    tasks: readIfExists(path.join(changeDir, 'tasks.md')) ?? undefined,
    spec: readIfExists(path.join(changeDir, 'specs', `${slug}.md`)) ?? undefined,
  };
  let partials = null;
  const tasksDir = path.join(changeDir, 'tasks.d');
  if (existsSync(tasksDir)) {
    partials = {};
    for (const entry of readdirSync(tasksDir).filter(f => f.endsWith('.md')).sort()) {
      partials[entry.replace(/\.md$/, '')] = readFileSync(path.join(tasksDir, entry), 'utf8');
    }
  }
  files.partials = partials;
  if (files.proposal == null && files.tasks == null && files.spec == null && partials == null) return null;

  let maxTokens = 0;
  let maxType = null;
  const splitChunks = buildChunks({ proposal: files.proposal, tasks: files.tasks, spec: files.spec });
  for (const c of splitChunks) {
    const t = approxTokens(c.text);
    if (t > maxTokens) { maxTokens = t; maxType = c.fileType; }
  }
  if (files.partials != null) {
    for (const [, content] of Object.entries(files.partials)) {
      const t = approxTokens(content);
      if (t > maxTokens) { maxTokens = t; maxType = 'partial'; }
    }
  }
  if (maxTokens === 0) return null;
  return { tokens: maxTokens, fileType: maxType };
}

function isConnectFailure(err) {
  const code = err?.code ?? '';
  return code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT'
    || /timeout/i.test(err?.message ?? '');
}

function resolveDb(deps, log) {
  if (deps.query) return { query: deps.query, end: async () => {} };
  const conn = process.env.SESSIONS_DATABASE_URL || process.env.DATABASE_URL;
  if (!conn) {
    log('no SESSIONS_DATABASE_URL/DATABASE_URL set; skipping');
    return null;
  }
  const pool = new pg.Pool({ connectionString: conn, connectionTimeoutMillis: dbConnectTimeoutMs() });
  pool.on('error', (err) => {
    if (isConnectFailure(err)) {
      const port = conn.match(/:(\d+)\//)?.[1] ?? '?';
      log(`WARN: DB-Verbindung auf Port ${port} zurueckgewiesen (${err.code ?? err.message}) — vermutlich Port-Kollision (k3d-Portforward 15432 belegt).`);
    } else if (err) {
      log(`WARN: DB-Verbindungsfehler: ${err.code ?? err.message}`);
    }
  });
  return { query: (sql, params) => pool.query(sql, params), end: () => pool.end() };
}

// Single-Writer helper: exactly one place in the codebase inserts into knowledge.chunks
async function writeChunksToDb(query, documentId, collectionId, chunkItems, embed) {
  const batchSize = Number(process.env.OPENSPEC_EMBED_BATCH_SIZE ?? 6);
  const allTexts = chunkItems.map((c) => c.text);
  const vectors = [];
  for (let i = 0; i < allTexts.length; i += batchSize) {
    const batch = allTexts.slice(i, i + batchSize);
    const batchVectors = await embed(batch);
    vectors.push(...batchVectors);
  }
  let inserted = 0;
  for (let i = 0; i < chunkItems.length; i++) {
    const c = chunkItems[i];
    await query(
      `INSERT INTO knowledge.chunks (document_id, collection_id, position, text, embedding, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [documentId, collectionId, c.position, c.text, vecLiteral(vectors[i]), JSON.stringify(c.metadata)],
    );
    inserted++;
  }
  return inserted;
}

export async function embedSlug({ slug, repoRoot, dryRun = false, deps = {} }) {
  const log = deps.log ?? ((...a) => console.error('[openspec-embed]', ...a));
  const embed = deps.embed ?? defaultEmbed;
  const model = resolveEmbeddingModel();

  const changeDir = path.join(repoRoot || '.', 'openspec', 'changes', slug);
  const files = {
    proposal: readIfExists(path.join(changeDir, 'proposal.md')) ?? undefined,
    tasks: readIfExists(path.join(changeDir, 'tasks.md')) ?? undefined,
    spec: readIfExists(path.join(changeDir, 'specs', `${slug}.md`)) ?? undefined,
  };

  const tasksDir = path.join(changeDir, 'tasks.d');
  let partials = null;
  if (existsSync(tasksDir)) {
    partials = {};
    const entries = readdirSync(tasksDir).filter(f => f.endsWith('.md')).sort();
    for (const entry of entries) {
      partials[entry.replace(/\.md$/, '')] = readFileSync(path.join(tasksDir, entry), 'utf8');
    }
  }
  files.partials = partials;

  if (files.proposal == null && files.tasks == null && files.spec == null && partials == null) {
    log(`no OpenSpec files for slug '${slug}' under ${changeDir}; nothing to index`);
    return { inserted: 0, dryRun };
  }

  const meta = stripFrontmatter(files.tasks ?? files.proposal ?? '').frontmatter;
  const ticketId = meta.ticket_id ?? null;
  const status = meta.status ?? null;
  const manifest = files.tasks ? parsePartialManifest(files.tasks) : [];
  const chunks = buildChunks(files);

  const rawAll = (files.proposal || '') + (files.tasks || '') + (files.spec || '') +
    (partials ? Object.values(partials).join('') : '');
  const fileHash = sha256(rawAll);

  const partialMeta = {};
  for (const m of manifest) partialMeta[m.partialId] = m;

  const chunkItems = chunks.map((c) => {
    const baseMeta = { slug, ticket_id: ticketId, status, file_type: c.fileType, section_title: c.sectionTitle, char_offset: c.charOffset };
    const partialFields = {};
    if (c.fileType === 'partial') {
      const m = partialMeta[c.sectionTitle];
      if (m) {
        partialFields.partial_id = m.partialId;
        partialFields.role = m.role;
        partialFields.target_files = m.targetFiles;
        partialFields.depends_on = m.dependsOn;
        partialFields.token_estimate = approxTokens(c.text);
      }
    }
    return { position: c.position, text: c.text, metadata: { ...baseMeta, ...partialFields } };
  });

  if (dryRun) {
    log(`[dry-run] slug='${slug}' model=${model} would index ${chunkItems.length} chunks (ticket=${ticketId} status=${status})`);
    return { inserted: 0, dryRun: true };
  }

  const db = resolveDb(deps, log);
  if (!db) return { inserted: 0, dryRun: false };

  try {
    const { query } = db;
    await query(
      `INSERT INTO knowledge.collections (name, source, brand, embedding_model)
       VALUES ('OpenSpec Specs & Plans', 'specs_plans', NULL, $1)
       ON CONFLICT (name) DO NOTHING`,
      [model],
    );
    const colRes = await query(
      `SELECT id FROM knowledge.collections WHERE source = 'specs_plans' LIMIT 1`,
      [],
    );
    const collectionId = colRes.rows[0]?.id;
    if (!collectionId) { log('specs_plans collection missing after upsert; skipping'); return { inserted: 0, dryRun: false }; }

    await query(`DELETE FROM knowledge.documents WHERE metadata->>'slug' = $1`, [slug]);
    const docRes = await query(
      `INSERT INTO knowledge.documents (collection_id, title, source_uri, raw_text, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
      [collectionId, slug, `openspec/changes/${slug}/proposal.md`, '',
       JSON.stringify({ slug, ticket_id: ticketId, status, file_hash: fileHash })],
    );
    const documentId = docRes.rows[0].id;

    const inserted = await writeChunksToDb(query, documentId, collectionId, chunkItems, embed);
    await query(`UPDATE knowledge.collections SET last_indexed_at = now() WHERE source = 'specs_plans'`, []);

    try {
      const slugRes = await query(
        `SELECT DISTINCT metadata->>'slug' AS slug FROM knowledge.documents WHERE collection_id = $1`,
        [collectionId],
      );
      const indexedSlugs = slugRes.rows.map((r) => r.slug);
      const localSlugs = listLocalActivePlans(repoRoot);
      const tolerance = Number(process.env.OPENSPEC_EMBED_COVERAGE_TOLERANCE ?? 0.10);
      log(completenessGateMessage(computeCoverageGap(localSlugs, indexedSlugs), tolerance));
    } catch (_) { /* best-effort */ }

    log(`indexed slug='${slug}': ${inserted} chunks (model=${model})`);
    return { inserted, dryRun: false };
  } finally {
    await db.end();
  }
}

export async function embedFile({ relPath, source, text, repoRoot, dryRun = false, deps = {} }) {
  const log = deps.log ?? ((...a) => console.error('[openspec-embed]', ...a));
  const embed = deps.embed ?? defaultEmbed;
  const model = resolveEmbeddingModel();

  const srcDef = SOURCE_DEFS[source];
  if (!srcDef) {
    log(`WARN: unknown source '${source}'; skipping`);
    return { inserted: 0, dryRun: false };
  }

  const rawText = text ?? (existsSync(path.join(repoRoot || '.', relPath))
    ? readFileSync(path.join(repoRoot || '.', relPath), 'utf8') : null);

  if (rawText == null) {
    log(`file not found: ${relPath}; skipping`);
    return { inserted: 0, dryRun: false };
  }

  const fileHash = sha256(rawText);
  const chunks = chunkMarkdown(rawText);

  const chunkItems = chunks.map((c, i) => ({
    position: i,
    text: c.text,
    metadata: {
      path: relPath,
      source,
      section_title: c.title,
      char_offset: c.charOffset,
      file_type: 'md_section',
    },
  }));

  if (dryRun) {
    log(`[dry-run] path='${relPath}' source='${source}' would index ${chunkItems.length} chunks`);
    return { inserted: 0, dryRun: true };
  }

  const db = resolveDb(deps, log);
  if (!db) return { inserted: 0, dryRun: false };

  try {
    const { query } = db;
    await query(
      `INSERT INTO knowledge.collections (name, source, brand, embedding_model)
       VALUES ($1, $2, NULL, $3)
       ON CONFLICT (name) DO NOTHING`,
      [srcDef.collection, source, model],
    );
    const colRes = await query(
      `SELECT id FROM knowledge.collections WHERE source = $1 LIMIT 1`,
      [source],
    );
    const collectionId = colRes.rows[0]?.id;
    if (!collectionId) { log(`collection for source '${source}' missing; skipping`); return { inserted: 0, dryRun: false }; }

    await query(`DELETE FROM knowledge.documents WHERE metadata->>'path' = $1`, [relPath]);
    const docRes = await query(
      `INSERT INTO knowledge.documents (collection_id, title, source_uri, raw_text, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
      [collectionId, path.basename(relPath), relPath, '',
       JSON.stringify({ path: relPath, source, file_hash: fileHash })],
    );
    const documentId = docRes.rows[0].id;

    const inserted = await writeChunksToDb(query, documentId, collectionId, chunkItems, embed);
    await query(`UPDATE knowledge.collections SET last_indexed_at = now() WHERE source = $1`, [source]);

    log(`indexed path='${relPath}': ${inserted} chunks (source=${source})`);
    return { inserted, dryRun: false };
  } finally {
    await db.end();
  }
}

export async function migrateChanges({ slugs, repoRoot, batch, deps = {}, dryRun = false }) {
  const log = deps.log ?? ((...a) => console.error('[openspec-embed]', ...a));
  const root = repoRoot || process.env.OPENSPEC_EMBED_REPO || '.';
  const candidateSlugs = slugs ?? listLocalActivePlans(root);
  const batchSize = batch ?? Number(process.env.OPENSPEC_EMBED_MIGRATE_BATCH || 25);

  let existingHashes = {};
  if (deps.hashStore) {
    existingHashes = deps.hashStore;
  } else {
    const db = resolveDb(deps, log);
    if (db) {
      try {
        const res = await db.query(
          `SELECT metadata->>'slug' AS slug, metadata->>'file_hash' AS file_hash
           FROM knowledge.documents d
           JOIN knowledge.collections c ON c.id = d.collection_id
           WHERE c.source = 'specs_plans'`,
          [],
        );
        for (const row of res.rows) {
          if (row.slug) existingHashes[row.slug] = row.file_hash;
        }
      } catch (_) { /* ignore */ }
      await db.end();
    }
  }

  const toEmbed = [];
  for (const slug of candidateSlugs) {
    const changeDir = path.join(root, 'openspec', 'changes', slug);
    const proposal = readIfExists(path.join(changeDir, 'proposal.md')) ?? '';
    const tasks = readIfExists(path.join(changeDir, 'tasks.md')) ?? '';
    const spec = readIfExists(path.join(changeDir, 'specs', `${slug}.md`)) ?? '';
    let partialText = '';
    const tasksDir = path.join(changeDir, 'tasks.d');
    if (existsSync(tasksDir)) {
      for (const entry of readdirSync(tasksDir).filter(f => f.endsWith('.md')).sort()) {
        partialText += readIfExists(path.join(tasksDir, entry)) ?? '';
      }
    }
    const currentHash = sha256(proposal + tasks + spec + partialText);
    if (!existingHashes[slug] || existingHashes[slug] !== currentHash) {
      toEmbed.push({ slug, currentHash });
    }
  }

  for (let i = 0; i < toEmbed.length; i += batchSize) {
    const chunk = toEmbed.slice(i, i + batchSize);
    for (const { slug, currentHash } of chunk) {
      await embedSlug({ slug, repoRoot: root, dryRun, deps });
      if (deps.recordEmbed) deps.recordEmbed(slug);
      if (deps.hashStore) deps.hashStore[slug] = currentHash;
    }
  }
}

function findMatchingFiles(dir, predicate) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(predicate).map(f => path.join(dir, f));
}

async function main() {
  const args = process.argv.slice(2);
  let slug = '';
  let filePath = '';
  let source = '';
  let dryRun = false;
  let checkCoverage = false;
  let countSkipped = false;
  let allSpecs = false;
  let allDocs = false;
  let doMigrate = false;
  let batchNum = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--slug') slug = args[++i] ?? '';
    else if (args[i] === '--path') filePath = args[++i] ?? '';
    else if (args[i] === '--source') source = args[++i] ?? '';
    else if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--check-coverage') checkCoverage = true;
    else if (args[i] === '--count-skipped') countSkipped = true;
    else if (args[i] === '--all-specs') allSpecs = true;
    else if (args[i] === '--all-docs') allDocs = true;
    else if (args[i] === '--migrate-changes') doMigrate = true;
    else if (args[i] === '--batch') batchNum = Number(args[++i] ?? 25);
    else if (args[i] === '--help') {
      console.log([
        'Usage: node scripts/openspec-embed.mjs --slug <slug> [--dry-run]',
        '       node scripts/openspec-embed.mjs --path <path> --source <specs_ssot|docs> [--dry-run]',
        '       node scripts/openspec-embed.mjs --all-specs [--dry-run]',
        '       node scripts/openspec-embed.mjs --all-docs [--dry-run]',
        '       node scripts/openspec-embed.mjs --migrate-changes [--batch <n>] [--dry-run]',
        '       node scripts/openspec-embed.mjs --check-coverage',
        '       node scripts/openspec-embed.mjs --count-skipped',
        '',
        '  --slug <slug>           Index one OpenSpec change into knowledge.chunks',
        '  --path <path>           Index single spec/doc file into knowledge.chunks',
        '  --source <source>       Source collection for --path: specs_ssot | docs',
        '  --all-specs             Index all openspec/specs/*.md into specs_ssot',
        '  --all-docs              Index docs/adr/*.md and docs/runbooks/*.md into docs',
        '  --migrate-changes       Migrate active changes incrementally via file_hash',
        '  --batch <n>             Batch size for --migrate-changes (default 25)',
        '  --dry-run               Print what would be indexed, do not write',
        '  --check-coverage        Print count of local active plans',
        '  --count-skipped         Count documents skipped due to context limit',
        '  --help                  This help',
        '',
        'Env:',
        '  OPENSPEC_EMBED_COVERAGE_TOLERANCE   Max allowed missing-fraction of local active plans',
        '                                     before the completeness gate fails (default 0.10 = 10%)',
      ].join('\n'));
      process.exit(0);
    }
  }

  const repoRoot = process.env.OPENSPEC_EMBED_REPO
    || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  if (countSkipped) {
    const CONTEXT_LIMIT = 2048;
    const PARTIAL_TOKEN_LIMIT = 7000;
    let contextSkips = 0;
    let otherSkips = 0;
    const skippedSlugs = [];
    const changesDir = path.join(repoRoot, 'openspec', 'changes');
    if (existsSync(changesDir)) {
      for (const entry of readdirSync(changesDir)) {
        if (entry === 'archive') continue;
        const tasksPath = path.join(changesDir, entry, 'tasks.md');
        if (!existsSync(tasksPath)) continue;
        const raw = readFileSync(tasksPath, 'utf8');
        const { frontmatter } = stripFrontmatter(raw);
        if (!ACTIVE_STATUSES.includes(frontmatter.status)) continue;
        const worst = estimateSlugTokenWorst(entry, repoRoot);
        if (worst === null) { otherSkips++; continue; }
        const limit = worst.fileType === 'partial' ? PARTIAL_TOKEN_LIMIT : CONTEXT_LIMIT;
        if (worst.tokens > limit) {
          contextSkips++;
          skippedSlugs.push(`${entry} (~${worst.tokens} tokens, ${worst.fileType ?? 'unknown'})`);
        }
      }
    }
    console.log(`skipped: ${contextSkips + otherSkips} documents (${contextSkips} context limit > ${CONTEXT_LIMIT} tokens, ${otherSkips} other reasons)`);
    for (const line of skippedSlugs) console.log(`  - ${line}`);
    console.log('Rebuild after context limit is resolved: task openspec:embed:backfill');
    process.exit(0);
  }

  if (checkCoverage) {
    const localCount = countLocalActivePlans(repoRoot);
    console.log(`Local active plans (status in ${JSON.stringify(ACTIVE_STATUSES)}): ${localCount}`);
    process.exit(0);
  }

  if (allSpecs) {
    const specsDir = path.join(repoRoot, 'openspec', 'specs');
    const files = findMatchingFiles(specsDir, f => f.endsWith('.md'));
    for (const f of files) {
      const rel = path.relative(repoRoot, f);
      await embedFile({ relPath: rel, source: 'specs_ssot', repoRoot, dryRun });
    }
    process.exit(0);
  }

  if (allDocs) {
    const adrFiles = findMatchingFiles(path.join(repoRoot, 'docs', 'adr'), f => f.endsWith('.md'));
    const rbFiles = findMatchingFiles(path.join(repoRoot, 'docs', 'runbooks'), f => f.endsWith('.md'));
    for (const f of [...adrFiles, ...rbFiles]) {
      const rel = path.relative(repoRoot, f);
      await embedFile({ relPath: rel, source: 'docs', repoRoot, dryRun });
    }
    process.exit(0);
  }

  if (doMigrate) {
    await migrateChanges({ repoRoot, batch: batchNum, dryRun });
    process.exit(0);
  }

  if (filePath && source) {
    try {
      await embedFile({ relPath: filePath, source, repoRoot, dryRun });
    } catch (err) {
      if (isConnectFailure(err)) {
        console.error(`[openspec-embed] WARN: Connect error (${err.message})`);
      }
      console.error('[openspec-embed] best-effort failure (exit 0):', err?.message ?? err);
    }
    process.exit(0);
  }

  if (!slug) { console.error('[openspec-embed] --slug <slug> required'); process.exit(0); }
  try {
    await embedSlug({ slug, repoRoot, dryRun });
  } catch (err) {
    if (isConnectFailure(err)) {
      if (/timeout/i.test(err?.message ?? '')) {
        console.error(`[openspec-embed] WARN: Connect-Timeout nach ${dbConnectTimeoutMs()} ms (${err.message}) — Port-Kollision vermutet (k3d-Portforward 15432 belegt), Portforward pruefen.`);
      } else {
        console.error(`[openspec-embed] WARN: Embed-Fehler wegen Verbindungsabbruch (${err.code}) — Portkonflikt/Portforward pruefen, nicht "embed failed" pauschal akzeptieren.`);
      }
    }
    console.error('[openspec-embed] best-effort failure (exit 0):', err?.message ?? err);
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
