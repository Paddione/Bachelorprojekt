---
title: "K1 visualisieren: Vektorspeicher (pgvector in shared-db)"
ticket_id: T002431
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t2431-k1-vector-db — Implementation Plan

_Ticket: T002431_

<!-- vitest: kein neuer Test nötig, weil keine website/src-Dateien geändert werden, sie sind nur in der Beschreibung erwähnt -->

## File Structure

| File | Status | Budget |
| --- | --- | --- |
| `docs/diagrams/k1-vector-db.md` | new | - |
| `tests/spec/t2431-k1-vector-db/verify.bats` | new | - |

## Verify (RED → GREEN)

### Task 1: Add failing BATS test
Create a failing BATS test that verifies that the K1 vector database documentation exists and contains the expected components.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/t2431-k1-vector-db/verify.bats
# expected: FAIL
```

### Task 2: Create K1 vector database documentation and diagram
Create the documentation file `docs/diagrams/k1-vector-db.md` visualizing the K1 vector database component (pgvector in shared-db).
The document includes a Mermaid diagram of the components and lists of all tables (`code_embeddings`, `knowledge.chunks`), their models, dimensions, distance metrics, reader/writer scripts or APIs, and identifies any unused or dead interfaces.

- **`code_embeddings`**:
  - Model: `bge-m3`
  - Dimensions: 1024
  - Distance: Cosine Similarity (`vector_cosine_ops`)
  - Writer: `scripts/index-repo.ts` (SCS Indexer)
  - Reader: `website/src/lib/codesearch-db.ts` (Astro `/api/codesearch`)
- **`knowledge.chunks`**:
  - Model: `bge-m3` or `voyage-multilingual-2` (dependent on collection configuration)
  - Dimensions: 1024
  - Distance: Cosine Similarity (`vector_cosine_ops` HNSW)
  - Writers:
    - `scripts/openspec-embed.mjs`
    - `k3d/knowledge-ingest-cronjob.yaml`
    - `website/src/pages/api/admin/knowledge/import/json.ts`
    - `website/src/lib/knowledge-db.ts` (`upsertChunks`)
  - Readers:
    - `website/src/lib/knowledge-db.ts` (`searchOpenspec` / `queryNearest` / search logic)
    - `scripts/knowledge/search-similar.mjs`
- **Dead/Unused edges**:
  - `tracking-import` and any tracking pipeline (e.g. `track-pr.yml`, `build-tracking.yml`, `track-plans.yml`) have been removed; the timeline is historical only.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/t2431-k1-vector-db/verify.bats
# expected: PASS
```

### Task 3: Final verification
Run the three mandatory quality gates to verify clean repository status and ensure no lint rules are violated.

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
