// Ports facade — coaching classifier/draft seam for classify-book.mts.
// Re-export only, no behavior change. Separate from ./content.ts because
// the classifier chain (provider-config -> website-db -> content-bundle
// with Vite-only import.meta.glob) is NOT loadable under plain tsx —
// bundling it into content.ts would break the light ingest path.
//
// NOTE (classifier constants): CLASSIFIER_VERSION / DEFAULT_MODEL are
// module-private in lib/sdlc/coaching-classifier.ts (NOT exported there),
// so they cannot be re-exported. The pins below replicate the source
// literals EXACTLY, including the COACHING_CLASSIFIER_MODEL env override
// (coaching-classifier.ts:5-6). If the source changes, update the pins
// together — see phase-events.log (call-site-migration).
export { classifyChunk } from '../sdlc/coaching-classifier';
export const CLASSIFIER_VERSION = 'v1-2026-05-10';
export const DEFAULT_MODEL =
  process.env.COACHING_CLASSIFIER_MODEL || 'claude-haiku-4-5-20251001';
export { insertDraft } from '../coaching-db';
