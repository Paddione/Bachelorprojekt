// Ports facade — light content/ingest seam (tsx-safe: chunk/embed/JSON only).
// Re-export only, no behavior change. Only what P0 confirmed as prod call
// sites; no stock exports. NOTE: classifier/draft accessors live in
// ./coaching.ts — importing them here would drag the provider/website-db
// chain (Vite-only import.meta.glob) into the light ingest path.
export { chunkText } from '../chunking';
export { embedBatch } from '../embeddings';
export { validateJsonEntries, ingestJsonChunks } from '../ingest-json-core';
