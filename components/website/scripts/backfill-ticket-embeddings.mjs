#!/usr/bin/env node
// Usage (run once PER BRAND, pointing at that brand's shared-db):
//   SESSIONS_DATABASE_URL=postgresql://website:...@<host>:5432/website \
//   LLM_ENABLED=true LLM_EMBED_URL=... npx tsx website/scripts/backfill-ticket-embeddings.mjs
import { backfillTicketEmbeddings } from '../src/lib/tickets-embed.ts';

const res = await backfillTicketEmbeddings({
  batchSize: Number(process.env.BACKFILL_BATCH ?? 50),
  onProgress: (r) => process.stderr.write(`\r scanned=${r.scanned} embedded=${r.embedded} failed=${r.failed}`),
});
process.stderr.write('\n');
console.log(JSON.stringify(res));
process.exit(res.scanned > 0 && res.embedded === 0 ? 1 : 0);
