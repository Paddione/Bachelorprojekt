#!/usr/bin/env node
// scripts/openspec-embed.mjs — Write-CLI: indexes one OpenSpec change (proposal/tasks/spec)
// into knowledge.chunks via TEI embeddings. Best-effort: logs errors, exits 0.
//   node scripts/openspec-embed.mjs --slug <slug> [--dry-run]
// [T002471-M8] Bei transienten Embedding-Backend-Fehlern werden nicht indexierte
// Slugs nicht automatisch nachgezogen. Fuer Backfill: task openspec:embed:backfill
// Chunking/frontmatter helpers are pure and duplicated from website/src/lib/chunking.ts
// (an ESM script cannot import the TS src/ tree).
// [T002877] Completeness gate: per-slug coverage of local active plans + tolerance (OPENSPEC_EMBED_COVERAGE_TOLERANCE, default 10%).

import pg from 'pg';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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

export const ACTIVE_STATUSES = ['planning', 'plan_staged', 'active'];

export function parsePartialManifest(tasksMd) {
  const lines = tasksMd.split('\n');
  let inTable = false;
  const rows = [];
  for (const line of lines) {
    if (/^## Partials/.test(line)) { inTable = true; continue; }
    if (!inTable) continue;
    if (/^## /.test(line)) break;  // next section
    if (/^\|/.test(line)) {
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      // Skip separator row (contains ---) and header row (first cell is 'id')
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

// Pure coverage computation — testable without DB (T002877).
// localActiveSlugs: slugs of locally active plans (status in ACTIVE_STATUSES)
// indexedSlugs:     slugs currently present in the specs_plans collection
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

// Builds the completeness-gate log line (T002877). tolerance is a fraction
// (0.10 = 10 %). Returns a string starting with 'WARN: completeness gate'
// when the missing share exceeds tolerance, else 'completeness gate OK'.
export function completenessGateMessage(gap, tolerance = 0.10) {
  const { total, missingCount, missing } = gap;
  if (total === 0) return 'completeness gate OK — no local active plans to cover';
  const pct = Math.round(tolerance * 100);
  if (gap.coverageRatio < 1 - tolerance) {
    return `WARN: completeness gate — collection covers ${total - missingCount}/${total} local active plans, missing ${missingCount} (> ${pct}% tolerance, status=${ACTIVE_STATUSES.join('|')}): ${missing.join(', ')}`;
  }
  return `completeness gate OK — collection covers ${total - missingCount}/${total} local active plans (missing ${missingCount} within ${pct}% tolerance)`;
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

export function chunkProposal(body, opts = {}) {
  const target = opts.targetTokens ?? 400;
  const overlap = opts.overlapTokens ?? 50;
  const trimmed = body.trim();
  if (approxTokens(trimmed) <= target) {
    return [{ position: 0, text: trimmed, sectionTitle: '', charOffset: 0 }];
  }
  return splitByTokenBudget(trimmed, target, overlap).map((text, i) => ({
    position: i,
    text,
    sectionTitle: '',
    charOffset: 0,
  }));

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
  if (files.partials != null) {
    for (const [partialId, content] of Object.entries(files.partials)) {
      // [T003268] Partials unterliegen demselben Token-Budget wie proposal/tasks —
      // legale Partials bis 7000 Token sprengten das Backend-Limit (2048/4096) und
      // endeten als 400 exceed_context_size. Jede Teil-Datei laeuft durch
      // splitByTokenBudget; die Manifest-Metadaten-Anreicherung (partialMeta)
      // adressiert Chunks weiterhin ueber sectionTitle=partialId.
      const trimmed = content.trim();
      if (approxTokens(trimmed) <= 400) {
        out.push({
          position: pos++,
          text: trimmed,
          sectionTitle: partialId,
          charOffset: 0,
          fileType: 'partial',
        });
      } else {
        for (const piece of splitByTokenBudget(trimmed, 400, 50)) {
          out.push({
            position: pos++,
            text: piece,
            sectionTitle: partialId,
            charOffset: 0,
            fileType: 'partial',
          });
        }
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

const DEFAULT_EMBED_URL = () =>
  process.env.LLM_EMBED_URL ?? 'http://llm-gateway-embed.workspace.svc.cluster.local:8081';

// T002913: ohne hartes Timeout haengt defaultEmbed fuer immer, wenn das Backend
// TCP akzeptiert aber nie antwortet (readiness=true bei totem Endpoint). Genau so
// blockierte der post-commit-embed-Hook den `git rebase` im Factory-Tick und damit
// den gesamten Dispatcher (flock gehalten, keine weiteren Ticks). Konfigurierbar,
// Default 60s — fuer den Hook-Kontext reicht das, ein laengeres Embedding duerfte
// ohnehin ein Symptom sein.
const embedFetchTimeoutMs = () => Number(process.env.OPENSPEC_EMBED_FETCH_TIMEOUT_MS ?? 60_000);

const dbConnectTimeoutMs = () =>
  Number(process.env.OPENSPEC_EMBED_DB_CONNECT_TIMEOUT_MS ?? 10_000); // Default 10s (D5)

export async function defaultEmbed(texts) {
  const model = resolveEmbeddingModel();
  const r = await fetch(`${DEFAULT_EMBED_URL()}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-LLM-Purpose': 'index' },
    body: JSON.stringify({ model, input: texts }),
    signal: AbortSignal.timeout(embedFetchTimeoutMs()),
  });
  if (!r.ok) throw new Error(`embed ${r.status} ${await r.text().catch(() => '')}`);
  const j = await r.json();
  return j.data.map((d) => d.embedding);
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
  // [T003268] Das Worst-Case-Token-Mass misst die UNGESPLITTETEN Partial-Dateien,
  // nicht die buildChunks-Ausgabe: seit partials token-budgetiert gesplittet
  // werden, waere der Maximal-Chunk sonst immer ~400 Token und der
  // plan-lint-Diagnose-Pfad (7000-Token-Cap, T002453-C) blind. Proposal/tasks/
  // spec bleiben auf den SPLIT-Chunks (sie werden ohnehin gebudget-splittet —
  // ein 2500-Token-Proposal ist kein Skip-Fall, T002839). Partials einzeln in
  // voller Laenge.
  let maxTokens = 0;
  let maxType = null;
  // proposal/tasks/spec: worst chunk aus dem (gesplitteten) buildChunks-Lauf.
  const splitChunks = buildChunks({ proposal: files.proposal, tasks: files.tasks, spec: files.spec });
  for (const c of splitChunks) {
    const t = approxTokens(c.text);
    if (t > maxTokens) { maxTokens = t; maxType = c.fileType; }
  }
  // partials: volle Dateilaenge je Datei.
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
    || /timeout/i.test(err?.message ?? ''); // pg-pool: 'Connection terminated due to connection timeout'; pg: 'timeout expired'
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

  // ---- tasks.d/ partials ----
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

  // Enrich partial chunks with manifest metadata
  const partialMeta = {};
  for (const m of manifest) {
    partialMeta[m.partialId] = m;
  }
  for (const c of chunks) {
    if (c.fileType === 'partial') {
      const m = partialMeta[c.sectionTitle];
      if (m) {
        c.partial_id = m.partialId;
        c.role = m.role;
        c.target_files = m.targetFiles;
        c.depends_on = m.dependsOn;
        c.token_estimate = approxTokens(c.text);
      }
    }
  }

  if (dryRun) {
    log(`[dry-run] slug='${slug}' model=${model} would index ${chunks.length} chunks (ticket=${ticketId} status=${status})`);
    return { inserted: 0, dryRun: true };
  }

  let pool = null;
  let query = deps.query;
  if (!query) {
    const conn = process.env.SESSIONS_DATABASE_URL || process.env.DATABASE_URL;
    if (!conn) { log('no SESSIONS_DATABASE_URL/DATABASE_URL set; skipping'); return { inserted: 0, dryRun: false }; }
    pool = new pg.Pool({ connectionString: conn, connectionTimeoutMillis: dbConnectTimeoutMs() });
    // [T003384] ECONNREFUSED/ECONNRESET beim Pool-Connect ist meist eine
    // Port-15432-Kollision (k3d-Portforward belegt) — die Ursache benennen statt
    // einen generischen Verbindungsfehler zu verschlucken.
    pool.on('error', (err) => {
      if (isConnectFailure(err)) {
        const port = conn.match(/:(\d+)\//)?.[1] ?? '?';
        log(`WARN: DB-Verbindung auf Port ${port} zurueckgewiesen (${err.code ?? err.message}) — vermutlich Port-Kollision (k3d-Portforward 15432 belegt).`);
      } else if (err) {
        log(`WARN: DB-Verbindungsfehler: ${err.code ?? err.message}`);
      }
    });
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
      const baseMeta = { slug, ticket_id: ticketId, status, file_type: c.fileType, section_title: c.sectionTitle, char_offset: c.charOffset };
      const partialFields = {};
      if (c.fileType === 'partial') {
        if (c.partial_id) partialFields.partial_id = c.partial_id;
        if (c.role) partialFields.role = c.role;
        if (c.target_files) partialFields.target_files = c.target_files;
        if (c.depends_on) partialFields.depends_on = c.depends_on;
        if (c.token_estimate) partialFields.token_estimate = c.token_estimate;
      }
      const mergedMeta = { ...baseMeta, ...partialFields };
      await query(
        `INSERT INTO knowledge.chunks (document_id, collection_id, position, text, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [documentId, collectionId, c.position, c.text, vecLiteral(vectors[i]),
         JSON.stringify(mergedMeta)],
      );
      inserted++;
    }
    await query(`UPDATE knowledge.collections SET last_indexed_at = now() WHERE source = 'specs_plans'`, []);

    // ---- completeness gate: per-slug coverage vs local active plans ----
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
    if (pool) await pool.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  let slug = '';
  let dryRun = false;
  let checkCoverage = false;
  let countSkipped = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--slug') slug = args[++i] ?? '';
    else if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--check-coverage') checkCoverage = true;
    else if (args[i] === '--count-skipped') countSkipped = true;
    else if (args[i] === '--help') {
      console.log([
        'Usage: node scripts/openspec-embed.mjs --slug <slug> [--dry-run]',
        '       node scripts/openspec-embed.mjs --check-coverage',
        '       node scripts/openspec-embed.mjs --count-skipped',
        '',
        '  --slug <slug>           Index one OpenSpec change into knowledge.chunks',
        '  --dry-run               Print what would be indexed, do not write',
        '  --check-coverage        Print count of local active plans',
        '  --count-skipped         Count documents skipped due to context limit',
        '                           (no DB writes — safe to run anytime)',
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
    || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

  if (countSkipped) {
    const CONTEXT_LIMIT = 2048; // proposal/task_section/spec_section chunks (post-Task-2: max ~450)
    const PARTIAL_TOKEN_LIMIT = 7000; // matches scripts/plan-lint.sh T002453-C partial size gate
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

  if (!slug) { console.error('[openspec-embed] --slug <slug> required'); process.exit(0); }
  try {
    await embedSlug({ slug, repoRoot, dryRun });
  } catch (err) {
    // [T003384] Portkonflikte nicht still schlucken: ECONNREFUSED/ECONNRESET
    // wird explizit als Verbindungs- bzw. Portproblem attribuiert. [T003988]
    // Connect-Timeout traegt keinen code — Klassifikator prueft daher die Message.
    if (isConnectFailure(err)) {
      if (/timeout/i.test(err?.message ?? '')) {
        console.error(`[openspec-embed] WARN: Connect-Timeout nach ${dbConnectTimeoutMs()} ms (${err.message}) — Port-Kollision vermutet (k3d-Portforward 15432 belegt), Portforward pruefen.`);
      } else {
        console.error(`[openspec-embed] WARN: Embed-Fehler wegen Verbindungsabbruch (${err.code}) — Portkonflikt/Portforward pruefen, nicht "embed failed" pauschal akzeptieren.`);
      }
    }
    console.error('[openspec-embed] best-effort failure (exit 0):', err?.message ?? err);
  }
  process.exit(0); // best-effort: never break the OpenSpec lifecycle
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
