#!/usr/bin/env node
/**
 * search-similar.mjs — Semantic similarity search against a knowledge collection.
 *
 * Config via environment variables:
 *   QUERY      — search query text (required)
 *   SOURCE     — collection source filter (default: "specs_plans")
 *   LIMIT      — max results (default: 5)
 *   THRESHOLD  — minimum score 0..1 (default: 0.65)
 *   VOYAGE_API_KEY — Voyage AI API key (absent → graceful error JSON, exit 0)
 *   PGURL      — postgres connection string
 *
 * CLI args (override env):
 *   --query <text>  --source <source>  --limit <n>  --threshold <f>
 *
 * Output (stdout): JSON  { results: [{title, score, snippet, source_uri}] }
 *             OR   JSON  { error: "<message>", results: [] }
 * Logs  (stderr):  diagnostic messages only
 */

import { makePool, callVoyage } from './lib-knowledge-pg.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      out[args[i].slice(2)] = args[++i];
    }
  }
  return out;
}

async function main() {
  const cliArgs = parseArgs();

  const query     = cliArgs.query     ?? process.env.QUERY;
  const source    = cliArgs.source    ?? process.env.SOURCE    ?? 'specs_plans';
  const limit     = Number(cliArgs.limit     ?? process.env.LIMIT     ?? 5);
  const threshold = Number(cliArgs.threshold ?? process.env.THRESHOLD ?? 0.65);

  if (!query) {
    process.stderr.write('ERROR: QUERY is required\n');
    process.exit(1);
  }

  if (!process.env.VOYAGE_API_KEY) {
    process.stdout.write(JSON.stringify({ error: 'VOYAGE_API_KEY not set', results: [] }) + '\n');
    process.exit(0);
  }

  const pool = makePool();
  try {
    process.stderr.write(`Embedding query: "${query}" (source=${source}, limit=${limit}, threshold=${threshold})\n`);
    const { embeddings } = await callVoyage([query], 'query');
    const embedding = embeddings[0];

    const vectorLiteral = '[' + embedding.join(',') + ']';

    const result = await pool.query(
      `SELECT d.title,
              left(kc.text, 300)                          AS snippet,
              d.source_uri,
              1 - (kc.embedding <=> $1::vector)           AS score
       FROM   knowledge.chunks kc
       JOIN   knowledge.documents    d  ON d.id = kc.document_id
       JOIN   knowledge.collections  c  ON c.id = kc.collection_id
       WHERE  c.source = $2
         AND  1 - (kc.embedding <=> $1::vector) >= $3
       ORDER  BY kc.embedding <=> $1::vector
       LIMIT  $4`,
      [vectorLiteral, source, threshold, limit],
    );

    const results = result.rows.map(r => ({
      title:      r.title,
      score:      Number(Number(r.score).toFixed(4)),
      snippet:    r.snippet,
      source_uri: r.source_uri,
    }));

    process.stdout.write(JSON.stringify({ results }) + '\n');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  process.stderr.write(`FATAL: ${err.message}\n`);
  process.stdout.write(JSON.stringify({ error: err.message, results: [] }) + '\n');
  process.exit(0);
});
