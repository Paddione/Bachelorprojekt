---
title: "openspec-embedding-T002334 — Implementation Plan"
ticket_id: T002334
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openspec-embedding-T002334 — Implementation Plan

_Ticket: T002334_

## File Structure

```
CHANGED:
  .githooks/post-commit            — add openspec-embed-local.sh call
  scripts/openspec-embed-local.sh  — ensure idempotency
```

## Tasks

### 1. Embedding in post-commit Hook

Füge in `.githooks/post-commit` einen Aufruf von `bash scripts/openspec-embed-local.sh` ein, der bei Plan-Commits auf Branches (`openspec/changes/`) das Embedding triggert.

```bash
tests/spec/openspec-embedding-T002334.bats
# expected: FAIL
```

### 2. Embedding idempotent machen

Stelle sicher, dass `openspec-embed-local.sh` bei mehrfachem Aufruf für denselben Slug keine Duplikate erzeugt (upsert statt insert).

### 3. CI-Gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
