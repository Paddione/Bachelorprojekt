// website/src/lib/tickets-db.ts
// Public-API-Fassade: re-exportiert die schema-relevanten Funktionen aus
// tickets-schema.ts, damit bestehende Aufrufer (tickets-embed.ts,
// tickets/admin.ts, systemtest/*, 7 .test.ts-Dateien) ihre Imports nicht
// anpassen müssen. Der frühere Body von initTicketsSchema/isFeatureEnabled
// lebt jetzt in tickets-schema.ts — siehe G-CQ07 (S2-Import-Zyklus #1).
import type { EmbeddingModel } from './embeddings';

export {
  initTicketsSchema,
  isFeatureEnabled,
  MixedEmbeddingModelError,
} from './tickets-schema';

/** The embedding model this environment writes/queries with. bge-m3 in prod
 *  (LLM_ENABLED=true), voyage-multilingual-2 in dev. Mirrors knowledge-db.ts. */
export function ticketEmbeddingModel(): EmbeddingModel {
  return process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2';
}
