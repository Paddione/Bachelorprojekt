#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
// eslint-disable-next-line import/extensions
import { makePool } from '../knowledge/lib-knowledge-pg.mjs';
import { validateJsonEntries, ingestJsonChunks } from '../../website/src/lib/ingest-json-core.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: ingest-json.mts <file.json> <slug> [--brand=mentolder|korczewski]');
    process.exit(2);
  }
  const [filePath, slug, ...rest] = args;
  const brand = rest.find((a) => a.startsWith('--brand='))?.split('=')[1] ?? null;

  console.log(`[ingest-json] reading ${filePath}…`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`[ingest-json] JSON parse error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const entries = validateJsonEntries(raw);
  console.log(`[ingest-json] ${entries.length} Einträge validiert`);

  const pool = makePool();
  try {
    const result = await ingestJsonChunks(
      pool,
      {
        entries,
        slug,
        brand,
        sourceUri: `file://${basename(filePath)}`,
      },
      (done, total) => {
        if (total > 0) process.stdout.write(`\r[ingest-json] ${done}/${total} Chunks embedded`);
      },
    );
    console.log(`\n[ingest-json] done. collectionId=${result.collectionId}, chunks=${result.chunkCount}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
