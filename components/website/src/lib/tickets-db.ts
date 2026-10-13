// components/website/src/lib/tickets-db.ts
// Public-API-Fassade: re-exportiert die schema-relevanten Funktionen aus
// tickets-schema.ts, damit bestehende Aufrufer (tickets-embed.ts,
// tickets/admin.ts, systemtest/*, 7 .test.ts-Dateien) ihre Imports nicht
// anpassen müssen. Der frühere Body von initTicketsSchema/isFeatureEnabled
// lebt jetzt in tickets-schema.ts — siehe G-CQ07 (S2-Import-Zyklus #1).
import type { EmbeddingModel } from './embeddings.ts';

export {
  initTicketsSchema,
  isFeatureEnabled,
  MixedEmbeddingModelError,
} from './tickets-schema';

/** The embedding model this environment writes/queries with. T016562: immer
 *  bge-m3 (lokal, Voyage entfernt). Mirrors knowledge-db.ts. */
export function ticketEmbeddingModel(): EmbeddingModel {
  return 'bge-m3';
}
