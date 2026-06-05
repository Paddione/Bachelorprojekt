#!/usr/bin/env node
// Usage: SESSIONS_DATABASE_URL=... npx tsx website/scripts/find-similar-tickets.mjs "<query text>" [k]
// Prints a JSON array of similar tickets to stdout. Fail-soft: prints [] on no embeddings.
import { findSimilarTickets } from '../src/lib/tickets-embed.ts';

const query = process.argv[2];
const k = Number(process.argv[3] ?? 5);
if (!query) { console.error('usage: find-similar-tickets <query> [k]'); process.exit(2); }

try {
  const rows = await findSimilarTickets(query, k);
  process.stdout.write(JSON.stringify(rows));
  process.exit(0);
} catch (err) {
  // Fail-closed across vector spaces or LLM down: Scout treats stderr+exit1 as "no similar tickets".
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
