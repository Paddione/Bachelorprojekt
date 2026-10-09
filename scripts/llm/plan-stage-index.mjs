#!/usr/bin/env node
// plan-stage-index.mjs — Stage-time-Indexierung von Plan-Partials (T901542,
// plan-vector-routing): parst das tasks.md-Manifest (ids + files, gleiche
// Parser-Regeln wie plan-runner/plan.mjs via parseManifest-Import) und schreibt
// pro Partial genau einen Chunk als Doctype `plan_partial` in die bestehende
// K1-Collection `specs_plans` (gleiche Pipeline wie der Merge-Job
// k3d/k1-embed-job.yaml: ensureCollection + upsertDocumentAndChunks aus
// scripts/knowledge/lib-knowledge-pg.mjs).
//
// Kein paralleler Vektor-Store, keine neue Collection: nur ein Doctype im
// bestehenden Index. Ein Partial = ein Chunk, nie der Vollplan (SELECT-*-Footgun:
// Abfragen filtern per metadata.doctype + partial_id statt Volltext-Dumps).
// Die bestehende Merge-Pipeline (.github/workflows/k1-embed.yml, nur main-Push)
// bleibt unberuehrt: Staging indexiert pre-merge Branches, der Merge-Job
// dedupliziert per content-hash (sha256 des Partial-Texts).
//
// Fail-soft: Backend-Ausfall (DB/Embed-Gateway) warnt auf stderr und endet mit
// Exit 0 — Staging darf nie an fehlendem Embedding scheitern. stdout traegt
// immer Beleg-JSON { partials, collection, receipt } (receipt null bei Ausfall).
// Nur Aufrufer-Fehler (--plan-dir fehlt/ungueltig, kein tasks.md) enden != 0.
//
// Test-Seam: PLAN_STAGE_INDEX_MOCK=1 ersetzt das Backend (kein Netzwerk),
// PLAN_STAGE_INDEX_MOCK=fail simuliert einen Backend-Ausfall.
//
// Aufruf: node scripts/llm/plan-stage-index.mjs --plan-dir <dir-mit-tasks.md>

import { readFileSync, existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { parseManifest } from './plan-runner/plan.mjs';

export const COLLECTION_NAME = 'Specs & Plans';
export const COLLECTION_SOURCE = 'specs_plans';
export const DOCTYPE = 'plan_partial';

const warn = (msg) => process.stderr.write(`WARN: plan-stage-index: ${msg}\n`);

function usage(exitCode) {
  process.stderr.write('Usage: node scripts/llm/plan-stage-index.mjs --plan-dir <dir-mit-tasks.md>\n');
  process.exit(exitCode);
}

// Einfaches Frontmatter-Parsing (--- ... --- am Dateianfang, key: value).
function readFrontmatter(text) {
  const m = String(text).match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.*?)\s*$/);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function receiptJson({ partials, receipt, warning }) {
  const doc = { partials, collection: COLLECTION_SOURCE, receipt };
  if (warning) doc.warning = warning;
  process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
}

// Fail-soft-Abschluss: Warnung auf stderr, Beleg mit receipt null, Exit 0.
function softFail(partials, msg) {
  warn(msg);
  receiptJson({ partials, receipt: null, warning: msg });
  return 0;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) usage(0);
  let planDir = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--plan-dir') planDir = argv[++i] ?? null;
    else { process.stderr.write(`FEHLER: unbekanntes Argument "${argv[i]}"\n`); usage(2); }
  }
  if (!planDir) { process.stderr.write('FEHLER: --plan-dir fehlt\n'); usage(2); }
  planDir = resolve(planDir);
  const tasksMd = join(planDir, 'tasks.md');
  if (!existsSync(tasksMd)) { process.stderr.write(`FEHLER: kein tasks.md in ${planDir}\n`); process.exit(2); }

  const mock = process.env.PLAN_STAGE_INDEX_MOCK ?? '';
  const tasksText = readFileSync(tasksMd, 'utf8');
  let partials;
  try {
    partials = parseManifest(tasksText);
  } catch (e) {
    return softFail([], `manifest parse failed (${e.message})`);
  }
  const fm = readFrontmatter(tasksText);
  const ticketId = fm.ticket_id ?? null;
  const planSlug = basename(planDir);
  const ids = partials.map((p) => p.id);

  if (mock === 'fail') return softFail(ids, 'simulated backend failure (PLAN_STAGE_INDEX_MOCK=fail)');

  // Partial-Texte laden; fehlende Dateien sind fail-soft (Staging laeuft weiter).
  const texts = {};
  try {
    for (const p of partials) {
      const f = join(planDir, p.file);
      if (!existsSync(f)) throw new Error(`partial ${p.id}: plan file ${p.file} not found`);
      texts[p.id] = readFileSync(f, 'utf8');
    }
  } catch (e) {
    return softFail(ids, e.message);
  }

  if (mock === '1' || mock.toLowerCase() === 'mock') {
    const receipt = {
      mocked: true, doctype: DOCTYPE, chunks: partials.length,
      docs: ids.map((id) => ({ partial: id, docId: `mock:${planSlug}/${id}` })),
    };
    receiptJson({ partials: ids, receipt });
    process.stderr.write(`plan-stage-index: indexed ${partials.length} partials (mocked) into ${COLLECTION_SOURCE}/${DOCTYPE}\n`);
    return 0;
  }

  // Real path — gleiche Bausteine wie der Merge-Job (lib-knowledge-pg).
  // Dynamischer Import, damit ein fehlendes Backend fail-soft bleibt statt zu crashen.
  let pg;
  try {
    pg = await import('../knowledge/lib-knowledge-pg.mjs');
  } catch (e) {
    return softFail(ids, `knowledge backend unavailable (${e.message})`);
  }
  const pool = pg.makePool();
  try {
    const collectionId = await pg.ensureCollection(pool, {
      name: COLLECTION_NAME, source: COLLECTION_SOURCE,
      description: 'Specs, plans, ADRs, runbooks, brain notes, and CLAUDE.md from the repository',
    });
    const docs = [];
    for (const p of partials) {
      const text = texts[p.id];
      const hash = pg.sha256(text);
      const [embedding] = await pg.embedAll([text]);
      const { docId } = await pg.upsertDocumentAndChunks(pool, {
        collectionId,
        title: `${planSlug}/${p.id}`,
        sourceUri: `plan:${planSlug}/${p.id}`,
        rawText: text,
        hash,
        metadata: {
          doctype: DOCTYPE, ticket_id: ticketId, plan_slug: planSlug,
          partial_id: p.id, depends_on: p.dependsOn,
        },
        // Genau ein Chunk pro Partial — nie der Vollplan.
        chunks: [{ position: 0, text, embedding }],
      });
      docs.push({ partial: p.id, docId, hash });
    }
    await pg.bumpCollectionStats(pool, collectionId);
    receiptJson({ partials: ids, receipt: { backend: 'k1', doctype: DOCTYPE, chunks: docs.length, docs } });
    process.stderr.write(`plan-stage-index: indexed ${docs.length} partials into ${COLLECTION_SOURCE}/${DOCTYPE}\n`);
    return 0;
  } catch (e) {
    return softFail(ids, `indexing failed (${e.message})`);
  } finally {
    try { await pool.end(); } catch { /* bereits zu */ }
  }
}

const code = await main().catch((e) => softFail([], `unexpected error (${e.message})`));
process.exit(code ?? 0);
