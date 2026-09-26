---
title: K1-CI-Embeds merge-getrieben
ticket_id: T900449
domains: [brain, embeddings, ci]
status: active
---

# k1-ci-embeds — Implementation Plan

## File Structure

- `scripts/lib/scs-chunking.ts` (p1, Markdown-Support)
- `scripts/openspec-embed.mjs` (p1, Chunker-Umstellung + Quellen + Migration)
- p2/p-tests-Dateien folgen mit ihren Partials.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-embedcore.md | impl | scripts/lib/scs-chunking.ts, scripts/openspec-embed.mjs | |

## Verify (final, wächst mit den Partials)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
