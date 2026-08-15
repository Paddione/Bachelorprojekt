// website/src/lib/knowledge-db-types.ts
// Type-only re-exports from knowledge-db.ts. The runtime module pulls in `pg`
// + `dns` (server-only Node built-ins); a Svelte/Astro file that only needs
// the *types* must import them from here to keep the Vite client-side
// resolver from walking knowledge-db.ts and emitting "externalized for
// browser" warnings (and worse, from accidentally bundling server code into
// the client if a future refactor swaps `import type` for a runtime import).
//
// Runtime classes/functions (MixedEmbeddingModelError, listCollections, …)
// stay in knowledge-db.ts — this file intentionally has zero runtime code.

export type CollectionSource = 'pr_history' | 'specs_plans' | 'claude_md' | 'bug_tickets' | 'custom' | 'web_crawl' | 'context7_docs';

export interface CrawlConfig {
  startUrl: string;
  maxDepth?: number;
  maxPages?: number;
  includePattern?: string;
  userAgent?: string;
}

export interface Context7Config {
  libraryId: string;
  tokens?: number;
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  source: CollectionSource;
  brand: string | null;
  chunk_count: number;
  last_indexed_at: Date | null;
  embedding_model: string;
  created_at: Date;
  crawl_config: CrawlConfig | null;
}
