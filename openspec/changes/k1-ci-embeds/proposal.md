## Why

K1 recall is stale by construction: SSOT specs (`openspec/specs/*.md`) are never
embedded, local hooks are inactive and cannot see GitHub merges anyway, and the
graph/embed refresh has no trigger. Merge-fresh recall needs a merge-driven
pipeline — and one chunker instead of two diverged ones.

## What Changes

- New CI workflow triggers an in-cluster embed job on every merge to main
  (paths-filtered) plus manual full runs via `workflow_dispatch`.
- `openspec-embed.mjs` learns `openspec/specs/*.md` and docs globs, writing to
  `knowledge.*` under new sources (`specs_ssot`, `docs`); code path unchanged.
- Chunking consolidates on `scripts/lib/scs-chunking.ts` (new markdown
  support); the prose chunker migrates to it and the changes-corpus is
  re-embedded (batched, resumable).
- Single-writer doctrine (`ACTIVE_STATUSES`, one code path) and completeness
  gate semantics stay intact.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `openspec/specs/openspec-embedding.md`: merge-triggered embeds, SSOT/docs
  sources, unified chunking (replaces the 400/50 split algorithm).

## Impact

- New: CI workflow + k3d Job manifests. Touched: `scripts/openspec-embed.mjs`,
  `scripts/lib/scs-chunking.ts`, maybe `scripts/index-repo.ts` (diff input).
- `knowledge.*` grows by two sources; existing readers unaffected (source-keyed).
- No brand runtime change; no Voyage; no CI-local model.
