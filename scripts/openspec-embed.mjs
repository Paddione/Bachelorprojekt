#!/usr/bin/env node
// scripts/openspec-embed.mjs — Write-CLI: indexes one OpenSpec change (proposal/tasks/spec)
// into knowledge.chunks via TEI embeddings. Best-effort: logs errors, exits 0.
//   node scripts/openspec-embed.mjs --slug <slug> [--dry-run]
// Chunking/frontmatter helpers are pure and duplicated from website/src/lib/chunking.ts
// (an ESM script cannot import the TS src/ tree).

import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

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

function sectionTitleOf(section) {
  const line = section.split('\n').find((l) => /^#{1,6}\s/.test(l));
  return line ? line.replace(/^#{1,6}\s+/, '').trim() : '';
}

function splitByTokenBudget(text, target, overlap) {
  const charPerTok = 4;
  const targetChars = target * charPerTok;
  const overlapChars = overlap * charPerTok;
  const out = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + targetChars, text.length);
    if (end < text.length) {
      const slice = text.slice(end - 100, end);
      const idx = slice.lastIndexOf(' ');
      if (idx >= 0) end = end - 100 + idx;
    }
    out.push(text.slice(cursor, end).trim());
    if (end >= text.length) break;
    cursor = Math.max(end - overlapChars, cursor + 1);
  }
  return out;
}

export function chunkProposal(body) {
  return [{ position: 0, text: body.trim(), sectionTitle: '', charOffset: 0 }];
}

export function chunkSections(body, opts = {}) {
  const target = opts.targetTokens ?? 400;
  const overlap = opts.overlapTokens ?? 50;
  const out = [];
  let pos = 0;
  const lines = body.split('\n');
  const sections = [];
  let buf = '';
  let bufOffset = 0;
  let runningOffset = 0;
  for (const line of lines) {
    const isHeading = /^#{1,3}\s/.test(line);
    if (isHeading && buf.length > 0) {
      sections.push({ text: buf, offset: bufOffset });
      buf = '';
      bufOffset = runningOffset;
    }
    if (buf.length === 0) bufOffset = runningOffset;
    buf += line + '\n';
    runningOffset += line.length + 1;
  }
  if (buf.length > 0) sections.push({ text: buf, offset: bufOffset });

  for (const sec of sections) {
    const title = sectionTitleOf(sec.text);
    if (approxTokens(sec.text) <= target) {
      out.push({ position: pos++, text: sec.text.trim(), sectionTitle: title, charOffset: sec.offset });
    } else {
      for (const piece of splitByTokenBudget(sec.text, target, overlap)) {
        out.push({ position: pos++, text: piece, sectionTitle: title, charOffset: sec.offset });
      }
    }
  }
  return out;
}

// main() is fleshed out in Task 2; guard keeps the module importable by tests.

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
  return out;
}

function readIfExists(p) {
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function vecLiteral(v) {
  return `[${v.join(',')}]`;
}

const DEFAULT_EMBED_URL = () =>
  process.env.LLM_EMBED_URL ?? 'http://llm-gateway-embed.workspace.svc.cluster.local:8081';

async function defaultEmbed(texts) {
  const model = resolveEmbeddingModel();
  const r = await fetch(`${DEFAULT_EMBED_URL()}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-LLM-Purpose': 'index' },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!r.ok) throw new Error(`embed ${r.status} ${await r.text().catch(() => '')}`);
  const j = await r.json();
  return j.data.map((d) => d.embedding);
}

export async function embedSlug({ slug, repoRoot, dryRun = false, deps = {} }) {
  const log = deps.log ?? ((...a) => console.error('[openspec-embed]', ...a));
  const embed = deps.embed ?? defaultEmbed;
  const model = resolveEmbeddingModel();

  const changeDir = path.join(repoRoot, 'openspec', 'changes', slug);
  const files = {
    proposal: readIfExists(path.join(changeDir, 'proposal.md')) ?? undefined,
    tasks: readIfExists(path.join(changeDir, 'tasks.md')) ?? undefined,
    spec: readIfExists(path.join(changeDir, 'specs', `${slug}.md`)) ?? undefined,
  };
  if (files.proposal == null && files.tasks == null && files.spec == null) {
    log(`no OpenSpec files for slug '${slug}' under ${changeDir}; nothing to index`);
    return { inserted: 0, dryRun };
  }

  const meta = stripFrontmatter(files.tasks ?? files.proposal ?? '').frontmatter;
  const ticketId = meta.ticket_id ?? null;
  const status = meta.status ?? null;
  const chunks = buildChunks(files);

  if (dryRun) {
    log(`[dry-run] slug='${slug}' model=${model} would index ${chunks.length} chunks (ticket=${ticketId} status=${status})`);
    return { inserted: 0, dryRun: true };
  }

  let pool = null;
  let query = deps.query;
  if (!query) {
    const conn = process.env.SESSIONS_DATABASE_URL || process.env.DATABASE_URL;
    if (!conn) { log('no SESSIONS_DATABASE_URL/DATABASE_URL set; skipping'); return { inserted: 0, dryRun: false }; }
    pool = new pg.Pool({ connectionString: conn });
    query = (sql, params) => pool.query(sql, params);
  }

  try {
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
       JSON.stringify({ slug, ticket_id: ticketId, status })],
    );
    const documentId = docRes.rows[0].id;

    const vectors = await embed(chunks.map((c) => c.text));
    let inserted = 0;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      await query(
        `INSERT INTO knowledge.chunks (document_id, collection_id, position, text, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [documentId, collectionId, c.position, c.text, vecLiteral(vectors[i]),
         JSON.stringify({ slug, ticket_id: ticketId, status, file_type: c.fileType, section_title: c.sectionTitle, char_offset: c.charOffset })],
      );
      inserted++;
    }
    await query(`UPDATE knowledge.collections SET last_indexed_at = now() WHERE source = 'specs_plans'`, []);
    log(`indexed slug='${slug}': ${inserted} chunks (model=${model})`);
    return { inserted, dryRun: false };
  } finally {
    if (pool) await pool.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  let slug = '';
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--slug') slug = args[++i] ?? '';
    else if (args[i] === '--dry-run') dryRun = true;
  }
  if (!slug) { console.error('[openspec-embed] --slug <slug> required'); process.exit(0); }
  const repoRoot = process.env.OPENSPEC_EMBED_REPO
    || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  try {
    await embedSlug({ slug, repoRoot, dryRun });
  } catch (err) {
    console.error('[openspec-embed] best-effort failure (exit 0):', err?.message ?? err);
  }
  process.exit(0); // best-effort: never break the OpenSpec lifecycle
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
