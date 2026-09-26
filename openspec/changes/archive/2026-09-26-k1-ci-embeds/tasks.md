---
title: K1-CI-Embeds merge-getrieben
ticket_id: T900449
domains: [brain, embeddings, ci]
status: completed
---

# k1-ci-embeds — Implementation Plan

## File Structure

- `scripts/lib/scs-chunking.ts` (p1, Markdown-Support)
- `scripts/openspec-embed.mjs` (p1, Chunker-Umstellung + Quellen + Migration)
- `.github/workflows/k1-embed.yml` (p2, neu)
- `k3d/k1-embed-job.yaml` (p2, neu)
- `tests/spec/plan-partials-embedding/build-chunks.bats` (p-tests, erweitern)
- `tests/spec/plan-partials-embedding/coverage-gate.bats` (p-tests, erweitern)
- `tests/spec/plan-partials-embedding/k1-embeds.bats` (p-tests, neu)

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-embedcore.md | impl | scripts/lib/scs-chunking.ts, scripts/openspec-embed.mjs | |
| p2 | tasks.d/p2-clusterjob.md | impl | .github/workflows/k1-embed.yml, k3d/k1-embed-job.yaml | |
| p-tests | tasks.d/p-tests.md | tests | tests/spec/plan-partials-embedding/build-chunks.bats, tests/spec/plan-partials-embedding/coverage-gate.bats, tests/spec/plan-partials-embedding/k1-embeds.bats | p1,p2 |

## Verify (final, wächst mit den Partials)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
